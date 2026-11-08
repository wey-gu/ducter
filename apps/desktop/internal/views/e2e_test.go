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
	h := &harness{t: t, app: app, frames: make(chan protocol.ServerFrame, 1024)}
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
	f, err := os.Create(filepath.Join("..", "..", "docs", name+".png"))
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

	h.click("手头")
	if h.app.Route != RouteOnHand {
		t.Fatal("On hand did not open")
	}
	for _, want := range []string{"等你", "在做", "在等", "今天做完", "原则英译", "周报草稿"} {
		if !h.tt.HasText(want) {
			t.Errorf("On hand lacks %q", want)
		}
	}
	h.shot("onhand")

	h.click("展开 →")
	if h.app.Route != RouteTask || h.app.TaskID != "t-ci-1" {
		t.Fatalf("route %v task %q", h.app.Route, h.app.TaskID)
	}
	h.until("history", func() bool { return s.Task("t-ci-1").HistoryLoaded })
	for _, want := range []string{"对话记录", "存档", "为什么是 Codex"} {
		if !h.tt.HasText(want) {
			t.Errorf("task view lacks %q: %q", want, h.tt.Texts())
		}
	}
	if pane := h.app.diffs["t-ci-1"]; pane == nil || len(pane.files) == 0 {
		t.Errorf("no diff: %+v", pane)
	}
	h.shot("task")

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
