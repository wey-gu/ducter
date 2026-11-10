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
	stopping string            // the connection whose stop asks in place
}

func (a *App) cards() *acctCards {
	ps := &a.partner
	if ps.cards.tile == nil {
		ps.cards.tile = map[string]string{}
	}
	return &ps.cards
}

// proactiveChips is 自己发现了事，怎么告诉你 (D165 §5): one row, single
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
			ui.Text(c, a.L.T("proactive.title")).FontSize(t.MD).FontWeight(800)
		}
		if i := a.choices(c, "proactive-"+key, a.L.T("proactive.title"), labels, sel); i >= 0 {
			st.Proactive = modes[i]
			a.SetSettings(protocol.SettingsPatch{Proactive: modes[i]})
		}
		note := "proactive.note.never"
		if sel >= 0 {
			note = "proactive.note." + modes[sel]
		}
		a.note(c, a.L.T(note))
	})
}

// sourceCards is the cards, two to a row when there is room.
func (a *App) sourceCards(c *ui.Context, list []protocol.ConnectionView) {
	t := a.T
	ui.Row(c.Key("acct-cards")).Wrap().Gap(t.S4).AlignItems(ui.Start).Children(func() {
		for _, cv := range list {
			a.sourceCard(c, cv)
		}
	})
}

func (a *App) sourceCard(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	cs := a.cards()
	name := connName(a, cv)
	card := ui.Column(c.Key("src:"+cv.ID)).Width(400).MinWidth(0).Grow(1).MaxWidth(520).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Padding(t.S5).Gap(t.S3).Role(ui.RoleGroup).Label(name)
	card.Children(func() {
		// Who: the mailbox on its oval, the name, one status line.
		ui.Column(c).AlignItems(ui.Center).Gap(t.S1).Children(func() {
			ui.Box(c.Key("mailbox:"+cv.ID)).Size(220, 128).Draw(a.drawMailboxHero(cv.Source, sourceDown(cv))).AccessHidden(true)
			ui.Text(c, name).FontSize(t.XL).FontWeight(800).SingleLine()
			line, ink := a.sourceStatus(cv)
			ui.Text(c, line).FontSize(t.SM).TextColor(ink).LineHeight(a.leading(1.45))
			// D158: connected, but nothing there to read yet: where to fix it.
			if cv.Source == "oomol" && cv.Apps != nil && len(cv.Apps) == 0 && !sourceDown(cv) {
				if a.quietLink(c, "acct-connect:"+cv.ID, a.L.T("acct.connect.oomol"), a.L.T("acct.connect.oomol")) {
					a.openLink(oomolAccounts)
				}
			}
		})
		// What it can read: the tray.
		a.appTray(c, cv)
		// Where it runs, with ⋯ for 看了哪些 and the honest line.
		ui.Row(c.Key("conn:" + cv.ID)).Gap(t.S2).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
			ui.Text(c, a.L.T("card.conn."+cv.Source)).FontSize(t.SM).TextColor(t.InkSoft).Shrink(1).MinWidth(0)
			if a.moreButton(c, "reads:"+cv.ID, a.L.T("card.read_list"), cs.reads == cv.ID) {
				if cs.reads == cv.ID {
					cs.reads = ""
				} else {
					cs.reads = cv.ID
					a.send(protocol.ConnectionReadsReq{T: "connection_reads", ID: cv.ID})
				}
			}
		})
		if cs.reads == cv.ID {
			a.readsList(c, cv)
		}
		ui.Box(c).Height(1).Background(t.LineSoft)
		a.stopRow(c, cv, name)
	})
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
	if l.WorthToday > 0 {
		return a.L.T("card.status.read", l.ReadToday, l.WorthToday), t.InkSoft
	}
	return a.L.T("card.status.calm", l.ReadToday), t.InkSoft
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

// tileWords is a tile's two lines: the app (日历 for any calendar) and
// the account's short form (the part before @, or the label).
func (a *App) tileWords(w protocol.AppWatch, siblings []string) (string, string) {
	many := len(siblings) > 1
	title := w.Title
	if strings.Contains(w.Service, "calendar") {
		title = a.L.T("tile.calendar")
	}
	sub := ""
	if many && w.Account != "" {
		sub = shortAccount(w.Account, siblings)
	}
	return title, sub
}

