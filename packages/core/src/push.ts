// Web Push from the main process (roadmap: "Push: Web Push sent from the main process").
//
// - VAPID keys (P-256) are made on first use and kept in <dataDir>/push.json (0600), with the
//   phones' subscriptions and the push settings (quiet hours, "also when done").
// - Payloads are encrypted per RFC 8291 (aes128gcm) with WebCrypto; no dependency.
// - The pusher follows the Log (D-decisions-attention, level 3): a decision that nobody has read
//   within the hold (default 30 s) earns one push; at most one push per coalescing window
//   (15 min), the rest wait and go out as one; quiet hours hold everything (D52 Q12: nothing
//   breaks through) and release at most one push at the end if something still waits. A done
//   result pushes only when the user turned "also when done" on (I-results: done is level 2).
// - iOS gets tap-to-open only (D52 Q11); Android also gets Go / Hold actions, answered through
//   POST /api/decide by the service worker.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";

// ---------- base64url ----------

export const b64u = {
  enc(b: Uint8Array | ArrayBuffer): string {
    return Buffer.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b).toString("base64url");
  },
  dec(s: string): Bytes {
    return new Uint8Array(Buffer.from(s, "base64url"));
  },
};

type Bytes = Uint8Array<ArrayBuffer>;
type Jwk = Record<string, unknown>;
const te = new TextEncoder();
const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return out;
};

// ---------- VAPID ----------

export interface Vapid {
  publicKey: string; // base64url of the raw 65-byte point (applicationServerKey)
  privateJwk: Jwk;
  subject: string;
}

export async function newVapid(subject = "https://github.com/wey-gu/ducter"): Promise<Vapid> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { publicKey: b64u.enc(raw), privateJwk: (await crypto.subtle.exportKey("jwk", kp.privateKey)) as Jwk, subject };
}

