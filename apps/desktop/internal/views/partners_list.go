package views

// D513: 伙伴们 / Your partners as a messaging app lists its chats, the same
// as the web's (apps/web/src/partners.tsx PartnerList). With more than one
// partner, the conversation has a column at its left: each row the
// partner's figure in its own clay, its name, the last thing said in its
// conversation and, on the figure's shoulder, the number of what of its own
// waits on the person. With one partner there is no column.
//
// D517 (the author's review of 0.1.35 at about 1150 points): the list
// shows names and last lines from 1200 points; under it each figure keeps
// its name under it (never a bare face, never a tooltip over the traffic
// lights). The list never moves when a partner is picked: the chosen
// pebble glides to it on a spring and lifts, and only the conversation
// comes in. Each figure breathes and blinks in its own clay, out of step
// with the others, and hops once when something new comes from it. The
// number is a clay pebble in the needs-you colours, the person's one count
// (needsyou.go). Under Reduce Motion all of it is still.

import (
	"fmt"
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// partnerRailWide is the window width from which the list shows names and
// last lines (a 13-inch laptop's usual window is wider); under it, each
// figure with its name under it.
const partnerRailWide = 1200

// The rows' geometry: the knob glides from row to row by these.
const (
	railRowWide = 64
	railRowSlim = 74
	railRowGap  = 4
	railFace    = 40
	// D545: the thin list: the faces alone, smaller, in a strip.
	railThinW     = 60
	railThinFace  = 30
	railRowThin   = 52
	railBounceDur = 700 * time.Millisecond
)

// railUI is the list's own state: the numbers held while a switch waits
// for its welcome (the store starts over), and what each partner last said
// (a new line makes its figure hop).
type railUI struct {
	// changed is when the bar's toggle last changed how the list stands (D545).
	changed  time.Time
	held     map[string]int
	lastAt   map[string]string
	hopAt    map[string]time.Time
	switched time.Time
}

// partnerRailW is the column's width: wide with words, slim with names,
// thin with the faces alone (D545).
func (a *App) partnerRailW() float32 {
	if a.railThin() {
		return railThinW
	}
	if a.winW >= partnerRailWide {
		return 272
	}
	return 88
}

// partnerRailShown: the conversation has the list at its left (D513). It
// stays through a switch (the store starts over until the welcome; the
// partners are kept), so the list never blinks out.
func (a *App) partnerRailShown() bool {
	return a.manyPartners() && a.Local.RailMode() != "hidden"
}

// partnerGone: the partner this window showed was removed (D486): it shows
// the default's.
func (a *App) partnerGone() {
	if id := a.S.Persona; id != "" && id != protocol.DefaultPartner && a.S.Partners != nil && a.S.Welcomed {
		for _, p := range a.S.Partners {
			if p.ID == id {
				return
			}
		}
		a.SwitchPartner(protocol.DefaultPartner)
	}
}

// partnerLastWords is what a row says under the name: the last thing said
// (the person's own words marked as theirs), else what it looks after, else
// that nothing was said yet.
func (a *App) partnerLastWords(p protocol.PartnerInfo) string {
	if p.Last != nil && p.Last.Text != "" {
		if p.Last.You {
			return a.L.T("partners.you", p.Last.Text)
		}
		return p.Last.Text
	}
	if p.About != "" {
		return a.L.T("partners.about.shown", p.About)
	}
	return a.L.T("partners.empty")
}

// railNeeds is each partner's number: the person's one count's (D517),
// or, while a switch waits for its welcome, the numbers it had.
func (a *App) railNeeds() map[string]int {
	if !a.S.Welcomed && a.rail.held != nil {
		return a.rail.held
	}
	items := a.needsYou()
	out := map[string]int{}
	for _, p := range a.S.Partners {
		out[p.ID] = needsOf(items, p.ID)
	}
	if a.S.Welcomed {
		a.rail.held = nil
	}
	return out
}

// holdRail keeps the rows' numbers for the switch about to start.
func (a *App) holdRail() {
	if a.manyPartners() && a.S.Welcomed {
		a.rail.held = a.railNeeds()
	}
	a.rail.switched = a.Now()
}

// noteNew marks a partner's figure to hop when it says something new or
// something new of its own waits on the person (never on the first look).
func (a *App) noteNew(p protocol.PartnerInfo, needs int) {
	if a.rail.lastAt == nil {
		a.rail.lastAt, a.rail.hopAt = map[string]string{}, map[string]time.Time{}
	}
	key := fmt.Sprint(needs)
	if p.Last != nil && !p.Last.You {
		key += "|" + p.Last.At
	}
	was, seen := a.rail.lastAt[p.ID]
	a.rail.lastAt[p.ID] = key
	// Not while a switch settles: the numbers come back from the new welcome then.
	settling := !a.rail.switched.IsZero() && a.Now().Sub(a.rail.switched) < 2*time.Second
	if seen && was != key && p.ID != a.shownPartnerID() && a.S.Welcomed && !settling {
		a.rail.hopAt[p.ID] = a.Now()
	}
}

// conversationWithPartners is the conversation, with the list of partners
// at its left once there is more than one. The conversation alone comes in
// on a switch (keyed by whose it is); the list stays.
func (a *App) conversationWithPartners(c *ui.Context) {
	a.partnerGone()
	if !a.partnerRailShown() {
		a.conversation(c)
		return
	}
	ui.Row(c.Key("conv-with-partners")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
		a.partnerRail(c)
		// D541: one column for every partner: the bar and the composer stay
		// exactly where they are, and the conversation held for the partner
		// picked is drawn in the next frame, in place (no fade, no rise).
		col := ui.Column(c.Key("conv-beside")).Grow(1).MinWidth(0).MinHeight(0)
		col.Children(func() { a.conversation(c) })
	})
}

