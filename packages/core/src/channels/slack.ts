// D276: Slack, through the person's own Slack app with a bot user (never a user token: the partner
// speaks as itself, never as the person). Socket Mode: the app-level token (xapp-) opens a
// WebSocket, so the home needs no public address. Every envelope is acknowledged by its
// envelope_id once it was handled (Slack resends one that wasn't; the hub drops repeats). The
// socket is refreshed by Slack every few hours: a disconnect opens a new one.
//
// Tokens ride only in the Authorization header; no error or log line here ever carries one.
import { readFileSync } from "node:fs";
import { parseMarkdown, slackEscape, splitParsed, toSlack } from "./format.ts";
import { ChannelError, RetryAfter, type BotInfo, type Channel, type ChannelEvents, type InFile, type InMessage, type OutPart } from "./port.ts";

export const SLACK_API = "https://slack.com/api";
/** Slack keeps 40,000 characters of a message's text; a section block holds 3,000. */
export const SLACK_MAX_TEXT = 39_000;
export const SLACK_SECTION_MAX = 3_000;
export const SLACK_BUTTON_MAX = 75;

export const isSlackBotToken = (t: string) => /^xoxb-[A-Za-z0-9-]{20,}$/.test(t.trim());
export const isSlackAppToken = (t: string) => /^xapp-[A-Za-z0-9-]{20,}$/.test(t.trim());

/**
 * The app the person creates at api.slack.com › Create New App › From a manifest: a bot user that
 * is the partner, the DM tab, Socket Mode, interactivity for buttons, and only the scopes a DM
 * with the partner needs (no channel reads, no user scopes).
 */
export function slackManifest(name: string): string {
  const n = name.trim().slice(0, 35) || "Ducter";
  return JSON.stringify(
    {
      display_information: { name: n, description: `${n}, your partner in Ducter`, background_color: "#3d3a35" },
      features: {
        app_home: { home_tab_enabled: false, messages_tab_enabled: true, messages_tab_read_only_enabled: false },
        bot_user: { display_name: n, always_online: true },
      },
      oauth_config: { scopes: { bot: ["chat:write", "im:history", "im:read", "im:write", "users:read", "files:read", "files:write"] } },
      settings: {
        event_subscriptions: { bot_events: ["message.im"] },
        interactivity: { is_enabled: true },
        org_deploy_enabled: false,
        socket_mode_enabled: true,
        token_rotation_enabled: false,
      },
    },
    null,
    2,
  );
}

export interface SlackOpts {
  botToken: string;
  appToken: string;
  api?: string;
  fetch?: typeof fetch;
  /** The WebSocket to open Socket Mode's URL with (tests pass Bun's; it is the default). */
  WebSocket?: typeof WebSocket;
  backoffMs?: number;
}

type SlackFile = { id: string; name?: string; size?: number; url_private_download?: string; url_private?: string };
type SlackEvent = {
  type: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: SlackFile[];
  attachments?: { is_share?: boolean; is_msg_unfurl?: boolean; text?: string; fallback?: string; author_name?: string; author_subname?: string }[];
};

