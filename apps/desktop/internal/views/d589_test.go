package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// TestD589TalkingSitsWithTheActions: the partner you're talking with says 正在聊 where the others
// have 换到, as the shared state word on the actions' line: its 改一下 shares that line, and its
// actions start on the same edge as every other row's.
func TestD589TalkingSitsWithTheActions(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		ps := d568Partners(lang)
		app, _ := d568App(t, lang, ps, "p4")
		_, tt := figsOf(t, app, TabPartner)
		talk, ok := tt.Find(app.L.T("partners.talking"))
		if !ok {
			t.Fatalf("%s: no %q in %q", lang, app.L.T("partners.talking"), tt.Texts())
		}
		sw, ok := tt.Find(app.L.T("partners.switch", ps[1].Name))
		if !ok {
			t.Fatalf("%s: no switch button", lang)
		}
		if d := talk.X - sw.X; d < -14 || d > 14 {
			t.Errorf("%s: 正在聊 at x %.0f, the other rows' 换到 at %.0f: one edge for every row's actions", lang, talk.X, sw.X)
		}
		// The row's 改一下 sits on the tag's line.
		mid := talk.Y + talk.H/2
		near := false
		var ys []float32
		for _, e := range tt.AccessAll() {
			if e.Role == ui.RoleButton && asSaid(e.Name) == asSaid(app.L.T("partners.change")) {
				ys = append(ys, e.Bounds.Y)
				if e.Bounds.Y <= mid && mid <= e.Bounds.Y+e.Bounds.H {
					near = true
				}
			}
		}
		if !near {
			t.Errorf("%s: 正在聊 (y %.0f) not on a line with 改一下 (%v)", lang, talk.Y, ys)
		}
	}
}
