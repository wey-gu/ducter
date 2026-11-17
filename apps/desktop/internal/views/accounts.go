package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Settings › 账号 / Accounts on D273's grid (D289; after D166's character
// sheets, design/connectors.md §12): 发现了就说 as a section of its own,
// then each source as one raised group whose first row is the connection
// (its clay mailbox small in the tile column, its name, how it stands in
// that state's ink), a row per app and account it can read (whether Ducter
// reads it, its switch; its detail in place), the add row, and its last
// line: where what it reads passes, and its quiet actions. A destructive
// action is quiet until hovered and asks in place. Only shared controls
// (design/ui.md "Shared controls").

type acctCards struct {
	tile     map[string]string // connection id -> the open service ("" none)
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

// proactiveSel is the chosen mode's index, and its note's key.
func (a *App) proactiveSel(st *protocol.Settings) (int, []string, string) {
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
	note := "proactive.note.never"
	if sel >= 0 {
		note = "proactive.note." + modes[sel]
	}
	if sel >= 0 && st.ProactiveBy == "default" { // D250: never chosen says so
		note = "proactive.note.default"
	}
	return sel, labels, note
}

// proactiveChips is 发现了就说 (D165 §5) inside the morning note: the
// segmented choice and its note; never answered shows none chosen.
func (a *App) proactiveChips(c *ui.Context, key string) {
	t := a.T
	st := a.S.Settings
	if st == nil {
		return
	}
	sel, labels, note := a.proactiveSel(st)
	ui.Column(c.Key("proactive:" + key)).Gap(t.S2).Children(func() {
		if i := a.choices(c, "proactive-"+key, a.L.T("proactive.title"), labels, sel); i >= 0 {
			st.Proactive = protocol.ProactiveModes[i]
			a.SetSettings(protocol.SettingsPatch{Proactive: st.Proactive})
		}
		a.note(c, a.L.T(note))
	})
}

// proactiveSection is 发现了就说 as a Settings section (D289): its header
// on the text edge, one group holding the choice and the note that says
// what it means; on Notifications also 今天看了什么 (D226) as its next row.
func (a *App) proactiveSection(c *ui.Context, key string, day bool) {
	t := a.T
	st := a.S.Settings
	if st == nil {
		return
	}
	sel, labels, note := a.proactiveSel(st)
	a.group(c, "proactive:"+key, a.L.T("proactive.title"), "", func() {
		a.sep(c)
		ui.Column(c.Key("proactive:"+key)).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
			if i := a.choices(c, "proactive-"+key, a.L.T("proactive.title"), labels, sel); i >= 0 {
				st.Proactive = protocol.ProactiveModes[i]
				a.SetSettings(protocol.SettingsPatch{Proactive: st.Proactive})
			}
			a.note(c, a.L.T(note))
		})
		if day {
			a.quietDay(c)
		}
	})
}

