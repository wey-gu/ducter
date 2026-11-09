package store

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D145: a wait that ended unmet stays in the finished area for its day; re-armed, it leaves.
func TestMissedWaitStaysTodayUntilRearmed(t *testing.T) {
	s := New()
	w := protocol.Waiter{WaiterID: "w1", Reason: "PR #9950 的 CI 通过", Kind: "check", State: "armed"}
	s.Apply(events(ev(1, "channel", protocol.KindWaiter, w)))
	w.State, w.Unmet = "cancelled", "有一项检查挂了"
	s.Apply(events(ev(2, "channel", protocol.KindWaiter, w), ev(3, "channel", protocol.KindWaiter, protocol.Waiter{WaiterID: "w2", Reason: "x", State: "cancelled"})))
	day := ParseTime("2026-11-08T20:00:00Z")
	if m := s.MissedToday(day); len(m) != 1 || m[0].WaiterID != "w1" || m[0].Unmet != "有一项检查挂了" {
		t.Fatalf("missed %+v", m)
	}
	if len(s.MissedToday(day.Add(48*time.Hour))) != 0 {
		t.Error("kept past its day")
	}
	w.State, w.Unmet = "armed", ""
	s.Apply(events(ev(4, "channel", protocol.KindWaiter, w)))
	if len(s.MissedToday(day)) != 0 || len(s.ArmedWaiters()) != 1 {
		t.Error("re-armed wait still missed")
	}
}
