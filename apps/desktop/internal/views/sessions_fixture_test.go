package views

import (
	"fmt"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D390's fixture: a heavy developer's six weeks, about forty-five tasks
// across hawdb, nowledge-mem, ducter and test-infra plus a few errands, on
// the home (MacBook Pro) and two computers for tasks (haswell, hel), by
// three agents, several with three to six steps, two redone from a step.
// Every PR number, sha and name is made up.

type sessSeed struct {
	id, zh, en, project, harness, pc string
	ago                              time.Duration
	att                              protocol.Attention
	outZh, outEn                     string
	adds, dels                       int
	act                              string
	from                             string
	step                             int
}

func sessSeeds() []sessSeed {
	d, f, x := protocol.Done, protocol.Failed, protocol.Dropped
	h := time.Hour
	return []sessSeed{
		{"s_compaction_pr", "compaction 调度器拆成两层并开 PR", "Split the compaction scheduler in two and open a PR", "hawdb", "claude-code", "", 6*day + 3*h, d, "拆成了 picker 和 queue 两层；PR #4127 开好了，CI 全绿，等 Weizhen 审。", "Split into a picker and a queue; PR #4127 is open, CI green, waiting for Weizhen's review.", 412, 168, "open_pr", "", 0},
		{"s_compaction_redo", "compaction 调度器拆成两层并开 PR", "Split the compaction scheduler in two and open a PR", "hawdb", "codex", "", 5*day + 2*h, d, "从第 3 步开新任务，换 Codex：退避改成指数加抖动，L0 积压时不再饿死写入。", "Started from step 3 with Codex: the back-off is exponential with jitter; writes no longer starve when L0 piles up.", 236, 90, "open_pr", "s_compaction_pr", 3},
		{"s_rust_build", "haswell 上 Rust 全量构建太慢", "The full Rust build on haswell is too slow", "hawdb", "codex", "haswell", 27*day + 4*h, f, "sccache 命中率只有 12%：RUSTFLAGS 每次都变。没改完，停在等你决定要不要换 mold。", "sccache hits only 12%: RUSTFLAGS changes every run. Not finished; stopped at whether to switch to mold.", 40, 12, "", "", 0},
		{"s_rust_redo", "haswell 上 Rust 全量构建太慢", "The full Rust build on haswell is too slow", "hawdb", "claude-code", "haswell", 26*day + 2*h, d, "固定了 RUSTFLAGS 并换成 mold，全量构建从 14 分钟到 5 分钟 40 秒。", "Pinned RUSTFLAGS and switched to mold: the full build went from 14 min to 5 min 40 s.", 28, 9, "merge", "s_rust_build", 2},
		{"s_wal_fsync", "WAL 截断时少了一次 fsync", "WAL truncation skips an fsync", "hawdb", "claude-code", "", 2*day + 1*h, d, "补上了 fsync，崩溃测试连跑 1000 次不丢数据。", "Added the fsync; 1,000 crash runs lose nothing.", 27, 3, "merge", "", 0},
		{"s_bloom", "Bloom filter 误判率比预期高", "Bloom filter false positives higher than expected", "hawdb", "pi", "haswell", 9*day + 5*h, f, "换了哈希函数误判率没变；怀疑测试数据的分布，没找到根因。", "Another hash didn't change the rate; the test data's spread is the suspect. No root cause.", 20, 4, "", "", 0},
		{"s_bench", "跑写入基准，对比 0.9.2", "Run the write benchmark against 0.9.2", "hawdb", "codex", "haswell", 3*day + 6*h, d, "写入吞吐高 7%，p99 持平；表在 bench/2026-11-16.md。", "Writes up 7%, p99 flat; the table is in bench/2026-11-16.md.", 140, 0, "", "", 0},
		{"s_ttl", "TTL 过期的键在 scan 里还能看到", "Expired TTL keys still show in scan", "hawdb", "codex", "", 12*day + 2*h, d, "scan 跳过已过期未清理的键，补了边界用例。", "scan skips keys past their TTL; edge cases added.", 41, 7, "merge", "", 0},
		{"s_mvcc", "MVCC 快照读挡住了 compaction", "MVCC snapshot reads hold compaction back", "hawdb", "claude-code", "haswell", 33*day + 3*h, d, "长事务不再挡 compaction：快照只钉住它读到的层。", "Long transactions no longer hold compaction: a snapshot pins only the levels it reads.", 430, 120, "merge", "", 0},
		{"s_split", "region 分裂时写入暂停 800 毫秒", "Writes pause 800 ms during a region split", "hawdb", "claude-code", "", 18*day + 2*h, d, "先复制后切换，暂停降到 40 毫秒。", "Copy first, then switch: the pause is down to 40 ms.", 380, 120, "merge", "", 0},
		{"s_raft_review", "审一下 Weizhen 的 raft 成员变更 PR", "Review Weizhen's raft membership PR", "hawdb", "claude-code", "", 1*day + 3*h, d, "留了 4 条意见：joint consensus 的第二步少了一次持久化。", "Four comments: the second step of joint consensus misses one persist.", 0, 0, "", "", 0},
		{"s_gc", "清理过期的 SST 文件", "Clean up expired SST files", "hawdb", "codex", "haswell", 15*day + 3*h, f, "删除时撞上还被快照引用的文件，停下了，什么都没删。", "Hit a file a snapshot still references and stopped; nothing was deleted.", 44, 2, "", "", 0},
		{"s_metrics", "给 compaction 加 Prometheus 指标", "Prometheus metrics for compaction", "hawdb", "pi", "", 39*day + 3*h, d, "加了积压字节、每层文件数、耗时、写放大和暂停次数。", "Backlog bytes, files per level, time, write amplification and pauses.", 88, 3, "merge", "", 0},
		{"s_mem_zh", "mem 搜索的中文分词", "Chinese tokenising in mem search", "nowledge-mem", "codex", "", 4*day + 2*h, d, "bigram 加原词双索引，中文召回从 61% 到 88%。", "Bigrams plus whole words: Chinese recall from 61% to 88%.", 96, 40, "merge", "", 0},
		{"s_mem_sync", "mem 同步在 token 过期后卡住", "mem sync stalls after the token expires", "nowledge-mem", "claude-code", "hel", 8*day + 4*h, d, "过期后先刷新再重试一次；加了集成测试。", "It refreshes and retries once after expiry; integration test added.", 44, 9, "open_pr", "", 0},
		{"s_mem_import", "导入 Obsidian vault", "Import an Obsidian vault", "nowledge-mem", "claude-code", "", 21*day + 2*h, d, "双链变成关系；一万条笔记 40 秒。", "Wikilinks become relations; 10k notes in 40 s.", 512, 20, "open_pr", "", 0},
		{"s_mem_digest", "记忆摘要的评测集加 20 条真实对话", "Add 20 real conversations to the digest eval", "nowledge-mem", "pi", "hel", 10*day + 2*h, d, "召回 0.81 到 0.84；两条长对话还是漏了日期。", "Recall 0.81 to 0.84; two long ones still miss the date.", 640, 0, "", "", 0},
		{"s_mem_embed", "试新的 embedding 模型", "Try the new embedding model", "nowledge-mem", "codex", "hel", 25*day + 4*h, d, "召回高 3 个点，但调用贵一倍，先不换。", "Recall up 3 points but twice the cost per call; not switching yet.", 0, 0, "", "", 0},
		{"s_mem_cli", "nmem 加 --json 输出", "nmem --json output", "nowledge-mem", "pi", "", 13*day + 6*h, d, "search、add、list 都支持 --json，字段跟 API 一样。", "search, add and list take --json, with the API's fields.", 95, 12, "merge", "", 0},
		{"s_mem_export", "mem 导出成 Markdown", "Export mem as Markdown", "nowledge-mem", "codex", "", 29*day + 2*h, x, "做到一半你说先放下。", "Half done when you said to put it down.", 60, 2, "", "", 0},
		{"s_mem_recall", "recall 接口加分页", "Paginate the recall API", "nowledge-mem", "claude-code", "hel", 16*day + 5*h, d, "cursor 分页，默认 20 条；旧客户端照旧。", "Cursor pages, 20 by default; old clients unchanged.", 210, 45, "merge", "", 0},
		{"s_d_palette", "找任何东西的面板", "The find-anything palette", "ducter", "claude-code", "", 3 * h, protocol.Working, "", "", 900, 120, "", "", 0},
		{"s_d_push", "iPhone 收不到推送", "The iPhone gets no pushes", "ducter", "claude-code", "", 7*day + 2*h, d, "APNs 证书 11 月 10 日过期；换了新的，测试推送到了。", "The APNs certificate expired on Nov 10; renewed, a test push arrived.", 3, 3, "merge", "", 0},
		{"s_d_eval", "跑一遍伙伴的评测", "Run the partner eval", "ducter", "claude-code", "", 1*day + 6*h, d, "haiku 上 134/179；失败的多半是先问再做。", "134/179 on haiku; most misses asked before acting.", 0, 0, "", "", 0},
		{"s_d_launch", "App 冷启动太慢", "The app is slow to start", "ducter", "codex", "", 20*day + 3*h, d, "冷启动 2.4 秒到 0.9 秒：字体晚加载，ioreg 只跑一次。", "Cold start 2.4 s to 0.9 s: fonts load late, ioreg runs once.", 70, 41, "merge", "", 0},
		{"s_d_tunnel", "Tailscale 上远程打开", "Remote access over Tailscale", "ducter", "codex", "hel", 19*day + 2*h, d, "tailscale serve 起来了；要先开 MagicDNS 和 HTTPS 证书。", "tailscale serve works once MagicDNS and HTTPS certificates are on.", 88, 5, "merge", "", 0},
		{"s_d_fold", "折叠屏上的分栏", "Split panes on the foldable", "ducter", "pi", "", 35*day + 2*h, d, "按折痕左右分栏，平放时上下。", "Panes split at the fold; top and bottom when flat.", 74, 12, "merge", "", 0},
		{"s_d_zh", "中文文案过一遍", "Go through the Chinese copy", "ducter", "claude-code", "", 11*day + 4*h, d, "改了 37 处：按钮都是动词短语。", "37 fixes: every button a verb phrase.", 61, 61, "merge", "", 0},
		{"s_d_icon", "菜单栏图标在深色下太淡", "The menu bar icon is faint in dark mode", "ducter", "codex", "", 2*day + 5*h, d, "换成模板图像，深浅色下都跟系统图标一样亮。", "A template image now: as bright as the system's in light and dark.", 14, 22, "merge", "", 0},
		{"s_d_bridge", "Bridge 在 Codex 里收不到回复", "Bridge gets no replies in Codex", "ducter", "codex", "", 24*day + 3*h, f, "会话 id 换了没跟上；没改完就超时了。", "The session id changed and wasn't followed; timed out before the fix.", 33, 17, "", "", 0},
		{"s_d_release", "发 0.0.88", "Release 0.0.88", "ducter", "codex", "hel", 1*day + 2*h, d, "打了 v0.0.88 的 tag，说明发了，iOS 构建晚 20 分钟。", "Tagged v0.0.88 and posted the notes; the iOS build came 20 minutes late.", 48, 0, "merge", "", 0},
		{"s_d_ask", "Settings 里的语言要不要跟系统", "Should Settings' language follow the system", "ducter", "claude-code", "", 5 * h, protocol.NeedsYou, "", "", 18, 4, "", "", 0},
		{"s_ti_flaky", "CI 上 TestSnapshotRestore 偶发超时", "TestSnapshotRestore times out on CI now and then", "test-infra", "pi", "haswell", 9*day + 1*h, d, "CI 盘慢：等待从 5 秒放宽到 20 秒，超时打出进度。", "Slow CI disks: the wait went from 5 s to 20 s; a timeout prints progress.", 18, 6, "merge", "", 0},
		{"s_ti_shard", "hawdb 的 CI 分片", "Shard hawdb's CI", "test-infra", "codex", "haswell", 14*day + 3*h, d, "sccache 加四片分片，CI 从 31 分钟到 12 分钟。", "sccache and four shards: CI from 31 to 12 minutes.", 38, 7, "merge", "", 0},
		{"s_ti_prow", "Prow 的 retest 不认新标签", "Prow's retest ignores the new label", "test-infra", "claude-code", "", 6*day + 5*h, f, "插件配置里少了标签前缀；改了，但集群里没权限推上去。", "The plugin config lacked the label prefix; fixed, but no permission to push it to the cluster.", 12, 3, "", "", 0},
		{"s_ti_cache", "CI 缓存一周涨到 80 GB", "The CI cache grew to 80 GB in a week", "test-infra", "pi", "haswell", 17*day + 2*h, d, "加了按分支的过期，缓存稳定在 22 GB。", "Per-branch expiry: the cache holds at 22 GB.", 25, 4, "open_pr", "", 0},
		{"s_ti_arm", "加 arm64 的 runner", "Add an arm64 runner", "test-infra", "codex", "hel", 30*day + 3*h, d, "hel 上起了 arm64 runner，标签是 linux-arm64。", "An arm64 runner on hel, labelled linux-arm64.", 52, 0, "merge", "", 0},
		{"s_ti_nightly", "夜间构建偶尔拉不到镜像", "The nightly build sometimes can't pull its image", "test-infra", "claude-code", "", 22*day + 2*h, x, "你说先不管它。", "You said to leave it.", 0, 0, "", "", 0},
		{"s_e_kyoto", "订 12 月 6 号京都的酒店", "Book a hotel in Kyoto for Dec 6", "", "codex", "", 4 * h, protocol.Working, "", "", 0, 0, "", "", 0},
		{"s_e_dentist", "给牙医打电话改到下周三", "Call the dentist to move it to next Wednesday", "", "pi", "", 1*day + 1*h, d, "改到 11 月 25 日周三上午 10:30。", "Moved to Wednesday Nov 25, 10:30.", 0, 0, "", "", 0},
		{"s_e_flight", "查 12 月去东京的机票", "Find flights to Tokyo in December", "", "codex", "", 8*day + 3*h, d, "12 月 2 日的早班最便宜，往返 3280 元。", "The Dec 2 morning flight is cheapest, 3,280 yuan return.", 0, 0, "", "", 0},
		{"s_e_gift", "给妈妈挑生日礼物", "Pick a birthday present for Mom", "", "codex", "", 23*day + 4*h, d, "挑了三样：羊绒围巾、一套茶具、一本相册。", "Three picks: a cashmere scarf, a tea set, a photo album.", 0, 0, "", "", 0},
		{"s_e_tax", "整理今年的报销单", "Sort this year's expense receipts", "", "pi", "", 28*day + 2*h, d, "整理好了 23 张，3 张缺发票。", "23 sorted, 3 missing invoices.", 0, 0, "", "", 0},
		{"s_e_car", "约 4S 店保养", "Book the car service", "", "codex", "", 36*day + 2*h, d, "约好周六上午 10 点。", "Booked for Saturday 10 am.", 0, 0, "", "", 0},
		{"s_e_router", "家里路由器每晚掉线", "The home router drops every night", "", "pi", "", 41*day + 1*h, d, "2.4G 信道冲突，改到 11 信道后三天没掉。", "A 2.4 GHz channel clash; on channel 11 it held for three days.", 0, 0, "", "", 0},
	}
}

// sessItems are the seeds as Past tasks shows them, in a language.
func sessItems(lang i18n.Lang) []protocol.PastItem {
	byID := map[string]sessSeed{}
	for _, s := range sessSeeds() {
		byID[s.id] = s
	}
	pick := func(zh, en string) string {
		if lang == i18n.EN {
			return en
		}
		return zh
	}
	var out []protocol.PastItem
	for i, s := range sessSeeds() {
		at := pastNow.Add(-s.ago).UTC().Format(time.RFC3339)
		it := protocol.PastItem{TaskID: s.id, Title: pick(s.zh, s.en), Project: s.project, Harness: s.harness, Computer: s.pc, OpenedAt: at, UpdatedAt: at,
			Attention: s.att, Outcome: pick(s.outZh, s.outEn), Kind: sessKind(s), Steps: 1 + i%5}
		if s.adds+s.dels > 0 {
			it.Changes = &protocol.DiffStat{Files: 1 + (s.adds+s.dels)/60, Adds: s.adds, Dels: s.dels}
			it.Branch = "ducter/" + s.id[2:]
		}
		if s.act != "" {
			it.Integrated = &protocol.Integrated{Act: s.act}
		}
		if s.from != "" {
			o := byID[s.from]
			it.From = &protocol.PastFrom{TaskID: s.from, Title: pick(o.zh, o.en), Step: s.step}
		}
		switch s.id {
		case "s_rust_build":
			it.LastWords = pick("要不要把链接器换成 mold？换的话我改 .cargo/config.toml，haswell 上要先装 mold。", "Switch the linker to mold? If so I'll change .cargo/config.toml; haswell needs mold installed first.")
		case "s_compaction_pr":
			it.LastWords = pick("PR #4127 已经开了，等 Weizhen 的意见。", "PR #4127 is open; waiting for Weizhen's comments.")
			it.Mark = &protocol.PastMark{Starred: true, Tags: []string{"compaction"}, Glyph: "build", Tint: "sand", At: "2026-11-18T10:00:00Z"}
		case "s_d_ask":
			it.Asking = pick("Settings 的界面语言默认跟着系统，还是跟着你和伙伴说话的语言？", "Should Settings' language follow the system by default, or the language you talk to your partner in?")
		case "s_wal_fsync":
			it.Mark = &protocol.PastMark{Starred: true, Tags: []string{"wal"}, Glyph: "fix", Tint: "clay", At: "2026-11-18T10:00:00Z"}
		}
		out = append(out, it)
	}
	return out
}

func sessKind(s sessSeed) string {
	switch {
	case s.project == "":
		return "errand"
	case s.att == protocol.Failed:
		return "look"
	case s.act == "merge":
		return "fix"
	}
	return "build"
}

// sessResult is a past_result of items, with computers among the facets.
func sessResult(items []protocol.PastItem, id string) protocol.ServerFrame {
	f := pastResult(items, id)
	n := map[string]int{}
	var order []string
	for _, it := range items {
		if n[it.Computer] == 0 {
			order = append(order, it.Computer)
		}
		n[it.Computer]++
	}
	for _, name := range order {
		f.Past.Facets.Computers = append(f.Past.Facets.Computers, protocol.PastNameN{Name: name, N: n[name]})
	}
	return f
}

// sessSteps are a task's steps as the home answers them.
func sessSteps(lang i18n.Lang, id string) protocol.ServerFrame {
	pick := func(zh, en string) string {
		if lang == i18n.EN {
			return en
		}
		return zh
	}
	at := func(ago time.Duration) string { return pastNow.Add(-ago).UTC().Format(time.RFC3339) }
	var steps []protocol.PastStep
	report := ""
	switch id {
	case "s_rust_build":
		steps = []protocol.PastStep{
			{N: 1, Seq: 9101, At: at(28 * day), Who: "partner", Text: pick("haswell 上 hawdb 的全量构建要 14 分钟，看看能不能降到 5 分钟以内。", "hawdb's full build on haswell takes 14 minutes; see if it can get under 5."), Came: pick("先量了一遍：链接占 6 分钟，sccache 命中率 12%。", "Measured first: linking takes 6 minutes, sccache hits 12%.")},
			{N: 2, Seq: 9140, At: at(27*day + 20*time.Hour), Who: "you", Text: pick("先查 sccache 为什么命中这么低", "First find out why sccache hits so rarely"), Came: pick("RUSTFLAGS 里带了时间戳，每次都不一样。", "RUSTFLAGS carries a timestamp, different every run."), Commit: "3f9a2c1"},
			{N: 3, Seq: 9188, At: at(27*day + 9*time.Hour), Who: "you", Text: pick("固定 RUSTFLAGS，再试一下 lld 和 mold 哪个快", "Pin RUSTFLAGS, then try whether lld or mold is faster"), Came: pick("lld 快 2 分钟；mold 要先装。", "lld saves 2 minutes; mold needs installing first."), Commit: "a71d0e4"},
			{N: 4, Seq: 9230, At: at(27*day + 5*time.Hour), Who: "partner", Text: pick("你说先别装新东西，看看不装 mold 能到多少", "You said not to install anything new yet; see how far it gets without mold"), Came: pick("要不要把链接器换成 mold？", "Switch the linker to mold?"), Commit: "c0b84d7"},
		}
		report = pick("sccache 命中率只有 12%：RUSTFLAGS 每次都变。固定以后用 lld 是 9 分 10 秒；要到 5 分钟以内得换 mold，需要先在 haswell 上装它。停在等你决定。", "sccache hit only 12% because RUSTFLAGS changed every run. Pinned, with lld it is 9 min 10 s; under 5 minutes needs mold, installed on haswell first. Stopped for your call.")
	default:
		steps = []protocol.PastStep{
			{N: 1, Seq: 8001, At: at(7 * day), Who: "partner", Text: pick("把 compaction 调度器拆成 picker 和 queue 两层，接口别动，最后开个 PR。", "Split the compaction scheduler into a picker and a queue, keep the API, then open a PR."), Came: pick("拆好了，单测全过。", "Split; unit tests pass."), Commit: "5e21b9f"},
			{N: 2, Seq: 8042, At: at(6*day + 22*time.Hour), Who: "you", Text: pick("picker 单独一个文件，queue 别依赖它", "Put the picker in its own file; the queue mustn't depend on it"), Came: pick("picker.rs 单独了，queue 只拿接口。", "picker.rs stands alone; the queue only sees the trait."), Commit: "9c4410a"},
			{N: 3, Seq: 8090, At: at(6*day + 8*time.Hour), Who: "you", Text: pick("L0 积压的时候退避太激进了，改成指数退避加抖动", "The back-off is too eager when L0 piles up; make it exponential with jitter"), Came: pick("改成固定 50 毫秒再翻倍，写入在积压时会饿死。", "Made it 50 ms doubling; writes starve under a backlog."), Commit: "d27fe03"},
			{N: 4, Seq: 8133, At: at(6*day + 5*time.Hour), Who: "partner", Text: pick("你同意先开 PR：开草稿 PR，CI 跑起来", "You agreed to open it: open a draft PR and run CI"), Came: pick("PR #4127 开了，CI 全绿。", "PR #4127 is open, CI green."), Commit: "e81b6c2"},
			{N: 5, Seq: 8170, At: at(6*day + 3*time.Hour), Who: "you", Text: pick("把 PR 描述写清楚为什么拆两层，抄送 Weizhen", "Say in the PR why it's two layers, and cc Weizhen"), Came: pick("描述改好了，等 Weizhen 审。", "Description updated; waiting for Weizhen.")},
		}
		report = pick("拆成了 picker 和 queue 两层（crates/compaction/src/picker.rs、queue.rs），接口没动。PR #4127 开好了，CI 全绿；描述写了为什么拆两层，抄送了 Weizhen。L0 积压时的退避还是固定翻倍，写入在积压时可能饿死。", "Split into a picker and a queue (crates/compaction/src/picker.rs, queue.rs), API unchanged. PR #4127 is open, CI green; its description says why two layers and cc's Weizhen. The back-off under an L0 backlog still just doubles, so writes may starve.")
	}
	return protocol.ServerFrame{T: "past_steps_result", PastSteps: &protocol.PastStepsFrame{T: "past_steps_result", TaskID: id, Steps: steps, Report: report, Repo: true}}
}

// sessDevices are the three computers.
func sessDevices() []protocol.DeviceView {
	return []protocol.DeviceView{
		{ID: "local", Name: "MacBook Pro", Kind: "mac", Home: true},
		{ID: "dev_haswell", Name: "haswell", Kind: "linux"},
		{ID: "dev_hel", Name: "hel", Kind: "linux"},
	}
}

// sessOnHand are the tasks still on hand, as the app holds them.
func sessOnHand(lang i18n.Lang) protocol.ServerFrame {
	var cards []protocol.TaskCard
	for _, it := range sessItems(lang) {
		// What works or asks, and what finished in the last two days.
		if !pastActive(it.Attention) && pastNow.Sub(mustTime(it.UpdatedAt)) > 2*day {
			continue
		}
		c := protocol.TaskCard{TaskID: it.TaskID, Title: it.Title, Project: it.Project, Harness: it.Harness, Attention: it.Attention, OpenedAt: it.OpenedAt, UpdatedAt: it.UpdatedAt,
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/dev/code/" + it.Project, Branch: it.Branch}, Changes: it.Changes, Integrated: it.Integrated}
		if it.Outcome != "" {
			c.LastReport = &protocol.Report{Summary: it.Outcome}
		}
		cards = append(cards, c)
	}
	return protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards}}
}

func mustTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(fmt.Sprint(err))
	}
	return t
}
