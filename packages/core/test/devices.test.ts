// Your devices and abilities over the client socket: honest states only (no invented allowance,
// "asleep" only when the worker said so), 上网 persisted for the runner's gate, pairing codes.
import { afterEach, expect, test } from "bun:test";
import type { DeviceView, ServerFrame } from "@ducter/protocol";
import { readAbilitySettings } from "@ducter/protocol/src/abilities.ts";
import { startCore, type Core } from "../src/core.ts";
import { callAbility, kindFromPlatform, qrRows } from "../src/devices.ts";
import type { DeviceProbes } from "../src/devices.ts";
import { tempDir } from "./helpers.ts";
import type { TunnelSys } from "../src/anywhere.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const probes = (over: Partial<DeviceProbes> = {}): Partial<DeviceProbes> => ({
  cua: async () => ({ version: "0.44.0" }),
  native: async () => undefined, // the machine's own Codex / Claude in Chrome never leak in
  harnesses: async () => [
    { harness: "claude-code", installed: true, loggedIn: true },
    { harness: "codex", installed: true, loggedIn: false },
  ],
  kind: async () => "laptop",
  ...over,
});

function boot(over: Partial<DeviceProbes> = {}): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50, deviceProbes: probes(over), platform: "darwin" });
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

test("this machine: awake, home, harness logins as probed, no allowance, web on, computer off until added", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(f.devices).toHaveLength(1);
  const home = f.devices[0]!;
  expect(home).toMatchObject({ id: "local", home: true, state: "awake", kind: "laptop" });
  expect(home.harnesses).toEqual([
    { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
    { harness: "codex", installed: true, loggedIn: false, canBePartner: false },
  ]);
  expect(home.harnesses.some((h) => "allowance" in h)).toBe(false);
  expect(ability(home, "web")).toMatchObject({ state: "on" });
  expect(ability(home, "computer").state).toBe("off"); // D235: a Mac with cua-driver can add 用电脑
  expect(ability(home, "remote").state).toBe("off");
  // D217: Ducter's phone can be added on an Apple Silicon Mac (not installed yet: off); elsewhere it is still to come.
  expect(ability(home, "phone").state).toBe(process.platform === "darwin" && process.arch === "arm64" ? "off" : "later");
  expect(ability(home, "call")).toEqual({ id: "call", state: "off" }); // D199: no calling connection yet
  expect(f.reach.clients).toEqual([]);
});

