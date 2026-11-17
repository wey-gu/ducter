// Package imessage is the Mac app's iMessage bridge (D277): another window
// on the one conversation. Only a Mac can read and send iMessage, so the
// bridge lives in the Mac app, which is a client of the home like any
// other: what the person texts the partner's handle goes to the home as
// their words (via "imessage"), and what the partner says back to those
// words comes back to iMessage. Reading is chat.db, read-only, by ROWID
// (Full Disk Access); sending is Messages through AppleScript (Automation ›
// Messages). design/imessage.md has the why.
package imessage

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Mode is whose Apple ID this Mac's Messages is signed in to.
type Mode string

const (
	// ModePartner (recommended): the partner's own Apple ID. The person
	// texts it like a contact, and it answers as itself.
	ModePartner Mode = "partner"
	// ModeSelf: the person's own Apple ID, in the thread they keep with
	// themselves. Every message the partner sends there starts with its
	// name, and it never writes to anyone else.
	ModeSelf Mode = "self"
)

// States of the bridge, for Settings.
const (
	StateOff        = "off"
	StatePairing    = "pairing"        // waiting for the code
	StateOn         = "on"             // reading and answering
	StateNeedsDisk  = "needs_disk"     // Full Disk Access
	StateNeedsAuto  = "needs_auto"     // Automation › Messages
	StateNotSigned  = "not_signed_in"  // Messages has no iMessage account
	StateNoMessages = "no_messages"    // Messages never set up here
	StateOwnID      = "own_id"         // partner mode, but this is the person's own Apple ID
	StateError      = "error"          // something else; it keeps trying
	codeLife        = 10 * time.Minute // a pairing code lives this long
	cardLife        = 24 * time.Hour   // a card answered by 好 is at most this old
	backlog         = 10 * time.Minute // older messages found after a restart are not acted on
	fresh           = 2 * time.Minute  // Log events older than this are history, never sent
	strangerEvery   = 24 * time.Hour   // the stranger line on Settings, at most once a day
	selfEcho        = 30 * time.Second // the same words twice in the self thread are one message
	maxBackoff      = 60 * time.Second // the longest wait after errors
	fullEvery       = 30 * time.Second // read even when nothing seems to have changed
	ledgerLife      = 10 * time.Minute // our own sends, recognised when they show up in chat.db
	pollDefault     = 2 * time.Second  // how often the database is looked at
	defaultBatch    = 200              // rows per read
	chanState       = "imessage"       // the channel's name on the wire
	turnsKept       = 500              // iMessage turns remembered for routing replies
	sentKept        = 500              // events already sent, remembered
	maxSendAttempts = 3
)

// Status is what Settings shows.
type Status struct {
	State string
	Mode  Mode
	// Handle is the linked address (partner mode: the person's; self
	// mode: their own).
	Handle string
	// Code and CodeUntil while pairing.
	Code      string
	CodeUntil time.Time
	// Err is the last error's words (State error).
	Err string
	// Stranger is when someone else last wrote to the partner (shown at
	// most once a day; nothing of theirs is kept).
	Stranger time.Time
	// Automation is false once macOS refused the Automation permission.
	Automation bool
	// Disk is false while Full Disk Access is missing.
	Disk bool

	// D323: the setup's checks.
	// Account is the address this Messages is signed in to iMessage with:
	// what Messages said when checked, else the address the code came in
	// at (partner mode). "" until known.
	Account string
	// Checked: Messages answered a check (signed in, Automation given).
	Checked bool
	// ICloud is this macOS user's iCloud Apple ID, when it said; the same
	// as Account hints that this Messages is the person's own.
	ICloud string
	// Background: this macOS user isn't the one in front, so Messages
	// can't be driven from here (research/113 §2). User is its name.
	Background bool
	User       string
}

// Wire is the channel_status state the home is told.
func (s Status) Wire() string {
	switch s.State {
	case StateOn:
		return "on"
	case StateNeedsDisk, StateNeedsAuto:
		return "needs_permission"
	case StateNotSigned, StateNoMessages:
		return "not_signed_in"
	case StateError, StateOwnID:
		return "error"
	}
	return "off"
}

// saved is what lives across restarts (imessage.json in the app's data).
type saved struct {
	On      bool   `json:"on"`
	Mode    Mode   `json:"mode,omitempty"`
	Handle  string `json:"handle,omitempty"`
	Cursor  int64  `json:"cursor"`
	LastSeq int64  `json:"lastSeq"`
	LastVia string `json:"lastVia,omitempty"`
	// Account is the partner's address the code came in at (D323).
	Account string `json:"account,omitempty"`
}

