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
)

// loopApp is the author's review loop: a Keep in rounds whose one task holds
// many rounds of words, its next round at 18:49 and 302 rounds behind it.
func loopApp(t *testing.T, lang i18n.Lang, rounds int) *App {
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	app.Status = client.Connected
	app.S.Welcomed = true
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	now := time.Now()
	at := func(d time.Duration) string { return now.Add(d).UTC().Format(time.RFC3339Nano) }
	next := at(40 * time.Minute)
	title := w("持续评审 nowledge-co，并处理 100gle 分给你的待办", "Keep reviewing nowledge-co and handle 100gle's to-dos for you")
	keep := &protocol.TaskKeep{ID: "kp_review", Name: title}
	ts := protocol.TaskStream("t_loop")
	evs := []protocol.LogEvent{protocol.NewEvent(1, at(-50*time.Hour), "default", ts, protocol.OriginPartner, protocol.KindTaskOpen,
		protocol.TaskOpen{TaskID: "t_loop", Title: title, Harness: "codex", Brief: w("每 45 分钟看一次 nowledge-co 里等你评审的请求。", "Every 45 minutes, look at the requests waiting for your review in nowledge-co.")})}
	for i := 0; i < 24; i++ {
		seq := int64(10 + i*2)
		evs = append(evs,
			protocol.NewEvent(seq, at(time.Duration(-24+i)*45*time.Minute), "default", ts, protocol.OriginTask, protocol.KindTaskEvent,
				protocol.TaskEvent{TaskID: "t_loop", Role: "assistant", Text: w([]string{"没有新的请求，9 个都没变。", "#10849 有新提交，复审了；其余 8 个没变。等 #11024 的 CI。", "复审了 2 个新提交，2 份评审写好了等你看。"}[i%3], []string{"No new requests; all 9 unchanged.", "#10849 had new commits and was reviewed again; the other 8 unchanged. Waiting on #11024's CI.", "Reviewed 2 new commits; 2 reviews drafted for you to see."}[i%3])}),
			protocol.NewEvent(seq+1, at(time.Duration(-24+i)*45*time.Minute+time.Minute), "default", ts, protocol.OriginTask, protocol.KindTaskEvent,
				protocol.TaskEvent{TaskID: "t_loop", Role: "system", Text: "turn completed"}))
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	card := protocol.TaskCard{TaskID: "t_loop", Persona: "default", Title: title, Harness: "codex", Attention: protocol.Blocked, Residency: "hot",
		OpenedAt: at(-50 * time.Hour), UpdatedAt: at(-time.Minute), Keep: keep, Rounds: &protocol.TaskRounds{EveryMs: 45 * 60_000, NextAt: next}}
	sheet := protocol.KeepSheet{ID: "kp_review", Title: title, Life: "on", Run: "same", TaskIDs: []string{"t_loop"}, EveryMs: 45 * 60_000, NextAt: next, Since: at(-50 * time.Hour)}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}, Keeps: []protocol.KeepSheet{sheet}}})
	page := &protocol.KeepPage{KeepSheet: sheet}
	for i := 0; i < rounds; i++ {
		page.Rounds = append(page.Rounds, protocol.KeepRound{At: at(time.Duration(-i) * 45 * time.Minute), Woke: "time", Spoke: "silent", State: "done"})
	}
	if app.S.KeepPages == nil {
		app.S.KeepPages = map[string]*protocol.KeepPage{}
	}
	app.S.KeepPages["kp_review"] = page
	return app
}

// D544: a task in rounds keeps who it is while its transcript is read: the
// line says the Keep, when the next round comes and which round, only once
// the head is out of view, and a click opens the Keep's page. An ordinary
// task never has it.
func TestLoopLine(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := loopApp(t, lang, 302)
		L := app.L
		app.OpenTask("t_loop")
		tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for i := 0; i < 4; i++ {
			tt.Frame()
		}
		f, ok := app.loopFactsOf(app.S.Task("t_loop"))
		if !ok || f.keep == nil || f.round != 302 {
			t.Fatalf("%s: facts %+v %v", lang, f, ok)
		}
		round := L.T("loop.round", 302)
		if !tt.HasText(round) || !tt.HasText(L.T("keep.section")) {
			t.Errorf("%s: at the end, no line: %q", lang, tt.Texts())
		}
		app.taskList("t_loop").ScrollTo(0, ui.Start)
		tt.Frame()
		tt.Frame()
		if tt.HasText(round) {
			f0, l0 := app.taskList("t_loop").Visible()
			t.Errorf("%s: the line stays with the head in view (%d..%d)", lang, f0, l0)
		}
		app.taskList("t_loop").ScrollToEnd()
		tt.Frame()
		tt.Frame()
		if err := tt.Click(round); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if app.Route != RouteOnHand || app.oh.keep.open != "kp_review" {
			t.Errorf("%s: the line opened %v %q", lang, app.Route, app.oh.keep.open)
		}
	}
	// An ordinary task has none.
	app := railApp(t, i18n.EN)
	if _, ok := app.loopFactsOf(app.S.Task("t_keys")); ok {
		t.Errorf("an ordinary task has a loop line")
	}
}

// The shots: the line coming in as the head goes out, at 1150 and 1400.
func TestLoopLineShots(t *testing.T) {
	dir := os.Getenv("DUCTER_LOOP_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_LOOP_SHOTS=<dir> to write the shots")
	}
	_ = os.MkdirAll(dir, 0o755)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, w := range []int{1150, 1400} {
				app := loopApp(t, lang, 302)
				app.OpenTask("t_loop")
				tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				for i := 0; i < 3; i++ {
					tt.Frame()
					tt.Advance(300 * time.Millisecond)
				}
				theme := map[bool]string{false: "light", true: "dark"}[dark]
				write := func(name string) {
					fh, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-loop-%d-%s-%s-%s.png", w, lang, theme, name)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(fh, tt.Image())
					fh.Close()
				}
				ls := app.taskList("t_loop")
				for i, row := range []int{0, 1, 3} {
					ls.ScrollTo(row, ui.Start)
					tt.Frame()
					tt.Frame()
					write(fmt.Sprintf("f%d", i))
				}
				ls.ScrollToEnd()
				tt.Frame()
				tt.Frame()
				write("end")
			}
		}
	}
}

var _ = store.ParseTime
