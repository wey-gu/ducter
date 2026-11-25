package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// codex062 is Codex 0.169.1's own list as the home sends it (D352): the
// two new models first, each with its default effort, the person's own
// default (gpt-6.1-terra) marked. The row stops at eight.
func codex062() []protocol.AgentModels {
	ultra := append(append([]string{}, allEfforts...), "ultra")
	return []protocol.AgentModels{{Harness: "codex", From: "live", Models: []protocol.ModelChoice{
		{ID: "gpt-6.2-sol", Label: "GPT-6.2-Sol", Efforts: ultra, DefaultEffort: "low"},
		{ID: "gpt-6.2-astra", Label: "GPT-6.2-Astra", Efforts: ultra, DefaultEffort: "low"},
		{ID: "gpt-6.1-terra", Label: "GPT-6.1 Terra", Suggested: true, Default: true, Efforts: ultra, DefaultEffort: "low"},
		{ID: "gpt-6.1-sol", Label: "GPT-6.1-Sol", Efforts: ultra, DefaultEffort: "low"},
		{ID: "gpt-6-astra", Label: "GPT-6-Astra", Efforts: ultra, DefaultEffort: "medium"},
		{ID: "gpt-6-sol", Label: "GPT-6-Sol", Efforts: ultra, DefaultEffort: "medium"},
		{ID: "gpt-6-luna", Label: "GPT-6-Luna", Efforts: allEfforts, DefaultEffort: "medium"},
		{ID: "gpt-5.6-sol", Label: "GPT-5.6-Sol", Efforts: ultra, DefaultEffort: "low"},
	}}}
}

// D352: a Codex task's Switch who does it shows the models Codex lists now,
// the new ones among them, with no Ducter release; a pick switches in place.
// A task on a model past the row's eight still shows it, chosen.
func TestSwitchInPlaceNewCodexModels(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		L := app.L
		app.OpenTask("t_asc") // Codex, on its own default model
		app.Receive(protocol.ServerFrame{T: "task_new_options", Models: codex062()})
		app.Receive(protocol.ServerFrame{T: "candidates", TaskID: "t_asc", Candidates: []protocol.Candidate{
			{Harness: "codex", Current: true, Reason: protocol.CandidateReason{Kind: "current"}},
			{Harness: "claude-code", Model: "opus", Reason: protocol.CandidateReason{Kind: "fit"}},
		}})
		app.lo.switchFor = "t_asc"
		tt.Frame()
		for _, s := range []string{"GPT-6.2-Sol", "GPT-6.2-Astra", "GPT-6.1 Terra", L.T("switch.tune.note", "Codex")} {
			if !hasText(tt, s) {
				t.Fatalf("%s: no %q in the switch sheet: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "switch-codex-062-"+string(lang))
		click(t, tt, "GPT-6.2-Sol")
		sw, ok := lastFrame[protocol.TaskSwitch](sent)
		if !ok || sw.Harness != "codex" || sw.Model != "gpt-6.2-sol" || sw.Effort != "" || sw.TaskID != "t_asc" {
			t.Fatalf("%s: the new model in place: %+v", lang, sw)
		}

		// On a model the row leaves out (gpt-5.6-luna, ninth): still a chip, and chosen.
		app.S.Tasks["t_asc"].Card.Model = "gpt-5.6-luna"
		tt.Frame()
		if !hasText(tt, modelLabel(app.trayHarness("codex"), "gpt-5.6-luna")) {
			t.Fatalf("%s: the model it's on is missing: %q", lang, tt.Texts())
		}
	}
}
