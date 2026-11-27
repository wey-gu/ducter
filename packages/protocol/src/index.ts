// Ducter protocol: the single contract shared by core, runner, partner, and clients.
// Changes here go through the lead. The Go client mirrors these types in
// apps/desktop/internal/protocol (keep field names identical; JSON is the wire format).

export * from "./harnesses.ts";
export * from "./fuzzy.ts";
export * from "./mentions.ts";
import type { FirstMeet } from "./first-meet.ts";
export * from "./api-keys.ts";
export * from "./key-routes.ts";
export * from "./lang.ts";
import type { LangTag } from "./lang.ts";
import type { HarnessId } from "./harnesses.ts";
import type { KeyResult } from "./api-keys.ts";
export * from "./loadout.ts";
export * from "./proactive.ts";
export * from "./saved.ts";
export * from "./device-signin.ts";
export * from "./key-copy.ts";
import type { CopyKeyAsk } from "./key-copy.ts";
import type { FillAsk, KeyAsk, PayAsk, SavedFrame, SavedInput } from "./saved.ts";
export * from "./phone.ts";
export * from "./media.ts";
export * from "./mailbox.ts";
import type { MailboxLook } from "./mailbox.ts";
export * from "./phone-use.ts";
export * from "./calendar.ts";
export * from "./later.ts";
export * from "./open-asks.ts";
export * from "./task-groups.ts";
export * from "./partners.ts";
export * from "./helpers.ts";
export * from "./handoff.ts";
export * from "./keeps.ts";
export * from "./computer-use.ts";
import type { ComputerAsk, ComputerClientFrame, ComputerPerms, ComputerServerFrame } from "./computer-use.ts";
export * from "./reply.ts";
export * from "./context-meter.ts";
export * from "./handset.ts";
export * from "./channels.ts";
export * from "./share.ts";
export * from "./past.ts";
export * from "./did.ts";
export * from "./peer-self.ts";
export * from "./did-glyphs.ts";
export * from "./computer-name.ts";
export * from "./done-today.ts";
export * from "./turn-end.ts";
export * from "./tidy.ts";
export * from "./rich.ts";
export * from "./pins.ts";
export * from "./made.ts";
export * from "./apps.ts";
export * from "./mend.ts";
export * from "./app-lift.ts";
export * from "./app-glyphs.ts";
export * from "./reach.ts";
export * from "./fresh-look.ts";
export * from "./doc-bar.ts";
export * from "./free-budget.ts";
export * from "./background.ts";
export * from "./first-meet.ts";
export * from "./mem-source.ts";
export * from "./mem-health.ts";
export * from "./task-sources.ts";
export * from "./handover.ts";
export * from "./hand-group.ts";
export * from "./standing.ts";
export * from "./asks.ts";
export * from "./usage.ts";
export * from "./day-after.ts";
import type { DeviceVia, HomeKey, ReachWay } from "./reach.ts";
import type { PastClientFrame, PastMark, PastServerFrame } from "./past.ts";
import type { DidClientFrame, DidServerFrame } from "./did.ts";
import type { RichUi } from "./rich.ts";
import type { PinView } from "./pins.ts";
import type { AlwaysAsk, StandingAction, StandingView } from "./standing.ts";
import type { MadeClientFrame, MadeServerFrame } from "./made.ts";
import type { AppAnswer, AppCard, AppRef, AppsClientFrame, AppsServerFrame } from "./apps.ts";
import type { ChannelClientFrame, ChannelKind, ChannelServerFrame } from "./channels.ts";
import type { SourceAsk, SourceItemRef, SourceOp, SourcesClientFrame, SourcesServerFrame } from "./task-sources.ts";
import type { HandsetAsk, HandsetClientFrame, HandsetServerFrame, HandsetView } from "./handset.ts";
import type { PhoneAsk, PhoneClientFrame, PhoneInstallStep, PhoneServerFrame } from "./phone-use.ts";
import type { MediaRef } from "./media.ts";
import type { OnHandAwayFrame, TaskGroupFrame, TaskGroupView } from "./task-groups.ts";
import type { RecallBy } from "./mem-source.ts";
import type { CalChange, CalGlance, CalToday } from "./calendar.ts";
import type { CallBody, CallPlan, CallView, OwnPhoneAction, OwnPhoneView, PhoneView, SignInView } from "./phone.ts";
import type { FindKind, FindRung, FindState, FindView, ProactiveAsk, ProactiveDay, ProactiveMode, ProactiveSource, ProactiveYesNo, ReadLine, SourceLook } from "./proactive.ts";
import type { DayAfter } from "./day-after.ts";
import type { BodyWhy, Candidate, KindDefault, RuleView, TaskBody, TaskNeeds, WorkKind } from "./loadout.ts";

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
  | {
      kind: "repo";
      device: string;
      repoPath: string;
      worktree?: string;
      branch?: string;
      baseBranch?: string;
      hasRemote?: boolean;
      /** D395: no computer had the repository: cloned from this address (owner/name or a Git URL) into that computer's Ducter folder before the task starts. */
      clone?: string;
    }
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
  /** D436: the errand stopped at the checkout (set by Ducter's browser_at_checkout, never by report_to_main). */
  checkout?: CheckoutAsk;
  /** D191: the first use of a saved sign-in or private detail on a site (set by browser_fill). */
  fill?: FillAsk;
  /** D217: a tap on Ducter's phone that commits (go), or the user's own turn on it (user); set by the phone tools only. */
  phone?: PhoneAsk;
  /** D233: a task asks the person for a key (set by Ducter's ask_for_key, never by report_to_main). */
  key?: KeyAsk;
  /** D539: copy a key the person has on another computer to this task's (set by ask_for_key only). */
  copyKey?: CopyKeyAsk;
  /** D235: one action in the person's apps that commits (go), or their own turn (user); set by the app tools only. */
  computer?: ComputerAsk;
  /** D238: may this task use the person's own phone now (set by the home's handset code only). */
  handset?: HandsetAsk;
  /** D505 (rev.): carry this sign-in to the person's own Chrome on their Mac, asked once per site (set by browser_ask_sign_in only; hold: the Hold's words, default the Go's; reversible false here, the card waits with no countdown). */
  signInWhere?: SignInWhereAsk & { hold?: string };
  /** D599: a sign-in with a one-time code on a page (gh auth login's device flow): the page, the code, until when (set by sign_in_with_code, or by the runner from the CLI's own printed lines). */
  deviceSignIn?: import("./device-signin.ts").DeviceSignInAsk;
  /**
   * D601: the task's own word on what its Go does when that is one of the steps a standing
   * permission can cover (TASK_STEP_ACTIONS): the model judges the kind, code guards the rest (a
   * plain ask, an owner known, never the floor or a merge) before the card offers Always do this.
   */
  step?: StandingAction;
}

/**
 * D505 (rev.): a task on a computer the person doesn't sit at (a server home) needs them signed in to a
 * site, and their own Chrome on an awake Mac (`to`) has it. The first time for that site: Go (换过去 /
 * Move it there) moves the task there and remembers the site (Settings' chromeSites); Hold (我在这里登录
 * / I'll sign in here) puts today's sign-in card up where the task is. Unanswered, it waits (A3). The
 * card's words come with it (question, goLabel, holdLabel), so every client draws it as any go/hold ask.
 */
export interface SignInWhereAsk {
  site: string; // the site as remembered ("taobao.com")
  url: string; // the sign-in page the task asked for (its host is what the move carries)
  to: string; // the computer, by name ("MacBook")
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
  /** D436: not a sign-in but another step that is the person's on this page (a CAPTCHA, a code by
   *  text, "confirm it's you"), in the task's few words. The card reads 这一步要你来 / Your step. */
  step?: string;
}

/**
 * D436: 去付款 / Go to checkout. An errand stopped at the checkout page (set by Ducter's
 * browser_at_checkout, never by report_to_main). The site is the page's host, read by code; the
 * rest is the task's word. Go is 付好了 / I've paid (the person paid in the live view themselves);
 * Hold is 先不买 / Not now. No default, ever: Ducter never presses pay.
 */
export interface CheckoutAsk {
  site: string;
  url: string;
  /** What it buys, in a few words ("G7311 上海虹桥→杭州东 11-28 08:05 二等座"). */
  what: string;
  /** The total the page shows ("73.00") and its ISO currency, when the task read one. */
  total?: string;
  currency?: string;
  /** The items, when there are several (at most 8, each a few words). */
  items?: string[];
  /** The page's picture when it stopped (filled fields drawn as dots). */
  media?: MediaRef[];
}

/**
 * D236: what the user picked to answer when they replied to one message (回复 / Reply). The client
 * names only the message (its seq, and a find or a part of its words inside it); core fills the
 * rest from the Log when it logs the reply, so the quote travels with the reply for good: it
 * survives the window, a re-cut and a restart, and never trusts words a client made up.
 */
export interface ReplyRef {
  seq: number; // the channel event replied to
  from: "you" | "partner"; // whose words: the user's own, or the partner's (a find, a question, a result)
  kind: "message" | "question" | "find";
  quote: string; // at most REPLY_QUOTE characters of its words, or the part the user picked
  part?: boolean; // the quote is a part the user picked, not the start of the message
  clipped?: boolean; // its words go on past the quote (log_read gives the rest)
  ts: string; // when it was said
  taskIds?: string[]; // the tasks it was about (at most 3)
  decisionId?: string; // the question it asked
  answers?: boolean; // that question was open: these words are its answer (core resolved it, msgSeq)
  findId?: string; // the find it was (one find of a note)
  media?: MediaRef[]; // its pictures (at most 4): the partner sees them again with the reply
  ask?: number; // D430: one line under the person's message (its index): the quote is that line's words, taskIds its task
}
/** D236: how much of a message a reply carries: a bounded quote and its seq, never the whole thing. */
export const REPLY_QUOTE = 200;
/** D236: a client's half of a reply: the message, and a find or a part of its words in it. */
export interface ReplyWant {
  seq: number;
  findId?: string;
  part?: string;
  /** D430: 回复这一条 / Reply to this one: one line under the person's message, by its index. */
  ask?: number;
}
/**
 * D580: the chat-app thread the person's words were written in, as it stood before them: what the
 * partner hadn't seen of it (all of it the first time it is @-mentioned there; later, only what it
 * missed). Outside data: who said each part is marked, and a colleague's words are never the
 * person's request. unread: the thread couldn't be read (the app lacks the permission, or the chat
 * app didn't answer); the partner says so plainly and asks for what it needs.
 */
export interface ChatThread {
  app: ChannelKind;
  /** Oldest first; the thread's first message is kept whatever the bound. */
  said?: { who: "user" | "other" | "ducter"; name?: string; text: string }[];
  /** Earlier messages left out by the bound. */
  more?: number;
  /** Only what it missed since it was last in the thread (it knows the rest). */
  since?: boolean;
  unread?: "scope" | "failed";
}
/** D580: how much of a thread comes along: the last THREAD_MESSAGES before the words, about THREAD_CHARS in all. */
export const THREAD_MESSAGES = 20;
export const THREAD_CHARS = 4_000;

/**
 * D619: what Nowledge Mem last said about who opened a message Ducter sent on the person's
 * behalf. Present only when Mem says a receipt is available: a missing one is "unknown", never
 * "unread", and a missing count is never read as zero.
 */
export interface BridgeReceipt {
  state: "read" | "partly" | "unread";
  /** People who opened it, when Mem says (integer; 0 is a real zero). */
  count?: number;
  /** People it went to, when Mem says; several readers read as 2/5. */
  total?: number;
}

