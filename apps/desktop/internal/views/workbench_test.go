package views

import (
	"encoding/json"
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

// D214: the workbench on the Mac: hidden until 工作台 / Workbench (or ⌥⌘B);
// its pages from the home's `wb` answers: the changes with a file's diff,
// the files with a file in the editor, saved over the version opened (a
// conflict asks), the pages it serves.
func benchFixture(t *testing.T, lang i18n.Lang) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	f := &ascFixture{app: app}
	id, ts := "t_tea", protocol.TaskStream("t_tea")
	m := time.Minute
	place := protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/tea", Worktree: "/Users/someone/dev/tea", Branch: "ducter/oolong", BaseBranch: "main"}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		f.at(9*m, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: "Add Oolong to the tea timer", Harness: "claude-code", Model: "haiku", Place: place, Brief: "Add an Oolong tea (180 s) and a footer."}),
		f.at(8*m, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: "Adding Oolong and the footer; the dev server is at http://localhost:3000/."}),
		f.at(7*m, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
	}})
	app.OpenTask(id)
	tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt, sent
}

// answer replies to every wb request sent since the last call.
func answerBench(app *App, sent *[]any, reply func(r protocol.WbRequest) (protocol.WbAnswer, string)) {
	reqs := *sent
	*sent = nil
	for _, s := range reqs {
		r, ok := s.(protocol.WbReq)
		if !ok {
			continue
		}
		ans, refusal := reply(r.Req)
		if refusal != "" {
			app.Receive(protocol.ServerFrame{T: "wb", ID: r.ID, TaskID: r.TaskID, WbError: refusal})
			continue
		}
		a := ans
		app.Receive(protocol.ServerFrame{T: "wb", ID: r.ID, TaskID: r.TaskID, OK: true, Answer: &a})
	}
}

const teaPatch = "diff --git a/main.ts b/main.ts\n--- a/main.ts\n+++ b/main.ts\n@@ -1,4 +1,5 @@\n const teas = [\n   { name: \"Green\", seconds: 120 },\n   { name: \"Black\", seconds: 240 },\n+  { name: \"Oolong\", seconds: 180 },\n ];\n"

