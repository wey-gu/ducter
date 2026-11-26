# 234: What waits on you, and the overview's name (等你, 手头的事)

The author, 2026-11-26: 「等你 也不是正常中文界面会说的话，手头的事 也是，要换说法，你仔细看看」.
Two words are on trial:

- **等你** (en *Needs you*): the label for what waits on the person: the bar's count (9 个等你), the
  line over the composer (有 9 个等你定), On hand's section and filter, an opened task's state tag,
  a Keep's "waiting on you" items, the glance on the lock screen, the CLI's status.
- **手头的事** (en *On hand*, D80): the name of the overview surface: the nav button, the
  breadcrumb (对话 / 手头的事), the menu (⌘2), the phone's places, sentences that point there
  (在手头的事里看).

Method (AGENTS "metaphor and naming bar"): every place each word appears; at least six candidates
each in natural Chinese with the matching English; a mapping table with false implications; a
rubric; naive raters (LLM proxies) on realistic screen text. Then a pick per term.

## 1. Where the words appear (VERIFIED, `grep` on the branch from rc/0.1.81)

| Word | Mac i18n | web i18n | CLI, core, protocol, iOS, Android | docs/ | glossary |
|---|---|---|---|---|---|
| 等你 as label or count | 14 keys (`header.needs`, `state/lane/count.needs_you`, `door.line`, `door.pebble`, `living.more`, `onhand.fold.needs`, `partners.switch.asks`, `partners.back.asks`, `keep.waiting`, `keep.item.you`, `task.tag.needs_you`, `og.s.needs_you`, `asks.needs`) | the same 14 | CLI 4 (`status.needsYou`, `status.decisions`, `tail.*`), core push (`n 个等你`, `早上好。n 个等你。`), the proactive line (还有 n 个等你定), protocol's ambient glance, iOS Glance.strings, Android `glance_needs_you`, iMessage's morning line | 0 in zh (the English pages say *Needs you*) | 30+ cells |
| 手头的事 as a name | 10 keys (`nav.onhand`, `onhand.title`, `menu.view.onhand`, `keys.onhand`, `pal.go.onhand`, `pal.g.onhand` 手头的, `todos.see`, `float.needs.open`, `away.remove.about`, `keep.waiting.go`) and 8 sentences | the same | CLI 3, core 2 (helpers, the to-do pile), iOS menu | 2 zh mentions, *On hand* 60+ times | 6 cells |

Sentences where 等你 is plain speech (等你回复, 等你点 Go, 在 @bot 等你, 等你 review, 还在等你点头)
are ordinary Chinese and are not the label; they stay.

## 2. Candidates and their mapping

### 2a. 等你 (what waits on the person)

What it has to cover: a question with a default, a question with none, a task that stopped and
needs a look, one that failed, a PR ready to merge, a sign-in, another agent's question, a stopped
line of a group. Most are *not* decisions.

| Candidate (zh / en) | Count form | Maps well | False implications |
|---|---|---|---|
| 等你 / Needs you (now) | 9 个等你 | short | reads as a fragment; "个" makes 9 *people* waiting; who waits for whom is unclear (raters: "你在等别人"); clashes with 在等 / Waiting beside it |
| **待你处理 / Needs you** | 9 个待你处理 | covers every kind (处理 = act on it, whatever it is); the pattern of 飞书 审批 "待我处理", 邮箱 "待处理" | a little formal; could read as a to-do list of the person's own |
| 待处理 / To handle | 9 个待处理 | the most common app word | no 你: read as "queued, the AI will get to it" (4 of 6 raters) |
| 要你定 / For you to decide | 9 个要你定 | the head sentence already says it | only decisions: a failed task or a PR to merge is not a 定; raters: "定" read as 定时/定位/already decided |
| 需要你 / Needs you | 9 个需要你 | literal en parity | a fragment in zh; raters: "needs you to write code", "urgent", "it is begging you" |
| 需要你处理 / Needs your attention | 9 个需要你处理 | clear, raters' most frequent own suggestion | five characters; raters: "something broke and you must fix it" (4 of 6) |
| 待你确认 / To confirm | 9 个待你确认 | natural (支付宝 待确认) | only confirming: a failure has nothing to confirm (raters said so) |
| 找你的 / For you | 9 件事找你 | warm, spoken | "people looking for you", contacts, messages (6 of 6) |
| 待你回复 / Awaiting reply | 9 个待你回复 | natural for messages | collides with D207's 等你回复 / Over to you; "you must reply to someone else's message" |
| 要你看 / To look at | 9 个要你看 | light | "just for reading", no action (6 of 6) |

### 2b. 手头的事 (the overview surface)

What it holds: every task across partners: what waits on the person, what works, what waits on
the world, Looking after, helpers, to-do sources, today's done; Past tasks is one link at its end.

