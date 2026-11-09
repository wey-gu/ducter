package store

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The connections frame (D96) decodes and lands in the store; it never
// carries a token, and an add's answer waits for the page to word it.
func TestConnectionsFrame(t *testing.T) {
	raw := `{"t":"connections","connections":[{"id":"conn_1","name":"OpenConnector","url":"http://127.0.0.1:3000/mcp","source":"self","addedAt":"2026-11-09T10:00:00Z","via":"oo","state":"ok"}],"oo":{"installed":true,"selfHosted":{"url":"http://127.0.0.1:3000","hasToken":true},"account":false}}`
	f, err := protocol.DecodeServerFrame([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	s := New()
	s.Apply(f)
	if !s.ConnAsked || len(s.Connections) != 1 || s.Connections[0].Source != "self" || s.Connections[0].Via != "oo" {
		t.Fatalf("connections not applied: %+v", s.Connections)
	}
	if s.Oo == nil || s.Oo.SelfHosted == nil || !s.Oo.SelfHosted.HasToken {
		t.Fatalf("oo not applied: %+v", s.Oo)
	}
	r, err := protocol.DecodeServerFrame([]byte(`{"t":"connection_result","ok":false,"reason":"unauthorized"}`))
	if err != nil {
		t.Fatal(err)
	}
	s.Apply(r)
	if s.ConnResult == nil || s.ConnResult.Reason != "unauthorized" {
		t.Fatalf("result not kept: %+v", s.ConnResult)
	}
	empty, _ := protocol.DecodeServerFrame([]byte(`{"t":"connections","oo":{"installed":false,"account":false}}`))
	s.Apply(empty)
	if s.Connections == nil || len(s.Connections) != 0 {
		t.Fatalf("an empty list must read as asked-and-empty, got %v", s.Connections)
	}
}