/** The Authorization header for a push service (RFC 8292): vapid t=<ES256 JWT>, k=<public key>. */
export async function vapidAuth(endpoint: string, v: Vapid, nowMs = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64u.enc(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.enc(te.encode(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: v.subject })));
  const key = await crypto.subtle.importKey("jwk", v.privateJwk as Parameters<typeof crypto.subtle.importKey>[1] & object as never, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${v.publicKey}`;
}

// ---------- RFC 8291 payload encryption ----------

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Encrypts one push message for a subscription (aes128gcm, a single record). */
export async function encryptPayload(
  plaintext: Bytes,
  sub: { p256dh: string; auth: string },
  fixed?: { salt?: Bytes; sender?: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = b64u.dec(sub.p256dh);
  const authSecret = b64u.dec(sub.auth);
  const sender = fixed?.sender ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, sender.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

// ---------- store ----------

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceId: string; // "local" for a browser on this machine
  locale: "zh" | "en";
  platform: string; // ios | android | macos | web
  createdAt: string;
}

export interface Quiet {
  start: string; // "23:00", local to tz
  end: string; // "08:00"
  tz: string; // IANA zone of the phone that set it
}

export interface PushSettings {
  quiet: Quiet | null;
  done: boolean; // also push when a task is done (off by default: done is level 2)
}

interface PushFile {
  vapid?: Vapid;
  subs: PushSub[];
  settings: PushSettings;
}

export const DEFAULT_QUIET = { start: "23:00", end: "08:00" };

export interface PushStore {
  vapid(): Promise<Vapid>;
  subs(): PushSub[];
  subscribe(s: PushSub): void;
  unsubscribe(endpoint: string): boolean;
  /** Drops every subscription of a device (it was disconnected). */
  forget(deviceId: string): void;
  settings(): PushSettings;
  setSettings(p: Partial<PushSettings>): PushSettings;
}

export function openPushStore(dataDir: string): PushStore {
  const path = join(dataDir, "push.json");
  let data: PushFile = { subs: [], settings: { quiet: null, done: false } };
  if (existsSync(path)) {
    try {
      const d = JSON.parse(readFileSync(path, "utf8")) as Partial<PushFile>;
      data = { vapid: d.vapid, subs: d.subs ?? [], settings: { quiet: null, done: false, ...d.settings } };
    } catch (err) {
      console.warn(`[push] ${path} is unreadable; starting fresh:`, (err as Error).message);
    }
  }
  const save = () => {
    writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
  };
  let making: Promise<Vapid> | undefined;
  return {
    async vapid() {
      if (data.vapid) return data.vapid;
      making ??= newVapid().then((v) => ((data.vapid = v), save(), v));
      return making;
    },
    subs: () => [...data.subs],
    subscribe(s) {
      data.subs = data.subs.filter((x) => x.endpoint !== s.endpoint);
      data.subs.push(s);
      save();
    },
    unsubscribe(endpoint) {
      const n = data.subs.length;
      data.subs = data.subs.filter((x) => x.endpoint !== endpoint);
      if (data.subs.length !== n) save();
      return data.subs.length !== n;
    },
    forget(deviceId) {
      const n = data.subs.length;
      data.subs = data.subs.filter((x) => x.deviceId !== deviceId);
      if (data.subs.length !== n) save();
    },
    settings: () => ({ ...data.settings }),
    setSettings(p) {
      data.settings = { ...data.settings, ...p };
      save();
      return { ...data.settings };
    },
  };
}

// ---------- quiet hours ----------

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Minutes since local midnight in a zone. */
export function localMinutes(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function inQuiet(at: number, q: Quiet | null): boolean {
  if (!q) return false;
  const now = localMinutes(at, q.tz);
  const s = minutes(q.start);
  const e = minutes(q.end);
  return s === e ? false : s < e ? now >= s && now < e : now >= s || now < e;
}

/** When the quiet hours that `at` falls in end (at itself if not quiet). */
export function quietEndsAt(at: number, q: Quiet | null): number {
  if (!inQuiet(at, q)) return at;
  const now = localMinutes(at, q!.tz);
  const left = (minutes(q!.end) - now + 24 * 60) % (24 * 60);
  return at - (at % 60_000) + left * 60_000;
}

// ---------- copy (push.decision.* in D-decisions-attention §4) ----------

const COPY = {
  zh: {
    go: "好",
    defaultGo: (inText: string, label: string) => `你不回的话，${inText}后我会${/^[\x00-\x7f]/.test(label) ? " " + label : label}。这一步能撤销。`,
    defaultHold: "你不回的话，我会先停着等你。",
    noDefault: "这件不会自己动，等你定",
    min: (n: number) => `${n} 分钟`,
    hour: (n: number) => `${n} 小时`,
    done: (s: string) => `做完了：${s}`,
    failed: (s: string) => `没成：${s}`,
    many: (n: number) => `${n} 件等你`,
    morning: (n: number) => `早上好。${n} 件等你。`,
    test: "通知通了。需要你的时候，我会这样叫你。",
    hold: "先等等",
  },
  en: {
    go: "Go",
    defaultGo: (inText: string, label: string) => `If you don't answer, I'll ${label} in ${inText}. It can be undone.`,
    defaultHold: "If you don't answer, I'll hold and wait for you.",
    noDefault: "I won't go ahead on this without you",
    min: (n: number) => `${n} min`,
    hour: (n: number) => `${n} h`,
    done: (s: string) => `Done: ${s}`,
    failed: (s: string) => `Didn't work: ${s}`,
    many: (n: number) => `${n} need you`,
    morning: (n: number) => `Morning. ${n} need you.`,
    test: "Notifications work. This is how I'll call you when something needs you.",
    hold: "Hold",
  },
};

export interface PushMessage {
  title: string;
  body: string;
  tag: string; // one notification per item; a newer push about it replaces the old one
  url: string; // relative to the app's base: app#d=<id> or app#task=<id>
  decisionId?: string;
  actions?: { action: "go" | "hold"; title: string }[];
}

function inWords(ms: number, c: (typeof COPY)["zh"]) {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m < 60 ? c.min(m) : c.hour(Math.round(m / 60));
}

/** The default line, the same words the cards use (decision.default.*). */
export function defaultLine(d: Bodies["decision"], locale: "zh" | "en", now: number): string {
  const c = COPY[locale];
  if (!d.reversible) return c.noDefault;
  const at = d.defaultAt ? Date.parse(d.defaultAt) : NaN;
  if (d.defaultOption !== "go" || Number.isNaN(at)) return c.defaultHold;
  return c.defaultGo(inWords(at - now, c), d.goLabel || c.go);
}

