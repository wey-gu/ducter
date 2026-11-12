// D165, D166 (design/connectors.md Part A): what Ducter notices in the accounts the person let it
// read, and how it says so. Shared by core and every client.

/**
 * The seven kinds of finds (§4). Each has a plain name on screen (i18n `kind.<id>`), and is what
 * the person reacts to ("这类不用告诉我 / Don't tell me this kind").
 *   mismatch         两件事对不上 / Two things don't match (joins over the facts ledger)
 *   waiting_on_you   在等你回 / Waiting on you (people only; 2 working days, or asked again)
 *   waiting_on_them  你在等别人回 / You're waiting on someone (3 working days, when it mattered)
 *   promised         你答应过的 / Something you promised (said on the due morning)
 *   deadline         快到期 · 要花钱 / Deadlines and money
 *   plan_changed     计划变了 / A plan changed
 *   meeting          开会前 / Before a meeting (10 min before, only with something open)
 */
export type FindKind = "mismatch" | "waiting_on_you" | "waiting_on_them" | "promised" | "deadline" | "plan_changed" | "meeting";
export const FIND_KINDS: readonly FindKind[] = ["mismatch", "waiting_on_you", "waiting_on_them", "promised", "deadline", "plan_changed", "meeting"];
export const isFindKind = (k: unknown): k is FindKind => typeof k === "string" && (FIND_KINDS as readonly string[]).includes(k);

/**
 * 发现了就说 / When it notices something (§5): one chip row, single choice.
 *   urgent  只说急的 / Only urgent: only "now" finds, no morning note
 *   three   每天最多 3 件 / Up to 3 a day (the default answer to the first-add question)
 *   useful  有用就说 / Whenever useful: no cap, still batched
 *   off     不用主动找我 / Only when I ask: nothing watches (also the state before the person answered)
 */
export type ProactiveMode = "urgent" | "three" | "useful" | "off";
export const PROACTIVE_MODES: readonly ProactiveMode[] = ["urgent", "three", "useful", "off"];
export const DAILY_CAP = 3;

/** 怎么知道的 / How I know: one mail, event or thread it rests on, with its date. Never a quote. */
export interface FindHow {
  what: string; // "Cloudflare · 续费通知" (sender · subject), ≤ 80 chars
  at: string; // ISO date of that mail or event
}

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
}

/**
 * The rungs of the ladder (§5) a note was said on. "first": the first-account moment (§11).
 * "first" and "morning" may carry an `ask` the clients render with the shared controls:
 *   first_look  好，看一眼 / Take a look (default) · 先不用 / Not now
 *   cadence     the chip row itself (the answer is the setting)
 *   keep_note   要 / Keep (default) · 不用了 / No more (= 只说急的)
 */
export type FindRung = "morning" | "fold" | "now" | "meeting" | "first";
export type ProactiveAsk = "first_look" | "cadence" | "keep_note";

/** One state change of a find (core writes it; clients fold it into the note). */
export type FindState = "go" | "held" | "passed" | "useful" | "muted";

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
  /** D222: a calendar account's calendars, and which it reads (absent until it listed them). */
  calendars?: import("./calendar.ts").CalendarRow[];
}

/** What a source's watching looks like today: the card's status line and its tiles. */
export interface SourceLook {
  /** watching (mode not off and at least one tile watched) or reading only when asked. */
  watching: boolean;
  /** The morning note paused itself (three unread mornings); 早上那条还要吗？ is pending. */
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
