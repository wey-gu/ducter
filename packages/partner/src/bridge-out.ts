// Ducter's side of talking to other agents through Nowledge Bridge: who they are called, what
// the code itself says to them, the ledger of outgoing operations, and follow-through on silence.
// Pure functions over Log events; partner.ts does the calls (design/bridge.md, D105–D111).
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import { detect, fill, words, type LangTag } from "../../protocol/src/lang.ts";

// What the code itself says (D292): one table per language, picked through the fallback chain
// (a Korean request gets the English words until Korean has a table). zh sentences are joined
// with zhJoin at their placeholders, so a Latin name never runs into the Chinese round it.
const W = {
  zh: {
    unnamed: "一个 AI agent",
    claim: "接了：「{title}」。做完把结果回你。",
    outcome: "「{title}」：{state}。",
    done: "做完了",
    notDone: "没做成",
    chose: "用户选了：「{words}」",
    hold: "用户说先别动，晚点再问。",
    wait: "用户还没回，先别按这个动，晚点再问。",
    hours: "{n} 小时前",
    yesterday: "昨天",
    days: "{n} 天前",
    followRead: "{who}看过你{when}问的「{gist}」，还没回。回了我马上告诉你。",
    followUnread: "{who}还没回你{when}问的「{gist}」，它可能停了。回了我马上告诉你。",
    what: { message: "你让我发的消息", claim: "「接了」的回复", result: "任务的结果", reply: "回复" },
    failed: "{what}没能发给{who}：被拒绝了。",
    unconfirmed: "没能确认{what}是否到了{who}那里。我没有重发；需要的话再跟我说一次。",
    busy: "{what}没发给{who}：Nowledge Mem 那边这会儿收不了，不是你这边的问题。这次什么都没发出去，过一会儿再跟我说一声，我重新发。",
  },
  en: {
    unnamed: "an AI agent",
    claim: 'Taken: "{title}". I\'ll send you the result when it\'s done.',
    outcome: '"{title}": {state}.',
    done: "done",
    notDone: "not done",
    chose: "The user chose: «{words}»",
    hold: "The user says not now. Don't act on this; ask again later.",
    wait: "No answer from the user yet. Don't act on this; ask again later.",
    hours: "{n} hour{s} ago",
    yesterday: "yesterday",
    days: "{n} days ago",
    followRead: '{who} read what you asked {when} ("{gist}") but hasn\'t answered yet. I\'ll tell you as soon as it does.',
    followUnread: '{who} hasn\'t answered what you asked {when} ("{gist}"); it may have stopped. I\'ll tell you as soon as it does.',
    what: { message: "the message you asked me to send", claim: "the reply saying I took it", result: "the task's result", reply: "the reply" },
    failed: "I couldn't send {what} to {who}: it was refused.",
    unconfirmed: "I couldn't confirm {what} reached {who}. I didn't resend it; ask me again if you need it.",
    busy: "I couldn't send {what} to {who}: Nowledge Mem can't take messages right now, nothing wrong on your side. Nothing went out; tell me again in a little while and I'll send it.",
  },
};
type Words = typeof W.en;

/** A sentence from the table: zh joined part by part with zhJoin (D78), the rest filled. */
function say(lang: LangTag, key: { [K in keyof Words]: Words[K] extends string ? K : never }[keyof Words], vars: Record<string, string | number> = {}): string {
  const w = words(W, lang);
  const tpl = w[key];
  if (w !== W.zh) return fill(tpl, vars);
  return zhJoin(...tpl.split(/(\{\w+\})/).map((p) => (/^\{\w+\}$/.test(p) ? fill(p, vars) : p)));
}

/** The language another agent wrote in (its answer goes back in it): detected, else English. */
export function langOfRequest(text: string): LangTag {
  return detect(text)?.lang ?? "en";
}

type Msg = Bodies["bridge_msg"];
export type OutState = NonNullable<Msg["state"]>;

// ---------- names (D108) ----------

/**
 * An own agent Mem doesn't name: nmem 0.10.118's `open` carries no sender at all, and in the user's
 * "Only me" place every sender is one of their own agents (D249).
 */
const unnamed = (b: { label?: string; from?: string; to?: string }) => {
  const l = b.label || b.from || b.to;
  return !l || l === "another agent";
};
export const UNNAMED_OWN = { zh: W.zh.unnamed, en: W.en.unnamed } as const;

/** What the user reads for another agent (D273): what it is, by its own name ("Claude Code"),
 *  never "你的 …"; one Mem doesn't name is "一个 AI agent" / "an AI agent". */
export function whoForUser(b: { mine?: boolean; agent?: string; label?: string; from?: string; to?: string }, lang: LangTag): string {
  if (b.mine && b.agent) return b.agent;
  if (b.mine && unnamed(b)) return words(W, lang).unnamed;
  return (unnamed(b) ? "" : b.label || b.from || b.to) || words(W, lang).unnamed;
}

