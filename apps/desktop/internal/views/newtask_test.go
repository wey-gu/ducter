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

// click clicks the element showing (or named) what, and draws twice.
func click(t *testing.T, tt *ui.Tester, what string) {
	t.Helper()
	if err := tt.Click(what); err != nil {
		t.Fatalf("no %q to click: %v\n%q", what, err, tt.Texts())
	}
	tt.Frame()
	tt.Frame()
}

func TestNewTaskCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		L := app.L
		app.Route = RouteOnHand
		tt.Frame()
		btn := L.T("newtask.button")
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
		// D185: the words first, then one row of pills, Now by default.
		for _, want := range []string{L.T("newtask.where") + " · ducter", "main", "Claude Code · Opus", L.T("newtask.suggested"), L.T("newtask.when.now"), L.T("newtask.verbatim"), L.T("newtask.start"), L.T("newtask.keys", L.T("newtask.start"))} {
			if !strings.Contains(all, want) {
				t.Errorf("%s: no %q on the card: %q", lang, want, all)
			}
		}
		// The best fit is tagged Suggested; there's no reason line on the card.
		if strings.Contains(all, L.T("cand.fit")) {
			t.Errorf("%s: a reason line on the card: %q", lang, all)
		}
		newTaskShot(t, tt, "card-empty-"+string(lang))

		// Empty words: said in place, nothing sent.
		app.StartNewTask()
		tt.Frame()
		if _, ok := lastFrame[protocol.TaskNew](sent); ok {
			t.Fatalf("%s: empty words were sent", lang)
		}
		emptyLine := L.T("newtask.err.empty")
		if !tt.HasText(emptyLine) {
			t.Fatalf("%s: Start with no words says nothing: %q", lang, tt.Texts())
		}
		tt.Type("修") // the words field has the focus
		tt.Frame()
		if strings.TrimSpace(app.nt.words) == "" {
			t.Fatalf("%s: typing didn't reach the words field", lang)
		}
		tt.Frame()
		if tt.HasText(emptyLine) {
			t.Errorf("%s: the empty-words line stays once there are words", lang)
		}

		app.nt.words = map[i18n.Lang]string{
			i18n.ZH: "On hand 里加一个「按项目」的分组：每个仓库一组，行里是标题、分支、+增 −删和状态。组头的 + 在这个仓库里开一件新的事。",
			i18n.EN: "Add a By project grouping to On hand: one group per repo, each row the title, branch, +adds −dels and state. The group header's + opens a new task in that repo.",
		}[lang]

		// Who: the list has every agent, one that can't greyed; picking one is remembered.
		click(t, tt, L.T("newtask.who")+" · Claude Code · Opus")
		if !tt.HasText("Codex") || !tt.HasText("pi") {
			t.Fatalf("%s: the agents' list: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "card-who-"+string(lang))
		click(t, tt, "Codex")
		if app.nt.pick == "" || app.nt.whoOpen || app.Local.NewTaskWho() != app.nt.pick {
			t.Errorf("%s: picking Codex: pick %q open %v remembered %q", lang, app.nt.pick, app.nt.whoOpen, app.Local.NewTaskWho())
		}
		if strings.Contains(strings.Join(tt.Texts(), " "), L.T("newtask.picked", "Codex")) {
			t.Errorf("%s: a pick is a line on the card: %q", lang, tt.Texts())
		}

		// Where: recent folders with their paths, No folder.
		click(t, tt, L.T("newtask.where")+" · ducter")
		for _, want := range []string{"hawdb", "~/dev/tinycart", L.T("newtask.nowhere")} {
			if !tt.HasText(want) {
				t.Errorf("%s: no %q in Where's list: %q", lang, want, tt.Texts())
			}
		}
		newTaskShot(t, tt, "card-where-"+string(lang))
		click(t, tt, "ducter") // the chosen one again: the list closes, the branch stays
		if app.nt.placeOpen {
			t.Errorf("%s: Where's list stays open", lang)
		}

		// The branch.
		click(t, tt, L.T("newtask.branch.title")+" · main")
		if !tt.HasText("release/0.0.1") {
			t.Fatalf("%s: the branch list doesn't open: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "card-branch-"+string(lang))
		click(t, tt, "release/0.0.1")
		newTaskShot(t, tt, "card-filled-"+string(lang))

		// Start: a refusal stays on the card with the words.
		app.StartNewTask()
		tt.Frame()
		f, ok := lastFrame[protocol.TaskNew](sent)
		if !ok || f.Place == nil || f.Place.RepoPath != "/Users/someone/dev/ducter" || f.Place.BaseBranch != "release/0.0.1" || f.Harness != "codex" || f.ClientID == "" || f.When != nil {
			t.Fatalf("%s: task_new %+v", lang, f)
		}
		newTaskShot(t, tt, "card-starting-"+string(lang))
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: false, ClientID: f.ClientID, Reason: "offline", Message: "MacBook is offline"})
		tt.Frame()
		tt.Frame()
		if !app.nt.open || app.nt.words == "" || !strings.Contains(strings.Join(tt.Texts(), " "), L.T("newtask.err.offline")) {
			t.Fatalf("%s: a refusal isn't said on the card: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "card-error-"+string(lang))

		// ⇧⌘↩: it starts, and the card stays for the next one, saying what started.
		app.StartNewTask(true)
		f2, _ := lastFrame[protocol.TaskNew](sent)
		title := map[i18n.Lang]string{i18n.ZH: "On hand 里加一个「按项目」的分组", i18n.EN: "Add a By project grouping to On hand"}[lang]
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: true, ClientID: f2.ClientID, TaskID: "t_newtask", Card: &protocol.TaskCard{TaskID: "t_newtask", Title: title}})
		tt.Frame()
		tt.Frame()
		if !app.nt.open || app.nt.words != "" || app.Route != RouteOnHand || !tt.HasText(L.T("newtask.opened", title)) || !tt.HasText(L.T("newtask.open")+" · "+L.T("newtask.opened", title)) {
			t.Fatalf("%s: start-and-another: open %v words %q route %v %q", lang, app.nt.open, app.nt.words, app.Route, tt.Texts())
		}
		if app.chosenPlace(app.newTaskPlaces()).Place.RepoPath != "/Users/someone/dev/ducter" || app.nt.branch != "release/0.0.1" || app.nt.pick == "" {
			t.Errorf("%s: the next one doesn't keep the place and who", lang)
		}
		newTaskShot(t, tt, "card-again-"+string(lang))

		// D185 On a schedule: weekdays at 9.
		app.nt.words = map[i18n.Lang]string{i18n.ZH: "看一眼 hawdb 的 nightly，挂了就修。", i18n.EN: "Look at hawdb's nightly; fix it if it broke."}[lang]
		click(t, tt, L.T("newtask.when")+" · "+L.T("newtask.when.now"))
		for _, k := range []string{"now", "at", "every", "when", "until"} {
			if !tt.HasText(L.T("newtask.when." + k)) {
				t.Errorf("%s: no %q in When's list", lang, L.T("newtask.when."+k))
			}
		}
		newTaskShot(t, tt, "card-when-"+string(lang))
		click(t, tt, L.T("newtask.when.every"))
		click(t, tt, L.T("newtask.every.weekday"))
		if !tt.HasText(L.T("newtask.pill.weekdays", "9:00")) || !tt.HasText(L.T("newtask.schedule")) {
			t.Fatalf("%s: weekdays at 9 isn't on the card: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "card-every-"+string(lang))
		app.StartNewTask()
		f3, _ := lastFrame[protocol.TaskNew](sent)
		if f3.When == nil || f3.When.Kind != "every" || f3.When.Every != "weekday" || f3.When.Time != "09:00" || f3.When.TZ == "" {
			t.Fatalf("%s: the schedule sent %+v", lang, f3.When)
		}
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: true, ClientID: f3.ClientID, RoutineID: "rt_1", Routine: &protocol.Routine{RoutineID: "rt_1", Name: "nightly", TriggerWords: "x"}})
		tt.Frame()
		if app.nt.open || app.Route != RouteOnHand {
			t.Fatalf("%s: a schedule closes the card on On hand: open %v route %v", lang, app.nt.open, app.Route)
		}

		// At a time: tomorrow 9:30; a bad time is said.
		app.OpenNewTask(nil)
		app.Receive(newTaskOptions(lang))
		tt.Frame()
		if app.nt.pick == "" {
			t.Errorf("%s: the next card forgot who was picked", lang)
		}
		app.nt.words = "Ship 0.4.1."
		app.nt.when, app.nt.atTime = "at", "25:00"
		tt.Frame()
		app.StartNewTask()
		tt.Frame()
		if !tt.HasText(L.T("newtask.err.time")) {
			t.Errorf("%s: a bad time says nothing: %q", lang, tt.Texts())
		}
		app.nt.atTime = "9.30"
		tt.Frame()
		newTaskShot(t, tt, "card-at-"+string(lang))
		app.StartNewTask()
		f4, _ := lastFrame[protocol.TaskNew](sent)
		if f4.When == nil || f4.When.Kind != "at" || f4.When.Time != "09:30" || f4.When.Date != app.Now().AddDate(0, 0, 1).Format("2006-01-02") {
			t.Fatalf("%s: at a time sent %+v", lang, f4.When)
		}
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: false, ClientID: f4.ClientID, Reason: "past"})
		tt.Frame()
		tt.Frame()
		if !tt.HasText(L.T("newtask.err.past")) {
			t.Errorf("%s: a past time isn't said: %q", lang, tt.Texts())
		}

		// When something happens: the condition in its own field.
		app.nt.when, app.nt.err = "when", ""
		app.nt.condition = map[i18n.Lang]string{i18n.ZH: "PR #1592 的 CI 通过", i18n.EN: "PR #1592's CI passes"}[lang]
		tt.Frame()
		tt.Frame()
		newTaskShot(t, tt, "card-cond-"+string(lang))
		app.StartNewTask()
		f5, _ := lastFrame[protocol.TaskNew](sent)
		if f5.When == nil || f5.When.Kind != "when" || f5.When.Condition != app.nt.condition {
			t.Fatalf("%s: when sent %+v", lang, f5.When)
		}
		app.Receive(protocol.ServerFrame{T: "task_new_result", OK: true, ClientID: f5.ClientID, TaskID: "t_newtask"})
		tt.Frame()
		tt.Frame()
		if app.nt.open || app.Route != RouteTask || app.TaskID != "t_newtask" {
			t.Fatalf("%s: started, but route %v task %q open %v", lang, app.Route, app.TaskID, app.nt.open)
		}
		app.Up()
		if app.Route != RouteOnHand {
			t.Errorf("%s: Esc from the new task goes to %v", lang, app.Route)
		}
		app.Local.SetNewTaskWho("")
	}
}

