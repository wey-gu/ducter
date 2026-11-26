---
title: Past tasks and ongoing work
description: Find any task you had before and anything Ducter made for you, mark the ones you come back to, carry on with one, and pause or resume what runs on its own.
order: 2.6
---

# Past tasks and ongoing work

A task you finished doesn't disappear. Tasks shows what is going on now; everything you had
before stays in **做过的事 / Past tasks**, ready to find and pick up again; what it made for you is
in **给你做的 / Made for you**. Next to them,
**看守中 / Looking after** keeps what runs on its own: things you asked for every day or every week,
and tasks that keep looking for something.

## Opening it

- At the end of Tasks, tap **做过的事 ›** (or **看守中 n 个 ›**).
- In Tasks' search, when nothing there matches, tap **在做过的事里找「…」** to look for the
  same words in every earlier task.
- In the Mac app: **做过的事… / Past Tasks…** in the menu, or ⌘Y.
- Anywhere, on the Mac or in a browser: press ⌘K (Ctrl+K), **找什么都行 / Find anything**, and type a
  few words. It finds what is in Tasks, every earlier task, what Ducter made for you and your own
  sessions, and goes to any page. Enter opens the one under the keys, ⌘Enter carries it on. Its
  last two lines say the words to Ducter, or start a new task with them. ⌘O opens it too. On a
  wide screen, where the task under the keys stopped shows beside the list (how it ended or what
  it is doing, what it asks you, its changes and its last steps) before you press Enter.
- You don't have to type it exactly: a word with one letter off still finds it, and so do the
  first letters of a title's words (**wgc** for "WAL group commit").

## Finding a task

Type a few words. Ducter looks in what you said to the task, what it reported, the files it
touched, its branch and pull request, its project, which AI agent did it and when, and shows the
best match first, with a line saying where it matched (**你说过 / You said**, **它说过 / It said**,
**文件 / File**, **分支 / Branch**).

- Words in any order: `hawdb compaction`, `flaky 原因`, `picker.go`.
- A day: `上周二`, `yesterday`, `last week`, `11月10日`, `3 天前`. The days it took are shown under
  the field.
- The chips under the field narrow it: **标了星的 / Starred**, a project, an agent, one of your tags,
  the computer it ran on, and how it ended (**做完了 / Done**, **没做成 / Didn't work**,
  **取消了 / Cancelled**, **还在做 / Still going**).

## Where it stopped

On a wide screen, the task you select (click it once, or move to it with the arrow keys) shows
beside the list in **停在哪儿 / Where it stopped**: how it ended, its last words, what it is asking
you, what it changed and its pull request, and its steps: what you (or Ducter for you) asked it,
one step at a time, with what came of each. On a phone, tap a card to see the same. Double-click,
Enter or **打开 / Open** opens the task itself.

Without words, the list shows your starred tasks first, then today, yesterday, this week, last
week, this month and earlier months.

## What Ducter made for you

The files, pictures, tables and links Ducter made for you are in the middle tab,
**给你做的 / Made for you**: a PDF a task filled in, a screenshot of a booking page, a document it
wrote, a table or a list from the conversation, a pull request it opened. You don't need to
remember which task made it.

- **Just ask.** "找一下上周做的那个行程表", "send me the PDF you made for the visa again": Ducter
  finds it and puts the file itself (or the table) under its answer. When nothing matches, it says
  so; it never hands you something else in its place.
- **Or look.** Type a name, a kind or a day (`PDF`, `表格`, `截图`, `上周`), or tap a kind
  (**文件 / Files**, **图片 / Pictures**, **表格 / Tables**, **清单 / Lists**, **链接 / Links**).
  Tap one to open it: a file or picture opens in the viewer, a table opens in place, a link in the
  browser. **看那个任务 / See the task** opens the task that made it.

A file a task wrote on another computer opens only while that computer is reachable; if it was
moved or deleted since, Ducter says so and can make it again.

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
  and tells you so. If its working copy was tidied away (after a merge, a few days after it
  finished, or a week after you cancelled it), the task says 工作副本已整理，接着做会重新拉一份 /
  Its working copy was tidied away; Continue makes a fresh one, and Continue puts it back from the
  branch without asking. If it was on a computer that is away right now, Ducter says so.
