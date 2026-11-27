# The conversation's lines without their context: one real day measured

**Question.** The author says each line Ducter writes in the conversation lacks the context behind
it, and that Ducter does not yet lower the attention it takes to run many tasks, which is the reason
it exists (`motivation.md`: "ask for my attention only when it is really needed"; principle 7). This
report measures that on one real day and traces each kind of context-less line to the code that
writes it.

**Data.** hel's Log (`~/.ducter/ducter.db`, opened read-only), the default partner's conversation
(stream `channel`), UTC day 2026-11-27, 00:00–15:11 (the day was still going; the person's local
time is UTC+9, so quoted clock times like "15:40" are local). 1,013 events: 470 `living_msg`
revisions, 288 `waiter`, 84 read receipts, 42 `ai_msg`, 27 `handoff`, 25 `bridge_msg`, 12
`user_msg`, 7 `ack`, 6 `decision`, 131 task reports in the task streams. Nothing on hel was written
or restarted. GitHub states were read with `gh` (read-only).

Tags: **VERIFIED** = read in the Log, code or GitHub; **INFERRED** = reasoned from them.

## 1. What the person saw

What a client draws was read in `apps/web/src/store.ts` (the per-kind switch, lines 587–800) and
`views.tsx`, and in the Mac's `apps/desktop/internal/views/peers.go` and `todos.go`. Drawn by default
(VERIFIED):

- `ai_msg`: a partner bubble. One with `decisionId` is that card's words (D129), not a line of its own.
- `ack`: the job row's first line.
- `decision`: a card (`Ask`).
- `bridge_msg` out, `state: "sent"`, with text: a quiet line **已回复 {who} / Replied to {who}** (web
  `views.tsx:1655`, Mac `peers.go:212`). A request coming in is replaced by **从{who}来的 / From {who}**
  over the next partner message (D470, `mem-view.ts` `spokenPeers`).
- `living_msg`: only its `done`/`failed`/`decision` items, and a `done` line is dropped when the
  partner's own result covers it. Its `progress` and `blocked` items show only with Details Shown.
- `handoff`, `source_seen`, `source_write`, `waiter`: not drawn in the conversation.

That gives **67 lines** for the day: 31 partner messages, 7 acks, 6 cards, 5 to-do offers, 3 "updated
to 0.1.9x" notes, 10 **已回复** markers and 5 **从…来的** markers. The living message also carried
188 distinct items (100 progress, 73 blocked, 12 done, 3 decision) in 122 messages and 470 revisions.
With Details Shown those would add up to 173 lines, 51 of them for one review helper (`gr5cfyew`),
which reported `progress` every five minutes for three hours after its PR had merged (VERIFIED,
`task:gr5cfyew` reports 11:17→14:23). The full classification is in the appendix.

## 2. The numbers

