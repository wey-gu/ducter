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

// D315: On hand's line under the partner is short and says what the strip
// can't: whether anything needs you, else that it is on it, else when the
// first wait comes back; never a count the strip already shows.
func TestHeadLineSaysWhatTheStripCant(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	b := store.Board{}
	cases := []struct {
		n    [4]int
		want string
	}{
		{[4]int{2, 3, 1, 1}, app.L.T("onhand.say.needs", 2)},
		{[4]int{1, 0, 0, 0}, app.L.T("onhand.say.needs.one")},
		{[4]int{0, 3, 2, 0}, app.L.T("onhand.line.working")},
		{[4]int{0, 0, 2, 0}, app.L.T("onhand.line.quiet")}, // no wait on the board comes back on its own
		{[4]int{0, 0, 0, 4}, app.L.T("onhand.line.done")},
		{[4]int{}, app.L.T("onhand.line.idle")},
	}
	for _, c := range cases {
		if got := app.headLine(b, "", c.n); got != c.want {
			t.Errorf("%v: %q, want %q", c.n, got, c.want)
		}
		for _, k := range c.n {
			if k > 1 && k != c.n[0] && strings.Contains(app.headLine(b, "", c.n), "个在") {
				t.Errorf("%v: the line says a count: %q", c.n, app.headLine(b, "", c.n))
			}
		}
	}
}

// D315: a card names its computer only when it isn't the one most of the
// board runs on, and never names 其他 / Other as a project.
func TestWhereMetaOnlyWhatDiffers(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	now := time.Now().UTC().Format(time.RFC3339)
	card := func(id, project, device string) protocol.TaskCard {
		p := protocol.Place{Kind: "none"}
		if device != "" {
			p = protocol.Place{Kind: "repo", Device: device, RepoPath: "/r/" + project, Branch: "ducter/x", BaseBranch: "main"}
		}
		return protocol.TaskCard{TaskID: id, Title: "任务 " + id, Project: project, Place: p, Harness: "codex", Attention: protocol.Working, OpenedAt: now, UpdatedAt: now}
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
		card("a", "hawdb", "hel"), card("b", "hawdb", "hel"), card("c", "ducter", "mac"), card("d", "", ""),
	}}})
	app.S.Devices = []protocol.DeviceView{{ID: "hel", Name: "Hetzner Server", Kind: "server", Home: true}, {ID: "mac", Name: "MacBook", Kind: "mac"}}
	b := app.S.Board()
	app.oh.showProj, app.oh.usual = true, usualComputer(b)
	if app.oh.usual != "hel" {
		t.Fatalf("usual %q, want hel", app.oh.usual)
	}
	if got := app.whereMeta(app.S.Task("a")); len(got) != 1 || got[0] != "hawdb" {
		t.Errorf("a task on the usual computer says %v, want only its project", got)
	}
	if got := app.whereMeta(app.S.Task("c")); len(got) != 2 || got[1] != "MacBook" {
		t.Errorf("a task elsewhere says %v, want its project and MacBook", got)
	}
	if got := app.whereMeta(app.S.Task("d")); len(got) != 0 {
		t.Errorf("a task of no folder says %v, want nothing", got)
	}
}

// D315: a default's label sits mid-sentence: its own full stop never
// doubles the sentence's comma.
func TestDefaultLineKeepsOneMark(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	at := time.Now().Add(26 * time.Minute)
	d := &store.DecisionState{DecisionID: "d1", Reversible: true, DefaultOption: "go", DefaultAt: at.UTC().Format(time.RFC3339), GoLabel: "等你登录后继续。"}
	var line string
	tt := ui.NewTesterWith(func(c *ui.Context) { line = app.defaultLine(c, d) }, 400, 200, ui.TesterOptions{})
	tt.Frame()
	if strings.Contains(line, "。，") || !strings.Contains(line, "「等你登录后继续」") {
		t.Errorf("default line %q", line)
	}
}
