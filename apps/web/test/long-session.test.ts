// D320: a session of 2,000, 10,000 and 50,000 events on the web. A fake home holds the task behind
// a simulated link (80 ms round trip, 4 Mbit/s, frames over 16 KB gzipped) and answers its session index and its pages as
// core/src/ws.ts does. Measured: the work of first paint after the frames arrive; the work of each
// step of a scroll from the end to the head (a step: what is on screen moves two turns; the
// window lets far events go and asks the next page, the page lands, the turns are built, the
// virtual list finds what to draw), its p95 and its longest (a long task is over 50 ms); what is
// held (events, built turns, turns drawn); a locator jump into the middle; live events while
// scrolled up. Budgets are local; CI (slower shared runners) gets twice the time.
import { describe, expect, test } from "bun:test";
import type { ClientFrame, LogEvent, ServerFrame } from "@ducter/protocol";
import { longTask } from "@ducter/protocol/fixtures/longtask.ts";
import { indexOf, lowerBound, turnAt, turnHeld, WINDOW, type View } from "@ducter/protocol/src/session.ts";
import { Store, windowAsk } from "../src/store.ts";
import { builtCount, taskSlots, taskTurns } from "../src/transcript.tsx";
import { rangeOf, topsOf } from "../src/vlist.ts";

const CI = !!process.env.CI;
/**
 * How slow this machine is right now, against a quiet Mac: a fixed piece of work timed before
 * the budgets are checked. A loaded machine (other suites, an e2e VM) stretches every budget the
 * same way, so a real regression still shows while load alone doesn't fail the build. Never
 * under the CI floor, never over 4x.
 */
function machineSlowness(): number {
  const QUIET_MS = 35; // this loop on a quiet Apple-silicon Mac (estimated under load: 74 ms median at load ~117; recalibrate when quiet)
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    const a: number[] = [];
    for (let i = 0; i < 200_000; i++) a.push((i * 2654435761) % 1000003);
    a.sort((x, y) => x - y);
    JSON.parse(JSON.stringify(a.slice(0, 20_000)));
    runs.push(performance.now() - t0);
  }
  runs.sort((x, y) => x - y);
  return Math.min(4, Math.max(CI ? 2 : 1, runs[2]! / QUIET_MS));
}
const slow = machineSlowness();
type Hist = Extract<ClientFrame, { t: "task_history" }>;

/** The home: the index, made once and kept; pages before or after a seq, as ws.ts answers them. */
function home(evs: LogEvent[], id: string) {
  const ix = indexOf(evs);
  return {
    evs,
    ix,
    index: (): string => JSON.stringify({ t: "task_index", taskId: id, index: ix }),
    page(r: Hist): string {
      const limit = r.limit ?? 200;
      if (r.afterSeq != null) {
        const from = lowerBound(evs, r.afterSeq + 1);
        return JSON.stringify({ t: "task_history", taskId: id, events: evs.slice(from, from + limit), more: from + limit < evs.length, afterSeq: r.afterSeq });
      }
      const to = r.beforeSeq ? lowerBound(evs, r.beforeSeq) : evs.length;
      const from = Math.max(0, to - limit);
      return JSON.stringify({ t: "task_history", taskId: id, events: evs.slice(from, to), more: from > 0, ...(r.beforeSeq ? { beforeSeq: r.beforeSeq } : {}) });
    },
  };
}
// The link carries a frame over 16 KB gzipped (D284).
const link = (json: string) => 80 + ((json.length > 16_384 ? Bun.gzipSync(Buffer.from(json)).length : json.length) / (4e6 / 8)) * 1000;
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0;

