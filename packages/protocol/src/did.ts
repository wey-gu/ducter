// D300: 替你做过的 / Done for you. The trustworthy record of every outward action Ducter took on
// the person's behalf: what it sent, paid, called, signed in to or filled, changed, deleted, and
// which accounts it looked at (counts only). One list per day, read from the Log and the
// Autofill uses, never kept anywhere of its own (design/did.md).
//
// Each item says who asked (you in the conversation, a task, a routine), the Go that allowed it,
// where it happened, the task it belongs to, and an Undo only where one truly exists (a folder
// task's copy, D142). It never carries a secret, a read's content, or a message's whole text.

/** What kind of outward action, in the order the filters show them. */
export const DID_KINDS = ["sent", "paid", "called", "filled", "changed", "deleted", "read"] as const;
export type DidKind = (typeof DID_KINDS)[number];

/**
 * The finer shape, which picks the clients' words for the line:
 *   sent: mail (a mail account's send), message (an app on a phone or computer, a chat
 *     connection), agent (Nowledge Bridge to another agent), post (a public post);
 *   paid: card (a saved card after Pay), buy (a tap that buys or pays in an app);
 *   called: call (a call Ducter placed, from a line or the person's own number);
 *   filled: signin (a saved sign-in), detail (a saved private detail), key (a key given to a task),
 *     account (a sign-in tap in an app);
 *   changed: calendar, merge (merged into its base), pr (a draft PR opened), files (a folder
 *     task's changes), setting (a setting in an app or on a phone), install, write (any other
 *     write to an account);
 *   deleted: calendar (an event cancelled), item (anything else deleted);
 *   read: account (one account looked at, counted per day).
 */
export type DidSub =
  | "mail" | "message" | "agent" | "post"
  | "card" | "buy"
  | "call"
  | "signin" | "detail" | "key" | "account"
  | "calendar" | "merge" | "pr" | "files" | "setting" | "install" | "write"
  | "item";

/** Who asked for it. you: the person, in the conversation (or their own tap); task; routine. */
export interface DidWho {
  by: "you" | "task" | "routine";
  taskId?: string;
  /** The task's title (the person's own name for it when they gave one). */
  title?: string;
  /** A routine's own name, when a routine's run did it. */
  routine?: string;
}

/**
 * The Go that allowed it. you: the person tapped Go (or their own Merge) at `at`; default: no one
 * answered and the card's default went ahead; before: allowed once earlier and kept (a sign-in's
 * first OK on that site, a sender trusted). Absent: nothing needed a Go (a read; a task changing
 * its own folder).
 */
export interface DidGo {
  by: "you" | "default" | "before";
  at?: string;
}

/** Where it happened: the computer or phone, a phone line, or the home itself (an account's API). */
export interface DidWhere {
  kind: "computer" | "phone" | "ducter_phone" | "line" | "own_number" | "home" | "browser";
  /** The device's own name ("Wey's MacBook Pro", "Pixel Fold"), or the line's provider ("Tuwa"). */
  name?: string;
}

export interface DidItem {
  /** Stable for one action: "e<seq>" for a Log event, "u<n>" for an Autofill use, "r<day>:<conn>" for a day's reads. */
  id: string;
  kind: DidKind;
  sub: DidSub;
  at: string;
  /** Who or what it reached: a person, an agent, a site, a calendar, a branch. */
  to?: string;
  /** Through what: an account or connection ("Gmail"), an app ("信息"), a line ("Tuwa"). */
  via?: string;
  /** The action itself as it was said then (the card's sentence, a message's start, an event's
   *  title), at most DID_LINE characters. Never a secret, never a read's content. */
  line?: string;
  /** calendar: what was done to the event. */
  cal?: "create" | "move" | "respond" | "cancel";
  /** paid: "USD 128.00". */
  amount?: string;
  /** read: how many looks that day; files: how many files changed. */
  count?: number;
  /** files: what a folder task changed. */
  files?: { added: number; changed: number; removed: number };
  /** It went out but the far side's answer is unknown (a call no one answered, a send not confirmed). */
  unsure?: "no_answer" | "unconfirmed" | "uncertain";
  who: DidWho;
  go?: DidGo;
  where?: DidWhere;
  /** The task to open from it. */
  taskId?: string;
  /** A result page the action gave (the event in the calendar, the PR). */
  link?: string;
  /** Undo, where one truly exists: a folder task's copy until `until` (task_action "undo"). */
  undo?: { kind: "folder"; taskId: string; until: string };
}

export const DID_LINE = 140;

export interface DidQuery {
  /** ISO times: from (inclusive) and to (exclusive). Default: the last 7 days. */
  since?: string;
  before?: string;
  kinds?: DidKind[];
  /** Words, matched in its line, who and what it reached, through what, and the task's title. */
  q?: string;
  limit?: number;
}

export type DidClientFrame =
  // Answered with did_result (id echoed).
  { t: "did"; id?: string; query: DidQuery };

export type DidServerFrame = {
  t: "did_result";
  id?: string;
  /** Newest first. */
  items: DidItem[];
  /** How many of each kind in the range (before kinds and words narrow it). */
  counts: Partial<Record<DidKind, number>>;
  since: string;
  before: string;
  /** More matched than limit. */
  more?: boolean;
};

/** The kinds that reach outside: what "nothing sent or paid" means. */
export const DID_OUTWARD: readonly DidKind[] = ["sent", "paid", "called"];
