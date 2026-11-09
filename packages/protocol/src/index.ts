// Ducter protocol: the single contract shared by core, runner, partner, and clients.
// Changes here go through the lead. The Go client mirrors these types in
// apps/desktop/internal/protocol (keep field names identical; JSON is the wire format).

export * from "./harnesses.ts";
import type { HarnessId } from "./harnesses.ts";
export * from "./loadout.ts";
import type { BodyWhy, Candidate, RuleView, TaskBody } from "./loadout.ts";

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
  // hasRemote: whether the repo has an origin to push to (set when the task opens); false hides
  // Open draft PR. Absent (tasks from before it): unknown, the action stays and says why if it fails.
  | { kind: "repo"; device: string; repoPath: string; worktree?: string; branch?: string; baseBranch?: string; hasRemote?: boolean }
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

/** A task branch against its base: commits only it has, and work not yet committed. */
export interface BranchChanges {
  commits: number;
  uncommitted: boolean;
  /** D128: the diff against where the branch left its base (committed and uncommitted tracked
   *  work): files touched, lines added and removed. Absent when it couldn't be counted. */
  files?: number;
  adds?: number;
  dels?: number;
}

/** What a task changed so far, for On hand by project and the opened task's Changes header
 *  ("改动 · 3 个文件 +42 −7"). Cached by core; `at` is when it was counted. */
export interface DiffStat {
  files: number;
  adds: number;
  dels: number;
  at: string;
}

/** False only when Ducter checked and the branch holds nothing its base doesn't: nothing to merge
 *  or open a PR for. Unknown counts as changes (the actions themselves refuse if there are none). */
export const hasBranchChanges = (r: { branch?: BranchChanges } | undefined): boolean =>
  !r?.branch || r.branch.commits > 0 || r.branch.uncommitted;

export interface Question {
  id: string;
  text: string;
  blocking: boolean;
  default?: string; // the action taken if the user doesn't answer
  reversible: boolean; // a default applies on its own only if reversible
}

