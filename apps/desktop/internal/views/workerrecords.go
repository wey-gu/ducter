package views

// D377: the person's own AI agents' records on a computer for tasks, as one
// row on its card: the agents that kept records there (their coins), whether
// the partner may read them, what is read, and the one thing to do
// (读它们留下的记录 / Read what they keep, or 别再看了 / Stop looking). The yes
// is saved on that computer itself. Shown only while looking is on at the
// home and the computer has records or said yes (DeviceView.Records). The
// web's is apps/web/src/worker-records.tsx.

import (
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// workerRecordsState is the row's own state, kept across frames.
type workerRecordsState struct {
	answer *protocol.ServerFrame
}

func (a *App) recordsAllowReq(dv *protocol.DeviceView, on bool) {
	a.wr.answer = nil
	a.send(protocol.RecordsAllowReq{T: "records_allow", Device: dv.ID, On: on})
}

// recordsAgentsWords is "Claude Code和Codex" / "Claude Code and Codex".
func (a *App) recordsAgentsWords(ids []string) string {
	names := make([]string, len(ids))
	for i, h := range ids {
		names[i] = harnessName(h)
	}
	if len(names) <= 1 {
		return strings.Join(names, "")
	}
	return a.L.T("wrec.and", strings.Join(names[:len(names)-1], a.L.T("wrec.comma")), names[len(names)-1])
}

// recordsOnDeviceCard is the row on a device card, on its own raised panel under the coins.
func (a *App) recordsOnDeviceCard(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	ui.Column(c.Key("dc-rec:"+dv.ID)).Margin(t.S3, 0, 0, 0).Padding(t.S1, t.S4).Radius(t.RadiusMD).Background(t.Surface).
		InsetShadow(0, 0, 0, 1, t.Line2).Shadow(0, 2, 0, 0, t.Line2).Children(func() { a.recordsOnDevice(c, dv) })
}

// recordsOnDevice is the row itself.
func (a *App) recordsOnDevice(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	a.drainDeviceResults()
	r := dv.Records
	awake := dv.State == protocol.DeviceAwake
	name := a.deviceNameIn(dv)
	on := r.State == "on"
	var agents []string
	for _, x := range r.Agents {
		agents = append(agents, x.Agent)
	}
	words := a.recordsAgentsWords(agents)
	ink := t.InkMuted
	if on {
		ink = t.Done.Ink
	}
	coins := agents
	if len(coins) == 0 {
		coins = []string{"claude-code"}
	}
	if len(coins) > 3 {
		coins = coins[:3]
	}
	ui.Column(c.Key("wrec:"+dv.ID)).Gap(t.S2).Padding(t.S2, 0).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlMD).Children(func() {
			ui.Row(c).Gap(-12).Shrink(0).Children(func() {
				for _, h := range coins {
					a.coinBox(c, "wrec:"+dv.ID+":"+h, h, 36, !on, coinStill)
				}
			})
			ui.Column(c).Gap(1).Grow(1).MinWidth(0).Children(func() {
				uiText(c, a.L.T("wrec.title")).FontSize(t.MD).FontWeight(800)
				uiText(c, a.L.T("wrec."+r.State)).FontSize(t.XS).TextColor(ink)
			})
		})
		if on {
			a.infoText(c, a.L.T("wrec.why.on", a.S.PersonaName, name, words))
		} else {
			a.infoText(c, a.L.T("wrec.why", name, words, a.S.PersonaName))
		}
		uiText(c, a.L.T("wrec.scope")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
		// The one thing to do, under what it means (the card's column is narrow for a long label).
		label, kind := a.L.T("wrec.allow"), btnPrimary
		if on {
			label, kind = a.L.T("wrec.stop"), btnSecondary
		}
		ui.Row(c).Children(func() {
			if awake && a.buttonFor(c, label, a.L.T("wrec.title"), kind, t.ControlSM, t.Surface) {
				a.recordsAllowReq(dv, !on)
			}
		})
		if ans := a.wr.answer; ans != nil && ans.Device == dv.ID {
			k := "wrec.old"
			if ans.Reason == "away" {
				k = "wrec.away"
			}
			uiText(c, a.L.T(k, name)).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(1.5)
		}
	})
}
