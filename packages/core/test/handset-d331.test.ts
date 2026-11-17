// D331 through the real core: the phone's own link outside a loan, a Go while it is locked, and a lock
// that pauses a loan. On hel (task vrxcdgr9, 2026-11-17) the person tapped Go at 04:29:48 with Ducter
// closed on their Pixel Fold; nothing happened for an hour, and at 05:28 phone_look said "a card is
// asking them" though the card had been answered: the home was waiting for the phone's app to connect.
// Here the app's own link (bridge 4) is up while Android's switch is on, so a Go reaches it with Ducter
// closed; every wait is said as it stands (asking, waiting for the unlock, can't reach the phone and
// why, starting); and locking the phone pauses the loan until the person says on the phone to go on.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, HandsetState, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { AWAY_WHY, HANDSET_EXPIRED, HANDSET_PAUSED, HANDSET_PAUSED_ASKING, HANDSET_RESUMED, HANDSET_TAKEN, HANDSET_WAIT_ASKING, HANDSET_WAIT_AWAY, HANDSET_WAIT_UNLOCK } from "../src/handset/index.ts";
import { tempDir } from "./helpers.ts";

const xml = (pkg: string) =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="${pkg}" content-desc="" clickable="false" password="false" bounds="[0,0][1080,2400]"><node index="0" text="打开" resource-id="" class="android.widget.Button" package="${pkg}" content-desc="" clickable="true" password="false" bounds="[0,2200][900,2300]" /></node></hierarchy>`;

/** The app on the Pixel as Handset.kt answers since D331 (bridge 4). */
function fakeApp() {
  let session: string | undefined;
  let ended: { session: string; why: string } | undefined;
  let locked = false;
  let paused: "locked" | "asking" | undefined;
  let waiting: string | undefined;
  let quiet = false;
  const state = (): HandsetState => ({
    bridge: 4,
    sdk: 36,
    model: "Pixel Fold",
    service: true,
    restricted: false,
    pictures: true,
    awake: !locked,
    locked,
    link: "native",
    ...(session ? { session } : {}),
    ...(paused ? { paused } : {}),
    ...(waiting ? { waiting } : {}),
    ...(ended ? { ended: ended as HandsetState["ended"] } : {}),
  });
  const run = (m: string, a: any): { ok: boolean; result?: unknown; error?: string } => {
    if (m === "state") return { ok: true, result: state() };
    if (m === "start") {
      if (session && session !== a.session) return { ok: false, error: "this phone is lent to another task right now" };
      // D331: a Go on a locked phone waits for the unlock (and says so in a notification).
      if (locked && session !== a.session) return (waiting = a.session), { ok: false, error: "locked: this phone is locked; the loan starts when the person unlocks it" };
      waiting = undefined;
      session = a.session;
      return { ok: true, result: { session, ...(paused ? { paused } : {}) } };
    }
    if (m === "stop") {
      if (waiting && (!a.session || a.session === waiting)) waiting = undefined;
      if (session && (!a.session || a.session === session)) (session = undefined), (paused = undefined);
      return { ok: true };
    }
    if (!session || a.session !== session) return { ok: false, error: "Ducter isn't lent this phone right now" };
    if (m === "beat") return { ok: true };
    if (paused) return { ok: false, error: "paused: the phone is locked" };
    switch (m) {
      case "doing":
        return { ok: true };
      case "front":
        return { ok: true, result: { app: "com.android.chrome" } };
      case "screen":
        return { ok: true, result: { xml: xml("com.android.chrome") } };
      case "size":
        return { ok: true, result: { width: 1080, height: 2400 } };
    }
    return { ok: false, error: `not something this phone does: ${m}` };
  };
  return {
    run,
    state,
    session: () => session,
    waiting: () => waiting,
    setQuiet: (q: boolean) => void (quiet = q),
    quiet: () => quiet,
    lock() {
      locked = true;
      if (session) paused = "locked";
    },
    /** Unlocked: a paused loan asks in a notification; a waiting Go starts once the home hears. */
    unlock() {
      locked = false;
      if (paused) paused = "asking";
    },
    keepLending: () => void (paused = undefined),
    /** 不借了 / Not now on the phone: a paused loan, or a Go waiting for the unlock. */
    notNow() {
      const s = session ?? waiting;
      if (s) ended = { session: s, why: "taken" };
      session = undefined;
      waiting = undefined;
      paused = undefined;
      return s;
    },
  };
}

let td: ReturnType<typeof tempDir>;
let core: Core;
let phoneId = "";
let token = "";
const app = fakeApp();
const told: [string, string][] = [];
const decisions: Bodies["decision"][] = [];

/** The app's own link (hello client "handset"), up while Android's switch is on: no page, no Ducter open. */
async function native() {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${token}` } } as any);
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data)) as any;
    frames.push(f);
    if (f.t !== "handset_req" || app.quiet()) return;
    ws.send(JSON.stringify({ t: "handset_res", id: f.id, ...app.run(f.m, f.a) }));
  };
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello", client: "handset" }));
  const hello = () => ws.send(JSON.stringify({ t: "handset_hello", state: app.state() }));
  hello();
  await until(async () => !!(await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.linked);
  return { ws, frames, hello, send: (f: object) => ws.send(JSON.stringify(f)) };
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
const onHand = (taskId: string) => core.tasks.onHand().tasks.find((c) => c.taskId === taskId)?.handset;
const done = (taskId: string) => core.tasks.setState(taskId, "done", "parked");

async function lent(taskId: string) {
  openTask(taskId);
  expect(await rejection(call(taskId, "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
  core.decisions.decide(askOf(taskId).at(-1)!.decisionId, "go");
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
    handset: { callMs: 400, beatMs: 60, quietMs: 250, lostMs: 700, graceMs: 150, pauseMs: 1_500 },
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "server" },
  });
  const r = stubRunner(core);
  r.send = async (taskId, text) => (told.push([taskId, text]), { delivered: "prompted" });
  r.interrupt = async () => {};
  core.setRunner(r);
  core.setPartner({ onTrigger: () => {} });
  core.log.subscribe((e) => {
    if (e.kind === "decision") decisions.push(e.body as Bodies["decision"]);
  });
  const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name: "Pixel Fold", platform: "android-app" }) as { token: string; device: { id: string } };
  phoneId = paired.device.id;
  token = paired.token;
});

