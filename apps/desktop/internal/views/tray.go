package views

import (
	"fmt"
	"sort"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The menu bar extra (D71, D306): the clay partner in the macOS menu bar.
// Its mark says how the whole stands, in three states and no number: quiet,
// at work (the eyes look down; still a template), and needs you (a soft clay
// dot, the only state that draws the eye). Its menu: On hand's one sentence
// (D287), what needs you, each with Go and Hold where it can be answered
// there and Open the task, then Open Ducter, Settings, and Don't show in
// the menu bar. main.go draws it; this says what is in it.

// TrayDecision is one open decision as the menu shows it.
type TrayDecision struct {
	ID, Question, GoLabel, Task, TaskID string
	// CanGo: a Go of its own (always, today); Reply opens the window.
	Reversible bool
	// InWindow (D233): answered only in the window, where its field is (a
	// key, a pay card's security code): the menu opens Ducter instead of Go.
	InWindow bool
}

// TrayView is everything the menu bar extra shows.
type TrayView struct {
	State theme.TrayState
	// Working and Needs are the counts behind the state (the menu says
	// them; the bar never does).
	Working, Needs int
	// Say is On hand's head sentence over the whole (D287), the menu's first
	// line and the icon's tooltip.
	Say string
	// Label is the item's accessible name (D291 (9), D310): Ducter and how
	// the whole stands, read before the sentence (VoiceOver read only the
	// tooltip before, research/109).
	Label     string
	Decisions []TrayDecision
}

// TrayState is how the whole stands: needs you over working over quiet.
// Waits that rest on their own and finished work are quiet (D306: they are
// not the person's to mind, and a mark that changes for them would ask for
// a look that nothing needs).
func trayState(needs, working int) theme.TrayState {
	switch {
	case needs > 0:
		return theme.TrayNeedsYou
	case working > 0:
		return theme.TrayWorking
	}
	return theme.TrayQuiet
}

// Tray is what the menu bar extra shows now, with at most max decisions.
func (a *App) Tray(max int) TrayView {
	if !a.S.Welcomed {
		return TrayView{State: theme.TrayQuiet, Say: a.L.T("onhand.say.none"), Label: a.trayLabel(theme.TrayQuiet)}
	}
	b := a.S.Board()
	n := a.stateCounts(b, "")
	needs := a.WaitingCount()
	state := trayState(needs, n[1])
	return TrayView{
		State:     state,
		Label:     a.trayLabel(state),
		Working:   n[1],
		Needs:     needs,
		Say:       autospace(a.headSay(b, "", n)),
		Decisions: a.TrayDecisions(max),
	}
}

// trayLabel is the menu bar item's accessible name: Ducter, then its state
// in the words On hand uses for it.
func (a *App) trayLabel(s theme.TrayState) string {
	word := a.L.T("tray.state.quiet")
	switch s {
	case theme.TrayNeedsYou:
		word = a.L.T("lane.needs_you")
	case theme.TrayWorking:
		word = a.L.T("lane.working")
	}
	return spoken(a.L, "Ducter", word)
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
		if d.Key != nil || (d.Pay != nil && d.Pay.NeedsCvc) {
			td.InWindow = true
		}
		if t := a.S.Task(d.TaskID); t != nil {
			td.Task = t.Title()
			td.TaskID = d.TaskID
		}
		out = append(out, td)
	}
	return out
}

// TraySignature changes whenever the menu or the mark would: the state,
// the sentence, the decisions and the language.
func (a *App) TraySignature() string {
	v := a.Tray(8)
	var b strings.Builder
	fmt.Fprintf(&b, "%s|%d|%s", a.L.Lang, v.State, v.Say)
	for _, d := range v.Decisions {
		b.WriteString("|" + d.ID)
	}
	return b.String()
}

// MenuBarOn reports whether the menu bar extra shows (on unless the person
// turned it off, on this Mac).
func (a *App) MenuBarOn() bool { return a.Local.MenuBar() }

// SetMenuBar shows or takes away the menu bar extra and remembers it.
func (a *App) SetMenuBar(on bool) {
	a.Local.SetMenuBar(on)
	if a.ApplyMenuBar != nil {
		a.ApplyMenuBar(on)
	}
}

// oneLine is text on one line, cut at max runes with an ellipsis.
func oneLine(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > max {
		return string(r[:max-1]) + "…"
	}
	return s
}
