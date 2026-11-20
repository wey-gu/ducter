package views

// D391: 找任何东西 / Find anything (⌘K, and ⌘O as before): the switcher
// grown into one field that finds any task, earlier or on hand, by what was
// said, a file, a branch or a PR, what Ducter made, the person's own
// sessions and the places of the app, and acts on the row the keys are on.
// No words: the tasks the app knows (what needs you, what works, the
// newest), then 去 / Go to. With words: 手头的 (matched here), 做过的 (the
// home's Past tasks search), 给你做的, 你自己做过的, 去, and always the two
// ways on: 跟 {name} 说 and 新建. ↑↓ walk; Enter is the row's first action,
// ⌘Enter 接着做, ⌥Enter 从某一步开新任务…, ⇧⌘Enter 带着它开新任务; the row's
// actions stand in the foot bar, each with its key.

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	// palRecent is how many tasks show with no words.
	palRecent = 8
	// palOnHand, palEarlier, palMade and palOwn cap each group with words.
	palOnHand  = 6
	palEarlier = 8
	palMade    = 4
	palOwn     = 3
)

type palKind int

const (
	palTask    palKind = iota // a task the app holds
	palPast                   // an earlier task, from the home's search
	palMadeRow                // something Ducter made
	palOwnRow                 // a session the person ran outside Ducter
	palGo                     // a place of the app
	palTell                   // 跟 {name} 说
	palNew                    // 新建
)

// palRow is one row of the palette.
type palRow struct {
	kind  palKind
	group string // its group's key: recent, onhand, earlier, made, own, go, ""
	key   string
	task  *store.Task
	item  *protocol.PastItem
	made  *protocol.MadeItem
	own   *protocol.OutsideItem
	place palPlace
}

// palPlace is a place the palette goes to.
type palPlace struct{ id, label, key string }

// palAct is one action on a row, with its key's name.
type palAct struct {
	id, label, keys string
	do              func()
}

// palState is the palette's asking: the words last typed and when, the
// words last sent and the id of that ask (a reply to an older one is
// dropped).
type palState struct {
	typed   string
	typedAt time.Time
	sent    string
	reqN    int
	wantID  string
	at      int
}

// palPlaces are the places 去 / Go to offers.
func (a *App) palPlaces() []palPlace {
	return []palPlace{
		{"conv", a.L.T("pal.go.conv"), "⌘1"},
		{"onhand", a.L.T("pal.go.onhand"), "⌘2"},
		{"past", a.L.T("pal.go.past"), "⌘Y"},
		{"made", a.L.T("pal.go.made"), ""},
		{"apps", a.L.T("pal.go.apps"), "⌘5"}, // D410
		{"devices", a.L.T("pal.go.devices"), "⌘3"},
		{"settings", a.L.T("pal.go.settings"), "⌘,"},
	}
}

// palAsk sends the words to the home once they rest for pastDebounce.
func (a *App) palAsk(c *ui.Context, q string) {
	p := &a.pal
	now := c.Now()
	if q != p.typed {
		p.typed, p.typedAt, p.at = q, now, 0
	}
	if q == "" || q == p.sent {
		return
	}
	if left := pastDebounce - now.Sub(p.typedAt); left > 0 {
		c.After(left)
		return
	}
	p.reqN++
	p.sent, p.wantID = q, fmt.Sprintf("%s%d", store.PaletteID, p.reqN)
	a.send(protocol.PastReq{T: "past", ID: p.wantID, Query: protocol.PastQuery{Q: q, Limit: palEarlier + palOnHand}})
	a.send(protocol.MadeReq{T: "made", ID: p.wantID, Query: protocol.MadeQuery{Q: q, Limit: palMade}})
}

// palResults are the home's answers to the words now (nil while asking).
func (a *App) palResults() (*protocol.PastFrame, *protocol.MadeFrame) {
	p := &a.pal
	if p.wantID == "" || p.sent != strings.TrimSpace(a.oh.swQuery) {
		return nil, nil
	}
	var past *protocol.PastFrame
	var made *protocol.MadeFrame
	if r := a.S.Past.Palette; r != nil && r.ID == p.wantID {
		past = r
	}
	if r := a.S.Past.PaletteMade; r != nil && r.ID == p.wantID {
		made = r
	}
	return past, made
}

