// D280 through the real core, from the author's run on a Pixel Fold (2026-11-16): Android's prompt to
// allow a recording showed only on the phone and timed out after 2 minutes because nothing on the Mac
// said to tap it; at the end the task wrote "借用是否结束还没确认"; the screen went dark during an idle
// loan; and tests that take the phone away (a lock, airplane mode) need the person's own hands.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, HandsetRecording, HandsetState } from "@ducter/protocol";
import { toldOf } from "@ducter/protocol/src/transcript.ts";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { HANDSET_ASLEEP, HANDSET_AWAKE, HANDSET_FINISHED, HANDSET_GIVEN, HANDSET_LOCKED, HANDSET_RECORD_BLIND, HANDSET_STOPPED, recordAskText } from "../src/handset/index.ts";
import { tempDir } from "./helpers.ts";

const xml = (pkg: string) =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="${pkg}" content-desc="" clickable="false" password="false" bounds="[0,0][1080,2400]"><node index="1" text="打开" resource-id="" class="android.widget.Button" package="${pkg}" content-desc="" clickable="true" password="false" bounds="[0,1800][900,1900]" /></node></hierarchy>`;

/** The Ducter app on the Pixel (bridge 3), with D280's asleep. */
function fakeApp() {
  let session: string | undefined;
  let ended: { session: string; why: string } | undefined;
  let recording: HandsetRecording | undefined;
  let asleep = false;
  let locked = false;
  const calls: { m: string; a: any }[] = [];
  const state = (): HandsetState => ({ bridge: 3, sdk: 36, model: "Pixel Fold", service: true, restricted: false, pictures: true, awake: !asleep, locked, boot: "b1", link: "page", gen: 1, ...(asleep ? { asleep: true } : {}), ...(session ? { session } : {}), ...(ended ? { ended: ended as HandsetState["ended"] } : {}), ...(recording ? { recording } : {}) });
  const run = (m: string, a: any): { ok: boolean; result?: unknown; error?: string } => {
    calls.push({ m, a });
    if (m === "state") return { ok: true, result: state() };
    if (m === "start") return (session = a.session), { ok: true, result: { session } };
    if (m === "stop") {
      if (session && (!a.session || a.session === session)) session = undefined;
      return { ok: true };
    }
    if (!session || a.session !== session) return { ok: false, error: "Ducter isn't lent this phone right now" };
    switch (m) {
      case "beat":
      case "doing":
        return { ok: true };
      case "front":
        return { ok: true, result: { app: "com.android.chrome" } };
      case "screen":
        return { ok: true, result: { xml: xml("com.android.chrome") } };
      case "record":
        recording = { id: "r1", session, state: "asking" };
        return { ok: true, result: { id: "r1", state: "asking" } };
      case "record_stop":
        if (a.skip && recording?.state === "asking") return (recording = { ...recording, state: "declined", error: "skipped" }), { ok: true };
        return { ok: false, error: "not recording" };
    }
    return { ok: false, error: `not something this phone does: ${m}` };
  };
  return {
    run,
    state,
    calls,
    session: () => session,
    setRecording: (r: HandsetRecording | undefined) => void (recording = r),
    setAsleep: (v: boolean) => void (asleep = v),
    setLocked: (v: boolean) => void (locked = v),
  };
}

let td: ReturnType<typeof tempDir>;
let core: Core;
let token = "";
const app = fakeApp();
const told: [string, string][] = [];
const decisions: Bodies["decision"][] = [];
const resolved: Bodies["decision_resolved"][] = [];

async function sock() {
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${token}` } } as any);
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data)) as any;
    if (f.t === "handset_req") ws.send(JSON.stringify({ t: "handset_res", id: f.id, ...app.run(f.m, f.a) }));
  };
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  const hello = () => ws.send(JSON.stringify({ t: "handset_hello", state: app.state() }));
  hello();
  await Bun.sleep(50);
  return { ws, hello, send: (f: object) => ws.send(JSON.stringify(f)) };
}
const until = async (ok: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await Bun.sleep(10);
  return ok();
};
const rejection = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("resolved; expected a rejection");
    },
    (e: Error) => e.message,
  );
const call = (taskId: string, name: string, args: object = {}) => core.mcp.call({ role: "task", taskId }, name, args) as Promise<any>;
const toldTo = (taskId: string) => told.filter(([t]) => t === taskId).map(([, s]) => s);
const askOf = (taskId: string, kind = "use") => decisions.filter((d) => d.taskId === taskId && d.handset?.kind === kind);
async function lent(taskId: string) {
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: taskId, project: "", place: { kind: "none" }, harness: "claude-code", brief: taskId, needs: { phone: "mine" } } as any });
  core.tasks.setState(taskId, "working", "hot");
  expect(await rejection(call(taskId, "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
  core.decisions.decide(askOf(taskId).at(-1)!.decisionId, "go");
  expect(await until(() => toldTo(taskId).some((s) => /You may use Pixel Fold now/.test(s)))).toBe(true);
}
const taskLines = (taskId: string) => core.log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 500, kinds: ["task_event"] }).map((e) => e.body as Bodies["task_event"]);

