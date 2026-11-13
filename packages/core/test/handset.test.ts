// D238 through the real core: 用这台手机 / Use this phone. A paired Android phone's page connects
// over a real socket (its device token) and relays the home's calls to a fake of the app's
// accessibility bridge, which answers the way Handset.kt does (the screen in uiautomator's XML,
// refusing outside a loan). A phone task on the home asks before its first use (no default), the
// phone starts its pill on Go, the gate holds a send for Go, banks stay out of reach, password
// fields are never typed into, 停下 from any window or the phone ends the loan, and a phone that
// comes back without the loan (its app restarted, Stop tapped while away) ends it on the home too.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, HandsetServerFrame, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { HANDSET_STOPPED, doingLine } from "../src/handset/index.ts";
import { tempDir } from "./helpers.ts";

const chat = (pkg: string) =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="${pkg}" content-desc="" clickable="false" password="false" bounds="[0,0][1080,2400]"><node index="0" text="周六见" resource-id="${pkg}:id/input" class="android.widget.EditText" package="${pkg}" content-desc="" clickable="true" focused="true" password="false" bounds="[0,2200][900,2300]" /><node index="1" text="" resource-id="" class="android.widget.ImageButton" package="${pkg}" content-desc="发送" clickable="true" password="false" bounds="[900,2200][1080,2300]" /><node index="2" text="" resource-id="${pkg}:id/pw" class="android.widget.EditText" package="${pkg}" content-desc="" clickable="true" password="true" bounds="[0,2000][900,2100]" /></node></hierarchy>`;

/** The app on the Pixel, as Handset.kt answers: nothing outside a loan. */
function fakeApp() {
  const did: string[] = [];
  let session: string | undefined;
  let front = "com.tencent.mm";
  let pill: { task: string; turn: string } | undefined;
  const doing: string[] = [];
  const state = () => ({ bridge: 1, sdk: 36, model: "Pixel Fold", service: true, restricted: false, pictures: true, ...(session ? { session } : {}) });
  const call = (m: string, a: any): { ok: boolean; result?: unknown; error?: string } => {
    if (m === "state") return { ok: true, result: state() };
    if (m === "start") {
      if (session && session !== a.session) return { ok: false, error: "lent to another task" };
      session = a.session;
      pill = { task: a.task, turn: a.turn };
      return { ok: true, result: { session } };
    }
    if (m === "stop") return (session = undefined), (pill = undefined), { ok: true };
    if (m === "off") return (session = undefined), (pill = undefined), did.push("off"), { ok: true };
    if (!session || a.session !== session) return { ok: false, error: "Ducter isn't lent this phone right now" };
    switch (m) {
      case "doing":
        doing.push(a.line);
        return { ok: true };
      case "screen":
        return { ok: true, result: { xml: chat(front) } };
      case "front":
        return { ok: true, result: { app: front } };
      case "size":
        return { ok: true, result: { width: 1080, height: 2400 } };
      case "jpeg":
        return { ok: true, result: { data: Buffer.from([0xff, 0xd8, 1]).toString("base64") } };
      case "apps":
        return { ok: true, result: { apps: [{ pkg: "com.tencent.mm", label: "微信" }, { pkg: "com.eg.android.AlipayGphone", label: "支付宝" }] } };
      case "launch":
        front = a.pkg;
        did.push(`launch ${a.pkg}`);
        return { ok: true };
      case "tap":
      case "swipe":
      case "key":
      case "text":
        did.push(`${m} ${JSON.stringify({ ...a, session: undefined })}`);
        return { ok: true };
    }
    return { ok: false, error: `not something this phone does: ${m}` };
  };
  return { call, did, doing, state, pill: () => pill, session: () => session, setFront: (p: string) => void (front = p), restart: () => void ((session = undefined), (pill = undefined)) };
}

let td: ReturnType<typeof tempDir>;
let core: Core;
let phoneId = "";
let token = "";
const app = fakeApp();
const told: [string, string][] = [];
const interrupted: string[] = [];
const decisions: Bodies["decision"][] = [];

/** The Pixel's page: a real socket with its device token, relaying every handset_req to the app. */
async function pixel() {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${token}` } } as any);
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data)) as ServerFrame;
    frames.push(f);
    if (f.t === "handset_req") {
      const r = app.call((f as Extract<HandsetServerFrame, { t: "handset_req" }>).m, (f as any).a);
      ws.send(JSON.stringify({ t: "handset_res", id: (f as any).id, ...r }));
    }
  };
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  ws.send(JSON.stringify({ t: "handset_hello", state: app.state() }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean): Promise<T> => {
    for (let i = 0; i < 400; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  return { ws, frames, until, send: (f: object) => ws.send(JSON.stringify(f)) };
}
const until = async (ok: () => boolean | Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (!(await ok()) && Date.now() < end) await Bun.sleep(10);
  return ok();
};
/** Awaited before asserting (research/73: never `await expect(p).rejects` on a call over a real socket). */
const rejection = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("resolved; expected a rejection");
    },
    (e: Error) => e.message,
  );
