// D325: the locator's list on the web. Its landmarks come from the session index alone (the same
// model as the Mac's, fixtures/landmarks.json); a row in words says its time in order (a range
// that crosses a day names both days, never "10:46–10:32"); the keys move the choice; the list
// draws only the rows near its view; over a 50,000-event session, making the list and moving
// through it stay well under a frame.
import { describe, expect, test } from "bun:test";
import { landmarkNear, landmarksIn, landmarksOf, type Landmark } from "@ducter/protocol/src/landmarks.ts";
import { indexOf, type IndexTurn } from "@ducter/protocol/src/session.ts";
import { longTask } from "@ducter/protocol/fixtures/longtask.ts";
import fixture from "@ducter/protocol/fixtures/landmarks.json";
import { loop } from "@ducter/protocol/fixtures/landmarks-cases.ts";
import { A } from "../src/app.ts";
import { strings } from "../src/i18n.ts";
import { span, stamp } from "../src/format.ts";
import { LOC_MAX, LOC_ROW, locatorRow, locKey, locScrollFor, locWindow } from "../src/transcript.tsx";import { budget } from "./slowness.ts";

const local = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).toISOString();
const NOW = new Date(2026, 10, 17, 12, 0).getTime();

describe("D325 landmarks", () => {
  test("the model makes what the fixture holds", () => {
    for (const c of fixture as unknown as { name: string; turns: IndexTurn[]; want: Landmark[]; near: number[]; inView: { first: number; last: number; got: [number, number] }[] }[]) {
      const lms = landmarksOf(c.turns);
      expect(JSON.parse(JSON.stringify(lms))).toEqual(c.want);
      expect(c.turns.map((_, i) => landmarkNear(lms, i))).toEqual(c.near);
      for (const v of c.inView) expect(landmarksIn(lms, v.first, v.last)).toEqual(v.got);
    }
  });

  test("a review loop reads as what was said, what it found, and the waits between folded", () => {
    const lms = landmarksOf(loop);
    expect(lms.map((l) => l.k)).toEqual(["brief", "report", "quiet", "report", "quiet", "compacted", "quiet", "you", "switched", "quiet", "interrupted", "moved", "quiet", "you", "report"]);
    // A round that reports is its report, the wake folded into it; a plan and a retune are not landmarks.
    expect(lms[3]).toMatchObject({ k: "report", text: "#215 的测试挂了，我留了评论" });
    expect(lms[2]).toMatchObject({ k: "quiet", n: 2, wakes: true });
    expect(lms[4]).toMatchObject({ k: "quiet", n: 4 });
    expect(lms[4]!.wakes).toBeUndefined();
  });
});

describe("D325 times in order", () => {
  for (const lang of ["zh", "en"] as const) {
    test(`a range never reads backwards (${lang})`, () => {
      const L = strings(lang);
      const w = (zh: string, en: string) => (lang === "zh" ? zh : en);
      expect(span(L, local(17, 10, 32), local(17, 10, 46), NOW)).toBe("10:32–10:46");
      expect(span(L, local(17, 10, 46), local(17, 10, 32), NOW)).toBe("10:32–10:46");
      // The author's "等到了 26 次 10:46–10:32": a loop overnight.
      expect(span(L, local(16, 10, 46), local(17, 10, 32), NOW)).toBe(w("昨天 10:46–今天 10:32", "yesterday 10:46–today 10:32"));
      expect(span(L, local(16, 9, 5), local(16, 22, 10), NOW)).toBe(w("昨天 9:05–22:10", "yesterday 9:05–22:10"));
      expect(span(L, local(17, 11, 51), local(17, 11, 51), NOW)).toBe("11:51");
      expect(stamp(L, local(17, 9, 47), NOW)).toBe("9:47");
      expect(stamp(L, local(16, 9, 47), NOW)).toBe(w("昨天 9:47", "yesterday 9:47"));
    });
  }

  test("a row says its words and its time apart", () => {
    A.L = strings("zh");
    const lms = landmarksOf(loop);
    const rows = lms.map((l) => locatorRow(l, Date.parse("2026-11-17T12:00:00Z")));
    expect(rows[0]).toMatchObject({ k: "brief", line: "你能帮我准备好能 review 的 PR 吗？", tag: "交给它的事", quiet: false });
    expect(rows[2]!.line).toBe("等到了 2 次");
    expect(rows[4]!.line).toBe("4 条提示");
    expect(rows[5]).toMatchObject({ line: "压缩了上下文", quiet: true });
    expect(rows[8]!.line).toBe("换了做事的 AI agent");
    expect(rows[14]!.line).toBe("交回了进展");
    for (const r of rows) {
      const m = /(\d+):(\d\d)–(?:\S+ )?(\d+):(\d\d)$/.exec(r.at);
      if (m && !/昨天|今天|yesterday|today/.test(r.at.split("–")[1]!)) expect(Number(m[1]) * 60 + Number(m[2])).toBeLessThanOrEqual(Number(m[3]) * 60 + Number(m[4]));
    }
  });
});

