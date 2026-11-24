package views

// D285: 做过的事 / Past tasks (design/past.md). A whole-window place: one
// large field that searches as you type, one row of filters on a sunk track
// (the chosen one the knob, D270), then the cards: grouped by when while
// browsing, one ranked list with words. Each card says at a glance what it
// was and how it ended; its actions are 接着做 / Continue (打开 / Open while
// still on hand), 带着它开新任务 / New task from this, and the ⋯ menu with
// another agent and the marks (a name, a star, tags, a picture).

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	// pastDebounce is how long the field waits after a key before it asks.
	pastDebounce = 120 * time.Millisecond
	// pastMeasure is the place's one reading column.
	pastMeasure = 760
	// pastPebble is a card's picture.
	pastPebble = 36
	// pastStarPop is the star's pop (1 → 1.3 → 1, the clay tock).
	pastStarPop = 220 * time.Millisecond
)

// pastHarnesses are the agents Continue with another agent offers.
var pastHarnesses = []string{"claude-code", "codex", "pi", "deepseek-harness", "antigravity"}

// pastFilter is the chip chosen: "" (all), starred, project, harness, tag.
type pastFilter struct{ kind, value string }

type pastState struct {
	// q is the field's words; typed and typedAt the last change seen, sent
	// the query (words and filter) asked last, reqN its count.
	q, typed string
	typedAt  time.Time
	sent     string
	asked    bool
	reqN     int
	filter   pastFilter
	// focus is the card the keys are on; order the cards as drawn; scroll
	// asks the focused card into view (it was walked to).
	focus  string
	order  []string
	scroll bool
	// back is where Esc goes: the place it came from (a task's id with it).
	back     Route
	backTask string
	// The marks popover: open on marking; nameDraft and tagDraft its
	// fields; focusName asks its name field for the keyboard.
	marking   string
	markOpen  bool
	nameDraft string
	tagDraft  string
	focusName bool
	// starAt is when each star was last toggled (its pop).
	starAt map[string]time.Time
	// focusField asks the big field for the keyboard.
	focusField bool
	// from is New task from this: the task the sheet's brief carries.
	from *protocol.PastFrom
	// tab is the collection shown: "" 做过的事, "ongoing" 一直在跑的 (ongoing.go).
	tab string
	og  ongoingState
	// made is 给你做的 / Made for you's own state (made.go, D383).
	made madeState
	// D299: adopting is the outside session being carried on (agent:id),
	// opened when its task is there; outMsg why one couldn't be.
	adopting, outMsg string
	// D391: computer and ended narrow the list on their own, beside
	// filter (one computer, one ending, each a chip that toggles).
	computer *string
	ended    string
	// sel is the card 停在哪儿 / Where it stopped shows; sheet shows it as
	// a sheet (narrow); pickSteps: came to pick a step to redo from.
	sel        string
	sheet      bool
	pickSteps  bool
	stepsAsked map[string]bool
	synth      map[string]*protocol.PastItem
	// redo is the 从这一步开新任务 / New task from this step sheet (past_where.go).
	redo redoState
}

// ---------- ways in ----------

// OpenPast shows 做过的事 / Past tasks, with words when given (On hand's
// Find, the switcher). Esc comes back to where it was opened from.
func (a *App) OpenPast(q string) {
	ps := &a.past
	if a.Route != RoutePast {
		ps.back, ps.backTask = a.Route, a.TaskID
	}
	a.Route = RoutePast
	ps.q, ps.typed, ps.filter, ps.focus = q, q, pastFilter{}, ""
	ps.computer, ps.ended, ps.sel, ps.sheet, ps.pickSteps = nil, "", "", false, false
	ps.stepsAsked = nil // a task's steps are asked again: it may have moved on
	ps.marking, ps.markOpen = "", false
	ps.focusField = true
	ps.tab = ""
	ps.made.kind, ps.made.open = "", ""
	a.askPast()
}

// pastBack goes back to where Past tasks was opened from.
func (a *App) pastBack() {
	ps := &a.past
	switch ps.back {
	case RouteTask:
		if ps.backTask != "" && a.S.Task(ps.backTask) != nil {
			a.OpenTask(ps.backTask)
			return
		}
		a.Route = RouteOnHand
	case RoutePast:
		a.Route = RouteOnHand
	default:
		a.Route = ps.back
	}
}

// pastEsc is Esc in Past tasks: the marks close, then the words clear, then
// the filter, then it goes back.
func (a *App) pastEsc() {
	ps := &a.past
	switch {
	case ps.markOpen:
		a.closeMarks()
	case ps.redo.open:
		ps.redo.open = false
	case ps.sheet && ps.sel != "" && ps.tab == "":
		ps.sheet = false
	case ps.tab == "ongoing" && a.ongoingEsc():
	case ps.tab == "made" && ps.q != "":
		ps.q = ""
	case ps.tab == "made" && ps.made.kind != "":
		ps.made.kind = ""
	case ps.tab == "" && ps.q != "":
		ps.q = ""
	case ps.tab == "" && (ps.filter.kind != "" || ps.computer != nil || ps.ended != ""):
		ps.filter, ps.computer, ps.ended = pastFilter{}, nil, ""
	default:
		a.pastBack()
	}
}

// pastQuery is what the place asks for: its words and its filter.
func (a *App) pastQuery() protocol.PastQuery {
	ps := &a.past
	q := protocol.PastQuery{Q: strings.TrimSpace(ps.q)}
	switch ps.filter.kind {
	case "starred":
		q.Starred = true
	case "project":
		v := ps.filter.value
		q.Project = &v
	case "harness":
		q.Harness = ps.filter.value
	case "tag":
		q.Tag = ps.filter.value
	}
	if ps.computer != nil {
		v := *ps.computer
		q.Computer = &v
	}
	q.Ended = ps.ended
	return q
}

func pastKey(q protocol.PastQuery) string {
	p, pc := "", ""
	if q.Project != nil {
		p = "p:" + *q.Project
	}
	if q.Computer != nil {
		pc = "c:" + *q.Computer
	}
	return fmt.Sprint(q.Q, "\x00", q.Starred, p, q.Harness, q.Tag, pc, q.Ended)
}

// askPast sends the query now.
func (a *App) askPast() {
	ps := &a.past
	q := a.pastQuery()
	ps.reqN++
	ps.sent, ps.asked = pastKey(q), true
	a.send(protocol.PastReq{T: "past", ID: fmt.Sprintf("past%d", ps.reqN), Query: q})
}

// pastAsk sends the query once the words rest for pastDebounce, and at once
// for a filter.
func (a *App) pastAsk(c *ui.Context) {
	ps := &a.past
	now := c.Now()
	if ps.q != ps.typed {
		ps.typed, ps.typedAt = ps.q, now
	}
	key := pastKey(a.pastQuery())
	switch {
	case ps.asked && key == ps.sent:
		return
	case !ps.asked || !a.pastKeyWords(key):
		a.askPast() // the first ask, or a filter: at once
		return
	}
	// Only the words changed: wait for them to rest.
	if left := pastDebounce - now.Sub(ps.typedAt); left > 0 {
		c.After(left)
		return
	}
	a.askPast()
}

