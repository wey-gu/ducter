// The notification relay (D159): the one piece Nowledge runs so the public iPhone app can be
// notified by anyone's Ducter. APNs only takes pushes signed by the app publisher's key, so a
// home can't send to the app on its own; it sends here, and this forwards to Apple.
//
// What it learns is kept to the minimum:
// - The content is end to end encrypted: the phone gives its home a key, the home seals the
//   title and text, and this forwards the sealed bytes (`d`) untouched. Apple and this relay see
//   a neutral alert ("Ducter needs you", localized on the phone from loc-keys), never the words.
// - No database of device tokens. A handle is the device token sealed with the relay's own key
//   (AES-256-GCM): only this relay can open it, and only the home holding it can use it.
// - The store (Upstash Redis over REST, or memory) holds only revoked handle ids and rate
//   counters keyed by handle id or a keyed hash of the caller's address, each with a TTL.
//
// Routes (one Vercel Node function; `[op]` is the last path segment):
//   POST /api/push/register {token, topic, env}        → {handle}          (the iPhone app)
//   POST /api/push/send     {handle, d, collapse?, category?} → {ok} | 410  (a home)
//   POST /api/push/revoke   {handle}                    → {ok}             (app or home)
//   GET  /api/push/health                               → {ok, apns, store}
//
// Env (set in Vercel, never in git): APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 (base64 of the .p8),
// RELAY_HANDLE_KEY (base64 of 32 random bytes), RELAY_TOPICS (comma list, default
// co.nowledge.ducter.ios), KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN). Runbook: design/release/push-relay.md.
//
// Self-contained on purpose (only node: built-ins): Vercel builds this file alone. The JWT and
// HTTP/2 code mirror packages/core/src/apns.ts; apps/site/test/push-relay.test.ts checks both.

export type Env = Record<string, string | undefined>;

export interface ApnsRequest {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}
export type ApnsTransport = (r: ApnsRequest) => Promise<{ status: number; body: string }>;

/** The few things the relay remembers, all with a TTL. */
export interface RelayStore {
  kind: "kv" | "memory";
  /** Adds one and returns the new count; the key lives `ttl` seconds from its first count. */
  incr(key: string, ttl: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

export const LIMITS = {
  /** Sends per handle per hour. A home pushes at most one per 15 minutes plus tests (push.ts). */
  handleHour: 30,
  /** Sends per handle per day. */
  handleDay: 200,
  /** Calls per caller address per hour (any op); a home with many phones stays far below. */
  addrHour: 600,
  /** Registrations per caller address per hour. */
  registerHour: 30,
};
const REVOKED_TTL = 400 * 86400; // longer than a handle is useful: a token changes on reinstall
const HOSTS = { sandbox: "api.sandbox.push.apple.com", production: "api.push.apple.com" } as const;
const GONE = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);
const CATEGORIES = new Set(["DUCTER_DECISION"]);
const HANDLE_AAD = new TextEncoder().encode("ducter-relay-handle-v1");

const te = new TextEncoder();
const b64u = (b: Uint8Array | ArrayBuffer) => Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString("base64url");
const unb64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
const isToken = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f]{64,200}$/i.test(t);
const isTopic = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){1,8}$/.test(t) && t.length <= 155;

// ---------- the provider token (mirrors packages/core/src/apns.ts) ----------

export interface ApnsKey {
  keyId: string;
  teamId: string;
  pem: string;
}

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"));
}

