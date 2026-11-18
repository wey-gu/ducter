// D376: the two follow-ups D373 left. (1) A follow-up that needs another computer: the partner's
// task_switch takes the computer (the trip on the home's browser, the flights in the MacBook's
// signed-in Chrome), checked by name, never a folder, a code task only after the person's go.
// (2) The person's own Claude Code / Codex session carried on from the conversation: never one
// still open in its terminal (Claude Code says which are running; a file written a moment ago may
// be), and the person's next words go with its first turn.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { movedOver } from "../../runner/src/brief.ts";
import type { Computer } from "../src/candidates.ts";
import { createLocalAgents } from "../src/local-agents/index.ts";
import { computerNamed, registerSwitchTool, type Loadout } from "../src/loadout.ts";
import { createOutside } from "../src/outside.ts";
import { writeSession } from "./fixtures-agents.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

const COMPS: Computer[] = [
  { id: "local", name: "fake-server", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [], web: { on: true, where: "ducter" } },
  { id: "w1", name: "Fake MacBook", home: false, state: "awake", alwaysOn: false, mac: true, harnesses: [], web: { on: true, where: "chrome" } },
  { id: "w2", name: "fake-mini", home: false, state: "asleep", alwaysOn: false, mac: true, harnesses: [] },
];

function switchTool(card: Partial<TaskCard>) {
  const tools = new Map<string, (a: unknown) => Promise<unknown>>();
  const mcp = { register: (_r: string, name: string, _d: string, _s: unknown, h: (a: unknown) => Promise<unknown>) => tools.set(name, h) };
  const moved: { taskId: string; harness: string; model?: string; device?: string; by?: string }[] = [];
  const c = { taskId: "t_trip", title: "北京行程", project: "", harness: "codex", attention: "done", residency: "parked", openedAt: "", updatedAt: "", place: { kind: "browser", device: "local", profile: "default" }, ...card } as TaskCard;
  const loadout = {
    computers: async () => COMPS,
    switchTask: async (taskId: string, harness: string, model: string | undefined, _r: unknown, device?: string, _e?: string, by?: string) => (moved.push({ taskId, harness, ...(model ? { model } : {}), ...(device ? { device } : {}), ...(by ? { by } : {}) }), { ok: true }),
  } as unknown as Loadout;
  registerSwitchTool(mcp as never, { loadout, tasks: { get: (id: string) => (id === c.taskId ? c : undefined) } as never, runner: () => undefined });
  const call = async (a: object) => (await tools.get("task_switch")!(a)) as { ok: boolean; error?: string; moved?: string; note?: string };
  return { call, moved };
}

test("a finished errand on the home moves to the MacBook for its follow-up: by name, its agent kept, said whose Chrome it uses", async () => {
  const { call, moved } = switchTool({});
  const r = await call({ taskId: "t_trip", device: "fake macbook" });
  expect(r).toMatchObject({ ok: true, moved: "Fake MacBook" });
  expect(moved).toEqual([{ taskId: "t_trip", harness: "codex", device: "w1", by: "partner" }]);
  // Not running: the follow-up is sent next, and the line names the action, never the move.
  expect(r.note).toContain("task_send it the follow-up");
  expect(r.note).toContain("the user's own Chrome, with their sign-ins");
});

test("a computer that isn't one, one asleep, a folder, and the one it is on already: nothing moves, and why", async () => {
  const a = switchTool({});
  expect((await a.call({ taskId: "t_trip", device: "Office PC" })).error).toContain("Fake MacBook");
  expect((await a.call({ taskId: "t_trip", device: "fake-mini" })).error).toContain("asleep");
  expect((await a.call({ taskId: "t_trip", device: "local" })).error).toContain("already on");
  const b = switchTool({ place: { kind: "folder", device: "local", path: "/fake/Pictures" } });
  expect((await b.call({ taskId: "t_trip", device: "Fake MacBook" })).error).toContain("can't move");
  expect([...a.moved, ...b.moved]).toEqual([]);
});

test("a code task moves only after the person's go (its branch is pushed)", async () => {
  const { call, moved } = switchTool({ place: { kind: "repo", device: "local", repoPath: "/fake/dev/fakedb", branch: "ducter/x" } });
  const first = await call({ taskId: "t_trip", device: "Fake MacBook" });
  expect(first.ok).toBe(false);
  expect(first.error).toContain("pushes its branch");
  expect(moved).toEqual([]);
  expect((await call({ taskId: "t_trip", device: "Fake MacBook", confirmed: true })).ok).toBe(true);
  expect(moved).toHaveLength(1);
});

test("a computer as the partner names it: its name in any case, local for the home, one name it is part of", () => {
  expect(computerNamed(COMPS, "FAKE MACBOOK")?.id).toBe("w1");
  expect(computerNamed(COMPS, "local (Ducter's home)")?.id).toBe("local");
  expect(computerNamed(COMPS, "macbook")?.id).toBe("w1");
  expect(computerNamed(COMPS, "fake")).toBeUndefined(); // three could be it
});

