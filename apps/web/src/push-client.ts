// Web Push on the phone: register the service worker, ask once, subscribe, and tell core.
import type { Api } from "./conn.ts";
import { deviceName } from "./conn.ts";

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

export const isIOS = (ua = navigator.userAgent) => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerWorker(base: URL): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator) || !isSecureContext) return;
  try {
    return await navigator.serviceWorker.register(new URL("sw.js", base), { scope: base.pathname });
  } catch (err) {
    console.warn("[ducter] service worker:", err);
  }
}

export async function pushState(): Promise<PushState> {
  // iOS Safari has web push only for an app added to the Home Screen (iOS 16.4+).
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

const keyBytes = (b64u: string) => {
  const s = atob(b64u.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64u.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export const localQuiet = (start = "23:00", end = "08:00") => ({ start, end, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });

/** Asks for permission (must run from a tap), subscribes, and registers with core. */
export async function enablePush(api: Api, base: URL, locale: "zh" | "en", publicKey: string): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = (await registerWorker(base)) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const r = await api.call("api/push/subscribe", { method: "POST", body: { subscription: sub.toJSON(), locale, platform: deviceName().platform, quiet: localQuiet() } });
  return r.status === 200 ? "on" : "off";
}

export async function disablePush(api: Api): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.call("api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
  return "off";
}