| Candidate (zh / en) | Maps well | False implications | Collides with |
|---|---|---|---|
| 手头的事 / On hand (now) | everything in hand | colloquial; "手头" reads as money at hand (D80) and as the *person's own* to-do list (6 of 6 raters); not a place name any Chinese app uses | — |
| **任务 / Tasks** | what the page lists is exactly the object, 任务 (a task); the tab word of 飞书 任务, 钉钉, Things zh, 滴答 | "my own to-do list" (as every candidate), "scheduled tasks" (1 of 6) | the object word itself: *honest*, the page is the tasks; 做过的事 / Past tasks keeps its own name |
| 进行中 / In progress | natural tab word | "only what runs": done today and Looking after are there too (5 of 6) | D542's state tag 进行中 / Working |
| 工作台 / Workbench | a common zh app word (企业微信 工作台) | a launcher of mini apps, an editor, a toolbox (6 of 6) | D214's 工作台 / Workbench of an opened task |
| 正在做 / Doing | spoken | "what *I* am doing" (5 of 6); misses done and waiting | the section 在做 / Working |
| 事项 / Items | formal, Feishu-ish | calendar events, incidents, Apple 提醒事项 | Jira 事项 in To-do sources |
| 概览 / Overview | the board's role | statistics, a report, a dashboard of numbers (6 of 6) | Settings › 概览 / Overview (D582) |
| 在忙的 / Busy with | warm | "busy people", 勿扰 status (6 of 6); rated lowest (2.33) | — |
| 在办的事 / In hand | literal | 政务 办事, a service hall (4 of 6) | — |

## 3. Naive raters (LLM proxies; INFERRED as a stand-in for people)

`claude -p --model haiku` with no tools, from a scratch directory (its `~/.claude/projects`
folder deleted afterwards), on 2026-11-26. Three personas (a fresh user on WeChat and Alipay; an
office worker on Feishu, WeChat and Things; a developer running several coding agents), two
runs each, so six answers per candidate. Each saw a realistic screen in text: for 等你, the bar
under 小鸭 (`9 个X　在做 3 个　在等 2 个`), the line over the composer (`有 9 个X ›`), the On hand
section `X 9` with three real cards (a rebase question, a failed flaky test, a PR to merge) and
an opened task's tag `[X]`; for 手头的事, the breadcrumb `对话 / X`, the View menu `X ⌘2`, a
phone's places `对话 | X | 设备 | 设置`, the page's head and sections, and the partner's
「在「X」里能看到它做到哪儿」. Asked: what it means and what is in it; natural like WeChat,
Feishu or Apple's zh UI (1–5); what it could be mistaken for; how they'd say it.

| 等你 candidates | natural (mean of 6) | read right (meaning) | raters' own wording, top |
|---|---|---|---|
| 等你 (now) | 3.50 | 6/6, but 4/6 flagged who-waits-for-whom | 需要你处理 ×3, 待你处理 ×2 |
| **待你处理** | **4.00** (all 4) | 6/6 | 需要你处理, 需要你决定 (none called it unnatural) |
| 待处理 | 3.83 | 6/6, 4/6 flagged "queued for the AI" | 待你处理, 待你决定 |
| 要你定 | 3.17 | 6/6, 5/6 flagged 定 | 需要你决定 |
| 需要你 | 3.67 | 6/6, 5/6 flagged urgency or a fragment | 待你处理 ×3 |
| 需要你处理 | 3.83 | 6/6, 4/6 flagged "something broke" | 等你确认, 待你决定 |
| 待你确认 | 4.00 | 6/6, 3/6 flagged "confirm only" | 需要你决定 |
| 找你的 | 3.00 | 6/6, 6/6 flagged "people" | 需要你处理, 待你处理 |
| 待你回复 | 3.50 | 6/6, 6/6 flagged replying to messages | 需要你决定 |
| 要你看 | 3.33 | 5/6, flagged "just reading" | 需要你处理 |

| 手头的事 candidates | natural | read right | raters' own wording, top |
|---|---|---|---|
| 手头的事 (now) | 3.67 | 6/6, 6/6 flagged "my own to-do list" | **任务** 5 of 6 |
| **任务** | 3.67 | 6/6 | none (4 of 6: "无") |
| 进行中 | 3.83 | 6/6, 5/6 flagged "only what runs" | 任务 ×4 |
| 工作台 | 4.00 | 6/6 *after* the content; 6/6 flagged launcher/editor | 任务 ×4 |
| 正在做 | 3.83 | 6/6, 5/6 flagged "what I'm doing" | 进行中 ×4 |
| 事项 | 3.50 | 6/6, flagged calendar/incidents | 任务 ×5 |
| 概览 | 3.67 | 6/6, 6/6 flagged statistics/report | 任务 ×3 |
| 在忙的 | 2.33 | 4/6 | 进行中 ×3 |
| 在办的事 | 3.17 | 6/6, flagged 政务 | 任务 ×5 |

