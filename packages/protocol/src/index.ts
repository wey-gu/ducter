// Ducter protocol: the single contract shared by core, runner, partner, and clients.
// Changes here go through the lead. The Go client mirrors these types in
// apps/desktop/internal/protocol (keep field names identical; JSON is the wire format).

export * from "./harnesses.ts";
import type { HarnessId } from "./harnesses.ts";
export * from "./loadout.ts";
export * from "./proactive.ts";
export * from "./saved.ts";
import type { FillAsk, PayAsk, SavedFrame, SavedInput } from "./saved.ts";
export * from "./phone.ts";
export * from "./media.ts";
export * from "./phone-use.ts";
export * from "./calendar.ts";
import type { PhoneAsk, PhoneClientFrame, PhoneInstallStep, PhoneServerFrame } from "./phone-use.ts";
import type { MediaRef } from "./media.ts";
import type { CalChange, CalGlance, CalToday } from "./calendar.ts";
import type { CallBody, CallPlan, CallView, OwnPhoneAction, OwnPhoneView, PhoneView, SignInView } from "./phone.ts";
import type { FindKind, FindRung, FindState, FindView, ProactiveAsk, ProactiveDay, ProactiveMode, ReadLine, SourceLook } from "./proactive.ts";
import type { BodyWhy, Candidate, RuleView, TaskBody, TaskNeeds } from "./loadout.ts";

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
  /**
   * Set by Ducter when a done report lands, never by the task (focus-window-states done? -> done):
   * verified: the commit is on the task branch, or the file is in its place; missing: it isn't;
   * absent: not checkable mechanically (a test count, a CI line, a URL), the task's word only.
   */
  check?: "verified" | "missing";
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

/** D142: one thing a task did to a folder that isn't a git repo, against the copy Ducter kept
 *  from before it wrote. moved: `from` is where it was (same parent folder = renamed). */
export interface FolderChange {
  kind: "added" | "changed" | "removed" | "moved";
  path: string; // relative to the folder, "/"-separated
  from?: string;
  dir?: boolean; // a folder (added or removed), not a file
}

/** D142: what a task changed in a non-git folder, counted against the copy Ducter kept.
 *  undo: open = 改回去 / Undo all changes is offered (until undoUntil, once the task is done);
 *  kept = the user said 就这样 / Keep the changes (the copy is freed); undone = put back;
 *  expired = the copy was freed after 7 days; none = no copy (the user let it change the folder
 *  directly). */
export interface FolderSummary {
  added: number; // new files
  changed: number; // same path, new content
  removed: number; // files gone
  moved: number; // files moved to another folder
  renamed: number; // files renamed in place
  folders: number; // new folders
  undo: "open" | "kept" | "undone" | "expired" | "none";
  undoUntil?: string; // ISO: when the copy goes (7 days after the task finished)
  at: string; // when it was counted
}

/** The summary with the list (at most 500 entries; `more` = how many were left out). */
export interface FolderChanges extends FolderSummary {
  files: FolderChange[];
  more: number;
}

/** D142: what an undo would lose: changes made after the task finished. */
export interface UndoConfirm {
  count: number;
  files: string[]; // at most 5
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
  /** D151: the task needs the user to sign in to a site in Ducter's browser (set by Ducter's
   *  browser_ask_sign_in tool, never by report_to_main). */
  signIn?: SignInAsk;
  /** D157: wait for a computer, or do it now on another (set by the runner, never by a task). */
  where?: WhereAsk;
  /** D191: one payment with a saved card (set by Ducter's browser_ask_to_pay, never by report_to_main). */
  pay?: PayAsk;
  /** D191: the first use of a saved sign-in or private detail on a site (set by browser_fill). */
  fill?: FillAsk;
  /** D217: a tap on Ducter's phone that commits (go), or the user's own turn on it (user); set by the phone tools only. */
  phone?: PhoneAsk;
}

/**
 * D170 (X1, design/bridge.md): a decision asked for one of the user's own agents that Ducter
 * didn't start (through Nowledge Bridge). Go is the option it named first (or suggested); `other`,
 * when present, is its second option, answered as a reply with that text. The user's answer goes
 * back to that agent by Ducter's code; silence never answers for the user.
 */
export interface PeerAsk {
  messageId: string; // the Bridge message it came in
  agent: string; // the agent's own name ("terminal-claude")
  mine?: boolean; // the user's own agent (always, in v1)
  where?: string; // where it works, from its own words ("~/dev/ducter")
  suggests?: boolean; // Go is the agent's own suggestion ("它建议 / It suggests")
  other?: string; // a second option, as a button beside Go
}

/**
 * D157 (design/where.md §7): before a computer closes, what moves to a computer that stays awake
 * (from its saved progress) and what can only run there (a folder; an app or the user's Chrome
 * nothing else has) and continues when it wakes. One decision for the whole computer.
 */
export interface ClosingPlan {
  device: string; // its id
  name: string;
  moves: { taskId: string; title: string; to: string; toName: string; harness: string; model?: string }[];
  stays: { taskId: string; title: string; why: "folder" | "only_here" }[];
}

/**
 * D157 (design/where.md §4.4): the one line asked when the best computer for a task is asleep and
 * another could start now with a visible difference, or the user's own pick waits on a computer
 * that can't be reached. Hold = wait for it (the default: not answering waits, nothing is lost);
 * Go = do it now on `other` (its agent when the pick moves: otherAgent).
 *  - asleep: device (the one it waits for) is asleep (or can't be reached: state);
 *  - pin: the user's own pick (agent) lives only on device, which can't be reached.
 * signIn: the user would sign in to site on `other` first; widens: `other` uses their Chrome.
 */
export interface WhereAsk {
  kind: "asleep" | "pin";
  device: string;
  state: "asleep" | "unreachable";
  other: string;
  agent?: string;
  otherAgent?: string;
  site?: string;
  /** What the computer it waits for would use (here) and what `other` would (uses). */
  here?: "chrome" | "ducter";
  uses?: "chrome" | "ducter";
  signIn?: boolean;
  widens?: boolean;
}

/** D151: 需要你登录一下 {site} / Sign in to {site}: the card opens a live view of Ducter's browser. */
export interface SignInAsk {
  site: string; // the host the user signs in to, e.g. "github.com"
  url?: string; // the sign-in page the task opened
}

