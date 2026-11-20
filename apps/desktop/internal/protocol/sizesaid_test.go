package protocol

import (
	"encoding/json"
	"os"
	"testing"
)

// D443: the same cases the web passes (packages/protocol/fixtures/size-said.json).
func TestSizeSaid(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/size-said.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Cases []struct {
			Why  string `json:"why"`
			Size string `json:"size"`
			Said bool   `json:"said"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &fx); err != nil {
		t.Fatal(err)
	}
	for _, c := range fx.Cases {
		if got := SizeSaid(c.Why, c.Size); got != c.Said {
			t.Errorf("SizeSaid(%q, %q) = %v, want %v", c.Why, c.Size, got, c.Said)
		}
	}
}
