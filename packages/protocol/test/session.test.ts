// D320: the session index and the window. The index cuts turns where the transcript does, and is
// the same made at once or event by event; a turn built alone is the turn built with all the rest;
// a reader scrolling a 50,000-event session from its end to its head and back, or jumping into its
// middle, always gets the turns on screen while holding a bounded window. The Go port passes
// fixtures/session.json (apps/desktop/internal/views/session_test.go).
import { describe, expect, test } from "bun:test";
import type { LogEvent } from "../src/index.ts";
import { longTask } from "../fixtures/longtask.ts";
import fixture from "../fixtures/session.json";
import { cases, index as fixIndex } from "../fixtures/session-cases.ts";
import { addSpan, builtTurns, covers, cutSpans, indexAdd, indexFrom, indexJoin, indexOf, keepFor, lowerBound, newIndex, nextAsk, slotsOf, spanOfPage, turnAt, turnHeld, WINDOW, type Ask, type SessionIndex, type Span, type TurnCache, type View } from "../src/session.ts";
import { blocksOf, turnsOf } from "../src/transcript.ts";

const inf = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (x === Infinity ? null : x)));

describe("the session index", () => {
  test("made at once or event by event, the same; a client joins the home's from a turn on", () => {
    const evs = longTask(3000);
    const ix = indexOf(evs);
    expect(ix.n).toBe(3000);
    expect(ix.turns.reduce((a, t) => a + t.n, 0)).toBe(3000);
    expect(ix.turns[0]!.p?.k).toBe("brief");
    expect(ix.wakes).toBe(ix.turns.filter((t) => t.p?.k === "wake").length);
    // The home's index up to a point, then live events on the client: the same as the home's now.
    const home = indexOf(evs.slice(0, 2000));
    const mine = structuredClone(home);
    for (const e of evs.slice(1990)) indexAdd(mine, e);
    expect(mine).toEqual(ix);
    // Asking again from its last turn: the home's turns from there replace its own.
    const at = home.turns.at(-1)!.seq;
    expect(indexJoin(home, indexFrom(ix, at), at)).toEqual(ix);
    expect(indexAdd(mine, evs[5]!)).toBe(false);
  });

  test("the fixture is what the cases file says", () => {
    expect(inf(fixIndex)).toEqual(fixture.index);
    for (const [i, c] of cases.entries()) expect(inf(c.spans)).toEqual(fixture.cases[i]!.spans);
  });

  test("a turn built alone is the turn built with everything before it", () => {
    const evs = longTask(3000);
    const ix = indexOf(evs);
    const all = turnsOf(blocksOf("claude-code", evs, true));
    expect(builtTurns(slotsOf("claude-code", ix, evs, true, new Map()))).toEqual(all);
    // Holding only a far stretch: those turns are the same, the rest are placeholders.
    const a = ix.turns[40]!.seq, b = ix.turns[60]!.seq;
    const part = evs.filter((e) => e.seq >= a && e.seq < b);
    const slots = slotsOf("claude-code", ix, part, true, new Map());
    expect(slots.filter((s) => s.turn).length).toBe(20);
    expect(builtTurns(slots)).toEqual(all.filter((t) => t.seq >= a && t.seq < b));
    expect(slots[10]!.turn).toBeUndefined();
    expect(slots[10]!.held).toBe(0);
  });

  test("a page or a live event builds only its own turns", () => {
    const evs = longTask(3000);
    const ix = indexOf(evs.slice(0, 2990));
    let held = evs.slice(0, 2990);
    const cache: TurnCache = new Map();
    const first = slotsOf("claude-code", ix, held, true, cache);
    const same = slotsOf("claude-code", ix, held, true, cache);
    expect(same.every((s, i) => s.turn === first[i]!.turn)).toBe(true);
    for (const e of evs.slice(2990)) indexAdd(ix, e);
    held = evs;
    const next = slotsOf("claude-code", ix, held, true, cache);
    const rebuilt = next.filter((s, i) => i < first.length && s.turn !== first[i]!.turn).length;
    expect(rebuilt).toBeLessThanOrEqual(2); // the turn that grew, and the one before a new turn
  });
});

