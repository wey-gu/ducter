package views

// D285: 一直在跑的 / Ongoing, the second collection in the Past place: what
// keeps going on its own (a routine; a task resting on its own wait). Each
// card says what it is, where it stands in one line, and its latest runs as
// a row of small pebbles; its actions are Pause (a short menu) or Resume,
// Run now (Check now for a task), and the ⋯: Change when, Open, End, Mark.

import (
	"math"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// ongoingRest is how long a card takes to settle on pause and lift on resume.
const ongoingRest = 200 * time.Millisecond

type ongoingState struct {
	asked bool
	// The one menu open: pause (pauseFor) or ⋯ (moreFor); retime is Change
	// when open inside the ⋯, with its every and time.
	pauseFor, moreFor string
	pauseOpen         bool
	moreOpen          bool
	retime            bool
	reEvery, reTime   string
	// mark is the item the marks popover holds (a routine or a task, as a PastItem).
	mark *protocol.PastItem
	// hover keeps a card's actions while one of its menus is open.
	focus string
}

// OpenOngoing shows 一直在跑的 / Ongoing in the Past place.
func (a *App) OpenOngoing() {
	a.OpenPast("")
	a.past.tab = "ongoing"
	a.askOngoing()
}

func (a *App) askOngoing() {
	a.past.og.asked = true
	a.send(protocol.OngoingReq{T: "ongoing"})
}

// ongoingEsc closes an open menu first; it reports whether it did.
func (a *App) ongoingEsc() bool {
	og := &a.past.og
	if og.pauseOpen || og.moreOpen {
		og.pauseOpen, og.moreOpen, og.retime = false, false, false
		return true
	}
	return false
}

// ongoingCount is how many things keep going, from On hand: the routines
// not ended or dismissed, and the tasks with an armed wait of their own.
func (a *App) ongoingCount() int {
	if l := a.S.Past.Ongoing; l != nil {
		return len(l)
	}
	o := a.S.OnHand
	if o == nil {
		return 0
	}
	n := 0
	for _, r := range o.Routines {
		if r.State != "ended" && r.State != "dismissed" {
			n++
		}
	}
	seen := map[string]bool{}
	for _, w := range o.Waiters {
		if w.TaskID != "" && w.State == protocol.WaiterArmed && !seen[w.TaskID] {
			seen[w.TaskID] = true
			n++
		}
	}
	return n
}

// pastTabs is the place's two collections on a sunk track, the chosen the knob.
func (a *App) pastTabs(c *ui.Context) {
	t := a.T
	ps := &a.past
	const pad = float32(3)
	ui.Row(c.Key("tabs-row")).Children(func() {
		ui.Row(c.Key("tabs")).Padding(pad).Gap(2).Radius(t.RadiusSM).AlignItems(ui.Center).Background(t.SurfaceSunken).
			InsetShadow(0, 1.5, 2, 0, t.Line).Role(ui.RoleTabList).Children(func() {
			for _, tab := range []struct{ key, label string }{{"", a.L.T("past.tab")}, {"ongoing", a.L.T("og.tab")}} {
				on := ps.tab == tab.key
				b := ui.Row(c.Key("tab:"+tab.key)).Height(30).Padding(0, t.S4).Radius(t.RadiusSM - pad).AlignItems(ui.Center).
					Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(tab.label).AccessSelected(on).Focusable().Shrink(0)
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
					w := 600
					if on {
						w = 700
					}
					ui.Text(c, tab.label).FontSize(t.SM + 1).FontWeight(w).TextColor(fg).SingleLine().AccessHidden(true)
				})
				if b.Clicked() && !on {
					ps.tab = tab.key
					if tab.key == "ongoing" {
						a.askOngoing()
					} else {
						ps.focusField = true
					}
				}
			}
		})
	})
}

// ---------- the list ----------

