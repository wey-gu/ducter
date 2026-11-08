// Ducter protocol: the single contract shared by core, runner, partner, and clients.
// Changes here go through the lead. The Go client mirrors these types in
// apps/desktop/internal/protocol (keep field names identical; JSON is the wire format).

// ---------- States (docs/design/focus-window-states.md) ----------

export type Attention =
  | "queued"
  | "working"
  | "needs_you"
  | "blocked" // shown to users as "Waiting"
  | "done_claimed" // "Done · checking"
  | "done"
  | "failed"
  | "dropped"
  | "superseded";

export type Residency = "provisioning" | "hot" | "warm" | "parked" | "archived" | "offline";

// ---------- Places (docs/design/product-model.md §3) ----------

export type Place =
  | { kind: "none"; device?: string } // device: where a place-less task runs (a worker); default this machine
  | { kind: "repo"; device: string; repoPath: string; worktree?: string; branch?: string; baseBranch?: string }
  | { kind: "folder"; device: string; path: string }
  | { kind: "browser"; device: string; profile: string };

// ---------- Log events ----------

export type Origin = "user" | "partner" | "task" | "system" | "waiter" | "schedule";

export interface EvidenceRef {
  kind: "ci" | "diff" | "file" | "url" | "log" | "test";
  label: string;
  ref: string;
}

export interface Question {
  id: string;
  text: string;
  blocking: boolean;
  default?: string; // the action taken if the user doesn't answer
  reversible: boolean; // a default applies on its own only if reversible
}

export interface Bodies {
  user_msg: { text: string; clientId?: string };
  ai_msg: { text: string; replyTo?: number };
  ack: { jobId: string; text: string; replyTo: number }; // names the action, never the outcome
  job_status: { jobId: string; text: string; state: "running" | "done" | "failed"; taskId?: string };
  living_msg: { items: LivingItem[] }; // supersedes the previous living_msg while unread
  decision: {
    decisionId: string;
    taskId?: string; // absent = a partner-level decision (the partner's own ask, before any task)
    question: string;
    goLabel: string; // e.g. "Rebase"; the UI shows "好，<goLabel>" / "Go: <goLabel>"
    defaultOption: "go" | "hold";
    defaultAt?: string; // ISO time the default applies (only if reversible)
    reversible: boolean;
  };
  decision_resolved: { decisionId: string; option: "go" | "hold" | "reply"; text?: string; by: "user" | "default" };
  read_receipt: { upToSeq: number };
  task_open: {
    taskId: string;
    title: string;
    project: string; // "" = Loose
    place: Place;
    harness: string; // "claude-code" | "codex" | "pi"
    model?: string;
    brief: string;
    bodyReason?: string; // why this harness/model
  };
  task_state: { taskId: string; attention: Attention; residency: Residency; reason?: string };
  // role "user" + from "user" = text the user sent straight into the task (logged by the runner).
  task_event: {
    taskId: string;
    role: "assistant" | "user" | "tool" | "system";
    from?: "user" | "partner" | "runner";
    text?: string;
    tool?: { name: string; input?: unknown; output?: string; ok?: boolean };
    usage?: Usage; // present on turn ends
    raw?: unknown;
  };
  report: {
    taskId: string;
    state: "progress" | "needs_input" | "blocked" | "done" | "failed";
    summary: string; // ≤ 600 chars
    questions: Question[];
    evidence: EvidenceRef[];
  };
  checkpoint: { taskId: string; text: string; gitRef?: string };
  // A waiter is a cheap wait that wakes the partner (wait_until). Shown on On hand as a compact row.
  waiter: { waiterId: string; taskId?: string; at?: string; reason: string; state: "armed" | "fired" | "cancelled" };
  // The partner saved something durable to the user's long-term memory (Nowledge Mem). Clients
  // show one quiet line under the reply: "记下了 · <title>" / "Noted · <title>". Never a card,
  // never a notification. Provenance lives in Mem, not here.
  memory_noted: { title: string; memoryId?: string; replyTo?: number };
}

export interface Usage { inputTokens?: number; outputTokens?: number; cacheRead?: number; cacheWrite?: number }

export type EventKind = keyof Bodies;

export interface LogEvent<K extends EventKind = EventKind> {
  seq: number; // gapless, assigned by the Log
  ts: string; // ISO
  persona: string;
  stream: string; // "channel" | `task:${taskId}`
  origin: Origin;
  kind: K;
  body: Bodies[K];
  supersedes?: number; // seq this event replaces (living_msg revisions)
}

