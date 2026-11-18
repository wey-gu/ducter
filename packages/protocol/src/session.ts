// D320: a long session, opened. A task of 10,000–100,000 events is read through two things:
//  - its **session index**, one small row per turn (where it starts and ends, when, what opened it
//    in its first line, how tall it roughly draws, the compactions, switches and reports in it),
//    made on the home as the Log grows and kept live by every client with the same `indexAdd`;
//    the locator draws the whole session from it, and the page lays out every turn from it;
//  - a **window** of events around what is on screen: pages load ahead of the scroll, far pages
//    are let go, so a client holds at most about `WINDOW.keep + WINDOW.tail` events of any task.
// Each turn is built on its own (`buildTurn`, with what it needs from the turns before it) and
// kept until its events change, so a page or a live event builds only its own turns. Pure and
// language-neutral; the Go port is apps/desktop/internal/views/session.go, and both pass
// fixtures/session.json.
import type { Bodies, LogEvent } from "./index.ts";
import { redact } from "./redact.ts";
import { build, noteOf, planOf, promptOf, turnsOf, type Block, type Turn } from "./transcript.ts";

/** Something inside a turn the locator can point at: a compaction, a switch or move, a report. */
export interface IndexMark {
  seq: number;
  k: "compacted" | "switched" | "moved" | "retuned" | "interrupted" | "report" | "plan";
  /** D325: when it happened (the locator's list says it apart). */
  at?: string;
  /** D325: a report's first line, cut at MARK_MAX, its keys hidden (the locator's list reads it). */
  w?: string;
}

/** One turn of a session (D320): what opened it, its span of the stream, how tall it draws. */
export interface IndexTurn {
  /** Its first event: the prompt (or the stream's first event, for a turn nothing opened). */
  seq: number;
  /** Its last event so far, and how many events it holds. */
  end: number;
  n: number;
  /** When it began and when its last event came. */
  at: string;
  endAt: string;
  /** What opened it, as its block, texts cut at PROMPT_MAX (the locator's line, a placeholder's head). */
  p?: Block;
  /** About how tall it draws settled (its work folded), in 16 px steps. */
  h: number;
  /** It holds steps (its work folds under a line). */
  s?: 1;
  /** Its last words' length in characters. */
  v?: number;
  marks?: IndexMark[];
}

export interface SessionIndex {
  turns: IndexTurn[];
  /** Events in the stream, and the newest's seq. */
  n: number;
  last: number;
  /** The brief was said (a later task_open is a retitle). */
  briefed?: boolean;
  /** The latest report's seq: said above the transcript, never in it. */
  lastReport?: number;
  /** D279: how many times its own wait came true, and when last. */
  wakes: number;
  lastWakeAt?: string;
}

/** How much of what opened a turn the index carries. */
export const PROMPT_MAX = 200;
/** D325: how much of a report's first line a mark carries. */
export const MARK_MAX = 120;

/** The window's sizes (D320), in events. */
export const WINDOW = {
  /** The newest window an opened task asks for first, and each page after (D284). */
  first: 200,
  page: 300,
  /** Held around what is on screen, and always the newest (what the rest of the app reads). */
  keep: 1500,
  tail: 200,
  /** Loaded ahead of the scroll, and behind it. */
  ahead: 600,
  behind: 300,
  /** How far past keep + tail a task's events may grow before far ones are let go. */
  slack: 300,
  /** A turn this big is shown from what is held (its newest part) rather than loaded whole. */
  enough: 600,
  /** Events of a task not open, before its oldest are let go. */
  cap: 2000,
} as const;

export const newIndex = (): SessionIndex => ({ turns: [], n: 0, last: 0, wakes: 0 });

const cut = (s: string, max: number = PROMPT_MAX) => (s.length > max ? s.slice(0, max).replace(/[\ud800-\udbff]$/, "") + "…" : s);

/** A prompt as the index carries it: its texts cut, its pictures left out (the turn's events have them). */
function brief(p: Block): Block {
  const q = { ...p } as Block & { text?: string; full?: number; media?: unknown };
  if (typeof q.text === "string") q.text = cut(q.text);
  delete q.full;
  delete q.media;
  return q;
}

/**
 * About how tall a settled turn draws, in 16 px steps (D320): what opened it (a card, a bubble, a
 * hairline), the line its work folds under, its last words at about 70 characters a line. Only a
 * first guess for a turn never drawn: each client measures a turn once it draws it.
 */
