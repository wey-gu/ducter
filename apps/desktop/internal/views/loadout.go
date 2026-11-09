package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// What the partner thinks with, and who does the tasks (D89,
// design/ai-loadout.md). On the Partner page: a clay socket beside the
// partner holding the AI agent it thinks with, a tray of this Mac's AI
// agents with a ring of the limit each has left, and two cards in plain
// words. On a task: who is doing it and why, and 换谁来做 / Switch who does
// it. The socket and the tray are the only game moment: dropping a token
// into the socket (the equip's lift, arc and tock).

type loadoutState struct {
	// choosing: 换一个 was pressed; the tokens that can go in lift.
	choosing bool
	// acct is the tray token whose line is open in Who does the tasks.
	acct string
	// Where the socket's well and each token's coin were last frame
	// (window DIPs), for the flight.
	socket ui.Rect
	coins  map[string]ui.Rect
	// fx is a token flying into the socket; fxTo the brain it carries.
	fx   *equipFx
	fxTo protocol.Brain
	// pending is a brain sent and not yet confirmed; pendingFrom the
	// settings frame it was sent against (a newer one is the server's word).
	pending     *protocol.Brain
	pendingFrom *protocol.Settings
	toast       string
	toastAt     time.Time
	// switchFor is the task whose 换谁来做 is open; pick the chosen row;
	// switching the "harness/model" sent; switchMsg its outcome.
	switchFor string
	pick      string
	switching string
	switchMsg string
	switchOK  bool
	switchAt  time.Time
}

// brain is what the partner thinks with: a switch just made, else the
// server's setting, else Ducter's default (Claude Code · Opus).
func (a *App) brain() protocol.Brain {
	lo := &a.lo
	if lo.pending != nil {
		if a.S.Settings != lo.pendingFrom {
			lo.pending = nil // the server has spoken
		} else {
			return *lo.pending
		}
	}
	if st := a.S.Settings; st != nil && st.Brain != nil && st.Brain.Harness != "" {
		return *st.Brain
	}
	return protocol.Brain{Harness: "claude-code", Model: "opus"}
}

// BrainMark is the one mark on Devices (D89): on the Mac Ducter lives on,
// the AI agent it thinks with says so ("Ducter 想事情用"); "" otherwise.
// The Devices stage calls it for each token.
func (a *App) BrainMark(dv *protocol.DeviceView, harness string) string {
	if dv == nil || !dv.Home || a.brain().Harness != harness {
		return ""
	}
	return a.L.T("loadout.mark", a.S.PersonaName)
}

// BrainBadge draws the mark as an icon only, so it fits any token: the
// clay partner's face in a small round badge at the bottom-right of the
// parent (a coin), with the words as its tooltip and accessible name. Put
// it inside the coin's box; it draws nothing for other tokens.
func (a *App) BrainBadge(c *ui.Context, dv *protocol.DeviceView, harness string) {
	t := a.T
	m := a.BrainMark(dv, harness)
	if m == "" {
		return
	}
	ui.Box(c.Key("brain-badge")).Absolute().Right(-6).Bottom(-6).Size(26, 26).Radius(13).Background(t.Surface).
		Shadow(0, 2, 0, 0, t.Line2).Role(ui.RoleImage).Label(m).Tooltip(m).Children(func() {
		if bmp := theme.Face(theme.Idle, 48); bmp != nil {
			ui.Image(c, bmp).Size(20, 20).Absolute().Left(3).Top(3).AccessHidden(true)
		}
	})
}

// trayHarnesses are this Mac's AI agents, as Devices reports them.
func (a *App) trayHarnesses() []protocol.DeviceHarness {
	if home := a.homeDevice(); home != nil {
		return home.Harnesses
	}
	return nil
}

func (a *App) trayHarness(id string) *protocol.DeviceHarness {
	hs := a.trayHarnesses()
	for i := range hs {
		if hs[i].Harness == id {
			return &hs[i]
		}
	}
	return nil
}

// taskReady: signed in and switched on for tasks.
func (a *App) taskReady(h protocol.DeviceHarness) bool {
	if !h.Installed || !h.LoggedIn {
		return false
	}
	if st := a.S.Settings; st != nil {
		if ta, ok := st.TaskAccounts[h.Harness]; ok && !ta.Enabled {
			return false
		}
	}
	return true
}

func tokenArt(h string) string {
	if h == "claude-code" {
		return "token_orange"
	}
	return "token_ink"
}

type modelChoice struct {
	id    string
	label string
	fast  bool
}

