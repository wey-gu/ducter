---
title: Privacy and safety
description: What Ducter never does by itself, what runs where, how it uses your AI plans, memory with Nowledge Mem, and who can reach your Ducter.
order: 8
---

# Privacy and safety

Ducter is meant to be a partner you can leave alone with real work. That only works if you know
exactly what it will and won't do. This page lists it.

## What Ducter never does by itself

- **It never merges your code.** A finished coding task offers **Merge into main** or **Open
  draft PR**. Nothing lands until you choose.
- **It never works in your own checkout.** Each coding task works in its own copy of the project,
  on its own branch (`ducter/…`). Your checkout changes only when you choose **Merge into main**.
- **It never types your passwords.** When a website needs a login, you type it yourself, in
  your Chrome or in Ducter's browser window; the AI never sees it. Submitting forms, posting and
  paying are always left to you.
- **It never types into a page you had open.** A web task in your own Chrome opens a window or
  tab of its own, checks that it's the one in front before typing, and closes it when it's done.
  It's signed in as you there, so it asks before anything that would act for you.
- **It never hides what went out.** When a result sent something out, a line marked ↗ says
  what, right under the message (never folded away). An opened task's **Details** always lists
  **Sent out**, often **Nothing**.
- **It never decides silently for you.** When something is your call, it asks, with a
  suggested default you can take, hold, or change. If it goes with the default, it says so:
  **No answer, so I went ahead**. Anything that can't be undone waits: **I'll do it once you
  say so.**
- **It doesn't read your projects to greet you.** The first suggestions come from folder
  names only. Nothing inside is opened.

## What runs where

- **Everything runs on your own computers:** your Mac, and any server you set up. Ducter has no
  service of its own in the cloud, and no account to sign up for.
- **Your conversation, tasks and settings** stay in `~/.ducter` on the computer Ducter lives on.
  The folder and its files can only be read by your own user account.
- **What does leave your computer** is what any AI agent sends: your messages and the work
  in a task go to the company behind your agent (Anthropic for Claude Code, OpenAI for Codex),
  under your own account and their terms. If you connect Nowledge Mem, memories go there too
  (below).

## Your AI plans stay yours

Ducter works through each AI agent's own official app, signed in with your own account. It
doesn't proxy your login, share it, or pretend to be anything else. That's also why Ducter is
something you run yourself rather than a hosted service.

If you give Ducter an API key or a sign-in token, it's kept in a private file in `~/.ducter` and
handed only to the AI agent that signs in with it, never to the others or to every task. A task
doesn't get the keys or tokens from the environment Ducter was started in, either.

Tasks use your plan's limits like any other session would. Your agent's own settings, skills and
tools apply to tasks too, so a Ducter task in your project behaves the way your own session
there does.

## Memory, with Nowledge Mem

Memory is optional. Without it, Ducter works fine and remembers your conversation.

If you use [Nowledge Mem](https://mem.nowledge.co), your partner starts out knowing who you are
and what you're working on, from the same memory your other AI tools share. When it saves
something worth keeping, its reply's **Details** shows one quiet line: **Noted · <what it
saved>**, with **Forget**. **Partner › What it remembers** lists all of them.
Every memory records that it came from Ducter and which conversation it came from, so you can
always trace it back. If you edit a memory in Nowledge Mem, your edit wins.

## Tasks run as you

Tasks don't stop to ask before every command; that would make Ducter one more thing to babysit.
Instead, a task on your Mac runs with the same access your own AI agent session would have:
it can do what you can do there. That's the trade, and it's why merging and sending things out
wait for you.

Running Ducter's tasks on a separate server keeps them away from your personal files.
Sandboxed places that can't touch your files at all are coming later.

## Who can reach your Ducter

- **Other devices need a code.** Your phone or another computer connects with a one-time code
  that works once, for 10 minutes. Too many wrong codes, and Ducter stops accepting them for a
  while. `ducter devices` shows every connected device; `ducter devices disconnect <name>`
  removes one immediately.
- **A server is closed by default.** Ducter on a server only listens on the server itself. It
  becomes reachable only when you set up your own domain (with HTTPS) or an SSH tunnel.
- **Programs on the same computer are trusted.** Anything running under any account on the
  computer Ducter lives on can talk to it without a code, the same way the app and the
  `ducter` command do. On your own Mac that adds nothing: your tasks already run as you.
  **On a server shared with other people, don't run Ducter yet**: they could reach it too. A fix
  that makes every program show a key is planned.

Found a security problem? Please report it privately, as described in
[SECURITY.md](../SECURITY.md).