export function heightOf(t: Pick<IndexTurn, "p" | "s" | "v">): number {
  const k = t.p?.k;
  const text = t.p && "text" in t.p ? t.p.text.length : 0;
  let px = 20;
  if (k === "brief" || k === "partner") px += 112;
  else if (k === "you") px += 24 + 22 * Math.min(6, Math.ceil(Math.max(1, text) / 60));
  else if (k) px += 28;
  if (t.s) px += 36;
  if (t.v) px += 10 + 22 * Math.min(40, Math.ceil(t.v / 70));
  return Math.max(2, Math.min(64, Math.round(px / 16)));
}

const MARKS = new Set(["compacted", "switched", "moved", "retuned", "interrupted"]);

/**
 * Adds an event of the task's stream to its index (D320); false when it is one the index has (a
 * page or a live event carrying it again). The home and every client run this same rule, the home
 * over the whole stream once and then as the Log grows, a client on each live event after the
 * index it was sent.
 */
export function indexAdd(ix: SessionIndex, ev: LogEvent): boolean {
  if (ev.seq <= ix.last) return false;
  ix.last = ev.seq;
  ix.n++;
  const p = promptOf(ev, !!ix.briefed);
  if (p) {
    if (p.k === "brief") ix.briefed = true;
    if (p.k === "wake") (ix.wakes++, (ix.lastWakeAt = ev.ts));
    const t: IndexTurn = { seq: ev.seq, end: ev.seq, n: 1, at: ev.ts, endAt: ev.ts, p: brief(p), h: 0 };
    t.h = heightOf(t);
    ix.turns.push(t);
    return true;
  }
  let t = ix.turns.at(-1);
  if (!t) ix.turns.push((t = { seq: ev.seq, end: ev.seq, n: 0, at: ev.ts, endAt: ev.ts, h: 0 }));
  t.end = ev.seq;
  t.n++;
  t.endAt = ev.ts;
  const mark = (k: IndexMark["k"], w?: string) => (t.marks ??= []).push({ seq: ev.seq, k, at: ev.ts, ...(w ? { w } : {}) });
  if (ev.kind === "report") {
    ix.lastReport = ev.seq;
    const line = ((ev.body as Bodies["report"]).summary ?? "").split("\n").map((l) => l.trim()).find((l) => l) ?? "";
    mark("report", line ? redact(cut(line, MARK_MAX)) : undefined);
  } else if (ev.kind === "checkpoint") {
    // D349: a saved note is one quiet line, not its words (unless it said them, already counted).
    const n = (ev.body as Bodies["checkpoint"]).text?.trim().length ?? 0;
    if (n && !t.v) t.v = 1;
  } else if (ev.kind === "task_event") {
    const b = ev.body as Bodies["task_event"];
    if (b.thinking?.length || b.tool) t.s = 1;
    // D268: the plan stands in the turn that first wrote it, with the latest items.
    if (b.tool && !t.marks?.some((m) => m.k === "plan") && planOf(b.tool.name, b.tool.input)) mark("plan");
    else if (b.role === "assistant" && b.text?.trim()) t.v = b.text.trim().length;
    else if (b.role === "system") {
      const say = noteOf((b.text ?? "").trim(), b.raw)?.say;
      if (say && MARKS.has(say)) mark(say as IndexMark["k"]);
    }
  }
  t.h = heightOf(t);
  return true;
}

/** A whole stream's index (the home's first read of it; tests). */
export function indexOf(events: LogEvent[]): SessionIndex {
  const ix = newIndex();
  for (const e of events) indexAdd(ix, e);
  return ix;
}

/** The index from turn `from` on (a client that holds the turns before it asks for only these). */
export function indexFrom(ix: SessionIndex, fromSeq: number): SessionIndex {
  return { ...ix, turns: ix.turns.filter((t) => t.seq >= fromSeq) };
}

/** A client's index joined with the turns from `fromSeq` the home sent (they replace its own from there). */
export function indexJoin(mine: SessionIndex | undefined, got: SessionIndex, fromSeq?: number): SessionIndex {
  if (!mine || !fromSeq) return got;
  return { ...got, turns: [...mine.turns.filter((t) => t.seq < fromSeq), ...got.turns] };
}

// ---------- the window ----------

/** Every event of the stream from `from` to `to` is held; `to` Infinity: through the newest, kept live. */
export interface Span {
  from: number;
  to: number;
}

/** Spans with one more, joined where they meet or overlap. */
export function addSpan(spans: Span[], s: Span): Span[] {
  const all = [...spans, s].sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const x of all) {
    const l = out.at(-1);
    if (l && x.from <= l.to + 1) l.to = Math.max(l.to, x.to);
    else out.push({ ...x });
  }
  return out;
}

