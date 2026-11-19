// D393: Nowledge Mem carried to every task from the home's one connection. A computer (or a
// sandbox on it) with nothing of Mem's set up: no Mem sign-in, no config, no plugin. Its task still
// gets Mem's plugin (the home's copy, by URL), its nmem talks to the home's relay with a key for
// that task alone, and nothing of the home's Mem key ever reaches it. Where no plugin goes with the
// task (an agent Mem has none for), Ducter's own memory (recall, memory_search) stands in, as before.
// The relay is the real one (core/src/mem-relay.ts); Mem upstream is a fake; no network.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { WorkerLink, WorkerSessionFrame } from "@ducter/protocol/src/internal.ts";
import { createMemRelay, type MemRelay } from "../../core/src/mem-relay.ts";
import { createOarHarnessPort, createRunner, createWorkerHost, registerTaskTools } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

const HOME_KEY = "home-mem-key-for-tests-only"; // not any provider's format (fake keys look fake)
let dir: string;
let core: FakeCore;
let relay: MemRelay;
let upstream: { url: string; auth: string | null; device: string | null; body: string }[];
let kit: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-mem-carried-"));
  core = createFakeCore(join(dir, "main"));
  registerTaskTools(core);
  upstream = [];
  // The home's copy of Mem's Claude Code plugin (its shape: manifest, hooks, a skill).
  kit = join(dir, "plugin");
  mkdirSync(join(kit, ".claude-plugin"), { recursive: true });
  mkdirSync(join(kit, "hooks"), { recursive: true });
  mkdirSync(join(kit, "skills", "search-memory"), { recursive: true });
  mkdirSync(join(kit, "tests"), { recursive: true });
  writeFileSync(join(kit, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "nowledge-mem", version: "0.7.37" }));
  writeFileSync(join(kit, "hooks", "hooks.json"), JSON.stringify({ hooks: { SessionStart: [], Stop: [] } }));
  writeFileSync(join(kit, "skills", "search-memory", "SKILL.md"), "# Search memory\n");
  writeFileSync(join(kit, "tests", "test_x.py"), "left out\n");
  relay = createMemRelay({
    secret: "relay-secret-for-tests",
    credential: () => ({ url: "https://mem.example.test/remote-api", key: HOME_KEY }),
    on: () => true,
    taskLive: (id) => {
      const c = core.tasks.get(id);
      return !!c && c.residency !== "archived" && c.attention !== "dropped";
    },
    kitDir: (h) => (h === "claude-code" ? kit : undefined),
    fetch: (async (url: string | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      upstream.push({ url: String(url), auth: h.get("authorization"), device: h.get("x-ducter-device"), body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : "" });
      return Response.json({ ok: true, memories: [{ id: "m1", title: "Fake clock in tests" }] });
    }) as typeof fetch,
  });
  core.memCarry = { envFor: relay.envFor, kitFor: relay.kitFor, nmemIn: (d) => d === "vps-2" || d === "w1" };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A worker host (a computer, or the sandbox the harness runs in there) behind a fake link. */
