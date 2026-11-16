// D293: the home's address book, the ways to reach it. `ducter domain`, `ducter tailscale` and the
// Cloudflare tunnel each ADD or update their own entry here instead of overwriting public-url.
// public-url stays as the primary: the address pairing links lead with and the only one a Ducter
// from before D293 knows. The book is <dataDir>/reach.json (0600, no secrets); the CLI writes it
// in another process, so the running home reads it again every few seconds (createReach).
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { kindOfUrl, normalizeBase, WAY_KINDS, type DeviceVia, type ReachWay, type WayKind, type WayState } from "@ducter/protocol/src/reach.ts";

export const BOOK_FILE = "reach.json";
const bookPath = (dataDir: string) => join(dataDir, BOOK_FILE);
const publicPath = (dataDir: string) => join(dataDir, "public-url");

interface Entry {
  kind: WayKind;
  url: string;
  addedAt: string;
}

function readEntries(dataDir: string): Entry[] {
  try {
    const j = JSON.parse(readFileSync(bookPath(dataDir), "utf8"));
    if (!Array.isArray(j?.ways)) return [];
    return j.ways
      .filter((w: any) => w && typeof w.url === "string" && (WAY_KINDS as readonly string[]).includes(w.kind))
      .map((w: any) => ({ kind: w.kind as WayKind, url: normalizeBase(w.url), addedAt: String(w.addedAt ?? "") }));
  } catch {
    return [];
  }
}

function writeEntries(dataDir: string, ways: Entry[]) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const p = bookPath(dataDir);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ways }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, p);
}

function readPublic(dataDir: string, env: Record<string, string | undefined>): string | undefined {
  const raw = env.DUCTER_PUBLIC_URL?.trim() || (existsSync(publicPath(dataDir)) ? readFileSync(publicPath(dataDir), "utf8").trim() : "");
  return raw ? normalizeBase(raw) : undefined;
}

const same = (a: string, b: string) => normalizeBase(a).toLowerCase() === normalizeBase(b).toLowerCase();

/** Who a way reaches: the primary prefers one everyone can open (a domain, a tunnel) over a tailnet. */
const REACHES_EVERYONE: Record<WayKind, number> = { domain: 0, tunnel: 1, tailnet: 2, lan: 3 };

/**
 * Every way to reach this home, the primary flagged. A public-url from before D293 (or one set by
 * hand) that the book doesn't have is a way too, its kind read from its address (tunnelHost: the
 * Cloudflare tunnel's hostname, when the home has one).
 */
export function readWays(dataDir: string, o: { env?: Record<string, string | undefined>; tunnelHost?: string } = {}): ReachWay[] {
  const env = o.env ?? process.env;
  const primary = readPublic(dataDir, env);
  const kindOf = (url: string): WayKind => (o.tunnelHost && new URL(url).hostname.toLowerCase() === o.tunnelHost.toLowerCase() ? "tunnel" : kindOfUrl(url));
  const out: ReachWay[] = readEntries(dataDir).map((e) => ({ kind: e.kind, url: e.url, ...(primary && same(primary, e.url) ? { primary: true } : {}) }));
  if (primary && !out.some((w) => same(w.url, primary))) {
    try {
      out.unshift({ kind: kindOf(primary), url: primary, primary: true });
    } catch {}
  }
  return out;
}

/**
 * Adds a way, or updates its kind. The first way becomes the primary (public-url); a later one
 * leaves the primary alone unless asked (`primary`), so a Tailscale address never takes over from
 * a domain everyone can open.
 */
export function addWay(dataDir: string, kind: WayKind, url: string, o: { primary?: boolean; now?: () => Date; env?: Record<string, string | undefined> } = {}): { primary: boolean } {
  const u = normalizeBase(url);
  const list = readEntries(dataDir);
  // A public-url from before D293 joins the book the first time another way is added.
  const legacy = readPublic(dataDir, {});
  if (legacy && !list.some((e) => same(e.url, legacy)) && !same(legacy, u)) list.push({ kind: kindOfUrl(legacy), url: legacy, addedAt: (o.now?.() ?? new Date()).toISOString() });
  const at = list.findIndex((e) => same(e.url, u));
  if (at >= 0) list[at]!.kind = kind;
  else list.push({ kind, url: u, addedAt: (o.now?.() ?? new Date()).toISOString() });
  writeEntries(dataDir, list);
  const primary = o.primary || !legacy || same(legacy, u);
  if (primary) writeFileSync(publicPath(dataDir), `${u}\n`);
  return { primary };
}

