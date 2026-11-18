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

// D364: haswell with its agents signed in, and Nowledge Mem there as given.
func haswellMem(m *protocol.DeviceMemView) protocol.DeviceView {
	dv := haswell(
		protocol.DeviceHarness{Harness: "claude-code", Installed: true, LoggedIn: true, Version: "2.1.322", How: "npm"},
		protocol.DeviceHarness{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.169.1", How: "npm", CanBePartner: true},
		protocol.DeviceHarness{Harness: "pi", Installable: true},
	)
	dv.Mem = m
	return dv
}

func memSent(sent []any) []protocol.MemSetupReq {
	var out []protocol.MemSetupReq
	for _, f := range sent {
		if r, ok := f.(protocol.MemSetupReq); ok {
			out = append(out, r)
		}
	}
	return out
}

func TestMemRowLook(t *testing.T) {
	cases := []struct {
		m    protocol.DeviceMemView
		want string
	}{
		{protocol.DeviceMemView{State: "absent", Installable: true}, "absent"},
		{protocol.DeviceMemView{State: "absent", Step: &protocol.DeviceMemStep{Phase: "installing", Pct: 30}}, "installing"},
		{protocol.DeviceMemView{State: "sign_in", Step: &protocol.DeviceMemStep{Phase: "connecting"}}, "connecting"},
		{protocol.DeviceMemView{State: "sign_in", Step: &protocol.DeviceMemStep{Phase: "failed", Reason: "used"}}, "failed"},
		{protocol.DeviceMemView{State: "ready"}, "ready"},
	}
	for _, c := range cases {
		if got := memRowLook(&c.m); got != c.want {
			t.Errorf("%+v: %s, want %s", c.m, got, c.want)
		}
	}
	dv := haswellMem(&protocol.DeviceMemView{State: "ready", Agents: []string{"codex"}})
	if got := memUnconnected(&dv); len(got) != 1 || got[0] != "claude-code" {
		t.Fatalf("unconnected %v", got)
	}
}

// The card: 装上 sends install; signed out, the pasted link goes with 登录;
// ready names the agents that use it.
func TestMemOnDeviceCard(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Now = func() time.Time { return lendNow }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswellMem(&protocol.DeviceMemView{State: "absent", Installable: true})}})
	app.Route = RouteDevices
	app.devState().sel = "hw1"
	tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("haswell 上做事还不记得你"); !ok {
		t.Fatal("no Mem row on haswell's card")
	}
	if err := tt.Click("装上"); err != nil {
		t.Fatal(err)
	}
	if got := memSent(*sent); len(got) != 1 || got[0].Action != "install" || got[0].Device != "hw1" {
		t.Fatalf("sent %+v", got)
	}
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswellMem(&protocol.DeviceMemView{State: "sign_in", Version: "0.10.120"})}})
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("装好了，还差登录"); !ok {
		t.Fatal("no sign-in line")
	}
	app.wm.link = map[string]string{"hw1": "https://cloud.nowledge.co/app?nmem_connect=nmem_ct_x"}
	tt.Frame()
	if err := tt.Click("登录"); err != nil {
		t.Fatal(err)
	}
	got := memSent(*sent)
	if last := got[len(got)-1]; last.Action != "connect" || last.Link != "https://cloud.nowledge.co/app?nmem_connect=nmem_ct_x" {
		t.Fatalf("sent %+v", last)
	}
	if app.wm.link["hw1"] != "" {
		t.Fatal("the link stayed in the box")
	}
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswellMem(&protocol.DeviceMemView{State: "ready", Version: "0.10.120", Agents: []string{"claude-code", "codex"}})}})
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("记得你了"); !ok {
		t.Fatal("not ready")
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/mem-next go test ./internal/views -run WorkerMemShots
func TestWorkerMemShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	save := func(tt *ui.Tester, name string) {
		tt.Frame()
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	states := []struct {
		name string
		m    *protocol.DeviceMemView
	}{
		{"00-before", nil},
		{"01-absent", &protocol.DeviceMemView{State: "absent", Installable: true}},
		{"02-installing", &protocol.DeviceMemView{State: "absent", Installable: true, Step: &protocol.DeviceMemStep{Phase: "installing", Pct: 42}}},
		{"03-signin", &protocol.DeviceMemView{State: "sign_in", Version: "0.10.120"}},
		{"04-used", &protocol.DeviceMemView{State: "sign_in", Version: "0.10.120", Step: &protocol.DeviceMemStep{Phase: "failed", Reason: "used"}}},
		{"05-ready", &protocol.DeviceMemView{State: "ready", Version: "0.10.120", Agents: []string{"claude-code", "codex"}}},
	}
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			p := "mac-1440-" + string(lang) + "-" + mode + "-"
			app, _ := iaApp(t, lang)
			app.Now = func() time.Time { return lendNow }
			app.Route = RouteDevices
			tt := ui.NewTesterWith(app.View, 1440, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			for _, s := range states {
				app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswellMem(s.m)}})
				app.devState().sel = "hw1"
				save(tt, p+"card-"+s.name+".png")
			}
		}
	}
}
