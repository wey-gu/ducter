import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import {
  b64u,
  coalescedMessage,
  createPusher,
  decisionMessage,
  defaultLine,
  encryptPayload,
  fitMessage,
  MAX_SUBS,
  MAX_SUBS_PER_DEVICE,
  sendPush,
  inQuiet,
  isPushEndpoint,
  newVapid,
  openPushStore,
  quietEndsAt,
  vapidAuth,
  type PushSub,
} from "../src/push.ts";
import { tempDir } from "./helpers.ts";

const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((f) => f()));

// ---------- the receiving side of RFC 8291, to check what we send decrypts ----------

async function receiver() {
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { kp, keys: { p256dh: b64u.enc(pub), auth: b64u.enc(auth) }, pub, auth };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, k, n * 8));
}

async function decrypt(body: Uint8Array, r: Awaited<ReturnType<typeof receiver>>): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20]!;
  const asPub = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, r.kp.privateKey, 256));
  const te = new TextEncoder();
  const info = new Uint8Array([...te.encode("WebPush: info\0"), ...r.pub, ...asPub]);
  const ikm = await hkdf(r.auth, shared, info, 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));
  expect(plain.at(-1)).toBe(2); // the last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe("push endpoints", () => {
  test("only the browsers' push services", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGx",
      "https://wns2-db5p.notify.windows.com/w/?token=abc",
    ])
      expect(isPushEndpoint(ok)).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.apple.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "not a url",
    ])
      expect(isPushEndpoint(bad)).toBe(false);
  });
  test("a stored subscription to anywhere else is dropped, never posted to", async () => {
    let posted = false;
    const r = await sendPush({ endpoint: "https://10.0.0.5/x", keys: { p256dh: "x", auth: "y" }, deviceId: "d", locale: "en", platform: "web", createdAt: "" }, coalescedMessage(1, { persona: "D", locale: "en" }), await newVapid(), async () => ((posted = true), new Response(null, { status: 201 })));
    expect(r).toMatchObject({ gone: true, status: 0 });
    expect(posted).toBe(false);
  });
});

describe("web push wire format", () => {
  test("payloads decrypt on the receiving side (RFC 8291, aes128gcm)", async () => {
    const r = await receiver();
    const body = await encryptPayload(new TextEncoder().encode('{"title":"Ducter · 修测试","body":"要 rebase 吗？"}'), r.keys);
    expect(JSON.parse(await decrypt(body, r))).toEqual({ title: "Ducter · 修测试", body: "要 rebase 吗？" });
  });

  test("VAPID: an ES256 JWT for the push service's origin, signed by the key it names", async () => {
    const v = await newVapid();
    const h = await vapidAuth("https://fcm.googleapis.com/fcm/send/abc", v, Date.parse("2026-11-09T00:00:00Z"));
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m).toBeTruthy();
    expect(m[4]).toBe(v.publicKey);
    const claims = JSON.parse(Buffer.from(m[2]!, "base64url").toString());
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.exp).toBe(Date.parse("2026-11-09T00:00:00Z") / 1000 + 12 * 3600);
    expect(claims.sub).toMatch(/^(https:|mailto:)/);
    const pub = await crypto.subtle.importKey("raw", b64u.dec(v.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64u.dec(m[3]!), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  test("keys are made once and kept 0600 in the data dir", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const a = await openPushStore(t.dir).vapid();
    const b = await openPushStore(t.dir).vapid();
    expect(b.publicKey).toBe(a.publicKey);
    const { statSync } = await import("node:fs");
    expect(statSync(`${t.dir}/push.json`).mode & 0o777).toBe(0o600);
  });

  test("a long question still fits one push (≤ 4096 bytes) and decrypts", async () => {
    const r = await receiver();
    const v = await newVapid();
    const d: Bodies["decision"] = { decisionId: "d_long", taskId: "t1", question: "要不要把这个分支变基到主干上？".repeat(200), goLabel: "变基".repeat(100), defaultOption: "go", reversible: false };
    const msg = decisionMessage(d, { persona: "Ducter", task: "修测试".repeat(100), locale: "zh", platform: "android", now: 0 });
    expect(new TextEncoder().encode(JSON.stringify(msg)).length).toBeGreaterThan(4096); // what used to be sent
    let sent: Uint8Array | undefined;
    const res = await sendPush({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: r.keys, deviceId: "local", locale: "zh", platform: "android", createdAt: "" }, msg, v, async (_u, init) => {
      sent = init.body as Uint8Array;
      return new Response(null, { status: 201 });
    });
    expect(res.status).toBe(201);
    expect(sent!.length).toBeLessThanOrEqual(4096);
    const got = JSON.parse(await decrypt(sent!, r));
    expect(got.decisionId).toBe("d_long");
    expect(got.body.startsWith("要不要把这个分支")).toBe(true);
    expect(got.actions).toHaveLength(2);
    // A short one goes out exactly as written.
    expect(JSON.parse(new TextDecoder().decode(fitMessage(coalescedMessage(2, { persona: "Ducter", locale: "en" }))))).toEqual(coalescedMessage(2, { persona: "Ducter", locale: "en" }));
  });

  test("subscriptions are bounded per device and in total; push.json is replaced atomically", () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const s = openPushStore(t.dir);
    const sub = (i: number, deviceId = "dev1"): PushSub => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${deviceId}/${i}`, keys: { p256dh: "x", auth: "y" }, deviceId, locale: "en", platform: "web", createdAt: "" });
    for (let i = 0; i < 100; i++) s.subscribe(sub(i));
    expect(s.subs().map((x) => x.endpoint)).toEqual([95, 96, 97, 98, 99].map((i) => `https://fcm.googleapis.com/fcm/send/dev1/${i}`));
    for (let i = 0; i < 100; i++) s.subscribe(sub(0, `d${i}`));
    expect(s.subs().length).toBe(MAX_SUBS);
    expect(openPushStore(t.dir).subs().length).toBe(MAX_SUBS);
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    expect(existsSync(`${t.dir}/push.json.tmp`)).toBe(false);
    expect(MAX_SUBS_PER_DEVICE).toBe(5);
  });
});

