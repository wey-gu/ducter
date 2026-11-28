package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The Settings polish of 2026-11-28 (design/settings.md "Every pane a pleasure"), as the web's
// settings-setpolish.test.ts: Plugins says what is installed and is never an empty card, and a
// repository is added from the shared add row.

func renderTab(t *testing.T, app *App, tab string) *ui.Tester {
	t.Helper()
	app.openTab(tab)
	tt := ui.NewTesterWith(app.View, 1000, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	for i := 0; i < 4; i++ {
		tt.Frame()
		tt.Advance(200 * time.Millisecond)
	}
	return tt
}

func TestPluginsSaysWhatIsInstalledAndListsPebble(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.S.Themes = &protocol.ThemesFrame{Active: "pebble"}
	if got := app.paneSay(TabPlugins, app.L.T("plugins.lede")); got != "还没装别人做的外观；现在是 Ducter 自带的 Pebble。" {
		t.Fatalf("zh head with nothing installed: %q", got)
	}
	tt := renderTab(t, app, TabPlugins)
	for _, want := range []string{"Pebble", "正在用", "别人做的外观装好以后会在这里，换上之前先问你。", "怎么装", app.L.T("plugins.lede")} {
		if _, ok := tt.Find(want); !ok {
			t.Fatalf("Plugins with nothing installed does not show %q", want)
		}
	}
	if _, ok := tt.Find("卵石是 Ducter 自带的外观。"); ok {
		t.Fatalf("Plugins still names Pebble 卵石")
	}
	app.S.Themes = themeFrame("midnight")
	if got := app.pluginsSay(); got != "装了 1 套别人做的外观；现在用的是午夜。" {
		t.Fatalf("zh head with Midnight: %q", got)
	}
	app.L = i18n.New(i18n.EN)
	app.S.Themes = &protocol.ThemesFrame{Active: "pebble"}
	if got := app.pluginsSay(); got != "No looks from other people yet; you're on Pebble, the one Ducter ships." {
		t.Fatalf("en head: %q", got)
	}
}

func TestImportAddsARepositoryFromTheSharedAddRow(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	plugins := 2
	app.S.Imports = &protocol.ImportsFrame{Repositories: []protocol.ImportRepository{{ID: "official", URL: "https://github.com/wey-gu/ducter-plugins", Official: true, Plugins: &plugins}}}
	tt := renderTab(t, app, TabImport)
	if _, ok := tt.Find("加一个插件仓库"); !ok {
		t.Fatalf("Import has no 加一个插件仓库")
	}
	if _, ok := tt.Find("还没从别的 app 带进来什么。"); !ok {
		t.Fatalf("Import's head does not say what was brought in")
	}
}
