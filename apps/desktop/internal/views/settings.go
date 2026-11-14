package views

import (
	"context"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// Updates is what Settings uses of the updater (internal/update).
type Updates interface {
	Status() update.Status
	CheckNow(ctx context.Context) update.Status
	SetInstallOnQuit(on bool)
	// Hint: the home says version v is out (D187).
	Hint(ctx context.Context, v string) bool
}

// Remover removes Ducter from this Mac (local.Host, D72).
type Remover interface {
	UninstallPlan(all bool) (local.UninstallPlan, error)
	Uninstall(p local.UninstallPlan) (local.UninstallResult, error)
}

// 设置 / Settings (D150, after D71): one place for everything you can set,
// as a game's settings menu. A rail of clay tabs on the left, one section
// at a time on the right:
//
//	伙伴 / Partner           the character sheet: name, faces, what it
//	                         thinks with, who does the tasks, how it
//	                         talks, what it asks first
//	记忆 / Memory            what it remembers about you, and Nowledge
//	                         Mem with its version and updates (D257)
//	你的其他 AI / Your other AI agents: the persona's connection with
//	                         them and who may reach it, once it means
//	                         something (D257)
//	通知 / Notifications     when it comes to you, quiet hours, if you
//	                         don't answer
//	账号 / Accounts          the accounts it can read (D96)
//	外观和声音 / Look & sound the look, the window's language, Details,
//	                         the intro's sound
//	在哪儿运行 / Where it runs this Mac or another computer, Stop,
//	                         data and logs, Remove Ducter
//	更新和关于 / Updates & about the update block, the mascot, links,
//	                         credits behind a fold
//
// Every section speaks one vocabulary: a group title on the paper, a white
// card on the clay base, rows of a label and a one-line helper with the
// control at the right end, primary actions as clay buttons at the card's
// end, and quiet text buttons for the rest.

// Links of the app.
const (
	DocsURL     = "https://ducter.ai/docs"
	ReportURL   = "https://github.com/wey-gu/ducter/issues/new"
	LicensesURL = "https://github.com/wey-gu/ducter/blob/main/LICENSE"
)

// The tabs of Settings, in the rail's order.
const (
	TabPartner  = "partner"
	TabMemory   = "memory"
	TabPeers    = "peers"
	TabNotify   = "notify"
	TabAccounts = "accounts"
	TabAutofill = "autofill"
	TabLook     = "look"
	TabRun      = "run"
	TabAbout    = "about"
)

var settingsTabs = []string{TabPartner, TabMemory, TabPeers, TabNotify, TabAccounts, TabAutofill, TabLook, TabRun, TabAbout}

type settingsState struct {
	// tab is the section shown ("" is the first).
	tab      string
	checking bool
	report   *local.Report
	err      string
	updating bool
	remove   removeState
	// rows counts the rows of the card being drawn: a hairline goes
	// above every row but the first.
	rows int
	// credits: 素材和致谢 / Credits is open.
	credits bool
	// cheer is when something on Look and sound was chosen: the partner
	// on the preview smiles for a moment.
	cheer int64
	// sound is the intro's sound while its preview plays.
	sound     TitleSound
	soundFrom int64
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

// OpenSettings shows Settings on the tab last shown (the partner's first).
func (a *App) OpenSettings() { a.openTab(a.settings.tab) }

// OpenPartner is ⌘4 and the partner's face: Settings › Partner.
func (a *App) OpenPartner() { a.openTab(TabPartner) }

// OpenAbout is the app menu's About Ducter: Settings › Updates and about.
func (a *App) OpenAbout() { a.openTab(TabAbout) }

// OpenUpdate is the app menu's update line: Settings › Updates and about,
// checking now unless a version is already on its way or ready. The one
// update flow: its progress, Restart to update and the reasons are all
// that block's.
func (a *App) OpenUpdate() {
	a.openTab(TabAbout)
	u := a.Updates
	if u == nil || a.settings.updating {
		return
	}
	switch u.Status().State {
	case update.Ready, update.Available, update.Checking, update.Downloading:
		return
	}
	ss := &a.settings
	ss.updating = true
	a.async(func() { u.CheckNow(context.Background()) }, func() { ss.updating = false })
}

// openTab shows Settings on a tab, asking the server for what the
// partner's tabs show (and to be told of every change while this socket
// lives).
func (a *App) openTab(tab string) {
	if tab == "" {
		tab = TabPartner
	}
	a.Route, a.settings.tab = RouteSettings, tab
	a.send(protocol.SettingsReq{T: "settings"})
	a.send(protocol.RulesReq{T: "rules"}) // Your rules (D89)
	a.send(protocol.ConnectionsReq{T: "connections"})
	// Where it lives; on Updates and about also so the home reads the
	// latest release again when its answer is older than 15 minutes.
	if a.S.DevicesAt.IsZero() || tab == TabAbout {
		a.send(protocol.DevicesReq{T: "devices"})
	}
	// D226: the reading problem shows under the switch without opening
	// 今天看了什么, so Notifications asks for the day as it opens.
	if tab == TabNotify {
		a.send(protocol.ProactiveDayReq{T: "proactive_day"})
	}
}

// settingsTab is the tab shown.
func (a *App) settingsTab() string {
	if a.Route == RoutePartner {
		return TabPartner
	}
	for _, t := range a.visibleTabs() {
		if t == a.settings.tab {
			return t
		}
	}
	return TabPartner
}

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

// railW is the width of Settings' rail of tabs.
const railW = 264

func (a *App) settingsView(c *ui.Context) {
	t := a.T
	tab := a.settingsTab()
	a.drainForgot()
	a.chrome(c, "settings", func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("nav.settings"))
	}, nil)
	w, _ := c.Size()
	ui.Row(c.Key("settings-body")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
		a.settingsRail(c, tab)
		ui.Scroll(c.Key("settings-scroll:" + tab)).Grow(1).Basis(0).MinWidth(0).Children(func() {
			ui.Row(c).Justify(ui.Center).Padding(t.S6, t.S6, t.S7, t.S6).Children(func() {
				panel := ui.Column(c.Key("panel:" + tab)).Grow(1).MaxWidth(820).Gap(t.S6)
				a.routeEnter(c, panel)
				panel.Children(func() {
					switch tab {
					case TabPartner:
						a.partnerPanel(c, w-railW)
					case TabMemory:
						a.memoryPanel(c)
					case TabPeers:
						a.peersPanel(c)
					case TabNotify:
						a.notifyPanel(c)
					case TabAutofill:
						a.autofillPanel(c)
					case TabAccounts:
						a.accountsPanel(c)
					case TabLook:
						a.lookPanel(c)
					case TabRun:
						a.runPanel(c)
					case TabAbout:
						a.aboutPanel(c)
					}
				})
			})
		})
	})
	if tab == TabPartner {
		a.loadoutToast(c, w)
		a.brainFlyer(c)
	}
}

