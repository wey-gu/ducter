package views

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D418: the apps' marks and the words that choose them are the web's
// (packages/protocol/fixtures/app-glyphs.json); every mark parses; an app's
// own words pick its mark the way the web's appIcon does.
func TestAppGlyphsMatchTheFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/app-glyphs.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Stroke float32           `json:"stroke"`
		Icons  []string          `json:"icons"`
		Glyphs map[string]string `json:"glyphs"`
		Words  [][2]string       `json:"words"`
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if fx.Stroke != protocol.AppGlyphStroke || !reflect.DeepEqual(fx.Icons, protocol.AppIcons) || !reflect.DeepEqual(fx.Glyphs, protocol.AppGlyphs) || !reflect.DeepEqual(fx.Words, protocol.AppIconWords) {
		t.Fatal("protocol/appglyphs.go differs from fixtures/app-glyphs.json: regenerate it")
	}
	for _, k := range protocol.AppIcons {
		if appGlyphPath(k) == nil {
			t.Errorf("%s does not parse", k)
		}
	}
	for name, want := range map[string]string{"出差花销": "suitcase", "宝宝喝奶": "bottle", "PRs waiting on someone": "pr", "Spending": "coins", "这周要买的": "cart", "Something": "window"} {
		if got := (protocol.AppMeta{Name: name}).IconOf(); got != want {
			t.Errorf("%s: %s, want %s", name, got, want)
		}
	}
	if got := (protocol.AppMeta{Name: "出差花销", Icon: "window"}).IconOf(); got != "suitcase" {
		t.Errorf("an old app's stored window: %s, want its words' suitcase", got)
	}
}
