// D325: the cases behind fixtures/landmarks.json, the locator's list both ports must make alike
// (packages/protocol/src/landmarks.ts and apps/desktop/internal/views/landmarks.go): a review loop
// that crosses midnight (said turns, runs of wakes, rounds that report, a compaction, a switch, a
// note of Ducter's, a relayed Go), and every transcript case's index. `bun
// packages/protocol/fixtures/landmarks-cases.ts` rewrites the JSON (review the diff).
import { writeFileSync } from "node:fs";
import type { IndexTurn } from "../src/session.ts";
import { landmarkNear, landmarksIn, landmarksOf } from "../src/landmarks.ts";
import transcript from "./transcript.json";

type M = { k: string; w?: string; at?: string; s?: string };
const at = (h: number, m: number, day = 16) => new Date(Date.UTC(2026, 10, day, h, m)).toISOString();
let seq = 100;
const turn = (p: Record<string, unknown> | undefined, when: string, marks: M[] = []): IndexTurn => {
  const s = (seq += 10);
  return { seq: s, end: s + 9, n: 10, at: when, endAt: when, ...(p ? { p: { ...p, seq: s } as unknown as IndexTurn["p"] } : {}), h: 4, ...(marks.length ? { marks: marks.map((m, i) => ({ seq: s + 1 + i, ...m })) as IndexTurn["marks"] } : {}) };
};
const wake = (h: number, m: number, day = 16, marks: M[] = []) => turn({ k: "wake", text: "下一轮审查时间到" }, at(h, m, day), marks);

export const loop: IndexTurn[] = [
  turn({ k: "brief", text: "你能帮我准备好能 review 的 PR 吗？\n每 45 分钟看一次。", by: "partner" }, at(9, 47), [{ k: "report", w: "看了 3 个 PR，#212 可以合了", at: at(9, 58) }]),
  wake(10, 46),
  wake(11, 31),
  wake(12, 16, 16, [{ k: "report", w: "#215 的测试挂了，我留了评论", at: at(12, 30) }]),
  wake(13, 1),
  turn({ k: "told", say: "returned", text: "(the phone is back)" }, at(13, 40)),
  wake(22, 10),
  wake(23, 40, 16, [{ k: "compacted", at: at(23, 52) }]),
  wake(1, 5, 17),
  turn({ k: "you", text: "  \n先别合 #220，等我看完" }, at(8, 2, 17), [{ k: "switched", at: at(8, 3, 17) }, { k: "plan", at: at(8, 4, 17) }]),
  turn({ k: "go", label: "好", text: "(go)" }, at(8, 30, 17)),
  wake(9, 15, 17, [{ k: "interrupted", at: at(9, 20, 17) }]),
  turn(undefined, at(9, 21, 17), [{ k: "moved", at: at(9, 22, 17) }, { k: "retuned", at: at(9, 23, 17) }]),
  wake(10, 32, 17),
  turn({ k: "you", text: "" }, at(10, 40, 17), [{ k: "report" }]),
];

/** D526: a brief the person wrote, a result, an ask that waits for them, a failure (the rail's marks). */
export const marks: IndexTurn[] = [
  turn({ k: "brief", text: "看一下 #11112", by: "you" }, at(11, 2, 17), [{ k: "report", w: "#11112 修好了", at: at(11, 30, 17), s: "done" }]),
  wake(11, 45, 17, [{ k: "report", w: "要改公共接口，要我直接改吗？", at: at(11, 50, 17), s: "ask" }, { k: "report", w: "没跑通", at: at(11, 55, 17), s: "failed" }]),
  turn({ k: "partner", text: "他说可以改" }, at(12, 1, 17)),
];

const cases: { name: string; turns: IndexTurn[] }[] = [
  { name: "a review loop across midnight", turns: loop },
  { name: "D526: who handed it, results, asks and failures", turns: marks },
  { name: "empty", turns: [] },
  ...(transcript as unknown as { name: string; index: { turns: IndexTurn[] } }[]).map((c) => ({ name: `transcript: ${c.name}`, turns: c.index.turns })),
];

if (import.meta.main) {
  const out = cases.map((c) => {
    const want = landmarksOf(c.turns);
    const near = c.turns.map((_, i) => landmarkNear(want, i));
    const n = c.turns.length;
    const inView = n ? [[0, 0], [2, 4], [n - 1, n - 1], [3, 1]].map(([a, b]) => ({ first: a!, last: b!, got: landmarksIn(want, a!, b!) })) : [];
    return { ...c, want, near, inView };
  });
  writeFileSync(new URL("./landmarks.json", import.meta.url), JSON.stringify(out) + "\n");
  console.log(`wrote ${out.length} cases`);
}