test("D199: 打电话 follows the calling connection: off, on, signed out; gone with it", () => {
  expect(callAbility(undefined, [])).toEqual({ id: "call", state: "off" });
  expect(callAbility({ connectionId: "c1" }, [{ id: "c1", state: "ok" }])).toEqual({ id: "call", state: "on" });
  expect(callAbility({ connectionId: "c1" }, [{ id: "c1", state: "unknown" }])).toEqual({ id: "call", state: "on" });
  expect(callAbility({ connectionId: "c1" }, [{ id: "c1", state: "unauthorized" }])).toEqual({ id: "call", state: "on", reason: "signed_out" });
  expect(callAbility({ connectionId: "c1" }, [])).toEqual({ id: "call", state: "off" }); // removed a moment ago
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

test("an AI agent's own browser is ready (D130): 上网 works in the user's Chrome without cua-driver", async () => {
  const core = boot({ cua: async () => ({ missing: "cua-driver is not installed" }), native: async () => "codex" });
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(ability(f.devices[0]!, "web")).toMatchObject({ state: "on", where: "chrome", detail: "codex" });
  const n = c.frames.length;
  c.send({ t: "ability", device: "local", ability: "web", on: false });
  expect(await c.until((x) => x.t === "ability_result", n)).toMatchObject({ ok: true, on: false });
  const off = await c.until<Devices>((x) => x.t === "devices", n);
  expect(ability(off.devices[0]!, "web")).toMatchObject({ state: "off", where: "chrome" });
});

test("cua-driver ready and no native browser: 上网 runs in Ducter's own browser", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(ability(f.devices[0]!, "web")).toMatchObject({ state: "on", where: "ducter", detail: "0.44.0" });
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

test("cua-driver installed a moment ago (the app's setup): adding 上网 looks again instead of a stale no", async () => {
  let installed = false;
  const core = boot({ cua: async () => (installed ? { version: "0.44.0" } : { missing: "cua-driver is not installed" }) });
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(ability(f.devices[0]!, "web")).toMatchObject({ state: "unavailable", reason: "cua_missing" });
  installed = true; // the probe is cached for a minute
  const n = c.frames.length;
  c.send({ t: "ability", device: "local", ability: "web", on: true });
  expect(await c.until((x) => x.t === "ability_result", n)).toMatchObject({ ok: true, on: true });
  const on = await c.until<Devices>((x) => x.t === "devices", n);
  expect(ability(on.devices[0]!, "web").state).toBe("on");
});

test("an old cua-driver reads as cua_old for 上网; 用电脑 (no browser tools needed) can still be added", async () => {
  const core = boot({ cua: async () => ({ missing: "cua-driver 0.6.8 has no typed browser tools" }) });
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(ability(f.devices[0]!, "web")).toMatchObject({ state: "unavailable", reason: "cua_old" });
  c.send({ t: "ability", device: "local", ability: "computer", on: true });
  expect(await c.until((x) => x.t === "ability_result")).toMatchObject({ ok: true, on: true });
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
  // D157: a worker that never said what it can do reads as an older Ducter there.
  expect(ability(v0, "web")).toMatchObject({ state: "unavailable", reason: "worker_old" });
  expect(v0.alwaysOn).toBe(true); // a server doesn't sleep

  const join = async (token: string, hello: object) => {
    const w = new WebSocket(`${base}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
    await new Promise<void>((res) => (w.onopen = () => res()));
    w.send(JSON.stringify({ t: "hello", os: "linux", arch: "arm64", ...hello }));
    return w;
  };
  let n = c.frames.length;
  const w1 = await join(vps.token, { name: "ducter-vps", kind: "server", harnesses: [{ id: "claude-code", installed: true, loggedIn: true }] });
  const awake = await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.name === "ducter-vps" && d.state === "awake"), n);
  expect(awake.devices.find((d) => d.name === "ducter-vps")!.harnesses).toEqual([{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" }]);

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

test("D157: a worker Mac browses with its own Chrome; 上网 there is added and removed on that computer", async () => {
  const core = boot();
  const base = `ws://127.0.0.1:${core.port}`;
  const mac = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook", platform: "darwin-arm64" }) as { token: string; device: { id: string } };
  const c = await client(core.url);
  const w = new WebSocket(`${base}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${mac.token}` } } as any);
  await new Promise<void>((res) => (w.onopen = () => res()));
  const asked: any[] = [];
  w.onmessage = (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t !== "req" || f.op !== "ability") return;
    asked.push(f.args);
    // The worker writes it there and says what 上网 is now.
    w.send(JSON.stringify({ t: "abilities", abilities: [{ id: "web", state: f.args.on ? "on" : "off", detail: "claude", where: "chrome" }] }));
    w.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { ok: true } }));
  };
  w.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", kind: "laptop", abilities: [{ id: "web", state: "on", detail: "claude", where: "chrome" }], alwaysOn: false }));
  let n = c.frames.length;
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.name === "MacBook" && d.state === "awake"), n);
  const d = f.devices.find((x) => x.name === "MacBook")!;
  expect(ability(d, "web")).toMatchObject({ state: "on", where: "chrome" });
  expect(d.abilities.map((a) => a.id)).not.toContain("call"); // D199: calls are the home's, not a computer's
  expect(d.alwaysOn).toBe(false); // a laptop sleeps when its lid closes
  n = c.frames.length;
  c.send({ t: "ability", device: mac.device.id, ability: "web", on: false });
  expect(await c.until((x) => x.t === "ability_result", n)).toMatchObject({ ok: true, on: false });
  expect(asked).toEqual([{ id: "web", on: false }]);
  const off = await c.until<Devices>((x) => x.t === "devices" && ability(x.devices.find((y) => y.name === "MacBook")!, "web").state === "off", n);
  expect(readAbilitySettings(core.dataDir).web).toBeUndefined(); // the home's own 上网 is untouched
  expect(off).toBeTruthy();
  w.close();
});

test("远程打开: a pairing code from the app; a device that pairs shows in reach (D228: From outside stays off without an address)", async () => {
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
  expect(ability(f.devices[0]!, "remote").state).toBe("off");
  expect(f.reach.anywhere).toBeUndefined();
  expect(f.reach.clients[0]).toMatchObject({ name: "iPhone", platform: "ios", connected: false });
});

