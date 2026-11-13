// D253 through the real core: the loan's life on the person's own phone. On hel the author's Pixel
// Fold was lent, went quiet (20 s blind waits, one after another), was stopped, and then the task was
// told "you may use Pixel Fold now" while its tools still refused: a start that answered late
// revived a loan the person had taken back. Here every way a loan ends ends it on the home and the
// phone, is said to the task once with why, and never comes back by itself; a quiet phone is said at
// once; a loan is announced only after a first read works; a lock gives the phone back; moot cards
// close with no side effects; one card is the only ask.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, HandsetState, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { HANDSET_BACK, HANDSET_LOCKED, HANDSET_STOPPED, HANDSET_SWITCH_OFF } from "../src/handset/index.ts";
import { tempDir } from "./helpers.ts";

const xml = (pkg: string, label = "打开") =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="${pkg}" content-desc="" clickable="false" password="false" bounds="[0,0][1080,2400]"><node index="0" text="${label}" resource-id="" class="android.widget.Button" package="${pkg}" content-desc="" clickable="true" password="false" bounds="[0,2200][900,2300]" /></node></hierarchy>`;

/** The app on the Pixel as Handset.kt answers since D253 (bridge 2): it can go quiet, lock, end a loan and say why. */
function fakeApp() {
  let session: string | undefined;
  let ended: { session: string; why: string } | undefined;
  let locked = false;
  /** Quiet: it hears calls but never answers (a paused page, a dead network). */
  let quiet = false;
  /** The calls it got while quiet, delivered when it wakes (a paused page's queue). */
  const queued: { id: string; m: string; a: any }[] = [];
  let failFront = false;
  /** Quick settings pulled down (System UI in front), with the Wi-Fi tile. */
  let shade = false;
  const did: string[] = [];
  let latesRefused = 0;
  const state = (): HandsetState => ({ bridge: 2, sdk: 36, model: "Pixel Fold", service: true, restricted: false, pictures: true, awake: !locked, locked, ...(session ? { session } : {}), ...(ended ? { ended: ended as HandsetState["ended"] } : {}) });
  const run = (m: string, a: any, late: boolean): { ok: boolean; result?: unknown; error?: string } => {
    if (m === "state") return { ok: true, result: state() };
    if (m === "start") {
      if (session && session !== a.session) return { ok: false, error: "this phone is lent to another task right now" };
      session = a.session;
      return { ok: true, result: { session } };
    }
    if (m === "stop") {
      if (session && (!a.session || a.session === session)) session = undefined;
      return { ok: true };
    }
    if (!session || a.session !== session) return { ok: false, error: "Ducter isn't lent this phone right now" };
    // Handset.kt refuses a step that arrives after its deadline: a woken page never runs old steps.
    if (late && ["tap", "swipe", "key", "text", "launch"].includes(m)) return latesRefused++, { ok: false, error: "too late" };
    switch (m) {
      case "beat":
      case "doing":
        return { ok: true };
      case "front":
        return failFront ? { ok: false, error: "no window" } : { ok: true, result: { app: "com.android.chrome" } };
      case "screen":
        return { ok: true, result: { xml: shade ? xml("com.android.systemui", "Wi\u2011Fi · Networks available") : xml("com.android.chrome") } };
      case "size":
        return { ok: true, result: { width: 1080, height: 2400 } };
      case "tap":
        did.push(`tap ${a.x},${a.y}`);
        return { ok: true };
    }
    return { ok: false, error: `not something this phone does: ${m}` };
  };
  return {
    run,
    queued,
    did,
    state,
    latesRefused: () => latesRefused,
    session: () => session,
    setQuiet: (q: boolean) => void (quiet = q),
    quiet: () => quiet,
    setFailFront: (f: boolean) => void (failFront = f),
    setShade: (v: boolean) => void (shade = v),
    /** The phone ends the loan by itself (the pill's Stop, a lock, the switch, no beat). */
    end(why: string) {
      if (session) ended = { session, why };
      session = undefined;
      if (why === "locked") locked = true;
    },
    unlock: () => void (locked = false),
  };
}

let td: ReturnType<typeof tempDir>;
let core: Core;
let phoneId = "";
let token = "";
const app = fakeApp();
const told: [string, string][] = [];
const interrupted: string[] = [];
const decisions: Bodies["decision"][] = [];
const resolved: Bodies["decision_resolved"][] = [];

async function pixel() {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${token}` } } as any);
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data)) as any;
    frames.push(f);
    if (f.t !== "handset_req") return;
    if (app.quiet()) return void app.queued.push({ id: f.id, m: f.m, a: f.a });
    ws.send(JSON.stringify({ t: "handset_res", id: f.id, ...app.run(f.m, f.a, false) }));
  };
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  const hello = () => ws.send(JSON.stringify({ t: "handset_hello", state: app.state() }));
  hello();
  /** The page wakes: what queued runs now, past its deadline (the app refuses the late steps). */
  const wake = () => {
    app.setQuiet(false);
    for (const q of app.queued.splice(0)) ws.send(JSON.stringify({ t: "handset_res", id: q.id, ...app.run(q.m, q.a, Date.now() > Number(q.a.exp)) }));
    hello();
  };
  return { ws, frames, hello, wake, send: (f: object) => ws.send(JSON.stringify(f)) };
}
const until = async (ok: () => boolean | Promise<boolean>, ms = 4000) => {
  const end = Date.now() + ms;
  while (!(await ok()) && Date.now() < end) await Bun.sleep(10);
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
const openTask = (taskId: string) => {
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: taskId, project: "", place: { kind: "none" }, harness: "claude-code", brief: taskId, needs: { phone: "mine" } } as any });
  core.tasks.setState(taskId, "working", "hot");
};
const askOf = (taskId: string) => decisions.filter((d) => d.taskId === taskId && d.handset);
const toldTo = (taskId: string) => told.filter(([t]) => t === taskId).map(([, s]) => s);
const MAY = /You may use Pixel Fold now/;
const card = async () => (await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)!;
/** Lends the Pixel to a fresh task, through its one card. */
async function lent(taskId: string) {
  openTask(taskId);
  expect(await rejection(call(taskId, "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
  core.decisions.decide(askOf(taskId)[0]!.decisionId, "go");
  expect(await until(() => toldTo(taskId).some((s) => MAY.test(s)))).toBe(true);
  expect(app.session()).toBe(taskId);
}

beforeAll(async () => {
  td = tempDir();
  core = startCore({
    dataDir: join(td.dir, "home"),
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    push: false,
    platform: "linux",
    handset: { callMs: 400, beatMs: 60, quietMs: 250, lostMs: 700, graceMs: 150 },
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "server" },
  });
  const r = stubRunner(core);
  r.send = async (taskId, text) => (told.push([taskId, text]), { delivered: "prompted" });
  r.interrupt = async (taskId) => void interrupted.push(taskId);
  core.setRunner(r);
  core.setPartner({ onTrigger: () => {} });
  core.log.subscribe((e) => {
    if (e.kind === "decision") decisions.push(e.body as Bodies["decision"]);
    if (e.kind === "decision_resolved") resolved.push(e.body as Bodies["decision_resolved"]);
  });
  const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name: "Pixel Fold", platform: "android-app" }) as { token: string; device: { id: string } };
  phoneId = paired.device.id;
  token = paired.token;
});

