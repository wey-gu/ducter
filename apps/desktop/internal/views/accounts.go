package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Settings › 账号 as character sheets (D166, design/connectors.md §12):
// the proactive chips once above the cards (D165 §5), then one card per
// source: its clay mailbox on the sunken oval (its colour says where it
// runs), its name, one status line, a tray of app tiles (tap one: its
// detail in place), one connection line with ⋯ (看了哪些 and the honest
// line, in place), and one destructive text button confirmed inline. Five
// lines of default text; everything else one tap away. Only shared
// controls (design/ui.md "Shared controls").

type acctCards struct {
	tile     map[string]string // connection id -> the open tile ("" none)
	reads    string            // the connection whose 看了哪些 is open
	day      bool              // 今天看了什么 is open (D226)
	stopping string            // the connection whose stop asks in place
}

func (a *App) cards() *acctCards {
	ps := &a.partner
	if ps.cards.tile == nil {
		ps.cards.tile = map[string]string{}
	}
	return &ps.cards
}

// proactiveChips is 发现了就说 (D165 §5): one row, single
// choice; never answered shows none chosen (nothing watches yet).
func (a *App) proactiveChips(c *ui.Context, key string) {
	t := a.T
	st := a.S.Settings
	if st == nil {
		return
	}
	modes := protocol.ProactiveModes
	sel := -1
	for i, m := range modes {
		if m == st.Proactive {
			sel = i
		}
	}
	labels := make([]string, len(modes))
	for i, m := range modes {
		labels[i] = a.L.T("proactive." + m)
	}
	ui.Column(c.Key("proactive:" + key)).Gap(t.S2).Children(func() {
		if !strings.HasPrefix(key, "note-") { // in a note, the question above is its title
			// A settings section like the others (D192): its title at the group headings' size.
			a.heading(c, a.L.T("proactive.title"), t.XL).Padding(0, t.S1)
		}
		if i := a.choices(c, "proactive-"+key, a.L.T("proactive.title"), labels, sel); i >= 0 {
			st.Proactive = modes[i]
			a.SetSettings(protocol.SettingsPatch{Proactive: modes[i]})
		}
		note := "proactive.note.never"
		if sel >= 0 {
			note = "proactive.note." + modes[sel]
		}
		pad := t.S1
		if strings.HasPrefix(key, "note-") {
			pad = 0
		}
		ui.Column(c).Padding(0, pad).Children(func() { a.note(c, a.L.T(note)) })
	})
}

// quietDay is 今天看了什么 / What it looked at today (D226), under the
// switch: counts only, and what it held back under each reason. A reading
// problem shows without opening (a watcher that silently reads nothing is
// the one silence that isn't success); the rest waits behind the button.
func (a *App) quietDay(c *ui.Context) {
	t := a.T
	st := a.S.Settings
	if st == nil || st.Proactive == "" || st.Proactive == "off" {
		return
	}
	cs := a.cards()
	d := a.S.Day
	ui.Column(c.Key("quiet-day")).Gap(t.S2).Padding(0, t.S1).Children(func() {
		if d != nil && d.Problem != nil {
			agent := d.Problem.Agent
			if agent == "" {
				agent = a.L.T("day.agent")
			}
			ui.Text(c, a.L.T("day.problem."+d.Problem.Why, agent)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink)
		}
		if a.quietButton(c, "quiet-day-open", a.L.T("day.title"), "", false, map[bool]int{true: 2, false: 1}[cs.day]) {
			cs.day = !cs.day
			if cs.day {
				a.send(protocol.ProactiveDayReq{T: "proactive_day"})
			}
		}
		if !cs.day || d == nil {
			return
		}
		// The day in short groups (came in · read and said · held · how it
		// stands), a rule's leftovers and a status softer: the phone's own.
		ui.Column(c.Key("quiet-day-list")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
			for g, group := range a.dayGroups(d) {
				ui.Column(c.Key("day-group:" + itoa(int64(g)))).Gap(2).Children(func() {
					for i, line := range group {
						ink := t.Ink
						if line.soft {
							ink = t.InkMuted
						}
						ui.Text(c.Key("day:"+itoa(int64(g))+":"+itoa(int64(i))), line.text).FontSize(t.SM).TextColor(ink).LineHeight(a.leading(1.5))
					}
				})
			}
			ui.Column(c).Gap(t.S2).Children(func() {
				ui.Box(c).Height(1).Background(t.Line)
				ui.Text(c, a.L.T("day.honest")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
			})
		})
	})
}