// Options wire a bridge to the app.
type Options struct {
	Store  Store
	Sender Sender
	// StatePath is the bridge's file ("" keeps nothing).
	StatePath string
	Now       func() time.Time
	// Relay sends the person's words to the home (a send frame with via
	// "imessage"); media are ids from the home's upload.
	Relay func(text, clientID string, media []string) error
	// Decide answers a card (go | hold) on the person's behalf.
	Decide func(decisionID, option string) error
	// Report tells the home how the bridge stands (channel_status).
	Report func(protocol.ChannelStatus)
	// Changed: Settings should draw again.
	Changed func()
	// Upload puts a picture the person sent into the home; "" skips it.
	Upload func(path, mime string) (string, error)
	// Name is the partner's name; Lang the app's language (zh | en).
	Name func() string
	Lang func() string
	// Quiet is the partner's quiet hours (nil: none).
	Quiet func() *protocol.QuietHours
	// Foreground: the person has the Ducter window in front, so what
	// Ducter starts itself stays there.
	Foreground func() bool
	Poll       time.Duration
	// Host is this Mac and macOS user, for the setup's checks (D323); nil
	// checks nothing.
	Host Host
	// Computer is this Mac's name, told to the home with how the bridge
	// stands, so the person's other devices can say which Mac carries it.
	Computer func() string
}

type card struct {
	id      string
	sentAt  time.Time
	text    string
	goLabel string
	guid    string // the message it went out as, once seen in chat.db
}

type sent struct {
	text string
	at   time.Time
}

// Bridge is one Mac's iMessage window on the conversation.
type Bridge struct {
	o Options

	mu       sync.Mutex
	st       saved
	status   Status
	code     string
	codeAt   time.Time
	turns    map[int64]bool // user_msg seqs written in iMessage
	turnSeq  []int64
	done     map[int64]bool // events already sent
	doneSeq  []int64
	card     *card
	held     []protocol.Decision // decisions waiting out the quiet hours
	ledger   []sent              // what we sent, to know it again in chat.db
	selfSeen []sent              // the self thread's words, to read an echo once
	seenGUID map[string]bool
	lastWire string
	dirty    bool
	unsent   bool // the home didn't take the last row's words
	stamp    string
	fullAt   time.Time
	fails    int
	wait     time.Time
	out      chan outMsg
	kick     chan struct{}
}

type outMsg struct {
	text string
	// card: this message is a card; cardID is set when 好 / 先等等 may
	// answer it (the newest open card only).
	card    bool
	cardID  string
	goLabel string
}

// New makes a bridge from its saved state; Run starts it.
func New(o Options) *Bridge {
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Poll == 0 {
		o.Poll = pollDefault
	}
	b := &Bridge{o: o, turns: map[int64]bool{}, done: map[int64]bool{}, seenGUID: map[string]bool{}, out: make(chan outMsg, 64), kick: make(chan struct{}, 1)}
	b.load()
	b.status = Status{State: StateOff, Mode: b.st.Mode, Handle: b.st.Handle, Automation: true, Disk: true, Account: b.st.Account}
	if b.st.On {
		b.status.State = StateOn
	}
	return b
}

func (b *Bridge) load() {
	if b.o.StatePath == "" {
		return
	}
	if data, err := os.ReadFile(b.o.StatePath); err == nil {
		_ = json.Unmarshal(data, &b.st)
	}
}

func (b *Bridge) save() {
	if b.o.StatePath == "" {
		return
	}
	data, _ := json.MarshalIndent(b.st, "", "  ")
	_ = os.MkdirAll(filepath.Dir(b.o.StatePath), 0o700)
	tmp := b.o.StatePath + ".tmp"
	if os.WriteFile(tmp, data, 0o600) == nil {
		_ = os.Rename(tmp, b.o.StatePath)
	}
}

// lang is the table the bridge's own words come from: the app's language
// through its fallback chain (D292), Chinese until the app says.
func (b *Bridge) lang() string {
	if b.o.Lang != nil {
		if t := b.o.Lang(); t != "" {
			return lang.PickTag(t, []string{"zh", "en"})
		}
	}
	return "zh"
}

