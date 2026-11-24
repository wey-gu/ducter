// 你的设备和本事 / Your devices and abilities (D43, D51, design/flows/A-setup-devices.md): what each
// device is, whether it is awake, which AI accounts are signed in on it, and which abilities it
// has. Only what the server knows: probes on this machine (cua-driver, harness logins, a
// battery = a laptop), and what workers said in their hello. No allowance is ever estimated.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { platform as osPlatform } from "node:os";
import { thisComputer, thisHost } from "./this-computer.ts";
import { join } from "node:path";
import QRCode from "qrcode";
import type { AnywhereCtl } from "./anywhere.ts";
import { deviceHarness, sameComputer, type AbilityId, type ClientShape, type AgentHow, type AbilityReason, type DeviceAbility, type DeviceHarness, type DeviceKind, type DeviceView, type Reach, type ServerFrame } from "@ducter/protocol";
import { readAbilitySettings, writeAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import { claudeInChromeConnected, codexNative } from "@ducter/protocol/src/native-browser.ts";
import { deviceForm, type DeviceAuth } from "./auth.ts";
import type { Workers } from "./workers.ts";
import { pairFragment, type DeviceVia, type HomeKey, type ReachWay } from "@ducter/protocol/src/reach.ts";
import { probeHarnesses } from "./harness-probe.ts";
import type { BrowserSetup } from "./browser/index.ts";
import { spawnNow, whichNow } from "@ducter/protocol/src/which.ts";

export type DevicesFrame = Extract<ServerFrame, { t: "devices" }>;
export type AbilityResult = Extract<ServerFrame, { t: "ability_result" }>;
export type PairCodeFrame = Extract<ServerFrame, { t: "pair_code" }>;
export type RenameResult = Extract<ServerFrame, { t: "rename_result" }>;
export type DisconnectResult = Extract<ServerFrame, { t: "disconnect_result" }>;

export type Exec = (argv: string[], timeoutMs?: number) => Promise<{ code: number; out: string }>;

/** The browser driver on this machine: its version, or why there is none. */
export type CuaProbe = () => Promise<{ version: string } | { missing: string }>;

/** An AI agent's own browser tools ready on this machine (D130): Codex's, or Claude in Chrome connected. */
export type NativeBrowserProbe = () => Promise<"codex" | "claude" | undefined>;

export interface DeviceProbes {
  cua: CuaProbe;
  native: NativeBrowserProbe;
  /** Harness logins on this machine (as `ducter doctor` checks them); canBePartner is filled in. */
  harnesses(): Promise<(Omit<DeviceHarness, "canBePartner"> & { canBePartner?: boolean })[]>;
  /** laptop | mini | server for this machine. */
  kind(): Promise<DeviceKind>;
  /** D538: this computer's own look (memory, cores, disk); tests and demos give a fixed one. */
  resources?(): Promise<import("@ducter/protocol").DeviceResources | undefined>;
}

export interface DevicesOptions {
  dataDir: string;
  /** D363: putting agents on the home and signing them in there (agent-setup.ts): its rows carry that state. */
  agentSetup?: () => import("./agent-setup.ts").AgentSetup | undefined;
  /** D366: memory is on and the home's Nowledge Mem is connected: a worker's own Mem shows on its card. */
  memOn?: () => boolean;
  /** D393: the home carries Mem to tasks there (the relay has the home's connection): the card says so, no sign-in asked. */
  memCarried?: () => boolean;
  /** D377: looking at the person's agents' records is on (Settings, 读它们留下的记录): a worker's records row shows. */
  recordsOn?: () => boolean;
  /** D514: the working copies tidied on a computer so far ("local" the home). */
  tidied?: (device: string) => { count: number; bytes: number } | undefined;
  /** D538: the home's own look at itself (memory, cores, disk, the kernel's stops), as last taken. */
  resources?: () => import("@ducter/protocol").DeviceResources | undefined;
  auth: DeviceAuth;
  workers: Workers;
  env?: Record<string, string | undefined>;
  probes?: Partial<DeviceProbes>;
  exec?: Exec;
  which?: (cmd: string) => string | null;
  hostname?: string;
  /** Client device ids with a live socket right now (ws.ts). */
  connected?: () => Set<string>;
  /** D293: how each connected client reaches the home now (by device id). */
  viaOf?: (deviceId: string) => DeviceVia | undefined;
  /** D293: the ways to reach the home, with up or down, and its key. */
  ways?: () => ReachWay[];
  homeKey?: HomeKey;
  /** How long probe results are reused (default 60 s); `refresh` drops them. */
  cacheMs?: number;
  now?: () => number;
  /** D148: version and update state per device. */
  updates?: () => import("./updates.ts").Updates | undefined;
  /** The home's own Ducter version and how it updates. */
  self?: { version: string; how: import("@ducter/protocol").UpdateHow; platform: string };
  /** D151: Ducter's own browser (a server's 上网): whether it is installed, and installing it. */
  browser?: { setup(): BrowserSetup; install(): Promise<unknown>; onChange(fn: () => void): () => void };
  /** The machine Ducter runs on (default: this one). */
  platform?: string;
  /** D156: each device's AI agents: latest per channel, standing, an update under way. */
  agents?: () => import("./agents.ts").AgentUpdates | undefined;
  /** D224: 全部更新 / Update all: what it would do, and the plan under way. */
  updateAll?: () => import("./update-all.ts").UpdateAll | undefined;
  /** D169: Nowledge Mem's plugin line on each device's agents. */
  mem?: () => import("./mem-plugins.ts").MemPlugins | undefined;
  /** D156: the pi inside this Ducter (harness-probe bundledPiVersion). */
  piBundled?: () => string | undefined;
  /** D155 + D159: a device was disconnected (its phone's notifications stop at once). */
  onDisconnect?: (deviceId: string) => void;
  /** D199: 打电话 on the home, from the calling connection (`callAbility`); off when absent. */
  call?: () => DeviceAbility;
  /** D228: 从外面连 / From outside: the tunnel Ducter runs (anywhere.ts). */
  anywhere?: Pick<AnywhereCtl, "view" | "turnOn" | "turnOff" | "onChange">;
  /** D217: 用手机 / Use a phone on the home: Ducter's own phone (an Android emulator on a Mac). */
  ownPhone?: { ability(): DeviceAbility; onChange(fn: () => void): () => void };
  /** D235: 用电脑 / Use the computer on this computer (computer/index.ts). */
  computer?: { ability(): Promise<DeviceAbility>; refresh(): void };
  /** D238: 用这台手机 / Use this phone on each Android phone's card (handset/index.ts). */
  handsets?: Pick<import("./handset/index.ts").Handsets, "view" | "onChange">;
}

/**
 * D199: 打电话 / Make calls, as the home's ability: on while a calling connection is there (signed
 * out when its sign-in is gone, D193's 需要重新登录), off before one. Calls don't run on a computer,
 * so only the home has it.
 */
export function callAbility(calling: { connectionId: string } | undefined, connections: { id: string; state: string }[]): DeviceAbility {
  const c = calling && connections.find((x) => x.id === calling.connectionId);
  if (!c) return { id: "call", state: "off" };
  return c.state === "unauthorized" ? { id: "call", state: "on", reason: "signed_out" } : { id: "call", state: "on" };
}

export interface DevicesView {
  frame(): Promise<DevicesFrame>;
  setAbility(device: string, ability: AbilityId, on: boolean, named?: { token: string; hostname: string }): Promise<AbilityResult>;
  pairCode(): Promise<PairCodeFrame>;
  /** 改名字 / Rename any device (D84); the home's is a display name beside its host name (D155). */
  rename(device: string, name: string): RenameResult;
  /** 断开 / Disconnect a paired device (D148 (11)): the same revoke as `ducter devices disconnect`. */
  disconnect(device: string): DisconnectResult;
  /** D263: a paired client said what it is shaped like (its hello, or its Android app's model). */
  shaped(device: string, shape: ClientShape): void;
  onChange(fn: () => void): () => void;
  /** Something changed (a device paired, a socket came or went): tell the subscribers. */
  changed(): void;
  /** Forget cached probes (the next frame probes again). */
  refresh(): void;
  /** This machine's AI agents as last probed (undefined before the first probe); a stale
   *  result starts a fresh probe in the background. */
  harnessesNow(): { harness: string; loggedIn: boolean; installed?: boolean; version?: string; trouble?: { kind: string } }[] | undefined;
  stop(): void;
}

export const defaultExec: Exec = async (argv, timeoutMs = 15_000) => {
  try {
    // Both streams: `codex login status` answers on stderr.
    // D518: the PATH as it is now. Without an env Bun looks a bare command up on the PATH the
    // process started with (research/132), so an agent Ducter put in its own tools folder while a
    // service ran (hel's Claude Code) read as installed (whichNow) and never answered: 未登录 forever.
    const p = spawnNow(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: process.env });
    const timer = setTimeout(() => p.kill(), timeoutMs);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    return { code, out: [out.trim(), err.trim()].filter(Boolean).join("\n") };
  } catch {
    return { code: -1, out: "" };
  }
};

