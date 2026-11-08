import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { APNS_CATEGORY, apnsJwt, apnsPayload, createApnsSender, loadApnsConfig, type ApnsConfig, type ApnsRequest } from "../src/apns.ts";
import { startCore } from "../src/core.ts";
import { decisionMessage, type PushSub } from "../src/push.ts";
import { tempDir } from "./helpers.ts";

const stops: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of stops.splice(0).reverse()) await f();
});

async function p8(): Promise<{ config: ApnsConfig; publicKey: CryptoKey }> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { config: { keyId: "ABC123DEFG", teamId: "JMU55RJW2K", key: pem }, publicKey: kp.publicKey };
}

const TOKEN = "a".repeat(64);
const sub = (o: Partial<PushSub> = {}): PushSub => ({
  endpoint: `apns:${TOKEN}`,
  keys: { p256dh: "", auth: "" },
  deviceId: "phone",
  locale: "zh",
  platform: "ios",
  createdAt: "",
  apns: { env: "sandbox", topic: "dev.ducter.phone" },
  ...o,
});
const decision = { decisionId: "d1", taskId: "t1", question: "要 rebase 吗？", goLabel: "rebase", defaultOption: "go" as const, reversible: true };

describe("APNs (the iPhone app)", () => {
  test("the provider token is an ES256 JWT Apple can verify with the key", async () => {
    const { config, publicKey } = await p8();
    const jwt = await apnsJwt(config, Date.parse("2026-11-09T00:00:00Z"));
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(c!, "base64url").toString())).toEqual({ iss: "JMU55RJW2K", iat: Date.parse("2026-11-09T00:00:00Z") / 1000 });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, Buffer.from(s!, "base64url"), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  test("a decision carries the Go / Hold category and where a tap goes", () => {
    const msg = decisionMessage(decision, { persona: "Ducter", task: "修 fix-ci", locale: "zh", platform: "ios", now: 0 });
    const p = apnsPayload(msg) as any;
    expect(p.aps.category).toBe(APNS_CATEGORY);
    expect(p.aps.alert.title).toBe("Ducter · 修 fix-ci");
    expect(p).toMatchObject({ url: "app#d=d1", decisionId: "d1" });
  });

  test("sends over HTTP/2 to the sandbox with the topic; a dead token is dropped; no key sends nothing", async () => {
    const { config } = await p8();
    const reqs: ApnsRequest[] = [];
    let reply = { status: 200, body: "" };
    const s = createApnsSender(config, async (r) => (reqs.push(r), reply));
    const msg = decisionMessage(decision, { persona: "Ducter", locale: "en", platform: "ios", now: 0 });
    expect(await s.send(sub(), msg)).toMatchObject({ status: 200, gone: false });
    expect(reqs[0]).toMatchObject({ host: "api.sandbox.push.apple.com", path: `/3/device/${TOKEN}` });
    expect(reqs[0]!.headers).toMatchObject({ "apns-topic": "dev.ducter.phone", "apns-push-type": "alert", "apns-collapse-id": "d:d1" });
    expect(reqs[0]!.headers.authorization).toStartWith("bearer ey");

    reply = { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) };
    expect((await s.send(sub({ apns: { env: "production", topic: "dev.ducter.phone" } }), msg)).gone).toBe(true);
    expect(reqs[1]!.host).toBe("api.push.apple.com");

    expect((await s.send(sub({ endpoint: "apns:nothex" }), msg)).gone).toBe(true);
    const none = createApnsSender(undefined, async () => {
      throw new Error("must not be called");
    });
    expect(await none.send(sub(), msg)).toMatchObject({ status: 0, gone: false });
  });

  test("config from <dataDir>/apns.json", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const { config } = await p8();
    expect(loadApnsConfig(t.dir, {})).toBeUndefined();
    writeFileSync(join(t.dir, "AuthKey.p8"), config.key);
    writeFileSync(join(t.dir, "apns.json"), JSON.stringify({ keyId: "ABC123DEFG", teamId: "JMU55RJW2K", keyFile: "AuthKey.p8" }));
    expect(loadApnsConfig(t.dir, {})).toMatchObject({ keyId: "ABC123DEFG", teamId: "JMU55RJW2K" });
  });

  test("the app subscribes with its device token; test pushes and decisions reach it", async () => {
    const t = tempDir();
    const sent: { sub: PushSub; title: string }[] = [];
    const core = startCore({
      dataDir: t.dir,
      port: 0,
      batchMs: 5,
      apns: { configured: true, send: async (s, m) => (sent.push({ sub: s, title: m.title }), { endpoint: s.endpoint, status: 200, gone: false }) },
    });
    stops.push(t.cleanup, () => core.stop());
    const base = `http://127.0.0.1:${core.port}`;
    const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect(((await (await fetch(`${base}/api/me`)).json()) as any).push.apns).toBe(true);
    expect((await post("/api/push/subscribe", { apns: { token: "zz", env: "sandbox", topic: "dev.ducter.phone" } })).status).toBe(400);
    expect((await post("/api/push/subscribe", { apns: { token: TOKEN, env: "staging", topic: "dev.ducter.phone" } })).status).toBe(400);
    const r = await post("/api/push/subscribe", { apns: { token: TOKEN.toUpperCase(), env: "sandbox", topic: "dev.ducter.phone" }, locale: "zh" });
    expect(r.status).toBe(200);
    expect(core.push.subs()).toMatchObject([{ endpoint: `apns:${TOKEN}`, platform: "ios", locale: "zh", apns: { env: "sandbox", topic: "dev.ducter.phone" } }]);
    expect((await post("/api/push/test", {})).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect((await post("/api/push/unsubscribe", { endpoint: `apns:${TOKEN}` })).status).toBe(200);
    expect(core.push.subs()).toHaveLength(0);
  });
});
