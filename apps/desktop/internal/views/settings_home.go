package views

import (
	"strconv"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D469: Settings in On hand's language (D467). The partner reports on its own world in its own
// voice: 概览 / Overview opens Settings with its brief (the figure in its pose, one lead line, a
// few labelled lines that each open their pane, and what needs you with the way to the fix), then
// where things live (each computer in its clay, what it is to the partner, and on the home what
// lives there: the conversation, the memory, the accounts it reads). Every pane's head is the
// partner saying that pane's state, never a description of the pane.

// TabHome is 概览 / Overview, Settings' first view.
const TabHome = "home"

// setNeed is one thing on Settings that needs the person: the partner's sentence, and the button
// that goes to where the fix is (go is its label, tab the pane).
type setNeed struct {
	key, text, goLabel, tab string
}

// setNeeds is everything on Settings that needs the person, most blocking first.
func (a *App) setNeeds() []setNeed {
	var out []setNeed
	if a.S.Settings != nil && a.noBrain() {
		out = append(out, setNeed{"brain", a.L.T("need.brain"), a.L.T("need.go.signin"), TabPartner})
	}
	for _, cv := range a.S.Connections {
		if cv.Phone == nil && sourceDown(cv) {
			out = append(out, setNeed{"src:" + cv.ID, a.L.T("need.source", cv.Name), a.L.T("need.go.look"), TabAccounts})
		}
	}
	if m := a.S.Mem; m != nil && m.Check != nil && len(m.Check.Asks) > 0 && a.S.Settings != nil && a.S.Settings.Memory {
		s := a.L.T("need.memask.one")
		if n := len(m.Check.Asks); n > 1 {
			s = a.L.T("need.memask", n)
		}
		out = append(out, setNeed{"memask", s, a.L.T("need.go.look"), TabMemory})
	}
	for _, r := range memPluginRowsFor(a.S.Devices) {
		if r.h.Mem != nil && r.h.Mem.State == "update" {
			out = append(out, setNeed{"memp:" + r.dv.ID + ":" + r.h.Harness, a.L.T("need.memplug", harnessName(r.h.Harness)), a.L.T("need.go.update"), TabMemory})
		}
	}
	if n, running := a.updatesWaiting(); n > 0 && !running {
		s := a.L.T("need.update.one")
		if n > 1 {
			s = a.L.T("need.update", n)
		}
		out = append(out, setNeed{"update", s, a.L.T("need.go.update"), TabAbout})
	}
	return out
}

// needsOf is what needs the person on one pane.
func (a *App) needsOf(tab string) []setNeed {
	var out []setNeed
	for _, n := range a.setNeeds() {
		if n.tab == tab {
			out = append(out, n)
		}
	}
	return out
}

// watchedAccounts is the accounts the partner reads, and how many of them it keeps an eye on by
// itself; titles is the first few apps' names, each once.
func (a *App) watchedAccounts() (total, watched int, titles []string) {
	seen := map[string]bool{}
	for _, cv := range a.S.Connections {
		if cv.Phone != nil {
			continue
		}
		for _, w := range tilesOf(cv) {
			if w.Excluded {
				continue // left out: never read
			}
			total++
			if w.Watch {
				watched++
			}
			title, _ := a.tileWords(w, nil)
			if !seen[title] {
				seen[title] = true
				titles = append(titles, title)
			}
		}
	}
	return total, watched, titles
}

// paneSay is the partner's sentence at the head of a pane: what is true there now, in its voice.
// lede is the pane's old line, said when nothing better is known.
func (a *App) paneSay(tab, lede string) string {
	switch tab {
	case TabAccounts:
		total, watched, _ := a.watchedAccounts()
		switch {
		case total == 0:
			return a.L.T("say.accounts.none")
		case watched == 0:
			return a.L.T("say.accounts.ask", total)
		}
		return a.L.T("say.accounts", watched)
	case TabRun:
		if a.Backend == nil {
			if host := hostOf(a.URL); host != "" && !isLoopback(host) {
				return a.L.T("say.run.remote", host)
			}
		}
		return a.L.T("say.run.mac")
	case TabMemory:
		if a.S.Settings == nil {
			return lede
		}
		switch memPhase(a.S.Settings.Memory, a.S.Mem, a.S.Bridge) {
		case "on":
			return a.L.T("say.memory.on")
		case "off":
			return a.L.T("say.memory.off")
		case "closed":
			return a.L.T("say.memory.closed")
		}
		return a.L.T("say.memory.first")
	case TabNotify:
		return a.L.T("say.notify")
	case TabLook:
		return a.L.T("say.look")
	case TabTodos:
		return a.L.T("say.todos")
	case TabChats:
		return a.L.T("say.chats")
	case TabAutofill:
		return a.L.T("say.autofill")
	case TabPeers:
		return a.L.T("say.peers")
	}
	return lede
}

// paneSpeaks is a pane's head (D469): the pane's name, then the partner (its face in the pose for
// the pane: the flag when something here needs you) saying what is true here, and under it each
// thing that needs you on this pane in the needs-you ink. The fix is the pane itself, below.
func (a *App) paneSpeaks(c *ui.Context, tab, say string) {
	t := a.T
	needs := a.needsOf(tab)
	pose := theme.Idle
	if len(needs) > 0 {
		pose = theme.NeedsYou
	}
	ui.Column(c.Key("panel-head")).Gap(t.S3).Children(func() {
		a.heading(c, a.tabName(tab), t.XXL)
		if say == "" && len(needs) == 0 {
			return
		}
		ui.Row(c.Key("pane-says")).Gap(t.S3).AlignItems(ui.Start).Children(func() {
			a.avatar(c, pose, 40)
			ui.Column(c.Key("says")).Gap(t.S1).Grow(1).Shrink(1).MinWidth(0).Padding(t.S1, 0, 0, 0).Children(func() {
				if say != "" {
					uiText(c.Key("say"), keepWords(autospace(say))).FontSize(t.MD).LineHeight(a.leading(1.55)).TextColor(t.InkSoft)
				}
				for _, n := range needs {
					uiText(c.Key("need:"+n.key), keepWords(autospace(n.text))).FontSize(t.MD).FontWeight(600).LineHeight(a.leading(1.55)).TextColor(t.NeedsYou.Ink)
				}
			})
		})
	})
}

// ---------- 概览 / Overview ----------

func (a *App) homePanel(c *ui.Context) {
	t := a.T
	needs := a.setNeeds()
	pose := theme.Done
	switch {
	case len(needs) > 0:
		pose = theme.NeedsYou
	case a.Resting():
		pose = theme.Napping
	}
	lead := a.L.T("home.lead.ok")
	switch {
	case a.S.Settings != nil && a.noBrain():
		lead = a.L.T("home.lead.first")
	case len(needs) == 1:
		lead = a.L.T("home.lead.one")
	case len(needs) > 1:
		lead = a.L.T("home.lead.many", len(needs))
	}
	type line struct {
		key, label, text, tab string
	}
	lines := []line{{"lives", a.L.T("home.l.lives"), a.homeLives(), TabRun}}
	if a.S.Settings != nil && !a.noBrain() {
		lines = append(lines, line{"thinks", a.L.T("home.l.thinks"), a.homeThinks(), TabPartner})
	}
	lines = append(lines, line{"reads", a.L.T("home.l.reads"), a.homeReads(), TabAccounts})
	if s := a.homeMem(); s != "" {
		lines = append(lines, line{"mem", a.L.T("home.l.mem"), s, TabMemory})
	}
	if s := a.homeReach(); s != "" {
		lines = append(lines, line{"reach", a.L.T("home.l.reach"), s, TabChats})
	}
	labelW := float32(76)
	if !a.L.Han() {
		labelW = 112
	}
	ui.Row(c.Key("home-brief")).Gap(t.S5).AlignItems(ui.Start).Padding(t.S2, 0, t.S2, 0).Children(func() {
		a.avatar(c, pose, 88)
		ui.Column(c.Key("brief-col")).Gap(t.S4).Grow(1).Shrink(1).MinWidth(0).Padding(t.S2, 0, 0, 0).Children(func() {
			uiText(c.Key("lead"), keepWords(autospace(lead))).Font(t.Display).FontSize(t.XL + 2).FontWeight(700).LineHeight(1.3).TextColor(t.Ink)
			ui.Column(c.Key("lines")).Gap(t.S2 + 2).Children(func() {
				if len(needs) > 0 {
					ui.Row(c.Key("needs")).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						uiText(c.Key("label"), a.L.T("lane.needs_you")).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).Width(labelW).Shrink(0).SingleLine().Padding(4, 0, 0, 0)
						ui.Column(c.Key("body")).Gap(t.S2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
							for _, n := range needs {
								n := n
								ui.Row(c.Key("n:" + n.key)).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
									uiText(c.Key("t"), keepWords(autospace(n.text))).FontSize(t.MD).LineHeight(1.5).TextColor(t.Ink).Shrink(1).MinWidth(0)
									if a.buttonFor(c, n.goLabel, n.text, btnSecondary, t.ControlSM, t.Bg) {
										a.openTab(n.tab)
									}
								})
							}
						})
					})
				}
				for _, l := range lines {
					l := l
					ui.Row(c.Key("l:" + l.key)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						uiText(c.Key("label"), l.label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(labelW).Shrink(0).SingleLine().Padding(3, 0, 0, 0)
						tx := uiText(c.Key("t"), keepWords(autospace(l.text))).FontSize(t.MD).LineHeight(1.5).TextColor(t.Ink).Shrink(1).MinWidth(0).
							Cursor(ui.CursorPointer).Role(ui.RoleLink).Tooltip(a.tabName(l.tab))
						if tx.Clicked() {
							a.openTab(l.tab)
						}
					})
				}
			})
		})
	})
	a.placesMap(c)
}

