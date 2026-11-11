package views

// D214: 工作台 / Workbench, the opened task's control surface beside its
// conversation, as on the phone and the web (apps/web/src/workbench.tsx).
// Hidden by default; the 工作台 button in the task's header, or ⌥⌘B, shows
// it as a column at the right. Its pages show only when they have
// something: 改动 / Changes (each file's diff, 改回去 / Undo), 文件 / Files
// (the working copy, a file in the editor, saved over the version opened),
// 预览 / Preview (the pages it serves, opened through the home's preview
// address), 浏览器 / Browser (the live view of Ducter's browser). Everything
// is read through the home (`wb` frames), so it works the same for a task on
// another computer and for a home on a server.

import (
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/editor"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// benchWidth is the column's width: wide enough for a diff, the
// conversation keeps the rest.
const benchWidth = 520

type benchFile struct {
	path     string
	answer   *protocol.WbAnswer
	err      string
	st       *editor.State
	saving   bool
	conflict bool
}

type benchTask struct {
	changes  *protocol.WbAnswer
	sel      string
	diff     map[string]*editor.DiffState
	diffErr  map[string]string
	revert   string
	dirs     map[string]*protocol.WbAnswer
	expanded map[string]bool
	file     *benchFile
	ports    []protocol.WbPort
	asked    bool
}

type benchState struct {
	open  bool
	tab   string
	seq   int
	tasks map[string]*benchTask
	wait  map[string]func(f protocol.ServerFrame)
	// toast and openURL wait for the next frame (an answer lands outside one).
	toast, openURL string
}

func (a *App) benchOf(id string) *benchTask {
	if a.bench.tasks == nil {
		a.bench.tasks = map[string]*benchTask{}
		a.bench.wait = map[string]func(protocol.ServerFrame){}
	}
	b := a.bench.tasks[id]
	if b == nil {
		b = &benchTask{diff: map[string]*editor.DiffState{}, diffErr: map[string]string{}, dirs: map[string]*protocol.WbAnswer{}, expanded: map[string]bool{"": true}}
		a.bench.tasks[id] = b
	}
	return b
}

// wbAsk sends one op; done hears its answer (nil and the refusal on a no).
func (a *App) wbAsk(taskID string, req protocol.WbRequest, done func(ans *protocol.WbAnswer, code, refusal string)) {
	a.benchOf(taskID)
	a.bench.seq++
	id := "wbm" + strconv.Itoa(a.bench.seq)
	a.bench.wait[id] = func(f protocol.ServerFrame) {
		if f.OK && f.Answer != nil {
			done(f.Answer, "", "")
			return
		}
		done(nil, f.WbError, a.wbRefusal(f.WbError, f.Message))
	}
	a.send(protocol.WbReq{T: "wb", ID: id, TaskID: taskID, Req: req})
}

func (a *App) wbRefusal(code, message string) string {
	if code == "failed" || code == "" {
		if message != "" {
			return a.L.T("wb.err.failed", message)
		}
		return a.L.T("wb.err.generic")
	}
	return a.L.T("wb.err." + code)
}

// wbFrame is a `wb` answer (Applied hands it here).
func (a *App) wbFrame(f protocol.ServerFrame) {
	if w := a.bench.wait[f.ID]; w != nil {
		delete(a.bench.wait, f.ID)
		w(f)
	}
}

func benchHasFiles(task *store.Task) bool {
	k := task.Place().Kind
	return k == "repo" || k == "folder"
}

// benchTabs are the pages that have something for this task.
func (a *App) benchTabs(task *store.Task) []string {
	b := a.benchOf(task.ID)
	var out []string
	if benchHasFiles(task) {
		out = append(out, "changes", "files")
	}
	if len(b.ports) > 0 {
		out = append(out, "preview")
	}
	if !finished(task) && a.S.Browsing(task.ID) != "" {
		out = append(out, "browser")
	}
	return out
}

func (a *App) benchShown(task *store.Task) bool {
	return a.bench.open && len(a.benchTabs(task)) > 0
}

// ToggleBench shows or hides the workbench of the task that is open (⌥⌘B).
func (a *App) ToggleBench() {
	if a.Route != RouteTask {
		return
	}
	a.bench.open = !a.bench.open
	if a.bench.open {
		if task := a.S.Task(a.TaskID); task != nil {
			a.benchLoad(task)
		}
	}
}

// benchLoad reads what the page shown needs, and the pages it serves.
func (a *App) benchLoad(task *store.Task) {
	b := a.benchOf(task.ID)
	id := task.ID
	a.wbAsk(id, protocol.WbRequest{Op: "ports"}, func(ans *protocol.WbAnswer, _, _ string) {
		if ans != nil {
			b.ports = ans.Ports
		}
	})
	if !benchHasFiles(task) {
		return
	}
	a.wbAsk(id, protocol.WbRequest{Op: "changes"}, func(ans *protocol.WbAnswer, _, _ string) {
		if ans != nil {
			b.changes = ans
		}
	})
	for p := range b.expanded {
		a.benchDir(id, p)
	}
}

func (a *App) benchDir(id, path string) {
	b := a.benchOf(id)
	a.wbAsk(id, protocol.WbRequest{Op: "files", Path: path}, func(ans *protocol.WbAnswer, _, _ string) {
		if ans != nil {
			b.dirs[path] = ans
		}
	})
}

func (a *App) benchDiff(id, path string) {
	b := a.benchOf(id)
	a.wbAsk(id, protocol.WbRequest{Op: "diff", Path: path}, func(ans *protocol.WbAnswer, code, refusal string) {
		if ans == nil {
			b.diffErr[path] = refusal
			return
		}
		delete(b.diffErr, path)
		if ans.Binary || ans.Patch == "" {
			b.diff[path] = nil
			return
		}
		fps, err := editor.ParsePatch(ans.Patch)
		if err != nil || len(fps) == 0 {
			b.diff[path] = nil
			return
		}
		d := &editor.DiffState{Layout: editor.DiffUnified, FitContent: true, NoScrollbars: true}
		d.SetPatch(fps[0])
		b.diff[path] = d
	})
}

func (a *App) benchOpenFile(id, path string) {
	b := a.benchOf(id)
	f := &benchFile{path: path}
	b.file = f
	a.wbAsk(id, protocol.WbRequest{Op: "read", Path: path}, func(ans *protocol.WbAnswer, code, refusal string) {
		if ans == nil {
			f.err = refusal
			return
		}
		f.answer = ans
		if ans.Text != nil {
			st := &editor.State{Buffer: editor.NewBuffer(*ans.Text)}
			st.Buffer.SetLanguage(editor.LanguageFor(path))
			f.st = st
		}
	})
}

// benchSave writes the file over the version it was opened at (or, Keep
// mine, over what it is now).
func (a *App) benchSave(id string, f *benchFile, force bool) {
	if f.st == nil || f.answer == nil || f.saving {
		return
	}
	text := f.st.Buffer.String()
	f.saving = true
	write := func(base string) {
		a.wbAsk(id, protocol.WbRequest{Op: "write", Path: f.path, Text: text, Base: base}, func(ans *protocol.WbAnswer, code, refusal string) {
			f.saving = false
			if ans == nil {
				if code == "conflict" {
					f.conflict = true
					return
				}
				f.err = refusal
				return
			}
			f.conflict = false
			f.answer.Version = ans.Version
			f.st.Buffer.MarkSaved()
			a.benchToast(a.L.T("wb.saved"))
			a.benchLoad(a.S.Task(id))
		})
	}
	if !force {
		write(f.answer.Version)
		return
	}
	a.wbAsk(id, protocol.WbRequest{Op: "read", Path: f.path}, func(ans *protocol.WbAnswer, code, refusal string) {
		if ans == nil {
			f.saving = false
			f.err = refusal
			return
		}
		write(ans.Version)
	})
}

// benchToast is said on the next frame (answers land outside one).
func (a *App) benchToast(s string) { a.bench.toast = s }

// ---------- the column ----------

func (a *App) workbench(c *ui.Context, task *store.Task) {
	t := a.T
	tabs := a.benchTabs(task)
	if !contains(tabs, a.bench.tab) {
		a.bench.tab = tabs[0]
	}
	b := a.benchOf(task.ID)
	if !b.asked {
		b.asked = true
		a.benchLoad(task)
	}
	if a.bench.toast != "" {
		c.AddToast(ui.Toast{ID: "wb", Title: a.bench.toast})
		a.bench.toast = ""
	}
	if a.bench.openURL != "" {
		c.OpenURL(a.bench.openURL)
		a.bench.openURL = ""
	}
	ui.Column(c.Key("bench")).Width(benchWidth).Shrink(0).MinHeight(0).Background(t.BgDeep).
		BorderWidth(0, 0, 0, 1).BorderColor(t.Line).Children(func() {
		// The strip of pages, on a sunken track; the one shown raised.
		ui.Row(c.Key("bench-head")).Padding(t.S3, t.S4).Gap(t.S2).AlignItems(ui.Center).
			BorderWidth(0, 0, 1, 0).BorderColor(t.Line).Children(func() {
			ui.Row(c.Key("bench-tabs")).Gap(t.S1).Padding(t.S1).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
				for _, k := range tabs {
					on := k == a.bench.tab
					label := a.L.T("wb.tab." + k)
					if k == "changes" && b.changes != nil && len(b.changes.Files) > 0 {
						label += fmt.Sprintf("  %d", len(b.changes.Files)+b.changes.More)
					}
					tb := ui.Box(c.Key("tab:"+k)).Padding(t.S2, t.S3).Radius(t.RadiusSM).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable()
					if on {
						tb.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
					}
					tb.Children(func() {
						w := ui.Text(c, label).FontSize(t.SM).TextColor(t.InkMuted)
						if on {
							w.FontWeight(800).TextColor(t.Ink)
						} else {
							w.FontWeight(600)
						}
					})
					if tb.Clicked() {
						a.bench.tab = k
						a.benchLoad(task)
					}
				}
			})
			ui.Spacer(c)
			if a.button(c, a.L.T("wb.close"), btnText, t.ControlSM, t.BgDeep) {
				a.bench.open = false
			}
		})
		ui.Scroll(c.Key("bench-page:" + a.bench.tab)).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S4).Gap(t.S3).Children(func() {
				switch a.bench.tab {
				case "changes":
					a.benchChanges(c, task, b)
				case "files":
					a.benchFiles(c, task, b)
				case "preview":
					a.benchPreview(c, task, b)
				case "browser":
					a.benchBrowser(c, task)
				}
			})
		})
	})
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func (a *App) benchNote(c *ui.Context, s string) {
	ui.Text(c, s).FontSize(a.T.SM).TextColor(a.T.InkMuted)
}

