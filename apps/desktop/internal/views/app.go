// Package views builds Ducter's three zoom levels in MyGo native UI: the
// conversation (default), On hand, and an opened task. Everything reads
// tokens from theme and copy from i18n.
package views

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
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
	// RouteDevices is 你的设备，和它们会做的事 / Your devices and what they can do.
	RouteDevices
	// RoutePartner is Settings › 伙伴 / Partner (D150; its own page in D71).
	RoutePartner
	// RouteSettings is 设置 / Settings: one place for everything you can
	// set, a rail of tabs (D150).
	RouteSettings
)

// Updater runs a function on the UI thread and draws a frame
// (mygo.Window.Update); nil in tests, where work runs inline.
type Updater interface{ Update(func()) }

type pendingMsg struct {
	clientID, text string
	// atts (D206): the pictures going with it; sent once they're all up.
	atts []*attach
	sent bool
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
	// Local is what the client knows about this Mac (first-run hints,
	// whether the first result was celebrated); in memory unless set.
	Local *hints.Local

	Status client.Status
	// Media is the app's hands for pictures (D206): the picker, the
	// pasteboard, the home's address; nil hides adding pictures.
	Media MediaHands
	media mediaState
	// devicesAsked: the where line (D157) asked for devices once on its own.
	devicesAsked bool
	// bridgeConfirm: 断开 was tapped once and asks before it runs (D205).
	bridgeConfirm bool
	// bridgeLink: the connect link being pasted on the row (D225); never kept.
	bridgeLink string
	StatusErr  string
	// Failed is set once a connection attempt failed, and cleared by a
	// welcome: until the first welcome it shows the first-run screen.
	Failed bool
	// URL is the server dialed, for the first-run screen.
	URL string
	// RetryNow cuts the reconnect wait short; NextAttempt says when the
	// next one starts. Nil in tests.
	RetryNow    func()
	NextAttempt func() time.Time
	// Pair trades a pairing code for a device token at an address (an
	// http(s) base), saves it, and points the client there. Nil hides the
	// "my Ducter is on another machine" path.
	Pair func(base, code string) error
	// Unauthorized is set when the server refused this device (revoked, or
	// a token from an old pairing): the connect card shows, with a line.
	Unauthorized bool
	conn         connectState
	// UseLocal forgets the connection to another computer and starts the
	// app again on this Mac's own Ducter (set by main).
	UseLocal func()
	// ReadClipboard is the clipboard's text, for a pair link copied before
	// the connect card opened (set by main).
	ReadClipboard func() string
	// MacWorker is "Let this Mac do tasks for <home>" (D155): set by main
	// when the app runs as Ducter.app; nil hides it. ThisComputer is this
	// Mac's name (its host name), how its devices are found on a home.
	MacWorker    MacWorker
	ThisComputer string
	work         workState
	// hereBackend is this Mac's own Ducter after the app switched to one on
	// another computer; askStopHere asks once whether to stop it.
	hereBackend Backend
	askStopHere bool
	// Backend is the Ducter this app runs itself (Ducter.app); nil when
	// the window only connects.
	Backend Backend
	setup   setupState
	// OnResting is told when Ducter is stopped on purpose or woken (the
	// app menu's item follows it).
	OnResting func(resting bool)

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
	// D214: the opened task's workbench (workbench.go).
	bench benchState
	// D142: a folder task's list was asked for (throttle), and an undo
	// that came back asking to confirm (what would be lost).
	folderAsked   map[string]int // 1: asked; 2: asked, and ask again on the answer
	folderConfirm map[string]*protocol.UndoConfirm
	taskLists     map[string]*ui.ListState
	md, mdTask    markdown.Options
	// taskScroll is where each opened task's page is scrolled to: it
	// follows the newest step while the task works and the reader is at
	// the end (D152).
	taskScroll map[string]*ui.ScrollState
	// taskOpened is the task whose page was scrolled to where it opens:
	// at its latest while it works or waits on the user, at its head once
	// it is finished (D210).
	taskOpened string
	// escAt is when Esc asked to pause the opened task (D210): a second
	// Esc within escWindow pauses it.
	escAt   time.Time
	escTask string
	mdLang  i18n.Lang // the language md's themes were made for
	// pressAll draws every button as pressed: the button specimen's
	// pressed row (tests only).
	pressAll bool
	// chipOwner is the entry that shows each task's chip.
	chipOwner map[string]int64
	// join: the row being drawn stacks its first bubble on the one before (D129).
	join    bool
	uiTheme *ui.Theme
	// readSent is the last seq a read frame covered; unreadAt is when the
	// conversation first showed something unread to the user.
	readSent int64
	unreadAt time.Time
	// open says which disclosures of an opened task are open:
	// "changes:<id>", "file:<id>:<name>", "details:<id>", "fold:<id>:<seq>".
	open map[string]bool
	// livingNewest is, per living line, the newest living message with it.
	livingNewest map[string]int64
	// resultShown marks the tasks whose result the partner gave.
	resultShown map[string]bool
	// livingAway remembers, per living message, whether it came while
	// the user was away.
	livingAway map[int64]bool
	// forgotten are the Noted lines forgotten from a message's Details.
	forgotten map[int64]bool
	// thinkingSince is when this app sent the message it waits on (the
	// presence row's clock before the partner names a step, D104).
	thinkingSince time.Time
	// LocaleFixed keeps the language as given (DUCTER_LOCALE); otherwise
	// it follows the user's first message (localeSet once it did).
	LocaleFixed bool
	localeSet   bool
	// focusComposer asks the shown composer to take the keyboard.
	focusComposer bool
	// doneAt is when a task last came back done (the done glow).
	doneAt time.Time
	// historyAsked marks the tasks whose stream was asked for.
	historyAsked map[string]bool
	// outbox holds what the user chose before the server was there.
	// Messages (to the partner or a task) don't go in it: they stay in
	// pending / the task's Sends until echoed, and are (re)sent from there
	// after each welcome (the server dedupes them by clientId).
	outbox []any
	// actSent are the merge / open_pr frames sent on this socket and not
	// yet answered (task -> action); inDoubt are those of the socket that
	// went away, settled from the Log once the replay is in (on_hand).
	actSent map[string]string
	inDoubt map[string]string
	// firstDone is the first result ever on this Mac, while it's shown.
	firstDone *firstResult
	// held is a message held back because it looks like a key.
	held *heldSend
	// dropped is the task just dropped, undoable until undoUntil.
	dropped   string
	undoUntil time.Time
	// dev is Your devices and abilities' own state.
	dev devicesState
	// Desktop is the window app's hands on macOS (focus, notifications);
	// nil in tests that don't need it.
	Desktop Desktop
	// asks are the gentle one-time offers after a result; web is 上网's
	// setup on this Mac.
	asks askState
	web  webSetupState
	// D151: the live view's bitmap and acks, a line to say once it closed, and the window size it asks for.
	live       liveState
	liveNote   string
	pu         phoneUseState // D217: Ducter's phone
	sites      sitesState
	af         autofillState // D191: 设置 › 自动填充
	winW, winH float32
	// partner and settings are the Partner page's and Settings' own state.
	partner partnerState
	// cal is the calendar screens' own memory (D222).
	cal      calUI
	phone    phoneState // D193: the phone card, the sign-in, a call's cards
	own      ownState   // D218: the own-number card
	settings settingsState
	// title is the title moment's own state (D87); PlayTitle starts its
	// sound (nil: silent, as in tests).
	title     titleState
	PlayTitle func() TitleSound
	// lo is what the partner thinks with and who does the tasks (D89).
	lo loadoutState
	// nt is 开一件事 / New task's card (D128); back is where Esc goes from
	// a task opened by it or by `ducter open`.
	nt   newTaskState
	back *returnTo
	// oh is On hand's list state (D216): the row the keys are on, Find, the switcher.
	oh onHandState
	// SystemLang is macOS's language, for Settings' "follow the system";
	// OnLanguage is told when the window's language changes (the menus).
	SystemLang i18n.Lang
	OnLanguage func(*i18n.Strings)
	// Version and Commit are this build's (Settings › About).
	Version, Commit string
	// Updates is the app's updater (D72); nil hides Updates (this copy
	// doesn't update itself). RestartToUpdate quits so a ready update
	// goes in; Quit quits the app (after Remove Ducter).
	Updates         Updates
	RestartToUpdate func()
	// PuttingIn: Restart to update is under way; the window says so
	// until it goes away.
	PuttingIn     bool
	installedSaid bool
	Quit          func()
	// ReportProblem collects diagnostics to attach (Help › Report a
	// problem…); nil opens a new issue instead.
	ReportProblem func()
	// OpenExternal opens a link when no Backend does (a window connected
	// to a Ducter elsewhere); nil in tests.
	OpenExternal func(url string) error
	// PickFolder asks macOS for a folder (D186: it becomes a project);
	// "" when the person cancels. nil hides 加一个文件夹….
	PickFolder func(title, button string) (string, error)
	// Editors are the code editors on this Mac and Terminals its terminals
	// (D201), each the one used last first; OpenFolder opens a task's
	// working copy here: "finder" shows it in Finder, "terminal" opens
	// Terminal there, else an Editor's App opens it (D198). nil hides
	// 打开 / Open.
	Editors    []Editor
	Terminals  []Editor
	OpenFolder func(with, path string) error
	openFailed string
	// D220: 工作副本 / Working copy: its panel open, and when its path was copied.
	infoOpen   bool
	infoCopied time.Time
}

