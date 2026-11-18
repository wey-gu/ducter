package views

import (
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// composerTuneState is the two chips under an opened task's composer
// (D354): which menu is open, the task whose model list was last asked
// for, and the one quiet line said after a choice.
type composerTuneState struct {
	modelOpen, effortOpen bool
	askedFor              string
	said, saidFor         string
	saidAt                time.Time
}

// tuneSaidFor is how long 下一轮起用 {model} / From its next turn… stays.
const tuneSaidFor = 8 * time.Second

// composerTune is the task's model and effort, always in sight under its
// composer while it can still be switched (D354): the model in plain words
// and 思考：低 / Effort: Low, each opening a short list anchored to it.
// A choice is D282's in-place switch: the running turn finishes as it
// was, the next one uses the new setting, said once in a quiet line.
// Switching the agent itself stays in 换谁来做 / Switch who does it. No
// effort chip where the model has no levels; nothing where the agent
// lists no models of its own.
func (a *App) composerTune(c *ui.Context, task *store.Task) {
	if !canSwitch(task) {
		return
	}
	ct := &a.ctune
	if ct.askedFor != task.ID && a.S.Welcomed && a.Status == client.Connected {
		// The agent's own list, read again for each task opened (D352: the
		// home keeps it per agent version, so asking is cheap).
		ct.askedFor, ct.modelOpen, ct.effortOpen = task.ID, false, false
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
	ui.Row(c.Key("ctune")).Gap(t.S1).AlignItems(ui.Center).Shrink(0).Children(func() {
		mName := a.L.T("newtask.model")
		e, click := a.tuneChip(c, "ct-model", spoken(a.L, mName, model.Label), model.Label, ct.modelOpen)
		if click {
			ct.modelOpen, ct.effortOpen = !ct.modelOpen, false
		}
		if ct.modelOpen {
			a.listPanel(c, e, &ct.modelOpen, mName, 260, func() {
				for _, m := range models {
					on := m.ID == model.ID
					if a.menuRow(c, "ct-model:"+m.ID, m.Label, on, false, func() {
						ui.Text(c, m.Label).FontSize(t.SM).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0)
					}) && !on {
						ct.modelOpen = false
						pick(m.ID, "", a.L.T("tune.next.model", m.Label))
					}
				}
			})
		}
		if len(model.Efforts) == 0 {
			return
		}
		eName := a.L.T("newtask.effort")
		word := a.effortWord(effort)
		if effort == "" {
			word = a.L.T("newtask.effort.default") // the agent's own, unnamed
		}
		e, click = a.tuneChip(c, "ct-effort", spoken(a.L, eName, word), a.L.T("tune.effort", word), ct.effortOpen)
		if click {
			ct.effortOpen, ct.modelOpen = !ct.effortOpen, false
		}
		if ct.effortOpen {
			a.listPanel(c, e, &ct.effortOpen, eName, 200, func() {
				for _, lv := range model.Efforts {
					on := lv == effort
					w := a.effortWord(lv)
					if a.menuRow(c, "ct-effort:"+lv, w, on, false, func() {
						ui.Text(c, w).FontSize(t.SM).TextColor(t.Ink).SingleLine()
						if lv == model.DefaultEffort {
							ui.Text(c, a.L.T("newtask.effort.default")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
						}
					}) && !on {
						ct.effortOpen = false
						pick(model.ID, lv, a.L.T("tune.next.effort", w))
					}
				}
			})
		}
	})
	if ct.saidFor == task.ID && ct.said != "" {
		if left := tuneSaidFor - a.Now().Sub(ct.saidAt); left > 0 {
			c.After(left)
			ui.Text(c.Key("ct-said"), ct.said).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).Role(ui.RoleAlert)
		} else {
			ct.said = ""
		}
	}
}

// tuneChip is one quiet chip under the composer: its words small and
// muted, a caret, no fill until hovered; open, it stands on the surface
// with an ink hairline, like New task's pills. It returns the chip (its
// list's anchor) and whether it was clicked.
func (a *App) tuneChip(c *ui.Context, key, about, words string, open bool) (ui.Element, bool) {
	t := a.T
	e := ui.Row(c.Key(key)).Height(t.ControlSM).Padding(0, t.S2).Gap(t.S1 + 2).Radius(t.RadiusSM).AlignItems(ui.Center).Shrink(1).MinWidth(0).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(about).Expanded(open).Focusable()
	ink := t.InkMuted
	switch {
	case open:
		e.Background(t.Surface).InsetShadow(0, 0, 0, 1.5, t.Ink)
		ink = t.Ink
	case e.Pressed():
		e.Background(t.Line)
	case e.Hovered():
		e.Background(t.SurfaceSunken)
		ink = t.InkSoft
	}
	e.Children(func() {
		ui.Text(c, words).FontSize(t.XS).FontWeight(600).TextColor(ink).SingleLine().Shrink(1).MinWidth(0).AccessHidden(true)
		ui.Box(c).Size(8, 8).Shrink(0).Draw(drawCaret(ink)).AccessHidden(true)
	})
	return e, e.Clicked()
}