func (b *Bridge) name() string {
	if b.o.Name != nil {
		if n := b.o.Name(); n != "" {
			return n
		}
	}
	return "Ducter"
}

// Status is how the bridge stands now.
func (b *Bridge) Status() Status {
	b.mu.Lock()
	defer b.mu.Unlock()
	s := b.status
	if b.code != "" {
		s.Code, s.CodeUntil = b.code, b.codeAt.Add(codeLife)
	}
	if s.Account == "" && b.st.Mode == ModePartner {
		s.Account = b.st.Account
	}
	if b.o.Host != nil {
		s.Background, s.User = !b.o.Host.Front(), b.o.Host.User()
	}
	return s
}

// setState changes the state and tells the home and Settings (outside the
// lock).
func (b *Bridge) setState(state, why string) {
	b.mu.Lock()
	changed := b.status.State != state || b.status.Err != why
	b.status.State, b.status.Err = state, why
	b.status.Mode, b.status.Handle = b.st.Mode, b.st.Handle
	b.mu.Unlock()
	if changed {
		b.report(false)
		if b.o.Changed != nil {
			b.o.Changed()
		}
	}
}

// report says the wire state to the home when it changed (or always).
func (b *Bridge) report(always bool) {
	b.mu.Lock()
	w := b.status.Wire()
	same := w == b.lastWire
	b.lastWire = w
	b.mu.Unlock()
	if (!same || always) && b.o.Report != nil {
		computer := ""
		if b.o.Computer != nil {
			computer = b.o.Computer()
		}
		b.o.Report(protocol.ChannelStatus{T: "channel_status", Channel: chanState, State: w, Computer: computer})
	}
}

// Enable starts linking in a mode: a fresh one-time code the person texts
// from their phone. The cursor starts at the newest message, so nothing
// already in Messages is ever read.
func (b *Bridge) Enable(ctx context.Context, mode Mode) error {
	if mode != ModeSelf {
		mode = ModePartner
	}
	max, err := b.o.Store.MaxRowID(ctx)
	if err != nil {
		b.fail(err)
		return err
	}
	code, err := newCode()
	if err != nil {
		return err
	}
	b.mu.Lock()
	b.st = saved{On: false, Mode: mode, Cursor: max, LastSeq: b.st.LastSeq}
	b.code, b.codeAt = code, b.o.Now()
	b.card, b.held = nil, nil
	b.save()
	b.mu.Unlock()
	b.setState(StatePairing, "")
	b.Kick()
	return nil
}

// NewCode makes another code while pairing (the old one stops working).
func (b *Bridge) NewCode() string {
	code, err := newCode()
	if err != nil {
		return ""
	}
	b.mu.Lock()
	b.code, b.codeAt = code, b.o.Now()
	b.mu.Unlock()
	if b.o.Changed != nil {
		b.o.Changed()
	}
	return code
}

// SetMode switches the mode of a linked bridge (after the own-Apple-ID
// warning, the person chooses Message yourself).
func (b *Bridge) SetMode(mode Mode) {
	b.mu.Lock()
	b.st.Mode = mode
	on := b.st.On
	b.save()
	b.mu.Unlock()
	if on {
		b.setState(StateOn, "")
	}
	b.Kick()
}

// Disable unlinks: nothing is read or sent until linked again.
func (b *Bridge) Disable() {
	b.mu.Lock()
	b.st = saved{LastSeq: b.st.LastSeq}
	b.code, b.card, b.held = "", nil, nil
	b.save()
	b.mu.Unlock()
	b.setState(StateOff, "")
}

// Kick reads now instead of at the next poll (after a permission changed).
func (b *Bridge) Kick() {
	b.mu.Lock()
	b.wait, b.stamp = time.Time{}, ""
	b.mu.Unlock()
	select {
	case b.kick <- struct{}{}:
	default:
	}
}

