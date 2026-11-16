//go:build darwin

package voice

import (
	"os"
	"testing"

	"github.com/ebitengine/purego/objc"
)

// A look at the Mac's engines that never listens, speaks or asks: the
// recognizer and the voice are made for a locale and asked what they can do.
// Outside the bundle Can must say "mac" before touching any permission.
//
//	DUCTER_VOICE_PROBE=1 go test ./internal/voice -run Probe -v
func TestProbeSystem(t *testing.T) {
	if os.Getenv("DUCTER_VOICE_PROBE") == "" {
		t.Skip("DUCTER_VOICE_PROBE=1 to look at the Mac's engines")
	}
	if err := load(); err != nil {
		t.Fatal(err)
	}
	if a := NewSystem().Can("zh-CN"); a.Why != WhyMac || a.OK {
		t.Errorf("unbundled Can = %+v, want why mac", a)
	}
	p := pool()
	defer p.Send(sel("drain"))
	for _, loc := range []string{"zh-CN", "en-US", "ja-JP"} {
		r := recognizer(loc)
		if r == 0 {
			t.Errorf("%s: no recognizer", loc)
			continue
		}
		t.Logf("%s: on device %v, available %v", loc, objc.Send[bool](r, sel("supportsOnDeviceRecognition")), objc.Send[bool](r, sel("isAvailable")))
		r.Send(sel("release"))
		v := cls("AVSpeechSynthesisVoice").Send(sel("voiceWithLanguage:"), nsstr(loc))
		t.Logf("%s: voice %q", loc, gostr(v.Send(sel("name"))))
	}
	if r := recognizer("xx-XX"); r != 0 {
		t.Logf("xx-XX made a recognizer (macOS accepts any locale here)")
	}
}