test("moved over, it hears what it found there: the last report and its last words", () => {
  const s = movedOver("fake-server", "Fake MacBook", ["found the hotel"], false, { report: { state: "done", summary: "首选朗丽兹，步行 3–5 分钟。", questions: [] }, lastWords: "Done." });
  expect(s).toContain("Its last report (done): 首选朗丽兹");
  expect(s).toContain("The last thing it said: Done.");
  expect(s).toContain("Files you made there are not here");
});

// ---------- (2) the person's own sessions ----------

const NOW = Date.parse("2026-11-19T10:00:00Z");

function home() {
  const t = tempDir();
  stops.push(t.cleanup);
  const h = join(t.dir, "home");
  const repo = join(h, "dev", "fakedb");
  mkdirSync(repo, { recursive: true });
  writeSession(h, { agent: "claude-code", id: "fake0000-cc00-4000-8000-000000000001", cwd: repo, title: "compaction threshold", turns: [["make the L0 trigger configurable", "Done; tests next."]], startedAt: new Date(NOW - 3600_000), updatedAt: new Date(NOW - 30 * 60_000) });
  const codex = writeSession(h, { agent: "codex", id: "0fa0e000-0000-7000-8000-000000000002", cwd: repo, turns: [["fix the flaky test", "Working on it."]], startedAt: new Date(NOW - 600_000), updatedAt: new Date(NOW - 30_000) });
  utimesSync(codex, new Date(NOW - 30_000), new Date(NOW - 30_000));
  // Claude Code's running-process file for the first session (pid 4242 here, alive or not per test).
  const reg = join(h, ".claude", "sessions");
  mkdirSync(reg, { recursive: true });
  writeFileSync(join(reg, "4242.json"), JSON.stringify({ pid: 4242, sessionId: "fake0000-cc00-4000-8000-000000000001", cwd: repo, kind: "interactive", entrypoint: "cli", status: "idle" }));
  return { dir: t.dir, h, repo };
}

test("still open: Claude Code's own running-process file says so; a file written a moment ago may be (Codex)", () => {
  const { h } = home();
  const alive = createLocalAgents({ home: h, env: {}, uid: null, now: () => NOW, alive: (pid) => pid === 4242 });
  expect(alive.openNow("claude-code", "fake0000-cc00-4000-8000-000000000001")).toBe("running");
  expect(alive.openNow("codex", "0fa0e000-0000-7000-8000-000000000002")).toBe("recent");
  // The process ended (its file left behind): not open; the session was last written 30 min ago.
  const gone = createLocalAgents({ home: h, env: {}, uid: null, now: () => NOW, alive: () => false });
  expect(gone.openNow("claude-code", "fake0000-cc00-4000-8000-000000000001")).toBeUndefined();
});

test("carried on: never while open; once closed it opens with the person's words for its first turn", async () => {
  const { dir, h, repo } = home();
  let running = true;
  const reader = createLocalAgents({ home: h, env: {}, uid: null, now: () => NOW, alive: () => running });
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  const runner = { openTask: async (i: Parameters<Runner["openTask"]>[0]) => (opened.push(i), { taskId: "t_own" }) } as unknown as Runner;
  const log = { read: () => [], subscribe: () => () => {} } as never;
  const o = createOutside({ reader, dataDir: join(dir, "data"), log, tasks: { list: () => [] } as never, home: h, now: () => NOW, language: () => "zh", computer: () => "fake-home" });
  const a = await o.adopt(runner, "p1", "claude-code", "fake0000-cc00-4000-8000-000000000001", undefined, undefined, { ask: "把测试补上" });
  expect(a).toMatchObject({ ok: false, open: "running" });
  expect(a.message).toBe("它还在 Claude Code 里开着。先在那边退出（/exit），再在这里接着做。");
  running = false;
  const b = await o.adopt(runner, "p1", "claude-code", "fake0000-cc00-4000-8000-000000000001", undefined, undefined, { ask: "把测试补上" });
  expect(b).toMatchObject({ ok: true, taskId: "t_own" });
  expect(opened[0]).toMatchObject({ place: { kind: "folder", path: repo }, harness: "claude-code" });
  expect(opened[0]!.adopt).toMatchObject({ sessionId: "fake0000-cc00-4000-8000-000000000001", ask: "把测试补上" });
  // Written 30 s ago: refused once; asked again (said closed, or a second tap in Past tasks) it goes.
  expect(await o.adopt(runner, "p1", "codex", "0fa0e000-0000-7000-8000-000000000002")).toMatchObject({ ok: false, open: "recent" });
  expect(await o.adopt(runner, "p1", "codex", "0fa0e000-0000-7000-8000-000000000002")).toMatchObject({ ok: true });
  // The first look is said once, kept across a restart.
  expect(o.firstLook()).toBe(true);
  expect(o.firstLook()).toBe(false);
  const again = createOutside({ reader, dataDir: join(dir, "data"), log, tasks: { list: () => [] } as never, home: h });
  expect(again.firstLook()).toBe(false);
  expect(o.computer()).toBe("fake-home");
});