func (a *App) benchCounts(c *ui.Context, adds, dels int, binary bool) {
	t := a.T
	if binary {
		ui.Text(c, a.L.T("wb.status.binary")).FontSize(t.XS).TextColor(t.InkMuted)
		return
	}
	if adds > 0 {
		ui.Text(c, fmt.Sprintf("+%d", adds)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Done.Ink)
	}
	if dels > 0 {
		ui.Text(c, fmt.Sprintf("−%d", dels)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Failed.Ink)
	}
}

func (a *App) benchBack(c *ui.Context, label string) bool {
	t := a.T
	r := ui.Row(c.Key("back:" + label)).Gap(t.S1).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable()
	r.Children(func() {
		ui.Text(c, "‹").FontSize(t.MD).FontWeight(700).TextColor(t.InkSoft).AccessHidden(true)
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
	})
	return r.Clicked()
}

func (a *App) benchChanges(c *ui.Context, task *store.Task, b *benchTask) {
	t := a.T
	ch := b.changes
	if ch == nil {
		a.benchNote(c, a.L.T("task.loading"))
		return
	}
	if b.sel != "" {
		a.benchDiffView(c, task, b)
		return
	}
	if len(ch.Files) == 0 {
		a.benchNote(c, a.L.T("wb.changes.none"))
		return
	}
	adds, dels := 0, 0
	for _, f := range ch.Files {
		adds += f.Adds
		dels += f.Dels
	}
	ui.Row(c.Key("sum")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("wb.changes.files", len(ch.Files)+ch.More)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink)
		a.benchCounts(c, adds, dels, false)
		ui.Spacer(c)
		base := a.L.T("wb.changes.folder")
		if ch.Kind == "repo" && ch.Base != "" {
			base = a.L.T("wb.changes.base", ch.Base)
		}
		ui.Text(c, base).FontSize(t.XS).TextColor(t.InkMuted)
	})
	ui.Column(c.Key("files")).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Clip().
		Dividers(1, t.LineSoft).Children(func() {
		for _, f := range ch.Files {
			f := f
			row := ui.Row(c.Key("chg:"+f.Path)).Gap(t.S3).Padding(t.S3, t.S4).AlignItems(ui.Center).Cursor(ui.CursorPointer).
				Role(ui.RoleButton).Label(f.Path).Focusable()
			if row.Hovered() {
				row.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
			}
			row.Children(func() {
				ink := t.Working.Ink
				switch f.Status {
				case "added":
					ink = t.Done.Ink
				case "deleted":
					ink = t.Failed.Ink
				}
				ui.Box(c).Size(6, 6).Radius(3).Background(ink).Shrink(0)
				ui.Text(c, f.Path).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Ink).Grow(1).MinWidth(0).SingleLine()
				switch f.Status {
				case "added":
					ui.Text(c, a.L.T("wb.status.added")).FontSize(t.XS).TextColor(t.InkMuted)
				case "deleted":
					ui.Text(c, a.L.T("wb.status.deleted")).FontSize(t.XS).TextColor(t.InkMuted)
				}
				a.benchCounts(c, f.Adds, f.Dels, f.Binary)
			})
			if row.Clicked() {
				b.sel = f.Path
				a.benchDiff(task.ID, f.Path)
			}
		}
	})
	if ch.More > 0 {
		a.benchNote(c, a.L.T("wb.changes.more", ch.More))
	}
}

