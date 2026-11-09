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
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// Every tab of Settings (D150) at 1280 wide, zh and en, for review:
//
//	DUCTER_SETTINGS_SHOTS=../../../../.shots/settings go test ./internal/views -run SettingsShots
//
// The Partner tab twice: Ducter on this Mac (Claude Code and Codex signed
// in), and the window connected to a server "hel" with only Codex.
func TestSettingsShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SETTINGS_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_SETTINGS_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	ago := func(d time.Duration) string { return time.Now().Add(-d).UTC().Format(time.RFC3339) }
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		pick := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		mk := func(remote bool) *App {
			app, _ := iaApp(t, lang)
			f := settingsFrame()
			f.Settings.Quiet = &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: "Asia/Shanghai"}
			f.Mem.KeptUnder = "小鸭"
			f.Mem.Noted = []protocol.Noted{
				{Seq: 9, Title: pick("周报每周五下午发", "The weekly report goes out Friday afternoon"), At: ago(2 * time.Hour)},
				{Seq: 8, Title: pick("HawDB 的发布说明用英文写", "HawDB release notes are in English"), At: ago(26 * time.Hour)},
				{Seq: 7, Title: pick("测试统一用假时钟", "Tests use the fake clock"), At: ago(74 * time.Hour)},
			}
			hs := []protocol.DeviceHarness{
				{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true, Allowance: &protocol.Allowance{Left: 0.62}},
				{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true, Allowance: &protocol.Allowance{Left: 0.81}},
				{Harness: "pi", Installed: true},
			}
			home := protocol.DeviceView{ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: hs}
			if remote {
				f.Mem.State, f.Mem.KeptUnder = "missing", ""
				f.BrainNow = &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex"}, Auto: true, Why: "only_codex"}
				home = protocol.DeviceView{ID: "hel", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{
					{Harness: "claude-code"},
					{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true},
				}}
				app.URL = "wss://hel.siwei.info/ws"
			} else {
				f.Settings.Brain = &protocol.Brain{Harness: "claude-code", Model: "opus"}
				home2, _ := os.UserHomeDir()
				app.Backend = &fakeRemover{fakeBackend: &fakeBackend{background: true, dir: filepath.Join(home2, ".ducter")}}
			}
			app.Receive(f)
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{home}})
			app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{
				{ID: "c1", Name: "OOMOL", Source: "oo", Via: "oo", Apps: []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"wei@work.example", "wei@home.example"}}, {Service: "gcal", Title: "Google Calendar", Accounts: []string{"wei@work.example"}}}},
			}})
			app.Version, app.Commit = "0.0.3", "1ccda39"
			app.Updates = &fakeUpdates{st: update.Status{State: update.UpToDate, Current: "0.0.3", CheckedAt: time.Now().Add(-3 * time.Hour), InstallOnQuit: true}}
			app.PlayTitle = func() TitleSound { return &fakeTitleSound{} }
			app.Pair = func(string, string) error { return nil }
			app.UseLocal = func() {}
			return app
		}
		shot := func(app *App, name string, h int) {
			tt := ui.NewTesterWith(app.View, 1280, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.Frame()
			tt.Advance(time.Second)
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("desktop-%s-%s.png", name, lang)))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		for _, tc := range []struct {
			name, tab string
			remote    bool
			h         int
		}{
			{"partner-mac", TabPartner, false, 1720},
			{"partner-hel", TabPartner, true, 1600},
			{"notify", TabNotify, false, 800},
			{"accounts", TabAccounts, false, 900},
			{"look", TabLook, false, 1200},
			{"run-mac", TabRun, false, 1100},
			{"run-hel", TabRun, true, 900},
			{"about", TabAbout, false, 1000},
		} {
			app := mk(tc.remote)
			app.openTab(tc.tab)
			if tc.tab == TabRun && !tc.remote {
				app.settings.report = &local.Report{OK: true, Checks: []local.Check{
					{ID: "claude", Label: "Claude Code", Status: "ok", Detail: pick("已登录", "Signed in")},
					{ID: "codex", Label: "Codex", Status: "ok", Detail: pick("已登录", "Signed in")},
					{ID: "nmem", Label: "Nowledge Mem", Status: "ok"},
				}}
			}
			shot(app, tc.name, tc.h)
		}
	}
}
