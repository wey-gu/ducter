# 88 · Chat channels: the partner in Telegram, Slack and iMessage, as more windows on one conversation

Date: 2026-11-16. Question (the author): how can Ducter elegantly let the person talk to their
partner from **Telegram, iMessage and Slack**, and how do earlier projects do it?

This report builds on `research/79` (Telegram Bot API 10.4 in depth, WeChat, iMessage identity,
which Go cards may be buttons) and `research/77` §1 (a self-hosted many-bots product's chat-app
outbox and linking). It does not repeat them. New here: Slack read fresh from its docs; the
current state of the iMessage path on a Mac; how open-source agent projects shape a channel
(inbound → conversation, outbound → per-channel rendering, pairing, degrade, many channels at
once), read in their source; and how all of it lands on Ducter's code as it is today
(`packages/core/src/ws.ts`, `decisions.ts`, `push.ts`, `connections.ts`).

Sources (read only, nothing run):
- Slack developer docs, read 2026-11-16: Socket Mode (`docs.slack.dev/apis/events-api/using-socket-mode`),
  the button element (`docs.slack.dev/reference/block-kit/block-elements/button-element`), rate
  limits (`docs.slack.dev/apis/web-api/rate-limits`), the 2025-05-29 changelog on non-Marketplace
  apps, and "Developing agents" (`docs.slack.dev/ai/developing-agents`).
- Telegram's bots features page (`core.telegram.org/bots/features`, read 2026-11-16) for Business
  bots, Mini Apps and Managed Bots; the rest of Telegram is `research/79` §1 (Bot API 10.4,
  2026-11-09).
- Apple Business Register's Messages for Business documentation (read 2026-11-16).
- The open-source Messages CLI `imsg` (0.21.1, 2026-11-15; README read in a fresh clone).
- Four open-source projects read in fresh clones (2026-11-13 to 2026-11-16): a single-person
  agent chat app with Telegram and Slack channels, a multi-channel agent gateway (about 30 chat
  apps), a Python agent's messaging gateway (about 25), and a multi-platform chat SDK. Plus a
  coding-agent GUI, checked for remote or chat channels (it has none). File-level notes are kept
  privately; this report names them by category.

Tags: **VERIFIED** (read in source or the vendor's own page), **DOCUMENTED** (a vendor or
maintainer page says so, not checked further), **INFERRED** (my reasoning).

---

## 1. What a person wants here (the scenario first)

- **The heavy developer** lives in Slack at work and Telegram on the phone. They want to fire off
  "看下 CI 为什么挂了" from wherever they already are, get the result there, and press Go on a
  rebase without opening another app. Before: switch to the Ducter app, find the conversation.
  After: the partner is just another contact in the apps they already have open.
- **The consumer personal-AI user** already has an AI in a chat app (a Telegram bot, a WeChat
  contact). For them "Ducter in Telegram" is the *normal* shape, and the Ducter app is the extra.
- **The fresh user** has never heard of a bot token. Every step of connecting must be something
  they can do by following pictures, and nothing may feel like configuring a server.

Feelings to protect (the north star): 顺滑 (the chat app feels native, not a webhook dump), 放心
(nobody else can talk to *my* partner; nothing it says in a chat app can spend money or speak as
me), 惊喜 (the partner has its own name and face there). The original intent holds per channel:
it reaches you only when it truly matters, and adding a channel must not double the pings.
(INFERRED)

---

## 2. Telegram: what is new since research/79

`research/79` §1 stands (long polling, the person's own BotFather bot named and pictured from the
home, 64-byte `callback_data`, edit to end state, 4096 chars, 50 MB up / 20 MB down, ~1 msg/s per
chat, typing ≤ 5 s, `sendMessageDraft`, cloud chats readable by Telegram, blocked in mainland
China). Three additions:

1. **Business bots ("Secretary Mode") are the wrong door.** Telegram lets a user "connect the bot
   to their account" so it processes and answers their *personal* chats; "the account owner can
   specify which chats your bot can access" (VERIFIED, features page). That is the partner
   speaking **as the person** to other people: an effect behind a Go card at best, never the
   chat surface. (INFERRED)
