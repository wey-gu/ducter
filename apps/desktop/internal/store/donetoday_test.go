package store

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The cases are packages/protocol/fixtures/done-today.json, shared with the
// TypeScript rule the core and the web client use.
func TestDoneTodayFromTheSharedFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/done-today.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Name      string `json:"_"`
			Attention string `json:"attention"`
			At        string `json:"at"`
			Now       string `json:"now"`
			Zone      string `json:"zone"`
			PROpen    bool   `json:"prOpen"`
			Want      bool   `json:"want"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	for _, c := range f.Cases {
		loc, err := time.LoadLocation(c.Zone)
		if err != nil {
			t.Fatal(err)
		}
		now := ParseTime(c.Now).In(loc)
		if got := IsDoneToday(protocol.Attention(c.Attention), ParseTime(c.At), now, c.PROpen); got != c.Want {
			t.Errorf("%s: got %v, want %v", c.Name, got, c.Want)
		}
	}
	if len(f.Cases) < 5 {
		t.Fatal("fixture too small")
	}
}
