package views

// D385: 交给{name} / Hand to {name}, the one sheet every door opens
// (design/handover.md §3): what (a find field over the whole pile, the found
// line as separate facts, the to-dos by sort group, ticked by default the do
// ones), 给{name}的话 / A note for {name} (and 给这件的话… per to-do), and how
// (a shape with 建议 and its line, 在哪儿做 / Where and 谁来做 / Who does it,
// each saying why). Go is 交给{name}这 n 件 with its shape beneath (never
// joined, D291). Wide: two columns; narrow: what, then 下一步：怎么做. The web
// draws the same (apps/web/src/pile.tsx).

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// handState is the sheet's own state.
type handState struct {
	open bool
	// cid answers the find (or the do row's items); howCid the how; goCid the Go.
	cid, howCid, goCid string
	// The door: a typed find, a 讲的是 subject, a set card, or the do row.
	query, sentQuery string
	queryAt          time.Time
	subject          string
	bySubject        bool
	setID            string
	fromDo           bool
	items            []protocol.FoundItem
	found            *protocol.FindSummary
	got, finding     bool
	ticked           map[string]bool
	note             string
	notes            map[string]string
	noteOpen         map[string]bool
	how              *protocol.HandHow
	howKey, sentHow  string
	howAt            time.Time
	// The person's own picks over the suggestion ("" = as suggested); addTo: 加进「{group}」.
	shape, device, harness string
	addTo                  bool
	pickOpen               string // where | who
	step                   int    // narrow: 0 what, 1 note and how
	sending                bool
	said                   string
	focusFind              bool
	// seeded: the ticks came with the door (a set card's) and the first answer keeps them.
	seeded bool
}

// handDebounce is how long the sheet waits after a key before it asks again.
const handDebounce = 320 * time.Millisecond

func (a *App) newHand() *handState {
	a.nextClient++
	h := &a.ho
	*h = handState{open: true, cid: fmt.Sprintf("hand%d", a.nextClient), ticked: map[string]bool{}, notes: map[string]string{}, noteOpen: map[string]bool{}}
	return h
}

// openHandDo is the pile's do row: the do group, the first six ticked (small first).
func (a *App) openHandDo() {
	h := a.newHand()
	h.fromDo = true
	a.send(protocol.PileItemsReq{T: "pile_items", Group: "do", ClientID: h.cid})
}

// openHandSubject is a 讲的是 chip: every to-do on that subject, the do ones ticked.
func (a *App) openHandSubject(name string) {
	h := a.newHand()
	h.subject, h.bySubject, h.finding = name, true, true
	a.send(protocol.PileFindReq{T: "pile_find", Subject: name, ClientID: h.cid})
}

// openHandSet is a set card's Go: the same set, as ticked on the card.
func (a *App) openHandSet(s *protocol.TodoSet, ticked map[string]bool) {
	h := a.newHand()
	h.setID, h.bySubject, h.subject, h.finding, h.seeded = s.SetID, true, s.Subject, true, true
	for r, on := range ticked {
		if on {
			h.ticked[r] = true
		}
	}
	a.send(protocol.PileFindReq{T: "pile_find", SetID: s.SetID, ClientID: h.cid})
}

// takeHand reads the home's answers about the sheet (by clientId).
func (a *App) takeHand() {
	h := &a.ho
	if r := a.S.SourceItems[h.cid]; r != nil {
		delete(a.S.SourceItems, h.cid)
		h.got, h.finding = true, false
		switch {
		case r.Group != "": // the do row
			h.items = nil
			for i, p := range r.PileItems {
				h.items = append(h.items, protocol.FoundItem{PileItem: p})
				if i < protocol.PileHandDefault {
					h.ticked[p.Item.Ref] = true
				}
			}
		case r.PileOp == "find":
			h.items, h.found = r.FoundItems, r.Found
			if r.Subject != "" && h.query == "" {
				h.subject = r.Subject
			}
			// A set card's own ticks stay (its first answer); otherwise the do ones, as found.
			if !h.seeded {
				h.ticked = map[string]bool{}
				for _, ref := range r.Ticked {
					h.ticked[ref] = true
				}
			}
			h.seeded = false
		}
	}
	if r := a.S.SourceItems[h.howCid]; r != nil && h.howCid != "" {
		delete(a.S.SourceItems, h.howCid)
		if r.How != nil {
			h.how = r.How
		}
	}
	if r := a.S.SourceItems[h.goCid]; r != nil && h.goCid != "" {
		delete(a.S.SourceItems, h.goCid)
		h.sending = false
		if r.OK {
			h.open = false
		} else {
			h.said = r.Error
			if h.said == "" {
				h.said = a.L.T("newtask.err.failed")
			}
		}
	}
}

