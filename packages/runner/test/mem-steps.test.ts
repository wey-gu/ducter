// D417: Mem for an Antigravity task. agy loads no plugin for one session, so Ducter runs Mem's two
// lifecycle steps itself with Mem's own nmem, on the computer the agent runs on, in the session's
// env: the Context Bundle in front of the first message, the thread saved after each turn. Nothing
// is installed or written into ~/.gemini; the task's relay key is in the env only (never in argv,
// the brief, the Log, or agy's MCP entries). nmem here is a fake exec; Mem behind the relay a fake.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import type { SessionSpec, WorkerLink, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import { createMemRelay, type MemRelay } from "../../core/src/mem-relay.ts";
import { createOarHarnessPort, createRunner, createWorkerHost, registerTaskTools } from "../src/index.ts";
import { CONTEXT_MAX, nmemOf, readContext, saveThread, theirMemPlugin, threadSaver, type MemStepsExec } from "../src/mem-steps.ts";
import { taskBrief } from "../src/brief.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

const HOME_KEY = "home-mem-key-for-tests-only"; // not any provider's format
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-mem-steps-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A fake nmem: records each call; `context` answers a bundle, `t save` answers ok (or what `answer` says). */
function fakeNmem(answer: (argv: string[]) => { code: number; out: string } = () => ({ code: 0, out: "{}" })) {
  const calls: { argv: string[]; env: Record<string, string> }[] = [];
  const exec: MemStepsExec = async (argv, env) => {
    calls.push({ argv, env });
    if (argv.includes("context")) return { code: 0, out: JSON.stringify({ rendered_markdown: "## Who\nWey builds Ducter; prefers Chinese in chat." }) };
    return answer(argv);
  };
  return { exec, calls };
}

test("the registry: only Antigravity has Mem's steps run by Ducter (Claude Code carries the plugin itself)", () => {
  const withSteps = Object.values(HARNESS_FACTS).filter((f) => f.memSteps).map((f) => f.harness);
  expect(withSteps).toEqual(["antigravity"]);
  expect(HARNESS_FACTS.antigravity.memSteps!.value).toEqual({ contextApp: "google-antigravity", threadFrom: "antigravity", plugin: "nowledge-mem-google-antigravity" });
});

test("the Context Bundle: Mem's own context command, as the persona's identity and Space; wrapped as Mem's plugin wraps it", async () => {
  const n = fakeNmem();
  const env = { PATH: "/bin", NMEM_AGENT_ID: "ducter-wey", NMEM_SPACE: "Ducter", NMEM_API_KEY: "dmr.x.y" };
  const b = await readContext(n.exec, "/x/nmem", "google-antigravity", env);
  expect(n.calls[0]!.argv).toEqual(["/x/nmem", "--json", "context", "--source-app", "google-antigravity", "--agent-id", "ducter-wey", "--space", "Ducter"]);
  expect(n.calls[0]!.env.NMEM_API_KEY).toBe("dmr.x.y"); // the key rides in the env, never argv
  expect(b).toStartWith("<nowledge_context_bundle>\nUse this as current user context from Nowledge Mem Context Bundle.");
  expect(b).toContain("Wey builds Ducter");
  expect(b).toEndWith("</nowledge_context_bundle>");
  // Mem down, a failed read, nothing in it, or not JSON: nothing in front of the message.
  expect(await readContext(async () => ({ code: 1, out: "" }), "nmem", "a", {})).toBeUndefined();
  expect(await readContext(async () => ({ code: 0, out: "not json" }), "nmem", "a", {})).toBeUndefined();
  expect(await readContext(async () => ({ code: 0, out: '{"rendered_markdown":"  "}' }), "nmem", "a", {})).toBeUndefined();
  expect(await readContext(async () => { throw new Error("spawn"); }, "nmem", "a", {})).toBeUndefined();
  // A notice line before the JSON is read past; a huge bundle is clipped.
  const big = await readContext(async () => ({ code: 0, out: `notice\n${JSON.stringify({ markdown: "x".repeat(CONTEXT_MAX * 2) })}` }), "nmem", "a", {});
  expect(big!.length).toBeLessThan(CONTEXT_MAX + 300);
});

