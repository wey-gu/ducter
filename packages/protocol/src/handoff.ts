// D609: a hand-off is a thing, not a message. One record in the home's Log, keyed by who gave it,
// who it is for and which item it is, so the same work handed twice is one record; the doors that
// make one are a task's open_pr hand_to, the partner's keep_change hand, a helper's own agent_message,
// and Bridge mail to a helper in any Space. The record's state is given → taken → done, or returned
// or declined; a given one nobody takes is said unclaimed once after HELPER_TAKE_MS.
//
// This module is protocol only: the types, the key, the item a message is about, and the one
// classification fact Bridge mail needs (did this helper ask the question the mail answers?). The
// store that writes the records is core/src/handoffs.ts.

import { words, type LangTag } from "./lang.ts";

export type HandoffState = "given" | "taken" | "done" | "returned" | "declined" | "withdrawn" | "unclaimed";

/** What the hand-off is about: a PR, an issue, a task or words with no reference. */
export interface HandoffItem {
  kind: "pr" | "issue" | "task" | "text";
  /** owner/repo#123, repo#123, a task id, or (text) a short stable reading of the words. */
  ref: string;
  title?: string;
}

/** Who gave it: one of the person's tasks, another agent in a Space, or the person themselves. */
export interface HandoffFrom {
  task?: string;
  agent?: string;
  space?: string;
  spaceLabel?: string;
  /** How the person reads the sender ("Ducter 的任务「官网」", "Hawkingrei 的 agent", "你"). */
  name?: string;
  /** The title of the task that gave it, when it was a task (the sender a view shows). */
  taskTitle?: string;
  /** The message it came in on, for the answer back to a task or an agent. */
  messageId?: string;
}

/** Who it is for: a helper's Keep on this home. */
export interface HandoffTo {
  helper: string;
  name: string;
}

/** One record, as the Log keeps each step of it (the latest per handoffId wins). */
export interface HandoffBody {
  handoffId: string;
  /** from + to + item.ref, the one key per item. */
  key: string;
  from: HandoffFrom;
  to: HandoffTo;
  item: HandoffItem;
  /** The sender's words, verbatim (the first hand-off's). */
  said: string;
  /** What to do, when the door said it apart from the words. */
  ask?: string;
  state: HandoffState;
  /** When it was first given (a resend keeps this). */
  givenAt: string;
  /** When this state began. */
  at: string;
  /** Every arrival that belongs to this record (a resend adds its message id). */
  messages?: string[];
  /** The receiver's task that took it. */
  taskId?: string;
  /** Why it was returned or declined, in the receiver's words. */
  why?: string;
  /** What came of it when it was done. */
  outcome?: string;
  /** When the person was told it was unclaimed (once). */
  unclaimedAt?: string;
  /** When the person last asked the helper to take it now. */
  wakeAt?: string;
  /** What a resend added while the record was open. */
  adds?: { at: string; text: string; messageId?: string }[];
  /** Written from older bridge_msg events at start (D609's migration), never a door. */
  backfilled?: true;
}

/** What the core's hand-off store answers (core/src/handoffs.ts); absent in tests and stubs. */
export interface HandoffsApi {
  all(): HandoffBody[];
  get(handoffId: string): HandoffBody | undefined;
  byMessage(messageId: string): HandoffBody | undefined;
  open(): HandoffBody[];
  ofTask(taskId: string): HandoffBody | undefined;
  ofHelper(helperId: string): HandoffBody[];
  giveLocal(a: { helper: import("./helpers.ts").Helper; text: string; fromTask?: string; fromTaskTitle?: string; fromName: string; head?: string; item?: Partial<HandoffItem>; ask?: string; persona?: string; at?: string }): { handoff: HandoffBody; created: boolean; message?: unknown };
  givenAgent(a: { body: import("./index.ts").Bodies["bridge_msg"]; at: string; persona?: string }): HandoffBody | undefined;
  claim(messageId: string, taskId: string, at?: string): HandoffBody | undefined;
  finish(handoffId: string, state: "done" | "returned" | "declined" | "withdrawn", o?: { why?: string; outcome?: string; say?: boolean; at?: string }): Promise<HandoffBody | undefined>;
  finishForTask(taskId: string, state: "done" | "returned" | "declined" | "withdrawn", o?: { why?: string; outcome?: string; say?: boolean; at?: string }): Promise<HandoffBody | undefined>;
  /** The person asked the helper to take this hand-off now: a fresh arrival wakes its round. */
  wake(handoffId: string, at?: string): HandoffBody | undefined;
  /** The person stopped following it: the record is withdrawn and the sender hears it once. */
  withdraw(handoffId: string, o?: { say?: boolean; at?: string }): Promise<HandoffBody | undefined>;
  unclaim(handoffId: string, at?: string): boolean;
  dueUnclaimed(now: number): HandoffBody[];
  setTellAgent(fn: ((h: HandoffBody, text: string) => Promise<boolean>) | undefined): void;
}

