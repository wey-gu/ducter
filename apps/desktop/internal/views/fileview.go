package views

// D239: a file a task showed opens inside Ducter, as on the phone and the
// web (apps/web/src/fileview.tsx). A tap on its card grows a sheet of the
// theme's paper out of the card (a fade when the Mac asks for less motion)
// and the file is read in the view that suits it: a Markdown report laid
// out as a document, a table file as a table, text and source in the
// editor with its colours and line numbers (read only); a kind the Mac
// can't draw here (a PDF, a deck, a video) says so plainly and opens in
// its Mac app from a copy on this Mac. The bytes come through this app's
// own fetch from the home (the first FileViewBytes of a text, cut at a
// whole line), never by sending the person to the home's address. Save a
// copy keeps the whole file in Downloads; Copy copies its text; 来自
// {task} goes to the task; Esc, × or a click outside closes it.
//
// D242: a PDF's pages are drawn by the Mac itself (Core Graphics, in
// internal/media), each as it comes near the screen and let go once well
// away from it. ⌘F finds in a text or a file's source: a field in the
// head, every match marked, the current one selected and scrolled to;
// for a report or a table it finds in the file's text (MyGo's Markdown
// view has no ranges to mark yet), and closing it lays the file out again.

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/editor"
	"github.com/egoist/mygo/ui/markdown"
	"github.com/egoist/mygo/ui/markdown/parser"

	"github.com/wey-gu/ducter/apps/desktop/internal/media"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// fileViewState is the file viewer while open.
type fileViewState struct {
	open bool
	ref  protocol.MediaRef
	// office (D439): the Office file whose pages (its PDF) ref is: Save a
	// copy keeps it, Save the PDF keeps ref.
	office  *protocol.MediaRef
	from    ui.Rect // the card it grew out of (empty: no card on screen)
	loading bool
	failed  bool
	text    string
	cut     bool
	source  bool // a Markdown or table file shown as its text
	st      *editor.State
	more    bool // the table has more rows than it shows
	md      *markdown.Options
	n       int // which load is current (a Retry starts another)

	// D567: wide content. fill: the sheet takes the window. A report's
	// tables: their places as they scroll, its measure and the sheet's
	// whole width (the last frame's), the options a cell's words are drawn
	// with. A table file: its rows, its columns' widths, which hold
	// numbers, whether the first names the rows, where it is scrolled.
	fill                bool
	tables              map[int]*wideTableState
	docMeasure, docFull float32
	mdCell              *markdown.Options
	rows                [][]string
	csvW                []float32
	csvNum              []bool
	csvKey              bool
	csvScroll           ui.ScrollState

	// A PDF (D242): its pages, the bitmaps drawn now and at what width.
	pdf       *media.PDF
	pdfFailed bool
	pages     map[int]*ui.Bitmap
	pageW     map[int]int
	drawing   int // the page being drawn (0: none)

	// Find (D242): the field in the head, its matches in fv.text.
	finding  bool
	query    string
	hits     [][2]int
	hitsFor  string
	at       int
	scrolled int  // the match last scrolled to (-1: none yet)
	wasSrc   bool // the source toggle before find took it

	// D356: a file a link names, while the home fetches it (link set, ref
	// empty), or why it couldn't (linkErr, a FileOpenError, and linkMsg).
	link, linkTask, linkID string
	linkErr, linkMsg       string
}

// fileKind is the view a file opens in on the Mac: an SVG is its source
// here (the Mac draws no SVG), a video or a sound can't play here (D286:
// 在 Mac 上打开 plays it).
func fileKind(ref protocol.MediaRef) string {
	k := ref.FileView()
	if k == protocol.FilePicture && !ref.IsImage() {
		return protocol.FileText
	}
	if k == protocol.FileVideo || k == protocol.FileAudio || k == protocol.FilePicture {
		return protocol.FileNone
	}
	return k // a PDF is drawn here (D242)
}

// OpenFile opens a file a task showed in the viewer, growing out of the
// card at from (its bounds the frame before).
func (a *App) OpenFile(ref protocol.MediaRef, from ui.Rect) {
	if ref.IsImage() {
		a.OpenViewer("conv", ref.ID)
		return
	}
	fv := &fileViewState{open: true, ref: ref, from: from}
	if pages, ok := ref.PagesRef(); ok { // D439: read as its pages
		office := ref
		fv.ref, fv.office = pages, &office
	}
	fv.fill = a.filled(fileKind(fv.ref))
	a.fileView = fv
	a.loadFile(fv)
}

// fileLinkSeq numbers the file_open asks (the UI thread's own).
var fileLinkSeq int

// fileLinkWait is how long a linked file may take before the sheet says it
// didn't open (a home too old to know file_open never answers).
var fileLinkWait = 60 * time.Second

// OpenFileLink opens the file a link names (D356). On this Mac, with the
// Ducter here, the path is a file here: it opens as a file link always has.
// Otherwise it is the home's (or a worker's) path: the home reads it from
// the task's own folders and keeps a copy, and the viewer opens on that,
// saying Opening… until then and, when it can't, the one line why.
func (a *App) OpenFileLink(path, taskID string) {
	if a.onThisMachine() && a.localFile(path) {
		a.openLink("file://" + (&url.URL{Path: path}).EscapedPath())
		return
	}
	fv := &fileViewState{open: true, link: path, linkTask: taskID}
	a.fileView = fv
	a.askFileLink(fv)
}

