package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The taste review: every screen at 1280 and 900 px, zh and en, on the
// mock. DUCTER_REVIEW=<dir> writes review-<lang>-<width>-<screen>.png there.
//
//	DUCTER_REVIEW=docs go test ./internal/views -run Review
func TestReviewShots(t *testing.T) {
	dir := os.Getenv("DUCTER_REVIEW")
	if dir == "" {
		t.Skip("DUCTER_REVIEW not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1280, 900} {
			t.Run(fmt.Sprintf("%s-%d", lang, w), func(t *testing.T) { review(t, dir, lang, w) })
		}
	}
}

func reviewShot(t *testing.T, tt *ui.Tester, dir string, lang i18n.Lang, w int, name string) {
	t.Helper()
	tt.Advance(time.Second)
	f, err := os.Create(filepath.Join(dir, fmt.Sprintf("review-%s-%d-%s.png", lang, w, name)))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func review(t *testing.T, dir string, lang i18n.Lang, w int) {
	shot := func(tt *ui.Tester, name string) { reviewShot(t, tt, dir, lang, w, name) }

	// First run, then the connect card.
	d := dial(t, "ws://127.0.0.1:1/ws", lang)
	d.tt.SetSize(w, 860)
	d.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78}) // the macOS traffic lights
	d.until("a failed attempt", func() bool { return d.app.Failed })
	shot(d.tt, "firstrun")
	d.app.Pair = func(string, string) error { return nil }
	d.app.openConnect()
	d.tt.Frame()
	shot(d.tt, "connect")

	// An empty Ducter: the greeting.
	theme.LoadFonts()
	empty := New(store.New(), theme.Pebble(), i18n.New(lang))
	empty.LocaleFixed = true
	empty.Status = client.Connected
	empty.Receive(protocol.ServerFrame{T: "welcome", Persona: "p", PersonaName: "Ducter"})
	empty.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	et := ui.NewTesterWith(empty.View, w, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	et.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	et.Frame()
	shot(et, "empty")
	empty.Route = RouteOnHand
	et.Frame()
	shot(et, "onhand-empty")

	// The slice on the mock.
	h := newHarness(t, lang)
	h.app.LocaleFixed = true
	h.tt.SetSize(w, 860)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	s := h.app.S
	msg := map[i18n.Lang]string{i18n.ZH: "帮我看下 HawDB #1592 的 CI 为什么挂了", i18n.EN: "Find out why CI fails on HawDB #1592"}[lang]
	h.app.SendMessage(msg)
	h.until("the decision", func() bool { return s.PendingDecision("t-ci-1") != nil })
	h.tt.Frame()
	shot(h.tt, "conversation")
	h.app.Route = RouteOnHand
	h.tt.Frame()
	shot(h.tt, "onhand")
	h.app.OpenTask("t-ci-1")
	h.until("history", func() bool { return s.Task("t-ci-1").HistoryLoaded })
	shot(h.tt, "task")
	h.app.Decide(s.PendingDecision("t-ci-1").DecisionID, "go", "")
	h.until("done", func() bool {
		return s.Task("t-ci-1").Attention() == protocol.Done && len(s.Channel) > 0 && s.Channel[len(s.Channel)-1].AI != nil
	})
	shot(h.tt, "task-done")
	h.app.Route = RouteConversation
	h.until("history for the result", func() bool { return s.Task("t-ci-1").HistoryLoaded })
	h.tt.Frame()
	shot(h.tt, "conversation-done")
}
