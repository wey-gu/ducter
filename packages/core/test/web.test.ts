import { afterEach, describe, expect, test } from "bun:test";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

const stops: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of stops.splice(0).reverse()) await f();
});

function boot(o: Parameters<typeof startCore>[0] = {}): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, ...o });
  stops.push(t.cleanup, () => core.stop());
  return core;
}
// A reverse proxy on the same box (Caddy): loopback peer, but X-Forwarded-For says it's relayed.
const REMOTE = { "x-forwarded-for": "203.0.113.9" };

/** A browser-style socket: the token rides as a subprotocol, never as a header. */
function wsOpen(url: string, protocols: string[] | undefined, headers: Record<string, string> = {}): Promise<{ ok: boolean; ws?: WebSocket; welcome?: any }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { protocols, headers } as any);
    const timer = setTimeout(() => resolve({ ok: false }), 2000);
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello" }));
    ws.onmessage = (m) => {
      const f = JSON.parse(String(m.data));
      if (f.t === "welcome") clearTimeout(timer), resolve({ ok: true, ws, welcome: f });
    };
    ws.onerror = () => (clearTimeout(timer), resolve({ ok: false }));
  });
}

describe("the phone/web client", () => {
  test("the app and the pairing landing are public; the code never reaches the server", async () => {
    const core = boot();
    const base = `http://127.0.0.1:${core.port}`;
    for (const path of ["/app", "/pair"]) {
      const r = await fetch(base + path, { headers: REMOTE });
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/html");
      expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(await r.text()).toContain('src="app/app.js"');
    }
    for (const [path, type] of [
      ["/app/app.js", "javascript"],
      ["/app/app.css", "css"],
      ["/sw.js", "javascript"],
      ["/app/art/needsyou.png", "image/png"],
      ["/app/manifest.webmanifest", "manifest"],
    ]) {
      const r = await fetch(base + path!, { headers: REMOTE });
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain(type!);
    }
    expect((await fetch(`${base}/app/../devices.db`, { headers: REMOTE })).status).not.toBe(200);
    expect((await fetch(`${base}/app/nope.js`, { headers: REMOTE })).status).toBe(404);
    const root = await fetch(`${base}/`, { headers: REMOTE, redirect: "manual" });
    expect(root.status).toBe(302);
  });

  test("remote: a browser socket carries its device token as a subprotocol and gets \"ducter\" back", async () => {
    const core = boot();
    // The good socket first, and no fetch before it: Bun 1.3's own WebSocket client stumbles after
    // a keep-alive fetch or a refused upgrade to the same server (curl and Chromium don't).
    const r = core.devices.redeem(core.devices.createCode().code, { name: "iPhone · Safari", platform: "ios" }) as { token: string; device: { id: string } };
    const ws = await wsOpen(core.url, ["ducter", r.token], { ...REMOTE, origin: "https://ducter.example.com" });
    expect(ws.ok).toBe(true);
    ws.ws!.close();
    // A browser drops the socket unless exactly one of its protocols comes back. (Checked on the
    // raw handshake: Bun's client garbles ws.protocol once other tests ran in the process.)
    const hs = await fetch(core.url.replace("ws:", "http:"), {
      headers: { ...REMOTE, upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-protocol": `ducter, ${r.token}` },
    });
    expect(hs.status).toBe(101);
    expect(hs.headers.get("sec-websocket-protocol")).toBe("ducter");
    expect((await wsOpen(core.url, undefined, REMOTE)).ok).toBe(false);
    expect((await wsOpen(core.url, ["ducter", "dvc.0123456789.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], REMOTE)).ok).toBe(false);
    core.devices.revoke(r.device.id);
    expect((await wsOpen(core.url, ["ducter", r.token], REMOTE)).ok).toBe(false);
  });

  test("remote: pair at /pair; the API and the socket take that token; nothing without it", async () => {
    const core = boot();
    const base = `http://127.0.0.1:${core.port}`;
    const upgrade = (token?: string) =>
      fetch(`${base}/ws`, {
        headers: { ...REMOTE, upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", ...(token ? { "sec-websocket-protocol": `ducter, ${token}` } : {}) },
      }).then((r) => r.status);
    expect((await fetch(`${base}/api/me`, { headers: REMOTE })).status).toBe(401);
    expect(await upgrade()).toBe(401);

    const { code } = core.devices.createCode();
    const paired: any = await (await fetch(`${base}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code, name: "iPhone · Safari", platform: "ios" }) })).json();
    expect(paired.token).toMatch(/^dvc\./);

    const me = await fetch(`${base}/api/me`, { headers: { ...REMOTE, authorization: `Bearer ${paired.token}` } });
    expect(me.status).toBe(200);
    const body: any = await me.json();
    expect(body).toMatchObject({ via: "device", deviceName: "iPhone · Safari", personaName: "Ducter" });
    expect(body.push.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(await upgrade(paired.token)).toBe(101);

    core.devices.revoke(paired.deviceId);
    expect(await upgrade(paired.token)).toBe(401);
    expect((await fetch(`${base}/api/me`, { headers: { ...REMOTE, authorization: `Bearer ${paired.token}` } })).status).toBe(401);
  });

  test("local stays token-free, and a cross-site page can't POST to the local API", async () => {
    const core = boot();
    const base = `http://127.0.0.1:${core.port}`;
    expect(await (await fetch(`${base}/api/me`)).json()).toMatchObject({ via: "local" });
    const evil = await fetch(`${base}/api/push/settings`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ done: true }) });
    expect(evil.status).toBe(403);
    const ok = await fetch(`${base}/api/push/settings`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ done: true }) });
    expect(await ok.json()).toMatchObject({ done: true });
  });

  test("subscribe brings the phone's quiet hours; a test push goes to this device; Go from a notification decides", async () => {
    const sent: string[] = [];
    const core = boot({ pushFetch: async (url) => (sent.push(url), new Response(null, { status: 201 })) });
    const base = `http://127.0.0.1:${core.port}`;
    const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", kp.publicKey)).toString("base64url");
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh, auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url") } };
    const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    expect((await post("/api/push/subscribe", { subscription: { endpoint: "http://insecure" } })).status).toBe(400);
    // Not a push service: the main would POST wherever a subscription points.
    const ssrf = await post("/api/push/subscribe", { subscription: { ...subscription, endpoint: "https://169.254.169.254/latest" } });
    expect([ssrf.status, (await ssrf.json()).error]).toEqual([400, "not a known push service"]);
    expect(core.push.subs()).toHaveLength(0);
    const r: any = await (await post("/api/push/subscribe", { subscription, locale: "zh", platform: "android", quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" } })).json();
    expect(r.settings.quiet).toEqual({ start: "23:00", end: "08:00", tz: "Asia/Shanghai" });
    expect((await post("/api/push/test", {})).status).toBe(200);
    expect(sent).toEqual(["https://fcm.googleapis.com/fcm/send/abc"]);

    core.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d_x", taskId: "t1", question: "Rebase?", goLabel: "Rebase", defaultOption: "go", reversible: true } });
    expect((await post("/api/decide", { decisionId: "d_x", option: "go" })).status).toBe(200);
    expect(core.decisions.isPending("d_x")).toBe(false);
    expect((await post("/api/decide", { decisionId: "d_x", option: "hold" })).status).toBe(409);
  });
});
