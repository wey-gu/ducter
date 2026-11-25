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
    unnamed: "一个没留名字的 agent",
    inHost: "{host} 里的 agent",
    // D418: one of the person's own agents: by its own words, else that it is theirs.
    yours: "你的 {agent}",
    yoursRole: "你的 {agent}（{role}）",
    ownSomeone: "你自己的一个 agent",
    pingMany: "{who}的 {n} 条联络测试刚到，最早的是{late}发的。{done}",
    pingOne: "{who}的联络测试刚到，是{late}发的。{done}",
    pingManyNow: "{who}的 {n} 条联络测试到了。{done}",
    pingOneNow: "{who}的联络测试到了。{done}",
    pingDoneMany: "{said}都回了。",
    pingDoneOne: "{said}回了。",
    pingSaid: "按你{when}说的，",
    pingSomeFailed: "回了 {k} 条，{f} 条没回成：Nowledge Mem 没收下。",
    pingAllFailed: "没回成：Nowledge Mem 没收下。",
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
    followRead: "{who}看过你{when}问的{gists}，还没回。回了我马上告诉你。",
    followUnread: "{who}还没回你{when}问的{gists}，它可能停了。回了我马上告诉你。",
    quoted: "「{gist}」",
    and: "和",
    more: "等 {all} 条",
    what: { message: "你让我发的消息", claim: "「接了」的回复", result: "任务的结果", reply: "回复", task: "任务要发的消息" },
    failed: "{what}没能发给{who}：被拒绝了。",
    unconfirmed: "没能确认{what}是否到了{who}那里。我没有重发；需要的话再跟我说一次。",
    busy: "{what}没发给{who}：Nowledge Mem 那边这会儿收不了，不是你这边的问题。这次什么都没发出去，过一会儿再跟我说一声，我重新发。",
  },
  en: {
    unnamed: "an unnamed agent",
    inHost: "an agent in {host}",
    yours: "your {agent}",
    yoursRole: "your {agent} ({role})",
    ownSomeone: "one of your own agents",
    pingMany: "{n} contact tests from {who} just arrived; the earliest was sent {late}. {done}",
    pingOne: "A contact test from {who} just arrived; it was sent {late}. {done}",
    pingManyNow: "{n} contact tests from {who} arrived. {done}",
    pingOneNow: "A contact test from {who} arrived. {done}",
    pingDoneMany: "I answered them all{said}.",
    pingDoneOne: "I answered it{said}.",
    pingSaid: ", as you asked {when}",
    pingSomeFailed: "I answered {k}; {f} didn't go: Nowledge Mem didn't take them.",
    pingAllFailed: "My answer didn't go: Nowledge Mem didn't take it.",
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
    followRead: '{who} read what you asked {when} ({gists}) but hasn\'t answered yet. I\'ll tell you as soon as it does.',
    followUnread: '{who} hasn\'t answered what you asked {when} ({gists}); it may have stopped. I\'ll tell you as soon as it does.',
    quoted: '"{gist}"',
    and: " and ",
    more: " and {rest} more",
    what: { message: "the message you asked me to send", claim: "the reply saying I took it", result: "the task's result", reply: "the reply", task: "the task's message" },
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
 *  never "你的 …"; one Mem doesn't name is called by the tool it runs in when Mem says ("Claude Code
 *  里的 agent" / "an agent in Claude Code"), else "一个没留名字的 agent" / "an unnamed agent". */
export function whoForUser(b: { mine?: boolean; agent?: string; host?: string; label?: string; from?: string; to?: string; selfNamed?: boolean; role?: string }, lang: LangTag): string {
  // D418: an own agent named by its own words ("我是 Wey 的 Mem 协作 Codex") is theirs: 你的 Codex（Mem 协作）.
  if (b.mine && b.selfNamed && b.agent) return b.role ? say(lang, "yoursRole", { agent: b.agent, role: b.role }) : say(lang, "yours", { agent: b.agent });
  if (b.mine && b.agent) return b.agent;
  // D418: one Mem says is theirs but names in no way is still theirs, never "unnamed".
  const nameless = b.host ? say(lang, "inHost", { host: b.host }) : b.mine ? words(W, lang).ownSomeone : words(W, lang).unnamed;
  if (b.mine && unnamed(b)) return nameless;
  return (unnamed(b) ? "" : b.label || b.from || b.to) || nameless;
}

// Words that are tools, products or the agents themselves, never a person (D412).
const NOT_A_PERSON = new Set(["Claude", "Code", "Codex", "Cursor", "Ducter", "Bridge", "Mem", "Nowledge", "Task", "Background", "Goal", "Scope", "GitHub", "Linux", "Ubuntu", "Mac", "Me", "You", "The", "This", "Decision", "Agent", "Gemini", "Pi"]);

/**
 * D412: the names that stand for the person in their own agents' mail. Mem names no member
 * (nmem 0.10.121: "Member <id>"), so the 2026-11-20 card took "Weyl" from the body ("Task (from
 * Weyl, via Claude Code …)") and said 「Weyl 那边的 Claude Code」 to Weyl. An own agent works for the
 * person, so the one its first line says a request is from, or who asks or wants it, is them; the persona's
 * own identity may name them too ("You are Ducter, Weyl's personal AI partner").
 */
export function namesForUser(ownBodies: string[], identity = "", skip: string[] = []): string[] {
  const out = new Set<string>();
  const N = "(\\p{Lu}[\\p{Ll}]{1,20})";
  const pats = [
    new RegExp(`\\b(?:from|on behalf of)\\s+${N}\\b`, "gu"),
    new RegExp(`\\b${N}\\s+(?:says|said|asks|asked|wants|wanted|needs|is at|left)\\b`, "gu"),
    new RegExp(`${N}\\s*(?:说|问|让|要我|想|在)`, "gu"),
  ];
  // Only the message's first line, where an agent says whose request it carries ("Task (from Weyl, …)"):
  // a name further down may be someone else's ("Alex asked for this in review").
  for (const t of ownBodies) for (const re of pats) for (const m of (t.split("\n").find((l) => l.trim()) ?? "").matchAll(re)) out.add(m[1]!);
  for (const m of identity.matchAll(new RegExp(`${N}['’]s\\s+(?:personal|own)\\b`, "gu"))) out.add(m[1]!);
  const no = new Set([...NOT_A_PERSON, ...skip.flatMap((x) => x.split(/\s+/))]);
  return [...out].filter((n) => !no.has(n));
}

/** The same agent in the partner's input, with how to call it when talking to the user. */
export function whoForModel(b: { mine?: boolean; agent?: string; host?: string; label?: string; from?: string; to?: string; selfNamed?: boolean; role?: string }): string {
  if (b.mine && b.selfNamed && b.agent)
    return `${b.agent}${b.role ? ` (${b.role})` : ""} (the user's own agent, as its message says: call it 你的 ${b.agent}${b.role ? `（${b.role}）` : ""} / your ${b.agent}${b.role ? ` (${b.role})` : ""}, never by the user's name)`;
  if (b.mine && b.agent) return `${b.agent} (the user's own agent: call it 你的 ${b.agent} / your ${b.agent}, never by the user's name)`;
  if (b.mine && unnamed(b) && b.host) return `one of the user's own AI agents, in ${b.host} (unnamed: call it 你 ${b.host} 里的 agent / your agent in ${b.host}, never by the user's name)`;
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
export const LIVE_CHECK_MS = 15_000; // and checked this often meanwhile (D335)
export const CHECK_EVERY_MS = 60_000; // the inbox check's period otherwise (D335; was 5 min)
export const AFTER_SEND_MS = [10_000, 30_000, 60_000, 120_000]; // checks after a send or reply, until its answer (D335)
export const WAIT_S = 25; // one long-poll, when the CLI has `inbox --wait` (D335); D400: the client clamps it to what the CLI takes (nmem 0.10.121: 5)
export const WATCH_TRIES = 5; // D400: quick ends of an `inbox --watch` child in a row before the timer takes over
export const WATCH_BACKOFF_MS = 1_000; // D400: the first wait before a watch child is started again, doubling
export const WATCH_BACKOFF_MAX_MS = 5 * 60_000; // D400: and never longer than this
export const WAITING_EVERY_MS = 5 * 60_000; // while it long-polls, the check that keeps recovery and follow-through going
export const STUCK_EVERY_MS = 30 * 60_000; // D369: a mailbox Mem must sort out on its side: looked at again every 30 min (and on 查看来信)
export const WAIT_RETRY_MS = 10 * 60_000; // after a long-poll failed, the timer runs this long before it tries again
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
    // D364: a message Mem marks as linkable (it carried `in_reply_to`) and that has no parent answers nothing.
    if (b.direction === "in" && !b.inReplyTo && !b.linked && b.mine && !b.agent && !b.state && e.ts > unlinked) unlinked = e.ts;
    if (b.direction === "out" && b.state === "followed") for (const id of [b.messageId, ...(b.alsoFollowed ?? [])]) followed.add(id);
  }
  // nmem 0.10.118/0.10.119 link no reply to what it answers and name no sender: after a message to such
  // an agent, anything an unnamed own agent wrote since may be the answer. Unsure, Ducter stays quiet.
  // D364, D557: once Mem links replies (nmem 0.10.120+, VERIFIED live 2026-11-25) every message it reads
  // is `linked`, so this rule holds only for nmem 0.10.118 and 0.10.119.
  const maybeAnswered = (o: OutOp) => o.last.mine && !o.last.agent && !!unlinked && unlinked > o.sentTs!;
  return [...foldOut(events).values()]
    .filter((o) => o.state === "sent" && o.last.decisionId && o.last.by !== "task" && o.last.messageId && o.sentTs) // D448: a task waits for its own answer
    .filter((o) => !answered.has(o.last.messageId) && !followed.has(o.last.messageId) && !maybeAnswered(o))
    .filter((o) => {
      const age = now - Date.parse(o.sentTs!);
      return age >= FOLLOW_AFTER_MS && age <= FOLLOW_MAX_AGE_MS;
    })
    .sort((a, b) => a.seq - b.seq);
}

