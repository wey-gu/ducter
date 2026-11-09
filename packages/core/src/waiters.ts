// Waiters (D28, D112): a wait that wakes someone when its condition comes true.
//   timer  `at` is due (wait_until).
//   check  a small read-only command, run on a schedule where the task works; no model turn per
//          look (protocol/src/checks.ts). "PR #1592's CI passes": gh pr checks … --json state.
//   event  new items from a connection's trigger (OpenConnector Provider Triggers), with the
//          checkpoint kept here, never in a model.
//   judge  a check or event plus a yes/no question a cheap model answers over what was fetched,
//          only when what was fetched changed, and at most once per judgeMinMs.
// `waiter {state:"armed"}` arms it; core appends "fired" (met), "expired" (past `until`) or
// "cancelled". A look is logged (`waiter_look`, on the task's stream or `waiter:<id>`) only when
// what it saw changed. Errors back off
// by doubling up to 30 min. Everything is rebuilt from the Log on start, so armed waiters survive
// a restart; overdue timers fire at once, checks look again soon (staggered).
import type { Attention, Bodies, CheckSpec, EventSpec, LogEvent, WaiterView } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { DEFAULT_EVERY_MS, MAX_BACKOFF_MS, MIN_EVERY_MS, validateCheck } from "@ducter/protocol/src/checks.ts";
import type { CheckResult } from "@ducter/protocol/src/checks-run.ts";
import { realClock, type Clock } from "./clock.ts";
import type { TriggerRead } from "./connections.ts";

const FINISHED: Attention[] = ["done", "failed", "dropped", "superseded"];
const MAX_DELAY = 2 ** 31 - 1;
const JUDGE_MIN_MS = 10 * 60_000;
const JUDGE_DATA_MAX = 6000;

/** A cheap model's yes/no over fetched data (core/src/judge.ts). */
export type Judge = (q: { condition: string; question: string; data: string; previous?: string }) => Promise<{ met: boolean; reason: string; progress?: "better" | "same" | "worse"; done?: number; left?: number }>;

export interface ArmInput {
  reason: string;
  taskId?: string;
  decisionId?: string;
  routineId?: string;
  at?: string;
  check?: CheckSpec;
  event?: EventSpec;
  judge?: string;
  everyMs?: number;
  until?: string;
  held?: boolean;
}

export interface Waiters {
  /** Appends an armed waiter; core schedules it. Throws with a plain reason when it can't. */
  arm(input: ArmInput): Bodies["waiter"];
  /** Looks now (Look now), instead of at the next scheduled time. */
  look(waiterId: string): Promise<boolean>;
  cancel(waiterId: string): boolean;
  /** One look of a check or event, outside any waiter: the dry run on a proposal card. */
  dryRun(input: { check?: CheckSpec; event?: EventSpec; judge?: string; reason: string; taskId?: string }): Promise<{ met: boolean; summary: string }>;
  views(): WaiterView[];
  setJudge(j: Judge | undefined): void;
  stop(): void;
}

export interface WaiterDeps {
  log: LogStore;
  clock?: Clock;
  /** Runs a check where it belongs (the task's device and place); default: refuses. */
  check?: (spec: CheckSpec, w: { taskId?: string }) => Promise<CheckResult>;
  readEvent?: (spec: EventSpec, checkpoint: unknown) => Promise<TriggerRead>;
  judge?: Judge;
  minEveryMs?: number; // tests lower the 60 s floor
  judgeMinMs?: number;
  /** Delay before the first look after a restart, per waiter (staggered); default 2 s. */
  restartLookMs?: number;
}

const newId = () => "w_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const clip = (s: string, n = 200) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

