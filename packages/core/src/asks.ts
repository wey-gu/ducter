// D426: what one message asked for, line by line (protocol/src/asks.ts; design/conversation.md
// §Several things in one message). The partner names the lines when it opens or continues a task
// (task_open / task_send `asks`); this keeps them and their states, and logs the lines under the
// message (`asks`, latest per msgSeq) whenever one changes.
//
// A line's state comes from its task: the task's report says each of its lines' state (`asks`, in
// the order it was given them); a report without it, or a task's own state (it failed, it waits for
// the person, it was put down), moves every open line of that task at once.
//
// When to speak (the hold): a line that comes back done while other lines of the same message are
// still at work is not told to the partner; the line ticks under the message, in silence. Failures
// and questions wake it at once. When the last line settles, everything held wakes it together, so
// the person hears the whole message's outcome once.
//
// D430: the hold is in the Log. Each held report's seq is written into the message's `asks`
// (`holding`), and cleared before the release wakes anyone; the projection rebuilds it on start,
// so a restart neither loses the close-out nor says it twice.
import type { AskLine, AskReport, AsksBody, Bodies, LogEvent } from "@ducter/protocol";
import { ASK_NOTE_MAX, ASKS_MAX, askSettled, askStateOf, cutWords } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";

export interface Asks {
  /** The partner named these lines for this task, under the person's message (task_open / task_send). Returns the lines added. */
  add(msgSeq: number, taskId: string, words: string[], held?: string): AskLine[];
  /** D360: a member held in a group's line opened as this task. */
  heldOpened(key: string, taskId: string): void;
  /** The lines under a message. */
  of(msgSeq: number): AskLine[] | undefined;
  /** The message a task's newest lines are under, and its lines (all of them, any task). */
  forTask(taskId: string): { msgSeq: number; lines: AskLine[] } | undefined;
  /** Messages with lines, newest first (bounded). */
  recent(limit?: number): AsksBody[];
  /** Whether this event wakes the partner now (false: held until the message's last line settles). */
  wakes(e: LogEvent): boolean;
  onEvent(e: LogEvent): void;
}

export interface AsksDeps {
  log: LogStore;
  tasks: Pick<TaskRegistry, "get">;
  /** Held events, woken together when the message's last line settled (oldest first). */
  release?: (events: LogEvent[]) => void;
}

const KEEP = 200; // messages kept in memory (older ones are only in the Log)