describe("the window", () => {
  test("spans join where they meet and cut to what is kept", () => {
    expect(addSpan([{ from: 10, to: 20 }], { from: 21, to: 30 })).toEqual([{ from: 10, to: 30 }]);
    expect(addSpan([{ from: 10, to: 20 }], { from: 40, to: Infinity })).toEqual([{ from: 10, to: 20 }, { from: 40, to: Infinity }]);
    expect(cutSpans([{ from: 0, to: Infinity }], [{ from: 50, to: 60 }, { from: 90, to: Infinity }])).toEqual([{ from: 50, to: 60 }, { from: 90, to: Infinity }]);
    expect(spanOfPage({ events: [{ seq: 5 }, { seq: 9 }] as LogEvent[], more: true })).toEqual({ from: 5, to: Infinity });
    expect(spanOfPage({ events: [{ seq: 5 }] as LogEvent[], more: false, beforeSeq: 12 })).toEqual({ from: 0, to: 11 });
    expect(spanOfPage({ events: [{ seq: 5 }, { seq: 9 }] as LogEvent[], more: true, afterSeq: 3 })).toEqual({ from: 4, to: 9 });
    expect(spanOfPage({ events: [{ seq: 5 }] as LogEvent[], more: false, afterSeq: 3 })).toEqual({ from: 4, to: Infinity });
  });

  test("the fixture's asks and keeps (the Go port answers the same)", () => {
    const evs = longTask(3000);
    for (const [i, c] of cases.entries()) {
      const held = evs.filter((e) => c.spans.some((s) => covers([s], e.seq, e.seq)));
      expect(inf(nextAsk(fixIndex, c.spans, held, c.view) ?? null)).toEqual(fixture.cases[i]!.ask);
      expect(inf(keepFor(fixIndex, held, c.view) ?? null)).toEqual(fixture.cases[i]!.keep);
    }
  });
});

/** A home answering task_history from one stream, as core/src/ws.ts does. */
function page(evs: LogEvent[], a: Ask | { limit: number }) {
  if ("afterSeq" in a) {
    const from = lowerBound(evs, a.afterSeq + 1);
    const got = evs.slice(from, from + a.limit);
    return { events: got, more: from + a.limit < evs.length, afterSeq: a.afterSeq };
  }
  const before = "beforeSeq" in a ? a.beforeSeq : undefined;
  const to = before == null ? evs.length : lowerBound(evs, before);
  const from = Math.max(0, to - a.limit);
  return { events: evs.slice(from, to), more: from > 0, ...(before != null ? { beforeSeq: before } : {}) };
}

/** A client of the window rules: what it holds, and the pages it asked for. */
class Client {
  events: LogEvent[] = [];
  spans: Span[] = [];
  asks = 0;
  most = 0;
  constructor(public ix: SessionIndex, public home: LogEvent[]) {}
  land(p: ReturnType<typeof page>) {
    const have = new Set(this.events.map((e) => e.seq));
    this.events = [...this.events, ...p.events.filter((e) => !have.has(e.seq))].sort((a, b) => a.seq - b.seq);
    const s = spanOfPage(p);
    if (s) this.spans = addSpan(this.spans, s);
  }
  settle(view: View) {
    for (let a = nextAsk(this.ix, this.spans, this.events, view); a; a = nextAsk(this.ix, this.spans, this.events, view)) {
      this.land(page(this.home, a));
      this.asks++;
      this.most = Math.max(this.most, this.events.length);
      if (this.asks > 10_000) throw new Error("asks without end");
    }
    const keep = keepFor(this.ix, this.events, view);
    if (keep) {
      this.events = this.events.filter((e) => covers(keep, e.seq, e.seq));
      this.spans = cutSpans(this.spans, keep);
    }
  }
  shown(view: View) {
    for (let i = view.first; i <= view.last; i++) if (!turnHeld(this.ix, this.spans, i)) return false;
    return true;
  }
}

