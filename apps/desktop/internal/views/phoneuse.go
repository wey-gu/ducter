package views

import (
	"bytes"
	"fmt"
	"image"
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D217, 用手机 / Use a phone: Ducter's own phone (an Android emulator on
// this Mac), the same as the web client's phone-use.tsx. Its chip on the
// home's card (+ opens the install sheet: what it downloads, Google's
// licenses), its block under the chips (installing, on, Open the phone,
// the tasks using it), its live view (D190's, for the phone: watch, take
// turns, a card's own turn), and its decision cards.

type phoneUseState struct {
	bmp    *ui.Bitmap
	shown  int64
	paused bool
	note   string
	// install sheet: the device it adds the phone to, and the person's OK.
	installFor string
	agreed     bool
	sending    bool
	errText    string
	license    string // the license whose text is open
	eraseAsk   bool
	// drag: where a press started in the user's turn (a swipe or a tap).
	down     bool
	downX    float64
	downY    float64
	downAt   time.Time
	lastTurn bool
}

// OpenPhone opens the live view: mode watch (a task's turn), takeover (the
// user's turn), signin (a card's own turn; Done answers it).
func (a *App) OpenPhone(device, taskID, decisionID, mode string) {
	a.S.OpenPhone(device, taskID, decisionID, mode)
	a.pu.bmp, a.pu.shown, a.pu.down = nil, 0, false
	a.send(protocol.PhoneOpenReq{T: "phone_open", Device: device, TaskID: taskID, DecisionID: decisionID, Mode: mode})
}

// ClosePhone closes the live view (done: 好了 / Done answers its card).
func (a *App) ClosePhone(done bool) {
	pv := a.S.Phone.View
	if pv == nil {
		return
	}
	if pv.ID != "" {
		a.send(protocol.PhoneCloseReq{T: "phone_close", ID: pv.ID, Done: done})
	}
	a.S.Phone.View = nil
	a.pu.bmp = nil
}

func (a *App) phoneInput(in protocol.PhoneInput) {
	if pv := a.S.Phone.View; pv != nil && pv.ID != "" {
		a.send(protocol.PhoneInputReq{T: "phone_input", ID: pv.ID, Input: in})
	}
}

func (a *App) phoneTurn(mine bool) {
	if pv := a.S.Phone.View; pv != nil && pv.ID != "" {
		a.send(protocol.PhoneTurnReq{T: "phone_turn", ID: pv.ID, Mine: mine})
	}
}

// homeID is the home's device id ("local").
func (a *App) homeID() string {
	if h := a.homeDevice(); h != nil {
		return h.ID
	}
	return "local"
}

// ---------- the chip and its block ----------

// phoneSpec is 用手机 on a Mac's card: + opens the install sheet; on, its
// ⓘ says where the phone lives and offers 抹掉这台手机 / Erase this phone.
func (a *App) phoneSpec(c *ui.Context, card string, dv *protocol.DeviceView, ab *protocol.DeviceAbility) chipSpec {
	t := a.T
	id := protocol.AbilityPhone
	sp := chipSpec{id: id, label: a.L.T("chip.phone"), art: abilityArt(id)}
	sp.info = func() { a.infoText(c, a.L.T("ability.phone.about")) }
	switch {
	case ab.State == protocol.AbilityOn:
		sp.look = chipOn
		sp.busy = ab.Setup == "installing"
		sp.tap = func(ui.Rect) { a.toggleChipInfo(card, id) }
		sp.info = func() {
			a.infoText(c, a.L.T("ability.phone.about"))
			a.reasonLine(c, a.L.T("phoneuse.where", a.deviceNameIn(dv)))
			if ab.Setup != "" {
				return
			}
			if !a.pu.eraseAsk {
				ui.Row(c).Children(func() {
					if a.dangerText(c, "phone-erase", a.L.T("phoneuse.erase"), "") {
						a.pu.eraseAsk = true
					}
				})
				return
			}
			a.infoText(c, a.L.T("phoneuse.erase.ask"))
			ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
				if a.button(c, a.L.T("phoneuse.erase.keep"), btnSecondary, t.ControlSM, t.Bg) {
					a.pu.eraseAsk = false
				}
				if a.button(c, a.L.T("phoneuse.erase.go"), btnPrimary, t.ControlSM, t.Bg) {
					a.pu.eraseAsk = false
					a.send(protocol.PhoneEraseReq{T: "phone_erase", Device: dv.ID, KeepSdk: true})
				}
			})
		}
	case ab.State == protocol.AbilityUnavailable:
		sp.look = chipFail
		sp.tap = func(ui.Rect) { a.openPhoneInstall(dv.ID) }
	case dv.State == protocol.DeviceAwake:
		sp.look = chipAdd
		sp.tap = func(ui.Rect) { a.openPhoneInstall(dv.ID) }
	default:
		sp.look = chipOff
		sp.tap = func(ui.Rect) { a.toggleChipInfo(card, id) }
	}
	return sp
}

