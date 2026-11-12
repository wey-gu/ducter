package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D221's Mac screens against the seeded calendar demo core
// (scripts/readme-shots/calendar-demo.ts), zh and en:
//
//	DUCTER_CAL_URL=ws://127.0.0.1:7802/ws DUCTER_CAL_URL_EN=ws://127.0.0.1:7803/ws \
//	DUCTER_SHOTS_DIR=<repo>/.shots/calendar go test ./internal/views -run CalendarShots -v
//
// The Mac app is light only (design/ui.md: Midnight is planned), so there is
// one theme to shoot.
func TestCalendarShots(t *testing.T) {
	for _, tc := range []struct {
		env  string
		lang i18n.Lang
	}{{"DUCTER_CAL_URL", i18n.ZH}, {"DUCTER_CAL_URL_EN", i18n.EN}} {
		url := os.Getenv(tc.env)
		if url == "" {
			continue
		}
		t.Run(string(tc.lang), func(t *testing.T) { calendarShots(t, url, tc.lang) })
	}
	if os.Getenv("DUCTER_CAL_URL") == "" && os.Getenv("DUCTER_CAL_URL_EN") == "" {
		t.Skip("DUCTER_CAL_URL not set")
	}
}

func calendarShots(t *testing.T, url string, lang i18n.Lang) {
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetScale(2)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	s := h.app.S
	shot := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, "mac-"+name+"-"+string(lang)+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	h.until("the calendar cards", func() bool {
		cards := 0
		for _, e := range s.Channel {
			if e.AI != nil && e.AI.Cal != nil {
				cards++
			}
		}
		return cards >= 2 && s.Decisions["d_decline"] != nil && s.DecisionCalls["d_add"] != nil && s.DecisionCalls["d_add"].State == "done"
	})
	// The whole conversation, top to bottom; then a window's worth at its end.
	shot("conversation-all", 1280, 3400)
	shot("conversation", 1280, 900)

	// Settings › 账号: the first-time line under the tray, then a calendar tile open.
	h.app.openTab(TabAccounts)
	h.wait = 45 * time.Second // a fresh core lists the calendars through oo first
	h.until("calendars listed", func() bool {
		for _, cv := range s.Connections {
			for _, w := range tilesOf(cv) {
				if kindOf(w.Service) == "calendar" && w.Calendars != nil {
					return true
				}
			}
		}
		return false
	})
	shot("accounts", 1280, 1000)
	var oo protocol.ConnectionView
	for _, cv := range s.Connections {
		if cv.Source == "oo" {
			oo = cv
		}
	}
	for _, w := range tilesOf(oo) {
		if kindOf(w.Service) == "calendar" && strings.Contains(w.Account, "gmail") {
			h.app.cards().tile[oo.ID] = tileKey(w)
		}
	}
	shot("accounts-calendar", 1280, 1400)

	// Gmail with no calendar: the nudge, on a copy of the card holding only Gmail.
	h.app.cards().tile[oo.ID] = ""
	only := oo
	only.ID = oo.ID + "-mail"
	if oo.Look != nil {
		look := *oo.Look
		look.Apps = nil
		for _, w := range oo.Look.Apps {
			if w.Service == "gmail" {
				look.Apps = append(look.Apps, w)
			}
		}
		only.Look = &look
	}
	only.Apps = nil
	for _, ap := range oo.Apps {
		if ap.Service == "gmail" {
			only.Apps = append(only.Apps, ap)
		}
	}
	s.Connections = []protocol.ConnectionView{only}
	shot("accounts-nudge", 1280, 1000)

	// The greeting with today's line: the empty conversation over this home's first screen.
	h.app.Route = RouteConversation
	h.until("today's line", func() bool { return s.First != nil && s.First.Today != nil })
	s.Channel = nil
	shot("greeting", 1280, 900)
}