// homeLives is where the partner lives, as it would say it.
func (a *App) homeLives() string {
	if a.Backend == nil {
		if host := hostOf(a.URL); host != "" && !isLoopback(host) {
			return a.L.T("home.lives.on", host)
		}
	}
	if h := a.homeDevice(); h != nil && !(a.onThisMac() && (h.Kind == "laptop" || h.Kind == "mini")) {
		if h.AlwaysOn || h.Kind == "server" {
			return a.L.T("home.lives.on", h.Name)
		}
		return h.Name
	}
	return a.L.T("home.lives.mac")
}

// homeThinks is the agent and model the partner thinks with.
func (a *App) homeThinks() string {
	b := a.brain()
	agent := harnessName(b.Harness)
	for _, m := range a.brainModels(b, a.trayHarness(b.Harness)) {
		if (b.Model != "" && m.id == b.Model) || (b.Model == "" && m.def) {
			return a.L.T("home.thinks", agent, m.label)
		}
	}
	return agent
}

// homeReads is what it may read, and what it never does without asking.
func (a *App) homeReads() string {
	total, _, titles := a.watchedAccounts()
	if total == 0 {
		return a.L.T("home.reads.none")
	}
	if len(titles) > 3 {
		titles = titles[:3]
	}
	return a.L.T("home.reads", a.listWords(titles), total)
}

