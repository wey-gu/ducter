// Package views builds Ducter's three zoom levels in MyGo native UI: the
// conversation (default), On hand, and an opened task. Everything reads
// tokens from theme and copy from i18n.
package views

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Route is the zoom level shown.
type Route int

const (
	RouteConversation Route = iota
	RouteOnHand
	RouteTask
)

// Updater runs a function on the UI thread and draws a frame
// (mygo.Window.Update); nil in tests, where work runs inline.
type Updater interface{ Update(func()) }

type pendingMsg struct {
	clientID, text string
}

// App is the window's state.
type App struct {
	S *store.Store
	T *theme.Tokens
	L *i18n.Strings
	// Send sends a client frame; nil drops it (tests may set it).
	Send func(frame any) error
	// Win schedules work from other goroutines.
	Win Updater
	// Now is the clock, time.Now unless a test sets it.
	Now func() time.Time

	Status    client.Status
	StatusErr string

	Route  Route
	TaskID string

	draft      string
	pending    []pendingMsg
	nextClient int
	list       ui.ListState
	taskDrafts map[string]string
	replyOpen  map[string]bool
	replyDraft map[string]string
	diffs      map[string]*diffPane
	taskLists  map[string]*ui.ListState
	md, mdTask markdown.Options
	uiTheme    *ui.Theme
}

// New makes the app's state.
func New(s *store.Store, t *theme.Tokens, l *i18n.Strings) *App {
	return &App{
		S: s, T: t, L: l,
		Now:        time.Now,
		Status:     client.Connecting,
		taskDrafts: map[string]string{},
		replyOpen:  map[string]bool{},
		replyDraft: map[string]string{},
		diffs:      map[string]*diffPane{},
		taskLists:  map[string]*ui.ListState{},
	}
}

func (a *App) send(frame any) {
	if a.Send == nil {
		return
	}
	if err := a.Send(frame); err != nil {
		a.StatusErr = err.Error()
	}
}

// View is the window's content.
func (a *App) View(c *ui.Context) {
	if a.uiTheme == nil {
		a.uiTheme = a.T.UITheme(c.Theme())
		a.md.Theme = a.markdownTheme(a.T.PartnerSize, 1.65)
		a.mdTask.Theme = a.markdownTheme(14, 1.55)
	}
	c.SetTheme(a.uiTheme)
	ui.Column(c).Fill().Background(a.T.Bg).TextColor(a.T.Ink).Font(a.T.Body).Children(func() {
		switch a.Route {
		case RouteOnHand:
			a.onHand(c)
		case RouteTask:
			a.task(c)
		default:
			a.conversation(c)
		}
	})
}

func (a *App) markdownTheme(size, leading float32) *markdown.Theme {
	th := markdown.DefaultTheme(a.uiTheme)
	th.FontSize = size
	th.LineHeight = leading
	th.Font = a.T.Body
	th.Text = a.T.Ink
	th.Muted = a.T.InkMuted
	th.Link = a.T.NeedsYou.Ink
	th.Strong = a.T.Ink
	th.StrongWeight = 700
	th.Code = a.T.Ink
	th.CodeBackground = a.T.SurfaceSunken
	th.CodeBlockBackground = a.T.SurfaceRaised
	th.CodeBlockBorder = a.T.Line
	th.QuoteBar = a.T.Line
	th.Rule = a.T.Line
	return th
}

// ---------- actions ----------

// SendMessage sends what the composer holds to the partner.
func (a *App) SendMessage(text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	a.nextClient++
	id := fmt.Sprintf("c%d-%d", a.Now().UnixMilli(), a.nextClient)
	a.pending = append(a.pending, pendingMsg{clientID: id, text: text})
	a.markRead()
	a.send(protocol.Send{T: "send", Text: text, ClientID: id})
}

// Decide answers a decision.
func (a *App) Decide(id, option, text string) {
	if d := a.S.Decisions[id]; d != nil {
		d.Pending = option
	}
	a.replyOpen[id] = false
	a.markRead()
	a.send(protocol.Decide{T: "decide", DecisionID: id, Option: option, Text: text})
}

