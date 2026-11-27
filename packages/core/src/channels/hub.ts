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
//  - D301, WeChat (research/105): the scan is the pairing; it may write only inside the window
//    after the person's words (caps.replyWindowMs, caps.windowSends), with no buttons and no edits,
//    so a question asks for a typed 好 / 先等等 and there is no status line.
//  - D622, Feishu / Lark (design/channels.md §14): the person's own Custom App over the open
//    platform's long connection; a direct chat only, no buttons or files, a typed 好 / 先等等 for a
//    card, and an edit for the status line.
//  - D516, several partners: one thread per chat app carries them all. The bot is the default
//    partner's; another partner's words there lead with its name. The person's words go to the
//    partner whose message they reply to, else the one named at their start (an address, like an
//    @: the model still judges the rest and passes on, D486), else the one they are talking with
//    (TURN_MS), else the default. Every partner's asks and results reach the one place.
import { CHANNEL_KINDS } from "@ducter/protocol";
import type { Bodies, ChannelKind, ChannelView, ChatThread, LangTag, LogEvent, ReplyWant, ServerFrame } from "@ducter/protocol";
import { fill, THREAD_CHARS, THREAD_MESSAGES, words as wordsIn } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { redact } from "@ducter/protocol/src/redact.ts";
import { DEFAULT_PARTNER, channelOf, partnerOfStream } from "@ducter/protocol/src/partners.ts";
import { realClock, type Clock } from "../clock.ts";
import type { MediaStore } from "../media.ts";
import { defaultLine, inQuiet, quietEndsAt, type Quiet } from "../push.ts";
import { logUserMessage, type ReplyDecisions } from "../reply.ts";
import { cutPoints } from "./format.ts";
import { createOutbox, type Outbox } from "./outbox.ts";
import { ChannelError, type BotInfo, type Channel, type InMessage, type InTap, type OutButton, type Trouble } from "./port.ts";
import { createFeishu, feishuAppLink, type FeishuDomain } from "./feishu.ts";
import { createSlack, faceUrl, isSlackAppToken, isSlackBotToken, slackAppLink, slackManifest } from "./slack.ts";
import { openChannelStore, THREADS_KEPT, type ChannelRec, type ChannelStore, type ChannelThread } from "./store.ts";
import { createTelegram, isTelegramToken } from "./telegram.ts";
import { createWechat, wechatLogin, WECHAT_API, type WechatLogin } from "./wechat.ts";
import { qrRows } from "../devices.ts";

/** A turn started in a chat app is "now" for this long: its answers, asks and status go there at once. */
export const TURN_MS = 15 * 60_000;
/** A task's question waits this long for the partner's own words about it (D129) before its own. */
export const WORDS_MS = 20_000;
/** A job still running this long after its ack gets one status line, edited in place after. */
export const STATUS_AFTER_MS = 60_000;
/** Telegram's typing lasts about 5 s: it is said again every 4 s, at most this long. */
export const TYPING_EVERY_MS = 4_000;
export const TYPING_MAX_MS = 120_000;
/** D580: how long the person's words wait for their thread to be read (Slack wants each event answered within 3 s). */
export const THREAD_WAIT_MS = 2_500;
/** A typed 好 / ok answers the newest card with buttons only while it is this fresh. */
export const GO_WORD_MS = 24 * 3600_000;
const DAY_MS = 24 * 3600_000;

const GO_WORDS = /^(好|好的|好啊|行|可以|嗯|ok|okay|go|yes|sure)[\s!！。.~～]*$/i;
const HOLD_WORDS = /^(先等等|等等|先别|先不|不用|hold|wait|not now|no)[\s!！。.~～]*$/i;

// The hub's own words in a chat app (D292: zh and en; any other language falls back, ko → en).
const HUB_WORDS = {
  zh: {
    linked: "连上了。以后在这儿跟我说就行。",
    open: "在 Ducter 里看看",
    never: "有个决定要你在 Ducter 里确认。",
    settled: "这个定了。",
    already: "这个已经定了",
    hold: "先等等",
    go: "好，{label}",
    goPlain: "就这样",
    said: "你说：{s}",
    byDefault: "你没回，我照原计划做了",
    still: "还在做：{t}…",
    done: "做完了：{t}",
    failed: "没做成：{t}",
    reply: "回「好」就{label}，回「先等等」就先放着。",
    openAt: "在 Ducter 里看看：{url}",
    as: "{name}：{text}",
    hint: "想直接跟{name}说，开头写「{name}，」就行。",
    always: "以后这类直接做",
    alwaysPost: "以后直接发",
    often: "这类你已经点过两次了，以后直接做？",
    alwaysSaid: "你点了「{label}」，以后这类直接做",
  },
  en: {
    linked: "Linked. Talk to me here any time.",
    open: "Open in Ducter",
    never: "Something needs you in Ducter.",
    settled: "That's settled.",
    already: "Already decided",
    hold: "Hold",
    go: "Go: {label}",
    goPlain: "OK",
    said: "You said: {s}",
    byDefault: "No answer, so I went ahead",
    still: "Still on it: {t}…",
    done: "Done: {t}",
    failed: "Didn't work: {t}",
    reply: "Reply “ok” to {label}, or “wait” to hold it.",
    openAt: "Open in Ducter: {url}",
    as: "{name}: {text}",
    hint: "To talk to {name} directly, start with “{name},”.",
    always: "Always do this",
    alwaysPost: "Always post",
    often: "You've said go to this twice. Do it without asking from now on?",
    alwaysSaid: "You tapped “{label}”: this kind goes without asking from now on",
  },
};

