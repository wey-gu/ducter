---
title: On hand
description: See every task at a glance, by project and by what needs you, find one fast, and act on several at once, with the keyboard if you have one.
order: 2.5
---

# On hand

**On hand** (手头的事) lists everything your partner is doing for you. Open it from the button
in the conversation's header, or press ⌘2. It always opens on the whole list.

## Getting to what needs you

Wherever you see how many things need you, tap the number: "2 need you" under your partner's name,
the small number on a partner's face, or the line **2 waiting on you ›** just above where you type
(shown while what waits is out of sight). It takes you straight to the first one: a question your
partner asked scrolls into view in the conversation; anything else opens On hand with that task
picked out and briefly lit up. Tap again for the next one; after the last, it starts over.

The way back is always at the top: **Conversation / On hand / …** on a Mac or a wide screen, **‹**
on a phone. Esc goes back one step.

## What you see

At the top is your partner, with one short line: whether anything needs you, and if not, what
comes next: "Nothing needs you. I'm on it." while work is under way, or "Nothing needs you. The
first is back at 22:40." when everything waits. If a task has stopped and nothing will start it
again on its own, the line says so: "One has stopped and needs a look."

Its pose tells you the same at a glance: a little flag when something needs you, reading while
work is under way, resting on its bench while everything waits, smiling when the day's work came
back done.

What needs you comes first. A question is answered right there. A task that has stopped (it
waits, but nothing will bring it back by itself) or didn't work out says why in plain words, with
the way to fix it right beside it:

- it stopped at a phone: allow access on that phone again, then tap **Allowed, carry on**;
- its AI agent got signed out on its computer: **Sign in again**;
- its computer went away: when it was last seen, and that turning it on lets the task carry on;
- a Mac needs its two switches for a task working in its apps: **Open the guide on that Mac**;
- it couldn't start: why, in plain words, and the real fix first, such as **Clone it to Home
  Server** or choosing a folder that's already there;
- it stopped without asking for anything: what your partner knows from its last words (for
  example, that its pull request was waiting on CI and nobody has looked since), and **Continue**.

The number on your partner's face, on the app's icon and at the top of On hand is the same number:
everything listed under **Needs you**, and only that. A question leaves it when you answer it. A
task that stopped, didn't work out or has a pull request ready to merge leaves it once you've opened
it on that device; it then stands with the rest (a stopped one under **Waiting**, one that didn't
work out with what finished that day), still with its fix beside it.

If Ducter is already fixing it by itself (starting it again, or cloning the code first), the task
stands under **Working** saying so; you don't need to do anything. On the task's own page, the same
failed start tried several times is one line: "Tried 3 times and it couldn't start: …".

On a phone, each task reads top to bottom: the task, why, where and when, then its one fix as a
big button.

Below that, the rest:

- **Working**: tasks under way.
- **Waiting**: tasks waiting for something, such as a check to pass, an email, or a computer to
  wake up. A question you put off with **Ask me later** waits here too, saying when it
  will ask you again; **Decide now** brings it back at once.
- **Looking after**: what Ducter keeps on for you, such as a review every 45 minutes, a fare it
  checks every morning, or a helper your agents hand pull requests to. Each is one card with a
  lantern: what it holds, how many wait for you, how often it wakes, its last change, and when it
  wakes next. Whatever needs you from it is under **Needs you**, once, with its name.
- **Done today**: tasks that finished today. A task whose result is a pull request is done only
  once that pull request is merged (see below). A wait that didn't happen is listed there too with its
  own words, but isn't counted. Tasks that finished yesterday fold under one line, **1 more done
  yesterday**.

