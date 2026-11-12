package views

// D220: 工作副本 / Working copy in the opened task's title bar, as on the
// web (apps/web/src/task-info.tsx): its branch (or its folder's name) with
// a drawn mark, opening a panel of what a developer checks before acting on
// the work: the computer, the folder (copy its path; open it in the editor
// used last, D198), the branch and the base it came off, the changes
// against that base (opening the workbench's Changes), Open draft PR /
// Merge into {base} as the result has them, and who has worked on it when
// that changed (each switch, D89).

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// midCut keeps a long branch's start and end ("ducter/plano-teste…simulador").
func midCut(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	head := (n - 1) * 55 / 100
	return string(r[:head]) + "…" + string(r[len(r)-(n-1-head):])
}

type bodyAt struct {
	Harness, Model, Effort string
	TS                     string
}

// bodiesOf is who has done the task, oldest first: each body_selected that
// changed who (the first is who started it).
func bodiesOf(task *store.Task) []bodyAt {
	var out []bodyAt
	for _, ev := range task.Events {
		if ev.Kind != protocol.KindBodySelected {
			continue
		}
		var b protocol.BodySelected
		if ev.Decode(&b) != nil {
			continue
		}
		if n := len(out); n > 0 && out[n-1].Harness == b.Harness && out[n-1].Model == b.Model {
			continue
		}
		out = append(out, bodyAt{b.Harness, b.Model, b.Effort, ev.TS})
	}
	return out
}

func (a *App) taskInfo(c *ui.Context, task *store.Task) {
	t := a.T
	p := task.Place()
	if p.Kind != "repo" && p.Kind != "folder" {
		return
	}
	label := lastPath(p.Path)
	if p.Kind == "repo" {
		label = firstNonEmpty(p.Branch, lastPath(p.RepoPath))
	}
	h := a.controlHeight(t.ControlSM)
	b := ui.Row(c.Key("task-info")).Height(h).Padding(0, a.textPad(h)).Gap(t.S1 + 2).Radius(a.buttonRadius(h)).
		AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("info.about") + " · " + label).
		Focusable().Shrink(1).MinWidth(0).Tooltip(label)
	kind := btnText
	if a.infoOpen {
		kind = btnSecondary
	}
	fg := a.buttonLook(c, b, kind, h, t.Chrome)
	b.Children(func() {
		mark := "branch"
		if p.Kind == "folder" {
			mark = "folder"
		}
		a.glyph(c, 14, drawInfoMark(mark, fg))
		ui.Text(c, midCut(label, 30)).Font(t.Mono).FontSize(t.MonoSM).TextColor(fg).SingleLine().AccessHidden(true)
		ui.Box(c).Size(10, 10).Shrink(0).Draw(drawCaret(fg)).AccessHidden(true)
	})
	if b.Clicked() {
		a.infoOpen = !a.infoOpen
	}
	ui.PopoverBase(c, b, &a.infoOpen, func(panel ui.Element) {
		panel.Margin(t.S2, 0, 0, 0).Width(380).Padding(t.S2).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(a.L.T("info.about"))
		a.taskInfoBody(c, task)
	})
}

func (a *App) infoRow(c *ui.Context, key, mark, label string, body func()) {
	t := a.T
	ui.Row(c.Key("info:"+key)).Gap(t.S3).Padding(t.S2+1, t.S2).AlignItems(ui.Start).Children(func() {
		ui.Row(c).Width(96).Shrink(0).Gap(t.S1 + 3).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 14, drawInfoMark(mark, t.InkMuted))
			ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine()
		})
		ui.Column(c).Grow(1).MinWidth(0).Gap(3).Children(body)
	})
}

