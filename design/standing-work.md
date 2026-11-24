# Looking after (看守中): one object for work Ducter keeps on for the person

> **D511: accepted; phases 1–3 of §11 built 2026-11-24.** The Keep store and the migration
> (`core/src/keeps.ts`, `protocol/src/keeps.ts`), On hand's 看守中 and each Keep's page on the web and the
> Mac (`apps/web/src/keep.tsx`, `apps/desktop/internal/views/keeps.go`), and the partner's `keep_make` /
> `keep_list` / `keep_change`. Phases 4–6 (goals and news as recorded judgments, the clay mark, live on
> hel) are in `todo.md`. Evidence and raters are in `research/221-standing-work.md`. The prototype is
> `apps/web/demo-standing-work.html` (shots `.shots/standing-work/`); the built screens' demo is
> `apps/web/demo-d511.ts` (shots `.shots/d511-built/`; D75: not in git).

### What is built (phases 1–3)

- **The store and the migration.** A Keep is a `keep` snapshot on stream `keep:<id>`, rebuilt on start.
  On every start (and whenever a `task_loop` or `routine` snapshot or `helpers.json` changes) every
  loop, every routine past its Go and every helper without a Keep gets one, with its life; their own
  records are never changed, so an older Ducter still reads them and nothing is lost. The first start
  marks what it carried over (`migratedAt`). A proposed or dismissed routine was never kept. Its rounds
  are read from the history its mechanism already wrote: a loop's wakes and reports (and the questions
  each round asked, from the channel), a routine's runs, a helper's mail and its tasks' reports.
  Tested from fixture copies of each older shape (`core/test/fixtures/keeps-old.ts`).
- **Life follows the mechanism**, and the person's gestures go to it: pause (until a time), resume, look
  now, stop. A helper paused holds its address closed and keeps the Keep paused (not stopped).
- **What waits for the person** is in 等你 once, naming the Keep; the sheet says the count.
- **Its end is the model's, read once.** A Keep with no goal the person stated (carried over, or made
  with none) has its end read once from their own words (about and brief) by the cheap model of the
  agent the partner thinks with: a short sentence in their language (每个 PR 跟到能合并为止), or none. The
  answer is recorded on the Keep (`end`: until, none, failed) and never asked again; until it answers,
  or if it failed, 做到什么时候 says nothing rather than guess. No phrase matching.
- **Code reads facts only**: what woke a round, what it reported, whether it asked. A round is
  `told` only where a rule says so (a routine that reports every run). Goals and news are phase 4.
- **`keep_make`** makes one at once for times on the clock (a routine, `run: fresh`) or an address
  (a helper, `run: perItem`); a first look now is the model's call (a fare has a value today, a weekly
  report doesn't). Rounds that would act outward unasked still go through `routine_propose`'s Go.
  A Keep in rounds on one task (`run: same`) is still made by a task that rests on its own wait.

## 1. The ask, and what is wrong today

On hel (0.1.31), On hand showed **你的帮手** with "Nowledge Mem PR Babysitter". Tapping it opened Settings ›
Agent 通信 (tooltip 在设置里看…). A second section, **一直在跑的**, held the review routine 「持续评审
nowledge-co，并处理 100gle 分给你的待办」 (每 45 分钟一轮, 下一轮 10:52, 9 个请求在等你). The author asked
for one abstraction for this kind of work, babysitters and routines alike, with a complete visual design and
flow, and said a jump to the mailbox or Bridge is wrong.

Today one idea, "keep doing this for me until …", is spread over five partial objects in three places:

| Today | Decided in | What it covers | Where it shows | What it lacks |
|---|---|---|---|---|
| Routine (例行) | D114, D245 | a time or a condition, each firing a run | Past tasks › Ongoing | an end goal, held items, a page |
| A task in rounds (a loop) | D394, D427, D429, D481 | one task resting on its own timer, kept by Ducter | On hand › 一直在跑的 (D498), Ongoing tab | event wakes, held items, a page of its own |
| `until` and waits | D113, D483, D496, D508 | a task's waits on CI, reviews, a PR's standing | 在等, a PR's line under its task | a person's goal across many wakes |
| Helper (帮手) | D494, D507 | mail at a Bridge address, a task per piece | On hand › 你的帮手, and Settings › Agent 通信 | its own page (it opens Settings), rounds, rules |
| Board app | D407, D410 | a routine writes a small app each round | Your apps | it is a second picture of the same state |

