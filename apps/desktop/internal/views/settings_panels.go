package views

import (
	"errors"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The app's own tabs of Settings (D150): Look and sound, Where it runs,
// Updates and about. The partner's three are in partner.go.

// ---------- 外观与声音 / Look and sound ----------

// cheerFor is how long the partner on the preview smiles after a choice.
const cheerFor = 1600 * time.Millisecond

func (a *App) cheer() { a.settings.cheer = a.Now().UnixNano() }

func (a *App) lookPanel(c *ui.Context) {
	t := a.T
	ss := &a.settings
	a.panelHead(c, TabLook, a.L.T("settings.lede.look"))
	a.lookPreview(c)
	a.group(c, "look", a.L.T("settings.look.group"), "", func() {
		a.sep(c)
		b := ui.Row(c.Key("theme:pebble")).Gap(t.S4).Padding(t.S4, t.S5).AlignItems(ui.Center).Cursor(ui.CursorPointer).
			Role(ui.RoleRadio).AccessSelected(true).Label(a.L.T("settings.look.pebble")).Focusable()
		if b.Hovered() {
			b.Background(t.Ink.Alpha(0.03))
		}
		b.Children(func() {
			ui.Row(c).Gap(4).Shrink(0).Padding(t.S1).Radius(t.RadiusSM).Border(2, t.Ink).Children(func() {
				for _, col := range []ui.Color{t.Bg, t.NeedsYou.Surface, t.Accent, t.Done.Surface, t.Ink} {
					ui.Box(c).Size(18, 36).Radius(t.RadiusXS-2).Background(col).Border(1, t.Line)
				}
			})
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, a.L.T("settings.look.pebble")).FontSize(t.MD).FontWeight(700)
				a.note(c, a.L.T("settings.look.pebble.note"))
			})
			a.glyph(c, 20, drawCheck(t.Ink))
		})
		if b.Clicked() {
			a.cheer()
		}
	})
	a.group(c, "lang", a.L.T("settings.lang.group"), "", func() {
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
		a.row(c, "lang", a.L.T("settings.lang.title"), a.L.T("settings.lang.help"), func() {
			labels := []string{a.L.T("settings.lang.auto"), a.L.T("settings.lang.zh"), a.L.T("settings.lang.en")}
			if i := a.choices(c, "lang", a.L.T("settings.lang.title"), labels, sel); i >= 0 {
				a.SetInterfaceLanguage(opts[i])
				a.cheer()
			}
		})
		dsel := 0
		if a.Local.DetailsShown() {
			dsel = 1
		}
		a.row(c, "details", a.L.T("settings.details.title"), a.L.T("settings.details.note"), func() {
			labels := []string{a.L.T("settings.details.folded"), a.L.T("settings.details.shown")}
			if i := a.choices(c, "details", a.L.T("settings.details.title"), labels, dsel); i >= 0 {
				a.Local.SetDetailsShown(i == 1)
				// The preference applies anew: no message keeps a flip.
				for k := range a.open {
					if strings.HasPrefix(k, "det:") {
						delete(a.open, k)
					}
				}
				a.cheer()
			}
		})
	})
	a.group(c, "sound", a.L.T("settings.sound"), "", func() {
		playing := ss.sound != nil
		if playing && a.Now().UnixNano()-ss.soundFrom > int64(5*time.Second) {
			ss.sound.Stop(600 * time.Millisecond)
			ss.sound, playing = nil, false
		}
		if v, ch := a.soundRow(c, playing); ch {
			a.Local.SetSound(v)
		}
		if a.linkRow(c, "replay", a.L.T("settings.about.title_replay"), "", false) {
			a.stopPreview()
			a.ShowTitle()
		}
	})
}

