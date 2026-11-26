package views

// D410: an app's own window on the Mac (D405 opened it as a bare page; its
// change line and 改回去 were a v1 gap). Native UI around the app: the head
// (its tile, its name, 修改, its 「⋯」), the partner's one line the first time
// it opens with something already filled in, the app itself in an untrusted
// web view on its own scheme (appwindow.go serves it, as before), and the
// foot. D603: the app is the point, so the foot is empty at rest: 修改 in the
// head, ⌘L, / or 「⋯」 bring the composer up from the bottom edge; Esc, or
// leaving it empty, puts it away; a change asked is said there while it is
// made, then 改好了 with 改回去, and that goes by itself. Who sees it and when
// it changed are in 「⋯」 and the name's tooltip, never a footer. The web view
// is the system's own view under a hole in this one, so nothing the app
// draws can reach the head or the foot.

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// AppWinHeadH is the app window's head, the title region (traffic lights in it).
const AppWinHeadH = 56

// How long the first-open line and a change's line stay before they go by
// themselves (a pointer resting on the change's line holds it), and how long
// an ask that ended with no new version waits for a late one (D603).
const (
	appFirstFor = 8 * time.Second
	appLineFor  = 8 * time.Second
	appQuietFor = 1500 * time.Millisecond
)

// AppWin is one app open in its own window.
type AppWin struct {
	ID string
	// Web is the app's page (main.go); nil in tests, where a plain ground stands in.
	Web ui.NativeWebView
	// Reload runs the page again (a change landed); nil in tests.
	Reload func()
	// Invalidate draws the window again; nil in tests.
	Invalidate func()
	// Still is a picture of the page where there is no web view (the shots).
	Still *ui.Bitmap
	// first is the partner's note shown on the first open (what it filled in).
	first     string
	firstShut bool
	// version is the version the page runs; changed the note of a change that landed.
	version int
	changed string
	landed  bool
	said    string
	sent    bool
	// busy: it was being changed (D422) at the last frame; when that ends,
	// the sent line gives way to what is true now (D431).
	busy     bool
	focusAsk bool
	gone     bool
	// undoing: 改回去 was asked here; undone: the version that landed is that Undo (D562: it says
	// 改回去了, never 改好了).
	undoing, undone bool
	// D603: compose is the composer up; hadFocus, it took the keys once (so
	// leaving it empty puts it away). firstUntil, doneUntil: when the
	// first-open line and the change's line go by themselves. asked: a change
	// asked here is under way; quiet: it ended with no new version, and
	// replied: the partner answered it in words, in the conversation.
	compose, hadFocus     bool
	firstUntil, doneUntil time.Time
	asked, replied        bool
	quiet                 time.Time
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
		w.compose, w.focusAsk, a.wantAsk = true, true, ""
	}
	if a.appWins == nil {
		a.appWins = map[string]*AppWin{}
	}
	a.appWins[id] = w
	return w
}

// CloseAppWin forgets a window that closed.
func (a *App) CloseAppWin(id string) { delete(a.appWins, id) }

// ComposeApp brings the composer up in app id's open window, with the keys
// (D603: the menu bar's 修改 ⌘L, and the app's own / or ⌘L through its bridge).
func (a *App) ComposeApp(id string) {
	w := a.appWins[id]
	if w == nil {
		return
	}
	w.compose, w.focusAsk, w.hadFocus = true, true, false
	if w.Invalidate != nil {
		w.Invalidate()
	}
}

// AppTouched is the person's first touch inside the app's page: the
// first-open line has been seen (D603).
func (a *App) AppTouched(id string) {
	if w := a.appWins[id]; w != nil && w.first != "" && !w.firstShut {
		w.firstShut = true
		if w.Invalidate != nil {
			w.Invalidate()
		}
	}
}

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
		now := c.Now()
		a.appWinTrack(c, w, m, now)
		name := ""
		if m != nil {
			name = m.Name
		}
		// D603: ⌘L or / brings the composer up (the menu bar's 修改 too); Esc puts it away.
		if m != nil && !w.gone && !w.compose && (c.Shortcut(ui.Cmd, ui.KeyL) || c.Shortcut(0, ui.KeySlash)) {
			w.compose, w.focusAsk, w.hadFocus = true, true, false
		} else if w.compose && c.Shortcut(0, ui.KeyEscape) {
			w.compose = false
		}
		ui.Column(c).Fill().Background(t.Bg).TextColor(t.Ink).Font(t.Body).Children(func() {
			a.appWinHead(c, w, m, name)
			if w.first != "" && !w.firstShut {
				a.appWinFirst(c, w)
			}
			if m != nil && !w.gone && a.appStripShown(m) {
				a.appWinStrip(c, m)
			}
			stage := ui.Column(c.Key("stage")).Grow(1).MinHeight(0).Margin(0, t.S4, t.S4, t.S4).Radius(t.RadiusMD).Clip().
				Background(t.Bg).Border(1, t.Line)
			stage.Children(func() {
				switch {
				case w.gone:
					ui.Column(c).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
						uiText(c, keepWords(autospace(a.L.T("app.gone")))).FontSize(t.MD).TextColor(t.InkMuted)
					})
				case w.Web != nil:
					ui.WebView(c, w.Web).Grow(1).Label(name)
				case w.Still != nil:
					ui.Column(c.Key("page")).Grow(1).MinHeight(0).Clip().AccessHidden(true).Children(func() {
						iw, ih := w.Still.Size()
						ui.Image(c, w.Still).Size(float32(iw)/2, float32(ih)/2).Shrink(0)
					})
				default:
					ui.Column(c.Key("page")).Grow(1).Background(t.Bg).AccessHidden(true)
				}
			})
			if m != nil && !w.gone {
				a.appWinFoot(c, w, m, name, now)
			}
		})
	}
}

