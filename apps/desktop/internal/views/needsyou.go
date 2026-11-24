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
func (a *App) needsYouIn(b store.Board, all bool) []needItem {
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
