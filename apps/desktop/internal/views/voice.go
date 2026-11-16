package views

// D305: voice in the conversation (design/voice.md). Hold the mic (or the
// key chosen in Settings) and speak; let go to put the words in the
// composer, slide up to send them at once, slide left to drop them. A
// partner's message can be read aloud in its own language. Both use the
// Mac's own engines (internal/voice); the home never hears the sound.

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/voice"
)

// voiceState is hold to talk and Read aloud on this window.
type voiceState struct {
	// phase: "" (nothing), "ask" (the first hold's card), "listen",
	// "denied", "off" (unavailable).
	phase, why, where string
	heard             string
	level             float64
	intent            voice.HoldIntent
	downX, downY      float32
	downAt            time.Time
	// byKey: listening while the chosen key is held (no slide).
	byKey bool
	gen   int
	// note is a passing line (voice.empty, voice.tap) until noteTill.
	note     string
	noteTill time.Time
	// filled is what voice last put in the draft: a send with it in is a
	// message sent by voice.
	filled string
	// readAfter: the next partner reply after this seq is read aloud
	// (the setting on, a message just sent by voice).
	readAfter int64
	// speaking is the seq of the message being read aloud.
	speaking int64
	asked    bool
}

const voiceNoteFor = 2400 * time.Millisecond

func (a *App) voiceLocale() string {
	return voice.SpeechLocale(a.talkLang(), a.PreferredLocales)
}

// voiceKeyName is the chosen key, as Settings says it.
func (a *App) voiceKeyName() string {
	switch a.Local.VoiceKey() {
	case "fn":
		return a.L.T("voice.settings.key.fn")
	case "none":
		return ""
	}
	return a.L.T("voice.settings.key.ropt")
}

// voiceBegin is a press of the mic (or the key): listen, or say why not.
func (a *App) voiceBegin(byKey bool, x, y float32) {
	vs := &a.vox
	if vs.phase == "listen" {
		return
	}
	if a.Voice == nil {
		vs.phase, vs.why = "off", voice.WhyMac
		return
	}
	loc := a.voiceLocale()
	av := a.Voice.Can(loc)
	vs.where = av.Where
	switch {
	case av.Why == voice.WhyMic || av.Why == voice.WhySpeech:
		vs.phase, vs.why = "denied", av.Why
		return
	case !av.OK:
		vs.phase, vs.why = "off", av.Why
		return
	case !vs.asked && !a.Local.VoiceAsked():
		vs.phase = "ask"
		return
	case av.Mic == voice.Ask || av.Speech == voice.Ask:
		a.voiceAsk()
		return
	}
	a.speakStop() // a voice reading while you talk would be heard
	vs.gen++
	g := vs.gen
	vs.phase, vs.why, vs.heard, vs.level, vs.intent, vs.note = "listen", "", "", 0, voice.Keep, ""
	vs.byKey, vs.downX, vs.downY, vs.downAt = byKey, x, y, a.Now()
	err := a.Voice.Start(loc, voice.Hearing{
		Partial: func(s string) {
			a.onUI(func() {
				if vs.gen == g {
					vs.heard = s
				}
			})
		},
		Final: func(s string) { a.onUI(func() { a.voiceFinal(g, s) }) },
		Level: func(l float64) {
			a.onUI(func() {
				if vs.gen == g {
					vs.level = voice.SmoothLevel(vs.level, l)
				}
			})
		},
		Error: func(why string) {
			a.onUI(func() {
				if vs.gen == g {
					vs.phase, vs.why = "off", why
				}
			})
		},
	})
	if err != nil {
		vs.phase, vs.why = "off", voice.Why(err)
	}
}

