package views

import (
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D295: Settings › 记忆 / Memory on the settings grid (D289). It shows the
// value first: the partner remembers you (how much is new this week, the
// switch), what it noted this week and earlier (each forgettable, asking in
// place), what your other AI tools saved to Mem, then Nowledge Mem itself
// in human words (where it's kept, its name there; raw ids behind 详情).
// Before Mem is there: a small empty state and the setup as steps. The
// web's is apps/web/src/memory.tsx; the rules are mem-view.ts / memory.go.

func (a *App) memoryPanel(c *ui.Context) {
	a.panelHead(c, TabMemory, a.L.T("settings.lede.memory", a.personaName()))
	if a.loadingLine(c) {
		return
	}
	st := a.S.Settings
	b := a.S.Bridge
	phase := memPhase(st.Memory, a.S.Mem, b)
	a.partnerToast(c)
	switch phase {
	case "on":
		a.memHead(c, st)
		a.memNoted(c)
		a.memOthers(c)
		a.memLink(c, b)
	case "off":
		a.memHead(c, st)
	default:
		a.memFirst(c, phase, b)
	}
}

// memWeek counts what it noted in the last 7 days.
func memWeek(noted []protocol.Noted, now time.Time) int {
	n := 0
	for _, g := range groupNoted(noted, now) {
		if g.When != "earlier" {
			n += len(g.Items)
		}
	}
	return n
}

// notebookTile is Memory's mark in the tile column.
func (a *App) notebookTile(c *ui.Context) func() {
	return func() { a.glyph(c, 40, a.drawNotebook()) }
}

// memHead is the first group: the partner remembers you, what's new this
// week, the switch; its note says what the switch does.
func (a *App) memHead(c *ui.Context, st *protocol.Settings) {
	name := a.personaName()
	a.group(c, "mem-head", "", "", func() {
		title, line, tone := a.L.T("mem.hero.on", name), a.L.T("mem.week.none"), sideMuted
		if !st.Memory {
			title, line = a.L.T("mem.hero.off", name), a.L.T("mem.off.line")
		} else if m := a.S.Mem; m != nil {
			if n := memWeek(m.Noted, a.Now()); n > 0 {
				line, tone = a.L.T("mem.week.count", strconv.Itoa(n)), sideDone
			}
		}
		a.headRow(c, "mem", a.notebookTile(c), title, line, tone, func() {
			v := st.Memory
			if a.switchControl(c, "memory", a.L.T("partner.memory.switch"), &v) {
				st.Memory = v
				a.SetSettings(protocol.SettingsPatch{Memory: &v})
			}
		})
		note := a.L.T("mem.switch.note")
		if !st.Memory {
			note = a.L.T("partner.memory.off")
		}
		a.footRow(c, "mem-head", note, nil)
	})
}

// pebbleTile is a noted line's mark: a small accent clay pebble on its ledge.
func (a *App) pebbleTile(c *ui.Context) func() {
	t := a.T
	return func() {
		ui.Box(c).Size(10, 12).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			p.Fill(ui.Rect{X: r.X, Y: r.Y + 2, W: 10, H: 10}, t.PressAccent.Color, 5)
			p.Fill(ui.Rect{X: r.X, Y: r.Y, W: 10, H: 10}, t.Accent, 5)
		})
	}
}

