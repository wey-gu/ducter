package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D501: Look and sound's head reads the theme, the light and the window's language back,
// never what the pane is for.
func TestLookSayStates(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Local.SetAppearance("system")
	app.Local.SetLang("auto")
	if got := app.lookSay(); got != "这台 Mac 上是 Pebble，深浅和语言都跟着系统。" {
		t.Errorf("both following the system: %q", got)
	}
	app.Local.SetAppearance("dark")
	app.Local.SetLang("zh")
	if got := app.lookSay(); got != "这台 Mac 上是 Pebble，一直是深色，界面用中文。" {
		t.Errorf("dark, Chinese: %q", got)
	}
	app.L = i18n.New(i18n.EN)
	app.Local.SetAppearance("light")
	app.Local.SetLang("auto")
	if got := app.lookSay(); got != "This Mac shows Pebble, always light, in the system's language." {
		t.Errorf("light, the system's language: %q", got)
	}
}