export function decisionMessage(d: Bodies["decision"], o: { persona: string; task?: string; locale: "zh" | "en"; platform: string; now: number }): PushMessage {
  const c = COPY[o.locale];
  const msg: PushMessage = {
    title: o.task ? `${o.persona} · ${o.task}` : o.persona,
    body: `${d.question} ${defaultLine(d, o.locale, o.now)}`,
    tag: `d:${d.decisionId}`,
    url: `app#d=${encodeURIComponent(d.decisionId)}`,
    decisionId: d.decisionId,
  };
  // iOS shows no action buttons on web push (D52 Q11): tap opens the decision.
  if (o.platform !== "ios") msg.actions = [{ action: "go", title: d.goLabel && o.locale === "zh" ? `好，${d.goLabel}` : d.goLabel ? `Go: ${d.goLabel}` : c.go }, { action: "hold", title: c.hold }];
  return msg;
}

export function doneMessage(t: { taskId: string; title: string; summary?: string; failed?: boolean }, o: { persona: string; locale: "zh" | "en" }): PushMessage {
  const c = COPY[o.locale];
  const line = (t.summary ?? "").split("\n")[0]!.trim().slice(0, 140) || t.title;
  return { title: `${o.persona} · ${t.title}`, body: t.failed ? c.failed(line) : c.done(line), tag: `t:${t.taskId}`, url: `app#task=${encodeURIComponent(t.taskId)}` };
}

export function coalescedMessage(n: number, o: { persona: string; locale: "zh" | "en"; morning?: boolean }): PushMessage {
  const c = COPY[o.locale];
  return { title: o.persona, body: o.morning ? c.morning(n) : c.many(n), tag: "ducter:many", url: "app#onhand" };
}

export function testMessage(o: { persona: string; locale: "zh" | "en" }): PushMessage {
  return { title: o.persona, body: COPY[o.locale].test, tag: "ducter:test", url: "app" };
}

// ---------- sending ----------

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface SendResult {
  endpoint: string;
  status: number;
  gone: boolean; // 404/410: the subscription is dead and is dropped
}

