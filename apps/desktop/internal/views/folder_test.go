package views

import (
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

// D142: a task sorted a folder of invoices (not a repo) into month folders.
// Its Changes say so in one sentence, until when it can be undone, and offer
// 改回去 / Undo all changes and 就这样 / Keep the changes; the list opens on
// request; an undo of a folder changed since asks in place.
func folderTask(t *testing.T, lang i18n.Lang) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	f := &ascFixture{app: app}
	id, ts := "t_inv", protocol.TaskStream("t_inv")
	m := time.Minute
	until := time.Date(2026, 11, 16, 10, 0, 0, 0, time.Local).UTC().Format(time.RFC3339)
	sum := protocol.FolderSummary{Moved: 42, Renamed: 3, Folders: 6, Undo: "open", UndoUntil: until}
	place := protocol.Place{Kind: "folder", Device: "local", Path: "/Users/someone/Documents/发票"}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		f.at(20*m, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: w("把发票按月份整理好", "Sort my invoices by month"), Harness: "claude-code", Model: "haiku", Place: place,
			Brief: w("把「发票」文件夹里的 PDF 按开票月份放进各自的文件夹，文件名统一成 年-月-商家。", "Put the PDFs in the Invoices folder into one folder per month, and name them year-month-vendor.")}),
		f.at(19*m, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: w("一共 42 张发票，跨 6 个月。按开票日期建文件夹，再挪进去。", "42 invoices across 6 months. Making a folder per month by the invoice date, then moving them in.")}),
		f.at(12*m, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done",
			Summary:  w("整理好了：42 张发票按月份放进了 6 个文件夹，3 个文件名改成了 年-月-商家。", "Done: 42 invoices are in 6 month folders, and 3 names now read year-month-vendor."),
			Evidence: []protocol.EvidenceRef{{Kind: "file", Label: w("6 个月份文件夹", "6 month folders"), Ref: "2026-06"}}, Folder: &sum}),
		f.at(12*m, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
	}})
	files := []protocol.FolderChange{
		{Kind: "added", Path: "2026-06", Dir: true}, {Kind: "added", Path: "2026-07", Dir: true},
		{Kind: "moved", From: "滴滴出行-0612.pdf", Path: "2026-06/2026-06-滴滴出行.pdf"},
		{Kind: "moved", From: "invoice_7781.pdf", Path: "2026-07/invoice_7781.pdf"},
		{Kind: "moved", From: "京东 电子发票.pdf", Path: "2026-07/2026-07-京东.pdf"},
	}
	app.Receive(protocol.ServerFrame{T: "folder_changes", TaskID: id, FolderChanges: &protocol.FolderChanges{FolderSummary: sum, Files: files, More: 40}})
	app.OpenTask(id)
	tt := ui.NewTesterWith(app.View, 1280, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt, sent
}

func TestFolderChanges(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt, sent := folderTask(t, lang)
		all := texts(tt)
		want := map[i18n.Lang][]string{
			i18n.ZH: {"改动", "把 42 个文件整理进 6 个新文件夹，改了 3 个文件名", "随时能改回去，留到 11 月 16 日", "改回去", "就这样", "看看改了哪些"},
			i18n.EN: {"Changes", "Moved 42 files into 6 new folders, renamed 3", "You can undo this until Nov 16", "Undo all changes", "Keep the changes", "See what changed"},
		}[lang]
		for _, w := range want {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q in the opened task: %q", lang, w, all)
			}
		}
		// No stray proof count next to the sentence (the report named one file).
		for _, not := range []string{"合并", "Merge", "/Users/someone", "1 个文件有改动", "改了 1 个文件", "1 file changed"} {
			if strings.Contains(all, not) {
				t.Errorf("%s: %q shows for a folder task", lang, not)
			}
		}
		folderShot(t, tt, "desktop-"+string(lang))
		// The list on request.
		if err := tt.Click(map[i18n.Lang]string{i18n.ZH: "看看改了哪些", i18n.EN: "See what changed"}[lang]); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		if all := texts(tt); !strings.Contains(all, "2026-07/2026-07-京东.pdf") {
			t.Errorf("%s: the list didn't open: %q", lang, all)
		}
		folderShot(t, tt, "desktop-list-"+string(lang))
		// Undo all changes sends the action; a folder changed since asks in place.
		*sent = nil
		if err := tt.Click(map[i18n.Lang]string{i18n.ZH: "改回去", i18n.EN: "Undo all changes"}[lang]); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		found := false
		for _, f := range *sent {
			if a, ok := f.(protocol.TaskAction); ok && a.Action == "undo" && !a.Force {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: Undo sent no undo: %+v", lang, *sent)
		}
		app.Receive(protocol.ServerFrame{T: "action_result", TaskID: "t_inv", Action: "undo", OK: false, Message: "1 file was changed", Confirm: &protocol.UndoConfirm{Count: 1, Files: []string{"2026-07/我的备注.txt"}}})
		tt.Frame()
		tt.Frame()
		all = texts(tt)
		if !strings.Contains(all, map[i18n.Lang]string{i18n.ZH: "又有 1 个文件被改过（我的备注.txt）", i18n.EN: "1 file changed after it finished (我的备注.txt)"}[lang]) {
			t.Errorf("%s: no confirm: %q", lang, all)
		}
		folderShot(t, tt, "desktop-confirm-"+string(lang))
	}
}

// folderShot writes a screenshot when DUCTER_FOLDER_SHOTS names a folder.
func folderShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("DUCTER_FOLDER_SHOTS")
	if dir == "" {
		return
	}
	tt.Move(4, 1090)
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
