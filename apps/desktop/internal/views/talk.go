package views

// D442: 放手说 / Talk hands-free on the Mac (design/voice.md "Talk hands-free").
// A tap on the composer's microphone (a hold is still hold to talk) starts a
// talk: macOS's recognizer listens, a quiet gap ends each turn and sends it,
// the partner's reply is said short with macOS's voice, talking over it cuts
// it off, and a card waiting for a Go is asked aloud and answered by
// "好" / "先等等" (never the floor: paying, passwords, deleting, a stranger's
// ask, what must be seen). The turn-taking is voice.TalkStep, the port of
// packages/protocol/src/talk.ts; this file runs its effects.

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/voice"
)

type talkCard struct {
	id, question string
	floor        bool
}

// talkState is one talk on this window.
type talkState struct {
	on, ask bool // talking; its first card shown
	// cant (D450): a tap while nothing on the home can think (D440): why,
	// and the way to a key, instead of a talk.
	cant      bool
	off, why  string
	st        voice.TalkState
	gen, sgen int
	seen      int64
	asked     map[string]bool
	card      *talkCard
	level     float64
	note      string
	noteTill  time.Time
}

const talkTick = 200 * time.Millisecond

// sinTurn is a sine over one turn (0–1 → -1…1), for the face's sway.
func sinTurn(f float64) float64 { return math.Sin(f * 2 * math.Pi) }

func (a *App) talkWords() voice.TalkWords {
	t := a.L.T
	return voice.TalkWords{Hint: t("talk.say.hint"), Floor: t("talk.say.floor"), More: t("talk.say.more"), Went: t("talk.say.went"), Held: t("talk.say.held"), Bye: t("talk.say.bye")}
}

func (a *App) nowMS() int64 { return a.Now().UnixMilli() }

// talkTap is a tap on the microphone: the talk starts (its card the first
// time), or ends while it is on.
func (a *App) talkTap() {
	tk := &a.hf
	if tk.on {
		a.talkDispatch(voice.TalkEvent{K: "end", At: a.nowMS()})
		return
	}
	tk.note, tk.off, tk.cant = "", "", false
	// D450: nothing to answer with: the microphone isn't opened and
	// nothing is said; the panel says why, with the way to a key (hold to
	// talk still keeps a message, D440).
	if a.talkCant() {
		tk.cant = true
		return
	}
	if !a.Local.TalkAsked() {
		tk.ask = true
		return
	}
	a.talkBegin()
}

// talkAllow is 开始 / Start on the first card: macOS asks for what it still
// has to, then the talk begins.
func (a *App) talkAllow() {
	tk := &a.hf
	tk.ask = false
	a.Local.SetTalkAsked()
	if a.Voice == nil {
		tk.off, tk.why = "off", voice.WhyMac
		return
	}
	av := a.Voice.Can(a.voiceLocale())
	if av.OK && (av.Mic == voice.Ask || av.Speech == voice.Ask) {
		a.Voice.Ask(a.voiceLocale(), func(voice.Availability) { a.onUI(a.talkBegin) })
		return
	}
	a.talkBegin()
}

// talkCant (D450): nothing on the home can think yet (D440's word, else
// what the home says of its agents).
func (a *App) talkCant() bool {
	if a.S.First != nil {
		return a.S.First.NoBrain
	}
	return a.noBrain()
}

func (a *App) talkBegin() {
	tk := &a.hf
	if a.talkCant() {
		tk.cant = true
		return
	}
	if a.Voice == nil {
		tk.off, tk.why = "off", voice.WhyMac
		return
	}
	av := a.Voice.Can(a.voiceLocale())
	a.vox.where = av.Where
	switch {
	case av.Why == voice.WhyMic || av.Why == voice.WhySpeech || av.Mic == voice.Denied || av.Speech == voice.Denied:
		tk.off, tk.why = "denied", av.Why
		if tk.why == "" {
			tk.why = voice.WhyMic
		}
		return
	case !av.OK:
		tk.off, tk.why = "off", av.Why
		return
	}
	a.speakStop()
	tk.st = voice.TalkStart(a.nowMS())
	tk.on, tk.card, tk.level = true, nil, 0
	tk.asked = map[string]bool{}
	for _, d := range a.S.OpenDecisions() {
		tk.asked[d.DecisionID] = true
	}
	tk.seen = 0
	if n := len(a.S.Channel); n > 0 && a.S.Channel[n-1] != nil {
		tk.seen = a.S.Channel[n-1].FirstSeq
	}
	a.talkListen()
}

