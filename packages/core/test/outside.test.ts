// D299: 也在这台电脑上 / Also on this computer. The sessions the person ran by hand in their own
// agents, beside Ducter's tasks in Past tasks: found by the same words, never Ducter's own, one
// agent hidden for good, and carried on as a task (the same agent resumes the session in its own
// folder; another agent takes over there), through the home's socket.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OutsideItem, ServerFrame, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore } from "../src/core.ts";
import { createLocalAgents } from "../src/local-agents/index.ts";
import { writeSession } from "./fixtures-agents.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const NOW = Date.now();
const ago = (days: number, h = 0) => new Date(NOW - days * 24 * 3600_000 - h * 3600_000);

function boot() {
  const t = tempDir();
  const home = join(t.dir, "home");
  const data = join(t.dir, "data");
  const hawdb = join(home, "src", "hawdb");
  const mem = join(home, "src", "mem");
  // A worktree another agent workbench made: its project is the repo's, not the place's name.
  const wt = join(home, "workbench", "hawdb", "kyoto");
  for (const d of [hawdb, mem, wt, join(hawdb, ".git", "worktrees", "kyoto")]) mkdirSync(d, { recursive: true });
  writeFileSync(join(wt, ".git"), `gitdir: ${join(hawdb, ".git", "worktrees", "kyoto")}\n`);
  const files = {
    flaky: writeSession(home, { agent: "claude-code", id: "942ecde2-b387-45c2-bbc6-75da83748a7f", cwd: hawdb, branch: "fix/raft-snapshot", model: "claude-opus-5", title: "Raft snapshot race", turns: [["Why is TestRaftSnapshot flaky?", "The snapshot timer races the leader step-down."], ["Add a fence and a test", "Added the fence; 200 runs pass."]], startedAt: ago(5, 2), updatedAt: ago(5) }),
    build: writeSession(home, { agent: "codex", id: "01a1e522-a9c6-7d53-9d33-0dfcdf329f76", cwd: wt, branch: "perf/lto", model: "gpt-5.5", turns: [["Find out why the build is slow", "Linking takes 70% of it; thin LTO halves it."]], startedAt: ago(1, 3), updatedAt: ago(1) }),
    notes: writeSession(home, { agent: "pi", id: "01a1e523-706a-722e-8264-627a362842f1", cwd: mem, title: "Release notes", turns: [["Write the release notes for 0.9", "Drafted them in CHANGELOG.md."]], startedAt: ago(9, 1), updatedAt: ago(9) }),
    gone: writeSession(home, { agent: "claude-code", id: "0d0d0d0d-0000-4000-8000-00000000dead", cwd: join(home, "src", "old-thing"), turns: [["Try the old parser", "Done."]], startedAt: ago(30, 1), updatedAt: ago(30) }),
    // Ducter's own: a task's session (its id is in the Log) and one in Ducter's data folder.
    ducter: writeSession(home, { agent: "claude-code", id: "dddddddd-0000-4000-8000-000000000001", cwd: hawdb, turns: [["<brief>Fix CI</brief>", "ok"], ["Start the task", "ok"]], startedAt: ago(2, 1), updatedAt: ago(2) }),
    partner: writeSession(home, { agent: "claude-code", id: "dddddddd-0000-4000-8000-000000000002", cwd: join(data, "partner"), turns: [["hi", "hello"]], startedAt: ago(2, 1), updatedAt: ago(2) }),
  };
  mkdirSync(join(data, "partner"), { recursive: true });
  const core = startCore({ dataDir: data, port: 0, batchMs: 5, localAgents: createLocalAgents({ home, env: {} }), deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [], kind: async () => "laptop" } });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.log.append({ stream: "task:tsk1", origin: "task", kind: "task_event", body: { taskId: "tsk1", role: "system", from: "runner", text: "session started", raw: { sessionId: "dddddddd-0000-4000-8000-000000000001", harness: "claude-code" } } });
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  let n = 0;
  const r = {
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      opened.push(input);
      const taskId = `new${++n}`;
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "claude-code", brief: input.brief, ...(input.adopt ? { outside: { agent: input.adopt.agent, sessionId: input.adopt.sessionId, startedAt: input.adopt.startedAt } } : {}) } });
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  };
  core.setRunner(r as unknown as Runner);
  return { core, opened, files, home, data, hawdb, wt };
}