describe("push copy", () => {
  const d: Bodies["decision"] = { decisionId: "d1", taskId: "t1", question: "要 rebase 吗？", goLabel: "rebase", defaultOption: "go", reversible: true, defaultAt: "2026-11-09T00:30:00Z" };
  const now = Date.parse("2026-11-09T00:00:00Z");

  test("quotes the question and the card's default line exactly", () => {
    expect(defaultLine(d, "zh", now)).toBe("你不回的话，30 分钟后我会 rebase，之后也能撤销。");
    expect(defaultLine(d, "en", now)).toBe("If you don't answer, I'll rebase in 30 min. It can be undone.");
    expect(defaultLine({ ...d, reversible: false }, "zh", now)).toBe("这件不会自己动，等你定");
    const m = decisionMessage(d, { persona: "Ducter", task: "修 fix-ci", locale: "zh", platform: "android", now });
    expect(m.title).toBe("Ducter · 修 fix-ci");
    expect(m.body).toBe("要 rebase 吗？ 你不回的话，30 分钟后我会 rebase，之后也能撤销。");
    expect(m.url).toBe("app#d=d1");
  });

  test("iOS gets tap-to-open only (D52 Q11); Android gets Go / Hold", () => {
    expect(decisionMessage(d, { persona: "D", locale: "zh", platform: "ios", now }).actions).toBeUndefined();
    expect(decisionMessage(d, { persona: "D", locale: "zh", platform: "android", now }).actions).toEqual([
      { action: "go", title: "好，rebase" },
      { action: "hold", title: "先等等" },
    ]);
    expect(coalescedMessage(3, { persona: "D", locale: "en", morning: true }).body).toBe("Morning. 3 need you.");
  });
});

