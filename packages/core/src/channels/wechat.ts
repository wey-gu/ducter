// D301 (research/105): WeChat, through WeChat's own ClawBot over iLink. The person scans a QR with
// their own WeChat; WeChat adds a one-to-one ClawBot contact bound to them, and the home long-polls
// for their words (no public address). Nobody signs in as the person: the token only moves this
// ClawBot's messages.
//
// Ducter's own client of the protocol Tencent documents (docs/protocol_zh_CN.md of
// Tencent/openclaw-weixin, MIT); no code of that package is used. It says who it is
// (bot_agent "Ducter/<version>", the protocol's version first in channel_version, as the
// document asks of other hosts).
//
// What WeChat allows shapes the caps: no buttons, no edits; it answers inside about 24 hours of the
// person's words, with a few messages per window (the hub keeps to it, replyWindowMs/windowSends).
// Replies carry the newest inbound context_token. Pictures and files go through WeChat's CDN,
// AES-128-ECB encrypted. The token is in a header only: no error or log line here carries it.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { ChannelError, type BotInfo, type Channel, type ChannelEvents, type InFile, type InMessage, type OutPart } from "./port.ts";

export const WECHAT_API = "https://ilinkai.weixin.qq.com";
export const WECHAT_CDN = "https://novac2c.cdn.weixin.qq.com/c2c";
/** The protocol version this client follows (Tencent's openclaw-weixin 2.4.10). */
const PROTOCOL = [2, 4, 10] as const;
const BOT_TYPE = "3";
/** research/105 §2.3: about 24 hours and about 10 messages a window; both kept a little short. */
export const WECHAT_WINDOW_MS = 23 * 3600_000;
export const WECHAT_WINDOW_SENDS = 9;
export const WECHAT_MAX_TEXT = 4000;
const MAX_FILE = 20 * 1024 * 1024;
/** A stale token (getupdates ret/errcode -14). */
const STALE = -14;
/** A send WeChat refused for the window (reported as ret -2). */
const WINDOW_SPENT = -2;

export interface WechatState {
  /** The newest context_token from the person's words; replies carry it. */
  ctx?: string;
  /** getupdates' cursor, kept only after the messages it brought were handled. */
  buf?: string;
}

interface Opts {
  api?: string;
  fetch?: typeof fetch;
}

const headers = (token?: string): Record<string, string> => ({
  "Content-Type": "application/json",
  AuthorizationType: "ilink_bot_token",
  // A random uint32, as decimal digits, base64 (the protocol's X-WECHAT-UIN).
  "X-WECHAT-UIN": Buffer.from(String(randomBytes(4).readUInt32BE(0))).toString("base64"),
  "iLink-App-Id": "bot",
  "iLink-App-ClientVersion": String((PROTOCOL[0] << 16) | (PROTOCOL[1] << 8) | PROTOCOL[2]),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const baseInfo = () => ({ channel_version: `${PROTOCOL.join(".")}-ducter`, bot_agent: `Ducter/${DUCTER_VERSION.replace(/[^A-Za-z0-9_.+-]/g, "") || "0"}` });

/** uint64 ids arrive as bare numbers: quote them before JSON.parse loses digits. */
export function parseLossless<T>(raw: string): T {
  return JSON.parse(raw.replace(/"(message_id|msg_id|svr_id)"\s*:\s*(-?\d+)/g, '"$1":"$2"')) as T;
}

async function post<T>(f: typeof fetch, base: string, path: string, body: unknown, o: { token?: string; ms?: number; signal?: AbortSignal } = {}): Promise<T> {
  const ctl = new AbortController();
  const t = o.ms ? setTimeout(() => ctl.abort(), o.ms) : undefined;
  const stop = () => ctl.abort();
  o.signal?.addEventListener("abort", stop, { once: true });
  let res: Response;
  try {
    res = await f(`${base.replace(/\/$/, "")}/${path}`, { method: "POST", headers: headers(o.token), body: JSON.stringify({ ...(body as object), base_info: baseInfo() }), signal: ctl.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError" && !o.signal?.aborted) return {} as T; // a long poll ran out: nothing new
    throw new ChannelError("network", `WeChat can't be reached (${path.split("/").pop()})`);
  } finally {
    if (t) clearTimeout(t);
    o.signal?.removeEventListener("abort", stop);
  }
  const text = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) throw new ChannelError("token", `WeChat refused the token (${path.split("/").pop()})`);
  if (!res.ok) throw new ChannelError("network", `WeChat answered ${res.status} (${path.split("/").pop()})`);
  try {
    return parseLossless<T>(text || "{}");
  } catch {
    throw new ChannelError("network", `WeChat answered something unreadable (${path.split("/").pop()})`);
  }
}

// ---------- the QR login: the scan is the pairing ----------

export type ScanStatus =
  | { status: "wait" | "scaned" | "expired" | "need_verifycode" | "verify_code_blocked" | "binded_redirect" }
  | { status: "scaned_but_redirect"; redirect_host?: string }
  | { status: "confirmed"; bot_token?: string; ilink_bot_id?: string; baseurl?: string; ilink_user_id?: string };

export interface WechatLogin {
  /** A fresh QR: qrcode to poll with, text to draw as the QR. */
  qr(knownTokens?: string[]): Promise<{ qrcode: string; text: string }>;
  /** One long poll of the scan (about 35 s); base moves on a redirect. */
  status(base: string, qrcode: string, verifyCode?: string, signal?: AbortSignal): Promise<ScanStatus>;
}

export function wechatLogin(o: Opts & { pollMs?: number } = {}): WechatLogin {
  const f = o.fetch ?? fetch;
  const api = (o.api ?? WECHAT_API).replace(/\/$/, "");
  return {
    async qr(knownTokens = []) {
      const r = await post<{ qrcode?: string; qrcode_img_content?: string }>(f, api, `ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`, { local_token_list: knownTokens.slice(0, 10) }, { ms: 15_000 });
      if (!r.qrcode || !r.qrcode_img_content) throw new ChannelError("network", "WeChat gave no QR");
      return { qrcode: r.qrcode, text: r.qrcode_img_content };
    },
    async status(base, qrcode, verifyCode, signal) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), o.pollMs ?? 35_000);
      const stop = () => ctl.abort();
      signal?.addEventListener("abort", stop, { once: true });
      try {
        const q = `qrcode=${encodeURIComponent(qrcode)}${verifyCode ? `&verify_code=${encodeURIComponent(verifyCode)}` : ""}`;
        const res = await f(`${base.replace(/\/$/, "")}/ilink/bot/get_qrcode_status?${q}`, { headers: { "iLink-App-Id": "bot", "iLink-App-ClientVersion": headers()["iLink-App-ClientVersion"]! }, signal: ctl.signal });
        if (!res.ok) return { status: "wait" };
        return (await res.json()) as ScanStatus;
      } catch {
        return { status: "wait" }; // a poll that ran out, or a blip: ask again
      } finally {
        clearTimeout(t);
        signal?.removeEventListener("abort", stop);
      }
    },
  };
}

