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

// Full-length pictures of the Partner page and Settings (D71), which a
// native window can only show a screen of at a time. DUCTER_IA_SHOTS=<dir>
// writes ia-<screen>-<lang>-full.png there:
//
//	DUCTER_IA_SHOTS=../../design/screens/ia-2026-11-09 go test ./internal/views -run IAShots
func TestIAShots(t *testing.T) {
	dir := os.Getenv("DUCTER_IA_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_IA_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		shot := func(tt *ui.Tester, name string) {
			tt.Advance(time.Second)
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("ia-%s-%s-full.png", name, lang)))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		// Partner, with quiet hours and three noted lines.
		app, _ := iaApp(t, lang)
		f := settingsFrame()
		f.Settings.Quiet = &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: "Asia/Shanghai"}
		f.Mem.Noted = []protocol.Noted{
			{Seq: 9, Title: "周报每周五下午发", At: time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)},
			{Seq: 8, Title: "HawDB 的发布说明用英文写", At: time.Now().Add(-26 * time.Hour).UTC().Format(time.RFC3339)},
			{Seq: 7, Title: "测试统一用假时钟", At: time.Now().Add(-74 * time.Hour).UTC().Format(time.RFC3339)},
		}
		app.Receive(f)
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake}}})
		app.Route = RoutePartner
		tt := ui.NewTesterWith(app.View, 1280, 1460, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		tt.Frame()
		shot(tt, "partner")

		// Settings, on the Mac Ducter runs on: updates, the checks, Remove.
		app2, _ := iaApp(t, lang)
		home, _ := os.UserHomeDir()
		app2.Backend = &fakeRemover{fakeBackend: &fakeBackend{background: true, dir: filepath.Join(home, ".ducter")}}
		app2.Version, app2.Commit = "0.3.0", "e2f7ddb"
		app2.Updates = &fakeUpdates{st: update.Status{State: update.UpToDate, Current: "0.3.0", CheckedAt: time.Now().Add(-3 * time.Hour), InstallOnQuit: true}}
		app2.settings.report = &local.Report{OK: true, Checks: []local.Check{
			{ID: "claude", Label: "Claude Code", Status: "ok", Detail: map[i18n.Lang]string{i18n.ZH: "已登录", i18n.EN: "Signed in"}[lang]},
			{ID: "codex", Label: "Codex", Status: "missing", Detail: map[i18n.Lang]string{i18n.ZH: "装好了，还没登录", i18n.EN: "Installed, not signed in"}[lang]},
			{ID: "nmem", Label: "Nowledge Mem", Status: "ok"},
			{ID: "cua", Label: "cua-driver", Status: "ok", Detail: "0.44.0"},
		}}
		app2.OpenSettings()
		tt2 := ui.NewTesterWith(app2.View, 1280, 1900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt2.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt2.Frame()
		tt2.Frame()
		shot(tt2, "settings")
		r := &app2.settings.remove
		r.open, r.all = true, true
		r.plan = &local.UninstallPlan{All: true,
			Remove: []local.UninstallItem{
				{What: map[i18n.Lang]string{i18n.ZH: "后台项", i18n.EN: "The background item"}[lang], Path: filepath.Join(home, "Library/LaunchAgents/co.nowledge.ducter.agent.plist")},
				{What: map[i18n.Lang]string{i18n.ZH: "对话、任务和工作副本", i18n.EN: "The conversation, tasks and working copies"}[lang], Path: filepath.Join(home, ".ducter")},
			},
			Keep: []local.UninstallKeep{{What: "Claude Code, Codex", Detail: map[i18n.Lang]string{i18n.ZH: "它们是你自己的", i18n.EN: "They're yours"}[lang]}},
		}
		tt2.Frame()
		tt2.Frame()
		shot(tt2, "settings-remove")
	}
}

type fakeRemover struct{ *fakeBackend }

func (f *fakeRemover) UninstallPlan(all bool) (local.UninstallPlan, error) {
	return local.UninstallPlan{All: all}, nil
}
func (f *fakeRemover) Uninstall(local.UninstallPlan) (local.UninstallResult, error) {
	return local.UninstallResult{}, nil
}
