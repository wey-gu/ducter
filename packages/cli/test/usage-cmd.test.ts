// D588: `ducter usage` against a running core: the frame goes over the WebSocket and the home counts
// from its own Log; the lines say the days' tokens in all, by agent, who started it, the most used
// and day by day, in zh and en, and what isn't counted yet.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { usageReport, type UsageReport } from "@ducter/protocol";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { cmdUsage, usageLines } from "../src/usage-cmd.ts";
import { translator } from "../src/i18n.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("usage: days 1 to 31", async () => {
  const lines: string[] = [];
  expect(await cmdUsage({ t: translator("en"), target: { kind: "local", port: 1 }, json: false, days: 32, print: (l) => lines.push(l) })).toBe(2);
  expect(lines[0]).toContain("ducter usage");
});

test("the home counts its own Log: a task's turns today, by its agent, opened by the person", async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-usage-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "linux" });
  core.log.append({ stream: "task:t1", origin: "user", kind: "task_open", body: { taskId: "t1", title: "Move the web build to Bun 1.4", project: "", place: { kind: "none" }, harness: "claude-code", model: "opus", brief: "Move it.", origin: "you" } });
  core.log.append({ stream: "task:t1", origin: "system", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "Done.", usage: { inputTokens: 120_000, outputTokens: 4_000, cacheRead: 90_000, turn: { input: 120_000, output: 4_000, cached: 90_000 } } } });
  await Bun.sleep(20);
  const lines: string[] = [];
  const code = await cmdUsage({ t: translator("en"), target: { kind: "local", port: core.port }, json: true, days: 1, print: (l) => lines.push(l) });
  expect(code).toBe(0);
  const r = JSON.parse(lines[0]!).report as UsageReport;
  expect(r.days).toHaveLength(1);
  expect(r.total).toEqual({ input: 120_000, output: 4_000, cached: 90_000 });
  expect(r.by.you.input).toBe(120_000);
  expect(r.agents[0]).toMatchObject({ harness: "claude-code", model: "opus", turns: 1, tasks: 1 });
  expect(r.tasks[0]).toMatchObject({ taskId: "t1", title: "Move the web build to Bun 1.4" });
}, 30_000);

const NOW = Date.parse("2026-11-26T12:00:00Z");
let seq = 0;
const report = (): UsageReport =>
  usageReport(
    [
      { seq: ++seq, ts: "2026-11-20T09:00:00Z", persona: "default", stream: "task:a", origin: "partner", kind: "task_open", body: { taskId: "a", title: "Review PR #10932 every 45 minutes", project: "mem", place: { kind: "none" }, harness: "codex", model: "gpt-6", brief: "x" } },
      { seq: ++seq, ts: "2026-11-25T10:00:00Z", persona: "default", stream: "task:a", origin: "system", kind: "task_event", body: { taskId: "a", role: "assistant", usage: { turn: { input: 1_200_000, output: 9_000, cached: 1_150_000 } } } },
      { seq: ++seq, ts: "2026-11-26T09:00:00Z", persona: "default", stream: "task:b", origin: "user", kind: "task_open", body: { taskId: "b", title: "修一下登录页的样式", project: "", place: { kind: "none" }, harness: "claude-code", brief: "x", origin: "you" } },
      { seq: ++seq, ts: "2026-11-26T10:00:00Z", persona: "default", stream: "task:b", origin: "system", kind: "task_event", body: { taskId: "b", role: "assistant", usage: { turn: { input: 80_000, output: 3_000 } } } },
    ],
    { now: NOW, days: 3 },
  );

test("the lines, in en: each part in its own line, short counts, the empty day, what isn't counted", () => {
  const en = usageLines(translator("en"), report());
  const s = en.join("\n");
  expect(en[0]).toBe("What tasks used, the last 3 days in your own days (from 2026-11-24)");
  expect(s).toContain("In all: 1.3M input (1.2M of it cached), 12k output. Turns: 2. Tasks: 2.");
  expect(s).toContain("Codex (gpt-6): 1.2M input (1.2M of it cached), 9k output. Turns: 1. Tasks: 1.");
  expect(s).toContain("You: 80k input, 3k output");
  expect(s).toContain("The partner (and what it is looking after): 1.2M input (1.2M of it cached), 9k output");
  expect(s).toContain("Review PR #10932 every 45 minutes, by Codex (gpt-6)");
  expect(s).toContain("2026-11-24: nothing");
  expect(s).toContain("Not counted yet: the partner's own replies");
  expect(s).not.toContain(" · ");
  // The loop's mostly cached turn (50k + 9k + 115k at a tenth) still weighs more than the person's 83k: it leads.
  expect(en.findIndex((l) => l.includes("Review PR #10932"))).toBeLessThan(en.findIndex((l) => l.includes("修一下登录页的样式")));
});

test("the lines, in zh, and an empty week", () => {
  const zh = usageLines(translator("zh"), report()).join("\n");
  expect(zh).toContain("任务用了多少：最近 3 天");
  expect(zh).toContain("合计：输入 1.3M（其中缓存 1.2M），输出 12k。2 轮，2 个任务。");
  expect(zh).toContain("你开的：输入 80k，输出 3k");
  expect(zh).toContain("还没算进来：");
  const none = usageLines(translator("zh"), usageReport([], { now: NOW, days: 2 }));
  expect(none).toEqual(["任务用了多少：最近 2 天，按你这边的日子算（从 2026-11-25 起）", "  这几天没有任务用过。", "", translator("zh")("usage.notCounted")]);
});
