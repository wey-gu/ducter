package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 设置 / Settings (D71, ⌘,): the app's own things only, calm and short.
// The look, the window's language, what happens when the window closes,
// updates, data and logs, and about. What the partner is like lives on
// the Partner page; devices and AI accounts on Devices.

// Links of the app.
const (
	DocsURL     = "https://ducter.ai/docs"
	ReportURL   = "https://github.com/wey-gu/ducter/issues/new"
	LicensesURL = "https://github.com/wey-gu/ducter/blob/main/LICENSE"
)

type settingsState struct {
	checking bool
	report   *local.Report
	err      string
}

// OpenSettings shows Settings.
func (a *App) OpenSettings() { a.Route = RouteSettings }

// SetInterfaceLanguage switches the window's language: "auto" follows
// macOS (and, as before, the first message), "zh" or "en" pin it.
func (a *App) SetInterfaceLanguage(choice string) {
	if a.Local != nil {
		a.Local.SetLang(choice)
	}
	switch choice {
	case "zh", "en":
		a.L, a.LocaleFixed = i18n.New(i18n.Lang(choice)), true
	default:
		a.LocaleFixed, a.localeSet = false, false
		if a.SystemLang != "" {
			a.L = i18n.New(a.SystemLang)
		}
		a.followUserLanguage()
	}
	if a.OnLanguage != nil {
		a.OnLanguage(a.L)
	}
}

func (a *App) settingsView(c *ui.Context) {
	t := a.T
	a.chrome(c, "settings", func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("nav.settings"))
	}, nil)
	ui.Scroll(c.Key("settings-scroll")).Grow(1).Children(func() {
		ui.Row(c).Justify(ui.Center).Padding(t.S6, t.S6, t.S7, t.S6).Children(func() {
			ui.Column(c).Grow(1).MaxWidth(680).Gap(t.S5).Children(func() {
				a.lookCard(c)
				a.langCard(c)
				a.runCard(c)
				a.updateCard(c)
				a.dataCard(c)
				a.aboutCard(c)
			})
		})
	})
}

// lookCard: the one look that ships, Pebble, drawn as its own paper,
// clay and ink. More appear here only when they work.
func (a *App) lookCard(c *ui.Context) {
	t := a.T
	a.sheetCard(c, "look", a.L.T("settings.look"), func() {
		ui.Row(c.Key("theme:pebble")).Gap(t.S4).Padding(t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(2, t.Ink).
			AlignItems(ui.Center).Role(ui.RoleRadio).AccessSelected(true).Label(a.L.T("settings.look.pebble")).Children(func() {
			ui.Row(c).Gap(4).Shrink(0).Children(func() {
				for _, col := range []ui.Color{t.Bg, t.Clay, t.Accent, t.UserBubble, t.Ink} {
					ui.Box(c).Size(22, 40).Radius(t.RadiusXS).Background(col).Border(1, t.Line)
				}
			})
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, a.L.T("settings.look.pebble")).FontSize(t.MD).FontWeight(800)
				a.note(c, a.L.T("settings.look.pebble.note"))
			})
			if b := theme.Art(theme.Idle, 96); b != nil {
				ui.Image(c, b).Size(44, 44).Shrink(0).AccessHidden(true)
			}
		})
	})
}

func (a *App) langCard(c *ui.Context) {
	a.sheetCard(c, "lang", a.L.T("settings.lang.title"), func() {
		opts := []string{"auto", "zh", "en"}
		cur := "auto"
		if a.Local != nil {
			cur = a.Local.Lang()
		}
		sel := 0
		for i, o := range opts {
			if o == cur {
				sel = i
			}
		}
		labels := []string{a.L.T("settings.lang.auto"), a.L.T("settings.lang.zh"), a.L.T("settings.lang.en")}
		if i := a.choices(c, "lang", a.L.T("settings.lang.title"), labels, sel); i >= 0 {
			a.SetInterfaceLanguage(opts[i])
		}
	})
}

// runCard: what happens when the window closes (D56), as it is now, and
// the one full stop.
func (a *App) runCard(c *ui.Context) {
	t := a.T
	name := a.personaName()
	a.sheetCard(c, "run", a.L.T("settings.run.title"), func() {
		if a.Backend == nil {
			ui.Text(c, a.L.T("settings.run.remote", hostOf(a.URL))).FontSize(t.MD).LineHeight(1.5)
			return
		}
		var line string
		switch {
		case a.Resting():
			line = a.L.T("settings.run.resting", name)
		case a.Backend.BackgroundBlocked():
			line = a.L.T("settings.run.blocked", name)
		case a.Backend.Background():
			line = a.L.T("settings.run.bg", name)
		default:
			line = a.L.T("settings.run.child", name)
		}
		ui.Text(c, line).FontSize(t.MD).LineHeight(1.5)
		ui.Row(c).Gap(t.S2).Wrap().Children(func() {
			if a.Backend.BackgroundBlocked() && a.button(c, a.L.T("settings.run.allow"), btnSecondary, t.ControlMD, t.Surface) {
				_ = a.Backend.OpenSettings(local.SettingsLoginItems)
			}
			if a.Resting() {
				if a.button(c, a.L.T("rest.wake", name), btnPrimary, t.ControlMD, t.Surface) {
					a.Wake()
				}
			} else if a.button(c, a.L.T("menu.rest"), btnSecondary, t.ControlMD, t.Surface) {
				a.Rest()
			}
		})
		if !a.Resting() {
			a.note(c, a.L.T("menu.rest.sub"))
		}
	})
}

