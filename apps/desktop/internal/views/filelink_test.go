package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D356: the live bug. A task on the home (hel) said 「已完成
// review-10419-restart-round59.md。」 with the name a link to its scratch
// path; on the Mac, the hover showed the path and a click did nothing (no
// OnLink: MyGo sent a path with no scheme to a router that has none). Now a
// click asks the home for the file and the viewer opens on the copy it
// keeps; when it can't, the sheet says why in one line.
const linkPath = "/root/.ducter/scratch/swj3zc4w/review-10419-restart-round59.md"

func linkApp(t *testing.T, lang i18n.Lang) (*App, *[]any, *fakeHome) {
	app, sent, h := mediaApp(t, lang)
	app.URL = "ws://hel.example:7777/ws" // the home is another computer
	zh := lang == i18n.ZH
	words := "Done: [review-10419-restart-round59.md](" + linkPath + ")."
	if zh {
		words = "已完成 [review-10419-restart-round59.md](" + linkPath + ")。"
	}
	ts := protocol.TaskStream("swj3zc4w")
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 9*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "swj3zc4w", Title: "Review PR 10419", Harness: "codex", Place: protocol.Place{Kind: "none"}, Brief: "review"}),
		mev(2, time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: words}),
	}})
	return app, sent, h
}

func fileAsks(sent *[]any) []protocol.FileOpenReq {
	var out []protocol.FileOpenReq
	for _, f := range *sent {
		if r, ok := f.(protocol.FileOpenReq); ok {
			out = append(out, r)
		}
	}
	return out
}

func TestFileLinkPath(t *testing.T) {
	for in, want := range map[string]string{
		linkPath:                   linkPath,
		"file://" + linkPath:       linkPath,
		"file:///tmp/a%20b.md#L3":  "/tmp/a b.md",
		"~/notes/x.md":             "~/notes/x.md",
		"https://example.com/a.md": "",
		"mailto:a@b.c":             "",
		"#install":                 "",
		"review.md":                "",
		"//cdn.example.com/x.js":   "",
		"/":                        "",
	} {
		if got := protocol.FileLinkPath(in); got != want {
			t.Errorf("FileLinkPath(%q) = %q, want %q", in, got, want)
		}
	}
	if n := protocol.FileLinkName(linkPath); n != "review-10419-restart-round59.md" {
		t.Errorf("name: %q", n)
	}
}