The person thinks one thing ("Ducter is minding this for me"); the product shows five, and the one tap that
should open it lands in Settings.

## 2. Who, and what they feel (User first)

| Who | The moment | Before | After (D36) | How it starts |
|---|---|---|---|---|
| **H**, the heavy multi-agent developer (the author) | His agents hand PRs to a babysitter; a review loop runs every 45 min; he checks between two other things | 不放心 and 找不到: the babysitter opens Settings, the loop sits in another section, its PRs scatter across 在做 / 在等 / 今天做完, a round's state is only in the latest message | 放心 at a glance (each kept thing one sheet, its light on, what waits for him in 等你); 好用 one tap into one page with its items, its rounds and its rules; 顺滑 change it by talking | He already has two: on upgrade they appear under **在照看的 / Looking after**, his helper's and his loop's state carried over, with the one first-time line |
| **C**, the consumer | "Keep an eye on the Dec 20 Tokyo fare; tell me under ¥2,000; stop when I book" | a chat promise with nothing to see; or an alarm app's "check" that only rings | 放心: a card that says when it looks, when it speaks and when it stops; 赏心悦目: a lantern lit; 惊喜: the first look done at once (¥2,340 now) | One sentence. The partner's reply and the card are the first meeting. No setup, no form |
| **F**, the fresh user | Has never heard of a loop or an agent | — | Meets it only by asking "remind me until …" or "watch this"; plain words, no new concept | The same one sentence; the card explains itself in its four lines |

The original intent holds for both kinds of user: a partner that reports to you and needs your attention only
when it truly matters (silent rounds, one line on a change, a question only when the person is needed), with
full control whenever you want it (one page with every round, every item, every rule, Pause and Stop).

## 3. First principles

Standing work is defined by one fact: **the person asked once, and Ducter must act again later, more than once
or until something holds, without being asked again.** Everything else is a parameter:

