package views

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

const simUDID = "651C1449-DA9D-4D9D-9223-B4CBF5571A4A"

// simFrame is a frame: DUCTER_SIM_FRAME (a real simulator's JPEG) for the
// shots, else a small drawn one.
func simFrame(t *testing.T) (string, int, int) {
	t.Helper()
	if p := os.Getenv("DUCTER_SIM_FRAME"); p != "" {
		raw, err := os.ReadFile(p)
		if err == nil {
			if cfg, err := jpeg.DecodeConfig(bytes.NewReader(raw)); err == nil {
				return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(raw), cfg.Width, cfg.Height
			}
		}
	}
	img := image.NewRGBA(image.Rect(0, 0, 90, 195))
	for y := 0; y < 195; y++ {
		for x := 0; x < 90; x++ {
			img.Set(x, y, color.RGBA{uint8(40 + y/2), 120, 200, 255})
		}
	}
	var b bytes.Buffer
	_ = jpeg.Encode(&b, img, nil)
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(b.Bytes()), 90, 195
}

// D220: the workbench's Phone page with a booted simulator (its frame, the
// rail's controls as simctl acts, view only said), and 工作副本 / Working
// copy's panel (the branch and its base, the changes opening the workbench).
func TestBenchSimulatorAndInfo(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt, sent := benchFixture(t, lang)
		L := i18n.New(lang)
		frame, w, h := simFrame(t)
		sim := protocol.WbSim{Udid: simUDID, Name: "iPhone 16e", OS: "iOS 26.3", Appearance: "light", Text: "default"}
		var acts []protocol.WbRequest
		reply := func(r protocol.WbRequest) (protocol.WbAnswer, string) {
			switch r.Op {
			case "ports":
				return protocol.WbAnswer{Op: "ports"}, ""
			case "changes":
				return protocol.WbAnswer{Op: "changes", Kind: "repo", Base: "main", Files: []protocol.WbChange{{Path: "Levav/ReviewView.swift", Status: "modified", Adds: 3}, {Path: "Levav/Settings.swift", Status: "modified", Adds: 2, Dels: 1}}}, ""
			case "files":
				return protocol.WbAnswer{Op: "files", Path: r.Path}, ""
			case "sims":
				return protocol.WbAnswer{Op: "sims", Sims: []protocol.WbSim{sim}}, ""
			case "sim_frame":
				return protocol.WbAnswer{Op: "sim_frame", Udid: r.Udid, Image: frame, W: w, H: h}, ""
			case "sim_act":
				acts = append(acts, r)
				if r.Act != "appearance" {
					return protocol.WbAnswer{Op: "sim_act", Udid: r.Udid, Act: r.Act}, "" // Home answers no settings (sim.ts)
				}
				s := sim
				s.Appearance = r.Value
				return protocol.WbAnswer{Op: "sim_act", Udid: r.Udid, Act: r.Act, Sim: &s}, ""
			}
			return protocol.WbAnswer{}, "unsupported"
		}
		answerBench(app, sent, reply) // the sims looked for when the task opened
		tt.Frame()
		// 工作副本: the branch in the title bar opens the panel.
		if err := tt.Click(L.T("info.about") + " · ducter/oolong"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		all := texts(tt)
		for _, w := range []string{L.T("info.branch.from", "main"), L.T("info.computer"), L.T("info.folder"), L.T("info.copy")} {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q in the working copy's panel: %q", lang, w, all)
			}
		}
		benchShot(t, tt, "mac-"+string(lang)+"-5-info")
		app.infoOpen = false
		tt.Frame()
		// The workbench, then its Phone page with the simulator.
		if err := tt.Click(L.T("wb.toggle")); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 3; i++ {
			tt.Frame()
			answerBench(app, sent, reply)
		}
		if err := tt.Click(L.T("wb.tab.phone")); err != nil {
			t.Fatalf("%s: no Phone page: %v (%q)", lang, err, texts(tt))
		}
		for i := 0; i < 4; i++ {
			tt.Frame()
			answerBench(app, sent, reply)
		}
		tt.Frame()
		all = texts(tt)
		for _, w := range []string{"iPhone 16e · iOS 26.3", L.T("wb.sim.viewonly", app.taskComputerName(app.S.Task("t_tea")))} {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q on the Phone page: %q", lang, w, all)
			}
		}
		if s := app.benchOf("t_tea").simOf(simUDID); s.bmp == nil {
			t.Errorf("%s: no frame drawn", lang)
		}
		benchShot(t, tt, "mac-"+string(lang)+"-6-simulator")
		// The rail: dark, then Home, each simctl's own act.
		for _, label := range []string{L.T("wb.sim.dark"), L.T("wb.sim.home")} {
			if err := tt.Click(label); err != nil {
				t.Fatalf("%s: %v", lang, err)
			}
			tt.Frame()
			answerBench(app, sent, reply)
			tt.Frame()
		}
		if len(acts) != 2 || acts[0].Act != "appearance" || acts[0].Value != "dark" || acts[0].Udid != simUDID || acts[1].Act != "home" {
			t.Errorf("%s: rail acts %+v", lang, acts)
		}
		if got := app.benchOf("t_tea").sims[0].Appearance; got != "dark" {
			t.Errorf("%s: the settings after the act weren't kept: %q", lang, got)
		}
	}
}

func TestSimLinkOK(t *testing.T) {
	for u, want := range map[string]bool{"https://example.com": true, "myapp://home": true, "file:///etc/hosts": false, "not a link": false, "x:": false, "": false} {
		if simLinkOK(u) != want {
			t.Errorf("simLinkOK(%q) = %v", u, !want)
		}
	}
	if midCut("ducter/plano-teste-manual-revisao-simulador", 28) != "ducter/plano-te…o-simulador" && len([]rune(midCut("ducter/plano-teste-manual-revisao-simulador", 28))) != 28 {
		t.Errorf("midCut %q", midCut("ducter/plano-teste-manual-revisao-simulador", 28))
	}
}
