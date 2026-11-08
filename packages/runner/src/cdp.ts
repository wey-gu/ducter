// Ducter's own DevTools connection to a Ducter browser (a driver-owned profile under
// <dataDir>/browser-profiles). cua-driver drives the pages; Ducter uses this side channel only
// for browser-level chores the driver does not offer: a clean quit, the Dock tile, and where
// the window sits. Never page content.
import { join } from "node:path";

export interface Cdp {
  send(method: string, params?: object, sessionId?: string): Promise<any>;
  close(): void;
}

/** Connect to the browser endpoint named in the profile's DevToolsActivePort file. */
export async function connectCdp(profileDir: string, timeoutMs = 3_000): Promise<Cdp | undefined> {
  let port: string | undefined;
  let path: string | undefined;
  try {
    [port, path] = (await Bun.file(join(profileDir, "DevToolsActivePort")).text()).trim().split("\n");
  } catch {
    return undefined;
  }
  if (!port || !/^\d+$/.test(port) || !path?.startsWith("/devtools/browser/")) return undefined;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  let id = 0;
  const failAll = (why: string) => {
    for (const p of pending.values()) p.reject(new Error(why));
    pending.clear();
  };
  ws.onmessage = (m) => {
    let d: any;
    try {
      d = JSON.parse(String(m.data));
    } catch {
      return;
    }
    const p = d.id != null ? pending.get(d.id) : undefined;
    if (!p) return;
    pending.delete(d.id);
    if (d.error) p.reject(new Error(`${d.error.message ?? "CDP error"}`));
    else p.resolve(d.result ?? {});
  };
  ws.onclose = () => failAll("closed");
  const opened = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    ws.onopen = () => {
      clearTimeout(t);
      resolve(true);
    };
    ws.onerror = () => {
      clearTimeout(t);
      resolve(false);
    };
  });
  if (!opened) {
    try {
      ws.close();
    } catch {
      /* never opened */
    }
    return undefined;
  }
  return {
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const i = ++id;
        const timer = setTimeout(() => {
          if (pending.delete(i)) reject(new Error(`${method} timed out`));
        }, timeoutMs);
        pending.set(i, {
          resolve: (v) => (clearTimeout(timer), resolve(v)),
          reject: (e) => (clearTimeout(timer), reject(e)),
        });
        ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}

export interface IdentityOptions {
  /** PNG for the Dock tile (macOS). */
  dockImage?: Uint8Array;
  /** Expected browser pid: guards against a stale DevToolsActivePort from a previous run. */
  pid?: number;
  /** Max window size in points (default 1024 × 760). */
  maxWidth?: number;
  maxHeight?: number;
  margin?: number;
}

export interface IdentityResult {
  dockTile: boolean;
  bounds?: { left: number; top: number; width: number; height: number };
}

/** Where the Ducter window goes: bottom-right of the available screen area, at most ~60% wide. */
export function parkedBounds(
  screen: { l: number; t: number; w: number; h: number },
  maxWidth = 1024,
  maxHeight = 760,
  margin = 12,
): { left: number; top: number; width: number; height: number } {
  const width = Math.min(maxWidth, Math.round(screen.w * 0.6));
  const height = Math.min(maxHeight, Math.round(screen.h * 0.7));
  return { left: screen.l + screen.w - width - margin, top: screen.t + screen.h - height - margin, width, height };
}

/**
 * Make a freshly launched Ducter browser recognisable and predictable: the Ducter avatar on
 * its Dock tile, and its window parked bottom-right, smaller than the user's own windows.
 */
export async function applyBrowserIdentity(profileDir: string, o: IdentityOptions = {}, retryMs = 8_000): Promise<IdentityResult | undefined> {
  const until = Date.now() + retryMs;
  while (Date.now() < until) {
    const cdp = await connectCdp(profileDir);
    if (!cdp) {
      await Bun.sleep(250);
      continue;
    }
    try {
      if (o.pid != null) {
        const info = await cdp.send("SystemInfo.getProcessInfo").catch(() => undefined);
        const browser = info?.processInfo?.find((p: any) => p.type === "browser");
        if (browser && browser.id !== o.pid) {
          await Bun.sleep(250);
          continue; // stale port file from a previous browser
        }
      }
      const result: IdentityResult = { dockTile: false };
      if (o.dockImage) {
        result.dockTile = await cdp
          .send("Browser.setDockTile", { image: Buffer.from(o.dockImage).toString("base64") })
          .then(() => true, () => false);
      }
      const { targetInfos } = await cdp.send("Target.getTargets");
      const page = (targetInfos as any[]).find((t) => t.type === "page");
      if (page) {
        const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
        const ev = await cdp.send(
          "Runtime.evaluate",
          { expression: "JSON.stringify({l:screen.availLeft,t:screen.availTop,w:screen.availWidth,h:screen.availHeight})", returnByValue: true },
          sessionId,
        );
        await cdp.send("Target.detachFromTarget", { sessionId }).catch(() => {});
        const screen = JSON.parse(ev.result.value);
        const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId: page.targetId });
        const bounds = parkedBounds(screen, o.maxWidth, o.maxHeight, o.margin);
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { ...bounds, windowState: "normal" } });
        result.bounds = bounds;
      }
      return result;
    } catch {
      await Bun.sleep(250);
    } finally {
      cdp.close();
    }
  }
  return undefined;
}

/**
 * Quit a Ducter browser cleanly (CDP Browser.close).
 *
 * Why: cua-driver ends a driver-owned browser with SIGKILL (end_session, idle expiry), and
 * Chrome commits cookies to disk only about every 30 s, so a sign-in made shortly before is
 * lost (observed 2026-11-09, Chrome 157, cua-driver 0.44.0). SIGTERM does not quit Chrome on
 * macOS. Browser.close shuts it down cleanly and the cookies are saved.
 */
export async function closeBrowserGracefully(profileDir: string, timeoutMs = 5_000): Promise<boolean> {
  const cdp = await connectCdp(profileDir, timeoutMs);
  if (!cdp) return false;
  try {
    await cdp.send("Browser.close");
    return true;
  } catch (e) {
    // The browser may drop the socket before answering: that is a successful quit.
    return (e as Error).message === "closed";
  } finally {
    cdp.close();
  }
}
