package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D544: a task that keeps going on its own (a Keep's rounds, a task in
// rounds) keeps who it is while its long transcript is read. Once its head is
// out of view (a task in rounds opens at its end, so at once), a slim line
// under the bar says what the person needs at a glance while reading round
// 302's words: that it is a Keep (its lantern and 看守中), what waits for
// them, when the next round comes or that one runs now, and which round
// this is; each fact its own element (D291). A click opens the Keep's page;
// a task in rounds without a Keep goes back to its head. The web's
// loop-line.tsx says the same.

type loopFacts struct {
	keep   *protocol.KeepSheet
	words  []string
	needs  string
	round  int
	rounds bool
}

// loopFactsOf is what the line says for a task, or ok false for an ordinary one.
func (a *App) loopFactsOf(task *store.Task) (f loopFacts, ok bool) {
	if id := a.keepOfTask(task.ID); id != "" && a.S.OnHand != nil {
		for i := range a.S.OnHand.Keeps {
			k := &a.S.OnHand.Keeps[i]
			if k.ID != id {
				continue
			}
			f.keep = k
			f.words = []string{a.L.T("keep.section")}
			if b := a.keepBeat(k); b != "" {
				f.words = append(f.words, b)
			}
			for _, x := range a.keepFacts(k) {
				if x.needs {
					f.needs = x.text
					break
				}
			}
			if p := a.S.KeepPages[id]; p != nil {
				f.round = len(p.Rounds)
			}
			return f, true
		}
	}
	if task.Card == nil || task.Card.Rounds == nil {
		return f, false
	}
	r := task.Card.Rounds
	f.rounds = true
	if r.EveryMs > 0 {
		f.words = append(f.words, a.L.T("og.round.every", a.duration(time.Duration(r.EveryMs)*time.Millisecond)))
	}
	switch {
	case r.Paused:
		f.words = append(f.words, a.L.T("keep.beat.paused"))
	case r.NextAt != "":
		f.words = append(f.words, a.L.T("keep.beat.next", a.soon(store.ParseTime(r.NextAt))))
	default:
		f.words = append(f.words, a.L.T("keep.beat.running"))
	}
	return f, true
}

// loopAsked is the Keeps whose page this window asked for, for the round's number.
var loopAsked = map[string]bool{}

// loopLine draws the line over the top of the task's column while its head
// is out of view.
func (a *App) loopLine(c *ui.Context, task *store.Task, ls *ui.ListState) {
	f, ok := a.loopFactsOf(task)
	if !ok {
		return
	}
	if f.keep != nil && a.S.KeepPages[f.keep.ID] == nil && !loopAsked[f.keep.ID] && a.S.Welcomed {
		loopAsked[f.keep.ID] = true
		a.send(protocol.KeepReq{T: "keep", ID: f.keep.ID})
	}
	first, last := ls.Visible()
	if last >= first && first == 0 {
		return // the head is in view: it says all of this itself
	}
	t := a.T
	c.After(30 * time.Second) // the next round's time, kept current
	words := append([]string{}, f.words...)
	if f.round > 0 {
		words = append(words, a.L.T("loop.round", f.round))
	}
	said := words
	if f.needs != "" {
		said = append([]string{words[0], f.needs}, words[1:]...)
	}
	facts := make([]pillFact, len(said))
	for i, w := range said {
		facts[i] = pillFact{text: w, lead: i == 0, needs: w == f.needs}
	}
	ui.Row(c.Key("loopdock")).Absolute().Top(t.S2).Left(t.S5).Right(t.S5).Justify(ui.Center).Children(func() {
		mark := func() {
			if f.keep != nil {
				a.keepMark(c, "loop", f.keep.Life, 20)
			} else {
				ui.Box(c.Key("rep")).Size(18, 18).Draw(drawPastGlyph("repeat", t.InkSoft))
			}
		}
		if a.factPill(c, "loopline", spoken(a.L, said...), mark, facts) {
			if f.keep != nil {
				a.openKeep(f.keep.ID)
			} else {
				ls.ScrollTo(0, ui.Start)
			}
		}
	})
}
