package views

import (
	"bytes"
	"image"
	_ "image/jpeg" // live view frames
	"net/url"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
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
	sentAt string    // the decision whose live_open went out
	at     time.Time // when it went out: no page by liveStuckAfter says so
	// D190: the window out of sight (no frames asked for), and the address
	// line being typed in (the user's turn).
	paused  bool
	editing bool
	addr    string
}

// liveStuckAfter is how long the view waits for its first page before it
// says, honestly, that the browser didn't answer, with 再试一次 (the server
// gives up on its own steps well before: a launch 20 s, each step 15 s).
const liveStuckAfter = 40 * time.Second

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
	if d.Where != nil {
		return a.whereAskQuestion(d.Where)
	}
	if d.Closing != nil {
		return a.closingQuestion(d.Closing)
	}
	if d.MemPlugin != nil {
		return a.memCardQuestion(d.MemPlugin)
	}
	return d.Question
}

// OpenLive opens the live view for a sign-in card, sized to this window.
func (a *App) OpenLive(decisionID, site string) {
	a.S.OpenLive(decisionID, site)
	a.live = liveState{sentAt: decisionID, at: a.Now()}
	w, h := a.liveSize()
	a.send(protocol.LiveOpenReq{T: "live_open", DecisionID: decisionID, Width: w, Height: h, Scale: 2})
}

// OpenTry is 试一下 / Try it on the 上网 block (D154): the same live view
// on a harmless page, with no card behind it, so the user sees Ducter's
// own browser working with their own eyes.
func (a *App) OpenTry() { a.OpenTryOn("") }

// OpenTryOn is Try it on one computer's browser ("" or "local": the home's).
func (a *App) OpenTryOn(device string) {
	a.S.OpenLive(protocol.TryLive, "example.com")
	a.S.Live.Device = device
	a.live = liveState{sentAt: protocol.TryLive, at: a.Now()}
	w, h := a.liveSize()
	a.send(protocol.LiveOpenReq{T: "live_open", DecisionID: protocol.TryLive, Width: w, Height: h, Scale: 2, Try: true, Device: device})
}

// OpenWatch is 看它上网 / Watch it browse (D190): the tab a task is working
// in, live, in its turn; 换我来 / My turn makes it the user's.
func (a *App) OpenWatch(taskID string) {
	a.S.OpenWatch(taskID)
	a.live = liveState{sentAt: protocol.WatchLive, at: a.Now()}
	w, h := a.liveSize()
	a.send(protocol.LiveOpenReq{T: "live_open", DecisionID: protocol.WatchLive, TaskID: taskID, Width: w, Height: h, Scale: 2})
}

// LiveTurn is 换我来 / My turn (mine) or 还给它 / Hand it back (D190).
func (a *App) LiveTurn(mine bool) {
	if lv := a.S.Live; lv != nil && lv.ID != "" {
		a.send(protocol.LiveTurnReq{T: "live_turn", ID: lv.ID, Mine: mine})
	}
}

// liveGo opens a typed web address in the user's turn (http or https only;
// the home checks again).
func (a *App) liveGo(raw string) bool {
	s := strings.TrimSpace(raw)
	if s == "" {
		return false
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		a.liveNote = a.L.T("live.badurl")
		return false
	}
	a.liveInput(protocol.LiveInput{Kind: "go", URL: u.String()})
	return true
}

// doingWords is what the task is doing in its tab, in a few calm words (D190).
func (a *App) doingWords(d *protocol.LiveDoing) string {
	switch d.Kind {
	case "open":
		if d.Host != "" {
			return a.L.T("live.doing.open", d.Host)
		}
		return a.L.T("live.doing.read")
	case "click", "type":
		if d.Label != "" {
			return a.L.T("live.doing."+d.Kind, d.Label)
		}
		return a.L.T("live.doing." + d.Kind + ".0")
	case "press":
		return a.L.T("live.doing.press", d.Key)
	}
	return a.L.T("live.doing." + d.Kind)
}

// liveDoingFor is how long a step stays on the line before it goes quiet.
const liveDoingFor = 6 * time.Second

// liveTitle names the view for assistive tech: the sign-in, or Try it.
func (a *App) liveTitle(lv *store.LiveView) string {
	if lv.Try() {
		return a.L.T("web.try")
	}
	if lv.Watch() {
		return a.L.T("live.watch.title")
	}
	return a.L.T("signin.title", lv.Site)
}

