package store

import (
	"encoding/json"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func TestOutsideSeenInTranscript(t *testing.T) {
	ok := true
	tool := func(seq int64, cmd string) protocol.LogEvent {
		in, _ := json.Marshal(map[string]string{"command": cmd})
		return ev(seq, "task:t1", protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t1", Role: "tool", Tool: &protocol.ToolCall{Name: "Bash", Input: in, OK: &ok}})
	}
	s := New()
	s.Apply(events(
		tool(1, "bun test"),
		tool(2, "git push -u origin ducter/fix-ci"),
		tool(3, "gh pr create --draft --title x"),
		tool(4, "git commit -m 'later'"),
		tool(5, "curl -X POST https://api.example.com/hook"),
		tool(6, "curl https://example.com"),
		tool(7, "rsync -a dist/ deploy@box:/srv/app"),
	))
	acts := s.Task("t1").Outside()
	if len(acts) != 4 || acts[0].Seq != 2 || acts[3].Seq != 7 {
		t.Errorf("acts %+v", acts)
	}
	evs := SortEvidence([]protocol.EvidenceRef{{Kind: "url"}, {Kind: "diff"}, {Kind: "test"}})
	if evs[0].Kind != "test" || evs[2].Kind != "url" {
		t.Errorf("order %+v", evs)
	}
}