export function createAsks(d: AsksDeps): Asks {
  const byMsg = new Map<number, { stream: string; lines: AskLine[] }>();
  const held = new Map<number, LogEvent[]>();

  // Rebuilt from the Log: the latest `asks` per message, and the reports it still holds.
  for (const e of d.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["asks"] })) {
    const b = e.body as AsksBody;
    byMsg.set(b.msgSeq, { stream: e.stream, lines: b.lines.map((l) => ({ ...l })) });
    if (b.holding?.length) {
      const evs = b.holding.map((seq) => d.log.read({ fromSeq: seq, limit: 1 })[0]).filter((x): x is LogEvent => !!x && x.kind === "report");
      if (evs.length) held.set(b.msgSeq, evs);
      else held.delete(b.msgSeq);
    } else held.delete(b.msgSeq);
  }
  trim();

  function trim() {
    if (byMsg.size <= KEEP) return;
    const seqs = [...byMsg.keys()].sort((a, b) => a - b);
    for (const s of seqs.slice(0, byMsg.size - KEEP)) byMsg.delete(s), held.delete(s);
  }

  function streamOf(msgSeq: number): string {
    const e = d.log.read({ fromSeq: msgSeq, limit: 1 })[0];
    return e && e.seq === msgSeq ? e.stream : "channel";
  }

  function log(msgSeq: number) {
    const m = byMsg.get(msgSeq);
    if (!m) return;
    const h = held.get(msgSeq);
    const body: AsksBody = { msgSeq, lines: m.lines.map((l) => ({ ...l })), ...(h?.length ? { holding: h.map((e) => e.seq) } : {}) };
    d.log.append({ stream: m.stream, origin: "system", kind: "asks", body });
  }

  /** The newest message whose lines include this task. */
  function msgOf(taskId: string): number | undefined {
    let best: number | undefined;
    for (const [seq, m] of byMsg) if (m.lines.some((l) => l.taskId === taskId) && (best === undefined || seq > best)) best = seq;
    return best;
  }

  /** A task's own state, for lines its report didn't speak of. */
  function stateOfCard(taskId: string, att?: string): AskLine["state"] | undefined {
    const a = att ?? d.tasks.get(taskId)?.attention;
    switch (a) {
      case "done":
      case "done_claimed":
      case "superseded":
        return "done";
      case "failed":
      case "dropped":
        return "failed";
      case "needs_you":
      case "blocked":
        return "needs_you";
      case "working":
      case "queued":
        return "working";
      default:
        return undefined;
    }
  }

  function apply(msgSeq: number, taskId: string, report: Bodies["report"] | undefined, att?: string): boolean {
    const m = byMsg.get(msgSeq);
    if (!m) return false;
    const mine = m.lines.filter((l) => l.taskId === taskId);
    if (!mine.length) return false;
    let changed = false;
    const set = (l: AskLine, state: AskLine["state"], note?: string) => {
      if (l.state !== state) (l.state = state), (changed = true);
      const n = note ? cutWords(note, ASK_NOTE_MAX) : undefined;
      if (n && l.note !== n) (l.note = n), (changed = true);
    };
    if (report) {
      const said: AskReport[] = Array.isArray(report.asks) ? report.asks : [];
      mine.forEach((l, i) => {
        const r = said[i];
        if (r) return set(l, askStateOf(r.state), r.note);
        // Not spoken of: a progress report leaves it; any other moves the open ones with the task.
        if (report.state === "progress" || askSettled(l.state)) return;
        set(l, askStateOf(report.state));
      });
      return changed;
    }
    const s = stateOfCard(taskId, att);
    if (!s) return false;
    for (const l of mine) {
      if (s === "working") {
        if (l.state === "needs_you") set(l, "working"); // its question answered: at work again
        continue;
      }
      if (askSettled(l.state)) continue;
      if (s === "needs_you" && l.state !== "working") continue;
      set(l, s);
    }
    return changed;
  }

  /** Wakes what this message held: the hold is cleared in the Log first, so it goes once. */
  function releaseHeld(msgSeq: number) {
    const before = held.get(msgSeq);
    if (!before?.length) return;
    held.delete(msgSeq);
    log(msgSeq);
    d.release?.(before);
  }

  const settled = (msgSeq: number) => !!byMsg.get(msgSeq)?.lines.every((l) => askSettled(l.state));
  const tasksOf = (msgSeq: number) => new Set(byMsg.get(msgSeq)?.lines.map((l) => l.taskId || l.held || "") ?? []);

  // Ducter stopped between the last line settling and the release: it goes now (once).
  for (const seq of [...held.keys()]) if (settled(seq)) releaseHeld(seq);

  return {
    add(msgSeq, taskId, words, heldKey) {
      const clean = words.map((w) => cutWords(w)).filter(Boolean);
      if (!clean.length) return [];
      let m = byMsg.get(msgSeq);
      if (!m) byMsg.set(msgSeq, (m = { stream: streamOf(msgSeq), lines: [] }));
      const added: AskLine[] = [];
      for (const w of clean) {
        if (m.lines.length >= ASKS_MAX) break;
        const same = m.lines.find((l) => l.words === w);
        if (same) {
          // Named again for another task (the partner moved it): it goes with the newer one.
          if (same.taskId !== taskId) (same.taskId = taskId), (same.state = "working"), delete same.note;
          continue;
        }
        const line: AskLine = { words: w, taskId: heldKey ? "" : taskId, ...(heldKey ? { held: heldKey } : {}), state: "working" };
        m.lines.push(line);
        added.push(line);
      }
      trim();
      log(msgSeq);
      return added;
    },
    heldOpened(key, taskId) {
      for (const [seq, m] of byMsg) {
        const ls = m.lines.filter((l) => l.held === key);
        if (!ls.length) continue;
        for (const l of ls) (l.taskId = taskId), delete l.held;
        log(seq);
      }
    },
    of: (msgSeq) => byMsg.get(msgSeq)?.lines.map((l) => ({ ...l })),
    forTask(taskId) {
      const seq = msgOf(taskId);
      return seq === undefined ? undefined : { msgSeq: seq, lines: byMsg.get(seq)!.lines.map((l) => ({ ...l })) };
    },
    recent(limit = 5) {
      return [...byMsg.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, limit)
        .map(([msgSeq, m]) => ({ msgSeq, lines: m.lines.map((l) => ({ ...l })) }));
    },
    wakes(e) {
      if (e.kind !== "report") return true;
      const r = e.body as Bodies["report"];
      if (r.state !== "done") return true;
      const seq = msgOf(r.taskId);
      if (seq === undefined) return true;
      // One task for all the lines: its report is the whole message's; nothing to hold.
      if (tasksOf(seq).size < 2) return true;
      const lines = byMsg.get(seq)!.lines;
      // Something of this task's that the person must hear now (a line it couldn't do, a question).
      if (lines.some((l) => l.taskId === r.taskId && (l.state === "failed" || l.state === "needs_you"))) return true;
      if (!settled(seq)) {
        const h = held.get(seq) ?? [];
        if (!h.some((x) => x.seq === e.seq)) h.push(e);
        held.set(seq, h);
        log(seq);
        return false;
      }
      releaseHeld(seq);
      return true;
    },
    onEvent(e) {
      if (e.kind === "report") {
        const r = e.body as Bodies["report"];
        const seq = msgOf(r.taskId);
        if (seq !== undefined && apply(seq, r.taskId, r)) log(seq);
        return;
      }
      if (e.kind === "task_state") {
        const taskId = (e.body as Bodies["task_state"]).taskId;
        const seq = msgOf(taskId);
        if (seq !== undefined && apply(seq, taskId, undefined, (e.body as Bodies["task_state"]).attention)) {
          log(seq);
          // The last open line ended without a report (put down, failed by Ducter): what was held goes now.
          if (settled(seq)) releaseHeld(seq);
        }
      }
    },
  };
}
