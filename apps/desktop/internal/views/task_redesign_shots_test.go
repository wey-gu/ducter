package views

import (
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D210: the opened task as a coding agent's conversation, shot from the
// glance case (packages/protocol/fixtures/transcript-cases.ts glanceEvents,
// dumped as gl-<lang>-<phase>.json into DUCTER_REDESIGN_EVENTS). Writes
// task-<phase>-<lang>[-end].png to the shots folder: the head, and the end.
func TestTaskRedesignShots(t *testing.T) {
	dir := os.Getenv("DUCTER_REDESIGN_EVENTS")
	if dir == "" {
		t.Skip("DUCTER_REDESIGN_EVENTS=<dir> to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, phase := range []string{"running", "done", "long"} {
			data, err := os.ReadFile(filepath.Join(dir, "gl-"+string(lang)+"-"+phase+".json"))
			if err != nil {
				t.Fatal(err)
			}
			var evs []protocol.LogEvent
			if err := json.Unmarshal(data, &evs); err != nil {
				t.Fatal(err)
			}
			app, _ := iaApp(t, lang)
			app.Status = client.Connected
			app.LocaleFixed = true
			// The run happened a few minutes ago, ending now.
			last, _ := time.Parse(time.RFC3339Nano, evs[len(evs)-1].TS)
			shift := time.Since(last) - 20*time.Second
			for i := range evs {
				ts, _ := time.Parse(time.RFC3339Nano, evs[i].TS)
				evs[i].TS = ts.Add(shift).UTC().Format(time.RFC3339Nano)
			}
			att := protocol.Working
			if phase == "done" {
				att = protocol.Done
			}
			n := evs[len(evs)-1].Seq + 1
			evs = append(evs, protocol.NewEvent(n, time.Now().UTC().Format(time.RFC3339Nano), "default", protocol.TaskStream("gl1"), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "gl1", Attention: att}))
			app.Receive(protocol.ServerFrame{T: "events", Events: evs})
			app.OpenTask("gl1")
			tt := ui.NewTesterWith(app.View, 1100, 1250, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			shot := func(name string) {
				tt.Frame()
				tt.Frame()
				tt.Advance(time.Second)
				f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
			shot("task-" + phase + "-" + string(lang))
			if phase == "long" {
				// A long history: how long a frame takes, and Jump to latest once scrolled up.
				start := time.Now()
				for i := 0; i < 20; i++ {
					tt.Frame()
				}
				t.Logf("%s long (%d events): %v a frame", lang, len(evs), time.Since(start)/20)
				app.taskScroll["gl1"].Y = 1 << 30
				tt.Frame()
				app.taskScroll["gl1"].Y = app.taskScroll["gl1"].MaxY - 900
				shot("task-long-" + string(lang) + "-scrolled")
				continue
			}
			if sc := app.taskScroll["gl1"]; sc != nil {
				sc.Y = 1 << 30
			}
			shot("task-" + phase + "-" + string(lang) + "-end")
			if phase == "running" {
				// Scrolled up: Jump to latest over the foot.
				app.taskScroll["gl1"].Y = 200
				shot("task-" + phase + "-" + string(lang) + "-scrolled")
				// The edit and the failed test, opened.
				for _, b := range app.blocks(app.S.Task("gl1")) {
					for _, l := range b.Lines {
						if l.Row != nil && (l.Row.Added > 0 || l.Row.Outcome == "error") && l.Row.Seq < 112 {
							app.open[fmt.Sprintf("step:gl1:%d", l.Row.Seq)] = true
						}
					}
				}
				app.taskScroll["gl1"].Y = 300
				shot("task-" + phase + "-" + string(lang) + "-open")
			}
		}
	}
}
