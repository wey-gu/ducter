// D443: a handed-over or sorted to-do shows its size once: the pill is left off when the model's
// own line already says it (说得清楚，改动小 under a 小改动 pill read twice). The Mac's
// protocol/pile_test.go passes the same cases.
import { expect, test } from "bun:test";
import { sizeSaid } from "../src/task-sources.ts";
import fx from "../fixtures/size-said.json";

test("the line that says its size leaves the pill off", () => {
  for (const c of fx.cases) expect([c.why, c.size, sizeSaid(c.why, c.size as "small")]).toEqual([c.why, c.size, c.said]);
});
