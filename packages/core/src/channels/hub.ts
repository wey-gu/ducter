// D276 (design/channels.md): 聊天软件 / Chat apps, the hub. A chat app is another window on the one
// conversation, never another conversation:
//  - Inbound: the linked account's words go through the same path the apps use (logUserMessage,
//    with via and the service's message id as clientId; a reply there is a D236 reply; pictures
//    and files are D206/D259 media); a button is decisions.decide. Anyone else gets silence.
//  - Outbound, by rule (never by the model): the partner's answers to a turn started in the chat
//    app go back there; turns started in an app are not mirrored. What Ducter starts itself (a
//    note of finds, a late result, a question) goes to the one place the person last spoke from,
//    once, under the quiet hours and the bar of push; the app's push is skipped for that item.
//  - Decisions: buttons only for reversible cards; anything that reaches people, devices or merges
//    is its one sentence plus 在 Ducter 里看看 / Open in Ducter; money, sign-ins and keys never go
//    to a chat app. A card answered anywhere is edited there to its end state.
//  - The living message: only a status line is edited in place; anything new is a new message.
import type { Bodies, ChannelKind, ChannelView, LogEvent, ReplyWant, ServerFrame } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { redact } from "@ducter/protocol/src/redact.ts";
import { realClock, type Clock } from "../clock.ts";
import type { MediaStore } from "../media.ts";
import { defaultLine, inQuiet, quietEndsAt, type Quiet } from "../push.ts";
import { logUserMessage, type ReplyDecisions } from "../reply.ts";
import { cutPoints } from "./format.ts";
import { createOutbox, type Outbox } from "./outbox.ts";
import { ChannelError, type BotInfo, type Channel, type InMessage, type InTap, type OutButton, type Trouble } from "./port.ts";
import { createSlack, isSlackAppToken, isSlackBotToken, slackManifest } from "./slack.ts";
import { openChannelStore, type ChannelRec, type ChannelStore } from "./store.ts";
import { createTelegram, isTelegramToken } from "./telegram.ts";

/** A turn started in a chat app is "now" for this long: its answers, asks and status go there at once. */
export const TURN_MS = 15 * 60_000;
/** A task's question waits this long for the partner's own words about it (D129) before its own. */
export const WORDS_MS = 20_000;
/** A job still running this long after its ack gets one status line, edited in place after. */
export const STATUS_AFTER_MS = 60_000;
/** Telegram's typing lasts about 5 s: it is said again every 4 s, at most this long. */
export const TYPING_EVERY_MS = 4_000;
export const TYPING_MAX_MS = 120_000;
/** A typed 好 / ok answers the newest card with buttons only while it is this fresh. */
export const GO_WORD_MS = 24 * 3600_000;
const DAY_MS = 24 * 3600_000;

const GO_WORDS = /^(好|好的|好啊|行|可以|嗯|ok|okay|go|yes|sure)[\s!！。.~～]*$/i;
const HOLD_WORDS = /^(先等等|等等|先别|先不|不用|hold|wait|not now|no)[\s!！。.~～]*$/i;

export interface ChannelDeps {
  dataDir: string;
  log: LogStore;
  decisions: ReplyDecisions;
  media?: Pick<MediaStore, "put" | "path">;
  clock?: Clock;
  /** The quiet hours in force (push.ts effectiveSettings), and whether notifications are off. */
  quiet: () => Quiet | null;
  notifyOff?: () => boolean;
  zh: () => boolean;
  personaName: () => string;
  /** The home's https address when it has one (D228), for 在 Ducter 里看看 / Open in Ducter. */
  openUrl?: () => string | undefined;
  /** Tests: the adapters against fakes. */
  make?: (kind: ChannelKind, rec: ChannelRec, store: ChannelStore) => Channel;
  sleep?: (ms: number) => Promise<void>;
  gapMs?: number;
}

