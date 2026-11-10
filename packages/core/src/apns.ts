// APNs for the Ducter iPhone app (apps/ios): the native app registers with Apple and hands its
// device token to core (POST /api/push/subscribe {apns}); core sends alerts straight to Apple.
//
// - Token auth (an ES256 JWT from a .p8 "Apple Push Notifications service" key), refreshed every
//   50 minutes (Apple refuses tokens older than an hour and throttles faster refreshes).
// - Two ways out (D159). By default the home has no Apple key and sends through the notification
//   relay (push-relay.ts), which holds the app publisher's key. A home with its own key (a
//   power user who signs the app under their own team) sends straight to Apple, configured by
//   <dataDir>/apns.json {keyId, teamId, keyFile} or DUCTER_APNS_KEY_ID, DUCTER_APNS_TEAM_ID,
//   DUCTER_APNS_KEY_FILE. Neither (relay off, no key): subscriptions are kept, sends report 0,
//   and /api/me says `apns: false` so the app can tell the user.
// - A subscription that carries the phone's key (every app since D159) gets a sealed alert
//   either way: Apple and the relay see a neutral "Ducter needs you", never the words.
// - HTTP/2 (APNs speaks nothing else) through node:http2; the transport is injectable for tests.
// - Decisions carry the category DUCTER_DECISION, which the app registers with Go / Hold actions,
//   answered by the app through POST /api/decide without opening it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PushMessage, PushSub, SendResult } from "./push.ts";
import { collapseId, isDeviceKey, encryptedApnsPayload, type RelayClient } from "./push-relay.ts";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** The .p8 file's PEM text. */
  key: string;
}

export const APNS_PREFIX = "apns:";
export const APNS_CATEGORY = "DUCTER_DECISION";
const HOSTS = { sandbox: "api.sandbox.push.apple.com", production: "api.push.apple.com" } as const;
export type ApnsEnv = keyof typeof HOSTS;

/** A device token is hex; Apple's are 32 bytes today, and may grow. */
export const isApnsToken = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{64,200}$/i.test(t);
/** A bundle id (the APNs topic). */
export const isTopic = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){1,8}$/.test(t) && t.length <= 155;

export function loadApnsConfig(dataDir: string, env: Record<string, string | undefined> = process.env): ApnsConfig | undefined {
  let keyId = env.DUCTER_APNS_KEY_ID;
  let teamId = env.DUCTER_APNS_TEAM_ID;
  let keyFile = env.DUCTER_APNS_KEY_FILE;
  const p = join(dataDir, "apns.json");
  if (existsSync(p)) {
    try {
      const j = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
      keyId ||= j.keyId;
      teamId ||= j.teamId;
      keyFile ||= j.keyFile ? (j.keyFile.startsWith("/") ? j.keyFile : join(dataDir, j.keyFile)) : undefined;
    } catch (err) {
      console.warn(`[push] ${p} is unreadable:`, (err as Error).message);
    }
  }
  if (!keyId || !teamId || !keyFile || !existsSync(keyFile)) return;
  return { keyId, teamId, key: readFileSync(keyFile, "utf8") };
}

const b64u = (b: Uint8Array | ArrayBuffer) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString("base64url");
const te = new TextEncoder();

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return new Uint8Array(Buffer.from(body, "base64"));
}

/** The provider token (JWT, ES256): header {alg, kid}, claims {iss: team, iat}. */
export async function apnsJwt(c: ApnsConfig, nowMs = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(c.key), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ alg: "ES256", kid: c.keyId })));
  const claims = b64u(te.encode(JSON.stringify({ iss: c.teamId, iat: Math.floor(nowMs / 1000) })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64u(sig)}`;
}

/** What the app receives: the alert, plus where a tap goes and which decision the buttons answer. */
export function apnsPayload(msg: PushMessage): Record<string, unknown> {
  const cut = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join("") + "…" : s);
  return {
    aps: {
      alert: { title: cut(msg.title, 120), body: cut(msg.body, 600) },
      // D165: the morning note is passive (no sound, research/46); "now" is time-sensitive.
      ...(msg.level === "passive" ? {} : { sound: "default" }),
      "thread-id": msg.decisionId ? "decisions" : msg.tag.slice(0, 64),
      ...(msg.decisionId ? { category: APNS_CATEGORY, "interruption-level": "active" } : msg.level ? { "interruption-level": msg.level } : {}),
    },
    url: msg.url,
    ...(msg.decisionId ? { decisionId: msg.decisionId } : {}),
  };
}

export interface ApnsRequest {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}
export type ApnsTransport = (r: ApnsRequest) => Promise<{ status: number; body: string }>;

/** One HTTP/2 session per host, kept open (Apple asks providers to reuse connections). */
export function http2Transport(): ApnsTransport {
  const sessions = new Map<string, import("node:http2").ClientHttp2Session>();
  return async (r) => {
    const http2 = await import("node:http2");
    let s = sessions.get(r.host);
    if (!s || s.closed || s.destroyed) {
      s = http2.connect(`https://${r.host}`);
      s.on("error", () => sessions.delete(r.host));
      s.on("close", () => sessions.delete(r.host));
      s.unref?.();
      sessions.set(r.host, s);
    }
    const session = s;
    return new Promise((resolve, reject) => {
      const req = session.request({ ":method": "POST", ":path": r.path, ...r.headers });
      let status = 0;
      let body = "";
      req.setEncoding("utf8");
      req.on("response", (h) => (status = Number(h[":status"]) || 0));
      req.on("data", (d: string) => (body += d));
      req.on("end", () => resolve({ status, body }));
      req.on("error", reject);
      req.setTimeout(15_000, () => req.close());
      req.end(r.body);
    });
  };
}

