package remote

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestParse(t *testing.T) {
	cases := []struct{ addr, code, base, outCode string }{
		{"d.example.com", "k7qm 4xpa", "https://d.example.com", "K7QM-4XPA"},
		{"https://d.example.com/", "K7QM-4XPA", "https://d.example.com", "K7QM-4XPA"},
		{"https://d.example.com/pair#c=K7QM-4XPA", "", "https://d.example.com", "K7QM-4XPA"},
		{"http://127.0.0.1:7777/pair#c=AB2C-DE3F", "", "http://127.0.0.1:7777", "AB2C-DE3F"},
		{"127.0.0.1:7777", "", "http://127.0.0.1:7777", ""},
		{"localhost:7420", "", "http://localhost:7420", ""},
		{"wss://d.example.com/ws", "x", "https://d.example.com", "X"},
		{"https://example.com/ducter/pair#c=K7QM-4XPA", "", "https://example.com/ducter", "K7QM-4XPA"},
	}
	for _, c := range cases {
		base, code, err := Parse(c.addr, c.code)
		if err != nil || base != c.base || code != c.outCode {
			t.Errorf("Parse(%q, %q) = %q, %q, %v; want %q, %q", c.addr, c.code, base, code, err, c.base, c.outCode)
		}
	}
	for _, bad := range []string{"", "   ", "ftp://x"} {
		if _, _, err := Parse(bad, ""); !errors.Is(err, ErrBadAddress) {
			t.Errorf("Parse(%q): want ErrBadAddress, got %v", bad, err)
		}
	}
	if WSURL("https://d.example.com") != "wss://d.example.com/ws" || WSURL("http://127.0.0.1:7777") != "ws://127.0.0.1:7777/ws" {
		t.Error("WSURL")
	}
}

func TestPair(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/pair":
			var b map[string]string
			_ = json.NewDecoder(r.Body).Decode(&b)
			switch b["code"] {
			case "GOOD-CODE":
				if b["name"] != "mac" {
					w.WriteHeader(400)
					return
				}
				_ = json.NewEncoder(w).Encode(map[string]string{"token": "dvc.abc.def", "deviceId": "abc", "personaName": "Ducter"})
			case "LOCK-EDXX":
				w.WriteHeader(429)
			default:
				w.WriteHeader(401)
			}
		case "/health":
			_, _ = w.Write([]byte(`{"ok":true,"headSeq":3}`))
		}
	}))
	defer srv.Close()
	ctx := context.Background()
	s, err := Pair(ctx, srv.URL, "GOOD-CODE", "mac")
	if err != nil || s.Token != "dvc.abc.def" || s.URL != WSURL(srv.URL) || s.Persona != "Ducter" {
		t.Fatalf("pair: %+v %v", s, err)
	}
	if _, err := Pair(ctx, srv.URL, "BADX-CODE", "mac"); !errors.Is(err, ErrBadCode) {
		t.Errorf("bad code: %v", err)
	}
	if _, err := Pair(ctx, srv.URL, "LOCK-EDXX", "mac"); !errors.Is(err, ErrLocked) {
		t.Errorf("locked: %v", err)
	}
	// httptest listens on 127.0.0.1: no code means "just check it's a Ducter".
	if s, err := Pair(ctx, srv.URL, "", "mac"); err != nil || s.Token != "" {
		t.Errorf("loopback without code: %+v %v", s, err)
	}
	if _, err := Pair(ctx, "https://d.example.invalid", "", "mac"); !errors.Is(err, ErrNoCode) {
		t.Errorf("remote without code: %v", err)
	}
	if _, err := Pair(ctx, "http://127.0.0.1:1", "GOOD-CODE", "mac"); !errors.Is(err, ErrUnreachable) {
		t.Errorf("unreachable: %v", err)
	}
}

func TestSaveIsOwnerOnly(t *testing.T) {
	p := filepath.Join(t.TempDir(), "Ducter", "connection.json")
	if s, err := Load(p); s != nil || err != nil {
		t.Fatalf("empty load: %v %v", s, err)
	}
	if err := Save(p, Saved{URL: "wss://d.example.com/ws", Token: "dvc.x.y"}); err != nil {
		t.Fatal(err)
	}
	fi, _ := os.Stat(p)
	if fi.Mode().Perm() != 0o600 {
		t.Errorf("mode %v", fi.Mode().Perm())
	}
	di, _ := os.Stat(filepath.Dir(p))
	if di.Mode().Perm() != 0o700 {
		t.Errorf("dir mode %v", di.Mode().Perm())
	}
	s, _ := Load(p)
	if s == nil || s.Token != "dvc.x.y" {
		t.Errorf("load: %+v", s)
	}
	_ = Clear(p)
	if s, _ := Load(p); s != nil {
		t.Error("clear")
	}
}
