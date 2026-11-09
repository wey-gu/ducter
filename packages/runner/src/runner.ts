import { randomBytes } from "node:crypto";
import { HARNESS_IDS, harnessName, type Attention, type Bodies, type BranchChanges, type Delivery, type EvidenceRef, type LogEvent, type Place, type Residency, type TaskCard } from "@ducter/protocol";
import type { CoreApi, HarnessEvent, HarnessPort, HarnessSession, Runner, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { NUDGE, PRECOMPACT_NOTE, REOPENED, RESUME_AFTER_RESTART, SAVE_BEFORE_COMPACT, afterCompaction, briefTurn, handedOver, kickoff, seedThen, startedAfresh, taskBrief } from "./brief.ts";
import { resolveWindows, saveBeforeAt } from "@ducter/protocol/src/harness-facts.ts";
import { createOarHarnessPort } from "./oar.ts";
import { cwdOf, planPlace, provisionPlace } from "./places.ts";
import { browserSidecar, codexComputerBrief, computerUseGuard, type BrowserGuardHit, type BrowserOptions, type BrowserSidecar, type BrowserTool, type SidecarInput } from "./browser.ts";
import { checkEvidence } from "./evidence.ts";
import { PREVIEW_MAX, preview } from "./normalize.ts";
import { archiveWorktree, branchChanges, mergeTaskBranch, openDraftPr, type ActionResult } from "./integrate.ts";
import { DEVICE_BACK, DeviceOfflineError, deviceOf, isOffline, remoteOps, type PlaceOps } from "./remote.ts";

/** task_state reason for a task whose worker dropped; clients render it as "<device> 连不上 / Can't reach <device>". */
export const unreachableReason = (device: string) => `device:unreachable:${device}`;

type HarnessId = SessionSpec["harness"];
type From = NonNullable<Bodies["task_event"]["from"]>;
const HARNESSES: readonly HarnessId[] = HARNESS_IDS;

export interface RunnerOptions {
  harness?: HarnessPort; // default: OAR
  defaultHarness?: HarnessId;
  defaultModel?: string; // default env DUCTER_TASK_MODEL; else the harness default
  gh?: string; // GitHub CLI binary (tests)
  isolateUserConfig?: boolean; // tasks keep the user's own harness setup by default (system.md)
  partnerName?: string; // default core.persona.name
  newId?: () => string;
  now?: () => Date;
  browser?: BrowserOptions; // browser places: env gate and test seams
  taskModel?: string; // default model when the partner passes none (default env DUCTER_TASK_MODEL)
  /** How long a worker may be gone before its working tasks show as waiting (D52: 2 min). */
  offlineGraceMs?: number;
  /**
   * How long an idle session stays warm before it is parked: the harness process is closed and
   * the next input resumes it by session id (focus-window-states: warm -> parked, 15 min).
   * Without it every task that ever ran kept its harness process until the main restarted.
   * 0 = never park. Default env DUCTER_PARK_IDLE_MS, else 15 min.
   */
  parkIdleMs?: number;
  /**
   * The archive horizon: a finished task idle this long is archived (focus-window-states,
   * default 14 days; env DUCTER_ARCHIVE_IDLE_MS). 0 = never. Checked at start and every
   * archiveSweepMs (default 1 h).
   */
  archiveIdleMs?: number;
  archiveSweepMs?: number;
}

/** Runner plus test/ops helpers that are not part of the contract. */
export interface RunnerExt extends Runner {
  /** Resolves when the task's session is started and its first turn sent (or provisioning failed). */
  whenStarted(taskId: string): Promise<void>;
  /** Native session id of a task (for resume), if started. */
  sessionId(taskId: string): string | undefined;
  /** Resume (or start) the session of a finished or dropped task and tell it to carry on. */
  reopen(taskId: string): Promise<{ delivered: Delivery }>;
  undrop(taskId: string): Promise<ActionResult>;
  merge(taskId: string): Promise<ActionResult>;
  openPr(taskId: string): Promise<ActionResult>;
  /** What the task's branch holds that its base doesn't; undefined when not a repo task or unknown. */
  branchChanges(taskId: string): Promise<BranchChanges | undefined>;
  /** A done report's evidence with `check` set where it can be checked here (evidence.ts); a worker's task: unchecked. */
  checkEvidence(taskId: string, evidence: EvidenceRef[]): Promise<EvidenceRef[]>;
  /** Archives finished tasks idle past the archive horizon now; returns their ids (the timer runs it too). */
  sweepArchive(): Promise<string[]>;
  /** Alias of dispose, called by main on shutdown. */
  stop(): Promise<void>;
  /** Close all sessions and stop listening. */
  dispose(): Promise<void>;
}

interface TaskRt {
  id: string;
  persona: string;
  card: TaskCard;
  /** What a session starts with: `base` plus the browser's parts (withBrowser), rebuilt in startSession. */
  spec: SessionSpec;
  /** The spec without any browser parts: who does it, the brief, the place's cwd. */
  base: SessionSpec;
  session?: HarnessSession;
  sessionId?: string;
  loggedSessionId?: string;
  /** Moved to another agent (D89) and no session there yet: the harness it came from. */
  handedFrom?: string;
  /** The archive horizon kept its worktree (leftovers) at this card updatedAt: don't retry until it changes. */
  archiveKeptAt?: string;
  running: boolean; // our view: a turn is in flight
  reportedThisTurn: boolean;
  nudged: boolean;
  stallNoted: boolean;
  interruptRequested?: boolean; // the user stopped the current turn
  dropped: boolean;
  attention: Attention;
  residency: Residency;
  started: Promise<void>;
  sidecar?: BrowserSidecar; // browser place
  guard?: (tool: BrowserTool) => BrowserGuardHit | undefined; // Codex Computer Use outside a browser place (D130)
  sidecarInput?: SidecarInput; // what built it (a native browser that says no is rebuilt on cua-driver)
  retired?: HarnessSession; // a session closed on purpose mid-turn: its late events are ignored
  ops: PlaceOps; // where the place lives: this machine or a worker (remote.ts)
  resumeOnBack?: boolean; // its worker dropped mid-work: resume when the worker is back
  offlineTimer?: ReturnType<typeof setTimeout>;
  parkTimer?: ReturnType<typeof setTimeout>;
  offlineOff?: () => void;
  // D135: the harness compacted this many times; asked to save before the next one; what the
  // next turn starts with (the save ask, the brief and progress again after a compaction).
  compactions: number;
  saveAsked: boolean;
  prefix: string[];
  context?: number; // the harness's last context reading
}

/** The turn after a browser driver switch (D130): same task, now on Ducter's own browser. */
export const SWITCHED_TO_CUA =
  "Claude in Chrome is not connected, so Ducter moved you to its own browser: the `browser` MCP server, as \"Your browser\" in your instructions now describes. Do not use the Claude in Chrome tools again. Carry on with the task from where you were.";

/**
 * A task's spec with its browser's parts (D62, D126, D130): the browser brief (its Go, untrusted
 * page and own-window rules), the cua-driver sidecar, and per harness a setup that leaves the
 * user's own config out: Claude Code its curated built-ins and `exclude`; Codex the clean setup
 * that keeps its own browser and Computer Use plugins; pi its clean flags. DeepSeek Harness keeps
 * its own setup (its clean home is the partner's). Every Codex task without Codex's own browser
 * gets the Computer Use rules (its Computer Use stays on).
 */
export function withBrowser(base: SessionSpec, sc: BrowserSidecar | undefined, partnerName: string): SessionSpec {
  const spec: SessionSpec = { ...base, mcp: [...base.mcp] };
  const h = spec.harness;
  if (sc) {
    spec.appendSystemPrompt = (spec.appendSystemPrompt ?? "") + sc.brief;
    if (sc.mcp) spec.mcp.push(sc.mcp);
    if (h === "claude-code") Object.assign(spec, sc.claude);
    if (h === "codex") spec.userConfiguration = "exclude";
    if (h === "pi") spec.isolateUserConfig = true;
  }
  if (h === "codex" && sc?.driver !== "native") spec.appendSystemPrompt = (spec.appendSystemPrompt ?? "") + codexComputerBrief(partnerName);
  return spec;
}

const REPORT_ATTENTION: Record<Bodies["report"]["state"], Attention> = {
  progress: "working",
  needs_input: "needs_you",
  blocked: "blocked",
  done: "done_claimed",
  failed: "failed",
};

export function shortId(): string {
  // 8 chars of base32-ish lowercase; collision-safe enough for one persona's task list.
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

export function createRunner(core: CoreApi, opts: RunnerOptions = {}): RunnerExt {
  const harness = opts.harness ?? createOarHarnessPort({ dataDir: core.dataDir });
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? shortId;
  const tasks = new Map<string, TaskRt>();
  const graceMs = opts.offlineGraceMs ?? Number(process.env.DUCTER_OFFLINE_GRACE_MS || 120_000);
  const parkMs = opts.parkIdleMs ?? Number(process.env.DUCTER_PARK_IDLE_MS || 15 * 60_000);
  const archiveIdleMs = opts.archiveIdleMs ?? Number(process.env.DUCTER_ARCHIVE_IDLE_MS ?? 14 * 24 * 3600_000);
  const localOps: PlaceOps = {
    plan: (place, id, title) => planPlace(place, id, title, core.dataDir),
    provision: (r) => provisionPlace(r),
    harness,
    merge: (place) => mergeTaskBranch(place),
    openPr: (place) => openDraftPr(place, { gh: opts.gh }),
    changes: (place) => branchChanges(place),
    archive: (place) => archiveWorktree(place, core.dataDir),
  };
  /** A paired worker's ops when the place names one; any other name (e.g. "mac") is this machine. */
  function opsFor(place: Place | undefined): PlaceOps {
    const device = deviceOf(place);
    const link = device ? core.workers?.link(device) : undefined;
    return link ? remoteOps(link) : localOps;
  }

  const unsubscribe = core.log.subscribe((e: LogEvent) => {
    if (e.kind !== "report") return;
    const body = e.body as Bodies["report"];
    const t = tasks.get(body.taskId);
    if (!t) return;
    t.reportedThisTurn = true;
    t.attention = REPORT_ATTENTION[body.state] ?? t.attention;
  });

  const stream = (id: string) => `task:${id}`;
  const taskWindows = () => (core.settings?.get().windows ?? resolveWindows(undefined, process.env).windows).tasks;

  function setState(t: TaskRt, attention: Attention, residency: Residency, reason?: string) {
    if (t.attention === attention && t.residency === residency && !reason) return;
    t.attention = attention;
    t.residency = residency;
    core.tasks.setState(t.id, attention, residency, reason);
  }

  /** Attention as core sees it (reports/decisions may have moved it), else our own view. */
  function currentAttention(t: TaskRt): Attention {
    return core.tasks.get(t.id)?.attention ?? t.attention;
  }

  function logEvent(t: TaskRt, ev: Omit<Bodies["task_event"], "taskId">) {
    core.log.append({ persona: t.persona, stream: stream(t.id), origin: "task", kind: "task_event", body: { taskId: t.id, ...ev } });
  }

  function isBusy(t: TaskRt): boolean {
    const s = t.session;
    if (s) {
      try {
        return Boolean(s.busy());
      } catch {
        /* fall through */
      }
    }
    return t.running;
  }

  /** Idle and warm: park it after parkMs (the next input resumes it by session id). */
  function armPark(t: TaskRt) {
    clearTimeout(t.parkTimer);
    t.parkTimer = undefined;
    if (!(parkMs > 0)) return;
    t.parkTimer = setTimeout(() => void park(t), parkMs);
  }
  async function park(t: TaskRt) {
    t.parkTimer = undefined;
    const s = t.session;
    // Only a session that can be resumed: without its id, closing it would lose the task.
    if (!s || !t.sessionId || t.dropped || isBusy(t)) return;
    t.session = undefined; // first: input arriving from now on resumes instead of using it
    t.running = false;
    setState(t, currentAttention(t), "parked");
    await s.close().catch(() => {});
  }

  async function sendTurn(t: TaskRt, text: string, from: From, logged = false) {
    clearTimeout(t.parkTimer);
    t.running = true;
    setState(t, "working", "hot");
    await deliver(t, text, "turn", from, logged);
  }

  // clientId: the client's id for a user's task_send, so core can tell a resend from a new message.
  const logInput = (t: TaskRt, text: string, from: From, mode: string, clientId?: string) =>
    logEvent(t, { role: "user", from, text: preview(text, 16 * 1024), ...(clientId ? { clientId } : {}), raw: { delivered: mode } });

  /** Logs the text first (the Log is the record even if delivery fails), then delivers it. */
  async function deliver(t: TaskRt, text: string, mode: "turn" | "steer" | "queue", from: From, logged = false) {
    // D135: what waits for the next turn (the save ask; the brief and progress after a
    // compaction) goes first, logged as the runner's own words.
    let sent = text;
    if (mode === "turn" && t.prefix.length) {
      const pre = t.prefix.splice(0).join("\n\n");
      logInput(t, pre, "runner", "prefix");
      sent = `${pre}\n\n---\n\n${text}`;
    }
    if (!logged) logInput(t, text, from, mode);
    try {
      await t.session!.send(sent, mode);
    } catch (err) {
      if (mode === "turn") t.running = false;
      logEvent(t, { role: "system", from: "runner", text: `delivery failed: ${preview(String(err), 500)}` });
      throw err;
    }
  }

  /** Records the native session id once known, so a restarted runner can resume it. */
  function noteSessionId(t: TaskRt, session: HarnessSession) {
    // Only the task's current session: a closing old one (after a switch) must not put its id back.
    if (t.session !== session) return;
    let id: string | undefined;
    try {
      id = session.id || undefined;
    } catch {
      /* some sessions learn their id later */
    }
    if (!id || id === t.loggedSessionId) return;
    t.sessionId = id;
    t.loggedSessionId = id;
    t.handedFrom = undefined; // the new agent has its own session now
    // On a worker, the cwd was planned there: record it, a restarted main resumes from it.
    logEvent(t, { role: "system", from: "runner", text: "session started", raw: { sessionId: id, ...(t.ops.device ? { cwd: t.spec.cwd, device: t.ops.device.id } : {}) } });
  }

  const partnerNameOf = () => opts.partnerName ?? core.persona.name ?? "Ducter";

  /**
   * Before every session start (open, recovery after a restart, reopen, resume, a switch of who
   * does it): a browser place has its browser for the harness doing it now, and the spec is
   * rebuilt from `base` with it. Throws (with the reason the partner tells) when the browser is
   * unavailable.
   */
  async function prepareSpec(t: TaskRt) {
    const h = t.base.harness;
    if (t.card.place?.kind === "browser" && !t.ops.device && (!t.sidecar || t.sidecarInput?.harness !== h)) {
      const prev = t.sidecarInput?.harness === h ? t.sidecarInput : undefined;
      const input: SidecarInput = { place: t.card.place, persona: t.persona, taskId: t.id, dataDir: core.dataDir, partnerName: partnerNameOf(), harness: h, ...(prev?.forceCua ? { forceCua: true } : {}) };
      const sc = await browserSidecar(input, opts.browser);
      if (!sc) throw new Error("this browser place could not be prepared");
      await sc.ready();
      t.sidecar = sc;
      t.sidecarInput = input;
    }
    t.guard = h === "codex" ? (t.guard ?? computerUseGuard({ chromeOnly: true })) : undefined;
    t.spec = withBrowser(t.base, t.sidecar, partnerNameOf());
  }

  async function startSession(t: TaskRt, resume: boolean) {
    await prepareSpec(t);
    const spec: SessionSpec = resume && t.sessionId ? { ...t.spec, resumeSessionId: t.sessionId } : t.spec;
    const session = await t.ops.harness.start(spec);
    t.session = session;
    if (!spec.resumeSessionId) (t.context = undefined), (t.saveAsked = false); // a fresh context
    noteSessionId(t, session);
    void pump(t, session);
  }

  /** Every checkpoint the task saved, oldest first: what a new session is seeded with. */
  function progressOf(t: TaskRt): string[] {
    return core.log
      .read({ stream: stream(t.id), kinds: ["checkpoint"], limit: 10_000 })
      .map((e) => preview((e.body as Bodies["checkpoint"]).text, 2000) ?? "")
      .filter(Boolean);
  }

  /**
   * Brings a parked task's session back: by its native id when it has one; else, or when the
   * harness rejects the resume, a new session in the same task seeded from the brief (in the
   * system prompt) + every checkpoint (focus-window-states parked -> hot). Returns that seed, to
   * go before the next turn's text, or "" when the old session resumed.
   */
  async function resumeOrSeed(t: TaskRt): Promise<string> {
    if (t.sessionId) {
      try {
        await startSession(t, true);
        return "";
      } catch (err) {
        if (isOffline(err)) throw err;
        const why = preview(err instanceof Error ? err.message : String(err), 300);
        logEvent(t, { role: "system", from: "runner", text: `could not resume the session (${why}); started a new one from the brief and saved progress`, raw: { fresh: "resume_rejected" } });
        t.sessionId = undefined;
      }
    }
    const progress = progressOf(t);
    const seed = t.handedFrom ? handedOver(t.handedFrom, progress) : startedAfresh(progress);
    await startSession(t, false);
    return seed;
  }

  async function pump(t: TaskRt, session: HarnessSession) {
    let offline = false;
    try {
      for await (const ev of session.events()) {
        if (t.retired === session) break; // replaced on purpose (a browser driver switch)
        noteSessionId(t, session);
        handleEvent(t, ev);
        if (ev.turnEnd) await onTurnEnd(t, ev);
      }
    } catch (err) {
      if (isOffline(err)) offline = true;
      else logEvent(t, { role: "system", text: `event stream error: ${preview(String(err), 500)}` });
    }
    if (t.session === session) {
      const wasRunning = t.running;
      t.session = undefined;
      t.running = false;
      if (offline && !t.dropped) deviceLost(t, wasRunning);
      else if (!t.dropped) setState(t, currentAttention(t), "parked");
    }
  }

  // ---------- workers: a task's machine drops and comes back (focus-window-states invariant 1) ----------
  function deviceLost(t: TaskRt, midTurn: boolean) {
    const d = t.ops.device;
    if (!d || t.dropped) return;
    const was = currentAttention(t);
    t.resumeOnBack = t.resumeOnBack || midTurn || was === "working" || was === "queued";
    setState(t, was, "offline");
    // Only work in flight is said out loud; an idle task just shows its machine as away.
    if (t.resumeOnBack) logEvent(t, { role: "system", from: "runner", text: `${d.name} disconnected; the task carries on when it is back`, raw: { device: d.id, offline: true } });
    clearTimeout(t.offlineTimer);
    // Short blips stay silent (D52); past the grace, working tasks show as waiting on the device.
    if (t.resumeOnBack)
      t.offlineTimer = setTimeout(() => {
        if (!d.online() && !t.dropped && !t.session) setState(t, "blocked", "offline", unreachableReason(d.name));
      }, graceMs);
    t.offlineOff?.();
    t.offlineOff = d.onOnline(() => {
      t.offlineOff?.();
      t.offlineOff = undefined;
      clearTimeout(t.offlineTimer);
      void deviceBack(t);
    });
  }

  async function deviceBack(t: TaskRt) {
    if (t.dropped || t.session) return;
    const d = t.ops.device!;
    if (!t.resumeOnBack) return setState(t, currentAttention(t), "parked");
    t.resumeOnBack = false;
    logEvent(t, { role: "system", from: "runner", text: `${d.name} is back; resuming the session`, raw: { device: d.id, offline: false } });
    try {
      if (t.sessionId || t.handedFrom) {
        const seed = await resumeOrSeed(t);
        await sendTurn(t, seed || DEVICE_BACK, "runner");
      } else {
        await t.ops.provision({ place: t.card.place, cwd: t.spec.cwd });
        await startSession(t, false);
        await sendTurn(t, kickoff(t.card.title), "runner");
      }
    } catch (err) {
      if (isOffline(err)) return deviceLost(t, true);
      const reason = preview(err instanceof Error ? err.message : String(err), 500);
      logEvent(t, { role: "system", from: "runner", text: `failed to resume on ${d.name}: ${reason}` });
      setState(t, "failed", "parked", reason);
    }
  }

  // ---------- D135: small windows, compaction with save-before / re-inject-after ----------
  /** Into the running turn when the harness takes input mid-turn; else first in the next turn. */
  function sayBeforeNextInput(t: TaskRt, text: string) {
    const s = t.session;
    if (s && s.canSteer && isBusy(t)) {
      void deliver(t, text, "steer", "runner").catch(() => t.prefix.push(text));
      return;
    }
    t.prefix.push(text);
  }

  /** The brief as the task got it (D120: a later task_open carries it) and its latest checkpoint. */
  function briefAndProgress(t: TaskRt): { brief: string | null; progress?: string } {
    const opens = core.log.read({ stream: stream(t.id), kinds: ["task_open"], limit: 20 });
    const brief = [...opens].reverse().map((e) => (e.body as Bodies["task_open"]).brief).find((b) => b?.trim()) ?? null;
    const cps = core.log.read({ stream: stream(t.id), kinds: ["checkpoint"], limit: 500 });
    const last = cps[cps.length - 1];
    return { brief, ...(last ? { progress: (last.body as Bodies["checkpoint"]).text } : {}) };
  }

  function onCompacted(t: TaskRt) {
    t.compactions++;
    t.saveAsked = false;
    t.context = undefined; // unknown until the harness's next call
    t.prefix = t.prefix.filter((p) => p !== SAVE_BEFORE_COMPACT); // too late for it now
    const { brief, progress } = briefAndProgress(t);
    sayBeforeNextInput(t, afterCompaction(brief, progress));
  }

  function handleEvent(t: TaskRt, ev: HarnessEvent) {
    const status = ev.tool && t.sidecar?.statusFor(ev.tool);
    if (status) logEvent(t, { role: "system", text: status.text, raw: { browser: { host: status.host, url: status.url, ...(status.own ? { own: true } : {}) } } });
    const early = (ev.raw as { kind?: string } | undefined)?.kind;
    if (early === "tool_call_started" || early === "tool_call_title" || early === "tool_call_head") return; // the ended event logs the call
    if (ev.tool && /(^|__)report_to_main$/.test(ev.tool.name) && ev.tool.ok !== false) t.reportedThisTurn = true;
    // D135: save before the harness compacts; the brief and progress again after it.
    if (ev.usage?.contextTokens) {
      t.context = ev.usage.contextTokens;
      if (!t.saveAsked && t.context >= saveBeforeAt(t.spec.harnessCompactAt ?? taskWindows().compactAt)) {
        t.saveAsked = true;
        sayBeforeNextInput(t, SAVE_BEFORE_COMPACT);
      }
    }
    const compaction = early === "compaction_ended" || early === "compaction_started" ? (ev.raw as { kind: string; outcome?: string; trigger?: string }) : undefined;
    const compacted = compaction?.kind === "compaction_ended" && (compaction.outcome ?? "completed") === "completed";
    if (compaction) {
      // Logged first (with the count and the size it had reached), then the brief goes back in.
      const text = ev.text ?? (compaction.kind === "compaction_started" ? "compaction started" : `compaction ${compaction.outcome ?? "completed"}`);
      logEvent(t, { role: "system", text, raw: { ...compaction, ...(compacted ? { compactions: t.compactions + 1 } : {}), ...(t.context ? { contextTokens: t.context } : {}) } });
      if (compacted) onCompacted(t);
      return;
    }
    if (!ev.text && !ev.tool && !ev.turnEnd && !ev.thinking?.length) return; // usage-only or empty
    const raw = ev.turnEnd ? { turnEnd: true, ...(ev.raw as object | undefined) } : undefined;
    const tool = ev.tool
      ? { ...ev.tool, output: preview(ev.tool.output, PREVIEW_MAX), input: capInput(ev.tool.input) }
      : undefined;
    const body: Omit<Bodies["task_event"], "taskId"> = { role: ev.role };
    if (ev.text != null) body.text = preview(ev.text, 16 * 1024);
    if (tool) body.tool = tool;
    if (ev.thinking?.length) body.thinking = ev.thinking.slice(0, 3).map((h) => h.slice(0, 120));
    if (ev.turnEnd && ev.usage) body.usage = ev.usage;
    if (raw) body.raw = raw;
    logEvent(t, body);
    if (ev.tool && (t.sidecar || t.guard)) browserChecks(t, ev.tool);
  }

  /**
   * A native browser's safety and fallback checks on each finished tool call (D130):
   *   - guard: a call broke a rule Ducter can see (Codex Computer Use sent keys before opening
   *     its own window): say so in a system line and steer the task to stop;
   *   - fallback: the native tools can't work here (Claude in Chrome isn't connected): move the
   *     task to cua-driver, said in a system line.
   */
  function browserChecks(t: TaskRt, tool: NonNullable<HarnessEvent["tool"]>) {
    const sc = t.sidecar;
    const hit = (sc?.guard ?? t.guard)?.(tool);
    if (hit) {
      logEvent(t, { role: "system", from: "runner", text: hit.line, raw: { browser: { guard: true } } });
      const s = t.session;
      if (s) void (isBusy(t) ? deliver(t, hit.steer, s.canSteer ? "steer" : "queue", "runner") : sendTurn(t, hit.steer, "runner")).catch(() => {});
    }
    if (!sc) return;
    // Input that arrives meanwhile waits for the switch (send awaits t.started).
    if (sc.fallback?.(tool)) t.started = switchToCua(t);
  }

  /** Claude in Chrome said "not connected": the same task carries on with Ducter's own browser (cua-driver). */
  async function switchToCua(t: TaskRt) {
    const input = t.sidecarInput;
    const old = t.session;
    if (!input || !old || t.dropped) return;
    // First, synchronously: the old session's remaining events are ignored from here on.
    t.retired = old;
    t.session = undefined;
    t.running = true;
    let cua: BrowserSidecar | undefined;
    try {
      cua = await browserSidecar({ ...input, forceCua: true }, opts.browser);
    } catch (err) {
      cua = undefined;
      const reason = preview(err instanceof Error ? err.message : String(err), 400);
      logEvent(t, { role: "system", from: "runner", text: `Claude in Chrome isn't connected, and Ducter's own browser isn't available: ${reason}` });
    }
    await old.close().catch(() => {});
    if (!cua) {
      t.running = false;
      setState(t, "blocked", "parked", "Claude in Chrome isn't connected");
      return;
    }
    // The same task on cua-driver: startSession rebuilds the spec from base with it.
    t.sidecar = cua;
    t.sidecarInput = { ...input, forceCua: true };
    logEvent(t, { role: "system", from: "runner", text: "Claude in Chrome isn't connected; switched to Ducter's own browser", raw: { browser: { driver: "cua", from: "native" } } });
    try {
      await cua.ready();
      await startSession(t, !!t.sessionId);
      await sendTurn(t, SWITCHED_TO_CUA, "runner");
    } catch (err) {
      t.running = false;
      const reason = preview(err instanceof Error ? err.message : String(err), 500);
      logEvent(t, { role: "system", from: "runner", text: `could not switch to Ducter's own browser: ${reason}` });
      setState(t, "failed", "parked", reason);
    }
  }

  async function onTurnEnd(t: TaskRt, ev: HarnessEvent) {
    const outcome = (ev.raw as any)?.outcome as string | undefined;
    const busy = isBusy(t);
    t.running = busy;
    const reported = t.reportedThisTurn;
    t.reportedThisTurn = false;
    const stopped = t.interruptRequested && outcome === "aborted";
    if (outcome) t.interruptRequested = false;
    // Stopped by the user: it is not working any more, it waits for them (truthful card).
    if (!busy && !t.dropped) setState(t, stopped && currentAttention(t) === "working" ? "blocked" : currentAttention(t), "warm");
    if (!busy && !t.dropped) armPark(t);
    else clearTimeout(t.parkTimer);
    // A finished browser task quits its browser cleanly so sign-ins are saved (browser.ts).
    if (!busy && t.sidecar && ["done_claimed", "done", "failed"].includes(currentAttention(t))) void t.sidecar.close().catch(() => false);
    if (t.dropped || busy) return;
    if (reported) {
      t.nudged = false;
      t.stallNoted = false;
      return;
    }
    if (outcome && outcome !== "completed") return; // aborted/failed: no nudge
    if (!t.nudged) {
      t.nudged = true;
      try {
        await sendTurn(t, NUDGE, "runner");
      } catch (err) {
        logEvent(t, { role: "system", text: `nudge failed: ${preview(String(err), 500)}` });
      }
      return;
    }
    if (!t.stallNoted) {
      t.stallNoted = true;
      logEvent(t, { role: "system", text: "no report after one nudge; leaving the task idle (stall rule)", raw: { stall: true } });
    }
  }

  /**
   * A merged task is done and archived (product-model "Archive and disk", EC-steering-places
   * step 7): its session closes, its clean worktree goes, its branch stays. A task still working
   * (a follow-up in flight) keeps everything. A worktree with leftovers is kept and the reason
   * logged on the task; a follow-up later adds the worktree back from the branch (send).
   */
  async function archiveAfterMerge(t: TaskRt, place: Place) {
    if (place.kind !== "repo" || t.dropped || isBusy(t) || !["done_claimed", "done"].includes(currentAttention(t))) return;
    clearTimeout(t.parkTimer);
    const s = t.session;
    t.session = undefined;
    t.running = false;
    await s?.close().catch(() => {});
    let a: ActionResult & { removed: boolean };
    try {
      a = await t.ops.archive(place);
    } catch (err) {
      a = { ok: false, removed: false, message: `Kept the worktree: ${preview(err instanceof Error ? err.message : String(err), 300)}` };
    }
    if (a.removed || !a.ok) logEvent(t, { role: "system", from: "runner", text: a.message, raw: { archive: a.removed ? "removed" : "kept" } });
    // Archived either way: merged work is finished; a kept worktree only holds its leftovers.
    setState(t, "done", "archived");
  }

  /**
   * The archive horizon (focus-window-states parked -> archived): a finished task (done, done ·
   * checking, failed) left alone for archiveIdleMs is archived. Its clean worktree goes (never
   * --force), its branch, transcript and Log stay, and a follow-up adds the worktree back. A
   * worktree with leftovers is kept and the task stays parked: unmerged edits are never reclaimed.
   * Dropped tasks keep their worktree on purpose (Undo), so the horizon skips them.
   */
  async function sweepArchive(): Promise<string[]> {
    if (!(archiveIdleMs > 0)) return [];
    const archived: string[] = [];
    for (const t of tasks.values()) {
      const card = core.tasks.get(t.id);
      if (!card || t.dropped || isBusy(t) || !["parked", "warm"].includes(card.residency)) continue;
      if (!["done", "done_claimed", "failed"].includes(card.attention)) continue;
      if (now().getTime() - Date.parse(card.updatedAt) < archiveIdleMs) continue;
      if (t.archiveKeptAt === card.updatedAt) continue; // kept last time and untouched since
      if (t.ops.device && !t.ops.device.online()) continue;
      clearTimeout(t.parkTimer);
      const s = t.session;
      t.session = undefined;
      t.running = false;
      await s?.close().catch(() => {});
      let a: ActionResult & { removed: boolean };
      try {
        a = await t.ops.archive(card.place);
      } catch {
        if (card.residency !== "parked") setState(t, card.attention, "parked");
        continue; // e.g. the worker dropped: try again on the next sweep
      }
      if (!a.removed && !a.ok) {
        if (card.residency !== "parked") setState(t, card.attention, "parked");
        t.archiveKeptAt = core.tasks.get(t.id)?.updatedAt ?? card.updatedAt;
        continue;
      }
      if (a.removed) logEvent(t, { role: "system", from: "runner", text: a.message, raw: { archive: "removed", horizon: true } });
      setState(t, card.attention, "archived");
      archived.push(t.id);
    }
    return archived;
  }

  function get(taskId: string): TaskRt {
    const t = tasks.get(taskId);
    if (!t) throw new Error(`unknown task ${taskId}`);
    return t;
  }

  /** briefed=false: the brief is still being written and comes as the first turn (D120). */
  function specFor(id: string, open: Bodies["task_open"], cwd: string, briefed = true): SessionSpec {
    const mcp = core.mcp.configFor({ taskId: id });
    const spec: SessionSpec = {
      harness: open.harness as HarnessId,
      cwd,
      appendSystemPrompt: taskBrief({
        partnerName: opts.partnerName ?? core.persona.name ?? "Ducter",
        taskId: id,
        title: open.title,
        brief: briefed ? open.brief : null,
        place: open.place,
        cwd,
        project: open.project || undefined,
        mcpServerName: mcp.name,
        ...(open.language ? { language: open.language } : {}),
      }),
      mcp: [mcp],
      permissionMode: "bypass",
      isolateUserConfig: opts.isolateUserConfig ?? false,
      // D130: a task keeps Codex's own browser and Computer Use, also under the clean setup.
      keepNativeTools: true,
      // D135: a small window on a standard-window model; the harness compacts at its point, with
      // the PreCompact note where the harness has the hook (Settings.windows.tasks).
      contextWindow: taskWindows().window,
      harnessCompactAt: taskWindows().compactAt,
      preCompactNote: PRECOMPACT_NOTE,
    };
    if (open.model) spec.model = open.model;
    // D141 (system.md): the user's own nmem (a skill, a hook) runs as the persona's identity.
    // Only these two, set explicitly; every other NMEM_* the host has stays out (child-env.ts).
    const mem = core.persona.mem;
    if (mem) spec.env = { NMEM_AGENT_ID: mem.agentId, ...(mem.space ? { NMEM_SPACE: mem.space } : {}) };
    return spec;
  }

  function newRt(id: string, persona: string, card: TaskCard, spec: SessionSpec, ops: PlaceOps = localOps): TaskRt {
    return {
      ops,
      id,
      persona,
      card,
      base: spec,
      spec: withBrowser(spec, undefined, partnerNameOf()),
      running: false,
      reportedThisTurn: false,
      nudged: false,
      stallNoted: false,
      dropped: card.attention === "dropped",
      attention: card.attention,
      residency: card.residency,
      started: Promise.resolve(),
      // Codex may use its own Computer Use in any place: the tripwire watches every Codex task.
      ...(spec.harness === "codex" ? { guard: computerUseGuard({ chromeOnly: true }) } : {}),
      compactions: 0,
      saveAsked: false,
      prefix: [],
    };
  }

  // ---------- recovery: rebuild tasks from the Log after a restart ----------
  // Every known task becomes addressable again (send resumes its native session by id).
  // Tasks that were mid-turn when the process died are resumed and told to carry on.
  const recovered: TaskRt[] = [];
  // The latest task_open of each task: a task opened before its brief was written (D120) logs a
  // second one with the brief, and a retitle logs one with the new title.
  const opens = new Map<string, LogEvent>();
  for (const e of core.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_open"] })) opens.set((e.body as Bodies["task_open"]).taskId, e);
  for (const e of opens.values()) {
    const open = e.body as Bodies["task_open"];
    const card = core.tasks.get(open.taskId);
    if (!card || tasks.has(open.taskId)) continue;
    const ops = opsFor(open.place);
    // A worker's cwd is on the worker; it was planned there and recorded in the place.
    const cwd = ops.device ? remoteCwd(open.place) : cwdOf(open.place, open.taskId, core.dataDir);
    // After a switch (D89) the card holds who does it now, not who it opened with.
    const now = card.body ? { ...open, harness: card.body.harness, model: card.body.model } : open;
    const t = newRt(open.taskId, e.persona, card, specFor(open.taskId, now, cwd), ops);
    for (const ev of core.log.read({ stream: stream(open.taskId), kinds: ["task_event"], limit: 50_000 })) {
      const raw = (ev.body as Bodies["task_event"]).raw as { sessionId?: string; cwd?: string; kind?: string; compactions?: number; switched?: { from: string } } | undefined;
      if (raw?.sessionId) {
        t.sessionId = t.loggedSessionId = raw.sessionId;
        t.handedFrom = undefined;
      }
      if (raw?.sessionId && raw.cwd && ops.device) t.spec.cwd = t.base.cwd = raw.cwd;
      if (raw?.kind === "compaction_ended" && raw.compactions) t.compactions = raw.compactions;
      // Moved to another agent (D89): the session ids before it are the old agent's; ignore them.
      if (raw?.switched) {
        t.sessionId = t.loggedSessionId = undefined;
        t.handedFrom = raw.switched.from;
      }
    }
    tasks.set(open.taskId, t);
    recovered.push(t);
  }
  for (const t of recovered) {
    const was = t.attention;
    if (t.residency === "hot" || t.residency === "warm" || t.residency === "provisioning") setState(t, was, "parked");
    if (was !== "working" && was !== "queued") continue;
    // Cut off before its brief arrived (D120): it never did anything, so it never starts.
    if (!opens.get(t.id) || !(opens.get(t.id)!.body as Bodies["task_open"]).brief.trim()) {
      t.dropped = true;
      setState(t, "dropped", "archived", "not started");
      continue;
    }
    t.started = (async () => {
      try {
        await Bun.sleep(0); // let the caller finish wiring (registerTaskTools, partner)
        if (t.sessionId || t.handedFrom) {
          logEvent(t, { role: "system", from: "runner", text: "main process restarted; resuming the session" });
          const seed = await resumeOrSeed(t);
          await sendTurn(t, seed || RESUME_AFTER_RESTART, "runner");
        } else {
          await t.ops.provision({ place: t.card.place, cwd: t.spec.cwd });
          await startSession(t, false);
          await sendTurn(t, kickoff(t.card.title), "runner");
        }
      } catch (err) {
        if (isOffline(err)) return deviceLost(t, true);
        const reason = preview(err instanceof Error ? err.message : String(err), 500);
        logEvent(t, { role: "system", from: "runner", text: `failed to resume after restart: ${reason}` });
        setState(t, "failed", "parked", reason);
      }
    })();
  }

  /** Opens a task; `brief` still being written (a promise) starts the session before it arrives (D120). */
  async function open(input: Parameters<Runner["openTask"]>[0], briefIn: string | Promise<string>): Promise<TaskCard> {
    const id = newId();
    // Who does it (D89): the person's rules, the limits and Use it for tasks, through core's
    // chooser; a pick this runner can't run (or no device info) keeps the old default.
    const you = input.origin === "you"; // D128: the user opened it; a harness given is their pick
    const picked = await core.bodies?.choose({ title: input.title, brief: input.brief, place: input.place, harness: input.harness, model: input.model, ...(you ? { by: "you" as const } : {}) });
    if (picked && "none" in picked) throw new Error(picked.none);
    const pick = picked && HARNESSES.includes(picked.harness as HarnessId) ? picked : undefined;
    // The pick's model goes with it (the card says what runs); a model the caller named for
    // another agent never rides along when the pick moved.
    if (pick) {
      const { model: asked, ...rest } = input;
      const keep = pick.model ?? (pick.harness === input.harness ? asked : undefined);
      input = { ...rest, harness: pick.harness, ...(keep ? { model: keep } : {}) };
    }
    // A model from the tier table alone (no rule, no pin) gives way to DUCTER_TASK_MODEL below.
    const ranked = !!pick && ["default", "limit", "unavailable"].includes(pick.why.kind);
    // D85: the partner's choice; else the first account the user lets tasks use (Settings
    // taskAccounts; a missing entry is enabled), in first-wave order.
    const accounts = core.settings?.get().taskAccounts ?? {};
    const enabled = (x: HarnessId) => accounts[x]?.enabled !== false;
    const h = (input.harness ?? opts.defaultHarness ?? HARNESSES.find(enabled) ?? "claude-code") as HarnessId;
    if (!HARNESSES.includes(h)) throw new Error(`unknown harness ${input.harness}`);
    if (input.harness && !enabled(h)) throw new Error(`the user switched ${harnessName(h)} off for tasks; leave harness out or ask them`);
    const title = input.title.trim() || "Untitled task";
    // Where it runs: this machine, or a worker that must be connected right now.
    const ops = opsFor(input.place);
    if (ops.device && !ops.device.online()) throw new DeviceOfflineError(ops.device.name);
    if (ops.device && input.place?.kind === "browser") throw new Error(`browser places run on this machine only for now, not on ${ops.device.name}`);
    const resolved = await ops.plan(input.place, id, title);
    // A worker plans its own place; it can't turn it into something this machine then runs
    // (a browser place starts cua-driver here).
    if (ops.device && resolved?.place?.kind !== (input.place?.kind ?? "none")) throw new Error(`${ops.device.name} answered with a different kind of place`);
    const project = input.project ?? "";
    const persona = input.persona || core.persona.id;
    const partnerName = opts.partnerName ?? core.persona.name ?? "Ducter";
    // Throws before the task exists when a browser place is unavailable (the partner says why).
    const sidecarInput: SidecarInput = { place: resolved.place, persona, taskId: id, dataDir: core.dataDir, partnerName, harness: h };
    const sidecar = await browserSidecar(sidecarInput, opts.browser);

    // The partner's, a rule's or the person's choice wins; else DUCTER_TASK_MODEL; else the
    // ranking's model; else the harness default.
    const fixed = h === "claude-code" ? (opts.defaultModel ?? opts.taskModel ?? process.env.DUCTER_TASK_MODEL) || undefined : undefined;
    const model = (ranked && fixed) || input.model || fixed;
    const later = typeof briefIn !== "string";
    const body: Bodies["task_open"] = { taskId: id, title, project, place: resolved.place, harness: h, model, brief: later ? "" : briefIn, ...(input.language ? { language: input.language } : {}), ...(you ? { origin: "you" as const } : {}) };
    const opened = core.log.append({ persona, stream: stream(id), origin: "system", kind: "task_open", body });
    core.log.append({ persona, stream: stream(id), origin: "system", kind: "body_selected", body: { taskId: id, harness: h, ...(model ? { model } : {}), why: pick?.why ?? { kind: input.harness ? (you ? "you" : "partner") : "default" } } });
    const card: TaskCard = {
      taskId: id,
      persona,
      title,
      project,
      place: resolved.place,
      harness: h,
      model,
      attention: "queued",
      residency: "provisioning",
      openedAt: opened.ts,
      updatedAt: opened.ts,
    };
    const t = newRt(id, persona, card, specFor(id, body, resolved.cwd, !later), ops);
    if (sidecar) (t.sidecar = sidecar), (t.sidecarInput = sidecarInput);
    t.spec = withBrowser(t.base, sidecar, partnerName);
    tasks.set(id, t);
    core.tasks.setState(id, "queued", "provisioning");

    t.started = (async () => {
      try {
        await ops.provision(resolved);
        await sidecar?.ready();
        await startSession(t, false);
        let first = kickoff(title);
        if (later) {
          // The session is up (or coming up) while the partner finishes the brief.
          let text: string;
          try {
            text = await briefIn;
          } catch {
            // Never briefed (the partner's call changed or failed): gone before it did anything.
            if (t.dropped) return;
            t.dropped = true;
            setState(t, "dropped", "archived", "not started");
            const s = t.session;
            t.session = undefined;
            await s?.close().catch(() => {});
            await sidecar?.close().catch(() => false);
            return;
          }
          if (t.dropped) return;
          // The briefed task_open is the one the registry, recovery and hand-offs read.
          const full = { ...body, brief: text };
          core.log.append({ persona, stream: stream(id), origin: "system", kind: "task_open", body: full });
          t.base = { ...specFor(id, full, resolved.cwd, true), cwd: t.base.cwd };
          t.spec = withBrowser(t.base, t.sidecar, partnerName);
          first = briefTurn(text, title);
        }
        if (t.dropped) return;
        await sendTurn(t, first, "runner");
      } catch (err) {
        if (isOffline(err)) return deviceLost(t, true);
        const reason = preview(err instanceof Error ? err.message : String(err), 500);
        logEvent(t, { role: "system", from: "runner", text: `failed to start: ${reason}` });
        setState(t, "failed", "archived", reason);
      }
    })();

    return core.tasks.get(id) ?? card;
  }

  // The archive horizon: once soon after start (tasks recovered from the Log), then periodically.
  // archiveSweepMs 0: no timer (tests call sweepArchive themselves).
  let sweeping = false;
  const sweep = () => {
    if (sweeping) return;
    sweeping = true;
    void sweepArchive()
      .catch((err) => console.warn("[runner] archive sweep:", (err as Error).message))
      .finally(() => (sweeping = false));
  };
  const sweepMs = opts.archiveSweepMs ?? 3600_000;
  const timed = archiveIdleMs > 0 && sweepMs > 0;
  const sweepFirst = timed ? setTimeout(sweep, 5_000) : undefined;
  const sweepTimer = timed ? setInterval(sweep, sweepMs) : undefined;
  (sweepFirst as { unref?: () => void } | undefined)?.unref?.();
  (sweepTimer as { unref?: () => void } | undefined)?.unref?.();

  const runner: RunnerExt = {
    harness,

    sweepArchive,

    async checkEvidence(taskId, evidence) {
      const t = tasks.get(taskId);
      // A worker's place lives on that machine: its refs stay the task's word for now.
      if (!t || t.ops.device) return evidence;
      return checkEvidence(core.tasks.get(taskId)?.place ?? t.card.place, t.spec.cwd, evidence);
    },

    openTask: (input) => open(input, input.brief),
    // D120: the card, the place and the session start while the partner still writes the brief.
    openTaskEarly: (input, brief) => open({ ...input, brief: "" }, brief),

    async send(taskId, text, mode, from = "partner", clientId) {
      const t = get(taskId);
      if (typeof text !== "string" || !text.trim()) throw new Error("send needs non-empty text");
      if (t.dropped) throw new Error(`task ${taskId} was dropped`);
      await t.started.catch(() => {});
      t.nudged = false;
      t.stallNoted = false;
      if (!t.session) {
        // Its worker is away: say so, and deliver nothing (the partner tells the user).
        if (t.ops.device && !t.ops.device.online()) throw new DeviceOfflineError(t.ops.device.name);
        // Parked (process gone or restarted): resume by native session id; with none (moved to
        // another agent) or a rejected resume, a new session from the brief + saved progress.
        // Resuming takes seconds (measured ~10 s for Claude Code): log the text now so the
        // transcript shows it at once; a resumed session is idle, so it becomes the next turn.
        logInput(t, text, from, "turn", clientId);
        const archived = t.residency === "archived";
        setState(t, currentAttention(t), "provisioning");
        let seed: string;
        try {
          // Archived after a merge: its worktree was removed; add it back from the kept branch.
          if (archived) await t.ops.provision({ place: core.tasks.get(taskId)?.place ?? t.card.place, cwd: t.spec.cwd });
          seed = await resumeOrSeed(t);
        } catch (err) {
          setState(t, currentAttention(t), "parked");
          logEvent(t, { role: "system", from: "runner", text: `delivery failed: could not start the session: ${preview(String(err), 400)}` });
          throw err;
        }
        setState(t, "working", "hot");
        await sendTurn(t, seed ? seedThen(seed, text) : text, from, true);
        return { delivered: "prompted" };
      }
      if (isBusy(t)) {
        if (mode !== "queue" && t.session!.canSteer) {
          logInput(t, text, from, "steer", clientId);
          await deliver(t, text, "steer", from, true);
          return { delivered: "steered" };
        }
        logInput(t, text, from, "queue", clientId);
        await deliver(t, text, "queue", from, true);
        return { delivered: "queued" };
      }
      // Idle: the text becomes the next turn. A finished or held task goes back to work.
      const a = currentAttention(t);
      if (a !== "working") setState(t, "working", "hot");
      if (clientId) logInput(t, text, from, "turn", clientId);
      await sendTurn(t, text, from, !!clientId);
      return { delivered: "prompted" };
    },

    async reopen(taskId) {
      const t = get(taskId);
      await t.started.catch(() => {});
      t.dropped = false;
      if (t.session || t.sessionId || t.handedFrom) return runner.send(taskId, REOPENED, undefined, "user");
      // Never got a session (e.g. failed to start): start one from the brief.
      t.started = (async () => {
        await t.ops.provision({ place: t.card.place, cwd: t.spec.cwd });
        await startSession(t, false);
        await sendTurn(t, kickoff(t.card.title), "runner");
      })();
      try {
        await t.started;
      } catch (err) {
        setState(t, "failed", "parked", preview(err instanceof Error ? err.message : String(err), 500));
        throw err;
      }
      return { delivered: "prompted" as const };
    },

    async switchBody(taskId, harness, model) {
      const t = get(taskId);
      if (!HARNESSES.includes(harness as HarnessId)) return { ok: false, message: `${harness} can't do tasks here yet.` };
      if (t.dropped) return { ok: false, message: "That task was dropped. Undo the drop first." };
      await t.started.catch(() => {});
      const from = t.spec.harness;
      const wasRunning = !!t.session && isBusy(t);
      const att = currentAttention(t);
      // The old session closes; its native session can't carry over to another harness.
      const old = t.session;
      t.session = undefined;
      t.running = false;
      t.sessionId = t.loggedSessionId = undefined;
      t.handedFrom = from;
      await old?.close().catch(() => {});
      // The next session start rebuilds the spec (and a browser place's browser) for it.
      t.base = { ...t.base, harness: harness as HarnessId };
      if (model) t.base.model = model;
      else delete t.base.model;
      t.spec = withBrowser(t.base, t.sidecarInput?.harness === harness ? t.sidecar : undefined, partnerNameOf());
      // raw.switched: recovery ignores the session ids logged before it (the old agent's).
      logEvent(t, { role: "system", from: "runner", text: `moved from ${from} to ${harness}${model ? ` (${model})` : ""}`, raw: { switched: { from, to: harness } } });
      // Something left to do: carry on there now, from the saved progress. A finished or waiting
      // task keeps its state; the next message (an answer, a follow-up) starts the new session
      // from the brief + saved progress (send -> resumeOrSeed).
      if (!wasRunning && att !== "working" && att !== "queued") {
        setState(t, att, "parked");
        return { ok: true };
      }
      t.started = (async () => {
        const seed = await resumeOrSeed(t);
        setState(t, "working", "hot");
        await sendTurn(t, seed, "runner");
      })();
      try {
        await t.started;
      } catch (err) {
        const reason = preview(err instanceof Error ? err.message : String(err), 500);
        setState(t, "failed", "parked", reason);
        return { ok: false, message: reason };
      }
      return { ok: true };
    },

    stop() {
      return runner.dispose();
    },

    async interrupt(taskId) {
      const t = get(taskId);
      await t.started;
      if (!t.session) return;
      t.interruptRequested = true;
      await t.session.interrupt();
    },

    async drop(taskId) {
      const t = get(taskId);
      t.dropped = true;
      await t.started.catch(() => {});
      setState(t, "dropped", "parked");
      const s = t.session;
      t.session = undefined;
      t.running = false;
      await s?.close().catch(() => {});
      await t.sidecar?.close().catch(() => false);
      // The worktree and branch are kept on purpose.
    },

    async undrop(taskId) {
      const t = get(taskId);
      if (!t.dropped && currentAttention(t) !== "dropped") return { ok: true, message: "The task wasn't dropped." };
      // What it was before the drop, from the Log (survives a restart).
      const states = core.log.read({ stream: stream(taskId), kinds: ["task_state"], limit: 50_000 });
      let before: Attention = "blocked";
      for (let i = states.length - 1; i >= 0; i--) {
        const a = (states[i]!.body as Bodies["task_state"]).attention;
        if (a !== "dropped") {
          before = a;
          break;
        }
      }
      t.dropped = false;
      if (before === "working" || before === "queued") {
        // It was mid-work; its session was closed by the drop, so carry on from where it was.
        await runner.reopen(taskId);
        return { ok: true, message: "Back, and carrying on." };
      }
      setState(t, before, "parked");
      return { ok: true, message: "Back where it was." };
    },

    async merge(taskId) {
      const t = get(taskId);
      const card = core.tasks.get(taskId) ?? t.card;
      const r = await t.ops.merge(card.place);
      if (!r.ok) return r;
      logEvent(t, { role: "system", from: "runner", text: r.message, raw: { effect: "merge", ref: r.ref } });
      await archiveAfterMerge(t, card.place);
      return r;
    },

    async openPr(taskId) {
      const t = get(taskId);
      const card = core.tasks.get(taskId) ?? t.card;
      const r = await t.ops.openPr(card.place);
      // Pushing and opening a PR leave the user's machines: an outside effect (I-results "Outside").
      if (r.ok) logEvent(t, { role: "system", from: "runner", text: r.message, raw: { effect: "outside", what: "draft_pr", ref: r.ref } });
      // A failure stays on the task, not only in a toast that fades (fresh-user QA: no origin).
      else logEvent(t, { role: "system", from: "runner", text: r.message, raw: { failed: "draft_pr" } });
      return r;
    },

    async branchChanges(taskId) {
      const t = tasks.get(taskId);
      const place = core.tasks.get(taskId)?.place ?? t?.card.place;
      if (!t || place?.kind !== "repo") return undefined;
      return t.ops.changes(place).catch(() => undefined);
    },

    whenStarted(taskId) {
      return get(taskId).started;
    },

    sessionId(taskId) {
      return tasks.get(taskId)?.sessionId;
    },

    async dispose() {
      unsubscribe();
      clearTimeout(sweepFirst);
      clearInterval(sweepTimer);
      for (const t of tasks.values()) {
        clearTimeout(t.offlineTimer);
        clearTimeout(t.parkTimer);
        t.offlineOff?.();
      }
      await Promise.all([...tasks.values()].map((t) => t.session?.close().catch(() => {})));
    },
  };
  return runner;
}

function capInput(input: unknown): unknown {
  if (input == null) return undefined;
  const s = typeof input === "string" ? input : JSON.stringify(input);
  if (s.length <= PREVIEW_MAX) return input;
  return preview(s, PREVIEW_MAX);
}

export type { Place };

/** A worker task's cwd, from its recorded place (planned on the worker at open time). */
function remoteCwd(place: Place): string {
  if (place.kind === "repo") return place.worktree ?? place.repoPath;
  if (place.kind === "folder") return place.path;
  return "";
}