func (a *App) benchDiffView(c *ui.Context, task *store.Task, b *benchTask) {
	t := a.T
	path := b.sel
	var change *protocol.WbChange
	for i := range b.changes.Files {
		if b.changes.Files[i].Path == path {
			change = &b.changes.Files[i]
		}
	}
	if a.benchBack(c, a.L.T("wb.changes.back")) {
		b.sel, b.revert = "", ""
		return
	}
	ui.Row(c.Key("dhead")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		ui.Text(c, path).Font(t.Mono).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).Grow(1).MinWidth(0).SingleLine()
		if change != nil {
			a.benchCounts(c, change.Adds, change.Dels, change.Binary)
		}
	})
	ui.Row(c.Key("dacts")).Gap(t.S2).Children(func() {
		if change == nil || change.Status != "deleted" {
			if a.button(c, a.L.T("wb.open.file"), btnText, t.ControlSM, t.BgDeep) {
				a.bench.tab = "files"
				a.benchOpenFile(task.ID, path)
			}
		}
		if change != nil && task.Attention() != protocol.Working && b.revert != path {
			if a.button(c, a.L.T("wb.revert"), btnSecondary, t.ControlSM, t.BgDeep) {
				b.revert = path
			}
		}
	})
	if b.revert == path {
		ui.Column(c.Key("confirm")).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).Children(func() {
			ui.Text(c, a.L.T("wb.revert.ask", path)).FontSize(t.SM).TextColor(t.Ink)
			ui.Row(c).Gap(t.S2).Children(func() {
				ui.Spacer(c)
				if a.button(c, a.L.T("wb.cancel"), btnText, t.ControlSM, t.Surface) {
					b.revert = ""
				}
				if a.button(c, a.L.T("wb.revert.go"), btnPrimary, t.ControlSM, t.Surface) {
					b.revert = ""
					id := task.ID
					a.wbAsk(id, protocol.WbRequest{Op: "revert", Path: path}, func(ans *protocol.WbAnswer, code, refusal string) {
						if ans == nil {
							a.benchToast(refusal)
							return
						}
						a.benchToast(a.L.T("wb.revert.done", path))
						b.sel = ""
						a.benchLoad(a.S.Task(id))
					})
				}
			})
		})
	}
	if e := b.diffErr[path]; e != "" {
		a.benchNote(c, e)
		return
	}
	d, ok := b.diff[path]
	switch {
	case !ok:
		a.benchNote(c, a.L.T("task.loading"))
	case d == nil:
		a.benchNote(c, a.L.T("wb.diff.same"))
	default:
		ui.Column(c.Key("diffbox")).Radius(t.RadiusMD).Background(t.Surface).Clip().BorderWidth(1, 1, 1, 1).BorderColor(t.Line).Children(func() {
			editor.DiffView(c, d).FillWidth()
		})
	}
}