// palRows are the rows for the words, in their groups' order.
func (a *App) palRows(q string) []palRow {
	var rows []palRow
	if q == "" {
		for i, x := range a.switchList("") {
			if i == palRecent {
				break
			}
			rows = append(rows, palRow{kind: palTask, group: "recent", key: "t:" + x.ID, task: x})
		}
		for _, pl := range a.palPlaces() {
			rows = append(rows, palRow{kind: palGo, group: "go", key: "go:" + pl.id, place: pl})
		}
		return rows
	}
	shown := map[string]bool{}
	for i, x := range a.switchList(q) {
		if i == palOnHand {
			break
		}
		shown[x.ID] = true
		rows = append(rows, palRow{kind: palTask, group: "onhand", key: "t:" + x.ID, task: x})
	}
	past, made := a.palResults()
	if past != nil {
		n := 0
		for i := range past.Items {
			it := &past.Items[i]
			if shown[it.TaskID] || n == palEarlier {
				continue
			}
			shown[it.TaskID] = true
			n++
			rows = append(rows, palRow{kind: palPast, group: "earlier", key: "p:" + it.TaskID, item: it})
		}
	}
	if made != nil {
		for i := range made.Items {
			if i == palMade {
				break
			}
			rows = append(rows, palRow{kind: palMadeRow, group: "made", key: "m:" + made.Items[i].ID, made: &made.Items[i]})
		}
	}
	if past != nil {
		for i := range past.Outside {
			if i == palOwn {
				break
			}
			o := &past.Outside[i]
			if o.Gone {
				continue
			}
			rows = append(rows, palRow{kind: palOwnRow, group: "own", key: "o:" + o.Agent + ":" + o.ID, own: o})
		}
	}
	low := strings.ToLower(q)
	for _, pl := range a.palPlaces() {
		if strings.Contains(strings.ToLower(pl.label), low) || strings.Contains(pl.id, low) {
			rows = append(rows, palRow{kind: palGo, group: "go", key: "go:" + pl.id, place: pl})
		}
	}
	rows = append(rows, palRow{kind: palTell, key: "tell"}, palRow{kind: palNew, key: "new"})
	return rows
}

// palClose puts the palette away.
func (a *App) palClose() {
	a.oh.sw = false
}

// palGoTo opens a place.
func (a *App) palGoTo(id string) {
	a.palClose()
	switch id {
	case "conv":
		a.Route = RouteConversation
	case "onhand":
		a.Route = RouteOnHand
	case "past":
		a.OpenPast("")
	case "made":
		a.OpenPast("")
		a.past.tab = "made"
		a.askMade()
	case "apps":
		a.OpenApps()
	case "devices":
		a.OpenDevices()
	case "settings":
		a.OpenSettings()
	}
}

// palActs are a row's actions, the first Enter's.
func (a *App) palActs(r palRow, q string) []palAct {
	var id string
	switch r.kind {
	case palTask:
		id = r.task.ID
	case palPast:
		id = r.item.TaskID
	case palMadeRow:
		it := *r.made
		return []palAct{{"open", a.L.T("pal.act.open"), "\r", func() { a.palClose(); a.madeOpen(&it, ui.Rect{}) }}}
	case palOwnRow:
		return []palAct{{"open", a.L.T("pal.act.open"), "\r", func() { a.palClose(); a.OpenPast(q) }}}
	case palGo:
		pl := r.place.id
		return []palAct{{"go", a.L.T("pal.act.go"), "\r", func() { a.palGoTo(pl) }}}
	case palTell:
		return []palAct{{"send", a.L.T("pal.act.send"), "\r", func() {
			a.palClose()
			a.Route = RouteConversation
			a.SendMessage(q)
		}}}
	case palNew:
		return []palAct{{"new", a.L.T("pal.act.new"), "\r", func() {
			a.palClose()
			a.OpenNewTask(nil)
			a.nt.words = q
		}}}
	}
	acts := []palAct{{"open", a.L.T("pal.act.open"), "\r", func() {
		a.palClose()
		if r.kind == palPast {
			if it := a.pastItemFor(id); it != nil {
				a.pastOpen(it)
				return
			}
		}
		a.OpenTask(id)
	}}}
	it := a.pastItemFor(id)
	if it == nil {
		return acts
	}
	att := it.Attention
	if !pastActive(att) {
		acts = append(acts, palAct{"continue", a.L.T("pal.act.continue"), "⌘\r", func() {
			a.palClose()
			if it := a.pastItemFor(id); it != nil {
				a.pastContinue(it, "")
			}
		}})
	}
	acts = append(acts,
		palAct{"redo", a.L.T("pal.act.redo"), "⌥\r", func() { a.palClose(); a.pastRedoPick(id) }},
		palAct{"seed", a.L.T("pal.act.seed"), "⇧⌘\r", func() {
			a.palClose()
			if it := a.pastItemFor(id); it != nil {
				a.pastSeed(it)
			}
		}})
	return acts
}