// Probe asks Messages (and, the first time, macOS) for the Automation
// permission and a signed-in iMessage account. D323: it is the setup's
// check too: which address Messages is signed in with, and this macOS
// user's iCloud Apple ID beside it.
func (b *Bridge) Probe(ctx context.Context) error {
	err := b.o.Sender.Probe(ctx)
	b.mu.Lock()
	b.status.Automation = !errors.Is(err, ErrNoAutomation)
	b.mu.Unlock()
	if err != nil {
		b.mu.Lock()
		b.status.Checked = false
		off := b.status.State == StateOff
		b.mu.Unlock()
		if off {
			// Before connecting, a check says why in the setup; the bridge
			// isn't on, so nothing backs off and the home hears nothing.
			b.mu.Lock()
			b.status.Err = probeWhy(err)
			b.mu.Unlock()
			if b.o.Changed != nil {
				b.o.Changed()
			}
			return err
		}
		b.fail(err)
		return err
	}
	account := ""
	if a, ok := b.o.Sender.(Accounter); ok {
		account, _ = a.Account(ctx)
		account = Address(account)
	}
	icloud := ""
	if b.o.Host != nil {
		icloud = b.o.Host.ICloud(ctx)
	}
	b.mu.Lock()
	b.status.Checked = true
	if b.status.State == StateOff {
		b.status.Err = ""
	}
	if account != "" {
		b.status.Account = account
	}
	b.status.ICloud = icloud
	b.mu.Unlock()
	if b.o.Changed != nil {
		b.o.Changed()
	}
	b.Kick()
	return nil
}

// Why a check before connecting failed, as a state word for Settings.
func probeWhy(err error) string {
	switch {
	case errors.Is(err, ErrNoAutomation):
		return StateNeedsAuto
	case errors.Is(err, ErrNotSignedIn):
		return StateNotSigned
	}
	return StateError
}

func newCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()+100000), nil
}

// Run reads Messages and sends what waits, until ctx ends.
func (b *Bridge) Run(ctx context.Context) {
	go b.sendLoop(ctx)
	b.report(true)
	t := time.NewTicker(b.o.Poll)
	defer t.Stop()
	for {
		b.Step(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-b.kick:
		}
	}
}

// Step is one look at the database (and the quiet hours' end). Tests call
// it directly.
func (b *Bridge) Step(ctx context.Context) {
	b.mu.Lock()
	active := b.st.On || b.code != ""
	if b.code != "" && b.o.Now().Sub(b.codeAt) > codeLife && !b.st.On {
		b.code = ""
		active = false
	}
	waiting := b.o.Now().Before(b.wait)
	b.mu.Unlock()
	if !active {
		if b.Status().State == StatePairing {
			b.setState(StateOff, "")
		}
		return
	}
	if waiting {
		return
	}
	b.flushQuiet()
	stamp := b.o.Store.Stamp()
	b.mu.Lock()
	skip := stamp != "" && stamp == b.stamp && b.o.Now().Sub(b.fullAt) < fullEvery
	cursor := b.st.Cursor
	b.mu.Unlock()
	if skip {
		return
	}
	rows, err := b.o.Store.Since(ctx, cursor, defaultBatch)
	if err != nil {
		b.fail(err)
		return
	}
	b.mu.Lock()
	b.stamp, b.fullAt, b.fails = stamp, b.o.Now(), 0
	b.status.Disk = true
	b.mu.Unlock()
	last := int64(-1)
	for _, r := range rows {
		b.handle(r)
		b.mu.Lock()
		stop := b.unsent
		b.unsent = false
		b.mu.Unlock()
		if stop {
			b.mu.Lock()
			b.stamp = "" // look again at the next poll
			b.mu.Unlock()
			break
		}
		last = r.RowID
	}
	b.mu.Lock()
	if last >= 0 {
		b.st.Cursor = last
		b.dirty = true
	}
	if b.dirty {
		b.dirty = false
		b.save()
	}
	state := b.status.State
	on, own := b.st.On, b.status.State == StateOwnID
	b.mu.Unlock()
	switch {
	case own:
	case on && state != StateOn && state != StateNeedsAuto && state != StateNotSigned:
		b.setState(StateOn, "")
	case !on && state != StatePairing:
		b.setState(StatePairing, "")
	}
}

// fail turns an error into a state and backs off: 2 s, 4 s, … 60 s.
func (b *Bridge) fail(err error) {
	b.mu.Lock()
	b.fails++
	d := time.Duration(1<<min(b.fails, 6)) * time.Second
	if d > maxBackoff {
		d = maxBackoff
	}
	b.wait = b.o.Now().Add(d)
	if errors.Is(err, ErrNoDiskAccess) {
		b.status.Disk = false
	}
	if errors.Is(err, ErrNoAutomation) {
		b.status.Automation = false
	}
	b.mu.Unlock()
	switch {
	case errors.Is(err, ErrNoDiskAccess):
		b.setState(StateNeedsDisk, "")
	case errors.Is(err, ErrNoAutomation):
		b.setState(StateNeedsAuto, "")
	case errors.Is(err, ErrNotSignedIn):
		b.setState(StateNotSigned, "")
	case errors.Is(err, ErrNoMessages):
		b.setState(StateNoMessages, "")
	default:
		b.setState(StateError, err.Error())
	}
}

