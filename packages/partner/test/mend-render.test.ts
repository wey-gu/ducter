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
  expect(s).toContain('place {"kind":"repo","remote":"owner/name"}');
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

// D476 (hel, 2026-11-22): the hand-over carries the person's word on where, the agent's own words,
// what is set up on that computer, and two repositories a name could be.
test("D476: the bound, the agents there, the agent's own words, and a name that is two repositories", () => {
  const m: Bodies["mend"] = { taskId: "smx2jjb3", cls: "start", rung: "rethink", attempt: 1, tried: [], why: "no_folder", state: "ok" };
  const s = renderMend(m, "在 hel 用 Gemini 审改 Mem 长文案并开 PR", { ...cant, repos: ["nowledge-co/mem", "someone/mem"] }, { bound: "only on Hetzner Server; not on Wey's MacBook Pro", agents: "On Hetzner Server, Antigravity is installed and signed in." });
  expect(s).toContain("The user said this work runs only on Hetzner Server; not on Wey's MacBook Pro: Ducter refuses any other computer for it");
  expect(s).toContain("On Hetzner Server, Antigravity is installed and signed in.");
  expect(s).toContain('"mem" could be nowledge-co/mem or someone/mem: ask the user which, once');
  expect(s).toContain("on another computer the user allows");
  expect(s).toContain("Never tell the user an agent isn't set up on a computer unless [devices] says so");
  const a = renderMend({ taskId: "jj6efivf", cls: "start", rung: "rethink", attempt: 1, tried: [], why: "agent", state: "ok" }, "x", { why: "agent", computer: "Wey's MacBook Pro", what: "Antigravity", detail: "Please sign in to continue." });
  expect(a).toContain('Its agent said: "Please sign in to continue."');
  const st = renderMend({ taskId: "jj6efivf", cls: "stall", rung: "rethink", attempt: 1, tried: [], why: "stall", state: "ok" }, "x", undefined, { bound: "only on Hetzner Server" });
  expect(st).toContain("only on Hetzner Server");
});
