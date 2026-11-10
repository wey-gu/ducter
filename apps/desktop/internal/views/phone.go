package views

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Phone calls (D189, D193; design/phone.md) on the Mac: the offer and the
// phone card in Settings › Accounts, the device sign-in (a QR and a code
// the owner checks on their phone), a call's Go card, a question from the
// line (on top of the conversation, pushed), and the call's row on On hand
// with its result in place. Only shared controls (design/ui.md).

// phoneState is what the phone views keep between frames.
type phoneState struct {
	connecting bool              // 连上 Tuwa was tapped; the sign-in frame is on its way
	stopping   bool              // 不用 Tuwa 打电话了 asks in place
	deleting   bool              // 删除我的声音 asks in place
	summary    map[string]bool   // a Go card's provider summary, unfolded
	open       map[string]bool   // an ended call's result, open in place
	script     map[string]bool   // its transcript, unfolded
	answer     map[string]string // a question's typed answer, by decision
}

func (a *App) ph() *phoneState {
	p := &a.phone
	if p.summary == nil {
		p.summary, p.open, p.script, p.answer = map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]string{}
	}
	return p
}

// phoneCaps are the daily limits the phone card offers, in dollars.
var phoneCaps = []float64{5, 10, 20, 50}

func money(v float64) string { return strconv.FormatFloat(v, 'f', 2, 64) }

// prettyNumber groups an E.164 number for reading: +81 3 1234 5678.
func prettyNumber(n string) string {
	d := strings.TrimPrefix(n, "+")
	cc := ""
	switch {
	case strings.HasPrefix(d, "1"):
		cc = "1"
	default:
		for _, p := range []string{"852", "853", "886", "81", "86", "44", "33", "49", "82", "61", "65", "66", "84", "91", "63", "52", "55", "39", "34", "31"} {
			if strings.HasPrefix(d, p) {
				cc = p
				break
			}
		}
		if cc == "" && len(d) > 2 {
			cc = d[:2]
		}
	}
	rest := strings.TrimPrefix(d, cc)
	var g []string
	if cc == "1" && len(rest) == 10 {
		g = []string{rest[:3], rest[3:6], rest[6:]} // +1 415 555 0123
	} else if len(rest) > 8 {
		g = []string{rest[:len(rest)-8], rest[len(rest)-8 : len(rest)-4], rest[len(rest)-4:]}
	} else if len(rest) > 4 {
		g = []string{rest[:len(rest)-4], rest[len(rest)-4:]}
	} else {
		g = []string{rest}
	}
	return "+" + cc + " " + strings.Join(g, " ")
}

// phoneConn is the calling connection, if there is one.
func (a *App) phoneConn() *protocol.ConnectionView {
	for i := range a.S.Connections {
		if a.S.Connections[i].Phone != nil {
			return &a.S.Connections[i]
		}
	}
	return nil
}

// ---------- Settings › Accounts ----------

// phoneSignInRow is the device sign-in while it runs, and how it ended, on
// top of the Accounts page; it also takes the last voice answer.
func (a *App) phoneSignInRow(c *ui.Context) {
	a.drainVoice()
	a.phoneSignIn(c)
}

// phoneOfferRow is the offer, while there is no calling connection and no
// sign-in waiting.
func (a *App) phoneOfferRow(c *ui.Context) {
	if a.phoneConn() == nil && !(a.S.SignIn != nil && a.S.SignIn.State == "waiting") {
		a.phoneOffer(c)
	}
}

// phoneOffer is 打电话 / Make calls before any calling connection: the
// handset not yet lit, what it does, the price, and one button.
func (a *App) phoneOffer(c *ui.Context) {
	t := a.T
	p := a.ph()
	ui.Row(c.Key("phone-offer")).Gap(t.S4).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).AlignItems(ui.Center).Wrap().Children(func() {
		if bmp := theme.Clay("ab_call_later"); bmp != nil {
			ui.Image(c, bmp).Size(46, 64).Shrink(0).AccessHidden(true)
		}
		ui.Column(c).Grow(1).Basis(260).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, a.L.T("phone.offer.title")).FontSize(t.MD).FontWeight(800)
			a.note(c, a.L.T("phone.offer.lede"))
		})
		label := a.L.T("phone.offer.go")
		if p.connecting {
			label = a.L.T("phone.offer.going")
		}
		if a.buttonFor(c, label, a.L.T("phone.offer.title"), btnPrimary, t.ControlMD, t.Surface) && !p.connecting {
			p.connecting = true
			a.send(protocol.ConnectionAdd{T: "connection_add", URL: protocol.TuwaMCP})
		}
	})
}

