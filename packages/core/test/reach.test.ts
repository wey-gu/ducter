// D293: the home's key and address book, how a socket came in, liveness on the home's side, and a
// worker's sessions held through a drop. Fakes and a real core on port 0; no network.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, type Core } from "../src/core.ts";
import { homeIdentity } from "../src/home-key.ts";
import { addWay, createReach, readWays, removeKind, removeWay, setPrimary, viaOf } from "../src/reach-book.ts";
import { createLiveness, createWorkers, CLOSE_SILENT } from "../src/workers.ts";
import { checkProof } from "@ducter/protocol/src/reach-verify.ts";
import { CHALLENGE_PATH } from "@ducter/protocol/src/reach.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const dir = () => {
  const t = tempDir();
  stops.push(t.cleanup);
  return t.dir;
};
const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout");
    await Bun.sleep(10);
  }
};

test("the home's key is made once, kept 0600 beside its data, and signs only challenges", () => {
  const d = dir();
  const a = homeIdentity(d);
  const b = homeIdentity(d);
  expect(b.fp).toBe(a.fp);
  expect(a.fp).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(statSync(join(d, "home-key.pem")).mode & 0o777).toBe(0o600);
  expect(checkProof(a.prove("abcdefghijklmnopqrstuv"), "abcdefghijklmnopqrstuv", a.fp)).toBe(true);
  // Another home's data folder: another key.
  expect(homeIdentity(dir()).fp).not.toBe(a.fp);
});

test("the book: each way added beside the others; the first is the primary; a tailnet never takes over from a domain", () => {
  const d = dir();
  expect(addWay(d, "domain", "https://hel.example.com/")).toEqual({ primary: true });
  expect(readFileSync(join(d, "public-url"), "utf8").trim()).toBe("https://hel.example.com");
  expect(addWay(d, "tailnet", "https://hel.tail1234.ts.net")).toEqual({ primary: false });
  expect(addWay(d, "tunnel", "https://ducter.example.org")).toEqual({ primary: false });
  expect(readWays(d, { env: {} })).toEqual([
    { kind: "domain", url: "https://hel.example.com", primary: true },
    { kind: "tailnet", url: "https://hel.tail1234.ts.net" },
    { kind: "tunnel", url: "https://ducter.example.org" },
  ]);
  // The primary goes: the next that reaches everyone (the tunnel) leads pairing links.
  expect(removeWay(d, "https://hel.example.com")).toBe(true);
  expect(readFileSync(join(d, "public-url"), "utf8").trim()).toBe("https://ducter.example.org");
  expect(setPrimary(d, "https://hel.tail1234.ts.net")).toBe(true);
  expect(removeKind(d, "tailnet")).toEqual(["https://hel.tail1234.ts.net"]);
  expect(readFileSync(join(d, "public-url"), "utf8").trim()).toBe("https://ducter.example.org");
  expect(removeWay(d, "https://ducter.example.org")).toBe(true);
  expect(existsSync(join(d, "public-url"))).toBe(false);
  expect(removeWay(d, "https://nowhere.example")).toBe(false);
});

test("a public-url from before D293 is a way too, and joins the book when another way is added", () => {
  const d = dir();
  writeFileSync(join(d, "public-url"), "https://hel.tail1234.ts.net\n");
  expect(readWays(d, { env: {} })).toEqual([{ kind: "tailnet", url: "https://hel.tail1234.ts.net", primary: true }]);
  addWay(d, "domain", "https://hel.example.com");
  expect(readWays(d, { env: {} }).map((w) => [w.kind, w.url, !!w.primary])).toEqual([
    ["tailnet", "https://hel.tail1234.ts.net", true],
    ["domain", "https://hel.example.com", false],
  ]);
  // A tunnel's hostname, known to the home, names the tunnel's address from before.
  const e = dir();
  writeFileSync(join(e, "public-url"), "https://ducter.example.org\n");
  expect(readWays(e, { env: {}, tunnelHost: "ducter.example.org" })[0]!.kind).toBe("tunnel");
});

