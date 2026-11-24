package views

import (
	"encoding/json"
	"testing"
)

// D524: a round's designed fresh session says nothing; only a resume the agent refused is said.
func TestFreshRoundIsSilent(t *testing.T) {
	if b, ok := noteOf("a fresh session for this round", json.RawMessage(`{"fresh":"round"}`)); ok {
		t.Fatalf("a round's fresh session is said: %+v", b)
	}
	b, ok := noteOf("could not resume the session", json.RawMessage(`{"fresh":"resume_rejected"}`))
	if !ok || b.Say != "fresh" {
		t.Fatalf("a refused resume is not said: %+v %v", b, ok)
	}
}
