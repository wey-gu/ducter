package views

import (
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D611: the Ducter folder's rule row in Settings › Where it runs (and on every computer's card):
// the real path in mono, the row itself the button; macOS's ~/Ducter one tap; a picker here, a
// path field elsewhere; DUCTER_FOLDER read-only; a move with tasks running lists their titles and
// waits; done, one plain line. Layout at 1150 with a real long path: nothing runs past the edge.
func TestD611FolderRow(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		L := app.L
		app.URL = ""
		app.ThisComputer = "MacBook"
		app.Pair = func(string, string) error { return nil }
		app.PickFolder = func(string, string) (string, error) { return "/Users/someone/Ducter", nil }
		world := protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
			ID: "local", Name: "MacBook", Computer: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Platform: "darwin-arm64",
			Folder: &protocol.DeviceFolder{Path: "/Users/someone/ducter", Why: "default"},
		}}}
		app.Receive(world)
		app.openTab(TabRun)
		tt.SetSize(1150, 900)
		tt.Frame()
		for _, want := range []string{L.T("settings.folder.row"), "~/ducter"} {
			if !hasText(tt, want) {
				t.Errorf("%s: no %q in the row: %q", lang, want, tt.Texts())
			}
		}
		st := app.folderState("local")
		st.open = true
		tt.Frame()
		for _, want := range []string{L.T("settings.folder.toMac"), L.T("settings.folder.choose"), L.T("settings.folder.show"), L.T("settings.folder.move")} {
			if !hasText(tt, want) {
				t.Errorf("%s: the open row has no %q: %q", lang, want, tt.Texts())
			}
		}

		// D289/D296: 改成 ~/Ducter asks in place first, then sends it.
		if err := tt.Click(L.T("settings.folder.toMac")); err != nil {
			t.Fatalf("%v in %q", err, tt.Texts())
		}
		tt.Frame()
		saidShot(t, tt, "folder-ask-"+string(lang))
		if !hasText(tt, L.T("settings.folder.toMac.ask")) {
			t.Errorf("%s: the ~/Ducter move doesn't ask: %q", lang, tt.Texts())
		}
		if _, ok := lastFrame[protocol.FolderChangeReq](sent); ok {
			t.Fatalf("%s: the move went before it was confirmed", lang)
		}
		if err := tt.Click(L.T("settings.folder.toMac.go")); err != nil {
			t.Fatalf("%v in %q", err, tt.Texts())
		}
		req, ok := lastFrame[protocol.FolderChangeReq](sent)
		if !ok || req.Path != "~/Ducter" || req.Device != "" {
			t.Fatalf("%s: folder_change %+v", lang, req)
		}
		tt.Frame()
		if !hasText(tt, L.T("settings.folder.moving")) {
			t.Errorf("%s: the row doesn't say it is moving: %q", lang, tt.Texts())
		}

		// A task still working there: its title, and the wait.
		app.Receive(protocol.ServerFrame{T: "folder_change_result", OK: false, ClientID: req.ClientID, Reason: "tasks_running", FolderTasks: []protocol.FolderTask{{TaskID: "t1", Title: "Fix the flaky test"}}})
		tt.Frame()
		for _, want := range []string{"Fix the flaky test", L.T("settings.folder.wait")} {
			if !hasText(tt, want) {
				t.Errorf("%s: the refusal has no %q: %q", lang, want, tt.Texts())
			}
		}

		// Done: one plain line with what went with it.
		app.folderMove("local", "~/Ducter")
		req, _ = lastFrame[protocol.FolderChangeReq](sent)
		app.Receive(protocol.ServerFrame{T: "folder_change_result", OK: true, ClientID: req.ClientID, Folder: &protocol.DeviceFolder{Path: "/Users/someone/Ducter", Why: "chosen"}, Path: "/Users/someone/Ducter", Projects: 3, Worktrees: 5})
		tt.Frame()
		if !hasText(tt, L.T("settings.folder.done", "~/Ducter", 3, 5)) {
			t.Errorf("%s: no done line: %q", lang, tt.Texts())
		}
		// D296: the partner's word is the consequence, said on the home's own answer.
		if w := app.settings.said["folder:local"].text; w != L.T("said.folder.moved", "~/Ducter") {
			t.Errorf("%s: the move's word is %q, want %q", lang, w, L.T("said.folder.moved", "~/Ducter"))
		}
		saidShot(t, tt, "folder-said-"+string(lang))
		if !hasText(tt, L.T("said.folder.moved", "~/Ducter")) {
			t.Errorf("%s: the move's word isn't drawn: %q", lang, tt.Texts())
		}

		// A real long path, still inside the window at 1150.
		long := "/Users/someone/Projects/This Is A Very Long Folder Name/Ducter"
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
			ID: "local", Name: "MacBook", Computer: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Platform: "darwin-arm64",
			Folder: &protocol.DeviceFolder{Path: long, Why: "chosen"},
		}}})
		app.folderState("local").open = false
		tt.SetSize(1150, 900)
		tt.Frame()
		found := false
		for _, ai := range tt.AccessAll() {
			if strings.Contains(ai.Name, L.T("settings.folder.row")) || strings.Contains(ai.Name, "ducter") {
				if ai.Bounds.W > 0 && (ai.Bounds.X < -1 || ai.Bounds.X+ai.Bounds.W > 1151) {
					t.Errorf("%s: the folder row runs past 1150: %+v", lang, ai.Bounds)
				}
				found = true
			}
		}
		if !found {
			t.Errorf("%s: the long path's row is not in the tree", lang)
		}
	}

	// DUCTER_FOLDER: the row says so and never opens its editor.
	app, _, tt := newTaskApp(t, i18n.ZH)
	app.URL = ""
	app.Pair = func(string, string) error { return nil }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
		ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake,
		Folder: &protocol.DeviceFolder{Path: "/Users/someone/EnvDucter", Why: "env"},
	}}})
	app.openTab(TabRun)
	tt.Frame()
	if !hasText(tt, app.L.T("settings.folder.env")) {
		t.Fatalf("the env row doesn't say so: %q", tt.Texts())
	}
	app.folderState("local").open = true
	tt.Frame()
	if hasText(tt, app.L.T("settings.folder.toMac")) || hasText(tt, app.L.T("settings.folder.move")) {
		t.Errorf("the env row opened its editor: %q", tt.Texts())
	}
}
