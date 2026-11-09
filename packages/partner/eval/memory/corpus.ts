// A week of one person's channel with their partner, as data (research/14 §6.6, research/15).
// The content is the author's real work (Ducter, HawDB, foo), told the way it went; times are
// Shanghai time. Notes mark what a careful digest writer must keep: decisions (and what they
// replace), the user's binding words, and what is owed. The oracle writer (lib.ts) reads only
// the notes, so the fake run measures the pipeline, not a model.

export interface Note {
  key?: string; // a name for this decision or obligation, for later notes
  decide?: string; // a binding decision made here
  why?: string;
  replaces?: string; // key of an earlier decision this one replaces
  anchor?: string; // the user's own words to keep (an exact substring of the message)
  owe?: string; // an obligation opened here (who: me)
  closes?: string; // key of an obligation settled here
}

export type Line =
  | { at: string; user: string; note?: Note }
  | { at: string; ai: string; note?: Note }
  | { at: string; open: { task: string; title: string; ack: string } }
  | { at: string; report: { task: string; state: "done" | "needs_input" | "failed"; summary: string; question?: { text: string; default: string } } }
  | { at: string; resolve: { task: string; option: "go" | "hold" | "reply"; text?: string }; note?: Note }
  | { at: string; merged: { task: string } }
  | { at: string; timer: { id: string; reason: string; state: "armed" | "fired"; due?: string } };

