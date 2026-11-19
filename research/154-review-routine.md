# 154: A review that runs every 45 minutes and never reviews (D394)

The author, 2026-11-19: "我跑哪个让它每 45 分钟的 review 的最近几十次竟然都认为没有可以 review 的". The
task is swj3zc4w on hel (Codex, no place, started 2026-11-16 01:47, still running), briefed to
review the person's review requests and @mentions in nowledge-co with nowledge-co/mem's review
skill every 45 minutes. Evidence is the hel Log read-only (sqlite) and this repository's code; the
task's scratch files were not opened.

## What the Log shows

1. **It does find work** (VERIFIED, Log). Each round fetches GitHub search for
   `org:nowledge-co is:pr is:open review-requested:<person>` and `mentions:<person>`: 5–6 requests
   and 5 mentions, 8–9 PRs after dedupe. It re-checks heads and CI of the PRs whose head moved
   (10287, 10473, 10419) and writes `review-roundNNN.md` and `queue-roundNNN.json` into its scratch
   folder (141 review files). PRs whose head did not move (8528, 6497, 7743, 6095, 10332) were
   reviewed in rounds up to 65 and not since.
2. **Its report says only "nowledge-co 没有新的待审 PR。"** (59 times since 11-18). True of *new*
   requests; silent on the 8–9 still waiting on the person, on what it concluded for each, and on
   what changed in the round.
3. **Nothing it found reaches anyone** (VERIFIED, Log). No decision was ever raised by the task; it
   wrote nothing to GitHub; the findings live in scratch files on the home that the person never
   opens. The requesters never get a review. From the person's side no review ever happened.
4. **It wakes far more often than every 45 minutes** (VERIFIED, Log): 153 `wait_for` calls and
   about 3,700 `github.fetch` calls. Rounds start from other wakes too (a compaction, the runner's
   "Report status via report_to_main." nudge, a host restart re-running a cut-off turn), and each
   such round arms another timer while the earlier one stays armed: armed 04:52→05:37,
   04:55→05:40, 05:07→05:52, so rounds ran at 05:37, 05:40 and 05:52.
5. **One endless hot session**: dozens of compactions a day ("context is nearly full", a
   checkpoint, compacted), each re-sending the brief (D288's after-compaction turn). Cost and
   drift grow with the session.

## Causes in the code (VERIFIED by reading, 2026-11-19)

- **The brief asked for the line.** `packages/runner/src/brief.ts` (D349) told every task: "Work
  that repeats … that found nothing new says so in one short line, such as "nowledge-co 没有新的待审
  PR"". The task's 59 reports are that example, word for word.
- **The runner nudges a silent round.** `runner.ts` `missedReport`: a turn that ends without
  `report_to_main` gets one nudge. A round that found nothing and only called `wait_for` was
  nudged, and the nudge's turn is a model turn: it re-runs the round, reports "nothing new" and
  arms another timer. A turn resting on its own wait had no exemption (D266 exempts background
  work only).
- **Timers stack.** `work.ts` `timerFor` (D267) arms a new `wakes: "task"` timer on every call and
  never looks at the task's armed ones, so each extra round added a cadence. A restart rebuilds all
  of them from the Log (`waiters.ts`).
- **Nothing outward has a path.** The brief's Out of scope forbids publishing unless the brief says
  so, and nothing says how a review is to be posted. So the task, correctly cautious, kept its
  reviews in scratch, and the person was never asked. D61 GQ10 says PR comments ask without a
  countdown; the task never asked.
- **Hot forever.** A task resting on its own wait keeps its one session; each wake resumes it
  (D373's resumeOrSeed resumes by id while the session exists), so the session only grows and
  compacts.

## What fits the person (the heavy developer who set a reviewer running)

They expect reviews to land on the PRs, and to hear nothing while nothing changes. "No new" alone
is worse than silence: it reads as "nothing waits on you" while eight requests do. A review on a
colleague's PR notifies people and can't be unsent, so it is drafted and asked, once per round for
all drafts, never one card per PR and never silently.

## Implications for Ducter

1. **One timer per task** (built): arming a task's own timer replaces the armed one; the replaced
   one ends `cancelled` with `replacedBy` and never wakes the task out of Waiting. A nudge's,
   compaction's or restart's round moves the next round instead of adding one.
2. **A round resting on its own wait owes no report** (built): no nudge, no stall.
3. **The brief says silence** (built): a repeating round with nothing new doesn't report; a report
   says what stands, never "nothing new" alone while things wait; outward writes are drafted to
   files and asked once per round in one `needs_input` (default: post), drafts in `show`.
4. **Not built** (todo): fresh sessions per round seeded from the checkpoint and the task's state
   files, measured per harness; per-PR state on the To-do sources' GitHub to-dos (D341) and the
   Ongoing card's standing line; a draft viewer.

**Summary.** The reviewer did review; the brief told it to say only "nothing new", the runner's
nudge forced that line out of every quiet round and started extra rounds, its timers stacked, and
with no way to ask before posting its reviews stayed in scratch. Three code changes close the
noise, the stacking and the silent result; per-PR state and fresh rounds are the next step.