test("D83: the app's 连上手机或电脑 code connects another computer (it was 403 before)", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "devices" });
  await c.until((x) => x.t === "devices");
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const code = async () => {
    const n = c.frames.length;
    c.send({ t: "pair_code" });
    return (await c.until<Extract<ServerFrame, { t: "pair_code" }>>((x) => x.t === "pair_code", n)).code;
  };
  // A computer joins with role "worker" (ducter worker): /worker opens, it says hello, it's awake.
  const res = await fetch(`http://127.0.0.1:${core.port}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code: await code(), name: "vps-2", platform: "linux-arm64", role: "worker" }) });
  expect(res.status).toBe(200);
  const { token } = (await res.json()) as { token: string };
  const n = c.frames.length;
  const w = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
  stops.push(() => w.close());
  await new Promise<void>((r, j) => ((w.onopen = () => r()), (w.onerror = j)));
  w.send(JSON.stringify({ t: "hello", name: "vps-2", os: "linux", kind: "server" }));
  const f = await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.name === "vps-2" && d.state === "awake"), n);
  expect(f.devices.find((d) => d.name === "vps-2")).toMatchObject({ home: false, kind: "server" });
  // Privilege: a computer joined this way gets nothing an app has: no conversation socket.
  expect((await fetch(`http://127.0.0.1:${core.port}/ws`, { headers: { ...REMOTE, upgrade: "websocket", authorization: `Bearer ${token}` } })).status).toBe(403);

  // The same kind of code with no role is an app (web, iOS, desktop unchanged): it can't open /worker.
  const app = await fetch(`http://127.0.0.1:${core.port}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code: await code(), name: "iPhone", platform: "ios" }) });
  const appToken = ((await app.json()) as { token: string }).token;
  const refused = await fetch(`http://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, upgrade: "websocket", authorization: `Bearer ${appToken}` } });
  expect(refused.status).toBe(403);
  expect(await refused.text()).toContain("ducter worker <address> --code <code>");
});