// liveDevice names the computer whose browser this is: what the server said
// when it opened, else (still opening) the home's, where Try it and a
// sign-in's browser run. Never an empty name in a sentence.
func (a *App) liveDevice(lv *store.LiveView) string {
	if lv.Browser != nil && lv.Browser.Device != "" {
		return lv.Browser.Device
	}
	if h := a.homeDevice(); h != nil && h.Name != "" {
		return h.Name
	}
	return a.L.T("live.where")
}

// retryLive sends the same live_open again (再试一次 after it got stuck).
func (a *App) retryLive(lv *store.LiveView) {
	if lv.Try() {
		a.OpenTryOn(lv.Device)
		return
	}
	if lv.Watch() {
		a.OpenWatch(lv.TaskID)
		return
	}
	a.OpenLive(lv.DecisionID, lv.Site)
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
		return a.L.T("live.try.where", a.liveDevice(lv), name)
	}
	if lv.Watch() {
		if lv.Task != nil && lv.Task.Title != "" {
			return redact.Text(lv.Task.Title)
		}
		return a.L.T("live.where")
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
	if host == "" {
		host = a.L.T("live.where")
	}
	mine := lv.Mine()
	watch := lv.Watch()
	// D190: out of sight (hidden, minimized), no frames; back, they come again.
	if hidden := c.WindowHidden(); lv.ID != "" && hidden != a.live.paused {
		a.live.paused = hidden
		a.send(protocol.LivePauseReq{T: "live_pause", ID: lv.ID, Paused: hidden})
	}
	if !mine {
		a.live.editing = false
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
	var doing *protocol.LiveDoing
	if watch && !mine && lv.Turn != "you" && lv.Doing != nil && a.Now().Sub(lv.DoingAt) < liveDoingFor {
		doing = lv.Doing
		c.After(liveDoingFor - a.Now().Sub(lv.DoingAt)) // the line goes quiet on its own
	}
	ui.Column(c.Key("live")).Absolute().Left(0).Top(0).Right(0).Bottom(0).ZIndex(2000).Background(t.Bg).
		Role(ui.RoleDialog).Label(a.liveTitle(lv)).Children(func() {
		// The top line is the window's own bar (chrome: the traffic lights'
		// room kept, it drags the window): back and forward in the user's
		// turn, the page's address (typed into in the user's turn), whose
		// tab or browser this is, then reload, or Close while watching.
		a.chrome(c, "live", func() {
			if mine {
				if a.buttonFor(c, a.L.T("live.back"), host, btnText, t.ControlSM, t.Chrome) {
					a.liveInput(protocol.LiveInput{Kind: "nav", Action: "back"})
				}
				if watch && a.buttonFor(c, a.L.T("live.forward"), host, btnText, t.ControlSM, t.Chrome) {
					a.liveInput(protocol.LiveInput{Kind: "nav", Action: "forward"})
				}
			}
			ui.Column(c).Grow(1).MinWidth(0).AlignItems(ui.Center).Gap(2).Children(func() {
				if mine && a.live.editing {
					in := ui.TextInput(c.Key("input:live-addr"), &a.live.addr).Placeholder(a.L.T("live.address.hint")).Label(a.L.T("live.address")).
						FontSize(t.SM).Padding(t.S1, t.S2).Radius(t.RadiusSM).Background(t.Bg).Border(1, t.Line).MinWidth(320).MaxWidth(560).
						OnSubmit(func() {
							if a.liveGo(a.live.addr) {
								a.live.editing = false
							}
						})
					in.Focus()
				} else if mine {
					if a.buttonFor(c, host, a.L.T("live.address"), btnText, t.ControlSM, t.Chrome) {
						a.live.editing, a.live.addr = true, redact.Text(lv.URL)
					}
				} else {
					ui.Text(c, host).FontSize(t.MD).FontWeight(800).SingleLine()
				}
				ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
					if !lv.Try() && !watch {
						a.glyph(c, 14, drawEyeShut(t.InkMuted))
					}
					ui.Text(c, a.liveWhere(lv)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				})
			})
		}, func() {
			if mine {
				if a.buttonFor(c, a.L.T("live.reload"), host, btnText, t.ControlSM, t.Chrome) {
					a.liveInput(protocol.LiveInput{Kind: "nav", Action: "reload"})
				}
			} else if a.buttonFor(c, a.L.T("live.close"), host, btnText, t.ControlSM, t.Chrome) {
				a.CloseLive(false)
			}
		})
		// D190: the user's turn of a watch, said plainly, once, above the page.
		if watch && mine {
			w := t.State("blocked")
			ui.Row(c.Key("live-band")).Gap(6).Justify(ui.Center).AlignItems(ui.Center).Padding(t.S2, t.S4).Background(w.Surface).Role(ui.RoleStatus).Children(func() {
				a.glyph(c, 14, drawEyeShut(w.Ink))
				ui.Text(c, a.L.T("live.yourturn")).FontSize(t.SM).TextColor(w.Ink)
			})
		}
		align := ui.Start
		if watch && !mine {
			align = ui.Center // watching: the page sits in the middle, like a picture
		}
		ui.Row(c).Grow(1).MinHeight(0).Justify(ui.Center).AlignItems(align).Background(t.SurfaceSunken).Children(func() {
			if a.live.bmp == nil {
				if watch && lv.Open {
					ui.Text(c, a.L.T("live.nopage")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5).TextAlign(ui.Center).MaxWidth(360).Margin(t.S6, t.S4, 0, t.S4)
					return
				}
				if !a.live.at.IsZero() && a.Now().Sub(a.live.at) >= liveStuckAfter {
					// No page: say so, and offer the same open again.
					ui.Column(c.Key("live-stuck")).Gap(t.S3).AlignItems(ui.Center).MaxWidth(420).Margin(t.S6, t.S4, 0, t.S4).Children(func() {
						ui.Text(c, a.L.T("live.stuck", a.liveDevice(lv))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).TextAlign(ui.Center)
						if a.buttonFor(c, a.L.T("live.retry"), lv.Site, btnSecondary, t.ControlSM, t.SurfaceSunken) {
							a.retryLive(lv)
						}
					})
					return
				}
				c.After(time.Second) // look again: the stuck line comes on its own
				what := lv.Site
				if what == "" && lv.Task != nil {
					what = lv.Task.Title
				}
				ui.Text(c, a.L.T("live.opening", what)).FontSize(t.SM).TextColor(t.InkMuted).Margin(t.S6, 0, 0, 0)
				return
			}
			pw, ph := float32(lv.Width), float32(lv.Height)
			page := ui.Image(c.Key("page"), a.live.bmp).Size(pw, ph).Shrink(1).MaxWidth(pw).Focusable().AutoFocus().Cursor(ui.CursorDefault)
			if !mine {
				return // watching: nothing the user does goes in
			}
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
			switch {
			case watch:
				// What the task is doing, calm; or whose browser, where.
				line, col := a.L.T("live.where")+" · "+a.L.T("live.on", a.liveDevice(lv)), t.InkMuted
				if doing != nil {
					line, col = a.doingWords(doing), t.InkSoft
				} else if lv.Turn == "you" && !lv.Here {
					line = a.L.T("live.elsewhere")
				}
				if mine {
					line = ""
				}
				ui.Row(c.Key("live-doing")).Gap(t.S2).AlignItems(ui.Center).Grow(1).MinWidth(0).Role(ui.RoleStatus).Children(func() {
					if doing != nil {
						ui.Box(c.Key("live-pulse")).Size(8, 8).Shrink(0).Radius(4).Background(t.State("working").Dot)
					}
					if line != "" {
						ui.Text(c, line).FontSize(t.SM).TextColor(col).SingleLine()
					}
				})
				if mine {
					if a.buttonFor(c, a.L.T("live.handback"), host, btnPrimary, t.ControlMD, t.Bg) {
						a.LiveTurn(false)
					}
				} else if a.buttonFor(c, a.L.T("live.myturn"), host, btnPrimary, t.ControlMD, t.Bg) {
					a.LiveTurn(true)
				}
			case lv.Try():
				// Try it has nothing to answer: what this is, and Done.
				ui.Text(c, a.L.T("live.try.note", a.liveDevice(lv))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45).Grow(1).MinWidth(0)
				if a.buttonFor(c, a.L.T("live.done"), host, btnPrimary, t.ControlMD, t.Bg) {
					a.CloseLive(true)
				}
			default:
				if a.buttonFor(c, a.L.T("live.notnow"), host, btnSecondary, t.ControlMD, t.Bg) {
					a.CloseLive(false)
				}
				if a.buttonFor(c, a.L.T("live.done"), host, btnPrimary, t.ControlMD, t.Bg) {
					a.CloseLive(true)
				}
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
