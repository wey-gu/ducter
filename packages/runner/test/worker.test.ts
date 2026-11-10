// Task placement on a worker, in process: the main's runner talks to a worker host through a
// fake WorkerLink (the socket in production is core/src/workers.ts ↔ cli/src/worker.ts).
// OAR's scripted runtime stands in for the model. No network, no real harness.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import type { WorkerLink, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import { DEVICE_BACK, createOarHarnessPort, createRunner, createWorkerHost, registerTaskTools, rewriteMcp, unreachableReason } from "../src/index.ts";
import { asleepReason } from "../src/runner.ts";
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
function fakeWorker(turn: (t: ScriptedTurn) => void | Promise<void>, seen: { options: any[] }, hostOpts: Partial<Parameters<typeof createWorkerHost>[0]> = {}) {
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
      ...hostOpts,
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
  // D157: a new task for it isn't refused: it waits there, and starts when it's back.
  ids.push("tsk00009");
  const waiting = await runner.openTask({ persona: "p1", title: "x", brief: "y", place: { kind: "none", device: "vps-2" } });
  expect(core.tasks.get(waiting.taskId)).toMatchObject({ attention: "blocked", residency: "offline", reason: unreachableReason("vps-2") });

  w.back();
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done after resume");
  await waitFor(() => core.tasks.get(waiting.taskId)?.attention === "working", "the waiting task started when vps-2 came back");
  expect(seen.options.some((o) => o.resume === sid)).toBe(true); // the same native session, resumed on the worker
  expect(states(card.taskId)).toContain("blocked/offline");
  release();
  await runner.dispose();
});

test("a worker can't answer plan with a browser place (that would start cua-driver on the main)", async () => {
  const w = fakeWorker(() => {}, { options: [] });
  const call = w.link.call.bind(w.link);
  const lying = { ...w.link, call: (op: string, args: any) => (op === "plan" ? Promise.resolve({ place: { kind: "browser", profile: "x" }, cwd: "/tmp" }) : call(op, args)) } as WorkerLink;
  core.workers = { link: (d) => (d === "vps-2" ? lying : undefined), list: () => [] };
  let sidecar = false;
  const runner = createRunner(core, { browser: { env: { DUCTER_BROWSER: "1" }, which: () => ((sidecar = true), null) } });
  await expect(runner.openTask({ persona: "p1", title: "x", brief: "y", place: { kind: "none", device: "vps-2" } })).rejects.toThrow("different kind of place");
  expect(sidecar).toBe(false);
  await runner.dispose();
});

test("D157: a browser place on a worker Mac runs there, in the user's Chrome through the agent's own tools; the main reads its tool events", async () => {
  const seen = { options: [] as any[] };
  const w = fakeWorker(
    async (t) => {
      await t.tool("mcp__claude-in-chrome__navigate", JSON.stringify({ url: "https://www.taobao.com/orders" }), () => "ok");
      await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "Order is on its way" }, "tskbrw01"));
    },
    seen,
    // The worker's own probes: Claude in Chrome connected there (never the main's).
    { browser: { env: {}, nativeProbe: async (h: string) => (h === "claude-code" ? "claude-in-chrome" : undefined) } },
  );
  core.workers = { link: (d) => (d === "vps-2" ? w.link : undefined), list: () => [] };
  let mainProbed = false;
  const runner = createRunner(core, { newId: () => "tskbrw01", browser: { env: {}, nativeProbe: async () => ((mainProbed = true), undefined) } });
  const card = await runner.openTask({ persona: "p1", title: "Where is my order", brief: "check taobao", place: { kind: "browser", device: "vps-2", profile: "default" }, harness: "claude-code" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
  expect(mainProbed).toBe(false); // the browser is the worker's
  const opts = seen.options[0];
  expect(String(opts.appendSystemPrompt ?? opts.systemPromptAppend ?? JSON.stringify(opts))).toContain("This is the user's own browser");
  const evs = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]);
  expect(evs.some((e) => /Looking at taobao\.com/.test(e.text ?? ""))).toBe(true);
  await runner.dispose();
});

