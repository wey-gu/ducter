// D276: Slack, through the person's own Slack app with a bot user (never a user token: the partner
// speaks as itself, never as the person). Socket Mode: the app-level token (xapp-) opens a
// WebSocket, so the home needs no public address. Every envelope is acknowledged by its
// envelope_id once it was handled (Slack resends one that wasn't; the hub drops repeats). The
// socket is refreshed by Slack every few hours: a disconnect opens a new one.
//
// Tokens ride only in the Authorization header; no error or log line here ever carries one.
import { readFileSync } from "node:fs";
import { parseMarkdown, slackEscape, splitParsed, toSlack } from "./format.ts";
import { ChannelError, RetryAfter, type BotInfo, type Channel, type ChannelEvents, type InFile, type InMessage, type OutPart, type ThreadSaid } from "./port.ts";

export const SLACK_API = "https://slack.com/api";
/** Slack keeps 40,000 characters of a message's text; a section block holds 3,000. */
export const SLACK_MAX_TEXT = 39_000;
export const SLACK_SECTION_MAX = 3_000;
export const SLACK_BUTTON_MAX = 75;

/**
 * D531: each partner's face, as a picture Slack can fetch (icon_url must be a public address; a
 * home is often on localhost or a private network). One PNG per look on the site.
 */
export const FACE_BASE = "https://ducter.ai/faces";
export const faceUrl = (look: string) => `${FACE_BASE}/${/^[a-z]+$/.test(look) ? look : "sand"}.png`;
/** D531: the scope that lets a message carry its own name and picture. */
export const SLACK_CUSTOMIZE = "chat:write.customize";
/** D531: what the current manifest adds to an older app; one missing means a reinstall. */
export const SLACK_NEWER_SCOPES = [SLACK_CUSTOMIZE, "app_mentions:read", "channels:history", "groups:history"];
/** D571: what a thread it answers in needs: the channel's messages (public and private), read only there. */
export const SLACK_THREAD_SCOPES = ["channels:history", "groups:history"];
/** D531: opens the app's messages in Slack (the desktop app when there is one, else the browser). */
export const slackAppLink = (appId: string, teamId?: string) => `https://slack.com/app_redirect?app=${encodeURIComponent(appId)}${teamId ? `&team=${encodeURIComponent(teamId)}` : ""}`;

export const isSlackBotToken = (t: string) => /^xoxb-[A-Za-z0-9-]{20,}$/.test(t.trim());
export const isSlackAppToken = (t: string) => /^xapp-[A-Za-z0-9-]{20,}$/.test(t.trim());