// talkListen is one recognizer session; its words so far are what is heard.
func (a *App) talkListen() {
	tk := &a.hf
	tk.gen++
	g := tk.gen
	err := a.Voice.Start(a.voiceLocale(), voice.Hearing{
		Partial: func(s string) {
			a.onUI(func() {
				if tk.gen == g {
					a.talkDispatch(voice.TalkEvent{K: "heard", Text: s, At: a.nowMS()})
				}
			})
		},
		Final: func(string) {
			// A session that ended by itself (a recognizer's time limit): listen again.
			a.onUI(func() {
				if tk.gen == g && tk.on {
					a.talkListen()
				}
			})
		},
		Level: func(l float64) {
			a.onUI(func() {
				if tk.gen == g {
					tk.level = voice.SmoothLevel(tk.level, l)
				}
			})
		},
		Error: func(why string) {
			a.onUI(func() {
				if tk.gen != g {
					return
				}
				if why == voice.WhyMic || why == voice.WhySpeech || why == voice.WhyNoMic || why == voice.WhyBusy {
					a.talkStop()
					tk.off, tk.why = "off", why
				}
			})
		},
	})
	if err != nil {
		a.talkStop()
		tk.off, tk.why = "off", voice.Why(err)
	}
}

func (a *App) talkDispatch(e voice.TalkEvent) {
	tk := &a.hf
	if !tk.on {
		return
	}
	st, fx := voice.TalkStep(tk.st, e, a.talkWords())
	tk.st = st
	for _, f := range fx {
		a.talkRun(f)
	}
}

func (a *App) talkRun(f voice.TalkEffect) {
	tk := &a.hf
	switch f.Do {
	case "send":
		tk.card = nil
		a.SendMessage(f.Text)
	case "decide":
		tk.card = nil
		tk.asked[f.ID] = true
		a.Decide(f.ID, f.Option, "")
	case "speak":
		tk.sgen++
		g := tk.sgen
		done := func() {
			a.onUI(func() {
				if tk.sgen == g {
					a.talkDispatch(voice.TalkEvent{K: "spoken", At: a.nowMS()})
				}
			})
		}
		if a.Speaker == nil {
			done()
			return
		}
		loc := voice.SpeechLocale(voice.ReadLang(f.Text, a.talkLang(), string(a.L.Locale)), a.PreferredLocales)
		if !a.Speaker.Speak(f.Text, loc, done) {
			done() // no voice for it: as if said (the words are on the screen)
		}
	case "hush":
		tk.sgen++
		if a.Speaker != nil {
			a.Speaker.Stop()
		}
	case "relisten":
		tk.gen++
		a.Voice.Cancel()
		if tk.on {
			a.talkListen()
		}
	case "end":
		a.talkStop()
		tk.cant = f.By == "cant"
		if f.By == "quiet" {
			tk.note, tk.noteTill = "talk.ended.quiet", a.Now().Add(voiceNoteFor)
		}
	}
}

func (a *App) talkStop() {
	tk := &a.hf
	tk.on, tk.card, tk.level = false, nil, 0
	tk.gen++
	tk.sgen++
	if a.Voice != nil {
		a.Voice.Cancel()
	}
	if a.Speaker != nil {
		a.Speaker.Stop()
	}
}

// talkFeed says what came since the talk began: the partner's messages (a
// card's own message is said as the card) and new cards, once each. It runs
// with each frame of the conversation, and keeps the clock ticking.
func (a *App) talkFeed(c *ui.Context) {
	tk := &a.hf
	if !tk.on {
		return
	}
	// D450: the home lost what it thinks with mid-talk: it ends, saying
	// nothing more (the kept line that follows is read, not said).
	if a.talkCant() {
		a.talkDispatch(voice.TalkEvent{K: "cant", At: a.nowMS()})
		return
	}
	for _, e := range a.S.Channel {
		if e == nil || e.FirstSeq <= tk.seen {
			continue
		}
		tk.seen = e.FirstSeq
		if e.AI != nil && e.AI.DecisionID == "" && strings.TrimSpace(e.AI.Text) != "" {
			a.talkDispatch(voice.TalkEvent{K: "reply", Text: e.AI.Text, At: a.nowMS()})
		}
	}
	open := a.S.OpenDecisions()
	for _, d := range open {
		if tk.asked[d.DecisionID] {
			continue
		}
		tk.asked[d.DecisionID] = true
		floor := voice.TalkFloor(talkCardOf(d))
		q := strings.TrimSpace(d.Said)
		if q == "" {
			q = strings.TrimSpace(d.Question)
		}
		tk.card = &talkCard{id: d.DecisionID, question: q, floor: floor != ""}
		a.talkDispatch(voice.TalkEvent{K: "ask", ID: d.DecisionID, Question: q, Floor: floor, At: a.nowMS()})
	}
	if tk.card != nil {
		still := false
		for _, d := range open {
			still = still || d.DecisionID == tk.card.id
		}
		if !still {
			id := tk.card.id
			tk.card = nil
			a.talkDispatch(voice.TalkEvent{K: "answered", ID: id, At: a.nowMS()})
		}
	}
	a.talkDispatch(voice.TalkEvent{K: "tick", At: a.nowMS()})
	if c != nil && tk.on {
		c.After(talkTick)
	}
}