export interface Bodies {
  // D206: media = the pictures the user sent with it (text may be empty then).
  // reply (D236): the one message this answers, with its quote.
  // via (D276): said in a chat app (the linked account there), not in a Ducter app.
  // forwarded (D276): the words are something the person forwarded or shared from someone else:
  // outside data, never the person's own words or instructions.
  // via "imessage" (D277): through the Mac app's iMessage bridge.
  // app (D405): words about one of the person's apps (typed in its sheet), or the app's own ask (app.ask).
  // passed (D486): the person's words, said to another partner and passed on by it (that partner's id).
  user_msg: { text: string; clientId?: string; media?: MediaRef[]; reply?: ReplyRef; via?: ChannelKind | "imessage" | "share"; /** D537: through the phone's share sheet: where the shared thing begins in text, and from which app. */ shared?: import("./share.ts").SharedFrom; forwarded?: { from?: string }; /** D580: the chat-app thread these words were written in, before them (outside data). */ thread?: ChatThread; app?: AppRef; passed?: { from: string; /** D649: the chat app this turn came from, and which of the person's messages it was. */ via?: ChannelKind; seq?: number }; /** D511: typed on a Keep's page: about that Keep. */ keep?: { id: string; title: string }; /** D534: what the person referred to with @ or /, as the home resolved it. */ refs?: import("./mentions.ts").HeldRef[] };
  // decisionId: a task's question said in the partner's own words (D129); clients show it as
  // that decision's question, not as a message of its own.
  // media (D206): what a task showed, relayed with the partner's words about it.
  // cal (D222): the day glance the partner put under these words (calendar do=agenda show).
  // first (D298): the partner's first words, said by the home when someone first opens the
  // conversation, with the things it offers to start or continue (a tap fills the composer).
  // ui (D303): the blocks the partner put in its words (a table, a chart, a checklist, choices),
  // each standing in for its plain text in `text`; uiDropped: how many it wrote that weren't valid.
  // app (D405): the app this message made or changed (its card under the words); appAnswer: it answers an app's ask.
  // shelf (D410): the person asked where their apps are: a card that opens 小应用 / Apps under these words.
  // D418 `pings`: the own agent's contact tests (message ids) this line tells about; clients show
  // this line in place of their folded quiet line, so it is said once.
  ai_msg: { text: string; replyTo?: number; decisionId?: string; media?: MediaRef[]; cal?: CalGlance; first?: FirstWords; ui?: RichUi[]; uiDropped?: number; app?: AppCard; appAnswer?: AppAnswer; shelf?: true; pings?: string[]; /** D511: the Keep this turn made: its receipt card under these words. */ keep?: import("./keeps.ts").KeepCard; /** D598: the hand-off (its message id) no task of the helper took in time: said once. */ stalled?: string; /** D623: the day after the first run: the true facts, each a link, under these words. */ dayAfter?: DayAfter; /** D628: a wait that re-armed with nothing new: this line is said once per task and reason. */ waitSlow?: { taskId: string; reason: string }; /** D633: the one quiet summary of outside things that just ended (counts, for tests and clients that want the facts). */ settled?: { prs: number; issues: number; refs: string[] } };
  // D623: the day after the first run. Code logs the true facts it found; the partner is
  // woken by it and says one short recap in its own words, carrying the same items as links. A
  // separate `finds` note then asks the one offer (two chips, no card). Logged once in a home's life.
  day_after: DayAfter & { at: string };
  ack: { jobId: string; text: string; replyTo: number }; // names the action, never the outcome
  // D380: a quick web look for one live fact (the weather, a version, one price), run beside the
  // conversation by a session that holds only web tools. "looking" when the partner asks it (no
  // row in On hand; the conversation's waiting line says it); then "found" with the typed result
  // only (never page text), or "unsettled" with why, which the partner hands to a browsing task.
  // The record answers "how did you know?".
  web_look: WebLook;
  // act, ref (D216): the line a user's Merge or Open draft PR logs, with the merge's commit or the PR's address.
  job_status: {
    jobId: string;
    text: string;
    state: "running" | "done" | "failed";
    taskId?: string;
    act?: "merge" | "open_pr";
    ref?: string;
    /** D596: Ducter did it under a standing go the person said (不用问我的), not their tap: its id and their words. */
    by?: "rule";
    standing?: string;
    said?: string;
    /** D596: what the task ran that verified the work before its PR was opened (its own words, cut). */
    checks?: string[];
  };
  living_msg: { items: LivingItem[] }; // supersedes the previous living_msg while unread
  // D426: what one message asked for, line by line, under it (asks.ts). Logged by core whenever a
  // line is added or its state changes; clients keep the latest per msgSeq, under that message.
  asks: import("./asks.ts").AsksBody;
  decision: {
    decisionId: string;
    taskId?: string; // absent = a partner-level decision (the partner's own ask, before any task)
    question: string;
    // D640 (#254): what the task showed with this question (`report.media`): the pictures
    // and files stand on the card itself, so they are there before the person answers, wherever
    // the card is shown (the conversation, On hand). Never repeated under the relaying line.
    media?: MediaRef[];
    goLabel: string; // e.g. "Rebase"; the UI shows "好，<goLabel>" / "Go: <goLabel>"
    defaultOption: "go" | "hold";
    defaultAt?: string; // ISO time the default applies (only if reversible)
    reversible: boolean;
    routineId?: string; // a routine's proposal card (D114): Go activates it
    forApp?: AppAnswer; // D405: the card answers an app's ask (something outward it asked for waits for this Go)
    unsure?: boolean; // D245: with routineId: its watch saw something it isn't sure of; Go runs it once
    loop?: { taskId: string; move?: string }; // D427: the keeper's one word about a late or failing loop: Go runs a round now; D429: with move (a device id), Go runs it on that awake computer instead
    signIn?: SignInAsk; // D151: a sign-in card; Go = 好了 / Done in the live view
    pay?: PayAsk; // D191: 付款 / Pay: merchant, amount, card; Go pays once, no default
    checkout?: CheckoutAsk; // D436: 去付款 / Go to checkout: the person pays in the live view; Go = 付好了 / I've paid, no default
    fill?: FillAsk; // D191: first use of a saved sign-in or detail on a site
    key?: KeyAsk; // D233: {task} 需要一个密钥 / {task} needs a key: Go carries the value (never logged); Hold is 不给 / Don't give; no default
    copyKey?: CopyKeyAsk; // D539: 复制密钥 / Copy a key from one of the person's computers to others, for Ducter's tasks there; only the person's own Go copies; no default
    phone?: PhoneAsk; // D217: one tap on Ducter's phone that commits (Go taps it once), or the user's turn on it (Go = 好了 / Done)
    computer?: ComputerAsk; // D235: one action in the person's apps that commits (Go does it once), or their own turn (Go = 好了 / Done)
    handset?: HandsetAsk; // D238: may this task use the person's own phone now (Go starts it there, with its indicator); no default
    where?: WhereAsk; // D157: wait for a computer (Hold, the default) or do it now on another (Go)
    closing?: ClosingPlan; // D157: 合上之前搬走 / Move before closing: Go (the default) moves them
    anywhere?: { hostname: string }; // D228: create the tunnel in the person's Cloudflare account and point this hostname at the home (Go)
    memPlugin?: MemPluginAsk; // D169: put Nowledge Mem into this agent on that computer (Go); 先不装 / Not now (Hold, the default)
    // D165: a find's one next step. Clients render it inside its note (not as a card of its own);
    // On hand lists it like any ask. Never pushed on its own: the note is the one notification.
    findId?: string;
    // D453: an offer, not an ask: a find said quietly (the morning note, a fold-in) or the to-dos
    // Ducter can clear today. It never needs the person: no client counts it as needs-you or lists
    // it on On hand, in the mini window, the menu bar or the talk's cards; it has no Hold (letting
    // it be is the hold) and fades on its own at the next morning (resolved hold by default).
    offer?: boolean;
    // D403: the find's reply is already written: anywhere but its card (On hand, a chat app) the
    // card shows its first line and 看草稿 / See the draft (goLabel), which opens the card in the
    // conversation; never a Send there. A Go without the words never sends.
    draft?: { first: string };
    asker?: PeerAsk; // D170: asked for one of the user's own agents; the answer goes back to it
    // D587: asked by a done report made in a turn the person opened with their own words in the task
    // (report.direct): they read it there, so the partner is not woken to relay it; clients show the
    // task's own wording at once, with no wait for the partner's.
    direct?: true;
    // D448: a task's message to another agent (who: as the person reads it). Go sends it; Ducter
    // tells the task what came of it, so nothing of the card is forwarded to the task.
    relay?: { who: string };
    trust?: { agent: string }; // D170 (X2): 以后你的 <agent> 发来的活，直接接？ Go keeps the rule
    // D379: who does which work, said by the person and never saved; it just decided a task. Go
    // (记成规则 / Keep as a rule) saves their words as a rule; Hold (只这次 / Just this once, the
    // default) keeps nothing. Asked once per saying; core keeps it, no partner turn. (Not "said":
    // clients keep the partner's own words for a question under that name, D129.)
    saying?: { key: string; harness: string; never?: true; kinds: import("./loadout.ts").WorkKind[]; quote: string };
    // D334: a teammate's agent wrote for the first time: Go (答应 / Let it) lets this sender's messages
    // through as questions, Hold (不理 / Ignore, the default) mutes it. Remembered per sender.
    sender?: { from: string; space?: string; messageId: string };
    holdLabel?: string; // D334: Hold's own words when the card's code names them (不理 / Ignore)
    // D599: 登录 {service} / Sign in to {service} with a one-time code: Open {service} and the code with Copy;
    // no Go before the code runs out (Ducter sees the sign-in by the CLI's own check, or the task says
    // so), then 再要一个码 / Get a new code; settled when signed in. No default, never put off.
    deviceSignIn?: import("./device-signin.ts").DeviceSignInAsk;
    signInWhere?: SignInWhereAsk; // D505 (rev.): 换过去 / Move it there (the person's Chrome on their Mac, remembered per site) or 我在这里登录 / I'll sign in here
    // D189/D193: a phone call. kind "go": the call's Go card (打给 X？ / Call X?), never a default,
    // never "don't ask next time". kind "question": a question from the line, pushed at once even
    // in quiet hours; its choices are buttons that answer with option "reply" and that text.
    // kind "sheet" (D215): a call sheet the owner calls themselves (no line calls that country); Go = 打完了 /
    // Done calling, Hold = 先不打 / Not now; 自己打 / Call it yourself is the client's own tel: link.
    call?: { callId: string; kind: "go" | "question" | "sheet"; plan?: CallPlan; choices?: string[]; yesNo?: boolean };
    // D222: a calendar change (add, move, cancel, answer an invitation). Go runs it once, by core;
    // its outcome is the connection_call with this decisionId (state done + link, or failed).
    cal?: CalChange;
    // D341: a card about a to-do bound to a task (待办来源 / To-do sources): a write-back to its app,
    // the to-do closed there while the task works, or a standing go offered once.
    src?: SourceAsk;
    // D437: another AI read what this Go sends before the card was shown, and this is still so
    // (the person's language, one line each): 另一个 AI 看过：漏了 Windows 那一处.
    look?: { by: string; left: string[] };
    // D601: its Go is one of the standing actions where a tap may keep it: the card shows a second
    // choice beside Go, 以后这类直接做 / Always do this (以后直接发 / Always post on a review round's
    // card), which does this one now and keeps a standing permission there; with often (GQ4) it leads
    // with 这类你已经点过两次了，以后直接做？. Set by code only (never by a task, never on the floor).
    always?: AlwaysAsk;
  };
  // now (D208): a call's Go given as 现在就打 / Call now, over the callee's courtesy hours.
  // delivered (D233): the task already has the answer (it came back in the tool call it was waiting
  // in), so it is not forwarded again, now or after a restart.
  // msgSeq (D236): the reply message that answered it (its words show as that bubble, not on the card).
  // settled (D375): closed by what happened, not by an answer (D169's offer once Mem's check sees the
  // plugin in): it reads as done (已装好 / Installed), never as a default taken.
  // D413 posted: a review round's card settled because every draft on it went under a standing
  // permission the person said (shown 按你说的，直接发了 / Posted, as you said).
  // D481 by "ended": closed by what happened, not by an answer (its task finished or was replaced,
  // a loop's card whose moment passed); never forwarded, read as 不用回了 / No longer needed.
  // D499 by "said": a task's ask answered Go by Ducter for the person, under what they said (a kept
  // 不用问我的, or their words about this task): `said` their words, `action` the step it covered,
  // `standing` the permission's id. Shown 按你说过的，没再问你 / Went ahead, as you said.
  // D539: a key copied between the person's computers on their Go (names only, never a value), or
  // one removed from a computer in Settings (removed: that computer's name, by "user").
  key_copy: { decisionId?: string; env: string; name: string; from: string; to: string[]; failed?: { name: string; why: string }[]; removed?: string; by: "go" | "user" };
  decision_resolved: { decisionId: string; option: "go" | "hold" | "reply"; text?: string; by: "user" | "default" | "ended" | "said"; now?: boolean; delivered?: boolean; msgSeq?: number; settled?: true; /** D599: a one-time-code sign-in seen through (its CLI's own check, or the task's word): settled, by "ended", and its task goes on. */ signedIn?: true; posted?: true; said?: string; action?: StandingAction; standing?: string; /** D601: Go given with 以后这类直接做 / Always do this: `standing` is the permission the tap kept. */ always?: true; /** D585: answered by the person's own words typed in the task itself: closes the card, wakes nobody (the task heard them). */ inTask?: true };
  // D382: 晚点再问我 / Ask me later: the person put a waiting question off to `until`. It stays
  // open (answering it still works) but out of Needs you; its countdown stops.
  decision_later: { decisionId: string; until: string; by: "user" };
  // D382: it is back in Needs you: its time came ("time") or the person asked for it now ("user",
  // 现在就定 / Decide now). defaultAt (only by "user", who is looking at it): its countdown again,
  // the length it was first given. Back at its time, no default runs until it is seen.
  decision_back: { decisionId: string; by: "time" | "user"; defaultAt?: string };
  // D382: back at its time and first seen (the first read past its return, on any client): its
  // countdown runs from now, the length it was first given.
  decision_seen: { decisionId: string; defaultAt: string };
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
    // D292: the language the user reads its reports in, a BCP 47 tag ("ko", "zh-Hant"; the old
    // "zh" | "en" are tags too). The brief says so; clients check its result against it.
    language?: LangTag;
    // D206: the pictures the brief carries (the user's, handed on); the first turn gives them to the agent.
    media?: MediaRef[];
    // D128: "you" = the user opened it themselves (开一个任务 / New task, `ducter task`); the brief
    // is their words as they are. Absent = the partner opened it.
    origin?: "you";
    // D285: opened with 带着它开新任务 / New task from this: the task its brief carries findings from.
    from?: string;
    // D391: opened with 从这一步重来 / Redo from here: the step of `from` it redoes, and the commit its code started from.
    fromStep?: number;
    fromCommit?: string;
    // D299: a session the person ran in their own AI agent outside Ducter, carried on here: which
    // agent kept it, its id there, and when it began. The task works in that session's folder.
    outside?: { agent: string; sessionId: string; startedAt: string };
    // D157: what the task needs of its computer (kept so a move or a switch keeps them).
    needs?: TaskNeeds;
    // D372: the kind of work it is (the partner's word at open, else inferred from its needs and place).
    workKind?: WorkKind;
    // D476, D477: the person's word on where this work runs, as the partner recorded it (where.ts).
    bound?: TaskBound;
    // D479: the task whose work this opens again, as the partner recorded it (task_open replaces):
    // one that failed is set aside as superseded by this one.
    replaces?: string;
  };
  task_state: { taskId: string; attention: Attention; residency: Residency; reason?: string; cant?: CantStart; /** D645 (research/245 §3.7): what it waits for when it waits on the person, in one line. */ waitsFor?: string };
  // D325: the person's words held for after this turn (做完再说, or a steer its agent can't take
  // mid-turn): the whole queue as it is now, in order. Ducter holds them, not the agent, so each
  // can be changed, taken back or said now; at the turn's end they go as the next turn. [] = none.
  task_held: { taskId: string; held: HeldMsg[] };
  // Who does the task and why (D89, focus-window.md "Choosing a body"): appended when it opens
  // and on every switch. The card shows the latest one.
  body_selected: { taskId: string; harness: string; model?: string; effort?: string; why: BodyWhy };
  // role "user" + from "user" = text the user sent straight into the task (logged by the runner).
  task_event: {
    taskId: string;
    role: "assistant" | "user" | "tool" | "system";
    from?: "user" | "partner" | "runner" | "ducter"; // D271: "ducter" = Ducter's own note to the task (a phone lent, a Stop), not anyone's words
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
    /** D426: its word on each of its lines (what the person asked for), in the order it was given them. */
    asks?: import("./asks.ts").AskReport[];
    /** D437: set by Ducter (never the task): another AI read this result once before it went out. */
    look?: import("./fresh-look.ts").FreshLook;
    /** D439: set by Ducter (never the task): the document it shows was checked page by page; `left` is what is still so. */
    doc?: import("./doc-bar.ts").DocCheck;
    /** D585: set by Ducter (never the task): made in a turn the person opened with their own words in
     *  the task. They read it there; a progress one stays out of the living message. */
    direct?: true;
    /** D602: the PRs it let go in this report (each one it owns): not where its work goes on. */
    letGo?: { pr: string; why: "duplicate" | "unneeded" }[];
  };
  /** D483: owns: what the task declared it owns outside ("owner/repo#123"), so news about it wakes it (core/src/owned.ts). */
  checkpoint: { taskId: string; text: string; gitRef?: string; owns?: string[] };
  /**
   * D483: news about a PR a task owns, as told to it (its comments, reviews, CI's end, a push, merged
   * or closed, another task's report naming it), and what was told up to then (`seen`: the cursor a
   * restart picks up from). news [] is the first look, which only learns where it stands.
   */
  owned_news: { taskId: string; pr: string; news: string[]; seen: OwnedSeen };
  // D341: a task bound to one outside to-do (item null: unbound). by: who bound it (the person in
  // New task, the partner when it took one, or a standing go).
  task_bound: { taskId: string; item: SourceItemRef | null; by: "you" | "partner" | "rule" };
  // D345: a tool Ducter put on the home because the person tapped for it (gh, for GitHub's sign-in):
  // how, where, the version, and how it went. Done for you lists a done one (changed, install).
  tool_install: { device: string; tool: "gh"; how: "brew" | "release"; where: string; version?: string; phase: "started" | "done" | "failed"; detail?: string; by: "user" };
  // D385: a set of to-dos found in the conversation (todos do=find), drawn as a tickable card under
  // the partner's line; logged again with groupId once it was handed over (clients keep the latest per setId).
  todo_set: import("./handover.ts").TodoSet;
  // D341: what a look at a source saw change on a to-do: closed or reopened in its app, its words
  // edited, the line gone, or new to-dos in scope (refs, at most 20, untrusted titles).
  source_seen: {
    source: string;
    change: "closed" | "reopened" | "edited" | "gone" | "new";
    item?: SourceItemRef;
    taskId?: string;
    /** edited: the title it had before. */
    was?: string;
    items?: SourceItemRef[];
    /** new: under the standing go (they start without asking). */
    taken?: boolean;
  };
  // D341: one write to the to-do's app on the person's behalf (comment, close, tick, untick), with
  // the Go or standing go that allowed it. Done for you reads it (sent: comment; changed: the rest).
  source_write: {
    source: string;
    item: SourceItemRef;
    op: SourceOp;
    state: "done" | "failed";
    by: "go" | "rule" | "undo";
    decisionId?: string;
    taskId?: string;
    /** D413: by "rule" under a standing permission the person said (不用问我的): its id, and their words. */
    standing?: string;
    said?: string;
    /** comment: the words that went out (cut to 600). */
    text?: string;
    /** What the app gave back (the comment's address). */
    link?: string;
    error?: string;
  };
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
    wakes?: "task"; // D267: a task's own timer: when due it wakes that task, not the partner
    /** D297: the task's agent hit its usage limit: the task rests until `at` (the reset, or the next try when it is unknown) and carries on in the same session. */
    limit?: LimitWait;
    at?: string;
    reason: string;
    state: "armed" | "fired" | "cancelled" | "expired";
    kind?: WaitKind; // absent = "timer"
    check?: CheckSpec;
    watch?: WatchSpec; // D245: kind "change": fires when what it watches changed (no model)
    baseline?: WatchBaseline; // D245: what the watch saw last (armed: start from it; fired: the new one)
    detail?: string; // D245: fired: what changed, longer than observed (<= 2000 chars; untrusted data)
    unsure?: boolean; // D245: fired on a look it can't trust (all of it gone at once, a changed shape): ask, don't run
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
    /** D394: "cancelled" because the task armed its next timer: a task has one timer of its own, the newest. */
    replacedBy?: string;
    /**
     * D483: "cancelled" because a look can't be evaluated (its answer isn't JSON for its path, is
     * too large, or the command can't run where it looks): what happened, plainly (<= 300 chars).
     * A task's wait wakes the task with it; never a wait that looks on in vain.
     */
    cantTell?: string;
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
  // D427: a task that keeps going in rounds (it rests on its own wait between them). Ducter keeps
  // the rhythm: a round's done or failure, a restart or a lost wait never ends it; only the person
  // (or the end condition they gave) does. One snapshot per change; the latest wins.
  task_loop: TaskLoopBody;
  // D511: 照看 / Looking after: a Keep, one snapshot per change on stream keep:<keepId>; the latest wins.
  keep: import("./keeps.ts").KeepBody;
  // D609: a hand-off as one record with an owner, keyed by sender + receiver + item ref. One snapshot
  // per step (given, taken, done, returned, declined, unclaimed), on stream channel; the latest per
  // handoffId wins, and a second hand-off of the same item merges into the open one.
  handoff: import("./handoff.ts").HandoffBody;
  // D519: one round of a Keep in one line to the person, the cheap model's reading of its report,
  // recorded once on stream keep:<keepId> (principle 21); failed: never asked again, nothing said.
  keep_round: { keepId: string; round: string; line?: string; failed?: true };
  // D533: a change to a Keep, by the person on its page or by the partner (keep_change), on stream
  // keep:<keepId>: each field from and to, shown as a line among its rounds.
  keep_edit: { keepId: string } & import("./keeps.ts").KeepEditLine;
  // D631 (#243): a Keep made before keep_make recorded the acting partner took its routine's
  // partner as its owner, once, at start. On stream keep:<keepId>, origin system, so the repair is
  // in the Log and never silent; a second start finds nothing to repair.
  keep_owner_repaired: { keepId: string; routineId: string; from: string; to: string; at: string };
  // D620: a doorbell rang for a Keep, on stream keep:<keepId>: when, and the caller's own short
  // "about" label when it gave one. Never a request body: the body is never read at all.
  keep_ring: { keepId: string; at: string; label?: string };
  // A firing: "started" opens a run task; "skipped" records a firing that could not run (with how
  // many were coalesced into it); "done"/"failed" close a run from its task's final report.
  // D245: lateMin: it started that many minutes after its time (>= 15; its brief said so).
  // attempt 1+: the one safe retry, or a try after an account error. retryAt: this failed run is
  // tried again then (it had posted and done nothing yet). trouble: an account error (signed out,
  // out of allowance): it spaces the routine out instead of counting as a failure. acted: the
  // run had posted or done something before it failed, so it is never repeated. spent: an account
  // error after the spacing reached 24 h: from then on it counts toward "3 in a row".
  routine_run: { routineId: string; runId: string; scheduledFor: string; state: "started" | "skipped" | "done" | "failed"; taskId?: string; catchUp?: boolean; coalesced?: number; reason?: string; tokens?: number; lateMin?: number; attempt?: number; retryAt?: string; trouble?: RoutineTrouble; acted?: boolean; spent?: boolean };
  // The partner saved something durable to the user's long-term memory (Nowledge Mem). Clients
  // show one quiet line under the reply: "记下了 · <title>" / "Noted · <title>". Never a card,
  // never a notification. Provenance lives in Mem, not here.
  /**
   * D329: replaced: the title of the partner's own earlier memory this one took the place of (Mem's
   * supersede, never a duplicate); waiting: the outbox key when Mem was down and the save waits to go
   * in (MemView.waiting says while it still does).
   */
  /**
   * D566: one write of a file to the person's Nowledge Mem (stream "mem"): what it was, who asked,
   * how it ended, and Mem's raw answer to the write (its metadata, clipped; never the file's
   * contents), so the first real saves show the true shape (research/231 §3).
   */
  mem_file: { media: string; name: string; by: "tap" | "partner" | "auto"; op: "add" | "update" | "folder" | "space"; space?: string; target?: string; ok: boolean; uri?: string; rev?: number; why?: string; message?: string; code?: number; raw: string };
  memory_noted: { title: string; memoryId?: string; replyTo?: number; replaced?: { id?: string; title: string }; waiting?: string };
  // D304: a memory the partner's answer actually leaned on, said once under that answer: "想起了你
  // 11月10日 说的" / "Remembered from what you said on Nov 10". Only when recall changed the answer,
  // at most one per reply, and only a memory memory_search returned that turn (the partner names
  // it by the result's ref; code checks it). aboutSeq: the ai_msg or ack it stands under. by: who
  // the memory is from: "said" (the person's own words to the partner, Mem source "ducter"),
  // "tool" (another AI tool saved it; from: its name, "Claude Code"), "you" (the person saved it
  // themselves: the CLI, the app, a clip). date: YYYY-MM-DD it was recorded. Titles only; the
  // memory's text never leaves Mem.
  // D433: thread: the person's past conversation with another AI tool (from: the tool; memoryId: Mem's thread id), not a memory.
  memory_recalled: { memoryId: string; title: string; by: RecallBy; from?: string; date?: string; aboutSeq: number; replyTo?: number; thread?: true };
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
  // Nowledge Bridge (on with the home's connection, D557; design/bridge.md). "in": a message another agent
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
    // D364, in: Mem's linked shape (nmem 0.10.120+) said `in_reply_to: null`: an original, not an
    // answer to anything Ducter sent (so D249's maybe-answered rule leaves it out).
    linked?: boolean;
    sentAt?: string;
    taskId?: string;
    decisionId?: string;
    /** D596: out, sent with no card under a standing go the person said (a PR handed to their helper): its id and their words. */
    standing?: string;
    said?: string;
    agent?: string;
    // The tool the sender runs in ("Claude Code"), when it has no name of its own: "an agent in Claude Code".
    host?: string;
    mine?: boolean;
    // in: "early" = in the mailbox before Bridge was on for this persona (B14), "set_aside" = over
    // the sender's daily quota (D170), "muted" = a sender the user stopped listening to, or one
    // Settings doesn't let reach the partner; none wakes the partner. Absent = a message to read.
    // D334, in: "held" = a teammate's agent's message kept while the person answers its sender card
    // (答应 logs it again without a state, so it wakes the partner; 不理 leaves it held).
    // D448, in: "task" = an answer to a message a task sent (by: "task"): delivered into that task
    // (`taskId`) as a follow-up; it never wakes the partner.
    state?: "pending" | "held" | "sending" | "sent" | "failed" | "unknown" | "unconfirmed" | "followed" | "early" | "set_aside" | "muted" | "ping" | "task";
    // D448, out: the task `taskId` wrote it (agent_message: a task on an agent with no Bridge of its
    // own) and Ducter carried it, under the partner's identity with the task named. Never a claim or
    // a result: never owed, never followed through with the person.
    by?: "task";
    // D448, out: the line Ducter put before the task's words (`text`) as it went: who writes
    // ("Ducter 的任务「修 Linux CI」："). What went out is head, a newline, then text.
    head?: string;
    opId?: string;
    contact?: string;
    operation?: string;
    // D412, "followed": the other unanswered messages to the same agent that one line also covered.
    alsoFollowed?: string[];
    // D494: sent to one of the person's helpers (in), or from one (out: its reply goes from the helper's
    // own address): the helper's id on the home (core/src/helpers.ts).
    helper?: string;
    // D598, in: work handed to a helper on this very home by one of its own tasks (agent_message) or by
    // the partner (keep_change hand): written here, never through Nowledge Mem (a round trip through
    // Mem to the same home came back as a reply on the helper's own last message, and was read as an
    // answer: hel, mem#11393). messageId starts "local-"; the claim and the outcome go into `fromTask`.
    local?: true;
    fromTask?: string;
    // D604, in: what the person wrote on its sender card as they let it through (their words for the
    // partner about it; never sent to the sender). A card answered with words is never 不理.
    told?: string;
    // D334: the Space it came in (in), or goes out in (out): a reply goes back in its message's Space.
    space?: string;
    spaceLabel?: string;
    // D470, in: it came in a Space the person shares with others (not their own place).
    shared?: boolean;
    // D418, in: one of the person's own agents named by its own words ("我是 Wey 的 Mem 协作 Codex"):
    // `agent` is the tool it said ("Codex"), `role` the rest of its words for itself ("Mem 协作"); read
    // as 你的 Codex（Mem 协作）/ your Codex (Mem 协作). Only with `mine` (peer-self.ts ownAgentSelf).
    selfNamed?: boolean;
    role?: string;
    // D418, in: the first message any other agent ever sent this persona (the one-time note's place;
    // a client's window of the Log can't tell which is first).
    first?: boolean;
    // D418, in: Mem's own reply argv for it (nmem 0.10.121 `reply_args_prefix`, ending in its `bm1:`
    // reference), kept so a reply after a restart goes the way Mem said, not by the bare id.
    route?: string[];
    // D418: an own agent's contact test answered by code: the "in" (state "ping", never wakes the
    // partner) and the "out" that answers it (`ack`). Clients fold them into one quiet line.
    ack?: boolean;
    // D418, out: the resend of an op Mem's outbox shows never went (once, with Mem's fresh route).
    retryOf?: string;
    // D444, in: what the message hands over from Nowledge Mem, read once when it arrived: a
    // `nowledgemem://` reference in its words or among Mem's typed references (`resources get`, read
    // only), or a shared plan's card (named only: Ducter never joins one). title: Mem's own title for it;
    // kind: memory, artifact (a file or document), thread, plan or other; read: false when Mem didn't
    // answer (the line still names what came).
    // text: its first words as Mem gave them (clipped, secrets redacted), for the partner only.
    refs?: { uri?: string; title: string; kind: "memory" | "artifact" | "thread" | "plan" | "other"; text?: string; read?: false }[];
  };
  // D619: the latest read receipt Mem gave for one message Ducter sent on the person's behalf
  // (bridge_msg out), read on the inbox check Ducter already runs. One per op, appended only when the
  // receipt changed; clients keep the latest by opId/messageId and show it beside the time. Never
  // appended when Mem has no receipt: no receipt is unknown, not unread.
  bridge_read: {
    opId: string;
    messageId?: string;
    receipt: BridgeReceipt;
  };
  // The partner's own harness session, on the "partner" stream (never shown; clients skip it).
  // "recut": Ducter started a fresh session from the projection because the live context grew
  // past the re-cut size (principle 4). "harness_compacted": the harness's own compactor ran
  // anyway, although it is bounded above the re-cut (research/11 §7.3.7); its summary now
  // competes with the spine, so it is recorded to be seen.
  partner_session: {
    // D435: brain_held, the partner's own agent (harness) is held until held.until; brain_back,
    // a turn on it went through again (or the person chose another agent), and the hold is over.
    // D591: turn_used, one partner turn's tokens (`turn`, on the model it ran on), so `ducter usage`
    // counts the partner's own replies too.
    event: "recut" | "harness_compacted" | "brain_held" | "brain_back" | "turn_used";
    harness: string;
    model?: string;
    turn?: TurnTokens;
    held?: { why: "quota" | "rate_limited" | "error"; until: string; resetKnown: boolean; since: string; source?: string; said?: string; told?: string; /** D449 */ free?: import("./free-budget.ts").FreeProvider };
    sessionId?: string;
    contextTokens?: number; // what the context held, by the harness's count when it gave one
    digested?: boolean; // recut: onto digests (true) or onto the window and pointers only (false)
    outcome?: string; // harness_compacted: the harness's own outcome and trigger
    trigger?: string;
  };
  // D591: one of Ducter's own looks (a judge, a second look, a read of an account, a Keep's round
  // check, a branch name): one short tool-less turn on an agent, with what it used. On the "looks"
  // stream, never shown; `ducter usage` counts it. `what` is the look's kind (its folder name).
  look_used: {
    harness: string;
    model?: string;
    turn: TurnTokens;
    what: string;
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
  // learned (D304): the week's first morning note offers, in one line, to show what it noted about
  // the person in the last 7 days (count), opening 这周记下的 / What it learned this week.
  finds: { noteId: string; rung: FindRung; opening: string; finds: FindView[]; leftOut?: string; quiet?: boolean; ask?: ProactiveAsk; revises?: string; answered?: string; /** A fold-in: how many finds at the end are new in this revision (the partner reads only those). */ added?: number; learned?: { count: number } };
  // A find changed: Go or Hold on its step, passed its date (过了), or the person's reaction
  // (有用; 这类不用告诉我 adds a Rule, ruleId). taskId: the task Go opened.
  // D403: until (sending): when the reply goes; decisionId (unsent, send_failed): the find's Go asked again; error (send_failed): why, in a few words.
  find_state: { findId: string; kind: FindKind; state: FindState; taskId?: string; ruleId?: string; until?: string; decisionId?: string; error?: string };
  // D464: the person opened something under a find: 怎么知道的 / How I know ("how"), or 还有几条 /
  // A few more brought it into view ("more"). Once per find and what; read only by `ducter
  // proactive week` (never a learning signal, never wakes the partner).
  find_opened: { findId: string; kind: FindKind; what: import("./proactive.ts").FindOpenWhat };
  // D502: one shadow pass of cross-source findings (the cheap model over the ledger's facts), on the
  // "partner" stream: never shown, never wakes the partner; read by `ducter proactive week`.
  shadow_finds: import("./proactive.ts").ShadowRun;
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
  // D473: a rung of Ducter's own repair ladder for a task (core/src/mend.ts): the write-ahead record
  // of a retry or repair (state going, then ok or failed), or a hand-over to the partner (rethink,
  // which wakes it). On the task's stream, origin "system". Read by `ducter repairs`.
  mend: import("./mend.ts").MendBody;
  // D514: a task's working copy tidied away by Ducter (`git worktree remove`, never forced): what
  // went, on which computer, how big, why. On the task's stream, origin "system". Read by Past
  // tasks (工作副本已整理), the computer's card (整理过 n 个…) and `ducter worktrees`.
  copy_tidied: import("./tidy.ts").CopyTidiedBody;
  // The person moved a computer's Ducter folder (settings › Where it runs): the old and new
  // absolute paths, the computer ("local" for the home), and what went with it. Place lookups apply
  // it as a prefix mapping, so a task opened before the move still resolves to its working copy.
  folder_moved: { from: string; to: string; device: string; projects: number; worktrees: number };
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** What the context holds at the turn's last model call, as the harness reported it (D135). */
  contextTokens?: number;
  /** D288: the window that reading fills (the harness's report, else the session's set window). */
  contextWindow?: number;
  /** D288: where the harness compacts on its own (the session's compaction point). */
  compactAt?: number;
  /** D288: this turn alone (input counts its cached part; output its reasoning). */
  turn?: TurnTokens;
}

