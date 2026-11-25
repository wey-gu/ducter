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

// D304's fixtures: the demo's seeded memories (apps/web/demo-mem.ts), never
// anything real.
var recallNow = time.Date(2026, 11, 17, 9, 30, 0, 0, time.Local)

type recallWords struct{ ask1, said1, ask2, said2, mem1, mem2, opening string }

var recallSeed = map[i18n.Lang]recallWords{
	i18n.ZH: {"周报一般哪天发、发给谁来着？", "周五下午发，发给 Nowledge 全组。", "提交 Ducter 的 Go 代码前要做什么？", "先跑一下 gofmt -l，有输出就先格式化。",
		"周报每周五下午发，发给 Nowledge 全组", "Ducter 的 Go 代码提交前先跑 gofmt -l", "早。"},
	i18n.EN: {"When does the weekly report go out, and to whom?", "Friday afternoon, to the whole Nowledge team.", "Anything before I commit Ducter's Go code?", "Run gofmt -l first; format anything it lists.",
		"The weekly report goes out Friday afternoon, to the whole Nowledge team", "Run gofmt -l before committing Ducter's Go code", "Morning."},
}

var notedSeedWords = map[i18n.Lang][]string{
	i18n.ZH: {"周报每周五下午发，发给 Nowledge 全组", "开会前一天提醒，不要当天早上", "回复英文邮件用简短的口语，不用敬语", "报销单每月 25 号前交"},
	i18n.EN: {"The weekly report goes out Friday afternoon, to the whole Nowledge team", "Meeting reminders the day before, not that morning", "English mail replies: short and plain, no formalities", "Expense reports go in before the 25th each month"},
}

func recallEv(seq int64, origin protocol.Origin, kind string, body any) protocol.LogEvent {
	return protocol.NewEvent(seq, recallNow.Add(-time.Duration(20-seq)*time.Minute).UTC().Format(time.RFC3339), "default", "channel", origin, kind, body)
}

func recallApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Now = func() time.Time { return recallNow }
	w := recallSeed[lang]
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		recallEv(1, protocol.OriginPartner, protocol.KindFinds, protocol.Finds{NoteID: "n1", Rung: "morning", Opening: w.opening, Finds: []protocol.FindView{}, Learned: &protocol.Learned{Count: 3}}),
		recallEv(2, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.ask1}),
		recallEv(3, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.said1, ReplyTo: 2}),
		recallEv(4, protocol.OriginPartner, protocol.KindMemoryRecalled, protocol.MemoryRecalled{MemoryID: "m_w1", Title: w.mem1, By: "said", Date: "2026-11-10", AboutSeq: 3, ReplyTo: 2}),
		recallEv(5, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.ask2}),
		recallEv(6, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.said2, ReplyTo: 5}),
		recallEv(7, protocol.OriginPartner, protocol.KindMemoryRecalled, protocol.MemoryRecalled{MemoryID: "m_cc1", Title: w.mem2, By: "tool", From: "Claude Code", Date: "2026-11-15", AboutSeq: 6, ReplyTo: 5}),
	}})
	noted := notedSeedWords[lang]
	at := func(days float64) string {
		return recallNow.Add(-time.Duration(days*24) * time.Hour).UTC().Format(time.RFC3339)
	}
	app.Receive(protocol.ServerFrame{T: "settings",
		Settings: &protocol.Settings{Name: "Ducter", Language: "auto", Memory: true, Notify: true, DefaultAfterMin: 30},
		Mem: &protocol.MemView{State: "connected", Noted: []protocol.Noted{
			{Seq: 101, Title: noted[0], At: at(2), MemoryID: "m_n1"},
			{Seq: 102, Title: noted[1], At: at(3), MemoryID: "m_n2", Confirmed: true},
			{Seq: 103, Title: noted[2], At: at(5), MemoryID: "m_n3"},
			{Seq: 104, Title: noted[3], At: at(12), MemoryID: "m_n4"},
		}},
	})
	return app, sent
}

func TestRecallLineWords(t *testing.T) {
	zh, en := i18n.New(i18n.ZH), i18n.New(i18n.EN)
	cases := []struct {
		r      protocol.MemoryRecalled
		zh, en string
	}{
		{protocol.MemoryRecalled{By: "said", Date: "2026-11-10"}, "想起了你 11 月 10 日说的", "Remembered from what you said on Nov 10"},
		{protocol.MemoryRecalled{By: "said"}, "想起了你说过的", "Remembered from what you said"},
		{protocol.MemoryRecalled{By: "tool", From: "Claude Code", Date: "2026-11-15"}, "想起了 11 月 15 日 Claude Code 记下的", "Remembered from what Claude Code saved on Nov 15"},
		{protocol.MemoryRecalled{By: "tool", From: "Codex"}, "想起了 Codex 记下的", "Remembered from what Codex saved"},
		{protocol.MemoryRecalled{By: "you", Date: "2026-11-01"}, "想起了 11 月 1 日你记下的", "Remembered from what you saved on Nov 1"},
		{protocol.MemoryRecalled{By: "tool"}, "想起了你记下的", "Remembered from what you saved"}, // a tool without its name: the person's
	}
	for _, c := range cases {
		if got := recallLineText(zh, c.r, recallNow); got != c.zh {
			t.Errorf("zh %#v: %q", c.r, got)
		}
		if got := recallLineText(en, c.r, recallNow); got != c.en {
			t.Errorf("en %#v: %q", c.r, got)
		}
	}
	if got := recallLineText(en, protocol.MemoryRecalled{By: "said", Date: "2025-03-04"}, recallNow); !strings.Contains(got, "2025") {
		t.Errorf("another year's date has no year: %q", got)
	}
}