/** Spans cut to what `keep` keeps. */
export function cutSpans(spans: Span[], keep: Span[]): Span[] {
  let out: Span[] = [];
  for (const s of spans)
    for (const k of keep) {
      const from = Math.max(s.from, k.from), to = Math.min(s.to, k.to);
      if (from <= to) out = addSpan(out, { from, to });
    }
  return out;
}

/** Whether every event from `from` to `to` is held. */
export const covers = (spans: Span[], from: number, to: number) => spans.some((s) => s.from <= from && s.to >= to);

/** The span a page of history answers for (D320): what it holds, and on to the newest when it reached it. */
export function spanOfPage(f: { events: LogEvent[]; more?: boolean; beforeSeq?: number; afterSeq?: number }): Span | undefined {
  const first = f.events[0]?.seq, last = f.events.at(-1)?.seq;
  if (f.afterSeq != null) {
    if (last == null) return f.more ? undefined : { from: f.afterSeq + 1, to: Infinity };
    return { from: f.afterSeq + 1, to: f.more ? last : Infinity };
  }
  const to = f.beforeSeq ? f.beforeSeq - 1 : Infinity;
  if (first == null) return f.more ? undefined : { from: 0, to };
  return { from: f.more ? first : 0, to };
}

/** Where a turn ends: its last event, or the newest for the last turn (it grows live). */
const endOf = (ix: SessionIndex, i: number) => (i === ix.turns.length - 1 ? Math.max(ix.turns[i]!.end, ix.last) : ix.turns[i]!.end);

