package views

import (
	"fmt"
	"image"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// hoverBoard is On hand with one row of every kind the author hovers
// (2026-11-24): a task that didn't work out with its two fixes (改进 Mem
// 常规设置页, #10559), one stopped with nothing to bring it back, one at
// work, a wait with its time, a PR ready to merge in 等你, a draft PR, a
// result done today, a Keep's question and a helper's sheet.
func hoverBoard(t *testing.T, lang i18n.Lang) *App {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	y, m, d := time.Now().Date()
	now := time.Date(y, m, d, 15, 0, 0, 0, time.Local)
	app.Now = func() time.Time { return now }
	iso := func(dd time.Duration) string { return now.Add(dd).UTC().Format(time.RFC3339) }
	place := protocol.Place{Kind: "repo", RepoPath: "/root/code/mem", Branch: "ducter/x", BaseBranch: "main"}
	card := func(id, title string, a protocol.Attention, at time.Duration) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Place: place, Harness: "codex", Attention: a, OpenedAt: iso(at - time.Hour), UpdatedAt: iso(at)}
	}
	failed := card("t_mem", "改进 Mem 常规设置页", protocol.Failed, -2*time.Minute)
	failed.Source = &protocol.TaskSource{SourceItemRef: protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: "nowledge-co/mem#10559", Label: "#10559", Where: "nowledge-co/mem", Title: "改进 Mem 常规设置页", URL: "https://github.com/nowledge-co/mem/issues/10559"}, State: "open"}
	pr := func(n string, st *protocol.OwnedStanding) []protocol.TaskPR {
		return []protocol.TaskPR{{PR: "nowledge-co/mem#" + n, URL: "https://github.com/nowledge-co/mem/pull/" + n, State: "open", At: iso(-time.Hour), Standing: st}}
	}
	done := func(c protocol.TaskCard) protocol.TaskCard {
		c.Changes = &protocol.DiffStat{Files: 9, Adds: 321, Dels: 46}
		c.LastReport = &protocol.Report{TaskID: c.TaskID, State: "done", Summary: "开了草稿 PR。", Branch: &protocol.BranchChanges{Commits: 3}}
		return c
	}
	ready := done(card("t_11019", "Graph export drops edge labels past 120 nodes when the layout is radial", protocol.Done, -3*time.Hour))
	ready.PRs = pr("11064", &protocol.OwnedStanding{At: iso(-time.Hour), ApprovedBy: []string{"hawkingrei"}, Checks: &protocol.OwnedChecks{Total: 10, Passed: 10}, Merge: "clean"})
	draft := done(card("t_11027", "Thread search loses the cursor when a filter changes and the page reloads before the next batch", protocol.Done, -3*time.Hour))
	draft.PRs = pr("11070", &protocol.OwnedStanding{At: iso(-time.Hour), Draft: true, Checks: &protocol.OwnedChecks{Total: 10, Passed: 6, Pending: []string{"bazel", "e2e", "lint", "tide"}}, Merge: "draft"})
	notes := done(card("t_notes", "整理本周 mem 的发布说明", protocol.Done, -40*time.Minute))
	keep := card("t_keep", "确认 v0.6 的发布时间", protocol.Blocked, -20*time.Minute)
	keep.Keep = &protocol.TaskKeep{ID: "k1", Name: "发布节奏"}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{
		Tasks: []protocol.TaskCard{
			failed,
			card("t_phone", "用手机把 Ducter 官网录一段屏发到 X", protocol.Blocked, -8*24*time.Hour),
			card("t_work", "把 Graph 视图的布局换成力导向", protocol.Working, -6*time.Minute),
			card("t_ci", "等 acme-web 的发布流水线跑完再合并", protocol.Blocked, -48*time.Minute),
			ready, draft, notes, keep,
		},
		Waiters: []protocol.Waiter{{WaiterID: "w1", TaskID: "t_ci", Reason: "acme-web 的发布流水线跑完", State: "armed", At: iso(37 * time.Minute), ArmedAt: iso(-48 * time.Minute)}},
		Helpers: []protocol.HelperWork{{
			HelperView: protocol.HelperView{ID: "h1", Name: "Nowledge Mem PR babysitter", State: "on", Mem: "ready", Open: 1},
			Items:      []protocol.HelperItem{{TaskID: "t_11027", Title: draft.Title, At: "work", PR: "nowledge-co/mem#11070", Said: &protocol.PRSaid{Phase: "draft"}}},
		}},
	}})
	return app
}