const call = (taskId: string, name: string, args: object = {}) => core.mcp.call({ role: "task", taskId }, name, args) as Promise<any>;
const openTask = (taskId: string, title: string) => {
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "claude-code", brief: title, needs: { phone: true } } as any });
  core.tasks.setState(taskId, "working", "hot");
};
const clientCard = async () => (await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)!;

beforeAll(async () => {
  td = tempDir();
  core = startCore({ dataDir: join(td.dir, "home"), port: 0, batchMs: 5, sweepMs: 50, push: false, platform: "linux", deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "server" } });
  const r = stubRunner(core);
  r.send = async (taskId, text) => (told.push([taskId, text]), { delivered: "prompted" });
  r.interrupt = async (taskId) => void interrupted.push(taskId);
  core.setRunner(r);
  core.setPartner({ onTrigger: () => {} });
  core.log.subscribe((e) => {
    if (e.kind === "decision") decisions.push(e.body as Bodies["decision"]);
  });
  const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name: "Pixel Fold · Ducter", platform: "android-app" }) as { token: string; device: { id: string } };
  phoneId = paired.device.id;
  token = paired.token;
});

afterAll(async () => {
  await core?.stop();
  td?.cleanup();
});

describe("用这台手机 / Use this phone, through the real core", () => {
  test("a Pixel whose switch is already on is added as soon as its app says hello (however the switch got on)", async () => {
    const p = await pixel();
    expect(await until(async () => !!(await clientCard()).handset?.linked)).toBe(true);
    // Before, only the switch going on while the guide was open added it: a phone whose switch was
    // on already (an earlier version, Android's Settings) stayed unadded, and phone work fell to
    // Ducter's own phone (seen on the author's home, 2026-11-13).
    expect(await until(async () => !!(await clientCard()).handset?.added)).toBe(true);
    expect((await clientCard()).handset).toMatchObject({ added: true, able: true, linked: true, state: { model: "Pixel Fold", service: true } });
    // From another window: not here (the switch is on the phone).
    const other = new WebSocket(core.url);
    await new Promise<void>((res) => (other.onopen = () => res()));
    const got: ServerFrame[] = [];
    other.onmessage = (m) => got.push(JSON.parse(String(m.data)));
    other.send(JSON.stringify({ t: "hello" }));
    other.send(JSON.stringify({ t: "handset_set", device: phoneId, on: true }));
    expect(await until(() => got.some((f) => f.t === "handset_set_result"))).toBe(true);
    expect(got.find((f) => f.t === "handset_set_result")).toMatchObject({ ok: false });
    other.close();
    p.send({ t: "handset_set", on: true });
    expect(await p.until((f) => f.t === "handset_set_result")).toMatchObject({ ok: true, on: true, device: phoneId });
    expect((await clientCard()).handset?.added).toBe(true);
    p.ws.close();
  });

  test("work on a phone app can run on a Linux home now (no Ducter's phone needed)", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    const pick = await core.loadout.choose({ title: "在微信里回妈妈", needs: { phone: true } });
    expect(pick && "none" in pick).toBe(false);
    p.ws.close();
  });

  test("a task asks before its first use: one card, no default; Go starts the pill; then the gate holds", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    openTask("t1", "回妈妈的消息");
    expect(await rejection(call("t1", "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
    const ask = decisions.find((d) => d.taskId === "t1" && d.handset)!;
    expect(ask).toMatchObject({ handset: { kind: "use", device: phoneId, name: "Pixel Fold · Ducter" }, defaultOption: "hold", reversible: false });
    expect(ask.defaultAt).toBeUndefined();
    expect(app.session()).toBeUndefined();
    // Asking again doesn't stack cards.
    expect(await rejection(call("t1", "phone_look"))).toMatch(/Waiting for the user/);
    expect(decisions.filter((d) => d.taskId === "t1" && d.handset)).toHaveLength(1);

    core.decisions.decide(ask.decisionId, "go");
    expect(await until(() => app.session() === "t1")).toBe(true);
    expect(app.pill()).toEqual({ task: "回妈妈的消息", turn: "agent" });
    expect(told.some(([t, s]) => t === "t1" && /You may use Pixel Fold/.test(s))).toBe(true);

    const look = String(await call("t1", "phone_look"));
    expect(look).toContain("App in front: com.tencent.mm");
    expect(look).toContain('[2] button "发送"');
    expect(look).toContain("[3] password field");
    expect(await until(() => app.doing.includes("在看屏幕"))).toBe(true);
    // On hand: the task is on the person's phone (so Stop shows), not on Ducter's phone.
    const card = core.tasks.onHand().tasks.find((c) => c.taskId === "t1");
    expect(card?.handset).toEqual({ device: phoneId, app: "com.tencent.mm" });
    expect(card?.phoning).toBeUndefined();

    await call("t1", "phone_type", { ref: 1, text: "周六见，不见不散" });
    expect(app.did.some((d) => d.startsWith("text") && d.includes("周六见，不见不散"))).toBe(true);
    expect(await rejection(call("t1", "phone_type", { ref: 3, text: "hunter2" }))).toMatch(/password field/);
    expect(app.did.filter((d) => d.includes("hunter2"))).toEqual([]);

    const taps = () => app.did.filter((d) => d.startsWith("tap")).length;
    const before = taps(); // typing into [1] tapped the field first
    expect(await rejection(call("t1", "phone_tap", { ref: 2 }))).toMatch(/needs the user's Go/);
    expect(taps()).toBe(before);
    await call("t1", "phone_ask_go", { what: "发给妈妈：周六见", app: "微信", ref: 2 });
    const go = decisions.filter((d) => d.taskId === "t1" && d.phone?.kind === "go").at(-1)!;
    expect(go.phone).toMatchObject({ kind: "go", app: "com.tencent.mm", name: "微信", label: "发送", on: { device: phoneId, name: "Pixel Fold · Ducter" } });
    core.decisions.decide(go.decisionId, "go");
    await call("t1", "phone_tap", { ref: 2 });
    expect(taps()).toBe(before + 1);
    expect(await rejection(call("t1", "phone_tap", { ref: 2 }))).toMatch(/needs the user's Go/);
    p.ws.close();
  });

  test("banks, wallets and password managers stay out of reach on the person's own phone", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    const apps = String(await call("t1", "phone_apps"));
    expect(apps).toContain("com.tencent.mm");
    expect(apps).not.toContain("Alipay");
    expect(await rejection(call("t1", "phone_open_app", { app: "com.eg.android.AlipayGphone" }))).toMatch(/money or keys/);
    app.setFront("com.eg.android.AlipayGphone");
    expect(String(await call("t1", "phone_look"))).toMatch(/you can't see or use it/);
    app.setFront("com.tencent.mm");
    p.ws.close();
  });

  test("their own step (a sign-in) makes every tool blind until they're done", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    await call("t1", "phone_look");
    expect(String(await call("t1", "phone_ask_user", { what: "在微信里登录你的账号" }))).toMatch(/themselves on Pixel Fold/);
    const mine = decisions.filter((d) => d.taskId === "t1" && d.phone?.kind === "user").at(-1)!;
    expect(mine.phone?.on?.device).toBe(phoneId);
    expect(await rejection(call("t1", "phone_look"))).toMatch(/user's turn on their phone/);
    expect(await until(() => app.pill()?.turn === "you")).toBe(true);
    core.decisions.decide(mine.decisionId, "go");
    expect(await until(() => app.pill()?.turn === "agent")).toBe(true);
    expect(String(await call("t1", "phone_look"))).toContain("com.tencent.mm");
    p.ws.close();
  });

  test("停下 / Stop from another window: the loan ends on the phone, the turn is interrupted, the task is told, tools refuse", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    expect((await clientCard()).handset?.using).toMatchObject({ taskId: "t1", title: "回妈妈的消息" });
    const other = new WebSocket(core.url);
    await new Promise<void>((res) => (other.onopen = () => res()));
    const got: ServerFrame[] = [];
    other.onmessage = (m) => got.push(JSON.parse(String(m.data)));
    other.send(JSON.stringify({ t: "hello" }));
    other.send(JSON.stringify({ t: "handset_stop", taskId: "t1" }));
    expect(await until(() => got.some((f) => f.t === "handset_stop_result"))).toBe(true);
    expect(got.find((f) => f.t === "handset_stop_result")).toMatchObject({ ok: true });
    expect(await until(() => app.session() === undefined)).toBe(true);
    expect(interrupted).toContain("t1");
    expect(told.some(([t, s]) => t === "t1" && s === HANDSET_STOPPED)).toBe(true);
    expect(await rejection(call("t1", "phone_look"))).toMatch(/stopped you/);
    expect(core.tasks.onHand().tasks.find((c) => c.taskId === "t1")?.handset).toBeUndefined();
    other.close();
    p.ws.close();
  });

  test("Stop on the phone's own pill (relayed by its page) ends the loan of that phone's task", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    openTask("t2", "看看小红书上的评价");
    await rejection(call("t2", "phone_look"));
    core.decisions.decide(decisions.find((d) => d.taskId === "t2" && d.handset)!.decisionId, "go");
    expect(await until(() => app.session() === "t2")).toBe(true);
    app.restart(); // the pill's Stop: the phone ended it itself
    p.send({ t: "handset_stop", from: "phone" });
    expect(await p.until((f) => f.t === "handset_stop_result")).toMatchObject({ ok: true });
    expect(told.some(([t, s]) => t === "t2" && s === HANDSET_STOPPED)).toBe(true);
    expect(await rejection(call("t2", "phone_look"))).toMatch(/stopped you/);
    p.ws.close();
  });

  test("the phone comes back without the loan (its app restarted): the loan is over on the home too", async () => {
    let p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    openTask("t3", "在美团上看看外卖");
    await rejection(call("t3", "phone_look"));
    core.decisions.decide(decisions.find((d) => d.taskId === "t3" && d.handset)!.decisionId, "go");
    expect(await until(() => app.session() === "t3")).toBe(true);
    p.ws.close();
    await until(async () => !(await clientCard()).handset?.linked);
    expect(await rejection(call("t3", "phone_look"))).toMatch(/can't be reached right now/);
    app.restart();
    p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    expect(await until(() => told.some(([t, s]) => t === "t3" && s === HANDSET_STOPPED))).toBe(true);
    expect(interrupted).toContain("t3");
    p.ws.close();
  });

  test("Hold: no phone for that task, and it is told so", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    openTask("t4", "帮我发个朋友圈");
    await rejection(call("t4", "phone_look"));
    core.decisions.decide(decisions.find((d) => d.taskId === "t4" && d.handset)!.decisionId, "hold");
    expect(await until(() => told.some(([t, s]) => t === "t4" && /said no/.test(s)))).toBe(true);
    expect(app.session()).toBeUndefined();
    expect(await rejection(call("t4", "phone_look"))).toMatch(/said no/);
    p.ws.close();
  });

  test("a task that finishes lets the phone go; removing the chip turns Android's switch off there", async () => {
    const p = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    openTask("t5", "查一下快递");
    await rejection(call("t5", "phone_look"));
    core.decisions.decide(decisions.find((d) => d.taskId === "t5" && d.handset)!.decisionId, "go");
    expect(await until(() => app.session() === "t5")).toBe(true);
    core.tasks.setState("t5", "done", "warm");
    expect(await until(() => app.session() === undefined)).toBe(true);
    p.send({ t: "handset_set", on: false });
    expect(await p.until((f) => f.t === "handset_set_result")).toMatchObject({ ok: true, on: false });
    expect(await until(() => app.did.includes("off"))).toBe(true);
    expect((await clientCard()).handset?.added).toBe(false);
    p.ws.close();
    // Taken off here: its app saying hello again with the switch still on doesn't add it back.
    const again = await pixel();
    await until(async () => !!(await clientCard()).handset?.linked);
    await Bun.sleep(100);
    expect((await clientCard()).handset?.added).toBe(false);
    again.ws.close();
  });

  test("the pill's step line in the person's words", () => {
    expect(doingLine({ kind: "tap", label: "发送" })).toBe("点「发送」");
    expect(doingLine({ kind: "look" })).toBe("在看屏幕");
    expect(doingLine({ kind: "waiting" })).toBe("");
  });
});