// voiceAsk asks macOS for the microphone and Speech Recognition (its own
// prompts), after the first hold's card said why.
func (a *App) voiceAsk() {
	vs := &a.vox
	vs.asked = true
	a.Local.SetVoiceAsked()
	vs.phase = ""
	a.Voice.Ask(a.voiceLocale(), func(av voice.Availability) {
		a.onUI(func() {
			vs.where = av.Where
			switch {
			case av.Why == voice.WhyMic || av.Why == voice.WhySpeech:
				vs.phase, vs.why = "denied", av.Why
			case !av.OK:
				vs.phase, vs.why = "off", av.Why
			default:
				a.voiceNote("voice.tap")
			}
		})
	})
}

// voiceSlide follows a held press: what letting go would do now.
func (a *App) voiceSlide(x, y float32) {
	vs := &a.vox
	if vs.phase != "listen" || vs.byKey {
		return
	}
	vs.intent = voice.IntentOf(float64(x-vs.downX), float64(y-vs.downY))
}

// voiceEnd is letting go: a tap shows how to hold; else the words go in,
// go at once, or are dropped.
func (a *App) voiceEnd(canceled bool) {
	vs := &a.vox
	if vs.phase != "listen" {
		return
	}
	held := a.Now().Sub(vs.downAt)
	switch {
	case canceled || vs.intent == voice.Drop:
		a.voiceDrop()
	case held < voice.HoldTapMS*time.Millisecond:
		a.voiceDrop()
		a.voiceNote("voice.tap")
	default:
		vs.phase = "finishing"
		a.Voice.Stop() // Final follows
	}
}

func (a *App) voiceDrop() {
	vs := &a.vox
	vs.gen++
	vs.phase, vs.heard, vs.level = "", "", 0
	if a.Voice != nil {
		a.Voice.Cancel()
	}
}

func (a *App) voiceNote(key string) {
	a.vox.note, a.vox.noteTill = key, a.Now().Add(voiceNoteFor)
}

// voiceFinal is the words heard once listening stopped.
func (a *App) voiceFinal(g int, text string) {
	vs := &a.vox
	if vs.gen != g || vs.phase != "finishing" {
		return
	}
	vs.phase, vs.level = "", 0
	text = strings.TrimSpace(text)
	if text == "" {
		a.voiceNote("voice.empty")
		return
	}
	if vs.intent == voice.Send {
		if a.SendMessage(voice.JoinHeard(a.draft, text)) {
			a.draft, vs.filled = "", ""
			a.sentByVoice()
		}
		return
	}
	a.draft = voice.JoinHeard(a.draft, text)
	vs.filled = text
	a.focusComposer = true
}

// sentByVoice: the reply to what was just sent is read aloud, with the
// setting on.
func (a *App) sentByVoice() {
	if !a.Local.ReadBack() {
		return
	}
	var last int64 = 1
	if n := len(a.S.Channel); n > 0 {
		last = a.S.Channel[n-1].FirstSeq
	}
	a.vox.readAfter = last
}

// voiceSent is told what the composer sent: words voice put there make a
// message sent by voice.
func (a *App) voiceSent(text string) {
	if f := a.vox.filled; f != "" && strings.Contains(text, f) {
		a.sentByVoice()
	}
	a.vox.filled = ""
}

// voiceKey is the chosen key going down or up while the window is in front.
func (a *App) voiceKey(which string, down bool) {
	if a.Local.VoiceKey() != which || a.Route != RouteConversation {
		return
	}
	if down {
		a.voiceBegin(true, 0, 0)
	} else if a.vox.byKey {
		a.voiceEnd(false)
	}
}

// FnKey is Fn (the Globe key) going down or up (main: voice.WatchFn).
func (a *App) FnKey(down bool) { a.voiceKey("fn", down) }

// voiceObserve watches the keys over the conversation: right Option alone
// held to talk; any other key while it is held is a shortcut, not talk.
func (a *App) voiceObserve(ev ui.InputEvent) {
	switch ev.Kind {
	case ui.InputKeyDown:
		if ev.Code == ui.CodeAltRight && ev.Mods&^ui.Alt == 0 && !ev.Repeat {
			a.voiceKey("ropt", true)
			return
		}
		if a.vox.phase == "listen" && a.vox.byKey {
			if ev.Key == ui.KeyEscape {
				a.voiceDrop()
				return
			}
			if a.Local.VoiceKey() == "ropt" {
				a.voiceDrop() // ⌥ with a letter: a shortcut or a character
			}
		}
	case ui.InputKeyUp:
		if ev.Code == ui.CodeAltRight {
			a.voiceKey("ropt", false)
		}
	}
}

