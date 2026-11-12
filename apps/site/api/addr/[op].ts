// The address relay (D228): where a paired phone finds its home again after the home's address
// changed (Ducter's free tunnel gets a new address when the computer restarts).
//
// What it learns is kept to the minimum:
// - A note is sealed by the home with a key only the home and its paired devices hold
//   (packages/protocol/src/follow.ts). This stores the ciphertext as it came and hands it back;
//   it can't read the address, and nothing it could make up opens under that key.
// - A note lives under a random id (16 bytes) that says nothing about the home or its person.
//   The first write fixes who may write again: the SHA-256 of the home's write secret. Anyone
//   else's write is refused, so nobody can bury a home's note under their own.
// - Each note expires 30 days after its last write (a home writes again every 12 hours while on).
// - Rate counters are keyed by the id, or by a keyed hash of the caller's address, each with a TTL.
//
// Routes (one Vercel Node function; `[op]` is the last path segment):
//   POST /api/addr/put {id, w, d}   → {ok}            (a home; w = its write secret)
//   GET  /api/addr/get?id=…         → {d} | 404        (a paired device; CORS open: pages ask)
//   GET  /api/addr/health           → {ok, store}
//
// Env (set in Vercel, never in git): KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*),
// ADDR_HASH_KEY (base64 of 32 random bytes; the callers' addresses are hashed under it).
// Runbook: design/release/push-relay.md (the same project and store).
//
// Self-contained on purpose (only Web APIs): Vercel builds this file alone.

export type Env = Record<string, string | undefined>;

export interface AddrStore {
  kind: "kv" | "memory";
  incr(key: string, ttl: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

export const ADDR_LIMITS = {
  /** Writes per id per hour (a home writes on each change and every 12 h). */
  putHour: 30,
  /** Reads per caller address per minute (a page asks while it can't reach its home). */
  getMinute: 60,
  /** Writes per caller address per hour (new ids too). */
  callerPutHour: 120,
  ttl: 30 * 24 * 3600,
  maxNote: 1024,
};

const te = new TextEncoder();
const b64u = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const sha = async (s: string) => b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s))));
const isId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{22}$/.test(s);
const isSecret = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
const isNote = (s: unknown): s is string => typeof s === "string" && s.length >= 40 && s.length <= ADDR_LIMITS.maxNote && /^[A-Za-z0-9_-]+$/.test(s);

export function memoryAddrStore(now: () => number = Date.now): AddrStore {
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

/** Upstash Redis over its REST API, with no dependency (the same store as the push relay). */
export function kvAddrStore(url: string, token: string, fetcher: typeof fetch = fetch): AddrStore {
  const call = async (cmds: (string | number)[][]) => {
    const r = await fetcher(`${url.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cmds) });
    if (!r.ok) throw new Error(`store ${r.status}`);
    return (await r.json()) as { result?: unknown }[];
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

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" };
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store", ...CORS } });

export function createAddrRelay(deps: { env: Env; store: AddrStore }): (req: Request) => Promise<Response> {
  const hashKey = deps.env.ADDR_HASH_KEY ?? "";
  const caller = async (req: Request) => sha(`${hashKey}:${req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?"}`);
  const over = async (key: string, ttl: number, max: number) => (await deps.store.incr(key, ttl)) > max;
  return async (req) => {
    const url = new URL(req.url);
    const op = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === "GET" && op === "health") return json(200, { ok: true, store: deps.store.kind });
      if (req.method === "GET" && op === "get") {
        const id = url.searchParams.get("id");
        if (!isId(id)) return json(400, { error: "id" });
        if (await over(`ag:${await caller(req)}`, 60, ADDR_LIMITS.getMinute)) return json(429, { error: "slow down" });
        const v = await deps.store.get(`addr:${id}`);
        if (!v) return json(404, { error: "none" });
        return json(200, { d: (JSON.parse(v) as { d: string }).d });
      }
      if (req.method === "POST" && op === "put") {
        const text = await req.text();
        if (text.length > 4096) return json(413, { error: "too large" });
        let b: Record<string, unknown>;
        try {
          b = JSON.parse(text);
        } catch {
          return json(400, { error: "json" });
        }
        if (!isId(b.id) || !isSecret(b.w) || !isNote(b.d)) return json(400, { error: "fields" });
        if (await over(`ap:${await caller(req)}`, 3600, ADDR_LIMITS.callerPutHour)) return json(429, { error: "slow down" });
        if (await over(`ai:${b.id}`, 3600, ADDR_LIMITS.putHour)) return json(429, { error: "slow down" });
        const w = await sha(`w:${b.w}`);
        const was = await deps.store.get(`addr:${b.id}`);
        if (was && (JSON.parse(was) as { w: string }).w !== w) return json(403, { error: "not yours" });
        await deps.store.set(`addr:${b.id}`, JSON.stringify({ w, d: b.d }), ADDR_LIMITS.ttl);
        return json(200, { ok: true });
      }
      return json(404, { error: "not found" });
    } catch (err) {
      console.warn(`[addr] store: ${(err as Error).message}`);
      return json(503, { error: "busy" });
    }
  };
}

let relay: ((req: Request) => Promise<Response>) | undefined;

export default {
  fetch(req: Request): Promise<Response> {
    const env = process.env as Env;
    const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
    const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
    relay ??= createAddrRelay({ env, store: url && token ? kvAddrStore(url, token) : memoryAddrStore() });
    return relay(req);
  },
};
