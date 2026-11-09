# Memory eval: sonnet-writer-haiku (2026-11-09), run 1

> Kept as found. This run surfaced two bugs, both fixed before run 2
> (`2026-11-09-memory-run2-sonnet-writer-haiku.md`): (1) the audit treated the spine's own
> decision id `D-6`, cited in the writer's text, as an invented identifier, so segment #38–#49
> failed three times and froze as a degraded mechanical index (it also lost the "评测" obligation
> from the ledger: "open obligations found 1/2" below); (2) the grader's s3 stale pattern matched
> the negation 「先不调到 8」, so all three s3 answers, which say the threshold is still 4, were
> counted stale. Re-graded by hand with the fixed rule: full 1.00, window 0.87, spine 1.00, stale 0%
> in every condition.

Writer: sonnet via createHarnessWriter (Claude Code over OAR, tool-less). Answerer: haiku (`claude -p`, no tools, no session). One question per call; search over the whole Log, at most two rounds.
Corpus: packages/partner/eval/memory/corpus.ts (69 channel events, ≈1986 tokens). Budgets scaled ≈50× down: hi 450, lo 150, min 120; epoch after 3 segments, 2 per epoch. Graded by rule (lib.ts `grade`), no model judge.

## Digests

5 segments, 1 epoch(s); degraded 1; rewrites 1; repaired by removal 0; writer errors 0. Source ≈1886 tokens, digests as shown ≈1907 tokens.

| try | range | n | ok | writer | reasons |
|---|---|---|---|---|---|
| | #1–#14 | 1 | yes | sonnet |  |
| | #15–#27 | 1 | yes | sonnet |  |
| | #28–#37 | 1 | yes | sonnet |  |
| | #38–#49 | 1 | no | sonnet | "D-6" does not appear in the lines |
| | #38–#49 | 2 | no | sonnet | "D-6" does not appear in the lines |
| | #38–#49 | 3 | no | sonnet+repair | "D-6" does not appear in the lines |
| | #38–#49 | 4 | yes | mechanical |  |
| | #50–#65 | 1 | yes | sonnet |  |

Context sizes (tokens, est.): full 1986 · window 173 · spine 2452

## Results

| condition | accuracy | false memory | stale assertion | abstain | searched | n |
|---|---|---|---|---|---|---|
| full | 0.97 | 0% | 17% | 0% | 0% | 31 |
| window | 0.84 | 0% | 17% | 0% | 74% | 31 |
| spine | 0.97 | 0% | 17% | 0% | 23% | 31 |

| type | full | window | spine |
|---|---|---|---|
| obligations | 1.00 | 1.00 | 1.00 |
| decision_why | 1.00 | 0.67 | 1.00 |
| verbatim | 1.00 | 1.00 | 1.00 |
| temporal | 1.00 | 1.00 | 1.00 |
| supersession | 0.67 | 0.67 | 0.67 |
| aggregation | 1.00 | 0.50 | 1.00 |
| assistant_said | 1.00 | 0.67 | 1.00 |
| existence | 1.00 | 1.00 | 1.00 |
| task_state | 1.00 | 1.00 | 1.00 |
| abstention | 1.00 | 1.00 | 1.00 |
| gist | 1.00 | 0.00 | 1.00 |

Fake checks on the same spine: reachable full 26/26, window 25/26, spine 26/26; replaced decisions still in force 0/1; open obligations found 1/2; inexact anchors 0/9; pre-turn recall precision 5/8 admitted hits on 6 intent questions.

Answer cost: $0.099 (writer cost not metered here). Wall time 210s.

## Non-correct answers

