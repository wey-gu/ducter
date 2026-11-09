// Mockserver serves Ducter's client WebSocket protocol with a scripted
// scenario (internal/mock), so the desktop client runs without the real
// backend.
//
//	go run ./cmd/mockserver                # ws://127.0.0.1:${DUCTER_PORT:-7777}/ws
//	MOCK_SPEED=3 go run ./cmd/mockserver   # three times as fast
//	MOCK_SCENE=cloud-working go run ./cmd/mockserver
//
// The Devices stage's scenes (mock.Scenes) switch while it runs, and a
// phone or a computer can pretend to redeem the pairing code:
//
//	curl '127.0.0.1:7777/demo/scene?name=cloud-asleep'
//	curl '127.0.0.1:7777/demo/pair?name=iPhone'          # a phone pairs
//	curl '127.0.0.1:7777/demo/scene?name=joined'          # a Mac mini joins
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/mock"
)

func main() {
	port := os.Getenv("DUCTER_PORT")
	if port == "" {
		port = "7777"
	}
	h := mock.NewHub(0)
	if s := os.Getenv("MOCK_SCENE"); s != "" && !h.Scene(s) {
		log.Fatalf("no scene %q (%s)", s, strings.Join(mock.Scenes, ", "))
	}
	http.Handle("/ws", h.Handler())
	http.HandleFunc("/demo/scene", func(w http.ResponseWriter, r *http.Request) {
		if !h.Scene(r.URL.Query().Get("name")) {
			http.Error(w, "scenes: "+strings.Join(mock.Scenes, ", "), http.StatusNotFound)
			return
		}
		fmt.Fprintln(w, "ok")
	})
	http.HandleFunc("/demo/pair", func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		if name == "" {
			name = "iPhone"
		}
		h.Pair(name, "ios")
		fmt.Fprintln(w, "ok")
	})
	addr := "127.0.0.1:" + port
	log.Printf("ducter mockserver on ws://%s/ws (speed %g)", addr, h.Speed())
	log.Fatal(http.ListenAndServe(addr, nil))
}
