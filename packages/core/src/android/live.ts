// The live view of Ducter's phone (D217; D190's live view, for the phone): its screen as the
// emulator paints it, as JPEG frames the device encodes itself (`screencap -j`, about 80 ms),
// one in flight until the client acks it, at most 6 a second, and none while the screen doesn't
// change. Three ways in: watching a task (its turn), taking the phone yourself (换我来 / My turn),
// and a card's own turn (a sign-in, a code: the task asked with phone_ask_user). In the user's
// turn every task is blind (the phone tools refuse) and taps, swipes, keys and text go in.
// Nothing of a view is logged or written to disk.
// D248: watching never wakes the phone (a view of a phone that isn't running is asleep until 叫醒 /
// Wake, or until a task starts it); My turn asked mid-step is the person's when that step ends;
// and each view gets what the task did (taps, typing, apps; never what it read), kept in memory.
import { createHash } from "node:crypto";
import type { PhoneDidView, PhoneDoingView, PhoneInput, PhoneMode, PhoneServerFrame } from "@ducter/protocol";
import { redact } from "@ducter/protocol/src/redact.ts";
import type { PhoneDevice } from "./device.ts";

export interface PhoneSink {
  send(f: PhoneServerFrame): void;
}

export interface PhoneLiveDeps {
  device: PhoneDevice;
  deviceName: () => string;
  tasks: { get(id: string): { title?: string; harness?: string } | undefined };
  decisions: { isPending(id: string): boolean; decide(id: string, option: "go"): unknown; get(id: string): { taskId?: string } | undefined };
  /** Tell a task something (the hand-back), as a message into it. */
  tell?: (taskId: string, text: string) => unknown;
  maxFps?: number;
  ackTimeoutMs?: number;
  /** D248: how often an asleep view looks whether a task started the phone (ms). */
  asleepPollMs?: number;
  /** D248: the longest My turn waits for a step in flight before it is the person's anyway (ms). */
  stepWaitMs?: number;
}

export interface PhoneLive {
  open(sink: PhoneSink, o: { taskId?: string; decisionId?: string; mode: PhoneMode }): Promise<string | undefined>;
  input(sink: PhoneSink, id: string, input: PhoneInput): Promise<void>;
  ack(sink: PhoneSink, id: string, seq: number): void;
  turn(sink: PhoneSink, id: string, mine: boolean): Promise<void>;
  pause(sink: PhoneSink, id: string, paused: boolean): void;
  close(sink: PhoneSink, id: string, done?: boolean): Promise<void>;
  drop(sink: PhoneSink): Promise<void>;
  /** The user holds the phone: every task is blind. */
  blind(): boolean;
  /** A task tried a tool in the user's turn (told when it's handed back). */
  tried(taskId: string): void;
  /** What a task just did, for its watchers. */
  note(taskId: string, d: PhoneDoingView): void;
  views(): { id: string; mode: PhoneMode; taskId?: string; turn: "agent" | "you" }[];
  /** D248: 叫醒 / Wake: an asleep view starts the phone. */
  wake(sink: PhoneSink, id: string): Promise<void>;
  /** D248: a task's step starts or ends on this phone. */
  acting(taskId: string, on: boolean): void;
  /** D248: what a task did on this phone, newest last (memory only). */
  did(taskId: string): PhoneDidView[];
}

interface View {
  id: string;
  sink: PhoneSink;
  mode: PhoneMode;
  taskId?: string;
  decisionId?: string;
  seq: number;
  inflight: boolean;
  inflightAt: number;
  lastHash?: string;
  lastSent: number;
  paused: boolean;
  closed: boolean;
  timer?: ReturnType<typeof setTimeout>;
  release: () => void;
  /** D248: the phone isn't running and this view didn't start it. */
  asleep?: boolean;
  poll?: ReturnType<typeof setInterval>;
}

/** D248: how many things a task did are kept per task (memory only), and which doings count. */
const DID_KEEP = 8;
const DID_KINDS = new Set(["tap", "type", "swipe", "key", "open"]);

const newId = () => "ph_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const clamp = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const KEYCODES = { back: "KEYCODE_BACK", home: "KEYCODE_HOME", recents: "KEYCODE_APP_SWITCH", enter: "KEYCODE_ENTER", delete: "KEYCODE_DEL" } as const;

