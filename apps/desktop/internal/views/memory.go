package views

import (
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Settings › 记忆 / Memory and › 和你的其他 agent 通信 / Talk with your other agents (D257, D332),
// each its own tab. Memory is what the partner remembers about the person,
// first, in their words: the partner hugging its notebook and one sentence,
// then what it noted grouped by when (each one forgettable), then Nowledge
// Mem itself (where it is, its version, a newer one, putting it in, signing
// in). The rules are the web's (apps/web/src/mem-view.ts).

// memMin is the first nmem with `bridge connections` (D225).
const memMin = "0.10.118"

const memSite = "https://mem.nowledge.co"

// memNames is the first nmem that asks Mem who sent a message and what it
// answers (D364, Mem #10278, research/134).
const memNames = "0.10.120"

// nmemOlder says whether version v (major.minor.patch, nothing after) is
// before min. An unreadable version is never older: nothing is offered.
func nmemOlder(v, min string) bool {
	num := func(s string) ([3]int, bool) {
		var out [3]int
		parts := strings.Split(strings.TrimPrefix(strings.TrimSpace(s), "v"), ".")
		if len(parts) != 3 {
			return out, false
		}
		for i, p := range parts {
			n := 0
			if p == "" {
				return out, false
			}
			for _, ch := range p {
				if ch < '0' || ch > '9' {
					return out, false
				}
				n = n*10 + int(ch-'0')
			}
			out[i] = n
		}
		return out, true
	}
	a, ok1 := num(v)
	b, ok2 := num(min)
	if !ok1 || !ok2 {
		return false
	}
	for i := 0; i < 3; i++ {
		if a[i] != b[i] {
			return a[i] < b[i]
		}
	}
	return false
}

// peersNamesUpdate (D364): on the connected Talk with your other agents
// pane, an nmem older than memNames while Mem says a newer one is out:
// Mem's update, offered there with what it gives the pane. Nil otherwise.
// The web's: peersNamesUpdate (apps/web/src/mem-view.ts).
func peersNamesUpdate(b *protocol.BridgeView) *memUpd {
	if b == nil || b.State != "connected" || !nmemOlder(b.Version, memNames) {
		return nil
	}
	if u := memUpdate(b); u != nil && (u.Kind == "newer" || u.Kind == "app") {
		return u
	}
	return nil
}

// memPhase is where the partner's memory stands: off, missing, install,
// installing, sign_in, signing_in, closed (D329: the Mem app on the home is
// closed), or on (Mem answers).
func memPhase(memoryOn bool, mem *protocol.MemView, b *protocol.BridgeView) string {
	if !memoryOn {
		return "off"
	}
	if b == nil {
		if mem != nil && mem.State == "connected" {
			return "on"
		}
		return "missing"
	}
	switch b.State {
	case "install_mem":
		return "install"
	case "installing", "sign_in", "signing_in":
		return b.State
	case "mem_closed":
		return "closed"
	}
	// Every other state has a signed-in nmem on the home (an older one still remembers).
	return "on"
}

// memUpd is the one thing about Mem's own version worth saying: updating,
// done, needed (Bridge needs it), move, newer (Ducter can run it), app (only
// the Nowledge Mem app can).
type memUpd struct {
	Kind              string
	Move, CanRun, App bool
	Version, Newer    string
	Done              string
	Detail            string
	Kept              bool
}

// memHealthLook is what the Nowledge Mem head on Memory says about Mem's own
// health (D375), the web's memHealthLook (mem-view.ts): Look unread (not read
// yet, or it can't tell: the plain "Connected") | ok | old (CanUpdate, and
// not when the update row offers it) | unreachable | signed_out | plugin
// (Agents not connected; Busy while Mem's own command runs).
type memHealthView struct {
	Look      string
	CanUpdate bool
	Agents    []string
	Busy      bool
}

func memHealthLook(h *protocol.MemHealth, b *protocol.BridgeView, home []protocol.DeviceHarness) memHealthView {
	if h == nil {
		return memHealthView{Look: "unread"}
	}
	switch h.Issue {
	case "":
		return memHealthView{Look: "ok"}
	case "old":
		if memUpdate(b) != nil {
			return memHealthView{Look: "unread"}
		}
		return memHealthView{Look: "old", CanUpdate: b != nil && b.CanRun}
	case "unreachable", "signed_out":
		return memHealthView{Look: h.Issue}
	case "plugin":
		of := func(a string) *protocol.MemPluginView {
			for _, x := range home {
				if x.Harness == a {
					return x.Mem
				}
			}
			return nil
		}
		var agents []string
		busy := false
		for _, a := range h.Agents {
			m := of(a)
			if m != nil && m.Fresh {
				continue
			}
			agents = append(agents, a)
			busy = busy || (m != nil && m.Busy)
		}
		if len(agents) == 0 {
			return memHealthView{Look: "ok"}
		}
		return memHealthView{Look: "plugin", Agents: agents, Busy: busy}
	}
	return memHealthView{Look: "unread"}
}

func memUpdate(b *protocol.BridgeView) *memUpd {
	if b == nil {
		return nil
	}
	newer := ""
	if b.Newer != nil {
		newer = *b.Newer
	}
	switch {
	case b.State == "updating":
		return &memUpd{Kind: "updating", Move: b.Upkeep != nil && b.Upkeep.Kind == "move"}
	case b.Done != "" && b.Done != "installed":
		return &memUpd{Kind: "done", Done: b.Done}
	case b.State == "update_mem":
		return &memUpd{Kind: "needed", CanRun: b.CanRun, Move: b.Upkeep != nil && b.Upkeep.Kind == "move", App: b.Need == "app" || b.Version == "", Version: b.Version, Detail: b.Detail, Kept: b.Kept}
	case b.Upkeep != nil && b.Upkeep.Kind == "move":
		return &memUpd{Kind: "move", Detail: b.Upkeep.Detail, Kept: b.Upkeep.Kept}
	case b.Upkeep != nil && b.Upkeep.Kind == "update":
		return &memUpd{Kind: "newer", Newer: newer, Version: b.Version, Detail: b.Upkeep.Detail, Kept: b.Upkeep.Kept}
	case b.Newer != nil:
		return &memUpd{Kind: "app", Newer: newer, Version: b.Version}
	}
	return nil
}

// memBadge is the Memory tab's line in the rail: a key, or "".
func memBadge(u *memUpd) string {
	switch {
	case u == nil:
		return ""
	case u.Kind == "needed":
		return "mem.badge.needed"
	case u.Kind == "newer" || u.Kind == "app":
		return "mem.badge.newer"
	}
	return ""
}

// peersShown (D332): 和你的其他 agent 通信 shows by who: to the person who runs AI
// agents of their own (own: their records here, or Mem's plugin in one), to
// anyone another agent has written to or who stopped listening to one, and
// while the partner is connected (or answers elsewhere). Everyone else
// meets one quiet line on the Partner page instead (J6).
func peersShown(p *protocol.Peers, b *protocol.BridgeView, seen, own bool) bool {
	if p == nil {
		return false
	}
	if seen || len(p.Muted) > 0 {
		return true
	}
	if b != nil {
		switch b.State {
		case "connected", "disconnecting", "elsewhere", "unconfirmed":
			return true
		}
	}
	return own
}

// ownsAgents (D332): the person runs AI agents of their own: their records
// here, or Mem's plugin in one of their agents.
func ownsAgents(own []string, devices []protocol.DeviceView) bool {
	if len(own) > 0 {
		return true
	}
	for _, d := range devices {
		for _, h := range d.Harnesses {
			if h.Mem != nil && (h.Mem.State == "installed" || h.Mem.State == "update") {
				return true
			}
		}
	}
	return false
}

// peersPhase (D332) is what the pane is about: on, off (switched off),
// getting (Mem isn't ready: its steps in place), joining (ready: the home
// connects by itself), problem (one row, its fix), none (memory is off).
// peersSwitchOn is whether the switch shows on (D340). A home that isn't the
// person's own never connects by itself: while Mem is ready there the switch
// shows off, and flipping it on is the ask.
func peersSwitchOn(reach string, b *protocol.BridgeView) bool {
	return reach != "off" && !(b != nil && b.State == "ready" && b.Asks)
}

func peersPhase(b *protocol.BridgeView, switchOn bool) string {
	if b == nil {
		return "none"
	}
	if b.State == "connected" || b.State == "disconnecting" {
		if switchOn || b.State == "connected" {
			return "on"
		}
		return "off"
	}
	if !switchOn {
		return "off"
	}
	switch b.State {
	case "install_mem", "installing", "update_mem", "updating", "sign_in", "signing_in":
		return "getting"
	case "ready", "connecting":
		return "joining"
	}
	return "problem"
}

// handoff is one exchange with another agent, as 最近 lists it (web: Handoff).
type handoff struct {
	Seq    int64
	At     string
	Agent  string // its own name, "" when it left none
	Host   string // the tool it runs in, when it left no name and Mem says
	Way    string // in | sent | replied
	Words  string
	TaskID string
	State  string // D433, out: sending | unknown | unconfirmed | failed; "" = went
}

// peerFeed is the conversation's exchanges and a task's own (which never
// show there), in order (D448; web: peerFeed).
func peerFeed(ch, task []*store.Entry) []*store.Entry {
	if len(task) == 0 {
		return ch
	}
	seen := map[int64]bool{}
	var all []*store.Entry
	for _, e := range append(append([]*store.Entry(nil), ch...), task...) {
		if !seen[e.Event.Seq] {
			seen[e.Event.Seq] = true
			all = append(all, e)
		}
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].Event.Seq < all[j].Event.Seq })
	return all
}

