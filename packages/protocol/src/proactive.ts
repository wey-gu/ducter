// D165, D166 (design/connectors.md Part A): what Ducter notices in the accounts the person let it
// read, and how it says so. Shared by core and every client.

/**
 * The ten kinds of finds (§4; coming_up, service and update: D243). Each has a plain name on screen (i18n `kind.<id>`), and is what
 * the person reacts to ("这类不用告诉我 / Don't tell me this kind").
 *   mismatch         两处对不上 / Two things don't match (joins over the facts ledger)
 *   waiting_on_you   在等你回 / Waiting on you (people only; 2 working days, or asked again)
 *   waiting_on_them  你在等别人回 / You're waiting on someone (3 working days, when it mattered)
 *   promised         你答应过的 / Something you promised (said on the due morning)
 *   deadline         到期和花钱的事 / Deadlines and money
 *   plan_changed     计划变了 / A plan changed
 *   meeting          开会前 / Before a meeting (10 min before, only with something open)
 *   coming_up        快到了 / Coming up (a flight or a train in the next day and a half: when, where, when to leave)
 *   service          你用的服务 / A service you use (maintenance, an outage, a job that keeps failing, a shutdown)
 *   update           之前说的有变 / An update to what I told you (a later notice changes a find already said)
 *   said             你说过的 / Something you said (D281: a reminder they asked for, a thing they said they would do on a day, the partner's own promise to remind; from the conversation, said once at its moment)
 *   todos            你的待办 / Your to-dos (D359: the to-dos Ducter can clear today)
 * D458: offers from past the accounts (proactive/wider.ts), each naming where it came from (FindView.origin):
 *   next_step        接着可以做的 / A next step (what finished work implies: a follow-up issue still open, something a task noticed, a failure whose cause is fixed now, a routine whose result changed)
 *   remembered       记得的 / Remembered (what Mem knows that is timely now: a preference meeting an event, a decision whose condition is met, a conversation with another tool left unfinished)
 *   loose_end        你提过的 / You mentioned (a thing the person said they'd get to, with no day and no reminder)
 */
export type FindKind = "mismatch" | "waiting_on_you" | "waiting_on_them" | "promised" | "deadline" | "plan_changed" | "meeting" | "coming_up" | "service" | "update" | "said" | "todos" | "next_step" | "remembered" | "loose_end";
export const FIND_KINDS: readonly FindKind[] = ["mismatch", "waiting_on_you", "waiting_on_them", "promised", "deadline", "plan_changed", "meeting", "coming_up", "service", "update", "said", "todos", "next_step", "remembered", "loose_end"];
/** D458: the kinds that come from past the accounts (tasks, Mem, the conversation). */
export const WIDER_KINDS: readonly FindKind[] = ["next_step", "remembered", "loose_end"];
export const isFindKind = (k: unknown): k is FindKind => typeof k === "string" && (FIND_KINDS as readonly string[]).includes(k);

/**
 * 发现了就说 / When it notices something (§5): one chip row, single choice. D453: two lanes.
 * Interruptions (a "now" note, a time-sensitive notification) stay rare in every mode: only what
 * costs something if it waits a day, at most NOW_MAX a day, held in quiet hours. Offers (quiet
 * finds in the morning note and fold-ins: never a push of their own, never needs-you) are generous.
 *   urgent  只说急的 / Only urgent: only interruptions, no offers, no morning note
 *   three   每天最多 3 条 / Up to 3 a day: offers capped at 3 a day (a restraint the person chose)
 *   useful  有用就说 / Whenever useful: the default (D453), also before the person chose: up to
 *           OFFER_NOTE_MAX in a note, OFFERS_A_DAY a day, ranked by what the person took up
 *   off     不用主动找我 / Only when I ask: nothing watches
 */
export type ProactiveMode = "urgent" | "three" | "useful" | "off";
export const PROACTIVE_MODES: readonly ProactiveMode[] = ["urgent", "three", "useful", "off"];
/** D250, D453: the mode of a home that never chose one: 有用就说 (was 每天最多 3 条 until D453). */
export const DEFAULT_PROACTIVE: ProactiveMode = "useful";
/** D453: offers in one note (the first OFFER_SHOWN in full, the rest under 还有几条 / A few more). */
export const OFFER_NOTE_MAX = 6;
/** D453: offers shown in full before the fold (one phone screen, D165 §6). */
export const OFFER_SHOWN = 3;
/** D453: offers a day in all (the morning note and the day's fold-ins), 有用就说. */
export const OFFERS_A_DAY = 10;