/** D288: one turn's tokens: input (cache reads included, `cached` that part) and output. */
export interface TurnTokens {
  input: number;
  output: number;
  cached?: number;
}

/**
 * D288: an AI agent's account usage limits, as the agent itself reports them: read on demand
 * (OAR accountUsage: Claude Code's get_usage, Codex's account/rateLimits/read) and kept current
 * by what a running session says (Claude Code rate_limit_event, Codex account/rateLimits/updated).
 */
export interface AccountUsage {
  harness: string;
  /** The plan as the agent names it ("max", "pro", "plus"). */
  plan?: string;
  /** The signed-in account (an email or display name), when the agent says. */
  account?: string;
  /** A limit refuses requests now. */
  limited?: boolean;
  windows: UsageWindow[];
  /** When this was read or last heard. */
  at: string;
}

/** D288: one usage window of an account (a 5-hour, a weekly, a per-model weekly limit). */
export interface UsageWindow {
  /** The agent's own key ("five_hour", "seven_day", "codex:primary"). */
  id?: string;
  /** The agent's own name for it (English; clients word it from its span and model). */
  label: string;
  /** Used, 0..1. */
  used: number;
  resetsAt?: string;
  /** Its length in ms when known (5 h, 7 days). */
  durationMs?: number;
}

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
  /** D382: a question back from 晚点再问我 / Ask me later: clients say so once above it (when it came back). */
  back?: string;
}

// ---------- On hand snapshot ----------

/** D325: one message the person held for after this turn: `id` is the client's id it was sent with. */
export interface HeldMsg {
  id: string;
  text: string;
  at: string;
  media?: MediaRef[];
}

/**
 * D617 (D590's leftover): one memory Ducter's own recall put in front of a task's first turn.
 * The runner records these on the task's stream (never the memory's text), and the opened task shows
 * them under the brief. id: Mem's own id; space: Mem's exact Space id; via: whether it is one of the
 * person's stated preferences (Mem's `preference` kind) or a hit the brief's search found.
 */
export interface RecalledMemory {
  id?: string;
  title: string;
  space?: string;
  via: "preferences" | "search";
}

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
  // the open decision, for On hand. D382: later: put off to this time (the task shows in Waiting);
  // backAt: when it came back from being put off.
  pendingDecision?: Bodies["decision"] & { askedAt: string; later?: string; backAt?: string };
  openedAt: string;
  updatedAt: string;
  until?: UntilView; // D113
  fromRoutine?: { routineId: string; name: string; reports?: "every" | "on_change" | "needs_you" }; // a routine's run (D114); D584: how its runs report
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
  /** D235: the task is using the person's apps on this computer (its id; app: the one it last used), so it can be stopped. */
  computing?: { device: string; app?: string };
  /** D238: the task is using the person's own phone (its device id; app: the one in front, by id), so it can be stopped. */
  handset?: { device: string; app?: string; quiet?: boolean; paused?: "locked" | "asking"; wait?: import("./handset.ts").HandsetWait; away?: import("./handset.ts").HandsetAway };
  /** D285: the person's marks (their name for it is already its title; original keeps the task's own). */
  mark?: PastMark;
  original?: string;
  /** D285: seeded from that task (New task from this); D391 step: it redoes that task from its step n. */
  from?: { taskId: string; title: string; step?: number };
  /** D299: carried on from a session the person ran in their own agent outside Ducter. */
  outside?: { agent: string; sessionId: string; startedAt: string };
  /** D325: what the person held for after this turn, in order (absent: nothing held). */
  held?: HeldMsg[];
  /** D341: the outside to-do it is bound to (待办来源), with what Ducter last saw of it there and what it wrote back. */
  source?: SourceItemRef & { state?: "open" | "closed" | "gone"; wrote?: SourceOp[] };
  /** D395: it couldn't start because of its place: why, and what fixes it (absent once it starts). */
  cant?: CantStart;
  /** D473, D471: Ducter is mending it right now (its newest event is a repair under way, not the
   *  partner's rethink): it stands at work on On hand, never as a failure. */
  mending?: { cls: import("./mend.ts").MendClass; how?: import("./mend.ts").MendHow; name?: string };
  /** D498 (D210): while it works, when this turn began (its last start to work), so a card says how
   *  long this turn has run, never how long ago the task was opened. */
  turnAt?: string;
  /** D645 (research/245 §3.7, B4): the question it waits on when it is `needs_you` because it
   *  was told to wait for the person. Absent: it asked in its report, or waits on something else. */
  waitsFor?: string;
  /** D645 (research/245 §3.7, B1): no computer could read GitHub for it at this time (no gh,
   *  signed out). The row says so with its fix after 30 minutes; cleared by a read that worked. */
  githubBlind?: { since: string; device?: string; home?: string };
  /** D498 (D427): a task in rounds Ducter keeps: its rhythm and where the rounds stand, so On hand
   *  stands it under 一直在跑 / Ongoing and says its rhythm, never "working for 182 hours". */
  rounds?: import("./past.ts").TaskRounds;
  /** D508: the pull requests it made or took over, where each stands at Ducter's last look (core's
   *  owned looks, D483, D496). A finished task whose PR is open is not done: On hand stands it under
   *  that PR's state (pr-state.ts). */
  prs?: import("./pr-state.ts").TaskPR[];
  /** D507 (D494): the helper whose work this is (its claim went out naming this task), so a row that
   *  stands anywhere but under the helper (beside an opened task, in Find, done after its PR merged)
   *  still says whose it is. Which of its tasks it keeps is OnHand.helpers' items. */
  helper?: { id: string; name: string };
  /** D511: the Keep (照看) this task is a round or an item of, so a row anywhere says whose it is. */
  keep?: { id: string; name: string };
  /** D609: the latest hand-off this task gave to a helper (its one line under the last report). */
  handoff?: import("./handoff.ts").HandoffLine;
  /** D521: the work its agent runs beside its turn (background shells, subagents, watches, jobs):
   *  every one still running and the newest finished, folded from its Log (background.ts). */
  background?: import("./background.ts").TaskBackground;
}

/**
 * D395: why a task couldn't start where it was to work, in a word the clients put in their own
 * language ("没能开始：Hetzner Server 上没有 mem 的代码"), and the fixes core found for it.
 */
export interface CantStart {
  /**
   * no_repo: no git repository there; no_folder: no such folder; clone_failed: cloning it there failed.
   * D415, every other start failure has a word too: busy: another git held the repository the whole
   * time (清掉旧的再试 when the lock is one git left); agent: its agent couldn't start (its program,
   * a sign-in); away: its computer went away; other: anything else (再试一次 asks again, fresh).
   * D472: the common agent failures have their own word and fix: not_installed: its agent isn't on
   * that computer (装上); signed_out: it isn't signed in there (登录); old: that computer's Ducter
   * is too old for it (更新). "other" is only what is truly unknown, said with what is known.
   */
  why: "no_repo" | "no_folder" | "clone_failed" | "busy" | "agent" | "not_installed" | "signed_out" | "old" | "refuses_root" | "away" | "other";
  /** The computer it was to start on, by name. */
  computer: string;
  /** D472: that computer's device id ("local" for the home), for a fix done there (a folder chosen on it, a sign-in). */
  device?: string;
  /** D472: the task's agent (its harness id), named in the line and its fixes. */
  harness?: string;
  /** D472: no_folder / no_repo with that computer reachable: 选 {computer} 上的文件夹 / Choose a folder on {computer}, then it starts there. */
  pickHere?: boolean;
  /** D472: other: what the start said, a few lines at most (behind 看看为什么 / See why), never a stack. */
  more?: string;
  /** The repository's or folder's own name ("mem"). */
  what: string;
  path?: string;
  /** Another computer that has it: 在 {name} 上做 / Do it on {name}. */
  elsewhere?: { device: string; name: string };
  /** Its repository is known and that computer's git can read it: 拉一份到这里 / Clone it here. */
  cloneHere?: boolean;
  /** D415: busy: the lock git left can be cleared (清掉旧的再试 / Clear it and try again). */
  clearLock?: boolean;
  /** D415: agent: the agent's own words for why, one line (its sign-in, its program), shown under the reason. */
  detail?: string;
}

/**
 * D476, D477: the person's own word on where a piece of work runs, as the partner recorded it on
 * task_open (where.ts; never read from the words by code) and kept on the task: only that
 * computer; never those; or the one they named (Ducter never moves the work off it by itself).
 * Device ids, "local" for the home.
 */
export interface TaskBound {
  only?: string;
  not?: string[];
  named?: string;
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
  /**
   * D312: with more than one partner, every partner's own open questions (not its tasks'), so On
   * hand lists another partner's too; a client leaves out the partner it shows (its conversation has them).
   */
  asks?: PartnerAsk[];
  /** D360: groups of tasks that are one piece of work, with the members held in line (task-groups.ts). */
  groups?: TaskGroupView[];
  /** D454: tasks the person removed from Tasks (移走): a client that also builds its board from the Log leaves them out. */
  away?: string[];
  /**
   * D481: every question still open at the home (the one source of truth for "open"), as of Log
   * seq asOf. A client closes any question it holds open that isn't here and was asked at or before
   * asOf (it missed the resolution), and asks the home (asks_get) for the ones here it doesn't hold.
   * Offers and put-off questions count as open.
   */
  openAsks?: { ids: string[]; asOf: number };
  /** D507 (D494): the person's helpers that are on, each with the work it keeps (HelperWork, the one
   *  home-side model of a helper's state): On hand gives each its own sheet with its work under it. */
  helpers?: import("./helpers.ts").HelperWork[];
  /** D511: 看守中 / Looking after: every Keep on or paused (and one ended today), each its own sheet.
   *  It takes the place of `helpers` and the cards' `rounds` for a client that reads it (an older
   *  client still reads those, kept for it). */
  keeps?: import("./keeps.ts").KeepSheet[];
}

