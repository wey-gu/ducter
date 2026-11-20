package views

// D410: an app's own window on the Mac (D405 opened it as a bare page; its
// change line and 改回去 were a v1 gap). Native UI around the app: the head
// (its tile, its name, 改回去 while there is a change to undo, its 「⋯」),
// the partner's one line the first time it opens with something already
// filled in, 改好了 when a change lands while it is open, the app itself in
// an untrusted web view on its own scheme (appwindow.go serves it, as
// before), and the foot: 让{name}改这个小应用… and who keeps it current or
// that it has no internet, when it changed. The web view is the system's
// own view under a hole in this one, so nothing the app draws can reach
// the head or the foot.

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// AppWinHeadH is the app window's head, the title region (traffic lights in it).
const AppWinHeadH = 56

// AppWin is one app open in its own window.
type AppWin struct {
	ID string
	// Web is the app's page (main.go); nil in tests, where a plain ground stands in.
	Web ui.NativeWebView
	// Reload runs the page again (a change landed); nil in tests.
	Reload func()
	// Invalidate draws the window again; nil in tests.
	Invalidate func()
	// first is the partner's note shown on the first open (what it filled in).
	first     string
	firstShut bool
	// version is the version the page runs; changed the note of a change that landed.
	version  int
	changed  string
	landed   bool
	said     string
	sent     bool
	focusAsk bool
	gone     bool
}

// NewAppWin is the state of a window opening on app id now: its first-open
// line when it was never opened before and the partner said what it filled in.
func (a *App) NewAppWin(id string) *AppWin {
	w := &AppWin{ID: id}
	if m := a.appByID(id); m != nil {
		if m.Opened == "" && strings.TrimSpace(m.Note) != "" {
			w.first = m.Note
		}
		w.version = m.Version
	}
	if a.wantAsk == id {
		w.focusAsk, a.wantAsk = true, ""
	}
	if a.appWins == nil {
		a.appWins = map[string]*AppWin{}
	}
	a.appWins[id] = w
	return w
}

// CloseAppWin forgets a window that closed.
func (a *App) CloseAppWin(id string) { delete(a.appWins, id) }

// AppWins are the windows open now (main.go redraws them after a frame).
func (a *App) AppWins() []*AppWin {
	out := make([]*AppWin, 0, len(a.appWins))
	for _, w := range a.appWins {
		out = append(out, w)
	}
	return out
}

// AppWinView is the app window's view.
func (a *App) AppWinView(w *AppWin) func(c *ui.Context) {
	return func(c *ui.Context) {
		if a.uiTheme != nil {
			c.SetTheme(a.uiTheme)
		} else {
			c.SetTheme(a.T.UITheme(c.Theme()))
		}
		t := a.T
		m := a.appByID(w.ID)
		if m == nil && len(a.S.Apps) > 0 {
			w.gone = true
		}
		// A change landed while open: the page runs again as it is now.
		if m != nil && w.version != 0 && m.Version != w.version {
			w.version, w.changed, w.landed, w.first = m.Version, m.Note, true, ""
			if w.Reload != nil {
				w.Reload()
			}
		} else if m != nil && w.version == 0 {
			w.version = m.Version
		}
		name := ""
		if m != nil {
			name = m.Name
		}
		ui.Column(c).Fill().Background(t.Bg).TextColor(t.Ink).Font(t.Body).Children(func() {
			a.appWinHead(c, w, m, name)
			if w.first != "" && !w.firstShut {
				a.appWinFirst(c, w)
			}
			if w.landed {
				ui.Row(c.Key("changed")).Margin(0, t.S4, t.S2, t.S4).Padding(t.S2, t.S3).Gap(t.S2).Radius(t.RadiusSM).
					Background(t.Done.Surface).AlignItems(ui.Baseline).Role(ui.RoleStatus).Children(func() {
					uiText(c, a.L.T("app.changed")).FontSize(t.SM).FontWeight(800).TextColor(t.Done.Ink).Shrink(0)
					if w.changed != "" {
						uiText(c, autospace(w.changed)).FontSize(t.SM).TextColor(t.Done.Ink).Grow(1).Shrink(1).MinWidth(0)
					}
				})
			}
			if m != nil && !w.gone && a.appStripShown(m) {
				a.appWinStrip(c, m)
			}
			stage := ui.Column(c.Key("stage")).Grow(1).MinHeight(0).Margin(0, t.S4, 0, t.S4).Radius(t.RadiusMD).Clip().
				Background(t.Bg).Border(1, t.Line)
			stage.Children(func() {
				switch {
				case w.gone:
					ui.Column(c).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
						uiText(c, keepWords(autospace(a.L.T("app.gone")))).FontSize(t.MD).TextColor(t.InkMuted)
					})
				case w.Web != nil:
					ui.WebView(c, w.Web).Grow(1).Label(name)
				default:
					ui.Column(c.Key("page")).Grow(1).Background(t.Bg).AccessHidden(true)
				}
			})
			a.appWinFoot(c, w, m, name)
		})
	}
}

// appWinHead is the head: the traffic lights' room, the tile and the name,
// 改回去 while there is a change to undo, 「⋯」.
func (a *App) appWinHead(c *ui.Context, w *AppWin, m *protocol.AppMeta, name string) {
	t := a.T
	ui.Row(c.Key("head")).Height(AppWinHeadH).Shrink(0).Padding(0, t.S3, 0, 84).Gap(t.S3).AlignItems(ui.Center).DragWindow().Children(func() {
		a.appClay(c, "tile", 30, m, w.gone)
		uiText(c.Key("name"), autospace(name)).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0).Role(ui.RoleHeading)
		ui.Spacer(c)
		if m == nil {
			return
		}
		if m.Back && a.buttonFor(c, a.L.T("app.back"), name, btnText, t.ControlSM, t.Bg) {
			a.send(protocol.AppIDReq{T: "app_back", ID: m.ID})
		}
		a.appMore(c, m, true)
	})
}

