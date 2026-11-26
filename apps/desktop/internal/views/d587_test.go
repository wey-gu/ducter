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

// countText is how many lines on screen say s (a line's words and its accessible copy come
// as two texts in a row; they count once).
func countText(tt *ui.Tester, s string) int {
	n, prev := 0, ""
	for _, got := range tt.Texts() {
		if strings.Contains(asSaid(got), asSaid(s)) && got != prev {
			n++
		}
		prev = got
	}
	return n
}

// D587: two living messages, each with a result the partner is still putting into words, show
// one waiting line for the whole conversation, at its end, and none inside either message; a
// message that holds nothing else is not drawn until its words come.
func TestD587OneWaitingLine(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	now := time.Now().UTC().Format(time.RFC3339)
	done := func(id, title string) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Attention: protocol.Done, UpdatedAt: now, LastReport: &protocol.Report{TaskID: id, State: "done", Summary: "全绿。"}}
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{done("t1", "修 CI #1592"), done("t2", "升级 bun 到 1.3")}}})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "两个都做一下"}),
		chEv(2, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t1", Kind: "done", Title: "修 CI #1592", Text: "全绿。"},
		}}),
		chEv(3, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "第一个好了，我再看看第二个。"}),
		chEv(4, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t2", Kind: "done", Title: "升级 bun 到 1.3", Text: "全绿。"},
		}}),
	}})
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.Now = tt.Now
	tt.Frame()
	tt.Frame()
	wait := app.L.T("activity.result")
	if n := countText(tt, wait); n != 1 {
		t.Fatalf("%d waiting lines, want one: %q", n, tt.Texts())
	}
	rows := app.rows()
	if last := rows[len(rows)-1]; !last.presence || last.wait != "result" {
		t.Errorf("the waiting line isn't the conversation's last row: %+v", last)
	}
	for _, r := range rows {
		if r.entry != nil && r.entry.Living != nil {
			t.Errorf("a living message with only words on their way is drawn: seq %d", r.entry.FirstSeq)
		}
	}
	// Past the wait, each result is said in its own message and the line is gone.
	tt.Advance(wordsWait + time.Second)
	tt.Frame()
	tt.Frame()
	if hasText(tt, wait) {
		t.Errorf("the waiting line stays after its time: %q", tt.Texts())
	}
	for _, want := range []string{"修 CI #1592", "升级 bun 到 1.3"} {
		if !hasText(tt, want) {
			t.Errorf("no %q once its wait is over: %q", want, tt.Texts())
		}
	}
}

// D587: two tasks' questions still being relayed, in two living messages, also wait as one line;
// a reply being thought of is the one figure instead, never both.
func TestD587OneRelayLine(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	later := time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(1, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: "要 rebase 吗？", GoLabel: "rebase", DefaultOption: "go", DefaultAt: later, Reversible: true}),
		chEv(2, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t1", Kind: "decision", Title: "修 CI #1592", Text: "要 rebase 吗？", DecisionID: "d1"},
		}}),
		chEv(3, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "好的。"}),
		chEv(4, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d2", TaskID: "t2", Question: "现在合并吗？", GoLabel: "合并", DefaultOption: "hold", DefaultAt: later}),
		chEv(5, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t2", Kind: "decision", Title: "升级 bun 到 1.3", Text: "现在合并吗？", DecisionID: "d2"},
		}}),
	}})
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.Now = tt.Now
	tt.Frame()
	tt.Frame()
	relay := app.L.T("activity.relay")
	if n := countText(tt, relay); n != 1 {
		t.Fatalf("%d relay lines, want one: %q", n, tt.Texts())
	}
	app.SendMessage("还有别的吗")
	tt.Frame()
	if hasText(tt, relay) || countText(tt, "在想…") != 1 {
		t.Errorf("two figures, or not the reply's: %q", tt.Texts())
	}
}
