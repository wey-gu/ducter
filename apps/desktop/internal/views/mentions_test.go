package views

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D534: the web (packages/protocol/test/mentions.test.ts) passes the same cases.
func TestMentionsFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/mentions.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		MentionAt []struct {
			Text  string `json:"text"`
			Caret int    `json:"caret"`
			Start *int   `json:"start"`
			Q     string `json:"q"`
		} `json:"mentionAt"`
		SlashAt []struct {
			Text  string `json:"text"`
			Caret int    `json:"caret"`
			Task  bool   `json:"task"`
			Start *int   `json:"start"`
			Q     string `json:"q"`
		} `json:"slashAt"`
		PlaceToken []struct {
			Text, Token, Want string
			Start, Caret      int
			WantCaret         int `json:"wantCaret"`
		} `json:"placeToken"`
		LabelOf  []struct{ Name, Want string } `json:"labelOf"`
		RefSpans []struct {
			Text string
			Refs []protocol.Ref
			Want [][]any
		} `json:"refSpans"`
		Match []struct {
			Q, Name string
			Hit     bool
		} `json:"match"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.MentionAt) == 0 || len(f.SlashAt) == 0 || len(f.RefSpans) == 0 {
		t.Fatal("no cases")
	}
	for _, c := range f.MentionAt {
		s, q, ok := mentionAt(c.Text, c.Caret)
		if (c.Start == nil) == ok || (ok && (s != *c.Start || q != c.Q)) {
			t.Errorf("mentionAt(%q, %d) = %d %q %v", c.Text, c.Caret, s, q, ok)
		}
	}
	for _, c := range f.SlashAt {
		s, q, ok := slashAt(c.Text, c.Caret, c.Task)
		if (c.Start == nil) == ok || (ok && (s != *c.Start || q != c.Q)) {
			t.Errorf("slashAt(%q, %d, %v) = %d %q %v", c.Text, c.Caret, c.Task, s, q, ok)
		}
	}
	for _, c := range f.PlaceToken {
		got, at := placeToken(c.Text, c.Start, c.Caret, c.Token)
		if got != c.Want || at != c.WantCaret {
			t.Errorf("placeToken(%q) = %q %d, want %q %d", c.Text, got, at, c.Want, c.WantCaret)
		}
	}
	for _, c := range f.LabelOf {
		if got := labelOf(c.Name); got != c.Want {
			t.Errorf("labelOf(%q) = %q, want %q", c.Name, got, c.Want)
		}
	}
	for _, c := range f.RefSpans {
		got := refSpans(c.Text, c.Refs)
		if len(got) != len(c.Want) {
			t.Fatalf("refSpans(%q) = %v", c.Text, got)
		}
		for i, w := range c.Want {
			if got[i].start != int(w[0].(float64)) || got[i].end != int(w[1].(float64)) || got[i].ref.ID != w[2].(string) {
				t.Errorf("refSpans(%q)[%d] = %v, want %v", c.Text, i, got[i], w)
			}
		}
	}
	for _, c := range f.Match {
		if got := matchScore(c.Q, c.Name, "") > 0; got != c.Hit {
			t.Errorf("matchScore(%q, %q) hit %v, want %v", c.Q, c.Name, got, c.Hit)
		}
	}
	text, refs := splitRefs("@修复登录 的改动也带上\n\n<ducter-refs>\nWhat…\n- @修复登录 [task t1]: task \"修复登录\" (t1, done)\n  Its latest report: fixed\n</ducter-refs>")
	if text != "@修复登录 的改动也带上" || len(refs) != 1 || refs[0] != (protocol.Ref{Kind: "task", ID: "t1", Label: "修复登录"}) {
		t.Errorf("splitRefs = %q %v", text, refs)
	}
}
