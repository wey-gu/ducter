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
  /** D514: keep this task's working copy whatever its age (the tidy never removes it). */
  keepCopy?: boolean;
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
  keepCopy?: boolean;
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
  /** A task seeded from another one (New task from this): that task's id and title; D391 step:
   *  it redoes that task from its step n (从这一步重来 / Redo from here). */
  from?: { taskId: string; title: string; step?: number };
  /** D299: carried on from a session the person ran in their own agent outside Ducter. */
  outside?: { agent: OutsideAgent; startedAt: string };
  /** D391: the agent's last words in it, one line (where it stopped, in its own voice). */
  lastWords?: string;
  /** D391: what it asks the person, while it waits on them. */
  asking?: string;
  /** D391: how many steps it has (its brief, then each later message to it). */
  steps?: number;
  /** D514: its working copy was tidied away (工作副本已整理，接着做会重新拉一份); Continue makes a fresh one. */
  tidied?: boolean;
}

// ---------- D391: steps, and redoing a task from one ----------

/** One step of a task: its brief (n 1), then each later message to it, with what came of it. */
export interface PastStep {
  /** 1-based; 1 is the brief. */
  n: number;
  /** The Log seq of the message (the brief: the task_open). */
  seq: number;
  at: string;
  /** Who said it: the person, or the partner for them. */
  who: "you" | "partner";
  /** The words, cut to PAST_STEP_LEN. */
  text: string;
  /** The agent's last words before the next step (or the end), one line, cut. */
  came?: string;
  /** The code as it stood when this step began: the last commit on its branch before it (short sha). */
  commit?: string;
}

export const PAST_STEP_LEN = 400;

/** 从这一步重来 / Redo from here: a new task from step n of this one. */
export interface PastForkInput {
  taskId: string;
  /** The step to redo (1 = from the start); absent = the last step. */
  step?: number;
  /** Another agent (and model) for it; absent = the same. */
  harness?: string;
  model?: string;
  /** What to ask at that step instead of its own words; absent = its own words. */
  words?: string;
}

// ---------- D299: 也在这台电脑上 / Also on this computer ----------

/** The AI agents whose own sessions Past tasks lists: what the person ran by hand, outside Ducter. */
export const OUTSIDE_AGENTS = ["claude-code", "codex", "pi"] as const;
export type OutsideAgent = (typeof OUTSIDE_AGENTS)[number];

/** Where an outside session matched the words. */
export type OutsideField = "title" | "words" | "project" | "branch" | "agent";

/** One session the person ran in their own agent on the home, outside Ducter, as a card. */
export interface OutsideItem {
  agent: OutsideAgent;
  /** The agent's own session id (what it resumes by). */
  id: string;
  /** Its name (the person's /rename, or the agent's own title), else the person's first words. */
  title: string;
  /** The person's first words, when the title is a name. */
  ask?: string;
  /** The folder's name. */
  project: string;
  /** The folder it ran in, with ~ for the home folder. */
  cwd: string;
  branch?: string;
  model?: string;
  startedAt: string;
  updatedAt: string;
  /** The picture Ducter draws from its words (the same guess as a task's). */
  kind: PastGlyph;
  hit?: { field: OutsideField; text: string };
  /** Its folder isn't there any more: it can't be carried on in place. */
  gone?: true;
}

/** Each agent Past tasks reads, how many sessions it showed, and whether the person hid it. */
export interface OutsideSource {
  agent: OutsideAgent;
  n: number;
  hidden: boolean;
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
  /** D391: the computer it ran on, by name ("" = the home). */
  computer?: string;
  /** D391: how it ended: done, didn't work, cancelled, or still on hand (anything not finished). */
  ended?: "done" | "failed" | "cancelled" | "on_hand";
  /** ISO dates (inclusive start, exclusive end), on when it was last worked on. */
  since?: string;
  before?: string;
  limit?: number;
}

export interface PastFacets {
  projects: { name: string; n: number }[];
  harnesses: { harness: string; n: number }[];
  tags: { tag: string; n: number }[];
  /** D391: the computers tasks ran on, by name ("" = the home), most used first. */
  computers?: { name: string; n: number }[];
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
  /** D394: a review task's standing: the requests waiting on the person after its last round. */
  reviews?: import("./task-sources.ts").ReviewStanding;
  /** D407: the small app this task keeps current (审查看板 / Review board, or one the partner made): the card opens it. */
  app?: { id: string; name: string };
  /** The task of a routine's run in progress, or the task itself. */
  taskId?: string;
  startedAt: string;
  mark?: PastMark;
  /** D427: a task in rounds that Ducter keeps going (a loop), not a one-off wait. */
  loop?: boolean;
  /** D427: how it is keeping its promise. Absent: on time (silence means fine). */
  health?: OngoingHealth;
  /** D427: the latest run or round: when, how it went, its one line. */
  last?: { at: string; state: OngoingRun["state"]; line?: string };
  /** D427: where its rounds run and which agent does them. */
  where?: { device?: string; deviceName?: string; harness?: string };
}

/** D498: a task in rounds as its On hand card carries it (Ongoing's own item, cut to what the row says). */
export interface TaskRounds {
  everyMs?: number;
  /** Its next round (absent while one runs, or paused). */
  nextAt?: string;
  last?: OngoingItem["last"];
  reviews?: import("./task-sources.ts").ReviewStanding;
  health?: OngoingHealth;
  paused?: boolean;
}

