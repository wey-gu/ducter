// D285: 一直在跑的 / Ongoing: what keeps going on its own, as cards beside 做过的事 / Past tasks.
// Two kinds: a routine (D114: on a schedule or a condition, each firing a run) and a task resting
// on its own wait (D267/D279: it looks again every so often). One set of gestures for both:
//   暂停 / Pause (no new runs or looks; until a time, or until resumed), 恢复 / Resume,
//   现在跑一次 / Run now (a routine's run, or a task's look now), 改时间 / Change when (a time
//   routine), 不再跑 / End.
// Routines keep their own pause (routines.ts). A task's pause is Ducter's here: its armed waits
// end (by the user) and are kept in <dataDir>/paused.json, and come back as they were on resume.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Bodies, OngoingAction, OngoingItem, OngoingRun } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { Clock } from "./clock.ts";
import { realClock } from "./clock.ts";
import type { Marks } from "./past.ts";
import type { CoreRegistry } from "./registry.ts";
import type { Routines } from "./routines.ts";
import type { Waiters } from "./waiters.ts";

const RUNS = 12;
const ACTIVE = new Set(["queued", "working", "done_claimed"]);

interface Paused {
  waiters: Bodies["waiter"][];
  until?: string;
  at: string;
}

export interface Ongoing {
  list(persona: string): OngoingItem[];
  act(kind: "routine" | "task", id: string, a: OngoingAction): Promise<{ ok: boolean; message?: string }>;
  /** Resumes what was paused until a time that has come (the timer runs it too). */
  sweep(): void;
  stop(): void;
}

