// Regressions reported by the desktop workstream against the real backend (2026-11-09).
import { afterEach, expect, test } from "bun:test";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { openTask, report, tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return core;
}

async function client(core: Core, origin?: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url, origin ? ({ headers: { Origin: origin } } as any) : undefined);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean): Promise<T> => {
    for (let i = 0; i < 200; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

const needsInput = (core: Core, taskId: string) =>
  report(core.log, taskId, { state: "needs_input", summary: "?", questions: [{ id: "q", text: "Which file?", blocking: true, default: "a.ts", reversible: false }] });

test("task_send to a needs_you task resolves its open decision as reply, without a second forward", async () => {
  const core = boot();
  const sent: [string, string, string | undefined][] = [];
  core.setRunner({ send: async (id: string, text: string, _m?: string, from?: string) => (sent.push([id, text, from]), { delivered: "prompted" }) } as unknown as Runner);
  openTask(core.log, "t1");
  core.tasks.setState("t1", "working", "hot");
  needsInput(core, "t1");
  await Bun.sleep(5);
  const d = core.log.read({ kinds: ["decision"] })[0]!.body as Bodies["decision"];
  expect(core.tasks.get("t1")!.attention).toBe("needs_you");

  const c = await client(core);
  c.send({ t: "task_send", taskId: "t1", text: "use b.ts" });
  await c.until((f) => f.t === "sent");
  await Bun.sleep(10);
  const res = core.log.read({ kinds: ["decision_resolved"] }).map((e) => e.body as Bodies["decision_resolved"]);
  expect(res).toEqual([{ decisionId: d.decisionId, option: "reply", text: "use b.ts", by: "user" }]);
  expect(sent).toEqual([["t1", "use b.ts", "user"]]); // the message itself, not a forwarded copy
  expect(core.decisions.isPending(d.decisionId)).toBe(false);
  expect(core.tasks.get("t1")!.pendingDecision).toBeUndefined();
  expect(() => core.decisions.decide(d.decisionId, "go")).toThrow(/already resolved/);
});

test("the partner answering a task (task_event from partner) resolves its open decision too", async () => {
  const core = boot();
  const sent: string[] = [];
  core.decisions.setHook((_id, text) => void sent.push(text));
  openTask(core.log, "t1");
  needsInput(core, "t1");
  await Bun.sleep(5);
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "user", from: "partner", text: "a.ts is right" } });
  await Bun.sleep(5);
  expect(core.log.read({ kinds: ["decision_resolved"] })[0]).toMatchObject({ origin: "partner", body: { option: "reply", text: "a.ts is right" } });
  expect(sent).toEqual([]);
  // A forwarded decision text (logged from "user") does not resolve the task's other questions.
  needsInput(core, "t1");
  await Bun.sleep(5);
  core.log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "user", from: "user", text: "User says Go: a.ts." } });
  expect(core.log.read({ kinds: ["decision_resolved"] })).toHaveLength(1);
});

test("drop marks the task dropped even if the runner no longer knows it; reopen goes through the runner", async () => {
  const core = boot();
  const reopened: string[] = [];
  core.setRunner({
    drop: async (id: string) => {
      throw new Error(`unknown task ${id}`);
    },
    reopen: async (id: string) => (reopened.push(id), core.tasks.setState(id, "working", "hot"), { delivered: "prompted" }),
  } as unknown as Runner);
  openTask(core.log, "t1");
  const c = await client(core);
  c.send({ t: "task_action", taskId: "t1", action: "drop" });
  for (let i = 0; i < 50 && core.tasks.get("t1")!.attention !== "dropped"; i++) await Bun.sleep(10);
  expect(core.tasks.get("t1")).toMatchObject({ attention: "dropped" });
  expect(core.tasks.get("t1")!.reason).toBeUndefined();
  c.send({ t: "task_action", taskId: "t1", action: "reopen" });
  const ack = await c.until<Extract<ServerFrame, { t: "sent" }>>((f) => f.t === "sent");
  expect(ack).toEqual({ t: "sent", taskId: "t1", delivered: "prompted" });
  expect(reopened).toEqual(["t1"]);
  expect(core.tasks.get("t1")).toMatchObject({ attention: "working", residency: "hot" });
});

test("every task_action is acked with action_result (merge carries its ref; failures carry a message)", async () => {
  const core = boot();
  core.setRunner({
    interrupt: async () => {},
    merge: async () => ({ ok: true, message: "Merged ducter/fix into main.", ref: "abc123" }),
    openPr: async () => ({ ok: false, message: "GitHub CLI isn't signed in. Run gh auth login in a terminal, then try again." }),
  } as unknown as Runner);
  openTask(core.log, "t1");
  const c = await client(core);
  const results: Extract<ServerFrame, { t: "action_result" }>[] = [];
  for (const action of ["merge", "open_pr", "interrupt", "undrop"]) {
    c.send({ t: "task_action", taskId: "t1", action });
    results.push(await c.until((f) => f.t === "action_result" && f.action === action));
  }
  c.send({ t: "task_action", taskId: "nope", action: "merge" });
  results.push(await c.until((f) => f.t === "action_result" && f.taskId === "nope"));
  expect(results).toEqual([
    { t: "action_result", taskId: "t1", action: "merge", ok: true, message: "Merged ducter/fix into main.", ref: "abc123" },
    { t: "action_result", taskId: "t1", action: "open_pr", ok: false, message: "GitHub CLI isn't signed in. Run gh auth login in a terminal, then try again." },
    { t: "action_result", taskId: "t1", action: "interrupt", ok: true },
    { t: "action_result", taskId: "t1", action: "undrop", ok: false, message: "Undo isn't available." },
    { t: "action_result", taskId: "nope", action: "merge", ok: false, message: "I can't find that task." },
  ]);
});

test("a localhost Origin with a trailing slash is accepted; other sites are not", async () => {
  const core = boot();
  const ok = await fetch(`http://127.0.0.1:${core.port}/ws`, { headers: { Origin: `http://localhost:${core.port}/`, Upgrade: "websocket" } });
  expect(ok.status).not.toBe(403);
  const bad = await fetch(`http://127.0.0.1:${core.port}/ws`, { headers: { Origin: "https://evil.example/" } });
  expect(bad.status).toBe(403);
});
