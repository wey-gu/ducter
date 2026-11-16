package views

// D284: opening a long task feels instant. A fake home holds a 5,000-event
// task behind a simulated link (80 ms round trip, 4 Mbit/s, as a VPS behind
// a tunnel); the app asks for the newest window first and paints it within
// the budget after the frame arrives, then pages older history in the
// background up to historyLimit, and further only at the head.

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// historyHome answers task_history from one stream as core/src/ws.ts does.
type historyHome struct {
	evs []protocol.LogEvent
	// The link: a round trip, and its bandwidth in bytes per second.
	rtt time.Duration
	bps float64
	// gzip: the client said hello.gzip, so a frame over 16 KB goes gzipped.
	gzip bool
}

// answer is the frame's bytes on the wire for req and how long the link
// takes to carry them.
func (h historyHome) answer(req protocol.TaskHistoryReq) ([]byte, time.Duration) {
	end := len(h.evs)
	if req.BeforeSeq > 0 {
		end = 0
		for end < len(h.evs) && h.evs[end].Seq < req.BeforeSeq {
			end++
		}
	}
	from := max(0, end-req.Limit)
	f := map[string]any{"t": "task_history", "taskId": req.TaskID, "events": h.evs[from:end], "more": from > 0}
	if req.BeforeSeq > 0 {
		f["beforeSeq"] = req.BeforeSeq
	}
	data, _ := json.Marshal(f)
	if h.gzip && len(data) > 16*1024 {
		var b bytes.Buffer
		zw := gzip.NewWriter(&b)
		zw.Write(data)
		zw.Close()
		data = b.Bytes()
	}
	return data, h.rtt + time.Duration(float64(len(data))/h.bps*float64(time.Second))
}

// paint unzips and decodes a frame as the client does, hands it to the app
// and draws one frame: what the reader waits for after the bytes arrive.
func paint(t *testing.T, app *App, tt *ui.Tester, wire []byte) time.Duration {
	t.Helper()
	start := time.Now()
	data, err := client.Unzip(wire)
	if err != nil {
		t.Fatal(err)
	}
	f, err := protocol.DecodeServerFrame(data)
	if err != nil {
		t.Fatal(err)
	}
	app.Receive(f)
	tt.Frame()
	return time.Since(start)
}

func historyReqs(sent []any) []protocol.TaskHistoryReq {
	var out []protocol.TaskHistoryReq
	for _, f := range sent {
		if r, ok := f.(protocol.TaskHistoryReq); ok {
			out = append(out, r)
		}
	}
	return out
}

