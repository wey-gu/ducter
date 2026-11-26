package store

// D615: the Mac's open predicate reads the same fixture as the protocol and the web, so the
// needs-you count and every list agree across clients. A picks offer past its time is settled by
// the home and is not counted here either.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

type openAskFixture struct {
	Now   string `json:"now"`
	Cases []struct {
		Name     string              `json:"name"`
		Decision protocol.Decision   `json:"decision"`
		State    openAskFixtureState `json:"state"`
		Open     bool                `json:"open"`
	} `json:"cases"`
}

type openAskFixtureState struct {
	Resolved bool   `json:"resolved"`
	Pending  string `json:"pending"`
	Later    string `json:"later"`
}

func TestOpenAskSharedFixture(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "protocol", "fixtures", "open-asks.json"))
	if err != nil {
		t.Fatal(err)
	}
	var f openAskFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	now, err := time.Parse(time.RFC3339, f.Now)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range f.Cases {
		d := &DecisionState{Decision: c.Decision, Pending: c.State.Pending}
		d.Later = c.State.Later
		if c.State.Resolved {
			d.Resolved = &protocol.DecisionResolved{DecisionID: c.Decision.DecisionID, Option: "hold", By: "user"}
		}
		if got := OpenAsk(d, now); got != c.Open {
			t.Errorf("%s: open %v, want %v", c.Name, got, c.Open)
		}
	}
}

func TestOpenDecisionsDropsADueOffer(t *testing.T) {
	now := time.Now()
	due := now.Add(-time.Hour).UTC().Format(time.RFC3339)
	s := &Store{Decisions: map[string]*DecisionState{
		"d_picks": {Decision: protocol.Decision{DecisionID: "d_picks", Question: "今天能替你清掉这 3 个。", GoLabel: "交给Ducter", DefaultOption: "hold", DefaultAt: due, Reversible: false, Offer: true}},
		"d_ask":   {Decision: protocol.Decision{DecisionID: "d_ask", Question: "要现在再跑一轮吗？", GoLabel: "现在跑一次", DefaultOption: "hold", Reversible: true}},
	}}
	open := s.OpenDecisions()
	if len(open) != 1 || open[0].DecisionID != "d_ask" {
		t.Fatalf("open decisions %#v", open)
	}
}
