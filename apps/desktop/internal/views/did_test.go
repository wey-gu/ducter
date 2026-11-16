package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D300: 替你做过的 / Done for you on the Mac.

// didTester is a window tall enough for the whole fixture.
func didTester(app *App) *ui.Tester {
	tt := ui.NewTesterWith(app.View, 1280, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	return tt
}

// didNoJoined: D291, never two facts joined in one text, shown or spoken.
func didNoJoined(t *testing.T, texts []string) {
	t.Helper()
	for _, s := range texts {
		if strings.Contains(s, " · ") || strings.Contains(s, " • ") {
			t.Errorf("joined facts %q", s)
		}
	}
}

func TestDidFrameDecodes(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"did_result","id":"did2","items":[{"id":"e7","kind":"paid","sub":"card","at":"2026-11-19T02:41:00Z","to":"hotel-okura.jp","amount":"USD 128.00","who":{"by":"task","taskId":"t1","title":"Book"},"go":{"by":"you","at":"2026-11-19T02:40:00Z"},"where":{"kind":"browser","name":"Mac"},"taskId":"t1"},{"id":"e8","kind":"changed","sub":"files","at":"2026-11-19T02:00:00Z","count":3,"files":{"added":1,"changed":2,"removed":0},"who":{"by":"task"},"undo":{"kind":"folder","taskId":"t2","until":"2026-11-25T00:00:00Z"}}],"counts":{"paid":1,"changed":1},"since":"2026-11-13T00:00:00Z","before":"2026-11-20T00:00:00Z","more":true}`))
	if err != nil {
		t.Fatal(err)
	}
	d := f.DidFor
	if d == nil || d.ID != "did2" || len(d.Items) != 2 || d.Counts["paid"] != 1 || !d.More {
		t.Fatalf("did_result %#v", d)
	}
	if it := d.Items[0]; it.Amount != "USD 128.00" || it.Go.By != "you" || it.Where.Name != "Mac" || it.Who.TaskID != "t1" {
		t.Errorf("paid %#v", it)
	}
	if it := d.Items[1]; it.Undo == nil || it.Undo.TaskID != "t2" || it.Files.Changed != 2 {
		t.Errorf("files %#v", it)
	}
	if len(f.SavedItems) != 0 {
		t.Errorf("did items landed in Autofill's: %#v", f.SavedItems)
	}
}

func TestDidRendersAndAsks(t *testing.T) {
	app, sent := pastApp(t, i18n.ZH)
	app.OpenDid()
	q, ok := lastPast[protocol.DidReq](*sent)
	if !ok || q.Query.Q != "" || len(q.Query.Kinds) != 0 || q.Query.Since != didAt(6, 0, 0) {
		t.Fatalf("opening asks %#v", q)
	}
	items := didDayItems(i18n.ZH)
	app.Receive(didResult(items, items, q.ID))
	tt := didTester(app)
	for _, want := range []string{"替你做过的", "今天", "昨天", "发邮件给张伟", "付给 hotel-okura.jp", "USD 128.00", "打给 Sushi Saito",
		"登录了 github.com", "加了日程", "合并了 task/fix-flaky-ci", "改了 14 个文件", "看了 Gmail", "23 次", "发给你的 Claude Code",
		"发消息给妈妈", "周三前可以改回去", "在 Notion 里删了东西", "没人接", "任务「准备 Q4 预算」", "你点了好 9:12", "之前允许过", "Ducter 的浏览器",
		"在 Wey's MacBook Pro 上", "用 Tuwa 的号码", "通过 Gmail", "Ducter 的手机", "用你自己的号码", "例行「早上看邮件」", "没人回，按默认做了",
		"发了 2", "付了 1 笔", "打了 1 个", "更早的", "这里记的是经过 Ducter 的事；任务在电脑上直接跑的命令不在这里。"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// D291: never two facts joined in one text.
	didNoJoined(t, tt.Texts())
	// A filter asks at once, with its kind.
	n := len(*sent)
	if err := tt.Click("付款"); err != nil {
		t.Fatalf("filter: %v", err)
	}
	tt.Frame()
	q, _ = lastPast[protocol.DidReq](*sent)
	if len(*sent) != n+1 || len(q.Query.Kinds) != 1 || q.Query.Kinds[0] != "paid" {
		t.Fatalf("filter asked %#v", (*sent)[n:])
	}
	// Words wait for a rest.
	n = len(*sent)
	app.did.q = "hot"
	tt.Frame()
	app.did.q = "hotel"
	tt.Frame()
	if len(*sent) != n {
		t.Fatalf("asked before the words rested")
	}
	tt.Advance(150 * time.Millisecond)
	tt.Frame()
	q, _ = lastPast[protocol.DidReq](*sent)
	if q.Query.Q != "hotel" || q.Query.Kinds[0] != "paid" {
		t.Errorf("words %#v", q.Query)
	}
	// Nothing found offers All, which clears both.
	app.Receive(didResult(nil, items, q.ID))
	tt.Frame()
	if !tt.HasText("没有找到") {
		t.Fatalf("no Nothing found in %q", tt.Texts())
	}
	// Esc clears the words, then the filter, then goes back.
	app.Route = RouteDid
	app.did.back = RouteOnHand
	app.didEsc()
	if app.did.q != "" || app.did.kind != "paid" {
		t.Errorf("Esc first clears the words: %#v", app.did)
	}
	app.didEsc()
	app.didEsc()
	if app.Route != RouteOnHand {
		t.Errorf("Esc went to %v", app.Route)
	}
	// Earlier asks seven days more.
	app.OpenDid()
	app.Receive(didResult(items, items, ""))
	tt.Frame()
	if err := tt.Click("更早的"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	q, _ = lastPast[protocol.DidReq](*sent)
	if q.Query.Since != didAt(13, 0, 0) {
		t.Errorf("Earlier since %q", q.Query.Since)
	}
}

func TestDidUndoOnlyWhereItExists(t *testing.T) {
	app, sent := pastApp(t, i18n.EN)
	app.OpenDid()
	items := didDayItems(i18n.EN)
	app.Receive(didResult(items, items, ""))
	tt := didTester(app)
	n := 0
	for _, s := range tt.Texts() {
		if s == "Undo" {
			n++
		}
	}
	if n != 1 || !tt.HasText("Can be undone until Wed") {
		t.Fatalf("%d Undo in %q", n, tt.Texts())
	}
	if err := tt.Click("Undo, Changed 14 files"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	a, ok := lastPast[protocol.TaskAction](*sent)
	if !ok || a.TaskID != "t_docs" || a.Action != "undo" {
		t.Fatalf("undo sent %#v", a)
	}
	// Past its keep, or with none, no Undo.
	items[1].Undo.Until = pastNow.Add(-time.Hour).UTC().Format(time.RFC3339)
	app.did.undoing = nil
	app.Receive(didResult(items, items, ""))
	tt.Frame()
	if tt.HasText("Undo") {
		t.Errorf("an expired Undo shows")
	}
	// Open the task goes there; Esc comes back.
	if err := tt.Click("Open the task, Paid hotel-okura.jp"); err != nil {
		t.Fatal(err)
	}
	if app.Route != RouteTask || app.TaskID != "t_tokyo" {
		t.Fatalf("open: %v %q", app.Route, app.TaskID)
	}
	app.Up()
	if app.Route != RouteDid {
		t.Errorf("back from the task: %v", app.Route)
	}
}

func TestDidEmptyDay(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		app.OpenDid()
		items := didQuietItems(lang)
		app.Receive(didResult(items, items, ""))
		tt := didTester(app)
		want := []string{"今天没有替你发出、付过或打过什么。", "看了 2 个账户", "改了 1 处"}
		if lang == i18n.EN {
			want = []string{"Nothing sent, paid or called for you today.", "Looked at 2 accounts", "1 change"}
		}
		for _, w := range want {
			if !tt.HasText(w) {
				t.Errorf("%s: no %q in %q", lang, w, tt.Texts())
			}
		}
		// Nothing at all: still today, and Nothing else either.
		app.Receive(didResult(nil, nil, ""))
		tt.Frame()
		if w := pastWord(lang, "其他也没有", "Nothing else either"); !tt.HasText(w) {
			t.Errorf("%s: no %q in %q", lang, w, tt.Texts())
		}
	}
}

func TestDidWaysIn(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t_w", Title: "修 CI", Attention: protocol.Working}}}})
	app.Route = RouteOnHand
	tt := didTester(app)
	if err := tt.Click("替你做过的"); err != nil {
		t.Fatalf("On hand's end line: %v (%q)", err, tt.Texts())
	}
	if app.Route != RouteDid {
		t.Fatalf("route %v", app.Route)
	}
	app.didEsc()
	if app.Route != RouteOnHand {
		t.Errorf("Esc went to %v", app.Route)
	}
	// ⌘⇧Y (in the conversation it is the menu bar's: the composer has the keys).
	app.Route = RouteOnHand
	tt.Frame()
	tt.Key(ui.Cmd|ui.Shift, ui.KeyY)
	tt.Frame()
	if app.Route != RouteDid {
		t.Errorf("⌘⇧Y: %v", app.Route)
	}
	// Under the morning note.
	app.Route = RouteConversation
	app.Receive(protocol.ServerFrame{T: "events", Events: morningEvents()})
	tt.SetSize(1100, 1400)
	tt.Frame()
	tt.Frame()
	if err := tt.Click("替你做过的"); err != nil {
		t.Fatalf("the morning note's line: %v (%q)", err, tt.Texts())
	}
	if app.Route != RouteDid {
		t.Errorf("morning line: %v", app.Route)
	}
}