export interface Bodies {
  user_msg: { text: string; clientId?: string };
  // decisionId: a task's question said in the partner's own words (D129); clients show it as
  // that decision's question, not as a message of its own.
  ai_msg: { text: string; replyTo?: number; decisionId?: string };
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
    routineId?: string; // a routine's proposal card (D114): Go activates it
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
    language?: "zh" | "en"; // the language the user reads its reports in (the brief says so)
    // D128: "you" = the user opened it themselves (开一件事 / New task, `ducter task`); the brief
    // is their words as they are. Absent = the partner opened it.
    origin?: "you";
  };
  task_state: { taskId: string; attention: Attention; residency: Residency; reason?: string };
  // Who does the task and why (D89, focus-window.md "Choosing a body"): appended when it opens
  // and on every switch. The card shows the latest one.
  body_selected: { taskId: string; harness: string; model?: string; why: BodyWhy };
  // role "user" + from "user" = text the user sent straight into the task (logged by the runner).
  task_event: {
    taskId: string;
    role: "assistant" | "user" | "tool" | "system";
    from?: "user" | "partner" | "runner";
    text?: string;
    clientId?: string; // a user's task_send carries the client's id (resends are deduped by it)
    tool?: { name: string; input?: unknown; output?: string; ok?: boolean };
    thinking?: string[]; // a stretch of the model's thinking: its headings only, never its text (D127)
    usage?: Usage; // present on turn ends
    raw?: unknown;
  };
  report: {
    taskId: string;
    state: "progress" | "needs_input" | "blocked" | "done" | "failed";
    summary: string; // ≤ 600 chars
    questions: Question[];
    evidence: EvidenceRef[];
    /** Set by Ducter when the report is logged (never by the task): what the task's branch holds
     *  that its base branch doesn't. Absent when unknown (no repo, no base, an older worker). */
    branch?: BranchChanges;
  };
  checkpoint: { taskId: string; text: string; gitRef?: string };
  // A waiter is a cheap wait that wakes the partner (wait_until). Shown on On hand as a compact row.
  // decisionId: a wait tied to a question (an ask); it is cancelled when the question is answered.
  // D112: a waiter waits for a condition, not only a time. kind "check" runs a small read-only
  // command on a schedule (no model); "event" reads new items from a connection's trigger;
  // judge adds a cheap model's yes/no over what a check or event fetched. `reason` is always
  // the condition in the user's words; `check` is shown only in the opened task's Details.
  // `until` is the deadline: past it the waiter is "expired" and the partner is told.
  waiter: {
    waiterId: string;
    taskId?: string;
    decisionId?: string;
    routineId?: string; // a condition routine's watch (D114): firing starts a run, then it re-arms
    at?: string;
    reason: string;
    state: "armed" | "fired" | "cancelled" | "expired";
    kind?: WaitKind; // absent = "timer"
    check?: CheckSpec;
    event?: EventSpec;
    judge?: string; // the yes/no question a cheap model answers over the fetched data
    everyMs?: number; // how often it looks (check/event); backs off on errors
    until?: string; // ISO deadline
    observed?: string; // fired/expired: what it saw last (<= 200 chars)
    held?: boolean; // a routine's watch re-armed while the condition still holds: fires only once it stops and holds again
  };
  // One look of a check/event waiter, logged only when what it saw changed (or it began failing),
  // on the task's stream (task waiters) or the channel. Clients fold them into Details.
  waiter_look: { waiterId: string; taskId?: string; ok: boolean; met: boolean; summary: string; error?: string; checkpoint?: unknown };
  // D113: `until` on a task: keep going until the condition holds. One snapshot per change.
  until: {
    taskId: string;
    condition: string; // in the user's words
    check?: CheckSpec; // when the condition compiles to a check, it decides before any model
    maxTries: number; // default 20
    state: "on" | "met" | "stopped";
    stop?: "met" | "max" | "no_progress" | "oscillation" | "user" | "task_finished";
  };
  // One try's verdict, after the task's turn ended with a report.
  // progress: how much of a countable goal holds after the try (4 of 6 checks pass), when known.
  until_try: { taskId: string; n: number; verdict: "met" | "better" | "same" | "worse" | "unknown"; summary: string; by: "check" | "judge"; tokens?: number; progress?: Progress };
  // D114: a routine (例行). One snapshot per change; the latest wins.
  routine: RoutineBody;
  // A firing: "started" opens a run task; "skipped" records a firing that could not run (with how
  // many were coalesced into it); "done"/"failed" close a run from its task's final report.
  routine_run: { routineId: string; runId: string; scheduledFor: string; state: "started" | "skipped" | "done" | "failed"; taskId?: string; catchUp?: boolean; coalesced?: number; reason?: string; tokens?: number };
  // The partner saved something durable to the user's long-term memory (Nowledge Mem). Clients
  // show one quiet line under the reply: "记下了 · <title>" / "Noted · <title>". Never a card,
  // never a notification. Provenance lives in Mem, not here.
  memory_noted: { title: string; memoryId?: string; replyTo?: number };
  // Nowledge Bridge (behind DUCTER_BRIDGE=1, design/bridge.md). "in": a message another agent
  // sent the persona (origin "peer"); its text is untrusted task context, never the user's
  // permission. "out": the partner's reply to one (origin "partner"). Clients show one quiet
  // line (copy pending the glossary): "<from> 发来请求" / "Request from <from>", and
  // "已回复 <to>" / "Replied to <to>". Not "交接 / hand-off": that word is a task changing body.
  // Spike (bridge-spike): "out" may also be a NEW message the user confirmed on a card
  // (decisionId); `taskId` links an exchange to the task opened for it, so the result reply is
  // owed by code, not by prompt. An "in" with `inReplyTo` answers one of ours.
  // `agent` is the other agent's own name and `mine` says it belongs to the user, so it is called
  // "你的 <agent>" / "your <agent>"; a teammate's stays "<agent> (<member>)" in `from`/`to` (D108).
  // Outgoing operations (D106): every "out" carries `opId`, and one op is logged once per `state`
  // it passes through: "pending" (a send card is up; `contact` is the handle), "held" (the user
  // held it), "sending" (logged before the CLI call), then "sent", "failed" (definitely not
  // sent), "unknown" (no answer; recovered by outbox → inspect → resume on the same
  // `operation`, never a second send) or "unconfirmed" (recovery gave up; never resent).
  // "followed" marks the one follow-through line said about an unanswered sent message (D110).
  // No `state` = "sent" (events logged before D106).
  bridge_msg: {
    direction: "in" | "out";
    messageId: string;
    from?: string;
    to?: string;
    text: string;
    inReplyTo?: string;
    sentAt?: string;
    taskId?: string;
    decisionId?: string;
    agent?: string;
    mine?: boolean;
    state?: "pending" | "held" | "sending" | "sent" | "failed" | "unknown" | "unconfirmed" | "followed";
    opId?: string;
    contact?: string;
    operation?: string;
  };
  // The partner's own harness session, on the "partner" stream (never shown; clients skip it).
  // "recut": Ducter started a fresh session from the projection because the live context grew
  // past the re-cut size (principle 4). "harness_compacted": the harness's own compactor ran
  // anyway, although it is bounded above the re-cut (research/11 §7.3.7); its summary now
  // competes with the spine, so it is recorded to be seen.
  partner_session: {
    event: "recut" | "harness_compacted";
    harness: string;
    sessionId?: string;
    contextTokens?: number; // what the context held, by the harness's count when it gave one
    digested?: boolean; // recut: onto digests (true) or onto the window and pointers only (false)
    outcome?: string; // harness_compacted: the harness's own outcome and trigger
    trigger?: string;
  };
  // A call into one of the user's connections (D96, design/connectors.md): their OpenConnector or
  // another MCP server, reached only through Ducter's broker. Reads run and are recorded here;
  // a write is recorded "needs_go" with its input, waits for the user's Go on a decision card,
  // and runs once after it ("done"/"failed"). Never carries a token. On the channel for the
  // partner, on the task's stream for a task. Clients stay quiet about reads.
  connection_call: {
    callId: string;
    connectionId: string;
    connection: string; // its name, for display
    action: string; // an OpenConnector action id (gmail.search_threads) or an MCP tool name
    op: "read" | "write";
    state: "done" | "failed" | "denied" | "needs_go" | "held";
    taskId?: string;
    decisionId?: string;
    input?: unknown; // writes only: what Go runs
    summary?: string; // ≤ 200 chars, never the provider's full output
    error?: string;
  };
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
  /** Who does it now and why (the latest body_selected); absent on tasks from before D89. */
  body?: TaskBody;
  attention: Attention;
  residency: Residency;
  reason?: string;
  lastReport?: Bodies["report"];
  pendingDecisionId?: string;
  pendingDecision?: Bodies["decision"] & { askedAt: string }; // the open decision, for On hand
  openedAt: string;
  updatedAt: string;
  until?: UntilView; // D113
  fromRoutine?: { routineId: string; name: string }; // a routine's run (D114)
  openedBy?: "you"; // D128: the user opened it themselves; absent = the partner did
  changes?: DiffStat; // D128: repo tasks, once counted (cached; refreshed after each turn)
}

