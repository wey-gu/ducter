// In-process module boundaries for v1-tonight (one Bun process: `bun run up`).
//   core    owns: Log (SQLite), bus, task registry + state machine, decisions, living message,
//                 WS server (/ws), MCP HTTP server (/mcp), main.ts wiring.
//   runner  owns: HarnessPort over OAR, worktrees, task sessions, event normalization.
//   partner owns: the main AI (persona prompt, projection, turn loop) on any first-wave harness (D85) via runner's HarnessPort.
import type { HarnessId } from "./harnesses.ts";
import type { Attention, Bodies, BodyWhy, BranchChanges, Delivery, FolderChanges, UndoConfirm, EventKind, LogEvent, OnHand, Origin, PartnerActivity, Place, Residency, PeersSettings, Settings, TaskCard, TaskNeeds } from "./index.ts";

// ---------- core ----------

export interface AppendInput<K extends EventKind = EventKind> {
  persona?: string; // default persona if omitted
  stream: string;
  origin: Origin;
  kind: K;
  body: Bodies[K];
  supersedes?: number;
}

export interface LogStore {
  append<K extends EventKind>(e: AppendInput<K>): LogEvent<K>;
  read(opts: { stream?: string; fromSeq?: number; beforeSeq?: number; limit?: number; kinds?: EventKind[] }): LogEvent[];
  // FTS5 over CJK bigrams + exact substrings, rank-fused (core/src/search.ts); best match first.
  search(query: string, opts?: { stream?: string; limit?: number; beforeSeq?: number }): LogEvent[];
  head(): number;
  subscribe(fn: (e: LogEvent) => void): () => void;
}

// ---------- the main AI's spine (design/memory.md) ----------

/** One frozen digest: a closed segment of the channel, or an epoch rolled up from segments. */
export interface SpineRecord {
  id: string; // "S0001" / "E0001"
  kind: "segment" | "epoch";
  fromSeq: number; // channel seq range it covers, inclusive
  toSeq: number;
  createdAt: string;
  body: unknown; // the digest (partner/src/spine/digest.ts); never changed once stored
}

/** One try at writing a digest, kept for diagnostics (an audit that failed is never frozen). */
export interface SpineAttempt {
  fromSeq: number;
  toSeq: number;
  n: number;
  ok: boolean;
  writer: string;
  reasons: string[];
  at?: string;
}

/** Append-only: frozen digests are never regenerated, updated or deleted. */
export interface SpineStore {
  list(): SpineRecord[]; // by fromSeq, an epoch before the segments it covers
  freeze(r: Omit<SpineRecord, "createdAt">): SpineRecord; // throws on a duplicate id
  attempt(a: SpineAttempt): void;
  attempts(limit?: number): SpineAttempt[];
  /** Automatic recall offered to the model (model-visible means logged). */
  recalled(r: { query: string; hits: number[]; admitted: boolean; turnSeq?: number }): void;
}

export interface TaskRegistry {
  get(taskId: string): TaskCard | undefined;
  list(): TaskCard[];
  onHand(): OnHand;
  setState(taskId: string, attention: Attention, residency: Residency, reason?: string): void; // appends task_state
}

export type ToolHandler = (args: any, ctx: { role: string; taskId?: string }) => Promise<unknown>;

export interface McpHub {
  // Registers a tool for a role ("partner" or "task"). Core serves them at /mcp.
  register(role: "partner" | "task", name: string, description: string, inputSchema: object, handler: ToolHandler): void;
  // MCP server config to inject into a harness session for this role.
  configFor(role: "partner" | { taskId: string }): { name: string; url: string; headers: Record<string, string> };
}

/**
 * The Nowledge Mem AI Identity a persona runs as (D141): bound once, kept in persona.json, and
 * named explicitly on every Mem call (memory_add --agent-id, a task's NMEM_AGENT_ID).
 */
export interface MemIdentity {
  agentId: string;
  /** The Space the user had chosen for Ducter (NMEM_SPACE when it was bound); absent: Mem's own default. */
  space?: string;
  /** Ducter enrolled it, so it keeps the identity's display name in step with the partner's name. */
  owned: boolean;
  /** The identity's display name in Mem, for one the user already had. */
  label?: string;
}

