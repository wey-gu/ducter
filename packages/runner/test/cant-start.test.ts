// D391: a task that can't start because of its place says why (core's words and fixes, never
// a bare path), and starts again in the place core re-resolved, its brief and agent kept.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import { placeProblem } from "../src/places.ts";
import { createFakeCore, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cant-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function makeRepo(): string {
  const repo = join(dir, "mem");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "hi\n");
  Bun.spawnSync(["git", "-C", repo, "add", "."]);
  Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
  return repo;
}

test("placeProblem reads a start's failure, on this computer or a worker's words", () => {
  expect(placeProblem("not a git repository: /root/dev/mem")).toEqual({ why: "no_repo", path: "/root/dev/mem" });
  expect(placeProblem("Error: folder does not exist: /Users/x/Notes")).toEqual({ why: "no_folder", path: "/Users/x/Notes" });
  expect(placeProblem("couldn't clone nowledge-co/mem: Repository not found.")).toEqual({ why: "clone_failed", path: "nowledge-co/mem" });
  expect(placeProblem("turn failed: rate limited")).toBeUndefined();
});

test("no repository there: the card says why with its fixes; restartAt starts it on the copy core found", async () => {
  const asked: unknown[] = [];
  core.places = {
    preflight: async (a) => ({ ok: true, place: a.place }),
    quick: () => false,
    async cantStart(taskId, p) {
      asked.push({ taskId, ...p });
      return { why: p.why, computer: "Hetzner Server", what: "mem", path: p.path, elsewhere: { device: "local", name: "MacBook" }, cloneHere: true, line: "没能开始：Hetzner Server 上没有 mem 的代码" };
    },
    replan: async () => ({ ok: false, message: "unused" }),
  };
  const turns: string[] = [];
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: async (t) => void turns.push(String((t as { input?: unknown }).input ?? "")) }) });
  const runner = createRunner(core, { harness: port, newId: () => "tsk00001" });
  const card = await runner.openTask({ persona: "p1", title: "Improve general setting page", brief: "the brief", place: { kind: "repo", device: "local", repoPath: join(dir, "nowhere") } });
  await runner.whenStarted(card.taskId).catch(() => {});
  const failed = core.events.filter((e) => e.kind === "task_state").map((e) => e.body as Bodies["task_state"]).at(-1)!;
  expect(failed).toMatchObject({ attention: "failed", reason: "没能开始：Hetzner Server 上没有 mem 的代码", cant: { why: "no_repo", computer: "Hetzner Server", what: "mem", elsewhere: { name: "MacBook" }, cloneHere: true } });
  expect((failed.cant as Record<string, unknown>).line).toBeUndefined();
  expect(asked).toEqual([{ taskId: "tsk00001", why: "no_repo", path: join(dir, "nowhere"), device: "local" }]);
  // 在 MacBook 上做: the place core re-resolved; it starts there with its brief.
  const repo = makeRepo();
  const r = await runner.restartAt!(card.taskId, { kind: "repo", device: "local", repoPath: repo });
  expect(r).toEqual({ ok: true });
  await runner.whenStarted(card.taskId);
  const opens = core.events.filter((e) => e.kind === "task_open").map((e) => e.body as Bodies["task_open"]);
  expect(opens.at(-1)).toMatchObject({ place: { kind: "repo", repoPath: repo }, brief: "the brief" });
  const wt = (opens.at(-1)!.place as { worktree: string }).worktree;
  expect(existsSync(join(wt, "README.md"))).toBe(true);
  const last = core.events.filter((e) => e.kind === "task_state").map((e) => e.body as Bodies["task_state"]).at(-1)!;
  expect(last.cant).toBeUndefined();
  expect(last.attention).not.toBe("failed");
});
