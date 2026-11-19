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

// D388: 怎么知道的 open on a contradiction, a quota and the follow-up that
// filled the time, in the Mac app against the demo core, light and dark:
//
//	DUCTER_PORT=7799 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-aha.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7799/ws DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=../../../../.shots/proactive-aha go test ./internal/views -run D388LiveShots
func TestD388LiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 15; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("asks", func() bool { return len(h.app.S.OpenDecisions()) >= 2 })
	for _, id := range []string{"f_contra", "f_quota", "f_fill"} {
		h.app.open["how:"+id] = true
	}
	for _, dark := range []bool{false, true} {
		h.tt.SetDark(dark)
		h.tt.SetSize(1180, 1400)
		h.app.Route = RouteConversation
		settle()
		paper := "light"
		if dark {
			paper = "dark"
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-conversation-%s-%s.png", lang, paper)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
