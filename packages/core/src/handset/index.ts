// D238: 用这台手机 / Use this phone. A task uses the person's OWN Android phone through the Ducter
// app on it: an accessibility service there reads other apps' screens and acts, and the page in the
// app's web view relays the home's calls over its own socket (the app's existing connection). The
// phone tools, the gate at the effect, the blocked apps and the blind rule are the same code as for
// Ducter's phone (android/tools.ts, gate.ts) and stay here on the home; this file adds what is
// different about a phone that is the person's:
//   - it is lent, never kept: a task asks before its first use (one card, no default, silence never
//     lends a phone), the phone shows Ducter 正在用这台手机 with 停下 while it is lent, and the loan
//     ends when the task stops working, when the person stops it (from any window or the phone), or
//     when the phone's app says it no longer holds it;
//   - the app does only a fixed set of things (HandsetMethod), and only inside a loan the home
//     started: it refuses everything else on its own side too;
//   - the screen comes back in uiautomator's own XML shape, so it is read by the same parser
//     (screen.ts parseDump), password fields with their text already left out on the phone.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, HandsetMethod, HandsetServerFrame, HandsetState, HandsetView, OnHand, Question } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import type { PhoneDevice, Raw } from "../android/device.ts";
import { parseDump, type Screen } from "../android/screen.ts";
import type { PhoneDoing } from "../android/tools.ts";

export const HANDSETS_FILE = "handsets.json";
/** The app's bridge version this home speaks. */
export const HANDSET_BRIDGE = 1;

export const HANDSET_STOPPED = "The user stopped you using their phone (停下 / Stop). Don't use it again in this task. Report what you finished and what is left, in one or two lines.";
/** D247: never the person's phone over adb, a cable or Developer options (the brief says it too). */
const NO_ADB = "Never ask the user to turn on USB or wireless debugging, plug in a cable or open Developer options, and never use adb on their phone.";
export const HANDSET_SETUP_ASKED = (phone: string) =>
  `Use this phone (用这台手机) isn't on yet on ${phone}, the user's own phone. A card now asks them to turn it on there: one switch in Android, once. End your turn now; a message arrives when you may use it (or if they say not now). ${NO_ADB}`;
export const HANDSET_SETUP_WAIT = (phone: string) => `Waiting for the user to turn on Use this phone on ${phone}. End your turn now; a message arrives when it's on. ${NO_ADB}`;
export const HANDSET_SETUP_NO = `The user said not now to turning on Use this phone. Carry on without a phone, or report blocked in one line saying what you'd do on it. ${NO_ADB}`;
/**
 * D251: work on the person's own phone (needs.phone "mine") and they said not now: no phone of
 * theirs, and never another phone in its place by the task's own choice.
 */
export const HANDSET_MINE_NO = `The user said not now to using their own phone for this task, so you have no phone of theirs. Report blocked in one line saying what you'd do on it. Never do this work on any other phone. Only if it needs none of their apps or accounts, you may ask in that report whether to do it on Ducter's own phone instead (a clean phone with none of their accounts), with waiting as the default; never switch by yourself. ${NO_ADB}`;
/** D251: work on the person's own phone, and none of theirs can be reached for this task. */
export const HANDSET_MINE_NONE = `This work is for the user's own phone, and none of theirs can be reached right now (the Ducter app on their Android phone isn't open, or Use this phone isn't on there). Report blocked in one line saying what you'd do on it. Never do it on any other phone. ${NO_ADB}`;
export const HANDSET_BLIND = "It's the user's turn on their phone: they're doing a step themselves (signing in, a code). You can't see or use it until they're done. End your turn now; a message arrives when they are.";

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked"]);
const CALL_MS = 20_000;

/** One socket of the page on that phone (ws.ts holds it). */
export interface HandsetSocket {
  send(f: HandsetServerFrame): void;
}