// micButton is the composer's microphone: press and hold to talk.
func (a *App) micButton(c *ui.Context) {
	t := a.T
	label := a.L.T("voice.hold")
	if k := a.voiceKeyName(); k != "" {
		label = a.L.T("voice.hold.key", k)
	}
	size := t.ControlLG
	b := ui.Box(c.Key("mic")).Size(size, size).Radius(a.buttonRadius(size)).Label(label).Tooltip(label).
		Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	listening := a.vox.phase == "listen"
	kind := btnSecondary
	if listening {
		kind = btnAccent
	}
	fg := a.buttonLook(c, b, kind, size, t.Surface)
	if a.vox.phase == "off" {
		fg = t.InkMuted
	}
	b.Draw(drawMic(fg))
	b.HandleInput(func(ev ui.InputEvent) bool {
		switch ev.Kind {
		case ui.InputPointerDown:
			if ev.Button != 0 {
				return false
			}
			a.voiceBegin(false, ev.X, ev.Y)
			return true
		case ui.InputPointerMove:
			a.voiceSlide(ev.X, ev.Y)
			return a.vox.phase == "listen"
		case ui.InputPointerUp:
			a.voiceEnd(ev.Canceled)
			return true
		case ui.InputKeyDown:
			if ev.Key == ui.KeyEscape && a.vox.phase == "listen" {
				a.voiceDrop()
				return true
			}
		}
		return false
	})
}

// voiceAbove is what voice shows over the composer: the listening strip,
// the first hold's card, a refused permission, why it's unavailable, or a
// passing line.
func (a *App) voiceAbove(c *ui.Context) {
	vs := &a.vox
	switch vs.phase {
	case "listen", "finishing":
		a.aboveComposer(c, func() { a.listeningStrip(c) })
		return
	case "ask":
		a.aboveComposer(c, func() { a.voiceAskCard(c) })
		return
	case "denied":
		a.aboveComposer(c, func() { a.voiceDenied(c) })
		return
	case "off":
		a.aboveComposer(c, func() { a.voiceOff(c) })
		return
	}
	if vs.note != "" {
		if left := vs.noteTill.Sub(a.Now()); left > 0 {
			c.After(left)
			a.aboveComposer(c, func() {
				a.notice(c, "voice-note", noticeInfo, func() { a.glyph(c, 18, drawMic(a.T.InkSoft)) }, func() {
					ui.Text(c, a.L.T(vs.note)).FontSize(a.T.SM).LineHeight(1.45).TextColor(a.T.InkSoft)
				}, func() {})
			})
		} else {
			vs.note = ""
		}
	}
}

