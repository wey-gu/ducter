---
title: Chat apps
description: Talk to your partner from Telegram, Slack or WeChat, in the same conversation, through a contact of your own that nobody else can use.
order: 7.5
---

# Chat apps

You can talk to your partner from **Telegram**, **Slack** and **WeChat** too. It isn't a second chat: it's
the same conversation you have in the Ducter app, seen from another window. Ask from Telegram on
the bus, and the answer comes back in Telegram; the Ducter app shows all of it as well.

Your partner speaks there as itself, through a bot of your own: your own Telegram bot, your own
Slack app. It never writes as you, and nobody else can talk to it.

> **Early preview.** Chat apps are new. They were tested carefully, but not yet with every
> kind of Telegram or Slack account; tell us if something looks off.

## Connect Telegram

1. In Ducter, open **Settings › Chat apps** and press **Set up** on **Telegram**. It walks you through three
   steps.
2. In Telegram, open **BotFather** (**Open BotFather** takes you there) and send it `/newbot`.
3. Give your bot a name (your partner's name is a good one).
4. BotFather answers with a key. Paste it into **The bot's key** and press **Connect**.
5. Press **Get a code**, then **Open in Telegram**, and press **Start** there. You can
   also send the bot `/start` and the code Settings shows.

Your partner says **Linked. Talk to me here any time.** That's it.

## Connect Slack

Slack needs an app of your own in your workspace. Ducter gives you everything to paste, and the
steps below use the names Slack shows:

1. Open **Settings › Chat apps** and press **Set up** on **Slack**. It walks you through four steps.
2. Press **Copy the app manifest** (**View** shows what's in it).
3. **Open Slack** takes you to [api.slack.com/apps](https://api.slack.com/apps). Choose **Create New
   App**, then **From a manifest**, pick your workspace, paste the manifest in, and choose **Create**.
   - Want your partner's face in Slack's list too? **Download its face** in Settings, then on the
     page Slack opens next (**Basic Information**), upload it as the **App icon** under **Display
     Information**, at the bottom.
4. Open **OAuth & Permissions** on the left and choose **Install to** *your workspace*, then
   **Allow**. Copy the **Bot User OAuth Token** that appears (it starts with `xoxb-`) and paste it
   into its field.
   - That page also offers Token Rotation and PKCE. Leave both alone: Ducter doesn't need them, and
     Slack can't turn them off once they're on.
   - If your workspace needs an admin to approve apps, the button asks them instead, and you wait
     for their yes.
5. Go back to **Basic Information**. Under **App-Level Tokens**, choose **Generate Token and Scopes**,
   give it any name, choose **Add Scope** and pick `connections:write`, then **Generate**. Copy the
   token (it starts with `xapp-`), paste it into its field, and press **Connect**.
6. Press **Get a code**, then **Open in Slack**: it opens your messages with your partner. Send it
   the code. Can't find it? Search for your partner's name at the top of Slack, or pick it under
   **Apps** in the sidebar, then choose **Messages**.

Your partner says **Linked. Talk to me here any time.** In Slack each of your partners writes
under its own name and face.

### In a channel

Add your partner to a channel: type `/invite @` and its name there, or mention it and let Slack add it. Then
**@ it there** and it answers you in a thread under your message, so the channel stays quiet.
**Keep talking in that thread without the @:** everything you write there is for your partner.
Elsewhere in the channel it only hears you when you @ it. Everyone in that channel can read the
thread. It only answers you: if a teammate mentions it or writes in its thread, it doesn't reply,
and Settings tells you once when someone mentioned it. Questions that need your
decision, files and later results still come to your direct messages.

**@ it in a teammate's thread** and it reads that thread first: the first message and the
latest replies before yours. So "@Ducter hand this to my review loop" under a teammate's link to
a pull request is about that pull request, and you don't have to paste the link again. It reads
what your teammates wrote as background, never as something they asked it to do: only your own
words are a request, so a teammate's "merge it if it looks fine" is not acted on unless you say
so. Back in a thread it already answers in, it catches up on what teammates wrote there since.
If your Slack app can't read the thread yet (see below), your partner says it can't see the
earlier messages there and asks you for the link.

### Your Slack app needs an update

If you set Slack up before your partner could use its own face, answer in channels or hear your
replies in its threads, Settings says **Your Slack app needs an update**. Press **Copy the app manifest**, open your app at
[api.slack.com/apps](https://api.slack.com/apps), go to **App Manifest**, replace everything there
with what you copied, choose **Save Changes**, then **Reinstall** when Slack asks. Your partner
keeps working in the meantime; until then a reply in its thread only reaches it with an @, and it
can't read the thread you @ it in.

## Connect WeChat

WeChat works through **WeChat's own ClawBot**, a feature WeChat added for people's own AI: a
one-to-one contact in your WeChat that only you can talk to. Ducter never signs in to your WeChat
and never sends anything as you; your account stays exactly as it was.

1. Update WeChat on your phone. ClawBot is still reaching WeChat accounts, so yours may not have
   it yet.
2. Open **Settings › Chat apps**, press **Set up** on **WeChat**, then **Connect**. A QR code appears.
3. Open **Scan** in WeChat on your phone, scan the code, and confirm on the phone. If WeChat shows
   a number, type it into **The number WeChat shows**. Only have the one phone? Take a
   screenshot and pick it from your photos in Scan.
4. The ClawBot contact appears in WeChat. Say something to it.

The scan is the link: there is no code to send, and nobody else can add your ClawBot. If the QR
code runs out and scanning did nothing, your WeChat probably doesn't have ClawBot yet.

What WeChat allows is narrower than Telegram or Slack, and Ducter keeps to it:

- **It only answers you.** For about a day after you write, your partner can send you a few
  messages in WeChat. After that, or once those few are used, it tells you in the Ducter app
  instead, until you write in WeChat again. Settings shows whether it can reach you there now.
- **There are no buttons.** A question says which words answer it: reply **好** or **ok** to go
  ahead, **先等等** or **wait** to hold. Anything bigger says **Open in Ducter**, with your home's
  address when it has one.
- **No "Still on it" line**: WeChat can't change a sent message, so you just get the result.
- Pictures and files work both ways. A voice message comes in as WeChat's own transcript.
- **What you say goes through WeChat.** WeChat may change or stop ClawBot; if it asks you to scan
  again, Settings says so.

**Disconnect WeChat** in Settings takes the ClawBot connection away. Your conversation stays in
Ducter.

## iMessage

iMessage is the fourth group on the same page. It goes through a Mac, so you set it up in the
Ducter app on that Mac; see [Talk to your partner in iMessage](imessage.md).

## What goes where

- **What you say in a chat app is answered there.** Its first reply, any question about it, and
  the result all come back to the same chat. A job that takes a while shows one short line,
  like "Still on it: …", that updates itself instead of sending more messages.
- **What you start in the Ducter app stays in the app.** It isn't copied into Telegram or Slack.
- **When your partner comes to you on its own** (something it noticed, a result after you left,
  a question that came up later), it goes to the one place you last talked from, once. If it
  went to Telegram, your phone doesn't get a Ducter notification for it too.
- **Quiet hours count here too.** Anything your partner starts itself waits until they end. If
  you turned notifications off, it doesn't write to you on its own at all.

## Answering questions in a chat app

- A question you can change your mind about later comes with buttons: **Go** and **Hold**. You
  can also just type **ok** or **好**.
- Anything that reaches other people, your phone or computer, or merges work shows one sentence
  and **Open in Ducter**, so you decide with the whole picture.
- **Payments, sign-ins and keys never go to a chat app.** You only see "Something needs you in
  Ducter".
- Answered anywhere, the question updates everywhere: the chat message changes to what you said.

You can reply to one of your partner's messages (Telegram's Reply, or a Slack thread under its
message) and it answers about that one. Pictures and files work both ways. Something you forward
from someone else is read as their words, not yours: your partner never takes instructions from it.

## When you have more than one partner

Your bot (or WeChat's ClawBot) is your first partner's. Your other partners talk to you in the
same chat, each with its name in front: **小家：…** / **Home: …**.

- **To talk to one of them, start with its name:** "小家，周六提醒我交房租" or "Home, remind me
  about the rent on Saturday". "@Home …" works too.
- **Reply to one of its messages** (Telegram's Reply, or a Slack thread under it) and that
  partner answers.
- **Or just ask to switch:** "让小家来" or "can I talk to Home?" and your partner brings it in;
  it says hello right there, and the chat (in a Slack channel, that thread) is with it.
- **In a Slack channel thread,** the thread stays with the partner you last talked to there,
  until you start with another one's name.
- **Keep talking and it stays with you.** Once you've started with a partner, what you say next
  goes to it too, until you name someone else or leave the chat quiet for 15 minutes. Then it's
  your first partner again.
- **Every partner's questions and results come to the one place you last talked from**, each with
  its partner's name. Answer them there as usual.
- If you tell one partner something that's another's, it passes it on, and the other one answers
  you in the same chat.

The first time another partner writes to you in a chat app, it says how to talk to it directly.

## Who else can see it

- **Telegram keeps a copy of your chats** on its servers.
- **In a work Slack, the workspace's admins may be able to see what's said** in your direct
  messages with the app, and **everyone in a channel can read** what you and your partner say there.
- **In a Slack thread you @ your partner in,** it reads that thread's messages (up to the last 20
  before yours) for that answer; nothing else in the channel is read.
- Your bot's key stays on your own computer, in a file only your account can read. It is never
  shown again.

## Another account, or disconnect

In **Settings › Chat apps**, **Switch account** forgets your account (the bot stays; link
the same one or another any time). **Disconnect** forgets the bot's key too, so it asks first, in place, and your partner
confirms it under the card; your conversation stays in Ducter. To connect the same Telegram bot
again, send BotFather `/mybots`, pick your bot, then **API Token**, and paste that key. If anyone
else writes to your bot, it doesn't answer them; Settings tells you once that someone tried.

## Coming soon

- Slack's own assistant view (the status line and suggested prompts) where your plan has it.
- A small "via Telegram" mark under your message in the Ducter app.
- A Telegram bot or Slack app of its own for each of your partners.
