---
title: Past tasks and ongoing work
description: Find any task you had before, mark the ones you come back to, carry on with one, and pause or resume what runs on its own.
order: 2.6
---

# Past tasks and ongoing work

A task you finished doesn't disappear. On hand shows what is going on now; everything you had
before stays in **做过的事 / Past tasks**, ready to find and pick up again. Next to it,
**一直在跑的 / Ongoing** keeps what runs on its own: things you asked for every day or every week,
and tasks that keep looking for something.

## Opening it

- At the end of On hand, tap **做过的事 ›** (or **一直在跑的 n 件 ›**).
- In On hand's search, when nothing there matches, tap **在做过的事里找「…」** to look for the
  same words in every earlier task.
- In the Mac app: **做过的事… / Past Tasks…** in the menu, or ⌘Y. ⌘O, Open a task, offers it too.

## Finding a task

Type a few words. Ducter looks in what you said to the task, what it reported, the files it
touched, its branch and pull request, its project, which AI agent did it and when, and shows the
best match first, with a line saying where it matched (**你说过 / You said**, **它说过 / It said**,
**文件 / File**, **分支 / Branch**).

- Words in any order: `hawdb compaction`, `flaky 原因`, `picker.go`.
- A day: `上周二`, `yesterday`, `last week`, `11月10日`, `3 天前`. The days it took are shown under
  the field.
- The chips under the field narrow it: **标了星的 / Starred**, a project, an agent, one of your tags.

Without words, the list shows your starred tasks first, then today, yesterday, this week, last
week, this month and earlier months.

## Marking the ones you come back to

Hover a card (or open its ⋯ menu) and choose **标记 / Mark**:

- **改名字 / Rename:** give it a name you'll find it by. The new name shows everywhere, and the old
  title still finds it.
- **标星 / Star:** starred tasks come first.
- **标签 / Tags:** up to five words of your own, such as `raft` or `旅行`.
- **图案 / Picture:** one of ten small pictures of kinds of work, on one of six soft colours. Until
  you pick one, Ducter shows its own guess, pressed lightly into the card.

Your marks are kept on your home computer, so every device shows the same.

## Picking a task up again

- **接着做 / Continue:** the same task goes back to work and opens. If the AI agent still has its
  earlier session it carries on in it; if not, it starts again from the task's own saved progress
  and tells you so. If its working copy was cleaned up after a merge, it is put back from the
  branch. If it was on a computer that is away right now, Ducter says so.
- **换一个 agent 接着做 / Continue with another agent** (in ⋯): the same, with another AI agent; what
  the task had done goes over to it.
- **带着它开新任务 / New task from this** (in ⋯): New task opens at the same place with a chip that
  says the new task takes along what that one found (its reports, branch and the files it
  touched). Remove the chip to start fresh.
- Click the card to just look at the task.

Keys: `/` search, the arrow keys or j/k move, Enter opens, ⌘Enter continues, ⇧⌘Enter new task from this, `s`
stars, `r` renames, Esc clears and then goes back.

## Work you did yourself in your AI agents

If you have used Claude Code, Codex or pi on your home computer yourself, those conversations are
in Past tasks too, under **也在这台电脑上 / Also on this computer**, below Ducter's own tasks. The
same search finds them: by their name, what you asked, the folder or project, the branch, the AI
agent, or the day.

- **接着做 / Continue:** the conversation becomes a task and opens, with what was said earlier at
  the top. The same AI agent carries on that very conversation, in the folder it was in, as if you
  had picked it up again in your terminal. Nothing is copied: it works in that folder directly.
- **换一个 agent 接着做 / Continue with another agent** (in ⋯): another AI agent takes it over in the
  same folder, starting from what was said.
- **不再显示 … 的 / Don't show … here** (in ⋯): stops listing that AI agent's conversations. The last
  line of the section brings them back with **再显示 / Show again**.
- **这个文件夹别看了 / Leave this folder out** (in ⋯): that folder, and the folders inside it, are
  never read again. Settings › Partner lists it with **Show again**.

Ducter reads these only on your home computer and only when you open Past tasks: each
conversation's name, folder and time and your first and last words, with any key you pasted hidden.
They are never sent anywhere else. Turning off **Read what they keep** in Settings › Partner hides
the section and nothing is read. It never changes them; when you continue one, the AI agent adds to it as it
would if you had continued it yourself. A conversation whose folder is gone is shown, but can't be
continued. Conversations on your other computers are not listed yet.

## Ongoing: pause, resume, run now

Each card in **一直在跑的 / Ongoing** says when it runs next and shows its recent runs as small
pebbles: green for done, red for didn't work, yellow for "looked, nothing yet", an outline for
skipped. Tap a pebble to open that run.

- **暂停 / Pause:** for an hour, until tomorrow morning, for a week, or until you resume it. It
  comes back by itself at that time. Pausing a task that keeps looking keeps exactly what it was
  waiting for.
- **恢复 / Resume:** back on its schedule.
- **现在跑一次 / Run now** (or **现在就去看一次 / Check now**): once, right away, even while paused.
- **改时间 / Change when** (in ⋯): every day, weekdays, every week or every few hours, and the time.
- **结束 / End** (in ⋯): it stops for good; what it did stays in Past tasks.

To set up something that runs on its own, see [Waiting, keep going, routines](waiting-and-routines.md).
