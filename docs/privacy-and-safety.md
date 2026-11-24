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
  draft PR**. Nothing lands in your main branch until you choose. A task may push its own
  branch or open a pull request itself when the work calls for it; when it does, the result
  says so under **Sent out**.
- **It never works in your own checkout.** Each coding task works in its own copy of the project,
  on its own branch (`ducter/…`). Your checkout changes only when you choose **Merge into main**.
- **It never works in Ducter's own data.** The hidden folder where Ducter keeps its history and
  settings (`~/.ducter`) is never a task's place, on any computer: a task that needs no folder of
  its own gets an empty one of its own instead.
- **A folder it changes can be put back.** A task in an ordinary folder (Documents, Downloads,
  a folder of invoices) changes the files right there, so you see the result at once. Before
  it changes anything, Ducter quietly keeps a copy of the folder (on a Mac this takes almost no
  space). The task's **Changes** say what it did, and **Undo all changes** puts the folder back
  exactly as it was, deletions included, until 7 days after the task finished. **Keep the
  changes** lets the copy go sooner. If you changed the folder yourself after the task finished,
  Undo tells you what would be lost before it does anything. If a folder can't be copied cheaply
  (it syncs with iCloud Drive, Dropbox, Google Drive or OneDrive, it's on a network or external
  drive, or it's very large), the task asks you before it changes anything there, because those
  changes couldn't be undone.

  What this covers, honestly: everything inside that folder. A task is told to stay inside it
  and to ask before deleting more than 10 files at once. With Codex, it can't write anywhere
  else. With Claude Code that's asked of it, not enforced, and a change outside the folder isn't
  covered by the copy.
- **It never sees your passwords or card numbers.** When a website needs a login, you type it
  yourself, in your Chrome or in Ducter's browser window; the AI never sees it. If you saved a
  sign-in or a card in [Passwords & cards](passwords-and-cards.md), Ducter fills it into its own browser without the
  AI seeing it, only on that sign-in's own site, and every payment waits for you to tap **Pay** on
  a card that names the shop, the amount and your card's last four. Submitting forms and posting
  are left to you.
- **On a server, it can't look while you sign in.** Ducter's browser on a server shows you its
  page live when a task asks you to sign in. While that view is open, the task's browser tools
  refuse to read anything (no text, no picture), and nothing you type or see there goes to the
  AI or into your conversation. Afterwards the task reads pages as the signed-in you, but never
  the contents of password fields, and it can't type into them. What it can see: the pages it
  opens, their text and links, and pictures of them it saves as evidence.
- **Your sign-ins stay on the computer they're on.** When Ducter runs on a server and a task needs
  a site you're signed in to on your Mac, Ducter asks you once for that site, then the task runs
  on your Mac rather than asking for your password on the server. It never uses your own Chrome
  for a site you haven't said yes to, and you can take a site back in **Signed-in sites**. The server gets back what the pages say, never the cookies that keep you
  signed in or the browser's saved data: your Mac holds them back, whatever the server asks.
- **It never types into a page you had open.** A web task in your own Chrome opens a window or
  tab of its own, checks that it's the one in front before typing, and closes it when it's done.
  It's signed in as you there, so it asks before anything that would act for you.
- **In your Mac's apps, it asks before it acts for you, and stays out of your keys and money.**
  With **Use the computer** on, a task in an app asks before anything that sends, pays or
  deletes, never reads or types a password, and can't see or open password managers, Keychain,
  banking and payment apps or System Settings. **Stop** on the task or the Mac's card ends it at
  once. See [Tasks in your Mac's apps](devices.md#tasks-in-your-macs-apps).
- **Your partner doesn't read web pages itself.** One quick fact, like tomorrow's weather or the
  latest version of an app, is looked up in a few seconds by a helper that has nothing but a
  browser's search: none of your memory, accounts or files. Only a short answer and where it came
  from come back. Anything bigger (reading a page, comparing, anything you're signed in to) is a
  task, and only what the task reports comes back. A page never talks to the one that holds your
  conversation, your memory and your accounts.
- **It never hides what went out.** When a result sent something out, a line marked ↗ says
  what, right under the message (never folded away). An opened task lists it again under
  **Sent out**, below what the task did, in plain words ("Opened PR #12", "Pushed to its
  branch"); hold the pointer over a line to see the command behind it.
- **It never shows a key.** If a key, token or password turns up in what you asked a task or in
  what it ran or printed, every screen shows only its first few letters, then dots, with **A key
  is hidden** beside it. The task itself still gets the key, so it can do the work; the key stays
  on the computer Ducter runs on.
- **It never decides silently for you.** When something is your call, it asks, with a
  suggested default you can take, hold, or change. If it goes with the default, it says so:
  **No answer, so I went ahead**. Anything that can't be undone waits: **I'll do it once you
  say so.**
- **It doesn't read your projects to greet you.** The first suggestions come from folder
  names only. Nothing inside is opened.

## What runs where

- **Everything runs on your own computers:** your Mac, and any server you set up. There's no
  account to sign up for. The one exception is the **notification relay** for the iPhone app:
  Apple only takes the app's notifications from its publisher, so Nowledge runs a small relay
  that passes them on. Each notification is encrypted for your phone before it leaves your Ducter;
  the relay and Apple only see **Ducter needs you**, when it was sent and roughly how big it was.
  The relay keeps no list of phones and stores nothing about what it passes on. Ducter in a
  browser, and its web notifications, never use it. More in [Your phone](phone.md#in-the-iphone-app).
- **Your conversation, tasks and settings** stay in `~/.ducter` on the computer Ducter runs on.
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

### A key you already have, on another of your computers

When a task on one of your computers needs a key you already have on another (say it's set in
your Mac's terminal and the task runs on your server), Ducter doesn't ask you to set it again by
hand. It shows one card: **Copy {key} from {Mac} to {server}? Only for Ducter's tasks there. Never
shown, never in the conversation.** Only your own tap on **Copy** copies it. It never happens by
itself, and nothing a task or a web page says can make it happen.

- The key goes from the Ducter on one computer to the Ducter on the other, locked for that one
  computer before it leaves, so nothing in between can read it: not your network, and not the
  computer your Ducter's home runs on when it passes it along.
- On the computer it goes to, it's kept locked by Ducter (in the Mac's keychain, or a file only
  your account can read on a server) and given only to the Ducter tasks there that need it. Your
  own terminal settings there are left as they are.
- What's recorded is only that the key with that name was copied, from where to where, on your
  word. The key itself is never shown, not even to you, and never reaches the conversation.
- Each computer's card in **Devices** lists **Keys Ducter keeps** there, by name, and
  **Remove** forgets one there at once.
- The limit, said plainly: a task that uses the key sees what its own commands print, as with any
  key you give a task.

Before a result that changed code or files, or something a task would send for you, reaches you,
another AI agent you're signed in to on the same computer reads it once: what you asked, what the
task says it did, and what it changed. It reads on that agent's smallest model, with no tools; what
it reads goes to that agent's provider as any of your tasks would, and nowhere else. At most 40 such
looks a day.

Tasks use your plan's limits like any other session would. Your agent's own settings, skills and
tools apply to tasks too, so a Ducter task in your project behaves the way your own session
there does, including your Nowledge Mem plugin (below).

## Memory, with Nowledge Mem

Memory is optional. Without it, Ducter works fine: your partner remembers your conversation on
its own, and tasks run the same. Ducter never asks you to get Nowledge Mem; it is mentioned in one
place, Settings › Memory. Nowledge Mem is free to download and runs on your own
computer.

If you use [Nowledge Mem](https://mem.nowledge.co), your partner starts out knowing who you are
and what you're working on, from the same memory the AI tools you use elsewhere share. When it saves
something worth keeping, one quiet line shows under its reply: **Noted “<what it saved>”**, with
**Don't keep this** until you say something next; after that it folds into the reply's **Details**,
with **Forget**. When something it remembered changed an answer, one quiet line under the answer says
where from, such as **Remembered from what you said on Nov 10**; tap it to see the memory. **Settings ›
Memory** shows **What I know about you** and what it noted this week. It saves only what you said
yourself, in your words; it never keeps something it guessed from how you react.
It also reads, never writes, the day's focus your Nowledge Mem keeps for you, so it knows what
you're on when it suggests what to do first or picks the morning's few things; it never repeats it
back. Ask it how you did something in another AI tool ("how did I fix this in Codex last week?")
and it looks through those past conversations Nowledge Mem keeps, a few lines at a time.
Its tasks know you too. A task runs with your Nowledge Mem plugin, under your partner's name in
Nowledge Mem, so it starts with what you and your partner know and its work is kept there the
way your own sessions are. On a computer where the plugin isn't installed for that AI agent, your
partner gives the task the few things it remembers that fit the work, and the task can look up
more. A task never saves memories itself; it can suggest something worth keeping, and your
partner decides. Tasks in a browser get none of it, so a web page can't ask for it. Turn off
**Remember things** and tasks get no memory: the plugin is switched off inside them too.

**Is it working?** **Settings › Memory** says how your Nowledge Mem is doing, as Nowledge Mem
itself sees it: **Connected and working** when all is well. If something is wrong it says the one
thing, with the one button that fixes it: **Sign in again** when its sign-in stopped working,
**Check again** when it can't be reached, **Update** when its command line is too old to say, and
**Connect** when Claude Code or Codex on this computer isn't connected to it yet. Ducter only reads
this; it never shows your key.

**Putting the plugin in.** Each AI agent's line on your computer's card says whether it has the
Nowledge Mem plugin. For Claude Code and Codex, **Install** runs Nowledge Mem's own command and
takes seconds; start the agent again to use it. If that can't do it, and for other agents, Ducter
starts one task there that follows Nowledge Mem's own setup guide.

Every memory records that it came from Ducter, which partner wrote it (its own name in
Nowledge Mem, the same for its tasks) and which conversation it came from, so you can always
trace it back. If you already chose an AI identity for Nowledge Mem on this computer, Ducter
uses that one and never changes it. If you edit a memory in Nowledge Mem, your edit wins.

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
  computer Ducter runs on can talk to it without a code, the same way the app and the
  `ducter` command do. On your own Mac that adds nothing: your tasks already run as you.
  **On a server shared with other people, don't run Ducter yet**: they could reach it too. A fix
  that makes every program show a key is planned.

Found a security problem? Please report it privately, as described in
[SECURITY.md](../SECURITY.md).
