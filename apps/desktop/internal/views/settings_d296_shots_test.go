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

// D296: the panes Settings' polish covers, at 1280 and 900, against the
// demo core with the author's accounts laid over it (accountsSeed), plus
// the partner's word after a change (saidLine) on Accounts and
// Notifications:
//
//	DUCTER_PORT=7896 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7896/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=../../../../.shots/d296/after \
//	  go test ./internal/views -run SettingsD296Shots
func TestSettingsD296Shots(t *testing.T) {
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
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	seed := func() {
		f, err := protocol.DecodeServerFrame([]byte(accountsSeed))
		if err != nil {
			t.Fatal(err)
		}
		h.app.Receive(f)
		if st := h.app.S.Settings; st != nil {
			st.Proactive, st.ProactiveBy = "three", "user"
		}
	}
	shot := func(name string, w, hgt int, before func()) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		settle()
		seed()
		if before != nil {
			before()
		}
		for i := 0; i < 3; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(120 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%d-%s.png", name, w, lang)))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	h.until("settings", func() bool { return true })
	for _, tab := range []string{TabPartner, TabNotify, TabAccounts, TabChats, TabAutofill, TabLook, TabRun, TabAbout} {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		hgt := 1500
		if tab == TabAccounts || tab == TabPartner {
			hgt = 2300
		}
		shot("settings-"+tab, 1280, hgt, nil)
		shot("settings-"+tab, 900, hgt+400, nil)
	}
	// The partner's word after a change, a moment after it.
	h.app.openTab(TabAccounts)
	shot("said-accounts", 1280, 1300, func() {
		// Under the row that moved (the Mac walk of 0.0.98): the Slack bot's.
		for _, cv := range h.app.S.Connections {
			for _, w := range tilesOf(cv) {
				if w.Service == "slackbot" {
					h.app.say("watch:"+cv.ID+"|"+tileKey(w), h.app.L.T("said.watch.off", h.app.watchWhat("Slack bot", w.Account)))
				}
			}
		}
	})
	h.app.openTab(TabNotify)
	shot("said-notify", 1280, 1000, func() {
		h.app.say("default", h.app.L.T("said.default", h.app.L.T("partner.default.hour", 1)))
	})
}