export interface Bodies {
  // D206: media = the pictures the user sent with it (text may be empty then).
  user_msg: { text: string; clientId?: string; media?: MediaRef[] };
  // decisionId: a task's question said in the partner's own words (D129); clients show it as
  // that decision's question, not as a message of its own.
  // media (D206): what a task showed, relayed with the partner's words about it.
  // cal (D222): the day glance the partner put under these words (calendar do=agenda show).
  ai_msg: { text: string; replyTo?: number; decisionId?: string; media?: MediaRef[]; cal?: CalGlance };
  ack: { jobId: string; text: string; replyTo: number }; // names the action, never the outcome
  // act, ref (D216): the line a user's Merge or Open draft PR logs, with the merge's commit or the PR's address.
  job_status: { jobId: string; text: string; state: "running" | "done" | "failed"; taskId?: string; act?: "merge" | "open_pr"; ref?: string };
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
    signIn?: SignInAsk; // D151: a sign-in card; Go = 好了 / Done in the live view
    pay?: PayAsk; // D191: 付款 / Pay: merchant, amount, card; Go pays once, no default
    fill?: FillAsk; // D191: first use of a saved sign-in or detail on a site
    phone?: PhoneAsk; // D217: one tap on Ducter's phone that commits (Go taps it once), or the user's turn on it (Go = 好了 / Done)
    where?: WhereAsk; // D157: wait for a computer (Hold, the default) or do it now on another (Go)
    closing?: ClosingPlan; // D157: 合上之前搬走 / Move before closing: Go (the default) moves them
    anywhere?: { hostname: string }; // D228: create the tunnel in the person's Cloudflare account and point this hostname at the home (Go)
    memPlugin?: MemPluginAsk; // D169: put Nowledge Mem into this agent on that computer (Go); 先不装 / Not now (Hold, the default)
    // D165: a find's one next step. Clients render it inside its note (not as a card of its own);
    // On hand lists it like any ask. Never pushed on its own: the note is the one notification.
    findId?: string;
    asker?: PeerAsk; // D170: asked for one of the user's own agents; the answer goes back to it
    trust?: { agent: string }; // D170 (X2): 以后你的 <agent> 发来的活，直接接？ Go keeps the rule
    // D189/D193: a phone call. kind "go": the call's Go card (打给 X？ / Call X?), never a default,
    // never "don't ask next time". kind "question": a question from the line, pushed at once even
    // in quiet hours; its choices are buttons that answer with option "reply" and that text.
    // kind "sheet" (D215): a call sheet the owner calls themselves (no line calls that country); Go = 打完了 /
    // Done calling, Hold = 先不打 / Not now; 自己打 / Call it yourself is the client's own tel: link.
    call?: { callId: string; kind: "go" | "question" | "sheet"; plan?: CallPlan; choices?: string[]; yesNo?: boolean };
    // D222: a calendar change (add, move, cancel, answer an invitation). Go runs it once, by core;
    // its outcome is the connection_call with this decisionId (state done + link, or failed).
    cal?: CalChange;
  };
  // now (D208): a call's Go given as 现在就打 / Call now, over the callee's courtesy hours.
  decision_resolved: { decisionId: string; option: "go" | "hold" | "reply"; text?: string; by: "user" | "default"; now?: boolean };
  read_receipt: { upToSeq: number };
  task_open: {
    taskId: string;
    title: string;
    project: string; // "" = Loose
    place: Place;
    harness: string; // a HarnessId (harnesses.ts)
    model?: string;
    // D202: the reasoning effort the user picked (one of the model's own levels), kept so a resume keeps it.
    effort?: string;
    brief: string;
    bodyReason?: string; // why this harness/model
    language?: "zh" | "en"; // the language the user reads its reports in (the brief says so)
    // D206: the pictures the brief carries (the user's, handed on); the first turn gives them to the agent.
    media?: MediaRef[];
    // D128: "you" = the user opened it themselves (开一件事 / New task, `ducter task`); the brief
    // is their words as they are. Absent = the partner opened it.
    origin?: "you";
    // D157: what the task needs of its computer (kept so a move or a switch keeps them).
    needs?: TaskNeeds;
  };
  task_state: { taskId: string; attention: Attention; residency: Residency; reason?: string };
  // Who does the task and why (D89, focus-window.md "Choosing a body"): appended when it opens
  // and on every switch. The card shows the latest one.
  body_selected: { taskId: string; harness: string; model?: string; effort?: string; why: BodyWhy };
  // role "user" + from "user" = text the user sent straight into the task (logged by the runner).
  task_event: {
    taskId: string;
    role: "assistant" | "user" | "tool" | "system";
    from?: "user" | "partner" | "runner";
    text?: string;
    clientId?: string; // a user's task_send carries the client's id (resends are deduped by it)
    media?: MediaRef[]; // D206: pictures sent into the task with the text
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
    /** D142: set by Ducter on a done or failed report of a non-git folder task: what it changed
     *  there and until when it can be undone. */
    folder?: FolderSummary;
    /** D168: what the task thinks is worth remembering about the user (at most 3). A task never
     *  writes to Mem itself: the partner distills these and writes with the task's provenance. */
    remember?: RememberNote[];
    /** D206: what the task chose to show the user (screenshots, generated images, files it
     *  made), copied into the home's media store by Ducter. */
    media?: MediaRef[];
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
    // D144: a wait that ended without its condition says why, in the user's words (有一项检查挂了 /
    // a check failed). unmetSays is given at arm time for failWhen; unmet is set when it ends
    // ("cancelled" with unmet = it can't come true; "expired" = it ran out of time).
    unmetSays?: string;
    unmet?: string;
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
  // D148: one step of a device's update, on the "devices" stream (origin "system"). device is
  // "local" for the home or a paired device id; name is its name then. Clients show the latest
  // on the device's card; the partner reads it only when asked.
  device_update: { device: string; name: string; phase: UpdatePhase; from: string; to: string; reason?: UpdateReason; detail?: string; rolledBack?: boolean };
  // D156: one step of updating an AI agent on a device (same stream, same rules). by: a tap or
  // the night-time update.
  agent_update: { device: string; name: string; harness: string; phase: AgentPhase; from: string; to?: string; reason?: AgentReason; detail?: string; rolledBack?: boolean; by?: "user" | "night" };
  // D224: 全部更新 / Update all, on the same stream: a plan started, finished or was stopped (its
  // items' own steps are device_update and agent_update events). by: a tap, the CLI, or the night.
  update_all: { id: string; phase: "started" | "finished" | "stopped"; by: UpdateAllBy; items: number; done?: number; failed?: number };
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
    // in: "early" = in the mailbox before Bridge was on for this persona (B14), "set_aside" = over
    // the sender's daily quota (D170), "muted" = a sender the user stopped listening to, or one
    // Settings doesn't let reach the partner; none wakes the partner. Absent = a message to read.
    state?: "pending" | "held" | "sending" | "sent" | "failed" | "unknown" | "unconfirmed" | "followed" | "early" | "set_aside" | "muted";
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
  // D165: what Ducter noticed in the person's accounts, said once (design/connectors.md §5–§6).
  // One partner message rendered from typed finds. rung "morning": the note at the end of quiet
  // hours; "fold": a revision of `revises` while the person is in the app (shown in place, never
  // re-notified); "now": something that costs them today; "meeting": 10 min before a meeting;
  // "first": the first-account moment (§11). quiet: a silent day: no message, no notification;
  // clients change the header line until the person next writes. leftOut: the 没说的 line.
  // answered: the ask was answered (the clients show the controls settled, not live).
  finds: { noteId: string; rung: FindRung; opening: string; finds: FindView[]; leftOut?: string; quiet?: boolean; ask?: ProactiveAsk; revises?: string; answered?: string; /** A fold-in: how many finds at the end are new in this revision (the partner reads only those). */ added?: number };
  // A find changed: Go or Hold on its step, passed its date (过了), or the person's reaction
  // (有用; 这类不用告诉我 adds a Rule, ruleId). taskId: the task Go opened.
  find_state: { findId: string; kind: FindKind; state: FindState; taskId?: string; ruleId?: string };
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
    link?: string; // D222: a write's result page (the event in Google Calendar), when it gave one
  };
  // D189/D193: one snapshot of a phone call per change (core/src/phone.ts); the latest per callId
  // wins. On the channel, origin "system". Ended states wake the partner, which says the outcome once.
  phone_call: CallBody;
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
  /** D202: the reasoning effort it runs at, when the user picked one (else the model's own default). */
  effort?: string;
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
  folder?: FolderSummary; // D142: non-git folder tasks, once counted (cached like changes)
  /** D190: the task holds Ducter's own browser on this computer ("local" or a device id), so it can be watched. */
  browsing?: { device: string };
  /** D216: its latest step or words (a task_event, long fields cut), so On hand says what it is on
   *  before a client holds the task's events. A client prefers a newer event it holds. */
  latest?: LogEvent<"task_event">;
  /** D216: what the user did with its branch from Ducter: merged it (ref: the commit) or opened a draft PR (ref: its address). */
  integrated?: { act: "merge" | "open_pr"; ref?: string; at: string };
  /** D217: the task is using Ducter's phone on this computer, so it can be watched. */
  phoning?: { device: string };
}

export interface OnHand {
  tasks: TaskCard[];
  counts: Record<"needs_you" | "working" | "waiting" | "done_today", number>;
  waiters: WaiterView[]; // armed waiters (task-less ones render as compact rows)
  /** D144: task-less waits that ended unmet today: kept in the finished area with Keep waiting. */
  missed?: (Bodies["waiter"] & { endedAt: string })[];
  /** D114: every routine that isn't ended or dismissed, proposed ones included (their card). */
  routines?: RoutineView[];
  /** D193: phone calls that are live, waiting for Go, or ended today (newest first). */
  calls?: CallView[];
  /** D186: the projects the user added by hand (a folder each), shown even before a task. */
  projects?: ProjectView[];
}

/** D186: a project the user added: a folder (a repo or not) on the home's computer, or on a worker (place.device, D197), and its name. */
export interface ProjectView {
  name: string;
  place: Place; // kind "repo" or "folder"
  addedAt: string;
}

/** D185: when a task the user opens by hand starts. Absent = now. at: once, at a time (a routine
 *  of one firing); every: on a schedule (a routine, active at once); when: the task opens now and
 *  first waits for what the words say (its own wait_for, D112 (4)); until: it keeps going until
 *  that holds (D113). Times are wall clock in tz (the client's zone). */
