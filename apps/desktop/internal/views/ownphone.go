package views

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D218: 用你自己的号码打 / Call from your own number on the Mac, in Settings ›
// Accounts beside the phone card. Five steps that tick themselves off as the
// home sees them (the phone, its SIM, the cable, the live voice, a test call);
// only the first open one unfolds, so the card always says one next thing.
// The same card and words as the phone (apps/web/src/own-phone.tsx).
// D278: a server home is never the place for the phone: the card there shows
// no steps, says what works today (你来打 / You call) and why a live call on
// the person's own number needs a computer beside the phone. Install lines are
// only ever the home's own system's, and 再找一次 always answers: a busy line,
// then 看过了 · 20:14 with what it saw.

// ownInstall is the one install line for the home's own system, or "".
func ownInstall(os, tool string) string {
	switch os {
	case "mac":
		if tool == "adb" {
			return "brew install android-platform-tools"
		}
		return "brew install ffmpeg"
	case "linux":
		if tool == "adb" {
			return "sudo apt install adb"
		}
		return "sudo apt install ffmpeg"
	}
	return ""
}

// ownLooked is what the last look saw, with when and on which computer.
func (a *App) ownLooked(v *protocol.OwnPhoneView) (saw, when string) {
	at, err := time.Parse(time.RFC3339, v.LookedAt)
	if err != nil {
		return "", ""
	}
	at = at.Local()
	switch {
	case !v.ADB:
		saw = a.L.T("own.saw.noadb", v.Where)
	case v.Phone == nil:
		saw = a.L.T("own.saw.none", v.Where)
	case v.Phone.State == "unauthorized":
		saw = a.L.T("own.saw.allow")
	default:
		saw = a.L.T("own.saw.phone", v.Phone.Model)
	}
	return saw, fmt.Sprintf("%d:%02d", at.Hour(), at.Minute())
}

// dialers are the person's phones whose Ducter app can dial a call sheet now (D278).
func (a *App) dialers() []protocol.ReachClient {
	var out []protocol.ReachClient
	if a.S.Reach == nil {
		return out
	}
	for _, cl := range a.S.Reach.Clients {
		if cl.Connected && cl.Handset != nil && cl.Handset.Dial {
			out = append(out, cl)
		}
	}
	return out
}

// phoneName is a phone's client name as shown (D291: no old suffix).
func phoneName(name string) string {
	return shownDeviceName(strings.TrimSpace(name))
}

