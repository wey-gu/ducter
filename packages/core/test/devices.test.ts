// Your devices and abilities over the client socket: honest states only (no invented allowance,
// "asleep" only when the worker said so), 上网 persisted for the runner's gate, pairing codes.
import { afterEach, expect, test } from "bun:test";
import type { DeviceView, ServerFrame } from "@ducter/protocol";
import { readAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import { startCore, type Core } from "../src/core.ts";
import { kindFromPlatform, qrRows } from "../src/devices.ts";
import type { DeviceProbes } from "../src/devices.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const probes = (over: Partial<DeviceProbes> = {}): Partial<DeviceProbes> => ({
  cua: async () => ({ version: "0.44.0" }),
  harnesses: async () => [
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: false },
  ],
  kind: async () => "laptop",
  ...over,
});

function boot(over: Partial<DeviceProbes> = {}): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: probes(over) });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return core;
}

async function client(url: string, headers?: Record<string, string>) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(url, headers ? ({ headers } as any) : undefined);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { ws, send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

type Devices = Extract<ServerFrame, { t: "devices" }>;
const ability = (d: DeviceView, id: string) => d.abilities.find((a) => a.id === id)!;

test("this machine: awake, home, harness logins as probed, no allowance, web on, computer later", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(f.devices).toHaveLength(1);
  const home = f.devices[0]!;
  expect(home).toMatchObject({ id: "local", home: true, state: "awake", kind: "laptop" });
  expect(home.harnesses).toEqual([
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: false },
  ]);
  expect(home.harnesses.some((h) => "allowance" in h)).toBe(false);
  expect(ability(home, "web")).toMatchObject({ state: "on" });
  expect(ability(home, "computer").state).toBe("later");
  expect(ability(home, "remote").state).toBe("off");
  expect(ability(home, "phone").state).toBe("later");
  expect(f.reach.clients).toEqual([]);
});

test("removing and adding 上网 persists the choice the runner reads, and pushes a fresh frame", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "devices" });
  await c.until((x) => x.t === "devices");
  const n = c.frames.length;
  c.send({ t: "ability", device: "local", ability: "web", on: false });
  expect(await c.until((x) => x.t === "ability_result", n)).toMatchObject({ ok: true, ability: "web", on: false });
  const off = await c.until<Devices>((x) => x.t === "devices", n);
  expect(ability(off.devices[0]!, "web").state).toBe("off");
  expect(readAbilitySettings(core.dataDir)).toEqual({ web: false });

  const m = c.frames.length;
  c.send({ t: "ability", device: "local", ability: "web", on: true });
  await c.until((x) => x.t === "ability_result" && x.ok, m);
  const on = await c.until<Devices>((x) => x.t === "devices", m);
  expect(ability(on.devices[0]!, "web").state).toBe("on");
  expect(readAbilitySettings(core.dataDir)).toEqual({ web: true });
});

test("no cua-driver: 上网 is unavailable with the reason, and adding it is refused", async () => {
  const core = boot({ cua: async () => ({ missing: "cua-driver is not installed" }) });
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(ability(f.devices[0]!, "web")).toMatchObject({ state: "unavailable", reason: "cua_missing" });
  c.send({ t: "ability", device: "local", ability: "web", on: true });
  expect(await c.until((x) => x.t === "ability_result")).toMatchObject({ ok: false, reason: "cua_missing" });
  expect(readAbilitySettings(core.dataDir)).toEqual({});
});

test("an old cua-driver reads as cua_old; a later ability can't be added", async () => {
  const core = boot({ cua: async () => ({ missing: "cua-driver 0.6.8 has no typed browser tools" }) });
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(ability(f.devices[0]!, "web")).toMatchObject({ state: "unavailable", reason: "cua_old" });
  c.send({ t: "ability", device: "local", ability: "computer", on: true });
  expect(await c.until((x) => x.t === "ability_result")).toMatchObject({ ok: false });
});