// memNoted is what it noted, this week and earlier, one group each; each
// line forgets after asking in place. The last group's foot is the door to
// everything in Mem.
func (a *App) memNoted(c *ui.Context) {
	t := a.T
	m := a.S.Mem
	var week, earlier []protocol.Noted
	if m != nil {
		for _, g := range groupNoted(m.Noted, a.Now()) {
			if g.When == "earlier" {
				earlier = append(earlier, g.Items...)
			} else {
				week = append(week, g.Items...)
			}
		}
	}
	foot := func() {
		note := a.L.T("mem.all.note")
		if m != nil && m.Glance != nil && m.Glance.Total > 0 {
			note = a.L.T("mem.all.count", groupThousands(m.Glance.Total))
		}
		a.footRow(c, "mem-all", note, func() {
			if a.quietLink(c, "mem-all", a.L.T("mem.all.open"), a.L.T("mem.all.open")) {
				a.openLink(memSite)
			}
		})
	}
	if len(week) == 0 && len(earlier) == 0 {
		a.group(c, "mem-none", a.L.T("mem.sec.week"), "", func() {
			a.tileRow(c, "mem-none", a.pebbleTile(c), a.L.T("mem.empty.title"), a.L.T("mem.hero.empty.body"), nil)
			foot()
		})
		return
	}
	list := func(key, title string, items []protocol.Noted, last bool) {
		if len(items) == 0 {
			return
		}
		a.group(c, key, title, "", func() {
			for _, n := range items {
				n := n
				if a.memAsk == n.Seq {
					ask := a.L.T("mem.forget.ask", n.Title)
					if n.MemoryID == "" {
						ask = a.L.T("mem.forget.ask.hide", n.Title)
					}
					keep, goOn := a.confirmRow(c, "noted:"+itoa(n.Seq), ask, a.L.T("mem.forget.keep"), a.L.T("partner.memory.forget"), n.Title)
					if keep {
						a.memAsk = 0
					}
					if goOn {
						a.memAsk = 0
						if a.partner.forgetting == nil {
							a.partner.forgetting = map[int64]string{}
						}
						a.partner.forgetting[n.Seq] = n.Title
						a.send(protocol.MemoryForget{T: "memory_forget", Seq: n.Seq})
					}
					continue
				}
				a.tileRow(c, "noted:"+itoa(n.Seq), a.pebbleTile(c), n.Title, a.agoLong(n.At), func() {
					if a.quietDanger(c, "forget:"+itoa(n.Seq), a.L.T("partner.memory.forget"), n.Title) {
						a.memAsk = n.Seq
					}
				})
			}
			if last {
				foot()
			}
		})
		_ = t
	}
	list("mem-week", a.L.T("mem.sec.week"), week, len(earlier) == 0)
	list("mem-earlier", a.L.T("mem.sec.earlier"), earlier, true)
}

// groupThousands is 1284 → "1,284".
func groupThousands(n int) string {
	s := strconv.Itoa(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// toolTile is another AI tool's mark: its clay coin when Ducter has one
// (Claude the app is Anthropic's starburst, ChatGPT OpenAI's knot), else
// its own mark on the white clay tile (D314), else its first letter on a
// sunken pebble.
func (a *App) toolTile(c *ui.Context, from string) func() {
	art := map[string]string{"Claude Code": "coin_claude_code", "Claude": "coin_claude_code", "Codex": "coin_codex", "ChatGPT": "coin_codex", "pi": "coin_pi"}[from]
	if art != "" && theme.Clay(art) != nil {
		return a.clayTile(c, art, false)
	}
	if b := toolBrand(from); b != "" {
		return a.brandTile(c, b, false)
	}
	t := a.T
	return func() {
		r, _ := utf8.DecodeRuneInString(from)
		ui.Row(c.Key("tool-tile:"+from)).Size(36, 36).Shrink(0).Radius(18).Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2).
			Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			ui.Text(c, strings.ToUpper(string(r))).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.InkSoft).LineHeight(1)
		})
	}
}

// memOthers is what the person's other AI tools saved to Mem lately: the
// memory is shared, and the partner can recall it too. Read-only here.
func (a *App) memOthers(c *ui.Context) {
	m := a.S.Mem
	if m == nil || m.Glance == nil || len(m.Glance.Others) == 0 {
		return
	}
	t := a.T
	a.group(c, "mem-others", a.L.T("mem.others.title"), a.L.T("mem.others.note", a.personaName()), func() {
		for _, o := range m.Glance.Others {
			o := o
			a.tileRow(c, "other:"+o.ID, a.toolTile(c, o.From), o.Title, a.L.T("mem.others.by", o.From), func() {
				if ago := a.agoLong(o.At); ago != "" {
					ui.Text(c, ago).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
				}
			})
		}
	})
}