// pastKeyWords reports whether only the words differ from what was sent.
func (a *App) pastKeyWords(key string) bool {
	i, j := strings.Index(key, "\x00"), strings.Index(a.past.sent, "\x00")
	return i >= 0 && j >= 0 && key[i:] == a.past.sent[j:]
}

// ---------- the place ----------

func (a *App) pastView(c *ui.Context) {
	t := a.T
	ps := &a.past
	a.pastAsk(c)
	a.placeBar(c, "past", RoutePast, func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.crumb(c, a.L.T("onhand.title"), RouteOnHand)
		title := a.L.T("past.title")
		switch ps.tab {
		case "ongoing":
			title = a.L.T("og.tab")
		case "made":
			title = a.L.T("made.tab")
		}
		a.chromeTitle(c, title)
	}, nil)
	res := a.S.Past.Result
	var field ui.Element
	// D391: wide, 停在哪儿 / Where it stopped stands beside the list, on
	// the card chosen (the first one until another is).
	split := ps.tab == "" && a.pastWide(c)
	ui.Row(c.Key("past-split")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
		ui.Scroll(c.Key("past-scroll")).Grow(1).MinHeight(0).MinWidth(0).Children(func() {
			ui.Column(c).Padding(t.S5, t.S6, t.S7, t.S6).Children(func() {
				ui.Column(c.Key("past-col")).Gap(t.S4).Width(pastMeasure).MaxWidthPercent(100).AlignSelf(ui.Center).Children(func() {
					a.pastTabs(c)
					if ps.tab == "ongoing" {
						a.ongoingList(c)
						return
					}
					if ps.tab == "made" {
						field = a.madeTab(c) // D383 (made.go)
						return
					}
					field = a.pastField(c, res)
					if res != nil {
						a.pastChips(c, res)
					}
					a.pastList(c, res)
				})
			})
		})
		if split {
			a.pastWhereColumn(c)
		}
	})
	if ps.tab == "" {
		a.pastKeys(c, field)
		a.pastWhereSheet(c)
	}
	// The cards as drawn now: wide, the preview stays on one of them (the
	// first, until one is chosen), unless it came to pick a step.
	if split && !ps.pickSteps && len(ps.order) > 0 && (ps.sel == "" || !slices.Contains(ps.order, ps.sel)) {
		a.pastSelect(ps.order[0])
		c.After(16 * time.Millisecond)
	}
	a.redoSheet(c)
	if ps.marking != "" && !ps.markOpen {
		a.closeMarks()
	}
}

// pastField is the large field, and under it what its time words meant.
func (a *App) pastField(c *ui.Context, res *protocol.PastFrame) ui.Element {
	t := a.T
	ps := &a.past
	var in ui.Element
	find := "past.find"
	if ps.tab == "made" {
		find = "made.find"
	}
	ui.Column(c.Key("past-field")).Gap(t.S2).Children(func() {
		ui.Row(c.Key("track")).Height(52).Gap(t.S3).Padding(0, t.S4).AlignItems(ui.Center).Radius(t.RadiusMD).
			Background(t.SurfaceSunken).InsetShadow(0, 1.5, 3, 0, t.Line).Children(func() {
			ui.Box(c).Size(20, 20).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
				drawPastGlyph("look", t.InkMuted)(p, r)
			})
			in = ui.TextInput(c.Key("past-in"), &ps.q).Placeholder(a.L.T(find)).Label(a.L.T(find)).
				FontSize(t.LG-1).Grow(1).MinWidth(0).Background(ui.Color{}).Border(0, ui.Color{})
			if ps.focusField {
				in.Focus()
				ps.focusField = false
			}
			if ps.q != "" {
				x := ui.Box(c.Key("clear")).Size(24, 24).Radius(12).Shrink(0).Cursor(ui.CursorPointer).Role(ui.RoleButton).
					Label(a.L.T("onhand.sel.clear")).Focusable()
				col := t.InkMuted
				if x.Hovered() {
					x.Background(t.Line)
					col = t.Ink
				}
				x.Draw(drawCross(col))
				if x.Clicked() {
					ps.q, ps.focusField = "", true
				}
			}
		})
		if res != nil && res.Range != nil && strings.TrimSpace(ps.q) != "" {
			ui.Row(c.Key("range")).Gap(t.S2).Padding(0, t.S4).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 14, drawClock(t.InkMuted))
				a.facts(c, t.SM, t.InkSoft, a.pastRange(res.Range)...)
			})
		}
	})
	return in
}

// pastRange says the dates time words meant: "上周二 · 11 月 10 日",
// "上周 · 11 月 9 日 – 11 月 15 日".
// D291: the range a search read, said and dated apart.
func (a *App) pastRange(r *protocol.PastRange) []string {
	since, before := store.ParseTime(r.Since), store.ParseTime(r.Before)
	if since.IsZero() {
		return nonEmpty(r.Words)
	}
	last := before.Add(-time.Second)
	day := func(at time.Time) string {
		at = at.Local()
		return i18n.Pick(a.L, pastDates).day(at)
	}
	span := day(since)
	if !before.IsZero() && day(last) != span {
		span += "–" + day(last)
	}
	return nonEmpty(r.Words, span)
}

