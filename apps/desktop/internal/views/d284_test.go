package views

// D284: Ducter's own lines never read as the person's bubbles (a Go
// relayed is a quiet chip, its notes hairlines), the locator lists only
// what people said with the rest collapsed, and a click on it glides to
// the turn, which wears a clay tint that fades.

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

func TestOldRelaysReadAsChips(t *testing.T) {
	app, tt, id := fixtureTask(t, "a phone task's old relays, from the user (zh)", protocol.Done, true)
	app.taskList(id).ScrollTo(0, ui.Start)
	for i := 0; i < 4; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	got := texts(tt)
	for _, want := range []string{"你点了「好，Done」", "你点了「好，Continue」", "你点了「好」", "你让它停下了", "热启动不用录了，收尾吧"} {
		if !strings.Contains(got, want) {
			t.Errorf("no %q in %q", want, got)
		}
	}
	for _, never := range []string{"The user stopped you", "The user says they're done", "Recording Pixel Fold", "User says Go"} {
		if strings.Contains(got, never) {
			t.Errorf("Ducter's own words %q show as said: %q", never, got)
		}
	}
	// The locator: the brief, the person's words, and the five quiet items between them as one muted line.
	entries := app.locatorEntries(app.S.Task(id), app.memoOf(app.S.Task(id)).turns)
	var lines []string
	for _, e := range entries {
		lines = append(lines, e.line)
	}
	if len(entries) != 3 || entries[0].quiet || !entries[1].quiet || entries[2].quiet || !strings.HasPrefix(entries[1].line, "5 条提示 · ") || entries[2].line != "热启动不用录了，收尾吧" {
		t.Fatalf("locator: %q", lines)
	}
	if !hoverLocator(app, tt) {
		t.Fatal("no locator")
	}
	if !strings.Contains(texts(tt), "5 条提示") {
		t.Errorf("the quiet run is not listed: %q", texts(tt))
	}
}

// openLong opens a 600-event task, all of its history loaded, at its end.
func openLong(t *testing.T, reduce bool) (*App, *ui.Tester) {
	t.Helper()
	evs := longTask(600, "long1")
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.LocaleFixed = true
	tt := ui.NewTesterWith(app.View, 1280, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: reduce}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask("long1")
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: "long1", Events: evs})
	for i := 0; i < 6; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	return app, tt
}

func TestLocatorGlides(t *testing.T) {
	for _, reduce := range []bool{false, true} {
		app, tt := openLong(t, reduce)
		task := app.S.Task("long1")
		turns := app.memoOf(task).turns
		entries := app.locatorEntries(task, turns)
		if !hoverLocator(app, tt) {
			t.Fatal("no locator")
		}
		line := autospace(entries[0].line)
		if err := tt.Click(line); err != nil {
			t.Fatalf("reduce=%v: %v (%q)", reduce, err, texts(tt))
		}
		// The first row in view, frame by frame: an eased run of rows that rests on the turn.
		var firsts []int
		for i := 0; i < 40; i++ {
			tt.Advance(16 * time.Millisecond)
			tt.Frame()
			first, _ := app.taskList("long1").Visible()
			firsts = append(firsts, first)
		}
		if firsts[len(firsts)-1] != 1 {
			t.Fatalf("reduce=%v: it didn't arrive at the first turn: %v", reduce, firsts)
		}
		steps := 0
		for i := 1; i < len(firsts); i++ {
			if firsts[i] != firsts[i-1] {
				steps++
			}
		}
		if !reduce && steps < 6 {
			t.Errorf("no glide: %v", firsts)
		}
		if reduce && steps != 0 {
			t.Errorf("reduced motion still moves: %v", firsts)
		}
		if f := app.tpage.flash; f.seq != turns[0].Seq || f.task != "long1" {
			t.Errorf("reduce=%v: the turn gone to is not tinted: %+v", reduce, f)
		}
	}
}

// D284's shots, with DUCTER_SHOTS_DIR set: the old relays as chips and
// hairlines, the locator with its quiet line, a jump on its way and
// arrived with its tint, and a long task's first paint.
func TestD284Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	shot := func(tt *ui.Tester, name string) {
		t.Helper()
		f, err := os.Create(filepath.Join(dir, "mac-"+name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	app, tt, id := fixtureTask(t, "a phone task's old relays, from the user (zh)", protocol.Done, true)
	app.taskList(id).ScrollTo(1, ui.Start)
	for i := 0; i < 4; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	shot(tt, "relays-chips-zh")
	hoverLocator(app, tt)
	for i := 0; i < 4; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	shot(tt, "relays-locator-zh")

	app, tt = openLong(t, false)
	shot(tt, "long-first-paint-zh")
	hoverLocator(app, tt)
	for i := 0; i < 4; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	shot(tt, "long-locator-zh")
	task := app.S.Task("long1")
	entries := app.locatorEntries(task, app.memoOf(task).turns)
	_ = tt.Click(autospace(entries[len(entries)/3].line))
	for i := 0; i < 8; i++ {
		tt.Advance(16 * time.Millisecond)
		tt.Frame()
	}
	shot(tt, "long-jump-gliding-zh")
	for i := 0; i < 24; i++ {
		tt.Advance(16 * time.Millisecond)
		tt.Frame()
	}
	shot(tt, "long-jump-tint-zh")
}
