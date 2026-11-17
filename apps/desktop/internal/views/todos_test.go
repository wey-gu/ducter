package views

import (
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D341, 待办来源 / To-do sources on the Mac: the Settings pane, the chip on a
// task and an On hand card, On hand's lens of sources, New task's pick and
// the write-back card. The fixture is a person (lin-dev) with GitHub signed
// in on the home (3 open, 1 being done, take set after two) and an Obsidian
// vault "Life"; Obsidian also lists "Work notes".

func todoWords(lang i18n.Lang) func(z, e string) string {
	return func(z, e string) string {
		if lang == i18n.ZH {
			return z
		}
		return e
	}
}

// todoSourcesFrame is the sources frame of the fixture.
func todoSourcesFrame() protocol.ServerFrame {
	at := time.Now().Add(-26 * time.Hour).UTC().Format(time.RFC3339)
	return protocol.ServerFrame{T: "sources", Sources: &protocol.SourcesFrame{View: &protocol.SourcesView{
		Sources: []protocol.SourceView{
			{ID: "src_gh", Kind: "github", Name: "lin-dev", State: "ok", WhenNew: "take", WhenDone: "ask", Open: 3, Taken: 1,
				Standing: &protocol.SourceStandings{Take: &protocol.SourceStanding{At: at, After: 2}}, CheckedAt: at},
			{ID: "src_life", Kind: "obsidian", Name: "Life", State: "ok", Path: "/Users/lin/Documents/Life", WhenNew: "quiet", WhenDone: "tick", Open: 5, Taken: 1, CheckedAt: at},
		},
		Found: protocol.SourcesFound{
			GitHub: &protocol.SourcesFoundGitHub{State: "ok", Login: "lin-dev", Computer: "Lin's MacBook Pro"},
			Vaults: []protocol.FoundVault{{Name: "Life", Path: "/Users/lin/Documents/Life"}, {Name: "Work notes", Path: "/Users/lin/Documents/Work notes"}},
		},
	}}}
}

func ghRef(n int, title string) protocol.SourceItemRef {
	return protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: fmt.Sprintf("acme/web#%d", n), Label: fmt.Sprintf("#%d", n), Where: "acme/web",
		Title: title, URL: fmt.Sprintf("https://github.com/acme/web/issues/%d", n)}
}

func lifeRef(note, key, title string) protocol.SourceItemRef {
	return protocol.SourceItemRef{Source: "src_life", Kind: "obsidian", Ref: note + ".md::" + key, Label: note, Where: note + ".md", Title: title,
		URL: "obsidian://open?vault=Life&file=" + note + ".md"}
}

// todoComment is the write card's comment, exactly as it goes out.
func todoComment(lang i18n.Lang) string {
	return todoWords(lang)(
		"已在 #18 修好：Safari 下登录后不再反复跳转到 /login。原因是回跳地址被编码了两次，现在只编码一次，并加了一个 Safari 的端到端测试。",
		"Fixed in #18: signing in on Safari no longer bounces back to /login. The return address was encoded twice; it is encoded once now, with an end-to-end test on Safari.")
}