// appWinTrack follows what changed since the last frame: a version that
// landed (the page runs again), a change under way ending with or without
// one, and the first-open line's time.
func (a *App) appWinTrack(c *ui.Context, w *AppWin, m *protocol.AppMeta, now time.Time) {
	if m != nil && w.version != 0 && m.Version != w.version {
		w.version, w.changed, w.landed, w.first, w.sent = m.Version, m.Note, true, "", false
		w.undone, w.undoing = w.undoing, false
		w.asked, w.replied, w.quiet = false, false, time.Time{}
		w.doneUntil = now.Add(appLineFor)
		if w.undone {
			w.changed = ""
		}
		if w.Reload != nil {
			w.Reload()
		}
	} else if m != nil && w.version == 0 {
		w.version = m.Version
	}
	if m != nil {
		busy := m.StateOf() == "changing"
		if w.busy && !busy {
			w.sent = false
			// It ended: a new version may still be on its way; with none, the partner answered in words.
			if w.asked {
				w.asked, w.quiet = false, now
			}
		}
		if busy {
			w.replied, w.quiet = false, time.Time{}
		}
		w.busy = busy
	}
	if !w.quiet.IsZero() {
		if left := w.quiet.Add(appQuietFor).Sub(now); left > 0 {
			c.After(left)
		} else {
			w.quiet, w.replied, w.landed, w.doneUntil = time.Time{}, true, false, now.Add(appLineFor)
		}
	}
	// The first-open line goes after a while by itself, or at the first touch in the app.
	if w.first != "" && !w.firstShut {
		if w.firstUntil.IsZero() {
			w.firstUntil = now.Add(appFirstFor)
		}
		if left := w.firstUntil.Sub(now); left > 0 {
			c.After(left)
		} else {
			w.firstShut = true
		}
	}
}

// appWinHead is the head: the traffic lights' room, the tile and the name
// (who sees it and when it changed in its tooltip), 修改, 「⋯」.
func (a *App) appWinHead(c *ui.Context, w *AppWin, m *protocol.AppMeta, name string) {
	t := a.T
	ui.Row(c.Key("head")).Height(AppWinHeadH).Shrink(0).Padding(0, t.S3, 0, 84).Gap(t.S2).AlignItems(ui.Center).DragWindow().Children(func() {
		a.appClay(c, "tile", 30, m, w.gone)
		ui.Box(c).Size(t.S1, 1).Shrink(0)
		title := uiText(c.Key("name"), autospace(name)).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0).Role(ui.RoleHeading)
		if m != nil {
			title.Tooltip(a.appAbout(m))
		}
		ui.Spacer(c)
		if m == nil {
			return
		}
		// D603: 修改 brings the composer up, and puts it away again. D562: 改回去 is said beside
		// the change it undoes and in 「⋯」, so the head keeps the whole name.
		if !w.gone && a.buttonFor(c, a.L.T("app.edit"), name, btnText, t.ControlSM, t.Bg) {
			w.compose = !w.compose
			w.focusAsk, w.hadFocus = w.compose, false
		}
		a.appMore(c, m, true)
	})
}

// appAbout is who sees the app and when it last changed (or who keeps it
// current), each its own line: the name's tooltip.
func (a *App) appAbout(m *protocol.AppMeta) string {
	return a.L.T("app.private") + "\n" + a.appWhen(m)
}

