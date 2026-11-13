// D247 through the real core: work that needs a phone, on a Linux home with no phone set up, while
// the person's Android app is connected but 用这台手机 / Use this phone isn't on there. The task
// opens; its first phone tool shows one card (去打开 / Turn it on); Go, from any window, opens the
// guide on that phone; once Android's switch is on there the task goes on by itself. With no
// Android app connected, nothing opens and the partner hears one line naming the one thing to do.
// Never adb, a cable or Developer options.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { NO_PHONE, noPhoneLine } from "../src/candidates.ts";
import { HANDSET_SETUP_NO } from "../src/handset/index.ts";
import { tempDir } from "./helpers.ts";

const ADB = /adb|USB|wireless debugging|Developer options|cable/i;

let td: ReturnType<typeof tempDir>;
let core: Core;
let phoneId = "";
let token = "";
const told: [string, string][] = [];
const decisions: Bodies["decision"][] = [];
let service = false;
let session: string | undefined;

/** The Pixel's page over a real socket: Android's switch as `service` says; the app answers start/stop. */
async function pixel() {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${token}` } } as any);
  const state = () => ({ bridge: 1, sdk: 36, model: "Pixel Fold", service, restricted: false, pictures: true, ...(session ? { session } : {}) });
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data)) as any;
    frames.push(f);
    if (f.t === "handset_req") {
      if (f.m === "start") session = f.a.session;
      if (f.m === "stop") session = undefined;
      ws.send(JSON.stringify({ t: "handset_res", id: f.id, ok: true, result: f.m === "screen" ? { xml: "" } : null }));
    }
  };
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  ws.send(JSON.stringify({ t: "handset_hello", state: state() }));
  return { ws, frames, send: (f: object) => ws.send(JSON.stringify(f)), hello: () => ws.send(JSON.stringify({ t: "handset_hello", state: state() })) };
}
const until = async (ok: () => boolean | Promise<boolean>, ms = 3000) => {
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
const openTask = (taskId: string, title: string) => {
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "claude-code", brief: title, needs: { phone: true } } as any });
  core.tasks.setState(taskId, "working", "hot");
};
const linked = async () => !!(await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.linked;

beforeAll(async () => {
  td = tempDir();
  core = startCore({ dataDir: join(td.dir, "home"), port: 0, batchMs: 5, sweepMs: 50, push: false, platform: "linux", deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "server" } });
  const r = stubRunner(core);
  r.send = async (taskId, text) => (told.push([taskId, text]), { delivered: "prompted" });
  r.interrupt = async () => {};
  core.setRunner(r);
  core.setPartner({ onTrigger: () => {} });
  core.log.subscribe((e) => {
    if (e.kind === "decision") decisions.push(e.body as Bodies["decision"]);
  });
});

afterAll(async () => {
  await core?.stop();
  td?.cleanup();
});

describe("a phone task with no phone set up (D247)", () => {
  test("no Android phone at all: nothing opens; the line says install Ducter there, never adb", async () => {
    const pick = await core.loadout.choose({ title: "在小红书看看", needs: { phone: true } });
    expect(pick).toEqual({ none: NO_PHONE });
    expect(NO_PHONE.indexOf("用这台手机")).toBeLessThan(NO_PHONE.indexOf("用手机 /"));
    expect(NO_PHONE).toMatch(/Never suggest adb/);
  });

  test("its Android app paired but not open: the line names the phone and says open Ducter there", async () => {
    const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name: "Pixel Fold · Ducter", platform: "android-app" }) as { token: string; device: { id: string } };
    phoneId = paired.device.id;
    token = paired.token;
    const pick = (await core.loadout.choose({ title: "在小红书看看", needs: { phone: true } })) as { none: string };
    expect(pick.none).toMatch(/Ducter isn't open on Pixel Fold/);
    expect(pick.none).toMatch(/用这台手机 \/ Use this phone/);
    expect(pick.none.replace(/Never suggest[^.]*\./, "")).not.toMatch(ADB);
    // An app too old to lend the phone: update it.
    expect(noPhoneLine([{ name: "Pixel 7 · Ducter", platform: "android-app", connected: true, handset: { added: false, able: false, linked: true } }])).toMatch(/update Ducter on Pixel 7/);
  });

  test("its app connected without 用这台手机: the task opens; the first phone tool shows one card, never adb", async () => {
    const p = await pixel();
    expect(await until(linked)).toBe(true);
    const pick = await core.loadout.choose({ title: "在小红书看看", needs: { phone: true } });
    expect(pick && "none" in pick).toBe(false);

    openTask("s1", "看看京都红叶");
    const msg = await rejection(call("s1", "phone_look"));
    expect(msg).toMatch(/Use this phone \(用这台手机\) isn't on yet on Pixel Fold/);
    expect(msg).toMatch(/End your turn/);
    const card = decisions.find((d) => d.taskId === "s1" && d.handset)!;
    expect(card).toMatchObject({ handset: { kind: "setup", device: phoneId }, defaultOption: "hold", reversible: false });
    expect(card.defaultAt).toBeUndefined();
    expect(card.question).toContain("打开「用这台手机」");
    // Asking again doesn't stack cards.
    expect(await rejection(call("s1", "phone_look"))).toMatch(/Waiting for the user to turn on Use this phone/);
    expect(decisions.filter((d) => d.taskId === "s1" && d.handset)).toHaveLength(1);

    // Go (from any window): the guide opens on that phone.
    core.decisions.decide(card.decisionId, "go");
    expect(await until(() => p.frames.some((f) => f.t === "handset_guide"))).toBe(true);
    expect(session).toBeUndefined();

    // The person flips Android's switch; the guide adds it (as handset.tsx does); the task goes on.
    service = true;
    p.hello();
    p.send({ t: "handset_set", on: true });
    expect(await until(() => session === "s1")).toBe(true);
    expect(await until(() => told.some(([t, s]) => t === "s1" && /You may use Pixel Fold/.test(s)))).toBe(true);
    expect(told.every(([, s]) => !/adb|USB|cable/i.test(s.replace(/Never ask[^.]*\./, "")))).toBe(true);
    // Now it is an ordinary loan.
    expect(await call("s1", "phone_look")).toBeDefined();
    core.tasks.setState("s1", "done", "parked");
    p.ws.close();
  });

  test("Android's switch already on, chip never added: Go adds it and the task goes on, no guide needed", async () => {
    core.handsets.set(phoneId, false);
    service = true;
    session = undefined;
    const p = await pixel();
    expect(await until(linked)).toBe(true);
    openTask("s2", "回妈妈的消息");
    await rejection(call("s2", "phone_look"));
    const card = decisions.find((d) => d.taskId === "s2" && d.handset)!;
    expect(card.handset?.kind).toBe("setup");
    core.decisions.decide(card.decisionId, "go");
    expect(await until(() => session === "s2")).toBe(true);
    expect(p.frames.some((f) => f.t === "handset_guide")).toBe(false);
    core.tasks.setState("s2", "done", "parked");
    p.ws.close();
  });

  test("Not now: the task is told to carry on without a phone, and its phone tools refuse", async () => {
    core.handsets.set(phoneId, false);
    service = false;
    session = undefined;
    const p = await pixel();
    expect(await until(linked)).toBe(true);
    openTask("s3", "看看外卖");
    await rejection(call("s3", "phone_look"));
    const card = decisions.find((d) => d.taskId === "s3" && d.handset)!;
    core.decisions.decide(card.decisionId, "hold");
    expect(await until(() => told.some(([t, s]) => t === "s3" && s === HANDSET_SETUP_NO))).toBe(true);
    expect(await rejection(call("s3", "phone_look"))).toBe(HANDSET_SETUP_NO);
    p.ws.close();
  });
});