function fakeWorker(turn: (t: ScriptedTurn) => void | Promise<void>, seen: { options: any[] }) {
  let nextId = 0;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  const sessions = new Map<string, (f: WorkerSessionFrame) => void>();
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
  const host = createWorkerHost({
    dataDir: join(dir, "worker"),
    harness,
    mainBase: "https://ducter.example.com",
    deviceToken: "dvc.worker.token",
    turning: () => 0,
    turningOn: () => 0,
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
  return { link };
}

/** Every file under a folder, as text (to prove nothing of the home's Mem key landed there). */
function allText(root: string): string {
  let out = "";
  const walk = (d: string) => {
    let es: string[];
    try {
      es = readdirSync(d);
    } catch {
      return;
    }
    for (const e of es) {
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out += readFileSync(p, "latin1");
    }
  };
  walk(root);
  return out;
}

/** What the sandbox's nmem would do with only the env it was given: call "Mem" (here: the home's relay). */
async function asSandbox(env: Record<string, string | null>, path: string, init: RequestInit = {}) {
  const url = String(env.NMEM_API_URL).replace("https://ducter.example.com", "http://127.0.0.1") + path;
  const res = await relay.handle(new Request(url, { ...init, headers: { ...(init.headers as any), authorization: `Bearer ${env.NMEM_API_KEY}` } }));
  return res!;
}

test("a sandbox with nothing of Mem's: the task gets Mem's plugin from the home, its hooks reach Mem through the relay, and no Mem secret lands there", async () => {
  const seen = { options: [] as any[] };
  core.taskMemory = { on: () => true, recall: async () => undefined };
  core.memPluginIn = () => false; // nothing of the person's there
  const w = fakeWorker(async (t) => {
    t.say("Working in the sandbox.");
    await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "Done in the sandbox" }, "tskmem01"));
  }, seen);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  const runner = createRunner(core, { newId: () => "tskmem01" });
  const card = await runner.openTask({ persona: "p1", title: "Tidy the sandbox", brief: "Tidy it", place: { kind: "none", device: "vps-2" }, harness: "claude-code" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");

  const o = seen.options[0];
  // The relay on the home's address, with a key for this task alone; never the device token.
  expect(o.env.NMEM_API_URL).toBe("https://ducter.example.com/mem");
  expect(o.env.NMEM_API_KEY).toStartWith("dmr.");
  expect(Object.values(o.env)).not.toContain(HOME_KEY);
  expect(Object.values(o.env)).not.toContain("dvc.worker.token");
  // Mem's plugin, for this session only, from the home's copy.
  const at = o.launchArgs.indexOf("--plugin-url");
  expect(at).toBeGreaterThan(-1);
  const pluginUrl: string = o.launchArgs[at + 1];
  expect(pluginUrl).toStartWith("https://ducter.example.com/mem/kit/dmr.");
  const zip = await relay.handle(new Request(pluginUrl.replace("https://ducter.example.com", "http://127.0.0.1")));
  expect(zip!.status).toBe(200);
  const bytes = new Uint8Array(await zip!.arrayBuffer());
  const names = new TextDecoder("latin1").decode(bytes);
  expect(names).toContain(".claude-plugin/plugin.json");
  expect(names).toContain("hooks/hooks.json");
  expect(names).toContain("skills/search-memory/SKILL.md");
  expect(names).not.toContain("tests/test_x.py");
  // The brief says the plugin is on (Mem's own recall and thread), not Ducter's stand-in.
  expect(o.systemPrompt ?? o.appendSystemPrompt ?? JSON.stringify(o)).toContain("Nowledge Mem is on in this session");

  // Its hooks, as nmem in the sandbox would send them: a recall at start, the thread at the end.
  const recall = await asSandbox(o.env, "/memories/search?q=tidy");
  expect(recall.status).toBe(200);
  const thread = await asSandbox(o.env, "/threads/import", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "Tidy it" }] }) });
  expect(thread.status).toBe(200);
  expect(upstream.map((u) => u.url)).toEqual(["https://mem.example.test/remote-api/memories/search?q=tidy", "https://mem.example.test/remote-api/threads/import"]);
  expect(upstream.every((u) => u.auth === `Bearer ${HOME_KEY}` && u.device === null)).toBe(true); // the home's key, added at the home
  expect(upstream[1]!.body).toContain("Tidy it");
  // Nothing of the home's Mem key on that computer's disk.
  expect(allText(join(dir, "worker"))).not.toContain(HOME_KEY);
  // The task's key is in its env and launch only: never in the Log, its brief or a report.
  const key: string = o.env.NMEM_API_KEY;
  expect(JSON.stringify(core.events)).not.toContain(key);
  expect(JSON.stringify(core.events)).not.toContain("dmr.");
  expect(String(o.systemPrompt ?? "") + String(o.appendSystemPrompt ?? "")).not.toContain("dmr.");
  await runner.dispose();
});

