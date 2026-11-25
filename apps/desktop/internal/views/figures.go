package views

// D565: a partner's figure, its shape beside its clay (design/personas.md
// "Figures"), the same as the web's (apps/web/src/partners.tsx): the six
// on the paper when a partner is made (meetStage), a 3 × 2 picker in
// Settings › 伙伴 above the colours (figurePick), and the one just made
// walking into its own conversation (walkIn, welcome.go's helloAvatar).

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// lookForFigure is the clay a figure arrives in: its own suggested clay,
// unless another partner has it, then the first nobody has (lookForFigure
// on the web).
func (a *App) lookForFigure(figure string) string {
	taken := map[string]bool{}
	for _, p := range a.S.Partners {
		taken[p.Look] = true
	}
	if own := protocol.FigureLook[figure]; own != "" && !taken[own] {
		return own
	}
	for _, l := range protocol.PartnerLooks[1:] {
		if !taken[l] {
			return l
		}
	}
	return "sage"
}

// figurePick is the six figures as a 3 × 2 grid, each standing in the
// given clay (the partner's own, so the person sees what they'd get) or,
// with own, in its suggested clay; the chosen one ringed and a touch
// taller. It returns the figure clicked, or "".
func (a *App) figurePick(c *ui.Context, key, value, look string, own bool) string {
	t := a.T
	hit := ""
	ui.Column(c.Key("figs:" + key)).Gap(t.S1).Role(ui.RoleRadioGroup).Label(a.L.T("partners.figure")).Children(func() {
		for row := 0; row < 2; row++ {
			ui.Row(c.Key("figs-row:" + key + string(rune('0'+row)))).Gap(t.S2).Children(func() {
				for _, f := range protocol.PartnerFigures[row*3 : row*3+3] {
					on := f == value
					name := a.L.T("partners.figure." + f)
					clay := look
					if own || clay == "" {
						clay = protocol.FigureLook[f]
					}
					chip := ui.Column(c.Key("fig:"+key+":"+f)).Size(64, 72).Radius(t.RadiusSM).Padding(6, 0, 6, 0).Gap(2).AlignItems(ui.Center).Justify(ui.End).
						Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(a.L.T("partners.figure.label", name, a.L.T("partners.figure.air."+f))).AccessSelected(on).Focusable()
					if on {
						chip.Border(2, t.InkSoft).Background(t.Surface)
					} else if chip.Hovered() {
						chip.Background(t.SurfaceSunken)
					}
					chip.Children(func() {
						lift := float32(0)
						if on {
							lift = 1
						}
						if !c.Preferences().ReduceMotion {
							lift = chip.Spring("lift", lift, ui.SpringOptions{Duration: 360 * time.Millisecond, Bounce: 0.3})
						}
						ui.Box(c.Key("fs")).Size(40, 40).Shrink(0).AccessHidden(true).Draw(func(pt *ui.Painter, r ui.Rect) {
							bmp := theme.FaceAs(theme.Wear(clay, f), theme.Idle, 80)
							if bmp == nil {
								return
							}
							s := 1 + 0.06*lift
							at := fitIn(bmp, ui.Rect{X: r.X + r.W*(1-s)/2, Y: r.Y, W: r.W * s, H: r.H * s})
							at.Y = r.Y + r.H - at.H - 2*lift
							pt.Image(bmp, at, ui.Contain)
						})
						tx := t.InkSoft
						if on {
							tx = t.Ink
						}
						uiText(c, name).FontSize(t.XS).FontWeight(600).TextColor(tx).SingleLine().AccessHidden(true)
					})
					if chip.Clicked() {
						hit = f
					}
				}
			})
		}
	})
	return hit
}

// meetHop is how long the chosen figure's hop forward takes.
const meetHop = 620 * time.Millisecond

