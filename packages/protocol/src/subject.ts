// D653 (research/244 rules 1 and 8): one living card per subject. A subject is the work the
// person is watching, keyed by its task, its hand-off (the one key per repo#n) or its PR ref, so a
// fix, its helper and its PR are one card. The card hangs from the message that started the work
// (D426's card extended to a single task), says its title in words, its current state in one line
// and the newest real progress, and is revised in place — never a new message per report.
//
// This module is protocol only: the type, the key, and the state a report leaves behind. Core
// logs it (`packages/core/src/subjects.ts`); both clients draw the latest per key under its message.

/** A subject's state as its one line: at work, waiting for the person, done, didn't work out. */
export type SubjectState = "working" | "waiting" | "done" | "failed";

/** One living card, as both clients draw it. The latest event per key wins. */
export interface SubjectCard {
  /** task:<id>, handoff:<key>, or pr:owner/repo#n — one per subject, so repeated work is one card. */
  key: string;
  /** The person's message that started the work (the message the card hangs from). 0: no message. */
  msgSeq: number;
  /** The subject's title in words (the hand-off's title, else the task's title). */
  title: string;
  state: SubjectState;
  /**
   * The state in one line. While it works, the newest report's line (the gist). Once the partner
   * has said the result, the concrete artifact (a merged PR, the report's evidence) — never the
   * task's report summary, which is the partner's speech (D653 polish).
   */
  line: string;
  /** The newest real progress while it works; absent when the line already says it. */
  progress?: string;
  /**
   * How long the work took, in ms, from its task's open to the final result the partner said.
   * Its own element (never joined to the line); absent before the result, or under a minute.
   */
  took?: number;
  /** The task that keeps the card, so a row can open it. */
  taskId?: string;
  /** When this revision was made. */
  at: string;
}

/** The body of a `subject_card` Log event. */
export interface SubjectCardBody {
  card: SubjectCard;
}

/** A report state as a card's state (a blocked task waits for the person too). */
export function subjectStateOf(report: "progress" | "needs_input" | "blocked" | "done" | "failed"): SubjectState {
  switch (report) {
    case "progress":
      return "working";
    case "needs_input":
    case "blocked":
      return "waiting";
    case "done":
      return "done";
    case "failed":
      return "failed";
  }
}

/**
 * The one key per subject: a PR ref (owner/repo#n) wins over a task, so a task, its helper and the
 * PR they work on are one card; a hand-off's key comes next when it is not about a GitHub item;
 * otherwise the task id. `ref` is a hand-off item ref or a PR ref already read from the report.
 */
export function subjectKey(a: { taskId: string; handoffKey?: string; ref?: string }): string {
  const ref = (a.ref ?? "").trim().toLowerCase();
  if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+#\d+$/.test(ref)) return `pr:${ref}`;
  if (a.handoffKey?.trim()) return `handoff:${a.handoffKey.trim()}`;
  return `task:${a.taskId}`;
}

/** The first line of a report, cut for the card (one line, never a paragraph). */
export function subjectLine(s: string, max = 120): string {
  const first = String(s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => !!l) ?? "";
  return first.length > max ? first.slice(0, max - 1) + "…" : first;
}
