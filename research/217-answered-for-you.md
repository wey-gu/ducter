# 217. A task's ask the person already answered (D499)

> Source: the home hel's Log (task b7gw6r2e, Antigravity, PR nowledge-co/mem#10932), read only
> (Python's sqlite3 with `mode=ro` over ssh, a temporary script removed after); Ducter's code at
> 0.1.26. The Log lines stay on hel; tests and the world puzzles use synthetic data in the same shapes.

## What happened (times UTC, 2026-11-22/23)

| Time | Event | Tag |
|---|---|---|
| 11-22 18:02 | task opened; its brief quotes the person: 「我记得 100gle 在 slack 里讨论过…」「嗯嗯，弄好了直接给一个 pr 哈」「再试试？」 | VERIFIED (Log, `task_open`) |
| 11-23 01:22:03 | report `needs_input`: 3 of 4 Prow checks passed, `ci/mem-playwright-e2e` one flaky case; question 「在 PR #10932 评论 `/test pull-mem-playwright-e2e` 重跑该偶发失败的 E2E 检查？」, default 重跑 E2E, reversible | VERIFIED (Log, `report`) |
| 01:22:03 | core made the card (`decision`, Go 重跑 E2E, a 30-minute default) | VERIFIED |
| 01:22:08 | the partner relayed it: 「文案相关检查已通过，只剩一项界面测试失败。要我在 PR 里留言重跑这项检查吗？」 | VERIFIED (`ai_msg`) |
| 01:29:20 | the person replied to the card: 「你自己推进到能合并就好，这些都别问我」 (`decision_resolved` reply, forwarded to the task) | VERIFIED |
| 02:11 → 02:28 | the task finished on its own; the PR merged after a colleague's approval | VERIFIED (`report` done) |
| 06:23 | a later done report asked Ducter to end its own poll loop "without asking the user again"; another AI's look flagged that the message still asked | VERIFIED |

Other task questions on hel in the three days before (11-21 to 11-23): seven, none about a task's own
outward step besides this one (a Space name, a plugin version, a connect link, retries). VERIFIED.

## Causes (VERIFIED in code at 0.1.26)

1. **Only code made the card, and nothing could answer it for the person.** `decisions.ts`
   `onReport` turns every `needs_input` question into a card; the partner could only relay it.
   D495's standing go (`without_asking`, `STANDING_ACTIONS`: `pr_review`, `issue_comment`) is read
   only by the review routine's and the hand-over's own writes (`standing.allows`), never by a
   task's question.
2. **A reply like 「这些都别问我」 went to the task once and nowhere else.** It answered that card as a
   reply; nothing kept it, so a later session (a fresh round, D394; a compaction) or a later ask of the
   same kind would ask again.
3. **The task's brief never said what it may do without asking.** `brief.ts` says pushing,
   publishing and anything that reaches other people are out of scope "unless the brief says so
   explicitly"; the partner's brief quoted 「弄好了直接给一个 pr 哈」, which the task read as leave to
   open a PR, not to comment `/test` on it.
4. **The words without_asking accepted were not only the person's.** `heardForStanding` reused
   memory_add's `heardWords`, which includes the text of the reports the turn answers: a task's
   summary saying "the user said not to ask" would have passed the check.
5. **D437's 这类不用复查 was read from the person's words by regexes** (`readNoLook`, `NO_LOOK_*`,
   `keepNoLookAtOnce`) and pointed at "the last result another AI looked over" by code (principle 21).

## Implications for Ducter

- A task's question about one of its own outward steps is answerable by Ducter for the person, but
  only under something they said, kept as a go (for that task, or for its repo's owner), and only for
  steps that are reversible or visible to the PR's people alone: rerunning checks, commenting on its
  PR, pushing its own branch, commenting on the issues it works on. Merging, paying, signing in,
  deleting stay the person's.
- Whether a given question is that step is meaning: the partner judges it, code checks the ask and
  the go. The answer is recorded (`by: "said"`, the words) and shows in Done for you.
- The brief should say those steps up front, so the task doesn't ask.
- The words a go rests on must be the person's own, never a report's.

## Summary

hel's babysitter asked to post `/test`, and the person's 「这些都别问我」 reached only that one card.
Ducter had no way to answer a task's ask for the person, no place in the brief to say what the task
may do without asking, and accepted a report's words as theirs. D499 adds three task steps to the
standing go, an `answer` on `without_asking`, the brief's list, and retires D437's word reader.
