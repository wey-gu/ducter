package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The polish pass (docs/design/ui.md, Components): a chip says its title
// once; a result says nothing about Outside when there is nothing to say.

func TestChipStatusThatRepeatsTheTitle(t *testing.T) {
	for _, c := range []struct {
		detail, title string
		same          bool
	}{
		{"slow cleanup of the downloads list", "slow cleanup of the downloads list", true},
		{"Slow cleanup of the downloads list.", "slow cleanup of the  downloads list", true},
		{"Working", "slow cleanup of the downloads list", false},
		{"", "", false},
	} {
		if got := sameWords(c.detail, c.title); got != c.same {
			t.Errorf("sameWords(%q, %q) = %v", c.detail, c.title, got)
		}
	}
}

func TestOutsideLineOnlyWhenItSaysSomething(t *testing.T) {
	a := New(store.New(), theme.Pebble(), i18n.New(i18n.EN))
	open := func(id string, place protocol.Place) *store.Task {
		a.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(int64(len(a.S.Tasks)+1), "2026-11-09T00:00:00Z", "p", protocol.TaskStream(id), protocol.OriginPartner, protocol.KindTaskOpen,
				protocol.TaskOpen{TaskID: id, Title: "tidy the notes folder", Place: place}),
		}})
		task := a.S.Task(id)
		task.HistoryLoaded = true
		return task
	}
	if got := a.outsideLine(open("t1", protocol.Place{Kind: "none"})); got != "" {
		t.Errorf("no place, nothing outside: %q, want no line", got)
	}
	if got := a.outsideLine(open("t2", protocol.Place{Kind: "repo", Branch: "ducter/calc", Device: "MacBook"})); got == "" {
		t.Error("a repo task: the branch it stays on is worth a line")
	}
}
