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

// D511: 在照看的 / Looking after on On hand, and each Keep's own page
// (apps/web/demo-d511.ts), at 1400 and 1000. A live run only:
//
//	DUCTER_PORT=7511 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d511.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7511/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/d511-built> \
//	  [DUCTER_SHOTS_DARK=1] go test ./internal/views -run D511Shots -count=1
func TestD511Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil && len(h.app.S.OnHand.Keeps) > 0 })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 10; i++ {
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
	names := []string{"babysitter", "review", "flight"}
	for _, w := range []int{1400, 1000} {
		h.tt.SetSize(w, 1400)
		h.tt.Move(2, 2)
		h.app.closeKeep()
		h.app.Route = RouteOnHand
		settle()
		shoot(fmt.Sprintf("mac-onhand-%d-%s-%s.png", w, lang, paper))
		for i, k := range h.app.S.OnHand.Keeps {
			if i >= len(names) {
				break
			}
			id := k.ID
			name := names[i]
			// The sheets stand what asks first; name each by what it is.
			switch {
			case k.Run == "perItem":
				name = "babysitter"
			case k.Run == "same":
				name = "review"
			case k.Run == "fresh":
				name = "flight"
			}
			h.app.openKeep(id)
			h.until("page", func() bool { return h.app.S.KeepPages[id] != nil })
			settle()
			shoot(fmt.Sprintf("mac-page-%s-%d-%s-%s.png", name, w, lang, paper))
		}
	}
	h.app.closeKeep()
}
