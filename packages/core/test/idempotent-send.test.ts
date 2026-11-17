// Idempotent send (soak design call 2): a resend after a lost echo or a restart appends once.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { openTask, tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir: string): Core {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5 });
  core.setPartner({ onTrigger: () => {} });
  return core;
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async (pred: (f: ServerFrame) => boolean, from = 0) => {
    for (let i = 0; i < 200; i++) {
      const hit = frames.slice(from).find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

const echoOf = (clientId: string) => (f: ServerFrame) =>
  f.t === "events" && f.events.some((e) => e.kind === "user_msg" && (e.body as Bodies["user_msg"]).clientId === clientId);
const userMsgs = (core: Core) => core.log.read({ kinds: ["user_msg"] }).map((e) => (e.body as Bodies["user_msg"]).clientId);

test("a send with a clientId already in the Log appends once and re-sends the original echo", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = boot(t.dir);
  stops.push(() => core.stop());
  const c = await client(core);
  c.send({ t: "send", text: "hi", clientId: "c1" });
  await c.until(echoOf("c1"));
  const n = c.frames.length;
  c.send({ t: "send", text: "hi", clientId: "c1" });
  const again = (await c.until(echoOf("c1"), n)) as Extract<ServerFrame, { t: "events" }>;
  expect(again.events).toHaveLength(1);
  expect(again.events[0]!.seq).toBe(core.log.read({ kinds: ["user_msg"] })[0]!.seq);
  expect(userMsgs(core)).toEqual(["c1"]);
});

test("a resend after a restart is recognised from the Log", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const c1 = boot(t.dir);
  const a = await client(c1);
  a.send({ t: "send", text: "before the crash", clientId: "c-crash" });
  await a.until(echoOf("c-crash"));
  await c1.stop();

  const c2 = boot(t.dir);
  stops.push(() => c2.stop());
  const b = await client(c2);
  const n = b.frames.length;
  b.send({ t: "send", text: "before the crash", clientId: "c-crash" });
  b.send({ t: "send", text: "new one", clientId: "c-new" });
  await b.until(echoOf("c-new"), n);
  await b.until(echoOf("c-crash"), n);
  expect(userMsgs(c2)).toEqual(["c-crash", "c-new"]);
});

test("task_send with a clientId is delivered once; a resend gets the same sent ack", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = boot(t.dir);
  stops.push(() => core.stop());
  const sent: string[] = [];
  // Like the runner: logs the input (with its clientId) before delivering.
  core.setRunner({
    send: async (id: string, text: string, _m?: string, from?: "user" | "partner", clientId?: string) => {
      await Bun.sleep(20);
      core.log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "user", from, text, clientId, raw: { delivered: "steer" } } });
      sent.push(text);
      return { delivered: "steered" };
    },
  } as unknown as Runner);
  openTask(core.log, "t1");
  core.tasks.setState("t1", "working", "hot");
  const c = await client(core);
  // Two copies in flight at once, then one after the first landed.
  c.send({ t: "task_send", taskId: "t1", text: "also the docs", clientId: "k1" });
  c.send({ t: "task_send", taskId: "t1", text: "also the docs", clientId: "k1" });
  await Bun.sleep(80);
  c.send({ t: "task_send", taskId: "t1", text: "also the docs", clientId: "k1" });
  await Bun.sleep(40);
  const acks = c.frames.filter((f) => f.t === "sent");
  expect(acks).toEqual([0, 1, 2].map(() => ({ t: "sent", taskId: "t1", delivered: "steered", clientId: "k1" })));
  expect(sent).toEqual(["also the docs"]);
});

test("D325: held words are on the card (from the Log, so after a restart too); task_held changes them through the runner", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = boot(t.dir);
  stops.push(() => core.stop());
  const calls: unknown[][] = [];
  core.setRunner({
    send: async () => ({ delivered: "queued" }),
    held: async (id: string, hid: string, op: string, text?: string) => {
      calls.push([id, hid, op, text]);
      if (hid === "gone") throw new Error("That message already went to the task.");
      if (op === "now") return { delivered: "steered" };
      core.log.append({ stream: `task:${id}`, origin: "task", kind: "task_held", body: { taskId: id, held: op === "drop" ? [] : [{ id: hid, text: text ?? "", at: new Date().toISOString() }] } });
      return {};
    },
  } as unknown as Runner);
  openTask(core.log, "t1");
  core.tasks.setState("t1", "working", "hot");
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_held", body: { taskId: "t1", held: [{ id: "h1", text: "then the docs", at: "2026-11-17T10:00:00Z" }] } });
  expect(core.tasks.get("t1")!.held).toEqual([{ id: "h1", text: "then the docs", at: "2026-11-17T10:00:00Z" }]);
  const c = await client(core);
  c.send({ t: "task_held", taskId: "t1", id: "h1", op: "edit", text: "then the README" });
  await c.until((f) => f.t === "on_hand" && f.onHand.tasks.some((x) => x.held?.[0]?.text === "then the README"));
  c.send({ t: "task_held", taskId: "t1", id: "h1", op: "now" });
  expect(await c.until((f) => f.t === "sent")).toEqual({ t: "sent", taskId: "t1", delivered: "steered", clientId: "h1" });
  c.send({ t: "task_held", taskId: "t1", id: "gone", op: "drop" });
  expect(await c.until((f) => f.t === "error")).toMatchObject({ message: "task_held: That message already went to the task." });
  c.send({ t: "task_held", taskId: "t1", id: "h1", op: "drop" });
  await c.until((f) => f.t === "on_hand" && f.onHand.tasks.some((x) => x.taskId === "t1" && !x.held));
  expect(calls.map((x) => x[2])).toEqual(["edit", "now", "drop", "drop"]);
  await core.stop();
  const again = boot(t.dir);
  stops.push(() => again.stop());
  expect(again.tasks.get("t1")!.held).toBeUndefined();
});