// phoneNotes is the phone's block under the chips: the install's progress,
// its failure, or, on, whether it is running, Open the phone, and the tasks
// using it with 看看 / Watch.
func (a *App) phoneNotes(c *ui.Context, card string, dv *protocol.DeviceView, note func(key string, tint bool, body func())) {
	t := a.T
	ab := dv.Ability(protocol.AbilityPhone)
	if ab == nil {
		return
	}
	switch {
	case ab.Setup == "installing":
		note("phone-installing", false, func() {
			line, frac := a.L.T("phoneuse.installing.download", 0), float32(0)
			if s := ab.Step; s != nil {
				switch s.Step {
				case "download":
					if s.Total > 0 {
						frac = float32(s.Done) / float32(s.Total)
					}
					line = a.L.T("phoneuse.installing.download", int(frac*100))
				case "unpack":
					line, frac = a.L.T("phoneuse.installing.unpack"), 1
				case "phone":
					line, frac = a.L.T("phoneuse.installing.phone"), 1
				}
			}
			ui.Text(c, line).FontSize(t.SM).TextColor(t.Ink).Role(ui.RoleStatus)
			ui.Box(c.Key("phone-bar")).Height(6).Radius(3).Background(t.LineSoft).Children(func() {
				ui.Box(c.Key("phone-bar-in")).Height(6).Width(float32(math.Max(6, float64(frac)*300))).Radius(3).Background(t.Accent)
			})
			ui.Text(c, a.L.T("phoneuse.installing.away")).FontSize(t.XS).TextColor(t.InkMuted)
			c.After(time.Second)
		})
	case ab.State == protocol.AbilityUnavailable:
		note("phone-failed", true, func() {
			ui.Text(c, a.L.T("phoneuse.failed", ab.Detail)).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink).LineHeight(1.5)
			ui.Row(c).Justify(ui.End).Children(func() {
				if a.button(c, a.L.T("live.retry"), btnSecondary, t.ControlSM, t.Bg) {
					a.openPhoneInstall(dv.ID)
				}
			})
		})
	case ab.State == protocol.AbilityOn:
		note("phone-on", false, func() {
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				line := a.L.T("phoneuse.asleep")
				if ab.Running {
					line = a.L.T("phoneuse.running")
				}
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Grow(1).MinWidth(0)
				if dv.State == protocol.DeviceAwake && a.buttonFor(c, a.L.T("phoneuse.open"), a.L.T("phoneuse.title"), btnSecondary, t.ControlSM, t.Bg) {
					a.OpenPhone(dv.ID, "", "", "takeover")
				}
			})
			if a.S.OnHand == nil {
				return
			}
			for _, cd := range a.S.OnHand.Tasks {
				if cd.Phoning == nil || cd.Phoning.Device != dv.ID {
					continue
				}
				switch cd.Attention {
				case protocol.Working, protocol.Queued, protocol.NeedsYou, protocol.Blocked:
				default:
					continue
				}
				id, title := cd.TaskID, cd.Title
				ui.Row(c.Key("phoning:" + id)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					a.coinBox(c, "phoning:"+id, cd.Harness, 20, false, coinStill)
					ui.Text(c, a.L.T("live.using", title)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Grow(1).MinWidth(0)
					if a.buttonFor(c, a.L.T("live.watch"), title, btnSecondary, t.ControlSM, t.Bg) {
						a.OpenPhone(dv.ID, id, "", "watch")
					}
				})
			}
		})
	}
}

