package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// limitApp is three tasks on Claude Code resting on one reset (Codex could
// take them), and one on pi that said no reset time (D297).
func limitApp(t *testing.T, lang i18n.Lang) (*App, time.Time, *[]any) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	at := func(d time.Duration) string { return now.Add(d).UTC().Format(time.RFC3339) }
	reset := now.Add(92 * time.Minute).Truncate(time.Minute)
	none := protocol.Place{Kind: "none"}
	card := func(id, title, harness string) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Project: "hawdb", Harness: harness, Attention: protocol.Blocked, OpenedAt: at(-time.Hour), UpdatedAt: at(-5 * time.Minute), Place: none}
	}
	wait := func(id, harness string, when time.Time, known bool, handTo string) protocol.Waiter {
		l := &protocol.LimitWait{Harness: harness, ResetKnown: known}
		if handTo != "" {
			l.HandTo = &protocol.HandTo{Harness: handTo}
		}
		return protocol.Waiter{WaiterID: "w_" + id, TaskID: id, Wakes: "task", Reason: harness, State: protocol.WaiterArmed, At: when.UTC().Format(time.RFC3339), ArmedAt: at(-30 * time.Minute), Limit: l}
	}
	cards := []protocol.TaskCard{
		card("t_l1", w("跑完 WAL 基准测试，给出 p99", "Run the WAL bench and report the p99"), "claude-code"),
		card("t_l2", w("整理 PR #1592 的评审意见", "Sort out the review comments on PR #1592"), "claude-code"),
		card("t_l3", w("更新 0.9 的 changelog", "Update the 0.9 changelog"), "claude-code"),
		card("t_l4", w("把周报的数据拉一遍", "Pull the numbers for the weekly report"), "pi"),
	}
	ws := []protocol.Waiter{
		wait("t_l1", "claude-code", reset.Add(time.Minute), true, "codex"),
		wait("t_l2", "claude-code", reset.Add(time.Minute), true, "codex"),
		wait("t_l3", "claude-code", reset.Add(time.Minute), true, "codex"),
		wait("t_l4", "pi", now.Add(47*time.Minute), false, ""),
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards, Waiters: ws}})
	return app, reset, sent
}

// D297: a task resting on its agent's limit says whose and when it carries
// on (its card, its row, its end line), offers Hand it to Codex now and
// Stop here and the choice to hand off right away next time; On hand draws
// the tasks on one account together under one line.
func TestLimitCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, reset, sent := limitApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1400, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		app.OpenTask("t_l1")
		app.S.Task("t_l1").HistoryLoaded = true
		tt.Frame()
		tt.Frame()
		got := texts(tt)
		when := app.soon(reset)
		for _, want := range []string{app.L.T("limit.head", "Claude Code"), app.L.T("limit.back", when), app.L.T("limit.handoff", "Codex"), app.L.T("limit.cancel"), app.L.T("limit.auto")} {
			if !strings.Contains(got, want) {
				t.Errorf("%s: the limit card lacks %q in:\n%s", lang, want, got)
			}
		}
		if s := app.backWords(app.S.WaiterFor("t_l1")); s != app.L.T("limit.state", when) {
			t.Errorf("%s: the state is %q", lang, s)
		}
		if w := app.waitWords(app.S.WaiterFor("t_l1")); w != app.L.T("limit.back", when) {
			t.Errorf("%s: end line %q", lang, w)
		}
		if err := tt.Click(app.L.T("limit.handoff", "Codex")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		found := false
		for _, f := range *sent {
			if wa, ok := f.(protocol.WaiterAction); ok && wa.Action == "handoff" && wa.WaiterID == "w_t_l1" {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: Hand it to Codex now sent nothing: %v", lang, *sent)
		}
		// On hand: one line over the three on Claude Code; pi alone is a row.
		app.Route = RouteOnHand
		tt.Frame()
		tt.Frame()
		got = texts(tt)
		for _, want := range []string{app.L.T("limit.group", "Claude Code", when), app.L.T("limit.group.n", 3), app.L.T("limit.line", "pi"), app.L.T("limit.state.unknown")} {
			if !strings.Contains(got, want) {
				t.Errorf("%s: On hand lacks %q in:\n%s", lang, want, got)
			}
		}
	}
}

// D297's shots: the Mac at 1400, zh and en: the opened task and On hand.
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/d297 go test ./internal/views -run LimitShots
func TestLimitShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR=<dir> to write the shots")
	}
	shot := func(app *App, w, h int, name string) {
		tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.SetScale(2)
		app.winW = float32(w)
		tt.Frame()
		tt.Frame()
		writeShot(t, tt, name)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		l := string(lang)
		app, _, _ := limitApp(t, lang)
		app.Route = RouteOnHand
		shot(app, 1400, 1000, "mac-onhand-"+l)
		app.OpenTask("t_l1")
		app.S.Task("t_l1").HistoryLoaded = true
		shot(app, 1400, 900, "mac-task-"+l)
		app.OpenTask("t_l4")
		app.S.Task("t_l4").HistoryLoaded = true
		shot(app, 1400, 900, "mac-task-unknown-"+l)
	}
}
