// The notification relay (D159, apps/site/api/push/[op].ts) with a fake APNs and a memory store:
// what it forwards (never the words), handles it alone can open, revocation, Apple saying a
// token is dead, rate limits, and the store's REST calls. No network.
import { describe, expect, test } from "bun:test";
import relayEntry, { apnsJwt, createRelay, kvStore, LIMITS, memoryStore, readHandle, type ApnsRequest } from "../api/push/[op].ts";

const TOKEN = "ab".repeat(32);
const TOPIC = "co.nowledge.ducter.ios";

async function setup(o: { reply?: () => { status: number; body: string }; topics?: string } = {}) {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  const seal = crypto.getRandomValues(new Uint8Array(32));
  const env = {
    APNS_KEY_ID: "KEY1234567",
    APNS_TEAM_ID: "JMU55RJW2K",
    APNS_KEY_P8: Buffer.from(pem).toString("base64"),
    RELAY_HANDLE_KEY: Buffer.from(seal).toString("base64"),
    ...(o.topics ? { RELAY_TOPICS: o.topics } : {}),
  };
  const reqs: ApnsRequest[] = [];
  let now = Date.parse("2026-11-10T00:00:00Z");
  const store = memoryStore(() => now);
  const relay = createRelay({ env, store, now: () => now, transport: async (r) => (reqs.push(r), o.reply?.() ?? { status: 200, body: "" }) });
  const call = async (op: string, body?: unknown, ip = "203.0.113.7") => {
    const r = await relay(new Request(`https://ducter.ai/api/push/${op}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));
    return { status: r.status, body: (await r.json()) as any };
  };
  return { call, reqs, seal, env, publicKey: kp.publicKey, store, advance: (ms: number) => (now += ms) };
}

const sealedBlob = "A".repeat(400);

describe("the notification relay", () => {
  test("not configured: health says so and nothing is sent", async () => {
    const relay = createRelay({ env: {}, store: memoryStore(), transport: async () => ({ status: 200, body: "" }) });
    const h = await relay(new Request("https://ducter.ai/api/push/health"));
    expect(await h.json()).toEqual({ ok: false, apns: false, store: "memory" });
    const s = await relay(new Request("https://ducter.ai/api/push/register", { method: "POST", body: JSON.stringify({ token: TOKEN, topic: TOPIC, env: "production" }) }));
    expect(s.status).toBe(503);
  });

  test("register gives an opaque handle; only the relay opens it, and it holds no words", async () => {
    const t = await setup();
    expect((await t.call("health")).body).toEqual({ ok: true, apns: true, store: "memory" });
    expect((await t.call("register", { token: "nothex", topic: TOPIC, env: "production" })).status).toBe(400);
    expect((await t.call("register", { token: TOKEN, topic: "com.someone.else", env: "production" })).status).toBe(403);
    const r = await t.call("register", { token: TOKEN.toUpperCase(), topic: TOPIC, env: "production" });
    expect(r.status).toBe(200);
    const handle = r.body.handle as string;
    expect(handle).toStartWith("h1.");
    expect(handle).not.toContain(TOKEN);
    expect(await readHandle(t.seal, handle)).toMatchObject({ t: TOKEN, p: TOPIC, e: "production" });
    expect(await readHandle(crypto.getRandomValues(new Uint8Array(32)), handle)).toBeUndefined();
    // A changed byte is refused (GCM).
    const bad = handle.slice(0, 40) + (handle[40] === "A" ? "B" : "A") + handle.slice(41);
    expect((await t.call("send", { handle: bad, d: sealedBlob })).status).toBe(400);
  });

  test("send forwards the sealed bytes with a neutral, localized alert; Apple verifies the token", async () => {
    const t = await setup();
    const { handle } = (await t.call("register", { token: TOKEN, topic: TOPIC, env: "production" })).body;
    const r = await t.call("send", { handle, d: sealedBlob, collapse: "rIa9z1jFZXL9GtyJXva-dA", category: "DUCTER_DECISION" });
    expect(r).toEqual({ status: 200, body: { ok: true } });
    const req = t.reqs[0]!;
    expect(req).toMatchObject({ host: "api.push.apple.com", path: `/3/device/${TOKEN}` });
    expect(req.headers).toMatchObject({ "apns-topic": TOPIC, "apns-push-type": "alert", "apns-collapse-id": "rIa9z1jFZXL9GtyJXva-dA" });
    expect(JSON.parse(req.body)).toEqual({
      aps: { alert: { "title-loc-key": "push.relay.title", "loc-key": "push.relay.body" }, "mutable-content": 1, sound: "default", "thread-id": "ducter", category: "DUCTER_DECISION", "interruption-level": "active" },
      d: sealedBlob,
    });
    const [h, c, s] = req.headers.authorization!.slice("bearer ".length).split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(c!, "base64url").toString()).iss).toBe("JMU55RJW2K");
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, t.publicKey, Buffer.from(s!, "base64url"), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
    // Unknown categories and odd collapse ids are dropped, not forwarded.
    await t.call("send", { handle, d: sealedBlob, collapse: "d:has a space", category: "SOMETHING" });
    expect(t.reqs[1]!.headers["apns-collapse-id"]).toBeUndefined();
    expect(JSON.parse(t.reqs[1]!.body).aps.category).toBeUndefined();
    // Plain text instead of a seal is refused.
    expect((await t.call("send", { handle, d: "Hello, this is not sealed at all, not base64url!" })).status).toBe(400);
  });

  test("revoke: the handle stops working; Apple's Unregistered revokes it too", async () => {
    let reply = { status: 200, body: "" };
    const t = await setup({ reply: () => reply });
    const a = (await t.call("register", { token: TOKEN, topic: TOPIC, env: "sandbox" })).body.handle;
    expect((await t.call("revoke", { handle: a })).status).toBe(200);
    expect((await t.call("send", { handle: a, d: sealedBlob })).status).toBe(410);
    expect(t.reqs).toHaveLength(0);

    const b = (await t.call("register", { token: TOKEN, topic: TOPIC, env: "sandbox" })).body.handle;
    reply = { status: 410, body: JSON.stringify({ reason: "Unregistered" }) };
    expect((await t.call("send", { handle: b, d: sealedBlob })).status).toBe(410);
    expect(t.reqs[0]!.host).toBe("api.sandbox.push.apple.com");
    reply = { status: 200, body: "" };
    expect((await t.call("send", { handle: b, d: sealedBlob })).status).toBe(410);
    expect(t.reqs).toHaveLength(1);
  });

  test("Apple refusing (not a dead token) is a 502 with Apple's reason; a removed topic is gone", async () => {
    const t = await setup({ reply: () => ({ status: 429, body: JSON.stringify({ reason: "TooManyRequests" }) }) });
    const h = (await t.call("register", { token: TOKEN, topic: TOPIC, env: "production" })).body.handle;
    expect(await t.call("send", { handle: h, d: sealedBlob })).toEqual({ status: 502, body: { error: "apple refused", status: 429, reason: "TooManyRequests" } });
  });

  test("rate limits: per handle per hour, and per caller address", async () => {
    const t = await setup();
    const h = (await t.call("register", { token: TOKEN, topic: TOPIC, env: "production" })).body.handle;
    for (let i = 0; i < LIMITS.handleHour; i++) expect((await t.call("send", { handle: h, d: sealedBlob })).status).toBe(200);
    expect((await t.call("send", { handle: h, d: sealedBlob })).status).toBe(429);
    t.advance(3601_000);
    expect((await t.call("send", { handle: h, d: sealedBlob })).status).toBe(200);
    for (let i = 0; i < LIMITS.registerHour; i++) await t.call("register", { token: TOKEN, topic: TOPIC, env: "production" }, "198.51.100.1");
    expect((await t.call("register", { token: TOKEN, topic: TOPIC, env: "production" }, "198.51.100.1")).status).toBe(429);
    expect((await t.call("register", { token: TOKEN, topic: TOPIC, env: "production" }, "198.51.100.2")).status).toBe(200);
  });

  test("the store keeps no device token and no raw address", async () => {
    const keys: string[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const cmds = JSON.parse(String(init.body)) as (string | number)[][];
      for (const c of cmds) keys.push(String(c[1]));
      return Response.json(cmds.map(() => ({ result: 1 })));
    }) as unknown as typeof fetch;
    const store = kvStore("https://kv.example/", "tok", fake);
    expect(await store.incr("rl:x", 60)).toBe(1);
    await store.set("rev:y", "1", 60);
    expect(keys).toEqual(["rl:x", "rl:x", "rev:y"]);

    const t = await setup();
    const h = (await t.call("register", { token: TOKEN, topic: TOPIC, env: "production" })).body.handle;
    await t.call("send", { handle: h, d: sealedBlob });
    const seen: string[] = [];
    const spy = { ...t.store, incr: async (k: string) => (seen.push(k), 1), get: async (k: string) => (seen.push(k), null) };
    const relay2 = createRelay({ env: t.env, store: spy as any, transport: async () => ({ status: 200, body: "" }) });
    const sent = await relay2(new Request("https://ducter.ai/api/push/send", { method: "POST", headers: { "x-forwarded-for": "203.0.113.7" }, body: JSON.stringify({ handle: h, d: sealedBlob }) }));
    expect(sent.status).toBe(200);
    expect(seen.length).toBeGreaterThanOrEqual(3); // address, revoked?, handle counters
    for (const k of seen) {
      expect(k).not.toContain(TOKEN);
      expect(k).not.toContain("203.0.113.7");
    }
  });

  test("the provider token matches the home's (packages/core/src/apns.ts)", async () => {
    const { apnsJwt: homeJwt } = await import("../../../packages/core/src/apns.ts");
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
    const pem = `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`;
    const at = Date.parse("2026-11-10T00:00:00Z");
    const a = (await apnsJwt({ keyId: "K", teamId: "T", pem }, at)).split(".");
    const b = (await homeJwt({ keyId: "K", teamId: "T", key: pem }, at)).split(".");
    expect(a.slice(0, 2)).toEqual(b.slice(0, 2));
  });

  test("the Vercel entry answers health from its env", async () => {
    const r = await relayEntry.fetch(new Request("https://ducter.ai/api/push/health"));
    expect(r.status).toBe(200);
  });
});