// ---------- the install sheet ----------

func (a *App) openPhoneInstall(device string) {
	a.pu.installFor, a.pu.agreed, a.pu.sending, a.pu.errText, a.pu.license = device, false, false, "", ""
	a.S.Phone.Terms, a.S.Phone.Install = nil, nil
	a.send(protocol.PhoneTermsReq{T: "phone_terms", Device: device})
}

func gbText(n int64) string {
	v := math.Round(float64(n)/1e8) / 10
	if v == math.Trunc(v) {
		return fmt.Sprintf("%.0f", v)
	}
	return fmt.Sprintf("%.1f", v)
}

// phoneInstallSheet is + 用手机: what it downloads and where, when it
// runs, and Google's licenses, read and agreed to once.
func (a *App) phoneInstallSheet(c *ui.Context) {
	if a.pu.installFor == "" {
		return
	}
	t := a.T
	if r := a.S.Phone.Install; r != nil && r.T == "phone_install_result" {
		a.S.Phone.Install = nil
		a.pu.sending = false
		if r.OK {
			a.pu.installFor = ""
			return
		}
		switch r.Reason {
		case "space":
			a.pu.errText = a.L.T("phoneuse.install.space", r.Message)
		case "license":
			a.pu.errText = a.L.T("phoneuse.install.license")
		default:
			a.pu.errText = a.L.T("phoneuse.install.failed", r.Message)
		}
	}
	var dv *protocol.DeviceView
	for i := range a.S.Devices {
		if a.S.Devices[i].ID == a.pu.installFor {
			dv = &a.S.Devices[i]
		}
	}
	name := a.pu.installFor
	if dv != nil {
		name = a.deviceName(dv)
	}
	close := func() { a.pu.installFor = "" }
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 760
	}
	open := true
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 540)).MaxHeight(h-2*t.S6).Padding(t.S5, t.S6, t.S5, t.S6).Gap(t.S3).Radius(t.RadiusXL).
			Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(a.L.T("phoneuse.install.title", name))
		a.enter(c, panel)
		ui.Column(c).AlignItems(ui.Center).Gap(t.S2).Children(func() {
			if bmp := theme.Clay(abilityArt(protocol.AbilityPhone)); bmp != nil {
				ui.Image(c, bmp).Size(41, 64).Shrink(0).AccessHidden(true)
			}
			a.heading(c, a.L.T("phoneuse.install.title", name), t.XL).TextAlign(ui.Center)
			ui.Text(c, a.L.T("phoneuse.install.lede")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.55).TextAlign(ui.Center)
		})
		tm := a.S.Phone.Terms
		switch {
		case tm == nil:
			ui.Text(c, a.L.T("conn.connecting")).FontSize(t.SM).TextColor(t.InkMuted)
		case !tm.OK:
			msg := a.L.T("phoneuse.install.offline", tm.Message)
			if tm.Reason == "not_mac_arm" {
				msg = a.L.T("phoneuse.install.unsupported")
			}
			a.infoText(c, msg)
		default:
			fact := func(k, v string) {
				ui.Row(c.Key("fact:" + k)).Gap(t.S4).Children(func() {
					ui.Text(c, k).FontSize(t.SM).TextColor(t.InkMuted).Width(120).Shrink(0)
					ui.Text(c, v).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.45).Grow(1).MinWidth(0)
				})
			}
			fact(a.L.T("phoneuse.install.download"), a.L.T("phoneuse.install.gb", gbText(tm.Download)))
			fact(a.L.T("phoneuse.install.disk"), a.L.T("phoneuse.install.gb", gbText(tm.Disk)))
			fact(a.L.T("phoneuse.install.what"), a.L.T("phoneuse.install.what.v"))
			fact(a.L.T("phoneuse.install.runs"), a.L.T("phoneuse.install.runs.when"))
			ui.Column(c.Key("phone-lic")).Gap(t.S2).Padding(t.S3, t.S3).Radius(t.RadiusMD).Background(t.Bg).Children(func() {
				ui.Text(c, a.L.T("phoneuse.install.licenses")).FontSize(t.SM).TextColor(t.InkSoft)
				lang := string(a.L.Lang)
				for _, l := range tm.Licenses {
					l := l
					title := l.Title[lang]
					if title == "" {
						title = l.Title["en"]
					}
					open := a.pu.license == l.ID
					ui.Row(c.Key("lic:" + l.ID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
						ui.Text(c, title).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0)
						lbl := a.L.T("phoneuse.install.read")
						if open {
							lbl = a.L.T("phoneuse.install.fold")
						}
						if a.quietButton(c, "lic-read:"+l.ID, lbl, title, true, 0) {
							if open {
								a.pu.license = ""
							} else {
								a.pu.license = l.ID
							}
						}
					})
					if open {
						ui.Scroll(c.Key("lic-text:"+l.ID)).MaxHeight(240).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Surface).Children(func() {
							ui.Text(c, l.Text).FontSize(t.XS).TextColor(t.InkSoft).LineHeight(1.5).Selectable()
						})
					}
				}
				ui.Row(c.Key("phone-agree")).Gap(t.S3).AlignItems(ui.Center).Margin(t.S1, 0, 0, 0).Children(func() {
					a.switchControl(c, "phone-agree", a.L.T("phoneuse.install.agree"), &a.pu.agreed)
					ui.Text(c, a.L.T("phoneuse.install.agree")).FontSize(t.SM).TextColor(t.Ink).Grow(1).MinWidth(0)
				})
			})
			if a.pu.errText != "" {
				ui.Text(c, a.pu.errText).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink).LineHeight(1.5)
			}
		}
		ui.Row(c).Gap(t.S3).Justify(ui.End).Margin(t.S2, 0, 0, 0).Children(func() {
			if a.button(c, a.L.T("phoneuse.notnow"), btnSecondary, t.ControlMD, t.Surface) {
				close()
			}
			ready := tm != nil && tm.OK && a.pu.agreed && !a.pu.sending
			if ready && a.button(c, a.L.T("phoneuse.install.go"), btnPrimary, t.ControlMD, t.Surface) {
				acc := make([]protocol.Accepted, 0, len(tm.Licenses))
				for _, l := range tm.Licenses {
					acc = append(acc, protocol.Accepted{ID: l.ID, Sha256: l.Sha256})
				}
				a.pu.sending, a.pu.errText = true, ""
				a.send(protocol.PhoneInstallReq{T: "phone_install", Device: a.pu.installFor, Accepted: acc})
			}
		})
	})
	if !open {
		close()
	}
}

