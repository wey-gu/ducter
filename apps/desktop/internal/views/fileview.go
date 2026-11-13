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

import (
	"context"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/editor"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// fileViewState is the file viewer while open.
type fileViewState struct {
	open    bool
	ref     protocol.MediaRef
	from    ui.Rect // the card it grew out of (empty: no card on screen)
	loading bool
	failed  bool
	text    string
	cut     bool
	source  bool // a Markdown or table file shown as its text
	st      *editor.State
	table   string // a table file as a Markdown table
	more    bool   // the table has more rows than it shows
	md      *markdown.Options
	n       int // which load is current (a Retry starts another)
}

// fileKind is the view a file opens in on the Mac: an SVG is its source
// here (the Mac draws no SVG), a video can't play here.
func fileKind(ref protocol.MediaRef) string {
	k := ref.FileView()
	if k == protocol.FilePicture && !ref.IsImage() {
		return protocol.FileText
	}
	if k == protocol.FileVideo || k == protocol.FilePicture {
		return protocol.FileNone
	}
	return k
}

// OpenFile opens a file a task showed in the viewer, growing out of the
// card at from (its bounds the frame before).
func (a *App) OpenFile(ref protocol.MediaRef, from ui.Rect) {
	if ref.IsImage() {
		a.OpenViewer("conv", ref.ID)
		return
	}
	fv := &fileViewState{open: true, ref: ref, from: from}
	a.fileView = fv
	a.loadFile(fv)
}

// loadFile fetches the first part of a text file (nothing for a kind that
// isn't shown here).
func (a *App) loadFile(fv *fileViewState) {
	if fileKind(fv.ref) == protocol.FileNone {
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
			return
		}
		fv.text, fv.cut = protocol.ViewText(data, fv.ref.Bytes)
		if fileKind(fv.ref) == protocol.FileTable {
			fv.table, fv.more = tableMarkdown(fv.text, fv.ref.Name)
		}
	})
}