// modelChoices are the models offered for the partner on an AI agent:
// what it lists, else the two Ducter knows for Claude Code. Each is said
// in two plain words: smartest, or faster replies.
func modelChoices(h *protocol.DeviceHarness) []modelChoice {
	if h == nil {
		return nil
	}
	fast := func(id string) bool {
		s := strings.ToLower(id)
		return strings.Contains(s, "sonnet") || strings.Contains(s, "haiku") || strings.Contains(s, "mini") || strings.Contains(s, "luna") || strings.Contains(s, "flash")
	}
	if len(h.Models) > 0 {
		out := make([]modelChoice, 0, len(h.Models))
		for i, m := range h.Models {
			label := m.Label
			if label == "" {
				label = m.ID
			}
			out = append(out, modelChoice{id: m.ID, label: label, fast: i > 0 && fast(m.ID) || fast(m.ID)})
		}
		return out
	}
	if h.Harness == "claude-code" {
		return []modelChoice{{id: "opus", label: "Opus"}, {id: "sonnet", label: "Sonnet", fast: true}}
	}
	return nil
}

func modelLabel(h *protocol.DeviceHarness, id string) string {
	for _, m := range modelChoices(h) {
		if m.id == id {
			return m.label
		}
	}
	switch id {
	case "opus", "sonnet", "haiku":
		return strings.ToUpper(id[:1]) + id[1:]
	}
	return id
}

func pct(f float64) int { return int(f*100 + 0.5) }

// brainLine: "Claude Code · Opus".
func (a *App) brainLine(b protocol.Brain) string {
	parts := []string{harnessName(b.Harness)}
	if m := modelLabel(a.trayHarness(b.Harness), b.Model); m != "" {
		parts = append(parts, m)
	}
	return strings.Join(parts, " · ")
}

// tokenStatus is a tray token's one line under its name.
func (a *App) tokenStatus(h protocol.DeviceHarness) string {
	switch {
	case !h.Installed:
		return a.L.T("loadout.missing")
	case h.Harness == "pi" && !h.LoggedIn:
		return a.L.T("loadout.pi")
	case !h.LoggedIn:
		return a.L.T("loadout.signed_out")
	case h.Allowance != nil:
		if h.Harness == a.brain().Harness && h.Allowance.Left <= protocol.PartnerReserve {
			return a.L.T("loadout.left.reserve", pct(h.Allowance.Left), a.S.PersonaName)
		}
		return a.L.T("loadout.left", pct(h.Allowance.Left))
	}
	return a.L.T("loadout.signed_in")
}

// ---------- the ring ----------

// limitRing draws a token's limit as a ring round its coin: the stretch
// left, starting at the top and running clockwise; on the partner's own
// account the last 10% (what is kept for it) is the darker accent. No
// report: a quiet full track. Not installed: a dashed one.
func (a *App) limitRing(h protocol.DeviceHarness, brain bool) func(p *ui.Painter, r ui.Rect) {
	t := a.T
	col := t.Ink
	if h.Harness == "claude-code" {
		col = t.Accent
	}
	if !h.LoggedIn {
		col = t.InkMuted
	}
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		rad := min(r.W, r.H)/2 - 4
		var track ui.Path
		track.Circle(cx, cy, rad)
		if !h.Installed {
			track.Dash(0, 5, 5)
			p.StrokePath(&track, 3, t.Line2)
			return
		}
		p.StrokePath(&track, 5, t.SurfaceSunken)
		if h.Allowance == nil || !h.LoggedIn {
			return
		}
		left := float32(min(max(h.Allowance.Left, 0), 1))
		arc(p, cx, cy, rad, 0, left, 5, col)
		if brain {
			arc(p, cx, cy, rad, 0, min(left, float32(protocol.PartnerReserve)), 5, t.PressAccent.Color)
		}
	}
}

// arc strokes a ring from fraction f0 to f1 of a turn, clockwise from the
// top, with round ends.
func arc(p *ui.Painter, cx, cy, r, f0, f1, w float32, col ui.Color) {
	if f1-f0 <= 0.002 {
		return
	}
	var m ui.Path
	n := max(2, int((f1-f0)*96))
	for i := 0; i <= n; i++ {
		f := f0 + (f1-f0)*float32(i)/float32(n)
		ang := float64(f)*2*math.Pi - math.Pi/2
		x, y := cx+r*float32(math.Cos(ang)), cy+r*float32(math.Sin(ang))
		if i == 0 {
			m.MoveTo(x, y)
		} else {
			m.LineTo(x, y)
		}
	}
	p.StrokePath(&m, w, col)
}

// ---------- the socket, beside the partner ----------

