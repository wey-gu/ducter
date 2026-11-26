package views

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D611 shots: the folder row closed, open, moving, refused with tasks, done, and the env row, at
// 1150, zh and en. DUCTER_FOLDER_SHOTS=<dir> go test ./internal/views -run D611Shots
func TestD611Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_FOLDER_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_FOLDER_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, tt := newTaskApp(t, lang)
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
		writePNG(t, filepath.Join(dir, "folder-"+string(lang)+"-before.png"), tt.Image())
		st := app.folderState("local")
		st.open = true
		tt.Frame()
		writePNG(t, filepath.Join(dir, "folder-"+string(lang)+"-open.png"), tt.Image())
		app.folderMove("local", "~/Ducter")
		tt.Frame()
		writePNG(t, filepath.Join(dir, "folder-"+string(lang)+"-moving.png"), tt.Image())
		st.busy, st.cid = false, ""
		st.tasks = []protocol.FolderTask{{TaskID: "t1", Title: "Fix the flaky compaction test"}}
		tt.Frame()
		writePNG(t, filepath.Join(dir, "folder-"+string(lang)+"-tasks.png"), tt.Image())
		st.tasks = nil
		st.open = false
		st.done = app.L.T("settings.folder.done", "~/Ducter", 3, 5)
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
			ID: "local", Name: "MacBook", Computer: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake,
			Folder: &protocol.DeviceFolder{Path: "/Users/someone/Ducter", Why: "chosen"},
		}}})
		tt.Frame()
		writePNG(t, filepath.Join(dir, "folder-"+string(lang)+"-done.png"), tt.Image())
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
			ID: "local", Name: "MacBook", Computer: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake,
			Folder: &protocol.DeviceFolder{Path: "/Users/someone/EnvDucter", Why: "env"},
		}}})
		st.done = ""
		tt.Frame()
		writePNG(t, filepath.Join(dir, "folder-"+string(lang)+"-env.png"), tt.Image())
	}
}
