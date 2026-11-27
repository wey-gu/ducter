// D633: one path for "the person asked to close or stop following this task". A finished task
// (its report said done, or its PRs merged/closed/let go) is done and lets go of any open PR it still
// carries (D602's 结束任务); a task still at work is put down. The loop's rounds end first, so no
// keeper brings them back, and the waiters are cancelled only after the card's attention is settled:
// the wait's end never invents a turn. Used by the client's task_action end, the Keep's 不用跟了 and
// the partner's keep_change stop, so every door means the same thing.
import { letGoPr } from "@ducter/protocol/src/owned.ts";
import { prsCarried } from "@ducter/protocol/src/pr-state.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { workFinished } from "./attention.ts";
import type { CoreRegistry } from "./registry.ts";
import type { Waiters } from "./waiters.ts";
import type { Loops } from "./loops.ts";

export interface EndTaskDeps {
  log: LogStore;
  tasks: CoreRegistry;
  waiters: Waiters;
  loops?: Loops;
  /** Put its agent down (the runner's drop); absent in a home without one. */
  drop?: (taskId: string) => Promise<void>;
}

export type EndTaskOutcome = "done" | "dropped" | "ended";

export async function endTaskByPerson(d: EndTaskDeps, taskId: string, reason = "you stopped following it"): Promise<EndTaskOutcome> {
  const c = d.tasks.get(taskId);
  if (!c || c.attention === "dropped" || c.attention === "superseded") return "ended";
  d.loops?.end(taskId, "user");
  let out: EndTaskOutcome = "ended";
  // A turn that really runs is still work (its follow-up may be in flight): ending it puts it down.
  // A stale working/parked card (nothing running) is read from its work: finished → done.
  const atWork = (c.attention === "working" || c.attention === "queued") && c.residency === "hot";
  if (!atWork && (c.attention === "done" || c.attention === "done_claimed" || workFinished(c))) {
    // D602: it is done as it is; every open PR it carries is let go, never closed on GitHub.
    const at = new Date().toISOString();
    for (const p of prsCarried(c.prs)) letGoPr(d.log, taskId, p.pr, "ended", at, c.persona);
    if (c.attention !== "done") d.tasks.setState(taskId, "done", c.residency);
    out = "done";
  } else if (c.attention !== "failed") {
    // D602: unfinished work the person stopped following is put down, never shown as a turn.
    try {
      await d.drop?.(taskId);
    } catch {
      /* the card is put down either way */
    }
    const now = d.tasks.get(taskId);
    if (now && now.attention !== "dropped" && now.attention !== "superseded") d.tasks.setState(taskId, "dropped", now.residency, reason);
    out = "dropped";
  }
  // After the attention is settled: a cancelled waiter never sets the card working.
  for (const w of d.waiters.views().filter((x) => x.taskId === taskId && x.state === "armed")) d.waiters.cancel(w.waiterId, { by: "user" });
  return out;
}
