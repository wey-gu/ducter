package views

// D300: 替你做过的 / Done for you (design/did.md). A whole-window place,
// like Past tasks: the title, one large field that searches as you type,
// one row of filters on a sunk track (the chosen one the knob, D270), then
// the days, newest first, each with its counts and its cards. A card is a
// drawn glyph for its kind on a clay pebble, the line in plain words, the
// thing's own words under it, and its facts, each its own element (D291):
// who asked, the Go, where, a count or an unsure ending; then Open the
// task, See it, and Undo only where one truly exists.

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const (
	// didDays is the range first shown; 更早的 / Earlier adds as many again.
	didDays = 7
	// didLimit is the most items one answer carries.
	didLimit = 300
	// didUndoWait is how long an Undo shows its spinner before the list is
	// asked again.
	didUndoWait = 1500 * time.Millisecond
)

type didState struct {
	// q is the field's words; typed and typedAt the last change seen, sent
	// the query asked last, reqN its count.
	q, typed string
	typedAt  time.Time
	sent     string
	asked    bool
	reqN     int
	// kind is the filter chosen ("" all); days how far back it looks.
	kind string
	days int
	// back is where Esc goes: the place it came from (a task's id with it).
	back     Route
	backTask string
	// focusField asks the big field for the keyboard.
	focusField bool
	// undoing is each item whose Undo was sent, and when.
	undoing map[string]time.Time
}

// ---------- ways in ----------

// OpenDid shows 替你做过的 / Done for you. Esc comes back to where it was
// opened from.
func (a *App) OpenDid() {
	ds := &a.did
	if a.Route != RouteDid {
		ds.back, ds.backTask = a.Route, a.TaskID
	}
	a.Route = RouteDid
	ds.q, ds.typed, ds.kind, ds.days = "", "", "", didDays
	ds.focusField = true
	a.askDid()
}

// didBack goes back to where it was opened from.
func (a *App) didBack() {
	ds := &a.did
	switch ds.back {
	case RouteTask:
		if ds.backTask != "" && a.S.Task(ds.backTask) != nil {
			a.OpenTask(ds.backTask)
			return
		}
		a.Route = RouteOnHand
	case RouteDid:
		a.Route = RouteOnHand
	default:
		a.Route = ds.back
	}
}

// didEsc is Esc here: the words clear, then the filter, then it goes back.
func (a *App) didEsc() {
	ds := &a.did
	switch {
	case ds.q != "":
		ds.q = ""
	case ds.kind != "":
		ds.kind = ""
	default:
		a.didBack()
	}
}

// didQuery is what the place asks for: from the start of the day days-1
// ago, its kind and its words.
func (a *App) didQuery() protocol.DidQuery {
	ds := &a.did
	days := max(ds.days, 1)
	since := didDay0(a.Now()).AddDate(0, 0, -(days - 1))
	q := protocol.DidQuery{Since: since.UTC().Format(time.RFC3339), Q: strings.TrimSpace(ds.q), Limit: didLimit}
	if ds.kind != "" {
		q.Kinds = []string{ds.kind}
	}
	return q
}

