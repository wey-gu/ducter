// Reports -> attention + decisions (D10). Reversible defaults auto-resolve; resolutions are
// forwarded to the task through the onDecision hook (main.ts wires it to runner.send).
import type { Attention, Bodies, LogEvent, Question } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import type { CoreRegistry } from "./registry.ts";

export type DecisionHook = (taskId: string, text: string, resolved: Bodies["decision_resolved"]) => void | Promise<void>;

export interface Decisions {
  decide(decisionId: string, option: "go" | "hold" | "reply", text?: string): LogEvent<"decision_resolved">;
  get(decisionId: string): Bodies["decision"] | undefined;
  isPending(decisionId: string): boolean;
  setHook(fn: DecisionHook): void;
  stop(): void;
}

export const DEFAULT_DELAY_MS = 30 * 60 * 1000;

export function forwardText(d: Bodies["decision"], r: Bodies["decision_resolved"]): string {
  if (r.option === "go") return `User says Go: ${d.goLabel}.`;
  if (r.option === "hold") return "User says Hold: pause and wait.";
  return r.text ?? "";
}

const newId = () => "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);

export function createDecisions(opts: {
  log: LogStore;
  tasks: CoreRegistry;
  clock?: Clock;
  defaultDelayMs?: number;
  onDecision?: DecisionHook;
}): Decisions {
  const { log, tasks } = opts;
  const clock = opts.clock ?? realClock;
  const delay = opts.defaultDelayMs ?? DEFAULT_DELAY_MS;
  let hook: DecisionHook | undefined = opts.onDecision;
  const all = new Map<string, Bodies["decision"]>();
  const resolved = new Set<string>();
  const timers = new Map<string, unknown>();

  const setAttention = (taskId: string, attention: Attention, reason?: string) => {
    const c = tasks.get(taskId);
    if (!c || (c.attention === attention && c.reason === reason)) return;
    tasks.setState(taskId, attention, c.residency, reason);
  };

  const schedule = (d: Bodies["decision"]) => {
    if (!d.reversible || !d.defaultAt) return;
    const ms = Date.parse(d.defaultAt) - clock.now();
    const fire = () => {
      timers.delete(d.decisionId);
      if (resolved.has(d.decisionId)) return;
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
    const blocking = r.questions.filter((q) => q.blocking);
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
        };
        if (q.reversible && hasDefault) body.defaultAt = new Date(clock.now() + delay).toISOString();
        log.append({ stream: "channel", origin: "system", kind: "decision", body });
      }
      setAttention(r.taskId, "needs_you");
      return;
    }
    switch (r.state) {
      case "blocked":
        return setAttention(r.taskId, "blocked", r.summary.slice(0, 120));
      case "failed":
        return setAttention(r.taskId, "failed", r.summary.slice(0, 120));
      case "progress":
        return setAttention(r.taskId, "working");
      case "done": {
        // C checks evidence mechanically: no refs means it stays "Done · checking".
        setAttention(r.taskId, "done_claimed");
        const c = tasks.get(r.taskId);
        if (c && r.evidence.length) tasks.setState(r.taskId, "done", c.residency);
        return;
      }
    }
  };

  const onResolved = (r: Bodies["decision_resolved"]) => {
    resolved.add(r.decisionId);
    const t = timers.get(r.decisionId);
    if (t !== undefined) clock.clearTimeout(t), timers.delete(r.decisionId);
    const d = all.get(r.decisionId);
    if (!d) return;
    if (!tasks.pendingDecisions(d.taskId).length) {
      if (r.option === "hold") setAttention(d.taskId, "blocked", "Hold");
      else setAttention(d.taskId, "working");
    }
    const text = forwardText(d, r);
    if (hook && text) {
      Promise.resolve()
        .then(() => hook!(d.taskId, text, r))
        .catch((err) => console.error(`[decisions] forwarding ${r.decisionId} to ${d.taskId} failed:`, err));
    }
  };

  // Rebuild from the Log (no side effects for history), then re-arm pending defaults.
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["decision", "decision_resolved"] })) {
    if (e.kind === "decision") all.set((e.body as Bodies["decision"]).decisionId, e.body as Bodies["decision"]);
    else resolved.add((e.body as Bodies["decision_resolved"]).decisionId);
  }
  for (const d of all.values()) if (!resolved.has(d.decisionId)) schedule(d);

  const unsubscribe = log.subscribe((e) => {
    if (e.kind === "report") onReport(e.body as Bodies["report"]);
    else if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      all.set(d.decisionId, d);
      schedule(d);
    } else if (e.kind === "decision_resolved") onResolved(e.body as Bodies["decision_resolved"]);
  });

  return {
    decide(decisionId, option, text) {
      if (!all.has(decisionId)) throw new Error(`unknown decision ${decisionId}`);
      if (resolved.has(decisionId)) throw new Error(`decision ${decisionId} is already resolved`);
      if (option === "reply" && !text?.trim()) throw new Error("reply needs text");
      const body: Bodies["decision_resolved"] = { decisionId, option, by: "user" };
      if (text) body.text = text;
      return log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body });
    },
    get: (id) => all.get(id),
    isPending: (id) => all.has(id) && !resolved.has(id),
    setHook: (fn) => void (hook = fn),
    stop() {
      unsubscribe();
      for (const t of timers.values()) clock.clearTimeout(t);
      timers.clear();
    },
  };
}