- *What brings it back* is a time, an arrival (mail at an address, a webhook, an account event), or a change
  in a fact it watches (a PR's CI, a fare). These differ in mechanism, not in what the person asked.
- *When it ends* is a goal ("until it can merge", "until I book"), the person's stop, or never.
- *What it holds* is zero, one or many items, each with its own standing (a PR, a fare, a to-do).
- *Who does each round* is Ducter's choice: the same task again (a loop), a fresh task (a routine), or a task
  per item (a helper).

So helpers, routines, loops and babysits are **one object seen with different parameters**. The person's
attention runs on that one object: one place, one page, one set of gestures. The mechanisms under it (waiters,
timers, Bridge, owned PR looks) stay as they are, as code (principle 16).

**Principle 21 splits the judging.** Code owns the facts and the invariants: a timer fired, mail arrived, a
check's answer changed, a PR merged, the budget is used, every wait ends. The model owns meaning: whether a
round's result is news the person wants, whether "the flight is booked" holds (it reads the booking email),
which task a message joins, whether the goal is met. The model records each judgment as structured data
(`goal: met` with its evidence; `news: true` with the line), and code enforces what follows (stop, say once).
No regex or threshold decides meaning.

## 4. The model: 看守中 / Looking after (code name `Keep`)

**One paragraph.** A *Keep* is something the person asked Ducter to look after over time. It holds the
person's own words; what wakes it (times, arrivals, watched facts); the goal that ends it, judged by the model
on facts; the items it holds, each with its standing and the task working on it; its rounds, one per wake,
each recording what woke it, what it did and whether it spoke; what waits for the person; its rules (when it
speaks, limits, where and who, what it may touch); and its life (on, paused, done because the goal was met,
stopped). Ducter keeps it, not the agent: a Keep outlives any task, session, harness, restart or upgrade, and
only the person or its goal ends it.

| Field | What it is | Who sets it | Who judges it |
|---|---|---|---|
| `said` | the person's words, verbatim (D427's brief words) | the person | — |
| `title` | a short name in the person's language (a helper keeps its own name) | the partner, renamable | — |
| `wakes[]` | each one of: `every` (a rhythm, D427), `at` (times, with the time zone, D114), `arrives` (mail to its address, a webhook, a To-do source item, an account fact; D494, D341), `changes` (a watched fact: a PR's CI or reviews, D483/D496; a page or a price: a check, D245) | the partner from the words; the person by talking | code fires it; a `changes` wake fires only when the fact changed |
| `until` | the goal in words (每个 PR 能合并; 你订了这一天的票), optional, per Keep or per item | the person's words | the model, after each round, on facts; recorded as `goal: met` with evidence |
| `items[]` | what it holds: a PR (D508's `TaskPR`), a fare, a to-do, a task; each with its standing, its task, its own until | rounds add and close them | code reads each item's facts; the model reads meaning |
| `rounds[]` | one per wake: when, what woke it, what it did in one line, items touched, `spoke`: silent / told / asked, its cost, the task it ran in | code records; the round's line is the model's | — |
| `asks[]` | decisions waiting for the person, each with a default (D61 for anything outward) | a round | the person |
| `rules` | `speaks` (when it speaks: on news the person asked for; asks only when needed; never "nothing new"), `limits` (a round's time, items a day: D494's 10; a month's spend), `where` and `who` (D510's defaults apply), `mayTouch` (D61), standing go's (D413) | defaults from the words; the person by talking | code enforces |
| `run` | how a round runs: `same` (one task across rounds, D394's fresh-session rule), `fresh` (a task per round, D114), `perItem` (a task per item, D494) | the partner | — |
| `address` | optional: its Bridge name, so other agents can hand it work (D494). A detail inside the Keep, never its home | made with it | — |
| `app` | optional: a small app it fills (D407); a second view of `items`, never a second state | the person's Go on the offer | — |
| `life` | `on` (with `health`: on time, late, a computer asleep, out of allowance, D427/D429), `paused` (until a time or a resume), `done` (goal met, with evidence), `stopped` (by the person) | — | code, from the person's gesture or the recorded goal |

**Life.** `on → paused → on`, `on → done` (the model recorded the goal as met; code stops every wake, keeps
the record), `on/paused → stopped` (the person). A round never ends a Keep (D427 holds: a round's done is the
round's). Nothing else ends it either: a crash, a lost wait, a restart or an upgrade brings the next round back.
A Keep with no goal and no news for 30 days gets one offer, never an interruption: **它这一个月都没找到要你看的，
还留着吗？ / It hasn't found anything for you in a month. Keep it?** (D114's review date, as D453's offer).

**Items carry their own end.** A babysitter has no end; each PR it holds ends at "can merge" (its line **能合并了，
等人合并**) and leaves at the merge or close for 今天做完 with the Keep's name among its where-facts (D507, D508).

### How existing objects map into it

| Existing | Becomes | Kept as mechanism |
|---|---|---|
| Routine (D114) | a Keep with `wakes: at/every`, `run: fresh`, no until | the scheduler, catch-up and retry rules (D245) |
| Task in rounds, loop (D394, D427, D429, D481) | a Keep with `wakes: every`, `run: same`; `task_loop` is migrated into it | the one-timer rule, the watchdog's facts to the partner, the move to an awake computer |
| Helper (D494, D507) | a Keep with `wakes: arrives (its address) + changes (its PRs)`, `run: perItem`; the helper's name is the Keep's title | `helpers.json`'s address and Mem identity, now `address` on the Keep |
| A babysit said in words ("盯到 #10932 能合并") | a Keep with one item and its until | D483/D496 looks |
| A task's own `until` and waits (D113, D483) | **unchanged**: inside one task, not standing work. A task with one PR open stays D508's row | — |
| Board app (D407) | a view of the Keep's items, offered as before | `app_data` writes from the same model |
| On hand's **一直在跑的** (D498) and **你的帮手** (D507) | one section, **看守中 / Looking after** | the rows' facts and lines |
| Past tasks › Ongoing tab (D285) | the same list, with ended Keeps under **已结束 / Ended** | its gestures |
| Settings › Agent 通信 › 你的帮手 (D494) | only the address row, a link back to the Keep's page | the connection |

**Not a Keep:** a one-off task (even a long one), a question put off (D382), a task's own wait. The test is
the first-principles one: will Ducter act again later without being asked?

## 5. Words (proposed for the glossary)

Raters read six names (research/221 §3). Totals were close; the blind reads decided it: **照看 / look after**
was read by all three as "tends it and follows through until it is settled", the true model (acts, holds,
has a goal). Its weakness, a 45-minute review read as a weaker fit, is covered by each Keep's own wake line.

D525 (the author on the built page: 「在照看」 reads as AI, not as a product's status): the labels name the state,
**看守中**, the way a Chinese product names an ongoing state (进行中, 评审中); 看守 alone is never a label (as a
noun it reads as a guard). 照看 stays the partner's verb in its own sentences, where research/221 read it best.
The other states are crisp: 已暂停, 已完成, 已停止, 已结束.

| Thing | zh | en |
|---|---|---|
| the section on On hand, the list in Past tasks | **看守中** | **Looking after** |
| the page's kicker | **{name} 看守中** | **{name} is looking after** |
| the partner's acknowledgement | **好，我来照看：…** | **Done, I'll look after it: …** |
| life | **看守中 / 已暂停 / 已完成 / 已停止** | **On / Paused / Done / Stopped** |
| the page's parts | **你说的 · 等你 · 手上的 · 每一轮 · 怎么运行** | **You said · Waiting for you · What it holds · Rounds · How it runs** |
| its rules | **什么时候醒 · 做到什么时候 · 什么时候出声 · 上限 · 在哪儿做，谁来做 · 别的 agent 怎么找到它** | **When it wakes · Until · When it speaks · Limits · Where and who · How your agents find it** |
| a round's outcome | **没出声 / 说了一句 / 问了你**; one under way **进行中** | **Silent / Told you / Asked you**; **Running** |
| silent rounds folded | **又看过 {n} 次，都没有变化** | **Looked {n} more times; nothing changed** |
| the wake line on a row | **有活就接 · 下一轮 {time} · 明早 {time} · 本轮进行中** | **Takes work as it comes · Next round {time} · Tomorrow {time} · A round is running** |
| gestures | **暂停 ▾ · 恢复 · 现在看一次 · 停下** | **Pause ▾ · Resume · Look now · Stop** |
| change by talking | **想改什么，直接说：「…」** | **Say what to change: “…”** |
| the end | **做完了：{goal, met}。 / Done: {goal, met}.** | |
| ended, in Past tasks | **已结束** | **Ended** |

Retired as user-facing words once built: **一直在跑的 / Ongoing** (the section), **你的帮手 / Your helpers** (the
section; "helper" stays the word for a Keep with an address in Bridge's own rows), **例行 / Routine** as an object
name. "每 {n} 一轮 / A round every {n}" stays.

## 6. Where it lives

**Its own place, not Settings, not Bridge.** A Keep's home is its page; On hand shows it; Settings and Bridge
only link to it.

### On hand, at a glance

Sections by attention, as D467: **等你, 在做, 在等, 看守中, 今天做完**. Each Keep is one clay sheet in **看守中**:

- its **lantern** (40; §8), lit while on, a beat when a round did something, dim when paused;
- its **title** (15/700) in the person's language;
- its **facts**, each its own element (D291): what it holds (**手上 3 个 PR**), what waits (**1 个在等你** in the
  needs-you ink), its rhythm (**每 45 分钟一轮**), its goal when short (**降到 ¥2,000 以下告诉你**);
- its **line**, the last change in one sentence (**上一轮 10:07：2 个有新提交已复审，7 个没变**; **今早 ¥2,340，比昨天低
  ¥120**); health when it isn't on time (D427's words) takes the line's place;
- at the right, **when it wakes next**: **有活就接**, **下一轮 10:52**, **明早 8:00**, or **暂停了**;
- items that are tasks at work nest under it, set in by the mark's width (D507's shape): up to three, then
  **还有 {n} 个 ›**.

**What waits for the person is in 等你, once.** A Keep's ask is a row in 等你 with the Keep's name among its
where-facts; the Keep's sheet stays in its own section and says **1 个在等你**. It never jumps between sections
(D507 moved the helper's sheet to the head of 等你; a thing that moves is harder to find, and the ask is what
needs the person, not the whole Keep). Counted once: the ask is the needs-you item; the sheet's fact is a fact.

The partner's line at the head is unchanged; it may say **看守中的都按时** only when asked (silence is success).

### Its page

Tapping the sheet opens the Keep's page in the board's place (the rail beside it lists the other Keeps, as the
rail beside an opened task, D244). Wide (≥ 1120): a reading column and a side column of 320. Phone: one column,
the side column after the rounds.

1. **Head**: the lantern (64), **{name} 看守中**, the title (28/800), its life as chips (**看守中**, **1 个在等你**,
   **11 月 24 日 08:47 起**, **这周接了 3 个**).
2. **你说的 / You said**: the person's words, verbatim.
3. **等你 / Waiting for you**: its asks, answered in place (the same card as in 等你).
4. A picture only when the Keep has one number that moves toward its goal (the fare: one point a morning and
   the goal as a dashed line). Never a progress bar for work that has no measure (D498).
5. **手上的 / What it holds**: each item with its standing (a PR: its line, its checks as small squares, who
   approved; D508's words), **打开 PR ›**, and its task one tap away.
6. **每一轮 / Rounds**: newest first; each round its time, what woke it (**#11030 的 CI 变了**, **Codex 交过来一个
   PR**, **到点了（每 45 分钟）**), what it did in one line, and **没出声 / 说了一句 / 问了你**; silent rounds fold
   into one line with small pips (**昨天起又看过 18 次，都没有变化**). A round opens its task at that point.
7. **Change by talking**: a composer under the rounds, its placeholder an example from this Keep
   (**想改什么，直接说：「ducter 仓库的 PR 也接」**). What is typed goes to the partner with the Keep attached; the
   partner changes it with one tool (`keep_change`) and says the change in one line.
8. **怎么运行 / How it runs** (the side column): when it wakes, until, when it speaks, limits, where and who, and
   for a Keep with an address **别的 agent 怎么找到它** (its Mem name and **已连上**; the Bridge details one more tap
   in, never the page's subject). At its foot **暂停 ▾** (1 小时, 明天早上, 一周, 直到我恢复) and **停下** (in the
   failed ink, asks once).

### Phone and Mac

- **Phone** (390): On hand's sheets stack, the right-edge time moves under the line; the page is one column;
  the composer stays pinned above the keyboard; Pause and Stop sit at the foot of How it runs. The lantern art
  is the same file at 2x.
- **Mac**: On hand's section as on the wide web; the page opens in the main window's board area with the rail;
  the menu bar's count includes a Keep's ask like any ask. ⌘K finds a Keep by its title or an item's number.
- **Widget, Watch** (later): a Keep is the natural unit for a glance; out of scope here.

## 7. The flows

### Made from one sentence (C, F, H)

1. The person says it in the conversation.
2. The partner reads the words into a Keep (`keep_make`: said, title, wakes, until, speaks, where), the model
   judging meaning (principle 21), and makes it at once: making it is reading and drafting, not an outward act.
   Anything outward still waits for a Go per round (D61).
3. The first round runs now when it can (a look at the fare; for a helper, the address is registered).
4. The reply is one sentence, then the **Keep's card** in the conversation (the first-made moment):
   the lantern lighting up once (1.6 s; none under Reduce Motion), **看守中** and its title, four lines
   (**什么时候 · 出声 · 到什么时候 · 在哪儿**, each its own row), the first round's result in the done ink
   (**第一次：现在 ¥2,340，还没到 ¥2,000**), and **打开 · 改一下 · 撤销**.
5. The first time ever, one line under it in the partner's words (D451's pattern): **它在手头的事的「看守中」里，
   一直亮着灯。平时不出声，有变化才说一句，要你定的时候才问你。**

D114's proposal card with a Go before activation is superseded for Keeps whose rounds only read and draft:
the card is a receipt with Undo, which is smoother and as safe. A Keep whose rounds would act outward without
asking (a standing go, D413) still asks once, with the act named.

### Made from a repeating task (H)

A task that rests on its own wait after a wake (D427's rule) **is** a Keep from that moment: no offer, no
question. The first time, the conversation's one line says where it went. Its task stays its round's body
(`run: same`).

### Made from a helper (H)

"Make a babysitter in Bridge that my agents hand PRs to" makes a Keep with an address. The address is a
detail of the Keep; the partner's ready line (D507) becomes the card's **Nowledge Mem 里登记好了，你的 agent 现在就
能找到它**. Settings › Agent 通信 lists the address with **打开** to the Keep's page.

### How it reports

- **A silent round** writes its round (the page's folded line) and beats the lantern once. No message, no push.
- **A change the person asked to hear** ("降到 2000 以下告诉我"; "能合并了说一声"): one line in the conversation
  as the partner, folded into the living message while unread (principle 7), and the sheet's line.
- **A change the person didn't ask about** (a new review request, a fare a little lower): the sheet's line
  only. The model judges which is which from the Keep's `speaks` (principle 21); code only enforces "at most
  one line a round".
- **Something needs the person**: one ask in 等你 with its default (D394's one card per round for drafts).
- **It can't keep time** (a computer asleep, out of allowance): D427/D429's health line and its one fix.

### How it ends

- **Goal met**: the round that sees it records `goal: met` with its evidence; the Keep says one line,
  **做完了：你订了 12 月 20 日的票（东航，¥2,180）。**, its lantern goes out with a tick, it stays a day under 今天做完,
  then lives under 已结束 in Past tasks with every round.
- **Stopped**: **停下** (asks once: **停下以后它不再醒来；已经在做的这一轮会做完。**), or "别看了" through the partner.
  An address is closed (Mem tells senders), held items' tasks finish their turn.
- **Paused** is not an end: its wakes are held, its items' tasks rest, the time it resumes is shown.

## 8. Visual concept: the lantern

The metaphor process (AGENTS.md) ran in research/221 §4: eight candidates including "no metaphor", a mapping
table with false implications, the rubric, three haiku raters (an LLM proxy for the three users).

| Mark | Mean of 25 | Blind read |
|---|---|---|
| **B. A clay lantern** | **19.3** | "a status light: on, idle, finished" (3 of 3) |
| E. A track with a pebble going round | 18.3 | "a repeating routine with laps" (3 of 3) |
| F. A fence ring with a gate | 16.7 | "a queue; items leave through the gate" |
| D. A pot with a sprout | 16.0 | "a habit tracker" |
| H. Ducter on a bench with a telescope | 15.3 | "the app's mascot; decoration" |
| A. A pebble with the repeat sign (no metaphor) | 13.3 | "a repeat setting, a cron job" |
| G. A kettle on a low flame | 13.3 | "a timer that whistles" |
| C. A string on a finger | 9.3 | "a one-off reminder" |

**Leader: the lantern**, not yet a clear winner over the track (one point on 25, LLM raters). Why it fits
beyond the scores: a light left on is the oldest picture of someone looking after something while you are
away (留一盏灯); it says nothing about time, so an arrival-driven helper and a 45-minute loop read the same;
its states map without a legend: **lit** on, **a brighter beat** a round did something (D498's beat, the same
language), **dim** paused, **out with a tick** done (goal met), **out** stopped. Its false implications, named:
"dark means broken" (3 of 3: so *out* always carries the tick or the word 停下了), "a light means online" (the
words carry health), and no mark carries "needs you" (as D507 found: the words and the needs-you ledge do).
The track's own false idea, "laps you count, a loading bar", is worse for a babysitter that never laps.

**Next before it is decided:** render both as clay art, show them on the prototype, rate again with images
and the author. The prototype draws the lantern as a flat placeholder and can switch marks
(`?mark=lantern|track|literal`).

**Clay art prompt (for when it is chosen; not generated here):**

> A small clay lantern in the Pebble style of the Ducter app: soft matte polymer clay, hand-pressed, rounded
> edges, warm beige body with a dark brown cap and handle loop, a frosted glass panel, a tiny orange flame
> inside glowing softly onto the glass. Three-quarter front view, centred, plain transparent background, soft
> top-left studio light, a gentle contact shadow, no text. Five matching variants with identical framing: lit
> (warm glow), lit brighter (a round just did something: a slightly larger halo), dim (paused: the flame small,
> the glass cooler), out with a small green clay tick token resting at its base (done), out (stopped: no
> flame, the glass clear). 512 × 512, also legible at 40 px.

## 9. The prototype

`apps/web/demo-standing-work.html`, a static page over the web client's tokens (`static/app.css`), no core.
Views: `view=onhand` (On hand at a glance with the babysitter, the review loop and the flight among the
author's ordinary work), `view=page&keep=babysitter|review|flight` (the opened page), `view=made&keep=flight|
babysitter` (the first-made moment); `lang=zh|en`, `theme=light|dark`. Data: hel's babysitter in D507's busy
shape (#11030 fixing lint, #10932 asking for /test, #10847 can merge, hawkingrei approved), the 45-minute review
loop (9 requests, 2 drafts), and a consumer's fare watch (illustrative fares). Shots in `.shots/standing-work/`:
every view at 1400 and 390, zh and en, light and dark, plus the three marks side by side.

## 10. Open questions (each with its default)

1. **Make at once, or a Go first?** Default: at once with Undo for Keeps that only read and draft (§7).
2. **Does a Keep's ask stay in 等你 or move the sheet?** Default: the ask in 等你, the sheet stays (§6).
3. **One Keep or two for the review loop and 100gle's to-dos?** Default: one, two wakes, as the person said it.
4. **The lantern or the track?** Default: the lantern, after the rendered-image round (§8).
5. **The section's name**: 看守中 / Looking after (D525; was 在照看的). Alternative: keep 一直在跑的 / Ongoing (no relearning; read as
   "never ends, always busy").

## 11. Build plan, in phases

1. **The model and its store** (core, protocol): `Keep` and `KeepRound` on the Log; `keeps.ts` builds them from
   today's `task_loop`, `helpers.json` and routines (a migration with no loss: every loop, helper and routine on
   hel becomes a Keep with its history); `OnHand.keeps` replaces `OnHand.helpers` and the card's `rounds`.
   Fakes: hel's loop and babysitter replayed.
2. **On hand and the page** (web and Mac): the section, the sheet, the page with its five parts and How it
   runs; Settings › Agent 通信 links to the page; Past tasks › Ongoing becomes 看守中 / 已结束. Shots against a
   demo core.
3. **The partner's verbs** (`keep_make`, `keep_change`, `keep_list` replacing `routine_list`/`routine_change`
   and the `helper` tool's make; one `say` line each, D429): persona rule, eval scenarios for the three users
   and a fresh haiku run (D175).
4. **Goals and speaking judged by the model**: `goal: met` with evidence and `news` per round, recorded by the
   round's report; code stops and says once. World puzzles: the PR that merges, the booking email, a fare at
   the line.
5. **The lantern as clay art**, rated with the track; motion (the beat, the lighting up); the phone's widget.
6. **Live on hel**: the babysitter and the review loop migrated, a week read for silent-round rates and asks.