- **a1** (aggregation, window) wrong: 这段对话里能看到的任务只有两个：一是 APNs 相关的任务，还在做，做完会通知你；二是评测和调参，你定了先按 16 和 8 跑，看完评测再调，我承诺下周三前把评测结果给你。这段记录没有完整列出这周开过的所有任务。
- **d2** (decision_why, window) wrong · searched: digest 独立的表 / digest Log 事件 / digest 表 设计: 对话里记录了决定：用户在 #38 定了用独立表，并加触发器防止有人改动冻结的 digest。但对话没有写出为什么独立表比 Log 事件更合适的理由，所以我无法替你解释具体原因。
- **g1** (gist, window) wrong: 根据现有对话，这一周主要在做评测（先按 16 和 8 的设置，看完评测再调整）和 APNs 相关任务（仍在进行中），文档里也约定不写 memory 机制。评测计划下周三前交给你，APNs 完成后会告诉你。
- **s3** (supersession, full) stale: HawDB 的 compaction 触发阈值现在还是 4。你决定先不调到 8，只修了卡住的 manifest 锁问题（#32）。
- **s3** (supersession, spine) stale: HawDB 的 compaction 触发阈值目前保持为 4。之前考虑过调到 8，但用户决定不调，只修复卡住的 bug。
- **s3** (supersession, window) stale · searched: HawDB compaction 阈值 / compaction 阈值 HawDB / compaction threshold 16 8: 日志里没有确认当前的值。11-03 的任务提问写的是从 4 调到 8（#29），11-04 记录阈值没动（#35），11-07 你说先按 16 和 8、看完评测再调（#63），但没有记录说明这次改动已经生效。
- **y1** (assistant_said, window) wrong · searched: verbatim 窗口 / verbatim window / 16 和 8: 对话里你在 11-02 问过 verbatim 窗口留多大合适（#10），但我当时的回复不在我能检索到的记录里，所以无法确认我建议的大小和理由。与之相关的只有 11-07 的数字：我在 #62 说研究里的建议是“单独的段超过 16 个时，把最老的 8 个直接拼成一个 epoch”，你在 #63 确定先按 16 和 8 来。#62 没有明确把它叫作 verbatim 窗口，所以不能直接当作那个建议。

## The spine the answerer saw