// ongoingSections are the items by where they stand: needs you, running,
// up next (soonest first), paused.
func ongoingSections(items []protocol.OngoingItem) [4][]*protocol.OngoingItem {
	var s [4][]*protocol.OngoingItem
	for i := range items {
		it := &items[i]
		switch it.State {
		case "needs_you":
			s[0] = append(s[0], it)
		case "running":
			s[1] = append(s[1], it)
		case "paused":
			s[3] = append(s[3], it)
		default:
			s[2] = append(s[2], it)
		}
	}
	sort.SliceStable(s[2], func(i, j int) bool {
		a, b := s[2][i].NextAt, s[2][j].NextAt
		if (a == "") != (b == "") {
			return a != ""
		}
		return store.ParseTime(a).Before(store.ParseTime(b))
	})
	return s
}

func (a *App) ongoingList(c *ui.Context) {
	t := a.T
	if !a.past.og.asked && a.S.Welcomed && a.Status == client.Connected {
		a.askOngoing()
	}
	items := a.S.Past.Ongoing
	if items == nil {
		return
	}
	if len(items) == 0 {
		ui.Column(c.Key("og-empty")).Padding(t.S6, t.S5).Gap(t.S3).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).
			AlignItems(ui.Center).Children(func() {
			a.pastPebble(c, "empty-art", "repeat", "", 48)
			ui.Text(c, a.L.T("og.empty")).FontSize(t.MD).TextColor(t.InkSoft).TextAlign(ui.Center).LineHeight(1.6).MaxWidth(460)
		})
		return
	}
	names := [4]string{a.L.T("lane.needs_you"), a.L.T("og.s.running"), a.L.T("og.sec.next"), a.L.T("og.sec.paused")}
	keys := [4]string{"needs", "running", "next", "paused"}
	for i, sec := range ongoingSections(items) {
		if len(sec) == 0 {
			continue
		}
		ui.Column(c.Key("og-sec:" + keys[i])).Gap(t.S2).Children(func() {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).MinHeight(24).Padding(t.S2, t.S2, 0, t.S2).Children(func() {
				ink := t.InkMuted
				if i == 0 {
					ink = t.NeedsYou.Ink
				}
				ui.Text(c, names[i]).FontSize(t.XS).FontWeight(600).TextColor(ink)
				ui.Text(c, itoa(int64(len(sec)))).FontSize(t.XS).FontWeight(500).TextColor(t.Faint).FontFeatures("tnum")
			})
			ui.Column(c.Key("cards")).Gap(t.S2 + 2).Children(func() {
				for _, it := range sec {
					a.ongoingCard(c.Key("og:"+it.Kind+":"+it.ID), it)
				}
			})
		})
	}
}

// ongoingGlyph is the item's picture: the person's mark, else a routine's
// repeat or a task's clock.
func ongoingGlyph(it *protocol.OngoingItem) (glyph, tint string) {
	if m := it.Mark; m != nil && m.Glyph != "" {
		return m.Glyph, firstNonEmpty(m.Tint, "clay")
	}
	if it.Kind == "routine" {
		return "repeat", ""
	}
	return "watch", ""
}