// phoneSignIn is the device sign-in (RFC 8628): the QR to scan with the
// phone, the code to check there, the link, and the wait; then how it ended.
func (a *App) phoneSignIn(c *ui.Context) {
	t := a.T
	si := a.S.SignIn
	if si == nil {
		return
	}
	p := a.ph()
	name := firstNonEmpty(si.Name, "Tuwa")
	switch si.State {
	case "done":
		a.partner.say(a.L.T("phone.signin.done", name), noticeDone, a.Now())
		a.S.SignIn, p.connecting = nil, false
		return
	case "waiting":
	default:
		p.connecting = false
		words := map[string]string{"denied": a.L.T("phone.signin.denied", name), "expired": a.L.T("phone.signin.expired")}[si.State]
		if words == "" {
			words = a.L.T("phone.signin.failed", name)
		}
		a.notice(c, "signin-end", noticeAlert, func() { a.glyph(c, 22, drawBang(t.Failed.Ink)) }, func() {
			ui.Text(c, words).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink).MaxLines(3)
		}, func() {
			if a.buttonFor(c, a.L.T("phone.signin.cancel"), name, btnText, t.ControlSM, t.Failed.Surface) {
				a.S.SignIn = nil
			}
			if a.buttonFor(c, a.L.T("phone.signin.again"), name, btnSecondary, t.ControlSM, t.Failed.Surface) {
				a.S.SignIn, p.connecting = nil, true
				if si.Reconnect && si.ID != "" {
					a.send(protocol.ConnectionReauth{T: "connection_reauth", ID: si.ID})
				} else {
					a.send(protocol.ConnectionAdd{T: "connection_add", URL: firstNonEmpty(si.URL, protocol.TuwaMCP)})
				}
			}
		})
		return
	}
	ui.Row(c.Key("signin")).Gap(t.S5).Padding(t.S5).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).AlignItems(ui.Center).Wrap().Role(ui.RoleGroup).
		Label(a.L.T("phone.signin.title", name)).Children(func() {
		if len(si.QR) > 0 {
			qrBox(c, si.QR, 148, t.Ink, t.Surface)
		}
		ui.Column(c).Grow(1).Basis(280).MinWidth(0).Gap(t.S3).Children(func() {
			a.heading(c, autospace(a.L.T("phone.signin.title", name)), t.LG)
			a.note(c, a.L.T("phone.signin.lede"))
			ui.Column(c).Gap(2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).AlignSelf(ui.Start).Children(func() {
				ui.Text(c, a.L.T("phone.signin.code")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				ui.Text(c, spaced(si.UserCode)).FontSize(t.XL + 6).FontWeight(800).FontFeatures("tnum").Label(si.UserCode)
			})
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 16, drawClock(t.InkMuted))
				line := a.L.T("phone.signin.waiting")
				if at := store.ParseTime(si.ExpiresAt); !at.IsZero() {
					if m := int(time.Until(at).Minutes() + 0.5); m > 0 {
						line += "  " + a.L.T("phone.signin.valid", m)
					}
					c.After(30 * time.Second)
				}
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).Shrink(1).MinWidth(0)
			})
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, a.L.T("phone.signin.cancel"), name, btnText, t.ControlMD, t.Surface) {
					a.send(protocol.ConnectionSignInCancel{T: "connection_signin_cancel"})
					a.S.SignIn, p.connecting = nil, false
				}
				if a.buttonFor(c, a.L.T("phone.signin.open"), name, btnPrimary, t.ControlMD, t.Surface) {
					a.openLink(firstNonEmpty(si.VerifyURLComplete, si.VerifyURL))
				}
			})
		})
	})
}