export interface LivingItem {
  taskId: string;
  kind: "decision" | "blocked" | "done" | "progress" | "failed";
  title: string;
  text: string;
  decisionId?: string;
  evidence?: EvidenceRef[];
}

// ---------- On hand snapshot ----------

export interface TaskCard {
  taskId: string;
  persona: string;
  title: string;
  project: string;
  place: Place;
  harness: string;
  model?: string;
  bodyReason?: string;
  attention: Attention;
  residency: Residency;
  reason?: string;
  lastReport?: Bodies["report"];
  pendingDecisionId?: string;
  pendingDecision?: Bodies["decision"] & { askedAt: string }; // the open decision, for On hand
  openedAt: string;
  updatedAt: string;
}

export interface OnHand {
  tasks: TaskCard[];
  counts: Record<"needs_you" | "working" | "waiting" | "done_today", number>;
  waiters: Bodies["waiter"][]; // armed waiters (task-less ones render as compact rows)
}

// ---------- Client <-> main process WebSocket (ws://127.0.0.1:7777/ws) ----------
// Semantics:
//  - hello.cursor: the server replies welcome, then replays channel events with seq > cursor
//    (cursor omitted = the last 200 channel events), then on_hand, then streams live events.
//    Task streams are never pushed in bulk; clients pull them with task_history and receive
//    live task_event/task_state for every task afterwards.
//  - read.upToSeq: the user has seen the channel up to this seq. The living message is frozen
//    once read: the next update appends a new living_msg instead of superseding.
//  - task_send: delivered to the task as steer when it is mid-turn and the harness supports it,
//    otherwise as the next turn ("prompted") or queued behind the current turn.

export type ClientFrame =
  | { t: "hello"; persona?: string; cursor?: number; locale?: "zh" | "en" }
  | { t: "send"; text: string; clientId: string }
  | { t: "decide"; decisionId: string; option: "go" | "hold" | "reply"; text?: string }
  | { t: "task_send"; taskId: string; text: string }
  // merge: integrate the task branch into its base branch (local, reversible by revert);
  // open_pr: push the branch and open a draft PR (an intent: external effect, see G-safety).
  // The server acks every task_action with {t:"action_result"}.
  | { t: "task_action"; taskId: string; action: "interrupt" | "drop" | "undrop" | "reopen" | "merge" | "open_pr" }
  | { t: "read"; upToSeq: number }
  | { t: "task_history"; taskId: string; beforeSeq?: number; limit?: number };

export type ServerFrame =
  // machine: a hash of the machine the main runs on (core/src/machine.ts); a client that computes
  // the same hash is on that machine, so the place paths it sees are its own.
  | { t: "welcome"; persona: string; personaName: string; headSeq: number; machine?: string }
  | { t: "events"; events: LogEvent[] }
  | { t: "on_hand"; onHand: OnHand }
  | { t: "task_history"; taskId: string; events: LogEvent[] }
  | { t: "sent"; taskId: string; delivered: Delivery } // ack for task_send
  | { t: "action_result"; taskId: string; action: string; ok: boolean; message?: string; ref?: string } // ref: merge commit or PR URL
  | { t: "error"; message: string };

export type Delivery = "steered" | "prompted" | "queued";

// ---------- Ducter MCP tools (HTTP MCP served by core at /mcp, role-scoped by token) ----------
// role "partner": task_open, task_send, task_read, log_search, log_read, wait_until, ask, memory_search, memory_add
// role "task:<id>": report_to_main, log_search, log_read, checkpoint

export interface ToolArgs {
  task_open: { title: string; brief: string; place?: Place; project?: string; harness?: string; model?: string };
  task_send: { taskId: string; text: string; mode?: "steer" | "queue" };
  task_read: { taskId: string; level?: "card" | "report" | "transcript"; limit?: number };
  log_search: { query: string; stream?: string; limit?: number };
  log_read: { stream: string; fromSeq?: number; limit?: number };
  wait_until: { taskId?: string; at?: string; reason: string };
  reply: { text: string };
  report_to_main: Bodies["report"] extends infer R ? Omit<R & object, "taskId"> : never;
  checkpoint: { text: string };
  memory_search: { query: string; limit?: number };
  memory_add: { title: string; content: string; importance?: number };
}

export const PROTOCOL_VERSION = 2;
