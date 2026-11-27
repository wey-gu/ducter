package views

import (
	"sort"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D470: 和你的其他 agent 通信 / Talk with your other agents in Settings' voice (D469). The head is the
// partner saying who reaches it; 你的 agent / Your agents is a literal row per agent (D489: what it can
// do with the partner, its one-tap offer under it when its answers can't reach it); 来往 / Back and
// forth is a thread per agent with what came of each exchange; 谁能让我做什么 / Who may ask me what
// says the rules in code. The web's: memory.tsx and mem-view.ts (reachWays, exchangeThreads,
// trustOf, spokenPeers).

// SENDER_DAILY and TRUSTED_DAILY are the partner's own limits (packages/partner/src/bridge-out.ts):
// messages a day per sender, tasks a day a trusted agent may start.
const (
	senderDaily  = 20
	trustedDaily = 5
)

// ways is how one agent and the partner reach each other: to (it reaches the partner) and back,
// each "yes", "no" or "unknown", and the one fix Ducter can start ("install", "mailbox", or "").
type ways struct{ To, Back, Fix string }

func reachWays(r reachRow) ways {
	switch r.Can {
	case "yes":
		// D560: the way back is Mem's facts (agentBack): yes, soon (its next session), no (its plugin's update, the fix).
		back := r.Back
		if back == "" {
			back = "unknown"
			if r.Box == "open" {
				back = "yes"
			}
		}
		switch back {
		case "old":
			w := ways{To: "yes", Back: "no"}
			if memBridgeSkill[r.Harness] != "" {
				w.To = "no" // D576: pi's older plugin can't write either
			}
			if r.Device != "" && r.Update {
				w.Fix = "update"
			}
			return w
		case "next":
			return ways{To: "yes", Back: "soon"}
		}
		return ways{To: "yes", Back: back}
	case "install":
		w := ways{To: "no", Back: "no"}
		if r.Device != "" {
			w.Fix = "install"
		}
		return w
	case "unknown":
		return ways{To: "unknown", Back: "unknown"}
	}
	return ways{To: "no", Back: "no"} // none, relay: the person's own sessions of it can't pass messages
}

// reachSplit is the agents whose Mem plugin carries Bridge, by how they stand: both ways, one way
// (it reaches the partner, the answers can't go back), not yet.
func reachSplit(rows []reachRow) (both, oneWay, notYet []reachRow) {
	for _, r := range rows {
		if r.Harness != "claude-code" && r.Harness != "codex" && r.Harness != "pi" {
			continue
		}
		w := reachWays(r)
		switch {
		case w.To == "yes" && w.Back == "no":
			oneWay = append(oneWay, r)
		case w.To == "yes":
			both = append(both, r)
		default:
			notYet = append(notYet, r)
		}
	}
	return
}

// exOutcome is what came of one exchange (web: ExOutcome). Kind: task, replied, card, held, go,
// told, none (a request that came in); answered, waiting, notsent (a question that went out).
type exOutcome struct {
	Kind, TaskID, Words, State string
}

// exItem is one exchange in a thread: what was asked, which way (in, asked, taskasked), what came of it.
type exItem struct {
	Seq    int64
	At     string
	Way    string
	Words  string
	TaskID string
	// D619: the message this row shows that Ducter sent (a reply, a claim or the question).
	OpID, MessageID string
	Outcome         exOutcome
}

// exThread is one agent's exchanges, newest first.
type exThread struct {
	Key, Agent, Host, Role string
	Mine, SelfNamed        bool
	At                     string
	Items                  []exItem
}

func flat(s string) string { return strings.Join(strings.Fields(s), " ") }

func outState(s string) string {
	switch s {
	case "sending", "unknown", "unconfirmed", "failed":
		return s
	}
	return ""
}

// exchangeThreads reads the exchanges with the person's other agents as threads (D470), from
// what the window holds: the feed's bridge_msg lines, the out-ops that haven't plainly gone, and
// the decisions asked for a message. No new protocol.
func exchangeThreads(feed []*store.Entry, outOps map[string]*store.Entry, decisions map[string]*store.DecisionState, per int) []exThread {
	all := append([]*store.Entry(nil), feed...)
	for _, e := range outOps {
		if e.Peer != nil && e.Peer.State != "" && e.Peer.State != "sent" {
			all = append(all, e)
		}
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].Event.Seq < all[j].Event.Seq })
	byOp := map[string]*store.Entry{}
	for _, e := range all {
		if e.Peer != nil && e.Peer.Direction == "out" && e.Peer.OpID != "" {
			byOp[e.Peer.OpID] = e
		}
	}
	var live []*store.Entry
	for _, e := range all {
		if e.Peer != nil && e.Peer.Direction == "out" && e.Peer.OpID != "" && byOp[e.Peer.OpID] != e {
			continue
		}
		live = append(live, e)
	}
	asked := map[string]*store.DecisionState{}
	for _, d := range decisions {
		if d.Asker != nil && d.Asker.MessageID != "" {
			asked[d.Asker.MessageID] = d
		}
	}
	outIDs := map[string]bool{}
	outsTo := map[string][]*protocol.BridgeMsg{}
	insTo := map[string]*protocol.BridgeMsg{}
	for _, e := range live {
		p := e.Peer
		if p == nil {
			continue
		}
		if p.Direction == "out" && p.MessageID != "" {
			outIDs[p.MessageID] = true
		}
		if p.InReplyTo == "" {
			continue
		}
		if p.Direction == "out" {
			outsTo[p.InReplyTo] = append(outsTo[p.InReplyTo], p)
		} else {
			insTo[p.InReplyTo] = p
		}
	}
	threads := map[string]*exThread{}
	var order []string
	for i, e := range live {
		p := e.Peer
		if p == nil || p.Ack {
			continue
		}
		words := flat(p.Text)
		if words == "" {
			continue
		}
		var item exItem
		if p.Direction == "in" {
			switch p.State {
			case "early", "set_aside", "muted", "ping", "held", "task":
				continue
			}
			if p.InReplyTo != "" && outIDs[p.InReplyTo] {
				continue // an answer: said on its question
			}
			outs := outsTo[p.MessageID]
			oc := exOutcome{Kind: "none"}
			var claim, reply *protocol.BridgeMsg
			for _, o := range outs {
				if o.TaskID != "" && claim == nil {
					claim = o
				}
				reply = o
			}
			card := asked[p.MessageID]
			switch {
			case p.MessageID != "" && claim != nil:
				oc = exOutcome{Kind: "task", TaskID: claim.TaskID}
			case p.MessageID != "" && reply != nil:
				oc = exOutcome{Kind: "replied", Words: flat(reply.Text), State: outState(reply.State)}
			case card != nil && card.Resolved != nil && card.Resolved.Option == "go":
				oc = exOutcome{Kind: "go"}
			case card != nil && card.Resolved != nil:
				oc = exOutcome{Kind: "held"}
			case card != nil:
				oc = exOutcome{Kind: "card"}
			default:
				// The partner spoke to the person about it before the person's next word: it waits on them.
				for _, n := range live[i+1:] {
					if n.User != nil {
						break
					}
					if n.AI != nil {
						oc = exOutcome{Kind: "told"}
						break
					}
				}
			}
			var sent *protocol.BridgeMsg
			switch {
			case claim != nil:
				sent = claim
			case reply != nil:
				sent = reply
			}
			item = exItem{Seq: e.Event.Seq, At: e.Event.TS, Way: "in", Words: words, TaskID: p.TaskID, Outcome: oc}
			if sent != nil {
				item.OpID, item.MessageID = sent.OpID, sent.MessageID
			}
		} else {
			if p.InReplyTo != "" || p.State == "pending" || p.State == "held" || p.State == "followed" {
				continue
			}
			oc := exOutcome{Kind: "waiting"}
			if st := outState(p.State); st != "" && st != "sending" {
				oc = exOutcome{Kind: "notsent", State: st}
			} else if ans := insTo[p.MessageID]; p.MessageID != "" && ans != nil {
				oc = exOutcome{Kind: "answered", Words: flat(ans.Text)}
			}
			way := "asked"
			if p.By == "task" {
				way = "taskasked"
			}
			item = exItem{Seq: e.Event.Seq, At: e.Event.TS, Way: way, Words: words, TaskID: p.TaskID, OpID: p.OpID, MessageID: p.MessageID, Outcome: oc}
		}
		name, host := peerCalled(p)
		key := name
		if key == "" && host != "" {
			key = "host:" + host
		} else if key == "" {
			key = "someone"
		}
		th := threads[key]
		if th == nil {
			th = &exThread{Key: key, Agent: name, Host: host}
			threads[key] = th
			order = append(order, key)
		}
		th.Mine = th.Mine || p.Mine
		th.SelfNamed = th.SelfNamed || p.SelfNamed
		if p.Role != "" {
			th.Role = p.Role
		}
		th.At = e.Event.TS
		th.Items = append([]exItem{item}, th.Items...)
	}
	out := make([]exThread, 0, len(order))
	for _, k := range order {
		th := *threads[k]
		if len(th.Items) > per {
			th.Items = th.Items[:per]
		}
		out = append(out, th)
	}
	sort.SliceStable(out, func(i, j int) bool { return store.ParseTime(out[i].At).After(store.ParseTime(out[j].At)) })
	return out
}