// dayLine is one line of the day; soft lines are a rule's leftovers and a status.
type dayLine struct {
	text string
	soft bool
}

// dayGroups words one day of watching in the phone's groups and order
// (accounts.tsx dayGroups): what came in, what it read and said, what it
// held and why, and how it stands.
func (a *App) dayGroups(d *protocol.ProactiveDay) [][]dayLine {
	var came, did, held, now []dayLine
	l := d.Looked
	if l.Mail+l.Events+l.Mentions > 0 {
		var parts []string
		if l.Mail > 0 {
			parts = append(parts, a.L.T("day.mail", l.Mail))
		}
		if l.Events > 0 {
			parts = append(parts, a.L.T("day.events", l.Events))
		}
		if l.Mentions > 0 {
			parts = append(parts, a.L.T("day.mentions", l.Mentions))
		}
		came = append(came, dayLine{text: a.L.T("day.looked", strings.Join(parts, a.L.T("day.sep")))})
	} else {
		came = append(came, dayLine{text: a.L.T("day.none")})
	}
	if d.Skipped.Notices > 0 {
		came = append(came, dayLine{a.L.T("day.notices", d.Skipped.Notices), true})
	}
	if d.Skipped.Promo > 0 {
		came = append(came, dayLine{a.L.T("day.promo", d.Skipped.Promo), true})
	}
	if d.Skipped.Muted > 0 {
		came = append(came, dayLine{a.L.T("day.muted_senders", d.Skipped.Muted), true})
	}
	if d.Read > 0 || d.Noted > 0 {
		did = append(did, dayLine{text: a.L.T("day.read", d.Read, d.Noted)})
	}
	did = append(did, dayLine{text: a.L.T("day.said", d.Said)})
	for _, h := range d.Held {
		if h.Reason == "for_morning" && d.NextNote != "" {
			held = append(held, dayLine{text: a.L.T("day.held.for_morning_at", h.N, clockOf(d.NextNote))})
		} else {
			held = append(held, dayLine{text: a.L.T("day.held."+h.Reason, h.N)})
		}
	}
	if d.CatchingUp {
		now = append(now, dayLine{a.L.T("day.catching_up"), true})
	}
	if d.PushOff {
		now = append(now, dayLine{a.L.T("day.push_off"), true})
	}
	var out [][]dayLine
	for _, g := range [][]dayLine{came, did, held, now} {
		if len(g) > 0 {
			out = append(out, g)
		}
	}
	return out
}

// dayLines is the day's lines in order, without the groups.
func (a *App) dayLines(d *protocol.ProactiveDay) []string {
	var out []string
	for _, g := range a.dayGroups(d) {
		for _, l := range g {
			out = append(out, l.text)
		}
	}
	return out
}

// sourceCards is the cards, two to a row when there is room.
func (a *App) sourceCards(c *ui.Context, list []protocol.ConnectionView) {
	t := a.T
	ui.Row(c.Key("acct-cards")).Wrap().Gap(t.S4).AlignItems(ui.Start).Children(func() {
		for _, cv := range list {
			if cv.Phone != nil {
				a.phoneCard(c, cv) // D193: a calling connection has its own card
				continue
			}
			a.sourceCard(c, cv)
		}
	})
}

