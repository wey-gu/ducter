// Work over time (D112–D115), wired: waiters (timer, check, event, judge), `until` loops,
// routines, the partner's and tasks' tools for them, the client frames, and On hand's view.
// See waiters.ts, until.ts, routines.ts for each mechanism.
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies, CheckSpec, EventSpec, LogEvent, OnHand, Place, RoutineTrigger } from "@ducter/protocol";
import { fill, harnessName, words } from "@ducter/protocol";
import { langOfText } from "./lang.ts";
import { urlArgv, WATCH_MAX_ITEMS } from "@ducter/protocol/src/watch.ts";
import type { LogStore, Runner, WorkerLinks } from "@ducter/protocol/src/internal.ts";
import { CHECK_MAX_OUTPUT, describeCheck, describePredicate, validateCheck } from "@ducter/protocol/src/checks.ts";
import { jsonArg, jsonText } from "@ducter/protocol/src/tool-schema.ts";
import { runCheck, type CheckResult, type Exec } from "@ducter/protocol/src/checks-run.ts";
import { realClock, type Clock } from "./clock.ts";
import type { ConnectionsStore } from "./connections.ts";
import type { CoreMcpHub } from "./mcp.ts";
import { isActive, type CoreRegistry } from "./registry.ts";
import { createRoutines, type Routines } from "./routines.ts";
import { createUntils, type Untils } from "./until.ts";
import { createLoops, type Loops } from "./loops.ts";
import { createOwned, type Owned } from "./owned.ts";
import { createWaiters, kindOf, type Judge, type WaiterDeps, type Waiters } from "./waiters.ts";
import type { WorkFrames } from "./ws.ts";

export interface Work {
  waiters: Waiters;
  untils: Untils;
  routines: Routines;
  /** D427: tasks in rounds, kept going by Ducter. */
  loops: Loops;
  /** D483: what tasks own outside (their PRs), watched for them. */
  owned: Owned;
  frames: WorkFrames;
  /** On hand plus what only these parts know (looks, routine views). */
  decorate(o: OnHand): OnHand;
  /** false: this event must not wake the partner (a try of an `until` loop that is still going). */
  wakes(e: LogEvent): boolean;
  setJudge(j: Judge | undefined): void;
  stop(): void;
}

export interface WorkOptions {
  log: LogStore;
  tasks: CoreRegistry;
  mcp: CoreMcpHub;
  runner: () => Runner | undefined;
  workers?: () => WorkerLinks | undefined;
  connections?: ConnectionsStore;
  clock?: Clock;
  persona: string;
  exec?: Exec; // tests: fake commands
  minEveryMs?: number;
  judgeMinMs?: number;
  restartLookMs?: number;
  /** D483: how often owned PRs are looked at (tests). */
  ownedEveryMs?: number;
  defaultZone?: string;
  /** D528: the person's time zone now (Settings, their device), for the times a task is told. */
  zone?: () => string | undefined;
  /** D427: the language the person talks in now (the keeper's cards). */
  lang?: () => import("@ducter/protocol").LangTag;
  /** D429: the computers, for the keeper: names, an awake one to move a late loop to, the move. */
  loopsWhere?: import("./loops.ts").LoopWhere;
}

const expand = (p: string) => (p.startsWith("~/") ? homedir() + p.slice(1) : p === "~" ? homedir() : p);

/** Where a task's check runs: its device, in its place. */
export function placeOfCheck(place: Place | undefined): { device: string; cwd?: string } {
  if (!place) return { device: "local" };
  if (place.kind === "repo") return { device: place.device || "local", cwd: expand(place.worktree ?? place.repoPath) };
  if (place.kind === "folder") return { device: place.device || "local", cwd: expand(place.path) };
  return { device: place.device || "local" };
}

/**
 * The folder a check runs in. The model's cwd stays inside the task's place: a folder in it,
 * never above or beside it. Without a place (the partner's own wait) it is taken as written;
 * validateCheck still keeps it out of the data folder and key folders.
 */
export function cwdOfCheck(placeCwd: string | undefined, specCwd: string | undefined): { cwd?: string } | { error: string } {
  if (!specCwd) return { cwd: placeCwd };
  if (!placeCwd) return { cwd: expand(specCwd) };
  const root = resolve(placeCwd);
  const cwd = resolve(root, expand(specCwd));
  if (cwd !== root && !cwd.startsWith(root + "/")) return { error: `a check runs in the task's place (${placeCwd}); ${specCwd} is outside it` };
  return { cwd };
}

