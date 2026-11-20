package views

import (
	"math"
	"slices"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// composerTuneState is the one chip under an opened task's composer and
// its card (D387, was D354's two chips): whether the card is open and on
// which side (the effort or the model list), the level moved to and not
// yet switched, the level last switched to from it, the task whose model
// list was last asked for, and the one quiet line said after a choice.
type composerTuneState struct {
	open      bool
	models    bool
	pend      float64
	pendSet   bool
	pendAt    time.Time
	sent      string
	cardFor   string
	askedFor  string
	said      string
	saidFor   string
	saidAt    time.Time
	shownWith string
}

// tuneSaidFor is how long 下一轮起用 {model} / From its next turn… stays.
const tuneSaidFor = 8 * time.Second

// tuneSettle is how long the stepped control rests before it switches
// (the web's SETTLE_MS): a run of arrow keys switches once.
const tuneSettle = 700 * time.Millisecond

// tuneResetTo is 回到默认 / Back to default: the model's own default level,
// when the agent names one and the task is off it (the web's resetTo).
func tuneResetTo(m *protocol.ModelChoice, effort string) string {
	if m.DefaultEffort == "" || !slices.Contains(m.Efforts, m.DefaultEffort) || effort == m.DefaultEffort {
		return ""
	}
	return m.DefaultEffort
}

// tuneMarkBars is how full the chip's level mark is: one to three bars for
// the level's place among the model's (the web's markBars).
func tuneMarkBars(i, n int) int {
	if i < 0 || n <= 0 {
		return 0
	}
	return max(1, int(math.Round(float64(i+1)/float64(n)*3)))
}

// composerTune is the task's model and effort, always in sight under its
// composer while it can still be switched: one chip that reads as a
// phrase (the model in ink, the effort muted with a small level mark),
// opening one card: the effort big, a stepped control over the levels the
// model takes (its live list, D352: a level it doesn't take isn't there),
// 回到默认 / Back to default, and the model as a line with › that turns
// the card to the agent's live models (D387). A choice is D282's in-place
// switch: the running turn finishes as it was, the next one uses the new
// setting, said once in a quiet line. Switching the agent itself stays in
// 换谁来做 / Switch who does it. Nothing where the agent lists no models.
func (a *App) composerTune(c *ui.Context, task *store.Task) {
	if !canSwitch(task) {
		return
	}
	ct := &a.ctune
	if ct.askedFor != task.ID && a.S.Welcomed && a.Status == client.Connected {
		// The agent's own list, read again for each task opened (D352: the
		// home keeps it per agent version, so asking is cheap).
		ct.askedFor, ct.open = task.ID, false
		a.send(protocol.TaskNewOptions{T: "task_new_options"})
	}
	models, model, effort, ok := a.liveTune(task, task.Place().Device)
	if !ok || model == nil {
		return
	}
	t := a.T
	h := task.Harness()
	pick := func(m, e, said string) {
		a.send(protocol.TaskSwitch{T: "task_switch", TaskID: task.ID, Harness: h, Model: m, Effort: e})
		ct.said, ct.saidFor, ct.saidAt = said, task.ID, a.Now()
	}
	levels := model.Efforts
	at := slices.Index(levels, effort)
	if ct.cardFor != task.ID || ct.shownWith != model.ID {
		// Another task, or another model: the card starts again from it.
		ct.cardFor, ct.shownWith, ct.pendSet, ct.sent = task.ID, model.ID, false, ""
	}
	// The level moved to and resting long enough switches; it stays shown
	// as picked until the task's own effort says so.
	commit := func() {
		if !ct.pendSet {
			return
		}
		k := int(ct.pend)
		if k < 0 || k >= len(levels) {
			return
		}
		lv := levels[k]
		was := ct.sent
		if was == "" {
			was = effort
		}
		if lv != was {
			ct.sent = lv
			pick(model.ID, lv, a.L.T("tune.next.effort", a.effortWord(lv)))
		}
	}
	if ct.pendSet && ct.pendAt.Add(tuneSettle).After(a.Now()) {
		c.After(ct.pendAt.Add(tuneSettle).Sub(a.Now()))
	} else {
		commit()
	}
	shown := at
	if ct.pendSet {
		shown = int(ct.pend)
	}
	eWord := a.L.T("newtask.effort.default") // the agent's own, unnamed
	if shown >= 0 && shown < len(levels) {
		eWord = a.effortWord(levels[shown])
	}
	wasOpen := ct.open
	chip := a.tuneChip(c, task, model, levels, shown, eWord)
	if chip.Clicked() {
		ct.open = !ct.open
		ct.models = len(levels) == 0
	}
	if ct.open {
		ui.PopoverBase(c, chip, &ct.open, func(panel ui.Element) {
			panel.Margin(t.S2, 0, 0, 0).Width(300).Padding(t.S4, t.S4, t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).AttachEdgeMargin(12).
				Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft)
			if ct.models {
				panel.Label(a.L.T("newtask.model"))
				a.tuneModels(c, models, model, len(levels) > 0, func(m protocol.ModelChoice) {
					ct.open = false
					pick(m.ID, "", a.L.T("tune.next.model", m.Label))
				})
			} else {
				panel.Label(a.L.T("newtask.effort"))
				a.tuneEffort(c, model, levels, shown, eWord, pick)
			}
			if ct.saidFor == task.ID && ct.said != "" && a.Now().Sub(ct.saidAt) < tuneSaidFor {
				uiText(c.Key("ct-said-in"), ct.said).FontSize(t.XS).TextColor(t.InkMuted).Margin(t.S2, 0, 0, 0).Role(ui.RoleAlert)
			}
		})
	}
	if wasOpen && !ct.open {
		commit()
	}
	if !ct.open && ct.saidFor == task.ID && ct.said != "" {
		if left := tuneSaidFor - a.Now().Sub(ct.saidAt); left > 0 {
			c.After(left)
			uiText(c.Key("ct-said"), ct.said).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).Role(ui.RoleAlert)
		} else {
			ct.said = ""
		}
	}
}

