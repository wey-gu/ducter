package views

// D652: 改 and 忘掉 on Settings › 记忆 are answered only after Nowledge Mem did. At 1150, in
// zh and en: the row waits (no said line), a refusal is one line in the failed ink with D590's why
// and the row as it was, and a success is the partner's said line.

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func TestMemDoneAt1150(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := memApp(t, lang, "on")
		app.openTab(TabMemory)
		tt := ui.NewTesterWith(app.View, 1150, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		L := app.L
		first := memAbout(lang)[0]
		said := L.T("said.mem.forget", first.Title)

		// Open the row, ask to forget, confirm: it waits for Mem and says nothing yet.
		if err := tt.Click(first.Title); err != nil {
			t.Fatalf("%s: open: %v in %q", lang, err, tt.Texts())
		}
		tt.Frame()
		if err := tt.Click(spoken(L, L.T("partner.memory.forget"), first.Title)); err != nil {
			t.Fatalf("%s: forget: %v", lang, err)
		}
		tt.Frame()
		if err := tt.Click(spoken(L, L.T("partner.memory.forget"), first.Title)); err != nil {
			t.Fatalf("%s: confirm: %v", lang, err)
		}
		tt.Frame()
		if !hasText(tt, L.T("mem.done.wait")) {
			t.Fatalf("%s: no waiting line after the tap: %q", lang, tt.Texts())
		}
		if hasText(tt, said) {
			t.Fatalf("%s: said %q before Mem answered", lang, said)
		}

		// Mem refused: one line in the failed ink, why in D590's words, and the row as it was.
		app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: first.ID, Op: "forget", OK: false, Why: "signed_out"}})
		tt.Frame()
		fail := L.T("mem.done.failed.forget", L.T("mem.done.why.signed_out"))
		if !hasText(tt, fail) {
			t.Fatalf("%s: no failed line %q in %q", lang, fail, tt.Texts())
		}
		if !hasText(tt, autospace(first.Title)) {
			t.Fatalf("%s: the row left after a refusal: %q", lang, tt.Texts())
		}
		if hasText(tt, said) {
			t.Fatalf("%s: said %q for a refused change", lang, said)
		}

		// Mem took a correction: the said line, only now.
		second := memAbout(lang)[1]
		if err := tt.Click(second.Title + ", " + L.T("mem.by.tool", "Codex")); err != nil {
			// A said row has no source line; fall back to its title alone.
			if err := tt.Click(second.Title); err != nil {
				t.Fatalf("%s: open the second row: %v in %q", lang, err, tt.Texts())
			}
		}
		tt.Frame()
		if err := tt.Click(spoken(L, L.T("learned.fix"), second.Title)); err != nil {
			t.Fatalf("%s: fix: %v", lang, err)
		}
		tt.Frame()
		app.memPage.fixText = "Chat in Chinese"
		if err := tt.Click(spoken(L, L.T("learned.save"), second.Title)); err != nil {
			t.Fatalf("%s: save: %v", lang, err)
		}
		tt.Frame()
		if !hasText(tt, L.T("mem.done.wait")) {
			t.Fatalf("%s: no waiting line after save: %q", lang, tt.Texts())
		}
		app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: second.ID, Op: "fix", OK: true, Title: "Chat in Chinese"}})
		tt.Frame()
		if !hasText(tt, L.T("said.mem.fix", "Chat in Chinese")) {
			t.Fatalf("%s: no said line after Mem took it: %q", lang, tt.Texts())
		}
	}
}

// D652: 这条不对 carries the memory's id on the message itself (the person's tap is the claim,
// not something the model has to repeat).
func TestCorrectMemoryCarriesTheId(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.correctMemory("m_p1", "喜欢先看结论，细节放后面")
	s := (*sent)[len(*sent)-1].(protocol.Send)
	if s.Corrects != "m_p1" {
		t.Fatalf("这条不对 sent %+v", s)
	}
	if !strings.Contains(s.Text, "m_p1") {
		t.Fatalf("the words don't name it: %q", s.Text)
	}
}
