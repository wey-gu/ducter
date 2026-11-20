package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D398, the devices pass: every device's card answers in one order. What it
// is to Ducter now (the hero, the name, one status line); what you can do
// (its coins and chips, and the one action a moment calls for, 停下 while a
// task has the phone); what it can and can't touch (a few short promises,
// each with a drawn mark, never a paragraph); one optional step as a row
// that opens in place (锁屏时也能借给任务 ›); and the rest folded at the foot
// (how it's connected, its connections, and the one destructive action,
// 断开这台 {device}). The same order and words as the web
// (apps/web/src/devcard.tsx, handset.tsx).

// promise is one line of what a device can or can't touch: its mark and
// its words.
type promise struct {
	mark func(col ui.Color) func(p *ui.Painter, r ui.Rect)
	key  string
	arg  []any
}

// promises draws a device's promises as one soft group of short rows.
func (a *App) promises(c *ui.Context, key string, list []promise) {
	if len(list) == 0 {
		return
	}
	t := a.T
	ui.Column(c.Key("promises:"+key)).Gap(t.S2+2).Margin(t.S4, 0, 0, 0).Padding(t.S3, t.S4).Radius(t.RadiusSM).Background(t.Bg).
		Role(ui.RoleList).Children(func() {
		for i, p := range list {
			ui.Row(c.Key("promise:" + itoa(int64(i)))).Gap(t.S3).AlignItems(ui.Center).Role(ui.RoleListItem).Children(func() {
				a.glyph(c, 18, p.mark(t.InkSoft))
				uiText(c, a.L.T(p.key, p.arg...)).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).LineHeight(1.4).Grow(1).MinWidth(0)
			})
		}
	})
}

// sheetFold is the card's foot (D398): a hairline, then one quiet row (its
// title, a muted summary, a chevron) that opens in place, pushing nothing
// over anything. force keeps it open (a disconnect being confirmed inside).
func (a *App) sheetFold(c *ui.Context, key, title, summary string, force bool, body func()) {
	t := a.T
	s := &a.devState().card.sheet
	open := force || s.fold == key
	ui.Box(c.Key("fold-line:"+key)).Height(1).Background(t.LineSoft).Margin(t.S4, 0, t.S1, 0)
	row := ui.Row(c.Key("fold:"+key)).Gap(t.S2).AlignItems(ui.Center).Padding(0, t.S2).MinHeight(t.ControlSM).Radius(t.RadiusSM).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, title, summary)).Expanded(open).Focusable()
	if row.Hovered() {
		row.Background(t.Sunken)
	}
	row.Children(func() {
		uiText(c, title).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine().Shrink(0).AccessHidden(true)
		ui.Box(c).Grow(1).MinWidth(t.S2)
		if summary != "" {
			uiText(c, summary).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0).AccessHidden(true)
		}
		a.glyph(c, 12, drawChevron(t.InkMuted, open))
	})
	if row.Clicked() && !force {
		if s.fold == key {
			s.fold = ""
		} else {
			s.fold = key
		}
	}
	if !open {
		return
	}
	box := ui.Column(c.Key("fold-body:"+key)).Gap(0).Margin(t.S1, 0, 0, 0)
	a.enter(c, box)
	box.Children(body)
}

// connFold is a device's or a phone's fold: how it reaches the home (with
// whether anyone in between can read it), its connections when there is
// more than itself, and at the very end its one 断开这台 {device}.
func (a *App) connFold(c *ui.Context, card, id string, via *protocol.DeviceVia, computer string, self *protocol.ReachClient, foot func()) {
	t := a.T
	// The summary is the way it reaches the home now, else how it connects.
	summary := a.viaWords(card, self)
	if via != nil {
		summary = a.L.T("reach.via." + via.Kind)
	}
	a.sheetFold(c, card, a.L.T("reach.how"), summary, a.devState().card.cutting == id, func() {
		if via != nil {
			lineInk := t.InkMuted
			if !via.Sealed {
				lineInk = t.InkSoft
			}
			ui.Column(c.Key("how:" + card)).Radius(t.RadiusSM).Background(t.Bg).Clip().Children(func() {
				a.reachRow(c, "how-row:"+card, a.L.T("reach.via."+via.Kind), a.L.T(viaLineKey(via)), "", t.InkMuted, lineInk)
			})
		}
		a.viaLine(c, card, computer, self)
		foot()
	})
}