/**
 * D427: an ongoing thing that isn't keeping its time, with why and the one fix.
 *   late     its round was due and hasn't started (lateMin minutes); why says what holds it
 *   failing  its last rounds didn't work (fails in a row), why from the last one
 *   back     it had stopped by mistake and Ducter brought it back (shown a day, said once)
 * why: asleep (its computer is asleep or away), quota (its agent's allowance; resetsAt), signin,
 * stuck (a round has run far longer than its rhythm), failed, lost (its next round went missing).
 * fix: what the card's one button does: run_now (a round now), resume, move (D429: its computer is
 * asleep and moveTo, another computer awake, can take its rounds), or none (it fixes itself).
 * detail: for asleep, the computer's name (D429: named wherever it is known).
 */
export interface OngoingHealth {
  state: "late" | "failing" | "back";
  why?: "asleep" | "quota" | "signin" | "stuck" | "failed" | "lost";
  lateMin?: number;
  fails?: number;
  detail?: string;
  resetsAt?: string;
  since?: string;
  fix?: "run_now" | "resume" | "move";
  /** D429: an awake computer that can take its rounds while its own sleeps (换到醒着的电脑上跑). */
  moveTo?: { device: string; name: string };
}

/** What 暂停 / Pause, 恢复 / Resume, 现在跑一次 / Run now and 改时间 / Change when do. */
export type OngoingAction =
  | { action: "pause"; until?: string }
  | { action: "resume" }
  | { action: "run_now" }
  | { action: "retime"; trigger: Extract<RoutineTrigger, { kind: "time" }> }
  // D427: 多久跑一轮 / How often: a task in rounds goes every this many minutes from its next round.
  | { action: "every"; minutes: number }
  // D429: 换到醒着的电脑上跑 / Run it on an awake computer: a task in rounds moves there (task_switch's move) and runs a round now.
  | { action: "move"; device: string }
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
  // D391: a task's steps, for 从这一步重来 / Redo from here. Answered with past_steps_result.
  | { t: "past_steps"; id?: string; taskId: string }
  // D391: 从这一步重来 / Redo from here: a new task from that step. Answered with past_forked.
  | ({ t: "past_fork" } & PastForkInput)
  // D299: carry on a session the person ran outside Ducter: the same agent resumes it in a new
  // task (harness absent or the same), or another agent starts from what it said. Answered with
  // outside_adopted (and the new task's events like any task's).
  | { t: "outside_continue"; agent: OutsideAgent; id: string; harness?: string; model?: string }
  // D299: stop (or start again) showing one agent's own sessions; every window is told.
  | { t: "outside_hide"; agent: OutsideAgent; hidden: boolean }
  // 一直在跑的 / Ongoing: answered with ongoing_result; every window gets a fresh one after an action.
  | { t: "ongoing"; id?: string }
  // D511: one Keep's page (keep_result); its gestures (action_result, then a fresh keep_result and On hand).
  | { t: "keep"; id: string }
  | ({ t: "keep_action"; id: string } & import("./keeps.ts").KeepAction)
  // D533: an edit on a Keep's page (the one path the partner's keep_change takes too), and edited words to read into rules.
  | { t: "keep_change"; id: string; change: import("./keeps.ts").KeepChange; undo?: boolean }
  | { t: "keep_words"; id: string; said: string }
  // Answered with action_result (taskId: the id, action: the action's name), then ongoing_result.
  | ({ t: "ongoing_action"; kind: "routine" | "task"; id: string } & OngoingAction);

export type PastServerFrame =
  // range: the dates the time words in q meant, so the field can say them (上周二 → 11月10日).
  // D299: outside, the sessions the person ran in their own agents on the home (also on this
  // computer), best first, filtered and searched like the tasks; sources, each agent read.
  | { t: "past_result"; id?: string; items: PastItem[]; total: number; facets: PastFacets; suggestions: string[]; range?: { since: string; before: string; words: string }; outside?: OutsideItem[]; sources?: OutsideSource[] }
  // report: its last report in full (cut to 1600), for 停在哪儿 / Where it stopped; repo: it works in a repo (a redo says where its code starts).
  // elsewhere: a repo task on another computer, whose commits aren't read from here (a redo starts from where it began).
  | { t: "past_steps_result"; id?: string; taskId: string; steps: PastStep[]; report?: string; repo?: boolean; elsewhere?: boolean }
  // D391: the new task (taskId) redoing step `step` of `from`, or why it couldn't open.
  | { t: "past_forked"; from: string; step: number; ok: boolean; taskId?: string; message?: string }
  | { t: "outside_adopted"; agent: OutsideAgent; id: string; ok: boolean; taskId?: string; message?: string }
  | { t: "outside_hidden"; agent: OutsideAgent; hidden: boolean }
  | { t: "past_marked"; taskId: string; mark: PastMark | null }
  | { t: "ongoing_result"; id?: string; items: OngoingItem[] }
  // D511: a Keep's page; absent: no Keep by that id for this partner.
  | { t: "keep_result"; id: string; keep?: import("./keeps.ts").KeepPage }
  // D533: an edit's result (each field from and to, and the change that undoes it), and the rules read from edited words.
  | { t: "keep_changed"; id: string; ok: boolean; error?: string; edits?: import("./keeps.ts").KeepEdit[]; undo?: import("./keeps.ts").KeepChange; undone?: boolean }
  | { t: "keep_proposal"; id: string; proposal: import("./keeps.ts").KeepProposal };
