# 177. Why the review loop stopped at round 185, and every other way a routine dies quietly

**Date:** 2026-11-20. **Decision:** D426. **Sources:** hel's Log (`/root/.ducter/ducter.db`, opened
read-only over ssh with a Python script that was deleted afterwards; no secret printed), Ducter's
code at `53c60669`/`deda4808` (0.1.1 plus D418–D425), the author's words in the conversation.

## 1. What the author saw (REPORTED)

On 0.1.1 the author asked 「我记得我有一个一直循环的 review 的任务，那个任务为什么不继续跑了？」.
The partner answered from the Log that the loop stopped at round 185 at 14:01 Beijing time, the
task was marked done and its fresh 45-minute timer cancelled, with 9 PRs still waiting. The opened
task ended with 「…已安排约 45 分钟后复查。审查记录」. Then: 「发现我们的 routine 任务不可靠呢…能接住
真实需求么？」 and 「你能继续么」.

## 2. The root cause (VERIFIED, hel's Log)

The "routine" is not a Routine (D114): hel's Log has **no** `routine` or `routine_run` event at
all. It is one task, `swj3zc4w` (Codex, place none on hel), opened 2026-11-16 01:47Z with the brief
「…你大概每 45 分钟查看一轮就好…」, that rests on its own timer between rounds (D267, D394). Its
history: 192 turns to working, 318 `progress` reports, 1 `needs_input`, 1 `blocked`, **1 `done`**;
190 own timers armed, 183 fired, 5 cancelled as replaced (D394), **1 cancelled with no replacement**.

Round 185, in order (UTC, seq):

| ts | seq | event |
|---|---|---|
| 05:57:58.923 | 31208 | its timer fires (`约 45 分钟后继续检查 nowledge-co 的审查请求与提及`) |
| 06:01:13.711 | 31265 | `checkpoint`: 「第185轮完成…下一轮首末扫…」 |
| 06:01:13.733 | 31266 | **`report_to_main` state `done`** (the round's summary, evidence verified) |
| 06:01:14.160 | 31267 | attention `done_claimed` (runner `REPORT_ATTENTION.done`) |
| 06:01:14.163 | 31268 | attention `done` (decisions.ts: evidence verified → done) |
| 06:01:17.114 | 31271 | **`wait_for` 45 min armed** (the agent's next round; the tool answered "Armed") |
| 06:01:21.478 | — | the agent's last words: 「…已安排约 45 分钟后复查。」, turn completed |
| 06:01:21.483 | 31275 | task_state `done`, residency `warm` (the turn's end) |
| 06:01:21.484 | 31276 | **the new timer `cancelled`**, origin `waiter`, no `replacedBy` |

So the chain is: **the agent's report state "done" for a round** → `decisions.ts` set the task's
attention to `done` (the only exemption was an `until` loop, D113) → the next `task_state` (the
turn ending) carried a FINISHED attention → `waiters.ts` cancels every armed wait of a finished task
→ nothing was left to wake it. Not a `task_close` by the partner (it has none), not the runner
ending the session, not D394's timer replacement (that sets `replacedBy`), not D413 (no post that
round). The agent armed its timer 4 s *after* marking the task done; `wait_for` accepted it on a
finished task and said "Armed", and the agent told the person it had scheduled the next round.

Why "done" on round 185 and never before: INFERRED. 184 rounds reported `progress`. Round 185's
checkpoint says the round was complete and nothing new happened at the end; its words read as a
round summary ("第185轮完成"). The report tool maps `done` to "the task is done" with no notion of a
round, and nothing in the brief or the wake text said a round's end is `progress`. One agent's
wording on one round was enough; the design let a word end a promise.

The loop came back at 10:37 only because the author asked 「你能继续么」 and the partner sent the
task on (round 186, armed 11:24Z). Between 06:01 and 10:37 nothing noticed: 4 h 36 min, about six
missed rounds, while 9 PRs waited; the hel upgrades at 07:27Z (0.0.99 → 0.1.0) and 08:21Z (→ 0.1.1)
restarted core twice and found nothing to re-arm, because a finished task's waits are gone for good.

**How many died this way before:** none on hel. This is the only loop task in hel's Log (the only
task with two or more own-timer fires), and the 06:01 cancel is its only wait that ended without a
replacement.

## 3. Every other quiet death path (code read, VERIFIED unless marked)

| Path | Before D426 | Seen on hel |
|---|---|---|
| A round reports `done` | the task is done; its waits are cancelled; no round again | yes, 11-20 06:01 |
| A round reports `failed` | the task is `failed` (FINISHED); its waits are cancelled | no |
| The harness crashes or exits (runner sets `failed`) | same as above | no |
| A round ends without re-arming (the agent forgot) | one nudge; after a second miss the task goes `needs_you` and waits forever | no |
| The partner confirms a `done_claimed` | done; waits cancelled | no |
| Restart or upgrade | armed waits are rebuilt (VERIFIED: the loop ran across ~30 restarts 11-16..11-20, e.g. 10:40Z 11-16 woke it); a loop already dead stays dead | yes (07:27Z, 08:21Z, nothing to rebuild) |
| The wake can't be delivered (worker asleep, runner not wired just after a start) | `runner.send` throws; work.ts logs a warning; the wait has fired, nothing re-arms | INFERRED possible (no instance) |
| Agent quota | D297 arms a wait on the reset and carries on in the same session | no |
| The platform refuses the schedule asked for | on 11-16 07:59Z the agent's clock-like check was refused (D261), it fell back to "wake on any new PR", and a quiet stretch ran 2 h 40 min without a round (08:05Z → 10:45Z) until a restart woke it | yes (fixed since by D267's own timers) |
| A Routine (D114) | its own record, catch-up and retries (D245); a failed run is retried; three in a row pause it and it is said | n/a on hel |