// handTicked is the ticked refs, in the order the sheet shows them.
func (h *handState) handTicked() []string {
	var out []string
	for _, it := range h.items {
		if h.ticked[it.Item.Ref] {
			out = append(out, it.Item.Ref)
		}
	}
	return out
}

// handPump sends what changed: a typed find, and the how for the set and the note.
func (a *App) handPump(c *ui.Context) {
	h := &a.ho
	now := a.Now()
	q := strings.TrimSpace(h.query)
	if q != h.sentQuery {
		if wait := handDebounce - now.Sub(h.queryAt); wait > 0 {
			c.After(wait + 10*time.Millisecond)
		} else {
			h.sentQuery = q
			a.nextClient++
			h.cid = fmt.Sprintf("hand%d", a.nextClient)
			h.finding = true
			if q == "" && h.subject != "" {
				a.send(protocol.PileFindReq{T: "pile_find", Subject: h.subject, ClientID: h.cid})
			} else if q == "" && h.setID != "" {
				a.send(protocol.PileFindReq{T: "pile_find", SetID: h.setID, ClientID: h.cid})
			} else if q == "" {
				h.fromDo = true
				a.send(protocol.PileItemsReq{T: "pile_items", Group: "do", ClientID: h.cid})
			} else {
				h.fromDo = false
				a.send(protocol.PileFindReq{T: "pile_find", Query: q, ClientID: h.cid})
			}
		}
	}
	refs := h.handTicked()
	if len(refs) == 0 {
		return
	}
	key := strings.Join(refs, ",") + "\x00" + h.note
	if key != h.howKey {
		h.howKey, h.howAt = key, now
	}
	if key == h.sentHow {
		return
	}
	if wait := handDebounce - now.Sub(h.howAt); wait > 0 && h.how != nil {
		c.After(wait + 10*time.Millisecond)
		return
	}
	h.sentHow = key
	a.nextClient++
	h.howCid = fmt.Sprintf("how%d", a.nextClient)
	subj := h.subject
	if h.query != "" && h.found != nil && h.found.Subject != "" {
		subj = h.found.Subject
	}
	a.send(protocol.PileHowReq{T: "pile_how", Refs: refs, Note: strings.TrimSpace(h.note), BySubject: h.bySubject || (h.query != "" && h.found != nil && h.found.ByMeaning > 0), Subject: subj, ClientID: h.howCid})
}

// handShape is the shape Go makes: the person's pick, else the suggestion.
func (h *handState) handShape() string {
	if h.how == nil {
		return ""
	}
	if h.shape != "" {
		for _, s := range h.how.Shapes {
			if s == h.shape {
				return s
			}
		}
	}
	return h.how.Shape
}

// handGo sends 交给{name}这 n 件.
func (a *App) handGo() {
	h := &a.ho
	refs := h.handTicked()
	if len(refs) == 0 || h.sending {
		return
	}
	notes := map[string]string{}
	for _, r := range refs {
		if n := strings.TrimSpace(h.notes[r]); n != "" {
			notes[r] = n
		}
	}
	req := protocol.PileHandReq{T: "pile_hand", Refs: refs, Note: strings.TrimSpace(h.note), Notes: notes, Device: h.device, Harness: h.harness, SetID: h.setID}
	if len(notes) == 0 {
		req.Notes = nil
	}
	if len(refs) > 1 {
		req.Shape = h.handShape()
		if req.Shape == "" {
			req.Shape = "side_by_side"
		}
	}
	if h.addTo && h.how != nil && h.how.AddTo != nil {
		req.Group, req.Shape = h.how.AddTo.GroupID, ""
	}
	subj := h.subject
	if h.found != nil && h.found.Subject != "" {
		subj = h.found.Subject
	}
	if h.bySubject || (h.found != nil && h.found.ByMeaning > 0) {
		req.Subject, req.BySubject = subj, true
	}
	a.nextClient++
	h.goCid = fmt.Sprintf("handgo%d", a.nextClient)
	req.ClientID = h.goCid
	h.sending, h.said = true, ""
	a.send(req)
}

