// D473: Ducter mends what it can by itself, before anyone has to ask why.
//
// A task that couldn't start (D395/D415 say why and offer the fixes as buttons) or that stopped
// without a report (the stall rule) is classed and climbs a ladder, cheapest first:
//   1. retry: the same start again, fresh, after a short wait (nothing went out yet: idempotent);
//   2. repair: the precondition fixed the way the card's buttons would (the computer that has the
//      code, a clone where it was to work, the lock git left);
//   3. rethink: handed to the partner with what was tried, so it can pick another repository,
//      computer or agent, or ask the person once with the one real fix (a second time: it asks).
// Budgets keep it from thrashing: at most two automatic tries per task a day, never the same one
// twice, at most six on the whole home an hour (then straight to the partner), two rethinks per
// task a day, and nothing at all while the person is working on that task themselves. Mid-run
// failures are never retried here: a task that ran may have done something outward, and nothing
// outward is ever sent twice (D61, D106); those go to the partner only.
//
// Every rung is a `mend` event on the task's stream, logged before it is tried (the write-ahead
// record), and one quiet line in the task's steps. A rethink wakes the partner (core.ts
// triggersPartner). When the partner opens the same work again after a rethink, the task that
// couldn't start is set aside as superseded, so On hand never keeps a failure that was mended.
import { SAME_CAUSE_WHYS, type Bodies, type CantStart, type LogEvent, type MendBody, type MendHow, type MendTry, type TaskCard } from "@ducter/protocol";
import type { LogStore, PlacesPort, Runner } from "@ducter/protocol/src/internal.ts";
import { allowedBy, type Bound } from "./bound.ts";
import { realClock, type Clock } from "./clock.ts";
import { taskStream } from "./registry.ts";

const DAY_MS = 24 * 3600_000;
const HOUR_MS = 3600_000;
/** Automatic tries (retry or repair) per task in a day. */
export const MEND_PER_TASK = 2;
/** Automatic tries on the whole home in an hour (the loop guard); past it, straight to the partner. */
export const MEND_PER_HOUR = 6;
/** Rethinks per task in a day: the second one asks the person; a third failure is left to the card. */
export const RETHINK_PER_TASK = 2;
/** The person touched this task this recently: Ducter stays out of their way. */
const PERSON_MS = 10 * 60_000;

/** The causes a retry or a place repair can mend. */
const PLACE_WHYS = new Set<string>(["no_repo", "no_folder", "away", "other"]);

export interface MendStep {
  how: MendHow;
  device?: string;
  name?: string;
  delayMs: number;
}

/**
 * The automatic rungs for a start failure, in order, before what was tried is taken out. A copy on
 * another computer is cheapest (nothing to download), then a clone where it was to work, then the
 * same start again. Nothing for an agent that can't start (its sign-in or program: the partner
 * picks another agent; signing in is the person's), a clone that failed, or a folder that isn't
 * there with no repository known (the partner knows which repository the work is on).
 */
export function startLadder(c: Pick<CantStart, "why" | "elsewhere" | "cloneHere" | "clearLock" | "device">, bound?: Bound): MendStep[] {
  const out: MendStep[] = [];
  if (c.why === "busy") return [c.clearLock ? { how: "clear_lock", delayMs: 0 } : { how: "reopen", delayMs: 30_000 }];
  // Only a place Ducter can fix: an agent that can't start (missing, signed out, too old: D472's
  // words), a clone that failed, or a why this code doesn't know goes to the partner.
  if (!PLACE_WHYS.has(c.why)) return out;
  // D477: Ducter never moves the work to another computer by itself (hel, 2026-11-22): getting the
  // code where the work was put is a preparation step it takes; a copy elsewhere is a fact the
  // partner's hand-over carries, weighed against the person's recorded word.
  if (c.cloneHere && c.why !== "away" && allowedBy(bound, c.device || "local")) out.push({ how: "clone_here", delayMs: 0 });
  // A computer that went away may be back in a minute; anything else, once more, fresh.
  if (c.why === "away") out.push({ how: "reopen", delayMs: 60_000 });
  if (c.why === "other") out.push({ how: "reopen", delayMs: 5_000 });
  return out;
}

