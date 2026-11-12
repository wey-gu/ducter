---
title: Your partner and settings
description: Rename your partner, choose what it thinks with and who does the tasks, how it talks, when it may come to you, what it remembers, and the app's own settings, all in one Settings.
order: 4
---

# Your partner and settings

Everything you can change is in one place, **Settings**. Open it with **⌘,** or **Ducter ›
Settings…**. **⌘4**, **View › Partner** and clicking your partner's face and name at the top of
the conversation open it on **Partner**.

On the left is a row of tabs; the one you pick shows on the right:

| Tab | What's in it |
|---|---|
| **Partner** | Its name, what it thinks with, who does the tasks, how it talks, what it remembers, and what it does on its own or asks you first |
| **Notifications** | When it comes to you, quiet hours, and how long it waits if you don't answer |
| **Accounts** | The mail, calendars and other accounts it can read |
| **Look and sound** | The look, the window's language, Details in the conversation, the intro's sound |
| **Where it runs** | Which computer Ducter lives on, stopping it, data and logs, and Remove Ducter |
| **Updates and about** | The version, updates, help links and credits |

On a phone, tap your partner at the top of the conversation: Settings opens as a list of the
same sections (**Partner**, **Notifications**, **Accounts**, **This phone**), and tapping one opens
it.

## Partner

At the top is your partner, its name and one line: where it lives and what it thinks with
("Lives on hel · thinks with Codex").

- **Its name.** Click **Rename**, type a new name, and press Return. The new name shows at once
  in every window and on your phone.
- **AI agents on …** shows the AI agents on the computer Ducter lives on (this Mac, or a server
  like "hel"), each with how much of its limit is left.
- **What it thinks with.** The AI agent your partner itself runs on, in a round clay socket:
  Claude Code, Codex, DeepSeek Harness or pi, whichever are signed in there. When you haven't
  picked one and Claude Code isn't signed in, your partner uses Codex if it is (**Picked for you:
  only Codex is signed in**), else DeepSeek Harness, else pi (**Picked for you: Claude Code isn't
  signed in**). With Claude Code, pick **Opus · Smartest** or **Sonnet · Faster replies**; with
  DeepSeek Harness, or pi signed in to DeepSeek, pick DeepSeek's **V4 Pro** (smartest) or
  **Flash** (faster replies). **Switch** lets you drop another AI agent that is signed in there
  into the socket. Switching keeps its name, what it remembers and your conversation; the new
  choice takes over from your next message. On every one of them your partner only reads and
  decides: it can't change your files or run commands itself; that is what its tasks do.
  DeepSeek Harness and pi are paid per use with your own key.
- **Who does the tasks.** For each task your partner picks the best fit. Click an AI agent on
  the tray to see where it's signed in, how many devices share it, and **Use it for tasks** (on
  unless you turn it off). An AI agent you pay per use says **Pay per use**.
- **Your rules.** Say a rule in the conversation, like "backend work on Codex", and your
  partner repeats it back and keeps it. Your rules are listed here; **Remove** drops one. If you
  move the same kind of task to another AI agent twice, your partner asks once whether to make
  it a rule.
- **How it talks.** **Follow me** answers in whatever language you write in; **中文** or
  **English** always answers in that language.