/**
 * One record as a view reads it: the state, the item, who gave it and why it came back. The
 * sender and the receiver's name are already the words a view shows, so both clients read the
 * same facts and never re-derive them from ids.
 */
export interface HandoffLine {
  id: string;
  state: HandoffState;
  item: HandoffItem;
  sender: string;
  to: string;
  givenAt: string;
  at: string;
  taskId?: string;
  why?: string;
  outcome?: string;
}

export function handoffLine(h: HandoffBody): HandoffLine {
  return {
    id: h.handoffId,
    state: h.state,
    item: h.item,
    sender: h.from.taskTitle?.trim() || h.from.name?.trim() || h.from.agent?.trim() || "you",
    to: h.to.name,
    givenAt: h.givenAt ?? h.at,
    at: h.at,
    ...(h.taskId ? { taskId: h.taskId } : {}),
    ...(h.why ? { why: h.why } : {}),
    ...(h.outcome ? { outcome: h.outcome } : {}),
  };
}

export const HANDOFF_TERMINAL: ReadonlySet<HandoffState> = new Set(["done", "returned", "declined", "withdrawn"]);

export function handoffOpen(state: HandoffState): boolean {
  return state === "given" || state === "unclaimed" || state === "taken";
}

/** One line for a row: the item as the person reads it, or its ref. */
export function handoffItemLine(item: HandoffItem): string {
  return item.title?.trim() || item.ref;
}