async function client(core: ReturnType<typeof boot>["core"]) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 3000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  let q = 0;
  const past = async (query: object) => {
    const id = `q${++q}`;
    ws.send(JSON.stringify({ t: "past", id, query }));
    return until<Extract<ServerFrame, { t: "past_result" }>>((f) => f.t === "past_result" && f.id === id);
  };
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames, past };
}

type Past = Extract<ServerFrame, { t: "past_result" }>;
const ids = (r: Past) => (r.outside ?? []).map((x: OutsideItem) => x.id.slice(0, 8));

test("listed beside the tasks, newest first; never Ducter's own; the folder's project, the picture from its words", async () => {
  const { core, files } = boot();
  const sizes = Object.values(files).map((f) => statSync(f).mtimeMs);
  const c = await client(core);
  const r = await c.past({});
  expect(ids(r)).toEqual(["01a1e522", "942ecde2", "01a1e523", "0d0d0d0d"]);
  const [build, flaky, notes, gone] = r.outside!;
  expect(build).toMatchObject({ agent: "codex", title: "Find out why the build is slow", project: "hawdb", branch: "perf/lto", kind: "look" });
  expect(build!.cwd.startsWith("~/workbench/hawdb/kyoto") || build!.cwd.includes("workbench/hawdb/kyoto")).toBe(true);
  expect(flaky).toMatchObject({ agent: "claude-code", title: "Raft snapshot race", ask: "Why is TestRaftSnapshot flaky?", kind: "fix" });
  expect(notes).toMatchObject({ agent: "pi", title: "Release notes", project: "mem", kind: "ship" });
  expect(gone!.gone).toBe(true);
  expect(r.sources).toEqual([
    { agent: "claude-code", n: 2, hidden: false },
    { agent: "codex", n: 1, hidden: false },
    { agent: "pi", n: 1, hidden: false },
  ]);
  // Read, never written.
  expect(Object.values(files).map((f) => statSync(f).mtimeMs)).toEqual(sizes);
});

test("found by the same words and filters as a task: what was said, a branch, a day, an agent, a project", async () => {
  const { core } = boot();
  const c = await client(core);
  const said = await c.past({ q: "leader step-down" });
  expect(ids(said)).toEqual([]); // the agent's words aren't read for a listing; the person's are
  const fence = await c.past({ q: "fence" });
  expect(ids(fence)).toEqual(["942ecde2"]);
  expect(fence.outside![0]!.hit).toEqual({ field: "words", text: "Add a fence and a test" });
  expect(ids(await c.past({ q: "lto" }))).toEqual(["01a1e522"]);
  expect(ids(await c.past({ q: "build slow" }))).toEqual(["01a1e522"]);
  expect(ids(await c.past({ q: "昨天" }))).toEqual(["01a1e522"]);
  expect(ids(await c.past({ harness: "pi" }))).toEqual(["01a1e523"]);
  expect(ids(await c.past({ project: "hawdb" }))).toEqual(["01a1e522", "942ecde2"]);
  expect(ids(await c.past({ starred: true }))).toEqual([]);
});

