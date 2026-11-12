// D228: 在哪儿都能用 / From anywhere: the tunnel Ducter runs, with cloudflared, its metrics and the
// network faked. Restarts, a lost tunnel, a changed address, the address relay, and the request a
// tunnel delivers counting as remote.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeMove, encodeMove, lookupAddress, moveTarget, newFollowSecrets, openAddress, sealAddress, type Follow } from "@ducter/protocol";
import { anywhereFile, cloudflaredArgs, createAnywhere, tunnelAddress, type TunnelHandle, type TunnelStart, type TunnelSys } from "../src/anywhere.ts";
import { isLocalRequest } from "../src/auth.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-anywhere-"));
  dirs.push(d);
  return d;
};

/** cloudflared as a set of fake processes, each with its own quick-tunnel name. */
function fakeSys(o: { download?: "ok" | "fail"; resolveAfter?: number } = {}) {
  let next = 100;
  let names = 0;
  const procs = new Map<number, { host: string; start: TunnelStart; ready: boolean }>();
  const starts: TunnelStart[] = [];
  const stopped: number[] = [];
  const puts: { id: string; w: string; d: string }[] = [];
  let checkAnswer: (url: string) => string | undefined = () => undefined;
  let gettingCalls = 0;
  let resolveCalls = 0;
  const sys: TunnelSys = {
    async ensure(onGetting) {
      onGetting();
      gettingCalls++;
      return o.download === "fail" ? { error: "download", detail: "HTTP 503" } : { bin: "/fake/cloudflared" };
    },
    async start(s) {
      starts.push(s);
      const pid = next++;
      procs.set(pid, { host: `name-${++names}.trycloudflare.com`, start: s, ready: true });
      return { pid };
    },
    async alive(h: TunnelHandle) {
      return !!h.pid && procs.has(h.pid);
    },
    async stop(h: TunnelHandle) {
      if (h.pid && procs.delete(h.pid)) stopped.push(h.pid);
    },
    async hostname(mp) {
      return [...procs.values()].find((p) => p.start.metricsPort === mp)?.host;
    },
    async ready(mp) {
      return [...procs.values()].find((p) => p.start.metricsPort === mp)?.ready ?? false;
    },
    async resolves() {
      resolveCalls++;
      return resolveCalls > (o.resolveAfter ?? 0);
    },
    async freePort() {
      return 20000 + starts.length;
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/put")) {
        puts.push(JSON.parse(String(init?.body)));
        return new Response("{}", { status: 200 });
      }
      if (url.includes("/.well-known/ducter-anywhere")) {
        const a = checkAnswer(url);
        return a === undefined ? new Response("bad gateway", { status: 530 }) : new Response(a);
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch,
  };
  return {
    sys,
    procs,
    starts,
    stopped,
    puts,
    get gettingCalls() {
      return gettingCalls;
    },
    setCheck(fn: (url: string) => string | undefined) {
      checkAnswer = fn;
    },
    /** The process dies (the computer slept through, it crashed). */
    kill(pid: number) {
      procs.delete(pid);
    },
  };
}

const env = { DUCTER_ADDR_RELAY: "https://relay.test/api/addr" };
const until = async (fn: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(5);
  }
};

test("one tap: it starts, shows 正在准备 while it fetches, then has an address and leaves a sealed note", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  const seen: string[] = [];
  a.onChange(() => seen.push(`${a.view()?.state}${a.view()?.getting ? "+getting" : ""}`));
  expect(a.view()).toBeUndefined();
  expect((await a.turnOn()).ok).toBe(true);
  await until(() => a.view()?.state === "on");
  expect(seen).toContain("starting+getting");
  expect(a.address()).toBe("https://name-1.trycloudflare.com");
  const v = a.view()!;
  expect(v).toMatchObject({ how: "tunnel", state: "on", moves: true });
  expect(v.follow?.relay).toBe("https://relay.test/api/addr");
  // cloudflared points at this Ducter, with its own config and metrics port.
  expect(f.starts[0]).toMatchObject({ port: 7777, bin: "/fake/cloudflared" });
  await until(() => f.puts.length === 1);
  const note = await openAddress(v.follow!.key, v.follow!.id, f.puts[0]!.d);
  expect(note?.url).toBe("https://name-1.trycloudflare.com");
  // The write secret never leaves the home in the view.
  expect(JSON.stringify(v)).not.toContain(f.puts[0]!.w);
  expect(tunnelAddress(dataDir)).toBe("https://name-1.trycloudflare.com");
  expect(statSync(anywhereFile(dataDir)).mode & 0o777).toBe(0o600);
  a.close();
});

test("it doesn't touch the new name until public DNS has it (no negative answer cached here)", async () => {
  const dataDir = tmp();
  const f = fakeSys({ resolveAfter: 3 });
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  await a.turnOn();
  await Bun.sleep(50);
  expect(a.view()?.state).toBe("starting");
  await until(() => a.view()?.state === "on", 6000);
  a.close();
});

