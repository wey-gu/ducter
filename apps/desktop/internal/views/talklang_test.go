package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D292: the reply language is Follow me or any language, by its own name;
// the common ones are listed, the rest behind Other language….
func TestReplyLanguageAnyLanguage(t *testing.T) {
	app, sent := iaApp(t, i18n.EN)
	app.Status = 2 // client.Connected
	app.OpenPartner()
	f := settingsFrame()
	f.Settings.Language = "auto"
	app.Receive(f)
	// D307: the key, the hand-off and the records groups sit above it now.
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if err := tt.Click("How I talk, Same as yours"); err != nil {
		t.Fatalf("no reply-language pill: %v in %q", err, tt.Texts())
	}
	tt.Frame()
	for _, want := range []string{"한국어", "Español", "日本語", "Other language…"} {
		if !hasText(tt, want) {
			t.Errorf("the list lacks %q: %q", want, tt.Texts())
		}
	}
	if hasText(tt, "Svenska") {
		t.Errorf("a language from the rest shows before Other language…")
	}
	scrollTo := func(anchor, label string) {
		for i := 0; i < 6; i++ {
			if r, ok := tt.Find(anchor); ok {
				tt.Scroll(r.X+r.W/2, r.Y+r.H/2, 0, 200)
			}
			tt.Frame()
			if tt.Click(label) == nil {
				tt.Frame()
				return
			}
		}
		t.Fatalf("can't reach %q in the list: %q", label, tt.Texts())
	}
	scrollTo("Español", "Other language…")
	if !hasText(tt, "Svenska") {
		t.Fatalf("Other language… shows no rest: %q", tt.Texts())
	}
	scrollTo("Nederlands", "Svenska")
	set, ok := lastSent[protocol.SettingsSet](*sent)
	if !ok || set.Patch.Language != "sv" {
		t.Fatalf("picking Svenska sent %+v", set)
	}
	tt.Frame()
	// D424: the picker says it; no line under the row repeats it.
	if !hasText(tt, "Svenska") || hasText(tt, "Svenska 回") || hasText(tt, "answers in Svenska") {
		t.Errorf("a saved language from the rest doesn't show by its name: %q", tt.Texts())
	}
}

// D292: a task's words are checked against the report's language, not
// the window's: an English window with a Korean task keeps Korean words.
func TestTongueIsTheReports(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	task := &store.Task{ID: "t1", Open: &protocol.TaskOpen{TaskID: "t1", Language: "ko"}}
	if got := app.tongue(task); got != "ko" {
		t.Errorf("tongue = %q, want ko", got)
	}
	if got := app.proofLabel(task, protocol.EvidenceRef{Kind: "test", Label: "테스트 모두 통과", Ref: "bun test"}); got != "테스트 모두 통과" {
		t.Errorf("a Korean label for a Korean task: %q", got)
	}
	if got := app.tongue(nil); got != "en" {
		t.Errorf("no task, no messages: %q", got)
	}
}