// What a task hears when its own wait ends, in the language of the wait's reason (D292; ko → en).
const W = {
  zh: {
    time: "到时间了：「{reason}」。接着做。",
    over: "等到了：「{reason}」。接着做。",
    overSeen: "等到了：「{reason}」（{seen}）。接着做。",
    deadline: "等到最后也没等到：{reason}",
    wont: "没等到：「{reason}」，{unmet}。看看接下来怎么做。",
    // D483: a wait that ran out, or whose look can't be read, is handed back with what it saw.
    ranOut: "没等到：「{reason}」到 {until} 还没成立，现在什么都没在等。{facts}\n接下来由你判断：还值得等就用 wait_for 重新设一个（给 untilISO；查看只读你需要的那部分，比如 gh api … --jq），不用等了就接着做；只有用户能决定时，用 report_to_main 报 needs_input。",
    cantTell: "没等到：「{reason}」，这次查看判断不了：{why}。现在什么都没在等。{facts}\n接下来由你判断：自己看一眼现在的情况，需要的话用 wait_for 换一个读得出来的查看（只读你需要的那部分，比如 gh api … --jq），或者接着做。",
    facts: "查看：{check}。最近几次看到：{looks}。",
    // D429: a task in rounds: a round's end is progress, never done (Ducter brings the next one).
    round: "这是循环里的一轮：这一轮做完，用 report_to_main 报 progress，不要报 done；下一轮到时 Ducter 会叫你。",
    roundUntil: "这是循环里的一轮：这一轮做完，用 report_to_main 报 progress；只有「{until}」已经成立时才报 done。下一轮到时 Ducter 会叫你。",
    // D528: the person's clock, not the server's: a round's times are said in it.
    roundNow: "对方那里现在是 {now}。写给对方的时间都按对方的时区，或者说「45 分钟后」，不写 UTC。",
  },
  en: {
    time: 'It\'s time: "{reason}". Carry on.',
    over: 'The wait is over: "{reason}". Carry on.',
    overSeen: 'The wait is over: "{reason}" ({seen}). Carry on.',
    deadline: "Waited until the deadline: {reason}",
    wont: 'This won\'t happen: "{reason}": {unmet}. Decide what to do next.',
    ranOut: 'The wait ran out: "{reason}" still didn\'t hold at {until}, and nothing is waiting now. {facts}\nDecide what is next: if it is still worth waiting for, call wait_for again (with untilISO, and a look that reads only what you need, e.g. gh api … --jq); if not, carry on; report needs_input only when the user alone can decide.',
    cantTell: 'The wait ended: "{reason}": its look can\'t tell: {why}. Nothing is waiting now. {facts}\nDecide what is next: look at it yourself now, and if you still need to wait, call wait_for with a look that can be read (only what you need, e.g. gh api … --jq), or carry on.',
    facts: "Its look: {check}. Its latest looks saw: {looks}.",
    round: "This is one round of your rounds: when it is done, report_to_main with state progress, never done; Ducter wakes you for the next one.",
    roundUntil: 'This is one round of your rounds: when it is done, report_to_main with state progress; report done only once "{until}" holds. Ducter wakes you for the next one.',
    roundNow: 'It is {now} where the person is. Write every time they read in their time zone, or as "in 45 minutes"; never UTC.',
  },
};
const wordsOf = (reason: string) => words(W, langOfText(reason));

/** D297: the words a task gets when its agent's limit has reset, in the language of the wait's
 *  reason (protocol transcript.ts reads them back). */
const LIMIT_WAKE = { zh: "{agent} 的额度恢复了，接着做刚才没做完的。", en: "{agent}'s usage limit has reset. Carry on where you left off." };
export const limitWake = (harness: string, reason: string) => fill(words(LIMIT_WAKE, langOfText(reason)), { agent: harnessName(harness) });

/** D261: a wait's reason written as an agent's notes, not words ("requests仍4+mentions7去重9…45minwait"):
 *  two or more words glued to numbers, or numbers glued to words, with no space ("mentions7",
 *  "45minwait"). Units people write ("41ms", "2x", "arm64") don't count. Returns the first such
 *  token, or "". A heuristic: INFERRED from one live case, kept narrow on purpose. */
export function shorthand(reason: string): string {
  const units = /^(\d+(ms|s|m|h|d|x|k|kb|mb|gb|tb|px|pt|min|mins|hrs?|nd|st|rd|th|am|pm|fps|gbps|mbps)|(arm|amd|x86|ipv|utf|sha|md|gpt|es|py|ios|macos|node|bun|go|php)\d+|v\d.*)$/i;
  const glued = reason.match(/[A-Za-z]{2,}\d+[A-Za-z]*|\d+[A-Za-z]{2,}/g) ?? [];
  const bad = glued.filter((t) => !units.test(t));
  return bad.length >= 2 ? bad[0]! : "";
}

/** D261: a check that only reads the clock: it says nothing about what is awaited. */
export function clockCheck(check: CheckSpec): boolean {
  const cmd = String(check.argv?.[0] ?? "").split("/").pop();
  return cmd === "date" || cmd === "sleep";
}