// listeningStrip: the clay partner leaning in to listen, a calm meter from
// the microphone, the words so far and what letting go does.
func (a *App) listeningStrip(c *ui.Context) {
	t := a.T
	vs := &a.vox
	still := c.Preferences().ReduceMotion
	line := a.L.T("voice.release")
	switch vs.intent {
	case voice.Send:
		line = a.L.T("voice.release.send")
	case voice.Drop:
		line = a.L.T("voice.release.drop")
	}
	row := ui.Row(c.Key("voice-strip")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S3, t.S2, t.S2).
		MinHeight(56).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Role(ui.RoleStatus).Label(a.L.T("voice.listening"))
	if !still {
		in := ui.Local(row, "in", func() bool { return false })
		p := ui.Pose{}
		if !*in {
			p, *in = ui.Pose{Y: 10, Fade: 1}, true
			c.Invalidate()
		}
		row.AnimatePose(p, ui.Animation{Duration: 180 * time.Millisecond, Ease: ui.EaseOut})
	}
	row.Children(func() {
		// The listening pose: tilted toward the mic, leaning in.
		face := ui.Box(c.Key("voice-face")).Shrink(0).TransformOrigin(0.5, 1)
		tilt := float32(8)
		if !still {
			tilt = face.AnimateTo("tilt", tilt, t.Bouncy)
		}
		face.Rotate(tilt).Translate(2, 0)
		face.Children(func() { a.partnerFace(c, "voice", theme.Idle, 40) })
		a.voiceMeter(c, vs.level, vs.intent, still)
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			if vs.heard != "" {
				ui.Text(c, autospace(vs.heard)).FontSize(t.MD).LineHeight(1.45).TextColor(t.Ink).MaxLines(2)
			} else {
				ui.Text(c, a.L.T("voice.listening")).FontSize(t.MD).LineHeight(1.45).TextColor(t.InkMuted).MaxLines(1)
			}
			ink := t.InkMuted
			if vs.intent != voice.Keep {
				ink = t.InkSoft
			}
			ui.Text(c, line).FontSize(t.SM).FontWeight(600).TextColor(ink).SingleLine()
		})
		if vs.byKey {
			ui.Text(c, a.L.T("voice.cue.key", a.voiceKeyName())).FontSize(t.XS).TextColor(t.InkMuted).MaxWidth(220).Shrink(0)
			return
		}
		ui.Row(c).Gap(t.S2).Shrink(0).Children(func() {
			a.voiceCue(c, "voice.cue.drop", vs.intent == voice.Drop)
			a.voiceCue(c, "voice.cue.send", vs.intent == voice.Send)
		})
	})
}

// voiceCue is one way letting go can go, brightening when armed.
func (a *App) voiceCue(c *ui.Context, key string, armed bool) {
	t := a.T
	bg, ink := t.SurfaceSunken, t.InkMuted
	if armed {
		bg, ink = t.Accent, t.OnAccent
	}
	ui.Text(c, a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(ink).Background(bg).
		Padding(t.S1, t.S2+2).Radius(t.RadiusSM).SingleLine()
}

// voiceMeter: five bars, the middle tallest, from the level; one dot whose
// opacity follows it under Reduce Motion.
func (a *App) voiceMeter(c *ui.Context, level float64, intent voice.HoldIntent, still bool) {
	t := a.T
	col := t.Accent
	if intent == voice.Drop {
		col = t.InkMuted
	}
	if still {
		op := float32(0.35 + 0.65*level)
		ui.Box(c.Key("voice-dot")).Size(10, 10).Radius(5).Background(col).Opacity(op).Shrink(0).AccessHidden(true)
		return
	}
	bars := voice.MeterBars(level, 5)
	ui.Box(c.Key("voice-meter")).Size(34, 26).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		w, gap := float32(4), float32(3.5)
		x := r.X + (r.W-(5*w+4*gap))/2
		for _, v := range bars {
			h := float32(math.Max(4, v*float64(r.H)))
			p.Fill(ui.Rect{X: x, Y: r.Y + (r.H-h)/2, W: w, H: h}, col, w/2)
			x += w + gap
		}
	})
}

func (a *App) voicePrivacy() string {
	if a.vox.where == voice.WhereDevice {
		return a.L.T("voice.privacy.device")
	}
	return a.L.T("voice.privacy.apple")
}

// voiceAskCard is the first hold: why it needs the microphone and where the
// sound goes, in a line each; then macOS asks.
func (a *App) voiceAskCard(c *ui.Context) {
	t := a.T
	a.notice(c, "voice-ask", noticeInfo, func() { a.glyph(c, 20, drawMic(t.Accent)) }, func() {
		ui.Column(c).Gap(2).Grow(1).MinWidth(200).Children(func() {
			ui.Text(c, a.L.T("voice.ask.title")).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Ink)
			ui.Text(c, a.L.T("voice.ask.why")).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft)
			ui.Text(c, a.voicePrivacy()).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkMuted)
		})
	}, func() {
		if a.button(c, a.L.T("voice.ask.later"), btnSecondary, t.ControlSM, t.Surface) {
			a.vox.phase = ""
		}
		if a.button(c, a.L.T("voice.ask.go"), btnPrimary, t.ControlSM, t.Surface) {
			a.voiceAsk()
		}
	})
}