test("the thread: Mem's own transcript reader for this session, in its folder; true only on success", async () => {
  const n = fakeNmem();
  expect(await saveThread(n.exec, "nmem", "antigravity", "c0ffee-1", "/repo", { NMEM_SPACE: "Ducter" })).toBe(true);
  expect(n.calls[0]!.argv).toEqual(["nmem", "--json", "t", "save", "--from", "antigravity", "--session-id", "c0ffee-1", "-p", "/repo", "--space", "Ducter"]);
  expect(await saveThread(async () => ({ code: 2, out: "" }), "nmem", "antigravity", "s", "/r", {})).toBe(false);
});

test("the nmem a session would run: NMEM_CLI_PATH when it is there, else its PATH's; none: no steps", () => {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "nmem"), "#!/bin/sh\n", { mode: 0o755 });
  expect(nmemOf({ PATH: bin })).toBe(join(bin, "nmem"));
  expect(nmemOf({ PATH: join(dir, "empty") })).toBeUndefined();
  expect(nmemOf({ PATH: "", NMEM_CLI_PATH: join(bin, "nmem") })).toBe(join(bin, "nmem"));
  expect(nmemOf({ PATH: "", NMEM_CLI_PATH: join(dir, "gone") })).toBeUndefined();
});

test("one save after each turn's end: turns ending during a save make one more, a failure is tried once more", async () => {
  let n = 0;
  let ok = false;
  const s = threadSaver(async () => (n++, ok), { after: 0, retry: 0 });
  s.turnEnded();
  await s.idle();
  expect(n).toBe(2); // failed, tried once more
  ok = true;
  n = 0;
  s.turnEnded();
  s.turnEnded();
  s.turnEnded();
  await s.idle();
  expect(n).toBe(2); // the running one, then one for the turns that ended meanwhile
});

test("the person's own Mem plugin for agy, where agy looks: then Ducter does neither step", () => {
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  expect(theirMemPlugin("nowledge-mem-google-antigravity", home, repo)).toBe(false);
  // Another plugin there is not Mem's.
  mkdirSync(join(home, ".gemini", "config", "plugins", "other"), { recursive: true });
  writeFileSync(join(home, ".gemini", "config", "plugins", "other", "plugin.json"), JSON.stringify({ name: "other" }));
  expect(theirMemPlugin("nowledge-mem-google-antigravity", home, repo)).toBe(false);
  // Cloned as Mem's README says (folder nowledge-mem), global.
  mkdirSync(join(home, ".gemini", "config", "plugins", "nowledge-mem"), { recursive: true });
  writeFileSync(join(home, ".gemini", "config", "plugins", "nowledge-mem", "plugin.json"), JSON.stringify({ name: "nowledge-mem-google-antigravity", version: "0.1.3" }));
  expect(theirMemPlugin("nowledge-mem-google-antigravity", home, repo)).toBe(true);
  // Switched off in agy's config: not there.
  writeFileSync(join(home, ".gemini", "config", "config.json"), JSON.stringify({ plugins: { "nowledge-mem": { enabled: false } } }));
  expect(theirMemPlugin("nowledge-mem-google-antigravity", home, repo)).toBe(false);
  // In the project (a workspace plugin under .agents/plugins).
  mkdirSync(join(repo, ".agents", "plugins", "mem"), { recursive: true });
  writeFileSync(join(repo, ".agents", "plugins", "mem", "plugin.json"), JSON.stringify({ name: "nowledge-mem-google-antigravity" }));
  expect(theirMemPlugin("nowledge-mem-google-antigravity", home, join(repo))).toBe(true);
});

