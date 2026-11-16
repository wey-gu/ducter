// D276: a local stand-in for Telegram's Bot API (the methods Ducter's adapter calls), so the
// adapter and the hub are tested end to end without a real bot or a real token.
export interface TgSent {
  method: string;
  body: Record<string, any>;
  /** The message id the fake gave a sent message. */
  id?: number;
}

export function fakeTelegram(o: { token?: string; bot?: { id: number; first_name: string; username: string } } = {}) {
  const token = o.token ?? "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";
  const bot = o.bot ?? { id: 777, first_name: "Ducter", username: "my_ducter_bot" };
  const updates: any[] = [];
  let nextUpdate = 1;
  let nextMessage = 1000;
  const calls: TgSent[] = [];
  const files = new Map<string, Uint8Array>();
  const failures: { method: string; answer: any; status: number }[] = [];
  let wake: (() => void) | undefined;
  let refuse = false;

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const file = /^\/file\/bot([^/]+)\/(.+)$/.exec(url.pathname);
      if (file) {
        if (file[1] !== token) return new Response("no", { status: 401 });
        const b = files.get(file[2]!);
        return b ? new Response(b) : new Response("no", { status: 404 });
      }
      const m = /^\/bot([^/]+)\/(\w+)$/.exec(url.pathname);
      if (!m) return new Response("no", { status: 404 });
      if (m[1] !== token || refuse) return Response.json({ ok: false, error_code: 401, description: "Unauthorized" }, { status: 401 });
      const method = m[2]!;
      let body: Record<string, any> = {};
      const type = req.headers.get("content-type") ?? "";
      if (type.includes("json")) body = (await req.json()) as Record<string, any>;
      else if (type.includes("form")) {
        const form = await req.formData();
        for (const [k, v] of form) body[k] = typeof v === "string" ? v : { name: (v as File).name, size: (v as File).size, type: (v as File).type };
      }
      const fail = failures.findIndex((f) => f.method === method);
      if (fail >= 0) {
        const f = failures.splice(fail, 1)[0]!;
        calls.push({ method: `${method}!`, body });
        return Response.json(f.answer, { status: f.status });
      }
      if (method !== "getUpdates") calls.push({ method, body });
      const ok = (result: unknown) => Response.json({ ok: true, result });
      switch (method) {
        case "getMe":
          return ok({ ...bot, is_bot: true });
        case "getUpdates": {
          const from = Number(body.offset ?? 0);
          const pick = () => updates.filter((u) => u.update_id >= from);
          if (!pick().length) await new Promise<void>((r) => ((wake = r), setTimeout(r, Math.min(Number(body.timeout ?? 0), 1) * 1000)));
          return ok(pick());
        }
        case "sendMessage":
        case "sendPhoto":
        case "sendDocument": {
          const message_id = nextMessage++;
          calls.at(-1)!.id = message_id;
          return ok({ message_id, chat: { id: Number(body.chat_id) } });
        }
        case "editMessageText":
        case "sendChatAction":
        case "answerCallbackQuery":
          return ok(true);
        case "getFile":
          return ok({ file_id: body.file_id, file_path: `files/${body.file_id}` });
        default:
          return Response.json({ ok: false, error_code: 400, description: `unknown method ${method}` }, { status: 400 });
      }
    },
  });

  const push = (u: any) => {
    updates.push({ update_id: nextUpdate++, ...u });
    wake?.();
  };
  const user = (id: number, first = "Wey") => ({ id, is_bot: false, first_name: first });

  return {
    token,
    bot,
    api: `http://127.0.0.1:${server.port}`,
    calls,
    /** The calls of one method (sendMessage, editMessageText, …). */
    sent: (method: string) => calls.filter((c) => c.method === method).map((c) => c.body),
    /** The id of the bot's last message whose words start so. */
    idOf: (starts: string) => calls.filter((c) => c.method === "sendMessage" && String(c.body.text).startsWith(starts)).at(-1)?.id,
    /** Someone writes to the bot in a private chat (their chat id is their user id). */
    says(from: number, text: string, extra: Record<string, unknown> = {}) {
      const message_id = nextMessage++;
      push({ message: { message_id, chat: { id: from, type: "private" }, from: user(from), date: 0, text, ...extra } });
      return message_id;
    },
    sendsPhoto(from: number, bytes: Uint8Array, caption?: string) {
      const id = `ph${nextMessage}`;
      files.set(`files/${id}`, bytes);
      const message_id = nextMessage++;
      push({ message: { message_id, chat: { id: from, type: "private" }, from: user(from), date: 0, photo: [{ file_id: id, width: 10, height: 10, file_size: bytes.length }], ...(caption ? { caption } : {}) } });
      return message_id;
    },
    inGroup(from: number, text: string) {
      push({ message: { message_id: nextMessage++, chat: { id: -100, type: "group" }, from: user(from), date: 0, text } });
    },
    taps(from: number, messageId: number, data: string) {
      push({ callback_query: { id: `cb${nextUpdate}`, from: user(from), data, message: { message_id: messageId, chat: { id: from } } } });
    },
    /** The next call of method answers this (a 429 with retry_after, a 403, …). */
    failNext(method: string, answer: any, status = 200) {
      failures.push({ method, answer, status });
    },
    refuseToken() {
      refuse = true;
    },
    stop: () => server.stop(true),
  };
}
