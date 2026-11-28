---
title: Tasks
description: See every task at a glance, by project and by what needs you, find one fast, and act on several at once, with the keyboard if you have one.
order: 2.5
---

# Tasks

**Tasks** (任务) lists everything your partner is doing for you. Open it from the button
in the conversation's header, or press ⌘2. It always opens on the whole list.

## Getting to what needs you

Wherever you see how many things need you, tap the number: "2 need you" under your partner's name,
the small number on a partner's face, or the line **2 waiting on you ›** just above where you type
(shown while what waits is out of sight). It takes you straight to the first one: a question your
partner asked scrolls into view in the conversation; anything else opens Tasks with that task
picked out and briefly lit up. Tap again for the next one; after the last, it starts over.

The way back is always at the top: **Conversation / Tasks / …** on a Mac or a wide screen, **‹**
on a phone. Esc goes back one step.

## What you see

At the top is your partner, with one short line: whether anything needs you, and if not, what
comes next: "Nothing needs you. I'm on it." while work is under way, or "Nothing needs you. The
first is back at 22:40." when everything waits. If a task has stopped and nothing will start it
again on its own, the line says so: "One has stopped and needs a look." A task that didn't work
out is said as it is, "One didn't work out.", and a mix names both.

Its pose tells you the same at a glance: a little flag when something needs you, reading while
work is under way, resting on its bench while everything waits, smiling when the day's work came
back done.

A task is under **Working** only while it is really working. When it has asked you something, or
was told to wait for your answer, it is under **Needs you** with the question, until your answer
reaches the task. One that stopped with nothing still running is a stopped task (below), never
**Working**.

A row says what the task itself said, in one short line in your language. Until that line is ready,
the task's own words are shown muted behind **It said:**, so they are never your partner speaking.
A task that stopped never asks the old bare "Should this task stop?"; it says how long it has been
stopped and that it did not say what it waits for, with **Continue** and **Put down** beside it.
When several things stand on one pull request, it appears once, under the thing that holds it; the
others are quiet facts on that row (**By …**, **Review: …**, **Handed to …**), each on its own.

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

The number on your partner's face, on the app's icon and at the top of Tasks is the same number:
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

When no computer can read GitHub for a task (no `gh` there, or it is signed out), its row says so
after half an hour, with the fix: install `gh` on that computer, or read it on your home.

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

When a finished task's pull request isn't needed any more (say it's a duplicate of work that
already merged), end the task. Tell it in its own box, "can this be closed?", and it ends itself,
saying what becomes of each open pull request. Or open the task, choose **⋯** › **End task**, and
confirm on the line that appears. Ducter stops following that pull request, and the task leaves
**Waiting**. The pull request stays open on GitHub and reads **Duplicate draft, can be closed** or
**No longer followed, can be closed**. Nothing is closed on GitHub unless you ask for that. A finished task's **⋯** on **Tasks** offers **End task** too, and a pull request a helper you set up is following has **Stop following** under **⋯** and on its page.

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

### List: every task as one row

Once you have eight tasks or more, the top of Tasks offers **Overview** and **List**. Overview is
the calm board you know. **List** shows every task as one line, so forty tasks fit on a screen:

- what state it's in, its title, its project, the computer it runs on, the AI agent doing it, how
  long it has been in that state, its last step, and its pull request and CI checks;
- a last step that starts with **It said:** in grey is the task's own words, before Ducter has
  put them in a line for you;
- **State**, **Project**, **Computer**, **AI agent** and **From** narrow the list, and the sort
  puts it **By urgency** (what needs you first), **By last change** or **By age**.

Your choice stays on this device; List never turns itself on. With fewer than eight tasks you
won't see any of this.

**Save as view** keeps the filters and the order with a name you give. Saved views show under
your projects as **Views**, on every device you use. Three are there already, whenever they have
something in them: **Needs me today**, **Running long** (working for over six hours) and **PRs
waiting**.

**Several at once.** Press **x** on a row, or **⌘-click** rows, to pick them; **⇧-click** or
**⇧** with the arrow keys picks a run of rows and **⌘A** picks every row the list shows. A bar at the bottom
offers **End**, **Pause**, **Continue**, **Move to…** (another computer), **Reassign…** (another
AI agent) and **Put down**. Whatever you press, it asks first and says what will happen, for
example "Of 8, 2 are working; they stop when this round ends." A task that is working finishes
its current round before it ends. After **Do it**, **Undo** is there for ten seconds.

