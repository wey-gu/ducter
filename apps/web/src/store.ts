// The phone's model of the Log: a port of the desktop store (apps/desktop/internal/store) so both
// clients fold the same events the same way: living messages revised in place, jobs folded into
// their acks, decisions with their resolutions, tasks with their streams, the On hand snapshot.
// Pure data; tested without a DOM.
import { countDoneToday, endedUnmet, prGoesOn, prsCarried } from "@ducter/protocol";
import type { KeyResult } from "@ducter/protocol";
import type { ActivityStep, Attention, Bodies, BridgeReceipt, ClientFrame, Delivery, EvidenceRef, FirstScreen, FolderChanges, LogEvent, OnHand, Place, RecalledMemory, RoutineView, ServerFrame, TaskBody, TaskCard, TruthState, UndoConfirm, UntilView, WaiterView } from "@ducter/protocol";
import { hasBranchChanges } from "@ducter/protocol";
import { outwardOf, type OutwardAct } from "@ducter/protocol/src/outward.ts";
import { askOpen } from "@ducter/protocol/src/open-asks.ts";
import type { SubjectCard } from "@ducter/protocol/src/subject.ts";
import { keepsPoints } from "@ducter/protocol/src/ask-words.ts";
import { addSpan, cutSpans, covers, indexAdd, indexJoin, keepFor, lowerBound, nextAsk, spanOfPage, type Ask, type SessionIndex, type Span, type View } from "@ducter/protocol/src/session.ts";

export type Ev<K extends keyof Bodies = keyof Bodies> = LogEvent<K>;

export interface Job {
  id: string;
  ack?: Bodies["ack"];
  status?: Bodies["job_status"];
}

/** D418: contact tests from one own agent, folded: how many, the earliest's send time, which were answered. */
export interface PingGroup {
  n: number;
  earliest?: number;
  sent: Set<string>;
  failed: Set<string>;
  told?: boolean; // the partner said it in a line of its own: the quiet line steps aside
}

export interface Entry {
  ev: LogEvent;
  firstSeq: number;
  revision: number;
  user?: Bodies["user_msg"];
  ai?: Bodies["ai_msg"];
  job?: Job;
  living?: Bodies["living_msg"];
  decision?: Bodies["decision"];
  /** D165: a note the partner said by itself; a fold-in or an answer revises it in place. */
  finds?: Bodies["finds"];
  peer?: Bodies["bridge_msg"]; // D170: one quiet line about the user's other agents
  /** D385: a set of to-dos the partner found (todos do=find): its card; a later one with the same setId updates it. */
  set?: Bodies["todo_set"];
  /** D426: on a user's message: the several things it asked for, line by line (the latest `asks`). */
  asks?: Bodies["asks"];
  /** D653: the living cards of the work that message started, latest per subject. */
  cards?: SubjectCard[];
}

export type DecisionState = Bodies["decision"] & {
  seq: number;
  askedAt?: string;
  resolved?: Bodies["decision_resolved"];
  pending?: "go" | "hold" | "reply" | "";
  /** When the person answered here (D642): a calendar write's card knows when its wait began, so
   *  a wait running long can say so instead of spinning for ever. */
  answeredAt?: number;
  /** A task's question in the partner's own words (D129); the task's wording stays in question. */
  said?: string;
  /** D382: put off until this time (晚点再问我 / Ask me later); backAt: when it came back. */
  later?: string;
  backAt?: string;
  /**
   * D481: On hand says it is no longer open at the home, and this client missed how: closed here
   * at once (resolved holds a stand-in), until the home's own resolution (asks_get) replaces it.
   */
  elsewhere?: true;
};

export interface Send {
  text: string;
  /** D206: pictures going with it (while they go up), then their ids. */
  pics?: import("./media-up.ts").Pic[];
  media?: string[];
  /** Tries a picture that didn't go up again, then sends. */
  retry?: () => void;
  /** The id it was sent with; a resend after a reconnect uses the same one (core dedupes). */
  clientId?: string;
  /** D268: sent while it works: steered into its next step, or queued until it is done. */
  mode?: "steer" | "queue";
  /** D534: what its words refer to with @ (sent with it; a resend sends them again). */
  refs?: import("@ducter/protocol").Ref[];
  delivered?: Delivery;
  failed?: string;
  seq?: number;
  at: number;
}

export interface Task {
  id: string;
  open?: Bodies["task_open"];
  state?: Bodies["task_state"];
  lastReport?: Bodies["report"];
  card?: TaskCard;
  checkpoints: { text: string; seq: number; ts: string }[];
  evidence: EvidenceRef[];
  events: LogEvent[];
  seqs: Set<number>;
  historyLoaded: boolean;
  /** D284: every event from this seq to the newest is held; histMore: the home has older ones. */
  histFrom?: number;
  histMore?: boolean;
  /** D284: the socket was replaced since it loaded: a gap may have opened, so the next open asks again. */
  histStale?: boolean;
  /** D284: a task_history request is on its way, for histAsk events. */
  histPending?: boolean;
  histAsk?: number;
  /** D320: the task's session index (one row per turn, from the home, kept live), whether a new
   *  socket may have left it behind, and whether one is on its way. */
  index?: SessionIndex;
  indexStale?: boolean;
  indexPending?: boolean;
  /** D320: the stretches of its stream held whole (`to` Infinity: through the newest, kept live). */
  spans: Span[];
  /** D320: bumped whenever its held events change (a page, a live event, letting far ones go). */
  version: number;
  lastReportSeq?: number;
  openedAt?: string;
  openSeq?: number; // seq of the task_open in `open` (a retitle is a later one)
  /** D456: seq of the task_state in `state`: an older page landing later never turns a done task back to working. */
  stateSeq?: number;
  sends: Send[];
  /** D325: the seqs of the person's steers the agent's next step took in (the runner's `read`). */
  reads?: Set<number>;
  acting?: string;
  /** A merge / open_pr whose result was lost with the socket and that the Log doesn't show done:
   *  it may or may not have happened. Shown as "not sure, check" with Try again, never a failure. */
  unsure?: string;
  acted?: { action: string; ok: boolean; message?: string; ref?: string };
  /** The seq the action was logged at: a done report after it is new, unmerged work. */
  actedSeq?: number;
  /** D142: the list behind a folder task's Changes (folder_changes), and an undo that asked to confirm. */
  folder?: FolderChanges;
  confirm?: UndoConfirm;
  /** Who does it now and why: the latest body_selected (D89). */
  body?: TaskBody;
  bodySeq?: number;
  /** Where a browser task's browser last was (task_event {role: system, raw.browser}); `own`:
   *  the user's own Chrome, through the AI agent's own tools (D126). */
  browser?: { host: string; own?: boolean; seq: number };
  /** D617 (D590's leftover): what Ducter's own recall put in front of the first turn
   *  (task_event raw {memory: "recall", recalled}); never the memories' text. */
  recalled?: RecalledMemory[];
  /** D339: the person's own phone the task asked to borrow (the ask's report in its stream). */
  phone?: { device: string; name: string };
}

/** Where a running task's browser is looking, or undefined (D126). */
export function browsing(task: Task): { host: string; own?: boolean } | undefined {
  const a = attention(task);
  if (!task.browser || (a !== "working" && a !== "queued" && a !== "needs_you" && a !== "blocked")) return undefined;
  return task.browser;
}

export const LANE = { needs: 0, working: 1, waiting: 2, done: 3, hidden: 4 } as const;
export type Lane = (typeof LANE)[keyof typeof LANE];

export function laneOf(a: Attention): Lane {
  switch (a) {
    case "needs_you":
      return LANE.needs;
    case "working":
    case "queued":
      return LANE.working;
    case "blocked":
      return LANE.waiting;
    case "done":
    case "done_claimed":
    case "failed":
      return LANE.done;
  }
  return LANE.hidden;
}

// D285: the person's own name for it comes first, then the latest retitle.
export const title = (t: Task) => t.card?.mark?.name || t.open?.title || t.card?.title || "";
/**
 * D661 (research/245 §3.3): the snapshot's derived state is the one every surface reads. A
 * live `task_state` event that disagrees with the card is newer than the snapshot, so it wins; else
 * truth decides the lane. `waiting` and `stopped` both read as Waiting here: D467's rows tell a
 * fresh stop from old news by the clock (`stoppedWait`), never by a second lane.
 */
const TRUTH_LANE: Record<TruthState, Attention> = {
  needs_you: "needs_you",
  working: "working",
  waiting: "blocked",
  stopped: "blocked",
  done: "done",
  failed: "failed",
};
export const attention = (t: Task): Attention => {
  const truth = t.card?.truth?.state;
  if (truth && (!t.state || t.state.attention === t.card?.attention)) {
    // D661 turn 2: a stopped task that now needs the person stands where its row can offer
    // Continue / Put down, never as a bare question card.
    if (truth === "needs_you" && t.card?.truth?.needs === "stopped") return "blocked";
    return TRUTH_LANE[truth];
  }
  return t.state?.attention ?? t.card?.attention ?? "queued";
};
/** D310: how many of these tasks are 今天做完 / Done today, by the one rule every surface uses
 *  (`isDoneToday`: finished well, on today's local day; failed and missed waits are their own). */
