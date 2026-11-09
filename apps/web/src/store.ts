// The phone's model of the Log: a port of the desktop store (apps/desktop/internal/store) so both
// clients fold the same events the same way: living messages revised in place, jobs folded into
// their acks, decisions with their resolutions, tasks with their streams, the On hand snapshot.
// Pure data; tested without a DOM.
import { endedUnmet } from "@ducter/protocol";
import type { ActivityStep, Attention, Bodies, ClientFrame, Delivery, EvidenceRef, FolderChanges, LogEvent, OnHand, Place, RoutineView, ServerFrame, TaskBody, TaskCard, UndoConfirm, UntilView, WaiterView } from "@ducter/protocol";
import { hasBranchChanges } from "@ducter/protocol";

export type Ev<K extends keyof Bodies = keyof Bodies> = LogEvent<K>;

export interface Job {
  id: string;
  ack?: Bodies["ack"];
  status?: Bodies["job_status"];
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
}

export type DecisionState = Bodies["decision"] & {
  seq: number;
  askedAt?: string;
  resolved?: Bodies["decision_resolved"];
  pending?: "go" | "hold" | "reply" | "";
  /** A task's question in the partner's own words (D129); the task's wording stays in question. */
  said?: string;
};

export interface Send {
  text: string;
  /** The id it was sent with; a resend after a reconnect uses the same one (core dedupes). */
  clientId?: string;
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
  openedAt?: string;
  openSeq?: number; // seq of the task_open in `open` (a retitle is a later one)
  sends: Send[];
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

export const title = (t: Task) => t.open?.title || t.card?.title || "";
export const attention = (t: Task): Attention => t.state?.attention ?? t.card?.attention ?? "queued";
export const reasonOf = (t: Task) => t.state?.reason || t.card?.reason || "";
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
export const whoOf = (t: Task): TaskBody | undefined => t.body ?? t.card?.body;
export const harnessOf = (t: Task) => whoOf(t)?.harness || t.open?.harness || t.card?.harness || "";
export const modelOf = (t: Task) => { const w = whoOf(t); return w ? w.model ?? "" : t.open?.model || t.card?.model || ""; };
export const projectOf = (t: Task) => t.open?.project ?? t.card?.project ?? "";
export const bodyReasonOf = (t: Task) => t.open?.bodyReason || t.card?.bodyReason || "";
export const finished = (t: Task) => ["done", "done_claimed", "failed"].includes(attention(t));

function taskOf(ev: LogEvent): string {
  const b = ev.body as { taskId?: string };
  if (["task_open", "task_state", "task_event", "report", "checkpoint", "body_selected"].includes(ev.kind) && b.taskId) return b.taskId;
  return ev.stream.startsWith("task:") ? ev.stream.slice(5) : "";
}

export class Store {
  persona = "";
  personaName = "Ducter";
  headSeq = 0;
  cursor = 0;
  readUpTo = 0;
  channelSeq = 0;
  welcomed = false;
  channel: Entry[] = [];
  bySeq = new Map<number, Entry | null>();
  jobs = new Map<string, Job>();
  decisions = new Map<string, DecisionState>();
  tasks = new Map<string, Task>();
  onHand?: OnHand;
  waiters = new Map<string, WaiterView>();
  /** D144: task-less waits that ended unmet today: the finished area keeps them, with Keep waiting. */
  missed = new Map<string, Bodies["waiter"] & { endedAt: string }>();
  /** Tasks whose wait just came true, and when (for the pop and glide, D115). */
  arrived = new Map<string, number>();
  errors: string[] = [];
  /** 记下了 / Noted lines in the channel, shown inside the Details of the reply they belong to (D104). */
  noted: { seq: number; title: string; memoryId?: string; replyTo?: number }[] = [];
  /** What the partner is doing while the user waits (D104): its step, when this client first saw
   *  that step (local clock, so a skewed server clock can't make it look slow), and the channel
   *  seq at which a turn last ended (a user message at or before it has had its turn). */
  activity?: { step: ActivityStep; at: number };
  activityEndedAt = 0;
  actionResults: Extract<ServerFrame, { t: "action_result" }>[] = [];

  /** A welcome from a Log that no longer holds what we've seen (its data was reset). */
  stale(f: ServerFrame) {
    return f.t === "welcome" && this.cursor > 0 && f.headSeq < this.cursor;
  }

  task(id: string): Task {
    let t = this.tasks.get(id);
    if (!t) {
      t = { id, checkpoints: [], evidence: [], events: [], seqs: new Set(), historyLoaded: false, sends: [] };
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
        return;
      case "sent": {
        const sd = this.tasks.get(f.taskId)?.sends.find((s) => !s.delivered && !s.failed);
        if (sd) sd.delivered = f.delivered;
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
      case "folder_changes": {
        const ft = this.tasks.get(f.taskId);
        if (ft) ft.folder = f.changes ?? undefined;
        return;
      }
      case "task_history": {
        const t = this.task(f.taskId);
        for (const ev of f.events) this.applyEvent(ev);
        t.historyLoaded = true;
        return;
      }
      case "activity":
        if (!f.activity) {
          this.activity = undefined;
          this.activityEndedAt = this.channelSeq;
        } else if (this.activity?.step !== f.activity.step) this.activity = { step: f.activity.step, at: Date.now() };
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
      }
      t.state = { taskId: card.taskId, attention: card.attention, residency: card.residency, reason: card.reason };
      if (card.lastReport) t.lastReport = card.lastReport;
    }
  }

