package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/voice"
)

// D305: hold to talk and Read aloud, with a fake recognizer and a fake
// voice: no microphone or speaker is ever touched.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/d305/mac go test ./internal/views -run Voice

type voiceRig struct {
	app *App
	tt  *ui.Tester
	rec *voice.Fake
	spk *voice.FakeSpeaker
	now *time.Time
	snt *[]any
}

func voiceApp(t *testing.T, lang i18n.Lang, asked bool) *voiceRig {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.Local = hints.Open(t.TempDir())
	if asked {
		app.Local.SetVoiceAsked()
	}
	now := time.Date(2026, 11, 17, 9, 30, 0, 0, time.Local)
	app.Now = func() time.Time { return now }
	rec, spk := voice.NewFake(), &voice.FakeSpeaker{}
	app.Voice, app.Speaker = rec, spk
	user := map[i18n.Lang]string{i18n.ZH: "今天下午帮我看看 HawDB 的 CI 为什么慢了", i18n.EN: "Can you look at why HawDB's CI got slow this afternoon?"}[lang]
	reply := map[i18n.Lang]string{
		i18n.ZH: "看了：**集成测试**这周多跑了两轮，平均从 18 分钟涨到 26 分钟。要我把那两轮拆出去吗？",
		i18n.EN: "I looked: the **integration tests** ran two extra rounds this week, so the average went from 18 to 26 minutes. Want me to split those two out?",
	}[lang]
	ts := now.UTC().Format(time.RFC3339Nano)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: user}),
		protocol.NewEvent(2, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: reply, ReplyTo: 1}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return &voiceRig{app: app, tt: tt, rec: rec, spk: spk, now: &now, snt: sent}
}

func (r *voiceRig) mic(t *testing.T) (float32, float32) {
	t.Helper()
	label := r.app.L.T("voice.hold.key", r.app.L.T("voice.settings.key.ropt"))
	b, ok := r.tt.Find(label)
	if !ok {
		t.Fatalf("no mic %q in %v", label, r.tt.Texts())
	}
	return b.X + b.W/2, b.Y + b.H/2
}

func (r *voiceRig) frames() {
	for i := 0; i < 3; i++ {
		r.tt.Frame()
	}
}

// hold presses the mic, hears words, slides by (dx, dy) and lets go after d.
func (r *voiceRig) hold(t *testing.T, heard string, dx, dy float32, d time.Duration, release bool) {
	t.Helper()
	x, y := r.mic(t)
	r.tt.Press(x, y)
	r.frames()
	r.rec.SetLevel(0.7)
	r.rec.Hear(heard)
	r.tt.Move(x+dx/2, y+dy/2)
	r.tt.Move(x+dx, y+dy)
	*r.now = r.now.Add(d)
	r.frames()
	if release {
		r.tt.Release(x+dx, y+dy)
		r.frames()
	}
}

func sends(sent *[]any) []string {
	var out []string
	for _, f := range *sent {
		if s, ok := f.(protocol.Send); ok && s.T == "send" {
			out = append(out, s.Text)
		}
	}
	return out
}

func TestVoiceHoldPutsWordsInTheComposer(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		r := voiceApp(t, lang, true)
		r.app.draft = map[i18n.Lang]string{i18n.ZH: "顺便", i18n.EN: "Also,"}[lang]
		heard := map[i18n.Lang]string{i18n.ZH: "把周报也发我一份", i18n.EN: "send me the weekly report"}[lang]
		r.hold(t, heard, 0, 0, time.Second, false)
		if !r.rec.Listening || r.app.vox.phase != "listen" {
			t.Fatalf("%s: not listening (%q)", lang, r.app.vox.phase)
		}
		if !r.tt.HasText(heard) || !r.tt.HasText(r.app.L.T("voice.release")) {
			t.Errorf("%s: the strip lacks the words or its line: %v", lang, r.tt.Texts())
		}
		if r.rec.Locale != map[i18n.Lang]string{i18n.ZH: "zh-CN", i18n.EN: "en-US"}[lang] {
			t.Errorf("%s: listened in %q", lang, r.rec.Locale)
		}
		x, y := r.mic(t)
		r.tt.Release(x, y)
		r.frames()
		want := map[i18n.Lang]string{i18n.ZH: "顺便把周报也发我一份", i18n.EN: "Also, send me the weekly report"}[lang]
		if r.app.draft != want {
			t.Errorf("%s: draft %q, want %q", lang, r.app.draft, want)
		}
		if got := sends(r.snt); len(got) != 0 {
			t.Errorf("%s: letting go sent %v", lang, got)
		}
		if r.rec.Listening {
			t.Errorf("%s: still listening after letting go", lang)
		}
	}
}

