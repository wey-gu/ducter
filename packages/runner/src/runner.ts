import { randomBytes, randomUUID } from "node:crypto";
import { HARNESS_IDS, HARNESSES as HARNESS_INFO, harnessName, isImage, kindWords, sizeWords, type MediaRef, type FileOpenError, type Attention, type Bodies, type BranchChanges, type Delivery, type EvidenceRef, type FolderChanges, type FolderSummary, type HeldMsg, type UndoConfirm, type LogEvent, type Place, type Question, type Residency, type TaskCard, type TaskNeeds, type WhereAsk } from "@ducter/protocol";
import type { CoreApi, HarnessEvent, HarnessPort, HarnessSession, Runner, SendFile, SendImage, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { ADOPTED, outsideOver, NUDGE, PRECOMPACT_NOTE, REOPENED, RESUME_AFTER_RESTART, SAVE_BEFORE_COMPACT, afterCompaction, briefTurn, knownTurn, othersTurn, OTHERS_MAX, handedBack, handedOver, kickoff, movedOver, noCopyAnswer, seedThen, startedAfresh, taskBrief, type CarryOver } from "./brief.ts";
import { resolveModel, resolveWindows, saveBeforeAt } from "@ducter/protocol/src/harness-facts.ts";
import { createOarHarnessPort } from "./oar.ts";
import { cwdOf, planPlace, provisionPlace, type ResolvedPlace } from "./places.ts";
import { browserSidecar, codexComputerBrief, computerUseGuard, type BrowserGuardHit, type BrowserOptions, type BrowserSidecar, type BrowserTool, type SidecarInput } from "./browser.ts";
import { checkEvidence } from "./evidence.ts";
import { PREVIEW_MAX, preview } from "./normalize.ts";
import { archiveWorktree, branchChanges, mergeTaskBranch, openDraftPr, pushForMove, type ActionResult } from "./integrate.ts";
import { DEVICE_BACK, DeviceOfflineError, deviceOf, isOffline, localFolderOps, remoteOps, type PlaceOps } from "./remote.ts";
import { createFolderStore, type CantKeep } from "./folder.ts";
import { join } from "node:path";
import { readShown, shownCode } from "./shown.ts";
import { limitHit, mergeLimits, type FailedOutcome } from "./limit-hit.ts";
import { wbHost, WbFail } from "./workbench.ts";
import { userEditsNote } from "./brief.ts";
import { MEM_PLUGIN_IDS } from "@ducter/protocol/src/mem-plugins.ts";
import { fill, words, type LangTag } from "@ducter/protocol/src/lang.ts";

/** task_state reason for a task whose worker dropped; clients render it as "<device> 连不上 / Can't reach <device>". */
export const unreachableReason = (device: string) => `device:unreachable:${device}`;
/** D157: a task waits for a computer that said it was going to sleep: 在等 · MacBook 睡着了. */
export const asleepReason = (device: string) => `device:asleep:${device}`;

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
  /**
   * D266: after a turn ended without a report while background work ran, how long the last
   * background task's end waits for the harness's own follow-up turn before the report nudge
   * goes (Claude Code starts one when a background task ends). Default 60 s.
   */
  backgroundSettleMs?: number;
  /**
   * D266: a background task the harness says nothing more about for this long stops holding the
   * session open (a shell that never ends must not pin a harness process forever). Default 12 h;
   * env DUCTER_BACKGROUND_CEILING_MS.
   */
  backgroundCeilingMs?: number;
}

/** Runner plus test/ops helpers that are not part of the contract. */
export interface RunnerExt extends Runner {
  /** D206: copies the files a report shows into the home's media (report_to_main `show`). */
  shown(taskId: string, paths: string[]): Promise<{ media: MediaRef[]; refused: string[] }>;
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
  /** D142: a non-git folder task's changes against the copy kept before it wrote. */
  folderChanges(taskId: string, opts?: { files?: boolean }): Promise<FolderChanges | undefined>;
  /** D142: the task reported done or failed: its 7 days start, and what it changed (for the report). */
  folderReport(taskId: string): Promise<FolderSummary | undefined>;
  undoFolder(taskId: string, opts?: { path?: string; force?: boolean }): Promise<{ ok: boolean; message: string; confirm?: UndoConfirm }>;
  keepFolder(taskId: string): Promise<{ ok: boolean; message: string }>;
  /** Alias of dispose, called by main on shutdown. */
  stop(): Promise<void>;
  /** Close all sessions and stop listening. */
  dispose(): Promise<void>;
}

/** What starting a task needs once its place is ready (open, or a computer that came back). */
/** D168: how long a task's first turn waits for its memories (a Cloud search takes ~4 s). */
const RECALL_MS = 6_000;
/** D339: how long words wait for a stopped turn's end before they go anyway. */
const STOP_SETTLE_MS = 15_000;
/** D282: how much of a task's own history a switch to another agent carries (the rest is in the Log). */
const CARRY_CHECKPOINTS = 6;
const CARRY_SAID = 5;
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

interface StartCtx {
  body: Bodies["task_open"];
  later: boolean;
  briefIn: string | Promise<string>;
  /** D206: the pictures an early brief carries, settled with it. */
  mediaIn?: Promise<MediaRef[]>;
  title: string;
  persona: string;
  partnerName: string;
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
  /** D282: each agent's last native session on this task, in this place: switching back resumes it. */
  past?: Record<string, string>;
  /** D282: switched back to an agent whose own session resumes: its first turn says what happened since. */
  backFrom?: string;
  /** D282: the model or effort changed mid-turn: the session reopens (resumed) before the next turn. */
  retune?: boolean;
  /** The archive horizon kept its worktree (leftovers) at this card updatedAt: don't retry until it changes. */
  archiveKeptAt?: string;
  running: boolean; // our view: a turn is in flight
  reportedThisTurn: boolean;
  /** D394: this turn armed a wait of the task's own that is still armed: it rests, owing no report. */
  restsThisTurn?: Set<string>;
  nudged: boolean;
  stallNoted: boolean;
  interruptRequested?: boolean; // the user stopped the current turn
  /**
   * D339: a turn being stopped (an interrupt sent while it worked, its end not yet in): words sent
   * meanwhile wait here and become the next turn once it has ended. Steered or queued into a turn
   * that is ending, they were lost or ran as a turn the runner didn't know of (a phone's Stop: its
   * note to the task, and the person's next words, got no answer).
   */
  stopping?: { since: number; words: { text: string; from: From; clientId?: string; media?: MediaRef[] }[]; timer?: ReturnType<typeof setTimeout> };
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
  /** D293: when its worker's socket dropped while the worker keeps the session (its grace). */
  awaySince?: number;
  /** D293: the reconnecting note was said for this drop (so "back" is said too). */
  awaySaid?: boolean;
  awayFrom?: Residency;
  /**
   * D266: the harness's own background work in this session (its background shells, Monitor,
   * background subagents), by its task id: what it is and when the harness last said anything
   * of it. Counted from the events, so a worker's session counts the same.
   */
  bg?: Map<string, { what?: string; seen: number }>;
  /** D266: a turn ended without a report while background work ran: the nudge waits for it. */
  bgOwed?: boolean;
  bgSettle?: ReturnType<typeof setTimeout>;
  /** D266: merged while background work ran: archived once it ends. */
  archiveWhenQuiet?: Place;
  // D135: the harness compacted this many times; asked to save before the next one; what the
  // next turn starts with (the save ask, the brief and progress again after a compaction).
  compactions: number;
  /** D297: the account's limits as this session said them last (a limit hit reads its reset here). */
  limitsSeen?: HarnessEvent["limits"];
  saveAsked: boolean;
  prefix: string[];
  /** D325: the person's words held for after this turn, in order (logged whole as task_held). */
  held: HeldMsg[];
  /** D325: steers sent and not yet seen by the agent: the seq of the words logged, the words, and
   *  the input id OAR carried (the agent's echo names it where it keeps one). */
  steers: { seq: number; text: string; id: string }[];
  context?: number; // the harness's last context reading
  /** D288: the window the harness reads against; the last reading logged for the meter; the
   *  first reading after a compaction is owed (its size after); a /compact asked mid-turn. */
  window?: number;
  loggedContext?: number;
  afterOwed?: boolean;
  compactAfterTurn?: boolean;
  /** D288: this turn is the person's own Compact now on Claude Code (`/compact` typed as a turn):
   *  it owes no report, so no nudge after it, and a finished task stays finished (live run,
   *  research/108: the nudge made a done task redo its work and the partner say it again). */
  compactTurn?: boolean;
  /** D142: the folder couldn't be copied; the task asked first. text: the turn held until the answer. */
  gated?: { text: string };
  /** D142: the user let it change the folder without a copy. */
  direct?: boolean;
  lang?: LangTag; // the language the user reads its reports in (D292: any tag)
  /** D157: waiting for its computer (asleep or can't be reached) before it ever started. */
  waiting?: StartCtx;
  /** D157: the user moved it to another computer; its next session starts with movedOver. */
  movedFrom?: { from: string; to: string; repo: boolean };
  /** D299: carried on from a session the person ran outside Ducter, by another agent: its first session starts with outsideOver. */
  outsideOver?: boolean;
}

/** The turn after a browser driver switch (D130): same task, now on Ducter's own browser. */
export const SWITCHED_TO_CUA =
  "Claude in Chrome is not connected, so Ducter moved you to its own browser: the `browser` MCP server, as \"Your browser\" in your instructions now describes. Do not use the Claude in Chrome tools again. Carry on with the task from where you were.";

/** D282: a slash command in the task's composer that Ducter itself runs. */
export type Slash = { cmd: "model"; arg: string } | { cmd: "effort"; arg: string } | { cmd: "compact" };

/**
 * D282: which of the person's slash commands Ducter runs, by agent. `/model <name>` and
 * `/effort <level>` everywhere (Ducter's in-place switch, so the card stays true and the meaning
 * is the same on every agent); a bare `/compact` on Codex, whose app-server takes no slash
 * commands (its compaction is OAR's). Everything else, Claude Code's own `/compact`, `/review`,
 * `/context`, the person's commands and skills among them, goes to the agent as typed (Claude
 * Code runs them headless: research/92 §4).
 */
export function slashOf(text: string, harness: string): Slash | undefined {
  const m = /^\/(model|effort|compact)(?:[ \t]+(\S+))?[ \t]*$/i.exec(text.trim());
  if (!m) return undefined;
  const cmd = m[1]!.toLowerCase();
  // D288: every agent but Claude Code (whose own /compact runs headless, instructions and all)
  // compacts through OAR's manual compaction (Codex thread/compact/start, pi its compact()).
  if (cmd === "compact") return !m[2] && harness !== "claude-code" ? { cmd: "compact" } : undefined;
  return m[2] ? { cmd: cmd as "model" | "effort", arg: m[2] } : undefined;
}

/**
 * A task's spec with its browser's parts (D62, D126, D130): the browser brief (its Go, untrusted
 * page and own-window rules), the cua-driver sidecar, and per harness a setup that leaves the
 * user's own config out: Claude Code `exclude`, its own built-ins kept but the two that start
 * agents (D240); Codex the clean setup that keeps its own browser and Computer Use plugins (its
 * subagents off, D240); pi its clean flags (its project's own AGENTS.md kept, D241); DeepSeek
 * Harness a home of Ducter's for the task, its own tools kept (D241). Every Codex task without
 * Codex's own browser gets the Computer Use rules (its Computer Use stays on).
 */
export function withBrowser(base: SessionSpec, sc: BrowserSidecar | undefined, partnerName: string): SessionSpec {
  const spec: SessionSpec = { ...base, mcp: [...base.mcp] };
  const h = spec.harness;
  if (sc) {
    spec.appendSystemPrompt = (spec.appendSystemPrompt ?? "") + sc.brief;
    if (sc.mcp) spec.mcp.push(sc.mcp);
    if (h === "claude-code") Object.assign(spec, sc.claude);
    if (h === "codex" || h === "deepseek-harness") spec.userConfiguration = "exclude";
    if (h === "pi") spec.isolateUserConfig = true;
  }
  if (h === "codex" && sc?.driver !== "native" && sc?.driver !== "ducter") spec.appendSystemPrompt = (spec.appendSystemPrompt ?? "") + codexComputerBrief(partnerName);
  return spec;
}

/**
 * D157: the place on the computer the ranking picked. A repo or a folder stays on its own computer;
 * work that browses gets a browser place there (its profile kept); anything else a place-less one.
 */
export function placeOn(p: Place | undefined, device: string, needs?: TaskNeeds): Place {
  if (p?.kind === "repo" || p?.kind === "folder") return p;
  if (p?.kind === "browser" || needs?.browse || needs?.signedIn) return { kind: "browser", device, profile: p?.kind === "browser" ? p.profile : "default" };
  return { kind: "none", device };
}

/** D142: the ask before a task changes a folder Ducter couldn't copy (a report from the runner). */
const WRITE_WORDS = {
  zh: {
    where: {
      cloud: "这个文件夹在{detail}里同步",
      network: "这个文件夹在网络盘上",
      external: "这个文件夹在外接硬盘上",
      too_big: "这个文件夹太大了{detail}",
      missing: "这个文件夹找不到了",
      copy_failed: "这个文件夹复制不了",
      holds_ducter: "这个文件夹里装着 Ducter 自己的数据",
    },
    cloudNone: "网盘",
    cloudDetail: " {detail} ",
    bigDetail: "（{detail}）",
    summary: "动手之前先问你：{where}，没法先留一份，改了就改不回去。",
    question: "直接改这个文件夹里的文件吗？改完没法改回去。",
  },
  en: {
    where: {
      cloud: "this folder syncs with {detail}",
      network: "this folder is on a network drive",
      external: "this folder is on an external drive",
      too_big: "this folder is too big to copy{detail}",
      missing: "the folder isn't there",
      copy_failed: "the folder couldn't be copied",
      holds_ducter: "this folder holds Ducter's own data",
    },
    cloudNone: "a cloud drive",
    cloudDetail: "{detail}",
    bigDetail: " ({detail})",
    summary: "Before changing anything: {where}, so Ducter can't keep a copy to undo with. Changes made there can't be undone.",
    question: "Change the files in this folder directly, with no way to undo?",
  },
};
export function askBeforeWriting(why: CantKeep, detail: string | undefined, lang: LangTag | undefined): { summary: string; question: string } {
  const w = words(WRITE_WORDS, lang);
  const d = why === "cloud" ? (detail ? fill(w.cloudDetail, { detail }) : w.cloudNone) : why === "too_big" && detail ? fill(w.bigDetail, { detail }) : "";
  return { summary: fill(w.summary, { where: fill(w.where[why], { detail: d }) }), question: w.question };
}

