// Tasks in rounds (D427): "每 45 分钟 review 一轮", "keep an eye on the fare every morning". Such a
// task rests on its own wait between rounds (D267, D394). Before D427 the rounds were only the
// agent's habit of calling wait_for again, so anything that ended the task ended the promise: on
// hel, round 185's report said "done" (the round was done) and the task was marked done, which
// cancelled the timer it had just armed (research/177). A loop is a promise the person made with
// Ducter, so Ducter keeps it, here:
//
//   - It is its own record: `task_loop` on the task's stream (the rhythm or the wait it re-arms,
//     its state, who ended it), rebuilt on every start; the one source of truth for "it repeats".
//   - Known from the person's words in the brief (每 45 分钟, every morning, 一直, keep checking)
//     when the task first rests on its own wait, or from its rounds (it re-armed after a wake).
//   - A round's done or failed report is that round's end, never the loop's (decisions.ts asks
//     keeps()). The task's attention stays with the rounds; its wait is never cancelled for it.
//   - Anything else that would end it (the harness crashed, a finished card, a lost wait, a turn
//     that forgot to re-arm, a restart) brings the next round back by itself: one round, at its
//     time or, when overdue, once soon after (never a burst).
//   - Only the person ends it: dropping the task, 不再跑 / End on its card, "别跑了" through the
//     partner (routine_change), or a stop said to the task itself; or the end condition they gave
//     ("直到 #10473 合并"), which the task's done report then means.
//   - A watchdog: a round overdue past its grace (its computer asleep, its wake lost) or three failed
//     rounds in a row is said once, plainly, on a card whose Go runs a round now; the card closes by
//     itself once that is no longer so (D481). A round that only runs long is never said from the
//     time alone (D481, principle 21): the partner gets its facts (its steps, what it waits on, how
//     long its earlier rounds took) on a `mend` hand-over of class "round", looks, and judges.
import type { Bodies, LangTag, LogEvent, OngoingHealth, RoundFacts, TaskLoopBody, WaiterView } from "@ducter/protocol";
import { fill, words } from "@ducter/protocol";
import type { LogStore, Runner, WorkerLinks } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import { intlLocale } from "./lang.ts";
import type { CoreRegistry } from "./registry.ts";
import { kindOf, type Waiters } from "./waiters.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** How often the keeper looks over every loop. */
export const SWEEP_MS = MIN;
/** After a turn ends, how long the task has to arm its own next round before Ducter does. */
export const SETTLE_MS = 20_000;
/** A round can't start (its computer asleep, the runner not up): try again this often. */
export const RETRY_WAKE_MS = 10 * MIN;
/** A round this overdue is late (and said once): half its rhythm, between 15 min and an hour. */
export const graceOf = (everyMs: number | undefined) => Math.min(HOUR, Math.max(15 * MIN, Math.round((everyMs ?? 30 * MIN) / 2)));
/**
 * D481: a round going this long is handed to the partner to look at (three rhythms, at least two
 * hours). A budget for when to look, never a verdict: how long CI or a review takes is the
 * partner's to judge from the facts; nothing is said to the person from the time alone.
 */
export const lookAfterOf = (everyMs: number | undefined) => Math.max(2 * HOUR, 3 * (everyMs ?? HOUR));
/** D481: a long round is looked at again only after this much more (one hand-over a round, then at most this often). */
export const LOOK_AGAIN_MS = 6 * HOUR;
/** Failed rounds in a row before it is said. */
export const FAILS_TO_TELL = 3;
/** How far back a loop stopped by mistake is brought back on start. */
export const REVIVE_WITHIN_MS = 7 * DAY;
/** How long the card shows that a loop was brought back. */
const BACK_SHOWN_MS = DAY;

const FINISHED = new Set(["done", "done_claimed", "failed"]);
const GONE = new Set(["dropped", "superseded"]);

/**
 * The person's words that make a task repeat (zh and en): a rhythm (每 45 分钟, 每天, every two
 * hours, every morning), or "一直/循环/keep checking". INFERRED from the author's briefs and the
 * consumer cases in D427; a miss still becomes a loop from its rounds.
 */
export function repeatsIn(brief: string): boolean {
  return /每\s*(隔\s*)?(\d+|[一二两三四五六十半])\s*(个\s*)?(分钟|分|小时|钟头|天|周|星期)|每(天|日|周|星期|个?小时|个?早上|晚上|个工作日)|一直(循环|盯|看|查|跑|跟)|循环(地|着)?(查|看|跑|review)|定期|every\s+(\d+|few|couple of|other|two|three|half an?)\s*(min|minute|hour|day|week)|every\s+(morning|evening|night|day|hour|week|weekday)|keep (checking|watching|an eye|looking|reviewing)|on a loop|in a loop/i.test(brief);
}

/** An end condition the person gave in the brief ("直到 #10473 合并", "until the PR merges"), in their words. INFERRED. */
export function untilIn(brief: string): string | undefined {
  const zh = brief.match(/(?:直到|一直到)\s*([^。；;\n，,]{2,40}?)\s*(?:为止|就停|再停|就不用|[。；;\n，,]|$)/);
  if (zh?.[1]) return zh[1].trim();
  const en = brief.match(/\buntil\s+([^.;\n,]{3,60}?)(?:[.;\n,]|$)/i);
  return en?.[1]?.trim() || undefined;
}