func (a *App) ongoingCard(c *ui.Context, it *protocol.OngoingItem) {
	t := a.T
	og := &a.past.og
	paused := it.State == "paused"
	open := (og.pauseOpen && og.pauseFor == it.ID) || (og.moreOpen && og.moreFor == it.ID) || (a.past.markOpen && a.past.marking == it.ID)
	card := ui.Row(c).Gap(t.S3+2).Padding(t.S3+2, t.S4, t.S3+2, t.S3+2).Radius(t.RadiusLG - 4).AlignItems(ui.Center).
		Label(it.Title).Focusable()
	if paused {
		card.Background(t.Surface.Mix(t.Bg, 0.5))
	} else {
		card.Background(t.Surface)
	}
	if it.TaskID != "" {
		card.Cursor(ui.CursorPointer).Role(ui.RoleLink)
	}
	hover := card.Hovered() || open || a.past.og.focus == it.ID
	k := float32(0)
	if hover {
		k = 1
	}
	if !c.Preferences().ReduceMotion {
		k = card.AnimateTo("lift", k, t.Snappy)
		card.Translate(0, -2*k)
	}
	card.Shadow(0, 2+5*k, 6+12*k, -2, t.Ink.Alpha(0.04+0.06*k)).Shadow(0, 2+2*k, 0, 0, t.Line)
	card.Children(func() {
		// Paused, the pebble settles 2 pt and greys; resumed, it lifts back.
		rest := float32(0)
		if paused {
			rest = 1
		}
		r := rest
		glyph, tint := ongoingGlyph(it)
		ui.Box(c.Key("art-wrap")).Shrink(0).Children(func() {
			peb := a.pastPebble(c, "art", glyph, tint, pastPebble)
			if !c.Preferences().ReduceMotion {
				r = peb.AnimateTo("rest", rest, ui.Animation{Duration: ongoingRest})
			}
			peb.Translate(0, 2*r).Opacity(1 - 0.45*r)
		})
		ui.Column(c.Key("main")).Grow(1).Shrink(1).MinWidth(0).Gap(5).Children(func() {
			title := ui.Text(c, keepWords(autospace(it.Title))).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).SingleLine().MinWidth(0).Tooltip(it.Title)
			if paused {
				title.TextColor(t.InkSoft)
			}
			ink := t.InkMuted
			switch it.State {
			case "needs_you":
				ink = t.NeedsYou.Ink
			case "running":
				ink = t.Working.Ink
			}
			ui.Row(c.Key("state")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
				if it.State == "resting" || it.State == "paused" {
					a.glyph(c, 14, drawClock(t.InkMuted))
				}
				for _, p := range a.ongoingLine(it) {
					ui.Text(c, p).FontSize(t.SM).TextColor(ink).SingleLine().Shrink(1).MinWidth(0).FontFeatures("tnum")
				}
			})
			a.ongoingRuns(c, it)
		})
		if hover {
			a.ongoingActs(c, it)
		}
	})
	if card.Clicked() && it.TaskID != "" {
		a.OpenTask(it.TaskID)
		a.back = &returnTo{task: it.TaskID, route: RoutePast}
	}
}

// ongoingWhen is a time ahead: today's as the clock, else a weekday or a date with it.
func (a *App) ongoingWhen(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	if pastDayDiff(at, a.Now()) == 0 {
		return i18n.Clock(at)
	}
	return i18n.When(a.L.Lang, at, a.Now())
}

// ongoingLine is the card's one state line: its state, else how often
// it runs and when next, each its own fact (D291).
func (a *App) ongoingLine(it *protocol.OngoingItem) []string {
	switch it.State {
	case "running":
		return []string{a.L.T("og.s.running")}
	case "needs_you":
		return []string{a.L.T("og.s.needs_you")}
	case "proposed":
		return nonEmpty(it.Cadence, a.L.T("og.s.proposed"))
	case "paused":
		if it.PausedBy == "system" && it.PauseWhy != "" {
			if w := a.L.T("routine.paused." + it.PauseWhy); w != "routine.paused."+it.PauseWhy {
				return []string{w}
			}
		}
		if at := store.ParseTime(it.PausedUntil); !at.IsZero() {
			return []string{a.L.T("og.paused.until", a.ongoingWhen(at))}
		}
		return []string{a.L.T("og.paused")}
	}
	how := it.Cadence
	if it.Kind == "task" && it.EveryMs > 0 {
		how = a.hanTight(a.L.T("og.every", a.duration(time.Duration(it.EveryMs)*time.Millisecond)))
	}
	next := ""
	if at := store.ParseTime(it.NextAt); !at.IsZero() {
		next = a.L.T("og.next", a.ongoingWhen(at))
	}
	return nonEmpty(how, next)
}

// hanTight drops a space between two Chinese characters ("每 45 分钟 看一次"
// → "每 45 分钟看一次"): Chinese words run on.
func (a *App) hanTight(s string) string {
	if a.L.Lang != i18n.ZH {
		return s
	}
	r := []rune(s)
	out := make([]rune, 0, len(r))
	for i, ch := range r {
		if ch == ' ' && i > 0 && i+1 < len(r) && unicode.Is(unicode.Han, r[i-1]) && unicode.Is(unicode.Han, r[i+1]) {
			continue
		}
		out = append(out, ch)
	}
	return string(out)
}

