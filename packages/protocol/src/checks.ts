// Checks (D112): a condition compiled into a small read-only command and a predicate over its
// output. Pure: validation, evaluation, description. Running one is in checks-run.ts (core and
// the worker host only).
//
// A check is an argv, never a shell line: no pipes, no redirection, no expansion. Anything a pipe
// would do (jq) is the predicate's `path`. Only commands that read are allowed, and for the few
// that can also write (gh, curl, git) only their reading forms.
import type { CheckSpec, Predicate } from "./index.ts";

export const CHECK_TIMEOUT_MS = 20_000;
export const CHECK_MAX_OUTPUT = 64 * 1024;
/** The floor on how often a check runs (research/20: 60 s); tests pass their own. */
export const MIN_EVERY_MS = 60_000;
export const DEFAULT_EVERY_MS = 5 * 60_000;
/** On errors a check backs off by doubling, up to this. */
export const MAX_BACKOFF_MS = 30 * 60_000;

const GH_READ: string[][] = [
  ["pr", "view"], ["pr", "checks"], ["pr", "list"], ["pr", "status"], ["pr", "diff"],
  ["run", "view"], ["run", "list"], ["issue", "view"], ["issue", "list"],
  ["release", "view"], ["release", "list"], ["repo", "view"], ["workflow", "list"], ["api"],
];
const GIT_READ = new Set(["ls-remote", "log", "status", "rev-parse", "describe"]);
const PLAIN = new Set(["test", "[", "stat", "ls", "cat", "head", "tail", "wc", "grep", "dig", "host", "date", "pgrep"]);
/**
 * Paths that hold Ducter's or the user's secrets: a check never names them. Ducter's data folder
 * (keys, connection tokens, the MCP secret, device and push keys, its databases; only task
 * worktrees are open), harness logins (Claude Code, Codex), oo's config folder on every OS,
 * SSH/AWS/gh/GnuPG/netrc/docker/kube credentials, and .env files.
 */
const SECRET_PATH = new RegExp(
  [
    String.raw`keys\.env`, String.raw`connection-tokens`, String.raw`mcp\.secret`, String.raw`devices\.(json|db)`, String.raw`apns\.json`,
    String.raw`push\.json`, String.raw`ducter\.db`, String.raw`(^|[\\/])auth[\w.-]*\.(db|json|sqlite)`,
    String.raw`\.claude[\\/]\.credentials`, String.raw`\.claude\.json`, String.raw`\.codex[\\/]auth\.json`,
    String.raw`(Application Support|\.config|AppData[\\/]Roaming)[\\/]oo([\\/]|$)`,
    String.raw`\.ssh([\\/]|$)`, String.raw`\.aws([\\/]|$)`, String.raw`\.netrc`, String.raw`\.config[\\/]gh([\\/]|$)`, String.raw`\.gnupg`,
    String.raw`(^|[\\/])\.env(\.[\w.-]*)?$`, String.raw`\.git-credentials`, String.raw`\.npmrc`, String.raw`\.docker[\\/]config\.json`,
    String.raw`\.kube[\\/]config`, String.raw`(^|[\\/])\.ducter([\\/](?!worktrees([\\/]|$))|$)`,
  ].join("|"),
  "i",
);

/** Where a check runs, for resolving its paths: home, Ducter's data folder, the cwd. runCheck passes it. */
export interface CheckContext {
  home?: string;
  dataDir?: string;
  cwd?: string;
}

const norm = (p: string): string => {
  const out: string[] = [];
  for (const s of p.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return "/" + out.join("/");
};
/** A path argument made absolute (~ and cwd-relative), for the secret and recursion rules. */
const absolute = (p: string, ctx: CheckContext): string => {
  if (ctx.home && (p === "~" || p.startsWith("~/"))) return norm(ctx.home + p.slice(1));
  if (p.startsWith("/")) return norm(p);
  return norm(`${ctx.cwd ?? ctx.home ?? ""}/${p}`);
};
const within = (p: string, root: string) => p === root || p.startsWith(root.endsWith("/") ? root : root + "/");
const inData = (p: string, ctx: CheckContext) => !!ctx.dataDir && within(p, norm(ctx.dataDir)) && !within(p, norm(ctx.dataDir) + "/worktrees");

interface Opt {
  name: string;
  value?: string;
}
/**
 * Options parsed the way the tool parses them: `-XPOST`, `-X POST`, `-X=POST`, `-sXPOST`,
 * `--request=POST`, `--request POST`. `takesValue` names the options that eat a value; an option
 * it does not know is a flag, so a value can never hide the option after it.
 */
function parseOpts(args: string[], takesValue: (name: string) => boolean): { opts: Opt[]; operands: string[] } {
  const opts: Opt[] = [];
  const operands: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq >= 0 ? a.slice(0, eq) : a;
      if (eq >= 0) opts.push({ name, value: a.slice(eq + 1) });
      else if (takesValue(name)) opts.push({ name, value: args[++i] ?? "" });
      else opts.push({ name });
    } else if (a.startsWith("-") && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const name = "-" + a[j];
        if (takesValue(name)) {
          let v = a.slice(j + 1);
          if (v.startsWith("=")) v = v.slice(1);
          opts.push({ name, value: v || (args[++i] ?? "") });
          break;
        }
        opts.push({ name });
      }
    } else operands.push(a);
  }
  return { opts, operands };
}