export type NewTaskWhen =
  | { kind: "now" }
  | { kind: "at"; date: string; time: string; tz: string }
  | { kind: "every"; every: "day" | "weekday" | "week" | "hours"; days?: number[]; hours?: number; time: string; tz: string }
  | { kind: "when"; condition: string }
  | { kind: "until"; condition: string };

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
  // D144: what shows it can no longer come true (a check FAILURE). When it holds, the wait ends
  // unmet instead of looking on.
  failWhen?: Predicate;
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
      // once (D185): one firing on `date` at `time`; the routine ends after its run.
      every: "day" | "weekday" | "week" | "month" | "hours" | "once";
      date?: string; // once: "2026-11-12", a day on the zone's wall clock
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
  /** D185: made by the user on the New task card (no proposal card; active at once). Its runs
   *  take the brief as the user's own words, and the agent they picked. */
  by?: "you";
  harness?: string;
  model?: string;
  effort?: string; // D202: the effort picked on the New task card
  project?: string;
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
  // version: the Ducter version the client runs (the Mac app's); newer than the home's latest
  // release makes the home read GitHub again (its answer is stale).
  | { t: "hello"; persona?: string; cursor?: number; locale?: "zh" | "en"; tz?: string; client?: ClientKind; version?: string }
  // media (D206): ids from POST /api/media; the home turns them into refs. text may be empty then.
  | { t: "send"; text: string; clientId: string; media?: string[] }
  // cvc (D191): a pay card's security code when none is kept; held in memory for that one
  // payment's fill, never logged.
  | { t: "decide"; decisionId: string; option: "go" | "hold" | "reply"; text?: string; cvc?: string }
  // clientId (optional): a resend with the same id is not delivered twice; it gets the same "sent".
  | { t: "task_send"; taskId: string; text: string; clientId?: string; media?: string[] }
  // merge: integrate the task branch into its base branch (local, reversible by revert);
  // open_pr: push the branch and open a draft PR (an intent: external effect, see G-safety).
  // The server acks every task_action with {t:"action_result"}.
  // D142, a non-git folder task: undo puts the folder back exactly as it was before the task
  // (path: only that one entry of folder_changes); keep frees the copy (就这样 / Keep the
  // changes). An undo of a folder someone changed after the task finished is answered ok:false
  // with `confirm` (what would be lost); the same undo with force: true goes ahead.
  | { t: "task_action"; taskId: string; action: "interrupt" | "drop" | "undrop" | "reopen" | "merge" | "open_pr" | "undo" | "keep"; path?: string; force?: boolean }
  // D142: the list behind a folder task's Changes; answered with a folder_changes frame.
  | { t: "folder_changes"; taskId: string }
  // D214: one op of the opened task's workbench (its files, changes, pages), answered with a wb
  // frame carrying the same id.
  | { t: "wb"; id: string; taskId: string; req: import("./workbench.ts").WbRequest }
  | { t: "read"; upToSeq: number }
  | { t: "task_history"; taskId: string; beforeSeq?: number; limit?: number }
  // Devices and abilities (D43, D51): "devices" answers with a devices frame and keeps the
  // socket subscribed (a fresh frame whenever a device or an ability changes). "ability" adds
  // (on: true, 装上) or removes (on: false, 取下) an ability on a device; it is answered with
  // ability_result, then a fresh devices frame. "pair_code" mints a one-time pairing code for
  // 远程打开 / Reach from anywhere (D54), answered with a pair_code frame.
  // refresh: probe the harness sign-ins again now (after signing in or out from the app).
  | { t: "devices"; refresh?: boolean }
  // D228: on the home, "remote" off turns 在哪儿都能用 / From anywhere off (stops the tunnel, clears
  // the address; the tunnel stays in the person's Cloudflare account). On with named: a tunnel the
  // person made in Cloudflare's dashboard (its token and the hostname it serves). On without it is
  // the guided setup, anywhere_setup below.
  | { t: "ability"; device: string; ability: AbilityId; on: boolean; named?: { token: string; hostname: string } }
  // D228: the guided setup of 在哪儿都能用 on the home. begin: 让 Ducter 帮我设好 / Set it up for me
  // (opens the task; answered with anywhere_setup_result {taskId}). step: one step, run by the
  // home for that task's agent (`ducter anywhere step <id>`): login, create (hostname?), run.
  // cancel: stop setting up (the task stays as it is). Progress arrives in devices frames.
  | { t: "anywhere_setup"; op: "begin" | "step" | "cancel"; step?: AnywhereStepCmd; hostname?: string }
  | { t: "pair_code" }
  // rename_device: 改名字 / Rename any device (another computer, a phone, a window; D84), and since
  // D155 the home too ("local": a display name; it still answers to its host name and to "local").
  // Answered with rename_result, then a fresh devices frame.
  | { t: "rename_device"; device: string; name: string }
  // D148: disconnect_device: 断开 / Disconnect a paired device (the same revoke as `ducter devices
  // disconnect`); answered with disconnect_result, then a fresh devices frame. The home can't be.
  // device_update: update that device in place (to: a version, only to go back or pin; check:
  // read the latest release again and only report). Answered with update_result; progress
  // arrives as fresh devices frames and device_update events.
  | { t: "disconnect_device"; device: string }
  | { t: "device_update"; device: string; to?: string; check?: boolean }
  // D156: agent_update: update one AI agent on a device with its own updater, at a safe point
  // (check: read the latest versions again and only report). Answered with agent_update_result;
  // progress arrives as fresh devices frames and agent_update events.
  | { t: "agent_update"; device: string; harness: string; check?: boolean }
  // D224: update_all: 全部更新 / Update all: the home makes one plan of everything behind (its own
  // Ducter first, then the other computers, then each computer's AI agents at a safe point) and
  // runs it, kept on disk so it outlives its own restart. stop: 停止剩下的 / Stop the rest (what
  // hasn't started stays as it is); dismiss: put a finished plan away. Answered with
  // update_all_result; progress arrives as fresh devices frames (updateAll.plan).
  | { t: "update_all"; stop?: boolean; dismiss?: boolean; by?: "user" | "cli" }
  // D169: mem_plugin_install: 装上 / Install Nowledge Mem into one AI agent on a device, by a task
  // there that follows Mem's own setup guide (the user tapped it, so it is their Go). Answered with
  // mem_plugin_result; the card then reads the check again when the task finishes.
  | { t: "mem_plugin_install"; device: string; harness: string }
  // D205: Settings › 伙伴's 接上 / Connect and 断开 / Disconnect for the persona's own Bridge
  // connection, run by the home's nmem on the user's tap. Answered by fresh settings frames (bridge).
  | { t: "bridge_connect" }
  | { t: "bridge_disconnect" }
  // D225: put in (or update) the home's Nowledge Mem command line; sign it in with a one-time
  // connect link the user made in Nowledge Mem (never logged or kept).
  | { t: "bridge_mem_install" }
  | { t: "bridge_mem_sign_in"; link: string }
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
  | { t: "task_switch"; taskId: string; harness: string; model?: string; device?: string } // device (D157): continue on another computer
  // D157: 合上之前搬走 / Move before closing, from a computer's card: one decision (close_result answers;
  // none = nothing runs there, close it whenever).
  | { t: "close_computer"; device: string }
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
  // D165/D166: a tile's 自己留意 / Watch on its own and 不让 Ducter 看这个 / Don't let Ducter read
  // this one; answered with a fresh connections frame. connection_reads: 看了哪些 / What it read
  // today, answered with a connection_reads frame.
  | { t: "app_watch"; id: string; service: string; account?: string; watch?: boolean; excluded?: boolean }
  // D222: read one calendar inside a calendar account, or stop reading it.
  | { t: "cal_pick"; id: string; service: string; account?: string; calendarId: string; seen: boolean }
  | { t: "connection_reads"; id: string }
  // D226: 今天看了什么 / What it looked at today, under the switch; answered with proactive_day.
  | { t: "proactive_day" }
  // D193: the device sign-in (RFC 8628) a connection_add started: stop waiting for it; or sign in
  // again to a connection that was signed out (both answered with connection_signin frames).
  | { t: "connection_signin_cancel" }
  | { t: "connection_reauth"; id: string }
  // D193, the phone card: the owner's own voice on the provider. record: the provider's recording
  // page (answered with phone_voice_result + url; the owner agrees and records there); on / off:
  // use it on calls or not; delete: ask the provider to delete it; refresh: read whether it exists.
  | { t: "phone_voice"; action: "record" | "on" | "off" | "delete" | "refresh" }
  // D193: hang up a live call or withdraw one waiting for its hour (a fresh On hand follows).
  | { t: "call_cancel"; callId: string }
  // D208: 现在就打 / Call now on a call's Go card that waits for the callee's hours (the Go, now).
  | { t: "call_now"; callId: string }
  // D193, the phone card: Ducter's daily cap for calls (it sets the provider's own too; raising is the owner's tap).
  | { t: "phone_cap"; usd: number }
  // D218, the own-number card: set up and use the owner's own Android phone and SIM for calls.
  | ({ t: "own_phone" } & OwnPhoneAction)
  // D165: the person's answer in a note: a reaction to a find, or an ask (first_look, keep_note).
  | { t: "find_react"; findId: string; reaction: "useful" | "mute" }
  | { t: "proactive_answer"; noteId: string; ask: "first_look" | "keep_note"; yes: boolean }
  // Work over time (D112-D114), each answered with action_result (taskId = the waiter or routine
  // id). waiter_action look: look now; cancel: 不等了 / Stop waiting. routine_action pause, resume
  // (only a person resumes), end. waiter_action rearm: 接着等 / Keep waiting, on a missed wait (D144). until_action stop: stop the loop after this try.
  | { t: "waiter_action"; waiterId: string; action: "look" | "cancel" | "rearm" }
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
  // when (D185): absent or now opens it at once; at / every make a routine of the user's own
  // (task_new_result carries routineId, no taskId); when / until open it now with its wait or loop.
  // D202: model and effort only when the user picked other than the defaults (an effort the model
  // doesn't list is dropped, with a line in the task, never sent).
  | { t: "task_new"; words: string; place?: Place; harness?: string; model?: string; effort?: string; clientId?: string; when?: NewTaskWhen; media?: string[] }
  // D186: add a folder on the home's computer as a project (a repo or not). Answered with
  // project_add_result; On hand's projects and the card's places then include it. device (D197):
  // the folder is on that worker (the Mac app's own, when the home is elsewhere), read there.
  | { t: "project_add"; path: string; device?: string; clientId?: string }
  // D203: 找一个文件夹… / Find a folder…: the subfolders of `path` (absent: the home folder, ~) on
  // that computer (absent or "local": the home's own; else a worker, read there). Answered with
  // folder_browse_result. Only under that computer's home folder; folders only, never files.
  | { t: "folder_browse"; device?: string; path?: string; clientId?: string }
  // D204: 从 Git 地址加… / Add from a Git address…: that computer (absent or "local": the home;
  // else a worker) clones `address` into its Ducter folder (<folder>/projects/<repo>) with its own
  // git sign-in, then adds it as a project. Answered with project_clone_result (it can take minutes).
  | { t: "project_clone"; address: string; device?: string; clientId?: string }
  // open_task: show this task in the apps (`ducter open <task>`): pushed to every connected app
  // as an open_task frame; the sender gets open_result with how many apps were told.
  | { t: "open_task"; taskId: string }
  // D151, the live view of Ducter's browser (a sign-in). live_open: show the page the task
  // waiting on this sign-in card is on; answered with a live frame (state open or closed), then
  // live_frame frames. Each frame is acked with live_ack before the next one is sent. While a
  // view is open the task's browser tools read nothing (the agent is blind). live_input:
  // pointer and key input, x/y as fractions of the frame (0..1). live_close: done = 好了 / Done
  // (resolves the card with Go). Nothing in a live view is logged.
  // try (D154, 试一下 / Try it on the 上网 block): no card behind it; a harmless page
  // (example.com) in its own tab on the persona's profile, closed with the view. decisionId is
  // TRY_LIVE, and the answering live frames carry it.
  // D190, 看它上网 / Watch it browse: decisionId WATCH_LIVE with taskId: the tab that task is
  // working in, live, while it works (its turn: the user's input is not sent in). device (Try it):
  // the computer whose browser to open ("local" or a paired device id; absent = the home's).
  | { t: "live_open"; decisionId: string; width?: number; height?: number; scale?: number; try?: boolean; taskId?: string; device?: string }
  | { t: "live_input"; id: string; input: LiveInput }
  | { t: "live_ack"; id: string; seq: number }
  | { t: "live_close"; id: string; done?: boolean }
  // D190: 换我来 / My turn (mine: true): the user drives this tab and every task on that browser
  // waits, blind, as during a sign-in; 还给它 / Hand it back (mine: false): the task's turn again,
  // told what changed. Answered with live_turn to every view on that browser.
  | { t: "live_turn"; id: string; mine: boolean }
  // D190: the view is out of sight (the app went to the background): no frames until it's back.
  | { t: "live_pause"; id: string; paused: boolean }
  // D151, 已登录的网站 / Signed-in sites in Ducter's browser: answered with a browser_sites frame.
  | { t: "browser_sites" }
  // D217: 用手机 / Use a phone (phone-use.ts).
  | PhoneClientFrame
  | { t: "browser_site_signout"; site: string }
  | { t: "browser_sites_clear" }
  // D154, `ducter browser check`: start Ducter's browser, load a page, quit. Answered with browser_check.
  | { t: "browser_check"; url?: string }
  // D191, 自动填充 / Autofill: "saved" answers with a saved frame (names, last four, where used;
  // never a secret). saved_put adds or edits one (the one frame that carries a secret, once);
  // saved_remove deletes one (an id, or a detail key); saved_forget_site takes back a site's OK.
  | { t: "saved" }
  | { t: "saved_put"; item: SavedInput }
  | { t: "saved_remove"; id: string }
  | { t: "saved_forget_site"; id: string; site: string };

