package views

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D282: in the opened task's Switch who does it, the agent doing it lists
// its own models and efforts; a pick switches in place (the same agent, its
// session carries on), and the transcript says it with one hairline and its
// time.
func TestSwitchInPlace(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := newTaskApp(t, lang)
		L := app.L
		app.OpenTask("t_newtask")
		models := tuneModels()
		models[0].Device = "" // one computer
		app.Receive(protocol.ServerFrame{T: "task_new_options", Models: models})
		app.Receive(protocol.ServerFrame{T: "candidates", TaskID: "t_newtask", Candidates: []protocol.Candidate{
			{Harness: "claude-code", Model: "opus", Current: true, Reason: protocol.CandidateReason{Kind: "current"}},
			{Harness: "codex", Reason: protocol.CandidateReason{Kind: "fit"}},
		}})
		app.lo.switchFor = "t_newtask"
		tt.Frame()
		for _, s := range []string{L.T("newtask.model"), "Sonnet 5.5", L.T("newtask.effort"), L.T("switch.tune.note", "Claude Code")} {
			if !hasText(tt, s) {
				t.Fatalf("%s: no %q in the switch sheet: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "switch-tune-"+string(lang))
		click(t, tt, "Sonnet 5.5")
		sw, ok := lastFrame[protocol.TaskSwitch](sent)
		if !ok || sw.Harness != "claude-code" || sw.Model != "sonnet" || sw.Effort != "" || sw.TaskID != "t_newtask" {
			t.Fatalf("%s: the model in place: %+v", lang, sw)
		}
		click(t, tt, L.T("effort.high"))
		if sw, _ = lastFrame[protocol.TaskSwitch](sent); sw.Model != "opus" || sw.Effort != "high" {
			t.Fatalf("%s: the effort in place keeps its model: %+v", lang, sw)
		}

		// The hairlines: another model, another agent, with their time.
		task := app.S.Tasks["t_newtask"]
		at := time.Date(2026, 11, 16, 21, 40, 0, 0, time.Local).UTC().Format(time.RFC3339Nano)
		ts := protocol.TaskStream("t_newtask")
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(900, at, "default", ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_newtask", Role: "system", From: "runner", Text: "now on sonnet · high", Raw: []byte(`{"retuned":{"harness":"claude-code","model":"sonnet","effort":"high"}}`)}),
			protocol.NewEvent(901, at, "default", ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_newtask", Role: "system", From: "runner", Text: "moved from claude-code to codex", Raw: []byte(`{"switched":{"from":"claude-code","to":"codex"}}`)}),
		}})
		re, _ := noteBlock(app, `{"retuned":{"harness":"claude-code","model":"sonnet","effort":"high"}}`, 900)
		if got, want := app.switchLine(task, &re), L.T("note.retuned", L.T("who.name", "Sonnet 5.5" /* D355: the agent's own word for it, as on its chip */, L.T("effort.high"))); got != want {
			t.Errorf("%s: retuned: %q, want %q", lang, got, want)
		}
		sw2, _ := noteBlock(app, `{"switched":{"from":"claude-code","to":"codex"}}`, 901)
		want := map[i18n.Lang]string{i18n.ZH: "换成 Codex 接着做", i18n.EN: "Continued on Codex"}[lang] // D291: its time is drawn apart
		if got := app.switchLine(task, &sw2); got != want {
			t.Errorf("%s: switched: %q, want %q", lang, got, want)
		}
	}
}

// noteBlock is a runner line as the transcript reads it.
func noteBlock(_ *App, raw string, seq int64) (Block, bool) {
	b, ok := noteOf("", json.RawMessage(raw))
	b.K, b.Seq = "note", seq
	return b, ok
}