/** D157: the where ask's one line (askWhere). */
const WHERE_WORDS = {
  zh: {
    pin: "{agent} 只在 {dev} 上，它现在连不上。等它，还是换个来做？",
    asleep: "{dev} 睡着了。等它醒了{chrome}做，还是现在在 {other} 上做？",
    chrome: "用你的 Chrome ",
  },
  en: {
    pin: "{agent} is only on {dev}, and it can't be reached. Wait, or have someone else do it?",
    asleep: "{dev} is asleep. Wait{chrome}, or do it on {other} now?",
    chrome: " and use your Chrome there",
  },
};

const FINISHED: Attention[] = ["done_claimed", "done", "failed", "dropped"];

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
  // D151: a server's browser places run on Ducter's own browser, held by core.
  const browserOpts: BrowserOptions = { ...opts.browser, ...(opts.browser?.ducter ?? core.browser ? { ducter: opts.browser?.ducter ?? core.browser } : {}) };
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? shortId;
  const tasks = new Map<string, TaskRt>();
  const graceMs = opts.offlineGraceMs ?? Number(process.env.DUCTER_OFFLINE_GRACE_MS || 120_000);
  const parkMs = opts.parkIdleMs ?? Number(process.env.DUCTER_PARK_IDLE_MS || 15 * 60_000);
  const archiveIdleMs = opts.archiveIdleMs ?? Number(process.env.DUCTER_ARCHIVE_IDLE_MS ?? 14 * 24 * 3600_000);
  const bgSettleMs = opts.backgroundSettleMs ?? 60_000;
  const bgCeilingMs = opts.backgroundCeilingMs ?? Number(process.env.DUCTER_BACKGROUND_CEILING_MS || 12 * 3600_000);
  // D142: copies of non-git folders, kept 7 days after their task finished. Swept hourly.
  const folders = createFolderStore({ root: join(core.dataDir, "snapshots"), now: () => now().getTime() });
  const sweepFolders = () => {
    try {
      folders.sweep();
    } catch (err) {
      console.warn("[runner] folder sweep failed:", (err as Error).message);
    }
  };
  sweepFolders();
  // D214: the workbench for the tasks on this machine; what the user changed in each task's files
  // since its last turn, said to it with the next one.
  const bench = wbHost({ dataDir: core.dataDir, folders: { changes: (id, o) => folders.changes(id, o), undo: (id, o) => folders.undo(id, o) } });
  const userEdits = new Map<string, Map<string, "edited" | "reverted">>();
  const takeEdits = (taskId: string, text: string): string => {
    const e = userEdits.get(taskId);
    if (!e?.size) return text;
    userEdits.delete(taskId);
    return `${userEditsNote([...e].map(([path, how]) => ({ path, how })))}\n\n${text}`;
  };
  const folderTimer = setInterval(sweepFolders, 60 * 60_000);
  (folderTimer as { unref?: () => void }).unref?.();
  const localOps: PlaceOps = {
    plan: (place, id, title) => planPlace(place, id, title, core.dataDir),
    provision: (r) => provisionPlace(r),
    harness,
    merge: (place) => mergeTaskBranch(place),
    push: (place) => pushForMove(place),
    openPr: (place) => openDraftPr(place, { gh: opts.gh }),
    changes: (place) => branchChanges(place),
    archive: (place, o) => archiveWorktree(place, core.dataDir, o),
    folder: localFolderOps(folders),
    shown: async (a) => readShown(a, { dataDir: core.dataDir }),
    wb: (a) => bench.op(a),
  };
  /** D157: a browser place's browser, on the computer the place is on (a worker builds its own). */
  const sidecarFor = async (ops: PlaceOps, input: SidecarInput): Promise<BrowserSidecar | undefined> =>
    input.place.kind !== "browser" ? undefined : ops.device && ops.browser ? ops.browser(input) : browserSidecar(input, browserOpts);

  /** A paired worker's ops when the place names one; any other name (e.g. "mac") is this machine. */
  function opsFor(place: Place | undefined): PlaceOps {
    const device = deviceOf(place);
    const link = device ? core.workers?.link(device) : undefined;
    return link ? remoteOps(link, { ...(browserOpts.ducter ? { ducter: browserOpts.ducter } : {}) }) : localOps;
  }

  const unsubscribe = core.log.subscribe((e: LogEvent) => {
    if (e.kind === "waiter") {
      // D394: a turn that ends resting on its own wait (wait_for) has said what comes next: a
      // round that found nothing new owes no report, so it is never nudged into "nothing new".
      const w = e.body as Bodies["waiter"];
      const t = w.taskId ? tasks.get(w.taskId) : undefined;
      if (!t) return;
      if (w.state === "armed" && t.running) (t.restsThisTurn ??= new Set()).add(w.waiterId);
      else if (w.state !== "armed") t.restsThisTurn?.delete(w.waiterId);
      return;
    }
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
    return core.log.append({ persona: t.persona, stream: stream(t.id), origin: "task", kind: "task_event", body: { taskId: t.id, ...ev } });
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

  /**
   * D266: the harness's background work still running in this session. A task the harness has
   * said nothing of for bgCeilingMs stops counting (said once in the task's log): a background
   * job that never ends must not keep a harness process forever.
   */
  function bgLive(t: TaskRt): number {
    if (!t.bg?.size) return 0;
    const at = now().getTime();
    for (const [id, b] of t.bg)
      if (bgCeilingMs > 0 && at - b.seen >= bgCeilingMs) {
        t.bg.delete(id);
        logEvent(t, { role: "system", from: "runner", text: `background work quiet for ${Math.round(bgCeilingMs / 3600_000)} h${b.what ? ` (${b.what})` : ""}; no longer keeping the session open for it`, raw: { backgroundCeiling: true } });
      }
    return t.bg.size;
  }

  /** D266: one background report from the harness (normalize.ts): counted, logged as a step. */
  function onBackground(t: TaskRt, ev: HarnessEvent) {
    const b = (ev.raw as { background?: { id?: string; act?: string; what?: string; type?: string } }).background;
    if (!b?.id) return;
    const wasLive = bgLive(t);
    if (b.act === "started") (t.bg ??= new Map()).set(b.id, { ...(b.what ? { what: b.what } : {}), seen: now().getTime() });
    else t.bg?.delete(b.id);
    logEvent(t, { role: "system", text: preview(ev.text ?? "", 500), raw: { background: { act: b.act, ...(b.type ? { type: b.type } : {}), ...(b.what ? { what: b.what } : {}) } } });
    const live = bgLive(t);
    if (live > 0 || wasLive === 0 || t.dropped || isBusy(t)) return;
    // The last one ended between turns: the session may idle and park again.
    if (t.archiveWhenQuiet) {
      const place = t.archiveWhenQuiet;
      t.archiveWhenQuiet = undefined;
      void archiveAfterMerge(t, place);
      return;
    }
    if (t.session) {
      setState(t, currentAttention(t), "warm");
      if (!t.bgOwed) armPark(t); // owed: the nudge's turn (or its own) parks it after
    }
    // Claude Code starts a turn of its own when a background task ends; that turn's end decides.
    // Without one in bgSettleMs, the report it owes is asked for as after any silent turn.
    if (t.bgOwed) {
      clearTimeout(t.bgSettle);
      t.bgSettle = setTimeout(() => {
        t.bgSettle = undefined;
        if (!t.bgOwed || t.dropped || isBusy(t) || bgLive(t) > 0 || !t.session) return;
        t.bgOwed = false;
        armPark(t);
        void missedReport(t);
      }, bgSettleMs);
    }
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
    // D266: closing it would kill its background shells and subagents with the process.
    if (bgLive(t) > 0 || t.bgSettle) return armPark(t);
    if (t.archiveWhenQuiet) {
      const place = t.archiveWhenQuiet;
      t.archiveWhenQuiet = undefined;
      return archiveAfterMerge(t, place);
    }
    t.session = undefined; // first: input arriving from now on resumes instead of using it
    t.running = false;
    setState(t, currentAttention(t), "parked");
    await s.close().catch(() => {});
  }

  // ---------- D142: a folder that isn't a git repo ----------
  const folderOf = (t: TaskRt): string | undefined => {
    const p = core.tasks.get(t.id)?.place ?? t.card.place;
    return p.kind === "folder" ? p.path : undefined;
  };

  /** Keep a copy of the folder before the task writes (once; a kept or undone one is taken
   *  again). Why it couldn't, or undefined when there is one (or the user said go without). */
  async function keepCopy(t: TaskRt): Promise<{ why: CantKeep; detail?: string } | undefined> {
    const f = folderOf(t);
    if (!f || t.direct) return undefined;
    try {
      const r = await t.ops.folder.prepare(t.id, f);
      if (r.ok) {
        if (r.fresh) logEvent(t, { role: "system", from: "runner", raw: { folder: { copy: r.method } } });
        return undefined;
      }
      return { why: r.why, ...(r.detail ? { detail: r.detail } : {}) };
    } catch (err) {
      if (isOffline(err)) throw err;
      return { why: "copy_failed", detail: preview(err instanceof Error ? err.message : String(err), 200) };
    }
  }

  /** The folder can't be copied: hold the turn and ask first, in a plain sentence (the partner
   *  says it in its own words). Hold is the default; Go or a reply sends the held turn (send). */
  function askFirst(t: TaskRt, cant: { why: CantKeep; detail?: string }, text: string) {
    t.gated = { text };
    t.running = false;
    const a = askBeforeWriting(cant.why, cant.detail, t.lang);
    logEvent(t, { role: "system", from: "runner", raw: { folder: { ask: cant.why, ...(cant.detail ? { detail: cant.detail } : {}) } } });
    core.log.append({
      persona: t.persona,
      stream: stream(t.id),
      origin: "task",
      kind: "report",
      body: { taskId: t.id, state: "needs_input", summary: a.summary, questions: [{ id: "folder", text: a.question, blocking: true, reversible: false }], evidence: [] },
    });
    setState(t, "needs_you", t.session ? "warm" : "parked");
  }

  /** Returns false when the turn was held for the folder question (askFirst). */
  async function sendTurn(t: TaskRt, text: string, from: From, logged = false, media?: MediaRef[]): Promise<boolean> {
    clearTimeout(t.parkTimer);
    if (folderOf(t) && !t.gated) {
      const cant = await keepCopy(t);
      if (cant) {
        if (!logged && from !== "runner") logInput(t, text, from, "turn", undefined, media);
        askFirst(t, cant, text);
        return false;
      }
    }
    t.running = true;
    setState(t, t.compactTurn ? currentAttention(t) : "working", "hot");
    await deliver(t, text, "turn", from, logged, media);
    return true;
  }

  // clientId: the client's id for a user's task_send, so core can tell a resend from a new message.
  const logInput = (t: TaskRt, text: string, from: From, mode: string, clientId?: string, media?: MediaRef[]) =>
    logEvent(t, { role: "user", from, text: preview(text, 16 * 1024), ...(clientId ? { clientId } : {}), ...(media?.length ? { media } : {}), raw: { delivered: mode } });

  /**
   * D206: the pictures for the agent, as files on the home (a worker's session ships their bytes),
   * and a line for an agent that can't see them, so it never answers as if it had.
   */
  function picturesFor(t: TaskRt, media: MediaRef[] | undefined): { images: SendImage[]; note?: string } {
    const pics = (media ?? []).filter(isImage);
    if (!pics.length) return { images: [] };
    const h = t.spec.harness as HarnessId;
    if (HARNESS_INFO[h] && !HARNESS_INFO[h].images)
      return { images: [], note: `(${pics.length === 1 ? "A picture came" : `${pics.length} pictures came`} with this message, but ${harnessName(h)} can't see pictures. Say so in your report if the work needs them.)` };
    const images = pics.flatMap((m) => {
      const path = core.media?.path(m.id);
      return path ? [{ path, mediaType: m.type }] : [];
    });
    return { images };
  }

  /**
   * D259: the files (not pictures) the user sent, as one line naming each with its kind, size and
   * where it is: a copy under its own name on the home (a worker's session brings the bytes over
   * and names its own path). Every agent reads them with its own tools, whatever it can see.
   */
  function filesFor(media: MediaRef[] | undefined): { files: SendFile[]; note?: string } {
    const docs = (media ?? []).filter((m) => !isImage(m));
    if (!docs.length) return { files: [] };
    const files: SendFile[] = [];
    const words: string[] = [];
    for (const m of docs) {
      const path = core.media?.named?.(m.id) ?? core.media?.path(m.id);
      const name = m.name ?? `file-${m.id.slice(0, 12)}`;
      if (path) files.push({ path, name });
      words.push(`"${name}" (${kindWords(m)}, ${sizeWords(m.bytes)})${path ? ` at ${path}` : " (not on this computer any more)"}`);
    }
    const one = docs.length === 1;
    return {
      files,
      note: `(The user sent ${one ? "a file" : `${docs.length} files`} with this message: ${words.join("; ")}. Read ${one ? "it" : "them"} there with your own tools when the work needs ${one ? "it" : "them"}; ${one ? "it is a copy" : "they are copies"}: anything you change or make goes in your own folder.)`,
    };
  }

  /** Logs the text first (the Log is the record even if delivery fails), then delivers it. */
  async function deliver(t: TaskRt, text: string, mode: "turn" | "steer" | "queue", from: From, logged = false, media?: MediaRef[], inputId?: string) {
    // D135: what waits for the next turn (the save ask; the brief and progress after a
    // compaction) goes first, logged as the runner's own words. Never before a /compact (D288): it
    // has to stay the message's first word to be a command; it waits for the words after.
    let sent = text;
    if (mode === "turn" && t.prefix.length && !t.compactTurn) {
      const pre = t.prefix.splice(0).join("\n\n");
      logInput(t, pre, "runner", "prefix");
      sent = `${pre}\n\n---\n\n${text}`;
    }
    if (!logged) logInput(t, text, from, mode, undefined, media);
    const pics = picturesFor(t, media);
    if (pics.note) sent = `${sent}\n\n${pics.note}`;
    const docs = filesFor(media);
    if (docs.note) sent = `${sent}\n\n${docs.note}`;
    try {
      await t.session!.send(sent, mode, pics.images.length ? pics.images : undefined, docs.files.length ? docs.files : undefined, inputId);
    } catch (err) {
      if (mode === "turn") t.running = false;
      logEvent(t, { role: "system", from: "runner", text: `delivery failed: ${preview(String(err), 500)}` });
      throw err;
    }
  }

  // ---------- D325: the person's held words, and their steers seen ----------

  /** The whole queue as it is now, logged (the card and every client read it from there). */
  function setHeld(t: TaskRt, held: HeldMsg[]) {
    t.held = held;
    core.log.append({ persona: t.persona, stream: stream(t.id), origin: "task", kind: "task_held", body: { taskId: t.id, held } });
  }

  /**
   * What is held goes first, in order, each logged as the person's own words, then `text`: one
   * turn carrying all of them (the agent reads them in the order they were written).
   */
  function withHeld(t: TaskRt, text: string, media?: MediaRef[]): { text: string; media?: MediaRef[] } {
    const held = t.held;
    if (!held.length) return { text, ...(media?.length ? { media } : {}) };
    setHeld(t, []);
    for (const h of held) logInput(t, h.text, "user", "turn", h.id, h.media);
    const all = [...held.flatMap((h) => h.media ?? []), ...(media ?? [])];
    return { text: [...held.map((h) => h.text), text].filter((s) => s.trim()).join("\n\n"), ...(all.length ? { media: all } : {}) };
  }

  /** The turn ended: what was held is the next turn. */
  async function drainHeld(t: TaskRt) {
    const next = withHeld(t, "");
    t.nudged = false;
    t.stallNoted = false;
    await sendTurn(t, takeEdits(t.id, next.text), "user", true, next.media);
  }

  /**
   * The agent's own echo of words it took in (OAR's user_message: Claude Code's replay, Codex's
   * userMessage item, pi's and DeepSeek Harness's user message): the steers it names, and every
   * one sent before them, were read at this step. Said once, as `read` (the seqs of the words).
   * Matched by the input id where the agent keeps it (Claude Code's uuid, Codex's clientId,
   * DeepSeek Harness's id), else by the words (pi; a worker before the id was passed).
   */
  function steerSeen(t: TaskRt, input: string, inputId?: string) {
    if (!t.steers.length) return;
    const flat = (s: string) => s.replace(/\s+/g, " ").trim();
    const said = flat(input);
    let i = inputId ? t.steers.findIndex((s) => s.id === inputId) : -1;
    if (i < 0)
      i = t.steers.findLastIndex((s) => {
        const w = flat(s.text).slice(0, 200);
        return !!w && said.includes(w);
      });
    if (i < 0) return;
    const seen = t.steers.splice(0, i + 1);
    logEvent(t, { role: "system", from: "runner", raw: { read: seen.map((s) => s.seq) } });
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
    (t.past ??= {})[t.spec.harness] = id; // D282: switching back to this agent resumes it
    // On a worker, the cwd was planned there: record it, a restarted main resumes from it.
    logEvent(t, { role: "system", from: "runner", text: "session started", raw: { sessionId: id, harness: t.spec.harness, ...(t.ops.device ? { cwd: t.spec.cwd, device: t.ops.device.id } : {}) } });
  }

  // D312: the partner the task is for (another partner's name in its brief); else the default's.
  const partnerNameOf = (persona?: string) => opts.partnerName ?? (persona !== undefined ? core.personaFor?.(persona).name : undefined) ?? core.persona.name ?? "Ducter";

  /**
   * Before every session start (open, recovery after a restart, reopen, resume, a switch of who
   * does it): a browser place has its browser for the harness doing it now, and the spec is
   * rebuilt from `base` with it. Throws (with the reason the partner tells) when the browser is
   * unavailable.
   */
  async function prepareSpec(t: TaskRt) {
    const h = t.base.harness;
    if (t.card.place?.kind === "browser" && (!t.sidecar || t.sidecarInput?.harness !== h)) {
      const prev = t.sidecarInput?.harness === h ? t.sidecarInput : undefined;
      const input: SidecarInput = { place: t.card.place, persona: t.persona, taskId: t.id, dataDir: core.dataDir, partnerName: partnerNameOf(t.persona), harness: h, ...(prev?.forceCua ? { forceCua: true } : {}) };
      const sc = await sidecarFor(t.ops, input);
      if (!sc) throw new Error("this browser place could not be prepared");
      await sc.ready();
      t.sidecar = sc;
      t.sidecarInput = input;
    }
    t.guard = h === "codex" ? (t.guard ?? computerUseGuard({ chromeOnly: true })) : undefined;
    t.spec = withBrowser(t.base, t.sidecar, partnerNameOf(t.persona));
  }

  async function startSession(t: TaskRt, resume: boolean) {
    await prepareSpec(t);
    // D156: its agent is being updated on this machine: start once the updater is done (at most 15 min).
    for (const end = Date.now() + 15 * 60_000; harnessHold.has(t.spec.harness) && !t.ops.device && Date.now() < end; ) await Bun.sleep(1000);
    const spec: SessionSpec = resume && t.sessionId ? { ...t.spec, resumeSessionId: t.sessionId } : t.spec;
    const session = await t.ops.harness.start(spec);
    t.session = session;
    t.bg?.clear(); // D266: a new process runs none of the old one's background work
    if (!spec.resumeSessionId) (t.context = undefined), (t.saveAsked = false); // a fresh context
    noteSessionId(t, session);
    // D293: its worker dropped and holds the session for a while (away), or came back with it (back).
    session.onLink?.((s) => (t.session === session ? (s === "away" ? linkAway(t) : linkBack(t)) : undefined));
    void pump(t, session);
  }

  /**
   * D293: the worker's socket dropped but the worker keeps the session for its grace: the task is
   * reconnecting, not lost. Work in flight says so in its transcript; nothing else changes yet.
   */
  function linkAway(t: TaskRt) {
    const d = t.ops.device;
    if (!d || t.dropped || t.awaySince !== undefined) return;
    t.awaySince = Date.now();
    t.awayFrom = t.residency;
    const was = currentAttention(t);
    setState(t, was, "offline");
    t.awaySaid = t.running || was === "working" || was === "queued";
    if (t.awaySaid) logEvent(t, { role: "system", from: "runner", text: `${d.name} dropped; reconnecting`, raw: { device: d.id, name: d.name, reconnecting: true } });
  }

  /** D293: back within the grace with the session still running: nothing was lost. */
  function linkBack(t: TaskRt) {
    const d = t.ops.device;
    if (!d || t.awaySince === undefined) return;
    t.awaySince = undefined;
    if (t.awaySaid) logEvent(t, { role: "system", from: "runner", text: `${d.name} is back; carrying on`, raw: { device: d.id, name: d.name, offline: false } });
    t.awaySaid = false;
    if (!t.dropped) setState(t, currentAttention(t), t.awayFrom ?? "hot");
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
      const back = t.backFrom;
      try {
        await startSession(t, true);
        t.backFrom = undefined;
        // D282: back in this agent's own earlier session: it hears what happened since.
        return back ? handedBack(harnessName(back), progressOf(t).slice(-CARRY_CHECKPOINTS), await carryOver(t)) : "";
      } catch (err) {
        if (isOffline(err)) throw err;
        const why = preview(err instanceof Error ? err.message : String(err), 300);
        logEvent(t, { role: "system", from: "runner", text: `could not resume the session (${why}); started a new one from the brief and saved progress`, raw: { fresh: "resume_rejected" } });
        t.sessionId = undefined;
        t.backFrom = undefined;
      }
    }
    const progress = progressOf(t);
    const seed = t.movedFrom
      ? movedOver(t.movedFrom.from, t.movedFrom.to, progress, t.movedFrom.repo, await carryOver(t))
      : t.handedFrom
        ? t.outsideOver
          ? outsideOver(harnessName(t.handedFrom), await carryOver(t))
          : handedOver(harnessName(t.handedFrom), progress.slice(-CARRY_CHECKPOINTS), await carryOver(t))
        : startedAfresh(progress);
    t.movedFrom = undefined;
    t.outsideOver = undefined;
    await startSession(t, false);
    return seed;
  }

  /**
   * D282: the same agent with another model or effort. The spec changes now; the native session
   * reopens (resumed by its id) before the next turn: at once when idle, after the running turn
   * otherwise (send closes it then), so nothing the harness holds for this turn is lost.
   */
  async function retune(t: TaskRt, model: string | undefined, effort: string | undefined): Promise<{ ok: boolean; message?: string }> {
    const was = { model: t.base.model, effort: t.base.effort };
    const nextModel = model ?? t.base.model;
    // D202: the effort moves with the same model; another model runs at its own default unless one is picked.
    const nextEffort = effort ?? (nextModel === was.model ? was.effort : undefined);
    if (nextModel === was.model && nextEffort === was.effort) return { ok: true };
    t.base = { ...t.base };
    if (nextModel) t.base.model = nextModel;
    else delete t.base.model;
    if (nextEffort) t.base.effort = nextEffort;
    else delete t.base.effort;
    t.spec = { ...t.spec, ...(nextModel ? { model: nextModel } : {}), ...(nextEffort ? { effort: nextEffort } : {}) };
    if (!nextModel) delete t.spec.model;
    if (!nextEffort) delete t.spec.effort;
    t.card = { ...t.card, ...(nextModel ? { model: nextModel } : {}) };
    logEvent(t, { role: "system", from: "runner", text: `now on ${[nextModel, nextEffort].filter(Boolean).join(" · ") || "the default model"}`, raw: { retuned: { harness: t.base.harness, ...(nextModel ? { model: nextModel } : {}), ...(nextEffort ? { effort: nextEffort } : {}) } } });
    if (!t.session) return { ok: true }; // the next start opens with them
    if (isBusy(t)) {
      t.retune = true;
      return { ok: true };
    }
    await reopenForRetune(t);
    return { ok: true };
  }

  /** D282: runs the person's /model, /effort (and Codex's /compact) for them; the command shows as their words. */
  /**
   * D288: 现在压缩 / Compact now on an agent that takes no /compact of its own: OAR's manual
   * compaction (each runtime takes it only between turns, so mid-turn it waits for the turn to end).
   * The compaction itself logs as any other (its hairline, and the brief again after it).
   */
  async function compactNow(t: TaskRt) {
    const fail = (why: string) => logEvent(t, { role: "system", from: "runner", text: `could not compact: ${why}`, raw: { slash: "compact", failed: why } });
    const s = t.session;
    if (!s) return void fail("its agent isn't running now");
    if (!s.compact) return void fail("this agent can't be asked to compact here");
    if (isBusy(t)) {
      t.compactAfterTurn = true;
      return;
    }
    await s.compact().catch((err) => fail(preview(String(err), 300) ?? "compaction failed"));
  }

  async function runSlash(t: TaskRt, slash: Slash, text: string, clientId?: string): Promise<{ delivered: Delivery }> {
    logInput(t, text, "user", "turn", clientId);
    const fail = (why: string) => logEvent(t, { role: "system", from: "runner", text: `could not switch: ${why}`, raw: { slash: slash.cmd, failed: why } });
    if (slash.cmd === "compact") {
      await compactNow(t);
      return { delivered: "prompted" };
    }
    const h = t.base.harness;
    const listed = await Promise.race([t.ops.harness.models?.(h).catch(() => undefined), Bun.sleep(20_000).then(() => undefined)]);
    let model = t.base.model;
    if (slash.cmd === "model") {
      const want = slash.arg.toLowerCase();
      const hits = listed?.filter((m) => m.id.toLowerCase() === want || m.label.toLowerCase() === want);
      const near = listed?.filter((m) => m.id.toLowerCase().includes(want) || m.label.toLowerCase().includes(want));
      // D352: as people say it too ("/model 6.2 sol"), the same match as the partner's task_switch.
      const said = listed?.length ? resolveModel(h, slash.arg, listed) : undefined;
      const pick = hits?.[0] ?? (said && "id" in said ? listed?.find((m) => m.id === said.id) : undefined) ?? (near?.length === 1 ? near[0] : undefined);
      if (listed?.length && !pick) {
        fail(`${harnessName(h)} here has no model "${slash.arg}" (${listed.map((m) => m.id).join(", ")})`);
        return { delivered: "prompted" };
      }
      model = pick?.id ?? slash.arg;
    }
    const effort = slash.cmd === "effort" ? slash.arg.toLowerCase() : undefined;
    const entry = listed?.find((m) => m.id === model) ?? (model ? undefined : listed?.find((m) => m.default));
    const levels = entry?.efforts;
    if (effort && levels && !levels.includes(effort)) {
      fail(`${model ?? harnessName(h)} takes effort ${levels.join(", ")}`);
      return { delivered: "prompted" };
    }
    if (effort && entry && !levels) {
      fail(`${model ?? harnessName(h)} has no effort levels here`);
      return { delivered: "prompted" };
    }
    await retune(t, slash.cmd === "model" ? model : undefined, effort);
    core.log.append({ persona: t.persona, stream: stream(t.id), origin: "user", kind: "body_selected", body: { taskId: t.id, harness: h, ...(t.base.model ? { model: t.base.model } : {}), ...(t.base.effort ? { effort: t.base.effort } : {}), why: { kind: "you" } } });
    return { delivered: "prompted" };
  }

  /** D282: closes the session on purpose, keeping its id, so the next turn resumes it with the new options. */
  async function reopenForRetune(t: TaskRt) {
    t.retune = false;
    const s = t.session;
    if (!s) return;
    t.retired = s;
    t.session = undefined;
    t.running = false;
    await s.close().catch(() => {});
    setState(t, currentAttention(t), "parked");
  }

  /**
   * D282: the task's own history, condensed for another agent: its last report and its questions,
   * the person's words since, the agent's last words, and what the branch holds. From the Log, so
   * it holds after a restart too; the branch only when it answers within two seconds.
   */
  async function carryOver(t: TaskRt): Promise<CarryOver> {
    const evs = core.log.read({ stream: stream(t.id), kinds: ["report", "task_event"], limit: 50_000 });
    const out: CarryOver = {};
    let after = -1;
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i]!;
      if (e.kind !== "report") continue;
      const r = e.body as Bodies["report"];
      if (r.state === "progress") continue;
      out.report = { state: r.state, summary: clip(r.summary, 600), questions: (r.questions ?? []).map((q) => clip(`${q.text}${q.default ? ` (default: ${q.default})` : ""}`, 300)) };
      after = e.seq;
      break;
    }
    const said: string[] = [];
    for (const e of evs) {
      if (e.kind !== "task_event" || e.seq <= after) continue;
      const b = e.body as Bodies["task_event"];
      if (b.role === "user" && b.from === "user" && b.text?.trim()) said.push(clip(b.text.trim(), 400));
    }
    if (said.length) out.said = said.slice(-CARRY_SAID);
    for (let i = evs.length - 1; i >= 0; i--) {
      const b = evs[i]!.body as Bodies["task_event"];
      if (evs[i]!.kind === "task_event" && b.role === "assistant" && b.text?.trim()) {
        out.lastWords = clip(b.text.trim(), 600);
        break;
      }
    }
    const place = core.tasks.get(t.id)?.place ?? t.card.place;
    if (place?.kind === "repo") {
      const b = await Promise.race([t.ops.changes(place).catch(() => undefined), Bun.sleep(2000).then(() => undefined)]);
      if (b) out.branch = { commits: b.commits, uncommitted: b.uncommitted, ...(b.files !== undefined ? { files: b.files, adds: b.adds, dels: b.dels } : {}) };
    }
    return out;
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
    // D266: its background work went with its process.
    if (!t.session || t.session === session) {
      t.bg?.clear();
      t.bgOwed = false;
      clearTimeout(t.bgSettle);
      t.bgSettle = undefined;
    }
    if (t.session === session) {
      const wasRunning = t.running;
      t.steers = []; // D325: what that session never echoed it won't now
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
    // D293: the worker's grace already ran (it held the session and didn't come back): the wait
    // before 连不上 counts from the drop, not from now.
    const heldFor = t.awaySince !== undefined ? Date.now() - t.awaySince : 0;
    t.awaySince = undefined;
    t.awaySaid = false;
    // Only work in flight is said out loud; an idle task just shows its machine as away.
    if (t.resumeOnBack) logEvent(t, { role: "system", from: "runner", text: `${d.name} disconnected; the task carries on when it is back`, raw: { device: d.id, name: d.name, offline: true } });
    clearTimeout(t.offlineTimer);
    // Short blips stay silent (D52); past the grace, working tasks show as waiting on the device.
    if (t.resumeOnBack)
      t.offlineTimer = setTimeout(() => {
        if (!d.online() && !t.dropped && !t.session) setState(t, "blocked", "offline", unreachableReason(d.name));
      }, Math.max(0, graceMs - heldFor));
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
    logEvent(t, { role: "system", from: "runner", text: `${d.name} is back; resuming the session`, raw: { device: d.id, name: d.name, offline: false } });
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
    // The person's own Compact now: the brief again goes before their next words, never into
    // the compacting turn itself (steered in, it reads as "carry on" and the agent redoes the work).
    if (t.compactTurn) t.prefix.push(afterCompaction(brief, progress));
    else sayBeforeNextInput(t, afterCompaction(brief, progress));
  }

  function handleEvent(t: TaskRt, ev: HarnessEvent) {
    const status = ev.tool && t.sidecar?.statusFor(ev.tool);
    if (status) logEvent(t, { role: "system", text: status.text, raw: { browser: { host: status.host, url: status.url, ...(status.own ? { own: true } : {}) } } });
    const early = (ev.raw as { kind?: string } | undefined)?.kind;
    if (early === "tool_call_started" || early === "tool_call_title" || early === "tool_call_head") return; // the ended event logs the call
    if (early === "background") return onBackground(t, ev);
    // D325: the agent took words in (its own echo): a steer of the person's was read.
    if (early === "user_echo") {
      const echo = ev.raw as { input?: string; inputId?: string };
      return steerSeen(t, String(echo.input ?? ""), typeof echo.inputId === "string" ? echo.inputId : undefined);
    }
    if (ev.tool && /(^|__)report_to_main$/.test(ev.tool.name) && ev.tool.ok !== false) t.reportedThisTurn = true;
    // D288: the account's limits as the session said them, kept with the agent's last read.
    if (ev.limits) {
      // D297: what the session said last, for the reset of a limit that refuses the next turn.
      t.limitsSeen = mergeLimits(t.limitsSeen, ev.limits);
      return void core.limits?.seen(t.base.harness, ev.limits);
    }
    // D135: save before the harness compacts; the brief and progress again after it.
    const compactAt = t.spec.harnessCompactAt ?? taskWindows().compactAt;
    if (ev.usage?.contextWindow) t.window = ev.usage.contextWindow;
    const window = t.window ?? t.spec.contextWindow ?? taskWindows().window;
    if (ev.usage?.contextTokens) {
      t.context = ev.usage.contextTokens;
      const near = saveBeforeAt(compactAt);
      if (!t.saveAsked && t.context >= near) {
        t.saveAsked = true;
        sayBeforeNextInput(t, SAVE_BEFORE_COMPACT);
      }
      // D288: the reading for the task's context meter, logged as it moves (every 5% of the
      // window, at the save point, and the first one after a compaction: its size after).
      const was = t.loggedContext;
      const moved = was === undefined || Math.abs(t.context - was) >= Math.max(2000, Math.round(window * 0.05)) || (was < near) !== (t.context < near);
      // A turn end carries its reading in its own usage.
      if (ev.turnEnd) t.loggedContext = t.afterOwed ? was : t.context;
      if (t.afterOwed || (moved && !ev.turnEnd)) {
        logEvent(t, { role: "system", raw: { kind: "context", contextTokens: t.context, contextWindow: window, compactAt, ...(t.afterOwed ? { after: true } : {}) } });
        t.loggedContext = t.context;
        t.afterOwed = false;
      }
    }
    const compaction = early === "compaction_ended" || early === "compaction_started" ? (ev.raw as { kind: string; outcome?: string; trigger?: string; before?: number; after?: number }) : undefined;
    const compacted = compaction?.kind === "compaction_ended" && (compaction.outcome ?? "completed") === "completed";
    if (compaction) {
      // Logged first (with the count and the size it had reached), then the brief goes back in.
      // D288: before and after, the agent's own sizes when it gives them (Claude Code), else the
      // last reading before, and the first reading after (logged as a context line with after).
      const text = ev.text ?? (compaction.kind === "compaction_started" ? "compaction started" : `compaction ${compaction.outcome ?? "completed"}`);
      const before = compaction.before ?? t.context;
      const sizes = compacted ? { ...(before ? { before } : {}), contextWindow: window, compactAt } : {};
      logEvent(t, { role: "system", text, raw: { ...compaction, ...(compacted ? { compactions: t.compactions + 1 } : {}), ...(t.context ? { contextTokens: t.context } : {}), ...sizes } });
      if (compacted) {
        onCompacted(t);
        t.loggedContext = compaction.after;
        t.afterOwed = !compaction.after;
        if (compaction.after) t.context = compaction.after;
      }
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
    if (ev.turnEnd && ev.usage) body.usage = { ...ev.usage, contextWindow: window, compactAt };
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
      cua = await sidecarFor(t.ops, { ...input, forceCua: true });
    } catch (err) {
      cua = undefined;
      const reason = preview(err instanceof Error ? err.message : String(err), 400);
      logEvent(t, { role: "system", from: "runner", text: `Claude in Chrome isn't connected, and Ducter's own browser isn't available: ${reason}` });
    }
    await old.close().catch(() => {});
    if (!cua) {
      t.running = false;
      setState(t, "blocked", "parked", "browser:native_missing"); // the clients word it (D207)
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
    const rests = !busy && (t.restsThisTurn?.size ?? 0) > 0;
    if (!busy) t.restsThisTurn = undefined;
    const compactTurn = !busy && !!t.compactTurn;
    if (!busy) t.compactTurn = false;
    // D288: a /compact asked mid-turn runs once the turn is over.
    const compactsNow = !!t.compactAfterTurn && !busy;
    if (compactsNow) {
      t.compactAfterTurn = false;
      void compactNow(t);
    }
    const stopped = t.interruptRequested && outcome === "aborted";
    if (outcome) t.interruptRequested = false;
    // D339: words sent while it was being stopped are the next turn, now that it has ended.
    const after = takeStopping(t);
    // D266: a turn (its own, after a background task ended, or any other) settles what was owed.
    t.bgOwed = false;
    clearTimeout(t.bgSettle);
    t.bgSettle = undefined;
    // D325: the turn is over and the person held words for after it: they are the next turn
    // (not after a Stop, a failure or a limit: held, the person says them now or changes them).
    if (!busy && !t.dropped && t.held.length && (outcome ?? "completed") === "completed" && !compactTurn && !compactsNow) {
      try {
        await drainHeld(t);
      } catch (err) {
        logEvent(t, { role: "system", text: `held words failed: ${preview(String(err), 500)}` });
      }
      if (after.length && !t.dropped) void sayAfterStop(t, after);
      return;
    }
    // D266: its background shells and subagents still run: the session is at work, not idle.
    const bg = busy ? 0 : bgLive(t);
    // Stopped by the user: it is not working any more, it waits for them (truthful card).
    if (!busy && !t.dropped) setState(t, stopped && currentAttention(t) === "working" ? "blocked" : currentAttention(t), bg > 0 ? "hot" : "warm");
    if (!busy && !t.dropped) armPark(t);
    else clearTimeout(t.parkTimer);
    if (after.length && !t.dropped) {
      void sayAfterStop(t, after);
      return;
    }
    // A finished browser task quits its browser cleanly so sign-ins are saved (browser.ts).
    if (!busy && t.sidecar && ["done_claimed", "done", "failed"].includes(currentAttention(t))) void t.sidecar.close().catch(() => false);
    // D142: a finished folder task: what the folder looks like now, and its 7 days start.
    if (!busy && folderOf(t) && FINISHED.includes(currentAttention(t))) await t.ops.folder.finish(t.id).catch(() => {});
    if (t.dropped || busy) return;
    // D297: the agent's usage limit ran out: no nudge, no failure. Core decides (wait for the
    // reset and carry on in this same session, or hand it to another agent now; nothing for a
    // task that already said it is done).
    const hit = limitHit(t.spec.harness, ev.raw as FailedOutcome, t.limitsSeen, Date.now());
    if (hit) {
      logEvent(t, { role: "system", from: "runner", text: `usage limit: ${t.spec.harness}${hit.resetsAt ? ` resets ${hit.resetsAt}` : ""}`, raw: { limit: hit } });
      t.limitsSeen = undefined;
      t.nudged = false;
      t.stallNoted = false;
      return;
    }
    if (reported || rests) {
      t.nudged = false;
      t.stallNoted = false;
      return;
    }
    if (outcome && outcome !== "completed") return; // aborted/failed: no nudge
    if (compactTurn) return; // Compact now owes no report
    // D266: it ended its turn to let background work run, not to stop: no nudge, no miss. The
    // last background task's end asks again (onBackground).
    if (bg > 0) {
      t.bgOwed = true;
      return;
    }
    await missedReport(t);
  }

  /** D339: what waited for a stopping turn to end, taken (and the wait cleared). */
  function takeStopping(t: TaskRt) {
    const st = t.stopping;
    if (!st) return [];
    clearTimeout(st.timer);
    t.stopping = undefined;
    return st.words;
  }

  /** D339: the words that waited for the stop, in order: the first becomes the next turn, the rest join it. */
  async function sayAfterStop(t: TaskRt, words: NonNullable<TaskRt["stopping"]>["words"]) {
    for (const w of words) {
      try {
        await runner.send(t.id, w.text, undefined, w.from === "runner" ? "ducter" : w.from, w.clientId, w.media);
      } catch (err) {
        logEvent(t, { role: "system", from: "runner", text: `delivery failed: ${preview(String(err), 400)}` });
      }
    }
  }

  /** A turn ended with no report (the stall rule): one nudge; a second miss leaves it to the user. */
  async function missedReport(t: TaskRt) {
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
      // It stopped without reporting: the user's turn, not "working" (2026-11-11: a task on hel
      // read 在做 for four hours after it stalled and its harness exited). The note says why;
      // a message from the user sets it working again.
      if (currentAttention(t) === "working") setState(t, "needs_you", t.session ? "warm" : "parked");
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
    // D266: closing the session would kill what still runs in its background: archived when it ends.
    if (bgLive(t) > 0) {
      if (!t.archiveWhenQuiet) logEvent(t, { role: "system", from: "runner", text: `merged; ${bgLive(t)} background job(s) still running, so the session stays open and the task is archived when they end`, raw: { archive: "waits_background" } });
      t.archiveWhenQuiet = place;
      return;
    }
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
      if (!card || t.dropped || isBusy(t) || bgLive(t) > 0 || !["parked", "warm"].includes(card.residency)) continue;
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
        partnerName: partnerNameOf(core.tasks.get(id)?.persona),
        taskId: id,
        title: open.title,
        brief: briefed ? open.brief : null,
        place: open.place,
        cwd,
        project: open.project || undefined,
        mcpServerName: mcp.name,
        ...(open.language ? { language: open.language } : {}),
        // D168: the user's Nowledge Mem plugin where it is on that computer, else Ducter's own
        // read-only memory; a browser task gets none (as with the Log, D62).
        ...((m) => (m === "plugin" || m === "ducter" ? { memory: m } : {}))(memoryMode(open.place, open.harness)),
        // D217: work on Ducter's phone gets the phone's section (its tools are on the same server).
        // D251: and says which phone ("mine": the user's own; "ducter": Ducter's; true: either).
        ...(open.needs?.phone ? { phone: open.needs.phone } : {}),
        // D235: work in a Mac app gets the apps' section (the tools show when 用电脑 is on there).
        ...(open.needs?.app ? { apps: true } : {}),
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
    // D202: the effort the user picked, on open and on every resume (Claude Code keeps none).
    if (open.effort) spec.effort = open.effort;
    // D141 (system.md): the user's own nmem (a skill, a hook) runs as the persona's identity.
    // Only these, set explicitly; every other NMEM_* the host has stays out (child-env.ts). The
    // identity's own lane is left to Mem's plugin (it reads the profile's default Space itself);
    // NMEM_SPACE only when the user chose one. D229: NMEM_CLI_PATH too, when Ducter's nmem is
    // named there (one Ducter put in off PATH), so the plugin runs the same nmem (its own rule).
    const mem = core.personaFor ? core.personaFor(core.tasks.get(id)?.persona).mem : core.persona.mem; // D312: the partner the task is for
    // D366: only on the home: the home's path means nothing on another computer, where the plugin
    // finds that computer's own nmem on its PATH (Ducter's tools folder is on it).
    const elsewhere = "device" in open.place && !!open.place.device && open.place.device !== "local";
    if (mem) spec.env = { NMEM_AGENT_ID: mem.agentId, ...(mem.space ? { NMEM_SPACE: mem.space } : {}), ...(process.env.NMEM_CLI_PATH && !elsewhere ? { NMEM_CLI_PATH: process.env.NMEM_CLI_PATH } : {}) };
    if (memoryOn()) {
      // D168: the user's Nowledge Mem plugin stays on in the task, as the persona's identity. Its
      // Bridge mailbox notices stay out: messages to the persona are the partner's, not a task's.
      if (spec.env) spec.env = { ...spec.env, NMEM_NO_MAILBOX_NOTICE: "1" };
      // D393: elsewhere, Mem is carried from the home: that computer's nmem (the person's own plugin
      // there, or the copy carried below) talks to the home's relay with a key for this task alone,
      // so nothing there needs a Mem sign-in and no Mem secret reaches it. A worker rewrites the
      // loopback address to the home's (worker-host.ts), and a sandbox there inherits the env.
      const carry = core.memCarry;
      if (carry && elsewhere && open.place.kind !== "browser") {
        const base = new URL(mcp.url).origin;
        const env = carry.envFor(id, base);
        if (env) spec.env = { ...(spec.env ?? {}), ...env };
        if (carriedKit(open.place, open.harness)) spec.pluginUrls = carry.kitFor(id, open.harness, base);
      }
    } else {
      // D168: memory is off in Ducter: the plugin is off in this session too (their other plugins
      // stay), so the switch holds inside tasks.
      const memPlugins = MEM_PLUGIN_IDS[open.harness];
      if (memPlugins?.length) spec.disablePlugins = [...memPlugins];
      delete spec.env;
    }
    // D142: a folder task writes only inside its folder where the harness can hold it there (Codex's sandbox).
    if (open.place.kind === "folder") spec.confineWrites = true;
    return spec;
  }

  /** Memory is on (Settings › 记得什么 and the run); with no partner wired, the setting alone. */
  function memoryOn(): boolean {
    if (core.taskMemory) return core.taskMemory.on();
    return process.env.DUCTER_MEMORY !== "off" && core.settings?.get().memory !== false;
  }

  /**
   * D168: what memory a task in this place has. plugin: Mem's check sees the user's Nowledge Mem
   * plugin for this agent on that computer in any form (installed, review, update), and it does
   * it (Context Bundle at start, its own searches, its capture), so Ducter adds no recall: never
   * both (research/48 M1). ducter: the check says it is absent there, or has nothing to say yet
   * (no nmem there, a worker too old to ask, not checked yet), so Ducter's recall (≤ 4 short
   * notes) and read-only memory_search stand in. none: a browser place (D62) or memory off.
   */
  function memoryMode(place: Place, harness: string): "plugin" | "ducter" | "none" {
    if (place.kind === "browser" || !memoryOn()) return "none";
    const device = "device" in place ? place.device : undefined;
    if (core.memPluginIn?.(device, harness)) return "plugin";
    if (carriedKit(place, harness)) return "plugin";
    return core.taskMemory ? "ducter" : "none";
  }

  /**
   * D393: Mem's plugin goes with the task from the home: another computer, an agent whose plugin
   * the home has (Claude Code), none of the person's own there (theirs is reused, never doubled),
   * and an nmem there for its hooks to run (Ducter's own copy, D386). Else Ducter's own memory.
   */
  function carriedKit(place: Place, harness: string): boolean {
    const carry = core.memCarry;
    if (!carry || place.kind === "browser") return false;
    const device = "device" in place ? place.device : undefined;
    if (!device || device === "local" || core.memPluginIn?.(device, harness)) return false;
    return carry.nmemIn(device) && carry.kitFor("probe", harness, "http://127.0.0.1").length > 0;
  }

  /**
   * D168: the first turn, with the few memories that matter to the brief in front of it. Asked
   * once, capped in time, logged on the task's stream (what was read, never the text); nothing
   * found, memory off or Mem down: the turn as it was.
   */
  async function withKnown(t: TaskRt, turn: string, brief: string): Promise<string> {
    const port = core.taskMemory;
    const mode = memoryMode(t.card.place, t.card.harness);
    if (!port || mode === "none" || !brief.trim()) return turn;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), RECALL_MS)));
    const notes = await Promise.race([port.recall({ taskId: t.id, persona: t.persona, title: t.card.title, brief }).catch(() => undefined), late]).finally(() => clearTimeout(timer));
    if (!notes?.length) return turn;
    if (mode === "plugin") {
      // D304: the plugin gives its own context; only other tools' memories are named, by title.
      const named = othersTurn(notes);
      if (!named) return turn;
      const others = notes.filter((n) => n.id && n.from).slice(0, OTHERS_MAX.notes);
      logEvent(t, { role: "system", from: "runner", text: `named ${others.length} of your other tools' memories in the brief`, raw: { memory: "others", ids: others.map((n) => n.id ?? null), titles: others.map((n) => n.title) } });
      return named + turn;
    }
    logEvent(t, { role: "system", from: "runner", text: `recalled ${notes.length} from memory for the brief`, raw: { memory: "recall", ids: notes.map((n) => n.id ?? null), titles: notes.map((n) => n.title) } });
    return knownTurn(notes, partnerNameOf(t.persona)) + turn;
  }

  function newRt(id: string, persona: string, card: TaskCard, spec: SessionSpec, ops: PlaceOps = localOps): TaskRt {
    return {
      ops,
      id,
      persona,
      card,
      base: spec,
      spec: withBrowser(spec, undefined, partnerNameOf(persona)),
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
      held: card.held ? structuredClone(card.held) : [],
      steers: [],
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
    const now = card.body ? { ...open, harness: card.body.harness, model: card.body.model, effort: card.body.effort } : open;
    if (!now.effort) delete now.effort;
    const t = newRt(open.taskId, e.persona, card, specFor(open.taskId, now, cwd), ops);
    if (open.language) t.lang = open.language;
    let asked = false; // D142: it asked before changing a folder it couldn't copy
    for (const ev of core.log.read({ stream: stream(open.taskId), kinds: ["task_event"], limit: 50_000 })) {
      const raw = (ev.body as Bodies["task_event"]).raw as { sessionId?: string; harness?: string; cwd?: string; kind?: string; compactions?: number; switched?: { from: string; to?: string; back?: boolean }; moved?: unknown; folder?: { ask?: string; direct?: boolean } } | undefined;
      if (raw?.sessionId) {
        t.sessionId = t.loggedSessionId = raw.sessionId;
        t.handedFrom = t.backFrom = undefined;
        if (raw.harness) (t.past ??= {})[raw.harness] = raw.sessionId;
      }
      if (raw?.sessionId && raw.cwd && ops.device) t.spec.cwd = t.base.cwd = raw.cwd;
      if (raw?.kind === "compaction_ended" && raw.compactions) t.compactions = raw.compactions;
      // Moved to another agent (D89): the session ids before it are the old agent's; ignore them.
      // D282: switched back to an agent whose own session it had: that one resumes.
      if (raw?.switched) {
        if (raw.moved) t.past = undefined; // another computer: the old sessions stayed there
        const back = raw.switched.back && raw.switched.to ? t.past?.[raw.switched.to] : undefined;
        t.sessionId = back;
        t.loggedSessionId = undefined;
        t.handedFrom = raw.switched.from;
        t.backFrom = back ? raw.switched.from : undefined;
      }
      if (raw?.folder?.ask) asked = true;
      if (raw?.folder?.direct) (asked = false), (t.direct = true);
    }
    // Still waiting for that answer: the answer sends the turn it held (from the brief again).
    if (asked && t.attention === "needs_you") t.gated = { text: kickoff(open.title) };
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
  async function open(input: Parameters<Runner["openTask"]>[0], briefIn: string | Promise<string>, mediaIn?: Promise<MediaRef[]>): Promise<TaskCard> {
    const id = newId();
    // Who does it (D89): the person's rules, the limits and Use it for tasks, through core's
    // chooser; a pick this runner can't run (or no device info) keeps the old default.
    const you = input.origin === "you"; // D128: the user opened it; a harness given is their pick
    const picked = await core.bodies?.choose({ title: input.title, brief: input.brief, place: input.place, harness: input.harness, model: input.model, ...(input.effort ? { effort: input.effort } : {}), ...(you ? { by: "you" as const } : {}), ...(input.needs ? { needs: input.needs } : {}), ...(input.workKind ? { workKind: input.workKind } : {}) });
    if (picked && "none" in picked) throw new Error(picked.none);
    // D372: the kind of work, as the partner said it or as Ducter read it from its needs and place.
    const workKind = input.workKind ?? (picked && "workKind" in picked ? picked.workKind : undefined);
    const pick = picked && HARNESSES.includes(picked.harness as HarnessId) ? picked : undefined;
    // D202: an effort is sent only when the chosen model on its computer offers it (core checks
    // it against the agent's own list); else it is left out, with one line in the task.
    const effort = input.effort ? (pick ? pick.effort : undefined) : undefined;
    const effortDropped = input.effort && !effort ? (pick?.effortDropped ?? `effort ${input.effort} was left out: couldn't check which efforts the model offers here`) : undefined;
    // D157: the computer goes with who: the pick's computer becomes the place's (a repo or a
    // folder stays where it is; browsing work gets a browser place there).
    if (pick?.device) input = { ...input, place: placeOn(input.place, pick.device, input.needs) };
    // The pick's model goes with it (the card says what runs); a model the caller named for
    // another agent never rides along when the pick moved.
    if (pick) {
      const { model: asked, ...rest } = input;
      const keep = pick.model ?? (pick.harness === input.harness ? asked : undefined);
      input = { ...rest, harness: pick.harness, ...(keep ? { model: keep } : {}) };
    }
    // A model from the tier table alone (no rule, no pin) gives way to DUCTER_TASK_MODEL below.
    const ranked = !!pick && ["default", "limit", "unavailable", "kind"].includes(pick.why.kind);
    // D85: the partner's choice; else the first account the user lets tasks use (Settings
    // taskAccounts; a missing entry is enabled), in first-wave order.
    const accounts = core.settings?.get().taskAccounts ?? {};
    const enabled = (x: HarnessId) => accounts[x]?.enabled !== false;
    const h = (input.harness ?? opts.defaultHarness ?? HARNESSES.find(enabled) ?? "claude-code") as HarnessId;
    if (!HARNESSES.includes(h)) throw new Error(`unknown harness ${input.harness}`);
    if (input.harness && !enabled(h)) throw new Error(`the user switched ${harnessName(h)} off for tasks; leave harness out or ask them`);
    const title = input.title.trim() || "Untitled task";
    // Where it runs: this machine, or a worker. D157: a worker that is asleep or can't be reached
    // right now doesn't refuse the task: it waits for it there and starts when it's back.
    const ops = opsFor(input.place);
    const away = ops.device && !ops.device.online() ? ops.device : undefined;
    const project = input.project ?? "";
    const persona = input.persona || core.persona.id;
    const partnerName = partnerNameOf(persona);
    let resolved: ResolvedPlace = { place: input.place ?? { kind: "none" }, cwd: "" };
    let sidecar: BrowserSidecar | undefined;
    let sidecarInput: SidecarInput | undefined;
    if (!away) {
      resolved = await ops.plan(input.place, id, title);
      // A worker plans its own place; it can't turn it into something this machine then runs
      // (a browser place's browser is the worker's own, D157).
      if (ops.device && resolved?.place?.kind !== (input.place?.kind ?? "none")) throw new Error(`${ops.device.name} answered with a different kind of place`);
      // Throws before the task exists when a browser place is unavailable (the partner says why).
      sidecarInput = { place: resolved.place, persona, taskId: id, dataDir: core.dataDir, partnerName, harness: h, ...(typeof briefIn === "string" && briefIn ? { brief: briefIn } : {}) };
      sidecar = await sidecarFor(ops, sidecarInput);
    }

    // The partner's, a rule's or the person's choice wins; else DUCTER_TASK_MODEL; else the
    // ranking's model; else the harness default.
    const fixed = h === "claude-code" ? (opts.defaultModel ?? opts.taskModel ?? process.env.DUCTER_TASK_MODEL) || undefined : undefined;
    const model = (ranked && fixed) || input.model || fixed;
    const later = typeof briefIn !== "string";
    const body: Bodies["task_open"] = { taskId: id, title, project, place: resolved.place, harness: h, model, ...(effort ? { effort } : {}), brief: later ? "" : briefIn, ...(!later && input.media?.length ? { media: input.media } : {}), ...(input.language ? { language: input.language } : {}), ...(you ? { origin: "you" as const } : {}), ...(input.from ? { from: input.from } : {}), ...(input.needs && Object.keys(input.needs).length ? { needs: input.needs } : {}), ...(workKind ? { workKind } : {}), ...(input.adopt ? { outside: { agent: input.adopt.agent, sessionId: input.adopt.sessionId, startedAt: input.adopt.startedAt } } : {}) };
    const opened = core.log.append({ persona, stream: stream(id), origin: "system", kind: "task_open", body });
    core.log.append({ persona, stream: stream(id), origin: "system", kind: "body_selected", body: { taskId: id, harness: h, ...(model ? { model } : {}), ...(effort ? { effort } : {}), why: pick?.why ?? { kind: input.harness ? (you ? "you" : "partner") : "default" } } });
    const card: TaskCard = {
      taskId: id,
      persona,
      title,
      project,
      place: resolved.place,
      harness: h,
      model,
      ...(effort ? { effort } : {}),
      attention: "queued",
      residency: "provisioning",
      openedAt: opened.ts,
      updatedAt: opened.ts,
    };
    const t = newRt(id, persona, card, specFor(id, body, resolved.cwd, !later), ops);
    if (sidecar) (t.sidecar = sidecar), (t.sidecarInput = sidecarInput);
    t.spec = withBrowser(t.base, sidecar, partnerName);
    if (input.language) t.lang = input.language;
    tasks.set(id, t);
    if (effortDropped) {
      console.warn(`[runner] ${id}: ${effortDropped}`);
      logEvent(t, { role: "system", from: "runner", text: effortDropped, raw: { effortDropped: input.effort } });
    }
    const start: StartCtx = { body, later, briefIn, ...(mediaIn ? { mediaIn } : {}), title, persona, partnerName };
    if (away) {
      // D157: 在等 · MacBook 睡着了. It starts there when the computer is back (no push, A3).
      const asleep = pick?.waits === "asleep" || !!core.workers?.list().find((w) => w.id === away.id || w.name === away.name)?.asleep;
      core.tasks.setState(id, "blocked", "offline", (asleep ? asleepReason : unreachableReason)(away.name));
      logEvent(t, { role: "system", from: "runner", text: `waiting for ${away.name}: it starts there when it's back`, raw: { device: away.id, name: away.name, waits: asleep ? "asleep" : "unreachable" } });
      waitThere(t, start);
      // The best computer sleeps and another could do it now, visibly differently: one line, wait by default.
      if (pick?.waits && pick.now) askWhere(t, pick, you);
      return core.tasks.get(id) ?? card;
    }
    core.tasks.setState(id, "queued", "provisioning");
    t.started = input.adopt ? adopt(t, input.adopt, resolved) : launch(t, start, resolved);
    return core.tasks.get(id) ?? card;
  }

  /**
   * D299: a session the person ran in their own agent outside Ducter becomes this task. Its
   * conversation goes into the task's history (the transcript shows it as earlier turns); then
   * the same agent resumes that very session by its id, in its own folder (the agent appends to
   * its file as it does by hand), or another agent starts there from what the session said
   * (D282's condensed start). Ducter never writes the session's file itself.
   */
  async function adopt(t: TaskRt, a: NonNullable<Parameters<Runner["openTask"]>[0]["adopt"]>, resolved: ResolvedPlace): Promise<void> {
    const same = a.agent === t.base.harness;
    // The person worked in this folder directly by hand; their own tools (git) are its undo.
    t.direct = true;
    logEvent(t, { role: "system", from: "runner", raw: { folder: { direct: true } } });
    logEvent(t, { role: "system", from: "runner", text: `carried on from a ${harnessName(a.agent)} session started outside Ducter`, raw: { outside: { agent: a.agent, at: a.startedAt, turns: a.turns.length }, ...(same ? { sessionId: a.sessionId, harness: a.agent } : {}) } });
    for (const turn of a.turns) logEvent(t, { role: turn.role, ...(turn.role === "user" ? { from: "user" as const } : {}), text: preview(turn.text, 16 * 1024), raw: { outside: true, ...(turn.at ? { at: turn.at } : {}) } });
    if (same) {
      t.sessionId = a.sessionId;
      (t.past ??= {})[a.agent] = a.sessionId;
      // A rejected resume falls back to what the session said, like another agent would get.
      t.handedFrom = a.agent;
      t.outsideOver = true;
    } else {
      logEvent(t, { role: "system", from: "runner", text: `switched from ${a.agent} to ${t.base.harness}`, raw: { switched: { from: a.agent, to: t.base.harness } } });
      t.handedFrom = a.agent;
      t.outsideOver = true;
    }
    try {
      await t.ops.provision(resolved);
      const seed = await resumeOrSeed(t);
      t.handedFrom = undefined;
      t.outsideOver = undefined;
      if (t.dropped) return;
      const told = `${ADOPTED} It began in ${harnessName(a.agent)} on ${a.startedAt.slice(0, 10)}, in ${t.spec.cwd}${same ? "; this is that same session, resumed, so its earlier turns are yours" : ""}.`;
      const first = seed ? `${told}\n\n${seed}` : told;
      if (!a.ask) await sendTurn(t, first, "ducter");
      else {
        // D376: carried on from the conversation with what the person asks of it now: one turn says
        // both; the transcript shows Ducter's hairline, then the ask as Ducter's words to it.
        logInput(t, first, "ducter", "turn");
        logInput(t, a.ask, "partner", "turn");
        await sendTurn(t, seedThen(first, a.ask), "ducter", true);
      }
    } catch (err) {
      if (isOffline(err)) return deviceLost(t, true);
      const reason = preview(err instanceof Error ? err.message : String(err), 500);
      logEvent(t, { role: "system", from: "runner", text: `failed to start: ${reason}` });
      setState(t, "failed", "archived", reason);
    }
  }


  /** Provision the place, start the session, and send the first turn (the brief, once written). */
  async function launch(t: TaskRt, c: StartCtx, resolved: ResolvedPlace): Promise<void> {
    const id = t.id;
    try {
      await t.ops.provision(resolved);
      await t.sidecar?.ready();
      await startSession(t, false);
      let first = kickoff(c.title);
      let briefText = c.body.brief;
      let media = c.body.media;
      if (c.later) {
        // The session is up (or coming up) while the partner finishes the brief.
        let text: string;
        try {
          text = await c.briefIn;
        } catch {
          // Never briefed (the partner's call changed or failed): gone before it did anything.
          if (t.dropped) return;
          t.dropped = true;
          setState(t, "dropped", "archived", "not started");
          const s = t.session;
          t.session = undefined;
          await s?.close().catch(() => {});
          await t.sidecar?.close().catch(() => false);
          // Its worktree and branch go too: nothing was done there (live run, research/108: an
          // early open replaced by the partner's full call left both in the person's repo).
          if (resolved.place.kind === "repo") await t.ops.archive(resolved.place, { unstarted: true }).catch(() => undefined);
          return;
        }
        if (t.dropped) return;
        media = c.mediaIn ? await c.mediaIn.catch(() => []) : undefined;
        // The briefed task_open is the one the registry, recovery and hand-offs read.
        const full = { ...c.body, place: resolved.place, brief: text, ...(media?.length ? { media } : {}) };
        core.log.append({ persona: c.persona, stream: stream(id), origin: "system", kind: "task_open", body: full });
        t.base = { ...specFor(id, full, resolved.cwd, true), cwd: t.base.cwd };
        t.spec = withBrowser(t.base, t.sidecar, c.partnerName);
        first = briefTurn(text, c.title);
        briefText = text;
      }
      if (t.dropped) return;
      first = await withKnown(t, first, briefText);
      if (t.dropped) return;
      await sendTurn(t, first, "runner", false, media?.length ? media : undefined);
    } catch (err) {
      if (isOffline(err)) return deviceLost(t, true);
      const reason = preview(err instanceof Error ? err.message : String(err), 500);
      logEvent(t, { role: "system", from: "runner", text: `failed to start: ${reason}` });
      setState(t, "failed", "archived", reason);
    }
  }

  /** D157: a task waiting for its computer starts there as soon as it is back. */
  function waitThere(t: TaskRt, c: StartCtx) {
    const d = t.ops.device;
    if (!d) return;
    t.waiting = c;
    t.offlineOff?.();
    t.offlineOff = d.onOnline(() => {
      t.offlineOff?.();
      t.offlineOff = undefined;
      void beginThere(t);
    });
  }

  /** D157: the computer a waiting task waits for is here (or the user moved it): plan and start. */
  async function beginThere(t: TaskRt) {
    const c = t.waiting;
    if (!c || t.dropped || t.session) return;
    t.waiting = undefined;
    setState(t, "queued", "provisioning");
    let resolved: ResolvedPlace;
    try {
      resolved = await t.ops.plan(c.body.place, t.id, c.title);
      const input: SidecarInput = { place: resolved.place, persona: c.persona, taskId: t.id, dataDir: core.dataDir, partnerName: c.partnerName, harness: t.base.harness };
      const sc = await sidecarFor(t.ops, input);
      if (sc) (t.sidecar = sc), (t.sidecarInput = input);
    } catch (err) {
      if (isOffline(err)) {
        // Gone again before it started: keep waiting.
        setState(t, "blocked", "offline", unreachableReason(t.ops.device?.name ?? ""));
        return waitThere(t, c);
      }
      const reason = preview(err instanceof Error ? err.message : String(err), 500);
      logEvent(t, { role: "system", from: "runner", text: `failed to start: ${reason}` });
      return setState(t, "failed", "archived", reason);
    }
    // Planned there: the place as that computer resolved it (a worktree, a branch).
    const body = { ...c.body, place: resolved.place, harness: t.base.harness, ...(t.base.model ? { model: t.base.model } : {}) };
    if (!c.later) core.log.append({ persona: c.persona, stream: stream(t.id), origin: "system", kind: "task_open", body });
    t.card = { ...t.card, place: resolved.place };
    t.base = { ...specFor(t.id, body, resolved.cwd, !c.later), harness: t.base.harness, ...(t.base.model ? { model: t.base.model } : {}) };
    t.spec = withBrowser(t.base, t.sidecar, c.partnerName);
    logEvent(t, { role: "system", from: "runner", text: `${t.ops.device?.name ?? "this machine"} is here; starting`, raw: { device: t.ops.device?.id ?? "local", waits: false } });
    t.started = launch(t, { ...c, body }, resolved);
  }

  /**
   * D157 (where.md §4.4): one line with a default. Hold (the default, no countdown: waiting is
   * free) waits for the computer; Go does it now on the other one. The task hears nothing of it.
   */
  function askWhere(t: TaskRt, pick: NonNullable<Awaited<ReturnType<NonNullable<CoreApi["bodies"]>["choose"]>>> & { harness: string }, you: boolean) {
    if (!("now" in pick) || !pick.now || !pick.waits) return;
    const now = pick.now;
    const w = words(WHERE_WORDS, t.lang);
    const dev = pick.why.where?.device ?? pick.device ?? "";
    const other = now.name;
    const site = (t.waiting?.body.needs?.site ?? "") || undefined;
    const pin = you && pick.why.kind === "you";
    const where: WhereAsk = {
      kind: pin ? "pin" : "asleep",
      device: dev,
      state: pick.waits,
      other,
      ...(pin ? { agent: pick.harness } : {}),
      ...(now.harness !== pick.harness ? { otherAgent: now.harness } : {}),
      ...(site ? { site } : {}),
      ...(pick.uses ? { here: pick.uses } : {}),
      ...(now.uses ? { uses: now.uses } : {}),
      ...(now.needsSignIn ? { signIn: true } : {}),
      ...(now.uses === "chrome" && pick.uses !== "chrome" ? { widens: true } : {}),
    };
    pendingWhere.set(t.id, { now });
    const text = pin
      ? fill(w.pin, { agent: harnessName(pick.harness), dev })
      : fill(w.asleep, { dev, other, chrome: pick.uses === "chrome" ? w.chrome : "" });
    const q: Question = { id: "where", text, blocking: true, reversible: false, where };
    core.log.append({ persona: t.persona, stream: stream(t.id), origin: "task", kind: "report", body: { taskId: t.id, state: "needs_input", summary: text, questions: [q], evidence: [] } });
    // A card that waits on you, not a task that waits on a computer: the decision says both.
  }

  // D157: Go on a where ask moves a waiting task to the computer that can start now.
  const pendingWhere = new Map<string, { now: { device: string; deviceId: string; name: string; harness: string; model?: string } }>();
  const unsubscribeWhere = core.log.subscribe((e: LogEvent) => {
    if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      if (d.where && d.taskId && pendingWhere.has(d.taskId)) whereDecisions.set(d.decisionId, d.taskId);
      return;
    }
    if (e.kind !== "decision_resolved") return;
    const r = e.body as Bodies["decision_resolved"];
    const taskId = whereDecisions.get(r.decisionId);
    if (!taskId) return;
    whereDecisions.delete(r.decisionId);
    const p = pendingWhere.get(taskId);
    pendingWhere.delete(taskId);
    const t = tasks.get(taskId);
    if (!t || !p || r.option !== "go") {
      // Wait for it (the default): it still waits, said once.
      if (t && !t.dropped && t.waiting) setState(t, "blocked", "offline", asleepReason(t.ops.device?.name ?? ""));
      return;
    }
    void moveWaiting(t, p.now);
  });
  const whereDecisions = new Map<string, string>(); // decisionId -> taskId

  /** D157: the user chose "do it now on {other}": re-place the waiting task there and start it. */
  async function moveWaiting(t: TaskRt, now: { device: string; deviceId: string; name: string; harness: string; model?: string }) {
    const c = t.waiting;
    if (!c || t.dropped) return;
    t.offlineOff?.();
    t.offlineOff = undefined;
    const from = t.ops.device?.name ?? "";
    const place = placeOn(c.body.place.kind === "none" || c.body.place.kind === "browser" ? c.body.place : undefined, now.device, c.body.needs) as Place;
    const kept = c.body.place.kind === "repo" || c.body.place.kind === "folder" ? c.body.place : place;
    t.ops = opsFor(kept);
    const keepsEffort = now.harness === t.base.harness && (now.model ?? "") === (t.base.model ?? "");
    t.base = { ...t.base, harness: now.harness as HarnessId, ...(now.model ? { model: now.model } : {}) };
    if (!now.model) delete t.base.model;
    if (!keepsEffort) delete t.base.effort, delete c.body.effort;
    t.card = { ...t.card, place: kept, harness: now.harness, ...(now.model ? { model: now.model } : {}) };
    c.body = { ...c.body, place: kept, harness: now.harness, ...(now.model ? { model: now.model } : {}) };
    core.log.append({ persona: t.persona, stream: stream(t.id), origin: "system", kind: "task_open", body: c.body });
    const name = now.name;
    core.log.append({ persona: t.persona, stream: stream(t.id), origin: "user", kind: "body_selected", body: { taskId: t.id, harness: now.harness, ...(now.model ? { model: now.model } : {}), ...(c.body.effort ? { effort: c.body.effort } : {}), why: { kind: "you", where: { device: name, kind: "you" } } } });
    logEvent(t, { role: "system", from: "runner", text: `moved from ${from} to ${name} before it started (the user chose now)`, raw: { device: now.deviceId, moved: { from, to: name } } });
    if (t.ops.device && !t.ops.device.online()) return waitThere(t, c);
    t.waiting = c;
    await beginThere(t);
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

  async function mergeNow(taskId: string) {
    const t = get(taskId);
    const card = core.tasks.get(taskId) ?? t.card;
    const r = await t.ops.merge(card.place);
    if (!r.ok) return r;
    logEvent(t, { role: "system", from: "runner", text: r.message, raw: { effect: "merge", ref: r.ref } });
    await archiveAfterMerge(t, card.place);
    return r;
  }

  async function undoFolderNow(taskId: string, o: { path?: string; force?: boolean } = {}) {
    const t = get(taskId);
    if (!folderOf(t)) return { ok: false, message: "This task doesn't work in a folder." };
    // While it works there, putting the folder back would race it.
    if (isBusy(t)) return { ok: false, message: "It's still working in this folder. Stop it first, then undo." };
    const r = await t.ops.folder.undo(taskId, o);
    if (r.ok) logEvent(t, { role: "system", from: "runner", raw: { message: r.message, effect: o.path ? "folder_restore" : "folder_undo", ...(o.path ? { path: o.path } : {}) } });
    return r;
  }

  async function keepFolderNow(taskId: string) {
    const t = get(taskId);
    if (!folderOf(t)) return { ok: false, message: "This task doesn't work in a folder." };
    const r = await t.ops.folder.keep(taskId);
    if (r.ok) logEvent(t, { role: "system", from: "runner", raw: { message: r.message, effect: "folder_keep" } });
    return r;
  }

  // D148: what a restart mustn't cut short (a merge, an undo, a keep), and the hold an update
  // sets while it restarts Ducter.
  const inCritical = new Map<string, number>();
  const harnessHold = new Set<string>();
  let criticalHold: string | undefined;
  async function critical<R>(taskId: string, refused: R, fn: () => Promise<R>): Promise<R> {
    if (criticalHold) return refused;
    inCritical.set(taskId, (inCritical.get(taskId) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      const n = (inCritical.get(taskId) ?? 1) - 1;
      if (n > 0) inCritical.set(taskId, n);
      else inCritical.delete(taskId);
    }
  }

  const runner: RunnerExt = {
    critical: () => [...inCritical.keys()],
    holdCritical(why) {
      criticalHold = why;
    },
    holdHarness(h, on) {
      if (on) harnessHold.add(h);
      else harnessHold.delete(h);
    },
    harness,

    sweepArchive,

    // D206: report_to_main `show`: each file read where the task runs (only from its own folders)
    // and copied into the home's media; a file that can't be shown is a line back to the task.
    async shown(taskId: string, paths: string[]) {
      const t = tasks.get(taskId);
      const media: MediaRef[] = [];
      const refused: string[] = [];
      if (!t || !core.media) return { media, refused: paths.length ? ["pictures can't be shown here"] : [] };
      for (const path of paths) {
        try {
          const f = await t.ops.shown({ path, cwd: t.spec.cwd ?? "", taskId });
          const ref = core.media.put(f.bytes, { name: f.name, from: { taskId }, files: true });
          if (!media.some((m) => m.id === ref.id)) media.push(ref);
        } catch (err) {
          refused.push(preview(err instanceof Error ? err.message : String(err), 200) ?? "couldn't show it");
        }
      }
      return { media, refused };
    },

    async checkEvidence(taskId, evidence) {
      const t = tasks.get(taskId);
      // A worker's place lives on that machine: its refs stay the task's word for now.
      if (!t || t.ops.device) return evidence;
      return checkEvidence(core.tasks.get(taskId)?.place ?? t.card.place, t.spec.cwd, evidence);
    },

    openTask: (input) => open(input, input.brief),
    // D120: the card, the place and the session start while the partner still writes the brief.
    openTaskEarly: (input, brief, media) => open({ ...input, brief: "" }, brief, media),

    async send(taskId, text, mode, from = "partner", clientId, media) {
      const t = get(taskId);
      if (typeof text !== "string" || (!text.trim() && !media?.length)) throw new Error("send needs non-empty text");
      if (t.dropped) throw new Error(`task ${taskId} was dropped`);
      await t.started.catch(() => {});
      // D325: a resend of words already held (the socket came back): held once.
      if (from === "user" && clientId && t.held.some((h) => h.id === clientId)) return { delivered: "queued" };
      // D282: the person's own /model and /effort in the task's composer: Ducter's switch, the same
      // meaning on every agent, the card kept true. Every other slash command goes to the harness.
      const slash = from === "user" && !media?.length ? slashOf(text, t.base.harness) : undefined;
      if (slash) return runSlash(t, slash, text, clientId);
      // D288: the person's own Compact now on Claude Code (its /compact runs as typed): not work, so
      // a finished or waiting task keeps its state and owes no report after it (research/108).
      const compacting = from === "user" && !media?.length && t.base.harness === "claude-code" && text.trim() === "/compact";
      t.nudged = false;
      t.stallNoted = false;
      // D282: a model or effort changed during the last turn: reopen with them before this one.
      if (t.retune && t.session && !isBusy(t)) await reopenForRetune(t);
      if (t.gated) {
        // D142: the answer to "change this folder without a copy?". Go, or a reply the task
        // reads, sends the turn held for it; from here on it doesn't ask again.
        const held = t.gated.text;
        t.gated = undefined;
        t.direct = true;
        logInput(t, text, from, "turn", clientId, media);
        logEvent(t, { role: "system", from: "runner", raw: { folder: { direct: true } } });
        if (!t.session) await startSession(t, !!t.sessionId);
        await sendTurn(t, `${held}\n\n${noCopyAnswer(text)}`, "runner", false, media);
        return { delivered: "prompted" };
      }
      if (!t.session) {
        // Its worker is away: say so, and deliver nothing (the partner tells the user).
        if (t.ops.device && !t.ops.device.online()) throw new DeviceOfflineError(t.ops.device.name);
        // Parked (process gone or restarted): resume by native session id; with none (moved to
        // another agent) or a rejected resume, a new session from the brief + saved progress.
        // Resuming takes seconds (measured ~10 s for Claude Code): log the text now so the
        // transcript shows it at once; a resumed session is idle, so it becomes the next turn.
        // D325: what the person held goes first.
        const before = compacting ? { text: "" } : withHeld(t, "");
        logInput(t, text, from, "turn", clientId, media);
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
        if (compacting && seed) {
          // A fresh session (the old one couldn't be resumed): nothing to compact. What it was
          // to hear goes before the person's next words.
          t.prefix.push(seed);
          setState(t, currentAttention(t), "warm");
          logEvent(t, { role: "system", from: "runner", text: "nothing to compact: its agent started a fresh session", raw: { slash: "compact", failed: "fresh session" } });
          return { delivered: "prompted" };
        }
        if (compacting) t.compactTurn = true;
        else setState(t, "working", "hot");
        const said = before.text ? `${before.text}\n\n${text}` : text;
        const all = [...(before.media ?? []), ...(media ?? [])];
        await sendTurn(t, compacting ? text : seed ? seedThen(seed, takeEdits(taskId, said)) : takeEdits(taskId, said), from, true, all.length ? all : undefined);
        return { delivered: "prompted" };
      }
      if (isBusy(t) && t.stopping) {
        // D339: the turn is being stopped: these words wait for its end and become the next turn.
        t.stopping.words.push({ text, from, ...(clientId ? { clientId } : {}), ...(media?.length ? { media } : {}) });
        return { delivered: "queued" };
      }
      if (isBusy(t)) {
        const steer = mode !== "queue" && t.session!.canSteer;
        // D325: the person's After this, or a steer its agent can't take mid-turn: Ducter holds
        // it (never the agent's own queue), so it can be changed, taken back or said now.
        if (from === "user" && !steer) {
          setHeld(t, [...t.held, { id: clientId ?? `h${randomBytes(6).toString("hex")}`, text, at: new Date().toISOString(), ...(media?.length ? { media } : {}) }]);
          return { delivered: "queued" };
        }
        if (steer) {
          const e = logInput(t, text, from, "steer", clientId, media);
          // D325: seen once the agent's next step echoes it (steerSeen).
          const id = randomUUID(); // OAR's input id (a UUID): the agent's echo names it
          if (from === "user") t.steers.push({ seq: e.seq, text, id });
          await deliver(t, takeEdits(taskId, text), "steer", from, true, media, id);
          return { delivered: "steered" };
        }
        logInput(t, text, from, "queue", clientId, media);
        await deliver(t, takeEdits(taskId, text), "queue", from, true, media);
        return { delivered: "queued" };
      }
      // Idle: the text becomes the next turn. A finished or held task goes back to work, except
      // for the person's own Compact now on Claude Code (D288), which is not work: it keeps its state.
      const a = currentAttention(t);
      if (compacting) t.compactTurn = true;
      else if (a !== "working") setState(t, "working", "hot");
      // D214: what the user changed in its files goes to the agent, never into their own words in
      // the Log (after a /compact: with the next words, so the command stays a command).
      // D325: what the person held goes first, in order.
      const before = compacting ? { text: "" } : withHeld(t, "");
      const said = before.text ? `${before.text}\n\n${text}` : text;
      const all = [...(before.media ?? []), ...(media ?? [])];
      const out = compacting ? text : takeEdits(taskId, said);
      const logged = !!clientId || out !== text;
      if (logged) logInput(t, text, from, "turn", clientId, media);
      await sendTurn(t, out, from, logged, all.length ? all : undefined);
      return { delivered: "prompted" };
    },

    // D325: one of the person's held messages changed, taken back, or said now.
    async held(taskId, id, op, text) {
      const t = get(taskId);
      const i = t.held.findIndex((h) => h.id === id);
      if (i < 0) throw new Error("That message already went to the task.");
      const h = t.held[i]!;
      if (op === "edit") {
        const words = (text ?? "").trim();
        if (!words && !h.media?.length) throw new Error("empty message");
        setHeld(t, t.held.map((x, j) => (j === i ? { ...x, text: words } : x)));
        return {};
      }
      if (op === "now" && isBusy(t) && t.session && !t.session.canSteer) throw new Error(`${harnessName(t.spec.harness)} can't take words in the middle of its work; it reads this when it's done.`);
      setHeld(t, t.held.filter((_, j) => j !== i));
      if (op === "drop") return {};
      // Said now: steered in while it works, else the next turn (with anything else still held first).
      return runner.send(taskId, h.text, "steer", "user", h.id, h.media);
    },

    async reopen(taskId) {
      const t = get(taskId);
      await t.started.catch(() => {});
      t.dropped = false;
      if (t.session || t.sessionId || t.handedFrom) return runner.send(taskId, REOPENED, undefined, "ducter");
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

    async moveTask(taskId, to, harness, model) {
      const t = get(taskId);
      if (t.dropped) return { ok: false, message: "That task was dropped. Undo the drop first." };
      await t.started.catch(() => {});
      const place = core.tasks.get(taskId)?.place ?? t.card.place;
      const here = t.ops.device?.name ?? "local";
      if (place.kind === "folder") return { ok: false, message: `The folder is on ${here === "local" ? "this computer" : here}; it can't move.` };
      // Where it goes, as a place there: a repo by the same path from home (~), its pushed branch.
      const portable = (p: string) => p.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, "~");
      const next: Place =
        place.kind === "repo"
          ? { kind: "repo", device: to.device, repoPath: portable(place.repoPath), ...(place.branch ? { branch: place.branch } : {}), ...(place.baseBranch ? { baseBranch: place.baseBranch } : {}) }
          : place.kind === "browser"
            ? { kind: "browser", device: to.device, profile: place.profile }
            : { kind: "none", device: to.device };
      const ops = opsFor(next);
      if (ops.device && !ops.device.online()) return { ok: false, message: `${ops.device.name} can't be reached right now; move it once it's back.` };
      // E3: only committed work moves, through the pushed branch.
      if (place.kind === "repo") {
        const pushed = await t.ops.push(place).catch((err) => ({ ok: false, message: (err as Error).message }) as ActionResult);
        if (!pushed.ok) return { ok: false, message: pushed.message };
      }
      const wasRunning = !!t.session && isBusy(t);
      const att = currentAttention(t);
      const old = t.session;
      t.session = undefined;
      t.running = false;
      t.sessionId = t.loggedSessionId = undefined;
      await old?.close().catch(() => {});
      await t.sidecar?.close().catch(() => false);
      t.sidecar = undefined;
      t.sidecarInput = undefined;
      const fromHarness = t.base.harness;
      const h = (harness ?? fromHarness) as HarnessId;
      let resolved: ResolvedPlace;
      try {
        resolved = { ...(await ops.plan(next, taskId, t.card.title)), ...(place.kind === "repo" ? { fetch: true } : {}) };
      } catch (err) {
        return { ok: false, message: `${to.name} couldn't take it: ${(err as Error).message}` };
      }
      t.ops = ops;
      const open = core.log.read({ stream: stream(taskId), kinds: ["task_open"], limit: 1000 }).at(-1)?.body as Bodies["task_open"] | undefined;
      const body: Bodies["task_open"] = { ...(open ?? { taskId, title: t.card.title, project: t.card.project, brief: "" }), place: resolved.place, harness: h, ...(model ? { model } : {}) } as Bodies["task_open"];
      if (!model) delete body.model;
      // D202: the effort moves with the same agent and model; another one runs at its own default.
      if (h !== fromHarness || (model ?? "") !== (t.card.model ?? "")) delete body.effort;
      core.log.append({ persona: t.persona, stream: stream(taskId), origin: "user", kind: "task_open", body });
      core.log.append({ persona: t.persona, stream: stream(taskId), origin: "user", kind: "body_selected", body: { taskId, harness: h, ...(model ? { model } : {}), ...(body.effort ? { effort: body.effort } : {}), why: { kind: "you", where: { device: to.name, kind: "you" } } } });
      t.card = { ...t.card, place: resolved.place, harness: h, ...(model ? { model } : {}) };
      t.base = { ...specFor(taskId, body, resolved.cwd, true), harness: h };
      t.movedFrom = { from: here === "local" ? (to.homeName ?? "the home") : here, to: to.name, repo: place.kind === "repo" };
      t.past = t.backFrom = undefined; // D282: the sessions it had stay on the computer it left
      if (fromHarness !== h) t.handedFrom = fromHarness;
      logEvent(t, { role: "system", from: "runner", text: `moved from ${t.movedFrom.from} to ${to.name}`, raw: { switched: { from: fromHarness, to: h }, moved: { from: t.movedFrom.from, to: to.name } } });
      t.started = (async () => {
        await ops.provision(resolved);
        if (resolved.place.kind === "browser") {
          const input: SidecarInput = { place: resolved.place, persona: t.persona, taskId, dataDir: core.dataDir, partnerName: partnerNameOf(t.persona), harness: h };
          const sc = await sidecarFor(ops, input);
          if (sc) (t.sidecar = sc), (t.sidecarInput = input), await sc.ready();
        }
        t.spec = withBrowser(t.base, t.sidecar, partnerNameOf(t.persona));
        // Something left to do: carry on there now. A finished or waiting task keeps its state;
        // its next message starts it there from the brief and saved progress.
        if (!wasRunning && att !== "working" && att !== "queued") return setState(t, att, "parked");
        const seed = await resumeOrSeed(t);
        setState(t, "working", "hot");
        await sendTurn(t, seed, "runner");
      })();
      try {
        await t.started;
      } catch (err) {
        if (isOffline(err)) return deviceLost(t, true), { ok: true };
        const reason = preview(err instanceof Error ? err.message : String(err), 500);
        setState(t, "failed", "parked", reason);
        return { ok: false, message: reason };
      }
      return { ok: true };
    },

    async switchBody(taskId, harness, model, effort) {
      const t = get(taskId);
      if (!HARNESSES.includes(harness as HarnessId)) return { ok: false, message: `${harness} can't do tasks here yet.` };
      if (t.dropped) return { ok: false, message: "That task was dropped. Undo the drop first." };
      await t.started.catch(() => {});
      const from = t.spec.harness;
      // D282: the same agent, another model or effort: the same native session, reopened with them
      // for the next turn (Claude Code `--resume <id> --model --effort`; Codex thread/resume with the
      // model, its effort set on the loaded thread). Nothing is condensed.
      if (harness === from) return retune(t, model, effort);
      const wasRunning = !!t.session && isBusy(t);
      const att = currentAttention(t);
      // The old session closes; its native session can't carry over to another harness. It is
      // kept by agent: switching back resumes it (D282).
      const old = t.session;
      t.session = undefined;
      t.running = false;
      t.retune = false;
      if (t.sessionId) (t.past ??= {})[from] = t.sessionId;
      const back = t.past?.[harness];
      t.sessionId = back;
      t.loggedSessionId = undefined;
      t.handedFrom = from;
      t.backFrom = back ? from : undefined;
      await old?.close().catch(() => {});
      // The next session start rebuilds the spec (and a browser place's browser) for it.
      t.base = { ...t.base, harness: harness as HarnessId };
      if (model) t.base.model = model;
      else delete t.base.model;
      // D202: another agent runs at its own default effort, unless one was picked with it (D282).
      if (effort) t.base.effort = effort;
      else delete t.base.effort;
      t.spec = withBrowser(t.base, t.sidecarInput?.harness === harness ? t.sidecar : undefined, partnerNameOf(t.persona));
      t.card = { ...t.card, harness, ...(model ? { model } : {}) };
      if (!model) delete t.card.model;
      // raw.switched: recovery ignores the session ids logged before it (the old agent's), or
      // resumes the new agent's own earlier one (back).
      logEvent(t, { role: "system", from: "runner", text: `moved from ${from} to ${harness}${model ? ` (${model})` : ""}`, raw: { switched: { from, to: harness, ...(model ? { model } : {}), ...(effort ? { effort } : {}), ...(back ? { back: true } : {}) } } });
      // Something left to do: carry on there now, from the saved progress. D372: a task waiting on
      // the person (needs_you) carries on too: moving it is their answer (live, hel 2026-11-18: a
      // task that asked to be moved off Claude Code sat idle after the move). A finished, failed or
      // otherwise waiting task keeps its state; the next message (a follow-up) starts the new
      // session from the brief + saved progress (send -> resumeOrSeed).
      if (!wasRunning && att !== "working" && att !== "queued" && att !== "needs_you") {
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
      // D339: words sent until this turn has ended wait for it (never steered into a turn that is
      // ending). Its end normally comes within a second or two; if it never does, they go anyway.
      if (isBusy(t) && !t.stopping) {
        const st: NonNullable<TaskRt["stopping"]> = { since: Date.now(), words: [] };
        st.timer = setTimeout(() => {
          if (t.stopping !== st) return;
          const words = takeStopping(t);
          if (words.length && !t.dropped) void sayAfterStop(t, words);
        }, STOP_SETTLE_MS);
        (st.timer as { unref?: () => void }).unref?.();
        t.stopping = st;
      }
      await t.session.interrupt();
    },

    async drop(taskId) {
      const t = get(taskId);
      t.dropped = true;
      await t.started.catch(() => {});
      setState(t, "dropped", "parked");
      if (t.held.length) setHeld(t, []); // D325: a cancelled task hears nothing more
      const s = t.session;
      t.session = undefined;
      t.running = false;
      await s?.close().catch(() => {});
      await t.sidecar?.close().catch(() => false);
      // The worktree and branch are kept on purpose; a folder's copy for 7 days (D142).
      if (folderOf(t)) await t.ops.folder.finish(taskId).catch(() => {});
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
      return critical(taskId, { ok: false, message: criticalHold ?? "" }, () => mergeNow(taskId));
    },

    async undoFolder(taskId, o = {}) {
      return critical(taskId, { ok: false, message: criticalHold ?? "" }, () => undoFolderNow(taskId, o));
    },

    async keepFolder(taskId) {
      return critical(taskId, { ok: false, message: criticalHold ?? "" }, () => keepFolderNow(taskId));
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

    // ---------- D142: a folder that isn't a git repo ----------
    async folderChanges(taskId, o) {
      const t = tasks.get(taskId);
      if (!t || !folderOf(t)) return undefined;
      return t.ops.folder.changes(taskId, o).catch(() => undefined);
    },

    // ---------- D214: the workbench ----------
    async workbench(taskId, req, o = {}) {
      const t = tasks.get(taskId);
      const place = core.tasks.get(taskId)?.place ?? t?.card.place;
      if (!place) throw new WbFail("missing");
      const ops = t?.ops ?? opsFor(place);
      const cwd = t?.spec.cwd ?? (ops.device ? remoteCwd(place) : cwdOf(place, taskId, core.dataDir));
      if (ops.device && !ops.device.online()) throw new WbFail("offline");
      const answer = await ops.wb({ taskId, cwd, place, req, ...(o.said ? { said: o.said } : {}), ...(o.exclude ? { exclude: o.exclude } : {}), ...(o.simSaid ? { simSaid: true } : {}) });
      if (answer.op === "write" || answer.op === "revert") {
        // The user's own change to the task's files: the task hears of it with its next turn,
        // and the Log keeps it (never drawn in the transcript: it has no note, D207).
        const how = answer.op === "write" ? "edited" : "reverted";
        const e = userEdits.get(taskId) ?? new Map<string, "edited" | "reverted">();
        e.set(answer.path, how);
        userEdits.set(taskId, e);
        if (t) logEvent(t, { role: "system", from: "user", raw: { effect: "user_edit", path: answer.path, how } });
      }
      return answer;
    },

    pageRoute(taskId) {
      const t = tasks.get(taskId);
      const place = core.tasks.get(taskId)?.place ?? t?.card.place;
      if (!place) return undefined;
      const ops = t?.ops ?? opsFor(place);
      if (!ops.device) return { here: true };
      const fetch = ops.wbFetch;
      if (!fetch) return undefined;
      return { here: false, fetch: (a) => fetch({ taskId, ...a }) };
    },

    // D356: a link to a file in a task's or the partner's words. The task whose folders hold it
    // reads it where it works (its working copy, its own scratch or evidence, D206's rules), and
    // the home keeps the bytes for the viewer. Which task: the one the link was shown in, the
    // one its scratch or evidence folder names, then any whose working copy holds the path.
    async fileOpen(path, hint) {
      const fail = (code: FileOpenError, message?: string) => Object.assign(new Error(message ?? code), { code });
      if (!core.media) throw fail("unsupported");
      const raw = typeof path === "string" ? path.trim() : "";
      if (!raw || raw.length > 4096 || raw.includes("\0")) throw fail("missing");
      const known = (id: string | undefined) => !!id && (tasks.has(id) || !!core.tasks.get(id));
      const order: string[] = [];
      const add = (id: string | undefined) => void (id && known(id) && !order.includes(id) && order.push(id));
      add(hint);
      add(/\/(?:scratch|evidence)\/([A-Za-z0-9_-]{1,64})(?:\/|$)/.exec(raw)?.[1]);
      for (const card of core.tasks.list()) {
        const p = card.place;
        const cwd = p?.kind === "repo" ? (p.worktree ?? p.repoPath) : p?.kind === "folder" ? p.path : "";
        if (cwd && (raw === cwd || raw.startsWith(cwd.endsWith("/") ? cwd : `${cwd}/`))) add(card.taskId);
      }
      if (!order.length) throw fail("outside");
      // When none reads it, the most telling no: gone beats unreachable beats outside.
      const rank: FileOpenError[] = ["outside", "unsupported", "failed", "offline", "missing"];
      let last: (Error & { code: FileOpenError }) | undefined;
      const keep = (e: Error & { code: FileOpenError }) => void ((!last || rank.indexOf(e.code) > rank.indexOf(last.code)) && (last = e));
      for (const taskId of order.slice(0, 6)) {
        const t = tasks.get(taskId);
        const place = core.tasks.get(taskId)?.place ?? t?.card.place ?? { kind: "none" as const };
        const ops = t?.ops ?? opsFor(place);
        const cwd = t?.spec.cwd ?? (ops.device ? remoteCwd(place) : cwdOf(place, taskId, core.dataDir));
        if (ops.device && !ops.device.online()) {
          keep(fail("offline"));
          continue;
        }
        try {
          const f = await ops.shown({ path: raw, cwd, taskId });
          // Any kind of file: the person asked for this one (a kind Ducter can't show is kept inert, D259).
          return core.media.put(f.bytes, { name: f.name, from: { taskId }, sent: true });
        } catch (err) {
          const e = err as { code?: unknown; message?: unknown; status?: unknown };
          const code: FileOpenError = e?.status === 413 ? "too_big" : typeof e?.code === "string" && e.code !== "failed" ? (e.code as FileOpenError) : shownCode(String(e?.message ?? ""));
          const no = fail(code, code === "failed" ? String(e?.message ?? "").slice(0, 200) : undefined);
          // A file too big is the answer; another task (another computer) may hold any other.
          if (code === "too_big") throw no;
          keep(no);
        }
      }
      throw last ?? fail("outside");
    },

    async folderReport(taskId) {
      const t = tasks.get(taskId);
      if (!t || !folderOf(t)) return undefined;
      await t.ops.folder.finish(taskId).catch(() => {});
      const c = await t.ops.folder.changes(taskId).catch(() => undefined);
      if (!c) return undefined;
      const { files: _f, more: _m, ...summary } = c;
      return summary;
    },



    whenStarted(taskId) {
      return get(taskId).started;
    },

    sessionId(taskId) {
      return tasks.get(taskId)?.sessionId;
    },

    async dispose() {
      unsubscribe();
      unsubscribeWhere();
      clearTimeout(sweepFirst);
      clearInterval(folderTimer);
      clearInterval(sweepTimer);
      for (const t of tasks.values()) {
        clearTimeout(t.offlineTimer);
        clearTimeout(t.parkTimer);
        clearTimeout(t.bgSettle);
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
