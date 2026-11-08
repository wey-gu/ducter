package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// One step of an experience walk against a real Ducter, driven from a
// shell so each step can wait on real AI work:
//
//	DUCTER_LIVE_URL=ws://127.0.0.1:7801/ws DUCTER_WALK_PREFIX=review2-zh-1 \
//	DUCTER_WALK_SEND="..." DUCTER_WALK_WAIT=ack|decision|reply|done \
//	DUCTER_WALK_CLICK="<label>" DUCTER_WALK_SHOTS=conversation,onhand,task,devices \
//	DUCTER_SHOTS=1 go test ./internal/views -run TestWalkStep -v -timeout 20m
//
// Shots go to apps/desktop/docs/<prefix>-<view>.png. WAIT holds until the
// backend has done that much after this step's send (or click).
func TestWalkStep(t *testing.T) {
	url := os.Getenv("DUCTER_LIVE_URL")
	prefix := os.Getenv("DUCTER_WALK_PREFIX")
	if url == "" || prefix == "" {
		t.Skip("DUCTER_LIVE_URL / DUCTER_WALK_PREFIX not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_LOCALE") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	s := h.app.S
	if dir := os.Getenv("DUCTER_DATA_DIR"); dir != "" {
		h.app.Local = hints.Open(dir)
	}
	h.wait = 12 * time.Minute
	if w := os.Getenv("DUCTER_WALK_WIDTH"); w == "900" {
		h.tt.SetSize(900, 860)
	}
	h.until("history", func() bool { return true })
	h.tt.Advance(time.Second)
	h.until("frame", func() bool { return true })

	start := len(s.Channel)
	startSeq := s.HeadSeq
	if text := os.Getenv("DUCTER_WALK_SEND"); text != "" {
		h.app.SendMessage(text)
	}
	if label := os.Getenv("DUCTER_WALK_CLICK"); label != "" {
		h.click(label)
	}
	sent := time.Now()
	after := func(pred func(e *store.Entry) bool) bool {
		for _, e := range s.Channel[min(start, len(s.Channel)):] {
			if pred(e) {
				return true
			}
		}
		return false
	}
	switch os.Getenv("DUCTER_WALK_WAIT") {
	case "ack":
		h.until("ack", func() bool { return after(func(e *store.Entry) bool { return e.Job != nil && e.Job.Ack != nil }) })
	case "reply":
		h.until("reply", func() bool { return after(func(e *store.Entry) bool { return e.AI != nil }) })
	case "decision":
		h.until("decision", func() bool {
			for _, d := range s.OpenDecisions() {
				if d.Seq > startSeq {
					return true
				}
			}
			return false
		})
	case "done":
		// A done item lands in the living message after the send (a reused
		// task may have been done before), then the partner's result.
		var doneAt int64
		h.until("a task done", func() bool {
			return after(func(e *store.Entry) bool {
				if e.Living == nil || e.Event.Seq <= startSeq {
					return false
				}
				for _, it := range e.Living.Items {
					if it.Kind == "done" || it.Kind == "failed" {
						doneAt = e.Event.Seq
						return true
					}
				}
				return false
			})
		})
		h.until("the partner's result", func() bool {
			return after(func(e *store.Entry) bool { return e.AI != nil && e.Event.Seq > doneAt })
		})
	}
	t.Logf("waited %s", time.Since(sent).Round(100*time.Millisecond))
	h.tt.Advance(2 * time.Second)
	h.until("settle", func() bool { return true })

	for _, view := range strings.Split(envOr("DUCTER_WALK_SHOTS", "conversation"), ",") {
		switch view {
		case "conversation":
			h.app.Route = RouteConversation
		case "onhand":
			h.app.Route = RouteOnHand
		case "devices":
			h.app.Route = RouteConversation
			h.tt.Frame()
			h.click(h.app.L.T("nav.devices.label"))
			h.until("devices", func() bool { return len(s.Devices) > 0 })
			h.settle(600 * time.Millisecond)
		case "task":
			var newest *store.Task
			for _, task := range s.Tasks {
				if newest == nil || task.OpenedAt > newest.OpenedAt {
					newest = task
				}
			}
			if newest == nil {
				continue
			}
			h.app.OpenTask(newest.ID)
			h.until("task history", func() bool { return newest.HistoryLoaded })
			h.until("diff", func() bool {
				p := h.app.diffs[newest.ID]
				return p == nil || !p.loading
			})
		}
		h.tt.Advance(time.Second)
		h.until("frame", func() bool { return true })
		h.shot(prefix + "-" + view)
	}
	for id, task := range s.Tasks {
		t.Logf("task %s acted=%+v open=%v", id, task.Acted, task.Open != nil)
	}
	for _, line := range h.tt.Texts() {
		t.Logf("text: %s", line)
	}
}

func walkFinished(t *store.Task) bool {
	a := t.Attention()
	return a == protocol.Done || a == protocol.DoneClaimed || a == protocol.Failed
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
