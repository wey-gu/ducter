package views

// D383: 给你做的 / Made for you (design/made.md), Past tasks' middle tab:
// what the partner and its tasks made for the person (files, pictures,
// tables, charts, lists, links), found by a name, a kind, a time or what
// is in it. Each opens with what already opens it: a file in the viewer
// (D239), a picture in the picture viewer (D206), a file on a computer
// through file_open (D356), a block drawn again under its card (D303), a
// link in the browser. The same words and pieces as the web's made.tsx.

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// madeTile is a card's face: a picture's thumbnail, a file's badge, a drawn kind.
const madeTile = 40

// madeState is the tab's own state; its words are Past's (ps.q).
type madeState struct {
	kind  string
	sent  string
	asked bool
	reqN  int
	reqID string
	typed string
	at    time.Time
	// open is the block drawn again under its card (its id).
	open string
}

var prURL = regexp.MustCompile(`^https://github\.com/[^/]+/[^/]+/pull/\d+`)

func (a *App) madeKey() string { return strings.TrimSpace(a.past.q) + "\x00" + a.past.made.kind }

// askMade sends the tab's query now.
func (a *App) askMade() {
	ms := &a.past.made
	ms.reqN++
	ms.reqID = fmt.Sprintf("made%d", ms.reqN)
	ms.sent, ms.asked = a.madeKey(), true
	a.send(protocol.MadeReq{T: "made", ID: ms.reqID, Query: protocol.MadeQuery{Q: strings.TrimSpace(a.past.q), Kind: ms.kind}})
}

// madeAsk sends the query once the words rest for pastDebounce, at once for a chip.
func (a *App) madeAsk(c *ui.Context) {
	ms := &a.past.made
	now := c.Now()
	if a.past.q != ms.typed {
		ms.typed, ms.at = a.past.q, now
	}
	key := a.madeKey()
	if ms.asked && key == ms.sent {
		return
	}
	kindOnly := ms.asked && strings.SplitN(key, "\x00", 2)[0] == strings.SplitN(ms.sent, "\x00", 2)[0]
	if ms.asked && !kindOnly {
		if left := pastDebounce - now.Sub(ms.at); left > 0 {
			c.After(left)
			return
		}
	}
	a.askMade()
}

// madeResult is the newest answer (while one for new words is on its way, the last stays).
func (a *App) madeResult() *protocol.MadeFrame { return a.S.Past.Made }

// madeTab is the tab: its line, the field (Past's words), the chips, the cards.
func (a *App) madeTab(c *ui.Context) ui.Element {
	t := a.T
	a.madeAsk(c)
	res := a.madeResult()
	name := firstNonEmpty(a.defaultName(), "Ducter")
	uiText(c.Key("made-line"), a.L.T("made.line", name)).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5).MaxWidth(560).Padding(0, t.S1)
	var rng *protocol.PastRange
	if res != nil {
		rng = res.Range
	}
	field := a.pastField(c, &protocol.PastFrame{Range: rng})
	if res != nil && (len(res.Kinds) > 1 || a.past.made.kind != "") {
		a.madeChips(c, res)
	}
	a.madeList(c, res, name)
	return field
}

func (a *App) madeChips(c *ui.Context, res *protocol.MadeFrame) {
	t := a.T
	ms := &a.past.made
	type chip struct{ kind, label string }
	chips := []chip{{"", a.L.T("made.all")}}
	seen := false
	for _, k := range res.Kinds {
		chips = append(chips, chip{k.Kind, a.L.T("made.c." + k.Kind)})
		seen = seen || k.Kind == ms.kind
	}
	if !seen && ms.kind != "" {
		chips = append(chips, chip{ms.kind, a.L.T("made.c." + ms.kind)})
	}
	const pad = float32(3)
	ui.Row(c.Key("made-chips-row")).Children(func() {
		ui.Row(c.Key("made-chips")).Padding(pad).Gap(2).Radius(t.RadiusSM).AlignItems(ui.Center).Background(t.SurfaceSunken).
			InsetShadow(0, 1.5, 2, 0, t.Line).Role(ui.RoleTabList).Label(a.L.T("made.tab")).Children(func() {
			for _, ch := range chips {
				on := ch.kind == ms.kind
				b := ui.Row(c.Key("mchip:"+ch.kind)).Height(28).Padding(0, t.S3).Radius(t.RadiusSM - pad).AlignItems(ui.Center).
					Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(ch.label).AccessSelected(on).Focusable().Shrink(0)
				fg := t.InkSoft
				switch {
				case on:
					a.knob(b)
					fg = t.Ink
				case b.Hovered():
					b.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
					fg = t.Ink
				}
				w := 500
				if on {
					w = 700
				}
				b.Children(func() {
					uiText(c, ch.label).FontSize(t.SM).FontWeight(w).TextColor(fg).SingleLine().AccessHidden(true)
				})
				if b.Clicked() {
					if on {
						ms.kind = ""
					} else {
						ms.kind = ch.kind
					}
				}
			}
		})
	})
}

