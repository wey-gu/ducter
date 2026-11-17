package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D312: On hand lists another partner's own questions (never the shown
// one's, which are in its conversation), and only with more than one partner.
func TestD312OtherAsks(t *testing.T) {
	s := store.New()
	a := New(s, theme.Pebble(), i18n.New(i18n.ZH))
	s.Apply(protocol.ServerFrame{T: "welcome", Persona: "p2", PersonaName: "小家"})
	asks := []protocol.PartnerAsk{{Persona: "default", DecisionID: "d1", Question: "明早的站会挪到十点吗？"}, {Persona: "p2", DecisionID: "d2", Question: "约周六 9:30 吗？"}}
	s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Asks: asks}})
	if len(a.otherAsks()) != 0 {
		t.Fatal("one partner known: nothing listed")
	}
	s.Apply(protocol.ServerFrame{T: "partners", Shown: "p2", Partners: []protocol.PartnerInfo{
		{ID: "default", Name: "Ducter", Look: "sand", Asks: 1},
		{ID: "p2", Name: "小家", Look: "sage", Asks: 1},
	}})
	got := a.otherAsks()
	if len(got) != 1 || got[0].DecisionID != "d1" {
		t.Fatalf("the other partner's own question only: %+v", got)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		if v := i18n.New(lang).T("partners.asks.from", "Ducter"); v == "partners.asks.from" {
			t.Errorf("%s: no words", lang)
		}
	}
}

// D312: the second partner answering, and On hand with its stones, against
// the demo core:
//
//	DUCTER_PORT=7915 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PARTNERS=1 bun apps/web/demo.ts
//	DUCTER_D312_URL=ws://127.0.0.1:7915/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<repo>/.shots/d312 \
//	  go test ./internal/views -run D312Shots
func TestD312Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D312_URL")
	if url == "" {
		t.Skip("DUCTER_D312_URL not set")
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
	h.until("partners", func() bool { return len(h.app.S.Partners) > 1 })
	h.app.SwitchPartner("p2")
	h.until("the home partner", func() bool { return h.app.S.Welcomed && h.app.S.Persona == "p2" && len(h.app.S.Partners) > 1 })
	h.tt.SetSize(1280, 900)
	words := map[i18n.Lang]string{i18n.ZH: "那就约 9:30 吧", i18n.EN: "Let's do 9:30"}[lang]
	h.app.SendMessage(words)
	h.until("its answer", func() bool {
		for _, e := range h.app.S.Channel {
			if e.AI != nil && strings.Contains(e.AI.Text, map[i18n.Lang]string{i18n.ZH: "我是", i18n.EN: "I'm"}[lang]) {
				return true
			}
		}
		h.tt.Advance(200 * time.Millisecond)
		return false
	})
	d302Both(t, h.app, h.tt, settle, "home-answers-1280", lang)
	// On hand: the default's own question listed with its stone; the home task carries its stone.
	h.app.Route = RouteOnHand
	d302Both(t, h.app, h.tt, settle, "home-onhand-1280", lang)
}