func (a *App) sourceCard(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	cs := a.cards()
	name := connName(a, cv)
	card := ui.Column(c.Key("src:"+cv.ID)).Width(400).MinWidth(0).Grow(1).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Padding(t.S5).Gap(t.S4).Role(ui.RoleGroup).Label(name)
	card.Children(func() {
		// Who: the mailbox on its oval, the name, one status line.
		ui.Column(c).AlignItems(ui.Center).Gap(t.S1).Children(func() {
			ui.Box(c.Key("mailbox:"+cv.ID)).Size(220, 128).Draw(a.drawMailboxHero(cv.Source, sourceDown(cv))).AccessHidden(true)
			ui.Text(c, name).FontSize(t.XL).FontWeight(800).SingleLine().Tooltip(name)
			line, ink := a.sourceStatus(cv)
			ui.Text(c, line).FontSize(t.SM).TextColor(ink).LineHeight(a.leading(1.45))
			// D158: connected, but nothing there to read yet: where to fix it.
			if cv.Source == "oomol" && cv.Apps != nil && len(cv.Apps) == 0 && !sourceDown(cv) {
				if a.quietLink(c, "acct-connect:"+cv.ID, a.L.T("acct.connect.oomol"), a.L.T("acct.connect.oomol")) {
					a.openLink(oomolAccounts)
				}
			}
		})
		// What it can read: the tray, and the open tile's detail under it.
		a.appTray(c, cv)
		// D222: a calendar new to this client, or Gmail without one.
		a.calFirstLine(c, cv)
		a.calNudge(c, cv)
		// The connection itself, last and quiet (D192): where what it reads
		// passes, then its two actions on one row: 看了哪些 and the stop.
		ui.Box(c).Height(1).Background(t.Line)
		ui.Column(c.Key("conn:" + cv.ID)).Gap(t.S2).Children(func() {
			ui.Text(c, a.connLine(cv)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.45))
			if cs.reads == cv.ID {
				a.readsList(c, cv)
			}
			a.connActions(c, cv, name)
		})
	})
}

// connLine is where what a source reads passes (D192): worded by the apps
// it holds (邮件和消息), never mail for a source that also holds chats.
func (a *App) connLine(cv protocol.ConnectionView) string {
	switch cv.Source {
	case "oo", "oomol":
		return a.L.T("card.conn."+cv.Source, a.flows(cv))
	}
	return a.L.T("card.conn." + cv.Source)
}

// flows is what passes, in the order a person thinks of it: 邮件、日程和消息.
func (a *App) flows(cv protocol.ConnectionView) string {
	has := map[string]bool{}
	for _, w := range tilesOf(cv) {
		if !w.Excluded {
			has[kindOf(w.Service)] = true
		}
	}
	var words []string
	for _, k := range []string{"mail", "calendar", "chat", "github", "other"} {
		if has[k] {
			words = append(words, a.L.T("flow."+k))
		}
	}
	if len(words) == 0 {
		return a.L.T("flow.other")
	}
	if len(words) == 1 {
		return words[0]
	}
	return strings.Join(words[:len(words)-1], a.L.T("acct.sep")) + a.L.T("flow.and") + words[len(words)-1]
}

func sourceDown(cv protocol.ConnectionView) bool {
	return cv.State == "unreachable" || cv.State == "unauthorized"
}

// sourceStatus is the card's one line (D166 (2)), in its ink.
func (a *App) sourceStatus(cv protocol.ConnectionView) (string, ui.Color) {
	t := a.T
	switch {
	case cv.State == "unauthorized" && cv.Source == "oo":
		return a.L.T("card.oo_out"), t.Failed.Ink
	case cv.State == "unauthorized":
		return a.L.T("card.key_bad"), t.Failed.Ink
	case cv.State == "unreachable":
		return a.L.T("card.unreachable"), t.Failed.Ink
	case cv.Source != "mcp" && cv.Apps != nil && len(cv.Apps) == 0:
		return a.L.T("card.empty"), t.InkSoft
	}
	l := cv.Look
	if l == nil || !l.Watching {
		return a.L.T("card.status.asked"), t.InkSoft
	}
	// D173: the plain state, never how much it read (that is under 看了哪些).
	if l.Paused {
		return a.L.T("card.status.paused"), t.InkSoft
	}
	return a.L.T("card.status.watching"), t.InkSoft
}

// tiles are the apps a source shows: from its look when watched, else
// from what it can read (one tile per account).
func tilesOf(cv protocol.ConnectionView) []protocol.AppWatch {
	if cv.Look != nil && len(cv.Look.Apps) > 0 {
		return cv.Look.Apps
	}
	var out []protocol.AppWatch
	for _, ap := range cv.Apps {
		if len(ap.Accounts) == 0 {
			out = append(out, protocol.AppWatch{Service: ap.Service, Title: ap.Title, Watch: true})
		}
		for _, acc := range ap.Accounts {
			out = append(out, protocol.AppWatch{Service: ap.Service, Title: ap.Title, Account: acc, Watch: true})
		}
	}
	return out
}