/**
 * D250: where the mode came from.
 *   default    never chosen: 每天最多 3 条 (connecting an account is consent to read; the first
 *              morning note says how it works, with the chips)
 *   chosen     the person picked it (the chips, in a note or in Settings; or answered a re-offer)
 *   keep_note  they said 不再需要 / No more to 早上那条还要吗？ after three unread mornings (D250;
 *              D453 retired the pause, so no new home gets here): only urgent, and the morning note
 *              offered back once when the notes got better (NOTES_REV)
 * Absent with a mode set: chosen before D250 (the source wasn't kept then).
 */
export type ProactiveSource = "default" | "chosen" | "keep_note";
/** 每天最多 3 条: offers a day when the person chose that restraint (D453: no longer the default). */
export const DAILY_CAP = 3;

/** 怎么知道的 / How I know: one mail, event or thread it rests on, with its date. Never a quote. */
export interface FindHow {
  what: string; // "续费通知" (its subject or header), ≤ 80 chars
  from?: string; // "Cloudflare": who it came from, its own element (D291)
  at: string; // ISO date of that mail or event
  /**
   * D388: where it was read, said as its own small word before it (日历 / 邮件 / 你说的 / 网上;
   * i18n `find.src.<id>`): the order of the lines is the order the find rests on them.
   */
  src?: FindSrc;
  /** D388: what this source says about the thing ("11/21（周六），全天，没写时间"), ≤ 60 chars; code's words, never a quote. */
  says?: string;
  /** D388: the page it was read on (a web look's source), http(s) only: every web claim links its source. */
  url?: string;
}

/** D388: the kinds of source a find's line names. D458: task (a task's report), mem (Nowledge Mem). */
export type FindSrc = "calendar" | "mail" | "chat" | "github" | "you" | "web" | "task" | "mem";
export const FIND_SRCS: readonly FindSrc[] = ["calendar", "mail", "chat", "github", "you", "web", "task", "mem"];

/** One find, as the note shows it. */
export interface FindView {
  findId: string;
  kind: FindKind;
  /** At most two sentences in the person's language (zh ≤ ~60 characters). */
  text: string;
  how: FindHow[];
  /** Its one next step: a decision (default Hold) the clients render inside the note. */
  decisionId?: string;
  goLabel?: string;
  /** The date it stops mattering; past it an untouched find quietly becomes 过了 / Passed. */
  dueAt?: string;
  /** Who it is about, for the Rule "这类不用告诉我" ("Cloudflare 的续费提醒不用告诉我"). */
  sender?: string;
  /** D388: what it doesn't know yet, in the person's language ("几点开始"), ≤ 60 chars; under 怎么知道的. */
  unknown?: string;
  /** D388: what it did not change, when the person might think it did ("日历我没改。"), ≤ 40 chars. */
  untouched?: string;
  /**
   * D403: a reply already written for a 在等你回 find, shown whole in the card and editable in
   * place. Its Go is 发出去 / Send: the text as edited goes with the Go (decision_resolved.text),
   * waits SEND_UNDO_MS with 撤回 / Undo, then is sent once by the home; never sent on its own.
   */
  draft?: FindDraft;
  /**
   * D453: said as an offer (the morning note, a fold-in), not an interruption: its step has no
   * Hold, it never counts as needs-you, and untouched by the next morning it fades (its words stay,
   * dimmed; no "missed" mark).
   */
  offer?: boolean;
  /**
   * D458: where it came from, in the person's language, one line under its words ("从你和 Codex
   * 11 月 12 日的对话想到的 / From your conversation with Codex on Nov 12"): code's words, never a quote.
   */
  origin?: string;
}

/** D403: the reply a cheap model wrote from the thread, in its language, in the person's own voice. */
export interface FindDraft {
  text: string;
  /** Who it goes to (their name, else their address) and the account it is sent from. */
  to: string;
  from?: string;
  /** The subject it answers. */
  subject?: string;
  /** BCP 47: the thread's language. */
  lang: string;
  /** What to make true or check before sending ("Plus 真的开通了"), at most 40 chars; shown above Send. */
  check?: string;
}

/** D403 (D61 GQ3): how long a reply waits after Go before it is sent, with 撤回 / Undo. */
export const SEND_UNDO_MS = 30_000;

/**
 * The rungs of the ladder (§5) a note was said on. "first": the first-account moment (§11).
 * "first" and "morning" may carry an `ask` the clients render with the shared controls:
 *   first_look  好，看一眼 / Take a look (default) · 先不用 / Not now
 *   cadence     the chip row itself (the answer is the setting)
 *   keep_note   保留 / Keep (default) · 不再需要 / No more (= 只说急的; D250: offered back once later)
 *   note_again  好 / Yes · 不用 / No thanks: the morning note offered back once (D250); no answer
 *               keeps 只说急的
 * D250: the first morning note said on the default (never chosen) carries `cadence` too.
 */