export function doneTodayOf(tasks: Task[], now = Date.now()): number {
  return countDoneToday(tasks.map((t) => ({ attention: attention(t), at: [t.card?.updatedAt, t.events.at(-1)?.ts].filter(Boolean).sort().at(-1), prOpen: !!prGoesOn(t.card?.prs) })), now); // D508
}
/** D602: a finished task an open PR still holds on the board: 结束任务 / End task lets those PRs go. */
export function endable(t: Task): boolean {
  const a = attention(t);
  return (a === "done" || a === "done_claimed") && prsCarried(t.card?.prs).length > 0;
}
export const reasonOf = (t: Task) => t.state?.reason || t.card?.reason || "";
/** D395: why it couldn't start where it was to work, and what fixes it (the latest state's, else the card's). */
export const cantOf = (t: Task) => (t.state ? t.state.cant : t.card?.cant);
export const placeOf = (t: Task): Place => t.open?.place ?? t.card?.place ?? { kind: "none" };
/** The proof line counts the changes ("1 file changed"), except for a folder (D142): its own
 *  sentence says them, with Undo and Keep, and a count beside it would say it twice. */
export const countsChanges = (t: Task): boolean => placeOf(t).kind !== "folder";
export const reportOf = (t: Task) => t.lastReport ?? t.card?.lastReport;
/** Merge into main / Open draft PR make sense: a repo task with a branch that holds something its
 *  base doesn't (core checks at report time; unknown counts as yes). Never on a failed task. */
export const canIntegrate = (t: Task): boolean => {
  const p = placeOf(t);
  return attention(t) !== "failed" && p.kind === "repo" && !!p.branch && hasBranchChanges(reportOf(t));
};
/** The repo has nowhere to push to, so a PR can't be opened: Open draft PR isn't offered. */
export function noRemote(task: Task): boolean {
  if ((placeOf(task) as { hasRemote?: boolean }).hasRemote === false) return true;
  const a = task.acted;
  return !!a && !a.ok && a.action === "open_pr" && /no (origin )?remote/i.test(a.message ?? "");
}
export const whoOf = (t: Task): TaskBody | undefined => t.body ?? t.card?.body;
export const harnessOf = (t: Task) => whoOf(t)?.harness || t.open?.harness || t.card?.harness || "";
export const modelOf = (t: Task) => { const w = whoOf(t); return w ? w.model ?? "" : t.open?.model || t.card?.model || ""; };
/** D202: the effort it runs at, when the user picked one ("" = the model's own default). */
export const effortOf = (t: Task) => { const w = whoOf(t); return w ? w.effort ?? "" : t.open?.effort || t.card?.effort || ""; };
// D654 (research/245 §3.2): the card carries the project's identity and name from core. The
// web never derives either from a folder name again; `project` stays only for an older home.
export const projectOf = (t: Task) => t.open?.projectKey ?? t.card?.projectKey ?? t.open?.project ?? t.card?.project ?? "";
export const projectNameOf = (t: Task) => t.open?.projectName ?? t.card?.projectName ?? projectOf(t);
export const projectGroupOf = (t: Task): "computer" | "none" | "" => t.open?.projectGroup ?? t.card?.projectGroup ?? "";
export const bodyReasonOf = (t: Task) => t.open?.bodyReason || t.card?.bodyReason || "";
export const finished = (t: Task) => ["done", "done_claimed", "failed"].includes(attention(t));

function taskOf(ev: LogEvent): string {
  const b = ev.body as { taskId?: string };
  if (["task_open", "task_state", "task_event", "report", "checkpoint", "body_selected"].includes(ev.kind) && b.taskId) return b.taskId;
  return ev.stream.startsWith("task:") ? ev.stream.slice(5) : "";
}

/**
 * D284: the seq an opened task's next older page comes before, or undefined: none is on its way,
 * the home has older ones, and it holds fewer than `limit` events (the background's reach).
 */
export function olderPage(t: Task | undefined, limit = Infinity): number | undefined {
  if (!t?.historyLoaded || t.histPending || !t.histMore || !t.histFrom || t.events.length >= limit) return undefined;
  return t.histFrom;
}

/**
 * D320: one step of an open task's window, for what is on screen (`view`, index turns): lets go of
 * what is far from it, then says the next page to ask for, or undefined (nothing needed, one is on
 * its way, or no session index yet: a home before D320 pages only at the head).
 */
export function windowAsk(S: Store, id: string, view: View | undefined): Ask | undefined {
  const t = S.tasks.get(id);
  if (!t?.index || !t.historyLoaded || t.histPending) return undefined;
  const n = t.index.turns.length;
  const v = view ?? { first: Math.max(0, n - 3), last: n - 1, dir: 0 };
  const keep = keepFor(t.index, t.events, v);
  if (keep) S.evict(id, keep);
  return nextAsk(t.index, t.spans, t.events, v);
}

/** D509: a decision's own words and when it was asked, from an older page. */
function pick(d: DecisionState): Partial<DecisionState> {
  const { resolved: _r, pending: _p, said: _s, later: _l, backAt: _b, elsewhere: _e, ...own } = d;
  return own;
}

export class Store {
  persona = "";
  personaName = "Ducter";
  /** The empty conversation's words from the home (D149); undefined from an older Ducter. */
  first?: FirstScreen;
  /** D298: key_add_result answers by clientId (first-words.tsx picks its own up). */
  keyResults = new Map<string, KeyResult>();
  headSeq = 0;
  cursor = 0;
  readUpTo = 0;
  channelSeq = 0;
  welcomed = false;
  channel: Entry[] = [];
  bySeq = new Map<number, Entry | null>();
  /**
   * D509: the conversation's paging back. from: the oldest channel seq held (everything from it to
   * the newest is held whole); done: the home said nothing older remains; asked: the beforeSeq of
   * the page on its way (0: none).
   */
  older = { from: 0, done: false, asked: 0 };
  /** D426: lines that came before their message was loaded (history paging), kept until it is. */
  asksWaiting = new Map<number, Bodies["asks"]>();
  /** D653: living cards that came before their message was loaded, kept until it is. */
  cardsWaiting = new Map<number, SubjectCard[]>();
  jobs = new Map<string, Job>();
  decisions = new Map<string, DecisionState>();
  tasks = new Map<string, Task>();
  onHand?: OnHand;
  /** D662 (research/245 §3.5): the person's saved views, from the home. */
  views: import("@ducter/protocol").BoardView[] = [];
  /** D454: tasks and groups removed from Tasks on this screen, before the home's next On hand says so. */
  awayNow = new Set<string>();
  waiters = new Map<string, WaiterView>();
  /** D145: task-less waits that ended unmet today: the finished area keeps them, with Keep waiting. */
  missed = new Map<string, Bodies["waiter"] & { endedAt: string }>();
  /** Tasks whose wait just came true, and when (for the pop and glide, D115). */
  arrived = new Map<string, number>();
  errors: string[] = [];
  /** 记下了 / Noted lines in the channel, shown inside the Details of the reply they belong to (D104). */
  noted: { seq: number; title: string; memoryId?: string; replyTo?: number; replaced?: string; waiting?: true }[] = [];
  /**
   * D433: each outgoing Bridge message's latest word (by its op): sending, sent, failed, unknown or
   * unconfirmed, so 最近 / Recently can say one that hasn't gone, not only the ones that did.
   */
  outOps = new Map<string, { seq: number; ts: string; b: Bodies["bridge_msg"] }>();
  /** D619: Mem's latest read receipt for a sent message, by its op and by its message id: 已送达 /
   *  已读 / 「{n}/{m} 已读」 beside the time, and nothing when Mem has none. */
  receipts = new Map<string, BridgeReceipt>();
  messageReceipts = new Map<string, BridgeReceipt>();
  /** D470 round 2: replies shown as sent, by the message answered and the words. */
  sentReplies = new Set<string>();
  // D448: a task's own exchanges with another agent that never show in the conversation (its follow-ups
  // with no card, the answers that went into it), for 最近 / Recently.
  taskPeers: { ev: { seq: number; ts: string }; peer: Bodies["bridge_msg"] }[] = [];
  /** D304: the 想起了 / Remembered line under a message, by the seq of the message it stands under. */
  recalled = new Map<number, Bodies["memory_recalled"] & { seq: number }>();
  /** D165: each find's latest change, and the user's latest message. */
  findStates = new Map<string, Bodies["find_state"]>();
  /** D403: a drafted reply's sending (sending, sent, unsent, send_failed), apart from the reactions. */
  findSends = new Map<string, Bodies["find_state"]>();
  /** D403: a find's Go asked again (after 撤回 or a failed send): its latest decision. */
  findAsks = new Map<string, string>();
  lastUserSeq = 0;
  private notes = new Map<string, Entry>();
  /** Senders set aside per day (D163): how many, and the seq of the one line that says so. */
  setAside = new Map<string, { n: number; seq: number }>();
  /** D418: an own agent's contact tests answered by code, folded into one line: by the first one's seq. */
  pings = new Map<number, PingGroup>();
  private pingAt = new Map<string, number>(); // a test's message id → its group's seq
  private lastPing: { key: string; seq: number; at: number } | undefined;
  /** What the partner is doing while the user waits (D104): its step, when this client first saw
   *  that step (local clock, so a skewed server clock can't make it look slow), and the channel
   *  seq at which a turn last ended (a user message at or before it has had its turn). */
  activity?: { step: ActivityStep; at: number; about?: string; source?: "calendar" | "todos" | "accounts" };
  activityEndedAt = 0;
  actionResults: Extract<ServerFrame, { t: "action_result" }>[] = [];
  /** D222: what a Go on a change card ran (the connection_call with its decision id), the latest by seq. */
  calRuns = new Map<string, { state: Bodies["connection_call"]["state"]; link?: string; error?: string; seq: number }>();
  /** D539: what a copy card's Go did: the computers that got the key, and those that didn't (why). */
  keyCopies = new Map<string, Bodies["key_copy"]>();

