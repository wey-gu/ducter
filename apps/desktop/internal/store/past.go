package store

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// PastState is what 做过的事 / Past tasks last heard (D285): the newest
// answer to the window's query, with every mark changed since applied.
type PastState struct {
	// Result is the last past_result; ResultID its id (the query it answers).
	Result   *protocol.PastFrame
	ResultID string
	// Version bumps on every result and mark, for views that recompute.
	Version int
	// Ongoing is 一直在跑的 / Ongoing's last list (nil until asked).
	Ongoing []protocol.OngoingItem
}

func (s *Store) applyPast(f protocol.ServerFrame) {
	p := f.Past
	if p == nil {
		return
	}
	s.Past.Version++
	switch f.T {
	case "past_result":
		s.Past.Result, s.Past.ResultID = p, p.ID
	case "ongoing_result":
		s.Past.Ongoing = p.Ongoing
	case "past_marked":
		var mark *protocol.PastMark
		if p.Mark != nil {
			m := *p.Mark
			mark = &m
		}
		if r := s.Past.Result; r != nil {
			for i := range r.Items {
				if r.Items[i].TaskID == p.TaskID {
					MarkItem(&r.Items[i], mark)
				}
			}
		}
		for i := range s.Past.Ongoing {
			if s.Past.Ongoing[i].ID == p.TaskID {
				s.Past.Ongoing[i].Mark = mark
			}
		}
		if t := s.Tasks[p.TaskID]; t != nil && t.Card != nil {
			c := *t.Card
			c.Mark = mark
			t.Card = &c
		}
	}
}

// MarkItem puts a mark on an item: a renamed task's title is the person's
// name, the task's own kept as Original.
func MarkItem(it *protocol.PastItem, mark *protocol.PastMark) {
	own := it.Title
	if it.Original != "" {
		own = it.Original
	}
	it.Mark, it.Title, it.Original = mark, own, ""
	if mark != nil && mark.Name != "" && mark.Name != own {
		it.Title, it.Original = mark.Name, own
	}
}
