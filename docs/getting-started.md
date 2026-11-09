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
- **An AI agent:** Claude Code or Codex, signed in with your own account
  ([which agents](faq.md#which-ai-agents-does-it-work-with)). Ducter does its work through
  the plan you already have. If neither is set up yet, Ducter installs one for you in the next
  step.
- **The Ducter app.** Signed downloads will be on
  [GitHub Releases](https://github.com/wey-gu/ducter/releases); the first release is on its way.
  Until then, someone builds it once from the source and hands you `Ducter.dmg`, or you build it
  yourself: see [Install](install.md).

## 1. Open Ducter

Open the `.dmg`, drag **Ducter** onto **Applications**, and open it from there. The first time,
macOS asks whether you want to open an app downloaded from the Internet: choose **Open**. (If
your copy wasn't signed by its builder, macOS needs one extra step; [Troubleshooting](troubleshooting.md#ducter-not-opened)
shows it.)

Ducter then looks around your Mac for a few seconds:

- **"Checking this Mac…"** It looks for Claude Code and Codex and whether you're signed in.
- **If neither is ready,** you see *"Pick one, install it and sign in"*, with one row for Claude
  Code and one for Codex. Click **Install**: Ducter runs the tool's official installer into your
  own folders (no administrator password, no Terminal) and shows how long it's been. Then click
  **Sign in** and finish in your browser. *"This continues by itself"*: when it's done, you see
  **All set**. If something goes wrong, the row says what happened in plain words, with **Try
  again** and **Do it in Terminal**.
- **"What should I be called?"** Give your partner a name, or keep Ducter. (If you use
  [Nowledge Mem](https://mem.nowledge.co), your partner already has a name and this is skipped.)
- **"Getting Ducter ready…"** From now on Ducter keeps working when you close the window. To
  stop it, choose **Stop Ducter** in the menu. macOS may show a *"Background Items Added"*
  notice right after: that's Ducter working in the background, and there's nothing to do.

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

A finished result reads like a message from a colleague: what it did, in a few lines. Under it
you see at most one small row:

- **Merge into main**, when the task changed code. Merging is always your call.
- **Details**, which opens right there: how it checked (such as *412 tests pass*), how many files
  changed (click it to see the changes), the task itself, **Open draft PR**, and anything your
  partner noted to remember.

If anything left your computer, a line marked ↗ says what, above that row. It is never hidden
behind Details.

In our own runs, a small "fix the failing tests" task came back done in under a minute.

## What happens next

- **Your partner shows it's on it.** The moment you send something, your partner appears where
  its reply will come, with a short line of what it is doing, such as *Thinking…*. For real
  work, a sentence follows within a couple of seconds, such as *"On it: checking why CI failed,
  usually about 10 min; I'll tell you when it's clear"*, and the work is already under way when
  you read it. Then it stays quiet until there is a result.
- **Decisions come with a default.** When a task needs you, your partner asks, such as *"Rebase
  before merging?"*, and says what it will do if you don't answer. Press **Go** to take it,
  **Hold** for "not yet", or **Reply…** in your own words. When several things are waiting, it
  asks one at a time; *"1 more waiting on you"* shows the rest, and **Go on all defaults** takes
  every suggested answer at once.
- **On hand** shows every task at a glance and what's waiting for you. Open any task to read
  *What it did*, see its changes, and talk to it directly.
- **Close the window whenever you like.** Ducter keeps working. The Dock icon brings the window
  back, and its badge counts what is waiting for you.
- **A few small offers come later, one at a time,** each with **Later**: notifications on this
  Mac when you need to decide something (after your first result), finding Ducter on
  [your phone](phone.md), and [Nowledge Mem](privacy-and-safety.md#memory-with-nowledge-mem) so
  your partner remembers for longer.
- **Use it from Terminal too.** After your partner's first reply, Ducter offers once: *"Use
  ducter in Terminal too?"* Say yes, and `ducter status` works in any new Terminal window.

Next: put Ducter on [your phone](phone.md), or on [a server that stays on](install.md#a-linux-server-that-stays-on)
so it keeps working while your Mac sleeps.
