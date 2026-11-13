package views

import (
	"fmt"
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

// The files of apps/web/demo-file.ts: a task looked into why a file card
// opened a link on the home, and showed its investigation, its eval, the
// fix and a PDF.
func reportMD(zh bool) string {
	s := `# Investigation: why opening a file opened a link on hel

**In short:** the Mac's file card handed Open to the default browser with the file's address on the home (hel), carrying that file's key. The browser showed the raw text, and the address stayed in its history.

## What happened

1. The task finished and handed ''investigation.md'' to the home.
2. **Open** on the card called ''OpenURL(home + "/media/<id>?k=<key>&dl=1")''.
3. The browser opened hel's address.

| Where | What opened | What it carried |
|---|---|---|
| Mac | the default browser, hel's address | the file's key |
| Phone web | a new tab | the file's key |
| Device token | not carried | — |

> The key fetches only this one file, but it never expires, and a synced browser history shows it on other devices too.

## The fix

- [x] Files open inside Ducter: Markdown laid out, code with its colours and line numbers
- [x] **Save a copy** goes through this device, never to hel's address
- [ ] PDF pages drawn inside Ducter (later)

'''ts
// before
a.Media.OpenURL(a.Media.Home().URL(ref.Path() + "&dl=1"))
// after
a.OpenFile(ref, card)
'''
`
	if zh {
		s = `# 调查：点开文件为什么会打开 hel 上的链接

**结论：** Mac 上的文件卡片把「打开」交给了默认浏览器，地址是家里那台主机（hel）上的文件地址，带着这个文件的钥匙。浏览器里看到的是一页没排版的原文，地址还留在了浏览记录里。

## 发生了什么

1. 任务做完，把 ''investigation.md'' 交给了家里的主机。
2. 卡片上的 **打开** 调用 ''OpenURL(home + "/media/<id>?k=<钥匙>&dl=1")''。
3. 浏览器打开了 hel 的地址。

| 地方 | 打开的是 | 带着什么 |
|---|---|---|
| Mac | 默认浏览器，hel 的地址 | 这个文件的钥匙 |
| 手机网页 | 新标签页 | 这个文件的钥匙 |
| 设备令牌 | 没有带 | — |

> 钥匙只能取这一个文件，但它不会过期；浏览器同步了历史，别的设备上也能看到。

## 怎么改

- [x] 文件在 Ducter 里打开：Markdown 排好版，代码带颜色和行号
- [x] **存一份** 走这台设备自己，不再去 hel 的地址
- [ ] PDF 的页面在 Ducter 里画出来（以后）

'''ts
// 以前
a.Media.OpenURL(a.Media.Home().URL(ref.Path() + "&dl=1"))
// 现在
a.OpenFile(ref, card)
'''
`
	}
	return strings.NewReplacer("'''", "```", "''", "`").Replace(s)
}

const evalCSV = `scenario,model,turns,result,cost_usd
reply-older-result,haiku,3,pass,0.012
reply-two-at-once,haiku,4,pass,0.015
reply-find,haiku,2,pass,0.009
reply-out-of-window,haiku,3,pass,0.011
reply-open-question,haiku,2,pass,0.008
open-file-in-ducter,haiku,2,pass,0.007
"save a copy, not a link",haiku,3,fail,0.013
`

const fixGo = "package views\n\n// fileCard is a file a task showed: one line with its kind, name, size and\n// Open. D239: Open reads it inside Ducter, growing out of the card.\nfunc (a *App) fileCard(c *ui.Context, ref *protocol.MediaRef) {\n\tt := a.T\n\tname := firstNonEmpty(ref.Name, a.L.T(\"media.file\"))\n\tcard := ui.Row(c.Key(\"file:\" + ref.ID)).Gap(t.S3).AlignItems(ui.Center)\n\tif card.Clicked() {\n\t\ta.OpenFile(*ref, card.Bounds())\n\t}\n}\n"

// fileRef keeps a file on the fake home as a task's report would.
func (h *fakeHome) fileRef(b []byte, typ, name string) protocol.MediaRef {
	h.mu.Lock()
	defer h.mu.Unlock()
	r := h.put(b, "", name)
	r.Type, r.W, r.H, r.From = typ, 0, 0, &protocol.MediaFrom{TaskID: "t_file"}
	return r
}

// fileApp is the conversation where the task's files came back.
func fileApp(t *testing.T, lang i18n.Lang) (*App, *fakeHome, []protocol.MediaRef) {
	app, _, h := mediaApp(t, lang)
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	refs := []protocol.MediaRef{
		h.fileRef([]byte(reportMD(zh)), "text/markdown", "investigation.md"),
		h.fileRef([]byte(evalCSV), "text/csv", pick("评测结果.csv", "eval-results.csv")),
		h.fileRef([]byte(fixGo), "text/plain", "media.go"),
		h.fileRef(researchPDFTimes(3), "application/pdf", pick("Ducter 文件查看器调研.pdf", "Ducter file viewer research.pdf")),
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 5*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pick("为什么我点开一个文件，打开的居然是 hel 上的链接？查一下", "Why did opening a file open a link on hel? Look into it")}),
		mev(2, 5*time.Minute, protocol.TaskStream("t_file"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_file", Title: pick("点开文件为什么去了 hel", "Why a file opened on hel"), Harness: "claude-code", Place: protocol.Place{Kind: "none"}}),
		mev(3, time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: pick("查清楚了：卡片把文件交给了浏览器，打开的是 hel 上带钥匙的地址。经过写在调查里，另附评测和改法。", "Found it: the card handed the file to the browser, at hel's address with its key. The investigation has the story, with the eval and the fix."), Media: refs}),
	}})
	return app, h, refs
}

