# 79 · The partner in chat apps: Telegram first, and what WeChat, iMessage and the rest allow

Date: 2026-11-13. Question: the author approved putting the partner in chat apps, Telegram first
(`research/77` §1, §8.1). For Ducter's situation (a home that may have no public address, such as
a Linux server or a Mac at home; one partner with a name and a face; Go cards for decisions;
routines that report), what does each chat app really allow, what is safe, and what is the
smallest first slice?

Sources read (read only, nothing run):
- Telegram Bot API page, **Bot API 10.4, 9 Nov 2026** (`core.telegram.org/bots/api`, downloaded
  and searched as text), the bots features page (`core.telegram.org/bots/features`), the bots FAQ
  (`core.telegram.org/bots/faq`) and the Telegram FAQ (`telegram.org/faq`).
- Tencent's official WeChat channel plugin `@tencent-weixin/openclaw-weixin` **2.4.10**
  (2026-10-10, MIT, published by Tencent staff on npm; tarball read, not installed) and its
  protocol document `docs/protocol_zh_CN.md` (GitHub `Tencent/openclaw-weixin`).
- Press and community write-ups on WeChat ClawBot, WeCom (企业微信) bots, WhatsApp's 2026 terms,
  `steipete/imsg` and BlueBubbles (cited per claim).
- Ducter: `design/conversation.md`, `design/flows/G-safety.md` §0 (the effect ladder),
  `design/product-model.md` (routines, 暂停), `research/77` §1 and §8.1, `research/45` (push relay),
  `research/67` (Cloudflare tunnel).

Tags: VERIFIED (read in source or the primary doc text itself), DOCUMENTED (a vendor or
maintainer page says so, not checked further), INFERRED (my reasoning).

---

## 1. Telegram

### 1.1 Long polling, not a webhook

- `getUpdates` is long polling: `timeout` 0 is short polling ("for testing only"), a positive value
  holds the request open; `offset` = last `update_id` + 1 confirms; `limit` 1–100. (VERIFIED, Bot
  API text)
- **Updates wait at most 24 hours**: "they will not be kept longer than 24 hours." A home that is
  off for a day loses what was sent to it. (VERIFIED, Bot API text)
- Polling and a webhook are mutually exclusive; `getUpdates` fails while a webhook is set.
  (VERIFIED)
- A webhook needs HTTPS on port 443, 80, 88 or 8443, and an optional `secret_token` (1–256 chars)
  that Telegram echoes in a header. (VERIFIED)

