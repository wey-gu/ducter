package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// keepUndone are the Keeps this window undid from their receipt (撤销), so
// the card says so at once.
var keepUndone = map[string]bool{}

// keepReceipt is the receipt under the partner's words when a Keep was made
// (D511's first-made moment, as the web's KeepReceipt): its lantern, 在照看
// and its title, its lines each its own row, the first round's result, and
// 打开, 改一下 and 撤销, each its own button.
func (a *App) keepReceipt(c *ui.Context, key string, card *protocol.KeepCard) {
	t := a.T
	undone := card.Undone || keepUndone[card.ID]
	if p := a.S.KeepPages[card.ID]; p != nil && (p.Life == "stopped" || p.Life == "done") {
		undone = true
	}
	life, kick, kickInk := "on", a.L.T("keep.life.on"), t.Done.Ink
	if undone {
		life, kick, kickInk = "stopped", a.L.T("keep.life.stopped"), t.InkMuted
	}
	ui.Column(c.Key("keepcard:"+key)).MaxWidth(440).MaxWidthPercent(84).Padding(14, 16).Gap(t.S2).Radius(16).Margin(t.S2, 0, 0, 0).
		Background(t.Surface).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleGroup).Label(card.Title).Children(func() {
		ui.Row(c.Key("hd")).Gap(12).AlignItems(ui.Center).Children(func() {
			a.keepMark(c, "r"+key, life, 40)
			ui.Column(c.Key("tx")).Gap(1).Shrink(1).MinWidth(0).Children(func() {
				uiText(c.Key("kick"), kick).FontSize(t.XS).FontWeight(700).TextColor(kickInk)
				uiText(c.Key("t"), keepWords(autospace(card.Title))).FontSize(t.MD).FontWeight(700).TextColor(t.Ink)
			})
		})
		rows := [][2]string{{"keep.card.when", card.When}}
		if card.Speaks != "" {
			rows = append(rows, [2]string{"keep.card.speaks", card.Speaks})
		}
		if card.Until != "" {
			rows = append(rows, [2]string{"keep.card.until", card.Until})
		}
		if card.Where != "" {
			rows = append(rows, [2]string{"keep.card.where", card.Where})
		}
		for _, r := range rows {
			ui.Row(c.Key("r:"+r[0])).Gap(10).Padding(7, 0).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
				uiText(c.Key("k"), a.L.T(r[0])).FontSize(t.SM).TextColor(t.InkMuted).Width(96).Shrink(0)
				uiText(c.Key("v"), keepWords(autospace(r[1]))).FontSize(t.SM).TextColor(t.Ink).Shrink(1)
			})
		}
		if undone {
			uiText(c.Key("undone"), a.L.T("keep.card.undone")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		if card.First != "" {
			uiText(c.Key("first"), keepWords(autospace(a.L.T("keep.card.first", card.First)))).FontSize(t.SM).FontWeight(600).TextColor(t.Done.Ink)
		}
		ui.Row(c.Key("acts")).Gap(8).Wrap().Margin(4, 0, 0, 0).Children(func() {
			if a.buttonFor(c, a.L.T("keep.card.open"), card.Title, btnSecondary, t.ControlSM, t.Surface) {
				a.openKeep(card.ID)
			}
			if a.buttonFor(c, a.L.T("keep.card.change"), card.Title, btnText, t.ControlSM, t.Surface) {
				a.draft = a.L.T("keep.card.change.fill", card.Title)
				a.focusComposer = true
			}
			if a.buttonFor(c, a.L.T("keep.card.undo"), card.Title, btnText, t.ControlSM, t.Surface) {
				keepUndone[card.ID] = true
				a.send(protocol.KeepAct{T: "keep_action", ID: card.ID, Action: "stop"})
			}
		})
		if card.FirstEver {
			uiText(c.Key("ever"), keepWords(autospace(a.L.T("keep.card.firstEver")))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
		}
	})
}
