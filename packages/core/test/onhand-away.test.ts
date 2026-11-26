// D454: 移走 / Remove a finished card or group from Tasks, through the home's socket: it leaves On
// hand on every window and after a restart, 撤销 puts it back, one at work is refused, and 再试一次
// on a group's part that didn't work out brings the part (and its group) back.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, ServerFrame, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const probes = { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "laptop" as const };

function boot(dir?: string) {
  const t = dir ? undefined : tempDir();
  const dataDir = dir ?? t!.dir;
  const core = startCore({ dataDir, port: 0, batchMs: 5, deviceProbes: probes });
  if (t) stops.push(t.cleanup);
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const calls: string[] = [];
  const r = {
    harness: { start: async () => ({}) as any, available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("not in this test");
    },
    async send(taskId: string, text: string) {
      calls.push(`send ${taskId} ${text}`);
      core.tasks.setState(taskId, "working", "hot");
      return { delivered: "prompted" as const };
    },
    async reopen(taskId: string) {
      calls.push(`reopen ${taskId}`);
      core.tasks.setState(taskId, "working", "hot");
      return { delivered: "prompted" as const };
    },
    interrupt: async () => {},
    drop: async () => {},
    branchChanges: async () => undefined,
  };
  core.setRunner(r as unknown as Runner);
  return { core, calls, dir: dataDir };
}

async function ended(core: Core, id: string, title: string, attention: "done" | "failed" | "working") {
  const st = `task:${id}`;
  core.log.append({ stream: st, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "mem", place: { kind: "none" }, harness: "claude-code", brief: title } });
  if (attention === "done") core.log.append({ stream: st, origin: "task", kind: "report", body: { taskId: id, state: "done", summary: "done", questions: [], evidence: [] } as Bodies["report"] });
  await Bun.sleep(20);
  core.tasks.setState(id, attention, attention === "working" ? "hot" : "archived");
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, ms = 3000): Promise<T> => {
    for (let i = 0; i < ms / 10; i++) {
      const hit = frames.findLast(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

type OnHandFrame = Extract<ServerFrame, { t: "on_hand" }>;
const ids = (f: OnHandFrame) => f.onHand.tasks.map((t) => t.taskId).sort();

test("a finished card leaves On hand on every window and after a restart; 撤销 puts it back; one at work stays", async () => {
  const { core, dir } = boot();
  await ended(core, "ok", "Improve memory space setting page", "done");
  await ended(core, "bad", "Improve general setting page", "failed");
  await ended(core, "busy", "Write the docs", "working");
  const a = await client(core);
  const b = await client(core);
  b.frames.length = 0;
  a.send({ t: "onhand_away", taskIds: ["bad"] });
  const gone = await b.until<OnHandFrame>((f) => f.t === "on_hand" && !f.onHand.tasks.some((t) => t.taskId === "bad"));
  expect(ids(gone)).toEqual(["busy", "ok"]);
  expect(gone.onHand.away).toEqual(["bad"]);
  // Still in Past tasks: nothing is deleted.
  expect(core.tasks.get("bad")?.attention).toBe("failed");
  // One at work is refused, and stays.
  a.send({ t: "onhand_away", taskIds: ["busy"] });
  await a.until((f) => f.t === "error" && /still at work/.test(f.message));
  // Kept across a restart.
  await core.stop();
  const again = boot(dir);
  const c = await client(again.core);
  const after = await c.until<OnHandFrame>((f) => f.t === "on_hand");
  expect(ids(after)).not.toContain("bad");
  // 撤销 / Undo puts it back.
  c.frames.length = 0;
  c.send({ t: "onhand_away", taskIds: ["bad"], back: true });
  const back = await c.until<OnHandFrame>((f) => f.t === "on_hand" && f.onHand.tasks.some((t) => t.taskId === "bad"));
  expect(back.onHand.away ?? []).toEqual([]);
});

test("a finished group leaves On hand with its parts; 再试一次 brings a part that didn't work out back, and its group", async () => {
  const { core, calls } = boot();
  await ended(core, "p1", "Improve general setting page", "failed");
  await ended(core, "p2", "Improve memory space setting page", "done");
  const g = core.taskGroups.join("p", "100gle 的 UI 走查", ["p1", "p2"], "you");
  if ("error" in g) throw new Error(g.error);
  const c = await client(core);
  c.frames.length = 0;
  c.send({ t: "onhand_away", groupId: g.id });
  const gone = await c.until<OnHandFrame>((f) => f.t === "on_hand" && !f.onHand.tasks.some((t) => t.taskId === "p1"));
  expect(ids(gone)).not.toContain("p2");
  expect(gone.onHand.groups ?? []).toEqual([]);
  // 再试一次: the part goes back to work and comes back to On hand, its group with it.
  c.frames.length = 0;
  c.send({ t: "past_continue", taskId: "p1", words: "再试一次" });
  const back = await c.until<OnHandFrame>((f) => f.t === "on_hand" && f.onHand.tasks.some((t) => t.taskId === "p1"));
  expect(back.onHand.tasks.find((t) => t.taskId === "p1")!.attention).toBe("working");
  expect((back.onHand.groups ?? []).map((x) => x.id)).toEqual([g.id]);
  expect(calls).toEqual(["send p1 再试一次"]);
});