export function createOngoing(o: { dataDir: string; log: LogStore; tasks: CoreRegistry; waiters: Waiters; routines: Routines; marks?: Marks; clock?: Clock; onChange?: () => void; reviews?: (taskId: string) => import("@ducter/protocol").ReviewStanding | undefined; asking?: (taskId: string) => boolean; app?: (taskId: string) => { id: string; name: string } | undefined }): Ongoing {
  const clock = o.clock ?? realClock;
  const file = join(o.dataDir, "paused.json");
  let paused: Record<string, Paused> = {};
  // A routine paused until a time: the routine keeps the pause, this keeps the time.
  let routineUntil: Record<string, string> = {};
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { tasks?: Record<string, Paused>; routines?: Record<string, string> };
      paused = j.tasks ?? {};
      routineUntil = j.routines ?? {};
    }
  } catch {
    paused = {};
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, tasks: paused, routines: routineUntil }, null, 2));
    renameSync(`${file}.tmp`, file);
  };

  const iso = (ms: number) => new Date(ms).toISOString();
  const firstLine = (s?: string) => (s ?? "").split("\n").find((l) => l.trim())?.trim().slice(0, 140);

  function routineRuns(routineId: string): OngoingRun[] {
    const byRun = new Map<string, OngoingRun>();
    for (const e of o.log.read({ stream: `routine:${routineId}`, kinds: ["routine_run"], limit: 400 })) {
      const b = e.body as Bodies["routine_run"];
      const card = b.taskId ? o.tasks.get(b.taskId) : undefined;
      const state: OngoingRun["state"] = b.state === "started" ? (card && card.attention !== "queued" && card.attention !== "working" ? (card.attention === "failed" ? "failed" : "done") : "running") : b.state;
      const line = b.state === "skipped" ? b.reason : firstLine(card?.lastReport?.summary) ?? b.reason;
      byRun.set(b.runId, { at: byRun.get(b.runId)?.at ?? e.ts, state, ...(b.taskId ? { taskId: b.taskId } : {}), ...(line ? { line } : {}) });
    }
    return [...byRun.values()].slice(-RUNS);
  }

  function taskRuns(taskId: string): OngoingRun[] {
    const out: OngoingRun[] = [];
    for (const e of o.log.read({ stream: `task:${taskId}`, kinds: ["waiter_look", "report"], limit: 400 })) {
      if (e.kind === "waiter_look") {
        const b = e.body as Bodies["waiter_look"];
        out.push({ at: e.ts, state: !b.ok ? "failed" : b.met ? "met" : "looked", ...(b.summary ? { line: firstLine(b.summary) } : {}) });
      } else {
        const b = e.body as Bodies["report"];
        out.push({ at: e.ts, state: b.state === "failed" ? "failed" : "done", ...(b.summary ? { line: firstLine(b.summary) } : {}) });
      }
    }
    return out.slice(-RUNS);
  }

  const markOf = (persona: string, id: string) => o.marks?.get(persona, id);

  function list(persona: string): OngoingItem[] {
    const items: OngoingItem[] = [];
    for (const r of o.routines.views()) {
      if (r.state === "ended" || r.state === "dismissed") continue;
      const running = r.running && o.tasks.get(r.running) && ACTIVE.has(o.tasks.get(r.running)!.attention);
      const state: OngoingItem["state"] = r.state === "proposed" ? "proposed" : r.state === "paused" ? "paused" : running ? "running" : "resting";
      const mark = markOf(persona, r.routineId);
      items.push({
        kind: "routine",
        id: r.routineId,
        title: mark?.name ?? r.name,
        ...(r.project ? { project: r.project } : {}),
        state,
        trigger: r.trigger,
        cadence: r.triggerWords,
        ...(r.trigger.kind !== "time" && r.trigger.kind ? { reason: (r.trigger as { condition?: string }).condition } : {}),
        ...(state === "resting" && r.nextAt ? { nextAt: r.nextAt } : {}),
        ...(r.state === "paused" ? { pausedBy: r.pausedBy ?? "user", ...(r.pauseReason && r.pauseReason !== "asked" ? { pauseWhy: r.pauseReason } : {}), ...(routineUntil[r.routineId] ? { pausedUntil: routineUntil[r.routineId] } : {}) } : {}),
        runs: routineRuns(r.routineId),
        ...(r.running ? { taskId: r.running } : {}),
        startedAt: r.createdAt ?? r.reviewAt,
        ...(mark ? { mark } : {}),
      });
    }
    // Tasks that look again on their own: an armed wait, or paused here.
    const waits = new Map<string, ReturnType<Waiters["views"]>[number]>();
    for (const w of o.waiters.views()) if (w.taskId && w.state === "armed" && !w.routineId) waits.set(w.taskId, w);
    const ids = new Set([...waits.keys(), ...Object.keys(paused)]);
    for (const id of ids) {
      const c = o.tasks.get(id);
      if (!c) continue;
      const w = waits.get(id);
      const p = paused[id];
      const pw = p?.waiters[0];
      // D394: a review task whose round card is unanswered waits on the person, under 等你.
      const state: OngoingItem["state"] = p ? "paused" : c.attention === "needs_you" || o.asking?.(id) ? "needs_you" : ACTIVE.has(c.attention) ? "running" : "resting";
      const every = w?.everyMs ?? pw?.everyMs;
      const reason = w?.reason ?? pw?.reason;
      items.push({
        kind: "task",
        id,
        title: c.title,
        ...(c.project ? { project: c.project } : {}),
        state,
        ...(every ? { everyMs: every } : {}),
        ...(reason ? { reason } : {}),
        ...(!p && w ? { nextAt: w.nextLookAt ?? w.at } : {}),
        ...(p ? { pausedBy: "user" as const, ...(p.until ? { pausedUntil: p.until } : {}) } : {}),
        runs: taskRuns(id),
        // D394: a review task's standing after its last round (the card's line).
        ...((r) => (r ? { reviews: r } : {}))(o.reviews?.(id)),
        // D407: the small app it keeps current (the card opens it).
        ...((a) => (a ? { app: a } : {}))(o.app?.(id)),
        taskId: id,
        startedAt: c.openedAt,
        ...(c.mark ? { mark: c.mark } : {}),
      });
    }
    const rank: Record<OngoingItem["state"], number> = { needs_you: 0, running: 1, resting: 2, proposed: 3, paused: 4 };
    return items.sort((a, b) => rank[a.state] - rank[b.state] || (a.nextAt ?? "~").localeCompare(b.nextAt ?? "~") || a.title.localeCompare(b.title));
  }

  function resumeTask(id: string): boolean {
    const p = paused[id];
    if (!p) return false;
    delete paused[id];
    save();
    for (const w of p.waiters) {
      const { unmet: _u, observed: _o, ...rest } = w;
      const body: Bodies["waiter"] = { ...rest, state: "armed" };
      if (body.until && Date.parse(body.until) <= clock.now()) delete body.until;
      o.log.append({ stream: "channel", origin: "user", kind: "waiter", body });
    }
    return true;
  }

  async function act(kind: "routine" | "task", id: string, a: OngoingAction): Promise<{ ok: boolean; message?: string }> {
    const until = a.action === "pause" && a.until && Date.parse(a.until) > clock.now() ? iso(Date.parse(a.until)) : undefined;
    // Paused until a time: resumed then (the sweep catches it too, after a restart).
    if (until) {
      const t = setTimeout(() => sweep(), Math.min(Date.parse(until) - clock.now() + 5, 2 ** 31 - 1));
      (t as { unref?: () => void }).unref?.();
    }
    if (kind === "routine") {
      const r = o.routines.get(id);
      if (!r) return { ok: false, message: "I can't find that routine." };
      switch (a.action) {
        case "pause": {
          const ok = r.state === "paused" || o.routines.pause(id, "user", "asked");
          if (ok) until ? (routineUntil[id] = until) : delete routineUntil[id], save();
          return ok ? { ok } : { ok, message: "It isn't running, so there is nothing to pause." };
        }
        case "resume":
          delete routineUntil[id], save();
          return o.routines.resume(id) ? { ok: true } : { ok: false, message: "It isn't paused." };
        case "run_now":
          return o.routines.runNow(id) ? { ok: true } : { ok: false, message: "It can't run now." };
        case "retime":
          return o.routines.retime(id, a.trigger) ? { ok: true } : { ok: false, message: "Only a routine on a schedule can change when it runs." };
        case "end":
          return o.routines.end(id) ? { ok: true } : { ok: false, message: "It has already ended." };
      }
    }
    const c = o.tasks.get(id);
    if (!c) return { ok: false, message: "I can't find that task." };
    switch (a.action) {
      case "pause": {
        if (paused[id]) {
          paused[id]!.until = until;
          if (!until) delete paused[id]!.until;
          save();
          return { ok: true };
        }
        const mine = o.waiters.views().filter((w) => w.taskId === id && w.state === "armed");
        if (!mine.length) return { ok: false, message: "It isn't waiting on anything, so there is nothing to pause." };
        paused[id] = { waiters: mine.map(({ armedAt: _a, lastLookAt: _l, lastSummary: _s, looks: _n, nextLookAt: _x, changes: _c, ...w }) => w as Bodies["waiter"]), at: iso(clock.now()), ...(until ? { until } : {}) };
        save();
        for (const w of mine) o.waiters.cancel(w.waiterId, { by: "user" });
        return { ok: true };
      }
      case "resume":
        return resumeTask(id) ? { ok: true } : { ok: false, message: "It isn't paused." };
      case "run_now": {
        if (paused[id]) resumeTask(id);
        const w = o.waiters.views().find((x) => x.taskId === id && x.state === "armed");
        if (!w) return { ok: false, message: "It has nothing to look at now." };
        await o.waiters.look(w.waiterId);
        return { ok: true };
      }
      case "end": {
        if (paused[id]) delete paused[id], save();
        for (const w of o.waiters.views().filter((x) => x.taskId === id && x.state === "armed")) o.waiters.cancel(w.waiterId, { by: "user" });
        return { ok: true };
      }
      case "retime":
        return { ok: false, message: "A task's wait keeps its own pace; say a new one to it." };
    }
    return { ok: false };
  }

  function sweep() {
    const now = clock.now();
    let any = false;
    for (const [id, p] of Object.entries(paused)) if (p.until && Date.parse(p.until) <= now) any = resumeTask(id) || any;
    for (const [id, at] of Object.entries(routineUntil)) {
      if (Date.parse(at) > now) continue;
      delete routineUntil[id];
      save();
      any = o.routines.resume(id) || any;
    }
    if (any) o.onChange?.();
  }
  const timer = setInterval(sweep, 30_000);
  (timer as { unref?: () => void }).unref?.();

  return { list, act, sweep, stop: () => clearInterval(timer) };
}