func TestVoiceSlideUpSendsAndLeftDrops(t *testing.T) {
	r := voiceApp(t, i18n.EN, true)
	r.hold(t, "ship the release notes", 0, -80, time.Second, false)
	if r.app.vox.intent != voice.Send || !r.tt.HasText(r.app.L.T("voice.release.send")) {
		t.Fatalf("slid up: intent %q", r.app.vox.intent)
	}
	x, y := r.mic(t)
	r.tt.Release(x, y-80)
	r.frames()
	if got := sends(r.snt); len(got) != 1 || got[0] != "ship the release notes" {
		t.Errorf("slide up sent %v", got)
	}
	if r.app.draft != "" {
		t.Errorf("draft %q after sending", r.app.draft)
	}
	r.hold(t, "never mind", -100, 0, time.Second, true)
	if got := sends(r.snt); len(got) != 1 {
		t.Errorf("slide left sent %v", got)
	}
	if r.app.draft != "" || r.rec.Listening {
		t.Errorf("slide left left %q, listening %v", r.app.draft, r.rec.Listening)
	}
}

func TestVoiceTapShowsHowAndEmptySaysSo(t *testing.T) {
	r := voiceApp(t, i18n.ZH, true)
	r.hold(t, "", 0, 0, 100*time.Millisecond, true)
	if !r.tt.HasText(r.app.L.T("voice.tap")) {
		t.Errorf("a tap shows no hint: %v", r.tt.Texts())
	}
	*r.now = r.now.Add(3 * time.Second)
	r.frames()
	if r.tt.HasText(r.app.L.T("voice.tap")) {
		t.Errorf("the hint stays")
	}
	r.hold(t, "", 0, 0, time.Second, true)
	if !r.tt.HasText(r.app.L.T("voice.empty")) || r.app.draft != "" {
		t.Errorf("nothing heard: %q, %v", r.app.draft, r.tt.Texts())
	}
}

func TestVoiceFirstHoldAsksThenTheSystem(t *testing.T) {
	r := voiceApp(t, i18n.ZH, false)
	r.rec.Avail.Mic, r.rec.Avail.Speech = voice.Ask, voice.Ask
	r.hold(t, "", 0, 0, time.Second, true)
	for _, k := range []string{"voice.ask.title", "voice.ask.why", "voice.privacy.device", "voice.ask.go"} {
		if !r.tt.HasText(r.app.L.T(k)) {
			t.Errorf("the first card lacks %s", k)
		}
	}
	if r.rec.Starts != 0 {
		t.Fatalf("listened before asking")
	}
	if err := r.tt.Click(r.app.L.T("voice.ask.go")); err != nil {
		t.Fatal(err)
	}
	r.frames()
	if r.rec.Avail.Mic != voice.Granted || !r.app.Local.VoiceAsked() || !r.tt.HasText(r.app.L.T("voice.tap")) {
		t.Errorf("after asking: %+v, asked %v", r.rec.Avail, r.app.Local.VoiceAsked())
	}
}

func TestVoiceDeniedAndUnavailable(t *testing.T) {
	r := voiceApp(t, i18n.EN, true)
	r.rec.Avail = voice.Availability{Why: voice.WhyMic, Mic: voice.Denied, Speech: voice.Granted}
	r.hold(t, "", 0, 0, time.Second, true)
	if !r.tt.HasText(r.app.L.T("voice.denied.mic")) {
		t.Fatalf("denied: %v", r.tt.Texts())
	}
	if err := r.tt.Click(r.app.L.T("voice.denied.open")); err != nil {
		t.Fatal(err)
	}
	r.frames()
	if u := r.tt.OpenedURLs(); len(u) != 1 || !strings.Contains(u[0], "Privacy_Microphone") {
		t.Errorf("opened %v", u)
	}
	r.rec.Avail = voice.Availability{Why: voice.WhyLang}
	r.app.vox.phase = ""
	r.hold(t, "", 0, 0, time.Second, true)
	if !r.tt.HasText(r.app.L.T("voice.off")) || !r.tt.HasText(r.app.L.T("voice.why.lang", "English")) {
		t.Errorf("unavailable: %v", r.tt.Texts())
	}
}