/** The same agent in the partner's input, with how to call it when talking to the user. */
export function whoForModel(b: { mine?: boolean; agent?: string; label?: string; from?: string; to?: string }): string {
  if (b.mine && b.agent) return `${b.agent} (the user's own agent: call it 你的 ${b.agent} / your ${b.agent}, never by the user's name)`;
  if (b.mine && unnamed(b))
    return "one of the user's own AI agents (Mem doesn't say which: call it by what its message says it is, e.g. 你终端里的 Claude, else 你的另一个 AI / your other AI agent; never by the user's name)";
  return b.label || b.from || b.to || "another agent";
}

// ---------- what the code says to other agents ----------

/**
 * The claim sent when a task opens for another agent's request (J-Q8): in the requester's
 * language, with the title in quotes, so a title in the user's language is a name, not mixed
 * prose (D109).
 */
export function claimText(requestText: string, title: string): string {
  return say(langOfRequest(requestText), "claim", { title });
}

/** The fixed line a teammate gets when the partner didn't reply itself (D107). */
/**
 * X1 (D164 (3)–(4)): what the asking agent hears, in its language, and nothing else. "wait" is
 * Ducter's own line when the user hasn't answered: the agent must not act on silence.
 */
export function peerAnswer(lang: LangTag, option: "go" | "hold" | "reply" | "wait", answer?: string): string {
  const w = (answer ?? "").trim();
  if (option === "go" || (option === "reply" && w)) return fill(words(W, lang).chose, { words: w });
  return words(W, lang)[option === "hold" ? "hold" : "wait"];
}
export const PEER_ASKS_OPEN = 3; // open questions per agent in Needs you (D163)
export const SENDER_DAILY = 20; // messages a day per sender before they are set aside (D163)
export const PEER_NOT_YET_MS = 30 * 60_000; // when an unanswered question gets "not yet" (D164 (4))
export const LIVE_MS = 30 * 60_000; // a conversation with an own agent is live this long (D164 (6))
export const LIVE_CHECK_MS = 60_000; // and checked this often meanwhile
export const DAY_MS = 24 * 60 * 60_000;
export const TRUST_AFTER = 2; // X2: Go's to the same own agent before the rule is offered (D163)
export const TRUST_WINDOW_MS = 14 * DAY_MS; // within this long
export const TRUSTED_DAILY = 5; // tasks a day a trusted agent may start; the sixth asks

export function fixedOutcome(requestText: string, title: string, done: boolean): string {
  const lang = langOfRequest(requestText);
  return say(lang, "outcome", { title, state: words(W, lang)[done ? "done" : "notDone"] });
}

/**
 * A request to another agent asks what the user asked, with background, not a numbered list
 * of extra sub-questions (dogfood: 3 of 3 runs, research/37 §3.1).
 */
const NUMBERED = /(?:^|[\s：:，,])(?:1[.)、）]|\(1\)|（1）|①)[\s\S]*?(?:2[.)、）]|\(2\)|（2）|②)|(^|\n)\s*[-*•]\s[\s\S]*\n\s*[-*•]\s/;
export function overAsks(text: string): boolean {
  return NUMBERED.test(text);
}

// ---------- the outgoing ledger (D106) ----------

export interface OutOp {
  opId: string;
  state: OutState; // the latest
  last: Msg; // the latest event's body (each carries the full op)
  seq: number; // the latest event's seq
  ts: string; // the latest event's time
  sentTs?: string; // when it became "sent"
  first: number; // seq of the first event
}

const LIVE: OutState[] = ["sending", "sent", "unknown", "unconfirmed"];
/** States in which the message may have reached the other side (so it is never sent again). */
export const mayHaveGone = (s: OutState) => LIVE.includes(s);

/** Outgoing operations folded from the Log, by opId. Events from before D106 are each one "sent" op. */
export function foldOut(events: LogEvent[]): Map<string, OutOp> {
  const ops = new Map<string, OutOp>();
  for (const e of events) {
    if (e.kind !== "bridge_msg") continue;
    const b = e.body as Msg;
    if (b.direction !== "out" || b.state === "followed") continue;
    const opId = b.opId ?? `seq:${e.seq}`;
    const state: OutState = b.state ?? "sent";
    const prev = ops.get(opId);
    ops.set(opId, {
      opId,
      state,
      last: b,
      seq: e.seq,
      ts: e.ts,
      first: prev?.first ?? e.seq,
      ...(state === "sent" ? { sentTs: e.ts } : prev?.sentTs ? { sentTs: prev.sentTs } : {}),
    });
  }
  return ops;
}

/** Out events the partner should read as messages (the final state of each op). */
export function shownOut(b: Msg): boolean {
  return b.direction === "out" && (b.state === undefined || b.state === "sent" || b.state === "unknown" || b.state === "unconfirmed" || b.state === "failed");
}

// ---------- follow-through on silence (D110) ----------

