// D393: Nowledge Mem carried to every task from the home's one connection (design/memory.md
// "Mem carried to every task", research/159).
//
// A task on another computer, or in a sandbox there, gets Mem with nothing set up on that
// computer: its nmem (and Mem's own plugin, its hooks and skills) is pointed at this relay on the
// home by two variables, NMEM_API_URL (`<home>/mem`) and NMEM_API_KEY (a task key minted here).
// nmem sends that key as `Authorization: Bearer`, as it would Mem's own (research/21: Mem takes
// `Authorization: Bearer` or `X-NMEM-API-Key`); the relay checks it, swaps in the home's real
// credential, and forwards to the home's Mem. So:
//   - no Mem secret ever leaves the home (the task key opens only this relay, for one task);
//   - the key dies with the task (archived, dropped, memory off, Mem disconnected) or after 30 days;
//   - the plugin, its hooks (Context Bundle at start, the thread at the end), its skills and
//     Bridge work unchanged, because nmem is talking to "Mem".
// Mem's plugin itself is carried too: the home's copy of it (the one its own Claude Code runs),
// served as a zip at `<home>/mem/kit/<key>/<agent>.zip` for Claude Code's `--plugin-url` (session
// only, nothing installed there). The plugin is Mem's public open-source plugin; the key in the
// path only keeps the route closed to strangers.
//
// Read-only on the person's Mem config: the credential is read from Mem's own credential home
// (`$NMEM_CLI_CONFIG_DIR/config.json`, else `~/.nowledge-mem/config.json`; `NMEM_API_URL`/
// `NMEM_API_KEY` in Ducter's env win, as they do for nmem). Never written, never logged, never sent
// to a task. Requests and answers are never logged; only that a task used the relay.
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

/** Mem's own local server when nothing else is configured (nmem's default). */
export const MEM_LOCAL_DEFAULT = "http://127.0.0.1:14242";
/** A task key lives at most this long (a task alive longer gets a new one on its next start). */
export const TASK_KEY_MS = 30 * 24 * 3600_000;

export interface MemCredential {
  url: string;
  key?: string;
}