// ---------- the decision cards ----------

// phoneButtons are a phone task's card: the user's own turn on the phone
// (去手机上 / Open the phone, then Done in the live view), or a Go for one
// tap (what it taps, where; 看看手机 · 先别 · 点吧).
func (a *App) phoneButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	ph := d.Phone
	if d.Resolved != nil || d.Pending != "" {
		held := (d.Resolved != nil && d.Resolved.Option == "hold") || d.Pending == "hold"
		msg := a.L.T("phoneuse.go.done")
		switch {
		case ph.Kind == "user" && held:
			msg = a.L.T("signin.resolved.hold")
		case ph.Kind == "user":
			msg = a.L.T("phoneuse.user.done")
		case held:
			msg = a.L.T("phoneuse.go.held")
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	if ph.Kind == "user" {
		ui.Text(c, a.L.T("phoneuse.user.why")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		ui.Row(c.Key("phone-user:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
			if a.button(c, a.L.T("signin.later"), btnSecondary, st.height, st.quietBg) {
				a.Decide(d.DecisionID, "hold", "")
			}
			if a.button(c, a.L.T("phoneuse.user.open"), btnPrimary, st.height, st.quietBg) {
				a.OpenPhone(a.homeID(), d.TaskID, d.DecisionID, "signin")
			}
		})
		return
	}
	label := ph.Label
	if i := strings.Index(label, " · "); i > 0 {
		label = label[:i]
	}
	what := a.L.T("phoneuse.go.what.0", label)
	if ph.Name != "" {
		what = a.L.T("phoneuse.go.what", label, ph.Name)
	}
	ui.Text(c, what).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
	ui.Row(c.Key("phone-go:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		if d.TaskID != "" && a.button(c, a.L.T("phoneuse.go.look"), btnText, st.height, st.quietBg) {
			a.OpenPhone(a.homeID(), d.TaskID, "", "watch")
		}
		if a.button(c, a.L.T("phoneuse.go.hold"), btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.button(c, a.L.T("phoneuse.go.go"), btnPrimary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "go", "")
		}
	})
}

// ---------- the live view ----------

func (a *App) phoneDoingWords(d *protocol.LiveDoing) string {
	first := func(s string) string {
		if i := strings.Index(s, " · "); i > 0 {
			return s[:i]
		}
		return s
	}
	switch d.Kind {
	case "tap":
		if d.Label != "" {
			return a.L.T("phoneuse.doing.tap", first(d.Label))
		}
		return a.L.T("phoneuse.doing.tap.0")
	case "type":
		if d.Label != "" {
			return a.L.T("phoneuse.doing.type", first(d.Label))
		}
		return a.L.T("phoneuse.doing.type.0")
	case "open":
		return a.L.T("phoneuse.doing.open", d.App)
	case "key":
		k := d.Label
		if k == "" {
			k = "back"
		}
		return a.L.T("phoneuse.doing.key", a.L.T("phoneuse.key."+k))
	}
	return a.L.T("phoneuse.doing." + d.Kind)
}

// phoneView draws the live view of Ducter's phone over the window, the
// same bars, band and calm line as the browser's (D190).
func (a *App) phoneView(c *ui.Context) {
	if cl := a.S.Phone.Closed; cl != nil {
		a.S.Phone.Closed = nil
		a.pu.bmp = nil
		switch cl.Reason {
		case "failed":
			a.pu.note = a.L.T("phoneuse.live.failed", cl.Message)
		case "replaced":
			a.pu.note = a.L.T("live.replaced")
		}
	}
	if a.pu.note != "" {
		c.Toast(a.pu.note)
		a.pu.note = ""
	}
	pv := a.S.Phone.View
	if pv == nil {
		return
	}
	t := a.T
	mine := pv.Mine()
	if hidden := c.WindowHidden(); pv.ID != "" && hidden != a.pu.paused {
		a.pu.paused = hidden
		a.send(protocol.PhonePauseReq{T: "phone_pause", ID: pv.ID, Paused: hidden})
	}
	if pv.Seq != 0 && pv.Seq != a.pu.shown && pv.Frame != nil {
		if img, _, err := image.Decode(bytes.NewReader(pv.Frame)); err == nil {
			if a.pu.bmp == nil {
				a.pu.bmp = ui.NewBitmap(img)
			} else {
				a.pu.bmp.Update(img)
			}
		}
		a.pu.shown = pv.Seq
		a.send(protocol.PhoneAckReq{T: "phone_ack", ID: pv.ID, Seq: pv.Seq})
	}
	var doing *protocol.LiveDoing
	if !mine && pv.Doing != nil && a.Now().Sub(pv.DoingAt) < liveDoingFor {
		doing = pv.Doing
		c.After(liveDoingFor - a.Now().Sub(pv.DoingAt))
	}
	title := a.L.T("phoneuse.title")
	ui.Column(c.Key("phone-live")).Absolute().Left(0).Top(0).Right(0).Bottom(0).ZIndex(2000).Background(t.Bg).
		Role(ui.RoleDialog).Label(title).Children(func() {
		a.chrome(c, "phone-live", func() {
			ui.Column(c).Grow(1).MinWidth(0).AlignItems(ui.Center).Gap(2).Children(func() {
				ui.Text(c, title).FontSize(t.MD).FontWeight(800).SingleLine()
				ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
					dev := pv.Device
					if h := a.homeDevice(); dev == "" && h != nil {
						dev = a.deviceName(h) // still opening: the home's, where the phone lives
					}
					where := a.L.T("phoneuse.on", dev)
					switch {
					case pv.Mode == "watch" && pv.Task != nil:
						if pv.Task.Harness != "" {
							a.coinBox(c, "phone-live", pv.Task.Harness, 16, false, coinStill)
						}
						where = pv.Task.Title
					}
					ui.Text(c, where).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				})
			})
		}, func() {
			if pv.Mode != "signin" && a.buttonFor(c, a.L.T("live.close"), title, btnText, t.ControlSM, t.Chrome) {
				a.ClosePhone(false)
			}
		})
		if mine && pv.Mode != "signin" {
			w := t.State("blocked")
			ui.Row(c.Key("phone-band")).Gap(6).Justify(ui.Center).AlignItems(ui.Center).Padding(t.S2, t.S4).Background(w.Surface).Role(ui.RoleStatus).Children(func() {
				a.glyph(c, 14, drawEyeShut(w.Ink))
				ui.Text(c, a.L.T("phoneuse.yourturn")).FontSize(t.SM).TextColor(w.Ink)
			})
		}
		ui.Row(c).Grow(1).MinHeight(0).Justify(ui.Center).AlignItems(ui.Center).Padding(t.S3, t.S3).Background(t.SurfaceSunken).Children(func() {
			if a.pu.bmp == nil || pv.State != "open" {
				line := a.L.T("phoneuse.opening")
				if pv.State == "starting" {
					line = a.L.T("phoneuse.starting")
				}
				c.After(500 * time.Millisecond)
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted)
				return
			}
			// The screen at its own shape, as tall as there's room for.
			avail := a.winH - ChromeH - 160
			if mine {
				avail -= 48
			}
			ph := float32(math.Max(240, float64(avail)))
			pw := ph * float32(pv.Width) / float32(max(1, pv.Height))
			scr := ui.Image(c.Key("phone-screen"), a.pu.bmp).Size(pw, ph).Shrink(1).Radius(t.RadiusXL).Focusable().AutoFocus().Cursor(ui.CursorDefault)
			if !mine {
				return
			}
			r := scr.Bounds()
			frac := func(x, y float32) (float64, float64) {
				if r.W <= 0 || r.H <= 0 {
					return 0, 0
				}
				return float64(x / r.W), float64(y / r.H)
			}
			scr.HandleInput(func(ev ui.InputEvent) bool {
				switch ev.Kind {
				case ui.InputPointerDown:
					a.pu.down = true
					a.pu.downX, a.pu.downY = frac(ev.X, ev.Y)
					a.pu.downAt = a.Now()
					return true
				case ui.InputPointerUp:
					if !a.pu.down {
						return true
					}
					a.pu.down = false
					x, y := frac(ev.X, ev.Y)
					ms := int(a.Now().Sub(a.pu.downAt) / time.Millisecond)
					if math.Abs(x-a.pu.downX) > 0.02 || math.Abs(y-a.pu.downY) > 0.015 {
						a.phoneInput(protocol.PhoneInput{Kind: "swipe", X1: a.pu.downX, Y1: a.pu.downY, X2: x, Y2: y, Ms: min(800, max(120, ms))})
					} else {
						a.phoneInput(protocol.PhoneInput{Kind: "tap", X: x, Y: y, Long: ms > 550})
					}
					return true
				case ui.InputScroll:
					x, _ := frac(ev.X, ev.Y)
					dy := math.Max(-0.4, math.Min(0.4, float64(ev.DY)/1200))
					a.phoneInput(protocol.PhoneInput{Kind: "swipe", X1: x, Y1: 0.5 + dy/2, X2: x, Y2: 0.5 - dy/2, Ms: 200})
					return true
				case ui.InputText:
					if ev.Text == "" {
						return true
					}
					a.phoneInput(protocol.PhoneInput{Kind: "text", Text: ev.Text})
					return true
				case ui.InputKeyDown:
					if ev.Mods&(ui.Cmd|ui.Ctrl) != 0 {
						return false
					}
					switch ev.Key {
					case ui.KeyEnter:
						a.phoneInput(protocol.PhoneInput{Kind: "key", Key: "enter"})
					case ui.KeyBackspace:
						a.phoneInput(protocol.PhoneInput{Kind: "key", Key: "delete"})
					case ui.KeyEscape:
						a.phoneInput(protocol.PhoneInput{Kind: "key", Key: "back"})
					default:
						return false
					}
					return true
				}
				return false
			}).TextCaret(ui.Rect{X: 0, Y: 0, W: 1, H: 16})
		})
		if mine && pv.State == "open" {
			// The phone's own keys, drawn (never characters).
			ui.Row(c.Key("phone-keys")).Gap(t.S6).Justify(ui.Center).Padding(t.S1, t.S3).Background(t.SurfaceSunken).Role(ui.RoleGroup).Label(a.L.T("phoneuse.keys")).Children(func() {
				for _, k := range []string{"back", "home", "recents"} {
					k := k
					if a.iconButton(c, a.L.T("phoneuse.key."+k), t.ControlSM, btnText, func(fg ui.Color) func(p *ui.Painter, r ui.Rect) { return drawPhoneKey(k, fg) }) {
						a.phoneInput(protocol.PhoneInput{Kind: "key", Key: k})
					}
				}
			})
		}
		ui.Row(c).Padding(t.S3, t.S4).Gap(t.S3).Justify(ui.End).AlignItems(ui.Center).Children(func() {
			switch {
			case pv.Mode == "signin":
				ui.Text(c, a.L.T("phoneuse.signin.note")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45).Grow(1).MinWidth(0)
				if a.buttonFor(c, a.L.T("phoneuse.notnow"), title, btnSecondary, t.ControlMD, t.Bg) {
					a.ClosePhone(false)
				}
				if a.buttonFor(c, a.L.T("live.done"), title, btnPrimary, t.ControlMD, t.Bg) {
					a.ClosePhone(true)
				}
			default:
				line, col := a.L.T("phoneuse.idle"), t.InkMuted
				if pv.TaskID != "" {
					line = a.L.T("phoneuse.idle.task")
				}
				if doing != nil {
					line, col = a.phoneDoingWords(doing), t.InkSoft
				} else if pv.Turn == "you" && !pv.Here {
					line = a.L.T("live.elsewhere")
				}
				if mine {
					line = ""
				}
				ui.Row(c.Key("phone-doing")).Gap(t.S2).AlignItems(ui.Center).Grow(1).MinWidth(0).Role(ui.RoleStatus).Children(func() {
					if doing != nil {
						ui.Box(c.Key("phone-pulse")).Size(8, 8).Shrink(0).Radius(4).Background(t.State("working").Dot)
					}
					if line != "" {
						ui.Text(c, line).FontSize(t.SM).TextColor(col).SingleLine()
					}
				})
				switch {
				case mine && (pv.Mode == "watch" || pv.TaskID != ""):
					if a.buttonFor(c, a.L.T("live.handback"), title, btnPrimary, t.ControlMD, t.Bg) {
						a.phoneTurn(false)
					}
				case mine:
					if a.buttonFor(c, a.L.T("live.done"), title, btnPrimary, t.ControlMD, t.Bg) {
						a.ClosePhone(false)
					}
				default:
					if a.buttonFor(c, a.L.T("live.myturn"), title, btnPrimary, t.ControlMD, t.Bg) {
						a.phoneTurn(true)
					}
				}
			}
		})
	})
}

// drawPhoneKey draws Android's three keys: back (a chevron), home (a ring),
// recents (a rounded square).
func drawPhoneKey(k string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		switch k {
		case "back":
			m.MoveTo(cx+3, cy-6)
			m.LineTo(cx-3, cy)
			m.LineTo(cx+3, cy+6)
		case "home":
			ellipse(&m, cx, cy, 6, 6)
		default:
			roundRect(&m, cx-5.5, cy-5.5, 11, 11, 2.6)
		}
		p.StrokePath(&m, 2.2, col)
	}
}