/**
 * Takes a way out. When it was the primary, the next way that reaches the most devices becomes
 * the primary (public-url), or public-url goes. Returns false when the book didn't have it.
 */
export function removeWay(dataDir: string, url: string): boolean {
  const u = normalizeBase(url);
  const list = readEntries(dataDir);
  const kept = list.filter((e) => !same(e.url, u));
  const legacy = readPublic(dataDir, {});
  const wasPrimary = !!legacy && same(legacy, u);
  if (kept.length === list.length && !wasPrimary) return false;
  writeEntries(dataDir, kept);
  if (wasPrimary) {
    const next = [...kept].sort((a, b) => REACHES_EVERYONE[a.kind] - REACHES_EVERYONE[b.kind])[0];
    if (next) writeFileSync(publicPath(dataDir), `${next.url}\n`);
    else rmSync(publicPath(dataDir), { force: true });
  }
  return true;
}

/** Takes out every way of a kind (`ducter tailscale --remove`); returns the ones it removed. */
export function removeKind(dataDir: string, kind: WayKind, o: { tunnelHost?: string } = {}): string[] {
  const gone = readWays(dataDir, { env: {}, ...o }).filter((w) => w.kind === kind).map((w) => w.url);
  for (const u of gone) removeWay(dataDir, u);
  return gone;
}

/** The book itself has this address (added by a command from D293 on, not only a public-url from before). */
export const bookHas = (dataDir: string, url: string) => readEntries(dataDir).some((e) => same(e.url, url));

/** Makes one way the primary. False when the book doesn't have it. */
export function setPrimary(dataDir: string, url: string): boolean {
  const w = readWays(dataDir, { env: {} }).find((x) => same(x.url, url));
  if (!w) return false;
  writeFileSync(publicPath(dataDir), `${w.url}\n`);
  return true;
}

/** A cheap "did it change" for the running home: the two files' sizes and times. */
export function bookStamp(dataDir: string): string {
  const s = (p: string) => {
    try {
      const st = statSync(p);
      return `${st.size}:${st.mtimeMs}`;
    } catch {
      return "-";
    }
  };
  return `${s(bookPath(dataDir))}|${s(publicPath(dataDir))}`;
}

// ---------- how a request reached the home ----------

const LOOP = /^(127\.\d+\.\d+\.\d+|localhost|\[?::1\]?|::ffff:127\.\d+\.\d+\.\d+)$/i;
const hostOnly = (h: string) => h.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();

/**
 * Which way a request came in by, read from the request itself: its Host against the book,
 * then what the helper in front says (Tailscale serve's Tailscale-User-Login, Cloudflare's
 * CF-Connecting-IP). Cloudflare's edge opens the traffic, so through it nothing is sealed; plain
 * http over a network isn't either.
 */