Across the 54 answers on 手头的事's candidates, **任务** was in the raters' own wording 35 times (进行中 19); across the 60 on 等你's,
需要你处理 15, 需要你决定 14, 待你处理 9, 待你决定 7. Haiku's 1–5 scale is compressed (almost every
answer is 3 or 4); the misreadings and the raters' own words carry more signal than the means.

## 4. Rubric

Scores 1–5; length measured in the bar at 390 (`9 个X`) and the phone's places.

| 等你 candidate | legible unlabeled | fit (covers every kind) | zh↔en parity | collisions | length at 390 | total |
|---|---|---|---|---|---|---|
| 等你 | 2 | 4 | 3 | 3 (在等) | 5 | 17 |
| **待你处理** | **5** | **5** | **4** (Needs you) | **5** | **4** (9 个待你处理, 7 chars) | **23** |
| 待处理 | 3 | 4 | 3 | 4 | 5 | 19 |
| 要你定 | 3 | 2 | 3 | 4 | 5 | 17 |
| 需要你 | 3 | 4 | 5 | 5 | 5 | 22 (but a zh fragment: legibility capped) |
| 需要你处理 | 4 | 5 | 4 | 5 | 3 | 21 |
| 待你确认 | 4 | 2 | 3 | 5 | 4 | 18 |
| 找你的 | 2 | 3 | 3 | 3 | 5 | 16 |
| 待你回复 | 3 | 2 | 3 | 1 (等你回复) | 4 | 13 |
| 要你看 | 2 | 2 | 3 | 5 | 5 | 17 |

| 手头的事 candidate | legible unlabeled | fit (holds everything there) | zh↔en parity | collisions | length (places, crumb) | total |
|---|---|---|---|---|---|---|
| 手头的事 | 3 | 4 | 2 (On hand) | 5 | 3 | 17 |
| **任务** | **5** | **5** | **5** (Tasks) | **4** (the object word, honestly) | **5** | **24** |
| 进行中 | 4 | 2 | 4 | 2 (D542 tag) | 5 | 17 |
| 工作台 | 3 | 3 | 4 | 1 (D214) | 5 | 16 |
| 正在做 | 3 | 2 | 3 | 2 (在做) | 5 | 15 |
| 事项 | 3 | 3 | 3 | 3 (Jira 事项) | 5 | 17 |
| 概览 | 2 | 3 | 5 | 1 (Settings) | 5 | 16 |
| 在忙的 | 1 | 2 | 2 | 5 | 5 | 15 |
| 在办的事 | 2 | 3 | 2 | 5 | 3 | 15 |

## 5. The pick

- **等你 → 待你处理** (en stays **Needs you**; counts **n 个待你处理 / n need you**, the line over
  the composer **有 n 个待你处理 › / n waiting on you ›**, the head **有 n 个待你处理。/ n things need
  you.**, **现在没有待你处理的。/ Nothing needs you.**). The only candidate every rater read rightly
  with no flag against what it covers; 处理 fits a question, a failure, a PR and a sign-in alike.
  需要你处理 was the raters' most frequent wording, but at five characters it reads as "something
  broke" and is long in the bar; 待你处理 says the same in the register of Feishu's 待我处理.
- **手头的事 → 任务** (en **On hand → Tasks**). The raters named it themselves for every other
  candidate; it is what the page holds; it is the shortest at 390; and it fixes the en side,
  where *On hand* never translated back to anything. The cost: the place's name is the object's
  word. That is honest here (the page is the tasks); Past tasks keeps 做过的事, Find's group says
  任务 / Tasks beside 做过的 / Earlier.
- Builders keep *On hand* (and `onhand`) as the surface's name in design notes and code; people
  only see 任务 / Tasks.

*Honest limits:* the raters are one cheap model in three costumes, not people; the 1–5 scale
barely moved; no real Chinese user has seen the result. The natural next check is two or three
people looking at the after shots.

## Implications for Ducter

- One label for what waits on the person, 待你处理, in every surface and count, all counted from
  the one needs-you list (D517), so the bar, the line over the composer, On hand's head, the
  partner's face and the Dock badge say the same word and the same number.
- The overview is 任务 / Tasks in both languages; *On hand* is a builders' name only.
- Sentences that are speech (等你回复, 在 @bot 等你, 还在等你点头) stay: they read as normal Chinese.

## Summary

Ten candidates for 等你 and nine for 手头的事 (each with the current word), mapped, scored and shown to 114 haiku answers in realistic screen
text. 待你处理 (en Needs you) and 任务 (en Tasks) win: legible with no label, covering everything
each holds, short at 390, and what the raters reached for on their own. Recorded as D586.