export type FindRung = "morning" | "fold" | "now" | "meeting" | "first";
export type ProactiveAsk = "first_look" | "cadence" | "keep_note" | "note_again";
/** The asks answered with yes or no (the cadence ask is answered by the chips). */
export type ProactiveYesNo = "first_look" | "keep_note" | "note_again";
export const isProactiveYesNo = (a: unknown): a is ProactiveYesNo => a === "first_look" || a === "keep_note" || a === "note_again";

/** One state change of a find (core writes it; clients fold it into the note). */
/**
 * D403: a drafted reply's own states: sending (Go given, its undo window running until `until`),
 * sent, unsent (撤回 / Undo, or a restart inside the window: the card asks again, with a new
 * decisionId), send_failed (the account refused or didn't answer; `error` says it in a few words).
 */
export type FindState = "go" | "held" | "passed" | "useful" | "muted" | "sending" | "sent" | "unsent" | "send_failed";

/** One app it can read in a source (a tile on the accounts card, D166). */
export interface AppWatch {
  service: string; // "gmail"
  title: string; // "Gmail"
  account?: string; // "wey@nowledge.co" or oo's label for it
  /** 自己留意 / Watch on its own (on by default for mail, calendar, GitHub; chat: @-mentions and DMs). */
  watch: boolean;
  /** 不让 Ducter 看这个 / Don't let Ducter read this one (policy.deny, with a control). */
  excluded: boolean;
  /** Its source can't reach it now (signed out, refused): the tile is grey. */
  unreachable?: boolean;
  lastReadAt?: string;
  readsToday?: number;
  /**
   * D402: why Ducter stopped looking at it by itself, said on its row: unsupported (the source can't
   * read what the watch needs, e.g. OOMOL's Discord bot has no mentions or DMs), reconnect (the
   * source says the account must be connected again there).
   */
  trouble?: "unsupported" | "reconnect";
  /** D222: a calendar account's calendars, and which it reads (absent until it listed them). */
  calendars?: import("./calendar.ts").CalendarRow[];
}

/** What a source's watching looks like today: the card's status line and its tiles. */
export interface SourceLook {
  /** watching (mode not off and at least one tile watched) or reading only when asked. */
  watching: boolean;
  /** The morning note paused itself (three unread mornings, D165 §8). D453 retired the pause: never set now. */
  paused?: boolean;
  /** Items read today by the watchers (emails, events, threads). Details only (⋯), never the status line (D173). */
  readToday: number;
  /** Finds said today from this source. */
  worthToday: number;
  /** This month's model budget used, 0..100 (D114's mechanism). */
  budgetPct: number;
  apps: AppWatch[];
}

/** 看了哪些 / What it read: one line per read today, newest first. */
export interface ReadLine {
  at: string;
  service: string;
  account?: string;
  /** How many items, and what it looked at (no quote, no body). */
  items: number;
  what: "new" | "full" | "events" | "mentions";
}

/**
 * D226: why it held something back today (今天看了什么 / What it looked at today, in Settings ›
 * Notifications). Counts only, never a subject or a sender.
 *   not_urgent   the mode is 只说急的 and it can wait
 *   for_morning  it waits for the next morning note
 *   below_bar    the bar said it isn't worth interrupting for
 *   cap          over today's 3
 *   muted        a kind or sender the person said not to tell them about
 *   budget       the source used this month's budget (only urgent goes)
 *   night        quiet hours: it waits for the morning
 */
export type QuietReason = "not_urgent" | "for_morning" | "below_bar" | "cap" | "muted" | "budget" | "night";
export const QUIET_REASONS: readonly QuietReason[] = ["not_urgent", "for_morning", "below_bar", "cap", "muted", "budget", "night"];

/**
 * D226: it could not read mail closely (triage failed), in plain kinds:
 *   no_agent       no AI agent to read with yet
 *   not_installed  the agent it thinks with isn't installed on the home
 *   signed_out     that agent is signed out or refused
 *   failed         anything else (a timeout, an answer it couldn't use)
 */
/** nothing_kept (D232): reading closely works, yet a day of it kept nothing: likely broken. */
export type ReadProblem = "no_agent" | "not_installed" | "signed_out" | "failed" | "nothing_kept";

/** D226: one day of watching, as Settings shows it under the switch. */
/**
 * D388: `ducter proactive replay`: what Ducter would have said over the last days of the person's
 * real accounts, run through a second engine in a dry mode on the home (its own scratch Log and
 * state, no pushes, no tasks, nothing in the conversation, deleted after). Words only, for the
 * person's own terminal.
 */