// localFile: path names a file on this Mac (~ is this Mac's home).
func (a *App) localFile(path string) bool {
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return false
		}
		path = filepath.Join(home, path[2:])
	}
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}

// askFileLink sends (or sends again) the ask for the linked file.
func (a *App) askFileLink(fv *fileViewState) {
	fileLinkSeq++
	id := "fo" + strconv.Itoa(fileLinkSeq)
	fv.linkID, fv.loading, fv.linkErr, fv.linkMsg = id, true, "", ""
	a.send(protocol.FileOpenReq{T: "file_open", ID: id, Path: fv.link, TaskID: fv.linkTask})
	if a.Win == nil {
		return // tests answer by hand
	}
	a.later(func() { time.Sleep(fileLinkWait) }, func() {
		if a.fileView == fv && fv.link != "" && fv.linkID == id && fv.linkErr == "" {
			fv.loading, fv.linkErr = false, "failed"
		}
	})
}

// fileOpenFrame is the home's answer to a file_open ask (Applied hands it here).
func (a *App) fileOpenFrame(f protocol.ServerFrame) {
	fv := a.fileView
	if fv == nil || fv.link == "" || fv.linkID != f.ID {
		return
	}
	if f.OK && f.File != nil {
		fv.ref, fv.link, fv.loading = *f.File, "", false
		if fv.ref.IsImage() {
			a.fileView = nil
			a.OpenViewer("conv", fv.ref.ID)
			return
		}
		a.loadFile(fv)
		return
	}
	fv.loading = false
	fv.linkErr, fv.linkMsg = f.WbError, f.Message
	if fv.linkErr == "" {
		fv.linkErr = "failed"
	}
}

// fileLinkSays is the one line a linked file that didn't open says.
func (a *App) fileLinkSays(fv *fileViewState) string {
	switch fv.linkErr {
	case "missing", "outside", "too_big", "offline", "unsupported":
		return a.L.T("file.link." + fv.linkErr)
	}
	if fv.linkMsg != "" {
		return a.L.T("file.failed") + " " + fv.linkMsg
	}
	return a.L.T("file.failed")
}

