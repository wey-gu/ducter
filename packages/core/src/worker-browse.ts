// D157: a worker browses for tasks with its own browsers, as the home does (D130 native first on a
// Mac: the agent's own tools in the user's Chrome; cua-driver's browser; D151 Ducter's own browser
// on a server). This is the worker's side: what it says 上网 is (in its hello and after a change),
// adding or removing 上网 from its card on the home, installing Ducter's browser here, and the
// ops through which the home drives that browser (browser/remote.ts). Sign-ins stay here.
import { platform as osPlatform } from "node:os";
import type { DeviceAbility, DeviceKind } from "@ducter/protocol";
import type { DucterBrowserPort } from "@ducter/protocol/src/internal.ts";
import { writeAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import { alwaysOnKind, defaultCuaProbe, defaultNativeProbe, webAbilityOf, webPinned, type CuaProbe, type NativeBrowserProbe } from "./devices.ts";
import { findChrome, installChrome, type InstallResult } from "./browser/chrome.ts";
import type { BrowserSetup } from "./browser/index.ts";
import { workerBrowserOps } from "./browser/remote.ts";
import { readAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import { computerAbilityOf } from "./computer/ability.ts";
import { defaultPermsProbe, localCuaCall, openGrantGuide, type CuaCall, type PermsProbe } from "./computer/driver.ts";
import { blockedMacApp } from "./computer/gate.ts";
import type { PhoneHost } from "./android/host.ts";
import { workerPhoneOps } from "./android/remote.ts";

/** D235: the cua-driver tools the home may call on this Mac for a task, and nothing else. */
const COMPUTER_TOOLS = new Set(["list_apps", "list_windows", "get_window_state", "launch_app", "click", "double_click", "type_text", "press_key", "hotkey", "scroll", "invoke_menu"]);

export interface WorkerBrowse {
  /** 上网 here, now (probes again each time). */
  abilities(): Promise<DeviceAbility[]>;
  alwaysOn(kind: DeviceKind): boolean;
  /** The runner's browser options on this worker (Ducter's own browser, when it is the one). */
  ducter: DucterBrowserPort;
  /** The worker host's extra ops (driving Ducter's browser here from the home). */
  ops: Record<string, (a: any) => Promise<unknown>>;
  /** 上网 (or D235's 用电脑) added or removed on this computer's card. */
  set(id: "web" | "computer", on: boolean): Promise<{ ok: boolean; reason?: string; detail?: string }>;
  stopAll(): Promise<void>;
}

export function createWorkerBrowse(o: {
  dataDir: string;
  /** Sends a frame up to the home (the socket that is up now). */
  send(frame: object): void;
  env?: Record<string, string | undefined>;
  platform?: string;
  /** Test seams. */
  cua?: CuaProbe;
  native?: NativeBrowserProbe;
  install?: () => Promise<InstallResult>;
  find?: () => { path: string; version?: string } | undefined;
  /** D234: Ducter's phone on this Mac (absent: none here). */
  phone?: PhoneHost;
  /** D235 seams: cua-driver's tool calls and macOS's two switches here. */
  cuaCall?: CuaCall;
  perms?: PermsProbe;
  grant?: () => Promise<{ ok: boolean; reason?: string; message?: string }>;
}): WorkerBrowse {
  const env = o.env ?? process.env;
  const platform = o.platform ?? osPlatform();
  const cua = o.cua ?? defaultCuaProbe(env);
  const native = o.native ?? defaultNativeProbe(env);
  const find = o.find ?? (() => findChrome(o.dataDir, { env, platform }));
  let installing: Promise<InstallResult> | undefined;
  let last: InstallResult | undefined;
  const setup = (): BrowserSetup => {
    if (installing) return { state: "installing" };
    const c = find();
    if (c) return { state: "ready", version: c.version ?? "system" };
    if (last && !last.ok) return last.reason === "deps" ? { state: "deps", command: last.command } : last.reason === "sandbox" ? { state: "deps", command: last.command, why: "sandbox" } : { state: "failed", message: last.message };
    return { state: "missing" };
  };
  const remote = workerBrowserOps({ dataDir: o.dataDir, send: o.send, env, platform, find });
  const perms = o.perms ?? defaultPermsProbe(env);
  const cuaCall = o.cuaCall ?? localCuaCall(env);
  const phoneOps = o.phone ? workerPhoneOps(o.phone) : undefined;
  const abilities = async (): Promise<DeviceAbility[]> => {
    const [c, n, p] = await Promise.all([cua().catch((e) => ({ missing: String((e as Error).message ?? e) })), native().catch(() => undefined), platform === "darwin" ? perms().catch(() => undefined) : undefined]);
    return [
      webAbilityOf({ env, dataDir: o.dataDir, cua: c, native: n, platform, browser: { setup } }),
      // D235: 用电脑 here (a Mac: cua-driver, the person's choice, macOS's two switches).
      computerAbilityOf({ platform, dataDir: o.dataDir, cua: c, perms: p }),
      // D234: Ducter's phone here, when this Mac can have one.
      ...(o.phone ? [o.phone.ability()] : []),
    ];
  };
  const tell = async () => o.send({ t: "abilities", abilities: await abilities() });
  // The phone's install and running state follow on the card (at most one frame a second).
  let phoneTimer: ReturnType<typeof setTimeout> | undefined;
  o.phone?.onChange(() => {
    phoneTimer ??= setTimeout(() => {
      phoneTimer = undefined;
      void tell().catch(() => {});
    }, 1000);
  });
  return {
    abilities,
    alwaysOn: alwaysOnKind,
    ducter: {
      async status() {
        const s = setup();
        if (s.state === "ready") return { ok: true, version: s.version };
        return { ok: false, why: s.state === "installing" ? "Ducter is installing its browser on this computer right now; try again in a minute" : "Ducter's browser isn't installed on this computer: add Browse the web (上网) on its card in Devices" };
      },
      // The home holds the task's tabs and drives the browser here (browser/remote.ts).
      attach() {},
      release: async () => false,
    },
    ops: {
      ...remote.ops,
      ...(phoneOps?.ops ?? {}),
      // D235: one cua-driver tool for a task of the home's, only while 用电脑 is on here.
      async computer_call(a: { tool?: unknown; args?: unknown }) {
        const tool = String(a.tool ?? "");
        if (readAbilitySettings(o.dataDir).computer !== true) throw new Error("用电脑 / Use the computer is off on this Mac");
        if (!COMPUTER_TOOLS.has(tool)) throw new Error(`not an app tool: ${tool}`);
        const args = a.args && typeof a.args === "object" ? (a.args as Record<string, unknown>) : {};
        if (tool === "launch_app" && blockedMacApp({ bundle: String(args.bundle_id ?? ""), name: String(args.name ?? "") })) throw new Error("that app is the person's alone");
        return cuaCall(tool, args);
      },
      async computer_grant() {
        if (platform !== "darwin") return { ok: false, reason: "not_mac" };
        return (o.grant ?? (() => openGrantGuide(env)))();
      },
    },
    async set(id, on) {
      if (id === "computer") {
        const now = (await abilities()).find((x) => x.id === "computer")!;
        if (now.state === "later") return { ok: false, reason: "failed" };
        if (on && now.state === "unavailable" && now.reason !== "computer_permissions") return { ok: false, reason: now.reason ?? "failed", ...(now.detail ? { detail: now.detail } : {}) };
        writeAbilitySettings(o.dataDir, { computer: on });
        await tell();
        return { ok: true };
      }
      if (webPinned(env)) return { ok: false, reason: "env_off" };
      const now = (await abilities())[0]!;
      if (now.state === "unavailable" && !(on && now.where === "ducter" && (now.reason === "browser_deps" || now.reason === "browser_sandbox" || now.reason === "browser_failed"))) return { ok: false, reason: now.reason ?? "failed", ...(now.detail ? { detail: now.detail } : {}) };
      writeAbilitySettings(o.dataDir, { web: on });
      // Ducter's own browser isn't here yet: install it (the card says 正在准备 meanwhile).
      if (on && now.where === "ducter" && setup().state !== "ready" && !installing) {
        installing = (o.install ?? (() => installChrome({ dataDir: o.dataDir, root: process.getuid?.() === 0 })))()
          .catch((e) => ({ ok: false, reason: "failed", message: (e as Error).message }) as InstallResult)
          .then((r) => {
            last = r;
            installing = undefined;
            void tell();
            return r;
          });
      }
      await tell();
      return { ok: true };
    },
    stopAll: async () => {
      phoneOps?.releaseAll();
      await remote.stopAll();
    },
  };
}