/** What comes next for a start failure, given what this task and this home already tried. */
export function nextStartRung(c: Pick<CantStart, "why" | "elsewhere" | "cloneHere" | "clearLock" | "device">, tried: MendTry[], homeTriesLastHour: number, bound?: Bound): { step: MendStep } | { rethink: true; budget?: boolean } {
  if (tried.length >= MEND_PER_TASK) return { rethink: true };
  const step = startLadder(c, bound).find((s) => !tried.some((t) => t.how === s.how));
  if (!step) return { rethink: true };
  if (homeTriesLastHour >= MEND_PER_HOUR) return { rethink: true, budget: true };
  return { step };
}

export interface Mender {
  onEvent(e: LogEvent): void;
  /** Timers waiting (tests). */
  pending(): number;
  stop(): void;
}

export function createMender(o: {
  log: LogStore;
  tasks: { get(id: string): TaskCard | undefined; setState(id: string, a: TaskCard["attention"], r: TaskCard["residency"], reason?: string): unknown };
  places: () => PlacesPort | undefined;
  runner: () => Pick<Runner, "restartAt"> | undefined;
  clock?: Clock;
  /** An event another safety net already answers (D372's retry on the smartest). */
  taken?: (e: LogEvent) => boolean;
}): Mender {
  const clock = o.clock ?? realClock;
  const timers = new Set<unknown>();
  const decided = new Set<number>();
  let stopped = false;
  const iso = () => new Date(clock.now()).toISOString();
  const since = (ms: number) => new Date(clock.now() - ms).toISOString();

  const mends = (taskId: string, within: number) =>
    o.log
      .read({ stream: taskStream(taskId), kinds: ["mend"], limit: 200 })
      .filter((e) => e.ts >= since(within))
      .map((e) => e.body as MendBody)
      .filter((m) => m.cls !== "round"); // D481: a long round looked at is no repair
  /** The tries (retry or repair, as logged when going) on this task in the last day. */
  const triedOn = (taskId: string): MendTry[] =>
    mends(taskId, DAY_MS)
      .filter((m) => m.rung !== "rethink" && m.state === "going" && m.how)
      .map((m) => ({ how: m.how!, ...(m.name ? { on: m.name } : {}), ok: true, at: "" }));
  const homeTriesLastHour = () =>
    o.log
      .read({ kinds: ["mend"], beforeSeq: o.log.head() + 1, limit: 500 })
      .filter((e) => e.ts >= since(HOUR_MS) && (e.body as MendBody).rung !== "rethink" && (e.body as MendBody).state === "going").length;
  /** The person wrote to this task, or opened it again by hand, in the last minutes. */
  const personOn = (taskId: string) =>
    o.log
      .read({ stream: taskStream(taskId), kinds: ["task_event", "job_status"], limit: 50 })
      .some((e) => e.ts >= since(PERSON_MS) && ((e.kind === "task_event" && (e.body as Bodies["task_event"]).role === "user" && ((e.body as Bodies["task_event"]).from ?? "user") === "user") || (e.kind === "job_status" && e.origin === "user")));

  /** D549: this task and the ones it carries on (task_open's recorded `replaces`), newest first, at most 8. */
  const chainOf = (taskId: string): string[] => {
    const out: string[] = [];
    for (let id: string | undefined = taskId; id && !out.includes(id) && out.length < 8; ) {
      out.push(id);
      const open = o.log.read({ stream: taskStream(id), kinds: ["task_open"], fromSeq: 0, limit: 5 }).at(-1)?.body as Bodies["task_open"] | undefined;
      id = open?.replaces;
    }
    return out;
  };

  /** Opened more than a day ago (a restart failing an old task again): left to its card. */
  const stale = (taskId: string) => {
    const first = o.log.read({ stream: taskStream(taskId), kinds: ["task_open"], fromSeq: 0, limit: 1 })[0];
    return !!first && first.ts < since(DAY_MS);
  };

  const append = (taskId: string, body: Omit<MendBody, "taskId">, line?: { how: string; name?: string }) => {
    o.log.append({ stream: taskStream(taskId), origin: "system", kind: "mend", body: { taskId, ...body } });
    if (line) o.log.append({ stream: taskStream(taskId), origin: "system", kind: "task_event", body: { taskId, role: "system", from: "ducter", raw: { mend: { how: line.how, ...(line.name ? { name: line.name } : {}) } } } });
  };

  const rethink = (taskId: string, cls: MendBody["cls"], why: string | undefined, tried: MendTry[], extra: { budget?: boolean; same?: boolean } = {}) => {
    // D549: the rethinks of this work, across the tasks that replace one another (hel: four tasks).
    const before = chainOf(taskId).flatMap((id) => mends(id, DAY_MS)).filter((m) => m.rung === "rethink");
    if (before.length >= RETHINK_PER_TASK) return; // asked already: the card and the partner's line stand
    const attempt = mends(taskId, DAY_MS).length + 1;
    append(taskId, { cls, rung: "rethink", attempt, tried, ...(why ? { why } : {}), state: "ok", ...(before.length ? { again: true } : {}), ...(extra.budget ? { budget: true } : {}), ...(extra.same ? { same: true } : {}) }, { how: cls === "stall" ? "stall" : "rethink" });
  };

  const startFailed = (taskId: string, cant: CantStart) => {
    // D549: a cause that is a fact of that computer (its agent refuses root, isn't there, isn't
    // signed in): no retry of the same start, straight to the partner, which hears it won't change.
    if (SAME_CAUSE_WHYS.has(cant.why)) return rethink(taskId, "start", cant.why, triedOn(taskId), { same: true });
    const tried = triedOn(taskId);
    const next = nextStartRung(cant, tried, homeTriesLastHour(), o.places()?.boundOf?.(taskId));
    if ("rethink" in next) return rethink(taskId, "start", cant.why, tried, next.budget ? { budget: true } : {});
    const s = next.step;
    const attempt = mends(taskId, DAY_MS).length + 1;
    const rung = s.how === "reopen" ? "retry" : "repair";
    const where = s.how === "clone_here" ? cant.computer : s.name;
    append(taskId, { cls: "start", rung, how: s.how, ...(s.device ? { device: s.device } : {}), ...(where ? { name: where } : {}), attempt, tried, why: cant.why, state: "going" }, { how: s.how, ...(where ? { name: where } : {}) });
    const h = clock.setTimeout(() => {
      timers.delete(h);
      if (stopped) return;
      void run(taskId, s, cant, [...tried, { how: s.how, ...(where ? { on: where } : {}), ok: true, at: iso() }], attempt);
    }, s.delayMs);
    timers.add(h);
  };

  /** Try the step; when it can't even be tried, the next rung at once (the same way a failed start would). */
  const run = async (taskId: string, s: MendStep, cant: CantStart, tried: MendTry[], attempt: number) => {
    const card = o.tasks.get(taskId);
    // Someone else moved first (the person tapped a fix, the partner sent it words): nothing to do.
    if (!card || card.attention !== "failed" || !card.cant) return;
    const places = o.places();
    const runner = o.runner();
    let error: string | undefined;
    if (!places || !runner?.restartAt) error = "no places or runner";
    else {
      try {
        const p = await places.replan(taskId, { action: s.how, ...(s.device ? { device: s.device } : {}) }, "ducter");
        if (!p.ok) error = p.message;
        else {
          const r = await runner.restartAt(taskId, p.place, s.how === "clear_lock" ? { clearLock: true } : undefined);
          if (!r.ok) error = r.message ?? "it couldn't start";
        }
      } catch (err) {
        error = (err as Error).message;
      }
    }
    if (!error) return;
    append(taskId, { cls: "start", rung: s.how === "reopen" ? "retry" : "repair", how: s.how, attempt, tried, why: cant.why, state: "failed", error: error.slice(0, 300) });
    if (stopped) return;
    const again = o.tasks.get(taskId);
    if (again?.attention === "failed" && again.cant) startFailed(taskId, again.cant);
  };

  const decide = (e: LogEvent) => {
    if (stopped || decided.has(e.seq)) return;
    decided.add(e.seq);
    if (decided.size > 5000) decided.delete(decided.values().next().value!);
    if (o.taken?.(e)) return;
    if (e.kind === "task_state") {
      const s = e.body as Bodies["task_state"];
      if (s.attention !== "failed" || !s.cant || personOn(s.taskId) || stale(s.taskId)) return;
      return startFailed(s.taskId, s.cant);
    }
    if (e.kind === "task_event") {
      const b = e.body as Bodies["task_event"];
      if ((b.raw as { stall?: boolean } | undefined)?.stall !== true || personOn(b.taskId)) return;
      // D372 retries an errand on its fast tier; every other stall goes to the partner (never retried here: it ran).
      return rethink(b.taskId, "stall", "stall", []);
    }
  };

  return {
    onEvent: decide,
    pending: () => timers.size,
    stop() {
      stopped = true;
      for (const h of timers) clock.clearTimeout(h);
      timers.clear();
    },
  };
}