// frameOf is every box the frame shows, by what it is: each accessible
// element's role, name and bounds, and each text's box.
func frameOf(tt *ui.Tester) map[string]ui.Rect {
	out := map[string]ui.Rect{}
	seen := map[string]int{}
	tips := map[string]bool{}
	for _, n := range tt.AccessAll() {
		if n.Role == ui.RoleTooltip {
			tips[n.Name] = true // a tooltip floats over the page and moves nothing
			continue
		}
		k := fmt.Sprintf("%v:%s", n.Role, n.Name)
		seen[k]++
		out[fmt.Sprintf("%s#%d", k, seen[k])] = n.Bounds
	}
	for _, s := range tt.Texts() {
		if tips[s] {
			continue
		}
		if r, ok := tt.Find(s); ok {
			out["text:"+s] = r
		}
	}
	return out
}

func sameFrame(a, b ui.Rect) bool {
	d := func(x, y float32) bool { return x-y < 0.5 && y-x < 0.5 }
	return d(a.X, b.X) && d(a.Y, b.Y) && d(a.W, b.W) && d(a.H, b.H)
}

// moved says what hovering changed: a box that moved or resized, one that
// came, one that went.
func moved(before, after map[string]ui.Rect) []string {
	var out []string
	for k, r := range before {
		if strings.HasPrefix(k, "text:") && strings.Contains(k, "\n") {
			continue
		}
		s, ok := after[k]
		switch {
		case !ok:
			out = append(out, "went "+k)
		case !sameFrame(r, s):
			out = append(out, fmt.Sprintf("moved %s %v → %v", k, r, s))
		}
	}
	for k := range after {
		if _, ok := before[k]; !ok {
			out = append(out, "came "+k)
		}
	}
	sort.Strings(out)
	return out
}

// hoverRows hovers each row (a link-role element at least rowMin wide)
// and fails when anything on the page moved, resized, came or went
// (D519: hover never reflows).
func hoverRows(t *testing.T, tt *ui.Tester, where string, rowMin float32) int {
	t.Helper()
	tt.Move(-50, -50)
	tt.Frame()
	tt.Advance(time.Second)
	tt.Frame()
	rest := frameOf(tt)
	var rows []ui.AccessInfo
	for _, n := range tt.AccessAll() {
		if n.Role == ui.RoleLink && n.Bounds.W >= rowMin && n.Bounds.H >= 36 && n.Bounds.Y > 0 {
			rows = append(rows, n)
		}
	}
	for _, r := range rows {
		// Toward the row's right end, where its revealed controls stand.
		for _, x := range []float32{r.Bounds.X + 8, r.Bounds.X + r.Bounds.W - 24} {
			tt.Move(x, r.Bounds.Y+r.Bounds.H/2)
			tt.Frame()
			tt.Advance(400 * time.Millisecond)
			tt.Frame()
			if d := moved(rest, frameOf(tt)); len(d) > 0 {
				t.Errorf("%s: hovering %q reflowed:\n  %s", where, r.Name, strings.Join(d, "\n  "))
			}
		}
		tt.Move(-50, -50)
		tt.Frame()
		tt.Advance(400 * time.Millisecond)
		tt.Frame()
	}
	return len(rows)
}

// D519: hovering any row on On hand leaves every box on the page where it
// was, at the three Mac widths, in light and dark, zh and en.
func TestRowHoverNeverReflows(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1150, 1400} {
			stills := []bool{true}
			if w == 1150 {
				stills = append(stills, false) // the 140 ms cross-fade, at the common laptop width
			}
			for _, still := range stills {
				app := hoverBoard(t, lang)
				app.Route = RouteOnHand
				tt := ui.NewTesterWith(app.View, w, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: still}})
				tt.Frame()
				tt.Advance(2 * time.Second)
				tt.Frame()
				if n := hoverRows(t, tt, fmt.Sprintf("%s %d still=%v", lang, w, still), 300); n < 7 {
					t.Fatalf("%s %d: only %d rows to hover", lang, w, n)
				}
			}
		}
	}
}

