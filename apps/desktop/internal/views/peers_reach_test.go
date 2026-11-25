package views

import (
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D433: the same rules as apps/web/test/mem-bridge-d433.test.ts.
func TestReachRows(t *testing.T) {
	h := func(name, mem string) protocol.DeviceHarness {
		x := protocol.DeviceHarness{Harness: name, Installed: true, LoggedIn: true}
		if mem != "" {
			x.Mem = &protocol.MemPluginView{State: mem}
		}
		return x
	}
	devs := []protocol.DeviceView{
		{ID: "hel", Name: "hel", Harnesses: []protocol.DeviceHarness{h("pi", "installed")}},
		{ID: "local", Name: "Mac", Home: true, Harnesses: []protocol.DeviceHarness{h("codex", "installed"), h("claude-code", "absent"), h("antigravity", "")}},
	}
	got := reachRows(devs, nil, nil)
	// D555: Antigravity's plugin carries Bridge and Mem's plugin check doesn't list it (unknown); D576: pi stands as the others, from its plugin.
	want := [][3]string{{"claude-code", "install", "local"}, {"codex", "yes", "local"}, {"antigravity", "unknown", ""}, {"pi", "yes", "hel"}}
	if len(got) != len(want) {
		t.Fatalf("rows %+v", got)
	}
	for i, w := range want {
		if got[i].Harness != w[0] || got[i].Can != w[1] || got[i].Device != w[2] {
			t.Fatalf("row %d: %+v, want %v", i, got[i], w)
		}
	}
	r := reachRows(nil, []string{"claude-code"}, []handoff{{Agent: "你的 Claude Code（终端）", At: "2026-11-20T08:00:00Z"}})
	if len(r) != 1 || r[0].Can != "yes" || r[0].Last != "2026-11-20T08:00:00Z" {
		t.Fatalf("own records %+v", r)
	}
	if r := reachRows(nil, []string{"codex"}, nil); len(r) != 1 || r[0].Can != "unknown" {
		t.Fatalf("unknown %+v", r)
	}
	// D576: a pi known only from the person's own records: Mem's check hasn't said about its plugin.
	if r := reachRows(nil, []string{"pi"}, nil); len(r) != 1 || r[0].Can != "unknown" {
		t.Fatalf("own records only %+v", r)
	}
	// D576: pi's plugin is the fact: 0.8.20+ hands work and reads the reply when asked (ask);
	// 0.8.19, with the newer one out (the floor core lays), can't pass a message: its update (talk).
	pi := func(state, v string) []protocol.DeviceView {
		return []protocol.DeviceView{{ID: "local", Name: "Mac", Home: true, Harnesses: []protocol.DeviceHarness{{Harness: "pi", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: state, Version: v}}}}}
	}
	if r := reachRows(pi("installed", "0.8.20"), nil, nil); len(r) != 1 || r[0].Back != "yes" || standing(r[0]) != "ask" {
		t.Fatalf("pi 0.8.20 %+v", r)
	}
	if r := reachRows(pi("update", "0.8.19"), nil, nil); len(r) != 1 || r[0].Back != "old" || !r[0].Update || standing(r[0]) != "talk" || reachWays(r[0]) != (ways{"no", "no", "update"}) {
		t.Fatalf("pi 0.8.19 %+v", r)
	}
	if r := reachRows(pi("absent", ""), nil, nil); len(r) != 1 || standing(r[0]) != "install" || r[0].Device != "local" {
		t.Fatalf("pi absent %+v", r)
	}
	// D555: Antigravity as Claude Code and Codex: yes once Mem lists its mailbox open.
	if r := reachRows(nil, []string{"antigravity"}, nil, protocol.BridgeMailbox{Harness: "antigravity", Open: true}); len(r) != 1 || r[0].Can != "yes" || r[0].Box != "open" {
		t.Fatalf("antigravity %+v", r)
	}
	if len(reachRows(nil, nil, nil)) != 0 {
		t.Fatal("nothing run, no rows")
	}
}

func TestRecentSaysWhatHasntGone(t *testing.T) {
	e := func(seq int64, p protocol.BridgeMsg) *store.Entry {
		return &store.Entry{Event: protocol.LogEvent{Seq: seq, TS: "2026-11-20T08:00:00Z"}, Peer: &p}
	}
	ch := []*store.Entry{e(1, protocol.BridgeMsg{Direction: "in", Agent: "Codex", Text: "测试"}), e(5, protocol.BridgeMsg{Direction: "out", Agent: "Codex", Text: "好的", State: "sent"})}
	ops := map[string]*store.Entry{
		"op1": e(3, protocol.BridgeMsg{Direction: "out", Agent: "Codex", Text: "收到了", State: "failed", OpID: "op1"}),
		"op2": e(4, protocol.BridgeMsg{Direction: "out", Agent: "Codex", Text: "PR 好了吗", State: "unknown", DecisionID: "d1", OpID: "op2"}),
		"op3": e(5, protocol.BridgeMsg{Direction: "out", Agent: "Codex", Text: "好的", State: "sent", OpID: "op3"}),
	}
	got := recentHandoffs(ch, 5, ops)
	want := []string{"5 replied ", "4 sent unknown", "3 replied failed", "1 in "}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i, h := range got {
		if s := itoa(h.Seq) + " " + h.Way + " " + h.State; s != want[i] {
			t.Fatalf("%d: %q want %q", i, s, want[i])
		}
	}
}

