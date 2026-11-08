// `ducter doctor`: what this Mac has, what's missing, and the one command that fixes it.
// Every probe goes through `Host`, so tests fake the machine (no real logins, no model calls).
import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MsgKey, T } from "./i18n.ts";

export const MIN_BUN = "1.3.0";

export interface RunResult {
  code: number;
  stdout: string;
}

export interface Host {
  /** Absolute path of a command on PATH, or null. */
  which(cmd: string): string | null;
  /** Runs a command with stdin closed; never throws (code -1 on spawn failure or timeout). */
  run(cmd: string[], timeoutMs?: number): Promise<RunResult>;
  /** "free" | "ducter" (a Ducter answers /health) | "busy". */
  port(port: number): Promise<"free" | "ducter" | "busy">;
  /** Creates the dir if needed and proves a file can be written there. */
  writable(dir: string): boolean;
  /** True inside the `bun build --compile` binary: Bun is built in. */
  compiled: boolean;
  bunVersion: string;
}

export type CheckId = "bun" | "git" | "claude" | "codex" | "nmem" | "cua" | "port" | "data";
export type CheckStatus = "ok" | "missing" | "warn";

export interface Check {
  id: CheckId;
  label: string;
  status: CheckStatus;
  required: boolean;
  detail: string;
  fix?: string; // one shell command, or a URL
}

export interface DoctorReport {
  checks: Check[];
  ok: boolean; // every required check passed
  harnessReady: boolean;
}

export interface DoctorOptions {
  port: number;
  dataDir: string;
}

const FIX = {
  bun: "curl -fsSL https://bun.sh/install | bash",
  git: "xcode-select --install",
  claudeInstall: "curl -fsSL https://claude.ai/install.sh | bash",
  claudeLogin: "claude auth login",
  codexInstall: "brew install codex",
  codexLogin: "codex login",
  nmemInstall: "pipx install nmem-cli",
  nmemUp: "nmem status",
  cua: "https://github.com/trycua/cua",
  port: (p: number) => `DUCTER_PORT=${p + 1} ducter up`,
  data: (d: string) => `mkdir -p "${d}" && chmod u+w "${d}"`,
};

/** Compares dotted versions numerically; non-numeric parts count as 0. */
export function versionAtLeast(have: string, min: string): boolean {
  const a = have.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const b = min.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < b.length; i++) {
    if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i]!;
  }
  return true;
}

const firstVersion = (s: string) => s.match(/\d+\.\d+(\.\d+)?/)?.[0] ?? s.trim().split("\n")[0] ?? "";

function parseJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export async function runDoctor(host: Host, t: T, opts: DoctorOptions): Promise<DoctorReport> {
  const c = (id: CheckId, labelKey: MsgKey, status: CheckStatus, required: boolean, detailKey: MsgKey, vars: Record<string, string | number> = {}, fix?: string): Check => ({
    id,
    label: t(labelKey, vars),
    status,
    required,
    detail: t(detailKey, vars),
    fix: status === "ok" ? undefined : fix,
  });

  // The slow probes (CLIs that may hit the network or keychain) run in parallel.
  const [git, claude, codex, nmem, cua, port] = await Promise.all([
    (async () => {
      if (!host.which("git")) return c("git", "check.git", "missing", true, "check.git.missing", {}, FIX.git);
      const r = await host.run(["git", "--version"]);
      return c("git", "check.git", "ok", true, "check.git.ok", { version: firstVersion(r.stdout) });
    })(),
    (async () => {
      if (!host.which("claude")) return { installed: false, loggedIn: false, version: "" };
      const [v, auth] = await Promise.all([host.run(["claude", "--version"]), host.run(["claude", "auth", "status"], 15_000)]);
      const j = parseJson(auth.stdout);
      return { installed: true, loggedIn: auth.code === 0 && j?.loggedIn === true, version: firstVersion(v.stdout) };
    })(),
    (async () => {
      if (!host.which("codex")) return { installed: false, loggedIn: false };
      const r = await host.run(["codex", "login", "status"], 15_000);
      return { installed: true, loggedIn: r.code === 0 && /logged in/i.test(r.stdout) && !/not logged in/i.test(r.stdout) };
    })(),
    (async () => {
      if (!host.which("nmem")) return c("nmem", "check.nmem", "missing", false, "check.nmem.missing", {}, FIX.nmemInstall);
      const r = await host.run(["nmem", "--json", "status"], 8_000);
      const j = parseJson(r.stdout);
      if (r.code === 0 && j?.status === "healthy") return c("nmem", "check.nmem", "ok", false, "check.nmem.ok", { mode: String(j.mode ?? j.backend ?? "local") });
      return c("nmem", "check.nmem", "warn", false, "check.nmem.down", {}, FIX.nmemUp);
    })(),
    (async () => {
      if (!host.which("cua-driver")) return c("cua", "check.cua", "missing", false, "check.cua.missing", {}, FIX.cua);
      const r = await host.run(["cua-driver", "--version"]);
      return c("cua", "check.cua", "ok", false, "check.cua.ok", { version: firstVersion(r.stdout) });
    })(),
    host.port(opts.port),
  ]);

  let bun: Check;
  if (host.compiled) bun = c("bun", "check.bun", "ok", true, "check.bun.builtin", { version: `bun ${host.bunVersion}` });
  else if (!versionAtLeast(host.bunVersion, MIN_BUN)) bun = c("bun", "check.bun", "missing", true, "check.bun.old", { version: host.bunVersion, min: MIN_BUN }, FIX.bun);
  else bun = c("bun", "check.bun", "ok", true, "check.bun.ok", { version: host.bunVersion });

  // At least one harness is required; whichever is logged in carries the requirement.
  const harnessReady = claude.loggedIn || codex.loggedIn;
  const claudeCheck = claude.loggedIn
    ? c("claude", "check.claude", "ok", true, "check.claude.ok", { version: claude.version })
    : claude.installed
      ? c("claude", "check.claude", "missing", !harnessReady, "check.claude.loggedOut", {}, FIX.claudeLogin)
      : c("claude", "check.claude", "missing", !harnessReady, "check.claude.missing", {}, FIX.claudeInstall);
  const codexCheck = codex.loggedIn
    ? c("codex", "check.codex", "ok", false, "check.codex.ok")
    : codex.installed
      ? c("codex", "check.codex", "missing", false, "check.codex.loggedOut", {}, FIX.codexLogin)
      : c("codex", "check.codex", "missing", false, "check.codex.missing", {}, FIX.codexInstall);

  const portCheck =
    port === "free"
      ? c("port", "check.port", "ok", true, "check.port.ok", { port: opts.port })
      : port === "ducter"
        ? c("port", "check.port", "warn", false, "check.port.ducter", { port: opts.port })
        : c("port", "check.port", "missing", true, "check.port.busy", { port: opts.port }, FIX.port(opts.port));

  const dataCheck = host.writable(opts.dataDir)
    ? c("data", "check.data", "ok", true, "check.data.ok", { dir: opts.dataDir })
    : c("data", "check.data", "missing", true, "check.data.bad", { dir: opts.dataDir }, FIX.data(opts.dataDir));

  const checks = [bun, git, claudeCheck, codexCheck, nmem, cua, portCheck, dataCheck];
  return { checks, ok: checks.every((k) => !k.required || k.status === "ok"), harnessReady };
}

