// The phone's connection to core: the device token (pairing), the authenticated HTTP API, and the
// client WebSocket with reconnect-by-cursor and an outbox that holds a task action until the server
// has said welcome. Messages (send, task_send) and answers to cards (decide) don't wait here: the
// app keeps them in its own outbox (outbox.ts, D543), durable on this device, until the home has
// them, and sends them again after every welcome (core dedupes by clientId; a closed card says how).
import type { BrowserScreenHints, ClientFrame, ClientShape, ServerFrame } from "@ducter/protocol";
import { shapeFromBrowser } from "@ducter/protocol";

export interface DeviceRecord {
  token: string;
  deviceId: string;
  name: string;
  personaName?: string;
  pairedAt: string;
  /** D532: the home's key fingerprint, pinned at pairing (or at the first welcome after it): only an
   *  answer signed by this key can end the pairing. */
  fp?: string;
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

/**
 * D532: a device paired before its record kept the home's key learns it from the first welcome on
 * an authenticated socket (only the home that issued this token says welcome to it). Never
 * replaced: a home whose key changed is the one case no signature reaches (再连一次).
 */
export function pinFp(fp: string) {
  const r = storage.get();
  if (r && !r.fp && fp) storage.set({ ...r, fp });
}

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
  // The name is the model alone (D291): the iPhone and Android apps (apps/ios, apps/android) say
  // they are the app in the platform ("ios-app", "android-app"), a browser names itself there
  // ("ios-safari"); the card's art and its one line show which, never words glued to the name.
  if (/DucterApp\//.test(ua)) return { name: model, platform: `${platform}-app` };
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua) ? "chrome" : /FxiOS|Firefox\//.test(ua) ? "firefox" : /Edg\//.test(ua) ? "edge" : /Safari\//.test(ua) ? "safari" : "";
  return { name: model, platform: browser && platform !== "web" ? `${platform}-${browser}` : platform };
}

/** D263: a phone, tablet or foldable, said in the hello of a page on an iPhone, iPad or Android (never a computer's). */
export function myShape(ua = globalThis.navigator?.userAgent ?? "", touch = globalThis.navigator?.maxTouchPoints ?? 0, sc?: { width: number; height: number }, hints: BrowserScreenHints = screenHints()): ClientShape | undefined {
  const p = deviceName(ua, touch).platform;
  if (!p.startsWith("ios") && !p.startsWith("android")) return undefined;
  return shapeFromBrowser(ua, touch, sc ?? globalThis.screen ?? { width: 0, height: 0 }, hints);
}

/** D317: the screen's own word on folding, where the browser has it (Viewport Segments, Device Posture). */
export function screenHints(g: any = globalThis): BrowserScreenHints {
  const h: BrowserScreenHints = {};
  try {
    const segs = g.viewport?.segments ?? g.visualViewport?.segments;
    let n = Array.isArray(segs) ? segs.length : 0;
    const mq = g.matchMedia as ((q: string) => { matches: boolean }) | undefined;
    if (!n && mq) n = mq("(horizontal-viewport-segments: 2)").matches || mq("(vertical-viewport-segments: 2)").matches ? 2 : 0;
    if (n) h.segments = n;
    const posture = g.navigator?.devicePosture?.type;
    if (typeof posture === "string") h.posture = posture;
  } catch {}
  return h;
}

export type PairError ="invalid" | "expired" | "locked" | "unreachable";

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
  return { token: body.token!, deviceId: body.deviceId!, name: body.name!, personaName: body.personaName, pairedAt: new Date().toISOString(), ...(body.fp ? { fp: body.fp } : {}) };
}

