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
	self     bool
	checking bool // D323: a setup check is asking Messages
	busy     bool
}

// imessageGroup is iMessage in Settings › 聊天软件 / Chat apps (D277, moved
// there by D283): talk to the partner from Messages on the phone, through
// this Mac. Its first row is the app and how it stands; then whose Apple ID
// (before connecting), the two macOS permissions as rows each with its
// Allow, the one-time code, who it is linked to; its last line says it goes
// through this Mac, with Connect or Disconnect at the right edge.
func (a *App) imessageGroup(c *ui.Context) {
	br := a.IMessage
	if br == nil {
		return
	}
	t := a.T
	st := br.Status()
	name := a.personaName()
	is := &a.imessage
	title := a.L.T("imessage.title")
	a.chatGroup(c, "imessage", title, func() {
		line, tone := a.imessageHead(st)
		elsewhere := ""
		if st.State == imessage.StateOff {
			elsewhere = a.imessageElsewhere()
			if elsewhere != "" {
				line, tone = a.L.T("imessage.state.elsewhere", elsewhere), sideDone
			}
		}
		a.chatHead(c, "imessage", title, line, tone)
		if elsewhere != "" {
			// D323: another Mac carries it for the home; one Mac is enough, and
			// two signed in to the same Apple ID would both answer.
			a.chatRow(c, "imessage-elsewhere", a.L.T("imessage.elsewhere", elsewhere), a.L.T("imessage.elsewhere.note", name), nil)
			a.chatFoot(c, "imessage-elsewhere-foot", a.L.T("imessage.via.there", elsewhere), nil)
			return
		}
		if st.State == imessage.StateOff {
			a.chatBody(c, "imessage-mode", func() {
				ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
					ui.Box(c).Width(40).Shrink(0)
					ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S3).Children(func() {
						uiText(c, a.L.T("imessage.who")).FontSize(t.MD).FontWeight(700)
						labels := []string{a.L.T("imessage.mode.partner", name), a.L.T("imessage.mode.self")}
						sel := 0
						if is.self {
							sel = 1
						}
						ui.Row(c).Children(func() {
							if i := a.choices(c, "imessage-mode", a.L.T("imessage.who"), labels, sel); i >= 0 {
								is.self = i == 1
							}
						})
						a.imessageCompare(c, name)
					})
				})
			})
			if !is.self {
				a.imessageSteps(c, st, name)
			}
			a.chatFoot(c, "imessage-connect", a.L.T("imessage.via"), func() {
				label := a.L.T("imessage.connect")
				if is.busy {
					label = a.L.T("chats.connecting")
				}
				if a.buttonFor(c, label, title, btnPrimary, t.ControlMD, t.Surface) && !is.busy {
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
			a.chatBody(c, "imessage-code", func() {
				ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
					ui.Box(c).Width(40).Shrink(0)
					ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S2).Children(func() {
						line := a.L.T("imessage.code.partner", name)
						if st.Account != "" {
							line = a.L.T("imessage.code.to", st.Account)
						}
						if st.Mode == imessage.ModeSelf {
							line = a.L.T("imessage.code.self")
						}
						uiText(c, line).FontSize(t.MD).LineHeight(a.leading(1.5))
						uiText(c, st.Code).Font(t.Mono).FontSize(t.XXL).FontWeight(700).LetterSpacing(2).Selectable()
						left := int(time.Until(st.CodeUntil).Minutes()) + 1
						if left < 1 {
							left = 1
						}
						ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
							uiText(c, a.L.T("imessage.code.left", left)).FontSize(t.SM).TextColor(t.InkMuted)
							if a.quietButton(c, "imessage-new-code", a.L.T("imessage.code.new"), title, true, 0) {
								br.NewCode()
							}
						})
					})
				})
			})
		case imessage.StateOn:
			who, note := a.L.T("chats.linked.who", st.Handle), a.L.T("imessage.where")
			if st.Account != "" {
				note = a.L.T("imessage.linked.partner", name, st.Account)
			}
			if st.Mode == imessage.ModeSelf {
				who, note = a.L.T("imessage.linked.self"), a.L.T("imessage.linked.self.note", name)
			}
			a.chatRow(c, "imessage-linked", who, note, nil)
		case imessage.StateNeedsDisk, imessage.StateNeedsAuto:
		default:
			a.chatRow(c, "imessage-state", a.imessageLine(st, name), "", func() {
				if st.State == imessage.StateOwnID && a.buttonFor(c, a.L.T("imessage.own.switch"), title, btnSecondary, t.ControlSM, t.Surface) {
					if st.Handle == "" {
						// D323: the code showed it before anyone was linked: start
						// over in Message yourself, with a fresh code.
						is.self = true
						a.async(func() { _ = br.Enable(context.Background(), imessage.ModeSelf) }, func() {})
						return
					}
					br.SetMode(imessage.ModeSelf)
				}
			})
		}
		if st.Background {
			a.chatRow(c, "imessage-background", a.L.T("imessage.background"), a.L.T("imessage.background.note", st.User), nil)
		}
		if !st.Stranger.IsZero() && a.imessageNow().Sub(st.Stranger) < 24*time.Hour {
			a.chatRow(c, "imessage-stranger", a.L.T("imessage.stranger", name), "", nil)
		}
		// D289: quiet until hovered, and it asks in place.
		if a.chats.forgetting == "imessage" {
			keep, off := a.confirmRow(c, "imessage-disconnect", a.L.T("imessage.disconnect.ask"), a.L.T("card.stop.keep"), a.L.T("imessage.disconnect"), title)
			if keep {
				a.chats.forgetting = ""
			}
			if off {
				a.chats.forgetting = ""
				br.Disable()
			}
			return
		}
		a.chatFoot(c, "imessage-off", a.L.T("imessage.via"), func() {
			if a.quietDanger(c, "imessage-disconnect", a.L.T("imessage.disconnect"), title) {
				a.chats.forgetting = "imessage"
			}
		})
	})
}