test("D157: the pick's computer becomes the place's: needs browse on the MacBook makes a browser place there, logged with why", async () => {
  const seen = { options: [] as any[] };
  const w = fakeWorker(
    async (t) => {
      await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "ok" }, "tskwhere1"));
    },
    seen,
    { browser: { env: {}, nativeProbe: async () => "claude-in-chrome" } },
  );
  core.workers = { link: (d) => (d === "MacBook" ? w.link : undefined), list: () => [] };
  const asked: any[] = [];
  core.bodies = {
    choose: async (work) => (asked.push(work), { harness: "claude-code", why: { kind: "default", where: { device: "MacBook", kind: "signed_in", site: "taobao.com", uses: "chrome" } }, device: "MacBook", deviceId: "w1", uses: "chrome" }),
  };
  const runner = createRunner(core, { newId: () => "tskwhere1" });
  const card = await runner.openTask({ persona: "p1", title: "淘宝订单", brief: "看看到哪了", needs: { signedIn: true, site: "taobao.com" } });
  expect(asked[0].needs).toEqual({ signedIn: true, site: "taobao.com" });
  expect(card.place).toEqual({ kind: "browser", device: "MacBook", profile: "default" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
  const open = core.events.find((e) => e.kind === "task_open")!.body as Bodies["task_open"];
  expect(open.needs).toEqual({ signedIn: true, site: "taobao.com" });
  const sel = core.events.find((e) => e.kind === "body_selected")!.body as Bodies["body_selected"];
  expect(sel.why.where).toMatchObject({ device: "MacBook", kind: "signed_in" });
  await runner.dispose();
});

test("D157: the best computer is asleep: the task waits for it, one ask offers now elsewhere; Go moves it there and starts", async () => {
  const w = fakeWorker(() => {}, { options: [] });
  await w.drop(); // the MacBook's lid is closed
  core.workers = { link: (d) => (d === "MacBook" || d === "w1" ? w.link : undefined), list: () => [{ id: "w1", name: "MacBook", online: false, asleep: true }] };
  const now = { device: "local", deviceId: "local", name: "hel", harness: "claude-code" };
  core.bodies = {
    choose: async () => ({ harness: "claude-code", why: { kind: "default", where: { device: "MacBook", kind: "awake" as const } }, device: "MacBook", deviceId: "w1", waits: "asleep" as const, now }),
  };
  const port = createOarHarnessPort({
    loadRuntime: async () => scriptedRuntime({ id: "claude", turn: async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "done on hel" }, "tskwait01"))) }),
  });
  const runner = createRunner(core, { harness: port, newId: () => "tskwait01" });
  const card = await runner.openTask({ persona: "p1", title: "英译周报", brief: "translate", language: "zh" });
  expect(core.tasks.get(card.taskId)).toMatchObject({ attention: "blocked", residency: "offline", reason: asleepReason(w.link.name) });
  const ask = core.events.find((e) => e.kind === "report")!.body as Bodies["report"];
  expect(ask.questions[0]).toMatchObject({ id: "where", blocking: true, reversible: false, where: { kind: "asleep", device: "MacBook", other: "hel", state: "asleep" } });
  expect(ask.questions[0]!.text).toBe("MacBook 睡着了。等它醒了做，还是现在在 hel 上做？");
  // Core turns the report into a card; the user says Go (现在在 hel 上做).
  core.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d_where", taskId: card.taskId, question: ask.questions[0]!.text, goLabel: "now", defaultOption: "hold", reversible: false, where: ask.questions[0]!.where } });
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_where", option: "go", by: "user" } });
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done on hel");
  const sel = core.events.filter((e) => e.kind === "body_selected").at(-1)!.body as Bodies["body_selected"];
  expect(sel.why).toMatchObject({ kind: "you", where: { device: "hel", kind: "you" } });
  const opens = core.events.filter((e) => e.kind === "task_open").map((e) => (e.body as Bodies["task_open"]).place);
  expect(opens.at(-1)).toMatchObject({ kind: "none" });
  expect((opens.at(-1) as { device?: string }).device).toBe("local");
  await runner.dispose();
});

