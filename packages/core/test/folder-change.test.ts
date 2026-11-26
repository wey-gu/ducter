// D204 (the person's choice): Settings › Where it runs moves a computer's Ducter folder. The
// home refuses while a task can still work in it, moves projects/ and worktrees/, keeps the chosen
// path for that computer, and a task opened before the move still resolves through folder_moved.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogEvent, ServerFrame } from "@ducter/protocol";
import { ducterFolder } from "@ducter/protocol/src/ducter-folder.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
let extra: string[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
  for (const d of extra) rmSync(d, { recursive: true, force: true });
  extra = [];
});

function boot(): { core: Core; dir: string } {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, push: false });
  stops.push(t.cleanup, () => core.stop());
  return { core, dir: t.dir };
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 6000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "welcome");
  const ask = async <K extends ServerFrame["t"]>(f: object, t: K): Promise<Extract<ServerFrame, { t: K }>> => {
    const before = frames.length;
    ws.send(JSON.stringify(f));
    return until<Extract<ServerFrame, { t: K }>>((x) => x.t === t && frames.indexOf(x) >= before);
  };
  return { ask, frames };
}

test("D204: a task working in the folder keeps it from moving; done, it moves and the old place still resolves", async () => {
  const { core, dir } = boot();
  const folder = join(dir, "ducter");
  mkdirSync(join(folder, "projects", "api", ".git"), { recursive: true });
  mkdirSync(join(folder, "worktrees", "api", "fix"), { recursive: true });
  writeFileSync(join(folder, ".ducter-folder"), "x\n");
  const oldRepo = join(folder, "projects", "api");
  const oldWt = join(folder, "worktrees", "api", "fix");
  core.log.append({
    stream: "task:t1",
    origin: "partner",
    kind: "task_open",
    body: {
      taskId: "t1",
      title: "Fix the flaky test",
      project: "api",
      place: { kind: "repo", device: "local", repoPath: oldRepo, worktree: oldWt, branch: "ducter/fix" },
      harness: "claude-code",
      brief: "Fix it.",
    },
  });
  const c = await client(core);
  const target = mkdtempSync(join(tmpdir(), "ducter-moved-"));
  extra.push(target);
  const refused = await c.ask({ t: "folder_change", path: join(target, "Ducter"), clientId: "c1" }, "folder_change_result");
  expect(refused).toMatchObject({ ok: false, reason: "tasks_running", clientId: "c1", tasks: [{ taskId: "t1", title: "Fix the flaky test" }] });
  expect(existsSync(join(target, "Ducter"))).toBe(false);

  // The task finished: its working copy still moves with the folder, and its stored place follows.
  core.log.append({ stream: "task:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "done", residency: "archived" } as never });
  const moved = await c.ask({ t: "folder_change", path: join(target, "Ducter"), clientId: "c2" }, "folder_change_result");
  expect(moved).toMatchObject({ ok: true, clientId: "c2", device: "local", from: folder, path: join(target, "Ducter"), projects: 1, worktrees: 1 });
  expect(existsSync(join(target, "Ducter", "projects", "api"))).toBe(true);
  expect(existsSync(join(target, "Ducter", "worktrees", "api", "fix"))).toBe(true);
  // The chosen path is kept for this computer, here and in the data folder (the runner reads it).
  expect(core.settings.get().folderPaths).toEqual({ local: join(target, "Ducter") });
  expect(ducterFolder({ dataDir: dir }).path).toBe(join(target, "Ducter"));
  // The task opened before the move resolves to its new working copy (folder_moved as a mapping).
  expect(core.tasks.get("t1")?.place).toMatchObject({ kind: "repo", repoPath: join(target, "Ducter", "projects", "api"), worktree: join(target, "Ducter", "worktrees", "api", "fix") });
  // The Log says what moved, once, on the channel.
  const ev = core.log.read({ stream: "channel", kinds: ["folder_moved"], limit: 10 })[0] as LogEvent<"folder_moved"> | undefined;
  expect(ev?.body).toEqual({ from: folder, to: join(target, "Ducter"), device: "local", projects: 1, worktrees: 1 });
});

test("D204: a worker's move goes through its moveFolder op; the home keeps the path and maps its tasks", async () => {
  const t = tempDir();
  const calls: { dev: string; path: string }[] = [];
  const comps = {
    nameOf: (dev: string) => (dev === "wmac" ? "Macbook Pro M3" : undefined),
    homeName: () => "hel",
    workers: () => [{ id: "wmac", name: "Macbook Pro M3", online: true }],
    folderInfo: async () => "offline" as const,
    repos: async () => ({ folder: "/Users/ana/ducter", why: "default" as const, repos: [] }),
    moveFolder: async (dev: string, path: string) => {
      calls.push({ dev, path });
      return { ok: true as const, from: "/Users/ana/ducter", path, moved: true, projects: 2, worktrees: 3, repaired: 4 };
    },
  };
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, push: false, newTaskComputers: comps });
  stops.push(t.cleanup, () => core.stop());
  core.log.append({
    stream: "task:t1",
    origin: "partner",
    kind: "task_open",
    body: { taskId: "t1", title: "On the Mac", project: "api", place: { kind: "repo", device: "wmac", repoPath: "/Users/ana/ducter/projects/api", worktree: "/Users/ana/ducter/worktrees/api/fix" }, harness: "claude-code", brief: "x" },
  });
  core.log.append({ stream: "task:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "done", residency: "archived" } as never });
  const c = await client(core);
  const r = await c.ask({ t: "folder_change", device: "wmac", path: "/Users/ana/Ducter" }, "folder_change_result");
  expect(r).toMatchObject({ ok: true, device: "wmac", from: "/Users/ana/ducter", path: "/Users/ana/Ducter", projects: 2, worktrees: 3 });
  expect(calls).toEqual([{ dev: "wmac", path: "/Users/ana/Ducter" }]);
  expect(core.settings.get().folderPaths).toEqual({ wmac: "/Users/ana/Ducter" });
  expect(core.tasks.get("t1")?.place).toMatchObject({ repoPath: "/Users/ana/Ducter/projects/api", worktree: "/Users/ana/Ducter/worktrees/api/fix" });
});

test("D204: a second move maps through both folder_moved events (old records still resolve)", async () => {
  const { core, dir } = boot();
  const folder = join(dir, "ducter");
  mkdirSync(join(folder, "projects", "api"), { recursive: true });
  writeFileSync(join(folder, ".ducter-folder"), "x\n");
  core.log.append({
    stream: "task:t1",
    origin: "partner",
    kind: "task_open",
    body: { taskId: "t1", title: "One", project: "api", place: { kind: "repo", device: "local", repoPath: join(folder, "projects", "api") }, harness: "claude-code", brief: "x" },
  });
  const one = mkdtempSync(join(tmpdir(), "ducter-moved-"));
  const two = mkdtempSync(join(tmpdir(), "ducter-moved-"));
  extra.push(one, two);
  core.log.append({ stream: "task:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "done", residency: "archived" } as never });
  const c = await client(core);
  expect(await c.ask({ t: "folder_change", path: join(one, "Ducter") }, "folder_change_result")).toMatchObject({ ok: true });
  expect(await c.ask({ t: "folder_change", path: join(two, "Ducter") }, "folder_change_result")).toMatchObject({ ok: true });
  expect(core.tasks.get("t1")?.place).toMatchObject({ repoPath: join(two, "Ducter", "projects", "api") });
});
