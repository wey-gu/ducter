---
title: Your partner and settings
description: Rename your partner, choose what it thinks with and who does the tasks, how it talks, when it may come to you, what it remembers, and the app's own settings, all in one Settings.
order: 4
---

# Your partner and settings

Everything you can change is in one place, **Settings**. Every screen has three small pictures
at the top right: **Devices** (a laptop and a phone), **On hand** (three things in hand) and
**Settings** (the gear), so you can get there from wherever you are; point at one to see its name.
**⌘,** and **Ducter › Settings…** open Settings too. **⌘4**, **View › Partner** and clicking your
partner's face or name at the top of the conversation open it on **Partner**. The line under the
name (like "Working on 2") opens **On hand** at what it says.

When there is something to update (Ducter on one of your computers, or an AI agent), an
**Update** button appears at the top right of every screen, with how many there are. It opens the
page where you update everything with one tap.

On the left is a row of tabs; the one you pick shows on the right:

| Tab | What's in it |
|---|---|
| **Partner** | Its name, what it thinks with, who does the tasks, a pasted API key, what happens when a limit runs out, how it talks, what your AI agents keep, and what it does on its own or asks you first |
| **Memory** | What it remembers about you, and Nowledge Mem: its version and updates |
| **Connected AI agents** | The AI agents you use elsewhere that can reach it (shown once Nowledge Mem is in) |
| **Notifications** | When it comes to you, quiet hours, and how long it waits if you don't answer |
| **Accounts** | The mail, calendars and other accounts it can read |
| **Look and sound** | The look, light or dark, the menu bar, the window's language, Details in the conversation, the intro's sound, voice |
| **Where it runs** | Which computer Ducter lives on, stopping it, data and logs, and Remove Ducter |
| **Updates and about** | The version, updates, help links and credits |

On a phone, tap the gear at the top right (or your partner's face or name at the top of the conversation):
Settings opens as a list of the same sections (**Partner**, **Memory**, **Notifications**, **Accounts**, **Your devices**, **This phone**), and tapping one opens
it. **This phone** holds what is this phone's own: **Light and dark** (**Follow the system**, **Light** or **Dark**),
the language of its screens, Details in the conversation, and reading replies aloud when you talk by voice.

## Partner

At the top is your partner, its name and one line: where it lives and what it thinks with
("Lives on hel, thinks with Codex").

- **Its name.** Click **Rename**, type a new name, and press Return. The new name shows at once
  in every window and on your phone.
- **What it thinks with.** The AI agent your partner itself runs on (Claude Code, Codex,
  DeepSeek Harness or pi, whichever are signed in there), with how much of its limit is left. When
  you haven't picked one, your partner uses Claude Code if it is signed in, else Codex, else
  DeepSeek Harness, else pi. With Claude Code, pick **Opus** or **Sonnet**; the line under the
  choice says what the one you picked is like (Opus thinks the deepest, Sonnet answers faster);
  with DeepSeek Harness, or pi signed in to DeepSeek, pick DeepSeek's **V4 Pro** (smartest) or
  **Flash** (faster replies). When another AI agent is signed in there, **Switch** lists it with
  **Use this**. Switching keeps its name, what it remembers and your conversation; the new choice
  takes over from your next message. On every one of them your partner only reads and decides: it
  can't change your files or run commands itself; that is what its tasks do.
- **Who does the tasks.** One line says how your partner picks: the best fit with the most limit
  left, or the one your rule names. Each signed-in AI agent is a row with its limit; with two or
  more, each has **Use it for tasks** (on unless you turn it off). One paid per use says so. With
  only one, the line says every task goes to it.
- **Your rules.** Say a rule in the conversation, like "backend work on Codex", and your
  partner repeats it back and keeps it. Your rules are listed under Who does the tasks;
  **Remove** drops one. If you move the same kind of task to another AI agent twice, your partner
  asks once whether to make it a rule. Any task can still be handed to another AI agent from the
  task itself.
- **Add another AI agent.** One place for adding one, with a line on what it gives you (with a
  second one, your partner picks per task, and when one runs out of limit the other carries on).
  Claude Code or Codex not signed in yet has **Install** or **Sign in**, which take you to
  **Devices**. **Paste an API key** needs no subscription: a key you pay for by use (DeepSeek,
  Kimi, Zhipu GLM, OpenAI, Anthropic, OpenRouter) works too. **Paste a key**, then **Check**: your
  partner says in one line whether it works, without spending anything. The key stays in Ducter on
  the computer it lives on and is never shown again. The same row is on that computer's card in
  **Devices**, where the AI agents there are shown with their limits.
- **When a limit runs out.** A task whose AI agent used up its limit waits and carries on by itself
  when the limit comes back. Turn on **Hand it to another AI agent right away** and another
  signed-in AI agent on the same computer carries on at once instead. The same switch is under a
  task's limit card. It shows once an AI agent does tasks; with only one, it says the task waits.
- **How it talks.** **Follow me** answers in whatever language you write in: Korean gets
  Korean, Spanish gets Spanish. A message with no language of its own, like "OK" or a thumbs-up,
  keeps the one you were using. Pick a language (简体中文, 繁體中文, English, 日本語, 한국어,
  Español and more under **Other language…**) and it always answers in that one. Ducter's own
  screens are in Chinese or English for now; a task's results are shown in the language you
  talk in.
- **What your AI agents keep.** **Read what they keep**: lists the conversations you had in Claude
  Code, Codex and pi on your home computer in Past tasks, and lets your partner find what to pick up
  when you ask it to look. Only names, folders, times and your first and last words are read, with
  keys hidden. Turn it off and nothing is read, and what was read is forgotten. If you chose
  **Don't show {agent} here** or **Leave this folder out**, each is listed here with **Show again**.
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
why. **Switch who does it** first shows the **Model** and **Effort** of the agent doing it: pick
another and the same agent carries on with this task from its next turn, remembering everything
said so far. Below, it lists who else could do it, with why and how much limit each has left;
the ones that can't say why. **Continue on …** moves the task to another agent, in the same task
and the same copy of your project: the new one starts from the brief, the saved progress, the
last report and what you said since; it doesn't start over. Switch back later and the first
agent picks up its own conversation again, told what happened meanwhile. The task's page marks
each switch with one thin line and its time, such as **Continued on Codex · 21:40**.

## Memory

What your partner remembers about you has its own section, **Memory**.

- At the top, **{name} remembers you**, how much it noted this week, and the **Remember things**
  switch. Its tasks use memory too, through your Nowledge Mem plugin. Off, it neither recalls nor
  notes anything, in the conversation or in its tasks; what it noted stays.
- **What it knows about you** groups what Nowledge Mem holds about you: **How you like things**,
  **What you decided** and **What it knows**. Each line says where it came from (**You told it**,
  **Saved by Codex**, **You saved it**, or **Nowledge Mem drew it from your conversations**). Tap a
  line to **Fix** its words or **Forget** it; forgetting asks first and reaches Nowledge Mem, so your
  other AI tools won't recall it either. **Search what it remembers** finds one thing.
- **Check this week's**, under the switch, opens what it noted about you in the last seven days.
- **Your other AI tools share this memory** says which tools, like Claude Code, Codex or Cursor,
  wrote to the same Nowledge Mem this week and how many working notes. Those notes are about their
  work, not about you, so they aren't listed; your partner can still recall them.
- **Nowledge Mem** says it is connected, **Where it's kept** (Nowledge Mem Cloud, the Nowledge Mem
  app on one computer, or your own Mem server) and **Its name** there, with how many memories Nowledge Mem holds in all and **Open Nowledge Mem**. When a newer Nowledge Mem is
  out, a row says so with **Update** (your sign-in and your memories stay as they are), and the
  Settings entry for Memory says it too. **Details** shows the exact computer, version, identity
  and space, for when you need help.
