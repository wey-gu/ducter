// research/247 Brief A, the second unlike shape: a hand-over of Obsidian to-dos on one Mac.
// Obsidian can't take a comment, so every write in a review fails: no record may be logged,
// only the one failed card with its retry. Fakes only: a vault in a temp dir, no model.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { fakeGh } from "./fake-gh-issues.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const until = async (ok: () => unknown, ms = 3000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
};

test("review together on Obsidian: every comment fails, so no record is logged and one failed card waits (research/247 Brief A)", async () => {
  const t = tempDir();
  const home = join(t.dir, "home");
  mkdirSync(home);
  const vault = join(t.dir, "Vault");
  mkdirSync(vault);
  writeFileSync(join(vault, "Inbox.md"), "- [ ] Write the thank-you note\n- [ ] Send the lease back\n");
  const old = new Date(Date.now() - 60_000);
  utimesSync(join(vault, "Inbox.md"), old, old);
  const gh = fakeGh();
  const core = startCore({
    dataDir: join(t.dir, "data"),
    port: 0,
    push: false,
    batchMs: 5,
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [], kind: async () => "laptop" },
    newTaskComputers: {
      nameOf: () => undefined,
      homeName: () => "Mac",
      workers: () => [],
      folderInfo: async () => "offline",
      repos: async () => ({ folder: "/Users/lin", repos: [] }),
      clones: async () => ({ clones: [] }),
    } as never,
    homeRepos: () => ({ folder: "/Users/lin", repos: [] }),
    taskSources: {
      ghRun: gh.run,
      ghEnv: {},
      home,
      pollMs: 3_600_000,
      boundMs: 0,
      quietMs: 0,
      today: () => "2026-11-19",
      ask: async (prompt) => {
        const m = /<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt);
        const rows = m ? (JSON.parse(m[1]!) as { id: number }[]) : [];
        return { text: JSON.stringify(rows.map((r) => ({ id: r.id, group: "do", why: "x" }))), tokens: 100 };
      },
    },
  });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "zh" });
  core.setPartner({ onTrigger() {} });
  const opened: string[] = [];
  const runner = {
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      const taskId = `t${opened.length + 1}`;
      opened.push(taskId);
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "codex", brief: input.brief } });
      core.tasks.setState(taskId, "working", "hot");
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(runner as unknown as Runner);
  const ts = core.taskSources;
  const add = await ts.add("obsidian", vault);
  expect(add.ok).toBe(true);
  await ts.look();
  const found = await ts.items();
  const refs = found.items.map((i) => i.ref);
  expect(refs).toHaveLength(2);
  const r = await ts.handover!.hand({ refs, shape: "one_by_one" });
  expect(r.ok).toBe(true);
  await ts.handover!.idle();
  await until(() => opened.length === 1);
  const report = (taskId: string, state: "done" | "failed", summary: string) => {
    core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state, summary, questions: [], evidence: [] } });
    core.tasks.setState(taskId, state === "done" ? "done_claimed" : "failed", "cold");
  };
  report("t1", "done", "写好了。");
  await until(() => opened.length === 2);
  report("t2", "done", "寄回去了。");
  const g = () => core.taskGroups.get(r.groupId!)!;
  await until(() => g().hand?.review === "ready");
  const rev = (await ts.handover!.review(r.groupId!))!;
  expect(rev.rows.flatMap((x) => x.items.map((i) => i.ref))).toEqual(refs);
  const sent = await ts.handover!.reviewSend(r.groupId!, refs);
  expect(sent).toMatchObject({ ok: false, done: 0, failed: 2 });
  const decisions = core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]);
  expect(decisions.some((d) => d.src?.kind === "group_review")).toBe(false);
  const failed = decisions.find((d) => d.src?.kind === "group_review_failed")!;
  expect(failed).toMatchObject({ question: "有 2 个没留上，要再试一次吗？", goLabel: "再试一次" });
  expect(failed.src!.failed!.map((f) => f.op)).toEqual(["comment", "comment"]);
  expect(g().hand?.review).not.toBe("sent");
  // The failed card's retry writes again (and fails again); it never invents a record.
  await ts.handover!.retryReview(failed, { decisionId: failed.decisionId, option: "go", by: "user" });
  const after = core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as Bodies["decision"]);
  expect(after.some((d) => d.src?.kind === "group_review")).toBe(false);
});