/** Typed browser tools arrived in cua-driver-rs 2026-07 (runner/src/browser.ts). */
const REQUIRED_TOOLS = ["browser_prepare", "get_browser_state", "browser_navigate"];
const CUA_APP_BIN = "/Applications/CuaDriver.app/Contents/MacOS/cua-driver";

/** A Mac with an internal battery is a laptop; other Macs are desktops; Linux is a server. */
export async function localDeviceKind(exec: Exec = defaultExec, platform: string = osPlatform()): Promise<DeviceKind> {
  if (platform === "linux") return "server";
  if (platform !== "darwin") return "laptop";
  const r = await exec(["pmset", "-g", "batt"], 5_000);
  return /InternalBattery/i.test(r.out) ? "laptop" : "mini";
}

/** A device kind from a paired device's platform string ("linux-x64", "darwin-arm64", "ios"). */
export function kindFromPlatform(p: string | undefined): DeviceKind {
  const s = (p ?? "").toLowerCase();
  if (/ios|iphone|android/.test(s)) return "phone";
  if (s.startsWith("linux")) return "server";
  return "laptop";
}

/** D155: the home's own name, when the person gave it one (else its host name). */
export const homeNameFile = (dataDir: string) => join(dataDir, "device-name");
export function homeName(dataDir: string): string | undefined {
  try {
    return readFileSync(homeNameFile(dataDir), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export function publicAddress(dataDir: string, env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.DUCTER_PUBLIC_URL?.trim() || (existsSync(join(dataDir, "public-url")) ? readFileSync(join(dataDir, "public-url"), "utf8").trim() : "");
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

/** A QR code as rows of "1" (dark) and "0" (light), without the quiet zone. */
export function qrRows(text: string): string[] {
  const q = QRCode.create(text, { errorCorrectionLevel: "L" });
  const n = q.modules.size;
  const rows: string[] = [];
  for (let r = 0; r < n; r++) {
    let row = "";
    for (let c = 0; c < n; c++) row += q.modules.get(r, c) ? "1" : "0";
    rows.push(row);
  }
  return rows;
}

const firstVersion = (s: string) => s.match(/\d+\.\d+(\.\d+)?/)?.[0] ?? "";

function parseJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** cua-driver on this machine, with the typed browser tools (the home's probe, and a worker's). */
export function defaultCuaProbe(env: Record<string, string | undefined>, exec: Exec = defaultExec, which: (c: string) => string | null = (c) => whichNow(c)): CuaProbe {
  return async () => {
    const bin = env.DUCTER_CUA_DRIVER || which("cua-driver") || (existsSync(CUA_APP_BIN) ? CUA_APP_BIN : "");
    if (!bin) return { missing: "cua-driver is not installed" };
    const v = await exec([bin, "--version"], 10_000);
    if (v.code !== 0) return { missing: `cua-driver at ${bin} does not run` };
    const version = firstVersion(v.out) || "unknown";
    const tools = await exec([bin, "list-tools"], 15_000);
    const names = new Set(tools.out.split("\n").map((l) => l.split(":")[0]!.trim()));
    if (REQUIRED_TOOLS.some((t) => !names.has(t))) return { missing: `cua-driver ${version} has no typed browser tools` };
    return { version };
  };
}

/** An AI agent's own browser tools ready on this machine (D130): Codex's, or Claude in Chrome connected. */
export function defaultNativeProbe(env: Record<string, string | undefined>, which: (c: string) => string | null = (c) => whichNow(c)): NativeBrowserProbe {
  return async () => {
    if (codexNative(env)) return "codex";
    return (await claudeInChromeConnected({ env, which })) ? "claude" : undefined;
  };
}

/** DUCTER_BROWSER pins 上网 on or off on this machine. */
export function webPinned(env: Record<string, string | undefined>): "on" | "off" | undefined {
  const v = (env.DUCTER_BROWSER ?? "").trim().toLowerCase();
  if (v === "0" || v === "off" || v === "false" || v === "no") return "off";
  if (v === "1" || v === "on" || v === "true" || v === "yes") return "on";
}

/**
 * 上网 / Browse the web on one computer (D130, D151), the same on the home and on a worker (D157):
 * the user's Chrome through an AI agent's own tools first; Ducter's own browser on a server (or
 * when asked for); cua-driver's browser on a Mac without native tools.
 */
export function webAbilityOf(p: {
  env: Record<string, string | undefined>;
  dataDir: string;
  cua: Awaited<ReturnType<CuaProbe>>;
  native: Awaited<ReturnType<NativeBrowserProbe>>;
  platform: string;
  browser?: { setup(): BrowserSetup };
}): DeviceAbility {
  const { env } = p;
  const pinned = webPinned(env);
  const savedOff = () => readAbilitySettings(p.dataDir).web === false;
  // DUCTER_BROWSER_DRIVER=cua: browser tasks use Ducter's own browser only (runner browser.ts).
  const cuaOnly = /^(cua|cua-driver)$/i.test((env.DUCTER_BROWSER_DRIVER ?? "").trim());
  // D151: on a server (Linux), or when asked for, Browse the web is Ducter's own browser.
  const ducterMode = !!p.browser && (p.platform === "linux" || /^ducter$/i.test((env.DUCTER_BROWSER_DRIVER ?? "").trim()));
  if (pinned === "off") return { id: "web", state: "unavailable", reason: "env_off" };
  // An AI agent's own browser is ready (D130): Browse the web works in the user's Chrome, no
  // cua-driver needed. detail names whose tools ("codex" | "claude").
  if (p.native && !cuaOnly) return { id: "web", state: pinned === "on" ? "on" : savedOff() ? "off" : "on", detail: p.native, where: "chrome" };
  if (ducterMode && !cuaOnly) {
    const s = p.browser!.setup();
    switch (s.state) {
      case "ready":
        return { id: "web", state: pinned === "on" || !savedOff() ? "on" : "off", detail: s.version, where: "ducter" };
      case "installing":
        return { id: "web", state: "on", where: "ducter", setup: "installing" };
      case "deps":
        return { id: "web", state: "unavailable", reason: s.why === "sandbox" ? "browser_sandbox" : "browser_deps", detail: s.command, where: "ducter" };
      case "failed":
        return { id: "web", state: "unavailable", reason: "browser_failed", detail: s.message, where: "ducter" };
      case "missing":
        return { id: "web", state: "off", where: "ducter" };
    }
  }
  if ("missing" in p.cua) {
    const old = /no typed browser tools|does not run/.test(p.cua.missing);
    return { id: "web", state: "unavailable", reason: old ? "cua_old" : "cua_missing", detail: p.cua.missing };
  }
  if (pinned === "on") return { id: "web", state: "on", detail: p.cua.version, where: "ducter" };
  return { id: "web", state: savedOff() ? "off" : "on", detail: p.cua.version, where: "ducter" };
}

/**
 * D157: a computer that doesn't sleep keeps long work going. A server or a desktop Mac does; a
 * laptop sleeps when its lid closes on battery (A3), unless it says otherwise.
 */
export const alwaysOnKind = (kind: DeviceKind) => kind === "server" || kind === "mini";

export function createDevicesView(o: DevicesOptions): DevicesView {
  const env = o.env ?? process.env;
  const exec = o.exec ?? defaultExec;
  const which = o.which ?? ((c: string) => whichNow(c));
  const now = o.now ?? Date.now;
  const cacheMs = o.cacheMs ?? 60_000;
  // D310: this computer by its name as a person reads it, and by its host name (what a pairing
  // from before D310 called it): a rename never takes either.
  const host = thisComputer(o.hostname);
  const hostAlias = thisHost(o.hostname);

  const probes: DeviceProbes = {
    cua: o.probes?.cua ?? defaultCuaProbe(env, exec, which),
    native: o.probes?.native ?? defaultNativeProbe(env, which),
    // The four first-wave harnesses (D85, harness-probe.ts).
    // Claude Code, Codex and (D371) DeepSeek Harness always show (each can be installed from here;
    // one not there waits in the socket); pi only once signed in, so a Mac without it reads as before.
    harnesses:
      o.probes?.harnesses ??
      (async () => (await probeHarnesses({ exec, which, env, dataDir: o.dataDir, ...(o.piBundled ? { piBundled: o.piBundled } : {}) })).filter((h) => (h.harness === "pi" ? h.loggedIn : true))),
    kind: o.probes?.kind ?? (() => localDeviceKind(exec)),
  };

  // Probe results are reused for cacheMs: harness CLIs can take seconds.
  type Cached = { at: number; cua: Awaited<ReturnType<CuaProbe>>; native: Awaited<ReturnType<NativeBrowserProbe>>; harnesses: Awaited<ReturnType<DeviceProbes["harnesses"]>>; kind: DeviceKind };
  let cached: Cached | undefined;
  let inflight: Promise<Cached> | undefined;
  // D440: the last harness reading that succeeded (refresh keeps it): a probe that fails never
  // reads as "nothing signed in", a re-probe never as "unknown"; unknown only before the first.
  let readHarnesses: Cached["harnesses"] | undefined;
  /** Who is installed and signed in: the part the partner's brain and a blind home are decided on. */
  const logins = (hs: Cached["harnesses"] | undefined) => (hs ? JSON.stringify(hs.map((h) => [h.harness, h.loggedIn, h.installed !== false])) : "");
  // D518: a refresh while a probe runs makes that probe stale (it may have read before the change):
  // its reading is not kept, and the next ask probes again after it instead of sharing it.
  let gen = 0;
  let inflightGen = -1;
  const local = async (): Promise<Cached> => {
    if (cached && now() - cached.at < cacheMs) return cached;
    if (inflight && inflightGen === gen) return inflight;
    const earlier = inflight;
    const g = gen;
    inflightGen = g;
    let p: Promise<Cached> | undefined;
    p = (async () => {
      if (earlier) await earlier.catch(() => undefined);
      const [cua, native, read, kind] = await Promise.all([
        probes.cua().catch((e) => ({ missing: String((e as Error).message ?? e) })),
        probes.native().catch(() => undefined),
        probes.harnesses().catch(() => undefined),
        probes.kind().catch(() => "laptop" as DeviceKind),
      ]);
      const before = logins(readHarnesses);
      if (read) readHarnesses = read;
      const got: Cached = { at: now(), cua, native, harnesses: read ?? readHarnesses ?? [], kind };
      if (g === gen) cached = got;
      // D440: a reading that changed who can think is news (the first one at start too): the brain
      // hold sees the home turn blind, and so sees it turn able again and answers what waited.
      if (read && logins(read) !== before) changed();
      if (inflight === p) inflight = undefined;
      return got;
    })();
    inflight = p;
    return p;
  };

  const envPinned = () => webPinned(env);
  const webAbility = (cua: Cached["cua"], native: Cached["native"]): DeviceAbility =>
    webAbilityOf({ env, dataDir: o.dataDir, cua, native, platform: o.platform ?? osPlatform(), ...(o.browser ? { browser: o.browser } : {}) });

  const clients = () => o.auth.list().filter((d) => d.kind === "client");

  const reach = (): Reach => {
    const live = o.connected?.() ?? new Set<string>();
    // D228: the person's tunnel writes the address where `ducter domain` does, once it answers.
    const address = publicAddress(o.dataDir, env);
    const anywhere = o.anywhere?.view() ?? (address ? { how: "own" as const, state: "on" as const } : undefined);
    const ways = o.ways?.();
    return {
      ...(address ? { address } : {}),
      ...(anywhere ? { anywhere } : {}),
      ...(ways ? { ways } : {}),
      ...(o.homeKey ? { home: { key: o.homeKey.key, fp: o.homeKey.fp } } : {}),
      clients: clients().map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        connected: live.has(d.id),
        ...((v) => (v && live.has(d.id) ? { via: { kind: v.kind, sealed: v.sealed } } : {}))(o.viaOf?.(d.id)),
        ...(d.lastSeenAt ? { lastSeen: d.lastSeenAt } : {}),
        ...deviceForm(d), // D155: a CLI says so, and which computer it belongs to
        ...(d.shape ? { shape: d.shape } : {}), // D263: a tablet or a foldable gets its own clay
        ...((): { handset?: import("@ducter/protocol").HandsetView } => {
          const h = o.handsets?.view(d.id, d.platform ?? "");
          return h ? { handset: h } : {};
        })(),
      })),
    };
  };

  const later = (id: AbilityId): DeviceAbility => ({ id, state: "later" });

  // D156: latest per channel, standing and any update under way, on every device's agents.
  const agentsView = (id: string, list: DeviceHarness[]) => {
    const withVersions = o.agents?.()?.view(id, list) ?? list;
    return o.mem?.()?.view(id, withVersions) ?? withVersions; // D169
  };

  async function frame(): Promise<DevicesFrame> {
    const me = await local();
    // D228: on = an address from outside (set up some other way, or the person's own tunnel, also
    // while it starts or fails to); being set up is not on yet.
    const av = o.anywhere?.view();
    const remoteOn = !!publicAddress(o.dataDir, env) || (!!av && av.state !== "setup" && av.state !== "off");
    const home: DeviceView = {
      id: "local",
      name: homeName(o.dataDir) ?? host,
      kind: me.kind,
      home: true,
      state: "awake", // this answer comes from it
      alwaysOn: alwaysOnKind(me.kind),
      harnesses: agentsView("local", (o.agentSetup?.()?.decorate(me.harnesses) ?? me.harnesses).map((h) => deviceHarness(h))),
      abilities: [webAbility(me.cua, me.native), (await o.computer?.ability().catch(() => undefined)) ?? later("computer"), { id: "remote", state: remoteOn ? "on" : "off" }, o.ownPhone?.ability() ?? later("phone"), o.call?.() ?? { id: "call", state: "off" }],
      ...(o.self ? { version: o.self.version, platform: o.self.platform } : {}),
      ...((t) => (t?.count ? { tidied: t } : {}))(o.tidied?.("local")),
      ...((r) => (r ? { resources: r } : {}))(o.resources?.()),
    };
    const up = o.updates?.();
    const homeUpdate = o.self ? up?.view("local", o.self.version, o.self.how) : undefined;
    if (homeUpdate) home.update = homeUpdate;
    const online = new Map(o.workers.online().map((w) => [w.deviceId, w]));
    const away = o.workers.away();
    const workers: DeviceView[] = o.auth
      .list()
      .filter((d) => d.kind === "worker")
      .map((d) => {
        const on = online.get(d.id);
        const gone = away.get(d.id);
        const hello = on?.hello ?? gone?.hello;
        const state = on?.hello ? "awake" : gone?.asleep ? "asleep" : "unreachable";
        const lastSeen = state === "awake" ? undefined : (gone?.lastSeen ?? d.lastSeenAt);
        const kind = hello?.kind === "laptop" || hello?.kind === "mini" || hello?.kind === "server" ? hello.kind : kindFromPlatform(hello?.os ?? d.platform);
        // The paired name, which the person can change (D84); a hello never renames a device.
        if (on && on.name !== d.name) o.workers.renamed(d.id, d.name);
        return {
          id: d.id,
          name: d.name,
          kind,
          home: false,
          state,
          ...(lastSeen ? { lastSeen } : {}),
          ...(hello?.version ? { version: hello.version } : {}),
          ...(d.platform ? { platform: d.platform } : {}),
          ...(d.computer ? { computer: d.computer } : {}),
          ...((): { update?: DeviceView["update"] } => {
            const u = up?.view(d.id, hello?.version, hello?.how === "self" || hello?.how === "app" || hello?.how === "source" ? hello.how : "manual", { asksApp: Boolean(hello?.asksApp) });
            return u ? { update: u } : {};
          })(),
          harnesses: agentsView(
            d.id,
            (hello?.harnesses ?? []).map((h) =>
              deviceHarness({
                harness: h.id,
                installed: h.installed,
                loggedIn: h.loggedIn,
                ...(h.version ? { version: h.version } : {}),
                ...(h.how ? { how: h.how as AgentHow } : {}),
                // D503: whose account it is there, as the worker's fingerprint (an older Ducter says none).
                ...(h.account ? { account: h.account } : {}),
                // D363: what the worker says of putting it there and signing it in (an older Ducter says neither).
                ...(h.installable && !h.installed ? { installable: true } : {}),
                ...(h.setup ? { setup: h.setup } : {}),
                ...(h.login ? { login: h.login } : {}),
                // D549: it won't run as root, and Ducter runs as root there.
                ...(h.trouble ? { trouble: h.trouble } : {}),
              }),
            ),
          ),
          // D157: a worker browses with its own browsers and says how in its hello; a Ducter
          // there from before that says nothing, so its card asks for an update.
          // D234, D235: 用手机 and 用电脑 on a worker Mac are that Mac's own, as it says them (a
          // Ducter there from before says neither: they stay 以后会有 until it is updated).
          abilities: [hello?.abilities?.find((a) => a.id === "web") ?? { id: "web", state: "unavailable", reason: "worker_old" }, hello?.abilities?.find((a) => a.id === "computer") ?? later("computer"), hello?.abilities?.find((a) => a.id === "phone") ?? later("phone")], // D199: no 打电话 here (the home's)
          alwaysOn: hello?.alwaysOn ?? alwaysOnKind(kind),
          ...(on?.via ? { via: { kind: on.via.kind, sealed: on.via.sealed } } : {}),
          // D366: Nowledge Mem there, as it says it; only for someone whose home has Mem (never a reason to get it, D169 (6)).
          ...(hello?.mem && o.memOn?.() ? { mem: { ...hello.mem, ...(o.memCarried?.() ? { carried: true as const } : {}) } } : {}),
          // D377: the person's own agents' records there: only while looking is on, only with records there or a yes.
          ...(hello?.records && o.recordsOn?.() && (hello.records.state === "on" || hello.records.agents?.length) ? { records: hello.records } : {}),
          ...((t) => (t?.count ? { tidied: t } : {}))(o.tidied?.(d.id)),
          // D538: what it has and has free, from its own heartbeat, only while it is connected.
          ...(on && hello?.resources ? { resources: hello.resources } : {}),
        } satisfies DeviceView;
      });
    const devices = [home, ...workers];
    const ua = o.updateAll?.()?.view(devices);
    return { t: "devices", devices, reach: reach(), ...(ua ? { updateAll: ua } : {}) };
  }

  const fns = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      for (const fn of fns) fn();
    }, 50);
  };
  const offWorkers = o.workers.onChange(changed);
  const offBrowser = o.browser?.onChange(changed);
  const offPhone = o.ownPhone?.onChange(changed);
  const offAnywhere = o.anywhere?.onChange(changed);
  const offHandsets = o.handsets?.onChange(changed);

  async function setAbility(device: string, ability: AbilityId, on: boolean, named?: { token: string; hostname: string }): Promise<AbilityResult> {
    const res = (ok: boolean, reason?: AbilityReason, detail?: string): AbilityResult => ({
      t: "ability_result",
      device,
      ability,
      on,
      ok,
      ...(reason ? { reason } : {}),
      ...(detail ? { detail } : {}),
    });
    let f = await frame();
    let d = f.devices.find((x) => x.id === device || x.name === device);
    if (!d) return res(false, "unknown_device");
    let a = d.abilities.find((x) => x.id === ability);
    // cua-driver may have been installed or updated a moment ago (the app's own setup): look
    // again before saying no, instead of answering from a minute-old probe.
    if (a?.state === "unavailable" && (a.reason === "cua_missing" || a.reason === "cua_old") && d.home) {
      cached = undefined;
      f = await frame();
      d = f.devices.find((x) => x.id === device || x.name === device) ?? d;
      a = d.abilities.find((x) => x.id === ability);
      if (a?.state !== "unavailable") changed();
    }
    if (!a || a.state === "later") return res(false, "failed");
    // D235: 用电脑 is that Mac's: on a worker it is saved there; added without macOS's two switches,
    // it is on and its card says what to turn on (computer_permissions) until they are.
    if (ability === "computer") {
      if (a.state === "unavailable" && a.reason !== "computer_permissions" && on) return res(false, a.reason ?? "failed", a.detail);
      if (!d.home) {
        const link = o.workers.link(d.id);
        if (!link?.online()) return res(false, "offline");
        try {
          const r = await link.call<{ ok: boolean; reason?: AbilityReason; detail?: string }>("ability", { id: "computer", on }, 30_000);
          changed();
          return res(!!r?.ok, r?.ok ? undefined : (r?.reason ?? "failed"), r?.detail);
        } catch (e) {
          return res(false, "failed", (e as Error).message);
        }
      }
      writeAbilitySettings(o.dataDir, { computer: on });
      o.computer?.refresh();
      changed();
      return res(true);
    }
    // D157: 上网 on a worker is that computer's: it adds or removes it there (and installs
    // Ducter's browser there when it is the one), then says what it is now.
    if (ability === "web" && !d.home) {
      const link = o.workers.link(d.id);
      if (!link?.online()) return res(false, "offline");
      if (a.reason === "worker_old") return res(false, "worker_old");
      try {
        const r = await link.call<{ ok: boolean; reason?: AbilityReason; detail?: string }>("ability", { id: "web", on }, 30_000);
        changed();
        return res(!!r?.ok, r?.ok ? undefined : (r?.reason ?? "failed"), r?.detail);
      } catch (e) {
        return res(false, "failed", (e as Error).message);
      }
    }
    // D151: adding Browse the web on a server installs Ducter's browser (again, after a failure or
    // once the missing libraries are there). The choice is saved at once; the frame says
    // 正在准备 / Getting it ready until it is.
    if (ability === "web" && on && d.home && a.where === "ducter" && (a.state === "off" || a.reason === "browser_deps" || a.reason === "browser_sandbox" || a.reason === "browser_failed")) {
      if (envPinned() === "off") return res(false, "env_off");
      writeAbilitySettings(o.dataDir, { web: true });
      if (o.browser!.setup().state !== "ready") void o.browser!.install();
      changed();
      return res(true);
    }
    if (a.state === "unavailable") return res(false, a.reason ?? "failed", a.detail);
    switch (ability) {
      case "web":
        if (envPinned()) return res(false, "env_off");
        writeAbilitySettings(o.dataDir, { web: on });
        changed();
        return res(true);
      case "call":
        // D199: a calling connection is added (and removed) in Settings › Accounts, where its
        // sign-in runs; the clients route there, never here.
        return res(false, "failed");
      case "phone":
        // D217: adding Ducter's phone is the install sheet (phone_install, with the licenses
        // accepted); removing it is 抹掉 / Erase (phone_erase). Never a bare switch.
        return res(false, "failed");
      case "remote": {
        // D228: on the home, From outside turns the person's tunnel on or off (on without one made
        // yet answers no_address: the card offers the guided setup). Paired devices stay paired
        // either way (they are disconnected one by one, never by this switch).
        if (!d.home || !o.anywhere) return res(false, "home_only");
        const v = o.anywhere.view();
        if (v?.how === "own") return on ? res(true) : res(false, "own_address");
        if (!on) {
          await o.anywhere.turnOff();
          return res(true);
        }
        const r = await o.anywhere.turnOn(named);
        return res(r.ok, r.ok ? undefined : r.reason === "own_address" || r.reason === "no_address" ? r.reason : "failed", r.detail ?? r.reason);
      }
    }
    return res(false, "failed");
  }

  async function pairCode(): Promise<PairCodeFrame> {
    const { code, expiresAt } = o.auth.createCode(); // one code for a phone, an app window or a computer (D83)
    const address = publicAddress(o.dataDir, env);
    const link = address ? `${address}/pair#${pairFragment(code, o.homeKey?.fp)}` : undefined;
    return {
      t: "pair_code",
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      ...(address ? { address, link, qr: qrRows(link!) } : {}),
    };
  }

  function rename(device: string, name: string): RenameResult {
    const want = name.trim().toLowerCase();
    const live = o.auth.list();
    if (device === "local") {
      // D155: the home's name is a display name. It still answers to its host name and to
      // "local"; it never takes a paired device's name (a task placed by that name goes there).
      const next = name.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 64);
      if (!next) return { t: "rename_result", device: "local", ok: false, reason: "empty" };
      if (want === "local" || live.some((d) => d.name.toLowerCase() === want)) return { t: "rename_result", device: "local", ok: false, reason: "name_taken" };
      if (next === host) rmSync(homeNameFile(o.dataDir), { force: true });
      else writeFileSync(homeNameFile(o.dataDir), next + "\n", { mode: 0o600 });
      changed();
      return { t: "rename_result", device: "local", ok: true, name: next };
    }
    // The machine Ducter runs on answers to its own name, its display name and "local": a task
    // placed there must never land on another computer by a rename.
    const shown = homeName(o.dataDir)?.toLowerCase();
    if (want === "local" || sameComputer(name, host) || sameComputer(name, hostAlias) || want === shown) return { t: "rename_result", device, ok: false, reason: "name_taken" };
    const r = o.auth.rename(device, name);
    if ("error" in r) return { t: "rename_result", device, ok: false, reason: r.error };
    o.workers.renamed(r.device.id, r.device.name);
    changed();
    return { t: "rename_result", device: r.device.id, ok: true, name: r.device.name };
  }

  function disconnect(device: string): DisconnectResult {
    if (device === "local") return { t: "disconnect_result", device, ok: false, reason: "home" };
    const gone = o.auth.revoke(device);
    if (!gone.length) return { t: "disconnect_result", device, ok: false, reason: "unknown_device" };
    // Its live socket is closed by the next sweep (workers.ts splitSockets, ≤ 10 s).
    for (const d of gone) o.onDisconnect?.(d.id);
    changed();
    return { t: "disconnect_result", device: gone[0]!.id, ok: true };
  }

  return {
    frame,
    setAbility,
    pairCode,
    rename,
    disconnect,
    shaped(id, shape) {
      // A device never changes shape: a page's "phone" (Chrome hides an Android model) never
      // undoes a tablet or foldable its app's model said.
      if (shape === "phone" && o.auth.list().find((d) => d.id === id)?.shape) return;
      if (o.auth.setShape?.(id, shape)) changed();
    },
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    changed,
    refresh: () => {
      cached = undefined;
      gen++;
      o.computer?.refresh();
    },
    harnessesNow() {
      if (!cached || now() - cached.at >= cacheMs) void local().catch(() => {});
      // While a refresh probes again, the last reading stands: "unknown" in between would read as
      // able to think and let a blind home's kept messages go before any agent is there (D440).
      return readHarnesses ? (cached?.harnesses ?? readHarnesses) : undefined;
    },
    stop() {
      offWorkers();
      offBrowser?.();
      offPhone?.();
      offAnywhere?.();
      offHandsets?.();
      if (timer) clearTimeout(timer);
      fns.clear();
    },
  };
}
