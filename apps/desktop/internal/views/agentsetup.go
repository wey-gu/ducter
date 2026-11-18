package views

// D363: one AI agent on a device as a row: its coin and name, where it
// stands, and the one thing to do (安装, 登录, 再试一次), with its sign-in
// opening in place under it (Codex's link and code, Claude's link and the
// code to paste back, pi's line for that computer's terminal). The device
// card and the lend sheet use the same row; the web's is
// apps/web/src/agent-setup.tsx, with the same order of looks.

import (
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// agentSetupState is the rows' own state, kept across frames.
type agentSetupState struct {
	looked  string            // the device whose card last asked to look again
	picked  map[string]bool   // "device|harness" → checked on the lend sheet
	skipped map[string]bool   // the lend sheets whose 以后再说 or 装上 was pressed
	code    map[string]string // "device|harness" → the code being pasted
	answer  *protocol.ServerFrame
}

// agentRowLook is where an agent stands, in the web's order (agent-setup-view.ts).
func agentRowLook(h protocol.DeviceHarness) string {
	switch {
	case h.Setup != nil && h.Setup.Phase == "installing":
		return "installing"
	case h.Setup != nil && h.Setup.Phase == "queued":
		return "queued"
	case h.Installed && h.LoggedIn && (h.Login == nil || h.Login.State != "done"):
		return "ready"
	case h.Installed && h.Login != nil:
		return "login"
	case h.Installed:
		return "signin"
	case h.Setup != nil && h.Setup.Phase == "failed":
		return "failed"
	case h.Installable:
		return "install"
	}
	return "missing"
}

// installOrder is the order the lend sheet offers them in.
var installOrder = []string{"codex", "claude-code", "deepseek-harness", "pi"}

// offerable is what the lend sheet offers to install, and whether it starts
// checked (Codex and Claude Code; pi signs in from that computer's terminal,
// and DeepSeek Harness, D371, is offered unchecked: it needs a key or its app).
func offerable(hs []protocol.DeviceHarness) (ids []string, checked map[string]bool) {
	checked = map[string]bool{}
	for _, id := range installOrder {
		for _, h := range hs {
			if h.Harness == id && !h.Installed && h.Installable {
				ids = append(ids, id)
				checked[id] = id == "codex" || id == "claude-code"
			}
		}
	}
	return ids, checked
}

func anyReady(hs []protocol.DeviceHarness) bool {
	for _, h := range hs {
		if h.Installed && h.LoggedIn {
			return true
		}
	}
	return false
}

func anySetup(hs []protocol.DeviceHarness, phases ...string) bool {
	for _, h := range hs {
		if h.Setup == nil {
			continue
		}
		for _, p := range phases {
			if h.Setup.Phase == p {
				return true
			}
		}
	}
	return false
}

func (a *App) agentSetupReq(dv *protocol.DeviceView, action string, r protocol.AgentSetupReq) {
	r.T, r.Device, r.Action = "agent_setup", dv.ID, action
	if action != "look" {
		a.ag.answer = nil
	}
	a.send(r)
}

// lookAgainOnce asks that computer to look at its agents again, once per
// opening of its card (one installed by hand shows now).
func (a *App) lookAgainOnce(dv *protocol.DeviceView) {
	if dv.State != protocol.DeviceAwake || a.ag.looked == dv.ID {
		return
	}
	a.ag.looked = dv.ID
	a.agentSetupReq(dv, "look", protocol.AgentSetupReq{})
}

func (a *App) agentWord(dv *protocol.DeviceView, h protocol.DeviceHarness, look string) string {
	switch look {
	case "ready":
		return a.L.T("ag.ready")
	case "signin", "login":
		return a.L.T("ag.signed_out")
	case "installing":
		if h.Setup != nil && h.Setup.Pct > 0 {
			return a.L.T("ag.installing") + " " + strconv.Itoa(h.Setup.Pct) + "%"
		}
		return a.L.T("ag.installing")
	case "queued":
		return a.L.T("ag.queued")
	case "failed":
		reason := "failed"
		if h.Setup != nil && h.Setup.Reason != "" {
			reason = h.Setup.Reason
		}
		return a.L.T("ag.failed."+reason, a.deviceNameIn(dv))
	}
	return a.L.T("ag.missing")
}

// agentRow is one agent's row. pick: the lend sheet's switch instead of 安装.
func (a *App) agentRow(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness, pick *bool) {
	t := a.T
	look := agentRowLook(h)
	name := harnessName(h.Harness)
	awake := dv.State == protocol.DeviceAwake
	if look == "installing" || look == "queued" || (h.Login != nil && (h.Login.State == "starting" || h.Login.State == "checking")) {
		c.After(500e6)
	}
	ui.Column(c.Key("ag-row:"+dv.ID+":"+h.Harness)).Gap(t.S2).Padding(t.S2, 0).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlMD).Children(func() {
			motion := coinStill
			if look == "installing" {
				motion = coinWorking
			}
			a.coinBox(c, "ag:"+dv.ID, h.Harness, 36, look != "ready" && look != "installing", motion)
			ui.Column(c).Gap(1).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, name).FontSize(t.MD).FontWeight(800)
				ink := t.InkMuted
				switch look {
				case "failed":
					ink = t.Failed.Ink
				case "ready":
					ink = t.Done.Ink
				}
				ui.Text(c, a.agentWord(dv, h, look)).FontSize(t.XS).TextColor(ink)
			})
			switch {
			case pick != nil && look == "install":
				// The lend sheet: a switch per agent, one 装上 under them all.
				a.switchControl(c, "ag-pick:"+dv.ID+":"+h.Harness, name, pick)
			case look == "install":
				if awake && a.buttonFor(c, a.L.T("ag.install"), name, btnSecondary, t.ControlSM, t.Surface) {
					a.agentSetupReq(dv, "install", protocol.AgentSetupReq{Harnesses: []string{h.Harness}})
				}
			case look == "failed":
				if awake && a.buttonFor(c, a.L.T("ag.retry"), name, btnSecondary, t.ControlSM, t.Surface) {
					a.agentSetupReq(dv, "install", protocol.AgentSetupReq{Harnesses: []string{h.Harness}})
				}
			case look == "signin":
				if awake && a.buttonFor(c, a.L.T("ag.signin"), name, btnPrimary, t.ControlSM, t.Surface) {
					a.agentSetupReq(dv, "login", protocol.AgentSetupReq{Harness: h.Harness})
				}
			}
		})
		if look == "failed" && h.Setup != nil && h.Setup.Detail != "" {
			ui.Text(c, h.Setup.Detail).FontSize(t.XS).TextColor(t.InkSoft).LineHeight(1.4)
		}
		// D371: its command line is big; say so before the tap.
		if (look == "install" || look == "queued") && h.Harness == "deepseek-harness" {
			ui.Text(c, a.L.T("ag.dsh.size")).FontSize(t.XS).TextColor(t.InkSoft).LineHeight(1.4)
		}
		if look == "login" {
			a.agentLoginPanel(c, dv, h)
		}
	})
}

