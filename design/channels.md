# Chat apps: Telegram and Slack as more windows on the one conversation

> Design note for principles 6, 7 (one conversation, jobs and the living message) · Decision:
> D276 · Evidence: `research/88` (the recommendation built here), `research/79` §1 and §6
> (Telegram, which cards may be buttons), `research/77` §1 (an outbox, linking).
> Status: **built 2026-11-16 (core, the web client, the Mac app), checked against fake servers
> only.** No real Telegram bot or Slack workspace was used; see "What is not verified".

## 1. The moment

- **Who.** The heavy developer lives in Slack at work and Telegram on the phone; the consumer
  personal-AI user already has an AI in a chat app and finds that the normal shape; the fresh
  user has never heard of a bot token and must be able to follow pictures and two pastes.
- **Before.** To ask the partner something they switch to the Ducter app and find the
  conversation. **After.** The partner is one more contact in the apps already open, with its
  own name and face. 顺滑: it reads as a person in that app, never a webhook dump. 放心: nobody
  else can talk to *my* partner there, and nothing it says there spends money or speaks as me.
  惊喜: the partner's name, and the same conversation everywhere.
- **How it starts.** Settings › **聊天软件 / Chat apps** › Telegram: three steps (BotFather,
  paste, open the link). Slack: paste a manifest Ducter gives, install, paste two tokens, DM the
  code. Nothing to learn first; the card says what goes there and who else can see it.

## 2. One conversation, many windows (D276 (1))

A chat app is a **window**, never a conversation of its own. The home holds a client for each
chat app; that client calls the same paths the apps use:

| From the chat app | Becomes |
|---|---|
| The linked account's words | `user_msg` through `logUserMessage`, with `via: "telegram" \| "slack"` and the service's message id as `clientId` (`telegram:<chat>:<message_id>`, `slack:<channel>:<ts>`) |
| A reply there (Telegram's reply, a Slack thread under a partner message) | a D236 reply to that message (`reply: {seq}`); one to an open question answers it |
| Pictures and files | D206 / D259 media (`media.put(..., {sent: true})`); Telegram ≤ 20 MB in, Slack as its files allow |
| A forwarded Telegram message, a Slack shared message | a `user_msg` with `forwarded: {from}`: the partner reads it fenced as outside data, never the person's words or instructions; it never answers a question by itself |
| A button under a card | `decisions.decide(id, "go" \| "hold")` |
| A typed 好 / ok / go, or 先等等 / hold | the newest open card with buttons in that chat (delivered < 24 h ago), as its button would |

Nothing about the Log, the partner, memory or the digest changes. The partner is triggered by
the same `user_msg` subscription. The app's conversation shows the message like any other (a
small 来自 Telegram / via Telegram mark is drawn later, `todo.md`).

## 3. Where things go, by rule (D276 (2))

The model never chooses a channel.

1. **A turn's answer goes back where the turn started.** An ack, the partner's words, its asks
   and the status line of a turn started in Telegram go to Telegram while that turn is now
   (15 minutes, `TURN_MS`). A turn started in an app is not mirrored.
2. **What Ducter starts itself goes to the one place the person last spoke from**, once: a note
   of finds, a late result (an answer to a turn that is no longer now), a question that comes
   later. "The place" is where the person's last words or last answer came from; an app's
   message or an answer given in an app moves it back to the app. A read in the app does not
   move it (an open window marks things read on its own).
3. **The same gate as push.** Quiet hours hold what Ducter starts itself until they end (a
   question that was answered or defaulted meanwhile is dropped); with notifications off nothing
   of its own goes to a chat app. A turn's answer always goes (the person just wrote).
4. **Each thing reaches the person once.** A card or a note carried by a chat app is claimed, and
   the app's push skips it (`push.ts` `claimed`, the proactive engine's `claimed`). A question
   from a live call is the one exception: it is pushed too, someone waits on the line.

## 4. Decisions (D276 (3))

`cardPolicy(d)` (`packages/core/src/channels/hub.ts`):

| Card | In the chat app |
|---|---|
| Reversible, none of the kinds below | the question, its default line in italics, buttons **好，{Go} / Go: {Go}** (primary) and **先等等 / Hold** |
| Not reversible (merges, sends as you), a phone, the computer, the person's own phone, a call, a calendar change, a tunnel, an install, another agent's ask, a trust rule, a find's step | the question in one sentence plus **在 Ducter 里看看 / Open in Ducter** (a link button when the home has an https address, D228; else the words) |
| Money, a sign-in, a key, a saved thing's first use | never its content: **有件事要你在 Ducter 里确认。/ Something needs you in Ducter.** plus Open in Ducter |

A task's question waits up to 20 s (`WORDS_MS`) for the partner's own words about it (D129),
then uses its own. **Answered anywhere, settled everywhere:** when a card resolves (the app, the
chat, a default), the chat message is edited to its end state, buttons gone: **你说：好，{Go} /
You said: Go: {Go}**, **你说：先等等 / You said: Hold**, **你没回，我照原计划做了 / No answer, so I
went ahead**; a never-card to **这件定了。/ That's settled.** A stale tap gets Telegram's toast
**这件已经定了 / Already decided**.

## 5. The living message and typing (D276 (4))