/** A stop said to the task ("别跑了", "停掉这个循环", "stop the loop"). INFERRED; the card and the partner's routine_change are exact. */
export function saysStop(text: string): boolean {
  return /(别|不要|不用|无需)\s*(再)?\s*(跑|查|看|循环|轮询|review|评审|盯)|停(掉|止|下来|了吧)|(结束|关掉|取消)(这个)?(循环|任务|轮询)|stop (the |this |your )?(loop|checking|watching|running|reviews?|rounds)|no more (rounds|checks|reviews)|that'?s enough/i.test(text);
}

// The keeper's words (D292: zh and en; any other language falls back to English).
const W = {
  zh: {
    late: "「{title}」该 {due} 跑一轮，已经晚了 {min} 分钟：{why}",
    failing: "「{title}」最近 {n} 轮都没做成：{why}。它还会照常再试。",
    back: "「{title}」{at} 被误停了，已经接着跑，下一轮 {next}。",
    asleep: "{dev} 睡着了或连不上。醒了会马上补跑一轮。",
    asleepAny: "它的电脑睡着了或连不上。醒了会马上补跑一轮。",
    asleepMove: "{dev} 睡着了或连不上。{to} 醒着，可以先换到它上面跑；不换的话，{dev} 醒了会马上补跑一轮。",
    unknown: "还没开始。",
    runNow: "现在跑一次",
    move: "换到醒着的电脑上跑",
  },
  en: {
    late: "“{title}” was due for a round at {due} and is {min} min late: {why}",
    failing: "“{title}” hasn't worked for its last {n} rounds: {why}. It will keep trying on its rhythm.",
    back: "“{title}” stopped by mistake at {at}. It's running again; next round {next}.",
    asleep: "{dev} is asleep or can't be reached. It catches up with one round as soon as it's back.",
    asleepAny: "its computer is asleep or can't be reached. It catches up with one round as soon as it's back.",
    asleepMove: "{dev} is asleep or can't be reached. {to} is awake and can run it there; otherwise it catches up with one round as soon as {dev} is back.",
    unknown: "it hasn't started yet.",
    runNow: "Run it now",
    move: "Run it on an awake computer",
  },
};

export interface Loops {
  /** A round's done or failed report is the round's end, not the task's (decisions.ts). */
  keeps(taskId: string): boolean;
  get(taskId: string): TaskLoopBody | undefined;
  /** Loops on or paused. */
  all(): TaskLoopBody[];
  /** D511: every loop ever kept, ended ones too (each is a Keep, the ended ones under 照看过的). */
  ever(): TaskLoopBody[];
  health(taskId: string): OngoingHealth | undefined;
  /** The rhythm the person set ("改成每小时"); the task's own timers follow it. */
  rhythm(taskId: string): number | undefined;
  /** 多久跑一轮 / How often: every this many minutes, from the round now waiting. */
  every(taskId: string, minutes: number, by: "user" | "partner"): { ok: boolean; message?: string; nextAt?: string };
  pause(taskId: string): boolean;
  resume(taskId: string): boolean;
  end(taskId: string, by: "user" | "partner" | "condition"): boolean;
  /** A round now, outside the rhythm (the next one follows from it). */
  runNow(taskId: string): boolean;
  /** D429: 换到醒着的电脑上跑: the task moves to that computer (task_switch's move), then a round now. */
  move(taskId: string, device: string): Promise<{ ok: boolean; message?: string }>;
  /** work.ts: a round's wake reached the task: a round that couldn't start has started (its rhythm counts from now). */
  woke(taskId: string): void;
  /** work.ts: a round's wake couldn't be delivered (its computer asleep, the runner not up). */
  wakeFailed(taskId: string, error: string): void;
  /** Tests: one pass of the keeper and the watchdog now. */
  sweep(): void;
  stop(): void;
}

/** D429: what the keeper knows of the computers (core.ts): names, an awake one for a task, the move. */
export interface LoopWhere {
  nameOf(device: string): string | undefined;
  /** Another computer, online now, that can take this task's rounds (never a folder's; a repo's only where its branch needn't move). */
  awake(taskId: string): { device: string; name: string } | undefined;
  move(taskId: string, device: string): Promise<{ ok: boolean; message?: string }>;
}

