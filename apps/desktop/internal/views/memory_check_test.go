package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// memCheckFixture is what Mem asked on the author's Mem (research/202),
// two contradictions and one learned rule, and one rule on.
func memCheckFixture() *protocol.MemCheck {
	return &protocol.MemCheck{
		Asks: []protocol.MemCheckItem{
			{ID: "e2", Kind: "contradiction", Pair: []protocol.MemPairItem{{Title: "Cloud UTC 午夜与本地 rolling 24h 的 token 重置语义", At: "2026-11-09"}, {Title: "mem reset window is rolling 24h, not UTC midnight", At: "2026-11-12"}}, Suggest: "both", Answers: []string{"newer", "older", "both"}},
			{ID: "rule:feishu-deploy", Kind: "rule", Title: "Feishu 生产部署必须经 GitHub Actions 故障安全门禁", Body: "Production Feishu Worker 必须通过 GitHub Actions 的 fail-closed 门禁部署，且部署源需与当前 origin/main 的精确 SHA 完全一致。", Suggest: "use", Answers: []string{"use", "not"}},
		},
		More:  true,
		Rules: []protocol.MemRule{{ID: "rule:ci-first", Title: "Push only after CI is green", Body: "Never chain git push after tests; read the fail count first."}},
	}
}

// D465: Nowledge Mem would like to check: the asks with Mem's suggestion as
// the primary, an answer sent by id that leaves at once, a refusal brought
// back with its line, a rule turned off only after asking. The web's:
// apps/web/test/mem-check.test.ts.
func TestMemCheck(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := memApp(t, lang, "on")
		app.S.Mem.Check = memCheckFixture()
		app.openTab(TabMemory)
		tt := ui.NewTesterWith(app.View, 1280, 2800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		L := app.L
		for _, w := range []string{L.T("mem.check.title"), L.T("mem.check.contra"), L.T("mem.check.earlier"), L.T("mem.check.later"), L.T("mem.check.rule"), L.T("mem.check.more"), L.T("mem.rules.title"), L.T("mem.rules.note", app.personaName())} {
			if !tt.HasText(w) {
				t.Fatalf("%s: no %q in %q", lang, w, tt.Texts())
			}
		}
		pair := "Cloud UTC 午夜与本地 rolling 24h 的 token 重置语义 / mem reset window is rolling 24h, not UTC midnight"
		n := len(*sent)
		if err := tt.Click(spoken(L, L.T("mem.check.newer"), pair)); err != nil {
			t.Fatal(err)
		}
		if a, ok := (*sent)[n].(protocol.MemAnswer); !ok || a.ID != "e2" || a.Answer != "newer" {
			t.Fatalf("以后记的为准 sent %v", (*sent)[n:])
		}
		tt.Frame()
		if tt.HasText(L.T("mem.check.contra")) || !tt.HasText(L.T("said.mem.check.newer")) {
			t.Fatalf("the ask didn't leave, or no word: %q", tt.Texts())
		}
		// Mem refused: the ask is back with the next settings frame, and a line says so.
		app.Receive(protocol.ServerFrame{T: "mem_answered", MemAnswered: &protocol.MemAnswered{ID: "e2", Answer: "newer", OK: false}})
		app.S.Mem.Check = memCheckFixture()
		tt.Frame()
		if !tt.HasText(L.T("mem.check.failed")) {
			t.Fatalf("no line after a refusal: %q", tt.Texts())
		}
		// A learned rule turned on joins the rules on.
		rule := "Feishu 生产部署必须经 GitHub Actions 故障安全门禁"
		if err := tt.Click(spoken(L, L.T("mem.check.use"), rule)); err != nil {
			t.Fatal(err)
		}
		if a := (*sent)[len(*sent)-1].(protocol.MemAnswer); a.ID != "rule:feishu-deploy" || a.Answer != "use" {
			t.Fatalf("用上 sent %v", a)
		}
		if r := app.S.Mem.Check.Rules; len(r) != 2 || r[0].ID != "rule:feishu-deploy" {
			t.Fatalf("rules on after 用上: %v", r)
		}
		tt.Frame()
		// 停用 asks first; only the answer sends.
		n = len(*sent)
		on := "Push only after CI is green"
		if err := tt.Click(spoken(L, L.T("mem.rules.off"), on)); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if len(*sent) != n || !tt.HasText(L.T("mem.rules.off.ask", on)) {
			t.Fatalf("停用 didn't ask first: %v %q", (*sent)[n:], tt.Texts())
		}
		if err := tt.Click(spoken(L, L.T("mem.rules.off"), on)); err != nil {
			t.Fatal(err)
		}
		if a := (*sent)[len(*sent)-1].(protocol.MemAnswer); a.ID != "rule:ci-first" || a.Answer != "not" {
			t.Fatalf("停用 sent %v", a)
		}
	}
}

// D465: nothing waiting and no rules: no section at all; the frame decodes.
func TestMemCheckQuiet(t *testing.T) {
	app, _ := memApp(t, i18n.ZH, "on")
	app.openTab(TabMemory)
	tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if tt.HasText(app.L.T("mem.check.title")) || tt.HasText(app.L.T("mem.rules.title")) {
		t.Fatalf("a section with nothing in it: %q", tt.Texts())
	}
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"mem_answered","id":"e2","answer":"newer","ok":false}`))
	if err != nil || f.MemAnswered == nil || f.MemAnswered.ID != "e2" || f.MemAnswered.OK {
		t.Fatalf("mem_answered decoded as %+v, %v", f.MemAnswered, err)
	}
}

// Pictures of the check, zh and en:
//
//	DUCTER_MEM_SHOTS=/path/to/.shots/mem-check go test ./internal/views -run MemCheckShots
func TestMemCheckShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEM_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEM_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []int{1280, 760} {
			app, _ := memApp(t, lang, "on")
			app.S.Mem.Check = memCheckFixture()
			app.openTab(TabMemory)
			tt := ui.NewTesterWith(app.View, w, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-mem-check-%s-%d.png", lang, w)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}
