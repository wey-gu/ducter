package views

import (
	"strconv"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D218: 用你自己的号码打 / Call from your own number on the Mac, in Settings ›
// Accounts beside the phone card. Five steps that tick themselves off as the
// home sees them (the phone, its SIM, the cable, the live voice, a test call);
// only the first open one unfolds, so the card always says one next thing.
// The same card and words as the phone (apps/web/src/own-phone.tsx).

type ownState struct {
	open       string // a step opened by hand ("" = the next one)
	number     string
	key        string
	engine     string
	test       string
	forgetting bool
}

var ownSteps = []string{"phone", "sim", "cable", "voice", "test"}

// ownDone says which steps are done, and the first that isn't.
func ownDone(v *protocol.OwnPhoneView) (map[string]bool, string) {
	ready := v.Phone != nil && v.Phone.State == "ready"
	done := map[string]bool{
		"phone": ready,
		"sim":   ready && (v.SIM == nil || (v.SIM.State != "absent" && v.SIM.State != "locked")) && v.Number != "",
		"cable": v.Audio.Input != "" && v.Audio.Output != "" && v.Headset != "no",
		"voice": v.Voice.Key,
		"test":  v.Test.State == "passed",
	}
	for _, s := range ownSteps {
		if !done[s] {
			return done, s
		}
	}
	return done, ""
}

func (a *App) ownAct(f protocol.OwnPhoneAct) {
	f.T = "own_phone"
	a.S.OwnAnswer = ""
	a.send(f)
}

func (a *App) ownPhoneCard(c *ui.Context) {
	v := a.S.OwnPhone
	if v == nil {
		return
	}
	t := a.T
	o := &a.own
	title := a.L.T("own.title")
	done, next := ownDone(v)
	shown := next
	if o.open != "" {
		shown = o.open
	}
	card := ui.Column(c.Key("own-phone")).Width(400).MinWidth(0).Grow(1).MaxWidth(520).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Padding(t.S5).Gap(t.S3).Role(ui.RoleGroup).Label(title)
	card.Children(func() {
		ui.Column(c).AlignItems(ui.Center).Gap(t.S1).Children(func() {
			art := "ab_call"
			if !v.Ready {
				art = "ab_call_later"
			}
			ui.Row(c).Size(220, 128).Justify(ui.Center).AlignItems(ui.End).AccessHidden(true).Draw(func(pt *ui.Painter, r ui.Rect) {
				pt.FillPath(oval(r.X+r.W/2, r.Y+r.H-12, 84, 12), t.SurfaceSunken)
			}).Children(func() {
				if bmp := theme.Clay(art); bmp != nil {
					ui.Image(c, bmp).Size(80, 110).Margin(0, 0, 8, 0)
				}
			})
			ui.Text(c, title).FontSize(t.XL).FontWeight(800).SingleLine()
			if v.Ready {
				ui.Text(c, a.L.T("own.ready")).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
			} else {
				ui.Text(c, a.L.T("own.lede")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).TextAlign(ui.Center)
			}
		})
		if v.Live != nil {
			live := v.Live
			ui.Row(c.Key("own-live")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Working.Surface).Role(ui.RoleStatus).Children(func() {
				ui.Box(c).Size(10, 10).Radius(5).Background(t.Working.Dot)
				ui.Text(c, a.L.T("own.live", live.Name)).FontSize(t.SM).FontWeight(700).TextColor(t.Working.Ink).Grow(1).MinWidth(0)
				if a.buttonFor(c, a.L.T("call.hangup"), live.Name, btnSecondary, t.ControlSM, t.Working.Surface) {
					a.send(protocol.CallCancel{T: "call_cancel", CallID: live.CallID})
				}
			})
		} else if v.Busy {
			a.note(c, a.L.T("own.busy"))
		}
		for i, s := range ownSteps {
			i, s := i, s
			open := s == shown
			ui.Column(c.Key("own-step:"+s)).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Border(1, t.LineSoft).Children(func() {
				head := ui.Row(c.Key("own-head:" + s)).Gap(t.S3).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("own.step." + s)).Focusable()
				head.Children(func() {
					switch {
					case done[s]:
						a.glyph(c, 18, drawCheck(t.Done.Ink))
					case s == next:
						ui.Row(c).Size(22, 22).Radius(11).Background(t.Accent).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
							ui.Text(c, strconv.Itoa(i+1)).FontSize(t.XS).FontWeight(800).TextColor(t.OnAccent)
						})
					default:
						ui.Row(c).Size(22, 22).Radius(11).Border(1.5, t.Faint).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
							ui.Text(c, strconv.Itoa(i+1)).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
						})
					}
					ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
						ink := t.Ink
						if !done[s] && s != next {
							ink = t.InkMuted
						}
						ui.Text(c, a.L.T("own.step."+s)).FontSize(t.MD).FontWeight(800).TextColor(ink)
						if done[s] && !open {
							ui.Text(c, a.ownDoneLine(s, v)).FontSize(t.SM).TextColor(t.InkMuted)
						}
					})
				})
				if head.Clicked() {
					if open && s != next {
						o.open = ""
					} else {
						o.open = s
					}
				}
				if open {
					ui.Column(c).Gap(t.S2).Padding(0, 0, 0, 34).Children(func() { a.ownBody(c, s, v) })
				}
			})
		}
		if v.Ready {
			if on, changed := a.switchRow(c, "own-prefer", a.L.T("own.prefer"), a.L.T("own.prefer.help"), v.Prefer); changed {
				v.Prefer = on
				a.ownAct(protocol.OwnPhoneAct{Action: "prefer", On: &on})
			}
			a.note(c, a.L.T("own.today", v.Today, v.PerDay))
		}
		a.note(c, a.L.T("own.where", v.Where))
		a.note(c, a.L.T("own.rails"))
		if v.Phone == nil && !v.Voice.Key {
			return
		}
		ui.Box(c).Height(1).Background(t.LineSoft)
		if !o.forgetting {
			ui.Row(c).Children(func() {
				if a.dangerText(c, "own-forget", a.L.T("own.forget"), "") {
					o.forgetting = true
				}
			})
			return
		}
		ui.Column(c.Key("own-forget-ask")).Gap(t.S2).Children(func() {
			ui.Text(c, a.L.T("own.forget.ask")).FontSize(t.SM).TextColor(t.InkSoft)
			ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
				if a.buttonFor(c, a.L.T("phone.voice.keep"), title, btnText, t.ControlSM, t.Surface) {
					o.forgetting = false
				}
				if a.dangerText(c, "own-forget-go", a.L.T("own.forget.go"), title) {
					o.forgetting = false
					a.ownAct(protocol.OwnPhoneAct{Action: "forget"})
				}
			})
		})
	})
}

