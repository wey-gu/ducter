package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D621: 门铃 / Doorbell on a Keep's 怎么做 card: off by default; on, the URL with Copy and a
// curl example; 换一个地址; and a ring's round line shows the caller's label as text, marked as
// their words. A helper (perItem) has no row: its address is its door.
func TestDoorbellRow(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.LocaleFixed = true
		app.Status = 2
		app.S.Welcomed = true
		now := time.Now().UTC().Format(time.RFC3339Nano)
		keep := protocol.KeepSheet{ID: "kp_ci", Title: "看 CI", Life: "on", Run: "same", Since: now, Wakes: []protocol.KeepWake{{Kind: "every", EveryMs: 30 * 60_000}}}
		page := &protocol.KeepPage{KeepSheet: keep, Said: "每 30 分钟看一次 CI，直到 #10473 合并为止", Editable: []string{"said", "every"}, Rounds: []protocol.KeepRound{
			{At: now, Woke: "ring", WokeWhat: `<img src=x onerror=alert(1)>`, Spoke: "silent", State: "done"},
		}}
		app.S.KeepPages = map[string]*protocol.KeepPage{"kp_ci": page}
		app.Route, app.oh.keep = RouteOnHand, keepState{open: "kp_ci"}
		tt := ui.NewTesterWith(app.View, 1150, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		draw := func() string {
			for i := 0; i < 4; i++ {
				tt.Frame()
			}
			return texts(tt)
		}
		all := draw()
		if !strings.Contains(all, app.L.T("keep.rule.bell")) || !strings.Contains(all, app.L.T("keep.bell.off")) {
			t.Errorf("%s: the doorbell row is not drawn off: %q", lang, all)
		}
		// The ring's label is drawn as text, marked as the caller's own; never as markup (Go draws
		// text, so the only assertion that can fail is that the words are there).
		label := app.L.T("keep.woke.ring.about", `<img src=x onerror=alert(1)>`)
		if !strings.Contains(all, strings.Split(label, "\n")[0]) {
			t.Errorf("%s: the ring's label is not drawn: want %q", lang, label)
		}

		// On, the row open: the URL with Copy and the curl example, all inside 1150.
		const home = "https://home.example"
		const token = "db1_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
		page.Bell = &protocol.KeepBell{At: now, URL: home + "/doorbell/" + token}
		app.oh.keep = keepState{open: "kp_ci", bellURL: page.Bell.URL}
		app.oh.keep.edit.open = "bell"
		all = draw()
		for _, want := range []string{app.L.T("keep.bell.on.act"), app.L.T("keep.bell.done"), page.Bell.URL, "curl -X POST", "X-Ducter-About: CI #42", app.L.T("keep.bell.new"), app.L.T("keep.bell.note.once"), app.L.T("keep.bell.note.where")} {
			if !strings.Contains(all, want) {
				t.Errorf("%s: %q is not drawn when the doorbell is on", lang, want)
			}
		}
		if r, ok := tt.Find(page.Bell.URL); ok && (r.X < 0 || r.X+r.W > 1150) {
			t.Errorf("%s: the URL at %v runs outside 1150", lang, r)
		}
		if _, ok := tt.Find(app.L.T("keep.edit.cancel")); ok {
			t.Errorf("%s: the doorbell foot still has a Cancel", lang)
		}

		// A helper has no row (a fresh frame, so nothing from the loop's page is left behind).
		page.Run, page.Bell = "perItem", nil
		page.Handoffs = []protocol.HandoffLine{}
		app.oh.keep = keepState{open: "kp_ci"}
		helper := ui.NewTesterWith(app.View, 1150, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		helper.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for i := 0; i < 4; i++ {
			helper.Frame()
		}
		if _, ok := helper.Find(app.L.T("keep.rule.bell")); ok {
			t.Errorf("%s: a helper drew a doorbell row", lang)
		}
	}
}

// The URL is shown once: opening the page again does not bring back a cached one.
func TestDoorbellURLNotShownAgain(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	page := &protocol.KeepPage{KeepSheet: protocol.KeepSheet{ID: "kp_ci", Title: "看 CI", Life: "on", Run: "same", Since: now, Bell: &protocol.KeepBell{At: now, URL: "https://home.example/doorbell/db1_x"}}}
	app.S.KeepPages = map[string]*protocol.KeepPage{"kp_ci": page}
	app.openKeep("kp_ci")
	if page.Bell.URL != "" {
		t.Fatalf("the cached URL is still there after opening the page: %q", page.Bell.URL)
	}
	if app.oh.keep.bellURL != "" {
		t.Fatalf("the page's URL was not cleared")
	}
}

// A relative path (a home with no public way set) is made whole by the address this Mac already
// reaches it at: Copy and curl must give a URL a script can actually open.
func TestDoorbellURLRelative(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.conn.address = "http://192.168.1.4:7777"
	if got, want := app.bellURL("/doorbell/db1_x"), "http://192.168.1.4:7777/doorbell/db1_x"; got != want {
		t.Fatalf("relative URL: got %q want %q", got, want)
	}
	if got, want := app.bellURL("https://home.example/doorbell/db1_x"), "https://home.example/doorbell/db1_x"; got != want {
		t.Fatalf("absolute URL: got %q want %q", got, want)
	}
}
