# On hand (手头的事): the conductor surface

How On hand lets one person take in 3 or 50 tasks at a glance and step into any of them. Decided
in D216 (one list), D244 (the rail beside an opened task), D261 (projects as a lens, the strip,
the folds), D287 (the partner at its head, the work as cards, the day beside it) and D315 (one
short line, the strip of what is there, one card language, headings with character; the review
below). Words are the glossary's (`product-model.md`); the visuals are Pebble's (`ui.md`).

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
- under it the unmerged **+a −d** of its tasks' branches, only where there are branches;
- one status place: the partner's face for its most urgent task (needs you > working > new
  result), D244's art, never a dot (D69);
- its count.

The chosen row is the knob (D270: the card's white on its clay ledge). Opening a task turns the board into the rail (D244), narrowed by the
same lens, whose head names it and goes back. The column never stands beside the rail.

## The board

1. D287: the partner at the head, always: its clay figure (76; 56 in the side pane and on the
   phone) in the pose for the whole (its flag when anything needs you > reading while anything
   works > on its bench while all waits > smiling when what is left came back done > idle), and
   D315: **one short line** in its voice (`onhand.line.*`, the display face 22/700) that says what
   the strip can't: **有 n 件要你定。** when anything needs you; else **没有要你定的，我在做。**
   while anything works; else, when all waits, **没有要你定的。最早 9:06 回来。** (one wait:
   **在等的那件 9:06 回来。**; none coming back on its own: **在等的都没有新动静。**); else
   **都做完了。** or **手上没有事。** It never repeats a count. The long sentence (`headSay`, D287) stays
   the menu bar's, where there is no strip.
2. D315: under the line, the strip of **only the states there are** (a zero is never drawn), and
   only from two of them (one state alone is already the board's one section); while a filter is
   on it stays. D270: a small sunk track of calm numerals and names, the filter chosen the knob.
   Under the head, on its own row, under a project **在这儿新建 / New task here**; Find from ten.
3. 接下来 / Next, the forecast line (D127), when the day column isn't drawn, two or more things are
   coming, and D315: something needs you (otherwise the line under the partner already says when
   the first is back, and each card its own). Its times are each wait's next look, as the cards'.
4. Sections by state. 等你 answers in place (decision cards). 在做 cards. 在等: fresh cards, task-less
   waits, then the quiet ones; D382: a question put off with **晚点再问我 / Ask me later** stands
   here, out of 等你 and its count, its line **{time} 再问你：{question} / Asking again {time}:
   {question}** with **现在就定 / Decide now** (on hover on a wide screen; the opened card always),
   until its time puts it back in 等你 (no default runs on it there until it is seen). 今天做完: new results as cards, then the seen ones. One reading
   column (760). D315: a section's name is a heading in the display face (18/700, ink) with its
   count beside it in muted figures, as the first drawings had it (the README shots); beside an
   opened task (the rail) it stays small and quiet (D270). State is said by the small glyph or
   face, never a bar at the edge.
5. D287, D315: **one card language**. What is alive stands as cards (below); quiet waits and seen
   results are **low cards** of the same white, ledge and radius (16), one line lower, never greyed;
   only the rail beside an opened task stays rows.
6. D287: **the day beside the board** (Mac ≥ 1280 pt, web ≥ 1280 px, 248 wide): 接下来 / Next (the
   waits' next looks and defaults, soonest first, ≤ 5, hollow beads), {time} 现在 / Now, 今天回来的
   / Back today (today's finished tasks, newest first, ≤ 6, with their result's first line, filled
   beads); each opens its task.

### Cards (D287)

Working tasks, fresh waits and new results: white on a 2-pt ledge, radius 20, two to a row from 612
of list width, D315: a row's cards as tall as each other, the foot at the bottom. The agent's coin
(28; rocks while working), the title 15/600 in up to two lines (D315: a long title keeps its end;
the whole on hover), what it is on in two lines (the sources below), and the **heartbeat** at its
foot, always true:

| State | Heartbeat | Wash |
|---|---|---|
| Working | three soft bars rising and falling, **在做 12 分钟** (**刚开始做** under a minute) | faint working blue at the top |
| Waiting | the 16-pt ring filling toward **22:40 回来** (D279) | none |
| New result | **14:10 做完**, the result in full ink, the smiling face; pops once the first time it is drawn | done green and a glow |

On the right of the foot: +a −d, 草稿 PR / 已合并, where (D315: its project, never 其他 / Other; its
computer only when it isn't the one most of the board runs on). Hover lifts it 2 pt and offers its
one next step; the card under the keys has the accent outline.

### Low cards (D315)

Quiet waits and seen results: the same white card one line lower (at least 58 high, radius 16, a
2-pt ledge, hover lifts 1 pt): the coin (22), the title 14/600 on one line, then what it waits for
or came to, **上次有动静是 2 天前** for a quiet wait, and where. A quiet wait offers its calm next
step at once, never only a grey line: **现在看一次 / Check now** when it watches something (its
waiter looks now), else **接着做 / Continue** (the task carries on, D285's Continue with those
words), and **放下 / Put down** (the task is cancelled; it stays in 做过的事 / Past tasks). A seen
result shows its time, and on hover its one next step.

### Folds

| Fold | What goes in | Line | Opens |
|---|---|---|---|
| Quiet waits | A waiting task whose card and looks haven't changed for 24 h | 还有 n 件，一天多没有动静 / n more, quiet for over a day | Tap (this session), Find, or 在等 in the strip |
| Seen results | Done today that isn't a new result, missed waits, ended calls | 还有 n 件，你都看过了 / n more you've seen | Tap (kept per device), Find, or 今天做完 in the strip |

| Your to-dos (D357) | Open to-dos in the person's own apps beyond the three shown | 还有 n 件 / n more | Tap (this session), or a count in Settings › 待办来源 |

What needs you never folds. Folded cards are not in the keys' walk. D287: a fold folds from three;
one or two stay in sight under a quiet caption (**一天多没有动静 / Quiet for over a day**, **你看过的 /
Seen**).

D357: after 今天做完, while a to-do source is on and something is open there, **GitHub 上标给你的 /
Assigned to you on GitHub** (a vault: **{vault} 里的待办**; several: **你的待办 / Your to-dos**), its count as a
section's. At most three stand as cards of the same language, the app's mark where a task has its
coin: a PR waiting for review, a mention, a line due soon, the newest (the home's choice, never a
model; none with a live task). Each card opens the to-do in its app and offers **交给{name} / Hand to
{name}** (a review request: **在 GitHub 里打开**); handed over, it comes back as a task on the board with
its chip. The rest fold under **还有 n 件 / n more**: opened in place, On hand's Find, chips on a sunk
track, low cards, pages of 30 (`task-sources.md` §6). Nothing shows for someone with no source, under
a project's lens, with a filter on, or while finding.

D359: at the group's head (under All, or a lone source's lens) stands **the pile**: the partner in clay
beside a stack of pages whose height is the count's bucket, the count itself literal (**还有 557 件 /
557 still open**, which replaces the heading's count), **今天替你清掉 n 件**, **在做 n 件** and **排着 n 件**
apart, then the sort's groups as rows, each with its count and one button (**交给{name}**, **一件件定**,
**过目**), **可以先放着的** and **还没细看的** as quiet rows, and **{ago}理过** with **再理一遍**. While it sorts,
**正在一件件看…** and a bar; before any sort, one line and **理一理**. A review request the partner read
carries **我看过了** with its counts on its card. The pile counts as something on hand (the empty
state doesn't show over it). Its sheets and their Go: `task-sources.md` §9.

## Groups (D360)

Several tasks that are one piece of work (登录页重做 in three tasks) stand as **one card** in the state
section of their most urgent part; a stopped line stands in 等你 and counts as one thing that needs
you. The partner makes a group when it splits a request (`task_open` `group`) or when the person says
"把这几件放一起" (`task_group`); on the web the selection bar offers **放进一个分组 / Put in a group**.
Nothing is filed by hand first. A group shows from two parts; counts stay per task; while finding,
and in the rail beside an opened task, its tasks are rows of their own.

The card: the group's name (display face 15/800), beads one per part and **{n} 件里做完 {k} 件**, its
menu (⋯ on the web, right-click on the Mac: **改名**, **改成同时做 / 改成一件做完接下一件**, **取消分组（任务都留着）**);
then the parts numbered on a thread, each with its mark (a tick, three working bars, a flag, a ring, a
cross, a dashed ring for **排着**) and its right-hand words (the card's heartbeat words); a part that
needs you shows its question inside the card. More than three parts fold to what is live and the next
in line (**还有 {n} 件**). Under the parts: **一件做完接下一件 / One after another** (or **同时做**) while
something is held; a stopped line instead says **第 2 件没做成，第 3 件在等你决定。** with **再试第 2 件**,
**不管它，做第 3 件** and **第 3 件也不做了** (several: **后面 {n} 件** and **后面的不做了**). A held part offers
**提前** on hover.

The line (core `task-groups.ts`): parts in the same folder on the same computer run one after another;
a later one is held by the home (no task, no agent) and opens when the part before it is done (its
result back) from that part's unmerged branch, its brief led by which part it is and what the one
before reported. Parts elsewhere run side by side. Research and words: research/133.

D285: under the sections, On hand's last line leads on: **一直在跑的 n 件 ›** (when something keeps
going on its own) and **做过的事 ›**, where every finished task stays, findable and marked
(`past.md`). D315: the line wraps, so nothing is clipped from 900 to 1280. A Find that matches
nothing here offers **在做过的事里找「{q}」**.

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
| The head sentence 「现在没有要你定的。4 件在等：最早 9:06 回来，2 件一天多没有动静；今天做完 1 件。」 | reads it once, then skips it: the strip says the same numbers | a paragraph to parse before a glance | long, bold, and the first thing; feels like a status report, not a partner | Hierarchy: a 40-character bold sentence is the loudest thing on the page and says nothing the strip and sections don't. Redundancy: every count three times (sentence, strip, section head). Wording: a report, not the partner's voice. |
| The strip 「0 等你 0 在做 4 在等 1 今天做完」 | the zeros are noise to skip | "0 等你" in faint grey reads as disabled, or as something missing | four labels to learn on day one | Zero states drawn as faint cells take half the track; with one state there the strip filters nothing. |
| 在等 cards | good: coin, title, ring, time | 放心: says when it's back | clear | The title cut at one line ("你能帮我准备好能 review nowledge-co 这…") lost the part that says what it is. Two cards side by side of different heights. |
| 一天多没有动静 rows | "is anything stuck?" with no way to act from here | grey rows read as broken, or as hers to fix, with no next step | doesn't know what to do | A different language from the cards above (flat rows, receded ink), no action: the board raised a worry and offered nothing. |
| 「Hetzner Server」 on every row and card | noise: every task runs there | a word they don't know repeated | same | Where was said for every task, though it only matters when it differs. 其他 / Other said on every errand says nothing. |
| 今天做完 as a plain row | fine | the good news looks the same as the stale | — | Mixed card and row styles for the same kind of thing. |
| Section names 「在等 4」 (12/600 muted) | fine | hard to find the parts of the page | the page has no landmarks | Hierarchy inverted: the sentence shouts, the sections whisper. |
| The links 「做过的事 › 替你做过的 › 一直在跑的 1 件 ›」 | — | — | — | At narrower widths (0.0.64) the right ones were clipped: the row didn't wrap. |
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

The line, the strip of what is there, display headings, one card language with low cards and their
calm actions, titles in two lines and cards of one height, where said only when it differs, the
forecast line only while something needs you and with next-look times, the links wrapping, the
rail row without the wait bubble, the locator's calm lens, the default line's one mark, and the
web's cheer swelling from rest (D313's todo).

### Proposed, not built

- The conversation's header says 「1 件等你　在做 2 件」: two word orders side by side. One order
  (「1 件等你　2 件在做」) needs the header keys on both clients and their tests.
- 今天做完's section counts the rows (a done only claimed included) while the strip counts D310's
  Done today: one task can show 「今天做完 1」 over a strip without it. Either the section says its
  claimed ones apart, or D310 counts what is listed.
- A demo with two computers, so the shots show where on the one card that runs elsewhere.
- Test with the author first, then a consumer who has never heard "agent" (research/95's next step).

## At the source

A task's `wait_for` is refused when its reason reads as notes (`shorthand` in `core/src/work.ts`)
or its check only reads the clock (`clockCheck`). The reason is shown to the person as written.

## Keys

j/k and the arrows walk what is drawn, Enter opens, `/` finds, Esc lets go of a selection, then
Find, then the strip's filter, then goes up (D184). ⌘⇧] / ⌘⇧[ walk the lens's tasks from anywhere
(D244); ⌘O opens any task (D216).
