// D473: Ducter mends what it can by itself. A failure is classed, climbs a ladder of repairs
// with budgets (retry once where nothing went out yet, repair the precondition, hand it to the
// partner to rethink), and only then reaches the person, once, with the one real fix. Each rung
// is one `mend` event on the task's stream (the write-ahead record of what Ducter is about to try,
// then its outcome), so the steps can say it quietly and `ducter repairs` can count it.

/** What failed, by where it happened (design/self-repair.md). */
export type MendClass =
  /** The task never started: its place, its computer, its agent (nothing went out yet). */
  | "start"
  /** It stopped without a report after one nudge (the stall rule). */
  | "stall";

/** D481: what the keeper knows of a long round of a task in rounds, for the partner to judge (never a verdict). */
export interface RoundFacts {
  /** When this round began (its wake). */
  since: string;
  /** Its rhythm, when it runs on one, and the reason its wait gives. */
  everyMs?: number;
  reason?: string;
  /** How long its earlier rounds took, in minutes, newest last (at most 6). */
  earlier?: number[];
  /** Its latest steps, oldest first (at most 8): when, and what (its state's reason, its words, a tool it used). */
  steps: { at: string; text: string }[];
  /** What it waits on now, in its own words (its armed waits). */
  waits?: string[];
  /** Its latest report this round. */
  report?: { at: string; state: string; summary: string };
}

/**
 * The ladder's rungs, cheapest first. retry: the same thing again, fresh, after a short wait.
 * repair: the precondition fixed by Ducter (a clone, the computer that has the code, a stale git
 * lock). rethink: handed to the partner with what was tried (it may pick another computer, agent
 * or repository, or ask the person once).
 */
export type MendRung = "retry" | "repair" | "rethink";

/** A repair Ducter can make by itself, the same as the buttons on a task that couldn't start (D395, D415). */
export type MendHow = "reopen" | "clone_here" | "start_at" | "clear_lock";

export interface MendTry {
  how: MendHow;
  /** The computer it was tried on, by name. */
  on?: string;
  ok: boolean;
  at: string;
}

export interface MendBody {
  taskId: string;
  /**
   * D481 "round": a round of a task in rounds has gone on past its look budget. Not a failure: the
   * partner looks at `round` (the facts) and judges; never shown as mending, never counted as a failure.
   */
  cls: MendClass | "round";
  rung: MendRung;
  /** D481: cls "round": the facts of the long round. */
  round?: RoundFacts;
  /** retry and repair: what Ducter does now. */
  how?: MendHow;
  /** start_at: the computer it moves to (id); its name for the words. */
  device?: string;
  name?: string;
  /** 1 for the first rung on this task, counting every rung. */
  attempt: number;
  /** What was tried before this rung, oldest first. */
  tried: MendTry[];
  /** The cause in a word (CantStart.why for a start). */
  why?: string;
  /** "going" (the write-ahead record), then "ok" or "failed" (a retry or repair that couldn't even be tried). */
  state: "going" | "ok" | "failed";
  /** failed: why it couldn't be tried, for the builder (never shown to the person). */
  error?: string;
  /** rethink: the second time this task came back to the partner (it asks the person now). */
  again?: boolean;
  /** rethink: no more automatic tries this hour on this home (the loop guard spoke, not the ladder). */
  budget?: boolean;
}

/** D473: one week of self-repair, counted from the Log (`ducter repairs`). */
export interface RepairWeek {
  /** Monday, YYYY-MM-DD (UTC). */
  week: string;
  /** Failures seen, by class: a start failure, a stall. */
  failures: Record<MendClass, number>;
  /** Tasks that failed and then started or worked again after Ducter's own retry or repair, with no word from the person. */
  healed: number;
  /** Handed to the partner to rethink. */
  rethought: number;
  /** Of those, the partner found another way (another task on the same work started, or it moved it) with no word from the person. */
  partnerFixed: number;
  /** Failures that reached the person: still failed at the week's end, or they wrote to it or tapped a fix. */
  reachedPerson: number;
  /** Retries and repairs by how, and how many of each led to a start. */
  byHow: Record<MendHow, { tried: number; worked: number }>;
  /** Times the loop guard held a try back (the hourly budget). */
  held: number;
}

export interface RepairReport {
  weeks: RepairWeek[];
  /** Start failures by cause (CantStart.why) over the whole span. */
  causes: Record<string, number>;
}