// spaced sets a short code apart for reading aloud: WXYZ-2345 → WXYZ – 2345.
func spaced(code string) string { return strings.ReplaceAll(code, "-", " – ") }

// drainVoice turns the last phone_voice answer into its effect: the
// recording page opens in the browser, or one line says why not.
func (a *App) drainVoice() {
	r := a.S.VoiceResult
	if r == nil {
		return
	}
	a.S.VoiceResult = nil
	switch {
	case r.OK && r.URL != "":
		a.openLink(r.URL)
	case r.OK:
	case r.Reason == "no_voice":
		a.partner.say(a.L.T("phone.voice.not_yet"), noticeInfo, a.Now())
	default:
		a.partner.say(a.L.T("phone.voice.failed"), noticeAlert, a.Now())
	}
}

// phoneCard is the calling connection's card (its own kind, beside the
// mailboxes): the lit handset, whether it can call, today, the rails, the
// owner's own voice, and the one destructive at the foot.
func (a *App) phoneCard(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	p := a.ph()
	pv := cv.Phone
	name := firstNonEmpty(pv.Provider, cv.Name)
	title := a.L.T("phone.card.title", name)
	down := sourceDown(cv)
	card := ui.Column(c.Key("phone:"+cv.ID)).Width(400).MinWidth(0).Grow(1).MaxWidth(520).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Padding(t.S5).Gap(t.S3).Role(ui.RoleGroup).Label(title)
	card.Children(func() {
		ui.Column(c).AlignItems(ui.Center).Gap(t.S1).Children(func() {
			art := "ab_call"
			if down {
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
			switch {
			case cv.State == "unauthorized":
				ui.Text(c, a.L.T("phone.card.signed_out", name)).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink)
				if a.buttonFor(c, a.L.T("phone.signin.reauth"), name, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.ConnectionReauth{T: "connection_reauth", ID: cv.ID})
				}
			case down:
				ui.Text(c, a.L.T("phone.card.down", name)).FontSize(t.SM).TextColor(t.Failed.Ink)
			default:
				ui.Text(c, a.L.T("phone.card.ready")).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
			}
			today := a.L.T("phone.card.today.none")
			if pv.Calls == 1 {
				today = a.L.T("phone.card.today.one", money(pv.SpentTodayUSD))
			} else if pv.Calls > 1 {
				today = a.L.T("phone.card.today", pv.Calls, money(pv.SpentTodayUSD))
			}
			ui.Text(c, today).FontSize(t.SM).TextColor(t.InkSoft).FontFeatures("tnum")
		})
		a.note(c, a.L.T("phone.card.rails"))
		ui.Row(c.Key("phone-cap")).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
			ui.Text(c, a.L.T("phone.card.cap")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
			labels := make([]string, len(phoneCaps))
			sel := -1
			for i, v := range phoneCaps {
				labels[i] = "$" + strconv.Itoa(int(v))
				if v == pv.CapUSD {
					sel = i
				}
			}
			if i := a.choices(c, "phone-cap", a.L.T("phone.card.cap"), labels, sel); i >= 0 {
				pv.CapUSD = phoneCaps[i]
				a.send(protocol.PhoneCap{T: "phone_cap", USD: phoneCaps[i]})
			}
		})
		if r := pv.Rails; r != nil && (r.Sampling || r.Shared) {
			var on []string
			if r.Sampling {
				on = append(on, a.L.T("phone.card.sampling"))
			}
			if r.Shared {
				on = append(on, a.L.T("phone.card.shared"))
			}
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 14, drawCheck(t.InkMuted))
				ui.Text(c, strings.Join(on, " · ")).FontSize(t.XS).TextColor(t.InkMuted)
			})
		}
		if pv.DoNotCall > 0 {
			ui.Text(c, a.L.T("phone.card.dnc", pv.DoNotCall)).FontSize(t.XS).TextColor(t.InkMuted)
		}
		ui.Box(c).Height(1).Background(t.LineSoft)
		a.phoneVoice(c, cv)
		ui.Box(c).Height(1).Background(t.LineSoft)
		if !p.stopping {
			ui.Row(c).Children(func() {
				if a.dangerText(c, "phone-stop:"+cv.ID, a.L.T("phone.stop"), "") {
					p.stopping = true
				}
			})
			return
		}
		ui.Column(c.Key("phone-stop-ask")).Gap(t.S2).Children(func() {
			ui.Text(c, a.L.T("phone.stop.ask")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
			ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
				if a.buttonFor(c, a.L.T("phone.voice.keep"), name, btnText, t.ControlSM, t.Surface) {
					p.stopping = false
				}
				if a.dangerText(c, "phone-stop-go:"+cv.ID, a.L.T("phone.stop.go"), name) {
					p.stopping = false
					a.send(protocol.ConnectionRemove{T: "connection_remove", ID: cv.ID})
				}
			})
		})
	})
}

