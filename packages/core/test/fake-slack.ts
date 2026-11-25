// D276: a local stand-in for Slack's Web API and Socket Mode (the methods and envelopes Ducter's
// adapter uses), so the adapter and the hub are tested without a workspace or a real token.
import type { ServerWebSocket } from "bun";

/**
 * scopes: the bot token's scopes as Slack lists them in x-oauth-scopes (D531; absent: no header).
 * A post with a username or icon_url without chat:write.customize answers missing_scope.
 */
export function fakeSlack(o: { botToken?: string; appToken?: string; scopes?: string[]; /** D580: display names by user id (users.info); others are "Wey". */ names?: Record<string, string> } = {}) {
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
  let scopes = o.scopes;
  /** D580: every message in a channel (people's and the bot's), for conversations.replies. */
  const history: Record<string, any>[] = [];
  const keep = (m: Record<string, any>) => void (m.channel && !String(m.channel).startsWith("D") && !history.some((x) => x.channel === m.channel && x.ts === m.ts) && history.push(m));

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
      const headers = scopes ? { "x-oauth-scopes": scopes.join(",") } : undefined;
      const ok = (x: Record<string, unknown> = {}) => Response.json({ ok: true, ...x }, { headers });
      switch (method) {
        case "auth.test":
          return ok({ user_id: "UBOT", user: "ducter", team: "Acme", team_id: "T0ACME", bot_id: "B1" });
        case "bots.info":
          return ok({ bot: { id: body.bot, app_id: "A0DUCTER", name: "ducter" } });
        case "apps.connections.open":
          opened++;
          return ok({ url: `ws://127.0.0.1:${server.port}/socket` });
        case "chat.postMessage":
          if ((body.username || body.icon_url) && scopes && !scopes.includes("chat:write.customize")) {
            calls.at(-1)!.method = "chat.postMessage!";
            return Response.json({ ok: false, error: "missing_scope", needed: "chat:write.customize", provided: scopes.join(",") }, { headers });
          }
          calls.at(-1)!.ts = nextTs();
          keep({ channel: body.channel, ts: calls.at(-1)!.ts, ...(body.thread_ts ? { thread_ts: body.thread_ts } : {}), text: body.text, user: "UBOT", bot_id: "B1", ...(body.username ? { username: body.username } : {}) });
          return ok({ ts: calls.at(-1)!.ts, channel: body.channel });
        case "conversations.replies": {
          // D580: a thread's messages, the parent first, then the replies, between oldest and latest.
          const need = String(body.channel).startsWith("G") ? "groups:history" : "channels:history";
          if (scopes && !scopes.includes(need)) return Response.json({ ok: false, error: "missing_scope", needed: need, provided: scopes.join(",") }, { headers });
          const n = (x: string) => Number(x);
          const inc = body.inclusive === "true";
          const all = history
            .filter((m) => m.channel === body.channel && (m.ts === body.ts || m.thread_ts === body.ts))
            .filter((m) => (!body.latest || (inc ? n(m.ts) <= n(body.latest) : n(m.ts) < n(body.latest))) && (!body.oldest || (inc ? n(m.ts) >= n(body.oldest) : n(m.ts) > n(body.oldest))))
            .sort((a, b) => n(a.ts) - n(b.ts));
          const from = Number(body.cursor ?? 0);
          const size = Number(body.limit ?? 100);
          const more = from + size < all.length;
          return ok({ messages: all.slice(from, from + size), has_more: more, ...(more ? { response_metadata: { next_cursor: String(from + size) } } : {}) });
        }
        case "chat.update":
          return ok({ ts: body.ts, channel: body.channel });
        case "users.info":
          return ok({ user: { id: body.user, name: "wey", real_name: o.names?.[body.user] ?? "Wey Gu", profile: { display_name: o.names?.[body.user] ?? "Wey" } } });
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
    /** D531: user @-mentions the bot in a channel it was added to (Slack's app_mention event). */
    mentions(user: string, channel: string, text: string, extra: Record<string, unknown> = {}) {
      const t = nextTs();
      const ev = { type: "app_mention", channel, user, text: `<@UBOT> ${text}`, ts: t, event_ts: t, ...extra };
      keep(ev);
      envelope("events_api", { event: ev });
      return t;
    },
    /** A message in a channel the bot is in (message.channels); D571: with thread_ts, a reply in that thread. */
    inChannel(user: string, text: string, extra: Record<string, unknown> = {}, channel = "C1") {
      const t = nextTs();
      const ev = { type: "message", channel, channel_type: "channel", user, text, ts: t, ...extra };
      keep(ev);
      envelope("events_api", { event: ev });
      return t;
    },
    /** D580: a message in a channel that sends the bot no event (an app's, or before the scopes). */
    posted(user: string, text: string, extra: Record<string, unknown> = {}, channel = "C1") {
      const t = nextTs();
      keep({ type: "message", channel, user, text, ts: t, ...extra });
      return t;
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
    /** D531: the app reinstalled with other scopes. */
    setScopes: (s: string[] | undefined) => void (scopes = s),
    stop: () => server.stop(true),
  };
}