export interface ApnsSender {
  /** Something can reach the app: an Apple key on this home, or the relay. */
  configured: boolean;
  /** How: "key" (this home's own Apple key, the relay as fallback) or "relay". */
  via?: "key" | "relay";
  /** The relay couldn't be reached the last time it was tried. */
  relayUnreachable?: () => boolean;
  /** This subscription can be delivered to (its app version and this home's setup agree). */
  deliverable?: (sub: PushSub) => boolean;
  send(sub: PushSub, msg: PushMessage): Promise<SendResult>;
  /** The phone's device was disconnected: its relay handle stops working (D155, D159). */
  revoke?(sub: PushSub): Promise<void>;
}

/** Tokens Apple says are dead: the subscription is dropped. */
const GONE = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

export function createApnsSender(config: ApnsConfig | undefined, transport: ApnsTransport = http2Transport(), now = () => Date.now()): ApnsSender {
  let jwt: { token: string; at: number } | undefined;
  const provider = async () => {
    if (!jwt || now() - jwt.at > 50 * 60_000) jwt = { token: await apnsJwt(config!, now()), at: now() };
    return jwt.token;
  };
  return {
    configured: !!config,
    async send(sub, msg) {
      const token = sub.endpoint.slice(APNS_PREFIX.length);
      const topic = sub.apns?.topic;
      if (!isApnsToken(token) || !isTopic(topic)) return { endpoint: sub.endpoint, status: 0, gone: true };
      if (!config) return { endpoint: sub.endpoint, status: 0, gone: false };
      try {
        const res = await transport({
          host: HOSTS[sub.apns?.env === "production" ? "production" : "sandbox"],
          path: `/3/device/${token}`,
          headers: {
            authorization: `bearer ${await provider()}`,
            "apns-topic": topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-expiration": String(Math.floor(now() / 1000) + 12 * 3600),
            "apns-collapse-id": isDeviceKey(sub.apns?.key) ? await collapseId(sub.apns.key, msg.tag) : msg.tag.slice(0, 64),
            "content-type": "application/json",
          },
          body: JSON.stringify(isDeviceKey(sub.apns?.key) ? await encryptedApnsPayload(msg, sub.apns.key, msg.decisionId ? APNS_CATEGORY : undefined) : apnsPayload(msg)),
        });
        let reason = "";
        try {
          reason = (JSON.parse(res.body || "{}") as { reason?: string }).reason ?? "";
        } catch {}
        if (res.status === 403 && reason === "ExpiredProviderToken") jwt = undefined;
        if (res.status >= 300) console.warn(`[push] APNs ${res.status} ${reason}`);
        return { endpoint: sub.endpoint, status: res.status, gone: res.status === 410 || GONE.has(reason) };
      } catch (err) {
        console.warn(`[push] APNs send failed: ${(err as Error).message}`);
        return { endpoint: sub.endpoint, status: 0, gone: false };
      }
    },
  };
}

/**
 * The app's sender: this home's own key when it has one (falling back to the relay when Apple
 * refuses that key for this app, e.g. the public app on a home whose key is another team's),
 * else the relay. `relay` undefined means DUCTER_PUSH_RELAY=off.
 */
export function createAppPushSender(direct: ApnsSender | undefined, relay: RelayClient | undefined): ApnsSender {
  const hasKey = !!direct?.configured;
  const viaRelay = (sub: PushSub) => !!relay && !!sub.apns?.relay && isDeviceKey(sub.apns?.key);
  return {
    configured: hasKey || !!relay,
    ...(hasKey ? { via: "key" as const } : relay ? { via: "relay" as const } : {}),
    relayUnreachable: () => relay?.unreachable() ?? false,
    deliverable: (sub) => hasKey || viaRelay(sub),
    async send(sub, msg) {
      if (!isApnsToken(sub.endpoint.slice(APNS_PREFIX.length)) || !isTopic(sub.apns?.topic)) return { endpoint: sub.endpoint, status: 0, gone: true };
      if (hasKey) {
        const r = await direct!.send(sub, msg);
        if (r.status !== 403 || !viaRelay(sub)) return r;
      }
      if (viaRelay(sub)) return relay!.send(sub, msg, msg.decisionId ? APNS_CATEGORY : undefined);
      return { endpoint: sub.endpoint, status: 0, gone: false };
    },
    async revoke(sub) {
      if (relay && sub.apns?.relay) await relay.revoke(sub.apns.relay);
    },
  };
}
