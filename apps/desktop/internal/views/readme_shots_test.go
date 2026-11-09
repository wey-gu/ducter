package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// The README's desktop pictures, rendered headless at 2x against the seeded demo core
// (scripts/readme-shots/demo.ts), so they don't depend on the window being visible:
//
//	DUCTER_README_URL=ws://127.0.0.1:7797/ws DUCTER_README_CWD=<the demo's DEMO_WORKTREE parent of "~"> \
//	DUCTER_SHOTS_DIR=~/dev/ducter-evidence/readme/raw \
//	  go test ./internal/views -run ReadmeShots -v
func TestReadmeShots(t *testing.T) {
	url := os.Getenv("DUCTER_README_URL")
	if url == "" {
		t.Skip("DUCTER_README_URL not set")
	}
	dir := shotsDir(t)
	// The demo records its fixture's worktree as "~/.ducter/worktrees/t_flaky", relative to
	// this folder, so the opened task shows a path like a real one.
	if d := os.Getenv("DUCTER_README_CWD"); d != "" {
		t.Chdir(d)
	}
	h := newLive(t, url, i18n.EN)
	h.app.LocaleFixed = true
	h.tt.SetScale(2)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	s := h.app.S
	shot := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	click := func(label string) {
		t.Helper()
		if err := h.tt.Click(label); err != nil {
			t.Fatalf("click %q: %v; texts %q", label, err, h.tt.Texts())
		}
	}

	// The conversation, with the finished result's Details open.
	h.until("the result", func() bool { return s.Task("t_flaky") != nil && len(s.Channel) > 0 })
	h.tt.Advance(time.Second)
	click("Details")
	shot("conversation", 1280, 820)

	h.app.Route = RouteOnHand
	shot("onhand", 1280, 820)

	h.app.OpenTask("t_flaky")
	h.until("history", func() bool { return s.Task("t_flaky").HistoryLoaded })
	shot("task", 1280, 820)
	// The whole task, one column, with one file's diff open (D74: diffs on demand).
	h.tt.SetSize(1280, 1700)
	h.tt.Advance(time.Second)
	click("crates/storage/tests/compaction.rs")
	shot("task-diff", 1280, 1700)

	h.app.OpenDevices()
	h.until("devices", func() bool { return len(s.Devices) > 0 })
	shot("devices", 1280, 900)

	h.app.OpenPartner()
	h.until("settings", func() bool { return s.Settings != nil })
	shot("partner", 1280, 1100)
}
