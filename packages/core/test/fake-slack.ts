// D276: a local stand-in for Slack's Web API and Socket Mode (the methods and envelopes Ducter's
// adapter uses), so the adapter and the hub are tested without a workspace or a real token.
import type { ServerWebSocket } from "bun";

export function fakeSlack(o: { botToken?: string; appToken?: string } = {}) {
  const botToken = o.botToken ?? "xoxb-1111-2222-abcdefghijklmnopqrst";
  const appToken = o.appToken ?? "xapp-1-A111-2222-abcdefghijklmnopqrst";
  const calls: { method: string; body: Record<string, any>; ts?: string }[] = [];
  const failures: { method: string; status: number; headers?: Record<string, string>; answer: any }[] = [];
  const sockets = new Set<ServerWebSocket<unknown>>();
  const acks: string[] = [];
  let ts = 1_700_000_000;
  let env = 0;
  let opened = 0;
  const nextTs = () => `${ts++}.000100`;
  const files = new Map<string, Uint8Array>();

  const server = Bun.serve({
    port: 0,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/socket") return srv.upgrade(req, { data: {} }) ? undefined : new Response("no", { status: 400 });
      if (url.pathname.startsWith("/files/")) {
        if (req.headers.get("authorization") !== `Bearer ${botToken}`) return new Response("no", { status: 403 });
        const b = files.get(url.pathname);
        return b ? new Response(b) : new Response("no", { status: 404 });
      }
      if (url.pathname === "/upload") {
        calls.push({ method: "upload", body: { bytes: (await req.arrayBuffer()).byteLength } });
        return new Response("OK");
      }
      const m = /^\/api\/([\w.]+)$/.exec(url.pathname);
      if (!m) return new Response("no", { status: 404 });
      const method = m[1]!;
      const auth = req.headers.get("authorization");
      const body: Record<string, any> = {};
      for (const [k, v] of new URLSearchParams(await req.text())) {
        try {
          body[k] = /^[[{]/.test(v) ? JSON.parse(v) : v;
        } catch {
          body[k] = v;
        }
      }
      const fail = failures.findIndex((f) => f.method === method);
      if (fail >= 0) {
        const f = failures.splice(fail, 1)[0]!;
        calls.push({ method: `${method}!`, body });
        return Response.json(f.answer, { status: f.status, headers: f.headers });
      }
      const wantApp = method === "apps.connections.open";
      if (auth !== `Bearer ${wantApp ? appToken : botToken}`) return Response.json({ ok: false, error: "invalid_auth" });
      calls.push({ method, body });
      const ok = (x: Record<string, unknown> = {}) => Response.json({ ok: true, ...x });
      switch (method) {
        case "auth.test":
          return ok({ user_id: "UBOT", user: "ducter", team: "Acme", bot_id: "B1" });
        case "apps.connections.open":
          opened++;
          return ok({ url: `ws://127.0.0.1:${server.port}/socket` });
        case "chat.postMessage":
          calls.at(-1)!.ts = nextTs();
          return ok({ ts: calls.at(-1)!.ts, channel: body.channel });
        case "chat.update":
          return ok({ ts: body.ts, channel: body.channel });
        case "users.info":
          return ok({ user: { id: body.user, name: "wey", real_name: "Wey Gu", profile: { display_name: "Wey" } } });
        case "files.getUploadURLExternal":
          return ok({ upload_url: `http://127.0.0.1:${server.port}/upload`, file_id: "F1" });
        case "files.completeUploadExternal":
          return ok({ files: [{ id: "F1" }] });
        default:
          return Response.json({ ok: false, error: "unknown_method" });
      }
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
        ws.send(JSON.stringify({ type: "hello", num_connections: 1 }));
      },
      message(_ws, m) {
        const j = JSON.parse(String(m));
        if (j.envelope_id) acks.push(j.envelope_id);
      },
      close(ws) {
        sockets.delete(ws);
      },
    },
  });

  const envelope = (type: string, payload: unknown) => {
    const id = `env${++env}`;
    for (const ws of sockets) ws.send(JSON.stringify({ envelope_id: id, type, payload, accepts_response_payload: false }));
    return id;
  };

  return {
    botToken,
    appToken,
    api: `http://127.0.0.1:${server.port}/api`,
    calls,
    acks,
    sent: (method: string) => calls.filter((c) => c.method === method).map((c) => c.body),
    opened: () => opened,
    /** The ts of the bot's last message. */
    lastTs: () => calls.filter((c) => c.method === "chat.postMessage").at(-1)!.ts!,
    connected: () => sockets.size > 0,
    /** A DM to the bot from user (its DM channel is D-<user>). */
    says(user: string, text: string, extra: Record<string, unknown> = {}) {
      const t = nextTs();
      envelope("events_api", { event: { type: "message", channel: `D${user}`, channel_type: "im", user, text, ts: t, ...extra } });
      return t;
    },
    sendsFile(user: string, bytes: Uint8Array, name: string) {
      const t = nextTs();
      const path = `/files/${name}`;
      files.set(path, bytes);
      envelope("events_api", { event: { type: "message", subtype: "file_share", channel: `D${user}`, channel_type: "im", user, text: "", ts: t, files: [{ id: "Fx", name, size: bytes.length, url_private_download: `http://127.0.0.1:${server.port}${path}` }] } });
      return t;
    },
    inChannel(user: string, text: string) {
      envelope("events_api", { event: { type: "message", channel: "C1", channel_type: "channel", user, text, ts: nextTs() } });
    },
    taps(user: string, messageTs: string, value: string) {
      return envelope("interactive", { type: "block_actions", user: { id: user }, channel: { id: `D${user}` }, container: { message_ts: messageTs }, trigger_id: `tr${env}`, actions: [{ action_id: "ducter_0", value }] });
    },
    /** Slack's refresh: the socket is told to go, and a new one is opened. */
    refresh() {
      for (const ws of sockets) ws.send(JSON.stringify({ type: "disconnect", reason: "refresh_requested" }));
    },
    failNext(method: string, status: number, answer: any, headers?: Record<string, string>) {
      failures.push({ method, status, answer, headers });
    },
    stop: () => server.stop(true),
  };
}