// OpenTask shows a task at full depth, asking for its history.
func (a *App) OpenTask(id string) {
	a.Route, a.TaskID = RouteTask, id
	a.markRead()
	if t := a.S.Task(id); t == nil || !t.HistoryLoaded {
		a.send(protocol.TaskHistoryReq{T: "task_history", TaskID: id, Limit: 500})
	}
	a.refreshDiff(id)
}

// SendToTask talks to a task directly.
func (a *App) SendToTask(id, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	a.send(protocol.TaskSend{T: "task_send", TaskID: id, Text: text})
}

func (a *App) markRead() {
	if a.S.Cursor > a.S.ReadUpTo {
		a.send(protocol.Read{T: "read", UpToSeq: a.S.Cursor})
	}
}

// Applied is called after the store applied a frame: it refreshes what
// follows the stream, as the open task's diff.
func (a *App) Applied(f protocol.ServerFrame) {
	if a.Route != RouteTask || a.TaskID == "" {
		return
	}
	for _, ev := range f.Events {
		if ev.Stream == protocol.TaskStream(a.TaskID) && (ev.Kind == protocol.KindTaskEvent || ev.Kind == protocol.KindCheckpoint || ev.Kind == protocol.KindReport) {
			a.refreshDiff(a.TaskID)
			return
		}
	}
	if f.T == "task_history" && f.TaskID == a.TaskID {
		a.refreshDiff(a.TaskID)
	}
}

// ---------- formatting ----------

func (a *App) stateLabel(att protocol.Attention) string {
	return a.L.T("state." + string(att))
}

func (a *App) duration(d time.Duration) string {
	switch {
	case d < time.Minute:
		return a.L.T("time.now")
	case d < time.Hour:
		return a.L.T("time.min", int(d.Minutes()))
	}
	return a.L.T("time.hour", int(d.Hours()))
}

func (a *App) ago(ts string) string {
	t := store.ParseTime(ts)
	if t.IsZero() {
		return ""
	}
	d := a.Now().Sub(t)
	switch {
	case d < time.Minute:
		return a.L.T("time.now")
	case d < time.Hour:
		return a.L.T("time.ago.min", int(d.Minutes()))
	}
	return a.L.T("time.ago.hour", int(d.Hours()))
}

func clock(ts string) string {
	t := store.ParseTime(ts)
	if t.IsZero() {
		return ""
	}
	return t.Local().Format("15:04")
}

func harnessName(h string) string {
	switch h {
	case "claude-code":
		return "Claude Code"
	case "codex":
		return "Codex"
	case "pi":
		return "pi"
	}
	return h
}

func harnessBadge(h string) string {
	switch h {
	case "claude-code":
		return "cc"
	case "codex":
		return "cx"
	}
	if len(h) >= 2 {
		return h[:2]
	}
	return h
}

func (a *App) bodyLine(t *store.Task) string {
	parts := []string{}
	if h := harnessName(t.Harness()); h != "" {
		parts = append(parts, h)
	}
	if m := t.Model(); m != "" {
		parts = append(parts, m)
	}
	return strings.Join(parts, " · ")
}

func (a *App) placeLine(p protocol.Place) string {
	switch p.Kind {
	case "repo":
		parts := []string{}
		if p.Device != "" {
			parts = append(parts, p.Device)
		}
		switch {
		case p.Branch != "":
			parts = append(parts, p.Branch)
		case p.Worktree != "":
			parts = append(parts, lastPath(p.Worktree))
		default:
			parts = append(parts, lastPath(p.RepoPath))
		}
		return strings.Join(parts, " · ")
	case "folder":
		return p.Device + " · " + lastPath(p.Path)
	case "browser":
		return p.Device + " · " + p.Profile
	}
	return a.L.T("place.none")
}

func lastPath(p string) string {
	p = strings.TrimRight(p, "/")
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}

// defaultIn is how long until a decision's default applies, or false.
func (a *App) defaultIn(d *store.DecisionState) (time.Duration, bool) {
	at := store.ParseTime(d.DefaultAt)
	if at.IsZero() || !d.Reversible {
		return 0, false
	}
	return at.Sub(a.Now()), true
}
