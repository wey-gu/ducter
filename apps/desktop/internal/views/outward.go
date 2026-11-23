package views

// D496: what a task sent out, in plain words ("改了 PR #10847 的说明和标签"),
// worded from the act's facts (store/outward.go), never the command. The
// port of apps/web/src/outward.ts; the keys are i18n/outward.go's.

import (
	"slices"
	"strconv"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

var outwardFields = []string{"title", "body", "labels", "reviewers", "assignees", "base", "milestone", "projects"}

func (a *App) outwardList(xs []string) string {
	if len(xs) <= 1 {
		return strings.Join(xs, "")
	}
	return strings.Join(xs[:len(xs)-1], a.L.T("out.sep")) + a.L.T("out.and") + xs[len(xs)-1]
}

// outsideSentence is one row of Sent out as a sentence; branch is the
// task's own, for a push that names none.
func (a *App) outsideSentence(row store.OutsideAct, branch string) string {
	act := row.Act
	pr, issue := a.L.T("out.pr.this"), a.L.T("out.issue.this")
	if act.N > 0 {
		pr, issue = a.L.T("out.pr", strconv.Itoa(act.N)), a.L.T("out.issue", strconv.Itoa(act.N))
	}
	var s string
	switch act.Kind {
	case "push":
		switch {
		case act.Target != "":
			s = a.L.T("out.push", act.Target)
		case branch != "":
			s = a.L.T("out.push", branch)
		default:
			s = a.L.T("out.push.bare")
		}
	case "pr_create":
		if act.N == 0 {
			pr = a.L.T("out.pr.new")
		}
		s = a.L.T("out.pr_create", pr)
	case "issue_create":
		if act.N == 0 {
			issue = a.L.T("out.issue.new")
		}
		s = a.L.T("out.issue_create", issue)
	case "pr_edit", "issue_edit":
		noun := pr
		if act.Kind == "issue_edit" {
			noun = issue
		}
		var f []string
		for _, x := range outwardFields {
			if slices.Contains(act.Fields, x) {
				f = append(f, a.L.T("out.f."+x))
			}
		}
		if len(f) > 0 {
			s = a.L.T("out.edit", noun, a.outwardList(f))
		} else {
			s = a.L.T("out.edit.bare", noun)
		}
	case "pr_review":
		r := act.Review
		if r == "" {
			r = "comment"
		}
		s = a.L.T("out.pr_review."+r, pr)
	case "pr_comment", "pr_merge", "pr_close", "pr_reopen", "pr_ready":
		s = a.L.T("out."+act.Kind, pr)
	case "issue_comment", "issue_close", "issue_reopen", "issue_delete":
		s = a.L.T("out."+act.Kind, issue)
	case "http":
		if act.Target != "" {
			s = a.L.T("out.http", act.Target)
		} else {
			s = a.L.T("out.http.bare")
		}
	default:
		s = a.L.T("out."+act.Kind, act.Target)
	}
	if row.Count > 1 {
		return a.L.T("out.times", s, strconv.Itoa(row.Count))
	}
	return s
}