| Measure | Value |
|---|---|
| Lines seen | 67 in 14 h (00:59–15:00 UTC): **4.8 an hour**; bursts of 16 (06:xx), 12 (10:xx) and 17 (14:xx) |
| Cards (decisions) | 6: at most 2 in an hour (14:xx) |
| Needs you vs for your information | **11 needs you (16%)**, 56 for your information. The 5 offers and 1 of the needs-you lines are plain bubbles that look the same as information lines |
| Subject named in words | 47 of 67 (70%). **3 name only a `#number`** (all from templates), **17 name nothing** (15 markers, the merged-PR summary, the group-review card) |
| Stands alone (no scrollback needed) | 34 yes, 10 partly, 23 no. **0 of the 11 needs-you lines stand alone**: none says its object, what each answer does and the default all together |
| Answered | needs-you lines: 6 answered, 5 never (4 of 5 offers, and "点「恢复」" on a card that isn't in the conversation). 2 of the answers were replies saying neither button fits (82542, 83334) |
| Time to answer | 0.7, 2.6, 3.4, 11, 14 and 58 min |
| Repeats (redundant with a line before or after) | **21 of 67 (31%)** |
| Median length | 35 word units (one CJK character or one Latin token each); 38 without markers; longest 193 |
| Subject switches | 30 in 66 transitions; the longest run on one subject is 10 lines (the website fix) |
| Subjects interleaved in a 10-minute window | at most 4 (14:24–14:34); 11 windows hold 3 or more |
| Lines for one piece of work | website download fix: **13 lines in 32 min**; narrow-sidebar fix: **17 lines in 3 h 6 min**; remote-access settings: 10 lines in 64 min |
| The person's own messages | 12, of which **5 were spent recovering state** the conversation hadn't given them (§3, E11) |

INFERRED: keeping what each line carries but folding it by subject (rules 1–3 in §5) leaves about
**32 lines instead of 67**: the website fix goes from 13 lines to 2, the sidebar fix from 17 to 3,
remote access from 10 to 5, and the 15 markers, 3 helper acks and 5 repeats are gone.

**Honest reading.** Taken alone the interleaving is moderate: runs are long, and at most 4 subjects
share ten minutes. The weight comes from elsewhere. One piece of work takes 10–17 separate lines;
almost a third of the lines say again what was already said; a quarter are markers about Ducter
talking to itself; and every question has to be pieced together from scrollback.

## 3. Annotated examples

| # | seq (UTC) | What the person saw | What's missing |
|---|---|---|---|
| E1 | 83323 (14:53) | 「nowledge-co/mem#10500 在 GitHub 上关掉了。这个任务停下吗？」 | Asked **37 s after** the person wrote 「没做完的你现在能帮忙做掉么？」 (83311) and 23 s after the ack 「我接着按设计稿补齐…」. The issue's closing was already said 11 min earlier (83107: 「#10500 随 PR 合并自动关闭」). The task is named only by `#10500`. The person had to answer by reply (83334), because neither 停下 nor 接着做 said "reopen and finish it" |
| E2 | 81181 (11:18) | 「nowledge-co/mem#11564 在 GitHub 上关掉了。这个任务停下吗？」 | The task had **already finished** 54 s before (job `done` at 81128), and 81152 had just said 「#11564 已关闭」. The issue was closed by the task's own write-back (81205, `op: close`, `by: rule`). Default 停下 in 30 min. It asks to stop something that had stopped |
| E3 | 83456 (15:00) | 「在这 3 个下面留言？」 (answered 留言) | Which 3 and what text are only in `src.items`. The web draws only 「3 个」 (`todos.tsx:690`); the Mac draws one chip, the first item #11115 (`todos.go` falls to `src.Kind != "write"`). It was logged already answered (`handover.ts:1319–1320`), so a record reads as a question. What went out was 「Fixed in #11230.」 on #11115, #11108 and #11156, but #11230 is **open** (VERIFIED `gh`) and the task had said #11108/#11156 were fixed by #11163, merged 11-25 (82890, 83056). The comment is wrong on two issues and early on the third |
| E4 | 83085, 83177 (14:42, 14:45) | 「已回复你」 ×2 | It was the PR Babysitter helper answering a hand-over **the partner** gave it (core named the giver 你: `core.ts:1954` `fromName: "你"`). The person never wrote to the helper. The words that went out (「接了：…」, 「…须返工；Bazel CI 失败」) are not drawn |
| E5 | 78251 … 81143 (7 lines) | 「已回复 Ducter」 | Ducter's own task handed its PR to Ducter's own helper (`local: true`), and each claim and result the helper sent back is a line here. To the person it reads as Ducter replying to Ducter. It names no subject and gives no words |
| E6 | 83067 (14:42) | 「从你来的」 over 「远程访问设置已按确认的方案更新到 PR #11230…」 | The origin line goes on whatever partner message comes next (`spokenPeers` takes the next `ai`, whatever its `replyTo`). That message was the task's own result for the person, not the hand-over's. 78291 and 79976 have the same mismatch (从 Ducter 来的 over answers to the person's own requests) |
| E7 | 82830 (14:24) | 「4 个 PR 已合并，相关的事都收了尾。」 | No PR is named. The four refs are in `settled.refs`, which no client draws (`holdings.ts:308`). Three of the four had been reported done hours earlier (#11580 at 11:17, #378/#11441 at 09:22) |
| E8 | 78439 → 78456 → 78505 → 78555 → 78584 (06:37–06:43) | five lines on the website fix in 6 min | The fix task reported `done` five times while it kept watching CI and merge (VERIFIED `task:b7cz2yq2` reports), and each report woke the partner for a new immutable message. 78505 says 「/lgtm 没有生效，还需另一位评审者确认」 and 50 s later 78555 says 「已合并」. 78584 says the merge again because the helper task reported it too |
| E9 | 82446 (13:56) | 「…按{同事}的建议，移除「本机访问也需要密钥」这个开关吗？」 | The task's card asked **four** numbered things about PR #11230 (82442). The partner's words keep one and name neither the product nor the PR. The person answered 「这个我一时不好给出回答…你能仔细分析一下么」 (82542): the question couldn't be acted on |
| E10 | 77610, 81506, 83450 (and 76354) | 「Mem #11526：…要我接这个修复吗？」 | A to-do offer as a plain bubble question: no card, no default, no buttons. 4 of 5 were never answered, so they stay open questions in the scroll. 83450 lands between the remote-access and migration threads, 14 s before E3 |
| E11 | 77253, 78611, 79227, 79514 | the person asks: 「五个在等的是啥？」「两个任务还没收敛么？」「那俩应该完成了帮我标记一下」「我的自动 review 的 loop task 怎么没了？」 | State the conversation never said. 79227 repeats 78616 (「合并了的话，可以关闭了不用等」), which 78630 had answered with 「都已结束跟进」 although the tasks stayed open until 09:21 (`job_status done` 79289): **a claim with no action behind it**. 77198 asked to babysit PR #11389, which had already merged |
| E12 | 79300 (09:22) after 79228 (09:20) | 「Plus 年付的两项修复都已标为「完成」…」 | The same sentence twice in 80 s. The second replies to an older message (`replyTo: 68190`) |
| E13 | 81203 (11:18) | 「桌面端和网页端都已验证…」 | A report from before the merge, said after 81152 had already said merged and closed |
| E14 | 78243, 79912, 83076 | 「我会独立复查…确认后告诉你。」 | The partner acks the helper's hand-over as if the person had asked. It is a second ack for work already acked (77934), and it promises the person a report they never asked for |
| E15 | 80657 (10:51) | 「…需要你在它的卡片上点「恢复」。」 | It needs the person, but the card is somewhere else (On hand). There is no button here and no default, and it was never answered |

## 4. Root causes in the code

Ranked by how many of the 67 lines each one makes.

1. **Every task report becomes a new partner message** (16 of the website, sidebar and remote-access
   lines). `packages/partner/src/render.ts` `renderReport` hands each report to the partner, and an
   `ai_msg` is immutable (`conversation.md` "Mechanics"). The living message folds only its template
   items, never the partner's words. A task that keeps watching after `done` reports `done` again
   (b7cz2yq2: 5 times), and a helper task on the same PR reports the same facts (E8). D426's card
   folds a message that asks several things, but a single task has no fold.
2. **Ducter's own agent traffic is drawn as conversation with other agents** (15 markers and 3 acks).
   Local hand-offs from a task or the partner to a helper are logged as `bridge_msg` in the channel
   (`partner.ts` `logOut` ~4813, `bridge-out.ts` claim 「接了：「{title}」。做完把结果回你。」). Clients
   show each `sent` as **已回复 {to}** (`store.ts` `bridge_msg`, `views.tsx:1655`, `peers.go:212`).
   The giver is named 你 (`core.ts:1954`). The origin line goes on the next message, whatever it
   answers (`mem-view.ts:574`). The partner is triggered by the request and acks it (E14).
3. **Task-source templates ask without checking the world** (2 of 2 closed-issue cards redundant).
   `packages/core/src/task-sources/index.ts` `lookBound` (~515–552) asks `closedQ` 「{label} 在 {app}
   上关掉了。这个任务停下吗？」 whenever the state changed since its last look. It does not check whether
   the task had finished, whether the task's own write-back closed the issue, whether the issue was
   already closed when the person continued the task, or what the person just said. The words carry
   only `{where}{label}`, never the task's title (E1, E2).
4. **Offers arrive whenever an issue does** (5 lines, 4 left hanging). `source_seen` is logged on
   arrival (`index.ts:508`). `render.ts:506–512` tells the partner to "Offer them in one short line",
   so the offer is a bubble with no card, no default, and nothing that fades it (E10).
5. **Records and summaries whose subject lives only in data** (E3, E7). `handover.ts` `reviewSend`
   logs a `group_review` decision and its resolution together, with 「在这 {n} 个下面留言？」. The clients
   don't draw `src.items` for that kind. Its comment comes from the task's one PR for every row
   (`review()` `doneIn`: 「已在 {pr} 修好。」 / "Fixed in #…", with no check that it merged).
   `holdings.ts` writes 「{prs} 个 PR 已合并…」 with the refs only in `settled`.
6. **The partner's words drop the card's object** (E9). A task question is said in the partner's
   words (D129), and they replace the card's question in the view (`store.ts` `ai_msg` with
   `decisionId` sets `d.said`). Nothing checks that the words still name the object and every point.
7. **Claims and repeats with nothing behind them** (E11, E12, E13). 「都已结束跟进」 was said before
   anything ended. The same line was said twice in 80 s (D570 holds within one turn only). A late
   report was said after the result.
8. **"更新到 0.1.9x 了"** (3 lines) lands in the middle of work threads. It is minor but adds to the
   interleaving.

## 5. Implications for Ducter

A ranked set of rules. Each says what it changes. Under the repo's rule "model judges, code guards",
code enforces the invariants (task finished, PR merged, who gave a hand-over) and the partner gets
true state rather than phrase patterns.

1. **One subject, one place: a task's updates fold into one living card** (lines affected: ~30).
   The card hangs from the message that started the work (D426's card, extended to a single task).
   It covers the task, its helper and its PR. The partner speaks for a subject only at a needs-you, a
   failure, or the final verified result, once. Later `done` reports from a task still watching
   revise the card and wake nobody. Changes: core's report wake (which report states wake the
   partner, and a per-subject key from task, helper hand-off and PR ref, as `handoff.ts`'s key
   already has), `living.ts`, `render.ts`, and both clients' message cards.
2. **Ducter talking to itself is never a conversation line** (18 lines). A hand-over from Ducter's
   own task or partner to its own helper (`local: true`) and the helper's claim and result go to the
   task, On hand and 替你做过的 / Done for you, never to the channel. They also never trigger a partner
   ack. The giver is named as the task or the partner, never 你. **已回复 / From** lines stay for agents
   Ducter didn't start, and carry the words' gist. An origin line goes only on a message whose
   `replyTo` is that request. Changes: `partner.ts` `logOut` and the request trigger, `core.ts:1954`,
   `store.ts`/`peers.go` show rules, `spokenPeers`.
3. **Never ask what was just answered or is moot** (2 cards, 2 replies). Before the closed-issue card,
   code checks three invariants and says nothing when any holds: the task has finished; the close came
   from this task's own write-back or merged PR; the issue was already closed when the task was last
   started or continued. Otherwise the fact goes to the partner (`[the bound to-do was closed]` with the
   person's latest words about that task) rather than a template card, and the partner judges. Changes:
   `task-sources/index.ts` `lookBound`, `render.ts`.
4. **Every line names its subject in words.** Templates carry the task's title or the to-do's title,
   not only `#n`. Examples: closedQ 「「{task}」对应的 {label}（{title}）…」; the merged summary lists its PRs
   by title (drawn from `settled.refs`); the group-review card lists each item and the comment that
   went on it, on the Mac and on the web. Changes: `index.ts` SAID, `holdings.ts`, `handover.ts`,
   `todos.tsx`, `todos.go`.
5. **A question stands alone.** Its object, what each answer does, and the default, in its words or
   on its card. To-do offers become cards (Take / Not now, default Not now, fading like D453's offers)
   instead of bubble questions. A task question said in the partner's words keeps every point, or the
   card keeps its own question and the words only introduce it. An ask about a card elsewhere carries
   that card's button. Changes: `render.ts` (source_seen, task questions), persona D129 lines, the
   `Ask` views.
6. **Offers wait for a quiet moment.** New to-dos and update notes are held while a subject is live
   (the person wrote in the last few minutes, or a card is open). They are batched into one line in
   the next quiet gap and held overnight (motivation: "batched into one message instead of a stream
   of pings"). Changes: `task-sources/index.ts` (when `source_seen` wakes the partner), core's update
   note.
7. **A record never reads as a question.** A decision logged already answered (group review) is drawn
   as what was done: 「在 #11115、#11108、#11156 下留了言：「…」」. Changes: `handover.ts`, both clients.
8. **Information is lighter than needs-you.** Needs-you lines get the card shape and the count.
   Information rides as a quiet line or inside the subject's card. A line not answered by tomorrow
   leaves the scroll for On hand. Changes: clients, `living.ts`.
9. **Outward words are checked against state.** "Fixed in {pr}" is written per item from that item's
   own PR, and only once it merged; otherwise "{pr} 在修". Changes: `handover.ts` `review()`.
10. **A claim is backed by an action; a line is said once.** "Ended", "marked done" and "stopped" only
    after the call that did it. The same words for the same subject are not said again within a
    window (D570 widened from one turn to the subject). A report older than the subject's last result
    is never said. Changes: persona and partner output guard (D570), `render.ts`.

## Summary

On 2026-11-27 (UTC, to 15:11) the person saw 67 lines from Ducter. 11 needed them and none of those
stood alone. 31% repeated another line, 25% were markers of Ducter talking to itself (「已回复
Ducter」, 「已回复你」, 「从你来的」), and 20 named their subject only by number or not at all. One fix
took 13–17 lines. 5 of the person's 12 messages went to recovering state the conversation never gave
them. The causes are in the producers, not the model's tone: every task report becomes a new
immutable message; local agent traffic is logged as conversation; task-source and hand-over templates
ask without checking the task, the cause or the person's last words, and keep their subject in data
the views don't draw; offers arrive whenever issues do. Folding by subject, keeping internal traffic
out, and checking invariants before asking would roughly halve the lines (67 → ~32) and lose nothing
(INFERRED). The same pass found a public comment, "Fixed in #11230.", posted on three issues while
#11230 is open and two of them were fixed by #11163 (VERIFIED).

## Appendix: every line

"(over)" marks an origin line drawn over that message.

| seq | UTC | line | subject in words | about | stands alone | needs you | repeat |
|---|---|---|---|---|---|---|---|
| 76354 | 00:59 | offer | words | offer #11505 | partly | yes |  |
| 76959 | 02:43 | update note | words | Ducter update | yes | no |  |
| 77201 | 03:26 | message | #n only | settings PR #11389 | yes | no |  |
| 77264 | 03:44 | message | words | the five waiting | yes | no |  |
| 77610 | 04:52 | offer | words | offer #11526 | partly | yes |  |
| 77934 | 06:11 | ack | words | website download fix (#578) | yes | no |  |
| 78243 | 06:32 | ack | words | website download fix (#578) | no | no | yes |
| 78251 | 06:32 | 已回复 marker | none | website download fix (#578) | no | no | yes |
| 78291 | 06:33 | message | words | website download fix (#578) | yes | no |  |
| 78291 (over) | 06:33 | 从…来的 marker | none | website download fix (#578) | no | no |  |
| 78373 | 06:35 | 已回复 marker | none | website download fix (#578) | no | no | yes |
| 78386 | 06:35 | message | words | website download fix (#578) | yes | no | yes |
| 78439 | 06:37 | message | words | website download fix (#578) | yes | no |  |
| 78456 | 06:37 | message | words | website download fix (#578) | no | no |  |
| 78505 | 06:41 | message | words | website download fix (#578) | yes | no |  |
| 78531 | 06:41 | update note | words | Ducter update | yes | no |  |
| 78555 | 06:42 | message | words | website download fix (#578) | yes | no |  |
| 78581 | 06:43 | 已回复 marker | none | website download fix (#578) | no | no | yes |
| 78584 | 06:43 | message | words | website download fix (#578) | yes | no | yes |
| 78614 | 06:45 | message | words | Plus annual fixes | yes | no |  |
| 78630 | 06:45 | message | words | Plus annual fixes | yes | no |  |
| 78917 | 08:13 | offer | words | offer #11564 | partly | yes |  |
| 79122 | 09:12 | ack | words | narrow-sidebar fix (#11564/#11580) | yes | no |  |
| 79228 | 09:20 | message | words | Plus annual fixes | yes | no |  |
| 79300 | 09:22 | message | words | Plus annual fixes | yes | no | yes |
| 79518 | 09:50 | message | words | auto PR review loop | yes | no |  |
| 79522 | 09:50 | message | words | narrow-sidebar fix (#11564/#11580) | yes | no |  |
| 79550 | 09:51 | message | words | auto PR review loop | yes | no |  |
| 79592 | 09:54 | card | words | auto PR review loop | partly | yes |  |
| 79668 | 10:05 | message | words | auto PR review loop | yes | no |  |
| 79912 | 10:18 | ack | words | narrow-sidebar fix (#11564/#11580) | no | no | yes |
| 79920 | 10:18 | 已回复 marker | none | narrow-sidebar fix (#11564/#11580) | no | no | yes |
| 79976 | 10:20 | message | words | narrow-sidebar fix (#11564/#11580) | yes | no |  |
| 79976 (over) | 10:20 | 从…来的 marker | none | narrow-sidebar fix (#11564/#11580) | no | no |  |
| 80064 | 10:22 | 已回复 marker | none | narrow-sidebar fix (#11564/#11580) | no | no | yes |
| 80070 | 10:22 | message | words | narrow-sidebar fix (#11564/#11580) | yes | no |  |
| 80319 | 10:32 | message | words | narrow-sidebar fix (#11564/#11580) | partly | no |  |
| 80319 (over) | 10:32 | 从…来的 marker | none | narrow-sidebar fix (#11564/#11580) | no | no |  |
| 80324 | 10:32 | 已回复 marker | none | narrow-sidebar fix (#11564/#11580) | no | no | yes |
| 80526 | 10:38 | message | words | narrow-sidebar fix (#11564/#11580) | yes | no |  |
| 80657 | 10:51 | message | words | auto PR review loop | partly | yes |  |
| 81143 | 11:17 | 已回复 marker | none | narrow-sidebar fix (#11564/#11580) | no | no | yes |
| 81152 | 11:17 | message | words | narrow-sidebar fix (#11564/#11580) | yes | no |  |
| 81152 (over) | 11:17 | 从…来的 marker | none | narrow-sidebar fix (#11564/#11580) | no | no |  |
| 81181 | 11:18 | card | #n only | narrow-sidebar fix (#11564/#11580) | partly | yes | yes |
| 81203 | 11:18 | message | words | narrow-sidebar fix (#11564/#11580) | yes | no | yes |
| 81506 | 11:56 | offer | words | offer #11590 | partly | yes |  |
| 82442 | 13:56 | card | words | remote access settings (#11230) | partly | yes |  |
| 82550 | 14:10 | message | words | remote access settings (#11230) | yes | no |  |
| 82800 | 14:24 | update note | words | Ducter update | yes | no |  |
| 82830 | 14:24 | message | none | merged-PR summary | no | no | yes |
| 82890 | 14:26 | card | words | remote access settings (#11230) | partly | yes |  |
| 82910 | 14:26 | 已回复 marker | none | settings PR #11389 | no | no | yes |
| 82917 | 14:26 | message | words | settings PR #11389 | yes | no | yes |
| 82991 | 14:39 | ack | words | data migration page (#10500) | yes | no |  |
| 83067 | 14:42 | message | words | remote access settings (#11230) | yes | no |  |
| 83067 (over) | 14:42 | 从…来的 marker | none | remote access settings (#11230) | no | no |  |
| 83076 | 14:42 | ack | words | remote access settings (#11230) | no | no | yes |
| 83085 | 14:42 | 已回复 marker | none | remote access settings (#11230) | no | no | yes |
| 83107 | 14:42 | message | words | data migration page (#10500) | yes | no |  |
| 83177 | 14:45 | 已回复 marker | none | remote access settings (#11230) | no | no | yes |
| 83180 | 14:45 | message | words | remote access settings (#11230) | yes | no |  |
| 83313 | 14:52 | ack | words | data migration page (#10500) | yes | no |  |
| 83323 | 14:53 | card | #n only | data migration page (#10500) | partly | yes | yes |
| 83337 | 14:53 | message | words | data migration page (#10500) | yes | no |  |
| 83450 | 15:00 | offer | words | offer #11581 | partly | yes |  |
| 83456 | 15:00 | card | none | remote access settings (#11230) | no | no |  |