// appWhen is when it last changed, or what the task keeping it current is
// doing (D422's quiet states), for 「⋯」 and the name's tooltip.
func (a *App) appWhen(m *protocol.AppMeta) string {
	switch m.StateOf() {
	case "kept_next", "kept_running":
		words, _ := a.appStateWords(m)
		return words
	}
	at := m.Updated
	if m.Live != nil && m.Live.Kept != nil && m.Live.Kept.Last != "" {
		at = m.Live.Kept.Last
	}
	if when := a.agoLong(at); when != "" {
		return a.L.T("app.updated", when)
	}
	return ""
}

// appWinFirst is the partner's one line the first time the app opens with
// something already in it (D603: one slim line, the face small, going by
// itself): 「{name}先填好了」 and its words.
func (a *App) appWinFirst(c *ui.Context, w *AppWin) {
	t := a.T
	row := ui.Row(c.Key("first")).Margin(0, t.S4, t.S2, t.S4).Padding(t.S1, t.S1, t.S1, t.S2).Gap(t.S2).Radius(t.RadiusMD).
		Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).AlignItems(ui.Center).Role(ui.RoleStatus)
	row.Transition(a.appLineMotion(c))
	row.Children(func() {
		ui.Box(c.Key("face")).Shrink(0).AccessHidden(true).Children(func() { a.partnerFace(c, "appwin", a.presence(c), 22) })
		ui.Row(c).Gap(t.S2).AlignItems(ui.Baseline).Grow(1).Shrink(1).MinWidth(0).Wrap().Children(func() {
			uiText(c, keepWords(autospace(a.L.T("app.first", a.appsPartner())))).FontSize(t.SM).FontWeight(800).TextColor(t.Ink).Shrink(0)
			uiText(c, autospace(w.first)).FontSize(t.SM).TextColor(t.InkSoft).Shrink(1).MinWidth(0).MaxLines(2)
		})
		if a.iconButton(c, a.L.T("app.first.shut"), t.ChipLG, btnText, drawCrossSmall) {
			w.firstShut = true
		}
	})
}

// appLineMotion is how a line over or under the app comes and goes (D290):
// up 6 and in over EnterDur, and a fade on the way out; a fade alone under
// reduced motion.
func (a *App) appLineMotion(c *ui.Context) ui.ElementTransition {
	t := a.T
	if c.Preferences().ReduceMotion {
		return ui.ElementTransition{Duration: 120 * time.Millisecond, Enter: &ui.Motion{Opacity: 0}, Exit: &ui.Motion{Opacity: 0}}
	}
	return ui.ElementTransition{Duration: t.EnterDur, Enter: &ui.Motion{Opacity: 0, Y: t.Nav.Rise}, Exit: &ui.Motion{Opacity: 0}, ExitDuration: 160 * time.Millisecond}
}

// appWinFoot is under the app, and empty at rest (D603). In turn: the
// composer while it is up; the change asked, while it is made; 改好了 with
// 改回去, or that the partner answered in the conversation, until they go.
func (a *App) appWinFoot(c *ui.Context, w *AppWin, m *protocol.AppMeta, name string, now time.Time) {
	t := a.T
	partner := a.appsPartner()
	switch {
	case w.compose:
		// D519, D562: asking from inside the app is the conversation's composer (ui.md "The composer").
		foot := ui.Row(c.Key("ask")).Shrink(0).Padding(0, t.S4, t.S4, t.S4)
		motion := a.appLineMotion(c)
		if !c.Preferences().ReduceMotion {
			// It comes up from the bottom edge: the room opens as it rises, so the app's page moves once.
			motion.Enter = &ui.Motion{Opacity: 0, Y: t.Nav.Rise, Collapse: true}
			motion.ExitDuration = -1
		}
		foot.Transition(motion)
		foot.Children(func() {
			box := a.composerBox(c, composerOpts{
				key:         "app-ask-" + m.ID,
				draft:       &w.said,
				placeholder: a.L.T("app.ask.ph", partner),
				label:       a.L.T("app.ask.ph", partner),
				lines:       4,
				fontSize:    t.MD,
				sendSize:    t.ControlMD,
				sendLabel:   a.L.T("app.ask.send"),
				focus:       w.focusAsk,
				keys: func(k ui.TextKey) bool {
					if k.Key == ui.KeyEscape {
						w.compose = false
						return true
					}
					return false
				},
				onSend: func(text string) bool {
					if strings.TrimSpace(text) == "" {
						return false
					}
					w.said = text
					a.appWinSend(w, m.ID)
					return true
				},
			})
			// Left empty, it goes away again.
			if box.FocusWithin() {
				w.hadFocus = true
			} else if w.hadFocus && strings.TrimSpace(w.said) == "" {
				w.compose, w.hadFocus = false, false
			}
		})
		w.focusAsk = false
	case w.sent || (w.asked && w.busy):
		a.appWinLine(c, "progress", t.Surface, func() {
			a.appTrack(c)
			uiText(c, keepWords(autospace(a.L.T("app.live.changing", partner)))).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		}, nil)
	case w.landed && now.Before(w.doneUntil):
		a.appWinChanged(c, w, m, name, now)
	case w.replied && now.Before(w.doneUntil):
		row := a.appWinLine(c, "replied", t.Surface, func() {
			uiText(c, keepWords(autospace(a.L.T("app.replied", partner)))).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		}, func() {
			if a.buttonFor(c, a.L.T("app.replied.see"), name, btnSecondary, t.ControlSM, t.Surface) {
				w.replied = false
				a.Route = RouteConversation
				if a.ShowMain != nil {
					a.ShowMain()
				}
			}
		})
		a.appLineHold(c, w, row, now)
	}
}