// UndoWindow is how long a drop can be undone (D52).
const UndoWindow = 10 * time.Second

// ReadAfter is how long the conversation shows something new before it
// counts as read.
const ReadAfter = 1200 * time.Millisecond

// New makes the app's state.
func New(s *store.Store, t *theme.Tokens, l *i18n.Strings) *App {
	return &App{
		S: s, T: t, L: l,
		Now:           time.Now,
		Local:         hints.Open(""),
		Status:        client.Connecting,
		taskDrafts:    map[string]string{},
		replyOpen:     map[string]bool{},
		replyDraft:    map[string]string{},
		diffs:         map[string]*diffPane{},
		folderAsked:   map[string]int{},
		folderConfirm: map[string]*protocol.UndoConfirm{},
		taskLists:     map[string]*ui.ListState{},
		open:          map[string]bool{},
		historyAsked:  map[string]bool{},
		livingAway:    map[int64]bool{},
	}
}

func (a *App) send(frame any) {
	if a.Send == nil {
		return
	}
	// What the user said or chose is never dropped: until the server has
	// said welcome (just launched, or reconnecting), it waits in the
	// outbox and goes out right after the welcome.
	keep, msg := false, false
	switch frame.(type) {
	case protocol.Send, protocol.TaskSend:
		msg = true
	case protocol.Decide, protocol.TaskAction:
		keep = true
	}
	if !a.S.Welcomed || a.Status != client.Connected {
		if keep {
			a.outbox = append(a.outbox, frame)
		}
		if keep || msg {
			return // a message goes out from pending after the welcome
		}
	}
	if err := a.Send(frame); err != nil {
		a.StatusErr = err.Error()
		if keep {
			a.outbox = append(a.outbox, frame)
		}
		return
	}
	if f, ok := frame.(protocol.TaskAction); ok && (f.Action == "merge" || f.Action == "open_pr") {
		if a.actSent == nil {
			a.actSent = map[string]string{}
		}
		a.actSent[f.TaskID] = f.Action
	}
}

