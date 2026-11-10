// D187: updating a Mac from the phone. The Ducter on that Mac (a worker for a home elsewhere, or
// the home itself) asks the app it lives in, through two files in the shared data folder; the app
// is faked here by what it writes (apps/desktop/internal/update/asks.go is the real one, with its
// own Go tests). The card shows the app's steps, the restart waits for the safe point, a closed
// app is said plainly and nothing is started, and the outcome comes from the restarted Ducter.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { DeviceView, ServerFrame } from "@ducter/protocol";
import { appFile, askApp, askFile, type AppAsk, type AppSide } from "../src/app-update.ts";
import { startCore, type Core } from "../src/core.ts";
import type { DeviceProbes } from "../src/devices.ts";
import { readResult, realSys } from "../src/update.ts";
import { createReleaseWatch } from "../src/release.ts";
import { createUpdates } from "../src/updates.ts";
import { createWorkerUpdater } from "../../cli/src/update.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const sys = { now: () => Date.now(), sleep: (ms: number) => Bun.sleep(Math.min(ms, 5)) };

/** The app on the Mac, as its files say it: answers asks the way asks.go does. */
function fakeApp(dir: string, o: { current?: string; get?: "ok" | "checksum" | "nothing" | "owner"; pid?: number } = {}) {
  const st: AppSide = { pid: o.pid ?? 4242, current: o.current ?? "0.0.12", state: "uptodate", canRestart: o.get !== "owner", at: new Date().toISOString() };
  const restarts: AppAsk[] = [];
  let seen = "";
  const write = () => {
    mkdirSync(join(dir, "updates"), { recursive: true });
    writeFileSync(appFile(dir), JSON.stringify({ ...st, at: new Date().toISOString() }));
  };
  let step = 0;
  const timer = setInterval(() => {
    if (existsSync(askFile(dir))) {
      const a: AppAsk = JSON.parse(readFileSync(askFile(dir), "utf8"));
      if (a.id + a.step !== seen) {
        seen = a.id + a.step;
        if (a.step === "restart") {
          rmSync(askFile(dir));
          restarts.push(a);
          st.state = "restarting";
          st.asked = a.id;
        } else step = 1;
      }
      if (step > 0 && step < 4) {
        step++;
        if (step === 2) Object.assign(st, { state: "downloading", version: a.to, progress: 0.5 });
        if (step === 3) Object.assign(st, { progress: 1 });
        if (step === 4) {
          if (o.get === "checksum") Object.assign(st, { state: "failed", reason: "checksum", detail: "doesn't match SHA256SUMS.txt", asked: a.id });
          else if (o.get === "nothing") Object.assign(st, { state: "uptodate", version: undefined, asked: a.id });
          else Object.assign(st, { state: "ready", progress: 1, asked: a.id });
        }
      }
    }
    write();
  }, 5);
  write();
  const stop = () => clearInterval(timer);
  stops.push(stop);
  return { st, restarts, stop, write };
}

test("asks the app: its steps, then the safe point, then the restart; the outcome is left for the restarted Ducter", async () => {
  const dir = tempDir();
  stops.push(dir.cleanup);
  const app = fakeApp(dir.dir);
  const phases: string[] = [];
  let settled = false;
  const r = await askApp({ dataDir: dir.dir, current: "0.0.12", to: "0.0.13", sys, pollMs: 5, settle: async () => ((settled = true), undefined), onPhase: (p) => phases.push(p) });
  expect(r).toEqual({ ok: true, restarting: true });
  expect(settled).toBe(true);
  expect([...new Set(phases)]).toEqual(["downloading", "verifying", "waiting", "restarting"]);
  await Bun.sleep(30);
  expect(app.restarts.map((a) => a.to)).toEqual(["0.0.13"]);
  expect(readResult(dir.dir)).toMatchObject({ from: "0.0.12", to: "0.0.13", ok: true });
});

test("the app closed, or the Mac asleep: said at once, nothing asked", async () => {
  const dir = tempDir();
  stops.push(dir.cleanup);
  expect(await askApp({ dataDir: dir.dir, current: "0.0.12", to: "0.0.13", sys })).toMatchObject({ ok: false, reason: "app_closed" });
  // An app.json that went quiet a minute ago is a closed app too.
  mkdirSync(join(dir.dir, "updates"), { recursive: true });
  writeFileSync(appFile(dir.dir), JSON.stringify({ current: "0.0.12", state: "uptodate", at: new Date(Date.now() - 60_000).toISOString() }));
  expect(await askApp({ dataDir: dir.dir, current: "0.0.12", to: "0.0.13", sys })).toMatchObject({ ok: false, reason: "app_closed" });
  expect(existsSync(askFile(dir.dir))).toBe(false);
});

