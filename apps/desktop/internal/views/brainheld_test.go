package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D435: the partner's own agent held. Another answers: Settings › Partner
// names the one answering, says why and until when, and the pane's header
// says it thinks with it for now. Nobody can: the conversation's header says
// when it answers again, the face waits instead of thinking, and the pane
// says the messages are answered then, in order.
func heldCase(waits bool) d322Case {
	n := time.Now()
	until := time.Date(n.Year(), n.Month(), n.Day(), 20, 53, 0, 0, time.Local).UTC().Format(time.RFC3339)
	cc := protocol.DeviceHarness{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"}
	cx := protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "plan"}
	home := protocol.DeviceView{ID: "dev_home", Name: "Weyl's MacBook", Kind: "mac", Home: true, State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{cc, cx}}
	held := &protocol.BrainHeld{From: "claude-code", Why: "quota", Until: until, ResetKnown: true}
	brain := &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex"}, Why: "held", Held: held}
	name := "fallback"
	if waits {
		held.Waits = true
		home.Harnesses = []protocol.DeviceHarness{cc}
		brain = &protocol.BrainNow{Brain: protocol.Brain{Harness: "claude-code", Model: "opus"}, Held: held,
			Models: []protocol.BrainModel{{ID: "opus", Label: "Opus", Kind: "smart"}, {ID: "sonnet", Label: "Sonnet", Kind: "fast"}}}
		name = "waits"
	}
	return d322Case{name: name, home: home, url: "ws://127.0.0.1:7777/ws", brain: brain, setting: &protocol.Brain{Harness: "claude-code", Model: "opus"}}
}

func heldClock(k d322Case) string { return i18n.Clock(heldTime(k.brain.Held.Until)) }

func heldTime(iso string) time.Time {
	t, _ := time.Parse(time.RFC3339, iso)
	return t
}

func TestBrainHeldSaidInSettingsAndHeader(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		k := heldCase(false)
		app, _ := d322App(t, lang, k)
		tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		at := heldClock(k)
		want := map[i18n.Lang][]string{
			i18n.ZH: {"Claude Code 的额度用完了，这会儿先用它，" + at + " 换回去", "这会儿先用 Codex 想事情"},
			i18n.EN: {"Claude Code is out of credit, so this one answers for now, until " + at, "thinks with Codex for now"},
		}[lang]
		texts := strings.Join(tt.Texts(), "\n")
		for _, w := range want {
			if !strings.Contains(texts, w) {
				t.Errorf("%s fallback: no %q in %q", lang, w, tt.Texts())
			}
		}
		// The person chose Claude Code: the "can't be used now" line of D150 isn't said on top.
		if strings.Contains(texts, "现在用不了") || strings.Contains(texts, "can't be used now") {
			t.Errorf("%s: D150's line said as well", lang)
		}

		k = heldCase(true)
		app, _ = d322App(t, lang, k)
		tt = ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		texts = strings.Join(tt.Texts(), "\n")
		want = map[i18n.Lang][]string{
			i18n.ZH: {"额度用完了，" + at + " 恢复。别的 AI 也接不上", at + " 接着回你"},
			i18n.EN: {"Out of credit until " + at + ", and no other AI can take over", "answers again at " + at},
		}[lang]
		for _, w := range want {
			if !strings.Contains(texts, w) {
				t.Errorf("%s waits: no %q in %q", lang, w, tt.Texts())
			}
		}
		// The conversation: the header says when; a message waiting is not "thinking".
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: map[i18n.Lang]string{i18n.ZH: "今天下午有什么安排？", i18n.EN: "What's on this afternoon?"}[lang]})}})
		if app.thinking() {
			t.Errorf("%s: thinking while nobody can answer", lang)
		}
		parts := app.countParts(app.S.Board())
		head := map[i18n.Lang]string{i18n.ZH: at + " 接着回你", i18n.EN: "Answers at " + at}[lang]
		if len(parts) == 0 || parts[0] != head {
			t.Errorf("%s: header parts %q, want %q first", lang, parts, head)
		}
	}
}

// DUCTER_D435_SHOTS=<dir> go test ./internal/views -run TestD435BrainHeldShots
func TestD435BrainHeldShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D435_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D435_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	line := map[i18n.Lang]map[string]string{
		i18n.ZH: {"user": "今天下午有什么安排？", "fallback": "Claude Code 的额度用完了，这会儿先用 Codex 答你，%s 换回来。", "answer": "下午 3 点和 Weizhen 过 HawDB 的 review，5 点前要把周报发出去。",
			"waits": "Claude Code 的额度用完了，别的 AI 也接不上。%s 恢复后我接着回你，这期间发来的也按顺序回。"},
		i18n.EN: {"user": "What's on this afternoon?", "fallback": "Claude Code is out of credit, so Codex is answering you for now. Back to Claude Code at %s.", "answer": "The HawDB review with Weizhen at 3, and the weekly report is due by 5.",
			"waits": "Claude Code is out of credit and no other AI can take over. It's back at %s; I'll answer then, and anything you send meanwhile, in order."},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, waits := range []bool{false, true} {
			k := heldCase(waits)
			app, _ := d322App(t, lang, k)
			app.Status = 1 // client.Connected (d322App's 2 is Disconnected)
			tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			settle := func() {
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(300 * time.Millisecond)
				}
			}
			d302Both(t, app, tt, settle, "d435-partner-"+k.name, lang)
			// The conversation, as the person sees it.
			at := heldClock(k)
			w := line[lang]
			evs := []protocol.LogEvent{ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: w["user"]})}
			if waits {
				evs = append(evs, ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: strings.Replace(w["waits"], "%s", at, 1)}))
			} else {
				evs = append(evs, ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: strings.Replace(w["fallback"], "%s", at, 1)}), ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w["answer"]}))
			}
			app.Receive(protocol.ServerFrame{T: "events", Events: evs})
			app.Route = RouteConversation
			d302Both(t, app, tt, settle, "d435-conv-"+k.name, lang)
		}
	}
}