/** D151: input into the live view. x, y: fractions of the frame (0..1). */
export type LiveInput =
  | { kind: "mouse"; type: "down" | "up" | "move"; x: number; y: number; button?: "left" | "right"; clicks?: number }
  | { kind: "wheel"; x: number; y: number; dx: number; dy: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: LiveKey; shift?: boolean }
  | { kind: "nav"; action: "back" | "forward" | "reload" }
  // D190: open a web address typed in the view's address line (http or https only; the user's turn).
  | { kind: "go"; url: string }
  | { kind: "resize"; width: number; height: number; scale?: number };

export type LiveKey = "Enter" | "Tab" | "Backspace" | "Delete" | "Escape" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End" | "PageUp" | "PageDown" | "Space";

/** D151: one site the user signed in to in Ducter's browser. cookies 0 = the site signed it out. */
export interface SiteView {
  site: string;
  signedInAt: string; // ISO: when the user last signed in through a live view
  cookies: number;
}

/** desktop: the Mac app; web: the web or phone client; cli: a `ducter` command. */
export type ClientKind = "desktop" | "web" | "cli";

/** One place the New task card offers (D128). */
/** D203: one subfolder in a folder_browse_result: its name, its path there, and whether it is a git repo. */
export interface BrowseFolder {
  name: string;
  path: string;
  repo?: true;
}

export interface PlaceChoice {
  place: Place; // kind "none" is 不用特定的地方 / No particular place (always last)
  name: string; // the repo's folder name; "" for no particular place
  usedAt?: string; // the last task there, or when the repo was last touched
  defaultBranch?: string; // repo places (on a worker too, D197, when it answers in time): what a task starts from unless picked
  branches?: string[]; // local branches, most recently committed first (at most 30)
  added?: boolean; // D186: a project the user added by hand (listed even with no task yet)
  computer?: string; // D197: the computer it is on, only when the places span more than one
  remote?: string; // D202: a repo's origin URL, normalized (host/owner/repo), so its copy on another computer is found
  found?: true; // D203, D204: a project in that computer's Ducter folder (no task there yet, not added); its branches come when it is asked for as `place`
}

/**
 * D204: a computer's Ducter folder as the New task card says it: where projects cloned there go
 * (`path`, absolute, the real one: ~/ducter, or the fallback when ~/ducter is someone else's), or
 * `old`: that worker runs a Ducter too old to list, look through or clone there (update it).
 * device: "local" for the home, else the worker's id. A worker away is left out.
 */
export interface DucterFolderView {
  device: string;
  path?: string;
  old?: true;
}

/** D204: why a clone didn't happen, in a word the clients put in their own language. */
export type CloneReason = "invalid" | "not_found" | "no_access" | "network" | "timeout" | "offline" | "old" | "failed";

/**
 * D202: one model an AI agent offers on one computer, as the New task card lists it: its own
 * id and name (the live list of that account), Ducter's suggestion, the agent's own default, and
 * its reasoning effort levels (absent: it takes none, so the card shows no effort row).
 */
export interface ModelChoice {
  id: string;
  label: string;
  /** Ducter's suggestion for this agent (the tier table's ranking): 推荐 / Suggested. */
  suggested?: true;
  /** What the agent runs when no model is named, where it says so. */
  default?: true;
  efforts?: string[];
  /** The model's own default effort, where it says (默认 / Default). */
  defaultEffort?: string;
}