function ago(ms: number, lang: LangTag, round = false): string {
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return fill(words(W, lang).hours, { n: h, s: h === 1 ? "" : "s" });
  // D418: days to the nearest one for when a message was sent (2 days 22 hours reads "3 天前").
  const d = round ? Math.max(1, Math.round(ms / 86_400_000)) : Math.floor(h / 24);
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

/** Who an outgoing message went to, to say one line per agent (D412). */
export const recipientKey = (o: OutOp): string => o.last.contact || o.last.to || o.last.agent || "";

/**
 * D412: the candidates one follow-through line covers: every due message to the same agent as the
 * first. The 2026-11-20 live trial asked the terminal twice in an afternoon; one line named the
 * older question, and an hour later a second line named the newer one, to the same silent agent.
 */
export function followGroup(due: OutOp[]): OutOp[] {
  if (!due.length) return [];
  const key = recipientKey(due[0]!);
  return due.filter((o) => recipientKey(o) === key);
}

// "问一下我终端里那个 Claude，<question>" / "ask my terminal Claude: <question>": the question (the
// agent named last, right before the comma, so "问问我那个 Codex bridge 写到哪了，…" stays whole).
const ASK_PREFIX = /^\s*(?:再|也|帮我|麻烦)?(?:问一下|问问|问下|去问)[^，,：:]{0,24}?(?:Claude|Codex|Cursor|Gemini|agent|Agent|AI|它)\s*[，,：:]\s*|^\s*(?:please\s+)?(?:also\s+)?ask\s+(?:my|the|your)\s+[^,:?]{0,30}?(?:Claude|Codex|agent|AI|session)\s*[,:]\s*/iu;

/** What the user asked, short: their own words when we have them ("问问它：<question>" → the question), else ours. */
function gistOf(op: OutOp, asked?: string): string {
  const src = asked ?? op.last.text;
  const line = src.split("\n").find((l) => l.trim())?.trim() ?? src;
  const bare = asked ? line.replace(ASK_PREFIX, "").trim() || line : line;
  const colon = bare.search(/[：:]/);
  const first = colon >= 0 && colon < 40 && bare.slice(colon + 1).trim() ? bare.slice(colon + 1).trim() : bare;
  return [...first].length > 36 ? [...first].slice(0, 35).join("") + "…" : first;
}

/**
 * The one line (D110). It reports silence and never claims the other side was reminded: Bridge
 * wakes nobody. Read and unread are different facts, said only when the inbox told us. D412: one
 * line for every unanswered message to the same agent, newest first, aged by the oldest.
 */
export function followLine(op: OutOp | { op: OutOp; asked?: string }[], now: number, lang: LangTag, read?: boolean, asked?: string): string {
  const items = Array.isArray(op) ? [...op].sort((a, b) => b.op.seq - a.op.seq) : [{ op, asked }];
  const first = items[0]!.op;
  const who = whoForUser({ ...first.last, label: first.last.to }, lang);
  const w = words(W, lang);
  const q = items.map((i) => fill(w.quoted, { gist: gistOf(i.op, i.asked) }));
  const gists = q.length === 1 ? q[0]! : q.length === 2 ? q[0]! + w.and + q[1]! : q[0]! + fill(w.more, { all: q.length, rest: q.length - 1 });
  const oldest = Math.min(...items.map((i) => Date.parse(i.op.sentTs!)));
  const when = ago(now - oldest, lang);
  // D273: an agent's own name stays as it is; the unnamed one starts the sentence capitalised.
  const Who = capWho(who);
  return say(lang, read ? "followRead" : "followUnread", { who: Who, when, gists });
}

/** A sentence that starts with who: "an unnamed agent" / "your Codex" / "one of your own agents", capitalised. */
const capWho = (who: string) => (/^(an |your |one of )/.test(who) ? who[0]!.toUpperCase() + who.slice(1) : who);

// ---------- D418: an own agent's contact tests, answered by code ----------

export const PING_LATE_MS = 60 * 60_000; // a contact test sent this long before it arrived is late: the line says when
export const PING_SAID_MS = 7 * DAY_MS; // what the person said about it this recently counts

/**
 * D418: the one line about contact tests from one of the person's own agents that Ducter answered
 * itself, folded: how many, the earliest's age when they came late, that it was what the person asked
 * for, and whether every answer went. Said only when the person asked for them or an answer didn't
 * go; otherwise the quiet line in the conversation is all (silence means success).
 */
export function pingLine(p: { who: Msg; n: number; earliest?: number; now: number; said?: number; sent: number; lang: LangTag }): string {
  const { lang } = p;
  const who = whoForUser({ ...p.who, label: p.who.to }, lang);
  const said = p.said !== undefined ? say(lang, "pingSaid", { when: ago(p.now - p.said, lang, true) }) : "";
  const failed = p.n - p.sent;
  const done = !failed ? say(lang, p.n > 1 ? "pingDoneMany" : "pingDoneOne", { said }) : p.sent ? say(lang, "pingSomeFailed", { k: p.sent, f: failed }) : say(lang, "pingAllFailed");
  const late = p.earliest !== undefined && p.now - p.earliest >= PING_LATE_MS ? ago(p.now - p.earliest, lang, true) : undefined;
  const key = p.n > 1 ? (late ? "pingMany" : "pingManyNow") : late ? "pingOne" : "pingOneNow";
  return capWho(say(lang, key, { who, n: p.n, late: late ?? "", done }));
}

// ---------- what the user is told when an outgoing message can't be confirmed (D106) ----------

export type OutKind = "message" | "claim" | "result" | "reply" | "task"; // D448: task, a message a task asked to send
// D294: "busy" is Mem's side saying it couldn't take it right now; nothing went out, so asking again is safe.
export function lostLine(op: OutOp, lang: LangTag, state: "failed" | "busy" | "unconfirmed", kind: OutKind): string {
  const who = whoForUser({ ...op.last, label: op.last.to }, lang);
  return say(lang, state, { what: words(W, lang).what[kind], who });
}