// agentLoginPanel is the sign-in in place: what to open, the code, the paste box.
func (a *App) agentLoginPanel(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness) {
	t := a.T
	l := h.Login
	name := harnessName(h.Harness)
	key := coinKey(dv.ID, h.Harness)
	ui.Column(c.Key("ag-login:"+key)).Gap(t.S2).Padding(t.S3, t.S3).Radius(t.RadiusSM).Background(t.Bg).Children(func() {
		line := func(s string, ink ui.Color) { ui.Text(c, s).FontSize(t.SM).TextColor(ink).LineHeight(1.5) }
		again := func() {
			ui.Row(c).Children(func() {
				if a.buttonFor(c, a.L.T("ag.retry"), name, btnSecondary, t.ControlSM, t.Bg) {
					a.agentSetupReq(dv, "login", protocol.AgentSetupReq{Harness: h.Harness})
				}
			})
		}
		switch l.State {
		case "terminal":
			line(a.L.T("ag.login.pi", a.deviceNameIn(dv)), t.Ink)
			return
		case "starting":
			line(a.L.T("ag.login.starting"), t.InkMuted)
			return
		case "done":
			line(a.L.T("ag.login.done"), t.Done.Ink)
			return
		case "failed", "expired":
			k := "ag.login.failed"
			switch {
			case l.State == "expired":
				k = "ag.login.expired"
			case l.Reason == "device_off":
				k = "ag.login.device_off"
			case l.Reason == "wrong_code":
				k = "ag.login.wrong_code"
			}
			line(a.L.T(k), t.Failed.Ink)
			again()
			return
		}
		if l.Key {
			a.keyLogin(c, dv, h, key, line)
			return
		}
		if h.Harness == "codex" {
			line(a.L.T("ag.login.codex"), t.Ink)
		} else {
			line(a.L.T("ag.login.claude"), t.Ink)
		}
		if l.Reason == "wrong_code" {
			line(a.L.T("ag.login.wrong_code"), t.Failed.Ink)
		}
		if l.URL != "" {
			ui.Text(c, shortURL(l.URL)).FontSize(t.XS).TextColor(t.Accent).SingleLine()
		}
		if l.Code != "" {
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ui.Text(c, l.Code).Font(t.Mono).FontSize(22).FontWeight(800).TextColor(t.Ink).Selectable()
				if a.buttonFor(c, a.L.T("ag.login.copy"), name, btnSecondary, t.ControlSM, t.Bg) {
					c.WriteClipboard(l.Code)
				}
			})
		}
		if l.Paste && l.State == "waiting" {
			if a.ag.code == nil {
				a.ag.code = map[string]string{}
			}
			v := a.ag.code[key]
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				ui.TextInput(c.Key("ag-code:"+key), &v).Placeholder(a.L.T("ag.login.paste")).Label(a.L.T("ag.login.paste")).
					FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft).Grow(1)
				if a.buttonFor(c, a.L.T("ag.login.send"), name, btnPrimary, t.ControlSM, t.Bg) && v != "" {
					a.agentSetupReq(dv, "code", protocol.AgentSetupReq{Harness: h.Harness, Code: v})
					v = ""
				}
			})
			a.ag.code[key] = v
		}
		if l.State == "checking" {
			line(a.L.T("ag.login.checking"), t.InkMuted)
		}
		ui.Row(c).Gap(t.S2).Wrap().Children(func() {
			if l.URL != "" && a.buttonFor(c, a.L.T("ag.login.open"), name, btnSecondary, t.ControlSM, t.Bg) {
				c.OpenURL(l.URL)
			}
			if a.buttonFor(c, a.L.T("ag.login.cancel"), name, btnText, t.ControlSM, t.Bg) {
				a.agentSetupReq(dv, "cancel", protocol.AgentSetupReq{Harness: h.Harness})
			}
		})
	})
}

