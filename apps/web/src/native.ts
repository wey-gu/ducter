// The Ducter apps host this client in a web view and add what a page can't do well. The iPhone app
// (apps/ios, WKWebView: webkit.messageHandlers.ducter): APNs notifications with Go / Hold on them,
// haptics, and the device token kept in the Keychain so those buttons work without opening the
// app. The Android app (apps/android, D178: window.ducterBridge over a WebMessageListener limited
// to this Ducter's origin): haptics, the fold (fold.ts) and its own updates; no notifications yet.
// In a browser all of this is absent and every function here does nothing.

export interface NativeInfo {
  platform: "ios" | "android";
  version: string;
  bundleId?: string; // iOS: the APNs topic
  apnsEnv?: "sandbox" | "production";
  appId?: string; // Android: the application id
}

type Bridge = { postMessage(m: unknown): Promise<unknown> };
const g = globalThis as unknown as { ducterNative?: NativeInfo; ducterBridge?: Bridge; webkit?: { messageHandlers?: { ducter?: Bridge } } };
const bridge = (): Bridge | undefined => g.webkit?.messageHandlers?.ducter ?? g.ducterBridge;

export const nativeInfo = (): NativeInfo | undefined => (g.ducterNative && bridge() ? g.ducterNative : undefined);
export const inApp = () => !!nativeInfo();

export async function nativeCall<T>(m: { t: string } & Record<string, unknown>): Promise<T | undefined> {
  const b = bridge();
  if (!b || !g.ducterNative) return;
  try {
    return (await b.postMessage(m)) as T;
  } catch (err) {
    console.warn("[ducter] app:", err);
    return;
  }
}

export const haptic = (kind: "light" | "success" | "warning") => void nativeCall({ t: "haptic", kind });

/** Hands the app what its notification buttons need (the token goes to the Keychain). */
export const tellApp = (d: { token?: string; base: string; locale: "zh" | "en"; personaName?: string }) => void nativeCall({ t: "hello", ...d });

/** D209: whether the home answered. The apps open the page from their cache, so a home they can't
 *  reach no longer fails the page's load: the page says so, and the app shows its can't-reach screen
 *  until the home has answered once. */
export const tellReach = (ok: boolean) => void nativeCall({ t: "reach", ok });

/** Why this phone gets no notifications, when it can't: a browser, the Android app (not yet), the iPhone app. */
export const unsupportedKey = () => (!inApp() ? "notify.unsupported" : nativeInfo()?.platform === "android" ? "notify.android.later" : "notify.app.unavailable");