// voiceDenied: the permission was refused; the place to turn it on.
func (a *App) voiceDenied(c *ui.Context) {
	t := a.T
	key := "voice.denied.mic"
	if a.vox.why == voice.WhySpeech {
		key = "voice.denied.speech"
	}
	a.notice(c, "voice-denied", noticeAlert, func() { a.glyph(c, 18, drawMic(t.Failed.Ink)) }, func() {
		ui.Text(c, a.L.T(key)).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Failed.Ink)
	}, func() {
		if a.button(c, a.L.T("voice.denied.open"), btnSecondary, t.ControlSM, t.Surface) {
			c.OpenURL(voice.SettingsURL(a.vox.why))
			a.vox.phase = ""
		}
		if a.iconButton(c, a.L.T("media.close"), t.ChipLG, btnText, drawCross) {
			a.vox.phase = ""
		}
	})
}

// voiceOff: voice isn't available here, and why.
func (a *App) voiceOff(c *ui.Context) {
	t := a.T
	why := a.vox.why
	if why == "" {
		why = voice.WhyError
	}
	words := a.L.T("voice.why." + why)
	if why == voice.WhyLang {
		words = a.L.T("voice.why.lang", lang.Autonym(a.talkLang()))
	}
	a.notice(c, "voice-off", noticeInfo, func() { a.glyph(c, 18, drawMic(t.InkMuted)) }, func() {
		ui.Column(c).Gap(2).Grow(1).MinWidth(200).Children(func() {
			ui.Text(c, a.L.T("voice.off")).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Ink)
			ui.Text(c, words).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft)
		})
	}, func() {
		if a.iconButton(c, a.L.T("media.close"), t.ChipLG, btnText, drawCross) {
			a.vox.phase = ""
		}
	})
}

// ---------- Read aloud ----------

// readAloud says a partner's message in its own language with the Mac's
// voice: its words as a person reads them (voice.Speakable).
func (a *App) readAloud(c *ui.Context, seq int64, text string) {
	if a.Speaker == nil {
		return
	}
	tag := voice.ReadLang(text, a.talkLang(), string(a.L.Locale))
	loc := voice.SpeechLocale(tag, a.PreferredLocales)
	ok := a.Speaker.Speak(voice.Speakable(text), loc, func() {
		a.onUI(func() {
			if a.vox.speaking == seq {
				a.vox.speaking = 0
			}
		})
	})
	if !ok {
		if c != nil {
			c.Toast(a.L.T("voice.read.none", lang.Autonym(tag)))
		}
		return
	}
	a.vox.speaking = seq
}

func (a *App) speakStop() {
	if a.vox.speaking != 0 && a.Speaker != nil {
		a.vox.speaking = 0
		a.Speaker.Stop()
	}
}

// readMenuItem is Read aloud (or Stop reading) in a partner message's menu.
func (a *App) readMenuItem(c *ui.Context, m *ui.Menu, r *replyTo, text string) {
	if r == nil || r.from != "partner" || a.Speaker == nil || strings.TrimSpace(text) == "" {
		return
	}
	if a.vox.speaking == r.seq {
		if m.Item(a.L.T("voice.read.stop")).Chosen() {
			a.speakStop()
		}
		return
	}
	if m.Item(a.L.T("voice.read")).Chosen() {
		a.readAloud(c, r.seq, text)
	}
}

