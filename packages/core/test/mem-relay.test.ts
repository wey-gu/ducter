// D393: the Mem relay on the home (core/src/mem-relay.ts): the home's credential read the way nmem
// reads it, never written; a task key that opens only the relay and dies with the task; the
// plugin's copy as a zip any unzip reads. The flow through a task is in runner/test/mem-carried.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore } from "../src/core.ts";
import { createMemRelay, dataPath, homeClaudeMemPlugin, MEM_LOCAL_DEFAULT, RATE, readMemCredential, storeZip, TASK_KEY_MS } from "../src/mem-relay.ts";

let dir: string;
let stops: (() => Promise<void> | void)[] = [];
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "ducter-mem-relay-"))));
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
  rmSync(dir, { recursive: true, force: true });
});

test("through the home's server: a request from off this machine with only a task key reaches Mem with the home's key; nothing else opens", async () => {
  const seen: { url: string; auth: string | null }[] = [];
  const core = startCore({
    dataDir: join(dir, "home"),
    port: 0,
    batchMs: 5,
    platform: "linux",
    deviceProbes: { cua: async () => undefined, native: async () => undefined, harnesses: async () => [], kind: async () => "server" },
    memPlugins: { inspectLocal: async () => undefined, everyMs: 0, connected: () => true },
    memRelay: {
      credential: () => ({ url: "https://mem.example.test/remote-api", key: "home-key-for-tests" }),
      fetch: (async (u: string, init?: RequestInit) => (seen.push({ url: String(u), auth: new Headers(init?.headers).get("authorization") }), Response.json({ memories: [] }))) as typeof fetch,
    },
  });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.log.append({ stream: "task:tsk1", origin: "partner", kind: "task_open", body: { taskId: "tsk1", title: "x", project: "", place: { kind: "none", device: "haswell" }, harness: "claude-code", brief: "x" } });
  const env = core.memCarry!.envFor("tsk1", `http://127.0.0.1:${core.port}`)!;
  expect(env.NMEM_API_URL).toBe(`http://127.0.0.1:${core.port}/mem`);
  const REMOTE = { "x-forwarded-for": "198.51.100.7" }; // not this machine: the device gate would refuse it
  const ok = await fetch(`${env.NMEM_API_URL}/memories/search?q=x`, { headers: { ...REMOTE, authorization: `Bearer ${env.NMEM_API_KEY}` } });
  expect(ok.status).toBe(200);
  expect(seen).toEqual([{ url: "https://mem.example.test/remote-api/memories/search?q=x", auth: "Bearer home-key-for-tests" }]);
  // The task key opens nothing else on the home.
  for (const path of ["/mcp", "/devices/online", "/ws"]) expect((await fetch(`http://127.0.0.1:${core.port}${path}`, { method: "POST", headers: { ...REMOTE, authorization: `Bearer ${env.NMEM_API_KEY}` } })).status).toBe(401);
  // One line on the task's stream says it reached Mem through the home; never what it asked.
  const lines = core.log.read({ stream: "task:tsk1", kinds: ["task_event"] }).map((e) => (e.body as { text?: string; raw?: unknown }));
  expect(lines).toEqual([{ taskId: "tsk1", role: "system", from: "runner", text: "Nowledge Mem reached through the home", raw: { memory: "relay" } } as any]);
  expect(JSON.stringify(lines)).not.toContain("q=x");
});

test("the home's credential: env over Mem's credential home; Mem's local default with none; the file untouched", () => {
  const cfg = join(dir, "nm");
  mkdirSync(cfg);
  writeFileSync(join(cfg, "config.json"), JSON.stringify({ apiUrl: "https://mem.example.test/remote-api/", apiKey: "file-key-for-tests" }));
  const before = readFileSync(join(cfg, "config.json"), "utf8");
  expect(readMemCredential({ NMEM_CLI_CONFIG_DIR: cfg }, dir)).toEqual({ url: "https://mem.example.test/remote-api", key: "file-key-for-tests" });
  expect(readMemCredential({ NMEM_CLI_CONFIG_DIR: cfg, NMEM_API_URL: "https://other.example.test", NMEM_API_KEY: "env-key-for-tests" }, dir)).toEqual({ url: "https://other.example.test", key: "env-key-for-tests" });
  expect(readMemCredential({}, join(dir, "nobody"))).toEqual({ url: MEM_LOCAL_DEFAULT });
  expect(readFileSync(join(cfg, "config.json"), "utf8")).toBe(before);
});

test("a task key: valid while the task lives and memory is on, never past its age, never forged", async () => {
  let t = 1_000;
  let live = true;
  let on = true;
  const r = createMemRelay({ secret: "s", credential: () => ({ url: "https://mem.example.test" }), on: () => on, taskLive: () => live, now: () => t });
  const k = r.keyFor("tsk1");
  expect(r.verify(k)).toBe("tsk1");
  expect(createMemRelay({ secret: "other", credential: () => undefined, on: () => true, taskLive: () => true }).verify(k)).toBeUndefined();
  on = false;
  expect(r.verify(k)).toBeUndefined();
  on = true;
  live = false;
  expect(r.verify(k)).toBeUndefined();
  live = true;
  t += TASK_KEY_MS + 1;
  expect(r.verify(k)).toBeUndefined();
  // No credential on the home: nothing to carry.
  expect(createMemRelay({ secret: "s", credential: () => undefined, on: () => true, taskLive: () => true }).envFor("tsk1", "http://127.0.0.1:7777")).toBeUndefined();
});

