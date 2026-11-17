// D312: a second partner answers: its own session on its own view of core, started on its first
// message; core's writes for its tasks, questions, waits and routines land in its conversation;
// it reads only its own; a task it opened reports to it; a restart keeps all of that.
import { afterEach, expect, test } from "bun:test";
import type { Bodies, LogEvent, ServerFrame } from "@ducter/protocol";
import type { CoreApi, Partner } from "@ducter/protocol/src/internal.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

/** A fake partner session: says one line per user message, in its own name, through its own view. */
function fakePartner(view: CoreApi, log: { got: LogEvent[] }): Partner {
  return {
    onTrigger(e) {
      log.got.push(e);
      if (e.kind === "user_msg") view.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: `${view.persona.name} here: ${(e.body as Bodies["user_msg"]).text}`, replyTo: e.seq } });
    },
  };
}

function home(dir: string) {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, partners: true });
  const def = { got: [] as LogEvent[] };
  const other = { got: [] as LogEvent[], made: 0, views: [] as CoreApi[] };
  core.setPartner({ onTrigger: (e) => void def.got.push(e) });
  core.setPartnerFactory((view, id) => {
    other.made++;
    other.views.push(view);
    expect(id).toBe("p2");
    return fakePartner(view, other);
  });
  return { core, def, other };
}

async function client(core: Core, hello: object = {}) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  const until = async (pred: (f: ServerFrame) => boolean, from = 0) => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(from).find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  ws.send(JSON.stringify({ t: "hello", ...hello }));
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}
const said = (frames: ServerFrame[]) =>
  frames.flatMap((f) => (f.t === "events" ? f.events : [])).filter((e) => e.kind === "ai_msg" || e.kind === "user_msg").map((e) => (e.body as { text: string }).text);
const texts = (core: Core, stream: string, kinds: LogEvent["kind"][] = ["ai_msg"]) => core.log.read({ stream, kinds, limit: 100 }).map((e) => (e.body as { text?: string; question?: string }).text ?? (e.body as { question?: string }).question);

test("a second partner answers in its own name, in its own conversation; a socket never gets the other partner's words", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const { core, def, other } = home(t.dir);
  stops.push(() => core.stop());
  expect(core.partners.add({ name: "小家" }).ok).toBe(true);
  expect(other.made).toBe(0); // nothing runs for it before its first message

  const work = await client(core);
  const family = await client(core, { persona: "p2" });
  family.send({ t: "send", text: "周六的牙医约了吗", clientId: "f1" });
  await family.until((f) => f.t === "events" && f.events.some((e) => e.kind === "ai_msg"));
  work.send({ t: "send", text: "ship the release", clientId: "w1" });
  await work.until((f) => f.t === "events" && f.events.some((e) => e.kind === "user_msg"));
  await Bun.sleep(40);

  expect(other.made).toBe(1); // started lazily, on its first message
  expect(texts(core, "channel:p2")).toEqual(["小家 here: 周六的牙医约了吗"]);
  expect(said(family.frames)).toEqual(["周六的牙医约了吗", "小家 here: 周六的牙医约了吗"]);
  expect(said(work.frames)).toEqual(["ship the release"]);
  // Each partner woke only for its own words; the second sees its conversation as "channel".
  expect(def.got.filter((e) => e.kind === "user_msg").map((e) => (e.body as Bodies["user_msg"]).text)).toEqual(["ship the release"]);
  expect(other.got.map((e) => [e.stream, (e.body as Bodies["user_msg"]).text])).toEqual([["channel", "周六的牙医约了吗"]]);
  // Its view reads only its own conversation.
  const view = other.views[0]!;
  expect(view.persona.name).toBe("小家");
  expect(view.persona.identity).toContain("You are 小家");
  expect(view.persona.identity).toContain("Ducter");
  expect(view.log.read({ stream: "channel", kinds: ["user_msg"] }).map((e) => (e.body as Bodies["user_msg"]).text)).toEqual(["周六的牙医约了吗"]);
  expect(view.log.search("release").length).toBe(0);
  expect(view.log.read({ kinds: ["user_msg"] }).map((e) => e.stream)).toEqual(["channel"]);
});

