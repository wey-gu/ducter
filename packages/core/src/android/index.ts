// Ducter's phone (D217, research/62): 用手机 / Use a phone on a Mac. An Android emulator Ducter
// installs into its own folder (sdk.ts), runs headless only while a task or a live view needs it
// (device.ts), shows live and hands to the user in turns (live.ts), and lends to a task whose
// work needs the phone through Ducter's own phone tools, with the gate at the effect (tools.ts).
import type { Bodies, DeviceAbility, OnHand, PhoneTerms } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { join } from "node:path";
import type { CoreMcpHub } from "../mcp.ts";
import { createPhoneDevice, type PhoneDevice, type PhoneDeviceOptions } from "./device.ts";
import { createPhoneLive, type PhoneLive } from "./live.ts";
import { DISK_BYTES, downloadBytes, erasePhone, installPhone, licenses, packagesFor, phoneDirs, readInstalled, type Fetcher, type InstallResult, type InstallStep, type License } from "./sdk.ts";
import { registerPhoneTools, type PhoneTools } from "./tools.ts";

export type PhoneSetup =
  | { state: "ready" }
  | { state: "missing" }
  | { state: "installing"; step?: InstallStep }
  | { state: "failed"; message: string }
  | { state: "unsupported"; why: string };

export interface DucterPhone {
  device: PhoneDevice;
  live: PhoneLive;
  tools: PhoneTools;
  setup(): PhoneSetup;
  /** 用手机 on this computer's card. */
  ability(): DeviceAbility;
  terms(): Promise<PhoneTerms>;
  install(accepted: { id: string; sha256: string }[]): Promise<InstallResult | { ok: false; reason: "not_mac_arm" | "busy"; message: string }>;
  erase(keepSdk: boolean): Promise<void>;
  /** The task's work needs the phone (its needs.phone), and the phone is here. */
  attached(taskId: string): boolean;
  /** On hand marks a task using the phone (phoning), so it can be watched. */
  decorate(o: OnHand): OnHand;
  onChange(fn: () => void): () => void;
  stop(): Promise<void>;
}

export interface DucterPhoneOptions {
  dataDir: string;
  mcp: CoreMcpHub;
  log: LogStore;
  tasks: TaskRegistry & { get(id: string): any };
  decisions: { isPending(id: string): boolean; decide(id: string, option: "go"): unknown; get(id: string): { taskId?: string } | undefined };
  deviceName: () => string;
  tell?: (taskId: string, text: string) => unknown;
  platform?: string;
  arch?: string;
  env?: Record<string, string | undefined>;
  fetcher?: Fetcher;
  /** Test seams. */
  device?: Partial<PhoneDeviceOptions>;
  installer?: (accepted: { id: string; sha256: string }[], current: License[]) => Promise<InstallResult>;
}

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked"]);

export function createDucterPhone(o: DucterPhoneOptions): DucterPhone {
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((f) => f());
  const device = createPhoneDevice({ dataDir: o.dataDir, ...(o.env ? { env: o.env } : {}), onState: () => changed(), ...(o.device ?? {}) });
  const live = createPhoneLive({ device, deviceName: o.deviceName, tasks: o.tasks, decisions: o.decisions, ...(o.tell ? { tell: o.tell } : {}) });
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

  // needs.phone from the task's opening (kept on the task_open event), read once per task.
  const needs = new Map<string, boolean>();
  const wantsPhone = (taskId: string) => {
    let v = needs.get(taskId);
    if (v === undefined) {
      const open = o.log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 1, kinds: ["task_open"] })[0]?.body as Bodies["task_open"] | undefined;
      v = !!open?.needs?.phone;
      needs.set(taskId, v);
    }
    return v;
  };
  const attached = (taskId: string) => {
    if (setup().state !== "ready" || !wantsPhone(taskId)) return false;
    const c = o.tasks.get(taskId);
    return !!c && ACTIVE.has(c.attention);
  };

  // A task that holds the phone keeps it running while it works (released when it stops).
  const holds = new Map<string, () => void>();
  const busy = new Set<string>();
  const tools = registerPhoneTools({
    mcp: o.mcp,
    device,
    log: o.log,
    tasks: o.tasks,
    // A task on the phone keeps it running until it stops working (task_state below lets go).
    attached: (taskId) => {
      const a = attached(taskId);
      if (a && !holds.has(taskId)) holds.set(taskId, device.hold(`task ${taskId}`));
      return a;
    },
    blind: () => live.blind(),
    tried: (taskId) => live.tried(taskId),
    note: (taskId, doing) => {
      busy.add(taskId);
      live.note(taskId, doing);
    },
    evidenceDir: (taskId) => join(o.dataDir, "evidence", taskId),
  });

  // Answers to the phone's cards: a Go covers that one tap; a task that stopped lets the phone go.
  const unsubscribe = o.log.subscribe((e) => {
    if (e.kind === "decision") {
      const b = e.body as Bodies["decision"];
      if (b.taskId && b.phone?.kind === "go") pendingGo.set(b.decisionId, { taskId: b.taskId, app: b.phone.app, label: b.phone.label, effect: b.phone.effect as any });
      return;
    }
    if (e.kind === "decision_resolved") {
      const r = e.body as Bodies["decision_resolved"];
      const g = pendingGo.get(r.decisionId);
      if (!g) return;
      pendingGo.delete(r.decisionId);
      if (r.option === "go") tools.allow(g.taskId, { app: g.app, label: g.label, effect: g.effect });
      return;
    }
    if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      if (!ACTIVE.has(b.attention)) {
        holds.get(b.taskId)?.();
        holds.delete(b.taskId);
        busy.delete(b.taskId);
      }
    }
  });
  const pendingGo = new Map<string, { taskId: string; app: string; label: string; effect: any }>();

  return {
    device,
    live,
    tools,
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
    attached,
    decorate(on) {
      for (const c of on.tasks) if (busy.has(c.taskId) && attached(c.taskId)) c.phoning = { device: "local" };
      return on;
    },
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    async stop() {
      unsubscribe();
      await device.stop();
    },
  };
}
