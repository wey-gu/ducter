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

// The App Store Connect run the author tested (D129): the partner's own ask,
// answered, its ack, the task's question said in the partner's words, and
// the result, as a messaging app shows them.
type ascWords struct {
	user, user2, ask, goLabel, ack, taskQ, said, saidGo, result, title, more string
}

var asc = map[i18n.Lang]ascWords{
	i18n.ZH: {
		user:    "帮我把 App Store Connect 准备好，让 Ducter 能上 TestFlight。",
		user2:   "按 iOS 发布指南来就行",
		ask:     "要在 App Store Connect 建好 Ducter 的 app 和内部测试组吗？建好就删不掉了，名字也会被占住。",
		goLabel: "创建",
		ack:     "好，我去 App Store Connect 建，弄好了告诉你。",
		taskQ:   "请先在当前 Chrome 的 App Store Connect 页面登录目标 Apple 账号；完成后我将继续创建 co.nowledge.ducter.ios 的 Bundle ID 并开启 Push Notifications。",
		said:    "得先在浏览器里登录你的苹果账号，我才能接着建。登好了点一下就行。",
		saidGo:  "接着建",
		result:  "App Store Connect 准备好了：Ducter 的 app 和内部测试组都建好了。",
		more:    "还差两样得你在苹果那边点一下，下次发版时我带你走一遍。",
		title:   "准备 App Store Connect",
	},
	i18n.EN: {
		user:    "Get App Store Connect ready so Ducter can go out on TestFlight.",
		user2:   "Follow the iOS release guide",
		ask:     "Create Ducter's app and an internal testing group in App Store Connect? Once made it can't be deleted, and the name is taken for good.",
		goLabel: "create them",
		ack:     "On it: setting up App Store Connect; I'll tell you when it's done.",
		taskQ:   "Please sign in to the target Apple account in the App Store Connect page in the current Chrome; after that I will register the co.nowledge.ducter.ios Bundle ID and enable Push Notifications.",
		said:    "I need you to sign in to your Apple account in the browser first. Tap below once you're in.",
		saidGo:  "keep going",
		result:  "App Store Connect is ready: Ducter's app and its internal testing group are set up.",
		more:    "Two things still need a tap from you on Apple's side; I'll walk you through them at release time.",
		title:   "Prepare App Store Connect",
	},
}

func ascApp(t *testing.T, lang i18n.Lang, stage int) (*App, *ui.Tester) {
	t.Helper()
	w := asc[lang]
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	n := int64(0)
	at := func(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
	}
	id, ts := "t_asc", protocol.TaskStream("t_asc")
	evs := []protocol.LogEvent{
		at(20*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.user}),
		at(20*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.user2}),
		at(20*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d_own", Question: w.ask, GoLabel: w.goLabel, DefaultOption: "hold", Reversible: false}),
	}
	if stage >= 1 {
		evs = append(evs,
			at(19*time.Minute, "channel", protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_own", Option: "go", By: "user"}),
			at(19*time.Minute, "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: w.ack, ReplyTo: 2}),
			at(19*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: w.title, Harness: "codex", Place: protocol.Place{Kind: "browser", Device: "local"}, Brief: "…"}),
			at(19*time.Minute, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "Working", State: "running", TaskID: id}),
			at(12*time.Minute, "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d_task", TaskID: id, Question: w.taskQ, GoLabel: w.saidGo, DefaultOption: "hold", Reversible: false}),
			at(12*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.said, DecisionID: "d_task"}),
		)
	}
	if stage >= 2 {
		evs = append(evs,
			at(11*time.Minute, "channel", protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_task", Option: "go", By: "user"}),
			at(2*time.Minute, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done",
				Summary:  "Registered co.nowledge.ducter.ios with Push, created the Ducter app record and the Internal group. Left: signing certificate, provisioning profile, CI upload key, APNs key.",
				Evidence: []protocol.EvidenceRef{{Kind: "url", Label: "App Store Connect · Ducter", Ref: "https://appstoreconnect.apple.com/apps"}}}),
			at(2*time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
			at(2*time.Minute, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "Done", State: "done", TaskID: id}),
			at(time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.result, ReplyTo: 2}),
			at(time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.more, ReplyTo: 2}),
		)
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1100, 1180, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt
}

func TestConversationBubbles(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := asc[lang]
		_, open := ascApp(t, lang, 0)
		all := texts(open)
		if !strings.Contains(all, w.ask) {
			t.Errorf("%s: the ask doesn't show: %q", lang, all)
		}
		for _, not := range []string{"这件不会自己动", "等你定", "won't go ahead on this without you"} {
			if strings.Contains(all, not) {
				t.Errorf("%s: the old note %q shows", lang, not)
			}
		}
		writeShot(t, open, "conv-"+string(lang)+"-1-decision")

		_, mid := ascApp(t, lang, 1)
		all = texts(mid)
		if strings.Contains(all, w.taskQ) {
			t.Errorf("%s: the task's question shows in its own words: %q", lang, all)
		}
		if !strings.Contains(all, w.said) {
			t.Errorf("%s: the partner's words for the task's question don't show: %q", lang, all)
		}
		for _, not := range []string{"已经说好", "Agreed"} {
			if strings.Contains(all, not) {
				t.Errorf("%s: %q shows for an answered ask", lang, not)
			}
		}
		writeShot(t, mid, "conv-"+string(lang)+"-2-relayed")

		app, done := ascApp(t, lang, 2)
		writeShot(t, done, "conv-"+string(lang)+"-3-result")
		label := app.L.T("details.show")
		if err := done.Click(label); err == nil {
			done.Frame()
			done.Frame()
			writeShot(t, done, "conv-"+string(lang)+"-4-details")
		}
	}
}

// Until the partner has said a task's question in its own words, its
// waiting presence holds the place; the task's wording never shows.
func TestTaskQuestionWaitsForThePartnersWords(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	now := time.Now().UTC().Format(time.RFC3339Nano)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, now, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "准备 App Store Connect"}),
		protocol.NewEvent(2, now, "default", "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: "好，我去弄。", ReplyTo: 1}),
		protocol.NewEvent(3, now, "default", protocol.TaskStream("t1"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "准备 App Store Connect", Harness: "codex", Place: protocol.Place{Kind: "browser", Device: "local"}}),
		protocol.NewEvent(4, now, "default", "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: asc[i18n.ZH].taskQ, GoLabel: "接着建", DefaultOption: "hold"}),
	}})
	tt := ui.NewTesterWith(app.View, 1100, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	all := texts(tt)
	if strings.Contains(all, asc[i18n.ZH].taskQ) || !strings.Contains(all, "在看它想问你什么…") {
		t.Errorf("a fresh task question shows its own words, not the waiting line: %q", all)
	}
	writeShot(t, tt, "conv-zh-0-relay-waiting")
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(5, now, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: asc[i18n.ZH].said, DecisionID: "d1"}),
	}})
	tt.Frame()
	all = texts(tt)
	if !strings.Contains(all, asc[i18n.ZH].said) || strings.Contains(all, "在看它想问你什么…") || !strings.Contains(all, "好，接着建") {
		t.Errorf("the partner's words don't replace the waiting line: %q", all)
	}
	if err := tt.Click("好，接着建"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if all = texts(tt); !strings.Contains(all, "你说：好，接着建") {
		t.Errorf("an answered ask doesn't say the user's choice in their words: %q", all)
	}
}

// noRelayWait shows task questions in their own words at once, for tests
// written before the partner said them in its own (D129).
func noRelayWait(t *testing.T) {
	old := relayWait
	relayWait = 0
	t.Cleanup(func() { relayWait = old })
}
