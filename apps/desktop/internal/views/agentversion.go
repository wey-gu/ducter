package views

import "github.com/wey-gu/ducter/apps/desktop/internal/protocol"

// D156: an AI agent's own version, shown in its coin's detail (D161). Quiet
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
