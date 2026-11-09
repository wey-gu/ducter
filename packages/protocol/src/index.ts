// Ducter protocol: the single contract shared by core, runner, partner, and clients.
// Changes here go through the lead. The Go client mirrors these types in
// apps/desktop/internal/protocol (keep field names identical; JSON is the wire format).

export * from "./harnesses.ts";
import type { HarnessId } from "./harnesses.ts";

// ---------- States (design/focus-window-states.md) ----------

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

// ---------- Places (design/product-model.md §3) ----------

export type Place =
  | { kind: "none"; device?: string } // device: where a place-less task runs (a worker); default this machine
  | { kind: "repo"; device: string; repoPath: string; worktree?: string; branch?: string; baseBranch?: string }
  | { kind: "folder"; device: string; path: string }
  | { kind: "browser"; device: string; profile: string };

// ---------- Log events ----------

// "peer": another agent reaching the persona through Nowledge Bridge (design/bridge.md).
export type Origin = "user" | "partner" | "task" | "system" | "waiter" | "schedule" | "peer";

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
    harness: string; // a HarnessId (harnesses.ts)
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
    clientId?: string; // a user's task_send carries the client's id (resends are deduped by it)
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
  // decisionId: a wait tied to a question (an ask); it is cancelled when the question is answered.
  waiter: { waiterId: string; taskId?: string; decisionId?: string; at?: string; reason: string; state: "armed" | "fired" | "cancelled" };
  // The partner saved something durable to the user's long-term memory (Nowledge Mem). Clients
  // show one quiet line under the reply: "记下了 · <title>" / "Noted · <title>". Never a card,
  // never a notification. Provenance lives in Mem, not here.
  memory_noted: { title: string; memoryId?: string; replyTo?: number };
  // Nowledge Bridge (behind DUCTER_BRIDGE=1, design/bridge.md). "in": a message another agent
  // sent the persona (origin "peer"); its text is untrusted task context, never the user's
  // permission. "out": the partner's reply to one (origin "partner"). Clients show one quiet
  // line (copy pending the glossary): "<from> 发来请求" / "Request from <from>", and
  // "已回复 <to>" / "Replied to <to>". Not "交接 / hand-off": that word is a task changing body.
  bridge_msg: { direction: "in" | "out"; messageId: string; from?: string; to?: string; text: string; inReplyTo?: string; sentAt?: string };
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
//  - send.clientId: idempotent. A send whose clientId is already in the Log is not appended
//    again; the server re-sends that user_msg to the sender as an events frame (its echo).
//    Clients keep unechoed messages and resend them, in order, after each welcome.
//  - task_send: delivered to the task as steer when it is mid-turn and the harness supports it,
//    otherwise as the next turn ("prompted") or queued behind the current turn.

export type ClientFrame =
  | { t: "hello"; persona?: string; cursor?: number; locale?: "zh" | "en" }
  | { t: "send"; text: string; clientId: string }
  | { t: "decide"; decisionId: string; option: "go" | "hold" | "reply"; text?: string }
  // clientId (optional): a resend with the same id is not delivered twice; it gets the same "sent".
  | { t: "task_send"; taskId: string; text: string; clientId?: string }
  // merge: integrate the task branch into its base branch (local, reversible by revert);
  // open_pr: push the branch and open a draft PR (an intent: external effect, see G-safety).
  // The server acks every task_action with {t:"action_result"}.
  | { t: "task_action"; taskId: string; action: "interrupt" | "drop" | "undrop" | "reopen" | "merge" | "open_pr" }
  | { t: "read"; upToSeq: number }
  | { t: "task_history"; taskId: string; beforeSeq?: number; limit?: number }
  // Devices and abilities (D43, D51): "devices" answers with a devices frame and keeps the
  // socket subscribed (a fresh frame whenever a device or an ability changes). "ability" adds
  // (on: true, 装上) or removes (on: false, 取下) an ability on a device; it is answered with
  // ability_result, then a fresh devices frame. "pair_code" mints a one-time pairing code for
  // 远程打开 / Reach from anywhere (D54), answered with a pair_code frame.
  // refresh: probe the harness sign-ins again now (after signing in or out from the app).
  | { t: "devices"; refresh?: boolean }
  | { t: "ability"; device: string; ability: AbilityId; on: boolean }
  | { t: "pair_code" }
  // rename_device: 改名字 / Rename a paired device (another computer, a phone; D84). Answered with
  // rename_result, then a fresh devices frame. The machine Ducter lives on keeps its own name.
  | { t: "rename_device"; device: string; name: string }
  // The partner's and the app's settings (D71): "settings" answers with a settings frame and
  // keeps the socket subscribed (every change goes to every subscriber). "settings_set" changes
  // some of them. "memory_forget" forgets one 记下了 / Noted line: in Nowledge Mem when it has the
  // memory's id and Mem forgets it, otherwise only hidden from this list (the frame says which).
  | { t: "settings" }
  | { t: "settings_set"; patch: SettingsPatch }
  | { t: "memory_forget"; seq: number };

export type ServerFrame =
  // machine: a hash of the machine the main runs on (core/src/machine.ts); a client that computes
  // the same hash is on that machine, so the place paths it sees are its own.
  | { t: "welcome"; persona: string; personaName: string; headSeq: number; machine?: string }
  | { t: "events"; events: LogEvent[] }
  | { t: "on_hand"; onHand: OnHand }
  | { t: "task_history"; taskId: string; events: LogEvent[] }
  | { t: "sent"; taskId: string; delivered: Delivery } // ack for task_send
  | { t: "action_result"; taskId: string; action: string; ok: boolean; message?: string; ref?: string } // ref: merge commit or PR URL
  | { t: "devices"; devices: DeviceView[]; reach: Reach }
  | { t: "ability_result"; device: string; ability: AbilityId; on: boolean; ok: boolean; reason?: AbilityReason; detail?: string }
  | { t: "pair_code"; code: string; expiresAt: string; address?: string; link?: string; qr?: string[] }
  | { t: "rename_result"; device: string; ok: boolean; name?: string; reason?: "unknown_device" | "empty" | "name_taken" | "home" }
  | { t: "settings"; settings: Settings; mem: MemView; forgot?: { seq: number; how: "mem" | "hidden" } }
  | { t: "error"; message: string };