test("a task opened by the second partner reports to it: its question, its answer and its result land in its conversation", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const { core, def, other } = home(t.dir);
  stops.push(() => core.stop());
  core.partners.add({ name: "小家" });
  const view = core.partnerView("p2");
  // The partner opens a task through its view: it carries its persona.
  view.log.append({ stream: "task:t9", origin: "partner", kind: "task_open", body: { taskId: "t9", title: "约牙医", project: "", place: { kind: "none" }, harness: "claude-code", brief: "Book it." } });
  expect(core.tasks.get("t9")?.persona).toBe("p2");
  view.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j9", text: "约牙医", state: "running", taskId: "t9" } });
  expect(view.tasks.list().map((c) => c.taskId)).toEqual(["t9"]);
  expect(core.partnerView("p2").mine!.task(core.tasks.get("t9")!)).toBe(true);

  // The task asks (decisions.ts makes the card): in the second partner's conversation, not the default's.
  const family = await client(core, { persona: "p2" });
  const work = await client(core);
  core.log.append({ persona: "p2", stream: "task:t9", origin: "task", kind: "report", body: { taskId: "t9", state: "needs_input", summary: "Which day?", questions: [{ id: "q", text: "周六还是周日？", blocking: true, reversible: false, default: "周六" }], evidence: [] } });
  await Bun.sleep(30);
  const asked = core.log.read({ stream: "channel:p2", kinds: ["decision"] });
  expect(asked.map((e) => (e.body as Bodies["decision"]).question)).toEqual(["周六还是周日？"]);
  expect(core.log.read({ stream: "channel", kinds: ["decision"] })).toHaveLength(0);
  expect(other.got.map((e) => e.kind)).toContain("report");
  expect(def.got.some((e) => e.kind === "report")).toBe(false);

  // The answer lands beside its question and wakes the second partner.
  const decisionId = (asked[0]!.body as Bodies["decision"]).decisionId;
  family.send({ t: "decide", decisionId, option: "go" });
  await family.until((f) => f.t === "events" && f.events.some((e) => e.kind === "decision_resolved"));
  expect(core.log.read({ stream: "channel:p2", kinds: ["decision_resolved"] })).toHaveLength(1);
  expect(other.got.some((e) => e.kind === "decision_resolved" && e.stream === "channel")).toBe(true);
  expect(def.got.some((e) => e.kind === "decision_resolved")).toBe(false);

  // Its result: the living message is in its conversation; the default's shows nothing of it.
  core.log.append({ persona: "p2", stream: "task:t9", origin: "task", kind: "report", body: { taskId: "t9", state: "done", summary: "约好了，周六上午十点。", questions: [], evidence: [] } });
  await Bun.sleep(40);
  expect(core.log.read({ stream: "channel:p2", kinds: ["living_msg"] }).length).toBeGreaterThan(0);
  expect(core.log.read({ stream: "channel", kinds: ["living_msg"] }).flatMap((e) => (e.body as Bodies["living_msg"]).items)).toHaveLength(0);
  // Task streams are On hand's (the person's, every partner's); the default's conversation has none of it.
  const words = JSON.stringify(work.frames.flatMap((f) => (f.t === "events" ? f.events : [])).filter((e) => e.stream === "channel"));
  expect(words).not.toContain("约好了");
  expect(words).not.toContain("周六还是周日");
  // On hand is the person's: every card, each with its partner.
  const oh = core.tasks.onHand();
  expect(oh.tasks.find((c) => c.taskId === "t9")?.persona).toBe("p2");
});