// handSheet is the sheet over the window.
func (a *App) handSheet(c *ui.Context) {
	h := &a.ho
	if !h.open {
		return
	}
	a.takeHand()
	a.handPump(c)
	t := a.T
	w, wh := c.Size()
	if w <= 0 {
		w, wh = 1240, 860
	}
	name := a.personaName()
	title := a.L.T("hand.title", name)
	wide := w >= 900
	open := true
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		pw := min(w-2*t.S6, 1180)
		if !wide {
			pw = min(w-2*t.S4, 620)
		}
		panel.Width(pw).Height(wh-2*t.S6).Radius(t.RadiusXL).Background(t.Bg).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title).Role(ui.RoleDialog)
		a.enter(c, panel)
		// Keyboard: Cmd+F finds, Cmd+Enter is Go.
		if c.Shortcut(ui.Cmd, ui.KeyF) {
			h.focusFind, h.step = true, 0
		}
		if c.Shortcut(ui.Cmd, ui.KeyEnter) {
			a.handGo()
		}
		ui.Row(c.Key("hand-head")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S5, t.S6, t.S3, t.S6).Children(func() {
			a.heading(c, title, t.XL).Shrink(1).MinWidth(0)
			ui.Spacer(c)
			if a.iconButtonFor(c, a.L.T("pile.close.x"), t.ControlMD, btnSecondary, drawCross) {
				h.open = false
			}
		})
		if wide {
			ui.Row(c.Key("hand-cols")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
				ui.Scroll(c.Key("hand-what")).Grow(135).Shrink(1).MinWidth(0).Children(func() {
					ui.Column(c).Padding(0, t.S6, t.S5, t.S6).Gap(t.S2).Children(func() { a.handWhat(c) })
				})
				ui.Scroll(c.Key("hand-how")).Grow(100).Shrink(1).MinWidth(340).Background(t.SurfaceSunken).Radius(t.RadiusLG).Margin(0, t.S5, 0, 0).Children(func() {
					ui.Column(c).Padding(t.S4, t.S5, t.S5, t.S5).Gap(t.S4).Children(func() { a.handHowCol(c) })
				})
			})
		} else {
			ui.Scroll(c.Key(fmt.Sprint("hand-step", h.step))).Grow(1).MinHeight(0).Children(func() {
				ui.Column(c).Padding(0, t.S5, t.S5, t.S5).Gap(t.S2).Children(func() {
					if h.step == 0 {
						a.handWhat(c)
					} else {
						a.handHowCol(c)
					}
				})
			})
		}
		a.handFoot(c, wide)
	})
	if !open {
		h.open = false
	}
}

// iconButtonFor is the close ×: a quiet round button.
func (a *App) iconButtonFor(c *ui.Context, label string, size float32, kind btnKind, draw func(ui.Color) func(*ui.Painter, ui.Rect)) bool {
	return a.iconButton(c, label, size, kind, draw)
}

