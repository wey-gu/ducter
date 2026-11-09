# Memory eval: run3-sonnet-writer-haiku (2026-11-09)

> Kept as found, on the final code. One grading error, fixed after this run (probes.ts
> `ABSTAIN`, with a test): x1 on the spine, 「这个问题没有在我们的对话里讨论过…查不到记录」, is an
> abstention, not a false memory. Re-graded: spine 0.97 with false memory 0%; full and window
> unchanged. The window-only condition moved 0.87 → 0.77 between runs 2 and 3 with no code change
> on its path: Haiku's run-to-run spread on 31 probes is about ±0.1 there.

Writer: sonnet via createHarnessWriter (Claude Code over OAR, tool-less). Answerer: haiku (`claude -p`, no tools, no session). One question per call; search over the whole Log, at most two rounds.
Corpus: packages/partner/eval/memory/corpus.ts (69 channel events, ≈1986 tokens). Budgets scaled ≈50× down: hi 450, lo 150, min 120; epoch after 3 segments, 2 per epoch. Graded by rule (lib.ts `grade`), no model judge.

## Digests

5 segments, 1 epoch(s); degraded 0; rewrites 1; repaired by removal 0; writer errors 0. Source ≈1886 tokens, digests as shown ≈2197 tokens.

| try | range | n | ok | writer | reasons |
|---|---|---|---|---|---|
| | #1–#14 | 1 | no | sonnet | anchor #4 「向量库先别上,FTS 够用,等量过再说。」 is not copied exactly from that message; anchor #12 「那就上限 24K、下限 8K,先这么定。」 is not copied exactly from that message |
| | #1–#14 | 2 | yes | sonnet |  |
| | #15–#27 | 1 | yes | sonnet |  |
| | #28–#37 | 1 | yes | sonnet |  |
| | #38–#49 | 1 | yes | sonnet |  |
| | #50–#65 | 1 | yes | sonnet |  |

Context sizes (tokens, est.): full 1986 · window 173 · spine 2819

## Results

| condition | accuracy | false memory | stale assertion | abstain | searched | n |
|---|---|---|---|---|---|---|
| full | 1.00 | 0% | 0% | 0% | 0% | 31 |
| window | 0.77 | 0% | 0% | 10% | 68% | 31 |
| spine | 0.94 | 3% | 0% | 3% | 23% | 31 |

| type | full | window | spine |
|---|---|---|---|
| obligations | 1.00 | 1.00 | 1.00 |
| decision_why | 1.00 | 0.67 | 0.67 |
| verbatim | 1.00 | 1.00 | 1.00 |
| temporal | 1.00 | 0.67 | 1.00 |
| supersession | 1.00 | 0.67 | 1.00 |
| aggregation | 1.00 | 0.00 | 1.00 |
| assistant_said | 1.00 | 0.67 | 1.00 |
| existence | 1.00 | 1.00 | 1.00 |
| task_state | 1.00 | 1.00 | 1.00 |
| abstention | 1.00 | 1.00 | 0.67 |
| gist | 1.00 | 0.00 | 1.00 |

Fake checks on the same spine: reachable full 26/26, window 25/26, spine 26/26; replaced decisions still in force 0/1; open obligations found 2/2; inexact anchors 0/13; pre-turn recall precision 5/8 admitted hits on 6 intent questions.

Answer cost: $0.074 (writer cost not metered here). Wall time 207s.

## Non-correct answers

