package store

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// DidState is what 替你做过的 / Done for you last heard (D300): the newest
// answer to the window's query.
type DidState struct {
	// Result is the last did_result; Version bumps on each.
	Result  *protocol.DidFrame
	Version int
}

func (s *Store) applyDid(f protocol.ServerFrame) {
	if f.DidFor == nil {
		return
	}
	s.Did.Result = f.DidFor
	s.Did.Version++
}
