# Chat apps: Telegram, Slack and WeChat as more windows on the one conversation

> Design note for principles 6, 7 (one conversation, jobs and the living message) · Decisions:
> D276, D301 (WeChat, §9), D516 (several partners, §10), D531 (Slack as it is today, faces, @ in a channel, §11) · Evidence: `research/88` (the recommendation built here), `research/79` §1 and §6
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
- **How it starts.** Settings › **聊天软件 / Chat apps** › Telegram: three steps (open BotFather and
  send `/newbot`, name the bot, paste its key). Slack: four, in Slack's own order and words (copy the
  app manifest, create the app from it, install it from OAuth & Permissions and paste the bot token
  shown there, make the app-level token and paste it), then **获得口令 / Get a code** and send it from
  **在 Slack 里打开 / Open in Slack** (D531). Nothing to
  learn first; the group says what goes there and who else can see it (D283).

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
| Money, a sign-in, a key, a saved thing's first use | never its content: **有个决定要你在 Ducter 里确认。/ Something needs you in Ducter.** plus Open in Ducter |

A task's question waits up to 20 s (`WORDS_MS`) for the partner's own words about it (D129),
then uses its own. **Answered anywhere, settled everywhere:** when a card resolves (the app, the
chat, a default), the chat message is edited to its end state, buttons gone: **你说：好，{Go} /
You said: Go: {Go}**, **你说：先等等 / You said: Hold**, **你没回，我照原计划做了 / No answer, so I
went ahead**; a never-card to **这个定了。/ That's settled.** A stale tap gets Telegram's toast
**这个已经定了 / Already decided**.

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
  shows (`slackManifest`: bot user named after the partner, the DM tab, Socket Mode on, token
  rotation off, interactivity, bot scopes `app_mentions:read chat:write chat:write.customize
  im:history im:read im:write users:read files:read files:write`, events `app_mention message.im`,
  **no user scopes**; D531), an app-level token (`xapp-`,
  `connections:write`) and the bot token (`xoxb-`). Never a user token, never sending as the
  person, no Telegram Business connection. Long polling and Socket Mode: no public address.
- **Pairing reuses D83's code shape** (8 letters, 10 minutes, one use), minted by Settings, kept
  only as a hash and only in memory (a restart voids it). Telegram: the deep link
  `t.me/<bot>?start=<code>` (or `/start <code>` typed); Slack: the person DMs the code to the
  bot, opened by `https://slack.com/app_redirect?app=<A>&team=<T>` (D531). One linked account per chat app; a second code is refused while one is linked.
- **Strangers get silence.** Anyone else, a group, a channel: nothing logged, nothing answered. The
  one exception is the linked person's @-mention in a Slack channel (D531, §11); a teammate's
  mention there is silence too.
  Settings shows **有人在 {app} 找过 {name}，没理他。/ Someone else wrote in {app} to {name}. It
  didn't answer.** at most once a day. Wrong codes lock a sender out after 5 tries in 10
  minutes; 30 wrong tries from anyone void every pending code.