// appWinFirst is the partner's one line the first time the app opens with
// something already in it: a small face, 「{name}先填好了」 and its words.
func (a *App) appWinFirst(c *ui.Context, w *AppWin) {
	t := a.T
	ui.Row(c.Key("first")).Margin(0, t.S4, t.S3, t.S4).Padding(t.S2, t.S2, t.S2, t.S3).Gap(t.S3).Radius(t.RadiusMD).
		Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).AlignItems(ui.Center).Role(ui.RoleStatus).Children(func() {
		ui.Box(c.Key("face")).Shrink(0).AccessHidden(true).Children(func() { a.partnerFace(c, "appwin", a.presence(c), 32) })
		ui.Column(c).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c, keepWords(autospace(a.L.T("app.first", a.appsPartner())))).FontSize(t.SM).FontWeight(800).TextColor(t.Ink)
			uiText(c, autospace(w.first)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.45))
		})
		x := ui.Box(c.Key("x")).Size(28, 28).Radius(t.RadiusXS).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("nav.back")).Focusable().Shrink(0)
		if x.Hovered() {
			x.Background(t.SurfaceSunken)
		}
		x.Draw(func(p *ui.Painter, r ui.Rect) {
			cx, cy, d := r.X+r.W/2, r.Y+r.H/2, float32(4.5)
			var m ui.Path
			m.MoveTo(cx-d, cy-d).LineTo(cx+d, cy+d).MoveTo(cx+d, cy-d).LineTo(cx-d, cy+d).Cap(ui.RoundCap)
			p.StrokePath(&m, 1.6, t.InkMuted)
		})
		if x.Clicked() {
			w.firstShut = true
		}
	})
}

// appWinFoot is the line to ask the partner to change it, and what the app
// is under it: who keeps it current or that it has no internet, when it changed.
func (a *App) appWinFoot(c *ui.Context, w *AppWin, m *protocol.AppMeta, name string) {
	t := a.T
	partner := a.appsPartner()
	ui.Column(c.Key("foot")).Shrink(0).Gap(t.S2).Padding(t.S3, t.S4, t.S3, t.S4).Children(func() {
		if m == nil {
			return
		}
		ui.Row(c.Key("ask")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			in := ui.TextInput(c.Key("ask-in"), &w.said).Placeholder(a.L.T("app.ask.ph", partner)).Label(a.L.T("app.ask.ph", partner)).
				Grow(1).MinWidth(0).Height(t.ControlMD).Padding(0, t.S4).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.Line).FontSize(t.MD)
			if w.focusAsk {
				in.Focus()
				w.focusAsk = false
			}
			if in.Changed() {
				w.sent = false
			}
			send := a.buttonFor(c, a.L.T("app.ask.send"), name, btnPrimary, t.ControlMD, t.Bg)
			if (send || in.Submitted()) && strings.TrimSpace(w.said) != "" {
				a.appWinSend(w, m.ID)
			}
		})
		ui.Row(c.Key("meta")).Gap(t.S4).Padding(0, t.S1).Wrap().Children(func() {
			if w.sent {
				uiText(c.Key("sent"), keepWords(autospace(a.L.T("app.ask.sent", partner)))).FontSize(t.XS).TextColor(t.InkMuted)
				return
			}
			// D422: a plain app says who sees it and when it changed; any
			// other state is said in the strip over the app, or here.
			if s := m.StateOf(); s == "plain" || a.appStripShown(m) {
				uiText(c.Key("private"), keepWords(autospace(a.L.T("app.private")))).FontSize(t.XS).TextColor(t.InkMuted)
				if when := a.agoLong(m.Updated); s == "plain" && when != "" {
					uiText(c.Key("when"), keepWords(autospace(a.L.T("app.updated", when)))).FontSize(t.XS).TextColor(t.InkMuted)
				}
				return
			}
			a.appStateLine(c, "state", m)
		})
	})
}

// appStripShown: the state asks for something (a fix, the new look, a
// retry, resume) or it is being changed now, so it is said over the app.
func (a *App) appStripShown(m *protocol.AppMeta) bool {
	label, _ := a.appStateAction(m)
	return label != "" || m.StateOf() == "changing"
}

// appWinStrip is the state over the app, with its one button (D422).
func (a *App) appWinStrip(c *ui.Context, m *protocol.AppMeta) {
	t := a.T
	ui.Row(c.Key("strip")).Margin(0, t.S4, t.S2, t.S4).Padding(t.S2, t.S2, t.S2, t.S3).Gap(t.S3).Radius(t.RadiusMD).
		Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).AlignItems(ui.Center).Role(ui.RoleStatus).Children(func() {
		ui.Column(c).Grow(1).Shrink(1).MinWidth(0).Children(func() { a.appStateLine(c, "state", m) })
		if label, run := a.appStateAction(m); label != "" {
			if a.buttonFor(c, label, m.Name, btnSecondary, t.ControlSM, t.Surface) {
				run()
			}
		}
	})
}

// appWinSend sends the words as the person's own, about this app.
func (a *App) appWinSend(w *AppWin, id string) {
	text := strings.TrimSpace(w.said)
	a.nextClient++
	a.send(protocol.Send{T: "send", Text: text, ClientID: fmt.Sprintf("c%d-%dapp", a.Now().UnixMilli(), a.nextClient), App: id})
	w.said, w.sent = "", true
}