interface Entry {
  w: Bodies["waiter"];
  timer?: unknown;
  deadline?: unknown;
  busy?: boolean;
  backoff: number;
  lastLookAt?: number;
  lastSummary?: string;
  lastKey?: string; // ok|met|summary of the last logged look
  looks: number;
  changes: number;
  nextLookAt?: number;
  lastMet: boolean;
  judgedHash?: string;
  judgedMet?: boolean;
  judgedReason?: string;
  lastJudgeAt?: number;
  checkpoint?: unknown;
  armedAt?: string; // when it was armed: the start of its deadline groove
}

export function kindOf(w: Pick<Bodies["waiter"], "kind" | "check" | "event" | "judge">): NonNullable<Bodies["waiter"]["kind"]> {
  if (w.kind) return w.kind;
  if (w.judge) return "judge";
  if (w.event) return "event";
  if (w.check) return "check";
  return "timer";
}

export function createWaiters(opts: WaiterDeps): Waiters {
  const { log } = opts;
  const clock = opts.clock ?? realClock;
  const minEvery = opts.minEveryMs ?? MIN_EVERY_MS;
  const judgeMin = opts.judgeMinMs ?? JUDGE_MIN_MS;
  let judge = opts.judge;
  const armed = new Map<string, Entry>();
  let stopped = false;

  const clear = (a: Entry) => {
    if (a.timer !== undefined) clock.clearTimeout(a.timer);
    if (a.deadline !== undefined) clock.clearTimeout(a.deadline);
    a.timer = a.deadline = undefined;
  };

  const close = (waiterId: string, state: "fired" | "cancelled" | "expired", observed?: string) => {
    const a = armed.get(waiterId);
    if (!a) return;
    armed.delete(waiterId);
    clear(a);
    const body: Bodies["waiter"] = { ...a.w, state };
    const seen = observed ?? a.lastSummary;
    if (seen && state !== "cancelled") body.observed = clip(seen);
    log.append({ stream: "channel", origin: "waiter", kind: "waiter", body });
  };

  /** A timer that may be longer than setTimeout allows: hops in <= 24.8-day steps. */
  const after = (a: Entry, dueMs: number, fn: () => void, slot: "timer" | "deadline") => {
    const hop = () => {
      const ms = dueMs - clock.now();
      if (ms > 0) return void (a[slot] = clock.setTimeout(hop, Math.min(ms, MAX_DELAY)));
      a[slot] = undefined;
      fn();
    };
    a[slot] = clock.setTimeout(hop, Math.max(0, Math.min(dueMs - clock.now(), MAX_DELAY)));
  };

  const every = (w: Bodies["waiter"]) => Math.max(minEvery, w.everyMs ?? DEFAULT_EVERY_MS);

  const scheduleLook = (a: Entry, ms: number) => {
    if (stopped || !armed.has(a.w.waiterId)) return;
    if (a.timer !== undefined) clock.clearTimeout(a.timer);
    a.nextLookAt = clock.now() + ms;
    after(a, a.nextLookAt, () => void lookOnce(a), "timer");
  };

  const record = (a: Entry, look: Omit<Bodies["waiter_look"], "waiterId" | "taskId">) => {
    const key = `${look.ok}|${look.met}|${look.summary}`;
    if (key === a.lastKey && look.checkpoint === undefined) return;
    a.lastKey = key;
    a.changes++;
    const body: Bodies["waiter_look"] = { waiterId: a.w.waiterId, ...look };
    if (a.w.taskId) body.taskId = a.w.taskId;
    log.append({ stream: a.w.taskId ? `task:${a.w.taskId}` : `waiter:${a.w.waiterId}`, origin: "waiter", kind: "waiter_look", body });
  };

  /** Fetch what the condition is about: a check's result, or new items from an event. */
  async function fetchOnce(w: Pick<Bodies["waiter"], "check" | "event" | "taskId">, checkpoint: unknown): Promise<{ ok: boolean; met: boolean; summary: string; data: string; checkpoint?: unknown; error?: string }> {
    if (w.check) {
      if (!opts.check) return { ok: false, met: false, summary: "checks can't run here", data: "", error: "no check runner" };
      const r = await opts.check(w.check, { taskId: w.taskId });
      return { ok: r.ok, met: r.met, summary: r.summary, data: r.output ?? r.summary, ...(r.error ? { error: r.error } : {}) };
    }
    if (w.event) {
      if (!opts.readEvent) return { ok: false, met: false, summary: "no connections to watch", data: "", error: "no event source" };
      const r = await opts.readEvent(w.event, checkpoint);
      if (!r.ok) return { ok: false, met: false, summary: r.error, data: "", error: r.error };
      const f = w.event.contains?.toLowerCase();
      const items = f ? r.items.filter((x) => x.text.toLowerCase().includes(f)) : r.items;
      const summary = items.length ? clip(`${items.length} new · ${items[0]!.text.split("\n")[0]}`) : "nothing new";
      return { ok: true, met: items.length > 0, summary, data: items.map((x) => `- ${x.text}`).join("\n"), checkpoint: r.checkpoint };
    }
    return { ok: false, met: false, summary: "nothing to look at", data: "", error: "no check or event" };
  }

  async function lookOnce(a: Entry): Promise<void> {
    if (a.busy || stopped) return;
    a.busy = true;
    const w = a.w;
    try {
      const got = await fetchOnce(w, a.checkpoint);
      if (!armed.has(w.waiterId)) return; // cancelled while it looked
      a.looks++;
      a.lastLookAt = clock.now();
      if (!got.ok) {
        a.lastSummary = got.summary;
        record(a, { ok: false, met: false, summary: clip(got.summary), ...(got.error ? { error: clip(got.error) } : {}) });
        a.backoff = Math.min(MAX_BACKOFF_MS, a.backoff ? a.backoff * 2 : every(w) * 2);
        return scheduleLook(a, a.backoff);
      }
      a.backoff = 0;
      let met = got.met;
      let summary = got.summary;
      let deferMs: number | undefined;
      if (w.judge && got.met) {
        // The code did the cheap part; the model does only the semantic part, and only on change.
        const h = hashOf(got.data);
        if (h === a.judgedHash) (met = Boolean(a.judgedMet)), (summary = a.judgedReason ? clip(`${summary} · ${a.judgedReason}`) : summary);
        else if (!judge) (met = false), (summary = clip(`${summary} · can't judge it yet`));
        else if (a.lastJudgeAt !== undefined && clock.now() - a.lastJudgeAt < judgeMin) (met = false), (deferMs = judgeMin - (clock.now() - a.lastJudgeAt));
        else {
          a.lastJudgeAt = clock.now();
          try {
            const v = await judge({ condition: w.reason, question: w.judge, data: got.data.slice(0, JUDGE_DATA_MAX) });
            a.judgedHash = h;
            a.judgedMet = v.met;
            a.judgedReason = clip(v.reason, 120);
            met = v.met;
            summary = clip(`${summary} · ${v.reason}`);
          } catch (err) {
            met = false;
            summary = clip(`${summary} · couldn't judge (${(err as Error).message})`);
          }
          if (!armed.has(w.waiterId)) return;
        }
      }
      a.lastSummary = summary;
      const advanced = got.checkpoint !== undefined && JSON.stringify(got.checkpoint) !== JSON.stringify(a.checkpoint);
      if (advanced) a.checkpoint = got.checkpoint;
      record(a, { ok: true, met, summary, ...(advanced ? { checkpoint: got.checkpoint } : {}) });
      // A routine's watch fires on the change to met, not on every look while it holds.
      const rising = w.routineId ? met && !a.lastMet : met;
      a.lastMet = met;
      if (rising) return close(w.waiterId, "fired", summary);
      scheduleLook(a, deferMs ?? every(w));
    } catch (err) {
      a.lastSummary = (err as Error).message;
      record(a, { ok: false, met: false, summary: clip((err as Error).message), error: clip((err as Error).message) });
      a.backoff = Math.min(MAX_BACKOFF_MS, a.backoff ? a.backoff * 2 : every(w) * 2);
      scheduleLook(a, a.backoff);
    } finally {
      a.busy = false;
    }
  }

  const schedule = (w: Bodies["waiter"], firstLookMs = 0, seen?: Partial<Entry>) => {
    const a: Entry = { w, backoff: 0, looks: 0, changes: 0, lastMet: Boolean(w.held), ...seen };
    armed.set(w.waiterId, a);
    if (w.until) {
      const due = Date.parse(w.until);
      if (!Number.isNaN(due)) after(a, due, () => close(w.waiterId, "expired"), "deadline");
    }
    const kind = kindOf(w);
    if (kind === "timer") {
      if (!w.at) return; // task-only waiter: closed when the task finishes
      const due = Date.parse(w.at);
      after(a, Number.isNaN(due) ? clock.now() : due, () => close(w.waiterId, "fired"), "timer");
      return;
    }
    scheduleLook(a, firstLookMs);
  };

  const onEvent = (e: LogEvent) => {
    if (e.kind === "waiter") {
      const w = e.body as Bodies["waiter"];
      if (w.state === "armed") {
        // Its first look is one period out: whoever armed it has just looked (wait_for's first
        // look, a routine's dry run or the run that just fired).
        if (!armed.has(w.waiterId)) schedule(w, every(w), { armedAt: e.ts });
      } else {
        const a = armed.get(w.waiterId);
        if (a) clear(a);
        armed.delete(w.waiterId);
      }
    } else if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      if (!FINISHED.includes(b.attention)) return;
      for (const { w } of [...armed.values()]) if (w.taskId === b.taskId) close(w.waiterId, "cancelled");
    } else if (e.kind === "decision_resolved") {
      // A wait that chased a question has nothing left to wait for once it is answered.
      const id = (e.body as Bodies["decision_resolved"]).decisionId;
      for (const { w } of [...armed.values()]) if (w.decisionId === id) close(w.waiterId, "cancelled");
    }
  };

  // Rebuild from the Log, then re-arm (side effects only for what is still armed).
  const open = new Map<string, Bodies["waiter"]>();
  const armedTs = new Map<string, string>();
  const lastLook = new Map<string, { at: number; summary: string; checkpoint?: unknown; key: string; changes: number }>();
  const finished = new Map<string, Attention>();
  const answered = new Set<string>();
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["waiter", "waiter_look", "task_state", "decision_resolved"] })) {
    if (e.kind === "decision_resolved") answered.add((e.body as Bodies["decision_resolved"]).decisionId);
    else if (e.kind === "waiter") {
      const w = e.body as Bodies["waiter"];
      if (w.state === "armed") open.set(w.waiterId, w), armedTs.set(w.waiterId, e.ts);
      else open.delete(w.waiterId), lastLook.delete(w.waiterId);
    } else if (e.kind === "waiter_look") {
      const l = e.body as Bodies["waiter_look"];
      const prev = lastLook.get(l.waiterId);
      lastLook.set(l.waiterId, {
        at: Date.parse(e.ts),
        summary: l.summary,
        checkpoint: l.checkpoint !== undefined ? l.checkpoint : prev?.checkpoint,
        key: `${l.ok}|${l.met}|${l.summary}`,
        changes: (prev?.changes ?? 0) + 1,
      });
    } else {
      const b = e.body as Bodies["task_state"];
      finished.set(b.taskId, b.attention);
    }
  }
  const unsubscribe = log.subscribe(onEvent);
  let stagger = 0;
  for (const w of open.values()) {
    const a = w.taskId ? finished.get(w.taskId) : undefined;
    const l = lastLook.get(w.waiterId);
    const seen: Partial<Entry> = l ? { lastLookAt: l.at, lastSummary: l.summary, checkpoint: l.checkpoint, lastKey: l.key, changes: l.changes } : {};
    schedule(w, (opts.restartLookMs ?? 2000) * ++stagger, { ...seen, armedAt: armedTs.get(w.waiterId) });
    if ((a && FINISHED.includes(a)) || (w.decisionId && answered.has(w.decisionId))) close(w.waiterId, "cancelled");
  }

  return {
    arm(input) {
      const reason = input.reason?.trim();
      if (!reason) throw new Error("a wait needs its reason, in the user's words");
      const body: Bodies["waiter"] = { waiterId: newId(), reason: clip(reason, 160), state: "armed" };
      if (input.check || input.event) {
        if (input.check) {
          const v = validateCheck(input.check);
          if (!v.ok) throw new Error(v.error);
          body.check = input.check;
        }
        if (input.event) {
          if (!input.event.connection || !input.event.service || !input.event.trigger) throw new Error("an event wait needs connection, service and trigger");
          body.event = input.event;
        }
        if (input.judge?.trim()) body.judge = clip(input.judge.trim(), 300);
        body.kind = kindOf(body);
        body.everyMs = Math.max(minEvery, input.everyMs ?? DEFAULT_EVERY_MS);
        if (input.at) throw new Error("give either a time (at) or a check/event, not both");
      } else {
        if (input.judge) throw new Error("a judged wait needs a check or an event to fetch what it judges");
        if (!input.at || Number.isNaN(Date.parse(input.at))) throw new Error(`wait_until needs a valid ISO time (at), got ${input.at ?? "nothing"}`);
        body.at = new Date(Date.parse(input.at)).toISOString();
      }
      if (input.until) {
        const u = Date.parse(input.until);
        if (Number.isNaN(u)) throw new Error(`could not read the deadline: ${input.until}`);
        if (u <= clock.now()) throw new Error("the deadline is already past");
        body.until = new Date(u).toISOString();
      }
      if (input.taskId) body.taskId = input.taskId;
      if (input.decisionId) body.decisionId = input.decisionId;
      if (input.routineId) body.routineId = input.routineId;
      if (input.held) body.held = true;
      log.append({ stream: "channel", origin: "waiter", kind: "waiter", body });
      return body;
    },
    async look(waiterId) {
      const a = armed.get(waiterId);
      if (!a || kindOf(a.w) === "timer") return false;
      if (a.timer !== undefined) clock.clearTimeout(a.timer), (a.timer = undefined);
      await lookOnce(a);
      return true;
    },
    cancel(waiterId) {
      if (!armed.has(waiterId)) return false;
      close(waiterId, "cancelled");
      return true;
    },
    async dryRun(input) {
      const got = await fetchOnce({ check: input.check, event: input.event, taskId: input.taskId }, null);
      if (!got.ok || !got.met || !input.judge || !judge) return { met: got.ok && got.met && !input.judge, summary: got.summary };
      try {
        const v = await judge({ condition: input.reason, question: input.judge, data: got.data.slice(0, JUDGE_DATA_MAX) });
        return { met: v.met, summary: clip(`${got.summary} · ${v.reason}`) };
      } catch {
        return { met: false, summary: got.summary };
      }
    },
    views() {
      return [...armed.values()].map((a) => {
        const v: WaiterView = { ...a.w };
        if (a.armedAt) v.armedAt = a.armedAt;
        if (a.lastLookAt !== undefined) v.lastLookAt = new Date(a.lastLookAt).toISOString();
        if (a.lastSummary) v.lastSummary = a.lastSummary;
        if (a.looks) v.looks = a.looks;
        if (a.changes) v.changes = a.changes;
        if (a.nextLookAt !== undefined && a.timer !== undefined) v.nextLookAt = new Date(a.nextLookAt).toISOString();
        return v;
      });
    },
    setJudge(j) {
      judge = j;
    },
    stop() {
      stopped = true;
      unsubscribe();
      for (const a of armed.values()) clear(a);
      armed.clear();
    },
  };
}
