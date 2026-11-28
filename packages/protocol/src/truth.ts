// D661 (research/245 §3.3): one state per task, derived in core from facts, read by every
// surface. A client never sets one of these: it draws what the snapshot says. `working` is a turn
// running now (or a queued start); `needs_you` means the person owes it something and carries
// `waitsFor` in one line; `waiting` is a named thing that comes back by itself (and says when it is
// blind); `stopped` is a rest with nothing running and nothing asked; done and failed are as before.
//
// The six words are the board's, not a second model beside attention: core's truth.ts reads the
// task's own facts, the subject card (D653), a Bridge wait (D656), a Keep's item and the waiters, and
// every surface reads the one result (`OnHandTruth`, and each card's `truth`).

export type TruthState = "working" | "needs_you" | "waiting" | "stopped" | "done" | "failed";

/**
 * Why a task needs the person, so its row can say what happened and what the choice is:
 * question (a real question, named), stopped (nothing asked; a fact, with Continue/Put down),
 * blind (a read no computer can run), ready (a PR to merge), keep (a Keep's held item),
 * routine (a routine Ducter paused).
 */
export type TruthNeed = "question" | "stopped" | "blind" | "ready" | "keep" | "routine";

/**
 * What a waiting task waits on, named so the row can say it: `name` is the thing (a PR's checks, a
 * computer, an agent's answer), `back` when it comes back on its own. `blind` says the read fails
 * (no gh on that computer); after its quiet that is needs_you with `fix`.
 */
export interface TruthWait {
  name: string;
  back?: string;
  blind?: boolean;
  /** The way on when `blind`: where it can be read, or what to install. */
  fix?: string;
}

/** One task's derived state (on its card, and inside an OnHandTruth item). */
export interface TaskTruth {
  state: TruthState;
  /** needs_you: why, so the row's words and its choices match the fact. */
  needs?: TruthNeed;
  /** needs_you: one line, in the task's language, of what it waits for. */
  waitsFor?: string;
  /** waiting: the named thing that comes back by itself. */
  wait?: TruthWait;
  /** When this state began: the turn's start, or the card's last change. */
  since?: string;
}

/** Another holder of the same outside thing, shown as an attribute on the holder's row (D661 §5). */
export interface TruthAttr {
  role: "author" | "review" | "handoff";
  /** The other holder when it is a task (its row is reachable). */
  taskId?: string;
  /** The Keep (a helper or a loop) that holds it, by name. */
  keep?: string;
  /** A hand-off's receiver, by name. */
  to?: string;
  /** A task holder's agent and computer, for "Mac 上的 Antigravity". */
  harness?: string;
  device?: string;
}

/** One row of OnHandTruth: a task, a Keep's paused routine, a partner's ask, a call or a task-less wait. */
export interface TruthItem extends TaskTruth {
  taskId?: string;
  keepId?: string;
  routineId?: string;
  decisionId?: string;
  askId?: string;
  callId?: string;
  waiterId?: string;
  /** Whose partner the ask or call is. */
  persona?: string;
  /** The project lens it belongs to (projects.ts); absent: not in a project. */
  projectKey?: string;
  /** D654's two no-project lenses: "computer" (电脑上的事) or "none" (不在项目里). */
  projectGroup?: "none" | "computer";
  /** The person-language gist of its latest report, when one exists (D519's asker). */
  line?: string;
  /** Other holders of the same PR, shown as attributes on this row. */
  attrs?: TruthAttr[];
  /** Done today, by the one rule every surface uses (D310). */
  doneToday?: boolean;
}

/**
 * The board's one computed state (D661, research/245 §3.3). The head's line, the counts, the
 * sections, the Dock badge, the menu bar, the phone and the partner's facts read these lists; the
 * Mac and the web cannot disagree because neither derives a state itself.
 */
export interface OnHandTruth {
  needsYou: TruthItem[];
  working: TruthItem[];
  waiting: TruthItem[];
  stopped: TruthItem[];
  /** Done and failed are listed too, so a lens can count today without a second rule. */
  done: TruthItem[];
  failed: TruthItem[];
  /** The Log sequence this was read at (a client can tell a newer snapshot). */
  asOf: number;
  /** The clock time it was read at. */
  at: string;
}

/** D661 (research/245 §3.3 rule 4): one cheap-model line for one report, in the person's language. */
export interface TaskGist {
  text: string;
  at: string;
  /** The report event it reads (its Log seq); a later report's gist replaces it. */
  reportSeq: number;
}

/** Where a task's outside thing is held by another row (one holder per repo#n). */
export interface HeldUnder {
  ref: string;
  /** The holder task's id (the row that shows the PR). */
  taskId: string;
}
