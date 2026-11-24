// D363: 安装 and 登录 on a worker's card: the home carries agent_setup to that worker as an op,
// and the worker's rows (installable, installing, the sign-in's link and code) reach every window.
import { afterEach, expect, test } from "bun:test";
import type { DeviceView, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): Core {
  const t = tempDir();
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    sweepMs: 50,
    platform: "linux",
    deviceProbes: { cua: async () => undefined, native: async () => undefined, harnesses: async () => [], kind: async () => "server" },
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
  const ops: any[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
  stops.push(() => ws.close());
  const rows = (codex: object) => [{ id: "claude-code", installed: false, loggedIn: false, installable: true }, { id: "codex", installed: false, loggedIn: false, installable: true, ...codex }];
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t !== "req" || f.op !== "agent_setup") return;
    ops.push(f.args);
    ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { ok: true } }));
    if (f.args.action === "install") ws.send(JSON.stringify({ t: "agents", harnesses: rows({ setup: { phase: "installing" } }) }));
    if (f.args.action === "login") ws.send(JSON.stringify({ t: "agents", harnesses: rows({ installed: true, installable: false, login: { state: "waiting", url: "https://auth.openai.com/codex/device", code: "ABCD-EFGHI" } }) }));
  };
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.send(JSON.stringify({ t: "hello", name: "haswell", os: "linux", arch: "x64", kind: "server", version: "0.0.78", harnesses: rows({}) }));
  return { deviceId, ops };
}

const card = (f: ServerFrame, id: string): DeviceView | undefined => (f.t === "devices" ? f.devices.find((d) => d.id === id) : undefined);

test("agent_setup install and login reach the worker; its rows come back on the card", async () => {
  const core = boot();
  const c = await client(core.url);
  const { deviceId, ops } = await worker(core, c);
  const first = await c.until((f) => !!card(f, deviceId)?.harnesses.length);
  expect(card(first, deviceId)!.harnesses.map((h) => [h.harness, h.installed, h.installable])).toEqual([
    ["claude-code", false, true],
    ["codex", false, true],
  ]);

  c.send({ t: "agent_setup", device: deviceId, action: "install", harnesses: ["codex", "claude-code"] });
  const installing = await c.until((f) => card(f, deviceId)?.harnesses.find((h) => h.harness === "codex")?.setup?.phase === "installing");
  expect(card(installing, deviceId)!.harnesses.find((h) => h.harness === "codex")!.installable).toBe(true);

  c.send({ t: "agent_setup", device: deviceId, action: "login", harness: "codex" });
  const login = await c.until((f) => card(f, deviceId)?.harnesses.find((h) => h.harness === "codex")?.login?.state === "waiting");
  expect(card(login, deviceId)!.harnesses.find((h) => h.harness === "codex")!.login).toMatchObject({ state: "waiting", url: "https://auth.openai.com/codex/device", code: "ABCD-EFGHI" });
  // Once there, it isn't offered for install.
  expect(card(login, deviceId)!.harnesses.find((h) => h.harness === "codex")!.installable).toBeUndefined();

  c.send({ t: "agent_setup", device: deviceId, action: "look" });
  for (let i = 0; i < 100 && ops.length < 3; i++) await Bun.sleep(10);
  expect(ops).toEqual([{ action: "install", harnesses: ["codex", "claude-code"] }, { action: "login", harness: "codex" }, { action: "look" }]);
});

test("agent_setup for a device that isn't there says so", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "agent_setup", device: "nope", action: "install", harnesses: ["codex"] });
  const r = await c.until((f) => f.t === "agent_setup_result");
  expect(r).toEqual({ t: "agent_setup_result", device: "nope", action: "install", ok: false, reason: "unknown" });
  // The home in tests has no installer (no network, no npm): it says it couldn't.
  c.send({ t: "agent_setup", device: "local", action: "install", harnesses: ["codex"] });
  const h = await c.until((f) => f.t === "agent_setup_result" && f.device === "local");
  expect(h).toMatchObject({ ok: false, reason: "failed" });
});