test("how a request came in: loopback, the tailnet, a domain, a Cloudflare tunnel (not sealed), plain http on a network", () => {
  const ways = [
    { kind: "domain" as const, url: "https://hel.example.com" },
    { kind: "tunnel" as const, url: "https://ducter.example.org" },
    { kind: "tailnet" as const, url: "https://hel.tail1234.ts.net" },
  ];
  const req = (host: string, h: Record<string, string> = {}, url = `http://${host}/ws`) => new Request(url, { headers: { host, ...h } });
  expect(viaOf(req("127.0.0.1:7777"), "127.0.0.1", ways)).toEqual({ kind: "local", sealed: true });
  expect(viaOf(req("hel.tail1234.ts.net", { "x-forwarded-for": "100.64.0.2", "x-forwarded-proto": "https", "tailscale-user-login": "a@b" }), "127.0.0.1", ways)).toEqual({ kind: "tailnet", sealed: true, url: "https://hel.tail1234.ts.net" });
  expect(viaOf(req("hel.example.com", { "x-forwarded-for": "203.0.113.9", "x-forwarded-proto": "https" }), "127.0.0.1", ways)).toEqual({ kind: "domain", sealed: true, url: "https://hel.example.com" });
  expect(viaOf(req("ducter.example.org", { "cf-connecting-ip": "203.0.113.9", "x-forwarded-proto": "https" }), "127.0.0.1", ways)).toEqual({ kind: "tunnel", sealed: false, url: "https://ducter.example.org" });
  // A domain behind Cloudflare's proxy: Cloudflare opens it too.
  expect(viaOf(req("other.example.net", { "cf-connecting-ip": "203.0.113.9" }), "127.0.0.1", ways)).toEqual({ kind: "domain", sealed: false });
  expect(viaOf(req("192.168.1.20:7777"), "192.168.1.30", ways)).toEqual({ kind: "lan", sealed: false });
});

test("the running home's view: a way a device uses now is up; the home's own check says up or down; changes are heard", async () => {
  const d = dir();
  addWay(d, "domain", "https://hel.example.com");
  addWay(d, "tailnet", "https://hel.tail1234.ts.net");
  const used = new Set<string>();
  const r = createReach({ dataDir: d, env: {}, check: async (u) => u.includes("example.com"), inUse: () => used, readMs: 60_000, checkMs: 60_000 });
  stops.push(() => r.stop());
  let changes = 0;
  r.onChange(() => changes++);
  expect(r.ways().map((w) => w.state)).toEqual(["unknown", "unknown"]);
  await r.tick();
  expect(r.ways().map((w) => w.state)).toEqual(["up", "down"]);
  // The machine itself often can't open its ts.net name; a phone connected through it can.
  used.add("https://hel.tail1234.ts.net");
  r.refresh();
  expect(r.ways().map((w) => w.state)).toEqual(["up", "up"]);
  expect(changes).toBe(2);
  // Another process (the CLI) adds a way: read again.
  addWay(d, "tunnel", "https://ducter.example.org");
  await r.tick();
  expect(r.ways().map((w) => w.kind)).toEqual(["domain", "tailnet", "tunnel"]);
});

test("liveness on the home's side: pinged while it answers, cut after 45 s of silence", () => {
  let now = 0;
  const live = createLiveness({ now: () => now });
  const ws = { pings: 0, closed: false, ping() {this.pings++;}, terminate() {this.closed = true;} };
  live.heard(ws);
  now = 15_000;
  live.sweep();
  now = 30_000;
  live.touch(ws); // a pong
  now = 60_000;
  live.sweep();
  expect(ws).toMatchObject({ pings: 2, closed: false });
  now = 75_001;
  live.sweep();
  expect(ws.closed).toBe(true);
  expect(live.size()).toBe(0);
  // A socket without terminate is closed with its own code.
  const old = { code: 0, close(c: number) {this.code = c;} };
  live.heard(old);
  now += 50_000;
  live.sweep();
  expect(old.code).toBe(CLOSE_SILENT);
  // A pong from a socket it doesn't track (the tunnel's self-check) doesn't start tracking it.
  live.touch({});
  expect(live.size()).toBe(0);
});

/** A fake worker socket for createWorkers. */
function fakeSocket(id: string) {
  const sent: any[] = [];
  return { sent, data: { worker: true as const, device: { id, name: "MacBook", kind: "worker" } as any, since: "" }, send: (s: string) => sent.push(JSON.parse(s)), close() {} };
}

test("D293: a worker's sessions are held through a drop; back in time with them, they carry on; past the grace, they end", async () => {
  const w = createWorkers({ personaName: () => "Ducter", holdMs: 60, welcome: () => ({ fp: "fp1", ways: [] }) });
  const s1 = fakeSocket("w1");
  w.websocket.open(s1 as any);
  w.websocket.message(s1 as any, JSON.stringify({ t: "hello", name: "MacBook" }));
  const link = w.link("w1")!;
  const frames: any[] = [];
  link.onSession("k1", (f) => frames.push(f));
  link.onSession("k2", (f) => frames.push(f));
  w.websocket.close(s1 as any);
  expect(frames).toEqual([{ t: "away", key: "k1" }, { t: "away", key: "k2" }]);
  // Back with k1 only (k2 ended on the worker meanwhile, and its last words are gone).
  const s2 = fakeSocket("w1");
  w.websocket.open(s2 as any);
  w.websocket.message(s2 as any, JSON.stringify({ t: "hello", name: "MacBook", held: ["k1"] }));
  expect(frames.slice(2)).toEqual([{ t: "end", key: "k2", offline: true, error: "MacBook disconnected" }, { t: "back", key: "k1" }]);
  expect(s2.sent[0]).toMatchObject({ t: "welcome", fp: "fp1", ways: [] });
  // Dropped again, never back: k1 ends when the hold runs out.
  w.websocket.close(s2 as any);
  await until(() => frames.some((f) => f.t === "end" && f.key === "k1"));
  w.stop();
});