// trustOf is what a sender may ask the partner, by the rules in code: trusted (one of the person's
// own let start work, X2), own (work waits for the Go), team (a teammate's agent let through,
// D334: questions only), muted.
func trustOf(th exThread, p *protocol.Peers) string {
	if p != nil && contains(p.Muted, th.Agent) {
		return "muted"
	}
	if !th.Mine {
		return "team"
	}
	if p != nil && contains(p.Trusted, th.Agent) {
		return "trusted"
	}
	return "own"
}

// spokenPeers is the conversation's request lines the partner's own next words already say (D470):
// an incoming request with no card, followed by the partner's message before the person's next
// word. hidden: the request's seq; origin: the message's seq, mapped to the request.
func spokenPeers(entries []*store.Entry, asked func(string) bool) (map[int64]bool, map[int64]*protocol.BridgeMsg) {
	hidden := map[int64]bool{}
	origin := map[int64]*protocol.BridgeMsg{}
	for i, e := range entries {
		p := e.Peer
		if p == nil || !peerInConversation(p) || p.Direction != "in" || p.State != "" || (p.MessageID != "" && asked(p.MessageID)) {
			continue
		}
		for _, n := range entries[i+1:] {
			if n.User != nil || (n.Peer != nil && n.Peer.Direction == "in") {
				break
			}
			if n.AI != nil {
				hidden[e.Event.Seq] = true
				if origin[n.Event.Seq] == nil {
					origin[n.Event.Seq] = p
				}
				break
			}
		}
	}
	return hidden, origin
}

