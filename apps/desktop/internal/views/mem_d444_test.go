package views

import (
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D444: the same rules as apps/web/test/mem-d444.test.ts: Mem's contact
// list's word on a mailbox (D560: only "open" is a fact), and what a message handed over from Mem.
func TestReachRowsMailboxes(t *testing.T) {
	devs := []protocol.DeviceView{{ID: "local", Name: "Mac", Home: true, Harnesses: []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed"}},
	}}}
	r := reachRows(devs, nil, nil, protocol.BridgeMailbox{Harness: "claude-code", Open: false}, protocol.BridgeMailbox{Harness: "codex", Open: true}, protocol.BridgeMailbox{Harness: "pi", Open: true})
	if len(r) != 3 || r[0].Box != "" || r[0].Can != "yes" || r[1].Harness != "codex" || r[1].Can != "yes" || r[1].Box != "open" || r[2].Can != "none" || r[2].Box != "" {
		t.Fatalf("rows %+v", r)
	}
	if r := reachRows(nil, nil, nil); len(r) != 0 {
		t.Fatalf("nothing listed, no rows: %+v", r)
	}
}

func TestRefWords(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := memApp(t, lang, "on")
		refs := []protocol.BridgeRef{{URI: "nowledgemem://artifacts/a1", Title: "HawDB 0.9", Kind: "artifact"}}
		got := withRefTitles(app, "清单在 nowledgemem://artifacts/a1 ，看下", refs)
		want := map[i18n.Lang]string{i18n.ZH: "清单在 「HawDB 0.9」 ，看下", i18n.EN: "清单在 “HawDB 0.9” ，看下"}[lang]
		if got != want {
			t.Fatalf("%s: %q", lang, got)
		}
		if w := refWords(app, protocol.BridgeRef{Title: "Release plan", Kind: "plan"}); w != app.L.T("peers.ref.plan", "Release plan") {
			t.Fatalf("%s: plan %q", lang, w)
		}
		if w := refWords(app, protocol.BridgeRef{Kind: "memory"}); w != app.L.T("peers.ref.none.memory") || w == "peers.ref.none.memory" {
			t.Fatalf("%s: untitled %q", lang, w)
		}
	}
}

func TestMemD444Shots(t *testing.T) {
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
		for _, st := range []string{"day", "boxes", "memory"} {
			app, _ := memApp(t, lang, "on")
			seq := int64(100)
			ev := func(kind string, origin protocol.Origin, body any) int64 {
				seq++
				raw, _ := json.Marshal(body)
				app.S.ApplyEvent(protocol.LogEvent{Seq: seq, TS: time.Now().Add(-time.Duration(200-seq) * time.Minute).UTC().Format(time.RFC3339), Stream: "channel", Origin: origin, Kind: kind, Body: raw})
				return seq
			}
			tab := ""
			switch st {
			case "day":
				ev("bridge_msg", "peer", map[string]any{"direction": "in", "messageId": "m1", "from": "another agent", "mine": true, "agent": "Codex", "role": pick("Mem 协作", "Mem helper"), "selfNamed": true,
					"text": pick("0.9 的发布清单放在 nowledgemem://artifacts/a1 了，打 tag 前帮我过一遍。", "The 0.9 release checklist is at nowledgemem://artifacts/a1; look it over before I tag."),
					"refs": []map[string]any{{"uri": "nowledgemem://artifacts/a1", "title": pick("HawDB 0.9 发布清单", "HawDB 0.9 release checklist"), "kind": "artifact"}}})
				ev("ai_msg", "partner", map[string]any{"text": pick("你的 Codex 把 HawDB 0.9 的发布清单发过来了，让我在打 tag 前过一遍。三步都齐，只差重跑基准。要我现在去跑吗？", "Your Codex sent over the HawDB 0.9 release checklist to look over before tagging. All three steps are there; only the benchmark rerun is left. Shall I run it now?")})
				a := ev("user_msg", "user", map[string]any{"text": pick("你都记得我些什么？", "What do you know about me?")})
				ev("ai_msg", "partner", map[string]any{"replyTo": a, "text": pick("你习惯先看结论、细节放后面，周报每周五下午发给产品组。写 JS 只用 pnpm，测试里一律用假时钟，HawDB 的压测找 Alice。哪条不对、或者不想让我记着，跟我说一声就好。", "You like the conclusion first and the details after, and your weekly report goes to the product team on Friday afternoons. You use pnpm, never npm, fake clocks in tests, and Alice runs the HawDB load tests. If any of that is wrong, or you'd rather I didn't keep it, just tell me.")})
				u := ev("user_msg", "user", map[string]any{"text": pick("以后我的 commit message 都用英文写。", "From now on, my commit messages are in English.")})
				ev("ai_msg", "partner", map[string]any{"replyTo": u, "text": pick("好，以后都用英文。", "Got it, English from now on.")})
				ev("memory_noted", "partner", map[string]any{"title": pick("commit message 都用英文写", "Commit messages in English"), "memoryId": "m-commit", "replyTo": u})
			case "boxes":
				tab = TabPeers
				app.S.Devices = []protocol.DeviceView{{ID: "local", Name: "Ada's MacBook Air", Home: true, Harnesses: []protocol.DeviceHarness{
					{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed"}},
					{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed"}},
					{Harness: "antigravity", Installed: true, LoggedIn: true},
				}}}
				if app.S.Bridge != nil {
					app.S.Bridge.Mailboxes = []protocol.BridgeMailbox{{Harness: "codex", Open: true}, {Harness: "claude-code", Open: false}}
				} else {
					app.S.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Mailboxes: []protocol.BridgeMailbox{{Harness: "codex", Open: true}, {Harness: "claude-code", Open: false}}}
				}
			case "memory":
				tab = TabMemory
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