// recentHandoffs is the latest exchanges both ways, newest first; only
// what really went (web: recentHandoffs).
func recentHandoffs(ch []*store.Entry, limit int, outOps ...map[string]*store.Entry) []handoff {
	// D433: what went out and hasn't plainly gone yet joins the list with its state.
	if len(outOps) > 0 && len(outOps[0]) > 0 {
		var unsent []*store.Entry
		for _, e := range outOps[0] {
			if e.Peer != nil && e.Peer.State != "sent" {
				unsent = append(unsent, e)
			}
		}
		if len(unsent) > 0 {
			all := append(append([]*store.Entry(nil), ch...), unsent...)
			sort.SliceStable(all, func(i, j int) bool { return all[i].Event.Seq < all[j].Event.Seq })
			ch = all
		}
	}
	var out []handoff
	for i := len(ch) - 1; i >= 0 && len(out) < limit; i-- {
		p := ch[i].Peer
		if p == nil {
			continue
		}
		state := ""
		if p.Direction == "in" {
			if p.State == "early" || p.State == "set_aside" || p.State == "muted" || p.State == "ping" {
				continue
			}
		} else {
			switch p.State {
			case "", "sent", "followed":
			case "sending", "unknown", "unconfirmed", "failed":
				state = p.State
			default:
				continue
			}
			if p.Ack {
				continue
			}
		}
		words := strings.Join(strings.Fields(p.Text), " ")
		if words == "" {
			continue
		}
		agent, host := peerCalled(p)
		way := "in"
		if p.Direction == "in" && p.State == "task" {
			way = "taskin" // D448: an answer that went into the task that asked
		}
		if p.Direction != "in" {
			way = "replied"
			if p.DecisionID != "" {
				way = "sent"
			}
			if p.By == "task" {
				way = "tasksent" // D448: a task's own message Ducter carried
			}
		}
		out = append(out, handoff{Seq: ch[i].Event.Seq, At: ch[i].Event.TS, Agent: agent, Host: host, Way: way, Words: words, TaskID: p.TaskID, State: state})
	}
	return out
}

