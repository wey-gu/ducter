package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D442: 放手说 / Talk hands-free on the Mac with a fake recognizer, a fake
// voice and a fake clock: scripted turns, the spoken reply, cutting in, a
// card answered by voice, the floor kept a tap, a quiet minute, End.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/talk-mode/mac go test ./internal/views -run TalkShots

func talkRig(t *testing.T, lang i18n.Lang) *voiceRig {
	t.Helper()
	r := voiceApp(t, lang, true)
	r.app.Local.SetTalkAsked()
	return r
}

// wait lets ms pass, a frame every 200 ms (the talk's tick).
func (r *voiceRig) wait(ms int) {
	for n := 0; n < ms; n += 200 {
		*r.now = r.now.Add(200 * time.Millisecond)
		r.tt.Frame()
	}
}

// tapMic taps the microphone (a press shorter than a hold).
func (r *voiceRig) tapMic(t *testing.T) {
	t.Helper()
	label := r.app.L.T("voice.hold.key", r.app.L.T("voice.settings.key.ropt"))
	if r.app.hf.on {
		label = r.app.L.T("talk.end")
	}
	b, ok := r.tt.Find(label)
	if !ok {
		t.Fatalf("no mic %q in %v", label, r.tt.Texts())
	}
	x, y := b.X+b.W/2, b.Y+b.H/2
	r.tt.Press(x, y)
	r.frames()
	*r.now = r.now.Add(100 * time.Millisecond)
	r.tt.Release(x, y)
	r.frames()
}

func (r *voiceRig) event(seq int64, kind string, body any) {
	ts := r.now.UTC().Format(time.RFC3339Nano)
	r.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{protocol.NewEvent(seq, ts, "default", "channel", protocol.OriginPartner, kind, body)}})
	r.frames()
}

func decides(sent *[]any) []protocol.Decide {
	var out []protocol.Decide
	for _, f := range *sent {
		if d, ok := f.(protocol.Decide); ok {
			out = append(out, d)
		}
	}
	return out
}

func TestTalkTurnsReplyAndCutIn(t *testing.T) {
	r := talkRig(t, i18n.ZH)
	r.tapMic(t)
	if !r.app.hf.on || !r.rec.Listening || r.rec.Locale != "zh-CN" {
		t.Fatalf("a tap didn't start the talk (on %v, listening %v)", r.app.hf.on, r.rec.Listening)
	}
	if !r.tt.HasText(r.app.L.T("talk.listening")) || !r.tt.HasText(r.app.L.T("talk.end")) {
		t.Errorf("no talk panel: %v", r.tt.Texts())
	}
	r.rec.Hear("牛腩要炖")
	r.wait(400)
	r.rec.Hear("牛腩要炖多久")
	r.wait(600)
	if got := sends(r.snt); len(got) != 0 {
		t.Fatalf("sent inside the quiet gap: %v", got)
	}
	r.wait(1000)
	if got := sends(r.snt); len(got) != 1 || got[0] != "牛腩要炖多久" {
		t.Fatalf("the turn went as %v", got)
	}
	if !r.tt.HasText(r.app.L.T("talk.thinking")) {
		t.Errorf("not thinking: %v", r.tt.Texts())
	}
	r.event(4, protocol.KindAIMsg, protocol.AIMsg{Text: "小火炖一个半小时，筷子能轻松戳透就好。", ReplyTo: 3})
	if len(r.spk.Said) == 0 || r.spk.Said[len(r.spk.Said)-1] != "小火炖一个半小时，筷子能轻松戳透就好。" {
		t.Fatalf("the reply wasn't said: %v", r.spk.Said)
	}
	// Its own echo is not a turn; talking over it is.
	r.rec.Hear("小火炖一个半小时")
	r.frames()
	if !r.spk.Speaking {
		t.Fatalf("the echo stopped the voice")
	}
	r.rec.Hear("小火炖一个半小时等等那土豆呢")
	r.frames()
	if r.spk.Speaking {
		t.Fatalf("talking over it didn't stop the voice")
	}
	r.wait(1400)
	if got := sends(r.snt); len(got) != 2 || got[1] != "等等那土豆呢" {
		t.Errorf("the cut-in went as %v", got)
	}
	r.tapMic(t)
	if r.app.hf.on || r.rec.Listening {
		t.Errorf("a second tap didn't end it")
	}
}