export interface CoreApi {
  log: LogStore;
  tasks: TaskRegistry;
  mcp: McpHub;
  persona: {
    id: string;
    name: string;
    identity: string /* L1 text from Nowledge Mem or default */;
    /** The persona's Mem AI Identity (D141); absent until bound, or with Mem off or missing. */
    mem?: MemIdentity;
  };
  dataDir: string; // ~/.ducter
  /** Paired worker machines (system.md "Workers"); absent in tests and stubs. */
  workers?: WorkerLinks;
  /** The partner's settings (D71); absent in tests and stubs (then: follow the user, remember). */
  settings?: SettingsApi;
  /** What the partner thinks with when the user hasn't chosen and the default (Claude Code)
   *  isn't signed in here but Codex is: a Codex-only server just works (D143). */
  partnerFallback?(): { harness: "codex"; model?: string } | undefined;
  /** Who does a new task (D89, core/src/loadout.ts); absent in tests and stubs (then: the runner's default). */
  bodies?: BodyChooser;
  /** The user's connections (D96, core/src/connections.ts); absent in tests and stubs. */
  connections?: ConnectionsApi;
  /** What the partner is doing while the user waits (D104); absent in tests and stubs. */
  activity?: { set(a: PartnerActivity | null): void };
  /** Frozen digests of the channel (design/memory.md), in the Log's own database; absent in stubs. */
  spine?: SpineStore;
  /** D151: Ducter's own browser (a server's 上网); absent in tests and stubs. */
  browser?: DucterBrowserPort;
  /** D168: memory for tasks, from the partner's own Mem client; absent in tests, stubs and with no partner. */
  taskMemory?: TaskMemoryPort;
  /** D168: the user's Nowledge Mem plugin for this agent is on that device in any form but absent (by id or name; undefined = the home), as Mem's own check last said (research/48 M1). */
  memPluginIn?(device: string | undefined, harness: string): boolean;
}

/** One memory as a task sees it: its id (to look closer), title, a clipped content, when. */
export interface TaskMemoryNote {
  id?: string;
  title: string;
  content: string;
  date?: string;
}

/**
 * D168 (design/memory.md "Mem and tasks"): memory inside Ducter's tasks comes from Ducter. The
 * partner owns the Mem client and the switch; the runner asks this for the few memories that
 * matter to a task's brief, once, before its first turn.
 */
export interface TaskMemoryPort {
  /** Memory is on (Settings › 记得什么 and the run): tasks get it, and the user's own Mem plugin is off inside them. */
  on(): boolean;
  /** The few memories that matter here; undefined: off, Mem down or slow, or nothing fits. Never throws. */
  recall(work: { taskId: string; persona: string; title: string; brief: string }): Promise<TaskMemoryNote[] | undefined>;
}

/**
 * Who does a new task and why. undefined: nothing to choose by (no device info), the runner keeps
 * its own default; { none }: no AI agent can take it, the open fails with that reason.
 */
export interface BodyChooser {
  // by "you": the user picked harness/model themselves (D128 New task): the pin's why says so.
  // D157: needs say what the task needs of its computer; the pick says which computer (device:
  // its name, "local" for the home), whether it waits there, and what it uses.
  choose(work: { title: string; brief?: string; place?: Place; harness?: string; model?: string; by?: "you"; needs?: TaskNeeds }): Promise<BodyChoice | { none: string } | undefined>;
}

/** D157: who does a new task, on which computer, and why. */
export interface BodyChoice {
  harness: string;
  model?: string;
  why: BodyWhy;
  device?: string;
  deviceId?: string;
  home?: boolean;
  waits?: "asleep" | "unreachable";
  uses?: "chrome" | "ducter";
  needsSignIn?: boolean;
  now?: { device: string; deviceId: string; name: string; harness: string; model?: string; uses?: "chrome" | "ducter"; needsSignIn?: boolean };
}

/** Who is calling into a connection: the partner, or one task (which must have been granted it). */
// "watch" (D165): Ducter's own looks on a schedule, model-free. Reads only (a write is refused
// like a task's), logged on the "watch" stream so the conversation and the partner never see them.
export type ConnectionCaller = { role: "partner" } | { role: "task"; taskId: string } | { role: "watch" };

export interface ConnectionInfo {
  id: string;
  name: string;
  source: "oomol" | "self" | "mcp" | "oo";
  /** Source oo: the services in it, and each one's accounts (pass a name as `account`; the default is used without one). */
  services?: { service: string; accounts: { name: string; label: string; default: boolean }[] }[];
  /** For a task: whether it may read this one. */
  granted?: boolean;
}

