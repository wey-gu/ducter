package views

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D383: 给你做的 / Made for you, Past tasks' middle tab. The fixture is
// obviously fake: a Kyoto itinerary a task wrote, a visa PDF and a booking
// page's picture it showed, a Mac comparison and a pinned packing list from
// replies, a PR it opened.

func madeAgo(d time.Duration) string { return pastNow.Add(-d).UTC().Format(time.RFC3339) }

// madePreview is a tiny picture of a confirmation page (white, a blue band, grey lines).
func madePreview() string {
	img := image.NewRGBA(image.Rect(0, 0, 48, 48))
	for y := 0; y < 48; y++ {
		for x := 0; x < 48; x++ {
			c := color.RGBA{250, 250, 247, 255}
			switch {
			case y < 11:
				c = color.RGBA{46, 98, 168, 255}
			case (y == 18 || y == 24 || y == 30) && x > 6 && x < 40:
				c = color.RGBA{190, 190, 186, 255}
			case y > 36 && y < 42 && x > 6 && x < 22:
				c = color.RGBA{72, 156, 98, 255}
			}
			img.Set(x, y, c)
		}
	}
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())
}

func madeItems(lang i18n.Lang) []protocol.MadeItem {
	w := func(zh, en string) string { return pastWord(lang, zh, en) }
	table := &protocol.RichUI{Type: "table", Title: w("M4 Pro 对 M4 Max", "M4 Pro vs M4 Max"), Columns: []string{"", "M4 Pro", "M4 Max"},
		Rows: [][]string{{w("CPU", "CPU"), w("14 核", "14-core"), w("16 核", "16-core")}, {w("价格", "Price"), "¥16,999", "¥27,999"}}, Plain: "x"}
	list := &protocol.RichUI{Type: "checklist", Title: w("大阪行李清单", "Osaka packing list"), Items: []string{w("护照", "Passport"), w("日元现金", "Yen in cash"), w("充电宝", "Power bank")}, Plain: "x"}
	return []protocol.MadeItem{
		{ID: "b:41:0", Kind: "list", Title: list.Title, At: madeAgo(2 * time.Hour), Block: list, Seq: 41, Pinned: true, Ask: w("12 月 20 号去大阪，帮我列个要带的东西", "Off to Osaka on Dec 20: make me a packing list")},
		{ID: "u:https://github.com/example/fakedb/pull/412", Kind: "link", Title: "PR #412", At: madeAgo(26 * time.Hour), URL: "https://github.com/example/fakedb/pull/412", Task: &protocol.MadeTask{TaskID: "t_fix", Title: w("修 snapshot 测试偶尔失败", "Fix the flaky snapshot test")}},
		{ID: "b:30:0", Kind: "table", Title: table.Title, At: madeAgo(2 * day), Block: table, Seq: 30, Ask: w("M4 Pro 和 M4 Max 比一下", "Compare the M4 Pro and the M4 Max")},
		{ID: "m:" + "b0", Kind: "picture", Title: "booking-confirmation.png", At: madeAgo(5 * day), Media: &protocol.MediaRef{ID: "b0", Type: "image/png", Bytes: 182_400, Name: "booking-confirmation.png", K: "fake.key", Preview: madePreview()}, Task: &protocol.MadeTask{TaskID: "t_visa", Title: w("填日本签证申请", "Fill the Japan visa application")}},
		{ID: "m:" + "a0", Kind: "file", Title: "japan-visa-application.pdf", At: madeAgo(5 * day), Media: &protocol.MediaRef{ID: "a0", Type: "application/pdf", Bytes: 48_000, Name: "japan-visa-application.pdf", K: "fake.key"}, Task: &protocol.MadeTask{TaskID: "t_visa", Title: w("填日本签证申请", "Fill the Japan visa application")}},
		{ID: "p:t_kyoto:/fake/.ducter/scratch/t_kyoto/kyoto-itinerary.md", Kind: "file", Title: "kyoto-itinerary.md", At: madeAgo(9 * day), Path: "/fake/.ducter/scratch/t_kyoto/kyoto-itinerary.md", Task: &protocol.MadeTask{TaskID: "t_kyoto", Title: w("排 12 月京都三日行程", "Plan three days in Kyoto in December")}},
	}
}