// tabName is a tab's name in the rail and at the top of its section.
func (a *App) tabName(tab string) string {
	if tab == TabAbout && a.Updates == nil {
		return a.L.T("settings.tab.about.only")
	}
	return a.L.T("settings.tab." + tab)
}

// settingsRail is the rail of tabs: each a chunky clay tab with its clay
// thing and its name. The one shown stands on the card's base, white; the
// others lie flat on the paper and lift a little under the pointer.
func (a *App) settingsRail(c *ui.Context, shown string) {
	t := a.T
	ui.Column(c.Key("settings-rail")).Width(railW).Shrink(0).Padding(t.S6, t.S4, t.S5, t.S5).Gap(t.S2).
		Background(t.Chrome).BorderWidth(0, 1, 0, 0).BorderColor(t.ChromeLine).
		Role(ui.RoleTabList).Label(a.L.T("nav.settings")).Children(func() {
		for _, tab := range a.visibleTabs() {
			a.railTab(c, tab, tab == shown)
		}
		ui.Box(c).Grow(1)
		// The version, quietly, where a game puts its build number.
		ui.Text(c, "Ducter "+a.versionText()).FontSize(t.XS).TextColor(t.InkMuted).Padding(0, t.S3).SingleLine().Selectable()
	})
}

func (a *App) railTab(c *ui.Context, tab string, on bool) {
	t := a.T
	name := a.tabName(tab)
	b := ui.Row(c.Key("tab:"+tab)).Height(56).Gap(t.S3).Padding(0, t.S3, 0, t.S2).Radius(t.RadiusMD).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(name).AccessSelected(on).Focusable()
	down := b.Pressed()
	switch {
	case on:
		b.Background(t.Surface).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color)
	case down:
		b.Background(t.SurfaceSunken)
	case b.Hovered():
		b.Background(t.Surface.Alpha(0.55)).Shadow(0, 2, 0, 0, t.Line.Alpha(0.7))
	}
	a.sink(c, b, down && !on)
	b.Children(func() {
		a.tabIcon(c, tab, 40)
		fg, weight := t.InkSoft, 700
		if on {
			fg, weight = t.Ink, 800
		}
		// D257: Memory says a Nowledge Mem update under its name, in the highlight's ink (D224).
		badge := ""
		if tab == TabMemory {
			if k := memBadge(memUpdate(a.S.Bridge)); k != "" {
				badge = a.L.T(k)
			}
		}
		if badge == "" {
			ui.Text(c, name).FontSize(t.MD).FontWeight(weight).TextColor(fg).Grow(1).MinWidth(0).MaxLines(2).AccessHidden(true)
			return
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(1).AccessHidden(true).Children(func() {
			ui.Text(c, name).FontSize(t.MD).FontWeight(weight).TextColor(fg).SingleLine()
			ui.Text(c, badge).FontSize(t.XS).FontWeight(700).TextColor(t.HighlightInk).SingleLine()
		})
	})
	if b.Clicked() && !on {
		a.openTab(tab)
	}
}