// notedGroup is the noted lines of one "when": today, week (the last 7
// days), earlier.
type notedGroup struct {
	When  string
	Items []protocol.Noted
}

func groupNoted(noted []protocol.Noted, now time.Time) []notedGroup {
	y, m, d := now.Date()
	day0 := time.Date(y, m, d, 0, 0, 0, 0, now.Location())
	week0 := day0.AddDate(0, 0, -6)
	var out []notedGroup
	for _, n := range noted {
		when := "earlier"
		if at, err := time.Parse(time.RFC3339, n.At); err == nil {
			switch {
			case !at.Before(day0):
				when = "today"
			case !at.Before(week0):
				when = "week"
			}
		}
		if len(out) > 0 && out[len(out)-1].When == when {
			out[len(out)-1].Items = append(out[len(out)-1].Items, n)
		} else {
			out = append(out, notedGroup{When: when, Items: []protocol.Noted{n}})
		}
	}
	return out
}

// peersSeen: another agent has written to the partner (J6).
func (a *App) peersSeen() bool {
	for _, e := range a.S.Channel {
		if e.Peer != nil {
			return true
		}
	}
	return false
}

// visibleTabs is the rail: 和你的其他 agent 通信 only for who it is for (D332),
// and, once listed, for the rest of the session (D408): the rail never
// shrinks under the person's pointer.
func (a *App) visibleTabs() []string {
	var p *protocol.Peers
	if a.S.Settings != nil {
		p = a.S.Settings.Peers
	}
	if a.peersAsked || a.peersRailed || peersShown(p, a.S.Bridge, a.peersSeen(), ownsAgents(a.S.OwnAgents, a.S.Devices)) {
		a.peersRailed = true // once listed, kept for the session (D408)
		return settingsTabs
	}
	out := make([]string, 0, len(settingsTabs))
	for _, t := range settingsTabs {
		if t != TabPeers {
			out = append(out, t)
		}
	}
	return out
}