// ---------- the App's side ----------

func (a *App) peersReachRows() []reachRow {
	var boxes []protocol.BridgeMailbox
	if a.S.Bridge != nil {
		boxes = a.S.Bridge.Mailboxes
	}
	return reachRows(a.S.Devices, a.S.OwnAgents, recentHandoffs(peerFeed(a.S.Channel, a.S.TaskPeers), 50), boxes...)
}

// peersOn: the link is up (Agent messaging's connected phase).
func (a *App) peersOn() bool {
	st := a.S.Settings
	if st == nil || st.Peers == nil {
		return false
	}
	return peersPhase(a.S.Bridge, peersSwitchOn(st.Peers.Reach, a.S.Bridge)) == "on"
}

// peersSay is the partner's sentence at the head of Agent messaging.
func (a *App) peersSay() string {
	st := a.S.Settings
	if st == nil || st.Peers == nil {
		return a.L.T("say.peers")
	}
	on := peersSwitchOn(st.Peers.Reach, a.S.Bridge)
	if !on {
		return a.L.T("say.peers.off")
	}
	if peersPhase(a.S.Bridge, on) != "on" {
		return a.L.T("say.peers")
	}
	reach, one, notYet := reachSplit(a.peersReachRows())
	// D489: both ways only where Mem said so; an agent whose way back Mem hasn't told is said as what it does.
	var both, next, to, talk []reachRow
	for _, r := range notYet {
		if standing(r) == "talk" {
			talk = append(talk, r)
		}
	}
	for _, r := range reach {
		switch standing(r) {
		case "both", "ask": // D576: pi reads the reply when asked: both ways too
			both = append(both, r)
		case "next":
			next = append(next, r)
		default:
			to = append(to, r)
		}
	}
	switch {
	case len(both) > 0 && len(one) > 0:
		// D489: an agent a step from hearing back (its plugin's update) is said as the step it is.
		return a.L.T("say.peers.mixed", a.listWords(toolsOf(both)), a.listWords(toolsOf(one)))
	case len(one) > 0:
		return a.L.T("say.peers.oneway", a.listWords(toolsOf(one)))
	case len(both) > 0 && len(next) > 0:
		// D560: one whose next session will hear back needs nothing from the person: said once, as what will happen.
		return a.L.T("say.peers.mixed.next", a.listWords(toolsOf(both)), a.listWords(toolsOf(next)))
	case len(next) > 0:
		return a.L.T("say.peers.next", a.listWords(toolsOf(next)))
	case len(both) > 0:
		return a.L.T("say.peers.both", a.listWords(toolsOf(both)))
	case len(to) > 0:
		return a.L.T("say.peers.to", a.listWords(toolsOf(to)))
	case len(talk) > 0:
		return a.L.T("say.peers.talk", a.listWords(toolsOf(talk)))
	case len(notYet) > 0:
		return a.L.T("say.peers.notyet")
	}
	return a.L.T("say.peers")
}

