package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D204: 从 Git 地址加… / Add from a Git address… on any computer of the
// home; and New task with no dead end in each situation the phone card
// handles the same way (apps/web/test/clone-folder.test.ts): hel + the
// Mac, an older Mac, a first run with no folders anywhere.
//
//	DUCTER_NEWTASK_SHOTS=<dir> go test ./internal/views -run NewTaskClone   # writes the shots

var tuneFolders = []protocol.DucterFolderView{{Device: "local", Path: "/root/ducter"}, {Device: "dev_mac", Path: "/Users/weyl/ducter-work"}}

func TestNewTaskCloneOnTheMac(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := tuneAppUI(t, lang, []protocol.PlaceChoice{tuneHelRepo, tuneNone}, tuneCandsAtHel())
		app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{tuneHelRepo, tuneNone}, Candidates: tuneCandsAtHel(), Models: tuneModels(), DucterFolders: tuneFolders})
		L := app.L
		app.nt.words = map[i18n.Lang]string{i18n.ZH: "把 con 的设置页改成两栏", i18n.EN: "Make con's settings page two columns"}[lang]
		rows, _ := app.ntCands(app.S.NewTaskOptions.Candidates)
		app.pickAgent(rows[1], topCandidate(rows), true) // Claude Code on the Mac: no copy there
		tt.Frame()
		for _, s := range []string{L.T("newtask.find.empty", "Macbook Pro M3"), L.T("newtask.find"), L.T("newtask.clone"), L.T("newtask.nowhere")} {
			if !tt.HasText(s) {
				t.Errorf("%s: the Mac's empty list offers a way on: no %q: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "clone-row-"+string(lang))
		click(t, tt, L.T("newtask.clone")+" · Macbook Pro M3")
		if app.nt.clone == nil || app.nt.clone.device != "dev_mac" {
			t.Fatalf("%s: the field for the Mac: %+v", lang, app.nt.clone)
		}
		// Where it goes: the Mac's own Ducter folder, its real path (the fallback here).
		where := L.T("newtask.clone.where", "~/ducter-work/projects", "Macbook Pro M3")
		if !tt.HasText(where) || !tt.HasText(L.T("newtask.clone.title", "Macbook Pro M3")) {
			t.Errorf("%s: the field says where and on which computer: %q", lang, tt.Texts())
		}
		tt.Type("nowledge-co/con")
		tt.Frame()
		newTaskShot(t, tt, "clone-field-"+string(lang))
		click(t, tt, L.T("newtask.clone.go")+" · "+L.T("newtask.clone.title", "Macbook Pro M3"))
		k, ok := lastFrame[protocol.ProjectClone](sent)
		if !ok || k.Address != "nowledge-co/con" || k.Device != "dev_mac" || k.ClientID == "" {
			t.Fatalf("%s: cloned on the Mac: %+v", lang, k)
		}
		tt.Frame()
		if !tt.HasText(L.T("newtask.clone.busy")) {
			t.Errorf("%s: cloning says so: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "clone-busy-"+string(lang))
		// A socket that comes back asks for the same clone again.
		n := len(*sent)
		app.Welcomed()
		if again, _ := lastFrame[protocol.ProjectClone](sent); len(*sent) == n || again.ClientID != k.ClientID {
			t.Errorf("%s: a clone in flight goes again with its id: %+v", lang, again)
		}
		app.Receive(protocol.ServerFrame{T: "project_clone_result", OK: false, ClientID: k.ClientID, Device: "dev_mac", Reason: "no_access", Message: "could not read Username"})
		app.drainNewTask()
		tt.Frame()
		why := L.T("newtask.clone.err.no_access", "Macbook Pro M3")
		if !tt.HasText(why) {
			t.Errorf("%s: the failure in words: %q", lang, tt.Texts())
		}
		newTaskShot(t, tt, "clone-failed-"+string(lang))
		click(t, tt, L.T("newtask.clone.go")+" · "+L.T("newtask.clone.title", "Macbook Pro M3"))
		k, _ = lastFrame[protocol.ProjectClone](sent)
		con := protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", Device: "dev_mac", RepoPath: "/Users/weyl/ducter-work/projects/con"}, Name: "con", Added: true, DefaultBranch: "main", Branches: []string{"main"}}
		app.Receive(protocol.ServerFrame{T: "project_clone_result", OK: true, ClientID: k.ClientID, Device: "dev_mac", Place: &con})
		app.drainNewTask()
		tt.Frame()
		if app.nt.pick != "dev_mac|claude-code" || app.nt.placeKey != placeKey(con.Place) || app.nt.clone != nil || app.nt.placeOpen {
			t.Errorf("%s: the clone is the place and Claude Code on the Mac is who: %+v", lang, app.nt)
		}
	}
}

// An older Mac: its Find and clone rows give way to one greyed row that
// says to update it; what it answers says so in words.
func TestNewTaskCloneOlderWorker(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := tuneAppUI(t, lang, []protocol.PlaceChoice{tuneHelRepo, tuneNone}, tuneCandsAtHel())
		app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{tuneHelRepo, tuneNone}, Candidates: tuneCandsAtHel(), Models: tuneModels(),
			DucterFolders: []protocol.DucterFolderView{{Device: "local", Path: "/root/ducter"}, {Device: "dev_mac", Old: true}}})
		L := app.L
		app.nt.shut("place")
		tt.Frame()
		if !tt.HasText(L.T("newtask.old.row", "Macbook Pro M3")) || !tt.HasText(L.T("newtask.old.why")) {
			t.Errorf("%s: the older Mac says to update it: %q", lang, tt.Texts())
		}
		for _, s := range []string{L.T("newtask.find") + " · Macbook Pro M3", L.T("newtask.clone") + " · Macbook Pro M3"} {
			if tt.Click(s) == nil {
				t.Errorf("%s: no %q row for an older Mac", lang, s)
			}
		}
		newTaskShot(t, tt, "clone-old-"+string(lang))
		// Its own answer, as the D203 server words it: shown in the user's words.
		app.startBrowse("dev_mac", "")
		f, _ := lastFrame[protocol.FolderBrowse](sent)
		app.Receive(protocol.ServerFrame{T: "folder_browse_result", ClientID: f.ClientID, Device: "dev_mac", Reason: "old", Message: "Macbook Pro M3 runs an older Ducter that can't look through its folders yet; update it first."})
		app.drainNewTask()
		tt.Frame()
		if !tt.HasText(L.T("newtask.old", "Macbook Pro M3")) {
			t.Errorf("%s: an older Mac's browse: %q", lang, tt.Texts())
		}
	}
}