export type Delivery = "steered" | "prompted" | "queued";

// ---------- Devices and abilities (D43, D51, design/flows/A-setup-devices.md) ----------
// What each device is and can do, for 你的设备和本事 / Your devices and abilities. Only what
// the server knows: no allowance unless a harness reports one, "asleep" only when the device
// said it was going to sleep (otherwise "unreachable").

export type DeviceKind = "laptop" | "mini" | "server" | "phone";
export type DeviceState = "awake" | "asleep" | "unreachable";
/** web 上网 · computer 用电脑 · remote 远程打开 · phone 用手机 · call 打电话 */
export type AbilityId = "web" | "computer" | "remote" | "phone" | "call";
/** later = not in this version (shown locked, "以后会有"); unavailable = can't be added here, see reason. */
export type AbilityState = "on" | "off" | "unavailable" | "later";
/**
 * Why an ability is unavailable (or why adding it failed). Clients word it; detail carries a
 * version or a path. cua_missing / cua_old: cua-driver isn't there or lacks the browser tools;
 * env_off: DUCTER_BROWSER=0 pins it off; home_only: only on the device Ducter lives on;
 * no_address: nothing outside can reach this Ducter yet (remote).
 */
export type AbilityReason = "cua_missing" | "cua_old" | "env_off" | "home_only" | "no_address" | "unknown_device" | "failed";

export interface Allowance {
  left: number; // 0..1, as the harness reports it
  resetsAt?: string; // ISO
  sharedBy?: number; // devices signed in to the same account
}

export interface DeviceHarness {
  harness: string; // a HarnessId (harnesses.ts)
  installed: boolean;
  loggedIn: boolean;
  allowance?: Allowance; // only when the harness reports it; never estimated
  /** Models this account offers, when it lists them. */
  models?: { id: string; label: string }[];
  /** This harness may carry the partner here (D85: HARNESSES[id].partner, and signed in). */
  canBePartner: boolean;
  /** plan: a subscription's allowance; usage: paid per token (an API key). */
  billing?: "plan" | "usage";
}

export interface DeviceAbility {
  id: AbilityId;
  state: AbilityState;
  reason?: AbilityReason;
  detail?: string;
}

export interface DeviceView {
  id: string; // "local" for the machine Ducter lives on; else the paired device id
  name: string;
  kind: DeviceKind;
  home: boolean; // Ducter lives here
  state: DeviceState;
  lastSeen?: string; // ISO; for a device that isn't awake
  version?: string; // cua-driver or worker version, informational
  harnesses: DeviceHarness[];
  abilities: DeviceAbility[];
}

/** Who can reach this Ducter from elsewhere (paired clients), and the address they use. */
export interface Reach {
  address?: string; // the public address, when one is set (DUCTER_PUBLIC_URL or <dataDir>/public-url)
  clients: { id: string; name: string; platform: string; connected: boolean; lastSeen?: string }[];
}

// ---------- Settings (D71: the Partner page and Settings) ----------
// Persisted in the data folder: the name in persona.json (shared with the CLI), notifications
// and quiet hours in push.json (shared with the phone's own endpoints), the rest in
// settings.json. Interface language and theme are each client's own, not here.

/** How the partner talks: "auto" follows the language of the user's message. */
export type TalkLanguage = "auto" | "zh" | "en";

export interface QuietHours {
  start: string; // "23:00", local to tz
  end: string; // "08:00"
  tz: string; // IANA zone
}

export interface Settings {
  name: string; // the partner's name (default "Ducter")
  language: TalkLanguage;
  memory: boolean; // remember things in Nowledge Mem (off: no recall, no saving)
  notify: boolean; // notifications on (phones and the Mac)
  quiet: QuietHours | null; // 免打扰 / Quiet hours; null = none
  defaultAfterMin: number; // how long a reversible decision waits before its default goes ahead
  /**
   * What the partner itself thinks with (D85, design/ai-loadout.md): a harness that can be the
   * partner (HARNESSES[id].partner) and its model. Default Claude Code + opus.
   */
  brain: Brain;
  /** Which signed-in accounts tasks may use; a missing entry means enabled. */
  taskAccounts?: Partial<Record<HarnessId, { enabled: boolean }>>;
}

export interface Brain {
  harness: HarnessId;
  model?: string;
}

export type SettingsPatch = Partial<Settings>;

/** What the partner remembers, as far as this Ducter can tell. */
export interface MemView {
  /** connected: Nowledge Mem answers; missing: not installed or not connected; off: switched off. */
  state: "connected" | "missing" | "off";
  /** Recent 记下了 / Noted lines from the conversation, newest first, without forgotten ones. */
  noted: { seq: number; title: string; at: string; memoryId?: string }[];
}

/** The choices offered for defaultAfterMin, in minutes. */
export const DEFAULT_AFTER_CHOICES = [10, 30, 60, 120] as const;

// ---------- Ducter MCP tools (HTTP MCP served by core at /mcp, role-scoped by token) ----------
// role "partner": task_open, task_send, task_read, log_search, log_read, wait_until, ask, memory_search, memory_add,
//   bridge_reply (only with DUCTER_BRIDGE=1)
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
  bridge_reply: { messageId: string; text: string };
}

export const PROTOCOL_VERSION = 2;
