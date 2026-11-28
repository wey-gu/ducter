package store

// Older messages (D509). A window opens on the newest stretch of the
// conversation (the home's last 200 channel events); scrolling up toward
// its top asks for the page before the oldest event held, and the next
// page as the reader keeps going, until the home says none remain.
//
// A page is older than everything held, so it is folded on a scratch store
// of its own, in seq order as the Log wrote it, and only then joined: its
// rows go in front, and what it knows of a job, a decision, a find or a
// set fills in only what this store does not know yet. Whatever this store
// already holds came later and wins (a status, a resolution, the latest
// lines of an ask); a wait or an armed watch from back then is history,
// not news, and changes nothing.

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// OlderState is the conversation's paging back (D509).
type OlderState struct {
	// From is the oldest channel seq held: everything from it to the
	// newest is held whole. 0 before anything came.
	From int64
	// Done is set once the home said nothing older remains.
	Done bool
	// Asked is the beforeSeq of the page on its way, 0 when none is.
	Asked int64
}

// OlderPage is how many events one page asks for.
const OlderPage = 300

// MoreOlder reports whether an older page can be asked for now: there is
// something held, the home has not said it was all, and none is on its way.
func (s *Store) MoreOlder() bool {
	return s.Older.From > 1 && !s.Older.Done && s.Older.Asked == 0 && s.Welcomed
}

// OlderAsked notes the page before seq is on its way.
func (s *Store) OlderAsked(before int64) { s.Older.Asked = before }

// LoadingOlder reports whether a page is on its way.
func (s *Store) LoadingOlder() bool { return s.Older.Asked != 0 }

// heldChannel notes a channel event held, for the paging's start.
func (s *Store) heldChannel(seq int64) {
	if s.Older.From == 0 || seq < s.Older.From {
		s.Older.From = seq
	}
}

// applyOlder joins a channel_history page (D509).
func (s *Store) applyOlder(f protocol.ServerFrame) {
	if f.BeforeSeq == 0 || f.BeforeSeq != s.Older.Asked {
		return // not the page this conversation asked for (another partner's, or an old socket's)
	}
	s.Older.Asked = 0
	if !f.More {
		s.Older.Done = true
	}
	if len(f.Events) == 0 {
		s.Older.Done = true
		return
	}
	sc := New()
	sc.Welcomed = true
	for _, ev := range f.Events {
		if ev.Seq < f.BeforeSeq && ev.Stream == "channel" {
			sc.ApplyEvent(ev)
		}
	}
	s.joinOlder(sc)
	for _, ev := range f.Events {
		if ev.Seq < f.BeforeSeq && ev.Stream == "channel" {
			s.heldChannel(ev.Seq)
		}
	}
	if f.More {
		// The page answers for everything from its first event on.
		s.Older.From = min(s.Older.From, f.Events[0].Seq)
	}
}