// soundRow is the intro's sound: a quiet Play beside its switch, so you
// hear what you turn on.
func (a *App) soundRow(c *ui.Context, playing bool) (bool, bool) {
	t := a.T
	ss := &a.settings
	on, changed := a.Local.Sound(), false
	a.row(c, "sound", a.L.T("settings.sound.row"), a.L.T("settings.sound.note"), func() {
		if a.PlayTitle != nil {
			label := a.L.T("settings.sound.play")
			if playing {
				label = a.L.T("settings.sound.stop")
				c.After(250 * time.Millisecond)
			}
			if a.button(c, label, btnSecondary, t.ControlSM, t.Surface) {
				if playing {
					a.stopPreview()
				} else {
					ss.sound, ss.soundFrom = a.PlayTitle(), a.Now().UnixNano()
					a.cheer()
				}
			}
		}
		changed = ui.Switch(c.Key("sw:sound"), &on).Label(a.L.T("settings.sound.row")).Changed()
	})
	return on, changed
}

func (a *App) stopPreview() {
	if s := a.settings.sound; s != nil {
		s.Stop(300 * time.Millisecond)
		a.settings.sound = nil
	}
}

// lookPreview is a small stage of the window as it looks now: the clay
// partner, one message of yours and its answer in this window's language,
// and Details as you set it. The partner smiles for a moment when you pick
// something here.
func (a *App) lookPreview(c *ui.Context) {
	t := a.T
	face := theme.Idle
	if since := a.Now().UnixNano() - a.settings.cheer; a.settings.cheer != 0 && since < int64(cheerFor) {
		face = theme.Done
		c.After(time.Duration(int64(cheerFor) - since))
	}
	if a.settings.sound != nil {
		face = theme.Done
	}
	ui.Row(c.Key("look-preview")).Gap(t.S5).AlignItems(ui.End).Padding(t.S5, t.S6).Radius(t.RadiusXL).Background(t.Bg).
		Border(1, t.Line).Role(ui.RoleGroup).Label(a.L.T("settings.preview")).Children(func() {
		a.avatar(c, face, 104)
		ui.Column(c).Grow(1).MinWidth(0).Gap(t.S2).Children(func() {
			r := t.BubbleRadius
			ui.Row(c).Children(func() {
				ui.Spacer(c)
				ui.Text(c, a.L.T("settings.preview.user")).FontSize(t.Bubble).LineHeight(a.leading(1.5)).TextColor(t.OnUserBubble).
					Padding(t.S2+2, t.S4-2).Radius(r[0], r[1], r[2], r[3]).Background(t.UserBubble).MaxWidthPercent(84)
			})
			ui.Row(c).Children(func() {
				ui.Text(c, a.L.T("settings.preview.reply")).FontSize(t.PartnerSize).LineHeight(a.leading(1.5)).TextColor(t.OnPartnerBubble).
					Padding(t.S2+2, t.S4-2).Radius(r[1], r[0], r[3], r[2]).Background(t.PartnerBubble).Shadow(0, 2, 0, 0, t.Line).MaxWidthPercent(84)
				ui.Spacer(c)
			})
			ui.Row(c).Padding(0, 0, 0, t.S4-2).Children(func() {
				if a.Local.DetailsShown() {
					a.markIn(c, drawCheck, t.Done.Ink, a.L.T("settings.preview.noted"), t.InkMuted)
					return
				}
				ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
					ui.Text(c, a.L.T("details.show")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
					a.glyph(c, 12, drawChevron(t.InkSoft, false))
				})
			})
		})
	})
}

// ---------- 在哪儿运行 / Where it runs ----------

