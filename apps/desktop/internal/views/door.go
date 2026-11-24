package views

// D535: every needs-you count is a door, and On hand opens on its overview.
//
// A count that says "needs you" (the conversation's 「n 个等你」, a
// partner's pebble in the list of partners, the line pinned over the
// composer, the mini window's count) opens the next of its items, in 等你's
// own order: a question of the partner's own that stands in the
// conversation is scrolled to there and deepens once; everything else is
// On hand's overview (a Keep's page closed, no filter, a lens that holds
// it) with the item focused, scrolled to and deepening once. A second tap
// goes to the next; after the last, the first again.
//
// The drill-ins are true to the place shown: a Keep's page lives only while
// On hand is shown, so On hand never opens on a page left open an hour ago;
// a deep link (a Keep's card in the conversation, ⌘K, a notification)
// opens the page straight. The way back is the header's breadcrumb, never a
// link inside the page.

import (
	"time"

	"github.com/egoist/mygo/ui"
)

// doorState is the last item a count's door opened, and the one being
// found now (scrolled to once, deepening for the find's length).
type doorState struct {
	last   string
	target string
	at     time.Time
	scroll bool
}

// key is an item's name for the door: its task, its line, its question.
func (it needItem) key() string {
	switch {
	case it.group != "":
		return "g:" + it.group
	case it.dec != nil:
		return "d:" + it.dec.DecisionID
	case it.ask != nil:
		return "a:" + it.ask.DecisionID
	case it.task != nil:
		return "t:" + it.task.ID
	}
	return ""
}

// doorItems are a count's items in the order 等你 draws them (a stopped
// line, the partner's own questions, another partner's, then the tasks):
// partner "" is the person's one count, else that partner's part of it.
func (a *App) doorItems(partner string) []needItem {
	all := a.needsYou()
	var lines, decs, asks, tasks []needItem
	for _, it := range all {
		if partner != "" && it.partner != partner {
			continue
		}
		switch {
		case it.group != "":
			lines = append(lines, it)
		case it.dec != nil:
			decs = append(decs, it)
		case it.ask != nil:
			asks = append(asks, it)
		default:
			tasks = append(tasks, it)
		}
	}
	return append(append(append(lines, decs...), asks...), tasks...)
}

// barDoorPartner is whose items the conversation's line opens: with more
// than one partner the shown one's (the line sits under its name), else all.
func (a *App) barDoorPartner() string {
	if a.manyPartners() {
		return a.shownPartnerID()
	}
	return ""
}

// nextDoor is the item after the one last opened (the first when that one
// is gone or was the last).
func nextDoor(items []needItem, last string) int {
	for i, it := range items {
		if it.key() == last {
			return (i + 1) % len(items)
		}
	}
	return 0
}

// openDoor opens the next item of a count; it says whether there was one.
func (a *App) openDoor(partner string) bool {
	items := a.doorItems(partner)
	if len(items) == 0 {
		return false
	}
	it := items[nextDoor(items, a.door.last)]
	a.door.last = it.key()
	a.goToItem(it)
	return true
}

// goToItem brings one item into view where it lives.
func (a *App) goToItem(it needItem) {
	now := a.Now()
	// The partner's own question, where the conversation draws it as a card.
	if d := it.dec; d != nil && d.TaskID == "" && a.inConversation(d.Seq) {
		a.closeKeep()
		a.planJump = d.Seq // takePlanJump scrolls to it and starts the find
		a.Route = RouteConversation
		a.door = doorState{last: a.door.last, target: it.key(), at: now}
		return
	}
	a.closeKeep()
	a.oh.filter, a.oh.find = 0, ""
	a.oh.focus = ""
	if it.task != nil {
		a.oh.focus = it.task.ID
	}
	// The lens kept on this Mac stays when it holds the item; else All.
	if l := a.Local.Lens(); l != "" {
		holds := it.task != nil && lensOf(it.task) == l
		if !holds && !(l == lensOther && (it.dec != nil || it.ask != nil)) {
			a.Local.SetLens("")
		}
	}
	a.door = doorState{last: a.door.last, target: it.key(), at: now, scroll: true}
	if a.Route != RouteOnHand {
		a.Route = RouteOnHand
		a.markRead()
	}
}

// inConversation: the conversation draws a row for this seq.
func (a *App) inConversation(seq int64) bool {
	if seq == 0 {
		return false
	}
	for _, r := range a.rows() {
		if e := r.entry; e != nil && (e.FirstSeq == seq || e.Event.Seq == seq) {
			return true
		}
	}
	return false
}

