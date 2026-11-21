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
)

// D456: ⌃1–⌃9 count in the same order ‹ 3 / 9 › and ⌘⇧[ ⌘⇧] walk, and
// the keys list holds every key the app answers in its shortcuts.
func TestTaskNavOrderAndKeys(t *testing.T) {
	app, _ := sessApp(t, i18n.ZH)
	o := app.railOrder()
	if len(o) < 3 {
		t.Fatalf("the fixture has %d tasks on hand", len(o))
	}
	app.OpenTask(o[0])
	app.WalkTask(1)
	if app.TaskID != o[1] {
		t.Fatalf("⌘⇧] went to %s, want %s", app.TaskID, o[1])
	}
	// Every key the shortcuts answer is in the list, once.
	seen := map[string]int{}
	for _, g := range keymap {
		for _, r := range g.rows {
			seen[r.keys]++
			if app.L.T(r.words) == r.words {
				t.Errorf("%s has no words", r.words)
			}
		}
	}
	for _, k := range []string{"⌘K", "⌘N", "⌘1", "⌘2", "⌘3", "⌘Y", "⌘,", "⌃1–⌃9", "⌘/", "⌘⇧[ ⌘⇧]", "⌥⌘B", "⌘\r", "⌥\r", "⇧⌘\r"} {
		if seen[k] != 1 {
			t.Errorf("%q is listed %d times", k, seen[k])
		}
	}
}

// D456's Mac screens, zh and en, light and dark, against the heavy
// developer's six weeks (sessions_fixture_test.go):
//
//	DUCTER_TASKVIEW_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/taskview-456/after go test ./internal/views -run TaskviewShots
func TestTaskviewShots(t *testing.T) {
	if os.Getenv("DUCTER_TASKVIEW_SHOTS") == "" {
		t.Skip("DUCTER_TASKVIEW_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := sessApp(t, lang)
		items := sessItems(lang)
		tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string, dark bool) {
			t.Helper()
			tt.SetSize(1400, 900)
			tt.SetDark(dark)
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			paper := "light"
			if dark {
				paper = "dark"
			}
			f, err := os.Create(filepath.Join(dir, "mac-1400-"+string(lang)+"-"+paper+"-"+name+".png"))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		// ⌘K "compaction", the peek beside the list.
		app.Route = RouteOnHand
		app.OpenSwitcher()
		app.oh.swQuery = "compaction"
		tt.Frame()
		tt.Advance(300 * time.Millisecond)
		tt.Frame()
		q, _ := lastPast[protocol.PastReq](*sent)
		var hits []protocol.PastItem
		for _, it := range items {
			if strings.Contains(strings.ToLower(it.Title+it.Outcome), "compaction") {
				hits = append(hits, it)
			}
		}
		app.Receive(sessResult(hits, q.ID))
		app.Receive(sessSteps(lang, "s_compaction_pr"))
		for i, r := range app.palRows("compaction") {
			if r.kind == palPast && r.item.TaskID == "s_compaction_pr" {
				app.pal.at = i
			}
		}
		shot("k-peek", false)
		shot("k-peek", true)
		// A slip: "compactoin" still finds what is on hand.
		app.oh.swQuery = "compactoin"
		app.pal.at = 0
		shot("k-typo", false)
		app.palClose()
		// The opened task, its place among what is on hand in its bar.
		o := app.railOrder()
		app.OpenTask(o[min(2, len(o)-1)])
		shot("task", false)
		shot("task", true)
		// D457: the compact density, toggled by ⌘⇧D.
		tt.Key(ui.Cmd|ui.Shift, ui.KeyD)
		if !app.compact() {
			t.Fatalf("%s: ⌘⇧D makes the opened task compact", lang)
		}
		shot("task-compact", false)
		shot("task-compact", true)
		tt.Key(ui.Cmd|ui.Shift, ui.KeyD)
		if app.compact() {
			t.Fatalf("%s: ⌘⇧D again makes it comfortable", lang)
		}
		// 键盘 / Keyboard.
		app.keysOpen = true
		shot("keys", false)
		shot("keys", true)
		app.keysOpen = false
	}
}
