package views

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The phone (packages/protocol/test/transcript.test.ts) passes the same cases.
func TestTranscriptFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/transcript.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name    string              `json:"name"`
		Harness string              `json:"harness"`
		Working bool                `json:"working"`
		Events  []protocol.LogEvent `json:"events"`
		Want    json.RawMessage     `json:"want"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		got, _ := json.Marshal(turnsOf(blocksOf(c.Harness, c.Events, c.Working)))
		var g, w any
		_ = json.Unmarshal(got, &g)
		_ = json.Unmarshal(c.Want, &w)
		if !reflect.DeepEqual(g, w) {
			t.Errorf("%s:\n got %s\nwant %s", c.Name, got, c.Want)
		}
		if strings.Contains(string(got), "8fK2pQx7") {
			t.Errorf("%s: a key survived", c.Name)
		}
	}
}