// handle is one new row of chat.db.
func (b *Bridge) handle(r Row) {
	if r.Group {
		return // never a group chat
	}
	now := b.o.Now()
	prefix := strings.TrimSpace(say(b.lang(), "self", b.name())) // before the lock: app callbacks
	b.mu.Lock()
	if r.GUID != "" {
		if b.seenGUID[r.GUID] {
			b.mu.Unlock()
			return
		}
		b.seenGUID[r.GUID] = true
		if len(b.seenGUID) > 2000 {
			b.seenGUID = map[string]bool{r.GUID: true}
		}
	}
	// Pairing: a received message carrying the code links its sender. Only
	// received ones: the person texting the code to a friend links no one.
	if !b.st.On && b.code != "" {
		// D323: in partner mode the code tells whose Messages this is. The
		// code in the thread of this Messages' own address with itself (sent
		// or received) means it is the person's own Apple ID: link no one,
		// and say so. A code sent to a friend still links no one, silently.
		own := b.st.Mode == ModePartner && hasCode(r.Text, b.code) && sameHandle(Address(r.Dest), r.Handle)
		if own {
			b.code = ""
			b.save()
			b.mu.Unlock()
			b.setState(StateOwnID, "")
			return
		}
		if !r.FromMe && r.Handle != "" && hasCode(r.Text, b.code) {
			b.st.On, b.st.Handle, b.code = true, r.Handle, ""
			if dest := Address(r.Dest); b.st.Mode == ModePartner && dest != "" {
				b.st.Account = dest
				b.status.Account = dest
			}
			b.save()
			b.mu.Unlock()
			b.setState(StateOn, "")
			b.queue(outMsg{text: say(b.lang(), "linked")})
			return
		}
		b.mu.Unlock()
		return // strangers and wrong codes: silence
	}
	if !b.st.On {
		b.mu.Unlock()
		return
	}
	linked := sameHandle(r.Handle, b.st.Handle) || sameHandle(r.Chat, b.st.Handle)
	if !linked {
		if !r.FromMe && (b.status.Stranger.IsZero() || now.Sub(b.status.Stranger) > strangerEvery) {
			b.status.Stranger = now
			b.mu.Unlock()
			if b.o.Changed != nil {
				b.o.Changed()
			}
			return
		}
		b.mu.Unlock()
		return // nothing of theirs is kept or answered
	}
	self := b.st.Mode == ModeSelf
	if r.FromMe {
		// Our own send coming back from chat.db: learn the card's message.
		if b.ownSend(r, now) {
			b.mu.Unlock()
			return
		}
		if !self {
			// Someone else typed from this Apple ID: it is the person's own.
			// Stop speaking as the partner until they choose Message yourself.
			b.mu.Unlock()
			b.setState(StateOwnID, "")
			return
		}
	}
	if self && b.selfEchoSeen(r, now, prefix) {
		b.mu.Unlock()
		return
	}
	old := !r.Date.IsZero() && now.Sub(r.Date) > backlog
	c := b.card
	b.mu.Unlock()
	if old {
		return // after a restart, Apple can flush a backlog: never acted on
	}
	// A tapback is an answer or nothing; never words, so never a reply loop.
	if r.AssocType != 0 {
		if c != nil && c.guid != "" && strings.HasSuffix(r.AssocGUID, c.guid) && now.Sub(c.sentAt) < cardLife {
			switch r.AssocType {
			case TapLike:
				b.answer(c.id, "go")
			case TapDislike:
				b.answer(c.id, "hold")
			}
		}
		return
	}
	if c != nil && now.Sub(c.sentAt) < cardLife {
		if a := answerOf(r.Text); a != "" && len(r.Files) == 0 {
			b.answer(c.id, a)
			return
		}
	}
	var media []string
	if b.o.Upload != nil {
		for _, f := range r.Files {
			if !strings.HasPrefix(f.MIME, "image/") {
				continue
			}
			if id, err := b.o.Upload(ExpandPath(f.Path), f.MIME); err == nil && id != "" {
				media = append(media, id)
			}
		}
	}
	text := strings.TrimSpace(r.Text)
	if text == "" && len(media) == 0 {
		return
	}
	b.mu.Lock()
	b.st.LastVia = chanState
	b.save()
	b.mu.Unlock()
	if b.o.Relay != nil {
		if err := b.o.Relay(text, "imessage:"+r.GUID, media); err != nil {
			// The home isn't reachable now: read this message again next
			// time (its clientId keeps the home from taking it twice).
			b.mu.Lock()
			b.unsent = true
			delete(b.seenGUID, r.GUID)
			b.mu.Unlock()
		}
	}
}