export function createPhoneLive(d: PhoneLiveDeps): PhoneLive {
  const views = new Map<string, View>();
  let turn: { by: string; tried: Set<string> } | undefined;
  const minGap = 1000 / (d.maxFps ?? 6);
  const ackTimeout = d.ackTimeoutMs ?? 3_000;
  // One picture serves every view taken within 120 ms of it.
  let shot: { at: number; data: Uint8Array; hash: string } | undefined;
  let taking: Promise<typeof shot> | undefined;
  let app = "";
  // D248: steps in flight per task, and a My turn waiting for them to end.
  const steps = new Map<string, number>();
  let asked: { by: string; timer: ReturnType<typeof setTimeout> } | undefined;
  const didOf = new Map<string, PhoneDidView[]>();
  const stepping = () => [...steps.values()].some((n) => n > 0);

  const capture = async () => {
    if (shot && Date.now() - shot.at < 120) return shot;
    taking ??= (async () => {
      try {
        const data = await d.device.jpeg();
        shot = { at: Date.now(), data, hash: createHash("sha1").update(data).digest("hex") };
        return shot;
      } finally {
        taking = undefined;
      }
    })();
    return taking;
  };

  const turnOf = (v: View): "agent" | "you" => (turn ? "you" : "agent");
  const taskInfo = (taskId?: string) => {
    const c = taskId ? d.tasks.get(taskId) : undefined;
    return c?.title ? { title: redact(c.title), harness: c.harness ?? "" } : undefined;
  };
  const viewFrame = (v: View, state: "asleep" | "starting" | "open" | "closed", extra: Partial<Extract<PhoneServerFrame, { t: "phone_view" }>> = {}): PhoneServerFrame => ({
    t: "phone_view",
    id: v.id,
    state,
    mode: v.mode,
    turn: turnOf(v),
    here: turn?.by === v.id,
    device: d.deviceName(),
    ...(v.taskId ? { taskId: v.taskId } : {}),
    ...((t) => (t ? { task: t } : {}))(taskInfo(v.taskId)),
    ...(v.decisionId ? { decisionId: v.decisionId } : {}),
    ...(asked?.by === v.id ? { taking: true } : {}),
    ...extra,
  });
  const tellTurns = () => {
    for (const v of views.values()) if (!v.closed) v.sink.send(viewFrame(v, v.asleep ? "asleep" : "open"));
  };
  const sendDid = (v: View) => {
    if (v.mode !== "watch" || !v.taskId) return;
    const did = didOf.get(v.taskId);
    if (did?.length) v.sink.send({ t: "phone_did", id: v.id, did: [...did] });
  };
  /** The turn becomes this view's (the person's): every task on this phone is blind. */
  const grant = (v: View) => {
    if (asked) clearTimeout(asked.timer), (asked = undefined);
    if (v.closed) return;
    if (turn && turn.by !== v.id) {
      const holder = views.get(turn.by);
      turn = { by: v.id, tried: turn.tried };
      if (holder) holder.sink.send(viewFrame(holder, "open"));
    } else turn = { by: v.id, tried: turn?.tried ?? new Set() };
    tellTurns();
  };
  /** Wakes an asleep view: hold the phone, start it (start: false when a task already is), then frames. */
  const rouse = async (v: View, start: boolean) => {
    if (!v.asleep || v.closed) return;
    v.asleep = false;
    if (v.poll) clearInterval(v.poll), (v.poll = undefined);
    v.release = d.device.hold(`view ${v.mode}`);
    v.sink.send(viewFrame(v, d.device.state() === "running" ? "open" : "starting"));
    try {
      await d.device.ensure();
    } catch (e) {
      await closeView(v, "failed", (e as Error).message);
      return;
    }
    if (v.closed) return;
    app = await d.device.front().catch(() => app);
    v.sink.send(viewFrame(v, "open"));
    sendDid(v);
    pump(v);
    void start;
  };

  const pump = (v: View) => {
    if (v.closed || v.paused || v.timer) return;
    const now = Date.now();
    if (v.inflight && now - v.inflightAt < ackTimeout) return void (v.timer = setTimeout(() => ((v.timer = undefined), pump(v)), ackTimeout - (now - v.inflightAt)));
    const wait = Math.max(0, minGap - (now - v.lastSent));
    v.timer = setTimeout(async () => {
      v.timer = undefined;
      if (v.closed || v.paused) return;
      try {
        const s = await capture();
        if (!s || v.closed) return;
        // A still screen sends nothing; look again in a moment.
        if (s.hash === v.lastHash) return void (v.timer = setTimeout(() => ((v.timer = undefined), pump(v)), 250));
        v.lastHash = s.hash;
        v.seq += 1;
        v.inflight = true;
        v.inflightAt = Date.now();
        v.lastSent = Date.now();
        const { width, height } = await d.device.size();
        v.sink.send({ t: "phone_frame", id: v.id, seq: v.seq, data: Buffer.from(s.data).toString("base64"), width, height, ...(app ? { app } : {}) });
      } catch {
        // The phone went away (stopped, restarting): try again shortly.
        v.timer = setTimeout(() => ((v.timer = undefined), pump(v)), 1_000);
      }
    }, wait);
  };

  const mine = (sink: PhoneSink, id: string) => {
    const v = views.get(id);
    return v && v.sink === sink && !v.closed ? v : undefined;
  };

  const giveBack = (v: View) => {
    if (turn?.by !== v.id) return;
    const tried = turn.tried;
    turn = undefined;
    d.device.touch();
    for (const taskId of tried) void d.tell?.(taskId, "Ducter's phone is yours again: the user has finished using it (you saw nothing while they did). phone_look before your next step, then carry on.");
    tellTurns();
  };

  const closeView = async (v: View, reason: "done" | "closed" | "replaced" | "gone" | "failed", message?: string) => {
    if (v.closed) return;
    v.closed = true;
    if (v.timer) clearTimeout(v.timer);
    if (v.poll) clearInterval(v.poll);
    if (asked?.by === v.id) clearTimeout(asked.timer), (asked = undefined);
    views.delete(v.id);
    giveBack(v);
    v.release();
    v.sink.send(viewFrame(v, "closed", { reason, ...(message ? { message } : {}) }));
  };

  return {
    async open(sink, o) {
      // A card's own turn, or taking the phone: only one window holds the user's turn.
      if (o.mode !== "watch" && turn) {
        const holder = views.get(turn.by);
        if (holder && holder.sink !== sink) await closeView(holder, "replaced");
      }
      if (o.mode === "signin" && o.decisionId && !d.decisions.isPending(o.decisionId)) {
        sink.send({ t: "phone_view", id: "", state: "closed", mode: o.mode, turn: "agent", here: false, device: d.deviceName(), decisionId: o.decisionId, reason: "failed", message: "this card was already answered" });
        return undefined;
      }
      const taskId = o.taskId ?? (o.decisionId ? d.decisions.get(o.decisionId)?.taskId : undefined);
      // D248: watching a phone that isn't running never starts it: the view is asleep until 叫醒 /
      // Wake, or until a task starts the phone (looked for every couple of seconds).
      const st = d.device.state();
      const asleep = o.mode === "watch" && (st === "stopped" || st === "stopping");
      const v: View = { id: newId(), sink, mode: o.mode, ...(taskId ? { taskId } : {}), ...(o.decisionId ? { decisionId: o.decisionId } : {}), seq: 0, inflight: false, inflightAt: 0, lastSent: 0, paused: false, closed: false, release: asleep ? () => {} : d.device.hold(`view ${o.mode}`), ...(asleep ? { asleep: true } : {}) };
      views.set(v.id, v);
      if (asleep) {
        sink.send(viewFrame(v, "asleep"));
        sendDid(v);
        v.poll = setInterval(() => {
          const now = d.device.state();
          if (now === "running" || now === "starting") void rouse(v, false);
        }, d.asleepPollMs ?? 2_000);
        return v.id;
      }
      if (o.mode !== "watch") turn = { by: v.id, tried: new Set() };
      sink.send(viewFrame(v, d.device.state() === "running" ? "open" : "starting"));
      try {
        await d.device.ensure();
      } catch (e) {
        await closeView(v, "failed", (e as Error).message);
        return undefined;
      }
      if (v.closed) return undefined;
      app = await d.device.front().catch(() => app);
      sink.send(viewFrame(v, "open"));
      if (o.mode !== "watch") tellTurns();
      sendDid(v);
      pump(v);
      return v.id;
    },
    async input(sink, id, input) {
      const v = mine(sink, id);
      if (!v || turn?.by !== v.id) return; // only the window holding the user's turn
      const { width, height } = await d.device.size();
      d.device.touch();
      switch (input.kind) {
        case "tap":
          if (input.long) await d.device.swipe(clamp(input.x) * width, clamp(input.y) * height, clamp(input.x) * width, clamp(input.y) * height, 700);
          else await d.device.tap(clamp(input.x) * width, clamp(input.y) * height);
          break;
        case "swipe":
          await d.device.swipe(clamp(input.x1) * width, clamp(input.y1) * height, clamp(input.x2) * width, clamp(input.y2) * height, Math.min(1500, Math.max(80, Number(input.ms) || 300)));
          break;
        case "key": {
          const k = KEYCODES[input.key];
          if (k) await d.device.key(k);
          break;
        }
        case "text":
          // ASCII goes in as typed; other text (中文…) through the phone's clipboard (device.ts).
          await d.device.text(String(input.text ?? "").slice(0, 500)).catch(() => {});
          break;
      }
      shot = undefined;
      v.lastHash = undefined;
      app = await d.device.front().catch(() => app);
    },
    ack(sink, id, seq) {
      const v = mine(sink, id);
      if (!v || seq !== v.seq) return;
      v.inflight = false;
      pump(v);
    },
    async turn(sink, id, want) {
      const v = mine(sink, id);
      if (!v) return;
      if (want) {
        // D248: a task mid-step finishes that step first (a tap half done is the worst of both);
        // the turn is the person's the moment it ends, or after stepWaitMs at most.
        if (!turn && stepping()) {
          if (asked) clearTimeout(asked.timer);
          asked = { by: v.id, timer: setTimeout(() => grant(v), d.stepWaitMs ?? 8_000) };
          v.sink.send(viewFrame(v, v.asleep ? "asleep" : "open"));
          return;
        }
        grant(v);
      } else {
        if (asked?.by === v.id) {
          clearTimeout(asked.timer);
          asked = undefined;
          v.sink.send(viewFrame(v, v.asleep ? "asleep" : "open"));
        }
        giveBack(v);
      }
    },
    pause(sink, id, paused) {
      const v = mine(sink, id);
      if (!v) return;
      v.paused = paused;
      if (!paused) (v.lastHash = undefined), pump(v);
    },
    async close(sink, id, done) {
      const v = mine(sink, id);
      if (!v) return;
      const decisionId = v.decisionId;
      await closeView(v, done ? "done" : "closed");
      if (done && decisionId && d.decisions.isPending(decisionId)) d.decisions.decide(decisionId, "go");
    },
    async wake(sink, id) {
      const v = mine(sink, id);
      if (v?.asleep) await rouse(v, true);
    },
    acting(taskId, on) {
      const n = Math.max(0, (steps.get(taskId) ?? 0) + (on ? 1 : -1));
      if (n) steps.set(taskId, n);
      else steps.delete(taskId);
      if (!on && asked && !stepping()) {
        const v = views.get(asked.by);
        if (v) grant(v);
        else clearTimeout(asked.timer), (asked = undefined);
      }
    },
    did: (taskId) => [...(didOf.get(taskId) ?? [])],
    async drop(sink) {
      for (const v of [...views.values()]) if (v.sink === sink) await closeView(v, "gone");
    },
    blind: () => !!turn,
    tried(taskId) {
      turn?.tried.add(taskId);
    },
    note(taskId, doing) {
      for (const v of views.values()) if (!v.closed && v.mode === "watch" && (!v.taskId || v.taskId === taskId)) v.sink.send({ t: "phone_doing", id: v.id, doing });
      shot = undefined;
      // D248: what it did (never what it read: looks and pictures aren't kept), labels only.
      if (DID_KINDS.has(doing.kind)) {
        const list = didOf.get(taskId) ?? [];
        list.push({ kind: doing.kind as PhoneDidView["kind"], ...(doing.label ? { label: doing.label.split(" · ")[0] } : {}), ...(doing.app ? { app: doing.app } : {}), at: Date.now() });
        if (list.length > DID_KEEP) list.splice(0, list.length - DID_KEEP);
        didOf.set(taskId, list);
        for (const v of views.values()) if (!v.closed && v.mode === "watch" && v.taskId === taskId) sendDid(v);
      }
    },
    views: () => [...views.values()].map((v) => ({ id: v.id, mode: v.mode, ...(v.taskId ? { taskId: v.taskId } : {}), turn: turnOf(v) })),
  };
}
