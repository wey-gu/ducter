# Memory eval: run2-sonnet-writer-haiku (2026-11-09)

Writer: sonnet via createHarnessWriter (Claude Code over OAR, tool-less). Answerer: haiku (`claude -p`, no tools, no session). One question per call; search over the whole Log, at most two rounds.
Corpus: packages/partner/eval/memory/corpus.ts (69 channel events, ≈1986 tokens). Budgets scaled ≈50× down: hi 450, lo 150, min 120; epoch after 3 segments, 2 per epoch. Graded by rule (lib.ts `grade`), no model judge.

## Digests

5 segments, 1 epoch(s); degraded 0; rewrites 1; repaired by removal 0; writer errors 0. Source ≈1886 tokens, digests as shown ≈2326 tokens.

| try | range | n | ok | writer | reasons |
|---|---|---|---|---|---|
| | #1–#14 | 1 | yes | sonnet |  |
| | #15–#27 | 1 | yes | sonnet |  |
| | #28–#37 | 1 | yes | sonnet |  |
| | #38–#49 | 1 | yes | sonnet |  |
| | #50–#65 | 1 | no | sonnet | your answer was not one JSON object (JSON Parse error: Unrecognized token '<') |
| | #50–#65 | 2 | yes | sonnet |  |

Context sizes (tokens, est.): full 1986 · window 173 · spine 3016

## Results

| condition | accuracy | false memory | stale assertion | abstain | searched | n |
|---|---|---|---|---|---|---|
| full | 1.00 | 0% | 0% | 0% | 0% | 31 |
| window | 0.87 | 0% | 0% | 10% | 74% | 31 |
| spine | 0.97 | 0% | 0% | 0% | 29% | 31 |

| type | full | window | spine |
|---|---|---|---|
| obligations | 1.00 | 1.00 | 1.00 |
| decision_why | 1.00 | 0.67 | 0.67 |
| verbatim | 1.00 | 1.00 | 1.00 |
| temporal | 1.00 | 1.00 | 1.00 |
| supersession | 1.00 | 1.00 | 1.00 |
| aggregation | 1.00 | 0.00 | 1.00 |
| assistant_said | 1.00 | 1.00 | 1.00 |
| existence | 1.00 | 1.00 | 1.00 |
| task_state | 1.00 | 1.00 | 1.00 |
| abstention | 1.00 | 1.00 | 1.00 |
| gist | 1.00 | 0.00 | 1.00 |

Fake checks on the same spine: reachable full 26/26, window 25/26, spine 26/26; replaced decisions still in force 0/1; open obligations found 1/2; inexact anchors 0/11; pre-turn recall precision 5/8 admitted hits on 6 intent questions.

Answer cost: $0.080 (writer cost not metered here). Wall time 209s.

## Non-correct answers

- **a1** (aggregation, window) abstain · searched: 任务 / APNs / 评测: 这周日志里只有一个明确记录的任务：t_psh01“接入 APNs 推送”，11-05 开始，目前还在进行中。11-03 你让我查 HawDB 的 compaction bug，但对话里没有记录开任务，我也无法确认它是否开过。下周三前给你的 digest 评测是我答应过的事项，日志里没有对应的任务记录。
- **a2** (aggregation, window) abstain: 对话里没有明确定下模型选择。唯一相关的是 #63：先按 16 和 8 设置，等评测结果出来再调整，但没有说明 16 和 8 指的是什么。
- **d2** (decision_why, spine) wrong · searched: digest 独立表 Log 事件 / digest 只追加 频道事件 / digest 存储 为什么: 对话里记录了用户选择独立表的原因：要防止有人改动已冻结的 digest，所以加了触发器（#38）。我当时建议不作为频道事件存储（#36 是你提出的问题），但对话中没有明确写出为什么不走 Log 事件的理由。
- **d2** (decision_why, window) abstain · searched: digest 独立的表 / digest Log 事件 / digest 表 设计: 对话里记录了结论：用独立表，并加一个触发器防止有人修改已冻结的 digest。但没有明确说为什么不存成 Log 里的事件，具体理由在对话中没有提到。
- **g1** (gist, window) wrong: 根据我们这段对话记录，这周主要在做三件事：先按 16 和 8 的参数跑评测，看完结果再调整；APNs 相关的任务还在进行中，做完会告诉你；另外文档里不写 memory 的机制。下周你要去上海出差（周二到周四），期间我只推需要你决定的事。记录里只有这几条，如果这周还有其他工作，我看不到。

## The spine the answerer saw