beforeAll(async () => {
  td = tempDir();
  core = startCore({
    dataDir: join(td.dir, "home"),
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    push: false,
    platform: "linux",
    handset: { callMs: 400, beatMs: 60, quietMs: 250, lostMs: 700, graceMs: 150, recordWaitMs: 500, recordAskMs: 300, endedMs: 300 },
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "server" },
  });
  const r = stubRunner(core);
  r.send = async (taskId, text) => (told.push([taskId, text]), { delivered: "prompted" });
  r.interrupt = async () => {};
  core.setRunner(r);
  core.setPartner({ onTrigger: () => {} });
  core.log.subscribe((e) => {
    if (e.kind === "decision") decisions.push(e.body as Bodies["decision"]);
    if (e.kind === "decision_resolved") resolved.push(e.body as Bodies["decision_resolved"]);
  });
  const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name: "Pixel Fold", platform: "android-app" }) as { token: string; device: { id: string } };
  token = paired.token;
});

afterAll(async () => {
  await core?.stop();
  td?.cleanup();
});

describe("recording consent is the person's turn, said everywhere (D280)", () => {
  test("Android's prompt opens a card in every window with its countdown; the person answering on the phone resolves it", async () => {
    const page = await sock();
    await lent("c1");
    const before = Date.now();
    expect(String(await call("c1", "phone_record_start"))).toMatch(/a card in every window tells them to/);
    const card = askOf("c1", "record").at(-1)!;
    expect(card.question).toBe(recordAskText("Pixel Fold"));
    expect(card.question).toBe("在 Pixel Fold 上点「立即开始」，它才能录屏");
    expect(card.defaultOption).toBe("hold"); // silence never records
    const until_ = Date.parse(card.handset!.until!);
    expect(until_).toBeGreaterThanOrEqual(before + 250);
    expect(until_).toBeLessThanOrEqual(Date.now() + 300);
    expect(core.tasks.get("c1")?.attention).toBe("needs_you");
    // Blind while Android asks.
    expect(await rejection(call("c1", "phone_look"))).toBe(HANDSET_RECORD_BLIND("Pixel Fold"));
    // The person taps Start now on the phone: the card resolves by itself, the task hears it records.
    app.setRecording({ id: "r1", session: "c1", state: "on", since: Date.now() });
    page.hello();
    expect(await until(() => resolved.some((r) => r.decisionId === card.decisionId && r.option === "go"))).toBe(true);
    expect(await until(() => toldTo("c1").some((s) => /Recording Pixel Fold's screen now/.test(s)))).toBe(true);
    app.setRecording(undefined);
    core.tasks.setState("c1", "done", "parked");
    page.ws.close();
  });

  test("不录了 / Skip recording on the card: the phone's prompt closes, the task hears it once", async () => {
    const page = await sock();
    await lent("c2");
    await call("c2", "phone_record_start");
    const card = askOf("c2", "record").at(-1)!;
    core.decisions.decide(card.decisionId, "hold");
    expect(await until(() => app.calls.some((c) => c.m === "record_stop" && c.a.skip === true && c.a.session === "c2"))).toBe(true);
    expect(await until(() => toldTo("c2").some((s) => /didn't start: the user chose not to record it/.test(s)))).toBe(true);
    // No longer blind.
    expect(String(await call("c2", "phone_look"))).toContain("com.android.chrome");
    app.setRecording(undefined);
    core.tasks.setState("c2", "done", "parked");
    page.ws.close();
  });

  test("no answer: the phone gives up and the card resolves as not answered (the home gives up too if the phone never says)", async () => {
    const page = await sock();
    await lent("c3");
    await call("c3", "phone_record_start");
    const card = askOf("c3", "record").at(-1)!;
    // The phone says nothing (an older app, a lost hello): the home's own timer closes it.
    expect(await until(() => resolved.some((r) => r.decisionId === card.decisionId && r.option === "hold" && r.by === "default"), 12_000)).toBe(true);
    expect(toldTo("c3").filter((s) => /didn't start: no answer on the phone in 2 minutes/.test(s)).length).toBe(1);
    app.setRecording(undefined);
    core.tasks.setState("c3", "done", "parked");
    page.ws.close();
  }, 15_000);

  test("the loan ends while Android asks: the card closes as moot", async () => {
    const page = await sock();
    await lent("c4");
    await call("c4", "phone_record_start");
    const card = askOf("c4", "record").at(-1)!;
    page.send({ t: "handset_stop", taskId: "c4" });
    expect(await until(() => resolved.some((r) => r.decisionId === card.decisionId && r.option === "hold"))).toBe(true);
    app.setRecording(undefined);
    core.tasks.setState("c4", "done", "parked");
    page.ws.close();
  });
});

describe("the task hears the loan ended, and its tools say the phone was returned (D280)", () => {
  test("Stop: one line that says so, drawn as 你收回了; every tool after says the phone was returned", async () => {
    const page = await sock();
    await lent("e1");
    page.send({ t: "handset_stop", taskId: "e1" });
    expect(await until(() => toldTo("e1").includes(HANDSET_STOPPED("Pixel Fold")))).toBe(true);
    expect(toldOf(HANDSET_STOPPED("Pixel Fold"), "ducter")).toEqual({ say: "taken_back", name: "Pixel Fold" });
    for (const tool of ["phone_look", "phone_tap"]) expect(await rejection(call("e1", tool, { x: 1, y: 1 }))).toMatch(/The phone was returned to them/);
    core.tasks.setState("e1", "done", "parked");
    page.ws.close();
  });

  test("a lock is said the same way; the next tool says it once, then asks again", async () => {
    const page = await sock();
    await lent("e2");
    app.setLocked(true);
    page.hello();
    expect(await until(() => toldTo("e2").includes(HANDSET_LOCKED("Pixel Fold")))).toBe(true);
    expect(toldOf(HANDSET_LOCKED("Pixel Fold"))?.say).toBe("taken_back");
    expect(await rejection(call("e2", "phone_look"))).toMatch(/^Your loan of Pixel Fold ended: the user locked it.*The phone was returned/);
    app.setLocked(false);
    core.tasks.setState("e2", "done", "parked");
    page.ws.close();
  });

  test("phone_give_back: the loan ends now, the tool says so, the person sees a hairline; the next tool asks with a new card", async () => {
    const page = await sock();
    await lent("e3");
    expect(String(await call("e3", "phone_give_back"))).toBe(HANDSET_GIVEN("Pixel Fold"));
    expect(app.session()).toBeUndefined();
    const line = taskLines("e3").find((b) => b.text === HANDSET_GIVEN("Pixel Fold"));
    expect(line?.from).toBe("ducter");
    expect(toldOf(line!.text!, "ducter")).toEqual({ say: "given_back", name: "Pixel Fold" });
    const asks = askOf("e3").length;
    expect(await rejection(call("e3", "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
    expect(askOf("e3").length).toBe(asks + 1);
    core.tasks.setState("e3", "done", "parked");
    page.ws.close();
  });

  test("the task finishes while lent: the phone goes back and a hairline says so, without waking the task", async () => {
    const page = await sock();
    await lent("e4");
    const n = toldTo("e4").length;
    core.tasks.setState("e4", "done", "parked");
    expect(await until(() => app.session() === undefined)).toBe(true);
    expect(taskLines("e4").some((b) => b.text === HANDSET_FINISHED("Pixel Fold") && b.from === "ducter" && b.role === "user")).toBe(true);
    expect(toldTo("e4").length).toBe(n); // never a new turn for a finished task
    expect(toldOf(HANDSET_FINISHED("Pixel Fold"))?.say).toBe("given_back");
    page.ws.close();
  });

  test("a lost phone is its own hairline", () => {
    expect(toldOf("Your loan of Pixel Fold ended: it didn't answer for 15 s. Nothing more runs on it.")).toEqual({ say: "loan_lost", name: "Pixel Fold" });
  });
});

describe("a screen that went off by itself keeps the loan (D280)", () => {
  test("asleep: the loan holds, tools say so and send nothing; awake again: the task hears it and carries on", async () => {
    const page = await sock();
    await lent("s1");
    app.setAsleep(true);
    app.setLocked(true); // the lock screen came up after Android's delay: still a timeout, never the person's lock
    page.hello();
    await Bun.sleep(100);
    expect(app.session()).toBe("s1");
    expect(toldTo("s1").some((s) => /^Your loan of/.test(s))).toBe(false);
    const sent = app.calls.length;
    expect(await rejection(call("s1", "phone_tap", { x: 1, y: 1 }))).toBe(HANDSET_ASLEEP("Pixel Fold"));
    expect(app.calls.slice(sent).some((c) => c.m === "tap")).toBe(false);
    app.setAsleep(false);
    app.setLocked(false);
    page.hello();
    expect(await until(() => toldTo("s1").includes(HANDSET_AWAKE("Pixel Fold")))).toBe(true);
    expect(String(await call("s1", "phone_look"))).toContain("com.android.chrome");
    core.tasks.setState("s1", "done", "parked");
    page.ws.close();
  });
});
