// Task placement on a worker, in process: the main's runner talks to a worker host through a
// fake WorkerLink (the socket in production is core/src/workers.ts ↔ cli/src/worker.ts).
// OAR's scripted runtime stands in for the model. No network, no real harness.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import type { WorkerLink, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import { DEVICE_BACK, createOarHarnessPort, createRunner, createWorkerHost, registerTaskTools, rewriteMcp, unreachableReason } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-worker-test-"));
  core = createFakeCore(join(dir, "main"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A worker host behind a fake link that can drop and come back like a socket. */
function fakeWorker(turn: (t: ScriptedTurn) => void | Promise<void>, seen: { options: any[] }) {
  let online = true;
  let nextId = 0;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  const sessions = new Map<string, (f: WorkerSessionFrame) => void>();
  const onOnline = new Set<() => void>();
  const rt = scriptedRuntime({ id: "claude", turn });
  const harness = createOarHarnessPort({
    loadRuntime: async () =>
      new Proxy(rt, {
        get(target, prop, recv) {
          if (prop === "session") return (inst: any, options: any, ctx: any) => (seen.options.push(options), target.session(inst, options, ctx));
          return Reflect.get(target, prop, recv);
        },
      }),
  });
  let host = makeHost();
  function makeHost() {
    return createWorkerHost({
      dataDir: join(dir, "worker"),
      harness,
      mainBase: "https://ducter.example.com",
      deviceToken: "dvc.worker.token",
      send(f: any) {
        if (!online) return;
        if (f.t === "res") {
          const p = pending.get(f.id);
          pending.delete(f.id);
          f.ok ? p?.resolve(f.result) : p?.reject(new Error(f.error));
        } else {
          sessions.get(f.key)?.(f);
          if (f.t === "end") sessions.delete(f.key);
        }
      },
    });
  }
  const link: WorkerLink = {
    id: "w1",
    name: "vps-2",
    online: () => online,
    call(op, args) {
      if (!online) return Promise.reject(Object.assign(new Error("vps-2 is not connected"), { offline: true }));
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as any, reject });
        void host.handle({ t: "req", id, op, args });
      });
    },
    onSession(key, fn) {
      sessions.set(key, fn);
      return () => sessions.delete(key);
    },
    onOnline(fn) {
      onOnline.add(fn);
      return () => onOnline.delete(fn);
    },
  };
  return {
    link,
    host: () => host,
    async drop() {
      online = false;
      for (const [id, p] of pending) p.reject(Object.assign(new Error("gone"), { offline: true })), pending.delete(id);
      for (const [key, fn] of [...sessions]) sessions.delete(key), fn({ t: "end", key, offline: true });
      await host.closeAll();
    },
    back() {
      online = true;
      host = makeHost(); // a restarted worker process: no sessions in memory
      for (const fn of onOnline) fn();
    },
  };
}

const states = (id: string) => core.states(id);

test("a task placed on a worker runs there: worker cwd, MCP pointed at the main with the device token, report lands on the main", async () => {
  const seen = { options: [] as any[] };
  const w = fakeWorker(async (t) => {
    t.say("On the worker.");
    await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "Ran on vps-2" }, "tsk00001"));
  }, seen);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  const ids = ["tsk00001"];
  const runner = createRunner(core, { newId: () => ids.shift()! });
  const card = await runner.openTask({ persona: "p1", title: "Check disk", brief: "df -h", place: { kind: "none", device: "vps-2" } });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");

  const opts = seen.options[0];
  expect(opts.cwd).toBe(join(dir, "worker", "scratch", card.taskId)); // planned on the worker's disk
  const mcp = opts.mcpServers.find((m: any) => m.name === "ducter");
  expect(mcp.url).toBe("https://ducter.example.com/mcp");
  expect(mcp.headers["X-Ducter-Device"]).toBe("dvc.worker.token");
  expect(mcp.headers.authorization ?? mcp.headers.Authorization).toBeDefined(); // the task's role token stays
  const evs = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]);
  expect(evs.some((e) => e.role === "assistant" && e.text === "On the worker.")).toBe(true);
  const started = evs.find((e) => e.text === "session started")!;
  expect(started.raw).toMatchObject({ cwd: opts.cwd, device: "w1" });
  await runner.dispose();
});

test("the worker drops mid-task: offline at once, waiting with a reason after the grace, resumed by session id when it's back", async () => {
  const seen = { options: [] as any[] };
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  const w = fakeWorker(async (t) => {
    if (t.input.includes(DEVICE_BACK)) {
      await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "Finished after the reconnect" }, "tsk00002"));
      return;
    }
    await t.tool("Bash", JSON.stringify({ command: "make" }), () => "building");
    await Promise.race([hold, new Promise((r) => t.signal.addEventListener("abort", r))]);
  }, seen);
  core.workers = { link: (d) => (d === "vps-2" ? w.link : undefined), list: () => [] };
  const ids = ["tsk00002"];
  const runner = createRunner(core, { newId: () => ids.shift()!, offlineGraceMs: 30 });
  const card = await runner.openTask({ persona: "p1", title: "Long build", brief: "make", place: { kind: "none", device: "vps-2" } });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.events.some((e) => e.kind === "task_event" && (e.body as any).tool?.name === "Bash"), "working");
  const sid = runner.sessionId(card.taskId)!;
  expect(sid).toBeTruthy();

  await w.drop();
  await waitFor(() => core.tasks.get(card.taskId)?.residency === "offline", "offline");
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "blocked", "blocked after grace");
  expect(core.tasks.get(card.taskId)?.reason).toBe(unreachableReason("vps-2"));
  await expect(runner.send(card.taskId, "also check logs")).rejects.toThrow("vps-2 is not connected");
  await expect(runner.openTask({ persona: "p1", title: "x", brief: "y", place: { kind: "none", device: "vps-2" } })).rejects.toThrow("vps-2 is not connected");

  w.back();
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done after resume");
  expect(seen.options.at(-1).resume).toBe(sid); // the same native session, resumed on the worker
  expect(states(card.taskId)).toContain("blocked/offline");
  release();
  await runner.dispose();
});

test("an unknown device name means this machine (as before workers)", async () => {
  core.workers = { link: () => undefined, list: () => [] };
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: async (t) => t.say("local") }) });
  const runner = createRunner(core, { harness: port, newId: () => "tsk00003" });
  const card = await runner.openTask({ persona: "p1", title: "t", brief: "b", place: { kind: "none", device: "mac" } as any });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.events.some((e) => e.kind === "task_event" && (e.body as any).text === "local"), "ran locally");
  await runner.dispose();
});

test("rewriteMcp only touches the main's loopback MCP", () => {
  const spec = {
    harness: "claude-code" as const,
    cwd: "/w",
    permissionMode: "bypass" as const,
    mcp: [
      { name: "ducter", url: "http://127.0.0.1:7777/mcp", headers: { Authorization: "Bearer dtk.x.y" } },
      { name: "other", url: "https://mcp.example.com/x", headers: {} },
      { name: "browser", command: "cua-driver", args: ["mcp"] },
    ],
  };
  const out = rewriteMcp(spec, "https://d.example.com/", "dvc.a.b");
  expect(out.mcp[0]).toEqual({ name: "ducter", url: "https://d.example.com/mcp", headers: { Authorization: "Bearer dtk.x.y", "X-Ducter-Device": "dvc.a.b" } });
  expect(out.mcp[1]).toEqual(spec.mcp[1]);
  expect(out.mcp[2]).toEqual(spec.mcp[2]);
});
