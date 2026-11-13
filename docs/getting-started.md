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
- **An AI agent:** Claude Code or Codex signed in with your own account, or pi or DeepSeek
  Harness with your DeepSeek account
  ([which agents](faq.md#which-ai-agents-does-it-work-with)). Ducter does its work through
  the plan you already have. If neither is set up yet, Ducter installs one for you in the next
  step.
- **The Ducter app.** In Terminal, `curl -fsSL https://ducter.ai/install.sh | sh` installs it,
  puts the `ducter` command in `~/.local/bin`, and opens the app. You can also download the `.dmg` from the
  [latest release on GitHub](https://github.com/wey-gu/ducter/releases/latest), or build it
  from the source: see [Install](install.md).

## 1. Open Ducter

With the one line in Terminal, Ducter is already open. With the `.dmg`, drag **Ducter** onto
**Applications** and open it from there; the first time, macOS asks whether you want to open an app downloaded from the Internet: choose **Open**. (If
you built it yourself without an Apple Developer ID, macOS needs one extra step; [Troubleshooting](troubleshooting.md#ducter-not-opened)
shows it.)

Ducter then looks around your Mac for a few seconds:

- **"Checking this Mac…"** It looks for Claude Code and Codex and whether you're signed in.
- **If neither is ready,** you see *"Pick one, install it and sign in"*, with one row for Claude
  Code and one for Codex. Click **Install**: Ducter runs the AI agent's official installer into your
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
`ducter/…`), so your own checkout is left alone. The copy is a folder named after the project
and the branch, in the Ducter folder: such as `~/ducter/worktrees/hawdb/fix-flaky-test`; on the
Mac, an opened task shows its path over its changes.

Each computer has one **Ducter folder**, `~/ducter`, that holds what Ducter makes there for you:
`projects` (repositories it cloned for you) and `worktrees` (tasks' copies). If you already have a
`~/ducter` of your own, Ducter leaves it alone and uses `~/ducter-work`. To use another place, set
`DUCTER_FOLDER` before starting Ducter.

Open a task to read it like a conversation with the agent doing it: what was asked, then what it
said and every step it took, one line each. A line with **›** opens: a command shows what it
printed, an edit shows the lines it changed, and a step that went wrong shows its error right
under it. The line over the box says what it's doing now; **Pause** stops it there (on a
keyboard, press Esc twice). Write in the box to tell it something; if it's busy, your words wait
as **Queued** until it gets to them. Scrolled up while it works? **Jump to latest** brings you
back.

To work on it by hand, open the task on the Mac and choose **Open** at its top right: **Show in
Finder**, **Open in** Cursor, Visual Studio Code or Zed, or **Open in** Terminal, iTerm2, Ghostty
or Warp, whichever you have. **Open** shows when the copy is on this Mac.

## 3. Get your first result

While a task works, there's nothing to watch. **Silence means it's going fine.** When it's done,
it comes back to the conversation. The very first time, a small line says *"Your first task is
done. Everything I finish comes back to you like this, with how I checked it."*

A finished result reads like a message from a colleague: what it did, in a few lines. Under it
you see at most one small row:

- **Merge into main**, when the task changed code. Merging is always your call.
- **Details**, which opens right there: how it checked (such as *412 tests pass*), how many files
  changed (on the Mac, click it to see the changes; the phone just names them), the task itself,
  **Open draft PR**, and anything your partner noted to remember.

For a moment before the result, you may see *"Looking over what it came back with…"*: your
partner is reading what the task did so it can tell you in its own words.

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
- **Reply to one message.** When several things came back, answer the one you mean: on the phone,
  swipe its bubble to the right (or press and hold it, then **Reply**); on a computer, point at it
  and press the reply button beside it, or right-click it. A small copy of that message sits above
  what you type (press × or Esc to put it away), and stays pressed into your message once sent.
  Your partner takes it as being about that message: "add one more test" goes to the task that
  message was about, even if something else spoke last, and a reply to a question answers it. Send
  a few replies in a row and each gets its own answer. Tap the small copy to go back to the
  original. On a computer you can also select part of your partner's words and press **Reply to
  this part**.
- **Copy anything.** Press and hold a message on the phone (right-click it on a computer) and
  choose **Copy**: you get its words as written, ready to paste. The same menu shows when it was
  said, and on the phone offers **Copy link** on a link and **Select text** to pick just part of
  it. Every block of code has its own **Copy** at its top right.
- **You never lose your place.** While you read back, the conversation stays where you are. If
  your partner says something meanwhile, a small button above where you type says how many new
  messages came; tap it to read from the first of them. When you open Ducter after a while, a
  **New messages** line shows where you left off. On a Mac, ⌘ with the down arrow key goes to the newest message, and
  what you were typing is still there if you close the app before sending.
- **On hand** shows every task at a glance and what's waiting for you. Open any task to read
  *What it did*, see its changes, and talk to it directly.
- **Work beside it.** In a task that changes files or runs a web page, the **Workbench** button
  in its header (or ⌥⌘B) opens a side column (a sheet on the phone): **Changes** with each file's
  diff and **Undo** for one file, **Files** to read any file and edit it yourself, **Preview** to
  see the page it is building, **Browser** while it uses Ducter's browser, and **Phone** while it
  uses Ducter's phone or, on a Mac, an iPhone simulator it builds for: you see the simulator live
  and can go to its Home screen, switch dark mode, change the text size, open a link, or take a
  screenshot to send to the task (tapping happens in Simulator itself). When you save a
  file, the task is told what you changed the next time it works. If it changed the file while
  you were editing, Ducter asks before saving over it.
- **Where the work is.** The branch name (or folder name) at the top of a task opens what you
  check before merging: the computer, the folder (copy its path), the branch and what it came
  from, its changes, and **Open draft PR** or **Merge into main**.
- **Close the window whenever you like.** Ducter keeps working. The Dock icon brings the window
  back, and its badge counts what is waiting for you.
- **A few small offers come later, one at a time,** each with **Later**: notifications on this
  Mac when you need to decide something (after your first result), and finding Ducter on
  [your phone](phone.md). Nowledge Mem is never offered here; if you'd like it, see
  [Memory, with Nowledge Mem](privacy-and-safety.md#memory-with-nowledge-mem).
- **Use it from Terminal too.** The one line in Terminal already put `ducter` there. If you
  installed from the `.dmg`, after your partner's first reply Ducter offers once: *"Use ducter
  in Terminal too?"* Say yes, and `ducter status` works in any new Terminal window.

Next: put Ducter on [your phone](phone.md), or on [a server that stays on](install.md#a-linux-server-that-stays-on)
so it keeps working while your Mac sleeps.
