package views

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D405: 小应用 / Apps on the Mac. The fixture is the Beijing trip's
// expenses app: made in the conversation, changed by talking, and its own
// ask answered; the bridge carries a window's writes, asks and answers.

func appWords(lang i18n.Lang, zh, en string) string {
	if lang == i18n.ZH {
		return zh
	}
	return en
}

func appsApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.Local = hints.Open(t.TempDir())
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	w := func(zh, en string) string { return appWords(lang, zh, en) }
	name := w("北京出差花销", "Beijing trip expenses")
	evs := []protocol.LogEvent{
		protocol.NewEvent(1, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("给我做个小应用，记一下这趟北京出差的花销，按天列，带个合计", "Make me a little app to keep this Beijing trip's costs, by day, with a total")}),
		protocol.NewEvent(2, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w("做好了，记一笔就自动加总，按天排好。", "Done: add a cost and it totals itself, sorted by day."), ReplyTo: 1, App: &protocol.AppCard{ID: "a1b2c3", Name: name, Version: 1, Change: "made"}}),
		protocol.NewEvent(3, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("预算按 3000 算，超了标红", "Set a 3,000 budget and show red when I'm over"), App: &protocol.AppRef{ID: "a1b2c3", Name: name}}),
		protocol.NewEvent(4, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w("加好了：上面一条预算条，还剩多少一眼就看到。", "Added a budget bar at the top, so what's left shows at a glance."), ReplyTo: 3, App: &protocol.AppCard{ID: "a1b2c3", Name: name, Version: 2, Change: "changed"}}),
		protocol.NewEvent(5, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("报销要准备什么？", "What do I need for the claim?"), App: &protocol.AppRef{ID: "a1b2c3", Name: name, Ask: "q1"}}),
		protocol.NewEvent(6, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w("发票抬头写公司全称，酒店要住宿发票和水单，打车留行程单。", "Receipts made out to the company, the hotel's invoice and folio, and the ride receipts."), AppAnswer: &protocol.AppAnswer{ID: "a1b2c3", Ask: "q1"}}),
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 6})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	f, err := protocol.DecodeServerFrame([]byte(fmt.Sprintf(`{"t":"apps","apps":[{"id":"a1b2c3","name":%q,"persona":"default","made":"2026-11-20T00:45:00Z","updated":"2026-11-20T00:47:00Z","version":2,"size":5200,"back":true}]}`, name)))
	if err != nil {
		t.Fatal(err)
	}
	app.Receive(f)
	return app, sent
}

func TestAppsCardLineAndOpen(t *testing.T) {
	app, _ := appsApp(t, i18n.ZH)
	var opened []string
	app.OpenAppWindow = func(id, name string) { opened = append(opened, id+" "+name) }
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, want := range []string{"北京出差花销", "改好了", unjoin(keepWords(autospace("关于「北京出差花销」"))), unjoin(keepWords(autospace("「北京出差花销」问"))), "打开"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// The app's own ask sits on the left, not in the person's bubble on the right;
	// the person's own words about the app stay on the right.
	ask, ok1 := tt.Find("报销要准备什么？")
	own, ok2 := tt.Find("预算按 3000 算，超了标红")
	if !ok1 || !ok2 || ask.X > 640 || own.X+own.W < 640 {
		t.Errorf("the app's ask at %v, the person's words at %v", ask, own)
	}
	if err := tt.Click(app.L.T("app.open")); err != nil {
		t.Fatal(err)
	}
	if len(opened) != 1 || opened[0] != "a1b2c3 北京出差花销" {
		t.Errorf("open %v", opened)
	}
	// Gone from the list: the card says so and offers no Open.
	app.Receive(protocol.ServerFrame{T: "apps", AppsF: &protocol.AppsFrame{T: "apps", Apps: []protocol.AppMeta{{ID: "zz", Name: "x"}}}})
	tt.Frame()
	if !tt.HasText(unjoin(keepWords(autospace("这个小应用已经删掉了。")))) {
		t.Errorf("gone %q", tt.Texts())
	}
}

func TestAppsBridge(t *testing.T) {
	app, sent := appsApp(t, i18n.EN)
	b := app.Bridge()
	done := make(chan *protocol.AppOpen, 1)
	go func() {
		o, _ := b.Open("a1b2c3", true)
		done <- o
	}()
	var req protocol.AppOpenReq
	for i := 0; i < 200; i++ {
		if r, ok := lastPast[protocol.AppOpenReq](*sent); ok {
			req = r
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if req.ID != "a1b2c3" || req.Transport != "fetch" || !req.Dark {
		t.Fatalf("open req %#v", req)
	}
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"app_open","id":"a1b2c3","app":{"id":"a1b2c3","name":"x","persona":"default","made":"","updated":"","version":2,"size":3,"doc":"<p>hi</p>","data":{"k":1}}}`))
	if err != nil {
		t.Fatal(err)
	}
	app.Receive(f)
	if o := <-done; o == nil || o.Doc != "<p>hi</p>" {
		t.Fatalf("doc %#v", o)
	}
	b.Post("a1b2c3", []byte(`{"t":"put","key":"expenses","value":[1,2]}`))
	b.Post("a1b2c3", []byte(`{"t":"ask","text":"hi","ref":"r1"}`))
	if p, ok := lastPast[protocol.AppPutReq](*sent); !ok || p.Key != "expenses" || string(p.Value) != "[1,2]" {
		t.Errorf("put %#v", p)
	}
	if q, ok := lastPast[protocol.AppAskReq](*sent); !ok || q.Ref != "r1" || q.Text != "hi" {
		t.Errorf("ask %#v", q)
	}
	// Data from elsewhere, and the answer, reach the window's long poll in order.
	d, _ := protocol.DecodeServerFrame([]byte(`{"t":"app_data","id":"a1b2c3","key":"budget","value":3000,"by":"partner"}`))
	app.Receive(d)
	ans, _ := json.Marshal(protocol.AIMsg{Text: "Keep the receipts.", AppAnswer: &protocol.AppAnswer{ID: "a1b2c3", Ask: "r1"}})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{{Seq: 9, Stream: "channel", Origin: protocol.OriginPartner, Kind: protocol.KindAIMsg, Body: ans}}})
	evs, next := b.Events("a1b2c3", 0, time.Second)
	if len(evs) != 2 || next != 2 {
		t.Fatalf("events %d next %d", len(evs), next)
	}
	var e0, e1 map[string]any
	_ = json.Unmarshal(evs[0], &e0)
	_ = json.Unmarshal(evs[1], &e1)
	if e0["t"] != "data" || e0["key"] != "budget" || e1["t"] != "answer" || e1["text"] != "Keep the receipts." || e1["ref"] != "r1" {
		t.Errorf("events %v %v", e0, e1)
	}
	if evs, _ := b.Events("a1b2c3", 2, 20*time.Millisecond); len(evs) != 0 {
		t.Errorf("nothing new %v", evs)
	}
}

// The Mac screens of D405, zh and en, light and dark, 1280 and 720 wide:
//
//	DUCTER_APPS_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/apps/mac go test ./internal/views -run AppsShots
func TestAppsShots(t *testing.T) {
	if os.Getenv("DUCTER_APPS_SHOTS") == "" {
		t.Skip("DUCTER_APPS_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, width := range []int{1280, 720} {
				app, _ := appsApp(t, lang)
				tt := ui.NewTesterWith(app.View, width, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				mode := "light"
				if dark {
					mode = "dark"
				}
				shotTester(t, tt, fmt.Sprintf("mac-apps-conv-%d-%s-%s", width, lang, mode))
			}
		}
	}
}
