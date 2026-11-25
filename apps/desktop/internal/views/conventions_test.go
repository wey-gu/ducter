package views

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D573: ⌘W closes the layer on top (one at a time), then Settings, and only
// then says the window itself closes.
func TestCmdWClosesTheTopLayerThenTheWindow(t *testing.T) {
	app, _ := sessApp(t, i18n.EN)
	tt := ui.NewTesterWith(app.View, 1150, 800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if app.LayerUp() {
		t.Fatal("no layer is up in the conversation")
	}
	// Two layers: Find anything, and 键盘 / Keyboard over it.
	app.OpenSwitcher()
	tt.Frame()
	app.keysOpen = true
	tt.Frame()
	if !app.LayerUp() {
		t.Fatal("a sheet is up")
	}
	if app.CloseWindowAsked() {
		t.Fatal("⌘W with a sheet up closes the sheet, not the window")
	}
	tt.Frame()
	if app.keysOpen || !app.oh.sw {
		t.Fatalf("⌘W closes the top layer alone: keys %v, find %v", app.keysOpen, app.oh.sw)
	}
	if app.CloseWindowAsked() {
		t.Fatal("⌘W again closes Find anything")
	}
	tt.Frame()
	if app.oh.sw || app.LayerUp() {
		t.Fatal("Find anything closed")
	}
	// The New task card is a layer too.
	app.NewTaskShortcut()
	tt.Frame()
	if !app.nt.open || app.CloseWindowAsked() {
		t.Fatal("⌘W closes the New task card first")
	}
	tt.Frame()
	if app.nt.open {
		t.Fatal("the New task card closed on ⌘W")
	}
	// Settings is a window of its own on a Mac: ⌘W goes back to where the person was.
	app.Route = RouteOnHand
	tt.Frame()
	app.OpenSettings()
	tt.Frame()
	if app.CloseWindowAsked() {
		t.Fatal("⌘W in Settings closes Settings")
	}
	tt.Frame()
	if app.Route != RouteOnHand {
		t.Fatalf("⌘W in Settings goes back to On hand, at %v", app.Route)
	}
	if !app.CloseWindowAsked() {
		t.Fatal("⌘W with nothing up closes the window")
	}
}

// D573: ⌘[ and ⌘] (and a swipe between pages, a mouse's side buttons) go
// back and forward through the places seen.
func TestBackAndForwardThroughPlaces(t *testing.T) {
	app, _ := sessApp(t, i18n.EN)
	tt := ui.NewTesterWith(app.View, 1150, 800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	o := app.railOrder()
	if len(o) == 0 {
		t.Fatal("the fixture has tasks on hand")
	}
	if app.CanBack() {
		t.Fatal("nowhere to go back to at the start")
	}
	app.OpenTask(o[0])
	tt.Frame()
	app.Route = RouteOnHand
	tt.Frame()
	tt.Key(ui.Cmd, ui.KeyBracketLeft)
	tt.Frame()
	if app.Route != RouteTask || app.TaskID != o[0] {
		t.Fatalf("⌘[ goes back to the task, at %v %q", app.Route, app.TaskID)
	}
	tt.Key(0, ui.KeyBack) // a two-finger swipe, a mouse's back button
	tt.Frame()
	if app.Route != RouteConversation {
		t.Fatalf("back again is the conversation, at %v", app.Route)
	}
	if app.Back() {
		t.Fatal("nothing before the conversation")
	}
	tt.Key(ui.Cmd, ui.KeyBracketRight)
	tt.Frame()
	if app.Route != RouteTask || app.TaskID != o[0] {
		t.Fatalf("⌘] goes forward to the task, at %v", app.Route)
	}
	tt.Key(0, ui.KeyForward)
	tt.Frame()
	if app.Route != RouteOnHand || app.CanForward() {
		t.Fatalf("forward again is On hand, the end, at %v", app.Route)
	}
	// A new place forgets forward.
	app.Back()
	tt.Frame()
	app.OpenSettings()
	tt.Frame()
	if app.CanForward() {
		t.Fatal("a new place forgets the places forward")
	}
}

// D573: View › Zoom In, Zoom Out and Actual Size, kept on this Mac.
func TestZoomSteps(t *testing.T) {
	app, _ := sessApp(t, i18n.EN)
	app.Local = hints.Open(t.TempDir())
	if app.Zoom() != 1 {
		t.Fatal("actual size at first")
	}
	app.ZoomBy(1)
	if app.Zoom() != 1.1 {
		t.Fatalf("zoom in is 110%%, %v", app.Zoom())
	}
	for range 20 {
		app.ZoomBy(1)
	}
	if app.Zoom() != zoomSteps[len(zoomSteps)-1] {
		t.Fatalf("zoom in stops at the last step, %v", app.Zoom())
	}
	app.ZoomBy(0)
	app.ZoomBy(-1)
	if app.Zoom() != 0.85 {
		t.Fatalf("zoom out from actual size is 85%%, %v", app.Zoom())
	}
	again := hints.Open(app.Local.Dir)
	if again.Zoom() != 0.85 {
		t.Fatalf("the zoom is kept on this Mac, %v", again.Zoom())
	}
	tt := ui.NewTesterWith(app.View, 1150, 800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	app.ZoomBy(0)
	tt.Frame()
}

// D573's guard: every sheet and viewer is built through dialogBase, so ⌘W
// knows the layer on top. A raw ui.DialogBase( in the views fails.
func TestDialogsCloseWithCmdW(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	raw := regexp.MustCompile(`\bui\.DialogBase\(`)
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") || f == "conventions.go" {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		for i, line := range strings.Split(string(b), "\n") {
			if raw.MatchString(line) && !strings.HasPrefix(strings.TrimSpace(line), "//") {
				t.Errorf("%s:%d builds a dialog ⌘W can't close: use a.dialogBase (D573)", f, i+1)
			}
		}
	}
}