// phoneVoice is 你的声音 / Your voice: recorded on the provider's own page
// (the owner agrees and reads aloud there; Ducter never touches audio), then
// on or off here, and deleted with a confirmation in place.
func (a *App) phoneVoice(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	p := a.ph()
	v := cv.Phone.Voice
	ui.Column(c.Key("phone-voice")).Gap(t.S2).Children(func() {
		ui.Text(c, a.L.T("phone.voice.title")).FontSize(t.MD).FontWeight(800)
		if v == nil || !v.Enrolled {
			a.note(c, a.L.T("phone.voice.none"))
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
				if a.quietLink(c, "phone-record", a.L.T("phone.voice.record"), a.L.T("phone.voice.record")) {
					a.send(protocol.PhoneVoice{T: "phone_voice", Action: "record"})
				}
				if a.buttonFor(c, a.L.T("phone.voice.recorded"), a.L.T("phone.voice.title"), btnText, t.ControlSM, t.Surface) {
					a.send(protocol.PhoneVoice{T: "phone_voice", Action: "refresh"})
				}
			})
			ui.Text(c, a.L.T("phone.voice.consent")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
			return
		}
		if on, changed := a.switchRow(c, "phone-voice-on", a.L.T("phone.voice.use"), a.L.T("phone.voice.use.help"), v.On); changed {
			v.On = on
			action := "off"
			if on {
				action = "on"
			}
			a.send(protocol.PhoneVoice{T: "phone_voice", Action: action})
		}
		ui.Text(c, a.L.T("phone.voice.consent")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
		if !p.deleting {
			ui.Row(c).Children(func() {
				if a.dangerText(c, "phone-voice-del", a.L.T("phone.voice.delete"), "") {
					p.deleting = true
				}
			})
			return
		}
		ui.Column(c.Key("phone-voice-del-ask")).Gap(t.S2).Children(func() {
			ui.Text(c, a.L.T("phone.voice.delete.ask")).FontSize(t.SM).TextColor(t.InkSoft)
			ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
				if a.buttonFor(c, a.L.T("phone.voice.keep"), a.L.T("phone.voice.title"), btnText, t.ControlSM, t.Surface) {
					p.deleting = false
				}
				if a.dangerText(c, "phone-voice-del-go", a.L.T("phone.voice.delete"), a.L.T("phone.voice.title")) {
					p.deleting = false
					a.send(protocol.PhoneVoice{T: "phone_voice", Action: "delete"})
				}
			})
		})
	})
}

// ---------- a call's cards ----------

// callBody is a call's decision inside its card: the Go card (who, what,
// what may and won't be said, the voice, the number it calls from, the
// cost, when) or a question from the line.
func (a *App) callBody(c *ui.Context, d *store.DecisionState) {
	if d.Call.Kind == "question" {
		a.callQuestionBody(c, d)
		return
	}
	t := a.T
	a.heading(c, autospace(d.Question), t.XL).LineHeight(1.35)
	if d.Call.Plan != nil && d.Resolved == nil && d.Pending == "" {
		a.callPlanBody(c, d)
	}
	ui.Column(c).Padding(t.S1, 0, 0, 0).Children(func() {
		a.decisionButtons(c, d, decisionStyle{height: t.ControlMD, quietBg: t.NeedsYou.Surface})
	})
}