The common shape: for a task in rounds, the promise lived only in the agent re-arming its timer.
Anything that ended the task or skipped one arm ended the promise, and nothing watched it.

## 4. What the person needs (from the scenario, not the code)

- The heavy developer: a review loop is the point of having a partner; a loop that stops on a
  word is worse than none, because he stops checking.
- The consumer: "每天早上看一下机票，降到 ¥2000 以下告诉我" stops silently and the fare is missed.
- The fresh user: never sees any of this unless it breaks; then one plain line and one button.

## 5. Conditions

Condition-triggered work exists (VERIFIED): Routines take check / event / judge / watch triggers
(D114, D245), and a task can `wait_for` a check or an event between rounds. "有人请我 review 时" is
today the review loop (a timer) plus D341's GitHub source; "机票降到 ¥2000 以下" is a check or a
judge over a fare page; "CI 挂了" a check on `gh run list`. The gap was not expressiveness but
keeping: a condition loop re-armed by the agent had the same quiet deaths. D426 keeps the condition
a loop waits on (its `look`) and re-arms it the same way.

## Implications for Ducter

1. A task in rounds needs its own durable record, not the agent's habit: `task_loop`, rebuilt on
   every start, the one source of truth for "it repeats" and its rhythm.
2. A round's report (done or failed) must never end the task; only the person or the end
   condition they gave does.
3. Whatever else drops the next round (crash, finished card, forgotten re-arm, lost wake,
   restart) must bring it back by itself: one round, at its time or once soon, never a burst.
4. Overdue, stuck and failing loops must be said once, plainly, with one fix; quota already speaks.
5. The dead loop on hel is recognised on start (a loop by its rounds whose last own wait was
   cancelled by a finished card, within a week) and brought back, said once.
6. The card and the partner must both show a loop's health; on time stays silent.

**Summary.** The review "routine" was a task re-arming its own timer; round 185's `done` report
marked the task done, which cancelled the timer it armed four seconds later; nothing noticed for
4 h 36 min across two upgrades. The fix is to make the loop Ducter's promise (D426), not the
agent's word.
