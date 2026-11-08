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