func (a *App) runPanel(c *ui.Context) {
	t := a.T
	name := a.personaName()
	a.panelHead(c, TabRun, a.L.T("settings.lede.run"))
	a.group(c, "where", a.L.T("settings.where.group"), "", func() {
		if a.Backend == nil {
			// The window talks to a Ducter it didn't start: say where it lives and that
			// closing the window doesn't stop it (never a bare or empty address).
			host := hostOf(a.URL)
			remoteHome := host != "" && !isLoopback(host)
			place, line, art := a.L.T("settings.where.here"), a.L.T("settings.run.apart", name), "mini_awake"
			if remoteHome {
				place, line, art = host, a.L.T("settings.run.remote", name, host), "server_awake"
			}
			a.placeRow(c, art, place, line)
			if remoteHome && a.canWork() {
				a.workBlock(c, "settings") // D155: Let this Mac do tasks for it
			}
			if a.askStopHere && a.hereBackend != nil {
				a.rowBlock(c, "ask-stop", func() { a.askStopHereCard(c, host) })
			}
			if remoteHome && a.UseLocal != nil && a.linkRow(c, "use-here", a.L.T("settings.home.useHere"), a.L.T("settings.where.useHere.help"), false) {
				a.UseLocal()
			}
			if a.Pair != nil && a.linkRow(c, "elsewhere", a.L.T("settings.home.elsewhere"), a.L.T("settings.where.elsewhere.help"), false) {
				a.connectElsewhere()
			}
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
		art := "mini_awake"
		if a.Resting() {
			art = "mini_asleep"
		}
		a.placeRow(c, art, a.L.T("settings.where.here"), line)
		if a.Backend.BackgroundBlocked() {
			a.row(c, "allow", a.L.T("settings.run.allow"), "", func() {
				if a.button(c, a.L.T("settings.run.allow"), btnSecondary, t.ControlMD, t.Surface) {
					_ = a.Backend.OpenSettings(local.SettingsLoginItems)
				}
			})
		}
		if a.Resting() {
			a.row(c, "wake", a.L.T("rest.wake", name), "", func() {
				if a.button(c, a.L.T("rest.wake", name), btnPrimary, t.ControlMD, t.Surface) {
					a.Wake()
				}
			})
		} else {
			a.row(c, "rest", a.L.T("menu.rest"), a.L.T("menu.rest.sub"), func() {
				if a.button(c, a.L.T("settings.rest.go"), btnSecondary, t.ControlMD, t.Surface) {
					a.Rest()
				}
			})
		}
		if a.Pair != nil && a.linkRow(c, "elsewhere", a.L.T("settings.home.elsewhere"), a.L.T("settings.where.elsewhere.help"), false) {
			a.connectElsewhere()
		}
	})
	a.dataGroup(c)
	a.group(c, "devices", "", "", func() {
		if a.linkRow(c, "devices", a.L.T("settings.devices.link"), a.L.T("settings.devices.link.help"), false) {
			a.OpenDevices()
		}
	})
	a.removeEntry(c)
}

// placeRow is the computer Ducter lives on: its clay, its name, and in
// words what happens when the window closes.
func (a *App) placeRow(c *ui.Context, art, place, line string) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("place")).Gap(t.S4).Padding(t.S4, t.S5).AlignItems(ui.Center).Children(func() {
		if bmp := theme.Clay(art); bmp != nil {
			iw, ih := ui.ImageSize(bmp)
			w := float32(72)
			h := w
			if iw > 0 {
				h = w * ih / iw
			}
			ui.Image(c, bmp).Size(w, h).Shrink(0).AccessHidden(true)
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, place).Font(t.Display).FontSize(t.LG).FontWeight(800)
			ui.Text(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
		})
	})
}

// askStopHereCard: the app now uses a Ducter on another computer; asked
// once whether this Mac's own keeps running. Keep is the default: nothing
// is lost either way, and its data stays in ~/.ducter.
func (a *App) askStopHereCard(c *ui.Context, host string) {
	t := a.T
	ui.Column(c.Key("ask-stop-here")).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
		ui.Text(c, a.L.T("settings.home.ask")).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
		ui.Text(c, a.L.T("settings.home.ask.body", host)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
		ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
			if a.button(c, a.L.T("settings.home.stop"), btnSecondary, t.ControlMD, t.SurfaceSunken) {
				a.askStopHere = false
				b := a.hereBackend
				a.async(func() { _ = b.Rest() }, func() {})
			}
			if a.button(c, a.L.T("settings.home.keep"), btnPrimary, t.ControlMD, t.SurfaceSunken) {
				a.askStopHere = false
			}
		})
	})
}