export interface Me {
  via: "local" | "device";
  personaName: string;
  deviceId?: string;
  deviceName?: string;
  /** apns: this home can notify the iPhone app; apnsVia: its own Apple key or the notification relay (D159). */
  push: { supported: boolean; publicKey?: string; apns?: boolean; apnsVia?: "key" | "relay"; relay?: "unreachable" };
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

const KEEP = new Set(["task_action"]);
const MSG = new Set(["send", "task_send", "decide", "pile_hand"]);
/** D532 (the Mac's D520): quick at first, at most 5 s apart, 15 s once down for a minute; ±20%
 *  jitter, so devices behind one proxy don't all knock at once when their home comes back. */
const BACKOFF = [500, 1000, 2000, 4000, 5000];
const BACKOFF_LONG = 15_000;
const LONG_DOWN = 60_000;
export const backoff = (attempt: number, downFor: number, rand = Math.random) => {
  const base = downFor >= LONG_DOWN ? BACKOFF_LONG : BACKOFF[Math.min(attempt, BACKOFF.length - 1)]!;
  return Math.round(base * (0.8 + 0.4 * rand()));
};
const LIVE_EVERY = 15_000;
const LIVE_DEAD = 45_000;
/** D543: a socket asked to prove it is alive (coming back, the network back, a message written)
 *  that hears nothing for this long is dead though it looks open (a phone that moved networks):
 *  closed and dialled again, instead of the 45 s the steady ping takes. */
export const PROBE_MS = 4_000;
/** D543: a dial that hasn't heard its welcome by then is dead too (opened into a dead network): let go and dialled again. */
export const WELCOME_WAIT_MS = 8_000;

/** D284: the page can unzip a gzipped frame (Safari 16.4+, every current browser). */
const CAN_GUNZIP = typeof DecompressionStream !== "undefined";
/** A gzipped frame's JSON. */
export const gunzip = (buf: ArrayBuffer): Promise<string> => new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text();

export class Connection {
  status: ConnStatus = "connecting";
  private ws?: WebSocket;
  private outbox: ClientFrame[] = [];
  private welcomed = false;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  /** D293: liveness, only with a home that answers pings (welcome.ping). */
  private live?: ReturnType<typeof setInterval>;
  private heardAt = 0;
  private dueAt = 0;
  /** Called with each frame written to a welcomed socket (the app tracks actions in flight). */
  onWritten?: (f: ClientFrame) => void;
  /** D532: a socket closed before its welcome (refused, or the home not up): the app may ask the
   *  home whether this device still stands there. A refusal alone never ends a pairing. */
  onRefused?: () => void;
  /** When the next try is due (0: none waiting), and since when the link has been down. */
  nextAt = 0;
  downSince = 0;

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
    if (typeof document === "object") document.addEventListener("visibilitychange", this.wake);
    if (typeof addEventListener === "function") {
      addEventListener("online", this.online);
      // The iPhone and Android apps say when they come to the front (a web view's
      // visibilitychange doesn't always come): the same as coming back to the tab.
      addEventListener("ducterresume", this.wake);
      // D543: the window coming to the front (a desktop browser, an iPad's split view) too.
      addEventListener("focus", this.wake);
      // D-new: iOS restores a page from its back/forward cache without a visibilitychange; the
      // socket from before the restore may be half-open, so it proves itself like a return.
      addEventListener("pageshow", this.onPageShow);
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.nextAt = 0;
    if (typeof document === "object") document.removeEventListener("visibilitychange", this.wake);
    if (typeof removeEventListener === "function") {
      removeEventListener("online", this.online);
      removeEventListener("ducterresume", this.wake);
      removeEventListener("focus", this.wake);
      removeEventListener("pageshow", this.onPageShow);
    }
  }