// handWhat is the left: the find, its line, the to-dos by sort group.
func (a *App) handWhat(c *ui.Context) {
	t := a.T
	h := &a.ho
	name := a.personaName()
	field := ui.Row(c.Key("find")).Gap(t.S2).AlignItems(ui.Center).Height(46).Padding(0, t.S4).Radius(t.Pill).Background(t.Surface).Border(1, t.Line).Shadow(0, 2, 0, 0, t.Line)
	field.Children(func() {
		a.glyph(c, 18, drawMagnifier(t.InkSoft))
		in := ui.TextInput(c.Key("find-in"), &h.query).Placeholder(a.L.T("hand.find")).Label(a.L.T("hand.find.label")).FontSize(t.Bubble).Grow(1).MinWidth(0).
			Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0)
		if in.Changed() {
			h.queryAt = a.Now()
		}
		if h.focusFind {
			in.Focus()
			h.focusFind = false
		}
		if h.query != "" && a.quietButton(c, "find-clear", a.L.T("mem.find.clear"), "", false, 0) {
			h.query, h.queryAt = "", a.Now()
		}
	})
	a.enter(c, field)
	// The found line: its facts apart (D291).
	if h.finding && strings.TrimSpace(h.query) != "" {
		ui.Text(c.Key("finding"), a.L.T("hand.finding")).FontSize(t.SM).TextColor(t.InkMuted).Role(ui.RoleStatus).Padding(t.S1, t.S1)
	} else if f := h.found; f != nil && (h.query != "" || h.subject != "" || h.setID != "") {
		ui.Row(c.Key("found")).Wrap().Gap(t.S3).AlignItems(ui.Baseline).Padding(t.S1, t.S1, 0, t.S1).Role(ui.RoleStatus).Children(func() {
			subj := f.Subject
			if subj == "" {
				subj = h.subject
			}
			head := a.L.T("hand.found.n", f.N)
			switch {
			case f.N == 0 && subj != "":
				head = a.L.T("hand.found.none", subj)
			case subj != "":
				head = a.L.T("hand.found", f.N, subj)
			}
			ui.Text(c.Key("head"), head).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink)
			if f.InTitle > 0 && f.InTitle < f.N {
				ui.Text(c.Key("title"), a.nCount("hand.found.title", f.InTitle)).FontSize(t.SM).TextColor(t.InkMuted)
			}
			if f.ByLabel > 0 {
				ui.Text(c.Key("label"), a.nCount("hand.found.label", f.ByLabel)).FontSize(t.SM).TextColor(t.InkMuted)
			}
			if f.ByMeaning > 0 && f.ByMeaning < f.N {
				ui.Text(c.Key("meaning"), a.nCount("hand.found.meaning", f.ByMeaning)).FontSize(t.SM).TextColor(t.InkMuted)
			}
			if f.NoMeaning != "" {
				ui.Text(c.Key("nomodel"), a.L.T("hand.found.nomodel")).FontSize(t.SM).TextColor(t.Waiting.Ink)
			}
		})
	}
	switch {
	case !h.got:
		ui.Text(c.Key("looking"), a.L.T("todos.looking")).TextColor(t.InkSoft).Padding(t.S3, t.S1)
		return
	case len(h.items) == 0:
		ui.Text(c.Key("empty"), a.L.T("pile.empty")).TextColor(t.InkSoft).Padding(t.S3, t.S1)
		return
	}
	for _, g := range []string{"do", "decide", "later", "close"} {
		var its []protocol.FoundItem
		for _, it := range h.items {
			if it.Group == g {
				its = append(its, it)
			}
		}
		if len(its) == 0 {
			continue
		}
		label := a.L.T("pile.g." + g)
		if g == "do" {
			label = a.L.T("pile.g.do", name)
		}
		ui.Text(c.Key("gh:"+g), label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Padding(t.S4, t.S1, 0, t.S1).Role(ui.RoleText)
		for _, it := range its {
			a.handItem(c, it)
		}
	}
}

