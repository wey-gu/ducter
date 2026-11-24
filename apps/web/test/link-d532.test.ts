// D532: the web client (and the iPhone, iPad and Android apps that show it) leaves its pairing only
// on the home's own signed word, as the Mac does (D520). The page's real Connection and link watch
// run against a fake home (the real device store and the real home key) behind a fake proxy that
// can say 502, say 401, forge a revoke, or pass. Only the true revoke may end the pairing.
import { afterEach, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";
import { HOME_KEY_FILE, homeIdentity } from "@ducter/core/src/home-key.ts";
import { STANDING_PATH } from "@ducter/protocol/src/reach.ts";
import { checkStanding } from "@ducter/protocol/src/reach-verify.ts";
import { askStandingWeb, checkStandingWeb } from "@ducter/protocol/src/reach-verify-web.ts";
import { Connection, backoff, type ConnStatus } from "../src/conn.ts";
import { createLinkWatch, judge, linkState, LONG_OUTAGE_MS, memoStore, OLD_HOME_TRIES, OLD_HOME_WINDOW_MS, type LinkMemo } from "../src/link.ts";

const stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.splice(0).reverse()) s();
});
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-link-"));
  stops.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const until = async (ok: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await Bun.sleep(20);
  }
};
const kv = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

type HomeMode = { old?: boolean };
/** A home: /api/me and /ws behind its gate, and D520's signed standing before it (unless old). */
function fakeHome(data = dir(), mode: HomeMode = {}) {
  const devices = openDeviceAuth(data);
  const id = homeIdentity(data);
  const tokenOf = (req: Request) => {
    const a = req.headers.get("authorization") ?? "";
    if (a.startsWith("Bearer ")) return a.slice(7).trim();
    const p = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim());
    return p[0] === "ducter" ? (p[1] ?? "") : "";
  };
  const handler = (req: Request, server: import("bun").Server<unknown>) => {
    const url = new URL(req.url);
    if (url.pathname === STANDING_PATH && !mode.old) {
      const n = url.searchParams.get("n") ?? "";
      const s = devices.standing(tokenOf(req));
      return Response.json(id.attest(s.standing, s.device, n));
    }
    const dev = devices.verify(tokenOf(req));
    if (!dev) return new Response("unauthorized", { status: 401 });
    if (url.pathname === "/ws") return server.upgrade(req, { headers: { "sec-websocket-protocol": "ducter" } }) ? undefined : new Response("no", { status: 400 });
    if (url.pathname === "/api/me") return Response.json({ via: "device", personaName: "Ducter", deviceId: dev.id, push: { supported: false } });
    return new Response("not found", { status: 404 });
  };
  const ws = { message: (w: import("bun").ServerWebSocket<unknown>, m: string | Buffer) => {
    const f = JSON.parse(String(m));
    if (f.t === "hello") w.send(JSON.stringify({ t: "welcome", persona: "", personaName: "Ducter", headSeq: 0, fp: id.fp }));
  } };
  let server: import("bun").Server<unknown> | undefined = Bun.serve({ port: 0, fetch: handler, websocket: ws });
  const port = server.port!;
  const home = {
    data,
    devices,
    fp: id.fp,
    port,
    get up() {
      return !!server;
    },
    /** The home stops (an OOM kill, an update restart): its port refuses. */
    down() {
      server?.stop(true);
      server = undefined;
    },
    /** The home listens again on the same port. */
    upAgain() {
      server = Bun.serve({ port, fetch: handler, websocket: ws });
    },
  };
  stops.push(() => home.down());
  return home;
}

