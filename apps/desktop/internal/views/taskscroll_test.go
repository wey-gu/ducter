package views

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// fixtureTask opens the fixture case named name as a task in state.
func fixtureTask(t *testing.T, name string, state protocol.Attention, reduce bool) (*App, *ui.Tester, string) {
	t.Helper()
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/transcript.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name   string              `json:"name"`
		Events []protocol.LogEvent `json:"events"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	var evs []protocol.LogEvent
	for _, c := range cases {
		if c.Name == name {
			evs = c.Events
		}
	}
	if evs == nil {
		t.Fatalf("no case %q", name)
	}
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.LocaleFixed = true
	end, _ := time.Parse(time.RFC3339Nano, evs[len(evs)-1].TS)
	shift := time.Now().Add(-20 * time.Second).Sub(end)
	for i := range evs {
		ts, _ := time.Parse(time.RFC3339Nano, evs[i].TS)
		evs[i].TS = ts.Add(shift).UTC().Format(time.RFC3339Nano)
	}
	id := strings.TrimPrefix(evs[0].Stream, "task:")
	evs = append(evs, protocol.NewEvent(evs[len(evs)-1].Seq+1, time.Now().UTC().Format(time.RFC3339Nano), "default", evs[0].Stream, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: state, Residency: "hot"}))
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1280, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: reduce}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask(id)
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: id, Events: evs})
	for i := 0; i < 6; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	return app, tt, id
}

// D271 (c): a reader at the end of a working task, the pointer over the
// bottom of the transcript, scrolls up with a touchpad's smallest step: the
// page moves on that first event, and stays where they put it while the
// task goes on (the end is followed only while the reader is at it).
func TestTaskFirstWheelMoves(t *testing.T) {
	for _, reduce := range []bool{true, false} {
		app, tt, id := fixtureTask(t, "a long claude code run, under way", protocol.Working, reduce)
		ls := app.taskList(id)
		if !ls.AtEnd() {
			t.Fatalf("reduce=%v: a working task opens at its end", reduce)
		}
		turns := app.memoOf(app.S.Task(id)).turns
		probe := turns[len(turns)-1].Prompt.Text
		before, ok := tt.Find(probe)
		if !ok {
			t.Fatalf("reduce=%v: no working line %q: %q", reduce, probe, texts(tt))
		}
		// The bottom of the transcript, just over the composer.
		tt.Scroll(640, before.Y, 0, -3)
		tt.Advance(16 * time.Millisecond)
		tt.Frame()
		after, ok := tt.Find(probe)
		if !ok || after.Y <= before.Y {
			t.Fatalf("reduce=%v: the first wheel-up didn't move the page: %v → %v (%v)", reduce, before.Y, after.Y, ok)
		}
		// The task goes on: the reader stays where they are.
		for i := 0; i < 10; i++ {
			tt.Advance(100 * time.Millisecond)
			tt.Frame()
		}
		still, _ := tt.Find(probe)
		if still.Y < after.Y-0.5 {
			t.Errorf("reduce=%v: pulled back to the end: %v → %v", reduce, after.Y, still.Y)
		}
		if ls.AtEnd() && still.Y > before.Y+0.5 {
			t.Logf("reduce=%v: moved %.1f", reduce, still.Y-before.Y)
		}
	}
}
