// The home's side of updating in place (D148), over the real client and worker sockets: the
// version and "update to" on each card, the steps in the Log, the safe point, the outcome after a
// restart, the worker's update op round trip (with the CLI's own worker updater and a fake
// install), and 断开 / Disconnect. No network, no systemctl, no model.
import { afterEach, expect, test } from "bun:test";
import type { DeviceView, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import type { DeviceProbes } from "../src/devices.ts";
import { createReleaseWatch } from "../src/release.ts";
import { createUpdates } from "../src/updates.ts";
import { readResult, realSys, writeResult, type RunInput, type RunOutcome } from "../src/update.ts";
import { createWorkerUpdater } from "../../cli/src/update.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const probes: Partial<DeviceProbes> = {
  cua: async () => ({ missing: "no" }),
  native: async () => undefined,
  harnesses: async () => [],
  kind: async () => "server",
};
const feed = (version = "0.0.4") => async () => new Response(JSON.stringify({ tag_name: `v${version}`, body: "## What's new\n- Update in place, from any device\n- Device cards you can rename" }), { status: 200 });

function boot(o: { version?: string; run?: (i: RunInput) => Promise<RunOutcome>; dir?: string } = {}): Core {
  const t = o.dir ? { dir: o.dir, cleanup: () => {} } : tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50, deviceProbes: probes, update: { fetch: feed(), how: "self", version: o.version ?? "0.0.3", ...(o.run ? { run: o.run } : {}), autoEveryMs: 0, graceMs: 50 } });
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
    for (let i = 0; i < 400; i++) {
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
const homeOf = (f: Devices) => f.devices.find((d) => d.home)!;
const steps = (core: Core) => core.log.read({ stream: "devices", kinds: ["device_update"] }).map((e) => (e.body as any).phase);

test("the home's card: its version, update to the latest with what's new; one tap runs the steps, each in the Log", async () => {
  let settled: unknown = "not yet";
  const core = boot({
    run: async (i) => {
      i.onPhase?.("downloading", 0.5);
      i.onPhase?.("verifying");
      i.onPhase?.("waiting");
      settled = await i.settle?.();
      return { ok: true, restarting: false, target: "/x/ducter" };
    },
  });
  await core.release.check(true);
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices" && Boolean(homeOf(x as Devices).update?.latest));
  expect(homeOf(f)).toMatchObject({ version: "0.0.3", update: { current: "0.0.3", latest: "0.0.4", available: true, how: "self", notes: ["Update in place, from any device", "Device cards you can rename"] } });
  const n = c.frames.length;
  c.send({ t: "device_update", device: "local" });
  expect(await c.until((x) => x.t === "update_result", n)).toMatchObject({ ok: true });
  const done = await c.until<Devices>((x) => x.t === "devices" && homeOf(x as Devices).update?.phase === "done", n);
  expect(homeOf(done).update).toMatchObject({ phase: "done", from: "0.0.3", to: "0.0.4" });
  expect(settled).toBeUndefined();
  expect(steps(core)).toEqual(["downloading", "verifying", "waiting", "done"]);
});

test("a failed step says why, and nothing is retried on its own", async () => {
  const core = boot({ run: async () => ({ ok: false, reason: "checksum", detail: "sum differs" }) });
  const c = await client(core.url);
  c.send({ t: "devices" });
  await c.until((x) => x.t === "devices");
  c.send({ t: "device_update", device: "local" });
  const f = await c.until<Devices>((x) => x.t === "devices" && homeOf(x as Devices).update?.phase === "failed");
  expect(homeOf(f).update).toMatchObject({ phase: "failed", reason: "checksum", rolledBack: false });
  expect(core.log.read({ stream: "devices" }).at(-1)!.body).toMatchObject({ phase: "failed", reason: "checksum", detail: "sum differs" });
});

test("after the restart, the new Ducter logs the helper's outcome once: 回来了 on the card", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  writeResult(t.dir, { from: "0.0.3", to: "0.0.4", ok: true, at: new Date().toISOString() });
  const core = boot({ version: "0.0.4", dir: t.dir });
  expect(steps(core)).toEqual(["done"]);
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(homeOf(f).update).toMatchObject({ current: "0.0.4", available: false, phase: "done", to: "0.0.4" });
});

