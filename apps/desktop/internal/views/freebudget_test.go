package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D449: the partner on a free key. Settings › Partner says about how many
// requests are left today and that results aren't looked over again, never
// "paid per use"; when the day's cap is spent, the line names the provider,
// its own reset and the paid way.
func freeCase(out bool) d322Case {
	n := time.Now()
	reset := time.Date(n.Year(), n.Month(), n.Day(), 8, 0, 0, 0, time.Local).Add(24 * time.Hour).UTC().Format(time.RFC3339)
	pi := protocol.DeviceHarness{Harness: "pi", Installed: true, LoggedIn: true, CanBePartner: true, Billing: "usage"}
	cc := protocol.DeviceHarness{Harness: "claude-code", Installed: false}
	home := protocol.DeviceView{ID: "dev_home", Name: "Weyl's MacBook", Kind: "mac", Home: true, State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{pi, cc}}
	limit, left := 50, 12
	brain := &protocol.BrainNow{Brain: protocol.Brain{Harness: "pi", Model: "openrouter/google/gemma-4-31b-it:free"}, Budget: &protocol.FreeBudget{Provider: "openrouter", Limit: &limit, Left: &left, ResetsAt: reset}}
	name := "free"
	if out {
		zero := 0
		brain.Budget.Left = &zero
		brain.Budget.Out = true
		brain.Held = &protocol.BrainHeld{From: "pi", Why: "quota", Until: reset, ResetKnown: true, Waits: true, Free: "openrouter"}
		name = "free-out"
	}
	return d322Case{name: name, home: home, url: "ws://127.0.0.1:7777/ws", brain: brain, setting: &protocol.Brain{Harness: "pi", Model: "openrouter/google/gemma-4-31b-it:free"}}
}

func TestFreeKeyDaySaidInSettings(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, out := range []bool{false, true} {
			k := freeCase(out)
			app, _ := d322App(t, lang, k)
			tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			texts := strings.Join(tt.Texts(), "\n")
			at := app.heldAt(&protocol.BrainHeld{Until: k.brain.Budget.ResetsAt, ResetKnown: true})
			want := map[i18n.Lang][]string{
				i18n.ZH: {"OpenRouter 的免费额度，今天还剩约 12 次", "结果不再让另一个 AI 复查"},
				i18n.EN: {"On OpenRouter's free allowance: about 12 left today", "Results aren't looked over by another AI here"},
			}[lang]
			if out {
				want = map[i18n.Lang][]string{
					i18n.ZH: {"OpenRouter 的免费额度今天用完了，" + at + " 恢复；想不等的话，充 $10 就能多很多", "结果不再让另一个 AI 复查"},
					i18n.EN: {"OpenRouter's free allowance is used up for today. It's back at " + at + "; if you'd rather not wait, $10 of credit lifts it a lot"},
				}[lang]
			}
			for _, w := range want {
				if !strings.Contains(texts, w) {
					t.Errorf("%s %s: no %q in %q", lang, k.name, w, tt.Texts())
				}
			}
			// The pi rows say the free day, never "paid per use" (the add section's general line may).
			for _, key := range []string{"loadout.brain.key", "loadout.acct.paid.short"} {
				if strings.Contains(texts, app.L.T(key)) {
					t.Errorf("%s %s: a free key said %q", lang, k.name, app.L.T(key))
				}
			}
			if out && (strings.Contains(texts, "还剩约") || strings.Contains(texts, "left today")) {
				t.Errorf("%s: the count said on top of the spent day", lang)
			}
		}
	}
}

// DUCTER_D449_SHOTS=<dir> go test ./internal/views -run TestD449FreeKeyShots
func TestD449FreeKeyShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D449_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D449_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, out := range []bool{false, true} {
			k := freeCase(out)
			app, _ := d322App(t, lang, k)
			app.Status = 1
			tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			settle := func() {
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(300 * time.Millisecond)
				}
			}
			d302Both(t, app, tt, settle, "d449-partner-"+k.name, lang)
		}
	}
}
