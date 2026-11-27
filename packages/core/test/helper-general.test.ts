// D634: a helper is a standing address the person's other agents hand one kind of work to, of
// any kind. This is the non-PR shape: another agent hands an issue-triage helper one issue, and the
// same given → taken → done, Keep item and arrival-round paths run as for the PR helper in
// handoff-d609.test.ts. Nothing here needs a PR.
import { afterEach, describe, expect, test } from "bun:test";
import type { TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore } from "../src/core.ts";
import { FakeClock } from "../src/clock.ts";
import { tempDir } from "./helpers.ts";
import { ISSUE_AGENT, ISSUE_HEAD, ISSUE_REF, ISSUE_TASK, ISSUE_TASK_TITLE, ISSUE_WORK, seedIssueHelper } from "./fixtures/helper-issues.ts";

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

const openTask = (core: ReturnType<typeof boot>, taskId: string, title: string) =>
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief: "x" } });

const state = (core: ReturnType<typeof boot>, taskId: string, attention: TaskCard["attention"]) =>
  core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_state", body: { taskId, attention, residency: "hot" } } as never);

describe("a helper for one kind of work that is not PRs", () => {
  test("an issue handed over by another agent: given, taken, done; its Keep's item and the arrival round line", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const clock = new FakeClock(Date.parse("2026-11-27T10:00:00Z"));
    const core = boot(t.dir, clock);
    stops.push(() => core.stop());
    // The conversation is in Chinese, so the words a view reads are too.
    core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "帮我盯一下新 issue。" } });

    const { helper, keep, handoff, body } = seedIssueHelper(core);
    expect(helper.name).toBe("Issue Triage");
    expect(handoff).toMatchObject({ state: "given", item: { kind: "issue", ref: ISSUE_REF }, to: { helper: helper.id, name: "Issue Triage" } });
    expect(handoff.from).toMatchObject({ agent: ISSUE_AGENT, name: ISSUE_AGENT });

    // Given: a record on its page, nothing it holds yet, and the arrival round says the clean head and
    // the issue (D616's line, with no PR anywhere in it).
    const given = core.keeps.page(keep.keepId)!;
    expect(given.items).toEqual([]);
    expect(given.handoffs).toMatchObject([{ state: "given", item: { kind: "issue", ref: ISSUE_REF }, sender: ISSUE_AGENT }]);
    const arrival = given.rounds.find((r) => r.woke === "arrival")!;
    expect(arrival).toMatchObject({ did: `${ISSUE_HEAD.replace(/[：:]$/, "")}交来 ${ISSUE_REF}`, report: `${ISSUE_HEAD}\n${ISSUE_WORK}` });
    expect(arrival.did).not.toContain("PR");

    // Taken: one of its tasks claims the arrival; its Keep now holds that task and no PR facts.
    openTask(core, ISSUE_TASK, ISSUE_TASK_TITLE);
    core.log.append({
      stream: "channel",
      origin: "partner",
      kind: "bridge_msg",
      body: { direction: "out", messageId: "", state: "sent", helper: helper.id, inReplyTo: body.messageId, taskId: ISSUE_TASK, text: "Taken", to: ISSUE_AGENT },
    });
    expect(core.handoffs.get(handoff.handoffId)).toMatchObject({ state: "taken", taskId: ISSUE_TASK });
    const taken = core.keeps.page(keep.keepId)!;
    expect(taken.items).toEqual([{ taskId: ISSUE_TASK, title: ISSUE_TASK_TITLE, at: "work" }]);
    expect(taken.items[0]).not.toHaveProperty("pr");
    expect(taken.handoffs).toMatchObject([{ state: "taken", taskId: ISSUE_TASK }]);

    // Done: the task finished and the record ended; a finished issue task is no longer held (only a
    // PR that is still open keeps a finished task, and there is none here).
    state(core, ISSUE_TASK, "done");
    const done = await core.handoffs.finish(handoff.handoffId, "done", { outcome: "分诊完，标签补好，缺的步骤已经问过报告人。", say: false });
    expect(done).toMatchObject({ state: "done", item: { kind: "issue", ref: ISSUE_REF }, outcome: "分诊完，标签补好，缺的步骤已经问过报告人。" });
    const after = core.keeps.page(keep.keepId)!;
    expect(after.items).toEqual([]);
    expect(after.handoffs).toMatchObject([{ state: "done", item: { kind: "issue", ref: ISSUE_REF } }]);
    expect(after.rounds.find((r) => r.woke === "arrival")!.did).toContain(ISSUE_REF);
  });
});