test("D84: 改名字 renames another computer; tasks placed by its old name still find it", async () => {
  const core = boot();
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const w = core.devices.redeem(core.devices.createCode().code, { name: "ip-172-31-4-9", role: "worker" }) as { token: string; device: { id: string } };
  core.devices.redeem(core.devices.createCode().code, { name: "iPhone" });
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${w.token}` } } as any);
  stops.push(() => ws.close());
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.send(JSON.stringify({ t: "hello", name: "ip-172-31-4-9", os: "linux" }));
  const c = await client(core.url);
  c.send({ t: "devices" });
  await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.id === w.device.id && d.state === "awake"));

  let n = c.frames.length;
  c.send({ t: "rename_device", device: w.device.id, name: "Build box" });
  expect(await c.until((x) => x.t === "rename_result", n)).toEqual({ t: "rename_result", device: w.device.id, ok: true, name: "Build box" });
  const f = await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.name === "Build box"), n);
  expect(f.devices.find((d) => d.id === w.device.id)!.state).toBe("awake");
  expect(core.workers.list().map((x) => x.name)).toEqual(["Build box"]); // what the partner sees
  expect(core.workers.link("ip-172-31-4-9")?.id).toBe(w.device.id); // a task placed before the rename
  expect(core.workers.link("Build box")?.name).toBe("Build box");

  for (const [frame, reason] of [
    [{ device: "local", name: "iPhone" }, "name_taken"], // D155: the home renames, but never to a paired name
    [{ device: w.device.id, name: "iPhone" }, "name_taken"],
    [{ device: w.device.id, name: "Local" }, "name_taken"], // what the partner calls the machine Ducter lives on
    [{ device: "nobody", name: "x" }, "unknown_device"],
    [{ device: w.device.id, name: " " }, "empty"],
  ] as const) {
    n = c.frames.length;
    c.send({ t: "rename_device", ...frame });
    expect(await c.until((x) => x.t === "rename_result", n)).toMatchObject({ ok: false, reason });
  }

  // Renamed from the CLI (another process): the live worker takes the new name on the next sweep.
  const { openDeviceAuth } = await import("../src/auth.ts");
  const cli = openDeviceAuth(core.dataDir);
  cli.rename(w.device.id, "Builder");
  cli.close();
  for (let i = 0; i < 300 && core.workers.list()[0]?.name !== "Builder"; i++) await Bun.sleep(10);
  expect(core.workers.list()[0]?.name).toBe("Builder");
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

test("D155: a phone and the home rename in place; the home still answers to its host name", async () => {
  const core = boot();
  const phone = core.devices.redeem(core.devices.createCode().code, { name: "iPhone · Safari", platform: "ios-safari" }) as { device: { id: string } };
  const w = core.devices.redeem(core.devices.createCode().code, { name: "Build box", role: "worker" }) as { device: { id: string } };
  const c = await client(core.url);
  c.send({ t: "devices" });
  const first = await c.until<Devices>((x) => x.t === "devices");
  const host = first.devices.find((d) => d.home)!.name;

  let n = c.frames.length;
  c.send({ t: "rename_device", device: phone.device.id, name: "Wey's iPhone" });
  expect(await c.until((x) => x.t === "rename_result", n)).toEqual({ t: "rename_result", device: phone.device.id, ok: true, name: "Wey's iPhone" });
  await c.until<Devices>((x) => x.t === "devices" && x.reach.clients.some((cl) => cl.name === "Wey's iPhone"), n);

  n = c.frames.length;
  c.send({ t: "rename_device", device: "local", name: "hel" });
  expect(await c.until((x) => x.t === "rename_result", n)).toEqual({ t: "rename_result", device: "local", ok: true, name: "hel" });
  await c.until<Devices>((x) => x.t === "devices" && x.devices.some((d) => d.home && d.name === "hel"), n);
  // Its host name and "local" stay its own; nobody else can take its new name.
  for (const [frame, reason] of [
    [{ device: w.device.id, name: "hel" }, "name_taken"],
    [{ device: w.device.id, name: host }, "name_taken"],
    [{ device: "local", name: "Build box" }, "name_taken"],
    [{ device: "local", name: "  " }, "empty"],
  ] as const) {
    n = c.frames.length;
    c.send({ t: "rename_device", ...frame });
    expect(await c.until((x) => x.t === "rename_result", n)).toMatchObject({ ok: false, reason });
  }
  // Back to its host name: the display name goes.
  n = c.frames.length;
  c.send({ t: "rename_device", device: "local", name: host });
  expect(await c.until((x) => x.t === "rename_result", n)).toMatchObject({ ok: true, name: host });
  expect(await Bun.file(`${core.dataDir}/device-name`).exists()).toBe(false);
});

test("D155: a CLI says it's a CLI and which computer it's on; a default name never repeats", async () => {
  const core = boot();
  const code = async () => (await core.devicesView.pairCode()).code;
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };
  const pair = async (body: object): Promise<any> => (await fetch(`http://127.0.0.1:${core.port}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code: await code(), ...body }) })).json();
  await pair({ name: "Siweis-MacBook-Pro", platform: "darwin", form: "app", computer: "Siweis-MacBook-Pro" });
  await pair({ name: "CLI on Siweis-MacBook-Pro", platform: "darwin", form: "cli", computer: "Siweis-MacBook-Pro" });
  // Paired before D155: only its name says so.
  core.devices.redeem(core.devices.createCode().code, { name: "CLI on mini", platform: "darwin" });
  const a = await pair({ name: "iPhone · Safari", platform: "ios-safari" });
  const b = await pair({ name: "iPhone · Safari", platform: "ios-safari" });
  expect([a.name, b.name]).toEqual(["iPhone · Safari", "iPhone · Safari · 2"]);
  // A worker on the same Mac keeps its computer's name (another kind).
  const w = await pair({ name: "Siweis-MacBook-Pro", platform: "darwin-arm64", role: "worker", computer: "Siweis-MacBook-Pro" });
  expect(w.name).toBe("Siweis-MacBook-Pro");

  const f = await core.devicesView.frame();
  const by = (name: string) => f.reach.clients.find((c) => c.name === name)!;
  expect(by("Siweis-MacBook-Pro")).toMatchObject({ form: "app", computer: "Siweis-MacBook-Pro" });
  expect(by("CLI on Siweis-MacBook-Pro")).toMatchObject({ form: "cli", computer: "Siweis-MacBook-Pro" });
  expect(by("CLI on mini")).toMatchObject({ form: "cli", computer: "mini" });
  expect(by("iPhone · Safari").form).toBeUndefined();
  expect(f.devices.find((d) => d.id === w.deviceId)).toMatchObject({ computer: "Siweis-MacBook-Pro" });
});

test("helpers", () => {
  expect(kindFromPlatform("linux-x64")).toBe("server");
  expect(kindFromPlatform("ios")).toBe("phone");
  expect(kindFromPlatform("darwin-arm64")).toBe("laptop");
  expect(qrRows("hi")[0]).toMatch(/^1111111/);
});

// ---------- D228: 从外面连 / From outside on the home ----------