// palDo runs the row's action with that id, if it has one.
func palDo(acts []palAct, id string) bool {
	for _, x := range acts {
		if x.id == id || (id == "" && x.do != nil) {
			x.do()
			return true
		}
	}
	return false
}

// palette draws 找任何东西 / Find anything while it is open.
func (a *App) palette(c *ui.Context) {
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w = 1040
	}
	if h <= 0 {
		h = 760
	}
	q := strings.TrimSpace(a.oh.swQuery)
	a.palAsk(c, q)
	rows := a.palRows(q)
	p := &a.pal
	at := min(p.at, max(0, len(rows)-1))
	var acts []palAct
	if len(rows) > 0 {
		acts = a.palActs(rows[at], q)
	}
	// The keys are read inside the dialog: outside it a shortcut is behind
	// the dialog and never comes. It reports whether a key acted.
	keys := func() bool {
		switch {
		case c.Shortcut(ui.Cmd, ui.KeyK), c.Shortcut(ui.Cmd, ui.KeyO), c.Shortcut(0, ui.KeyEscape):
			a.palClose() // pressed again: put away
			return true
		case c.Shortcut(0, ui.KeyDown), c.Shortcut(ui.Ctrl, ui.KeyN):
			p.at = min(at+1, max(0, len(rows)-1))
		case c.Shortcut(0, ui.KeyUp), c.Shortcut(ui.Ctrl, ui.KeyP):
			p.at = max(at-1, 0)
		case c.Shortcut(ui.Cmd|ui.Shift, ui.KeyEnter):
			return palDo(acts, "seed")
		case c.Shortcut(ui.Cmd, ui.KeyEnter):
			if !palDo(acts, "continue") {
				palDo(acts, "")
			}
			return true
		case c.Shortcut(ui.Alt, ui.KeyEnter):
			return palDo(acts, "redo")
		case c.Shortcut(0, ui.KeyEnter):
			return palDo(acts, "")
		}
		return false
	}
	ui.DialogBase(c, &a.oh.sw, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		if keys() {
			return
		}
		at = min(p.at, max(0, len(rows)-1))
		if len(rows) > 0 {
			acts = a.palActs(rows[at], q)
		}
		panel.Width(min(w-2*t.S6, 680)).MaxHeight(sheetBack(c, back, h)).Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).
			Label(a.L.T("pal.label"))
		ui.Row(c.Key("pal-field")).Gap(t.S3).Padding(0, t.S5).Height(60).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Size(20, 20).Shrink(0).AccessHidden(true).Draw(drawPastGlyph("look", t.InkMuted))
			in := ui.TextInput(c.Key("pal-in"), &a.oh.swQuery).Placeholder(a.L.T("pal.placeholder")).Label(a.L.T("pal.placeholder")).
				FontSize(t.LG).Grow(1).MinWidth(0).Background(ui.Color{}).Border(0, ui.Color{}).
				OnTextKey(func(k ui.TextKey) bool {
					// ⌃N / ⌃P walk the rows, as in every palette, not the field's lines.
					if k.Mods == ui.Ctrl && (k.Key == ui.KeyN || k.Key == ui.KeyP) {
						if k.Key == ui.KeyN {
							p.at = min(p.at+1, max(0, len(rows)-1))
						} else {
							p.at = max(min(p.at, len(rows)-1)-1, 0)
						}
						return true
					}
					// Enter is the row's first action (the field would take it as its own).
					if k.Key == ui.KeyEnter && k.Mods == 0 {
						palDo(acts, "")
						return true
					}
					return false
				})
			in.Focus()
			if q != "" && q != a.pal.sent {
				uiText(c.Key("busy"), a.L.T("pal.searching")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
			}
		})
		ui.Box(c.Key("rule")).Height(1).Background(t.LineSoft)
		ui.Scroll(c.Key("pal-list")).MaxHeight(max(120, min(520, h-sheetTop(c)-sheetBottom-160))).Children(func() {
			ui.Column(c).Padding(t.S2).Gap(1).Children(func() {
				group := "-"
				for n, r := range rows {
					if r.group != group {
						group = r.group
						if group != "" {
							a.palHead(c, group)
						} else if n > 0 {
							ui.Box(c.Key(fmt.Sprintf("gap:%d", n))).Height(t.S2)
						}
					}
					a.palRowView(c.Key("row:"+r.key), r, q, n == at, func() {
						p.at = n
						if acts := a.palActs(r, q); len(acts) > 0 {
							acts[0].do()
						}
					})
				}
			})
		})
		if len(acts) > 1 || (len(acts) == 1 && rows[at].kind != palTell && rows[at].kind != palNew) {
			ui.Box(c.Key("rule2")).Height(1).Background(t.LineSoft)
			a.palFoot(c, acts)
		}
	})
}