export interface Channels {
  view(): ChannelView[];
  frame(): Extract<ServerFrame, { t: "channels" }>;
  connect(kind: ChannelKind, t: { token?: string; botToken?: string; appToken?: string }): Promise<{ ok: boolean; reason?: "token" | "network" }>;
  code(kind: ChannelKind): { ok: true; code: string; link?: string; expiresAt: number } | { ok: false; reason: "not_connected" | "busy" };
  unlink(kind: ChannelKind): boolean;
  forget(kind: ChannelKind): void;
  /** Push asks: did a chat app already carry this item (d:<decisionId>, n:<noteId>)? */
  claimed(key: string): boolean;
  /** Where the person last spoke to the partner. */
  lastRoute(): ChannelKind | "app";
  onChange(fn: () => void): () => void;
  /** The partner's turn ended (core's activity went quiet): no more typing. */
  turnEnded(): void;
  /** Starts the chat apps that were connected before. */
  start(): Promise<void>;
  stop(): void;
  /** Resolves when nothing is waiting to be sent (tests). */
  idle(): Promise<void>;
}

type Policy = "buttons" | "open" | "never";

/** research/79 §6: which cards a chat app may answer with a button. */
export function cardPolicy(d: Bodies["decision"]): Policy {
  if (d.pay || d.key || d.fill || d.signIn) return "never";
  if (!d.reversible || d.phone || d.computer || d.handset || d.call || d.cal || d.anywhere || d.memPlugin || d.asker || d.trust || d.findId) return "open";
  return "buttons";
}

interface Live {
  ch: Channel;
  bot?: BotInfo;
  up: boolean;
  trouble?: Trouble;
}
interface Card {
  kind: ChannelKind;
  chat: string;
  ids: string[];
  words: string;
  policy: Policy;
  at: number;
}
interface Job {
  kind: ChannelKind;
  chat: string;
  title: string;
  statusId?: string;
  timer?: unknown;
  done?: boolean;
  finalLine?: string;
}