Each section is one card, and every task in it is one row. On the left, a small mark says where it stands:
a flag when it needs you, a dot that gives a small beat each time the task takes a step while it works, a ring that fills up toward when a wait
comes back, a tick when it's done, a cross when it didn't work out. Then the title, whole (a long one
takes two lines), and its project,
and under them, in words, what it is doing right now ("Running the tests", "Opened booking.com in
Chrome"), what it waits for, or what came of it. On the right, every row's time stands on the same edge, and what you can do stands in the same
column, so you can read down them:

- working: how long it has been at it this time (a task you came back to counts from when it picked
  up again, not from the day you started it). If it hasn't taken a step for a while, its dot dims
  and it says when its last step was. A step that didn't work while the task carries on isn't an
  alarm; it shows in the task. A group of tasks shows its parts as one track: done, at work, waiting
  their turn;
- waiting: when it comes back ("back at 11:39"); there's nothing for you to do until then. A task
  waiting for an AI agent's limit says whose, and offers **Hand it to Codex now** when another
  agent can take it;
- done: when it finished.

Which AI agent does the task, and on which computer, is in the task itself.

A wait that still checks by itself but hasn't changed for over a day says when it last changed and
offers **Check now** (it looks again now).

A card says which computer it runs on only when that isn't the one most of your tasks use.

A finished task shows what it made, such as its pull request (**#1190**), which you can open.

### A task whose result is a pull request

When a task opens a pull request, its work goes on there: CI runs, someone reviews it, it gets
merged. Ducter keeps looking at it for you, so the task isn't listed as done while the pull request
is open. Its row stands under **Waiting** and says, in one quiet line, where the pull request is:

- **Waiting for CI**, with how many checks have passed (**6 of 10 checks passed**);
- **CI failed**, with which checks;
- **Waiting for review**, with whom it waits on;
- **hawkingrei asked for changes** (the task hears about it and works on them);
- **Conflicts with main**;
- **Still a draft**.

When it's signed off and every check has passed, it reads **Ready to merge**, stands under **Needs
you**, and offers **Merge on GitHub**. Once it's merged, the task is done and moves to **Done
today**. A pull request closed without merging says **Closed without merging**.

A task with a pull request never offers **Merge into main** or **Open draft PR**: the pull request
holds the work.

On a wide window, a task shows on the right as it works: the one you moved to with the arrow keys,
or else the one at work. You see what it's doing now, its last few steps in plain sentences (several quick ones as one line,
such as "Read 3 files, ran 2 commands"), and
**Open the task**; for a task that stopped, why, and under **Its last words** what it last told you. For a task using a phone, it shows the
last picture you saw of that phone and **Watch the phone**; for one in a browser, **Watch it browse**. Move with the arrow keys and watch it
follow; press Enter to go in.

A task in a code folder also shows the lines it added and removed (**+42 −7**), and **Draft PR**
or **Merged** once you've done either from Ducter, or once its pull request merged.

### Calm when there is a lot

- Three or more waits that haven't changed for over a day fold under one line, **3 more, quiet
  for over a day** (one or two stay in view). Tap it to see them; each says when it last changed. A task that stopped without saying
  what it waits for says that too, so you know to look.
- Three or more results you've already opened fold under **9 more you've seen**. A new result stays in view
  until you open it.
- What needs you never folds.

### Projects

Every task that works in a folder belongs to that folder's project; everything else is under
**Other**. There's nothing to set up. Once there are two or more, the projects appear: on a wide
window as a column on the left, otherwise as a row of names above the list. Each one shows its
whole name and how many tasks it has; the number turns to the needs-you colour when something
there needs you. A task that couldn't start because its folder isn't on that computer doesn't
make a project of its own; it stays under **All**, where its fix is. Pick one to see only its tasks;
**All** shows everything again. Under a project, **+** starts a new task in its folder.

**+ Add a folder**, at the foot of the column (or **+** at the end of the row of names), makes a
project from a folder on any of your computers. Pick the computer first (each is shown as a small
picture, with whether it's awake), then find the folder: the path at the top steps back a level
when you tap a part of it, and typing narrows the list or, starting with **/** or **~**, goes
straight to a path. With a keyboard, the **up and down arrows** move, **Return** goes in, **Command-up** goes up a
level and **⌘Return** adds. The button says what it will do, like **Add hawdb on Hetzner
Server**. The new project appears in the column, ready for its first task.

With one errand on hand, all of this stays out of the way: one row, and four small numbers.
**Find a task…** appears once you have ten things on hand.

## On a Mac, an iPad with a keyboard, or a browser

- **j** and **k**, or the arrow keys, move through the list. **Enter** opens the selected task.
- **/** jumps to Find. **Esc** clears what you typed, then the number you picked.
- **⌘O** opens any task by a few words of its title. If nothing matches, Enter starts a new task
  with those words.
- A finished task with a branch and no pull request has **Merge into main** and **Open draft PR**
  in its **⋯**. **Pause** shows when you hover over a task at work. What shows on hover never
  covers the row's time. Pointing at a title shows the whole title only when the row had to
  shorten it.
- On the full-screen On hand, **⌘-click** or **⇧-click** selects several tasks (or press **x**
  on a selected row). A bar at the bottom then offers what fits them: merge them, open draft
  PRs, pause them, or cancel them. Cancel asks you first.
- On a wide window, opening a task keeps the list beside it, on the left, with the open task
  marked; if you picked a project, the list stays on that project. **⌘⇧]** and **⌘⇧[** open
  the next task and the one before, even while you're typing (on the Mac they're also in the
  View menu as **Next Task** and **Previous Task**). **j** and **k** do the same when you
  aren't typing. The open task's bar says where it is in the list (**3 / 9**), with a step to the
  one before and after. **⌃1** to **⌃9** open the first to ninth task on hand. **⌘/** lists every
  key. **⌘⇧D** makes an open task **Compact** (your partner's picture small beside the title,
  more of the work on screen) and back. If you open the **Workbench** and the window is too narrow for all three, the
  Workbench takes the list's place until you close it.
- In the list beside a task, a row says only its title and a small picture of your partner while
  something is going on: raising a flag when it needs you, reading while it works, smiling with
  its phone when it has a **New result** you haven't opened yet. Open the task and the picture
  goes. A task that finishes while you're looking elsewhere keeps that smile in every list until
  you open it.

## Work running in the background

An agent often starts something that keeps going after its turn: a long build or benchmark, a
command that waits for a server, a helper agent (a subagent) working on part of the task, or a
watch on a log. Ducter shows these in the open task, just above where you type:

- **3 running in the background** heads the list, with how long the oldest has been going. One
  row per job: a mark for what it is (a command, a subagent, a watch), the agent's own words for
  it (or the command, shortened), and how long it has run.
- **Stop** (a small square at the end of a row) stops just that one, through the agent's own
  way of stopping it; the agent hears that you stopped it. A row has no Stop when its agent
  can't stop that kind of job by itself (a command Codex keeps running in the background, for
  now). To stop everything, use **Pause** by the message box.
- What ended folds under **22 done**. Open it to see each one's result: **Exit 2** when a
  command failed, **Stopped**, or **Result unknown** when Ducter restarted before it heard the
  end. Open a row to read the last lines of its output.
- Click the heading to fold the list away; on a computer it stays the way you left it. On a
  phone the list starts folded.

On hand says it too: a task at work with jobs still running shows **3 running in the
background** in its row.

## At a glance

You don't have to open Ducter to know how things stand.

- **On a Mac**, your partner sits in the menu bar as a small pebble. Its eyes look down while
  something is at work. When something needs you, a small orange dot appears beside it. It never
  shows a number. Click it for the same one sentence On hand starts with, what needs you (answer
  **Go** or **Hold** right there, or **Open the Task**), and **Open Ducter**. If you'd rather not
  have it, choose **Don't Show in the Menu Bar**; turn it back on in Settings › Look and sound ›
  **Show in the menu bar**.
- **Beside your work, on a Mac**, keep your partner in a **mini window** that floats over your
  editor or browser, on every desktop. Press **⌃⌥⌘Space** anywhere, or choose **Mini Window** in
  the menu bar pebble's menu or in View (if another app already uses those keys, the menu item says
  so, and the menu is the way to it). It shows your partner, one line (what it's doing while
  you wait, what it just said, or what needs you), how many things need you (click to see them in
  On hand), and a field to say something or hold to talk. It never takes the keyboard from what
  you're typing in until you click its field. Press the same keys, click **Hide**, or press Esc in
  an empty field to put it away; it remembers where you put it. The first time you open a task's
  folder in your editor or terminal, it comes along by itself, once.
- **On a phone**, open a task that's under way and tap **Show on the Lock Screen** (iPhone) or
  **Show in notifications** (Android). Only whether it's working, waiting or needs you shows
  there, and for how long, never what it says. It goes away by itself when it's done. A call
  Ducter makes for you shows the same way while it's on. On iPhone this is coming soon; on
  Android it stays up to date while the Ducter app is open or was just open, and goes away rather
  than show something old.

## On a phone

The same: the projects as a row of names you can swipe, the four numbers, and the list. Tap a
row to open it: the row grows into the task's page. To go back, tap **‹** at the top left, or, in
the app, swipe in from the left edge. A sheet (Settings, a new task) closes when you pull it down.

## Looking after

Ask once, in a sentence, and Ducter keeps at it: "keep an eye on the Dec 20 Tokyo fare every morning,
tell me under ¥2,000, stop once I book", "every Monday at 9, draft my weekly report", or "make a
helper my agents hand PRs to, and watch them until they can merge". Your partner says it in one line
and puts a card under it: when it wakes, when it speaks, until when, and **Open**, **Change**, **Undo**.

Each one is a card under **Looking after**. Its lantern is lit while it is on and dim while paused.
The tasks at work on it are listed under it; one that needs you (a question, a pull request ready to
merge) is under **Needs you** instead, with its name, and the card only says how many wait.

Tap a card to open its page: what you said, what waits for you (answered right there), what it holds
(each pull request with its own title and checks), every round (newest first, each in one plain line
of what happened; **Details** shows what the task reported; the quiet ones fold into one line),
and **How it runs**. To go back to the whole list, tap **On hand** at the top (or press Esc); when
you leave On hand and come back, it opens on the whole list again. Type what to change in the box under the rounds ("make it every hour", "tell me
under ¥1,800"), or use **Pause** (an hour, until tomorrow morning, a week, or until you resume),
**Look now**, and **Stop**. A round never ends it: only you, or the goal you gave it.

## Groups

When you ask for one piece of work in several parts ("redo the sign-in page: first the form, then
the SMS code, then the tests, one after another"), your partner opens a task for each part and keeps
them together as a **group**: one card with the group's name, how far along it is ("1 of 3 done"),
and the parts in order.

Parts that work in the same folder run **one after another**: the next one waits **In line** and
starts by itself when the one before it is done, carrying on from its work. Parts that don't share
a folder run side by side.

- If a part needs you, its question is right inside the card.
- If a part doesn't work out, the card says so and waits for you: **Try part 2 again**, **Skip it,
  do part 3**, or **Drop the rest**.
- To put tasks together yourself, tell your partner ("put these together"), or select them and
  choose **Put in a group**.
- From the card's menu you can **Rename** it, choose **Run side by side**, or **Ungroup** it. The
  tasks always stay; anything still in line starts on its own.
