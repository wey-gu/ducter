package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// "Up to date" is never said without when it was checked, and 现在检查 /
// Check now asks the home to read the latest release again.
func TestUpToDateSaysWhenItChecked(t *testing.T) {
	for _, tc := range []struct {
		lang      i18n.Lang
		ago       time.Duration
		line, btn string
	}{
		// D296: one phrase in the partner's words (D291 allows one natural phrase). D500: once the About
		// head says every computer is current, the home's row says only when it looked; here it doesn't.
		{i18n.ZH, 3 * time.Hour, "3 小时前看过，已经是最新的", "检查更新"},
		{i18n.EN, 3 * time.Hour, "Up to date, checked 3 h ago", "Check now"},
		{i18n.ZH, 20 * time.Second, "刚看过，已经是最新的", "检查更新"},
	} {
		app, sent := iaApp(t, tc.lang)
		at := time.Now().Add(-tc.ago).UTC().Format(time.RFC3339)
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{
			ID: "hel", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake, Version: "0.0.4",
			Update: &protocol.DeviceUpdate{Current: "0.0.4", Latest: "0.0.4", How: "self", CheckedAt: at},
		}}})
		*sent = nil
		app.openTab(TabAbout)
		asked := false
		for _, f := range *sent {
			if r, ok := f.(protocol.DevicesReq); ok && r.T == "devices" {
				asked = true
			}
		}
		if !asked {
			t.Errorf("%s: opening Updates and about asks for devices (the home freshens its answer)", tc.lang)
		}
		tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		for _, part := range strings.Split(tc.line, "\n") {
			if !tt.HasText(part) {
				t.Errorf("%s: no %q in %q", tc.lang, part, tt.Texts())
			}
		}
		*sent = nil
		if err := tt.Click(tc.btn); err != nil {
			t.Fatalf("%s: %v", tc.lang, err)
		}
		tt.Frame()
		found := false
		for _, f := range *sent {
			if r, ok := f.(protocol.DeviceUpdateReq); ok && r.Check && r.Device == "hel" {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: Check now sent %v", tc.lang, *sent)
		}
	}
}