interface State {
  b: TaskLoopBody;
  lastFire?: number; // the latest own wait that fired (a round's wake)
  lastHot?: number; // the latest time a turn was going
  fails: number; // failed rounds in a row
  failWhy?: string;
  wakeFail?: { at: number; error: string; asleep: boolean; dev?: string };
  told?: number; // when the watchdog last said something about it
  looked?: { round: number; at: number }; // D481: the round last handed to the partner to look at, and when
  endedAt?: number;
  settle?: unknown; // the timer after a turn's end
  /** D483: its own look ended without its condition (ran out, or its look can't be read): the task was told and decides; Ducter never arms that look again by itself. */
  spent?: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();
const own = (w: Pick<Bodies["waiter"], "taskId" | "wakes" | "limit" | "routineId" | "check" | "event" | "watch" | "judge" | "kind">, taskId?: string) =>
  !!w.taskId && (!taskId || w.taskId === taskId) && !w.routineId && !w.limit && (kindOf(w) === "timer" ? w.wakes === "task" : true);

export function createLoops(o: {
  log: LogStore;
  tasks: CoreRegistry;
  waiters: Waiters;
  runner: () => Runner | undefined;
  workers?: () => WorkerLinks | undefined;
  clock?: Clock;
  /** The language the person talks in now (the keeper's cards). */
  lang?: () => LangTag;
  /** The person's zone, for times on the cards. */
  zone?: () => string | undefined;
  /** D429: the computers: a name by device id ("local" is the home), another one awake that can take a task's rounds, and the move itself. */
  where?: LoopWhere;
}): Loops {
  const { log, tasks, waiters } = o;
  const clock = o.clock ?? realClock;
  const loops = new Map<string, State>();
  const told = new Map<string, string>(); // decisionId -> taskId (the watchdog's open cards)
  const moveOf = new Map<string, string>(); // D429: decisionId -> the awake computer its Go moves the task to
  const toldAs = new Map<string, OngoingHealth["state"]>(); // D481: what each open card said (late or failing)
  const firedSeen = new Set<string>(); // tasks whose own wait fired at least once (rounds)
  let stopped = false;
  // The keeper's own arms (a lost round, a retry, Run now, a new rhythm): not the task's pace.
  // (The Log may deliver the arm after it returns: its id is kept too.)
  let arming = false;
  const mine = new Set<string>();
  const armOwn = (input: Parameters<Waiters["arm"]>[0]) => {
    arming = true;
    try {
      const w = waiters.arm(input);
      mine.add(w.waiterId);
      return w;
    } finally {
      arming = false;
    }
  };

  const write = (s: State, patch: Partial<TaskLoopBody>) => {
    const next = { ...s.b, ...patch } as TaskLoopBody;
    for (const k of Object.keys(patch) as (keyof TaskLoopBody)[]) if (patch[k] === undefined) delete next[k];
    s.b = next;
    log.append({ stream: `task:${next.taskId}`, origin: "system", kind: "task_loop", body: { ...next } });
  };

  const briefOf = (taskId: string): string => {
    const e = log.read({ stream: `task:${taskId}`, kinds: ["task_open"], limit: 1 })[0];
    return String((e?.body as Bodies["task_open"] | undefined)?.brief ?? "");
  };
  const titleOf = (taskId: string) => tasks.get(taskId)?.title ?? taskId;
  const lang = (): LangTag => o.lang?.() ?? "en";
  const hm = (ms: number) => new Date(ms).toLocaleTimeString(intlLocale(lang()), { hour: "2-digit", minute: "2-digit", hour12: false, ...(o.zone?.() ? { timeZone: o.zone() } : {}) });

  const ownWaits = (taskId: string): WaiterView[] => waiters.views().filter((v) => v.state === "armed" && own(v, taskId));
  const limitWait = (taskId: string) => waiters.views().find((v) => v.state === "armed" && v.taskId === taskId && v.limit);

  /** What the loop re-arms: its rhythm (a timer) or the condition it looks at. */
  const specOf = (w: Bodies["waiter"], at: number): Partial<TaskLoopBody> =>
    kindOf(w) === "timer"
      ? { everyMs: Math.max(MIN, Math.round((Date.parse(w.at ?? "") - at) / MIN) * MIN), look: undefined }
      : { look: { ...(w.check ? { check: w.check } : {}), ...(w.event ? { event: w.event } : {}), ...(w.judge ? { judge: w.judge } : {}), ...(w.everyMs ? { everyMs: w.everyMs } : {}) } };

  function start(taskId: string, w: Bodies["waiter"], at: number, by: TaskLoopBody["by"]): State {
    const brief = briefOf(taskId);
    const until = untilIn(brief);
    const s: State = { b: { taskId, state: "on", reason: w.reason, since: iso(at), by, rhythmBy: "task", ...(until ? { until } : {}) } as TaskLoopBody, fails: 0 };
    loops.set(taskId, s);
    write(s, specOf(w, at));
    return s;
  }

  /** Brings a task whose card ended back to resting on its rounds (never one the person dropped). */
  function rest(taskId: string, reason: string) {
    const c = tasks.get(taskId);
    if (!c || GONE.has(c.attention)) return;
    if (FINISHED.has(c.attention) || c.attention === "needs_you") tasks.setState(taskId, "blocked", c.residency, reason);
  }

  /** The next round, armed by Ducter: at its time, or soon when that is already behind. */
  function armNext(s: State, from?: NonNullable<TaskLoopBody["back"]>["from"], stoppedAt?: string): string | undefined {
    const b = s.b;
    const now = clock.now();
    rest(b.taskId, b.reason);
    let at: string | undefined;
    try {
      if (b.look && !s.spent) {
        armOwn({ reason: b.reason, taskId: b.taskId, ...b.look });
      } else {
        // D483: a look that ran out or couldn't be read is the task's to re-arm (it was told what its
        // looks saw); the promise of rounds is kept by a round at its rhythm, which wakes the task.
        const due = Math.max(now + MIN, (s.lastFire ?? now) + (b.everyMs ?? 45 * MIN));
        at = iso(due);
        armOwn({ reason: b.reason, taskId: b.taskId, at, wakes: "task" });
      }
    } catch (err) {
      console.warn(`[loops] ${b.taskId}: could not arm its next round: ${(err as Error).message}`);
      return undefined;
    }
    // Kept: a real stop by mistake (when it stopped, shown on the card for a day), a done or failed card it came back from; a lost round or a restart's re-arm is quiet work.
    if (from && (stoppedAt || from === "done" || from === "failed")) write(s, { back: { at: iso(now), from, ...(stoppedAt ? { stoppedAt } : {}) } });
    return at;
  }

  /** A loop with nothing armed and no round going gets its next round. */
  function ensure(s: State, from: NonNullable<TaskLoopBody["back"]>["from"] = "lost") {
    if (stopped || s.b.state !== "on") return;
    const c = tasks.get(s.b.taskId);
    if (!c) return;
    if (GONE.has(c.attention)) return void end(s.b.taskId, "user");
    if (ownWaits(s.b.taskId).length || limitWait(s.b.taskId)) return;
    if (c.residency === "hot" && (c.attention === "working" || c.attention === "queued")) return; // a round is going
    if (c.attention === "needs_you" && tasks.pendingDecisions(s.b.taskId).length) return; // it asks the person
    armNext(s, from);
  }

  function end(taskId: string, by: NonNullable<TaskLoopBody["endedBy"]>): boolean {
    const s = loops.get(taskId);
    if (!s || s.b.state === "ended") return false;
    if (s.settle !== undefined) clock.clearTimeout(s.settle);
    write(s, { state: "ended", endedBy: by });
    s.endedAt = clock.now();
    return true;
  }

  /** Someone's words reached the task after this (not a wake of its own). */
  function askedSince(taskId: string, at: number): boolean {
    return log
      .read({ stream: `task:${taskId}`, kinds: ["task_event"], limit: 40 })
      .some((e) => Date.parse(e.ts) > at && (e.body as Bodies["task_event"]).role === "user" && !/^(到时间了|等到了|没等到|It's time|The wait is over|The wait ran out|The wait ended|This won't happen)/.test(String((e.body as Bodies["task_event"]).text ?? "")));
  }

  // ---------- the Log ----------
  const onEvent = (e: LogEvent) => {
    if (stopped) return;
    if (e.kind === "waiter") {
      const w = e.body as Bodies["waiter"];
      if (!own(w)) return;
      const taskId = w.taskId!;
      const at = Date.parse(e.ts);
      if (w.state === "expired" || (w.state === "cancelled" && w.cantTell)) {
        const s = loops.get(taskId);
        if (s && kindOf(w) !== "timer") s.spent = true;
        return;
      }
      if (w.state === "fired") {
        firedSeen.add(taskId);
        const s = loops.get(taskId);
        // A retry of a round that couldn't start keeps the round's own time (how late it is counts from it).
        if (s && !s.wakeFail) s.lastFire = at;
        return;
      }
      if (w.state !== "armed" || arming || mine.has(w.waiterId)) return;
      let s = loops.get(taskId);
      if (s && kindOf(w) !== "timer") s.spent = false; // the task armed a look of its own again
      if (!s || s.b.state === "ended") {
        // Ended: it starts again only when someone asked the task to go on since (接着跑).
        if (s?.b.state === "ended" && !(s.endedAt !== undefined && askedSince(taskId, s.endedAt))) return;
        // A task that rests on its own wait again after one woke it, or whose brief says it repeats.
        if (!s && !firedSeen.has(taskId) && !repeatsIn(briefOf(taskId))) return;
        s = start(taskId, w, at, s ? s.b.by : firedSeen.has(taskId) ? "rounds" : "brief");
      } else if (s.b.state === "on") {
        const spec = specOf(w, at);
        // The task's own pace, unless the person set one (its timers follow theirs, work.ts).
        const keepRhythm = s.b.rhythmBy === "user" && spec.everyMs !== undefined;
        const changed = (spec.everyMs !== undefined && spec.everyMs !== s.b.everyMs && !keepRhythm) || (spec.look && JSON.stringify(spec.look) !== JSON.stringify(s.b.look)) || w.reason !== s.b.reason;
        if (changed) write(s, { ...(keepRhythm ? {} : spec), reason: w.reason });
      }
      // It rests on its next round: a card that a round's report ended comes back to it (hel, 06:01).
      if (s.b.state === "on") queueMicrotask(() => rest(taskId, w.reason));
      return;
    }
    if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      const s = loops.get(b.taskId);
      if (!s || s.b.state === "ended") return;
      if (b.residency === "hot") {
        s.lastHot = Date.parse(e.ts);
      }
      if (GONE.has(b.attention)) return void end(b.taskId, "user");
      if (s.b.state !== "on") return;
      if (FINISHED.has(b.attention)) {
        // Ended by something other than the person (a crashed harness, a confirmed done): the
        // waiters cancel its waits on this same event; the next round comes back right after.
        const failed = b.attention === "failed";
        if (failed) (s.fails++, (s.failWhy = b.reason || s.failWhy));
        queueMicrotask(() => s.b.state === "on" && (ownWaits(b.taskId).length ? rest(b.taskId, s.b.reason) : (failed ? armNext(s, "failed") : armNext(s, "done", e.ts))));
        return;
      }
      // A turn is over: give the task a moment to arm its own next round, then make sure there is one.
      if (b.residency !== "hot") {
        if (s.settle !== undefined) clock.clearTimeout(s.settle);
        s.settle = clock.setTimeout(() => ((s.settle = undefined), ensure(s)), SETTLE_MS);
      }
      return;
    }
    if (e.kind === "report") {
      const r = e.body as Bodies["report"];
      const s = loops.get(r.taskId);
      if (!s || s.b.state !== "on") return;
      if (r.state === "failed") (s.fails++, (s.failWhy = r.summary.slice(0, 160)));
      else if (r.state === "done" || r.state === "progress") (s.fails = 0), (s.failWhy = undefined);
      // The end condition the person gave holds, as the task says: that is the loop's end.
      if (r.state === "done" && s.b.until) end(r.taskId, "condition");
      return;
    }
    if (e.kind === "decision_resolved") {
      const b = e.body as Bodies["decision_resolved"];
      const taskId = told.get(b.decisionId);
      if (!taskId) return;
      told.delete(b.decisionId);
      const to = moveOf.get(b.decisionId);
      moveOf.delete(b.decisionId);
      if (b.option === "go") to ? void move(taskId, to) : runNow(taskId);
    }
  };

