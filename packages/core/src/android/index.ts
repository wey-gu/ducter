// Ducter's phone (D217, research/62): 用手机 / Use a phone on a Mac. An Android emulator Ducter
// installs into its own folder (sdk.ts), runs headless only while a task or a live view needs it
// (device.ts), shows live and hands to the user in turns (live.ts), and lends to a task whose
// work needs the phone through Ducter's own phone tools, with the gate at the effect (tools.ts).
// D234: a worker Mac can have its own phone too: it is installed and runs there (remote.ts), a task
// that needs it runs there, and the tools, the gate and the live view stay here on the home.
import type { Bodies, DeviceAbility, OnHand, PhoneTerms } from "@ducter/protocol";
import type { LogStore, TaskRegistry, WorkerLink } from "@ducter/protocol/src/internal.ts";
import { join } from "node:path";
import type { CoreMcpHub } from "../mcp.ts";
import type { PhoneDevice, PhoneDeviceOptions } from "./device.ts";
import { createPhoneHost, type PhoneInstallAnswer, type PhoneSetup } from "./host.ts";
import { createPhoneLive, type PhoneLive, type PhoneSink } from "./live.ts";
import { remotePhoneDevice } from "./remote.ts";
import type { Fetcher, InstallResult, License } from "./sdk.ts";
import { registerPhoneTools, type PhoneTools } from "./tools.ts";

export type { PhoneSetup } from "./host.ts";

/** D234: the home's view of its workers, for their phones. */
export interface PhoneWorkers {
  /** By device id or name. */
  link(device: string): WorkerLink | undefined;
  /** 用手机 as that worker last said it (its hello and abilities frames). */
  ability(deviceId: string): DeviceAbility | undefined;
}

export interface DucterPhone {
  /** This computer's phone. */
  device: PhoneDevice;
  /** This computer's live view. */
  live: PhoneLive;
  tools: PhoneTools;
  setup(): PhoneSetup;
  /** 用手机 on this computer's card. */
  ability(): DeviceAbility;
  /** where: "local" (default) or a worker's device id (D234). */
  terms(where?: string): Promise<PhoneTerms>;
  install(accepted: { id: string; sha256: string }[], where?: string): Promise<PhoneInstallAnswer | { ok: false; reason: "failed"; message: string }>;
  erase(keepSdk: boolean, where?: string): Promise<{ ok: boolean; message?: string }>;
  /** The live view of the phone on that computer (undefined: it has none to show). */
  liveFor(where: string): PhoneLive | undefined;
  /** The live view a view id belongs to (input, acks and turns go to it). */
  liveOf(viewId: string): PhoneLive | undefined;
  /** Drops a window's views on every computer's phone. */
  drop(sink: PhoneSink): Promise<void>;
  /** The computer a task runs on ("local" or a worker's device id). */
  computerOf(taskId: string): string;
  /** The task's work needs the phone (its needs.phone), and its computer has the phone. */
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
  /** D234: the workers, whose Macs may have phones of their own. */
  workers?: () => PhoneWorkers | undefined;
  /** Test seams. */
  device?: Partial<PhoneDeviceOptions>;
  installer?: (accepted: { id: string; sha256: string }[], current: License[]) => Promise<InstallResult>;
}

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked"]);

