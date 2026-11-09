package redact

import (
	"encoding/json"
	"os"
	"testing"
)

// The phone (packages/protocol/test/redact.test.ts) passes the same cases.
func TestRedactFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/redact.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		In   string `json:"in"`
		Want string `json:"want"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if got := Text(c.In); got != c.Want {
			t.Errorf("Text(%q)\n got %q\nwant %q", c.In, got, c.Want)
		}
	}
	if !Has(Text("nmem_ct_8fK2pQx7Lm4vRz9TbW3y")) {
		t.Error("Has: want true")
	}
}