// peersReaching is the agents that reach the partner, for Overview's 也能找我 / Also in.
func (a *App) peersReaching() []string {
	if !a.peersOn() {
		return nil
	}
	both, one, _ := reachSplit(a.peersReachRows())
	return toolsOf(append(both, one...))
}

func toolsOf(rows []reachRow) []string {
	var out []string
	for _, r := range rows {
		out = append(out, r.Tool)
	}
	return out
}

// standing is how one agent stands with the partner, said as what the person gets (D489; the web's
// standing in mem-view.ts): both, next (D560: its next session will hear back; nothing to tap), old
// (D560: its plugin's update lets it hear back: the one button), to (the way back unknown), install,
// unknown, relay (no Bridge in its Mem plugin; Ducter's tasks on it carry messages), none (no Bridge
// in its Mem plugin: Mem's to add). D576, an agent whose plugin carries Bridge itself (pi): ask (it
// reads the reply when the person asks it to look), talk (its plugin's update lets it pass messages at all).
func standing(r reachRow) string {
	if r.Can == "relay" || r.Can == "none" {
		return r.Can
	}
	w := reachWays(r)
	skill := memBridgeSkill[r.Harness] != ""
	if skill && r.Can == "yes" && w.To == "no" && w.Back == "no" {
		return "talk"
	}
	if w.To == "yes" {
		switch w.Back {
		case "yes":
			if skill {
				return "ask"
			}
			return "both"
		case "soon":
			return "next"
		case "no":
			return "old"
		}
		return "to"
	}
	if r.Can == "install" {
		return "install"
	}
	return "unknown"
}

// peersAgents is 你的 agent / Your agents (D489): a literal row per agent whose Mem plugin carries
// Bridge (its coin, its name, what it can do with the partner, when it last came; never a
// diagram), and the ones whose plugin doesn't on one quiet row.
func (a *App) peersAgents(c *ui.Context, name string) {
	rows := a.peersReachRows()
	if len(rows) == 0 {
		return
	}
	var bridged, rest []reachRow
	for _, r := range rows {
		if r.Can == "relay" || r.Can == "none" {
			rest = append(rest, r)
		} else {
			bridged = append(bridged, r)
		}
	}
	a.group(c, "peers-agents", a.L.T("peers.agents.title"), "", func() {
		for _, r := range bridged {
			a.peerAgentRow(c, r)
		}
		if len(rest) > 0 {
			a.noBridgeRow(c, rest, name)
		}
	})
}