// curl is an allowlist: an option nobody thought of (a file it writes, a file it sends) is refused.
const CURL_FLAG = new Set(["-s", "--silent", "-S", "--show-error", "-L", "--location", "-I", "--head", "-i", "--include", "-f", "--fail", "--fail-with-body",
  "-G", "--get", "--compressed", "-k", "--insecure", "-v", "--verbose", "-4", "-6", "--http1.1", "--http2", "-N", "--no-buffer", "-g", "--globoff", "--no-progress-meter"]);
const CURL_VALUE = new Set(["-X", "--request", "-H", "--header", "-A", "--user-agent", "-m", "--max-time", "--connect-timeout", "--retry", "--max-redirs",
  "-w", "--write-out", "-e", "--referer", "-r", "--range", "--url", "-o", "--output"]);
// gh api's options that take a value (cobra rejects any other); a body or a method is in these.
const GH_API_VALUE = new Set(["-X", "--method", "-f", "--raw-field", "-F", "--field", "-H", "--header", "-p", "--preview", "-q", "--jq", "-t", "--template", "--input", "--cache", "--hostname"]);
const GIT_WRITES = /^--(output|upload-pack|receive-pack|exec|ext-diff|textconv)(=|$)|^-o$|^-u$|^ext::/;
const GREP_VALUE = new Set(["-e", "--regexp", "-f", "--file", "-m", "--max-count", "-A", "-B", "-C", "-d", "--directories", "-D", "--devices", "--include", "--exclude", "--exclude-dir", "--color", "--colour", "--label"]);

type Verdict = { ok: true } | { ok: false; error: string };
const no = (error: string): Verdict => ({ ok: false, error });
const OK: Verdict = { ok: true };

