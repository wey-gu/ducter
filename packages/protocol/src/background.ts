// D521: the work a task's own agent runs beside its turn (D266, D515), as one list the opened task
// shows over its composer and On hand counts: Claude Code's background shells, Monitor watches and
// subagents; Codex's background terminals and subagents; DeepSeek Harness's jobs; any agent OAR
// reports tasks for. Folded from the task's Log (the runner logs each start and end as a system
// task_event with `raw.background`), so it holds across a restart and for a worker's task alike.

/** What kind of work it is, for its drawn mark: a shell (`>_`), a subagent, a watch (Claude Code's Monitor), anything else. */
export type BgKind = "shell" | "agent" | "watch" | "other";

/**
 * Where it stands. done: it ended well; failed: it ended in a failure (a non-zero exit); stopped:
 * stopped (by the agent, the person, or the agent's own end); unknown: its session went before its
 * end was heard (Ducter restarted, the session was let go), so nobody knows how it ended.
 */
export type BgState = "running" | "done" | "failed" | "stopped" | "unknown";

export interface BgJob {
  /** The agent's own id for it (OAR's task id, or the tool call's id for a Codex background terminal). */
  id: string;
  kind: BgKind;
  /** The agent's own words for it, else its command, cut at a word end (BG_TITLE_MAX). Empty when it said neither. */
  title: string;
  /** When it started (the Log's time of its start). */
  at: string;
  state: BgState;
  /** When its end was heard. */
  endedAt?: string;
  /** Its exit code, when its agent said one. */
  exit?: number;
  /** The last lines of its output (at most BG_TAIL_MAX characters), or the agent's own summary of it. */
  tail?: string;
  /** The agent can stop this one by itself (OAR's stopTask on its session): offer 停下 / Stop. */
  stop?: true;
}

/** D521: a task's background work: every one still running and the newest finished ones; `done` counts every finished one. */
export interface TaskBackground {
  jobs: BgJob[];
  done: number;
}

export const BG_TITLE_MAX = 72;
export const BG_TAIL_MAX = 600;
/** How many finished ones the card carries (the newest); the count says the rest. */
export const BG_DONE_KEPT = 30;

/** A title cut at a word end within `max` characters (a CJK run may be cut anywhere), with an ellipsis when cut. */
export function shortAtWord(s: string, max = BG_TITLE_MAX): string {
  const one = s.replace(/\s+/g, " ").trim();
  const chars = [...one];
  if (chars.length <= max) return one;
  const head = chars.slice(0, max - 1).join("");
  const sp = head.lastIndexOf(" ");
  // Cut at the last space when it leaves most of the room used; a long word or a CJK run is cut where it is.
  const cut = sp >= max * 0.5 ? head.slice(0, sp) : /[　-鿿＀-￯]$/.test(head) ? head : sp > 0 ? head.slice(0, sp) : head;
  return `${cut.replace(/[\s,;:，；：、.。-]+$/, "")}…`;
}

/** The last lines of an output within `max` characters, whole lines where it can. */
export function tailLines(s: string, max = BG_TAIL_MAX): string {
  const t = s.replace(/\s+$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(t.length - max);
  const nl = cut.indexOf("\n");
  return nl >= 0 && nl < cut.length - 1 ? cut.slice(nl + 1) : cut;
}

/** A background act as the runner logs it (`raw.background` of a system task_event). */
export interface BgLogged {
  id?: string;
  act?: string;
  type?: string;
  /** D521: the tool that started it, when it names the kind better than its type (Claude Code's Monitor). */
  tool?: string;
  what?: string;
  exitCode?: number;
  output?: string;
  summary?: string;
  stop?: boolean;
  /** D521: the person stopped it from Ducter. */
  by?: string;
}

/** The kind a logged act says: a subagent or workflow, a Monitor watch, a shell, else other. */
export function bgKindOf(b: Pick<BgLogged, "type" | "tool">): BgKind {
  if (b.tool && /^monitor$/i.test(b.tool)) return "watch";
  if (b.type === "agent" || b.type === "workflow") return "agent";
  if (b.type === "shell") return "shell";
  return "other";
}

type Ev = { ts: string; kind: string; body: unknown };

/**
 * D521: a task's background work from its events, oldest first (task_event bodies with
 * `raw.background`; `raw.backgroundCeiling` lets one go unheard). `live`: whether the task's
 * session is still there (its residency is hot, warm, provisioning or offline): without it, one
 * still open went with the session and its state is unknown. Acts logged before D521 carry no id:
 * an end is matched to the oldest open one of its words.
 */
export function backgroundOf(events: readonly Ev[], live: boolean): TaskBackground | undefined {
  const jobs: BgJob[] = [];
  const open = new Map<string, BgJob>();
  let n = 0;
  for (const e of events) {
    if (e.kind !== "task_event") continue;
    const raw = (e.body as { raw?: unknown } | null)?.raw as { background?: BgLogged; backgroundCeiling?: unknown; bgId?: unknown } | undefined;
    if (raw?.backgroundCeiling && typeof raw.bgId === "string") {
      const j = open.get(raw.bgId);
      if (j) (open.delete(raw.bgId), Object.assign(j, { state: "unknown" as const, endedAt: e.ts }));
      continue;
    }
    const b = raw?.background;
    if (!b || typeof b.act !== "string") continue;
    const what = typeof b.what === "string" ? b.what.trim() : "";
    const id = typeof b.id === "string" && b.id ? b.id : undefined;
    if (b.act === "started") {
      const key = id ?? `~${n++}`;
      // The same id started again (a Codex subagent given more work): a fresh row.
      const prev = open.get(key);
      if (prev) prev.state = "unknown";
      const j: BgJob = { id: key, kind: bgKindOf(b), title: what ? shortAtWord(what) : "", at: e.ts, state: "running", ...(b.stop === true ? { stop: true as const } : {}) };
      jobs.push(j);
      open.set(key, j);
      continue;
    }
    if (!["ended", "failed", "stopped"].includes(b.act)) continue;
    let j = id ? open.get(id) : undefined;
    if (!j && !id) for (const x of open.values()) if (x.id.startsWith("~") && x.title === (what ? shortAtWord(what) : "")) { j = x; break; }
    if (!j) continue;
    open.delete(j.id);
    j.state = b.act === "failed" ? "failed" : b.act === "stopped" ? "stopped" : "done";
    j.endedAt = e.ts;
    if (typeof b.exitCode === "number") {
      j.exit = b.exitCode;
      if (b.exitCode !== 0 && j.state === "done") j.state = "failed";
    }
    const said = typeof b.output === "string" && b.output.trim() ? b.output : typeof b.summary === "string" && b.summary.trim() ? b.summary : "";
    if (said) j.tail = tailLines(said);
    delete j.stop;
  }
  if (!live) for (const j of open.values()) (j.state = "unknown"), delete j.stop;
  if (!jobs.length) return undefined;
  const running = jobs.filter((j) => j.state === "running");
  const finished = jobs.filter((j) => j.state !== "running");
  // Legacy rows without an id keep a stable id of their own (their start's time).
  for (const j of jobs) if (j.id.startsWith("~")) j.id = `at:${j.at}`;
  return { jobs: [...running, ...finished.slice(-BG_DONE_KEPT)], done: finished.length };
}

/** How many of a task's background jobs are running. */
export function bgRunning(b: TaskBackground | undefined): number {
  return b ? b.jobs.filter((j) => j.state === "running").length : 0;
}
