package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D542: the workbench is the task's own. Opened on one task (at its 成果 /
// Results, or any page), it never stands beside the next task opened; a task
// opened fresh opens at its conversation, and each keeps its own page.
func TestBenchIsTheTasksOwn(t *testing.T) {
	app := railApp(t, i18n.ZH)
	app.OpenTask("t_keys")
	tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	keys, iter := app.S.Task("t_keys"), app.S.Task("t_iter")
	if !app.benchOpenable(keys) || !app.benchOpenable(iter) {
		t.Fatalf("both tasks have pages: %v %v", app.benchTabs(keys), app.benchTabs(iter))
	}
	app.ToggleBench()
	app.bench.tab = "files"
	tt.Frame()
	if !app.benchShown(keys) || app.bench.tabs["t_keys"] != "files" {
		t.Fatalf("opened on t_keys at files: shown %v, its page %q", app.benchShown(keys), app.bench.tabs["t_keys"])
	}
	// The next task opened (the rail, ⌘]): no workbench beside it, the rail is back.
	app.OpenTask("t_iter")
	tt.Frame()
	if app.benchShown(iter) {
		t.Errorf("the workbench opened for t_keys stands beside t_iter")
	}
	if rail, bench := panes(1400, app.benchShown(iter)); !rail || bench {
		t.Errorf("at 1400 t_iter has the rail (%v) and no workbench (%v)", rail, bench)
	}
	// Opened there by hand: its own first page, never t_keys' files.
	app.ToggleBench()
	tt.Frame()
	if !app.benchShown(iter) || app.bench.tab != app.benchTabs(iter)[0] {
		t.Errorf("t_iter's workbench opens at %q, want its first page %q", app.bench.tab, app.benchTabs(iter)[0])
	}
	// Back on t_keys: closed; opened again, its own page.
	app.OpenTask("t_keys")
	tt.Frame()
	if app.benchShown(keys) {
		t.Errorf("t_keys took t_iter's open workbench")
	}
	app.ToggleBench()
	if app.bench.tab != "files" {
		t.Errorf("t_keys' workbench opens at %q, want its own files", app.bench.tab)
	}
}

// D542: in the rail a Keep in rounds is its page: its round's task row opens
// the Keep, never the round's task (and never that task's workbench).
func TestRailKeepRowOpensTheKeep(t *testing.T) {
	app := railApp(t, i18n.EN)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	oh := *app.S.OnHand
	oh.Keeps = []protocol.KeepSheet{{ID: "kp_compact", Title: "Watch compaction on hel", Life: "on", Run: "same", TaskIDs: []string{"t_compact"}, Since: now}}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &oh})
	if app.keepOfTask("t_compact") != "kp_compact" || app.keepOfTask("t_keys") != "" {
		t.Fatalf("keepOfTask: %q %q", app.keepOfTask("t_compact"), app.keepOfTask("t_keys"))
	}
	app.OpenTask("t_keys")
	tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	if err := tt.Click("Compaction stall on hel"); err != nil {
		t.Fatalf("no rail row for the Keep's task: %v", err)
	}
	tt.Frame()
	if app.Route != RouteOnHand || app.oh.keep.open != "kp_compact" {
		t.Errorf("the rail row opened route %v task %q keep %q, want the Keep's page", app.Route, app.TaskID, app.oh.keep.open)
	}
}
