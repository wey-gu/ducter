# 整理工作副本 / Tidying working copies (D514)

A repo task works in its own git worktree, which Ducter makes in the Ducter folder
(`~/ducter/worktrees/<repo>/<branch slug>`, D204, D198). Each one holds a full checkout and,
after a build, the project's dependencies: 210 to 540 MB each on the author's computers. Once the
work is finished and nobody can need that folder, Ducter removes it by itself, never loses work,
and says so quietly. This note is the mechanism; `decisions.md` D514 is the decision.

## Who, what they feel, how it starts

- **The heavy multi-agent developer** (the author): forty tasks a week across a laptop and a
  server. Before: 不放心 two ways at once: the disk fills with copies he never asked for, and he
  can't tell which of them still hold something, so he deletes none, or deletes one by hand and
  wonders whether it was the one with the uncommitted fix. After: 放心: what is finished goes,
  what matters stays, and one command says which and why.
- **The consumer** who asked for "fix the typo on my site": never thinks about copies. Before: a
  laptop that slowly loses gigabytes to something it can't name. After: nothing to do, and one
  line on the computer's card if they look: 整理过 12 个用完的工作副本，腾出 3.4 GB.
- **The fresh user**: meets it never, or as that one line. No setting, no prompt, no concept.

It starts by itself: the first sweep after start, then hourly. There is nothing to turn on.

## What stays (the keep-rules)

`packages/protocol/src/tidy.ts` decides from facts, in this order; the first that holds keeps the
copy, and is what `ducter worktrees` says:

| Keep | When | Read from |
|---|---|---|
| **live** | the task is working, waiting, needs the person, queued, or a turn or a start is under way (a `hot` session) | the runner |
| **waiting** | a wait of the task's own is armed | core's waiters |
| **looking_after** | a Keep (D511) holds the task, on or paused | core's Keeps |
| **pr_open** | a PR the task owns (D483, D508) is still open | core's owned PRs |
| **pinned** | the person starred the task (D285), or said to keep its copy (`ducter worktrees keep`) | the marks |
| **shared** | another task that stays works in the same folder | the runner |
| **not_ours** | the path is not under a worktrees folder Ducter made (`worktreesRootOf`): the person's own folders, anyone else's | the computer |
| **uncommitted** | files changed or untracked | `git status --porcelain` there |
| **unpushed** | commits on its HEAD or branch that no remote branch and not its base holds | `git rev-list --count HEAD <branch> --not --remotes <base> origin/<base>` there |
| **cant_tell** | git couldn't say, or an older worker doesn't know `copyFacts` | the computer |
| **away** | its computer isn't connected now | the worker link |
| **recent** | inside its window (below) | the card's last change |

The copy's facts are read twice: once for the plan, and again on the computer that holds it, by
`archiveWorktree`, right before anything goes. A worktree with commits nowhere else is kept
although `git worktree remove` would leave the branch: the copy is where the person would look.

## When: the windows, from the Log

- **Merged by Ducter** (Merge, `ducter merge`): at once, as before; the work is in the base.
- **Finished** (done, done · checking, failed, superseded): **3 days** after its last change.
- **Dropped**: **7 days**, Ducter's one Undo window (D142 keeps a folder's copy 7 days too).

Why 3 days: the cost of tidying a clean, pushed copy too early is one `git worktree add` (seconds)
plus the agent installing its dependencies again; the cost of keeping it is 0.2 to 0.5 GB a copy.
The question is how late people come back. On hel's Log (2026-11-24, 51 tasks over two weeks), 17
tasks were taken up again after they finished: 16 within 6 hours, the last after 52 hours, none
later. Three days covers every one of them and a weekend; the 14-day horizon before it covered
nothing more. The data is two weeks deep, so a return after weeks is unmeasured; it still loses
nothing (Continue makes a fresh copy). `DUCTER_ARCHIVE_IDLE_MS` and `DUCTER_DROP_UNDO_MS` change
the windows.

## How: only what Ducter recorded making

- `git worktree remove <path>` in the task's repository, never `--force` on a folder that is
  there, never `rm -rf`. The repo's folder under `worktrees/` goes once empty (D198).
- Only the path the task's own record names (its `place.worktree`, under a worktrees folder Ducter
  made). A folder in `worktrees/` that no task of this home names is never touched: it may be
  another home's, or from before.
- A copy whose folder is already gone: only its own record goes (`git worktree remove`, then
  `--force` only while nothing is on disk). Never `git worktree prune`: the person's other
  worktree records are theirs (D415).
- On a worker, through the worker protocol: `copyFacts` (read-only) and `archive` (which checks
  again). A worker from before D514 answers neither copyFacts nor the new checks; its copies stay.
- The branch stays. A branch only made for a task that never started goes as before (`-d` only).

## Said, quietly

- **The Log**: one `copy_tidied` event per removal on the task's stream (`taskId`, `device`,
  `path`, `branch`, `bytes`, `why`: merged / finished / dropped, `gone`), and the runner's line in
  the task (`Removed the worktree; ducter/x stays.`).
- **The computer's card** (Settings › 在哪儿运行 › that computer; web and Mac): one muted line,
  **整理过 {n} 个用完的工作副本，腾出 {size} / Tidied {n} finished working copies, {size} freed**,
  only after the first. No dot-joins (D291).
- **Past tasks**: the preview says **工作副本已整理，接着做会重新拉一份 / Its working copy was tidied
  away; Continue makes a fresh one** while the task stays archived.
- **`ducter worktrees [--plan] [--json]`**: per computer the line above, then each copy with
  **会整理 / Will be tidied**, **{date} 起会整理 / Tidied from {date}**, or the reason it stays.
  Changes nothing. `ducter worktrees keep <task>` / `release <task>` set the mark.
- Never a notification, never a line from the partner: silence is success.

## Continue on a tidied task

接着做 (D285, D391) adds the worktree back from the branch without asking (the runner's
`provision` with `again`): the local branch when it is there; when it was deleted since but is on
origin, from `origin/<branch>`, never a fresh branch off the base. Undo on a dropped task whose copy
went keeps it archived, so its next words add the copy back the same way.

## Not here (todo)

Scratch folders of tasks with no place (`<data>/scratch/<id>`, 8.8 GB on hel against 1.6 GB of
worktrees), a toggle for keep on the Past card, and a disk budget per computer: `todo.md`.
