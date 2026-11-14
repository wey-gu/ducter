package views

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Settings › 记忆 / Memory and › 你的其他 AI / Your other AI agents (D257),
// each its own tab. Memory is what the partner remembers about the person,
// first, in their words: the partner hugging its notebook and one sentence,
// then what it noted grouped by when (each one forgettable), then Nowledge
// Mem itself (where it is, its version, a newer one, putting it in, signing
// in). The rules are the web's (apps/web/src/mem-view.ts).

// memMin is the first nmem with `bridge connections` (D225).
const memMin = "0.10.118"

const memSite = "https://mem.nowledge.co"

// memPhase is where the partner's memory stands: off, missing, install,
// installing, sign_in, signing_in, or on (Mem answers).
func memPhase(memoryOn bool, mem *protocol.MemView, b *protocol.BridgeView) string {
	if !memoryOn {
		return "off"
	}
	if b == nil {
		if mem != nil && mem.State == "connected" {
			return "on"
		}
		return "missing"
	}
	switch b.State {
	case "install_mem":
		return "install"
	case "installing", "sign_in", "signing_in":
		return b.State
	}
	// Every other state has a signed-in nmem on the home (an older one still remembers).
	return "on"
}

// memUpd is the one thing about Mem's own version worth saying: updating,
// done, needed (Bridge needs it), move, newer (Ducter can run it), app (only
// the Nowledge Mem app can).
type memUpd struct {
	Kind              string
	Move, CanRun, App bool
	Version, Newer    string
	Done              string
	Detail            string
	Kept              bool
}

func memUpdate(b *protocol.BridgeView) *memUpd {
	if b == nil {
		return nil
	}
	newer := ""
	if b.Newer != nil {
		newer = *b.Newer
	}
	switch {
	case b.State == "updating":
		return &memUpd{Kind: "updating", Move: b.Upkeep != nil && b.Upkeep.Kind == "move"}
	case b.Done != "" && b.Done != "installed":
		return &memUpd{Kind: "done", Done: b.Done}
	case b.State == "update_mem":
		return &memUpd{Kind: "needed", CanRun: b.CanRun, Move: b.Upkeep != nil && b.Upkeep.Kind == "move", App: b.Need == "app" || b.Version == "", Version: b.Version, Detail: b.Detail, Kept: b.Kept}
	case b.Upkeep != nil && b.Upkeep.Kind == "move":
		return &memUpd{Kind: "move", Detail: b.Upkeep.Detail, Kept: b.Upkeep.Kept}
	case b.Upkeep != nil && b.Upkeep.Kind == "update":
		return &memUpd{Kind: "newer", Newer: newer, Version: b.Version, Detail: b.Upkeep.Detail, Kept: b.Upkeep.Kept}
	case b.Newer != nil:
		return &memUpd{Kind: "app", Newer: newer, Version: b.Version}
	}
	return nil
}

// memBadge is the Memory tab's line in the rail: a key, or "".
func memBadge(u *memUpd) string {
	switch {
	case u == nil:
		return ""
	case u.Kind == "needed":
		return "mem.badge.needed"
	case u.Kind == "newer" || u.Kind == "app":
		return "mem.badge.newer"
	}
	return ""
}

// peersShown: 你的其他 AI shows once it means something (J6): another agent
// wrote, the person trusted or muted one, or Mem is on the home and signed in.
func peersShown(p *protocol.Peers, b *protocol.BridgeView, seen bool) bool {
	if p == nil {
		return false
	}
	if seen || len(p.Trusted) > 0 || len(p.Muted) > 0 {
		return true
	}
	if b == nil {
		return false
	}
	switch b.State {
	case "install_mem", "installing", "sign_in", "signing_in":
		return false
	}
	return true
}

// notedGroup is the noted lines of one "when": today, week (the last 7
// days), earlier.
type notedGroup struct {
	When  string
	Items []protocol.Noted
}

func groupNoted(noted []protocol.Noted, now time.Time) []notedGroup {
	y, m, d := now.Date()
	day0 := time.Date(y, m, d, 0, 0, 0, 0, now.Location())
	week0 := day0.AddDate(0, 0, -6)
	var out []notedGroup
	for _, n := range noted {
		when := "earlier"
		if at, err := time.Parse(time.RFC3339, n.At); err == nil {
			switch {
			case !at.Before(day0):
				when = "today"
			case !at.Before(week0):
				when = "week"
			}
		}
		if len(out) > 0 && out[len(out)-1].When == when {
			out[len(out)-1].Items = append(out[len(out)-1].Items, n)
		} else {
			out = append(out, notedGroup{When: when, Items: []protocol.Noted{n}})
		}
	}
	return out
}

