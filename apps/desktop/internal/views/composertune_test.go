package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D353: under an opened task's composer, its model and effort in plain
// words, always in sight while it can be switched; each opens a short list
// of the agent's live models (or that model's efforts, its default marked);
// a choice is the in-place switch, said once. Gone where it can't switch.
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
		if tt.HasText("GPT-6.1 Terra") {
			t.Fatalf("%s: no chips before the live list", lang)
		}
		app.Receive(protocol.ServerFrame{T: "task_new_options", Models: codex062()})
		tt.Frame()
		effortChip := L.T("tune.effort", L.T("effort.low"))
		for _, s := range []string{"GPT-6.1 Terra", effortChip} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q under the composer: %q", lang, s, tt.Texts())
			}
		}
		if tt.HasText("GPT-6.2-Sol") {
			t.Fatalf("%s: the list stays closed until asked", lang)
		}
		composerTuneShot(t, tt, "mac-chips-"+string(lang))

		// The model chip: the live list, the new ones in it.
		click(t, tt, spoken(L, L.T("newtask.model"), "GPT-6.1 Terra"))
		for _, s := range []string{"GPT-6.2-Sol", "GPT-6.2-Astra", "GPT-5.6-Sol"} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in the model list: %q", lang, s, tt.Texts())
			}
		}
		composerTuneShot(t, tt, "mac-models-"+string(lang))
		click(t, tt, "GPT-6.2-Sol")
		sw, ok := lastFrame[protocol.TaskSwitch](sent)
		if !ok || sw.TaskID != "t_asc" || sw.Harness != "codex" || sw.Model != "gpt-6.2-sol" || sw.Effort != "" {
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
		composerTuneShot(t, tt, "mac-said-"+string(lang))
		tt.Advance(tuneSaidFor + time.Second)
		tt.Frame()
		tt.Frame()
		if tt.HasText(said) {
			t.Fatalf("%s: the line is said once, then goes", lang)
		}

		// The effort chip: that model's levels, its default marked.
		app.S.Tasks["t_asc"].Card.Model = "gpt-6-astra"
		tt.Frame()
		click(t, tt, spoken(L, L.T("newtask.effort"), L.T("effort.medium")))
		for _, s := range []string{L.T("effort.ultra"), L.T("newtask.effort.default")} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q in the effort list: %q", lang, s, tt.Texts())
			}
		}
		composerTuneShot(t, tt, "mac-efforts-"+string(lang))
		click(t, tt, L.T("effort.high"))
		sw, _ = lastFrame[protocol.TaskSwitch](sent)
		if sw.Model != "gpt-6-astra" || sw.Effort != "high" {
			t.Fatalf("%s: the effort in place: %+v", lang, sw)
		}
		if !tt.HasText(L.T("tune.next.effort", L.T("effort.high"))) {
			t.Fatalf("%s: no line after the effort: %q", lang, tt.Texts())
		}

		// A model with no levels: no effort chip.
		opts := codex062()
		opts[0].Models[4].Efforts = nil
		app.Receive(protocol.ServerFrame{T: "task_new_options", Models: opts})
		tt.Frame()
		if _, ok := tt.Find(spoken(L, L.T("newtask.effort"), L.T("effort.medium"))); ok {
			t.Fatalf("%s: an effort chip for a model without levels", lang)
		}

		// Can't switch (dropped): nothing.
		tk := app.S.Tasks["t_asc"]
		tk.State, tk.Card.Attention = nil, protocol.Dropped
		tt.Frame()
		if tt.HasText("GPT-6-Astra") {
			t.Fatalf("%s: chips on a task that can't switch: %q", lang, tt.Texts())
		}
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
