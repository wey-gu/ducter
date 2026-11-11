// TaskRegistry: the TaskCard projection, rebuilt from the Log and kept live by subscription.
import type { Attention, Bodies, LogEvent, OnHand, Residency, TaskCard } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";

export const PROJECTED_KINDS = ["task_open", "task_state", "body_selected", "report", "decision", "decision_resolved", "waiter", "waiter_look", "until", "until_try", "routine", "routine_run", "job_status"] as const;

/** D216: a step or the agent's words, the kind On hand's latest line is made from. */
export const isStepEvent = (b: Bodies["task_event"]) => b.role === "tool" || (b.role === "assistant" && (!!b.text?.trim() || !!b.thinking?.length));

const cut = (s: string | undefined, n: number) => (s && s.length > n ? s.slice(0, n) : s);

/** A task_event small enough to ride on every On hand card: long strings cut, media and usage left out. */
export function slimStep(e: LogEvent): LogEvent<"task_event"> {
  const b = e.body as Bodies["task_event"];
  const input = b.tool?.input;
  let slimIn: unknown = input;
  if (typeof input === "string") slimIn = cut(input, 400);
  else if (input && typeof input === "object" && !Array.isArray(input)) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (typeof v === "string") o[k] = cut(v, 400);
      else if (typeof v === "number" || typeof v === "boolean") o[k] = v;
    }
    slimIn = o;
  }
  const body: Bodies["task_event"] = { taskId: b.taskId, role: b.role };
  if (b.from) body.from = b.from;
  if (b.text) body.text = cut(b.text, 400);
  if (b.thinking?.length) body.thinking = b.thinking.slice(-2);
  if (b.tool) body.tool = { name: b.tool.name, ...(slimIn !== undefined ? { input: slimIn } : {}), ...(b.tool.output ? { output: cut(b.tool.output, 300) } : {}), ...(b.tool.ok !== undefined ? { ok: b.tool.ok } : {}) };
  return { seq: e.seq, ts: e.ts, persona: e.persona, stream: e.stream, origin: e.origin, kind: "task_event", body };
}

const ACTIVE: Attention[] = ["queued", "working", "needs_you", "blocked", "done_claimed"];
const ORDER: Attention[] = ["needs_you", "blocked", "working", "queued", "done_claimed", "done", "failed", "dropped", "superseded"];
const DAY_MS = 24 * 3600 * 1000;

export const taskStream = (taskId: string) => `task:${taskId}`;
export const isActive = (a: Attention) => ACTIVE.includes(a);

export interface CoreRegistry extends TaskRegistry {
  /** Unresolved decisions per task, oldest first. */
  pendingDecisions(taskId: string): string[];
  /** Armed waiters, oldest first. */
  waiters(): Bodies["waiter"][];
  /** Adds what only live parts of core know (waiter looks, routine views) to On hand. */
  setDecorator(fn: (o: OnHand) => OnHand): void;
}

