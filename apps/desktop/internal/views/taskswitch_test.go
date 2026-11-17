package views

import (
	"fmt"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D341: one task to the next at the same level (a rail row, j/k) is not a
// move in depth: the task's head never travels, whether the next task is
// clicked in the rail (whose row must not fly into the head) or walked to
// from the keyboard. Its words change in place over a quick cross-fade.
// Frames mid-switch go to $DUCTER_SHOTS_DIR/task-switch when set:
//
//	DUCTER_SHOTS_DIR=$PWD/../../.shots go test ./internal/views -run TestTaskSwitchHeadStays -v
func TestTaskSwitchHeadStays(t *testing.T) {
	for _, still := range []bool{false, true} {
		app := railApp(t, i18n.ZH)
		tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: still}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		app.Route = RouteOnHand
		tt.Frame()
		app.OpenTask("t_iter")
		tt.Frame()
		tt.Advance(time.Second)
		tt.Advance(16 * time.Millisecond)
		if app.tpage.headAt.W == 0 {
			t.Fatal("the head was never drawn")
		}
		top := app.tpage.headAt.Y
		dir := os.Getenv("DUCTER_SHOTS_DIR")
		if dir != "" && !still {
			dir = filepath.Join(dir, "task-switch")
			_ = os.MkdirAll(dir, 0o755)
		} else {
			dir = ""
		}
		watch := func(name string, do func()) {
			t.Helper()
			do()
			var at []ui.Rect
			for i := 0; i <= 20; i++ {
				if i == 0 {
					tt.Frame()
				} else {
					tt.Advance(16 * time.Millisecond)
				}
				if dir != "" && (i <= 4 || i == 6 || i == 10 || i == 20) {
					f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-f%02d.png", name, i)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(f, tt.Image())
					f.Close()
				}
				if app.nav.dir != navTask {
					t.Fatalf("%s: the move is %v, not one task to the next", name, app.nav.dir)
				}
				at = append(at, app.tpage.headAt)
			}
			// Where the new head comes to rest; each line's centring may
			// differ a pixel from task to task, its top never.
			rest := at[len(at)-1]
			if math.Abs(float64(rest.Y-top)) > 0.5 {
				t.Errorf("%s: the new head rests at y %.1f, the last at %.1f", name, rest.Y, top)
			}
			for i, h := range at {
				if h.W == 0 { // the new head's first frame: not drawn yet
					continue
				}
				if math.Abs(float64(h.X-rest.X)) > 0.5 || math.Abs(float64(h.Y-rest.Y)) > 0.5 {
					t.Errorf("%s (reduced motion %v) frame %d: the head is at %.1f,%.1f, not where it rests (%.1f,%.1f)", name, still, i, h.X, h.Y, rest.X, rest.Y)
				}
			}
			tt.Advance(time.Second)
		}
		watch("rail-click", func() {
			if err := tt.Click(app.S.Task("t_keys").Title()); err != nil {
				t.Fatal(err)
			}
		})
		if app.TaskID != "t_keys" {
			t.Fatalf("the rail's click opened %q", app.TaskID)
		}
		watch("walk", func() { app.WalkTask(1) })
	}
}
