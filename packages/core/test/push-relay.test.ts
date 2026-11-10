// The home's side of the notification relay (D159): sealing with the phone's key (the shared
// vector the iPhone app also opens, apps/ios/scripts/check-push-vector.sh), the relay client,
// which way a push goes, and the whole path through core with a fake relay. No network.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAppPushSender, createApnsSender, type ApnsConfig, type ApnsRequest, type ApnsSender } from "../src/apns.ts";
import { startCore } from "../src/core.ts";
import { decisionMessage, testMessage, type PushSub } from "../src/push.ts";
import { collapseId, createRelayClient, isDeviceKey, isRelayHandle, MAX_DEVICE_PLAINTEXT, decryptForDevice, relayUrl, devicePlaintext, encryptForDevice } from "../src/push-relay.ts";
import { tempDir } from "./helpers.ts";

const stops: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of stops.splice(0).reverse()) await f();
});

const vector = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/push-vector.json"), "utf8")) as Record<string, string>;
const KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const HANDLE = "h1." + "x".repeat(120);
const TOKEN = "c".repeat(64);
const sub = (o: Partial<NonNullable<PushSub["apns"]>> = {}): PushSub => ({
  endpoint: `apns:${TOKEN}`,
  keys: { p256dh: "", auth: "" },
  deviceId: "phone",
  locale: "zh",
  platform: "ios",
  createdAt: "",
  apns: { env: "production", topic: "co.nowledge.ducter.ios", relay: HANDLE, key: KEY, ...o },
});
const decision = { decisionId: "d1", taskId: "t1", question: "要 rebase 吗？", goLabel: "rebase", defaultOption: "go" as const, reversible: true };
const dec = new TextDecoder();

type Call = { url: string; body: any };
function fakeRelay(reply: (c: Call) => Response | Promise<Response> = () => Response.json({ ok: true })) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const c = { url, body: JSON.parse(String(init.body)) };
    calls.push(c);
    return reply(c);
  };
  return { calls, fetcher };
}

describe("sealing for the phone", () => {
  test("the shared vector: same bytes as the app expects; it opens; the collapse id matches", async () => {
    const nonce = new Uint8Array(Buffer.from(vector.nonce!, "base64"));
    expect(await encryptForDevice(vector.key!, new TextEncoder().encode(vector.plaintext!), nonce)).toBe(vector.sealed!);
    expect(dec.decode(await decryptForDevice(vector.key!, vector.sealed!))).toBe(vector.plaintext!);
    expect(JSON.parse(dec.decode(await decryptForDevice(vector.key!, vector.padded!)))).toEqual(JSON.parse(vector.plaintext!));
    expect(await collapseId(vector.key!, vector.collapseTag!)).toBe(vector.collapse!);
    // Another phone's key, or a changed byte, opens nothing.
    await expect(decryptForDevice(KEY, vector.sealed!)).rejects.toThrow();
  });

  test("padded to 256-byte steps, capped, and redacted like Web Push", async () => {
    const short = devicePlaintext(testMessage({ persona: "Ducter", locale: "zh" }));
    expect(short.length % 256).toBe(0);
    const long = devicePlaintext({ title: "长".repeat(400), body: "很长的问题".repeat(2000), tag: "d:x", url: "app#d=x", decisionId: "x" });
    expect(long.length).toBeLessThanOrEqual(MAX_DEVICE_PLAINTEXT);
    const m = JSON.parse(dec.decode(long));
    expect(m.body.endsWith("…")).toBe(true);
    // Sealed and encoded, it fits the relay's limit (3400 characters) and APNs' 4 KB.
    expect((await encryptForDevice(KEY, long)).length).toBeLessThanOrEqual(3400);
    const key = devicePlaintext({ title: "t", body: "use nmem_ct_8fK2pQx7Lm4vRz9TbW3y", tag: "t", url: "app" });
    expect(dec.decode(key)).not.toContain("8fK2pQx7");
  });

  test("what a phone may send: a 32-byte key, a relay handle", () => {
    expect(isDeviceKey(KEY)).toBe(true);
    expect(isDeviceKey(Buffer.from(new Uint8Array(16)).toString("base64"))).toBe(false);
    expect(isRelayHandle(HANDLE)).toBe(true);
    expect(isRelayHandle("https://evil.example/")).toBe(false);
    expect(relayUrl({})).toBe("https://ducter.ai/api/push");
    expect(relayUrl({ DUCTER_PUSH_RELAY: "off" })).toBeUndefined();
    expect(relayUrl({ DUCTER_PUSH_RELAY: "https://push.example.org/api/push/" })).toBe("https://push.example.org/api/push");
    expect(relayUrl({ DUCTER_PUSH_RELAY: "http://push.example.org" })).toBe("https://ducter.ai/api/push");
  });
});

