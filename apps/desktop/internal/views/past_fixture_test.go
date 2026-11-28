package views

import (
	"fmt"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// pastNow is the fixture's clock: Thursday 19 November 2026, 15:00.
var pastNow = time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)

type pastSeed struct {
	id, title, project, harness string
	ago                         time.Duration
	att                         protocol.Attention
	outcome, kind               string
	adds, dels                  int
	act                         string // merge | open_pr
	mark                        *protocol.PastMark
	original                    string
	hit                         *protocol.PastHit
	imported                    *protocol.PastImported
}

const day = 24 * time.Hour

func pStar(tags ...string) *protocol.PastMark {
	return &protocol.PastMark{Starred: true, Tags: tags, At: "2026-11-18T10:00:00Z"}
}

func pPic(glyph, tint string, tags ...string) *protocol.PastMark {
	return &protocol.PastMark{Glyph: glyph, Tint: tint, Tags: tags, At: "2026-11-18T10:00:00Z"}
}

// pastSeeds are about forty tasks of the author's: hawdb, mem, ducter, and
// errands, across October and November.
func pastSeeds() []pastSeed {
	d, f := protocol.Done, protocol.Failed
	return []pastSeed{
		{id: "t_flaky", title: "查 compaction 测试为什么偶尔失败", project: "hawdb", harness: "claude-code", ago: 2 * time.Hour, att: d, outcome: "原因是 TestCompactionRace 里两个 goroutine 共用了一个假时钟，改成各自一个后连跑 500 次都过了。", kind: "look", adds: 38, dels: 12, act: "open_pr", mark: &protocol.PastMark{Name: "flaky 测试：假时钟", Starred: true, Tags: []string{"flaky", "测试"}, Glyph: "look", Tint: "sage", At: "2026-11-19T13:00:00Z"}, original: "查 compaction 测试为什么偶尔失败"},
		{id: "t_kyoto", title: "订京都的酒店", project: "", harness: "codex", ago: 4 * time.Hour, att: d, outcome: "订好了 Hotel Kanra Kyoto，12 月 3 日到 6 日，三晚，含早餐，可免费取消到 11 月 30 日。", kind: "errand", mark: pPic("errand", "clay", "旅行")},
		{id: "t_wal", title: "WAL 回放时跳过损坏的尾部记录", project: "hawdb", harness: "codex", ago: 5 * time.Hour, att: d, outcome: "回放遇到校验和不对的尾部记录时截断并记一行警告，加了三个用例。", kind: "fix", adds: 112, dels: 9, act: "merge"},
		{id: "t_digest", title: "记忆摘要的评测集再加 20 条真实对话", project: "mem", harness: "claude-code", ago: 7 * time.Hour, att: d, outcome: "加了 20 条，召回从 0.81 到 0.84，两条长对话仍然漏掉了日期。", kind: "data", adds: 640, mark: pPic("data", "mist", "eval")},
		{id: "t_dentist", title: "给牙医诊所打电话改到下周三", project: "", harness: "pi", ago: day + 2*time.Hour, att: d, outcome: "改到 11 月 25 日周三上午 10:30，诊所说会发短信确认。", kind: "talk"},
		{id: "t_mac_icon", title: "Mac 菜单栏图标在深色模式下太淡", project: "ducter", harness: "claude-code", ago: day + 5*time.Hour, att: d, outcome: "换成了模板图像，深色和浅色下都跟系统图标一样亮。", kind: "fix", adds: 14, dels: 22, act: "merge"},
		{id: "t_release", title: "发 0.0.60 的版本说明", project: "ducter", harness: "codex", ago: day + 8*time.Hour, att: d, outcome: "版本说明写好并发到了 GitHub Releases，网站的更新页也同步了。", kind: "ship", adds: 48, act: "merge", mark: pPic("ship", "sand")},
		{id: "t_bloom", title: "Bloom filter 的误判率比预期高", project: "hawdb", harness: "claude-code", ago: 2*day + 3*time.Hour, att: f, outcome: "没找到根因：换哈希函数后误判率没变，怀疑是测试数据分布的问题。", kind: "look", adds: 20, dels: 4},
		{id: "t_sync", title: "Mem 同步在断网后重复上传", project: "mem", harness: "codex", ago: 2*day + 6*time.Hour, att: d, outcome: "上传前先比对本地的 etag，断网恢复后不再重复，补了一个集成测试。", kind: "fix", adds: 76, dels: 31, act: "open_pr"},
		{id: "t_review_pr", title: "审一下 Weizhen 的 compaction 调度 PR", project: "hawdb", harness: "claude-code", ago: 3*day + 2*time.Hour, att: d, outcome: "留了 6 条意见，主要是 L0 积压时的退避太激进，其余可以合。", kind: "review", mark: pPic("review", "lilac", "review")},
		{id: "t_onboard", title: "第一次打开时的欢迎页文案", project: "ducter", harness: "pi", ago: 3*day + 7*time.Hour, att: d, outcome: "中英文各三句，去掉了「代理」这个词，改成直接说它会做什么。", kind: "write", adds: 26, dels: 18},
		{id: "t_gift", title: "给妈妈挑生日礼物", project: "", harness: "codex", ago: 4*day + 4*time.Hour, att: d, outcome: "挑了三样：一条羊绒围巾、一套茶具、一本摄影集，链接和价格都在报告里。", kind: "errand", mark: pStar("家里")},
		{id: "t_bench", title: "跑一遍写入基准，对比上个版本", project: "hawdb", harness: "codex", ago: 6*day + 3*time.Hour, att: d, outcome: "写入吞吐提升 7%，p99 延迟持平；结果表放在 bench/2026-11-13.md。", kind: "data", adds: 140},
		{id: "t_iphone_push", title: "iPhone 收不到推送", project: "ducter", harness: "claude-code", ago: 7*day + 2*time.Hour, att: d, outcome: "APNs 证书在 11 月 10 日过期了，换了新证书，测试推送已收到。", kind: "fix", adds: 3, dels: 3, act: "merge"},
		{id: "t_tax", title: "整理今年的报销单据", project: "", harness: "pi", ago: 7*day + 9*time.Hour, att: protocol.Dropped, outcome: "整理到一半，你说先不做了。", kind: "errand"},
		{id: "t_recall", title: "recall 接口加分页", project: "mem", harness: "codex", ago: 8*day + 5*time.Hour, att: d, outcome: "加了 cursor 分页，默认 20 条，旧客户端不传 cursor 照旧。", kind: "build", adds: 210, dels: 45, act: "merge"},
		{id: "t_flaky_old", title: "CI 上 TestSnapshotRestore 偶发超时", project: "hawdb", harness: "pi", ago: 9*day + 1*time.Hour, att: d, outcome: "超时是因为 CI 机器盘慢，把等待从 5 秒放宽到 20 秒，并在超时时打出进度。", kind: "fix", adds: 18, dels: 6, act: "merge", mark: pPic("fix", "stone", "flaky", "ci")},
		{id: "t_slides", title: "做 HawDB 存储引擎分享的幻灯片", project: "hawdb", harness: "claude-code", ago: 10*day + 4*time.Hour, att: d, outcome: "18 页，讲 LSM 的写放大和我们的分层 compaction，附了三张基准图。", kind: "write", mark: pStar("分享")},
		{id: "t_cal", title: "把下周的会都挪到下午", project: "", harness: "codex", ago: 11 * day, att: d, outcome: "挪了 5 个，周二的组会对方没回，还在原来的时间。", kind: "talk"},
		{id: "t_theme", title: "Pebble 主题加深色的 token", project: "ducter", harness: "claude-code", ago: 12*day + 3*time.Hour, att: d, outcome: "加了 Midnight 的第一版 token，按钮和卡片的层次在深色下都看得出来。", kind: "build", adds: 320, dels: 40, act: "open_pr"},
		{id: "t_mem_cli", title: "nmem 命令行加 --json 输出", project: "mem", harness: "pi", ago: 13*day + 6*time.Hour, att: d, outcome: "search、add、list 都支持 --json 了，字段跟 API 一样。", kind: "build", adds: 95, dels: 12, act: "merge"},
		{id: "t_flight", title: "查 12 月去东京的机票", project: "", harness: "codex", ago: 14*day + 2*time.Hour, att: d, outcome: "最便宜的是 12 月 2 日的东航，往返 3280 元；直飞全日空 4650 元。", kind: "errand", mark: pPic("errand", "clay", "旅行")},
		{id: "t_idea", title: "想想 On hand 怎么在手机上更好用", project: "ducter", harness: "claude-code", ago: 15*day + 5*time.Hour, att: d, outcome: "三个方向：底部一行计数、左滑处理、按项目折叠；第一个最省事。", kind: "idea", mark: pPic("idea", "sand")},
		{id: "t_gc", title: "清理过期的 SST 文件", project: "hawdb", harness: "codex", ago: 16*day + 3*time.Hour, att: f, outcome: "删除时撞上了还在被快照引用的文件，停下了，没删任何东西。", kind: "fix", adds: 44, dels: 2},
		{id: "t_docs", title: "写 docs 里的「安装」页", project: "ducter", harness: "pi", ago: 18*day + 2*time.Hour, att: d, outcome: "写好了 macOS 和 Linux 两种装法，截图放在 .shots 里没进仓库。", kind: "write", adds: 120, act: "merge"},
		{id: "t_embed", title: "试试换成新的 embedding 模型", project: "mem", harness: "claude-code", ago: 20*day + 4*time.Hour, att: d, outcome: "新模型召回高 3 个点，但每次调用贵一倍，先不换。", kind: "look"},
		{id: "t_router", title: "家里路由器每天晚上掉线", project: "", harness: "pi", ago: 21*day + 1*time.Hour, att: d, outcome: "是 2.4G 频段的信道冲突，改到 11 信道后连着三天没掉。", kind: "fix"},
		{id: "t_split", title: "region 分裂时的写入暂停", project: "hawdb", harness: "claude-code", ago: 23*day + 2*time.Hour, att: d, outcome: "把分裂改成先复制后切换，写入暂停从 800 毫秒降到 40 毫秒。", kind: "build", adds: 380, dels: 120, act: "merge"},
		{id: "t_bridge", title: "Bridge 在 Codex 里收不到回复", project: "ducter", harness: "codex", ago: 25*day + 3*time.Hour, att: d, outcome: "Codex 的会话 id 变了没跟着更新，改成每次按名字找。", kind: "fix", adds: 33, dels: 17, act: "merge"},
		{id: "t_party", title: "订周六晚上 8 个人的餐厅", project: "", harness: "codex", ago: 27*day + 6*time.Hour, att: d, outcome: "订了「南京大牌档」靠窗的大桌，周六 18:30，已经发到群里了。", kind: "errand"},
		{id: "t_export", title: "Mem 导出成 Markdown", project: "mem", harness: "pi", ago: 29*day + 2*time.Hour, att: d, outcome: "每条记忆一个文件，带标签和时间，按月份分文件夹。", kind: "build", adds: 160, dels: 8, act: "open_pr"},
		{id: "t_review_doc", title: "审一遍 D270 的设计说明", project: "ducter", harness: "claude-code", ago: 31*day + 3*time.Hour, att: d, outcome: "两处跟原则 4 冲突，一处用词不在词表里，其余没问题。", kind: "review"},
		{id: "t_ttl", title: "TTL 过期的键在 scan 里还能看到", project: "hawdb", harness: "codex", ago: 33*day + 5*time.Hour, att: d, outcome: "scan 跳过已过期但未清理的键，补了边界用例。", kind: "fix", adds: 41, dels: 7, act: "merge"},
		{id: "t_newsletter", title: "写这个月的 Nowledge 通讯", project: "mem", harness: "claude-code", ago: 35*day + 2*time.Hour, att: d, outcome: "写好了，讲同步和导出两个新功能，配了两张截图。", kind: "write"},
		{id: "t_visa", title: "查日本签证要准备的材料", project: "", harness: "pi", ago: 37*day + 4*time.Hour, att: d, outcome: "列了 7 样材料，在职证明需要盖章，建议 11 月 20 日前递交。", kind: "errand"},
		{id: "t_metrics", title: "给 compaction 加 Prometheus 指标", project: "hawdb", harness: "claude-code", ago: 39*day + 3*time.Hour, att: d, outcome: "加了 5 个指标：积压字节、每层文件数、耗时、写放大、暂停次数。", kind: "data", adds: 88, dels: 3, act: "merge"},
		{id: "t_login", title: "网页端登录后偶尔白屏", project: "ducter", harness: "codex", ago: 41*day + 6*time.Hour, att: protocol.Superseded, outcome: "换成另一个任务接着查了。", kind: "fix"},
		{id: "t_plan", title: "想想 v2 的路线图", project: "ducter", harness: "claude-code", ago: 44*day + 2*time.Hour, att: d, outcome: "三个阶段：先把手机做完整，再做团队共享，最后开放插件。", kind: "idea"},
		{id: "t_pay", title: "交这个季度的物业费", project: "", harness: "pi", ago: 46*day + 3*time.Hour, att: d, outcome: "交了 1860 元，收据存在了文件夹里。", kind: "errand"},
		{id: "t_raft", title: "读一遍 Raft 论文里的成员变更", project: "hawdb", harness: "codex", ago: 48*day + 5*time.Hour, att: d, outcome: "整理了 joint consensus 的要点和我们实现里缺的两步。", kind: "look"},
		// D651 (research/246): brought in from another app, read only; its own day and app.
		{id: "t_imp_wal", title: "WAL 尾部损坏时怎么回放", project: "hawdb", harness: "codex", ago: 3*day + 2*time.Hour, att: d, outcome: "", kind: "look", imported: &protocol.PastImported{App: "Lody", ThreadID: "S-8f2a", At: pastNow.Add(-(3*day + 2*time.Hour)).UTC().Format(time.RFC3339)}},
		{id: "t_imp_kyoto", title: "京都酒店和机票一起看", project: "", harness: "", ago: 4*day + 5*time.Hour, att: d, outcome: "", kind: "errand", imported: &protocol.PastImported{App: "Lody", ThreadID: "S-91c0", At: pastNow.Add(-(4*day + 5*time.Hour)).UTC().Format(time.RFC3339)}},
		{id: "t_imp_old", title: "试一下旧的 parser", project: "old-thing", harness: "", ago: 9*day + 1*time.Hour, att: d, outcome: "", kind: "look", imported: &protocol.PastImported{App: "Lody", ThreadID: "S-77aa", At: pastNow.Add(-(9*day + 1*time.Hour)).UTC().Format(time.RFC3339), Gone: true}},
	}
}