// updateCard: the version, and checking for a new one where the app can.
func (a *App) updateCard(c *ui.Context) {
	t := a.T
	if a.CheckUpdates == nil {
		return // the version is under About
	}
	a.sheetCard(c, "update", a.L.T("settings.update.title"), func() {
		ui.Text(c, a.L.T("settings.update.version", a.versionText())).FontSize(t.MD)
		if a.button(c, a.L.T("settings.update.check"), btnSecondary, t.ControlMD, t.Surface) {
			a.CheckUpdates()
		}
	})
}

// dataCard: the data folder, the log, and the same checks the first run
// makes, as plain rows.
func (a *App) dataCard(c *ui.Context) {
	t := a.T
	if a.Backend == nil {
		return
	}
	ss := &a.settings
	a.sheetCard(c, "data", a.L.T("settings.data.title"), func() {
		ui.Text(c, tildeHome(a.Backend.DataDir())).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
		ui.Row(c).Gap(t.S2).Wrap().Children(func() {
			if a.button(c, a.L.T("settings.data.folder"), btnSecondary, t.ControlMD, t.Surface) {
				_ = a.Backend.OpenURL(a.Backend.DataDir())
			}
			if a.button(c, a.L.T("settings.data.logs"), btnSecondary, t.ControlMD, t.Surface) {
				_ = a.Backend.OpenURL(a.Backend.LogPath())
			}
			label := a.L.T("settings.data.check")
			if ss.checking {
				label = a.L.T("settings.data.checking")
			}
			if a.button(c, label, btnSecondary, t.ControlMD, t.Surface) && !ss.checking {
				ss.checking, ss.err = true, ""
				var r local.Report
				var err error
				a.async(func() { r, err = a.Backend.Doctor() }, func() {
					ss.checking = false
					if err != nil {
						ss.err = err.Error()
						return
					}
					ss.report = &r
				})
			}
		})
		if ss.err != "" {
			a.reasonLine(c, ss.err)
		}
		if r := ss.report; r != nil {
			a.checkRows(c, *r)
		}
	})
}

// checkRows lists the checks: a drawn mark and the words, nothing more.
// All good says so in one line, and the rows still show what was checked.
func (a *App) checkRows(c *ui.Context, r local.Report) {
	t := a.T
	if len(r.Blocking()) == 0 {
		ui.Text(c, a.L.T("settings.data.allgood")).FontSize(t.MD).FontWeight(800).TextColor(t.Done.Ink)
	}
	ui.Column(c.Key("checks")).Gap(t.S2).Children(func() {
		for _, k := range r.Checks {
			if k.Quiet && k.Status == "ok" {
				continue
			}
			sc, glyph := t.Done, drawCheck(t.Done.Dot)
			if k.Status != "ok" {
				sc, glyph = t.Waiting, drawBang(t.Waiting.Dot)
				if k.Required {
					sc, glyph = t.NeedsYou, drawBang(t.NeedsYou.Dot)
				}
			}
			ui.Row(c.Key("check:" + k.ID)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
				ui.Box(c).Size(22, 22).Radius(t.RadiusXS).Background(sc.Surface).Draw(glyph).Shrink(0)
				ui.Column(c).Gap(1).Grow(1).MinWidth(0).Children(func() {
					ui.Text(c, k.Label).FontSize(t.MD).FontWeight(700)
					if k.Detail != "" {
						ui.Text(c, k.Detail).FontSize(t.SM).TextColor(t.InkMuted).MaxLines(2)
					}
				})
			})
		}
	})
}

func (a *App) aboutCard(c *ui.Context) {
	t := a.T
	a.sheetCard(c, "about", a.L.T("settings.about.title"), func() {
		ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
			if b := theme.Art(theme.Idle, 120); b != nil {
				ui.Image(c, b).Size(56, 56).Shrink(0).AccessHidden(true)
			}
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, "Ducter").FontSize(t.LG).FontWeight(800)
				ui.Text(c, a.L.T("settings.about.version", a.versionText())).FontSize(t.SM).TextColor(t.InkMuted).Selectable()
				a.note(c, a.L.T("settings.about.made"))
			})
		})
		ui.Row(c).Gap(t.S1).Wrap().Children(func() {
			if a.button(c, a.L.T("settings.about.docs"), btnText, t.ControlSM, t.Surface) {
				a.openLink(DocsURL)
			}
			if a.button(c, a.L.T("settings.about.licenses"), btnText, t.ControlSM, t.Surface) {
				a.openLink(LicensesURL)
			}
			if a.button(c, a.L.T("settings.about.report"), btnText, t.ControlSM, t.Surface) {
				a.openLink(ReportURL)
			}
		})
	})
}

// versionText is "0.3.0 (abc1234)", or what is known of it.
func (a *App) versionText() string {
	v := a.Version
	if v == "" {
		v = "dev"
	}
	if a.Commit != "" {
		v += " (" + a.Commit + ")"
	}
	return v
}

func hostOf(u string) string {
	for _, p := range []string{"ws://", "wss://", "http://", "https://"} {
		if len(u) > len(p) && u[:len(p)] == p {
			u = u[len(p):]
		}
	}
	for i := 0; i < len(u); i++ {
		if u[i] == '/' {
			return u[:i]
		}
	}
	return u
}