// ongoingRuns is the latest runs, oldest first: one small pebble each, in
// its state's colours; a run with a task opens it.
func (a *App) ongoingRuns(c *ui.Context, it *protocol.OngoingItem) {
	t := a.T
	if len(it.Runs) == 0 {
		return
	}
	ui.Row(c.Key("runs")).Gap(4).AlignItems(ui.Center).Children(func() {
		for i, r := range it.Runs {
			run := r
			fill, edge := t.Done.Dot, t.Done.Strong
			switch run.State {
			case "failed":
				fill, edge = t.Failed.Dot, t.Failed.Strong
			case "skipped":
				fill, edge = ui.Color{}, t.Faint
			case "running":
				fill, edge = t.Working.Dot, t.Working.Strong
			case "looked":
				fill, edge = t.Waiting.Dot, t.Waiting.Strong
			}
			tip := spoken(a.L, a.L.T("og.run."+run.State), a.ongoingAt(store.ParseTime(run.At)), run.Line)
			b := ui.Box(c.Key("run:"+itoa(int64(i)))).Size(10, 10).Radius(3.5, 4, 3, 4).Shrink(0).Tooltip(tip).Label(tip)
			if run.State == "skipped" {
				b.Border(1.2, edge)
			} else {
				alpha := float32(1)
				if run.State == "running" && !c.Preferences().ReduceMotion {
					ph := float64(c.Now().UnixMilli()%1600) / 1600
					alpha = float32(0.55 + 0.45*(0.5+0.5*math.Sin(2*math.Pi*ph)))
					c.After(50 * time.Millisecond)
				}
				b.Background(fill.Alpha(alpha)).Shadow(0, 1.5, 0, 0, edge.Alpha(0.55*alpha))
			}
			if it.State == "paused" {
				b.Opacity(0.6)
			}
			if run.TaskID != "" {
				b.Cursor(ui.CursorPointer).Role(ui.RoleLink).Focusable()
				if b.Clicked() {
					a.OpenTask(run.TaskID)
					a.back = &returnTo{task: run.TaskID, route: RoutePast}
				}
			}
		}
		ui.Text(c, a.L.T("og.runs", len(it.Runs))).FontSize(t.XS).TextColor(t.Faint).MarginStart(t.S1).SingleLine()
	})
}

// ongoingAt is a run's moment, behind: the time today, else the day and time.
func (a *App) ongoingAt(at time.Time) string {
	if at.IsZero() {
		return ""
	}
	if pastDayDiff(at, a.Now()) != 0 {
		return a.pastDate(at) + " " + i18n.Clock(at)
	}
	return i18n.Clock(at)
}

// ---------- actions ----------

// ogButton is a text button that hands back its element (a menu's anchor).
func (a *App) ogButton(c *ui.Context, key, label, about string, open bool) (ui.Element, bool) {
	t := a.T
	h := a.controlHeight(t.ControlSM)
	b := ui.Row(c.Key("ogb:"+key)).Height(h).Padding(0, a.textPad(h)).Radius(a.buttonRadius(h)).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, label, about)).Expanded(open).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, h, t.Surface)
	if open {
		b.Background(t.Ink.Alpha(0.08))
	}
	b.Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
	})
	return b, b.Clicked()
}

// ogItem is one line of an Ongoing menu.
func (a *App) ogItem(c *ui.Context, key, label string, danger bool) bool {
	t := a.T
	ink, hov := t.Ink, t.SurfaceSunken
	if danger {
		ink, hov = t.Failed.Ink, t.Failed.Surface.Alpha(0.6)
	}
	it := ui.Text(c.Key("item:"+key), label).FontSize(t.SM).TextColor(ink).Padding(t.S2, t.S3).Radius(t.RadiusXS).
		Role(ui.RoleButton).Focusable().Cursor(ui.CursorPointer).Label(label).SingleLine()
	if it.Hovered() {
		it.Background(hov)
	}
	return it.Clicked()
}

func (a *App) ogPanel(c *ui.Context, panel ui.Element, label string, width float32) {
	t := a.T
	panel.Margin(t.S2, 0, 0, 0).Width(width).Padding(t.S1+2).Radius(t.RadiusMD).Background(t.Surface).
		Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(label)
}