export type ConnectionOutcome =
  | { ok: true; op: "read" | "write"; result: unknown }
  | { ok: false; error: string; op?: "read" | "write" };

/** The broker as the partner and tasks see it (design/connectors.md §4). */
export interface ConnectionsApi {
  list(who: ConnectionCaller): ConnectionInfo[];
  /** Find actions (OpenConnector) or tools (other MCP servers), each marked read or write. */
  search(who: ConnectionCaller, query: string, opts?: { connection?: string; service?: string }): Promise<ConnectionOutcome>;
  /** One action's guide: its input, and whether it reads or writes. */
  guide(who: ConnectionCaller, connection: string, action: string): Promise<ConnectionOutcome>;
  /** read or write, from the server's own metadata; unknown counts as write. */
  classify(connection: string, action: string): Promise<"read" | "write">;
  /** Runs a read. A write is refused here: it needs stage() and the user's Go. */
  read(who: ConnectionCaller, connection: string, action: string, input: unknown, account?: string): Promise<ConnectionOutcome>;
  /** Records a write that waits for Go on decisionId (the partner made the card). */
  stage(connection: string, action: string, input: unknown, decisionId: string, account?: string): { ok: true; callId: string } | { ok: false; error: string };
  /** Runs the write staged on decisionId, once, only if the user said Go. */
  runApproved(decisionId: string): Promise<ConnectionOutcome>;
  /** Lets a task read one connection (the partner decides; recorded). */
  grant(taskId: string, connection: string): { ok: true } | { ok: false; error: string };
}

/** What the partner reads of the settings, and how it lets the user forget a memory. */
export interface SettingsApi {
  get(): Settings;
  /** The partner registers how to forget a memory in Mem; true when Mem forgot it. */
  setForgetter(fn: (memoryId: string) => Promise<boolean>): void;
  /** The partner says whether Mem answers (connected) or not (missing), as it finds out. */
  setMemState(state: "connected" | "missing"): void;
  /** D170: the partner keeps the learned rules (trusted) and the muted senders here. */
  setPeers?(peers: Partial<PeersSettings>): void;
}

// ---------- workers (main ↔ worker over the worker's outbound /worker socket) ----------

/** One frame the worker sends up about a remote harness session. */
export type WorkerSessionFrame =
  | { t: "ev"; key: string; ev: HarnessEvent; busy: boolean; sessionId?: string }
  | { t: "end"; key: string; error?: string; offline?: boolean }
  // D157: Ducter's own browser on a worker. One CDP message (an event) from the browser there,
  // or the browser's connection closed (closed: true); the main drives it with cdpSend.
  | { t: "cdp"; key: string; msg?: { method: string; params?: unknown; sessionId?: string }; closed?: boolean };

export interface WorkerInfo {
  id: string; // device id
  name: string;
  online: boolean;
  os?: string;
  arch?: string;
  harnesses?: { id: string; installed: boolean; loggedIn: boolean }[];
  /** D157: it said it was going to sleep before its socket went (online false). */
  asleep?: boolean;
  /** D157: how it browses for tasks (its 上网), when it is on. */
  web?: "chrome" | "ducter";
  /** D157: it doesn't sleep. */
  alwaysOn?: boolean;
}

/** The main's handle on one worker. Stable across reconnects. */
export interface WorkerLink {
  readonly id: string;
  readonly name: string;
  online(): boolean;
  /** One request; rejects with a WorkerOfflineError when the worker is (or goes) away. */
  call<T = unknown>(op: string, args: unknown, timeoutMs?: number): Promise<T>;
  /** Frames for one remote session; an `end` with offline:true arrives when the socket drops. */
  onSession(key: string, fn: (f: WorkerSessionFrame) => void): () => void;
  /** Runs fn each time the worker (re)connects and says hello. */
  onOnline(fn: () => void): () => void;
}

/**
 * D151: Ducter's own browser, owned by the main process: Chrome for Testing headless, one
 * profile per persona, driven by Ducter's own browser tools on its MCP (core/src/browser).
 */
export interface DucterBrowserPort {
  /** Installed and able to start here, or why not (words for the partner and the task). */
  status(): Promise<{ ok: true; version: string } | { ok: false; why: string }>;
  /** Turns the task's browser tools on (listed on Ducter's MCP) for this profile. Downloads land in `downloads`. */
  attach(taskId: string, a: { profile: string; evidenceDir: string; downloads: string }): void;
  /** The task is done with the browser: quits it cleanly (sign-ins saved) when nobody else uses it. */
  release(taskId: string): Promise<boolean>;
}

