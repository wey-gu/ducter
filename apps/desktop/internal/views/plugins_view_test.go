package views

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D673 (research/248 phase 1): the drawn window follows the active theme. These tests hold
// that a theme's token reaches `a.T` through the view's own path (activeThemeFor, read from the
// home's themes frame), so the Look and sound shots are right: the app under Midnight draws
// Midnight's paper, and Pebble stays Pebble.

func themeFrame(active string) *protocol.ThemesFrame {
	midnight := &protocol.ThemeManifest{
		Name: protocol.ThemeName{En: "Midnight", Zh: "午夜"},
		Tokens: protocol.ThemeTokens{
			Light: protocol.ThemeModeTokens{Bg: "#EEF2F7", Ink: "#1A2333", Accent: "#3F74C2"},
			Dark:  protocol.ThemeModeTokens{Bg: "#0E131B", Ink: "#E8EDF5", Accent: "#7FB3FF"},
		},
	}
	return &protocol.ThemesFrame{
		Active: active,
		Themes: []protocol.ThemeRow{
			{ID: "midnight", Name: midnight.Name, Active: active == "midnight", Consented: true, Reviewed: true, Theme: midnight},
		},
	}
}

func TestActiveThemeTokenReachesTokens(t *testing.T) {
	a := &App{S: &store.Store{Themes: themeFrame("midnight")}}
	if a.activeThemeID() != "midnight" {
		t.Fatalf("active theme is %q, want midnight", a.activeThemeID())
	}
	if got := a.activeThemeFor(false); got.Bg != ui.Hex("#EEF2F7") || got.Ink != ui.Hex("#1A2333") {
		t.Fatalf("the light paper did not take Midnight: bg=%v ink=%v", got.Bg, got.Ink)
	}
	if got := a.activeThemeFor(true); got.Bg != ui.Hex("#0E131B") || got.Ink != ui.Hex("#E8EDF5") {
		t.Fatalf("the dark paper did not take Midnight: bg=%v ink=%v", got.Bg, got.Ink)
	}
}

func TestBackToPebbleRestoresPebble(t *testing.T) {
	a := &App{S: &store.Store{Themes: themeFrame("pebble")}}
	if a.activeThemeID() != "pebble" {
		t.Fatalf("active theme is %q, want pebble", a.activeThemeID())
	}
	if got := a.activeThemeFor(true); got.Bg != ui.Hex("#17120E") {
		t.Fatalf("Pebble dark was not restored: bg=%v", got.Bg)
	}
}

// midnightFrame is the real Midnight theme's frame (the plugin repository's theme.json), so the
// rendered tests below hold what a person sees.
func midnightFrame(t *testing.T, active string) *protocol.ThemesFrame {
	t.Helper()
	raw, err := os.ReadFile("../../../../packages/core/test/fixtures/themes/midnight.json") // a copy of the official Midnight theme, so CI runs this
	if err != nil {
		t.Skipf("the Midnight example theme is not in this checkout: %v", err)
	}
	var m protocol.ThemeManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	return &protocol.ThemesFrame{Active: active, Themes: []protocol.ThemeRow{
		{ID: "midnight", Name: m.Name, Active: active == "midnight", Consented: true, Reviewed: true, Author: "Ducter", Theme: &m},
	}}
}

