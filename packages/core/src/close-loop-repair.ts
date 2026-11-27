// D633: the first start of this version repairs what the old loop-end left behind, once. On hel
// (2026-11-27 06:45) ending a loop wrote task_state working/parked for two merged tasks, and a task
// whose own report said the release shipped kept a timer wait. The repair runs after the start's
// holdings pass: a card that says 在做 with no turn running, or is only waiting on a timer while its
// work is finished (its report said done, every PR merged/closed/let go), is settled from the facts:
// done, its loop ended by the condition, its timers cancelled. Anything else idle goes back to where
// it stood. A marker file makes it once. Every change is logged on the task's stream.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { detect, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { prsCarried } from "@ducter/protocol/src/pr-state.ts";
import { restAttention, workFinished } from "./attention.ts";
import { turnEndAttention } from "@ducter/protocol/src/turn-end.ts";
import type { CoreRegistry } from "./registry.ts";
import type { Loops } from "./loops.ts";
import type { Waiters } from "./waiters.ts";
import { kindOf } from "./waiters.ts";
import type { Holdings } from "./holdings.ts";

/** D633: the marker: the repair ran on this home, once. */
export const CLOSE_LOOP_REPAIRED = "close-loop-repaired.json";

const W = {
  zh: {
    done: "这件事已经做完了，之前一直显示在「在做」；现在按结果收尾了。",
    needs: "这件事没有在跑的一步了，之前一直显示在「在做」；接下来做什么，你看一下。",
    other: "之前一直显示在「在做」，其实已经没有在跑的一步了；现在按它原来的状态显示。",
    waited: "这件事的活已经做完了（报告里说了），却还在等；不用再等了，收尾了。",
  },
  en: {
    done: "This finished a while ago but kept showing as working; it is closed as done now.",
    needs: "Nothing is running on this any more, though it kept showing as working; decide what is next.",
    other: "This kept showing as working with nothing running; it shows where it really stood now.",
    waited: "This work is done (its report says so) but it kept waiting; the wait is over and it is closed.",
  },
} as const;

export interface CloseLoopRepair {
  /** Run once, after the start's holdings pass (tests and start). */
  run(): Promise<void>;
  stop(): void;
}

export function createCloseLoopRepair(o: {
  dataDir: string;
  log: LogStore;
  tasks: CoreRegistry;
  waiters: Waiters;
  loops?: Loops;
  holdings?: Pick<Holdings, "started">;
  onChange?: () => void;
}): CloseLoopRepair {
  const file = join(o.dataDir, CLOSE_LOOP_REPAIRED);
  let done = false;
  let stopped = false;

  const run = async () => {
    if (done || stopped) return;
    done = true;
    if (existsSync(file)) return;
    // The start's outside read first: a merged PR's news (and its holders) must be in before the
    // cards are read, so a finished task closes as done, not as "no report".
    await o.holdings?.started.catch(() => undefined);
    await Promise.resolve();
    if (stopped) return;
    const fixed: string[] = [];
    for (const c of o.tasks.list()) {
      if (c.attention === "done" || c.attention === "dropped" || c.attention === "superseded" || c.attention === "failed") continue;
      const armed = o.waiters.views().filter((w) => w.taskId === c.taskId && w.state === "armed");
      const timersOnly = armed.length > 0 && armed.every((w) => kindOf(w) === "timer");
      const idle = c.attention === "working" && c.residency !== "hot";
      const staleWait = c.attention === "blocked" && (timersOnly || armed.length === 0);
      const finished = workFinished(c) && prsCarried(c.prs).length === 0;
      let to: ReturnType<typeof restAttention> | undefined;
      let waitsFor: string | undefined;
      if ((idle || staleWait) && finished) to = "done";
      else if (idle) {
        // D645 (research/245 §3.7, B4): the same rule every live turn end uses.
        const end = turnEndAttention(c);
        if (end) (to = end.attention), (waitsFor = end.waitsFor);
        else to = restAttention(c, o.loops?.get(c.taskId)?.state === "ended" ? o.loops.get(c.taskId)!.before : undefined);
      }
      if (!to) continue;
      if (to === "done") {
        const loop = o.loops?.get(c.taskId);
        if (loop?.state === "on") o.loops!.end(c.taskId, "condition");
        for (const w of armed) o.waiters.cancel(w.waiterId, { by: "system" });
      }
      o.tasks.setState(c.taskId, to, "parked", undefined, undefined, waitsFor);
      fixed.push(c.taskId);
      const w = words(W, (detect(c.title)?.lang ?? "en") as LangTag);
      const text = to !== "done" ? (to === "needs_you" ? w.needs : w.other) : staleWait ? w.waited : w.done;
      o.log.append({ persona: c.persona, stream: `task:${c.taskId}`, origin: "system", kind: "task_event", body: { taskId: c.taskId, role: "system", from: "ducter", text } });
    }
    writeFileSync(file, JSON.stringify({ version: 1, at: new Date().toISOString(), fixed }, null, 2));
    if (fixed.length) o.onChange?.();
  };

  return {
    run,
    stop() {
      stopped = true;
    },
  };
}
