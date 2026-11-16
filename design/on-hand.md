# On hand (手头的事): the conductor surface

How On hand lets one person take in 3 or 50 tasks at a glance and step into any of them. Decided
in D216 (one list), D244 (the rail beside an opened task) and D261 (projects as a lens, the strip,
the folds). Words are the glossary's (`product-model.md`); the visuals are Pebble's (`ui.md`).

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

1. When nothing needs you, one calm sentence (`onhand.calm`, `onhand.calm.working`). Otherwise
   nothing: the 等你 section comes first.
2. The strip: **等你 · 在做 · 在等 · 今天做完**, counts within the lens; a count of none is faint.
   D270: a small sunk track of calm numerals and names on one line, the filter chosen the knob.
   At its end, under a project, **在这儿新建 / New task here**; Find from ten tasks.
3. 接下来 / Next, the forecast line (D127), when two or more things are coming.
4. Sections by state. 等你 answers in place (decision cards). 在做 rows. 在等: fresh rows, task-less
   waits, then the quiet fold. 今天做完: new results as rows, then the seen fold. D270: one reading
   column (760); section names small and quiet; rows lie flat on the ground with one anatomy (title
   14/500, one muted line of what's happening now, the time and where on the right), at least 58
   high; hover a faint tint; the row under the keys or open beside the rail is the knob; state is
   said by the small glyph or face, never a bar at the row's edge.

### Folds

| Fold | What goes in | Line | Opens |
|---|---|---|---|
| Quiet waits | A waiting task whose card and looks haven't changed for 24 h | 还有 n 件，一天多没有动静 / n more, quiet for over a day | Tap (this session), Find, or 在等 in the strip |
| Seen results | Done today that isn't a new result, missed waits, ended calls | 还有 n 件，你都看过了 / n more you've seen | Tap (kept per device), Find, or 今天做完 in the strip |

What needs you never folds. Folded rows are not in the keys' walk.

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

  A wait adds when it looks again with a 12-pt ring of the interval gone by (**11:39 再看一次**),
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