/** D202: the models of one AI agent on one computer (device: its id, only with two or more computers). */
export interface AgentModels {
  harness: string;
  device?: string;
  models: ModelChoice[];
  /** live: the account's own list; tiers: Ducter's table (the list couldn't be read), no effort levels. */
  from: "live" | "tiers";
}

/** Why a New task didn't open: empty words, nothing can do it, not a repo, its device is away, a time already past or a wait with nothing to wait for (D185), or anything else (message). */
export type NewTaskReason = "empty" | "no_agent" | "not_repo" | "offline" | "past" | "no_condition" | "ducter_data" | "failed";

export type ServerFrame =
  // machine: a hash of the machine the main runs on (core/src/machine.ts); a client that computes
  // the same hash is on that machine, so the place paths it sees are its own.
  | { t: "welcome"; persona: string; personaName: string; headSeq: number; machine?: string; /** The home's Ducter version: a page built for another reloads (it would draw an older card). */ version?: string }
  | { t: "events"; events: LogEvent[] }
  | { t: "on_hand"; onHand: OnHand }
  | { t: "task_history"; taskId: string; events: LogEvent[] }
  | { t: "sent"; taskId: string; delivered: Delivery } // ack for task_send
  // ref: merge commit or PR URL. confirm (D142 undo): the folder changed after the task finished;
  // these would be lost (count, the first few paths).
  | { t: "action_result"; taskId: string; action: string; ok: boolean; message?: string; ref?: string; confirm?: UndoConfirm }
  | { t: "folder_changes"; taskId: string; changes: FolderChanges | null }
  | ({ t: "wb"; id: string; taskId: string } & ({ ok: true; answer: import("./workbench.ts").WbAnswer } | { ok: false; error: import("./workbench.ts").WbError; message?: string }))
  | { t: "devices"; devices: DeviceView[]; reach: Reach; updateAll?: UpdateAllView }
  | { t: "ability_result"; device: string; ability: AbilityId; on: boolean; ok: boolean; reason?: AbilityReason; detail?: string }
  | { t: "anywhere_setup_result"; ok: boolean; taskId?: string; step?: AnywhereStepResult; reason?: AnywhereReason | "own_address" | "no_agent" | "running" | "not_home"; detail?: string }
  | { t: "pair_code"; code: string; expiresAt: string; address?: string; link?: string; qr?: string[] }
  | { t: "rename_result"; device: string; ok: boolean; name?: string; reason?: "unknown_device" | "empty" | "name_taken" | "home" }
  | { t: "disconnect_result"; device: string; ok: boolean; reason?: "unknown_device" | "home" }
  | { t: "update_result"; device: string; ok: boolean; reason?: UpdateReason; detail?: string; update?: DeviceUpdate }
  | { t: "agent_update_result"; device: string; harness: string; ok: boolean; reason?: AgentReason; detail?: string }
  | { t: "update_all_result"; ok: boolean; reason?: "nothing" | "running" | "failed"; detail?: string; id?: string }
  | { t: "mem_plugin_result"; device: string; harness: string; ok: boolean; taskId?: string; reason?: MemPluginReason }
  | { t: "settings"; settings: Settings; mem: MemView; brainNow?: BrainNow; forgot?: { seq: number; how: "mem" | "hidden" }; bridge?: BridgeView }
  | { t: "rules"; rules: RuleView[] }
  | { t: "candidates"; taskId: string; candidates: Candidate[] }
  | { t: "connections"; connections: ConnectionView[]; oo: OoDetect; ownPhone?: OwnPhoneView }
  // D218: an own-number step the home refused (number: not a full number; key: not a key; busy: a call is on).
  | { t: "own_phone_result"; ok: false; action: string; reason?: string }
  | { t: "connection_reads"; id: string; reads: ReadLine[] }
  | { t: "proactive_day"; day: ProactiveDay }
  // readable (D158): what the added connection can read now; [] = connected, but no account there yet.
  | { t: "connection_result"; ok: boolean; id?: string; reason?: ConnectionReason; readable?: OoApp[] }
  // D193: the device sign-in: the code and link to show, then done / denied / expired / failed.
  | { t: "connection_signin"; signIn: SignInView }
  | { t: "phone_voice_result"; action: "record" | "on" | "off" | "delete" | "refresh"; ok: boolean; url?: string; reason?: "no_phone" | "no_voice" | "provider" | "unreachable"; message?: string }
  // What the partner is doing while the user waits for its reply (D104): sent on every change and
  // after each welcome, null when the turn ends. Never logged: it is presence, not history.
  | { t: "activity"; activity: PartnerActivity | null }
  // D128: New task. card: the task as On hand will show it; message: a reason in words (English).
  | { t: "task_new_options"; places: PlaceChoice[]; candidates: Candidate[]; models?: AgentModels[]; ducterFolders?: DucterFolderView[] }
  | { t: "close_result"; device: string; ok: boolean; none?: boolean; decisionId?: string; message?: string }
  | { t: "task_new_result"; ok: boolean; clientId?: string; taskId?: string; card?: TaskCard; routineId?: string; routine?: RoutineView; reason?: NewTaskReason; message?: string }
  | { t: "project_add_result"; ok: boolean; clientId?: string; place?: PlaceChoice; reason?: "not_found" | "offline" | "old" | "failed"; message?: string }
  // D204: the clone asked for: the project it made (or the one already there with that origin:
  // existed), as the card's place; or why not.
  | { t: "project_clone_result"; ok: boolean; clientId?: string; device?: string; place?: PlaceChoice; existed?: true; reason?: CloneReason; message?: string }
  // D203: path is the folder listed (real, absolute), home that computer's home folder, parent the
  // folder above (absent at home); folders repos first (at most 200; more: there were more).
  | { t: "folder_browse_result"; ok: boolean; clientId?: string; device?: string; path?: string; home?: string; parent?: string; folders?: BrowseFolder[]; more?: true; reason?: "outside" | "not_found" | "offline" | "old" | "failed"; message?: string }
  // Show this task (the app opens it, Esc returns). open_result answers the sender: apps = how many apps were told.
  | { t: "open_task"; taskId: string }
  | { t: "open_result"; taskId: string; ok: boolean; apps: number; message?: string }
  // D149: the empty conversation's words, after each app's hello (never to a CLI).
  | { t: "first_screen"; first: FirstScreen }
  // D151: a live view opened (with the page's size in CSS pixels) or closed (reason: done, closed,
  // replaced = another window opened one, gone = the browser went away, failed with message).
  // browser (D154): which browser it is, for the view's top line.
  // D190: turn: whose turn it is ("agent": the task drives and the user watches; "you": the user
  // drives); here: this window holds the user's turn; taskId and task: the task whose tab it is.
  | { t: "live"; id: string; decisionId: string; state: "open" | "closed"; site?: string; url?: string; title?: string; width?: number; height?: number; reason?: "done" | "closed" | "replaced" | "gone" | "failed"; message?: string; browser?: BrowserAbout; turn?: LiveTurn; here?: boolean; taskId?: string; task?: LiveTask }
  // One JPEG frame (base64). The next comes only after live_ack for this seq. url: keys hidden (D152).
  | { t: "live_frame"; id: string; seq: number; data: string; width: number; height: number; url?: string; title?: string }
  // D190: whose turn it is now. here: this window holds it (false: the user drives from another of their devices).
  | { t: "live_turn"; id: string; turn: LiveTurn; here: boolean }
  // D190: what the task is doing in its tab right now (null: nothing just now). Presence, never logged.
  | { t: "live_doing"; id: string; doing: LiveDoing | null }
  // ready: Ducter's browser is installed here; sites: the ones signed in through a live view.
  | { t: "browser_sites"; ready: boolean; sites: SiteView[]; ok?: boolean; message?: string }
  | ({ t: "browser_check" } & BrowserCheck)
  | SavedFrame
  | PhoneServerFrame
  | { t: "error"; message: string };

/** D154: the decisionId of a 试一下 / Try it live view (no card behind it). */
export const TRY_LIVE = "try";
/** D190: the decisionId of a 看它上网 / Watch it browse view (a task's tab; no card behind it). */
export const WATCH_LIVE = "watch";

/** D190: whose turn it is in a live view: the task's (it drives, you watch) or yours. */
export type LiveTurn = "agent" | "you";

/** D190: the task whose tab a live view shows: its title and who does it (the coin). */
export interface LiveTask {
  title: string;
  harness: string;
}

