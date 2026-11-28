package views

// D517: the person's one count, from one source. Every number that says
// "needs you" (the Dock badge, the menu bar, a partner's badge in the list
// of partners, the conversation's line and On hand's head) counts the
// items needsYou returns, and On hand draws each of them under 等你 with
// its one action. Before, three counts disagreed: the badges counted the
// tasks that ask and the open questions (the home's count of a partner's
// questions also held offers and questions put off till later), while On
// hand's head also counted what stopped, what didn't work out and a PR
// ready to merge; and a group card whose part stopped stood under 在做 or
// 在等, so the head said "2 stopped" and the list showed neither.
//
// What only needs a look (a stop, a failure, a PR ready to merge) leaves
// the count once the person has opened it after it last changed (on this
// device); a question leaves it when it is answered.

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// onDay: at falls on now's local date (a zero time counts as today).
func onDay(at, now time.Time) bool {
	if at.IsZero() {
		return true
	}
	y, m, d := now.Date()
	ay, am, ad := at.In(now.Location()).Date()
	return ay == y && am == m && ad == d
}

// needItem is one thing the person's count counts.
type needItem struct {
	task    *store.Task
	group   string // a stopped line (D360), counted once as the line
	dec     *store.DecisionState
	ask     *protocol.PartnerAsk
	keep    string // a truth item that lives on a Keep or a routine, with no task row
	partner string
}

// looked: a stop, a failure or a PR ready to merge the person opened after
// it last changed (this device's seen mark). A question is never "looked".
func (a *App) looked(task *store.Task) bool {
	if task == nil || task.Attention() == protocol.NeedsYou || task.Card == nil || task.Card.UpdatedAt == "" {
		return false
	}
	seen := store.ParseTime(a.Local.SeenAt(task.ID))
	return !seen.IsZero() && !store.ParseTime(task.Card.UpdatedAt).After(seen)
}

// needsYouIn is what needs the person on a board: its tasks (and stopped
// lines) always, the questions of no task with all (they belong to no
// project's lens).
//
// D661 (research/245 §3.3): when the snapshot carries core's one truth, the items and only
// the items in its needs-you list are the person's count, in 等你's group order; the old split is
// the fallback for a home without it.
func (a *App) needsYouIn(b store.Board, all bool) []needItem {
	if a.S.OnHand != nil && a.S.OnHand.Truth != nil {
		return a.needsYouOfTruth(b, all)
	}
	return a.needsYouOfSplit(b, all)
}

// needsYouOfTruth builds 等你 from the snapshot's one truth (D661, research/245 §3.3): the
// truth's needs-you items, a stopped line counting once. Nothing outside that list is added.
func (a *App) needsYouOfTruth(b store.Board, all bool) []needItem {
	th := a.S.OnHand.Truth
	onBoard := map[string]bool{}
	for _, l := range b.Lanes {
		for _, x := range l {
			onBoard[x.ID] = true
		}
	}
	needs := map[string]bool{}
	for _, it := range th.NeedsYou {
		if it.TaskID != "" {
			needs[it.TaskID] = true
		}
	}
	// A stopped line (D360) counts once: if any of its parts is in the truth's needs-you, the
	// card is the item and those parts are not counted again.
	inLine := map[string]bool{}
	var out []needItem
	for _, g := range a.boardGroups(b) {
		if g.stopped == nil {
			continue
		}
		hit := false
		for id := range g.ids {
			if needs[id] {
				hit = true
				break
			}
		}
		if !hit {
			continue
		}
		who := protocol.DefaultPartner
		for id := range g.ids {
			inLine[id] = true
			if x := a.S.Task(id); x != nil {
				who = a.taskPartner(x)
			}
		}
		out = append(out, needItem{group: g.g.ID, partner: who})
	}
	for _, it := range th.NeedsYou {
		switch {
		case it.TaskID != "":
			// A part of a stopped line is the line's; a task off this board (another lens) is not
			// in this count.
			if inLine[it.TaskID] || !onBoard[it.TaskID] {
				continue
			}
			x := a.S.Task(it.TaskID)
			if x == nil {
				continue
			}
			out = append(out, needItem{task: x, partner: a.taskPartner(x)})
		case it.DecisionID != "":
			if !all {
				continue
			}
			d := a.S.Decisions[it.DecisionID]
			if d == nil {
				d = &store.DecisionState{Decision: protocol.Decision{DecisionID: it.DecisionID, Question: it.WaitsFor}}
			}
			out = append(out, needItem{dec: d, partner: personaOr(it.Persona)})
		case it.AskID != "":
			if !all {
				continue
			}
			x := protocol.PartnerAsk{Persona: it.Persona, DecisionID: it.AskID, Question: it.WaitsFor, At: it.Since}
			out = append(out, needItem{ask: &x, partner: personaOr(it.Persona)})
		case it.KeepID != "" || it.RoutineID != "":
			if !all {
				continue
			}
			out = append(out, needItem{keep: firstNonEmpty(it.KeepID, it.RoutineID), partner: personaOr(it.Persona)})
		}
	}
	return out
}

// personaOr is the partner an item belongs to, the default when it names none.
func personaOr(p string) string {
	if p == "" {
		return protocol.DefaultPartner
	}
	return p
}

// needsYouOfSplit is the old count from the board's split: the fallback for a home that does not
// carry the one truth.
func (a *App) needsYouOfSplit(b store.Board, all bool) []needItem {
	sp := a.splitOf(b)
	inLine := map[string]bool{}
	var out []needItem
	for _, g := range a.boardGroups(b) {
		if g.stopped == nil {
			continue
		}
		who := protocol.DefaultPartner
		for id := range g.ids {
			inLine[id] = true
			if x := a.S.Task(id); x != nil {
				who = a.taskPartner(x)
			}
		}
		out = append(out, needItem{group: g.g.ID, partner: who})
	}
	for _, l := range [][]*store.Task{sp.needs, sp.stopped, sp.ready, sp.failed} {
		for _, x := range l {
			// A part that didn't work out in a stopped line is the line's.
			if x.Attention() == protocol.Failed && inLine[x.ID] {
				continue
			}
			out = append(out, needItem{task: x, partner: a.taskPartner(x)})
		}
	}
	if all {
		for _, d := range a.partnerDecisions() {
			out = append(out, needItem{dec: d, partner: a.shownPartnerID()})
		}
		for _, x := range a.otherAsks() {
			x := x
			out = append(out, needItem{ask: &x, partner: x.Persona})
		}
	}
	return out
}

// needsYou is the person's one count's items, across partners.
func (a *App) needsYou() []needItem { return a.needsYouIn(a.S.Board(), true) }

// needsOf counts the items of one partner ("" for all).
func needsOf(items []needItem, partner string) int {
	if partner == "" {
		return len(items)
	}
	n := 0
	for _, it := range items {
		if it.partner == partner {
			n++
		}
	}
	return n
}