// palHead is a group's name.
func (a *App) palHead(c *ui.Context, group string) {
	t := a.T
	key := map[string]string{"recent": "pal.g.recent", "onhand": "pal.g.onhand", "earlier": "pal.g.earlier", "made": "pal.g.made", "own": "pal.g.own", "go": "pal.g.go"}[group]
	uiText(c.Key("head:"+group), a.L.T(key)).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).Padding(t.S3, t.S3, t.S1, t.S3).SingleLine()
}

// palRowView is one row: its picture, its name, the line under it (where
// the words matched, or its story), its facts apart, and its state word.
func (a *App) palRowView(c *ui.Context, r palRow, q string, on bool, pick func()) {
	t := a.T
	title, line, hitField := "", "", ""
	var parts []string
	var att protocol.Attention
	stateWord := ""
	label := ""
	row := ui.Row(c).Gap(t.S3).Padding(t.S2+1, t.S3).Radius(t.RadiusMD).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleListItem).AccessSelected(on)
	if on || row.Hovered() {
		row.Background(t.Sunken)
	}
	switch r.kind {
	case palTask:
		x := r.task
		title = x.Title()
		att = x.Attention()
		pl := x.Place()
		parts = nonEmpty(x.Project(), pl.Branch)
		if rep := x.Report(); rep != nil {
			line = palLine(rep.Summary)
		}
		stateWord = a.stateLabel(att)
	case palPast:
		it := r.item
		title, att = it.Title, it.Attention
		if it.Hit != nil && it.Hit.Field != "title" && it.Hit.Field != "name" {
			hitField, line = it.Hit.Field, strings.Join(strings.Fields(it.Hit.Text), " ")
		} else {
			line = palLine(it.Outcome)
		}
		parts = nonEmpty(it.Project, it.Branch, it.Computer, harnessName(it.Harness), a.pastDate(store.ParseTime(it.UpdatedAt)))
		stateWord = a.palEnd(it)
	case palMadeRow:
		title = r.made.Title
		if r.made.Task != nil {
			line = r.made.Task.Title
		}
		parts = nonEmpty(a.madeKindWord(r.made), a.pastDate(store.ParseTime(r.made.At)))
	case palOwnRow:
		title = r.own.Title
		line = r.own.Ask
		parts = nonEmpty(r.own.Project, r.own.Branch, harnessName(r.own.Agent), a.pastDate(store.ParseTime(r.own.UpdatedAt)))
	case palGo:
		title = r.place.label
	case palTell:
		title = a.L.T("pal.tell", a.personaName(), q)
	case palNew:
		title = a.L.T("pal.new", q)
	}
	label = title
	row.Label(label)
	row.Children(func() {
		switch r.kind {
		case palTask:
			a.coinBox(c, "c", r.task.Harness(), 24, false, coinStill)
		case palPast:
			a.coinBox(c, "c", r.item.Harness, 24, false, coinStill)
		case palOwnRow:
			a.coinBox(c, "c", r.own.Agent, 24, true, coinStill)
		case palMadeRow:
			// Its kind's own mark, as on its card and in Made for you (a small
			// app is a small window, never a pencil: the Mac walk of 0.0.98).
			kind := r.made.Kind
			a.pastPebbleDraw(c, "art", "", 24, func(col ui.Color) func(*ui.Painter, ui.Rect) { return drawMadeKind(kind, col) })
		default:
			glyph := map[palKind]string{palGo: "look", palTell: "talk", palNew: "build"}[r.kind]
			a.pastPebble(c, "art", glyph, "", 24)
		}
		ui.Column(c.Key("main")).Grow(1).Shrink(1).MinWidth(0).Gap(2).Children(func() {
			w := 600
			if r.kind == palTell || r.kind == palNew {
				w = 700
			}
			uiText(c.Key("t"), keepWords(autospace(shortTitle(title)))).FontSize(t.MD).FontWeight(w).TextColor(t.Ink).SingleLine().MinWidth(0).Tooltip(title)
			if line != "" {
				ui.Row(c.Key("l2")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
					if hitField != "" {
						uiText(c, a.L.T("past.hit."+pastHitKey(hitField))).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Shrink(0)
						ui.RichText(c, a.pastMarked(line, pastTerms(q), hitField == "file" || hitField == "branch")...).SingleLine().Shrink(1).MinWidth(0)
					} else {
						uiText(c, keepWords(autospace(line))).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0)
					}
				})
			}
			if len(parts) > 0 {
				ui.Row(c.Key("l3")).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).Children(func() { // D291: each fact apart
					for i, p := range parts {
						tx := uiText(c.Key(fmt.Sprintf("f%d", i)), p).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
						if strings.HasPrefix(p, "ducter/") || strings.Contains(p, "/") && !strings.Contains(p, " ") {
							tx.Font(t.Mono)
						}
					}
				})
			}
		})
		if r.kind == palGo && r.place.key != "" {
			a.keycap(c, "k", r.place.key)
		}
		if stateWord != "" {
			ink := t.InkMuted
			switch att {
			case protocol.NeedsYou:
				ink = t.NeedsYou.Ink
			case protocol.Failed:
				ink = t.Failed.Ink
			}
			uiText(c.Key("st"), stateWord).FontSize(t.XS).FontWeight(700).TextColor(ink).SingleLine().Shrink(0)
		}
	})
	if on {
		row.ScrollIntoView()
	}
	if row.Clicked() {
		pick()
	}
}

