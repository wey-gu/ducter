# 205: Self-repair: what fails on a real home, and how Ducter should mend it (D473)

> 2026-11-22. Evidence for D473. The census reads one real home's Log export read-only
> (13 days, 2026-11-09 to 2026-11-22, two files: 5,045 task and device events, 3,027
> failure-related events). Counts and shapes only; no names, messages, keys or numbers from it
> are reproduced here, and the tests use synthetic shapes. The code facts are from this
> repository at 0.1.13. D472 (a can't-start reason on the task page, a folder pre-check, the
> duplicate `task_open`) was in flight at the same time and is not redone here.

## 1. The census

### 1.1 Tasks (VERIFIED: the Log export, counted by script)

41 tasks were opened (47 `task_open` events: a D120 early open logs a second one, and 5 tasks
were opened two or three times). At the end: 27 done, 6 failed, 5 set aside (dropped), 3 still
blocked.

| What failed | Tasks / events | What Ducter did | Did the person step in |
|---|---|---|---|
| **Couldn't start: a folder or repository not on that computer** (`not a git repository`, `no_folder`, `no_repo`) | 3 tasks, 4 failed starts, on 3 different days (11-19, 11-21, 11-22); the same missing folder on the same server three days apart | Marked the task failed with the reason (D395/D415); offered buttons; **never tried a fix itself and never told the partner** | Yes, every time: the person retried or asked the partner why (INFERRED from the following opens and the lead's account of 11-22) |
| **Couldn't start: something went wrong as it started** (`other`; the computer it was sent to wasn't connected) | 1 task, 2 failed starts within 15 s | The same: failed, card, no fix, partner not told | Yes |
| **Couldn't start: a git lock left behind** (`index.lock` exists) | 1 task, 1 failed start | Failed; the raw `git worktree add` text reached the living message (before D415) | Yes |
| **Couldn't start: the session folder was gone on the worker** | 1 start (the same task as row 1, a day later) | Failed with `Failed` as its only word in the living message | Yes |
| **A phone that went away or was handed back mid-task** | 7 tasks, about 25 `blocked` reports (phone unreachable, the emulator instead of the person's own phone, the loan ended and couldn't be renewed, the phone in the person's hands) | The tasks said so in their reports; each became a question for the person | Yes, all 7; 1 ended failed, 3 set aside |
| **A capability the task didn't have** (browser extension not connected, an account not shared with the task, a read-only connection, a plugin that wouldn't install) | 2 tasks, 7 `blocked` reports | Reported; the partner relayed | Yes |
| **The wrong agent for the person's own rule** | 1 task, 3 `blocked` reports (the task refused to work on the agent the person's rule excluded) | The task stopped itself and asked | Yes |
| **A step only Ducter could take** (post the approved review, release a held draft) | 2 tasks, 3 `blocked` reports | Reported, waiting for the partner | Partly (the partner had to act; not a failure of the task) |
| **Stopped without a report** (the stall rule) | not countable: the export carries 9 of the tasks' system lines only | The runner nudged once, then set the task to `needs_you` (code: `runner.ts` `missedReport`); **the partner is not told** | The person sees 等你 |

**What reached the person:** every start failure (8 starts, 5 tasks), every phone and
capability block. **What Ducter mended by itself:** none. Read through D473's own counter
(`ducter repairs`, below) over the three weeks: 3 start failures that carry a cause (the
earlier ones predate D395's `cant`), 0 healed, 0 handed to the partner, 3 reached the person.

### 1.2 The partner's own world (VERIFIED: the failures export)

| What failed | Events | What Ducter did | Did the person step in |
|---|---|---|---|
| **Watching an account: an action the connector doesn't have** (`unknown action`, three Discord actions) | 2,305 over 6 days, about 420 a day, every look | Nothing, until D402 (11-19): now a source whose every action is unknown stops by itself and its row says so | The person turned that watch off by hand before D402 |
| **Watching: a read classified as a write and refused** (`a write outside the Go path`) | 489 (11-10 to 11-12) | Fixed in code on 11-12 | No (silent) |
| **Watching: calendar inputs wrong, a credential race, a provider error** | 73 | Fixed in code (inputs); the race and the provider error are passing | No |
| **Watching: a connection not connected** | 1 | D402 now stops and says 要重新连接 | No |
| **An outward action that failed** (one phone call; one settings change through a connector) | 2 | Told once (the call's end wakes the partner, D193) | Yes, as it should (outward) |
| **Update all** (Ducter and the agents, 132 runs) | 1 run with 1 failed item; 1 Ducter update failed its health check (0.0.x era); 1 "agent update failed" that was really "already up to date" | Rolled back or said on the computer's card | No |
| **A waiter's check that couldn't run** (its computer offline) | 3 of 58 looks | Looked again at the next tick | No |
| **The partner's own session** (a stuck turn, its agent gone, a failed turn) | not in the export | Code: a 10-minute silence interrupts the turn; a stream that ends with nothing drops and rebuilds the session; D435 holds a turn that failed on its agent and runs it again or on another; D106 never loses or doubles an outgoing message | Not countable from the export (INFERRED: rare) |

**Reading:** the partner's side already has repair rungs (D402's back-off and stop, D435's
held turn, D106's outbox, the turn watchdog). Its gap was a week of 420 failures a day that no
one counted (fixed by hand, not noticed by Ducter). The tasks' side has fix buttons (D395,
D415) but no rung that uses them before the person does, and no path that tells the partner a
task never started: `triggersPartner` wakes the partner on a `report`, never on a
`task_state` (VERIFIED: `packages/core/src/core.ts`).

### 1.3 The 11-22 case, step by step (VERIFIED: the export, timestamps)

1. 02:58:43: a task opens on the Mac, which isn't connected: failed, `why: other`.
2. 02:58:54: a second task for the same work opens on the server with a folder path that
   isn't there: failed, `why: no_folder`.
3. 02:58:58: the first is tried again at once: the same failure.
4. 02:59:30: the second is opened twice in the same second and fails the same way again.
5. The task page says only 没能开始; the person asks the partner why.

What would have mended it: the person's own words named the repository; with
`place.remote`, D395's resolver finds a copy or clones one on the server (VERIFIED: the
`todos-take-clone-zh` eval scenario and `repo-where.ts`). The partner had the words; it was
never told the task hadn't started.

