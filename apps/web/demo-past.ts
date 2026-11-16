// D285: ~40 earlier tasks for 做过的事 / Past tasks, across projects, agents and two months, like
// the author's (hawdb, mem, ducter) plus a consumer's errands. demo.ts runs it with DEMO_PAST=1.
import type { Core } from "@ducter/core";
import type { Bodies, Place } from "@ducter/protocol";

type Seed = {
  id: string;
  zh: string;
  en: string;
  project?: "hawdb" | "mem" | "ducter";
  harness?: "claude-code" | "codex" | "pi";
  days: number;
  out?: [string, string];
  said?: [string, string];
  files?: string[];
  branch?: string;
  end?: "failed" | "dropped";
  merged?: boolean;
  diff?: [number, number, number];
  mark?: { name?: [string, string]; starred?: boolean; tags?: string[]; glyph?: string; tint?: string };
};

const SEEDS: Seed[] = [
  { id: "p_refactor", zh: "重构 compaction 调度器", en: "Refactor the compaction scheduler", project: "hawdb", harness: "codex", days: 6, out: ["把 level picker 拆进 picker.go，调度器只管排队；测试全过。", "Moved the level picker into picker.go; the scheduler only queues now. Tests pass."], said: ["picker 单独一个文件，别动 API", "Keep the picker in its own file and don't touch the API"], files: ["crates/compaction/src/scheduler.rs", "crates/compaction/src/picker.rs"], branch: "ducter/compaction-scheduler", diff: [4, 212, 148], mark: { starred: true, tags: ["compaction"], glyph: "build", tint: "sand" } },
  { id: "p_flaky", zh: "TestRaftSnapshot 为什么偶尔失败", en: "Why TestRaftSnapshot fails sometimes", project: "hawdb", days: 12, out: ["找到了偶发失败的原因：快照计时器和 leader 退位抢跑。加了一道 fence，连跑 200 遍全过。", "Found the flaky test's cause: the snapshot timer races the leader step-down. Added a fence; 200 runs pass."], files: ["crates/raft/tests/snapshot.rs", "crates/raft/src/snapshot.rs"], branch: "ducter/raft-snapshot-fence", merged: true, diff: [2, 31, 6], mark: { name: ["Raft 快照的坑", "The Raft snapshot race"], starred: true, tags: ["raft", "flaky"], glyph: "fix", tint: "sage" } },
  { id: "p_review_mem", zh: "review mem 的 PR 482", en: "Review mem PR 482", project: "mem", harness: "claude-code", days: 3, out: ["看完了：导入器把 vault 读了两遍；这个仓库用 bun workspaces，测试有自己的 runner。", "Reviewed: the importer reads the vault twice; the repo uses bun workspaces and its own test runner."], mark: { tags: ["review"], glyph: "review", tint: "mist" } },
  { id: "p_compaction_doc", zh: "写 compaction 的设计说明", en: "Write the compaction design note", project: "hawdb", days: 33, out: ["写好了 docs/compaction.md：三层、触发条件、写放大的估算。", "Drafted docs/compaction.md: the three levels, the triggers, a write-amplification estimate."], files: ["docs/compaction.md"], branch: "ducter/compaction-doc", merged: true, diff: [1, 140, 0] },
  { id: "p_bench", zh: "压测 compaction 吞吐", en: "Benchmark compaction throughput", project: "hawdb", harness: "pi", days: 41, out: ["m4 上 3.1 GB/s；瓶颈不在 picker，在 fsync。", "3.1 GB/s on the M4; the bottleneck is fsync, not the picker."], end: "failed", mark: { glyph: "data", tint: "stone" } },
  { id: "p_kyoto", zh: "订 12 月 6 号京都的酒店", en: "Book a hotel in Kyoto for Dec 6", days: 2, out: ["订好了：京都站旁的 Hotel Granvia，两晚，12 月 3 日前可免费取消。", "Booked Hotel Granvia by Kyoto Station, two nights, free cancellation until Dec 3."], mark: { starred: true, tags: ["旅行"], glyph: "errand", tint: "clay" } },
  { id: "p_dentist", zh: "给牙医打电话改约", en: "Call the dentist to move the appointment", days: 9, said: ["改到下周四下午", "Move it to next Thursday afternoon"], out: ["改好了，11 月 20 日 15:00。", "Moved to Nov 20, 15:00."], mark: { glyph: "talk", tint: "lilac" } },
  { id: "p_release60", zh: "发布 0.0.60", en: "Release 0.0.60", project: "ducter", days: 1, out: ["打了 v0.0.60 的 tag，发布说明也发了。", "Tagged v0.0.60 and published the notes."], mark: { glyph: "ship", tint: "sage" } },
  { id: "p_release58", zh: "发布 0.0.58", en: "Release 0.0.58", project: "ducter", days: 8, out: ["v0.0.58 发布了；iOS 构建晚了 20 分钟。", "v0.0.58 is out; the iOS build came 20 minutes late."] },
  { id: "p_rust_log", zh: "试试用 Rust 重写 Log", en: "Try a Rust rewrite of the Log", project: "ducter", harness: "codex", days: 20, end: "dropped" },
  { id: "p_wal", zh: "WAL 的 group commit", en: "Group commit for the WAL", project: "hawdb", harness: "codex", days: 15, out: ["group commit 做完了，p99 写延迟从 4.2ms 降到 1.1ms。", "Group commit is in; p99 write latency went from 4.2 ms to 1.1 ms."], files: ["crates/wal/src/commit.rs", "crates/wal/src/batch.rs"], branch: "ducter/wal-group-commit", diff: [6, 388, 92] },
  { id: "p_mem_search", zh: "mem 搜索的中文分词", en: "Chinese tokenizing in mem search", project: "mem", days: 18, out: ["换成 bigram 加原词双索引，中文召回从 61% 到 88%。", "Bigram plus whole-word indexes; Chinese recall went from 61% to 88%."], files: ["packages/search/src/tokenize.ts"], branch: "ducter/zh-bigrams", merged: true, diff: [3, 96, 40] },
  { id: "p_mem_sync", zh: "查 mem 同步卡住", en: "Look into mem sync getting stuck", project: "mem", harness: "claude-code", days: 24, out: ["卡在 token 过期后没有重试；加了刷新再试一次。", "It stalled when the token expired and never retried; it now refreshes and tries again."], files: ["packages/sync/src/client.ts"], branch: "ducter/sync-retry", diff: [2, 44, 9] },
  { id: "p_onhand_strip", zh: "把 On hand 的一览条做到网页", en: "Port On hand's strip to the web", project: "ducter", days: 4, out: ["网页端的四个计数做好了，也能当筛选用。", "The web's four counts are in, and they filter."], files: ["apps/web/src/onhand.tsx", "apps/web/static/app.css"], branch: "ducter/onhand-strip", merged: true, diff: [2, 120, 31] },
  { id: "p_ios_push", zh: "iPhone 推送收不到", en: "iPhone pushes don't arrive", project: "ducter", harness: "claude-code", days: 27, out: ["APNs 用的是 sandbox 证书；换成正式的，推送到了。", "APNs used the sandbox certificate; with the production one, pushes arrive."], mark: { tags: ["ios"] } },
  { id: "p_fold", zh: "折叠屏上的分栏", en: "Split panes on the foldable", project: "ducter", harness: "pi", days: 35, out: ["按折痕分成左右两栏，平放时上下。", "Panes split at the fold, left and right, or top and bottom when flat."], branch: "ducter/fold-split", merged: true, diff: [3, 74, 12] },
  { id: "p_tax", zh: "整理今年的报销单", en: "Sort this year's expense receipts", days: 14, out: ["整理好了 23 张，3 张缺发票，表格在 Downloads。", "23 receipts sorted, 3 missing invoices; the sheet is in Downloads."], mark: { glyph: "data", tint: "sand" } },
  { id: "p_gift", zh: "给妈妈挑生日礼物", en: "Pick a birthday present for Mom", days: 22, out: ["挑了三样：按摩仪、一套茶具、一本相册；都能下周二前送到。", "Three picks: a massager, a tea set, a photo album; all arrive by next Tuesday."] },
  { id: "p_flight", zh: "查 12 月去东京的机票", en: "Find flights to Tokyo in December", days: 5, out: ["12 月 5 日早班最便宜，往返 2380 元。", "The Dec 5 morning flight is cheapest, 2,380 yuan return."], mark: { tags: ["旅行"] } },
  { id: "p_newsletter", zh: "写 Nowledge 月报", en: "Write the Nowledge monthly update", days: 30, out: ["初稿写好了：三件新功能、两个数字、一段下月计划。", "First draft done: three features, two numbers, one paragraph on next month."], mark: { glyph: "write", tint: "lilac" } },
  { id: "p_hawdb_ci", zh: "hawdb 的 CI 太慢", en: "hawdb's CI is too slow", project: "hawdb", harness: "codex", days: 10, out: ["加了 sccache 和分片，CI 从 31 分钟到 12 分钟。", "sccache and sharding: CI went from 31 to 12 minutes."], files: [".github/workflows/ci.yml"], branch: "ducter/ci-sccache", merged: true, diff: [1, 38, 7] },
  { id: "p_hawdb_ttl", zh: "给 hawdb 加 TTL", en: "Add TTL to hawdb", project: "hawdb", days: 47, out: ["TTL 按 compaction 时丢弃过期键，读路径也过滤了。", "Expired keys drop at compaction and the read path filters them too."], files: ["crates/compaction/src/ttl.rs", "crates/engine/src/read.rs"], branch: "ducter/ttl", merged: true, diff: [5, 260, 33] },
  { id: "p_mem_import", zh: "mem 导入 Obsidian vault", en: "Import an Obsidian vault into mem", project: "mem", harness: "claude-code", days: 39, out: ["能导入了，双链变成关系；1 万条笔记 40 秒。", "Imports work, wikilinks become relations; 10k notes in 40 s."], branch: "ducter/obsidian-import", diff: [7, 512, 20] },
  { id: "p_ducter_eval", zh: "跑一遍伙伴的评测", en: "Run the partner eval", project: "ducter", harness: "claude-code", days: 7, out: ["haiku 上 46/48 过；失败的两条都是先报价再回答。", "46/48 on haiku; both failures offered before answering."] },
  { id: "p_ducter_i18n", zh: "中文文案过一遍", en: "Go through the Chinese copy", project: "ducter", days: 13, out: ["改了 37 处：去掉「呀」，按钮都是动词短语。", "37 fixes: no cute endings, every button a verb phrase."], files: ["apps/web/src/i18n.ts"], branch: "ducter/zh-copy", merged: true, diff: [4, 61, 61] },
  { id: "p_car", zh: "约 4S 店保养", en: "Book the car service", days: 16, out: ["约好了周六上午 10 点，大概两小时。", "Booked for Saturday 10 am, about two hours."], mark: { glyph: "errand", tint: "stone" } },
  { id: "p_hawdb_bloom", zh: "bloom filter 误判率太高", en: "Bloom filter false positives are too high", project: "hawdb", harness: "pi", days: 26, out: ["每键位数从 8 调到 10，误判率 2.1% 到 0.8%。", "10 bits per key instead of 8: false positives from 2.1% to 0.8%."], files: ["crates/sst/src/bloom.rs"], branch: "ducter/bloom-bits", diff: [1, 12, 4] },
  { id: "p_mem_bridge", zh: "试 Nowledge Bridge 连本地 vault", en: "Try Nowledge Bridge with a local vault", project: "mem", days: 11, end: "failed", out: ["本地 vault 的 bridge 没起来：端口被占用。", "The local vault's bridge didn't start: the port was taken."] },
  { id: "p_ducter_tunnel", zh: "Tailscale 上的远程打开", en: "Remote access over Tailscale", project: "ducter", harness: "codex", days: 19, out: ["tailscale serve 起来了；要先开 MagicDNS 和 HTTPS 证书。", "tailscale serve works; MagicDNS and HTTPS certificates must be on first."], branch: "ducter/tailscale", merged: true, diff: [3, 88, 5] },
  { id: "p_hawdb_mvcc", zh: "MVCC 的快照读", en: "Snapshot reads for MVCC", project: "hawdb", harness: "codex", days: 52, out: ["快照读做完了，长事务不会挡住 compaction。", "Snapshot reads are in; long transactions no longer hold compaction back."], files: ["crates/engine/src/mvcc.rs"], branch: "ducter/mvcc-snapshot", merged: true, diff: [6, 430, 120] },
  { id: "p_reading", zh: "整理想读的论文", en: "Collect the papers I want to read", days: 28, out: ["列了 12 篇，LSM 和学习型索引各一半，PDF 在 Papers 文件夹。", "12 papers, half LSM and half learned indexes; PDFs are in Papers."], mark: { glyph: "idea", tint: "mist" } },
  { id: "p_ducter_launch", zh: "App 启动太慢", en: "The app is slow to start", project: "ducter", days: 21, out: ["冷启动从 2.4 秒到 0.9 秒：字体晚加载，ioreg 只跑一次。", "Cold start from 2.4 s to 0.9 s: fonts load late, ioreg runs once."], files: ["apps/desktop/main.go"], branch: "ducter/fast-launch", merged: true, diff: [4, 70, 41] },
  { id: "p_mem_digest", zh: "mem 每日摘要太长", en: "mem's daily digest is too long", project: "mem", harness: "claude-code", days: 44, out: ["摘要限制在 5 条，按重要度排。", "The digest is capped at 5 items, by importance."] },
  { id: "p_plumber", zh: "找人修厨房的水龙头", en: "Get the kitchen tap fixed", days: 36, out: ["约了周三下午的师傅，报价 180 元。", "A plumber is booked for Wednesday afternoon, quoted 180 yuan."] },
  { id: "p_hawdb_crash", zh: "hawdb 重启后丢数据", en: "hawdb loses data after a restart", project: "hawdb", days: 3, out: ["WAL 截断时少了一次 fsync；补上了，崩溃测试 1000 次不丢。", "WAL truncation skipped an fsync; fixed, and 1,000 crash runs lose nothing."], files: ["crates/wal/src/truncate.rs", "crates/wal/tests/crash.rs"], branch: "ducter/wal-fsync", diff: [2, 27, 3], mark: { starred: true, tags: ["wal"], glyph: "fix", tint: "clay" } },
  { id: "p_ducter_find", zh: "做过的事的搜索", en: "Search for past tasks", project: "ducter", days: 0, out: ["搜索、标记和接着做都通了。", "Search, marks and continue all work."], branch: "ducter/past-tasks", diff: [9, 1400, 30] },
  { id: "p_podcast", zh: "把访谈录音转成文字", en: "Transcribe the interview recording", days: 17, out: ["转好了，58 分钟，标了说话人，存在 Notes。", "Done: 58 minutes, speakers labelled, saved in Notes."], mark: { glyph: "write", tint: "sage" } },
  { id: "p_hawdb_metrics", zh: "给 hawdb 加 Prometheus 指标", en: "Add Prometheus metrics to hawdb", project: "hawdb", harness: "pi", days: 58, out: ["加了 14 个指标，Grafana 面板也导出了。", "14 metrics and an exported Grafana dashboard."], branch: "ducter/metrics", merged: true, diff: [5, 220, 8] },
];

