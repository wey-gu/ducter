package views

// D654 (research/245 §3.2): On hand with hel's shape (apps/web/demo-projects.ts), at 1400 and
// 1000, zh and en, light and dark. A live run only:
//
//	DUCTER_PORT=7823 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-projects.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7823/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/projects/after> \
//	  go test ./internal/views -run ProjectsShots -count=1
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

func TestProjectsShots(t *testing.T) {
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
	h.app.Route = RouteOnHand
	for _, w := range []int{1400, 1000} {
		h.tt.SetSize(w, 1100)
		h.tt.Move(2, 2)
		settle()
		shoot(fmt.Sprintf("mac-%d-%s-%s-%s.png", w, name, lang, paper))
	}
}
