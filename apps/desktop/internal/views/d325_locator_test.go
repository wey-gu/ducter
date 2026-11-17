package views

// D325: the locator's card lists the session's landmarks, centered on the
// one nearest the pointer, the ones in view marked; a click on the rail
// pins it and gives it the keys (↑↓ move the choice, Return goes there,
// Esc closes and stays on the task); leaving it unpinned closes it after a
// moment; the list draws only the rows near its view.

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// openLongIndexed opens a task of n events through its session index, as a
// home since D320 sends it, with its newest window held.
func openLongIndexed(t *testing.T, n int, lang i18n.Lang, dark, all bool) (*App, *ui.Tester) {
	t.Helper()
	evs := longTask(n, "long1")
	// D325: the loop reports each round, as a real review loop does.
	evs = withReports(evs, lang)
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	tt := ui.NewTesterWith(app.View, 1280, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetDark(dark)
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask("long1")
	ix := indexOf(evs)
	app.Receive(protocol.ServerFrame{T: "task_index", TaskID: "long1", Index: ix})
	from := max(0, len(evs)-200)
	if all {
		from = 0
	}
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: "long1", Events: evs[from:], More: from > 0})
	for i := 0; i < 6; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	return app, tt
}

// withReports puts a report after every fifth round's last words.
func withReports(evs []protocol.LogEvent, lang i18n.Lang) []protocol.LogEvent {
	out := make([]protocol.LogEvent, 0, len(evs)+len(evs)/100)
	round := 0
	for _, e := range evs {
		out = append(out, e)
		if b, err := e.Typed(); err == nil {
			if te, isTE := b.(*protocol.TaskEvent); isTE && te.Role == "assistant" && strings.HasPrefix(te.Text, "Round ") {
				round++
				if round%5 == 0 {
					r := e
					r.Kind = "report"
					sum := fmt.Sprintf("第 %d 轮：#%d 可以合了，#%d 要先 rebase", round, 200+round, 201+round)
					if lang == i18n.EN {
						sum = fmt.Sprintf("Round %d: #%d is ready to merge, #%d needs a rebase first", round, 200+round, 201+round)
					}
					r.Body = []byte(fmt.Sprintf(`{"taskId":"long1","state":"progress","summary":%q,"questions":[],"evidence":[]}`, sum))
					out = append(out, r)
				}
			}
		}
	}
	// Seqs in order again (a report takes the next one; later events shift by one).
	for i := range out {
		out[i].Seq = evs[0].Seq + int64(i)
	}
	return out
}

