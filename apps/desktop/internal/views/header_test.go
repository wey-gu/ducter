package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Live review: "Nothing on hand. Say anything." over an On hand holding a
// reminder for tomorrow 09:00.
func TestHeaderCountsAReminder(t *testing.T) {
	a := New(store.New(), theme.Pebble(), i18n.New(i18n.EN))
	a.Status = client.Connected
	a.Receive(protocol.ServerFrame{T: "welcome", Persona: "p", PersonaName: "Ducter"})
	a.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	if got := a.summary(a.S.Board()); got != "Nothing on hand. Say anything." {
		t.Fatalf("empty: %q", got)
	}
	a.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, "2026-11-09T00:00:00Z", "p", "channel", protocol.OriginWaiter, protocol.KindWaiter,
			protocol.Waiter{WaiterID: "w1", At: "2026-11-10T01:00:00Z", Reason: "Time to call your mom", State: "armed"}),
	}})
	if got := a.summary(a.S.Board()); got != "1 waiting" {
		t.Fatalf("with a reminder: %q", got)
	}
}
