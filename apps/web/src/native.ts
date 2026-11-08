// The Ducter iPhone app (apps/ios) hosts this client in a WKWebView and adds what a page on iOS
// can't do well: APNs notifications with Go / Hold on them, haptics, and the device token kept in
// the Keychain so those buttons work without opening the app. In a browser all of this is absent
// and every function here does nothing.

export interface NativeInfo {
  platform: "ios";
  version: string;
  bundleId: string; // the APNs topic
  apnsEnv: "sandbox" | "production";
}

type Bridge = { postMessage(m: unknown): Promise<unknown> };
const g = globalThis as unknown as { ducterNative?: NativeInfo; webkit?: { messageHandlers?: { ducter?: Bridge } } };

export const nativeInfo = (): NativeInfo | undefined => (g.ducterNative && g.webkit?.messageHandlers?.ducter ? g.ducterNative : undefined);
export const inApp = () => !!nativeInfo();

export async function nativeCall<T>(m: { t: string } & Record<string, unknown>): Promise<T | undefined> {
  const b = g.webkit?.messageHandlers?.ducter;
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
