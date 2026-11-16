package views

import (
	"bytes"
	"image"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D262: one shell. Every place's bar ends in the same way to the other
// places (设备 · 手头的事 · 设置), so going one level in never strands you;
// Settings is a visible button, and an update waiting is said in the bar.
func TestEveryPlaceHasTheWayOut(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := tinycart(t, lang, 3*time.Minute)
		L := app.L
		places := []struct {
			name string
			go_  func()
		}{
			{"conversation", func() { app.Route = RouteConversation }},
			{"onhand", func() { app.Route = RouteOnHand }},
			{"task", func() { app.OpenTask("t_fix") }},
			{"devices", func() { app.OpenDevices() }},
			{"settings", func() { app.OpenSettings() }},
			{"partner", func() { app.OpenPartner() }},
		}
		for _, p := range places {
			p.go_()
			tt.Frame()
			tt.Frame()
			for _, want := range []string{L.T("nav.devices"), L.T("nav.onhand"), L.T("nav.settings")} {
				if !tt.HasText(want) {
					t.Errorf("%s/%s: no %q in the bar", lang, p.name, want)
				}
			}
		}
		// 设置 is a button that opens Settings, from the conversation.
		app.Route = RouteConversation
		tt.Frame()
		if err := tt.Click(L.T("nav.settings")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if app.Route != RouteSettings {
			t.Errorf("%s: 设置 opened route %v", lang, app.Route)
		}
		// From Settings, On hand is one click away.
		if err := tt.Click(L.T("nav.onhand")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if app.Route != RouteOnHand {
			t.Errorf("%s: 手头的事 from Settings opened route %v", lang, app.Route)
		}
	}
}

// D262: a launch's first frame is the settled one: the remembered name and
// language from the start, no 连接中… flashing before the counts, and the
// page not replaying its entrance when the home says welcome. Frame by
// frame: before the welcome, then after it.
func TestLaunchHasNoVisibleSwitch(t *testing.T) {
	theme.LoadFonts()
	dir := t.TempDir()
	prev := hints.Open(dir)
	prev.SetSpokeLang("zh")
	prev.SetPersonaName("小鸭")
	local := hints.Open(dir)
	lang, _ := local.StartLang("en", false) // an English Mac, a Chinese person
	s := store.New()
	s.PersonaName = local.PersonaName()
	app := New(s, theme.Pebble(), i18n.New(i18n.Lang(lang)))
	app.Local = local
	app.Send = func(any) error { return nil }
	now := time.Now()
	app.Now = func() time.Time { return now }
	app.Status = client.Connecting
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Advance(400 * time.Millisecond) // the window's own first entrance
	first := tt.Texts()
	if !tt.HasText("小鸭") || !tt.HasText("设置") {
		t.Errorf("first frame lacks the remembered name or language: %q", first)
	}
	if tt.HasText("连接中") || tt.HasText("Connecting") {
		t.Errorf("first frame says connecting: %q", first)
	}
	name0 := crop(tt.Image(), 150, 4, 260, 34)
	writeShotTo(t, tt, "shell", "mac-launch-first-frame")
	now = now.Add(80 * time.Millisecond)
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "小鸭", HeadSeq: 0})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	tt.Frame()
	tt.Advance(50 * time.Millisecond)
	if name1 := crop(tt.Image(), 150, 4, 260, 34); !bytes.Equal(name0, name1) {
		t.Errorf("the name moved or changed after the welcome (the entrance replayed?)")
	}
	if !tt.HasText("设置") {
		t.Errorf("language switched after the welcome: %q", tt.Texts())
	}
	writeShotTo(t, tt, "shell", "mac-launch-after-welcome")
}

func TestBarSaysAnUpdate(t *testing.T) {
	app, tt := tinycart(t, i18n.ZH, 3*time.Minute)
	app.Route = RouteConversation
	tt.Frame()
	if tt.HasText("4 项更新") {
		t.Fatal("an update is said with nothing to update")
	}
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: &protocol.UpdateAllView{Offer: uaItems()}})
	tt.Frame()
	writeShotTo(t, tt, "shell", "mac-update-bar-zh")
	if err := tt.Click("4 项更新"); err != nil {
		t.Fatalf("no update in the bar: %v; %q", err, tt.Texts())
	}
	tt.Frame()
	if app.Route != RouteSettings || app.settings.tab != TabAbout {
		t.Errorf("the update opened %v/%s, not Settings › 关于", app.Route, app.settings.tab)
	}
	writeShotTo(t, tt, "shell", "mac-update-zh")
}

// writeShotTo writes a shot under .shots/<dir> when DUCTER_SHELL_SHOTS is set.
// crop is the pixels of a rectangle of the frame, in points (scale 1).
func crop(img *image.RGBA, x0, y0, x1, y1 int) []byte {
	var out []byte
	for y := y0; y < y1; y++ {
		out = append(out, img.Pix[img.PixOffset(x0, y):img.PixOffset(x1, y)]...)
	}
	return out
}

func testingShots() bool { return os.Getenv("DUCTER_SHELL_SHOTS") != "" }

func writeShotTo(t *testing.T, tt *ui.Tester, dir, name string) {
	t.Helper()
	if testingShots() {
		t.Setenv("DUCTER_SHOTS_DIR", "../../../../.shots/"+dir)
		writeShot(t, tt, name)
	}
}
