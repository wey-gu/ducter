package views

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// D530: the web (packages/protocol/test/stepview.test.ts) passes the same cases.
func TestStepviewFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/stepview.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases struct {
		ToolAct []struct {
			In   string `json:"in"`
			Want struct {
				Act    string `json:"act"`
				Object string `json:"object"`
			} `json:"want"`
		} `json:"toolAct"`
		ChipText []struct{ In, Want string } `json:"chipText"`
		FileKind []struct{ In, Want string } `json:"fileKind"`
		ItemsOf  []struct {
			Name  string `json:"name"`
			Lines []Line `json:"lines"`
			Want  []Item `json:"want"`
		} `json:"itemsOf"`
		WorkOf []struct {
			Name   string  `json:"name"`
			Blocks []Block `json:"blocks"`
			Want   Work    `json:"want"`
		} `json:"workOf"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases.ToolAct {
		if a, o := toolAct(c.In); a != c.Want.Act || o != c.Want.Object {
			t.Errorf("toolAct %q: %q %q, want %q %q", c.In, a, o, c.Want.Act, c.Want.Object)
		}
	}
	for _, c := range cases.ChipText {
		if got := chipText(c.In, 72); got != c.Want {
			t.Errorf("chipText %q: %q, want %q", c.In, got, c.Want)
		}
	}
	for _, c := range cases.FileKind {
		if got := chipFileKind(c.In); got != c.Want {
			t.Errorf("chipFileKind %q: %q, want %q", c.In, got, c.Want)
		}
	}
	for _, c := range cases.ItemsOf {
		got, _ := json.Marshal(itemsOf(c.Lines))
		want, _ := json.Marshal(c.Want)
		var g, w any
		_ = json.Unmarshal(got, &g)
		_ = json.Unmarshal(want, &w)
		if !reflect.DeepEqual(g, w) {
			t.Errorf("itemsOf %s:\n got %s\nwant %s", c.Name, got, want)
		}
	}
	for _, c := range cases.WorkOf {
		if got := workOf(c.Blocks); got != c.Want {
			t.Errorf("workOf %s: %+v, want %+v", c.Name, got, c.Want)
		}
	}
	if chipFileName("/h/crates/storage/src/flush.rs") != "flush.rs" || chipFileName("src/") != "src" {
		t.Error("fileName")
	}
}
