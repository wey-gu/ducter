# 175 · Several things in one message: an ablation of what to add, the words, and when to speak

Date: 2026-11-20, on main after D421. Follows research/173 (the proposal) and the author's three
answers to it: (1) "用消融实验仔细分析是否需要引入新的概念，能否用其他好理解自然地方式表达；件是一个很奇怪的
中文表达，part 我感觉也是"; (2) "第一性原理仔细分析，用最优雅符合用户需求的方式去做就好，仔细对照我们的
motivation"; (3) the agent or harness of each thing is not shown in the conversation, only on hover
on the Mac, in On hand and in the opened task ("我觉得可以，要做的优雅"). Decided as D425.

Tags: **VERIFIED** = in hel's Log (research/173 §2.3), in the code at this commit, or in a rater's
answer quoted below; **INFERRED** = judgment.

## 1. The cases every candidate is walked through

| # | Case | What the person needs | Source |
|---|---|---|---|
| C1 | 11-12: "我下周有什么预约么 帮我在 gmail 日历记录我 20 号…，这个周日…，下周四…" (one look-up, three entries, one signed-in browser) | to see which of the four came out, not 「三项安排也都没写入」 | VERIFIED, hel |
| C2 | 11-16: five phone tests in one message, continuing the open test task | each test's result; the same task and phone | VERIFIED, hel |
| C3 | 11-18: a Beijing trip (hotel, the price gap, flights, the total) | ONE errand on one browser with its sign-in, never four tasks | VERIFIED, hel |
| C4 | A GitHub hand-over of three issues ("把 #10559 #10560 #10571 修了") | three tasks (three branches), each line its own state, one close-out | INFERRED from D385's hand-over |
| C5 | A follow-up "第二个改一下" | lands on the second thing's task, never a new task | INFERRED from D373 |

## 2. The ablation

From no new concept at all upward. "Breaks" is what the person would still see go wrong.

| Candidate | What it adds | C1 calendar | C2 phone tests | C3 trip | C4 three issues | C5 "第二个" | Verdict |
|---|---|---|---|---|---|---|---|
| (a) Tasks and groups only, split harder | Persona tells the partner to split every multi-thing message into a group (D360) | **Breaks**: four tasks on one browser fight over one sign-in, or one task still reports one blob | **Breaks**: five tasks on one phone collide; one task: still "五项都没测成" | **Breaks worse**: "split harder" is exactly the 11-18 failure | Works on On hand; nothing under the message | Ambiguous: "第二个" of what? The group's parts are numbered only on On hand | Fails 3 of 5, and makes C3 worse |
| (b) **A checklist of what was asked, as rows of the task that does them, shown under the message; no object, no noun** | `asks` on `task_open` / `task_send` (the person's words), `asks` on the task's report (each one's state), core logs the lines under the message | Works: one task, four lines, each ticks or flags on its own | Works: `task_send` with five asks on the same task; five lines under the new message | Works: one task, no asks (one goal); the persona says so, the eval checks it | Works: three tasks, one line each, under the message; one close-out (the hold, §4) | Works: the partner sees the lines with their tasks and numbers as shown | **Least that works** |
| (c) A new internal object with no shown name ("part": ask id, words, state, task) | Its own store, lifecycle and ids; a part could move between tasks or bind to a to-do by itself | Works | Works | Works | Works | Works | Same outcome as (b) at more cost: a second source of truth for state that a task already owns; buys only things not asked for yet (a part re-homed, a part bound to an issue apart from its task) |
| (d) A new named concept (件 / part / 事项) | (c) plus a word the person must learn | Works, with a noun on screen | Works | Works | Works | Works | Fails the vocabulary rule ("no concept to learn") and the author's own word on 件 and part |

**Choice: (b).** A line is the person's own words plus a mark; it is one row of the task that does it
(protocol `AskLine { words, taskId, state, note }`), so a task stays the only unit with a lifecycle.
Two floors make (b) hold even when the model forgets: a task's own state moves its open lines (a
failed or put-down task crosses its lines; a question flags them), and a second task opened for one
message with no `asks` puts each task's title under the message as its line (the eval's first probe:
haiku opened three tasks for three places and named no asks, 1 of 1; with the floor the person still
sees three lines). INFERRED: (c) is the right move only when a line must outlive or leave its task;
recorded in `todo.md` with that trigger.