// pastChips is the one row of filters on a sunk track: All, Starred, then
// the projects, the agents and the tags in use, most used first.
func (a *App) pastChips(c *ui.Context, res *protocol.PastFrame) {
	t := a.T
	ps := &a.past
	type chip struct {
		f     pastFilter
		label string
		n     int
	}
	chips := []chip{{pastFilter{}, a.L.T("past.all"), 0}, {pastFilter{kind: "starred"}, a.L.T("past.starred"), 0}}
	if len(res.Facets.Projects) > 1 {
		for i, p := range res.Facets.Projects {
			if i == 5 {
				break
			}
			name := p.Name
			if name == "" {
				name = a.L.T("past.other")
			}
			chips = append(chips, chip{pastFilter{"project", p.Name}, name, p.N})
		}
	}
	if len(res.Facets.Harnesses) > 1 {
		for _, h := range res.Facets.Harnesses {
			chips = append(chips, chip{pastFilter{"harness", h.Harness}, harnessName(h.Harness), h.N})
		}
	}
	// D391: a second track: the computers (from two), then how it ended;
	// each on its own, so "haswell" and "没做成" hold together.
	var more []chip
	if len(res.Facets.Computers) > 1 {
		for _, pc := range res.Facets.Computers {
			name := pc.Name
			if name == "" {
				name = a.pastHomeName()
			}
			more = append(more, chip{pastFilter{"computer", pc.Name}, name, pc.N})
		}
	}
	for _, e := range []struct{ v, key string }{{"done", "past.ended.done"}, {"failed", "past.ended.failed"}, {"cancelled", "past.ended.cancel"}, {"on_hand", "past.ended.onhand"}} {
		more = append(more, chip{pastFilter{"ended", e.v}, a.L.T(e.key), 0})
	}
	for i, tg := range res.Facets.Tags {
		if i == 6 {
			break
		}
		chips = append(chips, chip{pastFilter{"tag", tg.Tag}, "#" + tg.Tag, tg.N})
	}
	// The chosen one is always on the row, even when it fell off the counts.
	found := false
	for _, ch := range chips {
		found = found || ch.f == ps.filter
	}
	if !found && ps.filter.kind != "" {
		chips = append(chips, chip{ps.filter, ps.filter.value, 0})
	}
	const pad = float32(3)
	for gi, chips := range [][]chip{chips, more} {
		ui.Row(c.Key(fmt.Sprintf("chips-row:%d", gi))).Children(func() {
			ui.ScrollHorizontal(c.Key("chips-scroll")).Shrink(1).MinWidth(0).Children(func() {
				ui.Row(c.Key("chips")).Padding(pad).Gap(2).Radius(t.RadiusSM).AlignItems(ui.Center).Background(t.SurfaceSunken).
					InsetShadow(0, 1.5, 2, 0, t.Line).Role(ui.RoleTabList).Label(a.L.T("past.title")).Children(func() {
					for i, ch := range chips {
						on := ch.f == ps.filter
						switch ch.f.kind {
						case "":
							on = on && ps.computer == nil && ps.ended == ""
						case "computer":
							on = ps.computer != nil && *ps.computer == ch.f.value
						case "ended":
							on = ps.ended == ch.f.value
						}
						b := ui.Row(c.Key(fmt.Sprintf("chip:%d:%s:%s", i, ch.f.kind, ch.f.value))).Height(28).Padding(0, t.S3).Gap(t.S1 + 1).
							Radius(t.RadiusSM - pad).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(ch.label).
							AccessSelected(on).Focusable().Shrink(0)
						fg := t.InkSoft
						switch {
						case on:
							a.knob(b)
							fg = t.Ink
						case b.Hovered():
							b.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
							fg = t.Ink
						}
						b.Children(func() {
							if ch.f.kind == "starred" {
								ui.Box(c).Size(12, 12).Shrink(0).Draw(drawStar(fg, on)).AccessHidden(true)
							}
							w := 500
							if on {
								w = 700
							}
							uiText(c, ch.label).FontSize(t.SM).FontWeight(w).TextColor(fg).SingleLine().AccessHidden(true)
						})
						if b.Clicked() {
							ps.focus, ps.sel = "", ""
							switch ch.f.kind {
							case "computer":
								if on {
									ps.computer = nil
								} else {
									v := ch.f.value
									ps.computer = &v
								}
							case "ended":
								if on {
									ps.ended = ""
								} else {
									ps.ended = ch.f.value
								}
							case "":
								ps.filter, ps.computer, ps.ended = ch.f, nil, ""
							default:
								ps.filter = ch.f
							}
						}
					}
				})
			})
		})
	}
}

// ---------- the list ----------

// pastGroup is one run of cards under a name.
type pastGroup struct {
	key, name string
	items     []*protocol.PastItem
}

// pastGroups puts items under 标了星的, then 今天 · 昨天 · 这周 · 上周 ·
// 这个月, then each month, by when it was last worked on.
func pastGroups(l *i18n.Strings, items []protocol.PastItem, now time.Time) []pastGroup {
	now = now.Local()
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	wd := (int(now.Weekday()) + 6) % 7 // Monday 0
	week0 := day0.AddDate(0, 0, -wd)
	last0 := week0.AddDate(0, 0, -7)
	month0 := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var out []pastGroup
	add := func(key, name string, it *protocol.PastItem) {
		if n := len(out); n > 0 && out[n-1].key == key {
			out[n-1].items = append(out[n-1].items, it)
			return
		}
		for i := range out {
			if out[i].key == key {
				out[i].items = append(out[i].items, it)
				return
			}
		}
		out = append(out, pastGroup{key: key, name: name, items: []*protocol.PastItem{it}})
	}
	for i := range items {
		it := &items[i]
		if it.Mark != nil && it.Mark.Starred {
			add("starred", l.T("past.starred"), it)
		}
	}
	for i := range items {
		it := &items[i]
		if it.Mark != nil && it.Mark.Starred {
			continue
		}
		at := store.ParseTime(it.UpdatedAt).Local()
		switch {
		case !at.Before(day0):
			add("today", l.T("past.g.today"), it)
		case !at.Before(day0.AddDate(0, 0, -1)):
			add("yesterday", l.T("past.g.yesterday"), it)
		case !at.Before(week0):
			add("week", l.T("past.g.week"), it)
		case !at.Before(last0):
			add("lastweek", l.T("past.g.lastweek"), it)
		case !at.Before(month0):
			add("month", l.T("past.g.month"), it)
		default:
			add(at.Format("2006-01"), monthName(l.Lang, at, now), it)
		}
	}
	return out
}

// monthName is a month as a group says it: 10 月, October; with the year
// when it isn't this one.
func monthName(l i18n.Lang, at, now time.Time) string {
	return lang.Words(pastDates, string(l)).month(at, at.Year() != now.Year())
}

// pastDates is how Past writes its dates, per language (D292).
var pastDates = map[string]struct {
	day       func(at time.Time) string
	month     func(at time.Time, year bool) string
	yesterday string
	weekday   func(d time.Weekday) string
}{
	"zh": {
		day: func(at time.Time) string { return fmt.Sprintf("%d 月 %d 日", int(at.Month()), at.Day()) },
		month: func(at time.Time, year bool) string {
			if year {
				return fmt.Sprintf("%d 年 %d 月", at.Year(), int(at.Month()))
			}
			return fmt.Sprintf("%d 月", int(at.Month()))
		},
		yesterday: "昨天",
		weekday: func(d time.Weekday) string {
			return [...]string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}[d]
		},
	},
	"en": {
		day: func(at time.Time) string { return fmt.Sprintf("%s %d", at.Month().String()[:3], at.Day()) },
		month: func(at time.Time, year bool) string {
			if year {
				return fmt.Sprintf("%s %d", at.Month(), at.Year())
			}
			return at.Month().String()
		},
		yesterday: "Yesterday",
		weekday:   func(d time.Weekday) string { return d.String()[:3] },
	},
}

// pastSearching: words were typed, so the list is one ranked run.
func (a *App) pastSearching() bool { return strings.TrimSpace(a.past.q) != "" }

func (a *App) pastList(c *ui.Context, res *protocol.PastFrame) {
	t := a.T
	ps := &a.past
	ps.order = ps.order[:0]
	if res == nil {
		return
	}
	terms := pastTerms(ps.q)
	if len(res.Items) == 0 && len(res.Outside) > 0 {
		a.pastOutside(c, res, terms)
		return
	}
	if len(res.Items) == 0 {
		words, key := a.L.T("past.none"), "none"
		if !a.pastSearching() && ps.filter.kind == "" {
			words, key = a.L.T("past.empty"), "empty"
		}
		ui.Column(c.Key("past-"+key)).Padding(t.S6, t.S5).Gap(t.S3).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).
			AlignItems(ui.Center).Children(func() {
			a.pastPebble(c, "empty-art", "idea", "", 48)
			uiText(c, words).FontSize(t.MD).TextColor(t.InkSoft).TextAlign(ui.Center).LineHeight(1.6).MaxWidth(420)
		})
		return
	}
	if a.pastSearching() {
		items := make([]*protocol.PastItem, len(res.Items))
		for i := range res.Items {
			items[i] = &res.Items[i]
		}
		a.pastSection(c, "found", a.L.T("past.n", res.Total), 0, items, terms)
	} else {
		for _, g := range pastGroups(a.L, res.Items, a.Now()) {
			a.pastSection(c, g.key, g.name, len(g.items), g.items, terms)
		}
	}
	a.pastOutside(c, res, terms) // D299 (pastoutside.go)
}

