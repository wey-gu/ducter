package views

import (
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Calendars (D221, design/calendar.md §6): a day drawn literally, as a
// calendar app would. The day card under a partner message (a quiet column
// of time; each calendar's own colour only as a thin rail; now as a line),
// the change card under a calendar decision, the calendars an account
// reads in Settings › 账号, and the greeting's today line.

// calUI is what the calendar screens remember in this window. memo stands
// in for the app's local prefs when there are none (tests).
type calUI struct {
	memo map[string]string
}

// calMemo is a remembered one-time line's state ("" never seen).
func (a *App) calMemo(name string) (string, time.Time) {
	if a.Local != nil {
		ask := a.Local.Asked(name)
		at, _ := time.Parse(time.RFC3339, ask.At)
		return ask.Answer, at
	}
	return a.cal.memo[name], time.Time{}
}

func (a *App) setCalMemo(name, v string) {
	if a.Local != nil {
		a.Local.Answer(name, v, a.Now())
		return
	}
	if a.cal.memo == nil {
		a.cal.memo = map[string]string{}
	}
	a.cal.memo[name] = v
}

// ---------- time ----------

var calLocs = map[string]*time.Location{}

// calLoc is a zone by its IANA name; the Mac's own when unknown.
func calLoc(zone string) *time.Location {
	if zone == "" {
		return time.Local
	}
	if l, ok := calLocs[zone]; ok {
		return l
	}
	l, err := time.LoadLocation(zone)
	if err != nil {
		l = time.Local
	}
	calLocs[zone] = l
	return l
}

// calTime reads an event's time in loc: an ISO moment, or a date.
func calTime(s string, loc *time.Location) time.Time {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.In(loc)
	}
	if t, err := time.ParseInLocation("2006-01-02", s, loc); err == nil {
		return t
	}
	return time.Time{}
}

func sameDay(a, b time.Time) bool {
	return a.Year() == b.Year() && a.YearDay() == b.YearDay()
}

// calRel is 今天 / 明天 / 昨天 for a date, else "".
func (a *App) calRel(at, now time.Time) string {
	d := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, time.UTC).Sub(time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC))
	switch int(d.Hours() / 24) {
	case 0:
		return a.L.T("cal.today")
	case 1:
		return a.L.T("cal.tomorrow")
	case -1:
		return a.L.T("cal.yesterday")
	}
	return ""
}

// calDayHead is a day's head: 今天 · 11 月 18 日 周三 / Today · Wed, Nov 18.
func (a *App) calDayHead(at, now time.Time) string {
	d := i18n.CalDate(a.L.Lang, at, now)
	if r := a.calRel(at, now); r != "" {
		return r + " · " + d
	}
	return d
}

// calDateTight is a date as a sentence carries it: "Thu Nov 19" (no
// comma after the weekday) / "11 月 19 日 周四".
func (a *App) calDateTight(at, now time.Time) string {
	return strings.Replace(i18n.CalDate(a.L.Lang, at, now), ",", "", 1)
}

// calWhen is a change's time: 明天 11 月 19 日 周四 15:00–15:30 /
// Tomorrow, Thu Nov 19, 15:00–15:30.
func (a *App) calWhen(startS, endS string, allDay bool, loc *time.Location) string {
	now := a.Now().In(loc)
	s, e := calTime(startS, loc), calTime(endS, loc)
	date := a.calDateTight(s, now)
	if r := a.calRel(s, now); r != "" {
		if a.L.Lang == i18n.ZH {
			date = r + " " + date
		} else {
			date = r + ", " + date
		}
	}
	sep := " "
	if a.L.Lang != i18n.ZH {
		sep = ", "
	}
	if allDay {
		return date + sep + a.L.T("cal.allday")
	}
	span := i18n.CalClock(s) + "–" + i18n.CalClock(e)
	if !e.IsZero() && !sameDay(s, e) {
		span = i18n.CalClock(s) + " – " + a.calDateTight(e, now) + " " + i18n.CalClock(e)
	}
	return date + sep + span
}