export interface OnHand {
  tasks: TaskCard[];
  counts: Record<"needs_you" | "working" | "waiting" | "done_today", number>;
  waiters: WaiterView[]; // armed waiters (task-less ones render as compact rows)
  /** D114: every routine that isn't ended or dismissed, proposed ones included (their card). */
  routines?: RoutineView[];
}

/** An armed waiter plus what it has seen so far (kept by core, not logged per look). */
export type WaiterView = Bodies["waiter"] & { armedAt?: string; lastLookAt?: string; lastSummary?: string; looks?: number; nextLookAt?: string; changes?: number };

// ---------- Work over time (D112-D115, design/product-model.md section 4) ----------

export type WaitKind = "timer" | "check" | "event" | "judge";

/**
 * A compiled condition: a read-only command (argv, never a shell line) run where the task works,
 * and what counts as met. The allowed commands are in protocol/src/checks.ts.
 */
export interface CheckSpec {
  argv: string[];
  device?: string; // "local" (default) or a worker's device
  cwd?: string; // default: the task's place
  succeedWhen: Predicate;
}

/**
 * What counts as met. path: a JSON path into stdout ("state", "[].state"; "[]" maps over an
 * array, and every item must match unless `any`). equals / oneOf / contains / matches test the
 * value (or stdout when there is no path). exitCode is checked only when given, or when nothing
 * else is (then 0).
 */