func (a *App) benchFiles(c *ui.Context, task *store.Task, b *benchTask) {
	t := a.T
	if f := b.file; f != nil {
		if a.benchBack(c, a.L.T("wb.files.root")) {
			b.file = nil
			return
		}
		ui.Row(c.Key("fhead")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Text(c, f.path).Font(t.Mono).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).Grow(1).MinWidth(0).SingleLine()
			if f.st != nil {
				if f.st.Buffer.Modified() {
					ui.Text(c, a.L.T("wb.unsaved")).FontSize(t.XS).FontWeight(700).TextColor(t.Waiting.Ink)
				}
				label := a.L.T("wb.save")
				if f.saving {
					label = a.L.T("wb.saving")
				}
				if (a.button(c, label, btnPrimary, t.ControlSM, t.BgDeep) || c.Shortcut(ui.Cmd, ui.KeyS)) && f.st.Buffer.Modified() {
					a.benchSave(task.ID, f, false)
				}
			}
		})
		if f.conflict {
			ui.Column(c.Key("conflict")).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).Children(func() {
				ui.Text(c, a.L.T("wb.conflict")).FontSize(t.SM).TextColor(t.Ink)
				ui.Row(c).Gap(t.S2).Children(func() {
					ui.Spacer(c)
					if a.button(c, a.L.T("wb.conflict.theirs"), btnText, t.ControlSM, t.Surface) {
						a.benchOpenFile(task.ID, f.path)
					}
					if a.button(c, a.L.T("wb.conflict.mine"), btnPrimary, t.ControlSM, t.Surface) {
						a.benchSave(task.ID, f, true)
					}
				})
			})
		} else if f.st != nil && f.st.Buffer.Modified() && task.Attention() == protocol.Working {
			a.benchNote(c, a.L.T("wb.working"))
		}
		switch {
		case f.err != "":
			a.benchNote(c, f.err)
		case f.answer == nil:
			a.benchNote(c, a.L.T("task.loading"))
		case f.answer.TooBig:
			a.benchNote(c, a.L.T("wb.file.big", fmt.Sprintf("%.1f MB", float64(f.answer.Size)/1024/1024)))
		case f.st == nil:
			a.benchNote(c, a.L.T("wb.file.binary"))
		default:
			ui.Column(c.Key("edbox")).Height(560).Radius(t.RadiusMD).Background(t.Surface).Clip().BorderWidth(1, 1, 1, 1).BorderColor(t.Line).Children(func() {
				editor.View(c, f.st).Fill()
			})
		}
		return
	}
	changed := map[string]string{}
	if b.changes != nil {
		for _, ch := range b.changes.Files {
			changed[ch.Path] = ch.Status
		}
	}
	root := b.dirs[""]
	if root == nil {
		a.benchNote(c, a.L.T("task.loading"))
		return
	}
	if len(root.Entries) == 0 {
		a.benchNote(c, a.L.T("wb.files.empty"))
		return
	}
	var walk func(dir string, depth int)
	walk = func(dir string, depth int) {
		l := b.dirs[dir]
		if l == nil {
			return
		}
		entries := append([]protocol.WbEntry(nil), l.Entries...)
		sort.SliceStable(entries, func(i, j int) bool { return (entries[i].Kind == "d") && entries[j].Kind != "d" })
		for _, e := range entries {
			p := e.Name
			if dir != "" {
				p = dir + "/" + e.Name
			}
			p, e := p, e
			row := ui.Row(c.Key("node:"+p)).Gap(t.S2).Padding(t.S1, t.S2, t.S1, t.S2+float32(depth)*16).AlignItems(ui.Center).
				Radius(t.RadiusSM).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(p).Focusable()
			if row.Hovered() {
				row.Background(t.SurfaceSunken)
			}
			row.Children(func() {
				mark := " "
				if e.Kind == "d" {
					mark = "›"
				}
				ui.Text(c, mark).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Rotate(map[bool]float32{true: 90, false: 0}[b.expanded[p]]).Width(10).AccessHidden(true)
				ink := t.Ink
				switch changed[p] {
				case "added":
					ink = t.Done.Ink
				case "modified", "renamed":
					ink = t.Working.Ink
				case "deleted":
					ink = t.Failed.Ink
				}
				w := ui.Text(c, e.Name).Font(t.Mono).FontSize(t.MonoSM).TextColor(ink).Grow(1).MinWidth(0).SingleLine()
				if e.Kind == "d" {
					w.FontWeight(600)
				}
			})
			if row.Clicked() {
				if e.Kind == "d" {
					b.expanded[p] = !b.expanded[p]
					if b.expanded[p] {
						a.benchDir(task.ID, p)
					}
				} else if e.Kind == "f" {
					a.benchOpenFile(task.ID, p)
				}
			}
			if e.Kind == "d" && b.expanded[p] {
				walk(p, depth+1)
			}
		}
	}
	ui.Column(c.Key("tree")).Children(func() { walk("", 0) })
}

