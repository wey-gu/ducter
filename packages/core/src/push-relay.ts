// Notifications to the iPhone app through the notification relay (D159), sealed end to end.
//
// - The app gives its home a per-phone key (32 random bytes, base64) when it subscribes, over
//   the paired, authenticated API. The home seals each notification with it (AES-256-GCM, a
//   fresh 12-byte nonce, AAD "ducter-push-v1"); the app's Notification Service Extension opens
//   it and shows the real title and text. Sealed = nonce ‖ ciphertext ‖ tag, base64url: the
//   layout CryptoKit's AES.GCM.SealedBox(combined:) reads (apps/ios/Shared/PushCrypto.swift).
// - The plaintext is the same message Web Push carries (fitMessage: trimmed, keys redacted),
//   padded with spaces to a multiple of 256 bytes so the size says little.
// - The collapse id (one notification per item) is an HMAC of the item's tag under the phone's
//   key: stable for the phone, meaningless to the relay and Apple.
// - The relay (apps/site/api/push/[op].ts) knows the phone only by an opaque handle the app got
//   from it; this file holds no Apple key and needs none.
import { fitMessage, type PushMessage, type PushSub, type SendResult } from "./push.ts";

export const DEFAULT_RELAY = "https://ducter.ai/api/push";
const AAD = new TextEncoder().encode("ducter-push-v1");
/** Plaintext cap: sealed and base64url-encoded it stays under the relay's 3400 characters. */
export const MAX_DEVICE_PLAINTEXT = 2304;

const b64u = (b: Uint8Array | ArrayBuffer) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString("base64url");
/** Accepts base64 or base64url. */
const unb64 = (s: string) => new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));

/** A phone's key as sent by the app: 32 bytes, base64 or base64url. */
export const isDeviceKey = (k: unknown): k is string => typeof k === "string" && k.length <= 64 && /^[A-Za-z0-9+/_=-]+$/.test(k) && unb64(k).length === 32;
/** A relay handle as the relay hands them out (opaque to the home). */
export const isRelayHandle = (h: unknown): h is string => typeof h === "string" && /^h1\.[A-Za-z0-9_-]{40,1100}$/.test(h);

/** The relay's base URL: DUCTER_PUSH_RELAY, else Nowledge's; "off" turns the relay off. */
export function relayUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const v = (env.DUCTER_PUSH_RELAY ?? "").trim();
  if (v === "off" || v === "0" || v === "false") return;
  if (!v) return DEFAULT_RELAY;
  try {
    const u = new URL(v);
    if (u.protocol === "https:" || u.hostname === "127.0.0.1" || u.hostname === "localhost") return v.replace(/\/$/, "");
  } catch {}
  console.warn(`[push] DUCTER_PUSH_RELAY is not an https URL; using ${DEFAULT_RELAY}`);
  return DEFAULT_RELAY;
}

export async function encryptForDevice(key: string, plaintext: Uint8Array, iv: Uint8Array = crypto.getRandomValues(new Uint8Array(12))): Promise<string> {
  const k = await crypto.subtle.importKey("raw", unb64(key), "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(iv), additionalData: AAD }, k, new Uint8Array(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64u(out);
}

export async function decryptForDevice(key: string, sealed: string): Promise<Uint8Array> {
  const raw = unb64(sealed);
  const k = await crypto.subtle.importKey("raw", unb64(key), "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: AAD }, k, raw.slice(12)));
}

/** The message as the app's extension reads it: {title, body, url, tag, decisionId?}, padded. */
export function devicePlaintext(msg: PushMessage): Uint8Array {
  const bytes = fitMessage(msg, MAX_DEVICE_PLAINTEXT - 1);
  const size = Math.min(MAX_DEVICE_PLAINTEXT, Math.ceil((bytes.length + 1) / 256) * 256);
  const out = new Uint8Array(size).fill(0x20); // JSON allows trailing spaces
  out.set(bytes);
  return out;
}

export async function collapseId(key: string, tag: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", unb64(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`collapse:${tag}`))).slice(0, 16));
}

/** What a sealed alert looks like when the home sends it to Apple itself (its own key). */
export async function encryptedApnsPayload(msg: PushMessage, key: string, category?: string): Promise<Record<string, unknown>> {
  return {
    aps: {
      alert: { "title-loc-key": "push.relay.title", "loc-key": "push.relay.body" },
      "mutable-content": 1,
      sound: "default",
      "thread-id": "ducter",
      ...(category ? { category, "interruption-level": "active" } : {}),
    },
    d: await encryptForDevice(key, devicePlaintext(msg)),
  };
}

export type RelayFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface RelayClient {
  url: string;
  send(sub: PushSub, msg: PushMessage, category?: string): Promise<SendResult>;
  revoke(handle: string): Promise<boolean>;
  /** The last call couldn't reach the relay (network or 5xx): /api/me says so plainly. */
  unreachable(): boolean;
}

export function createRelayClient(url: string, fetcher: RelayFetch = fetch as RelayFetch): RelayClient {
  let down = false;
  const post = async (op: string, body: unknown) => {
    const r = await fetcher(`${url}/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    down = r.status >= 500 && r.status !== 502; // 502: Apple refused, the relay itself is fine
    return r;
  };
  return {
    url,
    unreachable: () => down,
    async send(sub, msg, category) {
      const handle = sub.apns?.relay;
      const key = sub.apns?.key;
      if (!isRelayHandle(handle) || !isDeviceKey(key)) return { endpoint: sub.endpoint, status: 0, gone: false };
      try {
        const r = await post("send", { handle, d: await encryptForDevice(key, devicePlaintext(msg)), collapse: await collapseId(key, msg.tag), ...(category ? { category } : {}) });
        if (r.status >= 300) console.warn(`[push] relay ${r.status}`);
        return { endpoint: sub.endpoint, status: r.status, gone: r.status === 410 };
      } catch (err) {
        down = true;
        console.warn(`[push] relay unreachable: ${(err as Error).message}`);
        return { endpoint: sub.endpoint, status: 0, gone: false };
      }
    },
    async revoke(handle) {
      if (!isRelayHandle(handle)) return false;
      try {
        return (await post("revoke", { handle })).ok;
      } catch {
        down = true;
        return false;
      }
    },
  };
}
