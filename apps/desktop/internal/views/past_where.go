package views

// D390: every task is open. In 做过的事 / Past tasks the card the keys or
// the pointer are on shows beside the list (≥ pastSplitW) as 停在哪儿 /
// Where it stopped: its name and facts, how it ended in its own words, its
// last words, what it asks, what it changed, and its steps, each with
// 从这一步开新任务 / New task from this step. Narrower, it opens as a sheet. The sheet
// says which step, what to ask there, who does it, and where the code
// starts; the original stays as it is.

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	// pastSplitW is the window width from which the preview stands beside the list.
	pastSplitW = 1100
	// pastWhereW is the preview column's width.
	pastWhereW = 404
)

// redoState is the redo sheet: which task and step, what to ask, who does
// it ("" the same agent), and its answer while it opens.
type redoState struct {
	open    bool
	taskID  string
	step    int
	words   string
	harness string
	busy    bool
	msg     string
	focus   bool
}

// pastWide reports whether the preview stands beside the list.
func (a *App) pastWide(c *ui.Context) bool {
	w, _ := c.Size()
	return w >= pastSplitW
}

// pastItemFor is a task as Past tasks shows it: the list's, the palette's,
// else made from what the app holds of it.
func (a *App) pastItemFor(id string) *protocol.PastItem {
	if id == "" {
		return nil
	}
	if it := a.pastItem(id); it != nil {
		return it
	}
	if r := a.S.Past.Palette; r != nil {
		for i := range r.Items {
			if r.Items[i].TaskID == id {
				return &r.Items[i]
			}
		}
	}
	x := a.S.Task(id)
	if x == nil {
		return nil
	}
	it := &protocol.PastItem{TaskID: id, Title: x.Title(), Project: x.Project(), Harness: x.Harness(), Model: x.Model(), Attention: x.Attention(), Kind: "build"}
	p := x.Place()
	it.Branch = p.Branch
	if p.Device != "" && p.Device != "local" {
		it.Computer = a.computerName(p.Device)
	}
	if card := x.Card; card != nil {
		it.OpenedAt, it.UpdatedAt = card.OpenedAt, card.UpdatedAt
		it.Changes, it.Integrated, it.Mark, it.From = card.Changes, card.Integrated, card.Mark, card.From
		if card.Original != "" {
			it.Original = card.Original
		}
		if card.PendingDecision != nil {
			it.Asking = card.PendingDecision.Question
		}
	}
	if rep := x.Report(); rep != nil {
		it.Outcome = palLine(rep.Summary)
	}
	if a.past.synth == nil {
		a.past.synth = map[string]*protocol.PastItem{}
	}
	a.past.synth[id] = it
	return it
}

// pastSelect puts the preview on a task and asks for its steps once.
func (a *App) pastSelect(id string) {
	ps := &a.past
	if ps.sel != id {
		ps.pickSteps = false
	}
	ps.sel = id
	a.askSteps(id)
}

// askSteps asks the home for a task's steps, once per task while open.
func (a *App) askSteps(id string) {
	ps := &a.past
	if id == "" || ps.stepsAsked[id] {
		return
	}
	if ps.stepsAsked == nil {
		ps.stepsAsked = map[string]bool{}
	}
	ps.stepsAsked[id] = true
	ps.reqN++
	a.send(protocol.PastStepsReq{T: "past_steps", ID: fmt.Sprintf("steps%d", ps.reqN), TaskID: id})
}

// pastRedoPick is 从某一步开新任务… from the palette or a card: Past tasks with
// the task's steps open to pick from.
func (a *App) pastRedoPick(id string) {
	if a.Route != RoutePast {
		a.OpenPast("")
		a.past.focusField = false
	}
	a.pastSelect(id)
	a.past.pickSteps, a.past.sheet = true, true
}