/** D312: one partner's own open question, as On hand lists it (a tap shows that partner). */
export interface PartnerAsk {
  persona: string;
  decisionId: string;
  question: string;
  at: string;
}

/** D186: a project the user added: a folder (a repo or not) on the home's computer, or on a worker (place.device, D197), and its name. */
export interface ProjectView {
  name: string;
  place: Place; // kind "repo" or "folder"
  addedAt: string;
  /** D455: a repo's origin, normalized: the same repo added on a second computer joins this project's name. */
  remote?: string;
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
/** D546 persona: the partner that set it (absent: the default); On hand lists every partner's waits. */
export type WaiterView = Bodies["waiter"] & { persona?: string; armedAt?: string; lastLookAt?: string; lastSummary?: string; looks?: number; nextLookAt?: string; changes?: number; limitAuto?: boolean };

/**
 * D297: a wait on an AI agent's usage limit. `harness` is whose limit; every task on that account
 * shares the one reset (On hand groups them). resetKnown: `at` is the reset the agent named;
 * otherwise `at` is the next try. handTo: another signed-in agent that could take the task now
 * (Hand it to {agent} now). tell: the partner says it once (it matters: no reset time and nobody
 * else to take it). tries: how many times it has met the limit in a row.
 */
/** D297: a limit wait wakes this long after the reset it names (so the first turn isn't refused at the edge); D478: the reset itself is what anyone is told. */
export const LIMIT_RESET_GRACE_MS = 60_000;

export interface LimitWait {
  harness: string;
  resetKnown: boolean;
  handTo?: { harness: string; model?: string };
  tell?: boolean;
  tries?: number;
}

// ---------- Work over time (D112-D115, design/product-model.md section 4) ----------

export type WaitKind = "timer" | "check" | "event" | "judge" | "change";

/**
 * D245: what a "when something changes" routine watches, looked at without a model. Exactly one
 * source: files (names, sizes, modification times; a folder's direct entries), argv (a reading
 * command under the check rules: its output), url (a public GET), tool (a reading tool of a
 * connected app, fixed input). `path` picks the part of a JSON answer that matters; `key` names
 * the fields that identify one item of that list, so a change can say what is new, updated or
 * gone, and a fetch time elsewhere in the answer never counts; `fields` limits which of an item's
 * fields count as an update (default: all).
 */
export interface WatchSpec {
  files?: string[];
  argv?: string[];
  cwd?: string;
  device?: string; // argv only: "local" (default) or a worker's device
  url?: string;
  tool?: { connection: string; action: string; input?: unknown; account?: string };
  path?: string;
  key?: string[];
  fields?: string[];
}

/** D245: what a watch saw last: a hash of the whole, and one hash per keyed item (<= 200). */
export interface WatchBaseline {
  hash: string;
  items?: Record<string, string>;
}

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
  | { kind: "condition"; condition: string; check?: CheckSpec; event?: EventSpec; judge?: string; watch?: WatchSpec; everyMs: number };

/** D245: an account error a run hit: signed out (an AI agent or an app), or out of allowance. */
export type RoutineTrouble = "signin" | "quota";

/** D427: a task in rounds, as Ducter keeps it (`task_loop` on the task's stream). */
export interface TaskLoopBody {
  taskId: string;
  /** on: Ducter keeps its next round armed; paused: the person paused it; ended: the person (or its end condition) ended it. */
  state: "on" | "paused" | "ended";
  /** What it waits for between rounds, in the person's words (the wait's reason). */
  reason: string;
  /** A timer loop's rhythm: from one round's wake to the next. */
  everyMs?: number;
  /** Who set the rhythm last: the task's own waits, or the person ("改成每小时"), which the task's waits then follow. */
  rhythmBy?: "task" | "user";
  /** A condition loop: the wait it re-arms between rounds (a check, an event, a judge, how often to look). */
  look?: { check?: CheckSpec; event?: EventSpec; judge?: string; everyMs?: number };
  /** An end condition the person gave ("直到 #10473 合并"), in their words: a done report then ends it. */
  until?: string;
  since: string;
  /** How Ducter knew it repeats: the person's words in its brief, or its own rounds (it re-armed after a wake). */
  by: "brief" | "rounds";
  /** D633: where the task stood before its rounds took it (not working/queued: those were a
   *  turn, and a loop ending without a turn must never fall back to one). Read when the rounds end
   *  with the work unfinished, so the card says what is true instead of 在做. */
  before?: Attention;
  endedBy?: "user" | "partner" | "condition";
  /** Ducter brought it back: a round's done read as the loop's end, a failed round, a lost wait, a restart. */
  back?: { at: string; from: "done" | "failed" | "lost" | "restart"; stoppedAt?: string };
}

export interface RoutineBody {
  routineId: string;
  /** D312: the partner it is for (its runs report to it); absent: the default partner. */
  persona?: string;
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
  /** D245: its runs keep hitting an account error. Ducter tries again by itself, 5 min doubling
   *  to 24 h, and clears this on the first run that works. failures: account errors in a row
   *  (the person is told once, at 2). */
  backoff?: { trouble: RoutineTrouble; reason: string; since: string; nextTryAt: string; stepMs: number; failures: number };
  /** D245: set only on the one snapshot the partner says: "stuck" when account errors repeat
   *  (the second in a row), "works_again" when the first run after that works. */
  news?: "stuck" | "works_again";
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
//    Older channel events are pulled a page at a time with channel_history (D509).
//    Task streams are never pushed in bulk; clients pull them with task_history and receive
//    live task_event/task_state for every task afterwards.
//  - read.upToSeq: the user has seen the channel up to this seq. The living message is frozen
//    once read: the next update appends a new living_msg instead of superseding.
//  - send.clientId: idempotent. A send whose clientId is already in the Log is not appended
//    again; the server re-sends that user_msg to the sender as an events frame (its echo).
//    Clients keep unechoed messages and resend them, in order, after each welcome.
//  - task_send: delivered to the task as steer when it is mid-turn and the harness supports it,
//    otherwise as the next turn ("prompted") or queued behind the current turn.

/** D627: a home frozen for a move: what it holds and what is still running on it. */
export interface MoveState {
  frozen: boolean;
  running: { taskId: string; title: string }[];
}

/** D627: the core's freeze controls (`ducter move --to`, `--unfreeze`). */
export interface MoveControl {
  freeze(): MoveState;
  unfreeze(): MoveState;
  status(): MoveState;
  frozen(): boolean;
}

export type ClientFrame =
  // tz: the client's IANA zone; personal-time routines follow the latest one (D114).
  // client: what is connecting (D128: `open_task` goes to the apps, never to a CLI); absent = an app.
  // version: the Ducter version the client runs (the Mac app's); newer than the home's latest
  // release makes the home read GitHub again (its answer is stale).
  // shape (D263): what the device a page runs on is shaped like (shapeFromBrowser), for its clay.
  // gzip (D284): the client reads a frame over 16 KB sent as one binary message, its JSON gzipped
  // (the Mac app; a browser has the socket's own deflate).
  // D298: a pasted API key (never logged, never sent back): recognised, checked, kept, thought with.
  | { t: "key_add"; key: string; clientId: string }
  // D298: 别再看了 / Stop looking: the first words never read the person's agents' records again (on: back on).
  | { t: "local_agents"; on: boolean }
  // D327: 这个文件夹别看了 / Leave this folder out (hidden: false brings it back). path is `~/…` or absolute.
  | { t: "outside_folder"; path: string; hidden: boolean }
  // D327: the person tapped the first words' look start: the home reads their agents' records and
  // answers with the partner's offers (an ai_msg with first.look). Nothing happens with looking off.
  | { t: "local_agents_look"; tz?: string }
  | { t: "hello"; persona?: string; cursor?: number; locale?: LangTag; tz?: string; client?: ClientKind; version?: string; shape?: ClientShape; gzip?: boolean }
  // media (D206): ids from POST /api/media; the home turns them into refs. text may be empty then.
  // reply (D236): the one message this answers (core fills in its quote from the Log).
  // via (D277): the Mac app's iMessage bridge relays words the person wrote in iMessage.
  | { t: "send"; text: string; clientId: string; media?: string[]; reply?: ReplyWant; via?: "imessage"; app?: string; keep?: string; /** D534: what the words refer to with @ or / (mentions.ts). */ refs?: import("./mentions.ts").Ref[] } // app (D405): typed in that app's sheet; keep (D511): on that Keep's page
  // D277: the Mac app's iMessage bridge says how it stands (on: it reads and answers there).
  // While some socket says on and the person last wrote from iMessage, the home's push stays quiet
  // for what the bridge carries, so each thing reaches them once.
  // computer (D323): the Mac it runs on, by its Computer Name, so the home can tell every Chat apps
  // page which Mac carries iMessage.
  | { t: "channel_status"; channel: "imessage"; state: "on" | "needs_permission" | "not_signed_in" | "off" | "error"; computer?: string }
  // cvc (D191): a pay card's security code when none is kept; held in memory for that one
  // payment's fill, never logged.
  // key, once (D233): a key card's Go carries the key the person pasted (kept in Autofill unless
  // once; never logged, never sent back) and whether it is for this task only.
  | { t: "decide"; decisionId: string; option: "go" | "hold" | "reply"; text?: string; cvc?: string; key?: string; once?: boolean; /** D601: Go and 以后这类直接做 / Always do this (option go, on a card with `always` only). */ always?: true }
  // D382: 晚点再问我 / Ask me later: put the question off to `until` (ISO); null brings it back now
  // (现在就定 / Decide now).
  | { t: "later"; decisionId: string; until: string | null }
  // D481: questions this client and the home's On hand disagree about (open at the home but unknown
  // here, or open here but closed at the home): the home answers with one events frame holding each
  // one's decision event and its resolution, so every surface agrees with the home.
  | { t: "asks_get"; ids: string[] }
  // clientId (optional): a resend with the same id is not delivered twice; it gets the same "sent".
  | { t: "task_send"; taskId: string; text: string; clientId?: string; media?: string[]; /** D268: steer (default while it works) or queue for after this turn. */ mode?: "steer" | "queue"; /** D534: what the words refer to with @ (mentions.ts). */ refs?: import("./mentions.ts").Ref[] }
  // D534: the @ list for what is typed after @: tasks (on hand and earlier), Keeps, partners, PRs
  // and issues Ducter knows, and (taskId) files in that task's place. Answered by mention_list.
  | { t: "mention_find"; id: string; q: string; taskId?: string }
  // D534: the / list: Ducter's actions and the person's skills (no taskId), or that task's agent's
  // own commands and skills and Ducter's task actions. Answered by slash_list.
  | { t: "slash_find"; id: string; taskId?: string }
  // D325: one held message (TaskCard.held) changed (edit, with text), taken back (drop), or said
  // now (now: steered in while it works, else the next turn). The card's next on_hand answers it;
  // an id no longer held (it already went) gets an error frame "task_held: …".
  | { t: "task_held"; taskId: string; id: string; op: "edit" | "drop" | "now"; text?: string }
  // merge: integrate the task branch into its base branch (local, reversible by revert);
  // open_pr: push the branch and open a draft PR (an intent: external effect, see G-safety).
  // The server acks every task_action with {t:"action_result"}.
  // D142, a non-git folder task: undo puts the folder back exactly as it was before the task
  // (path: only that one entry of folder_changes); keep frees the copy (就这样 / Keep the
  // changes). An undo of a folder someone changed after the task finished is answered ok:false
  // with `confirm` (what would be lost); the same undo with force: true goes ahead.
  // D395: start_at (device): a task that couldn't start starts on that computer's copy; clone_here: clones it where it was to start.
  // D415: clear_lock: 清掉旧的再试, the lock git left is cleared (no git running) and it starts again.
  // D472: start_in (place): a task that couldn't start starts in the folder the person chose on that computer (D455's sheet).
  // D521: stop_background (job): stop one of its agent's background jobs (TaskCard.background), through the agent's own stop.
  | { t: "task_action"; taskId: string; action: "interrupt" | "drop" | "end" | "undrop" | "reopen" | "merge" | "open_pr" | "undo" | "keep" | "start_at" | "clone_here" | "clear_lock" | "start_in" | "stop_background"; path?: string; force?: boolean; device?: string; place?: Place; job?: string }
  // D142: the list behind a folder task's Changes; answered with a folder_changes frame.
  | { t: "folder_changes"; taskId: string }
  // D214: one op of the opened task's workbench (its files, changes, pages), answered with a wb
  // frame carrying the same id.
  | { t: "wb"; id: string; taskId: string; req: import("./workbench.ts").WbRequest }
  // D356: a link in a task's or the partner's words to a file on the home or a worker: the home
  // reads it from the task's own folders (taskId: the task it was shown in, a hint) and answers
  // with a file_open frame carrying the same id: the file as a media ref for the viewer, or why not.
  | { t: "file_open"; id: string; path: string; taskId?: string }
  // D566: 存到 Nowledge Mem / Save to Nowledge Mem on a file card or in the viewer: the home keeps
  // the file (by its media id) in the person's Mem, a new version of the one it saved before.
  // D575: space, the person's answer when Mem's write target is a Space others read (shared_space):
  // personal (their own, the default) or shared (Mem's target); asked once, then remembered.
  | { t: "mem_file_save"; id: string; media: string; space?: "personal" | "shared" }
  | { t: "read"; upToSeq: number }
  // D284: an opened task asks for its newest window first (limit ~200), then older pages with
  // beforeSeq = the oldest seq it holds; limit is at most 2,000.
  // D320: afterSeq = the newest seq it holds of a far stretch: the page after it, oldest first.
  | { t: "task_history"; taskId: string; beforeSeq?: number; afterSeq?: number; limit?: number }
  // D509: an older page of the conversation this socket shows: the events before beforeSeq (the
  // oldest seq the client holds), at most `limit` (default 300, at most 2,000). Answered with a
  // channel_history frame.
  | { t: "channel_history"; beforeSeq: number; limit?: number }
  // D541: the newest stretch of another partner's conversation (at most `limit`, default 50, at
  // most 200), so a switch to it draws at once. The person's own clients only; the socket keeps
  // showing its partner. Answered with a partner_peek frame.
  | { t: "partner_peek"; persona: string; limit?: number }
  // D320: the task's session index (one small row per turn): all of it, or its turns from fromSeq on
  // (the first seq of the last turn the client holds). Answered with a task_index frame.
  | { t: "task_index"; taskId: string; fromSeq?: number }
  // Devices and abilities (D43, D51): "devices" answers with a devices frame and keeps the
  // socket subscribed (a fresh frame whenever a device or an ability changes). "ability" adds
  // (on: true, 装上) or removes (on: false, 取下) an ability on a device; it is answered with
  // ability_result, then a fresh devices frame. "pair_code" mints a one-time pairing code for
  // 远程打开 / Reach from outside (D54), answered with a pair_code frame.
  // refresh: probe the harness sign-ins again now (after signing in or out from the app).
  | { t: "devices"; refresh?: boolean }
  // D293: liveness (a home from D293 on answers pong), and "this computer is going to sleep" (the Mac app, before system sleep).
  | { t: "ping" }
  | { t: "sleep" }
  // D228: on the home, "remote" off turns 从外面连 / From outside off (stops the tunnel, clears
  // the address; the tunnel stays in the person's Cloudflare account). On with named: a tunnel the
  // person made in Cloudflare's dashboard (its token and the hostname it serves). On without it is
  // the guided setup, anywhere_setup below.
  | { t: "ability"; device: string; ability: AbilityId; on: boolean; named?: { token: string; hostname: string } }
  // D228: the guided setup of 从外面连 on the home. begin: 让 Ducter 帮我设好 / Set it up for me
  // (opens the task; answered with anywhere_setup_result {taskId}). step: one step, run by the
  // home for that task's agent (`ducter anywhere step <id>`): login, create (hostname?), run.
  // cancel: stop setting up (the task stays as it is). Progress arrives in devices frames.
  | { t: "anywhere_setup"; op: "begin" | "step" | "cancel"; step?: AnywhereStepCmd; hostname?: string }
  | { t: "pair_code" }
  // D347: 加一台做事的电脑 / Add a computer for tasks: a fresh code and the one line the other computer
  // pastes; answered with a lend frame (state waiting), then lend frames as it joins and arrives.
  | { t: "lend_code" }
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
  // D344: the person opened a version's full notes from an update card (看看都改了什么 / See what
  // changed); the partner's "updated" line for that version is then not said that day. No answer.
  | { t: "notes_seen"; version: string; tz?: string }
  // D156: agent_update: update one AI agent on a device with its own updater, at a safe point
  // (check: read the latest versions again and only report). Answered with agent_update_result;
  // progress arrives as fresh devices frames and agent_update events.
  | { t: "agent_update"; device: string; harness: string; check?: boolean }
  // D363: putting an AI agent on a device, signing it in there, and looking again (core
  // agent-setup.ts): install: these agents into Ducter's own tools folder there; login: start that
  // agent's own sign-in there (Codex's device code, Claude's link); code: the code Claude's page
  // gave; cancel: stop a sign-in; look: probe that device's agents now (its card opened). Answered
  // with agent_setup_result; progress arrives as fresh devices frames.
  | { t: "agent_setup"; device: string; action: AgentSetupAction; harnesses?: string[]; harness?: string; code?: string }
  // D366: Nowledge Mem on a computer for tasks (core worker-mem.ts): install: Mem's command line
  // into Ducter's own tools folder there; connect: sign it in with the one-time connect link the
  // person pasted (never logged or kept) and connect that computer's Codex and Claude Code to it.
  // Answered with mem_setup_result only when the device couldn't take it; progress arrives as
  // fresh devices frames (DeviceView.mem).
  | { t: "mem_setup"; device: string; action: DeviceMemAction; link?: string }
  // D377: 读它们留下的记录 / Read what they keep, on a computer for tasks: the person's yes (on: true)
  // or 别再看了 / Stop looking (on: false) for their own agents' records there, saved on that computer
  // itself. Answered with records_allow_result only when the device couldn't take it; the change
  // arrives as fresh devices frames (DeviceView.records).
  | { t: "records_allow"; device: string; on: boolean }
  // D224: update_all: 全部更新 / Update all: the home makes one plan of everything behind (its own
  // Ducter first, then the other computers, then each computer's AI agents at a safe point) and
  // runs it, kept on disk so it outlives its own restart. stop: 停止剩下的 / Stop the rest (what
  // hasn't started stays as it is); dismiss: put a finished plan away. Answered with
  // update_all_result; progress arrives as fresh devices frames (updateAll.plan).
  // D362: stopItem: 停止 on one running AI agent step that is slower than usual (its key).
  | { t: "update_all"; stop?: boolean; dismiss?: boolean; by?: "user" | "cli"; stopItem?: string }
  // D169: mem_plugin_install: 装上 / Install Nowledge Mem into one AI agent on a device (the user
  // tapped it, so it is their Go). D375: Mem's own `nmem connect --tool` there when Mem has one for
  // that agent and its plugin is absent; else, or when that didn't put it in, one task there that
  // follows Mem's own setup guide. Answered with mem_plugin_result; the card reads the check again after.
  // D470: what "mailbox": 打开它的信箱 / Open its mailbox on Agent messaging, for an agent Nowledge Mem
  // lists with its mailbox closed: one task there that opens it through the agent's own Mem plugin.
  // D480: with what "mailbox", space is the Space the person chose in place (Mem's exact id and its
  // label): the task's brief names it, so it never asks which. Absent: the task finds it, as D470.
  | { t: "mem_plugin_install"; device: string; harness: string; what?: "mailbox"; space?: { id: string; label: string } }
  // D480: 打开它的信箱 / Open its mailbox, in place: look at that computer's Mem for this agent
  // (Mem's status and passive `bridge setup` there; nothing is written).
  // Answered with mailbox_look.
  | { t: "mailbox_look"; device: string; harness: string }
  // D375: Settings › 记忆's 再看一次 / Check again: read Mem's own doctor on the home now (the settings frame follows).
  | { t: "mem_health" }
  // D205: Settings › 伙伴's 接上 / Connect and 断开 / Disconnect for the persona's own Bridge
  // connection, run by the home's nmem on the user's tap. Answered by fresh settings frames (bridge).
  | { t: "bridge_connect" }
  | { t: "bridge_disconnect" }
  // D324: 改由这台收 / Receive here instead (elsewhere) and 只留这台 / Keep only this one (others on
  // connected): this home connects if it isn't yet, then ends the other homes' connections. The tap is the Go.
  | { t: "bridge_only_here" }
  // D494: 停下 / Stop and 接着收 / Take work again on a helper's row (Settings › Agent 通信): the tap is the Go.
  | { t: "helper_stop"; id: string }
  | { t: "helper_resume"; id: string }
  // D225: put in (or update) the home's Nowledge Mem command line; sign it in with a one-time
  // connect link the user made in Nowledge Mem (never logged or kept).
  | { t: "bridge_mem_install" }
  | { t: "bridge_mem_sign_in"; link: string }
  // D329: mem_closed: the home opens the Nowledge Mem app (macOS, when the app is there).
  | { t: "bridge_mem_open" }
  // The partner's and the app's settings (D71): "settings" answers with a settings frame and
  // keeps the socket subscribed (every change goes to every subscriber). "settings_set" changes
  // some of them. "memory_forget" forgets one 记下了 / Noted line: in Nowledge Mem when it has the
  // memory's id and Mem forgets it, otherwise only hidden from this list (the frame says which).
  | { t: "settings" }
  // D309: 伙伴们 / Partners (packages/protocol/src/partners.ts). A home that has them on answers with
  // a "partners" frame (to this socket, and to every socket on a change). partner_add makes one
  // (name, look); partner_set renames one or changes its look (the default's name is settings_set's).
  // Switching is a new hello with persona: the socket then shows that partner's conversation.
  | { t: "partners" }
  | { t: "partner_add"; name: string; look?: import("./partners.ts").PartnerLook; /** D565 */ figure?: import("./partners.ts").PartnerFigure; about?: string; clientId?: string }
  // D536: brain, what another partner thinks with (null: the same as the default partner's, Settings.brain).
  | { t: "partner_set"; id: string; name?: string; look?: import("./partners.ts").PartnerLook; /** D565 */ figure?: import("./partners.ts").PartnerFigure; about?: string; brain?: Brain | null; clientId?: string }
  // D486: removes another partner (never the default): its conversation stays in the Log, unread;
  // its tasks and routines become the default's; a device showing it shows the default's.
  | { t: "partner_remove"; id: string; clientId?: string }
  | { t: "settings_set"; patch: SettingsPatch }
  | { t: "memory_forget"; seq: number }
  // D329: 撤销 / Undo on a fresh 记下了 / Noted line: the save is taken back at once (archived in Mem,
  // never deleted; a memory it replaced comes back), no question asked. Answered with a settings frame.
  | { t: "memory_undo"; seq: number }
  // D304: 这周记下的 / What it learned this week, line by line: confirm one as right, or correct its
  // words (written back to Nowledge Mem through nmem when the line has the memory's id).
  | { t: "memory_confirm"; seq: number }
  | { t: "memory_correct"; seq: number; title: string }
  // D321: Settings › 记忆's own rows, by Mem's id: forget one, or fix its words (both through the
  // partner's Mem client, as its identity); find searches Mem (≤ 8 hits, titles only), answered by a
  // mem_found frame to this socket.
  | { t: "mem_forget"; id: string }
  | { t: "mem_fix"; id: string; title: string }
  | { t: "mem_find"; q: string }
  // D465: settle one of Mem's asks (or turn an on rule off: answer "not"); answered with mem_answered.
  | { t: "mem_answer"; id: string; answer: MemCheckAnswer }
  // Who does the tasks (D89): "rules" answers with a rules frame and keeps the socket subscribed;
  // rule_remove (不要这条 / Remove) drops one, then every subscriber gets a fresh rules frame.
  // Rules are added only by saying them in the conversation (the partner's rule_save tool).
  | { t: "rules" }
  | { t: "rule_remove"; id: string }
  // D538: a placement rule kept from a computer's 关于这台 / About this computer: add one, or change
  // the one `id` names (prefer or avoid, and which work: heavy, web, or all). A fresh rules frame follows.
  | { t: "rule_where"; id?: string; device: string; avoid?: boolean; work: "heavy" | "web" | "all"; lang?: string }
  // D413: 收回 / Take back a standing permission (不用问我的 / Without asking); a fresh rules frame follows.
  | { t: "standing_revoke"; id: string }
  // D381: 置顶 / Pin. pin: a block of a partner message (its seq, the block's index) goes to the top;
  // unpin takes it off (the message keeps it); pin_tick ticks a pinned checklist's item, by its
  // words, on the home. Every socket on the default conversation gets a fresh pins frame after each.
  | { t: "pin"; seq: number; index: number }
  | { t: "unpin"; id: string }
  | { t: "pin_tick"; id: string; item: string; on: boolean }
  // candidates: who could do this task, best first (换谁来做 / Switch who does it); answered with
  // a candidates frame. task_switch moves the task to another AI agent (换到 X 接着做 / Continue
  // on X): a pin, and a handoff from saved progress if it is running; answered with action_result
  // (action "switch"). After two switches the same way the partner asks once whether to make it
  // a rule (a partner-level decision).
  | { t: "candidates"; taskId: string }
  // D288: an agent's account usage limits, for a task's context card (answered by account_usage;
  // read at most every few minutes; fresh: true reads again now).
  | { t: "account_usage"; harness: string; fresh?: boolean }
  | { t: "task_switch"; taskId: string; harness: string; model?: string; effort?: string; device?: string } // device (D157): continue on another computer; effort (D282): the same agent keeps its session
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
  // D388: `ducter proactive replay`: the last `days` (1–7) of the real accounts through a dry
  // engine on the home (no sends, no tasks, nothing in the conversation); web: allow a web look for
  // an open question. Answered with proactive_replay_result, minutes later.
  | { t: "proactive_replay"; days?: number; web?: boolean }
  // D464: `ducter proactive week`: the last `weeks` (1–12) of offers counted from the Log; answered with proactive_week_result.
  | { t: "proactive_week"; weeks?: number }
  // D502: `ducter proactive cross`: one shadow pass of cross-source findings now, logged like the daily one; answered with proactive_cross_result.
  | { t: "proactive_cross" }
  // D473: `ducter repairs`: the last `weeks` (1–12) of failures and self-repairs counted from the Log; answered with repairs_week_result.
  | { t: "repairs_week"; weeks?: number }
  // D588: `ducter usage`: the tokens tasks used over the last `days` (1–31) in the person's days (`tz`: minutes east of UTC), counted from the Log; answered with usage_days_result.
  | { t: "usage_days"; days?: number; tz?: number; top?: number }
  // D627: freeze this home for a move (new tasks refused, routines/Keeps held, chat apps stopped),
  // ask how it stands, or lift the freeze (the way back for this slice).
  | { t: "move_freeze" }
  | { t: "move_status" }
  | { t: "move_unfreeze" }
  // D514: `ducter worktrees [--plan]`: every working copy Ducter made, what goes when and what stays and why; changes nothing. Answered with worktrees_plan_result.
  | { t: "worktrees_plan" }
  // D242: fresh keys for media this client holds refs to (its keys ran out); answered with media_keys.
  | { t: "media_keys"; ids: string[] }
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
  // D403: 撤回 / Undo on a drafted reply inside its window: nothing is sent, the card asks again.
  | { t: "find_undo"; findId: string }
  // D464: the person opened 怎么知道的 under a find, or 还有几条 (the finds it brought into view).
  | { t: "find_open"; findIds: string[]; what: import("./proactive.ts").FindOpenWhat }
  | { t: "proactive_answer"; noteId: string; ask: ProactiveYesNo; yes: boolean }
  // Work over time (D112-D114), each answered with action_result (taskId = the waiter or routine
  // id). waiter_action look: look now; cancel: 不等了 / Stop waiting. routine_action pause, resume
  // (only a person resumes), end. waiter_action rearm: 接着等 / Keep waiting, on a missed wait (D144). until_action stop: stop the loop after this try.
  | { t: "waiter_action"; waiterId: string; action: "look" | "cancel" | "rearm" | "handoff" } // handoff (D297): a limit wait's task goes to its handTo agent now
  | { t: "routine_action"; routineId: string; action: "pause" | "resume" | "end" }
  | { t: "until_action"; taskId: string; action: "stop" }
  // 开一个任务 / New task (D128). task_new_options: what the card offers (places, recent first,
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
  // D285: from, 带着它开新任务 / New task from this: the brief carries what that task found.
  // D357: handed: the to-do was handed over from Tasks (交给{name} / Hand to {name}); no place was
  // picked, so the home finds the repository's own folder.
  | { t: "task_new"; words: string; place?: Place; harness?: string; model?: string; effort?: string; clientId?: string; when?: NewTaskWhen; media?: string[]; from?: string; item?: SourceItemRef; handed?: boolean }
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
  // D272: 在 {computer} 上新建一个文件夹 / New folder on {computer}: that computer (absent or
  // "local": the home) makes <Ducter folder>/projects/<name> (one folder name, never a path) and
  // the home adds it as a project, git or not. Answered with project_new_result.
  | { t: "project_new"; name: string; device?: string; clientId?: string }
  // The person chose where this computer's Ducter folder lives (settings › Where it runs): that
  // computer (absent or "local": the home) moves projects/ and worktrees/ there when no task is
  // running in it, repairs git's worktree paths, and keeps the choice. Answered with
  // folder_change_result.
  | { t: "folder_change"; path: string; device?: string; clientId?: string }
  // D272: 在 {computer} 上登录 GitHub / Sign in to GitHub on {computer}, through that computer's own
  // GitHub CLI. status: where it stands; start: a device-flow sign-in (answered with its code and
  // link, then, when it ends, signed in with the account, or why not); token: the fallback, a token
  // the person pasted (passed to gh on that computer only, never kept or logged); cancel. Every
  // answer is a git_login_state.
  // D345: install (the home only): gh isn't there; put it there (git_login_state installing, with
  // progress), then sign in as start does. for "todos": the sign-in is 待办来源's 连上 / Connect, so
  // once it is signed in the home adds GitHub as a source by itself (the same tap asked for it).
  | { t: "git_login"; action: "status" | "start" | "token" | "cancel" | "install"; device?: string; token?: string; clientId?: string; for?: "todos" }
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
  // D235: 用电脑 / Use the computer (computer-use.ts).
  | ComputerClientFrame
  // D276: 聊天软件 / Chat apps (channels.ts).
  | ChannelClientFrame
  // D285: 做过的事 / Past tasks (past.ts).
  | PastClientFrame
  // D383: 给你做的 / Made for you (made.ts).
  | MadeClientFrame
  | AppsClientFrame
  // D300: 替你做过的 / Done for you (did.ts).
  | DidClientFrame
  // D341: 待办来源 / To-do sources (task-sources.ts).
  | SourcesClientFrame
  // D360: a group of tasks that are one piece of work (task-groups.ts).
  | TaskGroupFrame
  // D454: 移走 / Remove a finished card or group from Tasks.
  | OnHandAwayFrame
  | HandsetClientFrame
  | { t: "browser_site_signout"; site: string }
  | { t: "browser_sites_clear" }
  // D154, `ducter browser check`: start Ducter's browser, load a page, quit. Answered with browser_check.
  | { t: "browser_check"; url?: string }
  // D191, 密码和银行卡 / Passwords & cards (Autofill in code): "saved" answers with a saved frame (names, last four, where used;
  // never a secret). saved_put adds or edits one (the one frame that carries a secret, once);
  // saved_remove deletes one (an id, or a detail key); saved_forget_site takes back a site's OK.
  | { t: "saved" }
  | { t: "saved_put"; item: SavedInput }
  | { t: "saved_remove"; id: string }
  | { t: "saved_forget_site"; id: string; site: string }
  // D233: 让任务向我要密钥 / Let tasks ask me for keys (on by default); answered with a saved frame.
  | { t: "saved_ask_keys"; on: boolean }
  // D539: Ducter 存着的密钥 / Keys Ducter keeps on one computer (names only): answered with kept_keys.
  | { t: "kept_keys"; device: string }
  | { t: "kept_key_remove"; device: string; env: string };

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
/** handset (D255): the Android app's own link while its phone is lent: no conversation, only handset frames. */
export type ClientKind = "desktop" | "web" | "cli" | "handset";

/** One place the New task card offers (D128). */
/** D203: one subfolder in a folder_browse_result: its name, its path there, and whether it is a git repo. */
export interface BrowseFolder {
  name: string;
  path: string;
  repo?: true;
  /** D455: a repo's origin, normalized (host/owner/repo). */
  remote?: string;
}

/** D455: the repo a listed folder is in (itself or a folder above it): adding there adds that repo. */
export interface BrowseRepo {
  root: string;
  name: string;
  remote?: string;
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
  /** Why that path (env: DUCTER_FOLDER set there, so it can't be changed from here; chosen: the person's). */
  why?: "env" | "chosen" | "data" | "default" | "fallback";
}

/** D272: where a computer stands with GitHub (git-login.ts), in words the clients put in their own language. */
export type GitLoginWhere =
  | "signed_in" // gh holds a login (account: who)
  | "signed_out" // gh is there, no login for github.com
  | "no_gh" // the GitHub CLI isn't on that computer
  | "code" // a sign-in is waiting for the person to enter `code` at `url`
  | "installing" // D345: gh is being put on the home (install: how and where; progress 0–100 when known)
  | "failed" // the sign-in didn't happen (reason)
  | "cancelled"
  | "offline" // the computer can't be reached (home side only)
  | "old"; // its Ducter is too old to sign in (home side only)

// D345: network: that computer couldn't reach GitHub; install: putting gh there failed;
// unsupported: there is no gh build Ducter can put on that system.
export type GitLoginWhy = "expired" | "denied" | "bad_token" | "network" | "install" | "unsupported" | "failed";

/**
 * D345: how the home would put gh there, said before the person taps 装上 gh / Install gh. brew:
 * with the Mac's own Homebrew; release: GitHub's own gh build, its checksum checked, into Ducter's
 * own folder (`where`): no administrator needed, nothing outside that folder changed.
 */
export interface GhInstallPlan {
  how: "brew" | "release";
  where: string;
}

/**
 * D345: a fine-grained token made for Ducter, its permissions filled in on GitHub's own page (the
 * token fallback's link): read and write issues, pull requests and code; metadata to read; 90 days.
 */
export const TOKEN_NEW_URL =
  "https://github.com/settings/personal-access-tokens/new?name=Ducter&description=Ducter%3A+issues+assigned+to+you%2C+pull+requests+and+clones&expires_in=90&contents=write&issues=write&pull_requests=write&metadata=read";

/** D272: one answer about a computer's GitHub sign-in. Never a token. */
export interface GitLoginState {
  state: GitLoginWhere;
  account?: string;
  code?: string;
  url?: string;
  reason?: GitLoginWhy;
  message?: string;
  /** D345: no_gh on the home: how it would be put there (absent: it can't be here). installing: how. */
  install?: GhInstallPlan;
  /** D345: installing: how far the download is, 0–100 (absent: not known, as with Homebrew). */
  progress?: number;
}

/** D204: why a clone didn't happen, in a word the clients put in their own language. */
export type CloneReason = "invalid" | "not_found" | "no_access" | "network" | "timeout" | "offline" | "old" | "failed";

/**
 * Why a computer's Ducter folder didn't move: a task is still running in it (tasks says which),
 * DUCTER_FOLDER is set there (the env wins), it can't be reached or its Ducter is too old, the
 * target already holds things, it is inside the folder or the folder is inside it, it would be
 * Ducter's own data, another move is running, or the move failed.
 */
export type FolderChangeReason = "tasks_running" | "env" | "offline" | "old" | "exists" | "inside" | "data" | "cross_device" | "busy" | "invalid" | "not_dir" | "failed";

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
  // D539: the keys Ducter keeps on that computer (names, where from, when; never a value).
  | ({ t: "kept_keys"; device: string; removed?: string } & import("./key-copy.ts").KeptKeysAnswer)
  // machine: a hash of the machine the main runs on (core/src/machine.ts); a client that computes
  // the same hash is on that machine, so the place paths it sees are its own.
  | { t: "welcome"; persona: string; personaName: string; headSeq: number; machine?: string; /** The home's Ducter version: a page built for another reloads (it would draw an older card). */ version?: string; /** D293: the home answers {t:"ping"} with {t:"pong"}, so a client may close a socket silent for 45 s. */ ping?: true; /** D293: the home's key fingerprint. */ fp?: string }
  | { t: "events"; events: LogEvent[] }
  | { t: "on_hand"; onHand: OnHand }
  // D284: a page of a task's stream, oldest first: the newest `limit` events, or those before
  // beforeSeq (echoed). more: older events remain (absent from a home before D284).
  // D320: with afterSeq (echoed), the page after it, and more: newer events remain.
  | { t: "task_history"; taskId: string; events: LogEvent[]; more?: boolean; beforeSeq?: number; afterSeq?: number }
  // D509: an older page of the conversation, oldest first, beforeSeq echoed; events superseded by a
  // newer one (a living message revised) are left out. more: older events remain.
  | { t: "channel_history"; events: LogEvent[]; beforeSeq: number; more: boolean }
  // D541: another partner's newest stretch (as "channel" events, oldest first); headSeq the Log's
  // head when read, more: older events remain. A hello with persona and its cursor carries on from it.
  | { t: "partner_peek"; persona: string; events: LogEvent[]; headSeq: number; more: boolean }
  // D320: the task's session index; fromSeq echoed: its turns from there on replace the client's.
  | { t: "task_index"; taskId: string; index: import("./session.ts").SessionIndex; fromSeq?: number }
  | { t: "mention_list"; id: string; items: import("./mentions.ts").MentionItem[] } // D534
  | { t: "slash_list"; id: string; taskId?: string; entries: import("./mentions.ts").SlashEntry[]; /** the task's agent, for the section's name */ harness?: string } // D534
  | { t: "sent"; taskId: string; delivered: Delivery; clientId?: string } // ack for task_send (D325: its clientId; "queued" = held, TaskCard.held)
  // ref: merge commit or PR URL. confirm (D142 undo): the folder changed after the task finished;
  // these would be lost (count, the first few paths).
  | { t: "action_result"; taskId: string; action: string; ok: boolean; message?: string; ref?: string; confirm?: UndoConfirm }
  | { t: "folder_changes"; taskId: string; changes: FolderChanges | null }
  | ({ t: "wb"; id: string; taskId: string } & ({ ok: true; answer: import("./workbench.ts").WbAnswer } | { ok: false; error: import("./workbench.ts").WbError; message?: string }))
  | ({ t: "file_open"; id: string } & ({ ok: true; file: MediaRef } | { ok: false; error: import("./media.ts").FileOpenError; message?: string }))
  // D566: the answer to mem_file_save (same id): kept (the settings frame's mem.files says so from
  // then on), or why not, in Mem's own words.
  | ({ t: "mem_file_save"; id: string; media: string } & ({ ok: true; saved: MemFileSaved } | { ok: false; why: MemFileWhy; message?: string; shared?: MemFileShared }))
  | { t: "devices"; devices: DeviceView[]; reach: Reach; updateAll?: UpdateAllView }
  // D293: the ways to reach the home and its key, right after the welcome and whenever they change.
  | { t: "ways"; ways: ReachWay[]; key?: string; fp?: string }
  | { t: "pong" }
  | { t: "ability_result"; device: string; ability: AbilityId; on: boolean; ok: boolean; reason?: AbilityReason; detail?: string }
  | { t: "anywhere_setup_result"; ok: boolean; taskId?: string; step?: AnywhereStepResult; reason?: AnywhereReason | "own_address" | "no_agent" | "running" | "not_home"; detail?: string }
  | { t: "pair_code"; code: string; expiresAt: string; address?: string; link?: string; qr?: string[] }
  | LendFrame
  | { t: "rename_result"; device: string; ok: boolean; name?: string; reason?: "unknown_device" | "empty" | "name_taken" | "home" }
  | { t: "disconnect_result"; device: string; ok: boolean; reason?: "unknown_device" | "home" }
  | { t: "update_result"; device: string; ok: boolean; reason?: UpdateReason; detail?: string; update?: DeviceUpdate }
  | { t: "agent_update_result"; device: string; harness: string; ok: boolean; reason?: AgentReason; detail?: string }
  // D363: an agent_setup the device couldn't take (away: not connected; unknown: no such device or agent).
  | { t: "agent_setup_result"; device: string; action: AgentSetupAction; ok: boolean; reason?: "away" | "unknown" | "failed" }
  // D366: a mem_setup the device couldn't take (away; unknown: no such computer; failed: its Ducter is too old for it).
  | { t: "mem_setup_result"; device: string; action: DeviceMemAction; ok: boolean; reason?: "away" | "unknown" | "failed" }
  // D377: a records_allow the device couldn't take (away; unknown: no such computer; failed: its Ducter is too old for it).
  | { t: "records_allow_result"; device: string; on: boolean; ok: boolean; reason?: "away" | "unknown" | "failed" }
  | { t: "update_all_result"; ok: boolean; reason?: "nothing" | "running" | "failed"; detail?: string; id?: string }
  | { t: "mem_plugin_result"; device: string; harness: string; ok: boolean; taskId?: string; reason?: MemPluginReason }
  // D480: the in-place choice for one agent's mailbox (mailbox.ts).
  | { t: "mailbox_look"; device: string; harness: string; look: MailboxLook }
  // D332: ownAgents: the AI agents the person runs themselves on the home (their own records changed in
  // the last 14 days, by file times alone; absent while looking at records is off): 和你的其他 agent 通信 / AI in
  // your terminal shows in Settings for them.
  | { t: "settings"; settings: Settings; mem: MemView; brainNow?: BrainNow; /** D536: with more than one partner. */ brainOptions?: BrainOption[]; forgot?: { seq: number; how: "mem" | "hidden" }; corrected?: { seq: number; how: "mem" | "here" }; undid?: { seq: number; ok: false }; bridge?: BridgeView; ownAgents?: ("claude-code" | "codex" | "pi")[]; helpers?: import("./helpers.ts").HelperView[] }
  // D321: what Mem found for Settings › 记忆's search (ok false: Mem didn't answer).
  | { t: "mem_found"; q: string; ok: boolean; items: MemItem[] }
  // D465: whether Nowledge Mem took the answer (ok false: it's back on the page, to settle in Mem).
  | { t: "mem_answered"; id: string; answer: MemCheckAnswer; ok: boolean }
  // D372: defaults: the built-in default per kind of work, when it differs between kinds.
  // D413: standing: what the person said Ducter may do without asking (不用问我的 / Without asking).
  | { t: "rules"; rules: RuleView[]; defaults?: KindDefault[]; standing?: StandingView[] }
  // D381: what is pinned in the default conversation, newest first; after the welcome and on every
  // change. refused (to the asking socket only): why a pin didn't happen (full: PINS_MAX already;
  // gone: no such block; kind: choices and the lend card aren't pinned).
  | { t: "pins"; pins: PinView[]; refused?: "full" | "gone" | "kind" }
  // D309: every partner on the home, the default first; shown: the one this socket's conversation is.
  // error (to the asking socket only): why a partner_add or partner_set didn't happen.
  | { t: "partners"; partners: import("./partners.ts").PartnerInfo[]; shown: string; clientId?: string; error?: "empty" | "long" | "taken" | "full" | "unknown" }
  | { t: "candidates"; taskId: string; candidates: Candidate[] }
  // D288: no usage: the agent doesn't share it (unsupported), isn't signed in, or the read failed.
  | { t: "account_usage"; harness: string; usage?: AccountUsage; why?: "unsupported" | "signed_out" | "unavailable" }
  | { t: "connections"; connections: ConnectionView[]; oo: OoDetect; ownPhone?: OwnPhoneView }
  // D218: an own-number step the home refused (number: not a full number; key: not a key; busy: a call is on).
  | { t: "own_phone_result"; ok: false; action: string; reason?: string }
  | { t: "connection_reads"; id: string; reads: ReadLine[] }
  | { t: "proactive_day"; day: ProactiveDay }
  | { t: "proactive_replay_result"; report?: import("./proactive.ts").ReplayReport; error?: string }
  | { t: "proactive_week_result"; report?: import("./proactive.ts").WeekReport; error?: string }
  | { t: "proactive_cross_result"; run?: import("./proactive.ts").ShadowRun; error?: string }
  | { t: "repairs_week_result"; report?: import("./mend.ts").RepairReport; error?: string }
  // D588: `ducter usage`: what the tasks used, answered on the asking socket only.
  | { t: "usage_days_result"; report?: import("./usage.ts").UsageReport; error?: string }
  // D627: `ducter move --to` / `--unfreeze`, answered on the asking socket only.
  | { t: "move_freeze_result"; move?: MoveState; error?: string }
  | { t: "move_status_result"; move?: MoveState; error?: string }
  | { t: "move_unfreeze_result"; move?: MoveState; error?: string }
  | { t: "worktrees_plan_result"; plan?: import("./tidy.ts").TidyPlan; error?: string }
  // D242: a fresh key per id the home holds (ids it doesn't hold are left out). Not "keys": the saved frame's.
  | { t: "media_keys"; mediaKeys: Record<string, string> }
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
  // D272: the folder made (or the one already there of that name: existed), as the card's place; or why not.
  | { t: "project_new_result"; ok: boolean; clientId?: string; device?: string; place?: PlaceChoice; existed?: true; reason?: "invalid" | "offline" | "old" | "failed"; message?: string }
  // The Ducter folder moved (or why not): its old and new absolute paths, what went with it, and
  // the tasks that kept it from moving (tasks_running; run it again when they are done).
  | { t: "folder_change_result"; ok: boolean; clientId?: string; device?: string; from?: string; path?: string; projects?: number; worktrees?: number; repaired?: number; tasks?: { taskId: string; title: string }[]; reason?: FolderChangeReason; message?: string }
  // D272: where that computer stands with GitHub (git-login.ts): signed in as account, signed out,
  // no GitHub CLI, a sign-in waiting for code at url, or why it failed. Never a token.
  | ({ t: "git_login_state"; clientId?: string; device?: string; host: "github.com" } & GitLoginState)
  // D203: path is the folder listed (real, absolute), home that computer's home folder, parent the
  // folder above (absent at home); folders repos first (at most 200; more: there were more).
  // D455: inRepo, the repo the listed folder is in (adding adds it); roots, the folders that
  // computer allows when it sets more than its home folder (DUCTER_FOLDER_ROOTS, set there).
  | { t: "folder_browse_result"; ok: boolean; clientId?: string; device?: string; path?: string; home?: string; parent?: string; folders?: BrowseFolder[]; more?: true; inRepo?: BrowseRepo; roots?: string[]; reason?: "outside" | "not_found" | "offline" | "old" | "failed"; message?: string }
  // Show this task (the app opens it, Esc returns). open_result answers the sender: apps = how many apps were told.
  | { t: "open_task"; taskId: string }
  | { t: "open_result"; taskId: string; ok: boolean; apps: number; message?: string }
  // D149: the empty conversation's words, after each app's hello (never to a CLI).
  | { t: "first_screen"; first: FirstScreen }
  | { t: "key_add_result"; clientId: string; result: KeyResult }
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
  | ComputerServerFrame
  | HandsetServerFrame
  | ChannelServerFrame
  | PastServerFrame
  | MadeServerFrame
  | AppsServerFrame
  | DidServerFrame
  | SourcesServerFrame
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
  /** D298: the home may look at this computer's AI agents' own records for its first words (off after 别再看了). */
  looks?: boolean;
  /** D298: nothing on the home can think yet (no agent signed in, no key): the clients offer to paste a key. */
  noBrain?: boolean;
  /** D440: with nothing to think with, the fastest ways to a key from where the home is (key-routes.ts), best first. */
  keyRoutes?: import("./key-routes.ts").KeyRoute[];
  /** D307: the agents whose own conversations Past tasks doesn't show (D299's 不再显示), for Settings' way back. */
  outsideHidden?: import("./past.ts").OutsideAgent[];
  /** D327: folders the person left out (这个文件夹别看了), `~/…`: neither the first words nor Past tasks read them. */
  outsideFolders?: string[];
  /** D327: the computer whose agents' records these are (the home's name). */
  computer?: string;
  /** D327: the person already said "look" and was answered: the first words' look start goes. */
  lookDone?: true;
}

/**
 * D298: one thing the first words offer. A tap fills the composer with `draft`; it never sends.
 * from: whose records it came from (the person's own Claude Code or Codex), or an everyday example.
 */
export interface FirstStart {
  id: string;
  words: string;
  draft: string;
  // D327: "look" is the one start that doesn't fill the composer: its tap is the person's yes to
  // looking at their own agents' records (local_agents_look), answered by the home at once.
  from: "claude-code" | "codex" | "pi" | "everyday" | "look";
  /** D327: how I know, for a start from the records: the folder it was read for (`~/…`) and when that session last changed. */
  path?: string;
  at?: string;
}
export interface FirstWords {
  starts: FirstStart[];
  /** The agents whose records were read for these words (the clients say so, with 别再看了). */
  looked?: ("claude-code" | "codex" | "pi")[];
  /** D327: the computer whose records they were (the home's name), so no screen says "this computer" for another one. */
  computer?: string;
  /** D327: the person said to stop looking: what came from the records was forgotten (the starts are gone from the Log). */
  forgot?: true;
  /** D327: the home's answer to the person's "look" tap (not the first words themselves: no clay face over it). */
  look?: true;
}

/**
 * The step of a partner turn the user is waiting on, as a plain verb the client words (D104).
 * Mapped from the partner's own tool calls; tool names never reach a client.
 * thinking: no tool yet · recalling: reading the Log or memory · checking_task: reading a task ·
 * opening_task: starting one · messaging_task: passing something to one · planning: setting a
 * reminder or an ask · looking: any other lookup · web (D380): a quick web look is out, after
 * the turn that asked for it ended too, until its answer is said.
 */
export type ActivityStep = "thinking" | "recalling" | "checking_task" | "opening_task" | "messaging_task" | "planning" | "looking" | "web";
export interface PartnerActivity {
  step: ActivityStep;
  since: string; // ISO: when the turn started
  stepSince: string; // ISO: when this step started
  /**
   * D425: the step's object in the person's own words, when they already know it: the task's
   * title (checking_task, messaging_task, opening_task), the question of a quick web look (web).
   * Never a tool's name, a path, or what was read. Older clients ignore it.
   */
  about?: string;
  /** D425: where a `looking` step looks, named without what it finds. */
  source?: "calendar" | "todos" | "accounts";
}

export type Delivery = "steered" | "prompted" | "queued";

/** D380: why a quick web look didn't settle its fact (the partner hands it to a browsing task). */
export type WebLookWhy = "time" | "conflict" | "page" | "sign_in" | "not_found" | "unavailable" | "failed";
/** D380: one quick web look, as the Log keeps it. Every field from the web is clipped and typed by Ducter. */
export interface WebLook {
  lookId: string;
  question: string;
  state: "looking" | "found" | "unsettled";
  /** found: the fact, at most WEB_LOOK_MAX chars, in the person's language. */
  answer?: string;
  /** found: where it was read (http(s) addresses, at most 3). */
  sources?: string[];
  confidence?: "high" | "medium" | "low";
  why?: WebLookWhy;
  /** The user message it answers. */
  replyTo?: number;
  harness?: string;
  model?: string;
  /** How long it took, start to result. */
  ms?: number;
}
export const WEB_LOOK_MAX = 200;

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
 * env_off: DUCTER_BROWSER=0 pins it off; home_only: only on the device Ducter runs on;
 * no_address: nothing outside can reach this Ducter yet (remote). D151, Ducter's own browser on a
 * server: browser_deps = system libraries are missing and Ducter can't install them (not root):
 * detail is the one command to run; browser_sandbox = the system stops Chrome's sandbox for a
 * normal user (Ubuntu 23.10+ AppArmor) and detail is the one command that allows it for Ducter's
 * Chrome only (D172); browser_failed = the install or the first start failed (detail).
 * D157: worker_old = the Ducter on that computer is from before workers browsed (update it there);
 * offline = that computer can't be reached right now to change it.
 * D199: signed_out = 打电话 is on (a calling connection is there) but its sign-in is gone: the
 * phone card in Accounts signs in again.
 * D228: own_address = 从外面连 is the person's own address (D143's domain), not a switch here.
 * D217: phone_unsupported = Ducter's phone can't run on this computer yet (phase 1: Apple
 * Silicon Macs; detail says why); phone_failed = installing or starting it failed (detail).
 * D235: computer_permissions = 用电脑 is added but macOS hasn't given cua-driver Accessibility or
 * Screen Recording yet (perms says which); the person turns them on in System Settings.
 */
