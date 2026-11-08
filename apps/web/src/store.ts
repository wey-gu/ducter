// The phone's model of the Log: a port of the desktop store (apps/desktop/internal/store) so both
// clients fold the same events the same way: living messages revised in place, jobs folded into
// their acks, decisions with their resolutions, tasks with their streams, the On hand snapshot.
// Pure data; tested without a DOM.
import type { Attention, Bodies, Delivery, EvidenceRef, LogEvent, OnHand, Place, ServerFrame, TaskCard } from "@ducter/protocol";

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
};

export interface Send {
  text: string;
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
  sends: Send[];
  acting?: string;
  acted?: { action: string; ok: boolean; message?: string; ref?: string };
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
export const reportOf = (t: Task) => t.lastReport ?? t.card?.lastReport;
export const harnessOf = (t: Task) => t.open?.harness || t.card?.harness || "";
export const modelOf = (t: Task) => t.open?.model || t.card?.model || "";
export const projectOf = (t: Task) => t.open?.project ?? t.card?.project ?? "";
export const bodyReasonOf = (t: Task) => t.open?.bodyReason || t.card?.bodyReason || "";
export const finished = (t: Task) => ["done", "done_claimed", "failed"].includes(attention(t));

function taskOf(ev: LogEvent): string {
  const b = ev.body as { taskId?: string };
  if (["task_open", "task_state", "task_event", "report", "checkpoint"].includes(ev.kind) && b.taskId) return b.taskId;
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
  waiters = new Map<string, Bodies["waiter"]>();
  errors: string[] = [];
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
        const t = this.tasks.get(f.taskId);
        if (t) (t.acting = undefined), (t.acted = { action: f.action, ok: f.ok, message: f.message, ref: f.ref });
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
      case "task_history": {
        const t = this.task(f.taskId);
        for (const ev of f.events) this.applyEvent(ev);
        t.historyLoaded = true;
        return;
      }
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

  addSend(taskId: string, text: string, at = Date.now()): Send {
    const sd: Send = { text, at };
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
      if (w.state === "armed") this.waiters.set(w.waiterId, w);
      else this.waiters.delete(w.waiterId);
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
      case "ai_msg":
        return entry({ ai: ev.body as Bodies["ai_msg"] });
      case "ack": {
        const b = ev.body as Bodies["ack"];
        const j = this.job(b.jobId);
        j.ack = b;
        return entry({ job: j });
      }
      case "job_status": {
        const b = ev.body as Bodies["job_status"];
        // A user-origin act_<task>_<action> status is the durable record of a button action.
        if (ev.origin === "user" && b.taskId && b.jobId.startsWith(`act_${b.taskId}_`)) {
          // On (re)connect the channel replays before on_hand lists the task: keep it anyway.
          this.task(b.taskId).acted = { action: b.jobId.slice(`act_${b.taskId}_`.length), ok: true };
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
        t.open = ev.body as Bodies["task_open"];
        t.openedAt = ev.ts;
        break;
      case "task_state":
        t.state = ev.body as Bodies["task_state"];
        break;
      case "task_event": {
        const b = ev.body as Bodies["task_event"];
        if (b.role === "user" && b.from !== "partner") {
          const sd = t.sends.find((s) => !s.seq && s.text === b.text);
          if (sd) sd.seq = ev.seq;
        }
        break;
      }
      case "report": {
        const b = ev.body as Bodies["report"];
        t.lastReport = b;
        for (const e of b.evidence ?? []) if (!t.evidence.some((h) => h.ref === e.ref && h.label === e.label)) t.evidence.push(e);
        break;
      }
      case "checkpoint":
        t.checkpoints.push({ text: (ev.body as Bodies["checkpoint"]).text, seq: ev.seq, ts: ev.ts });
        t.checkpoints.sort((a, b) => a.seq - b.seq);
        break;
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

  waiterFor(taskId: string) {
    return this.armedWaiters().find((w) => w.taskId === taskId);
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