test("the brief says what the steps bring, only where they run", () => {
  const base = { partnerName: "Nova", taskId: "t1", title: "x", brief: "x", place: { kind: "none" as const }, cwd: "/r", mcpServerName: "ducter", memory: "ducter" as const };
  expect(taskBrief({ ...base, memSteps: true })).toContain("<nowledge_context_bundle>");
  expect(taskBrief({ ...base, memSteps: true })).toContain("thread is kept in their memory after each turn");
  expect(taskBrief(base)).not.toContain("nowledge_context_bundle");
});

/** agy's contract as in antigravity.test.ts, enough for these steps: no MCP credentials, refused options refused. */
function agyLike(seen: { options: any[]; inputs: string[] }, turn: (t: ScriptedTurn) => Promise<void> = async (t) => t.say("done")): Runtime {
  const rt = scriptedRuntime({ id: "antigravity", turn: async (t) => (seen.inputs.push(t.input), turn(t)) });
  return new Proxy(rt, {
    get(target, prop, recv) {
      if (prop === "session")
        return async (inst: any, options: any, ctx: any) => {
          if ((options.mcpServers ?? []).some((s: any) => s.headers || (s.env && Object.keys(s.env).length))) throw new Error("refused: mcpServerCredentials");
          seen.options.push(options);
          return target.session(inst, options, ctx);
        };
      return Reflect.get(target, prop, recv);
    },
  });
}

const spec = (over: Partial<SessionSpec> = {}): SessionSpec => ({
  harness: "antigravity",
  cwd: join(dir, "repo"),
  appendSystemPrompt: "Brief: fix the flaky test.",
  mcp: [{ name: "ducter", url: "http://127.0.0.1:7777/mcp?task=t1", headers: { Authorization: "Bearer dtk.test.sig" } }],
  permissionMode: "bypass",
  memSteps: true,
  env: { NMEM_AGENT_ID: "ducter-wey" },
  ...over,
});

test("on the port: the bundle leads the first message only; the thread is saved after the turn; a resume reads no bundle", async () => {
  const seen = { options: [] as any[], inputs: [] as string[] };
  const n = fakeNmem();
  const home = join(dir, "home");
  const port = createOarHarnessPort({ loadRuntime: async () => agyLike(seen), dataDir: join(dir, "d"), memSteps: { exec: n.exec, nmem: "/fake/nmem", home, after: 0, retry: 0 } });
  const s = await port.start(spec());
  const it = s.events()[Symbol.asyncIterator]();
  await s.send("Start.");
  while (!(await it.next()).value?.turnEnd);
  expect(seen.inputs[0]).toStartWith("<nowledge_context_bundle>");
  expect(seen.inputs[0]).toEndWith("</nowledge_context_bundle>\n\nStart.");
  await waitFor(() => n.calls.some((c) => c.argv.includes("save")), "saved");
  const save = n.calls.find((c) => c.argv.includes("save"))!;
  expect(save.argv).toEqual(["/fake/nmem", "--json", "t", "save", "--from", "antigravity", "--session-id", s.id, "-p", join(dir, "repo")]);
  expect(save.env.NMEM_AGENT_ID).toBe("ducter-wey");
  await s.send("Again.");
  while (!(await it.next()).value?.turnEnd);
  expect(seen.inputs[1]).toBe("Again.");
  await s.close();

  const before = n.calls.filter((c) => c.argv.includes("context")).length;
  const back = await port.start(spec({ resumeSessionId: s.id }));
  expect(n.calls.filter((c) => c.argv.includes("context")).length).toBe(before);
  await back.close();
  // Nothing was written into agy's home.
  expect(() => readdirSync(join(home, ".gemini"))).toThrow();
});