export type AbilityReason = "own_address" | "cua_missing" | "cua_old" | "env_off" | "home_only" | "no_address" | "unknown_device" | "failed" | "browser_deps" | "browser_sandbox" | "browser_failed" | "worker_old" | "offline" | "signed_out" | "phone_unsupported" | "phone_failed" | "computer_permissions";

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
  /** D503: a fingerprint of the signed-in account (never the email): the same one on two computers is one limit. */
  account?: string;
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
  /** D363: Ducter can put this agent on that device from here (安装 / Install) while it isn't there. */
  installable?: boolean;
  /** D363: putting it there now, or why the last try didn't (absent when idle). */
  setup?: AgentSetupState;
  /** D363: its sign-in running on that device now, or how the last one ended (absent when idle). */
  login?: AgentLoginState;
  /** D416: why it can't run here although something of it is there (absent: nothing in the way). */
  trouble?: AgentTrouble;
}

/**
 * D416: what stands between an agent that is partly there and a task on it:
 *  - too_old: its command line is below the version OAR needs (`need`; `version` says what it is);
 *    安装 updates that copy with its own updater;
 *  - broken: its command line is there but doesn't answer (a damaged file); 安装 puts a fresh one there;
 *  - app_only: only its desktop app (`app`) is there, which carries no command line (or only a
 *    link an older app left, pointing at nothing); 安装 puts the command line beside it;
 *  - coming (D625): an older home's Ducter cannot run it yet; said as 即将支持 / Coming soon,
 *    never a crash. This build runs Dim (OAR 0.138.0 exports createDimRuntime); the kind stays
 *    so a newer client reads an older home's row without guessing.
 *  - node_old (D630): the runtime needs a newer Node than the one the probe read (`have`,
 *    `need` the floor, `via` where it came from: Ducter's own tools folder, or the system's).
 *    Ducter can update its own Node through the same install flow; it says nothing about updating
 *    Ducter itself, which would point at the wrong thing.
 */
