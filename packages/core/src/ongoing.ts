// D285: 一直在跑的 / Ongoing: what keeps going on its own, as cards beside 做过的事 / Past tasks.
// Two kinds: a routine (D114: on a schedule or a condition, each firing a run) and a task resting
// on its own wait (D267/D279: it looks again every so often). One set of gestures for both:
//   暂停 / Pause (no new runs or looks; until a time, or until resumed), 恢复 / Resume,
//   立即运行 / Run now (a routine's run, or a task's look now), 改时间 / Change when (a time
//   routine), 不再跑 / End.
// Routines keep their own pause (routines.ts). A task's pause is Ducter's here: its armed waits
// end (by the user) and are kept in <dataDir>/paused.json, and come back as they were on resume.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Bodies, LangTag, OngoingAction, OngoingHealth, OngoingItem, OngoingRun, TaskRounds } from "@ducter/protocol";
import { words } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { Clock } from "./clock.ts";
import { realClock } from "./clock.ts";
import type { Marks } from "./past.ts";
import type { CoreRegistry } from "./registry.ts";
import type { Routines } from "./routines.ts";
import type { Waiters } from "./waiters.ts";
import type { Loops } from "./loops.ts";
import { endTaskByPerson } from "./end-task.ts";

const RUNS = 12;
const ACTIVE = new Set(["queued", "working", "done_claimed"]);

interface Paused {
  waiters: Bodies["waiter"][];
  until?: string;
  at: string;
}

export interface Ongoing {
  list(persona: string): OngoingItem[];
  /** D498: a task in rounds, for its On hand card (undefined when it isn't one). */
  rounds(taskId: string): TaskRounds | undefined;
  act(kind: "routine" | "task", id: string, a: OngoingAction): Promise<{ ok: boolean; message?: string }>;
  /** Resumes what was paused until a time that has come (the timer runs it too). */
  sweep(): void;
  stop(): void;
}

