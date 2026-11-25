package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D362: a running AI agent step in Update all says what it is doing, and
// past its usual time one quiet line offers 再等等 and 停止. The author's
// screen: a home on Hetzner, Codex on the MacBook Pro M3 from npm.

var apNow = time.Date(2026, 11, 18, 14, 40, 0, 0, time.UTC)

func apPlan(p protocol.AgentProgress) *protocol.UpdateAllView {
	at := apNow.Add(-5 * time.Minute).Format(time.RFC3339)
	return &protocol.UpdateAllView{Plan: &protocol.UpdateAllPlan{ID: "ua-1", By: "user", Items: []protocol.UpdateAllItem{
		{Key: "agent:local:codex", Kind: "agent", Device: "local", DeviceName: "Hetzner", Harness: "codex", From: "0.169.1", To: "0.170.0", State: "done", At: at},
		{Key: "agent:m1:codex", Kind: "agent", Device: "m1", DeviceName: "MacBook Pro M3", Harness: "codex", From: "0.169.1", To: "0.170.0", State: "running", Phase: "updating", At: at, AgentProgress: p},
	}}}
}

func apApp(t *testing.T, lang i18n.Lang, p protocol.AgentProgress) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Now = func() time.Time { return apNow }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: apPlan(p)})
	app.openTab(TabAbout)
	tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	return app, tt, sent
}

func ago(d time.Duration) string { return apNow.Add(-d).Format(time.RFC3339Nano) }

func TestAgentStepWords(t *testing.T) {
	cases := []struct {
		p      protocol.AgentProgress
		zh, en string
	}{
		{protocol.AgentProgress{Step: "downloading", Got: 12_000_000, Size: 98_000_000, Since: ago(40 * time.Second), SlowMs: 240_000}, "正在下载（12 / 98 MB）", "Downloading (12 / 98 MB)"},
		{protocol.AgentProgress{Step: "downloading", Got: 38_400_000, Since: ago(40 * time.Second), SlowMs: 240_000}, "正在下载（38 MB）", "Downloading (38 MB)"},
		{protocol.AgentProgress{Step: "downloading", Since: ago(80 * time.Second), SlowMs: 240_000}, "正在下载… 1 分 20 秒", "Downloading… 1 min 20 s"},
		{protocol.AgentProgress{Step: "installing", Since: ago(3 * time.Minute), SlowMs: 240_000}, "正在装好…", "Installing…"},
		{protocol.AgentProgress{Since: ago(125 * time.Second), SlowMs: 240_000}, "正在更新到 0.170.0… 2 分 5 秒", "Updating to 0.170.0… 2 min 5 s"},
		{protocol.AgentProgress{Since: ago(3 * time.Second)}, "正在更新到 0.170.0…", "Updating to 0.170.0…"},
	}
	for _, k := range cases {
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			want := k.zh
			if lang == i18n.EN {
				want = k.en
			}
			_, tt, _ := apApp(t, lang, k.p)
			if !hasText(tt, want) {
				t.Errorf("%s: no %q in %q", lang, want, tt.Texts())
			}
			if hasText(tt, "比平常慢，可能是网络慢") || hasText(tt, "Slower than usual; the network may be slow") {
				t.Errorf("%s: slow line before its time for %+v", lang, k.p)
			}
		}
	}
}

func TestAgentStepSlowLine(t *testing.T) {
	p := protocol.AgentProgress{Step: "downloading", Got: 40_000_000, Size: 155_000_000, Since: ago(5 * time.Minute), SlowMs: 240_000}
	app, tt, sent := apApp(t, i18n.ZH, p)
	for _, w := range []string{"正在下载（40 / 155 MB）", "比平常慢，可能是网络慢", "再等等", "停止"} {
		if !hasText(tt, w) {
			t.Errorf("no %q in %q", w, tt.Texts())
		}
	}
	// 再等等: the line goes, the download goes on.
	if err := tt.Click("再等等"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if hasText(tt, "比平常慢，可能是网络慢") {
		t.Error("the slow line stayed after 再等等")
	}
	// Another slow stretch later, it comes back; 停止 stops that one step only.
	app.Now = func() time.Time { return apNow.Add(5 * time.Minute) }
	tt.Frame()
	if err := tt.Click("停止"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	last := (*sent)[len(*sent)-1]
	if r, ok := last.(protocol.UpdateAllReq); !ok || r.StopItem != "agent:m1:codex" || r.Stop {
		t.Fatalf("sent %#v", last)
	}
}

func TestAgentStepTimeoutWhy(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	if got := app.agentWhy("timeout"); got != "下载太久没完成，已经停下了，原来的版本照常能用。网络好些时再试一次。" {
		t.Errorf("timeout: %q", got)
	}
	if got := app.agentWhy("stopped"); got != "你停下了它，原来的版本照常能用。" {
		t.Errorf("stopped: %q", got)
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/agent-update go test ./internal/views -run AgentUpdateShots
func TestAgentUpdateShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	steps := map[string]protocol.AgentProgress{
		"1-downloading": {Step: "downloading", Got: 38_000_000, Size: 155_000_000, Since: ago(70 * time.Second), SlowMs: 240_000},
		"2-slow":        {Step: "downloading", Got: 61_000_000, Size: 155_000_000, Since: ago(5 * time.Minute), SlowMs: 240_000},
		"3-installing":  {Step: "installing", Since: ago(6 * time.Minute), SlowMs: 240_000},
		"4-brew-time":   {Since: ago(80 * time.Second), SlowMs: 240_000},
	}
	for name, p := range steps {
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
				_, tt, _ := apApp(t, lang, p)
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, "mac-"+name+"-"+string(lang)+"-"+mode+".png"))
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
}