test("workers: awake with their hello, then can't reach with a last-seen time, or asleep when they said so", async () => {
  const core = boot();
  const base = `ws://127.0.0.1:${core.port}`;
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const pair = (name: string) => core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name, platform: "linux-arm64" }) as { token: string; device: { id: string } };
  const vps = pair("ducter-vps");
  const box = pair("build-box");
  const c = await client(core.url);
  c.send({ t: "devices" });
  const first = await c.until<Devices>((x) => x.t === "devices");
  const v0 = first.devices.find((d) => d.name === "ducter-vps")!;
  expect(v0).toMatchObject({ home: false, state: "unreachable", kind: "server" });
  expect(ability(v0, "web")).toMatchObject({ state: "unavailable", reason: "home_only" });

  const join = async (token: string, hello: object) => {
    const w = new WebSocket(`${base}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
    await new Promise<void>((res) => (w.onopen = () => res()));
    w.send(JSON.stringify({ t: "hello", os: "linux", arch: "arm64", ...hello }));
    return w;
  };
  let n = c.frames.length;
  const w1 = await join(vps.token, { name: "ducter-vps", kind: "server", harnesses: [{ id: "claude-code", installed: true, loggedIn: true }] });
  const awake = await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.name === "ducter-vps" && d.state === "awake"), n);
  expect(awake.devices.find((d) => d.name === "ducter-vps")!.harnesses).toEqual([{ harness: "claude-code", installed: true, loggedIn: true }]);

  n = c.frames.length;
  w1.close();
  const gone = await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.name === "ducter-vps" && d.state === "unreachable"), n);
  expect(gone.devices.find((d) => d.name === "ducter-vps")!.lastSeen).toBeString();

  const w2 = await join(box.token, { name: "build-box", kind: "mini" });
  await c.until((x) => x.t === "devices" && x.devices.some((d) => d.name === "build-box" && d.state === "awake"));
  n = c.frames.length;
  w2.send(JSON.stringify({ t: "sleep" }));
  await Bun.sleep(30);
  w2.close();
  const asleep = await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.name === "build-box" && d.state === "asleep"), n);
  expect(asleep.devices.find((d) => d.name === "build-box")!.kind).toBe("mini");
});

test("远程打开: a pairing code from the app; a device that pairs turns it on and shows in reach", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "devices" });
  await c.until((x) => x.t === "devices");
  c.send({ t: "pair_code" });
  const p = await c.until<Extract<ServerFrame, { t: "pair_code" }>>((x) => x.t === "pair_code");
  expect(p.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(p.address).toBeUndefined(); // no public address set: no link, no QR
  const n = c.frames.length;
  const res = await fetch(`http://127.0.0.1:${core.port}/pair`, { method: "POST", body: JSON.stringify({ code: p.code, name: "iPhone", platform: "ios" }) });
  expect(res.status).toBe(200);
  const f = await c.until<Devices>((x) => x.t === "devices" && x.reach.clients.length === 1, n);
  expect(ability(f.devices[0]!, "remote").state).toBe("on");
  expect(f.reach.clients[0]).toMatchObject({ name: "iPhone", platform: "ios", connected: false });
});

test("a pairing code with a public address carries the link and a QR", async () => {
  const t = tempDir();
  await Bun.write(`${t.dir}/public-url`, "https://ducter.example.com/\n");
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: probes() });
  stops.push(t.cleanup, () => core.stop());
  const p = await core.devicesView.pairCode();
  expect(p.address).toBe("https://ducter.example.com");
  expect(p.link).toBe(`https://ducter.example.com/pair#c=${p.code}`);
  expect(p.qr!.length).toBeGreaterThan(20);
  expect(p.qr!.every((r) => r.length === p.qr!.length && /^[01]+$/.test(r))).toBe(true);
});

test("helpers", () => {
  expect(kindFromPlatform("linux-x64")).toBe("server");
  expect(kindFromPlatform("ios")).toBe("phone");
  expect(kindFromPlatform("darwin-arm64")).toBe("laptop");
  expect(qrRows("hi")[0]).toMatch(/^1111111/);
});
