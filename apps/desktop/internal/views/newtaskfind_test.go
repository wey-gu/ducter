package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D203: the repos a computer reports are places (Found), so Claude Code
// on the Mac for hel's ducter switches to the Mac's copy (keeping the
// branch once that copy says its branches); with no folder there, the
// list says so and offers 选择文件夹…, which looks through the Mac's
// folders and adds the one used there, picking the agent that waited.

var tuneMacFound = protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", Device: "dev_mac", RepoPath: "/Users/weyl/dev/ducter"}, Name: "ducter", DefaultBranch: "main", Remote: "github.com/wey-gu/ducter", Found: true, Computer: "Macbook Pro M3"}

func TestNewTaskReportedCopy(t *testing.T) {
	app, sent := tuneApp(t, i18n.ZH, []protocol.PlaceChoice{tuneHelRepo, tuneMacFound, tuneNone}, tuneCandsAtHel())
	rows, _ := app.ntCands(app.S.NewTaskOptions.Candidates)
	app.nt.branch = "next"
	app.pickAgent(rows[1], topCandidate(rows), true)
	if got := app.chosenPlace(app.newTaskPlaces()).Place; got.Device != "dev_mac" || got.RepoPath != "/Users/weyl/dev/ducter" {
		t.Fatalf("switched to the Mac's reported copy: %+v", got)
	}
	if app.nt.wantBranch != "next" {
		t.Fatalf("the branch waits for the copy's branches: %q", app.nt.wantBranch)
	}
	if o, ok := lastFrame[protocol.TaskNewOptions](sent); !ok || o.Place == nil || o.Place.Device != "dev_mac" {
		t.Errorf("asked at the Mac's copy (its branches come with it): %+v", o)
	}
	withBranches := tuneMacFound
	withBranches.Branches = []string{"main", "next"}
	app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{tuneHelRepo, withBranches, tuneNone}, Candidates: tuneCandsAtMac(), Models: tuneModels()})
	app.drainNewTask()
	if app.nt.branch != "next" || app.nt.wantBranch != "" {
		t.Errorf("the branch kept once the copy has it: %q %q", app.nt.branch, app.nt.wantBranch)
	}
}

func TestNewTaskFindAFolder(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := tuneAppUI(t, lang, []protocol.PlaceChoice{tuneHelRepo, tuneNone}, tuneCandsAtHel())
		L := app.L
		app.nt.words = map[i18n.Lang]string{i18n.ZH: "给博客加一个 RSS", i18n.EN: "Add an RSS feed to the blog"}[lang]
		rows, _ := app.ntCands(app.S.NewTaskOptions.Candidates)
		app.pickAgent(rows[1], topCandidate(rows), true)
		tt.Frame()
		for _, s := range []string{L.T("newtask.find.empty", "Macbook Pro M3"), L.T("newtask.find")} {
			if !tt.HasText(s) {
				t.Errorf("%s: the Mac's empty list: no %q: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "find-empty-"+string(lang))
		click(t, tt, L.T("newtask.find")+" · Macbook Pro M3")
		f, ok := lastFrame[protocol.FolderBrowse](sent)
		if !ok || f.Device != "dev_mac" || f.Path != "" {
			t.Fatalf("%s: asked the Mac for its home folder: %+v", lang, f)
		}
		app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: f.ClientID, Device: "dev_mac", Path: "/Users/weyl", HomeDir: "/Users/weyl", Folders: []protocol.BrowseFolder{{Name: "dev", Path: "/Users/weyl/dev"}, {Name: "Sites", Path: "/Users/weyl/Sites"}}})
		tt.Frame()
		click(t, tt, "Sites")
		f, _ = lastFrame[protocol.FolderBrowse](sent)
		app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: f.ClientID, Device: "dev_mac", Path: "/Users/weyl/Sites", HomeDir: "/Users/weyl", Parent: "/Users/weyl", Folders: []protocol.BrowseFolder{{Name: "blog", Path: "/Users/weyl/Sites/blog", Repo: true}, {Name: "drafts", Path: "/Users/weyl/Sites/drafts"}}})
		tt.Frame()
		for _, s := range []string{L.T("newtask.find.title", "Macbook Pro M3"), "~/Sites", L.T("newtask.find.up"), "blog", L.T("newtask.find.use")} {
			if !tt.HasText(s) {
				t.Errorf("%s: the browser: no %q: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "find-browse-"+string(lang))
		click(t, tt, "blog")
		f, _ = lastFrame[protocol.FolderBrowse](sent)
		app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: f.ClientID, Device: "dev_mac", Path: "/Users/weyl/Sites/blog", HomeDir: "/Users/weyl", Parent: "/Users/weyl/Sites"})
		tt.Frame()
		if !tt.HasText(L.T("newtask.find.none")) {
			t.Errorf("%s: an empty folder says so: %q", lang, tt.Texts())
		}
		click(t, tt, L.T("newtask.find.use")+" · ~/Sites/blog")
		add, ok := lastFrame[protocol.ProjectAdd](sent)
		if !ok || add.Path != "/Users/weyl/Sites/blog" || add.Device != "dev_mac" {
			t.Fatalf("%s: added on the Mac: %+v", lang, add)
		}
		blog := protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", Device: "dev_mac", RepoPath: "/Users/weyl/Sites/blog"}, Name: "blog", Added: true, DefaultBranch: "main", Branches: []string{"main"}}
		app.Receive(protocol.ServerFrame{T: "project_add_result", OK: true, ClientID: add.ClientID, Place: &blog})
		tt.Frame()
		if app.nt.pick != "dev_mac|claude-code" || app.nt.placeKey != placeKey(blog.Place) || app.nt.browse != nil || app.nt.placeOpen {
			t.Errorf("%s: the folder is the place and Claude Code on the Mac is who: %+v", lang, app.nt)
		}
	}
}

// The home's own computer can be looked through too, with no device; an
// away worker says so in words.
func TestNewTaskFindOnTheHome(t *testing.T) {
	app, sent, tt := tuneAppUI(t, i18n.EN, []protocol.PlaceChoice{tuneHelRepo, tuneNone}, tuneCandsAtHel())
	app.nt.shut("place")
	tt.Frame()
	click(t, tt, "Find a folder… · hel")
	f, _ := lastFrame[protocol.FolderBrowse](sent)
	if f.Device != "" {
		t.Errorf("the home's own: no device: %+v", f)
	}
	app.startBrowse("dev_mac", "")
	f, _ = lastFrame[protocol.FolderBrowse](sent)
	app.Receive(protocol.ServerFrame{T: "folder_browse_result", ClientID: f.ClientID, Device: "dev_mac", Reason: "offline"})
	tt.Frame()
	if !tt.HasText("Can't reach Macbook Pro M3 right now.") {
		t.Errorf("away: %q", tt.Texts())
	}
}