export function viaOf(req: Request, peer: string | undefined, ways: readonly ReachWay[]): DeviceVia & { url?: string } {
  const h = req.headers;
  const host = hostOnly(h.get("host") ?? "");
  const cf = h.has("cf-connecting-ip") || h.has("cf-ray");
  const forwarded = cf || h.has("x-forwarded-for") || h.has("forwarded") || h.has("tailscale-user-login") || h.has("x-forwarded-proto");
  if (!forwarded && LOOP.test(host) && (!peer || LOOP.test(peer))) return { kind: "local", sealed: true };
  const way = ways.find((w) => {
    try {
      return new URL(w.url).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  });
  const https = (h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")).toLowerCase().startsWith("https");
  if (way) return { kind: way.kind, sealed: way.kind !== "tunnel" && !cf && (https || way.kind === "tailnet"), url: way.url };
  if (h.has("tailscale-user-login") || /\.ts\.net$/.test(host)) return { kind: "tailnet", sealed: true };
  if (cf) return { kind: "domain", sealed: false };
  if (forwarded) return { kind: "domain", sealed: https };
  return { kind: "lan", sealed: https };
}

// ---------- the running home's view ----------

export interface ReachWatch {
  /** The ways with their state, the primary flagged. */
  ways(): ReachWay[];
  /** Runs fn when the list or a state changes. */
  onChange(fn: () => void): () => void;
  /** A device came or went: the ways it used may be up now. */
  refresh(): void;
  /** Test seam: read the book again and check every way now. */
  tick(): Promise<void>;
  stop(): void;
}

/**
 * The book as the running home holds it: read again every `readMs` (the CLI writes it from another
 * process), each way checked from the home itself every `checkMs` (and when it is added). A way a
 * device is connected through now is up whatever the home's own check says: a ts.net name often
 * doesn't resolve on the machine that serves it (D265).
 */
export function createReach(o: {
  dataDir: string;
  env?: Record<string, string | undefined>;
  tunnelHost?: () => string | undefined;
  /** Proves the home answers at this base (proveHome with the home's own fingerprint). */
  check?: (url: string) => Promise<boolean>;
  /** The urls devices are connected through now. */
  inUse?: () => Set<string>;
  now?: () => Date;
  readMs?: number;
  checkMs?: number;
}): ReachWatch {
  const now = o.now ?? (() => new Date());
  const read = () => readWays(o.dataDir, { ...(o.env ? { env: o.env } : {}), ...(o.tunnelHost?.() ? { tunnelHost: o.tunnelHost()! } : {}) });
  let list = read();
  let stamp = bookStamp(o.dataDir);
  const checked = new Map<string, { ok: boolean; at: string }>();
  const fns = new Set<() => void>();
  let last = "";
  const view = (): ReachWay[] => {
    const used = o.inUse?.() ?? new Set<string>();
    return list.map((w) => {
      const c = checked.get(w.url);
      const state: WayState = [...used].some((u) => same(u, w.url)) ? "up" : c ? (c.ok ? "up" : "down") : "unknown";
      return { ...w, state, ...(c ? { checkedAt: c.at } : {}) };
    });
  };
  const emit = () => {
    const s = JSON.stringify(view().map((w) => [w.kind, w.url, w.primary, w.state]));
    if (s === last) return;
    last = s;
    for (const fn of fns) fn();
  };
  last = JSON.stringify(view().map((w) => [w.kind, w.url, w.primary, w.state]));
  let checking = false;
  const checkAll = async (only?: string[]) => {
    if (!o.check || checking) return;
    checking = true;
    try {
      await Promise.all(
        list
          .filter((w) => !only || only.includes(w.url))
          .map(async (w) => {
            const ok = await o.check!(w.url).catch(() => false);
            checked.set(w.url, { ok, at: now().toISOString() });
          }),
      );
    } finally {
      checking = false;
    }
    emit();
  };
  const reread = () => {
    const s = bookStamp(o.dataDir);
    if (s === stamp) return [];
    stamp = s;
    const before = new Set(list.map((w) => w.url));
    list = read();
    for (const k of [...checked.keys()]) if (!list.some((w) => w.url === k)) checked.delete(k);
    emit();
    return list.filter((w) => !before.has(w.url)).map((w) => w.url);
  };
  const readTimer = setInterval(() => {
    const fresh = reread();
    if (fresh.length) void checkAll(fresh);
  }, o.readMs ?? 5000);
  const checkTimer = setInterval(() => void checkAll(), o.checkMs ?? 5 * 60_000);
  (readTimer as any).unref?.();
  (checkTimer as any).unref?.();
  // The first look a little after start: the home is listening by then.
  const first = setTimeout(() => void checkAll(), 3000);
  (first as any).unref?.();
  return {
    ways: view,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    refresh: () => emit(),
    async tick() {
      reread();
      await checkAll();
      emit();
    },
    stop() {
      clearInterval(readTimer);
      clearInterval(checkTimer);
      clearTimeout(first);
    },
  };
}
