package views

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// D314: Done for you's glyphs and tints are the web's (packages/protocol
// fixtures/did-glyphs.json), and every one parses.
func TestDidGlyphsMatchTheFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/did-glyphs.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Stroke float32           `json:"stroke"`
		Glyphs map[string]string `json:"glyphs"`
		Tints  map[string]string `json:"tints"`
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(fx.Glyphs, didGlyphs) {
		t.Error("didGlyphs differs from fixtures/did-glyphs.json")
	}
	if !reflect.DeepEqual(fx.Tints, didTints) {
		t.Error("didTints differs from fixtures/did-glyphs.json")
	}
	if fx.Stroke != didGlyphStroke {
		t.Errorf("stroke %v, want %v", didGlyphStroke, fx.Stroke)
	}
	for k := range didGlyphs {
		if didGlyphPath(k, "") == nil {
			t.Errorf("%s does not parse", k)
		}
	}
	if didGlyphPath("sent", "mail") == didGlyphPath("sent", "agent") {
		t.Error("a mail should not look like a message to an agent")
	}
	if didGlyphPath("changed", "nothing") != didGlyphPath("changed", "") {
		t.Error("an unknown sub-kind falls back to its kind")
	}
}