func didDay0(now time.Time) time.Time {
	now = now.Local()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

func didKey(q protocol.DidQuery, days int) string {
	return fmt.Sprint(q.Q, "\x00", strings.Join(q.Kinds, ","), days)
}

// askDid sends the query now.
func (a *App) askDid() {
	ds := &a.did
	q := a.didQuery()
	ds.reqN++
	ds.sent, ds.asked = didKey(q, ds.days), true
	a.send(protocol.DidReq{T: "did", ID: fmt.Sprintf("did%d", ds.reqN), Query: q})
}

// didAsk sends the query once the words rest for pastDebounce, and at once
// for a filter or a longer range.
func (a *App) didAsk(c *ui.Context) {
	ds := &a.did
	now := c.Now()
	if ds.q != ds.typed {
		ds.typed, ds.typedAt = ds.q, now
	}
	key := didKey(a.didQuery(), ds.days)
	if ds.asked && key == ds.sent {
		return
	}
	i, j := strings.Index(key, "\x00"), strings.Index(ds.sent, "\x00")
	onlyWords := ds.asked && i >= 0 && j >= 0 && key[i:] == ds.sent[j:]
	if !onlyWords {
		a.askDid()
		return
	}
	if left := pastDebounce - now.Sub(ds.typedAt); left > 0 {
		c.After(left)
		return
	}
	a.askDid()
}

// ---------- the place ----------

func (a *App) didView(c *ui.Context) {
	t := a.T
	ds := &a.did
	a.didAsk(c)
	a.didUndoTick(c)
	a.placeBar(c, "did", RouteDid, func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.crumb(c, a.L.T("onhand.title"), RouteOnHand)
		a.chromeTitle(c, a.L.T("did.title"))
	}, nil)
	res := a.S.Did.Result
	var field ui.Element
	a.toastsOver(ui.Scroll(c.Key("did-scroll")).Grow(1).MinHeight(0)).Children(func() {
		ui.Column(c).Padding(t.S5, t.S6, t.S7, t.S6).Children(func() {
			ui.Column(c.Key("did-col")).Gap(t.S4).Width(pastMeasure).MaxWidthPercent(100).AlignSelf(ui.Center).Children(func() {
				uiText(c.Key("did-h"), a.L.T("did.title")).Font(t.Display).FontSize(t.XL).FontWeight(800).TextColor(t.Ink).
					Padding(0, t.S1).Role(ui.RoleHeading)
				field = a.didField(c)
				if res != nil {
					a.didChips(c, res)
				}
				a.didList(c, res)
			})
		})
	})
	if !a.nt.open && !a.oh.sw && !(field.Valid() && field.Focused()) && c.Shortcut(0, ui.KeySlash) {
		ds.focusField = true
	}
}

// didUndoTick asks the list again a moment after an Undo went out, so the
// card says what became of it.
func (a *App) didUndoTick(c *ui.Context) {
	ds := &a.did
	for id, at := range ds.undoing {
		if at.IsZero() {
			ds.undoing[id], at = c.Now(), c.Now()
		}
		left := didUndoWait - c.Now().Sub(at)
		if left > 0 {
			c.After(left)
			continue
		}
		delete(ds.undoing, id)
		a.askDid()
	}
}

// didField is the one large field.
func (a *App) didField(c *ui.Context) ui.Element {
	t := a.T
	ds := &a.did
	var in ui.Element
	ui.Row(c.Key("did-field")).Height(52).Gap(t.S3).Padding(0, t.S4).AlignItems(ui.Center).Radius(t.RadiusMD).
		Background(t.SurfaceSunken).InsetShadow(0, 1.5, 3, 0, t.Line).Children(func() {
		ui.Box(c).Size(20, 20).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			drawPastGlyph("look", t.InkMuted)(p, r)
		})
		in = ui.TextInput(c.Key("did-in"), &ds.q).Placeholder(a.L.T("did.find")).Label(a.L.T("did.find")).
			FontSize(t.LG-1).Grow(1).MinWidth(0).Background(ui.Color{}).Border(0, ui.Color{})
		if ds.focusField {
			in.Focus()
			ds.focusField = false
		}
		if ds.q != "" {
			x := ui.Box(c.Key("clear")).Size(24, 24).Radius(12).Shrink(0).Cursor(ui.CursorPointer).Role(ui.RoleButton).
				Label(a.L.T("onhand.sel.clear")).Focusable()
			col := t.InkMuted
			if x.Hovered() {
				x.Background(t.Line)
				col = t.Ink
			}
			x.Draw(drawCross(col))
			if x.Clicked() {
				ds.q, ds.focusField = "", true
			}
		}
	})
	return in
}

// didChips is the one row of filters on a sunk track: All, then each kind,
// with its count for the range when there is one (its own element).
func (a *App) didChips(c *ui.Context, res *protocol.DidFrame) {
	t := a.T
	ds := &a.did
	kinds := append([]string{""}, protocol.DidKinds...)
	const pad = float32(3)
	ui.Row(c.Key("did-chips-row")).Children(func() {
		ui.ScrollHorizontal(c.Key("did-chips-scroll")).Shrink(1).MinWidth(0).Children(func() {
			ui.Row(c.Key("did-chips")).Padding(pad).Gap(2).Radius(t.RadiusSM).AlignItems(ui.Center).Background(t.SurfaceSunken).
				InsetShadow(0, 1.5, 2, 0, t.Line).Role(ui.RoleTabList).Label(a.L.T("did.title")).Children(func() {
				for _, k := range kinds {
					label := a.L.T("did.all")
					n := 0
					if k != "" {
						label = a.L.T("did.f." + k)
						n = res.Counts[k]
					}
					on := ds.kind == k
					b := ui.Row(c.Key("chip:"+k)).Height(28).Padding(0, t.S3).Gap(t.S1 + 2).Radius(t.RadiusSM - pad).AlignItems(ui.Center).
						Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(label).AccessSelected(on).Focusable().Shrink(0)
					fg, nfg := t.InkSoft, t.InkMuted
					switch {
					case on:
						a.knob(b)
						fg, nfg = t.Ink, t.InkSoft
					case b.Hovered():
						b.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
						fg = t.Ink
					}
					b.Children(func() {
						w := 500
						if on {
							w = 700
						}
						uiText(c, label).FontSize(t.SM).FontWeight(w).TextColor(fg).SingleLine().AccessHidden(true)
						if n > 0 {
							uiText(c.Key("n"), fmt.Sprint(n)).FontSize(t.XS).FontWeight(600).TextColor(nfg).FontFeatures("tnum").SingleLine().AccessHidden(true)
						}
					})
					if b.Clicked() {
						ds.kind = k
					}
				}
			})
		})
	})
}

