package views

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D238, 用这台手机 / Use this phone: a task borrows the person's own Android
// phone through the Ducter app on it. On the Mac: the phone's card says
// whether it is added and who is using it now (停下 / Stop, 移除 / Remove);
// adding it is done on the phone itself, where Android's switch is. The ask
// and the Go cards on that phone are ordinary decision cards (their Go and
// Hold words in goLabel / holdLabel). The same rules as the web's
// (apps/web/src/handset.tsx).

func phoneShort(name string) string {
	return strings.TrimSpace(shownDeviceName(strings.TrimSpace(name)))
}

// handsetCard is 用这台手机 on an Android phone's card.
func (a *App) handsetCard(c *ui.Context, cl *protocol.ReachClient) {
	h := cl.Handset
	if h == nil {
		return
	}
	t := a.T
	name := phoneShort(cl.Name)
	if !h.Added {
		a.infoText(c, a.L.T("handset.elsewhere", name))
		return
	}
	a.infoText(c, a.L.T("handset.where", name))
	if !h.Linked {
		a.reasonLine(c, a.L.T("handset.away"))
	}
	if u := h.Using; u != nil {
		id, title := u.TaskID, u.Title
		ui.Row(c.Key("handset-using:" + cl.ID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Column(c).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, a.L.T("handset.using", title)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5)
				// D331: paused by the person's lock, or asking on the phone after the unlock.
				switch {
				case u.Paused == "asking":
					ui.Text(c, a.L.T("handset.paused.asking", name)).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
				case u.Paused != "":
					ui.Text(c, a.L.T("handset.paused", name)).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
				case u.Quiet:
					ui.Text(c, a.L.T("handset.quiet", name)).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
				}
			})
			if a.buttonFor(c, a.L.T("handset.stop"), title, btnSecondary, t.ControlSM, t.Bg) {
				a.send(protocol.HandsetStopReq{T: "handset_stop", TaskID: id})
			}
		})
	}
	ui.Row(c).Children(func() {
		if a.dangerText(c, "handset-remove:"+cl.ID, a.L.T("handset.remove"), a.L.T("handset.remove.means")) {
			a.send(protocol.HandsetSetReq{T: "handset_set", Device: cl.ID, On: false})
		}
	})
}

// handsetTaskLine is, on the opened task, the person's phone it is using,
// with 停下 / Stop.
func (a *App) handsetTaskLine(c *ui.Context, task *store.Task) {
	t := a.T
	h := a.S.Handset(task.ID)
	if h == nil {
		return
	}
	name := "phone"
	if a.S.Reach != nil {
		for _, cl := range a.S.Reach.Clients {
			if cl.ID == h.Device {
				name = phoneShort(cl.Name)
			}
		}
	}
	line, why := a.handsetLines(h, name)
	ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5)
	if why != "" {
		ui.Text(c, why).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
	}
	label := a.L.T("handset.stop")
	if h.Wait != "" {
		label = a.L.T("handset.withdraw") // D331: 不借了 / Not now, before the loan is on
	}
	if a.buttonFor(c, label, line, btnSecondary, t.ControlSM, t.Chrome) {
		a.send(protocol.HandsetStopReq{T: "handset_stop", TaskID: task.ID})
	}
}

// handsetLines is the opened task's line for the person's phone and the
// one under it (D331), as the loan stands: lent (quiet when it isn't
// answering), paused by their lock or asking on the phone after the unlock,
// or a Go given and the loan not on yet (the phone locked, out of reach
// and why, starting). The port of handsetTaskLine / handsetTaskWhy in
// apps/web/src/handset.tsx.
func (a *App) handsetLines(h *protocol.HandsetCard, name string) (line, why string) {
	switch {
	case h.Wait == "unlock":
		return a.L.T("handset.wait.unlock", name), ""
	case h.Wait == "away":
		away := h.Away
		if away == "" {
			away = "unknown"
		}
		return a.L.T("handset.wait.away", name), a.L.T("handset.away." + away)
	case h.Wait == "starting":
		return a.L.T("handset.wait.starting", name), ""
	case h.Paused == "asking":
		return a.L.T("handset.paused.asking", name), ""
	case h.Paused != "":
		return a.L.T("handset.paused", name), a.L.T("handset.paused.why")
	case h.Quiet:
		return a.L.T("handset.task", name), a.L.T("handset.quiet", name)
	}
	return a.L.T("handset.task", name), ""
}

// handsetRecordLeft is how long Android's recording prompt on the phone
// still waits (D280): "还剩 1:42", ticking each second; "" once it gave up
// or was answered.
func (a *App) handsetRecordLeft(c *ui.Context, d *store.DecisionState) string {
	until := store.ParseTime(d.Handset.Until)
	if until.IsZero() || d.Resolved != nil || d.Pending != "" {
		return ""
	}
	left := until.Sub(a.Now())
	if left <= 0 {
		return ""
	}
	c.After(time.Second)
	s := int(left.Seconds())
	return a.L.T("handset.record.left", fmt.Sprintf("%d:%02d", s/60, s%60))
}

// handsetRecordButtons is the card that makes Android's recording prompt
// the person's turn (D280): the prompt shows only on the phone, so every
// window says to tap Start now there, counts down, and offers only 不录了 /
// Skip recording. It resolves by itself when the phone answers or gives up.
func (a *App) handsetRecordButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("handset.record.skipped")
		switch {
		case d.Resolved != nil && d.Resolved.Option == "go":
			msg = a.L.T("handset.record.on")
		case d.Resolved != nil && d.Resolved.By == "default":
			msg = a.L.T("handset.record.gave_up")
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	ui.Text(c, a.L.T("handset.record.what")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
	ui.Row(c.Key("handset-record:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		if left := a.handsetRecordLeft(c, d); left != "" {
			ui.Text(c, left).FontSize(t.SM).TextColor(t.NeedsYou.Ink).FontFeatures("tnum")
		}
		ui.Spacer(c)
		if a.buttonFor(c, a.L.T("handset.record.hold"), a.decisionAbout(d), btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
	})
}