// calNames joins names the reader's way: Lina Chen、alice / Lina Chen and alice.
func (a *App) calNames(names []string) string {
	if a.L.Lang == i18n.ZH || len(names) < 2 {
		return strings.Join(names, a.L.T("cal.names.sep"))
	}
	return strings.Join(names[:len(names)-1], ", ") + " and " + names[len(names)-1]
}

// ---------- the day card (§6.1) ----------

// calAccounts are the accounts a glance read, for each row's short form.
func calAccounts(g *protocol.CalGlance) []string {
	seen := map[string]bool{}
	var out []string
	for _, d := range g.Days {
		for _, e := range d.Events {
			if e.Account != "" && !seen[e.Account] {
				seen[e.Account] = true
				out = append(out, e.Account)
			}
		}
	}
	return out
}

// calColor is a calendar's own colour, a data colour drawn only as a rail
// or a dot; none: the soft line.
func (a *App) calColor(hex string) ui.Color {
	if len(hex) == 7 && hex[0] == '#' {
		return ui.Hex(hex)
	}
	return a.T.Faint
}

// calTimeW is the time column: 全天 or 10:30 in zh, "All day" in en.
func (a *App) calTimeW() float32 {
	if a.L.Lang == i18n.ZH {
		return 40
	}
	return 50
}

// dayCard is the glance under a partner message: one card, a head per day,
// the day's rows; a week collapses each run of empty days to one line.
func (a *App) dayCard(c *ui.Context, key string, g *protocol.CalGlance) {
	t := a.T
	loc := calLoc(g.Zone)
	now := a.Now().In(loc)
	clash := map[string][]string{}
	titles := map[string]string{}
	for _, d := range g.Days {
		for _, e := range d.Events {
			titles[e.Ref] = e.Title
		}
	}
	for _, p := range g.Clashes {
		clash[p[0]] = append(clash[p[0]], p[1])
		clash[p[1]] = append(clash[p[1]], p[0])
	}
	accts := calAccounts(g)
	card := ui.Column(c.Key("calcard:"+key)).MaxWidth(560).MaxWidthPercent(84).Padding(t.S4).Gap(t.S3).Radius(t.RadiusMD).
		Background(t.Surface).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleGroup).Label(a.calDayHead(calTime(g.From, loc), now))
	card.Children(func() {
		for i := 0; i < len(g.Days); i++ {
			d := g.Days[i]
			at := calTime(d.Date, loc)
			if len(d.Events) == 0 && len(d.Marks) == 0 && len(g.Days) > 1 {
				// A run of empty days is one quiet line.
				j := i
				for j+1 < len(g.Days) && len(g.Days[j+1].Events) == 0 && len(g.Days[j+1].Marks) == 0 {
					j++
				}
				words := a.calDayHead(at, now)
				if j > i {
					words = i18n.CalRange(a.L.Lang, at, calTime(g.Days[j].Date, loc))
				}
				if i > 0 {
					ui.Box(c).Height(1).Background(t.LineSoft)
				}
				ui.Row(c.Key("calempty:" + d.Date)).Gap(t.S2).Wrap().AlignItems(ui.Baseline).Children(func() {
					ui.Text(c, words).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
					ui.Text(c, a.L.T("cal.nothing")).FontSize(t.SM).TextColor(t.InkMuted)
				})
				i = j
				continue
			}
			if i > 0 {
				ui.Box(c).Height(1).Background(t.LineSoft)
			}
			a.calDay(c, d, loc, now, clash, titles, accts, g.Accounts)
		}
	})
	a.enter(c, card)
}

