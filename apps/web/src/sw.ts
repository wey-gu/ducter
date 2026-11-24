// The service worker: shows pushes, opens the app at the item on tap, and on Android answers
// Go / Hold straight from the notification (POST api/decide). iOS shows no action buttons on web
// push (D52 Q11), so a tap there always opens the decision. It also keeps the fonts and the clay
// art on the phone (cache first): they are stable, and the rounded CJK face is 0.7 MB.
import { kvGet } from "./idb.ts";

declare const self: any;

interface Msg {
  title: string;
  body: string;
  tag: string;
  url: string;
  decisionId?: string;
  actions?: { action: string; title: string }[];
}

const scope = () => new URL(self.registration.scope as string);

// Bump when a font or art file changes under the same name.
const ASSETS = "ducter-assets-v1";
const STABLE = /\/app\/(fonts\/[\w.-]+\.woff2|bricolage\.woff|art\/[\w.-]+\.webp|icon-\d+\.png|apple-touch-icon\.png)$/;

// D543: the app shell, so a browser (or an app added to the Home Screen) opens Ducter with the link
// down and shows the last screen it kept, as the iPhone and Android apps do from their own cache
// (D209). The page itself is network-first: whenever the home answers within SHELL_WAIT_MS the
// newest page is shown and kept, so an update always lands on the next open at the latest. Only
// with no answer does the kept page open. Its code and styles are named by content (app.js?v=…,
// D209): cache-first, and every version the newest page no longer names is dropped from the cache.
// Nothing under /api/ or /ws is touched: the network, always.
const SHELL = "ducter-shell-v1";
const SHELL_WAIT_MS = 3_000;
const PAGE = /^\/(app\/?|pair)?$/;
const NAMED = /\/app\/app\.(js|css)$/;

/** The page's own named code and styles (app/app.js?v=…), as the page names them. */
const namedIn = (html: string) => [...html.matchAll(/(?:src|href)="(app\/app\.(?:js|css)\?v=\w+)"/g)].map((m) => new URL(m[1]!, scope()).href);

/** Keeps a fresh page and what it names, and lets go of the code no page names any more. */
async function keepPage(res: Response) {
  const html = await res.clone().text();
  const c = await caches.open(SHELL);
  // With the home's own headers (its CSP above all): a page opened offline is held to the same rules.
  await c.put(new URL("app", scope()).href, new Response(html, { headers: res.headers }));
  const want = new Set(namedIn(html));
  for (const u of want) if (!(await c.match(u))) await fetch(u).then((r) => (r.ok ? c.put(u, r) : undefined)).catch(() => {});
  for (const k of await c.keys()) if (NAMED.test(new URL(k.url).pathname) && !want.has(k.url)) await c.delete(k);
}

self.addEventListener("install", (e: any) => {
  self.skipWaiting();
  // The shell is kept from the first visit on, not only from the second.
  e.waitUntil(
    fetch(new URL("app", scope()).href, { cache: "no-cache" })
      .then((r) => (r.ok ? keepPage(r) : undefined))
      .catch(() => {}),
  );
});
self.addEventListener("activate", (e: any) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith("ducter-assets-") && k !== ASSETS) || (k.startsWith("ducter-shell-") && k !== SHELL)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

/** The page: the network's when it answers in time (and kept), else the kept one, else the network's error. */
function page(e: any, req: Request): Promise<Response> {
  const net = fetch(req);
  e.waitUntil(
    net
      .then((r) => (r.ok && r.status === 200 ? keepPage(r) : undefined))
      .catch(() => {}),
  );
  const kept = () => caches.open(SHELL).then((c) => c.match(new URL("app", scope()).href));
  return new Promise((resolve, reject) => {
    let done = false;
    const fallback = async () => {
      if (done) return;
      const k = await kept();
      if (k && !done) (done = true), resolve(k);
      return !!k;
    };
    const timer = setTimeout(() => void fallback(), SHELL_WAIT_MS);
    net.then(
      (r) => {
        clearTimeout(timer);
        if (!done) (done = true), resolve(r);
      },
      async () => {
        clearTimeout(timer);
        if (!(await fallback()) && !done) (done = true), reject(new Error("offline, and no page kept"));
      },
    );
  });
}

self.addEventListener("fetch", (e: any) => {
  const req = e.request as Request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== scope().origin) return;
  const path = url.pathname.slice(new URL(scope()).pathname.length - 1);
  if (req.mode === "navigate" && PAGE.test(path)) return e.respondWith(page(e, req));
  if (NAMED.test(url.pathname) && url.searchParams.has("v")) {
    // Named by content: what is kept is what was asked for.
    return e.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.status === 200) await c.put(req, res.clone());
        return res;
      }),
    );
  }
  if (!STABLE.test(url.pathname)) return;
  e.respondWith(
    caches.open(ASSETS).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) await c.put(req, res.clone());
      return res;
    }),
  );
});

self.addEventListener("push", (e: any) => {
  let m: Msg;
  try {
    m = e.data.json();
  } catch {
    m = { title: "Ducter", body: e.data?.text?.() ?? "", tag: "ducter", url: "app" };
  }
  e.waitUntil(
    self.registration.showNotification(m.title, {
      body: m.body,
      tag: m.tag,
      renotify: false,
      icon: new URL("app/icon-192.png", scope()).href,
      badge: new URL("app/icon-192.png", scope()).href,
      data: { url: m.url, decisionId: m.decisionId },
      actions: m.actions ?? [],
    }),
  );
});

async function decide(decisionId: string, option: string): Promise<boolean> {
  const token = await kvGet<string>("token");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const r = await fetch(new URL("api/decide", scope()), { method: "POST", headers, body: JSON.stringify({ decisionId, option }) });
    return r.ok;
  } catch {
    return false;
  }
}

async function openAt(url: string) {
  const target = new URL(url, scope()).href;
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const w of wins) {
    if (new URL(w.url).origin === new URL(target).origin) {
      w.postMessage({ t: "open", url: target });
      return w.focus();
    }
  }
  return self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (e: any) => {
  const n = e.notification;
  n.close();
  const { url, decisionId } = n.data ?? {};
  if ((e.action === "go" || e.action === "hold") && decisionId) {
    // Answered from the lock screen; if that fails, open the decision instead of losing it.
    e.waitUntil(decide(decisionId, e.action).then((ok: boolean) => (ok ? undefined : openAt(url ?? "app"))));
    return;
  }
  e.waitUntil(openAt(url ?? "app"));
});
