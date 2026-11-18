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

func groupFixture(stopped bool) *protocol.OnHand {
	now := time.Now().UTC().Format(time.RFC3339)
	card := func(id, title string, att protocol.Attention) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Project: "ducter", Harness: "claude-code", Attention: att, OpenedAt: now, UpdatedAt: now,
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/r/ducter", Branch: "ducter/" + id, BaseBranch: "main"}}
	}
	sms := protocol.Working
	if stopped {
		sms = protocol.Failed
	}
	g := protocol.TaskGroup{ID: "g1", Name: "登录页重做", Order: "one_by_one", By: "partner", Persona: "default",
		Members: []protocol.GroupMember{{TaskID: "t_form"}, {TaskID: "t_sms"}, {Key: "h1", Title: "补登录页的端到端测试"}}}
	if stopped {
		g.Stopped = &protocol.GroupStopped{TaskID: "t_sms", Why: "failed"}
	}
	return &protocol.OnHand{
		Tasks: []protocol.TaskCard{
			card("t_form", "登录表单换成新的输入框组件", protocol.DoneClaimed),
			card("t_sms", "登录页接上短信验证码", sms),
			card("t_tokio", "把 tokio 升到 1.42", protocol.Working),
		},
		Groups: []protocol.TaskGroup{g},
	}
}

// D360: a group stands as one card in its most urgent part's section, its
// parts in order with the held one 排着; its tasks leave their own section;
// the section counts stay per task.
func TestGroupCardOnTheBoard(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: groupFixture(false)})
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"登录页重做", "3 件里做完 1 件", "补登录页的端到端测试", "排着", "一件做完接下一件", "把 tokio 升到 1.42"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if n := strings.Count(all, "登录页接上短信验证码"); n != 1 {
		t.Fatalf("the grouped task is drawn %d times (once, in its group): %s", n, all)
	}
	bgs := app.boardGroups(app.S.Board())
	if len(bgs) != 1 || bgs[0].lane != 1 || bgs[0].done != 1 {
		t.Fatalf("the group stands in 在做 with one part done: %+v", bgs)
	}
}

// D360: a part that didn't work out stops the line: the card stands with what
// needs you, says which part and what waits, and offers the three ways on.
func TestGroupStoppedLine(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: groupFixture(true)})
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"第 2 件没做成，第 3 件在等你决定。", "再试第 2 件", "不管它，做第 3 件", "第 3 件也不做了"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if n := app.stateCounts(app.S.Board(), ""); n[0] != 1 {
		t.Fatalf("a stopped line counts as needing you: %v", n)
	}
	if err := tt.Click("不管它，做第 3 件"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	var got *protocol.TaskGroupFrame
	for _, f := range *sent {
		if g, ok := f.(protocol.TaskGroupFrame); ok {
			got = &g
		}
	}
	if got == nil || got.Op != "next" || got.GroupID != "g1" || got.T != "task_group" {
		t.Fatalf("Go on with the next sends task_group next: %+v", got)
	}
}