// tabIcon is a tab's clay thing: the partner itself, the clock of when it
// comes to you, the envelope of the accounts it reads, the look's own
// colors as clay pebbles, the computer it runs on, and an arrow up on a
// clay pebble for updates. All art the app already has, or drawn in the
// same clay (a fill on a darker ledge, a highlight along the top).
func (a *App) tabIcon(c *ui.Context, tab string, size float32) {
	box := ui.Box(c.Key("icon")).Size(size, size).Shrink(0).AccessHidden(true)
	var bmp *ui.Bitmap
	switch tab {
	case TabPartner:
		bmp = theme.Face(theme.Idle, size*2)
	case TabMemory:
		box.Draw(a.drawNotebook())
		return
	case TabPeers:
		// Two of the person's own agents' coins, overlapped: literal, not a metaphor (D257).
		small := size * 0.68
		box.Children(func() {
			for i, h := range []string{"coin_claude_code", "coin_codex"} {
				if bmp := theme.Clay(h); bmp != nil {
					ui.Image(c, bmp).Size(small, small).Absolute().Left(float32(i) * (size - small)).Top(float32(i) * (size - small))
				}
			}
		})
		return
	case TabNotify:
		bmp = theme.Clay("wait_clock")
	case TabAccounts:
		bmp = theme.Clay("wait_mail")
	case TabAutofill:
		bmp = theme.Clay("set_autofill")
	case TabRun:
		bmp = theme.Clay("mini_awake")
	case TabLook:
		box.Draw(a.drawSwatches())
		return
	case TabAbout:
		box.Draw(a.drawUpdatePebble())
		return
	}
	if bmp == nil {
		return
	}
	box.Children(func() {
		// Fit the art in the square, keeping its shape.
		iw, ih := ui.ImageSize(bmp)
		w, h := size, size
		if iw > 0 && ih > 0 {
			if iw > ih {
				h = size * ih / iw
			} else {
				w = size * iw / ih
			}
		}
		ui.Image(c, bmp).Size(w, h).Absolute().Left((size - w) / 2).Top((size - h) / 2)
	})
}

// clayDot draws one clay pebble: its ledge a little below, the fill, and
// a highlight along its upper edge.
func clayDot(p *ui.Painter, cx, cy, rad float32, fill, ledge, hi ui.Color) {
	var l ui.Path
	l.Circle(cx, cy+rad*0.16, rad)
	p.FillPath(&l, ledge)
	var f ui.Path
	f.Circle(cx, cy, rad)
	p.FillPath(&f, fill)
	var h ui.Path
	h.MoveTo(cx-rad*0.55, cy-rad*0.45)
	h.QuadTo(cx-rad*0.1, cy-rad*0.8, cx+rad*0.35, cy-rad*0.62)
	p.StrokePath(&h, rad*0.16, hi)
}

