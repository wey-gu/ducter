package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D207 (the author's run on a hel home, 2026-11-11): what was sent in the
// opened task stayed in its composer after Enter.
func TestTaskComposerEmptiesOnSend(t *testing.T) {
	app, tt := tinycart(t, i18n.ZH, 3*time.Minute)
	app.OpenTask("t_fix")
	app.focusComposer = true
	tt.Frame()
	tt.Frame()
	tt.Type("再跑一遍测试")
	tt.Frame()
	if got := app.taskDrafts["t_fix"]; got != "再跑一遍测试" {
		t.Fatalf("typed into the task's composer: %q", got)
	}
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Frame()
	if got := app.taskDrafts["t_fix"]; got != "" {
		t.Errorf("the composer kept %q after Enter", got)
	}
	if n := len(app.S.Task("t_fix").Sends); n != 1 {
		t.Errorf("sent %d messages, want 1", n)
	}
	// A held message (it looks like a key) stays in the box until it is sent.
	app.focusComposer = true
	tt.Frame()
	tt.Type("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789")
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	if got := app.taskDrafts["t_fix"]; got == "" {
		t.Error("a held message left the composer before it was sent")
	}
}

// D207: the runner's own lines are said in the user's words, never in the
// English they were logged in; a receipt only when it says something.
func TestTaskNotesInWords(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := tinycart(t, lang, 3*time.Minute)
		now := time.Now().UTC().Format(time.RFC3339Nano)
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(900, now, "default", protocol.TaskStream("t_fix"), protocol.OriginSystem, protocol.KindTaskEvent,
				protocol.TaskEvent{TaskID: "t_fix", Role: "system", Text: "no report after one nudge; leaving the task idle (stall rule)", Raw: []byte(`{"stall":true}`)}),
			protocol.NewEvent(901, now, "default", protocol.TaskStream("t_fix"), protocol.OriginSystem, protocol.KindTaskEvent,
				protocol.TaskEvent{TaskID: "t_fix", Role: "system", From: "runner", Text: "recalled 2 from memory for the brief", Raw: []byte(`{"memory":"recall"}`)}),
		}})
		app.OpenTask("t_fix")
		tt.Frame()
		tt.Frame()
		all := texts(tt)
		for _, leak := range []string{"stall rule", "nudge", "recalled"} {
			if strings.Contains(all, leak) {
				t.Errorf("%s: internal words in the task: %q", lang, leak)
			}
		}
		want := map[i18n.Lang]string{i18n.ZH: "它停下了，没交回结果", i18n.EN: "It stopped without reporting back"}[lang]
		if !strings.Contains(all, want) {
			t.Errorf("%s: the stall isn't said as %q: %q", lang, want, all)
		}
		for _, old := range []string{"先停", "放下", "交代", "Drop"} {
			if strings.Contains(all, old) {
				t.Errorf("%s: an old word is still there: %q", lang, old)
			}
		}
	}
}
