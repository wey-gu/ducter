// Questions about the corpus, over the 11 types of research/14 §6.6. Graded by rules, not by a
// model: `must` all match (or `atLeast` of `of`), `stale` = a superseded value asserted as
// current, a trap is answered only by saying it never came up. `evidence` is text in the Log that
// supports the answer (the fake run checks it is in view or found by `query`).

export type ProbeType =
  | "obligations"
  | "decision_why"
  | "verbatim"
  | "temporal"
  | "supersession"
  | "aggregation"
  | "assistant_said"
  | "existence"
  | "task_state"
  | "abstention"
  | "gist";

export interface Probe {
  id: string;
  type: ProbeType;
  q: string;
  must?: RegExp[];
  any?: RegExp[]; // at least one
  atLeast?: { n: number; of: RegExp[] };
  stale?: RegExp[]; // asserting the superseded value as current
  trap?: true; // never discussed: the only right answer says so
  evidence: string[];
  query?: string; // what a model would search for (fake run)
}

const ABSTAIN = /没(有)?(讨论|提|聊|说|定|决定|记录|出现)|没有?在.{0,12}(讨论|提|聊|说)过|查不到|未(讨论|提|定)|不知道|不确定|无法确定|找不到|没找到|not (discussed|mentioned|decided|in the)|never (discussed|came up|mentioned|decided)|no record|unknown|don't know|isn't in|没有相关/i;
export { ABSTAIN };