// socket is the clay well beside the partner, holding the token of the AI
// agent it thinks with, labelled 想事情用 / Thinks with and, under it, the
// account and model in words. While choosing, a dashed accent ring says
// "this goes here".
func (a *App) socket(c *ui.Context) {
	t := a.T
	lo := &a.lo
	b := a.brain()
	flying := lo.fx != nil && !lo.fx.back
	label := a.L.T("loadout.socket") + " · " + a.brainLine(b)
	ui.Column(c.Key("socket")).Width(150).Shrink(0).AlignItems(ui.Center).Gap(t.S1).Role(ui.RoleGroup).Label(label).Children(func() {
		ui.Text(c, a.L.T("loadout.socket")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).AccessHidden(true)
		well := ui.Box(c.Key("well")).Size(112, 112).Radius(56).
			LinearGradient(ui.LinearGradient{From: t.SurfaceSunken, To: t.Line2, Angle: 180}).
			InsetShadow(0, 6, 10, 0, t.Ink.Alpha(0.22)).Shadow(0, 3, 0, 0, t.Surface.Alpha(0.8)).AccessHidden(true)
		well.Children(func() {
			// The token sits in the well, unless it is the one in flight.
			if !flying {
				if bmp := theme.Clay(tokenArt(b.Harness)); bmp != nil {
					ui.Image(c, bmp).Size(84, 84).Absolute().Left(14).Top(14)
				}
			}
			if lo.choosing || flying {
				ring := ui.Box(c.Key("target")).Absolute().Left(-7).Top(-7).Size(126, 126)
				ring.Draw(func(p *ui.Painter, r ui.Rect) {
					p.StrokeDashed(r, t.Accent, r.W/2, 3)
				})
			}
		})
		lo.socket = well.Bounds()
		ui.Text(c, a.brainLine(b)).Font(t.Display).FontSize(t.MD).FontWeight(800).TextAlign(ui.Center).MaxLines(2).AccessHidden(true)
	})
}

// ---------- the tray ----------

// tray is this Mac's AI agents on a clay tray: a coin each with its limit
// ring, its name and one line. A tap opens its line in Who does the tasks;
// while choosing, the ones that can be what it thinks with lift and the
// rest step back, saying why.
func (a *App) tray(c *ui.Context) {
	t := a.T
	lo := &a.lo
	hs := a.trayHarnesses()
	if len(hs) == 0 {
		return
	}
	if lo.coins == nil {
		lo.coins = map[string]ui.Rect{}
	}
	b := a.brain()
	ui.Column(c.Key("tray")).Gap(t.S2).Children(func() {
		ui.Row(c).Padding(0, t.S5).Children(func() {
			ui.Text(c, a.L.T("loadout.tray")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).
				Padding(1, t.S2).Radius(t.RadiusXS).Background(t.Surface.Alpha(0.85))
		})
		ui.Row(c.Key("tray-bed")).Gap(t.S2).Wrap().Justify(ui.SpaceAround).Padding(t.S4, t.S4).Radius(t.RadiusXL).
			LinearGradient(ui.LinearGradient{From: t.Sunken, To: t.SurfaceSunken, Angle: 180}).
			InsetShadow(0, 3, 0, 0, t.Surface.Alpha(0.75)).Shadow(0, 6, 0, 0, t.Line2).Role(ui.RoleGroup).Label(a.L.T("loadout.tray")).
			Children(func() {
				for _, h := range hs {
					a.trayToken(c, h, b)
				}
			})
	})
}

func (a *App) trayToken(c *ui.Context, h protocol.DeviceHarness, b protocol.Brain) {
	t := a.T
	lo := &a.lo
	isBrain := h.Harness == b.Harness
	canGo := h.CanBePartner && !isBrain
	status := a.tokenStatus(h)
	if isBrain {
		status = a.L.T("loadout.socket")
	}
	name := harnessName(h.Harness)
	tok := ui.Column(c.Key("tok:"+h.Harness)).Width(130).AlignItems(ui.Center).Gap(2).Padding(t.S1, 0).Radius(t.RadiusLG).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name + " · " + a.tokenStatus(h)).Focusable().AccessSelected(lo.acct == h.Harness)
	why := ""
	if lo.choosing {
		switch {
		case canGo:
			tok.AnimatePose(ui.Pose{Y: -8}, t.Snappy)
		case isBrain:
		default:
			tok.Opacity(0.4)
			switch {
			case !h.Installed:
				why = a.L.T("loadout.cant.install")
			case h.Harness == "pi" && !h.LoggedIn:
				why = a.L.T("loadout.cant.pi")
			case !h.LoggedIn:
				why = a.L.T("loadout.cant.signin")
			default:
				why = a.L.T("loadout.cant.later")
			}
		}
	} else {
		a.lift(c, tok, 3)
	}
	flying := lo.fx != nil && lo.fxTo.Harness == h.Harness
	tok.Children(func() {
		coin := ui.Box(c.Key("coin")).Size(84, 84).Draw(a.limitRing(h, isBrain)).AccessHidden(true)
		coin.Children(func() {
			if bmp := theme.Clay(tokenArt(h.Harness)); bmp != nil && !flying {
				img := ui.Image(c, bmp).Size(62, 62).Absolute().Left(11).Top(11)
				if !h.Installed {
					img.Opacity(0.35)
				} else if !h.LoggedIn {
					img.Grayscale().Opacity(0.8)
				}
			}
			if lo.choosing && canGo || lo.acct == h.Harness && !lo.choosing {
				ui.Box(c.Key("sel")).Absolute().Left(-3).Top(-3).Size(90, 90).Draw(func(p *ui.Painter, r ui.Rect) {
					var m ui.Path
					m.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2-1)
					p.StrokePath(&m, 2, t.Ink)
				})
			}
		})
		lo.coins[h.Harness] = coin.Bounds()
		ui.Text(c, name).FontSize(t.SM).FontWeight(800).TextAlign(ui.Center).SingleLine().AccessHidden(true)
		line := status
		if why != "" {
			line = why
		}
		ui.Text(c, line).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).TextAlign(ui.Center).MaxLines(2).AccessHidden(true)
	})
	if tok.Clicked() {
		switch {
		case lo.choosing && canGo:
			a.putInSocket(h)
		case lo.choosing:
		default:
			if lo.acct == h.Harness {
				lo.acct = ""
			} else {
				lo.acct = h.Harness
			}
		}
	}
}

