// D472 (hel, 2026-11-22): an Antigravity task in /root/dev/mem, which Hetzner Server didn't have,
// failed at once; the page showed 没成 and 再试一次 only, and its Log had two task_open in one
// second. Each start failure has a word and a fix, one tap is one start again, and a task opened
// early (D120) that fails before its brief comes keeps its brief for the start again.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import { startProblem } from "../src/places.ts";
import { createFakeCore, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-d472-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("D472: the common start failures have their own word; 'other' is what is truly unknown", () => {
  expect(startProblem("folder does not exist: /root/dev/mem")).toEqual({ why: "no_folder", path: "/root/dev/mem" });
  expect(startProblem("fatal: cannot change to '/root/dev/mem': No such file or directory")).toEqual({ why: "no_folder", path: "/root/dev/mem" });
  expect(startProblem("ENOENT: no such file or directory, uv_cwd '/Users/wey/dev/mem'")).toEqual({ why: "no_folder", path: "/Users/wey/dev/mem" });
  expect(startProblem("harness antigravity is not installed").why).toBe("not_installed");
  expect(startProblem("Error: spawn agy ENOENT").why).toBe("not_installed");
  expect(startProblem("Not logged in · Please run /login").why).toBe("signed_out");
  expect(startProblem("401 Unauthorized: invalid credentials").why).toBe("signed_out");
  expect(startProblem("unknown op folder_info").why).toBe("old");
  expect(startProblem("harness antigravity is not supported").why).toBe("old");
  expect(startProblem("couldn't fetch ducter/x from origin: fatal: no such ref").why).toBe("other");
});

function failingPlaces(log: string[]) {
  core.places = {
    preflight: async (a) => ({ ok: true, place: a.place }),
    quick: () => false,
    async cantStart(_id, p) {
      return { why: p.why, computer: "Hetzner Server", what: "mem", path: p.path, pickHere: true, line: "没能开始：Hetzner Server 上没有 mem 这个文件夹" };
    },
    async replan() {
      log.push("replan");
      await Bun.sleep(20);
      return { ok: true, place: { kind: "folder", device: "local", path: join(dir, "still-nowhere") } };
    },
  };
}

test("D472: 再试一次 tapped twice while it starts again is one start (one task_open, one launch)", async () => {
  const asked: string[] = [];
  failingPlaces(asked);
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "antigravity", turn: async () => {} }) });
  const runner = createRunner(core, { harness: port, newId: () => "smx2jjb3" });
  const card = await runner.openTask({ persona: "p1", title: "在 hel 用 Gemini 审改 Mem 长文案并开 PR", brief: "the brief", place: { kind: "folder", device: "local", path: join(dir, "nowhere") } });
  await runner.whenStarted(card.taskId).catch(() => {});
  const opens = () => core.events.filter((e) => e.kind === "task_open").length;
  const before = opens();
  await Promise.all([runner.reopen(card.taskId).catch(() => {}), runner.reopen(card.taskId).catch(() => {}), runner.restartAt!(card.taskId, { kind: "folder", device: "local", path: join(dir, "x") })]);
  await runner.whenStarted(card.taskId).catch(() => {});
  await Bun.sleep(30);
  expect(opens() - before).toBe(1);
  expect(asked.length).toBeLessThanOrEqual(1);
  const failed = core.events.filter((e) => e.kind === "task_state").map((e) => e.body as Bodies["task_state"]).at(-1)!;
  expect(failed).toMatchObject({ attention: "failed", cant: { why: "no_folder", pickHere: true, device: "local", harness: expect.any(String) } });
  // Settled: a later tap is a real second try.
  await runner.reopen(card.taskId).catch(() => {});
  await runner.whenStarted(card.taskId).catch(() => {});
  expect(opens() - before).toBe(2);
});

test("D472: opened early and failed before its brief came: the brief is kept for the start again", async () => {
  failingPlaces([]);
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: async () => {} }) });
  const runner = createRunner(core, { harness: port, newId: () => "tsk00472" });
  let give!: (s: string) => void;
  const brief = new Promise<string>((r) => (give = r));
  const card = await runner.openTaskEarly!({ persona: "p1", title: "Review Mem copy", place: { kind: "folder", device: "local", path: join(dir, "nowhere") } }, brief, Promise.resolve([]));
  await runner.whenStarted(card.taskId).catch(() => {});
  expect(core.events.filter((e) => e.kind === "task_state").map((e) => e.body as Bodies["task_state"]).at(-1)).toMatchObject({ attention: "failed", cant: { why: "no_folder" } });
  give("the full brief");
  await Bun.sleep(20);
  const last = core.events.filter((e) => e.kind === "task_open").map((e) => e.body as Bodies["task_open"]).at(-1)!;
  expect(last.brief).toBe("the full brief");
});