// tuneChip is the one quiet chip: the model in ink, then the effort muted
// with its level mark, a caret; no fill until hovered; open, it stands on
// the surface on its clay ledge.
func (a *App) tuneChip(c *ui.Context, task *store.Task, model *protocol.ModelChoice, levels []string, shown int, eWord string) ui.Element {
	t := a.T
	ct := &a.ctune
	about := spoken(a.L, a.L.T("newtask.model"), model.Label)
	if len(levels) > 0 {
		about = spoken(a.L, a.L.T("newtask.model"), model.Label, a.L.T("newtask.effort"), eWord)
	}
	e := ui.Row(c.Key("ct-chip")).Height(t.ControlSM).Padding(0, t.S2+2).Gap(t.S1 + 3).Radius(t.ControlSM / 2).AlignItems(ui.Center).Shrink(1).MinWidth(0).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(about).Expanded(ct.open).Focusable()
	ink, muted := t.InkSoft, t.InkMuted
	switch {
	case ct.open:
		e.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line)
		ink = t.Ink
	case e.Pressed():
		e.Background(t.Line)
	case e.Hovered():
		e.Background(t.SurfaceSunken)
	}
	e.Children(func() {
		uiText(c, model.Label).FontSize(t.XS).FontWeight(650).TextColor(ink).SingleLine().Shrink(1).MinWidth(0).AccessHidden(true)
		if len(levels) > 0 {
			if bars := tuneMarkBars(shown, len(levels)); bars > 0 {
				ui.Box(c).Size(12, 10).Shrink(0).Draw(drawLevelMark(bars, muted, t.Faint)).AccessHidden(true)
			}
			uiText(c, eWord).FontSize(t.XS).FontWeight(500).TextColor(muted).SingleLine().Shrink(0).AccessHidden(true)
		}
		ui.Box(c).Size(8, 8).Shrink(0).Draw(drawCaret(muted)).AccessHidden(true)
	})
	_ = task
	return e
}

