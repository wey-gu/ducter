package views

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

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
		a.lookLine(c, "footer:"+task.ID, reportLookLeft(task)) // D437
		a.docLine(c, "footer:"+task.ID, reportDocLeft(task))   // D439
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
		// The changes are one item, "2 files changed ›" (D73): commits and
		// changed files fold into it.
		var changed, rest []protocol.EvidenceRef
		for _, ev := range evs {
			if ev.Kind == "diff" || (ev.Kind == "file" && !strings.HasPrefix(ev.Ref, "http")) {
				changed = append(changed, ev)
			} else {
				rest = append(rest, ev)
			}
		}
		for i, ev := range rest {
			if i == max {
				if a.quietLink(c, "more", a.L.T("result.more", len(rest)-max), task.Title()) {
					a.OpenTask(task.ID)
				}
				break
			}
			if isLink(ev.Ref) {
				if a.quietLink(c.Key(i), "ev", a.proofLabel(task, ev), a.proofLabel(task, ev)) {
					a.openEvidence(c, ev)
				}
				continue
			}
			var draw func(ui.Color) func(*ui.Painter, ui.Rect)
			glyph := t.InkMuted
			switch {
			case failed:
				draw = drawCross
			case isRepro(ev):
				// A reproduction failed on purpose: a quiet ×, never a ✓.
				draw = drawCross
			case store.MachineChecked(ev.Kind):
				draw = drawCheck
				glyph = t.Done.Ink // a passed check's ✓ in the done ink (D76)
			}
			m := a.markIn(c.Key(i), draw, glyph, a.proofLabel(task, ev), t.InkMuted).Tooltip(ev.Ref)
			if ev.Ref != "" && m.Clicked() {
				a.openEvidence(c, ev)
			}
		}
		// A folder (D142) says its changes in its own sentence, with Undo
		// and Keep: no count here too.
		if len(changed) > 0 && task.Place().Kind != "folder" {
			words := a.changesWords(task, changed)
			if a.quietLink(c, "changes", words, spoken(a.L, words, task.Title())) {
				a.openChanges(task.ID)
			}
		}
		if withTitle {
			if a.quietLink(c, "title", task.Title(), task.Title()) {
				a.OpenTask(task.ID)
			}
		}
	})
}

// lookLine (D437) is what another AI still found when it looked the result
// (or what a Go sends) over: its lead in the needs-you ink, then each thing
// on its own line (D291), set in from a rule. Nothing when the look was
// clean or the task fixed what it found.
func (a *App) lookLine(c *ui.Context, key string, left []string) {
	if len(left) == 0 {
		return
	}
	t := a.T
	// D441: a plain line like the others under a result (its lead in the
	// needs-you ink), no bar down its side.
	ui.Column(c.Key("look:" + key)).Gap(2).MinWidth(0).Children(func() {
		uiText(c, a.L.T("look.lead")).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink)
		for i, l := range left {
			uiText(c.Key(fmt.Sprintf("it%d", i)), l).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.45).MinWidth(0)
		}
		// D451: the first time, what it is and why only these are left.
		a.firstMeetLine(c, "look", key)
	})
}

// docLine (D439) is what Ducter's page check still found in a document to
// send: a drawn page and its lead in the needs-you ink, then each thing on
// its own line (D291), set in under the lead's words (no rule beside it).
// Nothing when the pages were clean.
func (a *App) docLine(c *ui.Context, key string, left []string) {
	if len(left) == 0 {
		return
	}
	t := a.T
	ui.Column(c.Key("doc:" + key)).Gap(2).MinWidth(0).Children(func() {
		ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Size(14, 14).Shrink(0).Draw(drawDocMark(t.NeedsYou.Ink))
			uiText(c, a.L.T("doc.lead")).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink)
		})
		for i, l := range left {
			ui.Row(c.Key(fmt.Sprintf("it%d", i))).Padding(0, 0, 0, 20).MinWidth(0).Children(func() {
				uiText(c, l).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.45).MinWidth(0)
			})
		}
		// D451: the first time, what it is and why only these are left.
		a.firstMeetLine(c, "pages", key)
	})
}

// drawDocMark is a small page with two lines on it (the web's DocLine mark).
func drawDocMark(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := min(r.W, r.H) / 16
		pt := func(x, y float32) (float32, float32) { return r.X + x*s, r.Y + y*s }
		var pg ui.Path
		pg.MoveTo(pt(4, 1.8)).LineTo(pt(9.5, 1.8)).LineTo(pt(12.5, 4.8)).LineTo(pt(12.5, 14.2)).LineTo(pt(4, 14.2)).Close()
		pg.MoveTo(pt(9.5, 1.8)).LineTo(pt(9.5, 4.8)).LineTo(pt(12.5, 4.8))
		pg.MoveTo(pt(6, 8)).LineTo(pt(10.5, 8)).MoveTo(pt(6, 10.6)).LineTo(pt(9, 10.6))
		p.StrokePath(&pg, 1.5*s, col)
	}
}