export interface ChannelDeps {
  dataDir: string;
  log: LogStore;
  decisions: ReplyDecisions;
  media?: Pick<MediaStore, "put" | "path">;
  clock?: Clock;
  /** The quiet hours in force (push.ts effectiveSettings), and whether notifications are off. */
  quiet: () => Quiet | null;
  notifyOff?: () => boolean;
  /** The conversation's language (D292); the hub's own words come through the fallback chain (ko → en). */
  lang: () => LangTag;
  personaName: () => string;
  /** D516: the home's partners, the default first; absent or one: nothing about partners shows. */
  partners?: () => { id: string; name: string }[];
  /** D531: a partner's name and look (the default's too, with one partner), for a chat app that shows each sender's own. */
  face?: (id: string) => { name: string; look: string } | undefined;
  /** The home's https address when it has one (D228), for 在 Ducter 里看看 / Open in Ducter. */
  openUrl?: () => string | undefined;
  /** D601: 以后这类直接做 / Always do this tapped in a chat app (core's always.tap). */
  always?: (decisionId: string) => { ok: boolean; error?: string };
  /** Tests: the adapters against fakes. */
  make?: (kind: ChannelKind, rec: ChannelRec, store: ChannelStore) => Channel;
  sleep?: (ms: number) => Promise<void>;
  gapMs?: number;
  /** D301, tests: WeChat's login against a fake, and the pause between scan polls. */
  wechat?: { login?: WechatLogin; api?: string; pollGapMs?: number };
  /** D622, tests: Feishu's open platform and long connection against a fake. */
  feishu?: { base?: string; fetch?: typeof fetch; WebSocket?: typeof WebSocket; backoffMs?: number; pingMs?: number };
}

export interface Channels {
  view(): ChannelView[];
  frame(): Extract<ServerFrame, { t: "channels" }>;
  connect(kind: ChannelKind, t: { token?: string; botToken?: string; appToken?: string; appId?: string; appSecret?: string; domain?: FeishuDomain; verifyCode?: string }): Promise<{ ok: boolean; reason?: "token" | "network" | "setup" }>;
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
  if (d.pay || d.key || d.copyKey || d.fill || d.signIn || d.checkout) return "never"; // D436: paying is in the live view
  // D505 (rev.): where a sign-in happens widens access to their Chrome: answered in Ducter itself (and 我在这里登录 opens a live view).
  if (!d.reversible || d.signInWhere || d.phone || d.computer || d.handset || d.call || d.cal || d.anywhere || d.memPlugin || d.asker || d.trust || d.findId) return "open";
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
  who: string;
  /** D531: the thread under a channel @-mention it answers in. */
  thread?: string;
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
  const w = () => wordsIn(HUB_WORDS, deps.lang());
  const W = {
    linked: () => w().linked,
    open: () => w().open,
    never: () => w().never,
    settled: () => w().settled,
    already: () => w().already,
    hold: () => w().hold,
    go: (label: string) => fill(w().go, { label: label || w().goPlain }),
    said: (s: string) => fill(w().said, { s }),
    byDefault: () => w().byDefault,
    still: (t: string) => fill(w().still, { t }),
    done: (t: string) => fill(w().done, { t }),
    failed: (t: string) => fill(w().failed, { t }),
    reply: (label: string) => fill(w().reply, { label: label || w().goPlain }),
    openAt: (url: string) => fill(w().openAt, { url }),
    always: (d: Bodies["decision"]) => (d.always?.action === "pr_review" ? w().alwaysPost : w().always),
    often: () => w().often,
    alwaysSaid: (label: string) => fill(w().alwaysSaid, { label }),
  };

  // ---------- D516: several partners in one thread ----------

  const partnerList = () => deps.partners?.() ?? [];
  const many = () => partnerList().length > 1;
  /** Whose conversation an event is in (a stream that is no conversation, or a partner gone: the default's). */
  const whoseOf = (stream: string): string => {
    const p = partnerOfStream(stream);
    return p && p !== DEFAULT_PARTNER && partnerList().some((x) => x.id === p) ? p : DEFAULT_PARTNER;
  };
  /** The partner the person is talking with in each chat app now: the one they last addressed, or
   *  the one that last spoke into a quiet thread; it holds for TURN_MS. */
  const withOf = new Map<ChannelKind, { id: string; at: number }>();
  const holdThread = (kind: ChannelKind, id: string) => {
    const cur = withOf.get(kind);
    // A partner speaking never takes the thread from another the person is talking with now.
    if (!cur || cur.id === id || clock.now() - cur.at >= TURN_MS) withOf.set(kind, { id, at: clock.now() });
  };
  /** The partner named at the start of the person's words ("小家，…", "@Home …"): an address, like an @. */
  const addressed = (text: string): string | undefined => {
    if (!many()) return undefined;
    const t = text.replace(/^[@＠]\s*/u, "");
    for (const p of [...partnerList()].sort((a, b) => b.name.length - a.name.length)) {
      if (!p.name || t.slice(0, p.name.length).toLowerCase() !== p.name.toLowerCase()) continue;
      const rest = t.slice(p.name.length);
      if (rest === "" || /^[\s,，、:：;；!！?？.。~～]/u.test(rest)) return p.id;
    }
    return undefined;
  };
  /** D531: the chat app shows each message's own sender (Slack with chat:write.customize): no name in front. */
  const shows = (kind: ChannelKind) => {
    const l = live.get(kind);
    return !!deps.face && !!l?.ch.caps.as && l.bot?.customize !== false;
  };
  /** Another partner's name, when the one thread carries more than one (the default is the bot's own). */
  const otherName = (id: string) => (many() && id !== DEFAULT_PARTNER ? partnerList().find((p) => p.id === id)?.name : undefined);
  /** A partner's words as they read in the one thread: another partner's lead with its name. */
  const labelled = (kind: ChannelKind, id: string, text: string, hold = true): string => {
    // D571: words in a channel thread hold that thread only, never the DM's.
    if (hold) holdThread(kind, id);
    const name = shows(kind) ? undefined : otherName(id);
    return name ? fill(w().as, { name, text }) : text;
  };
  /** The first time another partner speaks in a chat app, one line says how to talk to it there. */
  const hintOf = (kind: ChannelKind, id: string): string => {
    const name = otherName(id);
    const hinted = store.get(kind)?.hinted ?? [];
    if (!name || hinted.includes(id)) return "";
    store.patch(kind, { hinted: [...hinted, id] });
    return `\n\n${fill(w().hint, { name })}`;
  };
  const voiced = (kind: ChannelKind, id: string, text: string, hold = true): string => labelled(kind, id, text, hold) + hintOf(kind, id);

  // ---------- D571: the channel threads a partner answers in ----------