test("D157: wait for it (the default): the task keeps waiting and starts there when the computer wakes", async () => {
  const w = fakeWorker(async (t) => void (await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "made the deck" }, "tskwait02"))), { options: [] });
  await w.drop();
  core.workers = { link: (d) => (d === "MacBook" ? w.link : undefined), list: () => [] };
  core.bodies = { choose: async () => ({ harness: "claude-code", why: { kind: "default" }, device: "MacBook", deviceId: "w1", waits: "asleep" as const }) };
  const runner = createRunner(core, { newId: () => "tskwait02" });
  const card = await runner.openTask({ persona: "p1", title: "Keynote", brief: "make the deck", needs: { app: "Keynote" } });
  expect(core.tasks.get(card.taskId)?.reason).toBe(asleepReason(w.link.name));
  expect(core.events.some((e) => e.kind === "report")).toBe(false); // nobody else could: no question, it just waits
  w.back();
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "started when the MacBook woke");
  await runner.dispose();
});

test("D157 (E3): the user moves a running task to another computer: it carries on there from its saved progress", async () => {
  const inputs: string[] = [];
  const w = fakeWorker(async (t) => {
    inputs.push(t.input);
    await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "finished on vps-2" }, "tskmove01"));
  }, { options: [] });
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  const port = createOarHarnessPort({
    loadRuntime: async () =>
      scriptedRuntime({
        id: "claude",
        turn: async (t) => {
          await t.tool("mcp__ducter__checkpoint", "{}", () => core.call("checkpoint", { text: "outlined the translation" }, "tskmove01"));
          await Promise.race([hold, new Promise((r) => t.signal.addEventListener("abort", r))]);
        },
      }),
  });
  const runner = createRunner(core, { harness: port, newId: () => "tskmove01" });
  const card = await runner.openTask({ persona: "p1", title: "英译", brief: "translate the doc" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "working", "working here");
  const r = await runner.moveTask!(card.taskId, { device: "vps-2", name: "vps-2", homeName: "hel" });
  expect(r).toEqual({ ok: true });
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done on vps-2");
  expect(inputs[0]).toContain("The user moved this task from hel to vps-2");
  const open = core.events.filter((e) => e.kind === "task_open").at(-1)!.body as Bodies["task_open"];
  expect(open.place).toMatchObject({ kind: "none", device: "vps-2" });
  const sel = core.events.filter((e) => e.kind === "body_selected").at(-1)!.body as Bodies["body_selected"];
  expect(sel.why).toMatchObject({ kind: "you", where: { device: "vps-2", kind: "you" } });
  release();
  await runner.dispose();
});

test("D157: a folder never moves; a computer that can't be reached isn't a target", async () => {
  const w = fakeWorker(() => {}, { options: [] });
  await w.drop();
  core.workers = { link: (d) => (d === "vps-2" ? w.link : undefined), list: () => [] };
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: async (t) => t.say("ok") }) });
  const runner = createRunner(core, { harness: port, newId: () => "tskmove02" });
  const folder = join(dir, "notes");
  mkdirSync(folder, { recursive: true });
  const card = await runner.openTask({ persona: "p1", title: "整理笔记", brief: "tidy", place: { kind: "folder", device: "local", path: folder } });
  await runner.whenStarted(card.taskId);
  expect((await runner.moveTask!(card.taskId, { device: "vps-2", name: "vps-2" })).message).toMatch(/can't move/);
  await runner.dispose();
});

test("D157: a worker without a browser says why, in words the partner can pass on", async () => {
  const w = fakeWorker(() => {}, { options: [] }, { browser: { env: { DUCTER_BROWSER: "0" } } });
  core.workers = { link: (d) => (d === "vps-2" ? w.link : undefined), list: () => [] };
  const runner = createRunner(core, { newId: () => "tskbrw02" });
  await expect(runner.openTask({ persona: "p1", title: "x", brief: "y", place: { kind: "browser", device: "vps-2", profile: "default" } })).rejects.toThrow(/browser tasks are turned off on this device/);
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
