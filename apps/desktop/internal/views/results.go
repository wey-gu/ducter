package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Results (docs/design/flows/I-results.md, tonight): under the partner's
// result message, the task's chip, "How I know" evidence chips (machine
// checks first), the "Outside" line from what the transcript shows, and
// what to do next with a repo result.

// ensureHistory asks once for a task's stream, which the Outside line
// needs (task events are never pushed in bulk).
func (a *App) ensureHistory(id string) {
	t := a.S.Task(id)
	if t == nil || t.HistoryLoaded || a.historyAsked[id] {
		return
	}
	a.historyAsked[id] = true
	a.send(protocol.TaskHistoryReq{T: "task_history", TaskID: id, Limit: 500})
}

// finished reports whether a task has a result to show.
func finished(t *store.Task) bool {
	switch t.Attention() {
	case protocol.Done, protocol.DoneClaimed, protocol.Failed:
		return true
	}
	return false
}

// taskFooter is what follows a message about a task: its chip, and for a
// finished task its result's proof, Outside line and next steps.
func (a *App) taskFooter(c *ui.Context, task *store.Task, detail string) {
	if !finished(task) {
		ui.Row(c).Gap(8).Wrap().AlignItems(ui.Center).Children(func() { a.taskChip(c, task, detail) })
		return
	}
	t := a.T
	a.ensureHistory(task.ID)
	ui.Column(c.Key("result:" + task.ID)).Gap(10).Children(func() {
		ui.Row(c).Gap(8).Wrap().AlignItems(ui.Center).Children(func() {
			a.taskChip(c, task, "")
		})
		if evs := task.Evidence; len(evs) > 0 {
			ui.Row(c).Gap(8).Wrap().AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.L.T("result.howknow")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).LetterSpacing(0.3)
				a.evidenceChips(c, task, evs, 4)
			})
		}
		if line := a.outsideLine(task); line != "" {
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.L.T("outside.title")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).LetterSpacing(0.3).Shrink(0)
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).Grow(1).MinWidth(0)
			})
		}
		a.resultActions(c, task)
	})
}

// evidenceChips shows up to max pieces of evidence, machine-checked
// first, folding the rest into "+n".
func (a *App) evidenceChips(c *ui.Context, task *store.Task, evs []protocol.EvidenceRef, max int) {
	t := a.T
	evs = store.SortEvidence(evs)
	for i, ev := range evs {
		if i == max {
			l := ui.Text(c.Key("more"), a.L.T("result.more", len(evs)-max)).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).
				Cursor(ui.CursorPointer).Role(ui.RoleLink)
			if l.Clicked() {
				a.OpenTask(task.ID)
			}
			return
		}
		a.evidenceChip(c.Key(i), task, ev)
	}
}

// evidenceChip is one piece of proof: a check mark when a machine checked
// it. It opens the thing itself: a link, the task's diff, or copies.
func (a *App) evidenceChip(c *ui.Context, task *store.Task, ev protocol.EvidenceRef) {
	t := a.T
	checked := store.MachineChecked(ev.Kind)
	bg, fg := t.SurfaceSunken, t.Ink
	if checked {
		bg, fg = t.Done.Surface, t.Done.Ink
	}
	chip := ui.Row(c).Gap(6).Height(28).Padding(0, 10, 0, 8).Radius(9).Background(bg).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(ev.Label).Tooltip(ev.Ref).Shrink(0)
	chip.Children(func() {
		if checked {
			ui.Box(c).Size(14, 14).Draw(drawCheck(t.Done.Ink))
		}
		ui.Text(c, ev.Label).FontSize(t.XS).FontWeight(700).TextColor(fg).SingleLine()
	})
	if chip.Clicked() {
		if ev.Kind == "diff" && task != nil {
			a.OpenTask(task.ID)
			return
		}
		a.openEvidence(c, ev)
	}
}

// outsideLine is what the task did outside, in one line: what the
// transcript shows, or that nothing left its branch. Empty until the
// transcript is loaded: never claim "nothing" without having looked.
func (a *App) outsideLine(task *store.Task) string {
	if !task.HistoryLoaded {
		return ""
	}
	acts := task.Outside()
	if len(acts) > 0 {
		s := acts[0].Command
		if len(acts) > 1 {
			s += " · " + a.L.T("result.more", len(acts)-1)
		}
		return s + " · " + a.L.T("outside.seen")
	}
	p := task.Place()
	if p.Kind == "repo" && p.Branch != "" {
		return a.L.T("outside.nothing.repo", p.Branch, a.cjkPad(a.device(p.Device)))
	}
	return a.L.T("outside.nothing")
}

// resultActions are the next steps a finished repo task offers. There is
// no protocol frame for them yet, so they ask the partner in words.
func (a *App) resultActions(c *ui.Context, task *store.Task) {
	t := a.T
	p := task.Place()
	if task.Attention() == protocol.Failed || p.Kind != "repo" || p.Branch == "" {
		return
	}
	base := p.BaseBranch
	if base == "" {
		base = "main"
	}
	ui.Row(c.Key("actions:" + task.ID)).Gap(8).Wrap().AlignItems(ui.Center).Children(func() {
		ask := func(text string) {
			a.SendMessage(text)
			if a.Route != RouteConversation {
				c.Toast(a.L.T("result.asked", a.S.PersonaName))
			}
		}
		if a.button(c, a.L.T("result.merge", base), btnPrimary, 38, t.Surface) {
			ask(a.L.T("result.ask.merge", task.Title(), base))
		}
		if a.button(c, a.L.T("result.pr"), btnQuiet, 38, t.Surface) {
			ask(a.L.T("result.ask.pr", task.Title()))
		}
		if a.Route != RouteTask && a.button(c, a.L.T("result.changes"), btnText, 38, t.Surface) {
			a.OpenTask(task.ID)
		}
	})
}

// outsideCard is the dossier's "Outside": what the transcript shows the
// task did beyond its place.
func (a *App) outsideCard(c *ui.Context, task *store.Task) {
	t := a.T
	a.dossierCard(c, a.L.T("outside.title"), func() {
		if !task.HistoryLoaded {
			ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		acts := task.Outside()
		if len(acts) == 0 {
			ui.Text(c, a.L.T("outside.none")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		ui.Text(c, a.L.T("outside.seen")).FontSize(t.XS).FontWeight(800).TextColor(t.Waiting.Ink)
		for _, act := range acts {
			ui.Text(c.Key(act.Seq), act.Command).Font(t.Mono).FontSize(11.5).LineHeight(1.45).Selectable().MaxLines(3)
		}
	})
}

// summaryLine is the first line of a report's summary.
func summaryLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, "\n"); i >= 0 {
		s = s[:i]
	}
	return s
}

// cjkPad spaces a Latin word apart from the Chinese around it, and leaves
// Chinese and English text as is.
func (a *App) cjkPad(s string) string {
	if a.L.Lang != i18n.ZH || s == "" {
		return s
	}
	if s[0] < 0x80 {
		s = " " + s
	}
	if s[len(s)-1] < 0x80 {
		s += " "
	}
	return s
}

// headlineEvidence is the one machine check a Done row shows: the last
// of the strongest kind (an "after" test run beats a "before").
func headlineEvidence(evs []protocol.EvidenceRef) (protocol.EvidenceRef, bool) {
	sorted := store.SortEvidence(evs)
	if len(sorted) == 0 || !store.MachineChecked(sorted[0].Kind) {
		return protocol.EvidenceRef{}, false
	}
	best := sorted[0]
	for _, ev := range sorted[1:] {
		if ev.Kind == best.Kind {
			best = ev
		}
	}
	return best, true
}