func (a *App) taskInfoBody(c *ui.Context, task *store.Task) {
	t := a.T
	p := task.Place()
	base := firstNonEmpty(p.BaseBranch, "main")
	path := workFolder(p)
	if path == "" {
		path = firstNonEmpty(p.RepoPath, p.Path)
	}
	ui.Column(c.Key("info-rows")).Dividers(1, t.LineSoft).Children(func() {
		a.infoRow(c, "computer", "computer", a.L.T("info.computer"), func() {
			on, _ := a.taskWhere(task)
			ui.Text(c, firstNonEmpty(on, a.taskComputerName(task))).FontSize(t.SM).TextColor(t.Ink)
		})
		if path != "" {
			a.infoRow(c, "folder", "folder", a.L.T("info.folder"), func() {
				ui.Text(c.Key("path"), tildePath(path)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Ink).Selectable().Wrap()
				ui.Row(c).Gap(t.S3).Children(func() {
					copied := a.infoCopied.After(a.Now().Add(-1600 * time.Millisecond))
					word := a.L.T("info.copy")
					if copied {
						word = a.L.T("info.copied")
						c.After(1700 * time.Millisecond)
					}
					if a.quietLink(c.Key("copy"), "info-copy", word, word) {
						c.WriteClipboard(path)
						a.infoCopied = a.Now()
					}
					// D198: the editor used last, one click (the rest in 打开).
					if dir := a.openableFolder(task); dir != "" && len(a.Editors) > 0 {
						e := a.Editors[0]
						label := a.L.T("task.open.editor", e.Name)
						if a.quietLink(c.Key("editor"), "info-editor", label, label) {
							a.infoOpen = false
							a.openFolder(e.App, dir)
						}
					}
				})
			})
		}
		if p.Kind == "repo" && p.Branch != "" {
			a.infoRow(c, "branch", "branch", a.L.T("info.branch"), func() {
				ui.Text(c.Key("branch"), p.Branch).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Ink).Selectable().Wrap()
				ui.Text(c, a.L.T("info.branch.from", base)).FontSize(t.XS).TextColor(t.InkMuted)
			})
		}
		a.infoRow(c, "changes", "changes", a.L.T("info.changes"), func() {
			files, adds, dels := a.infoStat(task)
			if files == 0 {
				ui.Text(c, a.L.T("info.changes.none")).FontSize(t.XS).TextColor(t.InkMuted)
				return
			}
			against := a.L.T("info.changes.folder")
			if p.Kind == "repo" {
				against = a.L.T("info.changes.base", base)
			}
			r := ui.Row(c.Key("info-changes")).Gap(t.S2).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).
				Label(a.L.T("info.changes.open")).Tooltip(a.L.T("info.changes.open")).Focusable()
			r.Children(func() {
				ui.Text(c, against).FontSize(t.SM).TextColor(t.Ink)
				ui.Text(c, a.L.T("info.changes.files", files)).FontSize(t.SM).TextColor(t.InkSoft)
				if adds > 0 {
					ui.Text(c, fmt.Sprintf("+%d", adds)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Done.Ink)
				}
				if dels > 0 {
					ui.Text(c, fmt.Sprintf("−%d", dels)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Failed.Ink)
				}
				a.glyph(c, 10, drawChevron(t.InkMuted, false))
			})
			if r.Clicked() {
				a.infoOpen = false
				a.bench.open, a.bench.tab = true, "changes"
				a.benchLoad(task)
			}
		})
	})
	if p.Kind == "repo" {
		a.infoActs(c, task, base)
	}
	if who := bodiesOf(task); len(who) > 1 {
		ui.Column(c.Key("info-who")).Gap(t.S2).Padding(t.S2+2, t.S2, t.S1, t.S2).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
			ui.Row(c).Gap(t.S1 + 3).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 14, drawInfoMark("who", t.InkMuted))
				ui.Text(c, a.L.T("info.who")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			})
			for i, w := range who {
				last := i == len(who)-1
				ui.Row(c.Key(fmt.Sprintf("who:%d", i))).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					a.coinBox(c, fmt.Sprintf("info-who:%d", i), w.Harness, 18, false, coinStill)
					parts := []string{harnessName(w.Harness)}
					if w.Model != "" {
						parts = append(parts, modelLabel(a.trayHarness(w.Harness), w.Model))
					}
					if w.Effort != "" {
						parts = append(parts, a.effortWord(w.Effort))
					}
					tx := ui.Text(c, strings.Join(parts, " · ")).FontSize(t.SM).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0)
					when := a.L.T("info.who.now")
					if last {
						tx.FontWeight(700)
					} else if ts, err := time.Parse(time.RFC3339Nano, w.TS); err == nil {
						when = ts.Local().Format("15:04")
					}
					ui.Text(c, when).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum")
				})
			}
		})
	}
}

// infoStat is the task's changes: the workbench's live list when it has one,
// else the count kept on its card.
func (a *App) infoStat(task *store.Task) (files, adds, dels int) {
	if ch := a.benchOf(task.ID).changes; ch != nil {
		for _, f := range ch.Files {
			adds += f.Adds
			dels += f.Dels
		}
		return len(ch.Files) + ch.More, adds, dels
	}
	if task.Card == nil {
		return 0, 0, 0
	}
	if d := task.Card.Changes; d != nil {
		return d.Files, d.Adds, d.Dels
	}
	if f := task.Card.Folder; f != nil {
		return f.Added + f.Changed + f.Removed + f.Moved + f.Renamed, 0, 0
	}
	return 0, 0, 0
}