The keys, shown at the foot of the list: **j** / **k** move, **Enter** opens, **Esc** steps back,
**/** finds, **g p** shows only this row's project and **g s** its state, **e** ends, **p**
pauses, **m** moves, **a** reassigns and **⌘ Delete** puts down. On a Mac, **⌘2** on Tasks goes to
the list and **⌘1** comes back to the overview. On a phone each task is a two-line row.

### Projects

A project is a repository, not a folder. However many folders and computers hold one repository,
its tasks stand together under one name: the repository's own short name, like **mem** or
**nowledge-labs-website**. A folder that isn't a repository is its own project, with its folder's
name. A folder inside another repository (a website inside a bigger checkout) is its own project.
There's nothing to set up. Once there are two or more, the projects appear: on a wide window as a
column on the left, otherwise as a row of names above the list. Each one shows its name on one line (a long one is cut in the middle, with the whole
name on hover), where it lives when you have more than one computer, and how many tasks it has; the
number turns to the needs-you colour when something there needs you. Projects with something that
needs you come first, then the ones active most recently; pinned ones stay on top, and once you drag
them into your own order that order wins. A project row's computers stay on one line: if they don't
all fit, it says **+N** and the whole list is in its tooltip. A task that couldn't start because its folder
isn't on that computer doesn't make a project of its own; it stays under **All**, where its fix is.
Pick one to see only its tasks; **All** shows everything again. Under a project, **+** starts a new
task in its folder.

**Not in a project** holds the work that belongs to no folder; **On your computers** holds the
errands and machine set-ups. **From** (GitHub, Obsidian and so on) is a filter over any project,
not a project of its own.

The project row's **⋯** changes how it is shown, and every change can be undone there: **Rename**,
**Merge into…** (for two repositories you count as one, such as a fork), **Hide** (its tasks still
count under **All** and when something there needs you, the project shows again), and **Pin**.
Drag a project to put it in your order; the order is kept on the home, so every device sees it.

**+ Add a folder**, at the foot of the column (or **+** at the end of the row of names), makes a
project from a folder on any of your computers. Pick the computer first (each is shown as a small
picture, with whether it's awake), then find the folder: the path at the top steps back a level
when you tap a part of it, and typing narrows the list or, starting with **/** or **~**, goes
straight to a path. With a keyboard, the **up and down arrows** move, **Return** goes in, **Command-up** goes up a
level and **⌘Return** adds. The button says what it will do, like **Add hawdb on Hetzner
Server**. The new project appears in the column, ready for its first task.

With one errand in Tasks, all of this stays out of the way: one row, and four small numbers.
**Find a task…** appears once you have ten things in Tasks.

## Talking to a task yourself

Open any task and type in the box under it: your words go to the AI agent doing that task, exactly
as you wrote them, and its answer appears right under your message, in full. The steps it took to
answer fold into one line you can open; what it says to you never folds away.

- **While it works**, your message reaches it at its next step; under your message you see **It'll
  see this at its next step**, then **Seen**. To wait until it's done instead, choose **After this
  turn** from the send button's menu.
- **When it's finished**, you can still ask it something or give it one more thing to do. A
  question it answers leaves the task as it was: still done, still waiting for your answer, still
  waiting on its check.
- **Your partner stays out of it.** What you and the task say to each other stays in the task; your
  partner doesn't repeat it in your conversation. If the task finishes while you're talking to it,
  you already see that in the task: its card says **Done**, and nothing more comes to your
  conversation. If finishing needs your decision (to merge it, say), its question waits for you as
  usual. Your partner still tells you when the task gets stuck or fails.

## On a Mac, an iPad with a keyboard, or a browser

