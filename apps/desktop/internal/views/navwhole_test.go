package views

import (
	"math"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// A page on its way stands on whole points every frame (wholeSteps), so
// MyGo draws it as at rest, its translation folded, not resampled. MyGo
// moves a pose by from + (to-from)·ease in float64 and places it about the
// element's middle in float32, which takes the last millionths away: the
// curve need only land within them. Its way stays the spring's, and it ends
// where the spring comes to stand on its end.
func TestNavWholeSteps(t *testing.T) {
	nav := theme.Pebble().Nav
	springs := map[string]ui.Animation{"push": nav.Push, "across": nav.Across}
	for _, d := range []float32{nav.Depth, nav.Shift, 1} {
		for name, an := range springs {
			w := wholeSteps(an, -d)
			if w.Duration <= 0 || w.Ease == nil {
				t.Fatalf("%s over %v: no curve", name, d)
			}
			if w.Duration > an.Spring.SettleTime() {
				t.Errorf("%s over %v: %v, longer than the spring's %v", name, d, w.Duration, an.Spring.SettleTime())
			}
			for i := 0; i <= 1000; i++ {
				k := float32(i) / 1000
				e := float64(w.Ease(k))
				moved := float64(d) * e
				if math.Abs(moved-math.Round(moved)) > 2e-6 {
					t.Fatalf("%s over %v at %v: %v points, between them", name, d, k, moved)
				}
				want := an.Spring.Progress(time.Duration(float64(w.Duration) * float64(k)))
				if math.Abs((e-want)*float64(d)) > 0.5+1e-6 {
					t.Fatalf("%s over %v at %v: %v points from the spring's place", name, d, k, (e-want)*float64(d))
				}
			}
			if w.Ease(1) != 1 {
				t.Errorf("%s over %v ends at %v", name, d, w.Ease(1))
			}
			// Past its end the spring stays within half a point of it.
			for at := w.Duration; at <= an.Spring.SettleTime(); at += time.Millisecond {
				if p := an.Spring.Progress(at); math.Abs(1-p)*float64(d) >= 0.5 {
					t.Fatalf("%s over %v: at %v the spring is %v points off its end", name, d, at, math.Abs(1-p)*float64(d))
				}
			}
		}
	}
	if an := wholeSteps(nav.Push, 0); an.Ease != nil || an.Spring != nav.Push.Spring {
		t.Errorf("no distance, and still a curve")
	}
}