// ---------- the list ----------

// didDayGroup is one day's items.
type didDayGroup struct {
	day   time.Time
	items []*protocol.DidItem
}

// didDays groups items by their local day, newest first (as they come).
func didGroups(items []protocol.DidItem) []didDayGroup {
	var out []didDayGroup
	for i := range items {
		it := &items[i]
		d := didDay0(store.ParseTime(it.At))
		if n := len(out); n > 0 && out[n-1].day.Equal(d) {
			out[n-1].items = append(out[n-1].items, it)
			continue
		}
		found := false
		for j := range out {
			if out[j].day.Equal(d) {
				out[j].items = append(out[j].items, it)
				found = true
			}
		}
		if !found {
			out = append(out, didDayGroup{day: d, items: []*protocol.DidItem{it}})
		}
	}
	return out
}

func didOutward(kind string) bool {
	for _, k := range protocol.DidOutward {
		if k == kind {
			return true
		}
	}
	return false
}

// didNarrowed: a filter or words narrow the list.
func (a *App) didNarrowed() bool {
	return a.did.kind != "" || strings.TrimSpace(a.did.q) != ""
}

func (a *App) didList(c *ui.Context, res *protocol.DidFrame) {
	t := a.T
	if res == nil {
		return
	}
	if len(res.Items) == 0 && a.didNarrowed() {
		a.didNone(c)
		return
	}
	now := a.Now()
	today := didDay0(now)
	groups := didGroups(res.Items)
	ui.Column(c.Key("did-days")).Gap(t.S6).Children(func() {
		// Today comes first even when nothing happened: the empty day says so.
		if !a.didNarrowed() && (len(groups) == 0 || !groups[0].day.Equal(today)) {
			groups = append([]didDayGroup{{day: today}}, groups...)
		}
		for _, g := range groups {
			a.didDaySection(c, g, now)
		}
	})
	ui.Column(c.Key("did-end")).Gap(t.S4).Padding(t.S2, 0, 0, 0).AlignItems(ui.Center).Children(func() {
		if a.quietButton(c, "did-earlier", a.L.T("did.earlier"), "", false, 1) {
			a.did.days += didDays
		}
		uiText(c.Key("did-coverage"), a.L.T("did.coverage")).FontSize(t.XS).TextColor(t.InkMuted).TextAlign(ui.Center).
			LineHeight(1.6).MaxWidth(460)
	})
}

// didNone is a filter or words with no match: Nothing found, and All.
func (a *App) didNone(c *ui.Context) {
	t := a.T
	ui.Column(c.Key("did-none")).Padding(t.S6, t.S5).Gap(t.S3).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).
		AlignItems(ui.Center).Children(func() {
		a.pastPebble(c, "none-art", "look", "", 48)
		uiText(c, a.L.T("did.none")).FontSize(t.MD).TextColor(t.InkSoft).TextAlign(ui.Center)
		if a.button(c, a.L.T("did.all"), btnSecondary, t.ControlSM, t.Bg) {
			a.did.q, a.did.kind = "", ""
		}
	})
}

// didDayName is a day's header: 今天 / Today, 昨天 / Yesterday, else its
// date with the weekday.
func (a *App) didDayName(day, now time.Time) string {
	switch pastDayDiff(day, now) {
	case 0:
		return a.L.T("did.today")
	case -1:
		return a.L.T("did.yesterday")
	}
	return i18n.CalDate(a.L.Lang, day, now)
}

