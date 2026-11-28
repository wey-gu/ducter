// D653 (research/244 rules 1 and 8): one living card per subject, and who speaks.
//
// A subject is the work the person is watching: a task, the hand-off it joined (D609's one key per
// repo#n) or a PR. The card is revised in place under the message that started the work (D426's
// card extended to a single task) instead of every task report becoming a new message.
//
// Who speaks: the partner hears a subject only at a needs-you, a first failure, or the final
// verified result — once. A progress report never wakes it; a done report from a task that still
// watches (an open PR, an armed wait, a loop) only revises the card; a second done on the same
// subject wakes nobody. The partner still judges what to say when woken (principle 21).
import type { Bodies, LogEvent, SubjectCard, TaskCard } from "@ducter/protocol";
import { channelOf, subjectKey, subjectLine, subjectStateOf } from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import type { HandoffBody } from "@ducter/protocol/src/handoff.ts";

const GITHUB_REF = /(?:^|[\s(（「“"'])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)(?=$|[\s)）」”"',，。:：;；])/;
const URL_REF = /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(?:pull|issues)\/(\d+)/i;

/** A GitHub ref in a string ("owner/repo#12", a PR URL), lower case: owner/repo#n. */
export function githubRef(s: string | undefined): string | undefined {
  const t = String(s ?? "");
  const u = t.match(URL_REF);
  if (u) return `${u[1]!.toLowerCase()}/${u[2]!.toLowerCase()}#${u[3]}`;
  const m = t.match(GITHUB_REF);
  return m ? `${m[1]!.toLowerCase()}#${m[2]}` : undefined;
}

function refsInReport(r: Bodies["report"] | undefined): string[] {
  const out: string[] = [];
  for (const e of r?.evidence ?? []) {
    const ref = githubRef(String(e.ref ?? ""));
    if (ref) out.push(ref);
  }
  return out;
}

export interface Subjects {
  /** Keep the subject's card current from one Log event. */
  onEvent(e: LogEvent): void;
  /** Whether this report wakes the partner (computed with the card as it was before the event). */
  shouldWake(e: LogEvent): boolean;
  /** The latest card of a task's subject (for On hand and a client that missed an event). */
  cardOf(taskId: string): SubjectCard | undefined;
  /** Every card, latest per subject. */
  cards(): SubjectCard[];
}

export interface SubjectsDeps {
  log: LogStore;
  tasks: TaskRegistry;
  /** D609's records, read lazily (the store is made after this one at core start). */
  handoffs?: () => { all(): HandoffBody[] } | undefined;
}

export function createSubjects(d: SubjectsDeps): Subjects {
  const { log, tasks } = d;
  const byKey = new Map<string, SubjectCard>();
  const starts = new Map<string, { key: string; msgSeq: number; title: string; taskId: string }>();
  const pendingWake = new Map<number, boolean>();
  const decisionTask = new Map<string, string>();

  // Rebuilt from the Log so a restart keeps every card and the one already-done subject stays quiet.
  // A card whose key changed (a task joined its hand-off's PR) replaces the old one: one per subject.
  for (const e of log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["subject_card"] })) {
    const c = (e.body as Bodies["subject_card"]).card;
    if (!c) continue;
    for (const [k, v] of byKey) if (k !== c.key && v.taskId && v.taskId === c.taskId) byKey.delete(k);
    byKey.set(c.key, c);
  }

  const openOf = (taskId: string): { body: Bodies["task_open"]; seq: number } | undefined => {
    const e = log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 1, kinds: ["task_open"] })[0];
    return e ? { body: e.body as Bodies["task_open"], seq: e.seq } : undefined;
  };

  /** The message that started the work: the person's latest, else the partner's own start line. */
  const startMsg = (openSeq: number, persona?: string): number => {
    // D312: in the conversation of the partner the task belongs to, never the default's.
    const msgs = log.read({ stream: channelOf(persona), fromSeq: 0, beforeSeq: openSeq, limit: 200, kinds: ["user_msg", "ai_msg", "ack"] });
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]!.kind === "user_msg") return msgs[i]!.seq;
    return msgs.at(-1)?.seq ?? 0;
  };

  const handoffOf = (taskId: string): HandoffBody | undefined => {
    const all = d.handoffs?.()?.all() ?? [];
    // The helper's task (it took the work) or the giver's task: both read the one item's card.
    const mine = all.filter((h) => h.taskId === taskId || h.from.task === taskId);
    return mine.sort((a, b) => b.at.localeCompare(a.at))[0];
  };

  const prOf = (c: TaskCard | undefined): string | undefined => {
    const prs = (c?.prs ?? []).filter((p) => p.state === "open" && !p.letGo).sort((a, b) => a.at.localeCompare(b.at));
    return prs[0]?.pr?.toLowerCase() ?? refsInReport(c?.lastReport)[0];
  };

  function startOf(taskId: string, at: string): { key: string; msgSeq: number; title: string; taskId: string } {
    const was = starts.get(taskId);
    if (was && (was.msgSeq || !openOf(taskId))) return was;
    const c = tasks.get(taskId);
    const open = openOf(taskId);
    const h = handoffOf(taskId);
    const ref = h ? githubRef(h.item.ref) ?? (h.item.kind === "pr" || h.item.kind === "issue" ? h.item.ref : undefined) : prOf(c);
    const key = subjectKey({ taskId, ...(h ? { handoffKey: h.key } : {}), ...(ref ? { ref } : {}) });
    const title = h?.item.title?.trim() || c?.title || open?.body.title || taskId;
    const start = { key, msgSeq: open ? startMsg(open.seq, c?.persona) : 0, title, taskId };
    starts.set(taskId, start);
    return start;
  }

  /** A task still watching the world after a done report: an open PR, an armed wait, a loop on. */
  function watching(taskId: string): boolean {
    if ((tasks.get(taskId)?.prs ?? []).some((p) => p.state === "open" && !p.letGo)) return true;
    const evs = log.read({ stream: `task:${taskId}`, kinds: ["waiter", "until"], limit: 80 });
    const waiter = new Map<string, string>();
    let until: string | undefined;
    for (const e of evs) {
      if (e.kind === "waiter") {
        const w = e.body as Bodies["waiter"];
        if (w.waiterId) waiter.set(w.waiterId, w.state);
      } else {
        until = (e.body as Bodies["until"]).state;
      }
    }
    if ([...waiter.values()].includes("armed")) return true;
    return until === "on";
  }

  const put = (c: SubjectCard, quiet = false): void => {
    const prev = byKey.get(c.key);
    for (const [k, v] of byKey) if (k !== c.key && v.taskId && v.taskId === c.taskId) byKey.delete(k);
    byKey.set(c.key, c);
    if (quiet) return;
    const same = prev && prev.msgSeq === c.msgSeq && prev.title === c.title && prev.state === c.state && prev.line === c.line && (prev.progress ?? "") === (c.progress ?? "");
    if (same) return;
    // D312: the card lives in the task's own partner's conversation (a second partner's task never lands in the default's).
    const persona = c.taskId ? tasks.get(c.taskId)?.persona : undefined;
    log.append({ stream: channelOf(persona), origin: "system", kind: "subject_card", body: { card: c }, ...(persona ? { persona } : {}) } as never);
  };

  const cardFor = (taskId: string, at: string, report?: Bodies["report"], byState = false): SubjectCard => {
    const s = startOf(taskId, at);
    const c = tasks.get(taskId);
    const r = report ?? c?.lastReport;
    const w = c ? watching(taskId) : false;
    let state: SubjectCard["state"] = "working";
    let line = "";
    if (byState && c) {
      switch (c.attention) {
        case "done":
        case "done_claimed":
          state = "done";
          break;
        case "failed":
        case "dropped":
        case "superseded":
          state = "failed";
          break;
        case "needs_you":
        case "blocked":
          state = "waiting";
          break;
        default:
          state = "working";
      }
      // A done or a failure prefers what the task last said; a wait says its own reason.
      const said = r && ["done", "failed", "needs_input", "blocked"].includes(r.state) ? r.summary : undefined;
      line = subjectLine(state === "waiting" ? c.reason ?? said ?? "" : said ?? c.reason ?? "");
    } else if (r) {
      state = subjectStateOf(r.state);
      line = subjectLine(r.summary);
      // A done report from a task still watching is not the final result: the card keeps working.
      if (state === "done" && w) state = "working";
    } else if (c) {
      switch (c.attention) {
        case "done":
        case "done_claimed":
          state = "done";
          break;
        case "failed":
          state = "failed";
          break;
        case "needs_you":
        case "blocked":
          state = "waiting";
          break;
        default:
          state = "working";
      }
      line = subjectLine(c.reason ?? "");
    }
    // A subject that finished stays finished: a late progress from a helper on the same PR never
    // moves it back (its card is one place, and its result was said once).
    const prev = byKey.get(s.key);
    if (prev?.state === "done" && state !== "failed") {
      state = "done";
      line = prev.line || line;
    }
    const progress = state === "working" && r?.state === "progress" ? line : undefined;
    return {
      key: s.key,
      // One subject, one place: a helper's card joins the giver's, never moving it to another message.
      msgSeq: prev?.msgSeq ?? s.msgSeq,
      title: s.title,
      state,
      line: line || "",
      ...(progress ? { progress } : {}),
      // The card opens the task that started the subject (a helper never takes the card over).
      taskId: prev?.taskId ?? taskId,
      at,
    };
  };

  const wakeFor = (e: LogEvent): boolean => {
    if (e.kind !== "report") return false;
    const r = e.body as Bodies["report"];
    if (r.state === "progress") return false;
    if (r.state === "done" && r.direct) return false;
    const s = startOf(r.taskId, e.ts);
    const prev = byKey.get(s.key);
    const line = subjectLine(r.summary);
    switch (r.state) {
      case "needs_input":
      case "blocked":
        // A new question always reaches the person; the same one said again does not.
        return !(prev?.state === "waiting" && prev.line === line);
      case "failed":
        return prev?.state !== "failed";
      case "done":
        if (watching(r.taskId)) return false;
        return prev?.state !== "done";
      default:
        return false;
    }
  };

  const onEvent = (e: LogEvent): void => {
    switch (e.kind) {
      case "task_open": {
        const id = (e.body as Bodies["task_open"]).taskId;
        const s = startOf(id, e.ts);
        // A retitle says the work in new words; a hand-off's item title stays the subject's.
        if (!handoffOf(id)) s.title = tasks.get(id)?.title || s.title;
        put(cardFor(id, e.ts));
        break;
      }
      case "report": {
        const r = e.body as Bodies["report"];
        pendingWake.set(e.seq, wakeFor(e));
        if (pendingWake.size > 500) pendingWake.delete(pendingWake.keys().next().value!);
        put(cardFor(r.taskId, e.ts, r));
        break;
      }
      case "decision": {
        const b = e.body as Bodies["decision"];
        if (!b.taskId || !tasks.get(b.taskId)) break;
        decisionTask.set(b.decisionId, b.taskId);
        // A question is the subject waiting on the person, even before a report says so.
        put(cardFor(b.taskId, e.ts, { taskId: b.taskId, state: "needs_input", summary: b.question, questions: [], evidence: [] }));
        break;
      }
      case "decision_resolved": {
        const b = e.body as Bodies["decision_resolved"];
        // The question is answered: the card goes back to the task's last words.
        const id = decisionTask.get(b.decisionId);
        if (!id) break;
        decisionTask.delete(b.decisionId);
        put(cardFor(id, e.ts));
        break;
      }
      case "task_state": {
        const b = e.body as Bodies["task_state"];
        const c = tasks.get(b.taskId);
        if (!c) break;
        // The card follows the task's own state (paused, waiting, done) even without a new report.
        put(cardFor(b.taskId, e.ts, undefined, true));
        break;
      }
      case "handoff": {
        const h = e.body as HandoffBody;
        // Both ends read the one item's card: a helper's task joins the giver's subject.
        for (const id of [h.from.task, h.taskId]) {
          if (!id) continue;
          const c = tasks.get(id);
          if (!c) continue;
          const s = startOf(id, e.ts);
          const ref = githubRef(h.item.ref);
          const key = subjectKey({ taskId: id, handoffKey: h.key, ...(ref ? { ref } : {}) });
          s.title = h.item.title?.trim() || s.title;
          if (s.key !== key) {
            const old = byKey.get(s.key);
            if (old && old.taskId === id) byKey.delete(s.key);
            s.key = key;
          }
          put(cardFor(id, e.ts));
        }
        break;
      }
      default:
        break;
    }
  };

  return {
    onEvent,
    shouldWake: (e) => pendingWake.get(e.seq) ?? false,
    cardOf(taskId) {
      const s = starts.get(taskId);
      if (s) return byKey.get(s.key);
      const c = tasks.get(taskId);
      if (!c) return undefined;
      return byKey.get(startOf(taskId, c.updatedAt).key);
    },
    cards: () => [...byKey.values()],
  };
}
