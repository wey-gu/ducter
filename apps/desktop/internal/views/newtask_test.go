package views

import (
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

// 开一件事 / New task (D128): the card, On hand by project, the Changes
// header, and `ducter open` reaching the app. Realistic work in three
// repos (Ducter, HawDB, tinycart) and one task of no place.

func newTaskApp(t *testing.T, lang i18n.Lang) (*App, *[]any, *ui.Tester) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	now := time.Now()
	ago := func(d time.Duration) string { return now.Add(-d).UTC().Format(time.RFC3339) }
	repo := func(path, branch string) protocol.Place {
		return protocol.Place{Kind: "repo", Device: "local", RepoPath: path, Branch: branch, BaseBranch: "main", Worktree: "/tmp/wt/" + branch}
	}
	stat := func(f, a, d int) *protocol.DiffStat {
		return &protocol.DiffStat{Files: f, Adds: a, Dels: d, At: ago(time.Minute)}
	}
	cards := []protocol.TaskCard{
		{TaskID: "t_asc", Title: w("准备 Ducter iOS 在 App Store Connect 上的上架资料（截图、描述、隐私问卷）", "Prepare Ducter iOS in App Store Connect (screenshots, description, privacy)"), Project: "ducter",
			Place: repo("/Users/someone/dev/ducter", "ducter/app-store-connect"), Harness: "codex", Attention: protocol.NeedsYou, OpenedAt: ago(31 * time.Minute), UpdatedAt: ago(8 * time.Minute), Changes: stat(4, 118, 12)},
		{TaskID: "t_newtask", Title: w("开一件事的卡片和按项目分组", "The New task card and By project"), Project: "ducter", OpenedBy: "you",
			Place: repo("/Users/someone/dev/ducter", "ducter/new-task-ui"), Harness: "claude-code", Model: "opus", Attention: protocol.Working, OpenedAt: ago(12 * time.Minute), UpdatedAt: ago(time.Minute), Changes: stat(7, 412, 38)},
		{TaskID: "t_flaky", Title: w("修 compaction 偶发失败的测试", "Fix the flaky compaction test"), Project: "HawDB",
			Place: repo("/Users/someone/dev/hawdb", "ducter/compaction-fix"), Harness: "claude-code", Attention: protocol.Done, OpenedAt: ago(58 * time.Minute), UpdatedAt: ago(45 * time.Minute), Changes: stat(2, 31, 9)},
		{TaskID: "t_wal", Title: w("WAL 回放的基准测试", "Benchmark WAL replay"), Project: "HawDB",
			Place: repo("/Users/someone/dev/hawdb", "ducter/wal-bench"), Harness: "codex", Attention: protocol.Working, OpenedAt: ago(20 * time.Minute), UpdatedAt: ago(2 * time.Minute)},
		{TaskID: "t_cart", Title: w("购物车数量为 0 时隐藏结算按钮", "Hide checkout when the cart is empty"), Project: "tinycart", OpenedBy: "you",
			Place: repo("/Users/someone/dev/tinycart", "ducter/empty-cart"), Harness: "claude-code", Attention: protocol.Blocked, Reason: w("等 CI 跑完", "Waiting for CI"), OpenedAt: ago(40 * time.Minute), UpdatedAt: ago(6 * time.Minute), Changes: stat(3, 42, 7)},
		{TaskID: "t_flights", Title: w("查下周五去上海最早的高铁", "Find the earliest train to Shanghai next Friday"),
			Place: protocol.Place{Kind: "none"}, Harness: "claude-code", Attention: protocol.Done, OpenedAt: ago(3 * time.Hour), UpdatedAt: ago(170 * time.Minute)},
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards}})
	tt := ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	return app, sent, tt
}