// A first run: no folders anywhere. The list says so and still offers
// this Mac's picker (when the window's Ducter runs here), Find a folder…,
// Add from a Git address… and No folder.
func TestNewTaskCloneFirstRun(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, tt := newTaskApp(t, lang)
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "Ana's MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake}}})
		app.PickFolder = func(title, button string) (string, error) { return "", nil }
		app.OpenNewTask(nil)
		app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{tuneNone}, Candidates: []protocol.Candidate{{Harness: "claude-code", Model: "opus", Reason: protocol.CandidateReason{Kind: "fit"}}}, DucterFolders: []protocol.DucterFolderView{{Device: "local", Path: "/Users/ana/ducter"}}})
		L := app.L
		app.nt.shut("place")
		tt.Frame()
		for _, s := range []string{L.T("newtask.empty"), L.T("newtask.addfolder"), L.T("newtask.clone"), L.T("newtask.nowhere")} {
			if !tt.HasText(s) {
				t.Errorf("%s: first run: no %q: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "clone-firstrun-"+string(lang))
		click(t, tt, L.T("newtask.clone"))
		if !tt.HasText(L.T("newtask.clone.where", "~/ducter/projects", "Ana's MacBook")) {
			t.Errorf("%s: this Mac's folder: %q", lang, tt.Texts())
		}
	}
}