export interface Predicate {
  exitCode?: number;
  path?: string;
  equals?: string | number | boolean | null;
  oneOf?: (string | number | boolean | null)[];
  contains?: string;
  matches?: string;
  any?: boolean;
}

/** New items from a connection's trigger (OpenConnector Provider Triggers, design/connectors.md 4.5). */
export interface EventSpec {
  connection: string; // a connection id or name
  service: string; // "gmail"
  trigger: string; // "gmail.on_message_received"
  config?: unknown;
  contains?: string; // a cheap code filter on each item's text before any judge
}

export type RoutineTrigger =
  | {
      kind: "time";
      every: "day" | "weekday" | "week" | "month" | "hours";
      days?: number[]; // week: 0 = Sunday ... 6
      dayOfMonth?: number; // month
      hours?: number; // hours: every n hours, starting at `time`
      time: string; // "09:00"
      zone: "personal" | "world"; // personal follows the user; world stays pinned (D29)
      tz: string; // IANA zone; for personal, replaced by the user's current zone at each firing
    }
  | { kind: "condition"; condition: string; check?: CheckSpec; event?: EventSpec; judge?: string; everyMs: number };

export interface RoutineBody {
  routineId: string;
  name: string; // short, in the user's language
  trigger: RoutineTrigger;
  triggerWords: string; // the trigger in words ("每周一 9:00 · 跟着你的时区")
  brief: string; // what each run does, self-contained
  place?: Place;
  reports: "every" | "on_change" | "needs_you"; // digests the user asked for are "every"
  effect: "read_only" | "drafts" | "local_writes"; // anything beyond it becomes a question
  budget: { perRunTokens?: number; monthTokens: number }; // perRun: 2x the first run's, once known
  state: "proposed" | "active" | "paused" | "ended" | "dismissed";
  decisionId?: string; // its proposal card
  createdAt: string;
  reviewAt: string; // 30 days after it starts; then it asks "Keep this?"
  pausedBy?: "user" | "partner" | "system";
  pauseReason?: "asked" | "failures" | "unread" | "review" | "budget";
}

export interface RoutineView extends RoutineBody {
  nextAt?: string; // the next firing (time triggers, while active)
  upcoming?: string[]; // the next 5 firings (time triggers), for the proposal card
  dryRun?: { met: boolean; summary: string; at: string }; // condition triggers: a live look
  lastRun?: Bodies["routine_run"] & { at: string };
  running?: string; // the task id of a run in progress
  monthTokens?: number; // used this month
}

/** How much of a counted goal holds: checks that pass, or items a judge counted (done of total). */
export interface Progress {
  done: number;
  total: number;
  unit?: "checks" | "items"; // absent = checks
}

