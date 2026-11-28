// research/248 phase 1 (D673): Settings › 外观和声音 / Look and sound lists the installed
// themes with a live preview tile each and 换回 Pebble / Back to Pebble always one tap away;
// Settings › 插件 / Plugins lists them as plugin rows. The consent card says the host's own
// literal lines, one fact each (D291). A theme is data, so its row has no ⋯ beyond 删掉这个主题.
package views

import (
	"fmt"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// themeState is Look and sound's and Plugins' open card and in-flight taps.
type themeState struct {
	// consent is the theme whose consent card is open.
	consent string
	busy    map[string]bool
	err     map[string]string
}

func (a *App) themesInit() {
	s := &a.themes
	if s.busy == nil {
		s.busy = map[string]bool{}
	}
	if s.err == nil {
		s.err = map[string]string{}
	}
	for _, ans := range a.S.ThemeAnswers {
		delete(s.busy, ans.ID)
		if ans.OK {
			delete(s.err, ans.ID)
			if ans.Op == "consent" {
				s.consent = ""
			}
		} else {
			s.err[ans.ID] = a.L.T("theme.contrast")
		}
	}
	a.S.ThemeAnswers = nil
}

// themeTile is a theme's mark: five of its colours (D622's clay tile).
func (a *App) themeTile(c *ui.Context, cols []ui.Color) {
	t := a.T
	if len(cols) == 0 {
		return
	}
	ui.Row(c).Gap(4).Shrink(0).Padding(t.S1).Radius(t.RadiusSM).Border(2, t.Ink).Children(func() {
		for _, col := range cols {
			ui.Box(c).Size(18, 36).Radius(t.RadiusXS-2).Background(col).Border(1, t.Line)
		}
	})
}

// tileColors is a theme's own five colours in the window's current light or dark: Pebble's tile is
// always Pebble and an installed theme's always that theme, whichever theme is in use.
func (a *App) tileColors(id string) []ui.Color {
	if id == "pebble" {
		pb := theme.For(a.T.Dark)
		return []ui.Color{pb.Bg, pb.NeedsYou.Surface, pb.Accent, pb.Done.Surface, pb.Ink}
	}
	if a.S == nil || a.S.Themes == nil {
		return nil
	}
	for i := range a.S.Themes.Themes {
		r := &a.S.Themes.Themes[i]
		if r.ID != id || r.Theme == nil {
			continue
		}
		m := &r.Theme.Tokens.Light
		if a.T.Dark {
			m = &r.Theme.Tokens.Dark
		}
		return []ui.Color{ui.Hex(m.Bg), ui.Hex(m.Decide.Surface), ui.Hex(m.Accent), ui.Hex(m.Ok.Surface), ui.Hex(m.Ink)}
	}
	return nil
}

// themeRow is one theme: its tile, its name, its own facts, and the one tap that applies it.
func (a *App) themeRow(c *ui.Context, r protocol.ThemeRow, on bool) {
	t := a.T
	byLang := map[string]string{"en": r.Name.En}
	if r.Name.Zh != "" {
		byLang["zh"] = r.Name.Zh
	}
	name := i18n.Pick(a.L, byLang)
	line := ""
	switch {
	case r.Problem == "broken":
		line = a.L.T("theme.broken")
	case r.Problem == "needs_newer":
		line = a.L.T("theme.needsNewer")
	case on:
		line = a.L.T("theme.active")
	case r.Author != "":
		line = a.L.T("theme.author", r.Author)
	}
	if a.selectRow(c, "theme:"+r.ID, name, on, false, func() {
		ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
			a.themeTile(c, a.tileColors(r.ID))
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				uiText(c, name).FontSize(t.MD).FontWeight(700)
				if line != "" {
					a.note(c, line)
				}
			})
		})
	}) {
		if r.Problem != "" || on {
			return
		}
		if !r.Consented {
			s := &a.themes
			if s.consent == r.ID {
				s.consent = ""
			} else {
				s.consent = r.ID
			}
			return
		}
		a.themes.busy[r.ID] = true
		a.send(protocol.ThemeSetReq{T: "theme_set", ID: r.ID})
	}
}