/**
 * D190: one thing a task just did in its tab, for the watcher's calm line. x, y: where it
 * clicked, as fractions of the page (0..1). label: the link or button's own words (short, keys
 * hidden). waiting: it tried while it was the user's turn, and waits for it back.
 */
export interface LiveDoing {
  kind: "open" | "read" | "click" | "type" | "press" | "scroll" | "back" | "tab" | "shot" | "waiting";
  host?: string;
  label?: string;
  key?: string;
  x?: number;
  y?: number;
}

/**
 * D154: which browser Ducter's own browser tools drive, said the same way everywhere
 * (browser_open's first line, the check, the live view's top line). name: "Chrome for Testing"
 * (the one Ducter installed), "Chrome" (DUCTER_CHROME), "system Chrome" (one on PATH).
 */
export interface BrowserAbout {
  device: string; // the machine it runs on ("hel")
  name: string;
  version?: string; // 157.0.8103.38
  profile: string; // the persona's profile
}

/** D154: one start of Ducter's browser that loads a page and quits. */
export interface BrowserCheck {
  ok: boolean;
  /** Why not: not installed, being installed, missing libraries (message: the command), or failed. */
  reason?: "missing" | "installing" | "deps" | "failed";
  message?: string;
  browser?: BrowserAbout;
  url: string;
  title?: string;
  ms: number; // asked to page loaded
}

/** The same words in both languages: the client shows its own. */
export interface Words {
  zh: string;
  en: string;
}

/** What a starter is about. everyday: an example for anyone; the rest come from what the home knows. */
export type StarterKind = "mail" | "calendar" | "app" | "memory" | "task" | "folder" | "code" | "everyday";

/**
 * The empty conversation (D149), worked out on the home from names and metadata it already
 * holds (core/src/first-screen.ts): no contents read, no model run. The client greets by its own
 * clock (time of day, visit) in the partner's name and shows these words as they are.
 */
export interface FirstScreen {
  /** first: the person never used Ducter; returning: they have (tasks, notes, messages). */
  visit: "first" | "returning";
  /** What the partner can do for this person, one line. */
  line: Words;
  /** Returning only: one timely line when something real happened; opens the task, else On hand. */
  news?: { kind: "needs_you" | "missed" | "done"; words: Words; taskId?: string };
  /** 3–4 things to say, life first, rotated by day. A tap fills the composer; it never sends. */
  starters: { id: string; kind: StarterKind; words: Words }[];
  /** D222: what is still on today, from the last look at their calendars (never a new read). */
  today?: CalToday;
}

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
/**
 * web 上网 · computer 用电脑 · remote 远程打开 · phone 用手机 · call 打电话. D199: call is the home's
 * only (calls don't run on a computer): on while a calling connection is connected, off before; it
 * is added and opened in Settings › Accounts (the phone card), never by an `ability` request.
 */
export type AbilityId = "web" | "computer" | "remote" | "phone" | "call";
/** later = not in this version (shown locked, "以后会有"); unavailable = can't be added here, see reason. */
export type AbilityState = "on" | "off" | "unavailable" | "later";
/**
 * Why an ability is unavailable (or why adding it failed). Clients word it; detail carries a
 * version or a path. cua_missing / cua_old: cua-driver isn't there or lacks the browser tools;
 * env_off: DUCTER_BROWSER=0 pins it off; home_only: only on the device Ducter lives on;
 * no_address: nothing outside can reach this Ducter yet (remote). D151, Ducter's own browser on a
 * server: browser_deps = system libraries are missing and Ducter can't install them (not root):
 * detail is the one command to run; browser_sandbox = the system stops Chrome's sandbox for a
 * normal user (Ubuntu 23.10+ AppArmor) and detail is the one command that allows it for Ducter's
 * Chrome only (D172); browser_failed = the install or the first start failed (detail).
 * D157: worker_old = the Ducter on that computer is from before workers browsed (update it there);
 * offline = that computer can't be reached right now to change it.
 * D199: signed_out = 打电话 is on (a calling connection is there) but its sign-in is gone: the
 * phone card in Accounts signs in again.
 * D228: own_address = 在哪儿都能用 is the person's own address (D143's domain), not a switch here.
 * D217: phone_unsupported = Ducter's phone can't run on this computer yet (phase 1: Apple
 * Silicon Macs; detail says why); phone_failed = installing or starting it failed (detail).
 */
export type AbilityReason = "own_address" | "cua_missing" | "cua_old" | "env_off" | "home_only" | "no_address" | "unknown_device" | "failed" | "browser_deps" | "browser_sandbox" | "browser_failed" | "worker_old" | "offline" | "signed_out" | "phone_unsupported" | "phone_failed";

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
  /** D156: the installed version, as the agent's own --version says it. */
  version?: string;
  /** D156: how this copy was installed, which decides how it updates (research/42). */
  how?: AgentHow;
  /** D156: the newest version on this copy's own channel (npm, Homebrew, its installer). */
  latest?: string;
  /** D156: latest is newer than version and Ducter can update this copy from here. */
  available?: boolean;
  /** D156: where the installed version stands against the versions Ducter verified (harness-facts). */
  standing?: VersionStanding;
  /** D156: latest is inside the verified range (only then does the night-time update take it). */
  latestVerified?: boolean;
  /** D156: an update of this agent under way or just finished; absent when idle. */
  update?: AgentUpdate;
  /** D169: Nowledge Mem's plugin for this agent, when the user uses it outside Ducter; absent
   *  when memory is off, nmem isn't on that device, or its check can't tell. */
  mem?: MemPluginView;
}

// ---------- Nowledge Mem in the user's own agents (D169, design/memory.md "Mem and tasks") ----------

/**
 * installed: Mem's check finds its plugin installed and enabled (never "working": the check is
 * local and doesn't prove the agent loads it); absent: not installed; update: the check says a
 * newer one should go in; review: the check can't settle it (several copies, can't read it).
 */
export type MemPluginState = "installed" | "absent" | "update" | "review";
/** Why a review: several copies or registrations; anything else the check couldn't settle. */
export type MemPluginWhy = "multiple" | "unclear";

export interface MemPluginView {
  state: MemPluginState;
  version?: string; // installed: the version the check read
  why?: MemPluginWhy; // review
  /** A setup task for it is open right now (its id). */
  taskId?: string;
  checkedAt?: string; // ISO
}

/** Why 装上 didn't start: memory is off, no such device or agent, it's away, no signed-in agent there, or anything else. */
export type MemPluginReason = "off" | "unknown" | "offline" | "no_agent" | "running" | "failed";

/** D169: the partner's one offer to put Mem into an agent on a computer (once per computer and agent). */
export interface MemPluginAsk {
  device: string; // device id ("local" for the home)
  deviceName: string;
  harness: string;
}

/** D168: one thing a task thinks is worth remembering about the user (it proposes; the partner writes). */
export interface RememberNote {
  title: string; // ≤ 80 chars
  content: string; // ≤ 400 chars, self-contained
}

// ---------- The AI agents' own versions (D156, design/system.md "Updating the AI agents") ----------

/**
 * npm: a global npm package; brew: a Homebrew cask; installer: the agent's own installer and
 * updater (Claude Code's native install, Codex's standalone, pi's managed install); app: a copy
 * inside a desktop app (updates with the app, never touched); ducter: ships inside Ducter (pi
 * from a checkout; updates with Ducter); unknown: can't tell, so never updated.
 */
export type AgentHow = "npm" | "brew" | "installer" | "app" | "ducter" | "unknown";
export type VersionStanding = "verified" | "newer" | "older" | "unknown";
/** 等它手上的事停好 · 在更新 · 在检查 · 好了 · 没更新成 */
export type AgentPhase = "waiting" | "updating" | "checking" | "done" | "failed";
/**
 * Why an agent update didn't happen or didn't hold. how: this copy updates elsewhere (app,
 * ducter, unknown); offline: the device isn't connected; running: already updating; busy: work
 * on it didn't settle; network: its channel couldn't be reached; no_update: nothing newer;
 * unverified: the night-time update won't take a version Ducter hasn't verified; version: the
 * new copy didn't answer its --version; signed_out: it updated but its login no longer answers;
 * unchanged: the updater ran and the version didn't move; interrupted: Ducter on that computer
 * restarted (or the home did) while the updater ran, and the copy is still on its old version
 * (D227); failed: anything else (detail).
 */
export type AgentReason = "how" | "offline" | "running" | "busy" | "network" | "no_update" | "unverified" | "version" | "signed_out" | "unchanged" | "interrupted" | "failed";

