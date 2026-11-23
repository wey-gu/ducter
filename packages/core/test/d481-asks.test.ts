// D481: a question answered anywhere is answered everywhere. The home's open set (On hand's
// openAsks) is the one source of truth; a client that missed a resolution closes it from the
// snapshot and asks for the home's own events (asks_get); a reconnect replays everything since its
// cursor (never only the first page); a reply typed into a card answered elsewhere is not lost.
// hel, 2026-11-23: d_41d4dd8a8a was answered at 01:05 and another window still showed it open.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, LogEvent, ServerFrame } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { openTask, report, tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir?: string): Core {
  const t = dir ? { dir, cleanup: () => {} } : tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, push: false });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.setRunner({ send: async () => ({ delivered: "prompted" }) } as unknown as Runner);
  return core;
}

async function client(core: Core, cursor?: number) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello", ...(cursor != null ? { cursor } : {}) }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, from = 0): Promise<T> => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(from).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  const events = () => frames.flatMap((f) => (f.t === "events" ? f.events : []));
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames, events };
}

const partnerAsk = (core: Core, question = "「在 hel 用 Gemini 审改 Mem 长文案并开 PR」这一轮跑了很久，要现在再跑一轮吗？") => {
  const decisionId = `d_${Math.random().toString(36).slice(2, 12)}`;
  core.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId, question, goLabel: "现在跑一次", defaultOption: "hold", reversible: true, loop: { taskId: "b7gw6r2e" } } });
  return decisionId;
};

test("openAsks on On hand: the open questions as of the Log's head; an answered one leaves it", async () => {
  const core = boot();
  const a = partnerAsk(core);
  const b = partnerAsk(core, "Another?");
  let o = core.tasks.onHand();
  expect(o.openAsks?.ids.sort()).toEqual([a, b].sort());
  expect(o.openAsks?.asOf).toBe(core.log.head());
  core.decisions.decide(a, "reply", "应该是一直在推进，你可以直接看看吧？");
  o = core.tasks.onHand();
  expect(o.openAsks?.ids).toEqual([b]);
});

test("a task that finished with a question open: the question closes as ended (not forwarded, no attention flip, nobody woken)", async () => {
  const core = boot();
  const woke: LogEvent[] = [];
  core.setPartner({ onTrigger: (e) => void woke.push(e) });
  const forwarded: string[] = [];
  core.decisions.setHook((_t, text) => void forwarded.push(text));
  openTask(core.log, "t1");
  core.tasks.setState("t1", "working", "hot");
  report(core.log, "t1", { state: "needs_input", summary: "?", questions: [{ id: "q", text: "Which file?", blocking: true, reversible: true, default: "a.ts" }] });
  await Bun.sleep(5);
  const id = core.decisions.openIds()[0]!;
  woke.length = 0;
  core.tasks.setState("t1", "done", "warm");
  await Bun.sleep(5);
  expect(core.decisions.isPending(id)).toBe(false);
  expect(core.decisions.resolution(id)).toMatchObject({ by: "ended", settled: true });
  expect(core.tasks.get("t1")!.attention).toBe("done");
  expect(forwarded).toEqual([]);
  expect(woke.filter((e) => e.kind === "decision_resolved")).toEqual([]);
  expect(core.tasks.get("t1")!.pendingDecisionId).toBeUndefined();
});

test("a restart closes a question its finished task left open before D481", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  let core = startCore({ dataDir: t.dir, port: 0, push: false });
  openTask(core.log, "t2");
  core.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d_old", taskId: "t2", question: "Old?", goLabel: "Go", defaultOption: "hold", reversible: false } });
  core.log.append({ stream: "task:t2", origin: "system", kind: "task_state", body: { taskId: "t2", attention: "done", residency: "warm" } });
  // Before D481 nothing closed it: simulate by stopping before the microtask can.
  await core.stop();
  core = startCore({ dataDir: t.dir, port: 0, push: false });
  stops.push(() => core.stop());
  await Bun.sleep(5);
  expect(core.decisions.isPending("d_old")).toBe(false);
});