// ---------- 用这台手机: the phone's chip, its promises, the lock step ----------

// handsetSpec is 用这台手机 / Use this phone as the phone's chip (D398):
// on while it is added (a tap asks before turning it off, which also turns
// off Ducter's switch in Android); can't be reached, the failed tint; not
// added, dashed, and a tap says where it is added (on the phone itself).
func (a *App) handsetSpec(c *ui.Context, card string, cl *protocol.ReachClient) chipSpec {
	h := cl.Handset
	s := &a.devState().card.sheet
	name := phoneShort(cl.Name)
	sp := chipSpec{id: "handset", label: a.L.T("chip.handset"), art: abilityArt(protocol.AbilityPhone)}
	switch {
	case !h.Added:
		sp.look = chipAdd
		sp.tap = func(ui.Rect) { a.toggleChipInfo(card, "handset") }
		sp.info = func() { a.infoText(c, a.L.T("handset.elsewhere", name)) }
	case !h.Linked:
		sp.look, sp.state = chipFail, a.L.T("card.status.away")
		sp.tap = func(ui.Rect) { a.toggleChipInfo(card, "handset") }
		sp.info = func() { a.infoText(c, a.L.T("handset.away")) }
	default:
		sp.look = chipOn
		sp.tap = func(ui.Rect) {
			if s.handOff == cl.ID {
				s.handOff = ""
			} else {
				s.handOff = cl.ID
			}
		}
		sp.info = func() { a.infoText(c, a.L.T("handset.chip.about")) }
	}
	return sp
}

// handsetOffAsk is the one line the on chip asks with before it turns off.
func (a *App) handsetOffAsk(c *ui.Context, cl *protocol.ReachClient, note func(key string, tint bool, body func())) {
	t := a.T
	s := &a.devState().card.sheet
	if s.handOff != cl.ID || cl.Handset == nil || !cl.Handset.Added {
		return
	}
	note("handset-off", false, func() {
		uiText(c, a.L.T("handset.off.ask")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).LineHeight(1.4)
		a.note(c, a.L.T("handset.remove.means"))
		ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
			if a.button(c, a.L.T("handset.off.keep"), btnText, t.ControlSM, t.Bg) {
				s.handOff = ""
			}
			if a.buttonFor(c, a.L.T("handset.off.go"), phoneShort(cl.Name), btnSecondary, t.ControlSM, t.Bg) {
				s.handOff = ""
				a.send(protocol.HandsetSetReq{T: "handset_set", Device: cl.ID, On: false})
			}
		})
	})
}

// handsetStatus is a phone's status line while it can be lent (D398): lent
// now, ready to lend, or "" for the plain line.
func (a *App) handsetStatus(cl *protocol.ReachClient) (string, ui.Color, bool) {
	h := cl.Handset
	if h == nil || !h.Added || !cl.Connected {
		return "", a.T.InkMuted, false
	}
	if h.Using != nil {
		return a.L.T("handset.status.lent"), a.T.Working.Ink, true
	}
	if h.Linked {
		return a.L.T("handset.status.ready"), a.T.InkMuted, false
	}
	return "", a.T.InkMuted, false
}

// handsetPromises are what a lent phone can and can't touch, in three
// lines (D238's rules, unchanged).
func (a *App) handsetPromises(c *ui.Context, cl *protocol.ReachClient) {
	a.promises(c, "hs:"+cl.ID, []promise{
		{mark: drawPromiseEye, key: "handset.g.look"},
		{mark: drawPromiseGo, key: "handset.g.go"},
		{mark: drawPromiseLock, key: "handset.g.off"},
	})
}