// peersSeen: another agent has written to the partner (J6).
func (a *App) peersSeen() bool {
	for _, e := range a.S.Channel {
		if e.Peer != nil {
			return true
		}
	}
	return false
}

// visibleTabs is the rail: 你的其他 AI only once it means something.
func (a *App) visibleTabs() []string {
	var p *protocol.Peers
	if a.S.Settings != nil {
		p = a.S.Settings.Peers
	}
	if peersShown(p, a.S.Bridge, a.peersSeen()) {
		return settingsTabs
	}
	out := make([]string, 0, len(settingsTabs))
	for _, t := range settingsTabs {
		if t != TabPeers {
			out = append(out, t)
		}
	}
	return out
}

// memHome is the computer Mem is about: the home.
func (a *App) memHome() string {
	if b := a.S.Bridge; b != nil && b.Home != "" {
		return b.Home
	}
	return a.homeName()
}

// ---------- 记忆 / Memory ----------

func (a *App) memoryPanel(c *ui.Context) {
	a.panelHead(c, TabMemory, a.L.T("settings.lede.memory", a.personaName()))
	if a.loadingLine(c) {
		return
	}
	st := a.S.Settings
	b := a.S.Bridge
	phase := memPhase(st.Memory, a.S.Mem, b)
	a.partnerToast(c)
	a.memHero(c, st, phase)
	if u := memUpdate(b); u != nil && phase == "on" && (u.Kind == "updating" || u.Kind == "needed" || u.Kind == "newer" || u.Kind == "app") {
		a.memUpdateCard(c, u)
	}
	if st.Memory && a.S.Mem != nil && len(a.S.Mem.Noted) > 0 {
		a.memNotes(c, a.S.Mem.Noted)
	}
	a.memApp(c, phase, b)
}

// memHero is the partner with its notebook, one sentence of what it
// remembers, and the switch, on one clay card.
func (a *App) memHero(c *ui.Context, st *protocol.Settings, phase string) {
	t := a.T
	name := a.personaName()
	face := map[string]theme.Presence{"on": theme.Done, "off": theme.Napping, "installing": theme.Working, "signing_in": theme.Working, "sign_in": theme.Waiting}[phase]
	if face == "" {
		face = theme.Idle
	}
	var title, body string
	switch phase {
	case "on":
		title, body = a.L.T("mem.hero.on", name), a.L.T("mem.hero.on.body")
		if a.S.Mem == nil || len(a.S.Mem.Noted) == 0 {
			body = a.L.T("mem.hero.empty.body")
		}
	case "off":
		title, body = a.L.T("mem.hero.off", name), a.L.T("partner.memory.off")
	case "sign_in":
		title, body = a.L.T("mem.hero.signin"), a.L.T("mem.hero.signin.body")
	case "installing", "signing_in":
		title, body = a.L.T("mem.hero.busy"), a.L.T("mem.hero.missing.body")
	default:
		title, body = a.L.T("mem.hero.missing", name), a.L.T("mem.hero.missing.body")
	}
	bg := t.Clay
	if phase == "off" || phase == "missing" {
		bg = t.Sunken
	}
	ui.Column(c.Key("mem-hero")).Radius(t.RadiusXL).Background(bg).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).
		Role(ui.RoleGroup).Label(a.L.T("settings.tab.memory")).Children(func() {
		ui.Row(c).Gap(t.S5).AlignItems(ui.Center).Padding(t.S5, t.S6, t.S4, t.S5).Children(func() {
			a.avatar(c, face, 112)
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).MaxWidth(600).Gap(t.S2).Children(func() {
				a.heading(c, title, t.XL*1.2) // under the tab's own 28: the page's one warm line, not a second title
				ui.Text(c, body).FontSize(t.MD).LineHeight(a.leading(1.6)).TextColor(t.InkSoft)
			})
		})
		if phase != "on" && phase != "off" {
			return
		}
		ui.Box(c).Height(1).Margin(0, t.S6, 0, t.S6).Background(t.Line.Alpha(0.7)).Shrink(0)
		ui.Row(c.Key("mem-switch")).Gap(t.S4).AlignItems(ui.Center).Padding(t.S4, t.S6, t.S5, t.S6).Children(func() {
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				ui.Text(c, a.L.T("partner.memory.switch")).FontSize(t.MD).FontWeight(700)
				if st.Memory {
					a.note(c, a.L.T("mem.switch.note"))
				}
			})
			v := st.Memory
			if a.switchControl(c, "memory", a.L.T("partner.memory.switch"), &v) {
				st.Memory = v
				a.SetSettings(protocol.SettingsPatch{Memory: &v})
			}
		})
	})
}