  /** A welcome from a Log that no longer holds what we've seen (its data was reset). */
  stale(f: ServerFrame) {
    return f.t === "welcome" && this.cursor > 0 && f.headSeq < this.cursor;
  }

  /** D284: a task_history request for `limit` events is on its way. */
  historyAsked(id: string, limit: number) {
    const t = this.task(id);
    t.histPending = true;
    t.histAsk = limit;
  }

  task(id: string): Task {
    let t = this.tasks.get(id);
    if (!t) {
      t = { id, checkpoints: [], evidence: [], events: [], seqs: new Set(), historyLoaded: false, sends: [], spans: [], version: 0 };
      this.tasks.set(id, t);
    }
    return t;
  }

  apply(f: ServerFrame) {
    switch (f.t) {
      case "welcome":
        this.persona = f.persona;
        this.headSeq = f.headSeq;
        this.welcomed = true;
        if (f.personaName) this.personaName = f.personaName;
        this.older.asked = 0; // D509: a page asked on the old socket never comes
        this.asksAsked.clear(); // D481: a new socket asks again for what it still lacks
        this.asksWanted.length = 0;
        // D284: a new socket: what a task's history missed meanwhile is asked again when it opens.
        for (const t of this.tasks.values()) {
          t.histStale = t.histStale || t.historyLoaded;
          t.histPending = false;
          t.histAsk = 0;
          // D320: live events reached only the old socket: what is held runs to its last event, no further.
          const last = t.events.at(-1)?.seq ?? 0;
          t.spans = t.spans.map((s) => (s.to === Infinity ? { from: s.from, to: last } : s)).filter((s) => s.from <= s.to);
          if (t.index) t.indexStale = true;
          t.indexPending = false;
        }
        return;
      case "first_screen":
        this.first = f.first;
        return;
      case "key_add_result":
        this.keyResults.set(f.clientId, f.result);
        return;
      case "sent": {
        const t = this.tasks.get(f.taskId);
        const sd = t?.sends.find((s) => (f.clientId ? s.clientId === f.clientId : !s.delivered && !s.failed));
        if (!t || !sd) return;
        sd.delivered = f.delivered;
        // D325: held at the home (a home that names the clientId): it is a chip over the composer now (the card's held), not a bubble.
        if (f.delivered === "queued" && f.clientId && !sd.seq) t.sends.splice(t.sends.indexOf(sd), 1);
        return;
      }
      case "action_result": {
        // A switch (D89) is not a result action: Merge and the rest stay as they were.
        if (f.action === "switch") return void this.actionResults.push(f);
        // D142: an undo of a folder changed since the task finished asks in place, not in a toast.
        if (f.action === "undo" && f.confirm) {
          const ct = this.tasks.get(f.taskId);
          if (ct) (ct.confirm = f.confirm), (ct.acting = undefined);
          return;
        }
        const t = this.tasks.get(f.taskId);
        if (t) (t.acting = undefined), (t.unsure = undefined), (t.acted = { action: f.action, ok: f.ok, message: f.message, ref: f.ref }), (t.actedSeq = this.cursor);
        this.actionResults.push(f);
        return;
      }
      case "events":
        for (const ev of f.events) {
          this.applyEvent(ev);
          this.cursor = Math.max(this.cursor, ev.seq);
        }
        return;
      case "on_hand":
        this.applyOnHand(f.onHand);
        return;
      case "view_saved":
        this.views = f.views;
        return;
      case "folder_changes": {
        const ft = this.tasks.get(f.taskId);
        if (ft) ft.folder = f.changes ?? undefined;
        return;
      }
      case "channel_history":
        return this.applyOlder(f);
      case "task_history": {
        // D284: the newest window first, then older pages; HistFrom..newest is held whole.
        const t = this.task(f.taskId);
        const newest = t.events.at(-1)?.seq ?? 0;
        const had = { from: t.histFrom ?? 0, more: !!t.histMore };
        for (const ev of f.events) this.applyEvent(ev);
        // D320: the stretch it answers for is held whole.
        const span = spanOfPage({ ...f, more: f.more ?? (!!t.histAsk && f.events.length >= t.histAsk) });
        if (span) t.spans = addSpan(t.spans, span);
        t.version++;
        if (f.afterSeq != null) {
          // A far stretch growing down: the tail's bookkeeping (D284) is untouched.
          t.histPending = false;
          t.histAsk = 0;
          return;
        }
        // A home before D284 says nothing of more: a full page may have more (at worst one comes back empty).
        const more = f.more ?? (!!t.histAsk && f.events.length >= t.histAsk);
        const first = f.events[0]?.seq;
        t.histPending = false;
        t.histAsk = 0;
        if (!f.beforeSeq) {
          t.historyLoaded = true;
          t.histStale = false;
          if (first == null) (t.histFrom = 0), (t.histMore = false);
          else if (had.from && had.from <= first && first <= newest) (t.histFrom = had.from), (t.histMore = had.more);
          else (t.histFrom = first), (t.histMore = more);
        } else if (first != null && (!t.histFrom || first < t.histFrom)) (t.histFrom = first), (t.histMore = more);
        else t.histMore = false;
        this.tailFromSpans(t);
        return;
      }
      case "task_index": {
        // D320: the home's index, or its turns from fromSeq on, which replace the client's from there.
        const t = this.task(f.taskId);
        t.index = indexJoin(t.index, f.index, f.fromSeq);
        t.indexStale = false;
        t.indexPending = false;
        t.version++;
        return;
      }
      case "activity":
        if (!f.activity) {
          this.activity = undefined;
          this.activityEndedAt = this.channelSeq;
        } else if (this.activity?.step !== f.activity.step || this.activity.about !== f.activity.about || this.activity.source !== f.activity.source) this.activity = { step: f.activity.step, at: Date.now(), ...(f.activity.about ? { about: f.activity.about } : {}), ...(f.activity.source ? { source: f.activity.source } : {}) };
        return;
      case "error": {
        this.errors.push(f.message);
        if (f.message.startsWith("task_send:")) {
          for (const t of this.tasks.values()) {
            const sd = t.sends.find((s) => !s.delivered && !s.failed);
            if (sd) return void (sd.failed = f.message.slice("task_send:".length).trim());
          }
        }
        return;
      }
    }
  }

  addSend(taskId: string, text: string, at = Date.now(), clientId?: string): Send {
    const sd: Send = { text, at, ...(clientId ? { clientId } : {}) };
    this.task(taskId).sends.push(sd);
    return sd;
  }

  private applyOnHand(o: OnHand) {
    this.onHand = o;
    this.views = o.views ?? [];
    if (o.waiters) {
      const armed = new Set(o.waiters.map((w) => w.waiterId));
      for (const w of o.waiters) this.waiters.set(w.waiterId, w);
      for (const [id, w] of this.waiters) if (w.state === "armed" && !armed.has(id)) this.waiters.delete(id);
    }
    if (o.missed) this.missed = new Map(o.missed.map((w) => [w.waiterId, w]));
    for (const card of o.tasks) {
      const t = this.task(card.taskId);
      t.card = card;
      t.openedAt ??= card.openedAt;
      const pd = card.pendingDecision;
      if (pd) {
        let d = this.decisions.get(pd.decisionId);
        if (!d) this.decisions.set(pd.decisionId, (d = { ...pd, seq: 0 }));
        d.askedAt ??= pd.askedAt;
        if (!d.question) Object.assign(d, pd, { seq: d.seq });
        // D382: whether it is put off is the card's (a snapshot after the events agrees with them).
        if (pd.later) d.later = pd.later;
        else delete d.later;
        if (pd.backAt) {
          d.backAt = pd.backAt;
          if (pd.defaultAt) d.defaultAt = pd.defaultAt;
          else delete d.defaultAt; // back, not seen yet: no countdown
        }
      }
      // D472: with why it couldn't start, or the snapshot would hide it (hel: the page said 没成 and 再试一次 only).
      t.state = { taskId: card.taskId, attention: card.attention, residency: card.residency, reason: card.reason, ...(card.cant ? { cant: card.cant } : {}) };
      t.stateSeq = Math.max(t.stateSeq ?? 0, this.cursor);
      if (card.lastReport) t.lastReport = card.lastReport;
    }
    if (o.openAsks) this.reconcileAsks(o.openAsks);
  }