  /** The thread, when a partner answers in it: the person's words there are for it, no @ needed. */
  const threadOf = (kind: ChannelKind, chat: string, ts: string): ChannelThread | undefined => store.get(kind)?.threads?.find((t) => t.chat === chat && t.ts === ts);
  /** Remembers the thread (newest last), with the partner it is with now. */
  const keepThread = (kind: ChannelKind, chat: string, ts: string, withId: string, o: { caught?: boolean } = {}) => {
    const all = store.get(kind)?.threads ?? [];
    const was = all.find((t) => t.chat === chat && t.ts === ts);
    const rest = all.filter((t) => t !== was);
    // D580: what it missed there stays to bring, until words it takes there brought it (caught).
    const missed = !o.caught && was?.missed ? { missed: was.missed } : {};
    store.patch(kind, { threads: [...rest, { chat, ts, with: withId, at: new Date(clock.now()).toISOString(), ...missed }].slice(-THREADS_KEPT) });
  };
  /** D580: a teammate's words in a thread a partner answers in are dropped unread; the thread only notes from when it missed something. */
  const missedIn = (kind: ChannelKind, chat: string, ts: string, at: string) => {
    const all = store.get(kind)?.threads ?? [];
    if (!all.some((t) => t.chat === chat && t.ts === ts && !t.missed)) return;
    store.patch(kind, { threads: all.map((t) => (t.chat === chat && t.ts === ts ? { ...t, missed: at } : t)) });
  };
  /**
   * D580: the thread the person's words were written in, as it stood before them, for the partner:
   * all of it (bounded) the first time it is in that thread, else only what it missed there. Outside
   * data, who said each part marked. Undefined: nothing to bring (or the chat app has no threads).
   */
  const readThread = async (kind: ChannelKind, chat: string, ts: string, before: string, person: string, known: ChannelThread | undefined): Promise<ChatThread | undefined> => {
    const ch = live.get(kind)?.ch;
    if (!ch?.thread || (known && !known.missed)) return undefined;
    const since = known?.missed;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<{ unread: "failed" }>((res) => (timer = setTimeout(() => res({ unread: "failed" }), THREAD_WAIT_MS)));
    const r = await Promise.race([ch.thread(chat, ts, { before, ...(since ? { after: since } : {}), max: THREAD_MESSAGES }), late]).catch(() => ({ unread: "failed" as const }));
    clearTimeout(timer);
    if ("unread" in r) return { app: kind, unread: r.unread, ...(since ? { since: true } : {}) };
    // What it missed: never its own words there, nor the person's it already took.
    const said = since ? r.said.filter((s) => !s.mine && s.from.id !== person) : r.said;
    if (!said.length) return undefined;
    // About THREAD_CHARS in all: the thread's first message (it says what the thread is about), then the newest.
    const head = !since && said[0]!.ts === ts ? [said[0]!] : [];
    const out: NonNullable<ChatThread["said"]> = [];
    let room = THREAD_CHARS;
    const one = (s: (typeof said)[number], max: number) => {
      const text = s.text.length > max ? `${s.text.slice(0, max - 1)}…` : s.text;
      room -= text.length;
      return { who: s.mine ? ("ducter" as const) : s.from.id === person ? ("user" as const) : ("other" as const), ...(s.from.name && s.from.id !== person ? { name: s.from.name } : {}), text };
    };
    const first = head.map((s) => one(s, 1_200));
    const rest = said.slice(head.length);
    let i = rest.length;
    while (i > 0 && room > 0) out.unshift(one(rest[--i]!, Math.min(600, Math.max(room, 80))));
    const more = r.more + i;
    return { app: kind, said: [...first, ...out], ...(more ? { more } : {}), ...(since ? { since: true } : {}) };
  };

  // ---------- what is up ----------

  const linkedOf = (kind: ChannelKind) => store.get(kind)?.linked;
  const ready = (kind: ChannelKind) => {
    const l = live.get(kind);
    return l?.up && !l.trouble && linkedOf(kind) ? l : undefined;
  };
  /** D301: until when an app that only answers may still write (undefined: any time; 0: not heard yet). */
  const openUntil = (kind: ChannelKind): number | undefined => {
    const caps = live.get(kind)?.ch.caps;
    if (!caps?.replyWindowMs) return undefined;
    const rec = store.get(kind);
    const heard = rec?.heardAt ? Date.parse(rec.heardAt) : 0;
    if (!heard) return 0;
    if ((rec?.sentSince ?? 0) >= (caps.windowSends ?? Infinity)) return heard; // used up: closed
    return heard + caps.replyWindowMs;
  };
  /** Ready, and allowed to write now (WeChat's window, D301). */
  const reach = (kind: ChannelKind) => {
    const l = ready(kind);
    if (!l) return undefined;
    const until = openUntil(kind);
    return until === undefined || clock.now() < until ? l : undefined;
  };
  /** One message of the window went out. */
  const spend = (kind: ChannelKind) => {
    if (!live.get(kind)?.ch.caps.replyWindowMs) return;
    store.patch(kind, { sentSince: (store.get(kind)?.sentSince ?? 0) + 1 });
    changed();
  };
  /** The app refused for the window: closed until the person writes again. */
  const spent = (kind: ChannelKind) => {
    const caps = live.get(kind)?.ch.caps;
    if (!caps?.replyWindowMs) return;
    store.patch(kind, { sentSince: caps.windowSends ?? 0 });
    changed();
  };

  // ---------- WeChat's scan (D301): the person's own WeChat scans a QR; that scan is the pairing ----------

