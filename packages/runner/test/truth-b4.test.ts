// D645 (research/245 §3.7, B4): `working` follows a turn. A task told to wait for the person
// is needs_you with the open question until the answer reaches it; a turn that ends with nothing
// running is stopped (blocked, D467's 停下了), never 在做. Every turn end is checked, not once at
// start as D633's repair was.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import { createOarHarnessPort, createRunner, NUDGE, registerTaskTools } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-truth-b4-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ID = "tsk00001";
const attention = () => core.tasks.get(ID)?.attention;
const waitsFor = () => core.tasks.get(ID)?.waitsFor;
const turnsEnded = () => core.events.filter((e) => e.kind === "task_event" && ((e.body as Bodies["task_event"]).raw as { kind?: string } | undefined)?.kind === "turn_ended").length;
const report = (state: Bodies["report"]["state"], summary: string) => core.call("report_to_main", { state, summary, ...(state === "needs_input" ? { questions: [{ id: "q", text: "Which Space?", blocking: true }] } : {}) }, ID);

/** A task whose first turn does `first`, then a later input does `answer`; the nudge reports progress. */
async function taskThat(first: (t: { tool: (name: string, args: string, fn: () => Promise<unknown>) => Promise<void>; say: (s: string) => void; input: string }) => Promise<void>, answer: (t: { say: (s: string) => void }) => Promise<void>) {
  const port = createOarHarnessPort({
    loadRuntime: async () =>
      scriptedRuntime({
        id: "claude",
        turn: async (t) => {
          if (t.input === NUDGE) return t.tool("mcp__ducter__report_to_main", "{}", () => report("progress", "I answered the user in the task.")).then(() => t.say("I reported it to Ducter."));
          return (t as unknown as { first?: boolean }).first === undefined && turnsEnded() === 0 ? first(t as never) : answer(t as never);
        },
      }),
  });
  const runner = createRunner(core, { harness: port, newId: () => ID });
  const card = await runner.openTask({ persona: "p1", title: "核对数据迁移设计", brief: "核对数据迁移设计，补齐备份与恢复。" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => turnsEnded() >= 1, "first turn");
  await Bun.sleep(40);
  return { runner };
}

describe("D645 B4: 在做 only while a turn really runs", () => {
  test("a task told to wait for the person is needs_you with the open question, until the answer reaches it", async () => {
    const { runner } = await taskThat(
      async (t) => {
        // B3's card path: the closed to-do asks the person, and the task is told to wait for them.
        core.log.append({ persona: "p1", stream: `task:${ID}`, origin: "system", kind: "decision", body: { decisionId: "d_closed", taskId: ID, question: "GitHub 上已经关掉了。这个任务停下吗？", goLabel: "停下", holdLabel: "接着做", defaultOption: "go", reversible: true } });
        await t.tool("mcp__ducter__report_to_main", "{}", () => report("progress", "我已经停下，等对方的回答。"));
        t.say("I've paused as asked and am waiting for the user's answer.");
      },
      async (t) => {
        await Bun.sleep(50);
        t.say("好，接着做。");
      },
    );
    // During the turn it was working; at its end the person owed it an answer.
    expect(attention()).toBe("needs_you");
    expect(waitsFor()).toContain("停下吗");
    expect(core.states(ID)).toContain("working/hot");

    // The person answers on the card: the decision is resolved, and the answer is sent to the task.
    core.log.append({ persona: "p1", stream: `task:${ID}`, origin: "system", kind: "decision_resolved", body: { decisionId: "d_closed", option: "hold", by: "user" } });
    await runner.send(ID, "接着做，把没做完的补上。", undefined, "user", "c1");
    // Working only during the answer's turn.
    await waitFor(() => attention() === "working", "answer turn working");
    expect(waitsFor()).toBeUndefined();
    await waitFor(() => turnsEnded() >= 2, "answer turn end");
    await Bun.sleep(40);
    // It ended its turn with no report and no wait: stopped, never 在做 (D467's 停下了).
    expect(attention()).toBe("blocked");
    expect(waitsFor()).toBeUndefined();
    await runner.dispose();
  });

  test("a turn that ends with no report and no wait is stopped, not working and not needs_you", async () => {
    const { runner } = await taskThat(
      async (t) => t.say("I looked at it."),
      async (t) => t.say("Still looking."),
    );
    // One nudge ran after the first miss; after that it is stopped, not a question.
    await waitFor(() => turnsEnded() >= 2, "nudge turn");
    await Bun.sleep(80);
    expect(attention()).toBe("blocked");
    expect(waitsFor()).toBeUndefined();
    expect(core.states(ID).filter((s) => s.startsWith("working/")).length).toBeGreaterThan(1);
    await runner.dispose();
  });
});
