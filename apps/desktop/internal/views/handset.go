package views

import (
	"strings"

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
	return strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(name), "· Ducter"))
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
			ui.Text(c, a.L.T("handset.using", title)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Grow(1).MinWidth(0)
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
	line := a.L.T("handset.task", name)
	ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5)
	if a.buttonFor(c, a.L.T("handset.stop"), line, btnSecondary, t.ControlSM, t.Chrome) {
		a.send(protocol.HandsetStopReq{T: "handset_stop", TaskID: task.ID})
	}
}
