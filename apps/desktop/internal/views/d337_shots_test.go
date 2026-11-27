package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// d337About is Updates and about on a Mac home whose app read of the feed
// failed at failedAgo and whose home answered at homeAgo.
func d337About(t *testing.T, lang i18n.Lang, failedAgo, homeAgo time.Duration) (*App, *ui.Tester, *[]any) {
	app, sent := iaApp(t, lang)
	app.URL = ""
	now := time.Now()
	app.Updates = &fakeUpdates{st: update.Status{State: update.Failed, Reason: update.ReasonFeed, Current: "0.0.68", CheckedAt: now.Add(-2 * time.Hour), TriedAt: now.Add(-failedAgo), InstallOnQuit: true}}
	home := protocol.DeviceView{ID: "local", Name: "Siwei's MacBook Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Version: "0.0.68",
		Update: &protocol.DeviceUpdate{Current: "0.0.68", Latest: "0.0.68", How: "app", CheckedAt: now.Add(-homeAgo).UTC().Format(time.RFC3339)}}
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{home}})
	app.openTab(TabAbout)
	tt := ui.NewTesterWith(app.View, 1280, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	return app, tt, sent
}

func d337Count(texts []string, w string) int {
	n := 0
	for _, s := range texts {
		if s == w || strings.HasPrefix(s, w+"，") {
			n++
		}
	}
	return n
}

// D337 (2): one Ducter on a Mac home says one check, the latest, with one
// button that reads both (its words twice: the label and its accessible name).
func TestD337OneCheck(t *testing.T) {
	// The failed read came after the home's answer: it stands, and the home's
	// row doesn't say "latest" under it.
	_, tt, _ := d337About(t, i18n.ZH, time.Minute, 7*time.Minute)
	if !hasText(tt, "这次没能检查") || hasText(tt, "7 分钟前检查过，已是最新") || !hasText(tt, "GitHub 没应答，一小时内再试。 7 分钟前检查过") || d337Count(tt.Texts(), "检查更新") != 2 {
		t.Fatalf("failed last: %q", tt.Texts())
	}
	// The home answered after the failed read: its answer is the one line.
	app, tt, sent := d337About(t, i18n.ZH, 9*time.Minute, 7*time.Minute)
	if hasText(tt, "这次没能检查") || d337Count(tt.Texts(), "7 分钟前检查过，已是最新") != 1 || d337Count(tt.Texts(), "检查更新") != 2 {
		t.Fatalf("home last: %q", tt.Texts())
	}
	if err := tt.Click("检查更新"); err != nil {
		t.Fatal(err)
	}
	if f, ok := (*sent)[len(*sent)-1].(protocol.DeviceUpdateReq); !ok || !f.Check || f.Device != "local" {
		t.Fatalf("the one button reads the home too: %#v", (*sent)[len(*sent)-1])
	}
	// research/124: the home's answer ends 在检查… on this page (it stayed for good: only
	// the Devices card read the answer).
	app.Updates.(*fakeUpdates).st.State = update.UpToDate
	tt.Advance(time.Second)
	tt.Frame()
	app.Receive(protocol.ServerFrame{T: "update_result", Device: "local", OK: true})
	tt.Advance(time.Second)
	tt.Frame()
	if hasText(tt, "在检查…") || d337Count(tt.Texts(), "检查更新") != 2 {
		t.Fatalf("still checking after the home answered: %q", tt.Texts())
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/settings-0068 go test ./internal/views -run D337Shots
func TestD337Shots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	save := func(tt *ui.Tester, name string) {
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		_, tt, _ := d337About(t, lang, time.Minute, 7*time.Minute)
		save(tt, "mac-1280-light-"+string(lang)+"-about-failed-last.png")
		_, tt, _ = d337About(t, lang, 9*time.Minute, 7*time.Minute)
		save(tt, "mac-1280-light-"+string(lang)+"-about-home-last.png")
		for _, st := range []string{"none", "rest-open", "allow"} {
			app, _ := iaApp(t, lang)
			step := st
			if st == "rest-open" {
				step = "none"
				app.own.opened = true
			}
			app.Receive(ownFrame(step))
			app.openTab(TabAccounts)
			tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.Frame()
			name := map[string]string{"none": "accounts-own-rest", "rest-open": "accounts-own-opened", "allow": "accounts-own-started"}[st]
			save(tt, "mac-1280-light-"+string(lang)+"-"+name+".png")
		}
	}
}