function open(N: number) {
  const id = `s${N}`;
  const h = home(longTask(N, { taskId: id }), id);
  const S = new Store();
  S.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 } as ServerFrame);
  S.open.add(id);
  const frame = (json: string) => {
    const t0 = performance.now();
    S.apply(JSON.parse(json) as ServerFrame);
    taskSlots(S.tasks.get(id)!);
    return performance.now() - t0;
  };
  // Opening: the index and the newest window, asked together.
  const ixJson = h.index();
  S.historyAsked(id, WINDOW.first);
  const winJson = h.page({ t: "task_history", taskId: id, limit: WINDOW.first });
  const paint = frame(ixJson) + frame(winJson);
  const toPaint = Math.max(link(ixJson), link(winJson)) + paint;
  /** The window's step for a view, its page answered at once; the time of the work. */
  const step = (v: View) => {
    const t0 = performance.now();
    const a = windowAsk(S, id, v);
    let json = "";
    if (a) {
      S.historyAsked(id, a.limit);
      json = h.page({ t: "task_history", taskId: id, ...a });
      S.apply(JSON.parse(json) as ServerFrame);
    }
    // What the virtual list draws for this view: the turns from a screen above it to one below.
    const slots = taskSlots(S.tasks.get(id)!);
    const tops = topsOf(slots.map((s) => s.it.h * 16), 28);
    const r = rangeOf(tops, tops[v.first]!, 900, 900);
    for (let i = r.from; i < r.to; i++) void slots[i]!.turn;
    const ms = performance.now() - t0;
    return { ms, asked: !!a, wire: json ? link(json) : 0, drawn: r.to - r.from };
  };
  return { id, h, S, paint, toPaint, ixKB: ixJson.length / 1024, winKB: winJson.length / 1024, step };
}

