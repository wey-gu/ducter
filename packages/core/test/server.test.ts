// End-to-end over real sockets: WS hello/replay/live push, and MCP report_to_main.
import { afterEach, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { LogEvent, ServerFrame } from "@ducter/protocol";
import type { Partner, Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { openTask, tempDir } from "./helpers.ts";

// Mirrors @ducter/runner's registerTaskTools: append the report, then set attention itself.
function registerTaskToolsLikeRunner(core: Core) {
  const map = { progress: "working", needs_input: "needs_you", blocked: "blocked", done: "done_claimed", failed: "failed" } as const;
  core.mcp.register("task", "report_to_main", "test", { type: "object" }, async (a, ctx) => {
    if (!(a.state in map)) throw new Error("bad state");
    const body = { taskId: ctx.taskId!, state: a.state, summary: a.summary, questions: a.questions ?? [], evidence: a.evidence ?? [] };
    core.log.append({ stream: `task:${ctx.taskId}`, origin: "task", kind: "report", body });
    core.tasks.setState(ctx.taskId!, map[a.state as keyof typeof map], core.tasks.get(ctx.taskId!)!.residency, `report: ${a.state}`);
    return "Reported.";
  });
}

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, platform: "darwin" });
  stops.push(t.cleanup, () => core.stop());
  return core;
}

class WsClient {
  frames: ServerFrame[] = [];
  private waiters: (() => void)[] = [];
  ws: WebSocket;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (m) => {
      this.frames.push(JSON.parse(String(m.data)));
      this.waiters.splice(0).forEach((w) => w());
    };
  }
  open() {
    return new Promise<void>((res, rej) => ((this.ws.onopen = () => res()), (this.ws.onerror = rej)));
  }
  send(f: object) {
    this.ws.send(JSON.stringify(f));
  }
  async until<T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 2000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const hit = this.frames.find(pred);
      if (hit) return hit as T;
      if (Date.now() > end) throw new Error(`timeout; got ${JSON.stringify(this.frames.map((f) => f.t))}`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
  events(): LogEvent[] {
    return this.frames.flatMap((f) => (f.t === "events" ? f.events : []));
  }
}

test("ws: hello -> welcome, channel replay since cursor, on_hand, live push of every task", async () => {
  const core = boot();
  const triggers: string[] = [];
  core.setPartner({ onTrigger: (e) => void triggers.push(e.kind) } satisfies Partner);
  const sent: [string, string, string | undefined][] = [];
  core.setRunner({
    send: async (id: string, text: string, _mode?: string, from?: string) => (sent.push([id, text, from]), { delivered: "prompted" }),
  } as unknown as Runner);

  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "old" } }); // seq 1
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "seen" } }); // seq 2
  openTask(core.log, "t1"); // seq 3 (task stream: not replayed)
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "thinking" } });
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "new" } }); // seq 5

  const c = new WsClient(core.url);
  stops.push(() => c.ws.close());
  await c.open();
  c.send({ t: "hello", cursor: 2 });
  const welcome = await c.until((f) => f.t === "welcome");
  expect(welcome).toMatchObject({ persona: "default", personaName: "Ducter", headSeq: 5 });
  await c.until((f) => f.t === "on_hand");
  expect(c.events().map((e) => e.seq)).toEqual([5]);
  const oh = c.frames.find((f) => f.t === "on_hand") as Extract<ServerFrame, { t: "on_hand" }>;
  expect(oh.onHand.tasks.map((t) => t.taskId)).toEqual(["t1"]);
  expect(oh.onHand.tasks[0]!.openedAt).toBe(core.log.read({ kinds: ["task_open"] })[0]!.ts);
  expect(oh.onHand.waiters).toEqual([]);

  c.send({ t: "send", text: "Fix the flaky test", clientId: "c1" });
  await c.until(() => c.events().some((e) => e.kind === "user_msg"));
  expect(triggers).toContain("user_msg");

  // Live task events reach every client, opened or not.
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "live" } });
  await c.until(() => c.events().some((e) => e.kind === "task_event"));

  c.send({ t: "task_history", taskId: "t1" });
  const h = await c.until<Extract<ServerFrame, { t: "task_history" }>>((f) => f.t === "task_history");
  expect(h.events.map((e) => e.kind)).toEqual(["task_open", "task_event", "task_event"]);

  c.send({ t: "task_send", taskId: "t1", text: "also check CI" });
  const ack = await c.until<Extract<ServerFrame, { t: "sent" }>>((f) => f.t === "sent");
  expect(ack).toEqual({ t: "sent", taskId: "t1", delivered: "prompted" });
  c.send({ t: "decide", decisionId: "nope", option: "go" });
  const err = await c.until<Extract<ServerFrame, { t: "error" }>>((f) => f.t === "error");
  expect(err.message).toContain("unknown decision");
  expect(sent).toEqual([["t1", "also check CI", "user"]]);
});