test("a Ducter restart (an update) keeps the tunnel and its address: it is adopted, not started again", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  await a.turnOn();
  await until(() => a.view()?.state === "on");
  a.close();
  const b = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  expect(b.view()?.state).toBe("on");
  await b.resume();
  expect(f.starts.length).toBe(1);
  expect(b.address()).toBe("https://name-1.trycloudflare.com");
  b.close();
});

test("after the computer restarts (the tunnel is gone) it starts again at a new address and says so to the relay", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  await a.turnOn();
  await until(() => a.view()?.state === "on");
  await until(() => f.puts.length === 1);
  a.close();
  f.kill(100);
  const b = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  await b.resume();
  expect(b.address()).toBe("https://name-2.trycloudflare.com");
  await until(() => f.puts.length === 2);
  const follow = b.view()!.follow!;
  const note = await openAddress(follow.key, follow.id, f.puts[1]!.d);
  expect(note?.url).toBe("https://name-2.trycloudflare.com");
  // The same id and key: the devices paired before follow without pairing again.
  expect(f.puts[1]!.id).toBe(f.puts[0]!.id);
  b.close();
});

test("a tunnel lost while running is started again by the next look; the devices hear the new address", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {}, pollMs: 60_000 });
  await a.turnOn();
  await until(() => a.view()?.state === "on");
  let changes = 0;
  a.onChange(() => changes++);
  f.kill(100);
  await a.tick();
  expect(a.address()).toBe("https://name-2.trycloudflare.com");
  expect(changes).toBeGreaterThan(0);
  a.close();
});

test("an address that stops leading here three looks in a row (while Cloudflare is connected) gets a fresh tunnel", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {}, pollMs: 60_000 });
  await a.turnOn();
  await until(() => a.view()?.state === "on");
  const check = a.checkToken();
  f.setCheck((u) => (u.startsWith(a.address()!) && !u.includes("name-1") ? check : undefined));
  for (let i = 0; i < 15 && a.address()?.includes("name-1"); i++) await a.tick();
  expect(a.address()).toBe("https://name-2.trycloudflare.com");
  expect(f.stopped).toContain(100);
  // A healthy address is left alone.
  for (let i = 0; i < 15; i++) await a.tick();
  expect(a.address()).toBe("https://name-2.trycloudflare.com");
  a.close();
});

test("no network (Cloudflare not connected) is not a broken tunnel: it waits, cloudflared reconnects by itself", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {}, pollMs: 60_000 });
  await a.turnOn();
  await until(() => a.view()?.state === "on");
  f.procs.get(100)!.ready = false;
  for (let i = 0; i < 20; i++) await a.tick();
  expect(a.address()).toBe("https://name-1.trycloudflare.com");
  expect(f.starts.length).toBe(1);
  a.close();
});

test("off stops the tunnel and forgets the address; on again keeps the devices' key", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  await a.turnOn();
  await until(() => a.view()?.state === "on");
  const key = a.view()!.follow!.key;
  await a.turnOff();
  expect(a.view()).toBeUndefined();
  expect(a.address()).toBeUndefined();
  expect(f.stopped).toEqual([100]);
  expect(tunnelAddress(dataDir)).toBeUndefined();
  await a.turnOn();
  await until(() => a.view()?.state === "on");
  expect(a.view()!.follow!.key).toBe(key);
  a.close();
});

test("an address of the person's own (ducter domain) wins: shown on, nothing to run", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, own: () => "https://hel.example.com", log: () => {} });
  expect(a.view()).toEqual({ how: "own", state: "on" });
  expect(await a.turnOn()).toEqual({ ok: false, reason: "own_address" });
  expect(f.starts.length).toBe(0);
});

test("it can't download: failed, said why; no tunnel", async () => {
  const dataDir = tmp();
  const f = fakeSys({ download: "fail" });
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  await a.turnOn();
  await until(() => a.view()?.state === "failed");
  expect(a.view()).toMatchObject({ state: "failed", reason: "download", detail: "HTTP 503" });
  expect(a.address()).toBeUndefined();
  a.close();
});

test("the person's own named tunnel: their hostname, the token kept 0600 and never on the command line", async () => {
  const dataDir = tmp();
  const f = fakeSys();
  const a = createAnywhere({ dataDir, port: 7777, env, sys: f.sys, log: () => {} });
  const token = "eyJhIjoiZmFrZS1hY2NvdW50LXRhZyIsInQiOiJmYWtlIn0=";
  expect((await a.turnOn({ token, address: "home.example.com" })).ok).toBe(true);
  await until(() => a.view()?.state === "on");
  expect(a.address()).toBe("https://home.example.com");
  expect(a.view()).toMatchObject({ how: "named", state: "on" });
  expect(a.view()!.moves).toBeUndefined();
  expect(f.starts[0]!.token).toBe(token);
  expect(statSync(join(dataDir, "anywhere-token")).mode & 0o777).toBe(0o600);
  expect(cloudflaredArgs(f.starts[0]!).join(" ")).not.toContain(token);
  expect(f.puts.length).toBe(0); // a stable address needs no note
  expect((await a.turnOn({ token: "short", address: "home.example.com" })).ok).toBe(false);
  a.close();
});

