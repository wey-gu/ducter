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

// D279: a loop resting on its own wait says when it comes back (its state,
// its row, its end line), counts its looks, offers 现在就去看一次 and 不用再去看了,
// and shows the moment the wait comes true.
func TestWaitWatchCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		app.LocaleFixed = true
		now := time.Now()
		n := int64(0)
		at := func(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
			n++
			return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
		}
		id, ts := "t_lp", protocol.TaskStream("t_lp")
		reason := "nowledge-co 的新 review 请求"
		wake := "等到了：「" + reason + "」。接着做。"
		if lang == i18n.EN {
			reason = "a new review request in nowledge-co"
			wake = `The wait is over: "` + reason + `". Carry on.`
		}
		next := now.Add(30 * time.Minute)
		armed := protocol.Waiter{WaiterID: "w1", TaskID: id, Reason: reason, State: protocol.WaiterArmed, Kind: "check",
			Check: &protocol.CheckSpec{Argv: []string{"gh", "search", "prs"}}, EveryMs: 45 * 60_000,
			ArmedAt: now.Add(-15 * time.Minute).UTC().Format(time.RFC3339), NextLookAt: next.UTC().Format(time.RFC3339)}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			at(3*time.Hour, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: "Watch nowledge-co reviews", Harness: "codex", Place: protocol.Place{Kind: "none"}, Brief: "watch"}),
			at(2*time.Hour, ts, protocol.OriginPartner, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "partner", Text: wake}),
			at(2*time.Hour-time.Minute, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: "Nothing new."}),
			at(time.Hour, ts, protocol.OriginPartner, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "partner", Text: wake}),
			at(time.Hour-time.Minute, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: "Nothing new."}),
			at(15*time.Minute, "channel", protocol.OriginTask, protocol.KindWaiter, armed),
			at(15*time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Blocked}),
		}})
		tt := ui.NewTesterWith(app.View, 1280, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		app.OpenTask(id)
		app.S.Task(id).HistoryLoaded = true
		tt.Frame()
		tt.Frame()
		got := texts(tt)
		back := app.tp("watch.back", i18n.Clock(next))
		if next.Day() != now.Day() {
			back = i18n.Clock(next) // run from 23:30, the card says tomorrow's time its own way
		}
		for _, want := range []string{back, app.L.T("wait.look"), app.L.T("wait.cancel"), app.L.T("watch.tally", 2), app.L.T("wait.every", 45)} {
			if !strings.Contains(got, want) {
				t.Errorf("%s: the watch card lacks %q in:\n%s", lang, want, got)
			}
		}
		for _, old := range []string{"立即查看", "停止等待", "Look now", "Stop waiting"} {
			if strings.Contains(got, old) {
				t.Errorf("%s: an old word %q is still shown", lang, old)
			}
		}
		// The end line says what it waits for and when it comes back.
		if w, back := app.waitWords(app.S.WaiterFor(id)); !strings.Contains(back, i18n.Clock(next)) || w == "" || strings.Contains(w, "在等：") || strings.Contains(w, "Waiting:") {
			t.Errorf("%s: end line %q", lang, w)
		}
		// The wait comes true: the moment shows, then the task carries on.
		fired := armed
		fired.State = protocol.WaiterFired
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{at(0, "channel", protocol.OriginWaiter, protocol.KindWaiter, fired)}})
		tt.Frame()
		if got := texts(tt); !strings.Contains(got, app.L.T("watch.met")) {
			t.Errorf("%s: no moment when the wait came true:\n%s", lang, got)
		}
	}
}