// answer answers the card for the person and says so in a few words.
func (b *Bridge) answer(id, option string) {
	b.mu.Lock()
	goLabel := ""
	if b.card != nil && b.card.id == id {
		goLabel = b.card.goLabel
		b.card = nil
	}
	b.mu.Unlock()
	if b.o.Decide != nil {
		if err := b.o.Decide(id, option); err != nil {
			return
		}
	}
	if option == "go" {
		b.queue(outMsg{text: say(b.lang(), "did.go", goLabel)})
	} else {
		b.queue(outMsg{text: say(b.lang(), "did.hold")})
	}
}

// ownSend: r is a message we sent (it matches the ledger); a card's
// message gets its guid, for tapbacks. Holds b.mu.
func (b *Bridge) ownSend(r Row, now time.Time) bool {
	text := squash(r.Text)
	for i, s := range b.ledger {
		if now.Sub(s.at) > ledgerLife {
			continue
		}
		if squash(s.text) == text {
			b.ledger = append(b.ledger[:i], b.ledger[i+1:]...)
			if b.card != nil && b.card.guid == "" && squash(b.card.text) == text {
				b.card.guid = r.GUID
			}
			return true
		}
	}
	return false
}

// selfEchoSeen: in the self thread the same words can show up twice (sent
// and received); the second within selfEcho is the same message. Holds b.mu.
func (b *Bridge) selfEchoSeen(r Row, now time.Time, p string) bool {
	text := strings.TrimSpace(r.Text)
	if text == "" {
		return false
	}
	if p != "" && strings.HasPrefix(text, p) {
		return true // the partner's own words in the thread
	}
	keep := b.selfSeen[:0]
	seen := false
	for _, s := range b.selfSeen {
		if now.Sub(s.at) > selfEcho {
			continue
		}
		if s.text == text {
			seen = true
		}
		keep = append(keep, s)
	}
	b.selfSeen = keep
	if !seen {
		b.selfSeen = append(b.selfSeen, sent{text, now})
	}
	return seen
}

// squash is text with its spacing evened out, to know our own send again.
func squash(s string) string { return strings.Join(strings.Fields(s), " ") }

func hasCode(text, code string) bool {
	for _, f := range strings.FieldsFunc(text, func(r rune) bool { return r < '0' || r > '9' }) {
		if f == code {
			return true
		}
	}
	return false
}

// sameHandle compares addresses the way Messages writes them (case, and a
// phone number's spaces and dashes).
func sameHandle(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	norm := func(s string) string {
		s = strings.ToLower(strings.TrimSpace(s))
		if !strings.Contains(s, "@") {
			s = strings.Map(func(r rune) rune {
				if r == ' ' || r == '-' || r == '(' || r == ')' {
					return -1
				}
				return r
			}, s)
		}
		return s
	}
	return norm(a) == norm(b)
}

// ---------- what goes out ----------

// Observe takes a frame from the home: the welcome (the status is said
// again) and the Log's events (what to send).
func (b *Bridge) Observe(f protocol.ServerFrame) {
	switch f.T {
	case "welcome":
		b.report(true)
	case "events":
		for _, e := range f.Events {
			b.event(e)
		}
	}
}