func TestLocatorCard(t *testing.T) {
	app, tt := openLongIndexed(t, 3000, i18n.ZH, false, false)
	task := app.S.Task("long1")
	lms := app.locatorLandmarks(task)
	reports := 0
	for _, l := range lms {
		if l.K == "report" {
			reports++
		}
	}
	if reports == 0 || len(lms) < 30 {
		t.Fatalf("landmarks: %d, %d reports", len(lms), reports)
	}
	// Pointing at the rail's top: the card opens on the first landmarks.
	info, ok := tt.Access(app.L.T("locator.name"))
	if !ok {
		t.Fatal("no locator")
	}
	b := info.Bounds
	tt.Move(b.X+b.W/2, b.Y+3)
	for i := 0; i < 3; i++ {
		tt.Advance(50 * time.Millisecond)
		tt.Frame()
	}
	if !app.tpage.locOpen || app.tpage.loc.sel != 0 {
		t.Fatalf("pointing at the top: open %v, chose %d", app.tpage.locOpen, app.tpage.loc.sel)
	}
	if !strings.Contains(texts(tt), "交给它的事") {
		t.Errorf("the brief isn't listed at the top: %q", texts(tt))
	}
	// Only rows near the list's view are drawn: the last landmark's words aren't.
	if last := app.landmarkWords(&lms[len(lms)-1], app.Now()); strings.Contains(texts(tt), autospace(last.line)+" ") && len(lms) > 40 {
		t.Errorf("the whole list is drawn")
	}
	// The pointer at the rail's middle: the landmark nearest the middle turn, the list on it.
	tt.Move(b.X+b.W/2, b.Y+b.H/2)
	for i := 0; i < 3; i++ {
		tt.Advance(50 * time.Millisecond)
		tt.Frame()
	}
	mid := app.tpage.loc.sel
	n := len(app.memoOf(task).slots)
	if want := landmarkNear(lms, (n-1)/2); mid < want-1 || mid > want+1 {
		t.Errorf("pointing at the middle chose %d, want about %d", mid, want)
	}
	// A click pins it: the pointer leaving keeps it open, and the keys move the choice.
	tt.ClickAt(b.X+b.W/2, b.Y+b.H/2)
	tt.Frame()
	tt.Move(200, 300)
	for i := 0; i < 6; i++ {
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
	}
	if !app.tpage.locOpen || !app.tpage.loc.pinned {
		t.Fatalf("pinned card closed as the pointer left")
	}
	from := app.tpage.loc.sel
	tt.Key(0, ui.KeyDown)
	tt.Frame()
	tt.Key(0, ui.KeyDown)
	tt.Frame()
	if app.tpage.loc.sel != from+2 {
		t.Errorf("↓↓ moved the choice from %d to %d", from, app.tpage.loc.sel)
	}
	tt.Key(0, ui.KeyUp)
	tt.Frame()
	if app.tpage.loc.sel != from+1 {
		t.Errorf("↑ moved the choice to %d, want %d", app.tpage.loc.sel, from+1)
	}
	// Esc closes the card and stays on the task.
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	tt.Frame()
	if app.tpage.locOpen || app.Route != RouteTask {
		t.Fatalf("Esc: open %v, route %v", app.tpage.locOpen, app.Route)
	}
	// Return goes to the landmark chosen: pin, choose the first, Return.
	tt.ClickAt(b.X+b.W/2, b.Y+3)
	tt.Frame()
	tt.Key(0, ui.KeyHome)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	for i := 0; i < 12; i++ {
		tt.Advance(50 * time.Millisecond)
		tt.Frame()
	}
	if app.tpage.locOpen {
		t.Errorf("Return left the card open")
	}
	if first, _ := app.taskList("long1").Visible(); first > 1 {
		t.Errorf("Return didn't go to the brief: first row %d", first)
	}
	// Closed by Return under the pointer, it stays closed until the pointer leaves.
	if app.tpage.locOpen {
		t.Errorf("reopened under the pointer after Return")
	}
	tt.Move(200, 300)
	tt.Frame()
	// Unpinned, leaving closes it after a moment, not at once.
	tt.Move(b.X+b.W/2, b.Y+b.H/2)
	tt.Frame()
	tt.Frame()
	if !app.tpage.locOpen {
		t.Fatalf("pointing again didn't open it (hushed %v)", app.tpage.loc.hush)
	}
	tt.Move(200, 300)
	tt.Frame()
	if !app.tpage.locOpen {
		t.Errorf("closed at once as the pointer left")
	}
	tt.Advance(400 * time.Millisecond)
	tt.Frame()
	tt.Frame()
	if app.tpage.locOpen {
		t.Errorf("still open after the pointer left")
	}
}

// D325's shots, with DUCTER_SHOTS_DIR set: the card over a 3,000-event
// loop pointed at its middle and pinned on a choice, zh and en, light and dark.
func TestD325LocatorShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			app, tt := openLongIndexed(t, 1500, lang, dark, true)
			look := map[bool]string{false: "light", true: "dark"}[dark]
			shot := func(name string) {
				t.Helper()
				for i := 0; i < 4; i++ {
					tt.Advance(100 * time.Millisecond)
					tt.Frame()
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%s.png", name, lang, look)))
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
			}
			scrollTaskTo(app, "long1", 0.4)
			for i := 0; i < 4; i++ {
				tt.Advance(100 * time.Millisecond)
				tt.Frame()
			}
			info, _ := tt.Access(app.L.T("locator.name"))
			b := info.Bounds
			// The pointer on the thumb: the card opens on the turns in view, marked.
			first, _ := app.taskList("long1").Visible()
			n := len(app.memoOf(app.S.Task("long1")).slots)
			y := b.Y + 2 + (b.H-4)*float32(first)/float32(n-1)
			tt.Move(b.X+b.W/2, y)
			shot("locator-hover")
			tt.ClickAt(b.X+b.W/2, y)
			tt.Frame()
			tt.Move(400, 300)
			tt.Key(0, ui.KeyDown)
			tt.Frame()
			tt.Key(0, ui.KeyDown)
			shot("locator-pinned-keys")
		}
	}
}