test("one agent hidden for good: every window told, kept across a restart, shown again on a tap", async () => {
  const { core, data } = boot();
  const a = await client(core);
  const b = await client(core);
  a.send({ t: "outside_hide", agent: "claude-code", hidden: true });
  await b.until((f) => f.t === "outside_hidden" && f.agent === "claude-code" && f.hidden === true);
  const r = await a.past({});
  expect(ids(r)).toEqual(["01a1e522", "01a1e523"]);
  expect(r.sources!.find((s) => s.agent === "claude-code")).toEqual({ agent: "claude-code", n: 2, hidden: true });
  expect(JSON.parse(readFileSync(join(data, "outside.json"), "utf8")).hidden).toEqual(["claude-code"]);
  a.send({ t: "outside_hide", agent: "claude-code", hidden: false });
  await a.until((f) => f.t === "outside_hidden" && f.hidden === false);
  expect(ids(await a.past({}))).toHaveLength(4);
});

test("continue: the same agent resumes it in a task in its own folder; again opens that task; another agent takes over", async () => {
  const { core, opened, hawdb, wt } = boot();
  const c = await client(core);
  c.send({ t: "outside_continue", agent: "claude-code", id: "942ecde2-b387-45c2-bbc6-75da83748a7f" });
  const done = await c.until<Extract<ServerFrame, { t: "outside_adopted" }>>((f) => f.t === "outside_adopted");
  expect(done).toMatchObject({ ok: true, taskId: "new1", agent: "claude-code" });
  expect(opened[0]).toMatchObject({ title: "Raft snapshot race", harness: "claude-code", model: "claude-opus-5", project: "hawdb", origin: "you", place: { kind: "folder", device: "local", path: hawdb } });
  expect(opened[0]!.adopt).toMatchObject({ agent: "claude-code", sessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f" });
  expect(opened[0]!.adopt!.turns.map((x) => x.role)).toEqual(["user", "assistant", "user", "assistant"]);
  expect(opened[0]!.brief).toBe("Why is TestRaftSnapshot flaky?");
  // Now a task: it leaves the outside list, and its Past card says where it came from.
  const r = await c.past({});
  expect(ids(r)).not.toContain("942ecde2");
  // (the fake runner opened no session, so the Log has no id yet: the card is the registry's)
  expect(core.tasks.get("new1")!.outside).toMatchObject({ agent: "claude-code", sessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f" });
  // Again: that task opens, nothing new.
  c.frames.length = 0;
  c.send({ t: "outside_continue", agent: "claude-code", id: "942ecde2-b387-45c2-bbc6-75da83748a7f" });
  expect(await c.until((f) => f.t === "outside_adopted")).toMatchObject({ ok: true, taskId: "new1" });
  expect(opened).toHaveLength(1);
  // Another agent: Claude Code takes over the Codex session, in the worktree it ran in.
  c.send({ t: "outside_continue", agent: "codex", id: "01a1e522-a9c6-7d53-9d33-0dfcdf329f76", harness: "claude-code" });
  await c.until((f) => f.t === "outside_adopted" && f.agent === "codex");
  expect(opened[1]).toMatchObject({ harness: "claude-code", place: { kind: "folder", path: wt } });
  expect(opened[1]!.model).toBeUndefined();
  expect(opened[1]!.brief).toBe("Find out why the build is slow");
});

test("a session whose folder is gone, or that isn't there, says why and opens nothing", async () => {
  const { core, opened, files } = boot();
  const c = await client(core);
  c.send({ t: "outside_continue", agent: "claude-code", id: "0d0d0d0d-0000-4000-8000-00000000dead" });
  const a = await c.until<Extract<ServerFrame, { t: "outside_adopted" }>>((f) => f.t === "outside_adopted");
  expect(a.ok).toBe(false);
  expect(a.message).toContain("isn't there any more");
  rmSync(files.notes);
  c.send({ t: "outside_continue", agent: "pi", id: "01a1e523-706a-722e-8264-627a362842f1" });
  const b = await c.until<Extract<ServerFrame, { t: "outside_adopted" }>>((f) => f.t === "outside_adopted" && f.agent === "pi");
  expect(b).toMatchObject({ ok: false, message: "I can't find that session any more." });
  expect(opened).toHaveLength(0);
});
