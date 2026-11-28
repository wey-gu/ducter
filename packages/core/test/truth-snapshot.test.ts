// D661 (research/245 §3.3): the snapshot carries the one state. A home's OnHand has `truth`,
// its counts are the truth's, each card carries its derived state, and a gist from the cheap model
// lands on the card (one line per report).
import { afterEach, describe, expect, test } from "bun:test";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(extra: Partial<Parameters<typeof startCore>[0]> = {}): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, ...extra });
  stops.push(t.cleanup, () => core.stop());
  return core;
}

describe("D661: the snapshot ships the one truth", () => {
  test("the counts are the truth's and every card carries its state", () => {
    const core = boot();
    const log = core.log;
    log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "核对数据迁移设计", brief: "", place: { kind: "none" }, harness: "codex" } });
    log.append({ stream: "task:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "needs_you", residency: "warm", waitsFor: "这个任务停下吗？" } });
    log.append({ stream: "task:t2", origin: "partner", kind: "task_open", body: { taskId: "t2", title: "Fix the login test", brief: "", place: { kind: "none" }, harness: "codex" } });
    log.append({ stream: "task:t2", origin: "system", kind: "task_state", body: { taskId: "t2", attention: "working", residency: "hot" } });
    const oh = core.tasks.onHand();
    expect(oh.truth).toBeTruthy();
    expect(oh.counts).toEqual({ needs_you: 1, working: 1, waiting: 0, done_today: 0 });
    expect(oh.truth!.needsYou.map((x) => x.taskId)).toEqual(["t1"]);
    expect(oh.truth!.needsYou[0]!.needs).toBe("stopped");
    expect(oh.truth!.needsYou[0]!.waitsFor).toContain("没说在等什么");
    expect(oh.tasks.find((c) => c.taskId === "t1")?.truth).toMatchObject({ state: "needs_you", needs: "stopped" });
    expect(oh.tasks.find((c) => c.taskId === "t2")?.truth?.state).toBe("working");
  });

  test("a partner's word that it resumed is not a delivery: the task stays needs_you", () => {
    const core = boot();
    const log = core.log;
    log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "核对数据迁移设计", brief: "", place: { kind: "none" }, harness: "codex" } });
    log.append({ stream: "task:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "needs_you", residency: "warm", waitsFor: "这个任务停下吗？" } });
    // The false claim: a partner's own line on the task's stream, with no answer delivered.
    log.append({ stream: "task:t1", origin: "partner", kind: "task_event", body: { taskId: "t1", role: "system", from: "partner", text: "任务已经恢复。" } });
    const oh = core.tasks.onHand();
    expect(oh.truth!.needsYou.map((x) => x.taskId)).toEqual(["t1"]);
    expect(oh.tasks[0]!.truth?.state).toBe("needs_you");
    expect(oh.tasks[0]!.truth?.needs).toBe("stopped");
    expect(oh.tasks[0]!.truth?.waitsFor).toContain("没说在等什么");
  });

  test("a report's one line lands on the card, and the newest report's line wins", async () => {
    let n = 0;
    const core = boot({ gists: { ask: async () => ({ line: `第 ${++n} 行` }) } });
    const log = core.log;
    log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "修一下登录页", brief: "", place: { kind: "none" }, harness: "codex" } });
    log.append({ stream: "task:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "working", residency: "hot" } });
    log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "progress", summary: "Fixed the flaky login test.", questions: [], evidence: [] } });
    // The gist is asked off the stream; give it a tick.
    for (let i = 0; i < 50 && !core.tasks.onHand().tasks.find((c) => c.taskId === "t1")?.gist; i++) await Bun.sleep(20);
    const oh = core.tasks.onHand();
    expect(oh.tasks.find((c) => c.taskId === "t1")?.gist?.text).toBe("第 1 行");
  });
});
