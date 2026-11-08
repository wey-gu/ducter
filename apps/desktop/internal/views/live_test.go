package views

import (
	"context"
	"net"
	"net/http"
	"os"
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

// The live test drives the app against a real Ducter main process and
// takes screenshots of each view into apps/desktop/docs/live-*.png:
//
//	DUCTER_LIVE_URL=ws://127.0.0.1:7782/ws \
//	DUCTER_LIVE_SEND="Fix the failing tests in ~/scratch/demo, ask before committing" \
//	DUCTER_SHOTS=1 go test ./internal/views -run Live -v -timeout 20m
//
// Without DUCTER_LIVE_SEND it works with what the backend already holds.
// DUCTER_LIVE_RESTART=1 then waits for the backend to go away and come back
// (restart it by hand) and checks the client resumed from its cursor.

type liveHarness struct {
	*harness
	c *client.Client
}

func newLive(t *testing.T, url string, lang i18n.Lang) *liveHarness {
	h := dial(t, url, lang)
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	return h
}

// dial makes the app and its client, without waiting for anything.
func dial(t *testing.T, url string, lang i18n.Lang) *liveHarness {
	t.Helper()
	theme.LoadFonts()
	s := store.New()
	app := New(s, theme.Pebble(), i18n.New(lang))
	h := &harness{t: t, app: app, frames: make(chan protocol.ServerFrame, 4096)}
	status := make(chan client.Status, 64)
	cursor := make(chan int64)
	var c *client.Client
	c = client.New(client.Options{
		URL:    url,
		Locale: string(lang),
		// The store lives on the test's goroutine: ask it for the cursor.
		Cursor:  func() int64 { return <-cursor },
		OnFrame: func(f protocol.ServerFrame) { h.frames <- f },
		OnStatus: func(st client.Status, err error) {
			if err != nil {
				t.Logf("client: %v", err)
			}
			select {
			case status <- st:
			default:
			}
		},
	})
	app.Send = c.Send
	app.URL = c.URL()
	app.RetryNow, app.NextAttempt = c.RetryNow, c.NextAttempt
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go c.Run(ctx)
	h.tt = ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	h.pump = func() {
		for {
			select {
			case st := <-status:
				app.Status = st
				if st == client.Disconnected {
					app.Failed = true
				}
			case cursor <- s.Cursor:
			default:
				return
			}
		}
	}
	return &liveHarness{harness: h, c: c}
}

func TestLiveBackend(t *testing.T) {
	url := os.Getenv("DUCTER_LIVE_URL")
	if url == "" {
		t.Skip("DUCTER_LIVE_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_LOCALE") == "en" {
		lang = i18n.EN
	}
	prefix := os.Getenv("DUCTER_LIVE_SHOTS")
	if prefix == "" {
		prefix = "live"
	}
	h := newLive(t, url, lang)
	s := h.app.S
	long := 8 * time.Minute
	h.wait = long

	if text := os.Getenv("DUCTER_LIVE_SEND"); text != "" {
		before := len(s.Channel)
		h.app.draft = text
		h.app.SendMessage(text)
		h.app.draft = ""
		h.until("the ack", func() bool {
			for _, e := range s.Channel[min(before, len(s.Channel)):] {
				if e.Job != nil && e.Job.Ack != nil {
					return true
				}
			}
			return false
		})
		h.shot(prefix + "-ack")
		h.until("a task with a decision", func() bool { return len(s.OpenDecisions()) > 0 })
	}
	// Show the newest messages, then let them count as read.
	h.tt.Advance(2 * time.Second)
	h.until("conversation settles", func() bool { return true })
	h.shot(prefix + "-conversation")

	h.click(h.app.L.T("nav.onhand"))
	h.shot(prefix + "-onhand")

	open := s.OpenDecisions()
	if len(open) == 0 {
		t.Log("no open decision on the backend; stopping after On hand")
		return
	}
	d := open[len(open)-1]
	h.app.OpenTask(d.TaskID)
	h.until("history", func() bool { return s.Task(d.TaskID).HistoryLoaded })
	h.until("diff", func() bool {
		p := h.app.diffs[d.TaskID]
		return p == nil || !p.loading
	})
	h.shot(prefix + "-task")

	if os.Getenv("DUCTER_LIVE_NOGO") != "" {
		return
	}
	// Talk to the task directly; the server acks with "sent" (v2), or not.
	h.app.SendToTask(d.TaskID, liveSendText(lang))
	deadline := time.Now().Add(20 * time.Second)
	h.wait = 25 * time.Second
	h.until("delivery", func() bool {
		sd := s.Task(d.TaskID).Sends[0]
		return sd.Delivered != "" || sd.Failed != "" || time.Now().After(deadline)
	})
	sd := s.Task(d.TaskID).Sends[0]
	t.Logf("direct send: delivered=%q failed=%q echoed seq=%d", sd.Delivered, sd.Failed, sd.Seq)
	h.shot(prefix + "-task-sent")
	h.wait = long

	// Go.
	goText := h.app.L.T("decision.go")
	if d.GoLabel != "" {
		goText = h.app.L.T("decision.go.label", d.GoLabel)
	}
	h.click(goText)
	task := s.Task(d.TaskID)
	h.until("done", func() bool {
		a := task.Attention()
		return a == protocol.Done || a == protocol.DoneClaimed || a == protocol.Failed
	})
	h.until("diff after done", func() bool {
		p := h.app.diffs[d.TaskID]
		return p == nil || !p.loading
	})
	h.shot(prefix + "-task-done")
	h.click(h.app.L.T("nav.conversation"))
	h.until("the partner's result", func() bool {
		e := s.Channel[len(s.Channel)-1]
		return e.AI != nil && e.Event.Seq > d.Seq
	})
	h.tt.Advance(2 * time.Second)
	h.until("read", func() bool { return true })
	h.shot(prefix + "-conversation-done")

	if os.Getenv("DUCTER_LIVE_RESTART") == "" {
		return
	}
	cursor, entries := s.Cursor, len(s.Channel)
	t.Logf("restart the backend now (cursor %d)", cursor)
	h.until("disconnect", func() bool { return h.app.Status == client.Disconnected })
	h.shot(prefix + "-reconnecting")
	h.until("reconnect", func() bool { return h.app.Status == client.Connected && s.HeadSeq >= cursor })
	h.until("replay", func() bool { return true })
	if len(s.Channel) < entries {
		t.Errorf("lost entries on reconnect: %d → %d", entries, len(s.Channel))
	}
	seen := map[int64]bool{}
	for _, e := range s.Channel {
		if seen[e.FirstSeq] {
			t.Errorf("duplicate entry %d after reconnect", e.FirstSeq)
		}
		seen[e.FirstSeq] = true
	}
	h.shot(prefix + "-reconnected")
}

func liveSendText(l i18n.Lang) string {
	if l == i18n.ZH {
		return "顺便在 commit message 里写上测试前后的结果"
	}
	return "Also put the before/after test results in the commit message"
}

// The first-run screen: no Ducter to talk to yet. It says how to start
// Ducter, keeps trying, and gives way to the conversation once Ducter is up.
func TestFirstRunUntilDucterIsUp(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	l.Close() // nothing listens there yet
	h := dial(t, "ws://"+addr+"/ws", i18n.ZH)
	h.until("a failed attempt", func() bool { return h.app.Failed })
	for _, want := range []string{"Ducter 还没启动", StartCommand, "现在就连"} {
		if !h.tt.HasText(want) {
			t.Errorf("first run lacks %q: %q", want, h.tt.Texts())
		}
	}
	h.shot("firstrun")
	h.click("复制")
	if h.tt.Clipboard() != StartCommand {
		t.Errorf("clipboard %q", h.tt.Clipboard())
	}

	// Ducter comes up; Try now connects at once.
	hub := mock.NewHub(40)
	mux := http.NewServeMux()
	mux.Handle("/ws", hub.Handler())
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		t.Skipf("port taken meanwhile: %v", err)
	}
	srv := &http.Server{Handler: mux}
	go srv.Serve(ln)
	t.Cleanup(func() { srv.Close() })
	h.click("现在就连")
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	if h.tt.HasText("Ducter 还没启动") || !h.tt.HasText("手头") {
		t.Errorf("still on first run: %q", h.tt.Texts())
	}
}
