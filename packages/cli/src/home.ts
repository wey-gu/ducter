// The CLI follows the active home (D146). Commands come in two kinds: machine-local ones (up,
// service, worker, doctor, domain, uninstall, report) always act on this machine; home commands
// (status, say, task, tail, answer, merge, undo, open, pair, devices) go to the Ducter the CLI
// follows. That is <dataDir>/home.json (0600) when it exists, written by the Mac app when it
// connects to a Ducter on a server, or by `ducter connect`; else the Ducter on this machine.
// home.json holds the CLI's own device token (a device of its own, revocable apart from the app).
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export const HOME_FILE = "home.json";

export interface HomeFile {
  /** The http(s) base: https://hel.siwei.info (no /ws, no trailing slash). */
  address: string;
  /** This command line's own device token (dvc.…). Absent: not paired yet (or a loopback tunnel, which needs none). */
  token?: string;
  /** What the CLI prints as its target: the address's host. */
  name: string;
  /** ISO: when the CLI started following it. */
  since: string;
  deviceId?: string;
  /** Who wrote it: the Mac app (it follows the app) or `ducter connect`. */
  by?: "app" | "cli";
}

export type Target = { kind: "local"; port: number } | { kind: "remote"; address: string; name: string; token?: string };

export const homePath = (dataDir: string) => join(dataDir, HOME_FILE);

export function readHome(dataDir: string): HomeFile | undefined {
  const p = homePath(dataDir);
  if (!existsSync(p)) return undefined;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (!j || typeof j.address !== "string" || !j.address) return undefined;
    const base = parseAddress(j.address)?.base;
    if (!base) return undefined;
    return { address: base, name: typeof j.name === "string" && j.name ? j.name : hostOf(base), since: String(j.since ?? ""), ...(typeof j.token === "string" && j.token ? { token: j.token } : {}), ...(j.deviceId ? { deviceId: String(j.deviceId) } : {}), ...(j.by === "app" || j.by === "cli" ? { by: j.by } : {}) };
  } catch {
    return undefined;
  }
}

/** Owner-only, written whole (a reader never sees half a file). */
export function writeHome(dataDir: string, h: HomeFile): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const p = homePath(dataDir);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(h, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, p);
}

/** True when there was one to remove. */
export function clearHome(dataDir: string): boolean {
  const p = homePath(dataDir);
  if (!existsSync(p)) return false;
  rmSync(p, { force: true });
  return true;
}

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|\[?::1\]?)$/i;

/**
 * What a person types: "hel.siwei.info", "https://hel.siwei.info/", "wss://…/ws", or the whole
 * link `ducter pair` prints (…/pair#c=K7QM-4XPA). The http(s) base and the code in the link.
 * The same reading as the Mac app's (apps/desktop/internal/remote.Parse).
 */
