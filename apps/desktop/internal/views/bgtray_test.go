package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D518: the opened task's 后台 / In the background tray, from frames (no
// core): the author's LoCoMo eval task with its agent's subagents, shells and
// a Monitor watch running and 22 finished, at the Mac's widths.

// d518Jobs is n running and done finished, as the author's eval task had them.
func d518Jobs(lang i18n.Lang, running, done int) *protocol.TaskBackground {
	at := func(ago time.Duration) string { return time.Now().Add(-ago).UTC().Format(time.RFC3339Nano) }
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	live := []protocol.BgJob{
		{ID: "a1", Kind: "agent", Title: "S0: per-question eval ledger", At: at(80 * time.Minute), State: "running", Stop: true},
		{ID: "b1", Kind: "shell", Title: pick("等 LoCoMo 的库建完再开始评测", "Wait for the LoCoMo store to finish"), At: at(27 * time.Second), State: "running", Stop: true},
		{ID: "b2", Kind: "shell", Title: "cargo bench --bench wal -- --save-baseline main", At: at(12 * time.Minute), State: "running"},
		{ID: "m1", Kind: "watch", Title: "Watch the eval log for OOM kills and 429s from the judge", At: at(41 * time.Minute), State: "running", Stop: true},
		{ID: "a2", Kind: "agent", Title: "S1: re-judge the 1,986 answers with the strict rubric and keep a per-category diff against the baseline run", At: at(33 * time.Minute), State: "running", Stop: true},
		{ID: "b3", Kind: "shell", Title: "bun test packages/core --timeout 20000", At: at(2 * time.Minute), State: "running"},
	}
	ended := []string{
		"uv run python scripts/build_store.py --dataset locomo10", "S0: draft the ledger schema", "Find where the judge drops the category label",
		"rg -n \"strict_rubric\" eval/", "tail -n 200 logs/eval.log", "Watch the store build for disk pressure", "S2: sample 40 answers for a human check",
		"git log --oneline -20 -- eval/judge.py", "Compare the run against the 2026-11-20 baseline", "bun run eval:partner --model haiku",
		"du -sh .cache/locomo", "Check that every session id in the ledger resolves", "S3: summarise what moved by category",
		"python -m eval.report --run r-1124", "curl -s localhost:8080/healthz", "Re-run the 12 answers that timed out", "make lint",
		"Watch the judge's rate limit headers", "jq '.categories' out/r-1124/summary.json", "S4: write the per-question notes", "ls -la out/r-1124", "pytest tests/test_ledger.py -q",
	}
	var jobs []protocol.BgJob
	jobs = append(jobs, live[:running]...)
	for i := 0; i < done && i < len(ended); i++ {
		kind := "shell"
		if strings.HasPrefix(ended[i], "S") && strings.Contains(ended[i], ":") || strings.HasPrefix(ended[i], "Find") || strings.HasPrefix(ended[i], "Compare") || strings.HasPrefix(ended[i], "Check") || strings.HasPrefix(ended[i], "Re-run") {
			kind = "agent"
		}
		if strings.HasPrefix(ended[i], "Watch") {
			kind = "watch"
		}
		start := time.Duration(200-i*8) * time.Minute
		j := protocol.BgJob{ID: fmt.Sprintf("d%d", i), Kind: kind, Title: ended[i], At: at(start), EndedAt: at(start - time.Duration(3+i%7)*time.Minute), State: "done"}
		zero := 0
		if kind == "shell" {
			j.Exit = &zero
			j.Tail = "collected 48 items\n\ntests/test_ledger.py ................................................ [100%]\n\n48 passed in 3.21s"
		}
		switch i {
		case 21:
			two := 2
			j.State, j.Exit, j.Tail = "failed", &two, "FAILED tests/test_ledger.py::test_category_kept - KeyError: 'category'\n1 failed, 47 passed in 3.40s"
		case 11:
			j.State = "stopped"
		case 15:
			j.State = "unknown"
		}
		jobs = append(jobs, j)
	}
	if len(jobs) == 0 {
		return nil
	}
	return &protocol.TaskBackground{Jobs: jobs, Done: done}
}