// putInSocket flies the token into the socket and makes it what the
// partner thinks with, on its strongest model.
func (a *App) putInSocket(h protocol.DeviceHarness) {
	lo := &a.lo
	b := protocol.Brain{Harness: h.Harness}
	if ms := modelChoices(&h); len(ms) > 0 {
		b.Model = ms[0].id
	}
	lo.choosing = false
	from := lo.coins[h.Harness]
	lo.fx = &equipFx{ability: "brain", device: h.Harness, start: a.Now(), from: from, to: lo.socket}
	lo.fxTo = b
	a.setBrain(b)
}

func (a *App) setBrain(b protocol.Brain) {
	lo := &a.lo
	lo.pending, lo.pendingFrom = &b, a.S.Settings
	a.SetSettings(protocol.SettingsPatch{Brain: &b})
}

// brainFlyer draws the token in flight, over the page, with the equip's
// lift, arc and tock; it lands in the socket and says the one line.
func (a *App) brainFlyer(c *ui.Context) {
	t := a.T
	lo := &a.lo
	fx := lo.fx
	if fx == nil {
		return
	}
	still := c.Preferences().ReduceMotion
	dur := t.Equip.Flight
	if still {
		dur = t.Equip.Fade
	}
	q := float32(a.Now().Sub(fx.start)) / float32(dur)
	if q >= 1 || fx.from.W == 0 || fx.to.W == 0 {
		lo.fx = nil
		lo.toast, lo.toastAt = a.L.T("loadout.toast.brain", a.S.PersonaName, harnessName(lo.fxTo.Harness)), a.Now()
		c.Invalidate() // the socket and the tray drew this frame with the token still in flight
		return
	}
	c.After(16 * time.Millisecond)
	// The coin's art is 62 of 84; the socket's 84 of 112: the same share.
	from := shrink(fx.from, 62.0/84)
	to := shrink(fx.to, 84.0/112)
	pose := equipFx{start: fx.start, from: from, to: to}
	x, y, s, rot, sy := a.flightPose(&pose, min(max(q, 0), 1), still)
	bmp := theme.Clay(tokenArt(lo.fxTo.Harness))
	if bmp == nil {
		return
	}
	size := from.W
	ui.Box(c.Key("brain-flyer")).Absolute().Left(x-size/2).Top(y-size/2).Size(size, size).ZIndex(1000).PassThrough().
		Scale(s, s*sy).Rotate(rot).AccessHidden(true).Children(func() {
		ui.Image(c, bmp).Grow(1)
	})
}

func shrink(r ui.Rect, k float32) ui.Rect {
	w, h := r.W*k, r.H*k
	return ui.Rect{X: r.X + (r.W-w)/2, Y: r.Y + (r.H-h)/2, W: w, H: h}
}

// ---------- the two cards ----------

