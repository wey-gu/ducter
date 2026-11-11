// D214: 预览 / Preview, a page a task serves (a dev server on the task's computer), shown in the
// opened task's workbench. Each previewed page gets an address of its own: a port of this home,
// opened on the same interface as the home itself, so the page runs in an origin of its own (its
// storage and scripts never touch Ducter's page) and keeps its absolute paths and its hot reload.
// The home forwards to the page where it runs: this machine's loopback, or the task's worker
// through its socket (no websockets there yet). Nothing is public: the first request carries the
// preview's token, given only to an authenticated client, exchanged for a cookie of this port; any
// request without it is refused. Ducter itself has no cookies to leak (its device token is a
// header), and its page lets only this host's ports be framed.
import { randomBytes } from "node:crypto";
import type { Server, ServerWebSocket } from "bun";
import type { Runner } from "@ducter/protocol/src/internal.ts";

type Route = NonNullable<ReturnType<NonNullable<Runner["pageRoute"]>>>;

interface Entry {
  key: string;
  taskId: string;
  port: number;
  token: string;
  server: Server<WsData>;
  /** The cookie this port answers to (cookies don't keep ports apart, so its name does). */
  cookie: string;
  usedAt: number;
}

interface WsData {
  url: string;
  protocols: string[];
  headers: Record<string, string>;
  upstream?: WebSocket;
  queue: (string | ArrayBuffer | Uint8Array)[];
}

export interface Previews {
  /** An address for this task's page on `port` (reused while it is in use). */
  open(taskId: string, port: number): { previewPort: number; token: string };
  /** Every preview of a task (it finished, was archived) or all of them. */
  close(taskId?: string): void;
  /** Open previews (tests). */
  list(): { taskId: string; port: number; previewPort: number }[];
}

const IDLE_MS = 30 * 60_000;
/** Request headers that never go to the page: the hop's own, and this preview's cookie. */
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host", "content-length"]);

const refuse = (status: number, text: string) => new Response(`<!doctype html><meta charset="utf-8"><title>Ducter</title><body style="font:15px system-ui;margin:3rem;color:#555">${text}</body>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

function cookieOf(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
}

/** The request's headers for the page: the cookie that let it in taken out, Host and Origin as the page expects. */
export function forwardHeaders(req: Request, cookie: string, port: number): [string, string][] {
  const out: [string, string][] = [];
  req.headers.forEach((v, k) => {
    if (HOP.has(k)) return;
    if (k === "cookie") {
      const rest = v.split(/;\s*/).filter((c) => !c.startsWith(cookie + "=")).join("; ");
      if (rest) out.push([k, rest]);
      return;
    }
    if (k === "origin") return void out.push([k, `http://localhost:${port}`]);
    if (k === "referer") {
      try {
        const u = new URL(v);
        return void out.push([k, `http://localhost:${port}${u.pathname}${u.search}`]);
      } catch {
        return;
      }
    }
    out.push([k, v]);
  });
  out.push(["host", `localhost:${port}`]);
  return out;
}

/** The page's answer as the preview gives it: its own redirects kept on this address, framing allowed here. */
export function backHeaders(h: Iterable<[string, string]>, port: number): Headers {
  const out = new Headers();
  for (const [k, v] of h) {
    const key = k.toLowerCase();
    if (key === "x-frame-options" || key === "content-length" || key === "content-encoding" || key === "transfer-encoding" || key === "connection") continue;
    if (key === "location") {
      out.set(k, v.replace(new RegExp(`^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${port}`, "i"), "") || "/");
      continue;
    }
    if (key === "set-cookie") out.append(k, v);
    else out.set(k, v);
  }
  return out;
}