// doorFound is how far an On hand item the door opened is found (0 none …
// 1 deepest), on the find's curve; it scrolls the item into view once.
func (a *App) doorFound(c *ui.Context, e ui.Element, key string) float32 {
	d := &a.door
	if d.target == "" || d.target != key {
		return 0
	}
	k, on := findCurve(a.Now().Sub(d.at), a.T.Reply.FoundDur)
	if !on {
		// Past the find (or never drawn in it): nothing left to scroll to later.
		d.target, d.scroll = "", false
		return 0
	}
	if d.scroll {
		d.scroll = false
		an := ui.Smooth
		opts := ui.ScrollIntoViewOptions{Block: ui.ScrollCenter, Animation: &an}
		if c.Preferences().ReduceMotion {
			opts.Animation = nil
		}
		e.ScrollIntoView(opts)
	}
	c.After(16 * time.Millisecond)
	return k
}

// doorRow marks a row of a sheet the door opened: its tint deepens to the
// needs-you surface and settles (the colour only under Reduce Motion, as
// the conversation's find).
func (a *App) doorRow(c *ui.Context, e ui.Element, key string) {
	if k := a.doorFound(c, e, key); k > 0 {
		e.Background(a.T.NeedsYou.Surface.Alpha(k))
	}
}

// doorCard marks a card the door opened: its edge deepens once and it
// lifts a little, as a plan card found from On hand.
func (a *App) doorCard(c *ui.Context, e ui.Element, key string) {
	t := a.T
	if k := a.doorFound(c, e, key); k > 0 {
		e.Border(1.5+1.5*k, t.NeedsYou.Ledge.Mix(t.NeedsYou.Ink, 0.6*k))
		if !c.Preferences().ReduceMotion {
			s := 1 + 0.012*k
			e.Scale(s, s)
		}
	}
}

// findCurve is the find's shape at el into dur: it deepens to the first
// fifth, holds past the half, and settles by the end.
func findCurve(el, dur time.Duration) (float32, bool) {
	if el < 0 || el >= dur || dur <= 0 {
		return 0, false
	}
	x := float32(el) / float32(dur)
	switch {
	case x < 0.22:
		return easeWave(float64(x/0.22) / 2), true
	case x < 0.55:
		return 1, true
	default:
		return easeWave(0.5 + float64((x-0.55)/0.45)/2), true
	}
}

// doorOutOfView: something the conversation's count counts is not on
// screen now (a task's item always lives in On hand; a question is out of
// view when its card's row isn't among the rows shown).
func (a *App) doorOutOfView(items []needItem, rows []row) bool {
	if len(items) == 0 {
		return false
	}
	first, last := a.list.Visible()
	for _, it := range items {
		if it.dec == nil || it.dec.TaskID != "" {
			return true
		}
		i := -1
		for n, r := range rows {
			if e := r.entry; e != nil && (e.FirstSeq == it.dec.Seq || e.Event.Seq == it.dec.Seq) {
				i = n
			}
		}
		if i < 0 || i < first || i > last {
			return true
		}
	}
	return false
}

// doorLine is the quiet line pinned over the composer while something waits
// on the person and is out of view: 「有 n 个等你定 ›」, a tap the door.
func (a *App) doorLine(c *ui.Context, rows []row) {
	if !a.S.Welcomed {
		return
	}
	p := a.barDoorPartner()
	items := a.doorItems(p)
	if !a.doorOutOfView(items, rows) {
		return
	}
	ui.Row(c.Key("door-line")).Justify(ui.Center).Padding(a.T.S1, 24, a.T.S2, 24).Children(func() {
		ui.Row(c).Grow(1).MaxWidth(convWidth).Children(func() {
			if a.needsDoor(c, "conv", a.L.T("door.line", len(items)), a.L.T("door.line.about")) {
				a.openDoor(p)
			}
		})
	})
}

// keepCrumb is the open Keep's name for the breadcrumb's last step, cut at
// a word's end; ok while a Keep's page is open.
func (a *App) keepCrumb() (string, bool) {
	id := a.oh.keep.open
	if id == "" {
		return "", false
	}
	title := ""
	if k := a.S.KeepPages[id]; k != nil {
		title = k.Title
	}
	if s := a.keepSheetByID(id); title == "" && s != nil {
		title = s.Title
	}
	if title == "" {
		title = a.L.T("keep.section")
	}
	return sayWords(title, keepCrumbCols), true
}

// keepCrumbCols is how much of a Keep's title the breadcrumb says (Han
// counts two): the bar's room beside the places at 1000 points.
const keepCrumbCols = 40

// settleNav keeps the drill-ins true to the place shown: once On hand is
// left (the conversation, a task, Devices, Settings, Past), a Keep's page
// open there closes, so On hand opens on its overview next time.
func (a *App) settleNav() {
	if a.Route != RouteOnHand && a.oh.keep.open != "" {
		a.closeKeep()
	}
}