// resendUnechoed sends again, in order, every message the server hasn't
// echoed yet: sent on a socket that went away, or never sent. A copy the
// server already has is not appended twice (it dedupes by clientId), and
// the conversation shows each message once (pending is keyed by clientId).
func (a *App) resendUnechoed() {
	echoed := map[string]bool{}
	for _, e := range a.S.Channel {
		if e.User != nil && e.User.ClientID != "" {
			echoed[e.User.ClientID] = true
		}
	}
	for _, p := range a.pending {
		// A message whose pictures are still going up goes when they land.
		if !echoed[p.clientID] && (len(p.atts) == 0 || allReady(p.atts)) {
			a.send(protocol.Send{T: "send", Text: p.text, ClientID: p.clientID, Media: idsOf(p.atts)})
		}
	}
	for _, t := range a.S.Tasks {
		for _, sd := range t.Sends {
			if sd.Delivered == "" && sd.Failed == "" && sd.ClientID != "" {
				var ids []string
				for _, m := range sd.Media {
					ids = append(ids, m.ID)
				}
				a.send(protocol.TaskSend{T: "task_send", TaskID: t.ID, Text: sd.Text, ClientID: sd.ClientID, Media: ids})
			}
		}
	}
}

// settleInDoubt runs once the replay after a welcome is in: a merge or
// draft PR whose result was lost with the old socket is done if the Log
// says so (the store already cleared Acting); otherwise it is Unsure,
// never a failure.
func (a *App) settleInDoubt() {
	for id, action := range a.inDoubt {
		if t := a.S.Task(id); t != nil && t.Acting == action {
			t.Acting, t.Unsure = "", action
		}
	}
	a.inDoubt = nil
}