  /** A stop said to the task itself since its last wake: then its done is the loop's end. */
  function stopSaid(taskId: string): boolean {
    const s = loops.get(taskId);
    const since = s?.lastFire ?? 0;
    const said = log
      .read({ stream: `task:${taskId}`, kinds: ["task_event"], limit: 60 })
      .filter((e) => Date.parse(e.ts) >= since && (e.body as Bodies["task_event"]).role === "user")
      .map((e) => String((e.body as Bodies["task_event"]).text ?? ""));
    return said.some((t) => saysStop(t) && !/^(到时间了|It's time)/.test(t));
  }

  // ---------- the watchdog ----------
  function healthOf(s: State): OngoingHealth | undefined {
    const b = s.b;
    if (b.state !== "on") return undefined;
    const now = clock.now();
    const c = tasks.get(b.taskId);
    if (!c) return undefined;
    const lim = limitWait(b.taskId);
    if (lim) return { state: "late", why: "quota", ...(lim.at ? { resetsAt: lim.at } : {}) };
    const grace = graceOf(b.everyMs);
    if (s.wakeFail && now - s.wakeFail.at >= 0) {
      const lateMin = Math.round((now - (s.lastFire ?? s.wakeFail.at)) / MIN);
      if (lateMin * MIN >= grace) {
        // D429: asleep, and another computer is awake to take it: that is the one fix.
        const to = s.wakeFail.asleep ? o.where?.awake(b.taskId) : undefined;
        return { state: "late", why: s.wakeFail.asleep ? "asleep" : "lost", lateMin, ...(s.wakeFail.dev ? { detail: s.wakeFail.dev } : {}), ...(to ? { fix: "move" as const, moveTo: to } : { fix: "run_now" as const }) };
      }
    }
    // D481: a round that only runs long is no health of its own (the partner looks: lookLong).
    if (s.fails >= FAILS_TO_TELL) return { state: "failing", why: "failed", fails: s.fails, ...(s.failWhy ? { detail: s.failWhy } : {}), fix: "run_now" };
    // Shown only for a real stop by mistake (when it stopped is known), not a round re-armed after a restart.
    const back = b.back?.stoppedAt && now - Date.parse(b.back.at) < BACK_SHOWN_MS ? b.back : undefined;
    if (back) return { state: "back", ...(back.stoppedAt ? { since: back.stoppedAt } : {}) };
    return undefined;
  }

  function tell(s: State, h: OngoingHealth) {
    const now = clock.now();
    if (s.told && now - s.told < 12 * HOUR) return;
    if (tasks.pendingDecisions(s.b.taskId).length) return; // it already asks (the runner's "asleep" card)
    if ([...told.values()].includes(s.b.taskId)) return;
    const w = words(W, lang());
    const title = titleOf(s.b.taskId);
    let question: string;
    if (h.state === "failing") question = fill(w.failing, { title, n: String(h.fails ?? FAILS_TO_TELL), why: (h.detail ?? "").replace(/[。.！!]+$/, "") });
    else {
      const dev = h.detail;
      const why = h.why !== "asleep" ? w.unknown : dev && h.moveTo ? fill(w.asleepMove, { dev, to: h.moveTo.name }) : dev ? fill(w.asleep, { dev }) : w.asleepAny;
      question = fill(w.late, { title, due: hm(s.lastFire ?? now), min: String(h.lateMin ?? 0), why });
    }
    s.told = now;
    const decisionId = `d_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    told.set(decisionId, s.b.taskId);
    toldAs.set(decisionId, h.state);
    // D429: asleep with another computer awake: Go moves it there (the person's tap is the go); else Go runs a round now.
    const move = h.fix === "move" && h.moveTo ? h.moveTo.device : undefined;
    if (move) moveOf.set(decisionId, move);
    log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId, question, goLabel: move ? w.move : w.runNow, defaultOption: "hold", reversible: true, loop: { taskId: s.b.taskId, ...(move ? { move } : {}) } } });
  }

  /** D481: the watchdog's cards whose moment passed (the round started, a round worked, the loop or its task ended) close by themselves. */
  function settleTold() {
    for (const [decisionId, taskId] of [...told]) {
      const s = loops.get(taskId);
      const c = tasks.get(taskId);
      const h = s && s.b.state === "on" && c && !GONE.has(c.attention) ? healthOf(s) : undefined;
      const as = toldAs.get(decisionId);
      if (h && (h.state === "late" || h.state === "failing") && (!as || as === h.state)) continue;
      told.delete(decisionId);
      toldAs.delete(decisionId);
      moveOf.delete(decisionId);
      log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId, option: "hold", by: "ended", settled: true } });
    }
  }

  /** D481: what the keeper knows of a round that runs long: facts for the partner, never a verdict. */
  function factsOf(s: State): RoundFacts {
    const taskId = s.b.taskId;
    const since = s.lastFire ?? clock.now();
    // Its earlier rounds: from each wake of its own to the next wait it armed (its round's end).
    const ws = log.read({ kinds: ["waiter"], limit: 2000 }).filter((e) => own(e.body as Bodies["waiter"], taskId));
    const earlier: number[] = [];
    let fired: number | undefined;
    for (const e of ws) {
      const w = e.body as Bodies["waiter"];
      const at = Date.parse(e.ts);
      if (w.state === "fired") fired = at;
      else if (w.state === "armed" && fired !== undefined && at < since) (earlier.push(Math.max(1, Math.round((at - fired) / MIN))), (fired = undefined));
    }
    const evs = log.read({ stream: `task:${taskId}`, kinds: ["task_state", "task_event", "report"], limit: 200 });
    const steps: RoundFacts["steps"] = [];
    let report: RoundFacts["report"];
    for (const e of evs) {
      if (e.kind === "task_state") {
        const b = e.body as Bodies["task_state"];
        if (b.reason) steps.push({ at: e.ts, text: `${b.attention}: ${b.reason.slice(0, 200)}` });
      } else if (e.kind === "report") {
        const b = e.body as Bodies["report"];
        if (Date.parse(e.ts) >= since) report = { at: e.ts, state: b.state, summary: b.summary.slice(0, 300) };
      } else {
        const b = e.body as Bodies["task_event"];
        if (b.role === "assistant" && b.text?.trim()) steps.push({ at: e.ts, text: `said: ${b.text.trim().slice(0, 200)}` });
        else if (b.role === "tool" && b.tool?.name) steps.push({ at: e.ts, text: `used ${b.tool.name}${b.tool.ok === false ? " (it failed)" : ""}` });
      }
    }
    const waits = waiters
      .views()
      .filter((v) => v.state === "armed" && v.taskId === taskId)
      .map((v) => v.reason)
      .filter(Boolean);
    return { since: iso(since), ...(s.b.everyMs ? { everyMs: s.b.everyMs } : {}), ...(s.b.reason ? { reason: s.b.reason } : {}), ...(earlier.length ? { earlier: earlier.slice(-6) } : {}), steps: steps.slice(-8), ...(waits.length ? { waits: waits.slice(0, 3) } : {}), ...(report ? { report } : {}) };
  }

  /**
   * D481: a round going on past its look budget is handed to the partner with its facts (a `mend`
   * of class "round"): it looks at the steps and judges. Once a round, then at most every LOOK_AGAIN_MS.
   */
  function lookLong(s: State) {
    const c = tasks.get(s.b.taskId);
    if (!c || !s.lastFire || !(c.attention === "working" || c.attention === "queued") || (s.lastHot ?? 0) < s.lastFire) return;
    const now = clock.now();
    if (now - s.lastFire <= lookAfterOf(s.b.everyMs)) return;
    if (s.looked && s.looked.round === s.lastFire && now - s.looked.at < LOOK_AGAIN_MS) return;
    s.looked = { round: s.lastFire, at: now };
    const attempt = log.read({ stream: `task:${s.b.taskId}`, kinds: ["mend"], limit: 200 }).length + 1;
    log.append({ stream: `task:${s.b.taskId}`, origin: "system", kind: "mend", body: { taskId: s.b.taskId, cls: "round", rung: "rethink", attempt, tried: [], state: "ok", round: factsOf(s) } });
  }

  function sweep() {
    if (stopped) return;
    for (const s of loops.values()) {
      if (s.b.state !== "on") continue;
      ensure(s);
      const h = healthOf(s);
      if (h && (h.state === "late" || h.state === "failing") && h.why !== "quota") tell(s, h);
      lookLong(s);
    }
    settleTold();
  }

  function runNow(taskId: string): boolean {
    const s = loops.get(taskId);
    if (!s || s.b.state === "ended") return false;
    const c = tasks.get(taskId);
    if (!c || GONE.has(c.attention)) return false;
    if (c.residency === "hot" && c.attention === "working") return true; // a round is going now
    if (s.b.state === "paused") return false;
    const before = ownWaits(taskId);
    rest(taskId, s.b.reason);
    s.wakeFail = undefined;
    // The round now is its own timer, due at once; the next one follows from it.
    const w = armOwn({ reason: s.b.reason, taskId, at: iso(clock.now() + 1000), wakes: "task" });
    for (const v of before) waiters.cancel(v.waiterId, { by: "user", replacedBy: w.waiterId });
    return true;
  }

  /** D429: the person tapped 换到醒着的电脑上跑: the task moves (task_switch's move, its saved progress), then its round runs there now. */
  async function move(taskId: string, device: string): Promise<{ ok: boolean; message?: string }> {
    const s = loops.get(taskId);
    if (!s || s.b.state === "ended") return { ok: false, message: "It doesn't run in rounds." };
    if (!o.where) return { ok: false, message: "Moving a task to another computer isn't available here." };
    const r = await o.where.move(taskId, device).catch((err: Error) => ({ ok: false, message: err.message }));
    if (!r.ok) return r;
    s.wakeFail = undefined;
    runNow(taskId);
    return { ok: true };
  }

  // ---------- rebuild ----------
  const firedAt = new Map<string, number>();
  const ownFires = new Map<string, number>();
  const lastOwnEnd = new Map<string, { state: string; ts: string; origin: string; w: Bodies["waiter"] }>();
  const hotAt = new Map<string, number>();
  const att = new Map<string, string>();
  const failsOf = new Map<string, { n: number; why: string }>();
  const lastArmed = new Map<string, { ts: string; w: Bodies["waiter"] }>();
  const lookedAt = new Map<string, number>(); // D481: the latest long-round hand-over per task
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_loop", "waiter", "task_state", "decision", "decision_resolved", "report", "mend"] })) {
    if (e.kind === "mend") {
      const m = e.body as Bodies["mend"];
      if (m.cls === "round") lookedAt.set(m.taskId, Date.parse(e.ts));
    } else if (e.kind === "task_loop") {
      const b = e.body as TaskLoopBody;
      const prev = loops.get(b.taskId);
      loops.set(b.taskId, prev ? { ...prev, b } : { b, fails: 0 });
      if (b.state === "ended") loops.get(b.taskId)!.endedAt = Date.parse(e.ts);
    } else if (e.kind === "waiter") {
      const w = e.body as Bodies["waiter"];
      if (!own(w)) continue;
      if (w.state === "fired") firedAt.set(w.taskId!, Date.parse(e.ts)), ownFires.set(w.taskId!, (ownFires.get(w.taskId!) ?? 0) + 1), firedSeen.add(w.taskId!);
      lastOwnEnd.set(w.taskId!, { state: w.state, ts: e.ts, origin: e.origin, w });
      if (w.state === "armed") lastArmed.set(w.taskId!, { ts: e.ts, w });
    } else if (e.kind === "task_state") {
      const b = e.body as Bodies["task_state"];
      att.set(b.taskId, b.attention);
      if (b.residency === "hot") hotAt.set(b.taskId, Date.parse(e.ts));
    } else if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      if (d.loop?.taskId) told.set(d.decisionId, d.loop.taskId);
      if (d.loop?.move) moveOf.set(d.decisionId, d.loop.move);
    } else if (e.kind === "report") {
      // Failed rounds in a row, across a restart.
      const r = e.body as Bodies["report"];
      if (r.state === "failed") failsOf.set(r.taskId, { n: (failsOf.get(r.taskId)?.n ?? 0) + 1, why: r.summary.slice(0, 160) });
      else if (r.state === "done" || r.state === "progress") failsOf.delete(r.taskId);
    } else told.delete((e.body as Bodies["decision_resolved"]).decisionId), moveOf.delete((e.body as Bodies["decision_resolved"]).decisionId);
  }
  for (const [taskId, s] of loops) {
    const end = lastOwnEnd.get(taskId);
    if (end && kindOf(end.w) !== "timer" && (end.state === "expired" || (end.state === "cancelled" && end.w.cantTell))) s.spent = true;
    s.lastFire = firedAt.get(taskId);
    s.lastHot = hotAt.get(taskId);
    if (failsOf.has(taskId)) (s.fails = failsOf.get(taskId)!.n), (s.failWhy = failsOf.get(taskId)!.why);
    const looked = lookedAt.get(taskId);
    if (looked !== undefined && s.lastFire !== undefined && looked >= s.lastFire) s.looked = { round: s.lastFire, at: looked };
  }
  // Loops from before D427: a task that kept going in rounds has no record yet. Kept now; one that
  // a round's "done" (or a failure) stopped within the last week comes back, said once.
  const revived: { s: State; stoppedAt: string }[] = [];
  for (const [taskId, last] of lastOwnEnd) {
    if (loops.has(taskId)) continue;
    const fires = ownFires.get(taskId) ?? 0;
    if (fires < 2 && !(fires >= 1 && repeatsIn(briefOf(taskId)))) continue;
    const a = att.get(taskId);
    if (!a || GONE.has(a)) continue;
    // Its rhythm from its last own wait as it was armed (at minus when).
    const arm = lastArmed.get(taskId) ?? { ts: last.ts, w: last.w };
    const s = start(taskId, arm.w, Date.parse(arm.ts), "rounds");
    s.lastFire = firedAt.get(taskId);
    s.lastHot = hotAt.get(taskId);
    if (failsOf.has(taskId)) (s.fails = failsOf.get(taskId)!.n), (s.failWhy = failsOf.get(taskId)!.why);
    // Stopped by the task's card ending (its wait cancelled with no one's word), not by the person.
    const byFinish = last.state === "cancelled" && !last.w.replacedBy && last.origin === "waiter" && !last.w.unmet;
    if (FINISHED.has(a) && byFinish && clock.now() - Date.parse(last.ts) <= REVIVE_WITHIN_MS) revived.push({ s, stoppedAt: last.ts });
  }
  const unsubscribe = log.subscribe(onEvent);

  const settleStart = clock.setTimeout(() => {
    if (stopped) return;
    for (const { s, stoppedAt } of revived) {
      const next = armNext(s, "restart", stoppedAt);
      const w = words(W, lang());
      log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: fill(w.back, { title: titleOf(s.b.taskId), at: hm(Date.parse(stoppedAt)), next: next ? hm(Date.parse(next)) : "" }) } });
    }
    for (const s of loops.values()) if (s.b.state === "on" && !revived.some((r) => r.s === s)) ensure(s, "restart");
    tick();
  }, SETTLE_MS);
  let sweeper: unknown;
  const tick = () => {
    if (stopped) return;
    sweep();
    sweeper = clock.setTimeout(tick, SWEEP_MS);
  };

  return {
    keeps(taskId) {
      const s = loops.get(taskId);
      if (!s || s.b.state !== "on") return false;
      if (s.b.until) return false; // its done means the end condition the person gave holds
      if (stopSaid(taskId)) {
        end(taskId, "user");
        return false;
      }
      return true;
    },
    get: (taskId) => loops.get(taskId)?.b,
    all: () => [...loops.values()].filter((s) => s.b.state !== "ended").map((s) => s.b),
    ever: () => [...loops.values()].map((s) => s.b),
    health: (taskId) => {
      const s = loops.get(taskId);
      return s ? healthOf(s) : undefined;
    },
    rhythm: (taskId) => {
      const s = loops.get(taskId);
      return s?.b.state === "on" && s.b.rhythmBy === "user" ? s.b.everyMs : undefined;
    },
    every(taskId, minutes, _by) {
      const s = loops.get(taskId);
      if (!s || s.b.state === "ended") return { ok: false, message: "It doesn't run in rounds." };
      const m = Math.round(Number(minutes));
      if (!Number.isFinite(m) || m < 5 || m > 7 * 24 * 60) return { ok: false, message: "A rhythm is between 5 minutes and a week." };
      if (s.b.look) return { ok: false, message: "It runs when something changes, not on a clock." };
      write(s, { everyMs: m * MIN, rhythmBy: "user" });
      if (s.b.state !== "on") return { ok: true };
      // The round waiting now moves to the new rhythm, counted from its last wake (or now).
      const cur = ownWaits(taskId).find((v) => kindOf(v) === "timer");
      const from = s.lastFire ?? clock.now();
      const due = Math.max(clock.now() + MIN, from + m * MIN);
      if (cur || !tasks.get(taskId) || tasks.get(taskId)!.residency !== "hot") {
        const w = armOwn({ reason: s.b.reason, taskId, at: iso(due), wakes: "task" });
        if (cur) waiters.cancel(cur.waiterId, { by: "user", replacedBy: w.waiterId });
      }
      return { ok: true, nextAt: iso(due) };
    },
    pause(taskId) {
      const s = loops.get(taskId);
      if (!s || s.b.state !== "on") return false;
      write(s, { state: "paused" });
      return true;
    },
    resume(taskId) {
      const s = loops.get(taskId);
      if (!s || s.b.state !== "paused") return false;
      write(s, { state: "on" });
      clock.setTimeout(() => ensure(s), SETTLE_MS);
      return true;
    },
    end: (taskId, by) => end(taskId, by),
    runNow,
    move,
    woke(taskId) {
      const s = loops.get(taskId);
      if (s?.wakeFail) (s.wakeFail = undefined), (s.lastFire = clock.now());
    },
    wakeFailed(taskId, error) {
      const s = loops.get(taskId);
      if (!s || s.b.state !== "on") return;
      const c = tasks.get(taskId);
      const on = c?.place.device && c.place.device !== "local" ? c.place.device : "local";
      const dev = on !== "local" ? o.workers?.()?.link(on) : undefined;
      const asleep = !!dev && !dev.online();
      // D429: the computer by its name wherever it is known (a worker's link, else the home's list; the home itself too).
      const name = dev?.name ?? o.where?.nameOf(on);
      s.wakeFail = { at: s.wakeFail?.at ?? clock.now(), error: error.slice(0, 200), asleep: asleep || /asleep|offline|can't be reached|unreachable|not connected|睡着|连不上/i.test(error), ...(name ? { dev: name } : {}) };
      // Try again soon: the one catch-up round when it can start (a single timer, never a burst).
      const before = ownWaits(taskId);
      rest(taskId, s.b.reason);
      try {
        const w = armOwn({ reason: s.b.reason, taskId, at: iso(clock.now() + RETRY_WAKE_MS), wakes: "task" });
        for (const v of before) waiters.cancel(v.waiterId, { by: "system", replacedBy: w.waiterId });
      } catch {
        // its next sweep arms it
      }
    },
    sweep,
    stop() {
      stopped = true;
      unsubscribe();
      clock.clearTimeout(settleStart);
      if (sweeper !== undefined) clock.clearTimeout(sweeper);
      for (const s of loops.values()) if (s.settle !== undefined) clock.clearTimeout(s.settle);
    },
  };
}
