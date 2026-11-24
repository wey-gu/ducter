# iMessage: the partner in Messages, through a Mac (D277)

A chat app is another window on the one conversation (D276, research/88 §7). This note is the
iMessage window. Telegram and Slack live on the home and are in `channels.md`; iMessage is
different in one way that shapes everything: **only a Mac can read and send iMessage**, so the
bridge lives in the **Mac app**, which is a client of the home like any other. It works the same
whether that Mac is the home or a laptop connected to a home on a server.

Evidence: research/88 §4 (the path open-source gateways converged on, identity), research/79 §3
(why identity is the real constraint), research/114 (how a person gives the partner an Apple ID of
its own, D323), the reference notes in `research/private/` (how one
gateway reads `chat.db`, decodes `attributedBody`, sends with AppleScript and maps tapbacks).

## The person first

- **Who.** The consumer personal-AI user above all: their phone is an iPhone, Messages is where
  they already talk, and "my AI is a contact" is the shape they expect. The heavy developer uses
  it from the phone when away from the desk. The fresh user meets it as one card in Settings with
  plain steps and no concept to learn.
- **Felt.** Before: to ask the partner anything from the phone they open another app. After: they
  text it like a friend, it answers in the same thread, under its own name (放心: it never speaks
  as them; 顺滑: no new app; 惊喜: the partner is a contact with a face).
- **First time.** Settings › 聊天软件 / Chat apps › **iMessage**, the third group after Telegram
  and Slack (D283; it was under Notifications). Two choices (whose Apple ID this Mac's Messages is
  signed in to) with an honest line about each, the partner's own Apple ID as four steps with a
  check (D323), **连上 / Connect**, then a six-digit code to text from the phone. The two macOS
  permissions show as two rows that say what they allow, each with **允许 / Allow** until given.

## What goes where

The same rules as every chat app (research/88 §7.1), as the Mac app carries them out:

| What | Ducter (every app) | iMessage |
|---|---|---|
| The person's words from the linked handle | the conversation, as theirs (`user_msg.via: "imessage"`) | (there) |
| The ack and every answer to a turn started in iMessage, a late result too (`replyTo` is that turn) | as usual | sent back |
| A turn started in an app | as usual | **not mirrored** |
| What Ducter starts itself (a finding, a card) | always | only if the person's **last words came from iMessage** and the Ducter window is not in front; once; under quiet hours |
| A card a reply may answer | the full card | the question, then **回「好」就{go}，回「先等等」就先放着（点赞、点踩也行）** |
| A card that reaches people, phones, computers, another agent | the full card | the question, then **这个得在 Ducter 里定：打开 Ducter 看看。** |
| Money, a sign-in, a saved detail, a key | the full card | **有个决定要你在 Ducter 里亲自定，这里不方便说。** (never the content) |

**Each thing reaches the person once.** The Mac app tells the home how the bridge stands
(`channel_status`); while some socket says `on` and the last `user_msg` came via iMessage, the
home's push stays quiet for decisions and done items (`createPusher`'s `channelUp`). A question
from a live call still pushes at once (D189).

**Answering a card.** Only the newest open card that a reply may answer (reversible, and none of
pay, fill, sign-in, key, phone, computer, handset, an agent's ask, trust, a call, a calendar
change, a Mem plugin or a move-before-closing), sent less than 24 hours ago. 好 / 好的 / 行 / 可以 /
ok / go / yes and a thumbs-up go; 先等等 / 等等 / 先别 / 不 / hold / wait / no and a thumbs-down hold.
A Like or Dislike tapback on that card's own message counts the same (its guid is learned when the
sent message shows up in `chat.db`); a tapback on anything else is swallowed, never words, so no
reply loop. The partner answers with one line (**好，这就{go}。 / 好，先放着。**). A newer card that
can't be answered this way makes 好 answer nothing. Settled elsewhere: iMessage can't edit, so
nothing more is said and a late 好 is just words.

**Quiet hours.** The partner's own quiet hours (Settings › Notifications). Inside them nothing
Ducter starts goes to iMessage: findings are dropped (they are in the app), cards wait; at the end
the newest still-open card goes once, led by **夜里有 {n} 个等你定，这是最新的一个：** when more
than one waited. Answers to a turn the person started are not held: they asked.

**What it says.** Markdown is flattened (bold, code, headings, links as "words url"), anything
shaped like a key or a token is replaced by **（这里不方便发，在 Ducter 里看）**, and a long answer is
cut at 1,800 characters with **……后面还有，在 Ducter 里看全文。** Pictures the person sends come in as
D206 media (uploaded to the home from the attachment file); other files are not read.

**Several partners (D516).** The bridge rides the Mac app's socket, which shows one partner, so
iMessage speaks for the partner that Mac shows: its iMessage words keep `via` (core's `send` on a
second partner's socket), the bridge takes them for its turn and answers there; in the partner's own
Apple ID another partner than the default leads with its name (**小家：… / Home: …**, `Label`), as
Message yourself always leads with the shown one's. The one-thread rules of `channels.md` §10 (a
name first, a reply keeps, the thread holds) need the bridge's own connection to the home; owed.

