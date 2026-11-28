package views

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D663: 找设置 / Find a setting on the Mac. The index is the panes' own words: every tab of the rail
// has findable settings, every entry's key is in both tables and drawn by the views' source, and a
// drawn pane shows each of its entries' words (or the heading it lands on); the match reads both
// languages, the synonyms and the pane's name; a jump opens the pane and lands on the row.

func TestSetFindIndexCoversEveryTab(t *testing.T) {
	tabs := map[string]bool{}
	for _, tab := range settingsTabs {
		tabs[tab] = true
	}
	for _, tab := range settingsTabs {
		if tab == TabHome {
			continue // Overview is the brief, not a pane of settings
		}
		n := 0
		for _, e := range setIndex {
			if e.tab == tab {
				n++
			}
		}
		if n == 0 {
			t.Errorf("no settings findable on %s: add them to setIndex (setfind.go)", tab)
		}
	}
	var src strings.Builder
	files, _ := filepath.Glob("*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") || f == "setfind.go" {
			continue
		}
		b, _ := os.ReadFile(f)
		src.Write(b)
	}
	zh, en := i18n.New(i18n.ZH), i18n.New(i18n.EN)
	ids := map[string]bool{}
	for _, e := range setIndex {
		if ids[e.id] {
			t.Errorf("%s twice", e.id)
		}
		ids[e.id] = true
		if !tabs[e.tab] {
			t.Errorf("%s: no tab %q", e.id, e.tab)
		}
		if e.key == "" && e.brand == "" {
			t.Errorf("%s: no words", e.id)
		}
		for _, k := range append(append([]string{e.key, e.near}, e.alt...), "setfind.syn."+e.id) {
			if k == "" {
				continue
			}
			if zh.T(k) == k || en.T(k) == k {
				t.Errorf("%s: %s is not in both tables", e.id, k)
			}
			if !strings.HasPrefix(k, "setfind.") && !strings.Contains(src.String(), `"`+k+`"`) {
				t.Errorf("%s: no view draws %s", e.id, k)
			}
		}
		if e.brand != "" && !e.home && !strings.Contains(src.String(), e.brand) {
			t.Errorf("%s: no view draws %s", e.id, e.brand)
		}
	}
}

// sfDrawn is every word the window draws now, as compared.
func sfDrawn(tt *ui.Tester) map[string]bool {
	out := map[string]bool{}
	for _, s := range tt.Texts() {
		out[sfNorm(s)] = true
	}
	return out
}

func TestSetFindEntriesAreTheirPanesWords(t *testing.T) {
	// Drawn only in a state the fixture doesn't have (a second agent, a key, a phone source, Mem's
	// rules, a local Mac's own rows), each named with why.
	cond := map[string]string{
		"key": "the add group's row, with an agent to add", "add": "with an agent to add", "model": "with a model list",
		"effort": "with a model that thinks", "handoff": "with agents signed in", "records": "with agents' records",
		"partners": "on a home that offers partners", "rules": "with Mem's rules", "calls": "with Tuwa", "own": "with Tuwa",
		"readback": "with voice", "voicekey": "with voice", "theme": "with a local Mac", "density": "with a local Mac",
		"menubar": "with a local Mac", "uilang": "with a local Mac", "details2": "with a local Mac", "sound": "with a local Mac",
		"look": "with a local Mac", "folder": "with a local Mac", "logs": "with a local Mac", "remove": "with a local Mac",
		"devices": "with a local Mac", "lend": "with a local Mac", "autoupdate": "with updates", "versions": "with updates",
		"tasks": "with agents", "newtasks": "with agents", "thinks": "with a brain", "about": "with Mem's glance", "trust": "",
	}
	app, tt := homeApp(t, i18n.ZH, false)
	app.Receive(protocol.ServerFrame{T: "proactive_day", Day: &protocol.ProactiveDay{}})
	missing := []string{}
	for _, tab := range []string{TabPartner, TabMemory, TabNotify, TabAccounts, TabLook, TabRun, TabAbout} {
		app.openTab(tab)
		for i := 0; i < 6; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
		drawn := sfDrawn(tt)
		for _, e := range setIndex {
			if e.tab != tab {
				continue
			}
			l := &sfLand{}
			app.sf.land = nil
			app.setJump(e)
			l = app.sf.land
			app.sf.land = nil
			ok := drawn[l.near]
			for _, o := range l.own {
				ok = ok || drawn[o]
			}
			if _, c := cond[e.id]; !ok && !c {
				missing = append(missing, tab+": "+e.id)
			}
		}
	}
	if len(missing) > 0 {
		t.Fatalf("an entry whose words its pane doesn't draw: %v", missing)
	}
}

