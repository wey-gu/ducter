// D276: Telegram, through the person's own bot (its token from BotFather, pasted once). Long
// polling (getUpdates), so the home needs no public address. An update is confirmed (the next
// offset kept) only after it was handled, so a restart reads it again and the hub drops what it
// already logged. Words go out as plain text plus entities (format.ts), never MarkdownV2.
//
// The token is part of every Bot API URL: no error, log line or exception here ever carries a URL.
import { readFileSync } from "node:fs";
import { parseMarkdown, splitParsed, toTelegram } from "./format.ts";
import { ChannelError, RetryAfter, type BotInfo, type Channel, type ChannelEvents, type InFile, type InMessage, type OutPart } from "./port.ts";

export const TELEGRAM_API = "https://api.telegram.org";
export const TELEGRAM_MAX_TEXT = 4096;

/** BotFather's tokens: digits, a colon, 35 more characters. */
export const isTelegramToken = (t: string) => /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(t.trim());

export interface TelegramOpts {
  token: string;
  api?: string;
  fetch?: typeof fetch;
  /** Long-poll timeout in seconds (25 in use; tests make it short). */
  pollSeconds?: number;
  offset?: () => number | undefined;
  setOffset?: (n: number) => void;
  /** Pause after a failed poll (ms); grows to a minute. */
  backoffMs?: number;
}

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
  forward_origin?: { type: string; sender_user?: TgUser; sender_user_name?: string; chat?: { title?: string }; author_signature?: string };
  photo?: { file_id: string; file_size?: number; width: number; height: number }[];
  document?: { file_id: string; file_name?: string; file_size?: number };
  media_group_id?: string;
};
type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number } } } };

const nameOf = (u?: TgUser) => [u?.first_name, u?.last_name].filter(Boolean).join(" ") || (u?.username ? `@${u.username}` : "");