// shortAccount is an account's short form on its tile: the name before @,
// or, when two accounts share it (wey@work…, wey@home…), the first word of
// the domain.
func shortAccount(acc string, siblings []string) string {
	at := strings.Index(acc, "@")
	if at <= 0 {
		return acc
	}
	local := acc[:at]
	clash := 0
	for _, s := range siblings {
		if strings.HasPrefix(s, local+"@") {
			clash++
		}
	}
	if clash < 2 {
		return local
	}
	dom := acc[at+1:]
	if i := strings.Index(dom, "."); i > 0 {
		dom = dom[:i]
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
	ui.Row(c.Key("tray:" + cv.ID)).Wrap().Gap(t.S1).Justify(ui.Center).Padding(t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
		for _, w := range tiles {
			w := w
			label, sub := a.tileWords(w, accts[w.Service])
			k := tileKey(w)
			about := ""
			if w.Excluded {
				about = a.L.T("tile.excluded")
			}
			if a.appTile(c, cv.ID+"|"+k, label, sub, about, a.drawAppMark(w.Service), open == k, !w.Watch, w.Excluded || w.Unreachable || sourceDown(cv), false) {
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
// floating layer): what it reads, what asks first, last read, 自己留意
// (chat: only @-mentions and DMs), the month's budget, and at the foot,
// quiet, 不让 Ducter 看这个 (oo: 要退出登录，去 oo 里).
func (a *App) tileDetail(c *ui.Context, cv protocol.ConnectionView, w protocol.AppWatch) {
	t := a.T
	k := kindOf(w.Service)
	title, _ := a.tileWords(w, nil)
	ui.Column(c.Key("detail:"+cv.ID+"|"+tileKey(w))).Gap(t.S2).Padding(t.S4).Radius(t.RadiusMD).Border(1, t.LineSoft).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Baseline).Children(func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(800).Shrink(0)
			if w.Account != "" {
				ui.Text(c, w.Account).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
			}
		})
		ui.Text(c, a.L.T("tile.reads", a.L.T("tile.reads."+k))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
		ui.Text(c, a.L.T("tile.asks", a.L.T("tile.asks."+k))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
		last := a.L.T("tile.last.never")
		if w.LastReadAt != "" {
			last = a.L.T("tile.last", a.ago(w.LastReadAt))
		}
		ui.Text(c, last).FontSize(t.SM).TextColor(t.InkSoft)
		if !w.Excluded && k != "other" {
			label := a.L.T("tile.watch")
			note := ""
			if k == "chat" {
				note = a.L.T("tile.mentions")
			}
			if cv.Look != nil && cv.Look.Watching && w.Watch {
				if note != "" {
					note += " · "
				}
				note += a.L.T("card.budget", cv.Look.BudgetPct)
			}
			if v, changed := a.switchRow(c, "watch:"+cv.ID+"|"+tileKey(w), label, note, w.Watch); changed {
				a.send(protocol.AppWatchSet{T: "app_watch", ID: cv.ID, Service: w.Service, Account: w.Account, Watch: &v})
			}
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ex := a.L.T("tile.exclude")
			if w.Excluded {
				ex = a.L.T("tile.include")
			}
			if a.quietButton(c, "exclude:"+cv.ID+"|"+tileKey(w), ex, title, true, 0) {
				v := !w.Excluded
				a.send(protocol.AppWatchSet{T: "app_watch", ID: cv.ID, Service: w.Service, Account: w.Account, Excluded: &v})
			}
			ui.Box(c).Grow(1)
			if cv.Source == "oo" {
				ui.Text(c, a.L.T("tile.signout_oo")).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
			}
		})
	})
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
			for _, w := range tilesOf(cv) {
				if w.Service == r.Service {
					app, _ = a.tileWords(w, nil)
				}
			}
			if r.Account != "" && kindOf(r.Service) == "mail" {
				var sibs []string
				for _, w := range tilesOf(cv) {
					if w.Service == r.Service {
						sibs = append(sibs, w.Account)
					}
				}
				if len(sibs) > 1 {
					app += " · " + shortAccount(r.Account, sibs)
				}
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

// stopRow is the card's one destructive action, confirmed in place.
func (a *App) stopRow(c *ui.Context, cv protocol.ConnectionView, name string) {
	t := a.T
	cs := a.cards()
	if cs.stopping != cv.ID {
		ui.Row(c).Children(func() {
			if a.dangerText(c, "stop:"+cv.ID, a.L.T("card.stop", name), "") {
				cs.stopping = cv.ID
			}
		})
		return
	}
	ui.Column(c.Key("stop-ask:" + cv.ID)).Gap(t.S2).Children(func() {
		ui.Text(c, a.L.T("card.stop.ask")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
		ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
			if a.buttonFor(c, a.L.T("card.stop.keep"), name, btnText, t.ControlSM, t.Surface) {
				cs.stopping = ""
			}
			if a.dangerText(c, "stop-go:"+cv.ID, a.L.T("card.stop.go"), name) {
				cs.stopping = ""
				a.send(protocol.ConnectionRemove{T: "connection_remove", ID: cv.ID})
			}
		})
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
			col := hex("#5865F2")
			if strings.HasPrefix(service, "slack") {
				col = hex("#4A154B")
			}
			p.Fill(ui.Rect{X: cx - 13, Y: cy - 9, W: 26, H: 18}, col, 8)
			p.FillPath(oval(cx-4.5, cy, 2.4, 2.8), hex("#FFFFFF"))
			p.FillPath(oval(cx+4.5, cy, 2.4, 2.8), hex("#FFFFFF"))
		default:
			p.FillPath(oval(cx, cy, 10, 10), t.InkMuted.Alpha(0.6))
		}
	}
}
