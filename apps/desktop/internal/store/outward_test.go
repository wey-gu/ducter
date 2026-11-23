package store

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// D496: the Go port says what a command sent out exactly as
// packages/protocol/src/outward.ts does (one fixture).
func TestOutwardFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/outward.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Cmd    string       `json:"cmd"`
			Output string       `json:"output"`
			Acts   []OutwardAct `json:"acts"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	for _, c := range f.Cases {
		got := OutwardOf(c.Cmd, c.Output)
		if len(got) == 0 && len(c.Acts) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, c.Acts) {
			t.Errorf("%q:\n got %+v\nwant %+v", c.Cmd, got, c.Acts)
		}
	}
}
