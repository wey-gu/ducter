# 90 · Naming a task that rests on its own wait, and its two buttons (D279)

*2026-11-16. Asked by the author on a real review loop that wakes every 45 minutes:
"立即查看 是马上触发下一次循环任务的意思，但是这个按钮的'立即查看'并不能让用户理解它是干啥" and
"其实叫 在等，也总觉得怪怪的，我们需要给出极其优雅高情绪价值游戏一般的体验". Method: AGENTS.md's
metaphor bar (candidates including no metaphor, a mapping table with false implications per
candidate, a rubric, naive raters). The raters are LLM proxies (Claude Haiku, `claude -p --model
haiku --no-session-persistence --tools ""` in a scratch folder, one candidate per call, a persona per
call, zh and en asked separately). No human raters yet.*

## What is being named

One state covers three kinds of wait. All three are "the task is not working now and comes
back by itself":

| Kind | What really happens | Example |
|---|---|---|
| a check, polled (`check`, `judge`) | core runs a small command every `everyMs`; when it holds, core wakes the task | "PR #1592 的 CI 通过", every 5 min |
| a loop's own wait (the author's case) | the task arms a check or timer at the end of each round; each wake is one round | review requests, every 45 min, 24 rounds today |
| a timer (`wakes: task`) | nothing happens until the time; then the task carries on | "明早 9:00 接着写发版说明" |
| an event | new items from a connection's trigger, as they come | "等域名续费的邮件" |

Between two looks **nothing is watching**: the check runs once at the next time (VERIFIED,
`packages/core/src/waiters.ts`, `scheduleLook`). Any word that says "watching continuously" is a
false implication. The On hand section **在等 / Waiting** also holds tasks that do *not* come back
by themselves (a computer asleep, a report that said blocked, **停下了，没说在等什么**).

What the clay character already shows (VERIFIED, `apps/web/static/art/waiting.webp`, Mac
`theme.Waiting`): Ducter sitting on a small bench, one hand shading its eyes, looking out. A
lookout who sits down between looks, not a guard on its feet.

## Candidates for the state

| | zh / en | Head, row, timer as shown to raters |
|---|---|---|
| A | 在等 / Waiting (today) | 在等 · 等 nowledge-co 出现新的 review 请求 · 21:59 再看一次 |
| B | 盯着 / Watching | 盯着 nowledge-co 的新 review 请求 · 21:59 再看一眼 |
| C | 守着 / On watch | 守着 … · 守到明早 9:00 |
| D | 歇会儿 / Resting (the bench) | 歇会儿，21:59 再去看 … |
| E | {time} 回来 / Back at {time} (section 过会儿回来 / Back later) | 21:59 回来看 nowledge-co 有没有新的 review 请求 |
| F | no state word, the sentence only | 21:59 再看 nowledge-co 有没有新的 review 请求 |

### Mapping tables (what each maps to, and what it falsely implies)

| | check | loop | timer | event | not coming back (asleep, blocked) | False implications |
|---|---|---|---|---|---|---|
| A 在等 | yes | yes | yes | yes | yes | passive, "stuck in a queue"; says nothing of who acts next; reads as 等 twice (在等 · 等 …) |
| B 盯着 | yes | half | **no** (nothing to watch) | yes | no | watching nonstop; zh 盯梢 / surveillance; "盯着明早 9:00" is not Chinese |
| C 守着 | yes | half | awkward (守到) | yes | no | a guard on duty, formal; nonstop like B |
| D 歇会儿 | between looks yes | yes | yes | no | no | idle or tired; raters asked "has it stopped?" |
| E 回来 | yes (next look) | **yes (each round)** | yes | yes (有动静就回来) | **no**: a lie for a task that won't come back | "back" can read as vague without its time |
| F none | yes | yes | yes | yes | yes | no group name; a row reads like a reminder for *me* |

### Rubric (1–5, from the tables and the raters below)