test("cloudflared's command line: a quick tunnel to this Ducter only, its own config and metrics", () => {
  expect(cloudflaredArgs({ port: 7777, metricsPort: 20001, configFile: "/d/anywhere-cloudflared.yml" })).toEqual([
    "tunnel",
    "--no-autoupdate",
    "--config",
    "/d/anywhere-cloudflared.yml",
    "--metrics",
    "127.0.0.1:20001",
    "--url",
    "http://127.0.0.1:7777",
  ]);
  expect(cloudflaredArgs({ port: 7777, metricsPort: 20001, configFile: "/c", token: "t" }).at(-1)).toBe("run");
});

test("a request through the tunnel is never local: loopback peer, but the outside Host and Cloudflare's headers", () => {
  // As measured through a real quick tunnel (research/67).
  const req = new Request("http://127.0.0.1:7777/ws", {
    headers: { host: "name-1.trycloudflare.com", "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9", "x-forwarded-proto": "https", "cdn-loop": "cloudflare; loops=1" },
  });
  expect(isLocalRequest(req, "127.0.0.1")).toBe(false);
  // Even if a tunnel were set to send a loopback Host, its proxy headers give it away.
  const sneaky = new Request("http://127.0.0.1:7777/ws", { headers: { host: "127.0.0.1:7777", "cf-connecting-ip": "203.0.113.9" } });
  expect(isLocalRequest(sneaky, "127.0.0.1")).toBe(false);
});

// ---------- follow.ts: how devices find the home again ----------

test("a sealed note opens only with its key and id, and a device moves only to a newer, different address", async () => {
  const s = newFollowSecrets();
  const d = await sealAddress(s.key, s.id, { url: "https://b.trycloudflare.com/", at: 2000 });
  expect(await openAddress(s.key, s.id, d)).toEqual({ url: "https://b.trycloudflare.com", at: 2000 });
  expect(await openAddress(newFollowSecrets().key, s.id, d)).toBeUndefined();
  expect(await openAddress(s.key, newFollowSecrets().id, d)).toBeUndefined(); // moved to another id: refused
  expect(await openAddress(s.key, s.id, d.slice(0, -4) + "AAAA")).toBeUndefined();
  // Only https (or this computer) is ever followed.
  expect(await openAddress(s.key, s.id, await sealAddress(s.key, s.id, { url: "http://evil.example", at: 3 }))).toBeUndefined();
  expect(moveTarget("https://a.trycloudflare.com", { url: "https://b.trycloudflare.com", at: 2000 }, 1000)).toBe("https://b.trycloudflare.com");
  expect(moveTarget("https://b.trycloudflare.com/", { url: "https://b.trycloudflare.com", at: 2000 }, 1000)).toBeUndefined();
  expect(moveTarget("https://a.trycloudflare.com", { url: "https://old.trycloudflare.com", at: 500 }, 1000)).toBeUndefined();
  expect(moveTarget("https://a.trycloudflare.com", undefined)).toBeUndefined();
});

test("lookupAddress asks the relay by id and opens what comes back; a relay that is down says nothing", async () => {
  const s = newFollowSecrets();
  const f: Follow = { relay: "https://relay.test/api/addr", id: s.id, key: s.key };
  const d = await sealAddress(s.key, s.id, { url: "https://c.trycloudflare.com", at: 5 });
  let asked = "";
  const ok = (async (u: string | URL | Request) => {
    asked = String(u);
    return Response.json({ d });
  }) as typeof fetch;
  expect(await lookupAddress(f, ok)).toEqual({ url: "https://c.trycloudflare.com", at: 5 });
  expect(asked).toBe(`https://relay.test/api/addr/get?id=${s.id}`);
  expect(await lookupAddress(f, (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBeUndefined();
  expect(await lookupAddress(f, (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBeUndefined();
});

test("the move payload rides the fragment and comes back whole (a stray follow is dropped)", () => {
  const s = newFollowSecrets();
  const p = { token: "dvc.abc", deviceId: "d1", name: "iPhone · Safari", personaName: "Ducter", follow: { relay: "https://relay.test/api/addr", id: s.id, key: s.key }, at: 9 };
  expect(decodeMove(`#move=${encodeMove(p)}`)).toEqual(p);
  expect(decodeMove(`#x=1&move=${encodeMove({ ...p, follow: { relay: "nope", id: "x", key: "y" } })}`)?.follow).toBeUndefined();
  expect(decodeMove("#c=K7QM-4XPA")).toBeUndefined();
  expect(decodeMove("#move=!!!")).toBeUndefined();
});

test("a saved file from before (on, an address) reads back for the CLI's pair", () => {
  const dataDir = tmp();
  writeFileSync(anywhereFile(dataDir), JSON.stringify({ on: true, how: "tunnel", port: 7777, url: "https://x.trycloudflare.com", check: "c" }));
  expect(tunnelAddress(dataDir)).toBe("https://x.trycloudflare.com");
  writeFileSync(anywhereFile(dataDir), JSON.stringify({ on: false, how: "tunnel", port: 7777, check: "c" }));
  expect(tunnelAddress(dataDir)).toBeUndefined();
  expect(readFileSync(anywhereFile(dataDir), "utf8")).toContain("tunnel");
});
