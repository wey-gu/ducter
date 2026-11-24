package views

// D508: a task whose result is an open pull request is not done. Its work
// goes on in the PR (CI, reviews, the merge), so On hand stands it under
// where that PR is: ready to merge waits for you (等你, with the one thing
// to do, 到 GitHub 合并); every other open phase waits (在等); merged or
// closed is done. Its row says the phase in plain words with its facts,
// each its own element, never a local merge or a new draft PR. The web
// reads the same (apps/web/src/onhand-pr.tsx); the phase is
// store.SayPR, over the protocol's shared fixture.

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// prRow is the open PR a finished task's work goes on in, where it stands
// and where the board stands it ("needs" or "waiting"), or nil.
func prRow(task *store.Task) (*protocol.TaskPR, store.PRSaid, string) {
	att := task.Attention()
	if att != protocol.Done && att != protocol.DoneClaimed {
		return nil, store.PRSaid{}, ""
	}
	return task.PRGoesOn()
}

// hasPR: the task made or holds a pull request (its card's, its report's,
// a draft PR Ducter opened). Then the branch lives in that PR: no local
// merge and no new draft PR is offered.
func hasPR(task *store.Task) bool {
	if task.Card != nil && len(task.Card.PRs) > 0 {
		return true
	}
	label, _ := outcomeOf(task)
	return label != ""
}

// prAct is what a row says of its branch beside its +a −d: 已合并 once its
// PR merged; nothing while a PR is open (its line says where it is); else
// what the person did with it from Ducter (D216).
func prAct(task *store.Task) string {
	if task.Card != nil {
		if p := store.PROf(task.Card.PRs); p != nil {
			if p.State == "merged" {
				return "merge"
			}
			return ""
		}
	}
	return integrated(task)
}

// prWords is a PR's phase in the person's words.
func (a *App) prWords(task *store.Task, s store.PRSaid) string {
	sep := a.L.T("onhand.prs.sep")
	switch s.Phase {
	case store.PRChanges:
		return a.L.T("onhand.prs.changes", strings.Join(s.By, sep))
	case store.PRConflict:
		base := task.Place().BaseBranch
		if base == "" {
			base = "main"
		}
		return a.L.T("onhand.prs.conflict", base)
	}
	return a.L.T("onhand.prs." + s.Phase)
}

// prFacts are what a row says beside the phase, each its own element
// (D291): who it waits on or who approved, what failed, how CI stands.
func (a *App) prFacts(s store.PRSaid) []string {
	sep := a.L.T("onhand.prs.sep")
	var out []string
	switch s.Phase {
	case store.PRReview:
		if len(s.By) > 0 {
			out = append(out, a.L.T("onhand.prs.awaiting", strings.Join(s.By, sep)))
		}
	case store.PRReady:
		if len(s.By) > 0 {
			out = append(out, a.L.T("onhand.prs.approved", strings.Join(s.By, sep)))
		}
	case store.PRFailing:
		if len(s.Failed) > 0 {
			out = append(out, a.L.T("onhand.prs.failed", strings.Join(s.Failed, sep)))
		}
	}
	if c := s.Checks; c != nil && s.Phase != store.PRFailing && s.Phase != store.PRReady {
		if c.Passed == c.Total {
			out = append(out, a.L.T("onhand.prs.allpassed"))
		} else {
			out = append(out, a.L.T("onhand.prs.passed", c.Passed, c.Total))
		}
	}
	return out
}

// prGroup is what a row says of its PR, in one sentence's order (D508): its
// chip, its diff, then where it stands (the phase, its facts) or 已合并;
// each its own element, never spread to the row's far edge.
func (a *App) prGroup(c *ui.Context, task *store.Task, pr *protocol.TaskPR, s store.PRSaid, stands string) {
	t := a.T
	a.outcomeChip(c, "chip", task)
	if ch := taskChanges(task); ch != nil {
		ui.Row(c.Key("stat")).Gap(t.S1 + 2).Shrink(0).Children(func() {
			if ch.Adds > 0 {
				uiText(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).FontFeatures("tnum")
			}
			if ch.Dels > 0 {
				uiText(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).FontFeatures("tnum")
			}
		})
	}
	if pr == nil {
		if act := prAct(task); act != "" {
			key := "onhand.pr.draft"
			if act == "merge" {
				key = "onhand.pr.merged"
			}
			uiText(c.Key("pr"), a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
		}
		return
	}
	ink := t.Waiting.Ink
	if stands == "needs" {
		ink = t.NeedsYou.Ink
	}
	uiText(c.Key("ph"), a.prWords(task, s)).FontSize(t.SM).FontWeight(600).TextColor(ink).SingleLine().Shrink(1).MinWidth(0)
	for i, f := range a.prFacts(s) {
		uiText(c.Key(fmt.Sprint("pf", i)), f).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
	}
}

// prLine is a PR row's one quiet line: the phase in the state's ink, then
// its facts in the muted ink, each its own element, wrapping.
func (a *App) prLine(c *ui.Context, task *store.Task, s store.PRSaid, stands string) {
	t := a.T
	ink := t.Waiting.Ink
	if stands == "needs" {
		ink = t.NeedsYou.Ink
	}
	ui.Row(c.Key("prl")).Gap(t.S3).Wrap().AlignItems(ui.Baseline).MinWidth(0).Children(func() {
		uiText(c.Key("ph"), a.prWords(task, s)).FontSize(t.SM).FontWeight(600).LineHeight(1.45).TextColor(ink).SingleLine().Shrink(1).MinWidth(0)
		for i, f := range a.prFacts(s) {
			uiText(c.Key(fmt.Sprint("pf", i)), f).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
		}
	})
}
