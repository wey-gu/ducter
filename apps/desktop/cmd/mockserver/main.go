// Mockserver serves Ducter's client WebSocket protocol with a scripted
// scenario (internal/mock), so the desktop client runs without the real
// backend.
//
//	go run ./cmd/mockserver                # ws://127.0.0.1:${DUCTER_PORT:-7777}/ws
//	MOCK_SPEED=3 go run ./cmd/mockserver   # three times as fast
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/wey-gu/ducter/apps/desktop/internal/mock"
)

func main() {
	port := os.Getenv("DUCTER_PORT")
	if port == "" {
		port = "7777"
	}
	h := mock.NewHub(0)
	http.Handle("/ws", h.Handler())
	addr := "127.0.0.1:" + port
	log.Printf("ducter mockserver on ws://%s/ws (speed %g)", addr, h.Speed())
	log.Fatal(http.ListenAndServe(addr, nil))
}
