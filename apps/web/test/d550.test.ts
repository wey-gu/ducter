// D550: a Keep's page folds every run of two or more quiet rounds, anywhere in its list, into one
// row (又看过 {n} 次，都没有变化，{from} 到 {to}) that opens in place. Quiet is the round's structured
// outcome only (protocol quietRound): woke by its rhythm, done, silent, nothing changed, not a
// change to the Keep. The newest round and a lone quiet round stand as they are. The Mac's
// foldKeepRounds (apps/desktop/internal/views/keepfold.go) says the same; the shots are in
// .shots/keep-quiet.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { foldRounds, quietRound, type KeepRound } from "@ducter/protocol";

/** Rounds newest first, every 45 minutes from now: q quiet, s spoke, a asked, c a PR changed, f failed, e a change to the Keep. */
function rounds(shape: string): KeepRound[] {
  const now = Date.now();
  return [...shape].map((ch, i) => {
    const r: KeepRound = { at: new Date(now - i * 45 * 60_000).toISOString(), woke: "time", spoke: "silent", state: "done", taskId: "t_loop" };
    if (ch === "s") r.spoke = "told";
    if (ch === "a") r.spoke = "asked";
    if (ch === "c") r.changed = true;
    if (ch === "f") r.state = "failed";
    if (ch === "e") Object.assign(r, { woke: "edit", edit: { by: "you", edits: [{ field: "every", from: "45", to: "60" }] } });
    return r;
  });
}
const drawn = (shape: string) =>
  foldRounds(rounds(shape))
    .map((x) => ("fold" in x ? `F${x.fold.length}` : "r"))
    .join("");

describe("quiet rounds fold anywhere in a Keep's rounds (D550)", () => {
  test("three quiet rounds fold to one row, its span from the oldest to the newest", () => {
    expect(drawn("sqqq")).toBe("rF3");
    const rs = rounds("sqqq");
    const f = foldRounds(rs)[1]!;
    expect("fold" in f && [f.from, f.to]).toEqual([rs[3]!.at, rs[1]!.at]);
  });
  test("a quiet run interrupted by a spoken round makes two folds around it", () => {
    expect(drawn("aqqqsqq")).toBe("rF3rF2");
  });
  test("the newest round is never folded", () => {
    expect(drawn("qqqq")).toBe("rF3");
    expect(drawn("eqqq")).toBe("rrF2");
  });
  test("a single quiet round is no fold", () => {
    expect(drawn("sqs")).toBe("rrr");
  });
  test("asked, changed, failed, running and a change to the Keep break a run; words never matter", () => {
    expect(drawn("sqqaqqcqqfqqeqq")).toBe("rF2rF2rF2rF2rF2");
    const r = rounds("q")[0]!;
    expect(quietRound(r)).toBe(true);
    expect(quietRound({ ...r, state: "running" })).toBe(false);
    expect(quietRound({ ...r, state: "skipped" })).toBe(false);
    expect(quietRound({ ...r, woke: "change" })).toBe(false);
    expect(quietRound({ ...r, woke: "arrival" })).toBe(false);
    expect(quietRound({ ...r, did: "复审了 2 个新提交" })).toBe(true);
  });
  test("the page draws the fold with the shared work head and opens it in place", () => {
    const src = readFileSync(join(import.meta.dir, "../src/keep.tsx"), "utf8");
    expect(src).toContain('t("loop.quiet", x.fold.length, from, to)');
    expect(src).toMatch(/shown \? x\.fold\.map\(round\)/);
    const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
    expect(css).toMatch(/\.kp-quiet \.work-head \{\s*min-height: 44px;/);
  });
});