// madeGroups puts items under Past's own groups by when they were made.
func (a *App) madeGroups(items []protocol.MadeItem) []struct {
	key, name string
	items     []*protocol.MadeItem
} {
	// Past's grouping works on PastItems: map each to one by its time, keep the order.
	ps := make([]protocol.PastItem, len(items))
	for i, it := range items {
		ps[i] = protocol.PastItem{TaskID: it.ID, UpdatedAt: it.At}
	}
	byID := map[string]*protocol.MadeItem{}
	for i := range items {
		byID[items[i].ID] = &items[i]
	}
	var out []struct {
		key, name string
		items     []*protocol.MadeItem
	}
	for _, g := range pastGroups(a.L, ps, a.Now()) {
		var xs []*protocol.MadeItem
		for _, p := range g.items {
			xs = append(xs, byID[p.TaskID])
		}
		out = append(out, struct {
			key, name string
			items     []*protocol.MadeItem
		}{g.key, g.name, xs})
	}
	return out
}

func (a *App) madeList(c *ui.Context, res *protocol.MadeFrame, name string) {
	t := a.T
	if res == nil {
		return
	}
	terms := pastTerms(a.past.q)
	if len(res.Items) == 0 {
		words, key := a.L.T("made.none", name), "none"
		if !a.pastSearching() && a.past.made.kind == "" {
			words, key = a.L.T("made.empty", name), "empty"
		}
		ui.Column(c.Key("made-"+key)).Padding(t.S6, t.S5).Gap(t.S3).Radius(t.RadiusXL).Border(2, t.Line).BorderStyle(ui.BorderDashed).
			AlignItems(ui.Center).Children(func() {
			a.madeDrawn(c, "empty-art", "table", 48)
			uiText(c, words).FontSize(t.MD).TextColor(t.InkSoft).TextAlign(ui.Center).LineHeight(1.6).MaxWidth(420)
		})
		return
	}
	section := func(key, title string, n int, items []*protocol.MadeItem) {
		ui.Column(c.Key("msec:" + key)).Gap(t.S2).Children(func() {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).MinHeight(24).Padding(t.S2, t.S2, 0, t.S2).Children(func() {
				uiText(c, title).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
				if n > 0 {
					uiText(c, fmt.Sprint(n)).FontSize(t.XS).FontWeight(500).TextColor(t.Faint).FontFeatures("tnum")
				}
			})
			ui.Column(c.Key("cards")).Gap(t.S2 + 2).Children(func() {
				for _, it := range items {
					a.madeCard(c.Key("mcard:"+it.ID), it, terms)
				}
			})
		})
	}
	if a.pastSearching() {
		items := make([]*protocol.MadeItem, len(res.Items))
		for i := range res.Items {
			items[i] = &res.Items[i]
		}
		section("found", a.L.T("made.n", res.Total), 0, items)
		return
	}
	for _, g := range a.madeGroups(res.Items) {
		section(g.key, g.name, len(g.items), g.items)
	}
}

// madeKindWord is what a card says it is: a file's own badge (PDF, MD), PR
// for a pull request, else the kind's word.
func (a *App) madeKindWord(it *protocol.MadeItem) string {
	switch it.Kind {
	case "file":
		if b := madeRef(it).Badge(); b != "" {
			return b
		}
	case "link":
		if prURL.MatchString(it.URL) {
			return "PR"
		}
	}
	return a.L.T("made.k." + it.Kind)
}

// madeRef is the ref a file's badge is drawn from (a path has only its name).
func madeRef(it *protocol.MadeItem) protocol.MediaRef {
	if it.Media != nil {
		return *it.Media
	}
	return protocol.MediaRef{Name: firstNonEmpty(it.Title, protocol.FileLinkName(it.Path))}
}