// partnerRail draws the column: room for the traffic lights on top (it is
// the window's left edge), its title when wide, then a row per partner on
// one track the chosen pebble glides along.
func (a *App) partnerRail(c *ui.Context) {
	t := a.T
	w := a.partnerRailW()
	wide := w > 120
	shown := a.shownPartnerID()
	needs := a.railNeeds()
	// D545: one element per way it stands (as wide as the window has it,
	// thin), so a change slides the list in from its edge on D290's across;
	// its width changes once, at the press, and the conversation is laid out
	// once for it, never mid-motion.
	rail := ui.Column(c.Key("partner-rail:" + a.Local.RailMode())).Width(w).Shrink(0).Background(t.Chrome).
		Role(ui.RoleNavigation).Label(a.L.T("partners.title"))
	// The list's rule. Thin, the strip is narrower than the window's
	// controls: its band joins the bar's (one chrome under the controls, no
	// rule through them) and the rule starts at the bar's line (D545).
	thin := a.railThin()
	if !thin {
		rail.BorderWidth(0, 1, 0, 0).BorderColor(t.ChromeLine)
	}
	a.railEnter(c, rail)
	rail.Children(func() {
		// D517: the list owns the title bar's zone, as a Mac sidebar does: the
		// traffic lights sit in its top band (the bar's height, centred on the
		// header's line), and the band ends on the header's own bottom rule, so
		// the list's divider and the header's rule meet in one T. Nothing is
		// drawn in the band: no face or word ever sits under the lights, at
		// any width or in full screen (where the lights are gone, the band
		// stays, the rule unbroken). The window drags here.
		ui.Row(c.Key("partner-rail-top")).Height(ChromeH).Shrink(0).BorderWidth(0, 0, 1, 0).BorderColor(t.ChromeLine).DragWindow()
		if wide {
			uiText(c, a.L.T("partners.title")).FontSize(barText).FontWeight(600).TextColor(t.InkMuted).Padding(t.S4, t.S5, t.S1, t.S5).SingleLine()
		}
		rowH := float32(railRowSlim)
		if wide {
			rowH = railRowWide
		}
		if a.railThin() {
			rowH = railRowThin
		}
		at := 0
		for i, p := range a.S.Partners {
			if p.ID == shown {
				at = i
			}
		}
		rows := ui.Scroll(c.Key("partner-rail-rows")).Grow(1).MinHeight(0)
		if thin {
			rows.BorderWidth(0, 1, 0, 0).BorderColor(t.ChromeLine)
		}
		rows.Children(func() {
			// A clear gap under the band before the first figure (its badge
			// stands above the face; the gap keeps it off the rule).
			top := float32(t.S4)
			if wide {
				top = t.S2
			}
			track := ui.Box(c.Key("partner-rail-track")).Padding(top, t.S2+2, t.S4, t.S2+2)
			track.Children(func() {
				// The chosen pebble: the surface on its ledge, under the row it
				// marks, gliding there on a spring when another is picked.
				knob := ui.Box(c.Key("rail-knob")).Absolute().Left(t.S2+2).Right(t.S2+2).Height(rowH).Radius(t.RadiusMD).
					Background(t.Surface).Shadow(0, 4, 0, 0, t.Line).AccessHidden(true).ZIndex(-1)
				y := float32(at) * (rowH + railRowGap)
				if c.Preferences().ReduceMotion {
					y = knob.Jump("y", y)
				} else {
					y = knob.Spring("y", y, ui.SpringOptions{Duration: 420 * time.Millisecond, Bounce: 0.22})
				}
				knob.Top(top + y)
				ui.Column(c.Key("partner-rail-col")).Gap(railRowGap).Children(func() {
					for i, p := range a.S.Partners {
						a.noteNew(p, needs[p.ID])
						a.partnerRailRow(c, i, p, p.ID == shown, wide, rowH, needs[p.ID])
					}
				})
			})
		})
	})
}

