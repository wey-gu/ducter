package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The brand pass's pictures (D76-D78): the conversation, an opened task
// (done and didn't work), On hand, Devices, Partner and Settings, zh and
// en, headless. DUCTER_BRAND_SHOTS=<suffix> writes <screen>-<lang>-<suffix>.png
// to shotsDir (DUCTER_SHOTS_DIR):
//
//	DUCTER_SHOTS_DIR=~/dev/ducter-evidence/brand-rollout/desktop DUCTER_BRAND_SHOTS=after go test ./internal/views -run BrandShots
func TestBrandShots(t *testing.T) {
	suffix := os.Getenv("DUCTER_BRAND_SHOTS")
	if suffix == "" {
		t.Skip("DUCTER_BRAND_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			shot := func(tt *ui.Tester, name string) {
				t.Helper()
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-%s-%s.png", name, lang, suffix)))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
			}

			// The conversation with a decision, On hand, the task, then done.
			h := newHarness(t, lang)
			h.app.LocaleFixed = true
			h.tt.SetSize(1280, 900)
			h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			s := h.app.S
			msg := map[i18n.Lang]string{i18n.ZH: "帮我看下 HawDB #1592 的 CI 为什么挂了", i18n.EN: "Find out why CI fails on HawDB #1592"}[lang]
			h.app.SendMessage(msg)
			h.until("the decision", func() bool { return s.PendingDecision("t-ci-1") != nil })
			h.tt.Advance(time.Second)
			shot(h.tt, "conversation")
			h.app.Route = RouteOnHand
			shot(h.tt, "onhand")
			h.app.Decide(s.PendingDecision("t-ci-1").DecisionID, "go", "")
			h.until("done", func() bool {
				return s.Task("t-ci-1").Attention() == protocol.Done && len(s.Channel) > 0 && s.Channel[len(s.Channel)-1].AI != nil
			})
			h.app.Route = RouteConversation
			h.until("history", func() bool { return s.Task("t-ci-1").HistoryLoaded })
			h.tt.Advance(time.Second)
			shot(h.tt, "conversation-done")
			h.app.OpenTask("t-ci-1")
			h.until("history", func() bool { return s.Task("t-ci-1").HistoryLoaded })
			h.tt.Advance(time.Second)
			shot(h.tt, "task-done")

			// A task that didn't work: the tokio 1.41 bump.
			app, _ := iaApp(t, lang)
			app.LocaleFixed = true
			failedTask(app, lang)
			app.OpenTask("t-tokio")
			app.Receive(protocol.ServerFrame{T: "task_history", TaskID: "t-tokio", Events: failedEvents(lang)})
			ft := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			ft.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			ft.Frame()
			ft.Advance(time.Second)
			shot(ft, "task-failed")

			// Devices.
			d := openDevices(t, lang, false)
			d.tt.SetSize(1280, 900)
			d.settle(500 * time.Millisecond)
			shot(d.tt, "devices")

			// Partner and Settings, full length.
			p, _ := iaApp(t, lang)
			p.LocaleFixed = true
			p.Receive(settingsFrame())
			p.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake}}})
			p.Route = RoutePartner
			pt := ui.NewTesterWith(p.View, 1280, 1460, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			pt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			pt.Frame()
			pt.Advance(time.Second)
			shot(pt, "partner")
			p.OpenSettings()
			pt.SetSize(1280, 1300)
			pt.Advance(time.Second)
			shot(pt, "settings")
		})
	}
}

func failedEvents(lang i18n.Lang) []protocol.LogEvent {
	l := func(zh, en string) string {
		if lang == i18n.ZH {
			return zh
		}
		return en
	}
	ts := func(m int) string { return time.Now().Add(time.Duration(m-30) * time.Minute).UTC().Format(time.RFC3339) }
	ok, bad := true, false
	stream := protocol.TaskStream("t-tokio")
	return []protocol.LogEvent{
		protocol.NewEvent(101, ts(0), "default", stream, protocol.OriginSystem, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t-tokio",
			Title: l("升级 tokio 到 1.41", "Bump tokio to 1.41"), Project: "HawDB", Harness: "codex", Model: "gpt-5",
			Place: protocol.Place{Kind: "repo", Device: "MacBook", RepoPath: "~/code/hawdb", Branch: "ducter/tokio-1.41", BaseBranch: "main"},
			BodyReason: l("你的规则「后端用 Codex」", "Your rule \"backend goes to Codex\"")}),
		protocol.NewEvent(102, ts(1), "default", stream, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t-tokio", Role: "assistant",
			Text: l("把 tokio 升到 1.41，依赖一起更新。", "Bumping tokio to 1.41 with its dependencies.")}),
		protocol.NewEvent(103, ts(3), "default", stream, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t-tokio", Role: "tool",
			Tool: &protocol.ToolCall{Name: "Bash", Input: []byte(`{"command":"cargo update -p tokio && cargo build --workspace"}`), Output: "Finished dev profile\n", OK: &ok}}),
		protocol.NewEvent(104, ts(12), "default", stream, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t-tokio", Role: "tool",
			Tool: &protocol.ToolCall{Name: "Bash", Input: []byte(`{"command":"cargo test -p hawdb-net replication -- --test-threads 1"}`), Output: "test result: FAILED. 41 passed; 3 failed (timeout)\n", OK: &bad}}),
		protocol.NewEvent(105, ts(20), "default", stream, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t-tokio", Role: "assistant",
			Text: l("把超时从 5 秒放到 15 秒再跑，还是超时。不是慢一点的问题，所以先停下，没有接着改代码。", "With the timeout raised from 5 s to 15 s they still time out. It's not just slower, so I stopped here and changed no more code.")}),
		protocol.NewEvent(106, ts(21), "default", stream, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: "t-tokio", State: "failed",
			Summary: l("tokio 1.41 没升成：hawdb-net 有 3 个测试一直超时。看起来是新版本调度的方式变了，replication 追赶的循环被挤慢了。改动都没合，main 不受影响。",
				"tokio 1.41 didn't go in: 3 tests in hawdb-net keep timing out. The new scheduler seems to starve the replication catch-up loop. Nothing was merged; main is untouched."),
			Evidence: []protocol.EvidenceRef{{Kind: "log", Label: l("3 个测试超时", "3 tests time out"), Ref: "/tmp/tokio.log"}}}),
		protocol.NewEvent(107, ts(21), "default", stream, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "t-tokio", Attention: protocol.Failed, Residency: protocol.Parked}),
	}
}

func failedTask(app *App, lang i18n.Lang) {
	app.Receive(protocol.ServerFrame{T: "events", Events: failedEvents(lang)})
}
