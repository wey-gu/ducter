package views

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D198: 打开 / Open on an opened task, shown only while its working copy
// is on this Mac, with the editors found here; the path itself always.
func TestOpenInMenu(t *testing.T) {
	wt := filepath.Join(t.TempDir(), "worktrees", "hawdb", "compaction-fix")
	if err := os.MkdirAll(wt, 0o755); err != nil {
		t.Fatal(err)
	}
	type call struct{ with, path string }
	open := func(lang i18n.Lang, url string, place protocol.Place, devices []protocol.DeviceView) (*App, *ui.Tester, *[]call) {
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		app.LocaleFixed = true
		app.URL = url
		app.ThisComputer = "MacBook"
		var calls []call
		app.OpenFolder = func(with, path string) error { calls = append(calls, call{with, path}); return nil }
		app.Editors = []Editor{{Name: "Zed", App: "/Applications/Zed.app"}, {Name: "Cursor", App: "/Applications/Cursor.app"}}
		now := time.Now().UTC().Format(time.RFC3339)
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
			{TaskID: "t1", Title: "Fix the flaky compaction test", Project: "HawDB", Place: place, Harness: "claude-code", Attention: protocol.Done, OpenedAt: now, UpdatedAt: now},
		}}})
		app.S.Devices = devices
		app.Route, app.TaskID = RouteTask, "t1"
		tt := ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		return app, tt, &calls
	}
	repo := protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/hawdb", Worktree: wt, Branch: "ducter/compaction-fix", BaseBranch: "main"}

	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		about := L.T("task.open.about")

		// This Mac's own Ducter: the menu, Finder and Terminal, then each editor.
		_, tt, calls := open(lang, "", repo, nil)
		if !tt.HasText(tildePath(wt)) {
			t.Errorf("%s: the path isn't shown: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "open-in-"+string(lang))
		if err := tt.Click(about); err != nil {
			t.Fatalf("%s: no %s: %v in %q", lang, about, err, tt.Texts())
		}
		want := []string{L.T("task.open.finder"), L.T("task.open.terminal"), "-", L.T("task.open.editor", "Zed"), L.T("task.open.editor", "Cursor")}
		if got := tt.Menu(); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: menu %q, want %q", lang, got, want)
		}
		if err := tt.ChooseMenuItem(L.T("task.open.editor", "Zed")); err != nil {
			t.Fatal(err)
		}
		if len(*calls) != 1 || (*calls)[0] != (call{"/Applications/Zed.app", wt}) {
			t.Errorf("%s: Open in Zed opened %+v", lang, *calls)
		}
		_ = tt.Click(about)
		_ = tt.ChooseMenuItem(L.T("task.open.finder"))
		if len(*calls) != 2 || (*calls)[1] != (call{"finder", wt}) {
			t.Errorf("%s: Show in Finder opened %+v", lang, *calls)
		}

		// A Ducter elsewhere, its place on that computer: no menu, the path as text.
		_, tt, _ = open(lang, "wss://hel.example.com/ws", repo, nil)
		if _, ok := tt.Find(about); ok {
			t.Errorf("%s: %s shows for a remote place", lang, about)
		}
		if !tt.HasText(tildePath(wt)) {
			t.Errorf("%s: a remote place's path isn't shown: %q", lang, tt.Texts())
		}

		// A Ducter elsewhere whose task runs on this Mac's own worker: the menu.
		mine := repo
		mine.Device = "dev_mac"
		_, tt, _ = open(lang, "wss://hel.example.com/ws", mine, []protocol.DeviceView{{ID: "hel", Name: "hel", Home: true}, {ID: "dev_mac", Name: "MacBook", Computer: "MacBook"}})
		if _, ok := tt.Find(about); !ok {
			t.Errorf("%s: no %s for a task on this Mac's worker: %q", lang, about, tt.Texts())
		}
		// ... and on another Mac's worker, none.
		other := repo
		other.Device = "dev_mini"
		_, tt, _ = open(lang, "wss://hel.example.com/ws", other, []protocol.DeviceView{{ID: "hel", Name: "hel", Home: true}, {ID: "dev_mini", Name: "Mac mini", Computer: "Mac mini"}})
		if _, ok := tt.Find(about); ok {
			t.Errorf("%s: %s shows for another Mac's worker", lang, about)
		}

		// A folder task (D142) opens the folder itself; no editors found: Finder and Terminal only.
		app, tt, calls := open(lang, "", protocol.Place{Kind: "folder", Device: "local", Path: wt}, nil)
		app.Editors = nil
		tt.Frame()
		if err := tt.Click(about); err != nil {
			t.Fatalf("%s: folder: %v", lang, err)
		}
		if got := strings.Join(tt.Menu(), "|"); got != L.T("task.open.finder")+"|"+L.T("task.open.terminal") {
			t.Errorf("%s: folder menu %q", lang, got)
		}
		_ = tt.ChooseMenuItem(L.T("task.open.terminal"))
		if len(*calls) != 1 || (*calls)[0] != (call{"terminal", wt}) {
			t.Errorf("%s: folder: Open in Terminal opened %+v", lang, *calls)
		}

		// Its worktree gone (archived after a merge): nothing to open.
		gone := repo
		gone.Worktree = filepath.Join(filepath.Dir(wt), "merged-and-removed")
		_, tt, _ = open(lang, "", gone, nil)
		if _, ok := tt.Find(about); ok {
			t.Errorf("%s: %s shows for a worktree that's gone", lang, about)
		}
	}
}
