package views

import (
	"context"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/imessage"
)

// D323: giving the partner its own Apple ID, as a guided setup in Settings
// › 聊天软件 / Chat apps › iMessage (design/imessage.md "Its own Apple ID,
// step by step"; research/113). The steps say what to do on which device,
// and the one step Ducter can check, this Mac's Messages, has a check
// beside it that says what it found.

// appleAccountURL is where an Apple ID is made on the web (research/113 §4).
const appleAccountURL = "https://account.apple.com"

// imessageCompare is the honest line under the choice: each mode by name,
// and what it is like in Messages.
func (a *App) imessageCompare(c *ui.Context, name string) {
	t := a.T
	ui.Column(c.Key("imessage-compare")).Gap(t.S2).Children(func() {
		for _, k := range [][2]string{{a.L.T("imessage.mode.partner", name), a.L.T("imessage.compare.partner", name)}, {a.L.T("imessage.mode.self"), a.L.T("imessage.compare.self")}} {
			ui.Column(c).Gap(2).Children(func() {
				ui.Text(c, k[0]).FontSize(t.SM).FontWeight(700).LineHeight(a.leading(1.4)).TextColor(t.InkSoft)
				ui.Text(c, k[1]).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			})
		}
	})
}

// imessageSteps are the four steps of the partner's own Apple ID, before
// Connect: make the Apple ID (on the web, any device), sign this Mac's
// Messages in to it (checked here), keep this Mac on and in front (checked
// here), then Connect and text the code from the phone.
func (a *App) imessageSteps(c *ui.Context, st imessage.Status, name string) {
	t := a.T
	br := a.IMessage
	is := &a.imessage
	a.chatBody(c, "imessage-steps", func() {
		a.chatStep(c, 1, a.L.T("imessage.step.id", name), func() {
			ui.Text(c, a.L.T("imessage.step.id.note")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			ui.Row(c).Children(func() {
				if a.quietButton(c, "imessage-make-id", a.L.T("imessage.step.id.open"), a.L.T("imessage.title"), true, 1) {
					a.openLink(appleAccountURL)
				}
			})
		})
		a.chatStep(c, 2, a.L.T("imessage.step.sign", name), func() {
			ui.Text(c, a.L.T("imessage.step.sign.note")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			line, tone := a.imessageCheckLine(st, name)
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				label := a.L.T("imessage.check")
				if is.checking {
					label = a.L.T("imessage.checking")
				}
				if a.buttonFor(c, label, a.L.T("imessage.step.sign", name), btnSecondary, t.ControlSM, t.Surface) && !is.checking {
					is.checking = true
					a.async(func() { _ = br.Probe(context.Background()) }, func() { is.checking = false })
				}
				if st.Err == imessage.StateNeedsAuto && a.quietButton(c, "imessage-check-auto", a.L.T("imessage.perm.open"), a.L.T("imessage.perm.auto"), true, 1) {
					a.openLink(imessage.PaneAutomation)
				}
			})
			if line != "" {
				ui.Text(c.Key("imessage-check-line"), line).FontSize(t.SM).FontWeight(600).LineHeight(a.leading(1.5)).TextColor(a.sideInk(tone))
			}
		})
		a.chatStep(c, 3, a.L.T("imessage.step.on"), func() {
			note, tone := a.L.T("imessage.step.on.note"), sideMuted
			if st.Background {
				note, tone = a.L.T("imessage.background.note", st.User), sideFailed
			}
			w := 400
			if tone == sideFailed {
				w = 600
			}
			ui.Text(c.Key("imessage-on-line"), note).FontSize(t.SM).FontWeight(w).LineHeight(a.leading(1.5)).TextColor(a.sideInk(tone))
			ui.Text(c, a.L.T("imessage.step.on.other")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		})
		a.chatStep(c, 4, a.L.T("imessage.step.pair", name), nil)
	})
}

// imessageCheckLine is what the check of this Mac's Messages found, in its
// ink; "" before the first check.
func (a *App) imessageCheckLine(st imessage.Status, name string) (string, sideTone) {
	switch st.Err {
	case imessage.StateNotSigned:
		return a.L.T("imessage.signin"), sideFailed
	case imessage.StateNeedsAuto:
		return a.L.T("imessage.check.auto"), sideInk
	case imessage.StateError:
		return a.L.T("imessage.check.error"), sideFailed
	}
	if !st.Checked {
		return "", sideMuted
	}
	if st.Account == "" {
		return a.L.T("imessage.check.signed"), sideDone
	}
	if st.ICloud != "" && sameAddress(st.ICloud, st.Account) {
		return a.L.T("imessage.check.icloud", st.Account, name), sideInk
	}
	return a.L.T("imessage.check.account", st.Account), sideDone
}

// imessageElsewhere is the Mac that carries iMessage for the home now, when
// it isn't this one (D323: the home says, on the channels frame); "" when
// none does, or this Mac does.
func (a *App) imessageElsewhere() string {
	f := a.S.Channels
	if f == nil {
		return ""
	}
	for _, m := range f.IMessageAt {
		if !m.Here && m.State == "on" {
			if m.Computer == "" {
				return a.L.T("imessage.another.mac")
			}
			return m.Computer
		}
	}
	return ""
}

// sameAddress compares two Apple ID addresses as Messages does: case does
// not matter.
func sameAddress(x, y string) bool {
	return x != "" && strings.EqualFold(strings.TrimSpace(x), strings.TrimSpace(y))
}
