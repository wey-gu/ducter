package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D513: the list of partners at the conversation's left (1, 2 and 4
// partners), at 1400 and 1000, light and dark, and Settings › 伙伴's rows
// (the colour picker) at 1000, against a demo core:
//
//	DUCTER_PORT=7933 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PARTNERS=1 DEMO_PARTNER_NEW=1 DEMO_PARTNER_FOUR=1 bun apps/web/demo.ts
//	DUCTER_D513_URL=ws://127.0.0.1:7933/ws DUCTER_D513_NAME=after-4p DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/partners-switch go test ./internal/views -run D513
func TestD513PartnersShots(t *testing.T) {
	url := os.Getenv("DUCTER_D513_URL")
	if url == "" {
		t.Skip("DUCTER_D513_URL not set")
	}
	name := os.Getenv("DUCTER_D513_NAME")
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
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
		d302Both(t, h.app, h.tt, settle, name+"-"+shot+"-"+itoa(int64(w)), lang)
	}
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.Partners != nil })
	for _, w := range []int{1400, 1000} {
		both("conv", w, 900)
	}
	if len(h.app.S.Partners) > 1 {
		h.app.openTab(TabPartner)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		both("settings", 1000, 1500)
	}
}