func talkCardOf(d *store.DecisionState) voice.TalkCard {
	return voice.TalkCard{
		Question: d.Question, GoLabel: d.GoLabel,
		Pay: d.Pay != nil, Checkout: d.Checkout != nil, Key: d.Key != nil || d.CopyKey != nil, SignIn: d.SignIn != nil, Fill: d.Fill != nil,
		Asker: d.Asker != nil, Sender: d.Sender != nil, Trust: d.Trust != nil,
		Draft: d.Draft != nil, Handset: d.Handset != nil, Phone: d.Phone != nil, Computer: d.Computer != nil, Call: d.Call != nil,
	}
}

// talkAnswer is 好 / 先等等 tapped on the talk's card.
func (a *App) talkAnswer(option string) {
	tk := &a.hf
	cd := tk.card
	if cd == nil || cd.floor {
		return
	}
	tk.card = nil
	a.Decide(cd.id, option, "")
	a.talkDispatch(voice.TalkEvent{K: "answered", ID: cd.id, At: a.nowMS()})
}

// ---------- what it shows ----------

// talkAbove is the talk over the composer (true when it drew something, so
// hold to talk's own cards stay away).
func (a *App) talkAbove(c *ui.Context) bool {
	tk := &a.hf
	t := a.T
	switch {
	case tk.ask:
		a.aboveComposer(c, func() {
			a.notice(c, "talk-ask", noticeInfo, func() { a.partnerFace(c, "talk-ask", theme.Idle, 32) }, func() {
				ui.Column(c).Gap(2).Grow(1).MinWidth(200).Children(func() {
					uiText(c, a.L.T("talk.ask.title")).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Ink)
					uiText(c, a.L.T("talk.ask.why")).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft)
					uiText(c, a.voicePrivacy()).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkMuted)
				})
			}, func() {
				if a.button(c, a.L.T("voice.ask.later"), btnSecondary, t.ControlSM, t.Surface) {
					tk.ask = false
					a.Local.SetTalkAsked()
				}
				if a.button(c, a.L.T("talk.ask.go"), btnPrimary, t.ControlSM, t.Surface) {
					a.talkAllow()
				}
			})
		})
		return true
	case tk.cant && !tk.on:
		a.aboveComposer(c, func() {
			a.notice(c, "talk-cant", noticeInfo, func() { a.partnerFace(c, "talk-cant", theme.Idle, 32) }, func() {
				ui.Column(c).Gap(2).Grow(1).MinWidth(200).Children(func() {
					uiText(c, a.L.T("talk.cant.title")).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Ink)
					uiText(c, a.L.T("talk.cant.why")).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft)
				})
			}, func() {
				if a.button(c, a.L.T("talk.cant.ok"), btnSecondary, t.ControlSM, t.Surface) {
					tk.cant = false
				}
				if rs := a.keyRoutes(); len(rs) > 0 {
					if a.button(c, a.L.T("key.route.go", a.words(rs[0].Name)), btnPrimary, t.ControlSM, t.Surface) {
						a.openLink(rs[0].URL)
					}
				}
			})
		})
		return true
	case tk.off != "":
		prev := a.vox.phase
		a.vox.phase, a.vox.why = tk.off, tk.why
		if tk.off == "denied" {
			a.aboveComposer(c, func() { a.voiceDenied(c) })
		} else {
			a.aboveComposer(c, func() { a.voiceOff(c) })
		}
		if a.vox.phase == "" { // closed
			tk.off = ""
		} else {
			a.vox.phase = prev
		}
		return true
	case !tk.on && tk.note != "":
		if left := tk.noteTill.Sub(a.Now()); left > 0 {
			c.After(left)
			a.aboveComposer(c, func() {
				a.notice(c, "talk-note", noticeInfo, func() { a.glyph(c, 18, drawMic(t.InkSoft)) }, func() {
					uiText(c, a.L.T(tk.note)).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft)
				}, func() {})
			})
			return true
		}
		tk.note = ""
		return false
	case !tk.on:
		return false
	}
	tr := ui.ElementTransition{Duration: 180 * time.Millisecond, Ease: ui.EaseOut, ExitDuration: 140 * time.Millisecond, Enter: &ui.Motion{Y: 10}, Exit: &ui.Motion{Y: 10}}
	if c.Preferences().ReduceMotion {
		tr = ui.ElementTransition{Duration: -1, ExitDuration: -1}
	}
	ui.Row(c.Key("talk-wrap")).Justify(ui.Center).Padding(0, t.S5, t.S2, t.S5).Transition(tr).Children(func() {
		ui.Column(c).Grow(1).MaxWidth(convWidth).Children(func() { a.talkPanel(c) })
	})
	return true
}