// quietDay is 今天看了什么 / What it looked at today (D226), the row under
// the choice: counts only, and what it held back under each reason. A
// reading problem shows without opening (a watcher that silently reads
// nothing is the one silence that isn't success); the rest waits behind
// the row.
func (a *App) quietDay(c *ui.Context) {
	t := a.T
	st := a.S.Settings
	if st == nil || st.Proactive == "" || st.Proactive == "off" {
		return
	}
	cs := a.cards()
	d := a.S.Day
	a.sep(c)
	if a.disclosureRow(c, "quiet-day-open", a.L.T("day.title"), "", cs.day) {
		cs.day = !cs.day
		if cs.day {
			a.send(protocol.ProactiveDayReq{T: "proactive_day"})
		}
	}
	if d != nil && d.Problem != nil {
		agent := d.Problem.Agent
		if agent == "" {
			agent = a.L.T("day.agent")
		}
		line := a.L.T("day.problem."+d.Problem.Why, agent)
		if d.Problem.Why == "nothing_kept" { // D232: no agent named
			line = a.L.T("day.problem.nothing_kept")
		}
		ui.Text(c.Key("quiet-day-problem"), line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink).Padding(0, t.S5, t.S4, t.S5)
	}
	if !cs.day || d == nil {
		return
	}
	// The day in short groups (came in · read and said · held · how it
	// stands), a rule's leftovers and a status softer: the phone's own.
	a.sep(c)
	ui.Column(c.Key("quiet-day-list")).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
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
		ui.Text(c, a.L.T("day.honest")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
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

// sourceCards is the sources, one raised group each, one under another
// (D289: never a masonry of cards), then the add row in its own group.
func (a *App) sourceCards(c *ui.Context, list []protocol.ConnectionView) {
	t := a.T
	ui.Column(c.Key("acct-sources")).Gap(t.S2).Children(func() {
		a.sectionHead(c, a.L.T("acct.sec.read"), "")
		ui.Column(c).Gap(t.S5).Children(func() {
			for _, cv := range list {
				if cv.Phone == nil {
					a.sourceCard(c, cv)
				}
			}
		})
	})
}

// sourceTone is a source's status line in its state's ink (D289).
func sourceTone(cv protocol.ConnectionView, ink ui.Color, t *theme.Tokens) sideTone {
	switch {
	case ink == t.Failed.Ink:
		return sideFailed
	case cv.Look != nil && cv.Look.Watching && !cv.Look.Paused:
		return sideDone
	case cv.Source != "mcp" && cv.Apps != nil && len(cv.Apps) == 0:
		return sideInk
	}
	return sideMuted
}

// sourceTile is a source's mark in the tile column: OOMOL's own mark for
// OOMOL and its oo (D314, a product the person signed in to), the clay
// mailbox for a source of the person's own (an address and key, an MCP).
func (a *App) sourceTile(c *ui.Context, cv protocol.ConnectionView) func() {
	if cv.Source == "oomol" || cv.Source == "oo" {
		return a.brandTile(c, "oomol", sourceDown(cv))
	}
	return a.mailboxTile(c, cv)
}

// brandOf is the product mark a service is shown by (D314), "" for one
// Ducter has no faithful mark of (it keeps its drawn stand-in).
func brandOf(service string) string {
	switch {
	case service == "gmail":
		return "gmail"
	case service == "googlecalendar" || service == "google_calendar":
		return "googlecalendar"
	case service == "github":
		return "github"
	case strings.HasPrefix(service, "slack"):
		return "slack"
	case strings.HasPrefix(service, "discord"):
		return "discord"
	case service == "telegram":
		return "telegram"
	}
	return ""
}

// toolBrand is another AI tool's own mark by the name Mem gives it
// (mem-source.ts), "" for one with no mark here (D314).
func toolBrand(from string) string {
	return map[string]string{"Cursor": "cursor", "Cline": "cline", "Windsurf": "windsurf", "Gemini": "gemini", "Gemini CLI": "gemini", "Zed": "zed", "Raycast": "raycast"}[from]
}

// serviceTile is an app's row tile: its own mark when Ducter has it, else
// the drawn stand-in, both on the small white clay tile.
func (a *App) serviceTile(c *ui.Context, key, service string) func() {
	if b := brandOf(service); b != "" {
		return a.brandTile(c, b, false)
	}
	return a.markTile(c, key, a.drawAppMark(service))
}

// mailboxTile is a source's clay mailbox, small, in the tile column.
func (a *App) mailboxTile(c *ui.Context, cv protocol.ConnectionView) func() {
	box := a.drawMailbox(cv.Source)
	if sourceDown(cv) {
		box = a.drawMailbox("down")
	}
	return a.markTile(c, "mailbox:"+cv.ID, func(p *ui.Painter, r ui.Rect) {
		h := r.H - 6
		w := h * 52 / 84
		box(p, ui.Rect{X: r.X + (r.W-w)/2, Y: r.Y + 3, W: w, H: h})
	})
}

// sourceCard is one source as one raised group (D289): its first row the
// connection (mailbox, name, how it stands), a row per app and account
// it can read (whether Ducter reads it, its switch, its detail in place),
// the add row, then its last line: where what it reads passes, and its
// two quiet actions (看了哪些, and the stop, which asks in place).
func (a *App) sourceCard(c *ui.Context, cv protocol.ConnectionView) {
	cs := a.cards()
	name := connName(a, cv)
	a.group(c, "src:"+cv.ID, "", "", func() {
		line, ink := a.sourceStatus(cv)
		var control func()
		// D158: connected, but nothing there to read yet: where to fix it.
		if cv.Source == "oomol" && cv.Apps != nil && len(cv.Apps) == 0 && !sourceDown(cv) {
			control = func() {
				if a.quietLink(c, "acct-connect:"+cv.ID, a.L.T("acct.connect.oomol"), a.L.T("acct.connect.oomol")) {
					a.openLink(oomolAccounts)
				}
			}
		}
		a.headRow(c, "src:"+cv.ID, a.sourceTile(c, cv), name, line, sourceTone(cv, ink, a.T), control)
		a.serviceRows(c, cv)
		// D222: a calendar new to this client, or Gmail without one.
		a.calFirstLine(c, cv)
		a.calNudge(c, cv)
		if cv.Source == "oo" || cv.Source == "oomol" {
			if a.addRow(c, "more:"+cv.ID, a.L.T("tile.more."+cv.Source), a.L.T("acct.more.line")) {
				a.openLink(oomolAccounts)
			}
		}
		if cs.reads == cv.ID {
			a.textBlock(c, "reads:"+cv.ID, func() { a.readsList(c, cv) })
		}
		a.connActions(c, cv, name)
	})
	a.saidLine(c, "watch:"+cv.ID) // D296
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

// sourceStatus is the source's one line (D166 (2)), in its ink.
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

// serviceRows are the apps and accounts a source can read, one row each
// (D289, after D166's tray): the app's mark in the tile column, the app as
// the title, the whole account as its one line, and at the right edge
// whether Ducter reads it as a state word in its ink, then the switch for
// watching on its own where that exists (D291: each fact its own element,
// never joined with " · "). A row opens its detail in place under it.
func (a *App) serviceRows(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	cs := a.cards()
	open := cs.tile[cv.ID]
	for _, w := range tilesOf(cv) {
		w := w
		k := tileKey(w)
		title, _ := a.tileWords(w, nil)
		state, ink := a.serviceState(cv, w)
		sw := kindOf(w.Service) != "other" && !w.Excluded && !sourceDown(cv)
		control := func() {
			// D296: the word only where the row differs from what the
			// group's first row already says (its switch says the rest).
			if state != "" {
				ui.Text(c, state).FontSize(t.SM).FontWeight(600).TextColor(ink).SingleLine()
			}
			if sw {
				v := w.Watch
				if a.switchControl(c, "watch:"+cv.ID+"|"+k, title+", "+a.L.T("tile.watch"), &v) {
					a.send(protocol.AppWatchSet{T: "app_watch", ID: cv.ID, Service: w.Service, Account: w.Account, Watch: &v})
					// D296: the switch moved; the partner says what that means, once.
					what := title
					if w.Account != "" {
						what = w.Account
					}
					if v {
						a.say("watch:"+cv.ID, a.L.T("said.watch.on", what))
					} else {
						a.say("watch:"+cv.ID, a.L.T("said.watch.off", what))
					}
				}
			}
		}
		if a.openRow(c, "svc:"+cv.ID+"|"+k, a.serviceTile(c, "app:"+cv.ID+"|"+k, w.Service), title, w.Account, t.InkMuted, open == k, control) {
			if open == k {
				cs.tile[cv.ID] = ""
			} else {
				cs.tile[cv.ID] = k
			}
		}
		if open == k {
			a.textBlock(c, "detail:"+cv.ID+"|"+k, func() { a.tileDetail(c, cv, w) })
		}
	}
}

// serviceState is whether Ducter reads a service, as one state word in its
// ink: 自己留意着 (done), 你问起来才看, 不看, 连不上 (failed). D296: a
// service that reads the way its group's first row says (在留意: watching;
// 你问起来才去看: asked) says nothing, so the page names only the
// exceptions; 不看 and 连不上 always speak.
func (a *App) serviceState(cv protocol.ConnectionView, w protocol.AppWatch) (string, ui.Color) {
	t := a.T
	watching := cv.Look != nil && cv.Look.Watching && !cv.Look.Paused
	switch {
	case w.Excluded:
		return a.L.T("svc.excluded"), t.InkMuted
	case w.Unreachable || sourceDown(cv):
		return a.L.T("card.unreachable"), t.Failed.Ink
	case kindOf(w.Service) != "other" && w.Watch:
		if watching {
			return "", t.Done.Ink
		}
		return a.L.T("svc.watching"), t.Done.Ink
	}
	if !watching {
		return "", t.InkMuted
	}
	return a.L.T("svc.asked"), t.InkMuted
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

// tileDetail is a service's detail, in place under its row on the text
// column (D289; D192's bands): what it may read and what it asks first,
// why it isn't looking now, the calendars it reads, and the one quiet
// choice 不让 Ducter 看这个 (oo: signing out is in oo). A service it
// doesn't read says only that.
func (a *App) tileDetail(c *ui.Context, cv protocol.ConnectionView, w protocol.AppWatch) {
	t := a.T
	k := kindOf(w.Service)
	title, _ := a.tileWords(w, nil)
	if w.Excluded {
		a.note(c, a.L.T("tile.excluded.note"))
	} else {
		ui.Column(c).Gap(t.S2).Children(func() {
			a.factRow(c, a.L.T("tile.reads.label"), a.L.T("tile.reads."+k))
			a.factRow(c, a.L.T("tile.asks.label"), a.L.T("tile.asks."+k))
		})
		var notes []string
		if k == "chat" {
			notes = append(notes, a.L.T("tile.mentions"))
		}
		if st := a.S.Settings; st != nil && (st.Proactive == "" || st.Proactive == "off") && w.Watch {
			// The switch keeps the person's choice; this says why it isn't looking now.
			notes = append(notes, a.L.T("tile.watch.held."+map[bool]string{true: "never", false: "off"}[st.Proactive == ""]))
		} else if cv.Look != nil && cv.Look.Watching && w.Watch && k != "other" {
			notes = append(notes, a.L.T("card.budget", cv.Look.BudgetPct))
		}
		if w.LastReadAt != "" {
			notes = append(notes, a.L.T("tile.last", a.ago(w.LastReadAt)))
		}
		for _, n := range notes { // D291: each fact its own line
			a.note(c, n)
		}
		if k == "calendar" {
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

// readsList is 看了哪些 / What it read, in place on the text column:
// today's reads, one line each, and the honest line.
func (a *App) readsList(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	reads := a.S.ConnReads[cv.ID]
	ui.Column(c.Key("readlist:" + cv.ID)).Gap(t.S1).Children(func() {
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
			acct := ""
			if r.Account != "" && len(sibs) > 1 {
				acct = shortAccount(r.Account, sibs) // D291: the account its own muted element
			}
			ui.Row(c.Key("read:" + itoa(int64(i)))).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
				ui.Text(c, clockOf(r.At)).FontSize(t.SM).TextColor(t.InkMuted).Width(44).Shrink(0)
				ui.Text(c, a.L.T("read."+r.What, app, r.Items)).FontSize(t.SM).TextColor(t.Ink).Grow(1).MinWidth(0).SingleLine()
				if acct != "" {
					ui.Text(c, acct).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Shrink(0)
				}
			})
		}
		ui.Text(c, a.L.T("acct.honest")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5)).Padding(t.S1, 0, 0, 0)
	})
}

// connActions is the source's last line (D192, D289): where what it reads
// passes on the text column, then 看了哪些 and the stop at the right edge,
// both quiet; the stop asks in place, on the same line.
func (a *App) connActions(c *ui.Context, cv protocol.ConnectionView, name string) {
	cs := a.cards()
	if cs.stopping == cv.ID {
		keep, stop := a.confirmRow(c, "stop:"+cv.ID, a.L.T("card.stop.ask"), a.L.T("card.stop.keep"), a.L.T("card.stop.go"), name)
		if keep {
			cs.stopping = ""
		}
		if stop {
			cs.stopping = ""
			a.send(protocol.ConnectionRemove{T: "connection_remove", ID: cv.ID})
		}
		return
	}
	a.footRow(c, "conn:"+cv.ID, a.connLine(cv), func() {
		open := cs.reads == cv.ID
		if a.quietButton(c, "reads:"+cv.ID, a.L.T("card.read_list"), name, false, map[bool]int{true: 2, false: 1}[open]) {
			if open {
				cs.reads = ""
			} else {
				cs.reads = cv.ID
				a.send(protocol.ConnectionReadsReq{T: "connection_reads", ID: cv.ID})
			}
		}
		if a.quietDanger(c, "stop:"+cv.ID, a.L.T("card.stop", name), "") {
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