// keyLogin is DeepSeek Harness's sign-in in place (D371): its app opened on
// that Mac when it has one, and a DeepSeek API key to paste, kept only on
// that computer. The row turns ready by itself either way.
func (a *App) keyLogin(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness, key string, line func(string, ui.Color)) {
	t := a.T
	l := h.Login
	name := harnessName(h.Harness)
	where := a.deviceNameIn(dv)
	checking := l.State == "checking"
	if l.App != "" {
		line(a.L.T("ag.dsh.app", where), t.Ink)
	}
	if l.App != "" {
		line(a.L.T("ag.dsh.key.or", where), t.Ink)
	} else {
		line(a.L.T("ag.dsh.key", where), t.Ink)
	}
	if a.ag.code == nil {
		a.ag.code = map[string]string{}
	}
	v := a.ag.code[key]
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		in := ui.TextInput(c.Key("ag-key:"+key), &v).Placeholder("sk-…").Label(a.L.T("ag.dsh.field")).
			FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft).Grow(1)
		in.Password()
		label := a.L.T("ag.dsh.check")
		if checking {
			label = a.L.T("ag.login.checking")
		}
		if a.buttonFor(c, label, name, btnPrimary, t.ControlSM, t.Bg) && v != "" && !checking {
			a.agentSetupReq(dv, "code", protocol.AgentSetupReq{Harness: h.Harness, Code: v})
			v = ""
		}
	})
	a.ag.code[key] = v
	if !checking {
		switch l.Reason {
		case "wrong_key", "no_balance":
			line(a.L.T("ag.login."+l.Reason), t.Failed.Ink)
		case "offline":
			line(a.L.T("ag.login.offline", where), t.Failed.Ink)
		case "failed":
			line(a.L.T("ag.login.failed"), t.Failed.Ink)
		}
	}
	ui.Row(c).Gap(t.S2).Wrap().Children(func() {
		if l.URL != "" && a.buttonFor(c, a.L.T("ag.dsh.get"), name, btnSecondary, t.ControlSM, t.Bg) {
			c.OpenURL(l.URL)
		}
		if a.buttonFor(c, a.L.T("ag.login.cancel"), name, btnText, t.ControlSM, t.Bg) {
			a.agentSetupReq(dv, "cancel", protocol.AgentSetupReq{Harness: h.Harness})
		}
	})
}