- Without [Nowledge Mem](https://mem.nowledge.co), your partner still remembers your
  conversation on its own. This section then says what Nowledge Mem adds and walks you through it
  in two steps: **Install Nowledge Mem** (one tap puts it on the computer Ducter lives on) and
  **Sign in to your Nowledge Mem** with a one-time connect link. Already use the Nowledge Mem app?
  Open it on that computer and your partner finds it.
- When the Nowledge Mem app on that computer is closed, the section says **Nowledge Mem isn't open**.
  On a Mac, **Open Nowledge Mem** opens it for you; anything your partner noted meanwhile waits and
  goes in once it's back.

### What it remembered, in the conversation

When something your partner remembered changed its answer, one quiet line sits under that reply:
**Remembered from what you said on Nov 10**, or **Remembered from what Claude Code saved on Nov 16**.
It never lists what it looked through, only the one thing that mattered, and only then. Tap the line
to see that memory, who it is from and when, with **Forget** (it asks first; forgetting reaches
Nowledge Mem, so your other tools won't recall it either) and **Open in Nowledge Mem**.

### What it noted, in the conversation

When your partner notes something about you, its reply's **Details** shows **Noted** with what it
noted. If you'd said the same thing before, the line says **In place of** the old one: it replaces
what it remembered instead of keeping both. Right after, **Undo** takes it back at once (the memory
is set aside in Nowledge Mem, never deleted, and anything it replaced comes back); later, **Forget**
asks first. If Nowledge Mem is away just then, the line says **Goes into Nowledge Mem once it's
back**, and it does, by itself.

Once a week, in the first morning note of the week, one line offers to show what it noted about you
in the last seven days. **Show me** opens **What it learned this week**: mark a line **Right**,
**Fix** its words (the fix goes back to Nowledge Mem), or **Forget** it.

## Connected AI agents

Once Nowledge Mem is in, **Connected AI agents** lets the AI agents you use elsewhere, like Claude
Code or Codex in a terminal, reach your partner. **Connect** once; then the first row says **Your
AI agents can reach {name}**, with **Its identity** (the name your agents find it by) and
**Where** (your own space, which only your agents are in). **Who can reach** your partner is
**Only yours**, **Teammates' too** or **Nobody**. **Disconnect** asks first, in place. **Details**
shows the exact identity and space id.

Your partner answers your other agents on one computer at a time. If it already does so on another
computer, the page says where, with **Receive here instead**. If two computers are both receiving
(say, an older setup), a row says so, with **Keep only this one**; both ask first. When the other
computer's connection can only be ended there, the row tells you where to do it.

**Try it** shows the exact words to say in your terminal: one to hand your partner a job, one for
when you step out and want your agents to send it what needs your call. **Copy** puts them on your
clipboard. It also says whether Claude Code and Codex have the Nowledge Mem plugin they need to find
your partner, with **Install** where one is missing, and a sentence to say to your partner here when
you want it to ask your terminal agent something. Until the first one arrives, a row says **Waiting
for the first one…**; when it lands, the row says **It worked** and **Show me** takes you to it. The
first time another agent reaches your partner, a short note in the conversation says what happened.

What it learned about your agents (work from one that
starts without asking, one you stopped listening to) has its own list, each with a way back.
In the conversation each agent is called by what it is and where it works, for example **Claude
Code (~/dev/ducter) asks you** or **Replied to Claude Code**; one that gives no name is **An AI
agent**.

## Notifications

- **Notifications** turns the nudges on this Mac and your connected phones on or off. With them
  off, anything that needs you waits in the conversation and in On hand.
- **Quiet hours** holds notifications between two times, 23:00 to 08:00 at first. When the
  quiet hours end, you hear about everything that came up during them.
- **If you don't answer** sets how long a decision waits before your partner goes with its
  suggested default: 10 minutes, 30 minutes, 1 hour or 2 hours. This applies only to things
  that can be undone. Anything that can't be undone always waits for you.
- When you change quiet hours or how long it waits, your partner answers in one short line under
  it (like *Got it: if you don't answer, I'll go with the default after 1 hour.*), which goes away
  by itself.
- **When it notices something** (once you have accounts): how your partner tells you what it
  noticed by itself: **Only urgent**, **Up to 3 a day** (until you choose), **Whenever useful** or **Only when I
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
one** takes an address and a key. Each place your accounts come from is one group, with a
row for each app it can read and its switch; tap a row for what it reads, or to stop it reading.
Reading just happens; sending or changing anything waits for your Go. All of it is in
[Accounts your partner can read](accounts.md). The AI accounts
(Claude Code, Codex, pi, DeepSeek Harness) live on **Devices**; the last row, **AI accounts**, goes there.

## Look and sound

At the top is a small preview of the window as it looks now. Your partner smiles when you pick
something.

- **Look:** Pebble, the warm paper and clay look. More looks will appear here once they work.
- **Light and dark:** **Follow the system** (the default) turns the window dark when your Mac
  does, and back again, with a short fade. **Light** or **Dark** keeps it that way on this Mac.
- **Show in the menu bar:** your partner in the macOS menu bar, so you see at a glance whether it's
  at work or something needs you (a small dot when something does). On at first.
- **Language:** the language of this window's own words. **Follow the system** uses your Mac's
  language. This is separate from how your partner talks.
- **Details in the conversation:** **Folded** (the default) keeps the conversation to what your
  partner says, with each message's checks, changes and task one click away under **Details**.
  **Shown** opens them all, lists what is still being worked on, and shows every question that
  waits for you. On a phone, the same choice is under **This phone**.
- **The intro's sound:** the sound of the intro when Ducter opens for the first time. **Play**
  lets you hear it. **Replay the intro** shows the intro again.
- **Voice:** **Key to hold** to talk (**Right Option**, **Fn** or **None**) and **Read replies aloud
  when I talk by voice**. See [Voice](voice.md).

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

Your partner also sits in the macOS menu bar, with a small dot when something needs you. Click it
to see what needs you and answer each question with **Go** or **Hold**, or choose **Open Ducter**.
**Don't Show in the Menu Bar** takes it away; **Show in the menu bar** under Look and sound brings
it back.

## Devices: AI accounts and connecting a phone

In **Devices**, the AI accounts under this Mac (Claude Code, Codex; pi and DeepSeek Harness when
they're set up) open when you click them.
From there you can install the AI agent, sign in with its own sign-in in your browser, or sign out.
Ducter never sees your password. No subscription? **Or paste an API key** under the AI agents of the
computer Ducter lives on takes a key you pay for by use. To add your phone or another computer, click **Connect a phone
or computer**. The app shows a one-time code for it (see [Your phone](phone.md)).