// meetStage is the moment a partner is made (D565): the six stand on the
// paper, breathing and blinking out of step, the chosen one raised; a
// click hops it forward, its name and its air beneath. Reduce Motion
// stills it all (the chosen one still stands raised).
func (a *App) meetStage(c *ui.Context) {
	t := a.T
	ps := &a.partners
	uiText(c, a.L.T("partners.meet")).FontSize(t.SM).TextColor(t.InkMuted)
	ui.Row(c.Key("meet")).Gap(t.S1).Padding(t.S4, t.S2, t.S2, t.S2).Radius(t.RadiusMD).Background(t.SurfaceSunken).AlignItems(ui.End).
		Role(ui.RoleRadioGroup).Label(a.L.T("partners.figure")).Children(func() {
		for i, f := range protocol.PartnerFigures {
			on := f == ps.figure
			clay := protocol.FigureLook[f]
			if on {
				clay = ps.look
			}
			wear := theme.Wear(clay, f)
			name := a.L.T("partners.figure." + f)
			cell := ui.Box(c.Key("meet:" + f)).Grow(1).Height(76).AlignItems(ui.Center).Justify(ui.End).Radius(t.RadiusSM).
				Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(a.L.T("partners.figure.label", name, a.L.T("partners.figure.air."+f))).AccessSelected(on).Focusable()
			lift := float32(0)
			if on {
				lift = 1
			}
			if !c.Preferences().ReduceMotion {
				lift = cell.Spring("lift", lift, ui.SpringOptions{Duration: 360 * time.Millisecond, Bounce: 0.3})
			}
			phase := phaseOf("meet:" + f + string(rune('a'+i)))
			hop := time.Time{}
			if on {
				hop = ps.hopAt
			}
			cell.Children(func() {
				ui.Box(c.Key("mf")).Size(56, 56).Shrink(0).AccessHidden(true).Draw(func(pt *ui.Painter, r ui.Rect) {
					bmp := theme.FaceAs(wear, theme.Idle, 112)
					if bmp == nil {
						return
					}
					s := 1 + 0.12*lift
					dy := -6 * lift
					if !pt.Preferences().ReduceMotion && !hop.IsZero() {
						if el := pt.Now().Sub(hop); el < meetHop {
							x := float64(el) / float64(meetHop)
							dy -= float32(9 * math.Abs(math.Sin(x*math.Pi*1.5)) * math.Exp(-2.4*x))
							pt.AnimationFrame()
						}
					}
					at := fitIn(bmp, ui.Rect{X: r.X + r.W*(1-s)/2, Y: r.Y, W: r.W * s, H: r.H * s})
					at.Y = r.Y + r.H - at.H + dy
					var lids *blinkArt
					if b := theme.FaceClosedAs(wear, 112); b != nil {
						lids = &blinkArt{closed: b, lids: theme.LidsOf(wear)}
					}
					clayArt(pt, at, bmp, idleBreathe, phase, lids)
				})
			})
			if cell.Clicked() && !on {
				ps.figure, ps.hopAt = f, a.Now()
				if !ps.ownLook {
					ps.look = a.lookForFigure(f)
				}
			}
		}
	})
	ui.Row(c.Key("meet-who")).Gap(t.S2).Justify(ui.Center).AlignItems(ui.Baseline).Role(ui.RoleStatus).Children(func() {
		uiText(c, a.L.T("partners.figure."+ps.figure)).FontSize(t.MD).FontWeight(700).TextColor(t.Ink)
		uiText(c, a.L.T("partners.figure.air."+ps.figure)).FontSize(t.SM).TextColor(t.InkSoft)
	})
}

// walkInFor is how long a partner just made takes to walk into its
// conversation.
const walkInFor = 900 * time.Millisecond

// walkIn is where the one just made stands el into its walk: in from the
// side with two small steps (web app.css .walk-in).
func walkIn(el time.Duration) (dx, dy float32) {
	x := float64(el) / float64(walkInFor)
	e := 1 - math.Pow(1-x, 3)
	dx = float32(-56 * (1 - e))
	dy = float32(-4 * math.Abs(math.Sin(x*2*math.Pi)) * (1 - x))
	return dx, dy
}
