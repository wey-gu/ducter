package views

import (
	"sort"
	"strings"
)

// The menu bar extra (D71): with the window closed, the clay partner in
// the macOS menu bar, and in its menu what needs you, each with Go and
// Hold, then Open Ducter. main.go draws it; this says what is in it.

// TrayDecision is one open decision as the menu shows it.
type TrayDecision struct {
	ID, Question, GoLabel, Task string
	// CanGo: a Go of its own (always, today); Reply opens the window.
	Reversible bool
}

// TrayDecisions are the decisions open now, oldest first, at most max.
func (a *App) TrayDecisions(max int) []TrayDecision {
	if !a.S.Welcomed {
		return nil
	}
	ds := a.S.OpenDecisions()
	sort.Slice(ds, func(i, j int) bool { return ds[i].Seq < ds[j].Seq })
	var out []TrayDecision
	for _, d := range ds {
		if len(out) == max {
			break
		}
		td := TrayDecision{ID: d.DecisionID, Question: oneLine(a.questionOf(d), 60), GoLabel: oneLine(d.GoLabel, 32), Reversible: d.Reversible}
		if d.Where != nil { // D157: the where ask in the user's words
			td.GoLabel = a.goLabel(d)
		}
		if t := a.S.Task(d.TaskID); t != nil {
			td.Task = t.Title()
		}
		out = append(out, td)
	}
	return out
}

// TraySignature changes whenever the menu would: the decisions and the
// language.
func (a *App) TraySignature() string {
	var b strings.Builder
	b.WriteString(string(a.L.Lang))
	for _, d := range a.TrayDecisions(8) {
		b.WriteString("|" + d.ID)
	}
	return b.String()
}

// oneLine is text on one line, cut at max runes with an ellipsis.
func oneLine(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > max {
		return string(r[:max-1]) + "…"
	}
	return s
}