export function createDucterPhone(o: DucterPhoneOptions): DucterPhone {
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((f) => f());
  const host = createPhoneHost({ dataDir: o.dataDir, ...(o.platform ? { platform: o.platform } : {}), ...(o.arch ? { arch: o.arch } : {}), ...(o.env ? { env: o.env } : {}), ...(o.fetcher ? { fetcher: o.fetcher } : {}), ...(o.device ? { device: o.device } : {}), ...(o.installer ? { installer: o.installer } : {}) });
  host.onChange(changed);
  const device = host.device;
  const liveOpts = { tasks: o.tasks, decisions: o.decisions, ...(o.tell ? { tell: o.tell } : {}) };
  const live = createPhoneLive({ device, deviceName: o.deviceName, ...liveOpts });
  const setup = host.setup;

  // D234: each worker Mac's phone, driven over its socket, with its own live view (its own turns).
  const remotes = new Map<string, { device: PhoneDevice; live: PhoneLive }>();
  const workerOf = (where: string): WorkerLink | undefined => (where && where !== "local" ? o.workers?.()?.link(where) : undefined);
  const remoteFor = (where: string) => {
    const link = workerOf(where);
    if (!link) return undefined;
    let r = remotes.get(link.id);
    if (!r) {
      const dev = remotePhoneDevice(link, { running: () => !!o.workers?.()?.ability(link.id)?.running });
      r = { device: dev, live: createPhoneLive({ device: dev, deviceName: () => link.name, ...liveOpts }) };
      remotes.set(link.id, r);
    }
    return r;
  };
  /** The phone on that computer is installed and ready (not still installing). */
  const readyOn = (where: string) => {
    if (!where || where === "local") return setup().state === "ready";
    const link = workerOf(where);
    const ab = link ? o.workers?.()?.ability(link.id) : undefined;
    return !!link && ab?.state === "on" && !ab.setup;
  };

  const computerOf = (taskId: string): string => {
    const dev = String((o.tasks.get(taskId) as { place?: { device?: string } } | undefined)?.place?.device ?? "").trim();
    if (!dev || dev === "local") return "local";
    return workerOf(dev)?.id ?? dev;
  };
  const deviceFor = (taskId: string): PhoneDevice => {
    const where = computerOf(taskId);
    return where === "local" ? device : (remoteFor(where)?.device ?? device);
  };
  const liveForTask = (taskId: string): PhoneLive => {
    const where = computerOf(taskId);
    return where === "local" ? live : (remoteFor(where)?.live ?? live);
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
    if (!wantsPhone(taskId) || !readyOn(computerOf(taskId))) return false;
    const c = o.tasks.get(taskId);
    return !!c && ACTIVE.has(c.attention);
  };

  // A task that holds the phone keeps it running while it works (released when it stops).
  const holds = new Map<string, () => void>();
  const busy = new Set<string>();
  const tools = registerPhoneTools({
    mcp: o.mcp,
    deviceFor,
    log: o.log,
    tasks: o.tasks,
    // A task on the phone keeps it running until it stops working (task_state below lets go).
    attached: (taskId) => {
      const a = attached(taskId);
      if (a && !holds.has(taskId)) holds.set(taskId, deviceFor(taskId).hold(`task ${taskId}`));
      return a;
    },
    blind: (taskId) => (taskId ? liveForTask(taskId) : live).blind(),
    tried: (taskId) => liveForTask(taskId).tried(taskId),
    note: (taskId, doing) => {
      busy.add(taskId);
      liveForTask(taskId).note(taskId, doing);
    },
    evidenceDir: (taskId) => join(o.dataDir, "evidence", taskId),
  });

  // Answers to the phone's cards: a Go covers that one tap; a task that stopped lets the phone go.
  const pendingGo = new Map<string, { taskId: string; app: string; label: string; effect: any }>();
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

  // A view id names its computer's live view (frames carry it; input, acks and turns follow it).
  const lives = () => [live, ...[...remotes.values()].map((r) => r.live)];

  const offline = (where: string) => ({ ok: false as const, reason: "failed" as const, message: `${where} can't be reached right now` });

  return {
    device,
    live,
    tools,
    setup,
    ability: host.ability,
    async terms(where = "local") {
      if (where === "local") return host.terms();
      const link = workerOf(where);
      if (!link?.online()) return { ok: false, reason: "offline", message: "that computer can't be reached right now" };
      try {
        return await link.call<PhoneTerms>("phone_terms", {}, 30_000);
      } catch (e) {
        // A Ducter there from before D234 has no phone ops: it says unknown op.
        return { ok: false, reason: "failed", message: (e as Error).message };
      }
    },
    async install(accepted, where = "local") {
      if (where === "local") return host.install(accepted);
      const link = workerOf(where);
      if (!link?.online()) return offline(link?.name ?? where);
      try {
        return await link.call<PhoneInstallAnswer>("phone_install", { accepted }, 30_000);
      } catch (e) {
        return { ok: false, reason: "failed", message: (e as Error).message };
      }
    },
    async erase(keepSdk, where = "local") {
      if (where === "local") {
        await host.erase(keepSdk);
        return { ok: true };
      }
      const link = workerOf(where);
      if (!link?.online()) return { ok: false, message: `${link?.name ?? where} can't be reached right now` };
      try {
        await link.call("phone_erase", { keepSdk }, 120_000);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    liveFor(where) {
      if (!where || where === "local") return live;
      return remoteFor(where)?.live;
    },
    liveOf: (id) => lives().find((l) => l.views().some((v) => v.id === id)),
    async drop(sink) {
      for (const l of lives()) await l.drop(sink);
    },
    computerOf,
    attached,
    decorate(on) {
      for (const c of on.tasks) if (busy.has(c.taskId) && attached(c.taskId)) c.phoning = { device: computerOf(c.taskId) };
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