// brainCard is 它用什么想事情 / What it thinks with: the account in the
// socket with its limit and the part kept for the partner, the model in
// two plain words, Switch, and the line that it stays itself.
func (a *App) brainCard(c *ui.Context) {
	t := a.T
	lo := &a.lo
	b := a.brain()
	h := a.trayHarness(b.Harness)
	others := 0
	for _, x := range a.trayHarnesses() {
		if x.CanBePartner && x.Harness != b.Harness {
			others++
		}
	}
	a.sheetCard(c, "brain", a.L.T("loadout.brain.title"), func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if bmp := theme.Clay(tokenArt(b.Harness)); bmp != nil {
				ui.Image(c, bmp).Size(46, 46).Shrink(0).AccessHidden(true)
			}
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				ui.Text(c, harnessName(b.Harness)).Font(t.Display).FontSize(t.LG).FontWeight(800).SingleLine()
				line := ""
				if h != nil && h.Allowance != nil {
					line = a.L.T("loadout.left", pct(h.Allowance.Left)) + " · " + a.L.T("loadout.brain.reserve", a.S.PersonaName)
					if h.Allowance.Left <= protocol.PartnerReserve {
						line = a.L.T("loadout.left.reserve", pct(h.Allowance.Left), a.S.PersonaName)
					}
				} else {
					line = a.L.T("loadout.brain.reserve", a.S.PersonaName)
				}
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted).MaxLines(2)
			})
			switch {
			case lo.choosing:
				if a.button(c, a.L.T("loadout.cancel"), btnText, t.ControlSM, t.Surface) {
					lo.choosing = false
				}
			case others > 0:
				if a.buttonFor(c, a.L.T("loadout.switch"), a.L.T("loadout.brain.title"), btnSecondary, t.ControlSM, t.Surface) {
					lo.choosing, lo.acct = true, ""
				}
			}
		})
		if lo.choosing {
			ui.Text(c, a.L.T("loadout.choose")).FontSize(t.MD).FontWeight(800)
			a.note(c, a.L.T("loadout.brain.onlymac", a.S.PersonaName))
		}
		if ms := modelChoices(h); len(ms) > 0 {
			sel := 0
			labels := make([]string, len(ms))
			for i, m := range ms {
				word := a.L.T("loadout.model.smart")
				if m.fast {
					word = a.L.T("loadout.model.fast")
				}
				labels[i] = m.label + " · " + word
				if m.id == b.Model {
					sel = i
				}
			}
			if i := a.choices(c, "brain-model", a.L.T("loadout.brain.model"), labels, sel); i >= 0 {
				a.setBrain(protocol.Brain{Harness: b.Harness, Model: ms[i].id})
				lo.toast, lo.toastAt = a.L.T("loadout.toast.brain", a.S.PersonaName, harnessName(b.Harness)+" · "+ms[i].label), a.Now()
			}
		} else if b.Model == "" {
			a.note(c, a.L.T("loadout.model.default"))
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Start).Children(func() {
			ui.Box(c).Size(18, 18).Draw(drawCheck(t.Done.Ink)).Shrink(0).Margin(2, 0, 0, 0)
			ui.Text(c, a.L.T("loadout.brain.keep")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Grow(1).MinWidth(0)
		})
		if lo.toast != "" && a.Now().Sub(lo.toastAt) < 8*time.Second {
			a.note(c, a.L.T("loadout.brain.next"))
		}
	})
}

// tasksCard is 谁来做事 / Who does the tasks: Ducter picks by default, an
// AI agent's own line when one is tapped, and Your rules. With one
// account it is one line and the way to sign in another.
func (a *App) tasksCard(c *ui.Context) {
	t := a.T
	lo := &a.lo
	name := a.S.PersonaName
	ready := []protocol.DeviceHarness{}
	for _, h := range a.trayHarnesses() {
		if h.Installed && h.LoggedIn {
			ready = append(ready, h)
		}
	}
	a.sheetCard(c, "tasks", a.L.T("loadout.tasks.title"), func() {
		if len(ready) <= 1 && len(a.S.Rules) == 0 {
			one := harnessName(a.brain().Harness)
			if len(ready) == 1 {
				one = harnessName(ready[0].Harness)
			}
			ui.Text(c, a.L.T("loadout.tasks.one", one, name)).FontSize(t.MD).LineHeight(1.5)
			if lo.acct != "" {
				a.acctLine(c)
			}
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("loadout.tasks.devices"), btnSecondary, t.ControlSM, t.Surface) {
					a.OpenDevices()
				}
			})
			return
		}
		ui.Text(c, a.L.T("loadout.tasks.default", name)).FontSize(t.MD).LineHeight(1.5)
		if lo.acct != "" {
			a.acctLine(c)
		} else {
			a.note(c, a.L.T("loadout.tasks.tap"))
		}
		ui.Box(c).Height(1).Background(t.LineSoft)
		ui.Text(c, a.L.T("loadout.rules")).FontSize(t.XS).FontWeight(800).LetterSpacing(0.6).TextColor(t.InkMuted)
		if len(a.S.Rules) == 0 {
			a.note(c, a.L.T("loadout.rules.none"))
		}
		ui.Column(c).Gap(t.S1).Children(func() {
			for _, r := range a.S.Rules {
				ui.Row(c.Key("rule:" + r.ID)).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlSM).Children(func() {
					ui.Text(c, r.Text).FontSize(t.MD).Grow(1).MinWidth(0).MaxLines(2)
					if a.buttonFor(c, a.L.T("loadout.rule.remove"), r.Text, btnText, t.ControlSM, t.Surface) {
						a.send(protocol.RuleRemove{T: "rule_remove", ID: r.ID})
						lo.toast, lo.toastAt = a.L.T("loadout.rule.removed", r.Text), a.Now()
					}
				})
			}
		})
		a.textRow(c, t.ControlSM).Children(func() {
			if a.button(c, a.L.T("loadout.rule.add", name), btnText, t.ControlSM, t.Surface) {
				a.Route = RouteConversation
				a.draft = a.L.T("loadout.rule.prefill")
				a.focusComposer = true
			}
		})
	})
}

