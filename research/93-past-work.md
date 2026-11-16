# 93. Past work: finding earlier tasks, marking them, picking them up again, and keeping ongoing work

Date: 2026-11-16. Feeds D285. Sources: Ducter's own code (VERIFIED by reading and tests in this
change), the author's request, and a small label test with Haiku raters (LLM proxies only, no humans).

The author: "我在 [the author's current coding-agent app] 时代，会有找到以前 Session 继续做一些相关工作的需求…
这里就有点像是游戏里寻找旧的装备、卡片的类似的 flow…也需要给它们打标签、改名字、加 icon、标记以方便找到".
Later in the same loop: "我们得有像卡片一样收集查找维护各种任务的机制，比如我维护某些一直跑的、定期跑的任务时候，
有时候我会暂停，有时候再恢复、继续的需求".

## 1. What Ducter already had (VERIFIED, read in source)

| Fact | Where |
|---|---|
| Every task's whole story is in the Log: `task_open` (title, brief, project, place, harness), `task_event` (the person's words with `from: "user"`, the agent's words, tool calls with inputs such as `file_path`), `report` (summary, branch changes), `checkpoint`, `task_state` | `packages/protocol/src/index.ts` Bodies |
| On hand lists only active tasks and those touched in the last 24 h; older ones vanish from every client | `packages/core/src/registry.ts` `onHand()` |
| A finished task can be reopened: the runner resumes its harness session by id; when the harness rejects the resume (session pruned, other computer) it starts a new session in the same task from the brief plus every checkpoint ("之前的记录接不上了，从保存的进度接着做") | `packages/runner/src/runner.ts` `reopen`, `resumeOrSeed` |
| A merged or idle task is archived after 14 days idle (`DUCTER_ARCHIVE_IDLE_MS`): its clean worktree is removed, the branch kept; on the next turn the worktree is added back from the branch | `runner.ts` archive horizon, `send` (`provision` when archived) |
| Another agent can take a task over with its saved progress (D89 switch; D282 is building the in-task switch) | `packages/core/src/loadout.ts` `switchTask` |
| Routines pause and resume (by the person, the partner, or Ducter after failures, budget, unread runs, review); no "run now", no change of time | `packages/core/src/routines.ts` |
| A task's own wait can be looked at now or cancelled; nothing pauses it | `packages/core/src/waiters.ts`, D279 |
| The Log has full-text search (trigram + CJK bigrams) over every event, used by the partner's `log_search` | `packages/core/src/log.ts` |

So resuming was already there; finding was not, beyond the last day.

## 2. Scenarios (who, what they feel, how it starts)

| # | Who | Moment | Today | Wanted |
|---|---|---|---|---|
| S1 | Developer | "Continue the refactor I did last Tuesday" | Gone from On hand after a day; the person scrolls the conversation or asks the partner | Type "上周二 重构" or "refactor last tuesday"; the card is first; 接着做 |
| S2 | Developer | "That task where we found the flaky test's cause" | The cause is in a report, not in the title | Words match the report; the card says **它说过：…原因…** |
| S3 | Developer | "Reuse what the review task learned about this repo" | Start over, re-explain | 带着它开新任务: the new brief carries that task's reports, branch and files |
| S4 | Developer | "Show me everything about hawdb compaction" | Nothing | Words across titles, files, reports; the project chip narrows |
| S5 | All | "The one I starred" | Nothing to star | 标了星的 chip, starred first |
| S6 | Developer | "Reopen and keep going with the same agent, or a different one" | Reopen exists (partner only); switch exists in the opened task | 接着做, or ⋯ 换一个 agent 接着做 |
| S7 | Developer | Find by a file it changed (`picker.go`), a branch (`ducter/wal-fsync`), a PR | Nothing | Indexed from tool inputs, the place's branch and the merge/PR ref |
| S8 | Consumer | "The Kyoto hotel booking" / "那个订酒店的事" | Nothing past a day | Chinese words without spaces and filler (那个…的事) still find it |
| S9 | Consumer | "What did the dentist say" | Nothing | The person's own words in the task (改到下周四) are findable, shown as **你说过** |
| S10 | Fresh user | Looks for yesterday's result in On hand and it is gone | Confusion | On hand's last line **做过的事 ›**; Find with no match offers **在做过的事里找「…」** |
| S11 | Developer | A routine runs every morning; pause it over a holiday, resume after | Pause exists only as one button on On hand's shelf, no "until when" | 暂停 ▾ 1 小时 / 到明天早上 / 一周 / 直到我恢复; it resumes by itself |
| S12 | Developer | A review loop that looks every 45 min; pause it for the evening | Only 不用再去看了 (ends it) | 暂停 keeps the wait as it was; 恢复 brings it back |
| S13 | All | "Did my morning check run this week, and how did it go?" | Only the last run is shown | A row of run pebbles, oldest to newest, each with its outcome; tap opens that run |
| S14 | Developer | "Run it now" / "move it to 8:30 weekdays" | Neither | 现在跑一次; ⋯ 改时间 |