func TestTalkCardByVoiceAndTheFloor(t *testing.T) {
	r := talkRig(t, i18n.ZH)
	r.tapMic(t)
	r.event(5, protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: "一个半小时后提醒你关火？", GoLabel: "提醒我", DefaultOption: "hold", Reversible: true})
	if len(r.spk.Said) != 1 || r.spk.Said[0] != "一个半小时后提醒你关火？说「好」，或者「先等等」。" {
		t.Fatalf("the card wasn't asked: %v", r.spk.Said)
	}
	if !r.tt.HasText(r.app.L.T("talk.yes")) || !r.tt.HasText(r.app.L.T("talk.no")) {
		t.Errorf("the card's answers aren't shown: %v", r.tt.Texts())
	}
	r.spk.Finish()
	r.frames()
	r.rec.Hear("好")
	r.wait(1400)
	if d := decides(r.snt); len(d) != 1 || d[0].DecisionID != "d1" || d[0].Option != "go" {
		t.Fatalf("好 didn't answer the card: %+v", d)
	}
	r.spk.Finish()
	r.frames()
	r.event(6, protocol.KindDecision, protocol.Decision{DecisionID: "p1", Question: "付 ¥73 买周六 8:05 去杭州的车票？", GoLabel: "付款", DefaultOption: "hold",
		Pay: &protocol.PayAsk{Site: "kyfw.12306.cn", Amount: "73.00", Currency: "CNY", Card: "Visa ••4242", Last4: "4242"}})
	if last := r.spk.Said[len(r.spk.Said)-1]; last != "付 ¥73 买周六 8:05 去杭州的车票？这个要你在屏幕上点一下。" {
		t.Fatalf("the pay card was said as %q", last)
	}
	if !r.tt.HasText(r.app.L.T("talk.floor.show")) || r.app.hf.card == nil || !r.app.hf.card.floor {
		t.Errorf("the floor card shows a Go: %v", r.tt.Texts())
	}
	// D446: the question and the floor line are on the card, once each, not again above it.
	shownOnce := func(when string) {
		t.Helper()
		r.frames()
		for _, s := range []string{"付 ¥73 买周六 8:05 去杭州的车票？", r.app.L.T("talk.floor")} {
			// In the talk's panel (after its label), not the conversation under it.
			n, in := 0, false
			for _, x := range r.tt.Texts() {
				in = in || x == r.app.L.T("talk.name")
				if in {
					n += strings.Count(x, s)
				}
			}
			if n != 1 {
				t.Errorf("%s: %q shown %d times: %v", when, s, n, r.tt.Texts())
			}
		}
	}
	shownOnce("asked")
	r.spk.Finish()
	r.frames()
	r.rec.Hear("好")
	r.wait(1400)
	shownOnce("好 to it")
	if d := decides(r.snt); len(d) != 1 {
		t.Fatalf("好 paid: %+v", d)
	}
	if got := sends(r.snt); len(got) != 0 {
		t.Errorf("好 to a pay card was sent as %v", got)
	}
}

func TestTalkQuietMinuteAndThatsAll(t *testing.T) {
	r := talkRig(t, i18n.EN)
	r.tapMic(t)
	r.wait(60_200)
	if n := len(r.spk.Said); n == 0 || r.spk.Said[n-1] != "I'll stop listening now." {
		t.Fatalf("a quiet minute said %v", r.spk.Said)
	}
	r.spk.Finish()
	r.frames()
	if r.app.hf.on || r.rec.Listening {
		t.Fatalf("still talking after the quiet minute")
	}
	if !r.tt.HasText(r.app.L.T("talk.ended.quiet")) {
		t.Errorf("no line after it stopped: %v", r.tt.Texts())
	}
	r.wait(3000)
	r.tapMic(t)
	r.rec.Hear("That's all.")
	r.wait(1400)
	if r.app.hf.on || len(sends(r.snt)) != 0 {
		t.Errorf("that's all: on %v, sent %v", r.app.hf.on, sends(r.snt))
	}
}

func TestTalkFirstTapAsks(t *testing.T) {
	r := voiceApp(t, i18n.ZH, true)
	r.tapMic(t)
	if r.app.hf.on || r.rec.Listening || !r.tt.HasText(r.app.L.T("talk.ask.title")) {
		t.Fatalf("the first tap listened or showed no card: %v", r.tt.Texts())
	}
	if err := r.tt.Click(r.app.L.T("talk.ask.go")); err != nil {
		t.Fatalf("no Start: %v", err)
	}
	r.frames()
	if !r.app.hf.on || !r.rec.Listening || !r.app.Local.TalkAsked() {
		t.Errorf("Start didn't begin the talk")
	}
}

func TestTalkShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		w := func(a, b string) string {
			if zh {
				return a
			}
			return b
		}
		{
			sfx := ""
			setup := func() *voiceRig {
				r := talkRig(t, lang)
				r.tt.SetScale(2)
				r.tt.SetPreferences(ui.Preferences{ReduceMotion: true})
				r.tapMic(t)
				return r
			}
			r := setup()
			r.rec.SetLevel(0.6)
			r.rec.Hear(w("牛腩要炖多久才烂", "How long should the stew simmer"))
			r.frames()
			voiceShot(t, r, "talk-listening"+sfx, lang)
			r.wait(1400)
			voiceShot(t, r, "talk-thinking"+sfx, lang)
			r.event(4, protocol.KindAIMsg, protocol.AIMsg{Text: w("小火炖一个半小时，筷子能轻松戳透就好。最后二十分钟放土豆。", "Simmer for an hour and a half, until a chopstick goes through easily. Potatoes for the last twenty minutes."), ReplyTo: 3})
			voiceShot(t, r, "talk-speaking"+sfx, lang)
			r.spk.Finish()
			r.event(5, protocol.KindDecision, protocol.Decision{DecisionID: "d1", Question: w("一个半小时后提醒你关火？", "Remind you to turn off the stew in an hour and a half?"), GoLabel: w("提醒我", "Remind me"), DefaultOption: "hold", Reversible: true})
			voiceShot(t, r, "talk-card"+sfx, lang)
			r = setup()
			r.event(6, protocol.KindDecision, protocol.Decision{DecisionID: "p1", Question: w("付 ¥73 买周六 8:05 去杭州的车票？", "Pay ¥73 for the 8:05 to Hangzhou on Saturday?"), GoLabel: w("付款", "Pay"), DefaultOption: "hold",
				Pay: &protocol.PayAsk{Site: "kyfw.12306.cn", Amount: "73.00", Currency: "CNY", Card: "Visa ••4242", Last4: "4242"}})
			voiceShot(t, r, "talk-floor"+sfx, lang)
		}
		r := voiceApp(t, lang, true)
		r.tt.SetScale(2)
		r.tapMic(t)
		voiceShot(t, r, "talk-first", lang)
	}
}