// dataGroup: the data folder, the log, and the same checks the first run
// makes, as rows.
func (a *App) dataGroup(c *ui.Context) {
	t := a.T
	if a.Backend == nil {
		return
	}
	ss := &a.settings
	a.group(c, "data", a.L.T("settings.data.title"), "", func() {
		a.row(c, "folder", a.L.T("settings.data.folder.row"), tildeHome(a.Backend.DataDir()), func() {
			if a.buttonFor(c, a.L.T("settings.data.open"), a.L.T("settings.data.folder.row"), btnSecondary, t.ControlSM, t.Surface) {
				_ = a.Backend.OpenURL(a.Backend.DataDir())
			}
		})
		a.row(c, "logs", a.L.T("settings.data.logs.row"), a.L.T("settings.data.logs.help"), func() {
			if a.buttonFor(c, a.L.T("settings.data.open"), a.L.T("settings.data.logs.row"), btnSecondary, t.ControlSM, t.Surface) {
				_ = a.Backend.OpenURL(a.Backend.LogPath())
			}
		})
		a.row(c, "check", a.L.T("settings.data.check.row"), a.L.T("settings.data.check.help"), func() {
			if ss.checking {
				ui.Text(c, a.L.T("settings.data.checking")).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
				return
			}
			if a.button(c, a.L.T("settings.data.run"), btnSecondary, t.ControlSM, t.Surface) {
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
		if ss.err != "" || ss.report != nil {
			a.rowBlock(c, "checks", func() {
				if ss.err != "" {
					a.reasonLine(c, ss.err)
				}
				if r := ss.report; r != nil {
					a.checkRows(c, *r)
				}
			})
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
			// A drawn mark in its state's ink, no tile (D73).
			glyph := drawCheck(t.Done.Ink)
			if k.Status != "ok" {
				// A check that isn't met: × in its ink, never an alarm "!".
				glyph = drawCross(t.Waiting.Ink)
				if k.Required {
					glyph = drawCross(t.NeedsYou.Ink)
				}
			}
			ui.Row(c.Key("check:" + k.ID)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
				ui.Box(c).Size(20, 20).Draw(glyph).Shrink(0)
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

// ---------- Remove Ducter (D72): last, quiet, exact ----------

// removeEntry is a quiet text button at the end of Where it runs; it
// opens the plan: two choices, then exactly what goes and what stays.
func (a *App) removeEntry(c *ui.Context) {
	t := a.T
	rm, ok := a.Backend.(Remover)
	if a.Backend == nil || !ok {
		return
	}
	r := &a.settings.remove
	if !r.open {
		a.textRow(c, t.ControlSM).Padding(0, t.S1).Children(func() {
			if a.button(c, a.L.T("remove.title"), btnText, t.ControlSM, t.Bg) {
				r.open = true
				a.loadPlan(rm, false)
			}
		})
		return
	}
	a.group(c, "remove", a.L.T("remove.title"), a.L.T("remove.body"), func() {
		if r.done {
			a.rowBlock(c, "done", func() {
				ui.Text(c, a.L.T("remove.done")).FontSize(t.MD).FontWeight(800)
			})
			return
		}
		a.rowBlock(c, "plan", func() {
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
						ui.Text(c, o.name).FontSize(t.MD).FontWeight(700)
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
					ui.Text(c, a.L.T("remove.removes")).FontSize(t.SM).FontWeight(800).TextColor(t.InkMuted)
					for _, it := range p.Remove {
						ui.Text(c.Key("rmi:"+it.Path), it.What+"  "+tildeHome(it.Path)).FontSize(t.SM).MaxLines(2).Selectable()
					}
				}
				if len(p.Keep) > 0 {
					ui.Text(c, a.L.T("remove.keeps")).FontSize(t.SM).FontWeight(800).TextColor(t.InkMuted)
					for _, k := range p.Keep {
						ui.Text(c.Key("rmk:"+k.What), k.What+" · "+tildeHome(k.Detail)).FontSize(t.SM).TextColor(t.InkSoft).MaxLines(2)
					}
				}
			}
			if r.err != "" {
				a.reasonLine(c, r.err)
			}
			if r.all {
				word := a.L.T("remove.confirm.word")
				ui.TextInput(c.Key("input:remove"), &r.word).Placeholder(word).Label(a.L.T("remove.confirm", word)).
					FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft).Width(240)
				a.note(c, a.L.T("remove.confirm", word))
			}
		})
		word := a.L.T("remove.confirm.word")
		a.actions(c, "remove", func() {
			if a.button(c, a.L.T("remove.cancel"), btnText, t.ControlMD, t.Surface) {
				*r = removeState{}
			}
		}, func() {
			ready := r.plan != nil && !r.loading && !r.busy && (!r.all || r.word == word)
			if ready && a.button(c, a.L.T("remove.go"), btnPrimary, t.ControlMD, t.Surface) {
				a.uninstall(rm)
			}
		})
	})
}

func (a *App) uninstall(rm Remover) {
	r := &a.settings.remove
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

// ---------- 更新与关于 / Updates and about ----------

func (a *App) aboutPanel(c *ui.Context) {
	t := a.T
	ss := &a.settings
	// The About card: the clay partner, the name, the version.
	ui.Row(c.Key("about-hero")).Gap(t.S5).AlignItems(ui.Center).Padding(t.S4, t.S6).Radius(t.RadiusXL).Background(t.Clay).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Children(func() {
		a.avatar(c, theme.Idle, 112)
		ui.Column(c).Gap(t.S1).Grow(1).MinWidth(0).Children(func() {
			a.heading(c, "Ducter", t.Title)
			ui.Text(c, a.L.T("settings.about.version", a.versionText())).FontSize(t.MD).FontWeight(700).TextColor(t.InkSoft).Selectable()
			ui.Text(c, a.L.T("settings.about.made")).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		})
	})
	a.appUpdateSection(c)
	a.updateSection(c) // D148: every computer's Ducter version, the update work's own slot (devupdate.go)
	a.group(c, "help", a.L.T("settings.help.group"), "", func() {
		if a.linkRow(c, "docs", a.L.T("settings.about.docs"), "", true) {
			a.openLink(DocsURL)
		}
		if a.linkRow(c, "report", a.L.T("settings.about.report"), "", a.ReportProblem == nil) {
			if a.ReportProblem != nil {
				a.ReportProblem()
			} else {
				a.openLink(ReportURL)
			}
		}
		if a.linkRow(c, "licenses", a.L.T("settings.about.licenses"), "", true) {
			a.openLink(LicensesURL)
		}
	})
	a.group(c, "credits", "", "", func() {
		a.sep(c)
		b := ui.Row(c.Key("credits")).Gap(t.S4).Padding(t.S4, t.S5).MinHeight(60).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("settings.credits")).Expanded(ss.credits).Focusable()
		if b.Hovered() || b.Pressed() {
			b.Background(t.Ink.Alpha(0.03))
		}
		b.Children(func() {
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
				ui.Text(c, a.L.T("settings.credits")).FontSize(t.MD).FontWeight(700)
				ui.Text(c, a.L.T("settings.credits.help")).FontSize(t.SM).TextColor(t.InkMuted)
			})
			a.glyph(c, 16, drawChevron(t.InkMuted, ss.credits))
		})
		if b.Clicked() {
			ss.credits = !ss.credits
		}
		if ss.credits {
			ui.Text(c, a.L.T("settings.sound.credits")).FontSize(t.SM).LineHeight(a.leading(1.6)).TextColor(t.InkSoft).
				Padding(0, t.S5, t.S4, t.S5).Selectable()
		}
	})
}