// pastWhereSheet is the preview as a sheet over a narrow Past tasks.
func (a *App) pastWhereSheet(c *ui.Context) {
	ps := &a.past
	if !ps.sheet || ps.redo.open || a.pastWide(c) {
		return
	}
	it := a.pastItemFor(ps.sel)
	if it == nil {
		ps.sheet = false
		return
	}
	t := a.T
	w, h := c.Size()
	ui.DialogBase(c, &ps.sheet, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S5, 560)).MaxHeight(h-2*t.S5).Radius(t.RadiusXL).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(a.L.T("past.where"))
		ui.Scroll(c.Key("where-sheet")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S5, t.S5, t.S4, t.S5).Gap(t.S4).Children(func() {
				ui.Row(c).AlignItems(ui.Center).Children(func() {
					ui.Text(c, a.L.T("past.where")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).Grow(1)
					if a.button(c, a.L.T("past.close"), btnText, t.ControlSM, t.Surface) {
						ps.sheet = false
					}
				})
				a.pastWhereBody(c, it)
			})
		})
		ui.Box(c.Key("rule")).Height(1).Background(t.LineSoft)
		a.pastWhereActs(c, it)
	})
}

// pastWhereColumn is the preview beside the list.
func (a *App) pastWhereColumn(c *ui.Context) {
	t := a.T
	ps := &a.past
	it := a.pastItemFor(ps.sel)
	ui.Column(c.Key("where-col")).Width(pastWhereW).Shrink(0).Padding(t.S5, t.S5, t.S5, 0).Children(func() {
		card := ui.Column(c.Key("where-card")).Grow(1).MinHeight(0).Radius(t.RadiusLG).Background(t.Surface).
			Shadow(0, 2, 0, 0, t.Line).Shadow(0, 6, 18, -6, t.Ink.Alpha(0.06)).Label(a.L.T("past.where"))
		card.Children(func() {
			if it == nil {
				ui.Column(c.Key("none")).Grow(1).Padding(t.S6).Gap(t.S3).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
					a.pastPebble(c, "art", "look", "", 44)
					ui.Text(c, a.L.T("past.where.none")).FontSize(t.SM).TextColor(t.InkSoft).TextAlign(ui.Center).MaxWidth(260)
				})
				return
			}
			ui.Scroll(c.Key("where-scroll:" + it.TaskID)).Grow(1).MinHeight(0).Children(func() {
				ui.Column(c).Padding(t.S5, t.S5, t.S4, t.S5).Gap(t.S4).Children(func() {
					ui.Text(c, a.L.T("past.where")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
					a.pastWhereBody(c, it)
				})
			})
			ui.Box(c.Key("rule")).Height(1).Background(t.LineSoft)
			a.pastWhereActs(c, it)
		})
	})
}