// drawSwatches is Look and sound's icon: Pebble's own paper, accent and
// ink as three clay pebbles.
func (a *App) drawSwatches() func(p *ui.Painter, r ui.Rect) {
	t := a.T
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 40
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		clayDot(p, x(13), y(25), 9*s, t.Bg, t.Line2, t.Surface)
		clayDot(p, x(27), y(25), 9*s, t.Ink, hexInk(t), t.Surface.Alpha(0.3))
		clayDot(p, x(20), y(14), 9.5*s, t.Accent, t.PressAccent.Color, t.Surface.Alpha(0.6))
	}
}

// hexInk is the ink pebble's ledge: the ink button's own.
func hexInk(t *theme.Tokens) ui.Color { return t.PressPrimary.Color }

// drawUpdatePebble is Updates and about's icon: an arrow up on a clay
// pebble in the accent.
func (a *App) drawUpdatePebble() func(p *ui.Painter, r ui.Rect) {
	t := a.T
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 40
		cx, cy := r.X+20*s, r.Y+19*s
		clayDot(p, cx, cy, 15*s, t.Accent, t.PressAccent.Color, t.Surface.Alpha(0.55))
		var m ui.Path
		m.MoveTo(cx, cy+7*s)
		m.LineTo(cx, cy-6.5*s)
		m.MoveTo(cx-5.5*s, cy-1.5*s)
		m.LineTo(cx, cy-7*s)
		m.LineTo(cx+5.5*s, cy-1.5*s)
		p.StrokePath(&m, 3.2*s, t.Surface)
	}
}

// ---------- the one vocabulary ----------

// panelHead is a section's name at the top of the panel, and one line
// about what is in it.
func (a *App) panelHead(c *ui.Context, tab, lede string) {
	t := a.T
	ui.Column(c.Key("panel-head")).Gap(t.S1).Children(func() {
		a.heading(c, a.tabName(tab), t.XXL)
		if lede != "" {
			ui.Text(c, lede).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		}
	})
}

// group is one titled group of a section: its title (and a note) on the
// paper, then a white card on the clay base holding its rows.
func (a *App) group(c *ui.Context, key, title, note string, body func()) {
	t := a.T
	ui.Column(c.Key("group:" + key)).Gap(t.S3).Children(func() {
		if title != "" || note != "" {
			ui.Column(c).Gap(2).Padding(0, t.S1).Children(func() {
				if title != "" {
					a.heading(c, title, t.XL)
				}
				if note != "" {
					ui.Text(c, note).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
			})
		}
		a.settings.rows = 0
		ui.Column(c.Key("card:"+key)).Radius(t.RadiusLG).Background(t.Surface).Clip().
			Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Role(ui.RoleGroup).Label(title).Children(body)
	})
}

// sep is the hairline between two rows of a card, set in from its sides.
func (a *App) sep(c *ui.Context) {
	if a.settings.rows > 0 {
		ui.Box(c).Height(1).Margin(0, a.T.S5).Background(a.T.LineSoft).Shrink(0)
	}
	a.settings.rows++
}

// row is one line of a card: its label and a one-line helper on the left,
// its control at the right end.
func (a *App) row(c *ui.Context, key, label, help string, control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("row:"+key)).Gap(t.S5).Padding(t.S4, t.S5).MinHeight(68).AlignItems(ui.Center).Children(func() {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, label).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			if help != "" {
				ui.Text(c, help).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
		})
		if control != nil {
			ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(control)
		}
	})
}

// sideTone is how a valueRow's status reads: quiet, plain ink, done or
// failed.
type sideTone int

const (
	sideMuted sideTone = iota
	sideInk
	sideDone
	sideFailed
)

func (a *App) sideInk(tone sideTone) ui.Color {
	t := a.T
	switch tone {
	case sideInk:
		return t.Ink
	case sideDone:
		return t.Done.Ink
	case sideFailed:
		return t.Failed.Ink
	}
	return t.InkMuted
}

// valueRow is one line of a list inside free content (a sheetCard): a
// title, with a mark after it (a dot), and a quiet line under it at the
// left; a value (a version, in mono) and its status at the right end, the
// status built from sideStatus and sideLink only. below: what shows under
// the row (an action, a failure's why), or nil. Every state of the row
// lives in it: nothing about one row stands on its own line in the list.
func (a *App) valueRow(c *ui.Context, key, title, sub string, mark func(), value string, status func(), below func()) {
	t := a.T
	ui.Column(c.Key("vrow:" + key)).Gap(t.S2).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					ui.Text(c, title).FontSize(t.MD).FontWeight(800).SingleLine()
					if mark != nil {
						mark()
					}
				})
				if sub != "" {
					ui.Text(c, sub).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
			})
			ui.Column(c).Gap(2).AlignItems(ui.End).Shrink(0).Children(func() {
				if value != "" {
					ui.Text(c, value).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
				}
				if status != nil {
					status()
				}
			})
		})
		if below != nil {
			below()
		}
	})
}

