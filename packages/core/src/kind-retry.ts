// D372 (the safety net): an errand Ducter's default put on a fast tier (body_selected why "kind")
// that fails or stalls carries on on the smartest, once, by itself: a body_selected "retry" the
// task shows, and Ducter's words to the task. Only a second miss reaches the person (the partner
// hears the smartest's failed report as usual). The failed report that started the retry doesn't
// wake the partner: `wakes` answers the same for every caller (decided once per event).
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import type { Loadout } from "./loadout.ts";
import { taskStream } from "./registry.ts";

export interface KindRetry {
  /** Watch the Log (a subscriber). */
  onEvent(e: LogEvent): void;
  /** False for the failed report that a retry answers (the partner isn't woken for it). */
  wakes(e: LogEvent): boolean;
  /** D473: this event is one it answers with a retry (core's mender leaves it alone). */
  took(e: LogEvent): boolean;
}

/** retell: wake the partner for an event after all (a retry that couldn't happen: nobody smarter here). */
export function createKindRetry(o: { log: LogStore; loadout: Pick<Loadout, "retry">; runner: () => Runner | undefined; retell?: (e: LogEvent) => void }): KindRetry {
  /** Tasks retried already (once each, ever). */
  const retried = new Set<string>();
  /** Each event decided once: the retry it started, or none. */
  const decided = new Map<number, boolean>();

  /** The task is on a fast tier by the default for its kind, and was never retried. */
  const eligible = (taskId: string): boolean => {
    if (retried.has(taskId)) return false;
    const sels = o.log.read({ stream: taskStream(taskId), kinds: ["body_selected"], limit: 1000 }).map((e) => (e.body as Bodies["body_selected"]).why);
    return sels.at(-1)?.kind === "kind" && !sels.some((w) => w.kind === "retry");
  };

  const decide = (e: LogEvent): boolean => {
    const known = decided.get(e.seq);
    if (known !== undefined) return known;
    let hit: { taskId: string; stalled?: boolean; summary?: string } | undefined;
    if (e.kind === "report") {
      const r = e.body as Bodies["report"];
      if (r.state === "failed" && eligible(r.taskId)) hit = { taskId: r.taskId, summary: r.summary };
    } else if (e.kind === "task_state") {
      const s = e.body as Bodies["task_state"];
      if (s.attention === "failed" && eligible(s.taskId)) hit = { taskId: s.taskId, ...(s.reason ? { summary: s.reason } : {}) };
    } else if (e.kind === "task_event") {
      const b = e.body as Bodies["task_event"];
      if ((b.raw as { stall?: boolean } | undefined)?.stall === true && eligible(b.taskId)) hit = { taskId: b.taskId, stalled: true };
    }
    decided.set(e.seq, !!hit);
    if (decided.size > 2000) decided.delete(decided.keys().next().value!);
    if (hit) {
      const h = hit;
      retried.add(h.taskId);
      // After this event's own subscribers (the state it reports lands first).
      setTimeout(() => {
        o.loadout
          .retry(h.taskId, { ...(h.stalled ? { stalled: true } : {}), ...(h.summary ? { summary: h.summary } : {}) }, o.runner())
          .then((r) => {
            if (r.ok) return;
            console.warn(`[kind-retry] ${h.taskId}: not retried (${r.message ?? "no reason"})`);
            // The failed report wasn't told: the partner hears it now, as it would have.
            if (e.kind === "report") o.retell?.(e);
          })
          .catch((err) => {
            console.warn(`[kind-retry] ${h.taskId}:`, (err as Error).message);
            if (e.kind === "report") o.retell?.(e);
          });
      }, 0);
    }
    return !!hit;
  };

  return {
    onEvent: (e) => void decide(e),
    wakes: (e) => !(e.kind === "report" && decide(e)),
    took: (e) => decide(e),
  };
}
