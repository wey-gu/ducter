package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D290: each move between pages says its kind, from where it was to where
// it is.
func TestNavKinds(t *testing.T) {
	app := railApp(t, i18n.EN)
	tt := ui.NewTester(app.View, 1400, 900)
	tt.Frame()
	steps := []struct {
		do   func()
		want navDir
		sign float32
	}{
		{func() { app.Route = RouteOnHand }, navDeeper, 0},
		{func() { app.OpenTask("t_iter") }, navDeeper, 0},
		{func() { app.OpenTask("t_keys") }, navTask, 0},
		{func() { app.Up() }, navBack, 0},
		{func() { app.OpenSettings() }, navAcross, 1},
		{func() { app.OpenDevices() }, navAcross, -1},
		{func() { app.Route = RouteConversation }, navBack, 0},
	}
	for i, s := range steps {
		s.do()
		tt.Frame()
		if app.nav.dir != s.want || (s.sign != 0 && app.nav.sign != s.sign) {
			t.Errorf("step %d: %v (sign %v), want %v (%v)", i, app.nav.dir, app.nav.sign, s.want, s.sign)
		}
		tt.Advance(time.Second)
	}
	if app.nav.left != "t_keys" {
		t.Errorf("the task left is %q", app.nav.left)
	}
}

// D290: every move's frames, 16 ms apart, at the window's size; how long
// each frame takes to build and paint (the test renderer's timing; tall enough that
// On hand's cards (D287) keep the tapped one in view), and a
// few of them saved to $DUCTER_SHOTS_DIR/d290 when set:
//
//	DUCTER_SHOTS_DIR=$PWD/../../.shots go test ./internal/views -run TestNavMotionFrames -v
func TestNavMotionFrames(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := railApp(t, lang)
		// D290_STILL=1: the same moves under reduced motion, the baseline.
		tt := ui.NewTesterWith(app.View, 1400, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: os.Getenv("D290_STILL") != ""}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		tt.Advance(time.Second)
		dir := os.Getenv("DUCTER_SHOTS_DIR")
		if os.Getenv("D290_STILL") != "" {
			dir = ""
		}
		if dir != "" {
			dir = filepath.Join(dir, "d290")
			_ = os.MkdirAll(dir, 0o755)
		}
		var all []time.Duration
		play := func(name string, do func()) {
			t.Helper()
			do()
			var times []time.Duration
			for i := 0; i <= 30; i++ {
				start := time.Now()
				if i == 0 {
					tt.Frame()
				} else {
					tt.Advance(16 * time.Millisecond)
				}
				times = append(times, time.Since(start))
				if dir != "" && (i == 0 || i == 3 || i == 6 || i == 10 || i == 16 || i == 30) {
					f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-f%02d.png", name, lang, i)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(f, tt.Image())
					f.Close()
				}
			}
			tt.Advance(time.Second) // the partner breathes on: frames go on at its rate
			// The first frame builds the new page (as it does without
			// motion); the frames after it are the move itself.
			first := times[0]
			times = times[1:]
			all = append(all, times...)
			s := append([]time.Duration(nil), times...)
			sort.Slice(s, func(i, j int) bool { return s[i] < s[j] })
			var sum time.Duration
			for _, d := range s {
				sum += d
			}
			t.Logf("D290 %s %s: first %.2f ms; in flight mean %.2f ms, p95 %.2f ms, max %.2f ms", lang, name,
				float64(first.Microseconds())/1000, float64(sum.Microseconds())/1000/float64(len(s)), float64(s[len(s)*95/100].Microseconds())/1000, float64(s[len(s)-1].Microseconds())/1000)
		}
		play("1-deeper-onhand", func() { app.Route = RouteOnHand })
		play("2-hero-open", func() {
			if err := tt.Click(app.S.Task("t_bench").Title()); err != nil {
				t.Fatal(err)
			}
		})
		play("3-task-switch", func() { app.WalkTask(1) })
		play("4-back-onhand", func() { app.Up() })
		play("5-across-settings", func() { app.OpenSettings() })
		play("6-across-devices", func() { app.OpenDevices() })
		play("7-back-conversation", func() { app.Route = RouteConversation })
		if !testing.Short() {
			sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
			if p := all[len(all)*95/100]; p > 50*time.Millisecond {
				t.Errorf("%s: p95 frame %v", lang, p)
			}
		}
	}
}