test("the author's hel (D167): on 0.0.7 with the update before's file unread, then the helper's outcome after the start: 回来了, never 没更新成", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  // 0.0.5 → 0.0.6 went fine, but the helper wrote it after 0.0.6 had started: nobody read it.
  writeResult(t.dir, { from: "0.0.5", to: "0.0.6", ok: true, at: new Date(Date.now() - 86_400_000).toISOString() });
  const core = boot({ version: "0.0.7", dir: t.dir });
  expect(steps(core)).toEqual([]); // superseded: nothing said
  expect(readResult(t.dir)?.reported).toBe(true);
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(homeOf(f).update?.phase).toBeUndefined();
  // Now the helper for 0.0.6 → 0.0.7 writes its outcome, after this Ducter answered: even one
  // that says it gave up (a slow start), this Ducter runs 0.0.7, so it's done.
  writeResult(t.dir, { from: "0.0.6", to: "0.0.7", ok: false, rolledBack: true, reason: "health", detail: "0.0.7 didn't answer within 60 s", at: new Date().toISOString() });
  const n = c.frames.length;
  c.send({ t: "devices" });
  const g = await c.until<Devices>((x) => x.t === "devices" && Boolean(homeOf(x as Devices).update?.phase), n);
  expect(homeOf(g).update).toMatchObject({ current: "0.0.7", phase: "done", to: "0.0.7" });
  expect(steps(core)).toEqual(["done"]);
});

test("rolled back (D167): the Ducter that came back on 0.0.6 says 没更新成 once the helper writes it, with its reason", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = boot({ version: "0.0.6", dir: t.dir });
  writeResult(t.dir, { from: "0.0.6", to: "0.0.7", ok: false, rolledBack: true, reason: "health", detail: "0.0.7 didn't answer within 180 s", at: new Date().toISOString() });
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices" && homeOf(x as Devices).update?.phase === "failed");
  expect(homeOf(f).update).toMatchObject({ current: "0.0.6", phase: "failed", reason: "health", rolledBack: true, detail: "0.0.7 didn't answer within 180 s" });
});

test("a failure a device has moved past is never shown (D167): a worker's stale outcome, then its new version", () => {
  const release = createReleaseWatch({ dataDir: tempDir().dir, fetch: feed("0.0.7"), timer: false });
  const u = createUpdates({ dataDir: tempDir().dir, log: { append: () => ({}) } as any, release, sys: realSys, self: { execPath: "/x", how: "self", arch: "x64", port: 0 }, name: () => "hel", autoEveryMs: 0, resultWatchMs: 0 });
  stops.push(() => u.stop());
  u.fromWorker("w1", "mac", { t: "update", phase: "failed", from: "0.0.6", to: "0.0.7", reason: "health", rolledBack: true });
  expect(u.view("w1", "0.0.6", "self")?.phase).toBe("failed");
  expect(u.view("w1", "0.0.7", "self")?.phase).toBeUndefined();
});

test("the safe point waits for a merge to finish and holds new ones meanwhile; a turn gets a short grace", async () => {
  const dataDir = tempDir();
  stops.push(dataDir.cleanup);
  let clock = 0;
  let merging = ["t1"];
  const holds: (string | undefined)[] = [];
  const release = createReleaseWatch({ dataDir: dataDir.dir, timer: false, env: {}, fetch: feed() });
  await release.check(true);
  let order: string[] = [];
  const u = createUpdates({
    dataDir: dataDir.dir,
    log: { append: () => ({}) as any } as any,
    release,
    sys: { ...realSys, now: () => clock, sleep: async (ms) => void ((clock += ms), clock >= 3000 && (merging = [])) },
    self: { execPath: "/x/ducter", how: "self", arch: "x64", port: 1 },
    name: () => "vps-1",
    version: "0.0.3",
    critical: () => merging,
    holdCritical: (w) => holds.push(w),
    working: () => 1,
    graceMs: 5000,
    autoEveryMs: 0,
    run: async (i) => {
      const before = clock;
      await i.settle?.();
      order = [`waited ${clock - before}`];
      return { ok: true, restarting: true };
    },
  });
  stops.push(() => u.stop());
  expect(await u.start("local")).toEqual({ ok: true });
  for (let i = 0; i < 100 && !order.length; i++) await Bun.sleep(5);
  expect(holds[0]).toContain("restarting for an update");
  // 3 s for the merge, then 5 s of grace for the turn still running (it's resumed after the restart).
  expect(order).toEqual(["waited 8000"]);
  expect(await u.start("local")).toMatchObject({ ok: false, reason: "running" });
});

