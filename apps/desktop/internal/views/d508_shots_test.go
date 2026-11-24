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
)

// D508: On hand with tasks under their PRs (apps/web/demo-d508.ts), at 1400
// and 1000, the board at rest and with the pointer on a PR row. A live run only:
//
//	DUCTER_PORT=7508 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d508.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7508/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d508/after> \
//	  [DUCTER_SHOTS_DARK=1] [DUCTER_SHOTS_NAME=after] go test ./internal/views -run D508Shots -count=1
func TestD508Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	name := os.Getenv("DUCTER_SHOTS_NAME")
	if name == "" {
		name = "after"
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	shoot := func(file string) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, h.tt.Image())
		f.Close()
	}
	h.app.Route = RouteOnHand
	h.app.Local.SetFolded(doneOpenKey, true) // the results you have seen, unfolded (main folds all six)
	for _, w := range []int{1400, 1000} {
		h.tt.SetSize(w, 1300)
		h.tt.Move(2, 2)
		settle()
		shoot(fmt.Sprintf("mac-%s-%d-%s-%s.png", name, w, lang, paper))
		// The pointer on the draft PR's row (its title's start), as the author's screenshot had it.
		if r, ok := h.tt.Find(findAny(h.tt.Texts(), "Thread search")); ok {
			h.tt.Move(r.X+20, r.Y+r.H/2)
		}
		settle()
		shoot(fmt.Sprintf("mac-%s-%d-%s-%s-hover.png", name, w, lang, paper))
	}
}

// findAny is the first text that starts with prefix.
func findAny(texts []string, prefix string) string {
	for _, s := range texts {
		if len(s) >= len(prefix) && s[:len(prefix)] == prefix {
			return s
		}
	}
	return prefix
}
