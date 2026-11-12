package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// D224: 全部更新 / Update all on Settings › 更新与关于, from the home's plan.

func uaDevices() []protocol.DeviceView {
	return []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake, Version: "0.0.30",
			Update: &protocol.DeviceUpdate{Current: "0.0.30", Latest: "0.0.31", Available: true, How: "self"}},
		{ID: "w1", Name: "mini", Kind: "mini", State: protocol.DeviceAwake, Version: "0.0.30",
			Update: &protocol.DeviceUpdate{Current: "0.0.30", Latest: "0.0.31", Available: true, How: "self"}},
	}
}

func uaItems() []protocol.UpdateAllItem {
	at := time.Now().UTC().Format(time.RFC3339)
	return []protocol.UpdateAllItem{
		{Key: "ducter:local", Kind: "ducter", Device: "local", DeviceName: "hel", From: "0.0.30", To: "0.0.31", State: "queued", At: at},
		{Key: "ducter:w1", Kind: "ducter", Device: "w1", DeviceName: "mini", From: "0.0.30", To: "0.0.31", State: "queued", At: at},
		{Key: "agent:local:claude-code", Kind: "agent", Device: "local", DeviceName: "hel", Harness: "claude-code", From: "2.1.319", To: "2.1.322", State: "queued", At: at},
		{Key: "agent:w1:codex", Kind: "agent", Device: "w1", DeviceName: "mini", Harness: "codex", From: "0.160.0", To: "0.167.0", State: "queued", At: at},
	}
}

func uaApp(t *testing.T, lang i18n.Lang, ua *protocol.UpdateAllView, auto bool) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: ua})
	app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{AutoUpdate: auto}})
	app.openTab(TabAbout)
	tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	return app, tt, sent
}

func TestUpdateAllOffer(t *testing.T) {
	_, tt, sent := uaApp(t, i18n.ZH, &protocol.UpdateAllView{Offer: uaItems(), NotNow: []protocol.UpdateAllNotNow{{Device: "w2", DeviceName: "MacBook", Why: "offline", Items: 2}}}, false)
	for _, w := range []string{"有 4 项更新", "hel 上的 Ducter", "mini 上的 Codex", "2.1.319 → 2.1.322",
		"MacBook 现在连不上，醒来后再更新。", "先更新 hel，再更新其他电脑，最后是各台电脑上的 AI。正在做的事不会被打断。"} {
		if !tt.HasText(w) {
			t.Errorf("no %q in %q", w, tt.Texts())
		}
	}
	title, _ := tt.Find("有 4 项更新")
	if night, ok := tt.Find("自动更新"); ok && night.Y < title.Y {
		t.Error("Update all isn't first on the tab")
	}
	if err := tt.Click("全部更新"); err != nil {
		t.Fatal(err)
	}
	last := (*sent)[len(*sent)-1]
	if r, ok := last.(protocol.UpdateAllReq); !ok || r.T != "update_all" || r.Stop || r.Dismiss {
		t.Fatalf("sent %#v", last)
	}
}