export interface ReplayReport {
  days: number;
  mode: ProactiveMode;
  zone: string;
  /** A web look was allowed for open questions (and could run). */
  web: boolean;
  looked: ProactiveDay["looked"];
  read: number;
  noted: number;
  /** What it would have said, in order: the rung, the find with its sources, what it doesn't know. */
  said: { rung: FindRung; kind: FindKind; text: string; how: FindHow[]; unknown?: string; untouched?: string }[];
  /** What it held back, and why (the same reasons as 今天看了什么). */
  held: ProactiveDay["held"];
  /** What it noticed, said or not, with the answer to "how did you know?". */
  noticed: { kind: FindKind; text: string; said: boolean; why?: string; unknown?: string }[];
  /** The questions it left open (a plan's day or time), and whether a later source closed them. */
  open: { name: string; fields: ("day" | "time")[]; state: "open" | "filled" | "gone" }[];
  /** Web looks run for open questions. */
  looks: number;
  problem?: ProactiveDay["problem"];
}

/**
 * D464: where an offer came from, for counting (`ducter proactive week`): the person's accounts
 * (mail, calendar, chat, GitHub: the D165 kinds), finished tasks (next_step), Nowledge Mem
 * (remembered), the conversation (said, loose_end) and the to-dos (todos, D359).
 */
export type FindFrom = "accounts" | "tasks" | "mem" | "conversation" | "todos";
export const FIND_FROMS: readonly FindFrom[] = ["accounts", "tasks", "mem", "conversation", "todos"];
export const findFrom = (k: FindKind): FindFrom => (k === "next_step" ? "tasks" : k === "remembered" ? "mem" : k === "said" || k === "loose_end" ? "conversation" : k === "todos" ? "todos" : "accounts");
/** D453, D464: the author's line: one offer in twenty taken up is the aha. */
export const AHA_LINE = 1 / 20;
/** D464: what the person opened under a find: 怎么知道的 / How I know, or 还有几条 / A few more (brought it into view). */
export type FindOpenWhat = "how" | "more";

/**
 * D464: what became of a set of finds. Each find counts once per column, whatever happened after:
 * one find can be opened, then taken up. taken: Go, 有用 or a reply (the aha); answered: any
 * response at all (opened, taken up, held, 这类不用告诉我); faded: left alone until it faded or
 * passed its date; waiting: still live, nothing yet.
 */
export interface OfferCounts {
  shown: number;
  opened: number;
  go: number;
  useful: number;
  replied: number;
  held: number;
  muted: number;
  faded: number;
  waiting: number;
  taken: number;
  answered: number;
}

/** D464: one week (Monday to Sunday in the person's zone) of what Ducter offered and what came of it. */
export interface WeekRow {
  /** YYYY-MM-DD: the Monday, and the Sunday (or today, for the week in progress). */
  from: string;
  to: string;
  current: boolean;
  /** Offers: the morning note, fold-ins, the to-do picks, the first look. */
  offers: OfferCounts;
  byKind: Partial<Record<FindKind, OfferCounts>>;
  bySource: Partial<Record<FindFrom, OfferCounts>>;
  /** Interruptions ("now", 开会前: each one a time-sensitive notification), counted apart. */
  interruptions: OfferCounts;
  /** What the person took up, by its words (at most TAKEN_LIST, oldest first). */
  takenUp: { kind: FindKind; text: string; by: "go" | "useful" | "replied"; at: string; offer: boolean }[];
}

/** D464: `ducter proactive week`: from the Log, per week; and the weights learned now (D453). */
export interface WeekReport {
  /** When it was counted (ISO), and the zone the weeks are cut in. */
  at: string;
  zone: string;
  mode: ProactiveMode;
  /** Oldest first. */
  weeks: WeekRow[];
  /** What ranks offers now: per kind and per sender, 1 = knows nothing (never gating). */
  weights: { kind: Partial<Record<FindKind, number>>; senders: { sender: string; w: number }[] };
}

export interface ProactiveDay {
  /** The person's day, YYYY-MM-DD. */
  day: string;
  /** What the watchers looked at today (emails, calendar events, mentions and DMs). */
  looked: { mail: number; events: number; mentions: number };
  /** Left by rules before any model (notices and receipts, marketing, muted senders). */
  skipped: { notices: number; promo: number; muted: number };
  /** Read closely (triage) today, and the facts it noted from them and the calendars. */
  read: number;
  noted: number;
  /** Said today (all rungs). */
  said: number;
  /** What it held back, open now, by reason (only reasons with n > 0). */
  held: { reason: QuietReason; n: number }[];
  /** Reading closely is failing: what, which agent (its name), since when, how many items wait. */
  problem?: { why: ReadProblem; agent?: string; since: string; waiting: number };
  /** The next morning note (ISO), when the mode has one. */
  nextNote?: string;
  /** Notifications are off, or no phone or browser has them on: a note would only show in the app. */
  pushOff?: boolean;
  /** The look back over earlier mail is still running. */
  catchingUp?: boolean;
}