export interface AgentUpdate {
  phase: AgentPhase;
  from: string;
  to?: string;
  reason?: AgentReason;
  detail?: string;
  /** failed after the install: the previous version runs again. */
  rolledBack?: boolean;
  at: string; // ISO, when phase was entered
  by?: "user" | "night";
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
  /** web only (D151): Ducter is installing its own browser on this device right now. phone (D217) too. */
  setup?: "installing";
  /** phone (D217): how far the install is. */
  step?: PhoneInstallStep;
  /** phone (D217): Ducter's phone is running right now (it stops by itself when nobody needs it). */
  running?: boolean;
}

export interface DeviceView {
  id: string; // "local" for the machine Ducter lives on; else the paired device id
  name: string;
  kind: DeviceKind;
  home: boolean; // Ducter lives here
  state: DeviceState;
  lastSeen?: string; // ISO; for a device that isn't awake
  version?: string; // the Ducter version it runs (the home's own; a worker's from its hello)
  harnesses: DeviceHarness[];
  abilities: DeviceAbility[];
  /** D148: where its Ducter stands against the latest release, and an update under way. */
  update?: DeviceUpdate;
  /** linux-x64, darwin-arm64…: what it is, for its card's plain words. */
  platform?: string;
  /** D155: the computer it runs on (its host name), when it said: a CLI on it folds into its card. */
  computer?: string;
  /** D157: it doesn't sleep (a server, a desktop Mac), so long work keeps going there. */
  alwaysOn?: boolean;
}

// ---------- Updating in place (D148, design/system.md "Updating in place") ----------

/**
 * self: a Linux `ducter` that updates itself (the server bundle). app: a Mac whose ducter lives
 * in Ducter.app; the app's own updater does it (D72). source: run from a checkout (git pull).
 */
export type UpdateHow = "self" | "app" | "source" | "manual"; // manual: a Ducter too old to update from here (before 0.0.4): run the installer there once
/** 在下载 · 在核对 · 等手头的事停好 · 在重启 · 回来了 · 没更新成 */
export type UpdatePhase = "downloading" | "verifying" | "waiting" | "restarting" | "done" | "failed";
/**
 * Why an update didn't happen. network: GitHub couldn't be reached; no_release: nothing newer is
 * published; no_asset: the release has no file for this machine; checksum: the download doesn't
 * match SHA256SUMS.txt; disk: too little free space; selfcheck: the new ducter didn't start;
 * busy: a merge or an undo kept running; health: the new one didn't come up (rolled back);
 * downgrade: older than this one without an explicit version; not_writable: its folder can't be
 * written; app / source: updated another way (how); offline: the device isn't connected;
 * running: an update is already under way; failed: anything else (detail). D187, a Mac that
 * updates with its app, asked from elsewhere: app_closed = Ducter isn't open on that Mac (nothing
 * was started); app_password = Ducter.app there was installed by an administrator, so its password
 * is needed once, at that Mac.
 */
export type UpdateReason = "network" | "no_release" | "no_asset" | "checksum" | "disk" | "selfcheck" | "busy" | "health" | "downgrade" | "not_writable" | "app" | "source" | "manual" | "offline" | "running" | "failed" | "app_closed" | "app_password";

export interface DeviceUpdate {
  current: string;
  latest?: string;
  available: boolean; // latest is newer than current
  /**
   * What's new, per language (D172): a client shows its own language's lines and nothing when
   * there are none, never the other language. Each line is whole and short (≤ 40 zh / 80 en).
   */
  notesBy?: { zh?: string[]; en?: string[] };
  security?: boolean; // the notes name a security fix
  how: UpdateHow;
  /**
   * D187: how "app", and this Mac's Ducter can ask its app to update (any client's 更新 does it:
   * the app downloads and checks it, then restarts at the safe point). Absent: open the app there.
   */
  fromHere?: boolean;
  /** An update under way or just finished; absent when idle. */
  phase?: UpdatePhase;
  progress?: number; // downloading, 0..1
  from?: string;
  to?: string;
  reason?: UpdateReason; // failed
  detail?: string;
  rolledBack?: boolean; // failed after the swap: the previous version runs again
  at?: string; // ISO, when phase was entered
  checkedAt?: string; // ISO, when the latest release was last read
}

// ---------- Update all (D224, design/system.md "Update all") ----------

/** What one step of Update all updates: a computer's Ducter, or one AI agent on a computer. */
export type UpdateAllKind = "ducter" | "agent";
/**
 * queued: not started (it waits for what comes before it); waiting: at its safe point, until the
 * tasks using it there pause (busy says how many), never cutting them off; running: updating
 * (phase says the step); done; failed (reason, rolledBack); skipped (reason: home = the home
 * didn't update, so this computer stays with it; offline; stopped = 停止剩下的).
 */
export type UpdateAllState = "queued" | "waiting" | "running" | "done" | "failed" | "skipped";
export type UpdateAllBy = "user" | "cli" | "night";

export interface UpdateAllItem {
  key: string; // "ducter:<device>" | "agent:<device>:<harness>"
  kind: UpdateAllKind;
  device: string; // "local" for the home, else the paired device id
  deviceName: string;
  harness?: string; // agent
  from: string;
  to: string;
  state: UpdateAllState;
  phase?: UpdatePhase | AgentPhase; // running: the device's own step
  progress?: number; // downloading, 0..1
  busy?: number; // waiting: tasks on that computer using this agent right now
  /**
   * D227: what a step waits on besides tasks. ducter (waiting): that computer's Ducter is updating
   * (in this plan or not), so its agents wait; reconnect (running): the computer went away mid-step.
   */
  wait?: "ducter" | "reconnect";
  /** D227: the step was cut off once (its computer's Ducter restarted) and was started again. */
  retried?: boolean;
  reason?: string; // an UpdateReason or AgentReason, or home / offline / stopped / no_answer / interrupted
  detail?: string;
  rolledBack?: boolean;
  at: string; // ISO, when state was entered
}

/** Behind, but not in Update all now, and why: away, or it updates another way. */
export interface UpdateAllNotNow {
  device: string;
  deviceName: string;
  /** offline: can't be reached now; app_old: a Mac whose Ducter can't take 更新 from here yet (open it there); source / manual: updated another way. */
  why: "offline" | "app_old" | "source" | "manual";
  items: number; // how many updates wait there
}

export interface UpdateAllPlan {
  id: string;
  by: UpdateAllBy;
  startedAt: string;
  finishedAt?: string;
  stopped?: boolean;
  items: UpdateAllItem[];
}

/**
 * In the devices frame. offer: what 全部更新 would do now, in its order (absent while a plan
 * runs); notNow: what's behind but can't be part of it; plan: the one running, or the last one
 * while it is still worth showing (30 min, a day with a failure).
 */
export interface UpdateAllView {
  offer: UpdateAllItem[];
  notNow: UpdateAllNotNow[];
  plan?: UpdateAllPlan;
}

/**
 * D228: 在哪儿都能用 / From anywhere on the home: an address from outside. how: own = an address
 * set up some other way (D143's `ducter domain` on a server with a public IP, DUCTER_PUBLIC_URL);
 * cloudflare = the person's own Cloudflare tunnel to their own domain, which Ducter runs (made by
 * the guided setup, or in Cloudflare's dashboard and given as a token). state: off = turned off,
 * the tunnel kept (on again needs no setup); setup = being set up (setup says how far); starting =
 * the tunnel is starting or being checked; on; failed (reason).
 */
export interface Anywhere {
  how: "own" | "cloudflare";
  state: "off" | "setup" | "starting" | "on" | "failed";
  hostname?: string;
  reason?: AnywhereReason;
  detail?: string;
  since?: string; // ISO: on since
  setup?: AnywhereSetup;
}
/**
 * download: Cloudflare's program couldn't be downloaded (or its checksum didn't match);
 * unsupported: no build for this system; login: the sign-in didn't finish (expired or refused);
 * taken: that hostname already has a record in the person's zone; cloudflare: Cloudflare refused
 * or couldn't be reached; unreachable: the tunnel is connected but the address doesn't lead here
 * yet; failed: anything else (detail).
 */
