package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D309, D486: the conversation with two partners (each shown, passed words
// marked), and Settings ›
// 伙伴 with 伙伴们 and the add form, at 1280, light and dark, against the
// demo core with a second partner:
//
//	DUCTER_PORT=7913 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_PARTNERS=1 bun apps/web/demo.ts
//	DUCTER_D309_URL=ws://127.0.0.1:7913/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<repo>/.shots/d309 \
//	  go test ./internal/views -run D309
func TestD309PartnersShots(t *testing.T) {
	url := os.Getenv("DUCTER_D309_URL")
	if url == "" {
		t.Skip("DUCTER_D309_URL not set")
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
	h.until("partners", func() bool { return len(h.app.S.Partners) > 1 })
	both("conv-default", 1280, 860)
	h.app.SwitchPartner("p2")
	h.until("the home partner", func() bool { return h.app.S.Welcomed && h.app.S.Persona == "p2" && len(h.app.S.Partners) > 1 })
	both("conv-home", 1280, 860)
	// D497: a partner made but never talked to (DEMO_PARTNER_NEW=1): its first meeting.
	if h.app.partnerByID("p3") != nil {
		h.app.SwitchPartner("p3")
		h.until("the new partner", func() bool {
			return h.app.S.Welcomed && h.app.S.Persona == "p3" && len(h.app.S.Partners) > 1 && h.app.S.First != nil
		})
		both("conv-new", 1280, 860)
	}
	h.app.SwitchPartner("default")
	h.until("back", func() bool { return h.app.S.Welcomed && h.app.S.Persona == "default" && len(h.app.S.Partners) > 1 })
	h.app.openTab(TabPartner)
	h.until("settings", func() bool { return h.app.S.Settings != nil })
	h.app.partners.adding, h.app.partners.look, h.app.partners.name = true, "sky", map[i18n.Lang]string{i18n.ZH: "小米", i18n.EN: "Mia"}[lang]
	both("settings-partners", 1280, 1400)
	// D486: what each looks after under its name, and a removal asked in its own row.
	h.app.partners.adding, h.app.partners.removing = false, "p2"
	both("settings-remove", 1280, 1400)
}