// themeConsentCard is the card under an unconsented theme's row.
func (a *App) themeConsentCard(c *ui.Context, r protocol.ThemeRow) {
	t := a.T
	ui.Column(c).Gap(t.S2).Padding(t.S3, t.S4, t.S3, t.S4).Background(t.SurfaceSunken).Radius(t.RadiusSM).Children(func() {
		uiText(c, a.L.T("theme.consent.look")).FontSize(t.SM).LineHeight(a.leading(1.5))
		uiText(c, a.L.T("theme.consent.layout")).FontSize(t.SM).LineHeight(a.leading(1.5))
		uiText(c, a.L.T("theme.consent.made", r.Author)).FontSize(t.SM).LineHeight(a.leading(1.5))
		if r.Reviewed {
			uiText(c, a.L.T("theme.reviewed")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
		} else {
			uiText(c, a.L.T("theme.unreviewed")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
		}
		ui.Row(c).Gap(t.S2).Padding(0, t.S2, 0, 0).Children(func() {
			if a.button(c, a.L.T("theme.install"), btnSecondary, t.ControlSM, t.Surface) {
				a.themes.busy[r.ID] = true
				a.send(protocol.ThemeConsentReq{T: "theme_consent", ID: r.ID})
			}
			if a.button(c, a.L.T("theme.notnow"), btnText, t.ControlSM, t.Surface) {
				a.themes.consent = ""
			}
		})
	})
}

// themeList draws Pebble (when includePebble) and every installed theme, each its own row.
func (a *App) themeList(c *ui.Context, includePebble bool) {
	a.themesInit()
	t := a.T
	v := a.S.Themes
	active := "pebble"
	var rows []protocol.ThemeRow
	if v != nil {
		active = v.Active
		rows = v.Themes
	}
	if includePebble {
		a.sep(c)
		on := active == "pebble"
		line := a.L.T("theme.active")
		if !on {
			line = a.L.T("settings.look.back") // the one tap that comes back
		}
		if a.selectRow(c, "theme:pebble", "Pebble", on, false, func() {
			ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
				// Pebble's tile is its own paper in the current light or dark (never the active theme's).
				a.themeTile(c, a.tileColors("pebble"))
				ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
					uiText(c, "Pebble").FontSize(t.MD).FontWeight(700)
					a.note(c, line)
				})
			})
		}) {
			if !on {
				a.send(protocol.ThemeSetReq{T: "theme_set", ID: "pebble"})
			}
		}
	}
	for _, r := range rows {
		a.sep(c)
		a.themeRow(c, r, r.ID == active)
		if a.themes.consent == r.ID && !r.Consented {
			a.themeConsentCard(c, r)
		}
	}
}

// pluginsDocs is the docs page that says how a look is added (`ducter plugin add`).
const pluginsDocs = DocsURL + "/plugins"

// pluginsSay is what is true on Plugins now (D475: the head is the state, never what the pane
// is for): no look but Pebble, or how many are installed and which is in use.
func (a *App) pluginsSay() string {
	v := a.S.Themes
	if v == nil {
		return ""
	}
	switch n := len(v.Themes); n {
	case 0:
		return a.L.T("say.plugins.none")
	case 1:
		return a.L.T("say.plugins.one", a.activeThemeName())
	default:
		return a.L.T("say.plugins.n", fmt.Sprint(n), a.activeThemeName())
	}
}

// pluginsPanel is Settings › 插件 / Plugins: the head says what is installed; what a plugin may do
// is the pane's note; then the looks as one group, Pebble first (the one tap back always here
// too), and with none installed the group's foot says where one appears and how one is added.
func (a *App) pluginsPanel(c *ui.Context) {
	a.panelHead(c, TabPlugins, a.L.T("plugins.lede"))
	a.ledeNote(c, "plugins-note", a.L.T("plugins.lede"))
	a.group(c, "plugins", a.L.T("plugins.theme.group"), a.L.T("settings.look.themes.note"), func() {
		a.themeList(c, true)
		if v := a.S.Themes; v == nil || len(v.Themes) == 0 {
			a.footRow(c, "plugins-none", a.L.T("plugins.none"), func() {
				if a.quietLink(c, "plugins-how", a.L.T("plugins.how"), a.L.T("plugins.how")) {
					a.openLink(pluginsDocs)
				}
			})
		}
	})
}