Bots get no read receipts and only new messages notify, so: **edit only the status line;
anything new is a new message.** A job still running a minute after its ack gets one silent
status message **还在做：{job} / Still on it: {job}**, edited as the job moves and frozen at
**做完了：{job} / Done: {job}** or **没做成：{job} / Didn't work: {job}**; the result is a new
message. Telegram shows typing every 4 s while a turn started there waits for its first words
(at most 2 minutes, stopped when the partner's turn ends). Slack has no bot typing in a DM; the
2026 agent surface (`agents.sessions.setStatus`) is later.

## 6. Pairing, identity, Settings (D276 (5), (6), (8))

- **The partner speaks as itself.** Telegram: the person's own bot from BotFather, its token
  pasted once. Slack: the person's own Slack app with a bot user, from the manifest Ducter
  shows (`slackManifest`: bot user named after the partner, the DM tab, Socket Mode,
  interactivity, bot scopes `chat:write im:history im:read im:write users:read files:read
  files:write`, event `message.im`, **no user scopes**), an app-level token (`xapp-`,
  `connections:write`) and the bot token (`xoxb-`). Never a user token, never sending as the
  person, no Telegram Business connection. Long polling and Socket Mode: no public address.
- **Pairing reuses D83's code shape** (8 letters, 10 minutes, one use), minted by Settings, kept
  only as a hash and only in memory (a restart voids it). Telegram: the deep link
  `t.me/<bot>?start=<code>` (or `/start <code>` typed); Slack: the person DMs the code to the
  bot. One linked account per chat app; a second code is refused while one is linked.
- **Strangers get silence.** Anyone else, a group, a channel: nothing logged, nothing answered.
  Settings shows **有人在 {app} 找过 {name}，没理他。/ Someone else wrote in {app} to {name}. It
  didn't answer.** at most once a day. Wrong codes lock a sender out after 5 tries in 10
  minutes; 30 wrong tries from anyone void every pending code.
- **Settings › 聊天软件 / Chat apps** (web `apps/web/src/channels.tsx`, Mac
  `apps/desktop/internal/views/chats.go`): per chat app its state (**还没连上 / Not connected**,
  **正在连… / Connecting…**, **还差一步：让你的账号连上它 / One more step: link your account to
  it**, **连着：{name} / Linked: {name}**, **连不上了 / Can't connect** with why in words), the steps
  and fields, **连上 / Connect**, **让我的账号连上 / Link my account** then **在 Telegram 里打开 /
  Open in Telegram** and the code, **解除连接 / Unlink**, **断开 {app} / Disconnect {app}**, the
  one line of who else can see it (**Telegram 会存一份你们的聊天记录。** · **这个工作区的管理员可能
  看得到你在这儿说的话。**), and one line of what goes there.

## 7. Architecture (D276 (7))

`packages/core/src/channels/`:

- `port.ts`: the `Channel` port. Capabilities declared, never inferred from a name: `buttons`,
  `edit`, `typing`, `files`, `maxText`, `maxDownload`, `maxUpload`, `silent`. Inbound
  `InMessage` / `InTap`; outbound one part at a time; `RetryAfter` and `ChannelError`
  (`token | blocked | conflict | network | refused`; messages never carry a token or a URL).
- `telegram.ts`: Bot API over `fetch`, `getUpdates` long polling (offset kept only after an
  update was handled), albums gathered, entities (`format.ts`) not MarkdownV2, inline keyboard,
  `editMessageText`, `sendChatAction`, `answerCallbackQuery`, `sendPhoto` / `sendDocument`.
  429 → `retry_after`; 401/404 token; 403 blocked; 409 another reader.
- `slack.ts`: Web API (form-encoded) plus Socket Mode (`apps.connections.open`, every envelope
  acked by `envelope_id` after it was handled, `disconnect` → a new socket), mrkdwn with `& < >`
  escaped, Block Kit buttons (label ≤ 75, value ≤ 2000), `chat.update`, the files v2 upload.
  429 → `Retry-After`.
- `outbox.ts`: one line per chat, a gap between sends (1 s), the service's wait honoured, a few
  tries with backoff on the network; a permanent refusal fails at once and shows as Can't connect.
- `format.ts`: the partner's light Markdown to Telegram entities (UTF-16 offsets) or Slack
  mrkdwn; splitting at a paragraph, a line, a space or a sentence end, never in a surrogate pair
  (Telegram 4096; Slack 39,000 of text, 3,000 in a card's section).
- `store.ts`: `<dataDir>/channels.json`, 0600 (D102): tokens, the bot, the linked account,
  Telegram's offset, the last place. Tokens never reach a client frame or a log line.
- `hub.ts`: everything above that is the same for every chat app. Everything it sends has every
  key-shaped string hidden first (D152's `redact`, exactly as a client sees the Log).

Frames (`packages/protocol/src/channels.ts`): `channels` (subscribe), `channel_connect`,
`channel_code`, `channel_unlink`, `channel_forget`; answered by `channels` and `channel_result`.

## 8. What is not verified

Built and tested against fake servers (`packages/core/test/fake-telegram.ts`,
`fake-slack.ts`): pairing, stranger silence, inbound → `user_msg` with `via`, replies, buttons →
decide, edits to the end state, splitting, `retry_after` / `Retry-After`, a refreshed socket,
files in, forwarded data, quiet hours, notifications off, and one end-to-end run through a core
started in the test. **Not checked live:** a real BotFather bot and Telegram's real answers
(entity edge cases, album timing, the 409 when a webhook is set), a real Slack workspace (the
manifest as Slack's importer reads it, an admin-gated install, Socket Mode's refresh timing,
`files.getUploadURLExternal` with form encoding, a Slack Connect DM), the Mac page on screen.
iMessage is a separate step on the Mac app (`research/88` §4). See `todo.md` "Chat apps".
