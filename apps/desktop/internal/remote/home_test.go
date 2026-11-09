package remote

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/net/websocket"
)

// fakeHome is a Ducter elsewhere: /ws needs a device token and answers
// pair_code; POST /pair trades a code for a token and records the name.
type fakeHome struct {
	mu      sync.Mutex
	tokens  map[string]string // token -> device name
	codes   map[string]bool
	paired  []string
	noCodes bool // an older Ducter: pair_code is an error
}

func newFakeHome() (*fakeHome, *httptest.Server) {
	f := &fakeHome{tokens: map[string]string{"dvc.app": "weyl-mbp"}, codes: map[string]bool{}}
	mux := http.NewServeMux()
	ws := websocket.Server{Handler: func(c *websocket.Conn) {
		for {
			var m map[string]any
			if err := websocket.JSON.Receive(c, &m); err != nil {
				return
			}
			switch m["t"] {
			case "hello":
				_ = websocket.JSON.Send(c, map[string]any{"t": "welcome", "personaName": "Ducter"})
			case "pair_code":
				if f.noCodes {
					_ = websocket.JSON.Send(c, map[string]any{"t": "error", "message": "unknown frame"})
					continue
				}
				f.mu.Lock()
				code := "K7QM-4XPA"
				f.codes[code] = true
				f.mu.Unlock()
				_ = websocket.JSON.Send(c, map[string]any{"t": "pair_code", "code": code, "expiresAt": time.Now().Add(10 * time.Minute).Format(time.RFC3339)})
			}
		}
	}}
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		_, ok := f.tokens[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
		f.mu.Unlock()
		if !ok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		ws.ServeHTTP(w, r)
	})
	mux.HandleFunc("/pair", func(w http.ResponseWriter, r *http.Request) {
		var b struct{ Code, Name string }
		_ = json.NewDecoder(r.Body).Decode(&b)
		f.mu.Lock()
		defer f.mu.Unlock()
		if !f.codes[b.Code] {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		delete(f.codes, b.Code)
		tok := "dvc.cli" + string(rune('0'+len(f.paired)))
		f.tokens[tok] = b.Name
		f.paired = append(f.paired, b.Name)
		_ = json.NewEncoder(w).Encode(map[string]string{"token": tok, "deviceId": "a1b2c3d4e5", "personaName": "Ducter"})
	})
	return f, httptest.NewServer(mux)
}

func TestAppConnectedPairsTheCLIAsItsOwnDevice(t *testing.T) {
	f, srv := newFakeHome()
	defer srv.Close()
	dir := t.TempDir()
	now := time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)
	s := Saved{URL: WSURL(srv.URL), Token: "dvc.app"}
	if err := AppConnected(context.Background(), dir, s, "ws://127.0.0.1:7777/ws", "weyl-mbp", now, false); err != nil {
		t.Fatal(err)
	}
	h := LoadHome(dir)
	if h == nil || h.Address != srv.URL || h.Token != "dvc.cli0" || h.By != "app" || h.DeviceID != "a1b2c3d4e5" || h.Since != "2026-11-10T09:00:00Z" {
		t.Fatalf("home.json = %+v", h)
	}
	if h.Token == s.Token {
		t.Fatal("the CLI must not reuse the app's token")
	}
	if len(f.paired) != 1 || f.paired[0] != "CLI on weyl-mbp" {
		t.Fatalf("paired %v", f.paired)
	}
	st, err := os.Stat(HomeFile(dir))
	if err != nil || st.Mode().Perm() != 0o600 {
		t.Fatalf("home.json mode %v %v", st.Mode().Perm(), err)
	}
	// A relaunch keeps a token that still works: no second device.
	if err := AppConnected(context.Background(), dir, s, "ws://127.0.0.1:7777/ws", "weyl-mbp", now, true); err != nil {
		t.Fatal(err)
	}
	if len(f.paired) != 1 {
		t.Fatalf("paired again: %v", f.paired)
	}
	// Disconnected on the home: the next launch pairs a fresh one.
	f.mu.Lock()
	delete(f.tokens, "dvc.cli0")
	f.mu.Unlock()
	if err := AppConnected(context.Background(), dir, s, "ws://127.0.0.1:7777/ws", "weyl-mbp", now, true); err != nil {
		t.Fatal(err)
	}
	if h := LoadHome(dir); len(f.paired) != 2 || h.Token != "dvc.cli1" {
		t.Fatalf("after revoke: %v %+v", f.paired, h)
	}
}

