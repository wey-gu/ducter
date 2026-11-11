// D206: the grid rules every client draws a message's pictures by, and the refs on the wire.
import { expect, test } from "bun:test";
import { gridLayout, mediaPath, SINGLE_MAX_ASPECT, SINGLE_MIN_ASPECT, sizeWords, thumbPath, type MediaRef } from "../src/media.ts";
import { redactDeep } from "../src/redact.ts";
import { blocksOf } from "../src/transcript.ts";

test("one picture keeps its own shape, within 21:9 and 1:3", () => {
  expect(gridLayout([{ w: 1600, h: 1200 }])).toEqual({ tiles: [{ i: 0, x: 0, y: 0, w: 1, h: 0.75 }], aspect: 0.75, single: true });
  expect(gridLayout([{ w: 1290, h: 2796 }]).aspect).toBeCloseTo(2796 / 1290);
  expect(gridLayout([{ w: 600, h: 6000 }]).aspect).toBe(SINGLE_MAX_ASPECT); // a very long screenshot is cut
  expect(gridLayout([{ w: 8000, h: 1000 }]).aspect).toBe(SINGLE_MIN_ASPECT);
  expect(gridLayout([{}]).aspect).toBe(0.75); // no size known: 4:3 until it loads
});

test("two side by side, three as one tall and two stacked, four as 2×2", () => {
  const two = gridLayout([{}, {}]);
  expect(two.tiles.map((t) => [t.x, t.w])).toEqual([[0, 0.5], [0.5, 0.5]]);
  const three = gridLayout([{}, {}, {}]);
  expect(three.tiles[0]).toMatchObject({ x: 0, w: 2 / 3, h: three.aspect });
  expect(three.tiles[1]!.h + three.tiles[2]!.h).toBeCloseTo(three.aspect);
  const four = gridLayout([{}, {}, {}, {}]);
  expect(four.tiles.map((t) => [t.x, t.y])).toEqual([[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]);
  expect(four.tiles.some((t) => t.more)).toBe(false);
});

test("more than four: the first four, +n on the last", () => {
  const g = gridLayout(Array.from({ length: 7 }, () => ({})));
  expect(g.tiles).toHaveLength(4);
  expect(g.tiles[3]!.more).toBe(3);
  // The tiles cover the box without overlap.
  const area = g.tiles.reduce((s, t) => s + t.w * t.h, 0);
  expect(area).toBeCloseTo(g.aspect);
});

const ref: MediaRef = { id: "a".repeat(64), type: "image/png", bytes: 1234, w: 10, h: 10, k: "K".repeat(22), preview: "data:image/jpeg;base64,/9j/AIzaSyD-fake-looking-key0000000000", thumb: { id: "b".repeat(64), k: "T".repeat(22) } };

test("paths and words", () => {
  expect(mediaPath(ref)).toBe(`media/${"a".repeat(64)}?k=${"K".repeat(22)}`);
  expect(thumbPath(ref)).toBe(`media/${"b".repeat(64)}?k=${"T".repeat(22)}`);
  expect(sizeWords(820 * 1024)).toBe("820 KB");
  expect(sizeWords(3.4 * 1024 * 1024)).toBe("3.4 MB");
});

test("a ref crosses the key hiding untouched (a preview's base64 can look like a key)", () => {
  const body = { text: "AIzaSyD-fake-looking-key0000000000", media: [ref] };
  const out = redactDeep(body);
  expect(out.media).toEqual([ref]);
  expect(out.text).not.toBe(body.text);
});

test("a task's transcript keeps the pictures of your words and of its reports", () => {
  const ev = (seq: number, kind: string, body: object) => ({ seq, ts: "", persona: "p", stream: "task:t", origin: "user", kind, body }) as any;
  const blocks = blocksOf(
    "codex",
    [
      ev(1, "task_open", { taskId: "t", title: "t", project: "", place: { kind: "none" }, harness: "codex", brief: "draw", media: [ref] }),
      ev(2, "task_event", { taskId: "t", role: "user", from: "user", text: "", media: [ref] }),
      ev(3, "report", { taskId: "t", state: "progress", summary: "a draft", questions: [], evidence: [], media: [ref] }),
      ev(4, "report", { taskId: "t", state: "done", summary: "done", questions: [], evidence: [] }),
    ],
    false,
  );
  expect(blocks.map((b) => [b.k, "media" in b ? b.media?.length : 0])).toEqual([
    ["brief", 1],
    ["you", 1],
    ["report", 1],
  ]);
});