// pastWhereBody is what the preview says of one task.
func (a *App) pastWhereBody(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	ps := &a.past
	steps := a.S.Past.Steps[it.TaskID]
	ui.Row(c.Key("head")).Gap(t.S3).AlignItems(ui.Start).Children(func() {
		glyph, tint := it.Kind, ""
		if m := it.Mark; m != nil && m.Glyph != "" {
			glyph, tint = m.Glyph, firstNonEmpty(m.Tint, "clay")
		}
		a.pastPebble(c, "art", glyph, tint, 40)
		ui.Column(c).Grow(1).Shrink(1).MinWidth(0).Gap(t.S1).Children(func() {
			ui.Text(c.Key("name"), keepWords(autospace(it.Title))).FontSize(t.LG).FontWeight(700).TextColor(t.Ink).LineHeight(1.3).MaxLines(3).MinWidth(0)
			if it.Original != "" {
				ui.Row(c.Key("was")).Gap(t.S2).MinWidth(0).Children(func() {
					ui.Text(c, a.L.T("past.hit.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Shrink(0)
					ui.Text(c, it.Original).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
				})
			}
		})
	})
	a.pastWherePills(c, it)
	if f := it.From; f != nil && f.Step > 0 {
		ui.Text(c.Key("redone"), a.L.T("past.redone", shortTitle(f.Title), f.Step)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).MinWidth(0)
	}
	if it.Asking != "" {
		ui.Column(c.Key("asking")).Gap(t.S1).Padding(t.S3, t.S3).Radius(t.RadiusMD).Background(t.NeedsYou.Surface).Children(func() {
			ui.Text(c, a.L.T("past.asking")).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
			ui.Text(c, keepWords(autospace(it.Asking))).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.5).MinWidth(0)
		})
	}
	result := strings.TrimSpace(it.Outcome)
	if steps != nil && strings.TrimSpace(steps.Report) != "" {
		result = strings.TrimSpace(steps.Report)
	}
	if result != "" {
		a.pastWhereSection(c, "result", a.L.T("past.result"), func() {
			ui.Text(c, keepWords(autospace(result))).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.55).MaxLines(10).MinWidth(0)
		})
	}
	if lw := strings.TrimSpace(it.LastWords); lw != "" && !strings.Contains(result, lw) {
		a.pastWhereSection(c, "last", a.L.T("past.lastwords"), func() {
			ui.Text(c, keepWords(autospace(lw))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).MaxLines(4).MinWidth(0)
		})
	}
	a.pastWhereSection(c, "steps", a.L.T("past.steps"), func() {
		if steps == nil {
			ui.Text(c, a.L.T("past.steps.wait")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		ui.Column(c.Key("list")).Gap(t.S2).Children(func() {
			for _, st := range steps.Steps {
				a.pastStepRow(c.Key(fmt.Sprintf("step:%d", st.N)), it, st, ps.pickSteps)
			}
		})
	})
}

// pastWherePills are the task's facts, each its own pill (D291), then what
// it changed and how it ended.
func (a *App) pastWherePills(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	pill := func(key, text string, mono bool) {
		if strings.TrimSpace(text) == "" {
			return
		}
		x := ui.Text(c.Key("pill:"+key), text).FontSize(t.XS).FontWeight(500).TextColor(t.InkSoft).Padding(2, t.S2).Radius(6).
			Background(t.SurfaceSunken).SingleLine().Shrink(1).MinWidth(0)
		if mono {
			x.Font(t.Mono)
		}
	}
	proj := it.Project
	if proj == "" {
		proj = a.L.T("past.other")
	}
	agent := harnessName(it.Harness)
	if it.Model != "" {
		agent += " " + it.Model
	}
	ui.Row(c.Key("pills")).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
		pill("project", proj, false)
		pill("branch", it.Branch, true)
		pill("computer", it.Computer, false)
		pill("agent", agent, false)
		pill("when", a.pastDate(store.ParseTime(it.UpdatedAt)), false)
		if ch := it.Changes; ch != nil && (ch.Adds > 0 || ch.Dels > 0) {
			ui.Row(c.Key("stat")).Gap(t.S1+1).Padding(2, t.S2).Shrink(0).Children(func() {
				if ch.Adds > 0 {
					ui.Text(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
				}
				if ch.Dels > 0 {
					ui.Text(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
				}
			})
		}
		if g := it.Integrated; g != nil {
			key := "onhand.pr.draft"
			if g.Act == "merge" {
				key = "onhand.pr.merged"
			}
			ui.Text(c.Key("pr"), a.L.T(key)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(0)
		}
		if end, ink := a.pastEndWord(it); end != "" {
			ui.Text(c.Key("end"), end).FontSize(t.XS).FontWeight(700).TextColor(ink).SingleLine().Shrink(0)
		}
	})
}

// pastEndWord is an ending other than done, in its ink.
func (a *App) pastEndWord(it *protocol.PastItem) (string, ui.Color) {
	t := a.T
	switch {
	case it.Attention == protocol.Failed:
		return a.L.T("past.end.failed"), t.Failed.Ink
	case it.Attention == protocol.Dropped:
		return a.L.T("past.end.dropped"), t.InkMuted
	case it.Attention == protocol.Superseded:
		return a.L.T("past.end.superseded"), t.InkMuted
	case it.Attention == protocol.NeedsYou:
		return a.L.T("past.end.active"), t.NeedsYou.Ink
	case pastActive(it.Attention):
		return a.L.T("past.end.active"), t.InkSoft
	}
	return "", t.InkMuted
}

// pastWhereSection is one part of the preview under its small name.
func (a *App) pastWhereSection(c *ui.Context, key, name string, body func()) {
	t := a.T
	ui.Column(c.Key("sec:" + key)).Gap(t.S2).Children(func() {
		ui.Text(c, name).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
		body()
	})
}

// pastStepRow is one step: 第 n 步 and who said it, its words, what came of
// it, and the commit its code stood at; hover (or picking) offers 从这一步开新任务.
func (a *App) pastStepRow(c *ui.Context, it *protocol.PastItem, st protocol.PastStep, picking bool) {
	t := a.T
	row := ui.Column(c).Gap(3).Padding(t.S2+1, t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken.Mix(t.Surface, 0.45))
	hover := row.Hovered()
	if hover || picking {
		row.Background(t.SurfaceSunken)
	}
	row.Children(func() {
		ui.Row(c.Key("h")).Gap(t.S2).AlignItems(ui.Center).MinHeight(t.ControlSM).Children(func() {
			ui.Text(c, a.L.T("past.step", st.N)).FontSize(t.XS).FontWeight(700).TextColor(t.Ink).SingleLine().Shrink(0)
			who := a.L.T("past.step.you")
			if st.Who == "partner" {
				who = a.L.T("past.step.partner", a.personaName())
			}
			ui.Text(c, who).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
			if st.Commit != "" {
				ui.Text(c.Key("commit"), st.Commit).Font(t.Mono).FontSize(t.XS-1).TextColor(t.InkSoft).Padding(1, t.S1+2).Radius(5).
					Background(t.Surface).SingleLine().Shrink(0)
			}
			ui.Box(c).Grow(1)
			if hover || picking {
				if a.buttonFor(c, a.L.T("past.step.redo"), fmt.Sprint(it.Title, " ", st.N), btnSecondary, t.ControlSM, t.SurfaceSunken) {
					a.openRedo(it, st)
				}
			}
		})
		ui.Text(c.Key("text"), keepWords(autospace(strings.Join(strings.Fields(st.Text), " ")))).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.45).MaxLines(2).MinWidth(0).Tooltip(st.Text)
		if st.Came != "" {
			ui.Text(c.Key("came"), keepWords(autospace(st.Came))).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.45).MaxLines(1).MinWidth(0).Tooltip(st.Came)
		}
	})
}

// pastWhereActs are the preview's actions.
func (a *App) pastWhereActs(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	ps := &a.past
	ui.Row(c.Key("where-acts")).Gap(t.S1).Padding(t.S3, t.S4).AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("past.open"), it.Title, btnPrimary, t.ControlSM, t.Surface) {
			ps.sheet = false
			a.pastOpen(it)
		}
		if !pastActive(it.Attention) && a.buttonFor(c, a.L.T("past.continue"), it.Title, btnSecondary, t.ControlSM, t.Surface) {
			ps.sheet = false
			a.pastContinue(it, "")
		}
		if a.buttonFor(c, a.L.T("past.redo.pick"), it.Title, btnText, t.ControlSM, t.Surface) {
			ps.pickSteps = !ps.pickSteps
		}
		b := ui.Box(c.Key("other")).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(spoken(a.L, a.L.T("past.more"), it.Title)).
			Tooltip(a.L.T("past.more")).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
		fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
		b.Draw(drawMore(fg))
		b.Menu(func(m *ui.Menu) {
			if m.Item(a.L.T("past.seed")).Chosen() {
				ps.sheet = false
				a.pastSeed(it)
			}
			m.Separator()
			for _, h := range pastHarnesses {
				if h == it.Harness {
					continue
				}
				if m.Item(a.L.T("past.with", harnessName(h))).Chosen() {
					ps.sheet = false
					a.pastContinue(it, h)
				}
			}
		})
	})
}

