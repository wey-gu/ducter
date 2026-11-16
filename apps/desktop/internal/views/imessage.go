package views

import (
	"context"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/imessage"
)

// IMessageBridge is this Mac's iMessage bridge (D277) as Settings uses it;
// *imessage.Bridge in the app, a fake in tests.
type IMessageBridge interface {
	Status() imessage.Status
	Enable(ctx context.Context, mode imessage.Mode) error
	NewCode() string
	SetMode(mode imessage.Mode)
	Disable()
	Probe(ctx context.Context) error
	Kick()
}

// imessageState is the group's own state: the mode chosen before linking.
type imessageState struct {
	self bool
	busy bool
}

// imessageGroup is Settings › Notifications › iMessage (D277): talk to the
// partner from Messages on the phone, through this Mac. The two macOS
// permissions it needs, each with what it allows and a way to the right
// pane; the one-time code; how it stands, in words.
func (a *App) imessageGroup(c *ui.Context) {
	br := a.IMessage
	if br == nil {
		return
	}
	t := a.T
	st := br.Status()
	name := a.personaName()
	is := &a.imessage
	a.group(c, "imessage", a.L.T("imessage.title"), a.L.T("imessage.note", name), func() {
		if st.State == imessage.StateOff {
			a.row(c, "imessage-who", a.L.T("imessage.who"), a.L.T("imessage.who.note", name), nil)
			a.rowBlock(c, "imessage-mode", func() {
				labels := []string{a.L.T("imessage.mode.partner", name), a.L.T("imessage.mode.self")}
				sel := 0
				if is.self {
					sel = 1
				}
				if i := a.choices(c, "imessage-mode", a.L.T("imessage.who"), labels, sel); i >= 0 {
					is.self = i == 1
				}
				help := a.L.T("imessage.mode.partner.note", name)
				if is.self {
					help = a.L.T("imessage.mode.self.note", name)
				}
				a.infoText(c, help)
			})
			a.actions(c, "imessage-connect", nil, func() {
				if a.button(c, a.L.T("imessage.connect"), btnPrimary, t.ControlSM, t.Surface) && !is.busy {
					mode := imessage.ModePartner
					if is.self {
						mode = imessage.ModeSelf
					}
					is.busy = true
					a.async(func() { _ = br.Enable(context.Background(), mode) }, func() { is.busy = false })
				}
			})
			return
		}
		a.imessagePermissions(c, st, name)
		switch st.State {
		case imessage.StatePairing:
			a.rowBlock(c, "imessage-code", func() {
				line := a.L.T("imessage.code.partner", name)
				if st.Mode == imessage.ModeSelf {
					line = a.L.T("imessage.code.self")
				}
				ui.Text(c, line).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
				ui.Text(c, st.Code).Font(t.Mono).FontSize(t.XXL).FontWeight(700).Selectable()
				left := int(time.Until(st.CodeUntil).Minutes()) + 1
				if left < 1 {
					left = 1
				}
				ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					ui.Text(c, a.L.T("imessage.code.left", left)).FontSize(t.SM).TextColor(t.InkMuted)
					if a.button(c, a.L.T("imessage.code.new"), btnSecondary, t.ControlSM, t.Surface) {
						br.NewCode()
					}
				})
			})
		default:
			a.row(c, "imessage-state", a.L.T("imessage.state"), a.imessageLine(st, name), nil)
			if st.State == imessage.StateOwnID {
				a.actions(c, "imessage-own", nil, func() {
					if a.button(c, a.L.T("imessage.own.switch"), btnSecondary, t.ControlSM, t.Surface) {
						br.SetMode(imessage.ModeSelf)
					}
				})
			}
		}
		if !st.Stranger.IsZero() && a.imessageNow().Sub(st.Stranger) < 24*time.Hour {
			a.rowBlock(c, "imessage-stranger", func() { a.infoText(c, a.L.T("imessage.stranger", name)) })
		}
		a.actions(c, "imessage-off", func() {
			ui.Text(c, a.L.T("imessage.where")).FontSize(t.SM).TextColor(t.InkMuted)
		}, func() {
			if a.dangerText(c, "imessage-disconnect", a.L.T("imessage.disconnect"), a.L.T("imessage.title")) {
				br.Disable()
			}
		})
	})
}

// imessagePermissions are the two macOS permissions, each saying what it
// allows, whether it is on, and opening the pane where it is given.
func (a *App) imessagePermissions(c *ui.Context, st imessage.Status, name string) {
	t := a.T
	br := a.IMessage
	perm := func(key, label, help string, on bool, pane string, ask bool) {
		a.row(c, key, label, help, func() {
			if on {
				ui.Text(c, a.L.T("imessage.perm.on")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine()
				return
			}
			ui.Text(c, a.L.T("imessage.perm.off")).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).SingleLine()
			if ask && a.buttonFor(c, a.L.T("imessage.perm.ask"), label, btnSecondary, t.ControlSM, t.Surface) {
				a.async(func() { _ = br.Probe(context.Background()) }, func() {})
			}
			if a.buttonFor(c, a.L.T("imessage.perm.open"), label, btnSecondary, t.ControlSM, t.Surface) && a.Backend != nil {
				_ = a.Backend.OpenURL(pane)
				br.Kick()
			}
		})
	}
	perm("imessage-disk", a.L.T("imessage.perm.disk"), a.L.T("imessage.perm.disk.note", name), st.Disk && st.State != imessage.StateNeedsDisk, imessage.PaneFullDisk, false)
	perm("imessage-auto", a.L.T("imessage.perm.auto"), a.L.T("imessage.perm.auto.note"), st.Automation && st.State != imessage.StateNeedsAuto, imessage.PaneAutomation, true)
}

// imessageLine is how the bridge stands, in words.
func (a *App) imessageLine(st imessage.Status, name string) string {
	switch st.State {
	case imessage.StateOn:
		if st.Mode == imessage.ModeSelf {
			return a.L.T("imessage.on.self", name)
		}
		return a.L.T("imessage.on", st.Handle)
	case imessage.StateNeedsDisk, imessage.StateNeedsAuto:
		return a.L.T("imessage.needs")
	case imessage.StateNotSigned:
		return a.L.T("imessage.signin")
	case imessage.StateNoMessages:
		return a.L.T("imessage.nomessages")
	case imessage.StateOwnID:
		return a.L.T("imessage.own", name)
	}
	return a.L.T("imessage.error")
}

// imessageNow is the app's clock.
func (a *App) imessageNow() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}