// memHome is the computer Mem is about: the home.
func (a *App) memHome() string {
	if b := a.S.Bridge; b != nil && b.Home != "" {
		return b.Home
	}
	return a.homeName()
}

// drawNotebook is Memory's mark: the partner's own blue notebook, the one
// it always carries, in the same clay (D257): the cover on a darker ledge,
// the pages' edge, a highlight along the top, the strap and its clasp.
func (a *App) drawNotebook() func(p *ui.Painter, r ui.Rect) {
	nb := a.T.Notebook
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 40
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		p.Fill(ui.Rect{X: x(8.5), Y: y(7.5), W: 23 * s, H: 28 * s}, nb.Ledge, 5.5*s)
		p.Fill(ui.Rect{X: x(8.5), Y: y(5), W: 23 * s, H: 28 * s}, nb.Cover, 5.5*s)
		p.Fill(ui.Rect{X: x(27), Y: y(7.5), W: 3.2 * s, H: 23 * s}, nb.Pages, 1.6*s)
		var h ui.Path
		h.MoveTo(x(12), y(8.6))
		h.QuadTo(x(18), y(7.4), x(24.4), y(8.1))
		p.StrokePath(&h, 1.7*s, nb.Shine)
		p.Fill(ui.Rect{X: x(21.5), Y: y(16.2), W: 11 * s, H: 6.2 * s}, nb.Strap, 3.1*s)
		var k ui.Path
		k.Circle(x(24.6), y(19.3), 1.75*s)
		p.FillPath(&k, nb.Clasp)
	}
}

// ---------- 和你的其他 agent 通信 / Talk with your other agents (D332) ----------

// peersPanel is the persona's connection with the person's other agents
// (D205) and who may reach it (D170). Mem's own steps live in Memory.
func (a *App) peersPanel(c *ui.Context) {
	a.panelHead(c, TabPeers, a.L.T("settings.lede.peers", a.personaName()))
	if a.loadingLine(c) {
		return
	}
	a.peersCard(c, a.S.Settings)
}