test("a reconnect replays everything since its cursor, past one page (REPLAY_MAX), so a resolution late in it arrives", async () => {
  const core = boot();
  const id = partnerAsk(core);
  const cursor = core.log.head();
  for (let i = 0; i < 5200; i++) core.log.append({ stream: "channel", origin: "system", kind: "read_receipt", body: { upToSeq: i } });
  core.decisions.decide(id, "reply", "应该是一直在推进，你可以直接看看吧？");
  const c = await client(core, cursor);
  const r = c.events().find((e) => e.kind === "decision_resolved" && (e.body as Bodies["decision_resolved"]).decisionId === id);
  expect(r).toBeDefined();
  const seqs = c.events().map((e) => e.seq);
  expect(seqs.length).toBeGreaterThan(5000);
  expect([...seqs].sort((a, b) => a - b)).toEqual(seqs); // in order, across the frames
});

test("asks_get: the home's own events for the questions asked, each one's decision and its resolution", async () => {
  const core = boot();
  const a = partnerAsk(core);
  const b = partnerAsk(core, "Still open?");
  core.decisions.decide(a, "go");
  const c = await client(core);
  const n = c.frames.length;
  c.send({ t: "asks_get", ids: [a, b, "d_nope"] });
  const f = await c.until<Extract<ServerFrame, { t: "events" }>>((x) => x.t === "events" && x.events.some((e) => e.kind === "decision"), n);
  expect(f.events.map((e) => `${e.kind}:${(e.body as { decisionId: string }).decisionId}`)).toEqual([`decision:${a}`, `decision:${b}`, `decision_resolved:${a}`]);
});

test("a reply typed into a card answered elsewhere goes to the partner as a message quoting it; the card's resolution comes back", async () => {
  const core = boot();
  const id = partnerAsk(core);
  const askSeq = core.log.head();
  core.decisions.decide(id, "go"); // the phone said Go
  const c = await client(core);
  const n = c.frames.length;
  c.send({ t: "decide", decisionId: id, option: "reply", text: "应该是一直在推进，你可以直接看看吧？" }); // the Mac still showed it open
  const f = await c.until<Extract<ServerFrame, { t: "events" }>>((x) => x.t === "events" && x.events.some((e) => e.kind === "decision_resolved"), n);
  expect(f.events.find((e) => e.kind === "decision_resolved")!.body).toMatchObject({ decisionId: id, option: "go" });
  await Bun.sleep(20);
  const msgs = core.log.read({ stream: "channel", kinds: ["user_msg"] }).map((e) => e.body as Bodies["user_msg"]);
  expect(msgs).toHaveLength(1);
  expect(msgs[0]).toMatchObject({ text: "应该是一直在推进，你可以直接看看吧？", reply: { seq: askSeq, decisionId: id } });
  expect(msgs[0]!.reply!.answers).toBeUndefined(); // it answers nothing: the card was answered already
  expect(c.frames.some((x) => x.t === "error")).toBe(false);
  // Go or Hold on a card answered elsewhere: no error, no second answer.
  c.send({ t: "decide", decisionId: id, option: "hold" });
  await Bun.sleep(30);
  expect(core.log.read({ kinds: ["decision_resolved"] })).toHaveLength(1);
  expect(c.frames.some((x) => x.t === "error")).toBe(false);
  // The same reply from two windows (same words) is said once.
  const id2 = partnerAsk(core, "And this?");
  c.send({ t: "decide", decisionId: id2, option: "reply", text: "你看看吧" });
  await Bun.sleep(30);
  c.send({ t: "decide", decisionId: id2, option: "reply", text: "你看看吧" });
  await Bun.sleep(30);
  expect(core.log.read({ kinds: ["decision_resolved"] })).toHaveLength(2);
  expect(core.log.read({ stream: "channel", kinds: ["user_msg"] })).toHaveLength(1);
});
