// D255 through the real core: the lent phone's own link, the loss said precisely and once, and the
// phone recording its own screen. On hel (2026-11-13) a loan died once Chrome was in front: the page
// in the app's web view carried the link and Android paused it; "lost" and "back" came 3 ms apart from
// one hello; six hours later the next tool said the old loss again and the task gave up; and
// phone_open_app said "Opened com.android.chrome" while another app was in front.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, HandsetRecording, HandsetState } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { HANDSET_BACK, HANDSET_RECORD_BLIND, mp4Duration } from "../src/handset/index.ts";
import { tempDir } from "./helpers.ts";

const xml = (pkg: string, labels: string[] = ["打开"], lines: string[] = []) =>
  `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="${pkg}" content-desc="" clickable="false" password="false" bounds="[0,0][1080,2400]">${lines.map((t, i) => `<node index="${i}" text="${t}" resource-id="" class="android.widget.TextView" package="${pkg}" content-desc="" clickable="false" password="false" bounds="[0,${100 + i * 100}][900,${180 + i * 100}]" />`).join("")}${labels.map((l, i) => `<node index="${i + 9}" text="${l}" resource-id="" class="android.widget.Button" package="${pkg}" content-desc="" clickable="true" password="false" bounds="[0,${1800 + i * 150}][900,${1900 + i * 150}]" />`).join("")}</node></hierarchy>`;

/** A tiny MP4: ftyp, then moov › mvhd (version 0) with a time scale and a length. */
function mp4(ms: number, pad = 0): Uint8Array {
  const box = (type: string, body: Uint8Array) => {
    const b = new Uint8Array(8 + body.length);
    new DataView(b.buffer).setUint32(0, b.length);
    b.set(new TextEncoder().encode(type), 4);
    b.set(body, 8);
    return b;
  };
  const mvhd = new Uint8Array(100);
  const dv = new DataView(mvhd.buffer);
  dv.setUint32(12, 1000); // time scale
  dv.setUint32(16, ms); // duration
  const ftyp = box("ftyp", new TextEncoder().encode("isom\0\0\0\0isommp42"));
  const moov = box("moov", box("mvhd", mvhd));
  const mdat = box("mdat", new Uint8Array(pad));
  const out = new Uint8Array(ftyp.length + moov.length + mdat.length);
  out.set(ftyp, 0);
  out.set(mdat, ftyp.length);
  out.set(moov, ftyp.length + mdat.length);
  return out;
}

/** The Ducter app on the Pixel since D255 (bridge 3): its own link while lent, and its own recorder. */
function fakeApp() {
  let session: string | undefined;
  let ended: { session: string; why: string } | undefined;
  let boot = "b1";
  let recording: HandsetRecording | undefined;
  let front = "com.android.chrome";
  let screen = xml("com.android.chrome");
  const calls: { via: string; m: string }[] = [];
  const state = (link: "native" | "page"): HandsetState => ({ bridge: 3, sdk: 36, model: "Pixel Fold", service: true, restricted: false, pictures: true, awake: true, locked: false, boot, link, gen: 1, ...(session ? { session } : {}), ...(ended ? { ended: ended as HandsetState["ended"] } : {}), ...(recording ? { recording } : {}) });
  const run = (via: string, m: string, a: any): { ok: boolean; result?: unknown; error?: string } => {
    calls.push({ via, m });
    if (m === "state") return { ok: true, result: state("native") };
    if (m === "start") return (session = a.session), { ok: true, result: { session } };
    if (m === "stop") {
      if (session && (!a.session || a.session === session)) session = undefined;
      return { ok: true };
    }
    if (!session || a.session !== session) return { ok: false, error: "Ducter isn't lent this phone right now" };
    switch (m) {
      case "beat":
      case "doing":
      case "launch":
        return { ok: true };
      case "front":
        return { ok: true, result: { app: front } };
      case "screen":
        return { ok: true, result: { xml: screen } };
      case "size":
        return { ok: true, result: { width: 1080, height: 2400 } };
      case "tap":
        return { ok: true };
      case "record":
        recording = { id: "r1", session, state: "asking" };
        return { ok: true, result: { id: "r1", state: "asking" } };
      case "record_stop":
        if (recording?.state !== "on") return { ok: false, error: "not recording" };
        recording = { ...recording, state: "saving", ms: 10_000, bytes: 0, name: "Ducter-1.mp4" };
        return { ok: true, result: { id: "r1", ms: 10_000 } };
    }
    return { ok: false, error: `not something this phone does: ${m}` };
  };
  return {
    run,
    state,
    calls,
    session: () => session,
    setFront: (f: string) => void (front = f),
    setScreen: (s: string) => void (screen = s),
    setRecording: (r: HandsetRecording | undefined) => void (recording = r),
    /** Android started the app's process again: no loan, no memory of one. */
    restart() {
      session = undefined;
      ended = undefined;
      boot = "b2";
    },
    end(why: string) {
      if (session) ended = { session, why };
      session = undefined;
    },
  };
}