// memUpdateCard is the update worth the person's tap, in the highlight
// (D213, D224): Bridge needs it, or Mem says a newer one is out.
func (a *App) memUpdateCard(c *ui.Context, u *memUpd) {
	t := a.T
	home := a.memHome()
	bg, ink := t.Highlight, t.HighlightInk
	if u.Kind == "updating" {
		bg, ink = t.Working.Surface, t.Working.Ink
	}
	var title, line string
	var action func()
	switch u.Kind {
	case "updating":
		title = a.L.T("bridge.mem.updating", home)
		if u.Move {
			title = a.L.T("bridge.mem.moving", home)
		}
		action = func() {
			label := a.L.T("bridge.mem.busy.update")
			if u.Move {
				label = a.L.T("bridge.mem.busy.move")
			}
			ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(ink)
		}
	case "needed":
		title = a.L.T("mem.update.needed")
		switch {
		case u.CanRun && u.Move:
			line = a.L.T("bridge.mem.update.move", home, u.Version, memMin)
		case u.CanRun:
			line = a.L.T("bridge.mem.update", home, u.Version, memMin)
		case u.App:
			line = a.L.T("bridge.update", home)
		default:
			line = a.L.T("bridge.mem.update.other", home, u.Version, memMin)
		}
	default: // newer, app
		title = a.L.T("mem.update.newer.any")
		if u.Newer != "" {
			title = a.L.T("mem.update.newer", u.Newer)
		}
		switch {
		case u.Kind == "app":
			line = a.L.T("mem.update.app.body", home)
		case u.Version != "":
			line = a.L.T("mem.update.newer.body", home, u.Version)
		default:
			line = a.L.T("mem.update.newer.body.any")
		}
	}
	if (u.Kind == "needed" && u.CanRun) || u.Kind == "newer" {
		action = func() {
			label := a.L.T("bridge.mem.update.go")
			if u.Detail != "" {
				label = a.L.T("bridge.retry")
			}
			if a.buttonFor(c, label, home, btnPrimary, t.ControlMD, bg) {
				if b := a.S.Bridge; b != nil {
					b.State = "updating"
				}
				a.send(protocol.BridgeAction{T: "bridge_mem_install"})
			}
		}
	}
	row := ui.Row(c.Key("mem-update")).Gap(t.S4).AlignItems(ui.Center).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(bg).
		Shadow(0, 4, 0, 0, bg.Mix(t.Ink, 0.16)).Role(ui.RoleStatus)
	a.enter(c, row)
	row.Children(func() {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S1).Children(func() {
			ui.Text(c, title).FontSize(t.LG).FontWeight(800).TextColor(ink)
			if line != "" {
				ui.Text(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(ink.Alpha(0.86))
			}
			if u.Detail != "" {
				ui.Text(c, a.memFailed(false, home, u.Detail, u.Kept)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(ink).Selectable()
			}
		})
		if action != nil {
			ui.Row(c).Shrink(0).Children(action)
		}
	})
}

// memNotes is what it noted, by when; each line can be forgotten (in Mem
// when it has the id), and a door into Mem for everything.
func (a *App) memNotes(c *ui.Context, noted []protocol.Noted) {
	t := a.T
	a.group(c, "mem-notes", a.L.T("mem.notes.title"), a.L.T("mem.notes.lede"), func() {
		for gi, g := range groupNoted(noted, a.Now()) {
			g := g
			if gi > 0 {
				ui.Box(c).Height(1).Background(t.LineSoft).Shrink(0)
			}
			ui.Column(c.Key("mem-when:"+g.When)).Padding(t.S4, t.S5, t.S2, t.S5).Children(func() {
				ui.Text(c, a.L.T("mem.when."+g.When)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				for i, n := range g.Items {
					n := n
					if i > 0 {
						ui.Box(c).Height(1).Margin(0, 0, 0, 8+t.S3).Background(t.LineSoft).Shrink(0)
					}
					ui.Row(c.Key("noted:"+itoa(n.Seq))).Gap(t.S3).AlignItems(ui.Start).Padding(t.S3, 0).Children(func() {
						// A small clay pebble in the accent on its ledge: a thing kept.
						ui.Box(c).Size(8, 10).Margin(7, 0, 0, 0).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
							p.Fill(ui.Rect{X: r.X, Y: r.Y + 1.5, W: 8, H: 8}, t.PressAccent.Color, 4)
							p.Fill(ui.Rect{X: r.X, Y: r.Y, W: 8, H: 8}, t.Accent, 4)
						})
						ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
							ui.Text(c, n.Title).FontSize(t.MD).FontWeight(600).LineHeight(a.leading(1.45)).MaxLines(3)
							if ago := a.agoLong(n.At); ago != "" {
								ui.Text(c, ago).FontSize(t.XS).TextColor(t.InkMuted)
							}
						})
						if a.buttonFor(c, a.L.T("partner.memory.forget"), n.Title, btnText, t.ControlSM, t.Surface) {
							if a.partner.forgetting == nil {
								a.partner.forgetting = map[int64]string{}
							}
							a.partner.forgetting[n.Seq] = n.Title
							a.send(protocol.MemoryForget{T: "memory_forget", Seq: n.Seq})
						}
					})
				}
			})
		}
		a.settings.rows = 1 // the hairline above the door
		if a.linkRow(c, "mem-all", a.L.T("mem.notes.all"), "", true) {
			a.openLink(memSite)
		}
	})
}

