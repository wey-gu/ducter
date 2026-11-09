// Running one check (D112), on the device Ducter lives on or on a worker (worker-host "check").
// The child gets a small allowlisted environment (D102: no key enters it wholesale): the basics,
// proxies and CA bundles, and nothing secret-shaped. gh and git read their own config files.
import { CHECK_MAX_OUTPUT, CHECK_TIMEOUT_MS, evaluate, validateCheck } from "./checks.ts";
import type { CheckSpec } from "./index.ts";
import { isSecretName } from "./keys.ts";

export interface CheckResult {
  ok: boolean; // it ran (a non-zero exit still counts as ran)
  met: boolean;
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

export const realExec: Exec = async (argv, { cwd, env, timeoutMs }) => {
  const p = Bun.spawn(argv, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
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

export async function runCheck(spec: CheckSpec, opts: { cwd?: string; exec?: Exec; timeoutMs?: number } = {}): Promise<CheckResult> {
  const v = validateCheck(spec);
  if (!v.ok) return { ok: false, met: false, summary: v.error, error: v.error };
  try {
    const r = await (opts.exec ?? realExec)(spec.argv, { cwd: spec.cwd ?? opts.cwd, env: checkEnv(), timeoutMs: opts.timeoutMs ?? CHECK_TIMEOUT_MS });
    const e = evaluate(spec.succeedWhen, r.exitCode, r.stdout);
    return { ok: true, met: e.met, summary: e.summary, exitCode: r.exitCode, output: r.stdout.slice(0, 4096) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const error = /ENOENT|not found|No such file/i.test(msg) ? `${spec.argv[0]} is not installed here` : msg;
    return { ok: false, met: false, summary: error, error };
  }
}
