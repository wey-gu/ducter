package views

import (
	"context"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/mock"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// harness runs the app's view in a tester against the mock server, over a
// real WebSocket client. Frames are applied on the test's goroutine, as
// the window applies them on the main thread.
type harness struct {
	t      *testing.T
	app    *App
	tt     *ui.Tester
	frames chan protocol.ServerFrame
	// pump, if set, runs while waiting (the live test feeds the client).
	pump func()
	// hub is the mock main (nil against a live backend).
	hub *mock.Hub
	// wait is how long until waits; 10 s when zero.
	wait time.Duration
}

func newHarness(t *testing.T, lang i18n.Lang) *harness {
	t.Helper()
	theme.LoadFonts()
	hub := mock.NewHub(40)
	mux := http.NewServeMux()
	mux.Handle("/ws", hub.Handler())
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	s := store.New()
	app := New(s, theme.Pebble(), i18n.New(lang))
	h := &harness{t: t, app: app, hub: hub, frames: make(chan protocol.ServerFrame, 1024)}
	c := client.New(client.Options{
		URL:     "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws",
		Locale:  string(lang),
		OnFrame: func(f protocol.ServerFrame) { h.frames <- f },
	})
	app.Send = c.Send
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go c.Run(ctx)
	h.tt = ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	h.until("welcome", func() bool { return s.Persona != "" && s.OnHand != nil })
	return h
}

// until applies frames until cond holds.
func (h *harness) until(what string, cond func() bool) {
	h.t.Helper()
	wait := h.wait
	if wait == 0 {
		wait = 10 * time.Second
	}
	deadline := time.After(wait)
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	drain := func() {
		for {
			if h.pump != nil {
				h.pump()
			}
			select {
			case f := <-h.frames:
				h.app.Receive(f)
				continue
			default:
			}
			return
		}
	}
	for drain(); !cond(); drain() {
		select {
		case f := <-h.frames:
			h.app.Receive(f)
		case <-tick.C:
			h.tt.Frame()
		case <-deadline:
			h.tt.Frame()
			h.t.Fatalf("timed out waiting for %s; texts %q", what, h.tt.Texts())
		}
	}
	h.tt.Frame()
}

func (h *harness) shot(name string) {
	h.t.Helper()
	if os.Getenv("DUCTER_SHOTS") == "" {
		return
	}
	h.tt.Advance(time.Second)
	f, err := os.Create(filepath.Join(shotsDir(h.t), name+".png"))
	if err != nil {
		h.t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, h.tt.Image()); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) click(label string) {
	h.t.Helper()
	if err := h.tt.Click(label); err != nil {
		h.t.Fatalf("click %q: %v; texts %q", label, err, h.tt.Texts())
	}
}

// The full slice: a message, its task, a decision, Go, the result.
func TestScenarioEndToEnd(t *testing.T) {
	noRelayWait(t)
	h := newHarness(t, i18n.ZH)
	s := h.app.S
	if !h.tt.HasText("Ducter") || !h.tt.HasText("手头") {
		t.Fatalf("header: %q", h.tt.Texts())
	}

	h.tt.Type("帮我看下 HawDB #1592 的 CI 为什么挂了")
	h.tt.Key(0, ui.KeyEnter)
	if h.app.draft != "" {
		t.Errorf("composer kept %q after Enter", h.app.draft)
	}
	h.until("the decision", func() bool { return s.PendingDecision("t-ci-1") != nil && s.LatestLiving() != nil })
	for _, want := range []string{"帮我看下 HawDB #1592 的 CI 为什么挂了", "你不在的时候", "好，rebase", "先等等", "回复…"} {
		if !h.tt.HasText(want) {
			t.Errorf("conversation lacks %q: %q", want, h.tt.Texts())
		}
	}
	h.shot("conversation")

	h.click("手头的事")
	if h.app.Route != RouteOnHand {
		t.Fatal("On hand did not open")
	}
	for _, want := range []string{"等你", "在做", "在等", "今天做完", "原则英译", "周报草稿"} {
		if !h.tt.HasText(want) {
			t.Errorf("On hand lacks %q", want)
		}
	}
	h.shot("onhand")
	// Two decisions each have a Go: their accessible names tell them apart.
	if _, ok := h.tt.AccessByRole(ui.RoleButton, "好，rebase · 修 CI · #1592"); !ok {
		t.Error("Go of Fix CI has no unique accessible name")
	}
	if _, ok := h.tt.AccessByRole(ui.RoleButton, "先等等 · 升级 bun 到 1.3"); !ok {
		t.Error("Hold of the bun upgrade has no unique accessible name")
	}

	h.click("修 CI · #1592") // the card's title opens the task
	if h.app.Route != RouteTask || h.app.TaskID != "t-ci-1" {
		t.Fatalf("route %v task %q", h.app.Route, h.app.TaskID)
	}
	h.until("history", func() bool { return s.Task("t-ci-1").HistoryLoaded })
	// One column: what it did, the changes as files, then Details, closed.
	for _, want := range []string{"过程", "改动", "细节"} {
		if !h.tt.HasText(want) {
			t.Errorf("task view lacks %q: %q", want, h.tt.Texts())
		}
	}
	h.app.open["details:t-ci-1"] = true // below the fold in the test window
	h.tt.Frame()
	for _, want := range []string{"谁在做", "在哪儿做"} {
		if !h.tt.HasText(want) {
			t.Errorf("task details lack %q: %q", want, h.tt.Texts())
		}
	}
	if pane := h.app.diffs["t-ci-1"]; pane == nil || len(pane.files) == 0 {
		t.Errorf("no diff: %+v", pane)
	}
	h.shot("task")

	// Talk to the task directly: it waits for a decision, so the text is
	// queued behind its turn, and the transcript says so.
	h.app.SendToTask("t-ci-1", "rebase 前先看一眼 main 上 storage 的改动")
	h.until("delivery", func() bool {
		sd := s.Task("t-ci-1").Sends[0]
		return sd.Delivered != "" && sd.Seq != 0
	})
	if !h.tt.HasText("等它忙完手上的就告诉它") {
		t.Errorf("no delivery shown: %q", h.tt.Texts())
	}
	h.until("its answer", func() bool { return h.tt.HasText("收到，按你说的来。") })
	h.shot("task-sent")

	// Keyboard: Esc goes up a level, Cmd+1 / Cmd+2 jump.
	h.tt.Key(0, ui.KeyEscape)
	h.tt.Frame()
	if h.app.Route != RouteOnHand {
		t.Errorf("Esc: route %v", h.app.Route)
	}
	h.tt.Key(ui.Cmd, ui.Key1)
	h.tt.Frame()
	if h.app.Route != RouteConversation {
		t.Errorf("Cmd+1: route %v", h.app.Route)
	}
	h.app.OpenTask("t-ci-1")
	h.tt.Frame()
	h.click("好，rebase")
	h.until("done", func() bool {
		task := s.Task("t-ci-1")
		return task.Attention() == protocol.Done && len(s.Channel) > 0 && s.Channel[len(s.Channel)-1].AI != nil
	})
	if len(s.Task("t-ci-1").Evidence) == 0 {
		t.Error("no evidence after done")
	}
	h.shot("task-done")
	h.click("对话")
	h.until("result", func() bool { return h.tt.HasText("CI 修好了。") })
	// Acting read the first living message, which froze; the next one was
	// revised in place (progress → done) rather than duplicated.
	n := 0
	for _, e := range s.Channel {
		if e.Living != nil {
			n++
		}
	}
	if l := s.LatestLiving(); n != 2 || l.Revision != 1 || l.Living.Items[0].Kind != "done" {
		t.Errorf("%d living messages; latest %+v", n, l)
	}
	h.shot("conversation-done")
}

func TestEnglishRenders(t *testing.T) {
	h := newHarness(t, i18n.EN)
	if !h.tt.HasText("On hand") {
		t.Fatalf("texts %q", h.tt.Texts())
	}
	h.click("On hand")
	for _, want := range []string{"Needs you", "Working", "Waiting", "Done today"} {
		if !h.tt.HasText(want) {
			t.Errorf("On hand lacks %q", want)
		}
	}
}