test("the app's own reasons come back as the card's: a bad download, nothing newer, a password at the Mac", async () => {
  for (const [get, reason] of [["checksum", "checksum"], ["nothing", "no_release"], ["owner", "app_password"]] as const) {
    const dir = tempDir();
    stops.push(dir.cleanup);
    const app = fakeApp(dir.dir, { get });
    let settled = false;
    const r = await askApp({ dataDir: dir.dir, current: "0.0.12", to: "0.0.13", sys, pollMs: 5, settle: async () => ((settled = true), undefined) });
    expect(r).toMatchObject({ ok: false, reason });
    expect(settled).toBe(false); // nothing waited for, nothing restarted
    expect(app.restarts).toEqual([]);
  }
});

test("a merge mid-way holds the restart: the safe point's answer stops it before anything restarts", async () => {
  const dir = tempDir();
  stops.push(dir.cleanup);
  const app = fakeApp(dir.dir);
  const r = await askApp({ dataDir: dir.dir, current: "0.0.12", to: "0.0.13", sys, pollMs: 5, settle: async () => ({ ok: false, reason: "busy" }) });
  expect(r).toMatchObject({ ok: false, reason: "busy" });
  await Bun.sleep(30);
  expect(app.restarts).toEqual([]);
});

test("the app already current, its worker on the old helper: only the restart is asked", async () => {
  const dir = tempDir();
  stops.push(dir.cleanup);
  const app = fakeApp(dir.dir, { current: "0.0.13" });
  expect(await askApp({ dataDir: dir.dir, current: "0.0.12", to: "0.0.13", sys, pollMs: 5 })).toEqual({ ok: true, restarting: true });
  await Bun.sleep(30);
  expect(app.restarts.map((a) => a.to)).toEqual(["0.0.13"]);
});

test("the swap didn't take: the app that opens again on the old version says so, and the card says 没更新成", async () => {
  const dir = tempDir();
  stops.push(dir.cleanup);
  const app = fakeApp(dir.dir);
  let after: unknown;
  const r = await askApp({ dataDir: dir.dir, current: "0.0.12", to: "0.0.13", sys, pollMs: 5, onAfter: (f) => (after = f) });
  expect(r.ok).toBe(true);
  // The old app is back (another process), its updater saying the swap didn't happen.
  app.stop();
  writeFileSync(appFile(dir.dir), JSON.stringify({ pid: 999, current: "0.0.12", state: "failed", reason: "install", detail: "update: couldn't move the new version in; the old one is back", at: new Date().toISOString() }));
  for (let i = 0; i < 100 && !after; i++) await Bun.sleep(5);
  expect(after).toMatchObject({ ok: false, reason: "failed", detail: "update: couldn't move the new version in; the old one is back" });
  expect(readResult(dir.dir)).toMatchObject({ ok: false, from: "0.0.12", to: "0.0.13" });
});

// ---------- end to end: the phone's tap on a Mac that does tasks for hel ----------

const probes: Partial<DeviceProbes> = { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" };

function boot(): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50, deviceProbes: probes, update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.13" })), how: "self", version: "0.0.13", autoEveryMs: 0, graceMs: 50 } });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return core;
}

async function client(url: string) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 600; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

type Devices = Extract<ServerFrame, { t: "devices" }>;