// calDay is one day: its head, its marks, then the rows (all-day first);
// today carries the now line between the rows.
func (a *App) calDay(c *ui.Context, d protocol.CalDay, loc *time.Location, now time.Time, clash map[string][]string, titles map[string]string, accts []string, accounts int) {
	t := a.T
	at := calTime(d.Date, loc)
	evs := append([]protocol.CalEvent(nil), d.Events...)
	sort.SliceStable(evs, func(i, j int) bool { return evs[i].AllDay && !evs[j].AllDay })
	today := sameDay(at, now)
	nowAt := -1
	if today {
		nowAt = len(evs)
		for i, e := range evs {
			if !e.AllDay && calTime(e.Start, loc).After(now) {
				nowAt = i
				break
			}
		}
		if nowAt == len(evs) && len(evs) > 0 && evs[len(evs)-1].AllDay {
			nowAt = -1 // only all-day things: no time to mark
		}
	}
	anyClash := false
	for _, e := range evs {
		if len(clash[e.Ref]) > 0 {
			anyClash = true
		}
	}
	ui.Column(c.Key("calday:" + d.Date)).Gap(0).Children(func() {
		ui.Column(c).Gap(2).Padding(0, 0, t.S2, 0).Children(func() {
			ui.Text(c, a.calDayHead(at, now)).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink)
			if len(d.Marks) > 0 {
				ui.Text(c, strings.Join(d.Marks, " · ")).FontSize(t.XS).TextColor(t.InkMuted)
			}
		})
		if len(evs) == 0 {
			ui.Text(c, a.L.T("cal.nothing")).FontSize(t.SM).TextColor(t.InkMuted)
		}
		for i, e := range evs {
			up := i > 0 && calIn(clash[e.Ref], evs[i-1].Ref)
			down := i+1 < len(evs) && calIn(clash[e.Ref], evs[i+1].Ref)
			if i == nowAt {
				a.calNowLine(c, anyClash, up) // the bracket runs on through it
			}
			a.calRow(c, e, loc, now, clash[e.Ref], titles, accts, accounts, anyClash, up, down)
		}
		if nowAt == len(evs) && len(evs) > 0 {
			a.calNowLine(c, anyClash, false)
		}
	})
}