## Mechanism (decided from evidence)

- **Read** `~/Library/Messages/chat.db` read-only, through the `sqlite3` that ships with macOS
  (no cgo, no driver in the app). The app spawns it, so macOS counts the app's **Full Disk
  Access**. Poll every 2 s, but query only when the database's or its WAL's size or time changed
  (and at least every 30 s). By ROWID: the cursor starts at the newest message when linking, so
  nothing already in Messages is ever read. Tables: `message`, `handle`, `chat` (style 43 is a
  group: never read), `chat_message_join`, `attachment`, `message_attachment_join`.
- **Decode `attributedBody`** when `text` is NULL (recent macOS): a typedstream; the first
  NSString after the `0x01 0x2B` marker, length-framed (one byte, or `0x81` + two, `0x82` +
  four). Anything unreadable is skipped, never guessed.
- **Send** with AppleScript through `osascript`: `send` to the `buddy` of the iMessage account.
  The handle and the words are script arguments, never part of the script's text. AppleScript
  error -1743 is the Automation permission refused; -1728 is no iMessage account.
- **Why not a private API or a helper:** typing, read receipts, edits and polls need an injected
  helper with SIP disabled, which current macOS may still block (research/88 §4.1). Ducter never
  asks anyone to turn SIP off. The cost: no buttons, no typing dots, no edits.
- **Why not a hosted line or Messages for Business:** a company in the middle of every message,
  or a business registration (research/88 §4.1).

## Identity: never speak as the person

Two modes, chosen before connecting, both labelled in words:

1. **{name} 自己的 Apple ID（推荐） / {name}'s own Apple ID (recommended).** This Mac's Messages is
   signed in to an Apple ID made for the partner, on a Mac where the person doesn't use Messages
   themselves (below). The person texts it like a contact; it answers as itself, one to one.
2. **给自己发信息 / Message yourself.** This Mac's Messages is the person's own Apple ID. The
   partner talks only in the thread the person keeps with themselves; every line starts with
   **{name}：**, so nothing it says can pass for the person's words. The same words seen twice in
   that thread within 30 s are one message; lines starting with the partner's name are its own.
   Messages itself shows every line of that thread twice (sent and received); Ducter can't change
   that (research/114 §5), and the card says so.

Under the choice, one line each, what it is like (D323): **一对一的对话，像在跟朋友发消息。要给{name}注册一个
Apple ID，还要一台你自己不用「信息」的 Mac。** and **现在就能用。但每句话在对话里都会出现两遍，一遍是发出的，一遍是收到的：这是
「信息」自己的样子，Ducter 改不了。**

## Its own Apple ID, step by step (D323)

**Where it can live** (research/114). One Apple ID in Messages per macOS user, and it may differ from
the user's iCloud Apple ID.

- **One Mac, where the person doesn't use Messages themselves:** sign only Messages in to the
  partner's Apple ID. iCloud stays theirs; their own iMessages stay on their phone.
- **One Mac where they do:** Message yourself. A second macOS user is not offered: AppleScript
  sending fails while that user is in the background, it must be logged in by hand after every
  restart, and FileVault rules out automatic login.
- **A spare Mac (an old MacBook, a Mac mini) or a server home with a Mac:** Ducter on that Mac,
  connected to the home like any Mac (a D293 worker Mac is the same app), Messages there signed in to
  the partner's Apple ID, plugged in, awake, logged in. Connect iMessage on that Mac.

**The steps** (partner mode, before Connect), each a step mark and a sentence saying what to do and
where:

1. **给{name}注册一个 Apple ID。** A new email, on any device; the codes go to the person's own phone
   number. **打开 account.apple.com**.
2. **在这台 Mac 上，让「信息」登录{name}的 Apple ID。** Messages › Settings › iMessage: sign out, sign in
   with the partner's. **检查 / Check** asks Messages (the first time macOS asks for Automation) and
   says what it found: **「信息」登录的是 {address}。** (done ink); not signed in (failed ink); or, when
   that address is also this macOS user's iCloud Apple ID, **…和这台 Mac 的 iCloud 是同一个 Apple ID。如果它是你自己的，
   先在「信息」里换成{name}的。** The address is Messages' account `description` (taken to be its address
   and dropped when not shaped like one; unverified); iCloud's is the user's `MobileMeAccounts`
   preferences, read only.