// handItem is one to-do: its tick, title, why (a decide's question with 建议),
// facts, and 给这件的话….
func (a *App) handItem(c *ui.Context, it protocol.FoundItem) {
	t := a.T
	h := &a.ho
	ref := it.Item.Ref
	on := h.ticked[ref]
	box := ui.Column(c.Key("it:"+ref)).Gap(t.S1).Radius(16).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line)
	if on {
		box.Shadow(0, 2, 0, 0, t.Line2)
	} else {
		box.Opacity(0.86)
	}
	box.Children(func() {
		row := ui.Row(c.Key("row")).Gap(12).AlignItems(ui.Start).Padding(12, 14, 6, 14).Cursor(ui.CursorPointer).Role(ui.RoleCheckBox).Checked(on).Focusable().Label(it.Item.Title)
		row.Children(func() {
			bg, border := t.Surface, t.Line2
			if on {
				bg, border = t.Accent, t.Accent
			}
			tick := ui.Box(c.Key("tick")).Size(24, 24).Radius(7).Background(bg).Border(1.5, border).AlignItems(ui.Center).Justify(ui.Center).Shrink(0).AccessHidden(true)
			tick.Children(func() {
				if on {
					a.glyph(c, 16, drawCheck(t.OnAccent))
				}
			})
			if !c.Preferences().ReduceMotion {
				a.popOn(c, tick, on)
			}
			ui.Column(c.Key("body")).Gap(6).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				ui.Row(c.Key("head")).Gap(8).AlignItems(ui.Center).Children(func() {
					a.todoMark(c, it.Item.Kind, 20)
					ui.Text(c.Key("title"), keepWords(autospace(it.Item.Title))).FontWeight(600).TextColor(t.Ink).MaxLines(2).Shrink(1).MinWidth(0)
				})
				if it.Group == "decide" {
					ask := it.Ask
					if ask == "" {
						ask = it.Why
					}
					ui.Text(c.Key("ask"), ask).TextColor(t.Ink).LineHeight(a.leading(1.45))
					if it.Pick != "" {
						ui.Row(c.Key("sugg")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
							ui.Row(c.Key("tag")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.NeedsYou.Surface).Children(func() {
								ui.Text(c, a.L.T("hand.suggested")).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
							})
							ui.Text(c.Key("pick"), a.L.TFamily("pile.pick."+it.Pick, a.personaName())).FontSize(t.SM).TextColor(t.InkSoft)
						})
					}
				} else {
					ui.Text(c.Key("why"), it.Why).TextColor(t.InkSoft)
				}
				ui.Row(c.Key("facts")).Wrap().Gap(10).AlignItems(ui.Center).Children(func() {
					// Where it is, as plain words (its app's mark is on the title already).
					where := it.Item.Label
					if it.Item.Kind == "github" && it.Item.Where != "" {
						where = it.Item.Where + it.Item.Label
					}
					wl := ui.Text(c.Key("where"), where).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum")
					if it.Item.URL != "" {
						wl.Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(spoken(a.L, where, a.L.T("todos.chip.open", protocol.SourceKindName(it.Item.Kind))))
						if wl.Clicked() {
							c.OpenURL(it.Item.URL)
						}
					}
					if it.Size != "" {
						ui.Row(c.Key("size")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.SurfaceSunken).Children(func() {
							ui.Text(c, a.L.T("pile.size."+it.Size)).FontSize(t.XS).TextColor(t.InkMuted)
						})
					}
					if it.By == "meaning" {
						ui.Row(c.Key("meaning")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.Asleep.Surface).Children(func() {
							ui.Text(c, a.L.T("hand.meaning")).FontSize(t.XS).FontWeight(600).TextColor(t.Asleep.Ink)
						})
					}
				})
			})
		})
		if row.Clicked() {
			h.ticked[ref] = !on
		}
		// 给这件的话…: a quiet link, then the note's own field (only for a ticked one).
		if on {
			ui.Column(c.Key("note")).Padding(0, 14, 10, 50).Children(func() {
				if h.noteOpen[ref] || h.notes[ref] != "" {
					n := h.notes[ref]
					ta := ui.TextArea(c.Key("note-in"), &n).Lines(1, 4).MinHeight(0).Placeholder(a.L.T("hand.itemnote")).Label(a.L.T("hand.itemnote.label")).
						Background(t.SurfaceSunken).Radius(12).Padding(t.S2, t.S3).FontSize(t.SM).LineHeight(a.leading(1.45))
					if ta.Changed() {
						h.notes[ref] = n
					}
					if h.noteOpen[ref] {
						ta.Focus()
						h.noteOpen[ref] = false
					}
					return
				}
				link := ui.Text(c.Key("note-link"), a.L.T("hand.itemnote")).FontSize(t.SM).TextColor(t.InkMuted).Underline().Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
				if link.Clicked() {
					h.noteOpen[ref] = true
				}
			})
		} else {
			ui.Box(c.Key("pad")).Height(6)
		}
	})
}

