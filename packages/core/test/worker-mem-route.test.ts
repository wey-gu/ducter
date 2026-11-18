// D366: Nowledge Mem on a computer for tasks: the worker says where Mem stands there, the card
// shows it only while memory is on and the home's Mem is connected, mem_setup reaches the worker
// as an op (the link to it alone), and Mem turning ready there makes the home read the plugin check.
import { afterEach, expect, test } from "bun:test";
import type { DeviceView, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(connected: boolean): Core {
  const t = tempDir();
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    platform: "linux",
    deviceProbes: { cua: async () => undefined, native: async () => undefined, harnesses: async () => [], kind: async () => "server" },
    memPlugins: { inspectLocal: async () => undefined, everyMs: 0, connected: () => connected },
  });
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
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean): Promise<T> => {
    for (let i = 0; i < 300; i++) {
      const hit = [...frames].reverse().find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

const REMOTE = { "x-forwarded-for": "198.51.100.7" };

async function worker(core: Core, c: Awaited<ReturnType<typeof client>>) {
  c.send({ t: "lend_code" });
  const w = await c.until<Extract<ServerFrame, { t: "lend" }>>((f) => f.t === "lend" && f.state === "waiting");
  const res = await fetch(`http://127.0.0.1:${core.port}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code: w.code, name: "haswell", platform: "linux-x64", role: "worker", computer: "haswell" }) });
  const { token, deviceId } = (await res.json()) as { token: string; deviceId: string };
  const ops: { op: string; args: any }[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
  stops.push(() => ws.close());
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t !== "req") return;
    ops.push({ op: f.op, args: f.args });
    if (f.op === "mem_plugins") return ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { codex: { state: "installed", version: "0.7.36" } } }));
    if (f.op !== "mem_setup") return ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: null }));
    ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { ok: true } }));
    if (f.args.action === "install") ws.send(JSON.stringify({ t: "mem", mem: { state: "absent", installable: true, step: { phase: "installing", pct: 30 } } }));
    if (f.args.action === "connect") ws.send(JSON.stringify({ t: "mem", mem: { state: "ready", version: "0.10.120", agents: ["codex"] } }));
  };
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.send(JSON.stringify({ t: "hello", name: "haswell", os: "linux", arch: "x64", kind: "server", version: "0.0.80", harnesses: [{ id: "codex", installed: true, loggedIn: true }], mem: { state: "absent", installable: true } }));
  return { deviceId, ops, ws };
}

const card = (f: ServerFrame, id: string): DeviceView | undefined => (f.t === "devices" ? f.devices.find((d) => d.id === id) : undefined);

test("the worker's Mem on its card; install and connect reach it; ready reads the plugin check there", async () => {
  const core = boot(true);
  const c = await client(core.url);
  const { deviceId, ops } = await worker(core, c);
  const first = await c.until((f) => !!card(f, deviceId)?.mem);
  expect(card(first, deviceId)!.mem).toEqual({ state: "absent", installable: true });

  c.send({ t: "mem_setup", device: deviceId, action: "install" });
  await c.until((f) => card(f, deviceId)?.mem?.step?.phase === "installing");

  // D371: the person pastes what Mem copies; the worker gets the link made from it (an older one takes it too).
  const token = `nmem_ct_${"000111".repeat(8)}`; // made up
  const pasted = `Connect Nowledge Mem for this AI tool.\nPOST https://cloud.nowledge.co/api/remote-access/redeem-connect-token\nBody: {"token":"${token}"}`;
  const link = `https://cloud.nowledge.co/app?nmem_connect=${token}`;
  c.send({ t: "mem_setup", device: deviceId, action: "connect", link: pasted });
  await c.until((f) => card(f, deviceId)?.mem?.state === "ready");
  // The home reads Mem's plugin check there once it turned ready: Codex's Mem line follows.
  const line = await c.until((f) => card(f, deviceId)?.harnesses.find((h) => h.harness === "codex")?.mem?.state === "installed");
  expect(card(line, deviceId)!.harnesses.find((h) => h.harness === "codex")!.mem!.version).toBe("0.7.36");
  const setups = ops.filter((o) => o.op === "mem_setup").map((o) => o.args);
  expect(setups).toEqual([{ action: "install" }, { action: "connect", link }]);
  // The link reached the worker and no client frame carries it back.
  expect(JSON.stringify(c.frames)).not.toContain(token);
});

test("without Mem on the home, a worker's Mem never shows and mem_setup is refused", async () => {
  const core = boot(false);
  const c = await client(core.url);
  const { deviceId, ops } = await worker(core, c);
  await c.until((f) => !!card(f, deviceId)?.harnesses.length);
  expect(c.frames.some((f) => !!card(f, deviceId)?.mem)).toBe(false);
  c.send({ t: "mem_setup", device: deviceId, action: "install" });
  const r = await c.until((f) => f.t === "mem_setup_result");
  expect(r).toEqual({ t: "mem_setup_result", device: deviceId, action: "install", ok: false, reason: "failed" });
  expect(ops.some((o) => o.op === "mem_setup")).toBe(false);
});

test("mem_setup for a computer that isn't there says so", async () => {
  const core = boot(true);
  const c = await client(core.url);
  c.send({ t: "mem_setup", device: "nope", action: "connect", link: "https://x.invalid/app?nmem_connect=t" });
  const r = await c.until((f) => f.t === "mem_setup_result");
  expect(r).toEqual({ t: "mem_setup_result", device: "nope", action: "connect", ok: false, reason: "unknown" });
});