test("on the port: not asked, another agent, or the person's own Mem plugin there: no step runs", async () => {
  const seen = { options: [] as any[], inputs: [] as string[] };
  const n = fakeNmem();
  const home = join(dir, "home");
  const run = async (sp: SessionSpec, seam: Record<string, unknown> = {}) => {
    const port = createOarHarnessPort({ loadRuntime: async () => agyLike(seen), dataDir: join(dir, "d"), memSteps: { exec: n.exec, home, after: 0, retry: 0, ...seam } as any });
    const s = await port.start(sp);
    const it = s.events()[Symbol.asyncIterator]();
    await s.send("Go.");
    while (!(await it.next()).value?.turnEnd);
    await s.close();
  };
  await run(spec({ memSteps: false }), { nmem: "/fake/nmem" });
  await run({ ...spec(), harness: "claude-code", mcp: [] } as SessionSpec, { nmem: "/fake/nmem" }); // Claude Code carries Mem's plugin itself
  mkdirSync(join(home, ".gemini", "config", "plugins", "nowledge-mem"), { recursive: true });
  writeFileSync(join(home, ".gemini", "config", "plugins", "nowledge-mem", "plugin.json"), JSON.stringify({ name: "nowledge-mem-google-antigravity" }));
  await run(spec(), { nmem: "/fake/nmem" });
  await Bun.sleep(20);
  expect(n.calls).toEqual([]);
  expect(seen.inputs.every((i) => i === "Go.")).toBe(true);
});

// ---------- end to end: a task on a worker with nothing of Mem's, through the home's relay ----------

let core: FakeCore;
let relay: MemRelay;
let upstream: { url: string; auth: string | null }[];

function setupHome() {
  core = createFakeCore(join(dir, "main"));
  registerTaskTools(core);
  upstream = [];
  relay = createMemRelay({
    secret: "relay-secret-for-tests",
    credential: () => ({ url: "https://mem.example.test/remote-api", key: HOME_KEY }),
    on: () => true,
    taskLive: (id) => !!core.tasks.get(id),
    kitDir: () => undefined,
    fetch: (async (url: string | URL, init?: RequestInit) => {
      upstream.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
      return Response.json({ rendered_markdown: "## Now\nShipping D417." });
    }) as typeof fetch,
  });
  core.memCarry = { envFor: relay.envFor, kitFor: relay.kitFor, nmemIn: (d) => d === "vps-2" || d === "w1" };
  core.taskMemory = { on: () => true, recall: async () => undefined };
  core.memPluginIn = () => false;
}

/** The worker's nmem, faked: it does what nmem does with the env it is given (calls "Mem", here the home's relay). */
function workerNmem(calls: { argv: string[]; env: Record<string, string> }[]): MemStepsExec {
  return async (argv, env) => {
    calls.push({ argv, env });
    const path = argv.includes("context") ? "/context?source_app=google-antigravity" : "/threads";
    const url = String(env.NMEM_API_URL).replace("https://ducter.example.com", "http://127.0.0.1") + path;
    const res = await relay.handle(new Request(url, { method: argv.includes("save") ? "POST" : "GET", headers: { authorization: `Bearer ${env.NMEM_API_KEY}` }, ...(argv.includes("save") ? { body: "{}" } : {}) }));
    return { code: res!.ok ? 0 : 1, out: await res!.text() };
  };
}