// fileLinkSheet: the linked file's name and its path on the home, then
// Opening… or why it didn't open (Retry when trying again could help).
func (a *App) fileLinkSheet(c *ui.Context, fv *fileViewState) {
	t := a.T
	name := protocol.FileLinkName(fv.link)
	ui.Row(c.Key("fv-head")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S3+2, t.S3, t.S3, t.S4+2).Background(t.Surface).
		BorderWidth(0, 0, 1, 0).BorderColor(t.Line).Children(func() {
		ui.Box(c).Size(42, 42).Radius(t.RadiusSM).Background(t.Sunken).Shrink(0).Children(func() {
			ui.Box(c).Size(42, 42).Draw(drawFileKind(t.InkSoft, protocol.FileText))
		})
		ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
			uiText(c, name).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink).SingleLine().MinWidth(0).Tooltip(name)
			uiText(c, fv.link).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0).Tooltip(fv.link)
		})
		cl := ui.Box(c.Key("fv-close")).Size(t.ControlMD, t.ControlMD).Radius(t.ControlMD / 2).Role(ui.RoleButton).Shrink(0).
			Label(a.L.T("media.close")).Cursor(ui.CursorPointer).Focusable().Draw(drawCross(t.InkSoft))
		if cl.Hovered() {
			cl.Background(t.Sunken)
		}
		if cl.Clicked() {
			fv.open = false
		}
	})
	ui.Column(c.Key("fv-link")).Grow(1).MinHeight(0).AlignItems(ui.Center).Justify(ui.Center).Gap(t.S3).Padding(t.S6).Children(func() {
		if fv.linkErr == "" {
			uiText(c, a.L.T("file.loading")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		uiText(c, a.fileLinkSays(fv)).FontSize(t.MD).TextColor(t.InkSoft).MaxWidth(520).TextAlign(ui.Center)
		if fv.linkErr == "offline" || fv.linkErr == "failed" {
			if a.button(c, a.L.T("media.retry"), btnSecondary, t.ControlSM, t.Bg) {
				a.askFileLink(fv)
			}
		}
	})
}

// loadFile fetches the first part of a text file (nothing for a kind that
// isn't shown here).
func (a *App) loadFile(fv *fileViewState) {
	if fileKind(fv.ref) == protocol.FileNone {
		return
	}
	if fileKind(fv.ref) == protocol.FilePDF {
		a.loadPDF(fv)
		return
	}
	if a.Media == nil {
		fv.failed = true
		return
	}
	fv.n++
	n := fv.n
	fv.loading, fv.failed = true, false
	home := a.Media.Home()
	var data []byte
	var err error
	a.later(func() {
		data, err = home.FetchHead(context.Background(), fv.ref.Path(), protocol.FileViewBytes)
	}, func() {
		if n != fv.n {
			return
		}
		fv.loading = false
		if err != nil {
			fv.failed = true
			a.keyMaybeOld(err, fv.ref.ID)
			return
		}
		fv.text, fv.cut = protocol.ViewText(data, fv.ref.Bytes)
		if fileKind(fv.ref) == protocol.FileTable {
			fv.rows, fv.more = protocol.ParseTable(fv.text, protocol.TableSep(fv.ref.Name), protocol.FileViewRows)
			fv.csvW = nil
		}
	})
}

// D567: 铺满 / Fill the window, remembered per kind of file: a report opens
// filled after the person chose it once, a PDF keeps its own choice.

// filled: the person last chose to read this kind filling the window.
func (a *App) filled(kind string) bool {
	if kind == protocol.FileNone {
		return false
	}
	if a.Local != nil {
		return a.Local.FileFill(kind)
	}
	return a.med().filled[kind]
}

// toggleFill gives the viewer the whole window, or gives it back, and
// remembers the choice for this kind.
func (a *App) toggleFill(fv *fileViewState) {
	kind := fileKind(fv.ref)
	if kind == protocol.FileNone || fv.link != "" {
		return
	}
	fv.fill = !fv.fill
	if a.Local != nil {
		a.Local.SetFileFill(kind, fv.fill)
	} else {
		m := a.med()
		if m.filled == nil {
			m.filled = map[string]bool{}
		}
		m.filled[kind] = fv.fill
	}
}

// drawFill is 铺满's mark: corners going out; filled, corners coming in.
func drawFill(on bool) func(fg ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(fg ui.Color) func(p *ui.Painter, r ui.Rect) {
		return func(p *ui.Painter, r ui.Rect) {
			s := min(r.W, r.H) / 44 // the glyph as large as the head's magnifier
			ox, oy := r.X+(r.W-20*s)/2, r.Y+(r.H-20*s)/2
			pt := func(x, y float32) (float32, float32) { return ox + x*s, oy + y*s }
			var path ui.Path
			if on {
				path.MoveTo(pt(8, 3.5)).LineTo(pt(8, 8)).LineTo(pt(3.5, 8))
				path.MoveTo(pt(12, 3.5)).LineTo(pt(12, 8)).LineTo(pt(16.5, 8))
				path.MoveTo(pt(8, 16.5)).LineTo(pt(8, 12)).LineTo(pt(3.5, 12))
				path.MoveTo(pt(12, 16.5)).LineTo(pt(12, 12)).LineTo(pt(16.5, 12))
			} else {
				path.MoveTo(pt(3.5, 8)).LineTo(pt(3.5, 3.5)).LineTo(pt(8, 3.5))
				path.MoveTo(pt(16.5, 8)).LineTo(pt(16.5, 3.5)).LineTo(pt(12, 3.5))
				path.MoveTo(pt(3.5, 12)).LineTo(pt(3.5, 16.5)).LineTo(pt(8, 16.5))
				path.MoveTo(pt(16.5, 12)).LineTo(pt(16.5, 16.5)).LineTo(pt(12, 16.5))
			}
			p.StrokePath(&path, 2.4*s, fg)
		}
	}
}

// loadPDF fetches the whole PDF and parses it on this Mac; pages are drawn
// as they show (pdfBody).
func (a *App) loadPDF(fv *fileViewState) {
	if a.Media == nil {
		fv.failed = true
		return
	}
	fv.n++
	n := fv.n
	fv.loading, fv.failed, fv.pdfFailed = true, false, false
	home := a.Media.Home()
	var doc *media.PDF
	var err error
	a.later(func() {
		var data []byte
		if data, err = home.Fetch(context.Background(), fv.ref.Path()); err == nil {
			doc, err = media.OpenPDF(data)
		}
	}, func() {
		if n != fv.n || !fv.open {
			if doc != nil {
				doc.Close()
			}
			return
		}
		fv.loading = false
		switch {
		case err == media.ErrNotPDF:
			fv.pdfFailed = true
		case err != nil:
			fv.failed = true
			a.keyMaybeOld(err, fv.ref.ID)
		default:
			fv.pdf, fv.pages, fv.pageW = doc, map[int]*ui.Bitmap{}, map[int]int{}
		}
	})
}

// closeFile lets the open file's PDF go.
func (fv *fileViewState) closeFile() {
	if fv.pdf != nil {
		fv.pdf.Close()
		fv.pdf, fv.pages = nil, nil
	}
}

// fileBytes fetches the whole file (Save a copy, Copy of a long text, Open on this Mac).
func (a *App) fileBytes(ref protocol.MediaRef, done func([]byte)) {
	if a.Media == nil {
		return
	}
	home := a.Media.Home()
	var data []byte
	var err error
	a.later(func() { data, err = home.Fetch(context.Background(), ref.Path()) }, func() {
		if err != nil {
			a.toast(a.L.T("file.failed"))
			return
		}
		done(data)
	})
}

// fileSaveName is what a file is called in Downloads: the task's own name.
func fileSaveName(ref protocol.MediaRef) string {
	if ref.Name != "" {
		return fileName(ref)
	}
	return "Ducter-" + ref.ID[:min(12, len(ref.ID))]
}

func (a *App) saveFileCopy(ref protocol.MediaRef) {
	a.fileBytes(ref, func(data []byte) {
		if _, err := a.Media.Save(fileSaveName(ref), data); err == nil {
			a.toast(a.L.T("media.saved"))
		}
	})
}

// toast says one line at the foot of the window (the frame's own toast
// when a frame is building, else the next one).
func (a *App) toast(s string) { a.fileToast = s }

// fileViewer is the open file, over the dimmed page.
func (a *App) fileViewer(c *ui.Context) {
	if a.fileToast != "" {
		c.Toast(a.fileToast)
		a.fileToast = ""
	}
	fv := a.fileView
	if fv == nil {
		return
	}
	if !fv.open {
		fv.closeFile()
		a.fileView = nil
		return
	}
	t := a.T
	// ⌘F finds; Esc closes the find field before the file (D242): the
	// dialog takes Esc itself, so a dismissal that wasn't a click outside,
	// while finding, is find's.
	clickedOut := false
	findKeys := func() {
		if c.Shortcut(ui.Cmd, ui.KeyEnter) { // D567: 铺满 / Fill the window
			a.toggleFill(fv)
		}
		if !fileFindable(fv) {
			return
		}
		switch {
		case c.Shortcut(ui.Cmd, ui.KeyF):
			a.openFind(fv)
		case fv.finding && c.Shortcut(ui.Cmd, ui.KeyG):
			a.findStep(fv, 1)
		case fv.finding && c.Shortcut(ui.Cmd|ui.Shift, ui.KeyG):
			a.findStep(fv, -1)
		}
	}
	w, h := c.Size()
	if w <= 0 {
		w, h = 1100, 800
	}
	pw, ph := min(w-2*t.S6, 860), max(320, min(h-2*t.S5, 980))
	if fv.fill { // D567: the whole window, its edges a little in
		pw, ph = w-2*t.S4, h-2*t.S4
	}
	kind := fileKind(fv.ref)
	name := fileSaveName(fv.ref)
	if fv.link != "" {
		// D356: the home still fetches it, or said why not: a smaller sheet.
		pw, ph = min(w-2*t.S6, 620), 260
		name = protocol.FileLinkName(fv.link)
	}
	ui.DialogBase(c, &fv.open, func(back, panel ui.Element) {
		findKeys() // inside the dialog (a shortcut outside it never fires)
		clickedOut = back.Clicked()
		back.Background(t.Scrim)
		ph := min(ph, sheetBack(c, back, h)) // never over the title bar
		panel.Width(pw).Height(ph).Radius(t.RadiusXL).Background(t.Bg).Clip().
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Shadow(0, 5, 0, 0, t.Line).Label(name)
		a.fileGrow(c, panel, fv, w, h, pw, ph)
		if fv.link != "" {
			ui.Column(c.Key("fv-l")).Fill().Children(func() { a.fileLinkSheet(c, fv) })
			return
		}
		ui.Column(c.Key("fv")).Fill().Children(func() {
			a.fileHead(c, fv, kind, name)
			if fv.finding {
				a.findBar(c, fv)
			}
			ui.Box(c.Key("fv-body")).Grow(1).MinHeight(0).Children(func() { a.fileBody(c, fv, kind) })
			a.fileBar(c, fv, kind)
		})
	})
	if !fv.open && fv.finding && !clickedOut {
		a.closeFind(fv)
		fv.open = true // that Esc was find's
	}
	if !fv.open {
		fv.closeFile()
		a.fileView = nil
	}
}

// fileGrow: the sheet starts at the card it was opened from (a shared
// element) and settles at its place; with no card, it rises a little.
func (a *App) fileGrow(c *ui.Context, panel ui.Element, fv *fileViewState, w, h, pw, ph float32) {
	if c.Preferences().ReduceMotion {
		return
	}
	shown := ui.Local(panel, "grown", func() bool { return false })
	p := ui.Pose{}
	if !*shown {
		*shown = true
		p = ui.Pose{Y: 12, Scale: 0.97, Fade: 1}
		if r := fv.from; r.W > 0 {
			p = ui.Pose{X: r.X + r.W/2 - w/2, Y: r.Y + r.H/2 - h/2, Scale: max(0.2, r.W/pw), Fade: 0.6}
		}
		c.Invalidate()
	}
	panel.AnimatePose(p, a.T.Snappy)
}

// fileHead: the file's mark on a sunken tile, its name, kind · size · lines,
// Show source / Show formatted, and ×.
func (a *App) fileHead(c *ui.Context, fv *fileViewState, kind, name string) {
	t := a.T
	ui.Row(c.Key("fv-head")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S3+2, t.S3, t.S3, t.S4+2).Background(t.Surface).
		BorderWidth(0, 0, 1, 0).BorderColor(t.Line).Children(func() {
		ui.Box(c).Size(42, 42).Radius(t.RadiusSM).Background(t.Sunken).Shrink(0).Children(func() {
			ui.Box(c).Size(42, 42).Draw(drawFileKind(t.InkSoft, kind))
		})
		ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
			// D567: a double click on the title fills the window, as on a window's own.
			if uiText(c, name).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink).SingleLine().MinWidth(0).Tooltip(name).DoubleClicked() {
				a.toggleFill(fv)
			}
			meta := []string{strings.ToUpper(strings.TrimPrefix(fileExt(name), ".")), protocol.SizeWords(fv.ref.Bytes)}
			if fv.text != "" && kind != protocol.FileTable {
				meta = append(meta, a.L.T("file.lines", strings.Count(fv.text, "\n")+1))
			}
			if fv.pdf != nil {
				if n := fv.pdf.Pages(); n == 1 {
					meta = append(meta, a.L.T("file.pages.one"))
				} else {
					meta = append(meta, a.L.T("file.pages", n))
				}
			}
			a.facts(c, t.XS, t.InkMuted, meta...) // D291: kind, size, lines, pages apart
		})
		if fileFindable(fv) {
			lens := ui.Box(c.Key("fv-find")).Size(t.ControlMD, t.ControlMD).Radius(t.RadiusSM).Role(ui.RoleButton).Shrink(0).
				Label(a.L.T("file.find")).Tooltip(a.L.T("file.find.key", "⌘F")).Cursor(ui.CursorPointer).Focusable().AccessSelected(fv.finding).Draw(drawLens(t.InkSoft))
			if fv.finding || lens.Hovered() {
				lens.Background(t.Sunken)
			}
			if lens.Clicked() {
				if fv.finding {
					a.closeFind(fv)
				} else {
					a.openFind(fv)
				}
			}
		}
		if (kind == protocol.FileMarkdown || kind == protocol.FileTable) && fv.text != "" && !fv.finding {
			label := a.L.T("file.source")
			if fv.source {
				label = a.L.T("file.formatted")
			}
			if a.button(c, label, btnText, t.ControlSM, t.Surface) {
				fv.source = !fv.source
			}
		}
		if kind != protocol.FileNone {
			label := a.L.T("file.fill")
			tip := a.L.T("file.fill.key", "⌘Return")
			if fv.fill {
				label, tip = a.L.T("file.unfill"), a.L.T("file.unfill.key", "⌘Return")
			}
			if a.iconButtonTip(c, "fv-fill", label, tip, t.ControlMD, btnText, drawFill(fv.fill)) {
				a.toggleFill(fv)
			}
		}
		cl := ui.Box(c.Key("fv-close")).Size(t.ControlMD, t.ControlMD).Radius(t.ControlMD / 2).Role(ui.RoleButton).Shrink(0).
			Label(a.L.T("media.close")).Cursor(ui.CursorPointer).Focusable().Draw(drawCross(t.InkSoft))
		if cl.Hovered() {
			cl.Background(t.Sunken)
		}
		if cl.Clicked() {
			fv.open, fv.finding = false, false
		}
	})
}

