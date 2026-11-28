package store

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// ShadowState is what the review of what the shadow noticed last heard
// (D674): the newest list, or why it didn't come.
type ShadowState struct {
	Review  *protocol.ShadowReview
	Error   string
	Version int
}

func (s *Store) applyShadow(f protocol.ServerFrame) {
	if f.ShadowFor == nil {
		return
	}
	if f.ShadowFor.Review != nil {
		s.Shadow.Review = f.ShadowFor.Review
		s.Shadow.Error = ""
	} else {
		s.Shadow.Error = f.ShadowFor.Error
	}
	s.Shadow.Version++
}