// didDaySection is one day: its name and its counts as separate facts,
// then the empty day or its cards.
func (a *App) didDaySection(c *ui.Context, g didDayGroup, now time.Time) {
	t := a.T
	counts := map[string]int{}
	for _, it := range g.items {
		counts[it.Kind]++
	}
	outward := counts["sent"] + counts["paid"] + counts["called"]
	isToday := pastDayDiff(g.day, now) == 0
	ui.Column(c.Key("day:" + g.day.Format("2006-01-02"))).Gap(t.S3).Children(func() {
		ui.Row(c.Key("head")).Gap(t.S3).AlignItems(ui.Center).MinHeight(24).Padding(0, t.S2).Wrap().Children(func() {
			uiText(c, a.didDayName(g.day, now)).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).SingleLine()
			for _, k := range []struct {
				kind string
				n    string
			}{{"sent", a.L.T("did.n.sent", counts["sent"])}, {"paid", a.L.T("did.n.paid", counts["paid"])}, {"called", a.L.N("did.n.called", counts["called"], counts["called"])}} {
				if counts[k.kind] == 0 {
					continue
				}
				uiText(c.Key("n:"+k.kind), k.n).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum").
					Padding(2, t.S2).Radius(t.RadiusXS).Background(t.SurfaceSunken).SingleLine()
			}
		})
		if isToday && outward == 0 && !a.didNarrowed() {
			a.didEmptyDay(c, g.items)
		} else if outward == 0 && counts["read"] == len(g.items) && len(g.items) > 0 {
			uiText(c.Key("reads-only"), a.L.T("did.reads.only")).FontSize(t.SM).TextColor(t.InkMuted).Padding(0, t.S2)
		}
		if len(g.items) > 0 {
			ui.Column(c.Key("cards")).Gap(t.S2 + 2).Children(func() {
				for _, it := range g.items {
					a.didCard(c.Key("card:"+it.ID), it)
				}
			})
		}
	})
}

// didEmptyDay is today with nothing sent, paid or called: the clay
// character with its notebook, the one sentence, and what did happen.
func (a *App) didEmptyDay(c *ui.Context, items []*protocol.DidItem) {
	t := a.T
	accounts := map[string]bool{}
	changes := 0
	for _, it := range items {
		switch it.Kind {
		case "read":
			accounts[firstNonEmpty(it.Via, it.To, it.ID)] = true
		default:
			changes++
		}
	}
	ui.Column(c.Key("did-empty")).Padding(t.S5, t.S5, t.S6, t.S5).Gap(t.S3).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).
		AlignItems(ui.Center).Children(func() {
		a.avatar(c, theme.Idle, 112)
		uiText(c, a.L.T("did.empty")).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).TextAlign(ui.Center).LineHeight(1.5).MaxWidth(440)
		ui.Row(c.Key("facts")).Gap(t.S2).Justify(ui.Center).Wrap().Children(func() {
			fact := func(key, text string) {
				uiText(c.Key(key), text).FontSize(t.SM).TextColor(t.InkSoft).Padding(3, t.S3).Radius(t.Pill).Background(t.SurfaceSunken).SingleLine()
			}
			if n := len(accounts); n > 0 {
				fact("read", a.L.N("did.empty.read", n, n))
			}
			if changes > 0 {
				fact("changed", a.L.N("did.empty.changed", changes, changes))
			}
			if len(accounts) == 0 && changes == 0 {
				fact("nothing", a.L.T("did.empty.nothing"))
			}
		})
	})
}

// didTint is the clay a kind's pebble sits on; a read sits pressed into
// the sunken ground, the quietest. One table with the web (D314: the two
// clients had disagreed on four of the six).
func didTint(kind string) string { return didTints[kind] }