func TestVoiceRightOptionHoldsToTalk(t *testing.T) {
	r := voiceApp(t, i18n.EN, true)
	r.tt.CodeDown(ui.Alt, ui.CodeAltRight)
	r.frames()
	if !r.rec.Listening || !r.app.vox.byKey {
		t.Fatalf("right Option didn't listen")
	}
	r.rec.Hear("check the deploy")
	*r.now = r.now.Add(time.Second)
	r.frames()
	if !r.tt.HasText(r.app.L.T("voice.cue.key", "Right Option")) {
		t.Errorf("the key's line: %v", r.tt.Texts())
	}
	r.tt.CodeUp(0, ui.CodeAltRight)
	r.frames()
	if r.app.draft != "check the deploy" {
		t.Errorf("draft %q", r.app.draft)
	}
	// None: the key does nothing.
	r.app.Local.SetVoiceKey("none")
	r.app.draft = ""
	r.tt.CodeDown(ui.Alt, ui.CodeAltRight)
	r.frames()
	if r.rec.Listening {
		t.Errorf("listened with no key chosen")
	}
	r.tt.CodeUp(0, ui.CodeAltRight)
}

func TestVoiceReadAloudAndReadBack(t *testing.T) {
	r := voiceApp(t, i18n.ZH, true)
	text := r.app.S.Channel[1].AI.Text
	r.app.readMenuTest(2, text)
	r.frames()
	if len(r.spk.Said) != 1 || strings.Contains(r.spk.Said[0], "**") || r.spk.Locales[0] != "zh-CN" {
		t.Fatalf("said %q in %v", r.spk.Said, r.spk.Locales)
	}
	if !r.tt.HasText(r.app.L.T("voice.read.stop")) {
		t.Errorf("no Stop while reading: %v", r.tt.Texts())
	}
	if err := r.tt.Click(r.app.L.T("voice.read.stop")); err != nil {
		t.Fatal(err)
	}
	r.frames()
	if r.spk.Speaking || r.app.vox.speaking != 0 {
		t.Errorf("still reading")
	}
	// No voice for the language: says so.
	r.spk.NoVoice = map[string]bool{"en-US": true}
	r.app.readAloud(nil, 9, "All good here.")
	if r.app.vox.speaking == 9 {
		t.Errorf("read with no voice")
	}
	// Read back: sent by voice, the next reply is read.
	r.app.Local.SetReadBack(true)
	r.hold(t, "那就拆出去", 0, -80, time.Second, true)
	if got := sends(r.snt); len(got) != 1 {
		t.Fatalf("sent %v", got)
	}
	n := len(r.spk.Said)
	ts := r.now.UTC().Format(time.RFC3339Nano)
	r.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(3, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "那就拆出去"}),
		protocol.NewEvent(4, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "好，我这就拆。", ReplyTo: 3}),
	}})
	r.frames()
	if len(r.spk.Said) != n+1 || r.spk.Said[n] != "好，我这就拆。" {
		t.Errorf("read back %q", r.spk.Said)
	}
}

func TestVoiceSettingsGroup(t *testing.T) {
	r := voiceApp(t, i18n.ZH, true)
	r.app.openTab(TabLook)
	r.tt.SetSize(1280, 1400)
	r.frames()
	for _, k := range []string{"voice.settings", "voice.settings.key", "voice.settings.key.ropt", "voice.settings.readback", "voice.privacy.device"} {
		if !r.tt.HasText(r.app.L.T(k)) {
			t.Errorf("Settings lacks %s", k)
		}
	}
	if err := r.tt.Click(r.app.L.T("voice.settings.key.fn")); err != nil {
		t.Fatal(err)
	}
	r.frames()
	if r.app.Local.VoiceKey() != "fn" || !r.tt.HasText(r.app.L.T("voice.settings.key.fn.help")) {
		t.Errorf("Fn: %q", r.app.Local.VoiceKey())
	}
}

// ---------- shots ----------