// RetryAction sends an action again after its result was lost.
func (a *App) RetryAction(t *store.Task) {
	action := t.Unsure
	if action == "" {
		return
	}
	t.Unsure, t.Acting = "", action
	a.TaskAction(t.ID, action)
}

// flushOutbox sends what waited for the connection, in order.
func (a *App) flushOutbox() {
	out := a.outbox
	a.outbox = nil
	for _, f := range out {
		a.send(f)
	}
}

// View is the window's content.
func (a *App) View(c *ui.Context) {
	if a.uiTheme == nil || a.mdLang != a.L.Lang {
		if a.uiTheme == nil {
			a.uiTheme = a.T.UITheme(c.Theme())
		}
		// Chinese reading text is 1.75 high (D78).
		a.mdLang = a.L.Lang
		a.md.Theme = a.markdownTheme(a.T.PartnerSize, a.leading(1.65))
		a.mdTask.Theme = a.markdownTheme(a.T.MD, a.leading(1.55))
	}
	c.SetTheme(a.uiTheme)
	a.winW, a.winH = c.Size()
	a.drainActionResults(c)
	a.watchStopAfter() // D161: 做完再停 lands wherever the window is
	a.shortcuts(c)
	a.titleTick(c)
	a.sayInstalled(c)
	ui.Column(c).Fill().Background(a.T.Bg).TextColor(a.T.Ink).Font(a.T.Body).Children(a.page(c, func() {
		switch {
		case a.PuttingIn:
			a.puttingInView(c)
		case a.title.on:
			a.setupActive() // the first check runs under the title
			a.titleView(c)
		case a.Unauthorized || a.conn.open:
			a.connect(c)
		case a.setupActive():
			a.setupView(c)
		case !a.S.Welcomed && a.Failed:
			a.firstRun(c)
		case a.Route == RouteOnHand:
			a.onHand(c)
		case a.Route == RouteTask:
			a.task(c)
		case a.Route == RouteDevices:
			a.devicesView(c)
		case a.Route == RoutePartner, a.Route == RouteSettings:
			a.settingsView(c)
		default:
			a.conversation(c)
		}
	}))
	if a.S.Welcomed {
		a.newTaskCard(c)
		a.switcher(c) // D216: ⌘O, 打开一件事
		a.liveView(c)
		a.phoneInstallSheet(c) // D217
		a.phoneView(c)
	}
	a.viewer(c) // D206: a picture, over everything
}

// shortcuts: Esc goes up one level, Cmd+1 the conversation, Cmd+2 On
// hand, Cmd+3 Devices, Cmd+4 Partner, Cmd+, Settings, Cmd+K the composer
// of the level shown. (In Ducter.app the menu bar holds the same keys.)
func (a *App) shortcuts(c *ui.Context) {
	if a.nt.open {
		return // the New task card has the keys (Esc closes it)
	}
	if a.oh.sw {
		if c.Shortcut(ui.Cmd, ui.KeyO) || c.Shortcut(0, ui.KeyEscape) {
			a.oh.sw = false
		}
		return // the switcher has the keys (D216)
	}
	switch {
	case c.Shortcut(ui.Cmd, ui.KeyO):
		a.OpenSwitcher()
	case c.Shortcut(ui.Cmd, ui.KeyN):
		a.NewTaskShortcut()
	case c.Shortcut(ui.Cmd, ui.Key1):
		a.Route = RouteConversation
	case c.Shortcut(ui.Cmd, ui.Key2):
		a.Route = RouteOnHand
	case c.Shortcut(ui.Cmd, ui.Key3):
		a.OpenDevices()
	case c.Shortcut(ui.Cmd, ui.Key4):
		a.OpenPartner()
	case c.Shortcut(ui.Cmd, ui.KeyComma):
		a.OpenSettings()
	case c.Shortcut(ui.Cmd|ui.Alt, ui.KeyB):
		a.ToggleBench() // D214: the workbench, as VS Code's, Zed's and Codex's right panel
	case c.Shortcut(ui.Cmd, ui.KeyK):
		if a.Route != RouteConversation && a.Route != RouteTask {
			a.Route = RouteConversation
		}
		a.focusComposer = true
	case c.Shortcut(0, ui.KeyEscape):
		if !a.taskEsc(c) && !a.escDevice() {
			a.Up()
		}
	}
}

