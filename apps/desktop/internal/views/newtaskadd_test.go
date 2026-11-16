package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D272: the author's home is a server ("Hetzner Server") and this Mac
// doesn't do tasks for it. 加一个文件夹… offers the server's own ways in
// order (New folder, Choose there, Clone), never this Mac's picker; a new
// folder needs no git; the clone field says where the server stands with
// GitHub and signs it in (the code, or a pasted key), never keeping one.
//
//	DUCTER_NEWTASK_SHOTS=<dir> go test ./internal/views -run NewTaskAddOnAServer
func TestNewTaskAddOnAServer(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{900, 1280} {
			app, sent, tt := newTaskApp(t, lang)
			tt.SetSize(w, 820)
			L := app.L
			app.URL = "wss://hetzner.example/ws"
			app.MacWorker = &macWorkOn{on: false}
			picked := false
			app.PickFolder = func(string, string) (string, error) { picked = true; return "/Users/weyl/x", nil }
			app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: protocol.DeviceAwake}}})
			app.OpenNewTask(nil)
			app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{{Place: protocol.Place{Kind: "none"}}}, Candidates: []protocol.Candidate{{Harness: "codex", Model: "gpt-6.1-terra", Reason: protocol.CandidateReason{Kind: "fit"}}},
				DucterFolders: []protocol.DucterFolderView{{Device: "local", Path: "/root/ducter"}}})
			app.nt.words = map[i18n.Lang]string{i18n.ZH: "把三月的发票整理成一张表", i18n.EN: "Put March's invoices in one sheet"}[lang]
			app.nt.shut("place")
			tt.Frame()
			sz := "-" + string(lang) + "-" + map[int]string{900: "900", 1280: "1280"}[w]
			newTaskShot(t, tt, "d272-list"+sz)
			click(t, tt, L.T("newtask.add"))
			for _, s := range []string{L.T("newtask.add.title", "Hetzner Server"), L.T("newtask.new", "Hetzner Server"), L.T("newtask.new.line", "/root/ducter/projects"), L.T("newtask.choose", "Hetzner Server"), L.T("newtask.choose.line"), L.T("newtask.clone")} {
				if !tt.HasText(s) {
					t.Errorf("%s: the add panel: no %q: %q", lang, s, tt.Texts())
				}
			}
			newTaskShot(t, tt, "d272-add"+sz)

			// New folder: a name, no git, made on the server and picked.
			click(t, tt, L.T("newtask.new", "Hetzner Server"))
			tt.Type(map[i18n.Lang]string{i18n.ZH: "发票", i18n.EN: "Invoices"}[lang])
			tt.Frame()
			name := map[i18n.Lang]string{i18n.ZH: "发票", i18n.EN: "Invoices"}[lang]
			if !tt.HasText(L.T("newtask.new.where", "/root/ducter/projects/"+name)) {
				t.Errorf("%s: says where it goes: %q", lang, tt.Texts())
			}
			newTaskShot(t, tt, "d272-new"+sz)
			click(t, tt, L.T("newtask.new.go")+" · "+L.T("newtask.new.title", "Hetzner Server"))
			n, ok := lastFrame[protocol.ProjectNew](sent)
			if !ok || n.Name != name || n.Device != "" || n.ClientID == "" {
				t.Fatalf("%s: project_new %+v", lang, n)
			}
			app.Receive(protocol.ServerFrame{T: "project_new_result", OK: false, ClientID: n.ClientID, Reason: "invalid"})
			app.drainNewTask()
			tt.Frame()
			if !tt.HasText(L.T("newtask.new.err.invalid")) {
				t.Errorf("%s: a bad name says why: %q", lang, tt.Texts())
			}
			app.startNewFolder()
			n, _ = lastFrame[protocol.ProjectNew](sent)
			folder := protocol.PlaceChoice{Place: protocol.Place{Kind: "folder", Device: "local", Path: "/root/ducter/projects/" + name}, Name: name, Added: true}
			app.Receive(protocol.ServerFrame{T: "project_new_result", OK: true, ClientID: n.ClientID, Place: &folder})
			app.drainNewTask()
			tt.Frame()
			if app.nt.placeKey != placeKey(folder.Place) || app.nt.newf != nil || app.nt.placeOpen {
				t.Errorf("%s: the new folder is the place: %+v", lang, app.nt)
			}

			// Choose on the server: its folders, never this Mac's picker.
			app.nt.shut("place")
			tt.Frame()
			click(t, tt, L.T("newtask.add"))
			click(t, tt, L.T("newtask.choose", "Hetzner Server"))
			if b, ok := lastFrame[protocol.FolderBrowse](sent); !ok || b.Device != "" || picked {
				t.Fatalf("%s: chose on the server (browse %+v, picker %v)", lang, b, picked)
			}
			app.Receive(protocol.ServerFrame{T: "folder_browse_result", OK: true, ClientID: app.nt.browse.cid, Path: "/root", HomeDir: "/root", Folders: []protocol.BrowseFolder{{Name: "ducter", Path: "/root/ducter"}, {Name: "invoices", Path: "/root/invoices"}}})
			app.drainNewTask()
			tt.Frame()
			newTaskShot(t, tt, "d272-choose"+sz)
			click(t, tt, L.T("newtask.find.back"))

			// Clone: the server isn't signed in to GitHub, and says so with the button.
			click(t, tt, L.T("newtask.clone"))
			st, _ := lastFrame[protocol.GitLogin](sent)
			if st.Action != "status" || st.Device != "" {
				t.Fatalf("%s: asked the server's GitHub sign-in: %+v", lang, st)
			}
			app.Receive(protocol.ServerFrame{T: "git_login_state", ClientID: st.ClientID, GitHost: "github.com", State: "signed_out"})
			app.drainNewTask()
			tt.Type("https://github.com/nowledge-co/mem")
			tt.Frame()
			for _, s := range []string{L.T("newtask.gh.out", "Hetzner Server"), L.T("newtask.gh.signin", "Hetzner Server"), L.T("newtask.clone.go")} {
				if !tt.HasText(s) {
					t.Errorf("%s: the clone field: no %q: %q", lang, s, tt.Texts())
				}
			}
			newTaskShot(t, tt, "d272-clone"+sz)

			// The key fallback: masked, sent once, emptied, never shown back.
			click(t, tt, L.T("newtask.gh.signin", "Hetzner Server"))
			g, _ := lastFrame[protocol.GitLogin](sent)
			app.Receive(protocol.ServerFrame{T: "git_login_state", ClientID: g.ClientID, GitHost: "github.com", State: "code", Code: "7F3K-QW2M", URL: "https://github.com/login/device"})
			app.drainNewTask()
			tt.Frame()
			newTaskShot(t, tt, "d272-code"+sz)
			click(t, tt, L.T("newtask.gh.key"))
			if c, _ := lastFrame[protocol.GitLogin](sent); c.Action != "cancel" {
				t.Errorf("%s: switching to a key stops the code: %+v", lang, c)
			}
			key := "ghp_" + "f4k3k3yf4k3k3yf4k3k3yf4k3k3yf4k3k3y"
			tt.Type(key)
			tt.Frame()
			if tt.HasText(key) {
				t.Errorf("%s: the key shows in the clear", lang)
			}
			newTaskShot(t, tt, "d272-key"+sz)
			click(t, tt, L.T("newtask.gh.key.go"))
			k, _ := lastFrame[protocol.GitLogin](sent)
			if k.Action != "token" || k.Token != key || app.nt.login.token != "" {
				t.Fatalf("%s: the key goes once and the field empties: %+v", lang, k)
			}
			app.Receive(protocol.ServerFrame{T: "git_login_state", ClientID: k.ClientID, GitHost: "github.com", State: "failed", Reason: "bad_token", Message: "missing required scope 'read:org'"})
			app.drainNewTask()
			tt.Frame()
			if !tt.HasText(L.T("newtask.gh.err.bad_key", "missing required scope 'read:org'")) || app.nt.login.phase != "token" {
				t.Errorf("%s: a refused key says why and stays in the key field: %q", lang, tt.Texts())
			}
			// No gh on the server: what to run there.
			app.nt.login = nil
			app.Receive(protocol.ServerFrame{T: "git_login_state", GitHost: "github.com", State: "no_gh"})
			app.drainNewTask()
			tt.Frame()
			if !tt.HasText(L.T("newtask.gh.nogh", "Hetzner Server")) || !tt.HasText(L.T("newtask.gh.recheck")) {
				t.Errorf("%s: no gh says what to run: %q", lang, tt.Texts())
			}
			newTaskShot(t, tt, "d272-nogh"+sz)
		}
	}
}