// previewURL is the address a preview is at, from the home's own host.
func (a *App) previewURL(ans *protocol.WbAnswer) string {
	host := "127.0.0.1"
	scheme := "http"
	if u, err := url.Parse(a.URL); err == nil && u.Hostname() != "" {
		host = u.Hostname()
		if u.Scheme == "wss" || u.Scheme == "https" {
			scheme = "https"
		}
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	return fmt.Sprintf("%s://%s:%d/__ducter/enter/%s?to=/", scheme, host, ans.PreviewPort, ans.Token)
}

func (a *App) benchPreview(c *ui.Context, task *store.Task, b *benchTask) {
	t := a.T
	where := a.taskComputerName(task)
	for _, p := range b.ports {
		p := p
		ui.Row(c.Key(fmt.Sprintf("page:%d", p.Port))).Gap(t.S3).Padding(t.S3, t.S4).AlignItems(ui.Center).Radius(t.RadiusLG).
			Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Children(func() {
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				title := p.Title
				if title == "" {
					title = fmt.Sprintf("localhost:%d", p.Port)
				}
				ui.Text(c, title).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).SingleLine()
				ui.Text(c, a.L.T("wb.preview.on", where, p.Port)).FontSize(t.XS).TextColor(t.InkMuted)
			})
			if a.button(c, a.L.T("wb.preview.open"), btnSecondary, t.ControlSM, t.Surface) {
				id := task.ID
				a.wbAsk(id, protocol.WbRequest{Op: "preview", Port: p.Port}, func(ans *protocol.WbAnswer, code, refusal string) {
					if ans == nil {
						a.benchToast(refusal)
						return
					}
					a.bench.openURL = a.previewURL(ans)
				})
			}
		})
	}
}

func (a *App) benchBrowser(c *ui.Context, task *store.Task) {
	t := a.T
	a.benchNote(c, a.L.T("wb.browser.idle"))
	if a.button(c, a.L.T("wb.browser.watch"), btnSecondary, t.ControlSM, t.BgDeep) {
		a.OpenWatch(task.ID)
	}
}

// taskComputerName is the computer a task works on, by its name.
func (a *App) taskComputerName(task *store.Task) string {
	d := task.Place().Device
	if d == "" || d == "local" {
		if a.ThisComputer != "" && a.onThisMachine() {
			return a.ThisComputer
		}
		return a.L.T("device.local")
	}
	return d
}
