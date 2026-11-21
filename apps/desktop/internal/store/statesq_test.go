package store

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D456 (research/198 F1): an old task opened from ⌘K showed 在做 with a
// 144-hour clock: its newest window said done, then an older page (D320)
// brought its first "working" in. The newest state stays.
func TestOlderPageKeepsNewestState(t *testing.T) {
	s := New()
	st := func(seq int64, a protocol.Attention) protocol.LogEvent {
		return ev(seq, "task:old1", protocol.KindTaskState, protocol.TaskState{TaskID: "old1", Attention: a, Residency: protocol.Parked})
	}
	s.ApplyEvent(st(900, protocol.Done))
	s.ApplyEvent(st(10, protocol.Working))
	if got := s.Tasks["old1"].State.Attention; got != protocol.Done {
		t.Fatalf("older page turned it to %s", got)
	}
	s.ApplyEvent(st(950, protocol.Working))
	if got := s.Tasks["old1"].State.Attention; got != protocol.Working {
		t.Fatalf("a newer state didn't win: %s", got)
	}
}