// palEnd is an earlier task's state word: how it ended.
func (a *App) palEnd(it *protocol.PastItem) string {
	switch {
	case it.Attention == protocol.Failed:
		return a.L.T("past.end.failed")
	case it.Attention == protocol.Dropped:
		return a.L.T("past.end.dropped")
	case pastActive(it.Attention):
		return a.L.T("past.end.active")
	}
	return a.L.T("past.ended.done")
}

// palFoot is the row's actions, each its own button with its key.
func (a *App) palFoot(c *ui.Context, acts []palAct) {
	t := a.T
	ui.Row(c.Key("pal-foot")).Gap(t.S2).Padding(t.S2, t.S4).AlignItems(ui.Center).Wrap().Background(t.SurfaceSunken.Mix(t.Surface, 0.5)).Children(func() {
		for i, x := range acts {
			b := ui.Row(c.Key("act:"+x.id)).Height(t.ControlSM).Padding(0, t.S2+2).Gap(t.S2).Radius(a.buttonRadius(t.ControlSM)).AlignItems(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(x.label).Focusable().Shrink(0)
			kind := btnText
			if i == 0 {
				kind = btnSecondary
			}
			fg := a.buttonLook(c, b, kind, t.ControlSM, t.Surface)
			b.Children(func() {
				uiText(c, x.label).FontSize(t.SM).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
				a.keycap(c, "k", x.keys)
			})
			if b.Clicked() {
				x.do()
			}
		}
	})
}

// keycap is a key's name in a small sunk cap.
func (a *App) keycap(c *ui.Context, key, keys string) {
	if keys == "" {
		return
	}
	t := a.T
	// "\r" stands for the Return key: drawn, never a text arrow (no emoji-capable symbols, check-glyphs).
	mods, ret := strings.CutSuffix(keys, "\r")
	ui.Row(c.Key("kc:"+key)).Gap(1).Padding(1, t.S1+2).Radius(5).AlignItems(ui.Center).
		Background(t.SurfaceSunken).InsetShadow(0, -1, 0, 0, t.Line).Shrink(0).AccessHidden(true).Children(func() {
		if mods != "" {
			uiText(c.Key("m"), mods).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).SingleLine()
		}
		if ret {
			a.glyph(c.Key("r"), 12, drawReturn(t.InkMuted))
		}
	})
}

// drawReturn is the Return key's bent arrow, drawn.
func drawReturn(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx+3.5, cy-4)
		m.LineTo(cx+3.5, cy+1.5)
		m.LineTo(cx-3.5, cy+1.5)
		m.MoveTo(cx-1.5, cy-0.8)
		m.LineTo(cx-3.8, cy+1.5)
		m.LineTo(cx-1.5, cy+3.8)
		p.StrokePath(&m, 1.3, col)
	}
}

// palLine is a text's first line that has words.
func palLine(s string) string {
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			return l
		}
	}
	return ""
}
