package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

// D438: 小窗 / Mini window. A panel (mygo's WindowOptions.Panel): it floats
// above every app's windows on every Space and over full-screen apps, stays
// out of the Dock and the app switcher, and a click into its field gives it
// the keyboard without bringing Ducter to the front. Shown with
// ShowInactive, so summoning it never takes the keyboard from the editor
// the person types in. Its place is remembered (StateKey); whether it was
// open, too (it comes back at the next launch). ⌃⌥⌘Space shows and hides it
// anywhere: Carbon's hot keys, which need no Accessibility permission (no
// entitlement changes).
func installFloat(app *views.App, changed func()) *mygo.Window {
	x, y := 0, 0
	if d := mygo.Screen.PrimaryDisplay(); d.WorkArea.Width > 0 {
		// The top right, under the menu bar: near the menu bar's own partner.
		x = d.WorkArea.X + d.WorkArea.Width - views.FloatW - 16
		y = d.WorkArea.Y + 12
	}
	w := mygo.NewWindow(mygo.WindowOptions{
		Title:           "Ducter",
		Width:           views.FloatW,
		Height:          views.FloatMinH,
		X:               x,
		Y:               y,
		Hidden:          true,
		Frameless:       true,
		CornerRadius:    16,
		Panel:           true,
		DisableResize:   true,
		BackgroundColor: "light-dark(#FFF6EA, #17120E)",
		StateKey:        "float",
		Content:         ui.View(app.FloatView),
	})
	app.Float = views.FloatHands{
		Shown: w.IsVisible,
		Show: func() {
			w.ShowInactive()
			w.Invalidate()
			changed()
		},
		Hide: func() {
			w.Hide()
			changed()
		},
		Resize: func(h int) {
			if _, hh := w.Size(); hh != h {
				w.SetSize(views.FloatW, h)
			}
		},
		Redraw: func() {
			if app.Win != nil {
				app.Win.Update(func() {})
			}
		},
	}
	if err := mygo.GlobalShortcut.RegisterWith(views.FloatKey, mygo.GlobalShortcutOptions{Description: "Ducter"}, func() {
		app.ToggleFloat()
	}); err != nil {
		// Another app holds the keys: the menus still show and hide it.
		log.Printf("ducter: the mini window's shortcut: %v", err)
	}
	if app.Local.FloatOpen() {
		w.ShowInactive()
		changed()
	}
	// A developer's look (DUCTER_FLOAT_SHOT_DIR): the panel as it drew, a few
	// seconds in, and whether it took the keyboard (it must not).
	if dir := os.Getenv("DUCTER_FLOAT_SHOT_DIR"); dir != "" {
		go func() {
			time.Sleep(6 * time.Second)
			if png, err := w.CapturePage(); err == nil {
				_ = os.WriteFile(filepath.Join(dir, "mac-float.png"), png, 0o644)
			}
			b := w.Bounds()
			note := fmt.Sprintf("visible=%v focused=%v panel=%v bounds=%d,%d %dx%d\n", w.IsVisible(), w.IsFocused(), w.IsPanel(), b.X, b.Y, b.Width, b.Height)
			_ = os.WriteFile(filepath.Join(dir, "mac-float.txt"), []byte(note), 0o644)
		}()
	}
	return w
}
