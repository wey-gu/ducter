package views

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D309: the one needs-you count across partners, whose name the window
// shows, the menu bar's line per other partner, and every look in both
// themes. D486: what a partner looks after, its removal and passed words on
// the wire.
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
	// D517: the count is On hand's items: another partner's questions as the home lists them there.
	s.Apply(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Asks: []protocol.PartnerAsk{
		{Persona: "p2", DecisionID: "d1", Question: "约周六 9:30 吗？"},
		{Persona: "p2", DecisionID: "d2", Question: "要带疫苗本吗？"},
	}}})
	if !a.manyPartners() || a.shownPartner().Look != "sand" {
		t.Fatal("two partners: the shown one is the default, on sand")
	}
	if n := a.WaitingCount(); n != 2 {
		t.Errorf("the other partner's own questions count here: %d", n)
	}
	tp := a.trayPartners()
	if len(tp) != 1 || tp[0].Label != "换到小家，有 2 个待你处理" {
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
		for _, k := range []string{"partners.title", "partners.add", "partners.say", "partners.look.plum", "partners.remove.what", "partners.passed"} {
			if v := L.T(k); v == k || strings.Contains(v, " · ") {
				t.Errorf("%s %s: %q", lang, k, v)
			}
		}
	}
	// D486: "" clears what it looks after; a removal names the partner; passed words say who passed them.
	empty := ""
	for _, c := range []struct {
		v    any
		want string
	}{
		{protocol.PartnerSet{T: "partner_set", ID: "p2", About: &empty}, `{"t":"partner_set","id":"p2","about":""}`},
		{protocol.PartnerSet{T: "partner_set", ID: "p2", Look: "sky"}, `{"t":"partner_set","id":"p2","look":"sky"}`},
		{protocol.PartnerRemove{T: "partner_remove", ID: "p2"}, `{"t":"partner_remove","id":"p2"}`},
	} {
		if b, _ := json.Marshal(c.v); string(b) != c.want {
			t.Errorf("wire: %s, want %s", b, c.want)
		}
	}
	var um protocol.UserMsg
	if err := json.Unmarshal([]byte(`{"text":"周六提醒我","passed":{"from":"default"}}`), &um); err != nil || um.Passed == nil || um.Passed.From != "default" {
		t.Errorf("passed: %+v %v", um, err)
	}
	var pi protocol.PartnerInfo
	if err := json.Unmarshal([]byte(`{"id":"p2","name":"小家","look":"sage","asks":0,"about":"家里的事"}`), &pi); err != nil || pi.About != "家里的事" {
		t.Errorf("about: %+v %v", pi, err)
	}
}