  /** D320: the tail's bookkeeping (D284) from the span through the newest, when there is one. */
  private tailFromSpans(t: Task) {
    const tail = t.spans.find((s) => s.to === Infinity);
    if (!tail || !t.events.length) return;
    const i = lowerBound(t.events, tail.from);
    if (i >= t.events.length) return;
    t.histFrom = t.events[i]!.seq;
    t.histMore = tail.from > 0 && (!t.index || (t.index.turns[0]?.seq ?? 0) < t.histFrom || !!t.histMore);
  }

  /**
   * D320: lets go of every held event of the task outside `keep` (far from what is on screen),
   * and cuts its spans to it. What was derived from them (its title, its state, its checkpoints)
   * stays; a page bringing them back only puts them back in place.
   */
  evict(id: string, keep: Span[]) {
    const t = this.tasks.get(id);
    if (!t) return;
    const before = t.events.length;
    t.events = t.events.filter((e) => covers(keep, e.seq, e.seq));
    if (t.events.length === before) return;
    t.spans = cutSpans(t.spans, keep);
    t.version++;
    this.tailFromSpans(t);
  }

  applyEvent(ev: LogEvent) {
    const taskId = taskOf(ev);
    if (taskId) {
      const t = this.task(taskId);
      if (!t.seqs.has(ev.seq)) {
        t.seqs.add(ev.seq);
        this.applyTask(t, ev);
        // D320: its index grows with every event of its own stream.
        if (t.index && ev.stream === `task:${taskId}`) indexAdd(t.index, ev);
      } else if (t.events[lowerBound(t.events, ev.seq)]?.seq !== ev.seq) this.insert(t, ev); // let go of before, back again
    }
    if (ev.kind === "decision_later" || ev.kind === "decision_back" || ev.kind === "decision_seen") {
      // D382: put off; back (no countdown until it is seen, or at once by Decide now); seen.
      this.applyLater(ev);
      return;
    }
    if (ev.kind === "waiter") {
      const w = ev.body as Bodies["waiter"];
      // The moment a task's wait comes true (D115): its card pops and glides to Working.
      if (w.state === "fired" && w.taskId && (w.check || w.event || w.wakes === "task")) this.arrived.set(w.taskId, Date.now());
      // A routine's watch lives on its card (D114), not as a wait.
      if (w.state === "armed" && !w.routineId) this.waiters.set(w.waiterId, { ...this.waiters.get(w.waiterId), ...w });
      else this.waiters.delete(w.waiterId);
      if (w.state === "armed") this.missed.delete(w.waiterId);
      else if (endedUnmet(w)) this.missed.set(w.waiterId, { ...w, endedAt: ev.ts });
    }
    if (ev.kind === "connection_call") {
      // D222: a calendar change card settles from its run's own record.
      const c = ev.body as Bodies["connection_call"];
      const had = c.decisionId ? this.calRuns.get(c.decisionId) : undefined;
      if (c.decisionId && c.op === "write" && (!had || had.seq <= ev.seq)) this.calRuns.set(c.decisionId, { state: c.state, ...(c.link ? { link: c.link } : {}), ...(c.error ? { error: c.error } : {}), seq: ev.seq });
    }
    if (ev.kind === "key_copy") {
      const b = ev.body as Bodies["key_copy"];
      if (b.decisionId) this.keyCopies.set(b.decisionId, b);
      return;
    }
    if (ev.stream !== "channel") {
      if (ev.kind === "decision") this.addDecision(ev as Ev<"decision">);
      if (ev.kind === "decision_resolved") this.resolve(ev.body as Bodies["decision_resolved"]);
      return;
    }
    if (this.bySeq.has(ev.seq)) return;
    if (!this.older.from || ev.seq < this.older.from) this.older.from = ev.seq; // D509: where paging back starts
    if (ev.kind !== "read_receipt") this.channelSeq = Math.max(this.channelSeq, ev.seq);
    const entry = (e: Partial<Entry>) => this.add({ ev, firstSeq: ev.seq, revision: 0, ...e });
    switch (ev.kind) {
      case "user_msg": {
        this.lastUserSeq = Math.max(this.lastUserSeq, ev.seq);
        const waiting = this.asksWaiting.get(ev.seq);
        if (waiting) this.asksWaiting.delete(ev.seq);
        const cards = this.cardsWaiting.get(ev.seq);
        if (cards) this.cardsWaiting.delete(ev.seq);
        return entry({ user: ev.body as Bodies["user_msg"], ...(waiting ? { asks: waiting } : {}), ...(cards ? { cards } : {}) });
      }
      case "asks": {
        // D426: the latest lines win, drawn under their message; the event itself is no row.
        const b = ev.body as Bodies["asks"];
        this.bySeq.set(ev.seq, null);
        const at = this.bySeq.get(b.msgSeq);
        if (at?.user) {
          at.asks = b;
          at.revision++;
        } else this.asksWaiting.set(b.msgSeq, b);
        return;
      }
      case "subject_card": {
        // D653: one living card per subject under the message that started the work. It is
        // revised in place, never a row of its own; a key that moved (a task joined its PR) and a
        // helper's card of the same task replace the one before.
        const c = (ev.body as Bodies["subject_card"]).card;
        this.bySeq.set(ev.seq, null);
        const put = (list: SubjectCard[]) => {
          const i = list.findIndex((x) => x.key === c.key || (!!c.taskId && x.taskId === c.taskId));
          if (i >= 0) list[i] = c;
          else list.push(c);
          return list;
        };
        const at = this.bySeq.get(c.msgSeq);
        if (at && (at.user || at.ai || at.job)) {
          at.cards = put([...(at.cards ?? [])]);
          at.revision++;
        } else put(this.cardsWaiting.get(c.msgSeq) ?? this.cardsWaiting.set(c.msgSeq, []).get(c.msgSeq)!);
        return;
      }
      case "finds": {
        const b = ev.body as Bodies["finds"];
        // A quiet morning (D173): nothing sent, nothing shown, not even a header line.
        if (b.quiet) return void this.bySeq.set(ev.seq, null);
        const old = b.revises ? this.notes.get(b.revises) : undefined;
        if (old) {
          old.finds = b;
          old.revision++;
          this.notes.set(b.noteId, old);
          return void this.bySeq.set(ev.seq, old);
        }
        const e: Entry = { ev, firstSeq: ev.seq, revision: 0, finds: b };
        this.notes.set(b.noteId, e);
        return this.add(e);
      }
      case "find_state": {
        const b = ev.body as Bodies["find_state"];
        if (b.state === "sending" || b.state === "sent" || b.state === "unsent" || b.state === "send_failed") this.findSends.set(b.findId, b);
        else this.findStates.set(b.findId, b);
        if (b.decisionId) this.findAsks.set(b.findId, b.decisionId);
        return void this.bySeq.set(ev.seq, null);
      }
      case "ai_msg": {
        const b = ev.body as Bodies["ai_msg"];
        // D418: the partner's line about an own agent's contact tests stands in for their quiet line.
        for (const id of b.pings ?? []) {
          const seq = this.pingAt.get(id);
          const g = seq !== undefined ? this.pings.get(seq) : undefined;
          if (g && !g.told) {
            g.told = true;
            const old = this.bySeq.get(seq!);
            if (old) old.revision++;
          }
        }
        // A task's question in the partner's words (D129) is that question's words, not a
        // message of its own.
        if (b.decisionId) {
          const d = this.decisions.get(b.decisionId);
          if (!d) this.decisions.set(b.decisionId, { decisionId: b.decisionId, question: "", goLabel: "", defaultOption: "hold", reversible: false, seq: 0, said: b.text });
          // research/244 rule 5: the card keeps its own question when the words drop a point or the
          // object; the words are not drawn as a second line restating it.
          else if (keepsPoints(d.question, b.text)) d.said = b.text;
          return void this.bySeq.set(ev.seq, null);
        }
        // D385: a set of to-dos is posted while the partner is still writing its line about it:
        // the card stands under that line (the words introduce it), not above.
        const last = this.channel[this.channel.length - 1];
        entry({ ai: b });
        if (last?.set && !last.set.groupId && ev.seq - last.firstSeq <= 3 && Date.parse(ev.ts) - Date.parse(last.ev.ts) < 120_000) {
          this.channel.splice(this.channel.indexOf(last), 1);
          last.firstSeq = ev.seq + 0.5;
          this.add(last);
        }
        return;
      }
      case "ack": {
        const b = ev.body as Bodies["ack"];
        const j = this.job(b.jobId);
        j.ack = b;
        return entry({ job: j });
      }
      case "job_status": {
        const b = ev.body as Bodies["job_status"];
        // A body_<task>_… note tells the partner the user switched who does a task (D89); the
        // task's own line says it.
        if (ev.origin === "user" && b.jobId.startsWith("body_")) return void this.bySeq.set(ev.seq, null);
        // A user-origin act_<task>_<action> status is the durable record of a button action.
        if (ev.origin === "user" && b.taskId && b.jobId.startsWith(`act_${b.taskId}_`)) {
          // On (re)connect the channel replays before on_hand lists the task: keep it anyway.
          const t = this.task(b.taskId);
          const action = b.jobId.slice(`act_${b.taskId}_`.length);
          t.acted = { action, ok: true };
          t.actedSeq = ev.seq;
          // The Log says it happened: an action whose result was lost resolves here.
          if (t.acting === action) t.acting = undefined;
          if (t.unsure === action) t.unsure = undefined;
          return void this.bySeq.set(ev.seq, null);
        }
        const known = this.jobs.get(b.jobId);
        if (!known) {
          const j = this.job(b.jobId);
          j.status = b;
          return entry({ job: j });
        }
        known.status = b;
        return void this.bySeq.set(ev.seq, null);
      }
      case "living_msg": {
        const old = ev.supersedes ? this.bySeq.get(ev.supersedes) : undefined;
        // A done item that is new in this message, after a merge: more work on that branch, not merged.
        const had = new Set((old?.living?.items ?? []).filter((i) => i.kind === "done").map((i) => i.taskId));
        for (const it of (ev.body as Bodies["living_msg"]).items) {
          const t = it.kind === "done" && !had.has(it.taskId) ? this.tasks.get(it.taskId) : undefined;
          if (t?.acted && ev.seq > (t.actedSeq ?? 0)) t.acted = undefined;
        }
        if (old?.living) {
          old.ev = ev;
          old.living = ev.body as Bodies["living_msg"];
          old.revision++;
          return void this.bySeq.set(ev.seq, old);
        }
        return entry({ living: ev.body as Bodies["living_msg"] });
      }
      case "decision":
        this.addDecision(ev as Ev<"decision">);
        // A find's next step lives inside its note (D165).
        if ((ev.body as Bodies["decision"]).findId) return void this.bySeq.set(ev.seq, null);
        return entry({ decision: ev.body as Bodies["decision"] });
      case "decision_resolved":
        this.resolve(ev.body as Bodies["decision_resolved"]);
        return void this.bySeq.set(ev.seq, null);
      case "memory_noted": {
        const b = ev.body as Bodies["memory_noted"];
        // D329: the memory it took the place of, and whether it waited for Mem when it was said.
        this.noted.push({ seq: ev.seq, title: b.title, ...(b.memoryId ? { memoryId: b.memoryId } : {}), ...(b.replyTo != null ? { replyTo: b.replyTo } : {}), ...(b.replaced?.title ? { replaced: b.replaced.title } : {}), ...(b.waiting ? { waiting: true as const } : {}) });
        return void this.bySeq.set(ev.seq, null);
      }
      case "memory_recalled": {
        // D304: one line under the message it names, never an entry of its own.
        const b = ev.body as Bodies["memory_recalled"];
        if (!this.recalled.has(b.aboutSeq)) this.recalled.set(b.aboutSeq, { ...b, seq: ev.seq });
        const about = this.bySeq.get(b.aboutSeq);
        if (about) about.revision++;
        return void this.bySeq.set(ev.seq, null);
      }
      case "bridge_read": {
        // D619: the latest word on a sent message's readers; it changes that line, never a new one.
        const b = ev.body as Bodies["bridge_read"];
        if (b.opId) this.receipts.set(b.opId, b.receipt);
        if (b.messageId) this.messageReceipts.set(b.messageId, b.receipt);
        for (const e of this.channel) if (e.peer && ((b.opId && e.peer.opId === b.opId) || (b.messageId && e.peer.messageId === b.messageId))) e.revision++;
        for (const e of this.taskPeers) if ((b.opId && e.peer.opId === b.opId) || (b.messageId && e.peer.messageId === b.messageId)) e.peer = { ...e.peer };
        return void this.bySeq.set(ev.seq, null);
      }
      case "bridge_msg": {
        // D170: the quiet lines of the user's other agents (J-Q5's strings): a request, a reply
        // or a message that went out, and once a day a sender set aside. Steps (pending,
        // sending…), answers to ours and messages from before Bridge was on show nothing.
        const b = ev.body as Bodies["bridge_msg"];
        if (b.direction === "in" && b.state === "set_aside") {
          const key = `${b.from}|${ev.ts.slice(0, 10)}`;
          const n = (this.setAside.get(key)?.n ?? 0) + 1;
          const first = this.setAside.get(key)?.seq;
          this.setAside.set(key, { n, seq: first ?? ev.seq });
          if (first !== undefined) {
            const old = this.bySeq.get(first);
            if (old) old.revision++;
            return void this.bySeq.set(ev.seq, null);
          }
          return entry({ peer: b });
        }
        // D418: contact tests that arrive together (a few minutes apart at most) from one of the person's
        // own agents are one line, and the answers Ducter sent them are only that line's last word.
        if (b.direction === "in" && b.state === "ping") {
          const key = `${b.agent ?? b.from ?? ""}|${b.role ?? ""}|${b.host ?? ""}`;
          const at = Date.parse(ev.ts);
          const sent = b.sentAt ? Date.parse(b.sentAt) : undefined;
          const last = this.lastPing;
          const g = last && last.key === key && at - last.at <= 10 * 60_000 ? this.pings.get(last.seq) : undefined;
          if (g && last) {
            g.n++;
            if (sent !== undefined && (g.earliest === undefined || sent < g.earliest)) g.earliest = sent;
            this.pingAt.set(b.messageId, last.seq);
            last.at = at;
            const old = this.bySeq.get(last.seq);
            if (old) old.revision++;
            return void this.bySeq.set(ev.seq, null);
          }
          this.pings.set(ev.seq, { n: 1, ...(sent !== undefined ? { earliest: sent } : {}), sent: new Set(), failed: new Set() });
          this.pingAt.set(b.messageId, ev.seq);
          this.lastPing = { key, seq: ev.seq, at };
          return entry({ peer: b });
        }
        // D470 round 2: one delivered message is one line. A second "sent" for the same op, or the same words
        // sent again in answer to the same message, is the Log saying it twice, never a second message.
        if (b.direction === "out" && b.state === "sent") {
          const key = `${b.inReplyTo ?? ""}|${b.text}`;
          if ((b.opId && this.outOps.get(b.opId)?.b.state === "sent") || (b.inReplyTo && this.sentReplies.has(key))) return void this.bySeq.set(ev.seq, null);
          if (b.inReplyTo) this.sentReplies.add(key);
        }
        if (b.direction === "out" && !b.ack && b.opId && b.text && b.state && ["sending", "sent", "failed", "unknown", "unconfirmed"].includes(b.state)) this.outOps.set(b.opId, { seq: ev.seq, ts: ev.ts, b });
        if (b.direction === "out" && b.ack) {
          const seq = b.inReplyTo ? this.pingAt.get(b.inReplyTo) : undefined;
          const g = seq !== undefined ? this.pings.get(seq) : undefined;
          if (g && b.inReplyTo) {
            if (b.state === "sent") (g.sent.add(b.inReplyTo), g.failed.delete(b.inReplyTo));
            else if (b.state === "failed" || b.state === "unconfirmed") g.failed.add(b.inReplyTo);
            const old = this.bySeq.get(seq!);
            if (old) old.revision++;
          }
          return void this.bySeq.set(ev.seq, null);
        }
        // D448: a task's own follow-up to an agent (no card) is the task's, never a conversation line.
        if ((b.direction === "in" && b.state === "task") || (b.by === "task" && b.state === "sent" && !b.decisionId)) this.taskPeers.push({ ev: { seq: ev.seq, ts: ev.ts }, peer: b });
        const show = b.direction === "in" ? !b.state && !b.inReplyTo : b.state === "sent" && !!b.text && !(b.by === "task" && !b.decisionId);
        return show ? entry({ peer: b }) : void this.bySeq.set(ev.seq, null);
      }
      case "todo_set": {
        // D385: the latest word on a set (handed over: its group) updates the card where it first stood.
        const b = ev.body as Bodies["todo_set"];
        const had = this.channel.find((x) => x.set?.setId === b.setId);
        if (had) {
          had.set = b;
          had.revision++;
          return void this.bySeq.set(ev.seq, null);
        }
        return entry({ set: b });
      }
      case "read_receipt":
        this.readUpTo = Math.max(this.readUpTo, (ev.body as Bodies["read_receipt"]).upToSeq);
        return void this.bySeq.set(ev.seq, null);
      default:
        this.bySeq.set(ev.seq, null);
    }
  }

