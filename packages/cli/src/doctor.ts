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
  /** process.platform; on "linux", doctor speaks to a server (headless logins, service, devices). */
  platform?: string;
  /** Devices paired with this Ducter (core/src/auth.ts). */
  pairedDevices?(): number;
}

export type CheckId = "bun" | "git" | "claude" | "codex" | "nmem" | "cua" | "port" | "data" | "service" | "devices";
export type CheckStatus = "ok" | "missing" | "warn";

export interface Check {
  id: CheckId;
  label: string;
  status: CheckStatus;
  required: boolean;
  detail: string;
  fix?: string; // one shell command, or a URL
  /** Nothing to say to a person (Bun built into the binary): left out of the printed report. */
  quiet?: boolean;
}

export interface DoctorReport {
  checks: Check[];
  ok: boolean; // every required check passed
  harnessReady: boolean;
}

export interface DoctorOptions {
  port: number;
  dataDir: string;
  memoryOff?: boolean; // default: DUCTER_MEMORY=off
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

/** A Linux server has no browser and no Homebrew; research/29 has the evidence for each line. */
export const SERVER_FIX = {
  git: "sudo apt-get install -y git",
  codexInstall: "npm install -g @openai/codex",
  claudeLogin: "claude auth login",
  codexLogin: "codex login --device-auth",
  service: "ducter service install",
  linger: (u: string) => `sudo loginctl enable-linger ${u}`,
  devices: "ducter pair",
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

  const server = host.platform === "linux";
  const fix = server ? { ...FIX, ...SERVER_FIX } : FIX;
  const loggedOut = (id: "claude" | "codex"): MsgKey => (server ? `check.${id}.loggedOut.headless` : `check.${id}.loggedOut`);
  // The slow probes (CLIs that may hit the network or keychain) run in parallel.
  const [git, claude, codex, nmem, cua, port] = await Promise.all([
    (async () => {
      if (!host.which("git")) return c("git", "check.git", "missing", true, "check.git.missing", {}, fix.git);
      const r = await host.run(["git", "--version"]);
      return c("git", "check.git", "ok", true, "check.git.ok", { version: firstVersion(r.stdout) });
    })(),
    (async () => {
      if (!host.which("claude")) return { installed: false, loggedIn: false, token: false, version: "" };
      const [v, auth] = await Promise.all([host.run(["claude", "--version"]), host.run(["claude", "auth", "status"], 15_000)]);
      const j = parseJson(auth.stdout);
      // A CLAUDE_CODE_OAUTH_TOKEN counts as logged in without being checked (research/29).
      return { installed: true, loggedIn: auth.code === 0 && j?.loggedIn === true, token: j?.authMethod === "oauth_token", version: firstVersion(v.stdout) };
    })(),
    (async () => {
      if (!host.which("codex")) return { installed: false, loggedIn: false };
      const r = await host.run(["codex", "login", "status"], 15_000);
      return { installed: true, loggedIn: r.code === 0 && /logged in/i.test(r.stdout) && !/not logged in/i.test(r.stdout) };
    })(),
    (async () => {
      // Off means off: no identity read, no recall, no saves (review 2 #14), so say that, not "connected".
      if (opts.memoryOff ?? process.env.DUCTER_MEMORY === "off") return c("nmem", "check.nmem", "ok", false, "check.nmem.off");
      if (!host.which("nmem")) return c("nmem", "check.nmem", "missing", false, "check.nmem.missing", {}, FIX.nmemInstall);
      const r = await host.run(["nmem", "--json", "status"], 8_000);
      const j = parseJson(r.stdout);
      if (r.code === 0 && j?.status === "healthy") {
        const mode = String(j.mode ?? j.backend ?? "local");
        return c("nmem", "check.nmem", "ok", false, "check.nmem.ok", { mode: mode === "remote" ? t("check.nmem.remote") : mode === "local" ? t("check.nmem.local") : mode });
      }
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
  if (host.compiled) bun = { ...c("bun", "check.bun", "ok", true, "check.bun.builtin", { version: `bun ${host.bunVersion}` }), quiet: true };
  else if (!versionAtLeast(host.bunVersion, MIN_BUN)) bun = c("bun", "check.bun", "missing", true, "check.bun.old", { version: host.bunVersion, min: MIN_BUN }, FIX.bun);
  else bun = c("bun", "check.bun", "ok", true, "check.bun.ok", { version: host.bunVersion });

  // At least one harness is required; whichever is logged in carries the requirement.
  const harnessReady = claude.loggedIn || codex.loggedIn;
  const claudeCheck = claude.loggedIn
    ? c("claude", "check.claude", "ok", true, claude.token ? "check.claude.token" : "check.claude.ok", { version: claude.version })
    : claude.installed
      ? c("claude", "check.claude", "missing", !harnessReady, loggedOut("claude"), {}, fix.claudeLogin)
      : c("claude", "check.claude", "missing", !harnessReady, "check.claude.missing", {}, FIX.claudeInstall);
  const codexCheck = codex.loggedIn
    ? c("codex", "check.codex", "ok", false, "check.codex.ok")
    : codex.installed
      ? c("codex", "check.codex", "missing", false, loggedOut("codex"), {}, fix.codexLogin)
      : c("codex", "check.codex", "missing", false, "check.codex.missing", {}, fix.codexInstall);

  const portCheck =
    port === "free"
      ? c("port", "check.port", "ok", true, "check.port.ok", { port: opts.port })
      : port === "ducter"
        ? c("port", "check.port", "warn", false, "check.port.ducter", { port: opts.port })
        : c("port", "check.port", "missing", true, "check.port.busy", { port: opts.port }, FIX.port(opts.port));

  const dataCheck = host.writable(opts.dataDir)
    ? c("data", "check.data", "ok", true, "check.data.ok", { dir: tildePath(opts.dataDir) })
    : c("data", "check.data", "missing", true, "check.data.bad", { dir: opts.dataDir }, FIX.data(opts.dataDir));

  const checks = [bun, git, claudeCheck, codexCheck, nmem, cua, portCheck, dataCheck];
  if (server) checks.push(...(await serverChecks(host, c)));
  return { checks, ok: checks.every((k) => !k.required || k.status === "ok"), harnessReady };
}

type Mk = (id: CheckId, labelKey: MsgKey, status: CheckStatus, required: boolean, detailKey: MsgKey, vars?: Record<string, string | number>, fix?: string) => Check;

/** Server-only rows: does Ducter outlive this SSH session, and is any device connected? Both optional. */
async function serverChecks(host: Host, c: Mk): Promise<Check[]> {
  const user = process.env.USER || "$USER";
  let service: Check;
  if (!host.which("systemctl")) service = c("service", "check.service", "missing", false, "check.service.off", {}, SERVER_FIX.service);
  else {
    const [active, linger] = await Promise.all([
      host.run(["systemctl", "--user", "is-active", "ducter.service"]),
      host.run(["loginctl", "show-user", user, "-p", "Linger"]),
    ]);
    if (active.stdout.trim() !== "active") service = c("service", "check.service", "missing", false, "check.service.off", {}, SERVER_FIX.service);
    else if (!/Linger=yes/.test(linger.stdout)) service = c("service", "check.service", "warn", false, "check.service.noLinger", {}, SERVER_FIX.linger(user));
    else service = c("service", "check.service", "ok", false, "check.service.ok");
  }
  const n = host.pairedDevices?.() ?? 0;
  const devices = n > 0 ? c("devices", "check.devices", "ok", false, "check.devices.ok", { n }) : c("devices", "check.devices", "missing", false, "check.devices.none", {}, SERVER_FIX.devices);
  return [service, devices];
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
  const shown = r.checks.filter((k) => !k.quiet);
  const labelW = Math.max(...shown.map((k) => width(k.label))) + 2;
  const server = r.checks.some((k) => k.id === "service");
  const lines = [style.bold(t(server ? "doctor.title.server" : "doctor.title")), ""];
  for (const k of shown) {
    const mark = k.status === "ok" ? style.ok("✓") : k.required ? style.bad("✗") : style.dim("·");
    const tag = k.status !== "ok" && !k.required ? style.dim(` ${t("doctor.optional")}`) : "";
    lines.push(`  ${mark} ${pad(k.label, labelW)}${k.detail}${tag}`);
    if (k.fix) lines.push(`    ${" ".repeat(labelW)}${style.dim(t("doctor.fix"))}${k.fix}`);
  }
  lines.push("");
  if (!r.harnessReady) lines.push(t("check.harness.none"));
  const missing = r.checks.filter((k) => k.required && k.status !== "ok").length;
  if (missing) lines.push(t(missing === 1 ? "doctor.needsFix.one" : "doctor.needsFix", { n: missing }));
  else if (opts.closing !== false) lines.push(t("doctor.allGood"));
  if (r.checks.some((k) => !k.required && k.status !== "ok")) lines.push(style.dim(t("doctor.optionalNote")));
  return lines.join("\n");
}

/**
 * The first `ducter up` on a Mac that's ready: one line of what was found, one dim line per
 * optional thing that's missing. The full table stays in `ducter doctor`.
 */
export function formatSummary(r: DoctorReport, t: T, style: Style = plainStyle): string {
  const found = r.checks.filter((k) => k.status === "ok" && ["claude", "codex", "nmem", "cua"].includes(k.id)).map((k) => k.label);
  const lines = [`  ${style.ok("✓")} ${t("summary.ready", { found: found.join(t("summary.sep")) })}`];
  for (const k of r.checks) {
    if (k.required || k.status === "ok" || k.id === "port") continue;
    lines.push(style.dim(`    · ${t("summary.item", { label: k.label, detail: k.detail })}`));
  }
  if (lines.length > 1) lines.push(style.dim(`      ${t("summary.more")}`));
  return lines.join("\n");
}

/**
 * The first `ducter up` on a Mac that isn't ready: only what blocks, each with its one fix.
 * Optional things fold into one line; the caller adds the closing step.
 */
export function formatBlocked(r: DoctorReport, t: T, style: Style = plainStyle): string {
  const blocking = r.checks.filter((k) => k.required && k.status !== "ok");
  const labelW = Math.max(...blocking.map((k) => width(k.label))) + 2;
  const lines: string[] = [];
  for (const k of blocking) {
    lines.push(`  ${style.bad("✗")} ${pad(k.label, labelW)}${k.detail}`);
    if (k.fix) lines.push(`    ${" ".repeat(labelW)}${style.dim(t("doctor.fix"))}${style.bold(k.fix)}`);
  }
  if (!r.harnessReady) lines.push("", `  ${t("check.harness.none")}`);
  const optional = r.checks.filter((k) => !k.required && k.status !== "ok" && k.id !== "port");
  if (optional.length) lines.push("", style.dim(`  ${t("up.optionalLater", { n: optional.length, names: optional.map((k) => k.label).join(t("summary.sep")) })}`));
  return lines.join("\n");
}

/** ~/… for a path under the home folder: shorter, and it doesn't print the user's name. */
export function tildePath(p: string, home = process.env.HOME || ""): string {
  return home && (p === home || p.startsWith(home + "/")) ? "~" + p.slice(home.length) : p;
}

// ---------- The real machine ----------

export function realHost(): Host {
  return {
    which: (cmd) => Bun.which(cmd),
    async run(cmd, timeoutMs = 5_000) {
      try {
        const proc = Bun.spawn(cmd, { env: { ...process.env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
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
    platform: process.platform,
  };
}

/** Inside `bun build --compile` output, modules live under the virtual /$bunfs root. */
export function isCompiled(): boolean {
  return import.meta.url.includes("$bunfs") || import.meta.path.includes("$bunfs") || /^[A-Z]:\\~BUN\\/.test(import.meta.path);
}
