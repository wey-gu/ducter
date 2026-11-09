package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The AI agents' own coins (D144) where they show, at 2x, zh: New task's
// who-does-it, the Devices islands and cards, an opened task's footer, the
// partner's tray. DUCTER_COIN_SHOTS=<dir> writes coins-*.png there:
//
//	DUCTER_COIN_SHOTS=../../../../.shots/agent-coins go test ./internal/views -run CoinShots
func TestCoinShots(t *testing.T) {
	dir := os.Getenv("DUCTER_COIN_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_COIN_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	shot := func(tt *ui.Tester, name string) {
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, "coins-"+name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	left := func(f float64) *float64 { return &f }
	agents := []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, CanBePartner: true},
		{Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true},
		{Harness: "pi", Installed: true, LoggedIn: true},
		{Harness: "deepseek-harness", Installed: true, LoggedIn: false},
	}
	devices := protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
		ID: "local", Name: "MacBook-Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: agents,
	}}}

	// New task: who does it, all four.
	app, _, tt := newTaskApp(t, i18n.ZH)
	tt.SetScale(2)
	app.Receive(devices)
	app.Route = RouteOnHand
	tt.Frame()
	if err := tt.Click(app.L.T("newtask.button")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	opts := newTaskOptions(i18n.ZH)
	opts.Candidates = []protocol.Candidate{
		{Harness: "claude-code", Model: "opus", Reason: protocol.CandidateReason{Kind: "fit"}, Left: left(0.64)},
		{Harness: "codex", Reason: protocol.CandidateReason{Kind: "fast"}, Left: left(0.48)},
		{Harness: "pi", Reason: protocol.CandidateReason{Kind: "fast"}},
		{Harness: "deepseek-harness", Blocked: "signed_out"},
	}
	app.Receive(opts)
	tt.Frame()
	tt.Frame()
	shot(tt, "newtask-zh")

	// Devices: the islands' account coins, one signed out.
	app2, _, tt2 := newTaskApp(t, i18n.ZH)
	tt2.SetScale(2)
	app2.Receive(devices)
	app2.Route = RouteDevices
	tt2.Frame()
	tt2.Frame()
	shot(tt2, "devices-zh")

	// An opened task: the footer's coin (Claude Code, working; Codex, needs you).
	for _, id := range []string{"t_newtask", "t_asc"} {
		app3, _, tt3 := newTaskApp(t, i18n.ZH)
		tt3.SetScale(2)
		app3.Receive(protocol.ServerFrame{T: "open_task", TaskID: id})
		tt3.Frame()
		tt3.Frame()
		shot(tt3, "task-"+id+"-zh")
	}

	// The partner's page: the socket and the tray of agents.
	app4, _, tt4 := newTaskApp(t, i18n.ZH)
	tt4.SetScale(2)
	tt4.SetSize(1280, 1300)
	app4.Receive(settingsFrame())
	app4.Receive(devices)
	app4.Route = RoutePartner
	tt4.Frame()
	tt4.Frame()
	shot(tt4, "partner-zh")
}
