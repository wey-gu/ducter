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

// D597: haswell, 2026-11-26: 更新 on Claude Code's Nowledge Mem plugin was a
// nine-step agent task that stopped on another agent's doctor line and asked
// for a connect link. Now the home runs Claude Code's own update commands
// there: the same light row and its ask, 更新中… while they run, then
// 已更新到 0.7.39; one plain line if a task had to finish it; one line and
// 更新 again if nothing could.
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/mem-update go test ./internal/views -run D597

func d597Devices(mem string) protocol.ServerFrame {
	var f protocol.ServerFrame
	j := fmt.Sprintf(`{"t":"devices","devices":[
	 {"id":"local","name":"hel","kind":"server","platform":"linux-x64","home":true,"state":"awake","harnesses":[
	  {"harness":"claude-code","installed":true,"loggedIn":true,"mem":{"state":"installed","version":"0.7.39"}}]},
	 {"id":"w-haswell","name":"haswell","kind":"server","platform":"linux-x64","state":"awake","harnesses":[
	  {"harness":"claude-code","installed":true,"loggedIn":false,"mem":%s},
	  {"harness":"codex","installed":true,"loggedIn":true,"mem":{"state":"installed","version":"0.1.55"}}]}]}`, mem)
	if err := json.Unmarshal([]byte(j), &f); err != nil {
		panic(err)
	}
	return f
}

const d597Behind = `{"state":"update","version":"0.7.38","available":"0.7.39"}`

func TestMemPluginD597(t *testing.T) {
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
			app.Receive(d597Devices(d597Behind))
			app.openTab(TabMemory)
			tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetDark(dark)
			frames := func() {
				for i := 0; i < 6; i++ {
					tt.Advance(150 * time.Millisecond)
					tt.Frame()
				}
			}
			shot := func(name, text string) {
				if dir == "" {
					return
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1150-%s-%s-%s.png", name, lang, paper)))
				if err != nil {
					t.Fatal(err)
				}
				_ = png.Encode(f, tt.Image())
				f.Close()
				r, ok := tt.Find(text)
				if !ok {
					t.Fatalf("%s: no %q to crop", lang, text)
				}
				tt.SetScale(2)
				frames()
				img := tt.Image()
				y0 := max(0, int((r.Y-48)*2))
				sub := img.SubImage(image.Rect(max(0, int(r.X-90)*2), y0, img.Bounds().Dx(), int((r.Y+r.H+90)*2)))
				g, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-2x-%s-%s-%s.png", name, lang, paper)))
				if err != nil {
					t.Fatal(err)
				}
				_ = png.Encode(g, sub)
				g.Close()
				tt.SetScale(1)
				frames()
			}
			frames()
			// The row as today: from which version to which, and 更新.
			row := L.T("memp.update.to", "0.7.38", "0.7.39")
			if !hasText(tt, row) {
				t.Fatalf("%s: no %q in %q", lang, row, tt.Texts())
			}
			shot("ready", row)
			about := spoken(L, "Claude Code", "Nowledge Mem")
			if err := tt.Click(spoken(L, L.T("memp.btn.update"), spoken(L, "Claude Code", "haswell", "Nowledge Mem"))); err != nil {
				t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
			}
			frames()
			if err := tt.Click(spoken(L, L.T("memp.ok.update"), about)); err != nil {
				t.Fatalf("%s: %v", lang, err)
			}
			frames()
			n := 0
			for _, f := range *sent {
				if m, ok := f.(protocol.MemPluginInstall); ok && m.Device == "w-haswell" && m.Harness == "claude-code" {
					n++
				}
			}
			if n != 1 {
				t.Fatalf("%s: %d installs sent", lang, n)
			}
			// The commands running there: the home's busy, no task.
			app.Receive(d597Devices(`{"state":"update","version":"0.7.38","available":"0.7.39","busy":true}`))
			frames()
			busy := L.T("memp.setting.update.to", "0.7.39")
			if !hasText(tt, busy) || !hasText(tt, L.T("memp.btn.updating")) {
				t.Fatalf("%s: no busy in %q", lang, tt.Texts())
			}
			shot("running", busy)
			// Done: the version read back.
			app.Receive(d597Devices(`{"state":"installed","version":"0.7.39","updated":true}`))
			frames()
			done := L.T("memp.updated", "0.7.39", "Claude Code")
			if !hasText(tt, done) || strings.Contains(done, "%") {
				t.Fatalf("%s: no %q in %q", lang, done, tt.Texts())
			}
			shot("done", done)
			// Didn't take: a task finishes it, said in one plain line, the button still busy.
			app.Receive(d597Devices(`{"state":"update","version":"0.7.38","available":"0.7.39","taskId":"tsk1","handed":true}`))
			frames()
			handed := L.T("memp.handed")
			if !hasText(tt, handed) || !hasText(tt, L.T("memp.btn.updating")) {
				t.Fatalf("%s: no %q in %q", lang, handed, tt.Texts())
			}
			shot("handed", handed)
			// Nothing could pick it up: one line, and 更新 again.
			app.Receive(d597Devices(`{"state":"update","version":"0.7.38","available":"0.7.39","stuck":true}`))
			frames()
			stuck := L.T("memp.stuck")
			if !hasText(tt, stuck) {
				t.Fatalf("%s: no %q in %q", lang, stuck, tt.Texts())
			}
			if _, ok := tt.Find(spoken(L, L.T("memp.btn.update"), spoken(L, "Claude Code", "haswell", "Nowledge Mem"))); !ok {
				if !hasText(tt, L.T("memp.btn.update")) {
					t.Fatalf("%s: no Update after stuck in %q", lang, tt.Texts())
				}
			}
			shot("stuck", stuck)
		}
	}
}