func voiceShot(t *testing.T, r *voiceRig, name string, lang i18n.Lang) {
	t.Helper()
	for _, mode := range []string{"light", "dark"} {
		r.app.Local.SetAppearance(mode)
		for i := 0; i < 6; i++ {
			r.frames()
			r.tt.Advance(200 * time.Millisecond)
		}
		r.frames()
		f, err := os.Create(filepath.Join(shotsDir(t), fmt.Sprintf("mac-%s-%s-%s.png", name, mode, lang)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, r.tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	r.app.Local.SetAppearance("system")
}

func TestVoiceShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		heard := map[i18n.Lang]string{i18n.ZH: "那就把那两轮拆出去，跑完告诉我", i18n.EN: "Then split those two out and tell me when it's done"}[lang]
		for _, s := range []struct {
			name   string
			dx, dy float32
		}{{"listening", 0, 0}, {"listening-send", 0, -80}, {"listening-drop", -100, 0}} {
			r := voiceApp(t, lang, true)
			r.tt.SetScale(2)
			r.tt.SetPreferences(ui.Preferences{}) // the meter's bars, the lean
			r.hold(t, heard, s.dx, s.dy, time.Second, false)
			voiceShot(t, r, s.name, lang)
		}
		r := voiceApp(t, lang, true)
		r.tt.SetScale(2)
		r.tt.CodeDown(ui.Alt, ui.CodeAltRight)
		r.rec.SetLevel(0.5)
		r.rec.Hear(heard)
		r.frames()
		voiceShot(t, r, "listening-key", lang)

		r = voiceApp(t, lang, true)
		r.tt.SetScale(2)
		r.app.draft = heard
		r.app.focusComposer = true
		voiceShot(t, r, "in-the-box", lang)

		r = voiceApp(t, lang, false)
		r.tt.SetScale(2)
		r.rec.Avail.Mic, r.rec.Avail.Speech = voice.Ask, voice.Ask
		r.hold(t, "", 0, 0, time.Second, true)
		voiceShot(t, r, "first-use", lang)

		r = voiceApp(t, lang, true)
		r.tt.SetScale(2)
		r.rec.Avail = voice.Availability{Why: voice.WhyMic, Mic: voice.Denied}
		r.hold(t, "", 0, 0, time.Second, true)
		voiceShot(t, r, "denied", lang)

		r = voiceApp(t, lang, true)
		r.tt.SetScale(2)
		r.rec.Avail = voice.Availability{Why: voice.WhyMac}
		r.hold(t, "", 0, 0, time.Second, true)
		voiceShot(t, r, "unavailable", lang)

		r = voiceApp(t, lang, true)
		r.tt.SetScale(2)
		if err := r.tt.RightClick(autospace(r.app.S.Channel[1].AI.Text[:6])); err == nil {
			r.frames()
			t.Logf("%s menu: %v", lang, r.tt.Menu())
			r.tt.CloseMenu()
		}
		r.app.readMenuTest(2, r.app.S.Channel[1].AI.Text)
		voiceShot(t, r, "reading", lang)

		r = voiceApp(t, lang, true)
		r.tt.SetScale(2)
		r.app.openTab(TabLook)
		r.tt.SetSize(1280, 1500)
		voiceShot(t, r, "settings-voice", lang)
	}
}

// readMenuTest is Read aloud chosen on message seq.
func (a *App) readMenuTest(seq int64, text string) { a.readAloud(nil, seq, text) }

func TestVoiceReadAloudInTheMenu(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		r := voiceApp(t, lang, true)
		var label string
		for _, s := range r.tt.Texts() {
			if strings.Contains(s, map[i18n.Lang]string{i18n.ZH: "两轮", i18n.EN: "two extra"}[lang]) {
				label = s
			}
		}
		if label == "" {
			t.Fatalf("%s: no reply in %v", lang, r.tt.Texts())
		}
		if err := r.tt.RightClick(label); err != nil {
			t.Fatal(err)
		}
		if err := r.tt.ChooseMenuItem(r.app.L.T("voice.read")); err != nil {
			t.Fatalf("%s: %v in %v", lang, err, r.tt.Menu())
		}
		r.frames()
		if len(r.spk.Said) != 1 || r.app.vox.speaking != 2 {
			t.Errorf("%s: said %v", lang, r.spk.Said)
		}
	}
}
