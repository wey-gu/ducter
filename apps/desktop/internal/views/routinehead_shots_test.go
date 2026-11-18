package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// routineHead is an opened watcher task on a worker: Codex on gpt-6.2-sol
// looking every 45 minutes, 59 looks so far, the last one 25 minutes ago
// found nothing new, the next in 20 minutes.
func routineHead(t *testing.T, lang i18n.Lang) (*App, *ui.Tester) {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	n := int64(0)
	at := func(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
	}
	codex := protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, Models: []protocol.HarnessModel{{ID: "gpt-6.2-sol", Label: "GPT-6.2-Sol"}}}
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "MacBook Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake},
		{ID: "hetzner", Name: "Hetzner Server", Kind: "server", State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{codex}},
	}})
	id, ts := "t_rv", protocol.TaskStream("t_rv")
	reason := "nowledge-co 出现新的 review 请求、提及或待审 PR 更新"
	title, brief := "每 45 分钟看一次 nowledge-co 有没有要我 review 的 PR", "每 45 分钟看一次 nowledge-co：有新的 review 请求、提及我的评论，或我在审的 PR 有更新，就告诉我。"
	if lang == i18n.EN {
		reason = "a new review request, mention or update to a PR under review in nowledge-co"
		title, brief = "Every 45 minutes, look for PRs in nowledge-co that want my review", "Every 45 minutes, look at nowledge-co: a new review request, a comment mentioning me, or an update to a PR I'm reviewing, tell me."
	}
	armed := protocol.Waiter{WaiterID: "w1", TaskID: id, Reason: reason, State: protocol.WaiterArmed, Kind: "check",
		Check: &protocol.CheckSpec{Argv: []string{"gh", "search", "prs"}}, EveryMs: 45 * 60_000, Looks: 59,
		ArmedAt:    now.Add(-44 * time.Hour).UTC().Format(time.RFC3339),
		LastLookAt: now.Add(-25 * time.Minute).UTC().Format(time.RFC3339),
		NextLookAt: now.Add(20 * time.Minute).UTC().Format(time.RFC3339)}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		at(45*time.Hour, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "codex", Model: "gpt-6.2-sol", Place: protocol.Place{Kind: "none", Device: "hetzner"}, Brief: brief}),
		at(44*time.Hour, "channel", protocol.OriginTask, protocol.KindWaiter, armed),
		at(44*time.Hour, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Blocked}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask(id)
	app.S.Task(id).HistoryLoaded = true
	tt.Frame()
	tt.Frame()
	return app, tt
}

// D355: the watcher's head says its model in the agent's words (a task on a
// worker, the label from that computer's list), when it looks next as the
// one number, and what the last look found as its own fact.
func TestRoutineHeadWords(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := routineHead(t, lang)
		got := tt.Texts()
		has := func(s string) bool {
			for _, x := range got {
				if x == s {
					return true
				}
			}
			return false
		}
		for _, want := range []string{"GPT-6.2-Sol", app.L.T("watch.nothing"), app.L.T("wait.every", 45), app.L.T("wait.look"), app.L.T("wait.cancel"), app.L.T("watch.tally", 59)} {
			if !has(want) {
				t.Errorf("%s: the head lacks %q in %q", lang, want, got)
			}
		}
		next := false
		for _, m := range []int{19, 20, 21} {
			next = next || has(app.L.T("watch.next.min", m))
		}
		if !next || has("gpt-6.2-sol") || has(app.L.T("watch.left.min", 20)) {
			t.Errorf("%s: one number, in words, and no raw id: %q", lang, got)
		}
	}
	for id, want := range map[string]string{"gpt-6.2-sol": "GPT-6.2-Sol", "gpt-5.5": "GPT-5.5", "opus": "Opus", "claude-opus-4-7": "claude-opus-4-7"} {
		if got := prettyModel(id); got != want {
			t.Errorf("prettyModel(%q) = %q, want %q", id, got, want)
		}
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOT_TAG=after DUCTER_SHOTS_DIR=/Users/weyl/dev/ducter/.shots/routine-head go test ./internal/views -run RoutineHeadShots
func TestRoutineHeadShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	tag := os.Getenv("DUCTER_SHOT_TAG")
	if tag == "" {
		tag = "after"
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			_, tt := routineHead(t, lang)
			tt.SetDark(dark)
			tt.Advance(time.Second)
			tt.Frame()
			tt.Frame()
			mode := "light"
			if dark {
				mode = "dark"
			}
			f, err := os.Create(filepath.Join(dir, strings.Join([]string{tag, "mac", string(lang), mode}, "-")+".png"))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}