test("a worker updates over its own socket: accepted, each step up the socket, back with its new version", async () => {
  const core = boot();
  await core.release.check(true);
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "vps-2", platform: "linux-x64" }) as { token: string; device: { id: string } };
  const c = await client(core.url);
  c.send({ t: "devices" });
  await c.until((x) => x.t === "devices");

  // The worker side is the CLI's own updater; only the install itself is faked.
  let release!: () => void;
  const installed = new Promise<void>((r) => (release = r));
  const updater = createWorkerUpdater({
    dataDir: tempDir().dir,
    version: "0.0.3",
    how: "self",
    run: async (_sys, i) => {
      i.onPhase?.("downloading", 0.2);
      i.onPhase?.("verifying");
      i.onPhase?.("waiting");
      await i.settle?.();
      i.onPhase?.("restarting");
      release();
      return { ok: true, restarting: true };
    },
  });
  const join = async (hello: object) => {
    const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${w.token}` } } as any);
    await new Promise<void>((res) => (ws.onopen = () => res()));
    const host = { critical: () => 0, turning: () => 0 };
    ws.onmessage = (m) => {
      const f = JSON.parse(String(m.data));
      if (f.t === "req" && f.op === "update") void updater.handle(f, (x) => ws.send(JSON.stringify(x)), host);
    };
    ws.send(JSON.stringify({ t: "hello", os: "linux", arch: "x64", version: "0.0.3", how: "self", ...hello }));
    return ws;
  };
  const ws1 = await join({});
  const awake = await c.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.name === "vps-2" && d.state === "awake"));
  expect(awake.devices.find((d) => d.name === "vps-2")!.update).toMatchObject({ current: "0.0.3", latest: "0.0.4", available: true, how: "self" });

  let n = c.frames.length;
  c.send({ t: "device_update", device: w.device.id });
  expect(await c.until((x) => x.t === "update_result", n)).toMatchObject({ ok: true, device: w.device.id });
  await installed;
  const restarting = await c.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.name === "vps-2" && d.update?.phase === "restarting"), n);
  expect(restarting.devices.find((d) => d.name === "vps-2")!.update).toMatchObject({ from: "0.0.3", to: "0.0.4" });

  // It restarts: the socket goes, the new one says hello on 0.0.4 with how its update went.
  ws1.close();
  n = c.frames.length;
  await join({ version: "0.0.4", update: { t: "update", phase: "done", from: "0.0.3", to: "0.0.4" } });
  const back = await c.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.name === "vps-2" && d.state === "awake" && d.version === "0.0.4"), n);
  const v = back.devices.find((d) => d.name === "vps-2") as DeviceView;
  expect(v.update).toMatchObject({ current: "0.0.4", available: false, phase: "done" });
  expect(core.log.read({ stream: "devices" }).map((e) => [(e.body as any).name, (e.body as any).phase])).toEqual([
    ["vps-2", "downloading"],
    ["vps-2", "verifying"],
    ["vps-2", "waiting"],
    ["vps-2", "restarting"],
    ["vps-2", "done"],
  ]);
});

test("an older worker, or a Mac one, says how it updates instead", async () => {
  const core = boot();
  await core.release.check(true);
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "old-box", platform: "linux-x64" }) as { token: string };
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${w.token}` } } as any);
  await new Promise<void>((res) => (ws.onopen = () => res()));
  ws.send(JSON.stringify({ t: "hello", os: "linux", version: "0.0.3" })); // no `how`: before 0.0.4
  stops.push(() => ws.close());
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices" && (x as Devices).devices.some((d) => d.name === "old-box" && d.state === "awake"));
  expect(f.devices.find((d) => d.name === "old-box")!.update).toMatchObject({ how: "manual", available: true });
  c.send({ t: "device_update", device: "old-box" });
  expect(await c.until((x) => x.t === "update_result")).toMatchObject({ ok: false, reason: "manual" });
});

test("断开 / Disconnect from the card revokes the device; the home can't be", async () => {
  const core = boot();
  const phone = core.devices.redeem(core.devices.createCode().code, { name: "iPhone", platform: "ios" }) as { device: { id: string } };
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(f.reach.clients.map((x) => x.name)).toEqual(["iPhone"]);
  const n = c.frames.length;
  c.send({ t: "disconnect_device", device: phone.device.id });
  expect(await c.until((x) => x.t === "disconnect_result", n)).toMatchObject({ ok: true });
  const after = await c.until<Devices>((x) => x.t === "devices", n);
  expect(after.reach.clients).toEqual([]);
  c.send({ t: "disconnect_device", device: "local" });
  expect(await c.until((x) => x.t === "disconnect_result" && (x as any).device === "local")).toMatchObject({ ok: false, reason: "home" });
});