For Ducter: long polling needs no public address, no tunnel and no certificate, which suits a
Mac at home and a Linux server alike (`research/77` §8.1 adaptation 1). The home holds one
outbound HTTPS request to `api.telegram.org` open at a time (INFERRED: the same cost as the push
relay's socket, `research/45`). Two rules follow: call `deleteWebhook` once when linking (in case
the token was used elsewhere), and treat a 24-hour gap as lost, saying so once when the home comes
back ("我离线了一阵，那段时间你在 Telegram 说的可能没收到 / I was offline for a while; anything you sent me
on Telegram then may not have reached me") (INFERRED).

**Reachability caveat for the zh user (DOCUMENTED, widely reported; not checked here):** Telegram
is blocked in mainland China. A home in China cannot reach `api.telegram.org` without a proxy, and
a person there needs a VPN to use Telegram at all. Telegram first is right for everyone outside the
mainland, including the author; it does not serve the mainland consumer user (see WeChat, §2).

### 1.2 The person's own bot: who owns the name and the face

**Option 1, BotFather (works today, the person owns everything).** BotFather `/newbot` asks a
display name and a username ending in `bot`, then shows the token; `/setuserpic` sets the
picture, `/setdescription` and `/setabouttext` the texts (DOCUMENTED, features page). The Bot API
can then do the rest **from the home**, so the person never has to do it by hand:
`setMyName` (0–64 chars, per language), `setMyDescription` (0–512, the empty chat's text),
`setMyShortDescription` (0–120, the profile and share card), **`setMyProfilePhoto`** (the bot's
photo) and `setMyCommands` (VERIFIED, Bot API text). So the partner's name and avatar (the persona's
face) are set by Ducter, in both languages, the moment the token arrives.

Steps a non-technical person does (INFERRED, counted from the BotFather flow):
1. Tap **在 Telegram 里打开 BotFather / Open BotFather in Telegram** (a `t.me/BotFather` link).
2. Send `/newbot`, then a name (Ducter suggests the partner's), then a username ending in `bot`
   (Ducter suggests one; BotFather refuses taken ones, which is the only step that can loop).
3. Copy the token BotFather replies with, and paste it into Ducter.

That is three steps and about six taps plus two typed lines. Everything after is Ducter's: it
checks the token with `getMe`, sets the name, photo, descriptions and commands, and shows the link
`t.me/<bot>?start=<code>` (§1.8). The pasted token is a secret: kept like the other connection
secrets, never shown again, never in the Log (INFERRED).

**Option 2, Managed Bots (new, one tap, but someone else holds the token).** Telegram now lets a
"manager" bot create bots for users: the person opens
`https://t.me/newbot/{manager}/{suggested_username}?name={name}`, sees a prefilled window, confirms,
and the manager receives a `managed_bot` update and fetches the token with `getManagedBotToken`;
it can also `replaceManagedBotToken` and restrict who may talk to the bot
(`setManagedBotAccessSettings`: owner plus up to 10 users) (VERIFIED, Bot API text and features
page; the manager must enable "Bot Management Mode" in BotFather's Mini App). This is the flow
consumer users would love (one tap, name prefilled). But the manager is a bot **someone runs**:
for Ducter that means a Ducter-operated manager bot that can fetch, and keep fetching, every
user's token. That breaks "self-deployed, your own partner" unless the person runs their own
manager, which needs Option 1 first. (INFERRED) Verdict: Option 1 now; Option 2 only if Ducter
ever runs a relay the person already trusts (like the push relay, `research/45`), and then with
the token handed over and replaced, which the API does not let the manager give up (INFERRED: no
"release" method exists in 10.4).

**Owner-only by default.** With Option 1 there is no access setting, so anyone who finds
`@<bot>` can message it. The link code (§1.8) is the gate: an unlinked sender gets silence
(`research/77` §1.2's "no oracle"). (INFERRED)

### 1.3 Buttons for Go cards

- An inline keyboard button carries `callback_data` of **1–64 bytes**; a tap sends a
  `callback_query` the bot must answer with `answerCallbackQuery` (a toast or an alert). (VERIFIED)
- A button may have a **`style`: "danger" (red), "success" (green) or "primary" (blue)**; other
  types: `url`, `copy_text`, `login_url`, `web_app` (a Mini App), and a disabled type. (VERIFIED)
- The message and its keyboard can be changed later with `editMessageText` /
  `editMessageReplyMarkup`. The 48-hour edit limit applies only to *business* messages "not sent by
  the bot and [without] an inline keyboard"; the bot's own messages have no stated limit.
  (VERIFIED). `deleteMessage` works only within 48 hours. (VERIFIED)

For Ducter (INFERRED): `callback_data` holds an opaque id (`g:<decisionId>:<choice>`, ≤ 64 bytes),
never the meaning; the home looks the decision up and checks it is still open, still for this
person, and that this Telegram account is the linked one. When the decision is answered anywhere
else (the app, a timeout default, a countdown), the home **edits the message** to its end state
(**你说：好，创建 / You said: Go ahead, create it**, or **你没回，我照原计划做了**) and removes the
buttons, so a stale button can never fire. An expired or answered tap gets an
`answerCallbackQuery` toast ("这件已经定了 / Already decided"). The Go button's words are the
action, as in the app (D129); `style: "primary"` for Go, no "danger" red (G-safety Rule 4: no
colour that claims safety or alarm).

### 1.4 Text, formatting, length

- A message is **1–4096 characters after entity parsing**; a caption 0–1024. (VERIFIED)
- Formatting is MarkdownV2, HTML, or explicit `entities`: bold, italic, underline, strikethrough,
  spoiler, block quotes, links, code. (VERIFIED)
- **`sendMessageDraft`** streams a partial message in a private chat as "a temporary 30-second
  preview"; the bot must then `sendMessage` the final text. 10.4 adds `can_stop` /
  `keep_on_stop` and a `stopped_message_generation` update when the user taps stop. (VERIFIED)
- `reply_parameters` replies to a message, with an optional exact `quote` (≤ 1024 chars). (VERIFIED)

For Ducter (INFERRED): send `entities` computed from the partner's Markdown rather than
MarkdownV2 text, which removes the escaping class of bugs `research/77` §1.4 describes; split at
4096 after rendering. The partner's voice (D129) is already short, so splitting is rare. A
draft is the natural "waiting line" (the job's status line, D104) and its stop is a native
**暂停 / Pause** (D207) — an ideal fit, but new API: try it after the first slice. Use
`reply_parameters` to answer a specific earlier message, matching D236's replies.

### 1.5 Pictures and files both ways

- Bots send files up to **50 MB** (photos 10 MB) by upload; by URL 5 MB photos, 20 MB other.
  Bots download with `getFile` up to **20 MB**; the download link lasts at least an hour.
  (VERIFIED, Bot API text and bots FAQ)
- A self-hosted **local Bot API server** lifts this: downloads unlimited, uploads up to 2000 MB.
  (VERIFIED) It is another program to run (INFERRED: not for the first slice).

For Ducter (INFERRED): inbound pictures and files become D206 media on the turn; over 20 MB the
partner says it couldn't fetch it and offers the app. Outbound, a result's file goes as a document
when ≤ 50 MB, otherwise as its title plus a link into Ducter (`research/77` §1.4's degrade rule).

### 1.6 Typing, rate limits, groups, privacy mode

- `sendChatAction` shows "typing" for **5 seconds or less**, cleared when the bot's message
  arrives; resend it every ~4 s while working. (VERIFIED)
- Rate limits: about **one message per second per chat** (bursts allowed, then 429), **20 per
  minute in a group**, about 30 per second across chats. (DOCUMENTED, bots FAQ)
- **Privacy mode** is on by default: in a group the bot sees only commands for it, replies to it
  and messages sent via it; admins and bots with privacy off see everything. In private chats a
  bot sees every message. (DOCUMENTED, features page and FAQ)

For Ducter: typing at once, refreshed every 4 s while the turn runs, matches `research/77` §1.5.
One message per second is far above the progress budget (≤ 3 interim lines after 60 s), so the
outbox only needs to honour `retry_after` on a 429 (INFERRED). Groups stay out of the first slice
(`research/77` §8.1 adaptation 5).

### 1.7 What Telegram stores

"Cloud Chats use client-server/server-client encryption and are stored encrypted in the Telegram
Cloud"; only Secret Chats are end-to-end, and they are between people, not bots (DOCUMENTED,
Telegram FAQ). The FAQ also says AI through a third-party bot is "a third-party service, not
Telegram". So **everything the person and the partner say in Telegram is readable by Telegram**,
and stays in the person's chat history on Telegram's servers (INFERRED from the above). This needs
one plain line on the connect card: **在 Telegram 里说的话，Telegram 也存着 / Telegram keeps a copy of
what's said there.** It is also why money, sign-ins and secrets never travel there (§6).

### 1.8 Linking the person, adapted from rakazo

`research/77` §1.2's mechanism, adapted (INFERRED):
- After the token is in, Ducter shows the deep link `t.me/<bot>?start=<code>`; deep-link
  parameters allow `A-Z a-z 0-9 _ -` (DOCUMENTED, features page). On a phone the tap opens Telegram
  with **Start**; the bot receives `/start <code>`. On a computer, a QR of the same link.
- The code is single use, 10 minutes, unambiguous alphabet; wrong or expired codes get silence.
- The first linked account becomes the only one; a second account needs a new code from the app.
- The bot answers once, in the partner's words, and sets its commands (**/stop 暂停**).

---

## 2. WeChat: blunt version

**The only safe personal path is Tencent's own: WeChat ClawBot over iLink.** Everything else is
either for businesses, needs a public server and an ICP-filed domain, or breaks WeChat's terms.

### 2.1 ClawBot / iLink (official, personal, since March 2026)

- Tencent publishes `@tencent-weixin/openclaw-weixin` (MIT, Tencent maintainers on npm, first
  published 2026-03-21, latest 2.4.10 on 2026-10-10). It talks to **`https://ilinkai.weixin.qq.com`**
  with endpoints `ilink/bot/getupdates` (long poll), `sendmessage`, `getuploadurl`, `getconfig`,
  `sendtyping`, `msg/notifystart` / `notifystop`; login by QR (`get_bot_qrcode`,
  `get_qrcode_status`) returns a `bot_token`; auth header `AuthorizationType: ilink_bot_token`.
  (VERIFIED, `src/api/api.ts`, `src/auth/accounts.ts`, `src/auth/login-qr.ts`)
- **Long polling, no public address** ("longpolling_timeout_ms", e.g. 35 000). Media up to images,
  video, files and voice through an AES-128-ECB-encrypted CDN upload. Typing needs a
  `typing_ticket` from `getconfig`. (DOCUMENTED, `docs/protocol_zh_CN.md`; VERIFIED in source)
- **Replies carry the `context_token` of the inbound message.** The plugin sends without one with
  only a warning, and the protocol doc says that "does not prove the server accepts it".
  (VERIFIED `src/messaging/send.ts`; DOCUMENTED protocol doc)
- Error `-14` pauses the account's session for an hour (`session-guard.ts`). (VERIFIED)
- **The scanning account must have WeChat Pay real-name verification** ("扫码账号必须已开通微信支付实名").
  (DOCUMENTED, protocol doc)
- Limits reported by press and operators, **not in Tencent's docs I could read**: single chat
  only, no groups, nobody else can add your ClawBot, one ClawBot per WeChat account, WeChat 8.0.70+,
  gray release, and **no free proactive push**: messages are accepted within 24 h of the person's
  last message, and one operator (pushplus) says WeChat requires a person's message after every
  10 bot messages. (DOCUMENTED-secondhand: 36kr/jiemian/CSDN/pushplus coverage; I could not open
  Tencent's terms page or pushplus's page directly)
- The plugin is an OpenClaw channel; community projects call iLink directly without OpenClaw
  (`x1ah/wechat-ilink-demo`, `SiverKing/weixin-ClawBot-API`). Whether Tencent's terms permit a
  non-OpenClaw client is **not stated anywhere I found** (INFERRED: the `ilink_appid: "bot"` and
  `botAgent` header suggest Tencent tracks clients; it is their service to restrict).

What this means for Ducter (INFERRED):
- It fits the conversation: one contact in WeChat that is "your AI", long polling, files, typing.
- It does **not** fit routines that report or a morning note well: the bot can mostly only answer.
  A morning note would be sent only if the person spoke in the last 24 h, and even then under a
  message budget. The honest rule: in WeChat, the partner answers; reports go to the Ducter app's
  push unless the person spoke there recently.
- There are **no buttons**: a Go is plain text. Only rakazo's strict YES/NO rule (newest prompt,
  confirmed delivered, < 24 h, still open) could make "好" count, and even then only for the lowest
  rung (§6).
- The name and face are WeChat's "ClawBot" contact, not the partner's. (DOCUMENTED-secondhand;
  INFERRED that Ducter cannot set them.)
- Building against iLink directly is depending on an undocumented, gray-release service of a
  company that has banned bots for years. Do it as WeChat's own OpenClaw-compatible client would,
  with the same headers, and be ready for it to change. Recommendation: **second, after Telegram,
  as an experiment for zh users, clearly labelled as WeChat's own preview feature**.

### 2.2 Other WeChat paths

| Path | What it is | For a personal Ducter | Verdict |
|---|---|---|---|
| 公众号 (Official Account) | A service account can answer a follower; "customer service" messages within 48 h of the follower's action, templates otherwise (DOCUMENTED from memory of WeChat's docs; not re-checked here) | Needs a registered account, a public HTTPS callback, and service accounts need a business entity; an individual subscription account has almost no API | No |
| 企业微信 (WeCom) self-built app | An org app; since 2022 receiving messages needs a callback URL, a trusted domain (ICP-filed per several write-ups) and fixed trusted IPs (errcode 60020 otherwise) (DOCUMENTED-secondhand: Aliyun/CSDN articles) | A home at home has none of these | No |
| 企业微信 智能机器人, long-connection mode | WeCom's AI bot can connect out over a WebSocket, so no public address; created in the WeCom desktop client (DOCUMENTED-secondhand: Aliyun DataClaw, Kimi Claw docs) | Works, but the person talks to it **in WeCom**, not WeChat; a personal user rarely lives in WeCom | Later, for people who use WeCom at work |
| Wechaty with iPad/Mac/web protocols, hooks into the PC client | Unofficial protocols impersonating a WeChat client, often paid "tokens" from third parties | Against WeChat's terms; accounts get limited or banned, and the person's own WeChat (their whole social life and WeChat Pay) is what is at stake (DOCUMENTED-secondhand, CSDN risk write-ups; INFERRED severity) | **Never** |
| Driving the person's WeChat on their own phone (D238 用这台手机) | The partner taps in WeChat as the person | Sends *as the person*, which is a Go every time; not a chat surface | Already designed, separate |

---

## 3. iMessage on a Mac home

- **Reading** means `~/Library/Messages/chat.db` (SQLite) with **Full Disk Access**; **sending**
  means automating Messages.app with AppleScript, which needs **Automation › Messages**.
  `steipete/imsg` (MIT, macOS 14+) does both, with a watch mode on the database and its WAL files;
  typing indicators, read receipts and rich sends need an injected helper in Messages.app (SIP
  off, and still possibly blocked on current macOS). (DOCUMENTED, imsg README)
- **BlueBubbles** (a server app on an always-on Mac) works without its "Private API" for sending,
  receiving, attachments and receipts; typing indicators and tapback sending need the Private API.
  (DOCUMENTED, BlueBubbles FAQ)
- **Apple Messages for Business** needs Apple's business registration and a messaging service
  provider; it is for companies talking to customers. (DOCUMENTED from memory of Apple's register
  pages; not re-checked here) Not for a personal partner.
- Rakazo uses hosted lines (Sendblue, Photon) instead (`research/77` §1.1). (VERIFIED there)

The real problem is **identity**, not the API (INFERRED): the Mac's Messages is signed into the
person's own Apple ID. Messages the home sends from it come **from the person**. Options:
(a) a second Apple ID for the partner signed into Messages on the home (a Mac signs Messages into
one account at a time; on the person's own Mac that means signing *their* Messages out), which
only works on a dedicated home Mac; (b) the person's "note to self" thread, where everything shows
as from them; (c) a hosted number (Sendblue-style), which costs money and puts a company in the
middle. On top of that, Full Disk Access gives the home every message the person ever exchanged.
Verdict: **not soon**. Revisit only for a dedicated home Mac with its own Apple ID, as an opt-in,
after Telegram has proven the shape.

---

## 4. The rest, briefly

- **WhatsApp.** The Cloud API is a business product: a Meta business account and a phone number of
  its own, a 24-hour customer-service window and paid templates outside it (DOCUMENTED, Meta
  docs from memory). And **since 15 Jan 2026 the WhatsApp Business Solution terms bar
  general-purpose AI assistants** whose main function is the model; ChatGPT, Copilot and
  Perplexity left (DOCUMENTED-secondhand: TechCrunch/9to5mac/respond.io coverage). A personal
  partner is exactly that. Personal-account bridges (whatsmeow, Baileys) are unofficial and
  risk the person's number. Verdict: **no**.
- **Slack DM.** Ducter reads Slack through OOMOL today. A chat surface needs its own Slack app with
  **Socket Mode** (an outbound WebSocket, no public address) (DOCUMENTED, Slack docs from memory),
  installed into the person's workspace, which many workspaces restrict. Good for the heavy
  developer whose day is in Slack; buttons via Block Kit. Verdict: **third**, for developers.
- **Discord.** A bot over the Gateway WebSocket needs no public address; DMs and buttons
  (components) work; the person creates an application in the developer portal (more steps than
  BotFather) (DOCUMENTED, Discord docs from memory). Verdict: later, on demand.
- **Signal.** No bot API; `signal-cli` (GPL-3.0) registers a phone number as a full unofficial
  client (DOCUMENTED from memory). End-to-end, so Signal keeps nothing, which is attractive, but it
  needs a spare number. Verdict: later, for the privacy-minded, as an experiment.

---

## 5. Rakazo's mechanisms on Ducter's design

| Rakazo (`research/77` §1) | Ducter's place for it | Adapt how (INFERRED) |
|---|---|---|
| One thread shared with the app | The conversation (`conversation.md`) | A chat-app message is a turn with `source: telegram`; the reply goes back where the turn came from **and** shows in the app as usual. The living message stays in the app; Telegram gets the ack, the result's words, and at most the progress budget |
| Code linking, silent on wrong codes | Settings › Chat apps (new) | §1.8; the code arrives inside the deep link |
| Transactional outbox, idempotent parts, per-chat lanes, backup job | The Log (`context.md`) already orders events; the push relay already retries (`research/45`) | One outbox row per outgoing part, written in the same Log append as the message; one lane per linked chat; `retry_after` honoured; "bot was blocked" (403) stops and marks the link broken in Settings |
| Typing at once; late reaction | The waiting line | `sendChatAction` every 4 s while the turn runs; no reaction needed (Telegram has typing) |
| ≤ 3 interim messages after 60 s | Job status lines (D104) | Same budget; or one `sendMessageDraft` updated in place (later) |
| STOP in 14 languages | **暂停 / Pause** (D207), "Never mind" cancels the job | Exact words in the linked 1:1 chat only: 停 · 停下 · 暂停 · stop · pause → Pause the task(s) this chat started; **/stop** as a command. Cancel stays in the app (it can't be undone there either way, but Pause is the safe word) |
| YES/NO only for the newest confirmed prompt | Asks with defaults (D67) | Buttons make this mostly moot on Telegram; the text rule is needed for WeChat and as a fallback |
| Routine results not sent to the chat app | Routines' report policy (`product-model.md`) | Ducter does better: a routine's **怎么告诉你 / Reports** may choose Telegram; WeChat only under its 24-h rule |
| Rich things degrade to title + link | The result's Details, cards | The link opens the Ducter app at that thing (the home's address, or the app's URL scheme) |

---

## 6. Which Go cards may be buttons in a chat app

Principle (INFERRED): a chat account is a weaker identity than a paired device. Anyone holding the
person's unlocked phone, a Telegram session on another computer, or a SIM-swapped account can
press a button; Telegram can read the card; and a button can't show the faithful miniature
G-safety Rule 4 requires. So a button may decide only what is **reversible or reaches nobody**,
and anything that reaches people with no way back opens the card in Ducter.

| Card (the effect ladder, G-safety §0) | In Telegram | Why |
|---|---|---|
| How to do the work (D67 asks with a default and a time) | **Buttons**, both choices | Reversible; the default would happen anyway |
| Start a task now / later, pick a computer (D185, D157) | **Buttons** | Nothing leaves |
| A routine's proposal card, pause / resume a routine | **Buttons** for pause/resume; **the proposal opens in Ducter** | Pausing is safe; a new routine carries a budget and an effect scope that must be read |
| Push to another branch, force-push, PR comment, mark ready, request review | **Opens in Ducter** | Reaches people or is hard to undo |
| Merge into main | **Opens in Ducter** | Revert only |
| Email or chat message to a person, social post, form submit, share link | **Opens in Ducter** | Sends as the person; the miniature must be seen whole |
| A phone tap behind Go (D217 §6), Use this phone (D238) | **Opens in Ducter** | Acts as the person in their apps |
| Spending over a budget (D29), a call (D35) | **Opens in Ducter** | Money, people |
| Payment, sign-in, passwords, codes | **Never in a chat app**, and never a button anywhere (the person does it by taking over) | Unchanged rule |

The "opens in Ducter" message is still useful in Telegram: the partner's one-sentence question,
then a `url` button **在 Ducter 里看看 / Open in Ducter** to that card, so the person knows what is
waiting and decides with the full card on a paired device. This needs a Dn (`research/77` §8.1
adaptation 3 flagged it).

---

## 7. Recommended order and minimal first slice

**Order:** Telegram → WeChat ClawBot (experiment, zh) → Slack DM via Socket Mode (developers) →
Discord / Signal on demand → iMessage only for a dedicated home Mac. WhatsApp: no.

**First slice (Telegram, about one change loop):**
1. Settings › 聊天软件 / Chat apps › **连到 Telegram / Connect Telegram**: the three BotFather steps
   shown, a token field, then Ducter sets the bot's name, photo, descriptions and `/stop` in zh and
   en, and shows the deep link (and a QR on a computer).
2. The home: one long-poll loop (`getUpdates`, `timeout` ≈ 50 s, `allowed_updates` =
   `message`, `callback_query`), the link code, owner-only.
3. Turns in, replies out through a small outbox (one lane, idempotent parts, `retry_after`,
   permanent-error stop), typing every 4 s, `entities` not MarkdownV2, 4096 split.
4. Pictures and files both ways within 20 MB / 50 MB.
5. **Go cards: only D67 asks and "start it" cards as buttons**, with edit-to-end-state and
   stale-tap toasts; every other card as the one-line question plus **Open in Ducter**.
6. Exact-word Pause.
Not in the slice: routines reporting to Telegram, drafts streaming, groups, managed bots, the
local Bot API server.

---

## Implications for Ducter

1. **Telegram works for a home with no public address**: long polling, outbound only. Rakazo's
   webhook-only choice is not a constraint for us. Updates last only 24 h, so a home that was off
   says so once.
2. **The person's own bot really can carry the partner's name and face**: after the token is
   pasted, `setMyName`, `setMyProfilePhoto`, `setMyDescription` set them from the home. The cost
   is three steps in BotFather. Managed Bots would make it one tap, but only if a Ducter-run manager
   holds every token, which conflicts with self-deployment.
3. **Buttons are easy to make safe** (opaque 64-byte ids, edit to the end state, toasts for
   stale taps), so the question is policy, not mechanics: buttons only for reversible cards; the
   rest opens in Ducter. Needs a Dn.
4. **WeChat has exactly one safe personal path, ClawBot/iLink**, and it is reply-mostly (24-h
   window, a message budget), button-less, real-name-gated, gray release, with terms I could not
   read. Treat it as an experiment for zh users. Never Wechaty-style protocols: they risk the
   person's WeChat account.
5. **iMessage's problem is identity**: from the person's own Mac, the partner would speak as the
   person, and Full Disk Access reads all their messages. Not before a dedicated-Mac story.
6. **WhatsApp's 2026 terms exclude a general-purpose assistant.** Drop it.
7. **Telegram keeps the chat** (cloud chats, not end-to-end); say it in one line when connecting,
   and keep money, sign-ins and sending-as-you out of chat apps.
8. **Telegram is blocked in mainland China**, so "Telegram first" serves the author and users
   abroad; the mainland consumer user needs WeChat ClawBot or the Ducter app.

## Summary

Telegram is the right first chat app: long polling needs no public address, the person's own
BotFather bot gets the partner's name and photo from the home through the Bot API, inline buttons
(64-byte data, styles, editable) can carry Go cards safely, and limits (4096 chars, 50 MB up /
20 MB down, ~1 msg/s per chat, 5-second typing) are comfortable. Its costs are three BotFather
steps, a chat Telegram can read, and no reach in mainland China. WeChat's only safe path is
Tencent's ClawBot over iLink (official, long-polling, but reply-mostly, button-less, real-name
gated, gray); every unofficial protocol risks the person's account. iMessage from a Mac home makes
the partner speak as the person; WhatsApp's 2026 terms bar general assistants; Slack (Socket Mode),
Discord and Signal are later options. Recommend a Telegram first slice with buttons only for
reversible cards (D67 asks, start-it cards) and **Open in Ducter** for anything that reaches
people, money or sign-ins, then ClawBot as a zh experiment.
