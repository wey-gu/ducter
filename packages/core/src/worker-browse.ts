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

export interface WorkerBrowse {
  /** 上网 here, now (probes again each time). */
  abilities(): Promise<DeviceAbility[]>;
  alwaysOn(kind: DeviceKind): boolean;
  /** The runner's browser options on this worker (Ducter's own browser, when it is the one). */
  ducter: DucterBrowserPort;
  /** The worker host's extra ops (driving Ducter's browser here from the home). */
  ops: Record<string, (a: any) => Promise<unknown>>;
  /** 上网 added or removed on this computer's card. */
  set(id: "web", on: boolean): Promise<{ ok: boolean; reason?: string; detail?: string }>;
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
    if (last && !last.ok) return last.reason === "deps" ? { state: "deps", command: last.command } : { state: "failed", message: last.message };
    return { state: "missing" };
  };
  const remote = workerBrowserOps({ dataDir: o.dataDir, send: o.send, env, platform, find });
  const abilities = async (): Promise<DeviceAbility[]> => {
    const [c, n] = await Promise.all([cua().catch((e) => ({ missing: String((e as Error).message ?? e) })), native().catch(() => undefined)]);
    return [webAbilityOf({ env, dataDir: o.dataDir, cua: c, native: n, platform, browser: { setup } })];
  };
  const tell = async () => o.send({ t: "abilities", abilities: await abilities() });
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
    ops: remote.ops,
    async set(_id, on) {
      if (webPinned(env)) return { ok: false, reason: "env_off" };
      const now = (await abilities())[0]!;
      if (now.state === "unavailable" && !(on && now.where === "ducter" && (now.reason === "browser_deps" || now.reason === "browser_failed"))) return { ok: false, reason: now.reason ?? "failed", ...(now.detail ? { detail: now.detail } : {}) };
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
    stopAll: () => remote.stopAll(),
  };
}
