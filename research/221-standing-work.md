# 221 · Standing work: one object for helpers, routines, loops and babysits (D511)

Date: 2026-11-24, on main at `47b9874f` (0.1.31). The author on hel saw **你的帮手** (the babysitter, whose tap
opened Settings › Agent 通信) and **一直在跑的** (the 45-minute review loop) as two sections, and asked: 「这种
babysitter 或者其他等待某一个语义条件，routine 类型的 loop engineering（event driven 也可能）的，值得有专门的抽象设计
和完备优雅的视觉设计和 flow，跳转到 mailbox/bridge 不太对」. Design: `design/standing-work.md`.

Tags: **VERIFIED** = read in Ducter's docs or code at this commit; **INFERRED** = judgment; **RATED** = LLM-proxy
raters (haiku), not people. hel was not read for this report; its shapes come from D498's and D507's demos,
which were built from hel's Log (research/216, research/220). Raw rater answers: `.shots/standing-work/raters/`.

## 1. What exists (VERIFIED)

| Object | Decisions | Store | Shown | Gestures |
|---|---|---|---|---|
| Routine | D114, D245 | routines (product-model §4: trigger, brief, report policy, budget, effect scope, review date) | Past tasks › Ongoing | Pause, Resume, Run now, Change when, End |
| Task in rounds | D394, D427, D429, D481 | `task_loop` on the task's stream (`core/src/loops.ts`) | On hand › 一直在跑的 (D498), Ongoing tab | the same, plus How often, Move |
| Task waits, `until` | D113, D483, D496, D508 | waiters, owned PR looks (`owned.ts`, `pr-state.ts`) | 在等; a PR's line under its task | Continue, Put down |
| Helper | D494, D507 | `helpers.json` (address, Mem identity, about, limits) | On hand › 你的帮手 (tap: Settings › Agent 通信) | Settings only: stop, resume |
| Board | D407, D410 | an app's data, written each round | Your apps | the app's own |

Five stores, four places, three sets of gestures. The person's request is the same in every row: "keep doing
this for me until …". The two the author has (the babysitter and the review loop) sit in two sections, and the
first opens Settings, the place D494 itself said a helper does not belong to ("not a mailbox for the person").

## 2. First principles (INFERRED)

Standing work is any work where Ducter must act again later, more than once or until something holds, without
the person asking again. Its parameters (what wakes it, when it ends, what it holds, how a round runs) vary;
the person's relation to it does not: they want to know it is on, what it holds, what it needs from them, and
how to change or stop it. So the attention surface should be one object, while mechanisms stay plural (timers,
waiters, Bridge mail, PR looks are all code, principle 16). Principle 21 places the judgments: code owns the
facts (fired, arrived, changed, merged, budget used) and the invariants (every wait ends, at most one line a
round); the model owns meaning (is this news the person asked for, is the goal met, which task a message joins)
and records it as structured data.

Prior art (concepts only, INFERRED from public descriptions known to the team, no product read for this
report): consumer agents keep "scheduled tasks" (time only, each run a message); developer tools keep "loops"
or "babysit" commands bound to one session (they die with it); CI bots keep per-PR state but no person-facing
goal. None joins time, arrival and watched-fact wakes with a judged goal and held items under one object the
person sees; that is the gap this design fills.

## 3. The name (RATED)

Three haiku raters (R1 a heavy multi-agent developer, R2 a consumer of a chat assistant, R3 someone who never
used an agent), each blind first ("what would you expect under this name"), then scored 1–5 on four true
examples (babysit PRs, a 45-minute review, a fare until booked, a passport reminder until done).

| Name | R1 | R2 | R3 | Total | Blind read (gist) | Wrong idea named |
|---|---|---|---|---|---|---|
| 照看着的 / Looking after | 12 | 13 | 15 | **40** | "tends it and follows through until settled" (3 of 3) | something living to care for |
| 长期的事 / Standing jobs | 13 | 13 | 14 | **40** | "long-lived obligations" | permanent, no end |
| 一直在跑的 / Ongoing | 10 | 13 | 16 | 39 | "runs nonstop in the background" | always busy, never ends |
| 托给我的 / Left with me | 9 | 16 | 14 | 39 | "handed over to the AI" | a single hand-over; the person walked away |
| 在盯的 / Watching | 13 | 12 | 13 | 38 | "monitors and reports changes" | passive, never acts |
| 例行 / Routines | 12 | 13 | 12 | 37 | "fixed timetable" | clock only, hides event wakes |

