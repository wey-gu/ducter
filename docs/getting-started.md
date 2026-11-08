---
title: Getting started
description: Open Ducter on your Mac, say one thing, and get your first finished task back, with proof.
order: 1
---

# Getting started

This page walks you from opening Ducter on your Mac to your first finished task. It takes about
five minutes, and there is nothing to learn first: you write to your partner the way you would
write to a colleague.

## What you need

- **A Mac with Apple silicon** (M1 or later).
- **Claude Code or Codex**, installed and signed in with your own account. Ducter does its work
  through the AI plan you already have. If neither is set up yet, Ducter tells you exactly what
  to run.
- **The Ducter app.** A download is coming soon. Until then, someone builds it once from the
  source and hands you `Ducter.dmg`, or you build it yourself: see [Install](install.md).

## 1. Open Ducter

Open the `.dmg`, drag **Ducter** onto **Applications**, and open it from there. The first time,
macOS asks whether you want to open an app downloaded from the Internet: choose **Open**. (If
your copy wasn't signed by its builder, macOS needs one extra step; [Troubleshooting](troubleshooting.md#ducter-not-opened)
shows it.)

Ducter then looks around your Mac for a few seconds:

- **"Checking this Mac…"** It looks for Claude Code and Codex and whether you're signed in.
- **If something is missing,** you see **"One thing first"** with just that one item, the
  command that fixes it, **Copy**, and **Run in Terminal**. Do it, come back to the window, and
  Ducter checks again by itself. Anything optional waits on one quiet line for later.
- **"What should I be called?"** Give your partner a name, or keep Ducter. (If you use
  [Nowledge Mem](https://mem.nowledge.co), your partner already has a name and this is skipped.)
- **"Getting Ducter ready…"** From now on Ducter keeps working when you close the window. To
  stop it, choose **Stop Ducter** in the menu.

## 2. Say one thing

The conversation opens with a greeting and three suggestions. If you keep code on this Mac, the
suggestions are about the projects you touched most recently, for example *"Find the failing
tests in my-app, fix them, and tell me"*. Ducter found them from the folder names only; it
didn't open anything inside.

Tap a suggestion to put it in the box (it never sends by itself), change it if you like, and
press Return. Or write anything of your own:

- A quick question gets a quick answer, right there.
- Bigger work becomes a **task**. Your partner says what it's starting, and the task works on
  its own while you do something else.

Coding tasks work in their own copy of your project, on their own branch (named
`ducter/…`), so your own checkout is left alone.

## 3. Get your first result

While a task works, there's nothing to watch. **Silence means it's going fine.** When it's done,
it comes back to the conversation. The very first time, a small line says *"Your first task is
done. Everything I finish comes back to you like this, with how I checked it."*

A finished result tells you:

- what it did, in a few lines;
- **How I know:** the proof, such as the tests it ran before and after;
- **Sent out:** anything that left your computer (often **Nothing**);
- **Left out:** what it chose not to do.

Then you choose: **Merge into main**, **Open draft PR**, or **See changes**. Merging is always
your call.

In our own runs, a small "fix the failing tests" task came back done in under a minute.

## What happens next

- **Decisions come with a default.** When a task needs you, you see a question like *"Rebase
  before merging?"* with a suggested answer. Press **Go** to take it, **Hold** for "not yet",
  or **Reply…** in your own words.
- **On hand** shows every task at a glance and what's waiting for you. Open any task to read
  *What it did*, see its changes, and talk to it directly.
- **Close the window whenever you like.** Ducter keeps working. The Dock icon brings the window
  back, and its badge counts what is waiting for you.
- **Use it from Terminal too.** After your partner's first reply, Ducter offers once: *"Use
  ducter in Terminal too?"* Say yes, and `ducter status` works in any new Terminal window.

Next: put Ducter on [your phone](phone.md), or on [a server that stays on](install.md#a-linux-server-that-stays-on)
so it keeps working while your Mac sleeps.
