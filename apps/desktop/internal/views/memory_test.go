package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The partner remembering something is one quiet line in the user's
// language (D43, D329). D444: fresh, it shows once under the reply with
// 别记这个 / Don't keep this; once the person speaks again it folds into the
// reply's Details, with Forget.
func TestMemoryNotedLine(t *testing.T) {
	for _, tc := range []struct {
		lang        i18n.Lang
		said, title string
		want        string
	}{
		{i18n.ZH, "以后测试都用假时钟", "测试统一用假时钟", "记下了「测试统一用假时钟」"},
		{i18n.EN, "I use pnpm, not npm, in all my JS projects", "Use pnpm, not npm", "Noted “Use pnpm, not npm”"},
	} {
		theme.LoadFonts()
		app := New(store.New(), theme.Pebble(), i18n.New(tc.lang))
		app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 3})
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
		ev := func(seq int64, origin protocol.Origin, kind string, body any) protocol.LogEvent {
			return protocol.NewEvent(seq, "2026-11-09T20:00:00Z", "default", "channel", origin, kind, body)
		}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			ev(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: tc.said}),
			ev(2, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "OK", ReplyTo: 1}),
			ev(3, protocol.OriginPartner, protocol.KindMemoryNoted, protocol.MemoryNoted{Title: tc.title, ReplyTo: 1}),
		}})
		tt := ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		// D444: fresh (nothing said since), shown under the reply with 别记这个.
		if !tt.HasText(tc.want) || !tt.HasText(app.L.T("memory.undo")) {
			t.Errorf("%s: no %q with Don't keep this in %q", tc.lang, tc.want, tt.Texts())
		}
		// Once the person spoke again, folded into Details, with Forget.
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev(4, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "ok"})}})
		tt.Frame()
		if tt.HasText(tc.want) {
			t.Errorf("%s: %q still shows outside Details after the person spoke", tc.lang, tc.want)
		}
		if err := tt.Click(app.L.T("details.show")); err != nil {
			t.Fatalf("%s: %v in %q", tc.lang, err, tt.Texts())
		}
		tt.Frame()
		if !tt.HasText(tc.want) || !tt.HasText(app.L.T("partner.memory.forget")) {
			t.Errorf("%s: no %q with Forget in Details in %q", tc.lang, tc.want, tt.Texts())
		}
	}
}