// sideStatus is a valueRow's status words: one short line, XS, in its tone.
func (a *App) sideStatus(c *ui.Context, text string, tone sideTone) {
	t := a.T
	w := 700
	if tone == sideMuted {
		w = 500
	}
	ui.Text(c, text).FontSize(t.XS).FontWeight(w).TextColor(a.sideInk(tone)).SingleLine()
}

// sideLink is a valueRow's status that does something: the same words and
// size as sideStatus, a pointer, ink on hover; chevron 1 (closed) or 2
// (open) when it opens more under the row. It reports a click.
func (a *App) sideLink(c *ui.Context, key, text, about string, tone sideTone, chevron int) bool {
	t := a.T
	name := text
	if about != "" {
		name = text + " · " + about
	}
	b := ui.Row(c.Key("side:" + key)).Gap(3).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name).Focusable()
	if chevron != 0 {
		b.Expanded(chevron > 1)
	}
	col := a.sideInk(tone)
	if b.Hovered() || b.Pressed() {
		col = t.Ink
	}
	b.Children(func() {
		ui.Text(c, text).FontSize(t.XS).FontWeight(700).TextColor(col).SingleLine().AccessHidden(true)
		if chevron != 0 {
			a.glyph(c, 10, drawChevron(col, chevron > 1))
		}
	})
	return b.Clicked()
}

// rowBlock is a row that holds something else than a label and a control
// (a list, a form, a hero): the card's padding, the hairline above.
func (a *App) rowBlock(c *ui.Context, key string, body func()) {
	t := a.T
	a.sep(c)
	ui.Column(c.Key("block:"+key)).Gap(t.S3).Padding(t.S4, t.S5).Children(body)
}

// toggleRow is a row whose control is a switch. It returns the new value
// when it was flipped.
func (a *App) toggleRow(c *ui.Context, key, label, help string, on bool) (bool, bool) {
	v, changed := on, false
	a.row(c, key, label, help, func() {
		changed = a.switchControl(c, key, label, &v)
	})
	return v, changed
}

// linkRow is a row that goes somewhere: the whole row is the button, a ›
// (or ↗ for a page outside the app) at its end. It reports a click.
func (a *App) linkRow(c *ui.Context, key, label, help string, out bool) bool {
	t := a.T
	a.sep(c)
	b := ui.Row(c.Key("link:"+key)).Gap(t.S4).Padding(t.S4, t.S5).MinHeight(60).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(label).Focusable()
	switch {
	case b.Pressed():
		b.Background(t.Ink.Alpha(0.06))
	case b.Hovered():
		b.Background(t.Ink.Alpha(0.03))
	}
	b.Children(func() {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, label).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			if help != "" {
				ui.Text(c, help).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
		})
		mark := drawChevron(t.InkMuted, false)
		if out {
			mark = drawOut(t.InkMuted)
		}
		a.glyph(c, 16, mark)
	})
	return b.Clicked()
}

// actions is a card's last line: its clay buttons at the right end, a
// quiet text button (if any) at the left.
func (a *App) actions(c *ui.Context, key string, quiet, buttons func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("actions:"+key)).Gap(t.S2).Padding(t.S3, t.S5, t.S4, t.S5).AlignItems(ui.Center).Children(func() {
		if quiet != nil {
			a.textRow(c, t.ControlMD).Gap(t.S1).Children(quiet)
		}
		ui.Box(c).Grow(1)
		if buttons != nil {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(buttons)
		}
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

// isLoopback reports whether host (with or without a port) is this computer.
func isLoopback(host string) bool {
	h := host
	if i := strings.LastIndex(h, ":"); i > 0 && !strings.HasSuffix(h, "]") {
		h = h[:i]
	}
	h = strings.Trim(h, "[]")
	return h == "localhost" || h == "::1" || strings.HasPrefix(h, "127.")
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