function fakeWorker(seen: { options: any[]; inputs: string[] }, calls: { argv: string[]; env: Record<string, string> }[]) {
  let nextId = 0;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  const sessions = new Map<string, (f: WorkerSessionFrame) => void>();
  const harness = createOarHarnessPort({
    loadRuntime: async () => agyLike(seen, async (t) => {
      t.say("Fixed.");
      await t.tool("mcp_ducter_report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "Fixed the flaky test" }, "tskagy01"));
    }),
    dataDir: join(dir, "worker"),
    memSteps: { exec: workerNmem(calls), nmem: "/worker/nmem", home: join(dir, "worker-home"), after: 0, retry: 0 },
  });
  const host = createWorkerHost({
    dataDir: join(dir, "worker"),
    harness,
    mainBase: "https://ducter.example.com",
    deviceToken: "dvc.worker.token",
    send(f: any) {
      if (f.t === "res") {
        const p = pending.get(f.id);
        pending.delete(f.id);
        f.ok ? p?.resolve(f.result) : p?.reject(new Error(f.error));
      } else {
        sessions.get(f.key)?.(f);
        if (f.t === "end") sessions.delete(f.key);
      }
    },
  } as any);
  const link: WorkerLink = {
    id: "w1",
    name: "vps-2",
    online: () => true,
    call(op, args) {
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
    onOnline: () => () => {},
  };
  return link;
}

test("an Antigravity task on a worker with nothing of Mem's: Mem's context at start and the thread after its turn, through the home's relay with the home's key added there", async () => {
  setupHome();
  const seen = { options: [] as any[], inputs: [] as string[] };
  const calls: { argv: string[]; env: Record<string, string> }[] = [];
  const link = fakeWorker(seen, calls);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? link : undefined), list: () => [] };
  const runner = createRunner(core, { newId: () => "tskagy01" });
  const card = await runner.openTask({ persona: "p1", title: "Fix the flaky test", brief: "Fix it", place: { kind: "none", device: "vps-2" }, harness: "antigravity" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
  await waitFor(() => calls.some((c) => c.argv.includes("save")), "thread saved");

  const o = seen.options[0];
  // The brief (agy's appended instructions) says what the steps bring, and carries no key.
  expect(o.appendSystemPrompt).toContain("<nowledge_context_bundle>");
  expect(o.appendSystemPrompt).not.toContain("dmr.");
  // agy's MCP entries hold no credential (its database keeps them), and none is Mem's.
  expect(JSON.stringify(o.mcpServers)).not.toContain("dmr.");
  expect(JSON.stringify(o.mcpServers)).not.toContain(HOME_KEY);
  // The first message led with Mem's context, read through the relay.
  expect(seen.inputs[0]).toStartWith("<nowledge_context_bundle>");
  expect(seen.inputs[0]).toContain("Shipping D417.");
  // nmem on the worker ran with the relay and the task's key in its env, never in its argv.
  for (const c of calls) {
    expect(c.env.NMEM_API_URL).toBe("https://ducter.example.com/mem");
    expect(c.env.NMEM_API_KEY).toStartWith("dmr.");
    expect(c.argv.join(" ")).not.toContain("dmr.");
  }
  expect(calls.find((c) => c.argv.includes("save"))!.argv).toContain("antigravity");
  // Upstream, Mem got the home's key, added at the home.
  expect(upstream.map((u) => u.url)).toEqual(["https://mem.example.test/remote-api/context?source_app=google-antigravity", "https://mem.example.test/remote-api/threads"]);
  expect(upstream.every((u) => u.auth === `Bearer ${HOME_KEY}`)).toBe(true);
  // Nothing of agy's home was touched; the task's key is not in the Log.
  expect(() => readdirSync(join(dir, "worker-home", ".gemini"))).toThrow();
  expect(JSON.stringify(core.events)).not.toContain("dmr.");
  await runner.dispose();
});

test("memory off in Ducter: an Antigravity task gets no step and no Mem env", async () => {
  setupHome();
  core.taskMemory = { on: () => false, recall: async () => undefined };
  const seen = { options: [] as any[], inputs: [] as string[] };
  const calls: { argv: string[]; env: Record<string, string> }[] = [];
  const link = fakeWorker(seen, calls);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? link : undefined), list: () => [] };
  const runner = createRunner(core, { newId: () => "tskagy01" });
  const card = await runner.openTask({ persona: "p1", title: "Fix the flaky test", brief: "Fix it", place: { kind: "none", device: "vps-2" }, harness: "antigravity" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
  await Bun.sleep(20);
  expect(calls).toEqual([]);
  expect(seen.inputs[0]).not.toContain("nowledge_context_bundle");
  expect(seen.options[0].appendSystemPrompt).not.toContain("nowledge_context_bundle");
  await runner.dispose();
});
