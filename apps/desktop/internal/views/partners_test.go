package views

import (
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D309: the one needs-you count across partners, whose name the window
// shows, the menu bar's line per other partner, and every look in both
// themes.
func TestD309Partners(t *testing.T) {
	s := store.New()
	a := New(s, theme.Pebble(), i18n.New(i18n.ZH))
	s.Apply(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter"})
	if a.manyPartners() || a.shownPartner() != nil || len(a.trayPartners()) != 0 {
		t.Fatal("one partner: nothing of partners shows")
	}
	s.Apply(protocol.ServerFrame{T: "partners", Shown: "default", Partners: []protocol.PartnerInfo{
		{ID: "default", Name: "Ducter", Look: "sand"},
		{ID: "p2", Name: "小家", Look: "sage", Asks: 2},
	}})
	if !a.manyPartners() || a.shownPartner().Look != "sand" {
		t.Fatal("two partners: the shown one is the default, on sand")
	}
	if n := a.WaitingCount(); n != 2 {
		t.Errorf("the other partner's own questions count here: %d", n)
	}
	tp := a.trayPartners()
	if len(tp) != 1 || tp[0].Label != "换到小家，有 2 件等你" {
		t.Errorf("menu bar line: %+v", tp)
	}
	if a.needsWho() != "小家" {
		t.Errorf("the notice names whose: %q", a.needsWho())
	}
	// A settings frame's name is the default's: it never renames another shown partner.
	s.Apply(protocol.ServerFrame{T: "welcome", Persona: "p2", PersonaName: "小家"})
	s.Apply(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "Ducter"}})
	if s.PersonaName != "小家" {
		t.Errorf("shown name: %q", s.PersonaName)
	}
	if a.defaultName() != "Ducter" {
		t.Errorf("default name: %q", a.defaultName())
	}
	for _, tk := range []*theme.Tokens{theme.Pebble(), theme.PebbleDark()} {
		for _, l := range protocol.PartnerLooks {
			if _, ok := tk.Looks[l]; !ok {
				t.Errorf("look %s missing", l)
			}
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, k := range []string{"partners.title", "partners.add", "partners.preview", "partners.look.plum"} {
			if v := L.T(k); v == k || strings.Contains(v, " · ") {
				t.Errorf("%s %s: %q", lang, k, v)
			}
		}
	}
}