// handHowCol is the right: the note, how, where and who.
func (a *App) handHowCol(c *ui.Context) {
	t := a.T
	h := &a.ho
	name := a.personaName()
	n := len(h.handTicked())
	sec := ui.Column(c.Key("note")).Gap(t.S2)
	sec.Children(func() {
		ui.Text(c.Key("h"), a.L.T("hand.note", name)).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).Role(ui.RoleText)
		ta := ui.TextArea(c.Key("note-in"), &h.note).Lines(3, 8).MinHeight(0).Placeholder(a.L.T("hand.note.ph")).Label(a.L.T("hand.note", name)).
			Background(t.Surface).Border(2, t.Accent).Radius(16).Padding(t.S3, t.S4).FontSize(t.Bubble).LineHeight(a.leading(1.55))
		if h.step == 1 && h.note == "" && !ta.Changed() {
			ta.AutoFocus()
		}
	})
	a.enter(c, sec)
	if n == 0 {
		return
	}
	how := h.how
	if how == nil {
		ui.Text(c.Key("how-wait"), a.L.T("todos.looking")).FontSize(t.SM).TextColor(t.InkMuted)
		return
	}
	if len(how.Shapes) > 0 || how.AddTo != nil {
		shapes := ui.Column(c.Key("how")).Gap(t.S2).Role(ui.RoleRadioGroup).Label(a.L.T("hand.how"))
		shapes.Children(func() {
			ui.Text(c.Key("h"), a.L.T("hand.how")).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).Padding(0, 0, t.S1, 0)
			chosen := h.handShape()
			if how.AddTo != nil {
				line := a.L.T("hand.addto.line", how.AddTo.N)
				if how.AddTo.Planning {
					line = a.L.T("hand.addto.planning")
				}
				if a.shapeCard(c, "addto", a.L.T("hand.addto", how.AddTo.Name), line, "", h.addTo, false) {
					h.addTo = !h.addTo
				}
			}
			for _, s := range how.Shapes {
				line := a.L.T("hand.shape." + s + ".line")
				switch s {
				case "one_by_one":
					if how.Repo != "" {
						line = a.L.T("hand.shape.one_by_one.line", how.Repo)
					} else {
						line = a.L.T("hand.shape.one_by_one.line.any")
					}
				case "side_by_side":
					line = a.L.T("hand.shape.side_by_side.line", max(1, how.Cap))
				}
				why := ""
				if s == "plan" && s == how.Shape {
					why = a.L.T("hand.shape.plan.why")
				}
				if a.shapeCard(c, s, a.L.T("hand.shape."+s), line, why, !h.addTo && s == chosen, s == how.Shape) {
					h.shape, h.addTo = s, false
				}
			}
		})
		a.enter(c, shapes)
	}
	rows := ui.Column(c.Key("ww")).Radius(16).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line)
	rows.Children(func() {
		// 在哪儿做: the computer, and why.
		where := how.Where
		if h.device != "" {
			for _, w := range how.Wheres {
				if w.Device == h.device {
					where = w
					where.Why = "picked"
				}
			}
		}
		why := ""
		switch where.Why {
		case "note":
			why = a.L.T("hand.where.note", firstNonEmpty(where.Said, where.Name))
		case "rule":
			why = a.L.T("hand.where.rule")
		case "repo":
			if where.Said != "" {
				why = a.L.T("hand.where.repo", where.Said)
			}
		case "picked":
			why = a.L.T("hand.where.picked")
		}
		if a.howRow(c, "where", a.L.T("hand.where"), where.Name, why, len(how.Wheres) > 1) {
			h.pickOpen = toggle(h.pickOpen, "where")
		}
		if h.pickOpen == "where" {
			for _, w := range how.Wheres {
				w := w
				if a.pickLine(c, "w:"+w.Device, w.Name, w.Device == where.Device) {
					h.device, h.pickOpen = w.Device, ""
				}
			}
		}
		ui.Box(c.Key("sep")).Height(1).Background(t.LineSoft).Margin(0, t.S4)
		// 谁来做: an agent by a rule, or as usual.
		who, whyWho := a.L.T("hand.who.usual"), a.L.T("hand.who.usual.why", a.personaName())
		harness := firstNonEmpty(h.harness, how.Who.Harness)
		if harness != "" {
			who = harnessName(harness)
			whyWho = a.L.T("hand.who.rule")
			if h.harness != "" {
				whyWho = a.L.T("hand.who.picked")
			}
		}
		if a.howRow(c, "who", a.L.T("hand.who"), who, whyWho, len(how.Whos) > 0) {
			h.pickOpen = toggle(h.pickOpen, "who")
		}
		if h.pickOpen == "who" {
			if a.pickLine(c, "h:", a.L.T("hand.who.usual"), harness == "") {
				h.harness, h.pickOpen = "", ""
				if how.Who.Harness != "" {
					h.harness = "" // the rule's agent stays the default
				}
			}
			for _, x := range how.Whos {
				x := x
				if a.pickLine(c, "h:"+x, harnessName(x), x == harness) {
					h.harness, h.pickOpen = x, ""
				}
			}
		}
	})
	a.enter(c, rows)
}

