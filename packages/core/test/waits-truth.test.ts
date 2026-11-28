// D628: one truth for a PR. A hand-off about a PR settles when that PR merges or closes; a
// task whose work was that PR and whose only remaining waits are timers is done, its waiters are
// cancelled, and the header's waiting count drops. A real wait (a check on a release) survives.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore } from "../src/core.ts";
import { WAIT_REPEAT_N } from "../src/work.ts";
import { FakeClock } from "../src/clock.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir: string, clock: FakeClock) {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, clock, keeps: { endAsk: async () => ({}) }, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "laptop" } });
  core.setPartner({ onTrigger: () => {} });
  core.setRunner({
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("not here");
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return core;
}

const HELPER = "PR Babysitter";
const seedTask = (core: ReturnType<typeof boot>, taskId: string, title: string) =>
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief: "x" } });

function helper(core: ReturnType<typeof boot>) {
  const made = core.helpers.make({ name: HELPER, about: "PRs", brief: "Own each PR to the end." });
  if (!made.ok) throw new Error(made.error);
  core.keeps.sync();
  return made.helper;
}

const pr = (core: ReturnType<typeof boot>, taskId: string, ref: string, state: "open" | "merged" | "closed") =>
  core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr: ref, news: [], seen: { since: "2026-11-27T01:00:00.000Z", state, head: "abcdef1234" } } });

const armed = (core: ReturnType<typeof boot>, taskId: string, waiterId: string, reason: string, extra: Partial<Bodies["waiter"]> = {}) =>
  core.log.append({ stream: "channel", origin: "task", kind: "waiter", body: { waiterId, reason, taskId, state: "armed", at: "2026-11-27T04:30:00.000Z", ...extra } });

const settle = async () => {
  for (let i = 0; i < 20; i++) await Bun.sleep(2);
};

