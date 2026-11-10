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
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// Restart to update: the window says it is putting the new version in, and
// nothing else (no Settings, no button), until it goes away.
func TestPuttingInScreen(t *testing.T) {
	for _, tc := range []struct {
		lang        i18n.Lang
		title, body string
	}{
		{i18n.ZH, "正在换上新版本，马上回来", "Ducter 0.3.1 一会儿就打开，后台的任务接着做。"},
		{i18n.EN, "Putting the new version in, back in a moment", "Ducter 0.3.1 opens in a moment; tasks in the background carry on."},
	} {
		app, _ := iaApp(t, tc.lang)
		app.Updates = &fakeUpdates{st: update.Status{State: update.Ready, Current: "0.3.0", Version: "0.3.1", InstallOnQuit: true}}
		app.RestartToUpdate = func() {}
		app.OpenUpdate()
		app.PuttingIn = true
		tt := ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		for _, want := range []string{tc.title, tc.body} {
			if !tt.HasText(want) {
				t.Errorf("%s: no %q in %q", tc.lang, want, tt.Texts())
			}
		}
		if tt.HasText(app.L.T("update.restart")) {
			t.Errorf("%s: Restart Now still on screen", tc.lang)
		}
		// The copy failed its check: back to Settings' update card.
		app.UpdateFailed()
		tt.Frame()
		if tt.HasText(tc.title) || !tt.HasText(app.L.T("update.restart")) {
			t.Errorf("%s: after a refused copy: %q", tc.lang, tt.Texts())
		}
	}
}

// The first launch after a swap says once which version went in, in the
// update card's line.
func TestUpdatedToSaysTheVersion(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Updates = &fakeUpdates{st: update.Status{State: update.Idle, Current: "0.0.6", Installed: "0.0.6", InstallOnQuit: true}}
	app.OpenUpdate()
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !tt.HasText("已更新到 0.0.6") {
		t.Errorf("no 已更新到 0.0.6 in %q", tt.Texts())
	}
	if !app.installedSaid {
		t.Error("the toast is said once")
	}
}

// Shots of the putting-in screen, zh and en, for review:
//
//	DUCTER_UPDATE_SHOTS=../../../../.shots/update-ux go test ./internal/views -run PuttingInShots
func TestPuttingInShots(t *testing.T) {
	dir := os.Getenv("DUCTER_UPDATE_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_UPDATE_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, step := range []string{"ready", "putting", "updated"} {
			app, _ := iaApp(t, lang)
			st := update.Status{State: update.Ready, Current: "0.0.5", Version: "0.0.6", InstallOnQuit: true, CheckedAt: time.Now().Add(-time.Hour)}
			if step == "updated" {
				st = update.Status{State: update.Idle, Current: "0.0.6", Installed: "0.0.6", InstallOnQuit: true, CheckedAt: time.Now().Add(-time.Hour)}
			}
			app.Updates = &fakeUpdates{st: st}
			app.RestartToUpdate = func() {}
			app.Version = st.Current
			app.openTab(TabAbout)
			app.PuttingIn = step == "putting"
			tt := ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.Frame()
			tt.Advance(time.Second)
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("desktop-update-%s-%s.png", step, lang)))
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