func calIn(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// calLead is the room left of the time column for the clash bracket.
const calLead = 8

// calNowLine is now: a 1.5-point accent line with a 6-point dot on the
// rail's line, across the rows.
func (a *App) calNowLine(c *ui.Context, lead, bracket bool) {
	t := a.T
	x := a.calTimeW() + t.S3 + 1.5
	if lead {
		x += calLead
	}
	ui.Box(c.Key("calnow")).Height(8).Label(a.L.T("cal.now")).Draw(func(p *ui.Painter, r ui.Rect) {
		cy := r.Y + r.H/2
		if bracket {
			p.Fill(ui.Rect{X: r.X - t.S2 + 3, Y: r.Y, W: 1.5, H: r.H}, t.Failed.Dot, 0)
		}
		p.Fill(ui.Rect{X: r.X + x - 3, Y: cy - 3, W: 6, H: 6}, t.Accent, 3)
		p.Fill(ui.Rect{X: r.X + x, Y: cy - 0.75, W: r.W - x, H: 1.5}, t.Accent, 0.75)
	})
}

// calChip is a small state chip on a row.
func (a *App) calChip(c *ui.Context, text string, bg, ink ui.Color) {
	t := a.T
	ui.Row(c).Height(20).Padding(0, t.S2).Radius(t.Pill).Background(bg).AlignItems(ui.Center).Shrink(0).Children(func() {
		ui.Text(c, text).FontSize(t.XS - 1).FontWeight(700).TextColor(ink).SingleLine()
	})
}

// calMeta is a row's one meta line, and its words for a screen reader.
func (a *App) calMeta(e protocol.CalEvent, loc *time.Location, accts []string, accounts int) []string {
	var parts []string
	if accounts > 1 && e.Account != "" {
		parts = append(parts, shortAccount(e.Account, accts))
	}
	switch {
	case len(e.With) > 0 && e.People > len(e.With):
		parts = append(parts, a.L.T("cal.with.more", strings.Join(e.With, a.L.T("cal.names.sep")), e.People, e.People-len(e.With)))
	case len(e.With) > 0:
		parts = append(parts, a.L.T("cal.with", strings.Join(e.With, a.L.T("cal.names.sep"))))
	case e.People > 0:
		parts = append(parts, a.L.T("cal.with.n", e.People))
	}
	switch {
	case e.Where != "":
		parts = append(parts, e.Where)
	case e.Online:
		parts = append(parts, a.L.T("cal.online"))
	}
	if e.Free {
		parts = append(parts, a.L.T("cal.free"))
	}
	if e.Me == "tentative" {
		parts = append(parts, a.L.T("cal.maybe"))
	}
	if e.Zone != "" && !e.AllDay {
		if zl := calLoc(e.Zone); zl != loc {
			s := calTime(e.Start, zl)
			when := i18n.CalMD(a.L.Lang, s) + " " + i18n.CalClock(s)
			if a.L.Lang != i18n.ZH {
				when = i18n.CalClock(s) + " " + i18n.CalMD(a.L.Lang, s)
			}
			parts = append(parts, a.L.T("cal.local", when, a.L.ZoneCity(e.Zone)))
		}
	}
	return parts
}

// calRow is one event: the time, the calendar's rail, the title with its
// chips, one meta line. Past rows fade; a tap opens the event.
func (a *App) calRow(c *ui.Context, e protocol.CalEvent, loc *time.Location, now time.Time, clashes []string, titles map[string]string, accts []string, accounts int, lead, up, down bool) {
	t := a.T
	s, en := calTime(e.Start, loc), calTime(e.End, loc)
	past := (!e.AllDay && !en.IsZero() && !en.After(now)) || (e.AllDay && !s.IsZero() && s.Before(now) && !sameDay(s, now) && en.Before(now))
	meta := a.calMeta(e, loc, accts, accounts)
	unanswered := e.Me == "needsAction" && !e.Mine
	// Its accessible name says it all (§6.1).
	var name []string
	if e.AllDay {
		name = append(name, a.L.T("cal.allday"))
	} else {
		name = append(name, a.L.T("cal.a11y.span", i18n.CalClock(s), i18n.CalClock(en)))
	}
	name = append(name, e.Title)
	name = append(name, meta...)
	if unanswered {
		name = append(name, a.L.T("cal.unanswered"))
	}
	for _, r := range clashes {
		name = append(name, a.L.T("cal.a11y.overlaps", titles[r]))
	}
	left := float32(t.S2)
	if lead {
		left += calLead
	}
	row := ui.Row(c.Key("calrow:"+e.Ref+e.Start)).Gap(t.S3).AlignItems(ui.Stretch).Padding(t.S2, t.S2, t.S2, left).MarginX(-t.S2).
		Radius(t.RadiusSM).Role(ui.RoleLink).Label(strings.Join(name, a.L.T("cal.a11y.sep"))).Focusable()
	if e.Link != "" {
		row.Cursor(ui.CursorPointer)
		if row.Hovered() || row.Pressed() {
			row.Background(t.Sunken)
		}
	}
	if past {
		row.Opacity(0.55)
	}
	if len(clashes) > 0 {
		// A thin bracket in the failed dot joins rows that overlap.
		col := t.Failed.Dot
		row.DrawOver(func(p *ui.Painter, r ui.Rect) {
			x := r.X + 3
			mid := r.Y + t.S2 + 9
			top, bot := r.Y, r.Y+r.H
			if !up {
				top = mid
				p.Fill(ui.Rect{X: x, Y: mid - 0.75, W: 5, H: 1.5}, col, 0.75)
			}
			if !down {
				bot = mid
				if up {
					p.Fill(ui.Rect{X: x, Y: mid - 0.75, W: 5, H: 1.5}, col, 0.75)
				}
			}
			if bot > top {
				p.Fill(ui.Rect{X: x, Y: top, W: 1.5, H: bot - top}, col, 0.75)
			}
		})
	}
	row.Children(func() {
		ui.Column(c).Width(a.calTimeW()).Shrink(0).Gap(1).AccessHidden(true).Children(func() {
			if e.AllDay {
				ui.Text(c, a.L.T("cal.allday")).FontSize(t.SM).TextColor(t.InkSoft).SingleLine()
				return
			}
			ui.Text(c, i18n.CalClock(s)).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum").SingleLine()
			ui.Text(c, i18n.CalClock(en)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
		})
		ui.Box(c).Width(3).Radius(1.5).Background(a.calColor(e.Color)).Shrink(0).AccessHidden(true)
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
				ink := t.Ink
				if e.Free {
					ink = t.InkSoft
				}
				ui.Text(c, autospace(e.Title)).FontSize(t.MD).FontWeight(600).TextColor(ink).SingleLine().MinWidth(0).Shrink(1)
				if unanswered {
					a.calChip(c, a.L.T("cal.unanswered"), t.Waiting.Surface, t.Waiting.Ink)
				}
				if len(clashes) > 0 {
					a.calChip(c, a.L.T("cal.overlaps"), t.Failed.Surface, t.Failed.Ink)
				}
			})
			if len(meta) > 0 {
				line := autospace(strings.Join(meta, " · "))
				ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0)
			}
		})
	})
	if e.Link != "" && row.Clicked() {
		a.openLink(e.Link)
	}
}