// acctLine is one AI agent's own line: its limit, where it is signed in,
// the part kept for the partner, pay per use, and Use it for tasks.
func (a *App) acctLine(c *ui.Context) {
	t := a.T
	lo := &a.lo
	h := a.trayHarness(lo.acct)
	if h == nil {
		lo.acct = ""
		return
	}
	name := harnessName(h.Harness)
	brain := h.Harness == a.brain().Harness
	ui.Column(c.Key("acct:"+h.Harness)).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).
		Role(ui.RoleGroup).Label(name).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			if bmp := theme.Clay(tokenArt(h.Harness)); bmp != nil {
				ui.Image(c, bmp).Size(28, 28).Shrink(0).AccessHidden(true)
			}
			ui.Text(c, name).FontSize(t.MD).FontWeight(800).Grow(1).MinWidth(0)
		})
		say := func(s string) { ui.Text(c, s).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft) }
		switch {
		case !h.Installed:
			say(a.L.T("loadout.acct.missing", name))
		case h.Harness == "pi" && !h.LoggedIn:
			say(a.L.T("loadout.acct.pi"))
		case !h.LoggedIn:
			say(a.L.T("loadout.acct.signin", name))
		default:
			parts := []string{}
			if al := h.Allowance; al != nil {
				if brain && al.Left <= protocol.PartnerReserve {
					parts = append(parts, a.L.T("loadout.left.reserve", pct(al.Left), a.S.PersonaName))
				} else {
					parts = append(parts, a.L.T("loadout.left", pct(al.Left)))
				}
				if al.SharedBy > 1 {
					parts = append(parts, a.L.T("loadout.acct.shared", al.SharedBy))
				} else {
					parts = append(parts, a.L.T("loadout.acct.only"))
				}
				if at := store.ParseTime(al.ResetsAt); !at.IsZero() {
					parts = append(parts, a.L.T("loadout.acct.resets", a.when(at)))
				}
			} else {
				parts = append(parts, a.L.T("loadout.signed_in"))
			}
			say(strings.Join(parts, " · "))
			if brain {
				say(a.L.T("loadout.acct.same", a.S.PersonaName, a.S.PersonaName))
			}
			if h.Billing == "usage" {
				ui.Text(c, a.L.T("loadout.acct.paid")).FontSize(t.SM).FontWeight(700).LineHeight(1.5).TextColor(t.NeedsYou.Ink)
			}
			on := a.taskReady(*h)
			note := a.L.T("loadout.acct.tasks.on", a.S.PersonaName)
			if !on {
				note = a.L.T("loadout.acct.tasks.off", a.S.PersonaName)
			}
			if v, ch := a.switchRow(c, "tasks:"+h.Harness, a.L.T("loadout.acct.tasks"), note, on); ch {
				if a.S.Settings != nil {
					if a.S.Settings.TaskAccounts == nil {
						a.S.Settings.TaskAccounts = map[string]protocol.TaskAccount{}
					}
					a.S.Settings.TaskAccounts[h.Harness] = protocol.TaskAccount{Enabled: v}
				}
				a.SetSettings(protocol.SettingsPatch{TaskAccounts: map[string]protocol.TaskAccount{h.Harness: {Enabled: v}}})
			}
		}
		a.textRow(c, t.ControlSM).Children(func() {
			if a.button(c, a.L.T("loadout.acct.devices"), btnText, t.ControlSM, t.SurfaceSunken) {
				a.OpenDevices()
				if accountCheck(h.Harness) != "" {
					a.devState().account = h.Harness
				}
			}
		})
	})
}

