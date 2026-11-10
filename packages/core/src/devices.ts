// 你的设备和本事 / Your devices and abilities (D43, D51, design/flows/A-setup-devices.md): what each
// device is, whether it is awake, which AI accounts are signed in on it, and which abilities it
// has. Only what the server knows: probes on this machine (cua-driver, harness logins, a
// battery = a laptop), and what workers said in their hello. No allowance is ever estimated.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname as osHostname, platform as osPlatform } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";
import { deviceHarness, type AbilityId, type AgentHow, type AbilityReason, type DeviceAbility, type DeviceHarness, type DeviceKind, type DeviceView, type Reach, type ServerFrame } from "@ducter/protocol";
import { readAbilitySettings, writeAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import { claudeInChromeConnected, codexNative } from "@ducter/protocol/src/native-browser.ts";
import { deviceForm, type DeviceAuth } from "./auth.ts";
import type { Workers } from "./workers.ts";
import { probeHarnesses } from "./harness-probe.ts";
import type { BrowserSetup } from "./browser/index.ts";

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
}

export interface DevicesOptions {
  dataDir: string;
  auth: DeviceAuth;
  workers: Workers;
  env?: Record<string, string | undefined>;
  probes?: Partial<DeviceProbes>;
  exec?: Exec;
  which?: (cmd: string) => string | null;
  hostname?: string;
  /** Client device ids with a live socket right now (ws.ts). */
  connected?: () => Set<string>;
  /** How long probe results are reused (default 60 s); `refresh` drops them. */
  cacheMs?: number;
  now?: () => number;
  /** D148: version and update state per device. */
  updates?: () => import("./updates.ts").Updates | undefined;
  /** The home's own Ducter version and how it updates. */
  self?: { version: string; how: import("@ducter/protocol").UpdateHow; platform: string };
  /** D151: Ducter's own browser (a server's 上网): whether it is installed, and installing it. */
  browser?: { setup(): BrowserSetup; install(): Promise<unknown>; onChange(fn: () => void): () => void };
  /** The machine Ducter lives on (default: this one). */
  platform?: string;
  /** D156: each device's AI agents: latest per channel, standing, an update under way. */
  agents?: () => import("./agents.ts").AgentUpdates | undefined;
  /** D169: Nowledge Mem's plugin line on each device's agents. */
  mem?: () => import("./mem-plugins.ts").MemPlugins | undefined;
  /** D156: the pi inside this Ducter (harness-probe bundledPiVersion). */
  piBundled?: () => string | undefined;
  /** D155 + D159: a device was disconnected (its phone's notifications stop at once). */
  onDisconnect?: (deviceId: string) => void;
  /** D199: 打电话 on the home, from the calling connection (`callAbility`); off when absent. */
  call?: () => DeviceAbility;
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
  setAbility(device: string, ability: AbilityId, on: boolean): Promise<AbilityResult>;
  pairCode(): Promise<PairCodeFrame>;
  /** 改名字 / Rename any device (D84); the home's is a display name beside its host name (D155). */
  rename(device: string, name: string): RenameResult;
  /** 断开 / Disconnect a paired device (D148 (11)): the same revoke as `ducter devices disconnect`. */
  disconnect(device: string): DisconnectResult;
  onChange(fn: () => void): () => void;
  /** Something changed (a device paired, a socket came or went): tell the subscribers. */
  changed(): void;
  /** Forget cached probes (the next frame probes again). */
  refresh(): void;
  /** This machine's AI agents as last probed (undefined before the first probe); a stale
   *  result starts a fresh probe in the background. */
  harnessesNow(): { harness: string; loggedIn: boolean }[] | undefined;
  stop(): void;
}

