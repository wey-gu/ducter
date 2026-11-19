package views

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D293: the home's card lists its addresses with whether each answers; a
// worker's and a phone's say how they are connected and whether anyone in
// between can read it.
func TestReachOnDevices(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app := sheetApp(t, lang, "awake")
		w := sheetWorld("awake")
		w.Reach.Ways = []protocol.ReachWay{
			{Kind: "domain", URL: "https://hel.example", Primary: true, State: "down"}, // this app dials it: 在用
			{Kind: "tailnet", URL: "https://hel.tail5e21.ts.net", State: "up"},
			{Kind: "tunnel", URL: "https://ducter.example.org", State: "up"},
		}
		w.Devices[1].Via = &protocol.DeviceVia{Kind: "tailnet", Sealed: true}
		w.Reach.Clients[2].Via = &protocol.DeviceVia{Kind: "tunnel", Sealed: false}
		app.Receive(w)

		tt := sheetTester(app, 1280, 1400, true)
		// D398: folded at the card's foot, its summary the way; opened, the whole of it.
		for _, want := range []string{L.T("reach.how"), L.T("reach.via.tailnet")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: worker card misses %q in %q", lang, want, tt.Texts())
			}
		}
		if tt.HasText(L.T("reach.private")) {
			t.Fatalf("%s: the fold should start closed: %q", lang, tt.Texts())
		}
		sheet := &app.devState().card.sheet
		sheet.fold = "dev:dev_mac"
		tt.Frame()
		tt.Frame()
		if !tt.HasText(L.T("reach.private")) {
			t.Fatalf("%s: worker card's fold misses %q in %q", lang, L.T("reach.private"), tt.Texts())
		}
		app.devState().sel = "local"
		sheet.fold = "ways:local"
		tt.Frame()
		tt.Frame()
		for _, want := range []string{L.T("reach.ways.short"), L.T("reach.kind.tunnel"), "hel.tail5e21.ts.net", L.T("reach.state.here"), L.T("reach.note.tunnel")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: home card misses %q in %q", lang, want, tt.Texts())
			}
		}
		app.devState().sel, app.devState().selClient = "", "ph1"
		sheet.fold = "cl:ph1"
		tt.Frame()
		tt.Frame()
		if !tt.HasText(L.T("reach.open.cloudflare")) {
			t.Fatalf("%s: the iPhone through the tunnel should say Cloudflare can read it: %q", lang, tt.Texts())
		}
	}
}

// Against a demo core (scripted, three ways, a worker through the tailnet,
// an iPhone through the tunnel):
//
//	DUCTER_SHELL_URL=ws://127.0.0.1:7893/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=… go test ./internal/views -run ReachLiveShots
func TestReachLiveShots(t *testing.T) {
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
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetSize(1280, 1300)
	h.app.OpenDevices()
	h.until("devices", func() bool { return h.app.S.Reach != nil && len(h.app.S.Reach.Ways) > 0 })
	pick := func(name string, set func()) {
		set()
		for i := 0; i < 6; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		save(t, dir, fmt.Sprintf("mac-%s-%s.png", name, lang), h.tt)
	}
	d := h.app.devState()
	pick("home", func() { d.sel, d.selClient = "local", "" })
	for _, dv := range h.app.S.Devices {
		if !dv.Home {
			pick("worker", func() { d.sel, d.selClient = dv.ID, "" })
		}
	}
	for _, cl := range h.app.S.Reach.Clients {
		if cl.Name == "iPhone" {
			pick("iphone", func() { d.sel, d.selClient = "", cl.ID })
		}
	}
}