export interface HandsetsOptions {
  dataDir: string;
  log: LogStore;
  tasks: TaskRegistry & { get(id: string): { title?: string; persona?: string; residency?: string; attention?: string } | undefined };
  /** The person's name for a paired device ("Pixel Fold"), and whether it is still paired. */
  deviceName(deviceId: string): string | undefined;
  /** Tell a task something (a message in its next turn). */
  tell?(taskId: string, text: string): unknown;
  /** Interrupt a task's turn now (Stop). */
  interrupt?(taskId: string): unknown;
  /** Ducter's language: the pill on the phone speaks it, one language with the lines the home sends. */
  language?(): "zh" | "en" | undefined;
  now?: () => number;
  callMs?: number;
}

export interface Handsets {
  /** The page on a phone said what its app can do (on connect and on every change). */
  hello(deviceId: string, sock: HandsetSocket, state: HandsetState): void;
  /** That page's socket closed. */
  gone(deviceId: string, sock: HandsetSocket): void;
  /** The page's answer to one call. */
  answer(deviceId: string, r: { id: string; ok: boolean; result?: unknown; error?: string }): void;
  /** The chip: add (needs Android's switch on, from that phone) or remove. */
  set(deviceId: string, on: boolean): { ok: boolean; reason?: "not_android" | "service_off" | "unknown_device" | "old_app" };
  /** 停下 / Stop: the task that is using the person's phone (any, when from the phone itself). */
  stop(taskId: string | undefined, phone?: string): Promise<boolean>;
  /** The card's view of 用这台手机 on that phone (undefined: not a phone that has it). */
  view(deviceId: string, platform: string): HandsetView | undefined;
  /** Some phone has it added, so work on a phone app can go anywhere. */
  any(): boolean;
  /** D247: no phone has it, but this one's app is connected now: a phone task can offer to turn it on there. */
  offer(): string | undefined;
  /**
   * The person's phone this task uses (bound at its first use), when it uses one. offer (D247): no
   * other phone serves this task, so a connected phone without 用这台手机 is bound too, and its first
   * phone tool asks to turn it on.
   */
  forTask(taskId: string, wantsPhone: boolean, opts?: { offer?: boolean; mine?: boolean }): string | undefined;
  /** The phone, as the phone tools drive it, for this task. */
  device(taskId: string): PhoneDevice;
  /** It is the person's turn on that phone (a step of theirs is pending). */
  blind(taskId: string): boolean;
  note(taskId: string, d: PhoneDoing): void;
  /** For phone_ask_go / phone_ask_user cards: the phone's id and name. */
  where(taskId: string): { device: string; name: string } | undefined;
  decorate(o: OnHand): OnHand;
  onChange(fn: () => void): () => void;
  stopAll(): void;
}

interface Link {
  sock: HandsetSocket;
  state: HandsetState;
}

interface Loan {
  taskId: string;
  device: string;
  since: number;
  app?: string;
}

type Saved = Record<string, { added: boolean }>;

const isAndroidApp = (platform: string) => /android/i.test(platform);

/** The pill's step line (zh: the phone's people mostly read Chinese here; the pill itself is localized on the phone). */
export function doingLine(d: PhoneDoing): string {
  const l = (d.label ?? "").split(" · ")[0]!.trim().slice(0, 24);
  switch (d.kind) {
    case "look":
      return "在看屏幕";
    case "tap":
      return l ? `点「${l}」` : "点一下";
    case "type":
      return l ? `在「${l}」里打字` : "在打字";
    case "swipe":
      return "滑动";
    case "key":
      return l === "back" ? "返回" : l === "home" ? "回到主屏幕" : "按键";
    case "open":
      return "打开应用";
    case "shot":
      return "截一张图";
    default:
      return "";
  }
}