// homeMem is what it remembers, and where.
func (a *App) homeMem() string {
	st := a.S.Settings
	if st == nil {
		return ""
	}
	switch memPhase(st.Memory, a.S.Mem, a.S.Bridge) {
	case "on":
		if m := a.S.Mem; m != nil {
			if n := memWeek(m.Noted, a.Now()); n > 0 {
				return a.L.T("home.mem.week", n)
			}
		}
		return a.L.T("home.mem.on")
	case "off":
		return a.L.T("home.mem.off")
	}
	return a.L.T("home.mem.none")
}

// homeReach is where else the person finds the partner: the chat apps linked.
func (a *App) homeReach() string {
	f := a.S.Channels
	if f == nil {
		return ""
	}
	var names []string
	for _, ch := range f.Channels {
		if ch.State != "linked" {
			continue
		}
		switch ch.Kind {
		case "wechat":
			names = append(names, a.L.T("chats.wechat"))
		case "telegram":
			names = append(names, "Telegram")
		case "slack":
			names = append(names, "Slack")
		}
	}
	if len(names) == 0 {
		return ""
	}
	return a.L.T("home.reach", a.listWords(names))
}

// placesMap is where things live (D469, motivation: "you should always see where your accounts
// live"): each computer as its clay with its name and what it is to the partner; the home also
// carries what lives there (the partner, the memory, the accounts it reads). A tap opens Devices.
func (a *App) placesMap(c *ui.Context) {
	t := a.T
	if len(a.S.Devices) == 0 {
		return
	}
	name := a.personaName()
	var services []string
	seen := map[string]bool{}
	for _, cv := range a.S.Connections {
		if cv.Phone != nil {
			continue
		}
		for _, w := range tilesOf(cv) {
			if b := brandOf(w.Service); !w.Excluded && !seen[b] {
				seen[b] = true
				services = append(services, w.Service)
			}
		}
	}
	ui.Column(c.Key("places")).Gap(t.S3).Children(func() {
		uiText(c.Key("places-label"), a.L.T("home.map")).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Padding(0, t.S2)
		ui.Row(c.Key("places-row")).Gap(t.S3).Wrap().AlignItems(ui.Stretch).Children(func() {
			for pass := 0; pass < 2; pass++ {
				for i := range a.S.Devices {
					dv := &a.S.Devices[i]
					if dv.Home != (pass == 0) {
						continue
					}
					role := a.placeRole(dv, name)
					card := ui.Column(c.Key("place:"+dv.ID)).Width(212).Padding(t.S4).Gap(t.S2).Radius(t.RadiusLG).Background(t.Surface).
						Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Cursor(ui.CursorPointer).Role(ui.RoleButton).
						Label(spoken(a.L, a.deviceNameIn(dv), role)).Focusable()
					card.Children(func() {
						if bmp := theme.Clay(deviceArt(dv)); bmp != nil {
							ui.Image(c, bmp).Size(56, 56).AccessHidden(true)
						}
						uiText(c.Key("n"), a.deviceNameIn(dv)).FontSize(t.MD).FontWeight(700).SingleLine().Shrink(1).MinWidth(0)
						ink := t.InkMuted
						if dv.State == protocol.DeviceUnreachable {
							ink = t.Failed.Ink
						}
						uiText(c.Key("r"), keepWords(role)).FontSize(t.SM).LineHeight(1.4).TextColor(ink)
						if dv.Home {
							// What lives here: the partner itself, its memory, the accounts it reads.
							ui.Row(c.Key("here")).Gap(t.S1+2).AlignItems(ui.Center).Wrap().Padding(t.S1, 0, 0, 0).Children(func() {
								a.avatar(c, theme.Idle, 30)
								if st := a.S.Settings; st != nil && memPhase(st.Memory, a.S.Mem, a.S.Bridge) == "on" {
									a.glyph(c, 24, a.drawNotebook())
								}
								for j, s := range services {
									if j == 4 {
										uiText(c.Key("more"), "+"+strconv.Itoa(len(services)-4)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
										break
									}
									ui.Box(c.Key("svc:"+s)).Size(24, 24).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).Draw(a.drawAppMark(s)).AccessHidden(true)
								}
							})
						}
					})
					if card.Clicked() {
						a.OpenDevices()
					}
				}
			}
		})
	})
}

// placeRole is what a computer is to the partner, in a few words.
func (a *App) placeRole(dv *protocol.DeviceView, name string) string {
	switch {
	case dv.State == protocol.DeviceUnreachable:
		return a.L.T("home.role.away")
	case dv.Home:
		return a.L.T("home.role.home", name)
	case dv.Kind == "phone":
		return a.L.T("home.role.phone", name)
	}
	for _, h := range dv.Harnesses {
		if h.Installed {
			return a.L.T("home.role.worker", name)
		}
	}
	return a.L.T("home.role.window", name)
}
