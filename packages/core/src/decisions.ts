// Reports -> attention + decisions (D10). Reversible defaults auto-resolve; resolutions are
// forwarded to the task through the onDecision hook (main.ts wires it to runner.send).
import type { Attention, Bodies, EvidenceRef, LogEvent, Question } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import type { CoreRegistry } from "./registry.ts";
import { keyReadyText, keyRefusedText } from "./saved/key-words.ts";

export type DecisionHook = (taskId: string, text: string, resolved: Bodies["decision_resolved"]) => void | Promise<void>;

export interface Decisions {
  /** extra.delivered (D233): the task already has the answer; it is not forwarded. */
  decide(decisionId: string, option: "go" | "hold" | "reply", text?: string, extra?: { delivered?: boolean }): LogEvent<"decision_resolved">;
  get(decisionId: string): Bodies["decision"] | undefined;
  isPending(decisionId: string): boolean;
  setHook(fn: DecisionHook): void;
  /**
   * The user (or the partner) answered the task directly with a message: resolve its open
   * decisions as "reply" without forwarding (the message itself is the answer). Without this a
   * later Go re-woke a task that had already finished (working -> done flap).
   */
  answeredByMessage(taskId: string, text: string, by: "user" | "partner"): void;
  /**
   * Answers resolved before a restart that never reached their task (the process died between
   * decision_resolved and the forward). Returned once; core hands them over when the runner is wired.
   */
  takeUnforwarded(): { taskId: string; text: string; decisionId: string }[];
  stop(): void;
}

export const DEFAULT_DELAY_MS = 30 * 60 * 1000;

export function forwardText(d: Bodies["decision"], r: Bodies["decision_resolved"]): string {
  // D151: the user signed in themselves in the live view; the task checks the page again.
  // D157: where it runs is the runner's to change (it re-places the task); the task hears nothing.
  if (d.where) return "";
  // D233: the task got the answer in the call it was waiting in; nothing to send again.
  if (r.delivered) return "";
  // D233: a key given (it is in the task's key file now) or refused; both resume the task.
  if (d.key) return r.option === "go" ? keyReadyText(d.key, true) : r.option === "hold" ? keyRefusedText(d.key) : "";
  if (r.option === "go" && d.signIn)
    return `The user says they're signed in to ${d.signIn.site} in Ducter's browser (they did it themselves; you saw nothing of it). browser_read the page to check, then carry on.`;
  // D191: a payment Go, or the OK for a saved thing's first use on a site.
  if (r.option === "go" && d.pay)
    return `The user said Go: pay ${d.pay.currency} ${d.pay.amount} at ${d.pay.site} with ${d.pay.card}. Within 15 minutes, fill the card with browser_fill (use "${d.pay.handle}": number, exp, cvc, name as the form asks), place the order once, then report what the site confirmed (its order number).`;
  // D228: Go on creating the tunnel in the person's Cloudflare account (the setup task asked it).
  if (r.option === "go" && d.anywhere) return `The user said Go: create the tunnel in their Cloudflare account and point ${d.anywhere.hostname} at this computer. Run the create step again now with --hostname ${d.anywhere.hostname}, then the run step.`;
  if (r.option === "go" && d.fill) return `The user said OK to use ${d.fill.label} on ${d.fill.site}. Call browser_fill again now.`;
  if (r.option === "go") return `User says Go: ${d.goLabel}.`;
  // Hold is not forwarded: the task already ended its turn waiting, and a "pause" turn would
  // only flip it back to working and earn a nudge. The card shows Waiting (Hold).
  if (r.option === "hold") return "";
  return r.text ?? "";
}

const newId = () => "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);

/** done? -> done by the mechanical check alone: a ref Ducter verified, and none it found missing. */
export function evidenceHolds(evidence: EvidenceRef[]): boolean {
  return evidence.some((e) => e.check === "verified") && !evidence.some((e) => e.check === "missing");
}

/** The partner may confirm a done claim in its result: nothing Ducter checked came back missing. */
export function evidenceConfirmable(evidence: EvidenceRef[]): boolean {
  return !evidence.some((e) => e.check === "missing");
}

