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
/** Paths that hold Ducter's or the user's secrets: a check never reads them. */
const SECRET_PATH = /keys\.env|connection-tokens|mcp\.secret|devices\.json|apns\.json|\.ssh\/|\.aws\/|\.netrc|\.config\/gh\/hosts|\.gnupg/i;

const has = (argv: string[], ...flags: string[]) => argv.some((a) => flags.some((f) => a === f || a.startsWith(f + "=") || (f.length === 2 && a.startsWith(f) && !a.startsWith("--"))));

/** Whether a check may run, and why not. */
export function validateCheck(spec: CheckSpec | undefined): { ok: true } | { ok: false; error: string } {
  if (!spec || !Array.isArray(spec.argv) || !spec.argv.length || spec.argv.some((a) => typeof a !== "string"))
    return { ok: false, error: "check.argv must be a non-empty list of strings (one command, no shell)" };
  if (!spec.succeedWhen || typeof spec.succeedWhen !== "object") return { ok: false, error: "check.succeedWhen is required" };
  if (spec.succeedWhen.matches) {
    try {
      new RegExp(spec.succeedWhen.matches);
    } catch {
      return { ok: false, error: `succeedWhen.matches is not a valid pattern: ${spec.succeedWhen.matches}` };
    }
  }
  const [cmd0, ...rest] = spec.argv;
  const cmd = cmd0!.split("/").pop()!;
  if (spec.argv.some((a) => SECRET_PATH.test(a))) return { ok: false, error: "a check never reads key or credential files" };
  if (spec.argv.some((a) => /[|;&`$<>]/.test(a) && cmd !== "grep" && cmd !== "gh" && cmd !== "curl"))
    return { ok: false, error: "a check is one command: no pipes, redirection or shell expansion (use succeedWhen.path instead of jq)" };
  if (cmd === "gh") {
    const ok = GH_READ.some((p) => p.every((w, i) => rest[i] === w));
    if (!ok) return { ok: false, error: `gh ${rest.slice(0, 2).join(" ")} is not a reading command (allowed: ${GH_READ.map((p) => p.join(" ")).join(", ")})` };
    if (rest[0] === "api") {
      const i = rest.findIndex((a) => a === "-X" || a === "--method");
      const m = i >= 0 ? rest[i + 1] : rest.find((a) => a.startsWith("--method="))?.slice(9);
      if (m && m.toUpperCase() !== "GET") return { ok: false, error: "gh api checks only GET" };
      if (has(rest, "-f", "-F", "--field", "--raw-field", "--input")) return { ok: false, error: "gh api with fields would send a request body; checks only read" };
    }
    return { ok: true };
  }
  if (cmd === "curl") {
    const i = rest.findIndex((a) => a === "-X" || a === "--request");
    const m = i >= 0 ? rest[i + 1] : undefined;
    if (m && !["GET", "HEAD"].includes(m.toUpperCase())) return { ok: false, error: "curl checks only GET or HEAD" };
    if (has(rest, "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "-F", "--form", "-T", "--upload-file", "-o", "--output", "-O", "--remote-name", "-K", "--config", "-c", "--cookie-jar", "-u", "--user"))
      return { ok: false, error: "curl in a check may only fetch (no body, upload, output file, config or credentials)" };
    return { ok: true };
  }
  if (cmd === "git") {
    if (!GIT_READ.has(rest[0] ?? "")) return { ok: false, error: `git ${rest[0] ?? ""} is not a reading command (allowed: ${[...GIT_READ].join(", ")})` };
    return { ok: true };
  }
  if (cmd === "nc") return has(rest, "-z") ? { ok: true } : { ok: false, error: "nc only as a port check (-z)" };
  if (cmd === "ping") return has(rest, "-c") ? { ok: true } : { ok: false, error: "ping needs -c (a count)" };
  if (PLAIN.has(cmd)) return { ok: true };
  return { ok: false, error: `${cmd} is not a command a check may run (gh, curl, git, test, stat, ls, cat, head, tail, wc, grep, nc -z, ping -c, dig, host, date, pgrep)` };
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