func (b *Bridge) event(e protocol.LogEvent) {
	if e.Stream != "channel" {
		return
	}
	now := b.o.Now()
	b.mu.Lock()
	if e.Seq <= b.st.LastSeq {
		b.mu.Unlock()
		return // seen before this run, or replayed on a reconnect
	}
	b.st.LastSeq, b.dirty = e.Seq, true
	ts, _ := time.Parse(time.RFC3339Nano, e.TS)
	history := ts.IsZero() || now.Sub(ts) > fresh
	on := b.st.On && b.status.State != StateOwnID
	b.mu.Unlock()
	switch e.Kind {
	case protocol.KindUserMsg:
		var m protocol.UserMsg
		if e.Decode(&m) != nil {
			return
		}
		b.mu.Lock()
		b.st.LastVia = m.Via
		if m.Via == chanState {
			b.turns[e.Seq] = true
			b.turnSeq = append(b.turnSeq, e.Seq)
			if len(b.turnSeq) > turnsKept {
				delete(b.turns, b.turnSeq[0])
				b.turnSeq = b.turnSeq[1:]
			}
		}
		b.save()
		b.mu.Unlock()
	case protocol.KindAck, protocol.KindAIMsg:
		if history || !on {
			return
		}
		var text string
		var replyTo int64
		if e.Kind == protocol.KindAck {
			var a protocol.Ack
			if e.Decode(&a) != nil {
				return
			}
			text, replyTo = a.Text, a.ReplyTo
		} else {
			var m protocol.AIMsg
			if e.Decode(&m) != nil || m.DecisionID != "" {
				return // a card's question in its words: the card says it
			}
			text, replyTo = m.Text, m.ReplyTo
		}
		b.mu.Lock()
		turn := b.turns[replyTo]
		elsewhere := replyTo != 0 && !turn
		b.mu.Unlock()
		if strings.TrimSpace(text) == "" || elsewhere {
			return // a turn started in the app is not mirrored
		}
		if !turn && !b.reachHere() {
			return // Ducter's own words go where the person last spoke
		}
		if !turn && b.quietNow() {
			return // dropped like a done push in the quiet hours; it is in the app
		}
		b.send(e.Seq, outMsg{text: plain(b.lang(), text)})
	case protocol.KindDecision:
		if history || !on {
			return
		}
		var d protocol.Decision
		if e.Decode(&d) != nil || d.FindID != "" || d.Call != nil {
			return
		}
		if !b.reachHere() {
			return
		}
		if b.quietNow() {
			b.mu.Lock()
			b.held = append(b.held, d)
			b.mu.Unlock()
			return
		}
		b.sendCard(e.Seq, d, "")
	case protocol.KindDecisionResolved:
		var r protocol.DecisionResolved
		if e.Decode(&r) != nil {
			return
		}
		b.mu.Lock()
		if b.card != nil && b.card.id == r.DecisionID {
			b.card = nil // settled elsewhere: iMessage can't edit, so nothing more is said
		}
		keep := b.held[:0]
		for _, h := range b.held {
			if h.DecisionID != r.DecisionID {
				keep = append(keep, h)
			}
		}
		b.held = keep
		b.mu.Unlock()
	}
}

// reachHere: the person's last words came from iMessage and they aren't in
// the Ducter window.
func (b *Bridge) reachHere() bool {
	b.mu.Lock()
	via := b.st.LastVia
	b.mu.Unlock()
	if via != chanState {
		return false
	}
	return b.o.Foreground == nil || !b.o.Foreground()
}

func (b *Bridge) quietNow() bool {
	if b.o.Quiet == nil {
		return false
	}
	return InQuiet(b.o.Now(), b.o.Quiet())
}

// flushQuiet sends the newest decision that waited out the night, once.
// The app's callbacks run on its main thread, so none is called under b.mu.
func (b *Bridge) flushQuiet() {
	b.mu.Lock()
	n := len(b.held)
	b.mu.Unlock()
	if n == 0 || b.quietNow() {
		return
	}
	b.mu.Lock()
	held := b.held
	b.held = nil
	b.mu.Unlock()
	if len(held) == 0 {
		return
	}
	if !b.reachHere() {
		return
	}
	lead := ""
	if len(held) > 1 {
		lead = say(b.lang(), "morning", len(held)) + "\n"
	}
	b.sendCard(0, held[len(held)-1], lead)
}

// Answerable: a card a reply of 好 / 先等等 may answer from a chat app
// (research/88 §7.2): reversible, and nothing that reaches money,
// sign-ins, keys, phones, computers, people or another agent.
func Answerable(d protocol.Decision) bool {
	return d.Reversible && d.SignIn == nil && d.Pay == nil && d.Fill == nil && d.Key == nil &&
		d.Phone == nil && d.Computer == nil && d.Handset == nil && d.Asker == nil && d.Trust == nil &&
		d.Call == nil && d.Cal == nil && d.MemPlugin == nil && d.Closing == nil
}

// secret: a card about money, a sign-in, a saved detail or a key: never
// said in a chat app at all.
func secret(d protocol.Decision) bool {
	return d.Pay != nil || d.Key != nil || d.SignIn != nil || d.Fill != nil
}