type ProxyMode = "pass" | "502" | "401" | "401-standing-down" | "forge-key" | "forge-unsigned";
/** A proxy in front of the home (Caddy, Cloudflare): passes, or says what a proxy may say. */
function fakeProxy(home: ReturnType<typeof fakeHome>) {
  const p = { mode: "pass" as ProxyMode, wsUpgrades: 0 };
  const other = homeIdentity(dir()); // another home's key, for a forged revoke
  const upstream = `127.0.0.1:${home.port}`;
  const server = Bun.serve<{ protocols: string[]; up?: WebSocket; queue: string[] }>({
    port: 0,
    async fetch(req, srv) {
      const url = new URL(req.url);
      const standing = url.pathname === STANDING_PATH;
      if (p.mode === "502") return new Response("bad gateway", { status: 502 });
      if (p.mode === "forge-key" && standing) return Response.json(other.attest("revoked", "0123456789", url.searchParams.get("n") ?? ""));
      if (p.mode === "forge-unsigned" && standing) return Response.json({ v: 1, standing: "revoked", device: "0123456789", key: other.key, fp: home.fp, sig: "A".repeat(86) });
      if (p.mode === "401-standing-down" && standing) return new Response("bad gateway", { status: 502 });
      if ((p.mode === "401" || p.mode === "401-standing-down" || p.mode.startsWith("forge")) && !(p.mode === "401" && standing)) return new Response("unauthorized", { status: 401 });
      if (url.pathname === "/ws") {
        p.wsUpgrades++;
        const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        return srv.upgrade(req, { data: { protocols, queue: [] }, headers: { "sec-websocket-protocol": "ducter" } }) ? undefined : new Response("no", { status: 400 });
      }
      if (!home.up) return new Response("bad gateway", { status: 502 });
      try {
        return await fetch(`http://${upstream}${url.pathname}${url.search}`, { headers: req.headers });
      } catch {
        return new Response("bad gateway", { status: 502 });
      }
    },
    websocket: {
      open(w) {
        // Like Caddy: dial the home, and drop the client when the home refuses or isn't there.
        if (!home.up) return void w.close(1011, "bad gateway");
        const up = new WebSocket(`ws://${upstream}/ws`, w.data.protocols);
        w.data.up = up;
        up.onopen = () => w.data.queue.splice(0).forEach((m) => up.send(m));
        up.onmessage = (m) => w.readyState === 1 && w.send(String(m.data));
        up.onclose = () => w.readyState === 1 && w.close();
        up.onerror = () => w.readyState === 1 && w.close();
      },
      message(w, m) {
        const up = w.data.up;
        if (up?.readyState === WebSocket.OPEN) up.send(String(m));
        else w.data.queue.push(String(m));
      },
      close(w) {
        w.data.up?.close();
      },
    },
  });
  stops.push(() => server.stop(true));
  return Object.assign(p, { base: new URL(`http://127.0.0.1:${server.port}/`), ws: `ws://127.0.0.1:${server.port}/ws` });
}

/** A paired device: the page's real Connection and link watch, its record kept in memory. */
async function device(home: ReturnType<typeof fakeHome>, proxy: ReturnType<typeof fakeProxy>, o: { pin?: boolean; memo?: LinkMemo } = {}) {
  const code = home.devices.createCode().code;
  const r = home.devices.redeem(code, { name: "iPhone", platform: "ios-app" });
  if ("error" in r) throw new Error(r.error);
  const rec: { token?: string; fp?: string; deviceId: string } = { token: r.token, deviceId: r.device.id, ...(o.pin === false ? {} : { fp: home.fp }) };
  const store = kv();
  const memo = memoStore(store);
  if (o.memo) memo.set(o.memo);
  const d = { rec, memo, gone: [] as string[], statuses: [] as ConnStatus[], welcomes: 0, conn: undefined as unknown as Connection, watch: undefined as unknown as ReturnType<typeof createLinkWatch> };
  d.watch = createLinkWatch({
    deps: () => (rec.token ? { base: proxy.base, token: rec.token, fp: rec.fp, memo } : undefined),
    me: async () => {
      try {
        return (await fetch(new URL("api/me", proxy.base), { headers: rec.token ? { authorization: `Bearer ${rec.token}` } : {} })).status;
      } catch {
        return 0;
      }
    },
    // main.tsx's gone: the only place the token is cleared.
    gone: (why) => void (d.gone.push(why), (rec.token = undefined), d.conn.stop()),
  });
  d.conn = new Connection(
    proxy.ws,
    () => rec.token,
    () => ({ t: "hello", client: "web" }) as never,
    (f) => void (f.t === "welcome" && d.welcomes++),
    (s) => void d.statuses.push(s),
  );
  d.conn.onRefused = () => void d.watch.refused();
  d.conn.start();
  stops.push(() => d.conn.stop());
  await until(() => d.welcomes === 1);
  return d;
}

test("the web's check of a standing agrees with the Mac's and core's, input for input", async () => {
  const data = dir();
  const id = homeIdentity(data);
  const other = homeIdentity(dir());
  const nonce = "n0nce-n0nce-n0nce-n0nce";
  for (const s of ["live", "revoked", "unknown"] as const) {
    const p = id.attest(s, "0123456789", nonce);
    expect(await checkStandingWeb(p, nonce, id.fp)).toBe(s);
    expect(checkStanding(p, nonce, id.fp)).toBe(s);
    // Another nonce, another pinned key, another home's signature, a changed word: nothing.
    for (const [q, n, fp] of [
      [p, "another-nonce-another", id.fp],
      [p, nonce, other.fp],
      [other.attest(s, "0123456789", nonce), nonce, id.fp],
      [{ ...p, standing: s === "revoked" ? "live" : "revoked" }, nonce, id.fp],
      [{ ...p, device: "9876543210" }, nonce, id.fp],
      [p, nonce, ""],
    ] as const) {
      expect(await checkStandingWeb(q, n, fp)).toBeUndefined();
      expect(checkStanding(q, n, fp || "x")).toBeUndefined();
    }
  }
  expect(await checkStandingWeb({ error: "revoked" }, nonce, id.fp)).toBeUndefined();
});

