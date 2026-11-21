// A demo core for D391 (every task fully open, design/sessions.md): a heavy developer's six weeks.
// About 45 tasks across four repositories (hawdb, nowledge-mem, ducter, test-infra) and a few
// errands, on three computers (the home, and the workers haswell and hel), with three agents
// (Claude Code, Codex, pi); several with three to six steps, commits, branches, merged and draft PRs,
// failures, cancellations, two that need the person, a few at work, one group (D360) and two redone
// from a step (task_open from + fromStep). Every value is pretend: fake repos, fake PR numbers.
//   DUCTER_PORT=7991 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-sessions.ts
import { startCore, stubRunner, realClock } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
let skew = 0;
const clock = { ...realClock, now: () => Date.now() + skew };
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  clock,
  update: { homeName: "MacBook Pro", autoEveryMs: 0 } as never,
});
// The stub runner, but a redo (or a new task) opens for real in the Log, as the runner would.
let made = 0;
core.setRunner({
  ...stubRunner(core),
  openTask: async (i: { title: string; brief: string; place?: Place; project?: string; harness?: string; model?: string; from?: string; fromStep?: number; fromCommit?: string }) => {
    const taskId = `t_new${++made}`;
    core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: i.title, project: i.project ?? "", place: i.place ?? { kind: "none" }, harness: i.harness ?? "claude-code", ...(i.model ? { model: i.model } : {}), brief: i.brief, ...(i.from ? { from: i.from } : {}), ...(i.fromStep ? { fromStep: i.fromStep } : {}), ...(i.fromCommit ? { fromCommit: i.fromCommit } : {}) } });
    core.tasks.setState(taskId, "working", "hot");
    return core.tasks.get(taskId)!;
  },
} as never);
core.setPartner({ onTrigger() {} });

// The two computers doing tasks for the home (away now: their names are what matters here).
const worker = (name: string) => (core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name, platform: "linux-x64" }) as { device: { id: string } }).device.id;
const HASWELL = worker("haswell");
const HEL = worker("hel");
const DEV = { home: "local", haswell: HASWELL, hel: HEL } as const;

type Repo = "hawdb" | "nowledge-mem" | "ducter" | "test-infra";
type Step = { you?: true; zh: string; en: string; came?: [string, string]; commit?: string };
type Seed = {
  id: string;
  zh: string;
  en: string;
  repo?: Repo;
  on?: keyof typeof DEV;
  h?: "claude-code" | "codex" | "pi";
  model?: string;
  /** Days ago it was last worked on. */
  days: number;
  /** After the brief (step 1): the later messages. */
  steps?: Step[];
  /** The brief's outcome when there are no later steps. */
  came?: [string, string];
  out?: [string, string];
  end?: "failed" | "dropped" | "working" | "needs_you" | "blocked";
  ask?: [string, string];
  branch?: string;
  diff?: [number, number, number];
  pr?: "merge" | "draft";
  files?: string[];
  commit?: string;
  from?: { id: string; step: number; commit?: string };
  starred?: true;
  tags?: string[];
  /** D456: how many reads, searches and commands it ran before its first words (a long transcript). */
  noise?: number;
};