// D519: the same on the other places with rows: Past tasks' cards, a
// Settings pane's rows, the Devices list, and On hand's rail beside an
// opened task.
func TestRowHoverNeverReflowsElsewhere(t *testing.T) {
	for _, w := range []int{1000, 1150, 1400} {
		opts := ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: w != 1150}}
		// Past tasks.
		app, _ := pastApp(t, i18n.ZH)
		app.OpenPast("")
		app.Receive(pastResult(pastItems(pastSeeds()), ""))
		tt := ui.NewTesterWith(app.View, w, 1400, opts)
		tt.Frame()
		tt.Frame()
		if n := hoverRows(t, tt, fmt.Sprintf("past %d", w), 300); n < 3 {
			t.Fatalf("past %d: only %d rows", w, n)
		}
		// A Settings pane's rows.
		app, _ = iaApp(t, i18n.ZH)
		app.Status = client.Connected
		acctFrames(app, "three")
		app.openTab(TabAccounts)
		tt = ui.NewTesterWith(app.View, w, 1400, opts)
		tt.Frame()
		tt.Frame()
		hoverRows(t, tt, fmt.Sprintf("settings %d", w), 300)
		// The Devices list (its rows are buttons that choose).
		app, _ = iaApp(t, i18n.ZH)
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{entryHome(), haswell()}})
		app.Route = RouteDevices
		tt = ui.NewTesterWith(app.View, w, 1000, opts)
		tt.Frame()
		tt.Frame()
		hoverButtons(t, tt, fmt.Sprintf("devices %d", w), 180)
		// On hand's rail beside an opened task.
		app = hoverBoard(t, i18n.ZH)
		app.OpenTask("t_work")
		tt = ui.NewTesterWith(app.View, w, 1400, opts)
		tt.Frame()
		tt.Frame()
		hoverButtons(t, tt, fmt.Sprintf("rail %d", w), 0)
		hoverRows(t, tt, fmt.Sprintf("rail %d", w), 200)
	}
}

// hoverButtons hovers each button at least min wide and 44 tall (a row
// that chooses) and fails on any reflow.
func hoverButtons(t *testing.T, tt *ui.Tester, where string, min float32) {
	t.Helper()
	tt.Move(-50, -50)
	tt.Frame()
	rest := frameOf(tt)
	for _, n := range tt.AccessAll() {
		if n.Role != ui.RoleButton || n.Bounds.W < min || n.Bounds.H < 44 || n.Bounds.Y <= 0 {
			continue
		}
		tt.Move(n.Bounds.X+n.Bounds.W/2, n.Bounds.Y+n.Bounds.H/2)
		tt.Frame()
		tt.Advance(400 * time.Millisecond)
		tt.Frame()
		if d := moved(rest, frameOf(tt)); len(d) > 0 {
			t.Errorf("%s: hovering %q reflowed:\n  %s", where, n.Name, strings.Join(d, "\n  "))
		}
	}
	tt.Move(-50, -50)
	tt.Frame()
	tt.Advance(400 * time.Millisecond)
	tt.Frame()
}

// D519: the failed row's ⋯ is in its action group, beside 看看为什么 and
// 再试一次, at rest too (dim), never on a line of its own.
func TestFailedRowMoreJoinsItsActions(t *testing.T) {
	app := hoverBoard(t, i18n.ZH)
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1150, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	retry, ok := tt.Find("再试一次")
	if !ok {
		t.Fatalf("no 再试一次 in %v", tt.Texts())
	}
	more, ok := tt.Find("「改进 Mem 常规设置页」还能做的")
	if !ok || more.X <= retry.X {
		t.Fatalf("the failed row has no ⋯ after 再试一次: %v %v", ok, more)
	}
	if cy, my := retry.Y+retry.H/2, more.Y+more.H/2; cy-my > 2 || my-cy > 2 {
		t.Fatalf("⋯ is not on the actions' line: %v vs %v", more, retry)
	}
	if tt.HasText("从手头的事移走「改进 Mem 常规设置页」") {
		t.Fatal("the failed row stacks a × beside its fixes: its ⋯ holds the remove")
	}
}

