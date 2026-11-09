// Ducter on a server: `ducter pair`, `ducter devices`, `ducter service`, and the headless
// banner. Pairing state lives in <dataDir>/devices.db (core/src/auth.ts), shared with the
// running service, so these commands work whether or not it is up.
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import QR from "qrcode";
import { openDeviceAuth, CODE_TTL_MS, type Device } from "@ducter/core/src/auth.ts";
import { migrateKeys } from "@ducter/protocol/src/keys.ts";
import { isCompiled, width, type Host, type Style } from "./doctor.ts";
import type { T } from "./i18n.ts";

export const UNIT_NAME = "ducter.service";
export const unitPath = (home = homedir()) => join(home, ".config", "systemd", "user", UNIT_NAME);

/** Where remote clients reach this Ducter: DUCTER_PUBLIC_URL, else <dataDir>/public-url (written by `ducter domain`). */
export function publicUrl(dataDir: string, env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.DUCTER_PUBLIC_URL?.trim() || (existsSync(join(dataDir, "public-url")) ? readFileSync(join(dataDir, "public-url"), "utf8").trim() : "");
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

/**
 * How to type this ducter in the shell it was started from: `ducter` when that finds this very
 * binary on PATH, else its path (right after `curl … | sh`, ~/.local/bin may not be on PATH yet).
 */
export function ducterCommand(o: { execPath?: string; which?: (c: string) => string | null; compiled?: boolean; home?: string } = {}): string {
  const exec = o.execPath ?? process.execPath;
  if (!(o.compiled ?? isCompiled())) return "ducter";
  const found = (o.which ?? Bun.which)("ducter");
  try {
    if (found && realpathSync(found) === realpathSync(exec)) return "ducter";
  } catch {}
  const home = o.home ?? homedir();
  return exec.startsWith(home + "/") ? "~" + exec.slice(home.length) : exec;
}

/** The one string a client can paste: the address plus the code in the fragment (never sent to a server). */
export function pairLink(base: string, code: string): string {
  return `${base}/pair#c=${code}`;
}

export function isLoopback(host: string | undefined): boolean {
  return !host || /^(127\.\d+\.\d+\.\d+|localhost|::1)$/.test(host);
}

/** The SSH line to run on the user's computer. Inside an SSH session, SSH_CONNECTION names the
 *  address they used; else this machine's public address, else its name. */
export function tunnelCommand(port: number, env: Record<string, string | undefined> = process.env, publicIp?: string): string {
  const user = env.USER || userInfo().username;
  const server = env.SSH_CONNECTION?.trim().split(/\s+/)[2] || publicIp;
  const host = server ? (server.includes(":") ? `[${server}]` : server) : hostname();
  return `ssh -N -L ${port}:127.0.0.1:${port} ${user}@${host}`;
}

/** The one command that makes another computer do tasks for this Ducter, with a code (D83). */
export function workerCommand(address: string, code: string): string {
  return `ducter worker ${address} --code ${code}`;
}

export interface Pairing {
  code: string;
  expiresAt: string;
  /** Where a phone or the app opens: the public address, else 127.0.0.1 (through a tunnel). */
  address: string;
  link: string;
  /** Another computer's one command (D83). */
  command: string;
}

/** A fresh one-time code and the ways to use it (shared by `pair` and `domain`). */
export function newPairing(dataDir: string, port: number, worker?: boolean): Pairing {
  const auth = openDeviceAuth(dataDir);
  try {
    const { code, expiresAt } = auth.createCode(worker ? { kind: "worker" } : {});
    const base = publicUrl(dataDir);
    const address = base ?? `http://127.0.0.1:${port}`;
    return { code, expiresAt: new Date(expiresAt).toISOString(), address, link: pairLink(address, code), command: workerCommand(base ?? "<address>", code) };
  } finally {
    auth.close();
  }
}

/** This machine's public IPv4 as the internet sees it, or undefined (offline, or no answer in 3 s). */
export async function fetchPublicIp(): Promise<string | undefined> {
  try {
    const r = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(3000) });
    const ip = (await r.text()).trim();
    return r.ok && /^[\d.]+$/.test(ip) ? ip : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `ducter pair`: a fresh one-time code, both ways to use it (a phone or app window; another
 * computer), and (on a TTY) a wait for the device. One code serves either (D83); the hidden
 * `--worker` keeps the old code fixed to a computer and prints only that way. A server with no
 * public address yet leads with `ducter domain`, then the SSH tunnel for a Mac alone.
 */
export async function cmdPair(o: {
  t: T;
  style: Style;
  dataDir: string;
  port: number;
  json: boolean;
  running: boolean;
  wait: boolean;
  worker?: boolean;
  /** This machine's public IP; only asked when there is no public address yet. */
  publicIp?: () => Promise<string | undefined>;
  /** A server (Linux, or reached over SSH) rather than the Mac in front of you. */
  server?: boolean;
  /** How to type ducter here (see ducterCommand); default "ducter". */
  self?: string;
}): Promise<number> {
  const { t, style } = o;
  const auth = openDeviceAuth(o.dataDir);
  try {
    const before = new Set(auth.list().map((d) => d.id));
    const p = newPairing(o.dataDir, o.port, o.worker);
    const { code, address, link, command } = p;
    const expiresAt = Date.parse(p.expiresAt);
    const base = publicUrl(o.dataDir);
    const server = o.server ?? (process.platform === "linux" || Boolean(process.env.SSH_CONNECTION));
    const ip = base ? undefined : await o.publicIp?.();
    const tunnel = tunnelCommand(o.port, process.env, ip);
    if (o.json) {
      const out: Record<string, unknown> = { ...p, reachable: Boolean(base) };
      if (!base) {
        out.publicIp = ip ?? null;
        out.tunnel = tunnel;
        out.steps = [
          { id: "domain", text: t("pair.json.domain", { ip: ip ?? "<public IP>" }), command: "ducter domain <your domain>" },
          { id: "tunnel", text: t("pair.json.tunnel"), command: tunnel },
        ];
      }
      console.log(JSON.stringify(out));
      return 0;
    }
    const min = Math.round(CODE_TTL_MS / 60_000);
    const lines = [
      "",
      `  ${style.ok("●")} ${style.bold(t("pair.title"))}   ${style.bold(code)}   ${style.dim(t("pair.once", { min }))}`,
      "",
    ];
    const lw = Math.max(width(t("pair.address")), width(t("pair.code"))) + 2;
    const row = (k: string, v: string) => `    ${k}${" ".repeat(lw - width(k))}${style.bold(v)}`;
    // Another computer dials out to this Ducter: it needs a reachable address, never a tunnel to here.
    const computer = () => {
      const out = [`  ${t("pair.worker.how")}`, `    ${style.bold(command)}`, ""];
      if (!base) out.push(`  ${style.dim(t("pair.worker.noAddress"))}`, "");
      // D146: another computer's command line can follow this Ducter with the same code.
      else if (!o.worker) out.push(`  ${t("pair.cli.how")}`, `    ${style.bold(`ducter connect ${base} --code ${code}`)}`, "");
      return out;
    };
    if (o.worker) {
      lines.push(...computer());
      console.log(lines.join("\n"));
    } else if (base) {
      lines.push(`  ${t("pair.howApp")}`, row(t("pair.address"), address), row(t("pair.code"), code), "");
      lines.push(`  ${t("pair.orLink")}`, `    ${link}`, "");
      console.log(lines.join("\n"));
      const qr = await QR.toString(link, { type: "terminal", small: true, errorCorrectionLevel: "L" });
      console.log(qr.split("\n").map((l) => "  " + l).join("\n"));
      console.log(computer().join("\n"));
    } else if (server) {
      // First the way that works from anywhere, then the tunnel for a Mac alone.
      lines.push(
        `  ${style.bold(t("pair.domain.lead"))}`,
        `  ${t(ip ? "pair.domain.record" : "pair.domain.recordNoIp", { ip: ip ?? "" })}`,
        `    ${style.bold(`${o.self ?? "ducter"} domain ducter.example.com`)}`,
        `  ${style.dim(t("pair.domain.what"))}`,
        "",
        `  ${t("pair.tunnel")}`,
        `    ${tunnel}`,
        `  ${t("pair.tunnel.then")}`,
        row(t("pair.address"), address),
        row(t("pair.code"), code),
        "",
      );
      console.log(lines.join("\n"));
      console.log(computer().join("\n"));
    } else {
      // The Mac itself: the tunnel comes from another computer; 127.0.0.1 on a phone is the phone.
      lines.push(`  ${t("pair.tunnel.local")}`, "", `    ${tunnel}`, "", `  ${style.dim(t("pair.tunnelNote", { port: o.port }))}`, "");
      lines.push(`  ${t("pair.howApp")}`, row(t("pair.address"), address), row(t("pair.code"), code), "");
      lines.push(`  ${style.dim(t("pair.noPhone"))}`, "");
      console.log(lines.join("\n"));
      console.log(computer().join("\n"));
    }
    if (!o.running) console.log(style.dim(t("pair.notRunning")));
    // Nothing reaches a server without an address or a tunnel yet: don't hold the terminal.
    if (!o.wait || (!base && server && !o.worker)) return 0;

    console.log(style.dim(t("pair.waiting")));
    while (Date.now() < expiresAt) {
      await Bun.sleep(1000);
      const fresh = auth.list().find((d) => !before.has(d.id));
      if (fresh) {
        console.log(`\n  ${style.ok("✓")} ${t("pair.connected", { device: fresh.name })}\n`);
        return 0;
      }
    }
    console.log(t("pair.expired"));
    return 1;
  } finally {
    auth.close();
  }
}

function ago(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 90) return `${s}s`;
  if (s < 90 * 60) return `${Math.round(s / 60)}m`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function formatDevices(list: Device[], t: T, style: Style, now = Date.now(), awake: Set<string> = new Set()): string {
  if (!list.length) return t("devices.none");
  const w = Math.max(...list.map((d) => d.name.length)) + 2;
  return [
    style.bold(t("devices.header")),
    "",
    ...list.map((d) => {
      const seen = awake.has(d.id) ? t("devices.awake") : d.lastSeenAt ? t("devices.seen", { when: ago(d.lastSeenAt, now) }) : t("devices.never");
      return `  ${style.ok("●")} ${d.name.padEnd(w)}${style.dim(`${d.kind}${d.platform ? " · " + d.platform : ""} · ${seen} · ${d.id}`)}`;
    }),
  ].join("\n");
}

/** Workers connected to the running Ducter right now (empty when it isn't running). */
async function awakeWorkers(port: number): Promise<Set<string>> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/devices/online`, { signal: AbortSignal.timeout(1500) });
    const j: any = await r.json();
    return new Set((j.workers ?? []).map((w: any) => w.deviceId));
  } catch {
    return new Set();
  }
}

/** `ducter devices`, `ducter devices disconnect <id|name>` and `ducter devices rename <id|name> <new name>`. */
export async function cmdDevices(o: { t: T; style: Style; dataDir: string; json: boolean; rest: string[]; port: number }): Promise<number> {
  const { t } = o;
  const auth = openDeviceAuth(o.dataDir);
  try {
    const [verb, what] = o.rest;
    if (!verb || verb === "list") {
      const list = auth.list();
      const awake = await awakeWorkers(o.port);
      console.log(o.json ? JSON.stringify(list.map((d) => ({ ...d, awake: awake.has(d.id) })), null, 2) : formatDevices(list, t, o.style, Date.now(), awake));
      return 0;
    }
    if (verb === "disconnect" || verb === "revoke" || verb === "rm") {
      if (!what) return console.log(t("devices.revokeUsage")), 2;
      const gone = auth.revoke(what);
      if (!gone.length) return console.log(t("devices.revokeNone", { what })), 1;
      for (const d of gone) console.log(t("devices.revoked", { device: `${d.name} (${d.id})` }));
      return 0;
    }
    if (verb === "rename") {
      const name = o.rest.slice(2).join(" ").trim();
      if (!what || !name) return console.log(t("devices.renameUsage")), 2;
      // The machine Ducter lives on answers to its own name and to "local" (tasks placed there).
      const home = hostname().replace(/\.local$/, "").toLowerCase();
      const r = [home, "local"].includes(name.toLowerCase()) ? ({ error: "name_taken" } as const) : auth.rename(what, name);
      if ("error" in r) return console.log(t(r.error === "name_taken" ? "devices.renameTaken" : r.error === "empty" ? "devices.renameUsage" : "devices.revokeNone", { what, name })), 1;
      console.log(t("devices.renamed", { device: r.device.name }));
      return 0;
    }
    console.log(t("devices.revokeUsage"));
    return 2;
  } finally {
    auth.close();
  }
}

// ---------- systemd user service ----------

export interface UnitSpec {
  execStart: string[]; // argv; quoted for systemd
  dataDir: string;
  path: string;
  port: number;
  host?: string;
  /** A worker unit runs `ducter worker` (dials out to its main) instead of the main process. */
  worker?: boolean;
}

const sdQuote = (s: string) => (/[\s"\\]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s);

/**
 * The unit file: journald gets stdout/stderr. Its EnvironmentFile (<dataDir>/env) is for
 * non-secret settings only; keys for harness logins live in <dataDir>/keys.env (0600), which the
 * unit never loads: Ducter reads it and hands each key only to its harness (D102).
 */
export function systemdUnit(u: UnitSpec): string {
  const args = u.worker
    ? [...u.execStart, "worker"]
    : [...u.execStart, "up", "--headless", "--port", String(u.port), ...(u.host && !isLoopback(u.host) ? ["--host", u.host] : [])];
  return [
    "# Written by `ducter service install`. Remove with `ducter service uninstall`.",
    "[Unit]",
    `Description=Ducter (${u.worker ? "worker" : "main process"})`,
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${args.map(sdQuote).join(" ")}`,
    "Restart=on-failure",
    ...(u.worker ? ["# Exit 3: the main revoked this worker. Pair again; don't retry.", "RestartPreventExitStatus=3"] : []),
    "RestartSec=3",
    "WorkingDirectory=%h",
    `Environment=${sdQuote(`DUCTER_DATA_DIR=${u.dataDir}`)}`,
    `Environment=${sdQuote(`PATH=${u.path}`)}`,
    "Environment=NO_COLOR=1",
    "# Settings only. Keys go in keys.env next to it, never here (Ducter moves any it finds).",
    `EnvironmentFile=-${join(u.dataDir, "env")}`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

/** What starts this same `ducter`: the compiled binary itself, or bun + this source file. */
export function selfCommand(compiled: boolean): string[] {
  if (compiled) return [process.execPath];
  return [process.execPath, resolve(dirname(new URL(import.meta.url).pathname), "main.ts")];
}

export function servicePath(env: Record<string, string | undefined> = process.env, home = homedir()): string {
  const parts = [...(env.PATH ?? "").split(":"), join(home, ".local", "bin"), join(home, ".bun", "bin"), "/usr/local/bin", "/usr/bin", "/bin"];
  return [...new Set(parts.filter(Boolean))].join(":");
}

async function sh(host: Host, cmd: string[], timeoutMs = 15_000) {
  return host.run(cmd, timeoutMs);
}

async function waitHealthy(port: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch {}
    await Bun.sleep(300);
  }
  return false;
}