const S: Seed[] = [
  // ---- hawdb: the compaction PR from last week, and its story ----
  {
    id: "s_compact_pr", zh: "compaction 调度器改成按层限流", en: "Rate-limit compaction per level", repo: "hawdb", h: "claude-code", model: "opus", days: 6, branch: "ducter/compaction-throttle", diff: [7, 412, 96], pr: "draft", starred: true, tags: ["compaction"],
    files: ["crates/compaction/src/scheduler.rs", "crates/compaction/src/throttle.rs", "crates/compaction/tests/throttle.rs"],
    came: ["先读了调度器：L0 积压时所有层一起抢 IO。打算每层一个令牌桶。", "Read the scheduler: when L0 backs up, every level fights for IO. Plan: one token bucket per level."], commit: "4e1a9c2",
    steps: [
      { you: true, zh: "令牌桶的容量按层的大小算，别写死", en: "Size each bucket from the level's size, don't hard-code it", came: ["按层大小的 1/64 算容量，测试补了三个。", "Buckets are 1/64 of the level's size; three tests added."], commit: "9b7d310" },
      { zh: "跑一下 bench_compaction，对比改之前", en: "Run bench_compaction against the old numbers", came: ["写放大从 11.2 降到 7.9，p99 写延迟持平。", "Write amplification 11.2 → 7.9; p99 write latency unchanged."], commit: "c03f5ae" },
      { you: true, zh: "开个草稿 PR，标题写清楚是按层限流", en: "Open a draft PR, title it as per-level throttling", came: ["草稿 PR #4127 开好了，CI 在跑。", "Draft PR #4127 is open; CI is running."] },
    ],
    out: ["草稿 PR #4127：compaction 按层限流。写放大 11.2 → 7.9，测试全过，等你 review。", "Draft PR #4127: per-level compaction throttling. Write amplification 11.2 → 7.9, tests pass, waiting for your review."],
  },
  {
    id: "s_compact_bug", zh: "L0 compaction 卡住不动", en: "L0 compaction gets stuck", repo: "hawdb", on: "haswell", h: "codex", model: "gpt-5.5", days: 9, branch: "ducter/l0-stall", diff: [2, 38, 11], pr: "merge",
    came: ["卡在 picker 把正在写的 SST 也挑进来了，锁住了。", "The picker chose an SST still being written and deadlocked on it."], commit: "71ce0d4",
    steps: [{ you: true, zh: "加个回归测试再修", en: "Add a regression test before the fix", came: ["加了 stall_on_open_sst 测试，先红后绿。", "Added stall_on_open_sst: red first, green after."], commit: "e8a2f17" }],
    out: ["修好了：picker 跳过还在写的 SST；回归测试先红后绿，已合并。", "Fixed: the picker skips SSTs still being written; the regression test went red then green. Merged."],
  },
  {
    id: "s_rust_build", zh: "haswell 上 Rust 构建太慢", en: "The Rust build is slow on haswell", repo: "hawdb", on: "haswell", h: "codex", model: "gpt-5.5", days: 33, branch: "ducter/build-cache", diff: [3, 61, 14], pr: "merge", tags: ["build"],
    files: [".cargo/config.toml", "Cargo.toml", "scripts/ci-build.sh"],
    came: ["全量构建 14 分 20 秒，大半在 rocksdb-sys 和 LTO。", "A clean build takes 14 m 20 s, mostly rocksdb-sys and LTO."], commit: "5a0b6e9",
    steps: [
      { you: true, zh: "试试 mold 和 sccache", en: "Try mold and sccache", came: ["mold 链接从 48 秒到 6 秒；sccache 命中率 92%。", "mold cut linking from 48 s to 6 s; sccache hits 92%."], commit: "d41f2c8" },
      { you: true, zh: "dev profile 把 LTO 关掉，release 保留", en: "Turn LTO off for dev, keep it for release", came: ["dev 构建 3 分 05 秒。", "Dev builds take 3 m 05 s."], commit: "aa93e01" },
    ],
    out: ["haswell 上全量构建 14 分 20 秒 → 3 分 05 秒：mold、sccache、dev 关 LTO。已合并。", "Clean build on haswell 14 m 20 s → 3 m 05 s: mold, sccache, no LTO for dev. Merged."],
  },
  {
    id: "s_wal", zh: "WAL 的 group commit", en: "Group commit for the WAL", repo: "hawdb", h: "codex", model: "gpt-5.5", days: 15, branch: "ducter/wal-group-commit", diff: [6, 388, 92], pr: "merge",
    came: ["攒批写，一次 fsync；p99 写延迟 4.2ms → 1.1ms。", "Batched writes with one fsync; p99 write latency 4.2 ms → 1.1 ms."], commit: "0f6e2b1",
    out: ["group commit 做完了，p99 写延迟从 4.2ms 降到 1.1ms，已合并。", "Group commit is in; p99 write latency 4.2 ms → 1.1 ms. Merged."],
  },
  {
    id: "s_bloom", zh: "bloom filter 误判率太高", en: "Bloom filter false positives are too high", repo: "hawdb", h: "pi", model: "sonnet", days: 26, branch: "ducter/bloom-bits", diff: [1, 12, 4],
    out: ["每键位数 8 → 10，误判率 2.1% → 0.8%。分支还没合。", "10 bits per key instead of 8: false positives 2.1% → 0.8%. Not merged yet."], commit: "b2290fa",
  },
  {
    id: "s_mvcc", zh: "MVCC 的快照读", en: "Snapshot reads for MVCC", repo: "hawdb", on: "haswell", h: "claude-code", model: "opus", days: 40, branch: "ducter/mvcc-snapshot", diff: [6, 430, 120], pr: "merge",
    out: ["快照读做完了，长事务不会挡住 compaction。", "Snapshot reads are in; long transactions no longer hold compaction back."], commit: "e7d0c33",
  },
  {
    id: "s_ttl", zh: "给 hawdb 加 TTL", en: "Add TTL to hawdb", repo: "hawdb", h: "claude-code", model: "opus", days: 38, branch: "ducter/ttl", diff: [5, 260, 33], pr: "merge",
    out: ["TTL 在 compaction 时丢弃过期键，读路径也过滤了。", "Expired keys drop at compaction and the read path filters them too."], commit: "19ab4c0",
  },
  {
    id: "s_crash", zh: "hawdb 重启后丢数据", en: "hawdb loses data after a restart", repo: "hawdb", on: "haswell", h: "codex", model: "gpt-5.5", days: 3, branch: "ducter/wal-fsync", diff: [2, 27, 3], starred: true, tags: ["wal"],
    came: ["WAL 截断时少了一次 fsync。", "WAL truncation skipped an fsync."], commit: "3d8e5f2",
    steps: [{ you: true, zh: "跑 1000 次崩溃测试确认", en: "Confirm with 1,000 crash runs", came: ["1000 次崩溃测试一条没丢。", "1,000 crash runs, nothing lost."] }],
    out: ["补上了截断时的 fsync，崩溃测试 1000 次不丢。等你合。", "Added the fsync at truncation; 1,000 crash runs lose nothing. Ready to merge."],
  },
  {
    id: "s_range", zh: "range scan 基准", en: "Range scan benchmark", repo: "hawdb", on: "haswell", h: "pi", model: "sonnet", days: 0.1, end: "working", branch: "ducter/range-bench", diff: [2, 54, 0],
    came: ["在写 1M 键的数据集生成器。", "Writing the generator for a 1M-key data set."],
  },
  {
    id: "s_hawdb_ci", zh: "hawdb 的 CI 太慢", en: "hawdb's CI is too slow", repo: "hawdb", h: "codex", model: "gpt-5.5", days: 10, branch: "ducter/ci-sccache", diff: [1, 38, 7], pr: "merge",
    out: ["加了 sccache 和分片，CI 从 31 分钟到 12 分钟。", "sccache and sharding: CI went from 31 to 12 minutes."], commit: "8c11d9e",
  },
  {
    id: "s_bench_fail", zh: "压测 compaction 吞吐", en: "Benchmark compaction throughput", repo: "hawdb", on: "haswell", h: "pi", model: "sonnet", days: 21, end: "failed",
    came: ["跑到一半 haswell 的磁盘满了。", "haswell's disk filled up halfway through."],
    out: ["没跑完：haswell 的 /data 满了（剩 2%）。清出空间再试。", "Didn't finish: haswell's /data filled up (2% left). Clear space and try again."],
  },
  // ---- nowledge-mem ----
  {
    id: "s_zh_search", zh: "mem 搜索的中文分词", en: "Chinese tokenizing in mem search", repo: "nowledge-mem", h: "claude-code", model: "opus", days: 18, branch: "ducter/zh-bigrams", diff: [3, 96, 40], pr: "merge",
    files: ["packages/search/src/tokenize.ts", "packages/search/test/tokenize.test.ts"],
    came: ["现在按空格切，中文整句一个词。", "It splits on spaces, so a Chinese sentence is one word."], commit: "6f2a0d1",
    steps: [
      { you: true, zh: "试 bigram 加原词双索引", en: "Try bigrams plus whole words, two indexes", came: ["中文召回 61% → 88%。", "Chinese recall 61% → 88%."], commit: "a9c4e70" },
      { zh: "索引大小涨了多少", en: "How much bigger is the index", came: ["涨了 23%。", "23% bigger."] },
    ],
    out: ["bigram 加原词双索引，中文召回 61% → 88%，索引大 23%。已合并。", "Bigrams plus whole words: Chinese recall 61% → 88%, index 23% bigger. Merged."],
  },
  {
    id: "s_sync", zh: "查 mem 同步卡住", en: "Look into mem sync getting stuck", repo: "nowledge-mem", on: "hel", h: "claude-code", model: "sonnet", days: 24, branch: "ducter/sync-retry", diff: [2, 44, 9],
    out: ["卡在 token 过期后没有重试；加了刷新再试一次。", "It stalled when the token expired and never retried; it now refreshes and tries again."], commit: "c7e81b4",
  },
  {
    id: "s_import", zh: "mem 导入 Obsidian vault", en: "Import an Obsidian vault into mem", repo: "nowledge-mem", h: "codex", model: "gpt-5.5", days: 29, branch: "ducter/obsidian-import", diff: [7, 512, 20],
    came: ["双链变成关系，1 万条笔记 40 秒。", "Wikilinks become relations; 10k notes in 40 s."], commit: "f04d6a3",
    steps: [
      { you: true, zh: "附件也导进来", en: "Bring the attachments in too", came: ["图片和 PDF 都进来了。", "Pictures and PDFs come in too."], commit: "2b8f915" },
      { you: true, zh: "frontmatter 的 tags 变成标签", en: "Turn frontmatter tags into labels", came: ["标签对上了，嵌套标签拆成两级。", "Labels match; nested tags become two levels."], commit: "7e30cd8" },
      { you: true, zh: "大 vault 内存爆了，改成流式", en: "A big vault blows the memory, stream it", came: ["改了一半，解析器还是整文件读。", "Half done; the parser still reads whole files."] },
    ],
    end: "failed",
    out: ["流式没改完：markdown 解析器只能整文件读，5 万条的 vault 占到 6 GB。", "Streaming isn't done: the Markdown parser only reads whole files; a 50k-note vault takes 6 GB."],
  },
  {
    id: "s_import_redo", zh: "mem 导入 Obsidian vault，改成流式", en: "Import an Obsidian vault into mem, streaming", repo: "nowledge-mem", h: "codex", model: "gpt-5.5", days: 27, branch: "ducter/obsidian-stream", diff: [4, 188, 61], from: { id: "s_import", step: 4, commit: "7e30cd8" },
    came: ["换成逐行的解析器，5 万条的 vault 占 380 MB。", "A line-by-line parser: a 50k-note vault takes 380 MB."], commit: "41aa7c2",
    out: ["逐行解析，5 万条 vault 内存 6 GB → 380 MB，测试全过。", "Line-by-line parsing, a 50k-note vault 6 GB → 380 MB; tests pass."],
  },
  {
    id: "s_digest", zh: "mem 每日摘要太长", en: "mem's daily digest is too long", repo: "nowledge-mem", h: "claude-code", model: "sonnet", days: 44, out: ["摘要限制在 5 条，按重要度排。", "The digest is capped at 5 items, by importance."],
  },
  {
    id: "s_review482", zh: "review mem 的 PR #482", en: "Review mem PR #482", repo: "nowledge-mem", h: "claude-code", model: "opus", days: 2, tags: ["review"],
    out: ["看完了：导入器把 vault 读了两遍；测试用自己的 runner。留了 4 条评论。", "Reviewed: the importer reads the vault twice; tests use their own runner. Left 4 comments."],
  },
  {
    id: "s_mem_bridge", zh: "试 Nowledge Bridge 连本地 vault", en: "Try Nowledge Bridge with a local vault", repo: "nowledge-mem", on: "hel", h: "pi", model: "sonnet", days: 11, end: "failed",
    out: ["bridge 没起来：hel 上 7811 端口被占用。", "The bridge didn't start: port 7811 is taken on hel."],
  },
  {
    id: "s_mem_ask", zh: "mem 的向量索引换 HNSW", en: "Switch mem's vector index to HNSW", repo: "nowledge-mem", on: "hel", h: "codex", model: "gpt-5.5", days: 0.2, end: "needs_you", branch: "ducter/hnsw", diff: [5, 240, 70],
    came: ["HNSW 接上了，召回 0.97，建索引慢 3 倍。", "HNSW is in: recall 0.97, but building is 3× slower."],
    ask: ["建索引慢 3 倍，换 ef_construction=100 能快一倍但召回降到 0.95。用哪个？", "Building is 3× slower; ef_construction=100 halves that but recall drops to 0.95. Which one?"],
  },
  // ---- ducter ----
  {
    id: "s_past", zh: "做过的事的搜索", en: "Search for past tasks", repo: "ducter", h: "claude-code", model: "opus", days: 4, branch: "ducter/past-tasks", diff: [9, 1400, 30], pr: "merge",
    out: ["搜索、标记和接着做都通了，已合并。", "Search, marks and continue all work. Merged."], commit: "aa01b77",
  },
  {
    id: "s_onhand", zh: "把 On hand 的一览条做到网页", en: "Port On hand's strip to the web", repo: "ducter", h: "codex", model: "gpt-5.5", days: 5, branch: "ducter/onhand-strip", diff: [2, 120, 31], pr: "merge",
    out: ["网页端的四个计数做好了，也能当筛选用。", "The web's four counts are in, and they filter."], commit: "5c9d2e4",
  },
  {
    id: "s_ios_push", zh: "iPhone 推送收不到", en: "iPhone pushes don't arrive", repo: "ducter", h: "claude-code", model: "opus", days: 27, tags: ["ios"],
    out: ["APNs 用的是 sandbox 证书；换成正式的，推送到了。", "APNs used the sandbox certificate; with the production one, pushes arrive."],
  },
  {
    id: "s_eval", zh: "跑一遍伙伴的评测", en: "Run the partner eval", repo: "ducter", h: "claude-code", model: "haiku", days: 7,
    out: ["haiku 上 134/179；失败的多半是先报价再回答。", "134/179 on haiku; most failures offered before answering."],
  },
  {
    id: "s_launch", zh: "App 启动太慢", en: "The app is slow to start", repo: "ducter", h: "pi", model: "sonnet", days: 19, branch: "ducter/fast-launch", diff: [4, 70, 41], pr: "merge",
    came: ["冷启动 2.4 秒，字体和 ioreg 占了大半。", "Cold start 2.4 s, mostly fonts and ioreg."], commit: "0d7b5f1",
    steps: [
      { you: true, zh: "字体晚点加载试试", en: "Try loading the fonts later", came: ["1.4 秒。", "1.4 s."], commit: "3c2e8a6" },
      { you: true, zh: "ioreg 只跑一次", en: "Run ioreg only once", came: ["0.9 秒。", "0.9 s."], commit: "b81f04d" },
    ],
    out: ["冷启动 2.4 秒 → 0.9 秒：字体晚加载，ioreg 只跑一次。已合并。", "Cold start 2.4 s → 0.9 s: fonts load late, ioreg runs once. Merged."],
  },
  {
    id: "s_rust_log", zh: "试试用 Rust 重写 Log", en: "Try a Rust rewrite of the Log", repo: "ducter", h: "codex", model: "gpt-5.5", days: 20, end: "dropped",
    out: ["写到一半你说先不做了。", "Halfway through, you called it off."],
  },
  {
    id: "s_tunnel", zh: "Tailscale 上的远程打开", en: "Remote access over Tailscale", repo: "ducter", on: "hel", h: "codex", model: "gpt-5.5", days: 16, branch: "ducter/tailscale", diff: [3, 88, 5], pr: "merge",
    out: ["tailscale serve 起来了；要先开 MagicDNS 和 HTTPS 证书。", "tailscale serve works; MagicDNS and HTTPS certificates must be on first."], commit: "e45a1b9",
  },
  {
    id: "s_i18n", zh: "中文文案过一遍", en: "Go through the Chinese copy", repo: "ducter", h: "claude-code", model: "opus", days: 13, branch: "ducter/zh-copy", diff: [4, 61, 61], pr: "merge",
    out: ["改了 37 处：去掉「呀」，按钮都是动词短语。", "37 fixes: no cute endings, every button a verb phrase."], commit: "71f0e3a",
  },
  {
    id: "s_flaky_e2e", zh: "e2e 偶尔超时", en: "The e2e run times out sometimes", repo: "ducter", on: "hel", h: "claude-code", model: "sonnet", days: 8, branch: "ducter/e2e-timeout", diff: [2, 19, 6],
    came: ["超时都在等 worker 握手，hel 上偶尔 6 秒以上。", "Every timeout waits on the worker handshake; on hel it sometimes takes over 6 s."], commit: "9e2c47b",
    steps: [
      { you: true, zh: "握手超时加到 15 秒", en: "Raise the handshake timeout to 15 s", came: ["连跑 50 次没超时。", "50 runs in a row, no timeout."], commit: "f3b07d2" },
      { zh: "为什么 hel 上慢", en: "Why is it slow on hel", came: ["hel 的 DNS 先问 IPv6，等 5 秒才回落。", "hel asks DNS for IPv6 first and waits 5 s before falling back."] },
    ],
    out: ["握手超时加到 15 秒；根因是 hel 的 DNS 先问 IPv6，等 5 秒才回落。", "Handshake timeout raised to 15 s; the cause is hel asking DNS for IPv6 first and waiting 5 s."],
  },
  {
    id: "s_palette", zh: "⌘K 找什么都行", en: "⌘K find anything", repo: "ducter", h: "claude-code", model: "opus", days: 0.05, end: "working", branch: "ducter/sessions", diff: [11, 960, 40],
    came: ["网页端的面板接上了做过的事的搜索。", "The web panel now searches Past tasks."],
  },
  {
    id: "s_release", zh: "发布 0.0.88", en: "Release 0.0.88", repo: "ducter", h: "codex", model: "gpt-5.5", days: 1,
    out: ["打了 v0.0.88 的 tag，发布说明也发了。", "Tagged v0.0.88 and published the notes."],
  },
  {
    id: "s_android", zh: "Android 折叠屏上的分栏", en: "Split panes on the Android foldable", repo: "ducter", h: "pi", model: "sonnet", days: 35, branch: "ducter/fold-split", diff: [3, 74, 12], pr: "merge",
    out: ["按折痕分成左右两栏，平放时上下。", "Panes split at the fold, left and right, or top and bottom when flat."],
  },
  // ---- test-infra ----
  {
    id: "s_prow", zh: "Prow 上 flaky 测试自动重跑", en: "Retry flaky tests on Prow", repo: "test-infra", on: "hel", h: "codex", model: "gpt-5.5", days: 12, branch: "ducter/flaky-retry", diff: [3, 102, 18], pr: "draft",
    came: ["加了 flaky 标签，带标签的失败重跑一次。", "Added a flaky label; a labelled failure retries once."], commit: "6d40a1e",
    steps: [{ you: true, zh: "重跑结果写进 PR 评论", en: "Put the retry results in a PR comment", came: ["评论写好了，会附上两次的日志链接。", "The comment links both runs' logs."], commit: "c912fe0" }],
    out: ["草稿 PR #318：flaky 标签的测试失败重跑一次，结果写进 PR 评论。", "Draft PR #318: tests labelled flaky retry once; the results go in a PR comment."],
  },
  {
    id: "s_bazel", zh: "Bazel 远程缓存命中率低", en: "Low Bazel remote cache hits", repo: "test-infra", on: "haswell", h: "claude-code", model: "opus", days: 22,
    out: ["命中率低是因为 CI 镜像里的 gcc 版本每周变；固定版本后 31% → 84%。", "Hits were low because the CI image's gcc changed weekly; pinned, 31% → 84%."],
  },
  {
    id: "s_ci_redo", zh: "Prow 日志里的密钥打码", en: "Mask secrets in Prow logs", repo: "test-infra", h: "claude-code", model: "opus", days: 14, branch: "ducter/mask-logs", diff: [2, 66, 4],
    came: ["找到 3 处会把 token 打进日志。", "Found 3 places that print tokens into the logs."], commit: "a4f8d21",
    steps: [
      { you: true, zh: "用正则统一打码", en: "Mask them all with one regex", came: ["正则打码上了，单测过。", "Regex masking is in; unit tests pass."], commit: "b7c3e90" },
      { you: true, zh: "把 base64 编码的也打码", en: "Mask base64-encoded ones too", came: ["base64 的误伤了普通日志，测试红了。", "Base64 masking hit ordinary log lines; tests are red."] },
    ],
    end: "failed",
    out: ["base64 打码误伤太多：普通的哈希也被遮了，测试红了。", "Masking base64 hits too much: ordinary hashes get masked too; tests are red."],
  },
  {
    id: "s_ci_redo2", zh: "Prow 日志打码，只遮带前缀的", en: "Mask Prow logs, prefixed secrets only", repo: "test-infra", h: "codex", model: "gpt-5.5", days: 13, branch: "ducter/mask-logs-2", diff: [3, 81, 9], pr: "draft", from: { id: "s_ci_redo", step: 3, commit: "b7c3e90" },
    came: ["只遮已知前缀（ghp_、xoxb-）后面的 base64，普通哈希不动。", "Masks base64 only after known prefixes (ghp_, xoxb-); plain hashes stay."], commit: "e61d5a8",
    out: ["只遮已知前缀后的 base64，测试全过。草稿 PR #322。", "Only base64 after known prefixes is masked; tests pass. Draft PR #322."],
  },
  {
    id: "s_gha", zh: "把 nightly 从 Jenkins 搬到 GitHub Actions", en: "Move the nightly from Jenkins to GitHub Actions", repo: "test-infra", h: "pi", model: "sonnet", days: 41, branch: "ducter/nightly-gha", diff: [5, 210, 340], pr: "merge",
    out: ["nightly 搬到 Actions 了，矩阵三平台，Jenkins 那份删了。", "The nightly runs on Actions now, a three-platform matrix; the Jenkins job is gone."],
  },
  {
    id: "s_ti_ask", zh: "测试机的磁盘告警", en: "Disk alerts on the test machines", repo: "test-infra", on: "haswell", h: "claude-code", model: "sonnet", days: 0.3, end: "needs_you",
    came: ["haswell 的 /data 只剩 2%，是 3 个月没清的构建缓存。", "haswell's /data has 2% left: three months of build cache."],
    ask: ["删掉 30 天前的构建缓存（约 410 GB）？删了就找不回来。", "Delete build caches older than 30 days (about 410 GB)? They can't be brought back."],
  },
  // ---- the group (D360): three parts of one piece of work ----
  { id: "g_form", zh: "登录表单换成新的输入框组件", en: "Swap the sign-in form for the new input component", repo: "ducter", h: "claude-code", model: "opus", days: 0.15, branch: "ducter/signin-form", diff: [3, 90, 40], out: ["登录表单换成了新的输入框组件，键盘和读屏都能用。", "The sign-in form uses the new input component; keyboard and screen readers work."] },
  { id: "g_sms", zh: "登录页接上短信验证码", en: "Hook the SMS code into the sign-in page", repo: "ducter", h: "codex", model: "gpt-5.5", days: 0.05, end: "working", branch: "ducter/signin-sms", came: ["在接发送接口。", "Wiring the send endpoint."] },
  // ---- errands ----
  { id: "e_kyoto", zh: "订 12 月 6 号京都的酒店", en: "Book a hotel in Kyoto for Dec 6", days: 2, h: "claude-code", model: "sonnet", out: ["订好了：京都站旁的 Hotel Granvia，两晚，12 月 3 日前可免费取消。", "Booked Hotel Granvia by Kyoto Station, two nights, free cancellation until Dec 3."], starred: true, tags: ["旅行"] },
  { id: "e_flight", zh: "查 12 月去东京的机票", en: "Find flights to Tokyo in December", days: 5, h: "codex", model: "gpt-5.5", out: ["12 月 5 日早班最便宜，往返 2380 元。", "The Dec 5 morning flight is cheapest, 2,380 yuan return."], tags: ["旅行"] },
  { id: "e_dentist", zh: "给牙医打电话改约", en: "Call the dentist to move the appointment", days: 9, h: "claude-code", model: "sonnet", out: ["改好了，11 月 20 日 15:00。", "Moved to Nov 20, 15:00."] },
  { id: "e_receipts", zh: "整理今年的报销单", en: "Sort this year's expense receipts", days: 14, h: "codex", model: "gpt-5.5", out: ["整理好了 23 张，3 张缺发票，表格在 Downloads。", "23 receipts sorted, 3 missing invoices; the sheet is in Downloads."] },
  { id: "e_car", zh: "约 4S 店保养", en: "Book the car service", days: 16, h: "claude-code", model: "sonnet", end: "dropped", out: ["你说这周先不去了。", "You said not this week."] },
  { id: "e_papers", zh: "整理想读的论文", en: "Collect the papers I want to read", days: 28, h: "pi", model: "sonnet", out: ["列了 12 篇，LSM 和学习型索引各一半，PDF 在 Papers 文件夹。", "12 papers, half LSM and half learned indexes; PDFs are in Papers."] },
];