export function createRegistry(log: LogStore, clock: Clock = realClock): CoreRegistry {
  const cards = new Map<string, TaskCard>();
  const pending = new Map<string, string[]>(); // taskId -> unresolved decisionIds
  const decisionTask = new Map<string, string>(); // decisionId -> taskId
  const decisionBody = new Map<string, Bodies["decision"] & { askedAt: string }>();
  const waiters = new Map<string, Bodies["waiter"]>(); // armed only
  const routineNames = new Map<string, string>();
  const runOf = new Map<string, { routineId: string; name: string }>(); // a routine's run task
  // D216: each task's latest step, kept live; a card not looked up since boot reads its stream once.
  const latest = new Map<string, LogEvent<"task_event">>();
  const lookedUp = new Set<string>();
  let decorate: (o: OnHand) => OnHand = (o) => o;

  const apply = (e: LogEvent) => {
    switch (e.kind) {
      case "task_event": {
        const b = e.body as Bodies["task_event"];
        if (b.taskId && isStepEvent(b)) latest.set(b.taskId, slimStep(e)), lookedUp.add(b.taskId);
        break;
      }
      case "job_status": {
        // D216: the user merged the branch or opened a draft PR from Ducter.
        const b = e.body as Bodies["job_status"];
        const c = b.taskId ? cards.get(b.taskId) : undefined;
        if (c && b.act && b.state === "done") c.integrated = { act: b.act, ...(b.ref ? { ref: b.ref } : {}), at: e.ts };
        break;
      }
      case "task_open": {
        const b = e.body as Bodies["task_open"];
        const prev = cards.get(b.taskId);
        cards.set(b.taskId, {
          taskId: b.taskId,
          persona: e.persona,
          title: b.title,
          project: b.project,
          place: b.place,
          harness: b.harness,
          model: b.model,
          ...(b.effort ? { effort: b.effort } : {}),
          bodyReason: b.bodyReason,
          ...(prev?.body ? { body: prev.body, harness: prev.body.harness, model: prev.body.model, effort: prev.body.effort } : {}),
          attention: prev?.attention ?? "queued",
          residency: prev?.residency ?? "provisioning",
          reason: prev?.reason,
          lastReport: prev?.lastReport,
          pendingDecisionId: prev?.pendingDecisionId,
          pendingDecision: prev?.pendingDecision,
          openedAt: prev?.openedAt ?? e.ts,
          updatedAt: e.ts,
          ...(prev?.until ? { until: prev.until } : {}),
          ...((prev?.fromRoutine ?? runOf.get(b.taskId)) ? { fromRoutine: prev?.fromRoutine ?? runOf.get(b.taskId) } : {}),
          // D128: the user opened it themselves (a retitle copies the body, so it stays).
          ...(b.origin === "you" || prev?.openedBy ? { openedBy: "you" as const } : {}),
        });
        break;
      }
      case "until": {
        const b = e.body as Bodies["until"];
        const c = cards.get(b.taskId);
        if (!c) return;
        c.until = { condition: b.condition, maxTries: b.maxTries, state: b.state, tries: c.until?.tries ?? [], ...(b.stop ? { stop: b.stop } : {}), ...(b.check ? { check: b.check } : {}), ...(c.until?.tokens ? { tokens: c.until.tokens } : {}) };
        c.updatedAt = e.ts;
        break;
      }
      case "until_try": {
        const b = e.body as Bodies["until_try"];
        const c = cards.get(b.taskId);
        if (!c?.until) return;
        c.until.tries.push({ n: b.n, verdict: b.verdict, summary: b.summary, by: b.by, at: e.ts, ...(b.progress ? { progress: b.progress } : {}) });
        if (b.tokens) c.until.tokens = (c.until.tokens ?? 0) + b.tokens;
        c.updatedAt = e.ts;
        break;
      }
      case "routine": {
        const b = e.body as Bodies["routine"];
        routineNames.set(b.routineId, b.name);
        break;
      }
      case "routine_run": {
        const b = e.body as Bodies["routine_run"];
        if (!b.taskId) return;
        const from = { routineId: b.routineId, name: routineNames.get(b.routineId) ?? "" };
        runOf.set(b.taskId, from);
        const c = cards.get(b.taskId);
        if (c) c.fromRoutine = from;
        break;
      }
      case "task_state": {
        const b = e.body as Bodies["task_state"];
        const c = cards.get(b.taskId);
        if (!c) return;
        c.attention = b.attention;
        c.residency = b.residency;
        c.reason = b.reason;
        c.updatedAt = e.ts;
        break;
      }
      case "body_selected": {
        // Who does it now and why (D89): the card says the latest one.
        const b = e.body as Bodies["body_selected"];
        const c = cards.get(b.taskId);
        if (!c) return;
        c.body = { harness: b.harness, ...(b.model ? { model: b.model } : {}), ...(b.effort ? { effort: b.effort } : {}), why: b.why };
        c.harness = b.harness;
        if (b.model) c.model = b.model;
        else delete c.model;
        // D202: the effort goes with who: a switch to another agent or model logs none.
        if (b.effort) c.effort = b.effort;
        else delete c.effort;
        c.updatedAt = e.ts;
        break;
      }
      case "report": {
        const b = e.body as Bodies["report"];
        const c = cards.get(b.taskId);
        if (!c) return;
        c.lastReport = b;
        c.updatedAt = e.ts;
        break;
      }
      case "decision": {
        const b = e.body as Bodies["decision"];
        if (!b.taskId) break; // partner-level decision: no card
        decisionTask.set(b.decisionId, b.taskId);
        decisionBody.set(b.decisionId, { ...b, askedAt: e.ts });
        pending.set(b.taskId, [...(pending.get(b.taskId) ?? []), b.decisionId]);
        const c = cards.get(b.taskId);
        if (c) (c.pendingDecisionId = b.decisionId), (c.pendingDecision = decisionBody.get(b.decisionId)), (c.updatedAt = e.ts);
        break;
      }
      case "decision_resolved": {
        const b = e.body as Bodies["decision_resolved"];
        const taskId = decisionTask.get(b.decisionId);
        if (!taskId) return;
        const left = (pending.get(taskId) ?? []).filter((d) => d !== b.decisionId);
        pending.set(taskId, left);
        decisionBody.delete(b.decisionId);
        const c = cards.get(taskId);
        if (c) {
          c.pendingDecisionId = left.at(-1);
          c.pendingDecision = c.pendingDecisionId ? decisionBody.get(c.pendingDecisionId) : undefined;
          if (!c.pendingDecision) delete c.pendingDecision;
          if (!c.pendingDecisionId) delete c.pendingDecisionId;
          c.updatedAt = e.ts;
        }
        break;
      }
      case "waiter": {
        const b = e.body as Bodies["waiter"];
        if (b.state === "armed") waiters.set(b.waiterId, b);
        else waiters.delete(b.waiterId);
        break;
      }
    }
  };

  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: [...PROJECTED_KINDS] })) apply(e);
  log.subscribe(apply);

  const copy = (c: TaskCard): TaskCard => structuredClone(c);
  const latestOf = (taskId: string): LogEvent<"task_event"> | undefined => {
    if (!lookedUp.has(taskId)) {
      lookedUp.add(taskId);
      const ev = log.read({ stream: taskStream(taskId), kinds: ["task_event"], limit: 12 }).findLast((e) => isStepEvent(e.body as Bodies["task_event"]));
      if (ev && !latest.has(taskId)) latest.set(taskId, slimStep(ev));
    }
    return latest.get(taskId);
  };

  return {
    get: (id) => {
      const c = cards.get(id);
      return c && copy(c);
    },
    list: () => [...cards.values()].map(copy),
    pendingDecisions: (id) => [...(pending.get(id) ?? [])],
    waiters: () => [...waiters.values()].map((w) => ({ ...w })),
    onHand(): OnHand {
      const now = clock.now();
      const today = new Date(now).toDateString();
      const counts = { needs_you: 0, working: 0, waiting: 0, done_today: 0 };
      const tasks: TaskCard[] = [];
      for (const c of cards.values()) {
        const age = now - Date.parse(c.updatedAt);
        if (c.attention === "needs_you") counts.needs_you++;
        else if (c.attention === "blocked") counts.waiting++;
        else if (c.attention === "working" || c.attention === "queued" || c.attention === "done_claimed") counts.working++;
        else if (c.attention === "done" && new Date(c.updatedAt).toDateString() === today) counts.done_today++;
        if (isActive(c.attention) || age < DAY_MS) {
          const card = copy(c);
          const l = latestOf(c.taskId);
          if (l) card.latest = structuredClone(l);
          tasks.push(card);
        }
      }
      tasks.sort(
        (a, b) => ORDER.indexOf(a.attention) - ORDER.indexOf(b.attention) || b.updatedAt.localeCompare(a.updatedAt),
      );
      return decorate({ tasks, counts, waiters: [...waiters.values()].map((w) => ({ ...w })) });
    },
    setDecorator(fn) {
      decorate = fn;
    },
    setState(taskId: string, attention: Attention, residency: Residency, reason?: string) {
      if (!cards.has(taskId)) throw new Error(`unknown task ${taskId}`);
      const body: Bodies["task_state"] = { taskId, attention, residency };
      if (reason) body.reason = reason;
      log.append({ stream: taskStream(taskId), origin: "system", kind: "task_state", body });
    },
  };
}