func TestUpdateAllRunningAndFinished(t *testing.T) {
	items := uaItems()
	items[0].State = "done"
	items[1].State, items[1].Phase, items[1].Progress = "running", "downloading", 0.42
	items[2].State, items[2].Busy = "waiting", 2
	plan := &protocol.UpdateAllPlan{ID: "ua-1", By: "user", Items: items}
	_, tt, sent := uaApp(t, i18n.ZH, &protocol.UpdateAllView{Plan: plan}, false)
	for _, w := range []string{"正在全部更新", "已更新到 0.0.31", "等用它的 2 件事停下", "排队中"} {
		if !tt.HasText(w) {
			t.Errorf("running: no %q in %q", w, tt.Texts())
		}
	}
	if err := tt.Click("停止剩下的"); err != nil {
		t.Fatal(err)
	}
	if r, ok := (*sent)[len(*sent)-1].(protocol.UpdateAllReq); !ok || !r.Stop {
		t.Fatalf("stop sent %#v", (*sent)[len(*sent)-1])
	}

	// Finished with a failure: said, its why on a tap, 再试一次, the switch.
	items = uaItems()
	items[0].State = "failed"
	items[0].Reason, items[0].RolledBack, items[0].Detail = "health", true, "0.0.31 didn't answer within 180 s"
	items[1].State, items[1].Reason, items[1].Detail = "skipped", "home", "hel"
	items[2].State = "done"
	items[3].State = "done"
	done := &protocol.UpdateAllPlan{ID: "ua-2", By: "user", FinishedAt: time.Now().UTC().Format(time.RFC3339), Items: items}
	_, tt, sent = uaApp(t, i18n.ZH, &protocol.UpdateAllView{Plan: done}, false)
	for _, w := range []string{"已更新 2 项，1 项没能更新", "没能更新，已换回 0.0.30", "hel 没能更新，这台保持原版本", "再试一次", "以后自动更新"} {
		if !tt.HasText(w) {
			t.Errorf("finished: no %q in %q", w, tt.Texts())
		}
	}
	why := "新版本重启后三分钟里都没应答，所以换回了原来的。可以再试一次。"
	if tt.HasText(why) {
		t.Error("the why shows before the tap")
	}
	if err := tt.Click("没能更新，已换回 0.0.30 · hel 上的 Ducter"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText(why) {
		t.Errorf("no why after the tap: %q", tt.Texts())
	}
	if err := tt.Click("完成"); err != nil {
		t.Fatal(err)
	}
	if r, ok := (*sent)[len(*sent)-1].(protocol.UpdateAllReq); !ok || !r.Dismiss {
		t.Fatalf("dismiss sent %#v", (*sent)[len(*sent)-1])
	}
	// The switch shows only while it's off.
	_, tt, _ = uaApp(t, i18n.EN, &protocol.UpdateAllView{Plan: done}, true)
	if tt.HasText("Keep everything up to date") {
		t.Error("the switch shows while already on")
	}
	if !tt.HasText("1 updated, 1 didn't") && !tt.HasText("2 updated, 1 didn't") {
		t.Errorf("en title missing: %q", tt.Texts())
	}
}

func TestUpdateAllHiddenWithNothing(t *testing.T) {
	_, tt, _ := uaApp(t, i18n.ZH, &protocol.UpdateAllView{}, false)
	if tt.HasText("全部更新") || tt.HasText("正在全部更新") {
		t.Errorf("the card shows with nothing behind: %q", tt.Texts())
	}
}

// This app's own step: listed last when it talks to a home elsewhere; it
// fetches at the tap, and restarts once, for the plan this window started,
// when nothing in it is mid-way.
func TestUpdateAllOwnAppStep(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.URL = "wss://hel.example.com/ws"
	fu := &fakeUpdates{st: update.Status{State: update.UpToDate, Current: "0.0.30"}}
	app.Updates = fu
	restarted := 0
	app.RestartToUpdate = func() { restarted++ }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: &protocol.UpdateAllView{Offer: uaItems()[:1]}})
	if own := app.ownAppStep(); !own.show || own.ready || own.to != "0.0.31" {
		t.Fatalf("own step %+v", own)
	}
	app.startUpdateAll()
	time.Sleep(50 * time.Millisecond)
	if len(fu.hints) != 1 || fu.hints[0] != "0.0.31" {
		t.Fatalf("hints %v", fu.hints)
	}
	app.Receive(protocol.ServerFrame{T: "update_all_result", OK: true, ID: "ua-1"})
	fu.st = update.Status{State: update.Ready, Current: "0.0.30", Version: "0.0.31"}
	items := uaItems()[:2]
	items[0].State = "running"
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: &protocol.UpdateAllView{Plan: &protocol.UpdateAllPlan{ID: "ua-1", By: "user", Items: items}}})
	if restarted != 0 {
		t.Fatal("restarted while the home's step runs")
	}
	items[0].State, items[1].State = "done", "done"
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: &protocol.UpdateAllView{Plan: &protocol.UpdateAllPlan{ID: "ua-1", By: "user", Items: items}}})
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: &protocol.UpdateAllView{Plan: &protocol.UpdateAllPlan{ID: "ua-1", By: "user", Items: items}}})
	if restarted != 1 {
		t.Fatalf("restarted %d times, want once", restarted)
	}
	// Another client's plan never closes this window.
	app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: &protocol.UpdateAllView{Plan: &protocol.UpdateAllPlan{ID: "ua-9", By: "user", Items: items}}})
	if restarted != 1 {
		t.Fatal("restarted for a plan another client started")
	}
	// On this Mac (local), the app is the home's own step: no extra row.
	app.URL = ""
	if app.ownAppStep().show {
		t.Error("a local home lists the app twice")
	}
}