  private onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) this.wake();
  };

  /** Coming back to the phone: reconnect now instead of waiting out the backoff. */
  private wake = () => {
    if ((typeof document === "object" && document.visibilityState === "hidden") || this.stopped) return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.retryNow();
    // D543: an open socket after a sleep may be half-open (nothing closes it): it proves itself.
    else if (this.ws.readyState === WebSocket.OPEN) this.probe();
  };

  /** D532: the network came back: a socket from before it went may be dead while it looks open. */
  private online = () => {
    if (this.stopped) return;
    if (this.ws?.readyState === WebSocket.OPEN && Date.now() - this.heardAt > 5_000) return void this.abandon(this.ws);
    this.wake();
  };

  private probing?: ReturnType<typeof setTimeout>;
  /** The home answers {t:"ping"} (welcome.ping). */
  private pings = false;
  /**
   * D543: asks the open socket to prove it is alive: a ping (to a home that answers them) and
   * PROBE_MS to hear anything at all. Nothing heard: it is closed and dialled again, and what waits
   * in the app's outbox goes on the new one. One probe at a time; a stalled link that would have
   * recovered costs a redial, never a lost or doubled message.
   */
  probe(ms = PROBE_MS) {
    const ws = this.ws;
    if (this.stopped || this.probing || !ws || ws.readyState !== WebSocket.OPEN || !this.welcomed) return;
    const from = Date.now();
    if (this.pings) ws.send(JSON.stringify({ t: "ping" }));
    this.probing = setTimeout(() => {
      this.probing = undefined;
      if (this.ws === ws && ws.readyState === WebSocket.OPEN && this.heardAt < from) this.abandon(ws);
    }, ms);
  }

  /** Try now (the notice's button, coming back): a fresh dial, the backoff from its start. */
  retryNow() {
    if (this.stopped) return;
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;
    clearTimeout(this.timer);
    this.attempt = 0;
    this.nextAt = 0;
    this.open();
  }

  private setStatus(s: ConnStatus) {
    if (this.status !== s) (this.status = s), this.onStatus(s);
  }

  private open() {
    const tok = this.token();
    // A browser can't set headers on a WebSocket: the device token rides as a subprotocol.
    const ws = tok ? new WebSocket(this.url, ["ducter", tok]) : new WebSocket(this.url);
    this.ws = ws;
    this.welcomed = false;
    // D284: a large frame (a task's history) comes gzipped where the page can unzip it.
    ws.binaryType = "arraybuffer";
    ws.onopen = () => ws.send(JSON.stringify({ ...this.hello(), ...(CAN_GUNZIP ? { gzip: true } : {}) }));
    clearTimeout(this.helloWait);
    this.helloWait = setTimeout(() => !this.welcomed && this.abandon(ws), WELCOME_WAIT_MS);
    ws.onmessage = (m) => {
      this.heardAt = Date.now();
      const data = m.data as string | ArrayBuffer;
      if (typeof data === "string" && !this.unzipping) return this.take(data);
      // In order: a frame behind a gzipped one waits for it.
      this.unzipping++;
      this.inOrder = this.inOrder
        .then(async () => {
          const text = typeof data === "string" ? data : await gunzip(data);
          if (this.ws === ws) this.take(text);
        })
        .catch(() => {})
        .finally(() => void this.unzipping--);
    };
    ws.onclose = () => this.closed(ws);
  }

  /**
   * D543: a socket found dead while it looks open (the probe, the steady ping, the network back) is
   * let go at once: close() on a half-open socket waits for a closing handshake that never comes
   * (Chrome held it 5 s to a minute in the measurements), so the page carries on as if it closed.
   */
  private abandon(ws: WebSocket) {
    if (this.ws !== ws) return;
    ws.onmessage = null;
    try {
      ws.close();
    } catch {}
    this.closed(ws);
  }

  private helloWait?: ReturnType<typeof setTimeout>;

  private closed(ws: WebSocket) {
    if (this.ws !== ws) return;
    // Let go: its own close event, if it ever comes, is no longer this page's business.
    this.ws = undefined;
    clearTimeout(this.helloWait);
    clearTimeout(this.probing);
    this.probing = undefined;
    const refused = !this.welcomed;
    this.welcomed = false;
    clearInterval(this.live);
    if (this.stopped) return;
    if (!this.downSince) this.downSince = Date.now();
    this.setStatus(this.attempt === 0 && this.status === "connecting" ? "connecting" : "offline");
    const wait = backoff(this.attempt++, Date.now() - this.downSince);
    this.nextAt = Date.now() + wait;
    this.timer = setTimeout(() => ((this.nextAt = 0), this.open()), wait);
    if (refused) this.onRefused?.();
  }

  private unzipping = 0;
  private inOrder: Promise<void> = Promise.resolve();

  private take(text: string) {
    let f: ServerFrame;
    try {
      f = JSON.parse(text);
    } catch {
      return;
    }
    if (f.t === "welcome") {
      this.welcomed = true;
      clearTimeout(this.helloWait);
      this.attempt = 0;
      this.downSince = 0;
      this.nextAt = 0;
      this.setStatus("connected");
      this.pings = !!f.ping;
      if (f.ping) this.keepAlive();
    }
    if (f.t === "pong") return;
    this.onFrame(f);
    if (f.t === "welcome") this.flush();
  }

  /**
   * D293: a ping every 15 s; a socket the home hasn't answered for 45 s is closed and dialled again
   * (a phone that changed networks keeps a dead socket open). A tick that comes far too late is a
   * page the browser paused (a hidden tab, a sleeping phone): it gets one more interval first.
   */
  private keepAlive() {
    clearInterval(this.live);
    const ws = this.ws;
    this.heardAt = this.dueAt = Date.now();
    this.live = setInterval(() => {
      if (this.ws !== ws || ws?.readyState !== WebSocket.OPEN) return clearInterval(this.live);
      const now = Date.now();
      const late = now - this.dueAt > LIVE_EVERY + 10_000;
      this.dueAt = now;
      if (late) this.heardAt = now;
      else if (now - this.heardAt > LIVE_DEAD) return this.abandon(ws);
      ws.send(JSON.stringify({ t: "ping" }));
    }, LIVE_EVERY);
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
      // D543: something the person waits on went out: within PROBE_MS the socket shows it is alive.
      if (MSG.has(f.t)) this.probe();
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
