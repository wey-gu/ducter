---
title: Getting started
description: Open Ducter on your Mac, say one thing, and get your first finished task back, with proof.
order: 1
---

# Getting started

This page walks you from opening Ducter on your Mac to your first finished task. It takes about
five minutes, and there is nothing to learn first: you write to your partner the way you would
write to a colleague.

Ducter runs on one computer: **this Mac**, or **a server** that stays on. This page follows the
Mac; for a server, see [Install](install.md#a-linux-server-that-stays-on).
[Get started](https://ducter.ai/start) on the website asks the same question and shows one path.

**Let your AI agent do it.** If you use Claude Code or Codex, paste this into it and it does the
steps below for you, asking when something isn't clear ([For AI agents](for-agents.md)):

> Set up Ducter on this Mac for me. Follow the guide at
> https://ducter.ai/skills/ducter-deploy/SKILL.md

## What you need

- **A Mac with Apple silicon (M1 or later).**
- **An AI agent:** Claude Code or Codex signed in with your own account, or an API key from
  DeepSeek, Kimi, Zhipu GLM, OpenAI, Anthropic or OpenRouter
  ([which agents](faq.md#which-ai-agents-does-it-work-with)). Ducter does its work through
  the plan or key you already have. If neither is set up yet, Ducter installs one for you in the
  next step, or you paste a key.
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
- **No subscription?** Under the two rows, choose **Paste a key** and paste an API key: it checks
  itself. Ducter says in a second or two whether it works (or why not: the key is wrong, the
  account is empty, or the provider can't be reached from here), and goes on by itself when it does.
  If something it needs to use the key isn't on your Mac yet, it says **Setting up…** and puts it in
  place itself, a minute or two, no Terminal.
- **No key either?** Under the field, **No key yet?** shows the quickest way to get one from where
  you are, in three steps: outside mainland China, a free Google Gemini key with your Google account
  (no card, about a minute); in mainland China, Kimi, which gives ¥15 of trial credit to a mainland
  mobile number. **Get one on …** opens that provider's own page; you make the key there, copy it and
  paste it back. **Or use …** shows the other way. Ducter never makes an account or a key for you.
  [More about keys](faq.md#can-i-use-it-without-a-claude-or-chatgpt-subscription).
- **"What should I be called?"** Give your partner a name, or keep Ducter. (If you use
  [Nowledge Mem](https://mem.nowledge.co), your partner already has a name and this is skipped.)
- **"Getting Ducter ready…"** From now on Ducter keeps working when you close the window. To
  stop it, choose **Stop Ducter** in the menu. macOS may show a *"Background Items Added"*
  notice right after: that's Ducter working in the background, and there's nothing to do.

## 2. Say one thing

Your partner says hello first, in its own words, with a few everyday things to try. If you use
Claude Code or Codex on this Mac, one of them is **Pick up what I was doing in Claude Code lately**.
Nothing has been read until you tap it. Then your partner looks at what those agents keep about
your recent work and names two or three things, for example *"Yesterday you were on 'Fix the flaky
compaction test' in hawdb. Want me to pick it up?"*. **How I know** under each one shows where it
came from, and **Leave this folder out** keeps a folder out for good. **Stop looking** turns it all
off and makes your partner forget what it saw.

**The next day,** the first time you open Ducter, your partner says one short recap of what you set
up yesterday — at most three true things, each a link — and asks once, in two quiet choices,
whether to say one line each morning. Nothing was set up, nothing is said. If you don't tap, nothing
changes; it never asks twice, and it never turns into a tour.

Tap one to put it in the box (it never sends by itself), change it if you like, and
press Return. Or write anything of your own:

- A quick question gets a quick answer, right there.
- Bigger work becomes a **task**. Your partner says what it's starting, and the task works on
  its own while you do something else.

Coding tasks work in their own copy of your project, on their own branch (named
`ducter/…` in a few plain English words, such as `ducter/fix-flaky-test`, with the issue number
first when the task is one of your issues, such as `ducter/11028-embedding-one-model`), so your own
checkout is left alone. If your repository's contributing guide says how branches are named (a
`feat/` prefix, say), the name follows it. The copy is a folder named after the project and the
branch, in the Ducter folder: on a Mac such as `~/Ducter/worktrees/hawdb/fix-flaky-test`, on Linux
such as `~/ducter/worktrees/hawdb/fix-flaky-test`; an opened task shows its path over its changes.

Each computer has one **Ducter folder**, that holds what Ducter makes there for you: `projects`
(folders it made and repositories it cloned for you) and `worktrees` (tasks' copies). On a Mac its
suggested name is `~/Ducter`, like your other folders there; on Linux it is `~/ducter`. If that name
is already someone else's, Ducter leaves it alone and uses `~/Ducter-work` (`~/ducter-work` on
Linux). To move it, open **Settings › Where it runs**, tap **Ducter folder**, and choose a new place
or, on a Mac, **Change it to ~/Ducter**. If you set `DUCTER_FOLDER` before starting Ducter, that
place is used instead and can't be changed in Settings.

Open a task to read it like a conversation with the agent doing it: what was asked, then what it
said, and between its words one line for each run of steps ("Read 9 files, ran 2 commands",
"Used GitHub 14 times"). A line with **›** opens: the steps in it, then a command shows what it
printed and an edit the lines it changed. A step that went wrong says so in words right under it
("GitHub couldn't find this file (404)"). Once a turn is done, its work folds under **Worked for
3m 12s**, keeping what it said last. While it works, the last line says what it's doing now,
such as **Running a command, 41s**; the square **Pause** button by **Send** stops it there (on a
keyboard, press Esc twice). Write in the box to tell it something while it works: it reads your
words at its next step, and under them you see **It'll see this at its next step**, then **Seen**
once it has. To have it read them only once this turn is done, press Option-Return, or
right-click **Send** (press and hold it on a phone) and choose **After this turn**: they wait in
order above the box, where you can click one to change it, take it
back with **×**, or **Say it now**. **Cancel task** is in the **⋯** at the top. Scrolled up while it
works? **Jump to latest** brings you back.

A task that checks on something over time (a review queue every 45 minutes, a build until it's
green) rests between looks: its last line says **Waiting: …** and when it looks next; click it to
see how it checks. Each time the wait comes true, a thin line says **Wait over** with the time,
and that round's work folds under it. When Ducter itself tells the agent something, such as that
you lent it your phone, it's a thin line in your words too, never one of your messages. On a wide
window, the small marks at the right edge are everything said to the agent: hover them for the
list, click one to go there. Under the agent's answer are its time and **Copy**, which copies the whole answer (on a computer, hover its earlier words to see the same).

A task is the AI agent as you run it yourself: Claude Code or Codex with your own instructions
(`CLAUDE.md`, `AGENTS.md`), skills, commands, hooks, subagents and MCP servers. What you type in
a task's box goes to the agent, slash commands too: in Claude Code, `/review`, `/compact`,
`/context` and your own commands and skills work as they do in your terminal. On any agent,
`/model sonnet` or `/effort high` changes the model or how hard it thinks; the task carries on
in the same conversation from its next turn. In Codex and pi, `/compact` makes room in its context
too.

The small ring by a task's box is how full the agent's context is: it fills as the agent reads and
works, and turns yellow when the agent will soon compact it (sum up the conversation so far to make
room; it saves its progress first and carries on). Click it to see the numbers: how much of the
window is used, what the last turn and the whole task took, how many times it compacted, and how
much of your Claude Code or Codex plan's limits is left and when they reset. **Compact now** there
does the same as typing `/compact`; while the agent is mid-step it waits for the step to end. Each
compaction shows in the task as a thin line, **Context compacted from 152k to 31k**.

To work on it by hand, open the task on the Mac and choose **Open** at its top right: **Show in
Finder**, **Open in** Cursor, Visual Studio Code or Zed, or **Open in** Terminal, iTerm2, Ghostty
or Warp, whichever you have. **Open** shows when the copy is on this Mac.

**Several things at once.** Ask for a few things in one message ("what's on next week, and put
these three in my calendar"; "fix these three issues and look at why the build is red") and your
own words come back under your message as a few lines, one for each thing, each with a mark that
changes as it gets done: a tick when done, a flag when it needs you, a cross when it didn't work,
with a short note of what came of it. From four lines, a count under them says how many are done
and how many are left. Things that belong together (the same calendar, the same phone, one change)
are done together, so you sign in once. Click a line to open the task doing it; on the Mac, hover a
line to see which AI agent is on it. You hear back once for the whole message, and at once only if
something needs you or didn't work. To change one of them later, just say which ("the second one,
make it Saturday").

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

When a task changed code or files, or is about to send something for you (a reply, a comment, a
pull request, a message), another AI you're signed in to reads it once against what you asked
before you see it. Anything it finds goes back to the task to fix first. If something is still
off, one line says so under the result or on the card you'd tap Go on, such as *"Another AI looked
it over: the reply says 0.1.2; you said 0.1.3"*. When it finds nothing, it says nothing. Don't want
it for some kind of work? Say so, for example *"no need to double-check docs changes"*, and it
stops for that kind; the rule shows on the Partner page, where you can remove it.

In our own runs, a small "fix the failing tests" task came back done in under a minute.

## What happens next

- **Your partner shows it's on it.** The moment you send something, your partner appears where
  its reply will come, busy at what it is doing, with a short line that says it in your words,
  such as *Thinking…* or *Checking how "Look into the ITIN application" is going…*. For real
  work, a sentence follows within a couple of seconds, such as *"On it: checking why CI failed,
  usually about 10 min; I'll tell you when it's clear"*, and the work is already under way when
  you read it. Then it stays quiet until there is a result.
- **Decisions come with a default.** When a task needs you, your partner asks, such as *"Rebase
  before merging?"*, and says what it will do if you don't answer. Press **Go** to take it,
  **Hold** for "not yet", or **Reply…** in your own words. Not a good moment? **Ask me later** and
  pick a time (tonight, tomorrow morning, Monday, or your own): the question goes away, nothing
  happens meanwhile, and it comes back once at that time. When several things are waiting, it
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
- **Copy a whole message.** On a computer, point at a message and press **Copy** beside it (or
  right-click it). On the phone, press and hold it and choose **Copy**. You get the whole message:
  pasted into a notes app or a document it keeps its headings, lists and bold; pasted into an
  editor or a terminal it is the text as written. The button says **Copied** for a moment. The
  phone's menu also shows when it was said, and offers **Copy link** on a link and **Select text**
  to pick just part of it. Every block of code has its own **Copy** at its top right.
- **You never lose your place.** While you read back, the conversation stays where you are. If
  your partner says something meanwhile, a small button above where you type says how many new
  messages came; tap it to read from the first of them. When you open Ducter after a while, a
  **New messages** line shows where you left off. On a Mac, ⌘ with the down arrow key goes to the newest message, and
  what you were typing is still there if you close the app before sending.
- **Tasks** shows every task at a glance and what's waiting for you. Open any task to read
  *What it did*, see its changes, and talk to it directly.
- **Work beside it.** In a task that changes files or runs a web page, **Workbench** in the task's
  **⋯** menu (or ⌥⌘B; the Mac app keeps its header button) opens a side column (a sheet on the phone): **Changes** with each file's
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
so it keeps working while your Mac sleeps. Already have a server at home or another Mac?
[Add it](add-a-computer.md) with one line, and tasks can run there too.