- **a1** (aggregation, window) wrong · searched: 任务 开过 / APNs 任务 / 评测 下周三: 这周记录里有两个任务相关的事：11-03 你让我开任务排查 HawDB 的 compaction bug（L0 文件堆到三百多个就不往下合），但记录里没有这个任务的编号或状态。11-05 开的是 APNs 推送接入任务 t_psh01，目前还在进行中。
- **a2** (aggregation, window) abstain: 这段对话里只有一条和选择有关的记录：你说“先按 16 和 8，看完评测再调”。但没有说明 16 和 8 指的是什么，也没有提到具体模型名称，所以无法确定到底定了哪些模型选择。
- **d2** (decision_why, spine) abstain · searched: digest 独立表 Log 事件 为什么 / digest 存 Log 事件 频道事件 / 独立只追加表 digest 理由: 对话里记录了决定和用户的理由：用独立的只追加表，并加触发器防止有人改动已冻结的 digest（#38）。但我找不到我当时建议不用 Log 事件的具体理由，对话中没有写明。
- **d2** (decision_why, window) wrong · searched: digest 独立的表 / digest 表 Log 事件 / digest 存储 设计: 对话里定下独立表的是你，在 #38 说“就用独立表，再加个触发器，防止有人改冻结的 digest”。我能看到的记录只有这个结论和防篡改的目的，没有记下为什么不用 Log 事件的详细比较。
- **g1** (gist, window) wrong: 这段对话里主要是三件事：先按 16 和 8 的参数跑、看完评测再调，评测下周三前给你；官网文档不写 memory 的机制；APNs 推送任务还在做。另外你下周二到周四去上海出差，那几天我只推需要你决定的事。我能看到的记录只从 11-07 开始，更早那几天的工作我看不到。
- **s1** (supersession, window) abstain: {"answer": "对话里没有提到桌面端用什么技术方案，目前能看到的只有 APNs 推送任务还在做，以及下周三前给评测结果。桌面端的当前方案需要你另外告诉我。", "cites": [#69]}
- **t1** (temporal, window) abstain: 我们目前的对话里没有提到 HawDB 的 compaction 问题，也没有记录它哪天修好的，所以我无法确认。如果你告诉我修复的大致时间或相关提交，我可以帮你核对。
- **x1** (abstention, spine) false_memory · searched: bge-m3 / Qwen3-Embedding / 向量模型 embedding: 这个问题没有在我们的对话里讨论过，两个模型名都没有出现，我这边也查不到记录。相关的只有 #4：我们定的是搜索先只用 SQLite FTS5，暂不上向量库，等真实频道量过了精度再决定。
- **y1** (assistant_said, window) wrong · searched: verbatim 窗口 / verbatim 窗口 大小 理由 / 16 和 8 窗口: 对话记录里没有我对 11-02 那个问题（verbatim 窗口留多大）的直接回复，所以我无法确认当时建议的数值和理由。之后的相关记录是：11-07 我引用研究建议，段超过 16 个时把最老的 8 个拼成一个 epoch，不重新总结；你随后定下按 16 和 8 先用，看完评测再调。

## The spine the answerer saw

```
## 2026-11-02 10:10 → 2026-11-03 11:35 · #1–#27 · E0001: 2 earlier parts
Topics:
- #1–#14 修 foo 仓库不稳定的 test/race.spec.ts：setup 少一个 await，修好后连跑 50 次通过，已合并进 main; Ducter 搜索先只用 SQLite FTS5，向量库暂不上，等真实频道量过精度再说; verbatim 窗口大小：定上限 24K、下限 8K; 桌面端打包，我倾向 Tauri 而非 Electron/原生，用户尚未表态 · foo, test/race.spec.ts, race.spec.ts, t_foo01, 9f3e2a1c, ducter/fix-race, await, 50 次, Ducter, SQLite FTS5, FTS, 向量库, bigram, verbatim, 24K, 8K, LongMemEval, 115K, Tauri, Electron, 桌面端打包
- #15–#27 先做 Tauri 桌面原型，结果 DMG 92MB 且菜单栏/通知要自写 Rust 插件；用户改为桌面端原生 SwiftUI、web 只给手机，Tauri 原型不合并; 用户要求查 HawDB 的 L0 compaction 卡住（L0 文件三百多个不再合并），已开任务 t_hdb01，进行中; 用户立规矩：动 main 分支前先问，不直接 push；已确认 · Tauri, t_dsk01, 92MB, DMG, SwiftUI, web 客户端, Rust 插件, HawDB, ~/dev/hawdb, L0 compaction, t_hdb01, 三百多个, main 分支, 先问我, 不直接 push
Decisions:
- D-1 Ducter 搜索先只用 SQLite FTS5，不上向量库，等在真实频道量过精度再加 (why: FTS 够用，无需服务器，中文可用 bigram 切词) #4
- D-2 verbatim 窗口上限 24K、下限 8K (why: 更大上下文会降低准确率，老内容靠摘要和搜索找回) #12
- D-3 桌面端改用原生 SwiftUI，web 客户端只给手机用 (why: Tauri 原型 DMG 92MB 太大，菜单栏小窗和通知权限都要自己写 Rust 插件) #21
- D-4 Tauri 原型留在分支上，不合并 (why: 已改走原生 SwiftUI 桌面端) #21
- D-5 动 main 分支之前必须先问用户，不直接 push (why: 用户明确要求) #26
Changed (old → new):
- 先按 Tauri 做桌面原型/桌面端方案 → 桌面端改原生 SwiftUI，web 只给手机 #21
The user's own words:
- #12 「那就上限 24K、下限 8K，先这么定。」
- #1 「今天先把 foo 仓库那个不稳定的测试修了，test/race.spec.ts 这周已经挂了三次。」
- #26 「以后凡是动 main 分支之前先问我，别直接 push。」
- #23 「代码在 ~/dev/hawdb」
Obligations:
- + O-1 you owe: report the result of task t_hdb01 "查 HawDB 的 L0 compaction 卡住" #25
Tasks at the end of this part:
- t_foo01 "修复 foo 的不稳定测试" done #7
- t_dsk01 "Tauri 桌面原型" done #19
- t_hdb01 "查 HawDB 的 L0 compaction 卡住" running #25

## 2026-11-03 12:20 → 2026-11-04 12:02 · #28–#37 · S0003
Topics:
- #28–#35 HawDB L0 compaction 卡住任务 t_hdb01：中途询问阈值 4→8，用户开会后阈值不调；根因是 manifest 锁没释放，修复后完成并汇报 · t_hdb01, HawDB, L0 compaction, src/compaction.rs:214, manifest 锁, L0 312→6, 1.8GB/min, 阈值 4→8 不调
- #36–#37 讨论 Ducter digest 存储方式：建议存同一 SQLite 独立只追加表，不当频道事件；用户尚未明确回应 · Ducter, digest, Log 事件, SQLite 独立表, 只追加
Decisions:
- D-6 HawDB compaction 触发阈值保持 4，不调到 8，只修卡住的 bug (why: 调到 8 写放大降但读变慢；用户选择先不调) #32
Changed (old → new): (none)
The user's own words: (none)
Obligations:
- + O-2 waiting on the user: 确认 Ducter digest 是否按建议存成同一 SQLite 里的独立只追加表（而非 Log 频道事件） #37
- − O-1 settled #34
Tasks at the end of this part:
- t_hdb01 "t_hdb01" done #34
In short: t_hdb01 查出 HawDB L0 compaction 卡住是 manifest 锁未释放（src/compaction.rs 第 214 行），修复后 L0 从 312 降到 6，写入速度不变，阈值按决定未动，已向用户汇报。随后用户问 Ducter digest 是否存成 Log 事件，我建议用同一 SQLite 的独立只追加表，等待用户确认。

## 2026-11-04 12:05 → 2026-11-05 11:16 · #38–#49 · S0004
Topics:
- #38–#43 digest 存独立表并加触发器防改；下周三前跑 digest 评测；周五提醒续 Apple 开发者账号 · 独立表, 触发器, 冻结 digest, digest 评测, 下周三, Apple 开发者账号, 2026-11-06 11:00
- #44–#49 手机推送两条都留：网页 Web Push，iPhone app APNs；文案要短；开始接入 APNs · Web Push, APNs, iPhone app, 需要你, t_psh01
Decisions:
- D-7 Ducter digest 存成同一 SQLite 里的独立只追加表，并加触发器防止修改已冻结的 digest (why: 用户确认建议并要求防止有人改冻结的 digest) #38
- D-8 手机端推送两条都留：网页走 Web Push，iPhone app 走 APNs (why: iPhone 上 Web Push 需先加到主屏幕，原生壳可直接走 APNs) #46
- D-9 推送文案要短；“需要你”只在真要用户做决定时才推，其他不打扰 (why: 用户不想被打扰) #47
Changed (old → new): (none)
The user's own words:
- #38 「行，就用独立表，再加个触发器，防止有人改冻结的 digest。」
- #39 「下周三之前把 digest 的评测跑一遍给我看。」
- #47 「推送文案要短，“需要你”只在真要我做决定的时候才推，别的都别打扰我。」
Obligations:
- + O-3 you owe: 下周三（2026-11-11）前跑完 digest 评测并把结果给用户 #40
- + O-4 you owe: come back when: 提醒续 Apple 开发者账号 #42
- + O-5 you owe: report the result of task t_psh01 "接入 APNs 推送" #49
- − O-2 settled #38
Tasks at the end of this part:
- t_psh01 "接入 APNs 推送" running #49
In short: 用户确认 digest 用独立表并加防改触发器，要求下周三前给出 digest 评测。随后设了周五续 Apple 开发者账号的提醒，并决定推送 Web Push 与 APNs 两条都留、文案要短，我开始接入 APNs。

## 2026-11-05 16:20 → 2026-11-07 11:30 · #50–#65 · S0005
Topics:
- #50–#52 搜索中文分词选 bigram 而非 jieba · bigram, jieba, 中文分词, C 扩展
- #53–#55 Apple 开发者账号续期提醒触发，用户已续好 · Apple 开发者账号, 2026-11-06
- #56–#58 digest 写手用 Sonnet，评测答题用 Haiku · Sonnet, Haiku, FABLES, digest 写手, 评测
- #59–#60 查询 race 修复 commit：9f3e2a1c，已合进 main · 9f3e2a1c, ducter/fix-race, foo race, main
- #61–#63 epoch 合并参数：超过 16 段合最老 8 段，评测后再调 · epoch, 16, 8, 拼接不重新总结
- #64–#65 用户下周去上海出差周二到周四，期间只推真要决定的事 · 上海出差, 周二到周四, 推送, 2026-11-07
Decisions:
- D-10 中文分词先用 bigram，不用 jieba (why: 不用装 C 扩展，两字词也能搜到；jieba 需编译原生扩展，打包升级麻烦) #52
- D-11 digest 写手用 Sonnet；评测里回答问题的用 Haiku (why: 便宜模型摘要不忠实比例高，机械审计查不出改写错；评测答题用 Haiku 省钱) #58
- D-12 epoch 规则：单独段超过 16 个时，把最老的 8 个直接拼成一个 epoch，不重新总结；看完评测再调 (why: 研究建议；先按此值，评测后再调) #63
- D-13 用户出差（下周二到周四，上海）期间只推真要用户决定的事 (why: 用户出差不便被打扰) #65
Changed (old → new): (none)
The user's own words:
- #52 「bigram 吧。」
- #58 「先用 Sonnet 写 digest，评测里回答问题的用 Haiku，省钱。」
- #63 「先按 16 和 8，看完评测再调。」
- #64 「我下周去上海出差，周二到周四三天。」
Obligations:
- − O-4 settled #53
Tasks at the end of this part: (none)
In short: 本段确定了中文分词用 bigram、digest 写手用 Sonnet 而评测答题用 Haiku、epoch 按 16/8 合并（评测后再调）。Apple 开发者账号续期提醒触发，用户已续好；也回答了 race 修复 commit 号 9f3e2a1c。用户告知下周二到周四在上海出差，期间只推真要决定的事。
```
