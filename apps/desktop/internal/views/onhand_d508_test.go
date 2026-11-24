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

// d508Board is the author's 今天做完 of 2026-11-24 in shape: GitHub-issue
// tasks that each opened a PR (a draft with CI running, one waiting for a
// review, one signed off and green), one whose PR merged, and a result with
// a branch and no PR. The web's d508.test.ts checks the same.
func d508Board(t *testing.T, lang i18n.Lang) (*App, time.Time) {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	y, m, d := time.Now().Date()
	now := time.Date(y, m, d, 12, 0, 0, 0, time.Local)
	app.Now = func() time.Time { return now }
	iso := func(dd time.Duration) string { return now.Add(dd).UTC().Format(time.RFC3339) }
	place := protocol.Place{Kind: "repo", RepoPath: "/root/code/mem", Branch: "ducter/x", BaseBranch: "main"}
	pr := func(n, state string, st *protocol.OwnedStanding) []protocol.TaskPR {
		return []protocol.TaskPR{{PR: "nowledge-co/mem#" + n, URL: "https://github.com/nowledge-co/mem/pull/" + n, State: state, At: iso(-time.Hour), Standing: st}}
	}
	card := func(id, title string, prs []protocol.TaskPR) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Place: place, Harness: "codex", Attention: protocol.Done, OpenedAt: iso(-4 * time.Hour), UpdatedAt: iso(-3 * time.Hour), PRs: prs,
			Changes:    &protocol.DiffStat{Files: 9, Adds: 321, Dels: 46},
			LastReport: &protocol.Report{TaskID: id, State: "done", Summary: "开了草稿 PR。", Branch: &protocol.BranchChanges{Commits: 3}}}
	}
	at := iso(-time.Hour)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
		card("t_11027", "Thread search loses the cursor when a filter changes and the page reloads before the next batch", pr("11070", "open", &protocol.OwnedStanding{At: at, Draft: true, Checks: &protocol.OwnedChecks{Total: 10, Passed: 6, Pending: []string{"bazel", "e2e", "lint", "tide"}}, Merge: "draft"})),
		card("t_11031", "桌面端：托盘菜单只显示当前空间的记忆，切换空间后要刷新", pr("11068", "open", &protocol.OwnedStanding{At: at, Awaiting: []string{"hawkingrei"}, Checks: &protocol.OwnedChecks{Total: 10, Passed: 9, Pending: []string{"tide"}}, Merge: "blocked"})),
		card("t_11019", "Graph export drops edge labels past 120 nodes when the layout is radial", pr("11064", "open", &protocol.OwnedStanding{At: at, ApprovedBy: []string{"hawkingrei"}, Checks: &protocol.OwnedChecks{Total: 10, Passed: 10}, Merge: "clean"})),
		card("t_212", "Docs: the install page says which Bun it needs", pr("212", "merged", nil)),
		card("t_notes", "整理本周 mem 的发布说明", nil),
	}}})
	return app, now
}

// D508: a finished task whose PR is open is not done; its row says where
// the PR is; ready stands in 等你 with its one action; no local merge or
// new draft PR while a PR holds the branch, and hover never covers the time.
func TestOnHandStandsUnderItsPR(t *testing.T) {
	app, _ := d508Board(t, i18n.ZH)
	b := app.S.Board()
	sp := app.splitOf(b)
	if len(sp.ready) != 1 || sp.ready[0].ID != "t_11019" || len(sp.waiting) != 2 || len(sp.today) != 2 {
		t.Fatalf("split: %d ready, %d waiting, %d today", len(sp.ready), len(sp.waiting), len(sp.today))
	}
	n := app.stateCounts(b, "")
	if n != [4]int{1, 0, 2, 2} || app.doneToday(b) != 2 {
		t.Fatalf("strip %v, done today %d: want 1 needs you, 2 waiting, 2 done", n, app.doneToday(b))
	}
	if f := finishedOf(app.S.Task("t_11027")); f.integrate {
		t.Fatal("a task with a PR offers a local merge")
	}
	for _, w := range []int{1400, 1000} {
		app.Route = RouteOnHand
		tt := ui.NewTesterWith(app.View, w, 1100, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		all := strings.Join(tt.Texts(), " | ")
		for _, want := range []string{"草稿", "CI 通过 6/10", "评审中", "等 hawkingrei 评审", "CI 通过 9/10", "可合并", "hawkingrei 通过了评审", "到 GitHub 合并", "#11070"} {
			if !strings.Contains(all, want) {
				t.Fatalf("%d: missing %q in %s", w, want, all)
			}
		}
		for _, never := range []string{"合进 main", "开草稿 PR", " · "} {
			if strings.Contains(all, never) {
				t.Fatalf("%d: %q on the board: %s", w, never, all)
			}
		}
		// Hover a waiting PR row: its time stays, × and ⋯ come in their own slot.
		r, ok := tt.Find("草稿")
		if !ok {
			t.Fatal("no draft row")
		}
		before := strings.Join(tt.Texts(), " | ")
		tt.Move(r.X+4, r.Y+r.H/2)
		tt.Frame()
		tt.Frame()
		after := strings.Join(tt.Texts(), " | ")
		since := app.agoLong(app.S.Task("t_11027").Card.UpdatedAt)
		if !strings.Contains(before, since) || strings.Count(after, since) < strings.Count(before, since) {
			t.Fatalf("%d: hover hid the time %q", w, since)
		}
		if strings.Contains(after, "合进 main") || strings.Contains(after, "开草稿 PR") {
			t.Fatalf("%d: hover offered a local merge on a PR row", w)
		}
	}
}

// D508: a result with a branch and no PR keeps its merge and draft PR, in ⋯.
func TestIntegrateInTheMenu(t *testing.T) {
	app, _ := d508Board(t, i18n.ZH)
	f := finishedOf(app.S.Task("t_notes"))
	if f == nil || !f.integrate || strings.Join(finishedMenu(*f), ",") != "merge,open_pr,open,remove" {
		t.Fatalf("menu %+v", f)
	}
}

// D508 with D507: a helper's PR tasks under its sheet read the same model:
// the phase in its words, never 做完 while the PR is open, and a PR ready to
// merge brings the helper's sheet to 等你.
func TestHelperRowsStandUnderTheirPR(t *testing.T) {
	app, _ := d508Board(t, i18n.ZH)
	app.S.OnHand.Helpers = []protocol.HelperWork{{
		HelperView: protocol.HelperView{ID: "h1", Name: "Nowledge Mem PR babysitter", State: "on", Mem: "ready", Open: 2},
		Items: []protocol.HelperItem{
			{TaskID: "t_11019", Title: "Graph export drops edge labels past 120 nodes when the layout is radial", At: "ready", PR: "nowledge-co/mem#11064", Said: &protocol.PRSaid{Phase: "ready", By: []string{"hawkingrei"}}},
			{TaskID: "t_11031", Title: "桌面端：托盘菜单只显示当前空间的记忆，切换空间后要刷新", At: "work", PR: "nowledge-co/mem#11068", Said: &protocol.PRSaid{Phase: "review", By: []string{"hawkingrei"}}},
		},
	}}
	if app.helperWaits(app.S.OnHand.Helpers[0]) != 1 {
		t.Fatal("a PR ready to merge waits for the person")
	}
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1400, 1300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"Nowledge Mem PR babysitter", "可合并", "评审中", "到 GitHub 合并"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	for _, never := range []string{"能合并了", "合进 main"} {
		if strings.Contains(all, never) {
			t.Fatalf("%q under the helper: %s", never, all)
		}
	}
}