async function macWorker(core: Core, macDir: string, hello: object = {}) {
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "Macbook Pro M3", platform: "darwin-arm64" }) as { token: string; device: { id: string } };
  const updater = createWorkerUpdater({ dataDir: macDir, version: "0.0.12", how: "app", ask: (i) => askApp({ ...i, sys, pollMs: 5 }) });
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${w.token}` } } as any);
  await new Promise<void>((res) => (ws.onopen = () => res()));
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t === "req" && f.op === "update") void updater.handle(f, (x) => ws.send(JSON.stringify(x)), { critical: () => 0, turning: () => 0 });
  };
  ws.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", version: "0.0.12", how: "app", asksApp: true, ...hello }));
  stops.push(() => ws.close());
  return w.device.id;
}

test("the phone's 更新 on the Mac's card: the app downloads, checks, restarts at the safe point; the card follows each step", async () => {
  const core = boot();
  await core.release.check(true);
  const mac = tempDir();
  stops.push(mac.cleanup);
  const app = fakeApp(mac.dir);
  const id = await macWorker(core, mac.dir);
  const phone = await client(core.url);
  phone.send({ t: "devices" });
  const f = await phone.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.id === id && d.state === "awake"));
  expect(f.devices.find((d) => d.id === id)!.update).toMatchObject({ current: "0.0.12", latest: "0.0.13", available: true, how: "app", fromHere: true });

  const n = phone.frames.length;
  phone.send({ t: "device_update", device: id });
  expect(await phone.until((x) => x.t === "update_result", n)).toMatchObject({ ok: true, device: id });
  await phone.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.id === id && d.update?.phase === "restarting"), n);
  expect(app.restarts.map((a) => a.to)).toEqual(["0.0.13"]);
  const seen = core.log.read({ stream: "devices", kinds: ["device_update"] }).map((e) => (e.body as any).phase);
  expect(seen).toEqual(["downloading", "verifying", "waiting", "restarting"]);
});

test("the phone's 更新 with the Mac's app closed: 没开着, nothing started, no 没更新成", async () => {
  const core = boot();
  await core.release.check(true);
  const mac = tempDir();
  stops.push(mac.cleanup);
  const id = await macWorker(core, mac.dir);
  const phone = await client(core.url);
  phone.send({ t: "devices" });
  await phone.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.id === id && d.state === "awake"));
  const n = phone.frames.length;
  phone.send({ t: "device_update", device: id });
  expect(await phone.until((x) => x.t === "update_result", n)).toMatchObject({ ok: false, reason: "app_closed" });
  await Bun.sleep(30);
  expect(core.log.read({ stream: "devices", kinds: ["device_update"] })).toEqual([]);
});

test("a home that lives in Ducter.app: 更新 from the phone asks the app the same way; closed says so", async () => {
  const dir = tempDir();
  stops.push(dir.cleanup);
  const release = createReleaseWatch({ dataDir: dir.dir, timer: false, env: {}, fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.13" })) });
  await release.check(true);
  const u = createUpdates({ dataDir: dir.dir, log: { append: () => ({}) } as any, release, sys: { ...realSys, sleep: (ms) => Bun.sleep(Math.min(ms, 5)) }, self: { execPath: "/Applications/Ducter.app/Contents/Resources/ducter", how: "app", arch: "arm64", port: 0 }, name: () => "MacBook", version: "0.0.12", autoEveryMs: 0, resultWatchMs: 0, askApp: (i) => askApp({ ...i, sys, pollMs: 5 }) });
  stops.push(() => u.stop());
  expect(u.view("local", "0.0.12", "app")).toMatchObject({ how: "app", fromHere: true, available: true });
  expect(await u.start("local")).toMatchObject({ ok: false, reason: "app_closed" });
  const app = fakeApp(dir.dir);
  expect(await u.start("local")).toEqual({ ok: true });
  for (let i = 0; i < 200 && u.view("local", "0.0.12", "app")?.phase !== "restarting"; i++) await Bun.sleep(5);
  expect(u.view("local", "0.0.12", "app")).toMatchObject({ phase: "restarting", from: "0.0.12", to: "0.0.13" });
  await Bun.sleep(30);
  expect(app.restarts.map((a) => a.to)).toEqual(["0.0.13"]);
});

test("a Mac worker from before D187 (no asksApp) still says to open the app there", async () => {
  const core = boot();
  await core.release.check(true);
  const mac = tempDir();
  stops.push(mac.cleanup);
  const id = await macWorker(core, mac.dir, { asksApp: undefined });
  const phone = await client(core.url);
  phone.send({ t: "devices" });
  const f = await phone.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.id === id && d.state === "awake"));
  const u = (f.devices.find((d) => d.id === id) as DeviceView).update!;
  expect(u.how).toBe("app");
  expect(u.fromHere).toBeUndefined();
  const n = phone.frames.length;
  phone.send({ t: "device_update", device: id });
  expect(await phone.until((x) => x.t === "update_result", n)).toMatchObject({ ok: false, reason: "app" });
});