/** A task's `until` with its tries, for the try strip. */
export interface UntilView {
  condition: string;
  maxTries: number;
  state: Bodies["until"]["state"];
  stop?: Bodies["until"]["stop"];
  check?: CheckSpec;
  tries: { n: number; verdict: Bodies["until_try"]["verdict"]; summary: string; by: "check" | "judge"; at: string; progress?: Progress }[];
  tokens?: number;
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
  // tz: the client's IANA zone; personal-time routines follow the latest one (D114).
  // client: what is connecting (D128: `open_task` goes to the apps, never to a CLI); absent = an app.
  | { t: "hello"; persona?: string; cursor?: number; locale?: "zh" | "en"; tz?: string; client?: ClientKind }
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
  | { t: "memory_forget"; seq: number }
  // Who does the tasks (D89): "rules" answers with a rules frame and keeps the socket subscribed;
  // rule_remove (不要这条 / Remove) drops one, then every subscriber gets a fresh rules frame.
  // Rules are added only by saying them in the conversation (the partner's rule_save tool).
  | { t: "rules" }
  | { t: "rule_remove"; id: string }
  // candidates: who could do this task, best first (换谁来做 / Switch who does it); answered with
  // a candidates frame. task_switch moves the task to another AI agent (换到 X 接着做 / Continue
  // on X): a pin, and a handoff from saved progress if it is running; answered with action_result
  // (action "switch"). After two switches the same way the partner asks once whether to make it
  // a rule (a partner-level decision).
  | { t: "candidates"; taskId: string }
  | { t: "task_switch"; taskId: string; harness: string; model?: string }
  // Connections (D96): the user's OpenConnector or another MCP server. "connections" answers with
  // a connections frame and keeps the socket subscribed. "connection_add" checks the address and
  // token before saving (answered with connection_result, then a fresh frame). "connection_oo"
  // is the one tap (D122): with oo signed in, Ducter reads the accounts through the oo CLI itself
  // (oo's own sign-in, which never leaves oo); otherwise the self-hosted OpenConnector oo is set
  // up with, read only on this tap.
  | { t: "connections" }
  | { t: "connection_add"; url: string; token?: string; name?: string }
  | { t: "connection_remove"; id: string }
  | { t: "connection_oo" }
  // Work over time (D112-D114), each answered with action_result (taskId = the waiter or routine
  // id). waiter_action look: look now; cancel: 不等了 / Stop waiting. routine_action pause, resume
  // (only a person resumes), end. until_action stop: stop the loop after this try.
  | { t: "waiter_action"; waiterId: string; action: "look" | "cancel" }
  | { t: "routine_action"; routineId: string; action: "pause" | "resume" | "end" }
  | { t: "until_action"; taskId: string; action: "stop" }
  // 开一件事 / New task (D128). task_new_options: what the card offers (places, recent first,
  // and who could do it at `place`, best first); answered with a task_new_options frame.
  // task_new: open a task with the user's words as they are, as its brief (no partner rewrite);
  // answered with task_new_result. place absent = 不用特定的地方 / No particular place; a repo
  // place without baseBranch starts from the repo's default branch. harness (and model) only
  // when the user picked someone other than the top candidate: it is pinned for this task.
  // clientId: a resend with the same id opens nothing twice and gets the same result.
  | { t: "task_new_options"; place?: Place }
  | { t: "task_new"; words: string; place?: Place; harness?: string; model?: string; clientId?: string }
  // open_task: show this task in the apps (`ducter open <task>`): pushed to every connected app
  // as an open_task frame; the sender gets open_result with how many apps were told.
  | { t: "open_task"; taskId: string };

/** desktop: the Mac app; web: the web or phone client; cli: a `ducter` command. */
export type ClientKind = "desktop" | "web" | "cli";

/** One place the New task card offers (D128). */
export interface PlaceChoice {
  place: Place; // kind "none" is 不用特定的地方 / No particular place (always last)
  name: string; // the repo's folder name; "" for no particular place
  usedAt?: string; // the last task there, or when the repo was last touched
  defaultBranch?: string; // repo places on this machine: what a task starts from unless picked
  branches?: string[]; // local branches, most recently committed first (at most 30)
}

/** Why a New task didn't open: empty words, nothing can do it, not a repo, its device is away, or anything else (message). */
export type NewTaskReason = "empty" | "no_agent" | "not_repo" | "offline" | "failed";

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
  | { t: "rules"; rules: RuleView[] }
  | { t: "candidates"; taskId: string; candidates: Candidate[] }
  | { t: "connections"; connections: ConnectionView[]; oo: OoDetect }
  | { t: "connection_result"; ok: boolean; id?: string; reason?: ConnectionReason }
  // What the partner is doing while the user waits for its reply (D104): sent on every change and
  // after each welcome, null when the turn ends. Never logged: it is presence, not history.
  | { t: "activity"; activity: PartnerActivity | null }
  // D128: New task. card: the task as On hand will show it; message: a reason in words (English).
  | { t: "task_new_options"; places: PlaceChoice[]; candidates: Candidate[] }
  | { t: "task_new_result"; ok: boolean; clientId?: string; taskId?: string; card?: TaskCard; reason?: NewTaskReason; message?: string }
  // Show this task (the app opens it, Esc returns). open_result answers the sender: apps = how many apps were told.
  | { t: "open_task"; taskId: string }
  | { t: "open_result"; taskId: string; ok: boolean; apps: number; message?: string }
  | { t: "error"; message: string };

/**
 * The step of a partner turn the user is waiting on, as a plain verb the client words (D104).
 * Mapped from the partner's own tool calls; tool names never reach a client.
 * thinking: no tool yet · recalling: reading the Log or memory · checking_task: reading a task ·
 * opening_task: starting one · messaging_task: passing something to one · planning: setting a
 * reminder or an ask · looking: any other lookup.
 */
export type ActivityStep = "thinking" | "recalling" | "checking_task" | "opening_task" | "messaging_task" | "planning" | "looking";
export interface PartnerActivity {
  step: ActivityStep;
  since: string; // ISO: when the turn started
  stepSince: string; // ISO: when this step started
}

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
  /**
   * web only (D130): where browser tasks run. chrome = the user's own Chrome, through an AI
   * agent's own browser tools (Codex, Claude in Chrome), no cua-driver needed; ducter = Ducter's
   * own browser (cua-driver).
   */
  where?: "chrome" | "ducter";
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

// ---------- Connections (D96, design/connectors.md) ----------
// Where the user's accounts are reached: their own OpenConnector (OOMOL Hosted or self-hosted) or
// another MCP server. The token stays in Ducter's data folder (0600), never in a frame.

/**
 * oomol: OOMOL Hosted (mail and sign-ins pass through OOMOL); self: the user's own OpenConnector;
 * mcp: any other MCP server; oo: the accounts the user's oo CLI is signed in to, read through oo
 * itself (D122; mail and sign-ins pass through OOMOL).
 */
export type ConnectionSource = "oomol" | "self" | "mcp" | "oo";

/** One service the user connected in oo, and the accounts in it (each account's own label, e.g. its address). */
export interface OoApp {
  service: string; // "gmail"
  title: string; // "Gmail"
  accounts: string[];
}

export interface ConnectionView {
  id: string;
  name: string;
  url: string; // the MCP endpoint, without any secret
  source: ConnectionSource;
  addedAt: string;
  via: "manual" | "oo";
  state: "ok" | "unreachable" | "unauthorized" | "unknown";
  checkedAt?: string;
  /** Source oo: what it can read, as oo last listed it. */
  apps?: OoApp[];
}

/** What the user's oo CLI is set up with, as far as Ducter can tell without reading a secret. */
export interface OoDetect {
  installed: boolean;
  /** A self-hosted OpenConnector in oo's connector.toml or OO_CONNECTOR_URL: its address only. */
  selfHosted?: { url: string; hasToken: boolean };
  /** Signed in to an OOMOL account (oo auth status). The one tap then reads through oo itself (D122). */
  account: boolean;
  /** When signed in: the accounts connected in oo, once oo has listed them. */
  apps?: OoApp[];
}

export type ConnectionReason = "bad_url" | "unreachable" | "unauthorized" | "not_mcp" | "duplicate" | "unknown_connection" | "no_oo" | "oo_signed_out";

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
  wait_for: { reason: string; taskId?: string; check?: CheckSpec; event?: EventSpec; judge?: string; everyMinutes?: number; untilISO?: string };
  keep_going: { taskId: string; condition: string; check?: CheckSpec; maxTries?: number };
  reply: { text: string };
  report_to_main: Bodies["report"] extends infer R ? Omit<R & object, "taskId"> : never;
  checkpoint: { text: string };
  memory_search: { query: string; limit?: number };
  memory_add: { title: string; content: string; importance?: number };
  bridge_reply: { messageId: string; text: string };
}

export const PROTOCOL_VERSION = 2;
