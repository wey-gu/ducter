package store

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D167: the author's hel said 0.0.7 and 没更新成 at once. A failure the
// device has moved past is dropped when the devices frame arrives, also
// from a home that predates the rule; a real one stays.
func TestStaleFailureIsDropped(t *testing.T) {
	frame := func(u protocol.DeviceUpdate) *protocol.DeviceUpdate {
		s := &Store{}
		s.Apply(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Home: true, Update: &u}}})
		return s.Devices[0].Update
	}
	if u := frame(protocol.DeviceUpdate{Current: "0.0.7", Phase: "failed", From: "0.0.5", To: "0.0.6", Reason: "health"}); u.Phase != "" || u.Reason != "" {
		t.Fatalf("an older update's failure: %+v", u)
	}
	if u := frame(protocol.DeviceUpdate{Current: "0.0.7", Phase: "failed", From: "0.0.6", To: "0.0.7", Reason: "health"}); u.Phase != "" {
		t.Fatalf("on the target: %+v", u)
	}
	if u := frame(protocol.DeviceUpdate{Current: "0.0.6", Phase: "failed", From: "0.0.6", To: "0.0.7", Reason: "health", RolledBack: true}); u.Phase != "failed" || u.Reason != "health" {
		t.Fatalf("rolled back: %+v", u)
	}
	if u := frame(protocol.DeviceUpdate{Current: "0.0.6", Phase: "failed", From: "?", To: "0.0.7", Reason: "offline"}); u.Phase != "failed" {
		t.Fatalf("a worker's unknown start: %+v", u)
	}
}
