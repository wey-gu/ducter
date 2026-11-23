package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// peersHelpers is 你的帮手 / Your helpers on Agent 通信 (D494), while there
// are any: each helper's name (what the person's agents find it by in
// Nowledge Mem), what it takes in their words, where its address stands,
// the work on hand and this week's, each fact its own line; 停下 / Stop and
// 接着收 / Take work again at the right edge. Its tile is its first letter
// on the sunken pebble (no metaphor), as the web's (memory.tsx PeersHelpers).
func (a *App) peersHelpers(c *ui.Context) {
	hs := a.S.Helpers
	if len(hs) == 0 {
		return
	}
	t := a.T
	a.group(c, "peers-helpers", a.L.T("peers.helpers.title"), "", func() {
		for _, h := range hs {
			h := h
			state := h.Mem
			if h.State == "stopped" {
				state = "stopped"
			}
			a.sep(c)
			ui.Row(c.Key("helper:"+h.ID)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
				a.tileCol(c, a.toolTile(c, h.Name))
				a.wordsThenControl(c, func() {
					uiText(c, h.Name).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
					if h.About != "" {
						uiText(c, a.L.T("peers.helper.takes", h.About)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
					}
					uiText(c, a.L.T("peers.helper."+state)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
					if h.Open > 0 || h.Week > 0 {
						ui.Row(c.Key("helper-counts:"+h.ID)).Gap(t.S3).Wrap().Children(func() {
							if h.Open > 0 {
								uiText(c, a.L.T("peers.helper.open", h.Open)).FontSize(t.SM).TextColor(t.InkMuted)
							}
							if h.Week > 0 {
								uiText(c, a.L.T("peers.helper.week", h.Week)).FontSize(t.SM).TextColor(t.InkMuted)
							}
						})
					}
				}, func() {
					label, kind := a.L.T("peers.helper.stop"), "helper_stop"
					if h.State == "stopped" {
						label, kind = a.L.T("peers.helper.resume"), "helper_resume"
					}
					if a.buttonFor(c, label, h.Name, btnText, t.ControlSM, t.Surface) {
						a.send(protocol.HelperToggle{T: kind, ID: h.ID})
						for i := range a.S.Helpers {
							if a.S.Helpers[i].ID == h.ID {
								if kind == "helper_stop" {
									a.S.Helpers[i].State = "stopped"
								} else {
									a.S.Helpers[i].State = "on"
								}
							}
						}
					}
				})
			})
		}
		a.sep(c)
		ui.Row(c.Key("helpers-foot")).Padding(t.S3, t.S5).Children(func() {
			uiText(c, a.L.T("peers.helpers.foot")).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		})
	})
}