export type AnywhereReason = "download" | "unsupported" | "login" | "taken" | "cloudflare" | "unreachable" | "failed";
/** The guided setup's steps, in order; each ticks by itself as the home runs it (D228). */
export type AnywhereStepId = "get" | "login" | "name" | "create" | "dns" | "run" | "check" | "use";
export type AnywhereStepCmd = "login" | "create" | "run";
export interface AnywhereSetup {
  taskId?: string;
  steps: { id: AnywhereStepId; state: "todo" | "doing" | "waiting" | "done" | "failed"; reason?: AnywhereReason; detail?: string }[];
  /** While signing in: the link to open (opened: cloudflared opened it in this computer's browser). */
  login?: { url: string; opened: boolean; qr?: string[] };
  /** The address chosen (or suggested: ducter.<zone>), and the zone signed in to. */
  hostname?: string;
  zone?: string;
}
/** What one step answers its agent (`ducter anywhere step <id> --json`). */
export interface AnywhereStepResult {
  step: AnywhereStepCmd;
  state: "done" | "waiting" | "failed";
  /** waiting: for the person to sign in (login), for their Go on the card (go), or still at work (working: ask again). */
  waiting?: "login" | "go" | "working";
  url?: string;
  hostname?: string;
  zone?: string;
  reason?: AnywhereReason;
  detail?: string;
  /** What to do next, in a sentence for the agent. */
  next?: string;
}

/** Who can reach this Ducter from elsewhere (paired clients), and the address they use. */
export interface Reach {
  address?: string; // the address from outside, when there is one (own, or the tunnel's once on)
  anywhere?: Anywhere; // D228: absent = off
  /** form "cli": the command line on a computer, shown inside that computer's card (D155); computer: the host it runs on. */
  clients: { id: string; name: string; platform: string; connected: boolean; lastSeen?: string; form?: "cli" | "app"; computer?: string }[];
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
  /** What it can read: as oo last listed it (source oo), or the accounts connected in an OpenConnector (D158). */
  apps?: OoApp[];
  /** D166: its watching today (the status line and the tiles). */
  look?: SourceLook;
  /** D193: signed in through the provider's own page (OAuth device sign-in), not a pasted key. */
  signIn?: boolean;
  /** D193: a calling connection (Tuwa): the phone card instead of the mailbox card. */
  phone?: PhoneView;
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

/** no_key (D158): OOMOL Hosted needs a key, and none was given (nothing was sent). */
/** D193: signing_in = the server signs in on its own page: connection_signin frames follow. */
/** blocked (D193): the server's firewall refused Ducter itself (Cloudflare 1010), not the key. */
export type ConnectionReason = "bad_url" | "unreachable" | "unauthorized" | "not_mcp" | "duplicate" | "unknown_connection" | "no_oo" | "oo_signed_out" | "no_key" | "signing_in" | "sign_in_failed" | "blocked";

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
  /** D135: the context windows the partner and tasks run on (settings.json + env; no UI yet). */
  windows?: ContextWindows;
  /** D148: update Ducter and its computers at night, in quiet hours, when nothing is working. Off by default. */
  autoUpdate?: boolean;
  /**
   * D165: 自己发现了事，怎么告诉你 / When it notices something. Absent: never answered, which
   * watches nothing (connecting is not consent to watch); clients show none chosen yet.
   */
  proactive?: ProactiveMode;
  /** D170: who of the user's other agents may reach the partner (through Nowledge Bridge). */
  peers?: PeersSettings;
}

/**
 * D170 (design/bridge.md): Settings › 伙伴's "who can reach {name}". reach: the user's own agents
 * only (the default), teammates' agents too, or nobody. trusted: own agents whose work starts
 * without asking (X2, a learned rule). muted: agents the user stopped listening to (不再听它的).
 */
export interface PeersSettings {
  reach: "own" | "team" | "off";
  trusted: string[];
  muted: string[];
}

/**
 * D135, in tokens. partner: its window, where Ducter re-cuts it, and the cap on the harness's own
 * compactor (kept above the re-cut). tasks: their window and where the harness compacts them.
 */
export interface ContextWindows {
  partner: { window: number; recutAt: number; compactAt: number };
  tasks: { window: number; compactAt: number };
}

export interface Brain {
  harness: HarnessId;
  model?: string;
}

/**
 * What the partner thinks with right now (D150): settings.brain, unless the user never chose one and
 * Claude Code isn't signed in on the home, when core runs it on the first signed-in AI agent of
 * PARTNER_FALLBACK instead (why: "only_codex" for Codex, "only_signed_in" for the others, D177).
 */
export interface BrainNow extends Brain {
  /** auto: the user never chose; core picked it. why: the reason when it isn't the setting. */
  auto: boolean;
  why?: "only_codex" | "only_signed_in";
  /** The models it may think with on the home (its listed ones, else Ducter's tier table); none: its own default. */
  models: { id: string; label: string; kind: "smart" | "fast" }[];
}

export type SettingsPatch = Partial<Settings>;

/** What the partner remembers, as far as this Ducter can tell. */
export interface MemView {
  /** connected: Nowledge Mem answers; missing: not installed or not connected; off: switched off. */
  state: "connected" | "missing" | "off";
  /** Recent 记下了 / Noted lines from the conversation, newest first, without forgotten ones. */
  noted: { seq: number; title: string; at: string; memoryId?: string }[];
  /** The name its memories are kept under in Mem (D141): the persona's AI Identity, once bound. */
  keptUnder?: string;
}

/**
 * D205: what Mem said when it refused to connect the persona (its registered refusal codes, each
 * with a step the user takes in Mem). Ducter never tries another identity, place or key instead.
 * authority_missing: this sign-in has no current authority for the identity; custody_birth_missing:
 * the identity lacks its original registration; lifetime_inactive: the identity is retired;
 * attachment_mismatch: where it receives no longer matches it; control_denied: this sign-in doesn't
 * hold it; revoked: this connection was disconnected before; conflict: already bound to another.
 * D225: unavailable: Mem's side can't take it now
 * (`_unavailable`, `_busy`, `_capacity`), nothing to do on the user's side; unknown: no answer came
 * back, so whether it took is unknown (Try again is the same connect, never a second one).
 */
export type BridgeRefusal = "authority_missing" | "custody_birth_missing" | "lifetime_inactive" | "attachment_mismatch" | "control_denied" | "revoked" | "conflict" | "unavailable" | "unknown";

/**
 * D205: Settings › 伙伴's row for the persona's own Bridge connection (the frame carries it only
 * when the persona has its Mem identity). update_mem: this nmem has no `bridge connections` (one
 * line: update Mem on `home`); ready: what 接上 will do (identity, the "Only me" place by its exact
 * id); no_space: Mem listed no single personal place, so nothing is offered; refused: Mem refused
 * (reason); failed: it didn't answer as expected (detail); unconfirmed: connected, but the passive
 * check after it didn't say it acts as the identity, so Bridge stays off (try again, or disconnect);
 * pinned: DUCTER_BRIDGE=1 on the home (no disconnect here).
 *
 * D225, the home's own Mem command line first: install_mem: the home has no `nmem` (canRun: one tap
 * puts it in with Mem's official route; else need names what to install first, "pipx");
 * update_mem: canRun: one tap updates it from the source it came from (else need: "app", update the
 * Nowledge Mem app; "other", update it the way it was installed); installing / updating while it
 * runs; sign_in: `nmem` is here but not signed in to Nowledge Mem (paste a connect link; signIn says
 * why the last one didn't work); signing_in; local_mem: Mem here answers from this computer, not a
 * Nowledge Mem cloud workspace, which other AI agents need. detail, after a step that didn't work:
 * what the installer or Mem said, clipped, never a secret.
 */
export interface BridgeView {
  state: "install_mem" | "installing" | "update_mem" | "updating" | "sign_in" | "signing_in" | "local_mem" | "ready" | "no_space" | "connecting" | "connected" | "disconnecting" | "refused" | "failed" | "unconfirmed";
  canRun?: boolean;
  need?: "pipx" | "app" | "other";
  signIn?: "used" | "bad" | "failed";
  /** The home's nmem version, when it answered. */
  version?: string;
  /** The persona's identity in Mem, as connect names it (--agent-id). */
  identity: string;
  /** The user's own place in Mem, "Only me": its label and exact id. */
  space?: { id: string; label: string };
  /** install_mem, update_mem, sign_in, local_mem: the computer it is about (the home). */
  home?: string;
  reason?: BridgeRefusal;
  /** failed, or a disconnect that didn't go through: what Mem said, clipped. */
  detail?: string;
  pinned?: boolean;
}

/** The choices offered for defaultAfterMin, in minutes. */
/** D144: a task-less wait that ended without its condition (it can't come true, or ran out of time). */
export const endedUnmet = (w: Pick<Bodies["waiter"], "state" | "unmet" | "taskId" | "routineId">): boolean =>
  !w.taskId && !w.routineId && (w.state === "expired" || (w.state === "cancelled" && Boolean(w.unmet)));

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