// D456: DEMO_MORE=1 walks a heavy month at volume: about 75 more tasks (120 in all) across the four
// repos and the three computers, and long transcripts (reads, searches, commands with their
// output) on a dozen, so ⌘K and the opened task are judged where they are used.
const MORE: [Repo | "", string, string, string?][] = [
  ["hawdb", "SST 文件的 checksum 校验", "Checksum SST files on read"],
  ["hawdb", "block cache 换成 LRU-K", "Swap the block cache for LRU-K", "ducter/lru-k"],
  ["hawdb", "写停顿的告警阈值", "Alert thresholds for write stalls"],
  ["hawdb", "manifest 太大，加快照", "The manifest is huge: snapshot it", "ducter/manifest-snap"],
  ["hawdb", "iterator 泄漏内存", "The iterator leaks memory", "ducter/iter-leak"],
  ["hawdb", "列族的独立配置", "Per-column-family options", "ducter/cf-options"],
  ["hawdb", "fuzz 一下 WAL 解析", "Fuzz the WAL reader", "ducter/wal-fuzz"],
  ["hawdb", "读放大的指标上 Grafana", "Read amplification on Grafana"],
  ["hawdb", "删大量 key 后空间不回收", "Space isn't reclaimed after mass deletes", "ducter/range-tombstone"],
  ["hawdb", "rocksdb-sys 升到 0.24", "Bump rocksdb-sys to 0.24", "ducter/rocksdb-024"],
  ["hawdb", "整理 hawdb 的 benchmark 报告", "Write up hawdb's benchmark report"],
  ["hawdb", "二级索引的设计草稿", "Draft the secondary-index design"],
  ["hawdb", "压缩算法换 zstd 字典", "zstd dictionaries for compression", "ducter/zstd-dict"],
  ["hawdb", "backup 增量备份", "Incremental backups", "ducter/incr-backup"],
  ["hawdb", "hawdb 的 Docker 镜像瘦身", "Slim down hawdb's Docker image", "ducter/slim-image"],
  ["hawdb", "看一下 issue #3912 能不能复现", "See if issue #3912 reproduces"],
  ["hawdb", "flush 和 compaction 抢 IO", "Flush and compaction fight over IO", "ducter/io-priority"],
  ["hawdb", "统计信息里加 key 大小分布", "Key-size histograms in the stats", "ducter/key-hist"],
  ["nowledge-mem", "mem 的 MCP server 超时", "mem's MCP server times out", "ducter/mcp-timeout"],
  ["nowledge-mem", "记忆去重", "Deduplicate memories", "ducter/dedupe"],
  ["nowledge-mem", "线程搜索按时间排序", "Sort thread search by time", "ducter/thread-sort"],
  ["nowledge-mem", "mem 的 CLI 加 --json", "--json for mem's CLI", "ducter/cli-json"],
  ["nowledge-mem", "embedding 模型换小的", "A smaller embedding model", "ducter/small-embed"],
  ["nowledge-mem", "图谱视图卡顿", "The graph view stutters", "ducter/graph-perf"],
  ["nowledge-mem", "导出成 Markdown", "Export to Markdown", "ducter/md-export"],
  ["nowledge-mem", "review mem 的 PR #497", "Review mem PR #497"],
  ["nowledge-mem", "mem 的 Windows 安装包", "mem's Windows installer", "ducter/win-installer"],
  ["nowledge-mem", "社区摘要的提示词", "The prompt for community summaries"],
  ["nowledge-mem", "SQLite 换 WAL 模式", "Put SQLite in WAL mode", "ducter/sqlite-wal"],
  ["nowledge-mem", "空间（space）的权限", "Permissions for spaces", "ducter/space-perms"],
  ["nowledge-mem", "记忆的时间线视图", "A timeline view of memories", "ducter/timeline"],
  ["nowledge-mem", "查 hel 上 mem 占内存", "Why mem on hel uses so much memory"],
  ["ducter", "任务页的标题栏", "The task page's header", "ducter/task-header"],
  ["ducter", "工作台的文件树加载慢", "The workbench file tree loads slowly", "ducter/tree-perf"],
  ["ducter", "对话里的图片预览", "Picture previews in the conversation", "ducter/pic-preview"],
  ["ducter", "Mac 菜单栏的计数", "The menu bar count on the Mac", "ducter/menubar-count"],
  ["ducter", "worker 断线重连", "Workers reconnect after a drop", "ducter/worker-reconnect"],
  ["ducter", "partner 评测加两个场景", "Two more scenarios for the partner eval"],
  ["ducter", "设置页的深色模式", "Dark mode for Settings", "ducter/settings-dark"],
  ["ducter", "Telegram 渠道的图片", "Pictures on the Telegram channel", "ducter/tg-pictures"],
  ["ducter", "iPhone 键盘挡住输入框", "The iPhone keyboard covers the field", "ducter/kb-inset"],
  ["ducter", "Log 压缩", "Compact the Log", "ducter/log-compact"],
  ["ducter", "Codex 的 resume 失败", "Codex resume fails", "ducter/codex-resume"],
  ["ducter", "pi 的模型列表", "pi's model list", "ducter/pi-models"],
  ["ducter", "检查链接的脚本太慢", "The link checker is slow"],
  ["ducter", "网页端首屏加载", "The web's first load", "ducter/first-load"],
  ["ducter", "Android 自更新", "Android self-update", "ducter/android-update"],
  ["ducter", "发布 0.1.6", "Release 0.1.6"],
  ["ducter", "发布 0.1.7", "Release 0.1.7"],
  ["ducter", "做过的事按电脑筛选", "Filter past tasks by computer", "ducter/past-computer"],
  ["ducter", "语音输入的标点", "Punctuation in voice input", "ducter/voice-punct"],
  ["ducter", "日历的冲突提醒", "Calendar clash reminders", "ducter/cal-clash"],
  ["test-infra", "Prow 的 job 配置去重", "Deduplicate Prow job configs", "ducter/prow-dedupe"],
  ["test-infra", "e2e 集群的节点池", "Node pools for the e2e cluster", "ducter/e2e-pools"],
  ["test-infra", "测试结果上 BigQuery", "Test results into BigQuery", "ducter/bq-results"],
  ["test-infra", "flaky 测试周报", "A weekly flaky-test report"],
  ["test-infra", "Bazel 升 8.1", "Bump Bazel to 8.1", "ducter/bazel-81"],
  ["test-infra", "CI 机器的磁盘清理", "Disk cleanup on CI machines", "ducter/ci-gc"],
  ["test-infra", "GitHub Actions 的缓存", "GitHub Actions caching", "ducter/gha-cache"],
  ["test-infra", "Prow 的 tide 合并太慢", "Prow's tide merges slowly", "ducter/tide-batch"],
  ["", "订下个月的会议室", "Book next month's meeting room"],
  ["", "整理 11 月的账单", "Sort November's bills"],
  ["", "比较三款降噪耳机", "Compare three noise-cancelling headphones"],
  ["", "给妈妈订生日蛋糕", "Order Mom's birthday cake"],
  ["", "查周末去杭州的高铁", "Weekend trains to Hangzhou"],
  ["", "续签护照要什么材料", "What a passport renewal needs"],
  ["", "退掉没用的订阅", "Cancel the subscriptions I don't use"],
  ["", "写 KubeCon 的演讲摘要", "Write the KubeCon talk abstract"],
  ["", "整理读书笔记", "Tidy my reading notes"],
  ["", "找一家能修 MacBook 键盘的店", "Find a shop that fixes MacBook keyboards"],
  ["", "年假怎么排", "Plan the annual leave"],
  ["", "回复 HN 上的评论", "Answer the comments on HN"],
  ["", "备份照片到 NAS", "Back up the photos to the NAS"],
  ["", "比较两家云服务器的价格", "Compare two cloud servers' prices"],
];
const READS = ["src/lib.rs", "src/db.rs", "crates/compaction/src/picker.rs", "crates/wal/src/reader.rs", "packages/search/src/index.ts", "apps/web/src/palette.tsx", "apps/desktop/internal/views/task.go", "prow/config.yaml", "README.md", "Cargo.toml", "package.json"];
if (process.env.DEMO_MORE) {
  const H = ["claude-code", "codex", "pi"] as const;
  const M = { "claude-code": ["opus", "sonnet"], codex: ["gpt-5.5", "gpt-5.5-codex"], pi: ["sonnet", "gemini-3-pro"] } as const;
  const ON = ["home", "home", "haswell", "home", "hel"] as const;
  for (const [i, [repo, z, e, branch]] of MORE.entries()) {
    const h = H[(i * 7) % 3]!;
    const ends = ["done", "done", "done", "failed", "done", "dropped", "done", "done"] as const;
    const end = i < 6 ? (["working", "working", "needs_you", "working", "blocked", "working"] as const)[i] : ends[i % ends.length];
    const n = (i * 37) % 101;
    S.push({
      id: `m_${i}`,
      zh: z,
      en: e,
      ...(repo ? { repo, on: ON[i % ON.length] } : {}),
      h,
      model: M[h][i % 2],
      days: i < 6 ? 0.05 + i * 0.04 : 0.4 + ((i * 53) % 590) / 10,
      ...(branch ? { branch, diff: [1 + (n % 9), 12 + n * 7, n % 40] as [number, number, number], ...(i % 4 === 0 ? { pr: "merge" as const } : i % 5 === 0 ? { pr: "draft" as const } : {}), commit: (0x1a2b3c + i * 0x9e37).toString(16).slice(0, 7) } : {}),
      ...(end !== "done" ? { end } : {}),
      ...(end === "needs_you" ? { ask: ["两种做法：改调度器（改动大）还是加一层队列（快但多一跳）？", "Two ways: change the scheduler (bigger) or add a queue (quicker, one more hop)?"] as [string, string] } : {}),
      came: ["读完了相关的代码，先做一个最小的复现。", "Read the code around it; starting with the smallest repro."],
      ...(end === "working" || end === "needs_you" || end === "blocked" ? {} : { out: end === "failed" ? ["没做成：测试环境起不来（端口被占用）。", "Didn't work: the test environment won't start (the port is taken)."] : end === "dropped" ? ["你说先不做了。", "You said to leave it for now."] : [`做完了：${z}。测试全过。`, `Done: ${e}. Tests pass.`] }),
      ...(i % 3 === 0 && repo ? { steps: [{ you: true, zh: "先写测试再改", en: "Write the test before the fix", came: ["测试先红了，修完变绿。", "The test went red first, then green after the fix."] }, { zh: "跑一下全量测试", en: "Run the whole suite", came: ["全量 1,284 个测试通过。", "All 1,284 tests pass."] }] } : {}),
      ...(repo ? { files: [READS[i % READS.length]!, READS[(i + 3) % READS.length]!] } : {}),
      noise: repo && i % 6 === 0 ? 60 + (i % 5) * 40 : repo ? 6 : 0,
    } as Seed);
  }
  // The long ones among the first: the compaction PR is the one the person keeps going back to.
  for (const s of S) if (s.id === "s_compact_pr" || s.id === "s_import" || s.id === "s_crash") s.noise = 180;
}