describe("D628: a PR's hand-off ends with the PR", () => {
  test("hel's case: merged PR + given hand-off + armed timer → settled, waiter cancelled, task done, count drops", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-27T03:44:00Z"));
    const core = boot(t.dir, clock);
    stops.push(() => core.stop());
    const h = helper(core);
    seedTask(core, "t-dev", "用 agy 处理 Mem #11408");
    core.log.append({ stream: "task:t-dev", origin: "partner", kind: "checkpoint", body: { taskId: "t-dev", owns: ["nowledge-co/mem#11408"] } });
    pr(core, "t-dev", "nowledge-co/mem#11408", "open");
    core.log.append({ stream: "task:t-dev", origin: "system", kind: "task_state", body: { taskId: "t-dev", attention: "blocked", residency: "hot" } });
    armed(core, "t-dev", "w-1", "复查 PR Babysitter 对 #11408 的接手回执");
    const gave = core.handoffs.giveLocal({ helper: h, text: "请接手 https://github.com/nowledge-co/mem/pull/11408", fromTask: "t-dev", fromName: "Ducter" });
    expect(gave.handoff.state).toBe("given");
    expect(core.tasks.onHand().counts.waiting).toBe(1);

    pr(core, "t-dev", "nowledge-co/mem#11408", "merged");
    await settle();

    expect(core.handoffs.get(gave.handoff.handoffId)).toMatchObject({ state: "settled", settledBy: "merged" });
    expect(core.tasks.get("t-dev")?.attention).toBe("done");
    expect(core.tasks.get("t-dev")?.handoff).toMatchObject({ state: "settled", settledBy: "merged" });
    const wa = core.log.read({ stream: "channel", kinds: ["waiter"], limit: 100 }).map((e) => e.body as Bodies["waiter"]).filter((w) => w.waiterId === "w-1").at(-1);
    expect(wa?.state).toBe("cancelled");
    expect(core.tasks.onHand().counts.waiting).toBe(0);
    // Its transcript says why, in the task's own language, once.
    const line = core.log.read({ stream: "task:t-dev", kinds: ["task_event"], limit: 100 }).map((e) => e.body as Bodies["task_event"]).find((b) => b.from === "ducter");
    expect(line?.text).toContain("已合并，这件结束");
  });

  test("a real wait survives: a check on a release keeps the task waiting while the hand-off settles", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-27T03:44:00Z"));
    const core = boot(t.dir, clock);
    stops.push(() => core.stop());
    const h = helper(core);
    seedTask(core, "t-check", "等 Ducter 发版后补上显示");
    core.log.append({ stream: "task:t-check", origin: "partner", kind: "checkpoint", body: { taskId: "t-check", owns: ["nowledge-co/ducter#1"] } });
    pr(core, "t-check", "nowledge-co/ducter#1", "open");
    core.log.append({ stream: "task:t-check", origin: "system", kind: "task_state", body: { taskId: "t-check", attention: "blocked", residency: "hot" } });
    armed(core, "t-check", "w-real", "等 Ducter 发版", { check: { argv: ["gh", "release", "view", "v0.2.0"], succeedWhen: { exitCode: 0 } }, kind: "check" });
    const gave = core.handoffs.giveLocal({ helper: h, text: "请接手 https://github.com/nowledge-co/ducter/pull/1", fromTask: "t-check", fromName: "Ducter" });
    pr(core, "t-check", "nowledge-co/ducter#1", "merged");
    await settle();

    expect(core.handoffs.get(gave.handoff.handoffId)).toMatchObject({ state: "settled", settledBy: "merged" });
    expect(core.tasks.get("t-check")?.attention).toBe("blocked");
    expect(core.waiters.views().find((w) => w.waiterId === "w-real")?.state).toBe("armed");
    expect(core.tasks.onHand().counts.waiting).toBe(1);
  });

  test("a hand-off given after the PR already merged settles at once, and is never said to the sender", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-27T03:44:00Z"));
    const core = boot(t.dir, clock);
    stops.push(() => core.stop());
    const h = helper(core);
    seedTask(core, "t-late", "已经合并的任务");
    core.log.append({ stream: "task:t-late", origin: "partner", kind: "checkpoint", body: { taskId: "t-late", owns: ["nowledge-co/mem#11441"] } });
    pr(core, "t-late", "nowledge-co/mem#11441", "merged");
    await settle();
    const gave = core.handoffs.giveLocal({ helper: h, text: "请接手 https://github.com/nowledge-co/mem/pull/11441", fromTask: "t-late", fromName: "Ducter" });
    expect(gave.handoff).toMatchObject({ state: "settled", settledBy: "merged" });
    expect(gave.handoff.why).toBeUndefined();
  });
});

describe("D628: a wait that keeps coming back backs off", () => {
  test("the seventh same-reason timer is hours out, and the person is told once", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-27T03:44:00Z"));
    const core = boot(t.dir, clock);
    stops.push(() => core.stop());
    seedTask(core, "t-slow", "等 Ducter 新版本");
    const call = async () => {
      const r = (await core.mcp.call({ role: "task", taskId: "t-slow" }, "wait_for", { reason: "等 Ducter 发新版本", afterMinutes: 30 })) as { ok: boolean; at?: string; backedOff?: string; repeats?: number };
      return r;
    };
    for (let i = 1; i <= WAIT_REPEAT_N; i++) {
      const r = await call();
      expect(r.ok).toBe(true);
      expect(r.backedOff).toBeUndefined();
      clock.advance(30 * 60_000);
    }
    const backed = await call();
    expect(backed.ok).toBe(true);
    expect(backed.repeats).toBe(WAIT_REPEAT_N + 1);
    expect((Date.parse(backed.at!) - clock.now()) / 60_000).toBeGreaterThanOrEqual(60);
    // D667: the person is told once, as a fact on the task's card, never as its own message.
    const notes = core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 200 }).filter((e) => !!(e.body as Bodies["ai_msg"]).waitSlow);
    expect(notes).toHaveLength(0);
    const facts = core.log.read({ kinds: ["subject_info"], limit: 200 });
    expect(facts).toHaveLength(1);
  });
});