export const FOLLOW_AFTER_MS = 2 * 60 * 60_000; // never earlier than 2 h after the send
export const FOLLOW_ACTIVE_MS = 15 * 60_000; // the user did something in the last 15 min
const FOLLOW_MAX_AGE_MS = 7 * 24 * 60 * 60_000; // a week-old question is history, not a nudge

export interface Quiet {
  start: string;
  end: string;
  tz: string;
}
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
/** Same rule as core's push quiet hours (core/src/push.ts). */
export function inQuiet(at: number, q: Quiet | null | undefined): boolean {
  if (!q) return false;
  let now: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: q.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
    now = Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  } catch {
    return false;
  }
  const s = minutes(q.start);
  const e = minutes(q.end);
  return s === e ? false : s < e ? now >= s && now < e : now >= s || now < e;
}

/** A user-confirmed message that is sent, unanswered, old enough, and not followed up yet. */
export function followCandidates(events: LogEvent[], now: number): OutOp[] {
  const answered = new Set<string>();
  const followed = new Set<string>();
  let unlinked = ""; // the latest unlinked message from an own agent Mem doesn't name (D249)
  for (const e of events) {
    if (e.kind !== "bridge_msg") continue;
    const b = e.body as Msg;
    if (b.direction === "in" && b.inReplyTo) answered.add(b.inReplyTo);
    if (b.direction === "in" && !b.inReplyTo && b.mine && !b.agent && !b.state && e.ts > unlinked) unlinked = e.ts;
    if (b.direction === "out" && b.state === "followed") followed.add(b.messageId);
  }
  // nmem 0.10.118 links no reply to what it answers and names no sender: after a message to such an
  // agent, anything an unnamed own agent wrote since may be the answer. Unsure, Ducter stays quiet.
  const maybeAnswered = (o: OutOp) => o.last.mine && !o.last.agent && !!unlinked && unlinked > o.sentTs!;
  return [...foldOut(events).values()]
    .filter((o) => o.state === "sent" && o.last.decisionId && o.last.messageId && o.sentTs)
    .filter((o) => !answered.has(o.last.messageId) && !followed.has(o.last.messageId) && !maybeAnswered(o))
    .filter((o) => {
      const age = now - Date.parse(o.sentTs!);
      return age >= FOLLOW_AFTER_MS && age <= FOLLOW_MAX_AGE_MS;
    })
    .sort((a, b) => a.seq - b.seq);
}

function ago(ms: number, lang: LangTag): string {
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return fill(words(W, lang).hours, { n: h, s: h === 1 ? "" : "s" });
  const d = Math.floor(h / 24);
  if (d === 1) return words(W, lang).yesterday;
  return fill(words(W, lang).days, { n: d });
}

const CJK = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Chinese text joined with a space only where CJK meets a Latin letter or digit (D78). */
export function zhJoin(...parts: string[]): string {
  return parts.reduce((acc, p) => {
    if (!acc || !p) return acc + p;
    const a = acc[acc.length - 1]!;
    const b = p[0]!;
    const punct = /[，。：；！？「」（）、]/;
    if (punct.test(a) || punct.test(b)) return acc + p;
    return acc + (CJK.test(a) !== CJK.test(b) && /[A-Za-z0-9)]/.test(CJK.test(a) ? b : a) ? " " : "") + p;
  }, "");
}

/**
 * The one line (D110). It reports silence and never claims the other side was reminded: Bridge
 * wakes nobody. Read and unread are different facts, said only when the inbox told us.
 */
export function followLine(op: OutOp, now: number, lang: LangTag, read?: boolean, asked?: string): string {
  const who = whoForUser({ ...op.last, label: op.last.to }, lang);
  // The user's own words when we have them ("问问它：<question>" → the question), else ours.
  const src = asked ?? op.last.text;
  const line = src.split("\n").find((l) => l.trim())?.trim() ?? src;
  const colon = line.search(/[：:]/);
  const first = colon >= 0 && colon < 40 && line.slice(colon + 1).trim() ? line.slice(colon + 1).trim() : line;
  const gist = [...first].length > 36 ? [...first].slice(0, 35).join("") + "…" : first;
  const when = ago(now - Date.parse(op.sentTs!), lang);
  // D273: an agent's own name stays as it is; the unnamed one starts the sentence capitalised.
  const Who = who === UNNAMED_OWN.en ? "An AI agent" : who;
  return say(lang, read ? "followRead" : "followUnread", { who: Who, when, gist });
}

// ---------- what the user is told when an outgoing message can't be confirmed (D106) ----------

export type OutKind = "message" | "claim" | "result" | "reply";
// D294: "busy" is Mem's side saying it couldn't take it right now; nothing went out, so asking again is safe.
export function lostLine(op: OutOp, lang: LangTag, state: "failed" | "busy" | "unconfirmed", kind: OutKind): string {
  const who = whoForUser({ ...op.last, label: op.last.to }, lang);
  return say(lang, state, { what: words(W, lang).what[kind], who });
}