func d518Task(t *testing.T, lang i18n.Lang, w int, running, done int) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	at := func(ago time.Duration) string { return time.Now().Add(-ago).UTC().Format(time.RFC3339Nano) }
	title := pick("跑一遍 LoCoMo 评测，按题记账", "Run the LoCoMo eval with a per-question ledger")
	var evs []protocol.LogEvent
	add := func(seq int64, ago time.Duration, origin protocol.Origin, kind string, body any) {
		evs = append(evs, protocol.NewEvent(seq, at(ago), "default", "task:e1", origin, kind, body))
	}
	add(1, 90*time.Minute, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "e1", Title: title, Harness: "claude-code", Brief: title})
	add(2, 90*time.Minute, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "e1", Attention: protocol.Working, Residency: "hot"})
	add(3, 85*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "e1", Role: "assistant", Text: pick("库在后台建，我先把账本的格式定下来。", "The store builds in the background; I'm settling the ledger's shape first.")})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	card := protocol.TaskCard{TaskID: "e1", Persona: "default", Title: title, Harness: "claude-code", Attention: protocol.Working, Residency: "hot", OpenedAt: at(90 * time.Minute), UpdatedAt: at(time.Minute), Background: d518Jobs(lang, running, done)}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
	tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask("e1")
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: "e1", Events: evs})
	for i := 0; i < 4; i++ {
		tt.Frame()
		tt.Advance(200 * time.Millisecond)
	}
	return app, tt, sent
}

// TestD518Tray: six running and 22 done at 1000 and 1400, zh and en: the
// head, each row's words, its time and Stop only where its agent can stop
// it; the finished fold opens to their states; nothing overlaps or leaves
// the window; Stop sends the job; folded, only the head stays.
func TestD518Tray(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1000, 1400} {
			app, tt, sent := d518Task(t, lang, w, 6, 22)
			L := app.L
			for _, s := range []string{L.T("bg.head", 6), "S0: per-question eval ledger", L.T("bg.done", 22), "cargo bench --bench wal -- --save-baseline main"} {
				if !tt.HasText(s) {
					t.Errorf("%s %d: no %q in %q", lang, w, s, tt.Texts())
				}
			}
			// Stop on the four its agent can stop; none on the Codex-style terminals.
			stops := 0
			for _, x := range tt.AccessAll() {
				if x.Role == ui.RoleButton && strings.HasPrefix(x.Name, L.T("bg.stop")) {
					stops++
					if x.Bounds.W < 28 || x.Bounds.H < 28 {
						t.Errorf("%s %d: Stop is %+v", lang, w, x.Bounds)
					}
				}
			}
			if stops != 4 {
				t.Errorf("%s %d: %d Stop buttons, want 4", lang, w, stops)
			}
			// The long title is cut on one line, inside the tray.
			long := "S1: re-judge the 1,986 answers with the strict rubric and keep a per-category diff against the baseline run"
			if r, ok := tt.Find(long); !ok || r.H > 24 || r.X+r.W > float32(w) {
				t.Errorf("%s %d: the long title %+v %v", lang, w, r, ok)
			}
			for _, b := range paneGeometry(tt, float32(w)) {
				if strings.Contains(b, long) {
					continue // its tooltip-held whole is cut by design
				}
				t.Errorf("%s %d: %s", lang, w, b)
			}
			// Stop sends the one job.
			x, ok := tt.AccessByRole(ui.RoleButton, spoken(L, L.T("bg.stop"), "S0: per-question eval ledger"))
			if !ok {
				t.Fatalf("%s %d: no Stop for S0", lang, w)
			}
			tt.ClickAt(x.Bounds.X+x.Bounds.W/2, x.Bounds.Y+x.Bounds.H/2)
			tt.Frame()
			var got []string
			for _, f := range *sent {
				if a, ok := f.(protocol.TaskAction); ok && a.Action == "stop_background" {
					got = append(got, a.Job)
				}
			}
			if fmt.Sprint(got) != "[a1]" {
				t.Errorf("%s %d: stops sent %v", lang, w, got)
			}
			if !tt.HasText(L.T("bg.stopping")) {
				t.Errorf("%s %d: no %q after Stop", lang, w, L.T("bg.stopping"))
			}
			// The finished fold opens: each state in words, the failure's exit code.
			if err := tt.Click(L.T("bg.done", 22)); err != nil {
				t.Fatal(err)
			}
			tt.Frame()
			for _, s := range []string{L.T("bg.st.exit", 2), L.T("bg.st.stopped"), L.T("bg.st.unknown")} {
				if !tt.HasText(s) {
					t.Errorf("%s %d: open, no %q", lang, w, s)
				}
			}
			// Folded: the head alone, and it stays folded on this Mac.
			hb, ok := tt.AccessByRole(ui.RoleButton, spoken(L, L.T("bg.head", 6), L.T("bg.hide")))
			if !ok {
				t.Fatalf("%s %d: no head button", lang, w)
			}
			tt.ClickAt(hb.Bounds.X+hb.Bounds.W/2, hb.Bounds.Y+hb.Bounds.H/2)
			tt.Frame()
			if tt.HasText("S0: per-question eval ledger") || !tt.HasText(L.T("bg.head", 6)) || !app.Local.BgTrayShut() {
				t.Errorf("%s %d: folded shows %q", lang, w, tt.Texts())
			}
			app.Local.SetBgTrayShut(false)
		}
	}
}

