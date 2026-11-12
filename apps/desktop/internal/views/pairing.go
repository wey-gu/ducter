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
	recodeFor string // D228: the address a fresh code was asked for
	open      bool
	asked     time.Time
	clients   int // paired clients when it opened
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
	at, _ := a.signAt(v, spot, sw, sh)
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
		// One code, two ways to use it (D83): a phone or an app window
		// opens the address; another computer runs one command.
		if pc.Address != "" {
			ui.Text(c, pc.Address).Font(t.Mono).FontSize(t.XS).TextColor(t.InkSoft).Selectable().MaxLines(2)
			ui.Text(c, a.L.T("pair.scan")).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkSoft)
			ui.Text(c, a.L.T("pair.computer", a.S.PersonaName)).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkSoft)
			a.commandBoxSized(c, workerCommand(pc.Address, pc.Code), t.XS)
		} else {
			a.pairNoAddress(c)
		}
		ui.Text(c, a.L.T("pair.waiting")).FontSize(t.SM).FontWeight(800).TextColor(t.Ink)
	})
	if h := sign.Bounds().H; h > 0 && h != d.signH {
		d.signH = h
		c.Invalidate()
	}
}

// makeRoomForSign frames the scene beside the sign while the code is
// out: the sign takes the stage's right side or its bottom, whichever
// leaves the islands larger, and never covers one.
func (a *App) makeRoomForSign(full view, all []isle, spot *isle, sw, sh float32) view {
	d := a.devState()
	w, h := a.signSize(sw)
	right := sceneView(ui.Rect{W: sw - w - 24, H: sh}, all, spot)
	bottom := sceneView(ui.Rect{W: sw, H: sh - h - 24}, all, spot)
	d.signRight = right.k >= bottom.k && sw-w-24 > 200
	if d.signRight {
		return right
	}
	return bottom
}

func (a *App) signSize(sw float32) (float32, float32) {
	h := a.devState().signH
	if h == 0 {
		h = 260
	}
	return min(sw-24, 320), h
}

// signAt is where the sign stands: in the room made for it, level with
// the still water (on the right) or under it (at the bottom, on a short
// post up to the water: foot is the post's top).
func (a *App) signAt(v view, spot *isle, sw, sh float32) (ui.Rect, ui.Point) {
	d := a.devState()
	w, h := a.signSize(sw)
	cx, cy := v.x(spot.is.X+spot.is.W/2), v.y(spot.is.Y+spot.is.H*0.5)
	if d.signRight {
		y := min(max(cy-h/2, 12), sh-h-12)
		return ui.Rect{X: sw - w - 12, Y: y, W: w, H: h}, ui.Point{}
	}
	x := min(max(cx-w/2, 12), sw-w-12)
	r := ui.Rect{X: x, Y: sh - h - 12, W: w, H: h}
	if cx > r.X+20 && cx < r.X+r.W-20 && cy < r.Y {
		return r, ui.Point{X: cx, Y: cy}
	}
	return r, ui.Point{}
}

// workerCommand is what another computer runs to do tasks for this Ducter
// with the code (D83; the CLI prints the same line).
func workerCommand(address, code string) string {
	return "ducter worker " + address + " --code " + code
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

// pairNoAddress: nothing outside reaches this home yet. D228: 在哪儿都能用
// is one tap away; once it has an address, a fresh code carries it.
func (a *App) pairNoAddress(c *ui.Context) {
	t := a.T
	d := a.devState()
	any := a.anywhere()
	if addr := a.reachAddress(); addr != "" && d.pair.recodeFor != addr {
		d.pair.recodeFor = addr
		a.S.PairCode = nil
		a.send(protocol.PairCodeReq{T: "pair_code"})
		return
	}
	switch {
	case any != nil && any.State == "starting":
		key := "anywhere.starting"
		if any.Getting {
			key = "anywhere.getting"
		}
		ui.Text(c, a.L.T(key)).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkSoft)
	default:
		ui.Text(c, a.L.T("pair.noaddress")).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkSoft)
		if home := a.homeDevice(); home != nil && home.State == protocol.DeviceAwake {
			if a.button(c, a.L.T("anywhere.turnOnLong"), btnSecondary, t.ControlSM, t.Surface) {
				a.send(protocol.AbilityReq{T: "ability", Device: home.ID, Ability: protocol.AbilityRemote, On: true})
			}
		}
	}
}