func TestTaskOpensFast(t *testing.T) {
	budget := 300 * time.Millisecond
	if os.Getenv("CI") != "" {
		// A shared CI runner paints on the CPU about half again slower than a Mac at
		// rest; the 300 ms budget holds locally, CI catches only a real regression.
		budget = 450 * time.Millisecond
	}
	home := historyHome{evs: longTask(5000, "long1"), rtt: 80 * time.Millisecond, bps: 4e6 / 8, gzip: true}
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	tt := ui.NewTesterWith(app.View, 1280, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.OpenTask("long1")
	tt.Frame()
	reqs := historyReqs(*sent)
	if len(reqs) != 1 || reqs[0].BeforeSeq != 0 || reqs[0].Limit != historyFirst {
		t.Fatalf("an opened task asks for its newest window first: %+v", reqs)
	}
	data, link := home.answer(reqs[0])
	took := paint(t, app, tt, data)
	t.Logf("newest window: %d KB, link %v, first paint %v after it arrived (to first paint %v)", len(data)/1024, link.Round(time.Millisecond), took.Round(time.Millisecond), (link + took).Round(time.Millisecond))
	if took > budget {
		t.Errorf("first paint took %v after the frame arrived, over %v", took, budget)
	}
	// Its latest words, at the end where it opens.
	var words struct {
		Role string `json:"role"`
		Text string `json:"text"`
	}
	for i := len(home.evs) - 1; i >= 0 && (words.Role != "assistant" || words.Text == ""); i-- {
		words.Role, words.Text = "", ""
		_ = json.Unmarshal(home.evs[i].Body, &words)
	}
	if _, ok := tt.Find(words.Text); !ok {
		t.Fatalf("the newest turn's words don't show: %q", texts(tt))
	}

	// Older pages follow one at a time, in the background, up to historyLimit.
	pages := 0
	for {
		reqs = historyReqs(*sent)
		r := reqs[len(reqs)-1]
		if len(reqs) != pages+2 {
			break
		}
		pages++
		if r.BeforeSeq == 0 || r.Limit != historyPage {
			t.Fatalf("page %d: %+v", pages, r)
		}
		data, _ := home.answer(r)
		if took := paint(t, app, tt, data); took > budget {
			t.Errorf("page %d held the page %v", pages, took)
		}
	}
	task := app.S.Task("long1")
	if n := len(task.Events); n < historyLimit || n >= historyLimit+historyPage || !task.HistMore {
		t.Fatalf("the background stops at historyLimit with more left: %d events, more %v (%d pages)", n, task.HistMore, pages)
	}
	// The reader at the head asks for more.
	app.taskList("long1").ScrollTo(0, ui.Start)
	tt.Frame()
	tt.Frame()
	if reqs := historyReqs(*sent); len(reqs) != pages+2 || reqs[len(reqs)-1].BeforeSeq != task.HistFrom {
		t.Fatalf("at the head, the next older page is asked: %+v", reqs[len(reqs)-1])
	}

	// Before D284 the app asked for 2,000 events in one frame: the number to beat.
	before := home
	before.gzip = false
	old, oldLink := before.answer(protocol.TaskHistoryReq{TaskID: "long1", Limit: 2000})
	app2, _ := iaApp(t, i18n.ZH)
	app2.Status = client.Connected
	tt2 := ui.NewTesterWith(app2.View, 1280, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app2.Route, app2.TaskID = RouteTask, "long1"
	oldTook := paint(t, app2, tt2, old)
	t.Logf("before (2,000 at once): %d KB, link %v, paint %v (to first paint %v)", len(old)/1024, oldLink.Round(time.Millisecond), oldTook.Round(time.Millisecond), (oldLink + oldTook).Round(time.Millisecond))
}

// D284: a task opened again shows what the store holds at once and asks
// nothing; after a reconnect it asks for the newest window again, and a
// window that meets what was held keeps the cache whole.
func TestTaskReopensFromCache(t *testing.T) {
	home := historyHome{evs: longTask(600, "c1"), rtt: 0, bps: 1e12}
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.OpenTask("c1")
	for {
		reqs := historyReqs(*sent)
		data, _ := home.answer(reqs[len(reqs)-1])
		f, _ := protocol.DecodeServerFrame(data)
		app.Receive(f)
		if len(historyReqs(*sent)) == len(reqs) {
			break
		}
	}
	held := len(app.S.Task("c1").Events)
	if held != 600 {
		t.Fatalf("held %d of 600", held)
	}
	app.Route = RouteConversation
	n := len(historyReqs(*sent))
	app.OpenTask("c1")
	if len(historyReqs(*sent)) != n {
		t.Fatalf("a cached task asked again")
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter"})
	app.Route = RouteConversation
	app.OpenTask("c1")
	reqs := historyReqs(*sent)
	if len(reqs) <= n || reqs[len(reqs)-1].BeforeSeq != 0 {
		t.Fatalf("after a reconnect the newest window is asked: %+v", reqs[n:])
	}
	data, _ := home.answer(reqs[len(reqs)-1])
	f, _ := protocol.DecodeServerFrame(data)
	app.Receive(f)
	task := app.S.Task("c1")
	if task.HistMore || task.HistFrom != home.evs[0].Seq || len(task.Events) != 600 {
		t.Fatalf("the cache is whole again: from %d more %v, %d events", task.HistFrom, task.HistMore, len(task.Events))
	}
}
