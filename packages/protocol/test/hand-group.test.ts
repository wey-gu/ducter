// D535: where a hand-over's group stands. The Go port (apps/desktop/internal/protocol/handgroup_test.go)
// passes the same cases (fixtures/hand-group.json).
import { expect, test } from "bun:test";
import fixture from "../fixtures/hand-group.json";
import { handGroupStand } from "../src/hand-group.ts";

for (const c of fixture.cases) {
  test(`hand-group: ${c._}`, () => {
    expect(handGroupStand(c.hand as never, c.onBoard, c.queued)).toBe(c.want as never);
  });
}
