package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// restartingWorker is this Mac's worker with the app's restart (main.go).
type restartingWorker struct {
	macWorkOn
	restarts int
}

func (r *restartingWorker) Restart() error { r.restarts++; return nil }

// The author's MacBook card said "在 Siweis-MacBook-Pro 上打开 Ducter，它会自己
// 更新" on the very Mac it was open on. The words follow where the Ducter is:
// another Mac opens its own app; this Mac's worker updates with this app,
// and when this app is already current, one restart of the worker does it.
func TestThisMacsWorkerUpdatesHere(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		world := func(current string) protocol.ServerFrame {
			f := sheetWorld("awake")
			f.Devices[1].Version = current
			f.Devices[1].Update = &protocol.DeviceUpdate{Current: current, Latest: "0.0.7", Available: current != "0.0.7", How: "app"}
			return f
		}
		app := sheetApp(t, lang, "awake")
		w := &restartingWorker{macWorkOn: macWorkOn{on: true}}
		app.MacWorker = w
		app.Receive(world("0.0.6"))

		// This app is current (0.0.7): the worker only needs a restart.
		app.Updates = &fakeUpdates{st: update.Status{State: update.UpToDate, Current: "0.0.7"}}
		tt := sheetTester(app, 1100, 1800, true)
		if tt.HasText(L.T("devup.how.app", "MacBook")) {
			t.Errorf("%s: this Mac told to open Ducter on itself: %q", lang, tt.Texts())
		}
		if !tt.HasText(L.T("devup.how.helper", "0.0.7", "hel")) {
			t.Fatalf("%s: no restart line in %q", lang, tt.Texts())
		}
		if err := tt.Click(L.T("devup.restart") + " · MacBook"); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 50 && w.restarts == 0; i++ {
			tt.Frame()
		}
		if w.restarts != 1 {
			t.Errorf("%s: restarts %d", lang, w.restarts)
		}
		tt.Frame()
		if !tt.HasText(L.T("devup.phase.restarting")) {
			t.Errorf("%s: no 在重启… after the tap: %q", lang, tt.Texts())
		}

		// This app is behind too: its own update (the button), not a restart.
		app2 := sheetApp(t, lang, "awake")
		app2.Receive(world("0.0.6"))
		app2.Updates = &fakeUpdates{st: update.Status{State: update.Ready, Current: "0.0.6", Version: "0.0.7"}}
		tt2 := sheetTester(app2, 1100, 1800, true)
		if tt2.HasText(L.T("devup.how.app", "MacBook")) || tt2.HasText(L.T("devup.how.helper", "0.0.6", "hel")) {
			t.Errorf("%s: app behind: %q", lang, tt2.Texts())
		}
		if _, ok := tt2.Find(L.T("devup.button")); !ok {
			t.Errorf("%s: app behind: no %s button in %q", lang, L.T("devup.button"), tt2.Texts())
		}

		// Another Mac: open Ducter there.
		app3 := sheetApp(t, lang, "awake")
		app3.ThisComputer = "Mac mini"
		app3.Receive(world("0.0.6"))
		tt3 := sheetTester(app3, 1100, 1800, true)
		if !tt3.HasText(L.T("devup.how.app", "MacBook")) {
			t.Errorf("%s: another Mac: %q", lang, tt3.Texts())
		}
	}
}
