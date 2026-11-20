// D437: 另一个 AI 看过 / Another AI looked it over. Before a task's result reaches the person (a
// done report that changed code or files) or before an outward action's Go card is shown (a PR, a
// reply, a comment, a message), a second agent with a clean context reads it once against what the
// person asked. What it finds goes back to the task to fix first (once); what is still left is said
// on the card in one plain line. Nothing new for the person to learn, no extra step: a clean look
// shows nothing on any card.

/** What a look found, as Ducter keeps it on the report (set by Ducter, never by the task). */
export interface FreshLook {
  /** The agent that looked (a HarnessId), and its model when one was named. */
  by: string;
  model?: string;
  /** Each thing it found the first time, in the person's language, one short line each (at most 3). */
  found: string[];
  /** What is still so after the task's fix (or the task had no turn to fix it): said on the card. */
  left: string[];
}

/** The look's step on a task, logged as a runner task_event's `raw.freshLook`. */
export type FreshLookPhase = "looking" | "asked" | "checking" | "done";

/** At most this many findings are kept and said (the rest would be noise). */
export const LOOK_FINDINGS_MAX = 3;
/** One finding's length on the card, in characters. */
export const LOOK_FINDING_CHARS = 80;

/** D437: the rule kind (D165's notice rules) for 这类不用复查 / no look for this kind of work. */
export const NO_LOOK_KIND = "fresh_look";
/** D443: D437 shipped as "second_look" (and the Log's `raw.secondLook`), the same words as D373's
 *  second look at a task to continue; renamed, and the old names are still read. */
export const NO_LOOK_KIND_OLD = "second_look";
export const isNoLookKind = (kind: string | undefined): boolean => kind === NO_LOOK_KIND || kind === NO_LOOK_KIND_OLD;
/** A task_event's look step, under its key since D443 (`freshLook`) or the one before (`secondLook`). */
export function lookStepOf<T = { phase?: FreshLookPhase; hash?: string }>(raw: unknown): T | undefined {
  const r = raw as { freshLook?: T; secondLook?: T } | undefined;
  return r?.freshLook ?? r?.secondLook;
}

/**
 * Ducter's words to the task with what was found (D271's "told"): the transcript says it as a
 * hairline, never as the person's words. The Go port matches the same opening.
 */
export const LOOK_ASK_OPENING = "Before your result goes to the user, another AI";
