package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D390's Mac screens, zh and en, light and dark, against the heavy
// developer's six weeks (sessions_fixture_test.go):
//
//	DUCTER_SESSIONS_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/sessions go test ./internal/views -run SessionsShots
func TestSessionsShots(t *testing.T) {
	if os.Getenv("DUCTER_SESSIONS_SHOTS") == "" {
		t.Skip("DUCTER_SESSIONS_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := sessApp(t, lang)
		items := sessItems(lang)
		tt := ui.NewTesterWith(app.View, 1360, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string, w, h int, dark bool) {
			t.Helper()
			tt.SetSize(w, h)
			tt.SetDark(dark)
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			paper := "light"
			if dark {
				paper = "dark"
			}
			f, err := os.Create(filepath.Join(dir, "mac-"+name+"-"+paper+"-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		word := func(zh, en string) string { return pastWord(lang, zh, en) }
		// The palette with no words, over On hand.
		app.Route = RouteOnHand
		app.OpenSwitcher()
		shot("palette-empty", 1360, 860, false)
		// "compaction": on hand, earlier, made, go, tell, new.
		app.oh.swQuery = "compaction"
		tt.Frame()
		tt.Advance(300 * time.Millisecond)
		tt.Frame()
		q, _ := lastPast[protocol.PastReq](*sent)
		var hits []protocol.PastItem
		for _, it := range items {
			if strings.Contains(strings.ToLower(it.Title+it.Outcome), "compaction") {
				hit := it
				if it.TaskID == "s_mvcc" {
					hit.Hit = &protocol.PastHit{Field: "file", Text: "crates/compaction/src/snapshot_pin.rs"}
				}
				if it.TaskID == "s_metrics" {
					hit.Hit = &protocol.PastHit{Field: "words", Text: word("compaction 的指标先放五个，别太多", "Five compaction metrics for now, not more")}
				}
				hits = append(hits, hit)
			}
		}
		app.Receive(sessResult(hits, q.ID))
		app.Receive(protocol.ServerFrame{T: "made_result", Made: &protocol.MadeFrame{T: "made_result", ID: q.ID, Items: []protocol.MadeItem{
			{ID: "m1", Kind: "file", Title: "bench/compaction-2026-11-13.md", At: pastNow.Add(-6 * day).UTC().Format(time.RFC3339), Task: &protocol.MadeTask{TaskID: "s_bench", Title: word("跑写入基准，对比 0.9.2", "Run the write benchmark against 0.9.2")}},
		}}})
		app.pal.at = 1
		shot("palette-compaction", 1360, 860, false)
		shot("palette-compaction", 1360, 860, true)
		app.pal.at = 0
		app.palClose()

		// Past tasks, wide, with where it stopped beside the list.
		app.OpenPast("")
		q, _ = lastPast[protocol.PastReq](*sent)
		app.Receive(sessResult(items, q.ID))
		app.past.focusField = false
		app.pastSelect("s_rust_build")
		app.Receive(sessSteps(lang, "s_rust_build"))
		app.Receive(sessSteps(lang, "s_compaction_pr"))
		shot("past-where", 1360, 860, false)
		shot("past-where", 1360, 860, true)
		app.pastSelect("s_compaction_pr")
		app.past.pickSteps = true
		shot("past-steps-pick", 1360, 960, false)
		app.past.pickSteps = false
		// Filtered: haswell and didn't work.
		v := "haswell"
		app.past.computer, app.past.ended = &v, "failed"
		var hf []protocol.PastItem
		for _, it := range items {
			if it.Computer == "haswell" && it.Attention == protocol.Failed {
				hf = append(hf, it)
			}
		}
		r := sessResult(hf, "")
		r.Past.Facets = sessResult(items, "").Past.Facets
		app.Receive(r)
		app.past.sel = ""
		shot("past-haswell-failed", 1360, 860, false)
		app.past.computer, app.past.ended = nil, ""
		app.Receive(sessResult(items, ""))
		// The redo sheet on step 3.
		app.pastSelect("s_compaction_pr")
		it := app.pastItemFor("s_compaction_pr")
		app.openRedo(it, app.S.Past.Steps["s_compaction_pr"].Steps[2])
		app.past.redo.harness = "codex"
		app.past.redo.focus = false
		shot("redo", 1360, 860, false)
		shot("redo", 1360, 860, true)
		app.past.redo.open = false
		// A redone card, searched.
		app.past.q = word("第 3 步", "step")
		var redone []protocol.PastItem
		for _, it := range items {
			if it.From != nil {
				redone = append(redone, it)
			}
		}
		app.Receive(sessResult(redone, ""))
		app.pastSelect("s_compaction_redo")
		shot("past-redone", 1360, 860, false)
		// Narrow: the preview as a sheet.
		app.past.q = ""
		app.Receive(sessResult(items, ""))
		app.pastSelect("s_rust_build")
		app.past.sheet = true
		shot("past-sheet-narrow", 900, 760, false)
		shot("past-sheet-narrow", 900, 760, true)
		app.past.sheet = false
		_ = store.PaletteID
	}
}
