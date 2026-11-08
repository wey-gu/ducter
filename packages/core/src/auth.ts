// Device auth for remote clients and workers (D54, docs/design/system.md "Remote access").
//
// - Clients on this machine (loopback peer, loopback Host, no proxy headers) stay token-free.
// - Everyone else pairs once: `ducter pair` mints a one-time code (10 min); the client trades it
//   at POST /pair for a long-lived device token. Only a SHA-256 of each code and token is kept,
//   in <dataDir>/devices.db (0600), which the CLI and the server share (`ducter devices revoke`
//   works while the service runs).
// - Remote /ws needs `Authorization: Bearer dvc.…` (or X-Ducter-Device); remote /mcp needs
//   X-Ducter-Device next to its own role bearer.
// Tokens and codes are never logged.
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

export const CODE_TTL_MS = 10 * 60_000;
/** No I, L, O, U, 0, 1: nothing to misread when typed from a terminal. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_LEN = 8;
const MAX_FAILS_PER_KEY = 10; // wrong codes per client address per window
const MAX_FAILS_GLOBAL = 30; // then every pending code is void (`ducter pair` prints a new one)
const FAIL_WINDOW_MS = 10 * 60_000;
const SEEN_EVERY_MS = 60_000;

export type DeviceKind = "client" | "worker";

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  platform: string;
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

export type RedeemError = "invalid" | "expired" | "locked";

export interface DeviceAuth {
  /** A fresh one-time code, shown to the user once. Older pending codes stay valid until they expire. */
  createCode(opts?: { ttlMs?: number; kind?: DeviceKind }): { code: string; expiresAt: number };
  /** Trades a code for a device token. `key` identifies the caller for rate limiting. */
  redeem(code: string, info: { name: string; platform?: string }, key?: string): { token: string; device: Device } | { error: RedeemError };
  /** The live (not revoked) device a token belongs to. */
  verify(token: string): Device | undefined;
  list(opts?: { all?: boolean }): Device[];
  /** Revokes by id, or by name when the name is unique among live devices. Returns what it revoked. */
  revoke(idOrName: string): Device[];
  pendingCodes(): number;
  close(): void;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Uppercase, drop spaces and dashes: "k7qm 4xpa" and "K7QM-4XPA" are the same code. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function newCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

const newId = () => randomBytes(5).toString("hex"); // 10 hex chars, shown in `ducter devices`