// partnerRailRow is one partner in the list: no tooltip (the name is
// always there to read); its label says whose and what waits.
func (a *App) partnerRailRow(c *ui.Context, i int, p protocol.PartnerInfo, on, wide bool, rowH float32, needs int) {
	t := a.T
	label := a.L.T("partners.switch", p.Name)
	switch {
	case on && needs > 0:
		label = a.L.T("door.pebble", p.Name, needs)
	case on:
		label = a.L.T("partners.here", p.Name)
	case needs > 0:
		label = a.L.T("partners.switch.asks", p.Name, needs)
	}
	var row ui.Element
	if wide {
		row = ui.Row(c.Key("prow:"+p.ID)).Gap(t.S3).AlignItems(ui.Center).Padding(0, t.S3)
	} else {
		row = ui.Column(c.Key("prow:"+p.ID)).Gap(3).AlignItems(ui.Center).Justify(ui.Center).Padding(0, 4)
	}
	row.Height(rowH).Radius(t.RadiusMD).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).AccessSelected(on).Focusable()
	if !on && (row.Hovered() || row.Pressed() || row.FocusVisible()) {
		row.Background(t.SurfaceSunken.Alpha(0.7))
	}
	if row.FocusVisible() {
		row.Border(2, t.Accent) // the keyboard's ring, as every focusable control has
	}
	nameInk := t.InkSoft
	if on {
		nameInk = t.Ink
	}
	door := false
	row.Children(func() {
		door = a.railFace(c, p, on, needs)
		if a.railThin() {
			return // D545: the faces alone; the row's label says whose
		}
		if !wide {
			uiText(c, p.Name).FontSize(11).FontWeight(700).TextColor(nameInk).SingleLine().MaxWidth(76).AccessHidden(true)
			return
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			uiText(c, p.Name).FontSize(t.MD).FontWeight(700).TextColor(nameInk).SingleLine()
			uiText(c, a.partnerLastWords(p)).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
		})
	})
	if row.Clicked() {
		// D535: the partner shown, with something waiting: its row is the
		// door too (the keyboard's way to the pebble's).
		if door || (on && needs > 0) {
			a.openDoor(p.ID)
		} else {
			a.SwitchPartner(p.ID)
		}
	}
	_ = i
}

// railFace is a partner's figure in its own clay: it breathes and blinks
// (out of step with the others), stands a little taller while chosen, and
// hops once when something new comes from it. Its number sits on its
// shoulder as a clay pebble.
func (a *App) railFace(c *ui.Context, p protocol.PartnerInfo, on bool, needs int) (door bool) {
	t := a.T
	look := a.wearOf(&p)
	fs := float32(railFace)
	if a.railThin() {
		fs = railThinFace
	}
	box := ui.Box(c.Key("pface:"+p.ID)).Size(fs+8, fs+4).Shrink(0).AccessHidden(true)
	lift := float32(0)
	if !c.Preferences().ReduceMotion {
		target := float32(0)
		if on {
			target = 1
		}
		lift = box.Spring("lift", target, ui.SpringOptions{Duration: 360 * time.Millisecond, Bounce: 0.3})
	} else if on {
		lift = 1
	}
	hop := a.rail.hopAt[p.ID]
	phase := phaseOf("rail:" + p.ID)
	box.Draw(func(pt *ui.Painter, r ui.Rect) {
		bmp := theme.FaceAs(look, theme.Idle, fs*2)
		if bmp == nil {
			return
		}
		// Standing on the box's bottom, a touch larger while chosen (the
		// pebble lifted), and hopping once when something new came.
		s := 1 + 0.06*lift
		fw, fh := fs*s, fs*s
		dy := float32(0)
		if !pt.Preferences().ReduceMotion && !hop.IsZero() {
			if el := pt.Now().Sub(hop); el < railBounceDur {
				x := float64(el) / float64(railBounceDur)
				dy = -float32(7 * math.Abs(math.Sin(x*2*math.Pi)) * math.Exp(-3.2*x))
				pt.AnimationFrame()
			}
		}
		at := ui.Rect{X: r.X + (r.W-fw)/2, Y: r.Y + r.H - fh + dy - 2*lift, W: fw, H: fh}
		at = fitIn(bmp, at)
		at.Y = r.Y + r.H - at.H + dy - 2*lift
		var lids *blinkArt
		if b := theme.FaceClosedAs(look, fs*2); b != nil {
			lids = &blinkArt{closed: b, lids: theme.LidsOf(look)}
		}
		clayArt(pt, at, bmp, idleBreathe, phase, lids)
	})
	box.Children(func() {
		if needs <= 0 {
			return
		}
		ring := t.Chrome
		if on {
			ring = t.Surface
		}
		// The number: the shared clay pebble on its shoulder, a door (D535):
		// a tap goes to that partner's next item that waits.
		e, ok := a.pebbleDoor(c, p.ID, needs, ring)
		e.Absolute().Right(-8).Top(-7)
		door = ok
	})
	return door
}

