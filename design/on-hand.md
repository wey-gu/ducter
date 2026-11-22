# On hand (手头的事): the conductor surface

How On hand lets one person take in 3 or 50 tasks at a glance and step into any of them. Decided
in D216 (one list), D244 (the rail beside an opened task), D261 (projects as a lens, the strip,
the folds), D287 (the partner at its head, the work as cards) and D315 (one short line, the strip of what is
there, headings with character; the review below), and D467 (the board by attention in one card
shape: what stopped needs you, today is today, a source is one summary card, no day beside it).
Words are the glossary's (`product-model.md`); the visuals are Pebble's (`ui.md`).

## The two axes

| Axis | What it answers | How it is shown | Kept |
|---|---|---|---|
| **Project** (lens) | Which part of my life or work is moving? | A column at the left of the board (Mac ≥ 1100 pt, web ≥ 1120 px); a row of names when narrower and on the phone | Per device (`OnHandLens` on the Mac, `ducter.onhand.lens` on the web) |
| **State** (filter) | What needs me, what works, what waits, what got done? | The strip: four counts, each a filter; the board's sections | Not kept: Esc or a second press lets go |

A task's project is its `project`, else its folder's name, else **其他 / Other**. Nothing is set
up: the column shows from two groups. Projects added by hand (D186) show before their first task.
What belongs to no task (the partner's own asks, task-less waits, calls) shows under All and Other.

## The project column

`全部 / All`, each project in the order its most urgent task comes, then Other. A row:

- the name (Other in muted ink);
- D455: with two or more computers, under it every computer the project lives on (where its tasks
  ran, its routines start and it was added; one origin on two computers is one project), home
  first, each its own small word, read aloud **在 {computers} 上 / on {computers}**;
- under it the unmerged **+a −d** of its tasks' branches, only where there are branches;
- one status place: D467 round 3: the partner's face only where something there needs you (a
  question, a wait that stopped, a task that didn't work out), D244's art, never a dot (D69);
  otherwise nothing;
- its count.

The chosen row is the knob (D270: the card's white on its clay ledge). Opening a task turns the board into the rail (D244), narrowed by the
same lens, whose head names it and goes back. The column never stands beside the rail.

At its foot, **＋ 添加文件夹 / Add a folder** (on the phone and the narrow web, a **＋** at the end
of the lens row) opens D455's sheet: **在哪台电脑上 / On which computer** first (chips; the
computer of the newest task with a folder already chosen), then **选已有的文件夹 / Choose a
folder** (that computer's folders, looked through by that computer: **最近 / Recent** first, a
field **输入名字筛选，或输入路径 / Type to filter, or type a path**, each repo with its origin,
**添加 {name} / Add {name}**), **从 Git 地址克隆 / Clone from a Git address** or **新建文件夹 /
New folder** (D272's panels), **取消 / Cancel**. Added, the sheet closes on that project's lens.
Never this Mac's picker for another computer; on the Mac, **用访达选… / Pick in Finder…** for this
Mac's own folders. Details: `new-task.md` (Adding a folder anywhere, D272, D455).

D457 brings the sheet to the clay bar: each computer a small clay tile (its drawn device, its name,
one state word: **{name} 在这台上 / {name} runs here** for the home, else **醒着 / Awake** or
**睡着了 / Asleep**), home first, the chosen one on an ink ledge; the ways one segmented track; the
browser an instrument: the breadcrumb (`~ / code / hawdb`, each part a step back), ↑↓ ⏎ ⌘↑ ⌘⏎
said once at the foot in drawn caps, rows with a repo's mark in the accent's tint, its origin, a
recent one's last use and **已添加 / Added**; an empty, missing or away folder each says the way
on (**回到 {where} / Back to {where}**, **换到 {home} / Use {home} instead**); the button reads
**添加 {name}（{computer} 上）/ Add {name} on {computer}**, and at the home folder, where nothing
can be added, **进到一个文件夹里，再添加它 / Go into a folder to add it** in place of a greyed
button. Added, the project's row rises into the column with an accent ring that fades (1.8 s;
none under Reduce Motion), and a project with nothing yet says **在 {name} 里开个任务 / Start a
task in {name}** where the bare ＋ stood.

## The board

1. D287, D467 (rev.): **the partner's brief** at the head, always: its clay figure (88; 56 in the
   side pane and on the phone) in the pose for the whole (its flag when anything needs you > reading while anything
   works > on its bench while all waits > smiling when what is left came back done > idle), and
   D315: **one short line** in its voice (`onhand.line.*`, the display face 22/700) that says what
   the strip can't: **有 n 个要你定。** when anything needs you (D467: when all of it stopped or didn't work
   out, **有一个停下了，要你看一眼。 / One has stopped and needs a look.**, several **有 n 个停下了，要你看一眼。**);
   else **没有要你定的，我在做。**
   while anything works; else, when all waits, **没有要你定的。最早 9:06 回来。** (one wait:
   **在等的那个 9:06 回来。**; none coming back on its own: **在等的都没有新动静。**); else
   **今天就这些，都做完了。** or **手上没有事。** It never repeats a count. The long sentence (`headSay`, D287) stays
   the menu bar's. Under the lead, up to three labelled lines in its voice (label 13/700 muted, text
   15): **刚才 / Since you looked** (new results since this device last looked: **「…」做完了。**, two,
   or **「…」等 n 个做完了。**, the first one's PR chip beside it); **等你 / Needs you**, one line for
   each of the first two that stopped or didn't work out, its fix as buttons (a phone task:
   **「…」停在手机上：要你在那台手机上重新允许访问。** with **允许好了，接着做 / Allowed, carry on**;
   another: **「…」停下了：{its report's first sentence}** with 接着做 / 放下; a failure: **「…」没做成：…**
   with 再试一次 / 看看为什么), and with questions **下面有 n 个问题等你一句话。**; **接下来 / Next**:
   **「…」6:58 回来。** (**之后还有 n 个**; a wait on a limit's reset is said by its own group, D297);
   with nothing needing you, nothing at work and nothing coming back, **我在这儿，有新的事会告诉你。**
   Round 4: every stuck kind says its real fix, the same in the brief and on a card the brief has no
   room for: couldn't start (the cant line and its fixes), its agent signed out on its computer
   (**重新登录**, D363's sign-in there), a computer gone away for half an hour (**「…」在等 Mac mini
   连上：上次在线是 2 小时前。打开那台电脑，它就接着做。**; no wake exists), the person's Mac without its
   two switches (**在那台 Mac 上打开指引**), a phone, a plain failure; a limit used up is a 接下来 line
   (**到点自动接着做**, with **现在换 Codex 接着做** when another agent can take it). The forecast band is
   gone. Round 3: what the brief tells (the results it names, the stopped and failed it carries, the next
   wait) is never also a card and is not walked; a section left with nothing has no heading
   (今天做完 can be only its yesterday fold); the brief names a stopped or failed task in a short form
   (12 Han or 28 Latin characters, the whole on hover), its buttons on the same line when they fit.
2. D467 (rev.): no strip of counts and no counts on the sections (the brief and the cards say how
   much); the filter it gave is gone, Find and the lens narrow. Under the brief, on its own row, under
   a project **在这儿新建 / New task here**; Find from ten.
3. 接下来 / Next, the forecast line (D127), when two or more things are
   coming, and D315: something needs you (otherwise the line under the partner already says when
   the first is back, and each card its own). Its times are each wait's next look, as the cards'.
4. Sections by attention (D467): 等你, 在做, 在等, 今天做完. 等你 answers in place (decision cards),
   then what **stopped** (a wait nothing brings back on its own: no waiter of any kind, not a
   question put off, not a computer that will come back, quiet for 30 minutes or more) with
   **接着做 / Continue** and **放下 / Put down** always shown and **上次有动静是 {ago}**, then what
   didn't work out with **再试一次 / Try again** and D454's × and ⋯. 在做 cards. 在等: fresh cards, task-less
   waits, then the quiet ones; D382: a question put off with **晚点再问我 / Ask me later** stands
   here, out of 等你 and its count, its line **{time} 再问你：{question} / Asking again {time}:
   {question}** with **现在就定 / Decide now** (on hover on a wide screen; the opened card always),
   until its time puts it back in 等你 (no default runs on it there until it is seen). 今天做完 (D467:
   finished on today's date, a done still being checked too): new results, then the seen ones;
   what finished before today folds under **还有 n 个是昨天做完的 / n more done yesterday**, closed by
   default. Its count is D310's one number. One reading
   column (760; 840 beside the peek). D467 (rev.): a section's name is a quiet label (13/700, muted,
   a little tracking), no count: the scale is brief > card title > section label > meta. 在等
   opens with **the time axis**: now (the accent bead and the clock) to the last wait back within
   12 h, each wait a hollow bead at its return with its time under it (the old day, D287, inside the
   section it belongs to), only from two waits (one is already the brief's 接下来). State is said by the small glyph or
   face, never a bar at the edge.
5. D467: **one card shape** for every task, one under another at the list's width (below); only the
   rail beside an opened task stays rows.
6. D467: nothing beside the board. D287's day column (接下来, 现在, 今天回来的) said the column again
   and is gone; the forecast line (3) carries what comes next.

### The card (D467)

Every task on the board is one card: white on a 2-pt clay ledge (the needs-you ledge for what
stopped or didn't work out), radius 16, the list's full width, at least 64 high (52 in D457's
compact density), hover lifts 1 pt, the card under the keys has the accent outline. Never two to a
row, never a tinted fill, never the agent's brand coin or the partner's face: who does it is a
detail, on hover and in the task.

| Part | What it shows |
|---|---|
| State mark | A 32-pt sunk round with a group part's glyph: a flag (needs you, stopped), three soft bars (working), the D279 ring filling toward its next look (waiting), a tick (a new result; quiet once seen), a cross (didn't work out) |
| Subject | The short title (15/600, one line, the whole on hover; a seen result's recedes to soft ink), then where: its project when the board shows them all (never 其他 / Other), its computer when it isn't the one most tasks run on; each its own element. +a −d and 草稿 PR / 已合并 at the end |
| Living line | What it is on now (D210's latest step or the agent's words, held by D425's dwell, up to two lines); what it waits for (D467 rev.: never the title's words again: then the report's first line, else its look); why it stopped (two lines, in the needs-you ink); what came of it |
| Trail (working) | D467 (rev.): under the living line, its steps placed on its elapsed time as ticks (an errored one in the failed ink), the head at now breathing (1.6 s; still under reduced motion and when the board rests, D425), then **n 步 / n steps** and **上一步 {ago} / last step {ago}**, each its own element. The client asks once for a working task's history so the trail is whole after a reconnect |
| Outcome (done) | D467 (rev.): what it made, to open: a PR chip (GitHub's mark, **#1190**) from the report's evidence, the merge or draft PR, or `PR #n` in a repo task's result |
| Right end | The heartbeat in words (**在做 12 分钟**, **22:40 回来**, **14:10 做完**) or its one action: **接着做** and **放下** for what stopped, **再试一次** for what didn't work out, **现在看一次** for a quiet wait that looks; on hover Merge / draft PR, Pause, D454's × and ⋯ |

A new result pops once the first time it is drawn (D313). Round 3, one sign of progress per level:
a working card's mark stands still (its trail moves); a group (D360) is the same card with its name
at the head (no mark, no beads) and a **track** of its parts under it (done, at work breathing,
needing you, didn't work, in line); a part at work has no glyph of its own, only its living line and
its trail. A trail joins steps closer than 6 pt into one span, so a busy stretch reads as rhythm.

### The peek (D467 rev.)

From 1280 (Mac pt, web px), a clay card 360 wide beside the list sits in on the focused task (the
keys' focus; else the first at work; else the first in the walk): its mark, title (16/700) and
where, its heartbeat, the living line in full, its trail, **最近几步 / Latest steps** (the last six
steps in its own words, newest last and in ink), a PR chip when done, and **打开任务 / Open the
task**. Arrows and j/k move it; Enter opens; hovering a card doesn't move it. Round 4: its picture
from what exists: the phone view's last frame this device held (D248) under **上次看到的画面 / Last
seen**, and **看它用手机 / Watch the phone** or **查看浏览器 / Watch it browse** into the live views.
Owed: a live picture inside the peek (a second live stream per client).

### Folds

| Fold | What goes in | Line | Opens |
|---|---|---|---|
| Quiet waits | A waiting task that still looks on its own, whose card and looks haven't changed for 24 h (D467: one with nothing to bring it back has stopped and stands in 等你) | 还有 n 个，一天多没有动静 / n more, quiet for over a day | Tap (this session), Find, or 在等 in the strip |
| Seen results | Done today that isn't a new result, missed waits, ended calls | 还有 n 个，你都看过了 / n more you've seen | Tap (kept per device), Find, or 今天做完 in the strip |
| Yesterday (D467) | Finished before today, still in the home's day window | 还有 n 个是昨天做完的 / n more done yesterday | Tap (this session), Find; from one |

| Your to-dos (D357) | Open to-dos in the person's own apps beyond the three shown | 还有 n 个 / n more | Tap (this session), or a count in Settings › 待办来源 |

What needs you never folds. Folded cards are not in the keys' walk. D287: a fold folds from three;
one or two stay in sight under a quiet caption (**一天多没有动静 / Quiet for over a day**, **你看过的 /
Seen**).

D357, D467: after 今天做完, while a to-do source is on and something is open there, **GitHub 上标给你的 /
Assigned to you on GitHub** (a vault: **{vault} 里的待办**; several: **你的待办 / Your to-dos**) as a
quiet label like the sections'. Under it, with a sort (D359), **one summary card** of the board's shape: the
app's mark where a task has its state mark, D467 (rev.) one offer in the partner's voice (**里面有 236
个我现在就能做，交给我就开始。 / 236 of them I can take on now; hand them over and I'll start.**; with
none to hand over, the first of the others), **n 个 PR 等你 review** apart, and its one action
**交给{name}** (D385's sheet). Before a sort the card says **让{name}一个个看过，分出能交给它做的、要你定的、也许能关的。** with **理一理 / Sort them**;
while it sorts, **正在一个个看…** and its count. Under the card, **看看全部 {n} 个 / See all {n}**
(this session; **收起 / Hide**) opens the whole sort behind it: **the pile** (D359: the partner in
clay beside a stack whose height is the count's bucket, at most 88 wide, the count at heading size,
**今天替你清掉 n 个**, **在做 n 个** and **排着 n 个** apart, the sort's groups as rows with their one
button, **可以先放着的**, **还没细看的** and **已经在做的** as quiet rows, **{ago}理过** with **再理一遍**),
then at most three to-dos as cards of the board's shape, one to a row (a PR waiting for review, a
mention, a line due soon, the newest; each opens in its app and offers **交给{name}**, a review request
**在 GitHub 里打开**, a pre-read **我看过了** with its counts), then **还有 n 个 / n more** (opened in
place, Find, chips on a sunk track, pages of 30; `task-sources.md` §6). Without a sort (a vault,
several sources) the few cards and the fold stand without the summary. Nothing shows for someone with
no source, under a project's lens, with a filter on, or while finding. The source counts as something
on hand (the empty state doesn't show over it). Sheets and their Go: `task-sources.md` §9.

## Groups (D360)

Several tasks that are one piece of work (登录页重做 in three tasks) stand as **one card** in the state
section of their most urgent part; a stopped line stands in 等你 and counts as one thing that needs
you. The partner makes a group when it splits a request (`task_open` `group`) or when the person says
"把这几件放一起" (`task_group`); on the web the selection bar offers **放进一个分组 / Put in a group**.
Nothing is filed by hand first. A group shows from two parts; counts stay per task; while finding,
and in the rail beside an opened task, its tasks are rows of their own.

The card (D430: no counter noun, no 件 and no "part"): the group's name (display face 15/800), beads one
per part and, only while something is done and something is left, the conversation's count **好了 {k}
个，还有 {m} 个 / {k} done, {m} to go** (a part that didn't work out counts in neither; the beads say the
rest); its menu (⋯ on the web, right-click on the Mac: **改名**, **改成同时做 / 改成一个做完接下一个**,
**取消分组（任务都留着）**); then the parts on a thread, each with a quiet order number (not spoken),
its mark (a tick, three working bars, a flag, a ring, a cross, a dashed ring for **排着**), its name and
its right-hand words (the card's heartbeat words). A part's name is the person's own words when it
does one line of their message (D426), else its task's title. A part that needs you shows its question
inside the card. More than three parts fold to what is live and the next in line (**还有 {n} 个 / {n}
more**). Under the parts: **一个做完接下一个 / One after another** (or **同时做**) while something is
held; a stopped line instead names the parts by their words: **「{ended}」没做成，「{next}」在等你决定。**
(several waiting: **「{ended}」没做成，后面的都在等你决定。**; **放下了** for one put down) with **再试一次 /
Try it again**, **不管它，往下做 / Skip it, go on** and **后面的不做了 / Drop the rest**. A held part offers
**提前** on hover.

The line (core `task-groups.ts`): parts in the same folder on the same computer run one after another;
a later one is held by the home (no task, no agent) and opens when the part before it is done (its
result back) from that part's unmerged branch, its brief led by which part it is and what the one
before reported. Parts elsewhere run side by side. Research and words: research/133.

D426: when one message asks for several things, the same work has three views and one state: the
lines under the person's message in the conversation (their words, a mark, a note;
`conversation.md` §Several things in one message), the group's card here when it took more than one
task, and the opened task, which shows its own lines under its head. Who does each line is named here
and in the opened task, never in the conversation (a hover on the Mac only).

D285: under the sections, On hand's last line leads on: **一直在跑的 n 个 ›** (when something keeps
going on its own) and **做过的事 ›**, where every finished task stays, findable and marked
(`past.md`). D315: the line wraps, so nothing is clipped from 900 to 1280. A Find that matches
nothing here offers **在做过的事里找「{q}」**.

## Taking a finished card off (D454)

A card whose task is done or didn't work out, and a group none of whose parts is still at work, can
always leave On hand: **×** in its corner on hover (a pointer), a swipe to the left (touch, the card
follows the finger and slides out past 96), and **⋯** with what fits it: **再试一次 / Try again** and
**看看为什么 / See why** (the task at its failure) for one that didn't work out, **打开 / Open** for one
that is done, **移走 / Remove** for both. A group's ⋯ adds them to its own menu (rename, shape,
dissolve); 再试一次 there sends each part that didn't work back to work. Removed, it leaves On hand on
every device (core `onhand-away.ts`, `<dataDir>/onhand-away.json`, the frame `onhand_away`) and stays in
做过的事 / Past tasks (nothing is deleted; Past keeps its own **接着做 / Continue**); the toast says
**移走了「{name}」，做过的事里还找得到** with **撤销 / Undo**. A removed task that goes back to work comes
back by itself, with its group; what waited in line after a stopped part is dropped with the group.
The × is quiet ink, never the failed red: removing isn't a loss. *Why:* the author on 0.1.8 had a
group card (通用设置, Macbook Pro M3, **1 ✕ 通用设置 没成**) in 今天做完 that stayed, with no way to clear it; a card the
person can't clear is noise that never ends (D36 好用, 放心).

## A row (the rail beside an opened task)

Two lines (one line cut the news to half a width). D315: beside an opened task a row says only its
title and its face; a wait's small cloud of a bubble is not drawn there (two signs read as one
unknown icon).

- **Line one:** the title (short form, full on hover); then **+a −d**, 草稿 PR / 已合并, a new
  result's face, the time (how long it has worked; else when it changed, in days past 36 h).
- **Line two:** what it is on now, in words:

| State | Source, in order (deterministic; never a model) |
|---|---|
| Needs you | the decision's question, the report's question, the report |
| Working | a keep-going loop's line; the latest step in D210's words (with its mark), or the agent's latest words |
| Waiting | the waiter's reason (as 等 …); the state's reason; the first line of the last report; **停下了，没说在等什么** |
| Done, didn't work | the result's first line |

  A wait adds when it comes back with a 12-pt ring of the interval gone by (**11:39 回来 / back at
  11:39**, D279),
  or, once quiet, **上次有动静是 2 天前**. The right end says where: the project (under All, from
  two groups) and the computer (with two or more). The branch and the agent are in the task.

## The opened task

A waiting task's headline is the row's waiting line, never its title again; under it one line, when
it looks again and since when it has been quiet. The rest is D152/D210's transcript.

## Review 2026-11-17 (D315)

The author on 0.0.65 (Mac, 1280 and narrower), on their own evening: 「这个 on hands 各种细节、wording、
设计、flow 达到我们的情绪价值、设计性格、质感、水准和流畅要求了么 … 风格化似乎都不如我们在 readme 里的
老截图」, and the locator's focus mark 「处理的不够好」. Seen on the test renderer against the
author's evening as a seed (`demo-onhand.ts` `DEMO_STATE=author`), at 900, 1280 and 1600, zh and
en, light and dark; before and after in `.shots/d315/` (`mac-before-author-*`, `mac-after-author-*`,
`web-before-*`, `web-after-*`, `before-locator/`, `after-locator/`).

### Element by element (before)

| Element | Heavy developer | Consumer | Fresh user | What was wrong |
|---|---|---|---|---|
| The head sentence 「现在没有要你定的。4 个在等：最早 9:06 回来，2 个一天多没有动静；今天做完 1 个。」 | reads it once, then skips it: the strip says the same numbers | a paragraph to parse before a glance | long, bold, and the first thing; feels like a status report, not a partner | Hierarchy: a 40-character bold sentence is the loudest thing on the page and says nothing the strip and sections don't. Redundancy: every count three times (sentence, strip, section head). Wording: a report, not the partner's voice. |
| The strip 「0 等你 0 在做 4 在等 1 今天做完」 | the zeros are noise to skip | "0 等你" in faint grey reads as disabled, or as something missing | four labels to learn on day one | Zero states drawn as faint cells take half the track; with one state there the strip filters nothing. |
| 在等 cards | good: coin, title, ring, time | 放心: says when it's back | clear | The title cut at one line ("你能帮我准备好能 review nowledge-co 这…") lost the part that says what it is. Two cards side by side of different heights. |
| 一天多没有动静 rows | "is anything stuck?" with no way to act from here | grey rows read as broken, or as hers to fix, with no next step | doesn't know what to do | A different language from the cards above (flat rows, receded ink), no action: the board raised a worry and offered nothing. |
| 「Hetzner Server」 on every row and card | noise: every task runs there | a word they don't know repeated | same | Where was said for every task, though it only matters when it differs. 其他 / Other said on every errand says nothing. |
| 今天做完 as a plain row | fine | the good news looks the same as the stale | — | Mixed card and row styles for the same kind of thing. |
| Section names 「在等 4」 (12/600 muted) | fine | hard to find the parts of the page | the page has no landmarks | Hierarchy inverted: the sentence shouts, the sections whisper. |
| The links 「做过的事 › 替你做过的 › 一直在跑的 1 个 ›」 | — | — | — | At narrower widths (0.0.64) the right ones were clipped: the row didn't wrap. |
| 接下来 / Next line at 900 | — | — | — | Said 「今天 20:41」 for both waits: the end of the watch, not the next look the cards say (9:11, 9:26). The same fact disagreed on one screen. |
| The locator's focus | in a long task, a dark stack where the eye lands | reads as a broken scrollbar | — | The ticks in view turned to ink at 75% and grew 2 pt on a dense rail (8-pt pitch): stacked dark bars over a faint clay pill. |
| The rail's first row | — | a cloud-like icon nobody can name | — | A wait's raised bubble (its glyph on a cloud) drawn beside the face in a 300-wide rail. |
| The default line in the conversation | — | 「我就等你登录后继续。，之后还能改回来。」 | — | The Go label's own full stop doubled the sentence's comma. |

### What the README shots had that the board lost

- **Typography with a hierarchy.** Section names were bold display headings at about 20 ("Needs you
  1", "Working 2") with the count in muted figures beside them; card titles bold and allowed two
  lines; the page had landmarks. 0.0.65 inverted it: the sentence at 18/600 shouted, sections at
  12/600 muted whispered, titles cut at one line.
- **One object language.** Everything was a white card on its clay ledge, one radius, one shadow;
  nothing was a grey line. 0.0.65 mixed cards, flat rows and receded ink.
- **Composition with air.** Fewer, larger things; each column or section started with its heading;
  a short top band (one line) instead of a paragraph.
- **Colour that means something.** The peach decision card, the orange clock coins, green ticks;
  zeros never drawn. 0.0.65 drew greyed zeros as the second thing on the page.
- **Depth.** Cards stood on a 2-pt ledge with a soft drop; 0.0.65 kept that for live cards only.
- The partner's clay figure on the task page (the done face holding its phone) gave the old shots
  their warmth; 0.0.65's head already has the figure: what it lacked was a short line beside it.

### Against the north star (D36)

| | Before | After (D315) |
|---|---|---|
| 好用 easy | the facts were there, said three times | one line, one strip of what is there, sections as landmarks |
| 顺滑 smooth | a worry (quiet waits) with no next step | Check now / Continue / Put down right on the card |
| 赏心悦目 delightful | flat grey rows under cards; inverted type | one card language, display headings, titles that keep their end |
| 放心 trustworthy | two times for the same wait (9:11 and 20:41) | every time is the next look; the line, the cards and Next agree |
| 惊喜 surprising | — | the partner speaks: 「没有要你定的，我在做。」 |

### Decided (D315), built on the Mac and the web

The line, the strip of what is there, display headings, one card language with low cards (since D467 one card shape) and their
calm actions, titles in two lines and cards of one height, where said only when it differs, the
forecast line only while something needs you and with next-look times, the links wrapping, the
rail row without the wait bubble, the locator's calm lens, the default line's one mark, and the
web's cheer swelling from rest (D313's todo).

### Proposed, not built

- The conversation's header says 「1 个等你　在做 2 个」: two word orders side by side. One order
  (「1 个等你　2 个在做」) needs the header keys on both clients and their tests.
- 今天做完's section counts the rows (a done only claimed included) while the strip counts D310's
  Done today: one task can show 「今天做完 1」 over a strip without it. Either the section says its
  claimed ones apart, or D310 counts what is listed.
- A demo with two computers, so the shots show where on the one card that runs elsewhere.
- Test with the author first, then a consumer who has never heard "agent" (research/95's next step).

## Review 2026-11-22 (D467)

The author on 0.1.10 (Mac, about 1400 wide): 「怪怪的」. Six card shapes at two widths, the finished
work loudest and the one stopped task a grey row under a head that said 没有要你定的, the day column
saying the column again, the agent's logo and the partner's face on every result, yesterday inside
今天做完 under a strip that counted 1, and GitHub's triage as a second app whose rows made 553 of 555.
The diagnosis, five layouts against a rubric and what was built are D467's. Seen against
`apps/web/demo-d467.ts` (the author's screen as a demo core) at 1000 and 1400, zh and en, light and
dark, Mac and web, before and after: `.shots/d467/`. Round 2 (D467 rev.), on the author's "better, not
yet at the bar": the partner's brief in place of the line and the strip, no counts on the sections,
the trail, the group's track and the waits' time axis, results as PR chips, the source as one offer,
the peek; `{mac,web}-r2-…` and the frame sequences `{mac,web}-r2-motion-01..06`.

## At the source

A task's `wait_for` is refused when its reason reads as notes (`shorthand` in `core/src/work.ts`)
or its check only reads the clock (`clockCheck`). The reason is shown to the person as written.

## Keys

j/k and the arrows walk what is drawn, Enter opens, `/` finds, Esc lets go of a selection, then
Find, then the strip's filter, then goes up (D184). ⌘⇧] / ⌘⇧[ walk the lens's tasks from anywhere
(D244); ⌘O opens any task (D216).