// callFactsCard is the Go card's facts under the partner's question in the
// conversation, on the needs-you surface like a routine's facts.
func (a *App) callFactsCard(c *ui.Context, d *store.DecisionState) {
	t := a.T
	ui.Column(c.Key("callfacts:"+d.DecisionID)).MaxWidth(t.BubbleMeasure).Gap(t.S3).Padding(t.S4, t.S4).Radius(t.RadiusLG).
		Background(t.NeedsYou.Surface).Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() { a.callPlanBody(c, d) })
}

// callPlanBody is the facts, a warning when there is one, the opening line
// and the provider's own summary behind a fold.
func (a *App) callPlanBody(c *ui.Context, d *store.DecisionState) {
	t := a.T
	pl := d.Call.Plan
	a.callFacts(c, pl)
	if pl.Note != "" {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Start).Children(func() {
			a.glyph(c, 16, drawBang(t.NeedsYou.Ink))
			ui.Text(c, pl.Note).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).Grow(1).MinWidth(0)
		})
	}
	ui.Text(c, a.L.T("call.opens", a.S.PersonaName)).FontSize(t.SM).TextColor(t.NeedsYou.Ink).LineHeight(a.leading(1.45))
	if pl.Summary != "" {
		p := a.ph()
		if a.disclosureRow(c, "callsum:"+d.DecisionID, a.L.T("call.summary", firstNonEmpty(pl.Provider, "Tuwa")), "", p.summary[d.DecisionID]) {
			p.summary[d.DecisionID] = !p.summary[d.DecisionID]
		}
		if p.summary[d.DecisionID] {
			ui.Text(c, pl.Summary).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).Padding(0, t.S3)
		}
	}
}

// callAnswered is how a question from the line was answered, in words.
func (a *App) callAnswered(d *store.DecisionState) string {
	text := ""
	if d.Resolved != nil {
		if d.Resolved.By == "default" {
			return a.L.T("decision.resolved.default")
		}
		text = d.Resolved.Text
	}
	switch text {
	case "yes":
		text = a.L.T("call.q.yes")
	case "no":
		text = a.L.T("call.q.no")
	}
	if text == "" {
		return a.L.T("call.q.sent")
	}
	return a.L.T("call.q.sent") + " · " + text
}

// callFacts is the Go card's table: one fact a line, the label muted.
func (a *App) callFacts(c *ui.Context, pl *protocol.CallPlan) {
	t := a.T
	voice := a.L.T("call.voice.ducter")
	if pl.Voice == "owner" {
		voice = a.L.T("call.voice.owner")
	}
	when := a.L.T("call.when.now")
	if at := store.ParseTime(pl.At); !at.IsZero() {
		when = a.L.T("call.when.at", a.when(at.Local()))
		if r := []rune(when); len(r) > 0 && r[0] >= 'a' && r[0] <= 'z' {
			when = strings.ToUpper(string(r[0])) + string(r[1:]) // "Tomorrow 9:00 (your time)"
		}
	}
	mins := strconv.FormatFloat(pl.Minutes, 'f', -1, 64)
	rows := [][2]string{
		{a.L.T("call.number"), prettyNumber(pl.To)},
		{a.L.T("call.goal"), pl.Goal},
		{a.L.T("call.say"), strings.Join(pl.Say, a.L.T("acct.sep"))},
		{a.L.T("call.keep"), pl.Keep},
		{a.L.T("call.voice"), voice},
		{a.L.T("call.from"), a.L.T("call.from.provider", firstNonEmpty(pl.Provider, "Tuwa"))},
		{a.L.T("call.about"), a.L.T("call.about.v", mins, money(pl.CostUSD))},
		{a.L.T("call.when"), when},
	}
	ui.Column(c).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).Children(func() {
		for _, r := range rows {
			if r[1] == "" {
				continue
			}
			r := r
			ui.Row(c.Key("fact:" + r[0])).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
				ui.Text(c, r[0]).FontSize(t.SM).TextColor(t.InkMuted).Width(84).Shrink(0)
				ui.Text(c, autospace(r[1])).FontSize(t.MD).TextColor(t.Ink).Grow(1).MinWidth(0).LineHeight(a.leading(1.45)).FontFeatures("tnum")
			})
		}
	})
}

