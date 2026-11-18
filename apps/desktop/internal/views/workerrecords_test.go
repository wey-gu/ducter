package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D377: the author's MacBook, a computer for tasks, with his terminal Claude
// Code and Codex records on it (by file times alone), and his yes as given.
func macRecords(state string) protocol.DeviceView {
	dv := protocol.DeviceView{ID: "mbp1", Name: "Macbook Pro M3", Kind: "laptop", State: protocol.DeviceAwake, Platform: "darwin-arm64", Harnesses: []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Version: "2.1.326", How: "installer"},
		{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.170.0", How: "npm"},
	}}
	dv.Records = &protocol.DeviceRecordsView{State: state, Agents: []protocol.DeviceRecordsAgent{{Agent: "claude-code", LastAt: "2026-11-19T09:55:00Z"}, {Agent: "codex", LastAt: "2026-11-18T08:00:00Z"}}}
	return dv
}

func recordsSent(sent []any) []protocol.RecordsAllowReq {
	var out []protocol.RecordsAllowReq
	for _, f := range sent {
		if r, ok := f.(protocol.RecordsAllowReq); ok {
			out = append(out, r)
		}
	}
	return out
}

// The card: not read yet, 读它们留下的记录 sends the yes; on, 别再看了 takes it back.
func TestRecordsOnDeviceCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := iaApp(t, lang)
		app.Now = func() time.Time { return lendNow }
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), macRecords("unasked")}})
		app.Route = RouteDevices
		app.devState().sel = "mbp1"
		tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		for _, k := range []string{"wrec.title", "wrec.unasked", "wrec.scope"} {
			if _, ok := tt.Find(app.L.T(k)); !ok {
				t.Fatalf("%s: no %s", lang, k)
			}
		}
		why := app.L.T("wrec.why", "Macbook Pro M3", app.recordsAgentsWords([]string{"claude-code", "codex"}), app.S.PersonaName)
		if strings.Contains(why, "%!") {
			t.Fatalf("%s: %q", lang, why)
		}
		if _, ok := tt.Find(why); !ok {
			t.Fatalf("%s: no why line %q", lang, why)
		}
		if err := tt.Click(app.L.T("wrec.allow")); err != nil {
			t.Fatal(err)
		}
		if got := recordsSent(*sent); len(got) != 1 || !got[0].On || got[0].Device != "mbp1" {
			t.Fatalf("sent %+v", got)
		}
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), macRecords("on")}})
		tt.Frame()
		tt.Frame()
		if _, ok := tt.Find(app.L.T("wrec.on")); !ok {
			t.Fatalf("%s: not on", lang)
		}
		if err := tt.Click(app.L.T("wrec.stop")); err != nil {
			t.Fatal(err)
		}
		if got := recordsSent(*sent); len(got) != 2 || got[1].On {
			t.Fatalf("sent %+v", got)
		}
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/own-sessions-worker go test ./internal/views -run WorkerRecordsShots
func TestWorkerRecordsShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			app, _ := iaApp(t, lang)
			app.Now = func() time.Time { return lendNow }
			app.Route = RouteDevices
			tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			for _, s := range []string{"unasked", "on"} {
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), macRecords(s)}})
				app.devState().sel = "mbp1"
				tt.Frame()
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, "mac-card-"+s+"-1440-"+mode+"-"+string(lang)+".png"))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
