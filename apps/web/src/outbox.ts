// D543: what the person sent while the link was down, kept on this device until the home has it.
// A message to the partner, a message to a task and a safe answer to a card each wait here, in
// IndexedDB, from the moment they are sent: a page the phone let go, a reload or a cold start
// offline shows them again with their pending mark and sends them after the next welcome. The home
// dedupes a message by its clientId (protocol: send.clientId) and answers a card that is already
// closed with how it closed (D481), so a copy that did reach it is never applied twice.
//
// Only what is safe to apply late is kept: a pay card's Go (it carries the card's security code)
// and a key card's answer (it carries the key) are never written down, and a Go that deletes
// something (D340) is not sent late either; those ask again (app.ts). A kept answer older than
// ANSWER_TTL_MS is not sent: the card opens again instead.
import type { ClientFrame, ReplyWant, Ref } from "@ducter/protocol";
import { kvGet, kvSet } from "./idb.ts";

export const OUTBOX_KEY = "outbox.v1";
/** A card's answer waits at most this long to be sent; then it asks again. */
export const ANSWER_TTL_MS = 30 * 60_000;
/** Kept at most (the oldest go first): a phone offline for a week still has room. */
const MAX_ITEMS = 200;

export type OutItem =
  | { kind: "send"; device: string; persona: string; clientId: string; text: string; media?: string[]; reply?: ReplyWant; quote?: { from: "you" | "partner"; quote: string; seq: number }; refs?: Ref[]; corrects?: string; at: number }
  | { kind: "task_send"; device: string; taskId: string; clientId: string; text: string; media?: string[]; mode?: "steer" | "queue"; refs?: Ref[]; at: number }
  | { kind: "decide"; device: string; decisionId: string; option: "go" | "hold" | "reply"; text?: string; at: number }
  // D638: the hand-over sheet's Go. Core answers it in a moment and answers one clientId once,
  // so it is safe to send late: a phone that lost the answer sends the same Go again.
  | { kind: "hand"; device: string; clientId: string; frame: Extract<ClientFrame, { t: "pile_hand" }>; at: number };

export type OutStore = { get(): Promise<OutItem[] | undefined>; set(v: OutItem[]): Promise<void> };
export const idbStore: OutStore = { get: () => kvGet<OutItem[]>(OUTBOX_KEY), set: (v) => kvSet(OUTBOX_KEY, v.length ? v : undefined) };

const idOf = (i: OutItem) => (i.kind === "decide" ? `d:${i.decisionId}` : i.kind === "hand" ? `h:${i.clientId}` : `m:${i.clientId}`);

/** The frame an item sends. */
export function frameOf(i: OutItem): ClientFrame {
  if (i.kind === "send") return { t: "send", text: i.text, clientId: i.clientId, ...(i.media?.length ? { media: i.media } : {}), ...(i.reply ? { reply: i.reply } : {}), ...(i.refs?.length ? { refs: i.refs } : {}), ...(i.corrects ? { corrects: i.corrects } : {}) };
  if (i.kind === "task_send") return { t: "task_send", taskId: i.taskId, text: i.text, clientId: i.clientId, ...(i.media?.length ? { media: i.media } : {}), ...(i.mode ? { mode: i.mode } : {}), ...(i.refs?.length ? { refs: i.refs } : {}) };
  if (i.kind === "hand") return i.frame;
  return { t: "decide", decisionId: i.decisionId, option: i.option, ...(i.text ? { text: i.text } : {}) };
}

/**
 * The outbox: an in-memory list written through to the store. Every write is queued behind the one
 * before, so the store always ends up holding the latest list, in order.
 */
export class Outbox {
  items: OutItem[] = [];
  private writing: Promise<void> = Promise.resolve();
  constructor(private store: OutStore = idbStore) {}

  /** Reads what a page before this one left (call once, before the first paint). */
  async load(device: string): Promise<OutItem[]> {
    const got = (await this.store.get().catch(() => undefined)) ?? [];
    // Another pairing starts clean: what this device sent as someone else is not ours to send.
    const mine = Array.isArray(got) ? got.filter((i) => i && i.device === device) : [];
    // Anything put meanwhile (a send before load finished) stays, after what was kept.
    const seen = new Set(mine.map(idOf));
    this.items = [...mine, ...this.items.filter((i) => !seen.has(idOf(i)))];
    if (mine.length !== (Array.isArray(got) ? got.length : 0)) this.save();
    return this.items;
  }

  put(i: OutItem) {
    const id = idOf(i);
    this.items = [...this.items.filter((x) => idOf(x) !== id), i].slice(-MAX_ITEMS);
    this.save();
  }

  /** The home has these (an echo, a "sent", a resolution): they leave the outbox. */
  drop(pred: (i: OutItem) => boolean): boolean {
    const left = this.items.filter((i) => !pred(i));
    if (left.length === this.items.length) return false;
    this.items = left;
    this.save();
    return true;
  }
  dropClient(ids: Iterable<string>) {
    const s = new Set(ids);
    return s.size ? this.drop((i) => (i.kind === "send" || i.kind === "task_send") && s.has(i.clientId)) : false;
  }
  dropAnswer(decisionIds: Iterable<string>) {
    const s = new Set(decisionIds);
    return s.size ? this.drop((i) => i.kind === "decide" && s.has(i.decisionId)) : false;
  }

  /** Forgets everything (a device revoked, a Log that started over). */
  clear() {
    this.items = [];
    this.save();
  }

  /** Settled once every write so far is in the store (tests, pagehide). */
  flushed() {
    return this.writing;
  }

  private save() {
    const snap = this.items.slice();
    this.writing = this.writing.then(() => this.store.set(snap)).catch(() => {});
  }
}

/** A memory store (tests; a browser without IndexedDB still keeps the page's own list). */
export function memoryStore(init: OutItem[] = []): OutStore & { value: OutItem[] } {
  const s = {
    value: init,
    get: async () => s.value,
    set: async (v: OutItem[]) => void (s.value = v),
  };
  return s;
}
