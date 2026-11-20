package views

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The waiting line's model (D425) on the fixture the web checks too.
func TestAliveFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/alive.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Words []struct {
			Lang string `json:"lang"`
			In   struct{ Step, About, Source string }
			Key  string `json:"key"`
			Arg  string `json:"arg"`
		} `json:"words"`
		Motion []struct {
			Step   string `json:"step"`
			StepMs int64  `json:"stepMs"`
			Still  bool   `json:"still"`
			Want   string `json:"want"`
		} `json:"motion"`
		Face []struct{ Step, Want string } `json:"face"`
		Sub  []struct {
			StepMs int64  `json:"stepMs"`
			Want   string `json:"want"`
		} `json:"sub"`
		Cadence []struct {
			Name    string `json:"name"`
			Shown   string `json:"shown"`
			ShownAt int64  `json:"shownAt"`
			Wanted  string `json:"wanted"`
			Now     int64  `json:"now"`
			Line    string `json:"line"`
			Changed bool   `json:"changed"`
			WaitMs  int64  `json:"waitMs"`
		} `json:"cadence"`
	}
	if err := json.Unmarshal(data, &fx); err != nil {
		t.Fatal(err)
	}
	for _, c := range fx.Words {
		k, a := aliveWords(c.In.Step, c.In.About, c.In.Source)
		if k != c.Key || a != c.Arg {
			t.Errorf("%+v: got %q %q, want %q %q", c.In, k, a, c.Key, c.Arg)
		}
	}
	for _, c := range fx.Motion {
		if got := aliveMotionFor(c.Step, time.Duration(c.StepMs)*time.Millisecond, c.Still); string(got) != c.Want {
			t.Errorf("motion %s@%d: %s, want %s", c.Step, c.StepMs, got, c.Want)
		}
	}
	faces := map[string]theme.Presence{"idle": theme.Idle, "working": theme.Working}
	for _, c := range fx.Face {
		if got := aliveFaceFor(c.Step); got != faces[c.Want] {
			t.Errorf("face %s: %v, want %s", c.Step, got, c.Want)
		}
	}
	for _, c := range fx.Sub {
		if got := aliveSubFor(time.Duration(c.StepMs) * time.Millisecond); got != c.Want {
			t.Errorf("sub %d: %q, want %q", c.StepMs, got, c.Want)
		}
	}
	at := func(ms int64) time.Time { return time.UnixMilli(ms) }
	for _, c := range fx.Cadence {
		line, changed, wait := aliveCadence(c.Shown, at(c.ShownAt), c.Wanted, at(c.Now))
		if line != c.Line || changed != c.Changed || wait != time.Duration(c.WaitMs)*time.Millisecond {
			t.Errorf("%s: %q %v %v", c.Name, line, changed, wait)
		}
	}
}

// Every loop starts and ends at rest, so a step that changes mid-loop
// never jumps more than a loop's own travel.
func TestAliveLoopsRest(t *testing.T) {
	for m, loop := range aliveLoops {
		first, last := loop.keys[0], loop.keys[len(loop.keys)-1]
		if first != (aliveKey{0, 0, 0, 0, 1}) || last != (aliveKey{1, 0, 0, 0, 1}) {
			t.Errorf("%s: the loop doesn't start and end at rest", m)
		}
		for _, k := range loop.keys {
			if k.deg > 7 || k.deg < -7 || k.x > 3 || k.x < -3 || k.y > 3 || k.y < -3 {
				t.Errorf("%s: a key moves too far: %+v", m, k)
			}
		}
	}
}

// The waiting line names the task it checks on by its title, the words
// hold for the dwell before the next step replaces them, and the reply
// ends it (D425).
func TestAliveLineWords(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "ITIN 那件查得怎么样了？"})}})
	now := time.Now().UTC().Format(time.RFC3339)
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.Now = tt.Now
	tt.Advance(aliveDwell + 10*time.Millisecond) // past the first line's dwell
	app.Receive(protocol.ServerFrame{T: "activity", Activity: &protocol.PartnerActivity{Step: "checking_task", About: "查 ITIN 的申请材料", Since: now, StepSince: now}})
	tt.Frame()
	if !tt.HasText("在看「查 ITIN 的申请材料」做到哪了…") {
		t.Fatalf("the task's title isn't in the line: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "activity", Activity: &protocol.PartnerActivity{Step: "looking", Source: "calendar", Since: now, StepSince: now}})
	tt.Frame()
	if !tt.HasText("在看「查 ITIN 的申请材料」做到哪了…") || tt.HasText("在看你的日程…") {
		t.Errorf("a step sooner than the dwell replaced the line: %q", tt.Texts())
	}
	tt.Advance(aliveDwell + 50*time.Millisecond)
	tt.Frame()
	if !tt.HasText("在看你的日程…") {
		t.Errorf("the next step didn't come after the dwell: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(2, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "快好了。", ReplyTo: 1})}})
	app.Receive(protocol.ServerFrame{T: "activity"})
	tt.Frame()
	if tt.HasText("在看你的日程…") {
		t.Errorf("the line stays after the reply: %q", tt.Texts())
	}
}

// Away a while (the window not the active one for aliveRest), the figure
// rests: the waiting line's loop and On hand's coin and bars hold still;
// back, they move again.
func TestAliveRests(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	rest := false
	tt := ui.NewTesterWith(func(c *ui.Context) {
		rest = app.aliveResting(c)
		ui.Box(c).Size(10, 10)
	}, 100, 100, ui.TesterOptions{})
	app.Now = tt.Now
	tt.SetWindowActive(true)
	tt.Frame()
	if rest {
		t.Fatal("resting while the window is active")
	}
	tt.SetWindowActive(false)
	tt.Advance(aliveRest - time.Second)
	tt.Frame()
	if rest {
		t.Fatal("resting before aliveRest")
	}
	tt.Advance(2 * time.Second)
	tt.Frame()
	if !rest {
		t.Fatal("still moving after aliveRest away")
	}
	tt.SetWindowActive(true)
	tt.Frame()
	if rest {
		t.Fatal("still resting once the window is active again")
	}
}

// A hidden window asks for no frames: the figure waits with it.
func TestAliveHiddenStill(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "hi"})}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{})
	tt.Frame()
	if !tt.HasText("Thinking…") {
		t.Fatalf("no line: %q", tt.Texts())
	}
	tt.SetWindowHidden(true)
	tt.Frame()
	if tt.FramePending() {
		t.Errorf("a hidden window still asks for frames")
	}
}