func madeResult(items []protocol.MadeItem, id string) protocol.ServerFrame {
	n := map[string]int{}
	for _, it := range items {
		n[it.Kind]++
	}
	var kinds []protocol.MadeKindN
	for _, k := range protocol.MadeKinds {
		if n[k] > 0 {
			kinds = append(kinds, protocol.MadeKindN{Kind: k, N: n[k]})
		}
	}
	return protocol.ServerFrame{T: "made_result", Made: &protocol.MadeFrame{T: "made_result", ID: id, Items: items, Total: len(items), Kinds: kinds}}
}

func TestMadeFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"made_result","id":"m2","items":[{"id":"b:3:0","kind":"table","title":"M4","at":"2026-11-17T10:00:00Z","ask":"比一下","block":{"type":"table","columns":["a","b"],"rows":[["1","2"]],"plain":"x"},"seq":3,"pinned":true,"hit":{"field":"content","text":"M4 Max"}},{"id":"m:ff","kind":"file","title":"v.pdf","at":"x","media":{"id":"ff","type":"application/pdf","bytes":10,"name":"v.pdf","k":"k"},"task":{"taskId":"t1","title":"visa"}}],"total":2,"kinds":[{"kind":"file","n":1},{"kind":"table","n":1}],"range":{"since":"a","before":"b","words":"上周"},"kind":"table"}`))
	if err != nil || f.Made == nil {
		t.Fatalf("made_result %v %#v", err, f)
	}
	m := f.Made
	if m.ID != "m2" || len(m.Items) != 2 || m.Range.Words != "上周" || m.Kind != "table" || len(m.Kinds) != 2 || len(f.SavedItems) != 0 {
		t.Fatalf("frame %#v", m)
	}
	if b := m.Items[0]; b.Block == nil || b.Block.Type != "table" || !b.Pinned || b.Seq != 3 || b.Hit.Field != "content" {
		t.Errorf("block item %#v", b)
	}
	if x := m.Items[1]; x.Media == nil || x.Media.Name != "v.pdf" || x.Task.TaskID != "t1" {
		t.Errorf("file item %#v", x)
	}
}

func TestMadeTab(t *testing.T) {
	app, sent := pastApp(t, i18n.ZH)
	var opened []string
	app.OpenExternal = func(u string) error { opened = append(opened, u); return nil }
	app.OpenPast("")
	app.past.tab = "made"
	tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	q, ok := lastPast[protocol.MadeReq](*sent)
	if !ok || q.T != "made" || q.Query.Q != "" {
		t.Fatalf("the tab asks %#v", *sent)
	}
	app.Receive(madeResult(madeItems(i18n.ZH), q.ID))
	tt.Frame()
	for _, want := range []string{"给你做的", "kyoto-itinerary.md", unjoin(keepWords(autospace("来自「排 12 月京都三日行程」"))), unjoin(keepWords(autospace("你问的：M4 Pro 和 M4 Max 比一下"))), "已置顶", "PR", "PDF", "看那个任务", "上周", "今天"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// A chip asks at once with its kind; words wait for the rest.
	app.past.made.kind = "table"
	tt.Frame()
	if q, _ = lastPast[protocol.MadeReq](*sent); q.Query.Kind != "table" {
		t.Fatalf("chip %#v", q)
	}
	app.past.made.kind = ""
	app.Receive(madeResult(madeItems(i18n.ZH), ""))
	tt.Frame()
	// A table opens in place; a link in the browser; a file on a computer through file_open.
	if err := tt.Click("M4 Pro 对 M4 Max"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.past.made.open != "b:30:0" || !hasText(tt, "¥27,999") {
		t.Errorf("the table drawn again: open %q texts %q", app.past.made.open, tt.Texts())
	}
	if err := tt.Click("PR #412"); err != nil {
		t.Fatal(err)
	}
	if len(opened) != 1 || opened[0] != "https://github.com/example/fakedb/pull/412" {
		t.Errorf("link %v", opened)
	}
	if err := tt.Click("kyoto-itinerary.md"); err != nil {
		t.Fatal(err)
	}
	if fo, ok := lastPast[protocol.FileOpenReq](*sent); !ok || fo.Path != "/fake/.ducter/scratch/t_kyoto/kyoto-itinerary.md" || fo.TaskID != "t_kyoto" {
		t.Errorf("file_open %#v", fo)
	}
	app.fileView = nil
	tt.Frame()
	if err := tt.Click("booking-confirmation.png"); err != nil {
		t.Fatal(err)
	}
	if v := app.med().viewer; v == nil || len(v.items) != 1 || v.items[0].ID != "b0" {
		t.Errorf("picture viewer %#v", v)
	}
	app.med().viewer = nil
	// Nothing found says so with the partner's name; Esc clears the words, then goes back.
	app.past.q = "婚礼座位表"
	app.Receive(madeResult(nil, ""))
	tt.Frame()
	if !hasText(tt, "找到 0 个") && !hasText(tt, app.L.T("made.none", firstNonEmpty(app.defaultName(), "Ducter"))) {
		t.Errorf("none %q", tt.Texts())
	}
	app.pastEsc()
	if app.past.q != "" || app.Route != RoutePast {
		t.Errorf("esc %q %v", app.past.q, app.Route)
	}
}

// The Mac screens of D383, zh and en, light and dark, 1280 and 720 wide:
//
//	DUCTER_MADE_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/made-things/mac go test ./internal/views -run MadeShots
func TestMadeShots(t *testing.T) {
	if os.Getenv("DUCTER_MADE_SHOTS") == "" {
		t.Skip("DUCTER_MADE_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			app, _ := pastApp(t, lang)
			tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetScale(2)
			tt.SetDark(dark)
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			paper := "light"
			if dark {
				paper = "dark"
			}
			shot := func(name string, w, h int) {
				t.Helper()
				tt.SetSize(w, h)
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(200 * time.Millisecond)
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-made-%s-%s-%s.png", name, lang, paper)))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
			}
			app.OpenPast("")
			app.past.tab = "made"
			app.past.focusField = false
			items := madeItems(lang)
			app.Receive(madeResult(items, ""))
			shot("browse", 1280, 900)
			shot("browse-720", 720, 900)
			// The table drawn again under its card.
			app.past.made.open = "b:30:0"
			shot("table-open", 1280, 900)
			app.past.made.open = ""
			// "上周做的那个行程表": the range said under the field, the hit on the task.
			app.past.q = pastWord(lang, "上周做的那个行程表", "last week's itinerary")
			kyoto := items[5]
			kyoto.Hit = &protocol.MadeHit{Field: "task", Text: kyoto.Task.Title}
			r := madeResult([]protocol.MadeItem{kyoto}, "")
			r.Made.Range = &protocol.PastRange{Since: "2026-11-09T00:00:00+08:00", Before: "2026-11-16T00:00:00+08:00", Words: pastWord(lang, "上周", "last week")}
			app.Receive(r)
			shot("search", 1280, 900)
			shot("search-720", 720, 900)
			// Nothing like it; nothing made yet.
			app.past.q = pastWord(lang, "婚礼座位表", "wedding seating chart")
			app.Receive(madeResult(nil, ""))
			shot("none", 1280, 700)
			app.past.q = ""
			app.Receive(madeResult(nil, ""))
			shot("empty", 1280, 700)
		}
	}
}