// callQuestionBody is a question from the line: who asks, the question,
// the likely answers as buttons, a reply in the owner's own words, and the
// 90 s the line waits.
func (a *App) callQuestionBody(c *ui.Context, d *store.DecisionState) {
	t := a.T
	p := a.ph()
	who := ""
	if call := a.S.Call(d.Call.CallID); call != nil {
		who = call.Plan.Name
	}
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		a.glyph(c, 18, drawAsk(t.NeedsYou.Ink))
		head := a.L.T("call.q.title")
		if who != "" {
			head += " · " + who
		}
		ui.Text(c, head).FontSize(t.SM).FontWeight(800).TextColor(t.NeedsYou.Ink)
	})
	a.heading(c, autospace(d.Question), t.XL+2).LineHeight(1.35)
	if d.Resolved != nil || d.Pending != "" {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			ui.Text(c, a.callAnswered(d)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	ui.Row(c.Key("callq:" + d.DecisionID)).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
		if d.Call.YesNo {
			if a.buttonFor(c, a.L.T("call.q.no"), d.Question, btnSecondary, t.ControlMD, t.NeedsYou.Surface) {
				a.Decide(d.DecisionID, "reply", "no")
			}
			if a.buttonFor(c, a.L.T("call.q.yes"), d.Question, btnPrimary, t.ControlMD, t.NeedsYou.Surface) {
				a.Decide(d.DecisionID, "reply", "yes")
			}
			return
		}
		for i, ch := range d.Call.Choices {
			kind := btnSecondary
			if i == 0 {
				kind = btnPrimary
			}
			if a.buttonFor(c.Key("ch:"+ch), ch, d.Question, kind, t.ControlMD, t.NeedsYou.Surface) {
				a.Decide(d.DecisionID, "reply", ch)
			}
		}
	})
	draft := p.answer[d.DecisionID]
	send := func(text string) {
		if text = strings.TrimSpace(text); text != "" {
			a.Decide(d.DecisionID, "reply", text)
			p.answer[d.DecisionID] = ""
		}
	}
	ui.Row(c.Key("callq-say:"+d.DecisionID)).Gap(t.S2).Padding(t.S1, t.S1, t.S1, t.S3).Radius(t.RadiusMD).Background(t.Surface).Children(func() {
		ui.TextArea(c, &draft).Lines(1, 3).MinHeight(0).Placeholder(a.L.T("call.q.reply")).
			Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0).Grow(1).FontSize(t.MD).
			OnTextKey(func(k ui.TextKey) bool {
				if k.Key == ui.KeyEnter && k.Mods == 0 {
					send(k.Text())
					k.SetText("")
					return true
				}
				return false
			})
		if a.iconButton(c, a.L.T("composer.send"), t.ControlMD, btnPrimary, drawSend) {
			send(draft)
			draft = ""
		}
	})
	p.answer[d.DecisionID] = draft
	ui.Text(c, a.L.T("call.q.foot")).FontSize(t.XS).TextColor(t.NeedsYou.Ink)
}

// openCallQuestions are the questions from a live line nobody answered yet.
func (a *App) openCallQuestions() []*store.DecisionState {
	var out []*store.DecisionState
	for _, d := range a.S.OpenDecisions() {
		if d.Call != nil && d.Call.Kind == "question" {
			out = append(out, d)
		}
	}
	return out
}

// pinnedCallQuestion says whether a decision is a question from the line
// still open: it sits above the composer, not in the scroll.
func (a *App) pinnedCallQuestion(id string) bool {
	d := a.S.Decisions[id]
	return d != nil && d.Call != nil && d.Call.Kind == "question" && d.Resolved == nil && d.Pending == ""
}