export async function lingerOn(host: Host, user: string): Promise<boolean> {
  const r = await sh(host, ["loginctl", "show-user", user, "-p", "Linger"]);
  return /Linger=yes/.test(r.stdout);
}

/** `ducter service install | uninstall | status` (Linux, systemd --user). */
export async function cmdService(o: {
  t: T;
  style: Style;
  host: Host;
  dataDir: string;
  port: number;
  bindHost?: string;
  worker?: boolean;
  rest: string[];
  onInstalled?: () => Promise<void>;
}): Promise<number> {
  const { t, style, host } = o;
  const verb = o.rest[0] ?? "status";
  if (process.platform !== "linux") return console.log(t("service.linuxOnly")), 1;
  if (!["install", "uninstall", "status"].includes(verb)) return console.log(t("service.usage")), 2;
  const probe = await sh(host, ["systemctl", "--user", "show-environment"]);
  if (probe.code !== 0) return console.log(t("service.noSystemd", { reason: probe.stdout.trim().split("\n")[0] || `exit ${probe.code}` })), 1;
  const user = process.env.USER || userInfo().username;

  if (verb === "status") {
    const r = await sh(host, ["systemctl", "--user", "--no-pager", "status", UNIT_NAME]);
    console.log(r.stdout.trim());
    console.log("\n" + style.dim(t("service.logs")));
    return r.code === 0 ? 0 : 1;
  }
  if (verb === "uninstall") {
    await sh(host, ["systemctl", "--user", "disable", "--now", UNIT_NAME]);
    rmSync(unitPath(), { force: true });
    await sh(host, ["systemctl", "--user", "daemon-reload"]);
    console.log(t("service.removed", { dir: o.dataDir }));
    return 0;
  }

  // D102: keys an older install left in the unit's EnvironmentFile move to keys.env first.
  migrateKeys(o.dataDir);
  const unit = systemdUnit({ execStart: selfCommand(host.compiled), dataDir: o.dataDir, path: servicePath(), port: o.port, host: o.bindHost, worker: o.worker });
  mkdirSync(dirname(unitPath()), { recursive: true });
  writeFileSync(unitPath(), unit);
  console.log(style.dim(t("service.installed", { unit: unitPath() })));
  for (const cmd of [["daemon-reload"], ["enable", UNIT_NAME], ["restart", UNIT_NAME]]) {
    const r = await sh(host, ["systemctl", "--user", ...cmd]);
    if (r.code !== 0) {
      console.log(`systemctl --user ${cmd.join(" ")}: ${r.stdout.trim()}`);
      return 1;
    }
  }
  // Without linger, a user service stops at logout and doesn't start at boot. Try without sudo
  // first (polkit allows it for your own user on most distros).
  let linger = await lingerOn(host, user);
  if (!linger) {
    await sh(host, ["loginctl", "enable-linger", user]);
    linger = await lingerOn(host, user);
  }
  if (o.worker) {
    await Bun.sleep(2000);
    const r = await sh(host, ["systemctl", "--user", "is-active", UNIT_NAME]);
    console.log(`\n  ${style.ok("●")} ${r.stdout.trim()}`);
    if (!linger) console.log("  " + t("service.linger", { user }));
    console.log("  " + style.dim(t("service.logs")));
    return r.stdout.trim() === "active" ? 0 : 1;
  }
  if (!(await waitHealthy(o.port, 20_000))) {
    console.log(t("service.notUp", { s: 20 }));
    return 1;
  }
  console.log(`\n  ${style.ok("●")} ${style.bold(t("service.started", { name: process.env.DUCTER_PERSONA_NAME || "Ducter" }))}`);
  if (!linger) console.log("  " + t("service.linger", { user }));
  console.log("  " + style.dim(t("service.logs")));
  await o.onInstalled?.();
  return 0;
}