func (a *App) madeCard(c *ui.Context, it *protocol.MadeItem, terms []string) {
	t := a.T
	ms := &a.past.made
	open := ms.open == it.ID
	title := firstNonEmpty(it.Title, a.madeKindWord(it))
	var main ui.Element
	ui.Column(c).Radius(t.RadiusLG-4).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).Clip().Children(func() { // the row's highlight keeps the card's corners
		main = ui.Row(c.Key("main")).Gap(t.S3+2).Padding(t.S3+2, t.S4, t.S3+2, t.S3+2).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(title).Focusable()
		if main.Hovered() {
			main.Background(t.SurfaceSunken.Mix(t.Surface, 0.6))
		}
		main.Children(func() {
			a.madeFace(c, it)
			ui.Column(c.Key("body")).Grow(1).Shrink(1).MinWidth(0).Gap(4).Children(func() {
				ui.Row(c.Key("l1")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
					uiText(c, keepWords(autospace(title))).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0).Tooltip(title)
					if it.Pinned {
						uiText(c.Key("pinned"), a.L.T("made.pinned")).FontSize(t.XS).FontWeight(600).TextColor(t.HighlightInk).Padding(1, t.S2-1).Radius(6).
							Background(t.Highlight).SingleLine().Shrink(0)
					}
				})
				a.madeLine2(c, it, terms)
				var size string
				if it.Media != nil && it.Media.Bytes > 0 {
					size = protocol.SizeWords(it.Media.Bytes)
				}
				ui.Row(c.Key("l3")).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).Children(func() { // D291: each fact apart
					for _, p := range nonEmpty(a.madeKindWord(it), size, a.pastDate(store.ParseTime(it.At))) {
						uiText(c, p).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
					}
				})
			})
			if it.Task != nil && it.Task.TaskID != "" {
				if a.quietButton(c, "task:"+it.ID, a.L.T("made.task"), title, false, 1) {
					a.OpenTask(it.Task.TaskID)
				}
			}
		})
		if open && it.Block != nil {
			ui.Column(c.Key("block")).Padding(0, t.S4, t.S4, t.S3+2+madeTile+t.S3+2).MinWidth(0).Children(func() {
				idx := 0
				if parts := strings.Split(it.ID, ":"); len(parts) == 3 {
					fmt.Sscan(parts[2], &idx)
				}
				a.richBlock(c, it.Block, richAt{key: "made:" + it.ID, seq: it.Seq, index: idx})
			})
		}
	})
	if main.Clicked() {
		a.madeOpen(it, main.Bounds())
	}
}

// madeLine2 says why it came up, else what it answered, else which task made it.
func (a *App) madeLine2(c *ui.Context, it *protocol.MadeItem, terms []string) {
	t := a.T
	if h := it.Hit; h != nil && strings.TrimSpace(h.Text) != "" {
		ui.Row(c.Key("l2")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
			uiText(c, a.L.T("made.hit."+h.Field)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Shrink(0)
			text := strings.Join(strings.Fields(h.Text), " ")
			ui.RichText(c, a.pastMarked(text, terms, false)...).SingleLine().Shrink(1).MinWidth(0).Tooltip(text)
		})
		return
	}
	line := ""
	switch {
	case it.Ask != "":
		line = a.L.T("made.asked", it.Ask)
	case it.Task != nil && it.Task.Title != "":
		line = a.L.T("made.from", it.Task.Title)
	case it.Block != nil:
		line = a.L.T("made.inconv")
	}
	if line != "" {
		uiText(c.Key("l2"), keepWords(autospace(line))).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().MinWidth(0).Tooltip(line)
	}
}

// madeFace is the tile: a picture's thumbnail, a file's badge, a drawn kind.
func (a *App) madeFace(c *ui.Context, it *protocol.MadeItem) {
	t := a.T
	switch {
	case it.Kind == "picture" && it.Media != nil:
		ui.Box(c.Key("face")).Size(madeTile, madeTile).Shrink(0).Radius(12).Clip().Background(t.SurfaceSunken).AccessHidden(true).Children(func() {
			if pv := a.preview(it.Media); pv != nil {
				ui.Image(c, pv).Size(madeTile, madeTile).Fit(ui.Cover).Absolute().Left(0).Top(0).AccessHidden(true)
			}
			if p := a.picture(it.Media.ThumbPath()); p.bmp != nil {
				ui.Image(c.Key("img"), p.bmp).Size(madeTile, madeTile).Fit(ui.Cover).Absolute().Left(0).Top(0).AccessHidden(true)
			}
		})
	case it.Kind == "file" || it.Kind == "picture":
		ui.Row(c.Key("face")).Size(madeTile, madeTile).Shrink(0).Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			a.fileBadge(c, madeRef(it), 28)
		})
	default:
		a.madeDrawn(c, "face", it.Kind, madeTile)
	}
}