  interface Scan {
    qrcode: string;
    text: string;
    rows: string[];
    base: string;
    step: "wait" | "scanned" | "verify";
    expiresAt: number;
    refreshes: number;
    verify?: string;
    stop: AbortController;
  }
  let scan: Scan | undefined;
  let scanFail: "expired" | "unavailable" | undefined;
  /** A QR is good for 5 minutes; an expired one is replaced at most 3 times (research/105 §2.2). */
  const SCAN_MS = 5 * 60_000;
  const login = () => deps.wechat?.login ?? wechatLogin(deps.wechat?.api ? { api: deps.wechat.api } : {});
  const loginApi = () => (deps.wechat?.api ?? WECHAT_API).replace(/\/$/, "");
  const endScan = (fail?: "expired" | "unavailable") => {
    scan?.stop.abort();
    scan = undefined;
    scanFail = fail;
    changed();
  };
  const freshQr = async (stop: AbortController, refreshes: number): Promise<Scan> => {
    const known = store.get("wechat")?.token;
    const q = await login().qr(known ? [known] : []);
    return { qrcode: q.qrcode, text: q.text, rows: qrRows(q.text), base: loginApi(), step: "wait", expiresAt: clock.now() + SCAN_MS, refreshes, stop };
  };
  const confirmed = async (r: { bot_token?: string; ilink_bot_id?: string; baseurl?: string; ilink_user_id?: string }) => {
    if (!r.bot_token || !r.ilink_bot_id || !r.ilink_user_id) return endScan("expired");
    const before = store.get("wechat");
    const same = before?.linked?.id === r.ilink_user_id && before?.bot?.id === r.ilink_bot_id;
    // The one who scanned is the one account: WeChat lets nobody else add this ClawBot.
    const rec: ChannelRec = {
      token: r.bot_token,
      ...(r.baseurl ? { base: r.baseurl } : {}),
      bot: { id: r.ilink_bot_id, name: "ClawBot" },
      linked: { id: r.ilink_user_id, chat: r.ilink_user_id, name: "", at: same ? before!.linked!.at : new Date(clock.now()).toISOString() },
      ...(same && before?.buf ? { buf: before.buf } : {}),
      ...(same && before?.ctx ? { ctx: before.ctx, ...(before.heardAt ? { heardAt: before.heardAt } : {}), sentSince: before.sentSince ?? 0 } : {}),
    };
    store.set("wechat", rec);
    endScan();
    await bring("wechat", rec).catch((err) => console.warn(`[channels] wechat didn't start: ${(err as Error).message}`));
  };
  const watchScan = async (first: Scan) => {
    let s = first;
    const gap = deps.wechat?.pollGapMs ?? 1000;
    const again = async (fail: "expired" | "unavailable") => {
      if (s.refreshes >= 3) return endScan(fail);
      try {
        const next = await freshQr(s.stop, s.refreshes + 1);
        if (scan !== s) return;
        scan = s = next;
        changed();
      } catch {
        if (scan === s) endScan(fail);
      }
    };
    while (scan === s && !s.stop.signal.aborted) {
      const verify = s.verify;
      s.verify = undefined;
      const r = await login().status(s.base, s.qrcode, verify, s.stop.signal);
      if (scan !== s) return;
      switch (r.status) {
        case "scaned":
          if (s.step !== "scanned") (s.step = "scanned"), changed();
          break;
        case "need_verifycode":
          if (s.step !== "verify") (s.step = "verify"), changed();
          break;
        case "scaned_but_redirect":
          if (r.redirect_host) s.base = `${new URL(loginApi()).protocol}//${r.redirect_host}`;
          break;
        case "expired":
          await again("expired");
          break;
        case "verify_code_blocked":
          await again("unavailable");
          break;
        case "binded_redirect":
          // Already bound to this home: what is there stays.
          if (store.get("wechat")?.linked) return endScan();
          await again("expired");
          break;
        case "confirmed":
          return confirmed(r);
        default:
          break;
      }
      if (scan === s && clock.now() > s.expiresAt) await again("expired");
      if (scan === s) await new Promise((res) => setTimeout(res, gap));
    }
  };

  const view = (): ChannelView[] =>
    CHANNEL_KINDS.map((kind): ChannelView => {
      const rec = store.get(kind);
      if (kind === "wechat" && scan) return { kind, state: "scan", scan: { qr: scan.rows, link: scan.text, step: scan.step, expiresAt: new Date(scan.expiresAt).toISOString() } };
      if (!rec) return { kind, state: "off", ...(kind === "wechat" && scanFail ? { reason: scanFail } : {}) };
      const l = live.get(kind);
      const bot = rec.bot ? { name: rec.bot.name, ...(rec.bot.handle ? { handle: rec.bot.handle } : {}), ...(rec.bot.team ? { team: rec.bot.team } : {}) } : undefined;
      const base = { kind, ...(bot ? { bot } : {}), ...(rec.linked ? { linked: { name: rec.linked.name, at: rec.linked.at } } : {}), ...(rec.strangerAt ? { strangerAt: rec.strangerAt } : {}), ...(kind === "feishu" && rec.domain ? { domain: rec.domain } : {}) };
      if (l?.trouble) return { ...base, state: "cant_connect", reason: l.trouble };
      if (!l?.up) return { ...base, state: "starting" };
      const until = rec.linked ? openUntil(kind) : undefined;
      // D531: a Slack app made before chat:write.customize: Settings asks for a reinstall.
      const reinstall = l.ch.caps.as && (l.bot?.customize === false || l.bot?.reinstall === true);
      return { ...base, state: rec.linked ? "linked" : "unlinked", ...(until ? { openUntil: new Date(until).toISOString() } : {}), ...(reinstall ? { reinstall: true } : {}) };
    });

  const setTrouble = (kind: ChannelKind, t: Trouble | undefined) => {
    const l = live.get(kind);
    if (!l || l.trouble === t) return;
    l.trouble = t;
    changed();
  };

  // ---------- sending ----------