  /** D509: an older page can be asked for now (something held, not all of it, none on its way). */
  moreOlder(): boolean {
    return this.welcomed && this.older.from > 1 && !this.older.done && !this.older.asked;
  }

  /**
   * D509: an older page of the conversation joins what is held. It is older than everything here,
   * so it is folded on a scratch store of its own, in seq order as the Log wrote it, then joined:
   * its rows go in front, and what it knows of a job, a decision, a find or a set fills in only what
   * this store does not know yet (what is held came later and wins). A wait from back then is
   * history, not news: it changes nothing.
   */
  private applyOlder(f: Extract<ServerFrame, { t: "channel_history" }>) {
    if (!f.beforeSeq || f.beforeSeq !== this.older.asked) return; // another conversation's, or an old socket's
    this.older.asked = 0;
    const evs = f.events.filter((e) => e.stream === "channel" && e.seq < f.beforeSeq);
    if (!f.more || !evs.length) this.older.done = true;
    if (!evs.length) return;
    const sc = new Store();
    sc.welcomed = true;
    for (const ev of evs) sc.applyEvent(ev);
    const revised = new Set<string>();
    for (const [id, e] of this.notes) {
      revised.add(id);
      if (e.finds?.revises) revised.add(e.finds.revises);
    }
    const jobRow = new Map(this.channel.flatMap((e) => (e.job ? [[e.job.id, e] as const] : [])));
    const setShown = new Set(this.channel.flatMap((e) => (e.set ? [e.set.setId] : [])));
    const added = new Set<Entry>();
    const front: Entry[] = [];
    const moved = new Set<Entry>(); // a job's line here, from a status before its ack came: it moves to its first word
    for (const e of sc.channel) {
      if (this.bySeq.has(e.firstSeq)) continue;
      if (e.finds && revised.has(e.finds.noteId)) continue;
      if (e.set && setShown.has(e.set.setId)) continue;
      if (e.peer?.direction === "in" && e.peer.state === "set_aside" && this.setAside.has(`${e.peer.from}|${e.ev.ts.slice(0, 10)}`)) continue;
      if (e.job) {
        const j = this.jobs.get(e.job.id);
        if (j) {
          j.ack ??= e.job.ack;
          j.status ??= e.job.status;
          const row = jobRow.get(j.id);
          if (row) (moved.add(row), this.bySeq.set(row.firstSeq, null));
          e.job = j;
        }
      }
      if (e.user) {
        const w = this.asksWaiting.get(e.ev.seq);
        if (w) (e.asks = w), this.asksWaiting.delete(e.ev.seq); // the latest lines came first
        const cw = this.cardsWaiting.get(e.ev.seq);
        if (cw) (e.cards = cw), this.cardsWaiting.delete(e.ev.seq);
      }
      added.add(e);
      front.push(e);
    }
    this.channel = front.concat(moved.size ? this.channel.filter((e) => !moved.has(e)) : this.channel);
    for (const [seq, e] of sc.bySeq) if (!this.bySeq.has(seq)) this.bySeq.set(seq, e && added.has(e) ? e : null);
    const fill = <K, V>(dst: Map<K, V>, src: Map<K, V>, ok: (v: V) => boolean = () => true) => {
      for (const [k, v] of src) if (!dst.has(k) && ok(v)) dst.set(k, v);
    };
    fill(this.jobs, sc.jobs);
    for (const [id, d] of sc.decisions) {
      const m = this.decisions.get(id);
      if (!m) this.decisions.set(id, d);
      else if (!m.seq) this.decisions.set(id, { ...d, ...m, ...pick(d), said: m.said ?? d.said }); // known only by what came later
    }
    fill(this.findStates, sc.findStates);
    fill(this.findSends, sc.findSends);
    fill(this.findAsks, sc.findAsks);
    fill(this.calRuns, sc.calRuns);
    fill(this.notes, sc.notes, (e) => added.has(e));
    fill(this.recalled, sc.recalled);
    fill(this.outOps, sc.outOps);
    for (const [k, v] of sc.receipts) if (!this.receipts.has(k)) this.receipts.set(k, v);
    for (const [k, v] of sc.messageReceipts) if (!this.messageReceipts.has(k)) this.messageReceipts.set(k, v);
    fill(this.pings, sc.pings);
    fill(this.pingAt, sc.pingAt);
    fill(this.asksWaiting, sc.asksWaiting);
    fill(this.cardsWaiting, sc.cardsWaiting);
    for (const [k, v] of sc.setAside) {
      const had = this.setAside.get(k);
      this.setAside.set(k, had ? { n: had.n + v.n, seq: had.seq } : v);
    }
    for (const k of sc.sentReplies) this.sentReplies.add(k);
    const notedHas = new Set(this.noted.map((n) => n.seq));
    this.noted = sc.noted.filter((n) => !notedHas.has(n.seq)).concat(this.noted);
    this.taskPeers = sc.taskPeers.concat(this.taskPeers);
    this.readUpTo = Math.max(this.readUpTo, sc.readUpTo);
    this.lastUserSeq = Math.max(this.lastUserSeq, sc.lastUserSeq);
    for (const ev of evs) if (ev.seq < this.older.from) this.older.from = ev.seq;
  }