func (a *App) pastSection(c *ui.Context, key, name string, n int, items []*protocol.PastItem, terms []string) {
	t := a.T
	ui.Column(c.Key("sec:" + key)).Gap(t.S2).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).MinHeight(24).Padding(t.S2, t.S2, 0, t.S2).Children(func() {
			uiText(c, name).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
			if n > 0 {
				uiText(c, fmt.Sprint(n)).FontSize(t.XS).FontWeight(500).TextColor(t.Faint).FontFeatures("tnum")
			}
		})
		ui.Column(c.Key("cards")).Gap(t.S2 + 2).Children(func() {
			for _, it := range items {
				a.past.order = append(a.past.order, it.TaskID)
				a.pastCard(c.Key("card:"+it.TaskID), it, terms)
			}
		})
	})
}

// pastActive: still on hand (it lives in On hand; Open instead of Continue).
func pastActive(att protocol.Attention) bool {
	switch att {
	case protocol.Queued, protocol.Working, protocol.NeedsYou, protocol.Blocked, protocol.DoneClaimed:
		return true
	}
	return false
}

// pastCard is one task: its picture, its name with the star and its tags,
// how it ended (or where the words matched), and one small line of where,
// who, when and what it changed. Hover, or the keys on it, lifts it and
// shows its actions.
func (a *App) pastCard(c *ui.Context, it *protocol.PastItem, terms []string) {
	t := a.T
	ps := &a.past
	focus := ps.focus == it.TaskID
	card := ui.Row(c).Gap(t.S3+2).Padding(t.S3+2, t.S4, t.S3+2, t.S3+2).Radius(t.RadiusLG - 4).AlignItems(ui.Center).
		Background(t.Surface).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(it.Title).Focusable()
	hover := card.Hovered() || card.FocusWithin() || focus || ps.marking == it.TaskID
	k := a.cardLift(c, card, hover)
	// A card rests on its clay ledge; lifted, the ledge shows deeper and a
	// soft drop opens under it.
	card.Shadow(0, 2+5*k, 6+12*k, -2, t.Ink.Alpha(0.04+0.06*k)).Shadow(0, 2+2*k, 0, 0, t.Line)
	if ps.sel == it.TaskID && a.pastWide(c) {
		card.Border(2, t.Accent.Alpha(0.75)) // D391: the one shown beside the list
	}
	if focus {
		card.AccessSelected(true)
		if ps.scroll {
			// Walked to: the keys leave the field for the card (s, r, j/k are keys again).
			card.ScrollIntoView().Focus()
			ps.scroll = false
		}
	}
	card.Children(func() {
		glyph, tint := it.Kind, ""
		if m := it.Mark; m != nil && m.Glyph != "" {
			glyph, tint = m.Glyph, firstNonEmpty(m.Tint, "clay")
		}
		a.pastPebble(c, "art", glyph, tint, pastPebble)
		ui.Column(c.Key("main")).Grow(1).Shrink(1).MinWidth(0).Gap(4).Children(func() {
			a.pastLine1(c, it)
			a.pastLine2(c, it, terms)
			a.pastMeta(c, it)
		})
		// D524: its actions keep their room and fade in; the words never rewrap.
		a.revealSlot(c, "reveal", hover, func() { a.pastActs(c, it) })
	})
	// D391: a click shows where it stopped (beside the list, or as a sheet
	// when narrow); a double click opens it, as Enter does.
	if card.DoubleClicked() {
		ps.focus, ps.sheet = it.TaskID, false
		a.pastOpen(it)
	} else if card.Clicked() {
		ps.focus = it.TaskID
		a.pastSelect(it.TaskID)
		ps.sheet = true
	}
}

// pastPebble is a task's picture: the person's glyph raised on its clay
// tint, or Ducter's guess (tint "") in muted ink pressed into the sunken
// ground.
func (a *App) pastPebble(c *ui.Context, key, glyph, tint string, size float32) ui.Element {
	t := a.T
	b := ui.Box(c.Key(key)).Size(size, size).Shrink(0).AccessHidden(true)
	k := size / 36
	b.Radius(13*k, 15*k, 12*k, 14*k)
	ink := t.InkMuted
	if tn, ok := a.T.Tint(tint); ok {
		ink = tn.Ink
		b.Background(tn.Ground).Shadow(0, 2.5*k, 0, 0, tn.Ledge).InsetShadow(0, 1.5, 0, 0, t.Surface.Alpha(0.55))
	} else {
		b.Background(t.SurfaceSunken).InsetShadow(0, 1.5*k, 2*k, 0, t.Line2.Alpha(0.9))
	}
	g := size * 0.58
	b.Draw(func(p *ui.Painter, r ui.Rect) {
		drawPastGlyph(glyph, ink)(p, ui.Rect{X: r.X + (r.W-g)/2, Y: r.Y + (r.H-g)/2, W: g, H: g})
	})
	return b
}

// pastLine1 is the name (the person's, else the title), the star, the tags.
func (a *App) pastLine1(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	ui.Row(c.Key("l1")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
		uiText(c, keepWords(autospace(it.Title))).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(it.Title)
		m := it.Mark
		if m != nil && m.Starred {
			a.pastStar(c, it.TaskID, 14, true, t.Accent)
		}
		if m != nil {
			for _, tg := range m.Tags {
				uiText(c.Key("tag:"+tg), tg).FontSize(t.XS).FontWeight(500).TextColor(t.InkSoft).Padding(1, t.S2-1).Radius(6).
					Background(t.SurfaceSunken).SingleLine().Shrink(0)
			}
		}
	})
}

// pastStar is the star, popping (1 → 1.3 → 1) for pastStarPop after a toggle.
func (a *App) pastStar(c *ui.Context, taskID string, size float32, on bool, col ui.Color) ui.Element {
	b := ui.Box(c.Key("star")).Size(size, size).Shrink(0).AccessHidden(true).Draw(drawStar(col, on))
	if at, ok := a.past.starAt[taskID]; ok && !c.Preferences().ReduceMotion {
		if d := c.Now().Sub(at); d >= 0 && d < pastStarPop {
			f := float64(d) / float64(pastStarPop)
			s := float32(1 + 0.3*math.Sin(math.Pi*f))
			b.Scale(s, s)
			c.After(16 * time.Millisecond)
		}
	}
	return b
}

