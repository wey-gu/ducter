package views

import (
	"encoding/json"
	"fmt"
	"image"
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

// D552: hel, 2026-11-24: one 更新 on Claude Code's Nowledge Mem plugin and
// four tasks in 30 s. A tap is one ask, the button reads 更新中… from the tap
// until the update ends, the Overview's notices say which computer, and the
// row says the version it reached.
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/mem-experience go test ./internal/views -run D552

// d552Devices is hel and a worker, Claude Code a version behind on both
// (JSON, so the same frame reads on a client from before D552).
func d552Devices(home, worker string) protocol.ServerFrame {
	var f protocol.ServerFrame
	j := fmt.Sprintf(`{"t":"devices","devices":[
	 {"id":"local","name":"hel","kind":"server","platform":"linux-x64","home":true,"state":"awake","harnesses":[
	  {"harness":"claude-code","installed":true,"loggedIn":true,"mem":%s},
	  {"harness":"codex","installed":true,"loggedIn":true,"mem":{"state":"installed","version":"0.1.53"}}]},
	 {"id":"w1","name":"Mac mini","kind":"desktop","platform":"darwin-arm64","state":"awake","harnesses":[
	  {"harness":"claude-code","installed":true,"loggedIn":true,"mem":%s}]}]}`, home, worker)
	if err := json.Unmarshal([]byte(j), &f); err != nil {
		panic(err)
	}
	return f
}

const d552Behind = `{"state":"update","version":"0.7.34","available":"0.7.38"}`

func TestMemPluginD552(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := "light"
			if dark {
				paper = "dark"
			}
			L := i18n.New(lang)
			app, sent := memApp(t, lang, "on")
			app.S.Mem.Health = &protocol.MemHealth{}
			app.Receive(d552Devices(d552Behind, d552Behind))
			app.openTab(TabHome)
			tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetDark(dark)
			frames := func() {
				for i := 0; i < 6; i++ {
					tt.Advance(150 * time.Millisecond)
					tt.Frame()
				}
			}
			shot := func(name string) {
				if dir == "" {
					return
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1150-%s-%s-%s.png", name, lang, paper)))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
			}
			// crop2x is a 2x band of the window around one string (its row, edges and junctions).
			crop2x := func(name, text string, above, below float32) {
				if dir == "" {
					return
				}
				r, ok := tt.Find(text)
				if !ok {
					t.Fatalf("%s: no %q to crop", lang, text)
				}
				tt.SetScale(2)
				frames()
				img := tt.Image()
				y0, y1 := int((r.Y-above)*2), int((r.Y+r.H+below)*2)
				if y0 < 0 {
					y0 = 0
				}
				sub := img.SubImage(image.Rect(max(0, int(r.X-90)*2), y0, img.Bounds().Dx(), y1))
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-2x-%s-%s-%s.png", name, lang, paper)))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, sub); err != nil {
					t.Fatal(err)
				}
				tt.SetScale(1)
				frames()
			}
			frames()
			// The Overview: two notices, each saying which computer.
			hel, mini := app.deviceNameIn(app.S.Device("local")), app.deviceNameIn(app.S.Device("w1"))
			for _, s := range []string{L.T("need.memplug.on", "Claude Code", hel), L.T("need.memplug.on", "Claude Code", mini)} {
				if !hasText(tt, s) {
					t.Fatalf("%s: no %q in %q", lang, s, tt.Texts())
				}
			}
			shot("overview")
			crop2x("overview", L.T("need.memplug.on", "Claude Code", hel), 24, 60)
			app.openTab(TabMemory)
			frames()
			shot("rows")
			about := spoken(L, "Claude Code", "Nowledge Mem")
			if err := tt.Click(spoken(L, L.T("memp.btn.update"), spoken(L, "Claude Code", hel, "Nowledge Mem"))); err != nil {
				t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
			}
			frames()
			if err := tt.Click(spoken(L, L.T("memp.ok.update"), about)); err != nil {
				t.Fatalf("%s: %v", lang, err)
			}
			frames()
			// The tap's own busy: 更新中… on hel's row at once, no Update to press again there.
			if !hasText(tt, L.T("memp.btn.updating")) || !hasText(tt, L.T("memp.setting.update.to", "0.7.38")) {
				t.Fatalf("%s: no busy in %q", lang, tt.Texts())
			}
			shot("tapped")
			crop2x("tapped", L.T("memp.setting.update.to", "0.7.38"), 40, 90)
			// A second press anywhere does nothing more: one frame went.
			app.installMem("local", "claude-code")
			n := 0
			for _, f := range *sent {
				if m, ok := f.(protocol.MemPluginInstall); ok && m.Device == "local" && m.Harness == "claude-code" {
					n++
				}
			}
			if n != 1 {
				t.Fatalf("%s: %d installs sent", lang, n)
			}
			// The home's task on it: still 更新中…, on the Overview too.
			app.Receive(d552Devices(`{"state":"update","version":"0.7.34","available":"0.7.38","taskId":"tsk_mem"}`, d552Behind))
			frames()
			shot("running")
			app.openTab(TabHome)
			frames()
			if !hasText(tt, L.T("memp.btn.updating")) {
				t.Fatalf("%s: Overview without busy: %q", lang, tt.Texts())
			}
			shot("overview-running")
			crop2x("overview-running", L.T("need.memplug.on", "Claude Code", hel), 24, 60)
			// Updated: hel's notice goes (the other stays, the only one now, so without its computer);
			// the row says the version it reached.
			app.Receive(d552Devices(`{"state":"installed","version":"0.7.38","updated":true}`, d552Behind))
			frames()
			if hasText(tt, L.T("need.memplug.on", "Claude Code", hel)) || !hasText(tt, L.T("need.memplug", "Claude Code")) {
				t.Fatalf("%s: notices after the update: %q", lang, tt.Texts())
			}
			shot("overview-updated")
			app.openTab(TabMemory)
			frames()
			done := L.T("memp.updated", "0.7.38", "Claude Code")
			if !hasText(tt, done) {
				t.Fatalf("%s: no %q in %q", lang, done, tt.Texts())
			}
			if strings.Contains(done, "%") {
				t.Fatalf("%s: unfilled %q", lang, done)
			}
			shot("updated")
			crop2x("updated", done, 40, 90)
		}
	}
}

