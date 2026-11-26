package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D584: the conversation and On hand at 1150 and 1400, light and dark, against a demo core
// (apps/web/demo.ts for the conversation, On hand and the decisions; demo-onhand.ts for many
// tasks; demo-file.ts for file cards; demo-older.ts for the day lines):
//
//	DUCTER_PORT=7941 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PAST=1 bun apps/web/demo.ts
//	DUCTER_D584_URL=ws://127.0.0.1:7941/ws DUCTER_D584_NAME=main DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/conv-r1/before/mac go test ./internal/views -run D584Shots
func TestD584Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D584_URL")
	if url == "" {
		t.Skip("DUCTER_D584_URL not set")
	}
	name := os.Getenv("DUCTER_D584_NAME")
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetScale(2)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	both := func(shot string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		settle()
		d302Both(t, h.app, h.tt, settle, name+"-"+shot+"-"+itoa(int64(w)), lang)
	}
	h.until("the conversation", func() bool { return len(h.app.S.Channel) > 0 })
	h.tt.Advance(time.Second)
	for _, w := range []int{1150, 1400} {
		h.app.Route = RouteConversation
		h.app.list.ScrollToEnd()
		both("conv-end", w, 900)
		if name == "main" || name == "old" {
			h.app.list.ScrollToEnd()
			both("conv-tall", w, 2600)
		}
		if name == "main" || name == "oh" {
			h.app.Route = RouteOnHand
			both("onhand", w, 900)
		}
		if name == "main" {
			for _, id := range []string{"t_flaky", "t_rebase"} {
				if h.app.S.Task(id) == nil {
					continue
				}
				h.app.OpenTask(id)
				both("task-"+id, w, 900)
			}
		}
	}
}
