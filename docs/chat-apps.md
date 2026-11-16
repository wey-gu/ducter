---
title: Chat apps
description: Talk to your partner from Telegram or Slack, in the same conversation, through a bot of your own that nobody else can use.
order: 7.5
---

# Chat apps

You can talk to your partner from **Telegram** and **Slack** too. It isn't a second chat: it's
the same conversation you have in the Ducter app, seen from another window. Ask from Telegram on
the bus, and the answer comes back in Telegram; the Ducter app shows all of it as well.

Your partner speaks there as itself, through a bot of your own: your own Telegram bot, your own
Slack app. It never writes as you, and nobody else can talk to it.

> **Early preview.** Chat apps are new. They were tested carefully, but not yet with every
> kind of Telegram or Slack account; tell us if something looks off.

## Connect Telegram

1. In Ducter, open **Settings › Chat apps**.
2. In Telegram, find **@BotFather**, send `/newbot`, and give your bot a name (your partner's
   name is a good one). BotFather answers with a long key after "Use this token".
3. Paste that key under **Telegram** and press **Connect**.
4. Press **Link my account**, then **Open in Telegram**, and press **Start** there. You can
   also send the bot `/start` and the code Settings shows.

Your partner says **Linked. Talk to me here any time.** That's it.

## Connect Slack

Slack needs an app of your own in your workspace. Ducter gives you everything to paste:

1. Open **Settings › Chat apps** and look under **Slack**.
2. Open [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App › From a
   manifest**, and pick your workspace.
3. Copy the text Settings shows (**Copy this**), paste it, create the app, and press **Install
   to Workspace**. If your workspace asks an admin to approve apps, it waits for them.
4. In the app's **Basic Information**, make an **App-Level Token** with `connections:write`. In
   **OAuth & Permissions**, copy the **Bot User OAuth Token** (it starts with `xoxb-`).
5. Paste both under **Slack** and press **Connect**.
6. Press **Link my account**, then send the code to your partner in a Slack direct message.

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

## Who else can see it

- **Telegram keeps a copy of your chats** on its servers.
- **In a work Slack, the workspace's admins may be able to see what's said** in your direct
  messages with the app.
- Your bot's key stays on your own computer, in a file only your account can read. It is never
  shown again.

## Unlink or disconnect

In **Settings › Chat apps**, **Unlink** forgets your account (the bot stays; link again any
time). **Disconnect** forgets the bot's key too. If anyone else writes to your bot, it doesn't
answer them; Settings tells you once that someone tried.

## Coming soon

- **iMessage**, on a Mac, through a separate Apple ID for your partner.
- Slack's own assistant view (the status line and suggested prompts) where your plan has it.
- A small "via Telegram" mark under your message in the Ducter app.