// ---------- 从这一步开新任务 / New task from this step ----------

// openRedo opens the redo sheet on a step, its words as they were.
func (a *App) openRedo(it *protocol.PastItem, st protocol.PastStep) {
	a.past.redo = redoState{open: true, taskID: it.TaskID, step: st.N, words: st.Text, focus: true}
	a.S.Past.Forked = nil
}

// redoSheet is 从第 n 步开新任务 / New task from step n.
func (a *App) redoSheet(c *ui.Context) {
	ps := &a.past
	r := &ps.redo
	if !r.open {
		return
	}
	it := a.pastItemFor(r.taskID)
	steps := a.S.Past.Steps[r.taskID]
	if it == nil {
		r.open = false
		return
	}
	// The home's answer: open the new task, or say why not.
	if f := a.S.Past.Forked; r.busy && f != nil && f.From == r.taskID {
		r.busy = false
		a.S.Past.Forked = nil
		if f.OK && f.TaskID != "" {
			r.open, ps.sheet = false, false
			a.OpenTask(f.TaskID)
			a.back = &returnTo{task: f.TaskID, route: RoutePast}
			return
		}
		r.msg = f.Message
	}
	var st protocol.PastStep
	if steps != nil {
		for _, s := range steps.Steps {
			if s.N == r.step {
				st = s
			}
		}
	}
	t := a.T
	w, h := c.Size()
	title := a.L.T("past.redo.title", r.step)
	ui.DialogBase(c, &r.open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S5, 560)).MaxHeight(h-2*t.S5).Radius(t.RadiusXL).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title)
		ui.Scroll(c.Key("redo-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S5, t.S6, t.S5, t.S6).Gap(t.S4).Children(func() {
				ui.Column(c).Gap(t.S1).Children(func() {
					a.heading(c, title, t.XL)
					ui.Text(c, keepWords(autospace(it.Title))).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().MinWidth(0)
				})
				ui.Column(c.Key("words")).Gap(t.S2).Children(func() {
					ui.Text(c, a.L.T("past.redo.words")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
					ui.Row(c).Padding(t.S1, t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken).InsetShadow(0, 1.5, 2, 0, t.Line).Children(func() {
						in := ui.TextArea(c.Key("redo-in"), &r.words).Lines(3, 8).Label(a.L.T("past.redo.words")).
							Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0).Grow(1).FontSize(t.MD)
						if r.focus {
							in.Focus()
							r.focus = false
						}
					})
				})
				a.redoAgents(c, it)
				ui.Column(c.Key("notes")).Gap(t.S2).Children(func() {
					if steps != nil && steps.Repo {
						line := a.L.T("past.redo.nocommit")
						if steps.Elsewhere {
							line = a.L.T("past.redo.elsewhere")
						}
						if st.Commit != "" {
							line = a.L.T("past.redo.commit", st.Commit, a.redoWhen(st.At))
						}
						a.redoNote(c, "code", line)
					}
					a.redoNote(c, "keep", a.L.T("past.redo.keep"))
				})
				if r.msg != "" {
					ui.Text(c.Key("msg"), r.msg).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(1.5).MinWidth(0)
				}
			})
		})
		ui.Row(c.Key("redo-foot")).Gap(t.S2).Padding(t.S3, t.S6, t.S5, t.S6).Justify(ui.End).AlignItems(ui.Center).Children(func() {
			if a.button(c, a.L.T("past.redo.cancel"), btnText, t.ControlMD, t.Surface) {
				r.open = false
			}
			label := a.L.T("past.redo.go")
			if r.busy {
				label = a.L.T("past.redo.busy")
			}
			if a.buttonFor(c, label, it.Title, btnPrimary, t.ControlMD, t.Surface) && !r.busy && strings.TrimSpace(r.words) != "" {
				a.sendRedo(it)
			}
		})
	})
}