func TestFileLink(t *testing.T) {
	app, sent, h := linkApp(t, i18n.ZH)
	tt := mediaTester(app, 1100, 860)
	click(t, tt, "review-10419-restart-round59.md")
	asks := fileAsks(sent)
	if len(asks) != 1 || asks[0].Path != linkPath || asks[0].T != "file_open" {
		t.Fatalf("the click asked the home for %+v", asks)
	}
	if fv := app.fileView; fv == nil || fv.link != linkPath {
		t.Fatalf("no sheet while it comes: %+v", app.fileView)
	}
	if got := texts(tt); !strings.Contains(got, "正在打开…") || !strings.Contains(got, linkPath) {
		t.Errorf("the sheet while it comes: %s", got)
	}
	// The home answers with its copy: the viewer reads it, laid out.
	ref := h.fileRef([]byte(reportMD(true)), "text/markdown", "review-10419-restart-round59.md")
	app.Receive(protocol.ServerFrame{T: "file_open", ID: asks[0].ID, OK: true, File: &ref})
	tt.Frame()
	tt.Frame()
	if fv := app.fileView; fv == nil || fv.link != "" || fv.ref.ID != ref.ID {
		t.Fatalf("the viewer didn't open on the home's copy: %+v", app.fileView)
	}
	if got := texts(tt); !strings.Contains(got, "调查：点开文件为什么会打开 hel 上的链接") || !strings.Contains(got, "存一份") {
		t.Errorf("the file: %s", got)
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.fileView != nil {
		t.Errorf("Esc didn't close it")
	}

	// Refused: the one line why, Esc goes back.
	click(t, tt, "review-10419-restart-round59.md")
	asks = fileAsks(sent)
	app.Receive(protocol.ServerFrame{T: "file_open", ID: asks[len(asks)-1].ID, WbError: "outside"})
	tt.Frame()
	if got := texts(tt); !strings.Contains(got, "这个文件不在任何一件事自己的文件夹里，Ducter 不会打开它。") {
		t.Errorf("outside: %s", got)
	}
	// A late answer to an older ask never replaces it.
	app.Receive(protocol.ServerFrame{T: "file_open", ID: asks[0].ID, OK: true, File: &ref})
	if app.fileView == nil || app.fileView.link == "" {
		t.Errorf("an old answer opened the file")
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.fileView != nil {
		t.Errorf("Esc didn't close the refusal")
	}
	// Unreachable: Retry asks again.
	click(t, tt, "review-10419-restart-round59.md")
	asks = fileAsks(sent)
	app.Receive(protocol.ServerFrame{T: "file_open", ID: asks[len(asks)-1].ID, WbError: "offline"})
	tt.Frame()
	click(t, tt, "重试")
	if n := len(fileAsks(sent)); n != len(asks)+1 {
		t.Errorf("Retry: %d asks, want %d", n, len(asks)+1)
	}
}

// On this Mac with the Ducter here, a link to a file here opens as a file
// link always has, never through the home.
func TestFileLinkHere(t *testing.T) {
	app, sent, _ := mediaApp(t, i18n.EN)
	app.URL = ""
	f := filepath.Join(t.TempDir(), "notes.md")
	os.WriteFile(f, []byte("# here"), 0o600)
	var opened []string
	app.OpenExternal = func(u string) error { opened = append(opened, u); return nil }
	app.mdLink(func() string { return "" })(f)
	if len(fileAsks(sent)) != 0 || app.fileView != nil || len(opened) != 1 || opened[0] != "file://"+f {
		t.Errorf("a local file: asks %d, viewer %v, opened %q", len(fileAsks(sent)), app.fileView != nil, opened)
	}
	// Not here (gone, or the home's path): the viewer asks the home.
	app.mdLink(func() string { return "t1" })("/srv/ducter/scratch/t1/out.md")
	if a := fileAsks(sent); len(a) != 1 || a[0].TaskID != "t1" {
		t.Errorf("a path not on this Mac: %+v", a)
	}
}

// Shots (D75: outside git):
//
//	DUCTER_FILELINK_SHOTS=../../../../.shots/file-link go test ./internal/views -run FileLinkShots
func TestFileLinkShots(t *testing.T) {
	dir := os.Getenv("DUCTER_FILELINK_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_FILELINK_SHOTS not set")
	}
	os.MkdirAll(dir, 0o755)
	t.Setenv("DUCTER_MEDIA_SHOTS", dir) // the tester at 2x
	shot := func(tt *ui.Tester, name string) {
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		png.Encode(f, tt.Image())
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		l := string(lang)
		app, sent, h := linkApp(t, lang)
		tt := mediaTester(app, 1100, 860)
		shot(tt, "mac-"+l+"-0-link")
		click(t, tt, "review-10419-restart-round59.md")
		shot(tt, "mac-"+l+"-1-opening")
		asks := fileAsks(sent)
		ref := h.fileRef([]byte(reportMD(lang == i18n.ZH)), "text/markdown", "review-10419-restart-round59.md")
		app.Receive(protocol.ServerFrame{T: "file_open", ID: asks[len(asks)-1].ID, OK: true, File: &ref})
		tt.Frame()
		tt.Frame()
		shot(tt, "mac-"+l+"-2-opened")
		app.fileView.open = false
		tt.Frame()
		for _, why := range []string{"missing", "outside", "too_big", "offline"} {
			click(t, tt, "review-10419-restart-round59.md")
			asks = fileAsks(sent)
			app.Receive(protocol.ServerFrame{T: "file_open", ID: asks[len(asks)-1].ID, WbError: why})
			tt.Frame()
			shot(tt, "mac-"+l+"-3-"+why)
			app.fileView.open = false
			tt.Frame()
		}
	}
}