export function openDeviceAuth(dataDir: string, opts: { now?: () => number } = {}): DeviceAuth {
  const now = opts.now ?? Date.now;
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, "devices.db");
  const fresh = !existsSync(path);
  const db = new Database(path, { create: true });
  if (fresh) chmodSync(path, 0o600);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, platform TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER, revoked_at INTEGER);
    CREATE TABLE IF NOT EXISTS pair_codes (
      code_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  `);

  const fails = new Map<string, number[]>();
  const seenAt = new Map<string, number>();
  const iso = (ms: number | null | undefined) => (ms == null ? undefined : new Date(ms).toISOString());
  const row = (r: any): Device => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    platform: r.platform,
    createdAt: iso(r.created_at)!,
    ...(r.last_seen_at != null ? { lastSeenAt: iso(r.last_seen_at) } : {}),
    ...(r.revoked_at != null ? { revokedAt: iso(r.revoked_at) } : {}),
  });

  const recentFails = (key: string) => {
    const cut = now() - FAIL_WINDOW_MS;
    const list = (fails.get(key) ?? []).filter((t) => t > cut);
    fails.set(key, list);
    return list;
  };
  const fail = (key: string) => {
    recentFails(key).push(now());
    const all = recentFails("*");
    all.push(now());
    if (all.length >= MAX_FAILS_GLOBAL) {
      db.run("DELETE FROM pair_codes");
      fails.set("*", []);
    }
  };

  const insertDevice = db.transaction((codeHash: string, d: { id: string; name: string; platform: string; tokenHash: string }) => {
    const c = db.query("SELECT kind, expires_at FROM pair_codes WHERE code_hash = ?").get(codeHash) as any;
    if (!c) return { error: "invalid" as const };
    db.run("DELETE FROM pair_codes WHERE code_hash = ?", [codeHash]);
    if (c.expires_at <= now()) return { error: "expired" as const };
    db.run("INSERT INTO devices (id, name, kind, platform, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      d.id, d.name, c.kind, d.platform, d.tokenHash, now(),
    ]);
    return { kind: c.kind as DeviceKind };
  });

  return {
    createCode(o = {}) {
      db.run("DELETE FROM pair_codes WHERE expires_at <= ?", [now()]);
      const raw = newCode();
      const expiresAt = now() + (o.ttlMs ?? CODE_TTL_MS);
      db.run("INSERT INTO pair_codes (code_hash, kind, created_at, expires_at) VALUES (?, ?, ?, ?)", [sha(raw), o.kind ?? "client", now(), expiresAt]);
      return { code: formatCode(raw), expiresAt };
    },
    redeem(code, info, key = "?") {
      if (recentFails(key).length >= MAX_FAILS_PER_KEY) return { error: "locked" };
      const raw = normalizeCode(code);
      if (raw.length !== CODE_LEN) {
        fail(key);
        return { error: "invalid" };
      }
      const id = newId();
      const secret = randomBytes(32).toString("base64url");
      const name = (info.name || "device").trim().slice(0, 64) || "device";
      const platform = (info.platform ?? "").trim().slice(0, 32);
      const r = insertDevice(sha(raw), { id, name, platform, tokenHash: sha(secret) }) as { error: RedeemError } | { kind: DeviceKind };
      if ("error" in r) {
        fail(key);
        return { error: r.error };
      }
      const d = db.query("SELECT * FROM devices WHERE id = ?").get(id);
      return { token: `dvc.${id}.${secret}`, device: row(d) };
    },
    verify(token) {
      const m = /^dvc\.([0-9a-f]{10})\.([A-Za-z0-9_-]{43})$/.exec(token.trim());
      if (!m) return;
      const r = db.query("SELECT * FROM devices WHERE id = ? AND revoked_at IS NULL").get(m[1]!) as any;
      if (!r) return;
      const want = Buffer.from(r.token_hash, "hex");
      const got = Buffer.from(sha(m[2]!), "hex");
      if (want.length !== got.length || !timingSafeEqual(want, got)) return;
      const t = now();
      if (t - (seenAt.get(r.id) ?? 0) > SEEN_EVERY_MS) {
        seenAt.set(r.id, t);
        db.run("UPDATE devices SET last_seen_at = ? WHERE id = ?", [t, r.id]);
        r.last_seen_at = t;
      }
      return row(r);
    },
    list(o = {}) {
      const q = o.all ? "SELECT * FROM devices ORDER BY created_at" : "SELECT * FROM devices WHERE revoked_at IS NULL ORDER BY created_at";
      return db.query(q).all().map(row);
    },
    revoke(idOrName) {
      const live = db.query("SELECT * FROM devices WHERE revoked_at IS NULL").all() as any[];
      let hit = live.filter((r) => r.id === idOrName);
      if (!hit.length) {
        const byName = live.filter((r) => r.name === idOrName);
        if (byName.length === 1) hit = byName;
      }
      for (const r of hit) {
        r.revoked_at = now();
        db.run("UPDATE devices SET revoked_at = ? WHERE id = ?", [r.revoked_at, r.id]);
      }
      return hit.map(row);
    },
    pendingCodes() {
      return (db.query("SELECT COUNT(*) AS n FROM pair_codes WHERE expires_at > ?").get(now()) as any).n;
    },
    close: () => db.close(),
  };
}

// ---------- the HTTP gate in front of core's routes ----------

const LOOPBACK_IP = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
/** A reverse proxy or tunnel on this box connects from loopback; these headers give it away. */
const PROXY_HEADERS = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip", "via", "cf-connecting-ip", "tailscale-user-login"];

/** On this machine, not relayed: the peer and the Host are loopback and no proxy says otherwise. */
export function isLocalRequest(req: Request, peerIp: string | undefined): boolean {
  if (!peerIp || !LOOPBACK_IP.test(peerIp)) return false;
  if (!LOOPBACK_HOST.test(req.headers.get("host") ?? "")) return false;
  return !PROXY_HEADERS.some((h) => req.headers.has(h));
}

export type GateResult = { pass: true; via: "local" } | { pass: true; via: "device"; device: Device } | { pass: false; response: Response };

export interface Gate {
  check(req: Request, peerIp: string | undefined): Promise<GateResult>;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function createGate(opts: { auth: DeviceAuth; trustLoopback?: boolean; personaName?: () => string }): Gate {
  const trust = opts.trustLoopback ?? process.env.DUCTER_LOCAL_TRUST !== "off";
  const tokenOf = (req: Request, path: string) => {
    const dev = req.headers.get("x-ducter-device");
    if (dev) return dev;
    // On /mcp, Authorization carries the MCP role token, never a device token.
    const a = req.headers.get("authorization") ?? "";
    if (path !== "/mcp" && a.startsWith("Bearer ")) return a.slice(7).trim();
  };
  return {
    async check(req, peerIp) {
      const url = new URL(req.url);
      const local = trust && isLocalRequest(req, peerIp);
      if (url.pathname === "/pair") {
        if (req.method !== "POST") return { pass: false, response: new Response("Open the Ducter app and choose “Connect to your Ducter”.\n", { status: 200 }) };
        let body: any;
        try {
          body = await req.json();
        } catch {
          return { pass: false, response: json(400, { error: "invalid" }) };
        }
        const key = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || peerIp || "?";
        const r = opts.auth.redeem(String(body?.code ?? ""), { name: String(body?.name ?? ""), platform: String(body?.platform ?? "") }, key);
        if ("error" in r) return { pass: false, response: json(r.error === "locked" ? 429 : 401, { error: r.error }) };
        return { pass: false, response: json(200, { token: r.token, deviceId: r.device.id, name: r.device.name, personaName: opts.personaName?.() ?? "Ducter" }) };
      }
      if (local) return { pass: true, via: "local" };
      if (url.pathname === "/health") return { pass: false, response: json(200, { ok: true }) };
      const token = tokenOf(req, url.pathname);
      const device = token ? opts.auth.verify(token) : undefined;
      if (!device) return { pass: false, response: json(401, { error: "unauthorized" }) };
      return { pass: true, via: "device", device };
    },
  };
}
