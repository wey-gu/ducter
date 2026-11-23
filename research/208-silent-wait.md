# 208. A task asleep for six hours on a wait that could never end (D483)

> Source: the home hel's Log for task b7gw6r2e (Antigravity; PR nowledge-co/mem#10932), read only by
> the lead; the task's own post-mortem (its 01:19 checkpoint and 01:20 report); Ducter's code at
> 0.1.18; OAR 0.124.0 as installed. The Log lines stay in `.shots/` (never committed); tests use
> synthetic data with the same shapes.

## What happened (times UTC, 2026-11-22/23)

| Time | Event | Tag |
|---|---|---|
| 18:40:47 | the task pushed e2b8b625ff, edited the PR, armed a check wait: `gh api repos/…/commits/<sha>/check-runs`, `succeedWhen` every `check_runs[].status` equals `completed`, every 3 min, with an until | VERIFIED (Log) |
| 18:43, 18:52 | looks: `0 of 3 match (3 in_progress)`, `2 of 3 match (2 completed, 1 in_progress)` | VERIFIED |
| 18:55 | CI finished (playwright e2e failed with 42.6 KB of `output.text`); the answer grew to 80,090 bytes; every look from then logged `not JSON (exit 0): {"total_count":3,…` and `met: false` (an earlier 60,847-byte answer had parsed) | VERIFIED (Log; sizes by the task) |
| 19:07:25 | a P2 review comment on #10932 | VERIFIED (GitHub, by the task) |
| 19:30:00 | the wait expired: the task's card went to needs_you | VERIFIED |
| 19:30:06 | the partner asked in the channel whether to keep waiting | VERIFIED |
| 19:30:20 | with no reply, a new wait w_460e3b71cd with the same check and **no until** | VERIFIED |
| 20:09 | another task (swj3zc4w) noted #10932's failure in the channel | VERIFIED |
| 01:03 | the person wrote; the old Antigravity session couldn't be resumed; a fresh one started | VERIFIED |

## Causes

1. **A cap cut the answer before it was parsed.** `CHECK_MAX_OUTPUT` (64 KB, `protocol/src/checks.ts`)
   was applied in `realExec` (`checks-run.ts`) to stdout *before* `evaluate` parsed it. 80,090 bytes
   cut to 65,536 is never JSON, so `evaluate` returned `met: false` with a summary and the waiter
   scheduled the next look as if nothing were wrong. VERIFIED (code; the 64 KB vs 60,847 / 80,090
   sizes agree).
2. **"Can't be evaluated" was the same as "not yet".** `evaluate`'s `not JSON` branch, and a check
   that can't run (backed off forever), were indistinguishable from an unmet condition. VERIFIED (code).
3. **Expiry went to the person, then a blind re-arm.** `work.ts` set needs_you on `expired` and the
   partner was told to ask the person (`render.ts` `[wait ran out] … ask whether to keep waiting`);
   the task was never told. 20 s later (`loops.ts` `SETTLE_MS`) the keeper of a task in rounds
   (`ensure` → `armNext`) saw no own wait and no pending decision and re-armed the loop's `look` as
   recorded, which carries no until. VERIFIED (code; the 20 s gap matches `SETTLE_MS`).
4. **Nothing about the task's own PR could reach it.** No subscription existed: the PR was known only
   as an evidence URL after a report (`handover.ts` `prOf`); reviews, CI and other tasks' lines went
   to the partner or nowhere. VERIFIED (code).
5. **The resume was refused on a spelling.** OAR's Antigravity profile resumes only in the saved
   folder (`resumeKeepsSessionCwd`), confirmed by `session/list`'s cwd against the requested one
   (`shared/acp/resume-cwd.js`, `shared/same-directory.js`: `path.resolve` and `realpath` only). The
   worktree is `/root/ducter/worktrees/mem/在-hel-用-gemini-审改-mem-长文案并开-pr`; the task found agy
   lists it percent-encoded. The comparison then fails (`ResumeCwdError other_cwd`) and the runner
   starts afresh (`runner.ts` `resumeOrSeed`). VERIFIED (code path); the encoded listing INFERRED
   (from the task's diagnosis; agy's source isn't available).
6. **The 01:04 "可能卡住了" card** is the loop watchdog's elapsed-time alarm: D481's, not here.

## Implications for Ducter

- Evaluate whole, cap only what is passed on; an unevaluable look is a typed fact (`cantTell`) that
  ends the wait and wakes the task with its check and its last looks (principle 21: facts to the
  model, invariants in code).
- Every wait has an until (a day for a task's, a week for the partner's when none is given); its end
  goes to whoever waits, with the facts; the person is asked only by a model's judgment; the keeper
  never re-arms a look that ended without its condition.
- Ownership is a structured fact the task fills (`checkpoint.owns`); Ducter watches the PR and sends
  the news; other tasks' reports reach the owner by the PR's identity in their evidence, never by
  words; the partner sees ownership in `[live]`.
- A directory's identity must survive every spelling a session store uses; Ducter keeps D201's
  folder names in their own script and patches OAR's comparison until OAR has it (todo).

**Summary:** a 64 KB cap before parsing, "can't tell" treated as "not yet", an expiry that asked the
person while a keeper re-armed the same broken look without an until, no path for a PR's news to its
owner, and a resume refused on a percent-encoded folder name together made six silent hours.