export const probes: Probe[] = [
  // 1. Open obligations
  { id: "o1", type: "obligations", q: "你现在还欠我哪些事没交付？", must: [/评测|eval/i, /APNs|推送/], evidence: ["下周三之前把 digest 的评测跑一遍给我看"], query: "评测 下周三" },
  { id: "o2", type: "obligations", q: "digest 评测我要你什么时候之前给我？", must: [/下周三|11-11|11月11|11 月 11/], evidence: ["下周三之前把 digest 的评测跑一遍给我看"], query: "评测 下周三" },
  { id: "o3", type: "obligations", q: "HawDB 那个阈值的问题，现在还在等我回答吗？只回答是或否，再说一句原因。", must: [/否|不|没有|已经|no/i], stale: [/^\s*(是|在等|yes)/i], evidence: ["阈值先不调，只修卡住的 bug。"], query: "阈值" },

  // 2. Decision + rationale
  { id: "d1", type: "decision_why", q: "为什么桌面端最后没用 Tauri？", any: [/92\s?MB/i, /Rust 插件|插件/, /菜单栏/], evidence: ["DMG 有 92MB"], query: "Tauri 92MB" },
  { id: "d2", type: "decision_why", q: "为什么 digest 存成独立的表，而不是 Log 里的事件？", any: [/客户端/, /client/i], evidence: ["客户端不会收到它"], query: "独立表 客户端" },
  { id: "d3", type: "decision_why", q: "中文分词为什么没选 jieba？", any: [/C ?扩展|原生扩展|编译|native/i], evidence: ["jieba 要编译原生扩展"], query: "jieba" },

  // 3. Verbatim
  { id: "v1", type: "verbatim", q: "关于向量库，我的原话是什么？请逐字引用。", must: [/向量库先别上，?\s?FTS 够用/], evidence: ["向量库先别上，FTS 够用"], query: "向量库先别上" },
  { id: "v2", type: "verbatim", q: "关于 main 分支，我当时原话怎么说的？请逐字引用。", must: [/凡是动 main 分支之前先问我，?\s?别直接 push/], evidence: ["凡是动 main 分支之前先问我，别直接 push"], query: "main 分支 push" },
  { id: "v3", type: "verbatim", q: "我改桌面端方案时的原话是什么？请逐字引用。", must: [/桌面端改成原生 SwiftUI 吧/], evidence: ["桌面端改成原生 SwiftUI 吧，web 只给手机用"], query: "SwiftUI" },
  { id: "v4", type: "verbatim", q: "推送什么时候才该推，我的原话是什么？请逐字引用。", must: [/只在真要我做决定的时候才推/], evidence: ["“需要你”只在真要我做决定的时候才推"], query: "需要你 决定 推" },

  // 4. Temporal
  { id: "t1", type: "temporal", q: "HawDB 的 compaction 问题是哪天修好的？", must: [/11-04|11\/4|11 ?月 ?4|周三|星期三|Wed|Nov(ember)?\.? 4/i], evidence: ["L0 从 312 个降到 6 个"], query: "HawDB L0 312" },
  { id: "t2", type: "temporal", q: "我下周出差是哪几天？", must: [/周二|星期二|Tue/i, /周四|星期四|Thu/i], evidence: ["周二到周四三天"], query: "出差" },
  { id: "t3", type: "temporal", q: "续 Apple 开发者账号的提醒是哪天响的？", must: [/11-06|11\/6|11 ?月 ?6|周五|星期五|Fri|Nov(ember)?\.? 6/i], evidence: ["提醒续 Apple 开发者账号"], query: "Apple 开发者账号" },

  // 5. Knowledge update / supersession (the current value only)
  { id: "s1", type: "supersession", q: "桌面端现在定的是用什么做？只回答当前方案。", must: [/SwiftUI|原生|native/i], stale: [/^(?!.*(SwiftUI|原生|native)).*Tauri/is], evidence: ["桌面端改成原生 SwiftUI 吧"], query: "桌面端 SwiftUI" },
  { id: "s2", type: "supersession", q: "web 客户端现在给哪些设备用？", must: [/手机|phone|iPhone/i], stale: [/桌面和手机共用|桌面.{0,4}也用 web/], evidence: ["web 只给手机用"], query: "web 手机" },
  { id: "s3", type: "supersession", q: "HawDB 的 compaction 阈值现在是多少？", must: [/(还是|仍是|保持|是|为)\s*4|没(调|动)|不调/], stale: [/(现在|目前|当前)(已经)?(是|为|调到|改成)\s*8|已经(调|改)(到|成)\s*8/], evidence: ["阈值先不调"], query: "阈值" },

  // 6. Multi-session aggregation
  { id: "a1", type: "aggregation", q: "这周一共开过哪些任务？", atLeast: { n: 4, of: [/foo|race|不稳定/i, /Tauri/i, /HawDB|compaction/i, /APNs|推送/i] }, evidence: ["修复 foo 的不稳定测试", "Tauri 桌面原型", "查 HawDB 的 L0 compaction 卡住", "接入 APNs 推送"] },
  { id: "a2", type: "aggregation", q: "这几天关于模型的选择定了哪些？", must: [/Sonnet/i, /Haiku/i], evidence: ["先用 Sonnet 写 digest，评测里回答问题的用 Haiku"], query: "Sonnet Haiku" },

  // 7. Assistant-said recall
  { id: "y1", type: "assistant_said", q: "你当时建议 verbatim 窗口多大？理由是什么？", must: [/8\s?K/i, /24\s?K/i], any: [/115\s?K|LongMemEval|准确率|注意力/i], evidence: ["LongMemEval 里上下文到 115K 左右"], query: "LongMemEval 115K" },
  { id: "y2", type: "assistant_said", q: "你说 foo 那个修复的 commit 号是多少？", must: [/9f3e2a1c/], evidence: ["9f3e2a1c"], query: "9f3e2a1c" },
  { id: "y3", type: "assistant_said", q: "关于推送，你最初建议的方案是什么？", must: [/Web Push/i, /APNs/i], evidence: ["网页走 Web Push，iPhone app 走 APNs"], query: "Web Push APNs" },

  // 8. Existence and navigation
  { id: "e1", type: "existence", q: "我们讨论过 epoch 多少段合一次吗？结论是什么？", must: [/16/, /8/], evidence: ["先按 16 和 8，看完评测再调"], query: "epoch" },
  { id: "e2", type: "existence", q: "我们讨论过官网文档要不要写记忆机制吗？", must: [/不写|别写|不提|先别/], evidence: ["官网文档里先别写 memory 的机制"], query: "官网文档 memory" },
  { id: "e3", type: "existence", q: "我们聊过 Ducter 的 Windows 版本吗？", trap: true, evidence: [] },

  // 9. Window (task) state
  { id: "w1", type: "task_state", q: "HawDB 那个任务现在什么状态？", must: [/完成|修好|done|fixed/i], stale: [/^(?!.*(完成|修好|done|fixed)).*(等你|在查|进行中|working)/is], evidence: ["L0 从 312 个降到 6 个"], query: "HawDB" },
  { id: "w2", type: "task_state", q: "APNs 推送那个任务做完了吗？", must: [/还在|进行中|没.{0,3}(完成|做完|好)|未完成|尚未|not (yet )?(done|finished)|still/i], evidence: ["接入 APNs 推送"], query: "APNs" },
  { id: "w3", type: "task_state", q: "Tauri 原型的分支合并了吗？", must: [/没|未|不合并|别合并|not/i], stale: [/^(已经)?合并了/], evidence: ["Tauri 原型留在分支上，不合并"], query: "Tauri 合并" },

  // 10. Abstention / false premise
  { id: "x1", type: "abstention", q: "我们定的向量模型是 bge-m3 还是 Qwen3-Embedding？", trap: true, evidence: [] },
  { id: "x2", type: "abstention", q: "Ducter 的正式发布日期我们定在哪天？", trap: true, evidence: [] },
  { id: "x3", type: "abstention", q: "上海出差住哪个酒店，我跟你说过吗？", trap: true, evidence: [] },

  // 11. Global gist
  { id: "g1", type: "gist", q: "这一周我们主要在忙什么？", atLeast: { n: 3, of: [/foo|测试/i, /HawDB|compaction/i, /桌面|SwiftUI|Tauri/i, /推送|APNs/i, /搜索|FTS|digest|记忆|memory/i] }, evidence: [] },
];
