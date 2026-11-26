// D622: Feishu / Lark, through the person's own self-built app (企业自建应用) on the official
// open platform. Events arrive over the long connection (WebSocket): the home dials out, so there is
// no public address, no webhook and no third-party SDK. The app talks as itself, never as the person.
//
// The wire protocol is documented by the open platform and is small: a protobuf Frame over the
// socket (method 0 = control/ping, 1 = data), an ack echoing the frame's ids with `{"code":200}`
// once the event was handled (Feishu resends unacked events), and the event itself as JSON in the
// frame's payload. The ack must go out within 3 s.
//
// Tokens ride only in the Authorization header; no error or log line here ever carries one.
import { randomUUID } from "node:crypto";
import { parseMarkdown } from "./format.ts";
import { ChannelError, RetryAfter, type BotInfo, type Channel, type ChannelEvents, type InMessage, type OutPart } from "./port.ts";

/** The two open platforms one card covers: feishu.cn in China, larksuite.com elsewhere. */
export const FEISHU_ORIGIN = "https://open.feishu.cn";
export const LARK_ORIGIN = "https://open.larksuite.com";
export type FeishuDomain = "feishu" | "lark";
export const feishuOrigin = (d: FeishuDomain = "feishu") => (d === "lark" ? LARK_ORIGIN : FEISHU_ORIGIN);
/** D622: opens the app's one-to-one chat with the person in Feishu (or Lark). */
export const feishuAppLink = (appId: string, d: FeishuDomain = "feishu") => `${d === "lark" ? "https://applink.larksuite.com" : "https://applink.feishu.cn"}/client/bot/open?appId=${encodeURIComponent(appId)}`;

/** The longest text one Feishu message carries (its body limit is 150 KB; this leaves room for JSON escaping). */
export const FEISHU_MAX_TEXT = 20_000;
/** D622: what the person asks for when making the app; Settings shows the same names. */
export const FEISHU_SCOPES = ["im:message.p2p_msg:readonly", "im:message:send_as_bot", "im:message:update"] as const;
export const FEISHU_EVENTS = ["im.message.receive_v1"] as const;

export interface FeishuOpts {
  appId: string;
  appSecret: string;
  domain?: FeishuDomain;
  /** Tests: the open platform's origin (never a real one). */
  base?: string;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  backoffMs?: number;
  /** Tests: shorten the server's ping interval. */
  pingMs?: number;
}

type Json = Record<string, unknown>;
type FeishuMessage = {
  message_id?: string;
  root_id?: string;
  parent_id?: string;
  chat_id?: string;
  chat_type?: string;
  message_type?: string;
  content?: string;
  mentions?: { key?: string; name?: string; id?: string }[];
};
type FeishuEvent = {
  header?: { event_id?: string; event_type?: string; create_time?: string; app_id?: string; tenant_key?: string };
  event?: { sender?: { sender_id?: { open_id?: string; union_id?: string; user_id?: string }; sender_type?: string; tenant_key?: string }; message?: FeishuMessage };
};

// ---------- the long connection's protobuf Frame ----------