test("ws: a key in the Log never leaves the home: history, live events and On hand come out hidden (D152)", async () => {
  const core = boot();
  core.setRunner({ send: async () => ({ delivered: "prompted" }) } as unknown as Runner);
  const key = "nmem_ct_8fK2pQx7Lm4vRz9TbW3y";
  core.log.append({
    stream: "task:t1",
    origin: "partner",
    kind: "task_open",
    body: { taskId: "t1", title: "Connect Nowledge Mem for Codex", project: "", place: { kind: "none" }, harness: "codex", brief: `Connect Mem with this token: ${key}` },
  });
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", tool: { name: "exec_command", input: { cmd: `nmem connect --token ${key}` }, output: "ok", ok: true } } });
  const c = new WsClient(core.url);
  stops.push(() => c.ws.close());
  await c.open();
  c.send({ t: "hello" });
  await c.until((f) => f.t === "on_hand");
  c.send({ t: "task_history", taskId: "t1" });
  const h = await c.until<Extract<ServerFrame, { t: "task_history" }>>((f) => f.t === "task_history");
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: `Saved ${key} to the config.` } });
  await c.until(() => c.events().some((e) => e.kind === "task_event"));
  const wire = JSON.stringify(c.frames);
  expect(wire).not.toContain("8fK2pQx7");
  expect(JSON.stringify(h)).toContain("nmem_ct_••••••");
  // The Log itself keeps it: the task was given the key to use it.
  expect(JSON.stringify(core.log.read({ kinds: ["task_open"] }))).toContain(key);
});

test("ws: hello without cursor replays the last 200 channel events, superseded revisions dropped", async () => {
  const core = boot();
  for (let i = 0; i < 230; i++) core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: `m${i}` } });
  const lm = core.log.append({ stream: "channel", origin: "system", kind: "living_msg", body: { items: [] } });
  core.log.append({ stream: "channel", origin: "system", kind: "living_msg", body: { items: [] }, supersedes: lm.seq });
  openTask(core.log, "t1");
  const c = new WsClient(core.url);
  stops.push(() => c.ws.close());
  await c.open();
  c.send({ t: "hello" });
  await c.until((f) => f.t === "on_hand");
  const evs = c.events();
  expect(evs.length).toBe(199); // 200 read, one superseded revision dropped
  expect(evs.every((e) => e.stream === "channel")).toBe(true);
  expect(evs.some((e) => e.seq === lm.seq)).toBe(false);
  expect(evs.at(-1)!.supersedes).toBe(lm.seq);
});

