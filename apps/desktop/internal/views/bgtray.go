package views

// D521: 后台 / In the background, over the opened task's composer: what its
// agent still runs beside its turn (background shells, subagents, Monitor
// watches, jobs), one row each with its drawn kind, its own words, how long
// it has run and 停下 / Stop where its agent can stop it; what ended folds
// under {n} 个做完了 / {n} done, each opening to its exit and its output's
// last lines. Quiet and dense: the muted ink, times in mono, nothing that
// glows. Open by default; folded is this Mac's (hints). Built only from the
// shared trayRow and iconButton. The list is core's (TaskCard.background,
// folded from the Log), the same the web draws (apps/web/src/bg-tray.tsx).

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// bgSpan is how long, in the tray's few characters: 27 秒 / 27s, 12 分 /
// 12m, 1 小时 20 分 / 1h 20m.
func (a *App) bgSpan(d time.Duration) string {
	s := int(d / time.Second)
	if s < 0 {
		s = 0
	}
	if s < 60 {
		return a.L.T("bg.s", s)
	}
	m := s / 60
	if m < 60 {
		return a.L.T("bg.m", m)
	}
	if m%60 != 0 {
		return a.L.T("bg.h", m/60, m%60)
	}
	return a.L.T("bg.h0", m/60)
}

// bgState is a finished one's state in a word: its exit code when it
// failed with one.
func (a *App) bgState(j protocol.BgJob) string {
	if j.State == "failed" {
		if j.Exit != nil && *j.Exit != 0 {
			return a.L.T("bg.st.exit", *j.Exit)
		}
		return a.L.T("bg.st.failed")
	}
	return a.L.T("bg.st." + j.State)
}

func (a *App) bgTitle(j protocol.BgJob) string {
	if j.Title != "" {
		return j.Title
	}
	return a.L.T("bg.untitled." + j.Kind)
}

// bgMark is the kind's mark: the transcript's own (a prompt for a shell,
// the hand-off arrow for a subagent), an eye for a watch.
func bgMark(kind string) func(ui.Color) func(*ui.Painter, ui.Rect) {
	switch kind {
	case "shell":
		return drawPrompt
	case "agent":
		return drawArrow
	case "watch":
		return drawEye
	}
	return drawDot
}

// StopBackground asks the home to stop one job through its agent's own
// stop; the row says 在停… until its end arrives.
func (a *App) StopBackground(taskID, job string) {
	if a.bgStopping == nil {
		a.bgStopping = map[string]bool{}
	}
	k := taskID + "|" + job
	if a.bgStopping[k] {
		return
	}
	a.bgStopping[k] = true
	delete(a.bgRefused, taskID)
	a.send(protocol.TaskAction{T: "task_action", TaskID: taskID, Action: "stop_background", Job: job})
}

// bgRefusedFor: the agent refused a stop of this task's: the rows run on,
// and the tray says so for a moment.
func (a *App) bgRefusedFor(taskID string) {
	for k := range a.bgStopping {
		if strings.HasPrefix(k, taskID+"|") {
			delete(a.bgStopping, k)
		}
	}
	if a.bgRefused == nil {
		a.bgRefused = map[string]time.Time{}
	}
	a.bgRefused[taskID] = a.Now()
}

