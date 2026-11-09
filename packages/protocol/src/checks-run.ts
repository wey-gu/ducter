// Running one check (D112), on the device Ducter lives on or on a worker (worker-host "check").
// The child gets a small allowlisted environment (D102: no key enters it wholesale): the basics,
// proxies and CA bundles, and nothing secret-shaped. gh and git read their own config files.
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { CHECK_MAX_OUTPUT, CHECK_TIMEOUT_MS, type CheckContext, evaluate, validateCheck } from "./checks.ts";
import type { CheckSpec } from "./index.ts";
import { isSecretName } from "./keys.ts";

export interface CheckResult {
  ok: boolean; // it ran (a non-zero exit still counts as ran)
  met: boolean;
  failed?: boolean; // D144: failWhen held: it can no longer come true
  summary: string; // what it saw, <= 200 chars
  error?: string; // it could not run: refused, not found, timed out
  exitCode?: number;
  output?: string; // the first 4 KB of what it printed, for a judge (never logged)
}

/** The seam tests replace: run argv in cwd, return exit code and stdout. */
export type Exec = (argv: string[], opts: { cwd?: string; env: Record<string, string>; timeoutMs: number }) => Promise<{ exitCode: number; stdout: string }>;

const KEEP = new Set(["PATH", "HOME", "USER", "LOGNAME", "LANG", "TZ", "TMPDIR", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "CURL_CA_BUNDLE",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy", "XDG_CONFIG_HOME", "GH_HOST", "GH_CONFIG_DIR"]);

export function checkEnv(inherited: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(inherited)) if (v !== undefined && (KEEP.has(k) || k.startsWith("LC_")) && !isSecretName(k)) env[k] = v;
  env.GH_PROMPT_DISABLED = "1";
  env.NO_COLOR = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

/** A bare command found on PATH's absolute entries only: never the cwd, never a relative entry. */
export function resolveOnPath(cmd: string, path: string | undefined): string | null {
  if (/[\\/]/.test(cmd)) return null;
  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = (path ?? "").split(sep).filter((d) => d && isAbsolute(d));
  return dirs.length ? Bun.which(cmd, { PATH: dirs.join(sep) }) : null;
}

export const realExec: Exec = async (argv, { cwd, env, timeoutMs }) => {
  const bin = resolveOnPath(argv[0]!, env.PATH);
  if (!bin) throw new Error(`${argv[0]} not found`);
  const p = Bun.spawn([bin, ...argv.slice(1)], { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => p.kill(), timeoutMs);
  try {
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    const exitCode = await p.exited;
    if (p.signalCode) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s`);
    // A failing command's reason is on stderr; the predicate reads stdout.
    return { exitCode, stdout: (out || (exitCode !== 0 ? err : "")).slice(0, CHECK_MAX_OUTPUT) };
  } finally {
    clearTimeout(timer);
  }
};

/** Where checks run on this device: home and Ducter's data folder, for the path rules. */
export function checkContext(env: Record<string, string | undefined> = process.env): CheckContext {
  const home = homedir();
  return { home, dataDir: env.DUCTER_DATA_DIR || join(home, ".ducter") };
}

const tilde = (a: string, home: string) => (a === "~" ? home : a.startsWith("~/") ? home + a.slice(1) : a);

export async function runCheck(spec: CheckSpec, opts: { cwd?: string; exec?: Exec; timeoutMs?: number; ctx?: CheckContext } = {}): Promise<CheckResult> {
  const ctx: CheckContext = { ...(opts.ctx ?? checkContext()), cwd: opts.cwd };
  const v = validateCheck(spec, ctx);
  if (!v.ok) return { ok: false, met: false, summary: v.error, error: v.error };
  // No shell, so nothing expands ~: do it here, as the partner wrote it (test -f ~/out/x.pdf).
  const home = ctx.home ?? homedir();
  const argv = spec.argv.map((a, i) => (i === 0 ? a : tilde(a, home)));
  try {
    const r = await (opts.exec ?? realExec)(argv, { cwd: spec.cwd ? tilde(spec.cwd, home) : opts.cwd, env: checkEnv(), timeoutMs: opts.timeoutMs ?? CHECK_TIMEOUT_MS });
    const e = evaluate(spec.succeedWhen, r.exitCode, r.stdout);
    const failed = !e.met && spec.failWhen ? evaluate(spec.failWhen, r.exitCode, r.stdout).met : false;
    return { ok: true, met: e.met, ...(failed ? { failed } : {}), summary: e.summary, exitCode: r.exitCode, output: r.stdout.slice(0, 4096) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const error = /ENOENT|not found|No such file/i.test(msg) ? `${spec.argv[0]} is not installed here` : msg;
    return { ok: false, met: false, summary: error, error };
  }
}
