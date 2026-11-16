package computer

import (
	"encoding/json"
	"os"
	"testing"
)

// The cases are packages/protocol/fixtures/computer-name.json, shared with
// the TypeScript helper.
func TestNamesFromTheSharedFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/computer-name.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Name [][2]string `json:"name"`
		Same [][3]any    `json:"same"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	for _, c := range f.Name {
		if got := Name(c[0]); got != c[1] {
			t.Errorf("Name(%q) = %q, want %q", c[0], got, c[1])
		}
	}
	for _, c := range f.Same {
		a, b, want := c[0].(string), c[1].(string), c[2].(bool)
		if got := Same(a, b); got != want {
			t.Errorf("Same(%q, %q) = %v, want %v", a, b, got, want)
		}
	}
	if len(f.Name) < 10 || len(f.Same) < 5 {
		t.Fatal("fixture too small")
	}
}

func TestThisPrefersTheMacComputerName(t *testing.T) {
	if got := pick("Wey’s MacBook Pro\n", "Mac.lan"); got != "Wey’s MacBook Pro" {
		t.Errorf("pick = %q", got)
	}
	if got := pick("", "Mac.lan"); got != "Mac" {
		t.Errorf("no Computer Name: %q", got)
	}
	if got := Undomained("CLI on Mac.lan"); got != "CLI on Mac" {
		t.Errorf("Undomained = %q", got)
	}
	if got := Undomained("iPhone 2"); got != "iPhone 2" {
		t.Errorf("a phone's name changed: %q", got)
	}
}