func pastItems(seeds []pastSeed) []protocol.PastItem {
	var out []protocol.PastItem
	for _, s := range seeds {
		at := pastNow.Add(-s.ago).UTC().Format(time.RFC3339)
		it := protocol.PastItem{TaskID: s.id, Title: s.title, Project: s.project, Harness: s.harness, OpenedAt: at, UpdatedAt: at,
			Attention: s.att, Outcome: s.outcome, Kind: s.kind, Mark: s.mark, Hit: s.hit, Imported: s.imported}
		if s.mark != nil && s.mark.Name != "" {
			it.Title, it.Original = s.mark.Name, s.original
		}
		if s.adds+s.dels > 0 {
			it.Changes = &protocol.DiffStat{Files: 1 + (s.adds+s.dels)/40, Adds: s.adds, Dels: s.dels}
			it.Branch = "ducter/" + s.id
		}
		if s.act != "" {
			it.Integrated = &protocol.Integrated{Act: s.act}
		}
		out = append(out, it)
	}
	return out
}

// pastResult is a past_result of the items, with the facets they make.
func pastResult(items []protocol.PastItem, id string) protocol.ServerFrame {
	f := &protocol.PastFrame{T: "past_result", ID: id, Items: items, Total: len(items)}
	pn, hn, tn := map[string]int{}, map[string]int{}, map[string]int{}
	var po, ho, to []string
	for _, it := range items {
		if pn[it.Project] == 0 {
			po = append(po, it.Project)
		}
		pn[it.Project]++
		if it.Harness != "" {
			if hn[it.Harness] == 0 {
				ho = append(ho, it.Harness)
			}
			hn[it.Harness]++
		}
		if it.Mark != nil {
			for _, tg := range it.Mark.Tags {
				if tn[tg] == 0 {
					to = append(to, tg)
				}
				tn[tg]++
			}
		}
	}
	sortBy := func(keys []string, n map[string]int) {
		for i := range keys {
			for j := i + 1; j < len(keys); j++ {
				if n[keys[j]] > n[keys[i]] {
					keys[i], keys[j] = keys[j], keys[i]
				}
			}
		}
	}
	sortBy(po, pn)
	sortBy(ho, hn)
	sortBy(to, tn)
	for _, p := range po {
		f.Facets.Projects = append(f.Facets.Projects, struct {
			Name string `json:"name"`
			N    int    `json:"n"`
		}{p, pn[p]})
	}
	for _, h := range ho {
		f.Facets.Harnesses = append(f.Facets.Harnesses, struct {
			Harness string `json:"harness"`
			N       int    `json:"n"`
		}{h, hn[h]})
	}
	for _, tg := range to {
		f.Facets.Tags = append(f.Facets.Tags, struct {
			Tag string `json:"tag"`
			N   int    `json:"n"`
		}{tg, tn[tg]})
		f.Suggestions = append(f.Suggestions, tg)
	}
	f.Suggestions = append(f.Suggestions, "hawdb", "mem", "ducter")
	return protocol.ServerFrame{T: "past_result", Past: f}
}