test("a home restart mid-session: the proxy's 502s keep the token and the screen, and it reconnects by itself", async () => {
  const home = fakeHome();
  const proxy = fakeProxy(home);
  const d = await device(home, proxy);
  home.down();
  await until(() => d.conn.status === "offline");
  expect(d.conn.downSince).toBeGreaterThan(0);
  expect(linkState(d.conn.status, d.conn.downSince, Date.now())).toBe("back");
  expect(linkState(d.conn.status, d.conn.downSince, d.conn.downSince + LONG_OUTAGE_MS)).toBe("lost");
  await Bun.sleep(700); // a few refused tries, each asking /api/me through the proxy (502)
  home.upAgain();
  await until(() => d.welcomes === 2);
  expect(d.conn.status).toBe("connected");
  expect(d.conn.downSince).toBe(0);
  expect(d.gone).toEqual([]);
  expect(d.rec.token).toBeTruthy();
});

test("a proxy's 502 on everything keeps the pairing", async () => {
  const home = fakeHome();
  const proxy = fakeProxy(home);
  const d = await device(home, proxy);
  proxy.mode = "502";
  d.conn.retryNow(); // nothing open to redial: a no-op while the socket is up
  await d.watch.unauthorized(true);
  await d.watch.refused(true);
  expect(d.gone).toEqual([]);
  expect(d.rec.token).toBeTruthy();
});

test("a 401 with the standing reachable (live) or unreachable (502) keeps the pairing", async () => {
  const home = fakeHome();
  const proxy = fakeProxy(home);
  const d = await device(home, proxy);
  proxy.mode = "401"; // the proxy says 401 to the socket and /api/me; the standing passes to the home
  expect(await d.watch.refused(true)).toMatchObject({ kind: "keep", answer: "live" });
  proxy.mode = "401-standing-down";
  expect(await d.watch.unauthorized(true)).toMatchObject({ kind: "keep", answer: "unreachable" });
  expect(d.gone).toEqual([]);
  expect(d.rec.token).toBeTruthy();
  proxy.mode = "pass";
});

test("offline, then online: the socket redials at once instead of waiting out its backoff", async () => {
  const home = fakeHome();
  const proxy = fakeProxy(home);
  const d = await device(home, proxy);
  home.down();
  await until(() => d.conn.status === "offline");
  await Bun.sleep(2500); // the backoff has grown past a second
  home.upAgain();
  const wait = d.conn.nextAt - Date.now();
  const t0 = Date.now();
  dispatchEvent(new Event("online"));
  await until(() => d.welcomes === 2, 3000);
  if (wait > 400) expect(Date.now() - t0).toBeLessThan(wait);
  // The apps' resume event does the same.
  home.down();
  await until(() => d.conn.status === "offline");
  await Bun.sleep(1200);
  home.upAgain();
  dispatchEvent(new Event("ducterresume"));
  await until(() => d.welcomes === 3, 3000);
  expect(d.gone).toEqual([]);
});

test("a forged revoke (another key, or a bad signature) never ends the pairing; nor does one with nothing pinned", async () => {
  const home = fakeHome();
  const proxy = fakeProxy(home);
  const d = await device(home, proxy);
  proxy.mode = "forge-key";
  expect(await d.watch.unauthorized(true)).toMatchObject({ kind: "keep", answer: "forged" });
  proxy.mode = "forge-unsigned";
  expect(await d.watch.unauthorized(true)).toMatchObject({ kind: "keep", answer: "forged" });
  // A real revoke the device can't check (nothing pinned) is not acted on either.
  proxy.mode = "pass";
  const loose = await device(home, proxy, { pin: false });
  home.devices.revoke(loose.rec.deviceId);
  expect(await loose.watch.unauthorized(true)).toMatchObject({ kind: "keep", answer: "forged" });
  expect([...d.gone, ...loose.gone]).toEqual([]);
  expect(d.rec.token).toBeTruthy();
  expect(loose.rec.token).toBeTruthy();
});