// tuneEffort is the card's effort side: the level big, Back to default, the
// stepped control, its two ends, and the model as a line with ›.
func (a *App) tuneEffort(c *ui.Context, model *protocol.ModelChoice, levels []string, shown int, eWord string, pick func(m, e, said string)) {
	t := a.T
	ct := &a.ctune
	isDefault := shown >= 0 && shown < len(levels) && levels[shown] == model.DefaultEffort
	cur := ""
	if shown >= 0 && shown < len(levels) {
		cur = levels[shown]
	}
	back := tuneResetTo(model, cur)
	ui.Row(c.Key("tp-head")).AlignItems(ui.Start).Gap(t.S2).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			uiText(c, a.L.T("newtask.effort")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				a.heading(c, eWord, 20).TextColor(t.Ink)
				if isDefault {
					uiText(c, a.L.T("newtask.effort.default")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).
						Padding(1, 7).Radius(9).Background(t.SurfaceSunken)
				}
			})
		})
		if back != "" {
			r := ui.Box(c.Key("tp-reset")).Size(32, 32).Radius(16).Shrink(0).Background(t.SurfaceSunken).Center().
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("tune.reset")).Tooltip(a.L.T("tune.reset")).Focusable()
			if r.Hovered() {
				r.Background(t.LineSoft)
			}
			r.Children(func() { a.glyph(c, 16, drawReset(t.InkSoft)) })
			if r.Clicked() {
				ct.pend, ct.pendSet, ct.pendAt, ct.sent = float64(slices.Index(levels, back)), true, time.Time{}, back
				pick(model.ID, back, a.L.T("tune.next.effort", a.effortWord(back)))
			}
		}
	})
	n := len(levels)
	val := float64(max(shown, 0))
	s := ui.SliderBase(c.Key("tp-steps"), &val, 0, float64(n-1)).Step(1).Height(36).Padding(0, 12).Margin(t.S3, 0, 0, 0).
		Cursor(ui.CursorPointer).Label(a.L.T("newtask.effort"))
	vt := eWord
	if isDefault {
		vt = spoken(a.L, eWord, a.L.T("newtask.effort.default"))
	}
	s.Value(vt)
	if s.Changed() {
		ct.pend, ct.pendSet, ct.pendAt = math.Round(val), true, a.Now()
		c.After(tuneSettle)
	}
	f := float32(0)
	if n > 1 && shown >= 0 {
		f = float32(shown) / float32(n-1)
	}
	def := slices.Index(levels, model.DefaultEffort)
	s.Draw(drawSteps(t, n, shown, def, f, s.Focused()))
	ui.Row(c.Key("tp-ends")).Padding(t.S1+2, 2, 0, 2).AccessHidden(true).Children(func() {
		uiText(c, a.effortWord(levels[0])).FontSize(t.XS).TextColor(t.InkMuted)
		ui.Spacer(c)
		uiText(c, a.effortWord(levels[n-1])).FontSize(t.XS).TextColor(t.InkMuted)
	})
	ui.Box(c).Height(1).Background(t.LineSoft).Margin(t.S2+2, 0, 0, 0)
	m := ui.Row(c.Key("tp-model")).MinHeight(40).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, 2, 0, 2).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, a.L.T("tune.change.model"), model.Label)).Focusable()
	m.Children(func() {
		uiText(c, a.L.T("newtask.model")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Shrink(0).AccessHidden(true)
		ui.Spacer(c)
		uiText(c, model.Label).FontSize(t.SM).FontWeight(650).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0).AccessHidden(true)
		a.glyph(c, 10, drawChevron(t.InkMuted, false))
	})
	if m.Clicked() {
		ct.models = true
	}
}