test("core's tools on another partner's role: a routine it proposes is its own, the log tools read only its own", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const { core } = home(t.dir);
  stops.push(() => core.stop());
  core.partners.add({ name: "小家" });
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "the release key is in the vault" } });
  const view = core.partnerView("p2");
  view.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "提醒我交物业费" } });

  // Its own partner role: a token of its own, verified as that partner.
  const cfg = view.mcp.configFor("partner");
  expect(core.mcp.verify(cfg.headers.Authorization!.slice(7))).toEqual({ role: "partner", persona: "p2" });
  const P2 = { role: "partner" as const, persona: "p2" };

  const r = (await core.mcp.call(P2, "routine_propose", { name: "物业费", trigger: { kind: "time", every: "month", dayOfMonth: 1, time: "09:00", zone: "personal", tz: "Asia/Shanghai" }, brief: "Remind about the property fee." })) as { ok: boolean; routineId: string };
  expect(r.ok).toBe(true);
  expect(core.log.read({ stream: "channel:p2", kinds: ["decision"] }).map((e) => (e.body as Bodies["decision"]).routineId)).toEqual([r.routineId]);
  expect(core.log.read({ stream: "channel", kinds: ["decision"] })).toHaveLength(0);
  expect((core.log.read({ stream: `routine:${r.routineId}`, kinds: ["routine"] })[0]!.body as Bodies["routine"]).persona).toBe("p2");

  const read = (await core.mcp.call(P2, "log_read", { stream: "channel" })) as { body: { text?: string } }[];
  expect(read.map((e) => e.body.text).filter(Boolean)).toEqual(["提醒我交物业费", "小家 here: 提醒我交物业费"]);
  await expect(core.mcp.call(P2, "log_read", { stream: "channel:default" })).rejects.toThrow();
  expect((await core.mcp.call(P2, "log_search", { query: "vault" })) as unknown[]).toHaveLength(0);
  // The default's own reads leave the second partner's words out too.
  expect((await core.mcp.call({ role: "partner" }, "log_search", { query: "物业费" })) as unknown[]).toHaveLength(0);
});

test("On hand lists every partner's own open questions with whose they are", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const { core } = home(t.dir);
  stops.push(() => core.stop());
  core.partners.add({ name: "小家" });
  core.partnerView("p2").log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "dq", question: "这周六上午可以吗？", goLabel: "可以", defaultOption: "hold", reversible: false } });
  expect(core.tasks.onHand().asks).toEqual([expect.objectContaining({ persona: "p2", decisionId: "dq", question: "这周六上午可以吗？" })]);
});

test("a restart keeps routing: the second partner picks up again, and an answer to its question still reaches it", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const a = home(t.dir);
  a.core.partners.add({ name: "小家" });
  const fam = await client(a.core, { persona: "p2" });
  fam.send({ t: "send", text: "要不要订周六", clientId: "x1" });
  await fam.until((f) => f.t === "events" && f.events.some((e) => e.kind === "ai_msg"));
  a.core.partnerView("p2").log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "dr", question: "订周六上午？", goLabel: "订", defaultOption: "hold", reversible: false } });
  // Its folder exists once it ran (main.ts makes it; the fake does it here).
  (await import("node:fs")).mkdirSync(a.core.partnerDir("p2"), { recursive: true });
  await a.core.stop();

  const b = home(t.dir);
  stops.push(() => b.core.stop());
  await Bun.sleep(20);
  expect(b.other.made).toBe(1); // it ran before: made at boot, so what it was doing is picked up
  b.core.decisions.decide("dr", "go");
  await Bun.sleep(20);
  expect(b.core.log.read({ stream: "channel:p2", kinds: ["decision_resolved"] })).toHaveLength(1);
  expect(b.other.got.some((e) => e.kind === "decision_resolved")).toBe(true);
  expect(b.def.got.some((e) => e.kind === "decision_resolved")).toBe(false);
});

test("one partner: nothing routes, the default keeps everything as before", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, partners: false });
  stops.push(() => core.stop());
  core.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d1", question: "Q?", goLabel: "Go", defaultOption: "hold", reversible: false } });
  core.decisions.decide("d1", "go");
  expect(core.log.read({ stream: "channel", kinds: ["decision_resolved"] })).toHaveLength(1);
});