func TestWorkbench(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt, sent := benchFixture(t, lang)
		L := i18n.New(lang)
		text := "const teas = [\n  { name: \"Oolong\", seconds: 180 },\n];\n"
		version := "v1"
		reply := func(r protocol.WbRequest) (protocol.WbAnswer, string) {
			switch r.Op {
			case "ports":
				return protocol.WbAnswer{Op: "ports", Ports: []protocol.WbPort{{Port: 3000, Via: "listening", Title: "Tea timer"}}}, ""
			case "changes":
				return protocol.WbAnswer{Op: "changes", Kind: "repo", Base: "main", Files: []protocol.WbChange{{Path: "index.html", Status: "modified", Adds: 1}, {Path: "main.ts", Status: "modified", Adds: 1}, {Path: "style.css", Status: "modified", Adds: 5}}}, ""
			case "files":
				if r.Path == "" {
					return protocol.WbAnswer{Op: "files", Entries: []protocol.WbEntry{{Name: "src", Kind: "d"}, {Name: "index.html", Kind: "f"}, {Name: "main.ts", Kind: "f"}}}, ""
				}
				return protocol.WbAnswer{Op: "files", Path: r.Path}, ""
			case "diff":
				return protocol.WbAnswer{Op: "diff", Path: r.Path, Patch: teaPatch}, ""
			case "read":
				tx := text
				return protocol.WbAnswer{Op: "read", Path: r.Path, Version: version, Text: &tx}, ""
			case "write":
				if r.Base != version {
					return protocol.WbAnswer{}, "conflict"
				}
				version = "v2"
				return protocol.WbAnswer{Op: "write", Path: r.Path, Version: version}, ""
			}
			return protocol.WbAnswer{}, "unsupported"
		}
		// Hidden by default: the button only.
		if all := texts(tt); strings.Contains(all, L.T("wb.tab.changes")+"  3") {
			t.Fatalf("%s: the workbench shows before it is asked for", lang)
		}
		if err := tt.Click(L.T("wb.toggle")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		answerBench(app, sent, reply)
		tt.Frame()
		tt.Frame()
		answerBench(app, sent, reply)
		tt.Frame()
		all := texts(tt)
		for _, w := range []string{L.T("wb.tab.files"), L.T("wb.tab.preview"), "main.ts", "style.css", L.T("wb.changes.base", "main")} {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q in the workbench: %q", lang, w, all)
			}
		}
		benchShot(t, tt, "mac-"+string(lang)+"-1-changes")
		if err := tt.Click("main.ts"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		answerBench(app, sent, reply)
		tt.Frame()
		tt.Frame()
		if all := texts(tt); !strings.Contains(all, "Oolong") {
			t.Errorf("%s: the diff didn't open: %q", lang, all)
		}
		benchShot(t, tt, "mac-"+string(lang)+"-2-diff")
		// Files: the tree, then a file in the editor; a save over a moved-on version asks.
		if err := tt.Click(L.T("wb.tab.files")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		answerBench(app, sent, reply)
		tt.Frame()
		if err := tt.Click("main.ts"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		answerBench(app, sent, reply)
		tt.Frame()
		tt.Frame()
		f := app.benchOf("t_tea").file
		if f == nil || f.st == nil {
			t.Fatalf("%s: the file didn't open", lang)
		}
		benchShot(t, tt, "mac-"+string(lang)+"-3-file")
		f.st.Buffer.Set(text + "// mine\n")
		version = "agent-wrote"
		app.benchSave("t_tea", f, false)
		answerBench(app, sent, reply)
		tt.Frame()
		if !f.conflict {
			t.Errorf("%s: a save over a moved-on file didn't ask", lang)
		}
		if all := texts(tt); !strings.Contains(all, L.T("wb.conflict")) {
			t.Errorf("%s: no conflict line: %q", lang, all)
		}
		// Keep mine: read again, then write over what it is now.
		app.benchSave("t_tea", f, true)
		answerBench(app, sent, reply)
		answerBench(app, sent, reply)
		if f.conflict || f.st.Buffer.Modified() {
			t.Errorf("%s: Keep mine didn't save", lang)
		}
		// Preview: the page, and its address from the home's host.
		app.URL = "ws://hel.example:7777/ws"
		if u := app.previewURL(&protocol.WbAnswer{PreviewPort: 40123, Token: "tk"}); u != "http://hel.example:40123/__ducter/enter/tk?to=/" {
			t.Errorf("preview url %q", u)
		}
		app.URL = ""
		tt.Frame()
		if err := tt.Click(L.T("wb.tab.preview")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		answerBench(app, sent, reply)
		tt.Frame()
		if all := texts(tt); !strings.Contains(all, "Tea timer") {
			t.Errorf("%s: no page in Preview: %q", lang, all)
		}
		benchShot(t, tt, "mac-"+string(lang)+"-4-preview")
	}
}

func TestWbFrameDecodes(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"wb","id":"wbm1","taskId":"t1","ok":true,"answer":{"op":"read","path":"a.ts","size":3,"version":"x","text":"abc"}}`))
	if err != nil || f.Answer == nil || f.Answer.Text == nil || *f.Answer.Text != "abc" || f.ID != "wbm1" {
		t.Fatalf("%v %+v", err, f)
	}
	f, _ = protocol.DecodeServerFrame([]byte(`{"t":"wb","id":"wbm2","taskId":"t1","ok":false,"error":"conflict"}`))
	if f.WbError != "conflict" || f.OK {
		t.Fatalf("%+v", f)
	}
	b, _ := json.Marshal(protocol.WbReq{T: "wb", ID: "1", TaskID: "t", Req: protocol.WbRequest{Op: "write", Path: "a", Text: "", Base: "v"}})
	if !strings.Contains(string(b), `"req":{"op":"write","path":"a","base":"v"}`) {
		t.Fatalf("%s", b)
	}
}

// benchShot writes a screenshot when DUCTER_BENCH_SHOTS names a folder.
func benchShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("DUCTER_BENCH_SHOTS")
	if dir == "" {
		return
	}
	tt.Advance(time.Second)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	fh, err := os.Create(filepath.Join(dir, name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer fh.Close()
	if err := png.Encode(fh, tt.Image()); err != nil {
		t.Fatal(err)
	}
}