  /** D619: what Mem last said about who opened one message Ducter sent, if anything. */
  /**
   * D656: the latest message a task sent through Bridge that hasn't been answered. A task
   * resting on it waits for an answer that will come to it, so it has not stopped.
   */
  bridgeWaitFor(taskId: string): Bodies["bridge_msg"] | undefined {
    const answered = new Set<string>();
    for (const e of [...this.channel, ...this.taskPeers]) {
      const b = e.peer;
      if (b && b.direction === "in" && b.state === "task" && b.inReplyTo) answered.add(b.inReplyTo);
    }
    let best: { seq: number; b: Bodies["bridge_msg"] } | undefined;
    for (const o of this.outOps.values()) {
      const b = o.b;
      if (b.by === "task" && b.taskId === taskId && b.state === "sent" && b.messageId && !answered.has(b.messageId) && (!best || o.seq > best.seq)) best = { seq: o.seq, b };
    }
    return best?.b;
  }

  receiptOf(b?: { opId?: string; messageId?: string }): BridgeReceipt | undefined {
    if (!b) return undefined;
    return (b.opId ? this.receipts.get(b.opId) : undefined) ?? (b.messageId ? this.messageReceipts.get(b.messageId) : undefined);
  }

  /** D619: the newest sent message of a task that has a receipt, for a helper's round. */
  receiptOfTask(taskId: string | undefined): BridgeReceipt | undefined {
    if (!taskId) return undefined;
    let best: BridgeReceipt | undefined;
    let seq = -1;
    for (const e of [...this.channel, ...this.taskPeers]) {
      const p = e.peer;
      if (!p || p.direction !== "out" || p.taskId !== taskId || e.ev.seq <= seq) continue;
      const r = this.receiptOf(p);
      if (r) (best = r), (seq = e.ev.seq);
    }
    return best;
  }

  private add(e: Entry) {
    this.bySeq.set(e.ev.seq, e);
    let i = this.channel.length;
    while (i > 0 && this.channel[i - 1]!.firstSeq > e.firstSeq) i--;
    this.channel.splice(i, 0, e);
  }

  private job(id: string): Job {
    let j = this.jobs.get(id);
    if (!j) this.jobs.set(id, (j = { id }));
    return j;
  }

  /** D382: what Ask me later's events do to a card (shared fixture: packages/protocol/fixtures/later-events.json). */
  applyLater(ev: LogEvent) {
    const id = (ev.body as { decisionId: string }).decisionId;
    const d = this.decisions.get(id);
    if (!d) return;
    if (ev.kind === "decision_later") (d.later = (ev.body as Bodies["decision_later"]).until), delete d.backAt;
    else if (ev.kind === "decision_seen") d.defaultAt = (ev.body as Bodies["decision_seen"]).defaultAt;
    else if (ev.kind === "decision_back") {
      const b = ev.body as Bodies["decision_back"];
      delete d.later;
      if (b.by === "time") d.backAt = ev.ts;
      if (b.defaultAt) d.defaultAt = b.defaultAt;
      else delete d.defaultAt; // its countdown waits until it is seen
    }
  }

  private addDecision(ev: Ev<"decision">) {
    const d = this.decisions.get(ev.body.decisionId);
    if (d) {
      Object.assign(d, ev.body);
      if (!d.seq) (d.seq = ev.seq), (d.askedAt = ev.ts);
      return;
    }
    this.decisions.set(ev.body.decisionId, { ...ev.body, seq: ev.seq, askedAt: ev.ts });
  }

  private resolve(r: Bodies["decision_resolved"]) {
    let d = this.decisions.get(r.decisionId);
    if (!d) {
      d = { decisionId: r.decisionId, question: "", goLabel: "", defaultOption: "hold", reversible: false, seq: 0 };
      this.decisions.set(r.decisionId, d);
    }
    d.resolved = r;
    d.pending = "";
    delete d.elsewhere;
  }

  /** D481: the ids to ask the home for (asks_get), each once a socket; filled by an On hand that disagrees with what is held. */
  asksWanted: string[] = [];
  private asksAsked = new Set<string>();

  /**
   * D481: On hand's openAsks is the one source of truth for "open". A question held open here that
   * the home no longer has open, asked at or before the snapshot, closes now (its resolution was
   * missed: a socket that slept, a replay before D481); one open at the home that isn't held here
   * (asked before what this client loaded) is asked for. Either way the home's own events follow.
   */
  reconcileAsks(a: { ids: string[]; asOf: number }) {
    const open = new Set(a.ids);
    const want = (id: string) => {
      if (this.asksAsked.has(id)) return;
      this.asksAsked.add(id);
      this.asksWanted.push(id);
    };
    for (const d of this.decisions.values()) {
      if (d.resolved || open.has(d.decisionId) || d.seq > a.asOf) continue;
      d.resolved = { decisionId: d.decisionId, option: d.pending || "hold", by: "ended", settled: true };
      d.pending = "";
      d.elsewhere = true;
      want(d.decisionId);
    }
    for (const id of open) {
      const d = this.decisions.get(id);
      if (!d || !d.question) want(id);
    }
  }