func TestAwayAndThreadWords(t *testing.T) {
	now := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)
	if awayFor(0, now) || awayFor(now.Add(-time.Hour).UnixMilli(), now) || !awayFor(now.Add(-72*time.Hour).UnixMilli(), now) {
		t.Fatal("away is over a day since Mem saw it")
	}
	for _, l := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(l)
		for _, k := range []string{"peers.agents.title", "peers.st.both", "peers.st.install", "peers.st.unknown", "peers.st.none", "peers.out.sending", "peers.out.unknown", "peers.out.unconfirmed", "peers.out.failed", "peers.elsewhere.away", "peers.away", "recall.thread", "recall.thread.any", "recall.from.thread", "recall.thread.why"} {
			if v := L.T(k); v == "" || v == k {
				t.Fatalf("%s: %s missing", l, k)
			}
		}
		r := protocol.MemoryRecalled{By: "tool", From: "Codex", Thread: true, Date: "2026-11-12"}
		if s := recallLineText(L, r, now); s == "" || !strings.Contains(s, "Codex") {
			t.Fatalf("%s: thread line %q", l, s)
		}
	}
}

// Pictures of the D433 pane and line on the Mac, zh and en:
//
//	DUCTER_MEM_BRIDGE_SHOTS=/path/to/.shots/mem-bridge go test ./internal/views -run MemBridgeShots
func TestMemBridgeShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEM_BRIDGE_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEM_BRIDGE_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		pick := func(a, b string) string {
			if zh {
				return a
			}
			return b
		}
		for _, st := range []string{"reach", "away", "recall", "relay"} {
			app, _ := memApp(t, lang, "on")
			seq := int64(100)
			ev := func(kind string, origin protocol.Origin, body any) int64 {
				seq++
				raw, _ := json.Marshal(body)
				app.S.ApplyEvent(protocol.LogEvent{Seq: seq, TS: time.Now().Add(-time.Duration(200-seq) * time.Minute).UTC().Format(time.RFC3339), Stream: "channel", Origin: origin, Kind: kind, Body: raw})
				return seq
			}
			tab := TabPeers
			switch st {
			case "reach":
				app.S.Devices = []protocol.DeviceView{{ID: "local", Name: "Ada's MacBook Air", Home: true, Harnesses: []protocol.DeviceHarness{
					{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}},
					{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed"}},
					{Harness: "antigravity", Installed: true, LoggedIn: true},
				}}}
				who := map[string]any{"from": "another agent", "mine": true, "agent": "Codex", "role": pick("Mem 协作", "Mem helper"), "selfNamed": true}
				with := func(m map[string]any) map[string]any {
					for k, v := range who {
						m[k] = v
					}
					return m
				}
				ev("bridge_msg", "peer", with(map[string]any{"direction": "in", "messageId": "m1", "text": pick("PR #412 的 benchmark 重跑完了，帮我看下结果有没有回退", "The benchmark rerun for PR #412 is done; check whether it regressed")}))
				ev("bridge_msg", "partner", with(map[string]any{"direction": "out", "messageId": "m-o1", "to": "another agent", "opId": "o1", "state": "sent", "inReplyTo": "m1", "text": pick("看过了：p99 从 41 ms 到 43 ms，在噪声里，没有回退。", "Checked: p99 went from 41 ms to 43 ms, within noise; no regression.")}))
				ev("bridge_msg", "partner", with(map[string]any{"direction": "out", "messageId": "", "to": "another agent", "opId": "o2", "state": "unknown", "decisionId": "d1", "text": pick("那个 flaky 的 recall 测试你今晚还改吗？", "Are you still fixing the flaky recall test tonight?")}))
				ev("bridge_msg", "partner", map[string]any{"direction": "out", "messageId": "", "to": "another agent", "mine": true, "agent": "Claude Code", "role": pick("终端", "terminal"), "selfNamed": true, "opId": "o3", "state": "failed", "text": pick("收到，我接着盯 CI。", "Got it, I'll keep an eye on CI.")})
			case "relay":
				// D448: Ducter's Antigravity and pi tasks pass messages through Ducter.
				app.S.Devices = []protocol.DeviceView{{ID: "local", Name: "Ada's MacBook Air", Home: true, Harnesses: []protocol.DeviceHarness{
					{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed"}},
					{Harness: "pi", Installed: true, LoggedIn: true},
					{Harness: "antigravity", Installed: true, LoggedIn: true},
				}}}
				if app.S.Tasks == nil {
					app.S.Tasks = map[string]*store.Task{}
				}
				app.S.Tasks["t_agy"] = &store.Task{Card: &protocol.TaskCard{TaskID: "t_agy", Title: pick("修 Linux 上的 runner 测试", "Fix the runner tests on Linux"), Harness: "antigravity"}}
				codex := map[string]any{"from": "codex-mem", "mine": true, "agent": "Codex", "role": pick("Mem 协作", "Mem helper"), "selfNamed": true, "taskId": "t_agy"}
				with := func(m map[string]any) map[string]any {
					for k, v := range codex {
						m[k] = v
					}
					return m
				}
				ev("bridge_msg", "partner", with(map[string]any{"direction": "out", "messageId": "m-r1", "to": "codex-mem", "by": "task", "decisionId": "d1", "opId": "r1", "state": "sent", "text": pick("live.test.ts 在 Linux 上为什么要跳过 open？是你上周改的吗？", "Why does live.test.ts skip open on Linux? Was that your change last week?")}))
				ev("bridge_msg", "peer", with(map[string]any{"direction": "in", "messageId": "m-a1", "inReplyTo": "m-r1", "state": "task", "text": pick("是我改的：Linux 上没有 open，CI 镜像里用 xdg-open。", "Yes, mine: Linux has no open; the CI image uses xdg-open.")}))
				ev("bridge_msg", "partner", with(map[string]any{"direction": "out", "messageId": "m-r2", "to": "codex-mem", "by": "task", "opId": "r2", "state": "sent", "text": pick("好，那镜像里装了 xdg-utils 吗？", "OK, is xdg-utils in that image?")}))
			case "away":
				app.S.Bridge = &protocol.BridgeView{State: "elsewhere", Identity: "ducter", Version: "0.10.121", Others: []protocol.BridgeOther{{Label: "ducter-on-hel-3fa91c", Home: "hel", SeenAt: time.Now().Add(-74 * time.Hour).UnixMilli()}}}
			case "recall":
				tab = ""
				u := ev("user_msg", "user", map[string]any{"text": pick("我上次怎么修的那个 recall 测试老挂的问题？", "How did I fix that flaky recall test last time?")})
				m := ev("ai_msg", "partner", map[string]any{"text": pick("是索引还没建好就开始查了。你让测试先等 indexReady()，再发第一个查询，之后就没再挂过。", "It queried before the index was built. You made the test await indexReady() before its first query, and it hasn't failed since."), "replyTo": u})
				ev("memory_recalled", "partner", map[string]any{"memoryId": "t_flaky", "title": pick("修 recall 测试的偶发失败", "Fix flaky recall test"), "by": "tool", "from": "Codex", "thread": true, "date": time.Now().Add(-8 * 24 * time.Hour).Format("2006-01-02"), "aboutSeq": m, "replyTo": u})
				app.recall.open = seq
			}
			if tab != "" {
				app.openTab(tab)
			}
			tt := ui.NewTesterWith(app.View, 1280, 1640, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1280-%s-%s.png", lang, st)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}

// D448: a task's own exchanges join Recently by the task's name (the web's
// bridge-relay-d448.test.ts).
func TestTaskExchangesInRecently(t *testing.T) {
	e := func(seq int64, p protocol.BridgeMsg) *store.Entry {
		return &store.Entry{Event: protocol.LogEvent{Seq: seq, TS: "2026-11-21T08:00:00Z"}, Peer: &p}
	}
	ch := []*store.Entry{e(1, protocol.BridgeMsg{Direction: "out", Agent: "Codex", Text: "为什么跳过 open？", By: "task", TaskID: "t1", DecisionID: "d1", State: "sent"})}
	task := []*store.Entry{
		e(2, protocol.BridgeMsg{Direction: "in", Agent: "Codex", Text: "用 xdg-open。", InReplyTo: "bm-o1", TaskID: "t1", State: "task"}),
		e(3, protocol.BridgeMsg{Direction: "out", Agent: "Codex", Text: "镜像里有 xdg-utils 吗？", By: "task", TaskID: "t1", State: "sent"}),
		e(1, protocol.BridgeMsg{Direction: "out", Agent: "Codex", Text: "为什么跳过 open？", By: "task", TaskID: "t1", DecisionID: "d1", State: "sent"}),
	}
	got := recentHandoffs(peerFeed(ch, task), 5)
	want := []string{"3 tasksent t1", "2 taskin t1", "1 tasksent t1"}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i, h := range got {
		if s := itoa(h.Seq) + " " + h.Way + " " + h.TaskID; s != want[i] {
			t.Fatalf("%d: %q want %q", i, s, want[i])
		}
	}
}
