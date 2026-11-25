package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D372: Settings › Partner lists a never-rule in its own words and the
// built-in default per kind of work; a rule about errands puts the errand
// default aside. A task's who line says why: an errand on a faster one, or
// the one retry on the smartest.
func d370App(t *testing.T, lang i18n.Lang, never bool) *App {
	t.Helper()
	var two d322Case
	for _, k := range d322Cases() {
		if k.name == "two-agents" {
			two = k
		}
	}
	app, _ := d322App(t, lang, two)
	rules := []protocol.RuleView{{ID: "r1", Harness: "codex", Text: map[i18n.Lang]string{i18n.ZH: "后端的事 → Codex", i18n.EN: "Backend work → Codex"}[lang]}}
	if never {
		rules = append(rules, protocol.RuleView{ID: "r2", Text: map[i18n.Lang]string{i18n.ZH: "跑腿的事 → 不用 Claude Code", i18n.EN: "Errands → not Claude Code"}[lang], Harness: "claude-code", Kinds: []string{"errand"}, Never: true})
	}
	app.Receive(protocol.ServerFrame{T: "rules", Rules: rules, Defaults: []protocol.KindDefault{
		{Work: "errand", Harness: "claude-code", Model: "sonnet"},
		{Work: "rest", Harness: "claude-code", Model: "opus"},
	}})
	return app
}

func TestD372PartnerRules(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, never := range []bool{false, true} {
			app := d370App(t, lang, never)
			tt := ui.NewTesterWith(app.View, 1280, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			tt.Frame()
			sonnet := L.T("loadout.default.errand", app.whoName("claude-code", "sonnet"))
			rest := L.T("loadout.default.rest", app.whoName("claude-code", "opus"))
			if !hasText(tt, rest) {
				t.Errorf("%s never=%v: no %q in %q", lang, never, rest, tt.Texts())
			}
			if hasText(tt, sonnet) == never {
				t.Errorf("%s never=%v: the errand default shows=%v", lang, never, hasText(tt, sonnet))
			}
			for _, s := range tt.Texts() {
				if strings.Contains(s, "→") { // D500: an arrow is said in words
					t.Errorf("%s: a text arrow in %q", lang, s)
				}
				if strings.Contains(s, "） ") {
					t.Errorf("%s: a space after a full-width bracket in %q", lang, s)
				}
			}
			if never && !hasText(tt, L.T("loadout.rule.line.never")) {
				t.Errorf("%s: no never line", lang)
			}
			if dir := os.Getenv("DUCTER_D372_SHOTS"); dir != "" {
				t.Setenv("DUCTER_SHOTS_DIR", dir)
				name := "d370-partner"
				if never {
					name += "-never"
				}
				settle := func() {
					for i := 0; i < 4; i++ {
						tt.Frame()
						tt.Advance(300 * time.Millisecond)
					}
				}
				d302Both(t, app, tt, settle, name, lang)
			}
		}
	}
}

func TestD372WhoLine(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app := d370App(t, lang, false)
		task := &store.Task{ID: "t1", Body: &protocol.TaskBody{Harness: "claude-code", Model: "sonnet", Why: protocol.BodyWhy{Kind: "kind", Work: "errand", Keeps: &protocol.KindDefault{Harness: "claude-code", Model: "opus"}}}}
		if _, why := app.whoLine(task); why != L.T("who.why.kind") {
			t.Errorf("%s kind: %q", lang, why)
		}
		if s := app.whoSentence(task); s != L.T("who.sentence.kind", app.bodyLine(task), app.padEnd(app.whoName("claude-code", "opus"))) {
			t.Errorf("%s kind sentence: %q", lang, s)
		}
		task.Body = &protocol.TaskBody{Harness: "claude-code", Model: "opus", Why: protocol.BodyWhy{Kind: "retry", From: "claude-code", FromModel: "sonnet", Stalled: true}}
		if _, why := app.whoLine(task); why != L.T("who.why.retry.stalled", app.padEnd(app.whoName("claude-code", "sonnet"))) {
			t.Errorf("%s retry: %q", lang, why)
		}
	}
}
