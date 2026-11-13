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
import { HANDSET_BLIND, HANDSET_MINE_NONE, type Handsets } from "../handset/index.ts";
import { whichPhone } from "@ducter/protocol";

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
  /** D238: the person's own phones (用这台手机): a phone task uses one when it is added. */
  handsets?: () => Handsets | undefined;
  /** D248: how long a request for the person's own turn keeps the phone awake (ms; 30 min). */
  askAwakeMs?: number;
  /** D255: how long phone_open_app waits for the app to be in front (ms; 3 s). */
  openWaitMs?: number;
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
  // D238: a phone task uses the person's own phone when one is added (its apps and sign-ins are
  // theirs); Ducter's phone on its computer otherwise. Bound at the task's first use.
  // D247: with no phone that can serve it (none added, no Ducter's phone where it runs), a phone task
  // binds the person's connected phone too, and its first phone tool offers to turn 用这台手机 on.
  // D251: the work says which phone. "mine": the person's own, always: added, or their connected
  // Android phone with a card to turn 用这台手机 on, even where Ducter's phone could do it; never
  // Ducter's phone. "ducter": Ducter's phone only. "any" (the legacy true): as D238 and D247.
  // D253: a task that started on Ducter's phone stays on it for its life (it never moves to the
  // person's phone because theirs was added mid-task; on hel a task began on the emulator and went on
  // on the Pixel).
  const onDucters = new Set<string>();
  const handsetOf = (taskId: string): string | undefined => {
    const h = o.handsets?.();
    if (!h) return undefined;
    const which = wantsPhone(taskId);
    if (!which || which === "ducter" || onDucters.has(taskId)) return undefined;
    if (which === "mine") return h.forTask(taskId, true, { mine: true });
    return h.forTask(taskId, true, { offer: !readyOn(computerOf(taskId)) });
  };
  const deviceFor = (taskId: string): PhoneDevice => {
    if (handsetOf(taskId)) return o.handsets!()!.device(taskId);
    if (wantsPhone(taskId) === "mine") return noneOfTheirs;
    if (wantsPhone(taskId)) onDucters.add(taskId);
    const where = computerOf(taskId);
    return where === "local" ? device : (remoteFor(where)?.device ?? device);
  };
  /** D253: which phone, in a few words, at the end of every step's answer. */
  const whichShort = (taskId: string): string | undefined => {
    const on = handsetOf(taskId) ? o.handsets!()!.where(taskId) : undefined;
    if (on) return `on ${on.name}, the user's own phone`;
    if (wantsPhone(taskId) === "mine") return undefined;
    return "on Ducter's own phone (an emulator, not the user's)";
  };
  /** D251: what phone_look says first: which phone this is, so a task never takes one for the other. */
  const whichLine = (taskId: string): string | undefined => {
    const on = handsetOf(taskId) ? o.handsets!()!.where(taskId) : undefined;
    if (on) return `Phone: ${on.name}, the user's own phone (their own apps, accounts and messages).`;
    if (wantsPhone(taskId) === "mine") return undefined;
    const where = computerOf(taskId);
    const mac = where === "local" ? o.deviceName() : (workerOf(where)?.name ?? where);
    return `Phone: Ducter's own phone, an Android emulator on ${mac}. It is not the user's own phone: only apps they signed in to on it themselves have their accounts.`;
  };
  const liveForTask = (taskId: string): PhoneLive => {
    const where = computerOf(taskId);
    return where === "local" ? live : (remoteFor(where)?.live ?? live);
  };

  // needs.phone from the task's opening (kept on the task_open event), read once per task.
  // D251: which phone ("mine", "ducter", or "any" for the legacy true); "" when it needs none.
  const needs = new Map<string, "mine" | "ducter" | "any" | "">();
  const wantsPhone = (taskId: string) => {
    let v = needs.get(taskId);
    if (v === undefined) {
      const open = o.log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 1, kinds: ["task_open"] })[0]?.body as Bodies["task_open"] | undefined;
      v = whichPhone(open?.needs) ?? "";
      needs.set(taskId, v);
    }
    return v || undefined;
  };
  /** D251: work for the person's own phone with none of theirs to use: every tool says so, never Ducter's phone. */
  const refuse = (): Promise<never> => Promise.reject(new Error(HANDSET_MINE_NONE));
  const noneOfTheirs: PhoneDevice = {
    state: () => "stopped",
    ensure: refuse,
    touch() {},
    hold: () => () => {},
    stop: async () => {},
    adb: refuse,
    shell: refuse,
    jpeg: refuse,
    screen: refuse,
    tap: refuse,
    swipe: refuse,
    key: refuse,
    text: refuse,
    front: refuse,
    apps: refuse,
    launch: refuse,
    size: refuse,
  };
  const attached = (taskId: string) => {
    const which = wantsPhone(taskId);
    if (!which) return false;
    // D251: work for their own phone keeps its phone tools, which say plainly when none of theirs is there.
    if (which !== "mine" && !handsetOf(taskId) && !readyOn(computerOf(taskId))) return false;
    const c = o.tasks.get(taskId);
    return !!c && ACTIVE.has(c.attention);
  };

  // A task that holds the phone keeps it running while it works (released when it stops).
  const holds = new Map<string, () => void>();
  const busy = new Set<string>();
  /** The task works on Ducter's phone (not the person's, and not work that is for theirs only: D251). */
  const ducters = (taskId: string) => !handsetOf(taskId) && wantsPhone(taskId) !== "mine";
  const tools = registerPhoneTools({
    mcp: o.mcp,
    deviceFor,
    log: o.log,
    tasks: o.tasks,
    // A task on the phone keeps it running until it stops working (task_state below lets go).
    attached: (taskId) => {
      const a = attached(taskId);
      if (a && !holds.has(taskId) && ducters(taskId)) holds.set(taskId, deviceFor(taskId).hold(`task ${taskId}`));
      return a;
    },
    blind: (taskId) => (taskId && handsetOf(taskId) ? o.handsets!()!.blind(taskId) : taskId && !ducters(taskId) ? false : (taskId ? liveForTask(taskId) : live).blind()),
    tried: (taskId) => void (ducters(taskId) ? liveForTask(taskId).tried(taskId) : undefined),
    note: (taskId, doing) => {
      if (handsetOf(taskId)) return o.handsets!()!.note(taskId, doing);
      if (!ducters(taskId)) return;
      busy.add(taskId);
      liveForTask(taskId).note(taskId, doing);
    },
    acting: (taskId, on) => void (ducters(taskId) ? liveForTask(taskId).acting(taskId, on) : undefined),
    on: (taskId) => (handsetOf(taskId) ? o.handsets!()!.where(taskId) : undefined),
    blindText: (taskId) => (handsetOf(taskId) ? (o.handsets!()!.blindText?.(taskId) ?? HANDSET_BLIND) : undefined),
    which: whichLine,
    whichShort,
    evidenceDir: (taskId) => join(o.dataDir, "evidence", taskId),
    // D255: the user's own phone records its screen itself (handsets); Ducter's phone has no recorder yet.
    record: (taskId) => o.handsets!()!.record(taskId),
    recordStop: (taskId) => o.handsets!()!.recordStop(taskId),
    ...(o.openWaitMs !== undefined ? { openWaitMs: o.openWaitMs } : {}),
  });

  // Answers to the phone's cards: a Go covers that one tap; a task that stopped lets the phone go.
  const pendingGo = new Map<string, { taskId: string; app: string; label: string; effect: any }>();
  // D248: a request for the person's own turn (a sign-in, a code) keeps the phone awake 30 minutes,
  // so the page is still there when they come; then the task lets go and the phone may sleep
  // (opening the card wakes it again: a card's own turn is the person's explicit ask).
  const askTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const unsubscribe = o.log.subscribe((e) => {
    if (e.kind === "decision") {
      const b = e.body as Bodies["decision"];
      if (b.taskId && b.phone?.kind === "user") {
        const taskId = b.taskId;
        const timer = setTimeout(() => {
          askTimers.delete(b.decisionId);
          holds.get(taskId)?.();
          holds.delete(taskId);
        }, o.askAwakeMs ?? 30 * 60_000);
        (timer as { unref?: () => void }).unref?.();
        askTimers.set(b.decisionId, timer);
      }
      if (b.taskId && b.phone?.kind === "go") pendingGo.set(b.decisionId, { taskId: b.taskId, app: b.phone.app, label: b.phone.label, effect: b.phone.effect as any });
      return;
    }
    if (e.kind === "decision_resolved") {
      const r = e.body as Bodies["decision_resolved"];
      const at = askTimers.get(r.decisionId);
      if (at) clearTimeout(at), askTimers.delete(r.decisionId);
      const g = pendingGo.get(r.decisionId);
      if (!g) return;
      pendingGo.delete(r.decisionId);
      if (r.option === "go") tools.allow(g.taskId, { app: g.app, label: g.label, effect: g.effect });
      return;
    }
    if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      if (!ACTIVE.has(b.attention)) {
        onDucters.delete(b.taskId);
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
      for (const c of on.tasks) if (busy.has(c.taskId) && attached(c.taskId) && ducters(c.taskId)) c.phoning = { device: computerOf(c.taskId) };
      return o.handsets?.()?.decorate(on) ?? on;
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