// loadoutToast is the page's one line after a change (a switch, a rule
// removed), for 6 s. It floats over the page, centered under the window's
// bar, so nothing below it moves.
func (a *App) loadoutToast(c *ui.Context, w float32) {
	t := a.T
	lo := &a.lo
	if lo.toast == "" || a.Now().Sub(lo.toastAt) >= 6*time.Second || lo.fx != nil {
		return
	}
	c.After(6*time.Second - a.Now().Sub(lo.toastAt))
	if w <= 0 {
		w = 1040
	}
	width := min(w-2*t.S5, 520)
	ui.Row(c.Key("loadout-toast")).Absolute().Top(76).Left((w - width) / 2).Width(width).Justify(ui.Center).ZIndex(900).PassThrough().Children(func() {
		pill := ui.Row(c.Key("pill")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).AlignItems(ui.Center).Role(ui.RoleStatus).Label(lo.toast).MaxWidthPercent(100)
		a.enter(c, pill)
		pill.Children(func() {
			a.glyph(c, 20, drawCheck(t.Done.Ink))
			ui.Text(c, lo.toast).FontSize(t.MD).FontWeight(800).MaxLines(2)
		})
	})
}

// ---------- on a task: who is doing it, why, and switching ----------

// whoLine is who does a task, in words ("Codex · gpt-5"), and why when it
// isn't Ducter's plain pick.
func (a *App) whoLine(task *store.Task) (who, why string) {
	who = a.bodyLine(task)
	w := task.Who()
	if w == nil {
		return who, ""
	}
	switch w.Why.Kind {
	case "rule":
		if w.Why.Text != "" {
			why = a.L.T("who.why.rule", w.Why.Text)
		}
	case "limit":
		if w.Why.RuleID != "" {
			why = a.L.T("who.why.limit.rule", harnessName(w.Why.From))
		} else if w.Why.From != "" {
			why = a.L.T("who.why.limit", harnessName(w.Why.From))
		}
	case "you":
		why = a.L.T("who.why.you")
	}
	return who, why
}

// canSwitch: the task can still move to another AI agent.
func canSwitch(task *store.Task) bool {
	switch task.Attention() {
	case protocol.Dropped, protocol.Superseded:
		return false
	}
	return task.Harness() != ""
}

// openSwitch opens 换谁来做 / Switch who does it for a task, asking who
// could do it.
func (a *App) openSwitch(id string) {
	lo := &a.lo
	if lo.switchFor == id {
		lo.switchFor = ""
		return
	}
	lo.switchFor, lo.pick, lo.switchMsg = id, "", ""
	a.send(protocol.CandidatesReq{T: "candidates", TaskID: id})
}

func candKey(cd protocol.Candidate) string { return cd.Harness + "/" + cd.Model }

func (a *App) candName(cd protocol.Candidate) string {
	parts := []string{harnessName(cd.Harness)}
	if cd.Model != "" {
		parts = append(parts, modelLabel(a.trayHarness(cd.Harness), cd.Model))
	}
	return strings.Join(parts, " · ")
}

// candReason is a row's why, then its limit.
func (a *App) candReason(cd protocol.Candidate) string {
	parts := []string{}
	switch cd.Blocked {
	case "":
	case "reserve":
		parts = append(parts, a.L.T("cand.reserve", a.S.PersonaName))
		if at := store.ParseTime(cd.ResetsAt); !at.IsZero() {
			parts = append(parts, a.L.T("cand.resets", a.when(at)))
		}
		return strings.Join(parts, " · ")
	default:
		return a.L.T("cand." + cd.Blocked)
	}
	switch cd.Reason.Kind {
	case "rule":
		parts = append(parts, a.L.T("cand.rule"))
	case "fit":
		parts = append(parts, a.L.T("cand.fit"))
	case "fast":
		parts = append(parts, a.L.T("cand.fast"))
	}
	if cd.Left != nil {
		parts = append(parts, a.L.T("cand.left", pct(*cd.Left)))
	}
	if cd.Billing == "usage" {
		parts = append(parts, a.L.T("cand.paid"))
	}
	return strings.Join(parts, " · ")
}

// drainSwitch takes the server's answer to a switch.
func (a *App) drainSwitch() {
	lo := &a.lo
	res := a.S.SwitchResults
	a.S.SwitchResults = nil
	for _, r := range res {
		if r.TaskID != lo.switchFor && lo.switchFor != "" {
			continue
		}
		lo.switchAt = a.Now()
		lo.switchOK = r.OK
		to := lo.switching
		lo.switching = ""
		if r.OK {
			lo.switchMsg = a.L.T("who.done", to)
			lo.switchFor = ""
		} else {
			lo.switchMsg = a.L.T("who.failed", r.Message)
		}
	}
}