/** Logs the seeds as finished tasks in the past, with their marks; setSkew moves the clock back while it does. */
export async function seedPast(core: Core, zh: boolean, setSkew: (ms: number) => void) {
  const log = core.log;
  const DAY = 24 * 3600_000;
  const sorted = [...SEEDS].sort((a, b) => b.days - a.days);
  for (const s of sorted) {
    const at = s.days * DAY + (s.days ? 5 * 3600_000 : 2 * 3600_000);
    setSkew(-at);
    const place: Place = s.project ? { kind: "repo", device: "MacBook", repoPath: `~/dev/${s.project}`, ...(s.branch ? { branch: s.branch } : {}), baseBranch: "main" } : { kind: "none" };
    const title = zh ? s.zh : s.en;
    const st = `task:${s.id}`;
    log.append({ stream: st, origin: "partner", kind: "task_open", body: { taskId: s.id, title, project: s.project ?? "", place, harness: s.harness ?? "claude-code", model: "opus", brief: title } });
    if (s.said) log.append({ stream: st, origin: "user", kind: "task_event", body: { taskId: s.id, role: "user", from: "user", text: zh ? s.said[0] : s.said[1] } });
    for (const f of s.files ?? []) log.append({ stream: st, origin: "task", kind: "task_event", body: { taskId: s.id, role: "tool", tool: { name: "Edit", input: { file_path: f }, ok: true } } });
    setSkew(-at + 40 * 60_000);
    const branch = s.diff ? { commits: 1, uncommitted: false, files: s.diff[0], adds: s.diff[1], dels: s.diff[2] } : undefined;
    if (s.out) log.append({ stream: st, origin: "task", kind: "report", body: { taskId: s.id, state: s.end === "failed" ? "failed" : "done", summary: zh ? s.out[0] : s.out[1], questions: [], evidence: [], ...(branch ? { branch } : {}) } as Bodies["report"] });
    if (s.merged) log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${s.id}_merge`, taskId: s.id, state: "done", text: "the user merged this task's branch", act: "merge", ref: "a1c9e07" } });
    await Bun.sleep(5);
    core.tasks.setState(s.id, s.end ?? "done", "archived");
    await Bun.sleep(5);
  }
  setSkew(0);
  // The person's marks, as if made over the weeks.
  const ws = new WebSocket(core.url);
  await new Promise<void>((res) => (ws.onopen = () => res()));
  ws.send(JSON.stringify({ t: "hello", client: "cli" }));
  await Bun.sleep(100);
  for (const s of SEEDS) {
    if (!s.mark) continue;
    const m = s.mark;
    ws.send(JSON.stringify({ t: "past_mark", taskId: s.id, patch: { ...(m.name ? { name: zh ? m.name[0] : m.name[1] } : {}), ...(m.starred ? { starred: true } : {}), ...(m.tags ? { tags: m.tags } : {}), ...(m.glyph ? { glyph: m.glyph } : {}), ...(m.tint ? { tint: m.tint } : {}) } }));
  }
  await Bun.sleep(200);
  ws.close();
}