let td: ReturnType<typeof tempDir>;
let core: Core;
let token = "";
const app = fakeApp();
const told: [string, string][] = [];
const decisions: Bodies["decision"][] = [];

/** One socket of the phone: its page (a web view's) or the app's own link (hello.client "handset"). */
async function sock(via: "page" | "native") {
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${token}` } } as any);
  const frames: any[] = [];
  let quiet = false;
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data)) as any;
    frames.push(f);
    if (f.t !== "handset_req" || quiet) return;
    ws.send(JSON.stringify({ t: "handset_res", id: f.id, ...app.run(via, f.m, f.a) }));
  };
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello", ...(via === "native" ? { client: "handset" } : {}) }));
  const hello = () => ws.send(JSON.stringify({ t: "handset_hello", state: app.state(via) }));
  hello();
  await Bun.sleep(50); // its hello is in (the first one adds the phone)
  return { ws, frames, hello, setQuiet: (q: boolean) => void (quiet = q), send: (f: object) => ws.send(JSON.stringify(f)) };
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
async function lent(taskId: string) {
  openTask(taskId);
  expect(await rejection(call(taskId, "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
  core.decisions.decide(askOf(taskId).at(-1)!.decisionId, "go");
  expect(await until(() => toldTo(taskId).some((s) => MAY.test(s)))).toBe(true);
}
const upload = (q: Record<string, string>, body: Uint8Array) =>
  fetch(`http://127.0.0.1:${core.port}/api/handset/recording?${new URLSearchParams(q)}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body });

beforeAll(async () => {
  td = tempDir();
  core = startCore({
    dataDir: join(td.dir, "home"),
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    push: false,
    platform: "linux",
    handset: { callMs: 400, beatMs: 60, quietMs: 250, lostMs: 700, graceMs: 150, recordWaitMs: 1500, endedMs: 300 },
    ownPhone: { openWaitMs: 500 },
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
  token = paired.token;
});

afterAll(async () => {
  await core?.stop();
  td?.cleanup();
});

describe("the phone's own link (D255)", () => {
  test("while lent, the app's own link carries the loan; a paused page doesn't end it; when that link drops, the page carries on", async () => {
    const page = await sock("page");
    await lent("n1");
    const native = await sock("native");
    await Bun.sleep(50);
    // The page goes quiet (Android paused it behind Chrome): beats and steps go over the app's own link.
    page.setQuiet(true);
    page.hello(); // its hellos are kept as the fallback, never taken over the link
    const before = app.calls.length;
    await Bun.sleep(900); // longer than lostMs
    expect(toldTo("n1").some((s) => /Your loan of Pixel Fold ended/.test(s))).toBe(false);
    expect(app.calls.slice(before).filter((c) => c.m === "beat").every((c) => c.via === "native")).toBe(true);
    expect(String(await call("n1", "phone_look"))).toContain("com.android.chrome");
    expect(app.calls.at(-1)!.via).toBe("native");
    // The app's own link drops (a network change): the page's link, awake again, carries on.
    page.setQuiet(false);
    native.ws.close();
    await Bun.sleep(100);
    expect(String(await call("n1", "phone_look"))).toContain("com.android.chrome");
    expect(app.calls.at(-1)!.via).toBe("page");
    expect(toldTo("n1").some((s) => /Your loan of Pixel Fold ended/.test(s))).toBe(false);
    core.tasks.setState("n1", "done", "parked");
    page.ws.close();
  });

  test("the hel case: the app was closed while lent; its next hello says so once, with no 'back' after it, and a later tool just asks again", async () => {
    const page = await sock("page");
    await lent("h1");
    app.restart(); // Android started the app's process again: it holds no loan and remembers none
    page.hello();
    expect(await until(() => toldTo("h1").some((s) => /Your loan of Pixel Fold ended: Android closed the Ducter app on it/.test(s)))).toBe(true);
    const lost = toldTo("h1").filter((s) => /Your loan of Pixel Fold ended/.test(s));
    expect(lost.length).toBe(1);
    expect(lost[0]).toMatch(/Its app answers again now/);
    await Bun.sleep(200);
    expect(toldTo("h1")).not.toContain(HANDSET_BACK("Pixel Fold"));
    // Hours later (here: past endedMs) the next tool doesn't repeat the old loss: it asks with one new card.
    await Bun.sleep(350);
    expect(await rejection(call("h1", "phone_look"))).toMatch(/Asked the user whether you may use Pixel Fold/);
    core.tasks.setState("h1", "done", "parked");
    page.ws.close();
  });

  test("the phone's own link couldn't reach the home: said as its network", async () => {
    const page = await sock("page");
    await lent("w1");
    app.end("network");
    page.send({ t: "handset_stop", from: "phone", why: "network" });
    expect(await until(() => toldTo("w1").some((s) => /Your loan of Pixel Fold ended: the phone couldn't reach the home for 15 s/.test(s)))).toBe(true);
    core.tasks.setState("w1", "done", "parked");
    page.ws.close();
  });
});

describe("phone_open_app says opened only when it is in front (D255)", () => {
  test("another app in front: the tool says which, never 'Opened'", async () => {
    const page = await sock("page");
    await lent("o1");
    app.setFront("com.google.android.apps.nexuslauncher");
    const e = await rejection(call("o1", "phone_open_app", { app: "com.android.chrome" }));
    expect(e).toMatch(/Asked the phone to open com.android.chrome, but com.google.android.apps.nexuslauncher is in front/);
    app.setFront("com.android.chrome");
    expect(String(await call("o1", "phone_open_app", { app: "com.android.chrome" }))).toMatch(/Opened com.android.chrome; it is in front/);
    core.tasks.setState("o1", "done", "parked");
    page.ws.close();
  });
});

describe("Ducter records the lent phone's screen (D255)", () => {
  test("Android asks the person; the task is blind meanwhile; it records; stop brings the video back, checked", async () => {
    const page = await sock("page");
    await lent("r1");
    expect(String(await call("r1", "phone_record_start"))).toMatch(/Android is asking the user on Pixel Fold whether Ducter may record its screen/);
    // Android's dialog is on the phone: the task can't see or tap it.
    expect(await rejection(call("r1", "phone_look"))).toBe(HANDSET_RECORD_BLIND("Pixel Fold"));
    // The person taps Start.
    app.setRecording({ id: "r1", session: "r1", state: "on", since: Date.now() });
    page.hello();
    expect(await until(() => toldTo("r1").some((s) => /Recording Pixel Fold's screen now/.test(s)))).toBe(true);
    expect(String(await call("r1", "phone_look"))).toContain("com.android.chrome");
    // Stop: the app finishes the file and sends it; the tool answers once the home checked it.
    const stopped = call("r1", "phone_record_stop");
    await until(() => app.calls.some((c) => c.m === "record_stop"));
    const video = mp4(10_000, 2048);
    // A video that isn't what the phone said is refused.
    expect((await upload({ id: "r1", session: "r1", ms: "10000", bytes: String(video.length + 1) }, video)).status).toBe(422);
    expect((await upload({ id: "r1", session: "r1", ms: "10000", bytes: "8" }, new TextEncoder().encode("not mp4!"))).status).toBe(422);
    expect((await upload({ id: "nope", session: "r1", ms: "10000", bytes: String(video.length) }, video)).status).toBe(404);
    expect((await upload({ id: "r1", session: "r1", ms: "10000", bytes: String(video.length), name: "Ducter-1.mp4" }, video)).status).toBe(200);
    const said = String(await stopped);
    expect(said).toMatch(/The recording is saved and checked: 10\.0 s, .* MB, an MP4 video at /);
    const path = said.match(/ at (\S+\.mp4)\./)![1]!;
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).length).toBe(video.length);
    app.setRecording(undefined);
    core.tasks.setState("r1", "done", "parked");
    page.ws.close();
  });

  test("the loan ends while recording: what was recorded comes back, marked partial", async () => {
    const page = await sock("page");
    await lent("p1");
    await call("p1", "phone_record_start");
    app.setRecording({ id: "r1", session: "p1", state: "on", since: Date.now() });
    page.hello();
    expect(await until(() => toldTo("p1").some((s) => /Recording Pixel Fold's screen now/.test(s)))).toBe(true);
    // The person locks the phone: the loan ends, and the recording with it.
    app.end("locked");
    app.setRecording({ id: "r1", session: "p1", state: "saving", partial: true });
    page.send({ t: "handset_stop", from: "phone", why: "locked" });
    expect(await until(() => toldTo("p1").some((s) => /The screen recording stopped with it/.test(s)))).toBe(true);
    const video = mp4(4_200);
    expect((await upload({ id: "r1", session: "p1", ms: "4200", bytes: String(video.length), partial: "1" }, video)).status).toBe(200);
    expect(await until(() => toldTo("p1").some((s) => /The recording stopped early \(the user locked the phone\); what was recorded is saved and checked: 4\.2 s/.test(s)))).toBe(true);
    app.setRecording(undefined);
    core.tasks.setState("p1", "done", "parked");
    page.ws.close();
  });

  test("the person says no on Android's dialog: the task hears it once", async () => {
    const page = await sock("page");
    await lent("d1");
    await call("d1", "phone_record_start");
    app.setRecording({ id: "r1", session: "d1", state: "declined", error: "the user didn't allow it" });
    page.hello();
    expect(await until(() => toldTo("d1").some((s) => /The recording of Pixel Fold's screen didn't start: the user didn't allow it/.test(s)))).toBe(true);
    expect(String(await call("d1", "phone_look"))).toContain("com.android.chrome"); // no longer blind
    app.setRecording(undefined);
    core.tasks.setState("d1", "done", "parked");
    page.ws.close();
  });

  test("Android's recording dialog and the recorder's Stop are never a task's tap", async () => {
    const page = await sock("page");
    await lent("c1");
    app.setScreen(xml("com.android.systemui", ["Cancel", "Start"], ["Start recording or casting with Ducter?"]));
    await call("c1", "phone_look");
    expect(await rejection(call("c1", "phone_tap", { ref: 2 }))).toMatch(/only they answer it/);
    app.setScreen(xml("com.android.systemui", ["Stop recording"]));
    await call("c1", "phone_look");
    expect(await rejection(call("c1", "phone_tap", { ref: 1 }))).toMatch(/starts or stops a screen recording.*needs the user's Go first/);
    app.setScreen(xml("com.android.chrome"));
    core.tasks.setState("c1", "done", "parked");
    page.ws.close();
  });
});

describe("mp4Duration", () => {
  test("reads the movie header's length; anything else is not a video", () => {
    expect(mp4Duration(mp4(12_345, 100))).toBe(12_345);
    expect(mp4Duration(new TextEncoder().encode("hello world, not a video"))).toBeUndefined();
  });
});
