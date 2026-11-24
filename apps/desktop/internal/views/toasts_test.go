package views

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D527: every toast shows in the one slot, centred over the place's own
// content (beside the list of partners, On hand's projects, Settings' rail,
// between a task's rail and its workbench), its foot S3 over the composer
// and what sits on it, at 1000 and 1400; the pointer on it holds it.
func TestToastSlotPlacesEveryToast(t *testing.T) {
	h := newHarness(t, i18n.ZH)
	const words = "已更新到 0.1.38"
	partners := []protocol.PartnerInfo{
		{ID: h.app.S.Persona, Name: h.app.S.PersonaName, Look: "pebble"},
		{ID: "p-mem", Name: "记忆管家", Look: "moss"},
	}
	type place struct {
		name  string
		open  func()
		above bool // a composer stands at its foot
	}
	places := []place{
		{"conversation", func() { h.app.S.Partners = nil; h.app.Route = RouteConversation }, true},
		{"beside the partners", func() { h.app.S.Partners = partners; h.app.Route = RouteConversation }, true},
		{"on hand", func() { h.app.S.Partners = nil; h.app.Route = RouteOnHand }, false},
		{"settings", func() { h.app.S.Partners = nil; h.app.OpenSettings() }, false},
		{"a task", func() { h.app.S.Partners = nil; h.app.OpenTask(firstTask(h.app)) }, true},
	}
	frames := func(n int, d time.Duration) {
		for i := 0; i < n; i++ {
			h.tt.Advance(d)
			h.tt.Frame()
		}
	}
	for _, w := range []int{1000, 1400} {
		for _, p := range places {
			h.tt.SetSize(w, 820)
			p.open()
			frames(4, 100*time.Millisecond)
			h.app.toast(words)
			frames(3, 100*time.Millisecond)
			r, ok := h.tt.Find(words)
			if !ok {
				t.Fatalf("%s at %d: no toast", p.name, w)
			}
			area, floor := h.app.toastAt.area, h.app.toastAt.floor
			// Beside a column (the partners, Settings' rail; On hand's
			// projects and a task's rail from 1060) the content is narrower.
			beside := p.name == "beside the partners" || p.name == "settings" || w >= 1400 && p.name != "conversation"
			if area.W <= 0 || beside && area.W >= float32(w) {
				t.Errorf("%s at %d: the place said no area of its own (%v)", p.name, w, area)
			}
			if mid, want := r.X+r.W/2, area.X+area.W/2; mid < want-1 || mid > want+1 {
				t.Errorf("%s at %d: toast centred at %.1f, its place's content at %.1f", p.name, w, mid, want)
			}
			if p.above {
				if floor <= 0 {
					t.Errorf("%s at %d: no composer said", p.name, w)
				}
				// The card's foot: its words, its padding and its ledge.
				if foot := r.Y + r.H + h.app.T.S2 + h.app.T.PressPrimary.Offset; foot > floor-h.app.T.S2 {
					t.Errorf("%s at %d: the toast's foot %.1f reaches the composer's top %.1f", p.name, w, foot, floor)
				}
			} else if r.Y+r.H > area.Y+area.H-h.app.T.S5 {
				t.Errorf("%s at %d: the toast sits on the window's edge", p.name, w)
			}
			frames(60, 100*time.Millisecond) // gone (4 s)
			if h.tt.HasText(words) {
				t.Errorf("%s at %d: the toast stayed past its time", p.name, w)
			}
		}
	}

	// The pointer resting on it holds it; elsewhere (the composer) it doesn't.
	h.tt.SetSize(1150, 820)
	places[0].open()
	frames(4, 100*time.Millisecond)
	h.app.toast(words)
	frames(3, 100*time.Millisecond)
	r, _ := h.tt.Find(words)
	h.tt.Move(r.X+r.W/2, r.Y+r.H/2)
	frames(80, 100*time.Millisecond)
	if !h.tt.HasText(words) {
		t.Fatal("the pointer on the toast didn't hold it")
	}
	h.tt.Move(r.X+r.W/2, h.app.toastAt.floor+30) // on the composer
	frames(60, 100*time.Millisecond)
	if h.tt.HasText(words) {
		t.Error("the pointer on the composer held the toast")
	}
}

// D527: the one slot. No view builds toasts of its own, nor leaves them to
// MyGo's look (which centres them on the window, over the composer).
func TestToastsGoThroughTheOneSlot(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") || f == "toasts.go" {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		for _, bad := range []string{"ToastViewportBase(", "ToastBase("} {
			if strings.Contains(string(b), bad) {
				t.Errorf("%s: %s outside toasts.go (D527: the one toast slot)", f, bad)
			}
		}
	}
}
