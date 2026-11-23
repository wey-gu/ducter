// D496: what a command sent out, from its grammar. The Go port (apps/desktop/internal/store/outward_test.go)
// passes the same cases (fixtures/outward.json).
import { expect, test } from "bun:test";
import fixture from "../fixtures/outward.json";
import { outwardOf } from "../src/outward.ts";

for (const c of fixture.cases as { cmd: string; output?: string; acts: unknown[] }[]) {
  test(`outward: ${c.cmd.split("\n")[0]!.slice(0, 70)}`, () => {
    expect(outwardOf(c.cmd, c.output ?? "")).toEqual(c.acts as never);
  });
}
