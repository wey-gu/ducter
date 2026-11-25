package views

import (
	"fmt"
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

// D357: 你的待办 / Your to-dos on On hand, on the Mac. The fixture is the
// author's load: GitHub alone, 557 open, 4 PRs waiting for review; the home
// shows a review request, a mention and the newest.

func todoGlanceFrame(lang i18n.Lang) protocol.ServerFrame {
	w := todoWords(lang)
	now := time.Now()
	ago := func(d time.Duration) string { return now.Add(-d).UTC().Format(time.RFC3339) }
	at := ago(time.Minute)
	item := func(n int, repo, title string, o func(*protocol.SourceItem)) protocol.SourceItem {
		it := protocol.SourceItem{SourceItemRef: protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: fmt.Sprintf("%s#%d", repo, n), Label: fmt.Sprintf("#%d", n), Where: repo,
			Title: title, URL: fmt.Sprintf("https://github.com/%s/issues/%d", repo, n)}, State: "open"}
		if o != nil {
			o(&it)
		}
		return it
	}
	return protocol.ServerFrame{T: "sources", Sources: &protocol.SourcesFrame{View: &protocol.SourcesView{
		Sources: []protocol.SourceView{{ID: "src_gh", Kind: "github", Name: "lin-dev", State: "ok", WhenNew: "tell", WhenDone: "ask", Open: 557, Review: 4, CheckedAt: at}},
		Glance: []protocol.SourceGlance{
			{SourceItem: item(377, "acme/web", w("登录页可以只用键盘操作", "Make the sign-in page keyboard friendly"), func(i *protocol.SourceItem) {
				i.PR, i.Review, i.Author, i.UpdatedAt = true, true, "mei-chen", ago(25*time.Minute)
			}), Why: "review"},
			{SourceItem: item(352, "acme/api", w("两个标签页同时打开时令牌刷新会抢", "Token refresh races when two tabs are open"), func(i *protocol.SourceItem) {
				i.Labels, i.UpdatedAt = []string{"bug"}, ago(70*time.Minute)
			}), Why: "mentioned"},
			{SourceItem: item(100, "acme/web", w("设置页保存后滚动位置丢了", "Settings page loses scroll position after saving"), func(i *protocol.SourceItem) {
				i.UpdatedAt = ago(3 * time.Hour)
			}), Why: "recent"},
		},
	}}}
}

// todoFoldPage is one page of the fold's answer.
func todoFoldPage(lang i18n.Lang, cid string, page int, more bool) protocol.ServerFrame {
	w := todoWords(lang)
	titles := []string{w("深色模式下日期选择器还是白的", "Dark mode: the date picker stays white"), w("Webhook 重试不看 Retry-After", "Webhook retries ignore Retry-After"),
		w("删掉行以后分页游标会断", "Pagination cursor breaks on deleted rows"), w("大分片上夜里的备份超时", "Nightly backup job times out on the big shard")}
	var items []protocol.SourceItem
	for i, title := range titles {
		n := 100 + page*10 + i
		items = append(items, protocol.SourceItem{SourceItemRef: protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: fmt.Sprintf("acme/web#%d", n), Label: fmt.Sprintf("#%d", n), Where: "acme/web", Title: title,
			URL: fmt.Sprintf("https://github.com/acme/web/issues/%d", n)}, State: "open", UpdatedAt: time.Now().Add(-time.Duration(4+i) * time.Hour).UTC().Format(time.RFC3339)})
	}
	return protocol.ServerFrame{T: "source_items_result", Sources: &protocol.SourcesFrame{ClientID: cid, Items: items, Page: page, More: more, Wheres: []string{"acme/web", "acme/api", "acme/infra"}}}
}

// The group: named by its one source, its count, at most three cards with
// why each stands, the fold line counting the rest; nothing with no source.
func TestTodoGroupOnHand(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := todoWords(lang)
		app, sent, tt := todoApp(t, lang, 1280, 2200)
		app.Receive(todoGlanceFrame(lang))
		app.Route = RouteOnHand
		todoFrames(tt, 4)
		for _, want := range []string{w("GitHub 上标给你的", "Assigned to you on GitHub"), "557", w("等你 review", "Waiting for your review"), w("提到了你", "Mentions you"),
			w("mei-chen 提的", "By mei-chen"), w("还有 555 个", "555 more"), app.L.T("onhand.todos.hand", app.personaName()), app.L.T("todos.chip.open", "GitHub")} {
			if !hasText(tt, want) {
				t.Errorf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		// 交给{name}: New task's path with the to-do, handed, no place.
		if err := tt.Click(spoken(app.L, app.L.T("onhand.todos.hand", app.personaName()), w("两个标签页同时打开时令牌刷新会抢", "Token refresh races when two tabs are open"))); err != nil {
			t.Fatalf("%v in %q", err, tt.Texts())
		}
		f, ok := lastSent[protocol.TaskNew](*sent)
		if !ok || !f.Handed || f.Item == nil || f.Item.Ref != "acme/api#352" || f.Place != nil || f.Words == "" {
			t.Fatalf("hand over sends %+v", f)
		}
		todoFrames(tt, 1)
		if !hasText(tt, app.L.T("onhand.todos.handing", app.personaName())) {
			t.Errorf("%s: handing over isn't said: %q", lang, tt.Texts())
		}
		// A refusal says why on the card.
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: false, ClientID: f.ClientID, Reason: "no_agent"})
		todoFrames(tt, 2)
		if !hasText(tt, app.L.T("newtask.err.no_agent")) {
			t.Errorf("%s: the refusal isn't said: %q", lang, tt.Texts())
		}
		// No source: nothing at all.
		app.Receive(protocol.ServerFrame{T: "sources", Sources: &protocol.SourcesFrame{View: &protocol.SourcesView{}}})
		todoFrames(tt, 2)
		if hasText(tt, w("GitHub 上标给你的", "Assigned to you on GitHub")) || hasText(tt, w("你的待办", "Your to-dos")) {
			t.Errorf("%s: the group shows with no source", lang)
		}
	}
}