test("a true revoke: the refused socket asks, the home signs revoked, and only then is the token cleared", async () => {
  const home = fakeHome();
  const proxy = fakeProxy(home);
  const d = await device(home, proxy);
  home.devices.revoke(d.rec.deviceId);
  // The home drops the live socket (as `ducter devices` revoking does); the next dial is refused.
  d.conn.stop();
  d.conn.start();
  await until(() => d.gone.length === 1);
  expect(d.gone).toEqual(["revoked"]);
  expect(d.rec.token).toBeUndefined();
  // A device the home no longer knows (the same home, its devices reset): unknown, in its own words.
  const e = await device(home, proxy);
  const fresh = dir();
  copyFileSync(join(home.data, HOME_KEY_FILE), join(fresh, HOME_KEY_FILE));
  const reset = fakeHome(fresh);
  expect(reset.fp).toBe(home.fp);
  const resetProxy = fakeProxy(reset);
  const w = createLinkWatch({ deps: () => ({ base: resetProxy.base, token: e.rec.token!, fp: e.rec.fp, memo: e.memo }), me: async () => 401, gone: (why) => void e.gone.push(why) });
  await w.refused(true);
  expect(e.gone).toEqual(["unknown"]);
});

test("an old home (no standing): a 401 ends the pairing only after OLD_HOME_TRIES over OLD_HOME_WINDOW_MS, never once it has answered a standing", async () => {
  const absent: typeof fetch = (async () => new Response("unauthorized", { status: 401 })) as never;
  const memo = memoStore(kv());
  let now = 1_000_000;
  const d = { base: new URL("http://hel.example/"), token: "dvc.0123456789.x", fp: "f", memo, fetch: absent, now: () => now };
  for (let i = 1; i < OLD_HOME_TRIES; i++) {
    expect((await judge(d)).kind).toBe("keep");
    now += OLD_HOME_WINDOW_MS; // even far apart: not enough tries yet
  }
  expect(memo.get().strikes).toBe(OLD_HOME_TRIES - 1);
  expect(await judge(d)).toMatchObject({ kind: "revoked", answer: "old-home" });
  // Many tries in a short while are not enough.
  const quick = memoStore(kv());
  now = 0;
  for (let i = 0; i < OLD_HOME_TRIES * 3; i++) expect((await judge({ ...d, memo: quick, now: () => (now += 1000) })).kind).toBe("keep");
  // A home that has answered a standing is never taken at a bare 401 (a proxy in front of it).
  const known = memoStore(kv());
  known.set({ standing: true });
  now = 0;
  for (let i = 0; i < OLD_HOME_TRIES * 2; i++) expect((await judge({ ...d, memo: known, now: () => (now += OLD_HOME_WINDOW_MS) })).kind).toBe("keep");
  // An unreachable home between strikes is no strike; a welcome ends the run.
  expect(await askStandingWeb("http://127.0.0.1:9/", "t", "f", { timeoutMs: 500 })).toBe("unreachable");
});

test("an old home over a real socket: a revoked device keeps its pairing on the first 401s", async () => {
  const home = fakeHome(dir(), { old: true });
  const proxy = fakeProxy(home);
  const d = await device(home, proxy);
  home.devices.revoke(d.rec.deviceId);
  expect(await d.watch.unauthorized(true)).toMatchObject({ kind: "keep", answer: "absent" });
  expect(d.memo.get().strikes).toBe(1);
  expect(d.gone).toEqual([]);
});

test("retrying: at most 5 s apart at first, 15 s after a minute down, with ±20% jitter", () => {
  expect(backoff(0, 0, () => 0.5)).toBe(500);
  expect(backoff(9, 30_000, () => 0.5)).toBe(5000);
  expect(backoff(9, 61_000, () => 0.5)).toBe(15_000);
  expect(backoff(9, 30_000, () => 0)).toBe(4000);
  expect(backoff(9, 30_000, () => 1)).toBe(6000);
});

test("the page clears the token in one place only: the watch's gone, on the home's word", () => {
  const main = readFileSync(join(import.meta.dir, "../src/main.tsx"), "utf8");
  expect(main.match(/storage\.clear\(\)/g)?.length).toBe(1);
  const gone = main.split("gone: async (why) =>")[1]!.split("});")[0]!;
  expect(gone).toContain("storage.clear()");
  // A 401 from /api/me asks the home; it never clears the token itself.
  const me = main.split('void api.call<Me>("api/me").then')[1]!.split("A.me = r.data")[0]!;
  expect(me).toContain("refused(true)");
  expect(me).not.toContain("storage.clear");
});
