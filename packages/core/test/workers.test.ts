// Worker enrollment and presence over a real socket. No tasks are placed (not built yet).
import { afterEach, expect, test } from "bun:test";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50 });
  stops.push(t.cleanup, () => core.stop());
  return core;
}
const REMOTE = { "x-forwarded-for": "203.0.113.9" };

function open(url: string, headers: Record<string, string>): Promise<{ ws?: WebSocket; frames: any[]; ok: boolean }> {
  return new Promise((resolve) => {
    const frames: any[] = [];
    const ws = new WebSocket(url, { headers } as any);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    ws.onopen = () => resolve({ ws, frames, ok: true });
    ws.onerror = () => resolve({ frames, ok: false });
  });
}
const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout");
    await Bun.sleep(10);
  }
};

test("a worker token opens /worker, says hello, shows online; client and worker tokens stay in their lanes", async () => {
  const core = boot();
  const base = `ws://127.0.0.1:${core.port}`;
  const worker = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "vps-2", platform: "linux" }) as { token: string; device: { id: string } };
  const client = core.devices.redeem(core.devices.createCode().code, { name: "mac" }) as { token: string };

  const w = await open(`${base}/worker`, { ...REMOTE, authorization: `Bearer ${worker.token}` });
  expect(w.ok).toBe(true);
  w.ws!.send(JSON.stringify({ t: "hello", name: "vps-2", os: "linux", arch: "arm64", harnesses: [{ id: "claude-code", installed: true, loggedIn: false }] }));
  await until(() => w.frames.some((f) => f.t === "welcome"));
  expect(w.frames[0]).toMatchObject({ t: "welcome", personaName: "Ducter", deviceId: worker.device.id });

  const online = await (await fetch(`http://127.0.0.1:${core.port}/devices/online`)).json();
  expect(online.workers).toHaveLength(1);
  expect(online.workers[0]).toMatchObject({ deviceId: worker.device.id, name: "vps-2", hello: { os: "linux", harnesses: [{ id: "claude-code" }] } });
  // Presence is local-only information.
  expect((await fetch(`http://127.0.0.1:${core.port}/devices/online`, { headers: { ...REMOTE, authorization: `Bearer ${client.token}` } })).status).toBe(404);

  // A client token can't open /worker; a worker token can't open /ws.
  expect((await fetch(`http://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, upgrade: "websocket", authorization: `Bearer ${client.token}` } })).status).toBe(403);
  expect((await fetch(`http://127.0.0.1:${core.port}/ws`, { headers: { ...REMOTE, upgrade: "websocket", authorization: `Bearer ${worker.token}` } })).status).toBe(403);
  // Not even locally without a token: a worker is always a paired device.
  expect((await fetch(`http://127.0.0.1:${core.port}/worker`, { headers: { upgrade: "websocket" } })).status).toBe(403);

  w.ws!.close();
  await until(() => core.workers.online().length === 0);

  // Revoked: the worker can't come back.
  core.devices.revoke(worker.device.id);
  expect((await open(`${base}/worker`, { ...REMOTE, authorization: `Bearer ${worker.token}` })).ok).toBe(false);
});

test("a worker on this machine (loopback, or an SSH tunnel) joins with its token (soak regression)", async () => {
  // Soak 2026-11-09: a loopback request was "local" before its token was read, so /worker
  // answered 403 and a local or tunnelled worker reconnected forever.
  const core = boot();
  const worker = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "here", platform: "darwin" }) as { token: string; device: { id: string } };
  const w = await open(`ws://127.0.0.1:${core.port}/worker`, { authorization: `Bearer ${worker.token}` });
  expect(w.ok).toBe(true);
  w.ws!.send(JSON.stringify({ t: "hello", name: "here", os: "darwin", harnesses: [] }));
  await until(() => core.workers.online().length === 1);
  w.ws!.close();
  // A local caller with a bad token still can't open /worker.
  expect((await fetch(`http://127.0.0.1:${core.port}/worker`, { headers: { upgrade: "websocket", authorization: "Bearer nope" } })).status).toBe(403);
});

test("revoking a device (from another process, the CLI) closes its live sockets: client and worker", async () => {
  const core = boot();
  const base = `ws://127.0.0.1:${core.port}`;
  const pair = (kind: "client" | "worker") => core.devices.redeem(core.devices.createCode({ kind }).code, { name: kind }) as { token: string; device: { id: string } };
  const c = pair("client");
  const w = pair("worker");
  const closes: number[] = [];
  for (const [path, p] of [["/ws", c], ["/worker", w]] as const) {
    const s = await open(`${base}${path}`, { ...REMOTE, authorization: `Bearer ${p.token}` });
    expect(s.ok).toBe(true);
    s.ws!.onclose = (e) => closes.push(e.code);
  }
  const { openDeviceAuth } = await import("../src/auth.ts");
  const cli = openDeviceAuth(core.dataDir);
  cli.revoke(c.device.id);
  cli.revoke(w.device.id);
  cli.close();
  await until(() => closes.length === 2);
  expect(closes).toEqual([4401, 4401]);
});

