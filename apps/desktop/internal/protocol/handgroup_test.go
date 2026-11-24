package protocol

import (
	"encoding/json"
	"os"
	"testing"
)

// D535: the same cases as packages/protocol/test/hand-group.test.ts.
func TestHandStandFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/hand-group.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Name    string        `json:"_"`
			Hand    GroupHandView `json:"hand"`
			OnBoard int           `json:"onBoard"`
			Queued  int           `json:"queued"`
			Want    string        `json:"want"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range f.Cases {
		h := c.Hand
		if got := HandStand(&h, c.OnBoard, c.Queued); string(got) != c.Want {
			t.Errorf("%s: %s, want %s", c.Name, got, c.Want)
		}
	}
}