// The fold opens in place, asks a page at a time, narrows by the review
// list and a repository, and never says the cards above twice.
func TestTodoFold(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 2600)
	app.Receive(todoGlanceFrame(i18n.ZH))
	app.Route = RouteOnHand
	todoFrames(tt, 3)
	if err := tt.Click("还有 555 个"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	r, ok := lastSent[protocol.SourceItemsReq](*sent)
	if !ok || r.Page != 1 || r.Review || r.Where != nil {
		t.Fatalf("the fold asks %+v", r)
	}
	app.Receive(todoFoldPage(i18n.ZH, r.ClientID, 1, true))
	todoFrames(tt, 3)
	for _, want := range []string{"找标题或编号…", "全部", "等你 review 4", "web", "api", "infra", "深色模式下日期选择器还是白的", "再看 30 个"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click("再看 30 个"); err != nil {
		t.Fatal(err)
	}
	r2, _ := lastSent[protocol.SourceItemsReq](*sent)
	if r2.Page != 2 {
		t.Fatalf("more asks %+v", r2)
	}
	// An old answer never lands.
	app.Receive(todoFoldPage(i18n.ZH, r.ClientID, 1, true))
	app.Receive(todoFoldPage(i18n.ZH, r2.ClientID, 2, false))
	todoFrames(tt, 3)
	if n := len(app.todos.fold.items); n != 8 {
		t.Errorf("two pages hold %d", n)
	}
	if hasText(tt, "再看 30 个") {
		t.Error("more offered after the last page")
	}
	if err := tt.Click("等你 review 4"); err != nil {
		t.Fatal(err)
	}
	if r3, _ := lastSent[protocol.SourceItemsReq](*sent); !r3.Review || r3.Page != 1 {
		t.Fatalf("the review chip asks %+v", r3)
	}
	if err := tt.Click("api"); err != nil {
		t.Fatal(err)
	}
	if r4, _ := lastSent[protocol.SourceItemsReq](*sent); r4.Where == nil || *r4.Where != "acme/api" || r4.Review {
		t.Fatalf("a repository asks %+v", r4)
	}
	// GitHub's rate limit is said.
	r5, _ := lastSent[protocol.SourceItemsReq](*sent)
	app.Receive(protocol.ServerFrame{T: "source_items_result", Sources: &protocol.SourcesFrame{ClientID: r5.ClientID, Page: 1, Limited: true, Errors: []protocol.SourceErr{{Source: "src_gh", Error: "rate limit"}}}})
	todoFrames(tt, 2)
	if !hasText(tt, "GitHub 让我们慢一点。过一分钟再试。") {
		t.Errorf("the rate limit isn't said: %q", tt.Texts())
	}
}

// Settings' counts open On hand at the group: the fold open, the review
// list when that was tapped.
func TestTodoCountsLinkToOnHand(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 1700)
	app.Receive(todoGlanceFrame(i18n.ZH))
	app.openTab(TabTodos)
	todoFrames(tt, 3)
	if err := tt.Click(spoken(app.L, "4 个 PR 等你 review", "在手头的事里看")); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if app.Route != RouteOnHand || !app.todos.fold.open || !app.todos.fold.review {
		t.Fatalf("route %v fold %+v", app.Route, app.todos.fold.open)
	}
	if r, ok := lastSent[protocol.SourceItemsReq](*sent); !ok || !r.Review || r.Page != 1 {
		t.Fatalf("asks %+v", r)
	}
}

func TestTodoGlanceDecodes(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"sources","sources":[],"found":{"vaults":[]},"glance":[{"source":"s","kind":"github","ref":"a/b#1","label":"#1","title":"x","state":"open","review":true,"author":"mei","why":"review"}]}`))
	if err != nil || len(f.Sources.View.Glance) != 1 || f.Sources.View.Glance[0].Why != "review" || !f.Sources.View.Glance[0].Review || f.Sources.View.Glance[0].Author != "mei" {
		t.Fatalf("%v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"source_items_result","clientId":"c","items":[],"page":2,"more":true,"wheres":["a/b"],"tags":["x"],"limited":true}`))
	if err != nil || f.Sources.Page != 2 || !f.Sources.More || f.Sources.Wheres[0] != "a/b" || f.Sources.Tags[0] != "x" || !f.Sources.Limited {
		t.Fatalf("%v %+v", err, f.Sources)
	}
}

// Pictures of the group and its fold, zh and en, light and dark:
//
//	DUCTER_SHOTS_DIR=../../../../.shots/todos-browse go test ./internal/views -run TodoOnHandShots
func TestTodoOnHandShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, fold := range []bool{false, true} {
				app, sent, tt := todoApp(t, lang, 1280, 1500)
				tt.SetDark(dark)
				app.Receive(todoGlanceFrame(lang))
				app.Route = RouteOnHand
				todoFrames(tt, 3)
				name := "group"
				if fold {
					name = "fold"
					app.todos.fold.open = true
					app.askFold(1)
					r, _ := lastSent[protocol.SourceItemsReq](*sent)
					app.Receive(todoFoldPage(lang, r.ClientID, 1, true))
					app.todos.fold.scroll = true
				} else {
					app.todos.fold.scroll = true
				}
				todoFrames(tt, 6)
				paper := ""
				if dark {
					paper = "-dark"
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-onhand-%s-%s%s.png", name, strings.ToLower(string(lang)), paper)))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
				_ = ui.Center
			}
		}
	}
}