export interface FeishuFrame {
  seqId: number;
  logId: number;
  service: number;
  method: number;
  /** The header { key, value } pairs, in order. */
  headers: [string, string][];
  payload: Uint8Array;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function varint(out: number[], n: number) {
  let v = Math.max(0, Math.floor(n));
  for (;;) {
    const b = v & 0x7f;
    v = Math.floor(v / 128);
    out.push(v ? b | 0x80 : b);
    if (!v) return;
  }
}
function tag(out: number[], field: number, wire: number) {
  varint(out, (field << 3) | wire);
}
function field(out: number[], field: number, bytes: Uint8Array) {
  tag(out, field, 2);
  varint(out, bytes.length);
  for (const b of bytes) out.push(b);
}
/** The protobuf a Header is: key = 1, value = 2. */
function headerBytes(key: string, value: string): Uint8Array {
  const out: number[] = [];
  field(out, 1, enc.encode(key));
  field(out, 2, enc.encode(value));
  return Uint8Array.from(out);
}
/** The protobuf a Frame is: seq 1, log 2, service 3, method 4, headers 5, payload 8. */
export function encodeFeishuFrame(f: FeishuFrame): Uint8Array {
  const out: number[] = [];
  tag(out, 1, 0);
  varint(out, f.seqId);
  tag(out, 2, 0);
  varint(out, f.logId);
  tag(out, 3, 0);
  varint(out, f.service);
  tag(out, 4, 0);
  varint(out, f.method);
  for (const [k, v] of f.headers) field(out, 5, headerBytes(k, v));
  if (f.payload.length) field(out, 8, f.payload);
  return Uint8Array.from(out);
}

function readVarint(b: Uint8Array, at: { i: number }): number | undefined {
  let v = 0;
  let shift = 0;
  for (;;) {
    const x = b[at.i++];
    if (x === undefined) return undefined;
    v += (x & 0x7f) * 2 ** shift;
    if (!(x & 0x80)) return v;
    shift += 7;
    if (shift > 53) return undefined;
  }
}
function readHeader(b: Uint8Array): [string, string] {
  let key = "";
  let value = "";
  const at = { i: 0 };
  while (at.i < b.length) {
    const t = readVarint(b, at);
    if (t === undefined) break;
    const field = Math.floor(t / 8);
    const wire = t & 7;
    if (wire === 2) {
      const n = readVarint(b, at);
      if (n === undefined || at.i + n > b.length) break;
      const s = dec.decode(b.subarray(at.i, at.i + n));
      at.i += n;
      if (field === 1) key = s;
      else if (field === 2) value = s;
    } else if (wire === 0) {
      if (readVarint(b, at) === undefined) break;
    } else if (wire === 1) at.i += 8;
    else if (wire === 5) at.i += 4;
    else break;
  }
  return [key, value];
}
export function decodeFeishuFrame(b: Uint8Array): FeishuFrame {
  const f: FeishuFrame = { seqId: 0, logId: 0, service: 0, method: 0, headers: [], payload: new Uint8Array() };
  const at = { i: 0 };
  while (at.i < b.length) {
    const t = readVarint(b, at);
    if (t === undefined) break;
    const field = Math.floor(t / 8);
    const wire = t & 7;
    if (wire === 0) {
      const v = readVarint(b, at);
      if (v === undefined) break;
      if (field === 1) f.seqId = v;
      else if (field === 2) f.logId = v;
      else if (field === 3) f.service = v;
      else if (field === 4) f.method = v;
    } else if (wire === 2) {
      const n = readVarint(b, at);
      if (n === undefined || at.i + n > b.length) break;
      const bytes = b.subarray(at.i, at.i + n);
      at.i += n;
      if (field === 5) f.headers.push(readHeader(bytes));
      else if (field === 8) f.payload = bytes.slice();
    } else if (wire === 1) at.i += 8;
    else if (wire === 5) at.i += 4;
    else break;
  }
  return f;
}
export const frameHeader = (f: FeishuFrame, key: string) => f.headers.find(([k]) => k === key)?.[1];

/** The ack: the same ids and headers, plus biz_rt, and `{"code":200}` (Feishu resends until it sees it). */
export function feishuAck(f: FeishuFrame, bizRt: number): Uint8Array {
  return encodeFeishuFrame({
    seqId: f.seqId,
    logId: f.logId,
    service: f.service,
    method: f.method,
    headers: [...f.headers, ["biz_rt", String(Math.max(0, Math.round(bizRt)))]],
    payload: enc.encode('{"code":200,"headers":null,"data":null}'),
  });
}
/** A keep-alive control frame; the server answers a pong. */
export function feishuPing(service: number): Uint8Array {
  return encodeFeishuFrame({ seqId: 0, logId: 0, service, method: 0, headers: [["type", "ping"]], payload: new Uint8Array() });
}
function feishuPong(f: FeishuFrame): Uint8Array {
  return encodeFeishuFrame({ seqId: f.seqId, logId: f.logId, service: f.service, method: 0, headers: [["type", "pong"]], payload: new Uint8Array() });
}

/** Frames larger than one packet carry sum/seq headers and the same message_id; join them in order. */
class Reassembler {
  private buf = new Map<string, { at: number; parts: (Uint8Array | undefined)[] }>();
  push(id: string, sum: number, seq: number, payload: Uint8Array): Uint8Array | undefined {
    if (sum <= 1 || seq < 0 || seq >= sum) return payload;
    const now = Date.now();
    for (const [k, v] of this.buf) if (now - v.at > 5_000) this.buf.delete(k);
    let e = this.buf.get(id);
    if (!e || e.parts.length !== sum) this.buf.set(id, (e = { at: now, parts: Array.from({ length: sum }) }));
    e.parts[seq] = payload;
    if (e.parts.some((p) => p === undefined)) return undefined;
    const all = e.parts as Uint8Array[];
    this.buf.delete(id);
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of all) (out.set(p, at), (at += p.length));
    return out;
  }
}

