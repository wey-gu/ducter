package views

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// Updates is what Settings uses of the updater (internal/update).
type Updates interface {
	Status() update.Status
	CheckNow(ctx context.Context) update.Status
	SetInstallOnQuit(on bool)
}

// Remover removes Ducter from this Mac (local.Host, D72).
type Remover interface {
	UninstallPlan(all bool) (local.UninstallPlan, error)
	Uninstall(p local.UninstallPlan) (local.UninstallResult, error)
}

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
	updating bool
	remove   removeState
}

type removeState struct {
	open    bool
	all     bool
	plan    *local.UninstallPlan
	loading bool
	word    string
	busy    bool
	err     string
	done    bool
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
				a.removeEntry(c)
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
				for _, col := range []ui.Color{t.Bg, t.NeedsYou.Surface, t.Accent, t.Done.Surface, t.Ink} {
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

// updateCard: this version and where the next one stands (D72): check
// now, restart into a ready one, or install it when quitting.
func (a *App) updateCard(c *ui.Context) {
	t := a.T
	u := a.Updates
	if u == nil {
		return // the version is under About
	}
	ss := &a.settings
	st := u.Status()
	a.sheetCard(c, "update", a.L.T("settings.update.title"), func() {
		line, why := a.L.T("settings.update.version", firstNonEmpty(st.Current, a.versionText())), ""
		switch st.State {
		case update.UpToDate:
			line = a.L.T("update.uptodate", st.Current)
		case update.Checking:
			line = a.L.T("menu.update.checking")
		case update.Downloading:
			line = a.L.T("menu.update.downloading", st.Version)
		case update.Ready:
			line, why = a.L.T("menu.update.ready", st.Version), a.L.T("update.ready.body")
		case update.Available:
			line, why = a.L.T("menu.update.available", st.Version), a.L.T("update.reason."+string(st.Reason))
		case update.Failed:
			line, why = a.L.T("update.failed"), a.L.T("update.reason."+string(st.Reason))
		case update.NoFeed:
			line, why = a.L.T("update.nofeed"), a.L.T("update.nofeed.body")
		}
		if st.State == update.Checking || st.State == update.Downloading || ss.updating {
			c.After(500e6)
		}
		ui.Text(c, line).FontSize(t.MD).FontWeight(700)
		if why != "" && st.Reason != update.ReasonNone || st.State == update.Ready || st.State == update.NoFeed {
			a.note(c, why)
		}
		if !st.CheckedAt.IsZero() {
			a.note(c, a.L.T("update.checked", a.agoLong(st.CheckedAt.UTC().Format(time.RFC3339))))
		}
		ui.Row(c).Gap(t.S2).Wrap().Children(func() {
			switch {
			case st.State == update.Ready && a.RestartToUpdate != nil:
				if a.button(c, a.L.T("update.restart"), btnPrimary, t.ControlMD, t.Surface) {
					a.RestartToUpdate()
				}
			case st.State == update.Available && st.Page != "":
				if a.button(c, a.L.T("update.download"), btnSecondary, t.ControlMD, t.Surface) {
					a.openLink(st.Page)
				}
			}
			busy := ss.updating || st.State == update.Checking || st.State == update.Downloading
			if !busy && a.button(c, a.L.T("update.checknow"), btnSecondary, t.ControlMD, t.Surface) {
				ss.updating = true
				a.async(func() { u.CheckNow(context.Background()) }, func() { ss.updating = false })
			}
		})
		if v, ch := a.switchRow(c, "oninquit", a.L.T("update.oninquit"), "", st.InstallOnQuit); ch {
			u.SetInstallOnQuit(v)
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
	all := true
	for _, k := range r.Checks {
		all = all && k.Status == "ok"
	}
	if all {
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
				if a.ReportProblem != nil {
					a.ReportProblem()
				} else {
					a.openLink(ReportURL)
				}
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

// ---------- Remove Ducter (D72): last, quiet, exact ----------

// removeEntry is a quiet text button at the very end of Settings; it
// opens the plan: two choices, then exactly what goes and what stays.
func (a *App) removeEntry(c *ui.Context) {
	t := a.T
	rm, ok := a.Backend.(Remover)
	if a.Backend == nil || !ok {
		return
	}
	r := &a.settings.remove
	if !r.open {
		ui.Row(c).Justify(ui.Center).Children(func() {
			if a.button(c, a.L.T("remove.title"), btnText, t.ControlSM, t.Bg) {
				r.open = true
				a.loadPlan(rm, false)
			}
		})
		return
	}
	a.sheetCard(c, "remove", a.L.T("remove.title"), func() {
		if r.done {
			ui.Text(c, a.L.T("remove.done")).FontSize(t.MD).FontWeight(800)
			return
		}
		a.note(c, a.L.T("remove.body"))
		opts := []struct {
			all       bool
			name, sub string
		}{{false, a.L.T("remove.background"), a.L.T("remove.background.sub")}, {true, a.L.T("remove.all"), a.L.T("remove.all.sub")}}
		ui.Column(c).Gap(t.S2).Role(ui.RoleRadioGroup).Label(a.L.T("remove.title")).Children(func() {
			for _, o := range opts {
				on := o.all == r.all
				row := ui.Column(c.Key("rm:" + o.name)).Gap(2).Padding(t.S3).Radius(t.RadiusMD).Cursor(ui.CursorPointer).
					Role(ui.RoleRadio).Label(o.name).AccessSelected(on).Focusable()
				if on {
					row.Border(2, t.Ink)
				} else {
					row.Border(1, t.Line)
				}
				row.Children(func() {
					ui.Text(c, o.name).FontSize(t.MD).FontWeight(800)
					a.note(c, o.sub)
				})
				if row.Clicked() && !on {
					r.all, r.word = o.all, ""
					a.loadPlan(rm, o.all)
				}
			}
		})
		if r.loading {
			a.note(c, a.L.T("settings.data.checking"))
			c.After(300e6)
		}
		if p := r.plan; p != nil && !r.loading {
			for _, w := range p.Warnings {
				a.reasonLine(c, w.Detail)
			}
			if len(p.Remove) > 0 {
				ui.Text(c, a.L.T("remove.removes")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
				for _, it := range p.Remove {
					ui.Text(c.Key("rmi:"+it.Path), it.What+"  "+tildeHome(it.Path)).FontSize(t.SM).MaxLines(2).Selectable()
				}
			}
			if len(p.Keep) > 0 {
				ui.Text(c, a.L.T("remove.keeps")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
				for _, k := range p.Keep {
					ui.Text(c.Key("rmk:"+k.What), k.What+" · "+k.Detail).FontSize(t.SM).TextColor(t.InkSoft).MaxLines(2)
				}
			}
		}
		if r.err != "" {
			a.reasonLine(c, r.err)
		}
		word := a.L.T("remove.confirm.word")
		if r.all {
			ui.TextInput(c.Key("input:remove"), &r.word).Placeholder(word).Label(a.L.T("remove.confirm", word)).
				FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft).Width(240)
			a.note(c, a.L.T("remove.confirm", word))
		}
		ui.Row(c).Gap(t.S2).Children(func() {
			if a.button(c, a.L.T("remove.cancel"), btnSecondary, t.ControlMD, t.Surface) {
				*r = removeState{}
			}
			ready := r.plan != nil && !r.loading && !r.busy && (!r.all || r.word == word)
			if ready && a.button(c, a.L.T("remove.go"), btnPrimary, t.ControlMD, t.Surface) {
				r.busy, r.err = true, ""
				plan := *r.plan
				var res local.UninstallResult
				var err error
				a.async(func() { res, err = rm.Uninstall(plan) }, func() {
					r.busy = false
					switch {
					case errors.Is(err, local.ErrStillRunning):
						r.err = a.L.T("remove.running")
					case err != nil:
						r.err = err.Error()
					case len(res.Failed) > 0:
						var paths []string
						for _, f := range res.Failed {
							paths = append(paths, tildeHome(f.Path))
						}
						r.err = a.L.T("remove.failed", strings.Join(paths, ", "))
					default:
						r.done = true
						if a.Quit != nil {
							go func() { time.Sleep(2 * time.Second); a.Quit() }()
						}
					}
				})
			}
		})
	})
}

func (a *App) loadPlan(rm Remover, all bool) {
	r := &a.settings.remove
	r.loading, r.plan, r.err = true, nil, ""
	var p local.UninstallPlan
	var err error
	a.async(func() { p, err = rm.UninstallPlan(all) }, func() {
		r.loading = false
		if err != nil {
			r.err = err.Error()
			return
		}
		p.All = all
		r.plan = &p
	})
}