// todoBoard is On hand with three tasks bound to to-dos and two that aren't.
func todoBoard(lang i18n.Lang) protocol.ServerFrame {
	w := todoWords(lang)
	now := time.Now()
	ago := func(d time.Duration) string { return now.Add(-d).UTC().Format(time.RFC3339) }
	repo := func(path, branch string) protocol.Place {
		return protocol.Place{Kind: "repo", Device: "local", RepoPath: path, Branch: branch, BaseBranch: "main", Worktree: "/tmp/wt/" + branch}
	}
	web := "/Users/lin/code/acme-web"
	write := ghRef(9, w("Safari 上登录后反复跳回登录页", "Signing in on Safari loops back to the login page"))
	cards := []protocol.TaskCard{
		{TaskID: "t_safari", Title: w("修好 Safari 上登录后反复跳回登录页", "Fix the Safari sign-in loop"), Project: "acme-web",
			Place: repo(web, "ducter/safari-login"), Harness: "claude-code", Attention: protocol.NeedsYou, OpenedAt: ago(52 * time.Minute), UpdatedAt: ago(3 * time.Minute),
			Changes: &protocol.DiffStat{Files: 3, Adds: 41, Dels: 9, At: ago(time.Minute)},
			Source:  &protocol.TaskSource{SourceItemRef: write},
			PendingDecision: &protocol.PendingDecision{AskedAt: ago(3 * time.Minute), Decision: protocol.Decision{DecisionID: "d_write", TaskID: "t_safari",
				Question: w("在 acme/web#9 下留言并关掉它？", "Comment on acme/web#9 and close it?"), GoLabel: w("留言并关掉", "Comment and close"),
				HoldLabel: w("暂不留言", "Not now"), DefaultOption: "hold", Reversible: false,
				Src: &protocol.SourceAsk{Kind: "write", Item: write, Text: todoComment(lang), Close: true, TaskID: "t_safari"}}}},
		{TaskID: "t_dark", Title: w("设置页跟随系统的深色模式", "Settings page follows the system's dark mode"), Project: "acme-web",
			Place: repo(web, "ducter/settings-dark"), Harness: "codex", Attention: protocol.Working, OpenedAt: ago(35 * time.Minute), UpdatedAt: ago(time.Minute),
			Changes: &protocol.DiffStat{Files: 5, Adds: 120, Dels: 33, At: ago(time.Minute)},
			Source:  &protocol.TaskSource{SourceItemRef: ghRef(12, w("设置页不跟随深色模式", "Settings page ignores dark mode")), Wrote: []string{"comment"}}},
		{TaskID: "t_passport", Title: w("续签护照：约好时间，列好要带的材料", "Renew the passport: book a slot and list what to bring"),
			Place: protocol.Place{Kind: "none"}, Harness: "claude-code", Attention: protocol.Done, OpenedAt: ago(3 * time.Hour), UpdatedAt: ago(2 * time.Hour),
			Source: &protocol.TaskSource{SourceItemRef: lifeRef(w("杂事", "Errands"), "^passport", w("续签护照", "Renew passport")), Wrote: []string{"tick"}}},
		{TaskID: "t_ci", Title: w("把 Linux 上偶发超时的 runner 测试修好", "Fix the runner tests that time out on Linux"), Project: "ducter",
			Place: repo("/Users/lin/code/ducter", "ducter/runner-flake"), Harness: "codex", Attention: protocol.Working, OpenedAt: ago(20 * time.Minute), UpdatedAt: ago(2 * time.Minute)},
		{TaskID: "t_train", Title: w("查下周五去上海最早的高铁", "Find the earliest train to Shanghai next Friday"),
			Place: protocol.Place{Kind: "none"}, Harness: "claude-code", Attention: protocol.Done, OpenedAt: ago(5 * time.Hour), UpdatedAt: ago(4 * time.Hour)},
	}
	return protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards}}
}

// todoItems are the open to-dos the pick lists.
func todoItems(lang i18n.Lang, clientID string) protocol.ServerFrame {
	w := todoWords(lang)
	items := []protocol.SourceItem{
		{SourceItemRef: ghRef(12, w("设置页不跟随深色模式", "Settings page ignores dark mode")), State: "open", TaskID: "t_dark"},
		{SourceItemRef: ghRef(15, w("导出 CSV 时日期列是空的", "The date column is empty in CSV exports")), State: "open", Labels: []string{"bug"}},
		{SourceItemRef: ghRef(21, w("把图片上传换成分片上传", "Switch image uploads to chunked uploads")), State: "open"},
		{SourceItemRef: lifeRef(w("杂事", "Errands"), "^dentist", w("约牙医洗牙", "Book a dentist cleaning")), State: "open", Due: "2026-11-28"},
		{SourceItemRef: lifeRef(w("家", "Home"), "^filter", w("换净水器滤芯", "Replace the water filter")), State: "open"},
	}
	return protocol.ServerFrame{T: "source_items_result", Sources: &protocol.SourcesFrame{ClientID: clientID, Items: items}}
}

