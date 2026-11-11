// The live view of Ducter's phone (D214; D190's live view, for the phone): its screen as the
// emulator paints it, as JPEG frames the device encodes itself (`screencap -j`, about 80 ms),
// one in flight until the client acks it, at most 6 a second, and none while the screen doesn't
// change. Three ways in: watching a task (its turn), taking the phone yourself (换我来 / My turn),
// and a card's own turn (a sign-in, a code: the task asked with phone_ask_user). In the user's
// turn every task is blind (the phone tools refuse) and taps, swipes, keys and text go in.
// Nothing of a view is logged or written to disk.
import { createHash } from "node:crypto";
import type { PhoneDoingView, PhoneInput, PhoneMode, PhoneServerFrame } from "@ducter/protocol";
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
}

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
  const viewFrame = (v: View, state: "starting" | "open" | "closed", extra: Partial<Extract<PhoneServerFrame, { t: "phone_view" }>> = {}): PhoneServerFrame => ({
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
    ...extra,
  });
  const tellTurns = () => {
    for (const v of views.values()) if (!v.closed) v.sink.send(viewFrame(v, "open"));
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
      const v: View = { id: newId(), sink, mode: o.mode, ...(taskId ? { taskId } : {}), ...(o.decisionId ? { decisionId: o.decisionId } : {}), seq: 0, inflight: false, inflightAt: 0, lastSent: 0, paused: false, closed: false, release: d.device.hold(`view ${o.mode}`) };
      views.set(v.id, v);
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
        if (turn && turn.by !== v.id) {
          const holder = views.get(turn.by);
          turn = { by: v.id, tried: turn.tried };
          if (holder) holder.sink.send(viewFrame(holder, "open"));
        } else turn = { by: v.id, tried: turn?.tried ?? new Set() };
        tellTurns();
      } else giveBack(v);
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
    },
    views: () => [...views.values()].map((v) => ({ id: v.id, mode: v.mode, ...(v.taskId ? { taskId: v.taskId } : {}), turn: turnOf(v) })),
  };
}
