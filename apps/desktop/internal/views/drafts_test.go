package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D402: a 在等你回 find arrives with its reply already written. The words sit
// in a sunken well, a field while its Go is open; 好，发出去 sends the text as
// edited; then 30 seconds with 撤回, then 已发给 {name}.

func draftEvents(en bool) []protocol.LogEvent {
	text, to, check, open := "CamLi 4 天前问你「大文件导入修好了没有」，又问了一次。", "CamLi", "大文件导入的问题修没修好", "早。"
	reply := "CamLi 你好，抱歉回晚了。大文件导入的问题我们在查，修好后第一时间告诉你。Wey"
	label := "发出去"
	text2, reply2, to2 := "Kenji 2 天前问你「Plus 买了还是没开通」，还没回。", "Kenji さん、ご連絡ありがとうございます。お支払いの状況を確認して、すぐにご連絡します。Wey", "Kenji Example"
	if en {
		text, check, open, label = "CamLi asked you \"is large-file import fixed\" 4 days ago, and asked again.", "whether large-file import is fixed", "Morning.", "Send"
		text2 = "Kenji asked you \"Plus is paid but not active\" 2 days ago, not answered yet."
	}
	note := protocol.Finds{NoteID: "nd", Rung: "morning", Opening: open, Finds: []protocol.FindView{
		{FindID: "fd1", Kind: "waiting_on_you", Text: text, DecisionID: "dd1", GoLabel: label, How: []protocol.FindHow{{What: "大文件导入一直报错", From: "CamLi", At: "2026-11-13T06:00:00Z"}, {What: "Re: 大文件导入一直报错", From: "CamLi", At: "2026-11-16T07:00:00Z"}},
			Draft: &protocol.FindDraft{Text: reply, To: to, From: "wey@example.com", Subject: "Re: 大文件导入一直报错", Lang: "zh", Check: check}},
		{FindID: "fd2", Kind: "waiting_on_you", Text: text2, DecisionID: "dd2", GoLabel: label, How: []protocol.FindHow{{What: "Plus を購入しましたが Not active のままです", From: "Kenji Example", At: "2026-11-15T01:00:00Z"}},
			Draft: &protocol.FindDraft{Text: reply2, To: to2, Subject: "Plus を購入しましたが Not active のままです", Lang: "ja"}},
	}}
	evs := []protocol.LogEvent{}
	for _, f := range note.Finds {
		see := "看草稿"
		if en {
			see = "See the draft"
		}
		evs = append(evs, ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: f.DecisionID, Question: f.Text, GoLabel: see, DefaultOption: "hold", FindID: f.FindID, Draft: &protocol.DecisionDraft{First: f.Draft.Text}}))
	}
	return append(evs, ev("channel", protocol.KindFinds, note))
}

// lastSentFrame is the last frame sent that isn't a read receipt.
func lastSentFrame(sent []any) any {
	for i := len(sent) - 1; i >= 0; i-- {
		if _, ok := sent[i].(protocol.Read); !ok {
			return sent[i]
		}
	}
	return nil
}