func fileExt(name string) string {
	if i := strings.LastIndexByte(name, '.'); i >= 0 {
		return name[i:]
	}
	return ""
}

// fileBody is the file itself, in the view that suits it.
func (a *App) fileBody(c *ui.Context, fv *fileViewState, kind string) {
	t := a.T
	switch {
	case kind == protocol.FileNone:
		a.fileNone(c, fv)
		return
	case fv.failed:
		ui.Column(c.Key("fv-failed")).Fill().AlignItems(ui.Center).Justify(ui.Center).Gap(t.S3).Children(func() {
			uiText(c, a.L.T("file.failed")).FontSize(t.MD).TextColor(t.InkSoft)
			if a.button(c, a.L.T("media.retry"), btnSecondary, t.ControlSM, t.Bg) {
				a.loadFile(fv)
			}
		})
		return
	case fv.loading:
		ui.Column(c.Key("fv-loading")).Fill().AlignItems(ui.Center).Justify(ui.Center).Children(func() {
			uiText(c, a.L.T("file.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		})
		return
	}
	cutNote := func() {
		if fv.cut || fv.more {
			msg := a.L.T("file.cut", protocol.SizeWords(protocol.FileViewBytes))
			if fv.more && !fv.cut {
				msg = a.L.T("file.rowsCut", protocol.FileViewRows)
			}
			uiText(c.Key("fv-cut"), msg).FontSize(t.SM).TextColor(t.InkSoft).Padding(t.S2+2, t.S4).Radius(t.RadiusSM).Background(t.Sunken).TextAlign(ui.Center)
		}
	}
	if kind == protocol.FilePDF {
		if fv.pdfFailed {
			a.fileNone(c, fv)
			return
		}
		if fv.pdf != nil {
			a.pdfBody(c, fv)
		}
		return
	}
	if kind == protocol.FileText || fv.source {
		if fv.st == nil {
			// Read only: no caret, so no line is "current" (D242).
			fv.st = &editor.State{Buffer: editor.NewBuffer(fv.text), ReadOnly: true, NoActiveLine: true}
			fv.st.Buffer.SetLanguage(editor.LanguageFor(fv.ref.Name))
		}
		a.findMarks(fv)
		ui.Column(c.Key("fv-text")).Fill().Background(t.SurfaceRaised).Children(func() {
			editor.View(c, fv.st).Grow(1).MinHeight(0)
			if fv.cut {
				ui.Box(c).Padding(t.S2, t.S4).Children(cutNote)
			}
		})
		return
	}
	if kind == protocol.FileTable { // D567: the table itself, filling the sheet
		ui.Column(c.Key("fv-table")).Fill().Children(func() {
			ui.Box(c).Grow(1).MinHeight(0).Children(func() { a.csvTable(c, fv) })
		})
		return
	}
	if fv.md == nil {
		th := a.markdownTheme(t.MD+1, a.leading(1.6))
		th.Headings[0].Size, th.Headings[1].Size, th.Headings[2].Size = 1.75, 1.3, 1.12
		fv.md = &markdown.Options{Theme: th, CodeBlock: a.codeBlock,
			// D567: a wide table, read whole.
			Block: func(c *ui.Context, d *parser.Document, i int) bool { return a.mdTableBlock(c, fv, d, i) }}
		cell := a.markdownTheme(a.tableCellSize(), 1.45)
		fv.mdCell = &markdown.Options{Theme: cell, ShareSelection: true}
	}
	pad := t.S5 + 4
	sc := ui.Scroll(c.Key("fv-doc")).Fill()
	if b := sc.Bounds(); b.W > 0 { // the last frame's: the measure, and the room a wide table may take
		fv.docFull = b.W - 2*pad
		fv.docMeasure = min(680, fv.docFull)
	}
	sc.Children(func() {
		ui.Row(c).Justify(ui.Center).Padding(pad, pad, t.S6+8, pad).Children(func() {
			ui.Column(c).Grow(1).MaxWidth(680).MinWidth(0).Gap(t.S4).Children(func() {
				markdown.View(c, fv.text, fv.md)
				cutNote()
			})
		})
	})
}

// fileNone: a kind Ducter can't show here, said plainly: the file as a
// sheet of clay with its kind on it, then Open on this Mac and Save a copy.
func (a *App) fileNone(c *ui.Context, fv *fileViewState) {
	t := a.T
	ui.Column(c.Key("fv-none")).Fill().AlignItems(ui.Center).Justify(ui.Center).Gap(t.S4).Padding(t.S6).Children(func() {
		ui.Column(c).Size(112, 136).Radius(18).Background(t.Surface).Shadow(0, 6, 0, 0, t.Line).AlignItems(ui.Center).Justify(ui.Center).Gap(t.S2).Children(func() {
			ui.Box(c).Size(56, 56).Draw(drawFileKind(t.InkMuted, protocol.FileNone))
			uiText(c, strings.ToUpper(strings.TrimPrefix(fileExt(fileSaveName(fv.ref)), "."))).FontSize(t.XS).FontWeight(800).TextColor(t.InkSoft)
		})
		// D259: a file of no kind Ducter knows (a program, a script bundle,
		// anything a person sent) is never handed to macOS to open: opening
		// can run it. Save a copy only.
		inert := fv.ref.Type == protocol.AnyFile
		said := a.L.T("file.none.mac")
		if inert {
			said = a.L.T("file.none.kept")
		}
		if fv.pdfFailed {
			said = a.L.T("file.pdfFailed.mac")
		}
		uiText(c, said).FontSize(t.MD).TextColor(t.InkSoft).MaxWidth(380).TextAlign(ui.Center)
		ui.Row(c).Gap(t.S3).Children(func() {
			if !inert && a.button(c, a.L.T("file.openMac"), btnPrimary, t.ControlMD, t.Bg) {
				ref := fv.ref
				a.fileBytes(ref, func(data []byte) {
					if err := a.Media.OpenLocal(fileSaveName(ref), data); err != nil {
						a.toast(a.L.T("file.failed"))
					}
				})
			}
			if a.button(c, a.L.T("file.save"), btnSecondary, t.ControlMD, t.Bg) {
				a.saveFileCopy(fv.ref)
			}
		})
	})
}

// fileBar: 来自 {task}; then Copy (text), Save a copy and, last, Save to
// Nowledge Mem (D572: one aligned row; a failure is its own full-width line
// above it, on the bar's text edge, never wedged between the buttons).
func (a *App) fileBar(c *ui.Context, fv *fileViewState, kind string) {
	t := a.T
	ui.Column(c.Key("fv-foot")).Background(t.Surface).BorderWidth(1, 0, 0, 0).BorderColor(t.Line).Children(func() {
		if a.memKeepFailing(fv.ref) {
			ui.Column(c.Key("fv-trouble")).Padding(t.S2, t.S4, 0, t.S4).Children(func() { a.memKeepTrouble(c, fv.ref) })
		}
		a.fileBarRow(c, fv, kind)
	})
}

func (a *App) fileBarRow(c *ui.Context, fv *fileViewState, kind string) {
	t := a.T
	ui.Row(c.Key("fv-bar")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S2+2, t.S4, t.S3, t.S4).Children(func() {
		// A task this Mac doesn't hold (a linked file from an old task, D356) has no 来自.
		if ref := fv.ref; ref.From != nil && a.S.Task(ref.From.TaskID) != nil {
			if title := a.S.Task(ref.From.TaskID).Title(); title != "" {
				l := uiText(c.Key("fv-from"), a.L.T("media.from", title)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1).
					Cursor(ui.CursorPointer).Role(ui.RoleLink).Focusable().Label(a.L.T("media.from", title))
				if l.Hovered() {
					l.TextColor(t.Ink)
				}
				if l.Clicked() {
					fv.open, fv.finding = false, false
					a.OpenTask(ref.From.TaskID)
				}
			}
		}
		ui.Spacer(c)
		if kind != protocol.FileNone && fv.text != "" {
			if a.button(c, a.L.T("media.copy"), btnText, t.ControlSM, t.Surface) {
				if fv.cut {
					a.fileBytes(fv.ref, func(data []byte) {
						s, _ := protocol.ViewText(data, int64(len(data)))
						a.copyText = s
					})
				} else {
					c.WriteClipboard(fv.text)
					c.Toast(a.L.T("media.copied"))
				}
			}
		}
		if fv.office != nil { // D439: the PDF it reads as, and the file itself
			if a.button(c, a.L.T("file.savePdf"), btnText, t.ControlSM, t.Surface) {
				a.saveFileCopy(fv.ref)
			}
			if a.button(c, a.L.T("file.save"), btnSecondary, t.ControlSM, t.Surface) {
				a.saveFileCopy(*fv.office)
			}
		} else if kind != protocol.FileNone && !fv.pdfFailed {
			if a.button(c, a.L.T("file.save"), btnSecondary, t.ControlSM, t.Surface) {
				a.saveFileCopy(fv.ref)
			}
		}
		// D566, D572: keep it in the person's Nowledge Mem (memkeep.go), last in the row.
		a.memKeepBar(c, fv.ref)
		if a.copyText != "" {
			c.WriteClipboard(a.copyText)
			c.Toast(a.L.T("media.copied"))
			a.copyText = ""
		}
	})
}

// drawFileKind is a sheet with a folded corner: lines of text on a
// document, a grid on a table, bare for anything else.
func drawFileKind(col ui.Color, kind string) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := min(r.W, r.H) / 24
		ox, oy := r.X+(r.W-24*s)/2, r.Y+(r.H-24*s)/2
		pt := func(x, y float32) (float32, float32) { return ox + x*s, oy + y*s }
		var sh ui.Path
		sh.MoveTo(pt(6, 2.8)).LineTo(pt(14, 2.8)).LineTo(pt(18.2, 7)).LineTo(pt(18.2, 21.2)).LineTo(pt(6, 21.2)).Close()
		sh.MoveTo(pt(14, 2.8)).LineTo(pt(14, 7)).LineTo(pt(18.2, 7))
		p.StrokePath(&sh, 1.7*s, col)
		var in ui.Path
		switch kind {
		case protocol.FileMarkdown, protocol.FileText:
			in.MoveTo(pt(8.8, 11.6)).LineTo(pt(15.2, 11.6)).MoveTo(pt(8.8, 14.6)).LineTo(pt(15.2, 14.6)).MoveTo(pt(8.8, 17.6)).LineTo(pt(12.6, 17.6))
		case protocol.FilePDF:
			in.MoveTo(pt(8.8, 11.4)).LineTo(pt(15.2, 11.4)).LineTo(pt(15.2, 14.8)).LineTo(pt(8.8, 14.8)).Close()
			in.MoveTo(pt(8.8, 17.6)).LineTo(pt(15.2, 17.6))
		case protocol.FileTable:
			in.MoveTo(pt(8.6, 11.2)).LineTo(pt(15.4, 11.2)).LineTo(pt(15.4, 17.8)).LineTo(pt(8.6, 17.8)).Close()
			in.MoveTo(pt(8.6, 14.5)).LineTo(pt(15.4, 14.5)).MoveTo(pt(12, 11.2)).LineTo(pt(12, 17.8))
		default:
			return
		}
		p.StrokePath(&in, 1.35*s, col)
	}
}

// ---------- a PDF's pages (D242) ----------

// pdfNear is how far from the screen a page is still kept drawn, in
// points: about a screen either way.
const pdfNear = 900

// pdfBody is the PDF's pages on the sunken ground, each a sheet of white
// paper at the reading width; a page is drawn when it comes within
// pdfNear of the screen and let go when it leaves, so a long PDF holds a
// few bitmaps at once.
func (a *App) pdfBody(c *ui.Context, fv *fileViewState) {
	t := a.T
	doc := fv.pdf
	const scale = 2 // Retina: the page is drawn at twice its points
	ui.Scroll(c.Key("fv-pdf")).Fill().Background(t.Sunken).Children(func() {
		ui.Row(c).Justify(ui.Center).Padding(t.S4+2, t.S4+2, t.S6, t.S4+2).Children(func() {
			ui.Column(c).Grow(1).MaxWidth(720).MinWidth(0).Gap(t.S3 + 2).Children(func() {
				for i := 1; i <= doc.Pages(); i++ {
					w, h := doc.Size(i)
					if w <= 0 || h <= 0 {
						w, h = 595, 842
					}
					page := ui.Box(c.Key(fmt.Sprintf("pg:%d", i))).AlignSelf(ui.Stretch).AspectRatio(float32(w/h)).
						Radius(6).Background(t.PDFPage).Clip().Shadow(0, 3, 0, 0, t.Line).Role(ui.RoleImage).Label(a.L.T("file.page", i))
					near := page.InViewMargin(pdfNear)
					b := page.Bounds()
					px := int(b.W*scale + 0.5)
					switch {
					case !near:
						delete(fv.pages, i) // let the pixels go
						delete(fv.pageW, i)
					case px > 0 && fv.pageW[i] != px && fv.drawing == 0:
						a.drawPage(fv, i, px)
					}
					if bmp := fv.pages[i]; bmp != nil {
						page.Children(func() { ui.Image(c, bmp).Fill().AccessHidden(true) })
					}
				}
			})
		})
	})
}

// drawPage draws page i at px pixels wide, off the UI thread, one at a time.
func (a *App) drawPage(fv *fileViewState, i, px int) {
	doc := fv.pdf
	fv.drawing = i
	var bmp *ui.Bitmap
	a.later(func() {
		if img, err := doc.Render(i, px); err == nil {
			bmp = ui.NewBitmap(img)
		}
	}, func() {
		fv.drawing = 0
		if fv.pdf != doc || fv.pages == nil || bmp == nil {
			return
		}
		fv.pages[i], fv.pageW[i] = bmp, px
	})
}

// ---------- find (D242) ----------

// fileFindable: a text, a report or a table, read.
func fileFindable(fv *fileViewState) bool {
	k := fileKind(fv.ref)
	return fv.text != "" && (k == protocol.FileText || k == protocol.FileMarkdown || k == protocol.FileTable)
}

func (a *App) openFind(fv *fileViewState) {
	if fv.finding {
		return
	}
	fv.finding, fv.wasSrc, fv.scrolled = true, fv.source, -1
	fv.source = true // a report or a table is found in its text here
}

func (a *App) closeFind(fv *fileViewState) {
	fv.finding, fv.source = false, fv.wasSrc
	if fv.st != nil {
		fv.st.TextBackgrounds = nil
	}
}

func (a *App) findStep(fv *fileViewState, d int) {
	if n := len(fv.hits); n > 0 {
		fv.at = (fv.at + d + n) % n
	}
}

// findBar is the find field under the head: the words, n of m, previous
// and next. Enter goes to the next.
func (a *App) findBar(c *ui.Context, fv *fileViewState) {
	t := a.T
	ui.Row(c.Key("fv-findbar")).Gap(t.S1).AlignItems(ui.Center).Padding(0, t.S3, t.S3, t.S4+2).Background(t.Surface).
		BorderWidth(0, 0, 1, 0).BorderColor(t.Line).Role(ui.RoleSearch).Children(func() {
		in := ui.TextInput(c.Key("fv-find-in"), &fv.query).Placeholder(a.L.T("file.find.placeholder")).Label(a.L.T("file.find")).
			FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Sunken).Border(1, t.LineSoft).Grow(1).MinWidth(0).AutoFocus()
		if in.Changed() {
			fv.at, fv.scrolled = 0, -1
		}
		if in.Submitted() {
			a.findStep(fv, 1)
		}
		word := ""
		if fv.query != "" {
			if n := len(fv.hits); n > 0 {
				word = a.L.T("file.find.count", min(fv.at, n-1)+1, n)
			} else {
				word = a.L.T("file.find.none")
			}
		}
		uiText(c.Key("fv-find-n"), word).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).MinWidth(64).TextAlign(ui.Center).Shrink(0)
		for _, s := range []struct {
			key, label string
			d          int
		}{{"prev", a.L.T("file.find.prev"), -1}, {"next", a.L.T("file.find.next"), 1}} {
			b := ui.Box(c.Key("fv-find-"+s.key)).Size(t.ControlSM, t.ControlSM).Radius(t.RadiusSM).Role(ui.RoleButton).Shrink(0).
				Label(s.label).Cursor(ui.CursorPointer).Focusable().Draw(drawStep(t.InkSoft, s.d < 0)).Disabled(len(fv.hits) == 0)
			if b.Hovered() && len(fv.hits) > 0 {
				b.Background(t.Sunken)
			}
			if b.Clicked() {
				a.findStep(fv, s.d)
			}
		}
	})
}