export function createWork(o: WorkOptions): Work {
  const { log, tasks, mcp } = o;

  const check = async (spec: CheckSpec, w: { taskId?: string }, outputMax?: number): Promise<CheckResult> => {
    const where = placeOfCheck(w.taskId ? tasks.get(w.taskId)?.place : undefined);
    const device = spec.device ?? where.device;
    const at = cwdOfCheck(where.cwd, spec.cwd);
    if ("error" in at) return { ok: false, met: false, summary: at.error, error: at.error };
    const cwd = at.cwd;
    if (device === "local") return runCheck({ ...spec, ...(cwd ? { cwd } : {}) }, { exec: o.exec, ...(outputMax ? { outputMax } : {}) });
    const link = o.workers?.()?.link(device);
    if (!link) return { ok: false, met: false, summary: `no device called ${device}`, error: "unknown device" };
    if (!link.online()) return { ok: false, met: false, summary: `${link.name} can't be reached`, error: "offline" };
    try {
      return await link.call<CheckResult>("check", { spec: { ...spec, ...(cwd ? { cwd } : {}) }, ...(outputMax ? { outputMax } : {}) }, 30_000);
    } catch (err) {
      return { ok: false, met: false, summary: (err as Error).message, error: (err as Error).message };
    }
  };
  /** Why an event can't be watched (an oo account, an MCP server), before any wait is set. */
  const eventRefusal = (ev: EventSpec): string | undefined => {
    const w = o.connections?.watchable?.(ev.connection);
    return w && !w.ok ? w.error : undefined;
  };
  const readEvent: WaiterDeps["readEvent"] = o.connections ? (spec, cp) => o.connections!.readTrigger(spec.connection, spec.service, spec.trigger, spec.config, cp) : undefined;

  /**
   * D245: one look of a change watch, no model. Files: names, sizes and modification times (a
   * folder's direct entries), on this computer. A command or a URL: its output through the check
   * rules; a failing one is an error, never a change. An app: one reading tool, as Ducter's own
   * look (a write is refused there).
   */
  const fetchWatch: WaiterDeps["fetchWatch"] = async (spec, w) => {
    if (spec.files) {
      const base = placeOfCheck(w.taskId ? tasks.get(w.taskId)?.place : undefined).cwd ?? homedir();
      const out: { path: string; size: number; mtime: number; folder?: boolean }[] = [];
      for (const f of spec.files) {
        const p = resolve(base, expand(f));
        const s = await stat(p).catch(() => undefined);
        if (!s) continue; // not there (yet): it shows as gone, or new when it comes
        if (!s.isDirectory()) {
          out.push({ path: f, size: s.size, mtime: Math.round(s.mtimeMs) });
          continue;
        }
        const names = (await readdir(p).catch(() => [] as string[])).filter((n) => !n.startsWith(".")).sort().slice(0, WATCH_MAX_ITEMS);
        for (const n of names) {
          const e = await stat(join(p, n)).catch(() => undefined);
          if (e) out.push({ path: `${f.replace(/\/$/, "")}/${n}`, size: e.isDirectory() ? 0 : e.size, mtime: Math.round(e.mtimeMs), ...(e.isDirectory() ? { folder: true } : {}) });
        }
      }
      return { ok: true, data: out };
    }
    if (spec.argv || spec.url) {
      const argv = spec.argv ?? urlArgv(spec.url!);
      const r = await check({ argv, ...(spec.cwd ? { cwd: spec.cwd } : {}), ...(spec.device ? { device: spec.device } : {}), succeedWhen: { exitCode: 0 } }, w, CHECK_MAX_OUTPUT);
      if (!r.ok) return { ok: false, error: r.error ?? r.summary };
      if (r.exitCode !== undefined && r.exitCode !== 0) return { ok: false, error: `${argv[0]} exited ${r.exitCode}: ${r.summary}` };
      return { ok: true, data: r.output ?? "" };
    }
    const t = spec.tool;
    if (!t) return { ok: false, error: "nothing to watch" };
    if (!o.connections) return { ok: false, error: "no connected apps here" };
    const r = await o.connections.read({ role: "watch" }, t.connection, t.action, t.input ?? {}, t.account);
    return r.ok ? { ok: true, data: r.result } : { ok: false, error: r.error };
  };

  const waiters = createWaiters({ log, clock: o.clock, check, readEvent, fetchWatch, minEveryMs: o.minEveryMs, judgeMinMs: o.judgeMinMs, restartLookMs: o.restartLookMs });
  const untils = createUntils({ log, tasks, runner: o.runner, check });
  const routines = createRoutines({ log, tasks, waiters, runner: o.runner, clock: o.clock, persona: o.persona, defaultZone: o.defaultZone });
  const owned = createOwned({ log, tasks, runner: o.runner, check, clock: o.clock, ...(o.ownedEveryMs ? { everyMs: o.ownedEveryMs } : {}) });
  // D528: a time as the person reads it, in their zone ("15:13"; another day: "2026-11-25 15:13", with the zone named).
  const localTime = (ms: number, from?: number): string => {
    const z = o.zone?.() ?? o.defaultZone;
    const tz = z ? { timeZone: z } : {};
    try {
      const hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...tz }).format(new Date(ms));
      const day = (t: number) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...tz }).format(new Date(t));
      const d = from !== undefined && day(ms) !== day(from) ? `${day(ms)} ` : "";
      return from !== undefined && z ? `${d}${hm} (${z})` : `${d}${hm}`;
    } catch {
      return new Date(ms).toISOString().slice(11, 16);
    }
  };
  const loops = createLoops({ log, tasks, waiters, runner: o.runner, workers: o.workers, clock: o.clock, lang: o.lang, zone: () => o.zone?.() ?? o.defaultZone, ...(o.loopsWhere ? { where: o.loopsWhere } : {}) });

  /** D483: what a wait's last looks saw (they are logged only when what they saw changed), oldest first. */
  const looksOf = (w: Bodies["waiter"]): string => {
    const looks = log
      .read({ stream: `task:${w.taskId}`, kinds: ["waiter_look"], limit: 400 })
      .filter((e) => (e.body as Bodies["waiter_look"]).waiterId === w.waiterId)
      .slice(-3)
      .map((e) => `${e.ts.slice(11, 16)} UTC ${(e.body as Bodies["waiter_look"]).summary}`);
    return looks.length ? looks.join("; ") : w.observed ?? "nothing yet";
  };

  /** D496: a task woken by its own wait hears where the PRs it owns stand (a request for changes from before included). */
  const withPRs = (taskId: string, text: string) => {
    const s = owned.standing(taskId);
    return s ? `${text}\n\n${s}` : text;
  };

  // A task's own wait: it rests on Waiting while armed, and carries on when the wait is over.
  const unsubscribe = log.subscribe((e) => {
    if (e.kind !== "waiter") return;
    const w = e.body as Bodies["waiter"];
    // D267: a timer wakes a task only when it is the task's own (wait_for with a time).
    if (!w.taskId || (kindOf(w) === "timer" && w.wakes !== "task")) return;
    const card = tasks.get(w.taskId);
    if (!card || !isActive(card.attention)) return;
    if (w.state === "armed") {
      if (card.attention !== "blocked") tasks.setState(w.taskId, "blocked", card.residency, w.reason);
    } else if (w.state === "fired") {
      if (card.attention === "blocked") tasks.setState(w.taskId, "working", card.residency);
      const c = wordsOf(w.reason);
      const timer = kindOf(w) === "timer";
      // D271: a bare number (a clock's epoch a check printed) tells the agent nothing: left out.
      const seen = w.observed?.trim() && !/^\d+$/.test(w.observed.trim()) ? w.observed.trim() : "";
      // D297: the agent's usage limit reset (or it is time to try again): the same session carries on.
      const wake = w.limit ? limitWake(w.limit.harness, w.reason) : fill(timer ? c.time : seen ? c.overSeen : c.over, { reason: w.reason, seen });
      // D429: a round of a task in rounds says how a round ends (progress; done only for the person's until).
      const loop = !w.limit ? loops.get(w.taskId) : undefined;
      const said = loop?.state === "on" ? `${wake}\n\n${loop.until ? fill(c.roundUntil, { until: loop.until }) : c.round}\n${fill(c.roundNow, { now: localTime((o.clock ?? realClock).now()) })}` : wake;
      const text = w.limit ? said : withPRs(w.taskId, said);
      const r = o.runner();
      // D427: a round that can't start (its computer asleep, the runner not up yet) is tried again by the keeper.
      if (!r) loops.wakeFailed(w.taskId, "the runner isn't up yet");
      else
        void r.send(w.taskId, text, undefined, "partner").then(() => loops.woke(w.taskId!)).catch((err) => {
          console.warn(`[work] could not wake ${w.taskId}: ${(err as Error).message}`);
          loops.wakeFailed(w.taskId!, (err as Error).message);
        });
    } else if (w.state === "expired" || (w.state === "cancelled" && w.cantTell)) {
      // D483: the task is told what happened, with what its looks saw, and decides; the person is
      // asked only when the task (or the partner) judges so. If it can't be told, its card says it.
      const c = wordsOf(w.reason);
      const facts = fill(c.facts, { check: w.check ? `${describeCheck(w.check)} (met when ${describePredicate(w.check.succeedWhen)})` : w.event ? `${w.event.service} ${w.event.trigger}` : "-", looks: looksOf(w) });
      const text = withPRs(w.taskId, w.cantTell ? fill(c.cantTell, { reason: w.reason, why: w.cantTell, facts }) : fill(c.ranOut, { reason: w.reason, until: w.until ?? "", facts }));
      const deadline = () => tasks.setState(w.taskId!, "needs_you", card.residency, fill(c.deadline, { reason: w.reason }));
      if (card.attention === "blocked") tasks.setState(w.taskId, "working", card.residency);
      const r = o.runner();
      if (!r) deadline();
      else
        void r.send(w.taskId, text, undefined, "partner").catch((err) => {
          console.warn(`[work] could not tell ${w.taskId} its wait ended: ${(err as Error).message}`);
          deadline();
        });
    } else if (w.state === "cancelled" && card.attention === "blocked" && !w.replacedBy) {
      tasks.setState(w.taskId, "working", card.residency);
      // D144: it can no longer come true: the task hears why and decides what is next.
      if (w.unmet && e.origin === "waiter") {
        const text = withPRs(w.taskId, fill(wordsOf(w.reason).wont, { reason: w.reason, unmet: w.unmet }));
        void o.runner()?.send(w.taskId, text, undefined, "partner").catch((err) => console.warn(`[work] could not wake ${w.taskId}: ${(err as Error).message}`));
      }
    }
  });

  // ---------- tools ----------
  // D479: inside every model family's schema limits (protocol/src/tool-schema.ts): Gemini refused
  // `oneOf: {type: "array"}` with no items, and so every Antigravity task. A value to match is
  // text: the check compares values as text too, so 200, true and null match "200", "true", "null".
  const S = { type: "string" } as const;
  /** The fields of a predicate, bare (failWhen and a routine's check say them again without words). */
  const predicateBare = { exitCode: { type: "number" }, path: S, equals: S, oneOf: { type: "array", items: S }, contains: S, matches: S, any: { type: "boolean" } };
  const predicateProps = {
    ...predicateBare,
    path: { type: "string", description: 'JSON path into stdout; "[]" maps over an array (every item must match unless any)' },
    equals: { type: "string", description: "As text (200, true, null match as text)" },
  };
  /** A check's shape without its examples: where a description elsewhere already says how. */
  const checkBare = { type: "object", properties: { argv: { type: "array", items: S }, device: S, cwd: S, succeedWhen: { type: "object", properties: predicateBare }, failWhen: { type: "object", properties: predicateBare } }, required: ["argv", "succeedWhen"] };
  const checkSchema = {
    type: "object",
    description:
      'A read-only command (argv, no shell) and what counts as met. Examples: PR checks green {"argv":["gh","pr","checks","1592","--repo","nowledge-co/hawdb","--json","state"],"succeedWhen":{"path":"[].state","equals":"SUCCESS"}}; ' +
      'PR merged {"argv":["gh","pr","view","1592","--repo","o/r","--json","state"],"succeedWhen":{"path":"state","equals":"MERGED"}}; ' +
      'a page is up {"argv":["curl","-sI","https://example.com"],"succeedWhen":{"matches":"^HTTP/\\\\S+ 200"}}; a file exists {"argv":["test","-f","~/out/report.pdf"],"succeedWhen":{"exitCode":0}}; a port is open {"argv":["nc","-z","localhost","5432"],"succeedWhen":{"exitCode":0}}. ' +
      "Allowed: gh (view/checks/list/status, api GET), curl (GET/HEAD, no body or output file), git (ls-remote, log, status, rev-parse, describe), test, stat, ls, cat, head, tail, wc, grep, nc -z, ping -c, dig, host, date, pgrep.",
    properties: {
      argv: { type: "array", items: { type: "string" } },
      device: { type: "string", description: 'Where it runs; default the task\'s device, else "local"' },
      cwd: { type: "string" },
      succeedWhen: { type: "object", properties: predicateProps },
      failWhen: {
        type: "object",
        properties: predicateBare,
        description: 'Same shape as succeedWhen: what shows it can no longer come true, so the wait ends instead of looking on. PR checks: {"path":"[].state","oneOf":["FAILURE","ERROR","CANCELLED"],"any":true}. Give unmetSays with it.',
      },
    },
    required: ["argv", "succeedWhen"],
  };
  const eventSchema = {
    type: "object",
    description:
      'New items from one of the user\'s OpenConnector triggers, e.g. new mail {"connection":"OOMOL","service":"gmail","trigger":"gmail.on_message_received","contains":"renew"}. Use with judge when only meaning can tell (is this the renewal email?).',
    properties: { connection: { type: "string" }, service: { type: "string" }, trigger: { type: "string" }, config: jsonText("The trigger's config, when its guide asks for one"), contains: { type: "string" } },
    required: ["connection", "service", "trigger"],
  };

  const timerFor = (taskId: string, reason: string, a: { afterMinutes?: number; atISO?: string }) => {
    const notes = shorthand(reason);
    if (notes) return { ok: false, error: `reason is shown to the person as written, after 等 / Waiting until: write it as plain words in their language (再看一轮评审 / look at the reviews again), not notes like "${notes}".` };
    if (!tasks.get(taskId)) return { ok: false, error: `unknown task ${taskId}` };
    const now = (o.clock ?? realClock).now();
    let at: number;
    if (a.atISO) {
      at = Date.parse(a.atISO);
      if (Number.isNaN(at)) return { ok: false, error: `could not read the time: ${a.atISO}` };
    } else at = now + Math.max(1, Number(a.afterMinutes)) * 60_000;
    if (at <= now) return { ok: false, error: "that time is already past" };
    if (at - now > 7 * 86_400_000) return { ok: false, error: "at most 7 days ahead; for longer, report blocked with what you wait for" };
    // D427: the person set this task's rhythm ("改成每小时"): its rounds follow it, whatever the task asked.
    const rhythm = loops.rhythm(taskId);
    if (rhythm && !a.atISO) at = now + rhythm;
    try {
      // D394: a task has one timer of its own, the newest. A round started by another wake (a
      // nudge, a compaction, a restart's re-run) re-arms it instead of starting a second cadence
      // (seen live: three timers 3 and 12 min apart, so a "45 min" review ran every few minutes).
      const before = waiters.views().filter((v) => v.taskId === taskId && v.wakes === "task" && !v.limit && kindOf(v) === "timer");
      const w = waiters.arm({ reason, taskId, at: new Date(at).toISOString(), wakes: "task" });
      for (const v of before) waiters.cancel(v.waiterId, { by: "task", replacedBy: w.waiterId });
      return {
        ok: true,
        waiterId: w.waiterId,
        at: w.at,
        // D528: the time as the person reads it; `at` is UTC and is never said to them.
        atLocal: localTime(at, now),
        ...(before.length ? { replaced: before.map((v) => v.at) } : {}),
        ...(rhythm ? { rhythm: `every ${Math.round(rhythm / 60_000)} min, as the person set it` } : {}),
        note:
          loops.get(taskId)?.state === "on"
            ? "Armed; it replaces any timer you had. If you tell the person when, say atLocal (their time) or \"in N minutes\", never UTC. End your turn now; you will be woken then, and nobody needs a report from a round that found nothing new. Ducter keeps this task going in rounds until the person says stop: a round's report never ends it."
            : "Armed; it replaces any timer you had. If you tell the person when, say atLocal (their time) or \"in N minutes\", never UTC. End your turn now; you will be woken then, and nobody needs a report from a round that found nothing new. To repeat, call wait_for again when you wake.",
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };

  const waitFor = async (a: { reason?: string; taskId?: string; check?: CheckSpec; event?: EventSpec; judge?: string; everyMinutes?: number; untilISO?: string; unmetSays?: string; afterMinutes?: number; atISO?: string }, ctx: { role: string; taskId?: string }) => {
    const taskId = ctx.role === "task" ? ctx.taskId : a.taskId;
    const reason = String(a.reason ?? "").trim();
    if (a.event) {
      try {
        const config = jsonArg(a.event.config, "event.config");
        a = { ...a, event: { ...a.event, ...(config ? { config } : { config: undefined }) } };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }
    if (!reason) return { ok: false, error: "wait_for needs reason: the condition in the user's words (在等 PR #1592 通过 / PR #1592 passes)." };
    // D267: a task's own timer ("look again in 45 minutes"): the task rests on Waiting and this
    // wakes it, durable across restarts; it is what a harness's own /loop or wakeup would do.
    if (!a.check && !a.event && ctx.role === "task" && taskId && (a.afterMinutes || a.atISO)) return timerFor(taskId, reason, a);
    if (!a.check && !a.event)
      return { ok: false, error: ctx.role === "task" ? "wait_for needs a check (a command), an event (a connection's trigger), or a time (afterMinutes / atISO)." : "wait_for needs a check (a command) or an event (a connection's trigger). For a time, use wait_until." };
    // D261: the reason is shown to the person as it is, on On hand and in the task.
    const notes = shorthand(reason);
    if (notes) return { ok: false, error: `reason is shown to the person as written, after 等 / Waiting until: write it as plain words in their language (PR #1592 的 CI 通过 / PR #1592's CI passes), not notes like "${notes}".` };
    // D261: a check is never a clock (seen live: `date -u +%s` against a regex of epoch seconds,
    // so On hand said nothing true about what it waited for, for two days).
    if (a.check && clockCheck(a.check)) return { ok: false, error: "a check isn't a clock: wait on the condition itself (the PR's checks, the file, the page) and set everyMinutes to how often to look." };
    if (taskId && !tasks.get(taskId)) return { ok: false, error: `unknown task ${taskId}` };
    if (a.check) {
      const v = validateCheck(a.check);
      if (!v.ok) return { ok: false, error: v.error };
    }
    const unwatchable = a.event ? eventRefusal(a.event) : undefined;
    if (unwatchable) return { ok: false, error: unwatchable };
    // Look once now: it may already hold, and the user hears what it sees today.
    const first = await waiters.dryRun({ reason, ...(a.check ? { check: a.check } : {}), ...(a.event ? { event: a.event } : {}), ...(a.judge ? { judge: a.judge } : {}), ...(taskId ? { taskId } : {}) });
    if (first.met) return { ok: true, met: true, now: first.summary, note: "It already holds; nothing was set. Tell the user in one line." };
    try {
      const w = waiters.arm({
        reason,
        ...(taskId ? { taskId } : {}),
        ...(a.check ? { check: a.check } : {}),
        ...(a.event ? { event: a.event } : {}),
        ...(a.judge ? { judge: a.judge } : {}),
        ...(a.everyMinutes ? { everyMs: a.everyMinutes * 60_000 } : {}),
        ...(a.untilISO ? { until: a.untilISO } : {}),
        ...(a.unmetSays && a.check?.failWhen ? { unmetSays: String(a.unmetSays) } : {}),
      });
      return {
        ok: true,
        waiterId: w.waiterId,
        now: first.summary,
        every: `${Math.round((w.everyMs ?? 0) / 60_000)} min`,
        ...(w.until ? { until: w.until } : {}),
        ...(w.check ? { check: `${describeCheck(w.check)} (met when ${describePredicate(w.check.succeedWhen)})` } : {}),
        // D496: a task that waits while it owns a PR sees where the PR stands (a wait for a merge
        // while a reviewer's request for changes stands can't come true; the task judges).
        ...(ctx.role === "task" && taskId && owned.standing(taskId) ? { yourPRs: owned.standing(taskId) } : {}),
        note:
          ctx.role === "task"
            ? "Armed. End your turn now; you will be woken when it holds."
            : "Armed; it looks without a model. Say once, in one short line, what you wait for and what it sees now. When it holds, a [wait over] line arrives.",
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };
  const waitForProps = {
    reason: { type: "string", description: "What is awaited, in the user's words and language, named as awaited, never as done (PR #1592 的 CI 通过 / PR #1592's CI passes; 域名续费的邮件 / the domain renewal email). Shown to them after 等 / Waiting until" },
    check: checkSchema,
    event: eventSchema,
    judge: { type: "string", description: "Only when code can't decide: a yes/no question a cheap model answers over what the check or event fetched (是不是域名续费的提醒邮件？). Rate-limited, only on change." },
    everyMinutes: { type: "number", description: "How often to look (default 5, at least 1). CI ≈ 2–5, mail ≈ 5, a page ≈ 15–60" },
    untilISO: { type: "string", description: "Stop waiting at this time (ISO); default a day for a task's wait, a week otherwise. Then, or when a look can't be read, whoever waits is told what the looks saw and decides" },
    unmetSays: { type: "string", description: "With check.failWhen: what happened if it can no longer come true, plain, in the user's language (有一项检查挂了 / a check failed). Shown on On hand after 没等到 / Didn't happen" },
  };
  mcp.register(
    "partner",
    "wait_for",
    "Wait for a condition, not a time: \"tell me when PR 1592 passes\", \"when the domain renewal email arrives\". Compile it into a check (a small read-only command, no model per look) or an event (a connection's trigger), plus judge only when meaning matters. Returns at once with what it sees now; a [wait over] line arrives when it holds (or [wait ran out] at untilISO). With taskId, that task rests on Waiting and carries on by itself when it holds.",
    { type: "object", properties: { ...waitForProps, taskId: { type: "string" } }, required: ["reason"] },
    (a, ctx) => waitFor(a, ctx),
  );
  mcp.register(
    "task",
    "wait_for",
    "Wait for something outside before going on (CI to finish, a deploy to be up, a file to appear): give the condition and a check. Or just a time (afterMinutes or atISO, no check): \"look at the reviews again in 45 minutes\"; call it again when you wake to repeat. You rest on Waiting with no turns spent, and a message wakes you, even after a restart. Use this instead of sleeping, polling in a loop, or your own wakeup or loop tools.",
    {
      type: "object",
      properties: {
        ...waitForProps,
        // research/124: the pair "中文 / English" in the shared description was copied as both, one after the other.
        reason: { type: "string", description: "What is awaited, in ONE language: the one the user writes in. Named as awaited, never as done: \"PR #1592's CI passes\" (a Chinese speaker reads \"PR #1592 的 CI 通过\"). Shown to them after \"Waiting until\"" },
        afterMinutes: { type: "number", description: "A time instead of a condition: wake me this many minutes from now (1 to 10080)" },
        atISO: { type: "string", description: "A time instead of a condition: wake me at this time (ISO)" },
      },
      required: ["reason"],
    },
    (a, ctx) => waitFor(a, ctx),
  );
  mcp.register(
    "partner",
    "wait_cancel",
    "Stop a wait you set: the user said never mind, or you can see it can no longer come true (a check failed, the PR was closed); then give unmet, so On hand keeps it for the day with Keep waiting.",
    { type: "object", properties: { waiterId: { type: "string" }, unmet: { type: "string", description: "Only when it can't come true: why, plain, in the user's language (有一项检查挂了 / a check failed)" } }, required: ["waiterId"] },
    async (a: { waiterId: string; unmet?: string }) => ({ ok: waiters.cancel(String(a.waiterId), { by: "partner", ...(a.unmet ? { unmet: String(a.unmet) } : {}) }) }),
  );
  mcp.register(
    "partner",
    "keep_going",
    'Make a task keep going until a condition holds: "一直修到 CI 绿" / "keep fixing until CI is green". After each of its turns the condition is judged (by check when given, else a cheap model over its report); if it doesn\'t hold yet, the next try starts by itself. Stops at the condition, maxTries (default 20), 3 tries without progress, or going in circles; then the user is asked. Open the task first (task_open), then call this with its id. Say it once in one line.',
    { type: "object", properties: { taskId: { type: "string" }, condition: { type: "string", description: "In the user's words" }, check: { ...checkBare, description: "Like wait_for's check" }, maxTries: { type: "number" } }, required: ["taskId", "condition"] },
    async (a: { taskId: string; condition: string; check?: CheckSpec; maxTries?: number }) => {
      try {
        const u = untils.start({ taskId: String(a.taskId), condition: String(a.condition ?? ""), ...(a.check ? { check: a.check } : {}), ...(a.maxTries ? { maxTries: a.maxTries } : {}) });
        return { ok: true, maxTries: u.maxTries, note: "Set. The tries run by themselves; you hear when it holds or stops." };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );
  const triggerSchema = {
    type: "object",
    description:
      'Time: {"kind":"time","every":"week","days":[1],"time":"09:00","zone":"personal","tz":"Asia/Shanghai"} (every: day | weekday | week (days 0=Sun..6) | month (dayOfMonth) | hours (hours)); zone "personal" for the user\'s own rhythm (follows them when they travel), "world" for things pinned to a place (market open, a team standup). ' +
      'Condition: {"kind":"condition","condition":"hawdb 的 nightly 挂了","check":{…},"everyMs":3600000} or with event/judge like wait_for. Fires each time it turns true. ' +
      'When something changes (no model, nothing spent until it does; the run is told what is new, updated, gone): {"kind":"condition","condition":"~/inbox 里有新文件","watch":{"files":["~/inbox"]},"everyMs":900000}; watch is one of files, argv (a reading command), url, tool {connection,action,input}; for a JSON list add path and key (fields naming an item).',
    // D479: every field named, so each model family can hold it (Gemini refuses an object with none).
    properties: {
      kind: { type: "string", enum: ["time", "condition"] },
      every: { type: "string", enum: ["day", "weekday", "week", "month", "hours", "once"] },
      date: { type: "string" },
      days: { type: "array", items: { type: "number" } },
      dayOfMonth: { type: "number" },
      hours: { type: "number" },
      time: { type: "string" },
      zone: { type: "string", enum: ["personal", "world"] },
      tz: { type: "string" },
      condition: { type: "string" },
      check: checkBare,
      event: { type: "object", properties: { connection: S, service: S, trigger: S, config: S, contains: S }, required: ["connection", "service", "trigger"] },
      judge: S,
      watch: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" } },
          argv: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
          device: { type: "string" },
          url: { type: "string" },
          tool: { type: "object", properties: { connection: { type: "string" }, action: { type: "string" }, input: jsonText("The action's input"), account: { type: "string" } }, required: ["connection", "action"] },
          path: { type: "string" },
          key: { type: "array", items: { type: "string" } },
          fields: { type: "array", items: { type: "string" } },
        },
      },
      everyMs: { type: "number" },
    },
    required: ["kind"],
  };
  /** D479: the trigger's free-form parts (an event's config, a watched action's input) come as JSON text. */
  const triggerArgs = (t: RoutineTrigger): RoutineTrigger => {
    if (t?.kind !== "condition") return t;
    const config = t.event ? jsonArg(t.event.config, "trigger.event.config") : undefined;
    const input = t.watch?.tool ? jsonArg(t.watch.tool.input, "trigger.watch.tool.input") : undefined;
    return {
      ...t,
      ...(t.event ? { event: { ...t.event, config } } : {}),
      ...(t.watch?.tool ? { watch: { ...t.watch, tool: { ...t.watch.tool, input } } } : {}),
    };
  };
  mcp.register(
    "partner",
    "routine_propose",
    "Only for recurring or watched work whose runs would post, send or change something without asking (anything that only reads or drafts is keep_make): \"whenever hawdb's nightly breaks, fix it and push\". Nothing runs until the user presses Go on the proposal card this makes (it shows the trigger in words, the next 5 firings or what the condition sees now, budget, how it reports, what it may touch). Each firing runs as a fresh task with the brief. Ask first only if what, when or where is unclear. After calling, say one short line; don't restate the card.",
    {
      type: "object",
      properties: {
        name: { type: "string", description: "Short, in the user's language (周报 / Weekly report)" },
        trigger: triggerSchema,
        triggerWords: { type: "string", description: "The trigger in the user's words and language (每周一 9:00 · 跟着你的时区)" },
        brief: { type: "string", description: "What each run does, self-contained (no reference to this conversation), with done-criteria" },
        place: {
          type: "object",
          description: "Where each run works (like task_open's place); omit for none",
          properties: { kind: { type: "string", enum: ["none", "repo", "folder", "browser"] }, device: { type: "string" }, repoPath: { type: "string" }, remote: { type: "string" }, path: { type: "string" }, profile: { type: "string" } },
          required: ["kind"],
        },
        reports: { type: "string", enum: ["every", "on_change", "needs_you"], description: "every for digests and reports the user asked for; on_change for watchers" },
        effect: { type: "string", enum: ["read_only", "drafts", "local_writes"], description: "What runs may touch; default read_only" },
        monthTokens: { type: "number", description: "Monthly token cap; default 2,000,000" },
      },
      required: ["name", "trigger", "brief"],
    },
    async (a: { name: string; trigger: RoutineTrigger; triggerWords?: string; brief: string; place?: Place; reports?: "every" | "on_change" | "needs_you"; effect?: "read_only" | "drafts" | "local_writes"; monthTokens?: number }) => {
      try {
        a = { ...a, trigger: triggerArgs(a.trigger) };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      const unwatchable = a.trigger?.kind === "condition" && a.trigger.event ? eventRefusal(a.trigger.event) : undefined;
      if (unwatchable) return { ok: false, error: unwatchable };
      try {
        const v = await routines.propose(a);
        return {
          ok: true,
          routineId: v.routineId,
          triggerWords: v.triggerWords,
          ...(v.upcoming ? { next: v.upcoming } : {}),
          ...(v.dryRun ? { now: v.dryRun.summary } : {}),
          note: "The proposal card is in front of the user. Say at most one short line that does not repeat the card (no times, no what, no buttons, never that it is on), e.g. 这样安排，你看看 / Here is how it would go. Then end your turn.",
        };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  return {
    waiters,
    untils,
    routines,
    loops,
    owned,
    frames: {
      zone: (tz) => routines.setUserZone(tz),
      waiter: (id, action) => (action === "look" ? waiters.look(id) : action === "rearm" ? Promise.resolve(waiters.rearm(id)) : action === "handoff" ? Promise.resolve(false) : Promise.resolve(waiters.cancel(id, { by: "user" }))),
      routine: (id, action) => (action === "pause" ? routines.pause(id, "user", "asked") : action === "resume" ? routines.resume(id) : routines.end(id)),
      until: (id) => untils.stop(id, "user"),
    },
    decorate(on) {
      const views = new Map(waiters.views().map((v) => [v.waiterId, v]));
      return {
        ...on,
        // A routine's own watch is shown on its routine card, not as a wait.
        waiters: on.waiters.filter((w) => !w.routineId).map((w) => views.get(w.waiterId) ?? w),
        routines: routines.views(),
        missed: waiters.missed(),
      };
    },
    wakes(e) {
      if (e.kind === "report") return !untils.active((e.body as Bodies["report"]).taskId) || (e.body as Bodies["report"]).state === "needs_input";
      return true;
    },
    setJudge(j) {
      waiters.setJudge(j);
      untils.setJudge(j);
    },
    stop() {
      unsubscribe();
      loops.stop();
      owned.stop();
      routines.stop();
      untils.stopAll();
      waiters.stop();
    },
  };
}
