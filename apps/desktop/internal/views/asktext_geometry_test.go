package views

// D615: an ask's words can hold a 120-character URL, a long path or a long command. On the
// web the card was wider than the phone; on the Mac the reading face already breaks a long token,
// and this keeps it so at the widths the Mac is drawn for (1000, 1150, 1400), in the conversation
// and on On hand, where an ask of the partner's fills the lane.

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func TestAskCardLongTokensFit(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	url := "https://example.com/" + strings.Repeat("a", 100)
	path := "/Users/someone/projects/" + strings.Repeat("b", 100) + "/file.ts"
	cmd := "git " + strings.Repeat("c", 110)
	// Plain words: the whole question is one ui.Text, so its box is the wrapped paragraph's.
	plain := "The build reads " + path + " then runs " + cmd + " before it reports."
	// A task's own words with a link and a code (askText): they are shaped as Markdown pieces.
	marked := "Open " + url + " and run `" + cmd + "` in " + path + "."
	events := []protocol.LogEvent{
		protocol.NewEvent(1, now, "default", "channel", protocol.OriginSystem, protocol.KindDecision,
			protocol.Decision{DecisionID: "d_plain", Question: plain, GoLabel: "Continue", DefaultOption: "hold", Reversible: true}),
		protocol.NewEvent(2, now, "default", "channel", protocol.OriginSystem, protocol.KindDecision,
			protocol.Decision{DecisionID: "d_marked", Question: marked, GoLabel: "Continue", DefaultOption: "hold", Reversible: true}),
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: events})

	for _, route := range []struct {
		name string
		r    Route
	}{{"conversation", RouteConversation}, {"on hand", RouteOnHand}} {
		app.Route = route.r
		for _, w := range []int{1000, 1150, 1400} {
			tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			r, ok := tt.Find(plain)
			if !ok {
				t.Fatalf("%s %d: the long question is not drawn", route.name, w)
			}
			// It wraps (more than one line), and no line runs past the window's edge.
			if r.H <= app.T.AskSize*1.45 {
				t.Errorf("%s %d: the long question did not wrap: %+v", route.name, w, r)
			}
			if r.X < 0 || r.X+r.W > float32(w)+0.5 {
				t.Errorf("%s %d: the question runs past the window: %+v", route.name, w, r)
			}
			// Every drawn piece of the link, the path and the command stays on the page.
			for _, s := range tt.Texts() {
				if !strings.Contains(s, url) && !strings.Contains(s, path) && !strings.Contains(s, cmd) {
					continue
				}
				p, ok := tt.Find(s)
				if ok && (p.X < 0 || p.X+p.W > float32(w)+0.5) {
					t.Errorf("%s %d: %q runs past the window: %+v", route.name, w, s, p)
				}
			}
		}
	}
}
