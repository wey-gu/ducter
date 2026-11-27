// D621: a home received by `ducter move --receive` is not switched over, so it must not
// start as a second answering Ducter (two pollers on one chat app, two on one Bridge mailbox).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore } from "../src/core.ts";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ducter-received-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("a received home before the switch-over", () => {
  test("does not start a second answering Ducter", () => {
    writeFileSync(join(home, "move-receiving.json"), JSON.stringify({ v: 1, from: { computer: "old" } }));
    expect(() => startCore({ dataDir: home })).toThrow(/received from another computer/);
  });
});
