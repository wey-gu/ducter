package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D421's clay menu on the Mac, light and dark:
//
//	DUCTER_MENU_SHOTS=after DUCTER_SHOTS_DIR=<repo>/.shots/menus go test ./internal/views -run MenuShots
//
// the shelf's ⋯ (the author's nit), right-click on a bubble, and the
// partner's menu opened from the keyboard with the highlight moved down.
func TestMenuShots(t *testing.T) {
	tag := os.Getenv("DUCTER_MENU_SHOTS")
	if tag == "" {
		t.Skip("DUCTER_MENU_SHOTS=before|after to write the shots")
	}
	dir := shotsDir(t)
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		save := func(tt *ui.Tester, name string) {
			t.Helper()
			for i := 0; i < 3; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-mac-%s-%s.png", tag, name, mode)))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			t.Logf("%s %s: %q", name, mode, tt.Menu())
		}
		// The shelf's ⋯ (D410).
		app, _ := shelfApp(t, i18n.ZH, shelfFixture(i18n.ZH), nil)
		app.OpenApps()
		tt := ui.NewTesterWith(app.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetDark(dark)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		if err := tt.Click(app.L.T("apps.more", "北京出差 11/20–21")); err != nil {
			t.Fatal(err)
		}
		tt.Key(0, ui.KeyDown)
		save(tt, "apps-more")
		tt.CloseMenu()

		// Right-click a partner's message.
		rapp, rt, _ := replyApp(t, i18n.ZH)
		rt.SetScale(2)
		rt.SetDark(dark)
		rt.Frame()
		if err := rt.RightClick(autospace(replyRun[i18n.ZH].values)); err != nil {
			t.Fatal(err)
		}
		_ = rapp
		save(rt, "reply")
		rt.CloseMenu()
	}
}
