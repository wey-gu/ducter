package local

import (
	"os"
	"testing"
)

// DUCTER_PROBE_PLIST=<plist> go test ./internal/local -run ProbeBackground -v
// prints what macOS says about one LaunchAgent (no changes).
func TestProbeBackground(t *testing.T) {
	p := os.Getenv("DUCTER_PROBE_PLIST")
	if p == "" {
		t.Skip("DUCTER_PROBE_PLIST not set")
	}
	names := map[BackgroundStatus]string{BackgroundUnknown: "unknown", BackgroundNotRegistered: "not registered", BackgroundAllowed: "allowed", BackgroundNeedsApproval: "needs approval", BackgroundNotFound: "not found"}
	t.Logf("%s: %s", p, names[backgroundStatus(p)])
}