// pastLine2 is how it ended, or, while searching, where the words matched
// with them marked.
func (a *App) pastLine2(c *ui.Context, it *protocol.PastItem, terms []string) {
	t := a.T
	if h := it.Hit; h != nil && a.pastSearching() && h.Field != "name" && strings.TrimSpace(h.Text) != "" {
		label := a.L.T("past.hit." + pastHitKey(h.Field))
		ui.Row(c.Key("l2")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
			uiText(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Shrink(0)
			text := strings.Join(strings.Fields(h.Text), " ")
			spans := a.pastMarked(text, terms, h.Field == "file" || h.Field == "branch")
			ui.RichText(c, spans...).SingleLine().Shrink(1).MinWidth(0).Tooltip(text)
		})
		return
	}
	line := strings.SplitN(strings.TrimSpace(it.Outcome), "\n", 2)[0]
	if line == "" {
		return
	}
	uiText(c.Key("l2"), keepWords(autospace(line))).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().MinWidth(0).Tooltip(it.Outcome)
}

// pastHitKey is a field's label key.
func pastHitKey(f string) string {
	switch f {
	case "title":
		return "title"
	case "words", "report", "file", "branch", "tag", "brief", "project", "agent":
		return f
	}
	return "report"
}

// pastTerms are the words typed, lowercased.
func pastTerms(q string) []string {
	var out []string
	for _, w := range strings.Fields(strings.ToLower(q)) {
		if w != "" {
			out = append(out, w)
		}
	}
	return out
}

// pastMarked is text with the words typed marked, case-insensitive.
func (a *App) pastMarked(text string, terms []string, mono bool) []ui.Span {
	t := a.T
	font := ""
	if mono {
		font = t.Mono
	}
	base := ui.Span{Font: font, Size: t.SM, Color: t.InkSoft}
	low := strings.ToLower(text)
	var spans []ui.Span
	i := 0
	for i < len(text) {
		best, bl := -1, 0
		for _, w := range terms {
			if j := strings.Index(low[i:], w); j >= 0 && (best < 0 || j < best || (j == best && len(w) > bl)) {
				best, bl = j, len(w)
			}
		}
		if best < 0 || len(low) != len(text) {
			if best >= 0 && len(low) != len(text) {
				// Lowercasing changed the length: mark nothing rather than the wrong bytes.
				best = -1
			}
			s := base
			s.Text = text[i:]
			spans = append(spans, s)
			break
		}
		if best > 0 {
			s := base
			s.Text = text[i : i+best]
			spans = append(spans, s)
		}
		s := base
		s.Text, s.Color, s.Weight, s.Background, s.Radius = text[i+best:i+best+bl], t.HighlightInk, 700, t.Highlight, 3
		spans = append(spans, s)
		i += best + bl
	}
	if len(spans) == 0 {
		s := base
		s.Text = text
		spans = append(spans, s)
	}
	return spans
}

// pastMeta is the small line: project · agent · date · +a −d · merged or
// draft PR, and an ending other than done.
func (a *App) pastMeta(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	proj := it.Project
	if proj == "" {
		proj = a.L.T("past.other")
	}
	parts := nonEmpty(proj, harnessName(it.Harness), it.Computer, a.pastDate(store.ParseTime(it.UpdatedAt)))
	ui.Row(c.Key("l3")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
		ui.Row(c.Key("where")).Gap(t.S3).AlignItems(ui.Center).Shrink(1).MinWidth(0).Children(func() { // D291: each fact apart
			for _, p := range parts {
				uiText(c, p).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
			}
		})
		if ch := it.Changes; ch != nil && (ch.Adds > 0 || ch.Dels > 0) {
			ui.Row(c.Key("stat")).Gap(t.S1 + 1).Shrink(0).Children(func() {
				if ch.Adds > 0 {
					uiText(c, fmt.Sprintf("+%d", ch.Adds)).Font(t.Mono).FontSize(t.XS - 1).TextColor(t.Done.Ink).FontFeatures("tnum")
				}
				if ch.Dels > 0 {
					uiText(c, fmt.Sprintf("−%d", ch.Dels)).Font(t.Mono).FontSize(t.XS - 1).TextColor(t.Failed.Ink).FontFeatures("tnum")
				}
			})
		}
		if g := it.Integrated; g != nil {
			key := "onhand.pr.draft"
			if g.Act == "merge" {
				key = "onhand.pr.merged"
			}
			uiText(c.Key("pr"), a.L.T(key)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(0)
		}
		if f := it.From; f != nil && f.Step > 0 {
			// D391: redone from a step of another task.
			uiText(c.Key("redone"), a.L.T("past.redone", shortTitle(f.Title), f.Step)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0)
		}
		if o := it.Outside; o != nil {
			// D299: carried on from a session the person ran outside Ducter.
			uiText(c.Key("outside"), a.L.T("past.out.from", harnessName(o.Agent))).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(0)
		}
		end, ink := "", t.InkMuted
		switch {
		case it.Attention == protocol.Failed:
			end, ink = a.L.T("past.end.failed"), t.Failed.Ink
		case it.Attention == protocol.Dropped:
			end = a.L.T("past.end.dropped")
		case it.Attention == protocol.Superseded:
			end = a.L.T("past.end.superseded")
		case pastActive(it.Attention):
			end, ink = a.L.T("past.end.active"), t.InkSoft
		}
		if end != "" {
			uiText(c.Key("end"), end).FontSize(t.XS).FontWeight(600).TextColor(ink).SingleLine().Shrink(0)
		}
	})
}

// pastDate is when it was last worked on: the time today, 昨天, a weekday
// this week, else the date.
func (a *App) pastDate(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	now := a.Now()
	w := i18n.Pick(a.L, pastDates)
	switch k := pastDayDiff(at, now); {
	case k == 0:
		return i18n.Clock(at)
	case k == -1:
		return w.yesterday
	case k <= -2 && k >= -6:
		return w.weekday(at.Local().Weekday())
	}
	return i18n.Day(a.L.Lang, at, now)
}

func pastDayDiff(at, now time.Time) int {
	at, now = at.Local(), now.Local()
	a0 := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, time.Local)
	n0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	return int(math.Round(a0.Sub(n0).Hours() / 24))
}

// ---------- actions ----------

// pastActs are a card's actions: 接着做 (打开 while still on hand), 带着它开
// 新任务, and the ⋯ menu.
func (a *App) pastActs(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Shrink(0).Children(func() {
		if a.buttonFor(c, a.L.T("past.seed"), it.Title, btnText, t.ControlSM, t.Surface) {
			a.pastSeed(it)
		}
		label := a.L.T("past.continue")
		if pastActive(it.Attention) {
			label = a.L.T("past.open")
		}
		if a.buttonFor(c, label, it.Title, btnSecondary, t.ControlSM, t.Surface) {
			a.pastContinue(it, "")
		}
		a.pastMore(c, it)
	})
}

