package views

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

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
	// D469 round 2: a fix that can happen right here, as the pane's own button does it: a Mem
	// plugin's update (its in-place ask first), or Update all.
	dv *protocol.DeviceView
	h  protocol.DeviceHarness
}

// setNeeds is everything on Settings that needs the person, most blocking first.
func (a *App) setNeeds() []setNeed {
	var out []setNeed
	if a.S.Settings != nil && a.noBrain() {
		out = append(out, setNeed{key: "brain", text: a.L.T("need.brain"), goLabel: a.L.T("need.go.signin"), tab: TabPartner})
	}
	for _, cv := range a.S.Connections {
		if cv.Phone == nil && sourceDown(cv) {
			out = append(out, setNeed{key: "src:" + cv.ID, text: a.L.T("need.source", cv.Name), goLabel: a.L.T("need.go.look"), tab: TabAccounts})
		}
	}
	// D646: Mem's own states (signed out, closed, out of reach, too old) and any Agent messaging
	// problem that stops the partner hearing from the person's agents are needs here, with the same
	// line the pane says and the pane that holds the one fix (D552: never only in the pane's head).
	if a.S.Settings != nil && a.S.Settings.Memory {
		peersOn := a.S.Settings.Peers != nil && peersSwitchOn(a.S.Settings.Peers.Reach, a.S.Bridge)
		why := ""
		if b := a.S.Bridge; b != nil {
			why = a.failedWhy(b.Detail)
		}
		if v := memStateOf(a.S.Mem, a.S.Bridge, a.memHome(), why); v != nil && (v.NeedPage != "peers" || peersOn) {
			goLabel, tab := a.L.T("need.go.look"), TabMemory
			if v.Need.Key == "need.mem.signed_out" {
				goLabel = a.L.T("need.go.signin")
			}
			if v.NeedPage == "peers" {
				tab = TabPeers
			}
			out = append(out, setNeed{key: v.Need.Key, text: a.memWord(v.Need), goLabel: goLabel, tab: tab})
		}
	}
	// D569: what Nowledge Mem couldn't settle by itself is its own bookkeeping,
	// never a need: it waits, one quiet row on Memory, the partner's suggestions in it.
	//
	// D552: one per agent per computer, each saying which computer when there
	// is more than one, so two never read the same; one being updated stays,
	// its fix the busy button, until the check after the task clears it.
	// D569: only one that can run from here (the computer awake, any AI signed
	// in there): its fix is the pane's own 更新, right here, never a 去更新 to a
	// row with no button. One that can't is no need; its row says why.
	// D646 (D590's leftover 6): while Mem itself has a way through, an agent plugin's
	// update is not a second need on the same head; its row on Memory stays an offer.
	memDown := false
	for _, n := range out {
		if strings.HasPrefix(n.key, "need.mem.") {
			memDown = true
		}
	}
	var memp []memPluginRow
	comps := map[string]bool{}
	for _, r := range memPluginRowsFor(a.S.Devices) {
		if r.h.Mem == nil || r.h.Mem.State != "update" || memCant(r.dv) != "" {
			continue
		}
		if _, action, busy := a.memPluginWords(a.memLine(r.dv, r.h), r.h.Harness); action == "" && busy == "" {
			continue
		}
		memp = append(memp, r)
		comps[r.dv.ID] = true
	}
	for _, r := range memp {
		if memDown {
			continue
		}
		text := a.L.T("need.memplug", harnessName(r.h.Harness))
		if len(comps) > 1 || !r.dv.Home { // D569: a computer not the home is always named (haswell, not hel)
			text = a.L.T("need.memplug.on", harnessName(r.h.Harness), a.deviceNameIn(r.dv))
		}
		out = append(out, setNeed{key: "memp:" + r.dv.ID + ":" + r.h.Harness, text: text, goLabel: a.L.T("memp.btn.update"), tab: TabMemory, dv: r.dv, h: r.h})
	}
	if n, running := a.updatesWaiting(); n > 0 && !running {
		s := a.L.T("need.update.one")
		if n > 1 {
			s = a.L.T("need.update", n)
		}
		out = append(out, setNeed{key: "update", text: s, goLabel: a.L.T("need.go.update"), tab: TabAbout})
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
		case len(a.needsOf(TabAccounts)) > 0:
			return "" // D475: a source down is said by its need alone, never a count it can't keep
		case total == 0:
			return a.L.T("say.accounts.none")
		case watched == 0:
			return a.L.T("say.accounts.ask", total)
		}
		return a.L.T("say.accounts", watched)
	case TabRun:
		if home := a.homeElsewhere(); home != "" {
			return a.L.T("say.run.remote", home)
		}
		return a.L.T("say.run.mac")
	case TabMemory:
		if a.S.Settings == nil {
			return lede
		}
		// D552: Mem down or signed out is said by its need alone (a plugin's update is not Mem itself).
		for _, n := range a.needsOf(TabMemory) {
			if strings.HasPrefix(n.key, "need.mem.") {
				return ""
			}
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
		return a.notifySay()
	case TabLook:
		return a.lookSay()
	case TabTodos:
		return a.todosSay()
	case TabImport:
		// The pane's lede is its one line (the partner's voice says what the pane is for).
		return lede
	case TabChats:
		return a.chatsSay()
	case TabAutofill:
		return a.autofillSay()
	case TabPeers:
		return a.peersSay()
	}
	return lede
}

