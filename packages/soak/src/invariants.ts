// Invariants over the whole Log (read from ducter.db) plus what the soak driver did. Pure:
// every check takes events and returns findings, so each one is unit-tested on its own.
import type { Bodies, LogEvent, TaskCard } from "@ducter/protocol";

export interface Finding {
  check: string;
  detail: string;
}

export interface DriverRecord {
  /** clientId -> text, for every send the driver made (resends share the clientId). */
  sent: Map<string, string>;
  /** clientIds the driver saw echoed back as user_msg (before or after a restart). */
  echoed: Set<string>;
  /** Resolutions the driver saw echoed back (its own answers, and defaults). */
  decided: Map<string, { option: "go" | "hold" | "reply"; text?: string }>;
}

const of = <K extends keyof Bodies>(events: LogEvent[], kind: K) => events.filter((e) => e.kind === kind) as LogEvent<K>[];

/** 1. Seqs are 1..N with no gap and no repeat. */
export function checkSeqs(events: LogEvent[]): Finding[] {
  const out: Finding[] = [];
  events.forEach((e, i) => {
    if (e.seq !== i + 1) out.push({ check: "seq", detail: `position ${i} holds seq ${e.seq} (expected ${i + 1})` });
  });
  return out.slice(0, 5);
}

const soakTok = (text: string, cmd: string) => text.match(new RegExp(`^#soak ${cmd} (\\S+)`))?.[1];

/**
 * 2. No lost or doubled user message: one user_msg per clientId, every echoed send is in the
 * Log, and each soak command got exactly one effect (reply, task, timer, question).
 */
export function checkMessages(events: LogEvent[], d: DriverRecord): Finding[] {
  const out: Finding[] = [];
  const users = of(events, "user_msg");
  const byClient = new Map<string, number>();
  for (const u of users) if (u.body.clientId) byClient.set(u.body.clientId, (byClient.get(u.body.clientId) ?? 0) + 1);
  for (const [c, n] of byClient) if (n > 1) out.push({ check: "user_msg.dup", detail: `clientId ${c} is in the Log ${n} times` });
  for (const c of d.echoed) if (!byClient.has(c)) out.push({ check: "user_msg.lost", detail: `clientId ${c} was echoed to a client but is not in the Log` });

  const ai = [...of(events, "ai_msg"), ...of(events, "ack")].map((e) => e.body.text); // a line before task_open is its ack
  const titles = of(events, "task_open").map((e) => e.body.title);
  // A task the main refused (its device away) is answered too: the job failed, saying why.
  const refused = of(events, "job_status").filter((e) => e.body.state === "failed" && !e.body.taskId).map((e) => e.body.text);
  const waits = of(events, "waiter").filter((e) => e.body.state === "armed").map((e) => e.body.reason);
  const asks = of(events, "decision").filter((e) => !e.body.taskId).map((e) => e.body.question);
  const count = (xs: string[], pred: (x: string) => boolean) => xs.filter(pred).length;
  for (const u of users) {
    const t = u.body.text;
    let tok: string | undefined;
    let n = -1;
    let what = "";
    if ((tok = soakTok(t, "chat"))) (n = count(ai, (x) => x.split("\n").includes(`ok ${tok}`))), (what = "reply");
    else if ((tok = soakTok(t, "task"))) (n = count(titles, (x) => x === `soak ${tok}`) + count(refused, (x) => x.startsWith(`soak ${tok}: `))), (what = "task");
    else if ((tok = soakTok(t, "wait"))) (n = count(waits, (x) => x === `soak-wait ${tok}`)), (what = "timer");
    else if ((tok = soakTok(t, "ask"))) (n = count(asks, (x) => x === `soak ask ${tok}?`)), (what = "question");
    if (n === 0) out.push({ check: "user_msg.unanswered", detail: `#${u.seq} "${t.slice(0, 60)}" got no ${what}` });
    if (n > 1) out.push({ check: "user_msg.doubled", detail: `#${u.seq} "${t.slice(0, 60)}" got ${n} ${what}s` });
  }
  return out;
}