| | legible unlabelled | mapping fidelity | covers all kinds | state expressive (time, progress) | emotional fit (D36) | distinct | feasible |
|---|---|---|---|---|---|---|---|
| A | 5 | 4 | 5 | 2 | 2 | 1 | 5 |
| B | 4 | 2 | 2 | 3 | 3 | 3 | 5 |
| C | 4 | 2 | 2 | 3 | 3 | 3 | 5 |
| D | 3 | 3 | 3 | 2 | 4 | 4 | 5 |
| E | 4 | 5 for self-waking waits, 1 otherwise | 4 | 5 (the time is the word) | 4 | 4 | 5 |
| F | 3 | 5 | 5 | 4 | 3 | 2 | 3 (On hand needs a section name) |

## Rater results

Round 1 (`out-state.json`): six candidates, each shown alone with the three moments (an opened
loop, a CI row, a timer row), 4 personas × zh and en (n = 8 per candidate). q1 "what is it doing
now" (right: not working, will look by itself), q2 "the timer row at 9:00" (carries on), q3 "do
I need to act" (no); 1–5 calm, alive ("a partner keeping watch for you"), odd (5 = most awkward).

| | q1 | q2 | q3 | calm | alive | odd |
|---|---|---|---|---|---|---|
| A 在等 | 8/8 | 8/8 | 8/8 | 3.88 | 3.13 | 3.38 (zh 4.00) |
| B 盯着 | 8/8 | 8/8 | 8/8 | 4.00 | 3.50 | 2.63 |
| C 守着 | 8/8 | 5/8 | 7/8 | 3.63 | 3.38 | 2.75 |
| D 歇会儿 | 8/8 | 8/8 | 8/8 | 3.63 | 3.25 | 3.13 |
| E 回来 | 8/8 | 7/8 | 7/8 | 3.50 | 3.38 (zh 4.00) | **2.38** (zh 2.25) |
| F none | 8/8 | 6/8 | 6/8 | 3.75 | 3.38 | 3.63 |

Side by side, ranked by 8 raters (`out-rank.json`): zh first places E 3, F 1; en first places
A 3, E 1. Words raters used, unprompted: A "像在柜台前排队等叫号", "parked car"; B (all four zh)
"盯梢 / 监视"; D "它是真停了吗"; E "像家里人出门时说一声'我等会儿就回来'", en "a shop sign: back
soon … vague about when"; F "a placeholder label".

Round 2 (`out-r2.json`), the refined per-task wording against today's and "keeping an eye",
n = 8 each, with a new question q2': "between now and 21:59, what does it do?" (right: nothing;
it looks once at 21:59):

| | q1 | q2' (looks only at 21:59) | timer | calm | alive | odd |
|---|---|---|---|---|---|---|
| R1 today (在等 · 等 … · 21:59 再看一次) | 8/8 | 8/8 | 8/8 | 3.63 | 2.50 | 2.88 |
| R2 **21:59 回来** / Back at 21:59, + "看了 24 次 · 上次 21:14" | 8/8 | 6/8 (en 2/4) | 8/8 | 3.63 | **3.50** | 2.75 |
| R3 看着 / Keeping an eye | 8/8 | 6/8 (en 2/4) | 8/8 | 3.75 | 3.38 | 2.50 |

R2 and R3 lose q2' on the count alone: three en raters read "Looked 24 times" as "it checks all
the time". Hence the tally leads with its rhythm (**每 45 分钟看一次 / Looks every 45 min**) in
the build.

### The look-now button

With the head's context spelled out (it looks every 45 minutes, next at 21:59), every label was
understood (`out-buttons.json`, 5 labels × 8): a ceiling effect, so the test was rerun with no
context but the state "21:59 回来" and the label (`out-r3.json`, `out-r4.json`, n = 4 per language):