function tunnelFake() {
  const live = new Set<number>();
  let pid = 500;
  const sys: TunnelSys = {
    ensure: async () => ({ bin: "/fake/cloudflared" }),
    login: () => ({ url: Promise.resolve({ url: "https://dash.cloudflare.com/argotunnel?x=1", opened: false }), done: new Promise(() => {}), stop: () => {} }),
    exec: async () => ({ code: 1, out: "ERR not in this test" }),
    start: async () => (live.add(++pid), { pid }),
    alive: async (h) => !!h.pid && live.has(h.pid),
    stop: async (h) => void (h.pid && live.delete(h.pid)),
    ready: async () => true,
    resolves: async () => true,
    wsFirst: async () => undefined,
    freePort: async () => 21000,
    fetch: (async () => new Response("{}")) as unknown as typeof fetch,
  };
  return { sys, live };
}

test("D228: From outside off with nothing set up; on asks for the setup; 让 Ducter 帮我设好 opens one task on the home with its signed-in agent", async () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50, deviceProbes: probes(), platform: "darwin", anywhereSys: tunnelFake().sys });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const opened: any[] = [];
  core.setRunner({ openTask: async (i: any) => (opened.push(i), { taskId: "tsk_any" }) } as any);
  const c = await client(core.url);
  c.send({ t: "devices" });
  const first = await c.until<Devices>((x) => x.t === "devices");
  expect(ability(first.devices[0]!, "remote").state).toBe("off");
  expect(first.reach.anywhere).toBeUndefined();
  c.send({ t: "ability", device: "local", ability: "remote", on: true });
  const r = await c.until<Extract<ServerFrame, { t: "ability_result" }>>((x) => x.t === "ability_result");
  expect(r).toMatchObject({ ok: false, reason: "no_address" });
  c.send({ t: "anywhere_setup", op: "begin" });
  const b = await c.until<Extract<ServerFrame, { t: "anywhere_setup_result" }>>((x) => x.t === "anywhere_setup_result");
  expect(b).toMatchObject({ ok: true, taskId: "tsk_any" });
  expect(opened[0]).toMatchObject({ harness: "claude-code", place: { kind: "none" }, origin: "you", title: expect.stringContaining("reachable from outside") });
  expect(opened[0].brief).toMatch(/--port \d+ anywhere step login --json`/);
  const n = c.frames.length;
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices" && !!x.reach.anywhere, n);
  expect(f.reach.anywhere).toMatchObject({ how: "cloudflare", state: "setup", setup: { taskId: "tsk_any" } });
  expect(f.reach.anywhere!.setup!.steps.map((x) => x.id)).toEqual(["get", "login", "name", "create", "dns", "run", "check", "use"]);
  // Being set up is not on yet.
  expect(ability(f.devices[0]!, "remote").state).toBe("off");
  // A step from the task's agent: the sign-in link reaches every client, with a QR.
  c.send({ t: "anywhere_setup", op: "step", step: "login" });
  const m = c.frames.length;
  const withLink = await c.until<Devices>((x) => x.t === "devices" && !!x.reach.anywhere?.setup?.login, m);
  expect(withLink.reach.anywhere!.setup!.login).toMatchObject({ url: "https://dash.cloudflare.com/argotunnel?x=1", opened: false });
  expect(withLink.reach.anywhere!.setup!.login!.qr!.length).toBeGreaterThan(10);
});

test("D228: the self-check answers over HTTP and as a WebSocket's first message, and says nothing else", async () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50, deviceProbes: probes(), platform: "darwin", anywhereSys: tunnelFake().sys });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const check = await fetch(`http://127.0.0.1:${core.port}/.well-known/ducter-anywhere`, { headers: { "x-forwarded-for": "203.0.113.9" } });
  expect(check.status).toBe(200);
  const token = await check.text();
  expect(token.length).toBe(32);
  const first = await new Promise<string>((res, rej) => {
    const w = new WebSocket(`ws://127.0.0.1:${core.port}/.well-known/ducter-anywhere`);
    w.onmessage = (e) => res(String(e.data));
    w.onerror = rej;
  });
  expect(first).toBe(token);
});

test("D228: an address of the person's own shows From outside on, and the switch doesn't take it away", async () => {
  const t = tempDir();
  writeFileSync(join(t.dir, "public-url"), "https://hel.example.com\n");
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50, deviceProbes: probes(), platform: "linux", anywhereSys: tunnelFake().sys });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  const c = await client(core.url);
  c.send({ t: "devices" });
  const f = await c.until<Devices>((x) => x.t === "devices");
  expect(f.reach.anywhere).toEqual({ how: "own", state: "on" });
  expect(ability(f.devices[0]!, "remote").state).toBe("on");
  c.send({ t: "ability", device: "local", ability: "remote", on: false });
  const r = await c.until<Extract<ServerFrame, { t: "ability_result" }>>((x) => x.t === "ability_result");
  expect(r).toMatchObject({ ok: false, reason: "own_address" });
});
