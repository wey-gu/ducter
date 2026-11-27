package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D633: On hand before and after the close-loop fix, at 1150 zh light, against
// apps/web/demo-close-loop.ts (CLOSE_LOOP_BEFORE=1 for the old board):
//
//	DUCTER_PORT=7611 DUCTER_DATA_DIR=<scratch> CLOSE_LOOP_BEFORE=1 DEMO_LANG=zh bun apps/web/demo-close-loop.ts
//	DUCTER_CLOSE_LOOP_URL=ws://127.0.0.1:7611/ws DUCTER_CLOSE_LOOP_SHOT=before \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/close-loop go test ./internal/views -run CloseLoopShots -v
func TestCloseLoopShots(t *testing.T) {
	url := os.Getenv("DUCTER_CLOSE_LOOP_URL")
	if url == "" {
		t.Skip("DUCTER_CLOSE_LOOP_URL not set")
	}
	name := os.Getenv("DUCTER_CLOSE_LOOP_SHOT")
	if name == "" {
		name = "before"
	}
	h := newLive(t, url, i18n.ZH)
	h.app.LocaleFixed, h.app.L = true, i18n.New(i18n.ZH)
	h.tt.SetScale(2)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.tt.SetSize(1150, 900)
	h.app.Route = RouteOnHand
	h.app.closeKeep()
	h.app.Local.SetFolded(doneOpenKey, true) // show today's results in the after shot
	h.app.Local.SetAppearance("light")
	h.until("on hand", func() bool { return h.app.S.OnHand != nil && len(h.app.S.OnHand.Tasks) > 0 })
	settle()
	d302Write(t, h.tt, "mac-onhand-"+name+"-1150-zh-light")
}