const loopbacks = new Map<number, string>();
/** Which loopback address a page on this machine answers on (127.0.0.1, else [::1]), remembered. */
export async function loopbackOf(port: number): Promise<string> {
  const known = loopbacks.get(port);
  if (known) return known;
  for (const h of ["127.0.0.1", "[::1]"]) {
    try {
      const r = await fetch(`http://${h}:${port}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(1200) });
      await r.body?.cancel();
      loopbacks.set(port, h);
      return h;
    } catch {}
  }
  return "127.0.0.1";
}

export function createPreviews(o: {
  hostname: string;
  route: (taskId: string) => Route | undefined;
  /** Where a page on this machine answers (127.0.0.1 or [::1]). */
  loopback: (port: number) => Promise<string>;
  now?: () => number;
  idleMs?: number;
}): Previews {
  const now = o.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const idleMs = o.idleMs ?? IDLE_MS;
  const sweep = setInterval(() => {
    for (const e of [...entries.values()]) if (now() - e.usedAt > idleMs) stop(e);
  }, 60_000);
  (sweep as { unref?: () => void }).unref?.();

  function stop(e: Entry) {
    entries.delete(e.key);
    e.server.stop(true);
  }

  async function forward(e: Entry, req: Request): Promise<Response> {
    const route = o.route(e.taskId);
    if (!route) return refuse(410, "This task isn't here any more.");
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    const headers = forwardHeaders(req, e.cookie, e.port);
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    try {
      if (route.here) {
        const host = await o.loopback(e.port);
        const r = await fetch(`http://${host}:${e.port}${path}`, { method: req.method, headers, redirect: "manual", ...(hasBody ? { body: await req.arrayBuffer() } : {}), decompress: true } as RequestInit);
        const h: [string, string][] = [];
        r.headers.forEach((v, k) => void (k !== "set-cookie" && h.push([k, v])));
        for (const c of r.headers.getSetCookie?.() ?? []) h.push(["set-cookie", c]);
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers: backHeaders(h, e.port) });
      }
      const body = hasBody ? Buffer.from(await req.arrayBuffer()).toString("base64") : undefined;
      const r = await route.fetch({ port: e.port, method: req.method, path, headers, ...(body ? { body } : {}) });
      return new Response(r.status === 204 || r.status === 304 ? null : Buffer.from(r.body, "base64"), { status: r.status, headers: backHeaders(r.headers, e.port) });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      return refuse(502, code === "offline" ? "The computer this page runs on isn't connected right now." : "The page didn't answer. Is it still running?");
    }
  }

  function serve(taskId: string, port: number): Entry {
    const token = randomBytes(24).toString("base64url");
    let entry!: Entry;
    const server = Bun.serve<WsData, never>({
      hostname: o.hostname,
      port: 0,
      idleTimeout: 120,
      async fetch(req, srv) {
        const url = new URL(req.url);
        entry.usedAt = now();
        // Whether this address can be reached from where the client is (it asks before framing).
        if (url.pathname === "/__ducter/ping") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
        const enter = /^\/__ducter\/enter\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
        if (enter) {
          if (enter[1] !== entry.token) return refuse(403, "This preview link isn't valid any more. Open it again from the task in Ducter.");
          const to = url.searchParams.get("to") ?? "/";
          const safe = to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") ? to : "/";
          return new Response(null, { status: 302, headers: { location: safe, "set-cookie": `${entry.cookie}=${entry.token}; Path=/; HttpOnly; SameSite=Lax`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
        }
        if (cookieOf(req, entry.cookie) !== entry.token) return refuse(403, "Open this preview from the task in Ducter.");
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const route = o.route(entry.taskId);
          // A worker's page has no websocket through the home yet: its hot reload falls back to reloading (the client does).
          if (!route?.here) return new Response("websockets aren't carried to this computer yet", { status: 501 });
          const host = await o.loopback(entry.port);
          const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const headers: Record<string, string> = { origin: `http://localhost:${entry.port}`, host: `localhost:${entry.port}` };
          const rest = forwardHeaders(req, entry.cookie, entry.port).find(([k]) => k === "cookie");
          if (rest) headers.cookie = rest[1];
          const ok = srv.upgrade(req, { data: { url: `ws://${host}:${entry.port}${url.pathname}${url.search}`, protocols, headers, queue: [] }, ...(protocols[0] ? { headers: { "sec-websocket-protocol": protocols[0] } } : {}) });
          return ok ? undefined : new Response("upgrade failed", { status: 400 });
        }
        return forward(entry, req);
      },
      websocket: {
        open(ws: ServerWebSocket<WsData>) {
          const d = ws.data;
          const up = new WebSocket(d.url, { protocols: d.protocols, headers: d.headers } as unknown as string[]);
          up.binaryType = "arraybuffer";
          d.upstream = up;
          up.onopen = () => {
            for (const m of d.queue.splice(0)) up.send(m);
          };
          up.onmessage = (m) => ws.send(m.data as string | ArrayBuffer);
          up.onclose = (c) => ws.close(c.code === 1005 || c.code === 1006 ? 1000 : c.code, c.reason);
          up.onerror = () => ws.close(1011, "the page's socket failed");
        },
        message(ws: ServerWebSocket<WsData>, msg) {
          const up = ws.data.upstream;
          if (up?.readyState === WebSocket.OPEN) up.send(msg);
          else ws.data.queue.push(msg);
        },
        close(ws: ServerWebSocket<WsData>) {
          try {
            ws.data.upstream?.close();
          } catch {}
        },
      },
    });
    entry = { key: `${taskId}:${port}`, taskId, port, token, server, cookie: `__ducter_preview_${server.port}`, usedAt: now() };
    return entry;
  }

  return {
    open(taskId, port) {
      const key = `${taskId}:${port}`;
      const e = entries.get(key) ?? serve(taskId, port);
      entries.set(key, e);
      e.usedAt = now();
      return { previewPort: e.server.port!, token: e.token };
    },
    close(taskId) {
      for (const e of [...entries.values()]) if (!taskId || e.taskId === taskId) stop(e);
      if (!taskId) clearInterval(sweep);
    },
    list: () => [...entries.values()].map((e) => ({ taskId: e.taskId, port: e.port, previewPort: e.server.port! })),
  };
}
