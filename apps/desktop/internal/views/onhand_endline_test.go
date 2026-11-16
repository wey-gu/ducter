package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// research/109: on the real Mac at 1280 (the project column and the day
// beside the board), 做过的事 › and its neighbours sat as a third column
// past the window's right edge. They are On hand's last line, under the
// list (D285, D300), so they stay inside the window at every width.
func TestOnHandEndLineStaysInside(t *testing.T) {
	for _, w := range []int{1100, 1280, 1400, 1700} {
		app := v2App(t, i18n.EN, false)
		app.Route = RouteOnHand
		tt := ui.NewTesterWith(app.View, w, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		past, ok := tt.Find(app.L.T("past.link"))
		if !ok {
			t.Fatalf("%d: no %q on On hand: %q", w, app.L.T("past.link"), tt.Texts())
		}
		did, ok := tt.Find(app.L.T("did.link"))
		if !ok {
			t.Fatalf("%d: no %q on On hand", w, app.L.T("did.link"))
		}
		for _, r := range []ui.Rect{past, did} {
			if r.X < 0 || r.X+r.W > float32(w) {
				t.Errorf("%d: the last line runs out of the window: %+v", w, r)
			}
		}
		// Under the list, not beside it: below the strip of counts.
		strip, ok := tt.Find(app.L.T("lane.working"))
		if ok && past.Y <= strip.Y {
			t.Errorf("%d: %q is beside the board (y %.0f), not under it (strip y %.0f)", w, app.L.T("past.link"), past.Y, strip.Y)
		}
	}
}