// callQuestionsAboveComposer puts an open question from the line on top of
// the conversation: someone is waiting on the phone.
func (a *App) callQuestionsAboveComposer(c *ui.Context) {
	for _, d := range a.openCallQuestions() {
		d := d
		a.aboveComposer(c, func() { a.decisionCard(c.Key("callq-pin:"+d.DecisionID), d, "") })
	}
}

// ---------- On hand: a call's row ----------

// shownCalls are the calls On hand lists as rows: not the ones held, and
// not one whose card (Go, or a question) already stands in Needs you.
func (a *App) shownCalls() []protocol.CallBody {
	var out []protocol.CallBody
	for _, cl := range a.S.Calls() {
		switch {
		case cl.State == protocol.CallHeld:
			continue
		case cl.State == protocol.CallNeedsGo && cl.DecisionID != "" && a.S.Decisions[cl.DecisionID] != nil:
			continue
		case cl.State == protocol.CallAsking && cl.Question != nil && a.S.Decisions[cl.Question.DecisionID] != nil:
			continue
		}
		out = append(out, cl)
	}
	return out
}

// callRows are the calls under On hand's header: what each is doing now.
func (a *App) callRows(c *ui.Context) {
	t := a.T
	calls := a.shownCalls()
	if len(calls) == 0 {
		return
	}
	ui.Column(c.Key("calls")).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.heading(c, a.L.T("call.lane"), t.XL)
			a.heading(c, fmt.Sprint(len(calls)), t.XL).TextColor(t.InkMuted).FontFeatures("tnum")
		})
		for _, cl := range calls {
			a.callRow(c.Key("call:"+cl.CallID), cl)
		}
	})
}

// callTitle is a call's row in words, by its state.
func (a *App) callTitle(cl protocol.CallBody, now time.Time) string {
	n := cl.Plan.Name
	switch cl.State {
	case protocol.CallWaiting:
		when := a.L.T("call.when.now")
		if at := store.ParseTime(cl.Plan.At); !at.IsZero() {
			when = a.when(at.Local())
		}
		return a.L.T("call.row.waiting", when, n)
	case protocol.CallTalking:
		since := store.ParseTime(cl.TalkingSince)
		clock := ""
		if !since.IsZero() {
			s := int(now.Sub(since).Seconds())
			if s < 0 {
				s = 0
			}
			clock = fmt.Sprintf("%d:%02d", s/60, s%60)
		}
		return strings.TrimSpace(a.L.T("call.row.talking", n, clock))
	case protocol.CallNeedsGo, protocol.CallCalling, protocol.CallAsking, protocol.CallDone, protocol.CallUncertain, protocol.CallNoAnswer, protocol.CallFailed, protocol.CallCancelled:
		return a.L.T("call.row."+cl.State, n)
	}
	return n
}