func TestSetFindMatchesBothLanguagesD663(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := homeApp(t, lang, false)
		first := func(q string) string {
			h := app.setFind(q)
			if len(h) == 0 {
				return ""
			}
			return h[0].e.id
		}
		for q, want := range map[string]string{
			"quiet": "quiet", "免打扰": "quiet", "安静": "quiet", "勿扰": "quiet", "dnd": "quiet", "do not disturb": "quiet",
			"Telegram": "telegram", "telgram": "telegram", "飞书": "feishu", "深色": "theme", "dark": "theme", "推理": "effort",
		} {
			if got := first(q); got != want {
				t.Errorf("%s: %q found %q, want %q", lang, q, got, want)
			}
		}
		if h := app.setFind("xyzzyq"); len(h) != 0 {
			t.Errorf("%s: nonsense found %d", lang, len(h))
		}
		// A pane's name finds what lives there, its own title first.
		h := app.setFind("通知")
		if len(h) < 4 || h[0].e.id != "notify" {
			t.Errorf("%s: 通知 found %v", lang, h)
		}
	}
}

func TestSetFindRowAndJumpD663(t *testing.T) {
	app, tt := homeApp(t, i18n.ZH, false)
	app.S.Settings.Quiet = &protocol.QuietHours{Start: "23:00", End: "08:00"}
	var quiet setEntry
	for _, e := range setIndex {
		if e.id == "quiet" {
			quiet = e
		}
	}
	if app.setTitle(quiet) != "免打扰" || app.setPane(quiet) != "通知" || quiet.value(app) != "23:00 到 08:00" {
		t.Fatalf("the row: %q %q %q", app.setTitle(quiet), app.setPane(quiet), quiet.value(app))
	}
	// Typing shows the found rows in place of the pane; the words stay a pane's name apart.
	app.sf.q = "免打扰"
	for i := 0; i < 3; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	if !app.sf.showing {
		t.Fatal("the words didn't show what they find")
	}
	if _, ok := tt.Find("免打扰"); !ok {
		t.Fatalf("no found row in %q", tt.Texts())
	}
	// Choosing it opens Notifications and lands on the row's own words.
	app.setJump(quiet)
	for i := 0; i < 4; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	if app.settingsTab() != TabNotify || app.sf.showing {
		t.Fatalf("opened %q, showing %v", app.settingsTab(), app.sf.showing)
	}
	if app.sf.land == nil || app.sf.land.hit != "免打扰" {
		t.Fatalf("landed on %+v", app.sf.land)
	}
	// The tint settles and the landing lets go.
	for i := 0; i < 30; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	if app.sf.land != nil {
		t.Fatal("the landing never let go")
	}
	// Nothing found: the calm line and the way to the conversation.
	app.sf.q, app.sf.showing = "飞船", true
	tt.Frame()
	if _, ok := tt.Find(app.L.T("setfind.none", "飞船")); !ok {
		t.Fatalf("no calm line in %q", tt.Texts())
	}
	// ⌘F in Settings is the field.
	app.FindAsked()
	if !app.sf.focus || app.oh.sw {
		t.Fatal("⌘F in Settings didn't go to Find a setting")
	}
}

func TestSetFindGeometryD663(t *testing.T) {
	for _, w := range []int{1000, 1400} {
		app, tt := homeApp(t, i18n.EN, false)
		tt.SetSize(w, 900)
		app.sf.q = "notif"
		for i := 0; i < 3; i++ {
			tt.Advance(100 * time.Millisecond)
			tt.Frame()
		}
		for _, h := range app.setFind("notif") {
			if app.setTitle(h.e) == app.setPane(h.e) {
				continue // its words are also the rail's tab
			}
			r, ok := tt.Find(app.setTitle(h.e))
			if !ok {
				t.Fatalf("%d: %s not drawn", w, h.e.id)
			}
			if r.X < float32(railW) || r.X+r.W > float32(w) {
				t.Fatalf("%d: %s at %v, past the pane", w, h.e.id, r)
			}
		}
	}
}

func TestSetFindInFindAnythingD663(t *testing.T) {
	app, _ := homeApp(t, i18n.EN, false)
	var got []string
	goAt, setAt := -1, -1
	for i, r := range app.palRows("quiet hours") {
		if r.kind == palSetting {
			got = append(got, r.key)
			if setAt < 0 {
				setAt = i
			}
		}
		if r.kind == palGo && goAt < 0 {
			goAt = i
		}
	}
	if strings.Join(got, ",") != "s:quiet" || (goAt >= 0 && setAt > goAt) {
		t.Fatalf("⌘K settings %v at %d, places at %d", got, setAt, goAt)
	}
	for _, r := range app.palRows("Chat apps") {
		if r.kind == palSetting {
			t.Fatalf("a pane's name alone offered %s", r.key)
		}
	}
}
