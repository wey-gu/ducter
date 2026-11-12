package remote

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A note sealed by packages/protocol/src/follow.ts (bun), opened here: the
// two sides agree byte for byte (D228).
const (
	vecID   = "TXlVSi-1Yon2hURum_bL3w"
	vecKey  = "LT_z9NpCgXPBSWxMAIMpdW1LmJ9z5iKDeb86D1cVVJo"
	vecNote = "l1JmKrDv7OLJ6gBween7OJw2Ol_4fRiKVZ3pyBQ8o-O99MMW3JNVqVshhpyZZhuseJHMKGy0ZGejOtg7eD4PXkAJndBp_eKlWTAalk-4ca3ljpY48K5Dztl4Bg"
)

func TestOpenNoteSealedByTheHome(t *testing.T) {
	n, ok := OpenNote(vecKey, vecID, vecNote)
	if !ok || n.URL != "https://new-name.trycloudflare.com" || n.At != 1762900000000 {
		t.Fatalf("opened %+v %v", n, ok)
	}
	if _, ok := OpenNote(vecKey, "AAAAAAAAAAAAAAAAAAAAAA", vecNote); ok {
		t.Fatal("a note moved to another id opened")
	}
	if _, ok := OpenNote("LT_z9NpCgXPBSWxMAIMpdW1LmJ9z5iKDeb86D1cVVJA", vecID, vecNote); ok {
		t.Fatal("opened with another key")
	}
}

func TestMoveToFollowsTheHomeToItsNewAddress(t *testing.T) {
	home := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/ducter-anywhere" {
			_, _ = w.Write([]byte("0123456789abcdef"))
			return
		}
		http.NotFound(w, r)
	}))
	defer home.Close()
	// The relay holds a note pointing at the home's new address (here: 127.0.0.1, allowed for tests).
	note := ""
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("id") != vecID || note == "" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"d": note})
	}))
	defer relay.Close()
	s := Saved{URL: "wss://old-name.trycloudflare.com/ws", Token: "dvc.x", Follow: &Follow{Relay: relay.URL, ID: vecID, Key: vecKey}}
	if _, ok := MoveTo(context.Background(), s); ok {
		t.Fatal("moved with no note")
	}
	note = sealForTest(t, home.URL, 5)
	moved, ok := MoveTo(context.Background(), s)
	if !ok || moved.URL != WSURL(home.URL) || moved.FollowAt != 5 || moved.Token != "dvc.x" {
		t.Fatalf("moved %+v %v", moved, ok)
	}
	// Already there, or an older note: stay.
	if _, ok := MoveTo(context.Background(), moved); ok {
		t.Fatal("moved again to where it is")
	}
	// A note pointing somewhere nothing answers: stay.
	note = sealForTest(t, "http://127.0.0.1:1", 9)
	if _, ok := MoveTo(context.Background(), moved); ok {
		t.Fatal("moved to an address where nothing answers")
	}
}

func TestFetchFollowAsksTheHome(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/me" || r.Header.Get("Authorization") != "Bearer dvc.x" {
			w.WriteHeader(401)
			return
		}
		_, _ = w.Write([]byte(`{"via":"device","follow":{"relay":"https://ducter.ai/api/addr","id":"` + vecID + `","key":"` + vecKey + `"}}`))
	}))
	defer srv.Close()
	f, err := FetchFollow(context.Background(), Saved{URL: WSURL(srv.URL), Token: "dvc.x"})
	if err != nil || f == nil || f.ID != vecID || !strings.HasPrefix(f.Relay, "https://") {
		t.Fatalf("follow %+v %v", f, err)
	}
}