// redoAgents are the agent chips: the same one first, then the others.
func (a *App) redoAgents(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	r := &a.past.redo
	const pad = float32(3)
	ui.Row(c.Key("agents")).Children(func() {
		ui.Row(c.Key("track")).Padding(pad).Gap(2).Radius(t.RadiusSM).Wrap().AlignItems(ui.Center).Background(t.SurfaceSunken).
			InsetShadow(0, 1.5, 2, 0, t.Line).Role(ui.RoleRadioGroup).Children(func() {
			chip := func(h, label string) {
				on := r.harness == h || (h == it.Harness && r.harness == "")
				b := ui.Row(c.Key("a:"+h)).Height(28).Padding(0, t.S3).Gap(t.S2).Radius(t.RadiusSM - pad).AlignItems(ui.Center).
					Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(label).AccessSelected(on).Focusable().Shrink(0)
				fg := t.InkSoft
				switch {
				case on:
					a.knob(b)
					fg = t.Ink
				case b.Hovered():
					b.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
					fg = t.Ink
				}
				b.Children(func() {
					a.coinBox(c, "c", h, 16, !on, coinStill)
					w := 500
					if on {
						w = 700
					}
					ui.Text(c, label).FontSize(t.SM).FontWeight(w).TextColor(fg).SingleLine().AccessHidden(true)
				})
				if b.Clicked() {
					r.harness = h
					if h == it.Harness {
						r.harness = ""
					}
				}
			}
			chip(it.Harness, a.L.T("past.redo.same", harnessName(it.Harness)))
			// The three coding agents (DeepSeek's harness only when it was the task's own).
			for _, h := range pastHarnesses {
				if h != it.Harness && h != "deepseek-harness" {
					chip(h, harnessName(h))
				}
			}
		})
	})
}

