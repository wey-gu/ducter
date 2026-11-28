package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D470: the same rules as apps/web/test/d470.test.ts.
func TestD470ReachWays(t *testing.T) {
	cases := []struct {
		r    reachRow
		want ways
	}{
		{reachRow{Harness: "codex", Can: "yes", Box: "open"}, ways{"yes", "yes", ""}},
		{reachRow{Harness: "claude-code", Can: "yes", Back: "old", Update: true, Device: "local"}, ways{"yes", "no", "update"}},
		{reachRow{Harness: "claude-code", Can: "yes", Back: "old"}, ways{"yes", "no", ""}},
		{reachRow{Harness: "codex", Can: "yes"}, ways{"yes", "unknown", ""}},
		{reachRow{Harness: "codex", Can: "install", Device: "local"}, ways{"no", "no", "install"}},
		{reachRow{Harness: "codex", Can: "unknown"}, ways{"unknown", "unknown", ""}},
		{reachRow{Harness: "pi", Can: "relay"}, ways{"no", "no", ""}},
		// D576: pi's older plugin can't write either; its update is the fix.
		{reachRow{Harness: "pi", Can: "yes", Back: "old", Update: true, Device: "local"}, ways{"no", "no", "update"}},
		{reachRow{Harness: "pi", Can: "yes", Back: "yes"}, ways{"yes", "yes", ""}},
	}
	for _, c := range cases {
		if got := reachWays(c.r); got != c.want {
			t.Errorf("%+v: %+v, want %+v", c.r, got, c.want)
		}
	}
	both, one, notYet := reachSplit([]reachRow{cases[0].r, cases[1].r, cases[7].r, cases[8].r})
	if len(both) != 2 || len(one) != 1 || len(notYet) != 1 {
		t.Fatalf("split %v %v %v", both, one, notYet)
	}
}

func d470Feed() []*store.Entry {
	var seq int64
	at := func(h int) string { return time.Date(2026, 11, 22, h, 0, 0, 0, time.UTC).Format(time.RFC3339) }
	peer := func(h int, b protocol.BridgeMsg) *store.Entry {
		seq++
		return &store.Entry{Event: protocol.LogEvent{Seq: seq, TS: at(h)}, Peer: &b}
	}
	codex := func(b protocol.BridgeMsg) protocol.BridgeMsg {
		b.Mine, b.Agent, b.SelfNamed, b.Role = true, "Codex", true, "Mem 协作"
		return b
	}
	cc := func(b protocol.BridgeMsg) protocol.BridgeMsg { b.Mine, b.Agent = true, "Claude Code"; return b }
	es := []*store.Entry{
		peer(1, codex(protocol.BridgeMsg{Direction: "in", MessageID: "a", Text: "重跑 benchmark"})),
		peer(1, codex(protocol.BridgeMsg{Direction: "out", MessageID: "c", InReplyTo: "a", TaskID: "t1", Text: "接下了", OpID: "o1", State: "sent"})),
		peer(2, codex(protocol.BridgeMsg{Direction: "in", MessageID: "b", Text: "怎么修的？"})),
		peer(2, codex(protocol.BridgeMsg{Direction: "out", MessageID: "r", InReplyTo: "b", Text: "先等 indexReady()", OpID: "o2", State: "sent"})),
		peer(3, cc(protocol.BridgeMsg{Direction: "out", MessageID: "q", DecisionID: "d", Text: "今晚还修吗？", OpID: "o3", State: "sent"})),
		peer(4, cc(protocol.BridgeMsg{Direction: "in", MessageID: "x", Text: "CI 红了"})),
		peer(5, codex(protocol.BridgeMsg{Direction: "in", MessageID: "k", Text: "要你定"})),
		peer(6, codex(protocol.BridgeMsg{Direction: "in", MessageID: "h", Text: "发布清单"})),
	}
	seq++
	// D667 (research/247 Brief A): the origin goes to the message whose ReplyTo is the request.
	es = append(es, &store.Entry{Event: protocol.LogEvent{Seq: seq, TS: at(6)}, AI: &protocol.AIMsg{Text: "你的 Codex 把发布清单发过来了", ReplyTo: 8}})
	return es
}

func TestD470Threads(t *testing.T) {
	failed := protocol.BridgeMsg{Direction: "out", InReplyTo: "x", Mine: true, Agent: "Claude Code", Text: "是昨晚的改动", OpID: "o4", State: "failed"}
	ops := map[string]*store.Entry{"o4": {Event: protocol.LogEvent{Seq: 99, TS: "2026-11-22T04:30:00Z"}, Peer: &failed}}
	decs := map[string]*store.DecisionState{"dk": {Decision: protocol.Decision{Asker: &protocol.PeerAsk{MessageID: "k"}}}}
	th := exchangeThreads(d470Feed(), ops, decs, 3)
	if len(th) != 2 || th[0].Agent != "Codex" || th[1].Agent != "Claude Code" {
		t.Fatalf("threads %+v", th)
	}
	var kinds []string
	for _, x := range th[0].Items {
		kinds = append(kinds, x.Outcome.Kind)
	}
	if got := kinds; len(got) != 3 || got[0] != "told" || got[1] != "card" || got[2] != "replied" {
		t.Fatalf("codex outcomes %v", got)
	}
	if all := exchangeThreads(d470Feed(), ops, decs, 9)[0].Items; all[len(all)-1].Outcome != (exOutcome{Kind: "task", TaskID: "t1"}) {
		t.Fatalf("task %+v", all[len(all)-1])
	}
	if o := th[1].Items[0].Outcome; o.Kind != "replied" || o.State != "failed" {
		t.Fatalf("claude code reply %+v", o)
	}
	if o := th[1].Items[1]; o.Way != "asked" || o.Outcome.Kind != "waiting" {
		t.Fatalf("asked %+v", o)
	}
	if trustOf(th[0], &protocol.Peers{Trusted: []string{"Codex"}}) != "trusted" || trustOf(th[1], &protocol.Peers{}) != "own" || trustOf(exThread{Agent: "reviewer"}, nil) != "team" {
		t.Fatal("trust")
	}
}

