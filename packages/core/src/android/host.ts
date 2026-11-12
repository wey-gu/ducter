// Ducter's phone on one computer (D217, D234): installed into that computer's own data folder,
// run there, and said as 用手机 on its card. The home has one for itself (index.ts); a worker Mac
// has one for itself (worker.ts), driven from the home over the worker's socket (remote.ts).
import type { DeviceAbility, PhoneTerms } from "@ducter/protocol";
import { createPhoneDevice, type PhoneDevice, type PhoneDeviceOptions } from "./device.ts";
import { DISK_BYTES, downloadBytes, erasePhone, installPhone, licenses, packagesFor, phoneDirs, readInstalled, type Fetcher, type InstallResult, type InstallStep, type License } from "./sdk.ts";

export type PhoneSetup =
  | { state: "ready" }
  | { state: "missing" }
  | { state: "installing"; step?: InstallStep }
  | { state: "failed"; message: string }
  | { state: "unsupported"; why: string };

export type PhoneInstallAnswer = InstallResult | { ok: false; reason: "not_mac_arm" | "busy"; message: string };

export interface PhoneHost {
  device: PhoneDevice;
  setup(): PhoneSetup;
  /** 用手机 on this computer's card. */
  ability(): DeviceAbility;
  terms(): Promise<PhoneTerms>;
  install(accepted: { id: string; sha256: string }[]): Promise<PhoneInstallAnswer>;
  erase(keepSdk: boolean): Promise<void>;
  onChange(fn: () => void): () => void;
  stop(): Promise<void>;
}

export interface PhoneHostOptions {
  dataDir: string;
  platform?: string;
  arch?: string;
  env?: Record<string, string | undefined>;
  fetcher?: Fetcher;
  /** Test seams. */
  device?: Partial<PhoneDeviceOptions>;
  installer?: (accepted: { id: string; sha256: string }[], current: License[]) => Promise<InstallResult>;
}

export function createPhoneHost(o: PhoneHostOptions): PhoneHost {
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((f) => f());
  const device = createPhoneDevice({ dataDir: o.dataDir, ...(o.env ? { env: o.env } : {}), onState: () => changed(), ...(o.device ?? {}) });
  const plat = packagesFor(o.platform ?? process.platform, o.arch ?? process.arch);
  let installing: Promise<InstallResult> | undefined;
  let step: InstallStep | undefined;
  let last: InstallResult | undefined;
  let terms: License[] | undefined;
  const dirs = phoneDirs(o.dataDir);

  const setup = (): PhoneSetup => {
    if (!plat.ok) return { state: "unsupported", why: plat.why };
    if (installing) return { state: "installing", ...(step ? { step } : {}) };
    if (readInstalled(dirs)) return { state: "ready" };
    if (last && !last.ok) return { state: "failed", message: last.message };
    return { state: "missing" };
  };

  return {
    device,
    setup,
    ability() {
      const s = setup();
      switch (s.state) {
        case "unsupported":
          return { id: "phone", state: "later" };
        case "ready":
          return { id: "phone", state: "on", ...(device.state() === "running" || device.state() === "starting" ? { running: true } : {}) };
        case "installing":
          return { id: "phone", state: "on", setup: "installing", ...(s.step ? { step: s.step.step === "download" ? { step: "download", done: s.step.done, total: s.step.total } : { step: s.step.step } } : {}) };
        case "failed":
          return { id: "phone", state: "unavailable", reason: "phone_failed", detail: s.message };
        case "missing":
          return { id: "phone", state: "off" };
      }
    },
    async terms() {
      if (!plat.ok) return { ok: false, reason: "not_mac_arm" };
      try {
        terms = await licenses(plat.packages, o.fetcher);
      } catch (e) {
        return { ok: false, reason: "offline", message: (e as Error).message };
      }
      return {
        ok: true,
        download: downloadBytes(plat.packages),
        disk: DISK_BYTES,
        packages: plat.packages.map((p) => ({ label: p.label, version: p.version, size: p.size })),
        licenses: terms.map((l) => ({ id: l.id, title: l.title, text: l.text, sha256: l.sha256 })),
      };
    },
    install(accepted) {
      if (!plat.ok) return Promise.resolve({ ok: false, reason: "not_mac_arm", message: "Ducter's phone runs on Apple Silicon Macs for now" });
      if (installing) return Promise.resolve({ ok: false, reason: "busy", message: "already installing" });
      installing = (async () => {
        changed();
        try {
          const current = terms ?? (await licenses(plat.packages, o.fetcher));
          if (o.installer) return await o.installer(accepted, current);
          return await installPhone({ dataDir: o.dataDir, packages: plat.packages, accepted, current, ...(o.fetcher ? { fetcher: o.fetcher } : {}), onStep: (s) => ((step = s), changed()) });
        } catch (e) {
          return { ok: false, reason: "failed", message: (e as Error).message } as InstallResult;
        }
      })().then((r) => {
        last = r;
        installing = undefined;
        step = undefined;
        changed();
        if (r.ok) console.log("[ducter] phone: Ducter's phone is installed");
        else console.warn(`[ducter] phone: install failed: ${r.message}`);
        return r;
      });
      return installing;
    },
    async erase(keepSdk) {
      await device.stop();
      erasePhone(o.dataDir, { keepSdk });
      last = undefined;
      changed();
    },
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stop: () => device.stop(),
  };
}