const defaultExec: Exec = async (argv, timeoutMs = 15_000) => {
  try {
    // Both streams: `codex login status` answers on stderr.
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
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
export function defaultCuaProbe(env: Record<string, string | undefined>, exec: Exec = defaultExec, which: (c: string) => string | null = (c) => Bun.which(c)): CuaProbe {
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
export function defaultNativeProbe(env: Record<string, string | undefined>, which: (c: string) => string | null = (c) => Bun.which(c)): NativeBrowserProbe {
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
  const which = o.which ?? ((c: string) => Bun.which(c));
  const now = o.now ?? Date.now;
  const cacheMs = o.cacheMs ?? 60_000;
  const host = (o.hostname ?? osHostname()).replace(/\.local$/, "");

  const probes: DeviceProbes = {
    cua: o.probes?.cua ?? defaultCuaProbe(env, exec, which),
    native: o.probes?.native ?? defaultNativeProbe(env, which),
    // The four first-wave harnesses (D85, harness-probe.ts).
    // Claude Code and Codex always show (one can be installed from here); pi and DeepSeek Harness
    // only once set up, so a Mac without them reads as before.
    harnesses:
      o.probes?.harnesses ??
      (async () => (await probeHarnesses({ exec, which, env, dataDir: o.dataDir, ...(o.piBundled ? { piBundled: o.piBundled } : {}) })).filter((h) => (h.harness === "pi" ? h.loggedIn : h.harness === "deepseek-harness" ? h.installed : true))),
    kind: o.probes?.kind ?? (() => localDeviceKind(exec)),
  };

  // Probe results are reused for cacheMs: harness CLIs can take seconds.
  type Cached = { at: number; cua: Awaited<ReturnType<CuaProbe>>; native: Awaited<ReturnType<NativeBrowserProbe>>; harnesses: Awaited<ReturnType<DeviceProbes["harnesses"]>>; kind: DeviceKind };
  let cached: Cached | undefined;
  let inflight: Promise<Cached> | undefined;
  const local = async (): Promise<Cached> => {
    if (cached && now() - cached.at < cacheMs) return cached;
    inflight ??= (async () => {
      const [cua, native, harnesses, kind] = await Promise.all([
        probes.cua().catch((e) => ({ missing: String((e as Error).message ?? e) })),
        probes.native().catch(() => undefined),
        probes.harnesses().catch(() => [] as Awaited<ReturnType<DeviceProbes["harnesses"]>>),
        probes.kind().catch(() => "laptop" as DeviceKind),
      ]);
      cached = { at: now(), cua, native, harnesses, kind };
      inflight = undefined;
      return cached;
    })();
    return inflight;
  };

  const envPinned = () => webPinned(env);
  const webAbility = (cua: Cached["cua"], native: Cached["native"]): DeviceAbility =>
    webAbilityOf({ env, dataDir: o.dataDir, cua, native, platform: o.platform ?? osPlatform(), ...(o.browser ? { browser: o.browser } : {}) });

  const clients = () => o.auth.list().filter((d) => d.kind === "client");

  const reach = (): Reach => {
    const live = o.connected?.() ?? new Set<string>();
    const address = publicAddress(o.dataDir, env);
    return {
      ...(address ? { address } : {}),
      clients: clients().map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        connected: live.has(d.id),
        ...(d.lastSeenAt ? { lastSeen: d.lastSeenAt } : {}),
        ...deviceForm(d), // D155: a CLI says so, and which computer it belongs to
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
    const remoteOn = clients().length > 0;
    const home: DeviceView = {
      id: "local",
      name: homeName(o.dataDir) ?? host,
      kind: me.kind,
      home: true,
      state: "awake", // this answer comes from it
      alwaysOn: alwaysOnKind(me.kind),
      harnesses: agentsView("local", me.harnesses.map((h) => deviceHarness(h))),
      abilities: [webAbility(me.cua, me.native), later("computer"), { id: "remote", state: remoteOn ? "on" : "off" }, later("phone"), o.call?.() ?? { id: "call", state: "off" }],
      ...(o.self ? { version: o.self.version, platform: o.self.platform } : {}),
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
            (hello?.harnesses ?? []).map((h) => deviceHarness({ harness: h.id, installed: h.installed, loggedIn: h.loggedIn, ...(h.version ? { version: h.version } : {}), ...(h.how ? { how: h.how as AgentHow } : {}) })),
          ),
          // D157: a worker browses with its own browsers and says how in its hello; a Ducter
          // there from before that says nothing, so its card asks for an update.
          abilities: [hello?.abilities?.find((a) => a.id === "web") ?? { id: "web", state: "unavailable", reason: "worker_old" }, later("computer"), later("phone")], // D199: no 打电话 here (the home's)
          alwaysOn: hello?.alwaysOn ?? alwaysOnKind(kind),
        } satisfies DeviceView;
      });
    return { t: "devices", devices: [home, ...workers], reach: reach() };
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

  async function setAbility(device: string, ability: AbilityId, on: boolean): Promise<AbilityResult> {
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
      case "remote":
        // On = a device pairs with a code (pair_code); off would disconnect every paired client,
        // which is `ducter devices disconnect` per device, not a switch here.
        return res(false, "failed");
    }
    return res(false, "failed");
  }

  async function pairCode(): Promise<PairCodeFrame> {
    const { code, expiresAt } = o.auth.createCode(); // one code for a phone, an app window or a computer (D83)
    const address = publicAddress(o.dataDir, env);
    const link = address ? `${address}/pair#c=${code}` : undefined;
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
    // The machine Ducter lives on answers to its own name, its display name and "local": a task
    // placed there must never land on another computer by a rename.
    const shown = homeName(o.dataDir)?.toLowerCase();
    if (want === "local" || want === host.toLowerCase() || want === shown) return { t: "rename_result", device, ok: false, reason: "name_taken" };
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
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    changed,
    refresh: () => void (cached = undefined),
    harnessesNow() {
      if (!cached || now() - cached.at >= cacheMs) void local().catch(() => {});
      return cached?.harnesses;
    },
    stop() {
      offWorkers();
      offBrowser?.();
      if (timer) clearTimeout(timer);
      fns.clear();
    },
  };
}
