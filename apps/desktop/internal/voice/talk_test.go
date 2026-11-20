package voice

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The web (packages/protocol/test/talk.test.ts) passes the same cases.
func TestTalkFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/talk.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Quiet []struct {
			Heard string
			Want  int64
		}
		Echo  []struct{ Heard, Saying, Want string }
		Barge []struct {
			Heard, Saying string
			Asking, Want  bool
		}
		Answer []struct{ Heard, Want string }
		End    []struct {
			Heard string
			Want  bool
		}
		Stop []struct {
			Heard string
			Want  bool
		}
		Spoken []struct{ Text, More, Want string }
		Floor  []struct {
			Card map[string]any
			Want string
		}
		Words    TalkWords
		Sessions []struct {
			Name    string
			Events  []TalkEvent
			Fx      [][]TalkEffect
			Phase   string
			EndedBy string
		}
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Quiet) == 0 || len(f.Sessions) == 0 || f.Words.Hint == "" {
		t.Fatal("no cases")
	}
	for _, c := range f.Quiet {
		if got := QuietFor(c.Heard); got != c.Want {
			t.Errorf("QuietFor(%q) = %d, want %d", c.Heard, got, c.Want)
		}
	}
	for _, c := range f.Echo {
		if got := AfterEcho(c.Heard, c.Saying); got != c.Want {
			t.Errorf("AfterEcho(%q, %q) = %q, want %q", c.Heard, c.Saying, got, c.Want)
		}
	}
	for _, c := range f.Barge {
		if got := IsBargeIn(c.Heard, c.Saying, c.Asking); got != c.Want {
			t.Errorf("IsBargeIn(%q, %q) = %v", c.Heard, c.Saying, got)
		}
	}
	for _, c := range f.Answer {
		if got := HeardAnswer(c.Heard); got != c.Want {
			t.Errorf("HeardAnswer(%q) = %q, want %q", c.Heard, got, c.Want)
		}
	}
	for _, c := range f.End {
		if got := HeardEnd(c.Heard); got != c.Want {
			t.Errorf("HeardEnd(%q) = %v", c.Heard, got)
		}
	}
	for _, c := range f.Stop {
		if got := HeardStop(c.Heard); got != c.Want {
			t.Errorf("HeardStop(%q) = %v", c.Heard, got)
		}
	}
	for _, c := range f.Spoken {
		if got := SpokenReply(c.Text, c.More); got != c.Want {
			t.Errorf("SpokenReply(%q)\n got %q\nwant %q", c.Text, got, c.Want)
		}
	}
	for _, c := range f.Floor {
		has := func(k string) bool { _, ok := c.Card[k]; return ok }
		str := func(k string) string { s, _ := c.Card[k].(string); return s }
		card := TalkCard{Question: str("question"), GoLabel: str("goLabel"), Pay: has("pay"), Checkout: has("checkout"), Key: has("key"), SignIn: has("signIn"), Fill: has("fill"),
			Asker: has("asker"), Sender: has("sender"), Trust: has("trust"), Draft: has("draft"), Handset: has("handset"), Phone: has("phone"), Computer: has("computer"), Call: has("call")}
		if got := TalkFloor(card); got != c.Want {
			t.Errorf("TalkFloor(%v) = %q, want %q", c.Card, got, c.Want)
		}
	}
	for _, ss := range f.Sessions {
		st := TalkStart(0)
		for i, e := range ss.Events {
			var got []TalkEffect
			st, got = TalkStep(st, e, f.Words)
			want := ss.Fx[i]
			if len(got) == 0 && len(want) == 0 {
				continue
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("%s, event %d (%s): got %+v, want %+v", ss.Name, i, e.K, got, want)
			}
		}
		if st.Phase != ss.Phase || st.EndedBy != ss.EndedBy {
			t.Errorf("%s: ended %s/%s, want %s/%s", ss.Name, st.Phase, st.EndedBy, ss.Phase, ss.EndedBy)
		}
	}
}