func renderLook(t *testing.T, app *App, mode string) *ui.Tester {
	t.Helper()
	app.Local.SetAppearance(mode)
	app.openTab(TabLook)
	tt := ui.NewTesterWith(app.View, 1000, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	for i := 0; i < 4; i++ {
		tt.Frame()
		tt.Advance(200 * time.Millisecond)
	}
	return tt
}

// The whole window follows the active theme in both papers: the light paper too (it once stayed
// Pebble's cream), the sidebar's fill is the theme's chrome (it once kept Pebble's brown), and the
// quiet ledge is the theme's clay.
func TestThemeReachesTheDrawnWindowInBothPapers(t *testing.T) {
	for _, mode := range []string{"light", "dark"} {
		app, _ := iaApp(t, i18n.ZH)
		app.S.Themes = midnightFrame(t, "midnight")
		tt := renderLook(t, app, mode)
		m := app.S.Themes.Themes[0].Theme.Tokens.Light
		if mode == "dark" {
			m = app.S.Themes.Themes[0].Theme.Tokens.Dark
		}
		if app.T.Dark != (mode == "dark") {
			t.Fatalf("%s: the window is in the wrong paper", mode)
		}
		if app.T.Bg != ui.Hex(m.Bg) || app.T.UserBubble != ui.Hex(m.UserBubble) {
			t.Fatalf("%s: Midnight's paper did not reach the window: bg=%v bubble=%v", mode, app.T.Bg, app.T.UserBubble)
		}
		pebble := theme.For(mode == "dark")
		if app.T.Chrome == pebble.Chrome || app.T.PressSecondary.Color == pebble.PressSecondary.Color {
			t.Fatalf("%s: the chrome or the clay kept Pebble's", mode)
		}
		// The sidebar's drawn pixel is the theme's chrome, not Pebble's.
		px := tt.Image().At(12, 400)
		r, g, b, _ := px.RGBA()
		got := ui.Color{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: 255}
		if got != (ui.Color{R: app.T.Chrome.R, G: app.T.Chrome.G, B: app.T.Chrome.B, A: 255}) {
			t.Fatalf("%s: the sidebar is drawn %v, want the theme's chrome %v", mode, got, app.T.Chrome)
		}
	}
}

// Each tile shows its own theme in the current paper: Pebble's is always Pebble's and Midnight's
// always Midnight's, whichever is in use (they once crossed in dark).
func TestThemeTilesShowTheirOwnTheme(t *testing.T) {
	for _, mode := range []string{"light", "dark"} {
		for _, active := range []string{"midnight", "pebble"} {
			app, _ := iaApp(t, i18n.ZH)
			app.S.Themes = midnightFrame(t, active)
			renderLook(t, app, mode)
			dark := mode == "dark"
			m := app.S.Themes.Themes[0].Theme.Tokens.Light
			if dark {
				m = app.S.Themes.Themes[0].Theme.Tokens.Dark
			}
			if got := app.tileColors("pebble"); got[0] != theme.For(dark).Bg || got[2] != theme.For(dark).Accent {
				t.Fatalf("%s/%s: Pebble's tile shows %v", mode, active, got)
			}
			if got := app.tileColors("midnight"); got[0] != ui.Hex(m.Bg) || got[2] != ui.Hex(m.Accent) {
				t.Fatalf("%s/%s: Midnight's tile shows %v", mode, active, got)
			}
		}
	}
}

// The head names the theme in use, and Pebble's row says how to come back while another is on.
func TestLookNamesTheThemeInUse(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.S.Themes = midnightFrame(t, "midnight")
	app.Local.SetAppearance("dark")
	app.Local.SetLang("zh")
	if got := app.lookSay(); got != "这台 Mac 上是午夜，一直是深色，界面用中文。" {
		t.Fatalf("zh head: %q", got)
	}
	tt := renderLook(t, app, "dark")
	if _, ok := tt.Find("换回 Pebble"); !ok {
		t.Fatalf("Pebble's row does not say 换回 Pebble while Midnight is in use")
	}
	app.L = i18n.New(i18n.EN)
	app.Local.SetAppearance("light")
	app.Local.SetLang("auto")
	if got := app.lookSay(); got != "This Mac shows Midnight, always light, in the system's language." {
		t.Fatalf("en head: %q", got)
	}
	tt = renderLook(t, app, "light")
	if _, ok := tt.Find("Back to Pebble"); !ok {
		t.Fatalf("Pebble's row does not say Back to Pebble while Midnight is in use")
	}
}