2. **Mini Apps** "can be launched right inside Telegram", from a Launch app button or the menu
   button (VERIFIED). A Mini App is a web page, so it could host the full decision card (the
   faithful miniature G-safety Rule 4 needs) inside Telegram. But it loads from a URL the
   person's Telegram can reach, i.e. the home's HTTPS address (`ducter domain`, Tailscale, or a
   tunnel), and its identity is Telegram's `initData`, not a paired Ducter device. Later, and
   only for homes with an HTTPS address. (INFERRED)
3. **Managed Bots** (one-tap bot creation through a "manager" bot) remain the consumer-friendly
   onboarding, with `research/79` §1.2's caveat: whoever runs the manager can fetch every token
   (VERIFIED: `getManagedBotToken`, `replaceManagedBotToken`). Not while Ducter is self-deployed
   with no trusted relay for this. (INFERRED)

What the open-source projects confirm in code (VERIFIED in all three that ship Telegram): long
polling is the default transport; an update's offset is confirmed only after the message is
stored, so a restart re-reads and storage dedupes by the service's message id; an album
(`media_group_id`) is drained with one extra zero-timeout poll so it arrives as one message;
typing is re-sent every 4 s; a `409` conflict means another reader (or a webhook) holds the
token and is shown to the person in words. The best gateway's 2026 default is **one editable
status message during the turn, then the final answer as a new message** (so the answer
notifies and the status edits don't). That is Ducter's ack → job → result shape almost exactly.

---

## 3. Slack

### 3.1 The only right identity: a Slack app with its own bot user

- Ducter already reads Slack through OOMOL with the person's **user** token (`slack` service;
  D165 watches only @-mentions and DMs; `packages/core/src/proactive/items.ts:223`). Anything
  posted with that token is posted **as the person**. (INFERRED from the token type)
- A chat surface needs the partner to be **someone else** in Slack: a Slack app with a bot user,
  whose name and icon are the partner's. Every project read draws this line: one product's own
  doc says a channel's reply is "the bot speaking as itself, from its own ... Slack app", while
  messages "in the user's name from the user's own accounts" are drafts the user reviews on a
  card (VERIFIED). The largest gateway *offers* a "post as user" mode with a user token
  (VERIFIED); Ducter must not, for the partner's voice. Sending as the person stays what it is
  today: an effect behind a Go card (G-safety §0). (INFERRED)