func (a *App) ownDoneLine(s string, v *protocol.OwnPhoneView) string {
	switch s {
	case "phone":
		return a.L.T("own.phone.ok", firstNonEmpty(v.Phone.Model, "Android"), v.Phone.Android)
	case "sim":
		line := prettyNumber(v.Number)
		if v.SIM != nil && v.SIM.Carrier != "" {
			line = v.SIM.Carrier + " · " + line
		}
		return line
	case "cable":
		if v.Audio.Input == v.Audio.Output {
			return v.Audio.Input
		}
		return v.Audio.Input + " · " + v.Audio.Output
	case "voice":
		return a.L.T("own.voice.set", a.L.T("own.voice."+v.Voice.Engine), v.Voice.Model, "$"+money(v.Voice.PerMinUSD))
	}
	return a.L.T("own.test.passed")
}

func (a *App) ownCmd(c *ui.Context, cmd string) {
	t := a.T
	ui.Row(c).Children(func() {
		ui.Text(c, cmd).Font(t.Mono).FontSize(t.SM).TextColor(t.Ink).Selectable().Padding(t.S1, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken)
	})
}

func (a *App) ownInput(c *ui.Context, key, label string, value *string, placeholder string, secret bool) {
	t := a.T
	ui.Column(c.Key("own-field:" + key)).Gap(t.S1).Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		in := ui.TextInput(c.Key("own-input:"+key), value).Placeholder(placeholder).Label(label).
			FontSize(t.MD).Padding(t.S3, t.S4).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft)
		if secret {
			in.Password()
		}
	})
}