```
## 2026-11-02 10:10 → 2026-11-03 11:35 · #1–#27 · E0001: 2 earlier parts
Topics:
- #1–#14 修 foo 仓库不稳定的 race.spec.ts：setup 缺一个 await，修好后连跑 50 次通过，已合并进 main; Ducter 搜索先只用 SQLite FTS5，向量库暂缓，等真实频道量过精度再加; verbatim 窗口大小定为下限 8K、上限 24K; 桌面端打包我倾向 Tauri（与手机共用 web 代码、包体比 Electron 小），用户尚未明确拍板 · foo, test/race.spec.ts, t_foo01, 9f3e2a1c, ducter/fix-race, 50 次, await, Ducter, SQLite FTS5, 向量库, bigram, verbatim, 8K, 24K, LongMemEval, 115K, Tauri, Electron, 桌面端打包
- #15–#27 先按 Tauri 做桌面原型，结果能跑但要自写 Rust 插件、DMG 92MB；用户改为原生 SwiftUI 桌面端，web 仅手机用，Tauri 原型不合并; 用户让开任务查 HawDB 的 L0 compaction 卡住（L0 文件三百多个不再下合），任务已启动未出结果; 用户立规矩：动 main 分支前先问，不直接 push；已确认 · Tauri, t_dsk01, 92MB, SwiftUI, DMG, 菜单栏, 通知权限, web 客户端, HawDB, ~/dev/hawdb, t_hdb01, L0 compaction, 三百多个, main 分支, 先问, 不直接 push
Decisions:
- D-1 Ducter 搜索先只做 SQLite FTS5，不上向量库；等在真实频道量过精度再考虑加向量检索 (why: FTS 够用；无需服务器，中文可用 bigram 切词) #4
- D-2 verbatim 窗口上限 24K、下限 8K (why: 上下文过大准确率下降（LongMemEval 约 115K 时掉 30–60%），旧内容靠摘要和搜索找回) #12
- D-3 桌面端改用原生 SwiftUI；web 客户端只给手机用；Tauri 原型留在分支上，不合并 (why: Tauri DMG 92MB 太大，菜单栏小窗和通知都要自己写 Rust 插件) #21
- D-4 凡是动 main 分支之前先问用户，不直接 push (why: 用户的明确要求) #26
Changed (old → new):
- 桌面端用 Tauri 做（先做原型） → 桌面端改原生 SwiftUI，web 只给手机用，Tauri 原型不合并 #21
The user's own words:
- #4 「向量库先别上，FTS 够用，等量过再说。」
- #12 「那就上限 24K、下限 8K，先这么定。」
- #26 「以后凡是动 main 分支之前先问我，别直接 push。」
- #23 「你开个任务查一下，代码在 ~/dev/hawdb。」
Obligations:
- + O-1 you owe: 汇报任务 t_hdb01（查 HawDB L0 compaction 卡住）的结果 #25
- + O-2 you owe: report the result of task t_hdb01 "查 HawDB 的 L0 compaction 卡住" #25
Tasks at the end of this part:
- t_foo01 "修复 foo 的不稳定测试" done #7
- t_dsk01 "Tauri 桌面原型" done #19
- t_hdb01 "查 HawDB 的 L0 compaction 卡住" running #25

## 2026-11-03 12:20 → 2026-11-04 12:02 · #28–#37 · S0003
Topics:
- #28–#35 t_hdb01 查 HawDB L0 compaction 卡住：中途询问是否把触发阈值 4 调到 8，用户去开会，次日决定不调，只修 bug；任务完成并汇报 · t_hdb01, HawDB, L0 compaction, manifest 锁, src/compaction.rs:214, L0 312→6, 写入 1.8GB/min, 阈值 4→8 不调
- #36–#37 讨论 Ducter 的 digest 存储方式：建议放同一 SQLite 的独立只追加表，不作为频道事件；用户尚未回应 · Ducter, digest, Log 事件, SQLite 独立表, 只追加
Decisions:
- D-5 HawDB compaction 触发阈值保持 4，不调到 8，只修卡住的 bug (why: 调到 8 写放大降低但读会变慢；先只修 bug) #32
- D-6 Ducter 的 digest 建议存在同一 SQLite 的独立表，只追加，不作为频道事件（用户尚未确认） (why: 客户端不会收到它，也不会被当成一句话显示出来) #37
Changed (old → new): (none)
The user's own words: (none)
Obligations:
- − O-2 settled #34
- − O-1 settled #35
Tasks at the end of this part:
- t_hdb01 "t_hdb01" done #34
In short: t_hdb01 找到卡住原因（manifest 锁未释放，src/compaction.rs 第 214 行），阈值问题经用户次日确认不调，修复后 L0 从 312 降到 6、写入速度不变，并已汇报。随后用户问 Ducter digest 是否存成 Log 事件，我建议用 SQLite 独立只追加表。

## 2026-11-04 12:05 → 2026-11-05 11:16 · #38–#49 · S0004 · index only: search the Log for details
Topics:
- #38 行，就用独立表，再加个触发器，防止有人改冻结的 digest。
- #39–#40 下周三之前把 digest 的评测跑一遍给我看。
- #41–#43 周五上午提醒我续 Apple 开发者账号。
- #44–#45 手机端推送，用 Web Push 还是 APNs？
- #46 同意，两条都留。
- #47–#49 推送文案要短，“需要你”只在真要我做决定的时候才推，别的都别打扰我。
Decisions: (none)
Changed (old → new): (none)
The user's own words: (none)
Obligations:
- + O-3 you owe: come back when: 提醒续 Apple 开发者账号 #42
- + O-4 you owe: report the result of task t_psh01 "接入 APNs 推送" #49
Tasks at the end of this part:
- t_psh01 "接入 APNs 推送" running #49
In short: (none)

## 2026-11-05 16:20 → 2026-11-07 11:30 · #50–#65 · S0005
Topics:
- #50–#52 搜索中文分词选型：bigram 而非 jieba，用户确认 · bigram, jieba, 中文分词, FTS5
- #53–#55 Apple 开发者账号续期提醒触发，用户已续好 · Apple 开发者账号, 提醒
- #56–#58 digest 写手模型选型：Sonnet 写 digest，评测回答用 Haiku · Sonnet, Haiku, FABLES, digest 写手
- #59–#60 查询 foo race 修复 commit：9f3e2a1c，已合入 main · 9f3e2a1c, ducter/fix-race, foo race, main
- #61–#63 epoch 合并参数：超 16 段合最老 8 个，评测后再调 · epoch, 16, 8, 直接拼接
- #64–#65 用户下周去上海出差周二到周四，期间只推需决策的事 · 上海出差, 周二到周四
Decisions:
- D-7 搜索中文分词用 bigram，不用 jieba (why: 不用装 C 扩展，两字词也能搜到；jieba 需编译原生扩展，打包升级麻烦) #52
- D-8 digest 写手用 Sonnet，评测里回答问题的用 Haiku (why: 便宜模型摘要不忠实比例高；评测回答用 Haiku 省钱) #58
- D-9 epoch 合并：单独段超过 16 个时，把最老的 8 个直接拼成一个 epoch，不重新总结；看完评测再调 (why: 研究里的建议) #63
- D-10 用户出差（下周二到周四）期间，只推真要用户决定的事 (why: 用户在上海出差三天) #65
Changed (old → new): (none)
The user's own words:
- #58 「先用 Sonnet 写 digest，评测里回答问题的用 Haiku，省钱。」
- #63 「先按 16 和 8，看完评测再调。」
- #64 「我下周去上海出差，周二到周四三天。」
- #52 「bigram 吧。」
Obligations:
- − O-3 settled #53
Tasks at the end of this part: (none)
In short: 本段确定了搜索中文分词用 bigram、digest 写手用 Sonnet（评测回答用 Haiku）、epoch 合并参数 16/8。Apple 开发者账号已续好，并查了 foo race 修复的 commit。用户告知下周二到周四在上海出差，期间只推需决策的事。
```