3. **让这台 Mac 一直开着，Ducter 也开着。** Plugged in, awake, someone logs in after a restart; on a Mac
   where the person uses Messages, use another Mac. When this macOS user isn't the one in front
   (it doesn't own the console), the step says so in the failed ink, and so does a row once
   connected: **从后台的用户发不出 iMessage。…**
4. **点「连上」，再用你的手机给{name}的 Apple ID 发一串数字。**

**The code tells the truth.** Each row read carries the address of this Messages it came in at
(`destination_caller_id`, else `account`, else nothing). In partner mode a code arriving in the thread
of an address with itself means this Messages is the person's own: nobody is linked, nothing is sent,
and the card says **你发的数字出现在你和自己的对话里：…** with **改成给自己发信息**, which starts over in
Message yourself. A code that links learns the partner's address, so the code line says
**用你的手机给 {address} 发这串数字：** and the linked row **{name}用 {address} 和你一对一地聊。…**

**Which Mac carries it.** The bridge's `channel_status` names its Mac (its Computer Name). The home
puts the Macs carrying iMessage on the Chat apps frame (`imessage: [{computer, state, here}]`),
again whenever one changes or its socket goes. Another Mac's card says **开着，在「{Mac}」上** and
**在「{Mac}」上收发**, without Connect (two Macs on one Apple ID would both answer); the web's iMessage
group says the same.

Structurally it can't impersonate anyone: it only ever sends to the one linked handle, and a
handle is linked only by sending the code from it. **Seen as the person's own:** in partner mode,
a sent message in the linked thread that Ducter didn't send means someone is typing from this
Apple ID, so it is the person's own. The bridge stops sending at once and Settings says **这台 Mac 的「信息」好像登录的是你自己的 Apple ID…**, with one button, **改成给自己发信息 / Switch to Message yourself**.

## Pairing and strangers

**连上 / Connect** makes a six-digit code (10 minutes, one use; **换一个 / New code**), made by the
Mac app, since the bridge is the Mac's. The first **received** message carrying the code links its
sender; a code the person sends to someone else links no one. Anyone else gets **silence**: no
answer, nothing relayed, nothing stored; Settings says **有人在 iMessage 找过{name}。它没有回，也没有留下那些消息。** at most once a day. Group chats are never read. **断开 / Disconnect** unlinks at once.

## Permissions and status

Settings shows both permissions as rows, each with what it allows, and at its right edge
**已允许 / Allowed** (done ink) or **允许 / Allow** (D283: one button; it asks macOS where an app
can, and opens the pane where it can't):

- **完全磁盘访问权限 / Full Disk Access**: "让 Ducter 读到发给{name}的 iMessage。它只看连上以后的新
  消息，不看以前的，也不看别人的对话。" **允许** opens
  `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles` (no app can ask).
- **自动化 › 信息 / Automation › Messages**: "让 Ducter 用「信息」回你。它只回给连上的那个号码，不给任何
  别人发。" **允许** asks Messages once (macOS shows its own question then), and opens
  `…?Privacy_Automation` when macOS no longer asks.

The status line, one of: **开着，连着 {handle}**; **还差一个权限，给了就好。**; **这台 Mac 的「信息」还没登录
iMessage。**; **这台 Mac 还没用过「信息」。**; **iMessage 暂时连不上，它会自己再试。** On the wire
(`channel_status`): `on`, `needs_permission`, `not_signed_in`, `error`, `off`.

## Reliability

- **Restarts.** The link, the cursor and the last Log seq it acted on live in the app's
  `~/Library/Application Support/Ducter/imessage.json`. After a restart it reads from the cursor but
  never acts on a message older than 10 minutes (Apple can flush a backlog after a push recovery),
  and never sends for a Log event older than 2 minutes (the app replays history on launch). Rows
  are deduped by guid; the home dedupes by `clientId` (`imessage:<guid>`).
- **The home away.** When the words can't reach the home, the cursor stays before them and they go
  when it is back (within the 10 minutes).
- **Errors back off** 2 s, 4 s … 60 s; a send is tried three times; a permission lost later says
  itself on Settings and to the home.
- **Messages or macOS restarted:** nothing to reconnect; the next read or send just works, or says
  why not.

## Built and not

D323 (2026-11-17, fakes only): the steps and the check, the comparison, the receiving address and the
own-Apple-ID code, the background user, which Mac carries it (Mac, core, web). Not seen live: what
Messages' `description` returns, `destination_caller_id` on macOS 26, a new Apple ID's first iMessage
sign-in on a Mac.

Built 2026-11-16 with fakes (a fixture `chat.db` in a temp directory, a fake sender): the package
`apps/desktop/internal/imessage`, Settings › Chat apps › iMessage (D283)
(`apps/desktop/internal/views/imessage.go`), the protocol's `via` and `channel_status`, and the
home's push staying quiet. **Not seen live:** no real Messages database was read and no iMessage was
sent. Unverified: whether the self thread really holds both a sent and a received copy; whether Full
Disk Access passes to the spawned `sqlite3` on macOS 26 when the app is a login item; the
AppleScript `buddy` path on macOS 26. Later (`todo.md`): pictures out, a Chat apps tab when D276
brings one, the small **来自 iMessage / via iMessage** mark under a message on the Mac.