// ownAwayCard is the group on a home that can't be the computer beside
// the phone (a server; D278, D289): what works today (you call) in its
// first row, which phone dials in the next, and the last line: what
// speaking on the person's own number needs, with 即将推出 as a quiet tag.
func (a *App) ownAwayCard(c *ui.Context, v *protocol.OwnPhoneView) {
	a.group(c, "own-phone", "", "", func() {
		a.headRow(c, "own-phone", a.clayTile(c, "ab_call_later", true), a.L.T("own.title"), a.L.T("own.away.lede"), sideMuted, nil)
		line := a.L.T("own.away.nodial")
		if d := a.dialers(); len(d) > 0 {
			line = a.L.T("own.away.dial", phoneName(d[0].Name))
		}
		a.tileRow(c, "own-away-dial", nil, a.L.T("own.away.how"), line, nil)
		a.footRow(c, "own-away", a.L.T("own.away.why", v.Where), func() { a.quietTag(c, a.L.T("own.away.soon")) })
	})
}

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
	if !v.Station {
		a.ownAwayCard(c, v)
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
	// D289: one group: the first row how it stands, a row per step (its
	// mark in the tile column; the open one's body on the text column),
	// the switch once ready, and the last line with the quiet forget.
	a.group(c, "own-phone", "", "", func() {
		art, line, tone := "ab_call_later", a.L.T("own.lede"), sideMuted
		if v.Ready {
			art, line, tone = "ab_call", a.L.T("own.ready"), sideDone
		}
		a.headRow(c, "own-phone", a.clayTile(c, art, !v.Ready), title, line, tone, nil)
		if v.Live != nil {
			live := v.Live
			a.tileRow(c, "own-live", func() { ui.Box(c).Size(10, 10).Radius(5).Background(t.Working.Dot) }, a.L.T("own.live", live.Name), "", func() {
				if a.buttonFor(c, a.L.T("call.hangup"), live.Name, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.CallCancel{T: "call_cancel", CallID: live.CallID})
				}
			})
		} else if v.Busy {
			a.textBlock(c, "own-busy", func() { a.note(c, a.L.T("own.busy")) })
		}
		for i, s := range ownSteps {
			i, s := i, s
			open := s == shown
			sub, ink := "", t.InkMuted
			if done[s] {
				sub = a.ownDoneLine(s, v)
			}
			mark := func() {
				switch {
				case done[s]:
					a.glyph(c, 18, drawCheck(t.Done.Ink))
				case s == next:
					ui.Row(c).Size(26, 26).Radius(13).Background(t.Accent).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
						ui.Text(c, strconv.Itoa(i+1)).FontSize(t.SM).FontWeight(800).TextColor(t.OnAccent).LineHeight(1)
					})
				default:
					ui.Row(c).Size(26, 26).Radius(13).Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
						ui.Text(c, strconv.Itoa(i+1)).FontSize(t.SM).FontWeight(800).TextColor(t.InkSoft).LineHeight(1)
					})
				}
			}
			if a.openRow(c, "own-step:"+s, mark, a.L.T("own.step."+s), sub, ink, open, nil) {
				if open && s != next {
					o.open = ""
				} else {
					o.open = s
				}
			}
			if open {
				a.textBlock(c, "own-body:"+s, func() { a.ownBody(c, s, v) })
			}
		}
		if v.Ready {
			a.tileRow(c, "own-prefer", nil, a.L.T("own.prefer"), a.L.T("own.prefer.help")+" "+a.L.T("own.today", v.Today, v.PerDay), func() {
				on := v.Prefer
				if a.switchControl(c, "own-prefer", a.L.T("own.prefer"), &on) {
					v.Prefer = on
					a.ownAct(protocol.OwnPhoneAct{Action: "prefer", On: &on})
				}
			})
		}
		note := a.L.T("own.where", v.Where) + " " + a.L.T("own.rails")
		if o.forgetting {
			keep, forget := a.confirmRow(c, "own-forget", a.L.T("own.forget.ask"), a.L.T("phone.voice.keep"), a.L.T("own.forget.go"), title)
			if keep {
				o.forgetting = false
			}
			if forget {
				o.forgetting = false
				a.ownAct(protocol.OwnPhoneAct{Action: "forget"})
			}
			return
		}
		var actions func()
		if v.Phone != nil || v.Voice.Key {
			actions = func() {
				if a.quietDanger(c, "own-forget", a.L.T("own.forget"), "") {
					o.forgetting = true
				}
			}
		}
		a.footRow(c, "own-phone", note, actions)
	})
}

func (a *App) ownDoneLine(s string, v *protocol.OwnPhoneView) string {
	switch s {
	case "phone":
		return a.L.T("own.phone.ok", firstNonEmpty(v.Phone.Model, "Android"), v.Phone.Android)
	case "sim":
		// D291: a phrase, never facts joined with " · ".
		if v.SIM != nil && v.SIM.Carrier != "" {
			return a.L.T("own.sim.line", v.SIM.Carrier, prettyNumber(v.Number))
		}
		return prettyNumber(v.Number)
	case "cable":
		if v.Audio.Input == v.Audio.Output {
			return v.Audio.Input
		}
		return a.L.T("own.cable.both", v.Audio.Input, v.Audio.Output)
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
		if v.Looking {
			a.note(c, a.L.T("own.looking"))
			return
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
			if a.buttonFor(c, a.L.T("own.scan"), a.L.T("own.title"), btnText, t.ControlSM, t.Surface) {
				a.ownAct(protocol.OwnPhoneAct{Action: "scan"})
			}
			if saw, at := a.ownLooked(v); saw != "" {
				ui.Text(c, saw).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
				ui.Text(c, at).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum")
			}
		})
	}
	install := func(tool string) {
		if line := ownInstall(v.OS, tool); line != "" {
			a.ownCmd(c, line)
			if v.OS == "linux" {
				a.note(c, a.L.T("own.cmd.distro", tool))
			}
		}
	}
	switch s {
	case "phone":
		switch {
		case !v.ADB:
			a.note(c, a.L.T("own.adb"))
			install("adb")
		case v.Phone == nil:
			a.note(c, a.L.T("own.phone.none", v.Where))
		case v.Phone.State == "unauthorized":
			a.note(c, a.L.T("own.phone.allow"))
		default:
			a.note(c, a.L.T("own.phone.offline"))
		}
		look()
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
			install("ffmpeg")
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
		look()
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
