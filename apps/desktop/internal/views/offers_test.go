package views

import (
	"image/png"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D453: the morning note's finds are offers. Each has its one Go and no
// 先等等 (letting it be is the hold); past the first three the rest wait under
// 还有几条; none of them is needs-you (On hand, the face, the menu bar);
// one that faded keeps its words, muted, with no button and no word.

type offerRow struct{ kind, zh, en, go1zh, go1en string }

var offerRows = []offerRow{
	{"coming_up", "明天 19:40 NH 920 从浦东 T2 起飞，17:40 前到机场。", "NH 920 leaves Pudong T2 tomorrow at 19:40; be at the airport by 17:40.", "查一下航班状态", "Check the flight"},
	{"waiting_on_you", "CamLi 4 天前问你「大文件导入修好了没有」，又问了一次。", "CamLi asked you \"is large-file import fixed\" 4 days ago, and asked again.", "拟个回复", "Draft a reply"},
	{"deadline", "Cloudflare AI Search 11/15 起开始收费。还要用的话，去控制台确认一下。", "Cloudflare AI Search starts charging on 11/15. If you still use it, confirm in the dashboard.", "打开控制台", "Open the dashboard"},
	{"service", "nightly-stats on main 从昨天 22:10 起失败了 3 次，最近一次 00:10。", "nightly-stats on main failed 3 times since 22:10 yesterday, last at 00:10.", "看看为什么失败", "See why it fails"},
	{"waiting_on_them", "你 11/14 问 Lina 周报的数字，还没回。", "You asked Lina about the weekly report's numbers on 11/14; no answer yet.", "拟个跟进", "Draft a follow-up"},
}

func offerEvents(en bool) []protocol.LogEvent {
	open := "早。"
	if en {
		open = "Morning."
	}
	note := protocol.Finds{NoteID: "no", Rung: "morning", Opening: open}
	evs := []protocol.LogEvent{}
	for i, r := range offerRows {
		text, label := r.zh, r.go1zh
		if en {
			text, label = r.en, r.go1en
		}
		id := "fo" + itoa(int64(i))
		note.Finds = append(note.Finds, protocol.FindView{FindID: id, Kind: r.kind, Text: text, DecisionID: "do" + itoa(int64(i)), GoLabel: label, Offer: true,
			How: []protocol.FindHow{{What: "mail", From: "example", At: "2026-11-20T06:00:00Z"}}})
		evs = append(evs, ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: "do" + itoa(int64(i)), Question: text, GoLabel: label, DefaultOption: "hold", FindID: id, Offer: true}))
	}
	return append(evs, ev("channel", protocol.KindFinds, note))
}

func TestOffersInTheNote(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "events", Events: offerEvents(false)})
	tt := ui.NewTesterWith(app.View, 1100, 1300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if tt.HasText("先等等") {
		t.Errorf("an offer shows Hold: %q", tt.Texts())
	}
	if !tt.HasText(offerRows[2].zh) || tt.HasText(offerRows[3].zh) || !tt.HasText("还有几条") {
		t.Errorf("want three shown and 还有几条, got %q", tt.Texts())
	}
	if len(app.partnerDecisions()) != 0 || len(app.S.OpenDecisions()) != 0 {
		t.Errorf("offers counted as needs-you: %d", len(app.S.OpenDecisions()))
	}
	*sent = nil
	if err := tt.Click("还有几条"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText(offerRows[4].zh) || !tt.HasText("收起") {
		t.Errorf("the fold didn't open: %q", tt.Texts())
	}
	// D464: the offers it brought into view are counted as opened (the home logs each once).
	if want := (protocol.FindOpen{T: "find_open", FindIDs: []string{"fo3", "fo4"}, What: "more"}); len(*sent) != 1 || !reflect.DeepEqual((*sent)[0], want) {
		t.Errorf("还有几条 sent %#v", *sent)
	}
	*sent = nil
	if err := tt.Click("怎么知道的"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if want := (protocol.FindOpen{T: "find_open", FindIDs: []string{"fo0"}, What: "how"}); len(*sent) != 1 || !reflect.DeepEqual((*sent)[0], want) {
		t.Errorf("怎么知道的 sent %#v", *sent)
	}
	// Go acts at once.
	*sent = nil
	if err := tt.Click("好，" + offerRows[0].go1zh); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if got := lastSentFrame(*sent); got != (protocol.Decide{T: "decide", DecisionID: "do0", Option: "go"}) {
		t.Fatalf("Go sent %#v", *sent)
	}
	// One let be fades: its words stay; no button, no 已跳过.
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "do1", Option: "hold", By: "default"}),
		ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fo1", Kind: "waiting_on_you", State: "passed"}),
	}})
	tt.Frame()
	if !tt.HasText(offerRows[1].zh) || tt.HasText("已跳过") || tt.HasText("好，"+offerRows[1].go1zh) {
		t.Errorf("a faded offer: %q", tt.Texts())
	}
}

// Shots for review (D75: outside git):
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/proactive-453 go test ./internal/views -run OfferShots
func TestOfferShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, stage := range []string{"folded", "open", "faded"} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.Receive(protocol.ServerFrame{T: "events", Events: offerEvents(lang == i18n.EN)})
				if stage != "folded" {
					app.open["more:note:"+itoa(app.S.Channel[len(app.S.Channel)-1].FirstSeq)] = true
				}
				if stage == "faded" {
					app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
						ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "do0", Option: "go", By: "user"}),
						ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fo0", Kind: "coming_up", State: "go"}),
						ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "do1", Option: "hold", By: "default"}),
						ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fo1", Kind: "waiting_on_you", State: "passed"}),
						ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "do3", Option: "hold", By: "default"}),
						ev("channel", protocol.KindFindState, protocol.FindState{FindID: "fo3", Kind: "service", State: "passed"}),
					}})
				}
				tt := ui.NewTesterWith(app.View, 1400, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
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
				f, err := os.Create(filepath.Join(dir, "mac-"+stage+"-"+string(lang)+"-"+theme+".png"))
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