export function createTelegram(o: TelegramOpts): Channel {
  const api = (o.api ?? TELEGRAM_API).replace(/\/$/, "");
  const f = o.fetch ?? fetch;
  const token = o.token.trim();
  let running = false;
  let abort: AbortController | undefined;

  const call = async <T>(method: string, body?: unknown, form?: FormData): Promise<T> => {
    let res: Response;
    try {
      res = await f(`${api}/bot${token}/${method}`, form ? { method: "POST", body: form, signal: abort?.signal } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}), signal: abort?.signal });
    } catch {
      throw new ChannelError("network", `Telegram can't be reached (${method})`);
    }
    let j: { ok: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number } };
    try {
      j = (await res.json()) as typeof j;
    } catch {
      throw new ChannelError("network", `Telegram answered ${res.status} (${method})`);
    }
    if (j.ok) return j.result as T;
    const code = j.error_code ?? res.status;
    const why = String(j.description ?? "").slice(0, 200);
    if (code === 429) throw new RetryAfter(Math.max(1, j.parameters?.retry_after ?? 1) * 1000);
    if (code === 401 || code === 404) throw new ChannelError("token", `Telegram refused the token (${method})`);
    if (code === 403) throw new ChannelError("blocked", `Telegram: ${why}`);
    if (code === 409) throw new ChannelError("conflict", `Telegram: another program reads this bot's messages (${method})`);
    if (code >= 500) throw new ChannelError("network", `Telegram answered ${code} (${method})`);
    throw new ChannelError("refused", `Telegram: ${why} (${method})`);
  };

  const fileOf = (fileId: string, name?: string, bytes?: number): InFile => ({
    name,
    bytes,
    async fetch() {
      const got = await call<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
      if (!got.file_path) throw new ChannelError("refused", "Telegram gave no file");
      let res: Response;
      try {
        res = await f(`${api}/file/bot${token}/${got.file_path}`);
      } catch {
        throw new ChannelError("network", "Telegram's file can't be reached");
      }
      if (!res.ok) throw new ChannelError("refused", `Telegram's file answered ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  });

  const toIn = (m: TgMessage): InMessage => {
    const files: InFile[] = [];
    if (m.photo?.length) {
      const big = [...m.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0]!;
      files.push(fileOf(big.file_id, "photo.jpg", big.file_size));
    }
    if (m.document) files.push(fileOf(m.document.file_id, m.document.file_name, m.document.file_size));
    const fo = m.forward_origin;
    const fwdName = fo ? nameOf(fo.sender_user) || fo.sender_user_name || fo.chat?.title || fo.author_signature || undefined : undefined;
    return {
      id: String(m.message_id),
      chat: String(m.chat.id),
      from: { id: String(m.from?.id ?? ""), name: nameOf(m.from) },
      direct: m.chat.type === "private",
      text: m.text ?? m.caption ?? "",
      ...(m.reply_to_message ? { replyTo: String(m.reply_to_message.message_id) } : {}),
      ...(fo ? { forwarded: fwdName ? { from: fwdName } : {} } : {}),
      ...(files.length ? { files } : {}),
    };
  };

  const poll = async (on: ChannelEvents) => {
    let pause = o.backoffMs ?? 2_000;
    let troubled = false;
    while (running) {
      let updates: TgUpdate[];
      try {
        updates = await call<TgUpdate[]>("getUpdates", { offset: o.offset?.(), timeout: o.pollSeconds ?? 25, allowed_updates: ["message", "callback_query"] });
        if (troubled) on.trouble(undefined), (troubled = false);
        pause = o.backoffMs ?? 2_000;
      } catch (err) {
        if (!running) return;
        const e = err instanceof ChannelError ? err : undefined;
        if (e?.trouble === "token") {
          on.trouble("token");
          running = false;
          return;
        }
        if (e && (e.trouble === "conflict" || e.trouble === "network")) on.trouble(e.trouble), (troubled = true);
        const wait = err instanceof RetryAfter ? err.ms : pause;
        pause = Math.min(pause * 2, 60_000);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // An album arrives as one message per picture: they are gathered into the first one.
      const albums = new Map<string, InMessage>();
      for (const u of updates) {
        if (!running) return;
        try {
          if (u.message) {
            const m = toIn(u.message);
            const g = u.message.media_group_id;
            const first = g ? albums.get(g) : undefined;
            if (first) {
              first.files = [...(first.files ?? []), ...(m.files ?? [])];
              if (!first.text && m.text) first.text = m.text;
            } else if (g) albums.set(g, m);
            else await on.message(m);
          } else if (u.callback_query?.message && u.callback_query.data) {
            const q = u.callback_query;
            await on.tap({ id: q.id, chat: String(q.message!.chat.id), message: String(q.message!.message_id), from: { id: String(q.from.id) }, data: q.data! });
          }
        } catch (err) {
          console.warn("[telegram] an update:", (err as Error).message);
        }
        o.setOffset?.(u.update_id + 1);
      }
      for (const m of albums.values()) await on.message(m).catch((err) => console.warn("[telegram] an album:", (err as Error).message));
    }
  };

  const markup = (p: OutPart) =>
    p.buttons?.length
      ? { inline_keyboard: [p.buttons.map((b) => ("url" in b ? { text: b.label, url: b.url } : { text: b.label, callback_data: b.data.slice(0, 64) }))] }
      : { inline_keyboard: [] as unknown[] };

  const body = (chat: string, p: OutPart) => {
    const [first] = splitParsed(parseMarkdown(p.text), TELEGRAM_MAX_TEXT);
    const { text, entities } = toTelegram(first!);
    return { chat_id: chat, text: text || "…", ...(entities.length ? { entities } : {}), link_preview_options: { is_disabled: true } };
  };

  return {
    kind: "telegram",
    caps: { buttons: true, edit: true, typing: true, files: true, maxText: TELEGRAM_MAX_TEXT, maxDownload: 20 * 1024 * 1024, maxUpload: 50 * 1024 * 1024, silent: true },
    async start(on) {
      abort = new AbortController();
      const me = await call<{ id: number; first_name: string; username?: string }>("getMe");
      running = true;
      void poll(on);
      return { id: String(me.id), name: me.first_name, ...(me.username ? { handle: me.username } : {}) } satisfies BotInfo;
    },
    stop() {
      running = false;
      abort?.abort();
    },
    async send(chat, p) {
      const r = await call<{ message_id: number }>("sendMessage", {
        ...body(chat, p),
        ...(p.buttons?.length ? { reply_markup: markup(p) } : {}),
        ...(p.silent ? { disable_notification: true } : {}),
        ...(p.replyTo ? { reply_parameters: { message_id: Number(p.replyTo), allow_sending_without_reply: true } } : {}),
      });
      return String(r.message_id);
    },
    async edit(chat, id, p) {
      try {
        await call("editMessageText", { ...body(chat, p), message_id: Number(id), reply_markup: markup(p) });
      } catch (err) {
        // The same words again (a second end state, a stale tap): nothing to change.
        if (err instanceof ChannelError && /not modified/i.test(err.message)) return;
        throw err;
      }
    },
    async typing(chat) {
      await call("sendChatAction", { chat_id: chat, action: "typing" });
    },
    async answerTap(t, text) {
      await call("answerCallbackQuery", { callback_query_id: t.id, ...(text ? { text } : {}) });
    },
    async sendFile(chat, file) {
      const form = new FormData();
      const photo = /^image\/(jpeg|png|webp)$/.test(file.type);
      form.set("chat_id", chat);
      form.set(photo ? "photo" : "document", new Blob([readFileSync(file.path)], { type: file.type }), file.name);
      if (file.caption) form.set("caption", file.caption.slice(0, 1024));
      const r = await call<{ message_id: number }>(photo ? "sendPhoto" : "sendDocument", undefined, form);
      return String(r.message_id);
    },
  };
}