// memApp is Nowledge Mem itself: where it is and its version, putting it
// in, signing in, a move worth making.
func (a *App) memApp(c *ui.Context, phase string, b *protocol.BridgeView) {
	t := a.T
	home := a.memHome()
	a.group(c, "mem-app", "Nowledge Mem", "", func() {
		switch phase {
		case "off":
			a.rowBlock(c, "mem-off", func() { a.note(c, a.L.T("mem.app.off")) })
		case "missing":
			line := a.L.T("mem.app.missing.here")
			if home != "" {
				line = a.L.T("mem.app.missing", home)
			}
			a.row(c, "mem-missing", line, a.L.T("mem.app.what"), func() {
				if a.button(c, a.L.T("mem.app.learn"), btnSecondary, t.ControlSM, t.Surface) {
					a.openLink(memSite)
				}
			})
		case "install", "installing":
			busy := phase == "installing"
			help := a.L.T("bridge.mem.install", home)
			switch {
			case busy:
				help = a.L.T("bridge.mem.installing", home)
			case b != nil && !b.CanRun:
				help = a.L.T("bridge.mem.install.need", home) + "\n" + a.L.T("bridge.mem.install.need.how")
			}
			if b != nil && b.Detail != "" && !busy {
				help += "\n" + a.memFailed(true, home, b.Detail, b.Kept)
			}
			a.row(c, "mem-install", a.L.T("mem.app.missing", home), help, func() {
				if busy {
					ui.Text(c, a.L.T("bridge.mem.busy.install")).FontSize(t.SM).TextColor(t.InkMuted)
					return
				}
				label, kind := a.L.T("bridge.mem.install.go"), btnPrimary
				if b == nil || !b.CanRun {
					label, kind = a.L.T("bridge.retry"), btnSecondary
				}
				if a.buttonFor(c, label, home, kind, t.ControlSM, t.Surface) && b != nil {
					b.State = "installing"
					a.send(protocol.BridgeAction{T: "bridge_mem_install"})
				}
			})
		case "sign_in", "signing_in":
			busy := phase == "signing_in"
			help := a.L.T("bridge.mem.signin", home)
			if b != nil {
				if b.Done != "" {
					help = a.L.T("bridge.mem.done."+b.Done, home) + "\n" + help
				}
				switch b.SignIn {
				case "used":
					help += "\n" + a.L.T("bridge.mem.signin.used")
				case "bad":
					help += "\n" + a.L.T("bridge.mem.signin.bad")
				case "failed":
					help += "\n" + a.L.T("bridge.mem.signin.failed", b.Detail)
				}
			}
			a.rowBlock(c, "mem-signin", func() {
				a.note(c, help)
				ui.Row(c).Gap(t.S2).AlignItems(ui.End).Children(func() {
					ui.Column(c).Grow(1).MinWidth(0).Children(func() {
						a.field(c, "bridge-link", a.L.T("bridge.mem.signin.link"), &a.bridgeLink, "https://…?nmem_connect=…", "")
					})
					label := a.L.T("bridge.mem.signin.go")
					if busy {
						label = a.L.T("bridge.mem.signin.busy")
					}
					if a.buttonFor(c, label, home, btnPrimary, t.ControlMD, t.Surface) && !busy && strings.TrimSpace(a.bridgeLink) != "" && b != nil {
						b.State = "signing_in"
						a.send(protocol.BridgeMemSignIn{T: "bridge_mem_sign_in", Link: strings.TrimSpace(a.bridgeLink)})
						a.bridgeLink = ""
					}
				})
			})
		default: // on
			a.rowBlock(c, "mem-on", func() {
				ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					where := ""
					if b != nil && b.State == "local_mem" {
						where = a.L.T("mem.app.local", home)
					} else if home != "" {
						where = a.L.T("mem.app.where", home)
					}
					ui.Row(c).Grow(1).MinWidth(0).Gap(t.S2).AlignItems(ui.Baseline).Children(func() {
						ui.Text(c, where).FontSize(t.MD).FontWeight(700).SingleLine()
						if b != nil && b.Version != "" {
							ui.Text(c, b.Version).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).Selectable()
						}
					})
					a.memPill(c)
				})
				if m := a.S.Mem; m != nil && m.KeptUnder != "" {
					a.note(c, a.L.T("mem.app.name", m.KeptUnder))
				}
				u := memUpdate(b)
				switch {
				case u != nil && u.Kind == "done":
					a.notice(c, "mem-done", noticeDone, func() { a.glyph(c, 20, drawCheck(t.Done.Ink)) }, func() {
						ui.Text(c, a.L.T("bridge.mem.done."+u.Done, home)).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
					}, nil)
				case u != nil && u.Kind == "move":
					line := a.L.T("bridge.mem.upkeep.move", home)
					if u.Detail != "" {
						line += "\n" + a.memFailed(false, home, u.Detail, u.Kept)
					} else {
						line += "\n" + a.L.T("bridge.mem.upkeep.move.how")
					}
					a.notice(c, "mem-move", noticeInfo, nil, func() {
						ui.Text(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
					}, func() {
						label := a.L.T("bridge.mem.upkeep.move.go")
						if u.Detail != "" {
							label = a.L.T("bridge.retry")
						}
						if a.buttonFor(c, label, home, btnSecondary, t.ControlSM, t.SurfaceSunken.Mix(t.Bg, 0.45)) && b != nil {
							b.State = "updating"
							b.Upkeep = &protocol.BridgeUpkeep{Kind: "move"}
							a.send(protocol.BridgeAction{T: "bridge_mem_install"})
						}
					})
				}
			})
		}
	})
}