// findMarks marks every match in the editor, the current one in the
// accent, selects it and scrolls it into view.
func (a *App) findMarks(fv *fileViewState) {
	st := fv.st
	if st == nil {
		return
	}
	if !fv.finding || fv.query == "" {
		fv.hits, fv.hitsFor, st.TextBackgrounds = nil, "", nil
		return
	}
	if fv.hitsFor != fv.query {
		fv.hits, fv.hitsFor = protocol.FindAll(fv.text, fv.query, protocol.FindMax), fv.query
	}
	if len(fv.hits) == 0 {
		st.TextBackgrounds = nil
		return
	}
	fv.at = min(fv.at, len(fv.hits)-1)
	t := a.T
	bg := make([]editor.TextBackground, 0, len(fv.hits))
	for i, h := range fv.hits {
		col := t.Highlight
		if i == fv.at {
			col = t.Accent
		}
		bg = append(bg, editor.TextBackground{Start: h[0], End: h[1], Color: col})
	}
	st.TextBackgrounds = bg
	if fv.scrolled != fv.at {
		fv.scrolled = fv.at
		h := fv.hits[fv.at]
		st.Select(h[0], h[1])
	}
}

// drawStep is previous (up) or next (down).
func drawStep(col ui.Color, up bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := min(r.W, r.H) / 22
		ox, oy := r.X+(r.W-20*s)/2, r.Y+(r.H-20*s)/2
		var path ui.Path
		if up {
			path.MoveTo(ox+5.5*s, oy+12.5*s).LineTo(ox+10*s, oy+8*s).LineTo(ox+14.5*s, oy+12.5*s)
		} else {
			path.MoveTo(ox+5.5*s, oy+7.5*s).LineTo(ox+10*s, oy+12*s).LineTo(ox+14.5*s, oy+7.5*s)
		}
		p.StrokePath(&path, 2*s, col)
	}
}