## 3. The words

Every user-facing word in (b) is the person's own (the lines), the task's own (each note), or one of
three keys. Candidates for the one piece of copy that has to exist, the count under the lines, went
to naive LLM raters (haiku, one per user kind, no tools; the mock was the 11-12 case for the fresh and
consumer users and a three-issues-plus-CI message for the developer; each rated clarity and
naturalness 1–5 and picked one):

| Candidate | Fresh user | Consumer | Developer | Notes from the raters (VERIFIED, quoted) |
|---|---|---|---|---|
| Z0 / E0 no label | 3/4, 3/4 | 3/4, 3/4 | 4/5, 4/5 | "At 2–4 lines the marks and text are enough"; "not for 1–3 lines" |
| Z1 还剩 2 个 / E1 2 to go | 3/4, 3/3 | 3/4, 3/4 | 2/3, 2/3 | "'left' of what?"; "counts the failed item as still to do" |
| Z2 做完 4 个里的 2 个 / E2 2 of 4 done | 3/2, 4/4 | 4/3, **5/4** | 3/3, **4/4** | zh "里的 sounds translated"; en "clearest and natural" |
| Z3 4 个里好了 2 个 | 3/3 | 3/4 | 3/4 | "好了 could read as 'fixed'" |
| **Z4 好了 2 个，还有 2 个** / E3 2 done, 2 to go | **5/4**, **5/4** | **5/4**, 4/4 | **4/4**, 3/4 | "matches the marks exactly, no arithmetic"; "sounds like a person"; dev: "还有 includes the failure" |
| Z5 2/4 | 2/2 | 2/2 | 2/2 | "reads like a score" |
| Z6 4 件里做完 2 件 (On hand's group count today) | 4/3 | 4/3 | 3/3 | "a bit stiff, report-like" |
| Z7 第 2 件在做… / E5 Part 2 is… | 4/3 | 4/3 | 4/3, 5/3 | "'Part' sounds like a document"; "forces numbered lines" |

The AGENTS.md rubric over the five genuinely different ways to name the lines and their count (the
raters' scores feed the first column; the rest INFERRED). Scale: 1–5; false implications are what a
reader could wrongly believe.

| Candidate | False implications | Legible unlabeled | Mapping fidelity | Scale (2 → 12 lines) | State | Emotional fit | Distinct | Feasible |
|---|---|---|---|---|---|---|---|---|
| No label at all (marks only) | none; but "is that all of it?" past four lines | 4 | 5 | 2 | 4 | 5 | 3 | 5 |
| A noun per line (第 n 件 / Part n) | each line is an object to manage; numbering is an order to run in | 3 | 2 | 4 | 3 | 2 | 2 | 5 |
| A heading ("要做的事" / Checklist) | a list the person must maintain, a to-do app inside the chat | 4 | 3 | 4 | 3 | 2 | 2 | 5 |
| A fraction (2/4, 4 件里做完 2 件) | a score; 件 as a counter reads as report language | 3 | 4 | 5 | 2 | 2 | 3 | 5 |
| **The person's words + a plain count from four lines (好了 2 个，还有 2 个)** | "还有" could include a failed line (fixed: it counts only what is at work or waits) | 5 | 5 | 5 | 4 | 5 | 4 | 5 |

Picks: zh **Z4** by all three; en E3 (fresh user), E2 (consumer, developer). Chosen:
**好了 {k} 个，还有 {m} 个 / {k} done, {m} to go**, with the developer's catch fixed in the count
itself: *还有 / to go* counts only what is still at work or waiting for the person; a line that didn't
work counts in neither (its cross says so, and the partner said so at once). E3 over E2 so both
languages say the same two facts in the same order. The count shows only from four lines (all three
raters: the marks carry two or three), and only once something is done and something is left (so it
never reads "好了 0 个"). The two state words a line may need when its task gave no note:
**等你定一下 / Needs you** and **没做成 / Didn't work** (D212's 没能 + verb is for controls; this is a
state said in the partner's voice). No 件, no part, no heading, no numbers on the lines.

INFERRED limits: three LLM raters, one run each, are a proxy; humans are owed (`todo.md`). On hand's
group card still says **{n} 件里做完 {k} 件** and 第 {n} 件 (D360); the raters found Z6 clear but stiff;
moving On hand to the same words is a separate change with its own raters (`todo.md`).

## 4. When to speak (the author's question 2, from first principles)

The motivation's promise: a partner that "asks for my attention only when it is really needed", where
"only the few things that really need you reach you … batched into one message instead of a stream of
pings". Principle 7: attention is the scarce resource, people harvest in batches, only decisions earn
a push, and silence means success. Principle 6: ack → job → result, one shape.

Applied to several things in one message:

1. **A line that comes back done is told by its mark, not by a message.** The person asked one
   message's worth of things; one thing done is not yet the answer to that message. Telling it is a
   ping that asks for a read and gives no decision (the motivation's "stream of pings"). The tick under
   their own words is the evidence, visible the moment they look, and costs no attention when they
   don't. All three raters, unprompted: "Per-item pings would be noise" (VERIFIED, quoted above).
2. **A question or a failure is said at once,** in the partner's words, with its card and the push
   rules it already has. Something needs the person: holding it would waste their time and the other
   lines' (the line waits on them). Not batched with anything.
3. **When the last line settles, one message for the whole message:** how each came out, in one or two
   sentences (rule 5), the app's Details under it. This is principle 6's result made true for a split.
4. **No timed release.** research/173 proposed releasing held successes 30 minutes after the first one.
   Rejected: the tick already shows it without a ping; a release by the clock is a ping whose only
   reason is the clock. A thing whose answer is information ("我下周有什么预约") shows that answer as its
   line's note the moment it is known, so the person never waits on the slowest line to read it.

Mechanism (VERIFIED in code): core holds a done report of a task whose message still has lines of other
tasks at work (`core/src/asks.ts` `wakes`), and when the last one settles it wakes the partner with
every held report together, so the existing "several tasks reporting together get one message" rule
writes the close-out. One task for all the lines (C1, C2) needs no hold: its report already is the
whole message's. Owed (`todo.md`): the hold is in memory; a restart in the middle loses the close-out
(the lines still show every state).

## 5. Who does each line (the author's answer 3)

Not in the conversation (D129: no agent names in what the person reads). On the Mac a hover on a line
shows the agent's name, quietly at the line's end, in the muted ink; on the web the same on a device
with a fine pointer, never on touch. On hand's cards and the opened task already name who does it.
One rater (the developer) asked for a small grey tag always, "hover is too hidden for when something
fails": a failed line is said at once with its task one tap away, where the agent is named; kept as
decided.

## Implications for Ducter

- Build (b): `asks` on `task_open` and `task_send`, `asks` on the task's report, core's lines under the
  message (latest per message, revised in place), both clients drawing them, the opened task showing
  its own lines.
- Persona: name each thing in the person's words; run by place, never by thing; one goal is one task;
  a follow-up naming a line goes to its task; a result says how each came out.
- Hold single lines' successes; say questions and failures at once; one close-out.
- Words: the person's own, plus 好了 {k} 个，还有 {m} 个 / {k} done, {m} to go; no new noun.
- Owed: human raters; On hand's 件 copy; the hold across a restart; a line bound to an outside to-do.

**Summary.** Walking five real cases through four candidates, splitting harder (a) breaks the calendar,
the phone tests and the trip; a new object (c) or a named concept (d) buy nothing the cases need. The
least that works is (b): what the person asked, in their own words, as rows of the tasks that do them,
shown under their message. The only new copy is a count that three naive raters across the three user
kinds read best as 好了 2 个，还有 2 个 / 2 done, 2 to go. Single successes stay silent (the tick is the
evidence); questions and failures come at once; the message gets one close-out.