// memTile is Nowledge Mem's own mark, its app icon (D314; it replaced
// the letter N); faded while Mem isn't set up.
func (a *App) memTile(c *ui.Context, faded bool) func() {
	return a.brandTile(c, "nowledge_mem", faded)
}

// memWhere is where the memories are kept, in the person's words.
func (a *App) memWhere(b *protocol.BridgeView) string {
	home := a.memHome()
	if b != nil {
		switch {
		case b.Where == "cloud":
			return a.L.T("mem.app.kept.cloud")
		case b.Where == "local" || b.State == "local_mem":
			return a.L.T("mem.app.kept.local", home)
		case b.Where == "server":
			return a.L.T("mem.app.kept.server")
		}
	}
	if home != "" {
		return a.L.T("mem.app.where", home)
	}
	return ""
}

// memLink is Nowledge Mem itself: connected, where it's kept, its name
// there, the one update worth a tap, and the raw facts behind 详情.
func (a *App) memLink(c *ui.Context, b *protocol.BridgeView) {
	t := a.T
	m := a.S.Mem
	a.group(c, "mem-app", "", "", func() {
		a.headRow(c, "mem-app", a.memTile(c, false), "Nowledge Mem", a.L.T("mem.app.on"), sideDone, nil)
		if w := a.memWhere(b); w != "" {
			a.tileRow(c, "mem-where", nil, a.L.T("mem.app.kept.title"), w, nil)
		}
		if m != nil && m.KeptUnder != "" {
			a.tileRow(c, "mem-name", nil, a.L.T("mem.app.name.title"), a.L.T("mem.app.name.line", m.KeptUnder), nil)
		}
		if u := memUpdate(b); u != nil {
			a.memUpdateRow(c, u, b)
		}
		if a.memDetails {
			a.textBlock(c, "mem-details", func() { a.memFacts(c, b) })
		}
		note := ""
		if b != nil && b.Version != "" {
			note = a.L.T("mem.app.version", b.Version)
		}
		a.footRow(c, "mem-app", note, func() {
			if a.quietButton(c, "mem-details", a.L.T("mem.details"), "Nowledge Mem", a.memDetails, 0) {
				a.memDetails = !a.memDetails
			}
		})
	})
	_ = t
}

// memFacts is the literal facts for support, selectable, in mono.
func (a *App) memFacts(c *ui.Context, b *protocol.BridgeView) {
	t := a.T
	line := func(k, v string) {
		if v == "" {
			return
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
			ui.Text(c, a.L.T(k)).FontSize(t.SM).TextColor(t.InkMuted).Width(96).Shrink(0)
			ui.Text(c, v).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable().MinWidth(0).Shrink(1)
		})
	}
	if b == nil {
		return
	}
	line("mem.details.home", a.memHome())
	line("mem.details.version", b.Version)
	line("mem.details.identity", b.Identity)
	if b.Space != nil {
		line("mem.details.space", b.Space.Label)
		line("mem.details.spaceid", b.Space.ID)
	}
}

// memUpdateRow is the one thing about Mem's own version worth saying, as a
// row: a step running, one just done, an update with its tap.
func (a *App) memUpdateRow(c *ui.Context, u *memUpd, b *protocol.BridgeView) {
	t := a.T
	home := a.memHome()
	var title, line string
	var control func()
	tap := func(label string, kind btnKind) func() {
		return func() {
			if a.buttonFor(c, label, home, kind, t.ControlSM, t.Surface) && b != nil {
				b.State = "updating"
				if u.Kind == "move" {
					b.Upkeep = &protocol.BridgeUpkeep{Kind: "move"}
				}
				a.send(protocol.BridgeAction{T: "bridge_mem_install"})
			}
		}
	}
	retry := func(def string) string {
		if u.Detail != "" {
			return a.L.T("bridge.retry")
		}
		return def
	}
	switch u.Kind {
	case "updating":
		title = a.L.T("bridge.mem.updating", home)
		if u.Move {
			title = a.L.T("bridge.mem.moving", home)
		}
	case "done":
		title = a.L.T("bridge.mem.done."+u.Done, home)
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
		if u.CanRun {
			control = tap(retry(a.L.T("bridge.mem.update.go")), btnPrimary)
		}
	case "move":
		title, line = a.L.T("bridge.mem.upkeep.move", home), a.L.T("bridge.mem.upkeep.move.how")
		control = tap(retry(a.L.T("bridge.mem.upkeep.move.go")), btnSecondary)
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
		if u.Kind == "newer" {
			control = tap(retry(a.L.T("bridge.mem.update.go")), btnPrimary)
		}
	}
	if u.Detail != "" {
		line = strings.TrimSpace(line + "\n" + a.memFailed(false, home, u.Detail, u.Kept))
	}
	tile := a.glyphTile(c, 18, drawUp(t.Accent))
	if u.Kind == "done" {
		tile = a.glyphTile(c, 18, drawCheck(t.Done.Ink))
	}
	a.tileRow(c, "mem-update", tile, title, line, control)
}