// D475: each pane's head is what is true there now, never what the pane is for.

// interfaceLangs are Look and sound's window languages, in the order its choice shows them.
var interfaceLangs = []string{"auto", "zh", "en"}

// lookSay (D501): the theme, the light and the window's language, read back.
func (a *App) lookSay() string {
	paper, lang := "system", "auto"
	if a.Local != nil {
		paper, lang = a.Local.Appearance(), a.Local.Lang()
	}
	// Each choice reads back by its own key; anything else is the system's.
	if !slices.Contains([]string{"system", "light", "dark"}, paper) {
		paper = "system"
	}
	if !slices.Contains(interfaceLangs, lang) {
		lang = "auto"
	}
	theme := a.L.T("settings.look.pebble")
	if paper == "system" && lang == "auto" {
		return a.L.T("say.look.auto", theme)
	}
	return a.L.T("say.look", theme, a.L.T("say.look.paper."+paper), a.L.T("say.look.lang."+lang))
}

// notifySay: whether it sends notifications, and when it stays quiet.
func (a *App) notifySay() string {
	st := a.S.Settings
	switch {
	case st == nil:
		return a.L.T("say.notify")
	case !st.Notify:
		return a.L.T("say.notify.off")
	case st.Quiet != nil:
		return a.L.T("say.notify.quiet")
	}
	return a.L.T("say.notify.on")
}

// todosSay: how many are open in each source it has read, and that any can be handed over.
func (a *App) todosSay() string {
	v := a.S.Sources
	if v == nil {
		return a.L.T("say.todos")
	}
	var items []string
	for _, s := range v.Sources {
		if s.State != "ok" || s.CheckedAt == "" || s.Open <= 0 {
			continue
		}
		n := fmt.Sprint(s.Open)
		if s.AtLeast {
			n += "+"
		}
		items = append(items, a.L.T("say.todos.item", protocol.SourceKindName(s.Kind), n))
	}
	if len(items) == 0 {
		return a.L.T("say.todos")
	}
	return a.L.T("say.todos.n", strings.Join(items, a.L.T("say.todos.sep")))
}

// chatsSay: the chat apps it waits in, by name.
func (a *App) chatsSay() string {
	f := a.S.Channels
	if f == nil {
		return a.L.T("say.chats")
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
		return a.L.T("say.chats")
	}
	return a.L.T("say.chats.n", a.listWords(names))
}

// autofillSay: what it keeps for the person, counted by kind.
func (a *App) autofillSay() string {
	f := a.savedFrame()
	if f == nil {
		return a.L.T("say.autofill")
	}
	signins, cards := 0, 0
	for _, x := range f.SavedItems {
		if x.Kind == "signin" {
			signins++
		} else {
			cards++
		}
	}
	var items []string
	count := func(n int, key string) {
		switch {
		case n == 1:
			items = append(items, a.L.T(key+".one"))
		case n > 1:
			items = append(items, a.L.T(key, n))
		}
	}
	count(signins, "say.af.signins")
	count(cards, "say.af.cards")
	count(len(f.SavedKeys), "say.af.keys")
	if len(items) == 0 {
		return a.L.T("say.autofill")
	}
	return a.L.T("say.autofill.n", a.listWords(items))
}

