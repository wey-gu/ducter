package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D327: the first words ask before looking (the look start is the yes);
// the answer's offers each say how I know, and one folder can be left out.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=../../../../.shots/d327/mac go test ./internal/views -run D327

func d327Events(lang i18n.Lang) (protocol.LogEvent, protocol.LogEvent) {
	now := time.Now().UTC()
	at := now.Add(-26 * time.Hour).Format(time.RFC3339)
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	first := protocol.NewEvent(1, now.Format(time.RFC3339Nano), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{
		Text: pick("晚上好，我是小鸭。有什么想做的，跟我说一句就行：查点东西、理理文件、写封邮件都可以。大一点的活我交给一个任务去做，做好了再来告诉你。", "Good evening, I'm Duckie. Tell me anything you'd like done: look something up, tidy some files, write an email. Bigger work goes to a task, and I come back when it's done."),
		First: &protocol.FirstWords{Starts: []protocol.FirstStart{
			{ID: "look", From: "look", Words: pick("接着我最近在 Claude Code 和 Codex 里做的事", "Pick up what I was doing in Claude Code and Codex lately"), Draft: "x"},
			{ID: "everyday:1", From: "everyday", Words: pick("周五下午提醒我交水电费", "Remind me on Friday afternoon to pay the utility bill"), Draft: "y"},
			{ID: "everyday:2", From: "everyday", Words: pick("帮我写一封请假邮件", "Write a leave request email for me"), Draft: "z"},
		}},
	})
	answer := protocol.NewEvent(2, now.Format(time.RFC3339Nano), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{
		Text: pick("我看了看 Ada 的 MacBook Air 上你的 Claude Code 和 Codex 最近在做的事，这几个要不要接着来？", "I had a look at what your Claude Code and Codex worked on lately on Ada’s MacBook Air. Want to pick one of these up?"),
		First: &protocol.FirstWords{Look: true, Computer: "Ada’s MacBook Air", Looked: []string{"claude-code", "codex"}, Starts: []protocol.FirstStart{
			{ID: "local:claude-code:1", From: "claude-code", Path: "~/src/hawdb", At: at, Words: pick("昨天你在 hawdb 里做「Raft 快照恢复时卡在 apply」，要我接着看看吗？", "Yesterday you were on “Raft snapshot stuck in apply” in hawdb. Want me to pick it up?"), Draft: "hawdb"},
			{ID: "local:codex:2", From: "codex", Path: "~/work/billing-api", At: at, Words: pick("3 天前你在 billing-api 里用过 Codex，要我看看那儿现在怎么样吗？", "3 days ago you used Codex in billing-api. Want me to see where it stands?"), Draft: "billing"},
		}},
	})
	return first, answer
}

func TestD327LookFirstThenHowIKnow(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1280, 720} {
			L := i18n.New(lang)
			app, sent := iaApp(t, lang)
			app.Status = client.Connected
			name := map[i18n.Lang]string{i18n.ZH: "小鸭", i18n.EN: "Duckie"}[lang]
			app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: name, HeadSeq: 1})
			app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "first", Computer: "Ada’s MacBook Air"}})
			first, answer := d327Events(lang)
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{first}})
			tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetScale(2)
			tt.Frame()
			tt.Advance(3 * time.Second)
			tt.Frame()
			look := map[i18n.Lang]string{i18n.ZH: "接着我最近在 Claude Code 和 Codex 里做的事", i18n.EN: "Pick up what I was doing in Claude Code and Codex lately"}[lang]
			// Nothing was read: no line about records, only the offer to look.
			if !hasText(tt, autospace(look)) || hasText(tt, L.T("first.stop")) {
				t.Fatalf("%s: %q", lang, tt.Texts())
			}
			size := map[int]string{1280: "wide", 720: "narrow"}[w]
			shotTester(t, tt, "mac-first-look-"+size+"-"+string(lang))
			if err := tt.Click(autospace(look)); err != nil {
				t.Fatal(err)
			}
			tt.Frame()
			if _, ok := lastSent[protocol.LocalAgentsLook](*sent); !ok {
				t.Fatalf("%s: the look was not asked for", lang)
			}
			if app.draft == "x" {
				t.Errorf("%s: the look start filled the composer", lang)
			}
			// The home answers: the offers, the scope line, 别再看了; the look start is gone.
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{answer}})
			tt.Frame()
			if hasText(tt, autospace(look)) {
				t.Errorf("%s: the look start is still offered", lang)
			}
			for _, s := range []string{L.T("first.from", "Ada’s MacBook Air"), L.T("first.stop"), L.T("first.how")} {
				if !hasText(tt, s) {
					t.Errorf("%s: no %q in %q", lang, s, tt.Texts())
				}
			}
			shotTester(t, tt, "mac-first-answer-"+size+"-"+string(lang))
			// How I know: the agent, the folder, when, the computer, and a way to leave the folder out.
			if err := tt.Click(L.T("first.how")); err != nil {
				t.Fatal(err)
			}
			tt.Frame()
			for _, s := range []string{L.T("first.how.from", "Claude Code"), "~/src/hawdb", L.T("first.how.on", "Ada’s MacBook Air"), L.T("first.how.leave")} {
				if !hasText(tt, s) {
					t.Errorf("%s: how I know lacks %q in %q", lang, s, tt.Texts())
				}
			}
			shotTester(t, tt, "mac-first-how-"+size+"-"+string(lang))
			if err := tt.Click(L.T("first.how.leave")); err != nil {
				t.Fatal(err)
			}
			tt.Frame()
			if v, ok := lastSent[protocol.OutsideFolder](*sent); !ok || v.Path != "~/src/hawdb" || !v.Hidden {
				t.Errorf("%s: leave sent %+v", lang, v)
			}
			if strings.Contains(strings.Join(tt.Texts(), "\n"), "Raft") {
				t.Errorf("%s: the folder's offer is still shown", lang)
			}
			if !hasText(tt, L.T("first.how.left", "~/src/hawdb")) {
				t.Errorf("%s: no word after leaving the folder out", lang)
			}
			shotTester(t, tt, "mac-first-left-"+size+"-"+string(lang))
		}
	}
}
