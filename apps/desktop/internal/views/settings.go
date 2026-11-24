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
//	和你的其他 agent 通信 / Talk with your other agents (D332): the persona's connection with
//	                         them and who may reach it, once it means
//	                         something (D257)
//	通知 / Notifications     when it comes to you, quiet hours, if you
//	                         don't answer
//	账号 / Accounts          the accounts it can read (D96)
//	待办来源 / To-do sources  the to-dos in GitHub and Obsidian it can
//	                         take on (D341, todos.go)
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

var settingsTabs = []string{TabHome, TabPartner, TabMemory, TabPeers, TabNotify, TabAccounts, TabTodos, TabChats, TabAutofill, TabLook, TabRun, TabAbout}

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
	// said is when a change the partner answers was made (saidLine, D296).
	said map[string]saidWord
	// memTried: 再试一次 was pressed while the home still lacked the tool
	// to install Mem with, so the step says it was tried (D404).
	memTried bool
	// railFrom is the tab shown before this one, so the pane comes in
	// from the way the rail's knob went (D296).
	railFrom string
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
		tab = TabHome // D469: Settings opens on the partner's brief
	}
	if a.Route == RouteSettings || a.Route == RoutePartner {
		a.settings.railFrom = a.settingsTab()
	} else {
		a.settings.railFrom = ""
	}
	if tab == TabPeers {
		// Once open, the page stays in the rail for the session: a move
		// that goes to connecting (or fails) must not take the page, and
		// what it says, away under the person (the Mac walk of 0.0.98).
		a.peersAsked = true
	}
	if tab != a.settings.tab {
		// "Tried again just now" belongs to the page it was tried on (the
		// Mac walk of 0.0.98: it followed to Agent messaging, minutes later).
		a.settings.memTried = false
		a.chats.order = nil // D500: the chat apps are ordered afresh on each visit
	}
	a.Route, a.settings.tab = RouteSettings, tab
	a.send(protocol.SettingsReq{T: "settings"})
	a.send(protocol.RulesReq{T: "rules"}) // Your rules (D89)
	a.send(protocol.ConnectionsReq{T: "connections"})
	// Where it runs; on Updates and about also so the home reads the
	// latest release again when its answer is older than 15 minutes.
	if a.S.DevicesAt.IsZero() || tab == TabAbout {
		a.send(protocol.DevicesReq{T: "devices"})
	}
	// D226: the reading problem shows under the switch without opening
	// 今天看了什么, so Notifications asks for the day as it opens.
	if tab == TabNotify {
		a.send(protocol.ProactiveDayReq{T: "proactive_day"})
	}
	// D276: 聊天软件 / Chat apps (the socket stays subscribed after); D469: Overview says where
	// else the partner can be found.
	if tab == TabChats || tab == TabHome {
		a.send(protocol.ChannelsReq{T: "channels"})
	}
	// D341: 待办来源 / To-do sources (subscribed after; the home looks again).
	if tab == TabTodos {
		a.todos.removing, a.todos.addErr = "", ""
		a.send(protocol.SourcesReq{T: "sources"})
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
	return TabHome
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

// railW is the width of Settings' rail of tabs; railTabH a tab's height.
const (
	railW    = 264
	railTabH = 56
)

// railKnob is the rail's chosen-tab knob's identity: it slides from the
// tab left to the tab shown.
type railKnob struct{}

func (a *App) settingsView(c *ui.Context) {
	t := a.T
	tab := a.settingsTab()
	a.drainForgot()
	a.placeBar(c, "settings", RouteSettings, func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("nav.settings"))
	}, nil)
	w, _ := c.Size()
	ui.Row(c.Key("settings-body")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
		a.settingsRail(c, tab)
		a.toastsOver(ui.Scroll(c.Key("settings-scroll:" + tab)).Grow(1).Basis(0).MinWidth(0)).Children(func() {
			ui.Row(c).Justify(ui.Center).Padding(t.S6, t.S6, t.S7, t.S6).Children(func() {
				// D289: 24 between sections, 8 within one (D273's rhythm).
				panel := ui.Column(c.Key("panel:" + tab)).Grow(1).MaxWidth(820).Gap(t.S5)
				a.paneEnter(c, panel, tab)
				panel.Children(func() {
					switch tab {
					case TabHome:
						a.homePanel(c)
					case TabPartner:
						a.partnerPanel(c, w-railW)
					case TabMemory:
						a.memoryPanel(c)
					case TabPeers:
						a.peersPanel(c)
					case TabNotify:
						a.notifyPanel(c)
					case TabChats:
						a.chatsPanel(c)
					case TabTodos:
						a.todosPanel(c)
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
		tabs := a.visibleTabs()
		// D296: the chosen tab's knob is its own piece under the tabs, so it
		// slides from the tab left to the tab shown, as the places' knob
		// does (D290), rather than blink from one row to the next.
		for i, tab := range tabs {
			if tab != shown {
				continue
			}
			an := t.Nav.Across
			k := ui.Box(c.Key("rail-knob")).Absolute().Left(t.S5).Top(t.S6 + float32(i)*(railTabH+t.S2)).
				Width(railW - t.S5 - t.S4 - 1).Height(railTabH).Radius(t.RadiusMD).AccessHidden(true).IgnoreInput(true).
				Transition(ui.ElementTransition{Animation: &an, Match: railKnob{}})
			a.knob(k)
		}
		for _, tab := range tabs {
			a.railTab(c, tab, tab == shown)
		}
		ui.Box(c).Grow(1)
		// The version, quietly, where a game puts its build number.
		uiText(c, "Ducter "+a.versionText()).FontSize(t.XS).TextColor(t.InkMuted).Padding(0, t.S3).SingleLine().Selectable()
	})
}

func (a *App) railTab(c *ui.Context, tab string, on bool) {
	t := a.T
	name := a.tabName(tab)
	if tab == TabPeers {
		name = a.L.T("settings.short.peers") // D332: the rail's short label; the page title stays whole
	}
	b := ui.Row(c.Key("tab:"+tab)).Height(railTabH).Gap(t.S3).Padding(0, t.S3, 0, t.S2).Radius(t.RadiusMD).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(name).AccessSelected(on).Focusable().ZIndex(1) // over the knob
	down := b.Pressed()
	switch {
	case on:
		// The knob under it is the chosen look (settingsRail).
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
			uiText(c, name).FontSize(t.MD).FontWeight(weight).TextColor(fg).Grow(1).MinWidth(0).MaxLines(2).AccessHidden(true)
			return
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(1).AccessHidden(true).Children(func() {
			uiText(c, name).FontSize(t.MD).FontWeight(weight).TextColor(fg).SingleLine()
			uiText(c, badge).FontSize(t.XS).FontWeight(700).TextColor(t.HighlightInk).SingleLine()
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
	case TabHome:
		// D469: the home computer, in its clay: where the partner lives.
		art := "mini_awake"
		if h := a.homeDevice(); h != nil {
			art = deviceArt(h)
		}
		bmp = theme.Clay(art)
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
	case TabTodos:
		bmp = theme.Clay(todosArt) // D348: a note page with a ticked box
	case TabAutofill:
		bmp = theme.Clay("set_autofill")
	case TabRun:
		bmp = theme.Clay("mini_awake")
	case TabLook:
		box.Draw(a.drawSwatches())
		return
	case TabChats:
		// D283: two clay speech bubbles, the cream one and the sky one.
		bmp = theme.Clay("set_chats")
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
	// D469: the partner says what is true here, in its voice; what needs you here follows.
	a.paneSpeaks(c, tab, a.paneSay(tab, lede))
}

// ledeNote is a second, smaller line close under a pane's lede (D399): what is true of the
// whole pane (who owns a to-do, where the saved things are kept, what the chat apps are sent),
// said once at the top, never left under the last card.
func (a *App) ledeNote(c *ui.Context, key, text string) {
	t := a.T
	uiText(c.Key(key), text).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Margin(-t.S3, 0, 0, 0)
}

// how is the quiet tap that keeps an explanation reachable without showing it (D424): 怎么做到的 /
// How it works under a row or a note; pressed, the explanation opens under it in the muted ink
// and the tap reads 收起 / Hide. about names what it explains, for assistive technology.
func (a *App) how(c *ui.Context, key, about, detail string) {
	t := a.T
	open := a.open["how:"+key]
	label := a.L.T("how.more")
	if open {
		label = a.L.T("how.less")
	}
	ui.Column(c.Key("how:" + key)).Gap(t.S1).Children(func() {
		ui.Row(c).Children(func() {
			if a.quietLink(c, "how:"+key, label, spoken(a.L, about, label)) {
				a.open["how:"+key] = !open
			}
		})
		if open {
			uiText(c, detail).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		}
	})
}

// explainedRow is a row whose words are its label, at most one short line, and the explanation
// behind how (D424); its control at the right end.
func (a *App) explainedRow(c *ui.Context, key, label, help, detail string, control func()) {
	t := a.T
	a.sep(c)
	// D445: the same least height as tileRow (64), so a pane's rows read as one rhythm.
	// D459: the same words-then-control as row and tileRow, so a narrow window drops its
	// control under the words here too (D445).
	ui.Row(c.Key("row:"+key)).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		a.wordsThenControl(c, func() {
			uiText(c, label).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			if help != "" {
				uiText(c, help).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
			a.how(c, key, label, detail)
		}, control)
	})
}

// ledeHow is how under a pane's lede note (D424): the note stays one short line.
func (a *App) ledeHow(c *ui.Context, key, about, detail string) {
	ui.Column(c.Key("ledehow:"+key)).Margin(-a.T.S4, 0, 0, 0).Children(func() {
		a.how(c, key, about, detail)
	})
}

// groupHow is a group whose one short note has how under it (D424), on the paper above the card.
func (a *App) groupHow(c *ui.Context, key, title, note, detail string, body func()) {
	t := a.T
	ui.Column(c.Key("group:" + key)).Gap(t.S2).Children(func() {
		a.sectionHead(c, title, note)
		ui.Column(c).Padding(0, t.S5).Children(func() {
			a.how(c, key, title, detail)
		})
		a.settings.rows = 0
		ui.Column(c.Key("card:"+key)).Radius(t.RadiusLG).Background(t.Surface).Clip().
			Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Role(ui.RoleGroup).Label(title).Children(body)
	})
}

// group is one titled group of a section: its title (and a note) on the
// paper, then a white card on the clay base holding its rows.
func (a *App) group(c *ui.Context, key, title, note string, body func()) {
	t := a.T
	// D289: the header is small and on the rows' text edge (D273), 8 above the card.
	ui.Column(c.Key("group:" + key)).Gap(t.S2).Children(func() {
		a.sectionHead(c, title, note)
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
	// D445: the same least height as tileRow (64), so a pane's rows read as one rhythm.
	ui.Row(c.Key("row:"+key)).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		// D445: the words keep their width; a narrow window drops the control under them.
		a.wordsThenControl(c, func() {
			uiText(c, label).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			if help != "" {
				uiText(c, help).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
		}, control)
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
					uiText(c, title).FontSize(t.MD).FontWeight(800).SingleLine()
					if mark != nil {
						mark()
					}
				})
				if sub != "" {
					uiText(c, sub).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
			})
			ui.Column(c).Gap(2).AlignItems(ui.End).Shrink(0).Children(func() {
				if value != "" {
					uiText(c, value).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
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

// stateRow is a card's row for one thing that has a version and a state
// (D374: a computer in Updates and about's versions card), laid out as
// every row is: the hairline above, the name and its line on the left with
// its state under them (sideStatus, sideLink), the value in mono and the one
// action at the right end, centred on the row. below: what opens under it
// (a failure's why, the update's button), on the row's text edge.
func (a *App) stateRow(c *ui.Context, key, title, sub string, state func(), value string, action func(), below func()) {
	t := a.T
	a.sep(c)
	ui.Column(c.Key("srow:"+key)).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
		ui.Row(c).Gap(t.S5).MinHeight(36).AlignItems(ui.Center).Children(func() {
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
				uiText(c, title).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
				if sub != "" {
					uiText(c, sub).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
				if state != nil {
					state()
				}
			})
			ui.Row(c).Shrink(0).Gap(t.S4).AlignItems(ui.Center).Children(func() {
				if value != "" {
					uiText(c, value).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable()
				}
				if action != nil {
					action()
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
	uiText(c, text).FontSize(t.XS).FontWeight(w).TextColor(a.sideInk(tone)).SingleLine()
}

// sideLink is a valueRow's status that does something: the same words and
// size as sideStatus, a pointer, ink on hover; chevron 1 (closed) or 2
// (open) when it opens more under the row. It reports a click.
func (a *App) sideLink(c *ui.Context, key, text, about string, tone sideTone, chevron int) bool {
	t := a.T
	name := text
	if about != "" {
		name = text + ", " + about
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
		uiText(c, text).FontSize(t.XS).FontWeight(700).TextColor(col).SingleLine().AccessHidden(true)
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
	a.rowHover(c, b, groundNeutral(), false) // D529
	b.Children(func() {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			uiText(c, label).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			if help != "" {
				uiText(c, help).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
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

// actions is a card's last line, read from its left edge like every row
// (D543): its clay buttons first, the primary leading, then the quiet
// text button (Cancel, Back) after them.
func (a *App) actions(c *ui.Context, key string, quiet, buttons func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("actions:"+key)).Gap(t.S2).Padding(t.S3, t.S5, t.S4, t.S5).AlignItems(ui.Center).Children(func() {
		a.cardEndLine(c, t.ControlMD, quiet, buttons)
	})
}

// cardEnd is actions' line inside a card that pads its own content (a
// sheet card): no hairline, no padding of its own; the same order.
func (a *App) cardEnd(c *ui.Context, h float32, quiet, buttons func()) {
	t := a.T
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		a.cardEndLine(c, h, quiet, buttons)
	})
}

// cardEndLine is a card's last line: the clay first, the quiet way out after it.
func (a *App) cardEndLine(c *ui.Context, h float32, quiet, buttons func()) {
	t := a.T
	if buttons != nil {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(buttons)
	}
	if quiet != nil {
		a.textRow(c, h).Gap(t.S1).Children(quiet)
	}
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

// paneEnter is how a pane comes in (D296, D290's vocabulary): from
// another place, the route's own entrance; from another tab, a short rise
// from the side the rail's knob came from (down the rail it comes up from
// below, up the rail from above), on Across's spring, as the knob slides.
func (a *App) paneEnter(c *ui.Context, e ui.Element, tab string) {
	from := a.settings.railFrom
	if from == "" || from == tab {
		a.routeEnter(c, e)
		return
	}
	if c.Preferences().ReduceMotion {
		return
	}
	shown := ui.Local(e, "entered", func() bool { return false })
	p := ui.Pose{}
	if !*shown {
		dir := float32(1)
		if a.tabIndex(tab) < a.tabIndex(from) {
			dir = -1
		}
		p, *shown = ui.Pose{Y: dir * a.T.Nav.Rise * 2, Fade: 1}, true
		c.Invalidate()
	}
	e.AnimatePose(p, a.T.Nav.Across)
}

// tabIndex is a tab's place in the rail.
func (a *App) tabIndex(tab string) int {
	for i, x := range a.visibleTabs() {
		if x == tab {
			return i
		}
	}
	return 0
}
