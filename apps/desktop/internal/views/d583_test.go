package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// TestD583RemoveRestsInsideChange: a partner's row at rest offers 换到 and 改一下
// only; 移除 is in the open row (never the default's), and asks in place.
func TestD583RemoveRestsInsideChange(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		ps := d568Partners(lang)
		app, _ := d568App(t, lang, ps, "default")
		_, tt := figsOf(t, app, TabPartner)
		remove := func(name string) int {
			return countAccess(tt, ui.RoleButton, spoken(app.L, app.L.T("partners.remove"), name))
		}
		for _, p := range ps {
			if n := remove(p.Name); n != 0 {
				t.Fatalf("%s: %s offers Remove at rest (%d)", lang, p.Name, n)
			}
		}
		app.partners.editing, app.partners.editName = "default", "Ducter"
		d513Frames(tt)
		if n := remove("Ducter"); n != 0 {
			t.Errorf("%s: the default partner can't be removed, found %d", lang, n)
		}
		app.partners.editing, app.partners.editName = "p2", ps[1].Name
		d513Frames(tt)
		if n := remove(ps[1].Name); n != 1 {
			t.Fatalf("%s: the open row holds one Remove, found %d: %q", lang, n, tt.Texts())
		}
		if err := tt.Click(spoken(app.L, app.L.T("partners.remove"), ps[1].Name)); err != nil {
			t.Fatal(err)
		}
		d513Frames(tt)
		if app.partners.removing != "p2" || app.partners.editing != "" {
			t.Errorf("%s: Remove asks in place and closes the row (removing %q, editing %q)", lang, app.partners.removing, app.partners.editing)
		}
		if !hasText(tt, app.L.T("partners.remove.ask", ps[1].Name)) {
			t.Errorf("%s: no ask after Remove: %q", lang, tt.Texts())
		}
	}
}
