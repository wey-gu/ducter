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
	if t == nil || t.HistoryLoaded || a.historyAsked[id] || !a.S.Welcomed {
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
	ui.Column(c.Key("result:" + task.ID)).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
			a.taskChip(c, task, "")
		})
		// A result's own report's evidence: a follow-up's result doesn't
		// re-show the first round's checks (the dossier keeps them all).
		evs, line := task.Evidence, a.outsideLine(task)
		if r := task.LastReport; r != nil && len(r.Evidence) > 0 {
			evs = r.Evidence
		} else if r := task.Card; r != nil && r.LastReport != nil && len(r.LastReport.Evidence) > 0 {
			evs = r.LastReport.Evidence
		}
		if len(evs) > 0 || line != "" {
			// Proof and reach as a light two-column sheet hung from a
			// hairline: labels in one column, values aligned in the other.
			// A row with nothing to say is left out, and with it the sheet.
			ui.Column(c).Gap(t.S2).Padding(t.S1, 0, t.S1, t.S3+2).BorderWidth(0, 0, 0, 2).BorderColor(t.Line).Children(func() {
				label := func(key string) {
					ui.Text(c, a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Width(84).Shrink(0).
						Padding(t.S2-1, 0, 0, 0) // centred on a chip's first row
				}
				if len(evs) > 0 {
					ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						label("result.howknow")
						ui.Row(c).Gap(t.S2 - 2).Wrap().Grow(1).MinWidth(0).AlignItems(ui.Center).Children(func() {
							a.evidenceChips(c, task, evs, 4)
						})
					})
				}
				if line != "" {
					ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						label("outside.title")
						ui.Text(c, line).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Grow(1).MinWidth(0).
							Padding(t.S1, 0, 0, 0)
					})
				}
			})
		}
		a.resultActions(c, task)
	})
}

// evidenceChips shows up to max pieces of evidence, machine-checked
// first, folding the rest into "+n".
func (a *App) evidenceChips(c *ui.Context, task *store.Task, evs []protocol.EvidenceRef, max int) {
	t := a.T
	evs = store.SortEvidence(latestByLabel(evs))
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
	chip := a.chipBox(c, t.Chip, bg).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(ev.Label).Tooltip(ev.Ref).Focusable()
	if chip.Hovered() {
		chip.Background(bg.Mix(fg, 0.06))
	}
	chip.Children(func() {
		if checked {
			ui.Box(c).Size(14, 14).Draw(drawCheck(t.Done.Ink)).Shrink(0)
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
	if done := task.Acted; done != nil && done.OK && done.Action == "merge" {
		base := p.BaseBranch
		if base == "" {
			base = "main"
		}
		return a.L.T("outside.nothing.merged", base, a.cjkPad(a.device(p.Device)))
	}
	if p.Kind == "repo" && p.Branch != "" {
		return a.L.T("outside.nothing.repo", p.Branch, a.cjkPad(a.device(p.Device)))
	}
	// Nothing went outside and the task had no place to stay in: there
	// is nothing to say (the dossier's Outside card still says "none").
	return ""
}

// resultActions are the next steps a finished repo task offers. They go
// straight to the task as task_action frames; the server answers with an
// action_result, shown as a toast (see drainActionResults).
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
	ui.Row(c.Key("actions:" + task.ID)).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
		act := func(action string) {
			task.Acting = action
			a.TaskAction(task.ID, action)
		}
		if task.Acting != "" {
			ui.Text(c.Key("acting"), a.L.T("result.acting."+task.Acting, base)).FontSize(t.SM).TextColor(t.InkMuted)
		} else if task.Unsure != "" {
			// The result was lost with the connection and the Log doesn't
			// show it done: say so, offer to try again, never claim a failure.
			ui.Text(c.Key("unsure"), a.L.T("result.unsure")).FontSize(t.SM).TextColor(t.InkMuted)
			if a.buttonFor(c, a.L.T("task.action.retry"), task.Title(), btnSecondary, t.ControlMD, t.Surface) {
				a.RetryAction(task)
			}
		} else if done := task.Acted; done != nil && done.OK && done.Action == "merge" {
			ui.Text(c.Key("acted"), a.L.T("result.merged", base)).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
		} else {
			if a.buttonFor(c, a.L.T("result.merge", base), task.Title(), btnPrimary, t.ControlMD, t.Surface) {
				act("merge")
			}
			if a.buttonFor(c, a.L.T("result.pr"), task.Title(), btnSecondary, t.ControlMD, t.Surface) {
				act("open_pr")
			}
		}
		if a.Route != RouteTask && a.buttonFor(c, a.L.T("result.changes"), task.Title(), btnText, t.ControlMD, t.Surface) {
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
			ui.Text(c.Key(act.Seq), act.Command).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.45).Selectable().MaxLines(3)
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

// drainActionResults shows each new action_result once, as a toast.
func (a *App) drainActionResults(c *ui.Context) {
	for _, f := range a.S.ActionResults {
		title := ""
		if t := a.S.Tasks[f.TaskID]; t != nil {
			title = t.Title()
		}
		switch {
		case f.OK && f.Action == "merge":
			c.Toast(a.L.T("result.merged.toast", title, short(f.Ref)))
		case f.OK && f.Action == "open_pr":
			c.Toast(a.L.T("result.pr.toast", f.Ref))
		case !f.OK:
			c.Toast(a.L.T("result.action.failed", f.Message))
		}
	}
	a.S.ActionResults = nil
}

func short(ref string) string {
	if len(ref) > 7 && !strings.Contains(ref, "/") {
		return ref[:7]
	}
	return ref
}

// latestByLabel keeps one evidence item per label: the latest, since a
// follow-up run supersedes the earlier one (e.g. a second "bun test").
func latestByLabel(evs []protocol.EvidenceRef) []protocol.EvidenceRef {
	seen := map[string]bool{}
	out := make([]protocol.EvidenceRef, 0, len(evs))
	for i := len(evs) - 1; i >= 0; i-- {
		k := evs[i].Kind + "|" + evs[i].Label
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, evs[i])
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}