test("WorkerLink over the real socket: requests, session frames, offline end on close, onOnline on reconnect", async () => {
  const core = boot();
  const base = `ws://127.0.0.1:${core.port}`;
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "vps-2" }) as { token: string; device: { id: string } };
  const connect = async () => {
    const s = await open(`${base}/worker`, { ...REMOTE, authorization: `Bearer ${w.token}` });
    s.ws!.onmessage = (m) => {
      const f = JSON.parse(String(m.data));
      s.frames.push(f);
      if (f.t === "req") {
        s.ws!.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { echo: f.op, key: f.args.key } }));
        s.ws!.send(JSON.stringify({ t: "ev", key: f.args.key, ev: { role: "assistant", text: "hi" }, busy: true, sessionId: "s1" }));
      }
    };
    s.ws!.send(JSON.stringify({ t: "hello", name: "vps-2", harnesses: [{ id: "claude-code", installed: true, loggedIn: true }] }));
    return s;
  };
  const link = core.workers.link("vps-2")!;
  expect(link.online()).toBe(false);
  await expect(link.call("plan", {})).rejects.toThrow("vps-2 is not connected");

  let s = await connect();
  await until(() => link.online());
  expect(core.workers.list()).toEqual([{ id: w.device.id, name: "vps-2", online: true, harnesses: [{ id: "claude-code", installed: true, loggedIn: true }] }]);
  const frames: any[] = [];
  link.onSession("k1", (f) => frames.push(f));
  expect(await link.call("start", { key: "k1" })).toEqual({ echo: "start", key: "k1" });
  await until(() => frames.length === 1);
  expect(frames[0]).toMatchObject({ t: "ev", key: "k1", busy: true, sessionId: "s1" });

  let back = 0;
  link.onOnline(() => back++);
  s.ws!.close();
  await until(() => frames.length === 2);
  expect(frames[1]).toMatchObject({ t: "end", key: "k1", offline: true });
  expect(link.online()).toBe(false);
  s = await connect();
  await until(() => back === 1);
  s.ws!.close();
});

test("a worker's hello can't take another worker's name (and its tasks)", async () => {
  const core = boot();
  const pair = (name: string) => core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name }) as { token: string; device: { id: string } };
  const a = pair("vps-a");
  const b = pair("vps-b");
  for (const [p, claim] of [[b, "vps-b"], [a, "vps-b"]] as const) {
    const s = await open(`ws://127.0.0.1:${core.port}/worker`, { ...REMOTE, authorization: `Bearer ${p.token}` });
    stops.push(() => s.ws!.close());
    s.ws!.send(JSON.stringify({ t: "hello", name: claim }));
    await until(() => s.frames.some((f) => f.t === "welcome"));
  }
  expect(core.workers.link("vps-b")!.id).toBe(b.device.id);
  expect(core.workers.link("vps-a")!.name).toBe("vps-a");
  expect(core.workers.list().map((w) => w.name).sort()).toEqual(["vps-a", "vps-b"]);
});

test("a disconnected (revoked) worker still resolves, never online: its tasks don't fall back to this machine", () => {
  const core = boot();
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "vps-2" }) as { device: { id: string } };
  core.devices.revoke(w.device.id);
  const link = core.workers.link("vps-2");
  expect(link?.id).toBe(w.device.id);
  expect(link!.online()).toBe(false);
  // A client device with that name is still not a worker.
  core.devices.redeem(core.devices.createCode().code, { name: "mac" });
  expect(core.workers.link("mac")).toBeUndefined();
});

// D227: the home tells a reconnect (the same worker process) from a restart (another one), so an
// agent update the restart cut off is judged at once instead of waiting 45 min.
test("a hello says whether the worker restarted since the last one: its boot id, or (before D227) another version", async () => {
  const { createWorkers } = await import("../src/workers.ts");
  const seen: { restarted: boolean; boot?: string }[] = [];
  const workers = createWorkers({ personaName: () => "Ducter", onHello: (_id, _name, h, o) => seen.push({ restarted: o.restarted, ...(h.boot ? { boot: h.boot } : {}) }) });
  const device = { id: "mac", name: "Macbook Pro M3", kind: "worker" } as any;
  const sock = () => ({ data: { worker: true, device, since: new Date().toISOString() }, send: () => {}, close: () => {} }) as any;
  const hello = (h: object) => {
    const ws = sock();
    workers.websocket.open(ws);
    workers.websocket.message(ws, JSON.stringify({ t: "hello", ...h }));
    workers.websocket.close(ws);
  };
  hello({ version: "0.0.32", boot: "b1" }); // first seen: nothing to compare with
  hello({ version: "0.0.32", boot: "b1" }); // the same process, back after a dropped socket
  hello({ version: "0.0.32", boot: "b2" }); // another process
  hello({ version: "0.0.32" }); // an older worker: no boot id, same version
  hello({ version: "0.0.33" }); // ...that restarted into another version
  hello({ version: "0.0.34", boot: "b3" }); // the first hello with a boot id after one without: its version says
  expect(seen.map((x) => x.restarted)).toEqual([false, false, true, false, true, true]);
});
