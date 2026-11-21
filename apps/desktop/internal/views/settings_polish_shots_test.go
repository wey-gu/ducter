package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D432: the Settings polish. Every pane in the rail's order at DUCTER_SHOTS_W (1400 by default),
// full length, light or dark (DUCTER_SHOTS_DARK), against the settings demo core:
//
//	DUCTER_PORT=7982 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-settings-real.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7982/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/settings-polish/after> \
//	  go test ./internal/views -run SettingsPolishShots   (DUCTER_SHOTS_TABS=memory,peers for some)
func TestSettingsPolishShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	w := 1400
	if v, err := strconv.Atoi(os.Getenv("DUCTER_SHOTS_W")); err == nil && v > 0 {
		w = v
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
		for i := 0; i < 10; i++ {
			h.tt.Frame()
			time.Sleep(120 * time.Millisecond)
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("settings", func() bool { return true })
	only := os.Getenv("DUCTER_SHOTS_TABS") // D459: e.g. "memory,peers"
	for _, tab := range settingsTabs {
		if only != "" && !strings.Contains(","+only+",", ","+tab+",") {
			continue
		}
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		hgt := 1500
		switch tab {
		case TabAccounts, TabPartner:
			hgt = 2600
		case TabMemory, TabAutofill, TabLook, TabChats:
			hgt = 2000
		}
		h.tt.SetSize(w, hgt)
		settle()
		switch tab {
		case TabTodos:
			h.until("sources", func() bool { return h.app.S.Sources != nil })
		case TabAutofill:
			h.until("saved", func() bool { return h.app.S.Saved != nil })
		}
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%d-%s-%s-%s.png", w, paper, lang, tab)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