// ---------- code blocks ----------

// codeBlock is a code block in Ducter's words: its language, and Ducter's
// own 拷贝 / Copy (MyGo's says "Copy code" in its own words and language).
func (a *App) codeBlock(c *ui.Context, b *markdown.CodeBlockView) { a.codeBlockR(c, b, a.T.RadiusSM) }

// codeBlockTask is a code block in an opened task's words: smaller corners (D268).
func (a *App) codeBlockTask(c *ui.Context, b *markdown.CodeBlockView) { a.codeBlockR(c, b, 8) }

func (a *App) codeBlockR(c *ui.Context, b *markdown.CodeBlockView, radius float32) {
	t := a.T
	ui.Column(c).AlignSelf(ui.Stretch).Background(t.SurfaceRaised).Border(1, t.Line).Radius(radius).Clip().
		Role(ui.RoleGroup).Label(firstNonEmpty(b.Language, a.L.T("code.block"))).Children(func() {
		head := ui.Row(c).AlignItems(ui.Center).Padding(t.S1, t.S1, 0, t.S3)
		head.Children(func() {
			uiText(c, b.Language).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Unselectable()
			ui.Spacer(c)
			copied := ui.Local(head, "copied", func() int64 { return 0 })
			label := a.L.T("media.copy")
			if *copied != 0 && a.Now().UnixMilli()-*copied < 1600 {
				label = a.L.T("media.copied")
			}
			if a.button(c, label, btnText, t.ControlSM-6, t.SurfaceRaised) && !b.Open {
				c.WriteClipboard(b.Code())
				*copied = a.Now().UnixMilli()
				c.After(1700e6)
			}
		})
		b.Body(c)
	})
}
