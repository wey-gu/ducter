# 245: Tasks for builders: the truth on hel, the references, and a redesign

The author looked at 任务 / Tasks on the Mac app (0.1.98, home hel) and asked three things.
Are the categories good enough? Why do some Looking-after items seem to run for ever? Is the
surface strong enough for a production builder? This report answers all three. Part 1 reads
hel's Log and code read-only and explains each card on the author's screenshots. Part 2 covers
how production tools present 20–100 concurrent agent tasks. Part 3 proposes a redesign with
phases and the first two briefs. Another agent audits the conversation stream (research/244);
this report covers the Tasks surface only.

Method. Everything was read-only on 2026-11-27, between 15:14 and 15:26 UTC (23:14–23:26
for the author, UTC+8):
- `ducter status --json` on hel;
- the Log (`~/.ducter/ducter.db`, opened `readonly` through the shipped binary as Bun);
- hel's journal;
- `git remote get-url` in each project folder on hel, haswell and the Mac;
- `gh api` GETs for the PRs and issues named on the cards;
- the code at `39be4a891`.

Nothing on any machine was changed. Tags: VERIFIED means read from the Log, the journal, the
code or GitHub; DOCUMENTED means from a product's own public docs; INFERRED is marked with its
basis. Names behind "the open agent app" are in `private/245-notes.md`.

## Summary

- **Projects are folder names.** Both clients key a task's project by `project`, or else by the
  last segment of its folder. On hel, three lenses are one repository, `nowledge-co/mem`:
  **mem**, **nowledge-mem** and **mem-identity**. **来自 GitHub** is a to-do source, not a
  project. **其他** collects every task with no folder.
- **Loops that never end have one main root cause.** Every read of a PR's or issue's true state
  runs on the computer the task ran on. haswell has no `gh`, so on hel every read for a haswell
  task fails: "gh is not installed here", every five minutes in the journal. D633's settle path
  therefore never sees #11408 merged. Nobody is told; only the task hears it.
- **Smaller causes keep loops alive or make them look wrong:**
  - the model that reads a Keep's end takes a standing rule ("仅 Tide 批量合并，绝不手动合并") or a
    no-end ("用户明确要求停止") for an end;
  - a helper's task that times itself mints a second Keep, so it has two holders;
  - about 78% of round lines fail and are never asked again, so cards show a line from many
    hours earlier;
  - a review standing from another job sticks to an unrelated loop.
- **在做 was not true.** The 在做 card had been waiting for the person for 21 minutes:
  - a to-do source reported an issue as "just closed", although it had closed a week before the
    task was bound to it;
  - the task was told to wait for the person's answer;
  - the person's reply went to the partner, which said "任务已经恢复" and sent nothing to the
    task;
  - the task still says 在做, in English, because Ducter's note to it is English-only.
- **The paused review shows a fault as the person's wish.** The budget counts every token,
  cached input included, so its first run (5.27M) used 2.6× the 2M monthly cap. It paused, and
  its card reads 「已暂停 · 用户明确要求停止 · 上一轮 18:51: budget」.
- **The redesign rests on four rules:**
  - one project per repository identity, with machines and worktrees as attributes;
  - one state, derived in core, from which every surface reads;
  - every Keep shows its end, its rounds and its age, ends by itself, asks once when it stalls,
    and the person's "stop" ends it;
  - a dense, keyboard-first list with multi-select for the builder, while the calm board stays
    the default.

---

## Part 1: the truth on hel

### 1.1 What the board holds (VERIFIED, `status --json` 15:18 UTC)

The snapshot held 22 cards with counts `needs_you 0, working 2, waiting 2`, one armed waiter
(`w_ea12d77cb8`), 5 Keeps (16 in the Log), 1 helper, 2 routines, 4 groups and no open
decision. One open ask id, `d_b2855efd5c`, is not on the board.

| Task | Agent, machine | Attention / residency | What the screenshot shows |
|---|---|---|---|
| `zqcpawnf` 核对数据迁移设计并补齐统一备份与恢复 | Claude Code opus, hel | working / parked | 在做 21 分钟, its English line |
| `jxikmjm9` 独立复审远程访问设置并跟进 #11230 | Codex, haswell | working / warm | the helper's held item, and a loop Keep |
| `tmqpewpk` Refactor access anywhere setting page 等 2 个 | Antigravity, Mac | blocked / warm | 等结果, the group ui/ux |
| `4rg2ebi7` 修复 Mem 首次连接遇到 403 的体验（#11406） | Codex, haswell | blocked / parked | the 45-minute loop Keep |

### 1.2 The cards, one by one

**(a) The headline 「没有待你处理的，我在做。」** It comes from `needs_you = 0` and
`working = 2`, the lane counts in `apps/web/src/store.ts:1183` (`board()`) and the Mac's
`onhandboard.go`. The lanes come straight from each card's `attention`
(`store.ts:153 laneOf`). In truth two things wait on the person:
- `zqcpawnf`, which was told to wait for their answer (b);
- the review routine, which cannot run again until someone raises or changes its budget (g).

Neither is a decision card, so neither is counted. **Verdict: false.** It should read
有 2 个待你处理.

**(b) 在做 `zqcpawnf`, 21 minutes, "I've paused as asked and am waiting for the user's answer
on whether to stop."** The Log, all VERIFIED:

- 14:39 The partner binds the task to `nowledge-co/mem#10500` (`task_bound`, an item with no
  `state`) to check it. The issue closed on 11-20 at 05:37, a week earlier. The task reports
  done at 14:42.
- 14:52:31 The person writes 「没做完的你现在能帮忙做掉么？」. The partner reopens the task
  (`task_open`; attention working, hot).
- 14:53:09 The to-do source's first look at the bound item sees `closed`. Its `prev` state was
  defaulted to `open` because the bind recorded none (`core/src/task-sources/index.ts:529`). It
  logs `source_seen change: closed` and tells the task: "[Ducter] … was closed there by someone.
  … Finish your current step, then wait for their answer before doing more." That text is
  English-only (`changeNote`, `index.ts:284–286`). It also asks the person
  `d_96dd5977b091` 「…在 GitHub 上关掉了。这个任务停下吗？」.
- 14:53:23 The task obeys: "I've paused as asked…", in English because the note was English.
  Its turn ends.