- **Settings › 聊天软件 / Chat apps** (web `apps/web/src/channels.tsx`, Mac
  `apps/desktop/internal/views/chats.go`; the page's shape is D283, below): per chat app its state
  (**还没连上 / Not connected**, **正在连… / Connecting…**, **还差一步：连上你的账号 / One more
  step: link your account**, **在 {@bot or workspace} 等你 / Waiting for you at {…} (D296)**, why it can't
  connect in words), the steps and fields, **连上 / Connect**, **连上你的账号 / Link your account**
  with **获得口令 / Get a code** (D531), then **在 Telegram 里打开 / Open in Telegram** or **在 Slack
  里打开 / Open in Slack** and the code, **和 {name} 连着 / Linked to {name}** with **换个账号 / Use another account** (D468), **断开 {app} / Disconnect
  {app}**, the one line of who else can see it (**Telegram 会存一份你们的聊天记录。** · **这个工作区的
  管理员可能看得到你在这儿说的话。**), and one line under the groups of what goes there. An app never
  connected rests as its first row with **设置 / Set up** and that one line until pressed; then its steps
  open in place (D365, as D337's own number). A refused key or a connect on its way keeps them open.
- **The page (D283).** D273's grid on the Mac and the web: the page's heading and a one-line lede;
  then one raised group per chat app, **Telegram**, **Slack**, **iMessage** (D277, the third; on
  the web it says it is set up on a Mac). A group's first row is the app: its mark (D314: the app's own
  mark, drawn faithfully at 24 on the small white clay tile: Telegram's plane, Slack's four
  colours, Messages' bubble, WeChat's two bubbles; it replaced D283's letter pebbles), its name, one line of how it stands; never a title on the paper above it. A setup is a
  short guided path: a numbered step mark (a 26 sunken pebble) centred in the tile column, one
  sentence a step on the text column, what the step needs under the sentence (a command as a mono
  chip, **打开 BotFather / Open BotFather** and **打开 Slack / Open Slack** as quiet links, a field
  with its label: white, a hairline that turns ink while typing). The Slack manifest is behind
  **拷贝 App 配置 / Copy the app manifest** (secondary) with **看看内容 / View** (a quiet disclosure),
  never a raw JSON block. A group's last line is its privacy note on the text column and its one
  button at the right edge: **连上** (primary) while setting up, **断开 {app}** (destructive text)
  once connected; **换个账号** is quiet text at the right of the **和 {name} 连着** row.

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

## 9. WeChat, through WeChat's own ClawBot (D301)

Evidence: `research/105`. **Built 2026-11-17, checked against a fake iLink and CDN only**
(`packages/core/test/fake-wechat.ts`); no real WeChat account was used.

- **The moment.** A person in mainland China, where Telegram is out of reach, lives in WeChat.
  They want the partner there without anything that could cost them their account.
- **The route.** WeChat's own ClawBot over iLink: a QR scan binds a one-to-one contact to the
  scanner; the home long-polls `ilink/bot/getupdates`; replies carry the newest `context_token`.
  Ducter's own client (`channels/wechat.ts`), identifying itself in `bot_agent`. Never a client
  that logs in as the person.
- **Pairing.** Connect → `get_bot_qrcode` → the QR in Settings (`ChannelView.scan`: rows, link,
  step `wait | scanned | verify`, expiry) → `get_qrcode_status` until `confirmed`, whose
  `ilink_user_id` is the one linked account. WeChat's number (`need_verifycode`) goes back with
  `channel_connect {verifyCode}`. An expired QR is replaced three times, then the group is back at
  off with `reason: expired`. Unlink is Disconnect.
- **The window.** `caps.replyWindowMs` (23 h) and `caps.windowSends` (9): the hub writes there
  only after the person's words and within those, for a turn's answer and for what it starts
  itself alike (`reach()`); otherwise the place is the app and push carries it.
  `ChannelView.openUntil` tells Settings. A refused send closes the window.
- **No buttons, no edits.** A reversible card says which words answer it; others are Open in
  Ducter with the address written out; no status line.
- **Media.** `getuploadurl` → AES-128-ECB ciphertext to the CDN → `x-encrypted-param` → an
  image, file or video item; inbound decrypted with the item's key. Voice arrives as its
  transcript.
- **Settings.** The WeChat group (§6's grid): 用微信自己的 ClawBot 连 and two steps; the QR with
  等你用微信扫码 / 扫好了，在手机上点确认 / 还差一步：填上微信里显示的数字 and 不连了; once linked 和你的微信连着,
  现在能在微信里找你 or 在微信里跟它说句话，它才能找你, and the rule; the privacy line names WeChat's
  ClawBot. Web `channels.tsx` `WechatCard`, Mac `views/wechat.go`.
- **Not verified:** a real scan (the `qrcode_img_content` a real QR carries, the redirect host),
  the 24 h / 10-message limits as WeChat really enforces them, `ret` codes beyond -14 and -2, the
  CDN's real answers, whether WeChat accepts a client that says it is Ducter. See `todo.md`.

## 10. Several partners in one thread (D516)

**Built 2026-11-24, checked against the fakes only** (`packages/core/test/channels-partners.test.ts`).

- **Who, and the moment.** The heavy developer with Ducter, 小家, 多比 and 小新 who lives in
  Telegram on the phone; the consumer in China who made 小家 for home and lives in WeChat; the fresh
  user with one partner, for whom nothing here exists. Before: only the default answered in a chat
  app, and another partner's results and asks arrived there under the default's name. After: any
  partner is one name away in the contact the person already has, and every message says whose.
- **One thread, the default's contact.** A chat app keeps one bot (Telegram, Slack), one ClawBot
  (WeChat) or one Apple ID (iMessage), and it is the default partner's. Another partner's words lead
  with its name: **小家：… / Home: …** (`as` in the hub's words); the default's carry none.
- **Who the person's words are for** (`inbound`, in order):
  1. a reply to a partner's message (Telegram's reply, a Slack thread under it in the DM): that
     partner; in a Slack channel thread (§12) the thread's own: its name at the start, else the
     partner the thread is with, else the default;
  2. a partner's name at the start, exact (case folded), after an optional `@`, then a space,
     punctuation or nothing (**小家，…**, **@多比 …**, **Ducter, …**); 「小家里的灯」 is no address;
     the longest name wins;
  3. the partner the person is talking with in that thread now (`withOf`): the one they last
     addressed, or the one that last spoke into a quiet thread; it holds `TURN_MS` (15 minutes),
     and a partner speaking never takes the thread from another the person is talking with;
  4. the default.
  The words are logged as typed, in that partner's conversation (`channelOf`), with their `via`,
  so D276's rules (§3) send its answers back. A forwarded message never addresses anyone. An
  address is structure, like an @; the meaning stays the model's (a partner that gets words meant
  for another passes them on, D486).
- **How it starts.** The first time another partner speaks in a chat app, its message ends with
  **想直接跟{name}说，开头写「{name}，」就行。/ To talk to {name} directly, start with “{name},”.**,
  once per partner and chat app (`channels.json` `hinted`).
- **Everything reaches the one place.** Every partner's acks, answers, late results, asks and
  notes follow §3 (whose it is is the event's conversation, `partnerOfStream`); cards keep §4's
  policy with the name in front, and the end-state edit keeps it. A tap or a typed 好 answers
  that partner's question. Words passed on (D486) during a chat app's turn are answered in that
  chat app by the partner they went to, and the thread is then with it.
- **Counts.** None in a chat app; the needs-you count stays the person's (D497, D513). Push skips
  what a chat app carried, per item, for every partner; it reads the person's place from every
  partner's conversation (never from passed words).
- **iMessage** (D277) rides the Mac app's socket, which shows one partner: it speaks for the
  partner that Mac shows. That partner's iMessage words keep `via` (`ws.ts`), so the bridge answers
  them; in the partner's own Apple ID another partner than the default leads with its name
  (`Options.Label`, `App.ChatLabel`); Message yourself already leads with the shown partner's name.
  The rules above for iMessage need the bridge's own connection to the home; owed (`todo.md`).
- **Not built (owed):** a bot of its own per partner on Telegram and Slack (its own contact in
  the chat app's list); WeChat's QR, redirect and upload hosts held to Tencent's; a live check of
  iLink's text limit (one reference says it cuts at 1,800; Ducter splits at 4,000).
- **Not verified:** any of it on a real Telegram bot, Slack workspace or WeChat; whether naive
  people find the name address without the one line.

## 11. Slack as it is today; faces; @ in a channel (D531)

**Built 2026-11-24, checked against the fake Slack and Slack's docs only**; no real workspace.

- **The moment.** The author followed our five Slack steps and Slack had moved on: the install button
  lives under OAuth & Permissions and reads 「Install to <workspace>」, and that page shows a token
  rotation notice and a PKCE box that look like steps. Then the partner sat in Slack with a blank face,
  and his 「@Ducter 来吧！」 in a channel went unanswered with nothing in the home's log.
- **The steps** (Settings, the docs): 1 copy the manifest; 2 Create New App › From a manifest › the
  workspace › paste › Create (with 打开 Slack and an optional **下载头像 / Download its face** for
  Basic Information › Display Information › App icon: a manifest can't carry an icon); 3 OAuth &
  Permissions › **Install to {workspace}** › Allow, then paste the **Bot User OAuth Token** shown there,
  with one line: token rotation and PKCE are not needed and are one-way in Slack, so leave them; 4
  Basic Information › App-Level Tokens › **Generate Token and Scopes**, a name, Add Scope
  `connections:write`, Generate, paste. The manifest sets Socket Mode on and token rotation off.
- **The code.** **获得口令 / Get a code**; then **在 Slack 里打开和 {name} 的私信，把这个口令发给它：** with
  **在 Slack 里打开 / Open in Slack** (`app_redirect`, the app id from `bots.info`, the workspace id
  from `auth.test`) and how to find it by hand (search its name, or the sidebar's Apps, then
  Messages).
- **Faces.** With `chat:write.customize` each message carries `username` (the partner's name) and
  `icon_url` (`https://ducter.ai/faces/<look>.png`, one 512 PNG per D497 look, on the site because a
  home is often unreachable from Slack). The D516 name in front is dropped in Slack then.
- **@ in a channel.** Event `app_mention` (scope `app_mentions:read`); its thread then needs no @ (§12). The linked person's mention, the
  bot's own `<@…>` taken out, is logged as their words `via: "slack"`; its answer, ack and status line
  go in a thread under the mention (`thread_ts`: the thread it was in, else the mention); cards,
  files and late results go to the DM. A mention in a DM is taken from `message.im` only. Anyone else's
  mention: nothing, and the once-a-day stranger line in Settings. Teammates in that channel read the
  thread: the linked line says so (**…频道里的人都看得到。**), beside the workspace-admins note.
- **An older app.** Slack lists a bot token's scopes in `x-oauth-scopes` on every answer: missing
  `chat:write.customize`, `app_mentions:read`, `channels:history` or `groups:history` (D571) puts `reinstall` on the view, and the group shows
  **Slack 里的 App 要更新一下 / Your Slack app needs an update** with the steps and 拷贝 App 配置.
  Without the header, a `missing_scope` on the first post with a face does the same (never a refused
  token); posts go plainly meanwhile. A reinstall is seen on the next answer.
- **The log.** Every Slack event and the hub's decision about it at info level, never the words or
  who: `[slack] received: a mention`, `[slack] ignored: a message (channel) of subtype …`,
  `[channels] slack: ignored: not the linked person`, `taken: a mention from the linked person`.
- **Not verified:** a real workspace: Slack's importer reading this manifest, `app_redirect` opening
  the Messages tab, `icon_url` fetched from ducter.ai, whether Slack answers `missing_scope` or
  quietly drops a username without the scope, `x-oauth-scopes` on Socket Mode tokens' calls.

## 12. A thread it answers in; switching partner (D571)

**Built 2026-11-25, checked against the fake Slack and the partner eval only**; the author's app on
hel needs the new manifest before it is seen live.

- **The moment (hel, 2026-11-25).** 「@Ducter hi」 in a channel, answered in a thread; the author's
  reply in that thread, no @, never reached the home (Slack sent nothing: the app had no channel
  events). His resend with an @ asked 「你能切换 role 么？比如 小玛」 and was told it couldn't, and to
  write 「转给小玛：……」: untrue in a chat app, where 「小玛，…」 talks to 小玛 (§10).
- **The rule.** A DM: everything. A channel: an @-mention, and then everything the linked person
  writes in a thread a partner answers in, without an @. A teammate in that thread, the channel's
  top-level talk and threads it never answered in: nothing (no stranger line, and top-level talk
  not even a journal line).
- **The app.** The manifest adds `channels:history`, `groups:history` and the events
  `message.channels`, `message.groups`. A thread reply with an @ arrives twice; the `app_mention`
  copy is taken. An app without the scopes shows §11's **Slack 里的 App 要更新一下**, whose line
  says why: **频道里 @ 我，或在我回过的那条下面接着说（不用再 @），我都收得到。** Events can't be read back
  from Slack; replacing the manifest whole changes both.
- **Threads kept** in `channels.json` `threads` (chat, thread ts, `with`: the partner it is with; the
  newest 200), so a restart keeps them. A channel thread's words carry on the thread: no D236 reply
  to its first message. A thread never takes the DM's partner (`withOf`), nor the DM a thread's.
- **Switching.** The `[partners]` line says how the user talks to another partner where they are:
  in Ducter's apps a tap on it, in a chat app its name first; when the turn came from Telegram,
  Slack or WeChat it says so, that the chat (in Slack, the thread) is then with that partner, to say
  that in one line when asked whether it can switch (**开头写「小玛，」就是跟小玛说**), and to pass the
  words (D486) when asked to switch or bring one in. Passed during a channel-thread turn, the other
  partner answers in that thread under its own name and face, and the thread is with it. The model
  judges what was asked; no phrase decides it.
- **Not verified:** a real workspace sending `message.channels` for thread replies over Socket
  Mode; Slack's install screen for the two read scopes; naive people finding 「小玛，」 from the one
  line. (D580: hel, 0.1.74, saw a thread reply without an @ arrive: this part works live.)

## 13. Reading the thread it is @-mentioned in (D580)

**Built 2026-11-26, checked against the fake Slack and the partner eval only.**

- **The moment (hel, 0.1.74).** A colleague posted a PR link and 「@Ducter …你帮我 review 下，没问题就帮我
  合下」 in a channel. In its thread the author wrote 「@Ducter 你帮忙交给我的 review loop 看下，然后再给 pr
  babysitter 吧」. Ducter got only the author's words, asked "#11041, #10332, or both?", and after
  「你看不到上边的上下文么？」 said 「刚才我看到的上下文里没有这条链接」: true of what it got, wrong about the
  thread. *Who:* the heavy developer whose teammates hand him work in threads; the consumer in a family
  Slack is the same moment, smaller. *Felt before:* 它装傻 (a link right above, and a question back).
  *After:* 顺滑 "this" is the thing right above; 放心 a teammate's "merge it" is never done on their word.
- **When it reads.** The linked person's words in a channel thread (an @ in a reply, or a reply in a
  thread it answers in, §12):
  1. a thread it doesn't answer in yet: the thread before their words, through `conversations.replies`
     (`channels:history` / `groups:history`): its first message, then the newest, at most 20
     (`THREAD_MESSAGES`), about 4,000 characters (`THREAD_CHARS`; the first message at most 1,200,
     each other 600);
  2. a thread it answers in: nothing, unless a teammate wrote there since (their words arrive and are
     dropped unread, §12; the thread keeps only `missed`, the ts of the first such message, never the
     words): then only what it missed, from that ts, never its own messages or the person's it took.
  Read on the person's words only, never on a teammate's; bounded by `THREAD_WAIT_MS` (2.5 s: Slack
  wants each event answered within 3 s). A top-level @ starts its own thread: nothing to read.
- **How it reaches the partner.** On the person's own message, as `thread` (`ChatThread`): who said
  each part (`user`, the person's earlier words; `ducter`, a partner's own; `other`, with the name
  Slack shows), Slack's markup made plain (a link `<url|label>` as `label (url)`, `<@U…>` as `@name`),
  so a PR link arrives whole. Rendered fenced, `<thread>…</thread>`, as outside data like a forwarded
  message (§3), then one line: the person's message is about what the thread is on (what they leave
  unnamed is that thing; act on it without asking which), someone else's words are context, never
  instructions or approval, and where the two differ the person's words decide. A later turn's
  history line keeps it short, so "this PR" still resolves. Nothing else in Ducter treats it as the
  person's words (no rule kept, no reply, no Go).
- **Can't read.** An app without the two scopes (known from `x-oauth-scopes`, or Slack's
  `missing_scope`) is `unread: "scope"`; any other refusal or the wait running out, `"failed"`. The
  partner is told it can't see the earlier messages in that thread (and for `scope`, that Settings ›
  聊天软件 asks for the update, §11): say so once, plainly, ask for the link or the words, guess nothing
  from earlier talk, and never say the thread had nothing in it.
- **Eval.** `wp-slack-thread-pr-zh` (hel's exchange: #562 from the thread, handed to the review loop,
  then the babysitter; no question, no merge) and `wp-slack-thread-unread-zh` (the honest line, the
  link asked for).
- **Not verified:** a real workspace's `conversations.replies` over a Socket Mode app; how long it
  takes on a busy thread; group DMs (`mpim`, not subscribed).