export function createSlack(o: SlackOpts): Channel {
  const api = (o.api ?? SLACK_API).replace(/\/$/, "");
  const f = o.fetch ?? fetch;
  const WS = o.WebSocket ?? WebSocket;
  const bot = o.botToken.trim();
  const app = o.appToken.trim();
  let running = false;
  let sock: WebSocket | undefined;
  let me: BotInfo | undefined;
  const names = new Map<string, string>();

  const call = async <T extends Record<string, unknown>>(method: string, body: Record<string, unknown>, token = bot): Promise<T> => {
    let res: Response;
    try {
      // Form-encoded, which every method takes (JSON bodies only the writing ones); lists and
      // objects (blocks, files) as JSON strings, as Slack documents them.
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) if (v !== undefined) form.set(k, typeof v === "string" ? v : JSON.stringify(v));
      res = await f(`${api}/${method}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
    } catch {
      throw new ChannelError("network", `Slack can't be reached (${method})`);
    }
    if (res.status === 429) throw new RetryAfter(Math.max(1, Number(res.headers.get("retry-after")) || 1) * 1000);
    if (res.status >= 500) throw new ChannelError("network", `Slack answered ${res.status} (${method})`);
    let j: { ok: boolean; error?: string } & T;
    try {
      j = (await res.json()) as typeof j;
    } catch {
      throw new ChannelError("network", `Slack answered ${res.status} (${method})`);
    }
    if (j.ok) return j;
    const e = String(j.error ?? "error");
    if (e === "ratelimited") throw new RetryAfter(1000);
    if (/^(invalid_auth|not_authed|account_inactive|token_revoked|token_expired|missing_scope|not_allowed_token_type)$/.test(e)) throw new ChannelError("token", `Slack refused the token: ${e} (${method})`);
    if (/^(cannot_dm_bot|user_disabled|channel_not_found|is_archived)$/.test(e)) throw new ChannelError("blocked", `Slack: ${e} (${method})`);
    throw new ChannelError("refused", `Slack: ${e} (${method})`);
  };

  const nameOf = async (user: string): Promise<string> => {
    if (names.has(user)) return names.get(user)!;
    try {
      const r = await call<{ user?: { real_name?: string; name?: string; profile?: { display_name?: string } } }>("users.info", { user });
      const n = r.user?.profile?.display_name || r.user?.real_name || r.user?.name || user;
      names.set(user, n);
      return n;
    } catch {
      return user;
    }
  };

  const fileOf = (x: SlackFile): InFile => ({
    name: x.name,
    bytes: x.size,
    async fetch() {
      const url = x.url_private_download ?? x.url_private;
      if (!url) throw new ChannelError("refused", "Slack gave no file");
      let res: Response;
      try {
        res = await f(url, { headers: { authorization: `Bearer ${bot}` } });
      } catch {
        throw new ChannelError("network", "Slack's file can't be reached");
      }
      if (!res.ok) throw new ChannelError("refused", `Slack's file answered ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  });

  /** Slack's own markup in the person's words, back to what they typed (<@U…>, <url|label>, entities). */
  const plain = (s: string) =>
    s
      .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
      .replace(/<(https?:[^>]+)>/g, "$1")
      .replace(/<mailto:[^|>]+\|([^>]+)>/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

  const onEvent = async (ev: SlackEvent, on: ChannelEvents) => {
    if (ev.type !== "message" || ev.bot_id || (ev.subtype && ev.subtype !== "file_share" && ev.subtype !== "thread_broadcast")) return;
    if (!ev.user || !ev.channel || !ev.ts || ev.user === me?.id) return;
    const base: Omit<InMessage, "id" | "text"> = {
      chat: ev.channel,
      from: { id: ev.user, name: names.get(ev.user) ?? ev.user },
      direct: ev.channel_type === "im",
      ...(ev.thread_ts && ev.thread_ts !== ev.ts ? { replyTo: ev.thread_ts } : {}),
    };
    // The person's own words first, then each message they shared from someone else, as outside data.
    const own = plain(ev.text ?? "");
    const files = (ev.files ?? []).map(fileOf);
    if (own.trim() || files.length) await on.message({ ...base, id: ev.ts, text: own, ...(files.length ? { files } : {}) });
    let n = 0;
    for (const a of ev.attachments ?? []) {
      if (!a.is_share && !a.is_msg_unfurl) continue;
      const text = plain(a.text ?? a.fallback ?? "");
      if (!text.trim()) continue;
      await on.message({ ...base, id: `${ev.ts}#${++n}`, text, forwarded: a.author_name ? { from: a.author_name } : {} });
    }
  };

  const connect = async (on: ChannelEvents) => {
    let pause = o.backoffMs ?? 2_000;
    while (running) {
      let url: string;
      try {
        url = (await call<{ url: string }>("apps.connections.open", {}, app)).url;
      } catch (err) {
        if (err instanceof ChannelError && err.trouble === "token") return on.trouble("token"), void (running = false);
        on.trouble("network");
        await new Promise((r) => setTimeout(r, err instanceof RetryAfter ? err.ms : pause));
        pause = Math.min(pause * 2, 60_000);
        continue;
      }
      const closed = new Promise<void>((resolve) => {
        const ws = new WS(url);
        sock = ws;
        ws.onopen = () => {
          pause = o.backoffMs ?? 2_000;
        };
        ws.onmessage = (m: MessageEvent) => {
          let env: { type?: string; envelope_id?: string; payload?: { event?: SlackEvent; type?: string; user?: { id: string }; channel?: { id: string }; container?: { message_ts?: string }; message?: { ts?: string }; actions?: { value?: string }[]; trigger_id?: string } };
          try {
            env = JSON.parse(String(m.data));
          } catch {
            return;
          }
          if (env.type === "hello") return on.trouble(undefined);
          if (env.type === "disconnect") return ws.close();
          const ack = () => env.envelope_id && ws.readyState === 1 && ws.send(JSON.stringify({ envelope_id: env.envelope_id }));
          const p = env.payload;
          let work: Promise<void> = Promise.resolve();
          if (env.type === "events_api" && p?.event) {
            const user = p.event.user;
            // A name lookup never delays the ack beyond what it must (Slack wants it within 3 s).
            work = (user && !names.has(user) ? Promise.race([nameOf(user), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve()).then(() => onEvent(p.event!, on));
          } else if (env.type === "interactive" && p?.type === "block_actions" && p.user && p.channel) {
            const value = p.actions?.[0]?.value;
            const msg = p.container?.message_ts ?? p.message?.ts;
            if (value && msg) work = on.tap({ id: p.trigger_id ?? msg, chat: p.channel.id, message: msg, from: { id: p.user.id }, data: value });
          }
          void work.catch((err) => console.warn("[slack] an envelope:", (err as Error).message)).finally(ack);
        };
        ws.onclose = () => resolve();
        ws.onerror = () => {};
      });
      await closed;
      sock = undefined;
      if (running) await new Promise((r) => setTimeout(r, 250));
    }
  };

  const blocks = (p: OutPart, text: string) => {
    if (!p.buttons?.length) return undefined;
    return [
      { type: "section", text: { type: "mrkdwn", text: text.length > SLACK_SECTION_MAX ? text.slice(0, SLACK_SECTION_MAX - 1) + "…" : text } },
      {
        type: "actions",
        elements: p.buttons.slice(0, 5).map((b, i) =>
          "url" in b
            ? { type: "button", action_id: `ducter_link_${i}`, text: { type: "plain_text", text: b.label.slice(0, SLACK_BUTTON_MAX) }, url: b.url }
            : { type: "button", action_id: `ducter_${i}`, text: { type: "plain_text", text: b.label.slice(0, SLACK_BUTTON_MAX) }, value: b.data.slice(0, 2000), ...(b.style ? { style: b.style } : {}) },
        ),
      },
    ];
  };
  const textOf = (p: OutPart) => toSlack(splitParsed(parseMarkdown(p.text), SLACK_MAX_TEXT)[0]!) || "…";

  return {
    kind: "slack",
    caps: { buttons: true, edit: true, typing: false, files: true, maxText: SLACK_MAX_TEXT, maxDownload: 50 * 1024 * 1024, maxUpload: 50 * 1024 * 1024, silent: false },
    async start(on) {
      const r = await call<{ user_id: string; user?: string; team?: string }>("auth.test", {});
      // The app token is checked by opening the socket once (a refusal throws here, in words).
      await call("apps.connections.open", {}, app).catch((err) => {
        if (err instanceof ChannelError && err.trouble === "token") throw new ChannelError("token", "Slack refused the app-level token");
        throw err;
      });
      me = { id: r.user_id, name: r.user ?? "Ducter", ...(r.team ? { team: r.team } : {}) };
      running = true;
      void connect(on);
      return me;
    },
    stop() {
      running = false;
      sock?.close();
    },
    async send(chat, p) {
      const text = textOf(p);
      const r = await call<{ ts: string }>("chat.postMessage", { channel: chat, text, ...(blocks(p, text) ? { blocks: blocks(p, text) } : {}), ...(p.replyTo ? { thread_ts: p.replyTo } : {}), unfurl_links: false, unfurl_media: false });
      return r.ts;
    },
    async edit(chat, id, p) {
      const text = textOf(p);
      await call("chat.update", { channel: chat, ts: id, text, blocks: blocks(p, text) ?? [] });
    },
    async typing() {},
    async answerTap() {},
    async sendFile(chat, file) {
      const bytes = readFileSync(file.path);
      const up = await call<{ upload_url: string; file_id: string }>("files.getUploadURLExternal", { filename: file.name, length: bytes.length });
      let res: Response;
      try {
        res = await f(up.upload_url, { method: "POST", body: new Blob([bytes], { type: file.type }) });
      } catch {
        throw new ChannelError("network", "Slack's upload can't be reached");
      }
      if (!res.ok) throw new ChannelError("refused", `Slack's upload answered ${res.status}`);
      await call("files.completeUploadExternal", { files: [{ id: up.file_id, title: file.name }], channel_id: chat, ...(file.caption ? { initial_comment: slackEscape(file.caption) } : {}) });
      return up.file_id;
    },
  };
}