func tileKey(w protocol.AppWatch) string { return w.Service + ":" + w.Account }

// tileWords is a tile's two lines: the app (日历 for any calendar) and,
// when the app has more than one account here, the account's short form.
func (a *App) tileWords(w protocol.AppWatch, siblings []string) (string, string) {
	title := w.Title
	if strings.Contains(w.Service, "calendar") {
		title = a.L.T("tile.calendar")
	}
	sub := ""
	if len(siblings) > 1 && w.Account != "" {
		sub = shortAccount(w.Account, siblings)
	}
	return title, sub
}

// publicMail are the mail domains anyone can sign up at: there the name
// before @ says whose it is; anywhere else the domain does (D192).
var publicMail = map[string]bool{
	"gmail.com": true, "googlemail.com": true, "outlook.com": true, "hotmail.com": true, "live.com": true, "msn.com": true,
	"icloud.com": true, "me.com": true, "mac.com": true, "yahoo.com": true, "aol.com": true, "proton.me": true, "protonmail.com": true,
	"qq.com": true, "foxmail.com": true, "163.com": true, "126.com": true, "yeah.net": true, "sina.com": true,
}

// shortAccount is an account's short form on its tile (D192): an address
// at a mail provider by its name (weyl.gu), one at a company by its
// domain (nowledge-labs); when two of the app's accounts would read the
// same, the name before @; still the same, the whole address. Anything
// not an address (a workspace, a handle) is itself.
func shortAccount(acc string, siblings []string) string {
	clash := func(f func(string) string) bool {
		s := f(acc)
		for _, o := range siblings {
			if o != acc && f(o) == s {
				return true
			}
		}
		return false
	}
	if !clash(mailShort) {
		return mailShort(acc)
	}
	if !clash(mailLocal) {
		return mailLocal(acc)
	}
	return acc
}

func mailLocal(acc string) string {
	if at := strings.LastIndex(acc, "@"); at > 0 {
		return acc[:at]
	}
	return acc
}

func mailShort(acc string) string {
	at := strings.LastIndex(acc, "@")
	if at <= 0 {
		return acc
	}
	dom := strings.ToLower(acc[at+1:])
	if publicMail[dom] {
		return acc[:at]
	}
	if i := strings.Index(dom, "."); i > 0 {
		return dom[:i]
	}
	return dom
}

func (a *App) appTray(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	cs := a.cards()
	tiles := tilesOf(cv)
	accts := map[string][]string{}
	for _, w := range tiles {
		accts[w.Service] = append(accts[w.Service], w.Account)
	}
	open := cs.tile[cv.ID]
	ui.Row(c.Key("tray:" + cv.ID)).Wrap().Gap(t.S1).Justify(ui.Center).AlignItems(ui.Start).Padding(t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
		for _, w := range tiles {
			w := w
			label, sub := a.tileWords(w, accts[w.Service])
			k := tileKey(w)
			full := label
			if w.Account != "" {
				full += " · " + w.Account
			}
			// Not read: the tile says so in words, not only in grey (D192).
			if w.Excluded {
				sub = a.L.T("tile.excluded")
				full += " · " + sub
			}
			if a.appTile(c, cv.ID+"|"+k, label, sub, full, a.drawAppMark(w.Service), open == k, !w.Watch, w.Excluded || w.Unreachable || sourceDown(cv), false) {
				if open == k {
					cs.tile[cv.ID] = ""
				} else {
					cs.tile[cv.ID] = k
				}
			}
		}
		if cv.Source == "oo" || cv.Source == "oomol" {
			more := a.L.T("tile.more." + cv.Source)
			if a.appTile(c, cv.ID+"|more", a.L.T("tile.more"), "", more, nil, false, false, false, true) {
				a.openLink(oomolAccounts)
			}
		}
	})
	if open == "" {
		return
	}
	for _, w := range tiles {
		if tileKey(w) == open {
			a.tileDetail(c, cv, w)
		}
	}
}