// switchSheet is 换谁来做 / Switch who does it: who does it now, the top
// three others with why and the limit each, the ones that can't greyed
// with why, and 换到 X 接着做 / Continue on X.
func (a *App) switchSheet(c *ui.Context, task *store.Task) {
	t := a.T
	lo := &a.lo
	a.drainSwitch()
	if lo.switchMsg != "" && a.Now().Sub(lo.switchAt) < 6*time.Second && (lo.switchFor == "" || lo.switchFor == task.ID) {
		c.After(6*time.Second - a.Now().Sub(lo.switchAt))
		tone := noticeDone
		if !lo.switchOK {
			tone = noticeAlert
		}
		a.notice(c, "switch-said", tone, func() {
			if lo.switchOK {
				a.glyph(c, 22, drawCheck(t.Done.Ink))
			}
		}, func() {
			ui.Text(c, lo.switchMsg).FontSize(t.SM).FontWeight(700).MaxLines(2)
		}, nil)
	}
	if lo.switchFor != task.ID {
		return
	}
	cands, asked := a.S.Candidates[task.ID]
	running := task.Attention() == protocol.Working || task.Attention() == protocol.Queued
	sheet := ui.Column(c.Key("switch-sheet")).Gap(t.S3).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleDialog).Label(a.L.T("who.switch"))
	a.enter(c, sheet)
	sheet.Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.heading(c, a.L.T("who.switch"), t.LG).Grow(1).MinWidth(0)
			if a.button(c, a.L.T("loadout.cancel"), btnText, t.ControlSM, t.Surface) {
				lo.switchFor = ""
			}
		})
		if running {
			a.note(c, a.L.T("who.switch.note"))
		} else {
			a.note(c, a.L.T("who.switch.note.idle"))
		}
		if !asked {
			a.note(c, a.L.T("who.loading"))
			return
		}
		free := 0
		var chosen *protocol.Candidate
		ui.Column(c).Gap(t.S2).Children(func() {
			for i := range cands {
				cd := cands[i]
				key := candKey(cd)
				off := cd.Blocked != ""
				if !off && !cd.Current {
					free++
				}
				on := lo.pick == key && !off && !cd.Current
				if on {
					chosen = &cands[i]
				}
				name := a.candName(cd)
				row := ui.Row(c.Key("cand:"+key)).Gap(t.S3).Padding(t.S2, t.S3).Radius(t.RadiusMD).Background(t.Bg).
					Shadow(0, 3, 0, 0, t.Line).AlignItems(ui.Center).Role(ui.RoleRadio).Label(name + " · " + a.candReason(cd)).AccessSelected(on)
				if off || cd.Current {
					row.Opacity(map[bool]float32{true: 0.55, false: 1}[off])
				} else {
					row.Cursor(ui.CursorPointer).Focusable()
					a.lift(c, row, 1)
				}
				if on {
					row.InsetShadow(0, 0, 0, 2, t.Ink)
				}
				row.Children(func() {
					if bmp := theme.Clay(tokenArt(cd.Harness)); bmp != nil {
						img := ui.Image(c, bmp).Size(40, 40).Shrink(0).AccessHidden(true)
						if off {
							img.Grayscale()
						}
					}
					ui.Column(c).Grow(1).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
						ui.Text(c, name).FontSize(t.MD).FontWeight(800).SingleLine()
						if r := a.candReason(cd); r != "" {
							ui.Text(c, r).FontSize(t.SM).TextColor(t.InkMuted).MaxLines(2)
						}
					})
					if cd.Current {
						ui.Text(c, a.L.T("who.now")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Shrink(0).AccessHidden(true)
					}
				})
				if !off && !cd.Current && row.Clicked() {
					lo.pick = key
				}
			}
		})
		if free == 0 {
			a.note(c, a.L.T("cand.none"))
			return
		}
		if chosen == nil {
			return
		}
		ui.Row(c).Children(func() {
			label := a.L.T("who.go", a.candName(*chosen))
			if lo.switching != "" {
				ui.Text(c, label+"…").FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
				return
			}
			if a.buttonFor(c, label, task.Title(), btnPrimary, t.ControlMD, t.Surface) {
				lo.switching = a.candName(*chosen)
				a.send(protocol.TaskSwitch{T: "task_switch", TaskID: task.ID, Harness: chosen.Harness, Model: chosen.Model})
			}
		})
	})
}

// whoSentence is who does a task and why, as one sentence for Details:
// "Codex is doing it, because Claude Code's limit is low."
func (a *App) whoSentence(task *store.Task) string {
	who := a.bodyLine(task)
	if who == "" {
		return ""
	}
	w := task.Who()
	if w == nil {
		return a.L.T("who.sentence", who)
	}
	switch w.Why.Kind {
	case "rule":
		if w.Why.Text != "" {
			return a.L.T("who.sentence.rule", who, w.Why.Text)
		}
	case "limit":
		if w.Why.RuleID != "" {
			return a.L.T("who.sentence.limit.rule", who, harnessName(w.Why.From))
		}
		if w.Why.From != "" {
			return a.L.T("who.sentence.limit", who, harnessName(w.Why.From))
		}
	case "you":
		return a.L.T("who.sentence.you", who)
	case "default":
		return a.L.T("who.sentence.default", who, a.S.PersonaName)
	}
	return a.L.T("who.sentence", who)
}
