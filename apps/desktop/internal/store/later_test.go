package store

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D382: Ask me later's events on a card, on the phone's fixture: back at its
// time the card has no countdown until it is seen; Decide now brings it back
// with one.
func TestLaterEventsFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/later-events.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Decision json.RawMessage `json:"decision"`
		Steps    []struct {
			Kind string          `json:"kind"`
			TS   string          `json:"ts"`
			Body json.RawMessage `json:"body"`
			Want struct {
				Later     *string `json:"later"`
				BackAt    *string `json:"backAt"`
				DefaultAt *string `json:"defaultAt"`
			} `json:"want"`
		} `json:"steps"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	s := New()
	var dec protocol.Decision
	if err := json.Unmarshal(f.Decision, &dec); err != nil {
		t.Fatal(err)
	}
	s.Apply(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{protocol.NewEvent(1, "2026-11-19T15:00:00.000Z", "default", "channel", protocol.OriginSystem, protocol.KindDecision, dec)}})
	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	for i, st := range f.Steps {
		var body any
		switch st.Kind {
		case protocol.KindDecisionLater:
			body = &protocol.DecisionLater{}
		case protocol.KindDecisionBack:
			body = &protocol.DecisionBack{}
		case protocol.KindDecisionSeen:
			body = &protocol.DecisionSeen{}
		}
		if err := json.Unmarshal(st.Body, body); err != nil {
			t.Fatal(err)
		}
		s.Apply(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{protocol.NewEvent(int64(i+2), st.TS, "default", "channel", protocol.OriginSystem, st.Kind, body)}})
		d := s.Decisions[dec.DecisionID]
		if d.Later != str(st.Want.Later) || d.BackAt != str(st.Want.BackAt) || d.DefaultAt != str(st.Want.DefaultAt) {
			t.Errorf("step %d (%s): later %q backAt %q defaultAt %q, want %v %v %v", i, st.Kind, d.Later, d.BackAt, d.DefaultAt, str(st.Want.Later), str(st.Want.BackAt), str(st.Want.DefaultAt))
		}
	}
}