// memFirst is Memory before Mem is there: a small empty state on the paper
// (the partner with its notebook, what it would give), then the setup as
// one group of steps, the local app's way as its note.
func (a *App) memFirst(c *ui.Context, phase string, b *protocol.BridgeView) {
	t := a.T
	name := a.personaName()
	home := a.memHome()
	face := theme.Idle
	switch phase {
	case "installing", "signing_in":
		face = theme.Working
	case "sign_in":
		face = theme.Waiting
	}
	ui.Column(c.Key("mem-first")).AlignItems(ui.Center).Gap(t.S2).Padding(t.S4, t.S6, t.S2, t.S6).Children(func() {
		a.avatar(c, face, 96)
		a.heading(c, a.L.T("mem.first.title", name), t.XL)
		ui.Text(c, a.L.T("mem.first.body")).FontSize(t.MD).LineHeight(a.leading(1.6)).TextColor(t.InkSoft).TextAlign(ui.Center).MaxWidth(520)
	})
	line := map[string]string{
		"missing":    a.L.T("mem.setup.missing"),
		"install":    a.L.T("mem.setup.install", home),
		"installing": a.L.T("mem.setup.installing"),
		"sign_in":    a.L.T("mem.setup.signin"),
		"signing_in": a.L.T("mem.setup.signing"),
	}[phase]
	a.group(c, "mem-setup", "", "", func() {
		a.headRow(c, "mem-setup", a.memTile(c, true), "Nowledge Mem", line, sideMuted, nil)
		if phase == "missing" {
			a.tileRow(c, "mem-what", nil, a.L.T("mem.app.learn"), a.L.T("mem.app.what"), func() {
				if a.button(c, a.L.T("mem.app.open"), btnSecondary, t.ControlSM, t.Surface) {
					a.openLink(memSite)
				}
			})
			a.footRow(c, "mem-local", a.L.T("mem.setup.local", name), nil)
			return
		}
		installed := phase == "sign_in" || phase == "signing_in"
		a.chatBody(c, "mem-steps", func() {
			// 1. Install.
			if installed {
				a.chatStep(c, 1, a.L.T("mem.step.done"), nil)
			} else {
				a.chatStep(c, 1, a.L.T("mem.step.install"), func() {
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
					a.note(c, help)
					if busy {
						return
					}
					label, kind := a.L.T("bridge.mem.install.go"), btnPrimary
					if b == nil || !b.CanRun {
						label, kind = a.L.T("bridge.retry"), btnSecondary
					}
					ui.Row(c).Children(func() {
						if a.buttonFor(c, label, home, kind, t.ControlSM, t.Surface) && b != nil {
							b.State = "installing"
							a.send(protocol.BridgeAction{T: "bridge_mem_install"})
						}
					})
				})
			}
			// 2. Sign in.
			a.chatStep(c, 2, a.L.T("mem.step.signin"), func() {
				if !installed {
					return
				}
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
		})
		a.footRow(c, "mem-local", a.L.T("mem.setup.local", name), nil)
	})
}