// Up goes up one zoom level: an opened task to On hand, On hand to the
// conversation.
func (a *App) Up() {
	switch a.Route {
	case RouteTask:
		// A task the user just opened (New task, `ducter open`): back to
		// where they were.
		if b := a.back; b != nil && b.task == a.TaskID {
			a.back = nil
			if b.route == RouteTask && b.from != "" {
				a.OpenTask(b.from)
				return
			}
			if b.route != RouteTask {
				a.Route = b.route
				return
			}
		}
		a.Route = RouteOnHand
	case RouteOnHand, RouteDevices, RoutePartner, RouteSettings:
		a.Route = RouteConversation
	}
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
	th.CodeBackground = a.T.Sunken
	th.CodeFont = a.T.Mono
	th.CodeSize = 0.86
	th.CodeBlockBackground = a.T.SurfaceRaised
	th.CodeBlockBorder = a.T.Line
	th.QuoteBar = a.T.Line
	th.Rule = a.T.Line
	return th
}

// ---------- actions ----------

// secretRE finds what looks like a credential: GitHub, Anthropic, OpenAI,
// AWS and Slack tokens, and private keys (G-safety).
var secretRE = regexp.MustCompile(`ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{6,}|-----BEGIN [A-Z ]*PRIVATE KEY-----`)

// LooksSecret reports whether text holds what looks like a credential.
func LooksSecret(text string) bool { return secretRE.MatchString(text) }

// heldSend is a message held back because it looks like a key.
type heldSend struct {
	taskID, text string // taskID "" = to the partner
}

// SendMessage sends what the composer holds to the partner, and reports
// whether it went: text that looks like a key is held, and the composer
// keeps it, until the user says Send anyway or Don't send.
func (a *App) SendMessage(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" && len(a.med().trays["conv"]) == 0 {
		return false
	}
	if LooksSecret(text) {
		a.held = &heldSend{text: text}
		return false
	}
	a.held = nil
	a.sendMessage(text)
	return true
}

func (a *App) sendMessage(text string) {
	a.nextClient++
	id := fmt.Sprintf("c%d-%d", a.Now().UnixMilli(), a.nextClient)
	// D206: the pictures in the tray go with it; until they're all up it waits, shown.
	atts := a.takeTray("conv")
	ready := allReady(atts)
	a.pending = append(a.pending, pendingMsg{clientID: id, text: text, atts: atts, sent: ready})
	a.thinkingSince = a.Now()
	a.markRead()
	if ready {
		a.send(protocol.Send{T: "send", Text: text, ClientID: id, Media: idsOf(atts)})
	}
	a.list.ScrollToEnd()
}