// kindOf is the reads/asks words a service takes.
func kindOf(service string) string {
	switch {
	case service == "gmail" || service == "outlook":
		return "mail"
	case strings.Contains(service, "calendar"):
		return "calendar"
	case service == "github":
		return "github"
	case service == "discord" || service == "discordbot" || service == "slack" || service == "slackbot" || service == "telegram" || service == "feishu" || service == "lark":
		return "chat"
	}
	return "other"
}

// tileDetail is a tile's detail, in place under the tray (never a
// floating layer), in three bands (D192): who (the app, the whole account,
// when it last looked); what it may do (会看 and 先问你, a label column and
// the words); and the person's two choices: 自己留意 (chat: only
// @-mentions and DMs) and, quiet at the foot, 不让 Ducter 看这个 (oo:
// signing out is in oo). A tile it doesn't read says only that.
func (a *App) tileDetail(c *ui.Context, cv protocol.ConnectionView, w protocol.AppWatch) {
	t := a.T
	k := kindOf(w.Service)
	title, _ := a.tileWords(w, nil)
	rule := func() { ui.Box(c).Height(1).Background(t.LineSoft) }
	ui.Column(c.Key("detail:"+cv.ID+"|"+tileKey(w))).Gap(t.S3).Padding(t.S4).Radius(t.RadiusMD).Border(1, t.LineSoft).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Size(t.IconTile+8, t.IconTile+8).Radius(10).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).Draw(a.drawAppMark(w.Service)).AccessHidden(true).Shrink(0)
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, title).FontSize(t.MD).FontWeight(800).SingleLine()
				sub := w.Account
				if w.LastReadAt != "" && !w.Excluded {
					last := a.L.T("tile.last", a.ago(w.LastReadAt))
					if sub != "" {
						sub += " · "
					}
					sub += last
				}
				if sub != "" {
					ui.Text(c, sub).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.4))
				}
			})
		})
		if w.Excluded {
			a.note(c, a.L.T("tile.excluded.note"))
		} else {
			rule()
			ui.Column(c).Gap(t.S2).Children(func() {
				a.factRow(c, a.L.T("tile.reads.label"), a.L.T("tile.reads."+k))
				a.factRow(c, a.L.T("tile.asks.label"), a.L.T("tile.asks."+k))
			})
			if k != "other" {
				rule()
				note := ""
				if k == "chat" {
					note = a.L.T("tile.mentions")
				}
				if st := a.S.Settings; st != nil && (st.Proactive == "" || st.Proactive == "off") && w.Watch {
					// The switch keeps the person's choice; it says why it isn't looking now.
					if note != "" {
						note += "\n"
					}
					note += a.L.T("tile.watch.held." + map[bool]string{true: "never", false: "off"}[st.Proactive == ""])
				} else if cv.Look != nil && cv.Look.Watching && w.Watch {
					if note != "" {
						note += " · "
					}
					note += a.L.T("card.budget", cv.Look.BudgetPct)
				}
				if v, changed := a.switchRow(c, "watch:"+cv.ID+"|"+tileKey(w), a.L.T("tile.watch"), note, w.Watch); changed {
					a.send(protocol.AppWatchSet{T: "app_watch", ID: cv.ID, Service: w.Service, Account: w.Account, Watch: &v})
				}
			}
			if k == "calendar" {
				rule()
				a.calendarsBand(c, cv, w) // D222: 看哪些日历 / Calendars it reads
			}
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
			ex := a.L.T("tile.exclude")
			if w.Excluded {
				ex = a.L.T("tile.include")
			}
			if a.quietButton(c, "exclude:"+cv.ID+"|"+tileKey(w), ex, title, w.Excluded, 0) {
				v := !w.Excluded
				a.send(protocol.AppWatchSet{T: "app_watch", ID: cv.ID, Service: w.Service, Account: w.Account, Excluded: &v})
			}
			if cv.Source == "oo" {
				ui.Box(c).Grow(1)
				ui.Text(c, a.L.T("tile.signout_oo")).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
			}
		})
	})
}

// factRow is one fact in a detail: a short label in a column of its own,
// then the words (会看 · @你 的消息和私信).
func (a *App) factRow(c *ui.Context, label, text string) {
	t := a.T
	ui.Row(c).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(a.factW()).Shrink(0)
		ui.Text(c, text).FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.5)).Grow(1).Basis(0).MinWidth(0)
	})
}

