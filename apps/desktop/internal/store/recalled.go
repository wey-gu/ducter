package store

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// Recalled is one 想起了 / Remembered line (D304): the memory a reply leaned
// on, and the seq of its own event (what Forget names).
type Recalled struct {
	Seq int64
	protocol.MemoryRecalled
}

// RecalledFor is the 想起了 line under the message at seq, unless the person
// had it forgotten on any client (MemView.Forgotten).
func (s *Store) RecalledFor(seq int64) *Recalled {
	r := s.Recalled[seq]
	if r == nil {
		return nil
	}
	if s.Mem != nil {
		for _, f := range s.Mem.Forgotten {
			if f == r.Seq {
				return nil
			}
		}
	}
	return r
}
