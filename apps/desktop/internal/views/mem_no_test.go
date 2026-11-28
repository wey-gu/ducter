package views

// D669 (#4): Mem's no reaches the person, on the Mac. 去 Nowledge Mem 看 opens the app where
// Mem lives (the site only for Cloud, a server's label names the computer); a stuck mailbox's code
// is a fact behind 详情, never the line. The web has the twin rules (apps/web/test/mem-no.test.ts).

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func memNoTester(app *App) *ui.Tester {
	tt := ui.NewTesterWith(app.View, 1150, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	for i := 0; i < 6; i++ {
		tt.Advance(80 * time.Millisecond)
		tt.Frame()
	}
	return tt
}

func TestMemNoAppLink(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, tc := range []struct {
			name  string
			where string
			link  string
			site  bool
		}{
			{name: "cloud", where: "cloud", link: L.T("mem.all.open"), site: true},
			{name: "local", where: "local", link: L.T("mem.all.open"), site: false},
			{name: "server", where: "server", link: L.T("mem.all.open.server", "hel"), site: false},
		} {
			app, sent := memApp(t, lang, "on")
			app.S.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel", Version: "0.10.121", Where: tc.where}
			opened := []string{}
			app.OpenExternal = func(u string) error { opened = append(opened, u); return nil }
			app.openTab(TabMemory)
			tt := memNoTester(app)
			if _, ok := tt.Find(tc.link); !ok {
				t.Fatalf("%s %s: no %q in %q", lang, tc.name, tc.link, tt.Texts())
			}
			if err := tt.Click(tc.link); err != nil {
				t.Fatalf("%s %s: %v", lang, tc.name, err)
			}
			tt.Frame()
			if tc.site {
				if len(opened) != 1 || opened[0] != memSite {
					t.Fatalf("%s %s: opened %v", lang, tc.name, opened)
				}
				if a, ok := lastSent[protocol.BridgeAction](*sent); ok {
					t.Fatalf("%s %s: a site link sent %#v", lang, tc.name, a)
				}
			} else {
				if len(opened) != 0 {
					t.Fatalf("%s %s: the site opened %v", lang, tc.name, opened)
				}
				if a, ok := lastSent[protocol.BridgeAction](*sent); !ok || a.T != "bridge_mem_open" {
					t.Fatalf("%s %s: sent %#v", lang, tc.name, *sent)
				}
			}
		}
		// A status that didn't say where: no link at all, never the wrong place.
		app, _ := memApp(t, lang, "on")
		app.S.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel"}
		app.openTab(TabMemory)
		tt := memNoTester(app)
		if _, ok := tt.Find(L.T("mem.all.open")); ok {
			t.Errorf("%s: a link with no known place: %q", lang, tt.Texts())
		}
	}
}

func TestMemNoStuckCodeBehindDetails(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, _ := memApp(t, lang, "on")
		code := "cloud_mailbox_own_source_unreconciled"
		app.S.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel", Stuck: &protocol.BridgeStuck{Code: code}}
		app.openTab(TabPeers)
		tt := memNoTester(app)
		if hasText(tt, code) {
			t.Fatalf("%s: the code is the line: %q", lang, tt.Texts())
		}
		if !hasText(tt, L.T("peers.stuck.line", "小鸭")) && !hasText(tt, L.T("peers.stuck.line", "Duckie")) {
			t.Fatalf("%s: no stuck line: %q", lang, tt.Texts())
		}
		if err := tt.Click(L.T("mem.details")); err != nil {
			t.Fatalf("%s: no 详情: %v", lang, err)
		}
		tt.Frame()
		if !hasText(tt, code) {
			t.Fatalf("%s: 详情 does not carry the code: %q", lang, tt.Texts())
		}
	}
}