// didLine is what it did, in plain words from the table by kind and sub.
func (a *App) didLine(it *protocol.DidItem) string {
	l := a.L
	k, s := it.Kind, it.Sub
	switch {
	case k == "changed" && s == "calendar":
		return l.T("did.l.changed.calendar." + firstNonEmpty(it.Cal, "create"))
	case k == "deleted" && s == "calendar", k == "sent" && s == "post", k == "changed" && s == "pr":
		return l.T("did.l." + k + "." + s)
	case k == "changed" && s == "files":
		n := it.Count
		if n == 0 && it.Files != nil {
			n = it.Files.Added + it.Files.Changed + it.Files.Removed
		}
		return l.N("did.l.changed.files", n, n)
	case k == "sent" && s == "message" && it.To == "":
		return l.T("did.l.sent.message.none")
	}
	// The ones that name what they reached, or what they went through.
	arg := it.To
	switch s {
	case "buy", "account", "setting", "install", "write", "item":
		arg = firstNonEmpty(it.Via, it.To)
	}
	if k == "read" {
		arg = firstNonEmpty(it.Via, it.To)
	}
	if arg == "" {
		return l.T("did.l." + k)
	}
	key := "did.l." + k + "." + s
	if l.T(key) == key {
		return l.T("did.l." + k)
	}
	return l.T(key, arg)
}

// didFacts are the card's facts, each its own words: who asked, the Go,
// where, and a count.
func (a *App) didFacts(it *protocol.DidItem) []string {
	l := a.L
	var out []string
	switch it.Who.By {
	case "task":
		if it.Who.Title != "" {
			out = append(out, l.T("did.who.task", shortTitle(it.Who.Title)))
		}
	case "routine":
		if it.Who.Routine != "" {
			out = append(out, l.T("did.who.routine", it.Who.Routine))
		}
	case "you":
		out = append(out, l.T("did.who.you"))
	}
	if g := it.Go; g != nil {
		switch g.By {
		case "you":
			at := store.ParseTime(g.At)
			if at.IsZero() {
				at = store.ParseTime(it.At)
			}
			out = append(out, l.T("did.go.you", i18n.Clock(at)))
		case "default":
			out = append(out, l.T("did.go.default"))
		case "before":
			out = append(out, l.T("did.go.before"))
		case "said":
			out = append(out, l.T("did.go.said", g.Words))
		case "paid": // D436: the person paid it themselves at the checkout
			at := store.ParseTime(g.At)
			if at.IsZero() {
				at = store.ParseTime(it.At)
			}
			out = append(out, l.T("did.go.paid", i18n.Clock(at)))
		}
	}
	if w := it.Where; w != nil {
		switch w.Kind {
		case "computer", "phone":
			if w.Name != "" {
				out = append(out, l.T("did.where.computer", w.Name))
			}
		case "ducter_phone":
			out = append(out, l.T("did.where.ducter_phone"))
		case "line":
			out = append(out, l.T("did.where.line", firstNonEmpty(w.Name, it.Via)))
		case "own_number":
			out = append(out, l.T("did.where.own_number"))
		case "home":
			if v := firstNonEmpty(w.Name, it.Via); v != "" {
				out = append(out, l.T("did.where.home", v))
			}
		case "browser":
			out = append(out, l.T("did.where.browser"))
			if w.Name != "" {
				out = append(out, l.T("did.where.computer", w.Name))
			}
		}
	}
	if it.Kind == "read" && it.Count > 0 {
		out = append(out, l.N("did.times", it.Count, it.Count))
	}
	return out
}

// didCard is one action.
func (a *App) didCard(c *ui.Context, it *protocol.DidItem) {
	t := a.T
	line := a.didLine(it)
	card := ui.Row(c).Gap(t.S3+2).Padding(t.S3+2, t.S4, t.S3+2, t.S3+2).Radius(t.RadiusLG - 4).AlignItems(ui.Start).
		Background(t.Surface).Role(ui.RoleGroup).Label(line)
	card.Shadow(0, 2, 6, -2, t.Ink.Alpha(0.04)).Shadow(0, 2, 0, 0, t.Line)
	card.Children(func() {
		a.pastPebbleDraw(c, "art", didTint(it.Kind), pastPebble, drawDidGlyph(it.Kind, it.Sub))
		ui.Column(c.Key("main")).Grow(1).Shrink(1).MinWidth(0).Gap(t.S1 + 1).Children(func() {
			// The line, the amount beside it, the time at the end.
			ui.Row(c.Key("l1")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).MinHeight(22).Children(func() {
				uiText(c, keepWords(autospace(line))).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(line)
				if it.Amount != "" {
					uiText(c.Key("amount"), it.Amount).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).FontFeatures("tnum").
						Padding(1, t.S2).Radius(t.RadiusXS).Background(t.SurfaceSunken).SingleLine().Shrink(0)
				}
				if it.Unsure != "" {
					uiText(c.Key("unsure"), a.L.T("did.unsure."+it.Unsure)).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink).
						Padding(1, t.S2).Radius(t.RadiusXS).Background(t.NeedsYou.Surface).SingleLine().Shrink(0)
				}
				ui.Spacer(c)
				uiText(c.Key("at"), i18n.Clock(store.ParseTime(it.At))).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().Shrink(0)
			})
			if s := strings.TrimSpace(a.didOwn(it)); s != "" {
				uiText(c.Key("own"), keepWords(autospace(s))).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(leadingFor(s, 1.45)).MaxLines(2).MinWidth(0)
			}
			// The facts, then the card's ways on at the row's end.
			facts := a.didFacts(it)
			if a.didUndoable(it) {
				until := i18n.Day(a.L.Lang, store.ParseTime(it.Undo.Until), a.Now())
				facts = append(facts, a.L.T("did.undo.until", until))
			}
			// One height with or without actions, so every card keeps one rhythm.
			ui.Row(c.Key("foot")).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).MinHeight(t.ControlSM - 2*t.S1).Children(func() {
				// D291: each fact its own element (the shared facts row).
				ui.Column(c.Key("facts")).Grow(1).Shrink(1).MinWidth(0).Children(func() {
					a.facts(c, t.XS, t.InkMuted, facts...)
				})
				a.didActs(c, it)
			})
		})
	})
}