// Decide answers a decision.
func (a *App) Decide(id, option, text string) {
	if d := a.S.Decisions[id]; d != nil {
		d.Pending, d.AnsweredAt = option, a.Now()
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

// SendToTask talks to a task directly; the transcript shows the text at
// once, then how it was delivered.
func (a *App) SendToTask(id, text string) bool {
	text = strings.TrimSpace(text)
	if text == "" && len(a.med().trays["task:"+id]) == 0 {
		return false
	}
	if LooksSecret(text) {
		a.held = &heldSend{taskID: id, text: text}
		return false
	}
	a.held = nil
	a.sendToTask(id, text)
	return true
}

func (a *App) sendToTask(id, text string) {
	a.nextClient++
	cid := fmt.Sprintf("t%d-%d", a.Now().UnixMilli(), a.nextClient)
	// D206: pictures still going up hold the message (shown) until they land.
	atts := a.takeTray("task:" + id)
	if !allReady(atts) {
		m := a.med()
		m.taskWait = append(m.taskWait, &taskWait{taskID: id, text: text, clientID: cid, atts: atts, at: a.Now()})
		return
	}
	a.sendToTaskWith(id, text, cid, atts)
}

// SendHeld sends the held message after all, and empties its composer.
func (a *App) SendHeld() {
	h := a.held
	if h == nil {
		return
	}
	a.held = nil
	if h.taskID == "" {
		a.sendMessage(h.text)
		a.draft = ""
		return
	}
	a.sendToTask(h.taskID, h.text)
	a.taskDrafts[h.taskID] = ""
}

// DropTask puts a task down; it can be undone for UndoWindow.
func (a *App) DropTask(id string) {
	a.dropped, a.undoUntil = id, a.Now().Add(UndoWindow)
	a.send(protocol.TaskAction{T: "task_action", TaskID: id, Action: "drop"})
}

// UndoDrop picks the task just dropped up again.
func (a *App) UndoDrop() {
	if a.dropped == "" || a.Now().After(a.undoUntil) {
		return
	}
	a.send(protocol.TaskAction{T: "task_action", TaskID: a.dropped, Action: "reopen"})
	a.dropped = ""
}

// TaskAction sends interrupt or reopen.
func (a *App) TaskAction(id, action string) {
	a.send(protocol.TaskAction{T: "task_action", TaskID: id, Action: action})
}

// GoOnAllDefaults takes the default of every open decision.
func (a *App) GoOnAllDefaults() {
	for _, d := range a.defaultable() {
		opt := d.DefaultOption
		if opt == "" {
			opt = "hold"
		}
		a.Decide(d.DecisionID, opt, "")
	}
}

// defaultable are the open decisions that have a default to go with:
// an irreversible one never goes ahead without the user.
func (a *App) defaultable() []*store.DecisionState {
	var out []*store.DecisionState
	for _, d := range a.S.OpenDecisions() {
		if d.Reversible {
			out = append(out, d)
		}
	}
	return out
}

// markRead tells the server the user has seen the conversation so far.
func (a *App) markRead() {
	if up := a.S.ChannelSeq; up > a.S.ReadUpTo && up > a.readSent {
		a.readSent = up
		a.send(protocol.Read{T: "read", UpToSeq: up})
	}
}

// readWhenSeen marks the conversation read once it has shown something
// new for ReadAfter while the window is in front.
func (a *App) readWhenSeen(c *ui.Context) {
	up := a.S.ChannelSeq
	if up <= a.S.ReadUpTo || up <= a.readSent || !c.WindowActive() || c.WindowHidden() {
		a.unreadAt = time.Time{}
		return
	}
	now := a.Now()
	if a.unreadAt.IsZero() {
		a.unreadAt = now
	}
	if wait := a.unreadAt.Add(ReadAfter).Sub(now); wait > 0 {
		c.After(wait)
		return
	}
	a.unreadAt = time.Time{}
	a.markRead()
}

// Welcomed is called when the server says welcome: a stale store starts
// over, and the open task asks for its stream again (live task events go
// only to sockets that asked).
func (a *App) Welcomed() {
	a.Failed = false
	a.readSent = 0
	a.Status = client.Connected // a welcome means the socket is up
	// D204: a clone in flight asks again on the new socket (the same clone, by its id).
	a.resendClone()
	// What the old socket left unanswered: messages go again (deduped by
	// the server), actions are settled from the Log after the replay.
	if len(a.actSent) > 0 {
		if a.inDoubt == nil {
			a.inDoubt = map[string]string{}
		}
		for id, act := range a.actSent {
			a.inDoubt[id] = act
		}
	}
	a.actSent = nil
	a.resendUnechoed()
	a.flushOutbox()
	if a.Route == RouteTask && a.TaskID != "" {
		a.send(protocol.TaskHistoryReq{T: "task_history", TaskID: a.TaskID, Limit: 500})
	}
	// Devices are pushed only to sockets that asked: ask again on a new one.
	inSettings := a.Route == RoutePartner || a.Route == RouteSettings
	if a.Route == RouteDevices || inSettings || !a.S.DevicesAt.IsZero() {
		a.send(protocol.DevicesReq{T: "devices"})
	}
	// Settings, too: the Partner page, and whether (and when) this Mac
	// shows notifications.
	if a.S.Settings != nil || inSettings || a.Desktop != nil {
		a.send(protocol.SettingsReq{T: "settings"})
	}
	// Connections (D96): same, once the Partner page asked.
	if a.S.ConnAsked || inSettings {
		a.send(protocol.ConnectionsReq{T: "connections"})
	}
}

// forgetShown drops everything shown from a Log: it started over, or the
// app now talks to another Ducter.
func (a *App) forgetShown() {
	a.S.Reset()
	a.pending, a.diffs = nil, map[string]*diffPane{}
	a.actSent, a.inDoubt = nil, nil
	a.taskLists = map[string]*ui.ListState{}
	a.historyAsked = map[string]bool{}
	a.livingAway = map[int64]bool{}
	if a.Route == RouteTask {
		a.Route = RouteConversation
	}
}

// Receive applies a server frame on the UI thread. A welcome from a Log
// that started over (its head behind our cursor) resets the store and
// says hello again from the start.
func (a *App) Receive(f protocol.ServerFrame) {
	if a.S.Stale(f) {
		a.forgetShown()
		a.send(protocol.Hello{T: "hello", Locale: string(a.L.Lang), TZ: localZone(), Client: "desktop"})
	}
	a.noteResults(f)
	a.S.Apply(f)
	a.followUserLanguage()
	switch f.T {
	case "welcome":
		a.Welcomed()
	case "action_result":
		delete(a.actSent, f.TaskID)
	case "devices":
		a.hintThisMac()
	case "on_hand":
		// on_hand closes the replay that follows a welcome.
		if a.inDoubt != nil {
			a.settleInDoubt()
		}
	}
	a.Applied(f)
}

// followUserLanguage speaks the language of the user's first message,
// unless DUCTER_LOCALE pins one (LocaleFixed).
func (a *App) followUserLanguage() {
	if a.LocaleFixed || a.localeSet {
		return
	}
	for _, e := range a.S.Channel {
		if e.User == nil {
			continue
		}
		if l := i18n.FromText(e.User.Text); l != "" {
			a.localeSet = true
			if l != a.L.Lang {
				a.L = i18n.New(l)
				if a.OnLanguage != nil {
					a.OnLanguage(a.L) // the menus follow
				}
			}
		}
		return
	}
}

// Applied is called after the store applied a frame: it refreshes what
// follows the stream, as the open task's diff.
func (a *App) Applied(f protocol.ServerFrame) {
	// D142: a folder's list came back; ask once more if something changed meanwhile.
	if f.T == "wb" {
		a.wbFrame(f)
		return
	}
	if f.T == "folder_changes" {
		again := a.folderAsked[f.TaskID] == 2
		delete(a.folderAsked, f.TaskID)
		if again {
			a.askFolder(f.TaskID)
		}
		return
	}
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
	if att == protocol.DoneClaimed {
		// A finished task reads "Done". done? means Ducter couldn't check
		// its evidence and the partner hasn't confirmed it yet, usually for
		// seconds (focus-window-states.md, done? → done).
		att = protocol.Done
	}
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
	return i18n.Clock(t)
}

func harnessName(h string) string {
	switch h {
	case "claude-code":
		return "Claude Code"
	case "codex":
		return "Codex"
	case "pi":
		return "pi"
	case "deepseek-harness":
		return "DeepSeek Harness"
	}
	return h
}

func harnessBadge(h string) string {
	switch h {
	case "claude-code":
		return "cc"
	case "codex":
		return "cx"
	case "deepseek-harness":
		return "ds"
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
		parts = append(parts, modelLabel(a.trayHarness(t.Harness()), m))
	}
	if e := t.Effort(); e != "" {
		parts = append(parts, a.effortWord(e)) // D202
	}
	return strings.Join(parts, " · ")
}

func (a *App) placeLine(p protocol.Place) string {
	switch p.Kind {
	case "repo":
		parts := []string{}
		if r := lastPath(p.RepoPath); r != "" {
			parts = append(parts, r)
		}
		parts = append(parts, a.device(p.Device))
		if p.Branch != "" {
			parts = append(parts, p.Branch)
		}
		return strings.Join(parts, " · ")
	case "folder":
		return lastPath(p.Path) + " · " + a.device(p.Device)
	case "browser":
		return p.Profile + " · " + a.device(p.Device)
	}
	return a.L.T("place.none")
}

// device names a device; the main process's own is "this Mac".
func (a *App) device(d string) string {
	if d == "" || d == "local" {
		return a.L.T("device.local")
	}
	return d
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
