// The service worker: shows pushes, opens the app at the item on tap, and on Android answers
// Go / Hold straight from the notification (POST api/decide). iOS shows no action buttons on web
// push (D52 Q11), so a tap there always opens the decision.
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

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e: any) => e.waitUntil(self.clients.claim()));

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