test("forwarding: the task key off, the home's on; no cookies back; a local Mem with no key gets none", async () => {
  const seen: Headers[] = [];
  const r = createMemRelay({
    secret: "s",
    credential: () => ({ url: "http://127.0.0.1:14242" }),
    on: () => true,
    taskLive: () => true,
    fetch: (async (_u: string, init?: RequestInit) => (seen.push(new Headers(init?.headers)), new Response("{}", { headers: { "set-cookie": "a=b", "content-type": "application/json" } }))) as typeof fetch,
  });
  const res = await r.handle(new Request("http://127.0.0.1:7777/mem/memories/search", { headers: { "x-nmem-api-key": r.keyFor("t"), "x-ducter-device": "dvc.x" } }));
  expect(res!.status).toBe(200);
  expect(res!.headers.get("set-cookie")).toBeNull();
  expect(seen[0]!.get("authorization")).toBeNull();
  expect(seen[0]!.get("x-nmem-api-key")).toBeNull();
  expect(seen[0]!.get("x-ducter-device")).toBeNull();
  expect(await r.handle(new Request("http://127.0.0.1:7777/other"))).toBeUndefined();
});

test("the plugin's copy is a zip unzip reads; the home's Claude Code cache gives its newest version", async () => {
  const zip = storeZip([{ name: ".claude-plugin/plugin.json", data: new TextEncoder().encode('{"name":"nowledge-mem"}') }, { name: "hooks/hooks.json", data: new TextEncoder().encode("{}") }]);
  const f = join(dir, "k.zip");
  writeFileSync(f, zip);
  const p = Bun.spawnSync(["unzip", "-t", f]);
  expect(p.exitCode).toBe(0);
  expect(p.stdout.toString()).toContain("No errors detected");
  const root = join(dir, ".claude", "plugins", "cache", "nowledge-community", "nowledge-mem");
  for (const v of ["0.7.9", "0.7.37", "0.7.4"]) {
    mkdirSync(join(root, v, ".claude-plugin"), { recursive: true });
    writeFileSync(join(root, v, ".claude-plugin", "plugin.json"), "{}");
  }
  expect(homeClaudeMemPlugin(dir)).toBe(join(root, "0.7.37"));
  expect(homeClaudeMemPlugin(join(dir, "none"))).toBeUndefined();
});

// D393 security pass: what a task key reaches, how fast, how keys compare.
test("only Mem's data paths, as nmem and the plugin call them; Mem's own administration and its job triggers never", () => {
  for (const p of ["/health/details", "/capabilities", "/agent/feed/events", "/threads", "/threads/claude-code-x", "/memories/search", "/context/bundle", "/api/memories/search", "/agent/working-memory/history", "/spaces", "/mailbox/x"]) expect(dataPath(p)).toBe(true);
  for (const p of ["/", "/settings", "/remote-access/status", "/license", "/models", "/agent-keys/x", "/agent-team/cloud/setup", "/key", "/export", "/import", "/plugins", "/agent/trigger/kg-extraction", "/agent/tools/call", "/api/settings", "/config.toml"]) expect(dataPath(p)).toBe(false);
});

test("a key is slowed past its burst, per task: another task is not", async () => {
  let t = 0;
  const r = createMemRelay({ secret: "s", credential: () => ({ url: "https://mem.example.test" }), on: () => true, taskLive: () => true, now: () => t, fetch: (async () => Response.json({})) as typeof fetch });
  const a = r.keyFor("a");
  const call = (k: string) => r.handle(new Request("http://127.0.0.1/mem/memories/search", { headers: { authorization: `Bearer ${k}` } })).then((x) => x!.status);
  for (let i = 0; i < RATE.burst; i++) expect(await call(a)).toBe(200);
  expect(await call(a)).toBe(429);
  expect(await call(r.keyFor("b"))).toBe(200);
  t += 1000;
  expect(await call(a)).toBe(200); // refilled
});

test("keys are compared in constant time, and the route never logs a key or a request", () => {
  const src = readFileSync(join(import.meta.dir, "../src/mem-relay.ts"), "utf8");
  expect(src).toContain("timingSafeEqual(want, got)");
  expect(src).not.toMatch(/console\.(log|warn|error)/);
});

test("archiving the task closes its key at once (no cache), and a dropped one too", async () => {
  const state = { live: true };
  const r = createMemRelay({ secret: "s", credential: () => ({ url: "https://mem.example.test" }), on: () => true, taskLive: () => state.live, fetch: (async () => Response.json({})) as typeof fetch });
  const k = r.keyFor("t");
  const call = () => r.handle(new Request("http://127.0.0.1/mem/memories/search", { headers: { authorization: `Bearer ${k}` } })).then((x) => x!.status);
  expect(await call()).toBe(200);
  state.live = false;
  expect(await call()).toBe(401);
  expect((await r.handle(new Request(`http://127.0.0.1/mem/kit/${k}/claude-code.zip`)))!.status).toBe(401);
});