func (b *Bridge) sendCard(seq int64, d protocol.Decision, lead string) {
	lang := b.lang()
	var text string
	switch {
	case secret(d):
		text = say(lang, "ask.safe")
	case Answerable(d):
		goLabel := d.GoLabel
		if goLabel == "" {
			goLabel = map[string]string{"zh": "照做", "en": "go ahead"}[lang]
		}
		text = plain(lang, d.Question) + "\n" + say(lang, "ask.reply", goLabel)
	default:
		text = plain(lang, d.Question) + "\n" + say(lang, "ask.app")
	}
	m := outMsg{text: lead + text, card: true}
	if Answerable(d) && !secret(d) {
		m.cardID, m.goLabel = d.DecisionID, d.GoLabel
	}
	b.send(seq, m)
}

// send queues one message, once per event.
func (b *Bridge) send(seq int64, m outMsg) {
	b.mu.Lock()
	if seq != 0 {
		if b.done[seq] {
			b.mu.Unlock()
			return
		}
		b.done[seq] = true
		b.doneSeq = append(b.doneSeq, seq)
		if len(b.doneSeq) > sentKept {
			delete(b.done, b.doneSeq[0])
			b.doneSeq = b.doneSeq[1:]
		}
	}
	b.mu.Unlock()
	b.queue(m)
}

func (b *Bridge) queue(m outMsg) {
	select {
	case b.out <- m:
	default: // a full queue drops; the app holds everything
	}
}

func (b *Bridge) sendLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case m := <-b.out:
			b.deliver(ctx, m)
		}
	}
}

// Flush sends whatever is queued now (tests; Run does it on its own).
func (b *Bridge) Flush(ctx context.Context) {
	for {
		select {
		case m := <-b.out:
			b.deliver(ctx, m)
		default:
			return
		}
	}
}

func (b *Bridge) deliver(ctx context.Context, m outMsg) {
	b.mu.Lock()
	to, mode := b.st.Handle, b.st.Mode
	ok := b.st.On && to != "" && b.status.State != StateOwnID
	b.mu.Unlock()
	if !ok {
		return
	}
	text := m.text
	if mode == ModeSelf {
		text = say(b.lang(), "self", b.name()) + text
	}
	now := b.o.Now()
	b.mu.Lock()
	b.ledger = append(b.ledger, sent{text, now})
	if len(b.ledger) > 100 {
		b.ledger = b.ledger[1:]
	}
	switch {
	case m.cardID != "":
		b.card = &card{id: m.cardID, sentAt: now, text: text, goLabel: m.goLabel}
	case m.card:
		b.card = nil // a newer card that 好 can't answer: 好 answers nothing now
	}
	b.mu.Unlock()
	var err error
	for i := 0; i < maxSendAttempts; i++ {
		if err = b.o.Sender.Send(ctx, to, text); err == nil {
			break
		}
		if errors.Is(err, ErrNoAutomation) || errors.Is(err, ErrNotSignedIn) {
			break
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Duration(i+1) * time.Second):
		}
	}
	if err != nil {
		b.fail(err)
		return
	}
	b.mu.Lock()
	b.status.Automation = true
	st := b.status.State
	b.mu.Unlock()
	if st == StateNeedsAuto || st == StateNotSigned || st == StateError {
		b.setState(StateOn, "")
	}
}

// InQuiet: t falls inside the quiet hours (start–end, across midnight
// when start > end), in their zone.
func InQuiet(t time.Time, q *protocol.QuietHours) bool {
	if q == nil || q.Start == "" || q.End == "" {
		return false
	}
	loc := time.Local
	if q.TZ != "" {
		if l, err := time.LoadLocation(q.TZ); err == nil {
			loc = l
		}
	}
	lt := t.In(loc)
	m := lt.Hour()*60 + lt.Minute()
	s, e := minutes(q.Start), minutes(q.End)
	if s < 0 || e < 0 || s == e {
		return false
	}
	if s < e {
		return m >= s && m < e
	}
	return m >= s || m < e
}

func minutes(hhmm string) int {
	var h, m int
	if _, err := fmt.Sscanf(hhmm, "%d:%d", &h, &m); err != nil {
		return -1
	}
	return h*60 + m
}

// The System Settings panes Settings opens.
const (
	PaneFullDisk   = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
	PaneAutomation = "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
)
