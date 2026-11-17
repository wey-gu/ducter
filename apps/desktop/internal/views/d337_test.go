package views

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// D337 (1): the own-number setup rests folded until it is opened or started;
// what the home finds by itself is not a start. The web's rule is the same
// (apps/web/test/d337.test.ts).
func TestOwnStarted(t *testing.T) {
	var fresh protocol.OwnPhoneView
	if err := json.Unmarshal([]byte(`{"station":true,"adb":true,"number":"+8613912345678","headset":"unknown","audio":{"inputs":["MacBook Air Microphone"],"outputs":["MacBook Air Speakers"],"input":"MacBook Air Microphone","output":"MacBook Air Speakers","tool":true},"test":{"state":"never"}}`), &fresh); err != nil {
		t.Fatal(err)
	}
	if ownStarted(&fresh) {
		t.Error("adb, the saved number and the guessed speakers are not a start")
	}
	for name, f := range map[string]func(v *protocol.OwnPhoneView){
		"phone": func(v *protocol.OwnPhoneView) { _ = json.Unmarshal([]byte(`{"phone":{"state":"unauthorized"}}`), v) },
		"key":   func(v *protocol.OwnPhoneView) { v.Voice.Key = true },
		"test":  func(v *protocol.OwnPhoneView) { v.Test.State = "failed" },
		"ready": func(v *protocol.OwnPhoneView) { v.Ready = true },
		"busy":  func(v *protocol.OwnPhoneView) { v.Busy = true },
	} {
		v := fresh
		f(&v)
		if !ownStarted(&v) {
			t.Errorf("%s: a start", name)
		}
	}
}

// D337 (2): on a Mac home the app's check and the home's are one Ducter's:
// the latest says how it stands.
func TestHomeAnswerNewer(t *testing.T) {
	failed := time.Date(2026, 11, 17, 10, 0, 0, 0, time.UTC)
	st := update.Status{State: update.Failed, Reason: update.ReasonFeed, CheckedAt: failed.Add(-time.Hour), TriedAt: failed}
	at := func(t time.Time) string { return t.Format(time.RFC3339) }
	if !homeAnswerNewer(st, &protocol.DeviceUpdate{Latest: "0.0.68", CheckedAt: at(failed.Add(time.Minute))}) {
		t.Error("the home's answer after the failed read wins")
	}
	if homeAnswerNewer(st, &protocol.DeviceUpdate{Latest: "0.0.68", CheckedAt: at(failed.Add(-7 * time.Minute))}) {
		t.Error("the failed read after the home's answer stands")
	}
	if homeAnswerNewer(st, &protocol.DeviceUpdate{Latest: "0.0.69", Available: true, CheckedAt: at(failed.Add(time.Minute))}) {
		t.Error("a newer version on the home is its own row's news")
	}
	ok := update.Status{State: update.UpToDate, CheckedAt: failed}
	if homeAnswerNewer(ok, &protocol.DeviceUpdate{Latest: "0.0.68", CheckedAt: at(failed.Add(time.Minute))}) {
		t.Error("an answered app check says itself")
	}
	if homeAnswerNewer(st, nil) {
		t.Error("no home here: the app's own line")
	}
}
