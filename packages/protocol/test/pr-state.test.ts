// D508: where a task's PR stands. The Go port (apps/desktop/internal/store/prstate_test.go) passes
// the same cases (fixtures/pr-state.json).
import { expect, test } from "bun:test";
import fixture from "../fixtures/pr-state.json";
import { prOf, prSaid, prStands, prUrl, type TaskPR } from "../src/pr-state.ts";

for (const c of fixture.cases) {
  test(`pr-state: ${c._}`, () => {
    const got = prSaid(c.pr as Pick<TaskPR, "state" | "standing">);
    expect(got).toEqual(c.want as never);
    expect(prStands(got.phase)).toBe(c.stands as never);
  });
}

test("the row speaks of an open PR before a newer closed one", () => {
  const prs: TaskPR[] = [
    { pr: "o/r#1", url: prUrl("o/r#1"), state: "open", at: "2026-11-24T08:00:00Z" },
    { pr: "o/r#2", url: prUrl("o/r#2"), state: "closed", at: "2026-11-24T09:00:00Z" },
  ];
  expect(prOf(prs)?.pr).toBe("o/r#1");
  expect(prOf([prs[1]!])?.pr).toBe("o/r#2");
  expect(prOf(undefined)).toBeUndefined();
  expect(prUrl("nowledge-co/mem#11070")).toBe("https://github.com/nowledge-co/mem/pull/11070");
});