// madeDrawn is a kind drawn in muted ink pressed into the sunken ground.
func (a *App) madeDrawn(c *ui.Context, key, kind string, size float32) {
	t := a.T
	k := size / 40
	ink := t.InkMuted
	if kind == "table" || kind == "chart" || kind == "list" {
		ink = t.InkSoft
	}
	ui.Box(c.Key(key)).Size(size, size).Shrink(0).AccessHidden(true).Radius(12*k, 14*k, 11*k, 13*k).Background(t.SurfaceSunken).
		InsetShadow(0, 1.5*k, 2*k, 0, t.Line2.Alpha(0.9)).Draw(func(p *ui.Painter, r ui.Rect) {
		g := size * 0.56
		drawMadeKind(kind, ink)(p, ui.Rect{X: r.X + (r.W-g)/2, Y: r.Y + (r.H-g)/2, W: g, H: g})
	})
}

// drawMadeKind draws a table, a chart, a list or a link on a 20-point grid.
func drawMadeKind(kind string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := min(r.W, r.H) / 20
		P := func(x, y float32) (float32, float32) { return r.X + x*s, r.Y + y*s }
		var m ui.Path
		mv := func(x, y float32) { m.MoveTo(P(x, y)) }
		ln := func(x, y float32) { m.LineTo(P(x, y)) }
		w := 1.6 * s
		switch kind {
		case "table":
			x0, y0 := P(3, 4.5)
			roundRect(&m, x0, y0, 14*s, 11*s, 1.6*s)
			mv(3, 8.2)
			ln(17, 8.2)
			mv(3, 11.8)
			ln(17, 11.8)
			mv(8.5, 4.5)
			ln(8.5, 15.5)
		case "chart":
			mv(3.5, 16)
			ln(16.5, 16)
			mv(6, 16)
			ln(6, 11)
			mv(10, 16)
			ln(10, 6)
			mv(14, 16)
			ln(14, 9)
		case "list":
			mv(3.5, 6.2)
			ln(4.9, 7.6)
			ln(7.2, 5)
			mv(3.5, 11.7)
			ln(4.9, 13.1)
			ln(7.2, 10.5)
			mv(10, 6.3)
			ln(16.5, 6.3)
			mv(10, 11.8)
			ln(16.5, 11.8)
			mv(10, 15.6)
			ln(16.5, 15.6)
		case "app": // a small window: its frame, its bar, two rows
			x0, y0 := P(3.5, 4)
			roundRect(&m, x0, y0, 13*s, 12*s, 3*s)
			mv(3.5, 7.6)
			ln(16.5, 7.6)
			mv(6.5, 10.6)
			ln(10.5, 10.6)
			mv(6.5, 13)
			ln(13.5, 13)
		default: // a link: two rounded links
			x0, y0 := P(2.6, 7.4)
			roundRect(&m, x0, y0, 8.4*s, 5.2*s, 2.6*s)
			x1, y1 := P(9, 7.4)
			roundRect(&m, x1, y1, 8.4*s, 5.2*s, 2.6*s)
		}
		p.StrokePath(&m, w, col)
	}
}

// madeOpen opens a thing with what already opens it.
func (a *App) madeOpen(it *protocol.MadeItem, from ui.Rect) {
	switch {
	case it.App != nil:
		a.openApp(it.App.ID) // D405: its own window
	case it.Media != nil && it.Media.IsImage():
		a.med().viewer = &viewerState{open: true, items: []protocol.MediaRef{*it.Media}, from: from}
	case it.Media != nil:
		a.OpenFile(*it.Media, from)
	case it.Path != "":
		taskID := ""
		if it.Task != nil {
			taskID = it.Task.TaskID
		}
		a.OpenFileLink(it.Path, taskID)
	case it.URL != "":
		a.openLink(it.URL)
	case it.Block != nil:
		if a.past.made.open == it.ID {
			a.past.made.open = ""
		} else {
			a.past.made.open = it.ID
		}
	}
}