describe("a 50,000-event session", () => {
  const evs = longTask(50_000, { taskId: "big" });
  const ix = indexOf(evs);
  const T = ix.turns.length;
  const bound = WINDOW.keep + WINDOW.tail + WINDOW.slack + WINDOW.page;

  test("from its end to its head and back, the turns on screen are always held, and never more than the window", () => {
    const c = new Client(ix, evs);
    c.land(page(evs, { limit: WINDOW.first }));
    let view: View = { first: T - 3, last: T - 1, dir: 0 };
    c.settle(view);
    expect(c.shown(view)).toBe(true);
    for (let f = T - 4; f >= 0; f -= 2) {
      view = { first: f, last: Math.min(T - 1, f + 2), dir: -1 };
      c.settle(view);
      expect(c.shown(view)).toBe(true);
      expect(c.events.length).toBeLessThanOrEqual(bound);
    }
    expect(c.events[0]!.seq).toBe(evs[0]!.seq);
    for (let f = 0; f < T - 3; f += 3) {
      view = { first: f, last: f + 2, dir: 1 };
      c.settle(view);
      expect(c.shown(view)).toBe(true);
    }
    expect(c.most).toBeLessThanOrEqual(bound);
    // Every page was needed: about the session's size in pages, each way.
    console.log(`50k: ${c.asks} pages for two passes, at most ${c.most} events held`);
    expect(c.asks).toBeLessThan((2 * 50_000) / WINDOW.page + 40);
  });

  test("a jump into the middle lands with what led to it, and its newest stay held", () => {
    const c = new Client(ix, evs);
    c.land(page(evs, { limit: WINDOW.first }));
    c.settle({ first: T - 3, last: T - 1, dir: 0 });
    const to = turnAt(ix, evs[25_000]!.seq);
    const view: View = { first: to, last: to + 2, dir: 0 };
    c.settle(view);
    expect(c.shown(view)).toBe(true);
    expect(covers(c.spans, ix.turns[to - 1]!.seq, ix.turns[to - 1]!.end)).toBe(true);
    expect(c.events.at(-1)!.seq).toBe(evs.at(-1)!.seq);
    expect(c.events.length).toBeLessThanOrEqual(bound);
  });

  test("live events while scrolled up: the index grows, the tail stays held, the window stays bounded", () => {
    const c = new Client(structuredClone(ix), evs);
    c.land(page(evs, { limit: WINDOW.first }));
    const view: View = { first: 100, last: 102, dir: -1 };
    c.settle(view);
    const more = longTask(51_000, { taskId: "big" }).slice(50_000);
    for (const e of more) {
      indexAdd(c.ix, e);
      c.home.push(e);
      // Live: it lands on the tail span (through the newest).
      if (c.spans.some((s) => s.to === Infinity)) c.land({ events: [e], more: false, afterSeq: e.seq - 1 });
      c.settle(view);
    }
    expect(c.ix.n).toBe(51_000);
    expect(c.events.at(-1)!.seq).toBe(more.at(-1)!.seq);
    expect(c.shown(view)).toBe(true);
    expect(c.events.length).toBeLessThanOrEqual(bound);
  });

  test("the index is small, and made fast", () => {
    const t0 = performance.now();
    const again = newIndex();
    for (const e of evs) indexAdd(again, e);
    const ms = performance.now() - t0;
    const kb = JSON.stringify(again).length / 1024;
    console.log(`50k: index of ${again.turns.length} turns, ${kb.toFixed(0)} KB, made in ${ms.toFixed(0)} ms`);
    expect(kb).toBeLessThan(600);
  });
});
