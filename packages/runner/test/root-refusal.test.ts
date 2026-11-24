// D549: an agent that ends at once as it starts (Claude Code as root: research/225) is a start that
// failed, with the agent's own words on the card, never a TypeError on the gone session (hel,
// 2026-11-24: "delivery failed: TypeError: undefined is not an object (evaluating 't.session.send')")
// and never a task left 在做 with nothing to show (the same run in a container, where the send got
// in before the exit). And a root home doesn't start Claude Code at all.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession } from "@ducter/protocol/src/internal.ts";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import { rootRefusal } from "../src/oar.ts";
import { startProblem } from "../src/places.ts";
import { createFakeCore, type FakeCore } from "./fake-core.ts";

const SAID = "--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons";
// What OAR 0.124 says for it (VERIFIED in a container as root, research/225): the exit with stderr's tail.
const EXIT = `harness exited (code 1): stderr (tail):\n${SAID}`;

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-root-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A session whose process ends at once with `exit`: before the first send ("before"), or right after it ("after"). */
function exitingPort(when: "before" | "after"): HarnessPort & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    async start(): Promise<HarnessSession> {
      let wake: (() => void) | undefined;
      let go = when === "before";
      return {
        id: "native-1",
        canSteer: false,
        busy: () => false,
        async send(text) {
          if (go) throw new Error("prompt rejected: runtime exited");
          sent.push(text);
          go = true;
          wake?.();
        },
        async interrupt() {},
        async close() {},
        async *events(): AsyncIterable<HarnessEvent> {
          if (!go) await new Promise<void>((r) => (wake = r));
          yield { role: "system", text: EXIT, raw: { kind: "exited" } } as HarnessEvent;
        },
      };
    },
    available: async () => [],
  };
}

const lastState = () => core.events.filter((e) => e.kind === "task_state").map((e) => e.body as Bodies["task_state"]).at(-1)!;
const texts = () => core.events.filter((e) => e.kind === "task_event").map((e) => String((e.body as Bodies["task_event"]).text ?? ""));

for (const when of ["before", "after"] as const) {
  test(`its process ends ${when} the first send: the card says the agent's own reason, never a TypeError`, async () => {
    const runner = createRunner(core, { harness: exitingPort(when), newId: () => "tsk00001" });
    const card = await runner.openTask({ persona: "p1", title: "Update the Mem plugin", brief: "the brief", place: { kind: "none" }, harness: "claude-code" });
    await runner.whenStarted(card.taskId).catch(() => {});
    for (let i = 0; i < 50 && lastState().attention !== "failed"; i++) await Bun.sleep(10);
    const s = lastState();
    expect(s.attention).toBe("failed");
    expect(s.cant).toMatchObject({ why: "refuses_root", harness: "claude-code" });
    expect(s.cant?.detail).toBe(SAID);
    expect(texts().join("\n")).not.toContain("TypeError");
    expect(texts().join("\n")).not.toContain("t.session");
  });
}

test("an early exit for another reason is the agent's words too, as its own why", async () => {
  expect(startProblem("Claude Code exited as it started: Error: EACCES: permission denied, open '/x'").why).toBe("agent");
  expect(startProblem(`Claude Code exited as it started: ${SAID}`).why).toBe("refuses_root");
  expect(startProblem("Claude Code refuses to run as root, and Ducter runs as root on this computer: x").why).toBe("refuses_root");
});

test("on a root home Claude Code isn't started at all: its refusal at once, before any process", async () => {
  let loaded = 0;
  const port = createOarHarnessPort({ uid: () => 0, loadRuntime: async () => (loaded++, scriptedRuntime({ id: "claude", turn: async () => {} }) as never) });
  const runner = createRunner(core, { harness: port, newId: () => "tsk00002" });
  const card = await runner.openTask({ persona: "p1", title: "Update the Mem plugin", brief: "b", place: { kind: "none" }, harness: "claude-code" });
  await runner.whenStarted(card.taskId).catch(() => {});
  const s = lastState();
  expect(s).toMatchObject({ attention: "failed", cant: { why: "refuses_root", harness: "claude-code", detail: SAID } });
  expect(loaded).toBe(0);
  // Codex, pi, DeepSeek Harness and Antigravity run as root (harness-facts root, research/225).
  for (const h of ["codex", "pi", "deepseek-harness", "antigravity"]) expect(rootRefusal(h, 0)).toBeUndefined();
  expect(rootRefusal("claude-code", 1000)).toBeUndefined();
  expect(rootRefusal("claude-code", 0)).toContain("refuses to run as root");
});