/** 3. Each decision resolves at most once, and a due reversible default has resolved. */
export function checkDecisions(events: LogEvent[], now: number, d?: DriverRecord): Finding[] {
  const out: Finding[] = [];
  const asked = new Map(of(events, "decision").map((e) => [e.body.decisionId, e] as const));
  const res = new Map<string, LogEvent<"decision_resolved">[]>();
  for (const r of of(events, "decision_resolved")) res.set(r.body.decisionId, [...(res.get(r.body.decisionId) ?? []), r]);
  for (const [id, rs] of res) {
    if (rs.length > 1) out.push({ check: "decision.twice", detail: `${id} resolved ${rs.length} times (${rs.map((r) => `${r.body.option}/${r.body.by}`).join(", ")})` });
    if (!asked.has(id)) out.push({ check: "decision.unknown", detail: `${id} resolved but never asked` });
    else if (rs[0]!.seq < asked.get(id)!.seq) out.push({ check: "decision.order", detail: `${id} resolved before it was asked` });
  }
  const dropped = finalAttention(events);
  for (const [id, e] of asked) {
    const b = e.body;
    if (res.has(id) || !b.reversible || !b.defaultAt) continue;
    if (b.taskId && dropped.get(b.taskId) === "dropped") continue;
    if (Date.parse(b.defaultAt) < now - 15_000) out.push({ check: "decision.default_missed", detail: `${id} default was due ${b.defaultAt} and never applied` });
  }
  // An answer the driver saw echoed is the one in the Log (durable once a client saw it).
  for (const [id, a] of d?.decided ?? []) {
    const r = res.get(id)?.[0];
    if (!r) out.push({ check: "decision.answer_lost", detail: `the driver saw ${id} answered (${a.option}) but the Log has no resolution` });
    else if (r.body.option !== a.option) out.push({ check: "decision.answer_changed", detail: `${id}: the driver saw ${a.option}, the Log says ${r.body.option}` });
  }
  return out;
}

const forwardOf = (d: Bodies["decision"], r: Bodies["decision_resolved"]) =>
  r.option === "go" ? `User says Go: ${d.goLabel}.` : r.option === "reply" ? (r.text ?? "") : "";

/**
 * 4. A Go or Reply answer reaches its task exactly once (unless the task was dropped first, or
 * the answer was itself a message to the task).
 */
export function checkForwards(events: LogEvent[]): Finding[] {
  const out: Finding[] = [];
  const asked = new Map(of(events, "decision").map((e) => [e.body.decisionId, e] as const));
  for (const r of of(events, "decision_resolved")) {
    const q = asked.get(r.body.decisionId);
    if (!q?.body.taskId) continue;
    const text = forwardOf(q.body, r.body);
    if (!text) continue;
    const taskId = q.body.taskId;
    const after = events.filter((e) => e.seq > r.seq && e.stream === `task:${taskId}`);
    const dropAt = after.find((e) => e.kind === "task_state" && (e.body as Bodies["task_state"]).attention === "dropped")?.seq ?? Infinity;
    const inputs = events.filter(
      (e) => e.kind === "task_event" && e.stream === `task:${taskId}` && (e.body as Bodies["task_event"]).role === "user" && (e.body as Bodies["task_event"]).text === text,
    );
    const delivered = inputs.filter((e) => e.seq > q.seq);
    if (delivered.length === 0 && dropAt === Infinity) out.push({ check: "forward.lost", detail: `${r.body.decisionId} (${r.body.option}) never reached task ${taskId}` });
    if (delivered.length > 1) out.push({ check: "forward.twice", detail: `${r.body.decisionId} reached task ${taskId} ${delivered.length} times` });
  }
  return out;
}

