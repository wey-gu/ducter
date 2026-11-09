package say

import (
	"encoding/json"
	"os"
	"testing"
)

// The phone (packages/protocol/test/say.test.ts) passes the same cases.
func TestSayFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/say.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Tongue []struct {
			Text   string `json:"text"`
			ZH, EN bool
		} `json:"tongue"`
		Proof []struct {
			Kind, Label, Ref string
			ZH               string `json:"zh"`
			EN               string `json:"en"`
		} `json:"proof"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Tongue) == 0 || len(f.Proof) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range f.Tongue {
		if got := InTongue(c.Text, "zh"); got != c.ZH {
			t.Errorf("InTongue(%q, zh) = %v, want %v", c.Text, got, c.ZH)
		}
		if got := InTongue(c.Text, "en"); got != c.EN {
			t.Errorf("InTongue(%q, en) = %v, want %v", c.Text, got, c.EN)
		}
	}
	for _, c := range f.Proof {
		if got := ProofLabel(c.Kind, c.Label, c.Ref, "zh"); got != c.ZH {
			t.Errorf("ProofLabel(%q, zh) = %q, want %q", c.Label, got, c.ZH)
		}
		if got := ProofLabel(c.Kind, c.Label, c.Ref, "en"); got != c.EN {
			t.Errorf("ProofLabel(%q, en) = %q, want %q", c.Label, got, c.EN)
		}
	}
	if Sayable("Nowledge Mem is connected.", "zh") != "" || Sayable("Mem 连上了", "zh") != "Mem 连上了" {
		t.Error("Sayable")
	}
}