// ---------- the change card (§6.2) ----------

// calKindKey is the word set a change takes: an answer by its answer.
func calKindKey(ch *protocol.CalChange) string {
	if ch.Kind == "respond" && ch.Response != "" {
		return ch.Response
	}
	return ch.Kind
}

// calChangeBlock is what will change, where, when, and who hears, in one
// sunken block under the question.
func (a *App) calChangeBlock(c *ui.Context, d *store.DecisionState) {
	t := a.T
	ch := d.Cal
	loc := time.Local
	now := a.Now().In(loc)
	indent := 3 + t.S3
	line := func(text string, ink ui.Color) {
		ui.Text(c, autospace(text)).FontSize(t.SM).TextColor(ink).LineHeight(a.leading(1.45)).MarginStart(indent)
	}
	ui.Column(c.Key("calchange:"+d.DecisionID)).MaxWidth(t.BubbleMeasure).MaxWidthPercent(84).Gap(t.S1+2).Padding(t.S3, t.S4).
		Radius(t.RadiusSM).Background(t.Sunken).Children(func() {
		// 1. the rail in the calendar's colour, and the title.
		ui.Row(c).Gap(t.S3).AlignItems(ui.Stretch).Children(func() {
			ui.Box(c).Width(3).Radius(1.5).Background(a.calColor(ch.Color)).Shrink(0)
			ui.Text(c, autospace(ch.Title)).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).LineHeight(a.leading(1.4)).Grow(1).MinWidth(0)
		})
		// 2. when; a move shows where it was, struck through, and an arrow.
		when := a.calWhen(ch.Start, ch.End, ch.AllDay, loc)
		if ch.Kind == "move" && ch.Was != nil {
			ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).MarginStart(indent).Children(func() {
				ui.Text(c, a.L.T("cal.change.was")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				was := a.calWhen(ch.Was.Start, ch.Was.End, ch.AllDay, loc)
				if ws, ns := calTime(ch.Was.Start, loc), calTime(ch.Start, loc); !ch.AllDay && sameDay(ws, ns) {
					was = i18n.CalClock(ws) + "–" + i18n.CalClock(calTime(ch.Was.End, loc)) // the same day: the time is what moved
				}
				ui.Text(c, autospace(was)).FontSize(t.SM).TextColor(t.InkMuted).Strikethrough().FontFeatures("tnum")
				a.glyph(c, 16, drawArrow(t.InkSoft))
				ui.Text(c, autospace(when)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).FontFeatures("tnum")
			})
		} else {
			ui.Text(c, autospace(when)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).FontFeatures("tnum").MarginStart(indent)
		}
		// 3. the other side, when their zone differs.
		if ch.TheirZone != "" && !ch.AllDay {
			if zl := calLoc(ch.TheirZone); zl.String() != loc.String() {
				s := calTime(ch.Start, zl)
				at := a.calDateTight(s, now) + " " + i18n.CalClock(s)
				if a.L.Lang != i18n.ZH {
					at = i18n.CalClock(s) + " " + a.calDateTight(s, now)
				}
				city := a.L.ZoneCity(ch.TheirZone)
				if ch.TheirName != "" {
					line(a.L.T("cal.change.their", ch.TheirName, at, city), t.InkSoft)
				} else {
					line(a.L.T("cal.change.their.anon", at, city), t.InkSoft)
				}
			}
		}
		// 4. which calendar, whose.
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).MarginStart(indent).Wrap().Children(func() {
			label := a.L.T("cal.change.in")
			if ch.Kind == "create" {
				label = a.L.T("cal.change.in.create")
			}
			ui.Text(c, label).FontSize(t.SM).TextColor(t.InkMuted)
			ui.Box(c).Size(8, 8).Radius(4).Background(a.calColor(ch.Color)).Shrink(0)
			cal := ch.Calendar
			if cal == "" {
				cal = a.L.T("cal.main")
			}
			if ch.Account != "" {
				cal += " · " + mailShort(ch.Account)
			}
			ui.Text(c, autospace(cal)).FontSize(t.SM).TextColor(t.Ink)
		})
		// 5. who hears.
		line(a.calWhoHears(ch), t.InkSoft)
		// 6. a clash, in the failed ink.
		if ch.Clash != "" {
			line(a.L.T("cal.change.clash", ch.Clash), t.Failed.Ink)
		}
		// 7. a video link when asked.
		if ch.Kind == "create" && ch.Online {
			line(a.L.T("cal.change.video"), t.InkSoft)
		}
	})
}