const log = core.log;
const DAY = 24 * 3600_000;
const HOUR = 3600_000;
// The home's repositories are real (in the demo's data folder), so a redo finds the commit a step
// started from and opens a worktree there; the workers' are only paths (they are away).
const homeRepos = join(core.dataDir, "repos");
const git = (cwd: string, args: string[], at?: number) => {
  const env = { ...process.env, GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "ada@example.invalid", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "ada@example.invalid", ...(at ? { GIT_AUTHOR_DATE: new Date(at).toISOString(), GIT_COMMITTER_DATE: new Date(at).toISOString() } : {}) };
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { env });
  return r.stdout.toString().trim();
};
const inited = new Set<string>();
function homeRepo(r: Repo): string {
  const dir = join(homeRepos, r);
  if (!inited.has(r)) {
    inited.add(r);
    mkdirSync(dir, { recursive: true });
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", `${r}: the start`], Date.now() - 60 * DAY);
  }
  return dir;
}
/** A commit on the task's branch at that time (the branch made off main the first time). */
function commitAt(r: Repo, branch: string, msg: string, at: number) {
  const dir = homeRepo(r);
  const has = git(dir, ["branch", "--list", branch]);
  git(dir, has ? ["checkout", "-q", branch] : ["checkout", "-q", "-b", branch, "main"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", msg], at);
  git(dir, ["checkout", "-q", "main"]);
}
const repoPath = (r: Repo, on: keyof typeof DEV) => (on === "home" ? homeRepo(r) : `/srv/dev/${r}`);

for (const s of [...S].sort((a, b) => b.days - a.days)) {
  const on = s.on ?? "home";
  const steps = s.steps ?? [];
  const end = s.days * DAY;
  // The brief, then each later step an hour or two apart, ending at `days` ago.
  const stepAt = (i: number) => end + (steps.length - i) * 1.6 * HOUR + 20 * 60_000;
  const st = `task:${s.id}`;
  const place: Place = s.repo ? { kind: "repo", device: DEV[on], repoPath: repoPath(s.repo, on), ...(s.branch ? { branch: s.branch } : {}), baseBranch: "main" } : { kind: "none", ...(on !== "home" ? { device: DEV[on] } : {}) };
  skew = -stepAt(0);
  const title = w(s.zh, s.en);
  const body: Bodies["task_open"] = { taskId: s.id, title, project: s.repo ?? "", place, harness: s.h ?? "claude-code", ...(s.model ? { model: s.model } : {}), brief: title, ...(s.from ? { from: s.from.id, fromStep: s.from.step, ...(s.from.commit ? { fromCommit: s.from.commit } : {}) } : {}) };
  log.append({ stream: st, origin: "partner", kind: "task_open", body });
  core.tasks.setState(s.id, "working", "hot");
  const said = (text: string, commit?: string) => {
    if (commit && s.repo && on === "home" && s.branch) commitAt(s.repo, s.branch, text.slice(0, 60), Date.now() + skew);
    if (commit) log.append({ stream: st, origin: "task", kind: "task_event", body: { taskId: s.id, role: "tool", tool: { name: "Bash", input: { command: `git commit -am "${s.branch ?? "work"}"` }, output: `[${s.branch ?? "main"} ${commit}] ${text.slice(0, 40)}`, ok: true } } });
    log.append({ stream: st, origin: "task", kind: "task_event", body: { taskId: s.id, role: "assistant", text } });
  };
  for (let k = 0; k < (s.noise ?? 0); k++) {
    const f = READS[k % READS.length]!;
    const tool = k % 5 === 4 ? { name: "Bash", input: { command: k % 10 === 9 ? "cargo test -p compaction" : `rg -n "level" ${f}` }, output: k % 10 === 9 ? `running 48 tests\n${"test throttle::bucket_refills ... ok\n".repeat(6)}test result: ok. 48 passed; 0 failed` : `${f}:${40 + k}:    let level = picker.next_level();`, ok: true } : k % 5 === 3 ? { name: "Grep", input: { pattern: "fn pick", path: f }, ok: true } : { name: "Read", input: { file_path: f }, ok: true };
    log.append({ stream: st, origin: "task", kind: "task_event", body: { taskId: s.id, role: "tool", tool } });
    if (k % 25 === 24) log.append({ stream: st, origin: "task", kind: "task_event", body: { taskId: s.id, role: "assistant", text: w(`第 ${k + 1} 步：${f} 看完了，接着看调用它的地方。`, `Step ${k + 1}: read ${f}; now the callers.`) } });
  }
  for (const f of s.files ?? []) log.append({ stream: st, origin: "task", kind: "task_event", body: { taskId: s.id, role: "tool", tool: { name: "Edit", input: { file_path: f }, ok: true } } });
  skew = -stepAt(0) + 30 * 60_000;
  if (s.came) said(w(...s.came), s.commit);
  for (const [i, x] of steps.entries()) {
    skew = -stepAt(i + 1);
    log.append({ stream: st, origin: x.you ? "user" : "partner", kind: "task_event", body: { taskId: s.id, role: "user", from: x.you ? "user" : "partner", text: w(x.zh, x.en) } });
    skew = -stepAt(i + 1) + 25 * 60_000;
    if (x.came) said(w(...x.came), x.commit);
  }
  skew = -end;
  const state = s.end === "failed" ? "failed" : s.end === "needs_you" ? "needs_input" : s.end === "working" || s.end === "blocked" ? "blocked" : "done";
  const branch = s.diff ? { commits: steps.filter((x) => x.commit).length + 1, uncommitted: false, files: s.diff[0], adds: s.diff[1], dels: s.diff[2] } : undefined;
  if (s.out || s.ask) {
    log.append({
      stream: st,
      origin: "task",
      kind: "report",
      body: {
        taskId: s.id,
        state,
        summary: s.out ? w(...s.out) : s.came ? w(...s.came) : title,
        questions: s.ask ? [{ id: "q1", text: w(...s.ask), blocking: true, reversible: false }] : [],
        evidence: s.commit ? [{ kind: "diff", label: "commit", ref: s.commit }] : [],
        ...(branch ? { branch } : {}),
      } as Bodies["report"],
    });
  } else if (branch) {
    log.append({ stream: st, origin: "task", kind: "checkpoint", body: { taskId: s.id, text: s.came ? w(...s.came) : title } as Bodies["checkpoint"] });
  }
  if (s.pr === "merge") log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${s.id}_merge`, taskId: s.id, state: "done", text: "the user merged this task's branch", act: "merge", ref: s.commit ?? "a1c9e07" } });
  if (s.pr === "draft") log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${s.id}_pr`, taskId: s.id, state: "done", text: "the user opened a draft PR", act: "open_pr", ref: `https://github.example/ada/${s.repo}/pull/${s.id === "s_compact_pr" ? 4127 : s.id === "s_prow" ? 318 : 322}` } });
  await Bun.sleep(4);
  if (s.end === "working") core.tasks.setState(s.id, "working", "hot");
  else if (s.end === "needs_you") core.tasks.setState(s.id, "needs_you", "hot");
  else if (s.end === "blocked") core.tasks.setState(s.id, "blocked", "parked");
  else core.tasks.setState(s.id, s.end ?? "done", s.days > 1 ? "archived" : "parked");
  await Bun.sleep(4);
}
skew = 0;
// D360: the sign-in redo as one group, its third part held in line.
core.taskGroups.join("default", w("登录页重做", "Redo the sign-in page"), ["g_form", "g_sms"], "partner");
await core.taskGroups.open("default", w("登录页重做", "Redo the sign-in page"), { persona: "default", title: w("补登录页的端到端测试", "Add end-to-end tests for the sign-in page"), brief: w("补登录页的端到端测试", "Add end-to-end tests for the sign-in page"), place: { kind: "repo", device: "local", repoPath: "/Users/ada/dev/ducter", branch: "ducter/signin-e2e", baseBranch: "main" } });

// The person's marks, as if made over the weeks.
const ws = new WebSocket(core.url);
await new Promise<void>((res) => (ws.onopen = () => res()));
ws.send(JSON.stringify({ t: "hello", client: "cli" }));
await Bun.sleep(100);
for (const s of S) if (s.starred || s.tags) ws.send(JSON.stringify({ t: "past_mark", taskId: s.id, patch: { ...(s.starred ? { starred: true } : {}), ...(s.tags ? { tags: s.tags } : {}) } }));
await Bun.sleep(200);
ws.close();

console.log(`[demo] sessions demo (${zh ? "zh" : "en"}, ${S.length} tasks) at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
