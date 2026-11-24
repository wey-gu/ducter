// D514: `ducter worktrees` prints the plan per computer, changes nothing; keep/release set the
// task's mark over the WebSocket. The plan itself is runner/test/tidy.test.ts.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TidyPlan } from "@ducter/protocol";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { cmdWorktrees, matchRows, planLines } from "../src/worktrees-cmd.ts";
import { translator } from "../src/i18n.ts";

const plan: TidyPlan = {
  rows: [
    { taskId: "b7gw6r2e", title: "在 hel 用 Gemini 审改 Mem 长文案并开 PR", device: "local", computer: "hel", path: "/root/ducter/worktrees/mem/在-hel-用-gemini-审改-mem-长文案并开-pr", bytes: 540 * 1024 ** 2, verdict: { tidy: true, why: "finished" } },
    { taskId: "daj4u2vt", title: "Nowledge Mem PR Babysitter", device: "local", computer: "hel", path: "/root/ducter/worktrees/mem/nowledge-mem-pr-babysitter", bytes: 540 * 1024 ** 2, verdict: { tidy: false, keep: "recent", until: "2026-11-30T16:09:50.512Z" } },
    { taskId: "itwryrgy", title: "跟进 PR #11070 直到可合并", device: "local", computer: "hel", path: "/root/ducter/worktrees/mem/跟进-pr-11070-直到可合并", bytes: 543 * 1024 ** 2, verdict: { tidy: false, keep: "live" } },
    { taskId: "xfnccfi7", title: "graph_error_response_tests intermittently fail", device: "d1f365f665", computer: "Macbook Pro M3", path: "/Users/weyl/ducter/worktrees/nowledge-mem/graph-error-response-tests-intermittentl", bytes: 527 * 1024 ** 2, verdict: { tidy: false, keep: "uncommitted" } },
  ],
  tidied: { local: { count: 12, bytes: 3.4 * 1024 ** 3 } },
};

test("the plan, per computer: what was tidied, what goes, when, and what stays and why", () => {
  const zh = planLines(translator("zh"), "zh", plan).join("\n");
  expect(zh).toContain("hel\n  整理过 12 个用完的工作副本，腾出 3.4 GB");
  expect(zh).toContain("会整理  在 hel 用 Gemini 审改 Mem 长文案并开 PR  540 MB");
  expect(zh).toContain("11-30 起会整理  Nowledge Mem PR Babysitter");
  expect(zh).toContain("任务还在进行  跟进 PR #11070 直到可合并");
  expect(zh).toContain("Macbook Pro M3\n  有没提交的改动  graph_error_response_tests");
  expect(zh).not.toContain(" · ");
  const en = planLines(translator("en"), "en", plan).join("\n");
  expect(en).toContain("Tidied 12 finished working copies, 3.4 GB freed");
  expect(en).toContain("Has uncommitted changes");
  expect(planLines(translator("en"), "en", { rows: [], tidied: {} }).join("\n")).toContain("No working copies.");
});

test("a task by its id or part of its title", () => {
  expect(matchRows(plan.rows, "itwryrgy").map((r) => r.taskId)).toEqual(["itwryrgy"]);
  expect(matchRows(plan.rows, "babysitter").map((r) => r.taskId)).toEqual(["daj4u2vt"]);
  expect(matchRows(plan.rows, "PR").length).toBeGreaterThan(1);
});

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("against a running home with no runner: says it can't, changes nothing; a bad verb is usage", async () => {
  const lines: string[] = [];
  expect(await cmdWorktrees({ t: translator("en"), target: { kind: "local", port: 1 }, json: false, lang: "en", rest: ["prune"], print: (l) => lines.push(l) })).toBe(2);
  expect(lines[0]).toContain("ducter worktrees");
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-worktrees-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "linux" });
  const out: string[] = [];
  expect(await cmdWorktrees({ t: translator("en"), target: { kind: "local", port: core.port }, json: true, lang: "en", rest: [], print: (l) => out.push(l) })).toBe(1);
  expect(JSON.parse(out[0]!)).toEqual({ ok: false, error: "not available" });
}, 30_000);