// calWhoHears says who gets an email from the calendar about it.
func (a *App) calWhoHears(ch *protocol.CalChange) string {
	if ch.Kind == "respond" && ch.Organizer != "" {
		return a.L.T("cal.change.organizer", ch.Organizer)
	}
	if len(ch.Notify) == 0 {
		return a.L.T("cal.change.nobody")
	}
	key := "cal.change.told"
	if ch.Kind == "create" {
		key = "cal.change.invite"
	}
	if len(ch.Notify) > 1 {
		key += ".many"
	}
	return a.L.T(key, a.calNames(ch.Notify))
}

// calHold is Hold's words on a calendar change: never 取消 for a cancel.
func (a *App) calHold(ch *protocol.CalChange) string {
	switch ch.Kind {
	case "create", "move", "cancel", "respond":
		return a.L.T("cal.hold." + ch.Kind)
	}
	return a.L.T("decision.hold")
}

// calGo is Go's words: the action itself.
func (a *App) calGo(d *store.DecisionState) string {
	switch k := calKindKey(d.Cal); k {
	case "create", "move", "cancel", "accepted", "declined", "tentative":
		return a.L.T("cal.go." + k)
	}
	return firstNonEmpty(d.GoLabel, a.L.T("decision.go"))
}

// calSettled is the card settled in place after Go or Hold: from the run's
// own record (the connection_call with this decision id).
func (a *App) calSettled(c *ui.Context, d *store.DecisionState) {
	t := a.T
	opt := d.Pending
	if d.Resolved != nil {
		opt = d.Resolved.Option
	}
	if opt == "reply" {
		a.answeredLine(c, d)
		return
	}
	kind := d.Cal.Kind
	text, ink, draw := "", t.InkMuted, func(ui.Color) func(*ui.Painter, ui.Rect) { return nil }
	var link, why string
	call := a.S.DecisionCalls[d.DecisionID]
	switch {
	case opt == "hold" || (call != nil && call.State == "held"):
		text, draw = a.L.T("cal.held"), drawCheck
	case call != nil && call.State == "done":
		text, ink, draw, link = a.L.T("cal.done."+calKindKey(d.Cal)), t.Done.Ink, drawCheck, call.Link
	case call != nil && (call.State == "failed" || call.State == "denied"):
		text, ink, draw, why = a.L.T("cal.failed."+kind), t.Failed.Ink, drawCross, call.Error
	default:
		text = a.L.T("cal.doing." + kind)
		c.After(time.Second)
	}
	ui.Column(c.Key("calsettled:"+d.DecisionID)).Gap(t.S1).Padding(0, 0, 0, t.S4-2).MaxWidth(t.BubbleMeasure).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
			if g := draw(ink); g != nil {
				a.glyph(c, 16, g)
			}
			ui.Text(c, text).FontSize(t.SM).FontWeight(700).TextColor(ink)
			if link != "" {
				if a.quietLink(c, "calopen:"+d.DecisionID, a.L.T("cal.open"), a.L.T("cal.open")+" · "+d.Cal.Title) {
					a.openLink(link)
				}
			}
		})
		if why != "" {
			ui.Text(c, why).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(a.leading(1.45)).MaxLines(2)
		}
	})
}