// lockStep is 锁屏时也能借给任务 › (D339, D398): an optional step as one row;
// it opens in place to three short steps with the real setting's names, and
// the line that Ducter never wants the screen lock.
func (a *App) lockStep(c *ui.Context, cl *protocol.ReachClient) {
	t := a.T
	s := &a.devState().card.sheet
	open := s.lockSteps == cl.ID
	if a.extraStep(c, "lock-row:"+cl.ID, drawPromiseMoon, a.L.T("handset.lock.row"), a.L.T("handset.lock.sub"), open) {
		if open {
			s.lockSteps = ""
		} else {
			s.lockSteps = cl.ID
		}
	}
	if !open {
		return
	}
	box := ui.Column(c.Key("lock-steps:"+cl.ID)).Gap(t.S3).Margin(t.S2, 0, 0, 0).Padding(t.S3, t.S4).Radius(t.RadiusSM).Background(t.Bg).
		Role(ui.RoleGroup).Label(a.L.T("handset.lock.row"))
	a.enter(c, box)
	box.Children(func() {
		a.note(c, a.L.T("handset.lock.why"))
		for i, k := range []string{"handset.lock.s1", "handset.lock.s2", "handset.lock.s3"} {
			ui.Row(c.Key("lock-step:" + k)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
				ui.Row(c).Size(22, 22).Radius(11).Background(t.Surface).InsetShadow(0, 0, 0, 1.2, t.Line2).AlignItems(ui.Center).Justify(ui.Center).Shrink(0).
					AccessHidden(true).Children(func() {
					uiText(c, itoa(int64(i+1))).FontSize(t.XS).FontWeight(800).TextColor(t.InkSoft)
				})
				ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
					uiText(c, a.L.T(k)).FontSize(t.SM).FontWeight(600).TextColor(t.Ink).LineHeight(1.45)
					if k == "handset.lock.s1" {
						uiText(c, a.L.T("handset.lock.s1.alt")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.45)
					}
				})
			})
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawPromiseLock(t.InkMuted))
			uiText(c, a.L.T("handset.lock.never")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.45).Grow(1).MinWidth(0)
			if a.button(c, a.L.T("handset.user.done"), btnSecondary, t.ControlSM, t.Bg) {
				s.lockSteps = ""
			}
		})
	})
}

// extraStep is an optional step as one framed row (D398): its mark, its
// title, a muted line, a chevron that turns down while the step is open
// under it. It reports a click.
func (a *App) extraStep(c *ui.Context, key string, mark func(col ui.Color) func(p *ui.Painter, r ui.Rect), title, sub string, open bool) bool {
	t := a.T
	row := ui.Row(c.Key(key)).Gap(t.S3).AlignItems(ui.Center).Margin(t.S3, 0, 0, 0).Padding(t.S2, t.S3).MinHeight(t.ControlMD).
		Radius(t.RadiusSM).InsetShadow(0, 0, 0, 1.2, t.Line).Cursor(ui.CursorPointer).Role(ui.RoleButton).
		Label(spoken(a.L, title, sub)).Expanded(open).Focusable()
	if row.Hovered() {
		row.Background(t.Sunken)
	}
	row.Children(func() {
		a.glyph(c, 18, mark(t.InkSoft))
		ui.Column(c).Gap(1).Grow(1).MinWidth(0).Children(func() {
			uiText(c, title).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().AccessHidden(true)
			if sub != "" {
				uiText(c, sub).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().AccessHidden(true)
			}
		})
		a.glyph(c, 12, drawChevron(t.InkMuted, open))
	})
	return row.Clicked()
}

// workerPromises are what a computer doing tasks touches, and what it never
// sees (the old helper's two facts, as marks).
func (a *App) workerPromises(c *ui.Context, dv *protocol.DeviceView) {
	a.promises(c, "dev:"+dv.ID, []promise{
		{mark: drawFolder, key: "worker.g.uses"},
		{mark: drawPromiseChat, key: "worker.g.chat", arg: []any{a.personaName()}},
	})
}

// ---------- the marks ----------

