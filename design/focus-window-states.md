# Focus Window State Machine

> Design note for principle 10 · 2026-11-08 · Evidence: `research/06`, `research/02`, `research/05`.

A window has two independent axes. **Attention** is what the human sees on the card.
**Residency** is what the machine is doing, shown only in the power view. Every transition is a
Log event recording `actor` and `reason`.

**Actors:**
- **C**: the control plane, deterministic.
- **M**: the main AI.
- **W**: the window, which only *proposes* changes through `report_to_main`.
- **U**: the user.
- **T**: a waiter firing.

Only C and M set attention states. W's report is an input to them, never a state change on
its own.

## Attention

| From | To | Actor | Trigger |
|---|---|---|---|
| (none) | `queued` | M | opens a job that needs a window (principle 6) |
| `queued` | `working` | C | the first turn starts. A queue reason is always recorded: machine waking, lease busy, quota |
| `working` | `needs-you` | M | W asks a blocking question that M can't answer from the Log (12). If M can answer, it steers the answer in and the window stays `working` |
| `needs-you` | `working` | U / C | U answers, in the window or in the channel. Or the deadline passes and C applies a *reversible* default |
| `working` | `blocked` | C | W reports a typed wait (CI, external party), or the harness reports quota exhausted. C registers the waiter |
| `working` | `blocked` | C | the task (or M for it) arms a condition wait (`wait_for`, D112): the reason is what it waits for |
| `blocked` | `working` | T | the waiter fires; for a task's own check or event, C wakes the task with what it saw (the partner is not woken) |
| `blocked` | `needs-you` | C→M | the waiter's deadline passes (`expired`): C sets needs-you with the reason and wakes M, which tells the user once |
| `working` | `working` | C | an `until` loop's try ends (D113): the report is judged; not yet → the next try is sent, and a `done` report does not move the task to `done?` |
| `working` | `done` / `needs-you` | C | the `until` condition holds (`done`), or the loop stops short: max tries, no progress, circles (`needs-you`) |
| `working` | `done?` | W→C | W reports done with evidence refs |
| `done?` | `done` | C + M | C checks the refs mechanically (CI green, artifact exists, diff non-empty); M judges whether they meet the done-criteria in the brief |
| `done?` | `working` | M | evidence is insufficient but fixable, so M sends a follow-up |
| `done?` | `needs-you` | M | verifying needs human judgment (taste, product call) |
| `done` | `working` | U / M | a follow-up arrives, even days later. The window reopens; it is not a new one |
| active¹ | `failed` | C / W | the circuit breaker trips on the same error N times, the environment is unrecoverable, or W reports failed. A retry is a *new* window |
| any non-terminal | `dropped` | U / M | "never mind", or M's plan changed. M records the reason |
| any non-terminal | `superseded` | C | handed off to a successor window (13). Points to the successor |

¹ active = `queued · working · needs-you · blocked · done?`.
Terminal states: `failed · dropped · superseded`. `done` is resting, not terminal.

**Stall rule:** if a window is `working` with no events for `T_stall` and no registered
waiter, C notifies M. The window's state does not change. M climbs the read ladder (8), then
steers, waits, or drops it.

**`done?` as built** (`done_claimed`, shown as Done). When a done report lands, the runner
checks each ref where that is cheap and reliable and sets its `check`: a commit sha (`diff` /
`log` ref) must exist and be on the task branch; a `file` path inside the place must exist;
tests, CI lines, URLs and logs are the task's word and stay unchecked (a task can't set `check`
itself). A ref verified and none missing → `done`. Otherwise the task stays `done?` until the
partner's result turn confirms it: it read the report and neither sent the task back nor asked
(no tool call; "M judges" is implicit). A ref Ducter found missing is never confirmed so; the
partner sees it marked and sends the task back. A worker's refs are not checked yet.

**Missing report:** if a turn ends without `report_to_main`, C sends one cheap nudge ("report
status"). If there is still no report, the window stays `working` and the stall rule applies.
C never guesses `done`.

## Residency

| From | To | Actor | Trigger |
|---|---|---|---|
| (none) | `provisioning` | C | the window enters `queued`: wake or pick a machine, prepare the environment, take the write lease |
| `provisioning` | `hot` | C | the process is up and the session has started |
| `provisioning` | `offline` | C | the machine is unreachable after backoff |
| `hot` | `warm` | C | the turn ended and the process is alive and idle |
| `warm` | `hot` | C | input arrives: steer, queue, answer, follow-up |
| `warm` | `parked` | C | idle ≥ max(cache TTL, 15 min) and no background work inside the window. Kill the process; keep the session ref and environment |
| `parked` | `hot` | C | input arrives. Resume by session ref. If the harness rejects the resume, start a new session in the *same* window from brief + checkpoint |
| `parked` | `archived` | C | attention is terminal, after a grace period; or the window is `done` and idle ≥ the archive horizon (default 14 days). Reclaim the environment: remove the worktree directory, keep the branch, the transcript, and the Log. Blobs age out (1) |
| `archived` | `provisioning` | C | a follow-up arrives. Rebuild the environment from the branch, then resume from brief + checkpoint |
| any | `offline` | C | the machine heartbeat is lost |
| `offline` | (previous) | C | the machine is back. Reconcile with the harness's own state |

C may wake a sleeping machine when input arrives for a parked window on it.

**As built (runner).** A rejected resume, and a task moved to another agent (D89, no session
there yet), start a new session in the same task: the brief stays in its system prompt, every
checkpoint and then the waking message are its first turn, and a system line says so
(`raw.fresh: "resume_rejected"`). The archive horizon is a sweep at start and hourly: a
`done`, `done?` or `failed` task idle 14 days (`DUCTER_ARCHIVE_IDLE_MS`) is archived; a
worktree with leftovers is kept and the task stays parked, never force-removed. Dropped tasks
keep their worktree for Undo and are not swept yet (`todo.md`).

## Cross-axis invariants

1. Residency never changes attention, with three explicit exceptions (D52 adds the third):
   a device asleep for more than 2 minutes sets its working tasks to `blocked` with reason
   "设备睡着了 / device asleep", and they return to `working` on wake. The other two: a failure to
   provision becomes `failed`, and `offline` past its limit while `working` notifies M, which
   may hand off to another machine (→ `superseded`).
2. Waiting is free. `needs-you` and `blocked` windows park like any idle window. A human who
   answers hours later doesn't cost a running process.
3. A terminal attention state always leads residency to `archived`.
4. One writer per write set. The lease is held from `queued` to a resting or terminal state
   and taken again on reopen. If the lease is busy, the window stays `queued` with reason
   `lease`.
5. The card shows attention and the queue or block reason. Residency is visible only in the
   power view.
