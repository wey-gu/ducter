// D425: what one message asked for, line by line. When the person asks for several separate things
// in one message ("check the booking, and put these three in my calendar"), the partner names each
// one in the person's own words (task_open's or task_send's `asks`); Ducter shows them as a few
// lines under that message, each with its own mark, changing in place. A line is not an object of
// its own: it is one row of the task that does it (the task's `asks`, its report's `asks`), and
// how many tasks run them is the partner's choice. Shown with no name: the words and a mark.
// See design/conversation.md §Several things in one message.

/** A line's state, as its mark: at work, done, waits for the person, didn't work out. */
export type AskState = "working" | "done" | "needs_you" | "failed";

/** One thing the person asked for in one message, and where it stands. */
export interface AskLine {
  /** The person's own words for it, short (cut to ASK_WORDS_MAX). */
  words: string;
  /** The task that does it (several lines may share one task). Empty while it is held in a group's line. */
  taskId: string;
  /** D360: held in a group's line, not opened yet: that member's key. */
  held?: string;
  state: AskState;
  /** One short line of what came of it, from the task's report (an answer, "PR 开好了"). */
  note?: string;
}

/** The lines under one message (latest per msgSeq wins; clients draw it under that message). */
export interface AsksBody {
  /** The person's message these lines are under. */
  msgSeq: number;
  lines: AskLine[];
}

/** A report's word on each of its task's lines, in the order the task was given them. */
export interface AskReport {
  state: "done" | "failed" | "needs_input" | "blocked" | "progress";
  note?: string;
}

export const ASK_WORDS_MAX = 60;
export const ASK_NOTE_MAX = 80;
/** At most this many lines under one message (more is a list to hand over, not a message). */
export const ASKS_MAX = 12;
/** The count under the lines shows from this many lines (fewer: the marks say it). */
export const ASKS_COUNT_FROM = 4;

export function cutWords(s: string, max = ASK_WORDS_MAX): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** A report's state as a line's. */
export function askStateOf(s: AskReport["state"]): AskState {
  switch (s) {
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "needs_input":
    case "blocked":
      return "needs_you";
    default:
      return "working";
  }
}

/** Settled: nothing more comes of it without the person (done or didn't work). */
export const askSettled = (s: AskState) => s === "done" || s === "failed";

/**
 * The count under the lines, or nothing: shown from ASKS_COUNT_FROM lines while something is
 * still open and something is done. done = lines done; left = lines at work or waiting for the
 * person. A line that didn't work counts in neither (its cross says it, and the partner said it
 * at once).
 */
export function asksCount(lines: AskLine[]): { done: number; left: number } | undefined {
  if (lines.length < ASKS_COUNT_FROM) return undefined;
  const done = lines.filter((l) => l.state === "done").length;
  const left = lines.filter((l) => !askSettled(l.state)).length;
  if (!left || !done) return undefined; // nothing done yet: the marks say it all
  return { done, left };
}
