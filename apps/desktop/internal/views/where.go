package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D157 (design/where.md): where a task runs. With one computer nothing is
// said; with two or more, every task says which one in a few words ("在 hel
// 上 · 用 Ducter 自己的浏览器"), and the reason is one hover away.

// computers are the devices that run tasks: the home and its workers. The
// first time a task's where is drawn on a connected window that never asked
// for devices, it asks (then every new socket does, as for Devices).
func (a *App) computers() []protocol.DeviceView {
	if a.S.DevicesAt.IsZero() && !a.devicesAsked && a.Status == client.Connected {
		a.devicesAsked = true
		a.send(protocol.DevicesReq{T: "devices"})
	}
	var out []protocol.DeviceView
	for _, d := range a.S.Devices {
		if d.Kind != "phone" {
			out = append(out, d)
		}
	}
	return out
}

// manyComputers: two or more computers run tasks, so every task says where.
func (a *App) manyComputers() bool { return len(a.computers()) > 1 }

// computerOf finds a computer by the name or id a place carries ("local"
// and "" are the home).
func (a *App) computerOf(d string) *protocol.DeviceView {
	cs := a.computers()
	for i := range cs {
		if (d == "" || d == "local") && cs[i].Home {
			return &cs[i]
		}
		if d != "" && (cs[i].ID == d || strings.EqualFold(cs[i].Name, d)) {
			return &cs[i]
		}
	}
	return nil
}

// computerName is a computer's own name: never "this Mac" once there are
// two (on a phone, or with the home on a server, "this" means nothing).
func (a *App) computerName(d string) string {
	if c := a.computerOf(d); c != nil && c.Name != "" {
		return c.Name
	}
	return a.device(d)
}

// whereOf is the task's latest where, from who does it (body_selected).
func whereOf(task *store.Task) *protocol.WhereWhy {
	if task.Body != nil {
		return task.Body.Why.Where
	}
	return nil
}

// whereUses is what it uses there when that is the point: the user's
// Chrome, Ducter's own browser, an app.
func (a *App) whereUses(w *protocol.WhereWhy) string {
	if w == nil {
		return ""
	}
	switch w.Uses {
	case "chrome":
		return a.L.T("where.your_chrome")
	case "ducter":
		return a.L.T("where.ducter_browser")
	case "app":
		if w.App != "" {
			return a.L.T("where.app", w.App)
		}
	}
	return ""
}

// whereReason is the one reason, in words (where.md §8).
func (a *App) whereReason(w *protocol.WhereWhy) string {
	if w == nil {
		return ""
	}
	dev := a.computerName(w.Device)
	switch w.Kind {
	case "always_on":
		if w.Other != "" {
			return a.L.T("where.reason.always_on", w.Other)
		}
		return a.L.T("where.reason.always_on.0")
	case "signed_in":
		if w.Site != "" {
			return a.L.T("where.reason.signed_in", w.Site)
		}
		return a.L.T("where.reason.signed_in.0")
	case "only_here":
		switch w.Thing {
		case "app":
			return a.L.T("where.reason.only_app", dev, w.App)
		case "chrome":
			return a.L.T("where.reason.only_chrome", dev)
		case "browser":
			return a.L.T("where.reason.only_web", dev)
		case "agent":
			return a.L.T("where.reason.agent_here", harnessName(w.Agent), dev)
		}
	case "awake":
		return a.L.T("where.reason.awake", w.Other, dev)
	case "changes_here":
		return a.L.T("where.reason.changes", dev)
	case "agent_here":
		return a.L.T("where.reason.agent_here", harnessName(w.Agent), dev)
	case "no_signin":
		return a.L.T("where.reason.no_signin", dev)
	case "moved":
		return a.L.T("where.reason.moved", w.Other, dev)
	case "you":
		if w.Text != "" {
			return a.L.T("where.reason.rule", w.Text)
		}
		return a.L.T("where.reason.you", dev)
	case "home":
		return a.L.T("where.reason.home", dev)
	}
	return ""
}

// whereAskQuestion is a where ask in the user's words (where.md §4.4).
func (a *App) whereAskQuestion(w *protocol.WhereAsk) string {
	switch {
	case w.Kind == "pin":
		return a.L.T("where.ask.pin", harnessName(w.Agent), w.Device)
	case w.State == "unreachable":
		return a.L.T("where.ask.away", w.Device, w.Other)
	case w.Here == "chrome":
		return a.L.T("where.ask.asleep.chrome", w.Device, w.Other)
	}
	return a.L.T("where.ask.asleep", w.Device, w.Other)
}

// whereAskGo is Go: do it now on the other computer (or with another agent).
func (a *App) whereAskGo(w *protocol.WhereAsk) string {
	if w.Kind == "pin" && w.OtherAgent != "" {
		return a.L.T("where.ask.now.pin", harnessName(w.OtherAgent))
	}
	return a.L.T("where.ask.now", w.Other)
}

// whereAskHold is Hold, the default: wait for it.
func (a *App) whereAskHold(w *protocol.WhereAsk) string {
	if w.Kind == "pin" {
		return a.L.T("where.ask.wait.pin")
	}
	return a.L.T("where.ask.wait")
}

// whereAskLines is what choosing now costs (a sign-in there; the user's
// Chrome, said plainly: access never widens silently), then the default.
func (a *App) whereAskLines(c *ui.Context, w *protocol.WhereAsk) {
	t := a.T
	if w.SignIn {
		line := a.L.T("where.ask.signin.0", w.Other)
		if w.Site != "" {
			line = a.L.T("where.ask.signin", w.Other, w.Site)
		}
		ui.Text(c.Key("w-signin"), line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45)
	}
	if w.Widens {
		ui.Text(c.Key("w-widens"), a.L.T("switch.move.widens")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).LineHeight(1.45)
	}
	a.mark(c.Key("default"), drawClock, a.L.T("where.ask.default"), t.NeedsYou.Ink)
}

// taskWhere is the where part of a task's meta line and its hover: "在 hel
// 上 · 用 Ducter 自己的浏览器", "为什么在 hel 上：…". Empty with one computer.
func (a *App) taskWhere(task *store.Task) (line, why string) {
	if !a.manyComputers() {
		return "", ""
	}
	p := task.Place()
	name := a.computerName(p.Device)
	w := whereOf(task)
	// A move or a re-pick since: the place says where it is now; the reason is for there only.
	if w != nil && a.computerName(w.Device) != name {
		w = nil
	}
	line = strings.Join(nonEmpty(a.L.T("where.on", name), a.whereUses(w)), " · ")
	if r := a.whereReason(w); r != "" {
		why = a.L.T("where.why", name, r)
	}
	return line, why
}
