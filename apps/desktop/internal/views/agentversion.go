package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D153: an AI agent's own version under its row in a device card. Quiet
// by default (版本 0.167.0); one clay dot and 有新版本 x with 更新 when it's
// behind; an honest line when Ducter hasn't checked that version; a copy
// inside an app or inside Ducter says where its update comes from instead
// of a button. While it updates, the step in words; after, 好了 or why not.

// agentBehind: newer on its own channel, updatable from here, not mid-way.
func agentBehind(h *protocol.DeviceHarness) bool {
	return h.Available && h.Latest != "" && !h.Update.Running() && (h.Update == nil || h.Update.Phase != "failed")
}

// agentPhase is an agent update's step in words.
func (a *App) agentPhase(u *protocol.AgentUpdate) string {
	if u == nil {
		return ""
	}
	switch u.Phase {
	case "waiting":
		return a.L.T("agentv.phase.waiting")
	case "updating":
		return a.L.T("agentv.phase.updating", u.To)
	case "checking":
		return a.L.T("agentv.phase.checking", u.To)
	case "done":
		return a.L.T("agentv.phase.done", firstNonEmpty(u.To, u.From))
	case "failed":
		if u.RolledBack {
			return a.L.T("agentv.phase.rolledback", u.From)
		}
		return a.L.T("agentv.phase.failed")
	}
	return ""
}

// agentWhy is why an agent update didn't happen, in plain words.
func (a *App) agentWhy(reason string) string {
	key := "agentv.why." + reason
	if s := a.L.T(key); s != key {
		return s
	}
	return a.L.T("agentv.why.failed")
}

// agentAppName names the app that carries a copy (Codex, Claude).
func agentAppName(harness string) string {
	if harness == "claude-code" {
		return "Claude"
	}
	return "Codex"
}

// agentVersion is the version block inside an AI agent's row.
func (a *App) agentVersion(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness) {
	if !h.Installed || h.Version == "" {
		return
	}
	t := a.T
	d := a.devState()
	u := h.Update
	ui.Column(c.Key("agentv:"+dv.ID+":"+h.Harness)).Gap(t.S1).Margin(t.S1, 0, 0, 0).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
			ui.Text(c, a.L.T("agentv.version", h.Version)).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).Selectable()
			switch {
			case u.Running():
				c.After(500e6)
			case h.How == "app":
				ui.Text(c, a.L.T("agentv.how.app", agentAppName(h.Harness))).FontSize(t.XS).TextColor(t.InkMuted)
			case h.How == "ducter":
				ui.Text(c, a.L.T("agentv.how.ducter")).FontSize(t.XS).TextColor(t.InkMuted)
			case agentBehind(&h):
				a.updateDot(c)
				ui.Text(c, a.L.T("agentv.available", h.Latest)).FontSize(t.XS).FontWeight(800).TextColor(t.Ink)
			}
		})
		if h.Standing == "newer" || h.Standing == "older" {
			ui.Text(c, a.L.T("agentv.unverified")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
		}
		if line := a.agentPhase(u); line != "" {
			ink := t.InkSoft
			switch u.Phase {
			case "done":
				ink = t.Done.Ink
			case "failed":
				ink = t.Failed.Ink
			}
			ui.Text(c, line).FontSize(t.XS).FontWeight(700).TextColor(ink).LineHeight(1.4)
			if u.Phase == "failed" && u.Reason != "" {
				ui.Text(c, a.agentWhy(u.Reason)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
			}
		}
		failedButBehind := u != nil && u.Phase == "failed" && h.Available
		if agentBehind(&h) || failedButBehind {
			if h.LatestVerified != nil && !*h.LatestVerified {
				ui.Text(c, a.L.T("agentv.latest.unverified", h.Latest)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
			}
			if dv.State != protocol.DeviceAwake {
				ui.Text(c, a.L.T("agentv.away", a.deviceNameIn(dv))).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
			} else {
				label := a.L.T("agentv.button")
				if failedButBehind {
					label = a.L.T("agentv.retry")
				}
				a.textRow(c, t.ControlSM).Children(func() {
					if a.buttonFor(c, label, harnessName(h.Harness), btnSecondary, t.ControlSM, t.Surface) {
						d.card.agent = nil
						a.send(protocol.AgentUpdateReq{T: "agent_update", Device: dv.ID, Harness: h.Harness})
					}
				})
			}
		}
		if ans := d.card.agent; ans != nil && ans.Device == dv.ID && ans.Harness == h.Harness {
			ui.Text(c, a.agentWhy(ans.Reason)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).LineHeight(1.4)
		}
	})
}