// DUCTER_HOVER_SHOTS=before|after writes each row kind at rest and hovered,
// light and dark, zh and en, with 2x crops and hover-in frames, to
// .shots/hover/mac/<phase>.
func TestRowHoverShots(t *testing.T) {
	phase := os.Getenv("DUCTER_HOVER_SHOTS")
	if phase == "" {
		t.Skip("DUCTER_HOVER_SHOTS=before|after")
	}
	dir := filepath.Join("..", "..", "..", "..", ".shots", "hover", "mac", phase)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	rows := []struct{ name, text string }{
		{"failed", "改进 Mem 常规设置页"}, {"stopped", "用手机把 Ducter 官网录一段屏发到 X"}, {"working", "把 Graph 视图的布局换成力导向"},
		{"waiting", "等 acme-web 的发布流水线跑完再合并"}, {"pr-ready", "Graph export drops edge labels past 120 nodes when the layout is radial"},
		{"done", "整理本周 mem 的发布说明"}, {"keep", "确认 v0.6 的发布时间"}, {"helper", "Nowledge Mem PR babysitter"},
	}
	for _, dark := range []bool{false, true} {
		paper := "light"
		if dark {
			paper = "dark"
		}
		for _, w := range []int{1000, 1400} {
			app := hoverBoard(t, i18n.ZH)
			app.Route = RouteOnHand
			tt := ui.NewTesterWith(app.View, w, 1500, ui.TesterOptions{})
			tt.SetScale(2)
			tt.SetDark(dark)
			tt.Frame()
			tt.Advance(3 * time.Second)
			tt.Frame()
			save := func(name string, crop *ui.Rect) {
				img := tt.Image()
				var out image.Image = img
				if crop != nil {
					s := float32(img.Bounds().Dx()) / float32(w)
					r := image.Rect(int((crop.X-12)*s), int((crop.Y-12)*s), int((crop.X+crop.W+12)*s), int((crop.Y+crop.H+12)*s)).Intersect(img.Bounds())
					out = img.SubImage(r)
				}
				writePNG(t, filepath.Join(dir, name+".png"), out)
			}
			save(fmt.Sprintf("board-%d-%s-rest", w, paper), nil)
			for _, r := range rows {
				box, ok := rowBox(tt, r.text)
				if !ok {
					t.Logf("no row %q", r.name)
					continue
				}
				tt.Move(-50, -50)
				tt.Frame()
				tt.Advance(time.Second)
				tt.Frame()
				save(fmt.Sprintf("%s-%d-%s-rest", r.name, w, paper), &box)
				tt.Move(box.X+box.W-30, box.Y+box.H/2)
				tt.Frame()
				for i, ms := range []int{0, 40, 80, 120, 200} {
					if i > 0 {
						tt.Advance(40 * time.Millisecond)
						if ms == 200 {
							tt.Advance(40 * time.Millisecond)
						}
					}
					tt.Frame()
					if w == 1400 && (r.name == "failed" || r.name == "done") {
						save(fmt.Sprintf("%s-%d-%s-in-%03dms", r.name, w, paper, ms), &box)
					}
				}
				tt.Advance(time.Second)
				tt.Frame()
				save(fmt.Sprintf("%s-%d-%s-hover", r.name, w, paper), &box)
			}
		}
	}
}

// rowBox is the link row holding text s.
func rowBox(tt *ui.Tester, s string) (ui.Rect, bool) {
	tr, ok := tt.Find(s)
	if !ok {
		for _, x := range tt.Texts() {
			if strings.HasPrefix(x, s[:min(len(s), 12)]) {
				tr, ok = tt.Find(x)
				break
			}
		}
	}
	if !ok {
		return ui.Rect{}, false
	}
	best := ui.Rect{}
	for _, n := range tt.AccessAll() {
		b := n.Bounds
		if n.Role == ui.RoleLink && b.W >= 300 && tr.X >= b.X && tr.Y >= b.Y && tr.X+1 <= b.X+b.W && tr.Y+1 <= b.Y+b.H {
			if best.W == 0 || b.W*b.H < best.W*best.H {
				best = b
			}
		}
	}
	return best, best.W > 0
}