// paneSpeaks is a pane's head (D469): the pane's name, then the partner (its face in the pose for
// the pane: the flag when something here needs you) saying what is true here, and under it each
// thing that needs you on this pane in the needs-you ink. The fix is the pane itself, below.
func (a *App) paneSpeaks(c *ui.Context, tab, say string) {
	t := a.T
	needs := a.needsOf(tab)
	if tab == TabPeers {
		needs = nil // D489: the agent's own row carries its offer; the head says it once, as the partner
	}
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
					uiText(c.Key("say"), keepClauses(autospace(say))).FontSize(t.MD).LineHeight(a.leading(1.55)).TextColor(t.InkSoft)
				}
				for _, n := range needs {
					n := n
					if n.dv == nil {
						uiText(c.Key("need:"+n.key), keepClauses(autospace(n.text))).FontSize(t.MD).FontWeight(600).LineHeight(a.leading(1.55)).TextColor(t.NeedsYou.Ink)
						continue
					}
					// D569: a plugin's update is done here, where its need is said (as on
					// Overview), never a page below; asked in place under it.
					ui.Row(c.Key("need:" + n.key)).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
						uiText(c.Key("t"), keepClauses(autospace(n.text))).FontSize(t.MD).FontWeight(600).LineHeight(a.leading(1.55)).TextColor(t.NeedsYou.Ink).Shrink(1).MinWidth(0)
						a.needFix(c, n)
					})
					if a.devState().card.memAsk == "need:"+n.dv.ID+":"+n.h.Harness {
						a.memAskBlock(c, n.dv, n.h)
					}
				}
			})
		})
	})
}

// needFix is a need's button on Overview (D469 round 2): where the fix can happen right here the
// same way the pane does it, it does (a Mem plugin's update asks in place first, as on Memory;
// Update all is the one tap Devices has); else it goes to the pane.
func (a *App) needFix(c *ui.Context, n setNeed) {
	t := a.T
	switch {
	case n.dv != nil:
		_, action, busy := a.memPluginWords(a.memLine(n.dv, n.h), n.h.Harness)
		key := "need:" + n.dv.ID + ":" + n.h.Harness // its ask opens here, not under the pane's row
		if busy != "" && memCant(n.dv) == "" {
			a.busyButton(c, busy, n.text, t.ControlSM, t.Bg)
			return
		}
		if action != "" && memCant(n.dv) == "" {
			if a.devState().card.memAsk != key && a.buttonFor(c, action, n.text, btnSecondary, t.ControlSM, t.Bg) {
				a.devState().card.memAsk = key
			}
			return
		}
	case n.key == "update":
		if _, running := a.updatesWaiting(); !running && a.S.UpdateAll != nil && len(a.S.UpdateAll.Offer) > 0 {
			label := a.L.T("upall.button")
			if len(a.S.UpdateAll.Offer) == 1 {
				label = a.L.T("upall.button.one")
			}
			if a.buttonFor(c, label, n.text, btnSecondary, t.ControlSM, t.Bg) {
				a.startUpdateAll()
			}
			return
		}
	}
	if a.buttonFor(c, n.goLabel, n.text, btnSecondary, t.ControlSM, t.Bg) {
		a.openTab(n.tab)
	}
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
		// D470: a second part of the line opening its own pane (the agents after the chat apps).
		more, moreTab string
	}
	lines := []line{{key: "lives", label: a.L.T("home.l.lives"), text: a.homeLives(), tab: TabRun}}
	if a.S.Settings != nil && !a.noBrain() {
		lines = append(lines, line{key: "thinks", label: a.L.T("home.l.thinks"), text: a.speakerThinks(a.speakerFor(speakShown)), tab: TabPartner}) // D568
	}
	lines = append(lines, line{key: "reads", label: a.L.T("home.l.reads"), text: a.homeReads(), tab: TabAccounts})
	if s := a.homeMem(); s != "" {
		lines = append(lines, line{key: "mem", label: a.L.T("home.l.mem"), text: s, tab: TabMemory})
	}
	reach := a.homeReach()
	agents := ""
	if names := a.peersReaching(); len(names) > 0 {
		key := "home.reach.agents"
		if reach != "" {
			key = "home.reach.and"
		}
		agents = a.L.T(key, a.listWords(names))
	}
	switch {
	case reach != "":
		lines = append(lines, line{key: "reach", label: a.L.T("home.l.reach"), text: reach, tab: TabChats, more: agents, moreTab: TabPeers})
	case agents != "":
		lines = append(lines, line{key: "reach", label: a.L.T("home.l.reach"), text: agents, tab: TabPeers})
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
									// D589: the words take the line, so every need's way sits at one right edge, a
									// column of buttons, not one after each sentence's end.
									uiText(c.Key("t"), keepClauses(autospace(n.text))).FontSize(t.MD).LineHeight(1.5).TextColor(t.Ink).Grow(1).Shrink(1).MinWidth(0)
									a.needFix(c, n)
								})
								if n.dv != nil && a.devState().card.memAsk == "need:"+n.dv.ID+":"+n.h.Harness {
									a.memAskBlock(c, n.dv, n.h) // the pane's own ask, here
								}
							}
						})
					})
				}
				for _, l := range lines {
					l := l
					ui.Row(c.Key("l:" + l.key)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						uiText(c.Key("label"), l.label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(labelW).Shrink(0).SingleLine().Padding(3, 0, 0, 0)
						part := func(key, text, tab string) {
							tx := uiText(c.Key(key), keepWords(autospace(text))).FontSize(t.MD).LineHeight(1.5).TextColor(t.Ink).Shrink(1).MinWidth(0).
								Cursor(ui.CursorPointer).Role(ui.RoleLink).Tooltip(a.tabName(tab))
							if tx.Clicked() {
								a.openTab(tab)
							}
						}
						if l.more == "" {
							part("t", l.text, l.tab)
							return
						}
						ui.Row(c.Key("parts")).Wrap().Shrink(1).MinWidth(0).Children(func() {
							part("t", l.text, l.tab)
							part("more", l.more, l.moreTab)
						})
					})
				}
			})
		})
	})
	a.placesMap(c)
	a.accountPlaces(c)
	a.usageWeek(c) // D591: where this week's allowance went
	// A calm last word: everything here can also be said.
	ui.Row(c.Key("home-foot")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S4, t.S2, 0, t.S2).Children(func() {
		a.avatar(c, theme.Idle, 28)
		uiText(c.Key("foot"), a.L.T("home.foot")).FontSize(t.MD).TextColor(t.InkSoft)
	})
}