export type AgentTrouble = { kind: "too_old"; need: string } | { kind: "broken" } | { kind: "app_only"; app: string } | { kind: "root" } | { kind: "coming" } | { kind: "node_old"; need: string; have: string; via: "ducter" | "system" };

/** D363: what an agent_setup asks of a device. */
export type AgentSetupAction = "install" | "login" | "code" | "cancel" | "look" | "logout";
/** D363: why putting an agent on a device didn't work: no network, no room, no build for that computer, anything else. */
export type AgentSetupReason = "network" | "space" | "unsupported" | "failed";
/** D363: queued: waiting its turn; installing: being put there; failed: one line and 再试一次. */
export interface AgentSetupState {
  phase: "queued" | "installing" | "failed";
  /** While installing: how far, 0–100, when it can tell (the first one downloads Node, the slow part). */
  pct?: number;
  reason?: AgentSetupReason;
  /** A short line from the installer when it failed (never a secret). */
  detail?: string;
}
/**
 * D363: an agent's own sign-in, run on that device and shown wherever the person is.
 *  - starting: started, its link not out yet;
 *  - waiting: the link (and Codex's code) to open on any device; `paste`: Claude's page gives a
 *    code to paste back here;
 *  - checking: the pasted code went in, or (D518) its sign-in ended and Ducter is asking the agent
 *    itself whether it is signed in now;
 *  - done: (D518) the agent's own check says signed in; the row reads ready at once;
 *  - failed / expired: one line and 再试一次; reason device_off: Codex's device sign-in is off in
 *    the ChatGPT account (turn it on there first); D518 not_seen: its sign-in ended but the agent's
 *    own check still says signed out; no_answer: a pasted code got no answer in time;
 *  - `until` (D518): when a waiting sign-in stops by itself (ms since the epoch);
 *  - terminal: this agent has no sign-in Ducter can carry (pi): `command` is what to run there.
 */
