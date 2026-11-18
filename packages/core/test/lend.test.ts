// D347: 加一台做事的电脑 / Add a computer for tasks: the code and the one line, then the home says when the
// computer joined and when it is here, so the clients wait for it in place.
import { afterEach, expect, test } from "bun:test";
import type { LendFrame, ServerFrame } from "@ducter/protocol";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, type Core } from "../src/core.ts";
import { createLend, lanAddress, lendCheck, lendLine } from "../src/lend.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(publicUrl?: string): Core {
  const t = tempDir();
  if (publicUrl) writeFileSync(join(t.dir, "public-url"), publicUrl + "\n");
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
  const until = async <T extends ServerFrame>(pred: (f: ServerFrame) => boolean, after = 0): Promise<T> => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(after).find(pred);
      if (hit) return hit as T;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

const REMOTE = { "x-forwarded-for": "198.51.100.7" };
const isLend = (state: LendFrame["state"]) => (x: ServerFrame) => x.t === "lend" && x.state === state;

test("lend: the line to paste, then joined, then here with its name, OS and agents in Devices", async () => {
  const core = boot("https://hel.example.com");
  const c = await client(core.url);
  c.send({ t: "lend_code" });
  const w = await c.until<LendFrame>(isLend("waiting"));
  expect(w.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(w.address).toBe("https://hel.example.com");
  expect(w.sameNetwork).toBeUndefined();
  expect(w.line).toBe(`curl -fsSL https://ducter.ai/install.sh | sh -s -- worker https://hel.example.com --code ${w.code}`);
  expect(w.check).toBe("curl -sS -m 10 https://hel.example.com/health");
  expect(Date.parse(w.expiresAt) - Date.now()).toBeGreaterThan(9 * 60_000);

  // The other computer runs the line: `ducter worker … --code` trades the code (lowercase, no dash: still it).
  const res = await fetch(`http://127.0.0.1:${core.port}/pair`, {
    method: "POST",
    headers: REMOTE,
    body: JSON.stringify({ code: w.code.toLowerCase().replace("-", ""), name: "nas", platform: "linux-x64", role: "worker", computer: "nas" }),
  });
  expect(res.status).toBe(200);
  const { token, deviceId } = (await res.json()) as { token: string; deviceId: string };
  const j = await c.until<LendFrame>(isLend("joined"));
  expect(j).toMatchObject({ code: w.code, device: deviceId, name: "nas" });
  expect(j.line).toBeUndefined(); // the line goes only to the window that asked

  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
  stops.push(() => ws.close());
  await new Promise<void>((r, x) => ((ws.onopen = () => r()), (ws.onerror = x)));
  ws.send(JSON.stringify({ t: "hello", name: "nas", os: "linux", arch: "x64", kind: "server", harnesses: [{ id: "claude-code", installed: true, loggedIn: true }, { id: "codex", installed: true, loggedIn: false }] }));
  const h = await c.until<LendFrame>(isLend("here"));
  expect(h).toMatchObject({ code: w.code, device: deviceId, name: "nas" });
  // Devices carries the rest: its OS and which agents are signed in there.
  const d = await c.until<Extract<ServerFrame, { t: "devices" }>>((x) => x.t === "devices" && x.devices.some((v) => v.id === deviceId && v.state === "awake"));
  const nas = d.devices.find((v) => v.id === deviceId)!;
  expect(nas.harnesses.filter((x) => x.loggedIn).map((x) => x.harness)).toEqual(["claude-code"]);
});

// research/127: the author's Mac app, a paired window reaching hel over its domain, sat at
// 正在拿一个码…. The home answers that window too, with the line (the drop was in the Mac's decoder).
test("lend: a paired app window from outside gets the code and the line", async () => {
  const core = boot("https://hel.example.com");
  const c = await client(core.url);
  c.send({ t: "pair_code" });
  const p = await c.until<Extract<ServerFrame, { t: "pair_code" }>>((x) => x.t === "pair_code");
  const res = await fetch(`http://127.0.0.1:${core.port}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code: p.code, name: "MacBook", platform: "darwin-arm64" }) });
  const { token } = (await res.json()) as { token: string };
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { ...REMOTE, authorization: `Bearer ${token}` } } as any);
  stops.push(() => ws.close());
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((r, x) => ((ws.onopen = () => r()), (ws.onerror = x)));
  ws.send(JSON.stringify({ t: "hello", client: "desktop", locale: "zh" }));
  ws.send(JSON.stringify({ t: "lend_code" }));
  for (let i = 0; i < 300 && !frames.some((f) => f.t === "lend" || f.t === "error"); i++) await Bun.sleep(10);
  const w = frames.find((f) => f.t === "lend") as LendFrame | undefined;
  expect(frames.filter((f) => f.t === "error")).toEqual([]);
  expect(w).toMatchObject({ state: "waiting", address: "https://hel.example.com" });
  expect(w!.line).toContain(`worker https://hel.example.com --code ${w!.code}`);
});

test("lend: a code paired another way (pair_code) never reads as a lent computer", async () => {
  const core = boot("https://hel.example.com");
  const c = await client(core.url);
  c.send({ t: "pair_code" });
  const p = await c.until<Extract<ServerFrame, { t: "pair_code" }>>((x) => x.t === "pair_code");
  await fetch(`http://127.0.0.1:${core.port}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code: p.code, name: "vps", role: "worker" }) });
  await Bun.sleep(100);
  expect(c.frames.some((f) => f.t === "lend")).toBe(false);
});

test("lend: no public address and listening only to itself: no line (the clients offer From outside)", async () => {
  const core = boot();
  const c = await client(core.url);
  c.send({ t: "lend_code" });
  const w = await c.until<LendFrame>(isLend("waiting"));
  expect(w.address).toBeUndefined();
  expect(w.line).toBeUndefined();
});

test("lend: a home listening on its own network offers that address, same network said", () => {
  const ifaces = { lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }], en0: [{ family: "IPv6", internal: false, address: "fe80::1" }, { family: "IPv4", internal: false, address: "192.168.1.20" }] } as any;
  expect(lanAddress("127.0.0.1", 7777, ifaces)).toBeUndefined();
  expect(lanAddress("0.0.0.0", 7777, ifaces)).toBe("http://192.168.1.20:7777");
  expect(lanAddress("10.0.0.5", 7777, ifaces)).toBe("http://10.0.0.5:7777");
  expect(lanAddress("203.0.113.4", 7777, ifaces)).toBeUndefined();
  const t = tempDir();
  stops.push(t.cleanup);
  const sent: LendFrame[] = [];
  const lend = createLend({ auth: { createCode: () => ({ code: "ABCD-EFGH", expiresAt: 0 }) }, dataDir: t.dir, env: {}, bind: "0.0.0.0", port: () => 7777, ifaces: () => ifaces, broadcast: (f) => sent.push(f) });
  const f = lend.mint();
  expect(f).toMatchObject({ address: "http://192.168.1.20:7777", sameNetwork: true, line: lendLine("http://192.168.1.20:7777", "ABCD-EFGH"), check: lendCheck("http://192.168.1.20:7777") });
  lend.hello("nobody"); // a worker that came from no lend says nothing
  expect(sent).toHaveLength(0);
});