  /** D481: what to ask the home for now (and forget, so it goes once). */
  takeAsksWanted(): string[] {
    return this.asksWanted.splice(0);
  }

  /** An event into the task's held events, in seq order (D320: by bisection, a page lands far up too). */
  private insert(t: Task, ev: LogEvent) {
    const last = t.events.at(-1);
    if (!last || last.seq < ev.seq) t.events.push(ev);
    else t.events.splice(lowerBound(t.events, ev.seq), 0, ev);
    t.version++;
    // D320: a task nobody has open keeps its newest WINDOW.cap events.
    if (!this.open.has(t.id) && t.events.length > 2600) {
      const keep = t.index ? keepFor(t.index, t.events, undefined) : [{ from: t.events[t.events.length - 2000]!.seq, to: Infinity }];
      if (keep) this.evict(t.id, keep);
    }
  }

  /** D320: the tasks open on a screen of this client (their window is kept by what is on screen). */
  open = new Set<string>();

  private applyTask(t: Task, ev: LogEvent) {
    this.insert(t, ev);
    switch (ev.kind) {
      case "task_open":
        // A retitle is a later task_open for the same task: the latest names it, the first dates it.
        if (!t.open || ev.seq >= (t.openSeq ?? 0)) (t.open = ev.body as Bodies["task_open"]), (t.openSeq = ev.seq);
        if (!t.openedAt || ev.ts < t.openedAt) t.openedAt = ev.ts;
        break;
      case "task_state":
        if (ev.seq >= (t.stateSeq ?? 0)) (t.state = ev.body as Bodies["task_state"]), (t.stateSeq = ev.seq);
        break;
      case "task_event": {
        const b = ev.body as Bodies["task_event"];
        if (b.role === "user" && b.from !== "partner") {
          const sd = t.sends.find((s) => !s.seq && (b.clientId ? s.clientId === b.clientId : s.text === b.text));
          if (sd) sd.seq = ev.seq;
        }
        // D325: the agent took these steers in.
        const read = b.role === "system" ? (b.raw as { read?: unknown } | undefined)?.read : undefined;
        if (Array.isArray(read)) for (const n of read) if (typeof n === "number") (t.reads ??= new Set()).add(n);
        const br = b.role === "system" ? (b.raw as { browser?: { host?: string; own?: boolean } } | undefined)?.browser : undefined;
        if (br?.host && (!t.browser || t.browser.seq < ev.seq)) t.browser = { host: br.host, ...(br.own ? { own: true } : {}), seq: ev.seq };
        // D617: what memory brought into the first turn, once; older events have only ids.
        const rec = b.role === "system" ? (b.raw as { memory?: string; recalled?: RecalledMemory[] } | undefined) : undefined;
        if (rec?.memory === "recall" && Array.isArray(rec.recalled)) {
          const notes = rec.recalled.filter((n) => !!n && typeof n.title === "string" && n.title.trim() && (n.via === "preferences" || n.via === "search"));
          if (notes.length) t.recalled = notes;
        }
        break;
      }
      case "report": {
        const b = ev.body as Bodies["report"];
        // An older page landing after the newest: the latest report stays the latest.
        if (ev.seq >= (t.lastReportSeq ?? 0)) (t.lastReport = b), (t.lastReportSeq = ev.seq);
        if (t.acted && ev.seq > (t.actedSeq ?? 0)) t.acted = undefined;
        for (const e of b.evidence ?? []) if (!t.evidence.some((h) => h.ref === e.ref && h.label === e.label)) t.evidence.push(e);
        // D339: the ask for the person's own phone says the task works on it.
        for (const q of b.questions ?? []) if (q.handset && q.handset.kind !== "record" && q.handset.device) t.phone = { device: q.handset.device, name: q.handset.name };
        break;
      }
      case "body_selected":
        if (!t.body || ev.seq >= (t.bodySeq ?? 0)) {
          const b = ev.body as Bodies["body_selected"];
          (t.body = { harness: b.harness, ...(b.model ? { model: b.model } : {}), ...(b.effort ? { effort: b.effort } : {}), why: b.why }), (t.bodySeq = ev.seq);
        }
        break;
      case "checkpoint":
        t.checkpoints.push({ text: (ev.body as Bodies["checkpoint"]).text, seq: ev.seq, ts: ev.ts });
        t.checkpoints.sort((a, b) => a.seq - b.seq);
        break;
    }
  }

  // ---------- after a reconnect ----------

  /** What to send again after a welcome, in order: messages to the partner not yet echoed, then
   *  direct task messages not yet acked. Core dedupes both by clientId, so a copy it already has
   *  is echoed (or acked) again, never appended twice. */
  resends(pending: { clientId: string; text: string; media?: string[]; reply?: import("@ducter/protocol").ReplyWant; refs?: import("@ducter/protocol").Ref[] }[]): ClientFrame[] {
    const echoed = new Set<string>();
    for (const e of this.channel) if (e.user?.clientId) echoed.add(e.user.clientId);
    const out: ClientFrame[] = pending.filter((p) => !echoed.has(p.clientId)).map((p) => ({ t: "send", text: p.text, clientId: p.clientId, ...(p.media?.length ? { media: p.media } : {}), ...(p.reply ? { reply: p.reply } : {}), ...(p.refs?.length ? { refs: p.refs } : {}) }));
    for (const t of this.tasks.values())
      for (const sd of t.sends)
        if (sd.clientId && !sd.delivered && !sd.failed && (!sd.pics || sd.media)) out.push({ t: "task_send", taskId: t.id, text: sd.text, clientId: sd.clientId, ...(sd.media?.length ? { media: sd.media } : {}), ...(sd.mode ? { mode: sd.mode } : {}), ...(sd.refs?.length ? { refs: sd.refs } : {}) });
    return out;
  }

  /** Once the replay after a welcome is in (on_hand): an action sent on the old socket that is
   *  still acting got no result and the Log doesn't show it done, so it is unsure. */
  settleInDoubt(inDoubt: Map<string, string>) {
    for (const [id, action] of inDoubt) {
      const t = this.tasks.get(id);
      if (t && t.acting === action) (t.acting = undefined), (t.unsure = action);
    }
  }

  // ---------- derived ----------

  openDecisions(): DecisionState[] {
    return [...this.decisions.values()]
      // D608: the count and every list read one predicate (protocol's open-asks.ts): an offer
      // (D453), a question put off (D382) and one whose default is already due are not open here.
      .filter((d) => askOpen(d, { resolved: !!d.resolved, pending: d.pending, later: d.later }))
      .filter((d) => {
        const t = d.taskId ? this.tasks.get(d.taskId) : undefined;
        return !t || laneOf(attention(t)) !== LANE.hidden;
      })
      .sort((a, b) => (a.askedAt ?? "").localeCompare(b.askedAt ?? "") || a.decisionId.localeCompare(b.decisionId));
  }

  /** The partner's own asks (no task), which On hand shows on their own. */
  partnerDecisions() {
    // D193: a question from a live call goes first: someone is waiting on the line.
    const q = (d: DecisionState) => (d.call?.kind === "question" ? 0 : 1);
    return this.openDecisions()
      .filter((d) => !d.taskId)
      .sort((a, b) => q(a) - q(b));
  }

  pendingDecision(taskId: string): DecisionState | undefined {
    let best: DecisionState | undefined;
    for (const d of this.decisions.values()) if (d.taskId === taskId && !d.resolved && (!best || d.seq > best.seq)) best = d;
    if (!best) {
      const id = this.tasks.get(taskId)?.card?.pendingDecisionId;
      const d = id ? this.decisions.get(id) : undefined;
      if (d && !d.resolved) return d;
    }
    return best;
  }

  decisionShownInLiving(id: string) {
    return this.channel.some((e) => e.living?.items.some((it) => it.decisionId === id));
  }

  armedWaiters() {
    return [...this.waiters.values()].filter((w) => w.state === "armed").sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") || a.waiterId.localeCompare(b.waiterId));
  }

  /** D145: waits that ended unmet today, newest first. */
  missedToday(now = Date.now()) {
    const day = new Date(now).toDateString();
    return [...this.missed.values()].filter((w) => new Date(w.endedAt).toDateString() === day).sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  }

  waiterFor(taskId: string) {
    return this.armedWaiters().find((w) => w.taskId === taskId);
  }

  /** Routines (D114), proposed ones included (their proposal card), newest last. */
  routines(): RoutineView[] {
    return this.onHand?.routines ?? [];
  }

  routine(id: string | undefined): RoutineView | undefined {
    return id ? this.routines().find((r) => r.routineId === id) : undefined;
  }

  /** Whether a task's wait came true in the last moment: its card arrives with the pop and glide. */
  justArrived(taskId: string, now = Date.now(), ms = 1600): boolean {
    const at = this.arrived.get(taskId);
    return at !== undefined && now - at < ms;
  }

  /** A task's `until` loop and its tries (D113). */
  untilOf(t: Task): UntilView | undefined {
    return t.card?.until;
  }

  /** What a waiting task's checks saw, oldest first (waiter_look on its stream). */
  looksOf(t: Task): Bodies["waiter_look"][] {
    return t.events.filter((e) => e.kind === "waiter_look").map((e) => e.body as Bodies["waiter_look"]);
  }

