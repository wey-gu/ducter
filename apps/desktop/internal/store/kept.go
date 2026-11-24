package store

// One partner's conversation as this window last held it (D541). A switch
// between partners swaps the conversation in place: the one shown is kept,
// the one picked comes back as it was (or from its peek, or empty), and its
// hello asks only for what is newer than its cursor. Everything else in the
// store is the person's, not a partner's (On hand and its tasks, the
// partners, devices, settings, connections) and stays as it is, live.

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// Conv is a conversation kept aside.
type Conv struct{ s Store }

// Persona is whose conversation it is.
func (c *Conv) Persona() string { return c.s.Persona }

// Cursor is the newest seq it holds.
func (c *Conv) Cursor() int64 { return c.s.Cursor }

// Len is how many rows of it are held.
func (c *Conv) Len() int { return len(c.s.Channel) }

// SwapConv puts next's conversation in the store (an empty one for nil)
// and returns the one it held.
func (s *Store) SwapConv(next *Conv) *Conv {
	if next == nil {
		next = &Conv{s: *New()}
	}
	prev := &Conv{}
	moveConv(&prev.s, s)
	moveConv(s, &next.s)
	// A page asked on the way out never lands here (D509).
	s.Older.Asked = 0
	return prev
}

// PeekConv is another partner's conversation from its partner_peek: the
// newest stretch, paged back from as any (D509).
func PeekConv(f protocol.ServerFrame) *Conv {
	s := New()
	s.Apply(protocol.ServerFrame{T: "welcome", Persona: f.Persona, HeadSeq: f.HeadSeq})
	s.Apply(protocol.ServerFrame{T: "events", Events: f.Events})
	if !f.More {
		s.Older.Done = true
	}
	return &Conv{s: *s}
}

// moveConv copies the conversation's own fields from src to dst.
func moveConv(dst, src *Store) {
	dst.Persona, dst.PersonaName = src.Persona, src.PersonaName
	dst.HeadSeq, dst.Cursor, dst.ReadUpTo, dst.ChannelSeq = src.HeadSeq, src.Cursor, src.ReadUpTo, src.ChannelSeq
	dst.Channel, dst.bySeq, dst.Older = src.Channel, src.bySeq, src.Older
	dst.Jobs, dst.Decisions, dst.sentReplies = src.Jobs, src.Decisions, src.sentReplies
	dst.FindStates, dst.FindSends, dst.FindAsks, dst.FindSeq = src.FindStates, src.FindSends, src.FindAsks, src.FindSeq
	dst.DecisionCalls, dst.LastUserSeq = src.DecisionCalls, src.LastUserSeq
	dst.notes, dst.sets = src.notes, src.sets
	dst.asksWaiting, dst.asksAsked, dst.asksWanted = src.asksWaiting, src.asksAsked, src.asksWanted
	dst.First = src.First
	dst.Activity, dst.ActivityAt, dst.ActivityEndedAt = src.Activity, src.ActivityAt, src.ActivityEndedAt
	dst.Recalled, dst.SetAside = src.Recalled, src.SetAside
	dst.Pings, dst.pingAt, dst.lastPing = src.Pings, src.pingAt, src.lastPing
	dst.OutOps, dst.TaskPeers = src.OutOps, src.TaskPeers
	// Pinned and the apps are the default conversation's (D381, D410).
	dst.Pins, dst.PinRefused, dst.Apps, dst.AppIdeas = src.Pins, src.PinRefused, src.Apps, src.AppIdeas
}
