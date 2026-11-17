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
	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/voice"
)

// Route is the zoom level shown.
type Route int

const (
	RouteConversation Route = iota
	RouteOnHand
	RouteTask
	// RouteDevices is 你的设备 / Your devices.
	RouteDevices
	// RoutePartner is Settings › 伙伴 / Partner (D150; its own page in D71).
	RoutePartner
	// RouteSettings is 设置 / Settings: one place for everything you can
	// set, a rail of tabs (D150).
	RouteSettings
	// RoutePast is 做过的事 / Past tasks (D285, past.go).
	RoutePast
	// RouteDid is 替你做过的 / Done for you (D300, did.go).
	RouteDid
)

// Updater runs a function on the UI thread and draws a frame
// (mygo.Window.Update); nil in tests, where work runs inline.
type Updater interface{ Update(func()) }

type pendingMsg struct {
	clientID, text string
	// atts (D206): the pictures going with it; sent once they're all up.
	atts []*attach
	sent bool
	// reply (D236): the one message it answers.
	reply *replyTo
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
	// Voice and Speaker are this Mac's own speech engines (D305): hold to
	// talk and Read aloud; nil says voice isn't available here.
	Voice   voice.Recognizer
	Speaker voice.Speaker
	// PreferredLocales are macOS's preferred languages, for the locale a
	// recognizer or a voice is asked for (voice.SpeechLocale).
	PreferredLocales []string
	vox              voiceState
	// IMessage is this Mac's iMessage bridge (D277); nil hides it.
	IMessage IMessageBridge
	imessage imessageState
	// fileView is the file viewer while open (D239); fileToast and copyText
	// a line or a copy it hands to the next frame.
	fileView            *fileViewState
	fileToast, copyText string
	// devicesAsked: the where line (D157) asked for devices once on its own.
	devicesAsked bool
	// bridgeHere: 改由这台收 / 只留这台 was tapped once and asks in place (D324).
	bridgeHere bool
	// D295: memAsk is the noted line whose 忘掉 asks in place; memDetails
	// shows the raw facts behind 详情.
	memAsk     int64
	memDetails bool
	// peersAsked (D332): 和你的其他 agent 通信 was opened from the Partner page's
	// one line, so the rail lists it for now.
	peersAsked bool
	// D321: Settings › 记忆's own state (memory_pane.go).
	memPage memPageState
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
	// Mac's name (its Computer Name, D310), how its devices are found on a
	// home; ThisHost its host name without a domain, what devices paired
	// before D310 call it.
	MacWorker    MacWorker
	ThisComputer string
	ThisHost     string
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
	// nav is the last move between pages, for its motion (D290).
	nav navState

	draft      string
	pending    []pendingMsg
	nextClient int
	list       ui.ListState
	taskDrafts map[string]string
	// D325: the held message being changed in place over a task's composer.
	heldEditing *heldEdit
	heldFocus   bool
	replyOpen   map[string]bool
	replyDraft  map[string]string
	diffs       map[string]*diffPane
	// D214: the opened task's workbench (workbench.go).
	bench benchState
	// D142: a folder task's list was asked for (throttle), and an undo
	// that came back asking to confirm (what would be lost).
	folderAsked   map[string]int // 1: asked; 2: asked, and ask again on the answer
	folderConfirm map[string]*protocol.UndoConfirm
	taskLists     map[string]*ui.ListState
	md, mdTask    markdown.Options
	mdTaskHan     markdown.Options // D268: the task's words when they hold Chinese
	// tp is the opened task's page (D271): its transcript made once per
	// change of its events, the locator's state, the turn being drawn.
	tpage taskPage
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
	// appear is the window's light or dark and the move between them (D302).
	appear appearanceState
	// ApplyAppearance tells macOS the appearance chosen in Settings
	// ("system", "light", "dark"; main.go: mygo.Theme.SetSource).
	ApplyAppearance func(string)
	// ApplyMenuBar shows or takes away the menu bar extra (D306; main.go).
	ApplyMenuBar func(on bool)
	// readSent is the last seq a read frame covered; unreadAt is when the
	// conversation first showed something unread to the user.
	readSent int64
	unreadAt time.Time
	// open says which disclosures of an opened task are open:
	// "changes:<id>", "file:<id>:<name>", "details:<id>", "fold:<id>:<seq>".
	open map[string]bool
	// D224: updAllAsked: this window tapped 全部更新 and waits for its plan's
	// id (updAllMine); updAllRestarted: the plan this app restarted for.
	updAllAsked     bool
	updAllMine      string
	updAllRestarted string
	// firstFrame is when the header was first drawn while connecting
	// (D262: the connecting line waits connectQuiet).
	firstFrame time.Time
	// livingNewest is, per living line, the newest living message with it.
	livingNewest map[string]int64
	// resultShown marks the tasks whose result the partner gave.
	resultShown map[string]bool
	// livingAway remembers, per living message, whether it came while
	// the user was away.
	livingAway map[int64]bool
	// fl is the conversation's place (D254, follow.go).
	fl follow
	// forgotten are the Noted lines forgotten from a message's Details.
	forgotten map[int64]bool
	// recall is the 想起了 line's card and 这周记下的 (D304, recall.go).
	recall recallState
	// thinkingSince is when this app sent the message it waits on (the
	// presence row's clock before the partner names a step, D104).
	thinkingSince time.Time
	// LocaleFixed keeps the language as given (DUCTER_LOCALE); otherwise
	// it follows the user's first message (localeSet once it did).
	LocaleFixed bool
	localeSet   bool
	// talk caches the conversation's language (talkLang, D292).
	talk talkCache
	// focusComposer asks the shown composer to take the keyboard.
	focusComposer bool
	// D298: the pasted-key card (firstwords.go).
	kp keyPaste
	// firstHow (D327): the offers whose how-I-know is open, by message and start.
	firstHow map[string]bool
	// rp is replying to one message (D236, reply.go).
	rp replyState
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
	pu         phoneUseState    // D217: Ducter's phone
	cu         computerUseState // D235: 用电脑
	sites      sitesState
	af         autofillState // D191: 设置 › 密码和银行卡
	chats      chatsState    // D276: 设置 › 聊天软件
	winW, winH float32
	slid       map[string]float32 // D244: a sliding pane's width when open (onhandrail.go)
	// partner and settings are the Partner page's and Settings' own state.
	partner  partnerState
	partners partnersUI // D309
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
	// AgentUpdating names the AI agents a Ducter on this Mac is updating
	// now (D227, update.AgentUpdating): no restart for the plan meanwhile.
	AgentUpdating func() []string
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
	moreOpen   bool // D268: the opened task's ⋯
	infoCopied time.Time
	past       pastState // D285: 做过的事 / Past tasks (past.go)
	did        didState  // D300: 替你做过的 / Done for you (did.go)
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
			a.send(protocol.Send{T: "send", Text: p.text, ClientID: p.clientID, Media: idsOf(p.atts), Reply: p.reply.want()})
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
	if a.followAppearance(c) {
		a.uiTheme = nil
	}
	if a.uiTheme == nil || a.mdLang != a.L.Lang {
		if a.uiTheme == nil {
			a.uiTheme = a.T.UITheme(c.Theme())
		}
		// Chinese reading text is 1.75 high (D78).
		a.mdLang = a.L.Lang
		a.md.Theme = a.markdownTheme(a.T.PartnerSize, a.leading(1.65))
		a.md.ShareSelection = true   // D254: the bubble holds the selection and its menu (Reply, Copy)
		a.md.CodeBlock = a.codeBlock // Ducter's own 拷贝 (D242)
		// D268: an agent's words in a task at 14, led by what the text holds
		// (1.6 Latin, 1.75 with Chinese), never by the app's language.
		a.mdTask.CodeBlock, a.mdTaskHan.CodeBlock = a.codeBlockTask, a.codeBlockTask
		a.mdTask.Theme, a.mdTaskHan.Theme = a.taskMarkdownTheme(1.6), a.taskMarkdownTheme(1.75)
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
		case a.Route == RoutePast:
			a.pastView(c)
		case a.Route == RouteDid:
			a.didView(c)
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
	a.viewer(c)     // D206: a picture, over everything
	a.fileViewer(c) // D239: a file a task showed
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
	a.railKeys(c) // D244: ⌘⇧] and ⌘⇧[ walk the tasks, from anywhere
	switch {
	case c.Shortcut(ui.Cmd, ui.KeyO):
		a.OpenSwitcher()
	case c.Shortcut(ui.Cmd, ui.KeyN):
		a.NewTaskShortcut()
	case c.Shortcut(ui.Cmd, ui.KeyY):
		a.OpenPast("") // D285
	case c.Shortcut(ui.Cmd|ui.Shift, ui.KeyY):
		a.OpenDid() // D300
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
	case a.Route == RouteConversation && c.Shortcut(ui.Cmd, ui.KeyDown):
		a.ToLatest() // D254: to the newest message
	case c.Shortcut(0, ui.KeyEscape):
		if a.Route == RoutePast {
			a.pastEsc() // D285: clears, then goes back
			break
		}
		if a.Route == RouteDid {
			a.didEsc() // D300: clears, then goes back
			break
		}
		if a.Route == RouteConversation && a.CancelReply() {
			break // D236: Esc puts a reply away first
		}
		if a.Route == RouteConversation && a.recallEsc() {
			break // D304: the 想起了 card or 这周记下的 closes, one step at a time
		}
		if a.locatorEsc() {
			break // D325: the locator's card closes first
		}
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
	case RoutePast:
		a.pastBack()
	case RouteDid:
		a.didBack()
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

// taskProse is the size of an agent's words in an opened task (D268).
const taskProse = 14

// taskMarkdownTheme is an agent's words in an opened task (D268): 14 on the
// reading measure, paragraphs 10 apart and list items 4, headings one and
// three steps up at 600, code a step down in mono on a faint fill.
func (a *App) taskMarkdownTheme(leading float32) *markdown.Theme {
	th := a.markdownTheme(taskProse, leading)
	th.BlockSpacing = 10.0 / taskProse
	th.ItemSpacing = 4.0 / taskProse
	th.CodeSize = (taskProse - 1.0) / taskProse
	th.CodeBlockRadius = 8
	sizes := [6]float32{taskProse + 3, taskProse + 1, taskProse, taskProse, taskProse, taskProse}
	for i := range th.Headings {
		th.Headings[i].Size = sizes[i] / taskProse
		th.Headings[i].Weight = 600
		th.Headings[i].Top = 16.0 / taskProse
		th.Headings[i].Bottom = 6.0 / taskProse
		th.Headings[i].Rule = false
	}
	return th
}

// mdFor is the task's Markdown options for a text: its leading by what it holds.
func (a *App) mdFor(text string) *markdown.Options {
	if hasHan(text) {
		return &a.mdTaskHan
	}
	return &a.mdTask
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
	// D236: what it replies to goes with it, and the composer lets go of it.
	reply := a.rp.replying
	a.rp.replying = nil
	if reply != nil {
		if a.rp.pressIn == nil {
			a.rp.pressIn = map[string]bool{}
		}
		a.rp.pressIn[id] = true
	}
	a.pending = append(a.pending, pendingMsg{clientID: id, text: text, atts: atts, sent: ready, reply: reply})
	a.thinkingSince = a.Now()
	a.markRead()
	if ready {
		a.send(protocol.Send{T: "send", Text: text, ClientID: id, Media: idsOf(atts), Reply: reply.want()})
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
	// D284: what the store holds shows at once; the newest window is asked
	// only when it was never loaded or a reconnect may have left a gap.
	// D320: and its session index, which lays out the whole session.
	a.askIndex(id)
	if t := a.S.Task(id); t == nil || !t.HistoryLoaded || t.HistStale {
		a.askHistory(id, 0)
	}
	a.refreshDiff(id)
}

// SendToTask talks to a task directly; the transcript shows the text at
// once, then how it was delivered.
func (a *App) SendToTask(id, text string) bool { return a.SendToTaskMode(id, text, "") }

// SendToTaskMode is SendToTask with how it lands while the task works
// (D268): "steer" (read at its next step), "queue" (after this turn), or ""
// for the runner's own choice.
func (a *App) SendToTaskMode(id, text, mode string) bool {
	text = strings.TrimSpace(text)
	if text == "" && len(a.med().trays["task:"+id]) == 0 {
		return false
	}
	if LooksSecret(text) {
		a.held = &heldSend{taskID: id, text: text}
		return false
	}
	a.held = nil
	a.sendToTask(id, text, mode)
	return true
}

func (a *App) sendToTask(id, text, mode string) {
	a.nextClient++
	cid := fmt.Sprintf("t%d-%d", a.Now().UnixMilli(), a.nextClient)
	// D206: pictures still going up hold the message (shown) until they land.
	atts := a.takeTray("task:" + id)
	if !allReady(atts) {
		m := a.med()
		m.taskWait = append(m.taskWait, &taskWait{taskID: id, text: text, clientID: cid, mode: mode, atts: atts, at: a.Now()})
		return
	}
	a.sendToTaskWith(id, text, cid, mode, atts)
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
	a.sendToTask(h.taskID, h.text, "")
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
	// D254: what came is read once it is seen: not while the reader is up the conversation.
	first, last := a.list.Visible()
	up := a.S.ChannelSeq
	if up <= a.S.ReadUpTo || up <= a.readSent || !c.WindowActive() || c.WindowHidden() || (last >= first && !a.list.AtEnd()) {
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
	a.resendGitLogin()
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
		a.askIndex(a.TaskID)
		a.askHistory(a.TaskID, 0)
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
	// D226: the day (and its reading problem) is asked again on a new
	// socket once asked: a restarted home may read again, or no longer.
	if a.S.Day != nil || (inSettings && a.settingsTab() == TabNotify) {
		a.send(protocol.ProactiveDayReq{T: "proactive_day"})
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
	a.liveIndex(f)
	if f.T == "task_history" || f.T == "task_index" {
		a.pageHistory(f.TaskID)
	}
	a.followUserLanguage()
	a.Local.SetPersonaName(a.S.PersonaName) // D262: the next launch starts with it
	switch f.T {
	case "welcome":
		a.Welcomed()
	case "action_result":
		delete(a.actSent, f.TaskID)
	case "outside_adopted":
		a.outsideAdopted(f.Past) // D299 (pastoutside.go)
	case "outside_hidden":
		a.askPast()
	case "media_keys":
		a.keysCame(f.MediaKeys)
	case "devices":
		a.hintThisMac()
		a.restartForPlan() // D224: this app's own step comes last
	case "update_all_result":
		if f.OK && f.ID != "" && a.updAllAsked {
			a.updAllMine, a.updAllAsked = f.ID, false
		}
	case "on_hand":
		// on_hand closes the replay that follows a welcome.
		if a.inDoubt != nil {
			a.settleInDoubt()
		}
	}
	a.Applied(f)
}

// followUserLanguage speaks the language of the user's first message,
// unless DUCTER_LOCALE pins one (LocaleFixed). Any language (D292): a
// Korean first message keeps "ko" (and the next launch starts in it); the
// words come from the first table on its chain (ko → English). The window's
// language is the prior (lang.Resolve): a message that shows only its
// script ("准备 App Store Connect", Latin with no telling word) keeps it.
func (a *App) followUserLanguage() {
	if a.LocaleFixed || a.localeSet {
		return
	}
	for _, e := range a.S.Channel {
		if e.User == nil {
			continue
		}
		if i18n.FromText(e.User.Text) != "" {
			l := i18n.Lang(lang.Resolve(e.User.Text, string(a.L.Locale)))
			a.localeSet = true
			a.Local.SetSpokeLang(string(l)) // D262: the next launch starts in it
			if next := i18n.New(l); next.Locale != a.L.Locale {
				words := next.Lang != a.L.Lang
				a.L = next
				if words && a.OnLanguage != nil {
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

// bodyParts is who does a task as separate facts: the agent, its model,
// its effort (D202), each its own element on screen (D291, `facts`).
func (a *App) bodyParts(t *store.Task) []string {
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
	return parts
}

// bodyLine is bodyParts read as a list, for an accessible name or a
// sentence's slot; on screen draw bodyParts with `facts` (D291).
func (a *App) bodyLine(t *store.Task) string {
	return spoken(a.L, a.bodyParts(t)...)
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