test("the key dies with the task, and never opens Mem's own administration", async () => {
  core.taskMemory = { on: () => true, recall: async () => undefined };
  core.memPluginIn = () => false;
  const seen = { options: [] as any[] };
  const w = fakeWorker(async () => {}, seen);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  const runner = createRunner(core, { newId: () => "tskmem02" });
  const card = await runner.openTask({ persona: "p1", title: "x", brief: "x", place: { kind: "none", device: "vps-2" }, harness: "claude-code" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => seen.options.length > 0, "started");
  const env = seen.options[0].env;
  for (const path of ["/remote-access/status", "/settings", "/agent-keys/x", "/license", "/agent/trigger/kg-extraction", "/export"]) expect((await asSandbox(env, path)).status).toBe(403);
  expect((await asSandbox(env, "/memories/m1", { method: "DELETE" })).status).toBe(403);
  expect((await asSandbox({ ...env, NMEM_API_KEY: env.NMEM_API_KEY.slice(0, -2) + "xx" }, "/memories/search")).status).toBe(401);
  core.tasks.setState(card.taskId, "done", "archived");
  expect((await asSandbox(env, "/memories/search")).status).toBe(401);
  expect(upstream).toEqual([]);
  await runner.dispose();
});

test("an agent the home carries no plugin for: Ducter's own memory stands in as before, and that computer's nmem still reaches Mem through the relay", async () => {
  const seen = { options: [] as any[] };
  core.taskMemory = { on: () => true, recall: async () => [{ id: "m1", title: "Fake clock in tests", content: "Always a fake clock." }] };
  core.memPluginIn = () => false;
  const w = fakeWorker(async (t) => {
    t.say("Checked the disk.");
    await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "ok" }, "tskmem03"));
  }, seen);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  const runner = createRunner(core, { newId: () => "tskmem03" });
  // Codex: the home carries no plugin for it (Claude Code only), so no --plugin-url.
  const card = await runner.openTask({ persona: "p1", title: "Disk", brief: "Check the disk", place: { kind: "none", device: "vps-2" }, harness: "codex" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => core.tasks.get(card.taskId)?.attention === "done_claimed", "done");
  const o = seen.options[0];
  expect(o.env.NMEM_API_URL).toBe("https://ducter.example.com/mem");
  expect(JSON.stringify(o.launchArgs ?? [])).not.toContain("--plugin-url");
  expect(core.events.some((e) => e.kind === "task_event" && (e.body as any).raw?.memory === "recall")).toBe(true);
  await runner.dispose();
});

test("the person's own plugin there is reused, never doubled; a task on the home needs no relay", async () => {
  core.taskMemory = { on: () => true, recall: async () => undefined };
  core.memPluginIn = (device) => device === "vps-2";
  const seen = { options: [] as any[] };
  const w = fakeWorker(async () => {}, seen);
  core.workers = { link: (d) => (d === "vps-2" || d === "w1" ? w.link : undefined), list: () => [] };
  const ids = ["tskmem04"];
  const runner = createRunner(core, { newId: () => ids.shift()! });
  const card = await runner.openTask({ persona: "p1", title: "x", brief: "x", place: { kind: "none", device: "vps-2" }, harness: "claude-code" });
  await runner.whenStarted(card.taskId);
  await waitFor(() => seen.options.length > 0, "started");
  expect(seen.options[0].env.NMEM_API_URL).toBe("https://ducter.example.com/mem"); // theirs talks through the home too
  expect(JSON.stringify(seen.options[0].launchArgs ?? [])).not.toContain("--plugin-url");
  await runner.dispose();
});

test("a task on the home keeps the home's own Mem connection: no relay, no carried plugin", async () => {
  core.taskMemory = { on: () => true, recall: async () => undefined };
  core.memPluginIn = () => false;
  const specs: any[] = [];
  const port = {
    async start(spec: any) {
      specs.push(spec);
      return { id: "s1", canSteer: false, busy: () => false, send: async () => {}, interrupt: async () => {}, close: async () => {}, events: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<any>(() => {}) }) }) };
    },
  } as any;
  const runner = createRunner(core, { harness: port, newId: () => "tskmem05" });
  await runner.whenStarted((await runner.openTask({ persona: "p1", title: "x", brief: "x", harness: "claude-code" })).taskId);
  expect(specs[0].env?.NMEM_API_URL).toBeUndefined();
  expect(specs[0].pluginUrls).toBeUndefined();
  await runner.dispose();
});