func toggle(cur, v string) string {
	if cur == v {
		return ""
	}
	return v
}

// shapeCard is one shape: a radio dot, its name with 建议, its line, and (the
// suggested plan first) its why.
func (a *App) shapeCard(c *ui.Context, key, name, line, why string, on, suggested bool) bool {
	t := a.T
	card := ui.Row(c.Key("shape:"+key)).Gap(12).AlignItems(ui.Start).Padding(12, 14).Radius(16).Background(t.Surface).
		Cursor(ui.CursorPointer).Role(ui.RoleRadio).Checked(on).Focusable().Label(name)
	if on {
		card.Border(2, t.Ink).Shadow(0, 3, 0, 0, t.Line2)
	} else {
		card.Shadow(0, 2, 0, 0, t.Line)
		if card.Hovered() {
			card.Background(t.SurfaceRaised)
		}
	}
	card.Children(func() {
		dot := ui.Box(c.Key("dot")).Size(20, 20).Radius(10).Shrink(0).Margin(2, 0, 0, 0).AccessHidden(true)
		if on {
			dot.Border(6, t.Ink).Background(t.Surface)
		} else {
			dot.Border(2, t.Line2)
		}
		ui.Column(c.Key("t")).Gap(3).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ui.Row(c.Key("n")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				ui.Text(c, name).FontWeight(700).TextColor(t.Ink)
				if suggested {
					ui.Row(c.Key("sugg")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.NeedsYou.Surface).Children(func() {
						ui.Text(c, a.L.T("hand.suggested")).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
					})
				}
			})
			ui.Text(c.Key("line"), line).FontSize(t.SM).TextColor(t.InkMuted)
			if why != "" && on {
				ui.Text(c.Key("why"), why).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).Padding(t.S1, 0, 0, 0)
			}
		})
	})
	return card.Clicked()
}

// howRow is 在哪儿做 / 谁来做: its label, the value, why, a chevron when it can change.
func (a *App) howRow(c *ui.Context, key, label, value, why string, can bool) bool {
	t := a.T
	row := ui.Row(c.Key("hr:"+key)).Gap(t.S3).AlignItems(ui.Center).MinHeight(52).Padding(0, t.S4).Label(label + " " + value)
	if can {
		row.Cursor(ui.CursorPointer).Role(ui.RolePopUpButton).Focusable()
		if row.Hovered() {
			row.Background(t.SurfaceRaised)
		}
	}
	row.Children(func() {
		ui.Text(c.Key("l"), label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(84).Shrink(0)
		ui.Text(c.Key("v"), value).FontWeight(700).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0)
		ui.Spacer(c)
		if why != "" {
			ui.Text(c.Key("why"), why).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
		}
		if can {
			a.glyph(c, 14, drawChevron(t.InkMuted, true))
		}
	})
	return can && row.Clicked()
}

// pickLine is one choice under 在哪儿做 / 谁来做.
func (a *App) pickLine(c *ui.Context, key, label string, on bool) bool {
	t := a.T
	row := ui.Row(c.Key("pk:"+key)).Gap(t.S2).AlignItems(ui.Center).MinHeight(38).Padding(0, t.S4, 0, 84+t.S4+t.S3).Cursor(ui.CursorPointer).Role(ui.RoleRadio).Checked(on).Focusable().Label(label)
	if row.Hovered() {
		row.Background(t.SurfaceRaised)
	}
	row.Children(func() {
		ink := t.InkSoft
		if on {
			ink = t.Ink
		}
		ui.Text(c, label).FontSize(t.SM).FontWeight(600).TextColor(ink).Grow(1)
		if on {
			a.glyph(c, 14, drawCheck(t.Ink))
		}
	})
	return row.Clicked()
}

