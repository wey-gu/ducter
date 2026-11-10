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
 * 自己发现了事，怎么告诉你 / When it notices something (§5): one chip row, single choice.
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
}

/** What a source's watching looks like today: the card's status line and its tiles. */
export interface SourceLook {
  /** watching (mode not off and at least one tile watched) or reading only when asked. */
  watching: boolean;
  /** Items read today by the watchers (emails, events, threads). */
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