// drawPromiseEye is an open eye: it looks only while lent.
func drawPromiseEye(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 18
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-7.5*s, cy)
		m.CubeTo(cx-4.5*s, cy-5*s, cx+4.5*s, cy-5*s, cx+7.5*s, cy)
		m.CubeTo(cx+4.5*s, cy+5*s, cx-4.5*s, cy+5*s, cx-7.5*s, cy)
		m.Close()
		p.StrokePath(&m, 1.6, col)
		var dot ui.Path
		dot.Circle(cx, cy, 2.3*s)
		p.FillPath(&dot, col)
	}
}

// drawPromiseGo is a button with a check on it: it waits for your Go.
func drawPromiseGo(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 18
		p.Stroke(ui.Rect{X: r.X + 2*s, Y: r.Y + 4*s, W: 14 * s, H: 10 * s}, col, 4*s, 1.6)
		cx, cy := r.X+r.W/2, r.Y+9*s
		var m ui.Path
		m.MoveTo(cx-3*s, cy)
		m.LineTo(cx-0.8*s, cy+2.2*s)
		m.LineTo(cx+3.2*s, cy-2.2*s)
		p.StrokePath(&m, 1.7, col)
	}
}

// drawPromiseLock is a padlock: what it can't open.
func drawPromiseLock(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 18
		cx := r.X + r.W/2
		var m ui.Path
		m.MoveTo(cx-4*s, r.Y+8*s)
		m.LineTo(cx-4*s, r.Y+5.5*s)
		m.CubeTo(cx-4*s, r.Y+1.5*s, cx+4*s, r.Y+1.5*s, cx+4*s, r.Y+5.5*s)
		m.LineTo(cx+4*s, r.Y+8*s)
		p.StrokePath(&m, 1.6, col)
		p.Stroke(ui.Rect{X: cx - 6*s, Y: r.Y + 8*s, W: 12 * s, H: 8.5 * s}, col, 2.2*s, 1.6)
		var dot ui.Path
		dot.Circle(cx, r.Y+12.2*s, 1.3*s)
		p.FillPath(&dot, col)
	}
}

// drawPromiseChat is a speech bubble with a line through it: your
// conversations stay out of its sight.
func drawPromiseChat(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 18
		x, y := r.X, r.Y
		var m ui.Path
		m.MoveTo(x+5*s, y+3*s)
		m.LineTo(x+13*s, y+3*s)
		m.CubeTo(x+15*s, y+3*s, x+16*s, y+4*s, x+16*s, y+6*s)
		m.LineTo(x+16*s, y+10*s)
		m.CubeTo(x+16*s, y+12*s, x+15*s, y+13*s, x+13*s, y+13*s)
		m.LineTo(x+8*s, y+13*s)
		m.LineTo(x+4.5*s, y+16*s)
		m.LineTo(x+4.5*s, y+13*s)
		m.CubeTo(x+3*s, y+13*s, x+2*s, y+12*s, x+2*s, y+10*s)
		m.LineTo(x+2*s, y+6*s)
		m.CubeTo(x+2*s, y+4*s, x+3*s, y+3*s, x+5*s, y+3*s)
		m.Close()
		p.StrokePath(&m, 1.5, col)
		p.Line(x+3*s, y+15.5*s, x+15.5*s, y+1.5*s, 1.6, col)
	}
}

// drawPromiseMoon is a crescent: the screen gone dark, the phone locked.
func drawPromiseMoon(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 18
		cx, cy := r.X+9*s, r.Y+9*s
		var m ui.Path
		m.MoveTo(cx+2*s, cy-7*s)
		m.CubeTo(cx-6*s, cy-6.5*s, cx-6*s, cy+6.5*s, cx+2*s, cy+7*s)
		m.CubeTo(cx+4*s, cy+7*s, cx+6*s, cy+6*s, cx+7*s, cy+4.5*s)
		m.CubeTo(cx+1*s, cy+5*s, cx-2.5*s, cy+0.5*s, cx-2*s, cy-2.5*s)
		m.CubeTo(cx-1.6*s, cy-5*s, cx+0*s, cy-6.5*s, cx+2*s, cy-7*s)
		m.Close()
		p.StrokePath(&m, 1.6, col)
	}
}