  applyEvent(ev: LogEvent) {
    const taskId = taskOf(ev);
    if (taskId) {
      const t = this.task(taskId);
      if (!t.seqs.has(ev.seq)) {
        t.seqs.add(ev.seq);
        this.applyTask(t, ev);
      }
    }
    if (ev.kind === "waiter") {
      const w = ev.body as Bodies["waiter"];
      // The moment a task's wait comes true (D115): its card pops and glides to Working.
      if (w.state === "fired" && w.taskId && (w.check || w.event)) this.arrived.set(w.taskId, Date.now());
      // A routine's watch lives on its card (D114), not as a wait.
      if (w.state === "armed" && !w.routineId) this.waiters.set(w.waiterId, { ...this.waiters.get(w.waiterId), ...w });
      else this.waiters.delete(w.waiterId);
      if (w.state === "armed") this.missed.delete(w.waiterId);
      else if (endedUnmet(w)) this.missed.set(w.waiterId, { ...w, endedAt: ev.ts });
    }
    if (ev.stream !== "channel") {
      if (ev.kind === "decision") this.addDecision(ev as Ev<"decision">);
      if (ev.kind === "decision_resolved") this.resolve(ev.body as Bodies["decision_resolved"]);
      return;
    }
    if (this.bySeq.has(ev.seq)) return;
    if (ev.kind !== "read_receipt") this.channelSeq = Math.max(this.channelSeq, ev.seq);
    const entry = (e: Partial<Entry>) => this.add({ ev, firstSeq: ev.seq, revision: 0, ...e });
    switch (ev.kind) {
      case "user_msg":
        return entry({ user: ev.body as Bodies["user_msg"] });
      case "ai_msg": {
        const b = ev.body as Bodies["ai_msg"];
        // A task's question in the partner's words (D129) is that question's words, not a
        // message of its own.
        if (b.decisionId) {
          const d = this.decisions.get(b.decisionId);
          if (d) d.said = b.text;
          else this.decisions.set(b.decisionId, { decisionId: b.decisionId, question: "", goLabel: "", defaultOption: "hold", reversible: false, seq: 0, said: b.text });
          return void this.bySeq.set(ev.seq, null);
        }
        return entry({ ai: b });
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
        return entry({ decision: ev.body as Bodies["decision"] });
      case "decision_resolved":
        this.resolve(ev.body as Bodies["decision_resolved"]);
        return void this.bySeq.set(ev.seq, null);
      case "memory_noted": {
        const b = ev.body as Bodies["memory_noted"];
        this.noted.push({ seq: ev.seq, title: b.title, ...(b.memoryId ? { memoryId: b.memoryId } : {}), ...(b.replyTo != null ? { replyTo: b.replyTo } : {}) });
        return void this.bySeq.set(ev.seq, null);
      }
      case "read_receipt":
        this.readUpTo = Math.max(this.readUpTo, (ev.body as Bodies["read_receipt"]).upToSeq);
        return void this.bySeq.set(ev.seq, null);
      default:
        this.bySeq.set(ev.seq, null);
    }
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
  }

  private applyTask(t: Task, ev: LogEvent) {
    let i = t.events.length;
    while (i > 0 && t.events[i - 1]!.seq > ev.seq) i--;
    t.events.splice(i, 0, ev);
    switch (ev.kind) {
      case "task_open":
        // A retitle is a later task_open for the same task: the latest names it, the first dates it.
        if (!t.open || ev.seq >= (t.openSeq ?? 0)) (t.open = ev.body as Bodies["task_open"]), (t.openSeq = ev.seq);
        if (!t.openedAt || ev.ts < t.openedAt) t.openedAt = ev.ts;
        break;
      case "task_state":
        t.state = ev.body as Bodies["task_state"];
        break;
      case "task_event": {
        const b = ev.body as Bodies["task_event"];
        if (b.role === "user" && b.from !== "partner") {
          const sd = t.sends.find((s) => !s.seq && (b.clientId ? s.clientId === b.clientId : s.text === b.text));
          if (sd) sd.seq = ev.seq;
        }
        const br = b.role === "system" ? (b.raw as { browser?: { host?: string; own?: boolean } } | undefined)?.browser : undefined;
        if (br?.host && (!t.browser || t.browser.seq < ev.seq)) t.browser = { host: br.host, ...(br.own ? { own: true } : {}), seq: ev.seq };
        break;
      }
      case "report": {
        const b = ev.body as Bodies["report"];
        t.lastReport = b;
        if (t.acted && ev.seq > (t.actedSeq ?? 0)) t.acted = undefined;
        for (const e of b.evidence ?? []) if (!t.evidence.some((h) => h.ref === e.ref && h.label === e.label)) t.evidence.push(e);
        break;
      }
      case "body_selected":
        if (!t.body || ev.seq >= (t.bodySeq ?? 0)) {
          const b = ev.body as Bodies["body_selected"];
          (t.body = { harness: b.harness, ...(b.model ? { model: b.model } : {}), why: b.why }), (t.bodySeq = ev.seq);
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
  resends(pending: { clientId: string; text: string }[]): ClientFrame[] {
    const echoed = new Set<string>();
    for (const e of this.channel) if (e.user?.clientId) echoed.add(e.user.clientId);
    const out: ClientFrame[] = pending.filter((p) => !echoed.has(p.clientId)).map((p) => ({ t: "send", text: p.text, clientId: p.clientId }));
    for (const t of this.tasks.values())
      for (const sd of t.sends) if (sd.clientId && !sd.delivered && !sd.failed) out.push({ t: "task_send", taskId: t.id, text: sd.text, clientId: sd.clientId });
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
      .filter((d) => !d.resolved && !d.pending && d.question)
      .filter((d) => {
        const t = d.taskId ? this.tasks.get(d.taskId) : undefined;
        return !t || laneOf(attention(t)) !== LANE.hidden;
      })
      .sort((a, b) => (a.askedAt ?? "").localeCompare(b.askedAt ?? "") || a.decisionId.localeCompare(b.decisionId));
  }

  /** The partner's own asks (no task), which On hand shows on their own. */
  partnerDecisions() {
    return this.openDecisions().filter((d) => !d.taskId);
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

  /** D144: waits that ended unmet today, newest first. */
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
  justArrived(taskId: string, now = Date.now()): boolean {
    const at = this.arrived.get(taskId);
    return at !== undefined && now - at < 1600;
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
    const extra = [...this.tasks.values()].filter((t) => !seen.has(t.id) && (t.open || t.card)).sort((a, b) => (b.events[0]?.seq ?? 0) - (a.events[0]?.seq ?? 0));
    for (const t of [...extra, ...fromSnap]) {
      const l = laneOf(attention(t));
      if (l !== LANE.hidden) lanes[l]!.push(t);
    }
    return { lanes, counts: { needs_you: lanes[0]!.length, working: lanes[1]!.length, waiting: lanes[2]!.length, done_today: lanes[3]!.length } };
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

const OUTSIDE = [
  /\bgit\s+push\b/,
  /\bgh\s+(pr|issue|release)\s+(create|merge|comment|edit|close|reopen|review|delete|upload)\b/,
  /\bgh\s+api\b.*(-X|--method)\s*(POST|PUT|PATCH|DELETE)/,
  /\bnpm\s+publish\b|\bbun\s+publish\b|\bpnpm\s+publish\b|\bcargo\s+publish\b/,
  /\bdocker\s+push\b/,
  /\bwrangler\s+(deploy|publish|pages\s+deploy)\b/,
  /\bcurl\b.*(-X\s*(POST|PUT|PATCH|DELETE)|--request\s+(POST|PUT|PATCH|DELETE)|\s-d\s|--data\b|-F\s|--form\b)/,
  /(^|[\s;&|])(ssh|scp)\s/,
  /\brsync\b.*\s[\w.-]+@?[\w.-]+:/,
];
export const isOutside = (cmd: string) => OUTSIDE.some((re) => re.test(cmd));

function commandOf(tool: NonNullable<Bodies["task_event"]["tool"]>): string {
  const input = tool.input as unknown;
  if (input && typeof input === "object") {
    for (const k of ["command", "cmd"]) {
      const v = (input as Record<string, unknown>)[k];
      if (typeof v === "string") return v;
    }
    return "";
  }
  return typeof input === "string" && tool.name.toLowerCase() === "bash" ? input : "";
}

function firstLine(s: string) {
  s = s.trim();
  const i = s.indexOf("\n");
  if (i >= 0) s = s.slice(0, i) + " …";
  return s.length > 100 ? s.slice(0, 100) + "…" : s;
}

/** What the transcript shows the task did outside its place, oldest first. */
export function outsideActs(t: Task): { seq: number; command: string }[] {
  const out: { seq: number; command: string }[] = [];
  for (const ev of t.events) {
    if (ev.kind !== "task_event") continue;
    const tool = (ev.body as Bodies["task_event"]).tool;
    if (!tool || tool.ok === false) continue;
    const cmd = commandOf(tool);
    if (cmd && isOutside(cmd)) out.push({ seq: ev.seq, command: firstLine(cmd) });
  }
  return out;
}

/** What looks like a credential (G-safety): held back before it is sent. */
const SECRET = /ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{6,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
export const looksSecret = (text: string) => SECRET.test(text);