- **换一个 agent 接着做 / Continue with another agent** (in ⋯): the same, with another AI agent; what
  the task had done goes over to it.
- **带着它开新任务 / New task from this** (in ⋯): New task opens at the same place with a chip that
  says the new task takes along what that one found (its reports, branch and the files it
  touched). Remove the chip to start fresh.
- **从这一步开新任务 / New task from this step:** point at a step in **停在哪儿 / Where it stopped**
  (or choose **从某一步开新任务… / New task from a step…**). A new task does that step again, with
  everything before it, and the same or another AI agent. Its words are already filled in, so you
  can change them first. For code, it starts from how the code was just before that step (its
  last commit then); what came after stays in the original. The original task isn't changed.
- Click the card to just look at the task (on a wide screen: double-click).

You can also just say it: "接着上周那个 compaction 的 PR", "我上个月在 haswell 上那个 Rust 构建的", "try the
WAL one again from step 3 with Codex". Ducter finds the task, says which one it picked, and carries
it on, or starts the new one from that step. When two fit, it asks which.

You can also just say it in the conversation. When you follow up on something Ducter just did for
you ("那汉庭贵多少？再看看机票", "make it configurable too"), it carries on the same task: the same
signed-in browser, the same branch and files, the same AI agent, and what it already found. The
task shows under your new message, and Tasks keeps one card for it. An earlier one works too:
"接着昨天那个 compaction 的活" / "carry on with yesterday's compaction change". Something new
gets a task of its own; if you want a fresh start on the same thing, say so ("开个新的" / "start a
new one"). If the next step needs another of your computers, say which ("在 MacBook 上接着"), or just ask
for your own account ("用我的携程账号看"): when only that computer's Chrome is signed in, the same
task moves there with what it found and carries on, and Ducter says where. Ducter never moves a
code task to another computer without asking you first.

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

You can also ask in the conversation: "接着我终端里那个 Claude 在做的，把测试补上" / "carry on what
Claude was doing in my terminal". Ducter looks for it the same way (the newest one, unless your
words point to another; if two could be it, it asks which) and carries it on, with what you asked
for next. The first time, it tells you in one line what it looked at. It only looks when you ask.

If you ran it on another of your computers that does tasks for Ducter (say your MacBook, while
Ducter lives on a server), Ducter looks there too once you say yes on that computer's card in
**你的设备 / Your devices**: **读它们留下的记录 / Read what they keep**. Until then it only knows which
AI agents you used there and when, and if that is likely where your conversation is, it asks you
for that yes in one line. The yes stays on that computer; **别再看了 / Stop looking** on the same
card takes it back. A conversation found there is carried on there, in its own folder.

A conversation that is still open in your terminal is never carried on, since both would write to
it at once: close it there first (`/exit`), then ask again. One your AI agent wrote to a moment ago
gets the same reminder once; ask again once it is closed.

Ducter reads these only on the computer they are on, and only when you open Past tasks or ask for one: each
conversation's name, folder and time and your first and last words, with any key you pasted hidden.
They are never sent anywhere else. Turning off **Read what they keep** in Settings › Partner hides
the section and nothing is read. It never changes them; when you continue one, the AI agent adds to it as it
would if you had continued it yourself. A conversation whose folder is gone is shown, but can't be
continued. Conversations on your other computers are found when you ask in the conversation (after
your yes on that computer), but are not listed in Past tasks yet.

## Looking after: pause, resume, run now

Each card in **看守中 / Looking after** says when it runs next and shows its recent runs as small
pebbles: green for done, red for didn't work, yellow for "looked, nothing yet", an outline for
skipped. Tap a pebble to open that run.

- **暂停 / Pause:** for an hour, until tomorrow morning, for a week, or until you resume it. It
  comes back by itself at that time. Pausing a task that keeps looking keeps exactly what it was
  waiting for.
- **恢复 / Resume:** back on its schedule.
- **立即运行 / Run now**: once, right away, even while paused.
- **改时间 / Change when** (in ⋯): every day, weekdays, every week or every few hours, and the time.
- **结束 / End** (in ⋯): it stops for good; what it did stays in Past tasks.

To set up something that runs on its own, see [Waiting, keep going, routines](waiting-and-routines.md).
