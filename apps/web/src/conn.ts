// The phone's connection to core: the device token (pairing), the authenticated HTTP API, and the
// client WebSocket with reconnect-by-cursor and an outbox that holds what the user chose until the
// server has said welcome. Messages (send, task_send) don't wait here: the app keeps them until
// echoed and sends them again after every welcome (core dedupes by clientId).
import type { ClientFrame, ServerFrame } from "@ducter/protocol";

export interface DeviceRecord {
  token: string;
  deviceId: string;
  name: string;
  personaName?: string;
  pairedAt: string;
}

const KEY = "ducter.device.v1";

export const storage = {
  get(): DeviceRecord | undefined {
    try {
      const v = localStorage.getItem(KEY);
      return v ? (JSON.parse(v) as DeviceRecord) : undefined;
    } catch {
      return undefined;
    }
  },
  set(d: DeviceRecord) {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },
};

/** Where this Ducter lives: the directory of the page (/app, /pair → the base). */
export function baseUrl(href = location.href): URL {
  return new URL(".", href);
}

export function wsUrl(base: URL): string {
  const u = new URL("ws", base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.href;
}

/** The code from a pairing link (…/pair#c=K7QM-4XPA), or "". */
export function codeFromHash(hash: string): string {
  const m = /(?:^#|&)c=([A-Za-z0-9-]+)/.exec(hash);
  return m ? m[1]!.toUpperCase() : "";
}

/** A name for this phone in `ducter devices`, from what the browser says it is. */
export function deviceName(ua = navigator.userAgent, touch = navigator.maxTouchPoints ?? 0): { name: string; platform: string } {
  // Safari on an iPad asks for desktop pages as a Mac; no Mac has a touch screen (D176).
  if (/Macintosh/.test(ua) && touch > 1) ua = ua.replace("Macintosh", "iPad");
  const platform = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Macintosh/.test(ua) ? "macos" : "web";
  const model = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android phone" : "Browser";
  // The iPhone and Android apps (apps/ios, apps/android) say so in the platform, not only the name
  // (a name is renamed): "ios-app", "android-app".
  if (/DucterApp\//.test(ua)) return { name: `${model} · Ducter`, platform: `${platform}-app` };
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /Safari\//.test(ua) ? "Safari" : "";
  return { name: browser ? `${model} · ${browser}` : model, platform };
}

export type PairError = "invalid" | "expired" | "locked" | "unreachable";

export async function pair(base: URL, code: string, fetcher: typeof fetch = fetch): Promise<DeviceRecord | { error: PairError }> {
  const { name, platform } = deviceName();
  let res: Response;
  try {
    res = await fetcher(new URL("pair", base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name, platform }) });
  } catch {
    return { error: "unreachable" };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) return { error: res.status === 429 ? "locked" : body.error === "expired" ? "expired" : res.status === 401 ? "invalid" : "unreachable" };
  return { token: body.token!, deviceId: body.deviceId!, name: body.name!, personaName: body.personaName, pairedAt: new Date().toISOString() };
}

export interface Me {
  via: "local" | "device";
  personaName: string;
  deviceId?: string;
  deviceName?: string;
  /** apns: this home can notify the iPhone app; apnsVia: its own Apple key or the notification relay (D159). */
  push: { supported: boolean; publicKey?: string; apns?: boolean; apnsVia?: "key" | "relay"; relay?: "unreachable" };
  /** D228: how to find this home again when its tunnel's address changes. */
  follow?: import("@ducter/protocol").Follow;
}

export class Api {
  constructor(
    public base: URL,
    public token: () => string | undefined,
  ) {}
  async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data?: T }> {
    const headers: Record<string, string> = {};
    const tok = this.token();
    if (tok) headers.authorization = `Bearer ${tok}`;
    if (init.body !== undefined) headers["content-type"] = "application/json";
    try {
      const res = await fetch(new URL(path, this.base), { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
      const data = (await res.json().catch(() => undefined)) as T | undefined;
      return { status: res.status, data };
    } catch {
      return { status: 0 };
    }
  }
}

export type ConnStatus = "connecting" | "connected" | "offline";

const KEEP = new Set(["decide", "task_action"]);
const MSG = new Set(["send", "task_send"]);
const BACKOFF = [500, 1000, 2000, 4000, 8000, 15000];

export class Connection {
  status: ConnStatus = "connecting";
  private ws?: WebSocket;
  private outbox: ClientFrame[] = [];
  private welcomed = false;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  /** Called with each frame written to a welcomed socket (the app tracks actions in flight). */
  onWritten?: (f: ClientFrame) => void;

  constructor(
    private url: string,
    private token: () => string | undefined,
    private hello: () => ClientFrame,
    private onFrame: (f: ServerFrame) => void,
    private onStatus: (s: ConnStatus) => void,
  ) {}

  start() {
    this.stopped = false;
    this.open();
    document.addEventListener("visibilitychange", this.wake);
    addEventListener("online", this.wake);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    document.removeEventListener("visibilitychange", this.wake);
    removeEventListener("online", this.wake);
  }

  /** Coming back to the phone: reconnect now instead of waiting out the backoff. */
  private wake = () => {
    if (document.visibilityState !== "visible" || this.stopped) return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      clearTimeout(this.timer);
      this.attempt = 0;
      this.open();
    }
  };

  private setStatus(s: ConnStatus) {
    if (this.status !== s) (this.status = s), this.onStatus(s);
  }

  private open() {
    const tok = this.token();
    // A browser can't set headers on a WebSocket: the device token rides as a subprotocol.
    const ws = tok ? new WebSocket(this.url, ["ducter", tok]) : new WebSocket(this.url);
    this.ws = ws;
    this.welcomed = false;
    ws.onopen = () => ws.send(JSON.stringify(this.hello()));
    ws.onmessage = (m) => {
      let f: ServerFrame;
      try {
        f = JSON.parse(String(m.data));
      } catch {
        return;
      }
      if (f.t === "welcome") {
        this.welcomed = true;
        this.attempt = 0;
        this.setStatus("connected");
      }
      this.onFrame(f);
      if (f.t === "welcome") this.flush();
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.welcomed = false;
      if (this.stopped) return;
      this.setStatus(this.attempt === 0 && this.status === "connecting" ? "connecting" : "offline");
      const wait = BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)]!;
      this.timer = setTimeout(() => this.open(), wait);
    };
  }

  /** Re-says hello on the open socket (a Log that started over). */
  rehello() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(this.hello()));
  }

  send(f: ClientFrame) {
    if ((KEEP.has(f.t) || MSG.has(f.t)) && (!this.welcomed || this.ws?.readyState !== WebSocket.OPEN)) {
      if (KEEP.has(f.t)) this.outbox.push(f);
      return; // a message goes out from the app's pending list after the welcome
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(f));
      if (this.welcomed) this.onWritten?.(f);
    } else if (KEEP.has(f.t)) this.outbox.push(f);
  }

  get pending() {
    return this.outbox.length;
  }

  private flush() {
    const out = this.outbox.splice(0);
    for (const f of out) this.send(f);
  }
}
