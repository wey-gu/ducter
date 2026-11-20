package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D437: another AI looked the result over. What it still found is said
// under the partner's result (never folded into Details), on the Go card of
// what a reply would send, and in the opened task's outcome; the fix it
// asked for is a hairline in the transcript, never the person's words.
var lookWords = map[i18n.Lang]struct{ ask, ack, title, said, left, ask2, said2, q2, left2, go2 string }{
	i18n.ZH: {"让安装脚本支持用 DUCTER_BIN 指定安装目录，macOS、Linux 和 Windows 都要", "我去改三个平台的安装脚本，好了告诉你。", "安装目录可配置",
		"三个平台的安装脚本都改好了：设了 DUCTER_BIN 就装到那里，没设还是原来的目录。", "README 里还写着旧的安装目录",
		"回一下 ducter#212，谢谢 @lin-yu，告诉他 0.1.3 修了", "回复写好了，你看一眼再发。",
		"把这条回复发到 ducter-ai/ducter#212？\n\nThanks @lin-yu for the clear report! This is fixed in 0.1.2.", "回复里写的是 0.1.2，你说的是 0.1.3", "发出去"},
	i18n.EN: {"Make the install scripts take DUCTER_BIN for the install folder, on macOS, Linux and Windows", "I'll change the install scripts for all three and tell you when it's done.", "Configurable install folder",
		"The install scripts for all three are done: with DUCTER_BIN set they install there, otherwise where they always did.", "the README still names the old install folder",
		"Reply on ducter#212: thank @lin-yu and say 0.1.3 fixed it", "The reply is written; have a look before it goes.",
		"Post this reply on ducter-ai/ducter#212?\n\nThanks @lin-yu for the clear report! This is fixed in 0.1.2.", "the reply says 0.1.2; you said 0.1.3", "Post"},
}

func lookApp(t *testing.T, lang i18n.Lang) (*App, *ui.Tester) {
	t.Helper()
	w := lookWords[lang]
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	n := int64(0)
	at := func(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
	}
	id, ts := "t_bin", protocol.TaskStream("t_bin")
	files, adds, dels := 2, 14, 3
	fix := "Before your result goes to the user, another AI (Claude Code) read it once against what they asked, with a clean context. It found:\n1. install.ps1\n\nFix what is right."
	evs := []protocol.LogEvent{
		at(9*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.ask}),
		at(9*time.Minute, "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: w.ack, ReplyTo: 1}),
		at(9*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: w.title, Harness: "codex", Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "~/dev/ducter", Branch: "ducter/install-bin", BaseBranch: "main"}, Brief: w.ask}),
		at(9*time.Minute, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: w.title, State: "running", TaskID: id}),
		at(5*time.Minute, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "ducter", Text: fix}),
		at(3*time.Minute, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done", Summary: w.said,
			Branch: &protocol.BranchChanges{Commits: 2, Files: &files, Adds: &adds, Dels: &dels},
			Look:   &protocol.SecondLook{By: "claude-code", Found: []string{"install.ps1", w.left}, Left: []string{w.left}}}),
		at(3*time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
		at(3*time.Minute, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: w.title, State: "done", TaskID: id}),
		at(2*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.said, ReplyTo: 1}),
		at(time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.ask2}),
		at(time.Minute, "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d_212", TaskID: "t_212", Question: w.q2, GoLabel: w.go2, DefaultOption: "hold", Look: &protocol.DecisionLook{By: "claude-code", Left: []string{w.left2}}}),
		at(time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.said2, DecisionID: "d_212"}),
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1100, 1180, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt
}

func TestSecondLookSaidUnderTheResultAndOnTheCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := lookWords[lang]
		app, tt := lookApp(t, lang)
		all := texts(tt)
		lead := app.L.T("look.lead")
		if strings.Count(all, lead) < 2 {
			t.Errorf("%s: the look's lead should show under the result and on the reply's card: %q", lang, all)
		}
		for _, want := range []string{w.left, w.left2} {
			if !strings.Contains(all, want) {
				t.Errorf("%s: %q not said: %q", lang, want, all)
			}
		}
		// What was fixed is never said on a card.
		if strings.Contains(all, "install.ps1") {
			t.Errorf("%s: a fixed point shows: %q", lang, all)
		}
	}
}

func TestSecondLookFixAskIsAHairline(t *testing.T) {
	say, name, ok := toldOf("Before your result goes to the user, another AI (Codex) read it once against what they asked, with a clean context. It found:\n1. x", "ducter")
	if !ok || say != "looked" || name != "Codex" {
		t.Fatalf("toldOf: %q %q %v", say, name, ok)
	}
}

// DUCTER_D437_SHOTS=<dir> go test ./internal/views -run TestD437SecondLookShots
func TestD437SecondLookShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D437_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D437_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := lookApp(t, lang)
		settle := func() {
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(300 * time.Millisecond)
			}
		}
		app.Route = RouteConversation
		d302Both(t, app, tt, settle, "d437-conv", lang)
		app.OpenTask("t_bin")
		d302Both(t, app, tt, settle, "d437-task", lang)
	}
}
