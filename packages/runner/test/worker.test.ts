// Task placement on a worker, in process: the main's runner talks to a worker host through a
// fake WorkerLink (the socket in production is core/src/workers.ts ↔ cli/src/worker.ts).
// OAR's scripted runtime stands in for the model. No network, no real harness.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createMediaStore } from "../../core/src/media.ts";
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
    /** D293: the socket drops but the worker keeps its sessions (its grace): the home says away. */
    blip() {
      online = false;
      for (const [id, p] of pending) p.reject(Object.assign(new Error("gone"), { offline: true })), pending.delete(id);
      for (const [key, fn] of sessions) fn({ t: "away", key });
    },
    /** D293: back within the grace, the same host and its sessions. */
    reattach() {
      online = true;
      for (const [key, fn] of sessions) fn({ t: "back", key });
      for (const fn of onOnline) fn();
    },
  };
}

test("D293: a blip within the worker's grace says reconnecting, keeps the same session, and says it's back", async () => {
  const seen = { options: [] as any[] };
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  const w = fakeWorker(async (t) => {
    await t.tool("Bash", JSON.stringify({ command: "make" }), () => "building");
    await hold;
    await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "Built" }, "tsk00003"));
  }, seen);
  core.workers = { link: (d) => (d === "vps-2" ? w.link : undefined), list: () => [] };
  const runner = createRunner(core, { newId: () => "tsk00003", offlineGraceMs: 10_000 });
  const card = await runner.openTask({ persona: "p1", title: "Long build", brief: "make", place: { kind: "none", device: "vps-2" } });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.events.some((e) => e.kind === "task_event" && (e.body as any).tool?.name === "Bash"), "working");
  const notes = () => core.events.filter((e) => e.kind === "task_event" && (e.body as any).raw?.name !== undefined).map((e) => (e.body as any).raw);

  w.blip();
  await waitFor(() => core.tasks.get(card.taskId)?.residency === "offline", "offline");
  expect(core.tasks.get(card.taskId)?.attention).toBe("working"); // never failed, never blocked: it is still working there
  expect(notes()).toEqual([{ device: "w1", name: "vps-2", reconnecting: true }]);

  w.reattach();
  await waitFor(() => core.tasks.get(card.taskId)?.residency !== "offline", "back");
  expect(notes()).toEqual([{ device: "w1", name: "vps-2", reconnecting: true }, { device: "w1", name: "vps-2", offline: false }]);
  release();
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done in the same session");
  expect(seen.options.length).toBe(1); // one session: nothing was resumed or started again
  await runner.dispose();
});

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

// D259: a file the user sent reaches a task on a worker: its bytes go down with the words, the
// worker keeps it under its own name, and the line names the worker's path, never the home's.
test("a file the user sent reaches a task on a worker under its own name, at the worker's path", async () => {
  const seen = { options: [] as any[] };
  let input = "";
  const w = fakeWorker(async (t) => {
    input = t.input;
    await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "read it" }, "tsk00009"));
  }, seen);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  core.media = createMediaStore(join(dir, "main"));
  const csv = core.media.put(new TextEncoder().encode("part,qty\nbolt,4\n"), { sent: true, name: "parts.csv" });
  const ids = ["tsk00009"];
  const runner = createRunner(core, { newId: () => ids.shift()! });
  const card = await runner.openTask({ persona: "p1", title: "Count parts", brief: "count them", place: { kind: "none", device: "vps-2" }, media: [csv] });
  await runner.whenStarted(card.taskId);
  await waitFor(() => input !== "", "turn");
  const there = join(dir, "worker", "media-in", "files", csv.id.slice(0, 12), "parts.csv");
  expect(input).toContain(`"parts.csv" (table (CSV), 16 B) at ${there}`);
  expect(input).not.toContain(join(dir, "main"));
  expect(readFileSync(there, "utf8")).toBe("part,qty\nbolt,4\n");
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