export function createOngoing(o: {
  dataDir: string;
  log: LogStore;
  tasks: CoreRegistry;
  waiters: Waiters;
  routines: Routines;
  marks?: Marks;
  clock?: Clock;
  onChange?: () => void;
  reviews?: (taskId: string) => import("@ducter/protocol").ReviewStanding | undefined;
  asking?: (taskId: string) => boolean;
  app?: (taskId: string) => { id: string; name: string } | undefined;
  /** D427: tasks in rounds, kept by Ducter. */
  loops?: Loops;
  /** D427: a computer's name for the card's "where" ("local" is this home). */
  deviceName?: (device: string) => string | undefined;
  /** D633: put the task's agent down when the person ends a task still at work (the runner's drop). */
  drop?: (taskId: string) => Promise<void>;
}): Ongoing {
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

  /** D427: the latest run that went somewhere (not a skip). */
  const lastOf = (runs: OngoingRun[]): OngoingItem["last"] => {
    const r = [...runs].reverse().find((x) => x.state !== "skipped");
    return r ? { at: r.at, state: r.state, ...(r.line ? { line: r.line } : {}) } : undefined;
  };
  /** D427: where it runs, and which agent: this home when no computer is named. */
  const whereOf = (device: string | undefined, harness: string | undefined): OngoingItem["where"] => {
    const dev = device && device !== "local" ? device : "local";
    const name = o.deviceName?.(dev);
    if (!name && !harness) return undefined;
    return { device: dev, ...(name ? { deviceName: name } : {}), ...(harness ? { harness } : {}) };
  };
  /** D427: a routine's health: an account it can't use (it tries again by itself), or its last runs failing. */
  const routineHealth = (r: ReturnType<Routines["views"]>[number], runs: OngoingRun[]): OngoingHealth | undefined => {
    if (r.state !== "active") return undefined;
    if (r.backoff) return { state: "late", why: r.backoff.trouble === "quota" ? "quota" : "signin", resetsAt: r.backoff.nextTryAt, detail: r.backoff.reason, since: r.backoff.since };
    const tail = runs.filter((x) => x.state !== "skipped").slice(-3);
    if (tail.length === 3 && tail.every((x) => x.state === "failed")) return { state: "failing", why: "failed", fails: 3, ...(tail[2]!.line ? { detail: tail[2]!.line } : {}), fix: "run_now" };
    return undefined;
  };

  function list(persona: string): OngoingItem[] {
    const items: OngoingItem[] = [];
    for (const r of o.routines.views()) {
      if (r.state === "ended" || r.state === "dismissed") continue;
      const running = r.running && o.tasks.get(r.running) && ACTIVE.has(o.tasks.get(r.running)!.attention);
      const state: OngoingItem["state"] = r.state === "proposed" ? "proposed" : r.state === "paused" ? "paused" : running ? "running" : "resting";
      const mark = markOf(persona, r.routineId);
      const runs = routineRuns(r.routineId);
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
        runs,
        ...(r.running ? { taskId: r.running } : {}),
        startedAt: r.createdAt ?? r.reviewAt,
        ...(mark ? { mark } : {}),
        // D427: how it keeps its time, its last run in one line, where it runs and who does it.
        ...((h) => (h ? { health: h } : {}))(routineHealth(r, runs)),
        ...((l) => (l ? { last: l } : {}))(lastOf(runs)),
        ...((w) => (w ? { where: w } : {}))(whereOf(r.place?.device, r.harness)),
      });
    }
    // Tasks that look again on their own: an armed wait, paused here, or in rounds Ducter keeps (D427).
    const waits = taskWaits();
    const loopIds = (o.loops?.all() ?? []).map((l) => l.taskId);
    const ids = new Set([...waits.keys(), ...Object.keys(paused), ...loopIds]);
    for (const id of ids) {
      const it = taskItem(id, waits.get(id));
      if (it) items.push(it);
    }
    const rank: Record<OngoingItem["state"], number> = { needs_you: 0, running: 1, resting: 2, proposed: 3, paused: 4 };
    return items.sort((a, b) => rank[a.state] - rank[b.state] || (a.nextAt ?? "~").localeCompare(b.nextAt ?? "~") || a.title.localeCompare(b.title));
  }

  const taskWaits = () => {
    const waits = new Map<string, ReturnType<Waiters["views"]>[number]>();
    for (const w of o.waiters.views()) if (w.taskId && w.state === "armed" && !w.routineId) waits.set(w.taskId, w);
    return waits;
  };

  /** One task that keeps going on its own, as Ongoing lists it (undefined when nothing keeps it going). */
  function taskItem(id: string, w: ReturnType<Waiters["views"]>[number] | undefined): OngoingItem | undefined {
    {
      const c = o.tasks.get(id);
      if (!c || c.attention === "dropped" || c.attention === "superseded") return undefined;
      const p = paused[id];
      const pw = p?.waiters[0];
      const loop = o.loops?.get(id);
      const inLoop = loop && loop.state !== "ended";
      // A one-off wait that ended with its task: nothing keeps going.
      if (!w && !p && !inLoop) return undefined;
      // D394: a review task whose round card is unanswered waits on the person, under 等你.
      const state: OngoingItem["state"] = p || loop?.state === "paused" ? "paused" : c.attention === "needs_you" || o.asking?.(id) ? "needs_you" : ACTIVE.has(c.attention) ? "running" : "resting";
      const every = (inLoop ? (loop.everyMs ?? loop.look?.everyMs) : undefined) ?? w?.everyMs ?? pw?.everyMs;
      const reason = w?.reason ?? pw?.reason ?? (inLoop ? loop.reason : undefined);
      const runs = taskRuns(id);
      const health = inLoop ? o.loops?.health(id) : undefined;
      return {
        kind: "task",
        id,
        title: c.title,
        ...(c.project ? { project: c.project } : {}),
        state,
        ...(every ? { everyMs: every } : {}),
        ...(reason ? { reason } : {}),
        ...(state !== "paused" && w ? { nextAt: w.nextLookAt ?? w.at } : {}),
        ...(state === "paused" ? { pausedBy: "user" as const, ...(p?.until ? { pausedUntil: p.until } : {}) } : {}),
        ...(inLoop ? { loop: true } : {}),
        ...(health ? { health } : {}),
        ...((l) => (l ? { last: l } : {}))(lastOf(runs)),
        ...((x) => (x ? { where: x } : {}))(whereOf(c.place.device, c.harness)),
        runs,
        // D394: a review task's standing after its last round (the card's line).
        ...((r) => (r ? { reviews: r } : {}))(o.reviews?.(id)),
        // D407: the small app it keeps current (the card opens it).
        ...((a) => (a ? { app: a } : {}))(o.app?.(id)),
        taskId: id,
        startedAt: c.openedAt,
        ...(c.mark ? { mark: c.mark } : {}),
      };
    }
  }

  /** D498: a task in rounds as its On hand card carries it (its rhythm, next round, last round, standing, health). */
  function rounds(taskId: string): TaskRounds | undefined {
    const loop = o.loops?.get(taskId);
    if (!loop || loop.state === "ended") return undefined;
    const it = taskItem(taskId, taskWaits().get(taskId));
    if (!it) return undefined;
    return {
      ...(it.everyMs ? { everyMs: it.everyMs } : {}),
      ...(it.nextAt ? { nextAt: it.nextAt } : {}),
      ...(it.last ? { last: it.last } : {}),
      ...(it.reviews ? { reviews: it.reviews } : {}),
      ...(it.health ? { health: it.health } : {}),
      ...(it.state === "paused" ? { paused: true } : {}),
    };
  }

  function resumeTask(id: string): boolean {
    const p = paused[id];
    if (!p) return false;
    delete paused[id];
    save();
    o.loops?.resume(id);
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
        case "every":
          return { ok: false, message: "A routine on a schedule changes when it runs (retime)." };
        case "move":
          return { ok: false, message: "A routine's runs go where its place says." };
      }
    }
    const c = o.tasks.get(id);
    if (!c) return { ok: false, message: "I can't find that task." };
    const loop = o.loops?.get(id);
    switch (a.action) {
      case "pause": {
        // D427: the keeper rests first, so it doesn't bring back the waits this pause ends.
        if (loop) o.loops!.pause(id);
        if (paused[id]) {
          paused[id]!.until = until;
          if (!until) delete paused[id]!.until;
          save();
          return { ok: true };
        }
        const mine = o.waiters.views().filter((w) => w.taskId === id && w.state === "armed");
        if (!mine.length) return loop ? { ok: true } : { ok: false, message: "It isn't waiting on anything, so there is nothing to pause." };
        paused[id] = { waiters: mine.map(({ armedAt: _a, lastLookAt: _l, lastSummary: _s, looks: _n, nextLookAt: _x, changes: _c, ...w }) => w as Bodies["waiter"]), at: iso(clock.now()), ...(until ? { until } : {}) };
        save();
        for (const w of mine) o.waiters.cancel(w.waiterId, { by: "user" });
        return { ok: true };
      }
      case "resume": {
        const back = resumeTask(id);
        return back || (loop && o.loops!.resume(id)) ? { ok: true } : { ok: false, message: "It isn't paused." };
      }
      case "run_now": {
        if (paused[id]) resumeTask(id);
        // D427: a round now, for a task in rounds (its timer, due at once).
        if (loop && loop.state !== "ended") return o.loops!.runNow(id) ? { ok: true } : { ok: false, message: "It can't run a round now." };
        const w = o.waiters.views().find((x) => x.taskId === id && x.state === "armed");
        if (!w) return { ok: false, message: "It has nothing to look at now." };
        await o.waiters.look(w.waiterId);
        return { ok: true };
      }
      case "end": {
        // D633: the person ends it. One path with the task's own 结束任务: a finished task is
        // done (its open PRs let go), one still at work is put down; the rounds end first, so
        // nothing brings it back, and the card is settled before its waits are cancelled.
        if (paused[id]) delete paused[id], save();
        await endTaskByPerson({ log: o.log, tasks: o.tasks, waiters: o.waiters, ...(o.loops ? { loops: o.loops } : {}), ...(o.drop ? { drop: o.drop } : {}) }, id);
        return { ok: true };
      }
      case "retime":
        return { ok: false, message: "A task's wait keeps its own pace; say a new one to it." };
      case "move": {
        // D429: 换到醒着的电脑上跑: on the person's tap, the task moves there and runs a round now.
        if (!loop || !o.loops) return { ok: false, message: "It doesn't run in rounds." };
        return o.loops.move(id, String(a.device ?? ""));
      }
      case "every": {
        if (!loop) return { ok: false, message: "It doesn't run in rounds." };
        const r = o.loops!.every(id, a.minutes, "user");
        return r.ok ? { ok: true } : { ok: false, ...(r.message ? { message: r.message } : {}) };
      }
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

  return { list, rounds, act, sweep, stop: () => clearInterval(timer) };
}

