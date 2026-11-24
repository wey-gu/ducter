// D549: an agent that refuses root where Ducter runs as root is never picked for a task there, and
// the person's own pick of it says why in one line.
import { expect, test } from "bun:test";
import type { DeviceHarness } from "@ducter/protocol";
import { blockOf, pinProblem } from "../src/candidates.ts";

const settings = { brain: { harness: "codex" } } as Parameters<typeof blockOf>[1];
const claude: DeviceHarness = { harness: "claude-code", installed: true, loggedIn: true, canBePartner: false, trouble: { kind: "root" } };

test("blocked as refuses_root, before signed in or out is even asked", () => {
  expect(blockOf(claude, settings)).toBe("refuses_root");
  expect(blockOf({ ...claude, loggedIn: false }, settings)).toBe("refuses_root");
  expect(blockOf({ ...claude, trouble: undefined, canBePartner: true }, settings)).toBeUndefined();
  expect(pinProblem("claude-code", "refuses_root")).toContain("Claude Code can't take this task: it refuses to run as root");
});