// D552: Mem itself signed out while memory is on is said on the Overview,
// never 「我都记在 Nowledge Mem 里」 over a Mem that keeps nothing.
func TestMemHealthNeedD552(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, _ := memApp(t, lang, "on")
		app.S.Mem.Health = &protocol.MemHealth{Issue: "signed_out"}
		var got []string
		for _, n := range app.setNeeds() {
			got = append(got, n.key)
		}
		if fmt.Sprint(got) != "[memhealth]" {
			t.Fatalf("%s: needs %v", lang, got)
		}
		if app.homeMem() != L.T("home.mem.down") {
			t.Fatalf("%s: brief line %q over a signed-out Mem", lang, app.homeMem())
		}
		if app.paneSay(TabMemory, "") != "" {
			t.Fatalf("%s: say %q over a signed-out Mem", lang, app.paneSay(TabMemory, ""))
		}
		app.S.Mem.Health = &protocol.MemHealth{Issue: "unreachable"}
		if ns := app.setNeeds(); len(ns) != 1 || !strings.Contains(ns[0].text, "Nowledge Mem") {
			t.Fatalf("%s: unreachable %v", lang, ns)
		}
		app.S.Mem.Health = &protocol.MemHealth{}
		if ns := app.setNeeds(); len(ns) != 0 || app.paneSay(TabMemory, "") != L.T("say.memory.on") {
			t.Fatalf("%s: ok %v %q", lang, ns, app.paneSay(TabMemory, ""))
		}
	}
}
