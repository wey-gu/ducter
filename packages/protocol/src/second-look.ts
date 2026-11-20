// D437: 另一个 AI 看过 / Another AI looked it over. Before a task's result reaches the person (a
// done report that changed code or files) or before an outward action's Go card is shown (a PR, a
// reply, a comment, a message), a second agent with a clean context reads it once against what the
// person asked. What it finds goes back to the task to fix first (once); what is still left is said
// on the card in one plain line. Nothing new for the person to learn, no extra step: a clean look
// shows nothing on any card.

/** What a look found, as Ducter keeps it on the report (set by Ducter, never by the task). */
export interface SecondLook {
  /** The agent that looked (a HarnessId), and its model when one was named. */
  by: string;
  model?: string;
  /** Each thing it found the first time, in the person's language, one short line each (at most 3). */
  found: string[];
  /** What is still so after the task's fix (or the task had no turn to fix it): said on the card. */
  left: string[];
}

/** The look's step on a task, logged as a runner task_event's `raw.secondLook`. */
export type SecondLookPhase = "looking" | "asked" | "checking" | "done";

/** At most this many findings are kept and said (the rest would be noise). */
export const LOOK_FINDINGS_MAX = 3;
/** One finding's length on the card, in characters. */
export const LOOK_FINDING_CHARS = 80;

/** D437: the rule kind (D165's notice rules) for 这类不用复查 / no second look for this kind. */
export const NO_LOOK_KIND = "second_look";

/**
 * Ducter's words to the task with what was found (D271's "told"): the transcript says it as a
 * hairline, never as the person's words. The Go port matches the same opening.
 */
export const LOOK_ASK_OPENING = "Before your result goes to the user, another AI";