afterAll(async () => {
  await core?.stop();
  td?.cleanup();
});

describe("the loan's life (D253)", () => {
  test("the hel case: Stop while a late start is in flight; the phone wakes; the task is never told it may use the phone", async () => {
    const p = await pixel();
    expect(await until(async () => !!(await card()).handset?.added)).toBe(true);
    await lent("s1");
    // Their own step: the card turns the pill to their turn; the phone goes quiet meanwhile.
    expect(String(await call("s1", "phone_ask_user", { what: "在快捷设置里开始录屏，不录音" }))).toMatch(/That card is the only ask/);
    const turn = decisions.filter((d) => d.taskId === "s1" && d.phone?.kind === "user").at(-1)!;
    await Bun.sleep(30);
    app.setQuiet(true);
    core.decisions.decide(turn.decisionId, "go"); // Done: the pill's turn goes back (a start, unanswered)
    await Bun.sleep(80);
    // Stop from another window while that start hangs.
    expect(await core.handsets.stop("s1")).toBe(true);
    expect(interrupted).toContain("s1");
    expect(toldTo("s1")).toContain(HANDSET_STOPPED);
    // The page wakes: the start it queued answers late; the phone says hello still holding s1.
    p.wake();
    await Bun.sleep(300);
    expect(toldTo("s1").filter((s) => MAY.test(s)).length).toBe(1); // only the first, real loan
    expect(await until(() => app.session() === undefined)).toBe(true); // the home stopped the stale loan there
    expect(await rejection(call("s1", "phone_look"))).toBe(HANDSET_STOPPED);
    core.tasks.setState("s1", "done", "parked");
    p.ws.close();
  });

  test("a quiet phone is said at once (no blind wait), and the task hears when it answers again", async () => {
    const p = await pixel();
    await lent("q1");
    app.setQuiet(true);
    expect(await until(async () => !!(await card()).handset?.using?.quiet)).toBe(true);
    expect(core.tasks.onHand().tasks.find((c) => c.taskId === "q1")?.handset?.quiet).toBe(true);
    const t0 = Date.now();
    expect(await rejection(call("q1", "phone_look"))).toMatch(/isn't answering right now .*Nothing was sent/);
    expect(Date.now() - t0).toBeLessThan(100);
    p.wake();
    expect(await until(() => toldTo("q1").some((s) => /answers again and is still lent to you/.test(s)))).toBe(true);
    expect(String(await call("q1", "phone_look"))).toContain("com.android.chrome");
    core.tasks.setState("q1", "done", "parked");
    p.ws.close();
  });

  test("quiet too long: the loan ends as lost; when the phone is back the task hears it, its old loan ends there, and a new loan is a new card", async () => {
    let p = await pixel();
    await lent("l1");
    app.setQuiet(true);
    expect(await until(() => toldTo("l1").some((s) => /stopped answering .*your loan of it ended/.test(s)), 3000)).toBe(true);
    expect((await card()).handset?.using).toBeUndefined();
    // A tap queued while quiet never runs when the page wakes (past its deadline).
    p.wake();
    expect(await until(() => toldTo("l1").includes(HANDSET_BACK("Pixel Fold")))).toBe(true);
    expect(await until(() => app.session() === undefined)).toBe(true);
    // The next tool says the loan ended (once), the one after asks again: one new card.
    expect(await rejection(call("l1", "phone_look"))).toMatch(/stopped answering/);
    expect(await rejection(call("l1", "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
    expect(askOf("l1").length).toBe(2);
    expect(await rejection(call("l1", "phone_look"))).toMatch(/a card is asking them. That card is the only ask/);
    expect(askOf("l1").length).toBe(2);
    core.tasks.setState("l1", "done", "parked");
    p.ws.close();
    p = await pixel();
    p.ws.close();
  });

  test("a step sent to a quiet phone never runs when it wakes", async () => {
    const p = await pixel();
    await lent("x1");
    expect(String(await call("x1", "phone_look"))).toContain("[1]");
    app.setQuiet(true);
    const tap = rejection(call("x1", "phone_tap", { ref: 1 }));
    expect(await tap).toMatch(/didn't answer within|isn't answering/);
    await Bun.sleep(450);
    p.wake();
    await Bun.sleep(100);
    expect(app.did.filter((d) => d.startsWith("tap"))).toEqual([]);
    core.tasks.setState("x1", "done", "parked");
    p.ws.close();
  });

  test("locking the phone gives it back: ended on both sides, said once with why, and a new loan is a new card", async () => {
    const p = await pixel();
    await lent("k1");
    app.end("locked");
    p.send({ t: "handset_stop", from: "phone", why: "locked" });
    expect(await until(() => toldTo("k1").includes(HANDSET_LOCKED("Pixel Fold")))).toBe(true);
    expect(interrupted).not.toContain("k1");
    expect((await card()).handset?.using).toBeUndefined();
    app.unlock();
    p.hello();
    expect(await rejection(call("k1", "phone_look"))).toBe(HANDSET_LOCKED("Pixel Fold"));
    expect(await rejection(call("k1", "phone_look"))).toMatch(/Asked the user whether you may use/);
    core.decisions.decide(askOf("k1").at(-1)!.decisionId, "go");
    expect(await until(() => toldTo("k1").filter((s) => MAY.test(s)).length === 2)).toBe(true);
    // A hello that says it's locked ends the loan too (an app that couldn't relay the moment).
    app.end("locked");
    p.hello();
    expect(await until(() => toldTo("k1").filter((s) => s === HANDSET_LOCKED("Pixel Fold")).length === 2)).toBe(true);
    app.unlock();
    p.hello();
    core.tasks.setState("k1", "done", "parked");
    p.ws.close();
  });

  test("the phone's app gone mid-loan and not back: the loan ends as lost within a moment", async () => {
    const p = await pixel();
    await lent("g1");
    p.ws.close();
    expect(await until(() => toldTo("g1").some((s) => /stopped answering/.test(s)), 2000)).toBe(true);
    expect(core.tasks.onHand().tasks.find((c) => c.taskId === "g1")?.handset).toBeUndefined();
    core.tasks.setState("g1", "done", "parked");
  });

  test("Android's switch going off is like Stop; the person's own-turn card is closed with no side effects", async () => {
    const p = await pixel();
    await lent("w1");
    await call("w1", "phone_ask_user", { what: "在微信里登录" });
    const turn = decisions.filter((d) => d.taskId === "w1" && d.phone?.kind === "user").at(-1)!;
    app.end("service");
    p.send({ t: "handset_stop", from: "phone", why: "service" });
    expect(await until(() => toldTo("w1").includes(HANDSET_SWITCH_OFF("Pixel Fold")))).toBe(true);
    expect(await until(() => resolved.some((r) => r.decisionId === turn.decisionId && r.option === "hold" && r.by === "default"))).toBe(true);
    expect(core.decisions.isPending(turn.decisionId)).toBe(false);
    expect(await rejection(call("w1", "phone_look"))).toBe(HANDSET_SWITCH_OFF("Pixel Fold"));
    core.tasks.setState("w1", "done", "parked");
    p.ws.close();
  });

  test("a loan is announced only after a first read works", async () => {
    const p = await pixel();
    openTask("f1");
    await rejection(call("f1", "phone_look"));
    app.setFailFront(true);
    core.decisions.decide(askOf("f1")[0]!.decisionId, "go");
    await Bun.sleep(200);
    expect(toldTo("f1").some((s) => MAY.test(s))).toBe(false);
    expect(app.session()).toBeUndefined();
    // Back (its next hello): the yes stands, the read works, and only now is it announced.
    app.setFailFront(false);
    p.hello();
    expect(await until(() => toldTo("f1").some((s) => MAY.test(s)))).toBe(true);
    core.tasks.setState("f1", "done", "parked");
    p.ws.close();
  });

  test("quick settings: the Wi-Fi tile waits for Go, and a tap where nothing is named is refused there", async () => {
    const p = await pixel();
    await lent("v1");
    app.setShade(true);
    expect(String(await call("v1", "phone_look"))).toMatch(/Wi.Fi/);
    expect(await rejection(call("v1", "phone_tap", { ref: 1 }))).toMatch(/changes a phone setting .*needs the user's Go first/);
    expect(await rejection(call("v1", "phone_tap", { x: 500, y: 100 }))).toMatch(/tap only by \[number\]/);
    expect(app.did.filter((d) => d.startsWith("tap"))).toEqual([]);
    app.setShade(false);
    // Elsewhere a step's answer says which phone it ran on.
    await call("v1", "phone_look");
    expect(String(await call("v1", "phone_tap", { ref: 1 }))).toMatch(/on Pixel Fold, the user's own phone/);
    core.tasks.setState("v1", "done", "parked");
    p.ws.close();
  });

  test("a task that stops ends the loan on the phone; a Go on its old card afterwards does nothing", async () => {
    const p = await pixel();
    openTask("z1");
    await rejection(call("z1", "phone_look"));
    const ask = askOf("z1")[0]!;
    core.tasks.setState("z1", "done", "parked");
    await Bun.sleep(20);
    if (core.decisions.isPending(ask.decisionId)) core.decisions.decide(ask.decisionId, "go");
    await Bun.sleep(150);
    expect(app.session()).toBeUndefined();
    expect(toldTo("z1").some((s) => MAY.test(s))).toBe(false);
    p.ws.close();
  });
});