/** The home's Mem connection as nmem itself resolves it (env over the credential home), or undefined. */
export function readMemCredential(env: Record<string, string | undefined> = process.env, home = homedir()): MemCredential | undefined {
  let url = env.NMEM_API_URL?.trim();
  let key = env.NMEM_API_KEY?.trim();
  if (!url || !key) {
    const dir = env.NMEM_CLI_CONFIG_DIR?.trim() || join(home, ".nowledge-mem");
    try {
      const j = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")) as { apiUrl?: unknown; apiKey?: unknown };
      if (!url && typeof j.apiUrl === "string" && j.apiUrl.trim()) url = j.apiUrl.trim();
      if (!key && typeof j.apiKey === "string" && j.apiKey.trim()) key = j.apiKey.trim();
    } catch {
      /* no credential home: Mem's own default below */
    }
  }
  url ||= MEM_LOCAL_DEFAULT;
  if (!/^https?:\/\//.test(url)) return undefined;
  return { url: url.replace(/\/+$/, ""), ...(key ? { key } : {}) };
}

/**
 * What a task's key may reach: Mem's data, by the first part of the path, as nmem and Mem's plugin
 * call it (read from the paths in nmem 0.10.121's binary and seen live: /health, /capabilities,
 * /agent/feed, /threads, /memories, /context; research/159). Anything else (Mem's settings, its
 * keys, Access Anywhere, licence, models, team, export and import, plugins) is refused, and so are
 * the agent routes that start Mem's own jobs, and every DELETE. A leading /api is the same path.
 */
const DATA = new Set(["health", "capabilities", "memories", "threads", "context", "agent", "agents", "agent-profiles", "agent-sessions", "agent_context", "spaces", "rules", "feed", "fs", "resources", "search", "search-index", "artifacts", "skills", "entities", "labels", "communities", "graph", "wiki", "ask", "mailbox", "bridge", "collaboration", "working-memory"]);
const AGENT_JOBS = /^\/agent\/(trigger|tools|skill-builder|ontology-builder|ai-now)(\/|$)/;
export function dataPath(rest: string): boolean {
  const p = rest.replace(/^\/api(?=\/)/, "");
  if (p.includes("..") || AGENT_JOBS.test(p)) return false;
  return DATA.has(p.split("/")[1] ?? "");
}
/** A task's calls: a burst of this many, then this many a second (the plugin makes ~5 at a start). */
export const RATE = { burst: 60, perSec: 10 } as const;

/** Headers a client sends that never go on to Mem (its key is the home's, its address Mem's). */
const DROP_IN = new Set(["authorization", "x-nmem-api-key", "host", "cookie", "connection", "content-length", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "x-ducter-device"]);
const DROP_OUT = new Set(["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection"]);

export interface MemRelayOptions {
  secret: string;
  /** The home's Mem credential now (read per request: a sign-in on the home takes effect at once). */
  credential: () => MemCredential | undefined;
  /** Memory on and Mem connected on the home. */
  on: () => boolean;
  /** The task is still alive (known, not archived or dropped): its key dies with it. */
  taskLive: (taskId: string) => boolean;
  /** Mem's plugin for an agent, as a folder on the home (the copy its own agent runs); undefined: none. */
  kitDir?: (harness: string) => string | undefined;
  fetch?: typeof fetch;
  now?: () => number;
  /** A task used the relay (once per task per start; never what it asked). */
  used?: (taskId: string) => void;
}

export interface MemRelay {
  /** A task's key: `dmr.<payload>.<mac>`, opens only the relay, for this task, until it ends. */
  keyFor(taskId: string): string;
  /** The task a key is for, if it is valid now (signature, age, the task alive, memory on). */
  verify(key: string): string | undefined;
  /** The env for a task elsewhere; base = the home's loopback origin (a worker rewrites it to the home's address). */
  envFor(taskId: string, base: string): Record<string, string> | undefined;
  kitFor(taskId: string, harness: string, base: string): string[];
  /** `/mem/...` requests. undefined: not a relay path. */
  handle(req: Request): Promise<Response | undefined>;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");

/** Which agents' plugins the home can carry: Claude Code, whose `--plugin-url` loads one for a session (research/159). */
const KIT_AGENTS = new Set(["claude-code"]);

export function createMemRelay(o: MemRelayOptions): MemRelay {
  const now = o.now ?? Date.now;
  const f = o.fetch ?? fetch;
  const mac = (p: string) => createHmac("sha256", o.secret).update(`mem-relay\n${p}`).digest("base64url");
  const told = new Set<string>();
  // Per task: a token bucket (RATE), so one runaway task can't flood the person's Mem through the home.
  const buckets = new Map<string, { n: number; at: number }>();
  const take = (taskId: string) => {
    const t = now();
    const b = buckets.get(taskId) ?? { n: RATE.burst, at: t };
    b.n = Math.min(RATE.burst, b.n + ((t - b.at) / 1000) * RATE.perSec);
    b.at = t;
    buckets.set(taskId, b);
    if (b.n < 1) return false;
    b.n -= 1;
    return true;
  };
  const kits = new Map<string, { at: string; zip: Uint8Array }>();

  const keyFor = (taskId: string) => {
    const payload = JSON.stringify({ t: taskId, x: now() + TASK_KEY_MS });
    return `dmr.${b64(payload)}.${mac(payload)}`;
  };
  const verify = (key: string): string | undefined => {
    const [p, enc, sig] = key.split(".");
    if (p !== "dmr" || !enc || !sig) return;
    const payload = Buffer.from(enc, "base64url").toString();
    const want = Buffer.from(mac(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return;
    let j: { t?: unknown; x?: unknown };
    try {
      j = JSON.parse(payload);
    } catch {
      return;
    }
    if (typeof j.t !== "string" || typeof j.x !== "number" || j.x < now()) return;
    if (!o.on() || !o.taskLive(j.t)) return;
    return j.t;
  };
  const keyOf = (req: Request) => {
    const a = req.headers.get("authorization") ?? "";
    if (a.startsWith("Bearer ")) return a.slice(7).trim();
    return req.headers.get("x-nmem-api-key")?.trim() || undefined;
  };
  const deny = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

  const kitZip = (harness: string): Uint8Array | undefined => {
    const dir = o.kitDir?.(harness);
    if (!dir || !existsSync(dir)) return undefined;
    // One zip per version folder (its mtime): Mem updating its plugin on the home makes a new one.
    let at: string;
    try {
      at = `${dir}@${statSync(dir).mtimeMs}`;
    } catch {
      return undefined;
    }
    const had = kits.get(harness);
    if (had?.at === at) return had.zip;
    const zip = zipFolder(dir);
    kits.set(harness, { at, zip });
    return zip;
  };

  return {
    keyFor,
    verify,
    envFor(taskId, base) {
      if (!o.on() || !o.credential()) return undefined;
      return { NMEM_API_URL: `${base.replace(/\/+$/, "")}/mem`, NMEM_API_KEY: keyFor(taskId) };
    },
    kitFor(taskId, harness, base) {
      if (!o.on() || !KIT_AGENTS.has(harness) || !o.kitDir?.(harness)) return [];
      return [`${base.replace(/\/+$/, "")}/mem/kit/${keyFor(taskId)}/${harness}.zip`];
    },
    async handle(req) {
      const url = new URL(req.url);
      if (url.pathname !== "/mem" && !url.pathname.startsWith("/mem/")) return undefined;
      // The plugin's copy: the key rides in the path (Claude Code fetches it with no headers).
      const kit = /^\/mem\/kit\/(dmr\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/([a-z-]+)\.zip$/.exec(url.pathname);
      if (kit) {
        if (req.method !== "GET") return deny(405, "method");
        if (!verify(kit[1]!)) return deny(401, "unauthorized");
        const zip = kitZip(kit[2]!);
        if (!zip) return deny(404, "no plugin here");
        return new Response(zip, { headers: { "content-type": "application/zip", "cache-control": "no-store" } });
      }
      const key = keyOf(req);
      const taskId = key ? verify(key) : undefined;
      if (!taskId) return deny(401, "unauthorized");
      const rest = url.pathname.slice(4) || "/";
      if (req.method === "DELETE" || !dataPath(rest)) return deny(403, "not for tasks");
      if (!take(taskId)) return deny(429, "slow down");
      const cred = o.credential();
      if (!cred) return deny(503, "Mem isn't connected on the home");
      if (!told.has(taskId)) {
        told.add(taskId);
        o.used?.(taskId);
      }
      const headers = new Headers();
      for (const [k, v] of req.headers) if (!DROP_IN.has(k.toLowerCase())) headers.set(k, v);
      if (cred.key) headers.set("authorization", `Bearer ${cred.key}`);
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
      let res: Response;
      try {
        res = await f(cred.url + rest + url.search, { method: req.method, headers, ...(body ? { body } : {}), redirect: "manual" });
      } catch {
        return deny(502, "Mem didn't answer");
      }
      const out = new Headers();
      for (const [k, v] of res.headers) if (!DROP_OUT.has(k.toLowerCase())) out.set(k, v);
      return new Response(res.body ? await res.arrayBuffer() : null, { status: res.status, headers: out });
    },
  };
}

/**
 * The folder of Mem's Claude Code plugin the home runs: the newest version in Claude Code's own
 * plugin cache (read-only; never changed). undefined when the home's Claude Code has none.
 */
export function homeClaudeMemPlugin(home = homedir()): string | undefined {
  return newestPlugin(join(home, ".claude", "plugins", "cache", "nowledge-community", "nowledge-mem"), ".claude-plugin");
}

function newestPlugin(root: string, manifestDir: string): string | undefined {
  let vs: string[];
  try {
    vs = readdirSync(root).filter((v) => /^\d+(\.\d+)*$/.test(v) && existsSync(join(root, v, manifestDir, "plugin.json")));
  } catch {
    return undefined;
  }
  const cmp = (a: string, b: string) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  const v = vs.sort(cmp).pop();
  return v ? join(root, v) : undefined;
}

// ---------- a stored (uncompressed) zip of a folder ----------

/** Files of a plugin worth carrying: not its tests, caches or VCS folders, nothing over 2 MB. */
const SKIP = /(^|\/)(tests?|__pycache__|\.git|node_modules)(\/|$)|\.pyc$/;

/** A zip (method 0, stored) of every file under dir, paths relative to it. Small plugin folders only. */
export function zipFolder(dir: string): Uint8Array {
  const files: { name: string; data: Uint8Array }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const rel = relative(dir, p).split("\\").join("/");
      if (SKIP.test(rel)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && statSync(p).size <= 2 * 1024 * 1024) files.push({ name: rel, data: new Uint8Array(readFileSync(p)) });
    }
  };
  walk(dir);
  files.sort((a, b) => a.name.localeCompare(b.name));
  return storeZip(files);
}

export function storeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = Bun.hash.crc32(f.data) >>> 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 0x0314, true); // made by: unix
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(38, (0o100644 << 16) >>> 0, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) out.set(p, at), (at += p.length);
  return out;
}