## 2. What the code already does (VERIFIED: source at 0.1.13)

- **Retries:** D372 (`kind-retry.ts`) retries an errand on a fast tier once on the smartest,
  only for that case. A start failure is never retried by Ducter.
- **Fixes on the card:** D395/D415's 在 X 上做, 拉一份到这里, 清掉旧的再试, 再试一次
  (`ws.ts`, then `places.replan`, then `runner.restartAt`); words to a never-started task start it
  again (D415).
- **Hand-offs:** D297 waits for an agent's limit or hands to another agent; D446's handing on;
  principle 13's checkpoints let a new session continue.
- **The partner:** the turn watchdog (`turnTimeoutMs`, 10 min), a gone session rebuilt, D435's
  brain hold, D106's outbox.
- **Push batching** already absorbs a failed state that turns working before its notice goes
  (D372's note in `push.ts`), so a mend that lands fast is never pushed.

## 3. Candidate architectures

Rubric, 1 to 5 each: **silence** (the person sees nothing for what Ducter can fix), **safety**
(never repeats anything outward; idempotence explicit), **bounded** (budgets, no thrash, no quota
burn), **judgment** (a fix that needs context reaches something that has it), **legible** (each
rung a record the steps and the builder can read), **cost** (tokens and code), **fit** (reuses
D395/D415/D372/D297 rather than a second mechanism).

| | Silence | Safety | Bounded | Judgment | Legible | Cost | Fit | Total |
|---|---|---|---|---|---|---|---|---|
| **A. Retry in the runner** (exponential back-off on any failure, inside `startFailed` and turn errors) | 3 | 2 | 3 | 1 | 2 | 5 | 2 | 18 |
| **B. Partner decides everything** (wake the partner on every failure; it reads and acts) | 4 | 4 | 2 | 5 | 3 | 1 | 3 | 22 |
| **C. A supervisor tree** (per-task supervisors with restart strategies, one-for-one, escalating to a home supervisor) | 4 | 3 | 4 | 2 | 3 | 2 | 1 | 19 |
| **D. A typed ladder in core: code rungs first, the partner as the judgment rung, the person last** (classify from the Log; cheap deterministic repairs with budgets; then a typed hand-over the partner reads; it asks once) | 5 | 5 | 5 | 4 | 5 | 4 | 5 | **33** |
| **E. Prevent only** (pre-checks before opening: folder, computer, agent signed in; no repair after) | 3 | 5 | 5 | 2 | 3 | 4 | 4 | 26 |

A fails safety: a runner that retries a turn can resend what a task already did outward, and
it has no context to pick a better place. B spends a partner turn on a lock file and has no
loop guard. C is the classic answer for processes, but Ducter's failures are mostly wrong
preconditions, not crashes, and a restart strategy can't clone a repository. E is D472's
half and is right as far as it goes: it can't see a computer that drops between the check and
the start, a lock taken in between, or an agent that signs out. **D is chosen**, with E as its
rung zero (D472).

## 4. Implications for Ducter

1. **A failure is classed where it happens and climbs one ladder**: retry (only what never ran),
   repair the precondition the way the buttons would, hand to the partner with what was tried,
   and only then the person, once, with the one real fix.
2. **Budgets in code, not in prompts**: two automatic tries per task a day, never the same one
   twice, six on the whole home an hour, two hand-overs per task a day; nothing while the person
   is on that task.
3. **Each rung is a Log event** (`mend`), so the steps say it in one quiet line and
   `ducter repairs` can count healed, partner-fixed and reached-the-person per week. On this
   home today the line is 0 of 3 healed.
4. **The partner must hear what never started** with the cause and what was tried; the
   `report` wake alone misses it.
5. **The partner's own side needs counting more than new rungs**: its watchdog, brain hold,
   outbox and D402's back-off exist; what was missing was anyone noticing 2,305 identical
   failures. Mid-run phone and capability blocks are mostly real asks of the person (a phone in
   their hand, an account to share); their repair is D446's and D297's hand-overs, not retries.

**Summary.** On one real home over 13 days, every one of 8 failed task starts (5 tasks) reached the
person, none was mended by Ducter, and the partner was never told any of them; the partner's
own watching failed 2,866 times with nobody counting. The fix is a typed ladder in core that
uses the repairs Ducter already has, hands what needs judgment to the partner, and counts
itself.