```
## 2026-11-02 10:10 → 2026-11-03 11:35 · #1–#27 · E0001: 2 earlier parts
Topics:
- #1–#14 修 foo 仓库不稳定的 test/race.spec.ts：setup 缺 await，修好后连跑50次通过，已合并进 main; Ducter 搜索先只用 SQLite FTS5，向量库暂缓，等真实频道量过精度再加; verbatim 窗口定为下限 8K、上限 24K; 桌面端打包，我倾向 Tauri，用户尚未明确确认 · foo, test/race.spec.ts, t_foo01, 9f3e2a1c, ducter/fix-race, 50 次, main, Ducter, SQLite FTS5, bigram, 向量检索, verbatim, 8K, 24K, LongMemEval, 115K, Tauri, Electron, 桌面端打包
- #15–#27 先做 Tauri 桌面原型；结果 DMG 92MB 且菜单栏/通知需自写 Rust 插件，用户否决，改原生 SwiftUI，web 仅给手机，Tauri 原型留分支不合并; 用户要求查 HawDB 的 L0 compaction 卡住（L0 文件三百多个不再下合），已开任务 t_hdb01，进行中; 用户立规矩：动 main 分支前先问，不直接 push；已确认 · Tauri, t_dsk01, 92MB, SwiftUI, web 客户端, 菜单栏, 通知权限, Rust 插件, HawDB, ~/dev/hawdb, t_hdb01, L0 compaction, 三百多个, main 分支, 先问, 不直接 push
Decisions:
- D-1 Ducter 搜索先只做 SQLite FTS5，不上向量库；中文用 bigram 切词；等真实频道量过精度再考虑向量检索 (why: FTS 够用，没有服务器依赖) #4
- D-2 verbatim 窗口上限 24K、下限 8K (why: 上下文过大准确率下降（LongMemEval 约115K时掉30–60%），旧内容靠摘要和搜索找回) #12
- D-3 foo 的 race.spec.ts 修复（commit 9f3e2a1c，分支 ducter/fix-race）已合并进 main (why: setup 缺 await 已修，连跑50次通过) #9
- D-4 桌面端改用原生 SwiftUI，web 客户端只给手机用；Tauri 原型留在分支上，不合并 (why: Tauri DMG 92MB 太大，且菜单栏小窗和通知权限都要自己写 Rust 插件) #21
- D-5 以后凡是动 main 分支之前先问用户，不直接 push (why: 用户明确要求) #26
Changed (old → new):
- 桌面端用 Tauri 做原型/方案 → 桌面端改原生 SwiftUI，web 只给手机 #21
The user's own words:
- #4 「向量库先别上，FTS 够用，等量过再说。」
- #12 「那就上限 24K、下限 8K，先这么定。」
- #21 「桌面端改成原生 SwiftUI 吧，web 只给手机用。Tauri 的原型别合并。」
- #26 「以后凡是动 main 分支之前先问我，别直接 push。」
Obligations:
- + O-1 you owe: 汇报任务 t_hdb01（查 HawDB 的 L0 compaction 卡住，代码在 ~/dev/hawdb）的结果 #25
- + O-2 you owe: report the result of task t_hdb01 "查 HawDB 的 L0 compaction 卡住" #25
Tasks at the end of this part:
- t_foo01 "修复 foo 的不稳定测试" done #7
- t_dsk01 "Tauri 桌面原型" done #19
- t_hdb01 "查 HawDB 的 L0 compaction 卡住" running #25

## 2026-11-03 12:20 → 2026-11-04 12:02 · #28–#37 · S0003
Topics:
- #28–#35 t_hdb01 查 HawDB L0 compaction 卡住：任务询问是否把阈值 4 调到 8，用户未答先去开会，次日决议为不调；任务完成，根因是 manifest 锁没释放，已汇报给用户 · t_hdb01, HawDB, L0 compaction, src/compaction.rs:214, manifest 锁, L0 312→6, 1.8GB/min, 阈值 4→8 不调
- #36–#37 讨论 Ducter 的 digest 是否存成 Log 事件；我建议存同一 SQLite 的独立只追加表，不当频道事件，等用户确认 · Ducter, digest, Log 事件, SQLite 独立表, 只追加
Decisions:
- D-6 HawDB compaction 触发阈值先不调（保持 4），只修卡住的 bug (why: 调到 8 写放大降但读变慢；用户选择先只修 bug) #32
- D-7 HawDB L0 卡住的修复：manifest 锁释放问题（src/compaction.rs 第 214 行） (why: 根因是 manifest 锁没释放；修后 L0 从 312 降到 6，写入 1.8GB/min 不变) #33
Changed (old → new): (none)
The user's own words: (none)
Obligations:
- + O-3 waiting on the user: 确认 Ducter digest 是否采用「同一 SQLite 内独立只追加表、不作为频道事件」的方案 #37
- − O-2 settled #34
- − O-1 settled #35
Tasks at the end of this part:
- t_hdb01 "t_hdb01" done #34
In short: t_hdb01 的 HawDB L0 compaction 问题：任务询问阈值，用户开会后决议不调，任务找到 manifest 锁未释放的根因并修复，已汇报。随后用户问 Ducter digest 是否存成 Log 事件，我建议用 SQLite 独立只追加表，尚未得到用户确认。

## 2026-11-04 12:05 → 2026-11-05 11:16 · #38–#49 · S0004
Topics:
- #38–#40 Digest 存储定为独立表加触发器防改；用户要求下周三前跑 digest 评测，我已应下 · digest, 独立表, 触发器, 冻结, 评测, 下周三
- #41–#43 用户要周五上午提醒续 Apple 开发者账号，已设计时器 · Apple 开发者账号, 2026-11-06 11:00, 周五上午, 提醒
- #44–#49 推送方案：Web Push 与 APNs 两条都留；文案要短；开始接入 APNs（任务 t_psh01 运行中） · Web Push, APNs, iPhone app, t_psh01, 需要你, 推送文案
Decisions:
- D-8 Ducter digest 用 SQLite 内独立表存储，并加触发器防止修改已冻结的 digest (why: 用户确认采用独立表方案，并要防止冻结内容被改) #38
- D-9 手机端推送两条都留：网页走 Web Push，iPhone app 走 APNs (why: iPhone 上 Web Push 需先加到主屏幕，原生壳可直接走 APNs) #46
- D-10 推送文案要短；“需要你”只在真正需要用户做决定时才推，其余不打扰 (why: 用户要求减少打扰) #47
Changed (old → new): (none)
The user's own words:
- #38 「行，就用独立表，再加个触发器，防止有人改冻结的 digest。」
- #39 「下周三之前把 digest 的评测跑一遍给我看。」
- #47 「推送文案要短，“需要你”只在真要我做决定的时候才推，别的都别打扰我。」
Obligations:
- + O-4 you owe: 下周三前跑完 digest 评测并给用户看结果 #40
- + O-6 you owe: come back when: 提醒续 Apple 开发者账号 #42
- + O-5 you owe: 接入 iPhone app 的 APNs 推送（任务 t_psh01 进行中） #48
- + O-7 you owe: report the result of task t_psh01 "接入 APNs 推送" #49
- − O-3 settled #38
Tasks at the end of this part:
- t_psh01 "接入 APNs 推送" running #49
In short: 用户确认 digest 用独立表加触发器防改，并要求下周三前看到评测结果。随后设了周五续 Apple 开发者账号的提醒。最后定下 Web Push 与 APNs 并存、推送文案从简，我开始接 APNs。

## 2026-11-05 16:20 → 2026-11-07 11:30 · #50–#65 · S0005
Topics:
- #50–#52 搜索中文分词选 bigram 而非 jieba，用户确认 · bigram, jieba, FTS5, 中文分词
- #53–#55 Apple 开发者账号续期提醒触发，用户已续好 · Apple 开发者账号, 提醒, 续费
- #56–#58 digest 写手用 Sonnet，评测答题用 Haiku · Sonnet, Haiku, digest 写手, FABLES, 评测
- #59–#60 确认 foo race 修复 commit 号 · 9f3e2a1c, ducter/fix-race, race.spec.ts, main
- #61–#63 epoch 合并规则：超过 16 段时合并最老 8 个，看评测后再调 · epoch, 16, 8, 不重新总结
- #64–#65 用户下周二到周四去上海出差，出差期间只推需要决定的事 · 上海出差, 周二到周四, 推送, 需要你
Decisions:
- D-11 digest 写手用 Sonnet；评测里回答问题的用 Haiku (why: 便宜模型摘要不忠实比例高，机械审计查不出改写错误；答题用 Haiku 省钱) #58
- D-12 epoch 合并：单独段超过 16 个时，把最老的 8 个直接拼成一个 epoch，不重新总结；看完评测再调 (why: 研究建议；先用该值再根据评测调整) #63
- D-13 用户出差（下周二到周四，上海）期间只推真正需要用户决定的事 (why: 用户出差不打扰) #65
Changed (old → new): (none)
The user's own words:
- #52 「bigram 吧。」
- #58 「先用 Sonnet 写 digest，评测里回答问题的用 Haiku，省钱。」
- #63 「先按 16 和 8，看完评测再调。」
- #64 「我下周去上海出差，周二到周四三天。」
Obligations:
- − O-6 settled #53
Tasks at the end of this part: (none)
In short: 本段确认中文分词用 bigram（与 D-1 一致）、Apple 开发者账号已续、digest 写手用 Sonnet 且评测答题用 Haiku，并查询了 race 修复 commit。还定下 epoch 按 16/8 合并，并因用户下周二到周四在上海出差，只推真要决定的事。
```