func todoApp(t *testing.T, lang i18n.Lang, w, h int) (*App, *[]any, *ui.Tester) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(settingsFrame())
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "Lin's MacBook Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake}}})
	app.Receive(todoBoard(lang))
	app.Receive(todoSourcesFrame())
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	return app, sent, tt
}

func todoFrames(tt *ui.Tester, n int) {
	for i := 0; i < n; i++ {
		tt.Advance(150 * time.Millisecond)
		tt.Frame()
	}
}

// The three frames decode on their own, and a card and a task carry the to-do.
func TestTodoFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"sources","sources":[{"id":"src_1","kind":"github","name":"lin-dev","state":"ok","whenNew":"take","whenDone":"ask","standing":{"take":{"at":"2026-11-16T10:00:00Z","after":2}},"open":3,"taken":1}],"found":{"github":{"state":"ok","login":"lin-dev","computer":"Mac"},"vaults":[{"name":"Life","path":"/v/Life"}]}}`))
	if err != nil || f.Sources == nil || f.Sources.View == nil || len(f.Sources.View.Sources) != 1 || f.Sources.View.Sources[0].Standing.Take.After != 2 || len(f.Sources.View.Found.Vaults) != 1 {
		t.Fatalf("sources: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"source_items_result","clientId":"p1","items":[{"source":"src_1","kind":"github","ref":"a/b#1","label":"#1","title":"x","state":"open","taskId":"t1"}]}`))
	if err != nil || f.Sources == nil || f.Sources.ClientID != "p1" || len(f.Sources.Items) != 1 || f.Sources.Items[0].TaskID != "t1" || len(f.SavedItems) != 0 {
		t.Fatalf("items: %v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"source_result","op":"add","ok":false,"reason":"missing"}`))
	if err != nil || f.Sources == nil || f.Sources.Op != "add" || f.Sources.Reason != "missing" {
		t.Fatalf("result: %v %+v", err, f.Sources)
	}
	var card protocol.TaskCard
	if err := json.Unmarshal([]byte(`{"taskId":"t1","source":{"source":"src_1","kind":"github","ref":"a/b#12","label":"#12","where":"a/b","title":"x","state":"closed","wrote":["comment"]}}`), &card); err != nil || card.Source == nil || card.Source.Label != "#12" || card.Source.State != "closed" {
		t.Fatalf("card: %v %+v", err, card.Source)
	}
}

// Settings › 待办来源: it subscribes as it opens; each source says what it
// reads and its counts as separate facts; a choice sends source_set; Remove
// asks in place before source_remove; a found vault and Jira are offered.
func TestTodosPane(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 1700)
	app.openTab(TabTodos)
	if _, ok := lastSent[protocol.SourcesReq](*sent); !ok {
		t.Fatal("opening the pane doesn't subscribe to the sources")
	}
	todoFrames(tt, 4)
	for _, want := range []string{"待办来源", "GitHub", "标给 lin-dev 的 issue 和 PR", "Life", "整个库", "3 件没做完", "1 件在做", "你接下过两次以后定的",
		"新的来了", "做完以后", "勾掉", "还能加上", "Work notes", "加上一个 Obsidian 库…", "Jira", "即将推出"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if tt.HasText("3 件没做完 · 1 件在做") {
		t.Error("the counts are joined with a dot (D291)")
	}
	// GitHub is added: it isn't offered again; the vault already added isn't either.
	if strings.Count(strings.Join(tt.Texts(), "\n"), "在 Lin's MacBook Pro 上用 lin-dev 登录着") != 0 {
		t.Error("GitHub is offered though it is added")
	}
	if err := tt.Click("留言并关掉"); err != nil {
		t.Fatal(err)
	}
	if f, ok := lastSent[protocol.SourceSetReq](*sent); !ok || f.ID != "src_gh" || f.WhenDone != "close" {
		t.Fatalf("a choice sends %+v", f)
	}
	if app.S.Sources.Sources[0].WhenDone != "close" {
		t.Error("the choice doesn't show at once")
	}
	todoFrames(tt, 2)
	if err := tt.Click("移除，GitHub"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	todoFrames(tt, 2)
	if !tt.HasText("移除 GitHub？已经接下的事还在。") {
		t.Fatalf("Remove doesn't ask in place: %q", tt.Texts())
	}
	if _, ok := lastSent[protocol.SourceRemoveReq](*sent); ok {
		t.Fatal("Remove went before it was confirmed")
	}
	if err := tt.Click("移除，GitHub"); err != nil {
		t.Fatal(err)
	}
	if f, ok := lastSent[protocol.SourceRemoveReq](*sent); !ok || f.ID != "src_gh" {
		t.Fatalf("remove sends %+v", f)
	}
	// Adding a found vault.
	if err := tt.Click("加上，Work notes"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.SourceAddReq](*sent); !ok || f.Kind != "obsidian" || f.Path != "/Users/lin/Documents/Work notes" {
		t.Fatalf("add sends %+v", f)
	}
	// A refusal says why, with the home's name.
	app.Receive(protocol.ServerFrame{T: "source_result", Sources: &protocol.SourcesFrame{Op: "add", Reason: "missing"}})
	todoFrames(tt, 2)
	if !tt.HasText("这个文件夹不在 Lin's MacBook Pro 上。") {
		t.Errorf("the refusal isn't said: %q", tt.Texts())
	}
}

// A source that can't read says why in the failed ink, with the home's name,
// and the way to sign in; nothing added says so.
func TestTodosProblemsAndEmpty(t *testing.T) {
	app, _, tt := todoApp(t, i18n.EN, 1280, 1500)
	app.Receive(protocol.ServerFrame{T: "sources", Sources: &protocol.SourcesFrame{View: &protocol.SourcesView{Sources: []protocol.SourceView{
		{ID: "src_gh", Kind: "github", Name: "lin-dev", State: "signed_out", WhenNew: "tell", WhenDone: "ask"},
		{ID: "src_life", Kind: "obsidian", Name: "Life", State: "missing", Folder: "Tasks", WhenNew: "quiet", WhenDone: "tick"},
	}}}})
	app.openTab(TabTodos)
	todoFrames(tt, 4)
	for _, want := range []string{"Lin's MacBook Pro isn't signed in to GitHub yet.", "Sign in to GitHub in Devices", "This vault's folder isn't on Lin's MacBook Pro.", "Open to-dos in Tasks"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	app.Receive(protocol.ServerFrame{T: "sources", Sources: &protocol.SourcesFrame{View: &protocol.SourcesView{}}})
	todoFrames(tt, 2)
	if !tt.HasText(app.L.T("todos.empty")) {
		t.Errorf("nothing added doesn't say so: %q", tt.Texts())
	}
}

// The opened task's head: the chip and, as its own element, its state word.
func TestTodoChipOnTask(t *testing.T) {
	app, _, tt := todoApp(t, i18n.ZH, 1280, 900)
	app.OpenTask("t_dark")
	todoFrames(tt, 4)
	if !tt.HasText("#12") || !tt.HasText("已留言") {
		t.Fatalf("no chip and state word: %q", tt.Texts())
	}
	if tt.HasText("#12 已留言") || tt.HasText("#12 · 已留言") {
		t.Error("the chip and its state are one element (D291)")
	}
	if got := todoTip(app.S.Task("t_dark").Card.Source.SourceItemRef); !strings.HasPrefix(got, "acme/web#12\n") {
		t.Errorf("the tooltip says %q, want the repo first", got)
	}
	if w := app.todoStateWord(&protocol.TaskSource{State: "closed", Wrote: []string{"comment"}}); w != "已关掉" {
		t.Errorf("closed in its app says %q", w)
	}
	if w := app.todoStateWord(&protocol.TaskSource{Wrote: []string{"tick", "untick"}}); w != "" {
		t.Errorf("ticked then unticked says %q", w)
	}
}

// On hand: a card's foot has the chip; the lens lists the sources with
// tasks under 来自 and narrows the board to a source's tasks.
func TestTodoLens(t *testing.T) {
	app, _, tt := todoApp(t, i18n.ZH, 1500, 1000)
	app.Route = RouteOnHand
	todoFrames(tt, 4)
	for _, want := range []string{"来自", "GitHub", "Life", "#12", "#9"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	groups := app.lensGroups(app.S.Board())
	g := groupOf(groups, "src:src_gh")
	if g == nil || len(g.tasks) != 2 || g.kind != "github" {
		t.Fatalf("the GitHub lens: %+v", g)
	}
	if v := groupOf(groups, "src:src_life"); v == nil || v.name != "Life" {
		t.Fatalf("the vault's lens: %+v", v)
	}
	if err := tt.Click("GitHub"); err != nil {
		t.Fatal(err)
	}
	todoFrames(tt, 2)
	if app.Local.Lens() != "src:src_gh" || app.currentLens(app.lensGroups(app.S.Board())) != "src:src_gh" {
		t.Fatalf("the lens kept is %q", app.Local.Lens())
	}
	b := lensBoard(app.S.Board(), "src:src_gh")
	n := 0
	for _, l := range b.Lanes {
		n += len(l)
	}
	if n != 2 {
		t.Errorf("the GitHub lens shows %d tasks, want 2", n)
	}
	app.Local.SetLens("")
}

// New task: 从待办里选 asks for the open to-dos, a pick fills the words
// and shows the chip, and task_new carries the reference.
func TestTodoPick(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 900)
	app.S.Sources = nil
	app.OpenNewTask(nil)
	if _, ok := lastSent[protocol.SourcesReq](*sent); !ok {
		t.Fatal("New task doesn't ask for the sources")
	}
	app.Receive(todoSourcesFrame())
	app.Receive(newTaskOptions(i18n.ZH))
	todoFrames(tt, 3)
	if err := tt.Click("从待办里选"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	req, ok := lastSent[protocol.SourceItemsReq](*sent)
	if !ok || req.ClientID == "" {
		t.Fatalf("the pick asks %+v", req)
	}
	todoFrames(tt, 1)
	if !tt.HasText("正在读…") {
		t.Errorf("no loading line: %q", tt.Texts())
	}
	app.Receive(todoItems(i18n.ZH, req.ClientID))
	todoFrames(tt, 2)
	for _, want := range []string{"导出 CSV 时日期列是空的", "在做", "2026-11-28 到期"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click("导出 CSV 时日期列是空的，#15"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	todoFrames(tt, 2)
	if app.nt.words != "导出 CSV 时日期列是空的" || app.nt.item == nil || !tt.HasText("不用这件") {
		t.Fatalf("the pick: words %q item %+v", app.nt.words, app.nt.item)
	}
	app.StartNewTask()
	f, ok := lastSent[protocol.TaskNew](*sent)
	if !ok || f.Item == nil || f.Item.Ref != "acme/web#15" || f.Item.Source != "src_gh" {
		t.Fatalf("task_new carries %+v", f.Item)
	}
	// Only the reference goes: an item's own text never rides along.
	b, _ := json.Marshal(f.Item)
	if strings.Contains(string(b), "state") || strings.Contains(string(b), "labels") {
		t.Errorf("task_new's item carries more than the reference: %s", b)
	}
}

// The write card shows the comment whole under its question, says it closes
// it too, and its buttons are the card's own words.
func TestTodoWriteCard(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.EN, 1280, 1000)
	app.OpenTask("t_safari")
	todoFrames(tt, 4)
	for _, want := range []string{"It will post", todoComment(i18n.EN), "Then close it", "Comment and close", "Not now"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// The question keeps acme/web whole on one line (word joiners).
	if all := strings.ReplaceAll(strings.Join(tt.Texts(), "\n"), "⁠", ""); !strings.Contains(all, "Comment on acme/web#9 and close it?") {
		t.Errorf("no question in %q", tt.Texts())
	}
	if err := tt.Click("Comment and close, Fix the Safari sign-in loop"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.Decide](*sent); !ok || f.DecisionID != "d_write" || f.Option != "go" {
		t.Fatalf("Go sends %+v", f)
	}
}

// Shots for review, zh and en, light and dark, never into git (D75):
//
//	DUCTER_TODOS_SHOTS=/Users/weyl/dev/ducter/.shots/task-sources/mac go test ./internal/views -run TodosShots
func TestTodosShots(t *testing.T) {
	dir := os.Getenv("DUCTER_TODOS_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_TODOS_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	type scene struct {
		name string
		w, h int
		set  func(app *App, lang i18n.Lang)
	}
	scenes := []scene{
		{"settings-todos", 1280, 1500, func(app *App, lang i18n.Lang) { app.openTab(TabTodos) }},
		{"settings-todos-add-path", 1280, 1500, func(app *App, lang i18n.Lang) {
			app.openTab(TabTodos)
			app.todos.pathOpen, app.todos.path, app.todos.removing = true, "~/Documents/Notes", "src_life"
			app.todos.addErr = app.L.T("todos.add.missing", "Lin's MacBook Pro")
		}},
		{"task-chip", 1280, 860, func(app *App, lang i18n.Lang) { app.OpenTask("t_dark") }},
		{"onhand", 1500, 1000, func(app *App, lang i18n.Lang) { app.Route = RouteOnHand }},
		{"onhand-lens-github", 1500, 1000, func(app *App, lang i18n.Lang) {
			app.Local.SetLens("src:src_gh")
			app.Route = RouteOnHand
		}},
		{"newtask-pick", 1280, 900, func(app *App, lang i18n.Lang) {
			app.Route = RouteOnHand
			app.OpenNewTask(nil)
			app.Receive(newTaskOptions(lang))
			app.todos.pickOpen = true
			app.askPick()
			app.Receive(todoItems(lang, app.todos.pickID))
		}},
		{"newtask-picked", 1280, 900, func(app *App, lang i18n.Lang) {
			app.Route = RouteOnHand
			app.OpenNewTask(nil)
			app.Receive(newTaskOptions(lang))
			app.pickTodo(todoItems(lang, "").Sources.Items[1])
		}},
		{"write-card", 1280, 1000, func(app *App, lang i18n.Lang) { app.OpenTask("t_safari") }},
		{"write-card-conversation", 1280, 900, func(app *App, lang i18n.Lang) {
			noRelayWait(t)
			d := app.S.Task("t_safari").Card.PendingDecision.Decision
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				chEv(1, protocol.OriginPartner, protocol.KindDecision, d),
				chEv(2, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
					{TaskID: "t_safari", Kind: "decision", Title: app.S.Task("t_safari").Title(), Text: d.Question, DecisionID: d.DecisionID},
				}}),
			}})
			app.Route = RouteConversation
		}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, sc := range scenes {
				app, _, tt := todoApp(t, lang, sc.w, sc.h)
				sc.set(app, lang)
				tt.SetDark(dark)
				todoFrames(tt, 12)
				paper := "light"
				if dark {
					paper = "dark"
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%s.png", sc.name, paper, lang)))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
				app.Local.SetLens("")
			}
		}
	}
}
