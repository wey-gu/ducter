// Waiters (wait_until, timers only tonight): `waiter {state:"armed"}` on the channel arms a
// timer; when it is due core appends `waiter {state:"fired"}`, which wakes the partner
// (triggersPartner). A waiter tied to a task is cancelled when that task finishes first.
// State lives in the Log, so armed waiters survive a restart; overdue ones fire at once.
import type { Attention, Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";

const FINISHED: Attention[] = ["done", "failed", "dropped", "superseded"];
const MAX_DELAY = 2 ** 31 - 1;

export interface Waiters {
  /** Appends an armed waiter; core schedules it. */
  arm(input: { at?: string; taskId?: string; reason: string }): Bodies["waiter"];
  stop(): void;
}

const newId = () => "w_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);

export function createWaiters(opts: { log: LogStore; clock?: Clock }): Waiters {
  const { log } = opts;
  const clock = opts.clock ?? realClock;
  const armed = new Map<string, { w: Bodies["waiter"]; timer?: unknown }>();

  const close = (waiterId: string, state: "fired" | "cancelled") => {
    const a = armed.get(waiterId);
    if (!a) return;
    armed.delete(waiterId);
    if (a.timer !== undefined) clock.clearTimeout(a.timer);
    log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { ...a.w, state } });
  };

  const schedule = (w: Bodies["waiter"]) => {
    const entry: { w: Bodies["waiter"]; timer?: unknown } = { w };
    armed.set(w.waiterId, entry);
    if (!w.at) return; // task-only waiter: closed when the task finishes
    const due = Date.parse(w.at);
    const left = () => (Number.isNaN(due) ? 0 : due - clock.now());
    const fire = () => {
      const ms = left();
      // Long waits hop in ≤ 24.8-day steps (setTimeout's limit); early wakeups re-arm.
      if (ms > 0) return void (entry.timer = clock.setTimeout(fire, Math.min(ms, MAX_DELAY)));
      entry.timer = undefined;
      close(w.waiterId, "fired");
    };
    entry.timer = clock.setTimeout(fire, Math.max(0, Math.min(left(), MAX_DELAY)));
  };

  const onEvent = (e: LogEvent) => {
    if (e.kind === "waiter") {
      const w = e.body as Bodies["waiter"];
      if (w.state === "armed") {
        if (!armed.has(w.waiterId)) schedule(w);
      } else {
        const a = armed.get(w.waiterId);
        if (a?.timer !== undefined) clock.clearTimeout(a.timer);
        armed.delete(w.waiterId);
      }
    } else if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      if (!FINISHED.includes(b.attention)) return;
      for (const { w } of [...armed.values()]) if (w.taskId === b.taskId) close(w.waiterId, "cancelled");
    } else if (e.kind === "decision_resolved") {
      // A wait that chased a question has nothing left to wait for once it is answered
      // (review 2 #4: "等用户回答…" stayed on On hand after the answer).
      const id = (e.body as Bodies["decision_resolved"]).decisionId;
      for (const { w } of [...armed.values()]) if (w.decisionId === id) close(w.waiterId, "cancelled");
    }
  };

  // Rebuild from the Log, then re-arm (side effects only for what is still armed).
  const open = new Map<string, Bodies["waiter"]>();
  const finished = new Map<string, Attention>();
  const answered = new Set<string>();
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["waiter", "task_state", "decision_resolved"] })) {
    if (e.kind === "decision_resolved") answered.add((e.body as Bodies["decision_resolved"]).decisionId);
    else if (e.kind === "waiter") {
      const w = e.body as Bodies["waiter"];
      if (w.state === "armed") open.set(w.waiterId, w);
      else open.delete(w.waiterId);
    } else {
      const b = e.body as Bodies["task_state"];
      finished.set(b.taskId, b.attention);
    }
  }
  const unsubscribe = log.subscribe(onEvent);
  for (const w of open.values()) {
    const a = w.taskId ? finished.get(w.taskId) : undefined;
    schedule(w);
    if ((a && FINISHED.includes(a)) || (w.decisionId && answered.has(w.decisionId))) close(w.waiterId, "cancelled");
  }

  return {
    arm({ at, taskId, reason }) {
      if (!at || Number.isNaN(Date.parse(at))) throw new Error(`wait_until needs a valid ISO time (at), got ${at ?? "nothing"}`);
      const body: Bodies["waiter"] = { waiterId: newId(), reason, state: "armed" };
      body.at = new Date(Date.parse(at)).toISOString();
      if (taskId) body.taskId = taskId;
      log.append({ stream: "channel", origin: "waiter", kind: "waiter", body });
      return body;
    },
    stop() {
      unsubscribe();
      for (const a of armed.values()) if (a.timer !== undefined) clock.clearTimeout(a.timer);
      armed.clear();
    },
  };
}
