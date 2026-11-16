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

// D287: On hand pictured against a seeded demo core in one of its moments
// (apps/web/demo-onhand.ts, DEMO_STATE=author|quiet|one|busy|waiting, or the
// long day), at 900, 1280 and 1600 points:
//
//	DEMO_STATE=author DUCTER_PORT=7851 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-onhand.ts
//	DUCTER_ONHAND_URL=ws://127.0.0.1:7851/ws DUCTER_ONHAND_NAME=author DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=../../../../.shots/d287 go test ./internal/views -run OnHandShots
func TestOnHandShots(t *testing.T) {
	url := os.Getenv("DUCTER_ONHAND_URL")
	if url == "" {
		t.Skip("DUCTER_ONHAND_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	name := os.Getenv("DUCTER_ONHAND_NAME")
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.until("the board", func() bool { return len(h.app.S.Tasks) > 0 })
	h.app.Route = RouteOnHand
	for _, w := range []int{900, 1280, 1600} {
		h.tt.SetSize(w, 980)
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%d-%s.png", name, w, lang)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