// shortURL is a sign-in link as one short line (Claude's runs to 400
// characters; 打开链接 opens the whole), as the web's shortUrl.
func shortURL(u string) string {
	s := []rune(strings.TrimPrefix(u, "https://"))
	if len(s) > 44 {
		return string(s[:43]) + "…"
	}
	return string(s)
}

// setupAnswer is the one line when the device couldn't take the ask.
func (a *App) setupAnswer(c *ui.Context, dv *protocol.DeviceView) {
	r := a.ag.answer
	if r == nil || r.Device != dv.ID {
		return
	}
	k := "ag.old"
	if r.Reason == "away" {
		k = "ag.away"
	}
	ui.Text(c, a.L.T(k, a.deviceNameIn(dv))).FontSize(a.T.SM).TextColor(a.T.Failed.Ink).LineHeight(1.5)
}

// lendAgents is the AI agents on the computer that just came (the lend
// sheet's last step): 装上哪些 AI？ with Codex and Claude Code checked and one
// 装上; then each arriving as its row, its 登录 right there; {name} 可以干活了
// once one is signed in. 以后再说 leaves them for the card.
func (a *App) lendAgents(c *ui.Context, dv *protocol.DeviceView) (asking bool) {
	t := a.T
	a.drainDeviceResults()
	if a.ag.picked == nil {
		a.ag.picked, a.ag.skipped = map[string]bool{}, map[string]bool{}
	}
	ids, checked := offerable(dv.Harnesses)
	ready := anyReady(dv.Harnesses)
	ask := !ready && !a.ag.skipped[dv.ID] && len(ids) > 0 && !anySetup(dv.Harnesses, "installing", "queued", "failed")
	asking = ask
	name := a.deviceNameIn(dv)
	ui.Column(c.Key("lend-agents:" + dv.ID)).Gap(t.S1).Children(func() {
		if ready {
			ui.Text(c, a.L.T("lend.ready", name)).FontSize(t.MD).FontWeight(800).TextColor(t.Done.Ink)
		}
		byOrder := func(keep func(h protocol.DeviceHarness) bool, each func(h protocol.DeviceHarness)) int {
			n := 0
			for _, id := range installOrder {
				for _, h := range dv.Harnesses {
					if h.Harness == id && keep(h) {
						each(h)
						n++
					}
				}
			}
			return n
		}
		if ask {
			ui.Text(c, a.L.T("lend.setup.q")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
			byOrder(func(h protocol.DeviceHarness) bool { return h.Installed }, func(h protocol.DeviceHarness) { a.agentRow(c, dv, h, nil) })
			var chosen []string
			for _, id := range ids {
				k := coinKey(dv.ID, id)
				v, ok := a.ag.picked[k]
				if !ok {
					v = checked[id]
				}
				for _, h := range dv.Harnesses {
					if h.Harness == id {
						a.agentRow(c, dv, h, &v)
					}
				}
				a.ag.picked[k] = v
				if v {
					chosen = append(chosen, id)
				}
			}
			a.infoText(c, a.L.T("ag.where"))
			a.setupAnswer(c, dv)
			ui.Row(c).Gap(t.S2).Justify(ui.End).Margin(t.S2, 0, 0, 0).Children(func() {
				if a.button(c, a.L.T("lend.setup.skip"), btnText, t.ControlMD, t.Surface) {
					a.ag.skipped[dv.ID] = true
				}
				if len(chosen) > 0 && a.button(c, a.L.T("lend.setup.go"), btnPrimary, t.ControlMD, t.Surface) {
					a.agentSetupReq(dv, "install", protocol.AgentSetupReq{Harnesses: chosen})
					a.ag.skipped[dv.ID] = true // asked once: from here on, the rows
				}
			})
			return
		}
		n := byOrder(func(h protocol.DeviceHarness) bool { return h.Installed || h.Setup != nil || h.Login != nil }, func(h protocol.DeviceHarness) { a.agentRow(c, dv, h, nil) })
		if n == 0 {
			a.infoText(c, a.L.T("lend.agents.none"))
			if a.ag.skipped[dv.ID] && !anySetup(dv.Harnesses, "installing", "queued") {
				a.infoText(c, a.L.T("lend.setup.later", name))
			}
		}
		a.setupAnswer(c, dv)
	})
	return asking
}
