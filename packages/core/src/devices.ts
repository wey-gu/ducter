// 你的设备和本事 / Your devices and abilities (D43, D51, design/flows/A-setup-devices.md): what each
// device is, whether it is awake, which AI accounts are signed in on it, and which abilities it
// has. Only what the server knows: probes on this machine (cua-driver, harness logins, a
// battery = a laptop), and what workers said in their hello. No allowance is ever estimated.
import { existsSync, readFileSync } from "node:fs";
import { hostname as osHostname, platform as osPlatform } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";
import { deviceHarness, type AbilityId, type AbilityReason, type DeviceAbility, type DeviceHarness, type DeviceKind, type DeviceView, type Reach, type ServerFrame } from "@ducter/protocol";
import { readAbilitySettings, writeAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import type { DeviceAuth } from "./auth.ts";
import type { Workers } from "./workers.ts";
import { probeHarnesses } from "./harness-probe.ts";

export type DevicesFrame = Extract<ServerFrame, { t: "devices" }>;
export type AbilityResult = Extract<ServerFrame, { t: "ability_result" }>;
export type PairCodeFrame = Extract<ServerFrame, { t: "pair_code" }>;
export type RenameResult = Extract<ServerFrame, { t: "rename_result" }>;

export type Exec = (argv: string[], timeoutMs?: number) => Promise<{ code: number; out: string }>;

/** The browser driver on this machine: its version, or why there is none. */
export type CuaProbe = () => Promise<{ version: string } | { missing: string }>;

export interface DeviceProbes {
  cua: CuaProbe;
  /** Harness logins on this machine (as `ducter doctor` checks them). */
  harnesses(): Promise<DeviceHarness[]>;
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
}

export interface DevicesView {
  frame(): Promise<DevicesFrame>;
  setAbility(device: string, ability: AbilityId, on: boolean): Promise<AbilityResult>;
  pairCode(): Promise<PairCodeFrame>;
  /** 改名字 / Rename a paired device (D84). The machine Ducter lives on keeps its host name. */
  rename(device: string, name: string): RenameResult;
  onChange(fn: () => void): () => void;
  /** Something changed (a device paired, a socket came or went): tell the subscribers. */
  changed(): void;
  /** Forget cached probes (the next frame probes again). */
  refresh(): void;
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

export function createDevicesView(o: DevicesOptions): DevicesView {
  const env = o.env ?? process.env;
  const exec = o.exec ?? defaultExec;
  const which = o.which ?? ((c: string) => Bun.which(c));
  const now = o.now ?? Date.now;
  const cacheMs = o.cacheMs ?? 60_000;
  const host = (o.hostname ?? osHostname()).replace(/\.local$/, "");

  const probes: DeviceProbes = {
    cua:
      o.probes?.cua ??
      (async () => {
        const bin = env.DUCTER_CUA_DRIVER || which("cua-driver") || (existsSync(CUA_APP_BIN) ? CUA_APP_BIN : "");
        if (!bin) return { missing: "cua-driver is not installed" };
        const v = await exec([bin, "--version"], 10_000);
        if (v.code !== 0) return { missing: `cua-driver at ${bin} does not run` };
        const version = firstVersion(v.out) || "unknown";
        const tools = await exec([bin, "list-tools"], 15_000);
        const names = new Set(tools.out.split("\n").map((l) => l.split(":")[0]!.trim()));
        if (REQUIRED_TOOLS.some((t) => !names.has(t))) return { missing: `cua-driver ${version} has no typed browser tools` };
        return { version };
      }),
    // The four first-wave harnesses (D85, harness-probe.ts).
    // Claude Code and Codex always show (one can be installed from here); pi and DeepSeek Harness
    // only once set up, so a Mac without them reads as before.
    harnesses:
      o.probes?.harnesses ??
      (async () => (await probeHarnesses({ exec, which, env, dataDir: o.dataDir })).filter((h) => (h.harness === "pi" ? h.loggedIn : h.harness === "deepseek-harness" ? h.installed : true))),
    kind: o.probes?.kind ?? (() => localDeviceKind(exec)),
  };

  // Probe results are reused for cacheMs: harness CLIs can take seconds.
  type Cached = { at: number; cua: Awaited<ReturnType<CuaProbe>>; harnesses: DeviceHarness[]; kind: DeviceKind };
  let cached: Cached | undefined;
  let inflight: Promise<Cached> | undefined;
  const local = async (): Promise<Cached> => {
    if (cached && now() - cached.at < cacheMs) return cached;
    inflight ??= (async () => {
      const [cua, harnesses, kind] = await Promise.all([
        probes.cua().catch((e) => ({ missing: String((e as Error).message ?? e) })),
        probes.harnesses().catch(() => [] as DeviceHarness[]),
        probes.kind().catch(() => "laptop" as DeviceKind),
      ]);
      cached = { at: now(), cua, harnesses, kind };
      inflight = undefined;
      return cached;
    })();
    return inflight;
  };

  const envPinned = (): "on" | "off" | undefined => {
    const v = (env.DUCTER_BROWSER ?? "").trim().toLowerCase();
    if (v === "0" || v === "off" || v === "false" || v === "no") return "off";
    if (v === "1" || v === "on" || v === "true" || v === "yes") return "on";
  };

  const webAbility = (cua: Cached["cua"]): DeviceAbility => {
    const pinned = envPinned();
    if (pinned === "off") return { id: "web", state: "unavailable", reason: "env_off" };
    if ("missing" in cua) {
      const old = /no typed browser tools|does not run/.test(cua.missing);
      return { id: "web", state: "unavailable", reason: old ? "cua_old" : "cua_missing", detail: cua.missing };
    }
    if (pinned === "on") return { id: "web", state: "on", detail: cua.version };
    return { id: "web", state: readAbilitySettings(o.dataDir).web === false ? "off" : "on", detail: cua.version };
  };

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
      })),
    };
  };

  const later = (id: AbilityId): DeviceAbility => ({ id, state: "later" });

  async function frame(): Promise<DevicesFrame> {
    const me = await local();
    const remoteOn = clients().length > 0;
    const home: DeviceView = {
      id: "local",
      name: host,
      kind: me.kind,
      home: true,
      state: "awake", // this answer comes from it
      harnesses: me.harnesses.map((h) => deviceHarness(h)),
      abilities: [webAbility(me.cua), later("computer"), { id: "remote", state: remoteOn ? "on" : "off" }, later("phone"), later("call")],
    };
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
          harnesses: (hello?.harnesses ?? []).map((h) => deviceHarness({ harness: h.id, installed: h.installed, loggedIn: h.loggedIn })),
          // Browser places run on the machine Ducter lives on only, for now (runner.ts).
          abilities: [{ id: "web", state: "unavailable", reason: "home_only" }, later("computer"), later("phone"), later("call")],
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
    if (a.state === "unavailable") return res(false, a.reason ?? "failed", a.detail);
    switch (ability) {
      case "web":
        if (envPinned()) return res(false, "env_off");
        writeAbilitySettings(o.dataDir, { web: on });
        changed();
        return res(true);
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
    if (device === "local") return { t: "rename_result", device, ok: false, reason: "home" };
    // The machine Ducter lives on answers to its own name and to "local": a task placed there
    // must never land on another computer by a rename.
    const want = name.trim().toLowerCase();
    if (want === "local" || want === host.toLowerCase()) return { t: "rename_result", device, ok: false, reason: "name_taken" };
    const r = o.auth.rename(device, name);
    if ("error" in r) return { t: "rename_result", device, ok: false, reason: r.error };
    o.workers.renamed(r.device.id, r.device.name);
    changed();
    return { t: "rename_result", device: r.device.id, ok: true, name: r.device.name };
  }

  return {
    frame,
    setAbility,
    pairCode,
    rename,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    changed,
    refresh: () => void (cached = undefined),
    stop() {
      offWorkers();
      if (timer) clearTimeout(timer);
      fns.clear();
    },
  };
}
