package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D386 (was D354's two chips): under an opened task's composer, its model
// and effort in one chip, always in sight while it can be switched; it
// opens one card: the effort big, a stepped control over the levels the
// model takes, Back to default, and the model as a line that turns the card
// to the agent's live models. A choice is the in-place switch, said once.
// Gone where it can't switch.
func TestComposerTuneChips(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		L := app.L
		app.Now = tt.Now
		app.OpenTask("t_asc") // Codex, on its own default model
		tt.Frame()
		if _, ok := lastFrame[protocol.TaskNewOptions](sent); !ok {
			t.Fatalf("%s: the opened task asks for the agent's own models", lang)
		}
		chipOf := func(model, effort string) string {
			if effort == "" {
				return spoken(L, L.T("newtask.model"), model)
			}
			return spoken(L, L.T("newtask.model"), model, L.T("newtask.effort"), effort)
		}
		if _, ok := tt.Find(chipOf("GPT-6.1 Terra", L.T("effort.low"))); ok {
			t.Fatalf("%s: no chip before the live list", lang)
		}
		app.Receive(protocol.ServerFrame{T: "task_new_options", Models: codex062()})
		tt.Frame()
		// One chip: the model, then the effort word, each its own text.
		if _, ok := tt.Find(chipOf("GPT-6.1 Terra", L.T("effort.low"))); !ok {
			t.Fatalf("%s: no one chip under the composer: %q", lang, tt.Texts())
		}
		for _, s := range []string{"GPT-6.1 Terra", L.T("effort.low")} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in the chip: %q", lang, s, tt.Texts())
			}
		}
		if tt.HasText("GPT-6.2-Sol") {
			t.Fatalf("%s: the card stays closed until asked", lang)
		}
		composerTuneShot(t, tt, "mac-chip-"+string(lang))

		// The card: the effort big, a real slider over the model's six levels, its default spoken.
		click(t, tt, chipOf("GPT-6.1 Terra", L.T("effort.low")))
		sl, ok := tt.AccessByRole(ui.RoleSlider, L.T("newtask.effort"))
		if !ok {
			t.Fatalf("%s: no slider in the card: %q", lang, tt.Texts())
		}
		if want := spoken(L, L.T("effort.low"), L.T("newtask.effort.default")); sl.Value != want {
			t.Fatalf("%s: the slider reads %q, want %q", lang, sl.Value, want)
		}
		for _, s := range []string{L.T("effort.ultra"), L.T("newtask.effort.default")} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in the card: %q", lang, s, tt.Texts())
			}
		}
		if _, ok := tt.Find(L.T("tune.reset")); ok {
			t.Fatalf("%s: Back to default while on the default", lang)
		}
		composerTuneShot(t, tt, "mac-card-"+string(lang))

		// A tap on the third dot: High, switched once the control rests, the same model.
		b := sl.Bounds
		tt.ClickAt(b.X+12+(b.W-24)*2/5, b.Y+b.H/2)
		tt.Frame()
		if sw, ok := lastFrame[protocol.TaskSwitch](sent); ok {
			t.Fatalf("%s: switched before the control rested: %+v", lang, sw)
		}
		tt.Advance(tuneSettle + 100*time.Millisecond)
		tt.Frame()
		tt.Frame()
		sw, ok := lastFrame[protocol.TaskSwitch](sent)
		if !ok || sw.TaskID != "t_asc" || sw.Harness != "codex" || sw.Model != "gpt-6.1-terra" || sw.Effort != "high" {
			t.Fatalf("%s: the effort in place: %+v (%v)", lang, sw, ok)
		}
		if !tt.HasText(L.T("tune.next.effort", L.T("effort.high"))) {
			t.Fatalf("%s: no line after the effort: %q", lang, tt.Texts())
		}
		composerTuneShot(t, tt, "mac-moved-"+string(lang))
		app.S.Tasks["t_asc"].Card.Effort = "high"
		tt.Frame()

		// Back to default: the model's own, by name.
		click(t, tt, L.T("tune.reset"))
		sw, _ = lastFrame[protocol.TaskSwitch](sent)
		if sw.Model != "gpt-6.1-terra" || sw.Effort != "low" {
			t.Fatalf("%s: back to default: %+v", lang, sw)
		}

		// The model line turns the card to the live list; a pick switches the model.
		click(t, tt, spoken(L, L.T("tune.change.model"), "GPT-6.1 Terra"))
		for _, s := range []string{"GPT-6.2-Sol", "GPT-6.2-Astra", "GPT-5.6-Sol"} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in the model list: %q", lang, s, tt.Texts())
			}
		}
		composerTuneShot(t, tt, "mac-models-"+string(lang))
		click(t, tt, "GPT-6.2-Sol")
		sw, _ = lastFrame[protocol.TaskSwitch](sent)
		if sw.Model != "gpt-6.2-sol" || sw.Effort != "" {
			t.Fatalf("%s: the model in place: %+v", lang, sw)
		}
		said := L.T("tune.next.model", "GPT-6.2-Sol")
		if !tt.HasText(said) {
			t.Fatalf("%s: no %q after choosing: %q", lang, said, tt.Texts())
		}
		// The home's answer: no "Continued on" with no one named.
		app.Receive(protocol.ServerFrame{T: "action_result", TaskID: "t_asc", Action: "switch", OK: true})
		tt.Frame()
		if done := map[i18n.Lang]string{i18n.ZH: "接着做了", i18n.EN: "Continued on"}[lang]; tt.HasText(done) {
			t.Fatalf("%s: %q after an in-place choice: %q", lang, done, tt.Texts())
		}
		tt.Advance(tuneSaidFor + time.Second)
		tt.Frame()
		tt.Frame()
		if tt.HasText(said) {
			t.Fatalf("%s: the line is said once, then goes", lang)
		}

		// A model with no levels: the chip names the model alone; the card is its list.
		opts := codex062()
		opts[0].Models[4].Efforts = nil
		app.Receive(protocol.ServerFrame{T: "task_new_options", Models: opts})
		app.S.Tasks["t_asc"].Card.Model, app.S.Tasks["t_asc"].Card.Effort = "gpt-6-astra", ""
		tt.Frame()
		click(t, tt, chipOf("GPT-6-Astra", ""))
		if _, ok := tt.AccessByRole(ui.RoleSlider, L.T("newtask.effort")); ok {
			t.Fatalf("%s: a slider for a model without levels", lang)
		}
		if !tt.HasText("GPT-6.2-Astra") {
			t.Fatalf("%s: no model list for a model without levels: %q", lang, tt.Texts())
		}
		tt.Key(0, ui.KeyEscape)
		tt.Frame()

		// Can't switch (dropped): nothing.
		tk := app.S.Tasks["t_asc"]
		tk.State, tk.Card.Attention = nil, protocol.Dropped
		tt.Frame()
		// The head's meta line names the model too (D355), so look for the chip itself.
		if _, ok := tt.Find(chipOf("GPT-6-Astra", "")); ok {
			t.Fatalf("%s: a chip on a task that can't switch: %q", lang, tt.Texts())
		}
	}
}