  /** Tasks by lane (snapshot order, stream-only tasks first, newest first) and counts. */
  board() {
    const lanes: Task[][] = [[], [], [], []];
    const seen = new Set<string>();
    const fromSnap: Task[] = [];
    for (const c of this.onHand?.tasks ?? []) {
      const t = this.tasks.get(c.taskId);
      if (t && !seen.has(t.id)) seen.add(t.id), fromSnap.push(t);
    }
    // D454: what the person removed from Tasks (移走) stays off it, here at once and on every device.
    const away = new Set([...(this.onHand?.away ?? []), ...this.awayNow]);
    // A task the snapshot doesn't hold (just opened) still shows; one that finished over a day ago
    // is the home's to drop (it left On hand), never kept here from the Log for ever.
    const now = Date.now();
    const stale = (t: Task) => !!this.onHand && finished(t) && now - Date.parse(t.card?.updatedAt ?? t.events.at(-1)?.ts ?? "") > 24 * 3600_000;
    const extra = [...this.tasks.values()].filter((t) => !seen.has(t.id) && (t.open || t.card) && !stale(t)).sort((a, b) => (b.events[0]?.seq ?? 0) - (a.events[0]?.seq ?? 0));
    for (const t of [...extra, ...fromSnap]) {
      if (away.has(t.id)) continue;
      // D661 (research/245 §3.3): a PR shown under its holder's row appears once, never twice.
      if (t.card?.heldUnder) continue;
      const l = laneOf(attention(t));
      if (l !== LANE.hidden) lanes[l]!.push(t);
    }
    return { lanes, counts: { needs_you: lanes[0]!.length, working: lanes[1]!.length, waiting: lanes[2]!.length, done_today: doneTodayOf(lanes[3]!) } }; // D310
  }

  unread(e: Entry) {
    return e.ev.seq > this.readUpTo;
  }

  /** The tasks the jobs answering a user message started. */
  tasksOfReply(replyTo: number): string[] {
    const ids: string[] = [];
    for (const j of this.jobs.values()) if (j.ack?.replyTo === replyTo && j.status?.taskId) ids.push(j.status.taskId);
    return ids.sort();
  }
}

// ---------- results (I-results): evidence order and the Outside line ----------

const RANK: Record<string, number> = { test: 0, ci: 1, diff: 2, file: 3, log: 4, url: 5 };
export const sortEvidence = (evs: EvidenceRef[]) => [...evs].sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9));
export const machineChecked = (kind: string) => ["test", "ci", "diff", "file"].includes(kind);

/** The evidence a Done row names, as on the desktop: the best machine-checked kind, its latest
 *  entry (a task reports "bun test before" then "bun test after": the row says after). */
export function headlineEvidence(evs: EvidenceRef[]): EvidenceRef | undefined {
  const sorted = sortEvidence(evs.filter((e) => !isRepro(e)));
  const first = sorted[0];
  if (!first || !machineChecked(first.kind)) return undefined;
  return sorted.filter((e) => e.kind === first.kind).at(-1);
}

/** A run that shows the problem before the fix (a reproduction): it failed on purpose, so it never
 *  gets a ✓. A report carries no pass or fail per check, so its label says it: "bun test before
 *  fix", "repro", "修之前", or failing words with no pass in them ("3 failing"). */
export function isRepro(e: EvidenceRef): boolean {
  if (!["test", "ci", "log"].includes(e.kind)) return false;
  const l = e.label;
  if (/\b(after)\b|修好后|改完|之后/i.test(l)) return false;
  if (/\b(before|repro\w*|reproduc\w*)\b|修之前|修复前|改之前|复现/i.test(l)) return true;
  return /\b(fails|failing|failed|broken)\b|失败|报错|没过/i.test(l) && !/\bpass|通过|全过/i.test(l);
}

/** Ducter's own tools a task calls (its reports, saved progress, reading the Log): plumbing,
 *  never shown as something the task did. Every harness's MCP tool is mcp__<server>__<tool>. */
export function isPlumbing(name: string): boolean {
  return /^mcp__ducter[\w-]*__/.test(name) || ["report_to_main", "checkpoint", "log_search", "log_read"].includes(name);
}

/** How many files the task's edits touched, from its transcript (the phone has no diff). */
export function editedFiles(t: Task): number {
  const files = new Set<string>();
  for (const ev of t.events) {
    const tool = ev.kind === "task_event" ? (ev.body as Bodies["task_event"]).tool : undefined;
    if (!tool || tool.ok === false || !["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool.name)) continue;
    const input = tool.input as Record<string, unknown> | undefined;
    const path = input && typeof input === "object" ? String(input.file_path ?? input.path ?? input.notebook_path ?? "") : "";
    if (path) files.add(path);
  }
  return files.size;
}

/** When the task's latest final report (done, or didn't work) came in; NaN when not known. */
export function finalAt(t: Task): number {
  for (let i = t.events.length - 1; i >= 0; i--) {
    const ev = t.events[i]!;
    if (ev.kind !== "report") continue;
    const st = (ev.body as Bodies["report"]).state;
    if (st === "done" || st === "failed") return Date.parse(ev.ts);
  }
  // The stream isn't loaded (a task's events come on demand): the card says when it last changed.
  const r = t.card?.lastReport;
  return r && (r.state === "done" || r.state === "failed") && t.card?.updatedAt ? Date.parse(t.card.updatedAt) : NaN;
}

/** A result's How I know: its own report's evidence. A follow-up's result doesn't re-show the
 *  first round's checks; the task's dossier keeps them all. */
export function resultEvidence(t: Task): EvidenceRef[] {
  const r = reportOf(t);
  return r?.evidence?.length ? r.evidence : t.evidence;
}

/** One evidence item per kind+label: the latest (a second "bun test" supersedes the first). */
export function latestByLabel(evs: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  const out: EvidenceRef[] = [];
  for (let i = evs.length - 1; i >= 0; i--) {
    const k = evs[i]!.kind + "|" + evs[i]!.label;
    if (!seen.has(k)) seen.add(k), out.unshift(evs[i]!);
  }
  return out;
}

/** D496: a command that sent something out of the task's place (by its grammar; outward.ts). */
export const isOutside = (cmd: string) => outwardOf(cmd).length > 0;

function commandOf(tool: NonNullable<Bodies["task_event"]["tool"]>): string {
  const input = tool.input as unknown;
  if (input && typeof input === "object") {
    for (const k of ["command", "cmd"]) {
      const v = (input as Record<string, unknown>)[k];
      if (typeof v === "string") return v;
    }
    return "";
  }
  if (typeof input !== "string" || tool.name.toLowerCase() !== "bash") return "";
  // A harness that hands its input over as JSON text (seen on hel, 2026-11-21): the command inside.
  if (input.trimStart().startsWith("{")) {
    try {
      const o = JSON.parse(input) as Record<string, unknown>;
      return typeof o.command === "string" ? o.command : typeof o.cmd === "string" ? o.cmd : input;
    } catch {}
  }
  return input;
}

function firstLine(s: string) {
  s = s.trim();
  const i = s.indexOf("\n");
  if (i >= 0) s = s.slice(0, i) + " …";
  return s.length > 100 ? s.slice(0, 100) + "…" : s;
}

/** D496: one thing the task sent out, gathered: the same act on the same thing is one row with a
 *  count, a PR's edits are one row with every field it changed; the commands stay for a hover. */
export interface OutsideRow {
  seq: number;
  act: OutwardAct;
  count: number;
  commands: string[];
}

/** What the transcript shows the task sent out of its place, oldest first (D496: what went out, never what stayed). */
export function outsideActs(t: Task): OutsideRow[] {
  const rows: OutsideRow[] = [];
  const byKey = new Map<string, OutsideRow>();
  for (const ev of t.events) {
    if (ev.kind !== "task_event") continue;
    const tool = (ev.body as Bodies["task_event"]).tool;
    if (!tool || tool.ok === false) continue;
    const cmd = commandOf(tool);
    if (!cmd) continue;
    for (const a of outwardOf(cmd, tool.output ?? "")) {
      // A push that names no branch pushed the task's own.
      const own = (placeOf(t) as { branch?: string }).branch;
      const act = a.kind === "push" && !a.target && own ? { ...a, target: own } : a;
      const key = `${act.kind}|${act.n ?? ""}|${act.target ?? ""}|${act.review ?? ""}`;
      const row = byKey.get(key);
      const line = firstLine(cmd);
      if (!row) {
        const r: OutsideRow = { seq: ev.seq, act: { ...act, ...(act.fields ? { fields: [...act.fields] } : {}) }, count: 1, commands: [line] };
        byKey.set(key, r);
        rows.push(r);
        continue;
      }
      if (act.kind === "pr_edit" || act.kind === "issue_edit") {
        // Edits of one PR are one row: what it changed, together.
        const f = new Set([...(row.act.fields ?? []), ...(act.fields ?? [])]);
        if (f.size) row.act.fields = [...f];
      } else row.count++;
      if (!row.commands.includes(line)) row.commands.push(line);
    }
  }
  return rows;
}

/** What looks like a credential (G-safety): held back before it is sent. */
const SECRET = /ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{6,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
export const looksSecret = (text: string) => SECRET.test(text);