// bgTray is the tray over the task's composer, or nothing when its agent
// never ran anything in the background.
func (a *App) bgTray(c *ui.Context, task *store.Task) {
	if task.Card == nil || task.Card.Background == nil || len(task.Card.Background.Jobs) == 0 {
		return
	}
	t := a.T
	bg := task.Card.Background
	var running, done []protocol.BgJob
	for _, j := range bg.Jobs {
		if j.State == "running" {
			running = append(running, j)
		} else {
			done = append([]protocol.BgJob{j}, done...) // newest first
			delete(a.bgStopping, task.ID+"|"+j.ID)
		}
	}
	now := a.Now()
	open := !a.Local.BgTrayShut()
	var since time.Time
	young := false
	for _, j := range running {
		at := store.ParseTime(j.At)
		if since.IsZero() || at.Before(since) {
			since = at
		}
		if now.Sub(at) < 61*time.Second {
			young = true
		}
	}
	if len(running) > 0 {
		if young {
			c.After(time.Second)
		} else {
			c.After(15 * time.Second)
		}
	}
	head := a.L.T("bg.head.done", bg.Done)
	if len(running) > 0 {
		head = a.L.T("bg.head", len(running))
	}
	doneKey := "bgdone:" + task.ID
	doneOpen := a.open[doneKey]
	// Only finished ones: the head is their fold, folded until opened here
	// (what ended needs no room while nothing runs).
	if len(running) == 0 {
		open = doneOpen
	}
	tray := ui.Column(c.Key("bgtray:"+task.ID)).Padding(t.S1, 0).Radius(t.RadiusMD).Background(t.SurfaceSunken).
		Border(1, t.LineSoft).MinWidth(0).Label(head)
	a.enter(c, tray)
	tray.Children(func() {
		hl := trayLine{key: "head", words: head, head: true, open: &open}
		if !since.IsZero() {
			hl.time = a.bgSpan(now.Sub(since))
		}
		if len(running) == 0 {
			hl.mark, hl.markInk = drawCheck, t.Done.Ink
		}
		var headPressed bool
		ui.Column(c.Key("bghead")).Padding(0, t.S1).MinWidth(0).Children(func() { headPressed = a.trayRow(c, hl) })
		if headPressed {
			if len(running) == 0 {
				if a.open == nil {
					a.open = map[string]bool{}
				}
				a.open[doneKey] = !doneOpen
			} else {
				a.Local.SetBgTrayShut(open)
			}
		}
		if refused, ok := a.bgRefused[task.ID]; ok {
			if now.Sub(refused) < 6*time.Second {
				c.After(time.Second)
				ui.Row(c.Key("bgrefused")).Padding(0, t.S3+t.S1).MinHeight(t.ChipSM).AlignItems(ui.Center).Role(ui.RoleStatus).Children(func() {
					uiText(c, a.L.T("bg.stop.failed")).FontSize(t.XS).TextColor(t.Failed.Ink).SingleLine().MinWidth(0).Shrink(1)
				})
			} else {
				delete(a.bgRefused, task.ID)
			}
		}
		if !open {
			return
		}
		ui.Box(c.Key("bgrule")).Height(1).Background(t.LineSoft).Margin(t.S1, 0)
		ui.Scroll(c.Key("bgrows")).MaxHeight(320).Padding(0, t.S1).MinWidth(0).Children(func() {
			for _, j := range running {
				j := j
				title := a.bgTitle(j)
				stopping := a.bgStopping[task.ID+"|"+j.ID]
				r := trayLine{key: "r:" + j.ID, words: title, mark: bgMark(j.Kind), markAbout: a.L.T("bg.kind." + j.Kind), reserve: true}
				if stopping {
					r.state = a.L.T("bg.stopping")
				} else {
					r.time = a.bgSpan(now.Sub(store.ParseTime(j.At)))
				}
				if j.Stop && !stopping {
					r.act = func() {
						if a.iconButton(c, spoken(a.L, a.L.T("bg.stop"), title), t.ControlSM, btnText, drawStopSmall) {
							a.StopBackground(task.ID, j.ID)
						}
					}
				}
				a.trayRow(c, r)
			}
			if len(running) > 0 && bg.Done > 0 {
				if a.trayRow(c, trayLine{key: "fold", words: a.L.T("bg.done", bg.Done), mark: drawCheck, markInk: t.Done.Ink, open: &doneOpen, reserve: true}) {
					if a.open == nil {
						a.open = map[string]bool{}
					}
					a.open[doneKey] = !doneOpen
				}
			}
			if !doneOpen {
				return
			}
			for _, j := range done {
				j := j
				tailKey := "bgtail:" + task.ID + ":" + j.ID
				tailOpen := a.open[tailKey]
				r := trayLine{key: "d:" + j.ID, words: a.bgTitle(j), mark: bgMark(j.Kind), markAbout: a.L.T("bg.kind." + j.Kind), open: &tailOpen, reserve: true}
				// A word only where it did not simply end well (a failure, a
				// stop, unknown): 22 rows of 做完了 would say nothing.
				if j.State != "done" {
					r.state = a.bgState(j)
				}
				if j.State == "failed" {
					r.stateInk = t.Failed.Ink
				}
				if end := store.ParseTime(j.EndedAt); !end.IsZero() {
					r.time = a.bgSpan(end.Sub(store.ParseTime(j.At)))
				}
				if a.trayRow(c, r) {
					if a.open == nil {
						a.open = map[string]bool{}
					}
					a.open[tailKey] = !tailOpen
				}
				if tailOpen {
					a.bgTail(c, j)
				}
			}
		})
	})
}

// bgTail is a finished one's output's last lines, under its row.
func (a *App) bgTail(c *ui.Context, j protocol.BgJob) {
	t := a.T
	ui.Column(c.Key("tail:"+j.ID)).Gap(t.S1).Padding(0, t.S3, t.S2, t.S3+16+t.S2).MinWidth(0).Children(func() {
		uiText(c, a.L.T("bg.tail")).FontSize(t.XS).TextColor(t.InkMuted)
		if strings.TrimSpace(j.Tail) == "" {
			uiText(c, a.L.T("bg.tail.none")).FontSize(t.XS).TextColor(t.InkMuted)
			return
		}
		ui.Column(c).Padding(t.S2, t.S3).Radius(t.RadiusXS).Background(t.Surface).MinWidth(0).Children(func() {
			uiText(c, j.Tail).Font(t.Mono).FontSize(t.XS).TextColor(t.InkSoft).Selectable().MaxLines(8).MinWidth(0)
		})
	})
}

// drawEye is an eye: it watches an output (Claude Code's Monitor).
func drawEye(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-6.2, cy)
		m.QuadTo(cx, cy-7.4, cx+6.2, cy)
		m.QuadTo(cx, cy+7.4, cx-6.2, cy)
		m.Close()
		m.Circle(cx, cy, 1.9)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawStopSmall is a small rounded square: stop this one (a tray row's,
// quieter than the composer's Stop of the whole turn).
func drawStopSmall(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		p.Fill(ui.Rect{X: cx - 4.5, Y: cy - 4.5, W: 9, H: 9}, col.Mix(ui.Transparent, 0.35), 2)
	}
}