const GITHUB = /(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\/(?:pull|issues)\/|#)(\d+)/i;
const BARE = /(?:^|[\s(（「“"'])([A-Za-z0-9_.-]+)#(\d+)(?=$|[\s)）」”"',，。:：;；])/;
const URL_PR = /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(pull|issues)\/(\d+)/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The item a hand-off is about, read from what the door knows and then from the words and Mem's
 * refs. A PR or issue reference wins (full URL, owner/repo#n, repo#n); a task id is passed in;
 * otherwise the words themselves are the item, keyed by their opening so the same resend merges.
 */
export function handoffItem(a: { text?: string; refs?: readonly { uri?: string; title: string }[]; ref?: string; kind?: HandoffItem["kind"]; title?: string }): HandoffItem {
  if (a.kind === "task" && a.ref) return { kind: "task", ref: a.ref, ...(a.title ? { title: a.title } : {}) };
  const sources = [a.ref ?? "", ...(a.refs ?? []).flatMap((r) => [r.uri ?? "", r.title]), a.text ?? ""];
  for (const source of sources) {
    const u = source.match(URL_PR);
    const g = u ? source.match(GITHUB) : undefined;
    const m = g ?? source.match(GITHUB) ?? source.match(BARE);
    if (!m) continue;
    const ref = `${m[1]!.toLowerCase()}#${m[2]}`;
    const kind: HandoffItem["kind"] = /\/issues\//i.test(source) || /(?:\bissue\b|问题|工单)/i.test(source) ? "issue" : "pr";
    const title = a.title ?? (a.refs ?? []).find((r) => `${r.uri ?? ""} ${r.title}`.toLowerCase().includes(ref))?.title ?? ref;
    return { kind, ref, title: clean(title) };
  }
  if (a.ref?.trim()) return { kind: a.kind ?? "pr", ref: clean(a.ref), ...(a.title ? { title: clean(a.title) } : {}) };
  const first = clean((a.text ?? "").split("\n").find((l) => l.trim()) ?? "");
  const reading = [...first].slice(0, 80).join("");
  const title = a.title ?? reading;
  return { kind: "text", ref: `text:${reading || "work"}`, ...(title ? { title: clean(title) } : {}) };
}

/** The one key per item: sender + receiver + the item's ref. */
export function handoffKey(from: HandoffFrom, to: HandoffTo, item: HandoffItem): string {
  const who = from.task ? `task:${from.task}` : from.agent ? `agent:${from.agent}${from.space ? `@${from.space}` : ""}` : "you";
  return `${who}|helper:${to.helper}|${item.kind}:${item.ref}`;
}

/** The helper's own questions, read from our outbox: a message one of its tasks sent. A reply to
 *  one of these is an answer, not new work; a reply under any other old message is work. */
export function helperQuestions(evs: Iterable<{ body: unknown }>): Set<string> {
  const helperOf = new Map<string, string>();
  for (const e of evs) {
    const b = e.body as { direction?: string; helper?: string; taskId?: string } | undefined;
    if (b?.direction === "out" && b.helper && b.taskId) helperOf.set(b.taskId, b.helper);
  }
  const out = new Set<string>();
  for (const e of evs) {
    const b = e.body as { direction?: string; by?: string; taskId?: string; messageId?: string } | undefined;
    if (b?.direction === "out" && b.by === "task" && b.taskId && b.messageId && helperOf.has(b.taskId)) out.add(b.messageId);
  }
  return out;
}

/** The words said back to the sender when a hand-off is done, returned or declined. */
export const HANDOFF_WORDS = {
  zh: {
    done: "「{helper}」做完了「{item}」",
    returned: "「{helper}」把「{item}」退回来了",
    declined: "「{helper}」接不了「{item}」",
    withdrawn: "不用 {helper} 跟了",
    why: "：{why}",
    taskDone: "[“{helper}” finished the work you handed it (\"{item}\") on this home]\n<peer_message>\n{why}\n</peer_message>\nIt is the helper's word on the work you handed it. Report it as it stands: done means it says so. Anything it asks you to redo is your work again.",
    taskBack: "[“{helper}” handed \"{item}\" back to you on this home: {state}]\n<peer_message>\n{why}\n</peer_message>\nThe work is back with you: carry it on if the brief allows, or report what is left. Nothing more is expected from the helper.",
    taskWithdrawn: "[the user stopped asking “{helper}” to follow \"{item}\" on this home]\n<peer_message>\n{why}\n</peer_message>\nNothing is expected from the helper now. Carry on with the work if the brief allows, or report what is left.",
  },
  en: {
    done: "{helper} finished “{item}”",
    returned: "{helper} returned “{item}”",
    declined: "{helper} can't take “{item}”",
    withdrawn: "Stopped asking {helper} to follow it",
    why: ": {why}",
    taskDone: "[“{helper}” finished the work you handed it (\"{item}\") on this home]\n<peer_message>\n{why}\n</peer_message>\nIt is the helper's word on the work you handed it. Report it as it stands: done means it says so. Anything it asks you to redo is your work again.",
    taskBack: "[“{helper}” handed \"{item}\" back to you on this home: {state}]\n<peer_message>\n{why}\n</peer_message>\nThe work is back with you: carry it on if the brief allows, or report what is left. Nothing more is expected from the helper.",
    taskWithdrawn: "[the user stopped asking “{helper}” to follow \"{item}\" on this home]\n<peer_message>\n{why}\n</peer_message>\nNothing is expected from the helper now. Carry on with the work if the brief allows, or report what is left.",
  },
} as const;

/** The state as one word in the person's language (the same table shape as every other word). */
const HANDOFF_STATE_WORDS: { en: Record<HandoffState, string>; zh: Record<HandoffState, string> } = {
  en: {
    given: "given",
    taken: "taken",
    done: "done",
    returned: "returned",
    declined: "declined",
    withdrawn: "stopped following",
    unclaimed: "not taken yet",
  },
  zh: {
    given: "交给了",
    taken: "接手了",
    done: "做完了",
    returned: "退回了",
    declined: "接不了",
    withdrawn: "不用跟了",
    unclaimed: "还没人接手",
  },
};

export function handoffStateWord(lang: LangTag, state: HandoffState): string {
  return words(HANDOFF_STATE_WORDS, lang)[state];
}