// readingLine sits under the message being read: a small meter and Stop.
func (a *App) readingLine(c *ui.Context, seq int64) {
	if a.vox.speaking != seq || seq == 0 {
		return
	}
	t := a.T
	ui.Row(c.Key(fmt.Sprint("reading:", seq))).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, 0, 0, t.S2).Children(func() {
		still := c.Preferences().ReduceMotion
		lvl := 0.55
		if !still {
			ms := float64(c.Now().UnixMilli()%1200) / 1200
			lvl = 0.4 + 0.35*math.Sin(ms*2*math.Pi)
			c.After(80 * time.Millisecond)
		}
		a.voiceMeter(c, lvl, voice.Keep, still)
		if a.button(c, a.L.T("voice.read.stop"), btnText, t.ControlSM, t.Bg) {
			a.speakStop()
		}
	})
}

// readBack reads the reply to a message sent by voice, once it comes.
func (a *App) readBack() {
	after := a.vox.readAfter
	if after == 0 || !a.Local.ReadBack() {
		return
	}
	for _, e := range a.S.Channel {
		if e != nil && e.AI != nil && e.FirstSeq > after && strings.TrimSpace(e.AI.Text) != "" {
			a.vox.readAfter = 0
			a.readAloud(nil, e.FirstSeq, e.AI.Text)
			return
		}
	}
}

// ---------- Settings ----------

// voiceSettings is Settings › Look and sound › Voice: the key to hold, and
// reading replies aloud while talking by voice.
func (a *App) voiceSettings(c *ui.Context) {
	privacy := ""
	if a.Voice != nil {
		if av := a.Voice.Can(a.voiceLocale()); av.Where != "" {
			a.vox.where = av.Where
			privacy = a.voicePrivacy()
		}
	}
	a.group(c, "voice", a.L.T("voice.settings"), privacy, func() {
		keys := []string{"ropt", "fn", "none"}
		sel := 0
		for i, k := range keys {
			if k == a.Local.VoiceKey() {
				sel = i
			}
		}
		help := ""
		if keys[sel] == "fn" {
			help = a.L.T("voice.settings.key.fn.help")
		}
		a.row(c, "voicekey", a.L.T("voice.settings.key"), help, func() {
			labels := []string{a.L.T("voice.settings.key.ropt"), a.L.T("voice.settings.key.fn"), a.L.T("voice.settings.key.none")}
			if i := a.choices(c, "voicekey", a.L.T("voice.settings.key"), labels, sel); i >= 0 {
				a.Local.SetVoiceKey(keys[i])
				a.cheer()
			}
		})
		on := a.Local.ReadBack()
		a.row(c, "readback", a.L.T("voice.settings.readback"), a.L.T("voice.settings.readback.help"), func() {
			if a.switchControl(c, "readback", a.L.T("voice.settings.readback"), &on) {
				a.Local.SetReadBack(on)
			}
		})
	})
}

// drawMic is Ducter's microphone: a rounded capsule in a cradle on a short
// stem, drawn on a 16-unit grid at a 1.8 stroke like the other marks.
func drawMic(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := float32(1.15)
		if min(r.W, r.H) < 24 {
			s = min(r.W, r.H) / 16
		}
		x0, y0 := r.X+(r.W-16*s)/2, r.Y+(r.H-16*s)/2
		at := func(x, y float32) (float32, float32) { return x0 + x*s, y0 + y*s }
		cx, cy := at(5.6, 1.6)
		p.Stroke(ui.Rect{X: cx, Y: cy, W: 4.8 * s, H: 8.4 * s}, col, 2.4*s, 1.8*s)
		var m ui.Path
		m.MoveTo(at(3, 7.4))
		m.CubeTo(x0+3*s, y0+10.6*s, x0+5.2*s, y0+12.4*s, x0+8*s, y0+12.4*s)
		m.CubeTo(x0+10.8*s, y0+12.4*s, x0+13*s, y0+10.6*s, x0+13*s, y0+7.4*s)
		m.MoveTo(at(8, 12.4))
		m.LineTo(at(8, 14.6))
		p.StrokePath(&m, 1.8*s, col)
	}
}
