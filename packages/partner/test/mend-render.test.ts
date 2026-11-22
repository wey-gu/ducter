// D473: what the partner reads when Ducter hands it a task it couldn't mend by itself.
import { expect, test } from "bun:test";
import type { Bodies, CantStart } from "../../protocol/src/index.ts";
import { renderMend } from "../src/render.ts";

const cant: CantStart = { why: "no_folder", computer: "Hetzner Server", what: "mem", path: "/root/dev/mem" };

test("a start Ducter couldn't mend: why, where, what it tried, what is left, and find another way before asking", () => {
  const m: Bodies["mend"] = { taskId: "smx2jjb3", cls: "start", rung: "rethink", attempt: 2, tried: [{ how: "reopen", ok: true, at: "" }], why: "no_folder", state: "ok" };
  const s = renderMend(m, "在 hel 用 Gemini 审阅 Mem 长文案", { ...cant, elsewhere: { device: "local", name: "MacBook" } });
  expect(s).toContain("couldn't start on Hetzner Server: that folder isn't there (/root/dev/mem)");
  expect(s).toContain("Ducter already started it again, fresh");
  expect(s).toContain("Still possible: MacBook has a copy");
  expect(s).toContain('task_open with replaces "smx2jjb3"');
  expect(s).toContain("its repository as place.remote");
  expect(s).toContain("The user hasn't been told");
  expect(s).not.toContain("Ask the user once now");
});

test("the second time it comes back, the partner asks once, with the one real fix", () => {
  const s = renderMend({ taskId: "t", cls: "start", rung: "rethink", attempt: 3, tried: [], why: "agent", state: "ok", again: true }, "Fix the README", { why: "agent", computer: "haswell", what: "Codex" });
  expect(s).toContain("its agent couldn't start there");
  expect(s).toContain("Ask the user once now");
});

test("a stall: carry it on, never redo anything outward", () => {
  const s = renderMend({ taskId: "t", cls: "stall", rung: "rethink", attempt: 1, tried: [], why: "stall", state: "ok" }, "Fix the README");
  expect(s).toContain("stopped without a report");
  expect(s).toContain("Never ask it to redo anything it already sent");
});

// D477: a hand-over carries facts for the partner to judge, never a verdict code made.
test("a stall's facts and the person's recorded word go to the partner as facts", () => {
  const s = renderMend({ taskId: "lint01", cls: "stall", rung: "rethink", attempt: 1, tried: [], why: "stall", state: "ok" }, "Fix the lint warnings in foo", undefined, { agent: "Antigravity", computer: "MacBook", ranMs: 9_000, toolCalls: 0, lastWords: "You have exhausted your capacity on this model.", where: "only on hel" });
  expect(s).toContain("its agent: Antigravity on MacBook; it ran 9 s; 0 tool calls; its last words:");
  expect(s).toContain("The user said this work runs only on hel");
  expect(s).toContain("Judge from the facts");
  expect(s).toContain('replaces "lint01"');
});