test("D293: a socket that replaces another (a new network before the old socket died) holds the sessions too", () => {
  const w = createWorkers({ personaName: () => "Ducter", holdMs: 60_000 });
  const s1 = fakeSocket("w1");
  w.websocket.open(s1 as any);
  w.websocket.message(s1 as any, JSON.stringify({ t: "hello" }));
  const frames: any[] = [];
  w.link("w1")!.onSession("k1", (f) => frames.push(f));
  const s2 = fakeSocket("w1");
  w.websocket.open(s2 as any);
  w.websocket.message(s2 as any, JSON.stringify({ t: "hello", held: ["k1"] }));
  expect(frames).toEqual([{ t: "away", key: "k1" }, { t: "back", key: "k1" }]);
  w.stop();
});

test("D293: the Mac app's 'going to sleep' marks its computer's worker asleep when its socket goes", () => {
  const w = createWorkers({ personaName: () => "Ducter" });
  const s1 = fakeSocket("w1");
  w.websocket.open(s1 as any);
  w.websocket.message(s1 as any, JSON.stringify({ t: "hello" }));
  w.sleeping("w1");
  w.websocket.close(s1 as any);
  expect(w.away().get("w1")?.asleep).toBe(true);
  w.stop();
});

function boot(before?: (dataDir: string) => void): Core {
  const t = tempDir();
  before?.(t.dir);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, sweepMs: 50 });
  stops.push(t.cleanup, () => core.stop());
  return core;
}

test("the home over a real socket: it proves itself before the gate, says its fingerprint and ways on welcome, answers ping, and pairing hands out its key", async () => {
  const core = boot((d) => addWay(d, "domain", "https://hel.example.com"));
  const base = `http://127.0.0.1:${core.port}`;
  // The challenge needs no token (a device asks a new way before showing it its token)…
  const remote = { "x-forwarded-for": "203.0.113.9", host: "hel.example.com" };
  const r = await fetch(`${base}${CHALLENGE_PATH}?n=abcdefghijklmnopqrstuv`, { headers: remote });
  expect(r.status).toBe(200);
  const proof = await r.json();
  expect(checkProof(proof, "abcdefghijklmnopqrstuv", proof.fp)).toBe(true);
  expect((await fetch(`${base}${CHALLENGE_PATH}?n=short`, { headers: remote })).status).toBe(400);
  // …and pairing answers the key and the ways.
  const code = core.devices.createCode().code;
  const paired: any = await (await fetch(`${base}/pair`, { method: "POST", headers: { ...remote, "content-type": "application/json" }, body: JSON.stringify({ code, name: "iPhone", platform: "ios" }) })).json();
  expect(paired.fp).toBe(proof.fp);
  expect(paired.key).toBe(proof.key);
  expect(paired.ways).toEqual([{ kind: "domain", url: "https://hel.example.com", primary: true, state: "unknown" }]);

  const frames: any[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { ...remote, "x-forwarded-proto": "https", authorization: `Bearer ${paired.token}` } } as any);
  stops.push(() => ws.close());
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise((res) => (ws.onopen = res));
  ws.send(JSON.stringify({ t: "hello", client: "web" }));
  await until(() => frames.some((f) => f.t === "ways"));
  expect(frames[0]).toMatchObject({ t: "welcome", ping: true, fp: proof.fp });
  expect(frames.find((f) => f.t === "ways")).toMatchObject({ key: proof.key, fp: proof.fp, ways: [{ kind: "domain", url: "https://hel.example.com" }] });
  ws.send(JSON.stringify({ t: "ping" }));
  await until(() => frames.some((f) => f.t === "pong"));
  // Devices says how it is connected: through the domain, sealed; and the domain is up (in use).
  const v = await core.devicesView.frame();
  expect(v.reach.clients.find((c) => c.name === "iPhone")?.via).toEqual({ kind: "domain", sealed: true });
  expect(v.reach.ways).toEqual([{ kind: "domain", url: "https://hel.example.com", primary: true, state: "up" }]);
  expect(v.reach.home?.fp).toBe(proof.fp);
});
