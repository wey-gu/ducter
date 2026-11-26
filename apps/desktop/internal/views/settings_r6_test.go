package views

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D618: the Settings round after D589. These are the geometry rules the
// pass fixed, walked on the real shape at the window's usual widths.

// The Mac's saved sign-ins and keys say what the web says: dots for a sign-in
// and 已存 (or the key's own hint) for a key, their words on the switches' edge.
func TestR6MacSavedRowsSayStored(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := pass3App(t, lang)
		app.openTab(TabAutofill)
		tt := ui.NewTesterWith(app.View, 1150, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		d513Frames(tt)
		dots, ok := tt.Find("••••••")
		if !ok {
			t.Fatalf("%s: the sign-ins show no dots: %q", lang, tt.Texts())
		}
		kept, ok := tt.Find(app.L.T("af.key.kept"))
		if !ok {
			t.Fatalf("%s: the keys show no %q: %q", lang, app.L.T("af.key.kept"), tt.Texts())
		}
		var sw ui.Rect
		for _, e := range tt.AccessAll() {
			if e.Role == ui.RoleSwitch && e.Name == app.L.T("af.keys.ask") {
				sw = e.Bounds
				break
			}
		}
		if sw.W == 0 {
			t.Fatalf("%s: no keys switch to measure against", lang)
		}
		if d := (dots.X + dots.W) - (sw.X + sw.W); d < -0.6 || d > 0.6 {
			t.Errorf("%s: the dots end %.1f from the keys switch's edge (%+v vs %+v)", lang, d, dots, sw)
		}
		if d := (kept.X + kept.W) - (sw.X + sw.W); d < -0.6 || d > 0.6 {
			t.Errorf("%s: 已存 ends %.1f from the keys switch's edge (%+v vs %+v)", lang, d, kept, sw)
		}
	}
}

// To-do sources' two choices are one column: every source's 新的来了 and
// 做完以后 tracks start and end on the same x (D589's one column).
func TestR6TodoChoicesShareOneColumn(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1400} {
			app := pass3App(t, lang)
			app.openTab(TabTodos)
			tt := ui.NewTesterWith(app.View, w, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			d513Frames(tt)
			var groups []ui.AccessInfo
			for _, e := range tt.AccessAll() {
				if e.Role == ui.RoleRadioGroup {
					groups = append(groups, e)
				}
			}
			if len(groups) < 4 || len(groups)%2 != 0 {
				t.Fatalf("%s %d: want two tracks per source, got %d", lang, w, len(groups))
			}
			for i := 0; i < len(groups); i += 2 {
				a, b := groups[i], groups[i+1]
				if a.Name != app.L.T("todos.new") || b.Name != app.L.T("todos.done") {
					t.Fatalf("%s %d: groups not paired as new/done: %q, %q", lang, w, a.Name, b.Name)
				}
				if dx := a.Bounds.X - b.Bounds.X; dx < -0.6 || dx > 0.6 {
					t.Errorf("%s %d: choices start %.1f apart: %+v vs %+v", lang, w, dx, a.Bounds, b.Bounds)
				}
				if dw := a.Bounds.W - b.Bounds.W; dw < -0.6 || dw > 0.6 {
					t.Errorf("%s %d: choices are %.1f apart in width: %+v vs %+v", lang, w, dw, a.Bounds, b.Bounds)
				}
			}
		}
	}
}

// A card's foot action ends its words—not its tap padding—on the switches'
// right edge; D582's "controls keep their padding" still holds (the row's
// padding takes the 8).
func TestR6FootActionsEndOnTheSwitchEdge(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1400} {
			app := pass3App(t, lang)
			app.openTab(TabAccounts)
			tt := ui.NewTesterWith(app.View, w, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			d513Frames(tt)
			var sw ui.Rect
			for _, e := range tt.AccessAll() {
				if e.Role == ui.RoleSwitch {
					sw = e.Bounds
					break
				}
			}
			if sw.W == 0 {
				t.Fatalf("%s %d: no switch to measure against", lang, w)
			}
			for _, label := range []string{app.L.T("card.stop", "OOMOL"), app.L.T("phone.stop")} {
				r, ok := tt.Find(label)
				if !ok {
					t.Fatalf("%s %d: no %q in %q", lang, w, label, tt.Texts())
				}
				// Find returns the row's button box: its text is its right padding inside.
				want := sw.X + sw.W + app.T.S2
				if d := (r.X + r.W) - want; d < -0.6 || d > 0.6 {
					t.Errorf("%s %d: %q's button ends %.1f from the switch edge + its padding: %+v (want right %.1f)", lang, w, label, d, r, want)
				}
			}
		}
	}
}

// A Space name stays whole in a rule row, and a long path is one line, cut in
// the middle (D604's Mac leftover).
func TestR6SpaceNamesWholeAndPathsCutInTheMiddle(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	name := wholeName("Nowledge Mem PR Babysitter Team Space")
	path := "/Users/someone/dev/ducter/.claude/worktrees/a-very-long-worktree-name/apps/desktop/internal/views"
	tt := ui.NewTesterWith(func(c *ui.Context) {
		ui.Column(c).Width(300).Padding(12, 12).Children(func() {
			app.editRow(c, editRowOpts{key: "address", label: "别的 agent 怎么找到它", values: []string{name}, can: false, last: false})
			app.editRow(c, editRowOpts{key: "folder", label: "Ducter 文件夹", values: []string{path}, can: false, last: true, mono: true})
		})
	}, 340, 260, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if got := wholeName("Nowledge Mem"); got != "Nowledge\u00a0Mem" {
		t.Errorf("a name's space is still a break: %q", got)
	}
	nr, ok := tt.Find("Nowledge Mem PR Babysitter Team Space")
	if !ok {
		t.Fatalf("the Space name didn't draw: %q", tt.Texts())
	}
	if nr.H > 30 {
		t.Errorf("the Space name wrapped (%+v): it must stay whole", nr)
	}
	pr, ok := tt.Find(path)
	if !ok {
		t.Fatalf("the path didn't draw: %q", tt.Texts())
	}
	if pr.H > 30 {
		t.Errorf("the long path wrapped (%+v): it must stay one line", pr)
	}
	if pr.W > 276.5 {
		t.Errorf("the long path runs past its row (%+v): it must be cut", pr)
	}
	if strings.Contains(path, "\u200b") {
		t.Error("the path grew zero-width breaks")
	}
}