// ongoingUntil is when a pause from the menu ends: "hour", "morning"
// (tomorrow 08:00 here), "week", or "" (until resumed).
func ongoingUntil(choice string, now time.Time) string {
	var at time.Time
	switch choice {
	case "hour":
		at = now.Add(time.Hour)
	case "morning":
		l := now.Local()
		at = time.Date(l.Year(), l.Month(), l.Day()+1, 8, 0, 0, 0, l.Location())
	case "week":
		at = now.Add(7 * 24 * time.Hour)
	default:
		return ""
	}
	return at.UTC().Format(time.RFC3339)
}

// ongoingAct sends an action, and shows it at once (the home's fresh list follows).
func (a *App) ongoingAct(it *protocol.OngoingItem, action, until string, trig *protocol.RoutineTrigger) {
	a.send(protocol.OngoingAct{T: "ongoing_action", Kind: it.Kind, ID: it.ID, Action: action, Until: until, Trigger: trig})
	switch action {
	case "pause":
		it.State, it.PausedUntil, it.PausedBy, it.PauseWhy, it.NextAt = "paused", until, "user", "", ""
	case "resume":
		it.State, it.PausedUntil, it.PausedBy = "resting", "", ""
	}
}

func (a *App) ongoingActs(c *ui.Context, it *protocol.OngoingItem) {
	t := a.T
	og := &a.past.og
	ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Shrink(0).Children(func() {
		if it.State != "paused" && it.State != "running" && it.State != "proposed" {
			label := a.L.T("og.run")
			if it.Kind == "task" {
				label = a.L.T("wait.look")
			}
			if _, hit := a.ogButton(c, "run", label, it.Title, false); hit {
				a.ongoingAct(it, "run_now", "", nil)
			}
		}
		if it.State == "paused" {
			if _, hit := a.ogButton(c, "resume", a.L.T("og.resume"), it.Title, false); hit {
				a.ongoingAct(it, "resume", "", nil)
			}
		} else if it.State != "proposed" {
			open := og.pauseOpen && og.pauseFor == it.ID
			b, hit := a.ogButton(c, "pause", a.L.T("og.pause"), it.Title, open)
			if hit {
				og.pauseFor, og.pauseOpen, og.moreOpen = it.ID, !open, false
			}
			if og.pauseFor == it.ID {
				ui.PopoverBase(c, b, &og.pauseOpen, func(panel ui.Element) {
					a.ogPanel(c, panel, a.L.T("og.pause"), 220)
					for _, ch := range []string{"hour", "morning", "week", "open"} {
						if a.ogItem(c, ch, a.L.T("og.pause."+ch), false) {
							og.pauseOpen = false
							a.ongoingAct(it, "pause", ongoingUntil(ch, a.Now()), nil)
						}
					}
				})
			}
		}
		a.ongoingMore(c, it)
	})
}