// ---------- Settings › 账号 (§4) ----------

// calendarsBand is 看哪些日历 / Calendars it reads: each calendar in the
// account with its dot, its name, a note for its kind, and a switch.
func (a *App) calendarsBand(c *ui.Context, cv protocol.ConnectionView, w protocol.AppWatch) {
	t := a.T
	ui.Column(c.Key("cals:" + cv.ID + "|" + tileKey(w))).Gap(t.S2).Children(func() {
		ui.Text(c, a.L.T("cal.list.label")).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
		if w.Calendars == nil {
			ui.Text(c, a.L.T("cal.list.loading")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		for _, r := range w.Calendars {
			name := r.Name
			if r.Kind == "main" || name == "" {
				name = a.L.T("cal.main")
			}
			note := ""
			switch r.Kind {
			case "holidays", "birthdays", "shared":
				note = a.L.T("cal.kind." + r.Kind)
			}
			ui.Row(c.Key("cal:" + r.ID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ui.Box(c).Size(8, 8).Radius(4).Background(a.calColor(r.Color)).Shrink(0).AccessHidden(true)
				ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
					ui.Text(c, autospace(name)).FontSize(t.MD).TextColor(t.Ink).SingleLine()
					if note != "" {
						ui.Text(c, note).FontSize(t.XS).TextColor(t.InkMuted)
					}
				})
				v := r.Seen
				if a.switchControl(c, "calseen:"+cv.ID+"|"+tileKey(w)+"|"+r.ID, name, &v) {
					a.send(protocol.CalPick{T: "cal_pick", ID: cv.ID, Service: w.Service, Account: w.Account, CalendarID: r.ID, Seen: v})
					a.markCalSeen(cv.ID, w, r.ID, v)
				}
			})
		}
	})
}

// markCalSeen flips a calendar's switch here at once; the next connections
// frame says what core did.
func (a *App) markCalSeen(connID string, w protocol.AppWatch, calID string, seen bool) {
	for i := range a.S.Connections {
		cv := &a.S.Connections[i]
		if cv.ID != connID || cv.Look == nil {
			continue
		}
		for j := range cv.Look.Apps {
			ap := &cv.Look.Apps[j]
			if ap.Service != w.Service || ap.Account != w.Account {
				continue
			}
			for k := range ap.Calendars {
				if ap.Calendars[k].ID == calID {
					ap.Calendars[k].Seen = seen
				}
			}
		}
	}
}

// calFirstLine is the first time (zero setup): one line under the tray
// while a calendar tile is new to this client, with 试试 / Try it.
func (a *App) calFirstLine(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	cs := a.cards()
	var name string
	opened := false
	for _, w := range tilesOf(cv) {
		if kindOf(w.Service) == "calendar" && cs.tile[cv.ID] == tileKey(w) {
			opened = true // opening a calendar tile retires the line
		}
	}
	for _, w := range tilesOf(cv) {
		if kindOf(w.Service) != "calendar" || w.Excluded {
			continue
		}
		n := "cal.first:" + cv.ID + "|" + tileKey(w)
		st, at := a.calMemo(n)
		if opened {
			if st != "done" {
				a.setCalMemo(n, "done")
			}
			continue
		}
		switch {
		case st == "":
			a.setCalMemo(n, "seen")
		case st == "seen" && (at.IsZero() || a.Now().Sub(at) < 7*24*time.Hour):
		default:
			continue
		}
		if name == "" {
			name = n
		}
	}
	if name == "" {
		return
	}
	ui.Row(c.Key("calfirst:"+cv.ID)).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceRaised).Children(func() {
		a.glyph(c, 18, drawCalendar(t.InkSoft))
		ui.Text(c, a.L.T("cal.first")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).Grow(1).Basis(0).MinWidth(0)
		if a.buttonFor(c, a.L.T("cal.first.try"), a.L.T("tile.calendar"), btnText, t.ControlSM, t.SurfaceRaised) {
			for _, w := range tilesOf(cv) {
				if kindOf(w.Service) == "calendar" {
					a.setCalMemo("cal.first:"+cv.ID+"|"+tileKey(w), "done")
				}
			}
			a.Route = RouteConversation
			a.draft = a.L.T("cal.first.prefill")
			a.focusComposer = true
		}
	})
}