// reportDocLeft is what the page check still found in the task's last
// report's document (D439).
func reportDocLeft(task *store.Task) []string {
	if r := task.Report(); r != nil && r.Doc != nil {
		return r.Doc.Left
	}
	return nil
}

// reportLookLeft is what the task's last report's look still found (D437).
func reportLookLeft(task *store.Task) []string {
	if r := task.Report(); r != nil && r.Look != nil {
		return r.Look.Left
	}
	return nil
}

// sentLine is what went out, only when something did: a drawn ↗ and the
// literal action.
func (a *App) sentLine(c *ui.Context, task *store.Task) {
	t := a.T
	line, more := a.outsideLine(task)
	if line == "" {
		return
	}
	// D291: how many more went out is its own muted count, not joined to the action.
	ui.Row(c.Key("sent:" + task.ID)).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).Children(func() {
		a.mark(c.Key("sentmk"), drawOut, line, t.InkMuted)
		if more > 0 {
			uiText(c, a.L.T("result.more", more)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
		}
	})
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
func (a *App) outsideLine(task *store.Task) (line string, more int) {
	if !task.HistoryLoaded {
		return "", 0
	}
	acts := task.Outside()
	if len(acts) == 0 {
		return "", 0
	}
	return a.outsideSentence(acts[0], task.Place().Branch), len(acts) - 1
}

// resultActions are the next steps a finished repo task offers. They go
// straight to the task as task_action frames; the server answers with an
// action_result, shown as a toast (see drainActionResults).
func (a *App) resultActions(c *ui.Context, task *store.Task) {
	t := a.T
	p := task.Place()
	if !task.CanIntegrate() {
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
			uiText(c.Key("acting"), a.L.TFamily("result.acting."+task.Acting, base)).FontSize(t.SM).TextColor(t.InkMuted)
		} else if task.Unsure != "" {
			// The result was lost with the connection and the Log doesn't
			// show it done: say so, offer to try again, never claim a failure.
			uiText(c.Key("unsure"), a.L.T("result.unsure")).FontSize(t.SM).TextColor(t.InkMuted)
			if a.buttonFor(c, a.L.T("task.action.retry"), task.Title(), btnSecondary, t.ControlMD, t.Surface) {
				a.RetryAction(task)
			}
		} else if done := task.Acted; done != nil && done.OK && done.Action == "merge" {
			uiText(c.Key("acted"), a.L.T("result.merged", base)).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
		} else {
			// The primary last, as macOS orders a group (D76). No remote,
			// no PR to open: only Merge.
			if !noRemote(task) && a.buttonFor(c, a.L.T("result.pr"), task.Title(), btnSecondary, t.ControlMD, t.Surface) {
				act("open_pr")
			}
			if a.buttonFor(c, a.L.T("result.merge", base), task.Title(), btnPrimary, t.ControlMD, t.Surface) {
				act("merge")
			}
		}
	})
	a.prFailureLine(c, task)
}

// prFailureLine says why Open draft PR didn't work, under the actions, and
// keeps saying it (not a toast that is gone in seconds).
func (a *App) prFailureLine(c *ui.Context, task *store.Task) {
	if why := a.prFailure(task); why != "" {
		// No remote is how the repo is, not something that went wrong: muted.
		col := a.T.Failed.Ink
		if noRemote(task) {
			col = a.T.InkMuted
		}
		uiText(c.Key("prfail:"+task.ID), why).FontSize(a.T.SM).LineHeight(1.5).TextColor(col).Selectable()
	}
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
	if !a.L.Han() || s == "" {
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
	var checks []protocol.EvidenceRef
	for _, e := range evs {
		if !isRepro(e) {
			checks = append(checks, e)
		}
	}
	sorted := store.SortEvidence(checks)
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
		case !f.OK && f.Action == "undo" && f.Confirm != nil:
			// D142: the folder changed after the task finished: ask in place.
			a.folderConfirm[f.TaskID] = f.Confirm
		case f.OK && (f.Action == "undo" || f.Action == "keep"):
			a.askFolder(f.TaskID) // the section says what became of it
		case f.OK && f.Action == "merge":
			c.Toast(a.L.T("result.merged.toast", title, short(f.Ref)))
		case f.OK && f.Action == "open_pr":
			c.Toast(a.L.T("result.pr.toast", f.Ref))
		case !f.OK && f.Action == "open_pr":
			// Said on the task itself, where it stays (prFailureLine).
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