export function createChannels(deps: ChannelDeps): Channels {
  const clock = deps.clock ?? realClock;
  const { log, decisions } = deps;
  const store = openChannelStore(deps.dataDir, { now: () => clock.now() });
  const live = new Map<ChannelKind, Live>();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());
  const outbox: Outbox = createOutbox({ sleep: deps.sleep, now: () => clock.now(), gapMs: deps.gapMs });
  const claims = new Set<string>();
  const seenIds = new Set<string>(); // clientIds already logged
  const seqOf = new Map<string, number>(); // "<kind>:<chat>:<service id>" → Log seq
  const svcOf = new Map<number, { kind: ChannelKind; chat: string; id: string }>(); // Log seq → the message there
  const cards = new Map<string, Card>();
  const words = new Map<string, { timer: unknown; send: (w: string) => void }>();
  const jobs = new Map<string, Job>();
  const typing = new Map<ChannelKind, { until: number; timer?: unknown }>();
  const held: { decisionId?: string; run: () => void }[] = [];
  let releaseTimer: unknown;
  let lastUser: { seq: number; via?: ChannelKind; at: number } | undefined;
  let fromChat = 0; // >0 while the hub itself logs a message or a decision (synchronous appends)
  const zh = () => deps.zh();
  const W = {
    linked: () => (zh() ? "连上了。以后在这儿跟我说就行。" : "Linked. Talk to me here any time."),
    open: () => (zh() ? "在 Ducter 里看看" : "Open in Ducter"),
    never: () => (zh() ? "有件事要你在 Ducter 里确认。" : "Something needs you in Ducter."),
    settled: () => (zh() ? "这件定了。" : "That's settled."),
    already: () => (zh() ? "这件已经定了" : "Already decided"),
    hold: () => (zh() ? "先等等" : "Hold"),
    go: (label: string) => (zh() ? `好，${label || "就这样"}` : `Go: ${label || "OK"}`),
    said: (s: string) => (zh() ? `你说：${s}` : `You said: ${s}`),
    byDefault: () => (zh() ? "你没回，我照原计划做了" : "No answer, so I went ahead"),
    still: (t: string) => (zh() ? `还在做：${t}…` : `Still on it: ${t}…`),
    done: (t: string) => (zh() ? `做完了：${t}` : `Done: ${t}`),
    failed: (t: string) => (zh() ? `没做成：${t}` : `Didn't work: ${t}`),
  };

  // ---------- what is up ----------

  const linkedOf = (kind: ChannelKind) => store.get(kind)?.linked;
  const ready = (kind: ChannelKind) => {
    const l = live.get(kind);
    return l?.up && !l.trouble && linkedOf(kind) ? l : undefined;
  };

  const view = (): ChannelView[] =>
    (["telegram", "slack"] as const).map((kind): ChannelView => {
      const rec = store.get(kind);
      if (!rec) return { kind, state: "off" };
      const l = live.get(kind);
      const bot = rec.bot ? { name: rec.bot.name, ...(rec.bot.handle ? { handle: rec.bot.handle } : {}), ...(rec.bot.team ? { team: rec.bot.team } : {}) } : undefined;
      const base = { kind, ...(bot ? { bot } : {}), ...(rec.linked ? { linked: { name: rec.linked.name, at: rec.linked.at } } : {}), ...(rec.strangerAt ? { strangerAt: rec.strangerAt } : {}) };
      if (l?.trouble) return { ...base, state: "cant_connect", reason: l.trouble };
      if (!l?.up) return { ...base, state: "starting" };
      return { ...base, state: rec.linked ? "linked" : "unlinked" };
    });

  const setTrouble = (kind: ChannelKind, t: Trouble | undefined) => {
    const l = live.get(kind);
    if (!l || l.trouble === t) return;
    l.trouble = t;
    changed();
  };

  // ---------- sending ----------

  /** Says text in that chat, split to the app's length; buttons under the last part. Returns the ids. */
  const say = (kind: ChannelKind, text: string, o: { buttons?: OutButton[]; replyTo?: string; silent?: boolean; seq?: number } = {}): Promise<string[]> => {
    const l = live.get(kind);
    const acc = linkedOf(kind);
    if (!l || !acc) return Promise.resolve([]);
    stopTyping(kind);
    // D152: every key in it hidden, exactly as a client sees the Log.
    text = redact(text);
    const max = l.ch.caps.maxText - 64;
    const parts = cutPoints(text, max).map(([s, e]) => text.slice(s, e));
    const ids: string[] = [];
    const chat = acc.chat;
    const run = async () => {
      for (let i = 0; i < parts.length; i++) {
        const last = i === parts.length - 1;
        try {
          const id = await outbox.run(`${kind}:${chat}`, () =>
            l.ch.send(chat, { text: parts[i]!, ...(last && o.buttons?.length && l.ch.caps.buttons ? { buttons: o.buttons } : {}), ...(i === 0 && o.replyTo ? { replyTo: o.replyTo } : {}), ...(o.silent && l.ch.caps.silent ? { silent: true } : {}) }),
          );
          ids.push(id);
          if (o.seq !== undefined) {
            seqOf.set(`${kind}:${chat}:${id}`, o.seq);
            if (i === 0) svcOf.set(o.seq, { kind, chat, id });
          }
        } catch (err) {
          troubled(kind, err);
          console.warn(`[channels] ${kind}: a message wasn't sent: ${(err as Error).message}`);
          return ids;
        }
      }
      return ids;
    };
    return run();
  };

  const troubled = (kind: ChannelKind, err: unknown) => {
    if (err instanceof ChannelError && (err.trouble === "token" || err.trouble === "blocked")) setTrouble(kind, err.trouble);
  };

  const edit = (kind: ChannelKind, chat: string, id: string, text: string, buttons?: OutButton[]) => {
    const l = live.get(kind);
    if (!l || !l.ch.caps.edit) return Promise.resolve();
    return outbox
      .run(`${kind}:${chat}`, () => l.ch.edit(chat, id, { text: redact(text).slice(0, l.ch.caps.maxText - 64), ...(buttons?.length ? { buttons } : {}) }), { send: false })
      .catch((err) => (troubled(kind, err), console.warn(`[channels] ${kind}: an edit wasn't made: ${(err as Error).message}`)));
  };

  const sendMedia = (kind: ChannelKind, media: Bodies["ai_msg"]["media"]) => {
    const l = live.get(kind);
    const acc = linkedOf(kind);
    if (!l || !acc || !media?.length || !l.ch.caps.files || !deps.media) return;
    for (const m of media.slice(0, 10)) {
      const path = deps.media.path(m.id);
      if (!path || m.bytes > l.ch.caps.maxUpload) continue;
      void outbox
        .run(`${kind}:${acc.chat}`, () => l.ch.sendFile(acc.chat, { path, name: m.name ?? (m.type.startsWith("image/") ? `picture.${m.type.split("/")[1]}` : "file"), type: m.type }))
        .catch((err) => (troubled(kind, err), console.warn(`[channels] ${kind}: a file wasn't sent: ${(err as Error).message}`)));
    }
  };

  // Telegram's typing, while a turn started there waits for its first words.
  const stopTyping = (kind: ChannelKind) => {
    const t = typing.get(kind);
    if (t?.timer) clock.clearTimeout(t.timer);
    typing.delete(kind);
  };
  const startTyping = (kind: ChannelKind) => {
    const l = ready(kind);
    if (!l?.ch.caps.typing) return;
    stopTyping(kind);
    const chat = linkedOf(kind)!.chat;
    const t = { until: clock.now() + TYPING_MAX_MS, timer: undefined as unknown };
    const beat = () => {
      if (typing.get(kind) !== t || clock.now() > t.until) return void (typing.get(kind) === t && typing.delete(kind));
      void l.ch.typing(chat).catch(() => {});
      t.timer = clock.setTimeout(beat, TYPING_EVERY_MS);
    };
    typing.set(kind, t);
    beat();
  };

  // ---------- where things go ----------

  /** The chat app a turn's answer goes to now: the turn's own, while it is now; else the person's place. */
  type Route = { kind: ChannelKind; mode: "turn" | "own" };
  const placeNow = (): ChannelKind | undefined => {
    const r = store.lastRoute();
    return r !== "app" && ready(r) ? r : undefined;
  };
  const routeOf = (replyTo: number | undefined): Route | undefined => {
    if (replyTo === undefined) return undefined;
    const u = userAt(replyTo);
    const place = placeNow();
    // Words about something Ducter started (a report, a routine): its own, to the person's place.
    if (!u) return place ? { kind: place, mode: "own" } : undefined;
    // A turn that is still now answers where it started; an app's turn is not mirrored.
    if (clock.now() - u.at < TURN_MS) return u.via && ready(u.via) ? { kind: u.via, mode: "turn" } : undefined;
    // A late result: to the person's place, once.
    return place ? { kind: place, mode: "own" } : undefined;
  };
  type UserAt = { seq: number; via?: ChannelKind; at: number };
  /** D277: iMessage is the Mac app's own bridge, not one of this hub's chat apps: for routing here it
   *  counts as the apps (the bridge answers its own turns; its push rule is core's channelUp). */
  const hubVia = (v: Bodies["user_msg"]["via"]): ChannelKind | undefined => (v === "imessage" ? undefined : v);
  const users = new Map<number, UserAt>(); // the person's messages this run (seq → where, when)
  const userAt = (seq: number): UserAt | undefined => {
    const known = users.get(seq);
    if (known) return known;
    const e = log.read({ fromSeq: seq, limit: 1 })[0];
    if (!e || e.seq !== seq || e.kind !== "user_msg") return undefined;
    const b = e.body as Bodies["user_msg"];
    // From before a restart: its time in the Log.
    const via = hubVia(b.via);
    return { seq, ...(via ? { via } : {}), at: Date.parse(e.ts) || 0 };
  };

  /** What Ducter starts itself: never while notifications are off; held through quiet hours. */
  const own = (run: () => void, decisionId?: string): boolean => {
    if (deps.notifyOff?.()) return false;
    const now = clock.now();
    const q = deps.quiet();
    if (inQuiet(now, q)) {
      held.push({ ...(decisionId ? { decisionId } : {}), run });
      if (!releaseTimer) releaseTimer = clock.setTimeout(release, quietEndsAt(now, q) - now + 1000);
      return true;
    }
    run();
    return true;
  };
  const release = () => {
    releaseTimer = undefined;
    const q = deps.quiet();
    if (inQuiet(clock.now(), q)) return void (releaseTimer = clock.setTimeout(release, quietEndsAt(clock.now(), q) - clock.now() + 1000));
    for (const h of held.splice(0)) if (!h.decisionId || decisions.isPending(h.decisionId)) h.run();
  };

  // ---------- decisions ----------

  const tapData = (option: "go" | "hold", id: string) => `${option === "go" ? "g" : "h"}:${id}`;
  const openButton = (decisionId?: string): OutButton[] => {
    const base = deps.openUrl?.();
    if (!base) return [];
    return [{ label: W.open(), url: `${base.replace(/\/?$/, "/")}app${decisionId ? `#d=${encodeURIComponent(decisionId)}` : ""}` }];
  };
  const openLine = (kind: ChannelKind, decisionId?: string) => (openButton(decisionId).length && live.get(kind)?.ch.caps.buttons ? "" : `\n\n${W.open()}`);

  const sendCard = (kind: ChannelKind, d: Bodies["decision"], said: string, seq: number, mode: Route["mode"]) => {
    const policy = cardPolicy(d);
    const acc = linkedOf(kind);
    if (!acc || cards.has(d.decisionId)) return;
    const card: Card = { kind, chat: acc.chat, ids: [], words: said, policy, at: clock.now() };
    cards.set(d.decisionId, card);
    let text: string;
    let buttons: OutButton[];
    if (policy === "never") {
      card.words = W.never();
      text = W.never() + openLine(kind, d.decisionId);
      buttons = openButton(d.decisionId);
    } else if (policy === "open") {
      text = said + openLine(kind, d.decisionId);
      buttons = openButton(d.decisionId);
    } else {
      text = `${said}\n\n_${defaultLine(d, zh() ? "zh" : "en", clock.now())}_`;
      buttons = [{ label: W.go(d.goLabel), data: tapData("go", d.decisionId), style: "primary" }, { label: W.hold(), data: tapData("hold", d.decisionId) }];
    }
    void say(kind, text, { buttons, seq }).then((ids) => {
      card.ids = ids;
      // Settled while it was on its way: show the end state at once.
      if (!decisions.isPending(d.decisionId)) settleCard(d.decisionId);
    });
  };

  const endLine = (r: Bodies["decision_resolved"], d: Bodies["decision"] | undefined) => {
    if (r.by === "default") return W.byDefault();
    if (r.option === "go") return W.said(W.go(d?.goLabel ?? ""));
    if (r.option === "hold") return W.said(W.hold());
    return W.said((r.text ?? "").slice(0, 120));
  };
  const resolvedOf = new Map<string, Bodies["decision_resolved"]>();
  const settleCard = (decisionId: string) => {
    const c = cards.get(decisionId);
    const r = resolvedOf.get(decisionId);
    if (!c || !r || !c.ids.length) return;
    const text = c.policy === "never" ? `${c.words}\n\n${W.settled()}` : `${c.words}\n\n${endLine(r, decisions.get(decisionId))}`;
    void edit(c.kind, c.chat, c.ids[c.ids.length - 1]!, text);
  };

  const onDecision = (e: LogEvent) => {
    const d = e.body as Bodies["decision"];
    if (d.findId) return; // a find's step rides in its note (D165)
    let route: Route | undefined;
    const place = placeNow();
    // Asked during a turn that is still now: where it started (an app's turn: not mirrored).
    if (lastUser && clock.now() - lastUser.at < TURN_MS) route = lastUser.via && ready(lastUser.via) ? { kind: lastUser.via, mode: "turn" } : undefined;
    else if (place) route = { kind: place, mode: "own" };
    if (!route || (route.mode === "own" && deps.notifyOff?.())) return;
    const r = route;
    // The partner's own words about a task's question (D129), when they come in time.
    const go = (said: string) => {
      const w = words.get(d.decisionId);
      if (w) clock.clearTimeout(w.timer), words.delete(d.decisionId);
      if (!decisions.isPending(d.decisionId)) return;
      const run = () => sendCard(r.kind, d, said, e.seq, r.mode);
      if (r.mode === "own") own(run, d.decisionId);
      else run();
    };
    claims.add(`d:${d.decisionId}`);
    if (d.taskId && !d.call) words.set(d.decisionId, { timer: clock.setTimeout(() => go(d.question), WORDS_MS), send: go });
    else go(d.question);
  };

  // ---------- jobs: one status line, edited in place ----------

  const onAck = (b: Bodies["ack"], seq: number) => {
    const r = routeOf(b.replyTo);
    if (!r) return;
    const acc = linkedOf(r.kind);
    if (!acc) return;
    const run = () => void say(r.kind, b.text, { seq });
    if (r.mode === "own") own(run);
    else run();
    const job: Job = { kind: r.kind, chat: acc.chat, title: b.text };
    jobs.set(b.jobId, job);
    job.timer = clock.setTimeout(() => {
      job.timer = undefined;
      if (job.done || jobs.get(b.jobId) !== job || !ready(job.kind) || inQuiet(clock.now(), deps.quiet())) return;
      void say(job.kind, W.still(job.title), { silent: true }).then((ids) => {
        job.statusId = ids[0];
        if (job.done && job.statusId) void edit(job.kind, job.chat, job.statusId, job.finalLine!);
      });
    }, STATUS_AFTER_MS);
  };
  const onJob = (b: Bodies["job_status"]) => {
    const job = jobs.get(b.jobId);
    if (!job) return;
    if (b.text) job.title = b.text;
    if (b.state === "running") {
      if (job.statusId) void edit(job.kind, job.chat, job.statusId, W.still(job.title));
      return;
    }
    job.done = true;
    job.finalLine = b.state === "done" ? W.done(job.title) : W.failed(job.title);
    if (job.timer) clock.clearTimeout(job.timer);
    if (job.statusId) void edit(job.kind, job.chat, job.statusId, job.finalLine);
    jobs.delete(b.jobId);
  };

  // ---------- the Log, followed ----------

  const off = log.subscribe((e) => {
    try {
      switch (e.kind) {
        case "user_msg": {
          if (e.origin !== "user") return;
          const b = e.body as Bodies["user_msg"];
          const via = hubVia(b.via);
          lastUser = { seq: e.seq, ...(via ? { via } : {}), at: clock.now() };
          users.set(e.seq, lastUser);
          if (users.size > 500) users.delete(users.keys().next().value!);
          store.setLastRoute(via ?? "app");
          if (via) startTyping(via);
          return;
        }
        case "ack":
          return onAck(e.body as Bodies["ack"], e.seq);
        case "job_status":
          return onJob(e.body as Bodies["job_status"]);
        case "ai_msg": {
          const b = e.body as Bodies["ai_msg"];
          if (b.decisionId) return void words.get(b.decisionId)?.send(b.text);
          if (!b.text.trim() && !b.media?.length) return;
          const r = routeOf(b.replyTo);
          if (!r) return;
          // A late answer quotes the message it answers, so it never reads as about the last one.
          const quoted = r.mode === "own" && b.replyTo !== undefined ? svcOf.get(b.replyTo) : undefined;
          const run = () => {
            if (b.text.trim()) void say(r.kind, b.text, { seq: e.seq, ...(quoted && quoted.kind === r.kind ? { replyTo: quoted.id } : {}) });
            sendMedia(r.kind, b.media);
          };
          if (r.mode === "own") own(run);
          else run();
          return;
        }
        case "finds": {
          const b = e.body as Bodies["finds"];
          if (b.quiet || b.revises || !b.finds.length) return;
          const place = placeNow();
          if (!place) return;
          const text = [b.opening, ...b.finds.map((f) => `• ${f.text}`), ...(b.leftOut ? [b.leftOut] : [])].filter(Boolean).join("\n");
          if (own(() => void say(place, text + openLine(place), { seq: e.seq, buttons: openButton() }))) claims.add(`n:${b.noteId}`);
          return;
        }
        case "decision":
          return onDecision(e);
        case "decision_resolved": {
          const r = e.body as Bodies["decision_resolved"];
          resolvedOf.set(r.decisionId, r);
          if (resolvedOf.size > 500) resolvedOf.delete(resolvedOf.keys().next().value!);
          const w = words.get(r.decisionId);
          if (w) clock.clearTimeout(w.timer), words.delete(r.decisionId);
          // Answered in an app: that is where the person is now.
          if (e.origin === "user" && r.by === "user" && !fromChat) store.setLastRoute("app");
          settleCard(r.decisionId);
          return;
        }
      }
    } catch (err) {
      console.warn("[channels] following the Log:", (err as Error).message);
    }
  });

  // ---------- inbound ----------

  const remember = (clientId: string) => {
    seenIds.add(clientId);
    if (seenIds.size > 5000) seenIds.delete(seenIds.values().next().value!);
  };
  for (const e of log.read({ stream: "channel", kinds: ["user_msg"], limit: 500 })) {
    const id = (e.body as Bodies["user_msg"]).clientId;
    if (id && /^(telegram|slack):/.test(id)) remember(id);
  }

  const stranger = (kind: ChannelKind) => {
    const at = store.get(kind)?.strangerAt;
    if (at && clock.now() - Date.parse(at) < DAY_MS) return;
    store.patch(kind, { strangerAt: new Date(clock.now()).toISOString() });
    changed();
  };

  const inbound = async (kind: ChannelKind, m: InMessage) => {
    const rec = store.get(kind);
    if (!rec || !m.direct) return; // groups and channels are never the person's window: silence
    const acc = rec.linked;
    if (!acc) {
      // Not linked yet: only a live code links, and a wrong one gets silence.
      if (!m.forwarded && store.redeem(kind, m.text, m.from.id)) {
        store.patch(kind, { linked: { id: m.from.id, chat: m.chat, name: m.from.name || m.from.id, at: new Date(clock.now()).toISOString() } });
        store.setLastRoute(kind);
        changed();
        void say(kind, W.linked());
      }
      return;
    }
    if (m.from.id !== acc.id) return stranger(kind);
    if (m.chat !== acc.chat) store.patch(kind, { linked: { ...acc, chat: m.chat } });
    const clientId = `${kind}:${m.chat}:${m.id}`;
    if (seenIds.has(clientId)) return;
    remember(clientId);
    const text = m.text.trim();
    if (kind === "telegram" && /^\/start\b/.test(text)) return; // Telegram's own start, not words
    // A typed 好 / 先等等 answers the newest card with buttons, as its button would.
    if (!m.forwarded && !m.files?.length && !m.replyTo) {
      const goWord = GO_WORDS.test(text) ? "go" : HOLD_WORDS.test(text) ? "hold" : undefined;
      if (goWord) {
        const newest = [...cards].filter(([id, c]) => c.kind === kind && c.policy === "buttons" && clock.now() - c.at < GO_WORD_MS && decisions.isPending(id)).sort((a, b) => b[1].at - a[1].at)[0];
        if (newest) return decideFromChat(kind, newest[0], goWord);
      }
    }
    const media = [];
    for (const f of m.files ?? []) {
      const max = live.get(kind)?.ch.caps.maxDownload ?? 20 * 1024 * 1024;
      if (!deps.media || (f.bytes !== undefined && f.bytes > max)) continue;
      try {
        media.push(deps.media.put(await f.fetch(), { ...(f.name ? { name: f.name } : {}), sent: true }));
      } catch (err) {
        console.warn(`[channels] ${kind}: a file wasn't kept: ${(err as Error).message}`);
      }
    }
    if (!text && !media.length) return;
    const replySeq = m.replyTo ? seqOf.get(`${kind}:${m.chat}:${m.replyTo}`) : undefined;
    const reply: ReplyWant | undefined = replySeq !== undefined ? { seq: replySeq } : undefined;
    fromChat++;
    try {
      const e = logUserMessage(log, decisions, { text, clientId, media, ...(reply ? { reply } : {}), via: kind, ...(m.forwarded ? { forwarded: m.forwarded } : {}) });
      seqOf.set(clientId, e.seq);
      svcOf.set(e.seq, { kind, chat: m.chat, id: m.id });
    } finally {
      fromChat--;
    }
  };

  const decideFromChat = (kind: ChannelKind, decisionId: string, option: "go" | "hold") => {
    fromChat++;
    try {
      decisions.decide(decisionId, option);
      store.setLastRoute(kind);
    } finally {
      fromChat--;
    }
  };

  const tap = async (kind: ChannelKind, t: InTap) => {
    const acc = store.get(kind)?.linked;
    const ch = live.get(kind)?.ch;
    if (!acc || t.from.id !== acc.id || !ch) return; // a tap from anyone else: nothing
    const m = /^([gh]):(.+)$/.exec(t.data);
    if (!m) return void ch.answerTap(t).catch(() => {});
    const id = m[2]!;
    const d = decisions.get(id);
    if (!d || cardPolicy(d) !== "buttons") return void ch.answerTap(t).catch(() => {});
    if (!decisions.isPending(id)) {
      await ch.answerTap(t, W.already()).catch(() => {});
      settleCard(id);
      return;
    }
    try {
      decideFromChat(kind, id, m[1] === "g" ? "go" : "hold");
      await ch.answerTap(t).catch(() => {});
    } catch (err) {
      await ch.answerTap(t, (err as Error).message.slice(0, 180)).catch(() => {});
    }
  };

  // ---------- connecting ----------

  const make = (kind: ChannelKind, rec: ChannelRec): Channel =>
    deps.make
      ? deps.make(kind, rec, store)
      : kind === "telegram"
        ? createTelegram({ token: rec.token, offset: () => store.get("telegram")?.offset, setOffset: (n) => store.patch("telegram", { offset: n }) })
        : createSlack({ botToken: rec.token, appToken: rec.appToken ?? "" });

  const bring = async (kind: ChannelKind, rec: ChannelRec): Promise<BotInfo> => {
    live.get(kind)?.ch.stop();
    const ch = make(kind, rec);
    const l: Live = { ch, up: false };
    live.set(kind, l);
    changed();
    try {
      const bot = await ch.start({
        message: (m) => inbound(kind, m),
        tap: (t) => tap(kind, t),
        trouble: (t) => live.get(kind) === l && setTrouble(kind, t),
      });
      l.bot = bot;
      l.up = true;
      changed();
      return bot;
    } catch (err) {
      if (live.get(kind) === l) {
        l.trouble = err instanceof ChannelError && (err.trouble === "token" || err.trouble === "conflict" || err.trouble === "blocked") ? err.trouble : "network";
        changed();
      }
      throw err;
    }
  };

  return {
    view,
    frame: () => ({ t: "channels", channels: view(), slackManifest: slackManifest(deps.personaName()) }),
    async connect(kind, t) {
      const token = (kind === "telegram" ? t.token : t.botToken)?.trim() ?? "";
      const appToken = t.appToken?.trim();
      if (kind === "telegram" ? !isTelegramToken(token) : !isSlackBotToken(token) || !isSlackAppToken(appToken ?? "")) return { ok: false, reason: "token" };
      const before = store.get(kind);
      const rec: ChannelRec = { token, ...(appToken ? { appToken } : {}) };
      try {
        const bot = await bring(kind, rec);
        // The same bot again keeps its linked account and its place in the updates.
        const same = before?.bot?.id === bot.id;
        store.set(kind, { ...rec, bot: { id: bot.id, name: bot.name, ...(bot.handle ? { handle: bot.handle } : {}), ...(bot.team ? { team: bot.team } : {}) }, ...(same && before?.linked ? { linked: before.linked } : {}), ...(same && before?.offset ? { offset: before.offset } : {}) });
        changed();
        return { ok: true };
      } catch (err) {
        live.get(kind)?.ch.stop();
        live.delete(kind);
        // What was there before stays as it was.
        if (before) void bring(kind, before).catch(() => {});
        changed();
        return { ok: false, reason: err instanceof ChannelError && err.trouble === "token" ? "token" : "network" };
      }
    },
    code(kind) {
      const rec = store.get(kind);
      if (!rec || !live.get(kind)?.up) return { ok: false, reason: "not_connected" };
      if (rec.linked) return { ok: false, reason: "busy" };
      const c = store.newCode(kind);
      return { ok: true, code: c.code, expiresAt: c.expiresAt, ...(kind === "telegram" && rec.bot?.handle ? { link: `https://t.me/${rec.bot.handle}?start=${c.raw}` } : {}) };
    },
    unlink(kind) {
      if (!store.get(kind)?.linked) return false;
      store.patch(kind, { linked: undefined, strangerAt: undefined });
      if (store.lastRoute() === kind) store.setLastRoute("app");
      changed();
      return true;
    },
    forget(kind) {
      live.get(kind)?.ch.stop();
      live.delete(kind);
      store.set(kind, undefined);
      if (store.lastRoute() === kind) store.setLastRoute("app");
      changed();
    },
    claimed: (key) => claims.has(key),
    lastRoute: () => store.lastRoute(),
    turnEnded() {
      for (const k of [...typing.keys()]) stopTyping(k);
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async start() {
      for (const kind of ["telegram", "slack"] as const) {
        const rec = store.get(kind);
        if (rec) await bring(kind, rec).catch((err) => console.warn(`[channels] ${kind} didn't start: ${(err as Error).message}`));
      }
    },
    stop() {
      off();
      outbox.stop();
      for (const l of live.values()) l.ch.stop();
      live.clear();
      for (const w of words.values()) clock.clearTimeout(w.timer);
      for (const j of jobs.values()) if (j.timer) clock.clearTimeout(j.timer);
      for (const k of [...typing.keys()]) stopTyping(k);
      if (releaseTimer) clock.clearTimeout(releaseTimer);
    },
    idle: () => outbox.idle(),
  };
}