// tableMarkdown is a table file as a Markdown table (numbers lined up on
// the right), drawn by the same view as a report's tables.
func tableMarkdown(text, name string) (string, bool) {
	rows, more := protocol.ParseTable(text, protocol.TableSep(name), protocol.FileViewRows)
	if len(rows) == 0 {
		return "", more
	}
	cols := 0
	for _, r := range rows {
		cols = max(cols, len(r))
	}
	cell := func(r []string, k int) string {
		if k >= len(r) {
			return ""
		}
		s := strings.NewReplacer("|", "\\|", "\n", " ", "\r", " ").Replace(r[k])
		if strings.TrimSpace(s) == "" {
			return " "
		}
		return s
	}
	num := func(k int) bool {
		seen := false
		for _, r := range rows[1:] {
			s := strings.TrimSpace(cell(r, k))
			if s == "" {
				continue
			}
			for _, ch := range s {
				if !strings.ContainsRune("0123456789.,-%", ch) {
					return false
				}
			}
			seen = true
		}
		return seen
	}
	var b strings.Builder
	line := func(r []string) {
		b.WriteString("|")
		for k := 0; k < cols; k++ {
			b.WriteString(" " + cell(r, k) + " |")
		}
		b.WriteString("\n")
	}
	line(rows[0])
	b.WriteString("|")
	for k := 0; k < cols; k++ {
		if num(k) {
			b.WriteString("---:|")
		} else {
			b.WriteString("---|")
		}
	}
	b.WriteString("\n")
	for _, r := range rows[1:] {
		line(r)
	}
	return b.String(), more
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
		a.fileView = nil
		return
	}
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1100, 800
	}
	pw, ph := min(w-2*t.S6, 860), max(320, min(h-2*t.S5, 980))
	kind := fileKind(fv.ref)
	name := fileSaveName(fv.ref)
	ui.DialogBase(c, &fv.open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(pw).Height(ph).Radius(t.RadiusXL).Background(t.Bg).Clip().
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Shadow(0, 5, 0, 0, t.Line).Label(name)
		a.fileGrow(c, panel, fv, w, h, pw, ph)
		ui.Column(c.Key("fv")).Fill().Children(func() {
			a.fileHead(c, fv, kind, name)
			ui.Box(c.Key("fv-body")).Grow(1).MinHeight(0).Children(func() { a.fileBody(c, fv, kind) })
			a.fileBar(c, fv, kind)
		})
	})
	if !fv.open {
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
			ui.Text(c, name).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink).SingleLine().MinWidth(0).Tooltip(name)
			meta := []string{strings.ToUpper(strings.TrimPrefix(fileExt(name), ".")), protocol.SizeWords(fv.ref.Bytes)}
			if fv.text != "" && kind != protocol.FileTable {
				meta = append(meta, a.L.T("file.lines", strings.Count(fv.text, "\n")+1))
			}
			ui.Text(c, strings.Join(nonEmpty(meta...), " · ")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
		})
		if (kind == protocol.FileMarkdown || kind == protocol.FileTable) && fv.text != "" {
			label := a.L.T("file.source")
			if fv.source {
				label = a.L.T("file.formatted")
			}
			if a.button(c, label, btnText, t.ControlSM, t.Surface) {
				fv.source = !fv.source
			}
		}
		cl := ui.Box(c.Key("fv-close")).Size(t.ControlMD, t.ControlMD).Radius(t.ControlMD / 2).Role(ui.RoleButton).Shrink(0).
			Label(a.L.T("media.close")).Cursor(ui.CursorPointer).Focusable().Draw(drawCross(t.InkSoft))
		if cl.Hovered() {
			cl.Background(t.Sunken)
		}
		if cl.Clicked() {
			fv.open = false
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
			ui.Text(c, a.L.T("file.failed")).FontSize(t.MD).TextColor(t.InkSoft)
			if a.button(c, a.L.T("media.retry"), btnSecondary, t.ControlSM, t.Bg) {
				a.loadFile(fv)
			}
		})
		return
	case fv.loading:
		ui.Column(c.Key("fv-loading")).Fill().AlignItems(ui.Center).Justify(ui.Center).Children(func() {
			ui.Text(c, a.L.T("file.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		})
		return
	}
	cutNote := func() {
		if fv.cut || fv.more {
			msg := a.L.T("file.cut", protocol.SizeWords(protocol.FileViewBytes))
			if fv.more && !fv.cut {
				msg = a.L.T("file.rowsCut", protocol.FileViewRows)
			}
			ui.Text(c.Key("fv-cut"), msg).FontSize(t.SM).TextColor(t.InkSoft).Padding(t.S2+2, t.S4).Radius(t.RadiusSM).Background(t.Sunken).TextAlign(ui.Center)
		}
	}
	if kind == protocol.FileText || fv.source {
		if fv.st == nil {
			fv.st = &editor.State{Buffer: editor.NewBuffer(fv.text), ReadOnly: true}
			fv.st.Buffer.SetLanguage(editor.LanguageFor(fv.ref.Name))
		}
		ui.Column(c.Key("fv-text")).Fill().Background(t.SurfaceRaised).Children(func() {
			editor.View(c, fv.st).Grow(1).MinHeight(0)
			if fv.cut {
				ui.Box(c).Padding(t.S2, t.S4).Children(cutNote)
			}
		})
		return
	}
	if fv.md == nil {
		th := a.markdownTheme(t.MD+1, a.leading(1.6))
		th.Headings[0].Size, th.Headings[1].Size, th.Headings[2].Size = 1.75, 1.3, 1.12
		fv.md = &markdown.Options{Theme: th}
	}
	src := fv.text
	if kind == protocol.FileTable {
		src = fv.table
	}
	ui.Scroll(c.Key("fv-doc")).Fill().Children(func() {
		ui.Row(c).Justify(ui.Center).Padding(t.S5+4, t.S5+4, t.S6+8, t.S5+4).Children(func() {
			ui.Column(c).Grow(1).MaxWidth(680).MinWidth(0).Gap(t.S4).Children(func() {
				markdown.View(c, src, fv.md)
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
			ui.Text(c, strings.ToUpper(strings.TrimPrefix(fileExt(fileSaveName(fv.ref)), "."))).FontSize(t.XS).FontWeight(800).TextColor(t.InkSoft)
		})
		ui.Text(c, a.L.T("file.none.mac")).FontSize(t.MD).TextColor(t.InkSoft).MaxWidth(380).TextAlign(ui.Center)
		ui.Row(c).Gap(t.S3).Children(func() {
			if a.button(c, a.L.T("file.save"), btnSecondary, t.ControlMD, t.Bg) {
				a.saveFileCopy(fv.ref)
			}
			if a.button(c, a.L.T("file.openMac"), btnPrimary, t.ControlMD, t.Bg) {
				ref := fv.ref
				a.fileBytes(ref, func(data []byte) {
					if err := a.Media.OpenLocal(fileSaveName(ref), data); err != nil {
						a.toast(a.L.T("file.failed"))
					}
				})
			}
		})
	})
}

// fileBar: 来自 {task}; then Copy (text) and Save a copy.
func (a *App) fileBar(c *ui.Context, fv *fileViewState, kind string) {
	t := a.T
	ui.Row(c.Key("fv-bar")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S2+2, t.S4, t.S3, t.S4).Background(t.Surface).
		BorderWidth(1, 0, 0, 0).BorderColor(t.Line).Children(func() {
		if ref := fv.ref; ref.From != nil {
			if title := a.S.Task(ref.From.TaskID).Title(); title != "" {
				l := ui.Text(c.Key("fv-from"), a.L.T("media.from", title)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1).
					Cursor(ui.CursorPointer).Role(ui.RoleLink).Focusable().Label(a.L.T("media.from", title))
				if l.Hovered() {
					l.TextColor(t.Ink)
				}
				if l.Clicked() {
					fv.open = false
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
		if kind != protocol.FileNone {
			if a.button(c, a.L.T("file.save"), btnSecondary, t.ControlSM, t.Surface) {
				a.saveFileCopy(fv.ref)
			}
		}
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
		case protocol.FileTable:
			in.MoveTo(pt(8.6, 11.2)).LineTo(pt(15.4, 11.2)).LineTo(pt(15.4, 17.8)).LineTo(pt(8.6, 17.8)).Close()
			in.MoveTo(pt(8.6, 14.5)).LineTo(pt(15.4, 14.5)).MoveTo(pt(12, 11.2)).LineTo(pt(12, 17.8))
		default:
			return
		}
		p.StrokePath(&in, 1.35*s, col)
	}
}