// pastMore is the card's ⋯: another agent, then the marks.
func (a *App) pastMore(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	ps := &a.past
	b := ui.Box(c.Key("more")).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(spoken(a.L, a.L.T("past.more"), it.Title)).
		Tooltip(a.L.T("past.more")).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
	b.Draw(drawMore(fg))
	starred := it.Mark != nil && it.Mark.Starred
	a.menuButton(c, b, func(m *ui.Menu) {
		m.Submenu(a.L.T("past.other.agent"), func(m *ui.Menu) {
			for _, h := range pastHarnesses {
				if h == it.Harness {
					continue
				}
				if m.Item(a.L.T("past.with", harnessName(h))).Chosen() {
					a.pastContinue(it, h)
				}
			}
		})
		m.Separator()
		if m.Item(a.L.T("past.rename")).Chosen() {
			a.openMarks(it, true)
		}
		star := a.L.T("past.star")
		if starred {
			star = a.L.T("past.unstar")
		}
		if m.Item(star).Chosen() {
			a.pastToggleStar(it)
		}
		if m.Item(a.L.T("past.tags")).Chosen() {
			a.openMarks(it, false)
		}
		if m.Item(a.L.T("past.glyph")).Chosen() {
			a.openMarks(it, false)
		}
	})
	if ps.marking == it.TaskID {
		a.marksPopover(c, b, it)
	}
}

// pastItem is the held item for a task.
func (a *App) pastItem(id string) *protocol.PastItem {
	if r := a.S.Past.Result; r != nil {
		for i := range r.Items {
			if r.Items[i].TaskID == id {
				return &r.Items[i]
			}
		}
	}
	if m := a.past.og.mark; m != nil && m.TaskID == id {
		return m // an Ongoing routine's or task's marks (ongoing.go)
	}
	return nil
}

// pastOpen opens the task as it is; Esc comes back here.
func (a *App) pastOpen(it *protocol.PastItem) {
	a.past.sheet = false
	a.OpenTask(it.TaskID)
	a.back = &returnTo{task: it.TaskID, route: RoutePast}
}

// pastContinue is 接着做 / Continue (with another agent when harness is set):
// the same task goes back to work, and opens. Still on hand: it opens.
func (a *App) pastContinue(it *protocol.PastItem, harness string) {
	if !pastActive(it.Attention) || harness != "" {
		a.send(protocol.PastContinue{T: "past_continue", TaskID: it.TaskID, Harness: harness})
	}
	a.pastOpen(it)
}

// pastSeed is 带着它开新任务 / New task from this: New task opens at the
// same place, with the chip that says whose findings go with it.
func (a *App) pastSeed(it *protocol.PastItem) {
	var at *protocol.Place
	if task := a.S.Task(it.TaskID); task != nil && task.Card != nil {
		p := task.Place()
		at = &p
	} else {
		at = &protocol.Place{Kind: "none"}
	}
	a.OpenNewTask(at)
	a.past.from = &protocol.PastFrom{TaskID: it.TaskID, Title: it.Title}
}

// pastFromID is the task New task carries findings from ("" none).
func (a *App) pastFromID() string {
	if a.past.from == nil {
		return ""
	}
	return a.past.from.TaskID
}

// pastFromChip is New task's chip: 带着「{name}」的发现, removable.
func (a *App) pastFromChip(c *ui.Context) {
	f := a.past.from
	if f == nil {
		return
	}
	t := a.T
	ui.Row(c.Key("nt-from")).Children(func() {
		ui.Row(c.Key("chip")).Height(t.Chip+2).Padding(0, t.S1, 0, t.S2).Gap(t.S2).Radius(t.RadiusXS).AlignItems(ui.Center).
			Background(t.SurfaceSunken).Shrink(1).MinWidth(0).Children(func() {
			glyph, tint := "idea", ""
			if it := a.pastItem(f.TaskID); it != nil {
				glyph = it.Kind
				if m := it.Mark; m != nil && m.Glyph != "" {
					glyph, tint = m.Glyph, firstNonEmpty(m.Tint, "clay")
				}
			}
			a.pastPebble(c, "art", glyph, tint, 20)
			uiText(c, a.L.T("past.seed.chip", shortTitle(f.Title))).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0)
			x := ui.Box(c.Key("x")).Size(22, 22).Radius(6).Shrink(0).Cursor(ui.CursorPointer).Role(ui.RoleButton).
				Label(a.L.T("past.seed.drop")).Tooltip(a.L.T("past.seed.drop")).Focusable()
			col := t.InkMuted
			if x.Hovered() {
				x.Background(t.Line)
				col = t.Ink
			}
			x.Draw(drawCross(col))
			if x.Clicked() {
				a.past.from = nil
			}
		})
	})
}

// ---------- marks ----------

func (a *App) sendMark(it *protocol.PastItem, patch protocol.PastMarkPatch) {
	// At once on the card; past_marked then says what the home kept.
	m := protocol.PastMark{}
	if it.Mark != nil {
		m = *it.Mark
		m.Tags = append([]string(nil), it.Mark.Tags...)
	}
	if patch.Name != nil {
		m.Name = *patch.Name
	}
	if patch.Starred != nil {
		m.Starred = *patch.Starred
	}
	if patch.SetTags {
		m.Tags = patch.Tags
	}
	if patch.Glyph != nil {
		m.Glyph = *patch.Glyph
	}
	if patch.Tint != nil {
		m.Tint = *patch.Tint
	}
	var mark *protocol.PastMark
	if m.Name != "" || m.Starred || len(m.Tags) > 0 || m.Glyph != "" || m.Tint != "" {
		mark = &m
	}
	store.MarkItem(it, mark)
	a.send(protocol.PastMarkReq{T: "past_mark", TaskID: it.TaskID, Patch: patch})
}

func (a *App) pastToggleStar(it *protocol.PastItem) {
	on := !(it.Mark != nil && it.Mark.Starred)
	if a.past.starAt == nil {
		a.past.starAt = map[string]time.Time{}
	}
	a.past.starAt[it.TaskID] = a.Now()
	a.sendMark(it, protocol.PastMarkPatch{Starred: &on})
}

// openMarks opens the marks popover on a card (its name field first for
// Rename).
func (a *App) openMarks(it *protocol.PastItem, rename bool) {
	ps := &a.past
	ps.focus, ps.marking, ps.markOpen = it.TaskID, it.TaskID, true
	ps.nameDraft = ""
	if it.Mark != nil {
		ps.nameDraft = it.Mark.Name
	}
	if ps.nameDraft == "" {
		ps.nameDraft = it.Title
	}
	ps.tagDraft, ps.focusName = "", rename
}

// closeMarks keeps the name typed and closes the popover.
func (a *App) closeMarks() {
	ps := &a.past
	if it := a.pastItem(ps.marking); it != nil {
		a.commitName(it)
	}
	ps.marking, ps.markOpen = "", false
}

func (a *App) commitName(it *protocol.PastItem) {
	ps := &a.past
	name := strings.TrimSpace(ps.nameDraft)
	if utf8.RuneCountInString(name) > protocol.PastNameLen {
		name = string([]rune(name)[:protocol.PastNameLen])
	}
	own := firstNonEmpty(it.Original, it.Title)
	cur := ""
	if it.Mark != nil {
		cur = it.Mark.Name
	}
	if name == own {
		name = ""
	}
	if name != cur {
		a.sendMark(it, protocol.PastMarkPatch{Name: &name})
	}
}

