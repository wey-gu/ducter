// In-process module boundaries for v1-tonight (one Bun process: `bun run up`).
//   core    owns: Log (SQLite), bus, task registry + state machine, decisions, living message,
//                 WS server (/ws), MCP HTTP server (/mcp), main.ts wiring.
//   runner  owns: HarnessPort over OAR, worktrees, task sessions, event normalization.
//   partner owns: the main AI (persona prompt, projection, turn loop) on Claude Code via runner's HarnessPort.
import type { Attention, Bodies, Delivery, EventKind, LogEvent, OnHand, Origin, Place, Residency, TaskCard } from "./index.ts";

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
  search(query: string, opts?: { stream?: string; limit?: number }): LogEvent[]; // FTS5
  head(): number;
  subscribe(fn: (e: LogEvent) => void): () => void;
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

export interface CoreApi {
  log: LogStore;
  tasks: TaskRegistry;
  mcp: McpHub;
  persona: { id: string; name: string; identity: string /* L1 text from Nowledge Mem or default */ };
  dataDir: string; // ~/.ducter
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
  harness: "claude-code" | "codex" | "pi";
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
}

export interface HarnessEvent {
  role: "assistant" | "user" | "tool" | "system";
  text?: string;
  tool?: { name: string; input?: unknown; output?: string; ok?: boolean };
  usage?: { inputTokens?: number; cacheRead?: number; cacheWrite?: number; outputTokens?: number };
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
  openTask(input: { persona: string; title: string; brief: string; place?: Place; project?: string; harness?: string; model?: string }): Promise<TaskCard>;
  // Logs the text as task_event {role:"user", from} before delivering it.
  send(taskId: string, text: string, mode?: "steer" | "queue", from?: "user" | "partner"): Promise<{ delivered: Delivery }>;
  interrupt(taskId: string): Promise<void>;
  // Optional: resume (or start) a finished/dropped task's session and tell it to carry on.
  reopen?(taskId: string): Promise<{ delivered: Delivery }>;
  drop(taskId: string): Promise<void>;
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