// factW is the label column: two or three characters in zh, a word or two in en.
func (a *App) factW() float32 {
	if a.L.Lang == "zh" {
		return 52
	}
	return 84
}

// readsList is 看了哪些 / What it read, in place: today's reads, one line
// each, and the honest line.
func (a *App) readsList(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	reads := a.S.ConnReads[cv.ID]
	ui.Column(c.Key("readlist:"+cv.ID)).Gap(t.S1).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
		if len(reads) == 0 {
			ui.Text(c, a.L.T("card.read.none")).FontSize(t.SM).TextColor(t.InkSoft)
		}
		for i, r := range reads {
			if i >= 8 {
				break
			}
			app := r.Service
			var sibs []string
			for _, w := range tilesOf(cv) {
				if w.Service == r.Service {
					app, _ = a.tileWords(w, nil)
					sibs = append(sibs, w.Account)
				}
			}
			if r.Account != "" && len(sibs) > 1 {
				app += " · " + shortAccount(r.Account, sibs)
			}
			ui.Row(c.Key("read:" + itoa(int64(i)))).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
				ui.Text(c, clockOf(r.At)).FontSize(t.SM).TextColor(t.InkMuted).Width(44).Shrink(0)
				ui.Text(c, a.L.T("read."+r.What, app, r.Items)).FontSize(t.SM).TextColor(t.Ink).Grow(1).MinWidth(0).SingleLine()
			})
		}
		ui.Box(c).Height(1).Background(t.LineSoft).Margin(t.S1, 0)
		ui.Text(c, a.L.T("acct.honest")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
	})
}

// connActions is the connection's one row (D192): 看了哪些 at the start,
// the one destructive at the end; the stop asks in place, on the same row.
func (a *App) connActions(c *ui.Context, cv protocol.ConnectionView, name string) {
	t := a.T
	cs := a.cards()
	if cs.stopping == cv.ID {
		ui.Column(c.Key("stop-ask:"+cv.ID)).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Failed.Surface).Children(func() {
			ui.Text(c, a.L.T("card.stop.ask")).FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.5))
			ui.Row(c).Gap(t.S2).Justify(ui.End).AlignItems(ui.Center).Children(func() {
				if a.quietButton(c, "stop-keep:"+cv.ID, a.L.T("card.stop.keep"), name, false, 0) {
					cs.stopping = ""
				}
				if a.dangerText(c, "stop-go:"+cv.ID, a.L.T("card.stop.go"), name) {
					cs.stopping = ""
					a.send(protocol.ConnectionRemove{T: "connection_remove", ID: cv.ID})
				}
			})
		})
		return
	}
	ui.Row(c.Key("conn-acts:" + cv.ID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		open := cs.reads == cv.ID
		if a.quietButton(c, "reads:"+cv.ID, a.L.T("card.read_list"), "", false, map[bool]int{true: 2, false: 1}[open]) {
			if open {
				cs.reads = ""
			} else {
				cs.reads = cv.ID
				a.send(protocol.ConnectionReadsReq{T: "connection_reads", ID: cv.ID})
			}
		}
		ui.Box(c).Grow(1)
		if a.dangerText(c, "stop:"+cv.ID, a.L.T("card.stop", name), "") {
			cs.stopping = cv.ID
		}
	})
}

// ---------- art (stand-ins until the clay art lands; todo.md) ----------

// oval is an oval path through four cubic arcs.
func oval(cx, cy, rx, ry float32) *ui.Path {
	const k = 0.5523
	var p ui.Path
	p.MoveTo(cx+rx, cy).
		CubeTo(cx+rx, cy+ry*k, cx+rx*k, cy+ry, cx, cy+ry).
		CubeTo(cx-rx*k, cy+ry, cx-rx, cy+ry*k, cx-rx, cy).
		CubeTo(cx-rx, cy-ry*k, cx-rx*k, cy-ry, cx, cy-ry).
		CubeTo(cx+rx*k, cy-ry, cx+rx, cy-ry*k, cx+rx, cy).Close()
	return &p
}

