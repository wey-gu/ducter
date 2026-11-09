// A small Chrome DevTools Protocol client (D151): one WebSocket to the browser endpoint, flat
// sessions (Target.attachToTarget flatten), commands with timeouts, and events by method.
// Used only for Ducter's own browser (core/src/browser); never exposed to a model.
import { openMiniWs } from "./ws-client.ts";

export type CdpEvent = { method: string; params: any; sessionId?: string };

export interface CdpConn {
  send(method: string, params?: object, sessionId?: string, timeoutMs?: number): Promise<any>;
  on(fn: (e: CdpEvent) => void): () => void;
  onClose(fn: () => void): () => void;
  closed(): boolean;
  close(): void;
}

/** The browser's endpoint from the profile's DevToolsActivePort file ("<port>\n/devtools/browser/<id>"). */
export function parseActivePort(text: string): string | undefined {
  const [port, path] = text.trim().split("\n");
  if (!port || !/^\d+$/.test(port) || !path?.startsWith("/devtools/browser/")) return undefined;
  return `ws://127.0.0.1:${port}${path}`;
}

export async function connectCdp(url: string, timeoutMs = 5_000): Promise<CdpConn | undefined> {
  // Our own client (ws-client.ts): no permessage-deflate, which Bun 1.3's WebSocket mishandled.
  const ws = await openMiniWs(url, timeoutMs);
  if (!ws) return undefined;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<(e: CdpEvent) => void>();
  const closers = new Set<() => void>();
  let id = 0;
  let isClosed = false;
  ws.onmessage = (m) => {
    let d: any;
    try {
      d = JSON.parse(m);
    } catch {
      return;
    }
    if (d.id != null) {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      clearTimeout(p.timer);
      if (d.error) p.reject(new Error(d.error.message ?? "CDP error"));
      else p.resolve(d.result ?? {});
      return;
    }
    if (d.method) for (const fn of listeners) fn({ method: d.method, params: d.params ?? {}, ...(d.sessionId ? { sessionId: d.sessionId } : {}) });
  };
  ws.onclose = () => {
    isClosed = true;
    for (const p of pending.values()) clearTimeout(p.timer), p.reject(new Error("closed"));
    pending.clear();
    for (const fn of closers) fn();
  };
  return {
    send(method, params = {}, sessionId, ms = 15_000) {
      if (isClosed) return Promise.reject(new Error("closed"));
      return new Promise((resolve, reject) => {
        const i = ++id;
        const timer = setTimeout(() => pending.delete(i) && reject(new Error(`${method} timed out`)), ms);
        pending.set(i, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onClose(fn) {
      closers.add(fn);
      return () => closers.delete(fn);
    },
    closed: () => isClosed,
    close() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}