func TestRecallLineOpensItsCardAndForgets(t *testing.T) {
	app, sent := recallApp(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	line := "想起了你 11 月 10 日说的"
	if !hasText(tt, line) || !hasText(tt, "想起了 11 月 15 日 Claude Code 记下的") {
		t.Fatalf("no source lines: %q", tt.Texts())
	}
	if hasText(tt, "它想起的这条") {
		t.Fatalf("the card is open before a tap")
	}
	if err := tt.Click(line); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	for _, s := range []string{"我想起的这条", "你跟我说的", "11 月 10 日", "我刚才的回答用到了它。", "在 Nowledge Mem 里打开"} {
		if !hasText(tt, s) {
			t.Errorf("the card lacks %q", s)
		}
	}
	if err := tt.Click("忘掉"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !hasText(tt, "忘掉「周报每周五下午发，发给 Nowledge 全组」？我以后不会再想起。") {
		t.Fatalf("Forget doesn't ask first: %q", tt.Texts())
	}
	*sent = nil
	if err := tt.Click("忘掉"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if len(*sent) != 1 || (*sent)[0] != (protocol.MemoryForget{T: "memory_forget", Seq: 4}) {
		t.Errorf("forget sent %#v", *sent)
	}
	if hasText(tt, line) {
		t.Errorf("a forgotten line still shows")
	}
}

func TestLearnedListConfirmsAndCorrects(t *testing.T) {
	app, sent := recallApp(t, i18n.EN)
	tt := ui.NewTesterWith(app.View, 1280, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasText(tt, "3 things I noted about you this week") { // D482: one quiet link at the note's foot
		t.Fatalf("no offer under the note: %q", tt.Texts())
	}
	if err := tt.Click("3 things I noted about you this week"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	rows := app.learnedRows()
	if len(rows) != 3 || rows[0].Seq != 101 {
		t.Fatalf("the week's rows: %#v", rows)
	}
	noted := notedSeedWords[i18n.EN]
	if !hasText(tt, "What I learned this week") || !hasText(tt, noted[0]) || hasText(tt, noted[3]) {
		t.Fatalf("the list: %q", tt.Texts())
	}
	if !hasText(tt, "Checked") {
		t.Errorf("a confirmed row doesn't say so")
	}
	*sent = nil
	app.confirmNoted(101)
	if len(*sent) != 1 || (*sent)[0] != (protocol.MemoryConfirm{T: "memory_confirm", Seq: 101}) {
		t.Errorf("confirm sent %#v", *sent)
	}
	*sent = nil
	app.recall.fixing, app.recall.fixText = 103, "  English mail replies:   short, plain, first names  "
	app.saveFix(103)
	if len(*sent) != 1 || (*sent)[0] != (protocol.MemoryCorrect{T: "memory_correct", Seq: 103, Title: "English mail replies: short, plain, first names"}) {
		t.Errorf("correct sent %#v", *sent)
	}
	app.Receive(protocol.ServerFrame{T: "settings", Mem: app.S.Mem, Corrected: &protocol.Forgot{Seq: 103, How: "mem"}})
	tt.Frame()
	if !hasText(tt, "Fixed, in Nowledge Mem too.") || !hasText(tt, "English mail replies: short, plain, first names") || !hasText(tt, "You fixed it") {
		t.Errorf("after the fix: %q", tt.Texts())
	}
}

// Escape closes the card and the list a step at a time, even after the
// focused button went away (Forget's question replaced it).
func TestRecallEscape(t *testing.T) {
	app, _ := recallApp(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if err := tt.Click("想起了你 11 月 10 日说的"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("忘掉"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.recall.asking || app.recall.open == 0 {
		t.Fatalf("Esc didn't take the question back first: %#v", app.recall)
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.recall.open != 0 || app.Route != RouteConversation {
		t.Fatalf("Esc didn't close the card: %#v route %v", app.recall, app.Route)
	}
	app.openLearned("note:1")
	app.recall.fixing = 103
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.recall.fixing != 0 || app.recall.learned != "" {
		t.Fatalf("Esc didn't close the list: %#v", app.recall)
	}
}

func TestLearnedListAsksForTheNotedLines(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	*sent = nil
	app.openLearned("note:1")
	if len(*sent) != 1 || (*sent)[0] != (protocol.SettingsReq{T: "settings"}) {
		t.Errorf("opened without the lines, it sent %#v", *sent)
	}
}
