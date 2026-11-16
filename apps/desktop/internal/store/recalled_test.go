package store

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D304: a 想起了 line is not an entry: it stands under the message it names,
// once, and goes when the person had it forgotten on any client.
func TestRecalledStandsUnderItsMessage(t *testing.T) {
	s := New()
	s.Apply(events(
		ev(1, "channel", protocol.KindUserMsg, protocol.UserMsg{Text: "周报哪天发？"}),
		ev(2, "channel", protocol.KindAIMsg, protocol.AIMsg{Text: "周五下午，发给产品组。", ReplyTo: 1}),
		ev(3, "channel", protocol.KindMemoryRecalled, protocol.MemoryRecalled{MemoryID: "m1", Title: "周报每周五下午发", By: "said", Date: "2026-11-10", AboutSeq: 2, ReplyTo: 1}),
		ev(4, "channel", protocol.KindMemoryRecalled, protocol.MemoryRecalled{MemoryID: "m2", Title: "a second one", By: "you", AboutSeq: 2}),
		ev(5, "channel", protocol.KindMemoryRecalled, protocol.MemoryRecalled{Title: "no id", AboutSeq: 9}),
	))
	if len(s.Channel) != 2 {
		t.Fatalf("%d entries; a recalled line must not be one", len(s.Channel))
	}
	r := s.RecalledFor(2)
	if r == nil || r.Seq != 3 || r.MemoryID != "m1" || r.By != "said" {
		t.Fatalf("under 2: %#v", r)
	}
	if s.RecalledFor(9) != nil {
		t.Errorf("a line without Mem's id is kept")
	}
	s.Apply(protocol.ServerFrame{T: "settings", Mem: &protocol.MemView{State: "connected", Forgotten: []int64{3}}})
	if s.RecalledFor(2) != nil {
		t.Errorf("a forgotten line still shows")
	}
}

func TestMemoryFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"settings","mem":{"state":"connected","noted":[{"seq":7,"title":"x","at":"2026-11-16T08:00:00Z","memoryId":"m1","confirmed":true,"corrected":true}],"forgotten":[3]},"corrected":{"seq":7,"how":"mem"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if f.Corrected == nil || f.Corrected.How != "mem" || len(f.Mem.Forgotten) != 1 || !f.Mem.Noted[0].Confirmed || !f.Mem.Noted[0].Corrected {
		t.Fatalf("%#v %#v", f.Corrected, f.Mem)
	}
	s := New()
	s.Apply(f)
	if s.Corrected == nil || s.Corrected.Seq != 7 {
		t.Errorf("corrected not kept: %#v", s.Corrected)
	}
}
