// D499: a task's ask about a step the person already allowed is answered for them. The partner judges
// that the ask is that step (here: as its without_asking tool calls core); code checks the ask is a
// task's plain question, open, not the floor, and that a kept go covers that step for that task. The
// answer goes to the task with the words, shows in Done for you, and its brief says it up front.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { forwardText, plainAsk } from "../src/decisions.ts";
import { createDid } from "../src/did.ts";
import { taskBrief } from "../../runner/src/brief.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot() {
  const t = tempDir();
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model")), available: async () => [] },
    openTask: async (): Promise<TaskCard> => Promise.reject(new Error("no")),
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  // hel's babysitter in shape: a repo task cloned from nowledge-co/mem, working on its PR.
  core.log.append({ stream: "task:b7gw6r2e", origin: "system", kind: "task_open", body: { taskId: "b7gw6r2e", title: "审改 Mem 长文案并开 PR", project: "", place: { kind: "repo", device: "local", repoPath: "/r/mem", clone: "nowledge-co/mem", branch: "ducter/copy" }, harness: "antigravity", brief: "弄好了直接给一个 pr" } });
  core.tasks.setState("b7gw6r2e", "working", "hot");
  return { core, told };
}
const ask = (core: ReturnType<typeof startCore>, text: string, extra: Partial<Bodies["report"]["questions"][number]> = {}) => {
  core.log.append({ stream: "task:b7gw6r2e", origin: "task", kind: "report", body: { taskId: "b7gw6r2e", state: "needs_input", summary: "只剩一项 E2E 偶发失败。", evidence: [], questions: [{ id: "q", text, blocking: true, default: "重跑 E2E", reversible: true, ...extra }] } });
  const ds = core.log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).map((e) => e.body as Bodies["decision"]);
  return ds.at(-1)!;
};
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
};

test("nothing kept: the ask stays on its card; kept for this task: Go for them, told to the task, in Done for you", async () => {
  const { core, told } = boot();
  const d = ask(core, "在 PR #10932 评论 `/test pull-mem-playwright-e2e` 重跑该偶发失败的 E2E 检查？");
  expect(core.askOf!(d.decisionId)).toMatchObject({ taskId: "b7gw6r2e", owner: "nowledge-co", open: true });
  const no = core.answerFor!(d.decisionId, "ci_rerun");
  expect(no.ok).toBe(false);
  expect(core.decisions.isPending(d.decisionId)).toBe(true);

  // 「你自己推进到能合并就好，这些都别问我」, kept by the partner for this task.
  core.standing.hear("tool:1", { kind: "grant", action: "ci_rerun", quote: "你自己推进到能合并就好，这些都别问我", taskId: "b7gw6r2e", taskTitle: "审改 Mem 长文案并开 PR" }, new Date().toISOString());
  expect(core.goesFor!("b7gw6r2e").map((s) => s.action)).toEqual(["ci_rerun"]);
  expect(core.answerFor!(d.decisionId, "pr_comment").ok).toBe(false); // another step: still the person's
  const ok = core.answerFor!(d.decisionId, "ci_rerun");
  expect(ok.ok).toBe(true);
  const r = core.decisions.resolution(d.decisionId)!;
  expect(r).toMatchObject({ option: "go", by: "said", action: "ci_rerun", said: "你自己推进到能合并就好，这些都别问我" });
  await until(() => told.length === 1);
  expect(told[0]!.text).toContain("Go: 重跑 E2E");
  expect(told[0]!.text).toContain("without asking");
  expect(core.answerFor!(d.decisionId, "ci_rerun").ok).toBe(false); // answered once

  const did = createDid({ log: core.log, tasks: core.tasks }).query({});
  const item = did.items.find((x) => x.taskId === "b7gw6r2e");
  expect(item).toMatchObject({ kind: "sent", sub: "post", go: { by: "said", words: "你自己推进到能合并就好，这些都别问我" } });

  // The brief of this task's next session says it up front.
  const brief = taskBrief({ partnerName: "Ducter", taskId: "b7gw6r2e", title: "t", brief: "b", place: { kind: "none" }, cwd: "/w", mcpServerName: "ducter", goes: core.goesFor!("b7gw6r2e").map((s) => ({ action: s.action, words: s.text })) });
  expect(brief).toContain("## What you may do without asking");
  expect(brief).toContain("rerunning its PR's checks");

  // A go kept for one task ends with it: another task, or this one once done, gets nothing from it.
  core.tasks.setState("b7gw6r2e", "done", "hot");
  expect(core.standing.list()).toEqual([]);
  expect(core.goesFor!("b7gw6r2e")).toEqual([]);
});

test("a standing go bounded by owners covers that owner's tasks only; the floor is never answered", () => {
  const { core } = boot();
  core.standing.hear("tool:2", { kind: "grant", action: "branch_push", quote: "acme 的分支直接推", orgs: ["acme"] }, new Date().toISOString());
  const d1 = ask(core, "把分支推上去更新 PR？");
  expect(core.answerFor!(d1.decisionId, "branch_push").ok).toBe(false); // nowledge-co isn't acme
  core.standing.hear("tool:3", { kind: "grant", action: "branch_push", quote: "nowledge-co 的分支直接推", orgs: ["nowledge-co"] }, new Date().toISOString());
  expect(core.answerFor!(d1.decisionId, "branch_push").ok).toBe(true);
  // pr_review is the review routine's (review_report), never a task's ask.
  const d2 = ask(core, "把评审发出去？");
  expect(core.answerFor!(d2.decisionId, "pr_review").ok).toBe(false);
  // The floor: a card of its own kind, a delete, something another AI flagged.
  expect(plainAsk({ ...d2, pay: { site: "x", amount: "1", currency: "USD", card: "c", handle: "h" } } as Bodies["decision"])).toBe(false);
  expect(plainAsk({ ...d2, question: "删除旧分支？", goLabel: "删除" })).toBe(false);
  expect(plainAsk({ ...d2, look: { by: "codex", left: ["x"] } })).toBe(false);
  expect(plainAsk({ ...d2, taskId: undefined } as Bodies["decision"])).toBe(false);
  expect(plainAsk(d2)).toBe(true);
});

test("the go forwarded to the task names the step and the words, and that the rest still asks", () => {
  const d = { decisionId: "d1", taskId: "t", question: "q", goLabel: "重跑 E2E", defaultOption: "go", reversible: true } as Bodies["decision"];
  const s = forwardText(d, { decisionId: "d1", option: "go", by: "said", said: "这些都别问我", action: "ci_rerun", standing: "st_1" });
  expect(s).toContain("Go: 重跑 E2E");
  expect(s).toContain('"这些都别问我"');
  expect(s).toContain("anything else that reaches other people still asks");
});