/** 5. Waiters: one terminal state each, never early, and none left armed past due. */
export function checkWaiters(events: LogEvent[], now: number): Finding[] {
  const out: Finding[] = [];
  const by = new Map<string, LogEvent<"waiter">[]>();
  for (const w of of(events, "waiter")) by.set(w.body.waiterId, [...(by.get(w.body.waiterId) ?? []), w]);
  for (const [id, ws] of by) {
    const armed = ws.filter((w) => w.body.state === "armed");
    const ends = ws.filter((w) => w.body.state !== "armed");
    if (armed.length !== 1) out.push({ check: "waiter.armed", detail: `${id} armed ${armed.length} times` });
    if (ends.length > 1) out.push({ check: "waiter.twice", detail: `${id} ended ${ends.length} times (${ends.map((w) => w.body.state).join(", ")})` });
    const at = armed[0]?.body.at ? Date.parse(armed[0].body.at) : undefined;
    const fired = ends.find((w) => w.body.state === "fired");
    if (fired && at && Date.parse(fired.ts) < at - 50) out.push({ check: "waiter.early", detail: `${id} fired at ${fired.ts}, before ${armed[0]!.body.at}` });
    if (!ends.length && at && at < now - 15_000) out.push({ check: "waiter.missed", detail: `${id} was due ${armed[0]!.body.at} and never fired` });
  }
  // A fired soak timer wakes the partner once: one "timer <tok>" line.
  const ai = [...of(events, "ai_msg"), ...of(events, "ack")].flatMap((e) => e.body.text.split("\n"));
  for (const w of of(events, "waiter").filter((w) => w.body.state === "fired")) {
    const tok = w.body.reason.match(/^soak-wait (\S+)/)?.[1];
    if (!tok) continue;
    const n = ai.filter((l) => l === `timer ${tok}`).length;
    if (n === 0) out.push({ check: "waiter.unheard", detail: `${w.body.waiterId} fired but the partner never answered it` });
    if (n > 1) out.push({ check: "waiter.heard_twice", detail: `${w.body.waiterId} woke the partner ${n} times` });
  }
  return out;
}

/** 6. Acks and job results are never doubled. */
export function checkJobs(events: LogEvent[]): Finding[] {
  const out: Finding[] = [];
  const acks = new Map<string, number>();
  for (const a of of(events, "ack")) acks.set(a.body.jobId, (acks.get(a.body.jobId) ?? 0) + 1);
  for (const [j, n] of acks) if (n > 1) out.push({ check: "ack.dup", detail: `${j} acked ${n} times` });
  const states = new Map<string, number>();
  for (const s of of(events, "job_status")) {
    if (s.origin !== "partner") continue;
    const k = `${s.body.jobId}/${s.body.state}`;
    states.set(k, (states.get(k) ?? 0) + 1);
  }
  for (const [k, n] of states) if (n > 1) out.push({ check: "job_status.dup", detail: `${k} appended ${n} times` });
  // One task per job.
  const tasksOfJob = new Map<string, Set<string>>();
  for (const s of of(events, "job_status")) if (s.origin === "partner" && s.body.taskId) tasksOfJob.set(s.body.jobId, (tasksOfJob.get(s.body.jobId) ?? new Set()).add(s.body.taskId));
  for (const [j, ts] of tasksOfJob) if (ts.size > 1) out.push({ check: "job.tasks", detail: `${j} is bound to ${ts.size} tasks` });
  return out;
}

/** Last attention per task from task_state. */
export function finalAttention(events: LogEvent[]): Map<string, Bodies["task_state"]["attention"]> {
  const m = new Map<string, Bodies["task_state"]["attention"]>();
  for (const s of of(events, "task_state")) m.set(s.body.taskId, s.body.attention);
  return m;
}

/**
 * 7. At rest every task tells the truth: nothing working or queued, needs_you only with an open
 * question, and an open question only on a task that needs you.
 */
export function checkResting(cards: TaskCard[], opts: { offlineDevices?: Set<string>; stalled?: Set<string> } = {}): Finding[] {
  const out: Finding[] = [];
  for (const c of cards) {
    const dev = (c.place as { device?: string }).device;
    const away = dev && opts.offlineDevices?.has(dev);
    if ((c.attention === "working" || c.attention === "queued") && !away)
      // Stalled (no report after the nudge): the design keeps it working and has C tell M; that
      // notice isn't built, so it is its own finding.
      out.push({ check: opts.stalled?.has(c.taskId) ? "rest.stalled_silent" : "rest.stuck", detail: `${c.taskId} "${c.title}" is ${c.attention}/${c.residency} at rest` });
    if (c.attention === "needs_you" && !c.pendingDecisionId) out.push({ check: "rest.needs_you_without_question", detail: `${c.taskId} "${c.title}"` });
    if (c.pendingDecisionId && !["needs_you", "dropped"].includes(c.attention))
      out.push({ check: "rest.question_on_wrong_state", detail: `${c.taskId} "${c.title}" has ${c.pendingDecisionId} open while ${c.attention}` });
    if (c.residency === "hot") out.push({ check: "rest.hot", detail: `${c.taskId} "${c.title}" is still hot at rest (${c.attention})` });
  }
  return out;
}