// cleanTag is a tag as kept: trimmed, at most PastTagLen, Latin lowercased.
func cleanTag(s string) string {
	s = strings.TrimPrefix(strings.TrimSpace(s), "#")
	s = strings.Join(strings.Fields(s), " ")
	s = strings.Map(func(r rune) rune {
		if r < unicode.MaxASCII {
			return unicode.ToLower(r)
		}
		return r
	}, s)
	if utf8.RuneCountInString(s) > protocol.PastTagLen {
		s = string([]rune(s)[:protocol.PastTagLen])
	}
	return s
}

func (a *App) addTag(it *protocol.PastItem, tag string) {
	tag = cleanTag(tag)
	if tag == "" {
		return
	}
	var tags []string
	if it.Mark != nil {
		tags = append(tags, it.Mark.Tags...)
	}
	if hasString(tags, tag) || len(tags) >= protocol.PastTagsMax {
		return
	}
	a.sendMark(it, protocol.PastMarkPatch{Tags: append(tags, tag), SetTags: true})
}

func (a *App) dropTag(it *protocol.PastItem, tag string) {
	var tags []string
	if it.Mark != nil {
		for _, x := range it.Mark.Tags {
			if x != tag {
				tags = append(tags, x)
			}
		}
	}
	a.sendMark(it, protocol.PastMarkPatch{Tags: tags, SetTags: true})
}

// marksPopover is 标记 / Mark: the name, the star, the tags with
// suggestions, the picture (ten glyphs on six tints) and No picture.
func (a *App) marksPopover(c *ui.Context, anchor ui.Element, it *protocol.PastItem) {
	t := a.T
	ps := &a.past
	ui.PopoverBase(c, anchor, &ps.markOpen, func(panel ui.Element) {
		panel.Margin(t.S2, 0, 0, 0).Width(352).Padding(t.S4).Gap(t.S4).Radius(t.RadiusLG).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(a.L.T("past.marks.about", it.Title))
		ui.Column(c.Key("marks")).Gap(t.S4).Children(func() {
			a.marksName(c, it)
			a.marksTags(c, it)
			a.marksPicture(c, it)
			ui.Row(c.Key("foot")).Children(func() {
				ui.Spacer(c)
				if a.button(c, a.L.T("past.done"), btnPrimary, t.ControlSM, t.Surface) {
					a.closeMarks()
				}
			})
		})
	})
}

func (a *App) marksLabel(c *ui.Context, key string) {
	t := a.T
	uiText(c, a.L.T(key)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
}

func (a *App) marksName(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	ps := &a.past
	starred := it.Mark != nil && it.Mark.Starred
	ui.Column(c.Key("name")).Gap(t.S2).Children(func() {
		a.marksLabel(c, "past.rename")
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Row(c.Key("field")).Height(t.ControlSM+2).Grow(1).MinWidth(0).Padding(0, t.S3).Radius(t.RadiusSM).AlignItems(ui.Center).
				Background(t.SurfaceSunken).InsetShadow(0, 1, 2, 0, t.Line).Children(func() {
				in := ui.TextInput(c.Key("name-in"), &ps.nameDraft).Placeholder(a.L.T("past.rename.ph")).Label(a.L.T("past.rename")).
					FontSize(t.MD).Grow(1).MinWidth(0).Background(ui.Color{}).Border(0, ui.Color{})
				if ps.focusName {
					in.Focus()
					ps.focusName = false
				}
				if in.Submitted() {
					a.commitName(it)
				}
			})
			// The star, its own clay button: on, in the accent.
			label := a.L.T("past.star")
			if starred {
				label = a.L.T("past.unstar")
			}
			b := ui.Box(c.Key("star-btn")).Size(t.ControlSM+2, t.ControlSM+2).Radius(t.RadiusSM).Shrink(0).Cursor(ui.CursorPointer).
				Role(ui.RoleButton).Label(label).Tooltip(label).Focusable().AccessSelected(starred)
			a.buttonLook(c, b, btnSecondary, t.ControlSM, t.Surface)
			col := t.InkMuted
			if starred {
				col = t.Accent
			}
			b.Children(func() {
				ui.Box(c).Fill().AlignItems(ui.Center).Justify(ui.Center).Children(func() {
					a.pastStar(c, it.TaskID, 18, starred, col)
				})
			})
			if b.Clicked() {
				a.pastToggleStar(it)
			}
		})
	})
}

func (a *App) marksTags(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	ps := &a.past
	var tags []string
	if it.Mark != nil {
		tags = it.Mark.Tags
	}
	ui.Column(c.Key("tags")).Gap(t.S2).Children(func() {
		a.marksLabel(c, "past.tags")
		ui.Row(c.Key("on")).Gap(t.S1 + 2).Wrap().AlignItems(ui.Center).Children(func() {
			for _, tg := range tags {
				ui.Row(c.Key("t:"+tg)).Height(26).Padding(0, 2, 0, t.S2).Gap(2).Radius(t.RadiusXS).AlignItems(ui.Center).
					Background(t.SurfaceSunken).Children(func() {
					uiText(c, tg).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).SingleLine()
					x := ui.Box(c.Key("x")).Size(20, 20).Radius(6).Cursor(ui.CursorPointer).Role(ui.RoleButton).
						Label(a.L.T("past.tag.remove", tg)).Focusable()
					col := t.InkMuted
					if x.Hovered() {
						x.Background(t.Line)
						col = t.Ink
					}
					x.Draw(drawCross(col))
					if x.Clicked() {
						a.dropTag(it, tg)
					}
				})
			}
			if len(tags) < protocol.PastTagsMax {
				ui.Row(c.Key("add")).Height(26).Width(120).Padding(0, t.S2).Radius(t.RadiusXS).AlignItems(ui.Center).
					Border(1, t.Line).BorderStyle(ui.BorderDashed).Children(func() {
					in := ui.TextInput(c.Key("tag-in"), &ps.tagDraft).Placeholder(a.L.T("past.tag.add")).Label(a.L.T("past.tag.add")).
						FontSize(t.SM).Grow(1).MinWidth(0).Background(ui.Color{}).Border(0, ui.Color{})
					if in.Submitted() {
						a.addTag(it, ps.tagDraft)
						ps.tagDraft = ""
					}
				})
			}
		})
		// Suggestions: the tags in use and the task's project.
		var sug []string
		if r := a.S.Past.Result; r != nil {
			sug = append(sug, r.Suggestions...)
		}
		if p := cleanTag(it.Project); p != "" {
			sug = append([]string{p}, sug...)
		}
		shown := 0
		ui.Row(c.Key("sug")).Gap(t.S1 + 2).Wrap().Children(func() {
			seen := map[string]bool{}
			for _, s := range sug {
				if seen[s] || hasString(tags, s) || shown >= 6 || len(tags) >= protocol.PastTagsMax {
					continue
				}
				seen[s] = true
				shown++
				b := uiText(c.Key("s:"+s), "+ "+s).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).Padding(3, t.S2).Radius(t.RadiusXS).
					Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
				if b.Hovered() {
					b.Background(t.SurfaceSunken).TextColor(t.Ink)
				}
				if b.Clicked() {
					a.addTag(it, s)
				}
			}
		})
	})
}