func (a *App) ownBody(c *ui.Context, s string, v *protocol.OwnPhoneView) {
	t := a.T
	o := &a.own
	warn := func(text string) { ui.Text(c, text).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(a.leading(1.5)) }
	look := func() {
		if a.buttonFor(c, a.L.T("own.scan"), a.L.T("own.title"), btnText, t.ControlSM, t.Surface) {
			a.ownAct(protocol.OwnPhoneAct{Action: "scan"})
		}
	}
	switch s {
	case "phone":
		switch {
		case !v.ADB:
			a.note(c, a.L.T("own.adb"))
			a.ownCmd(c, "brew install android-platform-tools")
		case v.Phone == nil:
			a.note(c, a.L.T("own.phone.none", v.Where))
		case v.Phone.State == "unauthorized":
			a.note(c, a.L.T("own.phone.allow"))
		default:
			a.note(c, a.L.T("own.phone.offline"))
		}
		ui.Row(c).Children(look)
	case "sim":
		if v.SIM != nil && v.SIM.State != "ready" {
			warn(a.L.T("own.sim." + v.SIM.State))
		}
		if o.number == "" && v.Number != "" {
			o.number = prettyNumber(v.Number)
		}
		a.ownInput(c, "number", a.L.T("own.number"), &o.number, a.L.T("own.number.hint"), false)
		if a.S.OwnAnswer == "number" {
			warn(a.L.T("own.number.bad"))
		}
		ui.Row(c).Children(func() {
			if a.buttonFor(c, a.L.T("own.number.save"), a.L.T("own.number"), btnSecondary, t.ControlSM, t.Surface) && o.number != "" {
				a.ownAct(protocol.OwnPhoneAct{Action: "number", Number: o.number})
			}
		})
	case "cable":
		if v.Headset == "no" {
			warn(a.L.T("own.headset.no"))
		} else {
			a.note(c, a.L.T("own.headset."+v.Headset))
		}
		switch {
		case !v.Audio.Tool:
			a.note(c, a.L.T("own.audio.tool"))
			a.ownCmd(c, "brew install ffmpeg")
		case len(v.Audio.Inputs) == 0:
			a.note(c, a.L.T("own.audio.none"))
		default:
			for _, side := range []struct {
				key, label, cur string
				list            []string
			}{{"in", a.L.T("own.audio.in"), v.Audio.Input, v.Audio.Inputs}, {"out", a.L.T("own.audio.out"), v.Audio.Output, v.Audio.Outputs}} {
				side := side
				ui.Text(c, side.label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
				sel := -1
				for i, d := range side.list {
					if d == side.cur {
						sel = i
					}
				}
				if i := a.choices(c, "own-audio-"+side.key, side.label, side.list, sel); i >= 0 {
					if side.key == "in" {
						a.ownAct(protocol.OwnPhoneAct{Action: "audio", Input: side.list[i]})
					} else {
						a.ownAct(protocol.OwnPhoneAct{Action: "audio", Output: side.list[i]})
					}
				}
			}
		}
		ui.Text(c, a.L.T("own.parts")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		for i := 1; i <= 4; i++ {
			a.note(c, strconv.Itoa(i)+". "+a.L.T("own.parts."+strconv.Itoa(i)))
		}
		a.note(c, a.L.T("own.parts.how"))
		ui.Row(c).Children(look)
	case "voice":
		if v.Voice.Key {
			a.note(c, a.L.T("own.voice.set", a.L.T("own.voice."+v.Voice.Engine), v.Voice.Model, "$"+money(v.Voice.PerMinUSD)))
			a.note(c, a.L.T("own.voice.kept", v.Where))
			ui.Row(c).Children(func() {
				if a.buttonFor(c, a.L.T("own.voice.remove"), a.L.T("own.step.voice"), btnText, t.ControlSM, t.Surface) {
					a.ownAct(protocol.OwnPhoneAct{Action: "key_remove"})
				}
			})
			return
		}
		a.note(c, a.L.T("own.voice.why"))
		if o.engine == "" {
			o.engine = firstNonEmpty(v.Voice.Engine, "openai")
		}
		engines := []string{"openai", "qwen"}
		sel := 0
		if o.engine == "qwen" {
			sel = 1
		}
		if i := a.choices(c, "own-engine", a.L.T("own.step.voice"), []string{a.L.T("own.voice.openai"), a.L.T("own.voice.qwen")}, sel); i >= 0 {
			o.engine = engines[i]
		}
		a.note(c, a.L.T("own.voice."+o.engine+".help"))
		a.ownInput(c, "key", a.L.T("own.voice.key"), &o.key, "", true)
		if a.S.OwnAnswer == "key" {
			warn(a.L.T("own.voice.bad"))
		}
		ui.Row(c).Children(func() {
			if a.buttonFor(c, a.L.T("own.voice.save"), a.L.T("own.step.voice"), btnPrimary, t.ControlSM, t.Surface) && o.key != "" {
				a.ownAct(protocol.OwnPhoneAct{Action: "key", Engine: o.engine, Key: o.key})
				o.key = ""
			}
		})
		a.note(c, a.L.T("own.voice.kept", v.Where))
	case "test":
		switch v.Test.State {
		case "calling":
			a.note(c, a.L.T("own.test.calling", prettyNumber(v.Test.To)))
			return
		case "playing":
			a.note(c, a.L.T("own.test.playing"))
			return
		case "asking":
			ui.Text(c, a.L.T("own.test.ask")).FontSize(t.MD).FontWeight(700)
			ui.Row(c).Gap(t.S2).Children(func() {
				if a.buttonFor(c, a.L.T("own.test.yes"), a.L.T("own.step.test"), btnPrimary, t.ControlSM, t.Surface) {
					yes := true
					a.ownAct(protocol.OwnPhoneAct{Action: "heard", Heard: &yes})
				}
				if a.buttonFor(c, a.L.T("own.test.no"), a.L.T("own.step.test"), btnSecondary, t.ControlSM, t.Surface) {
					no := false
					a.ownAct(protocol.OwnPhoneAct{Action: "heard", Heard: &no})
				}
			})
			if v.Test.HeardLine != nil && !*v.Test.HeardLine {
				a.note(c, a.L.T("own.test.noline"))
			}
			return
		case "failed":
			if v.Test.Detail != "" {
				warn(a.L.T("own.test.fail." + v.Test.Detail))
			}
		case "never":
			a.note(c, a.L.T("own.test.why"))
		}
		if o.test == "" && v.Test.To != "" {
			o.test = prettyNumber(v.Test.To)
		}
		a.ownInput(c, "test", a.L.T("own.test.to"), &o.test, a.L.T("own.number.hint"), false)
		if a.S.OwnAnswer == "number" {
			warn(a.L.T("own.test.fail.number"))
		}
		label := a.L.T("own.test.again")
		if v.Test.State == "never" {
			label = a.L.T("own.test.go")
		}
		ui.Row(c).Children(func() {
			if a.buttonFor(c, label, a.L.T("own.step.test"), btnPrimary, t.ControlSM, t.Surface) && o.test != "" {
				a.ownAct(protocol.OwnPhoneAct{Action: "test", To: o.test})
			}
		})
	}
}

// callFrom is a Go card's 从 / From: a Tuwa number, or the owner's own
// number and phone (D218).
func (a *App) callFrom(pl *protocol.CallPlan) string {
	if pl.From != protocol.OwnPhone {
		return a.L.T("call.from.provider", firstNonEmpty(pl.Provider, "Tuwa"))
	}
	switch {
	case pl.FromNumber != "" && pl.FromPhone != "":
		return a.L.T("call.from.ownphone", prettyNumber(pl.FromNumber), pl.FromPhone)
	case pl.FromNumber != "":
		return a.L.T("call.from.own", prettyNumber(pl.FromNumber))
	}
	return a.L.T("call.from.phone", firstNonEmpty(pl.FromPhone, "Android"))
}

// callAbout is 大约 / About: from the owner's phone, only the voice costs
// Ducter money; the call itself is on their plan.
func (a *App) callAbout(pl *protocol.CallPlan, mins string) string {
	if pl.From == protocol.OwnPhone {
		return a.L.T("call.about.own", mins, money(pl.CostUSD))
	}
	return a.L.T("call.about.v", mins, money(pl.CostUSD))
}