- **j** and **k**, or the arrow keys, move through the list. **Enter** opens the selected task.
- **/** jumps to Find. **Esc** clears what you typed, then the number you picked.
- **⌘O** opens any task by a few words of its title. If nothing matches, Enter starts a new task
  with those words.
- A finished task with a branch and no pull request has **Merge into main** and **Open draft PR**
  in its **⋯**. **Pause** shows when you hover over a task at work. What shows on hover never
  covers the row's time. Pointing at a title shows the whole title only when the row had to
  shorten it.
- On Tasks at full screen, **⌘-click** or **⇧-click** selects several tasks (or press **x**
  on a selected row). A bar at the bottom then offers what fits them: merge them, open draft
  PRs, pause them, or cancel them. Cancel asks you first.
- On a wide window, opening a task keeps the list beside it, on the left, with the open task
  marked; if you picked a project, the list stays on that project. **⌘⇧]** and **⌘⇧[** open
  the next task and the one before, even while you're typing (on the Mac they're also in the
  View menu as **Next Task** and **Previous Task**). **j** and **k** do the same when you
  aren't typing. The open task's bar says where it is in the list (**3 / 9**), with a step to the
  one before and after. **⌃1** to **⌃9** open the first to ninth task in Tasks. **⌘/** lists every
  key. **⌘⇧D** makes an open task **Compact** (your partner's picture small beside the title,
  more of the work on screen) and back. If you open the **Workbench** and the window is too narrow for all three, the
  Workbench takes the list's place until you close it. The Workbench belongs to the task you
  opened it in: the next task you open starts at its conversation, with the list back beside it.
- In the list beside a task, something under **Looking after** that runs in rounds opens its own page, with
  the others under Looking after at its left. On a touch screen, a tap anywhere on a row opens it.
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

Tasks says it too: a task at work with jobs still running shows **3 running in the
background** in its row.

## At a glance

You don't have to open Ducter to know how things stand.

- **On a Mac**, your partner sits in the menu bar as a small pebble. Its eyes look down while
  something is at work. When something needs you, a small orange dot appears beside it. It never
  shows a number. Click it for the same one sentence Tasks starts with, what needs you (answer
  **Go** or **Hold** right there, or **Open the Task**), and **Open Ducter**. If you'd rather not
  have it, choose **Don't Show in the Menu Bar**; turn it back on in Settings › Look and sound ›
  **Show in the menu bar**.
- **Beside your work, on a Mac**, keep your partner in a **mini window** that floats over your
  editor or browser, on every desktop. Press **⌃⌥⌘Space** anywhere, or choose **Mini Window** in
  the menu bar pebble's menu or in View (if another app already uses those keys, the menu item says
  so, and the menu is the way to it). It shows your partner, one line (what it's doing while
  you wait, what it just said, or what needs you), how many things need you (click to see them in
  Tasks), and a field to say something or hold to talk. It never takes the keyboard from what
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
and puts a card under it: when it runs, when it tells you, until when, and **Open**, **Edit**, **Undo**.

Each one is a card under **Looking after**. Its lantern is lit while it is on and dim while paused.
Its head says when it ends, how many rounds it has run and how long it has been going ("#11230 merges, round 5, running for 40 minutes"); when your words gave no end it says **No end was given**, and
**Change the end** on its page is where you add one. The tasks at work on it are listed under it;
one that needs you (a question, a pull request ready to merge) is under **Needs you** instead, with
its name, and the card only says how many wait.

When nothing has changed for six rounds, it asks once under **Needs you**: **End** (the default
after a day), **Six more rounds**, or **Change the end**. A pause Ducter itself makes — the month's
usage is used up — is the same kind of ask, in words and with the number ("This month's usage is
used up (20M). Raise it?"), never a code.

Tap a card to open its page: what you said, what waits for you (answered right there), what it holds
(each pull request with its own title and checks), every round (newest first, each in one plain line
of what happened; **Details** shows what the task reported; the quiet ones fold into one line),
and **How it runs**. To go back to the whole list, tap **Tasks** at the top (or press Esc); when
you leave Tasks and come back, it opens on the whole list again. Type what to change in the box under the rounds ("make it every hour", "tell me
under ¥1,800"), or use **Pause** (an hour, until tomorrow morning, a week, or until you resume),
**Run now**, and, last, **End**, which asks once and ends it for good. To change one rule yourself, tap it under **How it runs**. A round never ends it by itself: it ends when the end you gave it can be read and holds, or when you end it. "Stop looking" ends it; **Pause** is only for a while.

To give a helper one more piece of work, say so: "hand mem#11393 to the PR Babysitter: review it, /lgtm if it's fine". Your tasks can hand it work too, once their pull request is ready. When a task handed it over, that task keeps one quiet line under its last report: 交给 {helper}，等它接手, then {helper} 接手了, then what came of it. The helper's page groups what it holds in one card: 等接手 first, then 在做, then 退回了 or 没接. A 等接手 row has 让它现在接 and 不用跟了; after 不用跟了, the sending task's line says 不用 {helper} 跟了. It shows up there as soon as one of its tasks takes it, and only then does your partner say the helper is on it; until then it says the work is handed over and waiting to be taken. If nothing takes it within ten minutes, your partner says so once and offers to do it directly. Handing the same item over again adds what is new to that one piece of work; it never becomes two. If the helper can't take it, the reason goes back to whoever handed it over, where it came from. Something you add from now on ("the Babysitter owns each PR to the end") reaches the work the helper already holds, at once.

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
