// Work over time (D112–D115), wired: waiters (timer, check, event, judge), `until` loops,
// routines, the partner's and tasks' tools for them, the client frames, and On hand's view.
// See waiters.ts, until.ts, routines.ts for each mechanism.
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Bodies, CheckSpec, EventSpec, LogEvent, OnHand, Place, RoutineTrigger } from "@ducter/protocol";
import type { LogStore, Runner, WorkerLinks } from "@ducter/protocol/src/internal.ts";
import { describeCheck, describePredicate, validateCheck } from "@ducter/protocol/src/checks.ts";
import { runCheck, type CheckResult, type Exec } from "@ducter/protocol/src/checks-run.ts";
import type { Clock } from "./clock.ts";
import type { ConnectionsStore } from "./connections.ts";
import type { CoreMcpHub } from "./mcp.ts";
import { isActive, type CoreRegistry } from "./registry.ts";
import { createRoutines, type Routines } from "./routines.ts";
import { createUntils, type Untils } from "./until.ts";
import { createWaiters, kindOf, type Judge, type WaiterDeps, type Waiters } from "./waiters.ts";
import type { WorkFrames } from "./ws.ts";

export interface Work {
  waiters: Waiters;
  untils: Untils;
  routines: Routines;
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
  defaultZone?: string;
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

const zhOf = (s: string) => /[一-鿿]/.test(s);

export function createWork(o: WorkOptions): Work {
  const { log, tasks, mcp } = o;

  const check = async (spec: CheckSpec, w: { taskId?: string }): Promise<CheckResult> => {
    const where = placeOfCheck(w.taskId ? tasks.get(w.taskId)?.place : undefined);
    const device = spec.device ?? where.device;
    const at = cwdOfCheck(where.cwd, spec.cwd);
    if ("error" in at) return { ok: false, met: false, summary: at.error, error: at.error };
    const cwd = at.cwd;
    if (device === "local") return runCheck({ ...spec, ...(cwd ? { cwd } : {}) }, { exec: o.exec });
    const link = o.workers?.()?.link(device);
    if (!link) return { ok: false, met: false, summary: `no device called ${device}`, error: "unknown device" };
    if (!link.online()) return { ok: false, met: false, summary: `${link.name} can't be reached`, error: "offline" };
    try {
      return await link.call<CheckResult>("check", { spec: { ...spec, ...(cwd ? { cwd } : {}) } }, 30_000);
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

  const waiters = createWaiters({ log, clock: o.clock, check, readEvent, minEveryMs: o.minEveryMs, judgeMinMs: o.judgeMinMs, restartLookMs: o.restartLookMs });
  const untils = createUntils({ log, tasks, runner: o.runner, check });
  const routines = createRoutines({ log, tasks, waiters, runner: o.runner, clock: o.clock, persona: o.persona, defaultZone: o.defaultZone });

  // A task's own wait: it rests on Waiting while armed, and carries on when the wait is over.
  const unsubscribe = log.subscribe((e) => {
    if (e.kind !== "waiter") return;
    const w = e.body as Bodies["waiter"];
    if (!w.taskId || kindOf(w) === "timer") return;
    const card = tasks.get(w.taskId);
    if (!card || !isActive(card.attention)) return;
    if (w.state === "armed") {
      if (card.attention !== "blocked") tasks.setState(w.taskId, "blocked", card.residency, w.reason);
    } else if (w.state === "fired") {
      if (card.attention === "blocked") tasks.setState(w.taskId, "working", card.residency);
      const zh = zhOf(w.reason);
      const text = zh ? `等到了：「${w.reason}」${w.observed ? `（${w.observed}）` : ""}。接着做。` : `The wait is over: "${w.reason}"${w.observed ? ` (${w.observed})` : ""}. Carry on.`;
      void o.runner()?.send(w.taskId, text, undefined, "partner").catch((err) => console.warn(`[work] could not wake ${w.taskId}: ${(err as Error).message}`));
    } else if (w.state === "expired") {
      const zh = zhOf(w.reason);
      tasks.setState(w.taskId, "needs_you", card.residency, zh ? `等到最后也没等到：${w.reason}` : `Waited until the deadline: ${w.reason}`);
    } else if (w.state === "cancelled" && card.attention === "blocked") {
      tasks.setState(w.taskId, "working", card.residency);
      // D144: it can no longer come true: the task hears why and decides what is next.
      if (w.unmet && e.origin === "waiter") {
        const zh = zhOf(w.reason);
        const text = zh ? `没等到：「${w.reason}」，${w.unmet}。看看接下来怎么做。` : `This won't happen: "${w.reason}": ${w.unmet}. Decide what to do next.`;
        void o.runner()?.send(w.taskId, text, undefined, "partner").catch((err) => console.warn(`[work] could not wake ${w.taskId}: ${(err as Error).message}`));
      }
    }
  });

  // ---------- tools ----------
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
      succeedWhen: {
        type: "object",
        properties: {
          exitCode: { type: "number" },
          path: { type: "string", description: 'JSON path into stdout; "[]" maps over an array (every item must match unless any)' },
          equals: {},
          oneOf: { type: "array" },
          contains: { type: "string" },
          matches: { type: "string" },
          any: { type: "boolean" },
        },
      },
      failWhen: {
        type: "object",
        description: 'Same shape as succeedWhen: what shows it can no longer come true, so the wait ends instead of looking on. PR checks: {"path":"[].state","oneOf":["FAILURE","ERROR","CANCELLED"],"any":true}. Give unmetSays with it.',
      },
    },
    required: ["argv", "succeedWhen"],
  };
  const eventSchema = {
    type: "object",
    description:
      'New items from one of the user\'s OpenConnector triggers, e.g. new mail {"connection":"OOMOL","service":"gmail","trigger":"gmail.on_message_received","contains":"renew"}. Use with judge when only meaning can tell (is this the renewal email?).',
    properties: { connection: { type: "string" }, service: { type: "string" }, trigger: { type: "string" }, config: { type: "object" }, contains: { type: "string" } },
    required: ["connection", "service", "trigger"],
  };

  const waitFor = async (a: { reason?: string; taskId?: string; check?: CheckSpec; event?: EventSpec; judge?: string; everyMinutes?: number; untilISO?: string; unmetSays?: string }, ctx: { role: string; taskId?: string }) => {
    const taskId = ctx.role === "task" ? ctx.taskId : a.taskId;
    const reason = String(a.reason ?? "").trim();
    if (!reason) return { ok: false, error: "wait_for needs reason: the condition in the user's words (在等 PR #1592 通过 / PR #1592 passes)." };
    if (!a.check && !a.event) return { ok: false, error: "wait_for needs a check (a command) or an event (a connection's trigger). For a time, use wait_until." };
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
    untilISO: { type: "string", description: "Give up at this time (ISO); the user is asked then. Default none; set one for anything that may never happen" },
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
    "Wait for something outside before going on (CI to finish, a deploy to be up, a file to appear): give the condition and a check. You rest on Waiting with no turns spent, and a message wakes you when it holds. Never sleep or poll in a loop yourself.",
    { type: "object", properties: waitForProps, required: ["reason"] },
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
    { type: "object", properties: { taskId: { type: "string" }, condition: { type: "string", description: "In the user's words" }, check: checkSchema, maxTries: { type: "number" } }, required: ["taskId", "condition"] },
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
      'Condition: {"kind":"condition","condition":"hawdb 的 nightly 挂了","check":{…},"everyMs":3600000} or with event/judge like wait_for. Fires each time it turns true.',
  };
  mcp.register(
    "partner",
    "routine_propose",
    "Propose a routine (例行) for recurring or watched work: \"每周一早上 9 点给我周报\", \"whenever hawdb's nightly breaks, tell me\". Nothing runs until the user presses Go on the proposal card this makes (it shows the trigger in words, the next 5 firings or what the condition sees now, budget, how it reports, what it may touch). Each firing runs as a fresh task with the brief. Ask first only if what, when or where is unclear. After calling, say one short line; don't restate the card.",
    {
      type: "object",
      properties: {
        name: { type: "string", description: "Short, in the user's language (周报 / Weekly report)" },
        trigger: triggerSchema,
        triggerWords: { type: "string", description: "The trigger in the user's words and language (每周一 9:00 · 跟着你的时区)" },
        brief: { type: "string", description: "What each run does, self-contained (no reference to this conversation), with done-criteria" },
        place: { type: "object", description: "Where each run works (like task_open's place); omit for none" },
        reports: { type: "string", enum: ["every", "on_change", "needs_you"], description: "every for digests and reports the user asked for; on_change for watchers" },
        effect: { type: "string", enum: ["read_only", "drafts", "local_writes"], description: "What runs may touch; default read_only" },
        monthTokens: { type: "number", description: "Monthly token cap; default 2,000,000" },
      },
      required: ["name", "trigger", "brief"],
    },
    async (a: { name: string; trigger: RoutineTrigger; triggerWords?: string; brief: string; place?: Place; reports?: "every" | "on_change" | "needs_you"; effect?: "read_only" | "drafts" | "local_writes"; monthTokens?: number }) => {
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
  mcp.register(
    "partner",
    "routine_pause",
    "Pause a routine (the user asked, or its reports go unread). Only the user can resume it, from its card.",
    { type: "object", properties: { routineId: { type: "string" } }, required: ["routineId"] },
    async (a: { routineId: string }) => ({ ok: routines.pause(String(a.routineId), "partner", "asked") }),
  );
  mcp.register("partner", "routine_list", "The user's routines: name, trigger in words, state, next firing, latest run.", { type: "object", properties: {} }, async () =>
    routines.views().map((v) => ({ routineId: v.routineId, name: v.name, triggerWords: v.triggerWords, state: v.state, ...(v.pauseReason ? { pauseReason: v.pauseReason } : {}), ...(v.nextAt ? { nextAt: v.nextAt } : {}), ...(v.lastRun ? { lastRun: { state: v.lastRun.state, taskId: v.lastRun.taskId, at: v.lastRun.at } } : {}) })),
  );

  return {
    waiters,
    untils,
    routines,
    frames: {
      zone: (tz) => routines.setUserZone(tz),
      waiter: (id, action) => (action === "look" ? waiters.look(id) : action === "rearm" ? Promise.resolve(waiters.rearm(id)) : Promise.resolve(waiters.cancel(id, { by: "user" }))),
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
      routines.stop();
      untils.stopAll();
      waiters.stop();
    },
  };
}