afterAll(async () => {
  await core?.stop();
  td?.cleanup();
});

describe("Use this phone with Ducter closed or the phone locked (D331)", () => {
  test("the hel case: a Go while the phone can't be reached is said as that (not as a card asking), and the loan starts when its own link connects", async () => {
    // The phone was added once (its switch on), then its app went away.
    let p = await native();
    expect(await until(async () => !!(await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.added)).toBe(true);
    openTask("h1");
    expect(await rejection(call("h1", "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
    // Before the Go: a card is asking, said as such.
    expect(await rejection(call("h1", "phone_look"))).toBe(HANDSET_WAIT_ASKING("Pixel Fold"));
    p.ws.close();
    expect(await until(async () => !(await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.linked)).toBe(true);
    core.decisions.decide(askOf("h1")[0]!.decisionId, "go");
    // Go given, the phone unreachable: the tool says so, with why (its own link dropped), and never "a card is asking".
    expect(await until(() => onHand("h1")?.wait === "away")).toBe(true);
    expect(onHand("h1")?.away).toBe("offline");
    const said = await rejection(call("h1", "phone_look"));
    expect(said).toBe(HANDSET_WAIT_AWAY("Pixel Fold", "offline"));
    expect(said).toContain(AWAY_WHY.offline);
    expect(said).not.toMatch(/card is asking/);
    expect(askOf("h1").length).toBe(1); // no second card
    // The app's own link comes back (Ducter still closed: no page at all): the loan starts by itself.
    p = await native();
    expect(await until(() => toldTo("h1").some((s) => MAY.test(s)))).toBe(true);
    expect(toldTo("h1").find((s) => MAY.test(s))).toMatch(/locking the phone pauses the loan until they say to carry on/);
    expect(app.session()).toBe("h1");
    expect(String(await call("h1", "phone_look"))).toContain("com.android.chrome");
    done("h1");
    expect(await until(() => app.session() === undefined)).toBe(true);
    p.ws.close();
  });

  test("a Go while the phone is locked waits for the unlock, says so everywhere, and starts the loan when it is unlocked", async () => {
    const p = await native();
    openTask("u1");
    expect(await rejection(call("u1", "phone_look"))).toMatch(/Asked the user/);
    app.lock();
    p.hello();
    await Bun.sleep(30);
    core.decisions.decide(askOf("u1")[0]!.decisionId, "go");
    expect(await until(() => app.waiting() === "u1")).toBe(true); // the phone's notification: 解锁就开始
    expect(await until(() => onHand("u1")?.wait === "unlock")).toBe(true);
    expect(await rejection(call("u1", "phone_look"))).toBe(HANDSET_WAIT_UNLOCK("Pixel Fold"));
    expect(app.session()).toBeUndefined(); // never through the lock
    app.unlock();
    p.hello(); // ACTION_USER_PRESENT: the app says so over its own link
    expect(await until(() => toldTo("u1").some((s) => MAY.test(s)))).toBe(true);
    expect(app.session()).toBe("u1");
    expect(onHand("u1")?.wait).toBeUndefined();
    done("u1");
    expect(await until(() => app.session() === undefined)).toBe(true);
    p.ws.close();
  });

  test("不借了 on the waiting notification ends it as the person's Not now: told once, and the next tool asks with a new card", async () => {
    const p = await native();
    openTask("n1");
    expect(await rejection(call("n1", "phone_look"))).toMatch(/Asked the user/);
    app.lock();
    p.hello();
    await Bun.sleep(30);
    core.decisions.decide(askOf("n1")[0]!.decisionId, "go");
    expect(await until(() => app.waiting() === "n1")).toBe(true);
    const s = app.notNow();
    p.send({ t: "handset_stop", taskId: s, from: "phone", why: "taken" });
    expect(await until(() => toldTo("n1").includes(HANDSET_TAKEN("Pixel Fold")))).toBe(true);
    expect(onHand("n1")).toBeUndefined();
    app.unlock();
    p.hello();
    await Bun.sleep(100);
    expect(app.session()).toBeUndefined(); // the Go was spent
    expect(await rejection(call("n1", "phone_look"))).toBe(HANDSET_TAKEN("Pixel Fold"));
    expect(await rejection(call("n1", "phone_look"))).toMatch(/Asked the user/);
    expect(askOf("n1").length).toBe(2);
    done("n1");
    p.ws.close();
  });

  test("locking during a loan pauses it (never lost while the locked phone is quiet); unlocking asks on the phone; Keep lending carries on", async () => {
    const p = await native();
    await lent("k1");
    app.lock();
    p.hello();
    expect(await until(() => toldTo("k1").includes(HANDSET_PAUSED("Pixel Fold")))).toBe(true);
    expect(onHand("k1")?.paused).toBe("locked");
    expect((await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.using?.paused).toBe("locked");
    expect(await rejection(call("k1", "phone_look"))).toBe(HANDSET_PAUSED("Pixel Fold"));
    // Locked in a pocket, its link quiet longer than the lost rule: the loan holds.
    app.setQuiet(true);
    await Bun.sleep(900);
    expect(toldTo("k1").some((s) => /Your loan of Pixel Fold ended/.test(s))).toBe(false);
    app.setQuiet(false);
    app.unlock();
    p.hello();
    expect(await until(() => toldTo("k1").includes(HANDSET_PAUSED_ASKING("Pixel Fold")))).toBe(true);
    expect(await rejection(call("k1", "phone_look"))).toBe(HANDSET_PAUSED_ASKING("Pixel Fold"));
    expect(app.session()).toBe("k1"); // never taken back by the lock alone
    app.keepLending();
    p.hello();
    expect(await until(() => toldTo("k1").includes(HANDSET_RESUMED("Pixel Fold")))).toBe(true);
    expect(onHand("k1")?.paused).toBeUndefined();
    expect(String(await call("k1", "phone_look"))).toContain("com.android.chrome");
    expect(toldTo("k1").filter((s) => MAY.test(s)).length).toBe(1); // one loan, paused and resumed
    done("k1");
    expect(await until(() => app.session() === undefined)).toBe(true);
    p.ws.close();
  });

  test("不借了 after unlocking gives it back as the person's Not now", async () => {
    const p = await native();
    await lent("t1");
    app.lock();
    p.hello();
    expect(await until(() => onHand("t1")?.paused === "locked")).toBe(true);
    app.unlock();
    p.hello();
    expect(await until(() => onHand("t1")?.paused === "asking")).toBe(true);
    app.notNow();
    p.hello();
    expect(await until(() => toldTo("t1").includes(HANDSET_TAKEN("Pixel Fold")))).toBe(true);
    expect(onHand("t1")).toBeUndefined();
    done("t1");
    p.ws.close();
  });

  test("a pause that lasts past its cap ends the loan, said once; Stop still gives it back at once", async () => {
    const p = await native();
    await lent("e1");
    app.lock();
    p.hello();
    expect(await until(() => onHand("e1")?.paused === "locked")).toBe(true);
    expect(await until(() => toldTo("e1").includes(HANDSET_EXPIRED("Pixel Fold", Math.round(1_500 / 60_000)))), 4000).toBe(true);
    expect(await until(() => app.session() === undefined)).toBe(true);
    done("e1");
    app.unlock();
    p.hello();
    await lent("e2");
    app.lock();
    p.hello();
    expect(await until(() => onHand("e2")?.paused === "locked")).toBe(true);
    expect(await core.handsets.stop("e2")).toBe(true);
    expect(onHand("e2")).toBeUndefined();
    done("e2");
    app.unlock();
    p.ws.close();
  });
});
