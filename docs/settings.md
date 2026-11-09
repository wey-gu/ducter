---
title: Your partner and settings
description: Rename your partner, choose what it thinks with and who does the tasks, how it talks, when it may come to you, what it remembers, and the app's own settings.
order: 4
---

# Your partner and settings

There are two places to change things. **Partner** is about the one you talk to: its name, how
it talks, when it comes to you and what it remembers. **Settings** is about the app itself. What
your devices can do lives in **Devices**.

## Partner

Open it with **⌘4**, from **View › Partner**, or by clicking your partner's face and name at the
top of the conversation. On a phone, tap your partner at the top of the conversation.

- **What it thinks with.** Beside your partner is a round socket labelled **Thinks with**. It
  holds the AI agent your partner itself runs on, Claude Code with Opus at first. Pick **Opus ·
  Smartest** or **Sonnet · Faster replies**. Switching keeps its name, what it remembers and
  your conversation; the new choice takes over from your next message. **Switch** lets you
  drop another AI agent signed in on this Mac into the socket. Today your partner can think
  with Claude Code; Codex is coming soon. Other AI agents do tasks only.
- **Who does the tasks.** Under the socket is a tray of the AI agents on this Mac, each with a
  ring showing how much of its limit is left. For each task your partner picks one: the best fit
  with the most limit left. Click an AI agent to see its limit, how many devices share it, when
  it comes back, and **Use it for tasks** (on unless you turn it off). One limit is shared by
  your partner's own thinking and the tasks, so 10% of your partner's own account is kept for
  it: tasks can't use that part, and it can always answer you. An AI agent you pay per use says
  **Pay per use**.
- **Your rules.** Say a rule in the conversation, like "backend work on Codex", and your
  partner repeats it back and keeps it. Your rules are listed here; **Remove** drops one. If you
  move the same kind of task to another AI agent twice, your partner asks once whether to make
  it a rule.
- **Its name.** Click **Rename**, type a new name, and press Return. The new name shows at once
  in every window and on your phone.
- **How it talks.** Choose **Follow me** to have it answer in whatever language you write in.
  Choose **中文** or **English** to have it always answer in that language.
- **When it comes to you.**
  - **Notifications** turns the nudges on this Mac and your connected phones on or off. With
    them off, anything that needs you waits in the conversation and in On hand.
  - **Quiet hours** holds notifications between two times, 23:00 to 08:00 at first. When the
    quiet hours end, you hear about everything that came up during them.
  - **If you don't answer** sets how long a decision waits before your partner goes with its
    suggested default: 10 minutes, 30 minutes, 1 hour or 2 hours. This applies only to things
    that can be undone. Anything that can't be undone always waits for you.
- **What it remembers.** With [Nowledge Mem](https://mem.nowledge.co) connected, your partner
  remembers what you've told it across conversations. **Noted lately** lists what it wrote
  down. **Forget** removes a line: Nowledge Mem forgets it when it can, and otherwise the line
  is only hidden here (the app tells you which). To stop it from recalling or noting anything,
  turn off **Remember things**.
- **Accounts it can read.** Your partner can read your Gmail, calendar, Slack, GitHub and other
  accounts when you ask. If you use OOMOL's `oo` and are signed in, it's one tap on **Use these
  accounts**; otherwise **Add one** takes an address and a key. Reading just happens; sending or
  changing anything waits for your Go. All of it is in [Accounts your partner can read](accounts.md).
- **On its own, or asks you first.** This list shows what your partner does without asking
  (changing code in its own copy, reading your projects, browsing in its own browser) and what it
  always asks you about first (anything that reaches other people, anything that can't be taken
  back, signing in, paying). You can't change this list yet.

### Who's doing a task

Every task says who is doing it. In the conversation its line ends with the AI agent's name,
and the reason when it isn't your partner's plain pick ("Claude Code's limit is low", or your
rule). Open the task and look under **Details › Who's doing it**: one sentence says who and
why. **Switch who does it** lists who else could do it, with why and how much limit each has
left; the ones that can't say why. **Continue on …** moves the task: a task that is still
working carries on there from its saved progress; it doesn't start over.

On a phone, the same is in the Settings sheet (tap your partner) and in a task's Details.

## Settings

Open it with **⌘,** or **Ducter › Settings…**.

- **Look:** Pebble, the warm paper and clay look. More looks will appear here once they work.
- **Language:** the language of the app's own words. **Follow the system** uses your Mac's
  language. This is separate from how your partner talks.
- **Details in the conversation:** **Folded** (the default) keeps the conversation to what your
  partner says, with each message's checks, changes and task one click away under **Details**.
  **Shown** opens them all, lists what is still being worked on, and shows every question that
  waits for you. On a phone, the same choice is in the Settings sheet.
- **When you close the window:** shows whether Ducter keeps working in the background and
  starts again when you log in. **Stop Ducter** stops everything until you wake it.
- **Updates:** checks for a new version, restarts into one that's ready, or installs it when
  you quit.
- **Data and logs:** opens Ducter's data folder or its log. **Run checks** runs the same
  check-up as the first run, with a plain line for each tool.
- **About:** the version, the docs, the licenses, and **Report a problem…**.
- **Remove Ducter** is the quiet button at the very bottom. It shows exactly what goes and what
  stays before anything is removed. See [Install](install.md).

## The menu bar

- **Ducter:** About, the update line, Settings…, Stop Ducter, Quit.
- **View:** Conversation ⌘1, On hand ⌘2, Devices ⌘3, Partner ⌘4.
- **Help:** Ducter docs, Report a problem….

With the window closed, your partner also sits in the macOS menu bar. Click it to see what needs
you and answer each question with **Go** or **Hold**, or choose **Open Ducter**.

## Devices: AI accounts and connecting a phone

In **Devices**, the AI accounts under this Mac (Claude Code, Codex; pi and DeepSeek Harness when
they're set up) open when you click them.
From there you can install the tool, sign in with its own sign-in in your browser, or sign out.
Ducter never sees your password. To add your phone or another computer, click **Connect a phone
or computer**. The app shows a one-time code for it (see [Your phone](phone.md)).