test("D197: folderInfo reads a folder here for a home elsewhere: a folder inside a repo is the repo, with its branches", async () => {
  const repo = join(dir, "tinycart");
  mkdirSync(join(repo, "src"), { recursive: true });
  const plain = join(dir, "notes");
  mkdirSync(plain);
  // git as this computer would answer: the repo's top for anything under it, its branches.
  const git = async (cwd: string, args: string[]) => {
    const inRepo = cwd === repo || cwd.startsWith(repo + "/");
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return inRepo ? { ok: true, out: repo } : { ok: false, out: "" };
    if (args[0] === "for-each-ref") return { ok: true, out: "feature/x\nmain" };
    if (args[0] === "symbolic-ref") return { ok: true, out: "origin/main" };
    if (args[0] === "remote") return { ok: true, out: "git@github.com:Acme/tinycart.git" };
    return { ok: true, out: "feature/x" };
  };
  const sent: any[] = [];
  const host = createWorkerHost({ dataDir: join(dir, "w"), harness: {} as never, mainBase: "http://main", deviceToken: "dvc", send: (f) => sent.push(f), git });
  const ask = async (id: number, path: string) => {
    await host.handle({ t: "req", id, op: "folderInfo", args: { path } });
    return sent.find((f) => f.id === id);
  };
  expect(await ask(1, join(repo, "src"))).toEqual({ t: "res", id: 1, ok: true, result: { exists: true, kind: "repo", root: repo, name: "tinycart", defaultBranch: "main", branches: ["feature/x", "main"], remote: "github.com/acme/tinycart" } });
  expect((await ask(2, plain)).result).toEqual({ exists: true, kind: "folder", root: plain, name: "notes" });
  expect((await ask(3, join(dir, "nope"))).result).toEqual({ exists: false });
});

test("D202: the worker answers the home's models op from its own agents (null when it can't say)", async () => {
  const sent: any[] = [];
  const harness = { start: async () => ({}) as any, available: async () => [], models: async (h: string) => (h === "claude-code" ? [{ id: "opus", label: "Opus 5.5", efforts: ["low", "high"] }] : undefined) };
  const host = createWorkerHost({ dataDir: join(dir, "w2"), harness, mainBase: "http://main", deviceToken: "dvc", send: (f) => sent.push(f) });
  await host.handle({ t: "req", id: 1, op: "models", args: { harness: "claude-code" } });
  await host.handle({ t: "req", id: 2, op: "models", args: { harness: "pi" } });
  expect(sent.find((f) => f.id === 1)).toEqual({ t: "res", id: 1, ok: true, result: [{ id: "opus", label: "Opus 5.5", efforts: ["low", "high"] }] });
  expect(sent.find((f) => f.id === 2)).toEqual({ t: "res", id: 2, ok: true, result: null });
});

