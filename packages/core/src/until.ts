// `until` on a task (D28, D113): "keep fixing until CI is green". After each of the task's turns
// (its report), the condition is judged: by its compiled check when it has one (no model), else by
// the cheap judge over the report. Not yet: the next try is sent to the task. The loop stops on:
//   met; maxTries (default 20); no progress (3 tries in a row the same); going in circles (an
//   observation that came back after a different one); the task finishing on its own (failed,
//   dropped); or the user (until_action stop).
// A stop short of the condition puts the task on needs-you with the reason, and wakes the partner;
// met wakes the partner too (core suppresses the task's own done report while the loop runs, so
// the user hears the outcome once).
import type { Attention, Bodies, CheckSpec, LogEvent } from "@ducter/protocol";
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import { validateCheck } from "@ducter/protocol/src/checks.ts";
import type { CheckResult } from "@ducter/protocol/src/checks-run.ts";
import type { CoreRegistry } from "./registry.ts";
import type { Judge } from "./waiters.ts";

export const DEFAULT_MAX_TRIES = 20;
const NO_PROGRESS = 3;
const ENDED: Attention[] = ["failed", "dropped", "superseded"];

export interface Untils {
  start(input: { taskId: string; condition: string; check?: CheckSpec; maxTries?: number }): Bodies["until"];
  stop(taskId: string, why?: Bodies["until"]["stop"]): boolean;
  active(taskId: string): boolean;
  setJudge(j: Judge | undefined): void;
  stopAll(): void;
}

interface Loop {
  u: Bodies["until"];
  tries: Bodies["until_try"][];
  tokens: number;
  busy?: boolean;
}

const clip = (s: string, n = 200) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
const progressOf = (s: string) => {
  const m = /(\d+) of (\d+) match/.exec(s);
  return m ? Number(m[1]) / Math.max(1, Number(m[2])) : undefined;
};

export function nextTryText(n: number, condition: string, summary: string, zh: boolean): string {
  return zh
    ? `第 ${n} 次：「${condition}」还没做到（${summary}）。接着朝它做，这一次做完照常报告。`
    : `Try ${n}: "${condition}" isn't true yet (${summary}). Keep going toward it, and report when this try is done.`;
}

