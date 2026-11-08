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
	// DUCTER_REMOTE_DEVICE=vps-worker places the task on that worker; with DUCTER_REMOTE_SLOW=1
	// the task runs long and the test waits (up to 5 min) while someone stops and restarts the
	// worker: it shots On hand while the task waits on "<device> 连不上", then waits for done.
	task := "开个任务：看看 README 有没有错别字 " + stamp
	device, slow := os.Getenv("DUCTER_REMOTE_DEVICE"), os.Getenv("DUCTER_REMOTE_SLOW") == "1"
	if device != "" {
		task = "开个任务：在 " + device + " 上看看 README " + stamp
		if slow {
			task = "开个任务：在 " + device + " 上慢慢编译一遍 " + stamp
		}
	}
	say(task)
	byStamp := func(want ...string) func() bool {
		return func() bool {
			for _, tk := range s.OnHand.Tasks {
				if strings.Contains(tk.Title, stamp) {
					for _, w := range want {
						if string(tk.Attention) == w {
							return true
						}
					}
				}
			}
			return false
		}
	}
	if slow {
		h.wait = 5 * time.Minute
		t.Log("task running on " + device + ": stop the worker now (systemctl --user stop ducter on it)")
		h.until("the task waits on its device", byStamp("blocked"))
		h.click(h.app.L.T("nav.onhand"))
		h.tt.Advance(time.Second)
		if !h.tt.HasText(h.app.L.T("device.unreachable", device)) {
			t.Errorf("On hand doesn't say %q: %q", h.app.L.T("device.unreachable", device), h.tt.Texts())
		}
		h.shot("remote-device-unreachable")
		t.Log("waiting: start the worker again")
		h.click(h.app.L.T("nav.back"))
	}
	h.until("the task is done", byStamp("done_claimed", "done"))
	h.tt.Advance(2 * time.Second)
	h.until("settle", func() bool { return true })
	h.shot("remote-conversation")
	h.click(h.app.L.T("nav.onhand"))
	h.shot("remote-onhand")
}
