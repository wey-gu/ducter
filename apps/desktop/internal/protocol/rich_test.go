package protocol

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// D303: the same cases the web's model passes (packages/protocol/fixtures/rich.json).
type richFixture struct {
	Split []struct {
		Name  string   `json:"name"`
		Text  string   `json:"text"`
		UI    []RichUI `json:"ui"`
		Parts []struct {
			Words *string `json:"words"`
			Block *int    `json:"block"`
		} `json:"parts"`
	} `json:"split"`
	Model []struct {
		Name  string    `json:"name"`
		Block RichUI    `json:"block"`
		Model RichModel `json:"model"`
	} `json:"model"`
	Nums [][2]any `json:"nums"`
}

func loadRich(t *testing.T) richFixture {
	t.Helper()
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/rich.json")
	if err != nil {
		t.Fatal(err)
	}
	var f richFixture
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestRichSplitParity(t *testing.T) {
	f := loadRich(t)
	if len(f.Split) < 5 {
		t.Fatalf("only %d split cases", len(f.Split))
	}
	for _, c := range f.Split {
		got := SplitRich(c.Text, c.UI)
		if len(got) != len(c.Parts) {
			t.Errorf("%s: %d parts, want %d", c.Name, len(got), len(c.Parts))
			continue
		}
		for i, p := range c.Parts {
			switch {
			case p.Words != nil && (got[i].Block != nil || got[i].Words != *p.Words):
				t.Errorf("%s part %d: %+v, want words %q", c.Name, i, got[i], *p.Words)
			case p.Block != nil && (got[i].Block == nil || got[i].Index != *p.Block):
				t.Errorf("%s part %d: %+v, want block %d", c.Name, i, got[i], *p.Block)
			}
		}
	}
}

func TestRichModelParity(t *testing.T) {
	f := loadRich(t)
	if len(f.Model) < 6 {
		t.Fatalf("only %d model cases", len(f.Model))
	}
	for _, c := range f.Model {
		if !c.Block.Known() {
			t.Errorf("%s: a valid block isn't known", c.Name)
		}
		if got := ModelOf(&c.Block); !reflect.DeepEqual(got, c.Model) {
			g, _ := json.Marshal(got)
			w, _ := json.Marshal(c.Model)
			t.Errorf("%s:\n got %s\nwant %s", c.Name, g, w)
		}
	}
	for _, n := range f.Nums {
		if got := FmtNum(n[0].(float64)); got != n[1].(string) {
			t.Errorf("FmtNum(%v) = %q, want %q", n[0], got, n[1])
		}
	}
}