// handFoot is 勾了 n 件 and the Go, its shape on its own line beneath.
func (a *App) handFoot(c *ui.Context, wide bool) {
	t := a.T
	h := &a.ho
	name := a.personaName()
	refs := h.handTicked()
	ui.Row(c.Key("hand-foot")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S3, t.S6, t.S4, t.S6).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
		ui.Column(c.Key("l")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ui.Text(c.Key("n"), a.L.T("hand.picked", len(refs))).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").Role(ui.RoleStatus)
			if h.said != "" {
				ui.Text(c.Key("said"), h.said).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
			}
		})
		if !wide && h.step == 1 {
			if a.button(c, a.L.T("hand.back"), btnText, t.ControlLG, t.Bg) {
				h.step = 0
			}
		}
		if !wide && h.step == 0 {
			if a.button(c, a.L.T("hand.next"), btnPrimary, t.ControlLG, t.Bg) && len(refs) > 0 {
				h.step = 1
			}
			return
		}
		ui.Column(c.Key("go")).Gap(4).AlignItems(ui.End).Children(func() {
			label := a.L.T("pile.do.none")
			if len(refs) > 0 {
				label = a.L.T("pile.do.go", name, len(refs))
			}
			if a.button(c, label, btnPrimary, t.ControlLG, t.Bg) {
				a.handGo()
			}
			// Its shape, its own line (never joined to the button's words, D291).
			sub := ""
			switch {
			case len(refs) == 1:
				sub = a.L.T("hand.one")
			case h.addTo && h.how != nil && h.how.AddTo != nil:
				sub = a.L.T("hand.addto", h.how.AddTo.Name)
			case h.handShape() != "":
				sub = a.L.T("hand.shape." + h.handShape())
			}
			if sub != "" && len(refs) > 0 {
				ui.Text(c.Key("shape"), sub).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
	})
}

// ---------- 讲的是 / Subjects on the pile ----------

// pileSubjects is the chips row under the pile's head.
func (a *App) pileSubjects(c *ui.Context, pv *protocol.PileView) {
	if len(pv.Subjects) == 0 {
		return
	}
	t := a.T
	ui.Row(c.Key("subjects")).Wrap().Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, 0, t.S1, 0).Role(ui.RoleGroup).Label(a.L.T("hand.subjects")).Children(func() {
		ui.Text(c.Key("l"), a.L.T("hand.subjects")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(0, t.S1, 0, 0)
		for _, s := range pv.Subjects {
			s := s
			chip := ui.Row(c.Key("sj:"+s.Name)).Height(30).Padding(0, t.S3).Gap(t.S2).Radius(15).AlignItems(ui.Center).Background(t.SurfaceSunken).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(fmt.Sprintf("%s %d", s.Name, s.N))
			if chip.Hovered() {
				chip.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
			}
			chip.Children(func() {
				ui.Text(c.Key("n"), s.Name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).AccessHidden(true)
				ui.Text(c.Key("c"), fmt.Sprint(s.N)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").AccessHidden(true)
			})
			if chip.Clicked() {
				a.openHandSubject(s.Name)
			}
		}
		if pv.SubjectsMore > 0 {
			ui.Text(c.Key("more"), a.L.T("hand.subjects.more", pv.SubjectsMore)).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
}

// refLabel is a to-do's short label from its ref ("acme/mem#412" → "#412").
func refLabel(ref string) string {
	if i := strings.LastIndex(ref, "#"); i >= 0 {
		return ref[i:]
	}
	if i := strings.LastIndex(ref, "::"); i >= 0 {
		return ref[:i]
	}
	return ref
}

// refsLabel is several to-dos as one part's label ("#398 + #412").
func refsLabel(refs []string) string {
	ls := make([]string, len(refs))
	for i, r := range refs {
		ls[i] = refLabel(r)
	}
	return strings.Join(ls, " + ")
}

// sortedKeys is a map's keys in order (stable notes on the wire).
func sortedKeys(m map[string]bool) []string {
	var out []string
	for k, v := range m {
		if v {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

// nCount is a counted key with its count filled in, when its form prints one
// (a form like "1 条建议" prints none).
func (a *App) nCount(key string, n int) string {
	if s := a.L.N(key, n); !strings.Contains(s, "%d") {
		return s
	}
	return a.L.N(key, n, n)
}

// popOn gives a tick a small press as it turns on (a spring back to rest);
// none under reduced motion.
func (a *App) popOn(c *ui.Context, e ui.Element, on bool) {
	seen := ui.Local(e, "on", func() bool { return on })
	p := ui.Pose{}
	if *seen != on {
		*seen = on
		if on {
			p = ui.Pose{Scale: 0.78}
			c.Invalidate()
		}
	}
	e.AnimatePose(p, a.T.Bouncy)
}