/**
 * D427: the partner's two words for what keeps going (routines and tasks in rounds, one list):
 * "我的循环任务都怎么样了" (routine_list), and "把 review 改成每小时" / "先停一下" / "别跑了"
 * (routine_change). They replace D114's routine_pause (one tool, the same budget).
 */
// D429: one ready line per thing that keeps going, in the person's language: its rhythm, its next
// round, and on time or why not (and the fix that waits for their tap). The partner answers with it.
const SAY = {
  zh: {
    locale: "zh-CN",
    every: (r: string) => `${r}一轮`,
    onTime: "「{title}」在跑，{how}，下一轮 {next}，按时。",
    onTimeNoNext: "「{title}」在跑，{how}，按时。",
    routineOnTime: "「{title}」在跑，{how}，下次 {next}，按时。",
    running: "「{title}」在跑，{how}，这一轮正在跑。",
    late: "「{title}」{how}，这一轮晚了 {late}：{why}。",
    asleep: "{dev} 睡着了，醒了马上补一轮",
    asleepAny: "它的电脑睡着了，醒了马上补一轮",
    canMove: "；{to} 醒着，可以换到它上面跑",
    lost: "还没开始，我在补",
    stuck: "跑得太久了，可能卡住了",
    quota: "「{title}」{how}，额度用完了，{when} 恢复后接着跑。",
    signin: "「{title}」{how}，它的账号要重新登录。",
    failing: "「{title}」{how}，最近 {n} 轮都没做成：{why}。",
    back: "「{title}」在跑，{how}：{since} 被误停过，已经接着跑，下一轮 {next}。",
    paused: "「{title}」暂停了。",
    pausedUntil: "「{title}」暂停了，{until} 恢复。",
    proposed: "「{title}」还在等你点头。",
    waits: "「{title}」在等：{reason}。",
    tomorrow: "明天 ",
    at: (day: string, hm: string) => (day ? `${day} ${hm}` : hm),
    min: (n: number) => `${n} 分钟`,
    hm: (h: number, m: number) => (m ? `${h} 小时 ${m} 分钟` : `${h} 小时`),
    rhythm: (min: number) => (min % 1440 === 0 ? (min === 1440 ? "每天" : `每 ${min / 1440} 天`) : min % 60 === 0 ? (min === 60 ? "每小时" : `每 ${min / 60} 小时`) : `每 ${min} 分钟`),
  },
  en: {
    locale: "en-GB",
    every: (r: string) => `a round ${r}`,
    onTime: "“{title}” is running, {how}; the next is {next}, on time.",
    onTimeNoNext: "“{title}” is running, {how}, on time.",
    routineOnTime: "“{title}” is on, {how}; the next run is {next}, on time.",
    running: "“{title}” is running, {how}; this round is going now.",
    late: "“{title}” ({how}) is {late} late on this round: {why}.",
    asleep: "{dev} is asleep, and it catches up as soon as it wakes",
    asleepAny: "its computer is asleep, and it catches up as soon as it wakes",
    canMove: "; {to} is awake and can run it",
    lost: "it hasn't started yet, and I'm bringing it back",
    stuck: "it has run far too long and may be stuck",
    quota: "“{title}” ({how}) is out of allowance and carries on {when}.",
    signin: "“{title}” ({how}) needs its account signed in again.",
    failing: "“{title}” ({how}) hasn't worked for its last {n} rounds: {why}.",
    back: "“{title}” is running again, {how}: it was stopped by mistake {since}; the next round is {next}.",
    paused: "“{title}” is paused.",
    pausedUntil: "“{title}” is paused; it resumes {until}.",
    proposed: "“{title}” waits for your yes.",
    waits: "“{title}” waits for: {reason}.",
    tomorrow: "tomorrow",
    at: (day: string, hm: string) => (day ? `${day} at ${hm}` : `at ${hm}`),
    min: (n: number) => `${n} min`,
    hm: (h: number, m: number) => (m ? `${h} h ${m} min` : `${h} h`),
    rhythm: (min: number) => (min % 1440 === 0 ? (min === 1440 ? "every day" : `every ${min / 1440} days`) : min % 60 === 0 ? (min === 60 ? "every hour" : `every ${min / 60} hours`) : `every ${min} minutes`),
  },
};

