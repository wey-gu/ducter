package views

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The phone (packages/protocol/test/steps.test.ts) passes the same cases.
func TestStepsFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/steps.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Harness string `json:"harness"`
		Tool    struct {
			Name   string          `json:"name"`
			Input  json.RawMessage `json:"input"`
			Output string          `json:"output"`
			OK     *bool           `json:"ok"`
		} `json:"tool"`
		Want Step `json:"want"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		got := stepOf(c.Harness, &protocol.ToolCall{Name: c.Tool.Name, Input: c.Tool.Input, Output: c.Tool.Output, OK: c.Tool.OK})
		if got != c.Want {
			t.Errorf("%s %s %s: got %+v, want %+v", c.Harness, c.Tool.Name, c.Tool.Input, got, c.Want)
		}
	}
}
