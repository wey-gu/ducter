// D301: a local stand-in for WeChat's ClawBot over iLink (the calls Ducter's client makes, as
// research/105 §2.2 describes them), plus its CDN, so the scan, the window, pictures and files are
// tested end to end without a real WeChat account. Nothing here talks to WeChat.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface WxCall {
  path: string;
  body: Record<string, any>;
  headers: Record<string, string>;
}

export const SCANNER = "o9cq80wx_person@im.wechat";
export const OTHER = "o9cq80zz_other@im.wechat";

const ecb = (key: Buffer, enc: boolean, b: Buffer) => {
  const c = enc ? createCipheriv("aes-128-ecb", key, null) : createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([c.update(b), c.final()]);
};

export function fakeWechat(o: { token?: string; botId?: string } = {}) {
  const token = o.token ?? "wx-bot-token-0123456789abcdef";
  const botId = o.botId ?? "b0f5a1c2d3@im.bot";
  const calls: WxCall[] = [];
  const msgs: any[] = [];
  const statuses: any[] = []; // the next answers of get_qrcode_status (else "wait")
  const cdn = new Map<string, Buffer>(); // download param → ciphertext
  const sendRets: number[] = []; // the next sendmessage answers' ret
  let qrN = 0;
  let wake: (() => void) | undefined;
  let stale = false;
  let nextId = 7000000000000000001n; // uint64, beyond a JS number's exact range
  let buf = 0;

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => (headers[k] = v));
      if (url.pathname === "/cdn/upload" && req.method === "POST") {
        const param = `dl-${url.searchParams.get("filekey")}`;
        cdn.set(param, Buffer.from(await req.arrayBuffer()));
        calls.push({ path: "cdn/upload", body: { filekey: url.searchParams.get("filekey") }, headers });
        return new Response("", { headers: { "x-encrypted-param": param } });
      }
      if (url.pathname === "/cdn/download") {
        const b = cdn.get(url.searchParams.get("encrypted_query_param") ?? "");
        return b ? new Response(new Uint8Array(b)) : new Response("no", { status: 404 });
      }
      if (url.pathname === "/ilink/bot/get_qrcode_status") {
        calls.push({ path: "get_qrcode_status", body: Object.fromEntries(url.searchParams), headers });
        const next = statuses.shift();
        if (!next) await new Promise((r) => setTimeout(r, 20));
        return Response.json(next ?? { status: "wait" });
      }
      const path = url.pathname.replace(/^\/ilink\/bot\//, "");
      const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, any>) : {};
      if (path !== "getupdates") calls.push({ path, body, headers });
      if (path === "get_bot_qrcode") {
        qrN++;
        return Response.json({ qrcode: `qr-${qrN}`, qrcode_img_content: `https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=qr-${qrN}&bot_type=3` });
      }
      if (headers.authorization !== `Bearer ${token}` || headers.authorizationtype !== "ilink_bot_token") return Response.json({ ret: -14, errcode: -14, errmsg: "session timeout" });
      if (stale) return Response.json({ ret: -14, errcode: -14, errmsg: "session timeout" });
      const raw = (text: string) => new Response(text, { headers: { "content-type": "application/json" } });
      switch (path) {
        case "msg/notifystart":
        case "msg/notifystop":
        case "sendtyping":
          return Response.json({ ret: 0 });
        case "getconfig":
          return Response.json({ ret: 0, typing_ticket: "dHlwaW5n" });
        case "getupdates": {
          if (!msgs.length) await new Promise<void>((r) => ((wake = r), setTimeout(r, 300)));
          const out = msgs.splice(0);
          if (out.length) buf++;
          // message_id goes out as a bare uint64, as WeChat sends it.
          const json = JSON.stringify({ ret: 0, msgs: out, get_updates_buf: `buf-${buf}`, longpolling_timeout_ms: 35000 }).replace(/"message_id":"(\d+)"/g, '"message_id":$1');
          return raw(json);
        }
        case "sendmessage": {
          const ret = sendRets.shift() ?? 0;
          if (ret) return Response.json({ ret });
          const id = String(nextId++);
          return raw(`{"ret":0,"message_id":${id}}`);
        }
        case "getuploadurl":
          return Response.json({ upload_full_url: `http://127.0.0.1:${server.port}/cdn/upload?filekey=${body.filekey}` });
        default:
          return Response.json({ ret: -1, errmsg: `unknown ${path}` }, { status: 404 });
      }
    },
  });
  const api = `http://127.0.0.1:${server.port}`;
  const push = (m: any) => {
    msgs.push({ message_id: String(nextId++), message_type: 1, context_token: `ctx-${nextId}`, ...m });
    wake?.();
  };

  return {
    token,
    botId,
    api,
    calls,
    /** The calls to one path (sendmessage, getuploadurl, …). */
    sent: (path: string) => calls.filter((c) => c.path === path).map((c) => c.body),
    /** The words of every message the bot sent, in order. */
    texts: () => calls.filter((c) => c.path === "sendmessage").map((c) => c.body.msg?.item_list?.[0]?.text_item?.text).filter((t): t is string => typeof t === "string"),
    /** The scan's next answers. */
    scan(...s: any[]) {
      statuses.push(...s);
    },
    confirm(user = SCANNER) {
      statuses.push({ status: "confirmed", bot_token: token, ilink_bot_id: botId, baseurl: api, ilink_user_id: user });
    },
    says(from: string, text: string, extra: Record<string, unknown> = {}) {
      push({ from_user_id: from, to_user_id: botId, item_list: [{ type: 1, text_item: { text } }], ...extra });
    },
    voice(from: string, transcript: string) {
      push({ from_user_id: from, to_user_id: botId, item_list: [{ type: 3, voice_item: { text: transcript, encode_type: 6 } }] });
    },
    /** A picture, encrypted on the fake CDN as WeChat does it. */
    picture(from: string, bytes: Uint8Array) {
      const key = randomBytes(16);
      const param = `in-${randomBytes(4).toString("hex")}`;
      cdn.set(param, ecb(key, true, Buffer.from(bytes)));
      push({ from_user_id: from, to_user_id: botId, item_list: [{ type: 2, image_item: { aeskey: key.toString("hex"), media: { encrypt_query_param: param, full_url: `${api}/cdn/download?encrypted_query_param=${param}` }, mid_size: bytes.length } }] });
    },
    inGroup(from: string, text: string) {
      push({ from_user_id: from, group_id: "g1@chatroom", item_list: [{ type: 1, text_item: { text } }] });
    },
    /** What a sent picture or file decrypts to, with the key the client sent. */
    opened(item: any): Buffer | undefined {
      const m = item?.media;
      const b = cdn.get(m?.encrypt_query_param ?? "");
      if (!b || !m?.aes_key) return undefined;
      return ecb(Buffer.from(Buffer.from(m.aes_key, "base64").toString("ascii"), "hex"), false, b);
    },
    sendAnswers(...rets: number[]) {
      sendRets.push(...rets);
    },
    goStale() {
      stale = true;
      wake?.();
    },
    stop: () => server.stop(true),
  };
}
