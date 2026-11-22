package views

import (
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D310: the conversation's header, On hand's sentence and strip, and the
// menu bar say one Done today: tasks finished today (D467: a done still to
// be checked too, as every list shows it). A failed task, a task done
// yesterday and a missed wait are not in it (research/109 saw 26 beside 32).
func TestOneDoneTodayEverywhere(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	now := time.Date(2026, 11, 17, 15, 0, 0, 0, time.Local)
	app.Now = func() time.Time { return now }
	iso := func(d time.Duration) string { return now.Add(d).UTC().Format(time.RFC3339) }
	card := func(id string, a protocol.Attention, at string) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: "整理本周的发票 " + id, Place: protocol.Place{Kind: "none"}, Harness: "claude-code", Attention: a, OpenedAt: at, UpdatedAt: at}
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks: []protocol.TaskCard{
			card("a", protocol.Done, iso(-time.Hour)),
			card("b", protocol.Done, iso(-3*time.Hour)),
			card("c", protocol.Failed, iso(-2*time.Hour)),
			card("d", protocol.Done, iso(-16*time.Hour)), // yesterday evening, still on the board
			card("e", protocol.DoneClaimed, iso(-time.Hour)),
		},
		Missed: []protocol.Waiter{{WaiterID: "w1", Reason: "等 CI 变绿", State: "missed", EndedAt: iso(-30 * time.Minute)}},
	}})
	b := app.S.Board()
	n := app.stateCounts(b, "")
	// D467: a done whose check is still to come (e) is listed as done, so it counts.
	if n[3] != 3 || app.doneToday(b) != 3 {
		t.Fatalf("strip %d, header %d: want 3 everywhere", n[3], app.doneToday(b))
	}
	if say := app.headSay(b, "", n); !strings.Contains(say, app.L.T("onhand.say.done", 3)) {
		t.Errorf("the sentence says another number: %q", say)
	}
	if !strings.Contains(app.Tray(6).Say, app.L.T("onhand.say.done", 3)) {
		t.Errorf("the menu bar says another number: %q", app.Tray(6).Say)
	}
}

// D306, D310: the menu bar item has a name of its own for VoiceOver, and
// its sentence never doubles a space around a time (「最早  7:02  回来」).
func TestTrayLabelAndSpacing(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	now := time.Now()
	if got := app.Tray(6).Label; got != spoken(app.L, "Ducter", app.L.T("tray.state.quiet")) {
		t.Errorf("quiet label %q", got)
	}
	trayWorking(app, 1)
	if v := app.Tray(6); v.State != theme.TrayWorking || v.Label != spoken(app.L, "Ducter", app.L.T("lane.working")) {
		t.Errorf("working label %q", v.Label)
	}
	// Two waits, the first back at a time today: "最早 HH:MM 回来".
	at := now.Add(30 * time.Minute)
	if at.Day() != now.Day() {
		t.Skip("too close to midnight for a time today")
	}
	for i, id := range []string{"w1", "w2"} {
		w := protocol.Waiter{WaiterID: id, Reason: "等 CI 变绿", State: protocol.WaiterArmed, At: at.Add(time.Duration(i) * time.Hour).UTC().Format(time.RFC3339)}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{protocol.NewEvent(int64(10+i), now.UTC().Format(time.RFC3339), "default", "channel", protocol.OriginPartner, protocol.KindWaiter, w)}})
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app.L = i18n.New(lang)
		say := app.Tray(6).Say
		if !strings.Contains(say, i18n.Clock(at)) {
			t.Fatalf("%s: no time in %q", lang, say)
		}
		if strings.Contains(say, "  ") {
			t.Errorf("%s: doubled space in %q", lang, say)
		}
	}
}
