package store

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The cases are packages/protocol/fixtures/pr-state.json, shared with the
// TypeScript rule the core and the web client use (D508).
func TestPRStateFromTheSharedFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/pr-state.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Name   string          `json:"_"`
			PR     protocol.TaskPR `json:"pr"`
			Want   PRSaid          `json:"want"`
			Stands string          `json:"stands"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	for _, c := range f.Cases {
		got := SayPR(c.PR)
		if !reflect.DeepEqual(got, c.Want) {
			t.Errorf("%s: got %+v, want %+v", c.Name, got, c.Want)
		}
		if s := PRStands(got.Phase); s != c.Stands {
			t.Errorf("%s: stands %s, want %s", c.Name, s, c.Stands)
		}
	}
	if len(f.Cases) < 10 {
		t.Fatal("fixture too small")
	}
}

// A finished task whose PR waits is not done today (D508, D310).
func TestDoneTodayLeavesAnOpenPR(t *testing.T) {
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	at := now.Add(-time.Hour).Format(time.RFC3339)
	done := &Task{ID: "a", Card: &protocol.TaskCard{Attention: protocol.Done, UpdatedAt: at}}
	open := &Task{ID: "b", Card: &protocol.TaskCard{Attention: protocol.Done, UpdatedAt: at, PRs: []protocol.TaskPR{{PR: "o/r#1", State: "open", At: at}}}}
	merged := &Task{ID: "c", Card: &protocol.TaskCard{Attention: protocol.Done, UpdatedAt: at, PRs: []protocol.TaskPR{{PR: "o/r#2", State: "merged", At: at}}}}
	if n := DoneToday([]*Task{done, open, merged}, now); n != 2 {
		t.Fatalf("done today %d, want 2 (the open PR's task is not done)", n)
	}
}
