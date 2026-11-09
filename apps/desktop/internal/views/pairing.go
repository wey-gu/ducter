package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Connecting a device happens in the scene (D81): 连上手机或另一台电脑 /
// Connect a phone or computer makes a jetty grow out of home toward a
// ring of still water, with a clay sign at its end: the one-time code,
// how to use it, and 「等它连上…」. No sheet over the stage. When a device
// joins, its island rises in that water and the device drops on
// (isles.go: joined, riseOf). The sign's words are the pair.* keys, kept
// here in one small function so the code card's copy can change on its own.

type pairState struct {
	open    bool
	asked   time.Time
	clients int // paired clients when it opened
	// known are the islands there when the code went out: one that wasn't
	// is the device that joined.
	known map[string]bool
	// joined is the island that just joined, rising since joinedAt.
	joined   string
	joinedAt time.Time
}

func (a *App) openPair() {
	d := a.devState()
	d.pair.open, d.pair.asked = true, a.Now()
	d.pair.clients = 0
	if a.S.Reach != nil {
		d.pair.clients = len(a.S.Reach.Clients)
	}
	d.pair.known = map[string]bool{}
	for _, s := range a.isles() {
		d.pair.known[s.key] = true
	}
	d.pair.joined = ""
	a.S.PairCode = nil
	a.send(protocol.PairCodeReq{T: "pair_code"})
}

// pairSign is the sign at the end of the jetty: the code and how to use
// it. It stands over the still water where the new device will rise,
// kept inside the stage.
func (a *App) pairSign(c *ui.Context, v view, spot *isle, all []isle, sw, sh float32) {
	t := a.T
	d := a.devState()
	pc := a.S.PairCode
	at, _ := a.signAt(v, spot, all, sw, sh)
	sign := ui.Column(c.Key("pair")).Absolute().Left(at.X).Top(at.Y).Width(at.W).
		Padding(t.S3, t.S4, t.S4, t.S4).Gap(t.S2).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).ZIndex(10).
		Role(ui.RoleGroup).Label(a.L.T("pair.title"))
	if !c.Preferences().ReduceMotion {
		a.enter(c, sign)
	}
	sign.Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("pair.code")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).Grow(1).MinWidth(0)
			if a.button(c, a.L.T("pair.close"), btnText, t.ControlSM, t.Surface) {
				d.pair.open, d.pair.known = false, nil
			}
		})
		if pc == nil {
			ui.Text(c, a.L.T("devices.loading")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		exp := store.ParseTime(pc.ExpiresAt)
		left := exp.Sub(a.Now())
		if !exp.IsZero() && left <= 0 {
			a.reasonLine(c, a.L.T("pair.expired"))
			if a.button(c, a.L.T("pair.again"), btnPrimary, t.ControlMD, t.Surface) {
				a.openPair()
			}
			return
		}
		if left > 0 {
			c.After(min(left, time.Minute))
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if len(pc.QR) > 0 {
				qrBox(c, pc.QR, 88, t.Ink, t.Surface)
			}
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, pc.Code).Font(t.Mono).FontSize(t.XL).FontWeight(800).LetterSpacing(1).Selectable()
				mins := int(math.Ceil(left.Minutes()))
				ui.Text(c, a.L.T("pair.once", mins)).FontSize(t.XS).TextColor(t.InkMuted)
			})
		})
		if pc.Address != "" {
			ui.Text(c, pc.Address).Font(t.Mono).FontSize(t.XS).TextColor(t.InkSoft).Selectable().MaxLines(2)
			ui.Text(c, a.L.T("pair.scan")).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkSoft)
		} else {
			ui.Text(c, a.L.T("pair.noaddress")).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkSoft)
		}
		ui.Text(c, a.L.T("pair.waiting")).FontSize(t.SM).FontWeight(800).TextColor(t.Ink)
	})
	if h := sign.Bounds().H; h > 0 && h != d.signH {
		d.signH = h
		c.Invalidate()
	}
}

// signAt is where the sign stands by the still water, kept inside the
// stage: above it on a short post (foot is the post's foot, in the
// water), else below, beside it right or left, whichever covers the
// least of the islands.
func (a *App) signAt(v view, spot *isle, all []isle, sw, sh float32) (ui.Rect, ui.Point) {
	d := a.devState()
	w := min(sw-24, 290)
	h := d.signH
	if h == 0 {
		h = 220
	}
	ring := v.r(ui.Rect{X: spot.is.X + spot.is.W*0.08, Y: spot.is.Y + spot.is.H*0.18, W: spot.is.W * 0.84, H: spot.is.H * 0.64})
	cx, cy := ring.X+ring.W/2, ring.Y+ring.H/2
	clamp := func(r ui.Rect) ui.Rect {
		r.X = min(max(r.X, 12), sw-r.W-12)
		r.Y = min(max(r.Y, 12), sh-r.H-12)
		return r
	}
	post := 30 * v.k
	cands := []ui.Rect{
		{X: cx - w/2, Y: ring.Y - post - h, W: w, H: h},
		{X: cx - w/2, Y: ring.Y + ring.H + 10, W: w, H: h},
		{X: ring.X + ring.W + 10, Y: cy - h/2, W: w, H: h},
		{X: ring.X - 10 - w, Y: cy - h/2, W: w, H: h},
	}
	overlap := func(a, b ui.Rect) float32 {
		x := min(a.X+a.W, b.X+b.W) - max(a.X, b.X)
		y := min(a.Y+a.H, b.Y+b.H) - max(a.Y, b.Y)
		if x <= 0 || y <= 0 {
			return 0
		}
		return x * y
	}
	best, bestScore := 0, float32(-1)
	for i, c := range cands {
		r := clamp(c)
		score := overlap(r, ring) * 4
		for _, s := range all {
			box := v.r(s.is)
			dev := v.r(s.dev)
			top := dev.Y
			if s.home {
				top -= 110 * v.k
			}
			score += overlap(r, ui.Rect{X: box.X, Y: top, W: box.W, H: box.Y + box.H + 30 - top})
		}
		score += (abs32(r.X-c.X) + abs32(r.Y-c.Y)) * 20 // moved away from the water
		if bestScore < 0 || score < bestScore-1 {
			best, bestScore = i, score
		}
	}
	r := clamp(cands[best])
	if best == 0 && r.Y+r.H < ring.Y {
		return r, ui.Point{X: cx, Y: cy}
	}
	return r, ui.Point{}
}

// qrBox draws a QR code from rows of "1" and "0", with its quiet zone.
func qrBox(c *ui.Context, rows []string, size float32, ink, paper ui.Color) {
	n := len(rows)
	ui.Box(c).Size(size, size).Radius(12).Background(paper).Border(1.5, ink.Alpha(0.12)).Shrink(0).Role(ui.RoleImage).Label("QR").
		Draw(func(p *ui.Painter, r ui.Rect) {
			cell := (r.W - 16) / float32(n)
			ox, oy := r.X+8, r.Y+8
			for y, row := range rows {
				for x := 0; x < len(row); x++ {
					if row[x] == '1' {
						p.Fill(ui.Rect{X: ox + float32(x)*cell, Y: oy + float32(y)*cell, W: cell + 0.3, H: cell + 0.3}, ink, 0)
					}
				}
			}
		})
}