// ---------- the open API ----------

const TOKEN_CODES = new Set([10003, 10005, 10014, 20005, 99991661, 99991663, 99991664, 99991668]);
const SETUP_CODES = new Set([230006, 230027, 99991672]);
const BLOCKED_CODES = new Set([230002, 230013, 230029, 230035, 230053, 232009]);
const RATE_CODE = 230020;

export function createFeishu(o: FeishuOpts): Channel {
  const f = o.fetch ?? fetch;
  const WS = o.WebSocket ?? WebSocket;
  const domain: FeishuDomain = o.domain === "lark" ? "lark" : "feishu";
  const origin = (o.base ?? feishuOrigin(domain)).replace(/\/+$/, "");
  const api = `${origin}/open-apis`;
  const appId = o.appId.trim();
  const appSecret = o.appSecret.trim();
  let running = false;
  let sock: WebSocket | undefined;
  let events: ChannelEvents | undefined;
  let me: BotInfo | undefined;
  let token: { value: string; until: number } | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const note = (what: string) => console.info(`[feishu] ${what}`);
  const apiError = (code: number, msg: string, method: string): never => {
    if (TOKEN_CODES.has(code)) throw new ChannelError("token", `Feishu refused the token (${method})`);
    if (code === RATE_CODE) throw new RetryAfter(1000);
    if (SETUP_CODES.has(code)) throw new ChannelError("setup", `Feishu: ${msg} (${method})`);
    if (BLOCKED_CODES.has(code)) throw new ChannelError("blocked", `Feishu: ${msg} (${method})`);
    throw new ChannelError("refused", `Feishu: ${msg || `error ${code}`} (${method})`);
  };

  const accessToken = async (): Promise<string> => {
    if (token && Date.now() < token.until) return token.value;
    let res: Response;
    try {
      res = await f(`${api}/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      });
    } catch {
      throw new ChannelError("network", "Feishu can't be reached (tenant_access_token)");
    }
    let j: { code?: number; msg?: string; tenant_access_token?: string; expire?: number };
    try {
      j = (await res.json()) as typeof j;
    } catch {
      throw new ChannelError("network", `Feishu answered ${res.status} (tenant_access_token)`);
    }
    if (!res.ok || j.code !== 0 || !j.tenant_access_token) {
      if (res.status === 429) throw new RetryAfter(Math.max(1, Number(res.headers.get("retry-after")) || 1) * 1000);
      if (res.status >= 500) throw new ChannelError("network", `Feishu answered ${res.status} (tenant_access_token)`);
      return apiError(Number(j.code ?? res.status), String(j.msg ?? "no token"), "tenant_access_token");
    }
    // The server's lifetime is seconds; keep a minute of slack and refresh on the first refusal.
    const life = Math.max(60, Number(j.expire ?? 7200));
    token = { value: j.tenant_access_token, until: Date.now() + (life - 60) * 1000 };
    return token.value;
  };

  const call = async <T extends Json>(method: string, path: string, body?: Json, retried = false): Promise<T> => {
    const t = await accessToken();
    let res: Response;
    try {
      res = await f(`${api}${path}`, {
        method,
        headers: { authorization: `Bearer ${t}`, "content-type": "application/json; charset=utf-8" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ChannelError("network", `Feishu can't be reached (${method} ${path.split("?")[0]})`);
    }
    if (res.status === 429) throw new RetryAfter(Math.max(1, Number(res.headers.get("retry-after")) || 1) * 1000);
    if (res.status === 401) throw new ChannelError("token", `Feishu refused the token (${method})`);
    if (res.status >= 500) throw new ChannelError("network", `Feishu answered ${res.status} (${method})`);
    let j: { code?: number; msg?: string } & T;
    try {
      j = (await res.json()) as typeof j;
    } catch {
      throw new ChannelError("network", `Feishu answered ${res.status} (${method})`);
    }
    if (j.code === 0) return j;
    const code = Number(j.code ?? res.status);
    if (!retried && TOKEN_CODES.has(code)) {
      token = undefined;
      return call<T>(method, path, body, true);
    }
    return apiError(code, String(j.msg ?? ""), `${method} ${path.split("?")[0]}`);
  };

  /** The WebSocket URL and its service id, from the open platform (app id and secret here). */
  const endpoint = async (): Promise<{ url: string; service: number; pingMs: number }> => {
    let res: Response;
    try {
      res = await f(`${origin}/callback/ws/endpoint`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", locale: "zh" },
        body: JSON.stringify({ AppID: appId, AppSecret: appSecret, ClientAssertion: "" }),
      });
    } catch {
      throw new ChannelError("network", "Feishu's long connection can't be reached");
    }
    let j: { code?: number; msg?: string; data?: { URL?: string; ClientConfig?: { PingInterval?: number } } };
    try {
      j = (await res.json()) as typeof j;
    } catch {
      throw new ChannelError("network", `Feishu answered ${res.status} (ws/endpoint)`);
    }
    if (!res.ok || j.code !== 0 || !j.data?.URL) {
      if (res.status === 429) throw new RetryAfter(Math.max(1, Number(res.headers.get("retry-after")) || 1) * 1000);
      if (res.status >= 500) throw new ChannelError("network", `Feishu answered ${res.status} (ws/endpoint)`);
      return apiError(Number(j.code ?? res.status), String(j.msg ?? "no long connection"), "ws/endpoint");
    }
    let service = 0;
    try {
      service = Number(new URL(j.data.URL).searchParams.get("service_id") ?? 0);
    } catch {
      throw new ChannelError("setup", "Feishu gave no long connection address");
    }
    const secs = Number(j.data.ClientConfig?.PingInterval ?? 120);
    return { url: j.data.URL, service, pingMs: o.pingMs ?? Math.max(1, secs > 0 ? secs : 120) * 1000 };
  };

  const botInfo = async (): Promise<{ open_id?: string; app_name?: string; activate_status?: number }> => {
    const r = await call<{ bot?: { open_id?: string; app_name?: string; activate_status?: number } }>("GET", "/bot/v3/info");
    return r.bot ?? {};
  };

  const textOf = (m: FeishuMessage): string | undefined => {
    let c: Record<string, unknown>;
    try {
      c = JSON.parse(m.content ?? "{}") as Record<string, unknown>;
    } catch {
      return undefined;
    }
    if (m.message_type === "text") {
      let text = String(c.text ?? "");
      // The person's @ of the bot (or anyone) is structure, not words; only the bot's own is dropped.
      for (const x of m.mentions ?? []) if (x.key) text = text.split(x.key).join(x.id && x.id === me?.id ? "" : x.name ? `@${x.name}` : "");
      return text;
    }
    if (m.message_type === "post") {
      // Rich text: its title and each paragraph's words. Pictures are said as a bracket, never guessed.
      const parts: string[] = [];
      if (c.title) parts.push(String(c.title));
      for (const line of (c.content as unknown[]) ?? []) {
        if (!Array.isArray(line)) continue;
        const words = line
          .map((el) => {
            const x = el as { tag?: string; text?: string; href?: string; user_name?: string };
            if (x.tag === "text" || x.tag === "md") return x.text ?? "";
            if (x.tag === "a") return x.href ? `${x.text ?? x.href} (${x.href})` : (x.text ?? "");
            if (x.tag === "at") return x.user_name ? `@${x.user_name}` : "";
            if (x.tag === "img") return "[picture]";
            return "";
          })
          .join("");
        if (words.trim()) parts.push(words);
      }
      return parts.join("\n");
    }
    return undefined;
  };

  const onEvent = async (j: FeishuEvent, on: ChannelEvents) => {
    const type = j.header?.event_type;
    if (type !== "im.message.receive_v1") return note(`ignored: event ${type ?? "(none)"}`);
    const m = j.event?.message;
    const sender = j.event?.sender;
    if (!m?.message_id || !m.chat_id || !sender?.sender_id?.open_id) return note("ignored: a message with no sender or chat");
    if (sender.sender_type !== "user") return note("ignored: a message from an app");
    if (m.chat_type !== "p2p") return note(`ignored: a message (${m.chat_type ?? "?"})`);
    const text = textOf(m) ?? "";
    if (!text.trim()) return note("ignored: a message with no words");
    note("received: a direct message");
    const parent = m.parent_id && m.parent_id !== m.message_id ? m.parent_id : undefined;
    await on.message({
      id: m.message_id,
      // The open_id is where a reply goes (`receive_id_type=open_id`); the chat_id is the window
      // the event came from. A direct chat's open_id is stable across devices; the chat_id is not
      // what Feishu's send API takes for a person.
      chat: sender.sender_id.open_id,
      from: { id: sender.sender_id.open_id, name: "" },
      direct: true,
      text,
      ...(parent ? { replyTo: parent } : {}),
    });
  };

  const handle = async (bytes: Uint8Array, reassemble: Reassembler, on: ChannelEvents) => {
    const frame = decodeFeishuFrame(bytes);
    if (frame.method === 0) {
      if (frameHeader(frame, "type") === "ping" && sock?.readyState === 1) sock.send(feishuPong(frame));
      return;
    }
    const sum = Number(frameHeader(frame, "sum") ?? 1);
    const seq = Number(frameHeader(frame, "seq") ?? 0);
    const id = frameHeader(frame, "message_id") ?? `${frame.logId}:${frame.seqId}`;
    const payload = reassemble.push(id, sum, seq, frame.payload);
    if (!payload) return; // more packets to come: no ack yet
    const started = Date.now();
    let j: FeishuEvent | undefined;
    try {
      j = JSON.parse(dec.decode(payload)) as FeishuEvent;
    } catch {
      note("ignored: a payload that isn't JSON");
    }
    let work = Promise.resolve();
    if (j) work = onEvent(j, on).catch((err) => console.warn("[feishu] an event:", (err as Error).message));
    // Feishu wants the ack within 3 s. The work is local (a Log append); if a name lookup or the
    // Log is slow, ack anyway rather than make Feishu send the event again.
    await Promise.race([work, new Promise<void>((r) => setTimeout(r, 2_500))]);
    if (sock?.readyState === 1) sock.send(feishuAck(frame, Date.now() - started));
  };

  const connect = async (on: ChannelEvents, first: { url: string; service: number; pingMs: number }) => {
    let pause = o.backoffMs ?? 2_000;
    let next: typeof first | undefined = first;
    while (running) {
      let ep = next;
      next = undefined;
      if (!ep) {
        try {
          ep = await endpoint();
        } catch (err) {
          if (err instanceof ChannelError && err.trouble === "network") {
            on.trouble("network");
            await new Promise((r) => setTimeout(r, err instanceof RetryAfter ? err.ms : pause));
            pause = Math.min(pause * 2, 60_000);
            continue;
          }
          if (err instanceof ChannelError) on.trouble(err.trouble === "token" ? "token" : err.trouble === "setup" ? "setup" : "network");
          else on.trouble("network");
          running = false;
          return;
        }
      }
      const reassemble = new Reassembler();
      let socket: WebSocket | undefined;
      const closed = new Promise<void>((resolve) => {
        const ws = new WS(ep!.url);
        socket = ws;
        sock = ws;
        try {
          ws.binaryType = "arraybuffer";
        } catch {
          /* the platform's default is fine */
        }
        ws.onopen = () => {
          pause = o.backoffMs ?? 2_000;
          on.trouble(undefined);
        };
        ws.onmessage = (m: MessageEvent) => {
          const data = m.data as unknown;
          const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : typeof data === "string" ? enc.encode(data) : undefined;
          if (!bytes) return note("ignored: a socket message that isn't bytes");
          void handle(bytes, reassemble, on).catch((err) => console.warn("[feishu] a frame:", (err as Error).message));
        };
        ws.onclose = () => resolve();
        ws.onerror = () => {};
      });
      // A ping keeps the connection open; a close clears it.
      if (ping) clearInterval(ping);
      ping = setInterval(() => {
        if (socket?.readyState === 1) socket.send(feishuPing(ep!.service));
      }, ep.pingMs);
      await closed;
      if (ping) clearInterval(ping), (ping = undefined);
      sock = undefined;
      if (running) await new Promise((r) => setTimeout(r, 250));
    }
  };

  return {
    kind: "feishu",
    // Text and edits, no buttons (Feishu cards need a card callback, owed), no files yet. The hub
    // then asks for a typed 好 / 先等等 as it does in WeChat, and says Open in Ducter where it must.
    caps: { buttons: false, edit: true, typing: false, files: false, as: false, maxText: FEISHU_MAX_TEXT, maxDownload: 0, maxUpload: 0, silent: false },
    async start(on) {
      events = on;
      await accessToken();
      const ep = await endpoint();
      let info: { open_id?: string; app_name?: string; activate_status?: number };
      try {
        info = await botInfo();
      } catch (err) {
        if (err instanceof ChannelError && err.trouble === "token") throw new ChannelError("token", "Feishu refused the app's App ID or App Secret");
        if (err instanceof ChannelError && err.trouble === "setup") throw err;
        throw new ChannelError("setup", "Feishu can't read the bot: enable the bot capability and publish the app");
      }
      // 0 = waiting to be installed, 1 = tenant off, 3/4 = installed but not enabled, 5/6 = plan ended.
      if (info.activate_status !== undefined && info.activate_status !== 2) throw new ChannelError("setup", "Feishu's app isn't available to you yet: publish it and add yourself to its availability");
      me = { id: info.open_id || appId, name: info.app_name || (domain === "lark" ? "Lark" : "Feishu"), appId };
      running = true;
      void connect(on, ep);
      return me;
    },
    stop() {
      running = false;
      if (ping) clearInterval(ping), (ping = undefined);
      sock?.close();
      sock = undefined;
    },
    async send(chat, p: OutPart) {
      const text = plainText(p.text) || "…";
      const content = JSON.stringify({ text });
      if (p.replyTo) {
        try {
          const r = await call<{ data?: { message_id?: string } }>("POST", `/im/v1/messages/${encodeURIComponent(p.replyTo)}/reply`, { msg_type: "text", content });
          if (r.data?.message_id) return r.data.message_id;
        } catch (err) {
          // A message that was recalled can't be quoted; send plainly rather than lose the words.
          if (!(err instanceof ChannelError) || err.trouble !== "refused") throw err;
        }
      }
      const r = await call<{ data?: { message_id?: string } }>("POST", "/im/v1/messages?receive_id_type=open_id", {
        receive_id: chat,
        msg_type: "text",
        content,
        // Feishu de-duplicates an hour of sends with the same uuid.
        uuid: randomUUID().slice(0, 50),
      });
      return r.data?.message_id ?? "";
    },
    async edit(_chat, id, p) {
      await call("PUT", `/im/v1/messages/${encodeURIComponent(id)}`, { msg_type: "text", content: JSON.stringify({ text: plainText(p.text) || "…" }) });
    },
    async typing() {},
    async answerTap() {},
    async sendFile() {
      throw new ChannelError("refused", "Feishu: files aren't sent yet");
    },
  };
}

/** The partner's light Markdown as plain text: markers gone, a link's address kept after its label. */
export function plainText(src: string): string {
  const p = parseMarkdown(src);
  let out = p.text;
  for (const s of [...p.spans].filter((x) => x.kind === "link").sort((a, b) => b.start - a.start)) {
    if (s.url && out.slice(s.start, s.end) !== s.url) out = `${out.slice(0, s.end)} (${s.url})${out.slice(s.end)}`;
  }
  return out;
}
