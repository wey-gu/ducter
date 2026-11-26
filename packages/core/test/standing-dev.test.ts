// D596: 开发做完、验证好，直接开 PR 交给帮手 / Verified work goes straight to a PR and your helper. The
// author said once (the Mac, 2026-11-26): 「以后我让你做开发的工作，请都按照这个标准（不一定分配给谁），做好了
// PR，研究实现设计验证好之后，交给 PR baby sitter 哈。」 The partner keeps it as a pr_open go (here: as its
// without_asking tool calls the store); a task whose work is verified calls open_pr and Ducter pushes
// its branch and opens its PR with no card, in Done for you with their words, one line the first
// time; an unverified one opens nothing; nothing ever merges; taken back, open_pr is gone again.
// Fakes only: a stub runner (no git, no GitHub), no model.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { STANDING_ACTIONS, type Bodies, type Runner, type TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { createDid } from "../src/did.ts";
import { prFirstLine } from "../src/standing.ts";
import { taskBrief } from "../../runner/src/brief.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const WORDS = "以后我让你做开发的工作，请都按照这个标准（不一定分配给谁），做好了 PR，研究实现设计验证好之后，交给 PR baby sitter 哈。";
const PR = "https://github.com/nowledge-co/mem/pull/11391";
const TASK = "m11390";

function boot() {
  const t = tempDir();
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, push: false, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.settings.set({ language: "zh" });
  const opened: { taskId: string; pr?: { title?: string; body?: string; ready?: boolean } }[] = [];
  const merged: string[] = [];
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model")), available: async () => [] },
    openTask: async (): Promise<TaskCard> => Promise.reject(new Error("no")),
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
    openPr: async (taskId: string, pr?: { title?: string; body?: string; ready?: boolean }) => (opened.push({ taskId, ...(pr ? { pr } : {}) }), { ok: true, message: "Opened a PR for ducter/fix-11390.", ref: PR }),
    merge: async (taskId: string) => (merged.push(taskId), { ok: true, message: "merged" }),
  } as unknown as Runner);
  // The Mac's task in shape: a repo task cloned from nowledge-co/mem, its fix committed on its branch.
  core.log.append({ stream: `task:${TASK}`, origin: "partner", kind: "task_open", body: { taskId: TASK, title: "修 Mem #11390", project: "", place: { kind: "repo", device: "local", repoPath: "/r/mem", clone: "nowledge-co/mem", branch: "ducter/fix-11390", baseBranch: "main" }, harness: "codex", brief: "修 #11390" } });
  core.tasks.setState(TASK, "working", "hot");
  const call = (args: unknown) => core.mcp.call({ role: "task", taskId: TASK } as never, "open_pr", args) as Promise<{ ok: boolean; pr?: string; note?: string; error?: string }>;
  const listed = () => core.mcp.listed({ role: "task", taskId: TASK } as never);
  const said = () => core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 50 }).map((e) => (e.body as Bodies["ai_msg"]).text);
  return { core, opened, merged, call, listed, said };
}

const grant = (core: ReturnType<typeof startCore>) => core.standing.hear("tool:dev", { kind: "grant", action: "pr_open", quote: WORDS }, new Date().toISOString())!.kept!;

test("the saying kept: bounded where the person's tasks work, listed once, covering the push, in the brief", () => {
  const { core, listed } = boot();
  expect(listed()).not.toContain("open_pr"); // nothing said yet: no such tool, the task asks as before
  const kept = grant(core);
  expect(kept).toMatchObject({ action: "pr_open", text: WORDS, orgs: ["nowledge-co"] });
  expect(core.standing.covers("branch_push", { taskId: TASK, owner: "nowledge-co" })?.id).toBe(kept.id);
  expect(core.standing.covers("pr_open", { taskId: "other", owner: "someone-else" })).toBeUndefined(); // another owner asks
  expect(core.goesFor!(TASK).map((s) => s.action)).toEqual(["pr_open"]);
  expect(listed()).toContain("open_pr");
  const brief = taskBrief({ partnerName: "Ducter", taskId: TASK, title: "t", brief: "b", place: { kind: "none" }, cwd: "/w", mcpServerName: "ducter", goes: core.goesFor!(TASK).map((s) => ({ action: s.action, words: s.text })) });
  expect(brief).toContain("## What you may do without asking");
  expect(brief).toContain("call `open_pr`");
  expect(brief).toContain("Never merge");
});