export function createHandsets(o: HandsetsOptions): Handsets {
  const now = o.now ?? Date.now;
  const callMs = o.callMs ?? CALL_MS;
  const file = join(o.dataDir, HANDSETS_FILE);
  const read = (): Saved => {
    if (!existsSync(file)) return {};
    try {
      const j = JSON.parse(readFileSync(file, "utf8"));
      return j && typeof j === "object" ? j : {};
    } catch {
      return {};
    }
  };
  let saved = read();
  const write = () => {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(saved, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, file);
  };

  const links = new Map<string, Link>();
  const lastLinked = new Map<string, number>();
  const pending = new Map<string, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout>; device: string }>();
  let seq = 0;
  /** A task → the phone it uses (bound at first use, for the task's life). */
  const bound = new Map<string, string>();
  /** The loan on each phone (one task at a time). */
  const loans = new Map<string, Loan>();
  /** Tasks waiting for the person's yes (their decision id). */
  const asking = new Map<string, string>();
  /** Tasks the person said yes to, whose phone wasn't connected yet: started when it is. */
  const toStart = new Set<string>();
  /** Tasks the person stopped (or said no to): their phone tools refuse from then on. */
  const stopped = new Map<string, string>();
  /** Tasks with a step of the person's own pending on the phone (their decision ids). */
  const theirTurn = new Map<string, string>();
  /** D247: tasks waiting for 用这台手机 to be turned on (their card's id; go: the person tapped it). */
  const setups = new Map<string, { device: string; decisionId: string; go: boolean }>();
  /** D247: phones to open the guide on the next time their app connects. */
  const guideOnLink = new Set<string>();
  /** D251: tasks whose work is for the person's own phone (needs.phone "mine"): they keep it, and a no is final. */
  const mine = new Set<string>();
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((f) => f());

  const name = (device: string) => o.deviceName(device) ?? "your phone";
  const added = (device: string) => !!saved[device]?.added && o.deviceName(device) !== undefined;
  /** D247: its app is connected and new enough, but 用这台手机 isn't on there yet. */
  const offerable = (device: string) => {
    const l = links.get(device);
    return !!l && l.state.bridge >= HANDSET_BRIDGE && !saved[device]?.added && o.deviceName(device) !== undefined;
  };

  const call = <T>(device: string, m: HandsetMethod, a: Record<string, unknown> = {}, ms = callMs): Promise<T> => {
    const l = links.get(device);
    if (!l) return Promise.reject(new Error(`${name(device)} can't be reached right now: the Ducter app on it isn't open. Tell the user in one line to open Ducter on ${name(device)}, then end your turn.`));
    const id = `h${++seq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${name(device)} didn't answer in time (its screen may be off, or the app was closed). Try once more; if it still doesn't answer, report it.`));
      }, ms);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, device });
      try {
        l.sock.send({ t: "handset_req", id, m, a });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e as Error);
      }
    });
  };

  const taskTitle = (taskId: string) => o.tasks.get(taskId)?.title ?? "a task";
  const loanOf = (taskId: string): Loan | undefined => {
    const d = bound.get(taskId);
    const l = d ? loans.get(d) : undefined;
    return l?.taskId === taskId ? l : undefined;
  };

  /** Starts (or refreshes) the loan on the phone: its indicator says whose task, and whose turn. */
  const lend = async (taskId: string): Promise<boolean> => {
    const device = bound.get(taskId);
    if (!device) return false;
    const card = o.tasks.get(taskId);
    if (!card || !ACTIVE.has(String(card.attention))) return false;
    const other = loans.get(device);
    if (other && other.taskId !== taskId) return false;
    if (!links.has(device)) {
      toStart.add(taskId);
      return false;
    }
    try {
      await call(device, "start", { session: taskId, task: taskTitle(taskId), turn: theirTurn.has(taskId) ? "you" : "agent", ...(o.language?.() ? { lang: o.language() } : {}) });
    } catch (e) {
      console.warn(`[handset] couldn't start on ${name(device)}:`, (e as Error).message);
      toStart.add(taskId);
      return false;
    }
    toStart.delete(taskId);
    const fresh = !loans.has(device);
    loans.set(device, { taskId, device, since: now(), ...(other?.app ? { app: other.app } : {}) });
    changed();
    if (fresh) o.tell?.(taskId, `You may use ${name(device)} now: the user's own phone, with their own apps, accounts and messages on it. It shows "Ducter 正在用这台手机" with a Stop button while you work. Take only the steps this task needs; anything that sends, pays or deletes still waits for their Go. Start with phone_look.`);
    return true;
  };

  /** The loan ends (the task stopped, the person stopped it, or the phone let go). */
  const endLoan = (taskId: string, tellPhone: boolean) => {
    const l = loanOf(taskId);
    toStart.delete(taskId);
    if (!l) return;
    loans.delete(l.device);
    if (tellPhone && links.has(l.device)) void call(l.device, "stop", { session: taskId }).catch(() => {});
    changed();
  };

  const ask = (taskId: string, device: string) => {
    const card = o.tasks.get(taskId);
    const q: Question = { id: "handset_use", text: `「${taskTitle(taskId)}」想用你的 ${name(device)}`, blocking: true, reversible: false, handset: { kind: "use", device, name: name(device) } };
    asking.set(taskId, ""); // the decision's id arrives with its event, right behind this report
    const body: Bodies["report"] = { taskId, state: "needs_input", summary: q.text, questions: [q], evidence: [] };
    o.log.append({ persona: card?.persona, stream: `task:${taskId}`, origin: "task", kind: "report", body });
    o.tasks.setState(taskId, "needs_you", (card?.residency as any) ?? "hot");
  };

  /** D247: the task needs a phone and this one's app is here, without 用这台手机: one card to turn it on. */
  const askSetup = (taskId: string, device: string) => {
    const card = o.tasks.get(taskId);
    const q: Question = { id: "handset_setup", text: `「${taskTitle(taskId)}」要用你的 ${name(device)}：先在 ${name(device)} 上打开「用这台手机」`, blocking: true, reversible: false, handset: { kind: "setup", device, name: name(device) } };
    setups.set(taskId, { device, decisionId: "", go: false }); // the id arrives with its decision event
    const body: Bodies["report"] = { taskId, state: "needs_input", summary: q.text, questions: [q], evidence: [] };
    o.log.append({ persona: card?.persona, stream: `task:${taskId}`, origin: "task", kind: "report", body });
    o.tasks.setState(taskId, "needs_you", (card?.residency as any) ?? "hot");
  };

  /** D247: the person tapped the card: the guide opens on that phone (or it is already on: the task goes). */
  const guide = (taskId: string) => {
    const s = setups.get(taskId);
    if (!s) return;
    if (added(s.device)) {
      setups.delete(taskId);
      void lend(taskId);
      return;
    }
    const l = links.get(s.device);
    // Android's switch is already on there: nothing left for the person to do, so it is added now.
    if (l && l.state.service && l.state.bridge >= HANDSET_BRIDGE) return void api.set(s.device, true);
    if (!l) return void guideOnLink.add(s.device);
    try {
      l.sock.send({ t: "handset_guide", taskId });
    } catch {
      guideOnLink.add(s.device);
    }
  };

  /** Before every phone tool: the loan must be this task's. */
  const ready = async (taskId: string) => {
    const why = stopped.get(taskId);
    if (why) throw new Error(why);
    const device = bound.get(taskId);
    if (device && !added(device) && o.deviceName(device) !== undefined) {
      const s = setups.get(taskId);
      if (!s) {
        askSetup(taskId, device);
        throw new Error(HANDSET_SETUP_ASKED(name(device)));
      }
      throw new Error(HANDSET_SETUP_WAIT(name(device)));
    }
    if (!device || !added(device)) throw new Error("this task doesn't have the user's phone");
    if (loanOf(taskId)) return;
    const other = loans.get(device);
    if (other) throw new Error(`${name(device)} is lent to another task ("${taskTitle(other.taskId)}") right now. Wait for it, or report that you need the phone.`);
    if (asking.has(taskId) || toStart.has(taskId)) throw new Error(`Waiting for the user to let you use ${name(device)}. End your turn now; a message arrives when it's on.`);
    ask(taskId, device);
    throw new Error(`Asked the user whether you may use ${name(device)}, their own phone, now. End your turn; a message arrives when it's on (or if they say no).`);
  };

  // The person's answers, and tasks that stop.
  const offLog = o.log.subscribe((e) => {
    if (e.kind === "decision") {
      const b = e.body as Bodies["decision"];
      if (!b.taskId) return;
      const su = b.handset?.kind === "setup" ? setups.get(b.taskId) : undefined;
      if (su) su.decisionId = b.decisionId;
      else if (b.handset) asking.set(b.taskId, b.decisionId);
      else if (b.phone?.kind === "user" && bound.has(b.taskId)) {
        theirTurn.set(b.taskId, b.decisionId);
        if (loanOf(b.taskId)) void lend(b.taskId);
      }
      return;
    }
    if (e.kind === "decision_resolved") {
      const r = e.body as Bodies["decision_resolved"];
      for (const [taskId, s] of setups) {
        if (s.decisionId !== r.decisionId) continue;
        if (r.option === "go") (s.go = true), guide(taskId);
        else {
          const no = mine.has(taskId) ? HANDSET_MINE_NO : HANDSET_SETUP_NO;
          setups.delete(taskId), stopped.set(taskId, no), o.tell?.(taskId, no);
        }
      }
      for (const [taskId, id] of asking) {
        if (id !== r.decisionId) continue;
        asking.delete(taskId);
        if (r.option === "go") void lend(taskId);
        else if (mine.has(taskId)) stopped.set(taskId, HANDSET_MINE_NO), o.tell?.(taskId, HANDSET_MINE_NO);
        else stopped.set(taskId, "The user said no to lending you their phone for this task. Carry on without it, or report what you would need it for."), o.tell?.(taskId, "The user said no to lending you their phone for this. Carry on without it, or report in one line what you'd need it for.");
      }
      for (const [taskId, id] of theirTurn) {
        if (id !== r.decisionId) continue;
        theirTurn.delete(taskId);
        if (loanOf(taskId)) void lend(taskId);
      }
      return;
    }
    if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      if (!ACTIVE.has(b.attention)) {
        endLoan(b.taskId, true);
        bound.delete(b.taskId);
        asking.delete(b.taskId);
        theirTurn.delete(b.taskId);
        setups.delete(b.taskId);
        mine.delete(b.taskId);
      }
    }
  });

  const deviceFor = (taskId: string): PhoneDevice => {
    const dev = () => {
      const d = bound.get(taskId);
      if (!d) throw new Error("this task doesn't have the user's phone");
      return d;
    };
    const noShell = (): Promise<never> => Promise.reject(new Error("not on the user's own phone"));
    const c = <T>(m: HandsetMethod, a: Record<string, unknown> = {}) => call<T>(dev(), m, { ...a, session: taskId });
    return {
      state: () => (loanOf(taskId) ? "running" : "stopped"),
      ensure: () => ready(taskId),
      touch() {},
      hold: () => () => {},
      stop: async () => endLoan(taskId, true),
      adb: noShell as (args: string[]) => Promise<Raw>,
      shell: noShell as (cmd: string[]) => Promise<string>,
      async jpeg() {
        const r = await c<{ data: string }>("jpeg");
        return new Uint8Array(Buffer.from(r?.data ?? "", "base64"));
      },
      async screen(): Promise<Screen | undefined> {
        const r = await c<{ xml?: string }>("screen");
        if (!r?.xml) return undefined;
        const s = parseDump(r.xml);
        const l = loanOf(taskId);
        if (l && s.app && l.app !== s.app) (l.app = s.app), changed();
        return s;
      },
      tap: async (x, y) => void (await c("tap", { x, y })),
      swipe: async (x1, y1, x2, y2, ms) => void (await c("swipe", { x1, y1, x2, y2, ...(ms != null ? { ms } : {}) })),
      key: async (code) => {
        if (!/^KEYCODE_[A-Z0-9_]+$/.test(code)) throw new Error("not a key code");
        await c("key", { code });
      },
      text: async (s) => void (await c("text", { s: s.slice(0, 2000) })),
      front: async () => (await c<{ app: string }>("front"))?.app ?? "",
      apps: async () => (await c<{ apps: { pkg: string; label?: string }[] }>("apps"))?.apps ?? [],
      launch: async (pkg) => {
        if (!/^[A-Za-z][\w]*(\.[\w]+)+$/.test(pkg)) throw new Error(`not an app id: ${pkg}`);
        await c("launch", { pkg });
      },
      size: async () => (await c<{ width: number; height: number }>("size")) ?? { width: 0, height: 0 },
    };
  };

  /** The phone a new phone task would use: an added one, the one connected most recently first. */
  const choose = (): string | undefined => {
    const list = Object.keys(saved).filter(added);
    list.sort((a, b) => (links.has(b) ? 1 : 0) - (links.has(a) ? 1 : 0) || (lastLinked.get(b) ?? 0) - (lastLinked.get(a) ?? 0));
    return list[0];
  };

  const api: Handsets = {
    hello(deviceId, sock, state) {
      const before = links.get(deviceId);
      links.set(deviceId, { sock, state });
      lastLinked.set(deviceId, now());
      // The phone no longer holds a loan the home thought it did (its app restarted, or Stop was
      // tapped while it was away): that loan ended on the phone.
      const l = loans.get(deviceId);
      if (l && state.session !== l.taskId) {
        loans.delete(deviceId);
        stopped.set(l.taskId, HANDSET_STOPPED);
        o.interrupt?.(l.taskId);
        o.tell?.(l.taskId, HANDSET_STOPPED);
      }
      // Android's switch is on (its only use is this) and the person never took 用这台手机 off here:
      // the phone is added, however the switch got on (in an earlier version, from Settings, with the
      // guide closed). Before, only the switch going on while the guide was open added it, so a phone
      // whose switch was on already stayed unadded and phone work fell to Ducter's own phone.
      if (state.service && state.bridge >= HANDSET_BRIDGE && saved[deviceId] === undefined && o.deviceName(deviceId) !== undefined) {
        saved[deviceId] = { added: true };
        write();
        guideOnLink.delete(deviceId);
        for (const [taskId, s] of [...setups]) if (s.device === deviceId && s.go) setups.delete(taskId), void lend(taskId);
      }
      // Android's switch went off on the phone: the chip can't stay on.
      if (saved[deviceId]?.added && before?.state.service && !state.service) {
        /* kept added: the card shows it needs the switch again */
      }
      for (const taskId of [...toStart]) if (bound.get(taskId) === deviceId) void lend(taskId);
      // D247: a card asked to open the guide here while the app was away.
      if (guideOnLink.has(deviceId)) {
        guideOnLink.delete(deviceId);
        for (const [taskId, s] of setups) if (s.device === deviceId && s.go) guide(taskId);
      }
      changed();
    },
    gone(deviceId, sock) {
      const l = links.get(deviceId);
      if (!l || l.sock !== sock) return;
      links.delete(deviceId);
      for (const [id, p] of pending) {
        if (p.device !== deviceId) continue;
        clearTimeout(p.timer);
        pending.delete(id);
        p.reject(new Error(`${name(deviceId)} went away mid-step (the Ducter app on it closed or lost its connection). Try again in a moment.`));
      }
      changed();
    },
    answer(deviceId, r) {
      const p = pending.get(String(r.id ?? ""));
      if (!p || p.device !== deviceId) return;
      clearTimeout(p.timer);
      pending.delete(String(r.id));
      if (r.ok) p.resolve(r.result ?? null);
      else p.reject(new Error(String(r.error ?? "the phone said no")));
    },
    set(deviceId, on) {
      if (o.deviceName(deviceId) === undefined) return { ok: false, reason: "unknown_device" };
      if (!on) {
        for (const l of [...loans.values()]) if (l.device === deviceId) void this.stop(l.taskId);
        // Android's own switch goes off with the chip (the service turns itself off there).
        if (links.has(deviceId)) void call(deviceId, "off").catch(() => {});
        // Kept as not added (not deleted): a switch still on doesn't add it back by itself.
        saved[deviceId] = { added: false };
        write();
        changed();
        return { ok: true };
      }
      const l = links.get(deviceId);
      if (!l) return { ok: false, reason: "not_android" };
      if (l.state.bridge < HANDSET_BRIDGE) return { ok: false, reason: "old_app" };
      if (!l.state.service) return { ok: false, reason: "service_off" };
      saved[deviceId] = { added: true };
      write();
      guideOnLink.delete(deviceId);
      // D247: the tasks whose card the person tapped to turn it on go on now (that tap was their yes).
      for (const [taskId, s] of [...setups]) if (s.device === deviceId && s.go) setups.delete(taskId), void lend(taskId);
      changed();
      return { ok: true };
    },
    async stop(taskId, phone) {
      const ids = taskId ? [taskId] : phone ? [...loans.values()].filter((l) => l.device === phone).map((l) => l.taskId) : [];
      let any = false;
      for (const id of ids) {
        if (!loanOf(id) && !asking.has(id) && !toStart.has(id)) continue;
        any = true;
        stopped.set(id, HANDSET_STOPPED);
        endLoan(id, !phone);
        await o.interrupt?.(id);
        o.tell?.(id, HANDSET_STOPPED);
      }
      return any;
    },
    view(deviceId, platform) {
      const l = links.get(deviceId);
      if (!isAndroidApp(platform) && !l) return undefined;
      const loan = loans.get(deviceId);
      return {
        added: !!saved[deviceId]?.added,
        able: !!l && l.state.bridge >= HANDSET_BRIDGE,
        ...(l ? { state: { sdk: l.state.sdk, model: l.state.model, service: l.state.service, ...(l.state.restricted !== undefined ? { restricted: l.state.restricted } : {}), pictures: l.state.pictures } } : {}),
        linked: !!l,
        ...(loan ? { using: { taskId: loan.taskId, title: taskTitle(loan.taskId), ...(loan.app ? { app: loan.app } : {}) } } : {}),
      };
    },
    any: () => !!choose(),
    offer() {
      const list = [...links.keys()].filter(offerable);
      list.sort((a, b) => (lastLinked.get(b) ?? 0) - (lastLinked.get(a) ?? 0));
      return list[0];
    },
    forTask(taskId, wantsPhone, opts) {
      const b = bound.get(taskId);
      // D247: a task waiting for 用这台手机 to be turned on keeps its phone while the person does it.
      // D251: work for the person's own phone keeps it always (it never falls back to another phone).
      if (b) return mine.has(taskId) || added(b) || setups.has(taskId) || offerable(b) ? b : undefined;
      if (!wantsPhone) return undefined;
      const card = o.tasks.get(taskId);
      if (!card || !ACTIVE.has(String(card.attention))) return undefined;
      const d = choose() ?? (opts?.offer || opts?.mine ? api.offer() : undefined);
      if (d) bound.set(taskId, d);
      if (d && opts?.mine) mine.add(taskId);
      return d;
    },
    device: deviceFor,
    blind: (taskId) => theirTurn.has(taskId),
    note(taskId, d) {
      const l = loanOf(taskId);
      if (!l) return;
      // The pill's second line says what it is doing now, in the person's words (never awaited).
      const line = doingLine(d);
      if (line) void call(l.device, "doing", { session: taskId, line }).catch(() => {});
    },
    where(taskId) {
      const d = bound.get(taskId);
      return d ? { device: d, name: name(d) } : undefined;
    },
    decorate(on) {
      for (const c of on.tasks) {
        const l = loanOf(c.taskId);
        if (l) c.handset = { device: l.device, ...(l.app ? { app: l.app } : {}) };
      }
      return on;
    },
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stopAll() {
      offLog();
      for (const p of pending.values()) clearTimeout(p.timer);
      pending.clear();
    },
  };
  return api;
}
