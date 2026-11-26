// D622: a local stand-in for Feishu / Lark's open API and long connection (only the calls the
// adapter makes), so the adapter and the hub are tested without a tenant or a real app.
import type { ServerWebSocket } from "bun";
import { decodeFeishuFrame, encodeFeishuFrame, feishuPing, type FeishuFrame } from "../src/channels/feishu.ts";

export function fakeFeishu(o: { appId?: string; appSecret?: string; name?: string; openId?: string } = {}) {
  const appId = o.appId ?? "cli_fake1234567890";
  const appSecret = o.appSecret ?? "fake-secret-123456";
  const botName = o.name ?? "Ducter";
  const botOpenId = o.openId ?? "ou_bot";
  const token = "t-fake-tenant-token";
  const calls: { method: string; path: string; body: Record<string, any> }[] = [];
  const failures: { path: string; status: number; body: any }[] = [];
  const sockets = new Set<ServerWebSocket<unknown>>();
  const frames: FeishuFrame[] = [];
  const acks: { code?: number; bizRt?: string; frame: FeishuFrame }[] = [];
  const pings: FeishuFrame[] = [];
  let message = 0;
  let event = 0;
  let sent = 0;
  const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });

  const server = Bun.serve({
    port: 0,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/socket") return srv.upgrade(req, { data: {} }) ? undefined : new Response("no", { status: 400 });
      const fail = failures.findIndex((f) => f.path === url.pathname);
      if (fail >= 0) {
        const f = failures.splice(fail, 1)[0]!;
        calls.push({ method: `${req.method}!`, path: url.pathname, body: {} });
        return json(f.body, f.status);
      }
      let body: Record<string, any> = {};
      if (req.method !== "GET") {
        try {
          body = (await req.json()) as Record<string, any>;
        } catch {
          body = {};
        }
      }
      calls.push({ method: req.method, path: url.pathname, body });

      if (url.pathname === "/open-apis/auth/v3/tenant_access_token/internal") {
        if (body.app_id !== appId || body.app_secret !== appSecret) return json({ code: 10003, msg: "invalid app_id or app_secret" });
        return json({ code: 0, msg: "ok", tenant_access_token: token, expire: 7200 });
      }
      if (url.pathname === "/callback/ws/endpoint") {
        if (body.AppID !== appId || body.AppSecret !== appSecret) return json({ code: 10003, msg: "invalid app_id or app_secret" });
        return json({ code: 0, msg: "ok", data: { URL: `ws://127.0.0.1:${server.port}/socket?service_id=7&device_id=d1`, ClientConfig: { PingInterval: 60 } } });
      }
      if (req.headers.get("authorization") !== `Bearer ${token}`) return json({ code: 99991663, msg: "invalid access token" });
      if (url.pathname === "/open-apis/bot/v3/info") return json({ code: 0, msg: "ok", bot: { activate_status: 2, app_name: botName, open_id: botOpenId } });
      if (url.pathname === "/open-apis/im/v1/messages" && req.method === "POST") {
        if (!body.receive_id) return json({ code: 230034, msg: "The receive_id is invalid." });
        sent++;
        return json({ code: 0, msg: "success", data: { message_id: `om_bot_${sent}`, chat_id: `oc_${body.receive_id}` } });
      }
      const reply = /^\/open-apis\/im\/v1\/messages\/([^/]+)\/reply$/.exec(url.pathname);
      if (reply) {
        sent++;
        return json({ code: 0, msg: "success", data: { message_id: `om_bot_${sent}`, parent_id: decodeURIComponent(reply[1]!), chat_id: "oc_reply" } });
      }
      const edit = /^\/open-apis\/im\/v1\/messages\/([^/]+)$/.exec(url.pathname);
      if (edit && req.method === "PUT") return json({ code: 0, msg: "success", data: { message_id: decodeURIComponent(edit[1]!) } });
      return json({ code: 230001, msg: `unscripted ${req.method} ${url.pathname}` });
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
      },
      message(_ws, m) {
        const bytes = m instanceof Uint8Array ? m : new Uint8Array(m as ArrayBuffer);
        let frame: FeishuFrame;
        try {
          frame = decodeFeishuFrame(bytes);
        } catch {
          return;
        }
        frames.push(frame);
        const type = frame.headers.find(([k]) => k === "type")?.[1];
        if (frame.method === 0 && type === "ping") {
          pings.push(frame);
          // The server's pong, in the same control frame shape.
          _ws.send(encodeFeishuFrame({ seqId: frame.seqId, logId: frame.logId, service: frame.service, method: 0, headers: [["type", "pong"]], payload: new Uint8Array() }));
          return;
        }
        if (frame.method === 1) {
          let j: { code?: number } = {};
          try {
            j = JSON.parse(new TextDecoder().decode(frame.payload)) as { code?: number };
          } catch {
            /* not an ack */
          }
          acks.push({ ...(j.code !== undefined ? { code: j.code } : {}), ...(frame.headers.find(([k]) => k === "biz_rt") ? { bizRt: frame.headers.find(([k]) => k === "biz_rt")![1] } : {}), frame });
        }
      },
      close(ws) {
        sockets.delete(ws);
      },
    },
  });

  const sendFrame = (chatType: "p2p" | "group", from: string, text: string, extra: Record<string, unknown> = {}) => {
    const id = `om_msg_${++message}`;
    const content = typeof extra.content === "string" ? extra.content : JSON.stringify({ text });
    const payload = {
      schema: "2.0",
      header: { event_id: `ev_${++event}`, event_type: "im.message.receive_v1", create_time: String(Date.now()), app_id: appId, tenant_key: "t1" },
      event: {
        sender: { sender_id: { open_id: from }, sender_type: "user", tenant_key: "t1" },
        message: {
          message_id: id,
          ...(extra.parent ? { parent_id: extra.parent } : {}),
          chat_id: extra.chat ?? (chatType === "p2p" ? `oc_${from}` : "oc_group"),
          chat_type: chatType,
          message_type: extra.message_type ?? "text",
          content,
          ...(extra.mentions ? { mentions: extra.mentions } : {}),
        },
      },
    };
    for (const ws of sockets) ws.send(encodeFeishuFrame({ seqId: 1, logId: event, service: 7, method: 1, headers: [["type", "event"], ["message_id", id], ["sum", "1"], ["seq", "0"]], payload: new TextEncoder().encode(JSON.stringify(payload)) }));
    return id;
  };

  return {
    appId,
    appSecret,
    token,
    origin: `http://127.0.0.1:${server.port}`,
    calls,
    acks,
    pings,
    frames,
    connected: () => sockets.size > 0,
    sent: (path = "") => calls.filter((c) => c.method === "POST" && c.path.includes(path)).map((c) => c.body),
    sends: () => calls.filter((c) => c.method === "POST" && c.path === "/open-apis/im/v1/messages").map((c) => c.body),
    replies: () => calls.filter((c) => c.method === "POST" && c.path.endsWith("/reply")).map((c) => ({ path: c.path, ...c.body })),
    edits: () => calls.filter((c) => c.method === "PUT").map((c) => ({ path: c.path, ...c.body })),
    /** A direct message from a Feishu user. */
    says(from: string, text: string, extra: Record<string, unknown> = {}) {
      return sendFrame("p2p", from, text, extra);
    },
    /** A group message (never the person's window). */
    groupSays(from: string, text: string, extra: Record<string, unknown> = {}) {
      return sendFrame("group", from, text, extra);
    },
    /** A frame the fake sends unchanged, for split packets and malformed data. */
    sendRaw(bytes: Uint8Array) {
      for (const ws of sockets) ws.send(bytes);
    },
    pingFrame: () => feishuPing(7),
    failNext(path: string, status: number, body: any) {
      failures.push({ path, status, body });
    },
    stop: () => server.stop(true),
  };
}