- **What it remembers.** With [Nowledge Mem](https://mem.nowledge.co) connected, your partner
  remembers what you've told it across conversations, kept in Nowledge Mem under your
  partner's name. Without it, your partner still remembers your conversation on its own, and the
  row says what Nowledge Mem would add (it is free to download and runs on your own computer),
  with **About Nowledge Mem**. That row is the only place Ducter mentions it. **Noted lately** lists what it wrote down; **Forget** removes a line (Nowledge Mem
  forgets it when it can, otherwise the line is only hidden here, and the app tells you which).
  Its tasks use it too, through your Nowledge Mem plugin. Turn off **Remember things** to stop it from recalling
  or noting anything, in the conversation and in its tasks; the Nowledge Mem lines on your
  devices' cards go away too.
- **On its own, or asks you first.** The rules Ducter keeps, in two lists. On its own: changing
  files in its own copy (your originals stay as they are), reading your projects and files,
  looking things up and reading web pages (in your own Chrome when it can), and going with the
  default on things that can be undone if you don't answer. Asks you first: anything that
  reaches other people, anything that can't be taken back (like merging into your main line),
  signing in to a site, and paying. You can't change these lists.

### Who's doing a task

Every task says who is doing it. In the conversation its line ends with the AI agent's name,
and the reason when it isn't your partner's plain pick ("Claude Code's limit is low", or your
rule). Open the task and look under **Details › Who's doing it**: one sentence says who and
why. **Switch who does it** lists who else could do it, with why and how much limit each has
left; the ones that can't say why. **Continue on …** moves the task: a task that is still
working carries on there from its saved progress; it doesn't start over.

## Notifications

- **Notifications** turns the nudges on this Mac and your connected phones on or off. With them
  off, anything that needs you waits in the conversation and in On hand.
- **Quiet hours** holds notifications between two times, 23:00 to 08:00 at first. When the
  quiet hours end, you hear about everything that came up during them.
- **If you don't answer** sets how long a decision waits before your partner goes with its
  suggested default: 10 minutes, 30 minutes, 1 hour or 2 hours. This applies only to things
  that can be undone. Anything that can't be undone always waits for you.
- **When it notices something** (once you have accounts): how your partner tells you what it
  noticed by itself: **Only urgent**, **Up to 3 a day**, **Whenever useful** or **Only when I
  ask**. The same row sits on Accounts; see [When it notices something](accounts.md#when-it-notices-something).
  Under it, **What it looked at today** shows, in numbers only, what it looked at, what it read
  closely and why it said nothing about the rest (not urgent, waiting for the morning message,
  not worth interrupting you for, today's three already said). If it can't read your mail
  closely, for example because the AI agent it thinks with isn't installed, a line says so
  there, and your partner tells you once in the conversation. If it read a fair amount of mail
  closely and noted nothing all day, it says so there too (*Something may be wrong on its side*),
  rather than staying silent.

On a phone, this page also turns on notifications for that phone and sends a test.

## Accounts

Your partner can read your Gmail, calendar, Slack, GitHub and other accounts when you ask. If
you use OOMOL's `oo` and are signed in, it's one tap on **Use these accounts**; otherwise **Add
one** takes an address and a key. Each place your accounts come from has its own card, with a
square for each app it can read; tap one for what it reads and to stop it watching or reading.
Reading just happens; sending or changing anything waits for your Go. All of it is in
[Accounts your partner can read](accounts.md). The AI accounts
(Claude Code, Codex) live on **Devices**; the last row goes there.

## Look and sound

At the top is a small preview of the window as it looks now. Your partner smiles when you pick
something.

- **Look:** Pebble, the warm paper and clay look. More looks will appear here once they work.
- **Language:** the language of this window's own words. **Follow the system** uses your Mac's
  language. This is separate from how your partner talks.
- **Details in the conversation:** **Folded** (the default) keeps the conversation to what your
  partner says, with each message's checks, changes and task one click away under **Details**.
  **Shown** opens them all, lists what is still being worked on, and shows every question that
  waits for you. On a phone, the same choice is under **This phone**.
- **The intro's sound:** the sound of the intro when Ducter opens for the first time. **Play**
  lets you hear it. **Replay the intro** shows the intro again.

## Where it runs

- **Where it lives:** this Mac, or the computer the app is connected to (like a server), and in
  words what happens when you close the window. On this Mac, **Stop** stops everything until
  you wake it.
- **Connect to a Ducter on another computer** connects with a one-time pairing code; **Use the
  Ducter on this Mac again** goes back.
- **Data and logs:** opens Ducter's data folder or its log. **Run checks** runs the same
  check-up as the first run, with a plain line for each tool.
- **Your devices and AI accounts** opens Devices.
- **Remove Ducter** is the quiet button at the end. It shows exactly what goes and what stays
  before anything is removed. See [Install](install.md).

## Updates and about

The version, then **Updates**: whether this version is the newest, **Check now**, and **Update
automatically when quitting**. When a new version is ready, **Restart Now** installs it: the window says it's putting the new
version in, and Ducter opens again on it. Under
**Help** are the docs, **Report a problem…** and the licenses; **Credits** opens the recordings
behind the intro's sound.

## The menu bar

- **Ducter:** About, the update line, Settings…, Stop Ducter, Quit.
- **View:** Conversation ⌘1, On hand ⌘2, Devices ⌘3, Partner ⌘4 (Settings, on Partner).
- **Help:** Ducter docs, Report a problem….

With the window closed, your partner also sits in the macOS menu bar. Click it to see what needs
you and answer each question with **Go** or **Hold**, or choose **Open Ducter**.

## Devices: AI accounts and connecting a phone

In **Devices**, the AI accounts under this Mac (Claude Code, Codex; pi and DeepSeek Harness when
they're set up) open when you click them.
From there you can install the AI agent, sign in with its own sign-in in your browser, or sign out.
Ducter never sees your password. To add your phone or another computer, click **Connect a phone
or computer**. The app shows a one-time code for it (see [Your phone](phone.md)).
