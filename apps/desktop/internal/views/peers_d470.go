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
// partner saying who reaches it; 谁能找到谁 / Who reaches whom is a picture per agent (its coin, the
// two ways drawn and said, the partner in its pose) with each broken way's real fix; 来往 / Back and
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
		if r.Box == "closed" {
			w := ways{To: "yes", Back: "no"}
			if r.Device != "" {
				w.Fix = "mailbox"
			}
			return w
		}
		if r.Box == "open" {
			return ways{To: "yes", Back: "yes"}
		}
		return ways{To: "yes", Back: "unknown"}
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
		if r.Harness != "claude-code" && r.Harness != "codex" {
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
	Seq     int64
	At      string
	Way     string
	Words   string
	TaskID  string
	Outcome exOutcome
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
			item = exItem{Seq: e.Event.Seq, At: e.Event.TS, Way: "in", Words: words, TaskID: p.TaskID, Outcome: oc}
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
			item = exItem{Seq: e.Event.Seq, At: e.Event.TS, Way: way, Words: words, TaskID: p.TaskID, Outcome: oc}
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
		if p == nil || p.Direction != "in" || p.State != "" || (p.MessageID != "" && asked(p.MessageID)) {
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

// peersOneWay is the agents whose answers can't get back (Mem lists their mailbox closed), each
// with the computer its fix runs on, less the ones this window already asked to open.
func (a *App) peersOneWay() []reachRow {
	if !a.peersOn() {
		return nil
	}
	_, one, _ := reachSplit(a.peersReachRows())
	var out []reachRow
	for _, r := range one {
		if r.Device != "" && !a.mailboxOpening[r.Device+":"+r.Harness] {
			out = append(out, r)
		}
	}
	return out
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
	both, one, notYet := reachSplit(a.peersReachRows())
	switch {
	case len(both) > 0:
		return a.L.T("say.peers.both", a.listWords(toolsOf(both)))
	case len(one) > 0:
		return a.L.T("say.peers.oneway")
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

// openMailbox is 打开它的信箱 / Open its mailbox: one task on that computer opens the agent's
// Nowledge Mem mailbox (the tap is its Go).
func (a *App) openMailbox(device, harness string) {
	if a.mailboxOpening == nil {
		a.mailboxOpening = map[string]bool{}
	}
	a.mailboxOpening[device+":"+harness] = true
	a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: device, Harness: harness, What: "mailbox"})
}

// drawLinkWay is one way between an agent and the partner (never a font's arrow): solid with its
// head when it goes; dashed with none while it doesn't.
func drawLinkWay(col ui.Color, state string, back bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		y := r.Y + r.H/2
		l, rt := r.X+2, r.X+r.W-2
		if state != "yes" {
			var m ui.Path
			for x := l + 2; x < rt-2; x += 16 {
				e := x + 9
				if e > rt-2 {
					e = rt - 2
				}
				m.MoveTo(x, y)
				m.LineTo(e, y)
			}
			p.StrokePath(&m, 2, col)
			return
		}
		drawWay(col, back)(p, r)
	}
}

// peersMap is 谁能找到谁 / Who reaches whom: one link row per agent the person runs.
func (a *App) peersMap(c *ui.Context, name string) {
	rows := a.peersReachRows()
	if len(rows) == 0 {
		return
	}
	a.group(c, "peers-map", a.L.T("peers.map.title"), "", func() {
		for _, r := range rows {
			a.peerLinkRow(c, r, name)
		}
	})
}

// peerLinkRow is one agent: its coin and name (and when it last came), the two ways said and drawn,
// the partner in its pose (its flag when the link is half-broken), and under it why and the fix.
func (a *App) peerLinkRow(c *ui.Context, r reachRow, name string) {
	t := a.T
	w := reachWays(r)
	opening := r.Device != "" && a.mailboxOpening[r.Device+":"+r.Harness]
	broken := w.Fix == "mailbox" && !opening
	why := ""
	switch {
	case w.Fix == "mailbox" && opening:
		why = a.L.T("peers.why.opening")
	case w.Fix == "mailbox":
		where := r.DeviceName
		if where == "" {
			where = r.Device
		}
		why = a.L.T("peers.why.mailbox", where)
	case w.Fix == "install":
		why = a.L.T("peers.why.install")
	case r.Can == "unknown":
		why = a.L.T("peers.why.unknown")
	case r.Can == "none":
		why = a.L.T("peers.reach.none")
	case r.Can == "relay":
		why = a.L.T("peers.reach.relay", name, r.Tool)
	}
	last := ""
	if r.Last != "" && w.To == "yes" {
		if s := a.agoLong(r.Last); s != "" {
			last = a.L.T("peers.last", s)
		}
	}
	pose := theme.Idle
	switch {
	case broken:
		pose = theme.NeedsYou
	case w.To == "yes" && w.Back == "yes":
		pose = theme.Done
	}
	wayInk := func(s string) ui.Color {
		switch {
		case s == "yes":
			return t.InkSoft
		case s == "no" && broken:
			return t.NeedsYou.Ink
		case s == "no":
			return t.InkMuted
		}
		return t.Line
	}
	labelInk := func(s string) ui.Color {
		switch {
		case s == "yes":
			return t.InkSoft
		case s == "no" && broken:
			return t.NeedsYou.Ink
		}
		return t.InkMuted
	}
	toL, backL := a.L.T("peers.way.to."+w.To, name), a.L.T("peers.way.back."+w.Back, name)
	a.sep(c)
	ui.Column(c.Key("link:"+r.Harness)).Gap(t.S2).Padding(t.S4, t.S5).Role(ui.RoleGroup).Label(r.Tool + ": " + toL + "; " + backL).Children(func() {
		end := func(key string, body func()) {
			ui.Column(c.Key(key)).Width(96).Shrink(0).Gap(4).AlignItems(ui.Center).Children(body)
		}
		ui.Row(c.Key("pic")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			end("agent", func() {
				a.clayTile(c, coinArt(r.Harness, r.Can == "none"), false)()
				uiText(c, r.Tool).FontSize(t.SM).FontWeight(600).TextAlign(ui.Center)
				if last != "" {
					uiText(c, last).FontSize(t.XS).TextColor(t.InkMuted).TextAlign(ui.Center)
				}
			})
			ui.Column(c.Key("ways")).Grow(1).Basis(0).MinWidth(0).Gap(t.S2).AccessHidden(true).Children(func() {
				label := func(s, st string) {
					wgt := 600
					if st != "yes" {
						wgt = 500
					}
					uiText(c, s).FontSize(t.SM).FontWeight(wgt).TextColor(labelInk(st)).TextAlign(ui.Center)
				}
				ui.Column(c.Key("to")).Gap(2).Children(func() {
					label(toL, w.To)
					ui.Box(c).Height(12).Draw(drawLinkWay(wayInk(w.To), w.To, false))
				})
				ui.Column(c.Key("back")).Gap(2).Children(func() {
					ui.Box(c).Height(12).Draw(drawLinkWay(wayInk(w.Back), w.Back, true))
					label(backL, w.Back)
				})
			})
			end("me", func() {
				a.avatar(c, pose, 40)
				uiText(c, name).FontSize(t.SM).FontWeight(600).TextAlign(ui.Center)
			})
		})
		if why == "" {
			return
		}
		ink := t.InkSoft
		if broken {
			ink = t.NeedsYou.Ink
		}
		ui.Row(c.Key("why")).Gap(t.S3).Wrap().AlignItems(ui.Center).Padding(0, 0, 0, 96+t.S3).Children(func() {
			uiText(c, keepWords(autospace(why))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(ink).Grow(1).Basis(rowWordsMin).MinWidth(0)
			switch {
			case broken:
				if a.buttonFor(c, a.L.T("peers.fix.mailbox"), r.Tool, btnSecondary, t.ControlSM, t.Surface) {
					a.openMailbox(r.Device, r.Harness)
				}
			case w.Fix == "install":
				if a.buttonFor(c, a.L.T("peers.try.plugin.go"), r.DeviceName, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.MemPluginInstall{T: "mem_plugin_install", Device: r.Device, Harness: r.Harness})
				}
			}
		})
	})
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
		if when != "" {
			uiText(c, when).FontSize(t.SM).FontWeight(600).TextColor(whenInk).SingleLine().Shrink(0)
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
