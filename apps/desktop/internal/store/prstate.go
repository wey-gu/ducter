package store

import (
	"sort"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D508: a task whose result is an open pull request is not done: its work
// goes on in the PR (CI, reviews, the merge), and On hand stands it under
// where that PR stands. The Go twin of packages/protocol/src/pr-state.ts,
// over the same cases (fixtures/pr-state.json).

// PR phases: CI running, a check failed, waiting for a reviewer, changes
// asked for, a conflict with its base, still a draft, ready to merge,
// merged, closed without merging, open with nothing read yet.
const (
	PRChecks   = "checks"
	PRFailing  = "failing"
	PRReview   = "review"
	PRChanges  = "changes"
	PRConflict = "conflict"
	PRDraft    = "draft"
	PRReady    = "ready"
	PRMerged   = "merged"
	PRClosed   = "closed"
	PROpen     = "open"
)

// PRChecksSaid and PRSaid are the protocol's (a helper's item carries one).
type (
	PRChecksSaid = protocol.PRChecksSaid
	PRSaid       = protocol.PRSaid
)

func firstNames(xs []string) []string {
	var out []string
	for _, x := range xs {
		if x != "" && len(out) < 3 {
			out = append(out, x)
		}
	}
	return out
}

// SayPR is where a PR stands, from its state and its last look.
func SayPR(p protocol.TaskPR) PRSaid {
	switch p.State {
	case "merged":
		return PRSaid{Phase: PRMerged}
	case "closed":
		return PRSaid{Phase: PRClosed}
	}
	st := p.Standing
	if st == nil {
		return PRSaid{Phase: PROpen}
	}
	c := st.Checks
	var checks *PRChecksSaid
	if c != nil && c.Total > 0 {
		checks = &PRChecksSaid{Passed: c.Passed, Total: c.Total, Pending: len(c.Pending)}
	}
	if len(st.Changes) > 0 {
		var by []string
		for _, x := range st.Changes {
			by = append(by, x.By)
		}
		return PRSaid{Phase: PRChanges, By: firstNames(by), Checks: checks}
	}
	if c != nil && len(c.Failed) > 0 {
		return PRSaid{Phase: PRFailing, Failed: firstNames(c.Failed), Checks: checks}
	}
	if st.Merge == "dirty" {
		return PRSaid{Phase: PRConflict, Checks: checks}
	}
	if st.Draft {
		return PRSaid{Phase: PRDraft, Checks: checks}
	}
	pending := 0
	if c != nil {
		pending = len(c.Pending)
	}
	if len(st.ApprovedBy) == 0 {
		if pending > 0 && len(st.Awaiting) == 0 {
			return PRSaid{Phase: PRChecks, Checks: checks}
		}
		return PRSaid{Phase: PRReview, By: firstNames(st.Awaiting), Checks: checks}
	}
	if pending > 0 {
		return PRSaid{Phase: PRChecks, Checks: checks}
	}
	return PRSaid{Phase: PRReady, By: firstNames(st.ApprovedBy), Checks: checks}
}

// PRStands is where On hand stands a finished task under its PR: ready
// waits for the person, merged and closed are done, the rest wait.
func PRStands(phase string) string {
	switch phase {
	case PRReady:
		return "needs"
	case PRMerged, PRClosed:
		return "done"
	}
	return "waiting"
}

// PROf is the PR a task's row speaks of: an open one (the newest read),
// else the newest.
func PROf(prs []protocol.TaskPR) *protocol.TaskPR {
	if len(prs) == 0 {
		return nil
	}
	s := append([]protocol.TaskPR(nil), prs...)
	sort.SliceStable(s, func(i, j int) bool { return s[i].At > s[j].At })
	for i := range s {
		if s[i].State == "open" {
			return &s[i]
		}
	}
	return &s[0]
}

// PRGoesOn is the PR a finished task's work goes on in, with where it
// stands, or nil when none is open: then the task is done as it is.
func (t *Task) PRGoesOn() (*protocol.TaskPR, PRSaid, string) {
	if t.Card == nil {
		return nil, PRSaid{}, ""
	}
	pr := PROf(t.Card.PRs)
	if pr == nil {
		return nil, PRSaid{}, ""
	}
	said := SayPR(*pr)
	stands := PRStands(said.Phase)
	if stands == "done" {
		return nil, PRSaid{}, ""
	}
	return pr, said, stands
}