// imessageHead is the group's one line of how it stands.
func (a *App) imessageHead(st imessage.Status) (string, sideTone) {
	switch st.State {
	case imessage.StateOff:
		return a.L.T("chats.state.off"), sideMuted
	case imessage.StatePairing:
		return a.L.T("imessage.state.pairing"), sideInk
	case imessage.StateOn:
		if st.Mode == imessage.ModeSelf {
			return a.L.T("imessage.state.self"), sideDone
		}
		return a.L.T("imessage.state.on", st.Handle), sideDone
	case imessage.StateNeedsDisk, imessage.StateNeedsAuto:
		return a.L.T("imessage.state.needs"), sideInk
	}
	return a.L.T("imessage.state.problem"), sideFailed
}

// imessagePermissions are the two macOS permissions as rows, each saying
// what it allows and, until it is given, an Allow at its right edge that
// asks macOS (Automation) or opens the pane where it is given (Full Disk
// Access, which no app can ask for).
func (a *App) imessagePermissions(c *ui.Context, st imessage.Status, name string) {
	t := a.T
	br := a.IMessage
	perm := func(key, label, help string, on bool, pane string, ask bool) {
		a.chatRow(c, key, label, help, func() {
			if on {
				uiText(c, a.L.T("imessage.perm.on")).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink).SingleLine()
				return
			}
			if a.buttonFor(c, a.L.T("imessage.perm.ask"), label, btnSecondary, t.ControlSM, t.Surface) {
				if ask {
					a.async(func() { _ = br.Probe(context.Background()) }, func() {
						if !br.Status().Automation {
							a.openLink(pane)
						}
					})
					return
				}
				// iMessage is this Mac's whichever home the window shows: the pane
				// opens here too when the window is connected to a home elsewhere
				// (no Backend), which used to do nothing.
				a.openLink(pane)
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
		if st.Handle == "" {
			return a.L.T("imessage.own.code", name)
		}
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