// joinOlder puts the scratch store's rows in front of this one's, and fills
// in what this store did not know.
func (s *Store) joinOlder(sc *Store) {
	// A note or a set revised later already stands where its newest is.
	revised := map[string]bool{}
	for id, e := range s.notes {
		revised[id] = true
		if e.Finds != nil && e.Finds.Revises != "" {
			revised[e.Finds.Revises] = true
		}
	}
	jobRow := map[string]*Entry{}
	for _, e := range s.Channel {
		if e.Job != nil {
			jobRow[e.Job.ID] = e
		}
	}
	added := map[*Entry]bool{}
	var front []*Entry
	// A job's line here, from a status before its ack came: it moves to the
	// job's first word, where a fold in order puts it.
	moved := map[*Entry]bool{}
	for _, e := range sc.Channel {
		if _, held := s.bySeq[e.FirstSeq]; held {
			continue
		}
		switch {
		case e.Finds != nil && revised[e.Finds.NoteID]:
			continue
		case e.Set != nil && s.sets[e.Set.SetID] != nil:
			continue
		case e.Peer != nil && e.Peer.Direction == "in" && e.Peer.State == "set_aside" && s.SetAside[e.Peer.From+"|"+firstN(e.Event.TS, 10)] > 0:
			continue // that day's one line already stands
		case e.Job != nil:
			if j := s.Jobs[e.Job.ID]; j != nil {
				if j.Ack == nil {
					j.Ack = e.Job.Ack
				}
				if j.Status == nil {
					j.Status = e.Job.Status
				}
				if row := jobRow[j.ID]; row != nil {
					moved[row] = true
					s.bySeq[row.FirstSeq] = nil
				}
				e.Job = j
			}
		case e.User != nil:
			if w := s.asksWaiting[e.Event.Seq]; w != nil {
				e.Asks = w // the latest lines came first
				delete(s.asksWaiting, e.Event.Seq)
			}
			if cs := s.cardsWaiting[e.Event.Seq]; len(cs) > 0 {
				e.Cards = cs
				delete(s.cardsWaiting, e.Event.Seq)
			}
		}
		added[e] = true
		front = append(front, e)
	}
	if len(moved) > 0 {
		kept := s.Channel[:0]
		for _, e := range s.Channel {
			if !moved[e] {
				kept = append(kept, e)
			}
		}
		s.Channel = kept
	}
	// Everything in the page is older than everything held: it goes in front.
	for _, e := range front {
		s.bySeq[e.Event.Seq] = e
		s.bySeq[e.FirstSeq] = e
	}
	s.Channel = append(front, s.Channel...)
	for seq, e := range sc.bySeq {
		if _, held := s.bySeq[seq]; held {
			continue
		}
		if e != nil && !added[e] {
			e = nil
		}
		s.bySeq[seq] = e
	}
	for id, j := range sc.Jobs {
		if s.Jobs[id] == nil {
			s.Jobs[id] = j
		}
	}
	for id, d := range sc.Decisions {
		m := s.Decisions[id]
		switch {
		case m == nil:
			s.Decisions[id] = d
		case m.Seq == 0:
			// Known only by what came later (its resolution, its words): the question itself.
			m.Decision, m.Seq, m.AskedAt = d.Decision, d.Seq, d.AskedAt
			if m.Said == "" {
				m.Said = d.Said
			}
		}
	}
	fill := func(dst, src map[string]*protocol.FindState) {
		for k, v := range src {
			if dst[k] == nil {
				dst[k] = v
			}
		}
	}
	fill(s.FindStates, sc.FindStates)
	fill(s.FindSends, sc.FindSends)
	for k, v := range sc.FindAsks {
		if _, ok := s.FindAsks[k]; !ok {
			s.FindAsks[k] = v
		}
	}
	for k, v := range sc.FindSeq {
		if _, ok := s.FindSeq[k]; !ok {
			s.FindSeq[k] = v
		}
	}
	for k, v := range sc.DecisionCalls {
		if s.DecisionCalls[k] == nil {
			s.DecisionCalls[k] = v
		}
	}
	for k, v := range sc.notes {
		if s.notes[k] == nil && added[v] {
			s.notes[k] = v
		}
	}
	for k, v := range sc.sets {
		if s.sets == nil {
			s.sets = map[string]*Entry{}
		}
		if s.sets[k] == nil && added[v] {
			s.sets[k] = v
		}
	}
	for k, v := range sc.Recalled {
		if s.Recalled == nil {
			s.Recalled = map[int64]*Recalled{}
		}
		if s.Recalled[k] == nil {
			s.Recalled[k] = v
		}
	}
	for k, v := range sc.OutOps {
		if s.OutOps == nil {
			s.OutOps = map[string]*Entry{}
		}
		if s.OutOps[k] == nil {
			s.OutOps[k] = v
		}
	}
	for k, v := range sc.sentReplies {
		if s.sentReplies == nil {
			s.sentReplies = map[string]bool{}
		}
		s.sentReplies[k] = s.sentReplies[k] || v
	}
	for k, v := range sc.Pings {
		if s.Pings == nil {
			s.Pings, s.pingAt = map[int64]*PingGroup{}, map[string]int64{}
		}
		if s.Pings[k] == nil {
			s.Pings[k] = v
		}
	}
	for k, v := range sc.pingAt {
		if s.pingAt == nil {
			s.pingAt = map[string]int64{}
		}
		if _, ok := s.pingAt[k]; !ok {
			s.pingAt[k] = v
		}
	}
	for k, v := range sc.SetAside {
		if s.SetAside == nil {
			s.SetAside = map[string]int{}
		}
		s.SetAside[k] += v
	}
	for k, v := range sc.asksWaiting {
		if s.asksWaiting == nil {
			s.asksWaiting = map[int64]*protocol.Asks{}
		}
		if s.asksWaiting[k] == nil {
			s.asksWaiting[k] = v
		}
	}
	for k, v := range sc.cardsWaiting {
		if s.cardsWaiting == nil {
			s.cardsWaiting = map[int64][]protocol.SubjectCard{}
		}
		if s.cardsWaiting[k] == nil {
			s.cardsWaiting[k] = v
		}
	}
	if len(sc.TaskPeers) > 0 {
		s.TaskPeers = append(append([]*Entry{}, sc.TaskPeers...), s.TaskPeers...)
	}
	for k, v := range sc.BridgeReceipts {
		if s.BridgeReceipts == nil {
			s.BridgeReceipts = map[string]*protocol.BridgeReceipt{}
		}
		if s.BridgeReceipts[k] == nil {
			s.BridgeReceipts[k] = v
		}
	}
	s.ReadUpTo = max(s.ReadUpTo, sc.ReadUpTo)
	s.LastUserSeq = max(s.LastUserSeq, sc.LastUserSeq)
}