// pastFlaky is the search "flaky": every match, best first, with where it matched.
func pastFlaky() []protocol.PastItem {
	all := pastItems(pastSeeds())
	by := map[string]protocol.PastItem{}
	for _, it := range all {
		by[it.TaskID] = it
	}
	pick := func(id string, hit *protocol.PastHit) protocol.PastItem {
		it := by[id]
		it.Hit = hit
		return it
	}
	return []protocol.PastItem{
		pick("t_flaky", &protocol.PastHit{Field: "title", Text: "查 compaction 测试为什么偶尔失败（flaky）"}),
		pick("t_flaky_old", &protocol.PastHit{Field: "tag", Text: "flaky · ci"}),
		pick("t_bloom", &protocol.PastHit{Field: "words", Text: "这个 flaky 的误判率测试先别删，我想看看是不是数据的问题"}),
		pick("t_bench", &protocol.PastHit{Field: "report", Text: "排除了 2 个 flaky 的基准项，结果更稳定"}),
		pick("t_split", &protocol.PastHit{Field: "file", Text: "region/split_flaky_test.go"}),
		pick("t_iphone_push", &protocol.PastHit{Field: "branch", Text: "ducter/fix-flaky-push"}),
	}
}

func pastIDs(items []protocol.PastItem) string {
	s := ""
	for _, it := range items {
		s += fmt.Sprint(it.TaskID, " ")
	}
	return s
}