export function parseAddress(input: string): { base: string; code?: string } | undefined {
  let a = input.trim();
  let code: string | undefined;
  const m = /[#&?]c=([A-Za-z0-9-]+)/.exec(a);
  if (m) {
    code = m[1];
    a = a.slice(0, a.search(/[#?]/));
  }
  if (!a) return undefined;
  if (!a.includes("://")) {
    const host = a.split("/")[0]!.replace(/:\d+$/, "");
    a = (LOOPBACK.test(host) ? "http://" : "https://") + a;
  }
  let u: URL;
  try {
    u = new URL(a);
  } catch {
    return undefined;
  }
  if (!u.host) return undefined;
  if (u.protocol === "ws:") u.protocol = "http:";
  else if (u.protocol === "wss:") u.protocol = "https:";
  else if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  const path = u.pathname.replace(/\/+$/, "").replace(/\/pair$/, "").replace(/\/ws$/, "");
  return { base: `${u.protocol}//${u.host}${path}`, ...(code ? { code } : {}) };
}

export const hostOf = (base: string) => {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
};

export const isLoopbackBase = (base: string) => {
  try {
    return LOOPBACK.test(new URL(base).hostname);
  } catch {
    return false;
  }
};

export const sameAddress = (a: string, b: string) => parseAddress(a)?.base.toLowerCase() === parseAddress(b)?.base.toLowerCase();

/** The client socket for a target, and the headers that authenticate it (the phone/app path). */
export function wsEndpoint(t: Target | number): { url: string; headers: Record<string, string> } {
  if (typeof t === "number") return { url: `ws://127.0.0.1:${t}/ws`, headers: {} };
  if (t.kind === "local") return { url: `ws://127.0.0.1:${t.port}/ws`, headers: {} };
  return { url: t.address.replace(/^http/, "ws") + "/ws", headers: t.token ? { authorization: `Bearer ${t.token}` } : {} };
}

/** Opens the client socket with the device token, when there is one. */
export function openSocket(t: Target | number): WebSocket {
  const e = wsEndpoint(t);
  // Bun's WebSocket takes headers (a browser's doesn't; the web client offers a subprotocol).
  return Object.keys(e.headers).length ? new WebSocket(e.url, { headers: e.headers } as never) : new WebSocket(e.url);
}

/** What a person opens for that target. */
export const appAddress = (t: Target) => (t.kind === "local" ? `http://127.0.0.1:${t.port}/app` : `${t.address}/app`);

/** What --json carries as `home`. */
export const homeJson = (t: Target) => (t.kind === "local" ? { kind: "local" as const, address: `http://127.0.0.1:${t.port}` } : { kind: "remote" as const, address: t.address, name: t.name });

// ---------- which commands go where ----------

export type CommandClass = "machine" | "home" | "self";

const MACHINE = new Set(["up", "service", "uninstall", "worker", "doctor", "domain", "report"]);
const HOME = new Set(["status", "say", "task", "tail", "answer", "merge", "undo", "open", "pair", "devices"]);

/**
 * machine: acts on this computer, whatever the CLI follows. home: goes to the Ducter the CLI
 * follows. self: the CLI itself (help, version, connect, disconnect). `update` updates this
 * machine; `update --all` updates the home and the computers that do tasks for it.
 */
export function commandClass(command: string, o: { all?: boolean } = {}): CommandClass {
  if (command === "update") return o.all ? "home" : "machine";
  if (MACHINE.has(command)) return "machine";
  if (HOME.has(command)) return "home";
  return "self";
}

export type Resolved = { ok: true; target: Target; home?: HomeFile } | { ok: false; key: "home.needsConnect" | "home.badAddress"; vars: Record<string, string> };

export const connectCommand = (address: string) => `ducter connect ${address} --code <code>`;

/**
 * Where a home command goes: --local (or an explicit --port) → this machine; --home <address>
 * once (with the token home.json holds for it); else home.json; else this machine.
 */
export function resolveTarget(o: { dataDir: string; port: number; local?: boolean; home?: string; portGiven?: boolean }): Resolved {
  const local: Resolved = { ok: true, target: { kind: "local", port: o.port } };
  if (o.local || (o.portGiven && !o.home)) return local;
  const saved = readHome(o.dataDir);
  if (o.home) {
    const p = parseAddress(o.home);
    if (!p) return { ok: false, key: "home.badAddress", vars: { address: o.home } };
    const token = saved && sameAddress(saved.address, p.base) ? saved.token : undefined;
    if (!token && !isLoopbackBase(p.base)) return { ok: false, key: "home.needsConnect", vars: { name: hostOf(p.base), command: connectCommand(p.base) } };
    return { ok: true, target: { kind: "remote", address: p.base, name: hostOf(p.base), ...(token ? { token } : {}) }, ...(saved && token ? { home: saved } : {}) };
  }
  if (!saved) return local;
  if (!saved.token && !isLoopbackBase(saved.address)) return { ok: false, key: "home.needsConnect", vars: { name: saved.name, command: connectCommand(saved.address) } };
  return { ok: true, target: { kind: "remote", address: saved.address, name: saved.name, ...(saved.token ? { token: saved.token } : {}) }, home: saved };
}

// ---------- when a home doesn't answer ----------

export type Unreached = "unreachable" | "revoked" | "other";

/**
 * Why a remote home didn't open its socket: nothing answers (unreachable), its gate refused the
 * token (revoked: 401 on /ws), or it answered and still didn't greet (other).
 */
export async function whyUnreached(t: Extract<Target, { kind: "remote" }>, fetcher: typeof fetch = fetch): Promise<Unreached> {
  try {
    const r = await fetcher(`${t.address}/ws`, { headers: t.token ? { authorization: `Bearer ${t.token}` } : {}, signal: AbortSignal.timeout(5000) });
    if (r.status === 401) return "revoked";
    return "other";
  } catch {
    return "unreachable";
  }
}

/** This Mac as the home sees the command line: "CLI on weyl-mbp". */
export const cliDeviceName = (host = hostname()) => `CLI on ${host.replace(/\.local$/, "")}`;

export type ConnectError = "code" | "locked" | "unreachable" | "notducter" | "nocode" | "address";

/**
 * `ducter connect <address> --code <code>`: trades a one-time code for this command line's own
 * device token at POST <address>/pair and follows that Ducter. A loopback address (an SSH
 * tunnel) needs no code: its /health answering is enough.
 */
export async function pairCli(o: { address: string; code?: string; name?: string; platform?: string; fetcher?: typeof fetch; now?: () => Date }): Promise<{ ok: true; home: HomeFile } | { ok: false; error: ConnectError; base?: string }> {
  const f = o.fetcher ?? fetch;
  const p = parseAddress(o.address);
  if (!p) return { ok: false, error: "address" };
  const code = o.code?.trim() || p.code;
  const since = (o.now?.() ?? new Date()).toISOString();
  const home: HomeFile = { address: p.base, name: hostOf(p.base), since, by: "cli" };
  if (!code) {
    if (!isLoopbackBase(p.base)) return { ok: false, error: "nocode", base: p.base };
    try {
      const r = await f(`${p.base}/health`, { signal: AbortSignal.timeout(5000) });
      const j: any = await r.json().catch(() => undefined);
      return j?.ok ? { ok: true, home } : { ok: false, error: "notducter", base: p.base };
    } catch {
      return { ok: false, error: "unreachable", base: p.base };
    }
  }
  let r: Response;
  try {
    r = await f(`${p.base}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, name: o.name ?? cliDeviceName(), platform: o.platform ?? process.platform }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, error: "unreachable", base: p.base };
  }
  if (r.status === 401) return { ok: false, error: "code", base: p.base };
  if (r.status === 429) return { ok: false, error: "locked", base: p.base };
  const j: any = r.ok ? await r.json().catch(() => undefined) : undefined;
  if (!j?.token) return { ok: false, error: "notducter", base: p.base };
  return { ok: true, home: { ...home, token: String(j.token), ...(j.deviceId ? { deviceId: String(j.deviceId) } : {}) } };
}

// ---------- doctor: what the CLI follows, and what it is ----------

export type CliInstall = "app" | "standalone" | "source";

/**
 * What this `ducter` is: the app's own helper (Ducter.app/Contents/Helpers/ducter, linked into
 * ~/.local/bin by the app: it updates with the app), a standalone binary (install.sh), or Bun
 * running the source (a checkout). The last two don't update with the app.
 */
export function cliInstall(o: { realExecPath: string; compiled: boolean }): CliInstall {
  if (!o.compiled) return "source";
  return /\.app\/Contents\/(Helpers|MacOS)\//.test(o.realExecPath) ? "app" : "standalone";
}