export async function apnsJwt(k: ApnsKey, nowMs: number): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(k.pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(te.encode(JSON.stringify({ alg: "ES256", kid: k.keyId })));
  const claims = b64u(te.encode(JSON.stringify({ iss: k.teamId, iat: Math.floor(nowMs / 1000) })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64u(sig)}`;
}

/** One HTTP/2 session per host, reused while the instance lives (Apple asks for reuse). */
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
      req.setTimeout(10_000, () => req.close());
      req.end(r.body);
    });
  };
}

// ---------- handles: the device token, sealed to this relay ----------

interface Sealed {
  t: string; // device token (hex)
  p: string; // topic (bundle id)
  e: "sandbox" | "production";
  i: string; // handle id: what revocation and rate limits key on
}

async function sealKey(raw: Uint8Array<ArrayBuffer>, use: ("encrypt" | "decrypt")[]) {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, use);
}

export async function makeHandle(key: Uint8Array<ArrayBuffer>, s: Sealed): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: HANDLE_AAD }, await sealKey(key, ["encrypt"]), te.encode(JSON.stringify(s)));
  return `h1.${b64u(iv)}${b64u(ct)}`;
}

export async function readHandle(key: Uint8Array<ArrayBuffer>, handle: unknown): Promise<Sealed | undefined> {
  if (typeof handle !== "string" || !handle.startsWith("h1.") || handle.length > 1200) return;
  try {
    const raw = unb64u(handle.slice(3));
    if (raw.length < 12 + 16) return;
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: HANDLE_AAD }, await sealKey(key, ["decrypt"]), raw.slice(12));
    const s = JSON.parse(new TextDecoder().decode(pt)) as Sealed;
    return isToken(s.t) && isTopic(s.p) && (s.e === "sandbox" || s.e === "production") && typeof s.i === "string" ? s : undefined;
  } catch {
    return;
  }
}

/** A caller's address, never stored as is: an HMAC under the seal key, cut to 16 bytes. */
async function addrKey(key: Uint8Array<ArrayBuffer>, addr: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(`addr:${addr}`))).slice(0, 16));
}

// ---------- stores ----------

export function memoryStore(now: () => number = Date.now): RelayStore {
  const m = new Map<string, { v: string; until: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.until <= now()) m.delete(k);
    return m.get(k);
  };
  return {
    kind: "memory",
    async incr(k, ttl) {
      const e = live(k);
      const n = (e ? Number(e.v) : 0) + 1;
      m.set(k, { v: String(n), until: e?.until ?? now() + ttl * 1000 });
      return n;
    },
    get: async (k) => live(k)?.v ?? null,
    async set(k, v, ttl) {
      m.set(k, { v, until: now() + ttl * 1000 });
    },
  };
}

/** Upstash Redis over its REST API (what Vercel's marketplace Redis gives), with no dependency. */
export function kvStore(url: string, token: string, fetcher: typeof fetch = fetch): RelayStore {
  const call = async (cmds: (string | number)[][]) => {
    const r = await fetcher(`${url.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error(`store ${r.status}`);
    return (await r.json()) as { result?: unknown; error?: string }[];
  };
  return {
    kind: "kv",
    async incr(k, ttl) {
      const [a] = await call([["INCR", k], ["EXPIRE", k, ttl, "NX"]]);
      return Number(a?.result ?? 0);
    },
    async get(k) {
      const [a] = await call([["GET", k]]);
      return (a?.result as string | null) ?? null;
    },
    async set(k, v, ttl) {
      await call([["SET", k, v, "EX", ttl]]);
    },
  };
}

// ---------- the relay ----------

export interface RelayDeps {
  env: Env;
  transport: ApnsTransport;
  store: RelayStore;
  now?: () => number;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function createRelay(deps: RelayDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  const env = deps.env;
  const sealRaw = env.RELAY_HANDLE_KEY ? new Uint8Array(Buffer.from(env.RELAY_HANDLE_KEY, "base64")) : undefined;
  const seal = sealRaw?.length === 32 ? sealRaw : undefined;
  const p8 = env.APNS_KEY_P8 ? Buffer.from(env.APNS_KEY_P8, "base64").toString("utf8") : "";
  const apnsKey: ApnsKey | undefined = env.APNS_KEY_ID && env.APNS_TEAM_ID && p8.includes("PRIVATE KEY") ? { keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, pem: p8 } : undefined;
  const topics = new Set((env.RELAY_TOPICS || "co.nowledge.ducter.ios").split(",").map((s) => s.trim()).filter(Boolean));
  let jwt: { token: string; at: number } | undefined;
  const provider = async () => {
    if (!jwt || now() - jwt.at > 50 * 60_000) jwt = { token: await apnsJwt(apnsKey!, now()), at: now() };
    return jwt.token;
  };

  const over = async (key: string, ttl: number, max: number) => (await deps.store.incr(key, ttl)) > max;

  return async (req) => {
    const op = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
    if (req.method === "GET" && op === "health") return json(200, { ok: !!(apnsKey && seal), apns: !!apnsKey, store: deps.store.kind });
    if (req.method !== "POST") return json(405, { error: "method" });
    if (!apnsKey || !seal) return json(503, { error: "not configured" });
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 8192) return json(413, { error: "too large" });
    let b: Record<string, unknown>;
    try {
      const text = await req.text();
      if (text.length > 8192) return json(413, { error: "too large" });
      b = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return json(400, { error: "invalid" });
    }
    if (!b || typeof b !== "object") return json(400, { error: "invalid" });
    const addr = (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
    const ak = await addrKey(seal, addr);
    try {
      if (await over(`rl:a:${ak}`, 3600, LIMITS.addrHour)) return json(429, { error: "slow down" });
      switch (op) {
        case "register": {
          const { token, topic, env: apnsEnv } = b as { token?: unknown; topic?: unknown; env?: unknown };
          if (!isToken(token) || !isTopic(topic) || (apnsEnv !== "sandbox" && apnsEnv !== "production")) return json(400, { error: "invalid" });
          if (!topics.has(topic)) return json(403, { error: "unknown app" });
          if (await over(`rl:r:${ak}`, 3600, LIMITS.registerHour)) return json(429, { error: "slow down" });
          const id = b64u(crypto.getRandomValues(new Uint8Array(12)));
          return json(200, { handle: await makeHandle(seal, { t: token.toLowerCase(), p: topic, e: apnsEnv, i: id }) });
        }
        case "revoke": {
          const h = await readHandle(seal, b.handle);
          if (!h) return json(400, { error: "invalid" });
          await deps.store.set(`rev:${h.i}`, "1", REVOKED_TTL);
          return json(200, { ok: true });
        }
        case "send": {
          const h = await readHandle(seal, b.handle);
          if (!h) return json(400, { error: "invalid" });
          if (!topics.has(h.p)) return json(410, { gone: true });
          const d = b.d;
          if (typeof d !== "string" || !/^[A-Za-z0-9_-]{40,3400}$/.test(d)) return json(400, { error: "invalid" });
          const collapse = typeof b.collapse === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b.collapse) ? b.collapse : undefined;
          const category = typeof b.category === "string" && CATEGORIES.has(b.category) ? b.category : undefined;
          if (await deps.store.get(`rev:${h.i}`)) return json(410, { gone: true });
          if ((await over(`rl:h:${h.i}`, 3600, LIMITS.handleHour)) || (await over(`rl:hd:${h.i}`, 86400, LIMITS.handleDay))) return json(429, { error: "slow down" });
          const payload = {
            aps: {
              alert: { "title-loc-key": "push.relay.title", "loc-key": "push.relay.body" },
              "mutable-content": 1,
              sound: "default",
              "thread-id": "ducter",
              ...(category ? { category, "interruption-level": "active" } : {}),
            },
            d,
          };
          let res: { status: number; body: string };
          try {
            res = await deps.transport({
              host: HOSTS[h.e],
              path: `/3/device/${h.t}`,
              headers: {
                authorization: `bearer ${await provider()}`,
                "apns-topic": h.p,
                "apns-push-type": "alert",
                "apns-priority": "10",
                "apns-expiration": String(Math.floor(now() / 1000) + 12 * 3600),
                ...(collapse ? { "apns-collapse-id": collapse } : {}),
                "content-type": "application/json",
              },
              body: JSON.stringify(payload),
            });
          } catch {
            return json(502, { error: "apple unreachable" });
          }
          let reason = "";
          try {
            reason = (JSON.parse(res.body || "{}") as { reason?: string }).reason ?? "";
          } catch {}
          if (res.status === 403 && reason === "ExpiredProviderToken") jwt = undefined;
          if (res.status === 410 || GONE.has(reason)) {
            await deps.store.set(`rev:${h.i}`, "1", REVOKED_TTL);
            return json(410, { gone: true });
          }
          if (res.status >= 200 && res.status < 300) return json(200, { ok: true });
          // Never log the token or the payload; the status and Apple's reason are enough.
          console.warn(`[relay] APNs ${res.status} ${reason}`);
          return json(502, { error: "apple refused", status: res.status, reason });
        }
      }
    } catch (err) {
      console.warn(`[relay] store: ${(err as Error).message}`);
      return json(503, { error: "busy" });
    }
    return json(404, { error: "not found" });
  };
}

// ---------- the Vercel entry ----------

let relay: ((req: Request) => Promise<Response>) | undefined;

function fromEnv(env: Env): RelayDeps {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  // Without a store, limits and revocations hold per instance only (fine for a preview, not for
  // the public relay: design/release/push-relay.md connects one).
  return { env, transport: http2Transport(), store: url && token ? kvStore(url, token) : memoryStore() };
}

export default {
  fetch(req: Request): Promise<Response> {
    relay ??= createRelay(fromEnv(process.env));
    return relay(req);
  },
};
