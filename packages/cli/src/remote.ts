// Ducter on a server: `ducter pair`, `ducter devices`, `ducter service`, and the headless
// banner. Pairing state lives in <dataDir>/devices.db (core/src/auth.ts), shared with the
// running service, so these commands work whether or not it is up.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import QR from "qrcode";
import { openDeviceAuth, CODE_TTL_MS, type Device } from "@ducter/core/src/auth.ts";
import { width, type Host, type Style } from "./doctor.ts";
import type { T } from "./i18n.ts";

export const UNIT_NAME = "ducter.service";
export const unitPath = (home = homedir()) => join(home, ".config", "systemd", "user", UNIT_NAME);

/** Where remote clients reach this Ducter: DUCTER_PUBLIC_URL, else <dataDir>/public-url (written by scripts/caddy-setup.sh). */
export function publicUrl(dataDir: string, env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.DUCTER_PUBLIC_URL?.trim() || (existsSync(join(dataDir, "public-url")) ? readFileSync(join(dataDir, "public-url"), "utf8").trim() : "");
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

/** The one string a client can paste: the address plus the code in the fragment (never sent to a server). */
export function pairLink(base: string, code: string): string {
  return `${base}/pair#c=${code}`;
}

export function isLoopback(host: string | undefined): boolean {
  return !host || /^(127\.\d+\.\d+\.\d+|localhost|::1)$/.test(host);
}

/** `ducter pair`: a fresh one-time code, how to use it, and (on a TTY) a wait for the device. */
export async function cmdPair(o: { t: T; style: Style; dataDir: string; port: number; json: boolean; running: boolean; wait: boolean }): Promise<number> {
  const { t, style } = o;
  const auth = openDeviceAuth(o.dataDir);
  try {
    const before = new Set(auth.list().map((d) => d.id));
    const { code, expiresAt } = auth.createCode();
    const base = publicUrl(o.dataDir);
    const address = base ?? `http://127.0.0.1:${o.port}`;
    const link = pairLink(address, code);
    if (o.json) {
      console.log(JSON.stringify({ code, expiresAt: new Date(expiresAt).toISOString(), address, link }));
      return 0;
    }
    const min = Math.round(CODE_TTL_MS / 60_000);
    const lines = [
      "",
      `  ${style.ok("●")} ${style.bold(t("pair.title"))}   ${style.bold(code)}   ${style.dim(t("pair.once", { min }))}`,
      "",
    ];
    if (!base) {
      const user = process.env.USER || userInfo().username;
      lines.push(`  ${t("pair.tunnel")}`, "", `    ssh -N -L ${o.port}:127.0.0.1:${o.port} ${user}@${hostname()}`, "", `  ${style.dim(t("pair.tunnelNote", { port: o.port }))}`, "");
    }
    const lw = Math.max(width(t("pair.address")), width(t("pair.code"))) + 2;
    const row = (k: string, v: string) => `    ${k}${" ".repeat(lw - width(k))}${style.bold(v)}`;
    lines.push(`  ${t("pair.howApp")}`, row(t("pair.address"), address), row(t("pair.code"), code), "", `  ${t("pair.orLink")}`, `    ${link}`, "");
    console.log(lines.join("\n"));
    const qr = await QR.toString(link, { type: "terminal", small: true, errorCorrectionLevel: "L" });
    console.log(qr.split("\n").map((l) => "  " + l).join("\n"));
    if (!o.running) console.log(style.dim(t("pair.notRunning")));
    if (!o.wait) return 0;

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

export function formatDevices(list: Device[], t: T, style: Style, now = Date.now()): string {
  if (!list.length) return t("devices.none");
  const w = Math.max(...list.map((d) => d.name.length)) + 2;
  return [
    style.bold(t("devices.header")),
    "",
    ...list.map((d) => {
      const seen = d.lastSeenAt ? t("devices.seen", { when: ago(d.lastSeenAt, now) }) : t("devices.never");
      return `  ${style.ok("●")} ${d.name.padEnd(w)}${style.dim(`${d.kind}${d.platform ? " · " + d.platform : ""} · ${seen} · ${d.id}`)}`;
    }),
  ].join("\n");
}

/** `ducter devices` and `ducter devices disconnect <id|name>`. */
export function cmdDevices(o: { t: T; style: Style; dataDir: string; json: boolean; rest: string[] }): number {
  const { t } = o;
  const auth = openDeviceAuth(o.dataDir);
  try {
    const [verb, what] = o.rest;
    if (!verb || verb === "list") {
      const list = auth.list();
      console.log(o.json ? JSON.stringify(list, null, 2) : formatDevices(list, t, o.style));
      return 0;
    }
    if (verb === "disconnect" || verb === "revoke" || verb === "rm") {
      if (!what) return console.log(t("devices.revokeUsage")), 2;
      const gone = auth.revoke(what);
      if (!gone.length) return console.log(t("devices.revokeNone", { what })), 1;
      for (const d of gone) console.log(t("devices.revoked", { device: `${d.name} (${d.id})` }));
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
}

const sdQuote = (s: string) => (/[\s"\\]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s);

/** The unit file: journald gets stdout/stderr; secrets for harness logins go in ~/.ducter/env (0600), never here. */
export function systemdUnit(u: UnitSpec): string {
  const args = [...u.execStart, "up", "--headless", "--port", String(u.port), ...(u.host && !isLoopback(u.host) ? ["--host", u.host] : [])];
  return [
    "# Written by `ducter service install`. Remove with `ducter service uninstall`.",
    "[Unit]",
    "Description=Ducter (main process)",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${args.map(sdQuote).join(" ")}`,
    "Restart=on-failure",
    "RestartSec=3",
    "WorkingDirectory=%h",
    `Environment=${sdQuote(`DUCTER_DATA_DIR=${u.dataDir}`)}`,
    `Environment=${sdQuote(`PATH=${u.path}`)}`,
    "Environment=NO_COLOR=1",
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
  const parts = (env.PATH ?? "").split(":").filter(Boolean);
  for (const p of [join(home, ".local", "bin"), join(home, ".bun", "bin"), "/usr/local/bin", "/usr/bin", "/bin"]) if (!parts.includes(p)) parts.push(p);
  return parts.join(":");
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

  const unit = systemdUnit({ execStart: selfCommand(host.compiled), dataDir: o.dataDir, path: servicePath(), port: o.port, host: o.bindHost });
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