export interface Style {
  ok(s: string): string;
  bad(s: string): string;
  dim(s: string): string;
  bold(s: string): string;
}

export const plainStyle: Style = { ok: (s) => s, bad: (s) => s, dim: (s) => s, bold: (s) => s };

export function ansiStyle(enabled: boolean): Style {
  if (!enabled) return plainStyle;
  const w = (a: number, b: number) => (s: string) => `\x1b[${a}m${s}\x1b[${b}m`;
  return { ok: w(32, 39), bad: w(33, 39), dim: w(2, 22), bold: w(1, 22) };
}

/** Display width: CJK and full-width characters take two columns. */
export function width(s: string): number {
  let n = 0;
  for (const ch of s) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return n;
}
const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - width(s)));

export function formatReport(r: DoctorReport, t: T, style: Style = plainStyle, opts: { closing?: boolean } = {}): string {
  const labelW = Math.max(...r.checks.map((k) => width(k.label))) + 2;
  const lines = [style.bold(t("doctor.title")), ""];
  for (const k of r.checks) {
    const mark = k.status === "ok" ? style.ok("✓") : k.required ? style.bad("✗") : style.dim("·");
    const tag = k.status !== "ok" && !k.required ? style.dim(`  (${t("doctor.optional")})`) : "";
    lines.push(`  ${mark} ${pad(k.label, labelW)}${k.detail}${tag}`);
    if (k.fix) lines.push(`    ${" ".repeat(labelW)}${style.dim(t("doctor.fix"))} ${k.fix}`);
  }
  lines.push("");
  if (!r.harnessReady) lines.push(t("check.harness.none"));
  const missing = r.checks.filter((k) => k.required && k.status !== "ok").length;
  if (missing) lines.push(t("doctor.needsFix", { n: missing }));
  else if (opts.closing !== false) lines.push(t("doctor.allGood"));
  if (r.checks.some((k) => !k.required && k.status !== "ok")) lines.push(style.dim(t("doctor.optionalNote")));
  return lines.join("\n");
}

// ---------- The real machine ----------

export function realHost(): Host {
  return {
    which: (cmd) => Bun.which(cmd),
    async run(cmd, timeoutMs = 5_000) {
      try {
        const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
        const timer = setTimeout(() => proc.kill(), timeoutMs);
        const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
        const code = await proc.exited;
        clearTimeout(timer);
        return { code: proc.signalCode ? -1 : code, stdout: stdout || stderr };
      } catch {
        return { code: -1, stdout: "" };
      }
    },
    async port(port) {
      try {
        const srv = Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } });
        srv.stop(true);
        return "free";
      } catch {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
          const j: any = await r.json();
          return j?.ok === true && typeof j.headSeq === "number" ? "ducter" : "busy";
        } catch {
          return "busy";
        }
      }
    },
    writable(dir) {
      try {
        mkdirSync(dir, { recursive: true });
        accessSync(dir, constants.W_OK);
        const probe = join(dir, `.doctor-${process.pid}`);
        writeFileSync(probe, "");
        rmSync(probe);
        return true;
      } catch {
        return false;
      }
    },
    compiled: isCompiled(),
    bunVersion: Bun.version,
  };
}

/** Inside `bun build --compile` output, modules live under the virtual /$bunfs root. */
export function isCompiled(): boolean {
  return import.meta.url.includes("$bunfs") || import.meta.path.includes("$bunfs") || /^[A-Z]:\\~BUN\\/.test(import.meta.path);
}
