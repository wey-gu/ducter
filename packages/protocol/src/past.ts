// D285: 做过的事 / Past tasks. Every task the person ever had, found again by what anyone said,
// what it changed, where it ran and when; the person's own marks on them (a name, a star, a few
// tags, a picture); and the two ways back: 接着做 / Continue (the same task) and 带着它开新任务 /
// New task from this (a new task seeded with what that one found). design/past.md.
import type { Attention, DiffStat, RoutineTrigger } from "./index.ts";

/** The pictures a person can give a task: literal kinds of work, drawn (never emoji, D211). */
export const PAST_GLYPHS = ["fix", "build", "look", "review", "write", "ship", "data", "talk", "errand", "idea"] as const;
export type PastGlyph = (typeof PAST_GLYPHS)[number];

/** The clay tints a picture sits on: the person's own grouping, never a state's colour. */
export const PAST_TINTS = ["clay", "sand", "sage", "mist", "lilac", "stone"] as const;
export type PastTint = (typeof PAST_TINTS)[number];

/** The person's marks on one task, kept per persona on the home (marks.json). */
export interface PastMark {
  /** Their own name for it; shown wherever the task's title is. */
  name?: string;
  starred?: boolean;
  /** At most PAST_TAGS_MAX, each at most 24 characters, lowercased for Latin. */
  tags?: string[];
  glyph?: PastGlyph;
  tint?: PastTint;
  at: string;
}

export const PAST_TAGS_MAX = 5;
export const PAST_TAG_LEN = 24;
export const PAST_NAME_LEN = 80;

/** What changes a mark. null clears that field; absent leaves it. */
export interface PastMarkPatch {
  name?: string | null;
  starred?: boolean;
  tags?: string[];
  glyph?: PastGlyph | null;
  tint?: PastTint | null;
}

/** Where a result was found: why this card came up for these words. */
export type PastField = "name" | "title" | "tag" | "words" | "report" | "file" | "branch" | "project" | "agent" | "brief";

/** One task as Past tasks shows it: what it was and how it ended, at a glance. */
export interface PastItem {
  taskId: string;
  /** The person's name for it when they gave one, else the task's own title. */
  title: string;
  /** The task's own title, when the person renamed it. */
  original?: string;
  /** Its project ("" = none, shown as 其他 / Other). */
  project: string;
  harness: string;
  model?: string;
  /** The computer it ran on, by name, when it isn't the home (a worker). */
  computer?: string;
  openedAt: string;
  updatedAt: string;
  attention: Attention;
  /** How it ended, in its own words: the first line of its last report. */
  outcome?: string;
  changes?: DiffStat;
  branch?: string;
  /** Merged, or a draft PR opened, from Ducter. */
  integrated?: { act: "merge" | "open_pr"; ref?: string };
  /** The picture Ducter would draw when the person chose none (from its words, deterministic). */
  kind: PastGlyph;
  mark?: PastMark;
  /** For a search: where it matched, with a short piece of the text around it. */
  hit?: { field: PastField; text: string };
  /** A task seeded from another one (New task from this): that task's id and title. */
  from?: { taskId: string; title: string };
}

/** What narrows Past tasks. Every field optional; together they AND. */
export interface PastQuery {
  /** Free words: matched across names, titles, tags, the person's words, reports, files,
   *  branches, projects and agents. Time words (昨天, 上周二, last week…) become a date range. */
  q?: string;
  project?: string;
  harness?: string;
  tag?: string;
  starred?: boolean;
  /** ISO dates (inclusive start, exclusive end), on when it was last worked on. */
  since?: string;
  before?: string;
  limit?: number;
}

export interface PastFacets {
  projects: { name: string; n: number }[];
  harnesses: { harness: string; n: number }[];
  tags: { tag: string; n: number }[];
}

// ---------- 一直在跑的 / Ongoing: what keeps going (a routine, a task looking again on its own) ----------

/** One run of a routine, or one look of a task's wait, as a small pebble on the card. */
export interface OngoingRun {
  at: string;
  /** done: it ran and reported; failed; skipped (missed, budget, the last still running); running; looked: a wait looked and nothing yet; met: a wait's condition held. */
  state: "done" | "failed" | "skipped" | "running" | "looked" | "met";
  taskId?: string;
  /** One line: the run's report, or what the look saw. */
  line?: string;
}

/** What keeps going on its own: a routine (scheduled or on a condition), or a task resting on its own wait or loop. */
export interface OngoingItem {
  kind: "routine" | "task";
  /** The routine's id, or the task's. */
  id: string;
  title: string;
  project?: string;
  /** running: a run or turn is going now; resting: waits for its next time; paused: the person (or Ducter) paused it; needs_you: it asks something; proposed: a routine not yet started. */
  state: "running" | "resting" | "paused" | "needs_you" | "proposed";
  /** A routine's trigger (the clients say it in words: 每天 09:00 / Every day at 9:00). */
  trigger?: RoutineTrigger;
  /** The trigger in words, as the routine keeps them (每天 09:00 · 跟着你的时区). */
  cadence?: string;
  /** A task's wait: how often it looks, and what for. */
  everyMs?: number;
  reason?: string;
  /** When it runs or looks next (absent while paused or running). */
  nextAt?: string;
  /** Paused: until when it stays paused (absent: until resumed), and who paused it. */
  pausedUntil?: string;
  pausedBy?: "user" | "partner" | "system";
  /** Why Ducter paused it: failures, budget, unread, review (a routine's pauseReason). */
  pauseWhy?: string;
  /** The latest runs or looks, oldest first (at most 12). */
  runs: OngoingRun[];
  /** The task of a routine's run in progress, or the task itself. */
  taskId?: string;
  startedAt: string;
  mark?: PastMark;
}

/** What 暂停 / Pause, 恢复 / Resume, 现在跑一次 / Run now and 改时间 / Change when do. */
export type OngoingAction =
  | { action: "pause"; until?: string }
  | { action: "resume" }
  | { action: "run_now" }
  | { action: "retime"; trigger: Extract<RoutineTrigger, { kind: "time" }> }
  | { action: "end" };

export type PastClientFrame =
  // Answered with past_result (id echoed); the socket gets past_marked for every mark from then on.
  | { t: "past"; id?: string; query: PastQuery }
  // The person's marks on one task: rename, star, tags, picture. Answered (and told to every
  // other window) with past_marked.
  | { t: "past_mark"; taskId: string; patch: PastMarkPatch }
  // 接着做 / Continue: the same task goes back to work; harness (and model) when the person picked
  // another agent; words, what they say to it first. Answered with action_result (action "continue").
  | { t: "past_continue"; taskId: string; harness?: string; model?: string; words?: string }
  // 一直在跑的 / Ongoing: answered with ongoing_result; every window gets a fresh one after an action.
  | { t: "ongoing"; id?: string }
  // Answered with action_result (taskId: the id, action: the action's name), then ongoing_result.
  | ({ t: "ongoing_action"; kind: "routine" | "task"; id: string } & OngoingAction);

export type PastServerFrame =
  // range: the dates the time words in q meant, so the field can say them (上周二 → 11月10日).
  | { t: "past_result"; id?: string; items: PastItem[]; total: number; facets: PastFacets; suggestions: string[]; range?: { since: string; before: string; words: string } }
  | { t: "past_marked"; taskId: string; mark: PastMark | null }
  | { t: "ongoing_result"; id?: string; items: OngoingItem[] };
