# On hand (手头的事): the conductor surface

How On hand lets one person take in 3 or 50 tasks at a glance and step into any of them. Decided
in D216 (one list), D244 (the rail beside an opened task), D261 (projects as a lens, the strip,
the folds) and D287 (the partner at its head, the work as cards, the day beside it). Words are the glossary's (`product-model.md`); the visuals are Pebble's (`ui.md`).

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
   one sentence from counts and times only (`onhand.say.*`): **现在没有要你定的。4 件在等：最早
   22:40 回来，2 件一天多没有动静；今天做完 1 件。** (18/600, the display face).
2. The strip: **等你 · 在做 · 在等 · 今天做完**, counts within the lens; a count of none is faint.
   D270: a small sunk track of calm numerals and names on one line, the filter chosen the knob.
   At its end, under a project, **在这儿新建 / New task here**; Find from ten tasks.
3. 接下来 / Next, the forecast line (D127), when two or more things are coming and the day column
   isn't drawn.
4. Sections by state. 等你 answers in place (decision cards). 在做 rows. 在等: fresh rows, task-less
   waits, then the quiet fold. 今天做完: new results as rows, then the seen fold. D270: one reading
   column (760); section names small and quiet; rows lie flat on the ground with one anatomy (title
   14/500, one muted line of what's happening now, the time and where on the right), at least 58
   high; hover a faint tint; the row under the keys or open beside the rail is the knob; state is
   said by the small glyph or face, never a bar at the row's edge.
5. D287: what is alive stands as **cards** (below); quiet waits, seen results and the rail stay rows.
6. D287: **the day beside the board** (Mac ≥ 1280 pt, web ≥ 1280 px, 248 wide): 接下来 / Next (the
   waits' next looks and defaults, soonest first, ≤ 5, hollow beads), {time} 现在 / Now, 今天回来的
   / Back today (today's finished tasks, newest first, ≤ 6, with their result's first line, filled
   beads); each opens its task.

### Cards (D287)

Working tasks, fresh waits and new results: white on a 2-pt ledge, radius 20, two to a row from 612
of list width. The agent's coin (28; rocks while working), the title 15/600, what it is on in two
lines (the sources below), and the **heartbeat** at its foot, always true:

| State | Heartbeat | Wash |
|---|---|---|
| Working | three soft bars rising and falling, **在做 12 分钟** (**刚开始做** under a minute) | faint working blue at the top |
| Waiting | the 16-pt ring filling toward **22:40 回来** (D279) | none |
| New result | **14:10 做完**, the result in full ink, the smiling face; pops once the first time it is drawn | done green and a glow |

On the right of the foot: +a −d, 草稿 PR / 已合并, where. Hover lifts it 2 pt and offers its one
next step; the card under the keys has the accent outline.

### Folds

| Fold | What goes in | Line | Opens |
|---|---|---|---|
| Quiet waits | A waiting task whose card and looks haven't changed for 24 h | 还有 n 件，一天多没有动静 / n more, quiet for over a day | Tap (this session), Find, or 在等 in the strip |
| Seen results | Done today that isn't a new result, missed waits, ended calls | 还有 n 件，你都看过了 / n more you've seen | Tap (kept per device), Find, or 今天做完 in the strip |

What needs you never folds. Folded rows are not in the keys' walk. D287: a fold folds from three;
one or two stay in sight under a quiet caption (**一天多没有动静 / Quiet for over a day**, **你看过的 /
Seen**).

D285: under the sections, On hand's last line leads on: **一直在跑的 n 件 ›** (when something keeps
going on its own) and **做过的事 ›**, where every finished task stays, findable and marked
(`past.md`). A Find that matches nothing here offers **在做过的事里找「{q}」**.

## A row

Two lines (one line cut the news to half a width):

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

## At the source

A task's `wait_for` is refused when its reason reads as notes (`shorthand` in `core/src/work.ts`)
or its check only reads the clock (`clockCheck`). The reason is shown to the person as written.

## Keys

j/k and the arrows walk what is drawn, Enter opens, `/` finds, Esc lets go of a selection, then
Find, then the strip's filter, then goes up (D184). ⌘⇧] / ⌘⇧[ walk the lens's tasks from anywhere
(D244); ⌘O opens any task (D216).
