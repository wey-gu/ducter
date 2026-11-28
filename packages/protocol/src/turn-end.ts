// D645 (research/245 §3.7, B4): what a task's attention is once its turn has ended and
// nothing is running. The runner calls this at every turn end (not once at start, as D633's repair
// did); core's start repair reads the same rule, so a card never says 在做 for a turn that is over.
//
// The rule is the brief's: when the last thing Ducter told it was to wait for the person, it is
// needs_you with `waitsFor` (the open question) until the person's answer reaches the task; else a
// turn that ended with nothing running is stopped. `Stopped` is the attention `blocked` with no
// waiter and no report: D467's 停下了, shown in 待你回答 once its quiet is old enough.
import type { Attention, TaskCard } from "./index.ts";

export interface TurnEndState {
  attention: Attention;
  /** The open question, when the person is the one it waits on. */
  waitsFor?: string;
}

/** The question the person owes it, if any: an open decision, or the question in its last report. */
export function questionFor(c: Pick<TaskCard, "pendingDecision" | "lastReport">): string | undefined {
  // D453: an offer is not a question; it never counts as needs-you.
  const asked = c.pendingDecision && !c.pendingDecision.offer ? c.pendingDecision.question?.trim() : "";
  if (asked) return asked;
  if (c.lastReport?.state !== "needs_input") return undefined;
  const q = c.lastReport.questions?.map((x) => x.text?.trim()).find(Boolean);
  return q || c.lastReport.summary?.trim() || undefined;
}

/**
 * What the card should say now that its turn is over. Undefined: nothing to change (the report
 * settled it: done, failed, blocked on something else, or it asked in its own words).
 */
export function turnEndAttention(c: Pick<TaskCard, "attention" | "pendingDecision" | "lastReport">): TurnEndState | undefined {
  const asked = questionFor(c);
  if (asked) return { attention: "needs_you", waitsFor: asked };
  // A turn that ended with nothing running is not work. Progress is not a rest: only a waiter, a
  // background job or a finished report keeps the card where it is.
  if (c.attention === "working" || c.attention === "queued") return { attention: "blocked" };
  return undefined;
}