describe("the relay client and the way out", () => {
  test("the relay gets the handle, the seal, an opaque collapse id and the category: never the words", async () => {
    const r = fakeRelay();
    const client = createRelayClient("https://relay.test/api/push", r.fetcher);
    const msg = decisionMessage(decision, { persona: "Ducter", task: "修 fix-ci", locale: "zh", platform: "ios", now: 0 });
    expect(await client.send(sub(), msg, "DUCTER_DECISION")).toMatchObject({ status: 200, gone: false });
    const c = r.calls[0]!;
    expect(c.url).toBe("https://relay.test/api/push/send");
    expect(Object.keys(c.body).sort()).toEqual(["category", "collapse", "d", "handle"]);
    expect(c.body.collapse).toBe(await collapseId(KEY, "d:d1"));
    expect(JSON.stringify(c.body)).not.toContain("rebase");
    expect(JSON.stringify(c.body)).not.toContain("d1");
    const opened = JSON.parse(dec.decode(await decryptForDevice(KEY, c.body.d)));
    expect(opened).toMatchObject({ title: "Ducter · 修 fix-ci", decisionId: "d1", url: "app#d=d1" });
    expect(opened.body).toContain("要 rebase 吗？");
  });

  test("410 drops the subscription; an unreachable relay is said plainly and kept", async () => {
    let mode: "gone" | "down" | "ok" = "gone";
    const r = fakeRelay(() => {
      if (mode === "down") throw new Error("ECONNREFUSED");
      return mode === "gone" ? Response.json({ gone: true }, { status: 410 }) : Response.json({ ok: true });
    });
    const client = createRelayClient("https://relay.test/api/push", r.fetcher);
    const msg = testMessage({ persona: "Ducter", locale: "en" });
    expect(await client.send(sub(), msg)).toMatchObject({ status: 410, gone: true });
    mode = "down";
    expect(await client.send(sub(), msg)).toMatchObject({ status: 0, gone: false });
    expect(client.unreachable()).toBe(true);
    mode = "ok";
    await client.send(sub(), msg);
    expect(client.unreachable()).toBe(false);
    // An app from before D159 (no handle, no key) isn't sent through the relay.
    expect(await client.send(sub({ relay: undefined, key: undefined }), msg)).toMatchObject({ status: 0 });
  });

  test("which way: the relay by default; the home's own key first, the relay when Apple refuses that key", async () => {
    const r = fakeRelay();
    const relay = createRelayClient("https://relay.test/api/push", r.fetcher);
    const msg = testMessage({ persona: "Ducter", locale: "en" });
    const viaRelay = createAppPushSender(createApnsSender(undefined), relay);
    expect(viaRelay).toMatchObject({ configured: true, via: "relay" });
    expect(viaRelay.deliverable!(sub())).toBe(true);
    expect(viaRelay.deliverable!(sub({ relay: undefined }))).toBe(false);
    expect((await viaRelay.send(sub(), msg)).status).toBe(200);
    expect(r.calls).toHaveLength(1);

    let status = 200;
    const direct: ApnsSender = { configured: true, send: async (s) => ({ endpoint: s.endpoint, status, gone: false }) };
    const both = createAppPushSender(direct, relay);
    expect(both.via).toBe("key");
    expect((await both.send(sub(), msg)).status).toBe(200);
    expect(r.calls).toHaveLength(1);
    status = 403; // InvalidProviderToken: this home's key isn't the app's team
    expect((await both.send(sub(), msg)).status).toBe(200);
    expect(r.calls).toHaveLength(2);

    const none = createAppPushSender(createApnsSender(undefined), undefined);
    expect(none.configured).toBe(false);
    expect((await none.send(sub(), msg)).status).toBe(0);

    await viaRelay.revoke!(sub());
    expect(r.calls.at(-1)).toEqual({ url: "https://relay.test/api/push/revoke", body: { handle: HANDLE } });
  });

  test("the home's own key seals too: Apple sees the neutral alert", async () => {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
    const config: ApnsConfig = { keyId: "K", teamId: "T", key: `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----` };
    const reqs: ApnsRequest[] = [];
    const s = createApnsSender(config, async (q) => (reqs.push(q), { status: 200, body: "" }));
    await s.send(sub(), decisionMessage(decision, { persona: "Ducter", locale: "zh", platform: "ios", now: 0 }));
    const p = JSON.parse(reqs[0]!.body);
    expect(p.aps).toMatchObject({ "mutable-content": 1, category: "DUCTER_DECISION", alert: { "loc-key": "push.relay.body" } });
    expect(reqs[0]!.body).not.toContain("rebase");
    expect(reqs[0]!.headers["apns-collapse-id"]).toBe(await collapseId(KEY, "d:d1"));
    expect(JSON.parse(dec.decode(await decryptForDevice(KEY, p.d))).decisionId).toBe("d1");
  });
});

