package views

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
)

// TestRemoteDucter drives a real Ducter on another machine, the way the
// app does after "Connect to your Ducter": pair with a one-time code, then
// talk and run a task over the device token. Skipped unless pointed at one:
//
//	DUCTER_REMOTE=http://127.0.0.1:7781 DUCTER_REMOTE_CODE=K7QM-4XPA \
//	  DUCTER_SHOTS=1 go test ./internal/views -run TestRemoteDucter -v
//
// DUCTER_REMOTE_SAVE=<file> keeps the connection in that file (0600, the
// app's own format) and reuses it on the next run instead of pairing, which
// shows a token surviving a server restart or reboot.
func TestRemoteDucter(t *testing.T) {
	addr := os.Getenv("DUCTER_REMOTE")
	if addr == "" {
		t.Skip("DUCTER_REMOTE not set")
	}
	base, code, err := remote.Parse(addr, os.Getenv("DUCTER_REMOTE_CODE"))
	if err != nil {
		t.Fatal(err)
	}
	var token string
	file := os.Getenv("DUCTER_REMOTE_SAVE")
	if file != "" {
		if s, _ := remote.Load(file); s != nil {
			token = s.Token
			t.Logf("reusing the saved connection to %s (device %s)", s.URL, s.DeviceID)
		}
	}
	if token == "" {
		saved, err := remote.Pair(context.Background(), base, code, "e2e-"+remote.DeviceName())
		if err != nil {
			t.Fatalf("pair: %v", err)
		}
		token = saved.Token
		t.Logf("paired as device %s (token not shown)", saved.DeviceID)
		if file != "" {
			if err := remote.Save(file, saved); err != nil {
				t.Fatal(err)
			}
		}
	}
	h := dialWith(t, remote.WSURL(base), token, i18n.ZH)
	h.wait = 90 * time.Second
	s := h.app.S
	h.until("welcome", func() bool { return s.Welcomed && s.OnHand != nil })

	say := func(text string) {
		h.app.SendMessage(text)
	}
	partnerSaid := func(sub string) bool {
		for _, e := range s.Channel {
			if e.AI != nil && strings.Contains(e.AI.Text, sub) {
				return true
			}
			if e.Job != nil && e.Job.Ack != nil && strings.Contains(e.Job.Ack.Text, sub) {
				return true
			}
		}
		return false
	}
	stamp := time.Now().Format("15:04:05")
	say("你好 " + stamp)
	h.until("a reply", func() bool { return partnerSaid("你好 " + stamp) })
	say("开个任务：看看 README 有没有错别字 " + stamp)
	h.until("the task is done", func() bool {
		for _, tk := range s.OnHand.Tasks {
			if strings.Contains(tk.Title, stamp) && (tk.Attention == "done_claimed" || tk.Attention == "done") {
				return true
			}
		}
		return false
	})
	h.tt.Advance(2 * time.Second)
	h.until("settle", func() bool { return true })
	h.shot("remote-conversation")
	h.click(h.app.L.T("nav.onhand"))
	h.shot("remote-onhand")
}
