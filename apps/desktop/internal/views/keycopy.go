package views

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// 复制密钥 / Copy a key (D539, design/autofill.md §9): a key the person
// already has on one of their computers, copied to others for Ducter's
// tasks there on their one Copy. The card names the variable, where it is
// and where it goes, then 先不 · 复制; nothing is typed, nothing is shown.
// Each computer's card has Ducter 存着的密钥 / Keys Ducter keeps: names
// only, each removable. The same words as the web (i18n-autofill.ts).

// computersSaid joins computer names as a person says them.
func (a *App) computersSaid(names []string) string {
	if len(names) <= 1 {
		return strings.Join(names, "")
	}
	return strings.Join(names[:len(names)-1], a.L.T("acct.sep")) + a.L.T("copykey.and") + names[len(names)-1]
}

func copyTargets(k *protocol.CopyKeyAsk) []string {
	out := make([]string, 0, len(k.To))
	for _, t := range k.To {
		out = append(out, t.Name)
	}
	return out
}

// copyKeyTitle is the card's question: 把 Mac 上的 X 复制到 hel 和 haswell？
func (a *App) copyKeyTitle(d *store.DecisionState) string {
	k := d.CopyKey
	return a.L.T("copykey.title", k.Env, k.From.Name, a.computersSaid(copyTargets(k)))
}

func copyWhy(w string) string {
	switch w {
	case "offline", "old", "gone":
		return "copykey.why." + w
	}
	return "copykey.why.failed"
}

// copyKeyButtons is the card's body: the facts, what didn't go (why), the
// note and the two buttons; after, 已复制到 … or 没有复制.
func (a *App) copyKeyButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	k := d.CopyKey
	run := a.S.KeyCopies[d.DecisionID]
	failedAll := run != nil && len(run.To) == 0 && d.Resolved == nil
	open := (d.Resolved == nil && d.Pending == "") || failedAll
	ui.Column(c.Key("copykey:" + d.DecisionID)).Gap(t.S2).Padding(t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
		fact := func(label, v string, mono bool) {
			ui.Row(c).Gap(t.S3).Children(func() {
				uiText(c, a.L.T(label)).FontSize(t.SM).TextColor(t.InkMuted).Width(72)
				tx := uiText(c, v).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0)
				if mono {
					tx.Font(t.Mono)
				}
			})
		}
		fact("key.env", k.Env, true)
		if k.Name != "" && k.Name != k.Env {
			fact("key.what", k.Name, false)
		}
		fact("copykey.from", k.From.Name, false)
		fact("copykey.to", a.computersSaid(copyTargets(k)), false)
		if k.Why != "" {
			fact("key.why", k.Why, false)
		}
	})
	if run != nil {
		for _, f := range run.Failed {
			uiText(c, a.L.T("copykey.failed", f.Name, a.L.T(copyWhy(f.Why)))).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(a.leading(1.5))
		}
	}
	if !open {
		msg := a.L.T("copykey.held")
		switch {
		case d.Resolved == nil && d.Pending == "go" && run == nil:
			msg = a.L.T("copykey.copying")
		case (d.Resolved != nil && d.Resolved.Option == "go") || d.Pending == "go":
			to := copyTargets(k)
			if run != nil && len(run.To) > 0 {
				to = run.To
			}
			msg = a.L.T("copykey.done", a.computersSaid(to))
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 16, drawCheck(t.InkMuted))
			uiText(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
		return
	}
	uiText(c, a.L.T("copykey.note")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
	goLabel := a.L.T("copykey.go")
	if failedAll {
		goLabel = a.L.T("copykey.retry")
	}
	ui.Row(c.Key("copykey-go:" + d.DecisionID)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("copykey.hold"), k.Env, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.buttonFor(c, goLabel, k.Env, btnPrimary, st.height, st.quietBg) {
			if dd := a.S.Decisions[d.DecisionID]; dd != nil {
				dd.Pending, dd.AnsweredAt = "go", a.Now()
			}
			delete(a.S.KeyCopies, d.DecisionID)
			a.markRead()
			a.send(protocol.Decide{T: "decide", DecisionID: d.DecisionID, Option: "go"})
		}
	})
}

// keptKeysAsked: when each computer's list was last asked for (once a
// minute at most while its card is open).
var keptKeysAsked = map[string]time.Time{}

// keptKeysFold is Ducter 存着的密钥 / Keys Ducter keeps on a computer's
// card, folded: the names it keeps for Ducter's tasks there, each with
// 删掉 (asked once: 确定删掉).
func (a *App) keptKeysFold(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	device := dv.ID
	if dv.Home {
		device = "local"
	}
	f := a.S.KeptKeys[device]
	summary := ""
	if f != nil && f.OK && len(f.SavedKeys) > 0 {
		summary = a.L.T("kept.count", len(f.SavedKeys))
	}
	if at, ok := keptKeysAsked[device]; !ok || a.Now().Sub(at) > time.Minute {
		keptKeysAsked[device] = a.Now()
		a.send(protocol.KeptKeysReq{T: "kept_keys", Device: device})
	}
	a.sheetFold(c, "kept:"+device, a.L.T("kept.title"), summary, false, func() {
		ui.Column(c.Key("kept-body:"+device)).Gap(t.S2).Padding(t.S2, t.S2).Children(func() {
			if f == nil {
				return
			}
			if !f.OK {
				key := "kept.failed"
				switch f.Why {
				case "offline":
					key = "kept.offline"
				case "unsupported":
					key = "kept.old"
				}
				uiText(c, a.L.T(key)).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
				return
			}
			uiText(c, a.L.T("kept.lede")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
			if len(f.SavedKeys) == 0 {
				uiText(c, a.L.T("kept.none")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
				return
			}
			for _, k := range f.SavedKeys {
				k := k
				ui.Row(c.Key("kept:"+device+":"+k.Env)).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, 0).MinHeight(52).Children(func() {
					a.afPebble(c, "kept:"+device+":"+k.Env, drawKey)()
					ui.Column(c).Gap(2).Grow(1).Basis(0).MinWidth(0).Children(func() {
						uiText(c, k.Name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).MaxLines(2).LineHeight(1.35)
						uiText(c, k.Env).FontSize(t.XS).Font(t.Mono).TextColor(t.InkMuted).SingleLine()
						if k.From != "" {
							uiText(c, a.L.T("kept.from", k.From)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
						}
					})
					sure := a.devState().card.sheet.keptSure == device+":"+k.Env
					if sure {
						if a.buttonFor(c, a.L.T("kept.remove.sure"), k.Name, btnSecondary, t.ControlSM, t.Surface) {
							a.devState().card.sheet.keptSure = ""
							a.send(protocol.KeptKeyRemove{T: "kept_key_remove", Device: device, Env: k.Env})
						}
					} else if a.buttonFor(c, a.L.T("kept.remove"), k.Name, btnText, t.ControlSM, t.Surface) {
						a.devState().card.sheet.keptSure = device + ":" + k.Env
					}
				})
			}
		})
	})
}