describe("through core", () => {
  test("a paired iPhone subscribes with its handle and key; the test push goes sealed through the relay; disconnect revokes", async () => {
    const t = tempDir();
    let down = false;
    const r = fakeRelay(() => {
      if (down) throw new Error("ENOTFOUND");
      return Response.json({ ok: true });
    });
    const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, relayFetch: r.fetcher });
    stops.push(t.cleanup, () => core.stop());
    const base = `http://127.0.0.1:${core.port}`;
    const phone = core.devices.redeem(core.devices.createCode().code, { name: "iPhone", platform: "ios" }) as { token: string; device: { id: string } };
    const H = { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${phone.token}` };
    const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: H, body: JSON.stringify(body) });
    const me = async () => ((await (await fetch(`${base}/api/me`, { headers: H })).json()) as any).push;

    expect(await me()).toMatchObject({ apns: true, apnsVia: "relay" });
    // An app from before the relay: kept, but the home says it won't reach it.
    const old = await post("/api/push/subscribe", { apns: { token: TOKEN, env: "production", topic: "co.nowledge.ducter.ios" }, locale: "zh" });
    expect(((await old.json()) as any).apns).toBe(false);
    expect((await post("/api/push/subscribe", { apns: { token: TOKEN, env: "production", topic: "co.nowledge.ducter.ios", relay: "not a handle", key: KEY } })).status).toBe(400);
    const ok = await post("/api/push/subscribe", { apns: { token: TOKEN, env: "production", topic: "co.nowledge.ducter.ios", relay: HANDLE, key: KEY }, locale: "zh" });
    expect(((await ok.json()) as any).apns).toBe(true);

    expect((await post("/api/push/test", {})).status).toBe(200);
    const send = r.calls.find((c) => c.url.endsWith("/send"))!;
    expect(send.url).toBe("https://ducter.ai/api/push/send");
    expect(JSON.parse(dec.decode(await decryptForDevice(KEY, send.body.d))).body).toBe("通知通了。需要你的时候，我会这样叫你。");

    down = true;
    const failed = await post("/api/push/test", {});
    expect(failed.status).toBe(502);
    expect(((await failed.json()) as any).relay).toBe("unreachable");
    expect(await me()).toMatchObject({ relay: "unreachable" });
    down = false;

    // 断开 / Disconnect (D155): the phone's subscription goes, and its handle is revoked at once.
    const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`);
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    stops.push(() => ws.close());
    const result = new Promise<any>((res) => (ws.onmessage = (m) => JSON.parse(String(m.data)).t === "disconnect_result" && res(JSON.parse(String(m.data)))));
    ws.send(JSON.stringify({ t: "hello" }));
    ws.send(JSON.stringify({ t: "disconnect_device", device: phone.device.id }));
    expect(await result).toMatchObject({ ok: true });
    for (let i = 0; i < 50 && !r.calls.some((c) => c.url.endsWith("/revoke")); i++) await Bun.sleep(10);
    expect(r.calls.find((c) => c.url.endsWith("/revoke"))?.body).toEqual({ handle: HANDLE });
    expect(core.push.subs()).toHaveLength(0);
  });
});
