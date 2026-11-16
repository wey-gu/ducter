package client

import (
	"context"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/net/websocket"
)

// A home that welcomes with ping and then never says anything again: the
// client pings, gets no answer, and closes and dials again (D293).
func TestSilentHomeIsDialledAgain(t *testing.T) {
	PingEvery, DeadAfter = 20*time.Millisecond, 120*time.Millisecond
	defer func() { PingEvery, DeadAfter = 15*time.Second, 45*time.Second }()
	var mu sync.Mutex
	dials, pings := 0, 0
	srv := httptest.NewServer(websocket.Handler(func(ws *websocket.Conn) {
		mu.Lock()
		dials++
		mu.Unlock()
		var hello map[string]any
		_ = websocket.JSON.Receive(ws, &hello)
		_ = websocket.JSON.Send(ws, map[string]any{"t": "welcome", "persona": "p", "personaName": "Ducter", "headSeq": 0, "ping": true})
		for {
			var m string
			if err := websocket.Message.Receive(ws, &m); err != nil {
				return
			}
			if strings.Contains(m, `"ping"`) {
				mu.Lock()
				pings++
				mu.Unlock()
			}
		}
	}))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := New(Options{URL: "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"})
	go c.Run(ctx)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		d, p := dials, pings
		mu.Unlock()
		if d >= 2 && p >= 2 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("dials %d pings %d: a silent home should be dialled again", dials, pings)
}

// Going to sleep: the home hears {t:"sleep"}, and nothing is dialled until
// the Mac wakes; then at once.
func TestSleepThenWake(t *testing.T) {
	var mu sync.Mutex
	dials := 0
	var said []string
	srv := httptest.NewServer(websocket.Handler(func(ws *websocket.Conn) {
		mu.Lock()
		dials++
		mu.Unlock()
		for {
			var m string
			if err := websocket.Message.Receive(ws, &m); err != nil {
				return
			}
			mu.Lock()
			said = append(said, m)
			mu.Unlock()
			if strings.Contains(m, `"hello"`) {
				_ = websocket.JSON.Send(ws, map[string]any{"t": "welcome", "persona": "p", "personaName": "Ducter", "headSeq": 0})
			}
		}
	}))
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	up := make(chan Status, 16)
	c := New(Options{URL: "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws", OnStatus: func(s Status, _ error) { up <- s }})
	go c.Run(ctx)
	waitFor := func(want Status) {
		for {
			select {
			case s := <-up:
				if s == want {
					return
				}
			case <-time.After(3 * time.Second):
				t.Fatalf("no %v", want)
			}
		}
	}
	waitFor(Connected)
	c.Sleep()
	waitFor(Disconnected)
	time.Sleep(600 * time.Millisecond) // past a backoff: still not dialled
	mu.Lock()
	if dials != 1 {
		t.Fatalf("dialled %d times while asleep", dials)
	}
	slept := false
	for _, m := range said {
		slept = slept || strings.Contains(m, `"sleep"`)
	}
	mu.Unlock()
	if !slept {
		t.Fatal("the home never heard sleep")
	}
	c.Wake()
	waitFor(Connected)
}
