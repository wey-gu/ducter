// D624: no board is offered any more. Neither a one-off task with many done reports nor a
// Babysitter holding PRs gets an offer card; the Keep page carries the PR facts instead.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, Runner, TaskCard } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { fakeGh, type FakeIssue } from "./fake-gh-issues.ts";
import { seedOld } from "./fixtures/keeps-old.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const NOW = Date.parse("2026-11-27T05:37:00Z");
const issue = (repo: string, number: number, title: string): FakeIssue => ({ repo, number, title, pr: true, assigned: false, review: true, author: "mei-chen", updated: new Date(NOW - number * 1000).toISOString(), diff: "diff --git a/x b/x\n+x\n" });

function boot() {
  const t = tempDir();
  seedOld(t.dir);
  const gh = fakeGh([issue("nowledge-co/mem", 1, "One"), issue("nowledge-co/mem", 2, "Two")], { login: "lin-dev" });
  const core = startCore({ dataDir: t.dir, port: 0, push: false, batchMs: 5, taskSources: { ghRun: gh.run, ghEnv: {}, home: join(t.dir, "home"), pollMs: 3_600_000, boundMs: 0, quietMs: 0, today: () => "2026-11-27", now: () => NOW } });
  stops.push(t.cleanup, () => core.stop());
  core.settings.set({ language: "en" });
  core.setPartner({ onTrigger: () => {} });
  core.setRunner({
    harness: { start: async () => Promise.reject(new Error("no model in this test")), available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("no");
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  const open = (taskId: string, title: string, brief: string, needs?: { reviews?: boolean }) => {
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "codex", brief, ...(needs ? { needs } : {}) } });
    core.tasks.setState(taskId, "working", "hot");
  };
  const rec = (taskId: string, ref: string) => ({ prs: [{ ref, title: ref, head: "a1b2c3d", ci: "passing", changed: true, notes: [{ kind: "problem", path: "src/x.rs", line: 2, text: "x" }] }] });
  const call = (taskId: string, tool: string, args: unknown) => core.mcp.call({ role: "task", taskId } as never, tool, args) as Promise<string>;
  return { core, open, rec, call };
}
const offers = (core: ReturnType<typeof startCore>) => core.log.read({ stream: "channel", kinds: ["decision"], limit: 200 }).map((e) => e.body as Bodies["decision"]).filter((d) => /看板|board/i.test(d.question));
const settle = () => new Promise((r) => setTimeout(r, 30));

test("no board offer: a one-off task with six done reports gets none", async () => {
  const { core, open } = boot();
  open("tfix", "Fix the Plus card date", "Fix PR #11441, get it reviewed by the Babysitter and hand it over after review.");
  // It rests on its own timer: before this decision that shape got the reports offer after three.
  core.waiters.arm({ taskId: "tfix", wakes: "task", reason: "明天再看一次", at: new Date(NOW + 86_400_000).toISOString() } as never);
  for (let i = 1; i <= 6; i++) core.log.append({ stream: "channel", origin: "task", kind: "report", body: { taskId: "tfix", state: "done", summary: `第 ${i} 轮：改好了。`, questions: [], evidence: [] } });
  await settle();
  expect(offers(core)).toHaveLength(0);
});

test("no board offer: a Babysitter holding PRs gets none", async () => {
  const { core, open, rec, call } = boot();
  await core.taskSources.add("github");
  await core.taskSources.look();
  const keep = core.keeps!.all().find((k) => k.from.kind === "helper" && k.from.helperId === "nowledge-mem-pr-babysitter")!;
  // The Babysitter hands a PR to a task; its rounds review it (a review task by the partner's word).
  core.log.append({ stream: "channel", origin: "task", kind: "bridge_msg", body: { direction: "out", messageId: "m1", helper: "nowledge-mem-pr-babysitter", taskId: "trev", text: "PR #1, review it", state: "sent" } } as never);
  open("trev", "Review PR #1", "Review the PR the Babysitter handed over.", { reviews: true });
  expect(core.keeps!.ofTask("trev")?.id).toBe(keep.keepId);
  for (let i = 0; i < 3; i++) await call("trev", "review_report", rec("trev", "nowledge-co/mem#1"));
  await settle();
  expect(offers(core)).toHaveLength(0);
});