export const corpus: Line[] = [
  // ---- Mon 11-02 ----
  { at: "11-02 09:10", user: "早。今天先把 foo 仓库那个不稳定的测试修了，test/race.spec.ts 这周已经挂了三次。" },
  { at: "11-02 09:10", open: { task: "t_foo01", title: "修复 foo 的不稳定测试", ack: "好，我去修 foo 里不稳定的 race.spec.ts。" } },
  {
    at: "11-02 09:14",
    user: "另外 Ducter 的搜索，我想先用 SQLite FTS5。向量库先别上，FTS 够用，等量过再说。",
    note: { key: "search", decide: "Ducter 的搜索先用 SQLite FTS5，不上向量库", why: "不需要服务器；先量过再加向量", anchor: "向量库先别上，FTS 够用" },
  },
  { at: "11-02 09:15", ai: "好，先只做 FTS5。向量检索等我们在真实频道上量过精度再加：没有服务器，中文也能用 bigram 切词搜到。" },
  { at: "11-02 09:52", report: { task: "t_foo01", state: "done", summary: "race.spec.ts 的 setup 里少了一个 await，修好后连跑 50 次全部通过。commit 9f3e2a1c，分支 ducter/fix-race。" } },
  { at: "11-02 09:53", ai: "foo 的测试修好了：setup 里少了一个 await，连跑 50 次都通过。" },
  { at: "11-02 10:05", merged: { task: "t_foo01" } },
  { at: "11-02 10:20", user: "verbatim 窗口你觉得留多大合适？" },
  {
    at: "11-02 10:21",
    ai: "我建议 8K 到 24K。再大反而不好：LongMemEval 里上下文到 115K 左右，准确率掉 30–60%。老的内容靠摘要和搜索找回来。",
  },
  { at: "11-02 10:24", user: "那就上限 24K、下限 8K，先这么定。", note: { key: "window", decide: "verbatim 窗口上限 24K、下限 8K", anchor: "上限 24K、下限 8K，先这么定" } },
  { at: "11-02 14:30", user: "桌面端打包，你说用 Tauri 还是原生？" },
  { at: "11-02 14:31", ai: "我倾向 Tauri：桌面和手机共用一套 web 代码，包体也比 Electron 小很多。" },
  { at: "11-02 14:33", user: "行，先按 Tauri 做个原型看看。", note: { key: "desktop", decide: "桌面端先按 Tauri 做原型", anchor: "先按 Tauri 做个原型看看" } },
  { at: "11-02 14:33", open: { task: "t_dsk01", title: "Tauri 桌面原型", ack: "好，我去做一个 Tauri 桌面原型。" } },

  // ---- Tue 11-03 ----
  { at: "11-03 09:40", report: { task: "t_dsk01", state: "done", summary: "Tauri 原型能跑起来；但菜单栏小窗和通知权限都要自己写 Rust 插件，打出来的 DMG 有 92MB。" } },
  { at: "11-03 09:41", ai: "Tauri 原型能跑了，不过菜单栏和通知都要自己写 Rust 插件，DMG 有 92MB。" },
  {
    at: "11-03 09:50",
    user: "92MB 太大了，菜单栏还得自己写插件……算了，桌面端改成原生 SwiftUI 吧，web 只给手机用。Tauri 的原型别合并。",
    note: { key: "desktop2", decide: "桌面端改成原生 SwiftUI，web 客户端只给手机用", why: "Tauri 的 DMG 92MB，菜单栏和通知要自己写 Rust 插件", replaces: "desktop", anchor: "桌面端改成原生 SwiftUI 吧，web 只给手机用" },
  },
  { at: "11-03 09:51", ai: "好，桌面端改原生 SwiftUI，手机继续用 web 客户端。Tauri 原型留在分支上，不合并。" },
  { at: "11-03 10:30", user: "HawDB 那边 compaction 有个 bug，L0 文件堆到三百多个就不往下合了。你开个任务查一下，代码在 ~/dev/hawdb。" },
  { at: "11-03 10:30", open: { task: "t_hdb01", title: "查 HawDB 的 L0 compaction 卡住", ack: "好，我去 ~/dev/hawdb 查 L0 compaction 卡住的问题。" } },
  {
    at: "11-03 10:35",
    user: "对了，以后凡是动 main 分支之前先问我，别直接 push。",
    note: { key: "main", decide: "动 main 分支之前先问用户，不直接 push", anchor: "凡是动 main 分支之前先问我，别直接 push" },
  },
  { at: "11-03 10:35", ai: "记住了：动 main 之前先问你。" },
  {
    at: "11-03 11:20",
    report: { task: "t_hdb01", state: "needs_input", summary: "找到卡住的地方了，修之前想确认一件事。", question: { text: "compaction 的触发阈值要不要从 4 调到 8？写放大会降一些，但读会慢一点。", default: "先不调，只修卡住的 bug" } },
  },
  { at: "11-03 11:25", user: "我先去开会，晚点再说。" },
  { at: "11-03 11:25", ai: "好，HawDB 那个问题先放着，等你回来。" },

  // ---- Wed 11-04 ----
  { at: "11-04 09:05", resolve: { task: "t_hdb01", option: "reply", text: "阈值先不调，只修卡住的 bug。" }, note: { key: "threshold", decide: "HawDB 的 compaction 阈值先不调（保持 4），只修卡住的 bug" } },
  {
    at: "11-04 10:40",
    report: { task: "t_hdb01", state: "done", summary: "卡住是因为 manifest 锁没释放（src/compaction.rs 第 214 行）。修好后 L0 从 312 个降到 6 个，基准写入 1.8GB/min 不变。" },
  },
  { at: "11-04 10:41", ai: "HawDB 修好了：manifest 锁没释放，L0 从 312 个降到 6 个，写入速度没变。阈值按你说的没动。" },
  { at: "11-04 11:00", user: "不错。帮我想一下，Ducter 的 digest 要不要直接存成 Log 里的事件？" },
  { at: "11-04 11:02", ai: "我建议存在同一个 SQLite 里的独立表，只追加，不当频道事件：这样客户端不会收到它，也不会被当成一句话显示出来。" },
  {
    at: "11-04 11:05",
    user: "行，就用独立表，再加个触发器，防止有人改冻结的 digest。",
    note: { key: "store", decide: "digest 存在同一个 SQLite 的独立只追加表里，用触发器防修改", why: "客户端收不到，不会当成频道消息显示", anchor: "就用独立表，再加个触发器" },
  },
  {
    at: "11-04 11:08",
    user: "下周三之前把 digest 的评测跑一遍给我看。",
    note: { key: "evalDue", owe: "下周三（11-11）前把 digest 评测跑一遍交给用户", anchor: "下周三之前把 digest 的评测跑一遍给我看" },
  },
  { at: "11-04 11:08", ai: "好，下周三前给你评测结果。" },
  { at: "11-04 16:00", user: "周五上午提醒我续 Apple 开发者账号。" },
  { at: "11-04 16:00", timer: { id: "w_apple1", reason: "提醒续 Apple 开发者账号", state: "armed", due: "11-06 10:00" } },
  { at: "11-04 16:00", ai: "好，周五上午 10 点提醒你。" },

  // ---- Thu 11-05 ----
  { at: "11-05 10:10", user: "手机端推送，用 Web Push 还是 APNs？" },
  { at: "11-05 10:12", ai: "iPhone 上 Web Push 要先把网页加到主屏幕才行；原生壳可以直接走 APNs。我建议两条都留：网页走 Web Push，iPhone app 走 APNs。" },
  { at: "11-05 10:15", user: "同意，两条都留。", note: { key: "push", decide: "推送两条都留：网页 Web Push，iPhone app 用 APNs", anchor: "同意，两条都留" } },
  {
    at: "11-05 10:16",
    user: "推送文案要短，“需要你”只在真要我做决定的时候才推，别的都别打扰我。",
    note: { key: "pushcopy", decide: "推送只在真需要用户决定时发，文案要短", anchor: "“需要你”只在真要我做决定的时候才推" },
  },
  { at: "11-05 10:16", open: { task: "t_psh01", title: "接入 APNs 推送", ack: "好，我去把 iPhone app 的 APNs 推送接上。" } },
  { at: "11-05 15:20", user: "顺便问下，搜索的中文分词，用 jieba 还是 bigram？" },
  { at: "11-05 15:22", ai: "先用 bigram：不用装 C 扩展，两个字的词也能搜到。jieba 要编译原生扩展，打包和升级都麻烦。" },
  { at: "11-05 15:23", user: "bigram 吧。", note: { key: "cjk", decide: "中文分词用 bigram，不用 jieba", why: "jieba 要 C 扩展", anchor: "bigram 吧" } },

  // ---- Fri 11-06 ----
  { at: "11-06 10:00", timer: { id: "w_apple1", reason: "提醒续 Apple 开发者账号", state: "fired" } },
  { at: "11-06 10:00", ai: "提醒一下：Apple 开发者账号该续了。" },
  { at: "11-06 10:30", user: "续好了。" },
  { at: "11-06 14:00", user: "digest 的写手用哪个模型比较好？" },
  { at: "11-06 14:02", ai: "建议用 Sonnet 这样的中档模型：FABLES 里便宜模型摘要不忠实的比例高好几倍，机械审计又查不出改写的错。" },
  {
    at: "11-06 14:05",
    user: "先用 Sonnet 写 digest，评测里回答问题的用 Haiku，省钱。",
    note: { key: "models", decide: "digest 写手用 Sonnet，评测回答用 Haiku", why: "便宜模型写摘要不忠实率高", anchor: "先用 Sonnet 写 digest，评测里回答问题的用 Haiku" },
  },
  { at: "11-06 16:40", user: "上回 foo 那个 race 的修复，commit 号是多少来着？" },
  { at: "11-06 16:40", ai: "是 9f3e2a1c，在 ducter/fix-race 分支上，已经合进 main 了。" },

  // ---- Sat 11-07 ----
  { at: "11-07 10:00", user: "epoch 你觉得多少段合一次？" },
  { at: "11-07 10:02", ai: "研究里的建议是：单独的段超过 16 个时，把最老的 8 个直接拼成一个 epoch，不重新总结。" },
  { at: "11-07 10:04", user: "先按 16 和 8，看完评测再调。", note: { key: "epoch", decide: "epoch：超过 16 段时把最老的 8 段拼成一个", anchor: "先按 16 和 8，看完评测再调" } },
  { at: "11-07 10:30", user: "我下周去上海出差，周二到周四三天。" },
  { at: "11-07 10:30", ai: "好，出差那几天我只推真要你决定的事。" },
  {
    at: "11-07 11:00",
    user: "还有，官网文档里先别写 memory 的机制，用户根本看不到这些。",
    note: { key: "docs", decide: "官网文档不写 memory 的机制", anchor: "官网文档里先别写 memory 的机制" },
  },
  { at: "11-07 11:00", ai: "明白，文档里不提记忆的机制。" },
  { at: "11-07 11:30", user: "好，今天就这些。" },
  { at: "11-07 11:30", ai: "好。下周三前我把评测给你，APNs 那个任务还在做，好了告诉你。" },
];