// ---------- the ClawBot ----------

type CDNMedia = { encrypt_query_param?: string; aes_key?: string; encrypt_type?: number; full_url?: string };
type Item = {
  type?: number;
  text_item?: { text?: string };
  image_item?: { media?: CDNMedia; aeskey?: string; mid_size?: number; hd_size?: number };
  voice_item?: { text?: string };
  file_item?: { media?: CDNMedia; file_name?: string; len?: string };
  video_item?: { media?: CDNMedia; video_size?: number };
  ref_msg?: { svr_id?: string; message_item?: { msg_id?: string } };
};
type WxMessage = { message_id?: string; from_user_id?: string; group_id?: string; message_type?: number; context_token?: string; item_list?: Item[] };
type Updates = { ret?: number; errcode?: number; msgs?: WxMessage[]; get_updates_buf?: string; longpolling_timeout_ms?: number };

const TEXT = 1;
const IMAGE = 2;
const VOICE = 3;
const FILE = 4;
const VIDEO = 5;

const ecb = (key: Buffer) => ({
  enc: (b: Buffer) => {
    const c = createCipheriv("aes-128-ecb", key, null);
    return Buffer.concat([c.update(b), c.final()]);
  },
  dec: (b: Buffer) => {
    const d = createDecipheriv("aes-128-ecb", key, null);
    return Buffer.concat([d.update(b), d.final()]);
  },
});

/** A CDN key: hex on an image item; else base64 of 16 bytes, or of 32 hex characters. */
export function cdnKey(hex: string | undefined, b64: string | undefined): Buffer | undefined {
  if (hex && /^[0-9a-f]{32}$/i.test(hex)) return Buffer.from(hex, "hex");
  if (!b64) return undefined;
  const raw = Buffer.from(b64, "base64");
  if (raw.length === 16) return raw;
  const s = raw.toString("ascii");
  return raw.length === 32 && /^[0-9a-f]{32}$/i.test(s) ? Buffer.from(s, "hex") : undefined;
}

export interface WechatOpts extends Opts {
  token: string;
  /** The base the login answered (baseurl), else the API. */
  base?: string;
  cdn?: string;
  botId: string;
  state: () => WechatState;
  save: (p: WechatState) => void;
  /** Long-poll timeout (35 s in use; tests make it short) and the pause after a failed poll. */
  pollMs?: number;
  backoffMs?: number;
}

