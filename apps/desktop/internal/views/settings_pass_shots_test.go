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
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D365: the Settings pass. Every pane in the rail's order at 1280, full length, light or dark
// (DUCTER_SHOTS_DARK), against a demo core with the author's accounts laid over it:
//
//	DUCTER_PORT=7944 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PAST=1 bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7944/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/settings-pass/after> \
//	  go test ./internal/views -run SettingsPassShots
func TestSettingsPassShots(t *testing.T) {
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
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	seed := func() {
		if os.Getenv("DUCTER_SHOTS_SEED") == "0" {
			return
		}
		f, err := protocol.DecodeServerFrame([]byte(accountsSeed))
		if err != nil {
			t.Fatal(err)
		}
		h.app.Receive(f)
		if st := h.app.S.Settings; st != nil {
			st.Proactive, st.ProactiveBy = "three", "user"
		}
	}
	h.until("settings", func() bool { return true })
	for _, tab := range settingsTabs {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		hgt := 1400
		switch tab {
		case TabAccounts, TabPartner:
			hgt = 2400
		case TabMemory, TabAutofill, TabLook:
			hgt = 1800
		}
		h.tt.SetSize(1280, hgt)
		settle()
		seed()
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1280-%s-%s-%s.png", paper, lang, tab)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
