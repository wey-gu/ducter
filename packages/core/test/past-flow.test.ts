// D285: 做过的事 / Past tasks through the home's socket: find, mark (told to every window, and
// the task's title follows), continue (the same task, resumed; another agent; words first), and a
// new task carrying what an earlier one found.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, PastItem, ServerFrame, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot() {
  const t = tempDir();
  const harnesses = async () => [
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: true },
  ];
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses, kind: async () => "laptop" } });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const calls: string[] = [];
  const opened: Parameters<Runner["openTask"]>[0][] = [];
  let n = 0;
  const r = {
    harness: { start: async () => ({}) as any, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      opened.push(input);
      const taskId = `new${++n}`;
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "claude-code", brief: input.brief, ...(input.from ? { from: input.from } : {}), ...(input.origin ? { origin: input.origin } : {}) } });
      return core.tasks.get(taskId)!;
    },
    async send(taskId: string, text: string, mode?: string, from?: string) {
      calls.push(`send ${taskId} ${from} ${mode ?? "-"} ${text}`);
      core.tasks.setState(taskId, "working", "hot");
      return { delivered: "prompted" as const };
    },
    async reopen(taskId: string) {
      calls.push(`reopen ${taskId}`);
      core.tasks.setState(taskId, "working", "hot");
      return { delivered: "prompted" as const };
    },
    async switchHarness(taskId: string, harness: string) {
      calls.push(`switch ${taskId} ${harness}`);
      core.log.append({ stream: `task:${taskId}`, origin: "user", kind: "body_selected", body: { taskId, harness, why: { kind: "you" } } });
      return { ok: true };
    },
    interrupt: async () => {},
    drop: async () => {},
    branchChanges: async () => undefined,
  };
  core.setRunner(r as unknown as Runner);
  return { core, calls, opened, dir: t.dir };
}

async function finished(core: Core, id: string, title: string, report: string, attention: "done" | "dropped" = "done") {
  const st = `task:${id}`;
  core.log.append({ stream: st, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "hawdb", place: { kind: "repo", device: "local", repoPath: "/src/hawdb", branch: `ducter/${id}`, baseBranch: "main" }, harness: "claude-code", brief: title } });
  if (attention === "done") core.log.append({ stream: st, origin: "task", kind: "report", body: { taskId: id, state: "done", summary: report, questions: [], evidence: [] } as Bodies["report"] });
  await Bun.sleep(20);
  core.tasks.setState(id, attention, "archived");
}

async function client(core: Core) {
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
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

test("find, then mark: every window hears it, the title follows, and it survives a restart", async () => {
  const { core, dir } = boot();
  await finished(core, "flaky", "Why does TestRaftSnapshot fail", "The snapshot timer races the leader step-down.");
  const a = await client(core);
  const b = await client(core);
  a.send({ t: "past", id: "q1", query: { q: "step-down" } });
  const r = await a.until<Extract<ServerFrame, { t: "past_result" }>>((f) => f.t === "past_result" && f.id === "q1");
  expect(r.items.map((i: PastItem) => i.taskId)).toEqual(["flaky"]);
  expect(r.items[0]!.hit?.field).toBe("report");
  b.frames.length = 0;
  a.send({ t: "past_mark", taskId: "flaky", patch: { name: "Raft 快照的坑", starred: true, tags: ["raft"] } });
  const m = await b.until<Extract<ServerFrame, { t: "past_marked" }>>((f) => f.t === "past_marked");
  expect(m.mark).toMatchObject({ name: "Raft 快照的坑", starred: true, tags: ["raft"] });
  const oh = await b.until<Extract<ServerFrame, { t: "on_hand" }>>((f) => f.t === "on_hand" && f.onHand.tasks.some((t) => t.title === "Raft 快照的坑"));
  expect(oh.onHand.tasks.find((t) => t.taskId === "flaky")!.original).toBe("Why does TestRaftSnapshot fail");
  await core.stop();
  const again = startCore({ dataDir: dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [], kind: async () => "laptop" } });
  stops.push(() => again.stop());
  expect(again.tasks.get("flaky")!.title).toBe("Raft 快照的坑");
});

test("continue: the same task resumes; with words they go first; another agent takes over; a dropped one comes back", async () => {
  const { core, calls } = boot();
  await finished(core, "t1", "Refactor the scheduler", "Moved the picker.");
  await finished(core, "t2", "Refactor the WAL", "Split the writer.");
  await finished(core, "t3", "Try a Rust log", "Gave up.", "dropped");
  const c = await client(core);
  c.send({ t: "past_continue", taskId: "t1" });
  expect(await c.until((f) => f.t === "action_result" && f.taskId === "t1")).toMatchObject({ action: "continue", ok: true });
  c.send({ t: "past_continue", taskId: "t2", words: "also split the reader" });
  await c.until((f) => f.t === "action_result" && f.taskId === "t2");
  c.send({ t: "past_continue", taskId: "t3", words: "one more try" });
  await c.until((f) => f.t === "action_result" && f.taskId === "t3");
  expect(calls).toEqual(["reopen t1", "send t2 user - also split the reader", "reopen t3", "send t3 user queue one more try"]);
  // The partner hears of it, quietly.
  const notes = core.log.read({ stream: "channel", kinds: ["job_status"] }).map((e) => (e.body as Bodies["job_status"]).text);
  expect(notes.filter((x) => x?.includes("from Past tasks")).length).toBe(3);
  // A task still on hand: nothing to resume, it just opens.
  calls.length = 0;
  c.send({ t: "past_continue", taskId: "t1" });
  await c.until((f) => f.t === "action_result" && f.taskId === "t1" && c.frames.filter((x) => x.t === "action_result" && x.taskId === "t1").length === 2);
  expect(calls).toEqual([]);
});

test("a new task from an earlier one: its brief carries the findings, its card links back", async () => {
  const { core, opened } = boot();
  await finished(core, "flaky", "Why does TestRaftSnapshot fail", "The snapshot timer races the leader step-down; fixed with a fence.");
  const c = await client(core);
  c.send({ t: "task_new", words: "Add the same fence to the WAL snapshot", from: "flaky" });
  const res = await c.until<Extract<ServerFrame, { t: "task_new_result" }>>((f) => f.t === "task_new_result");
  expect(res.ok).toBe(true);
  expect(opened[0]!.title).toBe("Add the same fence to the WAL snapshot");
  expect(opened[0]!.brief).toContain("The snapshot timer races the leader step-down");
  expect(opened[0]!.from).toBe("flaky");
  expect(core.tasks.get("new1")!.from).toEqual({ taskId: "flaky", title: "Why does TestRaftSnapshot fail" });
  // An unknown task to seed from: the words alone.
  c.send({ t: "task_new", words: "Plain words", from: "nope", clientId: "x2" });
  await c.until((f) => f.t === "task_new_result" && f.clientId === "x2");
  expect(opened[1]!.brief).toBe("Plain words");
});