| zh / en | zh right | en right | zh sure / feel | en sure / feel |
|---|---|---|---|---|
| 立即查看 / Look now (today) | 3/4 | 4/4 | 2.50 / 2.75 | 3.00 / 3.50 |
| 现在就看一眼 / Check now | **1/4** ("opens a page for me") | 4/4 | 2.50 / 3.50 | 3.25 / 3.75 |
| 现在就去看 / Go look now | **0/4** | 3/4 | 2.00 / 3.00 | 3.50 / 3.50 |
| 提前看一眼 / Look early | 2/4 | 4/4 | 2.50 / 3.25 | 3.25 / 3.25 |
| 不等了，现在去看 | 1/4 | 4/4 | 2.75 / 3.00 | 3.75 / 3.75 |
| 让它现在就去看 / Have it check now | 4/4 | 4/4 | 2.75 / 3.50 | 3.75 / 4.00 |
| 叫它现在去看一次 / Check once now | 4/4 | 4/4 | 3.25 / 3.50 | 3.50 / 3.75 |
| 不等了，让它现在去看 | 4/4 | 4/4 | 3.50 / 4.00 | 3.50 / 4.00 |
| **现在就去看一次 / Check now** | **4/4** | **4/4** | 3.00 / 3.50 | **4.00 / 4.00** |

The finding: in Chinese a bare 看 is read as *the person* looking (a page opens), the author's
complaint exactly. What fixes it is either a subject (让它 / 叫它) or **一次**, which makes it one
round of the routine. 现在就去看一次 is the shortest that scored 4/4.

### The stop button

No context but the state, (`out-r5.json`): right = "it stops its scheduled checks; the task
stays".

| zh / en | zh right | en right | zh sure / feel | en sure / feel |
|---|---|---|---|---|
| 停止等待 / Stop waiting (today) | 2/4 (one: "deleted") | 4/4 | 2.50 / 3.25 | 2.50 / 3.00 |
| 不再看了 / Stop checking | 2/4 | 4/4 | 2.50 / 3.25 | 3.00 / 3.50 |
| **不用再去看了** / No more checks | **3/4** | 4/4 | 2.75 / 3.75 | 3.25 / 3.00 |
| 别等了 / Don't wait for it | 1/4 | 2/4 | 2.00 / 3.00 | 2.50 / 3.00 |

With the head's context (`out-buttons.json`): 不再看了 / Stop checking 8/8, 停止等待 7/8 (an en
rater: "deletes the task"), Never mind 6/8.

## Caveats

- LLM proxies are lenient and agree with each other; n is 4–8 per cell. Differences of one
  rater are noise. Human raters (the author first) should see the shots.
- Text only: raters never saw the ring or the bench pose.
- The reason line is the agent's own words ("约45分钟后继续检查 …"), which no wording here fixes.

## Implications for Ducter

1. **A wait of the task's own says when it comes back, in its state:** **{time} 回来 / Back at
   {time}** (an event: **有动静就回来 / Back when it happens**). It is the only candidate that maps
   a loop's rounds truthfully (it is not working; it comes back), it is the time the person wants,
   and it raised "alive" from 2.50 to 3.50 without losing comprehension. Its false implication
   (a task that won't come back) is avoided by scope: only a task with an armed wait of its own
   gets it.
2. **The On hand section stays 在等 / Waiting:** literal, understood 8/8, first for en raters, and
   true for every blocked task, including those that won't come back by themselves.
3. **Not 盯着 / Watching, 守着 / On watch:** they promise watching nonstop, and 盯着 reads as
   surveillance in Chinese. Not 歇会儿: it reads as stopped.
4. **Buttons say their result:** **现在就去看一次 / Check now** and **不用再去看了 / Stop checking**.
5. **The tally leads with the rhythm** (每 45 分钟看一次), then the count and the last look, so a
   count never reads as watching all the time.
6. The bench pose already says "sits, looks out now and then"; it needs no new art.

**Summary.** Six state words and nine look-now labels went to naive LLM raters in zh and en.
Every state word was understood; 回来 felt most alive and least awkward in Chinese, Waiting most
neutral in English, 盯着 read as surveillance. The opened task now says **21:59 回来 / Back at
21:59**, the section keeps 在等, and the buttons are **现在就去看一次 / Check now** (4/4 with no
context; 现在就看一眼 was read as "opens a page" by 3 of 4) and **不用再去看了 / Stop checking**.
Raw answers are in the session scratchpad (`raters/out-*.json`), not in git.