// talkPanel: the clay partner (listening, thinking, speaking), the words
// heard or said, a card's question with its answers, and End.
func (a *App) talkPanel(c *ui.Context) {
	t := a.T
	tk := &a.hf
	still := c.Preferences().ReduceMotion
	phase := tk.st.Phase
	cd := tk.card
	saying := ""
	if tk.st.Saying != nil {
		saying = tk.st.Saying.Text
		if cd != nil { // what the card shows isn't shown again above it (D446)
			saying = voice.TalkShown(saying, cd.question, cd.floor, a.talkWords().Floor)
		}
	}
	state := "talk.listening"
	switch {
	case phase == "speak":
		state = "talk.speaking"
	case phase == "think" && tk.st.Heard == "":
		state = "talk.thinking"
	}
	box := ui.Column(c.Key("talk")).Gap(t.S3).Padding(t.S4, t.S4, t.S3, t.S4).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Role(ui.RoleStatus).Label(a.L.T("talk.name"))
	box.Children(func() {
		ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
			face := ui.Box(c.Key("talk-face")).Shrink(0).TransformOrigin(0.5, 1)
			p := theme.Idle
			tilt := float32(0)
			switch phase {
			case "listen":
				tilt = 8
			case "think":
				p = theme.Working
				if !still {
					ms := float64(c.Now().UnixMilli()%2800) / 2800
					tilt = float32(4 * sinTurn(ms))
				}
			}
			if !still && phase == "listen" {
				tilt = face.AnimateTo("tilt", tilt, t.Bouncy)
			}
			face.Rotate(tilt)
			if phase == "speak" && !still {
				ms := float64(c.Now().UnixMilli()%1200) / 1200
				sc := float32(1 + 0.03*sinTurn(ms))
				face.Scale(sc, sc)
			}
			face.Children(func() { a.partnerFace(c, "talk", p, 64) })
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				uiText(c, a.L.T(state)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine()
				switch {
				case phase == "speak" && saying != "":
					uiText(c, autospace(saying)).FontSize(t.LG).LineHeight(1.45).TextColor(t.Ink).MaxLines(3)
				case phase == "speak":
				case tk.st.Heard != "":
					uiText(c, autospace(tk.st.Heard)).FontSize(t.LG).LineHeight(1.45).TextColor(t.Ink).MaxLines(3)
				default:
					hint := "talk.hint"
					if phase == "think" {
						hint = "talk.thinking.hint"
					}
					uiText(c, a.L.T(hint)).FontSize(t.MD).LineHeight(1.45).TextColor(t.InkMuted).MaxLines(2)
				}
			})
			if phase == "listen" {
				a.voiceMeter(c, tk.level, voice.Keep, still)
			}
		})
		if cd != nil {
			ui.Column(c.Key("talk-card")).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
				uiText(c, autospace(cd.question)).FontSize(t.MD).FontWeight(600).LineHeight(1.45).TextColor(t.Ink)
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					if cd.floor {
						uiText(c, a.L.T("talk.floor")).FontSize(t.SM).TextColor(t.InkSoft).Grow(1)
						if a.button(c, a.L.T("talk.floor.show"), btnPrimary, t.ControlSM, t.SurfaceSunken) {
							a.talkDispatch(voice.TalkEvent{K: "end", At: a.nowMS()})
						}
						return
					}
					ui.Box(c).Grow(1)
					if a.button(c, a.L.T("talk.no"), btnSecondary, t.ControlSM, t.SurfaceSunken) {
						a.talkAnswer("hold")
					}
					if a.button(c, a.L.T("talk.yes"), btnPrimary, t.ControlSM, t.SurfaceSunken) {
						a.talkAnswer("go")
					}
				})
			})
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			tip := "talk.stop.tip"
			if phase == "speak" {
				tip = "talk.cutin"
			}
			uiText(c, a.L.T(tip)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Grow(1)
			if a.button(c, a.L.T("talk.end"), btnSecondary, t.ControlSM, t.Surface) {
				a.talkDispatch(voice.TalkEvent{K: "end", At: a.nowMS()})
			}
		})
	})
	if !still {
		c.After(80 * time.Millisecond)
	}
}
