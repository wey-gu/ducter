package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D280: Android's prompt to allow a recording is the person's turn, said on
// the Mac in their language, with only 不录了 / Skip recording.
func TestHandsetRecordCardWords(t *testing.T) {
	d := &store.DecisionState{Decision: protocol.Decision{Question: "在 Pixel Fold · Ducter 上点「立即开始」，它才能录屏", Handset: &protocol.HandsetAsk{Kind: "record", Device: "p1", Name: "Pixel Fold · Ducter", Until: "2026-11-16T20:16:00Z"}}}
	zh, _ := iaApp(t, i18n.ZH)
	if q, h := zh.questionOf(d), zh.holdLabel(d); q != "在 Pixel Fold 上点「立即开始」，它才能录屏" || h != "不录了" {
		t.Errorf("zh %q / %q", q, h)
	}
	en, _ := iaApp(t, i18n.EN)
	if q, h := en.questionOf(d), en.holdLabel(d); q != "Tap Start now on Pixel Fold so it can record the screen" || h != "Skip recording" {
		t.Errorf("en %q / %q", q, h)
	}
}

// D280: a loan's end is a hairline named by the phone (the port of toldOf).
func TestToldLoanEnded(t *testing.T) {
	for _, c := range []struct{ text, say string }{
		{"Your loan of Pixel Fold ended: the user took it back with Stop (停下). The phone was returned to them.", "taken_back"},
		{"Your loan of Pixel Fold ended: the user locked it, and locking gives it back.", "taken_back"},
		{"Your loan of Pixel Fold ended: Android's switch for Ducter went off on it.", "taken_back"},
		{"Your loan of Pixel Fold ended: you gave it back. The phone was returned to the user.", "given_back"},
		{"Your loan of Pixel Fold ended: the task finished, and the phone was returned to the user.", "given_back"},
		{"Your loan of Pixel Fold ended: it didn't answer for 15 s.", "loan_lost"},
	} {
		say, name, ok := toldOf(c.text, "ducter")
		if !ok || say != c.say || name != "Pixel Fold" {
			t.Errorf("%q: %q %q %v", c.text, say, name, ok)
		}
	}
	zh, _ := iaApp(t, i18n.ZH)
	if s := zh.L.T("told.taken_back", "Pixel Fold"); s != "你收回了 Pixel Fold" { // D291: its time is drawn apart
		t.Errorf("zh %q", s)
	}
}