// memPill is "已连上 / Connected": a green dot in a done-tinted pill.
func (a *App) memPill(c *ui.Context) {
	t := a.T
	ui.Row(c.Key("mem-pill")).Gap(6).AlignItems(ui.Center).Padding(3, t.S2, 3, 8).Radius(t.Pill).Background(t.Done.Surface).Shrink(0).Children(func() {
		ui.Box(c).Size(7, 7).Radius(4).Background(t.Done.Dot).AccessHidden(true)
		ui.Text(c, a.L.T("mem.app.on")).FontSize(t.XS).FontWeight(700).TextColor(t.Done.Ink).SingleLine()
	})
}

// drawNotebook is Memory's mark: the partner's own blue notebook, the one
// it always carries, in the same clay (D257): the cover on a darker ledge,
// the pages' edge, a highlight along the top, the strap and its clasp.
func (a *App) drawNotebook() func(p *ui.Painter, r ui.Rect) {
	nb := a.T.Notebook
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 40
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		p.Fill(ui.Rect{X: x(8.5), Y: y(7.5), W: 23 * s, H: 28 * s}, nb.Ledge, 5.5*s)
		p.Fill(ui.Rect{X: x(8.5), Y: y(5), W: 23 * s, H: 28 * s}, nb.Cover, 5.5*s)
		p.Fill(ui.Rect{X: x(27), Y: y(7.5), W: 3.2 * s, H: 23 * s}, nb.Pages, 1.6*s)
		var h ui.Path
		h.MoveTo(x(12), y(8.6))
		h.QuadTo(x(18), y(7.4), x(24.4), y(8.1))
		p.StrokePath(&h, 1.7*s, nb.Shine)
		p.Fill(ui.Rect{X: x(21.5), Y: y(16.2), W: 11 * s, H: 6.2 * s}, nb.Strap, 3.1*s)
		var k ui.Path
		k.Circle(x(24.6), y(19.3), 1.75*s)
		p.FillPath(&k, nb.Clasp)
	}
}

// ---------- 你的其他 AI / Your other AI agents ----------

// peersPanel is the persona's connection with the person's other agents
// (D205) and who may reach it (D170). Mem's own steps live in Memory.
func (a *App) peersPanel(c *ui.Context) {
	a.panelHead(c, TabPeers, a.L.T("settings.lede.peers", a.personaName()))
	if a.loadingLine(c) {
		return
	}
	a.peersCard(c, a.S.Settings)
}
