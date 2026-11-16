package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D307: every Settings pane, and Devices with the home's card, at 1280 and
// 900, light and dark, against the demo core:
//
//	DUCTER_PORT=7907 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_D307_URL=ws://127.0.0.1:7907/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<repo>/.shots/d307 \
//	  go test ./internal/views -run D307
func TestD307SettingsShots(t *testing.T) {
	url := os.Getenv("DUCTER_D307_URL")
	if url == "" {
		t.Skip("DUCTER_D307_URL not set")
	}
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
	both := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		d302Both(t, h.app, h.tt, settle, name+"-"+itoa(int64(w)), lang)
	}
	h.until("settings", func() bool { return true })
	for _, tab := range settingsTabs {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		hgt := 1500
		if tab == TabAccounts || tab == TabPartner {
			hgt = 2600
		}
		both("settings-"+tab, 1280, hgt)
		both("settings-"+tab, 900, hgt+400)
	}
	// The key row open, in Settings and on the home's card.
	h.app.openTab(TabPartner)
	h.app.openKeyRow("settings")
	both("settings-partner-keyopen", 1280, 2800)
	h.app.OpenDevices()
	h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
	both("devices", 1280, 1000)
	h.app.openKeyRow("devices")
	both("devices-keyopen", 1280, 1100)
	both("devices-keyopen", 900, 1200)
}