// TestD518Quiet: a task whose agent never ran anything in the background
// has no tray; one with only finished work says them as one folded head.
func TestD518Quiet(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt, _ := d518Task(t, lang, 1400, 0, 0)
		if tt.HasText(app.L.T("bg.head", 0)) || tt.HasText(app.L.T("bg.head.done", 0)) {
			t.Errorf("%s: a tray with nothing", lang)
		}
		app, tt, _ = d518Task(t, lang, 1400, 0, 22)
		if !tt.HasText(app.L.T("bg.head.done", 22)) || tt.HasText("make lint") {
			t.Errorf("%s: finished only: %q", lang, tt.Texts())
		}
	}
}

// TestD518OnHand: a running task's row says how many run in the background.
func TestD518OnHand(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, _ := d518Task(t, lang, 1400, 3, 2)
		task := app.S.Task("e1")
		found := false
		for _, m := range app.whereMeta(task) {
			if m == app.L.T("bg.onhand", 3) {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: On hand's facts %v", lang, app.whereMeta(task))
		}
	}
}

// D518 shots: 0, 2 and 6 running with 22 done, at 1400 and 1000, zh and en,
// light and dark, the fold open and the tail of a failure open:
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/bg-tray go test ./internal/views -run D518Shots
func TestD518Shots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	write := func(tt *ui.Tester, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	// 2x crops of the tray's top and bottom edges, light and dark.
	for _, mode := range []string{"light", "dark"} {
		app, tt, _ := d518Task(t, i18n.ZH, 1400, 6, 22)
		app.Local.SetAppearance(mode)
		tt.SetScale(2)
		for i := 0; i < 6; i++ {
			tt.Advance(200 * time.Millisecond)
			tt.Frame()
		}
		tt.Frame()
		r, _ := tt.Find(app.L.T("bg.head", 6))
		img := tt.Image()
		for i, y := range []float32{r.Y - 24, r.Y + 300} {
			x0, y0 := int((r.X-40)*2), int(y*2)
			sub := img.SubImage(image.Rect(x0, y0, x0+int(760*2), y0+int(130*2)))
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-1400-run6-%s-zh-crop%d.png", mode, i)))
			if err != nil {
				t.Fatal(err)
			}
			png.Encode(f, sub)
			f.Close()
		}
		app.Local.SetAppearance("system")
	}
	// The tray entering (D290's rise and fade), five frames 50 ms apart.
	{
		app, sent := iaApp(t, i18n.ZH)
		_ = sent
		app.Status = client.Connected
		app.LocaleFixed = true
		tt := ui.NewTesterWith(app.View, 1400, 900, ui.TesterOptions{})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		at := func(ago time.Duration) string { return time.Now().Add(-ago).UTC().Format(time.RFC3339Nano) }
		card := protocol.TaskCard{TaskID: "e1", Persona: "default", Title: "跑一遍 LoCoMo 评测，按题记账", Harness: "claude-code", Attention: protocol.Working, Residency: "hot", OpenedAt: at(90 * time.Minute), UpdatedAt: at(time.Minute)}
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
		app.OpenTask("e1")
		for i := 0; i < 6; i++ {
			tt.Frame()
			tt.Advance(200 * time.Millisecond)
		}
		card.Background = d518Jobs(i18n.ZH, 2, 22)
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
		for i := 0; i < 5; i++ {
			tt.Frame()
			write(tt, fmt.Sprintf("mac-1400-enter-f%d", i))
			tt.Advance(50 * time.Millisecond)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1400, 1000} {
			for _, n := range []int{0, 2, 6} {
				for _, mode := range []string{"light", "dark"} {
					app, tt, _ := d518Task(t, lang, w, n, 22)
					app.Local.SetAppearance(mode)
					for i := 0; i < 4; i++ {
						tt.Frame()
						tt.Advance(200 * time.Millisecond)
					}
					name := fmt.Sprintf("mac-%d-run%d-%s-%s", w, n, mode, lang)
					write(tt, name)
					if n == 6 {
						_ = tt.Click(app.L.T("bg.done", 22))
						tt.Frame()
						_ = tt.Click("pytest tests/test_ledger.py -q")
						tt.Frame()
						write(tt, name+"-done-open")
					}
					app.Local.SetAppearance("system")
				}
			}
		}
	}
}
