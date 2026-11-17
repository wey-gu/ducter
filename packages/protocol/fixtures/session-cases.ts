// D320: the cases behind fixtures/session.json, the window rules both ports must answer alike
// (packages/protocol/src/session.ts and apps/desktop/internal/views/session.go): over a 3,000-event
// review loop's index, which page to ask for next and what to keep, for a set of held spans and a
// view. `bun packages/protocol/fixtures/session-cases.ts` rewrites the JSON (review the diff).
// Infinity is written as null.
import { writeFileSync } from "node:fs";
import { longTask } from "./longtask.ts";
import { indexOf, keepFor, nextAsk, type Span, type View } from "../src/session.ts";

const evs = longTask(3000);
export const index = indexOf(evs);
const S = evs[0]!.seq, E = evs.at(-1)!.seq;
const turn = (i: number) => index.turns[i]!;
const T = index.turns.length;

export const cases: { name: string; spans: Span[]; view: View }[] = [
  { name: "nothing held yet, at the end", spans: [], view: { first: T - 3, last: T - 1, dir: 0 } },
  { name: "the newest window held, at the end", spans: [{ from: E - 199, to: Infinity }], view: { first: T - 3, last: T - 1, dir: 0 } },
  { name: "the newest window held, scrolled up into a turn it holds part of", spans: [{ from: E - 199, to: Infinity }], view: { first: T - 10, last: T - 8, dir: -1 } },
  { name: "far up, held around the view and the tail; moving up", spans: [{ from: turn(40).seq, to: turn(60).seq - 1 }, { from: E - 199, to: Infinity }], view: { first: 45, last: 47, dir: -1 } },
  { name: "far up, moving down toward the end of what is held", spans: [{ from: turn(40).seq, to: turn(60).seq - 1 }, { from: E - 199, to: Infinity }], view: { first: 56, last: 58, dir: 1 } },
  { name: "a jump to a turn with nothing near it", spans: [{ from: E - 199, to: Infinity }], view: { first: 20, last: 20, dir: 0 } },
  { name: "at the head", spans: [{ from: S, to: turn(30).seq - 1 }, { from: E - 199, to: Infinity }], view: { first: 0, last: 2, dir: -1 } },
  { name: "everything held", spans: [{ from: 0, to: Infinity }], view: { first: 50, last: 52, dir: -1 } },
];

const held = (spans: Span[]) => evs.filter((e) => spans.some((s) => s.from <= e.seq && e.seq <= s.to)).map((e) => ({ seq: e.seq }));
const inf = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (x === Infinity ? null : x)));

if (import.meta.main) {
  const out = {
    index,
    cases: cases.map((c) => ({ ...c, ask: nextAsk(index, c.spans, held(c.spans), c.view) ?? null, keep: keepFor(index, held(c.spans), c.view) ?? null })),
  };
  writeFileSync(new URL("./session.json", import.meta.url), JSON.stringify(inf(out)) + "\n");
  console.log(`wrote ${out.cases.length} cases over ${T} turns`);
}