export interface AgentLoginState {
  /** D416: signing_out: the agent's own sign-out is running there (Antigravity's, HarnessInfo.signOut). */
  state: "starting" | "waiting" | "checking" | "done" | "failed" | "expired" | "terminal" | "signing_out";
  url?: string;
  code?: string;
  paste?: boolean;
  /**
   * D371: DeepSeek Harness signs in with a DeepSeek API key pasted here (`url`: where one is
   * made), and, on a Mac with its app, `app` names the app Ducter just opened there to sign in
   * with the DeepSeek account. The row turns signed in whichever way it happens.
   */
  key?: boolean;
  app?: string;
  /** wrong_key: DeepSeek didn't take the key; no_balance: it did, with nothing left; offline: DeepSeek couldn't be reached from there. */
  /** D416: signout_failed: its own sign-out ran and it still reads signed in. */
  reason?: "device_off" | "wrong_code" | "wrong_key" | "no_balance" | "offline" | "failed" | "signout_failed" | "not_seen" | "no_answer";
  command?: string;
  until?: number;
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
  version?: string; // installed, update: the version the check read
  /** D466: update: the newer version Mem's own `plugins check` offers (from version to this). */
  available?: string;
  why?: MemPluginWhy; // review
  /** D466: review "multiple": each copy's version the check read, oldest first (two copies: two versions). */
  versions?: string[];
  /** A setup task for it is open right now (its id). */
  taskId?: string;
  /** D375: Mem's own `nmem connect --tool` is putting it in right now (no task); D552: or its setup task is being opened. */
  busy?: true;
  /** D375: just put in by Mem's own command: the agent uses it once restarted. */
  fresh?: true;
  /** D552: a setup task just updated it (installed, at `version`): said until the next check. */
  updated?: true;
  /** D597: Ducter's direct update didn't take, so a task finishes it (`taskId`): said while that task runs. */
  handed?: true;
  /** D597: the direct update didn't take and no task could pick it up: said while a newer one is still out (until the next tap), and 更新 stays. */
  stuck?: true;
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
/** The desktop app an `app` copy rides in, by agent (harness-facts channels app.name; D371: DeepSeek Harness's own). */
export function agentAppName(harness: string): string {
  return harness === "claude-code" ? "Claude" : harness === "deepseek-harness" ? "DeepSeek Harness" : "Codex";
}
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
export type AgentReason = "how" | "offline" | "running" | "busy" | "network" | "no_update" | "unverified" | "version" | "signed_out" | "unchanged" | "interrupted" | "timeout" | "stopped" | "failed";
// D362: timeout: the download or the updater ran past its limit (or the download stopped moving)
// and was stopped, the old version still in place; stopped: the person tapped 停止 on a slow one.

/**
 * D362: what an updater does now, inside phase "updating": downloading (Ducter fetches the new
 * copy into the channel's own cache first, the installed one untouched; got/size in bytes, size
 * absent when the source doesn't say) or installing (the channel's own updater puts it in place).
 * Absent: a channel Ducter can't see inside (its updater downloads and installs in one go).
 */
export type AgentStep = "downloading" | "installing";

/** D362: the live part of a running agent update, the same on a device card's row and an Update all step. */
export interface AgentProgress {
  step?: AgentStep;
  got?: number;
  size?: number;
  /** ISO, when the updater began (the elapsed time counts from here). */
  since?: string;
  /** After this long since `since`, it is slower than usual there (3x its usual time, else 4 min). */
  slowMs?: number;
}

export interface AgentUpdate extends AgentProgress {
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
  /** computer (D235): macOS's two switches for cua-driver on that Mac, as it last said. */
  perms?: ComputerPerms;
}

export interface DeviceView {
  id: string; // "local" for the machine Ducter runs on; else the paired device id
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
  /** D293: how a connected worker reaches the home now. */
  via?: DeviceVia;
  /**
   * D366: Nowledge Mem on this computer for tasks, as that computer says it: only on a worker, only
   * while memory is on and the home's Mem is connected; absent on an older worker (it says nothing).
   */
  mem?: DeviceMemView;
  /**
   * D377: the person's own AI agents' records on this computer for tasks (its Claude Code, Codex and
   * pi sessions, D327 (9)): whether that computer lets the partner look, and which agents kept
   * records there (by file times alone). Only on a worker that says it, only while looking is on
   * at the home (Settings, 读它们留下的记录), only when it has records or said yes.
   */
  records?: DeviceRecordsView;
  /** D514: the working copies Ducter tidied away on this computer so far, and the room it freed (its card's quiet line). */
  tidied?: { count: number; bytes: number };
  /**
   * D538: what Ducter measured on this computer itself (the home's own look; a worker's heartbeat),
   * never asked of the person. Absent from a worker before D538.
   */
  resources?: DeviceResources;
  /**
   * D204 (the person's choice): this computer's Ducter folder, with why it is that path. env means
   * DUCTER_FOLDER is set there, so Settings can't move it; chosen is the path the person picked.
   */
  folder?: { path: string; why?: "env" | "chosen" | "data" | "default" | "fallback" };
}

/**
 * D538: a computer's own measurements, in bytes. memFree: what programs can still take now (Linux
 * MemAvailable; on a Mac free, inactive, purgeable and speculative pages). diskFree: the disk Ducter's
 * folder is on. cpu: the processor's own name; gpu: a graphics card Ducter can name (nvidia-smi).
 * oom: the times the kernel stopped a program there for memory in the last day (Linux: the service's
 * own cgroup), newest last.
 */
export interface DeviceResources {
  at: string;
  memTotal: number;
  memFree: number;
  cores: number;
  load?: number;
  swapTotal?: number;
  diskFree?: number;
  diskTotal?: number;
  cpu?: string;
  gpu?: string;
  oom?: string[];
}

/**
 * D377: unasked: nobody said yes on that computer yet; on: the person said 读它们留下的记录 / Read
 * what they keep there; off: they said 别再看了 / Stop looking there.
 */
export type DeviceRecordsState = "unasked" | "on" | "off";
export interface DeviceRecordsView {
  state: DeviceRecordsState;
  /** The agents with a session there, and when each last wrote one (file times alone; nothing inside is read). */
  agents: { agent: import("./past.ts").OutsideAgent; lastAt: string }[];
}

// ---------- Nowledge Mem on a computer for tasks (D366, design/memory.md "Mem on a computer for tasks") ----------

/** D366: what a mem_setup asks of a computer. */
export type DeviceMemAction = "install" | "connect" | "look"; // look: D375, read Mem's doctor there again
/**
 * D366: why the last step didn't work. network / space / unsupported: putting the command line
 * there (no internet, no room, no build for that computer); bad_link: not a connect link (refused
 * before anything ran); used: Mem says the link was used or expired (one uniform answer, 410);
 * unreachable: the link's Mem couldn't be reached from that computer; refused: Mem turned the sign-in down
 * (401/403, D370); failed: anything else (detail).
 */
export type DeviceMemReason = "network" | "space" | "unsupported" | "bad_link" | "used" | "unreachable" | "refused" | "old" | "failed"; // old: D386, the nmem there can't sign in (nothing was sent)
/**
 * D366: absent: no Mem command line there; sign_in: it's there, not signed in to a Mem it can
 * reach (Mem's own `nmem doctor`); ready: signed in, its check passes. `agents`: the AI agents
 * there Mem's check says are connected to it (harness ids). `step`: installing or connecting
 * now, or how the last try ended (failed), absent when idle.
 */
export interface DeviceMemView {
  state: "absent" | "sign_in" | "ready";
  /** Ducter can put Mem's command line there itself (it has a build for that computer). */
  installable?: boolean;
  version?: string;
  agents?: string[];
  step?: { phase: "installing" | "connecting" | "failed"; pct?: number; reason?: DeviceMemReason; detail?: string };
  /** D375: Mem's own health there (its doctor), when it says something is wrong; absent on an older worker. */
  health?: MemHealth;
  /** D375: Mem's command line there is Ducter's own copy (its tools folder), so Ducter can update it. */
  ours?: true;
  /**
   * D386: the person's own nmem there (first on its PATH) is too old to sign in (no `doctor`, no
   * `connect`: the old Python CLI). Ducter never changes it: it puts its own current copy in its
   * tools folder (install) and uses that one there, for its own steps and its tasks. `how`: how the
   * person updates theirs, when its install says (pipx, uv, pip).
   */
  theirs?: { old: true; how?: "pipx" | "uv" | "pip" };
  /**
   * D393: the home carries Mem to the tasks there from its own one connection (core/src/mem-relay.ts):
   * they remember with nothing set up there. What this computer's own Mem says (absent, sign_in)
   * then concerns only the person's own sessions there, offered quietly, never required.
   */
  carried?: true;
}

// ---------- Updating in place (D148, design/system.md "Updating in place") ----------

/**
 * self: a Linux `ducter` that updates itself (the server bundle). app: a Mac whose ducter lives
 * in Ducter.app; the app's own updater does it (D72). source: run from a checkout (git pull).
 */
export type UpdateHow = "self" | "app" | "source" | "manual"; // manual: a Ducter too old to update from here (before 0.0.4): run the installer there once
/** 在下载 · 在核对 · 等正在做的任务停好 · 在重启 · 回来了 · 没更新成 */
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
/** D329: mem is the home's own Nowledge Mem command line (`nmem`), updated from its own source (D229). */
export type UpdateAllKind = "ducter" | "agent" | "mem";
/**
 * queued: not started (it waits for what comes before it); waiting: at its safe point, until the
 * tasks using it there pause (busy says how many), never cutting them off; running: updating
 * (phase says the step); done; failed (reason, rolledBack); skipped (reason: home = the home
 * didn't update, so this computer stays with it; offline; stopped = 停止剩下的).
 */
export type UpdateAllState = "queued" | "waiting" | "running" | "done" | "failed" | "skipped";
export type UpdateAllBy = "user" | "cli" | "night";

export interface UpdateAllItem extends AgentProgress {
  key: string; // "ducter:<device>" | "agent:<device>:<harness>" | "mem:local"
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
 * D228: 从外面连 / From outside on the home: an address from outside. how: own = an address
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
  /** handset (D238): 用这台手机 / Use this phone on that phone (an Android app's card only). */
  /** shape (D263): a phone, tablet or foldable, as it last said (absent from a home before D263: clientShape reads the name). */
  clients: { id: string; name: string; platform: string; connected: boolean; lastSeen?: string; form?: "cli" | "app"; computer?: string; handset?: HandsetView; shape?: ClientShape; via?: DeviceVia }[];
  /** D293: every way to reach the home, with up or down, and its key (a home before D293 sends neither). */
  ways?: ReachWay[];
  home?: HomeKey;
}

// ---------- A handheld's shape (D263) ----------

/** What a phone-like client is shaped like, for its clay: an iPad or Android tablet, a book-style foldable (Pixel Fold), else a phone. */
export type ClientShape = "phone" | "tablet" | "foldable";
export const CLIENT_SHAPES: readonly ClientShape[] = ["phone", "tablet", "foldable"];

/**
 * A shape from a model name as Android or a browser names it ("Pixel Fold", "SM-F946B", "Pixel
 * Tablet", "iPad"); undefined when the name says nothing. Only book-style folds are foldables: a
 * flip (Galaxy Z Flip, Razr) opens into a phone.
 */
export function shapeOfModel(model: string | undefined): ClientShape | undefined {
  const m = (model ?? "").trim();
  if (!m) return undefined;
  // Flips fold top to bottom into a phone (Galaxy Z Flip SM-F7xx, razr, Magic V Flip, Find N Flip, vivo X Flip, MIX Flip).
  if (/\bflip\d*\b|razr|SM-F7\d\d/i.test(m)) return "phone";
  // Book-style folds and dual screens: Pixel Fold, Galaxy Z Fold (SM-F9xx), Find N, Magic V, Mate X,
  // OnePlus Open, vivo X Fold, Xiaomi MIX Fold, Tecno Phantom V Fold, Surface Duo, a future iPhone Fold.
  if (/\bfold\b|Fold\d|SM-F9\d\d|\bFind N\d?\b|Magic ?V\d?\b|Mate ?X|OnePlus Open|X ?Fold|MIX ?Fold|Phantom ?V|Surface Duo|iPhone ?Duo/i.test(m)) return "foldable";
  if (/\biPad\b|\btablet\b|\bTab\b|\bPad\b|MatePad|SM-[TXP]\d|Nexus (7|9|10)\b/i.test(m)) return "tablet";
  return undefined;
}

/**
 * What a browser can tell of its screen beyond the user agent (D317): the Viewport Segments API
 * (`viewport.segments`, or the CSS `horizontal-/vertical-viewport-segments` queries) counts more
 * than one segment on a dual screen or a fold spanned across; the Device Posture API
 * (`navigator.devicePosture.type`) says "folded" only on a foldable bent open.
 */
export interface BrowserScreenHints {
  segments?: number;
  posture?: string;
}

/**
 * The shape a browser page knows of its own device (D317). First what Ducter's own app says it is
 * (`DucterShape/...` in its user agent: Android from its hinge, iOS from its size class); then the
 * screen itself (more than one viewport segment, or a "folded" posture: a foldable, whatever its
 * name); then the Android model in the user agent; an iPad (also Safari's "Macintosh" with a touch
 * screen, D176); an Android screen 600 px or more on both sides (a tablet). Else a phone.
 */
export function shapeFromBrowser(ua: string, touch: number, screen: { width: number; height: number }, hints: BrowserScreenHints = {}): ClientShape {
  const said = /DucterShape\/(phone|tablet|foldable)\b/.exec(ua)?.[1] as ClientShape | undefined;
  if (said) return said;
  if ((hints.segments ?? 1) > 1 || hints.posture === "folded") return "foldable";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return "tablet";
  // An iPhone 600 px or more on its short side is an iPhone Duo's inner screen (research/111).
  if (/iPhone/.test(ua) && Math.min(screen.width, screen.height) >= 600) return "foldable";
  if (/Android/.test(ua)) {
    const model = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/.exec(ua)?.[1];
    const byModel = model && model !== "K" ? shapeOfModel(model) : undefined;
    if (byModel) return byModel;
    if (Math.min(screen.width, screen.height) >= 600) return "tablet";
  }
  return "phone";
}

/**
 * A client's shape as the apps draw it: its Android app's hinge (D317), then the model it reported, else
 * what it said of itself, else an "iPad …" name (D176), else a phone.
 */
export function clientShape(c: { name: string; shape?: ClientShape; handset?: { state?: { model?: string; foldable?: boolean } } }): ClientShape {
  return (c.handset?.state?.foldable ? "foldable" : undefined) ?? shapeOfModel(c.handset?.state?.model) ?? (c.shape && CLIENT_SHAPES.includes(c.shape) ? c.shape : undefined) ?? (/^iPad\b/.test(c.name) ? "tablet" : "phone");
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

/**
 * How the partner talks: "auto" (跟着我 / Follow me) follows the language of the user's message;
 * otherwise a BCP 47 tag it always replies in ("zh", "en", "ko", "zh-Hant", …; D292).
 */
export type TalkLanguage = "auto" | LangTag;

export interface QuietHours {
  start: string; // "23:00", local to tz
  end: string; // "08:00"
  tz: string; // IANA zone
}

export interface Settings {
  name: string; // the partner's name (default "Ducter")
  language: TalkLanguage;
  memory: boolean; // remember things in Nowledge Mem (off: no recall, no saving)
  /** D348: memory is held off for this run by the home's start (DUCTER_MEMORY=off): the switch can't turn it on. Clients never set it. */
  memoryPinned?: boolean;
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
   * D165: 发现了就说 / When it notices something. D250: a current core always sets it: never
   * chosen is 每天最多 3 条 (proactiveBy "default"). Absent only from a core before D250.
   */
  proactive?: ProactiveMode;
  /** D250: where the mode came from (absent: chosen before the source was kept). Clients never set it. */
  proactiveBy?: ProactiveSource;
  /** D170: who of the user's other agents may reach the partner (through Nowledge Bridge). */
  peers?: PeersSettings;
  /** D297: when an agent's usage limit runs out, hand the task to another signed-in agent at once instead of waiting for the reset. Off by default; chosen on the task's own limit card. */
  limitHandoff?: boolean;
  /** D566: 做好的文件也存进 Nowledge Mem / Also keep files I make in Nowledge Mem: a finished task's reports and documents go to Mem by themselves. Off by default. */
  memFiles?: boolean;
  /**
   * D451: the first-time lines already met, on any device (first-meet.ts names them). A patch's names
   * are added, never removed; an empty list in a patch starts them over (Settings › Look and sound).
   */
  met?: FirstMeet[];
  /**
   * D505 (rev.): sites whose sign-ins go straight to the person's own Chrome on their Mac (换过去 / Move it
   * there on the first sign-in card, remembered). Added only by that Go; a patch can only take sites
   * out (Settings › 上网 / Web, 移除 / Remove), and a site taken out asks again next time. Absent: none.
   */
  chromeSites?: string[];
  /** D510: 新任务默认 / New tasks start: where and who every new task starts with unless its words, a rule or what it needs say otherwise. Absent (or a field absent): Ducter picks. */
  newTasks?: NewTasks;
  /**
   * The Ducter folder the person chose for each computer, by device id ("local" for the home).
   * Kept on the home; the computer itself gets the path (and keeps it in its data folder), while
   * DUCTER_FOLDER still wins there. Absent: the system's own name (~/Ducter on a Mac, ~/ducter elsewhere).
   */
  folderPaths?: Record<string, string>;
}

/**
 * D510: the person's standing default for new tasks, set in Settings › Partner or by saying it
 * (the partner's new_tasks tool). where: a computer that runs tasks ("local" for the home, else a
 * worker's device id), preferred whenever it can do the task and can be reached; agent: an AI
 * agent preferred whenever it is signed in where the task runs. A pin in the moment, a rule for a
 * kind of work, and what the task needs (the person's Chrome, a Mac app, the only copy of a folder)
 * come first. A patch replaces the whole object; {} clears it.
 */
export interface NewTasks {
  where?: string;
  agent?: HarnessId;
}

/**
 * D332 (supersedes D170's three-way reach): Settings › 和你的其他 agent 通信's one switch. reach "own": on, the
 * person's own agents reach the partner (the default; the persona has only the Only me mailbox, so
 * there is nobody else); "off": off, the connection revoked. A stored "team" reads as "own". trusted:
 * own agents whose work starts without asking (X2, a learned rule, never a setting). muted: agents the
 * person stopped listening to (不再听它的; each shows one row with 恢复).
 */
export interface PeersSettings {
  reach: "own" | "off";
  trusted: string[];
  muted: string[];
  /**
   * D334: teammates' agents the person said 答应 / Let it to on their first message's card (by the
   * sender as Ducter names it, "reviewer (dev team)"): their messages come through as questions,
   * under the teammate rules. 不理 / Ignore puts the sender in muted instead. Absent: none yet.
   */
  allowed?: string[];
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
  /** D536: how hard it thinks (one of the model's own levels, ListedModel.efforts); absent: the model's own default. */
  effort?: string;
}

/**
 * D536: one agent a partner may think with on the home, with its models as the default card lists
 * them (brainNow's rows, each with its effort levels where the agent's live list names them). Sent
 * in the settings frame while the home has more than one partner, so each partner's 想事情用 picker
 * offers only what the home has.
 */
export interface BrainOption {
  harness: HarnessId;
  models: BrainNow["models"];
}

/**
 * What the partner thinks with right now (D150): settings.brain, unless the user never chose one and
 * Claude Code isn't signed in on the home, when core runs it on the first signed-in AI agent of
 * PARTNER_FALLBACK instead (why: "only_codex" for Codex, "only_signed_in" for the others, D177).
 */
export interface BrainNow extends Brain {
  /** auto: the user never chose; core picked it. why: the reason when it isn't the setting
   *  ("held": D435, its own agent is held and this one answers meanwhile). */
  auto: boolean;
  why?: "only_codex" | "only_signed_in" | "held";
  /** D435: the agent it thinks with ran out (or its turns fail) and is held until it comes back. */
  held?: BrainHeld;
  /** D449: it thinks on a free key: about how many requests are left today, and when the day comes back. */
  budget?: import("./free-budget.ts").FreeBudget;
  /**
   * The models it may think with on the home: the agent's own live list where core has read it
   * (D202's catalog, the one the task composer shows), else the home's listed ones, else Ducter's
   * tier table; none: its own default. kind: from the tier table, absent for a model the table
   * doesn't know (D390: never guessed from a live list's order). default: what the agent runs
   * when no model is named.
   */
  models: { id: string; label: string; kind?: "smart" | "fast"; default?: true; /** D536: its effort levels, from the live list (absent: none to pick). */ efforts?: string[]; defaultEffort?: string }[];
}

/**
 * D435: the partner's own agent hit its usage limit, a throttle, or turns that fail, and core holds
 * it until it is tried again. While held, the next signed-in agent that may be the partner answers
 * (BrainNow.harness); with none, messages wait (waits) and are answered at `until`, in order.
 */
export interface BrainHeld {
  /** The agent that is held: what it thinks with again from `until`. */
  from: HarnessId;
  /** quota: out of credit; rate_limited: throttled; error: its turns fail. */
  why: "quota" | "rate_limited" | "error";
  /** When it is tried again, ISO: the reset when resetKnown, else Ducter's next try. */
  until: string;
  resetKnown: boolean;
  /** No other agent can answer now: messages sent meanwhile are answered at `until`. */
  waits?: true;
  /** D449: the cap is a free tier's (OpenRouter's free models, Gemini's free tier): said with the provider's name and its own reset. */
  free?: import("./free-budget.ts").FreeProvider;
}

export type SettingsPatch = Partial<Settings>;

/** What the partner remembers, as far as this Ducter can tell. */
export interface MemView {
  /** connected: Nowledge Mem answers; missing: not installed or not connected; off: switched off. */
  state: "connected" | "missing" | "off";
  /** Recent 记下了 / Noted lines from the conversation, newest first, without forgotten ones. */
  noted: { seq: number; title: string; at: string; memoryId?: string; confirmed?: boolean; corrected?: boolean }[];
  /** D304: the 想起了 / Remembered lines the person had it forget (their seqs): the conversation stops showing them. */
  forgotten?: number[];
  /** D329: the Noted lines taken back with 撤销 / Undo (their seqs): each reads 不记了 / Not kept. */
  undone?: number[];
  /** D329: the Noted lines still waiting in the outbox for Nowledge Mem to answer again (their seqs). */
  waiting?: number[];
  /** The name its memories are kept under in Mem (D141): the persona's AI Identity, once bound. */
  keptUnder?: string;
  /**
   * D295: a glance at Mem itself, when it answers: how many memories it holds, and the latest ones the
   * person's other AI tools saved there (titles only; from: the tool's own name, "Claude Code").
   */
  glance?: MemGlance;
  /** D375: Mem's own health on the home (its doctor), once read; {} = all well. */
  health?: MemHealth;
  /** D465: what Nowledge Mem would like the person to settle, and the rules every connected tool follows. */
  check?: MemCheck;
  /** D566: the files kept in the person's Mem, by media id (every version Ducter saved), the newest 500. */
  files?: Record<string, MemFileSaved>;
  /** D566: the last file the Settings default didn't keep, and why (said once under its row; gone after the next one is kept). */
  fileTrouble?: { name: string; why: MemFileWhy; message?: string; at: string };
}

/**
 * D566: one file Ducter kept in the person's Nowledge Mem. uri: Mem's own stable reference
 * (nowledgemem://source/<id>), which the Nowledge Mem app opens; rev: the version this file is;
 * web: Nowledge Mem on the web, where the person's Mem is its Cloud.
 */
export interface MemFileSaved {
  uri: string;
  rev: number;
  at: string;
  web?: string;
}

/**
 * D566: why a file wasn't kept in Mem, from Mem's facts (D563), never guessed. off: memory is off;
 * missing: no Nowledge Mem on the home; signed_out: Mem refused the sign-in; unreachable: Mem didn't
 * answer; secret: the file holds what looks like a key or password (it stays in Ducter); gone: the
 * file is no longer on the home; refused: Mem said no; no_space (D572): Mem needs a Space and names
 * none of the person's as theirs or as its write target; shared_space (D575): Mem's write target is a
 * Space others read, so the person chooses first (MemFileShared). message: Mem's own words, clipped, shown
 * only on demand behind 原话 / Its words (D572), never as the line itself.
 */
export type MemFileWhy = "off" | "missing" | "signed_out" | "unreachable" | "secret" | "gone" | "refused" | "no_space" | "shared_space";

/**
 * D575: shared_space, not a failure but a question asked once: the only place Mem's own write target
 * names is a Space others read (context's write_target, reason key_write_space, e.g. Everyone), so
 * nothing is written until the person chooses. label and readers: that Space as Mem lists it;
 * personal: whether they have a personal Space to keep it in instead (the default).
 */
export interface MemFileShared {
  label: string;
  readers?: number;
  personal: boolean;
}

/**
 * D465: one thing Nowledge Mem would like the person to settle, from Mem's own review queue.
 * contradiction: two memories Mem found may disagree (pair: older first, titles and days only, never
 * their contents); rule: a rule Mem learned from how the person works, still a draft (title and its
 * words, clipped). suggest: Mem's own recommendation, the default; answers: the ones offered here.
 */
export type MemCheckAnswer = "newer" | "older" | "both" | "use" | "not";
export interface MemCheckItem {
  id: string;
  kind: "contradiction" | "rule";
  pair?: { title: string; at?: string }[];
  title?: string;
  body?: string;
  /** The default answer: the partner's judgement over the true facts when it has one (D569), else Mem's own. */
  suggest?: MemCheckAnswer;
  /** D569: why the partner suggests it, one short line in the person's language (absent: Mem's own suggestion, or none). */
  why?: string;
  answers: MemCheckAnswer[];
  at?: string;
}

/**
 * D465: asks: what Mem would like settled (contradictions newest first, then learned rules; at most a
 * few); more: Mem holds other suggestions (skills, upkeep) best seen in Mem itself, never counted;
 * rules: the rules already on, the ones every AI tool connected to Mem reads at a new conversation.
 */
export interface MemCheck {
  asks: MemCheckItem[];
  more?: true;
  rules: { id: string; title: string; body?: string }[];
}

/**
 * D375: what Nowledge Mem's own `nmem doctor` says is wrong on a computer, the one thing worth
 * saying, in order of what blocks most. old: this nmem has no doctor (too old to tell); unreachable:
 * Mem is set up there but doesn't answer; signed_out: it answers, the sign-in doesn't work (fresh:
 * never signed in there); plugin: signed in, these agents (harness ids) aren't connected to it.
 * No issue: all well. Read-only, cached; never a detail line (the credential line carries a key's tail).
 */
export type MemHealthIssue = "old" | "unreachable" | "signed_out" | "plugin";
export interface MemHealth {
  issue?: MemHealthIssue;
  fresh?: true;
  agents?: string[];
  checkedAt?: string; // ISO
}

/**
 * D321: one memory as Settings › 记忆 / Memory shows it: its title (never its content), its kind
 * (Mem's unit type: how you like things, what you decided, what it knows), who it's from (said: you
 * told the partner; tool: another AI tool saved it, from names it; you: you saved it yourself; mem:
 * Nowledge Mem distilled it from your conversations), and when.
 */
export interface MemItem {
  id: string;
  title: string;
  kind: "preference" | "decision" | "fact" | "other";
  by: "said" | "tool" | "you" | "mem";
  from?: string;
  at?: string;
}

/**
 * D295, D321: a glance at Mem itself, when it answers. total: how many memories it holds. about: what
 * it knows about the person, by kind, newest first (preferences from anyone; decisions and facts only
 * the person's own or said to the partner: another tool's working notes are not about the person).
 * tools: the person's other AI tools that wrote to the same Mem in the last 7 days, as a count only
 * (more: at least that many), never their titles.
 */
export interface MemGlance {
  total: number;
  about: MemItem[];
  tools: { from: string; count: number; more?: true }[];
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
 * why the last one didn't work); signing_in; local_mem: Mem here answers from this computer (the
 * app, a Vault) and offered no place to connect in (D269: asked, never assumed). detail, after a step that didn't work:
 * what the installer or Mem said, clipped, never a secret.
 */
export interface BridgeView {
  /** D329: mem_closed: the home's Nowledge Mem is the app on that computer, and the app isn't open (canOpen: the home can open it). */
  state: "install_mem" | "installing" | "update_mem" | "updating" | "sign_in" | "signing_in" | "mem_closed" | "local_mem" | "ready" | "elsewhere" | "no_space" | "connecting" | "connected" | "disconnecting" | "refused" | "failed" | "unconfirmed";
  /**
   * D324: other homes' active connections for the same identity (on elsewhere: the home that answers
   * now; on connected: a second reader of the same mailbox). home: the computer its label names (a
   * label from before D324 names none); stuck: Mem wouldn't end it from here, so it is ended there.
   */
  // D433: seenAt (ms): when Mem last saw that connection's computer (`connections list --include-activity`), when it says.
  others?: { label: string; home?: string; stuck?: true; seenAt?: number }[];
  /** D340: on ready, this home connects only when asked (not the person's own home): the switch shows off until flipped. */
  asks?: true;
  canRun?: boolean;
  /** D329: mem_closed: the home can open the Nowledge Mem app itself (a Mac with the app). */
  canOpen?: boolean;
  need?: "pipx" | "app" | "other";
  /** D432: need pipx: the one command that puts it in on the home (for its own system), shown to copy. */
  cmd?: string;
  signIn?: "used" | "bad" | "failed";
  /** The home's nmem version, when it answered (D257: on every state where it did). */
  version?: string;
  /**
   * D295: where Mem keeps the memories, from `nmem status`: Nowledge Mem Cloud, the Mem app or a
   * Vault on the home itself (local), or a Mem server of the person's own (server).
   */
  where?: "cloud" | "local" | "server";
  /**
   * D257: Mem's own word (`nmem status`.update) that a newer nmem is out: its version, or "" when
   * Mem didn't name it. Sent whether or not Ducter can update this copy (the app's it can't).
   */
  newer?: string;
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
  /**
   * D229: the one quiet thing worth doing to the home's Nowledge Mem, under a working state (and on
   * update_mem): move a copy put past the system's mark to Mem's recommended install (sign-in kept),
   * or update to the newer one Mem says is out. Sent with installing/updating while it runs.
   */
  upkeep?: { kind: "move" | "update"; detail?: string; kept?: true };
  /** D229: just done on the home (shown for a few minutes): put in, updated, or moved. */
  done?: "installed" | "updated" | "moved";
  /** D229: with detail: it didn't work, and the copy that was there still is and works. */
  kept?: true;
  /**
   * D334: on connected, the Spaces where Mem refused the home a reader for the partner's mailbox
   * (`agents context select` said no): messages sent to the partner there aren't read. One quiet
   * problem row names them; Spaces are never listed otherwise. code: Mem's registered code, as said.
   * D338: status, the HTTP status Mem answered with (404 on nmem 0.10.120: nowledge-co/mem#10402).
   */
  unread?: { label: string; code?: string; status?: number }[];
  /**
   * D369: on connected, Mem said the partner's mailbox can't be read until Mem sorts something out on
   * its side (`cloud_mailbox_own_source_unreconciled`, research/139): one quiet line says so, with Mem's
   * code; nothing to tap. Gone once a read works again.
   */
  stuck?: { code: string };
  /**
   * D400: on connected, Nowledge Mem itself also tells the person about mail to the partner's identity
   * (`bridge notices status`, nmem 0.10.121): one quiet line says a message may announce itself twice;
   * nothing in Mem is changed from here.
   */
  notices?: true;
  /**
   * D444: on connected, Mem's own contact list grouped per identity (`bridge contacts` with no Space
   * selector, nmem 0.10.121), read in the background at most every 30 minutes while the pane is
   * looked at: the person's own agents Mem lists, by the AI tool each runs (a harness id), and whether
   * Mem says its mailbox takes messages now (open) or not (closed). A tool Mem doesn't list is absent.
   * at: when it was read (ms).
   */
  mailboxes?: { harness: string; open: boolean; at: number }[];}

/** The choices offered for defaultAfterMin, in minutes. */
/** D144: a task-less wait that ended without its condition (it can't come true, or ran out of time). */
export const endedUnmet = (w: Pick<Bodies["waiter"], "state" | "unmet" | "taskId" | "routineId">): boolean =>
  !w.taskId && !w.routineId && (w.state === "expired" || (w.state === "cancelled" && Boolean(w.unmet)));

/** D483: what Ducter told a task about a PR it owns, up to now (core/src/owned.ts). */
export interface OwnedSeen {
  /** When the task declared it: comments from before are not news. */
  since: string;
  head?: string;
  /** The head whose CI ending was told. */
  ciFor?: string;
  /** D508: not_ours: a PR a report named whose branch isn't the task's (it isn't watched). */
  state?: "open" | "closed" | "merged" | "not_ours";
  /** D508: how Ducter came to watch it when the task didn't declare it: its own done report named it
   *  (checked against its branch at the first look), or Ducter opened it as the task's draft PR. */
  from?: "report" | "integrate";
  /** Comment and review ids already told (bounded). */
  ids?: string[];
  /** D496: the failed checks already told for `head` (a failure is news before every check ends). */
  failedTold?: string[];
  /** D496: where the PR stands at the last look, told with every piece of news and every wake. */
  standing?: OwnedStanding;
  /** D602: the task let it go: it is not where the task's work goes on (a duplicate, no longer
   *  needed, or the person ended the task). Ducter stops watching it, it no longer holds the task
   *  open or a Keep's item, and it stays open on GitHub until someone closes it there. */
  letGo?: PrLetGo;
}

/** D602: why a task let one of its PRs go, and when. The model judges duplicate and unneeded (its
 *  report_to_main `let_go`); ended is the person's 结束任务 / End task. */
export interface PrLetGo {
  why: "duplicate" | "unneeded" | "ended";
  at: string;
}

/**
 * D496: where a task's PR stands, as facts read from GitHub at one look: what reviewers asked that
 * still stands (whenever it was written: a request from before the task declared the PR counts),
 * its checks on the head, whether it can merge. Who must act is read from these, by the model.
 */
export interface OwnedStanding {
  at: string;
  /** The PR's own title as GitHub has it (a Keep's held PR is named by it). */
  title?: string;
  head?: string;
  draft?: boolean;
  /** Each reviewer whose latest decisive review asks for changes: who, when, on which commit, the gist. */
  changes?: { id: string; by: string; at: string; on?: string; text: string }[];
  approvedBy?: string[];
  /** Reviews asked for and not given yet. */
  awaiting?: string[];
  /** Checks on the head: check runs and commit statuses together. */
  checks?: { total: number; passed: number; failed: string[]; pending: string[] };
  /** GitHub's mergeable_state: clean, blocked, behind, dirty (conflicts), unstable, draft, unknown. */
  merge?: string;
}

/** D483: how long a wait with no until of its own lasts: every wait ends, and whoever waits hears why. */
export const TASK_WAIT_UNTIL_MS = 24 * 60 * 60_000;
export const PARTNER_WAIT_UNTIL_MS = 7 * 24 * 60 * 60_000;

export const DEFAULT_AFTER_CHOICES = [10, 30, 60, 120] as const;

// ---------- Ducter MCP tools (HTTP MCP served by core at /mcp, role-scoped by token) ----------
// role "partner": task_open, task_send, task_read, log_search, log_read, wait_until, ask, memory_search, memory_add,
//   bridge_reply (only while Bridge is on: the home connected, D557)
// role "task:<id>": report_to_main, log_search, log_read, checkpoint

export interface ToolArgs {
  task_open: { title: string; brief: string; place?: Place; project?: string; harness?: string; model?: string; /** D426 */ asks?: string[] };
  task_send: { taskId: string; text: string; mode?: "steer" | "queue"; /** D426 */ asks?: string[] };
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

/**
 * D347: 加一台做事的电脑 / Add a computer for tasks. waiting: the code is out (the asking window gets the
 * line); joined: a computer traded the code (device, name), its worker is starting; here: it said
 * hello and is in Devices. No address: nothing outside the home reaches it yet (the clients offer
 * 从外面连). sameNetwork: the address is the home's own network one, so both must be on it.
 * Expiry is the client's to read from expiresAt (the home sends nothing when a code lapses).
 */
export interface LendFrame {
  t: "lend";
  code: string;
  expiresAt: string;
  state: "waiting" | "joined" | "here";
  address?: string;
  sameNetwork?: boolean;
  /** curl … | sh -s -- worker <address> --code <code> (only to the window that asked). */
  line?: string;
  /** curl -sS -m 10 <address>/health: does that computer reach the home at all? */
  check?: string;
  device?: string;
  name?: string;
}
export * from "./names.ts";
export * from "./pr-state.ts";
