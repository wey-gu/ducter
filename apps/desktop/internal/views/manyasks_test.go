package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D426: the author's 11-12 message done the new way: one look-up and three
// calendar entries in his signed-in browser, one task, the four things
// under his message, each with its mark and what came of it, and one
// question back.

type askCase struct {
	msg, ack, said string
	lines          []protocol.AskLine
}

func manyAsksCase(lang i18n.Lang) askCase {
	if lang == i18n.EN {
		return askCase{
			msg:  "What's on my calendar next week? Also put these in my Gmail calendar: the agibar talk in Beijing on the 20th, the COSCon BoF in Hangzhou this Sunday, and meeting the Tabs Shanghai organisers next Thursday",
			ack:  "On it: checking next week and putting the three in your calendar; I'll tell you when it's done.",
			said: "Two of the three are in your calendar, and nothing else is on next week. What time is the Tabs Shanghai meeting on Thursday?",
			lines: []protocol.AskLine{
				{Words: "What's on next week", TaskID: "t_cal", State: protocol.AskDone, Note: "Nothing else on your calendar"},
				{Words: "agibar talk in Beijing on the 20th", TaskID: "t_cal", State: protocol.AskDone, Note: "Added for Nov 20"},
				{Words: "COSCon BoF in Hangzhou on Sunday", TaskID: "t_cal", State: protocol.AskDone, Note: "Added for Nov 15"},
				{Words: "Meet the Tabs Shanghai organisers next Thursday", TaskID: "t_cal", State: protocol.AskNeedsYou, Note: "What time? Say it and I'll add it"},
			},
		}
	}
	return askCase{
		msg:  "我下周有什么预约么 帮我在 gmail 日历记录我 20 号要去北京 agibar 参加一个分享，这个周日要去杭州 coscon 参加 bof，下周四要参加 Tabs 上海和组织者见面",
		ack:  "好，我去看下周的安排，再把这三项记进日历，弄好了告诉你。",
		said: "北京和杭州那两项记好了，下周日历上也没有别的安排。周四跟 Tabs 上海的组织者几点见？",
		lines: []protocol.AskLine{
			{Words: "我下周有什么预约", TaskID: "t_cal", State: protocol.AskDone, Note: "下周日历上没有别的安排"},
			{Words: "20 号北京 agibar 分享", TaskID: "t_cal", State: protocol.AskDone, Note: "记好了，11 月 20 日"},
			{Words: "周日杭州 COSCon BoF", TaskID: "t_cal", State: protocol.AskDone, Note: "记好了，11 月 15 日"},
			{Words: "下周四 Tabs 上海见组织者", TaskID: "t_cal", State: protocol.AskNeedsYou, Note: "几点见？说个时间我就记上"},
		},
	}
}

// manyAsksApp is the conversation at the moment the lines say how each came out.
func manyAsksApp(t *testing.T, lang i18n.Lang, lines []protocol.AskLine, said bool) *App {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	k := manyAsksCase(lang)
	now := time.Now().UTC()
	at := func(min int) string { return now.Add(time.Duration(min-10) * time.Minute).Format(time.RFC3339) }
	evs := []protocol.LogEvent{
		protocol.NewEvent(1, at(0), "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: k.msg}),
		protocol.NewEvent(2, at(0), "default", "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "job_cal", Text: k.ack, ReplyTo: 1}),
		protocol.NewEvent(3, at(0), "default", "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "job_cal", Text: "calendar", State: "running", TaskID: "t_cal"}),
		protocol.NewEvent(4, at(3), "default", "channel", protocol.OriginSystem, protocol.KindAsks, protocol.Asks{MsgSeq: 1, Lines: lines}),
	}
	if said {
		evs = append(evs, protocol.NewEvent(5, at(3), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: k.said, ReplyTo: 1}))
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t_cal", Persona: "default", Title: "下周预约和三项日历", Place: protocol.Place{Kind: "browser"}, Harness: "codex", Attention: protocol.NeedsYou, Residency: "hot", OpenedAt: at(0), UpdatedAt: at(3)}}}})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	return app
}

func TestManyAsksUnderTheMessage(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		k := manyAsksCase(lang)
		app := manyAsksApp(t, lang, k.lines, true)
		for _, w := range []int{1000, 1400} {
			tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			for _, l := range k.lines {
				if !tt.HasText(l.Words) || !tt.HasText(l.Note) {
					t.Errorf("%s %d: no line %q / %q in %q", lang, w, l.Words, l.Note, tt.Texts())
				}
				// Nothing squeezed: each line's words stand on at most two lines.
				if b, ok := tt.Find(l.Words); ok && (b.W < 80 || b.H > 2*26) {
					t.Errorf("%s %d: %q squeezed into %v", lang, w, l.Words, b)
				}
			}
			count := map[i18n.Lang]string{i18n.ZH: "好了 3 个，还有 1 个", i18n.EN: "3 done, 1 to go"}[lang]
			if !tt.HasText(count) {
				t.Errorf("%s: no count %q in %q", lang, count, tt.Texts())
			}
			// Who does it is not in the conversation until a hover.
			if tt.HasText("Codex") {
				t.Errorf("%s: the agent shows in the conversation without a hover", lang)
			}
			b, _ := tt.Find(k.lines[1].Words)
			tt.Move(b.X+b.W/2, b.Y+b.H/2)
			tt.Frame()
			tt.Frame()
			if !tt.HasText("Codex") {
				t.Errorf("%s: hovering a line doesn't say who does it: %q", lang, tt.Texts())
			}
			tt.Move(5, 5)
		}
	}
	// Two things or fewer, or a single line: the message looks as it always did.
	app := manyAsksApp(t, i18n.ZH, manyAsksCase(i18n.ZH).lines[:1], false)
	tt := ui.NewTesterWith(app.View, 1000, 800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if tt.HasText("下周日历上没有别的安排") {
		t.Errorf("one line under a message shows")
	}
	// Three lines: the marks say it; no count.
	app = manyAsksApp(t, i18n.ZH, manyAsksCase(i18n.ZH).lines[:3], false)
	tt = ui.NewTesterWith(app.View, 1000, 800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, s := range tt.Texts() {
		if strings.HasPrefix(s, "好了 ") {
			t.Errorf("a count under three lines: %q", s)
		}
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/many-asks go test ./internal/views -run ManyAsksShots
func TestManyAsksShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, dark := range []bool{false, true} {
		mode := map[bool]string{false: "light", true: "dark"}[dark]
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			k := manyAsksCase(lang)
			working := make([]protocol.AskLine, len(k.lines))
			for i, l := range k.lines {
				working[i] = protocol.AskLine{Words: l.Words, TaskID: l.TaskID, State: protocol.AskWorking}
			}
			working[0] = k.lines[0]
			for _, s := range []struct {
				name  string
				lines []protocol.AskLine
				said  bool
				hover bool
			}{
				{"working", working, false, false},
				{"answered", k.lines, true, false},
				{"hover", k.lines, true, true},
			} {
				app := manyAsksApp(t, lang, s.lines, s.said)
				tt := ui.NewTesterWith(app.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				if s.hover {
					if b, ok := tt.Find(k.lines[1].Words); ok {
						tt.Move(b.X+b.W/2, b.Y+b.H/2)
					}
				}
				for i := 0; i < 4; i++ {
					tt.Advance(200 * time.Millisecond)
					tt.Frame()
				}
				f, err := os.Create(filepath.Join(dir, "mac-"+s.name+"-"+string(lang)+"-"+mode+".png"))
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