// peerAgentRow is one agent: its coin, its name, what it can do with the partner, and at the right edge
// when it last came, 装上 when Mem's plugin is missing there, or (D560) 让它也能收到我的回话 when its
// plugin is older than the one whose sessions receive and Mem offers the newer one: the plugin's update.
// One whose next session will hear back says so and offers nothing.
func (a *App) peerAgentRow(c *ui.Context, r reachRow) {
	t := a.T
	st := standing(r)
	// D576: pi's update (talk) works as the others' (old), in its own words.
	fix := st == "old" || st == "talk"
	updating := fix && r.Busy
	line := a.L.T("peers.st." + st)
	fixLabel := a.L.T("peers.fix.hear")
	if st == "talk" {
		fixLabel = a.L.T("peers.fix.talk")
	}
	if updating {
		line = a.L.T("peers.st.updating")
		if st == "talk" {
			line = a.L.T("peers.st.updating.talk")
		}
	}
	last := ""
	if r.Last != "" && st != "install" && st != "unknown" {
		if s := a.agoLong(r.Last); s != "" {
			last = a.L.T("peers.last", s)
		}
	}
	var control func()
	switch {
	case st == "install" && r.Device != "":
		control = func() {
			if a.buttonFor(c, a.L.T("peers.try.plugin.go"), r.DeviceName, btnSecondary, t.ControlSM, t.Surface) {
				a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: r.Device, Harness: r.Harness})
			}
		}
	case fix && r.Update && r.Device != "" && !updating:
		control = func() {
			if a.buttonFor(c, fixLabel, r.Tool, btnSecondary, t.ControlSM, t.Surface) {
				a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: r.Device, Harness: r.Harness})
			}
		}
	case last != "":
		control = func() { uiText(c, last).FontSize(t.SM).TextColor(t.InkMuted).SingleLine() }
	}
	a.tileRow(c, "agent:"+r.Harness, a.toolTile(c, r.Tool), r.Tool, line, control)
}

// noBridgeRow is the agents whose own Mem plugin carries no Bridge, together: what Ducter's tasks on
// them can do, never drawn as a fault.
func (a *App) noBridgeRow(c *ui.Context, rows []reachRow, name string) {
	relay := false
	var tools []string
	for _, r := range rows {
		relay = relay || r.Can == "relay"
		tools = append(tools, r.Tool)
	}
	one := ""
	if len(rows) == 1 {
		one = ".one"
	}
	line := a.L.T("peers.st.none" + one)
	if relay {
		line = a.L.T("peers.st.relay"+one, name)
	}
	tile := func() {
		ui.Row(c.Key("nb-coins")).Width(44).Height(40).Shrink(0).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			size := float32(28)
			if len(rows) > 1 {
				size = 26
			}
			for i, r := range rows {
				if i > 0 {
					ui.Box(c).Width(0).Margin(0, 0, 0, -12)
				}
				if bmp := theme.Clay(coinArt(r.Harness, false)); bmp != nil {
					ui.Image(c, bmp).Size(size, size)
				}
			}
		})
	}
	if len(rows) == 1 {
		// D555: pi alone (Antigravity has its own row now) wears the same tile as every agent row.
		tile = a.toolTile(c, rows[0].Tool)
	}
	a.tileRow(c, "agents-nobridge", tile, a.listWords(tools), line, nil)
}

// exTaskTitle is a task's title, clipped (D448, D470).
func (a *App) exTaskTitle(taskID string) string {
	tk := a.S.Tasks[taskID]
	if tk == nil {
		return "…"
	}
	s := strings.TrimSpace(tk.Title())
	if s == "" {
		return "…"
	}
	if r := []rune(s); len(r) > 30 {
		s = string(r[:29]) + "…"
	}
	return s
}