func (a *App) callRow(c *ui.Context, cl protocol.CallBody) {
	t := a.T
	p := a.ph()
	now := a.Now()
	ended := protocol.CallEnded(cl.State)
	live := cl.State == protocol.CallCalling || cl.State == protocol.CallTalking || cl.State == protocol.CallAsking
	if cl.State == protocol.CallTalking {
		c.After(time.Second)
	}
	title := a.callTitle(cl, now)
	bg, ink := t.Surface, t.Ink
	switch {
	case live:
		bg, ink = t.Working.Surface, t.Working.Ink
	case cl.State == protocol.CallFailed:
		bg, ink = t.Failed.Surface, t.Failed.Ink
	}
	row := ui.Column(c).Gap(t.S2).Padding(t.S4).Radius(t.RadiusLG).Background(bg).Label(title)
	if !ended {
		row.Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
	} else {
		row.Border(1, t.LineSoft)
	}
	row.Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			art := "ab_call"
			if ended {
				art = "ab_call_later"
			}
			if bmp := theme.Clay(art); bmp != nil {
				ui.Image(c, bmp).Size(26, 36).Shrink(0).AccessHidden(true)
			}
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, autospace(title)).FontSize(t.MD).FontWeight(800).TextColor(ink).MaxLines(2).FontFeatures("tnum")
				sub := ""
				switch {
				case cl.State == protocol.CallFailed:
					sub = a.L.T("call.why." + firstNonEmpty(cl.Reason, "provider"))
				case cl.State == protocol.CallCancelled && cl.Reason == "too_long":
					sub = a.L.T("call.why.too_long")
				case cl.Outcome != "":
					sub = cl.Outcome
				case !ended:
					sub = prettyNumber(cl.Plan.To) + " · " + cl.Plan.Goal
				}
				if sub != "" {
					ui.Text(c, autospace(sub)).FontSize(t.SM).TextColor(t.InkSoft).MaxLines(3).LineHeight(a.leading(1.45))
				}
			})
			switch {
			case cl.State == protocol.CallWaiting:
				if a.buttonFor(c, a.L.T("call.cancel"), cl.Plan.Name, btnText, t.ControlSM, bg) {
					a.send(protocol.CallCancel{T: "call_cancel", CallID: cl.CallID})
				}
			case live:
				if a.buttonFor(c, a.L.T("call.hangup"), cl.Plan.Name, btnSecondary, t.ControlSM, bg) {
					a.send(protocol.CallCancel{T: "call_cancel", CallID: cl.CallID})
				}
			case cl.State == protocol.CallFailed && cl.PayURL != "":
				if a.buttonFor(c, a.L.T("call.pay"), cl.Plan.Name, btnSecondary, t.ControlSM, bg) {
					a.openLink(cl.PayURL)
				}
			case ended && cl.State != protocol.CallFailed:
				if a.moreButton(c, "callmore:"+cl.CallID, a.L.T("living.details"), p.open[cl.CallID]) {
					p.open[cl.CallID] = !p.open[cl.CallID]
				}
			}
		})
		if ended && p.open[cl.CallID] {
			a.callResult(c, cl)
		}
	})
}

// callResult is an ended call opened in place: the outcome as reported,
// the summary, what was agreed, the transcript behind a fold, length and cost.
func (a *App) callResult(c *ui.Context, cl protocol.CallBody) {
	t := a.T
	p := a.ph()
	ui.Column(c.Key("callres:"+cl.CallID)).Gap(t.S2).Padding(t.S2, 0, 0, 39).Children(func() {
		if cl.Summary != "" {
			ui.Text(c, autospace(cl.Summary)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
		}
		if len(cl.Agreed) > 0 {
			ui.Text(c, a.L.T("call.agreed")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
			for _, s := range cl.Agreed {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					a.glyph(c, 14, drawCheck(t.Done.Ink))
					ui.Text(c, autospace(s)).FontSize(t.SM).TextColor(t.Ink).Grow(1).MinWidth(0)
				})
			}
		}
		if len(cl.Transcript) > 0 {
			if a.disclosureRow(c, "callscript:"+cl.CallID, a.L.T("call.transcript"), "", p.script[cl.CallID]) {
				p.script[cl.CallID] = !p.script[cl.CallID]
			}
			if p.script[cl.CallID] {
				ui.Column(c).Gap(t.S1).Padding(t.S2, t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
					for i, ln := range cl.Transcript {
						who := a.S.PersonaName
						if ln.Who == "them" {
							who = a.L.T("call.them")
						}
						ln := ln
						ui.Row(c.Key(i)).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
							ui.Text(c, who).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Width(52).Shrink(0)
							ui.Text(c, autospace(ln.Text)).FontSize(t.SM).TextColor(t.Ink).Grow(1).MinWidth(0)
						})
					}
				})
			}
		}
		var parts []string
		if cl.DurationSec != nil {
			s := int(*cl.DurationSec)
			cost := 0.0
			if cl.CostUSD != nil {
				cost = *cl.CostUSD
			}
			parts = append(parts, a.L.T("call.length", s/60, s%60, money(cost)))
		}
		if len(parts) > 0 {
			ui.Text(c, strings.Join(parts, " · ")).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum")
		}
	})
}
