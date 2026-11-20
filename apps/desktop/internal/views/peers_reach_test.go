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
	want := [][3]string{{"claude-code", "install", "local"}, {"codex", "yes", ""}, {"pi", "none", ""}, {"antigravity", "none", ""}}
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
		for _, k := range []string{"peers.reach.title", "peers.reach.yes", "peers.reach.install", "peers.reach.unknown", "peers.reach.none", "peers.out.sending", "peers.out.unknown", "peers.out.unconfirmed", "peers.out.failed", "peers.elsewhere.away", "peers.away", "recall.thread", "recall.thread.any", "recall.from.thread", "recall.thread.why"} {
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
		for _, st := range []string{"reach", "away", "recall"} {
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