// didActs are the card's ways on: Open the task, See it, and Undo while the
// folder task's copy is kept.
func (a *App) didActs(c *ui.Context, it *protocol.DidItem) {
	t := a.T
	task := firstNonEmpty(it.TaskID, it.Who.TaskID)
	undo := a.didUndoable(it)
	if task == "" && it.Link == "" && !undo {
		return
	}
	about := a.didLine(it)
	// Pulled out by the text buttons' padding: their words end on the card's
	// text edge, under the time, and they add no height to the row.
	ui.Row(c.Key("acts")).Margin(-t.S1, -a.textPad(t.ControlSM), -t.S1, 0).Gap(t.S1).AlignItems(ui.Center).Shrink(0).Children(func() {
		// Undo first: the clay button sits inside the row, the text ones end it.
		if undo {
			if _, busy := a.did.undoing[it.ID]; busy {
				ui.Box(c.Key("undo-wait")).Size(t.ControlSM, t.ControlSM).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
					ui.Spinner(c).Size(14, 14)
				})
			} else if a.buttonFor(c, a.L.T("did.undo"), about, btnSecondary, t.ControlSM, t.Surface) {
				a.didUndo(it)
			}
		}
		if task != "" && a.buttonFor(c, a.L.T("did.open"), about, btnText, t.ControlSM, t.Surface) {
			a.OpenTask(task)
			a.back = &returnTo{task: task, route: RouteDid}
		}
		if it.Link != "" && a.buttonFor(c, a.L.T("did.see"), about, btnText, t.ControlSM, t.Surface) {
			a.openLink(it.Link)
		}
	})
}

// didUndoable: an Undo truly exists (a folder task's copy, still kept).
func (a *App) didUndoable(it *protocol.DidItem) bool {
	return it.Undo != nil && it.Undo.TaskID != "" && store.ParseTime(it.Undo.Until).After(a.Now())
}

// didUndo is 改回去 / Undo: the existing task_action undo for the folder
// task (D142); the list is asked again a moment later.
func (a *App) didUndo(it *protocol.DidItem) {
	ds := &a.did
	if ds.undoing == nil {
		ds.undoing = map[string]time.Time{}
	}
	ds.undoing[it.ID] = time.Time{} // the view's clock starts the wait (didUndoTick)
	if task := a.S.Task(it.Undo.TaskID); task != nil {
		task.Acting = "undo"
	}
	a.send(protocol.TaskAction{T: "task_action", TaskID: it.Undo.TaskID, Action: "undo"})
}

// ---------- the ways in, drawn ----------

// didLink is the quiet 替你做过的 › line (On hand's end, under the morning note).
func (a *App) didLink(c *ui.Context, key string) {
	if a.quietButton(c, key, a.L.T("did.link"), "", false, 1) {
		a.OpenDid()
	}
}

// didOwn is a row's own words; a filled detail is named in the person's
// language (电话, not the store's "Phone") (D443).
func (a *App) didOwn(it *protocol.DidItem) string {
	if it.Detail != "" {
		k := "did.detail." + it.Detail
		if s := a.L.T(k); s != k {
			return s
		}
	}
	return it.Line
}