/** Tasks whose last word is the runner's stall note (no report after one nudge). */
export function stalledTasks(events: LogEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.kind !== "task_event") continue;
    const b = e.body as Bodies["task_event"];
    if ((b.raw as { stall?: boolean } | undefined)?.stall) out.add(b.taskId);
    else if (b.role === "user" && b.from !== "runner") out.delete(b.taskId);
  }
  return out;
}

/** 8. The living message agrees with the cards: no answered question, no state it doesn't have. */
export function checkLiving(events: LogEvent[], cards: TaskCard[]): Finding[] {
  const out: Finding[] = [];
  const living = of(events, "living_msg");
  const superseded = new Set(living.map((e) => e.supersedes).filter((s) => s != null));
  const last = [...living].reverse().find((e) => !superseded.has(e.seq));
  const reads = of(events, "read_receipt").map((e) => e.body.upToSeq);
  const readUpTo = Math.max(0, ...reads);
  if (!last || last.seq <= readUpTo) return out; // frozen: it was true when read
  const byId = new Map(cards.map((c) => [c.taskId, c]));
  const resolved = new Set(of(events, "decision_resolved").map((e) => e.body.decisionId));
  for (const i of last.body.items) {
    const c = byId.get(i.taskId);
    if (!c) {
      out.push({ check: "living.unknown_task", detail: `${i.taskId} in #${last.seq}` });
      continue;
    }
    if (i.kind === "decision" && i.decisionId && resolved.has(i.decisionId)) out.push({ check: "living.answered_question", detail: `#${last.seq} still asks ${i.decisionId} (${c.taskId})` });
    const want: Record<string, string[]> = { done: ["done", "done_claimed"], failed: ["failed"], blocked: ["blocked"], progress: ["working", "queued"], decision: ["needs_you"] };
    if (!want[i.kind]!.includes(c.attention)) out.push({ check: "living.state", detail: `#${last.seq} shows ${c.taskId} as ${i.kind}, card is ${c.attention}` });
  }
  // Every open question of a live task is in it, unless an earlier read already showed it.
  const shown = new Set(last.body.items.map((i) => i.decisionId).filter(Boolean));
  for (const c of cards) {
    if (!c.pendingDecisionId || c.attention === "dropped" || shown.has(c.pendingDecisionId)) continue;
    const askedAt = of(events, "decision").find((e) => e.body.decisionId === c.pendingDecisionId)?.seq ?? 0;
    if (askedAt > readUpTo) out.push({ check: "living.missing_question", detail: `${c.pendingDecisionId} (${c.taskId}) is open but not in #${last.seq}` });
  }
  return out;
}

/** 9. Each task has one done report per piece of input (a restart must not double the result). */
export function checkReports(events: LogEvent[]): Finding[] {
  const out: Finding[] = [];
  const streams = new Map<string, LogEvent[]>();
  for (const e of events) if (e.stream.startsWith("task:")) streams.set(e.stream, [...(streams.get(e.stream) ?? []), e]);
  for (const [s, evs] of streams) {
    let doneSinceInput = 0;
    for (const e of evs) {
      if (e.kind === "task_event") {
        const b = e.body as Bodies["task_event"];
        if (b.role === "user" && b.from !== "runner") doneSinceInput = 0;
      }
      if (e.kind === "report" && (e.body as Bodies["report"]).state === "done") {
        doneSinceInput++;
        if (doneSinceInput === 2) out.push({ check: "report.done_twice", detail: `${s} reported done again (#${e.seq}) with no new input` });
      }
    }
  }
  return out;
}

export function checkAll(events: LogEvent[], cards: TaskCard[], d: DriverRecord, now: number, opts: { offlineDevices?: Set<string> } = {}): Finding[] {
  return [
    ...checkSeqs(events),
    ...checkMessages(events, d),
    ...checkDecisions(events, now, d),
    ...checkForwards(events),
    ...checkWaiters(events, now),
    ...checkJobs(events),
    ...checkResting(cards, { ...opts, stalled: stalledTasks(events) }),
    ...checkLiving(events, cards),
    ...checkReports(events),
  ];
}