- 14:53:51 The person answers with a **reply**: 「如果问题实际上没做完，可以把任务再打开，甚至 issue
  再打开…」. A reply to a `closed` card goes to the partner (`index.ts:675`: "other replies are
  the partner's"), never into `onAnswer`. Only that function tells the task "Carry on"
  (`index.ts:743–746`).
- 14:53:59 The partner answers in 84 output tokens: 「可以，任务已经恢复…」. It called no tool. No
  event reached the task after 14:53:24.
- 15:08:25 The harness exits (parked). Attention stays `working`. No waiter is armed and no
  decision is open.

**Verdict:** the card should not have ended, but it should never have said 在做. It stood
under 在做 while it waited on a person's answer that the code never delivered, and the partner
said the opposite of what happened. There are four causes, listed in §1.5 as bugs B2 to B5.

**(c) 等结果, the group ui/ux, `tmqpewpk`.** This card is truthful. The task is blocked on CI
for PR #11230 at head `352a5bf`; it fixed rustfmt and Bazel failures from 15:07 to 15:22 and
reports each round. Its owned look runs on the Mac, which has `gh`, so it sees CI. Two faults
are only in the words:
- 「留言发出去了」 is the group's hand-over comment from 13:48 (`hand.review: "sent"`), not
  what the work is doing now;
- the title's 「等 2 个」 ("and 2 more", from a three-issue hand-over) sits under the section
  等结果 and reads as "waiting for 2".

This task is one of **three holders of PR #11230** on the board. The other two are (d) and (e).
**Verdict:** correct state, misleading words. It ends when #11230 merges.

**(d) 看守中: 「Nowledge Mem PR Babysitter 随叫随到 手上 1 个: 独立复审远程访问设置并跟进 #11230
正在做」.** The helper Keep `kp_c683e6dc3c` is on. It has held work since 11-24 00:47 and has
149 recorded rounds. Its item `jxikmjm9` really was in a turn (15:17–15:19). Its end is
per-item, a long paragraph: "…到可合并…不自行合并". That is fair for a helper.

The line on the card is from 14:59: 「#11230 的 Vitest 复审通过，等待当前提交的 CI 结果。」. The
rounds at 15:09 and 15:19 have `failed: true` lines, see §1.4 (C). **Verdict:** correct
state, stale line.

**(e) The loop 「独立复审远程访问设置并跟进 #11230 每 10 分钟一轮 · PR #11230 经 Tide 自动合并」.**
This Keep, `kp_9c76608d03`, was made by the system at 14:57:02. Ten minutes into its turn,
the helper's own task `jxikmjm9` set itself rounds (`task_loop`, `by: rounds`,
`everyMs 600000`, reason 「等待 #11230 的必需 CI 完成及原开发任务提供结果」).
`keeps.ts:481` makes a Keep for **every** task loop, with no check that the task is already a
helper's item.

The same round key `jxikmjm9:83621` is recorded in **both** Keeps (`keep_round` 15:19:00 and
15:19:04). This is a duplicate. Its end, "#11230 merged by Tide", is real, but it can only be
seen through the GitHub read, which fails for a haswell task (§1.4 A). It has 5 rounds, all
with failed lines. **Verdict:** it should not exist. If it did, it would never end by itself.

**(f) The loop 「修复 Mem 首次连接遇到 403 的体验（#11406）每 45 分钟一轮 · 1 个请求在等你 · 仅 Tide
批量合并… · 上一轮 0:32: 首次连接修复已合并；官网改动还剩一项检查待完成」.** This is `kp_32e13f1628`
for task `4rg2ebi7` on haswell.

- **Its age and rounds:** made 11-26 09:14, so it had run about 30 hours. It had 74 recorded
  rounds and 107 completed turns. Its wakes are recorded as every 4 minutes
  (`wakes[0].everyMs 240000`, the first rhythm, never updated); it actually runs every 45
  minutes.
- **Its end:** 「仅 Tide 批量合并，绝不手动合并。」. The end reader (`keepEndAsk`,
  `keeps.ts:248`) took the last sentence of the person's brief, which is a standing rule.
  It can never "hold", so a round can never report done on it.
- **The goal was met** on 11-26 at 10:50 UTC, when PR #11408 "fix(connectors): use the official
  CLI for first Cl…" merged (VERIFIED, GitHub). Issue #11406 is still open on GitHub.
- **What each round has done since:** looked for "the PR Babysitter's acknowledgement of
  #11408". At 21:08 on 11-26, ten hours after the merge, the task handed the already merged
  #11408 to the helper. Two hand-off records were made, keys `issue:…#11408` and
  `pr:…#11408`, for one item, which D609's "one key per item" forbids. Both went
  `unclaimed` a minute later. The `issue:` one settled at 06:43 on 11-27; the `pr:` one is
  still unclaimed. So every round waits for an acknowledgement that cannot come.
- **The last five rounds** (11:02, 11:48, 12:33, 13:19, 14:50 UTC) all have `failed: true`
  lines. The card's 「上一轮 0:32」 is the last round that got a line, 16:32 UTC on 11-26,
  22 hours old.
- **「1 个请求在等你」** is not about this work. On 11-26 between 09:20 and 09:57, the 403 task
  called `review_report` on #11374, #11421 and `nowledge-labs-website#419`. That is review work
  from the org-wide review loop, not its brief. The D394 review standing it left
  (`reviews.waiting 1`, website#419, `at 2026-11-26T17:03`) is shown by `apps/web/src/keep.tsx:235`
  (`keep.reviews`) as "1 request waits for you". The same open #419 is now counted as the 403
  task's own PR (`[owned] 4rg2ebi7 nowledge-co/nowledge-labs-website#419` in the journal).
- **Why D633 did not end it:**
  1. its GitHub read never succeeds, because it runs on haswell, which has no gh (§1.4 A);
  2. even with a working read, D633 makes a task done only when it carries "no other open PR",
     and it wrongly carries the open #419.

**Verdict:** it should have ended on 11-26 at 10:50, when #11408 merged. It has run 28
hours past its goal. **It is effectively infinite.**

**(g) 「nowledge-co 自动 PR 评审 已暂停 … 用户明确要求停止 · 上一轮 18:51: budget」.** This is
routine `rt_01ae95a83d`, as Keep `kp_16a8a15d65`.

- Its first run, 09:51–10:05 UTC, counted **5,269,302 tokens**, against a monthly budget of
  2,000,000 (`DEFAULT_MONTH_TOKENS`, `routines.ts:50`). After that the per-run cap was set to
  2× the first run, 10,538,604, larger than the whole month (`routines.ts:501`).
- The 10:51 run was `skipped` with reason `budget`, and the routine is `paused`,
  `pausedBy: system`.
- The card's 「用户明确要求停止」 is the routine's own 「一直做到：用户明确要求停止」. That is a no-end
  that the end reader stored as `until`. Next to 已暂停, it reads as "paused because the person
  asked to stop".
- 「budget」 is the raw skip reason code. `keeps.ts:757` says "A skip's reason is Ducter's own
  words … said as they are"; a code is not words.
- The brief says 每45分钟; the trigger is hourly.

**Verdict:** it should not have ended; the person wants it running. It is stopped by a budget
unit that cannot fit an agent run. Counting usage with cached input re-read every turn is
INFERRED: codex turns on hel show ~97% `cached` of `input` in `partner_session`. The stop
needs one decision from the person, and that decision is neither asked nor counted.

**(h) 「大模型记忆与持续学习前沿 每天 9:00」.** Routine `rt_ea4b08e1b9`, persona p3, is on, has no
end (`noEnd`), and is reviewed on 12-27. Its first run counted 878,218 tokens.
**Prediction (INFERRED from the same budget arithmetic):** the 11-29 run takes the month past
2M, so the 11-30 run is skipped for `budget`. The same 「已暂停 … budget」 card follows.

**Keeps already ended, for the pattern (VERIFIED, the latest `keep` snapshot of each):** 16
Keeps in all.

- **Ended at the D633 repair restart:** `kp_0b12df92c1` (the helper's review of #11580; 47
  rounds in 3.7 h, ended 14:24) and `kp_8b26663d89` (the helper's #11389; 70 rounds in 21 h,
  ended 14:26).
- **Ended by the person:** most of the rest.
- **Ends that are not ends:**
  - 「本轮优先直接评审 …#551…」, a this-round ask, was stored as the end of the 137-round review
    loop `kp_8907c58d86`;
  - 「对接手的 Mem PR 主动维护到可合并…」, the helper's rule paragraph, was stored as the end of
    the per-task loop `kp_0d4d2434ab`.
- In three days no loop ended by its own condition through the settle path. Every end came from
  a person, a restart repair, or a stop.

### 1.3 Projects: how the list is made, and which are one repository

**The derivation (VERIFIED):**
- Web: `apps/web/src/onhand.tsx:425` `lensOf` is `projectOf(task) || basename(repoPath |
  path) || "~"`. `projectOf` is `open.project ?? card.project`
  (`apps/web/src/store.ts:208`). The Mac does the same in
  `apps/desktop/internal/views/byproject.go:27` `projectOf` and `onhandboard.go:138` `lensOf`.
- `project` is set only on tasks opened from the Mac's New task ("nowledge-mem"). The partner's
  tasks carry `project: ""`.
- `packages/core/src/projects.ts` joins one origin across two computers (D455 `twin`), but only
  for folders **added by hand**. hel has no `projects.json`, so no inferred project is ever
  joined by its remote.
- **来自 GitHub** is `sourceGroups()` (`onhand.tsx:483`, D341): a lens by to-do source, drawn
  in the same column as projects.

| Lens on the screenshot | Folder (machine) | `origin` (VERIFIED) |
|---|---|---|
| mem (Hetzner Server, haswell) | `/home/w/ducter/projects/mem` (hel; `/root/ducter/projects/mem` is a link to it), the same path on haswell | `nowledge-co/mem` |
| nowledge-mem (Macbook Pro M3) | `/Users/weyl/dev/nowledge-mem` | `nowledge-co/mem` |
| mem-identity (haswell) | `/home/w/dev/mem-identity` | `nowledge-co/mem` |
| mem-backbone (haswell) | `/home/w/ducter/projects/mem-backbone` | `nowledge-co/mem-backbone` |
| nowledge-labs-website (Macbook Pro M3) | `/Users/weyl/dev/nowledge-mem/nowledge-labs-website` (a repo nested inside the mem checkout) | `nowledge-co/nowledge-labs-website` |
| 其他 | tasks with no folder: two routine runs, Prow-MCP setup on hel and haswell, a Mem mailbox, the research briefing | none |
| 来自 GitHub | tasks bound to GitHub issues (D341), drawn as a project | an origin, not a project |

So five folder lenses are three repositories, and one repository, `nowledge-co/mem`, is split
across three names. Each of the three shows a partial count (6, 2, 2), and none says "10
tasks on mem across 3 computers". The same rule is implemented twice, in TypeScript and Go,
so any fix must land twice unless core derives it.

### 1.4 Root causes, across the cards

**A. A GitHub fact is read on the task's computer (VERIFIED).** The path:
- `work.ts:182` `check()` runs any look on `placeOfCheck(task.place).device`;
- `holdings.ts:198` (D633's settle read) and `owned.ts:203–245` (a task's own PRs) both pass a
  `taskId`, so a haswell task's `gh api repos/…/pulls/n` runs on haswell;
- haswell has no `gh` at all (`which gh` fails; the worker's PATH holds none);
- hel has one in `~/.ducter/tools/bin/gh`, and `useOwnTools` puts it first on the home's PATH.

The journal says `[owned] <task> <ref>: gh is not installed here` every five minutes, for every
haswell task: `4rg2ebi7`, `jxikmjm9`, `bnc8n9q6`, `9xqxtqpu`, `gr5cfyew`. The task heard it on
11-26 at 09:14 (「这次查看判断不了：the look can't run: gh is not installed here」). The person
never did, and no card shows it.

A PR's state is a fact about github.com, not about the computer. It should be read wherever a
signed-in `gh` (or the home's own GitHub token) exists, the home first. Only checks about the
machine itself (a file, a port, a local build) belong to the task's computer.

**B. The end is read by a model from words that hold rules (VERIFIED).** `keepEndAsk`
(`keeps.ts:248`) gets the title, `said` and brief, and asks for "when it ends". Its answers on
hel:
- the rule 「仅 Tide 批量合并，绝不手动合并。」;
- the no-end 「用户明确要求停止」;
- the this-round ask 「本轮优先直接评审 …」.

The answer is recorded once and never asked again. A Keep whose end cannot be observed has
no way to end, and nothing flags that.

**C. Round lines fail and stay failed (VERIFIED counts, cause INFERRED).**
- From 11-26 12:00 to 11-27 15:00 there were 287 `keep_round` lines with `failed: true` and 80
  with a line, about 78% failures. Whole hours had no successes (11-26 23:00 to 11-27 01:00).
- `drainRounds` (`keeps.ts:835–860`) writes `{failed:true}` permanently ("recorded and never
  asked again").
- The card shows the newest round that **has** a line (`keeps.ts:913`), with that round's time.
  So a failure makes the card older, not emptier.
- The cause is INFERRED: the 60-second timeout of `createHarnessAsk` on the partner's cheap model
  (codex), or answers that are not JSON. The `keep-round` folder is empty, so no transcript was
  kept to tell which.

**D. One task, many holders (VERIFIED).** Three things make it happen:
- every `task_loop` becomes a Keep (`keeps.ts:481`), including a helper's task (e);
- a task that hands work over can make two hand-off keys for one number (`issue:` and `pr:`,
  (f));
- the PR's own author task, the helper's task and the loop all stand on the board for #11230.

Nothing in core says "this outside thing has one holder".

**E. Attention `working` does not mean a turn is running (VERIFIED).** `zqcpawnf` ended its
turn at 14:53:23 and its harness exited at 15:08. It still says `working`, because only a
report or a stop changes attention. D633's `close-loop-repair.ts` fixes such a card once, at
the first start (it fixed `tmqpewpk` at 14:24). After that, nothing checks the invariant while
running.

**F. The loop protocol forbids done (VERIFIED).** A loop with no `until` is told every round:
「这是循环里的一轮：这一轮做完，用 report_to_main 报 progress，不要报 done」 (`work.ts:122`). With a
`until` it may report done only when "that line holds" (`work.ts:123,127`). So when the end is
wrong (B), the agent is never allowed to finish, even when the work is over. Nothing counts N
rounds with no progress and asks the person.

**G. Words from Ducter to a task are English-only in places (VERIFIED).** `changeNote`
(`task-sources/index.ts:284`) and the "Carry on" line are English for a zh brief. The agent
mirrors that language, and the card shows the agent's last text as it is. D519's
one-line-in-your-language exists for Keep rounds only, not for a task's row.

**H. The budget unit cannot fit an agent run (VERIFIED arithmetic, INFERRED unit).**
- `routines.ts:744–757` counts `inputTokens + outputTokens` per turn. With cached context re-read
  each turn, one 14-minute review run is 5.27M.
- The default month is 2M, and the per-run cap is set to 2× the first run, which can exceed
  the month.
- A routine with real work pauses after one or two runs.
- `pausedBy: system` is not counted as needing the person.

### 1.5 Bugs to fix right away

Each bug has its root cause, its file, and the card it explains.

| # | Bug | Root cause | Fix | File |
|---|---|---|---|---|
| B1 | Loops and tasks on haswell never settle; owned-PR news never arrives for them | GitHub reads run on the task's device, which has no `gh` (A) | Route `gh api` GETs about github.com to the home (or the first device with a signed-in gh). Keep device checks on the device. Say once, as a fact on the task, when no computer can read GitHub | `packages/core/src/work.ts:182`, `holdings.ts:198`, `owned.ts:191` |
| B2 | An issue closed before the task was bound reads as "closed by someone" | `prev` defaults to `open` when the bound item has no state | Record the item's state at `task_bound` (read it then). A first look with no prior state only records | `packages/core/src/task-sources/index.ts:529`, the bind path |
| B3 | A reply to "停下吗？" never reaches the task that was told to wait | Replies on a `closed` card go to the partner only | Every resolution of a `closed` card (go, hold, reply, default) releases the task. A reply is sent to the task with the person's words, and the partner sees it too | `task-sources/index.ts:675,743` |
| B4 | A card says 在做 with no turn running | Attention is not tied to a live turn; the repair runs once | Derive working from a live turn (or a queued start). A turn that ends with no report and no wait becomes `stalled`, shown as needs-you when it asked the person, else as stopped (D467's 停下了) | runner state → `packages/core` attention, `close-loop-repair.ts` made continuous |
| B5 | Ducter's notes to a task are English for a zh task | `changeNote` and siblings have one language | Use the task's language, as `work.ts` `W` already does | `task-sources/index.ts:284–288`, 745 |
| B6 | A helper's held task gets its own loop Keep (double rounds, double rows) | `keeps.ts:481` makes a Keep for every loop | A task that is a Keep's item never mints a Keep; its rounds go to the holder | `packages/core/src/keeps.ts:481` |
| B7 | Two hand-off records for one #11408 (`issue:` and `pr:`) | The ref kind is part of the key | Key by `repo#n` alone (GitHub numbers are shared by issues and PRs) | `packages/core/src/handoffs.ts` key builder |
| B8 | A rule or a no-end is stored as a Keep's end | `keepEndAsk` is asked for "when it ends" with no "observable" test | Ask for an end that a look can test, with its look. "Until stopped" maps to `noEnd`. A rule goes to `said`. A failed or untestable answer is shown as 没有说什么时候结束 | `packages/core/src/keeps.ts:248` |
| B9 | Round lines fail ~78% and are never retried; the card shows a line hours old | A permanent `failed` record; the card picks the newest round with a line | Retry a failed line on the next look (bounded). The card shows the newest round with its time, using the round's report gist when there is no line | `keeps.ts:835–860, 913` |
| B10 | A review standing sticks to an unrelated loop (「1 个请求在等你」) and its PR becomes the task's own | `review_report` from any task sets the standing; reviewed PRs join `owned` | Only a Keep made for reviews keeps a review standing, and it expires with its round. A reviewed PR is never an owned PR | `keeps.ts` reviews, `owned.ts` |
| B11 | A routine paused by budget reads as 「用户明确要求停止 · budget」 and is not counted as needing the person | Raw reason code shown; no-end shown as end; a system pause is not an ask | Words for each pause reason (「这个月的用量到了上限（2M），要放宽吗？」), counted under 待你处理 with Go | `keeps.ts:757`, `routines.ts`, web `keep.tsx`, Mac `keeps_card.go` |
| B12 | The budget cannot fit one run | Cached input counted; per-run cap above the month | Count uncached input plus output (or cost). Cap the per-run budget at the month. Set the default from the first week's real use, said once | `packages/core/src/routines.ts:50, 501, 744` |
| B13 | A loop's `wakes` keep the first rhythm (4 min) when the rhythm changes (45 min) | The Keep shape is copied once | Follow the loop's current `everyMs` | `keeps.ts` `fromLoop` |
| B14 | 「等 2 个」 in titles under 等结果 | The group title suffix | 「等 2 个」 becomes 「和另外 2 个」 / "and 2 more" | the group title builder (`task-groups.ts`) and i18n |

B1, B3, B4 and B6 are the ones the author felt. Fixing B1 alone ends the 403 loop and the #11230 loop by
D633's existing path. It does not end the 403 task, which still carries #419 (B10).

---

## Part 2: the references (DOCUMENTED unless marked)

Only what bears on grouping, true state, long-running work, density, bulk actions, saved views
and keys.

**Linear.**
- **Layout and grouping.** List or board (⌘B). Group by status, assignee, project, priority,
  cycle, label, team, and more, with sub-groups as swim lanes; dragging into a group sets the
  property. Sort by status, manual, priority, created or updated; status sort puts active work
  first. https://linear.app/docs/display-options
- **Density.** "Display properties" choose what each row shows (ID, status, assignee, priority,
  labels…) without hiding any item. Same page.
- **Saved views.** ⌥V saves any filtered list as a view, in the workspace, a team or a project;
  a starred view joins the sidebar. https://linear.app/docs/custom-views
- **Multi-select.** X, shift-click, ⌘A select; a bulk toolbar appears, and ⌘K acts on the
  selection. https://linear.app/docs/select-issues (page 404 to the fetcher; from the search
  snippet).
- **Status.** Fixed categories: Triage, Backlog, Unstarted, Started, Completed, Canceled;
  "Active" is Unstarted + Started. Blocked is a relation flag, not a status.
  https://linear.app/docs/configuring-workflows (snippet),
  https://linear.app/changelog/2020-03-11-issue-relations
- **Auto-close and auto-archive.** Auto-close closes issues untouched for a period, writes an
  activity entry and notifies subscribers. It never touches issues in an active cycle or an
  unfinished project. Auto-archive takes closed issues after a further idle period, about daily.
  https://linear.app/docs/delete-archive-issues
- **Recurring issues.** A cadence makes the next instance the day after the due date passes; no
  end condition is documented. https://linear.app/docs/creating-issues
- **Two places for two questions.** Inbox (notifications, J/K, snooze) and My Issues (Assigned,
  grouped by focus: urgent, blockers, active…) are separate.
  https://linear.app/docs/inbox, https://linear.app/docs/my-issues

**GitHub Projects.**
- **Layouts.** Table (called "high-density"), board and roadmap. Group by and slice by a field;
  field sums show in group headers.
  https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects,
  …/customizing-the-table-layout
- **Views.** Each saved view is a tab. A change shows a dot and stays private until Save.
  …/managing-your-views
- **Built-in workflows.** "Item closed" and "Pull request merged" set Status to Done, on by
  default. Auto-archive filters by `is`, `reason` and `updated` (14d/3w/1m) and applies to
  existing items when turned on. …/using-the-built-in-automations, …/archiving-items-automatically
- **Bulk edit and keys.** Bulk edit in the table: shift-click, shift+arrows, paste across
  cells, Undo toast. Keys: ⌘F filter, arrows, Shift+Space select, Space open, `e` archive.
  …/editing-items-in-your-project, https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts

**Conductor (conductor.build).**
- **Workspaces.** One workspace is one git worktree and one branch.
  https://www.conductor.build/docs/concepts/workspaces-and-branches
- **Sidebar status.** Statuses are backlog, in progress, in review, done (0.35.0). "Group
  workspaces by repository" (0.35.2). The sidebar shows GitHub status (merged, failing CI,
  conflicts) and "when an agent needs permission", and hover shows next actions (0.44.0).
  Person-made sidebar sections came in 0.85.0.
  https://www.conductor.build/changelog/0.35.0-workspace-status, …/0.35.2-…, …/0.44.0-…, …/0.85.0-…
- **Checks tab.** Git, PR, CI, review threads and todos; it discourages a merge while todos are
  open. https://www.conductor.build/docs/reference/checks
- **Archive and history.** Archive keeps git state and can be undone. A Workspaces page filters
  history by repo, branch or PR number. …/0.33.5-better-archiving, …/0.28.0-…

**Devin.**
- **Sidebar groups.** Group by status: Working, Ready, Blocked, Inactive, with "PR awaiting
  review" and "needs your input" listed apart (Sep 2026). The sidebar names the approval a
  session waits on ("Approve skill"). Group by PR status or by repository; filters by origin,
  tag, creator. "Mark done" (⌘⇧E) replaced Archive (Nov 2026). https://docs.devin.ai/release-notes/overview
- **The API status.** A top-level `status`, plus `status_detail`: working / waiting_for_user /
  waiting_for_approval / finished.
  https://docs.devin.ai/api-reference/v3/sessions/get-organizations-session
- **Schedules.** A row per schedule with frequency, last run and Active / Paused / Error (Error
  means consecutive failures), and a **Past Sessions** tab. A one-time schedule disables itself
  after running. Notifications on failure only by default.
  https://docs.devin.ai/product-guides/scheduled-sessions.md

**Cursor cloud agents.**
- **Parallel runs.** "As many agents as you want in parallel", from desktop, web, mobile,
  Slack, GitHub, Linear and the API. https://cursor.com/docs/cloud-agent
- **Release notes 3.28–3.31.** https://cursor.com/docs/release-notes:
  - archive with Undo (⌘Z);
  - the worker machine's name in the sidebar;
  - an agent's open question in a "question tray" without expanding its group;
  - Debug CI and Fix Conflicts pills that count failing PRs;
  - a Pull Requests tab;
  - bulk delete;
  - a source filter;
  - a notification when a background agent waits on consent;
  - a 15-day run history chart on each automation row.
- **Grouping.** Sidebar grouping by repository by default, switchable to status, time or
  environment. INFERRED, from a forum staff reply, not docs.

**OpenAI Codex.**
- **Activity bell.** It lists chats "waiting for your response"; a separate pet state shows
  Running / Needs input / Ready / Blocked. https://learn.chatgpt.com/docs/notifications
- **Goals.** "The goal text becomes both the first prompt and the completion criteria"; the goal
  "pauses when it needs a decision"; elapsed time is shown.
  https://learn.chatgpt.com/docs/long-running-work
- **Scheduled.** It shows active, paused and completed tasks with recent runs and "acts as your
  inbox"; no end date or run cap is documented. https://learn.chatgpt.com/docs/automations
- **Projects.** Tasks are grouped by project, can be pinned, and a project's chats can be
  archived at once. https://learn.chatgpt.com/docs/projects

**The open agent app (read in source, VERIFIED, names in private notes).**
- **Grouping.** Four independent grouping toggles (project, conversation, automation, device),
  nested device → project/conversation/automation → task.
- **Sort and filters.** A task sort "对齐 Codex" with four tiers: waiting (questions,
  approvals, errors) > unread done > running > rest. Filters by project, agent and recency;
  active / archived / all.
- **Pinned items.** They are exempt from filters but not from archive.
- **Group archive.** A group's "archive all" skips running and pinned tasks and confirms with a
  count.
- **Project identity.** A project is its main **directory**; a worktree task shows its
  original project.
- **PR facts.** A PR attaches to a task only by a full URL in a visible message, never guessed
  from a branch; "unknown is never zero or passing".

**Raft (read in source, VERIFIED, `manual/agent-knowledge/task.md` at `da842d0`).**
- A task is `todo` → `in_progress` → `done`, plus `backlog` and `closed`.
- "A task that waits on someone's decision or input stays in_progress, **assigned to them**": the
  assignee is who it waits on now. Assigning someone asks "What are you waiting on {name} for?".
  Moving to Backlog asks "What would bring it back?".
- The Tasks page: Mine (Assigned, Started by you) and All; filters by channel, status, creator
  and assignee; list or board; batch status, assignee, follow and delete.

**What the references agree on (INFERRED from the above):**
1. **Repository is the default grouping** for agent work (Conductor, Cursor, Devin): not a
   folder, not a machine. The machine is a row attribute (Cursor shows the worker's name).
2. **"Waiting on you" is its own state**, apart from working and blocked, and the row says
   *what* it waits for (Devin's named approval, Raft's assignee-as-waiter, Codex's needs-input).
3. **External facts close work.** GitHub sets Done on merge by default, and Linear and GitHub
   auto-archive after quiet. Live work is protected from auto-close (Linear's active cycle).
4. **Recurring work is a row with its run history**, and status Error means *consecutive
   failures* (Devin). None of them documents an end condition for recurring work. Ducter's
   Keep, which has one, is ahead of the field, but only if the end can be observed.
5. **Density is a choice of properties per row**, not a separate product (Linear, GitHub's
   table). Multi-select + one bulk bar + ⌘K is the shared shape. Saved views are filters with a
   name. Archive is always undoable.

---

## Part 3: the redesign

### 3.1 User first (AGENTS.md)

**Who.** The primary person here is the heavy multi-agent developer: 20–100 tasks over four to
six repositories, three computers (a server home, a worker, a Mac) and four agents, with
helpers and loops running overnight. The consumer, who has 3–8 tasks, one computer, no repo and
maybe one routine, must not feel any of it. The fresh user has 1–2 tasks.

**What they feel.**
- *Before:*
  - 不放心: the board says 在做 when something waits on them, and says nothing needs them when two
    things do.
  - 不顺: one repository under three names. One PR in three places.
  - 烦: loops that ran 28 hours past their goal, and a "paused" that looks like their own
    order.
  - 吃力: scanning 22 cards with no way to say "all of these, end".
- *After:*
  - 放心: what the head says is what is true, and each loop says when it will end and how
    long it has gone.
  - 好用: one row per repository, one holder per PR, one key to end ten finished things.
  - 惊喜: the loop that ends by itself the minute the PR merges, with one quiet line.

**How it starts.** There is nothing to set up. The repository grouping appears from the remotes
Ducter already reads. The dense list is one key (or one toggle) away and remembers itself per
device. A consumer with one computer and no repo sees exactly today's calm board: one project
row or none, no machine words, no list chrome.

### 3.2 Categories: one project per repository

**Rules.**
1. **A project's identity is its repository**: the normalized `origin` URL (`github.com/owner/repo`;
   `git@` and `https` alike, `.git` stripped). A folder with no remote is its own project, keyed
   by computer and path. Core derives `projectKey` and `projectName` on every card, task open,
   routine and Keep. The clients never derive it again; both `lensOf` implementations shrink to
   reading the card. A nested repository (the website inside the mem checkout) is its own
   origin, so its own project.
2. **The name** is the repository's short name (`mem`, `mem-backbone`, `nowledge-labs-website`).
   When two repositories share one (`acme/web`, `me/web`) both show `owner/repo`. A person's
   rename wins and is kept per project key on the home (`projects.json` grows `names`), so
   every device sees it.
3. **Machines and worktrees are attributes**, never projects:
   - the project row lists where it lives (D455's 在 {computers} 上), in up to two lines;
   - a task row's machine is a small word at its right;
   - a worktree folder is never shown as a project; `mem-identity` is just another checkout of
     mem on haswell (the task's row can say 在 haswell 的另一份 mem 里 in the peek).
4. **Origin is a filter, not a project.** 来自 GitHub, Obsidian and Linear become **来自 / From**
   filter chips over any project lens ("mem, from GitHub issues"), never a row in the project
   column. The D341 summary card stays on the board.
5. **其他 becomes 不在项目里 / Not in a project, split by kind** only when large. Routines' runs
   go to their Keep (they are already under 看守中). Errands with no folder stay. Machine set-up
   tasks (Prow MCP on hel) stand under **电脑上的事 / On your computers**, a lens shown only when
   such tasks exist. The point is that 其他 never holds 6 unrelated things beside 3 real
   projects.
6. **Managing projects, with zero setup:**
   - all of it from the project row's ⋯ (D421's one menu): **改名 / Rename**, **合并到… /
     Merge into…** (for two remotes the person counts as one, e.g. a fork; it records an alias,
     undoable), **隐藏 / Hide** (its tasks still count under 全部 and in needs-you; a hidden
     project with something needing the person shows again), **置顶 / Pin** (pinned rows first,
     then by urgency, as today);
   - order by drag on the Mac and wide web;
   - nothing is asked at first use, and every one of these is reversible from the same menu;
   - the partner can do the same in words ("把 mem-identity 那些算进 mem"), through one
     `project_change` tool. That is a partner-tool change, so the D175 eval is owed.
7. **What hel's board becomes:**
   - **mem** (在 hel、haswell、Mac 上): 10;
   - **mem-backbone** (haswell): 1;
   - **nowledge-labs-website** (Mac): 2;
   - **不在项目里**: 2;
   - **电脑上的事**: 2;
   - the GitHub-bound tasks keep their project, with a 来自 GitHub chip.

**Files.**
- `packages/protocol/src/folder-info.ts` (normalize the remote), `packages/protocol` card types
  (`projectKey`, `projectName`, `where`);
- `packages/core/src/projects.ts` (names, aliases, hidden, pinned, order; derive for inferred
  projects; one remote read per folder per computer, cached by the worker's existing folder
  read);
- `packages/core/src/newtask.ts` and `routines.ts` (stamp the key);
- `apps/web/src/onhand.tsx` (`lensOf`, `lensGroups`, `sourceGroups` to filter chips), `store.ts`
  `projectOf`;
- `apps/desktop/internal/views/byproject.go`, `onhandboard.go`, `onhandrail.go`;
- i18n in both clients;
- `design/on-hand.md` "The two axes" and "The project column", `product-model.md` Project;
- tests: fixtures with hel's five folders, plus a second, unlike shape (one person, two
  forks, one non-git folder).

### 3.3 State truth: one state, derived once

**Rules.**
1. **One state per task, derived in core** from facts, never set by a client.
   - `working`: a turn is running now, or a start is queued.
   - `needs_you`: it asked the person (a decision, a question in its report), or it was told to
     wait for them, or it stopped with no waiter after a person-facing step. Every
     needs-you carries **what it waits for** in one line ("你回了「…」，还没交给它" is impossible by
     construction; see 3).
   - `waiting`: it waits on a named thing that will come back by itself (CI on #11230, a
     timer, a computer), and that thing is readable. When the read fails, the row says the
     wait is blind (「看不到 #11230 的状态：haswell 上没有 gh」); after 30 minutes that becomes
     needs-you with its fix.
   - `stopped`: nothing is running, nothing waits, and nothing asked (D467's 停下了).
   - `done` and `failed` as today.
2. **Every surface reads that one state:**
   - the head's line, the counts, the sections, the Dock badge, the menu bar, the phone and the
     partner's facts;
   - a Keep's held item, and a paused routine that needs a decision (budget, sign-in), count as
     needs-you through the same function;
   - the head's line becomes the sentence of a single computed `OnHandTruth`
     `{needsYou[], working[], waiting[], stopped[]}`, shipped in the snapshot, so the Mac and
     the web cannot disagree.
3. **Invariants enforced in code (model judges, code guards):**
   - a task told to wait for the person is needs-you until the person's answer is delivered
     **to that task**;
   - a turn that ends leaves `working` at once;
   - the partner's claim "已恢复" is checked against the next event: a resume with no delivery
     to the task is refused at the tool layer, so the partner cannot say it;
   - a GitHub fact is read where it can be read (B1).
4. **The task's own words.** A row's line is the person-language gist of the task's latest
   report or step, one cheap-model line per report (D519's asker, extended from Keep rounds to
   task rows, with the retry of B9). Until the gist exists, the task's raw text is shown in the
   muted face behind **它说 / It said**, so it is never presented as Ducter speaking. Ducter's
   own notes to a task use the task's language (B5).
5. **One holder per outside thing.** Core keeps a `holder` index keyed by `repo#n`. A PR
   appears once on the board, under its holder, in this order:
   1. the Keep item that holds it;
   2. else the task that opened it;
   3. else a hand-off.

   The others show on that row as attributes: 「作者：Mac 上的 Antigravity」 and 「复审：PR
   Babysitter」. A second Keep over a held task is refused (B6).

**Files.**
- runner/core attention: `packages/core/src/attention.ts` and the runner's turn events;
- `close-loop-repair.ts` made continuous, a new `core/src/truth.ts`;
- `holdings.ts` (holder index), `handoffs.ts` (one key);
- `task-sources/index.ts` (B2, B3, B5);
- `packages/protocol` (`OnHandTruth`, the row's `gist` and `waitsFor`);
- `apps/web/src/store.ts` `board()`, `onhand.tsx` head line;
- Mac `onhandhead.go`, `onhandboard.go`, `onhandsaid.go`;
- `packages/partner/src/persona.ts` facts (eval owed);
- `design/on-hand.md` board §1 and §4, `focus-window-states.md` (the state machine gains
  `stopped`, and `needs_you` gains `waitsFor`).

### 3.4 Standing work: every Keep says its end, its rounds, its age, and ends

**Rules.**
1. **The Keep's head says three things, always:**
   - its end as a testable sentence (「#11230 合并时结束」) or 「你说停才停」;
   - its rounds (「第 74 轮」);
   - its age (「跑了 30 小时」).

   The last round's line carries that round's own time and is never an older one (B9). The
   mechanism's rhythm is the current one (B13).
2. **An end must be observable.** When a Keep is made, its end is read once into
   `{sentence, look}`, where look is a read Ducter can run itself (a PR merged, an issue closed,
   a check green, a date passed) or `none`. Only a `look` end can end it by itself. A rule from
   the person's words goes to `said` (B8). With no observable end, the head says
   「没有说什么时候结束」, with a quiet **加一个结束条件 / Add an end** in its ⋯.
3. **It ends by itself when the end holds** (D633's one path, now with a working read). It
   says one quiet line and moves under 今天做完. The task inside is told the Keep ended, and its
   turn finishes.
4. **It asks once when it stalls.** After N rounds with no change, the Keep stands in 待你处理
   once:
   - "no change" means the same gist, the same PR head, the same CI;
   - N is 6 by default, the same as D628's `WAIT_REPEAT_N`, at the Keep's level;
   - the ask reads **「已经 6 轮没有新进展了（最后一次变化在 11-26 16:32）。结束看守？」**;
   - its buttons are **结束 / End** (the default after its time), **再看 6 轮 / Six more rounds**
     and **改结束条件 / Change the end**;
   - the round protocol no longer says 不要报 done: a round may report done with evidence that
     the work is over, and the Keep then asks the same question at once (B-F).
5. **The person's "stop" ends; it never pauses.**
   - 结束看守, or "别看了" through `keep_change`, ends the Keep: life `stopped`, the task
     finishes its turn, and the line 「按你说的，停了。」 is said.
   - Pause is only the explicit **暂停到… / Pause until…**.
   - A system pause (budget, a sign-in) is not the person's pause. It is said with its reason
     and its way on (「这个月的用量到了上限，放宽到 6M？」) and counted as needs-you (B11, B12).
6. **One holder per external thing** (3.3 rule 5). A helper's item never gets its own Keep.
   Two Keeps that name the same `repo#n` are merged on creation: the partner joins the existing
   one, adding the new words to `said`.
7. **The Keep's page** shows its rounds as a dense history: one line per round with time,
   woke-by, gist and changed or not; the last 5 are open and the rest fold. That is Devin's Past
   Sessions and Cursor's run chart, said as Ducter does.

**Files.**
- `packages/core/src/keeps.ts` (end shape, B6, B8, B9, B13, stall ask),
  `loops.ts`, `work.ts:109–135` (round protocol), `holdings.ts` (end by look), `routines.ts`
  (B11, B12);
- protocol `KeepView` (`end`, `rounds`, `since`, `stall`);
- web `keep.tsx`, Mac `keeps.go`, `keeps_card.go`, `keepfold.go`;
- `packages/partner/src/persona.ts` and the `keep_change` description (eval owed);
- `design/standing-work.md` §7 "How it ends", `product-model.md` (看守中 words).

### 3.5 Density and control for builders

**Rules.**
1. **Two ways to look at one board**:
   - **概览 / Overview**, today's calm board, the default for everyone;
   - **列表 / List**, a dense table, one row per task, 32 pt high (13/600 title, 12 rest).
     Its columns: state glyph, title (the person's name for it), project, machine, agent, age
     (its state's time), last step (the gist), and PR/CI (`#11230 · CI 6/11`, each its own cell,
     no dot-joins).

   The toggle is a segmented control in the board's head and ⌘1/⌘2; it is kept per device. It
   is offered from 8 tasks on, and the phone shows it as a compact two-line row.
2. **Keys (Mac and wide web):**
   - j/k or ↑↓ move, ⏎ opens, Esc goes back;
   - x selects, ⇧-click or ⇧↑↓ extend, ⌘A selects the filtered rows;
   - `/` finds, `f` filters, `g p` the project, `g s` the state;
   - `e` ends, `p` pauses, `m` moves to a computer, `a` changes the agent, `⌘⌫` puts down;
   - ⌘K acts on the selection;
   - the keys are said once in drawn caps at the list's foot (D457's style).
3. **Bulk actions on a selection:**
   - 结束 / End, 暂停 / Pause, 接着做 / Continue, 换到… / Move to… (computer), 换人做… /
     Reassign (agent), 放下 / Put down;
   - one confirmation that names the count and what is skipped (「8 个里 2 个正在做，会做完这一轮再停」),
     after the open agent app's archive-all;
   - Undo for 10 s (Cursor, GitHub);
   - an end on a selection that includes Keep items ends their Keeps by the same path.
4. **Sort and filter:**
   - sort by urgency (the default: needs-you > stopped > working > waiting > done, the same four
     tiers the references use, with stopped added), by last change, or by age;
   - filter chips for state, project, computer, agent and from-source;
   - the lens column stays.
5. **Saved views:**
   - any filter + sort + mode can be saved with a name (**存成视图 / Save as view**), kept on
     the home, so every device has it, and listed in the project column under the projects;
   - three come built in, shown only when they have rows: **今天要我看的 / Needs me today**,
     **跑了很久的 / Running long** (working or in rounds over 6 h), and **PR 在等 / PRs waiting**.
6. **The consumer stays calm.** Under 8 tasks there is no toggle, no keys hint and no columns.
   The list never becomes the default by itself; the person chooses it once.

**Files.**
- web `onhand.tsx`, plus a new `onhand-list.tsx`, `controls.tsx` (a table row and a selection
  bar added to D161's set first);
- Mac `onhandlist.go`, `components.go` (the same two controls);
- protocol (saved views on the home, `views.json`, a `view_save` RPC);
- core: bulk ops through the existing `keep_change`, stop, move and reassign paths, one per
  task, logged once as a batch;
- `design/ui.md` (the table row, the selection bar), `on-hand.md` (a List section), and the
  `.claude/skills/ducter-ui` checklist on every surface.

### 3.6 The phased plan

Each branch can be built with fakes in 1–2 days. Live checks happen on hel afterwards, read-only
first.

| Phase | Branch | What | Depends |
|---|---|---|---|
| 1 | `r245-truth-fixes` | B1, B2, B3, B4, B5, B6, B7: GitHub reads at the home, closed-card answers reach the task, `working` only with a turn, one Keep per held task, one hand-off key. hel's board tells the truth and the 403 and #11230 loops can end | none |
| 2 | `r245-keep-ends` | B8, B9, B10, B11, B12, B13 and §3.4: observable ends, round count and age on the head, the stall ask after 6 rounds, stop ends, system pauses as asks, the budget unit | 1 |
| 3 | `r245-projects` | §3.2: `projectKey` from the remote in core, both clients read it, rename/merge/hide/pin, origin as a filter, 其他 split | none (parallel with 2) |
| 4 | `r245-one-state` | §3.3: `OnHandTruth`, `waitsFor`, task-row gists in the person's language, the holder index (one row per PR), the partner's facts | 1 |
| 5 | `r245-list` | §3.5: the List mode, keys, multi-select, bulk bar with Undo, sort/filter chips, saved views | 3, 4 |

### 3.7 Brief, phase 1: "Tasks tell the truth: GitHub read at home, answers reach the task, 在做 only while it runs"

- **Who:** the heavy developer whose tasks run on a worker without `gh`, and anyone whose
  bound to-do was already closed. The consumer must see nothing new.
- **Felt before:** 不放心.
  - The board says 没有待你处理的，我在做 while a task waits on their answer.
  - A loop runs 28 hours after its PR merged.
  - One PR shows under two Keeps.
- **Felt after:** 放心.
  - The head counts what waits on them.
  - A merged PR settles its loop within the hour.
  - A reply reaches the task that asked.
- **Rules:**
  1. **Where a look runs.** A look whose argv is `gh api` GET (or `gh pr view|checks`) about a
     `github.com` repo runs on the home when the home has a signed-in gh, else on the first
     online device that has one, else on the task's device. Other looks run where they did.
     When none can read, the task's card carries `githubBlind: {since}`; after 30 min the row
     says so with its fix (D345's 装上 gh on that computer, or 在 hel 上读). Files:
     `packages/core/src/work.ts` (`check`), `holdings.ts`, `owned.ts`.
  2. **Binding records state.** `task_bound` records the item's state when read at bind time.
     A first look with no prior state only records and never says "closed by someone". File:
     `task-sources/index.ts`.
  3. **Every answer to a closed card reaches its task.** Go stops it. Hold, default-hold or a
     **reply** releases it: the reply text goes to the task as the person's words (in the
     task's language) and also goes to the partner. Files: `task-sources/index.ts:675,743`.
  4. **`working` follows a turn.** When a turn ends with no report and no wait, the task is
     `stopped`. When the last thing Ducter told it was to wait for the person, it is
     `needs_you`, with `waitsFor` set to the open question. This is checked on every turn end,
     not once at start. Files: runner turn-end → core attention, `close-loop-repair.ts`
     (becomes the live check).
  5. **Ducter's notes in the task's language** (`changeNote` and the Carry on line).
  6. **No Keep for a task already held.** `keeps.ts:481` skips a loop whose task is an item
     of a helper or of another Keep; its rounds go to the holder. hel's `kp_9c76608d03` is
     ended at the first start with one line on its task.
  7. **One hand-off key per `repo#n`.** Existing pairs are merged on read.
- **Tests (fakes only):**
  - a fixture of hel's shape: a helper Keep holding a haswell task whose worker has no gh, a home
    with gh, a loop task with PR #11408 merged and a hand-off pair `issue:`/`pr:`, a bound
    already-closed issue, and a reply to the closed card;
  - a second, unlike shape: an Obsidian-bound task on a single Mac, no worker;
  - asserts:
    - the haswell PR read runs on the home;
    - the 403 loop ends by the condition with one `ai_msg`;
    - no closed card for the pre-closed issue;
    - the reply arrives as a task `user` event;
    - `zqcpawnf`'s twin is `needs_you` after its turn ends and `working` only during it;
    - one Keep for the helper's task;
    - one hand-off record.
  - files: `packages/core/test/fixtures/hel-truth.ts`, `truth-fixes.test.ts`, web store tests
    for the head line, a Go views test for the head.
- **Done:**
  - typecheck, the core, runner and protocol suites, `build:web`, Go `vet` and the views suite;
  - shots in `.shots/truth/` of the head and the 在做/待你处理 sections before and after, in
    both languages;
  - no partner tool text changed, so D175 is not owed;
  - a `Dn` recorded;
  - on hel after release (read-only check): the journal has no `gh is not installed here` for
    PR reads, and `kp_32e13f1628` and `kp_9c76608d03` ended.

### 3.8 Brief, phase 2: "A Keep says when it ends, how long it has gone, and ends"

- **Who:** the heavy developer with helpers, review loops and a babysitter; the consumer with
  one daily briefing, whose routine must not silently pause on day three.
- **Felt before:** 烦 and 不放心.
  - 「仅 Tide 批量合并」 stands where the end should be.
  - 「上一轮 0:32」 is 22 hours old.
  - 「已暂停 · 用户明确要求停止 · budget」 reads as their own order.
  - Loops never ask.
- **Felt after:** 放心 and 惊喜.
  - Each Keep's head: 「#11230 合并时结束 · 第 5 轮 · 跑了 40 分钟」.
  - It ends the minute that holds.
  - After 6 rounds with nothing new it asks once, with End as the default.
  - A budget pause asks, in words, with the number.
- **Rules:**
  1. **Ends.** The end is `{sentence, look}` or `noEnd`, read once with "an end Ducter can
     test"; rules go to `said`. Re-read once for every existing Keep at the first start; the
     old `until` is kept in the Log. Files: `keeps.ts` (`keepEndAsk`), protocol `KeepView`.
  2. **The head.** The head shows end, rounds and since; the last round's line is that
     round's own line or its report's first sentence, never an older round's. Failed lines are
     retried (at most 3, spaced). Files: `keeps.ts` 835–915, web `keep.tsx`, Mac
     `keeps_card.go`.
  3. **The stall ask.** After N=6 unchanged rounds there is one ask in 待你处理 (End default
     after 24 h, Six more rounds, Change the end). The round protocol lets a round report done
     with evidence. Files: `keeps.ts`, `work.ts:122–127`.
  4. **Stop and pause.** Stop is an end. A system pause is an ask with its reason in words; a
     raw reason code never reaches a card. Files: `routines.ts`, `keeps.ts:757`.
  5. **The budget.** Count uncached input plus output; the per-run cap is at most the month;
     the default month is 20M, said once on the first run with the real number. INFERRED
     sizing, to be checked against `ducter usage` on hel before release. File: `routines.ts`.
  6. **Reviews.** A review standing belongs only to a Keep made for reviews and expires with
     its round; a reviewed PR is never `owned`. Files: `keeps.ts`, `owned.ts`.
  7. **The rhythm.** The Keep follows the loop's current rhythm.
  8. **The partner.** The partner's `keep_change` description says "stop ends it", and the
     persona says that end words are testable. This needs a fresh D175 eval and a new scenario
     「别看了」→ ended, not paused.
- **Tests:**
  - `packages/core/test/fixtures/keeps-ends.ts` with hel's five Keeps (their real `until`
    texts) and a second, unlike shape (a daily mail digest with no end; an issue-triage helper);
  - asserts:
    - each end classified;
    - the stall ask after 6 unchanged rounds and not after 5 changed ones;
    - stop yields `stopped`;
    - the budget pause is counted needs-you with words;
    - no `budget` string on any card;
    - the line is never older than the newest round.
  - Go views and web keep tests for the head.
- **Done:**
  - the suites green;
  - the D175 eval run and committed (`--model haiku --against latest`), Regressions read;
  - shots `.shots/keep-ends/` (head, stall ask, budget ask; zh and en; 320–1400);
  - a `Dn` recorded, propagated to `standing-work.md`, `product-model.md` and `docs/`
    (Looking after page).

---

## Implications for Ducter

1. **Truth beats layout.** Most of what felt "not production-grade" was the board saying
   things that were not so: 在做 for a waiting task, nothing-needs-you with two needs, a pause
   that reads as an order, a stale line. Phase 1 and 2 fix that before any redesign is drawn.
2. **A fact belongs to where it can be read, not to the task's computer.** B1 alone explains
   every never-ending loop on haswell. Silent failure (a `console.warn` every five minutes) is
   the second fault: blindness must become a state the person can see.
3. **Ends must be testable, and only testable ends may end a Keep by itself.** Everything else
   asks once after six rounds of nothing. No reference product has an end condition for
   recurring work; Ducter can lead here, but only with ends a look can check.
4. **Project identity is the repository.** Folder names split one repository into three
   lenses and made origin look like a project. Deriving it in core also ends the
   duplicated TS/Go rule.
5. **Density is a mode, not a fork.** One list mode with keys, selection, bulk with Undo, and
   saved views serves the 20–100-task builder. The calm board stays the default, and the
   consumer under 8 tasks never sees the switch.

## Short summary

hel's Tasks board (0.1.98) was untrue in four places. One task stood under 在做 while it waited
for an answer the code never delivered. Two loops could not end because GitHub reads ran on
haswell, which has no gh, and because the model read rules and no-ends as ends. One PR had
three holders. A review routine was paused by a budget unit that cannot fit one run. Projects
come from folder names, so one repository shows as three. Fourteen bugs are listed with their
files. The proposal has four rules: project = repository; one derived state that every surface
reads; Keeps with testable ends, round counts and ages that end themselves, ask once on a stall
and end on stop; and a keyboard-first dense list with bulk actions and saved views beside the
calm default. There are five phases; the first two briefs are "Tasks tell the truth" and "A
Keep says when it ends".