func TestD470Spoken(t *testing.T) {
	es := d470Feed()
	hidden, origin := spokenPeers(es, func(string) bool { return false })
	if len(hidden) != 1 || !hidden[8] || origin[9] == nil || origin[9].MessageID != "h" {
		t.Fatalf("hidden %v origin %v", hidden, origin)
	}
	if h, _ := spokenPeers(es, func(id string) bool { return id == "h" }); len(h) != 0 {
		t.Fatal("a card keeps the line")
	}
}

// D667 (research/247 Brief A): a later message for the person carries no origin and keeps
// the request's line; only the message whose ReplyTo is that request takes it.
func TestD470OriginFollowsReplyTo(t *testing.T) {
	es := d470Feed()
	es[8].AI.ReplyTo = 0
	hidden, origin := spokenPeers(es, func(string) bool { return false })
	if len(hidden) != 0 || len(origin) != 0 {
		t.Fatalf("a message for the person drew hidden %v origin %v", hidden, origin)
	}
}

// D296: 改成先问你, 不再听它的 and 恢复 each keep the partner's one word, and each says it only after
// the home's settings frame shows the change (never on the tap).
func TestD296PeersTrustSaid(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := iaApp(t, lang)
		app.Status = 2
		f := settingsFrame()
		f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{"Codex"}, Muted: []string{}}
		f.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter"}
		app.Receive(f)
		es := d470Feed()
		for _, e := range es {
			if e.Peer != nil && e.Peer.Agent == "Claude Code" {
				e.Peer.Mine = false
			}
		}
		app.S.Channel = es
		app.openTab(TabPeers)
		tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		L := app.L
		// 改成先问你: a trusted agent's work now waits for the person.
		if err := tt.Click(spoken(L, L.T("peers.trust.ask"), "Codex")); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		if _, ok := lastFrame[protocol.SettingsSet](sent); !ok {
			t.Fatalf("%s: the trust change didn't go", lang)
		}
		if w := app.settings.said["peer-trust:Codex"].text; w != "" {
			t.Errorf("%s: the word came before the home answered: %q", lang, w)
		}
		f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
		app.Receive(f)
		tt.Frame()
		if w, want := app.settings.said["peer-trust:Codex"].text, L.T("said.peers.trust.ask", "Codex"); w != want {
			t.Errorf("%s: 改成先问你 said %q, want %q", lang, w, want)
		}
		saidShot(t, tt, "peers-ask-"+string(lang))
		if !hasText(tt, L.T("said.peers.trust.ask", "Codex")) {
			t.Errorf("%s: 改成先问你's word isn't drawn: %q", lang, tt.Texts())
		}
		// 不再听它的: a teammate's agent stops being heard.
		if err := tt.Click(spoken(L, L.T("peers.trust.mute"), "Claude Code")); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{"Claude Code"}}
		app.Receive(f)
		tt.Frame()
		if w, want := app.settings.said["peer-trust:Claude Code"].text, L.T("said.peers.trust.mute", "Claude Code"); w != want {
			t.Errorf("%s: 不再听它的 said %q, want %q", lang, w, want)
		}
		saidShot(t, tt, "peers-mute-"+string(lang))
		// 恢复: it may reach the partner again.
		if err := tt.Click(spoken(L, L.T("peers.muted.undo"), "Claude Code")); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
		app.Receive(f)
		tt.Frame()
		if w, want := app.settings.said["peer-undo"].text, L.T("said.peers.trust.undo", "Claude Code"); w != want {
			t.Errorf("%s: 恢复 said %q, want %q", lang, w, want)
		}
		saidShot(t, tt, "peers-undo-"+string(lang))
		if !hasText(tt, L.T("said.peers.trust.undo", "Claude Code")) {
			t.Errorf("%s: 恢复's word isn't drawn: %q", lang, tt.Texts())
		}
	}
}

// research/244 §5.2: Ducter's own local traffic is no line and no origin.
func TestD470LocalTrafficIsNotConversation(t *testing.T) {
	if !peerInConversation(&protocol.BridgeMsg{}) || peerInConversation(&protocol.BridgeMsg{Local: true}) {
		t.Fatal("local traffic must not be a conversation line")
	}
	es := d470Feed()
	es[7].Peer.Local = true
	hidden, origin := spokenPeers(es, func(string) bool { return false })
	if len(hidden) != 0 || len(origin) != 0 {
		t.Fatalf("local traffic drew hidden %v origin %v", hidden, origin)
	}
}