// D539: a key copied to a computer reaches a task there by reference: the home sends only its name
// (keyRefs), the computer it runs on reads the value from its own shelf into the session's
// environment at start, and a command that prints it there sends dots up, never the value.
test("D539: a task on a worker gets the key kept there in its session's environment, by name only; what it prints goes up as dots", async () => {
  const VALUE = "sti-fake-7c41e2b9d0a35f68e1";
  const seen = { options: [] as any[] };
  const { createKeyShelf } = await import("@ducter/protocol/src/key-shelf.ts");
  const { fileKey } = await import("@ducter/protocol/src/lock-key.ts");
  const shelfDir = join(dir, "worker-keys");
  const keys = createKeyShelf({ dataDir: shelfDir, env: {}, shell: async () => undefined, lock: fileKey(join(shelfDir, "kept-keys")) });
  // Kept there the way a copy keeps it: an offer, a box sealed to it, taken.
  const { sealKey } = await import("@ducter/protocol/src/key-seal.ts");
  const { pub } = (await keys.ops.keys_offer!({ env: "STI_MCP_API_KEY", copy: "copy000001" })) as { pub: string };
  await keys.ops.keys_take!({ env: "STI_MCP_API_KEY", name: "Prow log MCP key", from: "Mac", copy: "copy000001", sealed: sealKey(pub, VALUE, "copy000001:STI_MCP_API_KEY") });
  const w = fakeWorker(async (t) => {
    await t.tool("Bash", JSON.stringify({ command: "echo $STI_MCP_API_KEY" }), () => `printed ${VALUE}`);
    await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "MCP answers" }, "tsk00009"));
  }, seen, { keys });
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  const sentSpecs: string[] = [];
  const call = w.link.call.bind(w.link);
  w.link.call = ((op: string, args: unknown, ms?: number) => (sentSpecs.push(JSON.stringify({ op, args })), call(op, args, ms))) as typeof w.link.call;
  (core as any).keyCopy = { refsFor: (id: string) => (id === "tsk00009" ? ["STI_MCP_API_KEY"] : []), withKeys: (s: any) => s };
  const runner = createRunner(core, { newId: () => "tsk00009" });
  const card = await runner.openTask({ persona: "p1", title: "Set up the Prow log MCP on vps-2", brief: "set it up", place: { kind: "none", device: "vps-2" } });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
  expect(seen.options[0].env.STI_MCP_API_KEY).toBe(VALUE);
  expect(sentSpecs.find((s) => s.includes('"op":"start"'))).toContain('"keyRefs":["STI_MCP_API_KEY"]');
  expect(sentSpecs.join("\n")).not.toContain(VALUE);
  expect(JSON.stringify(core.events)).not.toContain(VALUE);
  expect(JSON.stringify(core.events)).toContain("••••••");
  await runner.dispose();
});

test("D521: a task on a worker stops one background job through its agent there; a session that can't stop one offers none", async () => {
  type Ev = import("@ducter/protocol/src/internal.ts").HarnessEvent;
  const stopped: string[] = [];
  let push!: (e: Ev) => void;
  const mk = (canStop: boolean) => {
    const buf: Ev[] = [];
    let wake: (() => void) | undefined;
    let done = false;
    push = (e) => (buf.push(e), wake?.());
    return {
      id: "w-s1",
      canSteer: true,
      busy: () => false,
      send: async () => {},
      interrupt: async () => {},
      close: async () => ((done = true), wake?.()),
      ...(canStop ? { stopBackground: async (id: string) => void stopped.push(id) } : {}),
      events: () => ({
        async *[Symbol.asyncIterator]() {
          for (;;) {
            while (!buf.length && !done) await new Promise<void>((r) => (wake = r));
            const v = buf.shift();
            if (!v) return;
            yield v;
          }
        },
      }),
    };
  };
  for (const canStop of [true, false]) {
    const w = fakeWorker(async () => {}, { options: [] }, { harness: { start: async () => mk(canStop) as any, available: async () => [] } });
    core.workers = { link: (d) => (d === "vps-2" ? w.link : undefined), list: () => [] };
    const id = canStop ? "tsk00051" : "tsk00052";
    const runner = createRunner(core, { newId: () => id });
    const card = await runner.openTask({ persona: "p1", title: "Bench", brief: "b", place: { kind: "none", device: "vps-2" } });
    await runner.whenStarted(card.taskId);
    push({ role: "system", text: "running in the background: bench", raw: { kind: "background", background: { id: "b1", act: "started", type: "shell", what: "bench", ...(canStop ? { stop: true } : {}) } } });
    await waitFor(() => core.events.some((e) => e.kind === "task_event" && (e.body as any).raw?.background?.id === "b1" && (e.body as any).taskId === id), "logged");
    const r = await runner.stopBackground!(card.taskId, "b1");
    expect(r.ok).toBe(canStop);
    expect(stopped).toEqual(["b1"]);
    await runner.dispose();
  }
});