// The chip's level mark and Back to default, as the web's (composer-tune.test.ts).
func TestComposerTuneLogic(t *testing.T) {
	got := []int{}
	for i := range 6 {
		got = append(got, tuneMarkBars(i, 6))
	}
	if want := []int{1, 1, 2, 2, 3, 3}; !slices.Equal(got, want) {
		t.Fatalf("bars %v, want %v", got, want)
	}
	if tuneMarkBars(-1, 6) != 0 {
		t.Fatal("no bars for the agent's own level")
	}
	sol := &protocol.ModelChoice{ID: "gpt-6.2-sol", Efforts: []string{"low", "medium", "high"}, DefaultEffort: "low"}
	if tuneResetTo(sol, "high") != "low" || tuneResetTo(sol, "low") != "" {
		t.Fatal("Back to default is the model's own default, only off it")
	}
	if tuneResetTo(&protocol.ModelChoice{ID: "opus", Efforts: []string{"low", "high"}}, "high") != "" {
		t.Fatal("no Back to default where the agent names no default")
	}
}

// composerTuneShot saves the window, light and dark, when DUCTER_COMPOSER_SHOTS is set.
func composerTuneShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("DUCTER_COMPOSER_SHOTS")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, dark := range []bool{false, true} {
		tt.SetDark(dark)
		tt.Advance(time.Second)
		tt.Frame()
		paper := map[bool]string{false: "light", true: "dark"}[dark]
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-%s.png", name, paper)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	tt.SetDark(false)
	tt.Advance(time.Second)
	tt.Frame()
}