describe("a long session on the web (D320)", () => {
  for (const N of [2000, 10_000, 50_000])
    test(`${N.toLocaleString()} events: opens, scrolls to its head and jumps within budget, holding a bounded window`, () => {
      const o = open(N);
      const task = o.S.tasks.get(o.id)!;
      const T = o.h.ix.turns.length;
      expect(o.paint).toBeLessThan(150 * slow);
      expect(taskTurns(task).slice(-2).some((tu) => tu.body.some((b) => b.k === "voice" && b.text.startsWith("Round")))).toBe(true);
      // Scrolling from the end to the head, two turns a step; each step settles its pages.
      const times: number[] = [];
      let most = 0, pages = 0, drawnMost = 0;
      for (let f = T - 3; f >= 0; f -= 2) {
        const v: View = { first: f, last: Math.min(T - 1, f + 2), dir: -1 };
        for (let k = 0; k < 8; k++) {
          const s = o.step(v);
          times.push(s.ms);
          drawnMost = Math.max(drawnMost, s.drawn);
          if (!s.asked) break;
          pages++;
        }
        for (let i = v.first; i <= v.last; i++) expect(turnHeld(o.h.ix, task.spans, i)).toBe(true);
        most = Math.max(most, task.events.length);
      }
      const bound = WINDOW.keep + WINDOW.tail + WINDOW.slack + WINDOW.page;
      expect(most).toBeLessThanOrEqual(bound);
      expect(task.events.at(-1)!.seq).toBe(o.h.evs.at(-1)!.seq);
      const built = builtCount(task);
      // A jump into the middle: the window around it lands, its turn is built.
      const to = turnAt(o.h.ix, o.h.evs[Math.floor(N / 2)]!.seq);
      const t0 = performance.now();
      let jumpPages = 0, jumpLink = 0, firstPage = 0;
      for (let k = 0; k < 8; k++) {
        const s = o.step({ first: to, last: to + 2, dir: 0 });
        if (!s.asked) break;
        jumpPages++;
        jumpLink += s.wire;
        if (k === 0) firstPage = performance.now() - t0 + s.wire;
      }
      const jumpMs = performance.now() - t0;
      expect(taskSlots(task)[to]!.turn).toBeDefined();
      console.log(
        `web ${N}: index ${o.ixKB.toFixed(0)} KB + window ${o.winKB.toFixed(0)} KB, first paint ${o.paint.toFixed(1)} ms after they arrive (${o.toPaint.toFixed(0)} ms on the link); ` +
          `scroll to the head: ${times.length} steps, ${pages} pages, p95 ${p95(times).toFixed(1)} ms, longest ${Math.max(...times).toFixed(1)} ms; ` +
          `held at most ${most} events, ${built} of ${T} turns built, ${drawnMost} turns drawn; jump to the middle: its turn drawn ${firstPage.toFixed(0)} ms after the click on the link (${jumpMs.toFixed(1)} ms of work, ${jumpPages} page(s) to fill around it, ${jumpLink.toFixed(0)} ms on the link)`,
      );
      expect(p95(times)).toBeLessThan(16 * slow);
      expect(Math.max(...times)).toBeLessThan(50 * slow);
      expect(jumpMs).toBeLessThan(100 * slow);
      expect(drawnMost).toBeLessThan(40);
    }, 60_000);

  test("live events while scrolled up: the index and the tail grow, the reader's turns stay, the window stays bounded", () => {
    const o = open(10_000);
    const task = o.S.tasks.get(o.id)!;
    const v: View = { first: 100, last: 102, dir: -1 };
    for (let k = 0; k < 10 && o.step(v).asked; k++);
    const before = taskSlots(task).slice(100, 103).map((s) => s.turn);
    const more = longTask(11_000, { taskId: o.id }).slice(10_000);
    const times: number[] = [];
    for (const e of more) {
      const t0 = performance.now();
      o.S.apply({ t: "events", events: [e] } as ServerFrame);
      o.step(v);
      times.push(performance.now() - t0);
    }
    expect(task.index!.n).toBe(11_000);
    expect(task.events.at(-1)!.seq).toBe(more.at(-1)!.seq);
    // The turns the reader is on were not built again.
    expect(taskSlots(task).slice(100, 103).map((s) => s.turn)).toEqual(before);
    expect(taskSlots(task).slice(100, 103).every((s, i) => s.turn === before[i])).toBe(true);
    expect(task.events.length).toBeLessThanOrEqual(WINDOW.keep + WINDOW.tail + WINDOW.slack + WINDOW.page);
    console.log(`web live while scrolled up: 1,000 events, each p95 ${p95(times).toFixed(2)} ms, longest ${Math.max(...times).toFixed(1)} ms`);
    expect(p95(times)).toBeLessThan(8 * slow);
  });

  test("a huge output is cut, and the whole is still its event's", () => {
    const o = open(2000);
    const task = o.S.tasks.get(o.id)!;
    // A 3 MB log (a run of one 3 MB token is another matter: the key redaction is slow on it).
    const big = "2026-11-16 09:12:01 INFO worker 3 took job 81 (ok)\n".repeat(60_000);
    const last = task.events.at(-1)!;
    o.S.apply({ t: "events", events: [{ ...last, seq: last.seq + 1, body: { taskId: o.id, role: "tool", tool: { name: "Bash", input: { command: "cat big.log" }, output: big, ok: true } } }, { ...last, seq: last.seq + 2, body: { taskId: o.id, role: "assistant", text: big } }] } as ServerFrame);
    const t0 = performance.now();
    const turn = taskTurns(task).at(-1)!;
    const ms = performance.now() - t0;
    const voice = turn.body.find((b) => b.k === "voice" && b.seq === last.seq + 2) as { text: string; full?: number };
    expect(voice.text.length).toBeLessThan(25_000);
    expect(voice.full).toBe(big.trim().length);
    const rows = turn.body.flatMap((b) => (b.k === "steps" ? b.lines.flatMap((l) => (l.k === "row" ? [l.row] : l.rows)) : []));
    expect(rows.find((r) => r.seq === last.seq + 1)?.outputFull).toBe(big.trimEnd().length);
    expect(ms).toBeLessThan(200 * slow);
  });
});

describe("the virtual list (D320)", () => {
  test("draws the rows a view shows and a screen either side", () => {
    const tops = topsOf([100, 100, 100, 100, 100, 100, 100, 100, 100, 100], 20);
    expect(tops[10]).toBe(1200);
    expect(rangeOf(tops, 0, 240, 0)).toEqual({ from: 0, to: 3, first: 0, last: 1 });
    expect(rangeOf(tops, 600, 240, 240)).toEqual({ from: 3, to: 10, first: 5, last: 6 });
    expect(rangeOf(tops, 1100, 240, 240)).toEqual({ from: 7, to: 10, first: 9, last: 9 });
    expect(rangeOf(topsOf([], 20), 0, 240, 240)).toEqual({ from: 0, to: 0, first: 0, last: -1 });
  });
});