// redoNote is one quiet line of what a redo does.
func (a *App) redoNote(c *ui.Context, key, line string) {
	t := a.T
	ui.Row(c.Key("note:" + key)).Gap(t.S2).AlignItems(ui.Start).Children(func() {
		ui.Box(c).Size(5, 5).Radius(3).Margin(8, 0, 0, 2).Background(t.InkMuted).Shrink(0).AccessHidden(true)
		ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Grow(1).MinWidth(0)
	})
}

// redoWhen is when a step began, as the redo sheet says it.
func (a *App) redoWhen(at string) string {
	ts := store.ParseTime(at)
	if ts.IsZero() {
		return ""
	}
	d := a.pastDate(ts)
	if pastDayDiff(ts, a.Now()) != 0 {
		d += " " + i18n.Clock(ts)
	}
	return d
}

// sendRedo asks the home for the new task.
func (a *App) sendRedo(it *protocol.PastItem) {
	r := &a.past.redo
	words := strings.TrimSpace(r.words)
	f := protocol.PastFork{T: "past_fork", TaskID: it.TaskID, Step: r.step, Harness: r.harness}
	if steps := a.S.Past.Steps[it.TaskID]; steps != nil {
		for _, s := range steps.Steps {
			if s.N == r.step && strings.TrimSpace(s.Text) != words {
				f.Words = words
			}
		}
	} else {
		f.Words = words
	}
	r.busy, r.msg = true, ""
	a.S.Past.Forked = nil
	a.send(f)
}

// pastHomeName is the home computer by its name, else 这台电脑 / This computer.
func (a *App) pastHomeName() string {
	if c := a.computerOf("local"); c != nil && c.Name != "" {
		return shownDeviceName(c.Name)
	}
	return a.L.T("past.pc.home")
}