// railThin is the list as a strip of faces (D545).
func (a *App) railThin() bool { return a.manyPartners() && a.Local.RailMode() == "thin" }

// nextRail is where the bar's toggle takes the list (D545): as wide as
// the window has it, then thin, then hidden, then back.
func (a *App) nextRail() string {
	switch a.Local.RailMode() {
	case "":
		return "thin"
	case "thin":
		return "hidden"
	}
	return ""
}

// setRail changes how the list stands and remembers it on this Mac.
func (a *App) setRail(m string) {
	a.Local.SetRailMode(m)
	a.rail.changed = a.Now()
}

// railEnter slides the list in from its edge after a change (D290's
// across: 14 points and a fade), at once under Reduce Motion or on launch.
func (a *App) railEnter(c *ui.Context, e ui.Element) {
	if c.Preferences().ReduceMotion || a.rail.changed.IsZero() || a.Now().Sub(a.rail.changed) > time.Second {
		return
	}
	shown := ui.Local(e, "entered", func() bool { return false })
	p := ui.Pose{}
	if !*shown {
		p, *shown = ui.Pose{X: -a.T.Nav.Shift, Fade: 1}, true
		c.Invalidate()
	}
	e.AnimatePose(p, a.T.Nav.Across)
}

// railToggle is the bar's toggle for the list beside the conversation
// (D545): a drawn window with its side column, the column as wide as the
// list will be after the press; its name says what the press does.
func (a *App) railToggle(c *ui.Context) {
	if !a.manyPartners() {
		return
	}
	next := a.nextRail()
	label := a.L.T("partners.rail.show")
	switch next {
	case "thin":
		label = a.L.T("partners.rail.thin")
	case "hidden":
		label = a.L.T("partners.rail.hide")
	}
	// The glyph says how the list stands now (the places' family: an
	// 18-point mark, a 1.6 stroke, the muted ink warming under the pointer):
	// the window's outline and the list's edge as a thin inner line, wide
	// as the width has it, narrow when thin, dashed when hidden.
	mode := a.Local.RailMode()
	t := a.T
	if a.iconButton(c, label, t.ControlSM, btnText, func(fg ui.Color) func(p *ui.Painter, r ui.Rect) {
		if fg == t.InkSoft {
			fg = t.InkMuted
		}
		return drawRailGlyph(mode, fg)
	}) {
		a.setRail(next)
	}
}

// drawRailGlyph is the list toggle's mark (D545): a window's outline and
// the list's edge inside it, in the places' stroke.
func drawRailGlyph(mode string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		const g = 18
		x, y := r.X+(r.W-g)/2, r.Y+(r.H-g)/2
		w := float32(1.6)
		p.Stroke(ui.Rect{X: x + 2, Y: y + 3.5, W: 14, H: 11}, col, 2.5, w)
		edge := x + 2 + 5.5
		if mode == "thin" {
			edge = x + 2 + 3
		}
		if mode != "hidden" {
			p.Line(edge, y+3.5, edge, y+14.5, w, col)
			return
		}
		for _, a := range []float32{5.2, 8.2, 11.2} {
			p.Line(edge, y+a, edge, y+a+1.6, w, col)
		}
	}
}