test("verified: Ducter pushes and opens the PR with no card, in Done for you with their words, one line the first time", async () => {
  const { core, opened, merged, call, said } = boot();
  const kept = grant(core);
  const r = await call({ title: "fix: 搜索结果分页 (#11390)", body: "修复 #11390。", checks: ["bun test packages/search: 42 passed", "Playwright e2e on the search page: passed"], hand_to: "PR Babysitter" });
  expect(r).toMatchObject({ ok: true, pr: PR });
  expect(r.note).toContain("hand it to PR Babysitter");
  expect(r.note).toContain("Never merge");
  expect(opened).toEqual([{ taskId: TASK, pr: { title: "fix: 搜索结果分页 (#11390)", body: "修复 #11390。", ready: true } }]);
  expect(core.log.read({ stream: "channel", kinds: ["decision"], limit: 50 })).toHaveLength(0);
  const job = core.log.read({ stream: "channel", kinds: ["job_status"], limit: 50 }).map((e) => e.body as Bodies["job_status"]).at(-1)!;
  expect(job).toMatchObject({ taskId: TASK, act: "open_pr", ref: PR, by: "rule", standing: kept.id, said: WORDS });
  expect(said()).toEqual([prFirstLine("zh", { title: "修 Mem #11390", link: `[#11391](${PR})`, who: "PR Babysitter" })]);
  expect(said()[0]).toContain("交给 PR Babysitter 跟进");
  const did = createDid({ log: core.log, tasks: core.tasks }).query({});
  expect(did.items.find((x) => x.taskId === TASK)).toMatchObject({ kind: "changed", sub: "pr", link: PR, go: { by: "said", words: WORDS } });
  // One PR a task: a second call opens nothing; the first-time line never comes again.
  const again = await call({ title: "x", checks: ["y"] });
  expect(again.ok).toBe(false);
  expect(again.error).toContain("already has its PR");
  expect(opened).toHaveLength(1);
  expect(said()).toHaveLength(1);
  expect(merged).toEqual([]); // never a merge
});

test("not verified: nothing is pushed or opened, and the task is told to keep working or say what is left", async () => {
  const { core, opened, call } = boot();
  grant(core);
  const r = await call({ title: "fix #11390", checks: [] });
  expect(r.ok).toBe(false);
  expect(r.error).toContain("Not verified yet");
  expect(opened).toEqual([]);
  expect(core.log.read({ stream: "channel", kinds: ["job_status"], limit: 50 })).toHaveLength(0);
});

test("a merge never becomes standing, and the floor stays out", () => {
  expect(STANDING_ACTIONS).not.toContain("merge" as never);
  for (const floor of ["pay", "sign_in", "delete", "merge"]) expect(STANDING_ACTIONS.includes(floor as never)).toBe(false);
  const { core } = boot();
  expect(core.standing.hear("tool:m", { kind: "grant", action: "merge" as never, quote: "直接合并" }, new Date().toISOString())).toBeUndefined();
  expect(core.standing.list()).toEqual([]);
});

test("taken back: open_pr is gone and a call opens nothing (the task asks again)", async () => {
  const { core, opened, call, listed } = boot();
  const kept = grant(core);
  expect(core.standing.revoke(kept.id)).toBe(true);
  expect(listed()).not.toContain("open_pr");
  expect(core.goesFor!(TASK)).toEqual([]);
  const r = await call({ title: "fix", checks: ["bun test: passed"] });
  expect(r.ok).toBe(false);
  expect(opened).toEqual([]);
});

test("the backfill note is given once per home", () => {
  const { core } = boot();
  expect(core.standing.once("d596:pr_open")).toBe(true);
  expect(core.standing.once("d596:pr_open")).toBe(false);
});