func TestAppConnectedBackHereClearsHome(t *testing.T) {
	dir := t.TempDir()
	if err := SaveHome(dir, Home{Address: "https://hel.siwei.info", Token: "dvc.x", Name: "hel.siwei.info", By: "app"}); err != nil {
		t.Fatal(err)
	}
	if err := AppConnected(context.Background(), dir, Saved{URL: "ws://127.0.0.1:7777/ws"}, "ws://127.0.0.1:7777/ws", "m", time.Now(), false); err != nil {
		t.Fatal(err)
	}
	if LoadHome(dir) != nil {
		t.Fatal("home.json should be gone")
	}
	// A tunnel to another Ducter: loopback needs no token, so only the address.
	if err := AppConnected(context.Background(), dir, Saved{URL: "ws://127.0.0.1:7799/ws"}, "ws://127.0.0.1:7777/ws", "m", time.Now(), false); err != nil {
		t.Fatal(err)
	}
	if h := LoadHome(dir); h == nil || h.Address != "http://127.0.0.1:7799" || h.Token != "" {
		t.Fatalf("tunnel home = %+v", h)
	}
}

func TestAppConnectedLeavesTheUsersOwnConnectAtLaunch(t *testing.T) {
	_, srv := newFakeHome()
	defer srv.Close()
	dir := t.TempDir()
	mine := Home{Address: "https://other.example", Token: "dvc.mine", Name: "other.example", By: "cli"}
	_ = SaveHome(dir, mine)
	_ = AppConnected(context.Background(), dir, Saved{URL: WSURL(srv.URL), Token: "dvc.app"}, "ws://127.0.0.1:7777/ws", "m", time.Now(), true)
	if h := LoadHome(dir); h == nil || *h != mine {
		t.Fatalf("launch moved the user's own connect: %+v", h)
	}
	// Connecting in the app does move it.
	if err := AppConnected(context.Background(), dir, Saved{URL: WSURL(srv.URL), Token: "dvc.app"}, "ws://127.0.0.1:7777/ws", "m", time.Now(), false); err != nil {
		t.Fatal(err)
	}
	if h := LoadHome(dir); h.Address != srv.URL || h.By != "app" {
		t.Fatalf("home = %+v", h)
	}
}

func TestAppConnectedWithoutCodesStillNamesTheHome(t *testing.T) {
	f, srv := newFakeHome()
	defer srv.Close()
	f.noCodes = true
	dir := t.TempDir()
	err := AppConnected(context.Background(), dir, Saved{URL: WSURL(srv.URL), Token: "dvc.app"}, "ws://127.0.0.1:7777/ws", "m", time.Now(), false)
	if err == nil {
		t.Fatal("want an error from an older Ducter")
	}
	if h := LoadHome(dir); h == nil || h.Address != srv.URL || h.Token != "" {
		t.Fatalf("home = %+v (the CLI should say how to connect, not show this Mac)", h)
	}
}

func TestBaseOf(t *testing.T) {
	for in, want := range map[string]string{
		"wss://hel.siwei.info/ws":     "https://hel.siwei.info",
		"ws://127.0.0.1:7799/ws":      "http://127.0.0.1:7799",
		"wss://d.example.com/sub/ws/": "https://d.example.com/sub",
	} {
		if got := BaseOf(in); got != want {
			t.Errorf("BaseOf(%q) = %q, want %q", in, got, want)
		}
	}
}