/** D429: the ready line for one thing that keeps going (routine_list's `say`). */
export function sayOngoing(it: OngoingItem, lang: string, now: number, zone?: string): string {
  const w = words(SAY, lang as LangTag);
  const fillIn = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
  const tz = zone ? { timeZone: zone } : {};
  const ymd = (ms: number) => new Date(ms).toLocaleDateString("en-CA", tz);
  const when = (iso?: string) => {
    if (!iso) return "";
    const ms = Date.parse(iso);
    const hm = new Date(ms).toLocaleTimeString(w.locale, { hour: "2-digit", minute: "2-digit", hour12: false, ...tz });
    if (ymd(ms) === ymd(now)) return w.at("", hm);
    if (ymd(ms) === ymd(now + 86_400_000)) return w.at(w.tomorrow.trim(), hm);
    const day = new Date(ms).toLocaleDateString(w.locale, Math.abs(ms - now) < 6 * 86_400_000 ? { weekday: "short", ...tz } : { month: "short", day: "numeric", ...tz });
    return w.at(day, hm);
  };
  const dur = (min: number) => (min < 60 ? w.min(min) : w.hm(Math.floor(min / 60), min % 60));
  const title = it.title;
  const cadence = (it.cadence ?? "").replace(/\s*[（(][^（）()]*[）)]\s*$/, "").trim();
  const how = it.kind === "routine" ? cadence : it.everyMs ? w.every(w.rhythm(Math.max(1, Math.round(it.everyMs / 60_000)))) : "";
  const v = { title, how, next: when(it.nextAt) };
  if (it.state === "proposed") return fillIn(w.proposed, v);
  if (it.state === "paused") return it.pausedUntil ? fillIn(w.pausedUntil, { ...v, until: when(it.pausedUntil) }) : fillIn(w.paused, v);
  if (it.kind === "task" && !it.loop) return fillIn(w.waits, { ...v, reason: it.reason ?? "" });
  const h = it.health;
  if (h?.state === "failing") return fillIn(w.failing, { ...v, n: String(h.fails ?? 3), why: (h.detail ?? "").replace(/[。.！!\s]+$/, "") });
  if (h?.state === "late" && h.why === "quota") return fillIn(w.quota, { ...v, when: when(h.resetsAt) });
  if (h?.state === "late" && h.why === "signin") return fillIn(w.signin, v);
  if (h?.state === "late") {
    const why = h.why === "asleep" ? fillIn(h.detail ? w.asleep : w.asleepAny, { dev: h.detail ?? "" }) + (h.moveTo ? fillIn(w.canMove, { to: h.moveTo.name }) : "") : h.why === "stuck" ? w.stuck : w.lost;
    return fillIn(w.late, { ...v, late: dur(h.lateMin ?? 0), why });
  }
  if (it.state === "running") return fillIn(w.running, v);
  if (h?.state === "back") return fillIn(w.back, { ...v, since: when(h.since) });
  if (it.kind === "routine") return fillIn(it.nextAt ? w.routineOnTime : w.onTimeNoNext, v);
  return fillIn(it.nextAt ? w.onTime : w.onTimeNoNext, v);
}