- OOMOL also lists a `slackbot` and a `telegram` service (`packages/core/src/oo-link.ts:121-122`),
  so a bot token *could* sit in a connector. But a conversation needs inbound in about a second,
  and oo has no triggers (`connections.ts`: "an account reached through oo can't be watched");
  the proactive watch reads every 10 min (D165). A chat channel therefore holds its own socket
  on the home, not a connector poll. (VERIFIED for oo's lack of triggers; INFERRED the rest)

### 3.2 Transport: Socket Mode, no public address

- An app-level token (`xapp-`) opens a WebSocket via `apps.connections.open`; each event carries
  an `envelope_id` that must be sent back, "so that Slack knows whether to retry"; the connection
  refreshes "once every few hours", with `warning` / `refresh_requested` disconnects; up to 10
  connections at once; inbound needs no signature check (VERIFIED, Socket Mode page). One project
  acks only after the message is stored and keeps name lookups off the ack path because Slack
  wants it within 3 seconds (VERIFIED in source; the 3 s figure is from that source, not the page
  I read).
- **Socket Mode apps are not allowed in the public Slack Marketplace** (VERIFIED). That is fine:
  each person creates their own app in their own workspace, the BotFather equivalent.
- **Rate limits.** `chat.postMessage`: "no more than one message per second per channel", short
  bursts allowed (VERIFIED). The 2025-05-29 cut of `conversations.history` / `.replies` to 1
  request a minute and 15 objects applies to *commercially distributed* non-Marketplace apps;
  "Internal customer-built applications are not impacted" (VERIFIED). A person's own app in their
  own workspace is internal, so the partner can read its DM history normally. (INFERRED)

### 3.3 Buttons, edits and Slack's agent surface

- **Block Kit buttons:** label ≤ 75 chars (may truncate near 30), `action_id` ≤ 255, `value` ≤
  2000, `style` `primary` or `danger`, optional `confirm` dialog (VERIFIED). So D129's Go label
  ("好，创建") fits, and the value holds an opaque decision id as on Telegram. A tap arrives as an
  `interactive` envelope on the same socket (DOCUMENTED, the gateways' docs); the home answers
  it, then `chat.update`s the message to its end state, the same rule as `research/79` §1.3.
- **Agents surface (2026).** An app with the Agents feature and `assistant:write` appears labelled
  as an agent, with app threads above the composer; `agents.sessions.setStatus` shows
  `processing` / `active` / `suspended` (needs input); `assistant.threads.setSuggestedPrompts`;
  `chat.startStream` / `appendStream` / `stopStream`, a stream open at most 10 minutes; events
  `agent_session_stopped`, `agent_session_title_changed`; "some AI features require a paid plan"
  (VERIFIED, Developing agents page). Mapping: `processing` is the waiting line, `suspended` is an
  open decision, `agent_session_stopped` is 暂停 / Pause. Attractive, but plan-gated and
  thread-shaped; the first Slack slice should be a **plain DM with the bot**, which works on every
  plan, and add the agent surface when present. (INFERRED)
- **Threads.** One gateway keeps top-level DMs off-thread and uses threads only where Slack's
  agent card lives (VERIFIED). For Ducter, a DM is the conversation; a thread under a partner
  message is a **Reply** to that message (D236), not a new conversation. (INFERRED)

### 3.4 Onboarding cost and the workplace caveat

- Steps (INFERRED, counted from the app-setup flow in the projects' docs): create the app from a
  manifest Ducter provides (bot user, scopes `chat:write`, `im:history`, `im:read`,
  `users:read`, `files:read`, `files:write`; events `message.im`; Socket Mode on; interactivity
  on), install it to the workspace, copy the bot token and create an app-level token with
  `connections:write`, paste both. About five steps and two secrets, versus Telegram's three and
  one. Workspaces often require an admin to approve app installs (DOCUMENTED-secondhand).
- **A work Slack belongs to the employer.** Depending on the plan, workspace owners can export
  or retain DMs (DOCUMENTED from memory of Slack's plan pages; not re-checked here). The connect
  card needs one plain line, the Slack twin of `research/79`'s Telegram line: **这个工作区的管理员
  可能看得到你在这儿说的话 / This workspace's admins may be able to see what's said here.** And the
  partner should not volunteer personal finds (a flight, a bill) into a work Slack unless the
  person asked there. (INFERRED)

---

## 4. iMessage

### 4.1 The path the open-source world converged on

- **One gateway removed BlueBubbles in 2026** and now supports iMessage only through `imsg`
  spawned as a child process speaking JSON-RPC over stdio ("No server, no webhook, no port");
  a Linux gateway reaches a Mac's `imsg` over an SSH wrapper (VERIFIED, its announcement page).
- `imsg` 0.21.1 (2026-11-15), macOS 14+: reads `~/Library/Messages/chat.db` read-only, watches
  the database and WAL with a polling fallback, sends through Messages automation. Needs **Full
  Disk Access** (granted to the parent process) and **Automation → Messages** for sending and
  standard tapbacks. Read receipts, typing, edits, polls and rich sends need an injected helper
  with **SIP disabled**, which "may be blocked by library validation or private-entitlement
  checks on current macOS releases" (VERIFIED, README). On macOS 26, Full Disk Access does not
  always pass to background launch agents (DOCUMENTED-secondhand: a troubleshooting page and an
  Apple developer forum thread on macOS 26.1).
- After a restart that gateway replays what it missed and suppresses the "backlog bomb" Apple can
  flush after a push recovery, deduping (VERIFIED, its docs).
- **Messages for Business** needs a company, an Apple-approved messaging service provider, and an
  Experience Review before going live; conversations start from customer entry points (VERIFIED,
  Apple Business Register). Not for one person's partner.
- **Hosted lines** (a company holds Apple IDs or numbers and relays) exist; one shared free pool
  says "different recipients may see different sending numbers" (VERIFIED, a gateway's doc for
  such a service). Puts a company in the middle of every message. (INFERRED)

### 4.2 The real constraint is still identity (research/79 §3), and it now has a known answer

On the person's own Mac, Messages is signed into **their** Apple ID, so anything the home sends
comes from them, and Full Disk Access hands the home every message they ever exchanged. The
gateway's documented answer is a **dedicated macOS user signed into Messages with a separate bot
Apple ID** (VERIFIED, its deployment page). For Ducter that means (INFERRED):

- Only when the home or a worker is a Mac, and only with a **second Apple ID for the partner**,
  ideally on a Mac that is Ducter's (a Mac mini home), or in a separate macOS user that stays
  logged in. The person then texts the partner's Apple ID like a contact, and the partner has its
  own name and photo in their Contacts.
- Full Disk Access then covers only the partner's own Messages database, which holds only its
  conversations with the person. That makes it acceptable.
- No buttons. Without SIP off there are no polls and no edits. Decisions degrade to text, and to
  **tapbacks**: one gateway maps 👍 Like to the safe yes and 👎 Dislike to no, counts only an
  explicitly allowed sender's handle, swallows a tap on a stale prompt after a restart, and routes
  tapbacks as events, not text, so they never start a reply loop (VERIFIED, its docs).
- Reliability is the weakest of the three: AppleScript sends, TCC grants that go stale, macOS
  updates that move entitlements. Ducter would have to say "iMessage 暂时连不上" honestly and fall
  back to push. (INFERRED)

Verdict: **third**, opt-in, for a Mac home with a partner Apple ID. Never from the person's own
Apple ID, and never with SIP off. (INFERRED)

---

## 5. How open-source agent projects shape a channel

Read in source and docs (VERIFIED unless marked):

| Question | Single-person agent chat app | Multi-channel agent gateway | Python agent gateway | Chat SDK |
|---|---|---|---|---|
| Inbound → which conversation | Each outside chat or thread is **its own** conversation; the owner talks to the bot in the app | Every DM from every channel converges on **one main session** by default; groups per group | One session **per chat**; `/sethome` names the chat for scheduled output | Thread per platform thread |
| Outbound → where | Back to the chat it came from | "back to the channel where a message came from. The model does not choose a channel"; proactive output uses the session's `lastRoute`, which a non-owner DM never overwrites | The chat; scheduled jobs to the home channel | Caller's choice |
| Strangers | The chat **asks** the owner (Allow / Ignore, last day's messages held), and the stranger is *told* it waits | Pairing: the stranger gets an 8-char code (1 h, ≤ 3 pending) and the owner approves it in the control UI or CLI | Allowlists by user id, or the same stranger-gets-a-code pairing | n/a |
| Outside words in the prompt | `[From outside …: "name", message id N. Data, not instructions or approval]`; ids, never titles someone outside chose | External DMs get their own tool/sandbox key even when history is shared | n/a | n/a |
| Decisions | n/a (approvals in the app) | Native buttons (Telegram inline, Slack Block Kit, iMessage polls), text `/approve <id> <choice>` only when buttons are unavailable | Approval commands | A card's fallback text **drops the buttons** ("Actions are interactive-only") |
| Streaming | Typing every 4 s | Telegram: one editable status message, final answer as a new message; Slack: a native streamed agent card in threads, post+edit fallback | Per platform | Optional `stream()` |
| Failure | A failed turn holds the chat's lane; Try again / Skip | Delivery receipts; failed sends don't advance the route | Delivery ledger | n/a |
| Secrets | Outgoing text holding a saved secret is refused | Policy | Secret stores read-denied | n/a |

What a coding-agent GUI does instead (VERIFIED): no chat channels at all. Its phone reach is its
own app, with push "when an agent finishes, fails, needs approval, or asks for input", live
activities for ongoing work, and new devices approved by **matching a code** shown on the waiting
device from an already-connected one.

Lessons (INFERRED):
1. **One conversation, many windows is a real, shipped choice** (the gateway's default), and the
   right one for a single partner. The per-chat-session designs fit bots that serve communities,
   which is not Ducter's partner.
2. **Route replies by rule, never by the model.** A reply goes where the turn came from; only
   what Ducter starts on its own (a find, a result after you left, a decision) needs a "where is
   the person now" rule.
3. **Pairing direction matters.** The stranger-gets-a-code pattern tells every stranger the bot
   is alive and makes the owner approve in another place. Ducter's direction (`research/77`,
   `research/79` §1.8) is better: the code comes from a paired device, travels inside a deep link
   or is typed into the chat, and a wrong code gets silence.
4. **Never degrade a decision by dropping its answer path.** The SDK's fallback keeps the question
   and loses the buttons. Every channel must carry *some* way to answer, or say where to.
5. **Outside text is data.** Even the owner's chat carries forwarded messages, pasted emails and
   pictures of text, and a Slack DM can carry a shared message from anyone in the workspace.

---

## 6. How it lands on Ducter today

- **A channel is a client, not a conversation.** Clients already append the person's words with
  `send` (`packages/core/src/ws.ts:429-441`: `logUserMessage(log, decisions, {text, clientId,
  media, reply})`, deduped by `clientId`) and answer cards with `decide`
  (`ws.ts:443-461` → `decisions.decide(decisionId, option, text)`). A channel adapter on the home
  can call the same two functions in-process: the service's message id becomes `clientId`, a
  Telegram or Slack reply becomes D236's `reply`, a picture becomes D206 media. The partner is
  triggered by the existing `user_msg` subscription. Nothing about the Log, the partner or the
  digest changes. (VERIFIED for the functions; INFERRED the fit)
- **One field is new:** where the person's words came from (`via: "telegram"`), kept on the
  event so the app can draw a small mark under that message and so the reply knows where to go.
  (INFERRED)
- **Decisions already carry what a button needs:** `decisionId`, `question`, `goLabel`,
  `defaultOption`, `defaultAt`, `reversible`, and typed kinds (`pay`, `key`, `signIn`, `phone`,
  `computer`, `handset`, …) (`packages/protocol/src/index.ts:256-281`). So the button policy of
  `research/79` §6 is mechanical: buttons only when `reversible` and none of the kinds that reach
  money, sign-ins, keys, phones or people is set; everything else is the one-sentence question
  plus **在 Ducter 里看看 / Open in Ducter**. (VERIFIED fields; INFERRED policy)
- **Quiet hours and push already exist** (`push.ts`: `Quiet`, `DEFAULT_QUIET` 23:00–08:00,
  `inQuiet`, `quietEndsAt`; the proactive engine's one morning note). A channel message is a
  notification on the person's phone, so it must go through the **same gate** as a push, never
  around it. (VERIFIED code; INFERRED rule)
- **Pairing:** D83's one connection code with a `role` fits: the chat redeems it as
  `role: "chat"`, and the token it gets opens nothing (the channel lives on the home). (INFERRED)

---

## 7. The design: one conversation, many windows

### 7.1 What goes where (INFERRED)

| What | The Ducter app | The chat app the person used last |
|---|---|---|
| The person's message sent from the chat app | shown, with a small 来自 Telegram / via Telegram mark | (it's there) |
| The ack and the result of a turn started in the chat app | shown as usual | sent there |
| The waiting line while that turn runs | as built | typing every 4 s; after 60 s at most one status message, edited in place, deleted or frozen when the result comes |
| A decision from that turn | the full card | buttons (reversible only) or the question + Open in Ducter |
| A turn started in the app | shown | **not mirrored** |
| Something Ducter starts itself (a find, a late result, a decision) | always | only if the person's **last words to the partner came from that chat app** and no app is in the foreground; under the same quiet hours, the same "only when it matters" bar, and the same one-morning-note batching |

Rules behind it:
- **Each thing reaches the person once.** If it went to Telegram, the app's push for the same
  item is not sent, and the other way round. The app is the archive, not a second ping.
- **Where you are is where you last spoke.** That is the gateway's `lastRoute`, made strict:
  only the owner's own messages move it; a read or a tap in the app moves it back to the app.
  A setting can pin it later (**在哪儿找我 / Where to reach me**), but the default needs none.
- **Telegram and Slack have no read receipts for bots**, so principle 7's "a read receipt
  freezes the living message" can't be driven from there. A reply, a tap or a new message from
  the person counts as read; until then the partner may **edit** its last status message (no new
  ping), and anything that changes meaning is a **new** message (matching "words freeze, details
  live"). (INFERRED; no read-receipt update exists in the Bot API pages read for `research/79`)
- **Answered anywhere, settled everywhere.** When a decision resolves (the app, a timeout default,
  the chat), the chat message is edited to its end state (你说：好，创建 / 你没回，我照原计划做了) and
  its buttons removed; a stale tap gets a toast (这件已经定了). On iMessage, which can't edit, the
  partner sends nothing more and ignores a late 好.

### 7.2 Decisions on each channel (INFERRED, policy from research/79 §6)

| Card | Telegram | Slack | iMessage |
|---|---|---|---|
| Reversible ask with a default (D67), start now / later, which computer | Inline buttons, Go `style: primary` | Block Kit buttons | Text: "回 好 就照做，回 先等等 就放着" + 👍 / 👎 tapback; only for the newest open card, delivered < 24 h ago |
| Reaches people, merges, sends as you, phones, computers | Question + Open in Ducter (`url` button) | Question + Open in Ducter (link button) | Question + a link |
| Money, sign-ins, keys, passwords | Never in a chat app | Never | Never |

A typed 好 / ok / go in Telegram or Slack is also accepted under the iMessage rule, so the
person never has to find the button. Everything else they type is a normal message, and D236
already makes a reply to an open question answer it.

### 7.3 Pairing and strangers (INFERRED)

- Settings › **聊天软件 / Chat apps** › Connect Telegram / Slack / iMessage. The home makes a
  one-time code (D83: 10 minutes, one use, lockouts).
- Telegram: the deep link `t.me/<bot>?start=<code>` (a QR on a computer). Slack: after the tokens
  are in, the card says "在 Slack 里给 {name} 发：{code}"; the first DM carrying the code links that
  Slack user. iMessage: text the code to the partner's Apple ID.
- One linked account per channel per persona. A message from anyone else gets **silence** and is
  not stored; the app's channel row shows "有人在 Telegram 找过 {name}" at most once a day, so a
  person who shared the bot by mistake learns of it without the stranger learning anything.
- Unlinking is one tap in the app; a `403 bot was blocked` from Telegram, `account_inactive` or a
  revoked token from Slack marks the row **连不上了 / Can't connect** in words.

### 7.4 Safety (INFERRED)

- **The chat account is a weaker identity than a paired device** (a stolen unlocked phone, a
  Telegram session left on a shared computer, an employer's Slack admin). Hence the button policy
  and "never in a chat app" for money and secrets.
- **Forwarded content is untrusted.** A Telegram forward (`forward_origin`), a Slack shared
  message, a quoted email or a picture of text is marked as outside data in the partner's turn,
  exactly as connector reads are; instructions inside it are not the person's. The owner's own
  typed words in the linked chat are the person speaking.
- **Outgoing text never carries a saved secret** (Autofill, keys): the adapter refuses and the
  partner rewords, as one project does in code.
- **One line of where the words live** on each connect card: Telegram keeps a copy; Slack's
  admins may see; iMessage stays in the partner's Apple ID.
- **Never send as the person** from a channel: no Telegram Business connection, no Slack user
  token, no iMessage from their Apple ID.

---

## 8. Which first, and the smallest first slice

**Order (INFERRED):** **Telegram → Slack (DM with the partner's own app) → iMessage (a Mac home
with a partner Apple ID).** Telegram first because it is the cheapest to connect (three steps,
one secret), has the richest native shape (buttons, edits, typing, drafts, the partner's own
name and photo), needs no public address, and works the same from a Mac or a Linux home. Slack
second for the developer at work: Socket Mode also needs no public address, but onboarding is
two secrets, workspaces may block installs, and the employer may read it. iMessage last: Mac
only, a second Apple ID, AppleScript sends, no buttons.

**First slice (Telegram, one change loop), refining `research/79` §7:**
1. A `Channel` port on the home: `start / stop`, inbound `{via, account, chatId, messageId,
   text, media, replyTo, forwarded}`, outbound `say(text) / ask(decision) / settle(decision) /
   typing() / status(line)`, with declared capabilities (`buttons`, `edit`, `typing`,
   `maxText`, `maxUpload`). Telegram is the first adapter; a fake one runs in tests (a local Bot
   API stand-in, as the projects read do).
2. Inbound goes through the existing `logUserMessage` and `decisions.decide`; a `via` field on
   the user message; `clientId` from the service's message id.
3. Outbound for turns started in Telegram only, plus decisions from those turns; nothing
   proactive yet. Typing every 4 s; entities, not MarkdownV2; split at 4096; one outbox row per
   part, `retry_after` honoured.
4. Buttons for reversible cards, edit to end state, stale-tap toast; Open in Ducter otherwise.
5. Pairing by deep link and D83 code; silence for strangers; Unlink; Can't connect in words.
6. Pictures and files within 20 MB in / 50 MB out.

**Second step:** "where you are is where you last spoke" for proactive output and decisions,
with the once-only rule and quiet hours. **Then** Slack on the same port (DM only, Block Kit,
`chat.update`), then the Slack agent surface where the plan allows, then iMessage.

**Must not be done (INFERRED):**
- Send as the person from any channel (Slack user token, Telegram Business, the person's own
  Apple ID).
- Make a chat app its own conversation or persona thread: it is a window.
- Mirror every app turn into the chat app, or ping on two places for one thing.
- Let a chat-app button decide anything that reaches people, money, sign-ins or devices.
- Drop a decision's answer path when a channel has no buttons.
- Answer, or even acknowledge, a stranger.
- Use unofficial client protocols, SIP-off helpers, or a Ducter-run manager bot holding tokens.

---

## Implications for Ducter

1. **A chat app is another window on the one conversation**, implemented as a home-side client
   that calls the same `send` and `decide` paths the apps use. The Log, the partner and memory do
   not change; one `via` field is new.
2. **Replies route by rule**: back where the turn came from. Only what Ducter starts itself needs
   a "where is the person now" rule: the place of their last words, once, under the same quiet
   hours and "only when it matters" bar as push.
3. **Decisions degrade by policy, never by loss**: native buttons for reversible cards (Telegram
   inline keyboard, Slack Block Kit), text 好 / 先等等 plus tapbacks on iMessage, Open in Ducter
   for anything that reaches people, and never money or secrets. Edit to the end state wherever
   editing exists.
4. **The living message maps to edits only for status**; anything new is a new message, because
   bots get no read receipts and only new messages notify.
5. **Pairing reuses D83's code**, carried in a Telegram deep link or typed as the first DM; one
   linked account per channel; strangers get silence.
6. **The partner speaks as itself everywhere**: its own Telegram bot, its own Slack app, its own
   Apple ID. The OOMOL Slack connector stays a source to watch and a place for Go-gated sends as
   the person, not the chat surface.
7. **Order: Telegram, then Slack, then iMessage**, each behind one connect card with a one-line
   "who else can see this". This needs a Dn (the channel-as-window shape, the routing rule, the
   decision policy) before building.

## Summary

Telegram, Slack and iMessage can all reach a home with no public address (long polling, Socket
Mode, a local Messages database), so the question is shape, not plumbing. The projects read
split two ways: per-chat sessions (bots that serve communities) or every DM converging on one
main session with replies routed back where they came from (the shape a single partner needs).
For Ducter, a chat app should be another window on the one conversation: inbound through the
same `send` / `decide` paths, replies where the turn came from, proactive output only to where
the person last spoke and only once, decisions as native buttons when reversible and as Open in
Ducter otherwise, edits for status and new messages for news, D83's code for pairing and silence
for strangers. The partner must speak as itself (its own bot, its own Slack app, its own Apple
ID), never as the person. Build Telegram first (three steps, richest native shape), Slack second
(two secrets, the employer can see), iMessage last (Mac only, a partner Apple ID, no buttons).