export function createDecisions(opts: {
  log: LogStore;
  tasks: CoreRegistry;
  clock?: Clock;
  defaultDelayMs?: number;
  /** The user's setting (D71), read when a decision is asked; defaultDelayMs (env, tests) wins. */
  delayMs?: () => number;
  onDecision?: DecisionHook;
  /** A task whose done reports don't finish it (a keep-going loop that is still on, D113). */
  holds?: (taskId: string) => boolean;
}): Decisions {
  const { log, tasks } = opts;
  const clock = opts.clock ?? realClock;
  const delay = () => opts.defaultDelayMs ?? opts.delayMs?.() ?? DEFAULT_DELAY_MS;
  let hook: DecisionHook | undefined = opts.onDecision;
  const all = new Map<string, Bodies["decision"]>();
  const resolved = new Set<string>();
  const silent = new Set<string>(); // resolutions that must not be forwarded
  const timers = new Map<string, unknown>();

  const setAttention = (taskId: string, attention: Attention, reason?: string) => {
    const c = tasks.get(taskId);
    if (!c || (c.attention === attention && (reason === undefined || c.reason === reason))) return;
    tasks.setState(taskId, attention, c.residency, reason);
  };
  // Report reactions run after the current dispatch, so they reconcile with whatever the
  // report_to_main handler (runner) set right after appending, instead of racing it.
  const later = (fn: () => void) =>
    queueMicrotask(() => {
      try {
        fn();
      } catch (err) {
        console.error("[decisions] report reaction failed:", err);
      }
    });

  // A dropped task's open question stays open (Undo brings it back as it was), but nothing acts
  // on it meanwhile: soak, answering it flipped the dropped task to "working" and the restart
  // after that ran it again.
  const dropped = (taskId: string | undefined) => !!taskId && tasks.get(taskId)?.attention === "dropped";

  const schedule = (d: Bodies["decision"]) => {
    if (!d.reversible || !d.defaultAt) return;
    const ms = Date.parse(d.defaultAt) - clock.now();
    const fire = () => {
      timers.delete(d.decisionId);
      if (resolved.has(d.decisionId)) return;
      if (dropped(d.taskId)) return; // no default for a dropped task; it waits for Undo

      log.append({
        stream: "channel",
        origin: "system",
        kind: "decision_resolved",
        body: { decisionId: d.decisionId, option: d.defaultOption, by: "default" },
      });
    };
    timers.set(d.decisionId, clock.setTimeout(fire, Math.max(0, ms)));
  };

  const onReport = (r: Bodies["report"]) => {
    let blocking = r.questions.filter((q) => q.blocking && q.text.trim());
    if (r.state === "needs_input" && !blocking.length) blocking = r.questions.filter((q) => q.text.trim());
    if (r.state === "needs_input" || blocking.length) {
      const qs: Question[] = blocking.length ? blocking : [{ id: "q", text: r.summary, blocking: true, reversible: false }];
      for (const q of qs) {
        const hasDefault = !!q.default?.trim();
        const body: Bodies["decision"] = {
          decisionId: newId(),
          taskId: r.taskId,
          question: q.text,
          goLabel: hasDefault ? q.default!.trim() : "Continue",
          defaultOption: hasDefault ? "go" : "hold",
          reversible: q.reversible,
          ...(q.signIn ? { signIn: q.signIn } : {}),
          ...(q.pay ? { pay: q.pay, goLabel: "Pay", defaultOption: "hold" as const } : {}),
          ...(q.fill ? { fill: q.fill } : {}),
          // D233: a key: no default ever; Go carries the value, Hold is 不给 / Don't give.
          ...(q.key ? { key: q.key, goLabel: "Save and continue", defaultOption: "hold" as const } : {}),
          // D217: a commit on Ducter's phone has no default (Go taps it once); the user's turn on it is Done.
          ...(q.phone ? { phone: q.phone, ...(q.phone.kind === "go" ? { goLabel: "Go", defaultOption: "hold" as const } : { goLabel: "Done", defaultOption: "hold" as const }) } : {}),
          ...(q.where ? { where: q.where } : {}),
        };
        if (q.reversible && hasDefault) body.defaultAt = new Date(clock.now() + delay()).toISOString();
        log.append({ stream: "channel", origin: "system", kind: "decision", body });
      }
      later(() => setAttention(r.taskId, "needs_you"));
      return;
    }
    later(() => {
      switch (r.state) {
        case "blocked":
          return setAttention(r.taskId, "blocked", r.summary.slice(0, 120));
        case "failed":
          return setAttention(r.taskId, "failed", r.summary.slice(0, 120));
        case "progress":
          return setAttention(r.taskId, "working");
        case "done":
          // A try of a keep-going loop (D113): the loop decides when it is done, not the try.
          if (opts.holds?.(r.taskId)) return setAttention(r.taskId, "working");
          // C checks evidence mechanically (the runner set each ref's `check` before the report
          // was logged): a ref verified and none missing -> done. Otherwise it stays "Done ·
          // checking" until the partner confirms it in its result (evidenceConfirmable).
          return setAttention(r.taskId, evidenceHolds(r.evidence) ? "done" : "done_claimed");
      }
    });
  };

  const onResolved = (r: Bodies["decision_resolved"]) => {
    resolved.add(r.decisionId);
    const t = timers.get(r.decisionId);
    if (t !== undefined) clock.clearTimeout(t), timers.delete(r.decisionId);
    const d = all.get(r.decisionId);
    if (!d) return;
    // A partner-level decision (the partner's own ask, no task): resolving it only wakes the
    // partner (decision_resolved is a trigger); nothing to forward, no card to move.
    if (!d.taskId) return;
    const taskId = d.taskId;
    if (dropped(taskId)) return; // resolved (e.g. by a direct message) while dropped: no turn, no flip
    if (!tasks.pendingDecisions(taskId).length) {
      // D233: 不给 / Don't give on a key is an answer the task carries on with, not a wait.
      if (r.option === "hold" && !d.key) setAttention(taskId, "blocked"); // no reason text: the card shows Waiting
      else setAttention(taskId, "working");
    }
    const text = silent.delete(r.decisionId) ? "" : forwardText(d, r);
    if (hook && text) {
      Promise.resolve()
        .then(() => hook!(taskId, text, r))
        .catch((err) => console.error(`[decisions] forwarding ${r.decisionId} to ${taskId} failed:`, err));
    }
  };

  // Rebuild from the Log (no side effects for history), then re-arm pending defaults.
  const askedAt = new Map<string, number>(); // decisionId -> seq of the decision event
  const lastAnswer = new Map<string, LogEvent<"decision_resolved">>(); // taskId -> its latest resolution
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["decision", "decision_resolved"] })) {
    if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      all.set(d.decisionId, d);
      askedAt.set(d.decisionId, e.seq);
    } else {
      const r = e.body as Bodies["decision_resolved"];
      resolved.add(r.decisionId);
      const taskId = all.get(r.decisionId)?.taskId;
      if (taskId) lastAnswer.set(taskId, e as LogEvent<"decision_resolved">);
    }
  }
  for (const d of all.values()) if (!resolved.has(d.decisionId)) schedule(d);

  // Answers the process died before handing to their task: the latest resolution of a task
  // whose forward text never shows up as task input after the question was asked. The runner
  // logs every input before delivering it, and a task answered by message (silent) has that
  // message as input, so both count as handed over.
  const unforwarded: { taskId: string; text: string; decisionId: string }[] = [];
  for (const [taskId, e] of lastAnswer) {
    const d = all.get(e.body.decisionId)!;
    const text = forwardText(d, e.body);
    if (!text || tasks.get(taskId)?.attention === "dropped") continue;
    // It asked something newer since: it got past this one.
    if ([...all.values()].some((x) => x.taskId === taskId && (askedAt.get(x.decisionId) ?? 0) > e.seq)) continue;
    const after = askedAt.get(d.decisionId) ?? 0;
    const inputs = log.read({ stream: `task:${taskId}`, fromSeq: after + 1, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_event"] });
    const handed = inputs.some((x) => {
      const b = x.body as Bodies["task_event"];
      return b.role === "user" && (b.text === text || (e.body.option === "reply" && b.text === e.body.text));
    });
    if (!handed) unforwarded.push({ taskId, text, decisionId: d.decisionId });
  }

  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "report") onReport(e.body as Bodies["report"]);
    else if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      all.set(d.decisionId, d);
      schedule(d);
    } else if (e.kind === "decision_resolved") onResolved(e.body as Bodies["decision_resolved"]);
    else if (e.kind === "task_event") {
      // The partner answering a task with task_send (the runner logs it first, from "partner").
      // Decision forwards are logged from "user"; the user's own task_send goes through ws.
      const b = e.body as Bodies["task_event"];
      if (b.role === "user" && b.from === "partner" && b.text) api.answeredByMessage(b.taskId, b.text, "partner");
    }
  });

  const api: Decisions = {
    answeredByMessage(taskId, text, by) {
      for (const id of tasks.pendingDecisions(taskId)) {
        if (resolved.has(id) || !all.has(id)) continue;
        // D233: a key is never answered by a message (a key never goes through the conversation):
        // its card stays until the person gives it or says no.
        if (all.get(id)!.key) continue;
        silent.add(id);
        log.append({
          stream: "channel",
          origin: by,
          kind: "decision_resolved",
          body: { decisionId: id, option: "reply", text: text.slice(0, 2000), by: "user" },
        });
      }
    },
    decide(decisionId, option, text, extra) {
      if (!all.has(decisionId)) throw new Error(`unknown decision ${decisionId}`);
      if (resolved.has(decisionId)) throw new Error(`decision ${decisionId} is already resolved`);
      if (option === "reply" && !text?.trim()) throw new Error("reply needs text");
      if (dropped(all.get(decisionId)!.taskId)) throw new Error("That task was dropped. Undo the drop first, then answer.");
      const body: Bodies["decision_resolved"] = { decisionId, option, by: "user" };
      if (text) body.text = text;
      if (extra?.delivered) body.delivered = true;
      return log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body });
    },
    takeUnforwarded: () => unforwarded.splice(0),
    get: (id) => all.get(id),
    isPending: (id) => all.has(id) && !resolved.has(id),
    setHook: (fn) => void (hook = fn),
    stop() {
      unsubscribe();
      for (const t of timers.values()) clock.clearTimeout(t);
      timers.clear();
    },
  };
  return api;
}
