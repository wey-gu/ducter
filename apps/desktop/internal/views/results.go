package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Results (design/flows/I-results.md, tonight): under the partner's
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

// taskFooter is what follows a message about a task. A task still under
// way is one quiet line (its mark, title and status). A finished task's
// result message already says the outcome in words, so the footer never
// restates the state: one quiet line of proof (drawn marks and plain
// words, "2 files changed ›", the task's title as a link), a line of what
// went out when something did, then Merge / Open draft PR (D73).
func (a *App) taskFooter(c *ui.Context, task *store.Task, detail string) {
	t := a.T
	if !finished(task) {
		a.taskLine(c, task, detail)
		return
	}
	a.ensureHistory(task.ID)
	ui.Column(c.Key("result:" + task.ID)).Gap(t.S3).Children(func() {
		// A result's own report's evidence: a follow-up's result doesn't
		// re-show the first round's checks (the task keeps them all).
		evs := task.Evidence
		if r := task.LastReport; r != nil && len(r.Evidence) > 0 {
			evs = r.Evidence
		} else if r := task.Card; r != nil && r.LastReport != nil && len(r.LastReport.Evidence) > 0 {
			evs = r.LastReport.Evidence
		}
		a.proofLine(c, task, evs, true)
		a.sentLine(c, task)
		a.resultActions(c, task)
	})
}

// proofLine is how the task knows, as one quiet line that wraps: a drawn
// ✓ (× for a task that didn't work) and plain words per check, the
// changes as "2 files changed ›" (opens the task at its changes), and,
// with withTitle, the task's title as a link at its end.
func (a *App) proofLine(c *ui.Context, task *store.Task, evs []protocol.EvidenceRef, withTitle bool) {
	t := a.T
	evs = store.SortEvidence(latestByLabel(evs))
	failed := task.Attention() == protocol.Failed
	const max = 4
	ui.Row(c.Key("proof:" + task.ID)).Gap(t.S4).Wrap().AlignItems(ui.Center).MinWidth(0).Children(func() {
		var changes *protocol.EvidenceRef
		shown := 0
		for i := range evs {
			ev := evs[i]
			if ev.Kind == "diff" {
				if changes == nil {
					changes = &evs[i]
				}
				continue
			}
			if shown == max {
				if a.quietLink(c, "more", a.L.T("result.more", len(evs)-max), task.Title()) {
					a.OpenTask(task.ID)
				}
				break
			}
			shown++
			if isLink(ev.Ref) {
				if a.quietLink(c.Key(i), "ev", ev.Label, ev.Label) {
					a.openEvidence(c, ev)
				}
				continue
			}
			var draw func(ui.Color) func(*ui.Painter, ui.Rect)
			switch {
			case failed:
				draw = drawCross
			case store.MachineChecked(ev.Kind):
				draw = drawCheck
			}
			glyph := t.InkMuted
			if !failed && store.MachineChecked(ev.Kind) {
				glyph = t.Done.Ink // a passed check's ✓ in the done ink (D76)
			}
			m := a.markIn(c.Key(i), draw, glyph, ev.Label, t.InkMuted).Tooltip(ev.Ref)
			if ev.Ref != "" && m.Clicked() {
				a.openEvidence(c, ev)
			}
		}
		if changes != nil && a.quietLink(c, "changes", changes.Label, changes.Label+" · "+task.Title()) {
			a.openChanges(task.ID)
		}
		if withTitle {
			if a.quietLink(c, "title", task.Title(), task.Title()) {
				a.OpenTask(task.ID)
			}
		}
	})
}

// sentLine is what went out, only when something did: a drawn ↗ and the
// literal action.
func (a *App) sentLine(c *ui.Context, task *store.Task) {
	if line := a.outsideLine(task); line != "" {
		a.mark(c.Key("sent:"+task.ID), drawOut, line, a.T.InkMuted)
	}
}

// openChanges opens a task at its changes.
func (a *App) openChanges(id string) {
	a.open["changes:"+id] = true
	a.OpenTask(id)
}

// outsideLine is what the task sent out, in one line, from what its log
// shows. Empty when nothing was sent out, or until the log is loaded: a
// row with nothing to say is left out (the dossier's Sent out card still
// says "Nothing sent out yet"; the actions say where the changes are).
func (a *App) outsideLine(task *store.Task) string {
	if !task.HistoryLoaded {
		return ""
	}
	acts := task.Outside()
	if len(acts) == 0 {
		return ""
	}
	s := acts[0].Command
	if len(acts) > 1 {
		s += " · " + a.L.T("result.more", len(acts)-1)
	}
	return s
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
			// The primary last, as macOS orders a group (D76).
			if a.buttonFor(c, a.L.T("result.pr"), task.Title(), btnSecondary, t.ControlMD, t.Surface) {
				act("open_pr")
			}
			if a.buttonFor(c, a.L.T("result.merge", base), task.Title(), btnPrimary, t.ControlMD, t.Surface) {
				act("merge")
			}
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