export interface WorkerLinks {
  /** By device id or name; undefined when no such worker was ever paired. */
  link(device: string): WorkerLink | undefined;
  list(): WorkerInfo[];
}

// ---------- runner ----------

/** A per-task MCP sidecar the harness starts over stdio (e.g. cua-driver for a browser place). */
export interface StdioMcpConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SessionSpec {
  harness: HarnessId;
  model?: string;
  cwd: string;
  systemPrompt?: string; // replaces the harness default where supported
  appendSystemPrompt?: string;
  mcp: (ReturnType<McpHub["configFor"]> | StdioMcpConfig)[];
  permissionMode: "bypass"; // D16: no per-call approvals
  // Leave out the user's own harness config (global CLAUDE.md, user settings, plugins and their
  // hooks, user MCP servers). The partner always isolates; tasks keep it by default (system.md).
  isolateUserConfig?: boolean;
  env?: Record<string, string>; // extra env for the harness process (never logged)
  resumeSessionId?: string;
  // Per-task narrowing (e.g. a browser place): extra denied tools, and for claude-code only,
  // extra launch flags and whether to leave out the user's own Claude config.
  disallowedTools?: string[];
  launchArgs?: string[];
  // claude-code: leave out the user's own Claude config. codex: Ducter's clean setup, keeping
  // Codex's own browser and Computer Use plugins (a browser place on Codex's own tools, D130).
  userConfiguration?: "include" | "exclude";
  // D135: the window the session runs on (standard-window models, never a 1M variant when it
  // fits) and where the harness's own compactor may fire. The partner keeps its compactor above
  // the re-cut (research/11 §7.3.7); a task compacts at its compaction point. Each harness maps
  // them in runner/oar.ts from protocol/harness-facts.ts.
  contextWindow?: number;
  harnessCompactAt?: number;
  // Tasks (D130): under the clean setup, Codex keeps its own browser and Computer Use plugins.
  // The partner and the judge leave it unset (their clean setup turns them off).
  keepNativeTools?: boolean;
  /** D168: the user's plugins to turn off by id in this session only (their Mem plugin, when memory is off in Ducter). */
  disablePlugins?: string[];
  // Tasks only (D135): what the harness keeps when it compacts (Claude Code's PreCompact hook
  // prints it as compact instructions). Absent: the partner's setup (no hook).
  preCompactNote?: string;
  // The partner only (principle 6: the in-turn executor has no environment and only reads): no
  // native tool that writes or runs anything; Ducter's MCP tools stay. Each harness maps it in
  // runner/oar.ts (Claude Code and pi deny the tools, Codex runs its read-only sandbox).
  readOnly?: boolean;
  // D142, a folder place: writes stay inside cwd where the harness can enforce it (Codex: its
  // workspace-write sandbox, network on). Claude Code has no such switch under bypass; its brief
  // asks it, and the folder's copy makes what it changed there undoable.
  confineWrites?: boolean;
}

export interface HarnessEvent {
  role: "assistant" | "user" | "tool" | "system";
  text?: string;
  tool?: { name: string; input?: unknown; output?: string; ok?: boolean };
  thinking?: string[]; // the headings of a stretch of thinking (D127)
  // Totals are the session's running bill. contextTokens is what the context held at the turn's
  // last model call, as the harness reported it (input + cache read + cache write), when it did.
  usage?: { inputTokens?: number; cacheRead?: number; cacheWrite?: number; outputTokens?: number; contextTokens?: number };
  turnEnd?: boolean;
  raw?: unknown;
}

export interface HarnessSession {
  id: string; // native session id, resumable
  readonly canSteer: boolean; // harness accepts input mid-turn
  busy(): boolean; // a turn is in progress
  send(text: string, mode?: "turn" | "steer" | "queue"): Promise<void>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  events(): AsyncIterable<HarnessEvent>;
}

export interface HarnessPort {
  start(spec: SessionSpec): Promise<HarnessSession>;
  available(): Promise<{ harness: string; installed: boolean; loggedIn: boolean; models?: string[] }[]>;
}