func TestDraftedReplyInTheNote(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "events", Events: draftEvents(false)})
	tt := ui.NewTesterWith(app.View, 1100, 1300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"回给 CamLi", "发之前确认：大文件导入的问题修没修好", "好，发出去", "先等等"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// The draft is editable in place; Go carries the text as edited.
	app.replyDraft["draft:fd1"] = "CamLi 你好，修好了，升级到 0.9 试试。Wey"
	tt.Frame()
	*sent = nil
	if err := tt.Click("好，发出去，CamLi"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if got := lastSentFrame(*sent); got != (protocol.Decide{T: "decide", DecisionID: "dd1", Option: "go", Text: "CamLi 你好，修好了，升级到 0.9 试试。Wey"}) {
		t.Fatalf("Go sent %#v", *sent)
	}
	// The home says it is sending: 30 seconds with 撤回.
	until := time.Now().Add(20 * time.Second).UTC().Format(time.RFC3339Nano)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "dd1", Option: "go", Text: "x", By: "user"}),
		ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fd1", Kind: "waiting_on_you", State: "sending", Until: until}),
	}})
	tt.Frame()
	if !tt.HasText("撤回") || tt.HasText("回给 CamLi") && tt.HasText("发之前确认：大文件导入的问题修没修好") {
		t.Errorf("sending shows %q", tt.Texts())
	}
	*sent = nil
	if err := tt.Click("撤回，CamLi"); err != nil {
		t.Fatal(err)
	}
	if got := lastSentFrame(*sent); got != (protocol.FindUndo{T: "find_undo", FindID: "fd1"}) {
		t.Fatalf("撤回 sent %#v", *sent)
	}
	// Undone: asked again under a new decision, the edit kept.
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: "dd1b", Question: "x", GoLabel: "发出去", DefaultOption: "hold", FindID: "fd1"}),
		ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fd1", Kind: "waiting_on_you", State: "unsent", DecisionID: "dd1b"}),
	}})
	tt.Frame()
	*sent = nil
	if err := tt.Click("好，发出去，CamLi"); err != nil {
		t.Fatal(err)
	}
	if got, ok := lastSentFrame(*sent).(protocol.Decide); !ok || got.DecisionID != "dd1b" {
		t.Fatalf("Go again sent %#v", *sent)
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "dd1b", Option: "go", By: "user"}),
		ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fd1", Kind: "waiting_on_you", State: "sent"}),
	}})
	tt.Frame()
	if !tt.HasText("已发给 CamLi") {
		t.Errorf("sent shows %q", tt.Texts())
	}
}

// On hand shows the same ask with the reply's first line and 看草稿, never 发出去:
// a Go there carries no words and would not send. 看草稿 opens the conversation.
func TestDraftOnHandNeverSays(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "events", Events: draftEvents(false)})
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1400, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if !tt.HasText("看草稿") {
		t.Fatalf("On hand has no 看草稿: %q", tt.Texts())
	}
	for _, s := range tt.Texts() {
		if s == "好，发出去" || s == "发出去" {
			t.Errorf("On hand says %q", s)
		}
	}
	*sent = nil
	if err := tt.Click("看草稿，CamLi 4 天前问你「大文件导入修好了没有」，又问了一次。"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.Route != RouteConversation {
		t.Errorf("看草稿 stays on %v", app.Route)
	}
	if _, ok := lastSentFrame(*sent).(protocol.Decide); ok {
		t.Errorf("看草稿 answered the ask: %#v", *sent)
	}
}

// Shots for review (D75: outside git), zh and en, light and dark, wide and narrow:
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/proactive-drafts go test ./internal/views -run DraftShots
func TestDraftShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, w := range []int{1400, 760} {
				for _, stage := range []string{"open", "sending", "onhand"} {
					app, _ := iaApp(t, lang)
					app.Status = client.Connected
					app.Receive(protocol.ServerFrame{T: "events", Events: draftEvents(lang == i18n.EN)})
					if stage == "sending" {
						app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
							ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "dd1", Option: "go", By: "user"}),
							ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fd1", Kind: "waiting_on_you", State: "sending", Until: time.Now().Add(24 * time.Second).UTC().Format(time.RFC3339Nano)}),
							ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "dd2", Option: "go", By: "user"}),
							ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fd2", Kind: "waiting_on_you", State: "sent"}),
						}})
					}
					if stage == "onhand" {
						app.Route = RouteOnHand
					}
					tt := ui.NewTesterWith(app.View, w, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
					tt.SetDark(dark)
					tt.SetScale(2)
					tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
					tt.Frame()
					tt.Advance(time.Second)
					tt.Frame()
					theme := "light"
					if dark {
						theme = "dark"
					}
					name := "mac-" + stage + "-" + string(lang) + "-" + theme + "-" + itoa(int64(w)) + ".png"
					f, err := os.Create(filepath.Join(dir, name))
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
	}
}