// exLine is what came of an exchange, in the partner's words, and its ink.
func (a *App) exLine(x exItem) (string, ui.Color) {
	t := a.T
	o := x.Outcome
	if x.Way == "in" {
		switch o.Kind {
		case "task":
			return a.L.T("peers.ex.in.task", a.exTaskTitle(o.TaskID)), t.InkMuted
		case "replied":
			ink := t.InkMuted
			if o.State == "failed" || o.State == "unconfirmed" {
				ink = t.Failed.Ink
			}
			return a.L.T("peers.ex.in.replied", oneLine(o.Words, 60)), ink
		case "card", "told":
			return a.L.T("peers.ex.in." + o.Kind), t.NeedsYou.Ink
		}
		return a.L.T("peers.ex.in." + o.Kind), t.InkMuted
	}
	head := "peers.ex.asked."
	var args []any
	if x.Way == "taskasked" {
		head = "peers.ex.task."
		args = append(args, a.exTaskTitle(x.TaskID))
	}
	switch o.Kind {
	case "answered":
		return a.L.T(head+"answered", append(args, oneLine(o.Words, 60))...), t.InkMuted
	case "notsent":
		return a.L.T(head+"notsent", args...), t.Failed.Ink
	}
	return a.L.T(head+"waiting", args...), t.InkMuted
}

// peersThreads is 来往 / Back and forth: a thread per agent; before the first exchange, the
// partner's invitation with the two examples.
func (a *App) peersThreads(c *ui.Context, name string, threads []exThread, p *protocol.Peers) {
	t := a.T
	if len(threads) == 0 {
		a.group(c, "peers-ex", a.L.T("peers.ex.title"), "", func() {
			a.tileRow(c, "ex-empty", func() { a.avatar(c, theme.Idle, 40) }, a.L.T("peers.ex.empty"), "", nil)
			a.textBlock(c, "ex-try", func() { a.tryPair(c, name) })
		})
		return
	}
	ui.Column(c.Key("peers-threads")).Gap(t.S3).Children(func() {
		for i, th := range threads {
			title := ""
			if i == 0 {
				title = a.L.T("peers.ex.title")
			}
			a.peersThread(c, th, title, p)
		}
	})
}

// peersThread is one agent's exchanges, its trust in its head (what it may ask), newest first.
func (a *App) peersThread(c *ui.Context, th exThread, title string, p *protocol.Peers) {
	trust := trustOf(th, p)
	line := a.L.T("peers.trust.own")
	switch trust {
	case "trusted":
		line = a.L.T("peers.trust.trusted", trustedDaily)
	case "team":
		line = a.L.T("peers.trust.team")
	case "muted":
		line = a.L.T("peers.muted", th.Agent)
	}
	who := capPeer(a.peerWhoOf(&protocol.BridgeMsg{Direction: "in", Agent: th.Agent, Host: th.Host, Mine: th.Mine, SelfNamed: th.SelfNamed, Role: th.Role}))
	a.group(c, "thread:"+th.Key, title, "", func() {
		var control func()
		switch trust {
		case "trusted":
			control = func() {
				if a.quietButton(c, "trust:"+th.Key, a.L.T("peers.trust.ask"), th.Agent, false, 0) && p != nil {
					next := *p
					next.Trusted = without(p.Trusted, th.Agent)
					a.SetSettings(protocol.SettingsPatch{Peers: &next})
				}
			}
		case "team":
			control = func() {
				if a.quietButton(c, "mute:"+th.Key, a.L.T("peers.trust.mute"), th.Agent, false, 0) && p != nil {
					next := *p
					next.Muted = append(append([]string(nil), p.Muted...), th.Agent)
					next.Allowed = append([]string{}, without(p.Allowed, th.Agent)...)
					a.SetSettings(protocol.SettingsPatch{Peers: &next})
				}
			}
		}
		a.headRow(c, "thread:"+th.Key, a.peerTile(c, th.Agent, th.Host), who, line, sideMuted, control)
		for _, x := range th.Items {
			x := x
			a.exRow(c, x)
		}
	})
}