describe("D325 the list", () => {
  test("keys move the choice within it", () => {
    expect(locKey(5, 10, "ArrowDown")).toBe(6);
    expect(locKey(9, 10, "ArrowDown")).toBe(9);
    expect(locKey(0, 10, "ArrowUp")).toBe(0);
    expect(locKey(5, 100, "Home")).toBe(0);
    expect(locKey(5, 100, "End")).toBe(99);
    expect(locKey(5, 100, "PageDown")).toBe(5 + Math.floor(LOC_MAX / LOC_ROW) - 1);
    expect(locKey(5, 100, "a")).toBeUndefined();
    expect(locKey(0, 0, "ArrowDown")).toBeUndefined();
  });

  test("it draws only the rows near its view, and shows the choice", () => {
    const [from, to] = locWindow(28 * 500, LOC_MAX, 2000);
    expect(to - from).toBeLessThan(40);
    expect(from).toBeLessThanOrEqual(500);
    expect(to).toBeGreaterThan(500 + LOC_MAX / LOC_ROW);
    // Pointed at: centered; moved by a key: just into view; at the ends: clamped.
    expect(locScrollFor(500, 0, LOC_MAX, 2000, true)).toBe(500 * LOC_ROW + LOC_ROW / 2 - LOC_MAX / 2);
    expect(locScrollFor(0, 0, LOC_MAX, 2000, true)).toBe(0);
    expect(locScrollFor(1999, 0, LOC_MAX, 2000, true)).toBe(2000 * LOC_ROW - LOC_MAX);
    expect(locScrollFor(20, 0, LOC_MAX, 2000, false)).toBe(21 * LOC_ROW - LOC_MAX);
    expect(locScrollFor(3, 0, LOC_MAX, 2000, false)).toBe(0);
  });

  test("a 50,000-event session stays light", () => {
    const ix = indexOf(longTask(50_000, { taskId: "big" }));
    let t0 = performance.now();
    const lms = landmarksOf(ix.turns);
    const made = performance.now() - t0;
    expect(lms.length).toBeGreaterThan(100);
    A.L = strings("en");
    t0 = performance.now();
    let sel = 0;
    for (let i = 0; i < ix.turns.length; i++) {
      sel = landmarkNear(lms, i);
      landmarksIn(lms, i, i + 3);
      const [from, to] = locWindow(sel * LOC_ROW, LOC_MAX, lms.length);
      for (let k = from; k < to; k++) locatorRow(lms[k]!, NOW);
    }
    const each = (performance.now() - t0) / ix.turns.length;
    // Well under a frame (16 ms): made once, then each move with its drawn rows said.
    expect(made).toBeLessThan(budget(8, made));
    expect(each).toBeLessThan(budget(2, each));
  });
});
