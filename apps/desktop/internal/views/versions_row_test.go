package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D167, the author's Settings › 更新和关于 › 各台电脑上的 Ducter on 0.0.7.
func versionsApp(t *testing.T, devices ...protocol.DeviceView) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "devices", Devices: devices})
	app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{}})
	app.openTab(TabAbout)
	tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	return app, tt, sent
}

// D556: 检查更新, and 在查… in its place while it asks, sits in the card's last
// row beside the night switch, at its right: never in the home's row, where it
// pushed the home's version off the edge every other version ends on, and
// never on a line of its own.
func TestCheckingSitsBesideTheNightSwitch(t *testing.T) {
	at := time.Now().Add(-3 * time.Hour).UTC().Format(time.RFC3339)
	_, tt, _ := versionsApp(t,
		protocol.DeviceView{ID: "hel", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake, Version: "0.0.7",
			Update: &protocol.DeviceUpdate{Current: "0.0.7", Latest: "0.0.7", How: "self", CheckedAt: at}},
		protocol.DeviceView{ID: "w1", Name: "Siweis-MacBook-Pro", Kind: "laptop", State: protocol.DeviceAwake, Version: "0.0.7",
			Update: &protocol.DeviceUpdate{Current: "0.0.7", Latest: "0.0.7", How: "app", CheckedAt: at}},
	)
	name, _ := tt.Find("hel")
	mac, _ := tt.Find("Siweis-MacBook-Pro")
	night, _ := tt.Find("自动更新")
	beside := func(what string, r ui.Rect) {
		t.Helper()
		if !(r.Y > mac.Y && r.Y > night.Y-24 && r.Y < night.Y+48) {
			t.Errorf("%s at y=%v: not in the night switch's row (hel %v, the Mac %v, night %v)", what, r.Y, name.Y, mac.Y, night.Y)
		}
		if r.X < name.X+300 {
			t.Errorf("%s at x=%v: not at the row's right (name at %v)", what, r.X, name.X)
		}
	}
	check, ok := tt.Find("检查更新")
	if !ok {
		t.Fatalf("no 检查更新 in %q", tt.Texts())
	}
	beside("检查更新", check)
	if err := tt.Click("检查更新"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if hasText(tt, "检查更新") {
		t.Error("Check now stays while it asks")
	}
	checking, ok := tt.Find("正在检查…")
	if !ok {
		t.Fatalf("no 正在检查… in %q", tt.Texts())
	}
	beside("在查…", checking)
}

// 没更新成 shows only while the device still runs what it started from;
// tapped, it says why and the one next step under the row.
func TestFailedSaysWhyOnTapAndNeverOnTheTarget(t *testing.T) {
	failed := func(current string) protocol.DeviceView {
		return protocol.DeviceView{ID: "hel", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake, Version: current,
			Update: &protocol.DeviceUpdate{Current: current, Latest: "0.0.7", Available: current != "0.0.7", How: "self",
				Phase: "failed", From: "0.0.6", To: "0.0.7", Reason: "health", RolledBack: true, Detail: "0.0.7 didn't answer within 180 s"}}
	}
	_, tt, _ := versionsApp(t, failed("0.0.7"))
	if hasText(tt, "没能更新") || hasText(tt, "没能更新，已经换回 0.0.6") {
		t.Fatalf("on 0.0.7, it says it didn't update: %q", tt.Texts())
	}

	_, tt, sent := versionsApp(t, failed("0.0.6"))
	line := "没能更新，已经换回 0.0.6"
	if !hasText(tt, line) {
		t.Fatalf("no %q in %q", line, tt.Texts())
	}
	why := "新版本重启后三分钟里都没应答，所以换回了原来的。可以再试一次。"
	if hasText(tt, why) {
		t.Fatal("the why shows before the tap")
	}
	if err := tt.Click(line + ", hel"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !hasText(tt, why) || !hasText(tt, "0.0.7 didn't answer within 180 s") {
		t.Fatalf("tapped: no why in %q", tt.Texts())
	}
	*sent = nil
	if err := tt.Click("再试一次"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	asked := false
	for _, f := range *sent {
		if r, ok := f.(protocol.DeviceUpdateReq); ok && r.Device == "hel" && !r.Check {
			asked = true
		}
	}
	if !asked {
		t.Errorf("Try again sent %v", *sent)
	}
}
