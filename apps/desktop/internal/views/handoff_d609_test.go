package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

func handoffLine(id, state, why string, taskID string) protocol.HandoffLine {
	return protocol.HandoffLine{
		ID:      id,
		State:   state,
		Item:    protocol.HandoffItem{Kind: "pr", Ref: "nowledge-co/mem#11393", Title: "修好 mem#11393 的登录跳转，并让测试全部通过"},
		Sender:  "Ducter 的任务「官网」",
		To:      "PR Babysitter",
		GivenAt: time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339Nano),
		At:      time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano),
		TaskID:  taskID,
		Why:     why,
	}
}

// D609: the helper's Keep page groups 手上的事 by state (等接手, 在做, 退回了, 没接); an empty
// group draws nothing. The sender's one line follows the record through given, taken and outcome.
func TestD609HandoffUI(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.LocaleFixed = true
		app.Status = 2
		app.S.Welcomed = true
		now := time.Now().UTC().Format(time.RFC3339Nano)
		keep := protocol.KeepSheet{ID: "kp_sitter", Title: "PR Babysitter", Life: "on", Run: "perItem", Since: now}
		long := strings.Repeat("很长的标题，", 12) + "结束"
		given := handoffLine("ho_given", "given", "", "")
		given.Item.Title = long
		page := &protocol.KeepPage{KeepSheet: keep, Said: "接手 nowledge-co/mem 的 PR，跟到能合并。", Handoffs: []protocol.HandoffLine{
			given,
			handoffLine("ho_taken", "taken", "", "t-taken"),
			handoffLine("ho_returned", "returned", "这个不是我接的范围：我只接 PR。", "t-returned"),
			handoffLine("ho_declined", "declined", "超出我接的范围。", "t-declined"),
		}}
		page.Items = []protocol.KeepItem{{TaskID: "t-taken", Title: "接手 mem#11393 的登录跳转", At: "work"}}
		app.S.KeepPages = map[string]*protocol.KeepPage{"kp_sitter": page}
		app.Route, app.oh.keep = RouteOnHand, keepState{open: "kp_sitter"}
		tt := ui.NewTesterWith(app.View, 1150, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for i := 0; i < 4; i++ {
			tt.Frame()
		}
		all := texts(tt)
		for _, key := range []string{"keep.holding", "keep.holding.waiting", "keep.holding.working", "keep.holding.returned", "keep.holding.declined"} {
			if !strings.Contains(all, app.L.T(key)) {
				t.Errorf("%s: %q is not drawn (%q)", lang, key, all)
			}
		}
		for _, want := range []string{"Ducter 的任务「官网」", app.L.T("keep.handoff.take"), app.L.T("keep.item.task"), app.L.T("keep.item.release")} {
			if !strings.Contains(all, want) {
				t.Errorf("%s: %q is not drawn", lang, want)
			}
		}
		// A long title wraps inside the row; the rows and group heads stay inside the 1150 window.
		if r, ok := tt.Find(long); !ok || r.X < 0 || r.X+r.W > 1150 {
			t.Errorf("%s: the long title is not inside 1150: %v %v", lang, r, ok)
		}
		for _, want := range []string{app.L.T("keep.holding.waiting"), app.L.T("keep.holding.returned"), app.L.T("keep.item.task")} {
			if r, ok := tt.Find(want); ok && (r.X < 0 || r.X+r.W > 1150) {
				t.Errorf("%s: %q at %v runs outside 1150", lang, want, r)
			}
		}

		// The sender's line, in each state.
		task := &storeTaskForHandoff{ID: "t-sender", Title: "官网 #562"}
		for _, c := range []struct {
			state, why, outcome, key string
		}{
			{"given", "", "", "handoff.given"},
			{"taken", "", "", "handoff.taken"},
			{"done", "", "评审通过，已评论 /lgtm。", "handoff.done"},
			{"returned", "这个不是我接的范围：我只接 PR。", "", "handoff.returned"},
			{"declined", "超出我接的范围。", "", "handoff.declined"},
			{"withdrawn", "", "", "handoff.withdrawn"},
		} {
			task.card = &protocol.TaskCard{TaskID: "t-sender", Title: "官网 #562", Handoff: &protocol.HandoffLine{
				ID: "ho_" + c.state, State: c.state,
				Item:   protocol.HandoffItem{Kind: "pr", Ref: "nowledge-co/mem#11393", Title: "修好 mem#11393 的登录跳转"},
				Sender: "Ducter 的任务「官网」", To: "PR Babysitter", GivenAt: now, At: now, Why: c.why, Outcome: c.outcome,
			}}
			line := ui.NewTesterWith(func(ctx *ui.Context) { app.handoffNote(ctx, task.Task()) }, 1150, 220, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			line.Frame()
			got := texts(line)
			args := []any{"PR Babysitter"}
			if c.key == "handoff.done" {
				args = append(args, c.outcome)
			}
			if c.key == "handoff.returned" || c.key == "handoff.declined" {
				args = append(args, c.why)
			}
			want := app.L.T(c.key, args...)
			if !strings.Contains(got, strings.Split(want, "\n")[0]) {
				t.Errorf("%s: %s line not drawn: want %q in %q", lang, c.state, want, got)
			}
		}
	}
}

// storeTaskForHandoff is just the two fields handoffNote reads, without a whole store.
type storeTaskForHandoff struct {
	ID    string
	Title string
	card  *protocol.TaskCard
}

func (s *storeTaskForHandoff) Task() *store.Task {
	return &store.Task{ID: s.ID, Card: s.card}
}
