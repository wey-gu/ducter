package views

// D366: Nowledge Mem on a computer for tasks, as one row on its card and on
// the lend sheet: Mem's own app icon and name, where it stands there, and the
// one thing to do (装上, the link to sign in, 接上, 再试一次). Shown only when
// the home has Mem and memory is on (DeviceView.Mem). The web's is
// apps/web/src/worker-mem.tsx, with the same order of looks
// (worker-mem-view.ts).

import (
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// workerMemState is the rows' own state, kept across frames.
type workerMemState struct {
	link    map[string]string // device → the link being pasted
	own     map[string]bool   // D393: device → the person asked to sign in there for their own sessions
	cleared map[string]string // D386: device → the ended step its spent paste was cleared for
	answer  *protocol.ServerFrame
}

// stepKey names how the last step ended (one clear per ending, so a new paste after it stays).
func stepKey(m *protocol.DeviceMemView) string {
	if m.Step == nil {
		return m.State
	}
	return m.Step.Phase + ":" + m.Step.Reason + ":" + m.Step.Detail
}

// memRowLook is where Mem stands there, in the web's order.
func memRowLook(m *protocol.DeviceMemView) string {
	if m.Step != nil {
		switch m.Step.Phase {
		case "installing", "connecting", "failed":
			return m.Step.Phase
		}
	}
	return m.State
}

// memRowHealth is what Mem's own doctor there says is wrong when the row
// would otherwise just ask to sign in (D375, the web's memRowHealth):
// unreachable | signed_out | old, or "".
func memRowHealth(m *protocol.DeviceMemView) string {
	if memRowLook(m) != "sign_in" || m.Health == nil || memRowTheirs(m) == "old" {
		return ""
	}
	switch m.Health.Issue {
	case "unreachable", "signed_out", "old":
		return m.Health.Issue
	}
	return ""
}

// memRowTheirs is the person's own Mem command line there when it is too old
// to sign in (D386, the web's memRowTheirs): old (nothing of Ducter's there
// yet: its own current copy is offered, never the paste) | using (Ducter's
// own is used there) | "".
func memRowTheirs(m *protocol.DeviceMemView) string {
	if m.Theirs == nil || !m.Theirs.Old {
		return ""
	}
	if m.Ours {
		return "using"
	}
	return "old"
}

// theirUpdateCommand is the one command that updates the person's own copy
// (D386: shown, never run), or "".
func theirUpdateCommand(m *protocol.DeviceMemView) string {
	if m.Theirs == nil {
		return ""
	}
	switch m.Theirs.How {
	case "pipx":
		return "pipx upgrade nmem-cli"
	case "uv":
		return "uv tool upgrade nmem-cli"
	case "pip":
		return "python3 -m pip install --user --upgrade nmem-cli"
	}
	return ""
}

// memKeepsPaste: after a failed sign-in, the paste stays in the box only when
// nothing was spent (D386, the web's memKeepsPaste).
func memKeepsPaste(reason string) bool {
	switch reason {
	case "bad_link", "old", "network", "space", "unsupported", "unreachable":
		return true
	}
	return false
}

// memUnconnected is the agents Mem connects by itself (Codex, Claude Code)
// that are installed there and not connected to it yet.
func memUnconnected(dv *protocol.DeviceView) []string {
	if dv.Mem == nil || dv.Mem.State != "ready" {
		return nil
	}
	on := map[string]bool{}
	for _, h := range dv.Mem.Agents {
		on[h] = true
	}
	var out []string
	for _, h := range dv.Harnesses {
		if h.Installed && (h.Harness == "codex" || h.Harness == "claude-code") && !on[h.Harness] {
			out = append(out, h.Harness)
		}
	}
	return out
}

func (a *App) memSetupReq(dv *protocol.DeviceView, action, link string) {
	a.wm.answer = nil
	a.send(protocol.MemSetupReq{T: "mem_setup", Device: dv.ID, Action: action, Link: link})
}

// memAgentsWords is "Codex 和 Claude Code" / "Codex and Claude Code".
func (a *App) memAgentsWords(ids []string) string {
	names := make([]string, len(ids))
	for i, h := range ids {
		names[i] = harnessName(h)
	}
	if len(names) <= 1 {
		return strings.Join(names, "")
	}
	return a.L.T("wmem.and", strings.Join(names[:len(names)-1], a.L.T("wmem.comma")), names[len(names)-1])
}

// memReadyWords says which agents there use it, and which aren't connected yet.
func (a *App) memReadyWords(dv *protocol.DeviceView) string {
	left := memUnconnected(dv)
	var installed, on []string
	for _, h := range dv.Harnesses {
		if h.Installed && (h.Harness == "codex" || h.Harness == "claude-code") {
			installed = append(installed, h.Harness)
			if !contains(left, h.Harness) {
				on = append(on, h.Harness)
			}
		}
	}
	name := a.deviceNameIn(dv)
	switch {
	case len(installed) == 0:
		return a.L.T("wmem.ready.noagent", name)
	case len(on) == 0:
		return a.L.T("wmem.ready.none", name)
	case len(left) > 0:
		return a.L.T("wmem.ready.why", name, a.memAgentsWords(on)) + " " + a.L.T("wmem.ready.left", a.memAgentsWords(left))
	}
	return a.L.T("wmem.ready.why", name, a.memAgentsWords(on))
}

// memOnDeviceCard is the row on a device card, on its own raised panel under the coins.
func (a *App) memOnDeviceCard(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	ui.Column(c.Key("dc-mem:"+dv.ID)).Margin(t.S3, 0, 0, 0).Padding(t.S1, t.S4).Radius(t.RadiusMD).Background(t.Surface).
		InsetShadow(0, 0, 0, 1, t.Line2).Shadow(0, 2, 0, 0, t.Line2).Children(func() { a.memOnDevice(c, dv) })
}

// memOnDevice is Nowledge Mem's row on a computer for tasks.
func (a *App) memOnDevice(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	a.drainDeviceResults()
	m := dv.Mem
	look := memRowLook(m)
	health := memRowHealth(m) // D375
	theirs := memRowTheirs(m) // D386
	awake := dv.State == protocol.DeviceAwake
	// D386: a paste that wasn't spent stays after a failure; a spent one (or a sign-in done) is cleared.
	if (look == "failed" && !memKeepsPaste(m.Step.Reason)) || (m.Step == nil && m.State == "ready") {
		if a.wm.link != nil && a.wm.link[dv.ID] != "" && a.wm.cleared[dv.ID] != stepKey(m) {
			a.wm.link[dv.ID] = ""
		}
		if a.wm.cleared == nil {
			a.wm.cleared = map[string]string{}
		}
		a.wm.cleared[dv.ID] = stepKey(m)
	} else if a.wm.cleared != nil {
		delete(a.wm.cleared, dv.ID)
	}
	name := a.deviceNameIn(dv)
	if look == "installing" || look == "connecting" {
		c.After(500e6)
	}
	// D393: the home carries Mem to the tasks here: they remember with nothing set up; this
	// computer's own sign-in is only for the person's own sessions, asked for when they want it.
	carried := m.Carried && look != "installing" && look != "connecting" && look != "failed"
	own := a.wm.own != nil && a.wm.own[dv.ID]
	home := ""
	for _, d := range a.S.Devices {
		if d.Home {
			home = a.deviceNameIn(&d)
		}
	}
	word := a.L.T("wmem.absent", name)
	ink := t.InkMuted
	switch look {
	case "ready":
		word, ink = a.L.T("wmem.ready"), t.Done.Ink
	case "installing":
		word = a.L.T("wmem.installing")
		if m.Step.Pct > 0 {
			word += " " + strconv.Itoa(m.Step.Pct) + "%"
		}
	case "connecting":
		word = a.L.T("wmem.connecting", name)
	case "sign_in":
		word = a.L.T("wmem.signin.line")
		if theirs == "old" {
			word, ink = a.L.T("wmem.theirs.old", name), t.Failed.Ink
		} else if health != "" {
			word, ink = a.L.T("wmem.health."+health, name), t.Failed.Ink
		}
	case "failed":
		reason := "failed"
		if m.Step.Reason != "" {
			reason = m.Step.Reason
		}
		word, ink = a.memFailedWords(reason, name), t.Failed.Ink
	}
	if carried {
		word, ink = a.L.T("wmem.carried"), t.Done.Ink
	}
	ui.Column(c.Key("wmem:"+dv.ID)).Gap(t.S2).Padding(t.S2, 0).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlMD).Children(func() {
			if src := theme.Brand("nowledge_mem"); src != nil {
				img := ui.Image(c.Key("wmem-icon:"+dv.ID), src).Size(36, 36).Radius(t.RadiusSM).AccessHidden(true)
				if look != "ready" && !carried {
					img.Opacity(0.55)
				}
			}
			ui.Column(c).Gap(1).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, "Nowledge Mem").FontSize(t.MD).FontWeight(800)
				ui.Text(c, word).FontSize(t.XS).TextColor(ink)
			})
			installKind := btnPrimary
			if carried {
				installKind = btnSecondary
			}
			switch {
			case carried && look == "sign_in" && !own && theirs != "old" && health != "unreachable" && health != "old":
				if awake && a.buttonFor(c, a.L.T("wmem.own.go"), "Nowledge Mem", btnSecondary, t.ControlSM, t.Surface) {
					if a.wm.own == nil {
						a.wm.own = map[string]bool{}
					}
					a.wm.own[dv.ID] = true
				}
			case look == "absent" && m.Installable:
				if awake && a.buttonFor(c, a.L.T("wmem.install"), "Nowledge Mem", installKind, t.ControlSM, t.Surface) {
					a.memSetupReq(dv, "install", "")
				}
			case theirs == "old" && look == "sign_in" && m.Installable:
				if awake && a.buttonFor(c, a.L.T("wmem.theirs.install"), "Nowledge Mem", btnPrimary, t.ControlSM, t.Surface) {
					a.memSetupReq(dv, "install", "")
				}
			case theirs == "old" && look == "failed" && m.Installable:
				if awake && a.buttonFor(c, a.L.T("wmem.retry"), "Nowledge Mem", btnSecondary, t.ControlSM, t.Surface) {
					a.memSetupReq(dv, "install", "")
				}
			case look == "failed" && m.State == "absent":
				if awake && a.buttonFor(c, a.L.T("wmem.retry"), "Nowledge Mem", btnSecondary, t.ControlSM, t.Surface) {
					a.memSetupReq(dv, "install", "")
				}
			case health == "unreachable":
				if awake && a.buttonFor(c, a.L.T("wmem.again"), "Nowledge Mem", btnSecondary, t.ControlSM, t.Surface) {
					a.memSetupReq(dv, "look", "")
				}
			case health == "old" && m.Ours:
				if awake && a.buttonFor(c, a.L.T("wmem.update"), "Nowledge Mem", btnPrimary, t.ControlSM, t.Surface) {
					a.memSetupReq(dv, "install", "")
				}
			case look == "ready" && len(memUnconnected(dv)) > 0:
				if awake && a.buttonFor(c, a.L.T("wmem.connect"), "Nowledge Mem", btnSecondary, t.ControlSM, t.Surface) {
					a.memSetupReq(dv, "connect", "")
				}
			}
		})
		if look == "failed" && m.Step.Detail != "" {
			ui.Text(c, m.Step.Detail).FontSize(t.XS).TextColor(t.InkSoft).LineHeight(1.4)
		}
		if carried {
			a.infoText(c, a.L.T("wmem.carried.why", home))
			soft := ""
			switch {
			case look == "absent" && m.Installable:
				soft = a.L.T("wmem.own.absent", name)
			case look == "sign_in" && !own && theirs != "old":
				soft = a.L.T("wmem.own.signin", name)
			case health != "":
				soft = a.L.T("wmem.health."+health, name)
			}
			if soft != "" {
				ui.Text(c, soft).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
			}
		}
		switch {
		case carried && look == "absent":
		case carried && look == "ready":
			ui.Text(c, a.memReadyWords(dv)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
		case look == "absent":
			if m.Installable {
				a.infoText(c, a.L.T("wmem.absent.why", name))
				ui.Text(c, a.L.T("ag.where")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
			} else {
				a.infoText(c, a.L.T("wmem.absent.none", name))
			}
		case look == "ready":
			a.infoText(c, a.memReadyWords(dv))
		}
		if health == "old" && !m.Ours {
			a.infoText(c, a.L.T("wmem.health.old.how", name))
		}
		if theirs != "" && look != "installing" && look != "connecting" {
			if theirs == "old" && m.Installable {
				a.infoText(c, a.L.T("wmem.theirs.why", name))
			}
			if theirs == "using" {
				ui.Text(c, a.L.T("wmem.theirs.using", name)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
			}
			if cmd := theirUpdateCommand(m); cmd != "" {
				ui.Text(c, a.L.T("wmem.theirs.cmd", name)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
				ui.Text(c, cmd).Font(t.Mono).FontSize(t.XS).TextColor(t.Ink).Selectable()
			} else {
				ui.Text(c, a.L.T("wmem.theirs.guide")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
			}
		}
		if awake && theirs != "old" && ((look == "sign_in" && health != "unreachable" && health != "old" && (!m.Carried || own)) || (look == "failed" && m.State == "sign_in")) {
			a.memSignIn(c, dv)
		}
		if r := a.wm.answer; r != nil && r.Device == dv.ID {
			k := "ag.old"
			if r.Reason == "away" {
				k = "ag.away"
			}
			ui.Text(c, a.L.T(k, name)).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(1.5)
		}
	})
}

// memFailedWords is why the last step didn't work. Only the lines about the
// computer name it (D370: the others took no argument, and Go printed
// "%!(EXTRA string=haswell)" after them).
func (a *App) memFailedWords(reason, name string) string {
	return a.L.TFamily("wmem.failed."+reason, name)
}

// memSignIn is where to get the connect link (Mem copies it as a whole
// prompt, D370), the box to paste it in, and 登录.
func (a *App) memSignIn(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	if a.wm.link == nil {
		a.wm.link = map[string]string{}
	}
	v := a.wm.link[dv.ID]
	ui.Column(c.Key("wmem-signin:"+dv.ID)).Gap(t.S2).Padding(t.S3, t.S3).Radius(t.RadiusSM).Background(t.Bg).Children(func() {
		how := a.L.T("wmem.signin.how")
		if b := a.S.Bridge; b != nil && b.Where == "local" {
			home := ""
			for _, d := range a.S.Devices {
				if d.Home {
					home = a.deviceNameIn(&d)
				}
			}
			how = a.L.T("wmem.signin.local", home, a.deviceNameIn(dv))
		}
		ui.Text(c, how).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.5)
		ui.Row(c).Gap(t.S2).AlignItems(ui.End).Children(func() {
			ui.TextArea(c.Key("wmem-link:"+dv.ID), &v).Lines(2, 4).Placeholder(a.L.T("wmem.signin.ph")).Label(a.L.T("wmem.signin.link")).
				FontSize(t.SM).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft).Grow(1).MinWidth(0)
			if a.buttonFor(c, a.L.T("wmem.signin.go"), "Nowledge Mem", btnPrimary, t.ControlSM, t.Bg) && strings.TrimSpace(v) != "" {
				// D386: kept until the step ends (memOnDevice clears a spent one).
				a.memSetupReq(dv, "connect", strings.TrimSpace(v))
			}
		})
	})
	a.wm.link[dv.ID] = v
}