test("ws: frames before hello are rejected; browser origins are refused", async () => {
  const core = boot();
  const c = new WsClient(core.url);
  stops.push(() => c.ws.close());
  await c.open();
  c.send({ t: "send", text: "hi", clientId: "x" });
  expect((await c.until((f) => f.t === "error")) as any).toMatchObject({ message: "send: send hello first" });
  const res = await fetch(`http://127.0.0.1:${core.port}/ws`, { headers: { Origin: "https://evil.example", Upgrade: "websocket" } });
  expect(res.status).toBe(403);
  // Another local port (a dev server, another app) is another site; so is a sandboxed page.
  for (const o of ["http://localhost:3000", `http://127.0.0.1:${core.port + 1}`, "null", `http://evil.example:${core.port}`]) {
    const r = await fetch(`http://127.0.0.1:${core.port}/ws`, { headers: { Origin: o, Upgrade: "websocket" } });
    expect([o, r.status]).toEqual([o, 403]);
  }
  // This server's own page (the web app at /app) and native clients (no Origin, or the desktop's own address) get in.
  for (const headers of [{ Origin: `http://127.0.0.1:${core.port}` }, {}] as Record<string, string>[]) {
    const ok = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(core.url, { headers } as any);
      ws.onopen = () => (ws.close(), resolve(true));
      ws.onerror = () => resolve(false);
    });
    expect([headers, ok]).toEqual([headers, true]);
  }
});

async function mcpClient(core: Core, role: Parameters<Core["mcp"]["configFor"]>[0]) {
  const cfg = core.mcp.configFor(role);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } }));
  stops.push(() => client.close());
  return client;
}

test("mcp: report_to_main round trip drives the card, decision and living message", async () => {
  const core = boot();
  const triggers: string[] = [];
  core.setPartner({ onTrigger: (e) => void triggers.push(e.kind) });
  registerTaskToolsLikeRunner(core);
  openTask(core.log, "t1");
  core.tasks.setState("t1", "working", "hot");

  const task = await mcpClient(core, { taskId: "t1" });
  const tools = (await task.listTools()).tools.map((t) => t.name).sort();
  expect(tools).toEqual(["ask_for_key", "log_read", "log_search", "report_to_main", "wait_for"]); // ask_for_key: D233
  const res: any = await task.callTool({
    name: "report_to_main",
    arguments: {
      state: "needs_input",
      summary: "Flake is a race in setup. Rebase onto main first?",
      questions: [{ text: "Rebase onto main?", blocking: true, default: "Rebase", reversible: true }],
    },
  });
  expect(res.isError).toBeFalsy();
  const rep = core.log.read({ kinds: ["report"] });
  expect(rep).toHaveLength(1);
  expect(rep[0]).toMatchObject({ stream: "task:t1", origin: "task", body: { taskId: "t1", state: "needs_input" } });
  expect(triggers).toContain("report");
  await new Promise((r) => setTimeout(r, 10));
  expect(core.tasks.get("t1")!.attention).toBe("needs_you");
  expect(core.log.read({ kinds: ["decision"] })[0]!.body).toMatchObject({ goLabel: "Rebase", reversible: true });
  expect(core.log.read({ kinds: ["living_msg"] })).toHaveLength(1);

  const bad: any = await task.callTool({ name: "report_to_main", arguments: { state: "nope", summary: "x" } });
  expect(bad.isError).toBe(true);

  const partner = await mcpClient(core, "partner");
  expect((await partner.listTools()).tools.map((t) => t.name).sort()).toEqual(["keep_going", "log_read", "log_search", "move_before_closing", "notice_rule", "noticed", "routine_list", "routine_pause", "routine_propose", "rule_list", "rule_save", "task_read", "wait_cancel", "wait_for"]);
  const found: any = await partner.callTool({ name: "log_search", arguments: { query: "race in setup" } });
  expect(JSON.parse(found.content[0].text)[0].kind).toBe("report");
  const card: any = await partner.callTool({ name: "task_read", arguments: { taskId: "t1" } });
  expect(JSON.parse(card.content[0].text).attention).toBe("needs_you");
});