export async function sendPush(sub: PushSub, msg: PushMessage, v: Vapid, fetcher: Fetcher = fetch as Fetcher, urgency = "high"): Promise<SendResult> {
  let body: Bytes;
  try {
    body = await encryptPayload(te.encode(JSON.stringify(msg)), sub.keys);
  } catch {
    return { endpoint: sub.endpoint, status: 0, gone: true }; // keys we can't use: drop it
  }
  try {
    const res = await fetcher(sub.endpoint, {
      method: "POST",
      headers: {
        authorization: await vapidAuth(sub.endpoint, v),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: String(12 * 3600),
        urgency,
        topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32),
      },
      body,
    });
    return { endpoint: sub.endpoint, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch (err) {
    console.warn(`[push] send failed: ${(err as Error).message}`);
    return { endpoint: sub.endpoint, status: 0, gone: false };
  }
}

// ---------- the pusher: which Log events earn a push, and when ----------

export const PUSH_HOLD_MS = 30_000;
export const PUSH_COALESCE_MS = 15 * 60_000;

interface Item {
  key: string; // d:<decisionId> | t:<taskId>
  seq: number;
  at: number; // when it was asked (the hold counts from here)
  kind: "decision" | "done";
  decision?: Bodies["decision"];
  done?: { taskId: string; title: string; summary?: string; failed?: boolean };
}

export interface Pusher {
  /** What would go out now (for tests and /api/push/test). */
  pending(): string[];
  /** Sends a message to every subscription now (bypasses the policy). */
  sendNow(msg: (sub: PushSub) => PushMessage, only?: (s: PushSub) => boolean): Promise<SendResult[]>;
  stop(): void;
}

export function createPusher(opts: {
  log: LogStore;
  store: PushStore;
  personaName: () => string;
  taskTitle: (taskId: string) => string | undefined;
  lastSummary?: (taskId: string) => string | undefined;
  clock?: Clock;
  holdMs?: number;
  coalesceMs?: number;
  fetcher?: Fetcher;
  enabled?: boolean;
  /** A subscription whose device was disconnected gets nothing more (and is dropped). */
  alive?: (s: PushSub) => boolean;
}): Pusher {
  const clock = opts.clock ?? realClock;
  const hold = opts.holdMs ?? PUSH_HOLD_MS;
  const coalesce = opts.coalesceMs ?? PUSH_COALESCE_MS;
  const enabled = opts.enabled ?? true;
  const items = new Map<string, Item>();
  const pushed = new Set<string>(); // one push per item, ever
  let maxRead = 0;
  let lastPushAt = -Infinity;
  let heldByQuiet = false;
  let timer: unknown;

  const seen = (it: Item) => maxRead >= it.seq;

  const schedule = (ms: number) => {
    if (timer) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = undefined;
      void tick();
    }, Math.max(0, ms));
  };

  const liveSubs = () =>
    opts.store.subs().filter((s) => {
      if (!opts.alive || opts.alive(s)) return true;
      opts.store.forget(s.deviceId);
      return false;
    });

  const deliver = async (list: Item[], morning = false) => {
    const subs = liveSubs();
    if (!subs.length || !list.length) return;
    const v = await opts.store.vapid();
    const persona = opts.personaName();
    for (const it of list) pushed.add(it.key);
    lastPushAt = clock.now();
    const results = await Promise.all(
      subs.map((s) => {
        let msg: PushMessage;
        if (list.length > 1 || morning) msg = coalescedMessage(list.length, { persona, locale: s.locale, morning });
        else if (list[0]!.kind === "decision") {
          const d = list[0]!.decision!;
          msg = decisionMessage(d, { persona, task: d.taskId ? opts.taskTitle(d.taskId) : undefined, locale: s.locale, platform: s.platform, now: clock.now() });
        } else msg = doneMessage(list[0]!.done!, { persona, locale: s.locale });
        return sendPush(s, msg, v, opts.fetcher);
      }),
    );
    for (const r of results) if (r.gone) opts.store.unsubscribe(r.endpoint);
  };

  const tick = async () => {
    const now = clock.now();
    for (const [k, it] of items) if (seen(it) || pushed.has(k)) items.delete(k);
    const open = [...items.values()];
    if (!open.length) return;
    const ready = open.filter((it) => now - it.at >= hold);
    const next = open.map((it) => it.at + hold).filter((t) => t > now);
    const quiet = opts.store.settings().quiet;
    if (inQuiet(now, quiet)) {
      // Nothing breaks through (D52 Q12). Done pushes are dropped; decisions wait for the end.
      for (const it of ready) if (it.kind === "done") items.delete(it.key), pushed.add(it.key);
      heldByQuiet = ready.some((it) => it.kind === "decision") || heldByQuiet;
      return schedule(quietEndsAt(now, quiet) - now + 1000);
    }
    if (heldByQuiet) {
      heldByQuiet = false;
      const still = ready.filter((it) => it.kind === "decision");
      if (still.length) {
        await deliver(still, true);
        return next.length ? schedule(Math.min(...next) - now) : undefined;
      }
    }
    if (ready.length) {
      if (now - lastPushAt < coalesce) return schedule(lastPushAt + coalesce - now);
      await deliver(ready);
    }
    const later = open.filter((it) => !pushed.has(it.key)).map((it) => it.at + hold).filter((t) => t > clock.now());
    if (later.length) schedule(Math.min(...later) - clock.now());
  };
  const add = (it: Omit<Item, "at">) => {
    if (!enabled || pushed.has(it.key) || items.has(it.key)) return;
    items.set(it.key, { ...it, at: clock.now() });
    if (!timer) schedule(hold);
  };

  const off = opts.log.subscribe((e: LogEvent) => {
    switch (e.kind) {
      case "decision": {
        const d = e.body as Bodies["decision"];
        add({ key: `d:${d.decisionId}`, seq: e.seq, kind: "decision", decision: d });
        return;
      }
      case "decision_resolved": {
        const r = e.body as Bodies["decision_resolved"];
        items.delete(`d:${r.decisionId}`);
        return;
      }
      case "read_receipt":
        maxRead = Math.max(maxRead, (e.body as Bodies["read_receipt"]).upToSeq);
        for (const [k, it] of items) if (seen(it)) items.delete(k);
        return;
      case "task_state": {
        const s = e.body as Bodies["task_state"];
        if ((s.attention !== "done" && s.attention !== "failed") || !opts.store.settings().done) return;
        add({
          key: `t:${s.taskId}`,
          seq: e.seq,
          kind: "done",
          done: { taskId: s.taskId, title: opts.taskTitle(s.taskId) ?? s.taskId, summary: opts.lastSummary?.(s.taskId), failed: s.attention === "failed" },
        });
        return;
      }
    }
  });

  return {
    pending: () => [...items.keys()].filter((k) => !pushed.has(k)),
    async sendNow(make, only) {
      const v = await opts.store.vapid();
      const subs = liveSubs().filter((s) => !only || only(s));
      const results = await Promise.all(subs.map((s) => sendPush(s, make(s), v, opts.fetcher)));
      for (const r of results) if (r.gone) opts.store.unsubscribe(r.endpoint);
      return results;
    },
    stop() {
      off();
      if (timer) clock.clearTimeout(timer);
    },
  };
}