  /** Says text in that chat, split to the app's length; buttons under the last part. Returns the ids. */
  const say = (kind: ChannelKind, text: string, o: { buttons?: OutButton[]; replyTo?: string; silent?: boolean; seq?: number; who?: string; chat?: string } = {}): Promise<string[]> => {
    const l = live.get(kind);
    const acc = linkedOf(kind);
    if (!l || !acc) return Promise.resolve([]);
    stopTyping(kind);
    // D152: every key in it hidden, exactly as a client sees the Log.
    text = redact(text);
    const max = l.ch.caps.maxText - 64;
    const parts = cutPoints(text, max).map(([s, e]) => text.slice(s, e));
    const ids: string[] = [];
    const chat = o.chat ?? acc.chat;
    // D531: the partner's own name and face, where the app shows a sender per message.
    const face = l.ch.caps.as ? deps.face?.(o.who ?? DEFAULT_PARTNER) : undefined;
    const as = face ? { name: face.name, icon: faceUrl(face.look) } : undefined;
    const run = async () => {
      for (let i = 0; i < parts.length; i++) {
        const last = i === parts.length - 1;
        try {
          const id = await outbox.run(`${kind}:${chat}`, async () => {
            // D301: an app that only answers: stop where its window ends (checked in the line, so
            // messages waiting their turn see the ones before them).
            if (l.ch.caps.replyWindowMs && !reach(kind)) return "";
            const id = await l.ch.send(chat, { text: parts[i]!, ...(last && o.buttons?.length && l.ch.caps.buttons ? { buttons: o.buttons } : {}), ...(i === 0 && o.replyTo ? { replyTo: o.replyTo } : {}), ...(o.silent && l.ch.caps.silent ? { silent: true } : {}), ...(as ? { as } : {}) });
            spend(kind);
            return id;
          });
          if (!id) return ids;
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
    if (err instanceof ChannelError && (err.trouble === "token" || err.trouble === "blocked" || err.trouble === "setup")) setTrouble(kind, err.trouble);
    else if (err instanceof ChannelError && err.trouble === "refused") spent(kind);
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
        .run(`${kind}:${acc.chat}`, async () => {
          if (l.ch.caps.replyWindowMs && !reach(kind)) return "";
          const id = await l.ch.sendFile(acc.chat, { path, name: m.name ?? (m.type.startsWith("image/") ? `picture.${m.type.split("/")[1]}` : "file"), type: m.type });
          spend(kind);
          return id;
        })
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
  /** chat, thread (D531): a turn started by an @-mention in a Slack channel answers in a thread under it. */
  type Route = { kind: ChannelKind; mode: "turn" | "own"; chat?: string; thread?: string };
  /** D531: the person's @-mentions in a shared channel this run (their seq → the channel and the thread to answer in). */
  const mentionOf = new Map<number, { chat: string; thread: string }>();
  const placeNow = (): ChannelKind | undefined => {
    const r = store.lastRoute();
    return r !== "app" && reach(r) ? r : undefined;
  };
  const routeOf = (replyTo: number | undefined): Route | undefined => {
    if (replyTo === undefined) return undefined;
    const u = userAt(replyTo);
    const place = placeNow();
    // Words about something Ducter started (a report, a routine): its own, to the person's place.
    if (!u) return place ? { kind: place, mode: "own" } : undefined;
    // A turn that is still now answers where it started; an app's turn is not mirrored.
    if (clock.now() - u.at < TURN_MS) {
      const at = mentionOf.get(replyTo);
      return u.via && reach(u.via) ? { kind: u.via, mode: "turn", ...(at ? { chat: at.chat, thread: at.thread } : {}) } : undefined;
    }
    // A late result: to the person's place, once.
    return place ? { kind: place, mode: "own" } : undefined;
  };
  type UserAt = { seq: number; via?: ChannelKind; at: number };
  /** D277: iMessage is the Mac app's own bridge, not one of this hub's chat apps: for routing here it
   *  counts as the apps (the bridge answers its own turns; its push rule is core's channelUp). */
  // D537: a share came through the phone's app: it is answered there, like any app message.
  const hubVia = (v: Bodies["user_msg"]["via"]): ChannelKind | undefined => (v === "imessage" || v === "share" ? undefined : v);
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

  const tapData = (option: "go" | "hold" | "always", id: string) => `${option === "go" ? "g" : option === "always" ? "a" : "h"}:${id}`;
  const openButton = (decisionId?: string): OutButton[] => {
    const base = deps.openUrl?.();
    if (!base) return [];
    return [{ label: W.open(), url: `${base.replace(/\/?$/, "/")}app${decisionId ? `#d=${encodeURIComponent(decisionId)}` : ""}` }];
  };
  const openLine = (kind: ChannelKind, decisionId?: string) => {
    const b = openButton(decisionId)[0];
    if (b && live.get(kind)?.ch.caps.buttons) return "";
    // No buttons there (WeChat): the address written out, when the home has one.
    return b && "url" in b ? `\n\n${W.openAt(b.url)}` : `\n\n${W.open()}`;
  };

  const sendCard = (kind: ChannelKind, d: Bodies["decision"], said: string, seq: number, mode: Route["mode"], who: string = DEFAULT_PARTNER) => {
    const policy = cardPolicy(d);
    const acc = linkedOf(kind);
    if (!acc || cards.has(d.decisionId)) return;
    const card: Card = { kind, chat: acc.chat, ids: [], words: said, policy, at: clock.now() };
    cards.set(d.decisionId, card);
    let text: string;
    let buttons: OutButton[];
    // D516: another partner's question leads with its name (its content never, for the never kind).
    if (policy === "never") {
      card.words = labelled(kind, who, W.never());
      text = card.words + openLine(kind, d.decisionId);
      buttons = openButton(d.decisionId);
    } else if (policy === "open") {
      card.words = labelled(kind, who, said);
      text = card.words + openLine(kind, d.decisionId);
      buttons = openButton(d.decisionId);
    } else {
      // D493: the default quotes the Go button as it reads there; with no buttons (WeChat), the option.
      const buttoned = !!live.get(kind)?.ch.caps.buttons;
      card.words = labelled(kind, who, said);
      // D601 (GQ4): the offer leads the card, in one line, when this kind was said go to twice.
      if (d.always?.often) card.words = `${W.often()}\n\n${card.words}`;
      text = `${card.words}\n\n_${defaultLine(d, deps.lang(), clock.now(), buttoned && d.goLabel ? W.go(d.goLabel) : undefined)}_`;
      // No buttons there (WeChat): say which words answer it; the hub reads them (GO_WORDS).
      if (!buttoned) text += `\n\n${W.reply(d.goLabel)}`;
      buttons = [{ label: W.go(d.goLabel), data: tapData("go", d.decisionId), style: "primary" }, ...(d.always && deps.always ? [{ label: W.always(d), data: tapData("always", d.decisionId) }] : []), { label: W.hold(), data: tapData("hold", d.decisionId) }];
    }
    text += hintOf(kind, who);
    void say(kind, text, { buttons, seq, who }).then((ids) => {
      card.ids = ids;
      // Settled while it was on its way: show the end state at once.
      if (!decisions.isPending(d.decisionId)) settleCard(d.decisionId);
    });
  };

  const endLine = (r: Bodies["decision_resolved"], d: Bodies["decision"] | undefined) => {
    if (r.by === "ended") return W.settled(); // D481: closed by what happened
    if (r.by === "default") return W.byDefault();
    if (r.option === "go" && r.always && d) return W.alwaysSaid(W.always(d));
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
    if (lastUser && clock.now() - lastUser.at < TURN_MS) route = lastUser.via && reach(lastUser.via) ? { kind: lastUser.via, mode: "turn" } : undefined;
    else if (place) route = { kind: place, mode: "own" };
    if (!route || (route.mode === "own" && deps.notifyOff?.())) return;
    const r = route;
    // The partner's own words about a task's question (D129), when they come in time.
    const go = (said: string) => {
      const w = words.get(d.decisionId);
      if (w) clock.clearTimeout(w.timer), words.delete(d.decisionId);
      if (!decisions.isPending(d.decisionId)) return;
      const run = () => sendCard(r.kind, d, said, e.seq, r.mode, whoseOf(e.stream));
      if (r.mode === "own") own(run, d.decisionId);
      else run();
    };
    claims.add(`d:${d.decisionId}`);
    if (d.taskId && !d.call) words.set(d.decisionId, { timer: clock.setTimeout(() => go(d.question), WORDS_MS), send: go });
    else go(d.question);
  };

  // ---------- jobs: one status line, edited in place ----------

  const onAck = (b: Bodies["ack"], seq: number, who: string) => {
    const r = routeOf(b.replyTo);
    if (!r) return;
    const acc = linkedOf(r.kind);
    if (!acc) return;
    const at = r.chat ? { chat: r.chat, ...(r.thread ? { replyTo: r.thread } : {}) } : {};
    const run = () => void say(r.kind, voiced(r.kind, who, b.text, !r.thread), { seq, who, ...at });
    if (r.mode === "own") own(run);
    else run();
    const job: Job = { kind: r.kind, who, chat: r.chat ?? acc.chat, ...(r.thread ? { thread: r.thread } : {}), title: b.text };
    jobs.set(b.jobId, job);
    // An app that can't edit gets no status line: one more message there, never brought up to date.
    if (!live.get(r.kind)?.ch.caps.edit) return void jobs.set(b.jobId, job);
    job.timer = clock.setTimeout(() => {
      job.timer = undefined;
      if (job.done || jobs.get(b.jobId) !== job || !ready(job.kind) || inQuiet(clock.now(), deps.quiet())) return;
      void say(job.kind, W.still(job.title), { silent: true, who: job.who, chat: job.chat, ...(job.thread ? { replyTo: job.thread } : {}) }).then((ids) => {
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
          // D516: words one partner passed on (D486) during a chat app's turn: the partner they went
          // to answers in that chat app too, and the person is talking with it there now.
          if (b.passed) {
            const t = lastUser;
            if (t?.via && clock.now() - t.at < TURN_MS) {
              users.set(e.seq, { seq: e.seq, via: t.via, at: clock.now() });
              // D571: passed during a turn in a channel thread: it answers in that thread, which is with it now.
              const at = mentionOf.get(t.seq);
              if (at) mentionOf.set(e.seq, at), keepThread(t.via, at.chat, at.thread, whoseOf(e.stream));
              else withOf.set(t.via, { id: whoseOf(e.stream), at: clock.now() });
            }
            return;
          }
          const via = hubVia(b.via);
          lastUser = { seq: e.seq, ...(via ? { via } : {}), at: clock.now() };
          users.set(e.seq, lastUser);
          if (users.size > 500) users.delete(users.keys().next().value!);
          store.setLastRoute(via ?? "app");
          if (via) startTyping(via);
          return;
        }
        case "ack":
          return onAck(e.body as Bodies["ack"], e.seq, whoseOf(e.stream));
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
            if (b.text.trim()) void say(r.kind, voiced(r.kind, whoseOf(e.stream), b.text, !r.thread), { seq: e.seq, who: whoseOf(e.stream), ...(r.chat ? { chat: r.chat, ...(r.thread ? { replyTo: r.thread } : {}) } : quoted && quoted.kind === r.kind ? { replyTo: quoted.id } : {}) });
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
          // Each find is a sentence of its own, a paragraph as a person writes it, not a bulleted list (D291).
          const text = [b.opening, ...b.finds.map((f) => f.text), ...(b.leftOut ? [b.leftOut] : [])].filter(Boolean).join("\n\n");
          if (own(() => void say(place, voiced(place, whoseOf(e.stream), text) + openLine(place), { seq: e.seq, buttons: openButton(), who: whoseOf(e.stream) }))) claims.add(`n:${b.noteId}`);
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
    if (id && /^(telegram|slack|feishu|wechat):/.test(id)) remember(id);
  }

  /** D531: why the person's words were taken or dropped, at info level (never the words or who). */
  const note = (kind: ChannelKind, what: string) => console.info(`[channels] ${kind}: ${what}`);
  const stranger = (kind: ChannelKind) => {
    const at = store.get(kind)?.strangerAt;
    if (at && clock.now() - Date.parse(at) < DAY_MS) return;
    store.patch(kind, { strangerAt: new Date(clock.now()).toISOString() });
    changed();
  };

  const inbound = async (kind: ChannelKind, m: InMessage) => {
    const rec = store.get(kind);
    if (!rec) return;
    // Groups and channels are never the person's window: silence. D531: an @-mention of the bot
    // in a Slack channel it was added to is, for the linked person only. D571: so is a reply in a
    // thread a partner answers in, without an @ (a teammate's there: silence, no stranger line).
    const thread = !m.direct && !m.mention && m.replyTo ? threadOf(kind, m.chat, m.replyTo) : undefined;
    if (!m.direct && !m.mention && !thread) return note(kind, m.replyTo && !m.direct ? "ignored: a thread it doesn't answer in" : "ignored: not a direct message");
    const acc = rec.linked;
    // D580: dropped unread; the thread notes it missed something, so the person's next words there bring it.
    if (thread && (!acc || m.from.id !== acc.id)) return missedIn(kind, m.chat, thread.ts, m.id), note(kind, "ignored: a thread reply, not from the linked person");
    if (m.mention && (!acc || m.from.id !== acc.id)) {
      // Anyone else's mention gets nothing, in the channel or anywhere (the bot is one person's).
      note(kind, acc ? "ignored: a mention, not from the linked person" : "ignored: a mention before an account is linked");
      if (m.replyTo) missedIn(kind, m.chat, m.replyTo, m.id);
      return void (acc && stranger(kind));
    }
    if (!acc) {
      // Not linked yet: only a live code links, and a wrong one gets silence.
      if (m.forwarded || !store.redeem(kind, m.text, m.from.id)) return note(kind, "ignored: not linked yet, and no live code");
      // Feishu has no name in the message event (and no contact scope is asked for): the card says
      // 和你的飞书连着 / Linked to your Feishu instead of inventing one.
      store.patch(kind, { linked: { id: m.from.id, chat: m.chat, name: m.from.name || (kind === "feishu" ? "" : m.from.id), at: new Date(clock.now()).toISOString() } });
      store.setLastRoute(kind);
      changed();
      note(kind, "linked");
      void say(kind, W.linked());
      return;
    }
    if (m.from.id !== acc.id) return note(kind, "ignored: not the linked person"), stranger(kind);
    const channel = !!m.mention || !!thread;
    if (!channel && m.chat !== acc.chat) store.patch(kind, { linked: { ...acc, chat: m.chat } });
    // D301: the person's words open the window again.
    if (live.get(kind)?.ch.caps.replyWindowMs) {
      store.patch(kind, { heardAt: new Date(clock.now()).toISOString(), sentSince: 0 });
      changed();
    }
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
    // D571: in a channel thread the words carry on the thread, not a reply to its first message.
    const replySeq = m.replyTo && !channel ? seqOf.get(`${kind}:${m.chat}:${m.replyTo}`) : undefined;
    const threadTs = channel ? (m.replyTo ?? m.id) : undefined;
    const known = threadTs ? (thread ?? threadOf(kind, m.chat, threadTs)) : undefined;
    const reply: ReplyWant | undefined = replySeq !== undefined ? { seq: replySeq } : undefined;
    // D516: which partner the words are for: the one whose message they reply to, else the one
    // named at their start, else the one the person is talking with here, else the default.
    let to = DEFAULT_PARTNER;
    if (many() && threadTs) {
      // D571: a channel thread is its own: a name at the start, else the partner it is with, else the default.
      to = (m.forwarded ? undefined : addressed(text)) ?? (known && partnerList().some((p) => p.id === known.with) ? known.with : DEFAULT_PARTNER);
    } else if (many()) {
      const replied = replySeq !== undefined ? log.read({ fromSeq: replySeq, limit: 1 })[0] : undefined;
      const cur = withOf.get(kind);
      to = (replied?.seq === replySeq && replied ? whoseOf(replied.stream) : undefined) ?? (m.forwarded ? undefined : addressed(text)) ?? (cur && clock.now() - cur.at < TURN_MS ? cur.id : DEFAULT_PARTNER);
      withOf.set(kind, { id: to, at: clock.now() });
    }
    // D580: first in a thread someone else started (an @ in a reply), or back in one it missed words
    // in: the thread so far comes along, as outside data with who said each part.
    const before = threadTs && m.replyTo && !m.forwarded ? await readThread(kind, m.chat, threadTs, m.id.replace(/#\d+$/, ""), acc.id, known) : undefined;
    if (before) note(kind, before.unread ? `the thread couldn't be read (${before.unread})` : `read the thread: ${before.said?.length ?? 0} message(s)${before.since ? " it missed" : ""}`);
    fromChat++;
    try {
      const e = logUserMessage(log, decisions, { text, clientId, media, ...(reply ? { reply } : {}), via: kind, ...(m.forwarded ? { forwarded: m.forwarded } : {}), ...(before ? { thread: before } : {}), ...(to !== DEFAULT_PARTNER ? { stream: channelOf(to) } : {}) });
      seqOf.set(clientId, e.seq);
      svcOf.set(e.seq, { kind, chat: m.chat, id: m.id });
      // D531: its answer goes in a thread under the mention (or in the thread it was made in).
      // D571: and the thread is one it answers in from now on: the person's replies there need no @.
      if (threadTs) mentionOf.set(e.seq, { chat: m.chat, thread: threadTs }), keepThread(kind, m.chat, threadTs, to, { caught: !m.forwarded });
      note(kind, m.mention ? "taken: a mention from the linked person" : thread ? "taken: a thread reply from the linked person" : "taken: a message from the linked person");
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
    const m = /^([gha]):(.+)$/.exec(t.data);
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
      if (m[1] === "a") {
        // D601: Always do this, from the chat app: the same tap as on the card in Ducter.
        fromChat++;
        try {
          const r = deps.always?.(id) ?? { ok: false, error: "Open it in Ducter" };
          if (!r.ok) throw new Error(r.error ?? "Open it in Ducter");
          store.setLastRoute(kind);
        } finally {
          fromChat--;
        }
      } else decideFromChat(kind, id, m[1] === "g" ? "go" : "hold");
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
        : kind === "feishu"
          ? createFeishu({ appId: rec.appId ?? "", appSecret: rec.token, domain: rec.domain ?? "feishu", ...(deps.feishu ?? {}) })
          : kind === "wechat"
            ? createWechat({ token: rec.token, ...(rec.base ? { base: rec.base } : {}), botId: rec.bot?.id ?? "", state: () => wechatState(store), save: (p) => store.patch("wechat", p) })
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
        changed: () => live.get(kind) === l && changed(),
      });
      l.bot = bot;
      l.up = true;
      changed();
      return bot;
    } catch (err) {
      if (live.get(kind) === l) {
        l.trouble = err instanceof ChannelError && (err.trouble === "token" || err.trouble === "conflict" || err.trouble === "blocked" || err.trouble === "setup") ? err.trouble : "network";
        changed();
      }
      throw err;
    }
  };

  function forget(kind: ChannelKind) {
    if (kind === "wechat") scan?.stop.abort(), (scan = undefined), (scanFail = undefined);
    live.get(kind)?.ch.stop();
    live.delete(kind);
    store.set(kind, undefined);
    if (store.lastRoute() === kind) store.setLastRoute("app");
    changed();
  }

  return {
    view,
    frame: () => ({ t: "channels", channels: view(), slackManifest: slackManifest(deps.personaName()) }),
    async connect(kind, t) {
      if (kind === "feishu") {
        const appId = t.appId?.trim() ?? "";
        const appSecret = t.appSecret?.trim() ?? "";
        const domain: FeishuDomain = t.domain === "lark" ? "lark" : "feishu";
        if (!/^cli_[A-Za-z0-9]{6,}$/.test(appId) || appSecret.length < 6) return { ok: false, reason: "token" };
        const before = store.get(kind);
        const rec: ChannelRec = { token: appSecret, appId, domain };
        try {
          const bot = await bring(kind, rec);
          const same = before?.appId === appId && before?.domain === domain && before?.bot?.id === bot.id;
          store.set(kind, {
            ...rec,
            bot: { id: bot.id, name: bot.name, ...(bot.appId ? { appId: bot.appId } : {}) },
            ...(same && before?.linked ? { linked: before.linked } : {}),
            ...(same && before?.strangerAt ? { strangerAt: before.strangerAt } : {}),
            ...(same && before?.hinted ? { hinted: before.hinted } : {}),
          });
          changed();
          return { ok: true };
        } catch (err) {
          live.get(kind)?.ch.stop();
          live.delete(kind);
          if (before) void bring(kind, before).catch(() => {});
          changed();
          return { ok: false, reason: err instanceof ChannelError && err.trouble === "token" ? "token" : err instanceof ChannelError && err.trouble === "setup" ? "setup" : "network" };
        }
      }
      if (kind === "wechat") {
        // WeChat's number for this scan (need_verifycode): the next poll carries it.
        if (t.verifyCode && scan?.step === "verify") {
          scan.verify = t.verifyCode.replace(/\s/g, "").slice(0, 12);
          return { ok: true };
        }
        endScan();
        try {
          const s = await freshQr(new AbortController(), 0);
          scan = s;
          scanFail = undefined;
          changed();
          void watchScan(s).catch((err) => (console.warn(`[channels] wechat scan: ${(err as Error).message}`), scan === s && endScan("expired")));
          return { ok: true };
        } catch (err) {
          changed();
          return { ok: false, reason: err instanceof ChannelError && err.trouble === "token" ? "token" : err instanceof ChannelError && err.trouble === "setup" ? "setup" : "network" };
        }
      }
      const token = (kind === "telegram" ? t.token : t.botToken)?.trim() ?? "";
      const appToken = t.appToken?.trim();
      if (kind === "telegram" ? !isTelegramToken(token) : !isSlackBotToken(token) || !isSlackAppToken(appToken ?? "")) return { ok: false, reason: "token" };
      const before = store.get(kind);
      const rec: ChannelRec = { token, ...(appToken ? { appToken } : {}) };
      try {
        const bot = await bring(kind, rec);
        // The same bot again keeps its linked account and its place in the updates.
        const same = before?.bot?.id === bot.id;
        store.set(kind, { ...rec, bot: { id: bot.id, name: bot.name, ...(bot.handle ? { handle: bot.handle } : {}), ...(bot.team ? { team: bot.team } : {}), ...(bot.teamId ? { teamId: bot.teamId } : {}), ...(bot.appId ? { appId: bot.appId } : {}) }, ...(same && before?.linked ? { linked: before.linked } : {}), ...(same && before?.offset ? { offset: before.offset } : {}), ...(same && before?.strangerAt ? { strangerAt: before.strangerAt } : {}), ...(same && before?.hinted ? { hinted: before.hinted } : {}) });
        changed();
        return { ok: true };
      } catch (err) {
        live.get(kind)?.ch.stop();
        live.delete(kind);
        // What was there before stays as it was.
        if (before) void bring(kind, before).catch(() => {});
        changed();
        return { ok: false, reason: err instanceof ChannelError && err.trouble === "token" ? "token" : err instanceof ChannelError && err.trouble === "setup" ? "setup" : "network" };
      }
    },
    code(kind) {
      const rec = store.get(kind);
      if (!rec || !live.get(kind)?.up) return { ok: false, reason: "not_connected" };
      if (rec.linked || kind === "wechat") return { ok: false, reason: "busy" }; // WeChat: the scan linked it
      const c = store.newCode(kind);
      // D531: Slack's link opens the app's messages, where the code goes (the bot as it is now, else as stored).
      const appId = live.get(kind)?.bot?.appId ?? rec.bot?.appId;
      const teamId = live.get(kind)?.bot?.teamId ?? rec.bot?.teamId;
      const link =
        kind === "telegram" && rec.bot?.handle
          ? `https://t.me/${rec.bot.handle}?start=${c.raw}`
          : kind === "slack" && appId
            ? slackAppLink(appId, teamId)
            : kind === "feishu" && rec.appId
              ? feishuAppLink(rec.appId, rec.domain ?? "feishu")
              : undefined;
      return { ok: true, code: c.code, expiresAt: c.expiresAt, ...(link ? { link } : {}) };
    },
    unlink(kind) {
      if (!store.get(kind)?.linked) return false;
      // WeChat's ClawBot is bound to the one who scanned: unlinking it is disconnecting it.
      if (kind === "wechat") return forget(kind), true;
      store.patch(kind, { linked: undefined, strangerAt: undefined });
      if (store.lastRoute() === kind) store.setLastRoute("app");
      changed();
      return true;
    },
    forget,
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
      for (const kind of CHANNEL_KINDS) {
        const rec = store.get(kind);
        if (rec) await bring(kind, rec).catch((err) => console.warn(`[channels] ${kind} didn't start: ${(err as Error).message}`));
      }
    },
    stop() {
      off();
      scan?.stop.abort();
      scan = undefined;
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

/** What WeChat's adapter keeps between runs: the newest context_token and getupdates' cursor. */
function wechatState(store: ChannelStore) {
  const r = store.get("wechat");
  return { ...(r?.ctx ? { ctx: r.ctx } : {}), ...(r?.buf ? { buf: r.buf } : {}) };
}