func (a *App) marksPicture(c *ui.Context, it *protocol.PastItem) {
	t := a.T
	var glyph, tint string
	if m := it.Mark; m != nil {
		glyph, tint = m.Glyph, m.Tint
	}
	shownTint := firstNonEmpty(tint, "clay")
	ui.Column(c.Key("pic")).Gap(t.S2 + 2).Children(func() {
		a.marksLabel(c, "past.glyph")
		ui.Row(c.Key("glyphs")).Gap(t.S2).Wrap().Children(func() {
			for _, g := range protocol.PastGlyphs {
				on := g == glyph
				name := a.L.T("past.g." + g)
				b := ui.Box(c.Key("g:"+g)).Size(52, 52).Radius(t.RadiusSM).Cursor(ui.CursorPointer).Role(ui.RoleRadio).
					Label(name).Tooltip(name).AccessSelected(on).Focusable().AlignItems(ui.Center).Justify(ui.Center)
				switch {
				case on:
					b.InsetShadow(0, 0, 0, 2, t.Ink)
				case b.Hovered():
					b.Background(t.SurfaceSunken.Mix(t.Surface, 0.4))
				}
				b.Children(func() {
					a.pastPebble(c, "p", g, shownTint, 34)
				})
				if b.Clicked() {
					v, tv := g, shownTint
					a.sendMark(it, protocol.PastMarkPatch{Glyph: &v, Tint: &tv})
				}
			}
		})
		ui.Row(c.Key("tints")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			for _, tn := range protocol.PastTints {
				on := tn == shownTint && glyph != ""
				name := a.L.T("past.t." + tn)
				col, _ := t.Tint(tn)
				b := ui.Box(c.Key("t:"+tn)).Size(26, 26).Radius(13).Cursor(ui.CursorPointer).Role(ui.RoleRadio).
					Label(name).Tooltip(name).AccessSelected(on).Focusable().Background(col.Ground).Shadow(0, 2, 0, 0, col.Ledge)
				if on {
					b.InsetShadow(0, 0, 0, 2, col.Ink)
				} else if b.Hovered() {
					b.InsetShadow(0, 0, 0, 1.5, col.Ink.Alpha(0.5))
				}
				if b.Clicked() {
					v, g := tn, firstNonEmpty(glyph, it.Kind)
					a.sendMark(it, protocol.PastMarkPatch{Glyph: &g, Tint: &v})
				}
			}
			ui.Spacer(c)
			if glyph != "" && a.button(c, a.L.T("past.glyph.none"), btnText, t.ControlSM, t.Surface) {
				none := ""
				a.sendMark(it, protocol.PastMarkPatch{Glyph: &none, Tint: &none})
			}
		})
	})
}

// ---------- keys ----------

// pastKeys: / the field; ↑↓ or j/k walk; Enter opens; ⌘Enter continues;
// ⇧⌘Enter New task from this; s stars; r renames. Esc is the window's
// (pastEsc).
func (a *App) pastKeys(c *ui.Context, field ui.Element) {
	ps := &a.past
	if a.nt.open || a.oh.sw || ps.markOpen || ps.redo.open {
		return
	}
	typing := field.Valid() && field.Focused()
	cur := a.pastItem(ps.focus)
	if cur == nil && typing && len(ps.order) > 0 {
		cur = a.pastItem(ps.order[0])
	}
	switch {
	case c.Shortcut(ui.Alt, ui.KeyEnter):
		if cur != nil {
			a.pastRedoPick(cur.TaskID) // D391: 从某一步开新任务…
		}
	case c.Shortcut(ui.Cmd|ui.Shift, ui.KeyEnter):
		if cur != nil {
			a.pastSeed(cur)
		}
	case c.Shortcut(ui.Cmd, ui.KeyEnter):
		if cur != nil {
			a.pastContinue(cur, "")
		}
	case c.Shortcut(0, ui.KeyDown):
		a.pastWalk(1)
	case c.Shortcut(0, ui.KeyUp):
		a.pastWalk(-1)
	case c.Shortcut(0, ui.KeyEnter):
		if cur != nil {
			a.pastOpen(cur)
		}
	case typing:
		return
	case c.Shortcut(0, ui.KeySlash):
		ps.focusField = true
	case c.Shortcut(0, ui.KeyJ):
		a.pastWalk(1)
	case c.Shortcut(0, ui.KeyK):
		a.pastWalk(-1)
	case c.Shortcut(0, ui.KeyS):
		if cur != nil {
			a.pastToggleStar(cur)
		}
	case c.Shortcut(0, ui.KeyR):
		if cur != nil {
			a.openMarks(cur, true)
		}
	case c.Shortcut(0, ui.KeySpace), c.Shortcut(0, ui.KeyRight):
		if cur != nil {
			// D391: where it stopped, as a sheet when it isn't beside the list.
			a.pastSelect(cur.TaskID)
			ps.sheet = true
		}
	}
}

// pastWalk moves the keys a card down (by 1) or up.
func (a *App) pastWalk(by int) {
	ps := &a.past
	o := ps.order
	if len(o) == 0 {
		return
	}
	i := -1
	for n, id := range o {
		if id == ps.focus {
			i = n
		}
	}
	switch {
	case i < 0 && by > 0:
		i = 0
	case i < 0:
		i = len(o) - 1
	default:
		i = max(0, min(len(o)-1, i+by))
	}
	ps.focus, ps.scroll = o[i], true
	a.pastSelect(o[i]) // D391: where it stopped follows the keys
}

// ---------- the ways in, drawn ----------

// pastEndLine is On hand's quiet last line, 做过的事 ›.
func (a *App) pastEndLine(c *ui.Context) {
	t := a.T
	// Quiet as On hand's fold lines, and lined up with them; 一直在跑的 n 个
	// beside it while something keeps going.
	n := a.ongoingCount()
	ui.Row(c.Key("past-end")).Gap(t.S5).Wrap().Padding(t.S2, t.S2, 0, t.S2).Children(func() { // D315: wraps, never clipped on a narrow window
		if a.quietButton(c, "past", a.L.T("past.link"), "", false, 1) {
			a.OpenPast("")
		}
		a.didLink(c, "did") // D300: 替你做过的 ›
		if n > 0 && a.quietButton(c, "ongoing", a.L.T("og.link", n), "", false, 1) {
			a.OpenOngoing()
		}
	})
}

// pastFindLink is On hand's Find with no match: look in Past tasks.
func (a *App) pastFindLink(c *ui.Context, q string) {
	if strings.TrimSpace(q) == "" {
		return
	}
	t := a.T
	ui.Row(c.Key("past-find")).Padding(t.S2, 0).Children(func() {
		if a.quietLink(c, "past-find", a.L.T("past.find.in", strings.TrimSpace(q)), a.L.T("past.title")) {
			a.OpenPast(strings.TrimSpace(q))
		}
	})
}