describe("quiet hours", () => {
  const q = { start: "23:00", end: "08:00", tz: "Asia/Shanghai" };
  test("across midnight, in the phone's zone", () => {
    expect(inQuiet(Date.parse("2026-11-09T15:30:00Z"), q)).toBe(true); // 23:30 Shanghai
    expect(inQuiet(Date.parse("2026-11-09T23:59:00Z"), q)).toBe(true); // 07:59
    expect(inQuiet(Date.parse("2026-11-10T00:00:00Z"), q)).toBe(false); // 08:00
    expect(inQuiet(Date.parse("2026-11-09T14:59:00Z"), q)).toBe(false); // 22:59
    expect(inQuiet(Date.now(), null)).toBe(false);
  });
  test("end time", () => {
    expect(new Date(quietEndsAt(Date.parse("2026-11-09T15:30:00Z"), q)).toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });
});

describe("the pusher", () => {
  async function setup(o: { start?: string } = {}) {
    const t = tempDir();
    const clock = new FakeClock(Date.parse(o.start ?? "2026-11-09T04:00:00Z")); // 12:00 Shanghai
    const log = openLog({ path: `${t.dir}/d.db`, persona: "default", clock });
    const store = openPushStore(t.dir);
    const r = await receiver();
    const sub: PushSub = { endpoint: "https://fcm.googleapis.com/fcm/send/1", keys: r.keys, deviceId: "phone", locale: "zh", platform: "ios", createdAt: "" };
    const sent: { url: string; body: Uint8Array }[] = [];
    const pusher = createPusher({
      log,
      store,
      clock,
      personaName: () => "Ducter",
      taskTitle: () => "修 fix-ci",
      holdMs: 30_000,
      coalesceMs: 15 * 60_000,
      fetcher: async (url, init) => (sent.push({ url, body: init.body as Uint8Array }), new Response(null, { status: 201 })),
    });
    stops.push(() => pusher.stop(), () => log.close(), t.cleanup);
    return { log, store, sub, sent, pusher, clock, r };
  }
  const flush = () => Bun.sleep(60); // key generation and encryption are real (async) WebCrypto
  const decision = (log: Awaited<ReturnType<typeof setup>>["log"], id: string) =>
    log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: id, taskId: "t1", question: "要 rebase 吗？", goLabel: "rebase", defaultOption: "go", reversible: true } });

  test("a decision nobody read within the hold earns one push; a read or an answer cancels it", async () => {
    const s = await setup();
    const r = s.r;
    s.store.subscribe(s.sub);
    decision(s.log, "d1");
    s.clock.advance(29_000);
    await flush();
    expect(s.sent.length).toBe(0);
    s.clock.advance(2_000);
    await flush();
    expect(s.sent.length).toBe(1);
    const msg = JSON.parse(await decrypt(s.sent[0]!.body, r));
    expect(msg).toMatchObject({ title: "Ducter · 修 fix-ci", url: "app#d=d1" });
    expect(msg.actions).toBeUndefined(); // the phone is an iPhone

    const seen = decision(s.log, "d2");
    s.log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: seen.seq } });
    decision(s.log, "d3");
    s.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d3", option: "go", by: "user" } });
    s.clock.advance(60 * 60_000);
    await flush();
    expect(s.sent.length).toBe(1);
  });

  test("at most one push per 15 min: the rest go out together", async () => {
    const s = await setup();
    const r = s.r;
    s.store.subscribe(s.sub);
    decision(s.log, "d1");
    s.clock.advance(31_000);
    await flush();
    expect(s.sent.length).toBe(1);
    decision(s.log, "d2");
    decision(s.log, "d3");
    s.clock.advance(60_000);
    await flush();
    expect(s.sent.length).toBe(1);
    s.clock.advance(15 * 60_000);
    await flush();
    expect(s.sent.length).toBe(2);
    expect(JSON.parse(await decrypt(s.sent[1]!.body, r)).body).toBe("2 件等你");
  });

  test("quiet hours: nothing breaks through; one push at the end if it still waits", async () => {
    const s = await setup({ start: "2026-11-09T15:00:00Z" }); // 23:00 Shanghai
    s.store.setSettings({ quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" } });
    const r = s.r;
    s.store.subscribe(s.sub);
    decision(s.log, "d1");
    s.clock.advance(4 * 3600_000);
    await flush();
    expect(s.sent.length).toBe(0);
    s.clock.advance(5 * 3600_000 + 120_000); // past 08:00
    await flush();
    expect(s.sent.length).toBe(1);
    expect(JSON.parse(await decrypt(s.sent[0]!.body, r)).body).toBe("早上好。1 件等你。");
  });

  test("done results push only when the user asked for them", async () => {
    const s = await setup();
    s.store.subscribe(s.sub);
    s.log.append({ stream: "task:t1", origin: "system", kind: "task_state", body: { taskId: "t1", attention: "done", residency: "warm" } });
    s.clock.advance(60_000);
    await flush();
    expect(s.sent.length).toBe(0);
    s.store.setSettings({ done: true });
    s.log.append({ stream: "task:t2", origin: "system", kind: "task_state", body: { taskId: "t2", attention: "done", residency: "warm" } });
    s.clock.advance(60_000);
    await flush();
    expect(s.sent.length).toBe(1);
  });

  test("a subscription the push service says is gone is dropped", async () => {
    const s = await setup();
    s.store.subscribe(s.sub);
    const res = await s.pusher.sendNow(() => coalescedMessage(1, { persona: "D", locale: "en" }));
    expect(res[0]!.status).toBe(201);
    const gone = createPusher({ log: s.log, store: s.store, personaName: () => "D", taskTitle: () => "", fetcher: async () => new Response(null, { status: 410 }) });
    stops.push(() => gone.stop());
    await gone.sendNow(() => coalescedMessage(1, { persona: "D", locale: "en" }));
    expect(s.store.subs().length).toBe(0);
  });
});