// ongoingMore is the card's ⋯: Change when (a time routine), Open, End
// (Stop checking for a task), and Mark.
func (a *App) ongoingMore(c *ui.Context, it *protocol.OngoingItem) {
	t := a.T
	og := &a.past.og
	ps := &a.past
	open := og.moreOpen && og.moreFor == it.ID
	b := ui.Box(c.Key("more")).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(spoken(a.L, a.L.T("past.more"), it.Title)).
		Tooltip(a.L.T("past.more")).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Expanded(open).Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
	b.Draw(drawMore(fg))
	if b.Clicked() {
		og.moreFor, og.moreOpen, og.pauseOpen, og.retime = it.ID, !open, false, false
	}
	if og.moreFor == it.ID {
		timed := it.Kind == "routine" && it.Trigger != nil && it.Trigger.Kind == "time"
		ui.PopoverBase(c, b, &og.moreOpen, func(panel ui.Element) {
			w := float32(240)
			if og.retime {
				w = 380
			}
			a.ogPanel(c, panel, a.L.T("past.more"), w)
			if timed {
				if og.retime {
					a.ongoingRetime(c, it)
				} else if a.ogItem(c, "retime", a.L.T("og.retime"), false) {
					tr := it.Trigger
					og.retime, og.reEvery, og.reTime = true, firstNonEmpty(tr.Every, "day"), firstNonEmpty(tr.Time, "09:00")
				}
			}
			if it.TaskID != "" && a.ogItem(c, "open", a.L.T("og.open"), false) {
				og.moreOpen = false
				a.OpenTask(it.TaskID)
				a.back = &returnTo{task: it.TaskID, route: RoutePast}
			}
			if a.ogItem(c, "mark", a.L.T("past.mark"), false) {
				og.moreOpen = false
				og.mark = ongoingAsPast(it)
				a.openMarks(og.mark, false)
				ps.focus = ""
			}
			end := a.L.T("og.end")
			if it.Kind == "task" {
				end = a.L.T("wait.cancel")
			}
			ui.Box(c.Key("rule")).Height(1).Margin(t.S1, t.S2).Background(t.LineSoft)
			if a.ogItem(c, "end", end, true) {
				og.moreOpen = false
				a.ongoingAct(it, "end", "", nil)
			}
		})
	}
	if ps.markOpen && ps.marking == it.ID && og.mark != nil {
		a.marksPopover(c, b, og.mark)
	}
}

// ongoingAsPast is an Ongoing item as the marks popover holds it.
func ongoingAsPast(it *protocol.OngoingItem) *protocol.PastItem {
	p := &protocol.PastItem{TaskID: it.ID, Title: it.Title, Project: it.Project, Kind: "repeat"}
	if it.Kind == "task" {
		p.Kind = "watch"
	}
	if it.Mark != nil {
		m := *it.Mark
		p.Mark = &m
		if m.Name != "" {
			p.Title = m.Name
		}
	}
	return p
}

// ongoingRetime is Change when, inline: every day, weekdays, every week or
// every few hours, a time, and Save.
func (a *App) ongoingRetime(c *ui.Context, it *protocol.OngoingItem) {
	t := a.T
	og := &a.past.og
	ui.Column(c.Key("retime")).Gap(t.S3).Padding(t.S2, t.S2, t.S1, t.S2).Children(func() {
		ui.Text(c, a.L.T("og.retime")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		ui.Row(c.Key("every")).Gap(t.S1 + 2).Wrap().Role(ui.RoleRadioGroup).Children(func() {
			for _, e := range []string{"day", "weekday", "week", "hours"} {
				if a.choice(c, "e:"+e, a.L.T("og.e."+e), og.reEvery == e, "") {
					og.reEvery = e
				}
			}
		})
		ui.Row(c.Key("time")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			if og.reEvery != "hours" {
				ui.Row(c.Key("field")).Height(t.ControlSM).Width(96).Padding(0, t.S3).Radius(t.RadiusSM).AlignItems(ui.Center).
					Background(t.SurfaceSunken).InsetShadow(0, 1, 2, 0, t.Line).Children(func() {
					a.glyph(c, 14, drawClock(t.InkMuted))
					ui.TextInput(c.Key("time-in"), &og.reTime).Label(a.L.T("og.retime")).FontSize(t.MD).FontFeatures("tnum").Grow(1).MinWidth(0).
						Padding(0, 0, 0, t.S2).Background(ui.Color{}).Border(0, ui.Color{})
				})
			}
			ui.Spacer(c)
			if a.button(c, a.L.T("og.retime.save"), btnPrimary, t.ControlSM, t.Surface) {
				tr := *it.Trigger
				tr.Every, tr.Time, tr.TZ = og.reEvery, strings.TrimSpace(og.reTime), localZone()
				if tr.Zone == "" {
					tr.Zone = "local"
				}
				switch og.reEvery {
				case "week":
					if len(tr.Days) == 0 {
						tr.Days = []int{1}
					}
				case "hours":
					if tr.Hours == 0 {
						tr.Hours = 4
					}
					tr.Time = "00:00"
				default:
					tr.Days = nil
				}
				og.moreOpen, og.retime = false, false
				a.ongoingAct(it, "retime", "", &tr)
			}
		})
	})
}
