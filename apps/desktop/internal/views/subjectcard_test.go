package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D653 (research/244 rules 1 and 8): one living card per subject under the
// message that started the work: title in words, state in one line, newest
// progress; revised in place, one per subject even when the task later joins
// its hand-off's PR. zh and en, 1000 and 1400 wide, light and dark are walked
// by the shots; this checks the drawn words.

func subjectCardApp(t *testing.T, lang i18n.Lang) *App {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	now := time.Now().UTC()
	at := func(min int) string { return now.Add(time.Duration(min-10) * time.Minute).Format(time.RFC3339) }
	evs := []protocol.LogEvent{
		protocol.NewEvent(1, at(0), "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "官网下载页的下载按钮点不了，帮我修一下。"}),
		protocol.NewEvent(2, at(0), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "我去看看下载按钮，修好了告诉你。", ReplyTo: 1}),
		protocol.NewEvent(3, at(1), "default", "channel", protocol.OriginSystem, protocol.KindSubjectCard, protocol.SubjectCardBody{Card: protocol.SubjectCard{
			Key: "task:fix", MsgSeq: 1, Title: "修官网下载页的下载按钮", State: protocol.SubjectWorking,
			Line: "改好了，在等 CI", TaskID: "fix", At: at(1),
		}}),
		// The hand-off joins the task to its PR: the card's key moves and the one card replaces the first.
		protocol.NewEvent(4, at(2), "default", "channel", protocol.OriginSystem, protocol.KindSubjectCard, protocol.SubjectCardBody{Card: protocol.SubjectCard{
			Key: "pr:acme/site#578", MsgSeq: 1, Title: "官网下载页的下载按钮", State: protocol.SubjectWaiting,
			Line: "CI 的缓存要不要清掉重跑？", TaskID: "fix", At: at(2),
		}}),
		protocol.NewEvent(5, at(3), "default", "channel", protocol.OriginSystem, protocol.KindSubjectCard, protocol.SubjectCardBody{Card: protocol.SubjectCard{
			Key: "pr:acme/site#578", MsgSeq: 1, Title: "官网下载页的下载按钮", State: protocol.SubjectDone,
			Line: "合并了，线上下载按钮好了。", TaskID: "fix", At: at(3),
		}}),
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	return app
}

func TestSubjectCardUnderTheMessage(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := subjectCardApp(t, lang)
		for _, w := range []int{1000, 1400} {
			tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			for _, want := range []string{"官网下载页的下载按钮", app.L.T("subject.done")} {
				if !hasText(tt, want) {
					t.Errorf("%s %d: no %q in %q", lang, w, want, tt.Texts())
				}
			}
			if !hasText(tt, "合并了，线上下载按钮好了。") {
				t.Errorf("%s %d: the newest line is missing: %q", lang, w, tt.Texts())
			}
			// One card per subject: the old key's line is gone.
			if hasText(tt, "改好了，在等 CI") {
				t.Errorf("%s %d: the first card was not replaced", lang, w)
			}
			n := 0
			for _, got := range tt.Texts() {
				if got == "官网下载页的下载按钮" {
					n++
				}
			}
			if n != 1 {
				t.Errorf("%s %d: the title is drawn %d times, want 1: %q", lang, w, n, tt.Texts())
			}
		}
	}
}

func TestSubjectCardOpensItsTask(t *testing.T) {
	app := subjectCardApp(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1000, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("官网下载页的下载按钮"); !ok {
		t.Fatalf("no card title: %q", tt.Texts())
	}
	tt.Click("官网下载页的下载按钮: 做完了")
	tt.Frame()
	tt.Frame()
	if app.TaskID != "fix" {
		t.Errorf("the card row did not open its task (task=%q)", app.TaskID)
	}
}
