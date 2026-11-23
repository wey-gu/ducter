# 212. A day's wait for a merge that couldn't come, a reviewer's request unanswered (D496)

> Source: the home hel's Log for task xfnccfi7 (Claude Code, Opus; PR nowledge-co/mem#10847),
> read only by the lead (`sqlite3` with `mode=ro` over ssh); the PR's state on GitHub read with
> `gh` (read only); Ducter's code at 0.1.23. The Log lines stay on hel; tests use synthetic data
> with the same shapes.

## What happened (times UTC)

| Time | Event | Tag |
|---|---|---|
| 11-21 21:51 | the person opened the task from GitHub issue #8826; the task's language `en` (the issue's), the screen's zh | VERIFIED (Log, `task_open`) |
| 11-21 22:07–22:21 | commits 1bd6ea7 and 4b52ac6; PR #10847 opened, its description and labels edited; a wait on `gh pr checks --json state` (all of SUCCESS/SKIPPED/NEUTRAL) | VERIFIED |
| 11-22 03:17 | hawkingrei submitted CHANGES_REQUESTED on 4b52ac6: `rest_sources/source_graph_scan_tests.rs` still reaches the shared graph error response without the new initialization; "Please cover this path before closing #8826" | VERIFIED (gh) |
| 11-22 22:21 → 11-23 04:00 | the CI wait looked for 30 h and saw `9 of 10 match (9 SUCCESS, 1 PENDING)`: tide, the merge bot's status, pending on an approval, so "all checks done" never held; it expired | VERIFIED (Log) |
| 11-23 12:56:20 | the task's checkpoint: "all CI checks pass … Only tide pending on approved label … Work complete", `owns: ["nowledge-co/mem#10847"]` (its first declaration) | VERIFIED |
| 11-23 12:56:23 | report: "passes all of its CI checks … The only thing left is a reviewer's approval" | VERIFIED |
| 11-23 12:56:29 | wait "PR #10847 is merged" (`gh pr view --json state`, every 30 min, until 11-24 12:56) | VERIFIED |
| 11-23 12:58:10 | Ducter's first look at the PR: `owned_news` with `news: []` | VERIFIED |

## Causes

1. **A review from before the declaration was never news.** `core/src/owned.ts` (0.1.23) filtered
   every comment and review by `x.at < since` (`since` = the declaration, 11-23 12:56), and "the
   first look only learns where it stands": the 03:17 request (a day earlier) was read and dropped.
   VERIFIED (code; the empty `owned_news` at 12:58:10).
2. **Nothing said where the PR stands.** A look reported only what changed (new comments, CI's end,
   a push, merged/closed). Whether a request for changes still stands, who approved, which checks
   are pending: never a fact given to the task, to its wake, or to the partner's `[live]` line
   (`owns PR …` only). VERIFIED (code).
3. **"CI ended" could never hold with a merge bot's status.** The look's CI line needed every status
   out of `pending`; tide stays pending until an approval, so a failure or a success was never
   told while tide waited. VERIFIED (code; the 9/10 looks).
4. **The task looked at CI only.** Its own looks were `gh pr checks` and `gh pr view --json state`;
   it never read the reviews, so its report and its merge wait rested on half the PR. INFERRED
   (the transcript has no review read).
5. **The wait's heading mixed languages.** The reason is written in the task's language (`en`), the
   screen composes 「等 {reason}」 in zh: 「等 PR #10847 is merged」. The brief's language line named
   `summary` and questions but not `wait_for`'s `reason`. VERIFIED (code, the shot).
6. **The branch was cut inside a word.** `slugify` cut at 40 characters by grapheme:
   `graph-error-response-tests-intermittentl`. VERIFIED (`runner/src/places.ts`).
7. **Sent out listed commands, local ones too.** The opened task matched each Bash line against
   nine regexes and printed the first line: `sed -i … ; gh pr edit …`, `git add … && git commit …
   && git push`, a python heredoc ahead of `gh pr edit`. VERIFIED (`apps/web/src/store.ts`,
   `apps/desktop/internal/store/outside.go`).

## Implications for Ducter

- Where a PR stands is a fact of its own, read every look from GitHub's whole answer: each
  reviewer's latest decisive review (whenever written), approvals, requested reviewers, checks
  passed/failed/pending by name, mergeability. A request for changes that stands is told once,
  first look included; a failed check is news before the others end.
- The standing goes with every piece of news, with the task's own wake (its wait fired, ran out,
  can't tell, can't come true) and with its `wait_for` answer, and to the partner as short facts.
  Code says GitHub's rule (a standing request means no approval, so a merge wait can't come true);
  the model judges what to do.
- A heading composed in the screen's language never glues words of another language into it: it
  quotes them. The task writes its wait's reason in the person's language when told it.
- A cut name ends at a word's end.
- Sent out is what left the machine, read from each command's grammar (program, subcommand, flags),
  said in plain words; the command a hover away.

**Summary:** the task waited a day for a merge only it could unblock because Ducter's look at its
PR dropped a review older than the declaration and never said where the PR stood; the same view
mixed languages, cut its branch mid-word and printed commands as what went out.