export function createUntils(opts: {
  log: LogStore;
  tasks: CoreRegistry;
  runner: () => Runner | undefined;
  check?: (spec: CheckSpec, w: { taskId?: string }) => Promise<CheckResult>;
  judge?: Judge;
}): Untils {
  const { log, tasks } = opts;
  let judge = opts.judge;
  const loops = new Map<string, Loop>();

  const snapshot = (l: Loop) => log.append({ stream: `task:${l.u.taskId}`, origin: "system", kind: "until", body: { ...l.u } });

  const end = (l: Loop, stop: NonNullable<Bodies["until"]["stop"]>, why: string) => {
    if (l.u.state !== "on") return;
    l.u.state = stop === "met" ? "met" : "stopped";
    l.u.stop = stop;
    loops.delete(l.u.taskId);
    snapshot(l);
    if (stop === "met") {
      // Its tries' done reports were held (decisions.ts holds); the loop's end is the result.
      const card = tasks.get(l.u.taskId);
      if (card && !ENDED.includes(card.attention) && card.attention !== "done") tasks.setState(l.u.taskId, "done", card.residency);
    } else if (stop !== "task_finished" && stop !== "user") {
      const card = tasks.get(l.u.taskId);
      if (card && !ENDED.includes(card.attention)) tasks.setState(l.u.taskId, "needs_you", card.residency, clip(why, 160));
    }
  };

  async function judgeTry(l: Loop, report: Bodies["report"]) {
    if (l.busy) return;
    l.busy = true;
    try {
      const n = l.tries.length + 1;
      const prev = l.tries.at(-1);
      let met = false;
      let summary = "";
      let by: "check" | "judge" = "judge";
      let verdict: Bodies["until_try"]["verdict"] = "unknown";
      let judged: { done?: number; left?: number } | undefined;
      if (l.u.check && opts.check) {
        by = "check";
        const r = await opts.check(l.u.check, { taskId: l.u.taskId });
        met = r.ok && r.met;
        summary = r.summary;
        const now = progressOf(summary), before = prev ? progressOf(prev.summary) : undefined;
        verdict = met ? "met" : prev?.summary === summary ? "same" : now !== undefined && before !== undefined ? (now > before ? "better" : now < before ? "worse" : "same") : prev ? "better" : "unknown";
      } else if (judge) {
        const data = [`state: ${report.state}`, report.summary, ...report.evidence.map((e) => `evidence ${e.kind}: ${e.label}`)].join("\n");
        try {
          const v = await judge({ condition: l.u.condition, question: `Does this try show that "${l.u.condition}" now holds?`, data, ...(prev ? { previous: prev.summary } : {}) });
          met = v.met;
          summary = v.reason || clip(report.summary, 120);
          if (v.left !== undefined) judged = { left: v.left, ...(v.done !== undefined ? { done: v.done } : {}) };
          verdict = met ? "met" : v.progress ?? (prev ? "same" : "unknown");
        } catch (err) {
          summary = `couldn't judge (${(err as Error).message})`;
        }
      } else {
        summary = "no way to judge it here";
      }
      if (!loops.has(l.u.taskId)) return; // stopped while it judged
      const t: Bodies["until_try"] = { taskId: l.u.taskId, n, verdict, summary: clip(summary, 160), by, ...(l.tokens ? { tokens: l.tokens } : {}) };
      // A countable goal (4 of 6 checks pass): the lights the user sees (D115).
      const counted = /(\d+) of (\d+) match/.exec(summary);
      if (counted) t.progress = { done: Number(counted[1]), total: Number(counted[2]) };
      else if (judged?.left !== undefined) {
        // A judged goal the report counts ("还剩 4 处"): the total is what the first counted try
        // saw (done + left), so the lights stay the same row from try to try.
        const first = l.tries.find((x) => x.progress)?.progress;
        const total = Math.max(first?.total ?? (judged.done ?? 0) + judged.left, judged.left);
        t.progress = { done: Math.max(0, total - judged.left), total, unit: "items" };
      } else if (met && l.tries.at(-1)?.progress) {
        const p = l.tries.at(-1)!.progress!;
        t.progress = { done: p.total, total: p.total, ...(p.unit ? { unit: p.unit } : {}) };
      }
      l.tries.push(t);
      l.tokens = 0;
      log.append({ stream: `task:${l.u.taskId}`, origin: "system", kind: "until_try", body: t });
      if (met) return end(l, "met", summary);
      if (n >= l.u.maxTries) return end(l, "max", `tried ${n} times; "${l.u.condition}" still isn't true`);
      const last = l.tries.slice(-NO_PROGRESS);
      if (last.length === NO_PROGRESS && last.every((x) => x.verdict === "same" || x.verdict === "unknown"))
        return end(l, "no_progress", `${NO_PROGRESS} tries without progress toward "${l.u.condition}"`);
      // Going in circles: what this try saw came back after a different observation.
      const seen = l.tries.slice(0, -1).map((x) => x.summary);
      if (n >= 3 && prev && prev.summary !== t.summary && seen.slice(0, -1).includes(t.summary))
        return end(l, "oscillation", `going back and forth: "${t.summary}" again`);
      const runner = opts.runner();
      if (!runner) return;
      const zh = /[一-鿿]/.test(l.u.condition);
      await runner.send(l.u.taskId, nextTryText(n + 1, l.u.condition, t.summary, zh), "queue", "partner").catch((err) => {
        console.warn(`[until] could not start try ${n + 1} of ${l.u.taskId}: ${(err as Error).message}`);
      });
    } finally {
      l.busy = false;
    }
  }

  const onEvent = (e: LogEvent) => {
    if (e.kind === "report") {
      const r = e.body as Bodies["report"];
      const l = loops.get(r.taskId);
      if (!l || r.state === "needs_input") return; // a question waits for the user, not a try
      void judgeTry(l, r);
    } else if (e.kind === "task_event") {
      const b = e.body as Bodies["task_event"];
      const l = loops.get(b.taskId);
      if (l && b.usage) l.tokens += (b.usage.inputTokens ?? 0) + (b.usage.outputTokens ?? 0);
    } else if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      const l = loops.get(b.taskId);
      if (l && ENDED.includes(b.attention)) end(l, "task_finished", b.attention);
    }
  };

  // Rebuild: loops still on keep going after a restart (the next report is judged).
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["until", "until_try"] })) {
    if (e.kind === "until") {
      const u = e.body as Bodies["until"];
      if (u.state === "on") loops.set(u.taskId, { u: { ...u }, tries: loops.get(u.taskId)?.tries ?? [], tokens: 0 });
      else loops.delete(u.taskId);
    } else {
      const t = e.body as Bodies["until_try"];
      loops.get(t.taskId)?.tries.push(t);
    }
  }
  const unsubscribe = log.subscribe(onEvent);

  return {
    start({ taskId, condition, check, maxTries }) {
      if (!tasks.get(taskId)) throw new Error(`unknown task ${taskId}`);
      const words = condition?.trim();
      if (!words) throw new Error("keep_going needs the condition, in the user's words");
      if (check) {
        const v = validateCheck(check);
        if (!v.ok) throw new Error(v.error);
      }
      const u: Bodies["until"] = { taskId, condition: clip(words, 160), maxTries: Math.min(100, Math.max(1, Math.round(maxTries ?? DEFAULT_MAX_TRIES))), state: "on" };
      if (check) u.check = check;
      const prev = loops.get(taskId);
      const l: Loop = { u, tries: prev?.tries ?? [], tokens: 0 };
      loops.set(taskId, l);
      snapshot(l);
      return { ...u };
    },
    stop(taskId, why = "user") {
      const l = loops.get(taskId);
      if (!l) return false;
      end(l, why, "stopped");
      return true;
    },
    active: (taskId) => loops.has(taskId),
    setJudge(j) {
      judge = j;
    },
    stopAll() {
      unsubscribe();
    },
  };
}
