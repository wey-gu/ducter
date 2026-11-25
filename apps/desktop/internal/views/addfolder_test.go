package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D455: the author's home is a server ("Hetzner Server"), with a Mac mini
// and this MacBook doing tasks for it. On hand's 添加文件夹 opens one
// sheet: the computer first (the server, where the latest work was), its
// folders listed by the server through Ducter (recent ones first, each
// repo with its origin, narrowed by typing or a path), never this Mac's
// picker; another computer is one tap; adding closes the sheet and On
// hand shows the project, with every computer it lives on under its name.
//
//	DUCTER_NEWTASK_SHOTS=<dir> go test ./internal/views -run AddFolderSheet
func TestAddFolderSheet(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			app, sent, tt := newTaskApp(t, lang)
			L := app.L
			tt.SetSize(1280, 860)
			tt.SetDark(dark)
			sz := "-" + string(lang)
			if dark {
				sz += "-dark"
			}
			app.URL = "wss://hetzner.example/ws"
			app.MacWorker = &macWorkOn{on: true} // this Mac does tasks for it as dev_mac
			picked := false
			app.PickFolder = func(string, string) (string, error) { picked = true; return "/Users/weyl/x", nil }
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
				{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: protocol.DeviceAwake},
				{ID: "mini", Name: "Mac mini", Kind: "mini", State: protocol.DeviceAwake},
				{ID: "dev_mac", Name: "MacBook Pro", Kind: "laptop", State: protocol.DeviceAwake},
			}})
			now := time.Now()
			ago := func(d time.Duration) string { return now.Add(-d).UTC().Format(time.RFC3339) }
			hel := func(path, branch string) protocol.Place {
				return protocol.Place{Kind: "repo", Device: "local", RepoPath: path, Branch: branch, BaseBranch: "main"}
			}
			mac := protocol.Place{Kind: "repo", Device: "dev_mac", RepoPath: "/Users/weyl/dev/ducter", Branch: "ducter/onhand", BaseBranch: "main"}
			app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
				Tasks: []protocol.TaskCard{
					{TaskID: "t1", Title: map[i18n.Lang]string{i18n.ZH: "把 compaction 的偶发失败修掉", i18n.EN: "Fix the flaky compaction test"}[lang], Project: "HawDB", Place: hel("/root/code/hawdb", "ducter/compaction"), Harness: "codex", Attention: protocol.Working, OpenedAt: ago(time.Hour), UpdatedAt: ago(2 * time.Minute)},
					{TaskID: "t2", Title: map[i18n.Lang]string{i18n.ZH: "On hand 的项目栏显示每个项目在哪台电脑上", i18n.EN: "Show where each project lives in On hand"}[lang], Project: "ducter", Place: mac, Harness: "claude-code", Attention: protocol.NeedsYou, OpenedAt: ago(2 * time.Hour), UpdatedAt: ago(20 * time.Minute)},
					{TaskID: "t3", Title: map[i18n.Lang]string{i18n.ZH: "发布 0.1.9", i18n.EN: "Release 0.1.9"}[lang], Project: "ducter", Place: hel("/root/code/ducter", "release/0.1.9"), Harness: "codex", Attention: protocol.Done, OpenedAt: ago(5 * time.Hour), UpdatedAt: ago(3 * time.Hour)},
				},
				Projects: []protocol.ProjectView{{Name: "ducter", Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/root/code/ducter"}, Remote: "github.com/wey-gu/ducter"}},
			}})
			app.Route = RouteOnHand
			tt.Frame()
			tt.Frame()
			// The project column says where each project lives.
			for _, s := range []string{"HawDB", "ducter", "Hetzner Server", "MacBook Pro"} {
				if !hasText(tt, s) {
					t.Errorf("%s: the column: no %q: %q", lang, s, tt.Texts())
				}
			}
			newTaskShot(t, tt, "d455-onhand"+sz)

			click(t, tt, "＋ "+L.T("onhand.addfolder"))
			if !app.addf.open || app.addf.device != "local" || app.addf.way != "choose" {
				t.Fatalf("%s: the sheet opens on the server, choosing: %+v", lang, app.addf)
			}
			if _, ok := lastFrame[protocol.TaskNewOptions](sent); !ok {
				t.Errorf("%s: the sheet asks for the recent places", lang)
			}
			b, ok := lastFrame[protocol.FolderBrowse](sent)
			if !ok || b.Device != "" || b.Path != "" || picked {
				t.Fatalf("%s: it looks through the server's folders, never this Mac's picker (browse %+v, picker %v)", lang, b, picked)
			}
			app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{
				{Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/root/code/hawdb"}, Name: "hawdb", Remote: "github.com/acme/hawdb", UsedAt: ago(2 * time.Minute)},
				{Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/root/code/ducter"}, Name: "ducter", Remote: "github.com/wey-gu/ducter", Added: true},
				{Place: protocol.Place{Kind: "repo", Device: "dev_mac", RepoPath: "/Users/weyl/dev/ducter"}, Name: "ducter", Remote: "github.com/wey-gu/ducter"},
				{Place: protocol.Place{Kind: "none"}},
			}, DucterFolders: []protocol.DucterFolderView{{Device: "local", Path: "/root/ducter"}, {Device: "mini", Path: "/Users/ana/ducter"}, {Device: "dev_mac", Path: "/Users/weyl/ducter"}}})
			app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: app.nt.browse.cid, Path: "/root", HomeDir: "/root", Folders: []protocol.BrowseFolder{
				{Name: "code", Path: "/root/code"}, {Name: "ducter", Path: "/root/ducter"}, {Name: "backups", Path: "/root/backups"}, {Name: "notes", Path: "/root/notes"},
			}})
			app.drainNewTask()
			tt.Frame()
			for _, s := range []string{L.T("addfolder.title"), L.T("addfolder.computer"), "Hetzner Server", "Mac mini", "MacBook Pro", L.T("addfolder.recent"), "github.com/acme/hawdb", "~", "code"} {
				if !hasText(tt, s) {
					t.Errorf("%s: the sheet: no %q: %q", lang, s, tt.Texts())
				}
			}
			newTaskShot(t, tt, "d455-sheet"+sz)

			// A path typed lists the folder it names and narrows to what follows.
			app.nt.browse.filter = "~/code/ha"
			tt.Frame()
			tt.Frame()
			b, _ = lastFrame[protocol.FolderBrowse](sent)
			_ = b
			app.startBrowseKeep("local", "/root/code", "~/code/ha")
			app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: app.nt.browse.cid, Path: "/root/code", HomeDir: "/root", Parent: "/root", Folders: []protocol.BrowseFolder{
				{Name: "hawdb", Path: "/root/code/hawdb", Repo: true, Remote: "github.com/acme/hawdb"},
				{Name: "ducter", Path: "/root/code/ducter", Repo: true, Remote: "github.com/wey-gu/ducter"},
				{Name: "hawdb-bench", Path: "/root/code/hawdb-bench"},
				{Name: "site", Path: "/root/code/site", Repo: true},
			}})
			app.drainNewTask()
			tt.Frame()
			if hasText(tt, "site") || !hasText(tt, "hawdb") || !hasText(tt, "hawdb-bench") {
				t.Errorf("%s: narrowed to ha: %q", lang, tt.Texts())
			}
			newTaskShot(t, tt, "d455-filter"+sz)

			// Inside a repo: adding adds the whole repo, said first.
			click(t, tt, "hawdb")
			cid := app.nt.browse.cid
			app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: cid, Path: "/root/code/hawdb", HomeDir: "/root", Parent: "/root/code",
				InRepo:  &protocol.BrowseRepo{Root: "/root/code/hawdb", Name: "hawdb", Remote: "github.com/acme/hawdb"},
				Folders: []protocol.BrowseFolder{{Name: "cmd", Path: "/root/code/hawdb/cmd"}, {Name: "pkg", Path: "/root/code/hawdb/pkg"}}})
			app.drainNewTask()
			tt.Frame()
			if !hasText(tt, L.T("addfolder.add.on", "hawdb", "Hetzner Server")) {
				t.Errorf("%s: the add button names it: %q", lang, tt.Texts())
			}
			newTaskShot(t, tt, "d455-repo"+sz)

			// Another computer is one tap: its own folders.
			click(t, tt, "Mac mini")
			if b, _ := lastFrame[protocol.FolderBrowse](sent); b.Device != "mini" || app.addf.device != "mini" {
				t.Fatalf("%s: the Mac mini's folders: %+v", lang, b)
			}
			app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: app.nt.browse.cid, Path: "/Users/ana", HomeDir: "/Users/ana", Folders: []protocol.BrowseFolder{{Name: "dev", Path: "/Users/ana/dev"}, {Name: "Documents", Path: "/Users/ana/Documents"}}})
			app.drainNewTask()
			app.startBrowse("mini", "/Users/ana/dev")
			app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: app.nt.browse.cid, Path: "/Users/ana/dev/hawdb", HomeDir: "/Users/ana", Parent: "/Users/ana/dev",
				InRepo: &protocol.BrowseRepo{Root: "/Users/ana/dev/hawdb", Name: "hawdb", Remote: "github.com/acme/hawdb"}})
			app.drainNewTask()
			tt.Frame()
			click(t, tt, L.T("addfolder.add.on", "hawdb", "Mac mini"))
			add, ok := lastFrame[protocol.ProjectAdd](sent)
			if !ok || add.Device != "mini" || add.Path != "/Users/ana/dev/hawdb" {
				t.Fatalf("%s: added on the Mac mini: %+v", lang, add)
			}
			app.Receive(protocol.ServerFrame{T: "project_add_result", OK: true, ClientID: add.ClientID, Place: &protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", Device: "mini", RepoPath: "/Users/ana/dev/hawdb"}, Name: "hawdb", Added: true}})
			app.drainNewTask()
			tt.Frame()
			if app.addf.open || app.Local.Lens() != "hawdb" {
				t.Errorf("%s: added, the sheet closes on that project (open %v, lens %q)", lang, app.addf.open, app.Local.Lens())
			}
			// D457: the project arrives in the column with a ring that fades.
			if _, live := app.arrivalFor("hawdb"); !live {
				t.Errorf("%s: the added project arrives", lang)
			}
			newTaskShot(t, tt, "d457-arrived"+sz)

			// Clone and New are the same sheet, on the chosen computer; Cancel closes it.
			app.OpenAddFolder()
			tt.Frame()
			click(t, tt, L.T("addfolder.way.clone"))
			if app.nt.clone == nil || app.nt.clone.device != "local" {
				t.Fatalf("%s: clone on the server: %+v", lang, app.nt.clone)
			}
			newTaskShot(t, tt, "d455-clone"+sz)
			click(t, tt, L.T("addfolder.way.new"))
			if app.nt.newf == nil || app.nt.newf.device != "local" {
				t.Fatalf("%s: new folder on the server: %+v", lang, app.nt.newf)
			}
			if !hasText(tt, L.T("newtask.new.where", "/root/ducter/projects")) {
				t.Errorf("%s: says where it goes: %q", lang, tt.Texts())
			}
			click(t, tt, L.T("addfolder.cancel"))
			if app.addf.open {
				t.Errorf("%s: Cancel closes it", lang)
			}
		}
	}
}

// D455: the browser's field reads a path or a name.
func TestBrowseNeedle(t *testing.T) {
	for _, c := range []struct{ typed, shown, home, dir, needle string }{
		{"du", "/root", "/root", "", "du"},
		{"~/code/ha", "/root", "/root", "/root/code", "ha"},
		{"~/code/ha", "/root/code", "/root", "", "ha"},
		{"/srv/", "/root", "/root", "/srv", ""},
		{"~", "/root/code", "/root", "/root", ""},
		{"/", "/root", "/root", "/", ""},
	} {
		dir, needle := browseNeedle(c.typed, c.shown, c.home)
		if dir != c.dir || needle != c.needle {
			t.Errorf("%q in %s: %q %q, want %q %q", c.typed, c.shown, dir, needle, c.dir, c.needle)
		}
	}
	_ = ui.Center
}