// infoActs are Open draft PR / Merge into {base}, as the result has them,
// or what became of them.
func (a *App) infoActs(c *ui.Context, task *store.Task, base string) {
	t := a.T
	var pr string
	merged := false
	if in := task.Card; in != nil && in.Integrated != nil {
		pr = map[bool]string{true: in.Integrated.Ref}[in.Integrated.Act == "open_pr"]
		merged = in.Integrated.Act == "merge"
	}
	if f := task.Acted; f != nil && f.OK {
		if f.Action == "open_pr" && f.Ref != "" {
			pr = f.Ref
		}
		merged = merged || f.Action == "merge"
	}
	can := finished(task) && task.CanIntegrate() && !merged && task.Acting == ""
	if !(can || task.Acting != "" || pr != "" || merged) {
		return
	}
	ui.Row(c.Key("info-acts")).Gap(t.S2).Justify(ui.End).AlignItems(ui.Center).Padding(t.S2+2, t.S2, t.S1, t.S2).
		BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
		act := func(action string) {
			task.Acting = action
			a.TaskAction(task.ID, action)
		}
		switch {
		case task.Acting != "":
			ui.Text(c, a.L.T("result.acting."+task.Acting, base)).FontSize(t.SM).TextColor(t.InkMuted)
		case merged:
			ui.Text(c, a.L.T("result.merged", base)).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
		default:
			if pr != "" {
				if a.button(c, a.L.T("info.pr.open"), btnSecondary, t.ControlSM, t.Surface) {
					c.OpenURL(pr)
				}
			} else if can && !noRemote(task) && a.buttonFor(c, a.L.T("result.pr"), task.Title(), btnSecondary, t.ControlSM, t.Surface) {
				act("open_pr")
			}
			if can && a.buttonFor(c, a.L.T("result.merge", base), task.Title(), btnPrimary, t.ControlSM, t.Surface) {
				act("merge")
			}
		}
	})
}

// drawInfoMark draws the panel's marks in a 16-unit box: branch, folder,
// computer, changes (a page with a plus), who (two linked dots).
func drawInfoMark(k string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		ox, oy := r.X, r.Y
		P := func(x, y float32) (float32, float32) { return ox + x*s, oy + y*s }
		var m ui.Path
		m.Cap(ui.RoundCap).Join(ui.RoundJoin)
		circle := func(x, y, rad float32) {
			cx, cy := P(x, y)
			m.Circle(cx, cy, rad*s)
		}
		switch k {
		case "branch":
			circle(4.5, 3.6, 1.6)
			circle(4.5, 12.4, 1.6)
			circle(11.5, 5.4, 1.6)
			m.MoveTo(P(4.5, 5.2))
			m.LineTo(P(4.5, 10.8))
			m.MoveTo(P(11.5, 7))
			x1, y1 := P(11.5, 9.6)
			x2, y2 := P(6.1, 11)
			m.QuadTo(x1, y1, x2, y2)
		case "folder":
			roundRect(&m, ox+2*s, oy+3*s, 12*s, 10*s, 1.5*s)
			m.MoveTo(P(2, 5.2))
			m.LineTo(P(7.2, 5.2))
			m.LineTo(P(8.2, 4.2))
		case "computer":
			roundRect(&m, ox+2.5*s, oy+3*s, 11*s, 7.6*s, 1.4*s)
			m.MoveTo(P(1.2, 13))
			m.LineTo(P(14.8, 13))
		case "changes":
			m.MoveTo(P(4, 2.5))
			m.LineTo(P(9.2, 2.5))
			m.LineTo(P(12, 5.3))
			m.LineTo(P(12, 13.5))
			m.LineTo(P(4, 13.5))
			m.Close()
			m.MoveTo(P(8, 6.3))
			m.LineTo(P(8, 9.7))
			m.MoveTo(P(6.3, 8))
			m.LineTo(P(9.7, 8))
			m.MoveTo(P(6.3, 11.3))
			m.LineTo(P(9.7, 11.3))
		case "who":
			circle(5, 5.5, 2)
			circle(11, 10.5, 2)
			m.MoveTo(P(6.6, 7.1))
			m.LineTo(P(9.4, 8.9))
		}
		p.StrokePath(&m, 1.4, col)
	}
}
