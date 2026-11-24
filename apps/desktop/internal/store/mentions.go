package store

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// MentionsState is what the composers' @ and / lists hold (D534): the newest
// @ answer and each place's / list ("" the partner's, else a task's id).
type MentionsState struct {
	List  *protocol.MentionList
	Slash map[string]*protocol.SlashList
	// Version bumps on every answer.
	Version int
}

func (s *Store) applyMentions(f protocol.ServerFrame) {
	if f.Mentions != nil {
		s.Mentions.List = f.Mentions
	}
	if f.Slash != nil {
		if s.Mentions.Slash == nil {
			s.Mentions.Slash = map[string]*protocol.SlashList{}
		}
		s.Mentions.Slash[f.Slash.TaskID] = f.Slash
	}
	s.Mentions.Version++
}