// homeLives is where the partner lives, as it would say it.
func (a *App) homeLives() string {
	if home := a.homeElsewhere(); home != "" {
		return a.L.T("home.lives.on", home)
	}
	if h := a.homeDevice(); h != nil && !(a.onThisMac() && (h.Kind == "laptop" || h.Kind == "mini")) {
		if h.AlwaysOn || h.Kind == "server" {
			return a.L.T("home.lives.on", h.Name)
		}
		return h.Name
	}
	return a.L.T("home.lives.mac")
}

// homeElsewhere is the name of the home this window talks to when it isn't this Mac (D469 round
// 2: by the home's own device when it says so, a server or another machine, else the address), or
// "" when Ducter runs here.
func (a *App) homeElsewhere() string {
	if a.Backend != nil {
		return ""
	}
	if h := a.homeDevice(); h != nil && (h.Kind == "server" || !a.onThisMachine()) {
		return a.deviceNameIn(h)
	}
	if host := hostOf(a.URL); host != "" && !isLoopback(host) {
		return host
	}
	return ""
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
	if !st.Memory {
		return a.L.T("home.mem.off")
	}
	// D646: the 记得 line says Mem's real state, the same one the pane says: closed is
	// 「Nowledge Mem 没开着」, never 「还没连上」.
	why := ""
	if b := a.S.Bridge; b != nil {
		why = a.failedWhy(b.Detail)
	}
	if v := memStateOf(a.S.Mem, a.S.Bridge, a.memHome(), why); v != nil {
		peersOn := a.S.Settings.Peers != nil && peersSwitchOn(a.S.Settings.Peers.Reach, a.S.Bridge)
		if v.NeedPage == "memory" || peersOn {
			return a.memWord(v.Overview)
		}
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

// placesMap is where things are (D469; motivation: "you should always see where your accounts
// live and what Ducter may do with them"): each computer, then each phone and tablet that reaches
// the partner, as its clay with its name, what it is to the partner and what it does right now.
// The home also says what lives there: the conversation and, while memory is on, the memory.
// A tap opens Devices.
func (a *App) placesMap(c *ui.Context) {
	t := a.T
	if len(a.S.Devices) == 0 && (a.S.Reach == nil || len(a.S.Reach.Clients) == 0) {
		return
	}
	name := a.personaName()
	memOn := false
	if st := a.S.Settings; st != nil {
		memOn = memPhase(st.Memory, a.S.Mem, a.S.Bridge) == "on"
	}
	type place struct {
		key, art, name, role, now string
		nowInk                    ui.Color
		home                      bool
	}
	var places []place
	for pass := 0; pass < 2; pass++ {
		for i := range a.S.Devices {
			dv := &a.S.Devices[i]
			if dv.Home != (pass == 0) {
				continue
			}
			p := place{key: "dev:" + dv.ID, art: deviceArt(dv), name: a.deviceNameIn(dv), role: a.placeRole(dv, name), nowInk: t.InkMuted, home: dv.Home}
			switch n := a.runningOn(dv); {
			case dv.State == protocol.DeviceUnreachable:
				p.nowInk = t.Failed.Ink
			case n == 1:
				p.now, p.nowInk = a.L.T("home.now.tasks.one"), t.Working.Ink
			case n > 1:
				p.now, p.nowInk = a.L.T("home.now.tasks", n), t.Working.Ink
			case dv.State == protocol.DeviceAsleep:
				p.now = a.L.T("home.now.asleep")
			}
			places = append(places, p)
		}
	}
	if a.S.Reach != nil {
		hidden := a.fold().hidden // a window on a computer is that computer's
		for i := range a.S.Reach.Clients {
			cl := &a.S.Reach.Clients[i]
			if hidden[cl.ID] || cl.Form == "cli" {
				continue
			}
			art := clientArt(cl)
			if strings.HasPrefix(art, "laptop") {
				continue // an app window on a computer the home doesn't know as one: not a place of its own
			}
			role := a.L.T("home.role.phone")
			if cl.Handset != nil && cl.Handset.Added {
				role = a.L.T("home.role.lent")
			}
			p := place{key: "cl:" + cl.ID, art: art, name: cl.Name, role: role, nowInk: t.InkMuted}
			if cl.Connected {
				p.now, p.nowInk = a.L.T("home.now.on"), t.Done.Ink
			} else if cl.LastSeen != "" {
				p.now = a.L.T("home.now.seen", a.ago(cl.LastSeen))
			}
			places = append(places, p)
		}
	}
	ui.Column(c.Key("places")).Gap(t.S3).Padding(t.S3, 0, 0, 0).Children(func() {
		// D500: a section head like every pane's (sectionHead): the text edge, the soft ink.
		uiText(c.Key("places-label"), a.L.T("home.map")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Padding(0, t.S5).Role(ui.RoleHeading)
		row := ui.Row(c.Key("places-row")).Gap(t.S3).Wrap().AlignItems(ui.Stretch)
		cardW := gridCardW(row.LayoutBounds().W, 258, t.S3)
		row.Children(func() {
			for _, p := range places {
				p := p
				card := ui.Column(c.Key("place:"+p.key)).Width(cardW).MinHeight(168).Padding(t.S4, t.S5).Gap(t.S1).Radius(t.RadiusLG).Background(t.Surface).
					Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Cursor(ui.CursorPointer).Role(ui.RoleButton).
					Label(spoken(a.L, p.name, p.role, p.now)).Focusable()
				card.Children(func() {
					if bmp := theme.Clay(p.art); bmp != nil {
						iw, ih := ui.ImageSize(bmp)
						w, h := float32(64), float32(64)
						if iw > 0 && ih > 0 && iw > ih {
							h = 64 * ih / iw
						} else if iw > 0 && ih > 0 {
							w = 64 * iw / ih
						}
						ui.Column(c.Key("art")).Height(68).Justify(ui.End).AlignItems(ui.Start).Children(func() {
							ui.Image(c, bmp).Size(w, h).AccessHidden(true)
						})
					}
					uiText(c.Key("n"), p.name).FontSize(t.MD).FontWeight(700).SingleLine().Shrink(1).MinWidth(0).Padding(t.S2, 0, 0, 0)
					roleInk := t.InkMuted
					if p.nowInk == t.Failed.Ink {
						roleInk = t.Failed.Ink
					}
					uiText(c.Key("r"), keepWords(p.role)).FontSize(t.SM).LineHeight(1.4).TextColor(roleInk)
					if p.now != "" {
						uiText(c.Key("now"), keepWords(p.now)).FontSize(t.SM).FontWeight(600).LineHeight(1.4).TextColor(p.nowInk)
					}
					if p.home {
						// What lives here: the conversation (the partner) and its memory.
						ui.Row(c.Key("here")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S2, 0, 0, 0).Children(func() {
							a.avatar(c, theme.Idle, 28)
							here := a.L.T("home.here.conv")
							if memOn {
								a.glyph(c, 24, a.drawNotebook())
								here = a.L.T("home.here")
							}
							uiText(c.Key("here-t"), keepWords(here)).FontSize(t.XS).LineHeight(1.35).TextColor(t.InkSoft).Shrink(1).MinWidth(0)
						})
					}
				})
				if card.Clicked() {
					a.OpenDevices()
				}
			}
		})
	})
}

// gridCardW is a card's width in a grid of cards that fills its row (D551): as many columns
// as fit at least min each, sharing the row so the grid's right edge meets the groups' under it.
// The row's width is last frame's; before the first layout the card keeps min.
func gridCardW(w, min, gap float32) float32 {
	if w < min {
		return min
	}
	cols := int((w + gap) / (min + gap))
	if cols < 1 {
		cols = 1
	}
	return float32(int((w-gap*float32(cols-1))/float32(cols)*100)) / 100
}

// accountPlaces is where the accounts are (D469 round 2): each source as its own place, its mark
// and name, that the mail, calendars and messages pass through it, the accounts it brings (their
// marks), and what the partner may do with them; a calling source says it asks before each call.
// Honest to the flow: the accounts live with their source; the home reads them through it.
func (a *App) accountPlaces(c *ui.Context) {
	t := a.T
	var list []protocol.ConnectionView
	for _, cv := range a.S.Connections {
		list = append(list, cv)
	}
	if len(list) == 0 {
		return
	}
	ui.Column(c.Key("accts")).Gap(t.S3).Padding(t.S3, 0, 0, 0).Children(func() {
		uiText(c.Key("accts-label"), a.L.T("home.accts")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Padding(0, t.S5).Role(ui.RoleHeading)
		row := ui.Row(c.Key("accts-row")).Gap(t.S3).Wrap().AlignItems(ui.Stretch)
		cardW := gridCardW(row.LayoutBounds().W, 360, t.S3)
		row.Children(func() {
			for _, cv := range list {
				cv := cv
				var services []string
				seen := map[string]bool{}
				if cv.Phone == nil {
					for _, w := range tilesOf(cv) {
						if b := brandOf(w.Service); !w.Excluded && !seen[b] {
							seen[b] = true
							services = append(services, w.Service)
						}
					}
				}
				down := cv.Phone == nil && sourceDown(cv)
				card := ui.Column(c.Key("acct:"+cv.ID)).Width(cardW).Padding(t.S4, t.S5).Gap(t.S2).Radius(t.RadiusLG).Background(t.Surface).
					Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(cv.Name).Focusable()
				card.Children(func() {
					ui.Row(c.Key("head")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
						a.sourceTile(c, cv)()
						ui.Column(c.Key("words")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
							uiText(c.Key("n"), cv.Name).FontSize(t.MD).FontWeight(700).SingleLine()
							line, ink := a.L.T("home.acct.via"), t.InkMuted
							switch {
							case cv.Phone != nil:
								line = a.L.T("home.acct.calls")
							case down:
								line, ink = a.L.T("card.unreachable"), t.Failed.Ink
							}
							uiText(c.Key("l"), keepWords(line)).FontSize(t.SM).LineHeight(1.4).TextColor(ink)
						})
					})
					if len(services) > 0 {
						ui.Row(c.Key("marks")).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
							for j, s := range services {
								if j == 5 {
									uiText(c.Key("more"), "+"+strconv.Itoa(len(services)-5)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
									break
								}
								ui.Box(c.Key("svc:"+s)).Size(28, 28).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).Draw(a.drawAppMark(s)).AccessHidden(true)
							}
						})
						uiText(c.Key("may"), keepWords(a.L.T("home.acct.may"))).FontSize(t.SM).LineHeight(1.4).TextColor(t.InkSoft)
					}
				})
				if card.Clicked() {
					a.openTab(TabAccounts)
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
		return a.L.T("home.role.home")
	case dv.Kind == "phone":
		return a.L.T("home.role.phone")
	}
	for _, h := range dv.Harnesses {
		if h.Installed {
			return a.L.T("home.role.worker")
		}
	}
	return a.L.T("home.role.window", name)
}