// A file opens inside Ducter: the card never sends the person to the home's
// address; the report is laid out; Save a copy keeps the whole file; a kind
// the Mac can't show opens from a copy on this Mac.
func TestFileViewer(t *testing.T) {
	app, h, refs := fileApp(t, i18n.ZH)
	tt := mediaTester(app, 1100, 900)
	click(t, tt, "打开 investigation.md")
	if app.fileView == nil || app.fileView.ref.ID != refs[0].ID {
		t.Fatalf("the card didn't open the viewer: %+v", app.fileView)
	}
	tt.Frame()
	got := texts(tt)
	for _, want := range []string{"investigation.md", "调查：点开文件为什么会打开 hel 上的链接", "存一份", "拷贝", "看原文", "来自「点开文件为什么去了 hel」"} {
		if !strings.Contains(got, want) {
			t.Errorf("the viewer lacks %q:\n%s", want, got)
		}
	}
	click(t, tt, "存一份")
	if len(h.saved) != 1 || h.saved[0] != "investigation.md" {
		t.Errorf("Save a copy: %q", h.saved)
	}
	app.fileView.open = false
	tt.Frame()
	if app.fileView != nil {
		t.Errorf("the viewer didn't close")
	}
	// D242: a PDF's pages drawn here, the count in the head.
	app.OpenFile(refs[3], ui.Rect{})
	for i := 0; i < 6; i++ {
		tt.Advance(50 * time.Millisecond)
		tt.Frame()
	}
	if fv := app.fileView; fv.pdf == nil || fv.pdf.Pages() < 2 || len(fv.pages) == 0 {
		t.Fatalf("the PDF wasn't drawn: %+v", fv)
	}
	if got := texts(tt); !strings.Contains(got, "PDF · ") || !strings.Contains(got, " 页") {
		t.Errorf("a PDF's head: %s", got)
	}
	app.fileView.open = false
	tt.Frame()
	// A PDF this Mac can't draw: said plainly, opened on this Mac from a copy.
	broken := h.fileRef([]byte("%PDF-1.7\n"+strings.Repeat("x", 4000)), "application/pdf", "broken.pdf")
	app.OpenFile(broken, ui.Rect{})
	tt.Frame()
	tt.Frame()
	if !strings.Contains(texts(tt), "这个 PDF 在这里画不出来") {
		t.Errorf("a broken PDF: %s", texts(tt))
	}
	click(t, tt, "在 Mac 上打开")
	if len(h.opened) != 1 || !strings.HasSuffix(h.opened[0], ".pdf") {
		t.Errorf("Open on this Mac: %q", h.opened)
	}
	app.fileView.open = false
	tt.Frame()
	// D242: ⌘F finds in a text: every match marked, the current one in the
	// accent; Esc closes the find field, not the file. No line is "current"
	// in a read-only view.
	app.OpenFile(refs[2], ui.Rect{})
	tt.Frame()
	fv := app.fileView
	if fv.st == nil || !fv.st.NoActiveLine {
		t.Errorf("the read-only code view highlights a current line")
	}
	app.openFind(fv)
	fv.query = "ref"
	tt.Frame()
	tt.Frame()
	if len(fv.hits) < 4 || len(fv.st.TextBackgrounds) != len(fv.hits) || fv.st.TextBackgrounds[0].Color != app.T.Accent {
		t.Fatalf("find: %d hits, %d marks", len(fv.hits), len(fv.st.TextBackgrounds))
	}
	if got := texts(tt); !strings.Contains(got, fmt.Sprintf("1 / %d", len(fv.hits))) {
		t.Errorf("find's count: %s", got)
	}
	app.findStep(fv, 1)
	tt.Frame()
	if fv.st.TextBackgrounds[1].Color != app.T.Accent || !strings.EqualFold(fv.st.SelectedText(), "ref") {
		t.Errorf("next: %+v %q", fv.st.TextBackgrounds[:2], fv.st.SelectedText())
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if app.fileView == nil || fv.finding {
		t.Errorf("Esc: viewer %v, finding %v", app.fileView != nil, fv.finding)
	}
	app.fileView.open = false
	tt.Frame()
	// A report's code block says Ducter's 拷贝, not MyGo's Copy.
	app.OpenFile(refs[0], ui.Rect{})
	tt.Frame()
	tt.Frame()
	if got := texts(tt); strings.Contains(got, "Copy") || strings.Count(got, "拷贝") < 2 {
		t.Errorf("the code block's copy: %s", got)
	}
	app.fileView.open = false
	tt.Frame()
	// A long text is read in part, cut at a whole line, and says so.
	long := strings.Repeat("一行日志 line of the log\n", 60_000)
	big := h.fileRef([]byte(long), "text/plain", "run.log")
	app.OpenFile(big, ui.Rect{})
	if fv := app.fileView; !fv.cut || len(fv.text) > protocol.FileViewBytes || strings.HasSuffix(fv.text, "\n") {
		t.Errorf("the long file: cut %v, %d bytes", fv.cut, len(fv.text))
	}
	if md, more := tableMarkdown(evalCSV, "eval.csv"); more || !strings.Contains(md, "|---|---|---:|---|---:|") || !strings.Contains(md, "| save a copy, not a link |") {
		t.Errorf("the table:\n%s", md)
	}
}

// Shots (D75: outside git):
//
//	DUCTER_MEDIA_SHOTS=../../../../.shots/file-viewer go test ./internal/views -run FileViewerShots
func TestFileViewerShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEDIA_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEDIA_SHOTS not set")
	}
	os.MkdirAll(dir, 0o755)
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
		app, _, refs := fileApp(t, lang)
		tt := mediaTester(app, 1100, 860)
		shot(tt, "mac-"+l+"-0-cards")
		for i, name := range []string{"1-markdown", "2-table", "3-code", "4-pdf-opening"} {
			app.OpenFile(refs[i], ui.Rect{})
			tt.Frame()
			tt.Frame()
			shot(tt, "mac-"+l+"-"+name)
			fv := app.fileView
			switch i {
			case 0:
				fv.source = true
				tt.Frame()
				shot(tt, "mac-"+l+"-1b-markdown-source")
				fv.source = false
				// D242: find in a report: found in its text.
				app.openFind(fv)
				fv.query = map[string]string{"zh": "钥匙", "en": "key"}[l]
				tt.Frame()
				app.findStep(fv, 1)
				tt.Frame()
				shot(tt, "mac-"+l+"-1c-markdown-find")
			case 2:
				app.openFind(fv)
				fv.query = "ref"
				tt.Frame()
				app.findStep(fv, 2)
				tt.Frame()
				shot(tt, "mac-"+l+"-3b-code-find")
				fv.query = "zzz"
				tt.Frame()
				shot(tt, "mac-"+l+"-3c-code-find-none")
			case 3:
				// The pages come as they're drawn; scrolled down, the first ones go.
				for k := 0; k < 8; k++ {
					tt.Advance(100 * time.Millisecond)
					tt.Frame()
				}
				shot(tt, "mac-"+l+"-4-pdf")
			}
			fv.closeFile()
			app.fileView = nil
			tt.Frame()
		}
		// The narrow window.
		tt.SetSize(720, 760)
		app.OpenFile(refs[3], ui.Rect{})
		for k := 0; k < 8; k++ {
			tt.Advance(100 * time.Millisecond)
			tt.Frame()
		}
		shot(tt, "mac-"+l+"-4b-pdf-narrow")
		app.fileView.closeFile()
		app.fileView = nil
		tt.SetSize(1100, 860)
		tt.Frame()
	}
}
