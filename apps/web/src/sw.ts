// The service worker: shows pushes, opens the app at the item on tap, and on Android answers
// Go / Hold straight from the notification (POST api/decide). iOS shows no action buttons on web
// push (D52 Q11), so a tap there always opens the decision. It also keeps the fonts and the clay
// art on the phone (cache first): they are stable, and the rounded CJK face is 0.7 MB.
import { kvGet } from "./idb.ts";
import { lookupAddress, moveTarget, type MovePayload } from "@ducter/protocol/src/follow.ts";
import { answers, moveLink } from "./follow-client.ts";

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
const STABLE = /\/app\/(fonts\/[\w.-]+\.woff2|bricolage\.woff|art\/[\w.-]+\.webp)$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e: any) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ducter-assets-") && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

/**
 * D228: the page itself, when this address no longer leads to the home (its free tunnel got a new
 * address when the home's computer restarted: Cloudflare answers 530, or nothing answers). Ask the
 * relay where the home is now and send this device there, still paired; otherwise what came back.
 */
async function openPage(req: Request): Promise<Response> {
  let res: Response | undefined;
  try {
    res = await fetch(req);
    if (res.status < 500) return res;
  } catch {}
  const m = await kvGet<MovePayload>("move");
  if (m?.follow) {
    const note = await lookupAddress(m.follow);
    const to = moveTarget(scope().origin, note, m.at ?? 0);
    if (to && note && (await answers(to))) return Response.redirect(moveLink(to, m, m.follow, note.at), 302);
  }
  return res ?? Response.error();
}

self.addEventListener("fetch", (e: any) => {
  const req = e.request as Request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === scope().origin && /\/(app\/?|pair)?$/.test(url.pathname)) return e.respondWith(openPage(req));
  if (url.origin !== scope().origin || !STABLE.test(url.pathname)) return;
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