// calNudge is Gmail without a calendar: one line under the tray of an oo
// or OOMOL card, with the way to add it, and 以后再说 kept per client.
func (a *App) calNudge(c *ui.Context, cv protocol.ConnectionView) {
	t := a.T
	if cv.Source != "oo" && cv.Source != "oomol" || sourceDown(cv) {
		return
	}
	mail, cal := false, false
	for _, w := range tilesOf(cv) {
		switch {
		case w.Service == "gmail":
			mail = true
		case kindOf(w.Service) == "calendar":
			cal = true
		}
	}
	n := "cal.nudge:" + cv.ID
	if !mail || cal {
		return
	}
	if st, _ := a.calMemo(n); st != "" {
		return
	}
	ui.Column(c.Key("calnudge:"+cv.ID)).Gap(t.S1).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceRaised).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 18, drawCalendar(t.InkSoft))
			ui.Text(c, a.L.T("cal.nudge")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).Grow(1).Basis(0).MinWidth(0)
		})
		ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Justify(ui.End).Children(func() {
			if a.button(c, a.L.T("cal.nudge.later"), btnText, t.ControlSM, t.SurfaceRaised) {
				a.setCalMemo(n, "later")
			}
			if a.button(c, a.L.T("cal.nudge.add."+cv.Source), btnSecondary, t.ControlSM, t.SurfaceRaised) {
				a.openLink(oomolAccounts)
			}
		})
	})
}

// ---------- the greeting (§6.3) ----------

// calTodayLine is what is still on today, one quiet row under the
// greeting's line; a tap fills the composer.
func (a *App) calTodayLine(c *ui.Context, td *protocol.CalToday) {
	t := a.T
	if td == nil || td.Left <= 0 {
		return
	}
	text := a.L.T("cal.today.left.nonext", td.Left)
	if td.Next != nil {
		at := calTime(td.Next.Start, time.Local)
		text = a.L.T("cal.today.left", td.Left, i18n.CalClock(at), td.Next.Title)
	}
	if td.Clash {
		text += a.L.T("cal.today.clash")
	}
	text = autospace(text)
	row := ui.Row(c.Key("caltoday")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S3).Radius(t.Pill).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Label(text).Focusable()
	if row.Hovered() || row.Pressed() {
		row.Background(t.Ink.Alpha(0.05))
	}
	row.Children(func() {
		a.glyph(c, 16, drawCalendar(t.InkMuted))
		ui.Text(c, text).FontSize(t.MD).TextColor(t.InkSoft).AccessHidden(true)
	})
	if row.Clicked() {
		a.draft = a.L.T("cal.today.prefill")
		a.focusComposer = true
	}
}

// drawCalendar is a small calendar page: two rings, a head bar, the page.
func drawCalendar(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		s := r.W / 16
		l, rt, top, bot := cx-6*s, cx+6*s, cy-4.5*s, cy+6*s
		var m ui.Path
		m.MoveTo(l+2*s, top)
		m.LineTo(rt-2*s, top)
		m.QuadTo(rt, top, rt, top+2*s)
		m.LineTo(rt, bot-2*s)
		m.QuadTo(rt, bot, rt-2*s, bot)
		m.LineTo(l+2*s, bot)
		m.QuadTo(l, bot, l, bot-2*s)
		m.LineTo(l, top+2*s)
		m.QuadTo(l, top, l+2*s, top)
		m.Close()
		m.MoveTo(l, top+3.5*s)
		m.LineTo(rt, top+3.5*s)
		m.MoveTo(cx-3*s, top-2*s)
		m.LineTo(cx-3*s, top+1.5*s)
		m.MoveTo(cx+3*s, top-2*s)
		m.LineTo(cx+3*s, top+1.5*s)
		p.StrokePath(&m, 1.6*s, col)
		p.Fill(ui.Rect{X: cx - 3.5*s, Y: cy + 1.5*s, W: 2.4 * s, H: 2.4 * s}, col, 0.6*s)
	}
}