func newTaskOptions(lang i18n.Lang) protocol.ServerFrame {
	left := func(f float64) *float64 { return &f }
	return protocol.ServerFrame{T: "task_new_options",
		Places: []protocol.PlaceChoice{
			{Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/ducter"}, Name: "ducter", DefaultBranch: "main",
				Branches: []string{"main", "ducter/new-task-ui", "ducter/app-store-connect", "release/0.0.1", "conversation-bubbles", "web-transcript"}},
			{Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/hawdb"}, Name: "hawdb", DefaultBranch: "main", Branches: []string{"main", "ducter/compaction-fix", "ducter/wal-bench"}},
			{Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/tinycart"}, Name: "tinycart", DefaultBranch: "master", Branches: []string{"master"}},
			{Place: protocol.Place{Kind: "none"}},
		},
		Candidates: []protocol.Candidate{
			{Harness: "claude-code", Model: "opus", Reason: protocol.CandidateReason{Kind: "fit"}, Left: left(0.64)},
			{Harness: "codex", Reason: protocol.CandidateReason{Kind: "fast"}, Left: left(0.48)},
			{Harness: "pi", Blocked: "signed_out"},
		},
	}
}

func newTaskShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("DUCTER_NEWTASK_SHOTS")
	if dir == "" {
		return
	}
	tt.Advance(time.Second)
	tt.Frame()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(filepath.Join(dir, name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func lastFrame[T any](sent *[]any) (T, bool) {
	var zero T
	for i := len(*sent) - 1; i >= 0; i-- {
		if f, ok := (*sent)[i].(T); ok {
			return f, true
		}
	}
	return zero, false
}

func TestNewTaskCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		app.Route = RouteOnHand
		tt.Frame()
		btn := app.L.T("newtask.button")
		if err := tt.Click(btn); err != nil {
			t.Fatalf("%s: no %q on On hand: %v", lang, btn, err)
		}
		tt.Frame()
		if _, ok := lastFrame[protocol.TaskNewOptions](sent); !ok {
			t.Fatalf("%s: the card asked for nothing", lang)
		}
		app.Receive(newTaskOptions(lang))
		tt.Frame()
		tt.Frame()
		all := strings.Join(tt.Texts(), " ")
		for _, want := range []string{app.L.T("newtask.where"), app.L.T("newtask.who"), app.L.T("newtask.what"), "ducter", "main", "hawdb", app.L.T("newtask.nowhere"), "Claude Code · Opus", "Codex", app.L.T("cand.fit"), app.L.T("newtask.verbatim"), app.L.T("newtask.start")} {
			if !strings.Contains(all, want) {
				t.Errorf("%s: no %q on the card: %q", lang, want, all)
			}
		}
		newTaskShot(t, tt, "card-empty-"+string(lang))

		// Empty words: said in place, nothing sent.
		app.StartNewTask()
		tt.Frame()
		if _, ok := lastFrame[protocol.TaskNew](sent); ok {
			t.Fatalf("%s: empty words were sent", lang)
		}
		emptyLine := app.L.T("newtask.err.empty")
		if !tt.HasText(emptyLine) {
			t.Fatalf("%s: Start with no words says nothing: %q", lang, tt.Texts())
		}
		// Typing clears it; so does closing and opening the card again.
		tt.Type("修") // the words field has the focus
		tt.Frame()
		if strings.TrimSpace(app.nt.words) == "" {
			t.Fatalf("%s: typing didn't reach the words field", lang)
		}
		tt.Frame()
		if tt.HasText(emptyLine) {
			t.Errorf("%s: the empty-words line stays once there are words", lang)
		}
		app.nt.words = ""
		app.StartNewTask()
		app.nt.open = false
		app.OpenNewTask(nil)
		app.Receive(newTaskOptions(lang))
		tt.Frame()
		tt.Frame()
		if tt.HasText(emptyLine) {
			t.Errorf("%s: a reopened card still says the empty-words line", lang)
		}

		// Filled, Codex picked, a branch picked.
		app.nt.words = map[i18n.Lang]string{
			i18n.ZH: "On hand 里加一个「按项目」的分组：每个仓库一组，行里是标题、分支、+增 −删和状态。组头的 + 在这个仓库里开一件新的事。",
			i18n.EN: "Add a By project grouping to On hand: one group per repo, each row the title, branch, +adds −dels and state. The group header's + opens a new task in that repo.",
		}[lang]
		if err := tt.Click("Codex"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if !strings.Contains(strings.Join(tt.Texts(), " "), app.L.T("newtask.picked", "Codex")) {
			t.Errorf("%s: a pick doesn't say so: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "card-filled-"+string(lang))
		if err := tt.Click("ducter · main"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		if !strings.Contains(strings.Join(tt.Texts(), " "), "release/0.0.1") {
			t.Fatalf("%s: the branch list doesn't open: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "card-branch-"+string(lang))
		if err := tt.Click("release/0.0.1"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()

		// Start: a refusal stays on the card with the words.
		app.StartNewTask()
		tt.Frame()
		f, ok := lastFrame[protocol.TaskNew](sent)
		if !ok || f.Place == nil || f.Place.RepoPath != "/Users/someone/dev/ducter" || f.Place.BaseBranch != "release/0.0.1" || f.Harness != "codex" || f.ClientID == "" {
			t.Fatalf("%s: task_new %+v", lang, f)
		}
		newTaskShot(t, tt, "card-starting-"+string(lang))
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: false, ClientID: f.ClientID, Reason: "offline", Message: "MacBook is offline"})
		tt.Frame()
		tt.Frame()
		if !app.nt.open || app.nt.words == "" || !strings.Contains(strings.Join(tt.Texts(), " "), app.L.T("newtask.err.offline")) {
			t.Fatalf("%s: a refusal isn't said on the card: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "card-error-"+string(lang))

		// Start again: it opens, and Esc goes back to On hand.
		app.StartNewTask()
		f2, _ := lastFrame[protocol.TaskNew](sent)
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: true, ClientID: f2.ClientID, TaskID: "t_newtask"})
		tt.Frame()
		tt.Frame()
		if app.nt.open || app.Route != RouteTask || app.TaskID != "t_newtask" {
			t.Fatalf("%s: started, but route %v task %q open %v", lang, app.Route, app.TaskID, app.nt.open)
		}
		app.Up()
		if app.Route != RouteOnHand {
			t.Errorf("%s: Esc from the new task goes to %v", lang, app.Route)
		}
	}
}

// ⌘N inside an opened task starts the card at that task's place.
func TestNewTaskFromTask(t *testing.T) {
	app, sent, tt := newTaskApp(t, i18n.EN)
	app.OpenTask("t_flaky")
	tt.Frame()
	app.NewTaskShortcut()
	o, ok := lastFrame[protocol.TaskNewOptions](sent)
	if !ok || o.Place == nil || o.Place.RepoPath != "/Users/someone/dev/hawdb" {
		t.Fatalf("options asked at %+v", o.Place)
	}
	app.Receive(newTaskOptions(i18n.EN))
	tt.Frame()
	tt.Frame()
	if !strings.Contains(strings.Join(tt.Texts(), " "), "hawdb · main") {
		t.Errorf("the card doesn't start at hawdb: %q", tt.Texts())
	}
	newTaskShot(t, tt, "card-from-task-en")
}

// `ducter open <task>`: the app shows it, and Esc returns.
func TestOpenTaskFrame(t *testing.T) {
	app, _, tt := newTaskApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "open_task", TaskID: "t_cart"})
	tt.Frame()
	if app.Route != RouteTask || app.TaskID != "t_cart" {
		t.Fatalf("open_task didn't open it: %v %q", app.Route, app.TaskID)
	}
	app.Up()
	if app.Route != RouteConversation {
		t.Errorf("Esc after open_task goes to %v", app.Route)
	}
}

func TestOnHandByProject(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		app.Route = RouteOnHand
		tt.Frame()
		if err := tt.Click(app.L.T("onhand.by.project")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		if !app.Local.ByProject() {
			t.Fatalf("%s: By project isn't remembered", lang)
		}
		all := strings.Join(tt.Texts(), " ")
		for _, want := range []string{"ducter", "HawDB", "tinycart", app.L.T("onhand.other"), "ducter/new-task-ui", "+412", "−38", "+42", "−7"} {
			if !strings.Contains(all, want) {
				t.Errorf("%s: no %q by project: %q", lang, want, all)
			}
		}
		if strings.Contains(all, "+0") {
			t.Errorf("%s: an uncounted task shows +0", lang)
		}
		newTaskShot(t, tt, "onhand-by-project-"+string(lang))
		if err := tt.Click(app.L.T("onhand.newhere") + " tinycart"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		o, ok := lastFrame[protocol.TaskNewOptions](sent)
		if !ok || o.Place == nil || o.Place.RepoPath != "/Users/someone/dev/tinycart" {
			t.Fatalf("%s: New task here asked at %+v", lang, o.Place)
		}
		app.nt.open = false
		app.Local.SetByProject(false)
	}
}

// The opened task's Changes header: 改动 · 3 个文件 +42 −7.
func TestChangesHeader(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, tt := newTaskApp(t, lang)
		app.OpenTask("t_cart")
		app.diffs["t_cart"] = &diffPane{files: []diffFile{{name: "src/cart/Checkout.tsx", added: 24, deleted: 5}, {name: "src/cart/useCart.ts", added: 9, deleted: 2}, {name: "src/cart/Checkout.test.tsx", added: 9}}}
		tt.Frame()
		tt.Frame()
		want := map[i18n.Lang]string{i18n.ZH: "· 3 个文件", i18n.EN: "· 3 files"}[lang]
		all := strings.Join(tt.Texts(), " ")
		if !strings.Contains(all, want) || !strings.Contains(all, "+42") || !strings.Contains(all, "−7") {
			t.Errorf("%s: the Changes header: %q", lang, all)
		}
		tt.Scroll(640, 500, 0, 3000)
		newTaskShot(t, tt, "task-changes-"+string(lang))
	}
}