// appWinLine is one slim line under the app: its words, and its one button.
func (a *App) appWinLine(c *ui.Context, key string, bg ui.Color, words func(), act func()) ui.Element {
	t := a.T
	row := ui.Row(c.Key(key)).Shrink(0).Margin(0, t.S4, t.S4, t.S4).MinHeight(t.ControlSM+t.S2).Padding(t.S1, t.S1, t.S1, t.S3).Gap(t.S3).
		Radius(t.RadiusMD).Background(bg).AlignItems(ui.Center).Role(ui.RoleStatus)
	if bg == t.Surface {
		row.Shadow(0, 2, 0, 0, t.Line)
	}
	row.Transition(a.appLineMotion(c))
	row.Children(func() {
		ui.Row(c.Key("words")).Gap(t.S2).AlignItems(ui.Center).Grow(1).Shrink(1).MinWidth(0).Wrap().Children(words)
		if act != nil {
			act()
		}
	})
	return row
}

// appLineHold keeps a line that goes by itself while the pointer rests on
// it or the keys are in it, and asks for the frame it goes in.
func (a *App) appLineHold(c *ui.Context, w *AppWin, row ui.Element, now time.Time) {
	if (row.Hovered() || row.FocusWithin()) && w.doneUntil.Before(now.Add(2*time.Second)) {
		w.doneUntil = now.Add(2 * time.Second)
	}
	if left := w.doneUntil.Sub(now); left > 0 {
		c.After(left)
	}
}

// appWinChanged is the change that landed while it was open: 改好了 and the
// partner's few words, with 改回去 beside them (D562); an Undo that landed
// says 改回去了. D603: under the app, where it was asked, going by itself.
func (a *App) appWinChanged(c *ui.Context, w *AppWin, m *protocol.AppMeta, name string, now time.Time) {
	t := a.T
	row := a.appWinLine(c, "changed", t.Done.Surface, func() {
		word := a.L.T("app.changed")
		if w.undone {
			word = a.L.T("app.undone")
		}
		uiText(c, word).FontSize(t.SM).FontWeight(800).TextColor(t.Done.Ink).Shrink(0)
		if w.changed != "" {
			uiText(c, autospace(w.changed)).FontSize(t.SM).TextColor(t.Done.Ink).Grow(1).Shrink(1).MinWidth(0).MaxLines(2)
		}
	}, func() {
		if m != nil && m.Back && !w.undone && a.buttonFor(c, a.L.T("app.back"), name, btnSecondary, t.ControlSM, t.Done.Surface) {
			w.undoing = true
			a.send(protocol.AppIDReq{T: "app_back", ID: m.ID})
		}
	})
	a.appLineHold(c, w, row, now)
}

// appStripShown: the state asks for something (a fix, the new look, a
// retry, resume), so it is said over the app. D603: a change under way is
// said under it, where it was asked, unless it was asked elsewhere.
func (a *App) appStripShown(m *protocol.AppMeta) bool {
	label, _ := a.appStateAction(m)
	if label != "" {
		return true
	}
	if m.StateOf() == "changing" {
		if w := a.appWins[m.ID]; w != nil && (w.asked || w.sent) {
			return false
		}
		return true
	}
	return false
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

// appWinSend sends the words as the person's own, about this app; the
// composer goes down into the line that says it is being made.
func (a *App) appWinSend(w *AppWin, id string) {
	text := strings.TrimSpace(w.said)
	a.nextClient++
	a.send(protocol.Send{T: "send", Text: text, ClientID: fmt.Sprintf("c%d-%dapp", a.Now().UnixMilli(), a.nextClient), App: id})
	w.said, w.sent, w.asked, w.compose, w.hadFocus = "", true, true, false, false
	w.landed, w.replied, w.quiet = false, false, time.Time{}
}