// D186: Add a folder… asks macOS for one; it becomes a project, and the
// card starts there.
func TestNewTaskAddFolder(t *testing.T) {
	app, sent, tt := newTaskApp(t, i18n.EN)
	app.PickFolder = func(title, button string) (string, error) { return "/Users/someone/dev/notes", nil }
	app.OpenNewTask(nil)
	app.Receive(newTaskOptions(i18n.EN))
	tt.Frame()
	click(t, tt, "Where · ducter")
	if !tt.HasText(app.L.T("newtask.addfolder")) {
		t.Fatalf("no Add a folder… in Where's list: %q", tt.Texts())
	}
	click(t, tt, app.L.T("newtask.addfolder"))
	add, ok := lastFrame[protocol.ProjectAdd](sent)
	if !ok || add.Path != "/Users/someone/dev/notes" || add.ClientID == "" {
		t.Fatalf("project_add %+v", add)
	}
	notes := protocol.PlaceChoice{Place: protocol.Place{Kind: "folder", Device: "local", Path: "/Users/someone/dev/notes"}, Name: "notes", Added: true}
	app.Receive(protocol.ServerFrame{T: "project_add_result", OK: true, ClientID: add.ClientID, Place: &notes})
	tt.Frame()
	o, _ := lastFrame[protocol.TaskNewOptions](sent)
	if o.Place == nil || o.Place.Path != "/Users/someone/dev/notes" {
		t.Fatalf("options asked at %+v", o.Place)
	}
	opts := newTaskOptions(i18n.EN)
	opts.Places = append([]protocol.PlaceChoice{notes}, opts.Places...)
	app.Receive(opts)
	tt.Frame()
	tt.Frame()
	if !tt.HasText("Where · notes") {
		t.Fatalf("the card isn't at notes: %q", tt.Texts())
	}
	newTaskShot(t, tt, "card-added-folder-en")
	app.nt.words = "Sort the meeting notes by month."
	app.StartNewTask()
	f, _ := lastFrame[protocol.TaskNew](sent)
	if f.Place == nil || f.Place.Kind != "folder" || f.Place.Path != "/Users/someone/dev/notes" {
		t.Fatalf("task_new at %+v", f.Place)
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
	if all := strings.Join(tt.Texts(), " "); !strings.Contains(all, "Where · hawdb") || !strings.Contains(all, "Start from which branch · main") {
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
		zh := lang == i18n.ZH
		w := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		// D185/D186: a loop, a project added by hand with nothing yet, a
		// weekday start in ducter, and a one-time start of no folder.
		on := *app.S.OnHand
		on.Tasks = append([]protocol.TaskCard(nil), on.Tasks...)
		for i := range on.Tasks {
			if on.Tasks[i].TaskID == "t_wal" {
				on.Tasks[i].Until = &protocol.Until{Condition: w("基准稳定在 5% 以内", "the benchmark is stable within 5%"), MaxTries: 20, State: "on", Tries: []protocol.UntilTry{{N: 1}, {N: 2}}}
			}
		}
		next := time.Now().Add(20 * time.Hour).UTC().Format(time.RFC3339)
		ducter := protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/ducter"}
		on.Projects = []protocol.ProjectView{{Name: "notes", Place: protocol.Place{Kind: "folder", Device: "local", Path: "/Users/someone/notes"}, AddedAt: time.Now().UTC().Format(time.RFC3339)}}
		on.Routines = []protocol.Routine{
			{RoutineID: "rt_nightly", Name: w("看一眼 nightly，挂了就修", "Check the nightly; fix it if it broke"), By: "you", Place: &ducter, Project: "ducter", State: "active", NextAt: next,
				Trigger: protocol.RoutineTrigger{Kind: "time", Every: "weekday", Time: "09:00"}, TriggerWords: w("工作日 9:00 · 跟着你的时区", "Weekdays 9:00 · follows your time zone")},
			{RoutineID: "rt_once", Name: w("提醒我给房东打电话", "Remind me to call the landlord"), By: "you", State: "active", NextAt: next,
				Trigger: protocol.RoutineTrigger{Kind: "time", Every: "once", Time: "09:00"}, TriggerWords: w("11月12日 9:00", "Nov 12, 9:00")},
		}
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &on})
		app.Route = RouteOnHand
		tt.Frame()
		newTaskShot(t, tt, "onhand-by-state-"+string(lang))
		if err := tt.Click(app.L.T("onhand.by.project")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		if !app.Local.ByProject() {
			t.Fatalf("%s: By project isn't remembered", lang)
		}
		all := strings.Join(tt.Texts(), " ")
		for _, want := range []string{"ducter", "HawDB", "tinycart", app.L.T("onhand.other"), "ducter/new-task-ui", "+412", "−38", "+42", "−7",
			"notes", app.L.T("onhand.project.empty"), app.L.T("until.n", 3), on.Routines[0].Name, on.Routines[0].TriggerWords, on.Routines[1].Name, app.L.T("routine.cancel")} {
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