// tuneModels is the card's model side: back to the effort (where the model
// has levels) and the agent's live models, the one on checked.
func (a *App) tuneModels(c *ui.Context, models []protocol.ModelChoice, model *protocol.ModelChoice, back bool, onPick func(m protocol.ModelChoice)) {
	t := a.T
	ct := &a.ctune
	mName := a.L.T("newtask.model")
	ui.Row(c.Key("tp-list-head")).Gap(t.S2).AlignItems(ui.Center).Margin(0, 0, t.S1+2, 0).Children(func() {
		if back {
			b := ui.Box(c.Key("tp-back")).Size(32, 32).Radius(16).Shrink(0).Background(t.SurfaceSunken).Center().
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("tune.back")).Focusable()
			b.Children(func() { a.glyph(c, 12, drawBack(t.InkSoft)) })
			if b.Clicked() {
				ct.models = false
			}
		}
		uiText(c, mName).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
	})
	ui.Scroll(c.Key("tp-list")).MaxHeight(320).Children(func() {
		ui.Column(c).Gap(2).Role(ui.RoleRadioGroup).Label(mName).Children(func() {
			for _, m := range models {
				on := m.ID == model.ID
				if a.menuRow(c, "ct-model:"+m.ID, m.Label, on, false, func() {
					uiText(c, m.Label).FontSize(t.SM).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0)
				}) {
					if on {
						ct.open = false
					} else {
						onPick(m)
					}
				}
			}
		})
	})
}

// drawLevelMark is three small ascending bars, bars of them filled.
func drawLevelMark(bars int, on, off ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		for k := range 3 {
			col := off
			if k < bars {
				col = on
			}
			h := 4 + float32(k)*3
			p.Fill(ui.Rect{X: r.X + float32(k)*4.5, Y: r.Y + r.H - h, W: 3, H: h}, col, 1.2)
		}
	}
}

// drawSteps is the stepped control: a sunk clay groove with a dot per
// level, filled to the thumb, the model's default level ticked under its
// dot, and a raised clay thumb (none for the agent's own unnamed level).
func drawSteps(t *theme.Tokens, n, at, def int, f float32, focused bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		x0, x1 := r.X+12, r.X+r.W-12
		cy := r.Y + r.H/2
		p.Fill(ui.Rect{X: x0, Y: cy - 4, W: x1 - x0, H: 8}, t.SurfaceSunken, 4)
		p.Stroke(ui.Rect{X: x0, Y: cy - 4, W: x1 - x0, H: 8}, t.Line, 4, 1)
		if at >= 0 && f > 0 {
			p.Fill(ui.Rect{X: x0, Y: cy - 4, W: (x1 - x0) * f, H: 8}, t.InkSoft, 4)
		}
		for k := range n {
			x := x0
			if n > 1 {
				x = x0 + (x1-x0)*float32(k)/float32(n-1)
			}
			col := t.InkMuted.Alpha(0.5)
			if at >= 0 && k <= at {
				col = t.Surface.Alpha(0.85)
			}
			p.Fill(ui.Rect{X: x - 3, Y: cy - 3, W: 6, H: 6}, col, 3)
			if k == def {
				p.Fill(ui.Rect{X: x - 1, Y: cy + 9, W: 2, H: 5}, t.Faint, 1)
			}
		}
		if at < 0 {
			return
		}
		tx := x0 + (x1-x0)*f
		if focused {
			p.Fill(ui.Rect{X: tx - 15, Y: cy - 15, W: 30, H: 30}, t.Accent, 15)
		}
		p.Fill(ui.Rect{X: tx - 12, Y: cy - 10, W: 24, H: 24}, t.Line, 12)
		p.Fill(ui.Rect{X: tx - 12, Y: cy - 12, W: 24, H: 24}, t.SurfaceRaised, 12)
		p.Stroke(ui.Rect{X: tx - 12, Y: cy - 12, W: 24, H: 24}, t.InkSoft, 12, 1.5)
	}
}

// drawReset is a round arrow: back to the default.
func drawReset(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		cx, cy := r.X+8*s, r.Y+8*s
		var arc ui.Path
		arc.Circle(cx, cy, 4.8*s).Trim(0.12, 0.9)
		p.StrokePath(&arc, 1.7, col)
		var head ui.Path
		head.MoveTo(r.X+4.4*s, r.Y+1.9*s)
		head.LineTo(r.X+4.4*s, r.Y+4.8*s)
		head.LineTo(r.X+7.3*s, r.Y+4.8*s)
		p.StrokePath(&head, 1.7, col)
	}
}
