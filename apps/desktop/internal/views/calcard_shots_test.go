package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The calendar change card, drawn by the real conversation at 1000 and 1400, zh and en, light and
// dark, every state: the evidence shots for the calendar-card pass. It needs no live core.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/cal-card/before go test ./internal/views -run CalCardShots
func TestCalCardShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			app, _ := iaApp(t, lang)
			app.Route = RouteConversation
			app.LocaleFixed = true
			events := calCardEvents(lang)
			for i, ev := range events {
				app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(int64(i+1), protocol.OriginPartner, protocol.KindDecision, ev)}})
			}
			setCalCardStates(app)
			tt := ui.NewTesterWith(app.View, 1000, 6400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			if dark {
				tt.SetDark(true)
			}
			tt.Frame()
			for _, width := range []int{1000, 1400} {
				tt.SetSize(width, 6400)
				for i := 0; i < 8; i++ {
					tt.Advance(100 * time.Millisecond)
				}
				paper := "light"
				if dark {
					paper = "dark"
				}
				name := fmt.Sprintf("mac-%s-%s-%d.png", lang, paper, width)
				f, err := os.Create(filepath.Join(dir, name))
				if err != nil {
					t.Fatal(err)
				}
				_ = png.Encode(f, tt.Image())
				_ = f.Close()
			}
		}
	}
}

// calCardEvents are the nine states the pass has to show, in the order the card draws them.
func calCardEvents(lang i18n.Lang) []protocol.Decision {
	title := "和 Lina 对一下 HawDB 发布和这周所有市场材料"
	titleEn := "Walk Lina through the HawDB release and every market material due this week"
	if lang == i18n.EN {
		title = titleEn
	}
	base := func(kind, id string) protocol.Decision {
		return protocol.Decision{
			DecisionID:    id,
			Question:      map[i18n.Lang]string{i18n.ZH: "添加「" + title + "」？", i18n.EN: "Add “" + title + "”?"}[lang],
			GoLabel:       map[i18n.Lang]string{i18n.ZH: "添加到日历", i18n.EN: "Add to calendar"}[lang],
			DefaultOption: "hold",
			Cal: &protocol.CalChange{
				Kind:      kind,
				Title:     title,
				Calendar:  map[i18n.Lang]string{i18n.ZH: "主日历", i18n.EN: "Main calendar"}[lang],
				Account:   "weyl.gu",
				Color:     "#3f8f5f",
				Start:     "2026-12-12T15:00:00+09:00",
				End:       "2026-12-12T15:30:00+09:00",
				Where:     map[i18n.Lang]string{i18n.ZH: "Kong Office，12 楼东侧会议室", i18n.EN: "Kong Office, 12th floor east room"}[lang],
				Notify:    []string{"Lina Chen"},
				TheirZone: "Asia/Singapore",
				TheirName: "Lina",
			},
		}
	}
	out := []protocol.Decision{
		base("create", "d_open"),
		base("create", "d_samezone"),
		base("create", "d_going"),
		base("create", "d_long"),
		base("create", "d_done"),
		base("create", "d_failed"),
		base("create", "d_held"),
		base("move", "d_move"),
		base("cancel", "d_cancel"),
		base("respond", "d_respond"),
	}
	out[1].Cal.Start, out[1].Cal.End = "2026-12-12T15:00:00+08:00", "2026-12-12T15:30:00+08:00"
	out[7].Cal.Was = &protocol.CalSpan{Start: "2026-12-10T10:00:00+09:00", End: "2026-12-10T10:30:00+09:00"}
	out[8].Cal.Notify = []string{"Lina Chen"}
	out[9].Cal.Response, out[9].Cal.Organizer, out[9].Cal.Notify = "declined", "Sam Lee", []string{"Sam Lee"}
	return out
}

// setCalCardStates puts every card at the moment its shot is about.
func setCalCardStates(app *App) {
	if d := app.S.Decisions["d_going"]; d != nil {
		d.Pending = "go"
	}
	if d := app.S.Decisions["d_long"]; d != nil {
		d.Pending, d.AnsweredAt = "go", app.Now().Add(-25*time.Second)
	}
	for _, id := range []string{"d_done", "d_failed"} {
		if d := app.S.Decisions[id]; d != nil {
			d.Resolved = &protocol.DecisionResolved{DecisionID: id, Option: "go", By: "user"}
		}
	}
	if d := app.S.Decisions["d_held"]; d != nil {
		d.Resolved = &protocol.DecisionResolved{DecisionID: "d_held", Option: "hold", By: "user"}
	}
	app.S.DecisionCalls["d_done"] = &protocol.ConnectionCall{DecisionID: "d_done", State: "done", Link: "https://calendar.google.com/calendar/event?eid=abc"}
	app.S.DecisionCalls["d_failed"] = &protocol.ConnectionCall{DecisionID: "d_failed", State: "failed", Error: "Google 日历没有回答，可能已经加上了，先去看一眼。"}
}