export function createWechat(o: WechatOpts): Channel {
  const f = o.fetch ?? fetch;
  const base = (o.base || o.api || WECHAT_API).replace(/\/$/, "");
  const cdn = (o.cdn ?? WECHAT_CDN).replace(/\/$/, "");
  const token = o.token.trim();
  let running = false;
  let abort: AbortController | undefined;
  const tickets = new Map<string, string>(); // context_token → typing_ticket

  const call = <T>(path: string, body: unknown, ms = 15_000) => post<T>(f, base, `ilink/bot/${path}`, body, { token, ms, signal: abort?.signal });

  const fileOf = (m: CDNMedia | undefined, key: Buffer | undefined, name: string | undefined, bytes?: number): InFile | undefined => {
    if (!m?.full_url && !m?.encrypt_query_param) return undefined;
    return {
      ...(name ? { name } : {}),
      ...(bytes ? { bytes } : {}),
      async fetch() {
        const url = m.full_url || `${cdn}/download?encrypted_query_param=${encodeURIComponent(m.encrypt_query_param!)}`;
        let res: Response;
        try {
          res = await f(url);
        } catch {
          throw new ChannelError("network", "WeChat's file can't be reached");
        }
        if (!res.ok) throw new ChannelError("refused", `WeChat's file answered ${res.status}`);
        const b = Buffer.from(await res.arrayBuffer());
        return new Uint8Array(key ? ecb(key).dec(b) : b);
      },
    };
  };

  const toIn = (m: WxMessage): InMessage => {
    const words: string[] = [];
    const files: InFile[] = [];
    let replyTo: string | undefined;
    for (const it of m.item_list ?? []) {
      if (it.ref_msg?.svr_id) replyTo = it.ref_msg.svr_id;
      if (it.type === TEXT && it.text_item?.text) words.push(it.text_item.text);
      // Voice comes in as WeChat's own transcript.
      else if (it.type === VOICE && it.voice_item?.text) words.push(it.voice_item.text);
      else if (it.type === IMAGE) {
        const i = it.image_item;
        const x = fileOf(i?.media, cdnKey(i?.aeskey, i?.media?.aes_key), "photo.jpg", i?.hd_size ?? i?.mid_size);
        if (x) files.push(x);
      } else if (it.type === FILE) {
        const i = it.file_item;
        const x = fileOf(i?.media, cdnKey(undefined, i?.media?.aes_key), i?.file_name, Number(i?.len) || undefined);
        if (x) files.push(x);
      } else if (it.type === VIDEO) {
        const i = it.video_item;
        const x = fileOf(i?.media, cdnKey(undefined, i?.media?.aes_key), "video.mp4", i?.video_size);
        if (x) files.push(x);
      }
    }
    const from = m.from_user_id ?? "";
    return {
      id: m.message_id ?? randomUUID(),
      chat: from,
      from: { id: from, name: "" },
      direct: !m.group_id,
      text: words.join("\n"),
      ...(replyTo ? { replyTo } : {}),
      ...(files.length ? { files } : {}),
    };
  };

  const poll = async (on: ChannelEvents) => {
    let pause = o.backoffMs ?? 2_000;
    let fails = 0;
    let timeout = o.pollMs ?? 35_000;
    while (running) {
      let r: Updates;
      try {
        r = await call<Updates>("getupdates", { get_updates_buf: o.state().buf ?? "" }, timeout + 5_000);
      } catch (err) {
        if (!running) return;
        if (err instanceof ChannelError && err.trouble === "token") return void (on.trouble("token"), (running = false));
        if (++fails >= 3) on.trouble("network");
        await new Promise((res) => setTimeout(res, pause));
        pause = Math.min(pause * 2, 60_000);
        continue;
      }
      if (r.ret === STALE || r.errcode === STALE) {
        // A stale token: the person scans again. Never retried in a loop.
        on.trouble("token");
        running = false;
        return;
      }
      if ((r.ret ?? 0) !== 0 || (r.errcode ?? 0) !== 0) {
        if (++fails >= 3) on.trouble("network");
        await new Promise((res) => setTimeout(res, pause));
        pause = Math.min(pause * 2, 60_000);
        continue;
      }
      if (fails >= 3) on.trouble(undefined);
      fails = 0;
      pause = o.backoffMs ?? 2_000;
      if (r.longpolling_timeout_ms && r.longpolling_timeout_ms > 0) timeout = o.pollMs ?? r.longpolling_timeout_ms;
      for (const m of r.msgs ?? []) {
        if (!running) return;
        if (m.message_type !== undefined && m.message_type !== 1) continue; // only the person's words
        try {
          if (m.context_token) o.save({ ctx: m.context_token });
          await on.message(toIn(m));
        } catch (err) {
          console.warn("[wechat] a message:", (err as Error).message);
        }
      }
      if (r.get_updates_buf) o.save({ buf: r.get_updates_buf });
    }
  };

  const sendItem = async (to: string, item: Item): Promise<string> => {
    const client = `ducter-${randomUUID()}`;
    const ctx = o.state().ctx;
    const r = await call<{ ret?: number; message_id?: string }>("sendmessage", { msg: { from_user_id: "", to_user_id: to, client_id: client, message_type: 2, message_state: 2, item_list: [item], ...(ctx ? { context_token: ctx } : {}) } });
    if (r.ret === STALE) throw new ChannelError("token", "WeChat refused the token (sendmessage)");
    if (r.ret === WINDOW_SPENT) throw new ChannelError("refused", "WeChat: wait for the person's next words (sendmessage)");
    if (r.ret && r.ret !== 0) throw new ChannelError("refused", `WeChat refused the message (ret ${r.ret})`);
    return r.message_id ?? client;
  };

  return {
    kind: "wechat",
    caps: { buttons: false, edit: false, typing: true, files: true, maxText: WECHAT_MAX_TEXT, maxDownload: MAX_FILE, maxUpload: MAX_FILE, silent: false, replyWindowMs: WECHAT_WINDOW_MS, windowSends: WECHAT_WINDOW_SENDS },
    async start(on) {
      abort = new AbortController();
      const r = await call<{ ret?: number; errcode?: number }>("msg/notifystart", {});
      if (r.ret === STALE || r.errcode === STALE) throw new ChannelError("token", "WeChat refused the token (notifystart)");
      running = true;
      void poll(on);
      return { id: o.botId, name: "ClawBot" } satisfies BotInfo;
    },
    stop() {
      if (running) void post(f, base, "ilink/bot/msg/notifystop", {}, { token, ms: 5_000 }).catch(() => {});
      running = false;
      abort?.abort();
    },
    send: (chat: string, p: OutPart) => sendItem(chat, { type: TEXT, text_item: { text: p.text || "…" } }),
    async edit() {
      throw new ChannelError("refused", "WeChat can't edit a message");
    },
    async typing(chat) {
      const ctx = o.state().ctx;
      let ticket = ctx ? tickets.get(ctx) : undefined;
      if (!ticket) {
        const r = await call<{ typing_ticket?: string }>("getconfig", { ilink_user_id: chat, ...(ctx ? { context_token: ctx } : {}) }, 10_000);
        if (!r.typing_ticket) return;
        ticket = r.typing_ticket;
        if (ctx) tickets.set(ctx, ticket);
      }
      await call("sendtyping", { ilink_user_id: chat, typing_ticket: ticket, status: 1 }, 10_000);
    },
    async answerTap() {},
    async sendFile(chat, file) {
      const plain = readFileSync(file.path);
      const key = randomBytes(16);
      const filekey = randomBytes(16).toString("hex");
      const kind = file.type.startsWith("image/") ? IMAGE : file.type.startsWith("video/") ? VIDEO : FILE;
      const cipher = ecb(key).enc(plain);
      const up = await call<{ upload_full_url?: string; upload_param?: string }>("getuploadurl", {
        filekey,
        media_type: kind === IMAGE ? 1 : kind === VIDEO ? 2 : 3,
        to_user_id: chat,
        rawsize: plain.length,
        rawfilemd5: createHash("md5").update(plain).digest("hex"),
        filesize: cipher.length,
        no_need_thumb: true,
        aeskey: key.toString("hex"),
      });
      const url = up.upload_full_url?.trim() || (up.upload_param ? `${cdn}/upload?encrypted_query_param=${encodeURIComponent(up.upload_param)}&filekey=${encodeURIComponent(filekey)}` : "");
      if (!url) throw new ChannelError("refused", "WeChat gave no upload address");
      let res: Response;
      try {
        res = await f(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(cipher) });
      } catch {
        throw new ChannelError("network", "WeChat's CDN can't be reached");
      }
      const param = res.headers.get("x-encrypted-param");
      if (res.status >= 400 && res.status < 500) throw new ChannelError("refused", `WeChat's CDN refused the file (${res.status})`);
      if (!res.ok || !param) throw new ChannelError("network", `WeChat's CDN answered ${res.status}`);
      // The key goes out as base64 of its hex, as WeChat's own client sends it.
      const media = { encrypt_query_param: param, aes_key: Buffer.from(key.toString("hex")).toString("base64"), encrypt_type: 1 };
      if (file.caption) await sendItem(chat, { type: TEXT, text_item: { text: file.caption } });
      if (kind === IMAGE) return sendItem(chat, { type: IMAGE, image_item: { media, mid_size: cipher.length } });
      if (kind === VIDEO) return sendItem(chat, { type: VIDEO, video_item: { media, video_size: cipher.length } });
      return sendItem(chat, { type: FILE, file_item: { media, file_name: file.name, len: String(plain.length) } });
    },
  };
}
