package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D623: the day after the first run: the partner's recap, its true facts as quiet links,
// and the one offer card under them. zh and en, both themes (the shots test covers the pictures).
func TestDayAfterRecap(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		now := time.Now().UTC().Format(time.RFC3339Nano)
		text := map[i18n.Lang]string{i18n.ZH: "昨天我们把登录页的跳转修好了，也给 CI 开了看守。", i18n.EN: "Yesterday we fixed the login redirect and started looking after CI."}[lang]
		items := []protocol.DayAfterItem{
			{Kind: "task", ID: "t_login", Title: map[i18n.Lang]string{i18n.ZH: "修好登录页的跳转", i18n.EN: "Fix the login redirect"}[lang]},
			{Kind: "keep", ID: "kp_ci", Title: map[i18n.Lang]string{i18n.ZH: "每天早上看 CI", i18n.EN: "Look at CI each morning"}[lang]},
			{Kind: "account", ID: "conn_gmail", Title: "Gmail"},
		}
		note := protocol.Finds{NoteID: "n_day", Rung: "day_after", Opening: map[i18n.Lang]string{i18n.ZH: "要不要我每天早上给你一句话？", i18n.EN: "Want me to say one line each morning?"}[lang], Finds: []protocol.FindView{}, Ask: "day_after"}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(1, now, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: text, DayAfter: &protocol.DayAfter{Items: items}}),
			protocol.NewEvent(2, now, "default", "channel", protocol.OriginPartner, protocol.KindFinds, note),
		}})
		tt := ui.NewTesterWith(app.View, 1150, 1400, ui.TesterOptions{})
		tt.SetScale(2)
		tt.Frame()
		all := strings.Join(tt.Texts(), "\n")
		want := map[i18n.Lang][]string{
			i18n.ZH: {text, "做完了「修好登录页的跳转」", "开始看守「每天早上看 CI」", "连上了 Gmail", "要不要我每天早上给你一句话？", "好，每天早上", "不用"},
			i18n.EN: {text, "Finished “Fix the login redirect”", "Started looking after “Look at CI each morning”", "Connected Gmail", "Want me to say one line each morning?", "Yes, each morning", "No thanks"},
		}[lang]
		for _, s := range want {
			if !strings.Contains(all, s) {
				t.Errorf("%s: lacks %q in %q", lang, s, tt.Texts())
			}
		}
		// No feature tour and no fourth fact: the rows are the three code gave. It is an offer,
		// not a decision: no default line and no needs count.
		if strings.Count(all, "day.after.") > 0 {
			t.Errorf("%s: a raw i18n key leaked: %q", lang, tt.Texts())
		}
		if strings.Contains(all, "不回的话") || strings.Contains(all, "If you don't answer") {
			t.Errorf("%s: an offer must have no default: %q", lang, tt.Texts())
		}
		if strings.Contains(all, "待你处理") || strings.Contains(all, "need you") || strings.Contains(all, "needs you") {
			t.Errorf("%s: an offer must not count as needing the person: %q", lang, tt.Texts())
		}
	}
}