export interface Runner {
  harness: HarnessPort;
  // language: the language the user reads the task's report in (from the conversation or their setting).
  // origin "you" (D128): the user opened it themselves; logged on task_open, and a harness given is their pick.
  // needs (D157): what the task needs of its computer; Ducter picks the computer (a place.device
  // the user named stays a pin).
  openTask(input: { persona: string; title: string; brief: string; place?: Place; project?: string; harness?: string; model?: string; language?: "zh" | "en"; origin?: "you"; needs?: TaskNeeds }): Promise<TaskCard>;
  // Optional (D120, ack and go): open a task while its brief is still being written. The card,
  // the place and the session start now; the brief becomes the session's first turn when it
  // settles. If it rejects, the task is dropped before it did anything.
  openTaskEarly?(input: { persona: string; title: string; place?: Place; project?: string; harness?: string; model?: string; language?: "zh" | "en"; needs?: TaskNeeds }, brief: Promise<string>): Promise<TaskCard>;
  // Logs the text as task_event {role:"user", from, clientId} before delivering it.
  send(taskId: string, text: string, mode?: "steer" | "queue", from?: "user" | "partner", clientId?: string): Promise<{ delivered: Delivery }>;
  interrupt(taskId: string): Promise<void>;
  // Optional: resume (or start) a finished/dropped task's session and tell it to carry on.
  reopen?(taskId: string): Promise<{ delivered: Delivery }>;
  // Optional: Undo a drop; merge the task branch into its base in the user's checkout; push +
  // open a draft PR (an outside effect). Each resolves with a user-facing message.
  undrop?(taskId: string): Promise<{ ok: boolean; message: string; ref?: string }>;
  merge?(taskId: string): Promise<{ ok: boolean; message: string; ref?: string }>;
  openPr?(taskId: string): Promise<{ ok: boolean; message: string; ref?: string }>;
  // Optional (D89): move a task to another AI agent. A running task is handed off: its session
  // closes and the new one starts from the brief and the saved progress. ok:false with a
  // user-facing message when it can't.
  switchBody?(taskId: string, harness: string, model?: string): Promise<{ ok: boolean; message?: string }>;
  // Optional (D157, E3): move a task to another computer (to.device: its name, "local" for the
  // home), with who does it there. A repo task's branch is pushed first; a folder never moves.
  moveTask?(taskId: string, to: { device: string; name: string; homeName?: string }, harness?: string, model?: string): Promise<{ ok: boolean; message?: string }>;
  drop(taskId: string): Promise<void>;
  // Optional: what a repo task's branch holds that its base doesn't, with its diff stat (D128:
  // On hand by project). Undefined when not a repo task or it can't tell.
  branchChanges?(taskId: string): Promise<BranchChanges | undefined>;
  // Optional (D142): a non-git folder task's changes against the copy Ducter kept (files: with
  // the list); undefined when not a folder task or nothing was ever kept. undoFolder puts the
  // folder back (path: one entry only; force: even though it changed after the task finished);
  // keepFolder frees the copy. Each resolves with a user-facing message.
  folderChanges?(taskId: string, opts?: { files?: boolean }): Promise<FolderChanges | undefined>;
  undoFolder?(taskId: string, opts?: { path?: string; force?: boolean }): Promise<{ ok: boolean; message: string; confirm?: UndoConfirm }>;
  keepFolder?(taskId: string): Promise<{ ok: boolean; message: string }>;
  // Optional (D148): what a restart mustn't cut short right now (a merge, an undo, a keep, an
  // archive), as task ids; and, while an update restarts Ducter, a reason new ones are refused
  // with (undefined lets them through again).
  critical?(): string[];
  holdCritical?(why: string | undefined): void;
  // Optional (D156): while an AI agent's updater runs on this machine, a session on it waits to start.
  holdHarness?(harness: string, on: boolean): void;
}

export function createRunnerSignature(_core: CoreApi): Runner {
  throw new Error("signature only: runner exports createRunner(core: CoreApi): Runner");
}

// ---------- partner ----------

export interface Partner {
  // Called by core for: user_msg, report (done/failed/needs_input), decision_resolved, waiter fired.
  onTrigger(e: LogEvent): void; // must not block; queues and coalesces (principle 6)
}

export function createPartnerSignature(_core: CoreApi, _runner: Runner): Partner {
  throw new Error("signature only: partner exports createPartner(core: CoreApi, runner: Runner): Partner");
}
