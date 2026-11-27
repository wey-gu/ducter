// D633: what a task's attention is once nothing is running. A wait or a loop ending is not a
// turn: the card must say what is true (its work finished, or where it stood before the rounds),
// never 在做. These helpers are pure so the waiter path, the startup repair and the tests agree.
import type { Attention, TaskCard } from "@ducter/protocol";
import { prsCarried } from "@ducter/protocol/src/pr-state.ts";

/** Its work is finished: its report said done, or every PR it made is merged, closed or let go. */
export function workFinished(c: Pick<TaskCard, "lastReport" | "prs">): boolean {
  if (c.lastReport?.state === "done") return true;
  const prs = c.prs ?? [];
  if (!prs.length) return false;
  // D602: a let-go PR holds nothing open; merged and closed are done as they are.
  return prsCarried(prs).length === 0 && prs.some((p) => p.state !== "open" || !!p.letGo);
}

/** The attention its latest report implies, when no turn runs (progress is no work running: it asks). */
export function reportAttention(c: Pick<TaskCard, "lastReport">): Attention | undefined {
  switch (c.lastReport?.state) {
    case "done":
      return "done";
    case "needs_input":
      return "needs_you";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return undefined;
  }
}

/** Where it stood before a loop took it, mapped to a state that can be shown without a turn. */
export function priorAttention(before: Attention | undefined, c: Pick<TaskCard, "lastReport">): Attention {
  if (before === "done_claimed") return "done";
  if (before && before !== "working" && before !== "queued") return before;
  return reportAttention(c) ?? "needs_you";
}

/** D633: the attention a rest that ended without a turn leaves behind. */
export function restAttention(c: Pick<TaskCard, "lastReport" | "prs">, before?: Attention): Attention {
  return workFinished(c) ? "done" : priorAttention(before, c);
}
