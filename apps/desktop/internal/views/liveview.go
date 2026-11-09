package views

import (
	"bytes"
	"image"
	_ "image/jpeg" // live view frames
	"net/url"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Signing in to a site in Ducter's own browser (D151). A task that needs
// the user signed in asks with a sign-in card: 需要你登录一下 {site} /
// Sign in to {site}. 去登录 / Sign in opens the live view: the server
// browser's page, painted from its frames, with the user's clicks, scrolls
// and keys going straight in. The partner sees nothing of it while it is
// open; 好了 / Done answers the card and the task reads the page again.

// liveState is the view's own part of a live view: the bitmap the frames
// paint into, and the last frame painted (acked to get the next).
type liveState struct {
	bmp    *ui.Bitmap
	shown  int64
	sentAt string // the decision whose live_open went out
}

// signInBody is a sign-in card's words and buttons, in place of the
// question, default line and Go / Hold / Reply….
func (a *App) signInButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	site := d.SignIn.Site
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("signin.resolved")
		if (d.Resolved != nil && d.Resolved.Option == "hold") || d.Pending == "hold" {
			msg = a.L.T("signin.resolved.hold")
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	ui.Text(c, a.L.T("signin.why")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
	ui.Row(c.Key("signin:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("signin.later"), site, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.buttonFor(c, a.L.T("signin.open"), site, btnPrimary, st.height, st.quietBg) {
			a.OpenLive(d.DecisionID, site)
		}
	})
}

// questionOf is a decision's question as the user reads it: a sign-in
// card's own words (the task's are English), else the task's question.
func (a *App) questionOf(d *store.DecisionState) string {
	if d.SignIn != nil {
		return a.L.T("signin.title", d.SignIn.Site)
	}
	return d.Question
}

// OpenLive opens the live view for a sign-in card, sized to this window.
func (a *App) OpenLive(decisionID, site string) {
	a.S.OpenLive(decisionID, site)
	a.live = liveState{sentAt: decisionID}
	w, h := a.liveSize()
	a.send(protocol.LiveOpenReq{T: "live_open", DecisionID: decisionID, Width: w, Height: h, Scale: 2})
}

// OpenTry is 试一下 / Try it on the 上网 block (D154): the same live view
// on a harmless page, with no card behind it, so the user sees Ducter's
// own browser working with their own eyes.
func (a *App) OpenTry() {
	a.S.OpenLive(protocol.TryLive, "example.com")
	a.live = liveState{sentAt: protocol.TryLive}
	w, h := a.liveSize()
	a.send(protocol.LiveOpenReq{T: "live_open", DecisionID: protocol.TryLive, Width: w, Height: h, Scale: 2, Try: true})
}

// liveTitle names the view for assistive tech: the sign-in, or Try it.
func (a *App) liveTitle(lv *store.LiveView) string {
	if lv.Try() {
		return a.L.T("web.try")
	}
	return a.L.T("signin.title", lv.Site)
}

// liveWhere is the view's small line: whose browser and that the partner
// can't see it; for Try it, which browser on which machine (D154).
func (a *App) liveWhere(lv *store.LiveView) string {
	if lv.Try() && lv.Browser != nil {
		b := lv.Browser
		name := b.Name
		if b.Version != "" {
			name += " " + strings.SplitN(b.Version, ".", 2)[0]
		}
		return a.L.T("live.try.where", b.Device, name)
	}
	return a.L.T("live.where") + " · " + a.L.T("live.blind")
}

// liveSize is the page size the live view asks for: the window less its
// two bars, at most 1280 wide.
func (a *App) liveSize() (int, int) {
	w, h := a.winW, a.winH
	if w <= 0 || h <= 0 {
		w, h = 1100, 760
	}
	w -= 48
	h -= 168
	if w > 1280 {
		w = 1280
	}
	if w < 360 {
		w = 360
	}
	if h < 360 {
		h = 360
	}
	return int(w), int(h)
}

func (a *App) liveInput(in protocol.LiveInput) {
	if lv := a.S.Live; lv != nil && lv.ID != "" {
		a.send(protocol.LiveInputReq{T: "live_input", ID: lv.ID, Input: in})
	}
}

// CloseLive is 好了 / Done (done) or 先不登了 / Not now.
func (a *App) CloseLive(done bool) {
	lv := a.S.Live
	if lv == nil {
		return
	}
	if lv.ID != "" {
		a.send(protocol.LiveCloseReq{T: "live_close", ID: lv.ID, Done: done})
	}
	a.S.Live = nil
	a.live = liveState{}
}

var liveKeys = map[ui.Key]string{
	ui.KeyEnter: "Enter", ui.KeyTab: "Tab", ui.KeyBackspace: "Backspace", ui.KeyDelete: "Delete", ui.KeyEscape: "Escape",
	ui.KeyUp: "ArrowUp", ui.KeyDown: "ArrowDown", ui.KeyLeft: "ArrowLeft", ui.KeyRight: "ArrowRight",
	ui.KeyHome: "Home", ui.KeyEnd: "End", ui.KeyPageUp: "PageUp", ui.KeyPageDown: "PageDown",
}

// liveView draws the live view over the window while one is open.
func (a *App) liveView(c *ui.Context) {
	if c := a.S.LiveClosed; c != nil {
		a.S.LiveClosed = nil
		a.live = liveState{}
		switch c.Reason {
		case "failed":
			a.liveNote = a.L.T("live.failed", c.Message)
		case "replaced":
			a.liveNote = a.L.T("live.replaced")
		}
	}
	if a.liveNote != "" {
		c.Toast(a.liveNote)
		a.liveNote = ""
	}
	lv := a.S.Live
	if lv == nil {
		return
	}
	t := a.T
	host := lv.Site
	if u, err := url.Parse(lv.URL); err == nil && u.Hostname() != "" {
		host = strings.TrimPrefix(u.Hostname(), "www.")
	}
	// The newest frame goes into the bitmap; the server sends the next
	// once this one is acked.
	if lv.Seq != 0 && lv.Seq != a.live.shown && lv.Frame != nil {
		if img, _, err := image.Decode(bytes.NewReader(lv.Frame)); err == nil {
			if a.live.bmp == nil {
				a.live.bmp = ui.NewBitmap(img)
			} else {
				a.live.bmp.Update(img)
			}
		}
		a.live.shown = lv.Seq
		a.send(protocol.LiveAckReq{T: "live_ack", ID: lv.ID, Seq: lv.Seq})
	}
	ui.Column(c.Key("live")).Absolute().Left(0).Top(0).Right(0).Bottom(0).ZIndex(2000).Background(t.Bg).
		Role(ui.RoleDialog).Label(a.liveTitle(lv)).Children(func() {
		// The top line: back, whose browser this is and that the partner can't
		// see it, reload.
		ui.Row(c).Padding(t.S2, t.S4).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if a.buttonFor(c, a.L.T("live.back"), host, btnText, t.ControlSM, t.Bg) {
				a.liveInput(protocol.LiveInput{Kind: "nav", Action: "back"})
			}
			ui.Column(c).Grow(1).MinWidth(0).AlignItems(ui.Center).Gap(2).Children(func() {
				ui.Text(c, host).FontSize(t.MD).FontWeight(800).SingleLine()
				ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
					if !lv.Try() {
						a.glyph(c, 14, drawEyeShut(t.InkMuted))
					}
					ui.Text(c, a.liveWhere(lv)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				})
			})
			if a.buttonFor(c, a.L.T("live.reload"), host, btnText, t.ControlSM, t.Bg) {
				a.liveInput(protocol.LiveInput{Kind: "nav", Action: "reload"})
			}
		})
		ui.Row(c).Grow(1).MinHeight(0).Justify(ui.Center).AlignItems(ui.Start).Background(t.SurfaceSunken).Children(func() {
			if a.live.bmp == nil {
				ui.Text(c, a.L.T("live.opening", lv.Site)).FontSize(t.SM).TextColor(t.InkMuted).Margin(t.S6, 0, 0, 0)
				return
			}
			pw, ph := float32(lv.Width), float32(lv.Height)
			page := ui.Image(c.Key("page"), a.live.bmp).Size(pw, ph).Shrink(1).MaxWidth(pw).Focusable().AutoFocus().Cursor(ui.CursorDefault)
			r := page.Bounds()
			frac := func(x, y float32) (float64, float64) {
				if r.W <= 0 || r.H <= 0 {
					return 0, 0
				}
				return float64(x / r.W), float64(y / r.H)
			}
			page.HandleInput(func(ev ui.InputEvent) bool {
				switch ev.Kind {
				case ui.InputPointerDown, ui.InputPointerUp:
					x, y := frac(ev.X, ev.Y)
					typ, btn := "down", "left"
					if ev.Kind == ui.InputPointerUp {
						typ = "up"
					}
					if ev.Button == 1 {
						btn = "right"
					}
					a.liveInput(protocol.LiveInput{Kind: "mouse", Type: typ, X: x, Y: y, Button: btn, Clicks: max(1, ev.Clicks)})
					return true
				case ui.InputPointerMove:
					if ev.Button >= 0 && ev.Pressure > 0 {
						x, y := frac(ev.X, ev.Y)
						a.liveInput(protocol.LiveInput{Kind: "mouse", Type: "move", X: x, Y: y})
					}
					return true
				case ui.InputScroll:
					x, y := frac(ev.X, ev.Y)
					a.liveInput(protocol.LiveInput{Kind: "wheel", X: x, Y: y, DX: float64(ev.DX), DY: float64(ev.DY)})
					return true
				case ui.InputText:
					if ev.Text != "" {
						a.liveInput(protocol.LiveInput{Kind: "text", Text: ev.Text})
					}
					return true
				case ui.InputKeyDown:
					if k, ok := liveKeys[ev.Key]; ok && ev.Mods&(ui.Cmd|ui.Ctrl) == 0 {
						a.liveInput(protocol.LiveInput{Kind: "key", Key: k, Shift: ev.Mods&ui.Shift != 0})
						return true
					}
				}
				return false
			}).TextCaret(ui.Rect{X: 0, Y: 0, W: 1, H: 16})
		})
		ui.Row(c).Padding(t.S3, t.S4).Gap(t.S3).Justify(ui.End).AlignItems(ui.Center).Children(func() {
			if lv.Try() {
				// Try it has nothing to answer: what this is, and Done.
				device := ""
				if lv.Browser != nil {
					device = lv.Browser.Device
				}
				ui.Text(c, a.L.T("live.try.note", device)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45).Grow(1).MinWidth(0)
			} else if a.buttonFor(c, a.L.T("live.notnow"), host, btnSecondary, t.ControlMD, t.Bg) {
				a.CloseLive(false)
			}
			if a.buttonFor(c, a.L.T("live.done"), host, btnPrimary, t.ControlMD, t.Bg) {
				a.CloseLive(true)
			}
		})
	})
}

// drawEyeShut is a closed eye: what can't see while you sign in.
func drawEyeShut(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		m := &ui.Path{}
		m.MoveTo(r.X+2*s, r.Y+6.5*s)
		m.CubeTo(r.X+3.6*s, r.Y+8.5*s, r.X+5.6*s, r.Y+9.5*s, r.X+8*s, r.Y+9.5*s)
		m.CubeTo(r.X+10.4*s, r.Y+9.5*s, r.X+12.4*s, r.Y+8.5*s, r.X+14*s, r.Y+6.5*s)
		for _, l := range [][4]float32{{4.2, 8.9, 3, 10.6}, {8, 9.6, 8, 11.6}, {11.8, 8.9, 13, 10.6}} {
			m.MoveTo(r.X+l[0]*s, r.Y+l[1]*s)
			m.LineTo(r.X+l[2]*s, r.Y+l[3]*s)
		}
		m.Cap(ui.RoundCap)
		p.StrokePath(m, 1.7*s, col)
	}
}
