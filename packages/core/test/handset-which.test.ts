// D251 through the real core: which phone a phone task uses, on a Mac home where Ducter's own phone
// (用手机) is installed and the person's Pixel is paired. On hel a task for the author's own Pixel was
// given Ducter's emulator silently, because Ducter's phone could serve "a phone task". Now the work
// says which: "mine" never falls to Ducter's phone (the Pixel's card offers to turn 用这台手机 on;
// 先不用 is told plainly and reports blocked), "ducter" never takes the person's phone, and true
// (before D251) keeps D238 and D247 as they were.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { DUCTER_NO_PHONE, MINE_NO_PHONE, noPhoneLine } from "../src/candidates.ts";
import { HANDSET_MINE_NO, HANDSET_MINE_NONE, HANDSET_REMOVED } from "../src/handset/index.ts";
import { tempDir } from "./helpers.ts";

let td: ReturnType<typeof tempDir>;
let core: Core;
let phoneId = "";
let token = "";
const told: [string, string][] = [];
const decisions: Bodies["decision"][] = [];
let service = false;
let session: string | undefined;
/** Every time Ducter's own phone (the emulator) was asked to start. */
let emulator = 0;

async function pixel() {
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${token}` } } as any);
  const state = () => ({ bridge: 1, sdk: 36, model: "Pixel Fold", service, restricted: false, pictures: true, ...(session ? { session } : {}) });
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data)) as any;
    if (f.t === "handset_req") {
      if (f.m === "start") session = f.a.session;
      if (f.m === "stop") session = undefined;
      ws.send(JSON.stringify({ t: "handset_res", id: f.id, ok: true, result: f.m === "screen" ? { xml: "" } : null }));
    }
  };
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  ws.send(JSON.stringify({ t: "handset_hello", state: state() }));
  return { ws };
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
const openTask = (taskId: string, phone: true | "mine" | "ducter") => {
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: taskId, project: "", place: { kind: "none" }, harness: "claude-code", brief: taskId, needs: { phone } } as any });
  core.tasks.setState(taskId, "working", "hot");
};
const linked = async () => !!(await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.linked;
const cardOf = (taskId: string) => decisions.find((d) => d.taskId === taskId && d.handset);

beforeAll(async () => {
  td = tempDir();
  const dataDir = join(td.dir, "home");
  // Ducter's phone installed here: a stand-in install (the files the home checks); it never boots.
  const ph = join(dataDir, "phone");
  for (const f of ["sdk/platform-tools/adb", "sdk/emulator/emulator"]) {
    mkdirSync(join(ph, f, ".."), { recursive: true });
    writeFileSync(join(ph, f), "");
  }
  writeFileSync(join(ph, "installed.json"), JSON.stringify({ packages: [{ path: "emulator", version: "stand-in" }], licenses: [], at: new Date().toISOString() }));
  core = startCore({
    dataDir,
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    push: false,
    platform: "darwin",
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "laptop" },
    ownPhone: {
      platform: "darwin",
      arch: "arm64",
      device: {
        run: async (argv) => (argv.includes("start-server") && emulator++, { code: 1, out: new Uint8Array(), err: "stand-in" }),
        launch: () => ({ pid: 1, exited: Promise.resolve(1) }),
      },
    },
  });
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

describe("which phone a phone task uses (D251)", () => {
  test("the person's own phone with no Android phone paired: nothing opens, and Ducter's phone never stands in", async () => {
    expect(core.ducterPhone?.setup().state).toBe("ready");
    expect(await core.loadout.choose({ title: "看看微信", needs: { phone: "mine" } })).toEqual({ none: MINE_NO_PHONE });
    expect(MINE_NO_PHONE).toMatch(/never open it there by yourself/);
    // Ducter's own phone, and either: it is there, so they open.
    for (const phone of ["ducter", true] as const) {
      const pick = await core.loadout.choose({ title: "试试注册", needs: { phone } });
      expect(pick && "none" in pick).toBe(false);
    }
    // Work for Ducter's phone where there is none: 用手机, never the person's phone.
    expect(noPhoneLine([], "ducter")).toBe(DUCTER_NO_PHONE);
    expect(DUCTER_NO_PHONE).toMatch(/用手机 \/ Use a phone/);
    expect(DUCTER_NO_PHONE).not.toMatch(/用这台手机/);
  });

  test("mine, their Pixel connected without 用这台手机, Ducter's phone right here: the card, never the emulator", async () => {
    const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name: "Pixel Fold · Ducter", platform: "android-app" }) as { token: string; device: { id: string } };
    phoneId = paired.device.id;
    token = paired.token;
    const p = await pixel();
    expect(await until(linked)).toBe(true);
    const pick = await core.loadout.choose({ title: "看看微信", needs: { phone: "mine" } });
    expect(pick && "none" in pick).toBe(false);

    openTask("m1", "mine");
    expect(await rejection(call("m1", "phone_look"))).toMatch(/Use this phone \(用这台手机\) isn't on yet on Pixel Fold/);
    expect(cardOf("m1")).toMatchObject({ handset: { kind: "setup", device: phoneId } });
    expect(emulator).toBe(0);

    // 先不用: told plainly it has no phone of theirs; never another phone by itself.
    core.decisions.decide(cardOf("m1")!.decisionId, "hold");
    expect(await until(() => told.some(([t, s]) => t === "m1" && s === HANDSET_MINE_NO))).toBe(true);
    expect(HANDSET_MINE_NO).toMatch(/Report blocked/);
    expect(HANDSET_MINE_NO).toMatch(/never switch by yourself/);
    expect(await rejection(call("m1", "phone_look"))).toBe(HANDSET_MINE_NO);
    expect(emulator).toBe(0);
    p.ws.close();
    // Its app gone too: still never the emulator.
    await until(async () => !(await linked()));
    expect(await rejection(call("m1", "phone_look"))).toBe(HANDSET_MINE_NO);
    expect(emulator).toBe(0);
    core.tasks.setState("m1", "done", "parked");
  });

  test("mine, their phone's app not open and not added: the tools say so; never the emulator", async () => {
    openTask("m2", "mine");
    expect(await rejection(call("m2", "phone_look"))).toBe(HANDSET_MINE_NONE);
    expect(cardOf("m2")).toBeUndefined();
    expect(emulator).toBe(0);
    core.tasks.setState("m2", "done", "parked");
  });

  test("true (before D251), the Pixel connected but not added: Ducter's phone as before (D238, D247)", async () => {
    const p = await pixel();
    expect(await until(linked)).toBe(true);
    openTask("a1", true);
    expect(await rejection(call("a1", "phone_look"))).toMatch(/Ducter's phone quit while starting/);
    expect(emulator).toBe(1);
    expect(cardOf("a1")).toBeUndefined();
    core.tasks.setState("a1", "done", "parked");
    p.ws.close();
    await until(async () => !(await linked()));
  });

  test("mine with the Pixel added: it asks to borrow it, and phone_look says it is the person's own phone", async () => {
    service = true; // Android's switch on: the hello adds it
    const p = await pixel();
    expect(await until(async () => !!(await core.devicesView.frame()).reach.clients.find((c) => c.id === phoneId)?.handset?.added)).toBe(true);
    openTask("m3", "mine");
    expect(await rejection(call("m3", "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
    expect(cardOf("m3")).toMatchObject({ handset: { kind: "use", device: phoneId } });
    core.decisions.decide(cardOf("m3")!.decisionId, "go");
    expect(await until(() => session === "m3")).toBe(true);
    // D253: the loan is the task's once it is announced (after a first read answered).
    expect(await until(() => told.some(([t, s]) => t === "m3" && /You may use/.test(s)))).toBe(true);
    const look = await call("m3", "phone_look");
    expect(typeof look === "string" ? look : look.content[0].text).toMatch(/^Phone: Pixel Fold · Ducter, the user's own phone/);
    expect(emulator).toBe(1);
    core.tasks.setState("m3", "done", "parked");
    await until(() => session === undefined);

    // ducter: Ducter's own phone even with the person's added; their phone is never asked.
    openTask("d1", "ducter");
    expect(await rejection(call("d1", "phone_look"))).toMatch(/Ducter's phone quit while starting/);
    expect(emulator).toBe(2);
    expect(cardOf("d1")).toBeUndefined();
    expect(core.handsets.where("d1")).toBeUndefined();
    core.tasks.setState("d1", "done", "parked");
    p.ws.close();
  });

  test("D253: a phone task keeps the phone it began on, for its life: never moved to the other one", async () => {
    const p = await pixel();
    expect(await until(linked)).toBe(true);
    // Begun on the Pixel (added): taking 用这台手机 off ends it there, and never moves it to the emulator.
    openTask("a2", true);
    expect(await rejection(call("a2", "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
    const before = emulator;
    expect(core.handsets.set(phoneId, false)).toEqual({ ok: true });
    expect(await rejection(call("a2", "phone_look"))).toBe(HANDSET_REMOVED("Pixel Fold · Ducter"));
    expect(await rejection(call("a2", "phone_tap", { x: 1, y: 1 }))).toBe(HANDSET_REMOVED("Pixel Fold · Ducter"));
    expect(emulator).toBe(before);
    core.tasks.setState("a2", "done", "parked");

    // Begun on Ducter's phone (the Pixel not added): adding the Pixel mid-task doesn't move it there.
    openTask("a3", true);
    expect(await rejection(call("a3", "phone_look"))).toMatch(/Ducter's phone quit while starting/);
    expect(emulator).toBe(before + 1);
    expect(core.handsets.set(phoneId, true)).toEqual({ ok: true });
    expect(await rejection(call("a3", "phone_look"))).toMatch(/Ducter's phone quit while starting/);
    expect(emulator).toBe(before + 2);
    expect(cardOf("a3")).toBeUndefined();
    expect(core.handsets.where("a3")).toBeUndefined();
    core.tasks.setState("a3", "done", "parked");
    p.ws.close();
  });
});