/**
 * The app the person creates at api.slack.com › Create New App › From a manifest: a bot user that
 * is the partner, the DM tab, Socket Mode, interactivity for buttons, and only the scopes a DM
 * with the partner needs (no channel reads, no user scopes). D531: chat:write.customize, so each
 * message carries its partner's own name and face; Socket Mode on and token rotation off, so the
 * person never has to touch either (rotation can't be turned off once on). app_mention with
 * app_mentions:read, so the person can @ the partner in a channel it was added to. D571:
 * message.channels / message.groups with channels:history / groups:history, so the person's replies
 * in a thread the partner answered in reach it without an @ (Slack sends a channel's messages only
 * with these; the hub takes only the linked person's, only in such a thread). D580: the same scopes
 * let it read a thread it is @-mentioned in (conversations.replies), on the person's words there only.
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
      oauth_config: { scopes: { bot: ["app_mentions:read", "channels:history", "chat:write", SLACK_CUSTOMIZE, "groups:history", "im:history", "im:read", "im:write", "users:read", "files:read", "files:write"] } },
      settings: {
        event_subscriptions: { bot_events: ["app_mention", "message.channels", "message.groups", "message.im"] },
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
  let myBot: string | undefined;
  const names = new Map<string, string>();
  let scopes: string | null = null;
  let events: ChannelEvents | undefined;

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
    // D531: Slack lists the bot token's scopes on every answer: a reinstall that added
    // chat:write.customize is seen on the next call, and the partners' faces come back by themselves.
    const listed = token === bot ? res.headers.get("x-oauth-scopes") : null;
    if (listed !== null) {
      scopes = listed;
      if (me && fresh(me, listed)) events?.changed?.();
    }
    if (j.ok) return j;
    const e = String(j.error ?? "error");
    // D531: an app made before chat:write.customize: its own name and face can't be set; the hub
    // posts plainly and Settings asks once for a reinstall (never a refused token).
    if (e === "missing_scope" && String((j as { needed?: string }).needed ?? "").includes(SLACK_CUSTOMIZE)) throw new NoCustomize();
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

  /** D531: what came in and why it was dropped, at info level, so a silent bot can be diagnosed (never the words). */
  const note = (what: string) => console.info(`[slack] ${what}`);
  const onEvent = async (ev: SlackEvent, on: ChannelEvents) => {
    const mention = ev.type === "app_mention";
    const where = mention ? "a mention" : `a message (${ev.channel_type ?? "?"})`;
    if (ev.type !== "message" && !mention) return note(`ignored: event ${ev.type}`);
    // D571: a channel's own messages come only for threads. Its top-level talk (and its edits) is
    // none of the partner's and is dropped without a line: a busy channel would fill the journal.
    const shared = !mention && (ev.channel_type === "channel" || ev.channel_type === "group");
    const threaded = !!ev.thread_ts && ev.thread_ts !== ev.ts;
    if (shared && !threaded) return;
    if (ev.bot_id) return note(`ignored: ${where} from a bot`);
    if (ev.subtype && ev.subtype !== "file_share" && ev.subtype !== "thread_broadcast") return note(`ignored: ${where} of subtype ${ev.subtype}`);
    if (!ev.user || !ev.channel || !ev.ts || ev.user === me?.id) return note(`ignored: ${where} with no sender, or its own`);
    // A mention in the DM also comes as message.im: the DM's own copy is the one taken.
    if (mention && ev.channel.startsWith("D")) return note("ignored: a mention in a DM (taken as the DM message)");
    // D571: a thread message that @-mentions the bot comes as app_mention too: that copy is the one taken.
    if (shared && me && (ev.text ?? "").includes(`<@${me.id}`)) return note(`ignored: ${where} in a thread with an @ (taken as the mention)`);
    note(`received: ${where}${shared ? " in a thread" : ""}`);
    const base: Omit<InMessage, "id" | "text"> = {
      chat: ev.channel,
      from: { id: ev.user, name: names.get(ev.user) ?? ev.user },
      direct: !mention && ev.channel_type === "im",
      ...(mention ? { mention: true } : {}),
      ...(ev.thread_ts && ev.thread_ts !== ev.ts ? { replyTo: ev.thread_ts } : {}),
    };
    // The person's own words first, then each message they shared from someone else, as outside data.
    // A mention's own @ of the bot is no part of what they said.
    const own = mention ? plain((ev.text ?? "").replace(new RegExp(`<@${me?.id ?? "\\w+"}(\\|[^>]*)?>`, "g"), "")).trim() : plain(ev.text ?? "");
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
    caps: { buttons: true, edit: true, typing: false, files: true, as: true, maxText: SLACK_MAX_TEXT, maxDownload: 50 * 1024 * 1024, maxUpload: 50 * 1024 * 1024, silent: false },
    async start(on) {
      events = on;
      const r = await call<{ user_id: string; user?: string; team?: string; team_id?: string; bot_id?: string }>("auth.test", {});
      // The app token is checked by opening the socket once (a refusal throws here, in words).
      await call("apps.connections.open", {}, app).catch((err) => {
        if (err instanceof ChannelError && err.trouble === "token") throw new ChannelError("token", "Slack refused the app-level token");
        throw err;
      });
      // D531: the app's id, for the link that opens its messages (best effort: users:read covers it).
      const appId = r.bot_id ? await call<{ bot?: { app_id?: string } }>("bots.info", { bot: r.bot_id }).then((b) => b.bot?.app_id, () => undefined) : undefined;
      // Slack lists a token's scopes on every answer; absent (an older proxy), assume it can and learn on the first post.
      myBot = r.bot_id;
      me = { id: r.user_id, name: r.user ?? "Ducter", ...(r.team ? { team: r.team } : {}), ...(r.team_id ? { teamId: r.team_id } : {}), ...(appId ? { appId } : {}) };
      if (scopes !== null) fresh(me, scopes);
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
      const body = { channel: chat, text, ...(blocks(p, text) ? { blocks: blocks(p, text) } : {}), ...(p.replyTo ? { thread_ts: p.replyTo } : {}), unfurl_links: false, unfurl_media: false };
      // D531: each partner under its own name and face, when the app may.
      if (p.as && me?.customize !== false) {
        try {
          return (await call<{ ts: string }>("chat.postMessage", { ...body, username: p.as.name.slice(0, 80), icon_url: p.as.icon })).ts;
        } catch (err) {
          if (!(err instanceof NoCustomize)) throw err;
          if (me) (me.customize = false), (me.reinstall = true);
          events?.changed?.();
        }
      }
      return (await call<{ ts: string }>("chat.postMessage", body)).ts;
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
    // D580: the thread so far, when the partner is first @-mentioned in it (or what it missed since),
    // through conversations.replies (channels:history / groups:history). Read only on the linked
    // person's own words there; nothing of it is kept but what the hub logs with those words.
    async thread(chat, ts, o) {
      if (scopes !== null) {
        const has = new Set(scopes.split(",").map((x) => x.trim()));
        if (SLACK_THREAD_SCOPES.every((x) => !has.has(x))) return { unread: "scope" };
      }
      const all: SlackMsg[] = [];
      try {
        let cursor: string | undefined;
        for (let page = 0; page < THREAD_PAGES; page++) {
          const r = await call<{ messages?: SlackMsg[]; has_more?: boolean; response_metadata?: { next_cursor?: string } }>("conversations.replies", { channel: chat, ts, latest: o.before, ...(o.after ? { oldest: o.after } : {}), inclusive: "true", limit: "200", ...(cursor ? { cursor } : {}) });
          all.push(...(r.messages ?? []));
          cursor = r.response_metadata?.next_cursor || undefined;
          if (!r.has_more || !cursor) break;
        }
      } catch (err) {
        return { unread: err instanceof ChannelError && /missing_scope|not_allowed_token_type/.test(err.message) ? "scope" : "failed" };
      }
      const seen = new Set<string>();
      const kept = all
        .filter((m) => m.ts && !seen.has(m.ts) && (seen.add(m.ts), true))
        .filter((m) => cmpTs(m.ts!, o.before) < 0 && (!o.after || cmpTs(m.ts!, o.after) >= 0))
        .filter((m) => !m.subtype || THREAD_SUBTYPES.has(m.subtype))
        .sort((a, b) => cmpTs(a.ts!, b.ts!));
      const first = kept[0]?.ts === ts ? kept.slice(0, 1) : [];
      const rest = kept.slice(first.length);
      const shown = [...first, ...rest.slice(Math.max(0, rest.length - (o.max - first.length)))];
      // Who wrote each, and everyone @-mentioned in them, by name (users:read; cached, bounded).
      const ids = new Set<string>();
      for (const m of shown) {
        if (m.user && !m.bot_id) ids.add(m.user);
        for (const x of (m.text ?? "").matchAll(/<@([UW][A-Z0-9]+)(\|[^>]*)?>/g)) ids.add(x[1]!);
      }
      await Promise.all([...ids].slice(0, 30).map((id) => (id === me?.id ? Promise.resolve() : nameOf(id))));
      const said: ThreadSaid[] = shown.map((m) => {
        const mine = (!!myBot && m.bot_id === myBot) || (!!me && m.user === me.id);
        const bot = !mine && !!m.bot_id;
        const name = mine ? (m.username ?? me?.name ?? "Ducter") : bot ? (m.username ?? m.bot_profile?.name ?? "an app") : (names.get(m.user ?? "") ?? m.user ?? "someone");
        const text = [
          plain((m.text ?? "").replace(/<@([UW][A-Z0-9]+)(\|[^>]*)?>/g, (_, id: string) => `@${id === me?.id ? me.name : (names.get(id) ?? id)}`).replace(/<#C\w+\|([^>]+)>/g, "#$1").replace(/<!(here|channel|everyone)>/g, "@$1")),
          ...(m.files ?? []).map((x) => `[a file: ${x.name ?? "file"}]`),
          ...(m.attachments ?? []).filter((a) => a.is_share).map((a) => `[shared${a.author_name ? ` from ${a.author_name}` : ""}: ${plain(a.text ?? a.fallback ?? "").slice(0, 300)}]`),
        ]
          .filter((x) => x.trim())
          .join(" ");
        return { ts: m.ts!, from: { id: m.user ?? m.bot_id ?? "", name }, ...(mine ? { mine: true } : {}), ...(bot ? { bot: true } : {}), text };
      });
      return { said, more: kept.length - shown.length };
    },
  };
}

/** D580: at most this many pages of conversations.replies (200 a page) for one thread. */
const THREAD_PAGES = 5;
/** D580: the kinds of a thread's messages that are someone's words (joins, topic changes and the like are not). */
const THREAD_SUBTYPES = new Set(["file_share", "thread_broadcast", "bot_message", "me_message"]);
type SlackMsg = { ts?: string; user?: string; bot_id?: string; username?: string; bot_profile?: { name?: string }; subtype?: string; text?: string; files?: SlackFile[]; attachments?: { is_share?: boolean; text?: string; fallback?: string; author_name?: string }[] };
/** Slack's ts ("1700000000.000100") in order, exactly (a float would lose the last digits). */
export function cmpTs(a: string, b: string): number {
  const [ai = "", af = ""] = a.split(".");
  const [bi = "", bf = ""] = b.split(".");
  return ai.length !== bi.length ? ai.length - bi.length : ai !== bi ? (ai < bi ? -1 : 1) : af.padEnd(6, "0") < bf.padEnd(6, "0") ? -1 : af.padEnd(6, "0") > bf.padEnd(6, "0") ? 1 : 0;
}

/** D531: what the bot token's listed scopes say it can do; true when that changed. */
function fresh(me: BotInfo, listed: string): boolean {
  const has = new Set(listed.split(",").map((x) => x.trim()));
  const before = `${me.customize}|${me.reinstall}`;
  if (has.has(SLACK_CUSTOMIZE)) delete me.customize;
  else me.customize = false;
  if (SLACK_NEWER_SCOPES.some((x) => !has.has(x))) me.reinstall = true;
  else delete me.reinstall;
  return `${me.customize}|${me.reinstall}` !== before;
}

/** D531: Slack refused a name and face for lack of chat:write.customize. */
class NoCustomize extends Error {
  constructor() {
    super("Slack: missing chat:write.customize");
  }
}
