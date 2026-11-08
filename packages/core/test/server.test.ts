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
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
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

test("ws: hello -> welcome, replay since cursor (no transcripts), on_hand, live push", async () => {
  const core = boot();
  const triggers: string[] = [];
  core.setPartner({ onTrigger: (e) => void triggers.push(e.kind) } satisfies Partner);
  const sent: [string, string][] = [];
  core.setRunner({ send: async (id: string, text: string) => (sent.push([id, text]), { delivered: "steered" }) } as unknown as Runner);

  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "old" } }); // seq 1
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "seen" } }); // seq 2
  openTask(core.log, "t1"); // seq 3
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "thinking" } });

  const c = new WsClient(core.url);
  stops.push(() => c.ws.close());
  await c.open();
  c.send({ t: "hello", cursor: 2 });
  const welcome = await c.until((f) => f.t === "welcome");
  expect(welcome).toMatchObject({ persona: "default", personaName: "Ducter", headSeq: 4 });
  await c.until((f) => f.t === "on_hand");
  expect(c.events().map((e) => e.kind)).toEqual(["task_open"]);
  const oh = c.frames.find((f) => f.t === "on_hand") as Extract<ServerFrame, { t: "on_hand" }>;
  expect(oh.onHand.tasks.map((t) => t.taskId)).toEqual(["t1"]);

  c.send({ t: "send", text: "Fix the flaky test", clientId: "c1" });
  await c.until(() => c.events().some((e) => e.kind === "user_msg"));
  expect(triggers).toContain("user_msg");

  c.send({ t: "task_history", taskId: "t1" });
  const h = await c.until<Extract<ServerFrame, { t: "task_history" }>>((f) => f.t === "task_history");
  expect(h.events.map((e) => e.kind)).toEqual(["task_open", "task_event"]);
  // Watching the task now streams its transcript live.
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "live" } });
  await c.until(() => c.events().some((e) => e.kind === "task_event"));

  c.send({ t: "task_send", taskId: "t1", text: "also check CI" });
  c.send({ t: "decide", decisionId: "nope", option: "go" });
  const err = await c.until<Extract<ServerFrame, { t: "error" }>>((f) => f.t === "error");
  expect(err.message).toContain("unknown decision");
  expect(sent).toEqual([["t1", "also check CI"]]);
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
  expect(tools).toEqual(["log_read", "log_search", "report_to_main"]);
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
  expect((await partner.listTools()).tools.map((t) => t.name).sort()).toEqual(["log_read", "log_search", "task_read"]);
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