Totals are within three points of 60: no name wins on fit. The blind reads differ more: only 照看 was read as
acting and following through to an end (the babysitter's own meaning; 照看 is literally "babysit"), and two of
three raters chose it as their favourite (R1 chose 在盯的). Chosen: **照看 / Looking after**, with each Keep's own
wake line (每 45 分钟一轮) covering its weaker fit for a periodic review.

## 4. The mark: the metaphor process (RATED)

**Candidates** (eight, including no metaphor), each described in words to the raters (no images):

| Mark | Maps | False implications (named before rating) |
|---|---|---|
| A. A pebble with the repeat sign (no metaphor) | it repeats | time only; a cron job; nothing held |
| B. A clay lantern: lit, a brighter beat, dim, out with a tick | a light kept on while you're away; a round; paused; done | dark = broken; a light = online; fire |
| C. A string tied on a finger | remember until done | a one-off reminder; nothing acts |
| D. A pot with a sprout, watered | tended over time; a flower when done | a progress meter; the person must water it |
| E. An oval track, a pebble going round, a flag at the goal | rounds; a goal or none; paused beside the track | laps you count; a loading bar; time only |
| F. A fence ring with a gate, pebbles inside, one at the gate with a flag | items held; one leaves when done; one needs you | an outbox or queue; a send that failed |
| G. A kettle on a low flame | kept going; a whistle when needed | an alarm; something boiling over |
| H. Ducter on its bench with a small telescope | the partner keeps watch | the brand mascot; one presence for all |

**Rubric** (1–5 each): (a) legible without a label as "work that keeps going on its own", (b) fidelity to
wakes, rounds, goal and items, (c) states: on, in a round, paused, done, needs you, (d) calm and trustworthy,
(e) distinct from a one-off task, a mailbox or a progress bar.

| Mark | R1 | R2 | R3 | Mean | Blind read (3 raters) |
|---|---|---|---|---|---|
| **B lantern** | 20 | 20 | 18 | **19.3** | "a status light: active, idle, finished" (3 of 3) |
| E track | 18 | 17 | 20 | 18.3 | "a repeating routine; laps; checkpoints" (3 of 3) |
| F fence ring | 16 | 18 | 16 | 16.7 | "a queue; items released; the flag = stuck" |
| D sprout | 17 | 15 | 16 | 16.0 | "a habit or progress tracker" (3 of 3) |
| H mascot | 18 | 14 | 14 | 15.3 | "looking ahead, searching"; "decoration" |
| A repeat (literal) | 12 | 15 | 13 | 13.3 | "a repeat setting" (3 of 3) |
| G kettle | 14 | 12 | 12 | 13.3 | "a timer that alerts when done" |
| C string | 9 | 9 | 10 | 9.3 | "a reminder" (3 of 3) |

Favourites: R1 and R2 the lantern ("every state maps to a light level, calm and soft, nothing else in the app
looks like it"), R3 the track ("loops map to rounds, the flag separates a goal from open-ended"). The false
ideas the raters themselves named: the lantern's "dark means broken or offline" (3 of 3), the track's "a lap
counter or loading bar", the literal mark's "a cron job with no judgment". Every rater said no mark shows
"needs you" alone; the words and the needs-you ledge must (as research/220 found).

**Result: the lantern leads, not yet a clear winner** (one point on 25, proxies, words not pictures). Its
fit beyond the scores: it is time-free (an arrival-driven helper and a timed loop read the same, where the
track says "laps"), it shares D498's beat, and it carries the emotional promise (a light left on while you are
away: 放心). Its false "dark = broken" is answered in the design (out always with a tick or the word 停下了).
**No images were generated**; the clay-art prompt is in `design/standing-work.md` §8. Next: render the lantern
and the track, rate again with images and the author.

## 5. The prototype and shots

`apps/web/demo-standing-work.html` (static, over `static/app.css`'s Pebble tokens; `?mark=` switches the three
leading marks). 51 shots in `.shots/standing-work/`: On hand, the three pages, two first-made moments, each at
1400 and 390 (2x), zh and en, light and dark; the three marks on On hand side by side. Read at 1400 and 390: no
horizontal overflow (measured by the shot script), each fact its own element.

## Implications for Ducter

- One person-facing object, **照看 / Looking after** (`Keep`), for every piece of standing work; helpers,
  routines, loops and babysits become its parameters; the mechanisms stay.
- Its home is its own page, opened from its sheet on On hand; Settings and Bridge only link to it.
- Its asks live in 等你 once; its sheet never moves between sections.
- Goals and "is this news" are the model's recorded judgments; code stops and says once.
- The lantern is the leading mark; decide it on rendered images with people, not on these proxies.

**Summary.** Five partial objects in four places carried one request. A single Keep with wakes (time, arrival,
watched change), a model-judged goal, held items, rounds, asks, rules and a life covers all of them. Raters
put 照看 / Looking after first on blind reads (fit totals were close) and the lantern first on the rubric (19.3,
the track 18.3); both decisions wait on the author and rendered art.