// drawMailboxHero is the source's mailbox at 120 on the sunken oval;
// down (signed out, refused): grey.
func (a *App) drawMailboxHero(source string, down bool) func(p *ui.Painter, r ui.Rect) {
	t := a.T
	box := a.drawMailbox(source)
	if down {
		box = a.drawMailbox("down")
	}
	return func(p *ui.Painter, r ui.Rect) {
		cx := r.X + r.W/2
		p.FillPath(oval(cx, r.Y+r.H-14, r.W*0.42, 12), t.SurfaceSunken)
		p.FillPath(oval(cx, r.Y+r.H-15, r.W*0.30, 8), t.Line.Alpha(0.5))
		h := r.H - 6
		w := h * 52 / 84
		box(p, ui.Rect{X: cx - w/2, Y: r.Y, W: w, H: h})
	}
}

// drawAppMark is an app's mark on its tile: simple printed shapes in the
// app's own colours (official marks where their guidelines allow, D146,
// are owed with the clay art).
func (a *App) drawAppMark(service string) func(p *ui.Painter, r ui.Rect) {
	t := a.T
	hex := ui.Hex
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		switch kindOf(service) {
		case "mail":
			var m ui.Path
			m.MoveTo(cx-11, cy+8).LineTo(cx-11, cy-7).LineTo(cx, cy+2).LineTo(cx+11, cy-7).LineTo(cx+11, cy+8)
			p.StrokePath(&m, 3.2, hex("#EA4335"))
			p.Fill(ui.Rect{X: cx - 12.6, Y: cy - 6, W: 3.2, H: 14}, hex("#4285F4"), 1)
			p.Fill(ui.Rect{X: cx + 9.4, Y: cy - 6, W: 3.2, H: 14}, hex("#34A853"), 1)
		case "calendar":
			p.Fill(ui.Rect{X: cx - 11, Y: cy - 10, W: 22, H: 21}, hex("#FFFFFF"), 4)
			p.Fill(ui.Rect{X: cx - 11, Y: cy - 10, W: 22, H: 6}, hex("#4285F4"), 3)
			for i := 0; i < 3; i++ {
				for j := 0; j < 2; j++ {
					p.Fill(ui.Rect{X: cx - 7 + float32(i)*5.5, Y: cy - 1 + float32(j)*5.5, W: 3.4, H: 3.4}, hex("#4285F4").Alpha(0.7), 1)
				}
			}
		case "github":
			p.FillPath(oval(cx, cy, 12, 12), hex("#24292F"))
			p.FillPath(oval(cx, cy+1, 5.5, 5), hex("#FFFFFF"))
			p.FillPath(oval(cx-3.6, cy-5, 2.2, 3), hex("#FFFFFF"))
			p.FillPath(oval(cx+3.6, cy-5, 2.2, 3), hex("#FFFFFF"))
		case "chat":
			if strings.HasPrefix(service, "slack") {
				// Slack's four bars, so it never reads as Discord.
				p.Fill(ui.Rect{X: cx - 10, Y: cy - 6.5, W: 20, H: 5}, hex("#36C5F0"), 2.5)
				p.Fill(ui.Rect{X: cx + 1.5, Y: cy - 10, W: 5, H: 20}, hex("#2EB67D"), 2.5)
				p.Fill(ui.Rect{X: cx - 10, Y: cy + 1.5, W: 20, H: 5}, hex("#ECB22E"), 2.5)
				p.Fill(ui.Rect{X: cx - 6.5, Y: cy - 10, W: 5, H: 20}, hex("#E01E5A"), 2.5)
				return
			}
			p.Fill(ui.Rect{X: cx - 13, Y: cy - 9, W: 26, H: 18}, hex("#5865F2"), 8)
			p.FillPath(oval(cx-4.5, cy, 2.4, 2.8), hex("#FFFFFF"))
			p.FillPath(oval(cx+4.5, cy, 2.4, 2.8), hex("#FFFFFF"))
		default:
			// Any other app: a plain app grid, in ink (never the grey of off).
			for i := 0; i < 2; i++ {
				for j := 0; j < 2; j++ {
					p.Fill(ui.Rect{X: cx - 9 + float32(i)*10, Y: cy - 9 + float32(j)*10, W: 8, H: 8}, t.InkSoft, 2.5)
				}
			}
		}
	}
}