Edge cases: an old task whose harness session is gone (runner seeds a new session, says so); a task
on another computer that is away (Continue answers with the runner's offline line); a worktree
cleaned up (added back from the branch; a deleted branch fails with the runner's words); a dropped
task (Continue brings it back first, then any switch); hundreds of tasks (index built once from the
Log, kept live, queries read memory).

## 3. Capabilities each scenario needs

| Capability | Scenarios | Built in D285 |
|---|---|---|
| Every task listed, not only the last day | S1–S10 | `past` frame over the registry |
| Words across name, title, tags, branch/PR, project, files, the person's words, agent, reports, brief, the agent's words | S1–S4, S7–S9 | `core/src/past.ts` index |
| CJK without spaces, filler words dropped, bigram fallback | S8, S1 (zh) | `queryTerms`, `termIn` |
| Time words to a date range (今天…上周二…11月10日, last Tuesday…) | S1 | `timeWords` |
| Why it matched, in words | S2, S7, S9 | `hit` with field and snippet |
| Marks per persona: name, star, tags, picture | S5, all finding | `marks.json`, `past_mark` |
| A name that is the task's title everywhere | S5, S10 | registry `setMarks` |
| Continue: resume, else seed, worktree back, another agent | S1, S6 | `past_continue` over runner `reopen`/`send` and `switchTask` |
| A new task seeded with findings, linked back | S3 | `task_new.from`, `task_open.from`, `PastSeed` |
| Ways in from On hand and the switcher | S10 | links, Find no-match, ⌘O row, ⌘Y on the Mac |
| Ongoing: routines and resting tasks as cards with run history | S11–S14 | `core/src/ongoing.ts`, `ongoing` frame |
| Pause until a time / until resumed, for routines and task waits | S11, S12 | `ongoing_action pause` (+ `paused.json`, timer) |
| Run now, change when | S13, S14 | `routines.runNow`, `routines.retime` |

## 4. The name: a label test (LLM raters, Haiku, one candidate per call, 3 runs each, zh and en)

Question: an entry at the bottom of On hand, labelled X: what is inside, would you look here to
continue last Tuesday's refactor, would a starred task be here, does it hold only what you picked,
how natural (1–5).

| Candidate | Inside (paraphrased) | Only what I picked? | Natural |
|---|---|---|---|
| 做过的事 | the full history of past tasks; "pairs with 手头的事" | no 3/3 | 3, 4, 3 |
| 以前做过的 | history list | no 3/3 | 3, 4, 3 |
| 历史记录 | past records; "doesn't say tasks or conversation" | no 3/3 | 4, 4, 4 |
| 收藏 | what you starred | **yes 3/3** | 4, 3, 4 |
| 回顾 | a retrospective, maybe "to review" | no | 3, 3, 3 |
| 旧任务 | old, archived or stale | no | 3, 3, 4 |
| Past tasks | ended tasks, history | no 3/3 | 4, 4, 4 |
| Earlier work | older or finished tasks | no 3/3 | 4, 4, 4 |
| History | record of work that ran | no | 4, 3, 4 |
| Collection | stored or favourite items | no | 3, 3, 3 |
| Look back | a retrospective | no | 3, 3, 4 |
| Old tasks | age, maybe stale | no | 3, 4, 3 |

No label made raters sure they could continue from there (all "unsure"): that is the card's
button's job (接着做 is on every card), not the label's. 收藏 / Collection was read as starred-only:
rejected, despite the author's game image. 历史记录 scored highest in zh but was read as possibly the
conversation's history. **Chosen: 做过的事 / Past tasks**: literal, the glossary's own 事 / Task,
the twin of 手头的事 / On hand, and read as "everything done" by every rater. For the second
collection, **一直在跑的 / Ongoing** (literal; not rated).

## 5. The picture on a card: the metaphor process

What should the small picture on a card represent? Candidates:

| Candidate | Maps to | False implications |
|---|---|---|
| A. No picture (beautifully literal: title only) | nothing | none; but scanning 40 cards has no handle |
| B. Literal kinds of work (fix, build, look into, review, write, ship, data, talk, errand, idea) on a clay pebble | what the task was | a guess can be wrong (Ducter's default); a kind can look like a state |
| C. Game rarity frames (common, rare, epic) | how valuable it was | ranks the person's work; invites grinding; nothing to rank by |
| D. Free emoji the person picks | anything | renders as emoji on iOS (D211 forbids); tone clashes with clay |
| E. Colour only (a tint) | the person's own grouping | colour reads as state (green = done) unless the tints are muted and distinct |
| F. Project monogram | which project | duplicates the project line; no personal meaning |
| G. Collected badges or stickers per milestone | achievements | gamifies effort; false sense of progress |

Rubric (1–3 each: legibility without labels, mapping fidelity, scales to 50+, says state cleanly,
emotional fit, distinct from On hand's state art, feasibility):

| | Legible | Fidelity | Scale | State-clean | Feel | Distinct | Feasible | Total |
|---|---|---|---|---|---|---|---|---|
| A | 1 | 3 | 1 | 3 | 2 | 3 | 3 | 16 |
| **B + E** | 3 | 3 | 3 | 2 | 3 | 3 | 3 | **20** |
| C | 2 | 1 | 2 | 1 | 1 | 2 | 3 | 12 |
| D | 3 | 2 | 3 | 2 | 2 | 1 | 1 | 14 |
| E alone | 1 | 2 | 2 | 1 | 3 | 2 | 3 | 14 |
| F | 2 | 2 | 2 | 3 | 1 | 2 | 3 | 15 |
| G | 2 | 1 | 1 | 1 | 2 | 1 | 1 | 9 |

Chosen: **B on E**: ten drawn glyphs of kinds of work, each on one of six muted clay tints
(陶土 · 沙 · 苔 · 雾 · 藕 · 石) that are never a state's colour. Without a pick, Ducter's guess from the
task's own words is drawn in muted ink on the sunken ground (pressed in, not raised), so a guess
never looks like the person's choice. The collection feel comes from the person's own marks and the
star's pop, not from rarity. Comprehension of the glyphs was not tested with raters (they are
visual); the names are the tooltips and accessible names. A human test is in `design/todo.md`.

## 6. Ranking, as built (VERIFIED by `packages/core/test/past.test.ts`)

Field weights: name 6, title 5, tag 5, branch 4, project 4, file 3, the person's words 3, agent 2.5,
report 2.5, brief 2; a whole-word match 1, a word prefix 0.85, inside a word 0.6, CJK bigram share
≥ 0.5 scaled by 0.7. Every word must match somewhere; when none has them all, those with the most
words show. Recency multiplies by 1 + 0.35·e^(−days/21); a star by 1.15. The "why" line is the
field that explains the most of the words, never one the card already shows (tags, project,
agent). The tests cover a seeded corpus of 11 tasks: compaction (title before file before report),
`picker.go` (file), a branch, "the task where we found the flaky test's cause" (report), 改到下周四
(the person's words), 那个订京都酒店的事 (CJK with filler), "codex compaction" (agent), "last Tuesday",
上周二, yesterday, filters, marks per persona, the seed text.

## 7. Implications for Ducter

1. A finished task is never "gone": it is in 做过的事, findable by what anyone said or touched.
2. Resuming needs no new runner work: `reopen` already resumes or seeds, and adds a removed
   worktree back. The task-level API (`past_continue`) composes reopen, switch and send.
3. The person's marks are user data per persona (like projects), not Log events; the name is the
   title everywhere, the old title stays findable.
4. Long-running work deserves its own collection with one set of gestures (pause until, resume,
   run now, change when, end) whether it is a routine or a task's own wait; history is a row of
   run pebbles, not a log.
5. Not done here (todo): the partner using Past search as a tool (a persona/tool change needs the
   D175 eval); semantic search; a human comprehension test of the glyphs; marks on the phone app's
   native shell beyond the web client.

**Summary.** Ducter could already resume any task; it could not find one older than a day. D285
adds 做过的事 / Past tasks (search across every field, time words, the person's name, star, tags and
picture, Continue, New task from this) and 一直在跑的 / Ongoing (routines and resting tasks as cards
with run pebbles, pause until a time, resume, run now, change when). Label chosen by an LLM-rater
test (收藏 read as starred-only); picture chosen by a 7-candidate rubric.