function checkCurl(rest: string[]): Verdict {
  const { opts, operands } = parseOpts(rest, (n) => CURL_VALUE.has(n));
  for (const o of opts) {
    if (o.name === "-X" || o.name === "--request") {
      if (!["GET", "HEAD"].includes((o.value ?? "").toUpperCase())) return no("curl checks only GET or HEAD");
    } else if (o.name === "-o" || o.name === "--output") {
      if (o.value !== "/dev/null") return no("curl in a check never writes a file (-o only to /dev/null)");
    } else if (o.name === "-H" || o.name === "--header") {
      if (o.value?.startsWith("@")) return no("curl in a check never reads a header file");
    } else if (o.name === "-w" || o.name === "--write-out") {
      if (o.value?.startsWith("@") || /%output\{/.test(o.value ?? "")) return no("curl's write-out in a check only prints");
    } else if (!CURL_FLAG.has(o.name) && !CURL_VALUE.has(o.name))
      return no(`curl ${o.name} is not allowed in a check: it may only fetch (no body, upload, output file, config or credentials)`);
  }
  const urls = [...operands, ...opts.filter((o) => o.name === "--url").map((o) => o.value ?? "")];
  if (!urls.length) return no("curl needs a URL");
  if (urls.some((u) => !/^https?:\/\//i.test(u))) return no("curl in a check fetches http:// or https:// URLs only");
  return OK;
}

function checkGh(rest: string[]): Verdict {
  if (!GH_READ.some((p) => p.every((w, i) => rest[i] === w)))
    return no(`gh ${rest.slice(0, 2).join(" ")} is not a reading command (allowed: ${GH_READ.map((p) => p.join(" ")).join(", ")})`);
  if (rest[0] !== "api") return OK;
  for (const o of parseOpts(rest.slice(1), (n) => GH_API_VALUE.has(n)).opts) {
    if ((o.name === "-X" || o.name === "--method") && (o.value ?? "").toUpperCase() !== "GET") return no("gh api checks only GET");
    if (["-f", "-F", "--field", "--raw-field", "--input"].includes(o.name)) return no("gh api with fields would send a request body; checks only read");
  }
  return OK;
}

function checkGit(rest: string[]): Verdict {
  if (!GIT_READ.has(rest[0] ?? "")) return no(`git ${rest[0] ?? ""} is not a reading command (allowed: ${[...GIT_READ].join(", ")})`);
  if (rest.some((a) => GIT_WRITES.test(a))) return no("git in a check never writes a file or runs a helper (--output, --upload-pack, ext::)");
  return OK;
}

/** grep -r reads a whole tree: never the filesystem root, home or a folder above it, or Ducter's data folder. */
function checkGrep(rest: string[], ctx: CheckContext): Verdict {
  const { opts, operands } = parseOpts(rest, (n) => GREP_VALUE.has(n));
  const recursive = opts.some((o) => ["-r", "-R", "--recursive", "--dereference-recursive"].includes(o.name) || ((o.name === "-d" || o.name === "--directories") && o.value === "recurse"));
  if (!recursive) return OK;
  const patternGiven = opts.some((o) => ["-e", "--regexp", "-f", "--file"].includes(o.name));
  const targets = patternGiven ? operands : operands.slice(1);
  for (const t of targets.length ? targets : ["."]) {
    const p = absolute(t, ctx);
    if (p === "/" || (ctx.home && within(norm(ctx.home), p)) || inData(p, ctx) || (ctx.dataDir && within(norm(ctx.dataDir), p)) || SECRET_PATH.test(p))
      return no("a recursive grep in a check stays inside the task's place: never home, a folder above it, or Ducter's data folder");
  }
  return OK;
}

/** Whether a check may run, and why not. `ctx` resolves its paths where it runs (runCheck passes it). */
export function validateCheck(spec: CheckSpec | undefined, ctx: CheckContext = {}): Verdict {
  if (!spec || !Array.isArray(spec.argv) || !spec.argv.length || spec.argv.some((a) => typeof a !== "string"))
    return no("check.argv must be a non-empty list of strings (one command, no shell)");
  if (!spec.succeedWhen || typeof spec.succeedWhen !== "object") return no("check.succeedWhen is required");
  if (spec.succeedWhen.matches) {
    try {
      new RegExp(spec.succeedWhen.matches);
    } catch {
      return no(`succeedWhen.matches is not a valid pattern: ${spec.succeedWhen.matches}`);
    }
  }
  if (spec.cwd !== undefined && typeof spec.cwd !== "string") return no("check.cwd must be a path");
  const [cmd, ...rest] = spec.argv as [string, ...string[]];
  // A bare name, looked up on PATH where it runs: never ./gh or /tmp/x/gh passing as gh.
  if (/[\\/]/.test(cmd)) return no(`a check names its command bare (gh, not ${cmd}); it is looked up on PATH`);
  const c: CheckContext = { ...ctx, cwd: spec.cwd ? absolute(spec.cwd, ctx) : ctx.cwd };
  if (c.cwd && (SECRET_PATH.test(c.cwd) || inData(c.cwd, c))) return no("a check never runs in Ducter's data folder or a folder of keys");
  // Every word that could be a path, as written and as it resolves from the cwd.
  const pathy = rest.filter((a) => !a.startsWith("-") && !/^[a-z][\w+.-]*:\/\//i.test(a));
  if (spec.argv.some((a) => SECRET_PATH.test(a)) || pathy.some((a) => SECRET_PATH.test(absolute(a, c)))) return no("a check never reads key or credential files");
  if (pathy.some((a) => inData(absolute(a, c), c))) return no("a check never reads Ducter's data folder");
  if (spec.argv.some((a) => /[|;&`$<>]/.test(a) && cmd !== "grep" && cmd !== "gh" && cmd !== "curl"))
    return no("a check is one command: no pipes, redirection or shell expansion (use succeedWhen.path instead of jq)");
  if (cmd === "gh") return checkGh(rest);
  if (cmd === "curl") return checkCurl(rest);
  if (cmd === "git") return checkGit(rest);
  if (cmd === "grep") return checkGrep(rest, c);
  if (cmd === "nc") return parseOpts(rest, () => false).opts.some((o) => o.name === "-z") ? OK : no("nc only as a port check (-z)");
  if (cmd === "ping") return parseOpts(rest, (n) => n === "-c").opts.some((o) => o.name === "-c") ? OK : no("ping needs -c (a count)");
  if (PLAIN.has(cmd)) return OK;
  return no(`${cmd} is not a command a check may run (gh, curl, git, test, stat, ls, cat, head, tail, wc, grep, nc -z, ping -c, dig, host, date, pgrep)`);
}

/** The check as one line, for Details ("gh pr checks 1592 --json state"). */
export function describeCheck(spec: CheckSpec): string {
  return spec.argv.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replaceAll("'", "'\\''")}'`)).join(" ");
}

/** What counts as met, as a short line. */
export function describePredicate(p: Predicate): string {
  const want =
    p.equals !== undefined ? `= ${JSON.stringify(p.equals)}`
    : p.oneOf ? `in ${JSON.stringify(p.oneOf)}`
    : p.contains !== undefined ? `contains ${JSON.stringify(p.contains)}`
    : p.matches ? `matches /${p.matches}/`
    : "";
  const parts = [];
  if (p.path) parts.push(`${p.path.includes("[]") ? (p.any ? "any " : "every ") : ""}${p.path} ${want}`.trim());
  else if (want) parts.push(`output ${want}`);
  if (p.exitCode !== undefined || (!p.path && !want)) parts.push(`exit ${p.exitCode ?? 0}`);
  return parts.join(", ");
}

/** Values at a JSON path: "a.b", "a[].b", "[].state", "a.0.b". */
export function jsonAt(root: unknown, path: string): { values: unknown[]; mapped: boolean } {
  const parts = path.replace(/\[\]/g, ".[]").split(".").filter(Boolean);
  let cur: unknown[] = [root];
  let mapped = false;
  for (const p of parts) {
    const next: unknown[] = [];
    for (const v of cur) {
      if (p === "[]") {
        mapped = true;
        if (Array.isArray(v)) next.push(...v);
      } else if (v && typeof v === "object") {
        const x = (v as Record<string, unknown>)[p];
        if (x !== undefined) next.push(x);
      }
    }
    cur = next;
  }
  return { values: cur, mapped };
}

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const clip = (s: string, n = 200) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

/** Whether one look met the condition, and what it saw in one short line. */
export function evaluate(p: Predicate, exitCode: number, stdout: string): { met: boolean; summary: string } {
  const test = (v: unknown): boolean => {
    if (p.equals !== undefined) return v === p.equals || show(v) === show(p.equals);
    if (p.oneOf) return p.oneOf.some((o) => v === o || show(v) === show(o));
    const s = show(v);
    if (p.contains !== undefined) return s.includes(p.contains);
    if (p.matches) return new RegExp(p.matches).test(s);
    return Boolean(v);
  };
  const exitOk = p.exitCode !== undefined ? exitCode === p.exitCode : true;
  if (p.path) {
    let root: unknown;
    try {
      root = JSON.parse(stdout);
    } catch {
      return { met: false, summary: clip(`not JSON (exit ${exitCode}): ${stdout.trim().split("\n")[0] ?? ""}`) };
    }
    const { values, mapped } = jsonAt(root, p.path);
    if (!values.length) return { met: false, summary: `${p.path}: nothing there` };
    if (mapped || values.length > 1) {
      const ok = values.filter(test).length;
      const counts = new Map<string, number>();
      for (const v of values) counts.set(show(v), (counts.get(show(v)) ?? 0) + 1);
      const seen = [...counts].map(([k, n]) => `${n} ${k}`).join(", ");
      const met = exitOk && (p.any ? ok > 0 : ok === values.length);
      return { met, summary: clip(`${ok} of ${values.length} match · ${seen}`) };
    }
    return { met: exitOk && test(values[0]), summary: clip(`${p.path}: ${show(values[0])}`) };
  }
  const hasValueTest = p.equals !== undefined || p.oneOf || p.contains !== undefined || p.matches;
  if (!hasValueTest) {
    const want = p.exitCode ?? 0;
    return { met: exitCode === want, summary: clip(`exit ${exitCode}${stdout.trim() ? ` · ${stdout.trim().split("\n")[0]}` : ""}`) };
  }
  return { met: exitOk && test(stdout.trim()), summary: clip(stdout.trim().split("\n").slice(0, 2).join(" ") || `exit ${exitCode}`) };
}