// exRow is one exchange: its words, what came of it, and at the right edge when (or a send that
// hasn't plainly gone); it opens the task it became or came from, else the conversation.
func (a *App) exRow(c *ui.Context, x exItem) {
	t := a.T
	line, ink := a.exLine(x)
	when, whenInk := a.agoLong(x.At), t.InkMuted
	st := x.Outcome.State
	if st != "" {
		when = a.L.T("peers.out." + st)
		if st == "failed" || st == "unconfirmed" {
			whenInk = t.Failed.Ink
		}
	}
	a.sep(c)
	b := ui.Row(c.Key("ex:"+itoa(x.Seq))).Gap(t.S3).Padding(t.S3, t.S5, t.S3, t.S5+40+t.S3).MinHeight(64).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(x.Words + ", " + line).Focusable()
	switch {
	case b.Pressed():
		b.Background(t.Ink.Alpha(0.06))
	case b.Hovered():
		b.Background(t.Ink.Alpha(0.03))
	}
	b.Children(func() {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			uiText(c, keepWords(autospace(x.Words))).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4)).MaxLines(2)
			uiText(c, keepWords(autospace(line))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(ink).MaxLines(2)
		})
		// D619: the receipt sits under the time, small and quiet; nothing when Mem has none.
		receipt := ""
		if x.Outcome.Kind != "notsent" {
			receipt = a.receiptText(a.S.ReceiptOf(x.OpID, x.MessageID))
		}
		if when != "" || receipt != "" {
			ui.Column(c.Key("when")).Gap(2).AlignItems(ui.End).Shrink(0).Children(func() {
				if when != "" {
					uiText(c.Key("at"), when).FontSize(t.SM).FontWeight(600).TextColor(whenInk).SingleLine()
				}
				if receipt != "" {
					uiText(c.Key("rc"), receipt).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
			})
		}
	})
	if b.Clicked() {
		task := x.TaskID
		if x.Outcome.Kind == "task" {
			task = x.Outcome.TaskID
		}
		if task != "" {
			a.OpenTask(task)
		} else {
			a.Route = RouteConversation
		}
	}
}

// peersRules is 谁能让我做什么 / Who may ask me what (bridge.md X1–X3), and the senders the person
// stopped hearing, each with 恢复.
func (a *App) peersRules(c *ui.Context, p *protocol.Peers) {
	a.group(c, "peers-rules", a.L.T("peers.rules.title"), "", func() {
		a.tileRow(c, "rules-own", a.coinsTile(c, false), a.L.T("peers.rules.own.title"), a.L.T("peers.rules.own.line", senderDaily), nil)
		a.tileRow(c, "rules-team", a.peerTile(c, "", ""), a.L.T("peers.rules.team.title"), a.L.T("peers.rules.team.line"), nil)
		for _, agent := range p.Muted {
			agent := agent
			a.tileRow(c, "muted:"+agent, a.toolTile(c, peerName(agent)), a.L.T("peers.muted", agent), "", func() {
				if a.quietButton(c, "muted:"+agent, a.L.T("peers.muted.undo"), agent, false, 0) {
					next := *p
					next.Muted = without(p.Muted, agent)
					a.SetSettings(protocol.SettingsPatch{Peers: &next})
				}
			})
		}
	})
}

// peerOriginLine is where the partner's words came from (D470): its coin and the agent, one quiet
// line over the bubble; it opens Agent messaging.
func (a *App) peerOriginLine(c *ui.Context, b *protocol.BridgeMsg, seq int64) {
	t := a.T
	text := capPeer(a.L.T("peer.origin", a.peerWhoOf(b)))
	r := ui.Row(c.Key("peer-origin:"+itoa(seq))).Gap(6).AlignItems(ui.Center).Padding(0, 0, 4, 4).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(text).Focusable()
	r.Children(func() {
		name, host := peerCalled(b)
		h := peerHarness(name)
		if h == "peer" && host != "" {
			h = peerHarness(host)
		}
		if bmp := theme.Clay(coinArt(h, false)); bmp != nil {
			ui.Image(c, bmp).Size(18, 18).AccessHidden(true)
		}
		uiText(c, text).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
	})
	if r.Clicked() {
		a.Route = RouteSettings
		a.openTab(TabPeers)
	}
}