test("mcp: bad tokens are rejected", async () => {
  const core = boot();
  const url = `http://127.0.0.1:${core.port}/mcp`;
  const res = await fetch(url, { method: "POST", headers: { Authorization: "Bearer dtk.cGFydG5lcg.forged" }, body: "{}" });
  expect(res.status).toBe(401);
  expect(core.mcp.verify(core.mcp.configFor({ taskId: "abc" }).headers.Authorization!.slice(7))).toEqual({ role: "task", taskId: "abc" });
});

test("partner triggers: held until wired; progress reports don't wake it", () => {
  const core = boot();
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "early" } });
  const got: string[] = [];
  core.setPartner({ onTrigger: (e) => void got.push(e.kind) });
  openTask(core.log, "t1");
  const rep = (state: "progress" | "done") =>
    core.log.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state, summary: "x", questions: [], evidence: [] } });
  rep("progress");
  rep("done");
  expect(got).toEqual(["user_msg", "report"]);
});

test("connections over real sockets: add over WS without the token ever coming back; task tools appear, read-only, granted", async () => {
  const { fakeOpenConnector } = await import("./fake-mcp.ts");
  const TOKEN = "oct_ws_secret_987";
  const oc = fakeOpenConnector(
    [
      { id: "github.list_my_prs", operationType: "read", run: () => ({ pulls: [{ n: 1 }] }) },
      { id: "gmail.send_email", operationType: "write", run: () => ({ id: "m1" }) },
    ],
    TOKEN,
  );
  stops.push(() => oc.stop());
  const core = boot();
  const ws = new WsClient(core.url);
  await ws.open();
  ws.send({ t: "hello" });
  await ws.until((f) => f.t === "welcome");
  ws.send({ t: "connections" });
  await ws.until((f) => f.t === "connections" && f.connections.length === 0);
  ws.send({ t: "connection_add", url: oc.url, token: "nope" });
  expect(await ws.until((f) => f.t === "connection_result")).toMatchObject({ ok: false, reason: "unauthorized" });
  ws.frames = [];
  ws.send({ t: "connection_add", url: oc.url, token: TOKEN });
  const r = await ws.until<Extract<ServerFrame, { t: "connection_result" }>>((f) => f.t === "connection_result");
  expect(r.ok).toBe(true);
  const view = await ws.until<Extract<ServerFrame, { t: "connections" }>>((f) => f.t === "connections" && f.connections.length === 1);
  expect(view.connections[0]).toMatchObject({ source: "self", state: "ok" });

  openTask(core.log, "t1");
  const task = await mcpClient(core, { taskId: "t1" });
  const names = (await task.listTools()).tools.map((x) => x.name).sort();
  expect(names).toEqual(["ask_for_key", "connection_read", "connection_search", "log_read", "log_search", "wait_for"]);
  const denied: any = await task.callTool({ name: "connection_read", arguments: { connection: "OpenConnector", action: "github.list_my_prs" } });
  expect(denied.content[0].text).toContain("No such connection");
  expect(core.connections.grant("t1", "OpenConnector").ok).toBe(true);
  const ok: any = await task.callTool({ name: "connection_read", arguments: { connection: "OpenConnector", action: "github.list_my_prs" } });
  expect(JSON.parse(ok.content[0].text)).toMatchObject({ ok: true, op: "read" });
  const write: any = await task.callTool({ name: "connection_read", arguments: { connection: "OpenConnector", action: "gmail.send_email", input: {} } });
  expect(JSON.parse(write.content[0].text)).toMatchObject({ ok: false, op: "write" });

  // Nothing a client or the Log ever saw carries the token.
  expect(JSON.stringify(ws.frames)).not.toContain(TOKEN);
  expect(JSON.stringify(core.log.read({ limit: 5000 }))).not.toContain(TOKEN);
  expect(oc.executed.filter((e) => e.name === "execute_action").map((e) => e.args.actionId)).toEqual(["github.list_my_prs"]);
});