/** The first index in `events` (sorted by seq) at or after seq. */
export function lowerBound(events: { seq: number }[], seq: number): number {
  let lo = 0, hi = events.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (events[m]!.seq < seq) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** The held events of turn i, as [lo, hi) into `events`. */
export function turnRange(ix: SessionIndex, i: number, events: { seq: number }[]): [number, number] {
  const lo = lowerBound(events, ix.turns[i]!.seq);
  const next = ix.turns[i + 1]?.seq;
  return [lo, next == null ? events.length : lowerBound(events, next)];
}

/** Turn i is held whole. */
export const turnHeld = (ix: SessionIndex, spans: Span[], i: number) => covers(spans, ix.turns[i]!.seq, endOf(ix, i));

/** The turn holding seq (the last whose start is at or before it), or -1. */
export function turnAt(ix: SessionIndex, seq: number): number {
  return lowerBound(ix.turns, seq + 1) - 1;
}

/** What is on screen: the first and last turn shown, and which way the reader last moved (-1 up, 1 down). */
export interface View {
  first: number;
  last: number;
  dir: -1 | 0 | 1;
}

export type Ask = { beforeSeq: number; limit: number } | { afterSeq: number; limit: number };

/**
 * The next page to ask for (D320), or undefined when what is on screen and around it is held: the
 * turns in view first (from the side the reader moves toward), then `WINDOW.ahead` events ahead of
 * the scroll, then `WINDOW.behind` behind it. A page grows the span next to the turn when there is
 * one (so the two join), else starts a little before the turn (a jump).
 */
export function nextAsk(ix: SessionIndex, spans: Span[], events: { seq: number }[], view: View): Ask | undefined {
  const n = ix.turns.length;
  if (!n) return undefined;
  const first = Math.max(0, Math.min(view.first, n - 1)), last = Math.max(first, Math.min(view.last, n - 1));
  const order: number[] = [];
  const shown: number[] = [];
  for (let i = first; i <= last; i++) shown.push(i);
  if (view.dir > 0) order.push(...shown);
  else order.push(...shown.reverse());
  const walk = (from: number, step: number, budget: number) => {
    for (let i = from, got = 0; i >= 0 && i < n && got < budget; i += step) order.push(i), (got += ix.turns[i]!.n);
  };
  // Ahead of the scroll: up (older) unless moving down.
  if (view.dir > 0) walk(last + 1, 1, WINDOW.ahead), walk(first - 1, -1, WINDOW.behind);
  else walk(first - 1, -1, WINDOW.ahead), walk(last + 1, 1, WINDOW.behind);
  for (const i of order) {
    if (turnHeld(ix, spans, i)) continue;
    const [lo, hi] = turnRange(ix, i, events);
    if (hi - lo >= WINDOW.enough) continue;
    return askFor(ix, spans, i, i < first);
  }
  return undefined;
}

function askFor(ix: SessionIndex, spans: Span[], i: number, above: boolean): Ask {
  const t = ix.turns[i]!;
  const next = ix.turns[i + 1]?.seq ?? Infinity;
  const prevEnd = i > 0 ? ix.turns[i - 1]!.end : -Infinity;
  const end = endOf(ix, i);
  // A span that starts inside this turn or where the next begins: grow it upward.
  const below = spans.find((s) => s.from > t.seq && s.from <= next);
  // A span that ends inside this turn or where the one before ends: grow it downward.
  const over = [...spans].reverse().find((s) => s.to < end && s.to >= prevEnd);
  const up = below && { beforeSeq: below.from, limit: WINDOW.page };
  const down = over && Number.isFinite(over.to) && { afterSeq: over.to, limit: WINDOW.page };
  const pick = above ? up || down : down || up;
  if (pick) return pick;
  // Nothing near: a page starting a little before the turn, so it lands with what led to it.
  let j = i, got = 0;
  while (j > 0 && got + ix.turns[j - 1]!.n <= WINDOW.page / 3) got += ix.turns[--j]!.n;
  return { afterSeq: ix.turns[j]!.seq - 1, limit: WINDOW.page };
}

/**
 * What to keep when a task holds too much (D320), or undefined while it holds no more than
 * keep + tail + slack: `WINDOW.keep` events around what is on screen (ahead of the scroll first)
 * and always the newest `WINDOW.tail`. A client drops every held event outside these and cuts its
 * spans to them.
 */
export function keepFor(ix: SessionIndex, events: { seq: number }[], view: View | undefined): Span[] | undefined {
  if (events.length <= (view ? WINDOW.keep : WINDOW.cap) + WINDOW.tail + WINDOW.slack) return undefined;
  const tail: Span = { from: events[events.length - (view ? WINDOW.tail : WINDOW.cap)]!.seq, to: Infinity };
  const n = ix.turns.length;
  if (!view || !n) return [tail];
  let lo = Math.max(0, Math.min(view.first, n - 1)), hi = Math.max(lo, Math.min(view.last, n - 1));
  let got = 0;
  for (let i = lo; i <= hi; i++) got += ix.turns[i]!.n;
  // Outward from the view: two thirds of what is left ahead of the scroll (up unless moving
  // down), so the next pages are a while away; the rest behind; an edge gives its share away.
  const up = view.dir <= 0;
  let ahead = 0, behind = 0;
  const room = Math.max(0, WINDOW.keep - got);
  const grow = (toUp: boolean) => {
    const k = toUp ? ix.turns[--lo]!.n : ix.turns[++hi]!.n;
    if (toUp === up) ahead += k;
    else behind += k;
    got += k;
  };
  const can = (toUp: boolean) => (toUp ? lo > 0 : hi < n - 1);
  while (got < WINDOW.keep && (can(true) || can(false))) {
    const wantAhead = ahead < (room * 2) / 3 && can(up);
    const wantBehind = behind < room / 3 && can(!up);
    if (wantAhead) grow(up);
    else if (wantBehind) grow(!up);
    else grow(can(up) ? up : !up);
  }
  return addSpan([tail], { from: ix.turns[lo]!.seq, to: hi === n - 1 ? Infinity : ix.turns[hi + 1]!.seq - 1 });
}

// ---------- the turns, built one at a time ----------

/** A turn of the page (D320): its row in the index and, when any of its events are held, it built. */
export interface Slot {
  it: IndexTurn;
  /** Built from what is held; undefined with nothing held: a placeholder of its height (with some
   *  held: it says nothing, as a task's first events before its brief). */
  turn?: Turn;
  /** How many of its events are held, and whether only some are (a page landing, a turn too big to hold whole). */
  held: number;
  part?: boolean;
}

interface Built {
  key: string;
  turn?: Turn;
  app: string;
}

/** The most events one turn is built from: a bigger one shows its newest (its work folds anyway). */
export const BUILD_MAX = 1000;

/** A task's built turns, kept by the turn's first seq until its events change (D320). */
export type TurnCache = Map<number, Built>;

/**
 * The page's turns (D320): every turn of the index, each built from its own held events with what
 * it needs from before it, reusing what `cache` built while its events are the same, so a page or a
 * live event builds only its own turns; nothing held: no turn (the page draws a placeholder of the
 * index's height). `live`: the last turn is under way. A plan, one per task, stands where it was
 * first written with its latest items, as building all at once does.
 */
export function slotsOf(harness: string, ix: SessionIndex, events: LogEvent[], live: boolean, cache: TurnCache): Slot[] {
  const out: Slot[] = [];
  // The app a run of browser steps is in carries within a turn, not from the turn before: a turn
  // is built only when it is drawn, never because the one after it was.
  const app = "";
  const seen = new Set<number>();
  const planned: number[] = [];
  for (let i = 0; i < ix.turns.length; i++) {
    const it = ix.turns[i]!;
    let [lo, hi] = turnRange(ix, i, events);
    if (hi <= lo) {
      out.push({ it, held: 0 });
      continue;
    }
    const last = i === ix.turns.length - 1;
    // A turn of thousands of events (a long live run) is built from its newest BUILD_MAX.
    if (hi - lo > BUILD_MAX) lo = hi - BUILD_MAX;
    const first = events[lo]!;
    // The event before is the one before it in the stream only when held and in the turn before.
    const prev = lo > 0 && i > 0 && events[lo - 1]!.seq >= ix.turns[i - 1]!.seq ? events[lo - 1] : undefined;
    const whole = first.seq === it.seq && hi - lo >= it.n;
    // The latest report matters only to the turn that holds it.
    const report = ix.lastReport != null && ix.lastReport >= it.seq && ix.lastReport <= events[hi - 1]!.seq ? ix.lastReport : 0;
    const key = `${hi - lo}:${first.seq}:${events[hi - 1]!.seq}:${last && live ? 1 : 0}:${last ? 0 : 1}:${app}:${prev?.ts ?? ""}:${report}`;
    seen.add(it.seq);
    const make = (): Built => {
      let b = cache.get(it.seq);
      if (b && b.key === key) return b;
      const r = build(harness, events.slice(lo, hi), last && live, {
        briefed: it.p?.k !== "brief" && (i > 0 || !!ix.briefed),
        lastReport: ix.lastReport,
        ...(prev ? { prevTs: prev.ts } : {}),
        more: !last,
        app,
      });
      const turns = turnsOf(r.blocks);
      let turn: Turn | undefined = turns.length ? { seq: turns[0]!.seq, ...(turns[0]!.prompt ? { prompt: turns[0]!.prompt } : {}), body: turns.flatMap((t, k) => (k === 0 ? t.body : t.prompt ? [t.prompt, ...t.body] : t.body)) } : undefined;
      // Held from its middle: what opened it, from the index.
      if (turn && !turn.prompt && it.p && first.seq !== it.seq) turn = { ...turn, seq: it.seq, prompt: it.p };
      cache.set(it.seq, (b = { key, ...(turn ? { turn } : {}), app: r.app }));
      return b;
    };
    // Built when first read (drawn, or read by the page), then kept while its events are the same.
    let got: Built | undefined;
    const slot = { it, held: hi - lo, ...(whole ? {} : { part: true }) } as Slot;
    Object.defineProperty(slot, "turn", { enumerable: true, configurable: true, get: () => (got ??= make()).turn, set: (v: Turn) => Object.defineProperty(slot, "turn", { value: v, enumerable: true, writable: true }) });
    out.push(slot);
    if (it.marks?.some((m) => m.k === "plan")) planned.push(i);
  }
  for (const k of cache.keys()) if (!seen.has(k)) cache.delete(k);
  return plans(out, planned);
}

/**
 * One plan per task (D268), as building all at once makes it: the first held, with the latest held
 * items. Only the turns the index marks as writing a plan are built for it.
 */
function plans(slots: Slot[], planned: number[]): Slot[] {
  const at: [number, number][] = [];
  for (const i of planned) slots[i]!.turn?.body.forEach((b, j) => b.k === "plan" && at.push([i, j]));
  if (at.length < 2) return slots;
  const [fi, fj] = at[0]!;
  const [li, lj] = at.at(-1)!;
  const items = (slots[li]!.turn!.body[lj] as Extract<Block, { k: "plan" }>).items;
  const out = [...slots];
  for (const i of new Set(at.map(([i]) => i))) {
    const s = out[i]!;
    const body = s.turn!.body.flatMap((b, j): Block[] => (b.k !== "plan" ? [b] : i === fi && j === fj ? [{ ...b, items }] : []));
    out[i] = { it: s.it, held: s.held, ...(s.part ? { part: true } : {}), turn: { ...s.turn!, body } };
  }
  return out;
}

/** The turns built (the held ones), in order: what the rest of the page reads. */
export const builtTurns = (slots: Slot[]): Turn[] => slots.flatMap((s) => (s.turn ? [s.turn] : []));
