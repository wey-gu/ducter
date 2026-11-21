package views

// D385: 交给{name} / Hand to {name}, the one sheet every door opens
// (design/handover.md §3): what (a find field over the whole pile, the found
// line as separate facts, the to-dos by sort group, ticked by default the do
// ones), 给{name}的话 / A note for {name} (and 给这个的话… per to-do), and how
// (a shape with 建议 and its line, 在哪儿做 / Where and 谁来做 / Who does it,
// each saying why). Go is 交给{name}这 n 个 with its shape beneath (never
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
	// D396: query is the person's words in the field (what to find, maybe
	// the note too); sentQuery the words last asked; a 讲的是 subject or a set
	// card comes in with its words already there.
	query, sentQuery string
	queryAt          time.Time
	subject          string
	bySubject        bool
	setID            string
	fromDo           bool
	items            []protocol.FoundItem
	// D454: the found ones already handed over (their own group, never ticked).
	handed           []protocol.HandedItem
	found            *protocol.FindSummary
	got, finding     bool
	// heard: how core split the words; suggest: the field's suggestions;
	// noteAuto: the note as filled from the words (replaced while the person
	// hasn't written their own).
	heard    *protocol.FindSaid
	suggest  []string
	noteAuto string
	// D428: the reading's chips removed for these words (dropFor), and how
	// many the last find ticked (先勾了最像的 n 个).
	drop        []string
	dropFor     string
	foundTicked int
	// browse: picking one by one (the do group's list); doCount: its size.
	browse   bool
	doCount  int
	ticked   map[string]bool
	note     string
	notes    map[string]string
	noteOpen map[string]bool
	how      *protocol.HandHow
	howKey   string
	sentHow  string
	howAt    time.Time
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
	// D415: the person's own subjects. making: + 新的分类 (makeName over the
	// words); fromChip: opened from a chip (the rename/remove bar, 移出 on
	// rows); filing: 归到分类… open (fileName); subjCid answers the last
	// change (subjOp), subjTaken the row taken out.
	making, fromChip, filing, renaming bool
	makeName, fileName, renameTo       string
	focusName, focusFile, focusRename  bool
	subjCid, subjOp, subjTaken         string
	subjSending                        bool
}

// handDebounce is how long the sheet waits after a key before it asks again.
const handDebounce = 320 * time.Millisecond

func (a *App) newHand() *handState {
	a.nextClient++
	h := &a.ho
	*h = handState{open: true, cid: fmt.Sprintf("hand%d", a.nextClient), ticked: map[string]bool{}, notes: map[string]string{}, noteOpen: map[string]bool{}, focusFind: true, howKey: "\x01"}
	return h
}

// openHandDo is the pile's do row (D396: words first): the empty words field
// with its suggestions; one by one is a link away.
func (a *App) openHandDo() {
	h := a.newHand()
	h.fromDo, h.got = true, true
	if pv := a.pileView(); pv != nil {
		h.doCount = pv.Groups["do"]
	}
	a.send(protocol.PileFindReq{T: "pile_find", ClientID: h.cid})
}

// openHandSubject is a 讲的是 chip: every to-do on that subject, the do ones
// ticked, its name in the words field.
func (a *App) openHandSubject(name string) {
	h := a.newHand()
	h.subject, h.bySubject, h.finding, h.fromChip = name, true, true, true
	h.query, h.sentQuery, h.focusFind = name, name, false
	a.send(protocol.PileFindReq{T: "pile_find", Subject: name, ClientID: h.cid})
}

// openHandSet is a set card's Go: the same set, as ticked on the card, its
// words in the field and the note heard in them.
func (a *App) openHandSet(s *protocol.TodoSet, ticked map[string]bool) {
	h := a.newHand()
	h.setID, h.bySubject, h.subject, h.finding, h.seeded = s.SetID, true, s.Subject, true, true
	h.query = firstNonEmpty(s.Query, s.Subject)
	h.sentQuery, h.focusFind = h.query, false
	if s.Note != "" {
		h.note, h.noteAuto = s.Note, s.Note
	}
	for r, on := range ticked {
		if on {
			h.ticked[r] = true
		}
	}
	a.send(protocol.PileFindReq{T: "pile_find", SetID: s.SetID, ClientID: h.cid})
}

// handBrowse turns one by one on (the do group's list, the first few
// ticked) or back off to the words.
func (a *App) handBrowse(on bool) {
	h := &a.ho
	h.browse, h.pickOpen = on, ""
	a.nextClient++
	h.cid = fmt.Sprintf("hand%d", a.nextClient)
	h.items, h.found, h.got = nil, nil, false
	if on {
		a.send(protocol.PileItemsReq{T: "pile_items", Group: "do", ClientID: h.cid})
		return
	}
	h.ticked = map[string]bool{}
	h.got, h.focusFind = true, true
	h.sentQuery = "\x00" // the words, asked again
}

// handFillNote writes the note the words carried, while the person hasn't
// written their own (theirs is never replaced).
func (h *handState) handFillNote(note string) {
	if strings.TrimSpace(h.note) != "" && h.note != h.noteAuto {
		return
	}
	h.note, h.noteAuto = note, note
}

// takeHand reads the home's answers about the sheet (by clientId).
func (a *App) takeHand() {
	h := &a.ho
	if r := a.S.SourceItems[h.cid]; r != nil {
		delete(a.S.SourceItems, h.cid)
		h.got, h.finding = true, false
		switch {
		case r.Group != "": // one by one: the do group
			h.items, h.handed = nil, nil
			for _, p := range r.PileItems {
				h.items = append(h.items, protocol.FoundItem{PileItem: p})
			}
			h.doCount = len(h.items)
			if len(h.handTicked()) == 0 {
				for i, p := range r.PileItems {
					if i < protocol.PileHandDefault {
						h.ticked[p.Item.Ref] = true
					}
				}
			}
		case r.PileOp == "find":
			if r.Suggest != nil {
				h.suggest = r.Suggest
			}
			// The bare door: only its suggestions.
			if strings.TrimSpace(h.query) == "" && h.subject == "" && h.setID == "" {
				break
			}
			h.items, h.found, h.heard, h.handed = r.FoundItems, r.Found, r.Said, r.HandedOver
			h.foundTicked = len(r.Ticked)
			if r.Subject != "" {
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
			if r.Said != nil {
				h.handFillNote(r.Said.Note)
				h.bySubject = r.Subject != "" || (r.Found != nil && r.Found.ByMeaning > 0)
			}
		}
	}
	if r := a.S.SourceItems[h.howCid]; r != nil && h.howCid != "" {
		delete(a.S.SourceItems, h.howCid)
		if r.How != nil {
			h.how = r.How
		}
	}
	a.takeSubject()
	if r := a.S.SourceItems[h.goCid]; r != nil && h.goCid != "" {
		delete(a.S.SourceItems, h.goCid)
		h.sending = false
		if r.OK {
			h.open = false
			// D415: the note asked to comment first: a card asks; nothing started yet.
			if r.Asked != "" {
				a.toast(a.L.T("hand.asked.comment"))
			}
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

// handPump sends what changed: the words said, and the how for the set and
// the note (where and who from the start, before anything is ticked).
func (a *App) handPump(c *ui.Context) {
	h := &a.ho
	now := a.Now()
	q := strings.TrimSpace(strings.ReplaceAll(h.query, "\n", " "))
	if q != h.sentQuery && !h.browse {
		h.fromChip = false // other words: no longer the chip's subject
		if wait := handDebounce - now.Sub(h.queryAt); wait > 0 {
			c.After(wait + 10*time.Millisecond)
		} else {
			h.sentQuery = q
			a.nextClient++
			h.cid = fmt.Sprintf("hand%d", a.nextClient)
			h.setID, h.seeded = "", false
			if q == "" {
				// Nothing said: nothing found, nothing ticked; the suggestions stay.
				h.items, h.found, h.heard, h.subject, h.bySubject, h.finding = nil, nil, nil, "", false, false
				h.ticked = map[string]bool{}
				h.handFillNote("")
			} else {
				h.finding, h.subject = true, ""
				// New words, a new reading: the chips removed for the old words come back.
				if q != h.dropFor {
					h.drop, h.dropFor = nil, ""
				}
				a.send(protocol.PileFindReq{T: "pile_find", Words: q, Drop: h.drop, ClientID: h.cid})
			}
		}
	}
	refs := h.handTicked()
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
	if h.found != nil && h.found.Subject != "" && h.heard != nil {
		subj = h.found.Subject
	}
	a.send(protocol.PileHowReq{T: "pile_how", Refs: refs, Note: strings.TrimSpace(h.note), BySubject: h.bySubject, Subject: subj, ClientID: h.howCid})
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

// handGo sends 交给{name}这 n 个.
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

// sheetTop is how far a sheet keeps from the window's top: below the top
// bar that holds the traffic lights (ChromeH), whatever the window's height;
// a window without them keeps a plain gutter.
func sheetTop(c *ui.Context) float32 {
	if bar := c.TitleBar(); bar.Left > 0 || bar.Height > 0 {
		return ChromeH + 4
	}
	return 32
}

// sheetBottom is the gutter a sheet keeps from the window's bottom.
const sheetBottom = 24

// sheetBack lays a sheet's backdrop out so the panel centers in the room
// under the title bar, and returns the panel's tallest height there. Every
// sheet over the window goes through it (the traffic lights never sit on a
// sheet).
func sheetBack(c *ui.Context, back ui.Element, wh float32) float32 {
	top := sheetTop(c)
	back.Padding(top, 0, sheetBottom, 0)
	return max(240, wh-top-sheetBottom)
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
		ph := sheetBack(c, back, wh)
		pw := min(w-2*t.S6, 1180)
		if !wide {
			pw = min(w-2*t.S4, 620)
		}
		panel.Width(pw).Height(ph).Radius(t.RadiusXL).Background(t.Bg).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title).Role(ui.RoleDialog)
		a.enter(c, panel)
		// Keyboard: Cmd+F goes to the words, Cmd+Enter is Go.
		if c.Shortcut(ui.Cmd, ui.KeyF) {
			h.focusFind, h.step = true, 0
		}
		if c.Shortcut(ui.Cmd, ui.KeyEnter) {
			a.handGo()
		}
		ui.Row(c.Key("hand-head")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S5, t.S6, t.S2, t.S6).Children(func() {
			a.heading(c, title, t.XL).Shrink(1).MinWidth(0)
			ui.Spacer(c)
			if a.iconButtonFor(c, a.L.T("pile.close.x"), t.ControlMD, btnSecondary, drawCross) {
				h.open = false
			}
		})
		if wide {
			ui.Row(c.Key("hand-cols")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
				ui.Scroll(c.Key("hand-what")).Grow(135).Shrink(1).MinWidth(0).Children(func() {
					ui.Column(c).Padding(0, t.S6, t.S5, t.S6).Gap(t.S2).Children(func() { a.handWhat(c, wide) })
				})
				ui.Scroll(c.Key("hand-how")).Grow(100).Shrink(1).MinWidth(340).Background(t.SurfaceSunken).Radius(t.RadiusLG).Margin(0, t.S5, 0, 0).Children(func() {
					ui.Column(c).Padding(t.S4, t.S5, t.S5, t.S5).Gap(t.S4).Children(func() { a.handHowCol(c) })
				})
			})
		} else {
			ui.Scroll(c.Key(fmt.Sprint("hand-step", h.step))).Grow(1).MinHeight(0).Children(func() {
				ui.Column(c).Padding(0, t.S5, t.S5, t.S5).Gap(t.S2).Children(func() {
					if h.step == 0 {
						a.handWhat(c, wide)
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

// handWhat is the left (D396: words first): one question and one field; a
// sentence finds the set, ticked, with how it was heard; the list is for
// confirming and trimming. Before anything is said: a hint, the
// suggestions, and one by one as a quiet link.
func (a *App) handWhat(c *ui.Context, wide bool) {
	t := a.T
	h := &a.ho
	name := a.personaName()
	if h.browse {
		back := ui.Row(c.Key("words-back")).Gap(t.S1).AlignItems(ui.Center).Height(36).Padding(0, t.S3, 0, t.S2).Radius(18).Background(t.SurfaceSunken).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(a.L.T("hand.browse.back")).AlignSelf(ui.Start)
		if back.Hovered() {
			back.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
		}
		back.Children(func() {
			a.glyph(c, 16, drawBack(t.Ink))
			uiText(c, a.L.T("hand.browse.back")).FontWeight(600).TextColor(t.Ink).AccessHidden(true)
		})
		if back.Clicked() {
			a.handBrowse(false)
		}
		if !h.got {
			a.handSkeleton(c, 3, 84)
			return
		}
		a.handList(c)
		return
	}
	if h.making {
		a.handMakeName(c)
	}
	uiText(c.Key("ask"), a.L.T("hand.ask", name)).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink).Padding(t.S1, t.S1, t.S1, t.S1).Role(ui.RoleText)
	field := ui.Row(c.Key("find")).Gap(t.S2).AlignItems(ui.Center).MinHeight(56).Padding(0, t.S2, 0, t.S4).Radius(t.RadiusLG).Background(t.Surface).Border(2, t.Line2).Shadow(0, 3, 0, 0, t.Line2)
	field.Children(func() {
		a.glyph(c, 18, drawMagnifier(t.InkSoft))
		in := ui.TextArea(c.Key("find-in"), &h.query).Lines(1, 4).MinHeight(0).Placeholder(a.L.T("hand.ask.ph")).Label(a.L.T("hand.ask", name)).FontSize(t.LG).LineHeight(a.leading(1.45)).Grow(1).MinWidth(0).
			Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S3, 0)
		if in.Changed() {
			h.query = strings.ReplaceAll(h.query, "\n", " ")
			h.queryAt = a.Now()
		}
		if in.Focused() {
			field.Border(2, t.Accent)
		}
		if h.focusFind {
			in.Focus()
			h.focusFind = false
		}
		if h.query != "" && a.quietButton(c, "find-clear", a.L.T("mem.find.clear"), "", false, 0) {
			h.query, h.queryAt, h.focusFind = "", a.Now(), true
		}
	})
	a.enter(c, field)
	said := strings.TrimSpace(h.query) != ""
	// How the words were read (D428): one chip per fact, each removable; a name
	// the pile doesn't have, said plainly with the closest logins; the note
	// itself lives on the right (one quiet line says it went there).
	if hd := h.heard; hd != nil && !h.finding && (hd.Note != "" || len(readingChips(hd)) > 0 || len(hd.Unknown) > 0 || len(hd.Guessed) > 0 || len(h.drop) > 0) {
		ui.Column(c.Key("heard")).Gap(t.S2).Padding(t.S1, 0, 0, 0).Children(func() {
			if chips := readingChips(hd); len(chips) > 0 || len(h.drop) > 0 {
				a.handReading(c, chips)
				// D451: the first time a sentence is read into chips, what they are.
				if len(chips) > 0 && len(h.drop) == 0 {
					a.firstMeetLine(c, "find", "handover")
				}
			} else if hd.Note != "" {
				a.heardPart(c, "about", a.L.T("hand.said.about"), hd.About)
			}
			// D454: a name one edit from one login, read as it at once, with its undo.
			for _, g := range hd.Guessed {
				a.handGuessed(c, g)
			}
			for _, u := range hd.Unknown {
				a.handUnknown(c, u)
			}
			if hd.Note != "" && h.note == h.noteAuto && strings.TrimSpace(h.note) != "" {
				moved := a.L.T("hand.said.moved", name)
				if !wide {
					moved = a.L.T("hand.said.moved.narrow", name)
				}
				uiText(c.Key("moved"), moved).FontSize(t.SM).TextColor(t.InkMuted).Padding(0, t.S1)
			}
		})
	}
	if !said && h.subject == "" && h.setID == "" {
		ui.Column(c.Key("start")).Gap(t.S4).Padding(t.S3, t.S1, 0, t.S1).Children(func() {
			uiText(c.Key("hint"), a.L.T("hand.ask.hint")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
			a.handSuggest(c, false)
			a.handBrowseLink(c, false)
		})
		return
	}
	// The found line: its facts apart (D291).
	if h.finding {
		uiText(c.Key("finding"), a.L.T("hand.finding")).FontSize(t.SM).TextColor(t.InkMuted).Role(ui.RoleStatus).Padding(t.S2, t.S1)
	} else if f := h.found; f != nil && (f.N > 0 || f.Handed > 0) {
		ui.Row(c.Key("found")).Wrap().Gap(t.S3).AlignItems(ui.Baseline).Padding(t.S2, t.S1, 0, t.S1).Role(ui.RoleStatus).Children(func() {
			subj := firstNonEmpty(f.Subject, h.subject)
			head := a.handFoundHead(f, subj)
			uiText(c.Key("head"), head).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink)
			if f.Cut > 0 {
				uiText(c.Key("ticked"), a.nCount("hand.found.ticked", h.foundTicked)).FontSize(t.SM).TextColor(t.InkMuted)
			}
			if f.Maybe > 0 {
				uiText(c.Key("maybe"), a.nCount("hand.found.maybe", f.Maybe)).FontSize(t.SM).TextColor(t.InkMuted)
			}
			if f.Handed > 0 {
				uiText(c.Key("handed"), a.nCount("hand.found.handed", f.Handed)).FontSize(t.SM).TextColor(t.InkMuted)
			}
			if f.NoMeaning != "" {
				uiText(c.Key("nomodel"), a.L.T("hand.found.nomodel")).FontSize(t.SM).TextColor(t.Waiting.Ink)
			}
		})
	}
	// D415: a chip's subject can be renamed (or merged) and removed here.
	if h.fromChip && h.subject != "" && !h.finding {
		a.handSubjectBar(c)
	}
	switch {
	case !h.got || (h.finding && len(h.items) == 0):
		a.handSkeleton(c, 3, 84)
	case len(h.items) == 0 && len(h.handed) > 0:
		uiText(c.Key("left"), a.L.T("hand.none.left")).FontSize(t.SM).TextColor(t.InkSoft).Padding(t.S3, t.S1, 0, t.S1)
		a.handHandedList(c)
	case len(h.items) == 0:
		about := strings.TrimSpace(h.query)
		if h.heard != nil && h.heard.About != "" {
			about = h.heard.About
		}
		ui.Column(c.Key("none")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S7, t.S4, 0, t.S4).Children(func() {
			// A name no one has is said above; the line would only say nothing.
			if h.heard == nil || len(h.heard.Unknown) == 0 {
				uiText(c.Key("h"), a.L.T("hand.found.none", "「"+about+"」")).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).TextAlign(ui.Center)
			}
			uiText(c.Key("or"), a.L.T("hand.none.or")).FontSize(t.SM).TextColor(t.InkMuted).TextAlign(ui.Center)
			ui.Box(c).Height(t.S2)
			a.handSuggest(c, true)
			a.handBrowseLink(c, true)
		})
	default:
		a.handList(c)
		a.handHandedList(c)
	}
}

// handFoundHead is the found line's head (D454): their subject when there is
// one; read by one fact alone, that fact said back (100gle 分给你的，有 4 个);
// nothing new when every match is already handed over.
func (a *App) handFoundHead(f *protocol.FindSummary, subj string) string {
	if subj != "" {
		return a.L.T("hand.found", f.N, subj)
	}
	if f.N == 0 {
		return a.L.T("hand.found.empty")
	}
	if chips := readingChips(a.ho.heard); len(chips) == 1 && chips[0].Kind != "about" {
		return a.L.T("hand.found.fact", f.N, chips[0].Text)
	}
	return a.L.T("hand.found.n", f.N)
}

// quietBecause: a row's reason that only repeats a chip the line already
// shows (every row saying 100gle 分给你的) is left off (D454).
func quietBecause(because string, said *protocol.FindSaid) bool {
	if said == nil {
		return false
	}
	for _, c := range said.Facets {
		if c.Kind != "about" && c.Text == because {
			return true
		}
	}
	return false
}

// handWhere is a to-do's number on its row: #10694 when every found one is in
// one repository (said once is enough), else nowledge-co/mem#10694 (D454).
func (a *App) handWhere(it protocol.FoundItem) string {
	if it.Item.Kind != "github" || it.Item.Where == "" {
		return it.Item.Label
	}
	h := &a.ho
	one := true
	for _, x := range h.items {
		if x.Item.Where != it.Item.Where {
			one = false
		}
	}
	for _, x := range h.handed {
		if x.Item.Where != it.Item.Where {
			one = false
		}
	}
	if one {
		return it.Item.Label
	}
	return it.Item.Where + it.Item.Label
}

// handGuessed says the name was read as the one login a single edit away,
// with 不是 {login} to read it as said (then nothing is listed until a name is picked).
func (a *App) handGuessed(c *ui.Context, g protocol.FindGuess) {
	t := a.T
	h := &a.ho
	ui.Row(c.Key("guess:"+g.Said)).Wrap().Gap(t.S2).AlignItems(ui.Center).Padding(2, 2).Role(ui.RoleStatus).Children(func() {
		uiText(c.Key("t"), a.L.T("hand.guessed", g.Login)).FontSize(t.SM).FontWeight(600).TextColor(t.Ink)
		if a.quietButton(c, "not", a.L.T("hand.guessed.not", g.Login), "", false, 0) {
			h.drop = append(h.drop, "guess:"+strings.ToLower(g.Said))
			h.dropFor = strings.TrimSpace(strings.ReplaceAll(h.query, "\n", " "))
			h.sentQuery = "\x00"
			h.queryAt = a.Now().Add(-handDebounce)
		}
	})
}

// handHandedList is the found ones already handed over (D454): their own
// group under the rest, each with what became of it and the way to its task;
// never a tick, never dropped silently.
func (a *App) handHandedList(c *ui.Context) {
	t := a.T
	h := &a.ho
	if len(h.handed) == 0 || h.finding {
		return
	}
	uiText(c.Key("gh:handed"), a.L.T("hand.g.handed")).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Padding(t.S4, t.S1, 0, t.S1).Role(ui.RoleText)
	for _, it := range h.handed {
		it := it
		st := it.Handed.State
		ui.Row(c.Key("handed:"+it.Item.Ref)).Gap(12).AlignItems(ui.Start).Padding(12, 14).Radius(16).Border(1.5, t.LineSoft).Children(func() {
			dot := t.Line2
			ink := t.InkMuted
			switch st {
			case "doing":
				dot, ink = t.Working.Dot, t.Working.Ink
			case "waiting":
				dot = t.Waiting.Dot
			case "failed":
				dot, ink = t.Failed.Dot, t.Failed.Ink
			case "done":
				dot = t.Done.Dot
			}
			ui.Box(c.Key("dot")).Width(10).Height(10).Radius(5).Background(dot).Margin(6, 0, 0, 4)
			ui.Column(c.Key("body")).Gap(6).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				uiText(c.Key("title"), it.Item.Title).FontWeight(650).TextColor(t.InkSoft)
				ui.Row(c.Key("facts")).Wrap().Gap(10).AlignItems(ui.Center).Children(func() {
					uiText(c.Key("where"), a.handWhere(it.FoundItem)).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum")
					uiText(c.Key("state"), a.L.T("hand.handed."+st)).FontSize(t.XS).FontWeight(650).TextColor(ink)
				})
			})
			if it.Handed.TaskID != "" {
				label := a.L.T("hand.handed.open")
				if st == "failed" {
					label = a.L.T("hand.handed.why")
				}
				if a.quietButton(c, "open", label, label+": "+it.Item.Title, false, 0) {
					h.open = false
					a.OpenTask(it.Handed.TaskID)
				}
			}
		})
	}
}

// handList is the found (or one-by-one) to-dos by sort group.
func (a *App) handList(c *ui.Context) {
	t := a.T
	h := &a.ho
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
			label = a.L.T("pile.g.do", a.personaName())
		}
		uiText(c.Key("gh:"+g), label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Padding(t.S4, t.S1, 0, t.S1).Role(ui.RoleText)
		for _, it := range its {
			a.handItem(c, it)
		}
	}
}

// readingChips is the reading as drawn (D428): every fact, the about last;
// none when the about alone was read (the field already shows the words).
func readingChips(s *protocol.FindSaid) []protocol.FindFacet {
	if s == nil || (len(s.Facets) == 1 && s.Facets[0].Kind == "about" && len(s.Dropped) == 0) {
		return nil
	}
	return s.Facets
}

// handReading is 找的是 / Looking for and one chip per fact; a click on one
// removes it and finds again (还原 / Put back brings them all back).
func (a *App) handReading(c *ui.Context, chips []protocol.FindFacet) {
	t := a.T
	h := &a.ho
	ui.Row(c.Key("reading")).Wrap().Gap(t.S2).AlignItems(ui.Center).Children(func() {
		uiText(c.Key("l"), a.L.T("hand.said.about")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		for _, f := range chips {
			f := f
			chip := ui.Row(c.Key("fc:"+f.Key)).Gap(6).Height(30).Padding(0, 6, 0, t.S3).Radius(15).AlignItems(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(a.L.T("hand.chip.drop", f.Text))
			if f.Kind == "about" {
				chip.Border(1.5, t.Line2)
			} else {
				chip.Background(t.SurfaceSunken)
			}
			if chip.Hovered() {
				chip.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
			}
			chip.Children(func() {
				uiText(c, f.Text).FontSize(t.SM).FontWeight(650).TextColor(t.Ink).AccessHidden(true).Shrink(1).MinWidth(0)
				uiText(c, "×").FontSize(t.SM).TextColor(t.InkMuted).AccessHidden(true)
			})
			if chip.Clicked() {
				a.meet("find") // D451: a chip dropped is the line understood
				h.drop = append(h.drop, f.Key)
				h.dropFor = strings.TrimSpace(strings.ReplaceAll(h.query, "\n", " "))
				h.sentQuery = "\x00" // found again, without it
				h.queryAt = a.Now().Add(-handDebounce)
			}
		}
		if len(h.drop) > 0 && a.quietButton(c, "undo", a.L.T("hand.chip.undo"), "", false, 0) {
			h.drop = nil
			h.sentQuery = "\x00"
			h.queryAt = a.Now().Add(-handDebounce)
		}
	})
}

// handUnknown says plainly that no one in the pile has that name, offers the
// closest logins (a click puts it in the words), and that nothing is ticked.
func (a *App) handUnknown(c *ui.Context, u protocol.FindUnknown) {
	t := a.T
	h := &a.ho
	// D441: a line in the waiting ink, not a yellow box; the rest in the muted ink.
	ui.Column(c.Key("unk:"+u.Said)).Gap(t.S2).Padding(2, 2).Role(ui.RoleAlert).Children(func() {
		ui.Row(c.Key("l")).Wrap().Gap(t.S2).AlignItems(ui.Center).Children(func() {
			uiText(c.Key("t"), a.L.T("hand.unknown", u.Said)).FontSize(t.SM).FontWeight(600).TextColor(t.Waiting.Ink)
			if len(u.Closest) > 0 {
				uiText(c.Key("c"), a.L.T("hand.unknown.closest")).FontSize(t.SM).TextColor(t.InkMuted)
			}
			for _, l := range u.Closest {
				l := l
				chip := ui.Row(c.Key("lg:"+l)).Height(28).Padding(0, t.S3).Radius(14).AlignItems(ui.Center).Background(t.Sunken).
					Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(l)
				chip.Children(func() {
					uiText(c, l).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).AccessHidden(true)
				})
				if chip.Clicked() {
					h.query = replaceLogin(h.query, u.Said, l)
					h.queryAt = a.Now().Add(-handDebounce)
				}
			}
		})
		uiText(c.Key("held"), a.L.T("hand.unknown.held")).FontSize(t.SM).TextColor(t.InkMuted)
	})
}

// replaceLogin puts the login tapped where the unknown name was said (any case, an @ before it too).
func replaceLogin(words, said, login string) string {
	lw := strings.ToLower(words)
	i := strings.Index(lw, strings.ToLower(said))
	if i < 0 {
		return words
	}
	j := i + len(said)
	if i > 0 && words[i-1] == '@' {
		i--
	}
	return words[:i] + login + words[j:]
}

// heardPart is how the words were heard: its small label and the words.
func (a *App) heardPart(c *ui.Context, key, label, words string) {
	t := a.T
	ui.Row(c.Key("hp:"+key)).Wrap().Gap(t.S2).AlignItems(ui.Baseline).Padding(t.S2, t.S3).Radius(12).Background(t.SurfaceSunken).Shrink(1).MinWidth(0).AlignSelf(ui.Start).Children(func() {
		uiText(c.Key("l"), label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		uiText(c.Key("w"), words).FontWeight(700).TextColor(t.Ink).Shrink(1).MinWidth(0)
	})
}

// handSuggest is the field's suggestions: a click says it.
func (a *App) handSuggest(c *ui.Context, center bool) {
	t := a.T
	h := &a.ho
	if len(h.suggest) == 0 {
		return
	}
	align, justify := ui.Start, ui.Start
	if center {
		align, justify = ui.Center, ui.Center
	}
	ui.Column(c.Key("suggest")).Gap(t.S2).AlignItems(align).Children(func() {
		uiText(c.Key("l"), a.L.T("hand.ask.recent")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		ui.Row(c.Key("chips")).Wrap().Gap(t.S2).Justify(justify).Children(func() {
			for _, s := range h.suggest {
				s := s
				chip := ui.Row(c.Key("sg:"+s)).Height(34).Padding(0, t.S3).Radius(17).AlignItems(ui.Center).Background(t.SurfaceSunken).
					Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(s)
				if chip.Hovered() {
					chip.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
				}
				chip.Children(func() {
					uiText(c, s).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).AccessHidden(true)
				})
				if chip.Clicked() {
					h.query, h.queryAt, h.focusFind = s, a.Now().Add(-handDebounce), true
				}
			}
		})
	})
}

// handBrowseLink is 一个个挑 / Pick one by one, with how many the do group holds.
func (a *App) handBrowseLink(c *ui.Context, center bool) {
	t := a.T
	h := &a.ho
	n := h.doCount
	if n == 0 {
		if pv := a.pileView(); pv != nil {
			n = pv.Groups["do"]
		}
	}
	link := ui.Row(c.Key("browse")).Gap(t.S2).AlignItems(ui.Center).Height(40).Padding(0, t.S3, 0, t.S4).Radius(20).Border(1, t.Line2).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(a.L.T("hand.browse"))
	if !center {
		link.AlignSelf(ui.Start)
	}
	if link.Hovered() {
		link.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
	}
	link.Children(func() {
		uiText(c, a.L.T("hand.browse")).FontWeight(700).TextColor(t.Ink).AccessHidden(true)
		if n > 0 {
			uiText(c, a.L.T("hand.browse.n", a.personaName(), n)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").AccessHidden(true)
		}
		a.glyph(c, 14, drawChevron(t.InkMuted, false))
	})
	if link.Clicked() {
		a.handBrowse(true)
	}
}

// handSkeleton is n quiet clay bars while something is being read.
func (a *App) handSkeleton(c *ui.Context, n int, h float32) {
	t := a.T
	ui.Column(c.Key("skel")).Gap(t.S2).Padding(t.S2, 0, 0, 0).Role(ui.RoleStatus).Label(a.L.T("todos.looking")).Children(func() {
		for i := 0; i < n; i++ {
			ui.Box(c.Key(fmt.Sprint("s", i))).Height(h).Radius(16).Background(t.SurfaceSunken).Opacity(1 - float32(i)*0.22)
		}
	})
}

// handItem is one to-do: its tick, title, why (a decide's question with 建议),
// facts, and 给这个的话….
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
					uiText(c.Key("title"), keepWords(autospace(it.Item.Title))).FontWeight(600).TextColor(t.Ink).MaxLines(2).Shrink(1).MinWidth(0)
				})
				if it.Group == "decide" {
					ask := it.Ask
					if ask == "" {
						ask = it.Why
					}
					uiText(c.Key("ask"), ask).TextColor(t.Ink).LineHeight(a.leading(1.45))
					if it.Pick != "" {
						ui.Row(c.Key("sugg")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
							ui.Row(c.Key("tag")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.NeedsYou.Surface).Children(func() {
								uiText(c, a.L.T("hand.suggested")).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
							})
							uiText(c.Key("pick"), a.L.TFamily("pile.pick."+it.Pick, a.personaName())).FontSize(t.SM).TextColor(t.InkSoft)
						})
					}
				} else {
					uiText(c.Key("why"), it.Why).TextColor(t.InkSoft)
				}
				ui.Row(c.Key("facts")).Wrap().Gap(10).AlignItems(ui.Center).Children(func() {
					// Where it is, as plain words (its app's mark is on the title already).
					where := a.handWhere(it)
					wl := uiText(c.Key("where"), where).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum")
					if it.Item.URL != "" {
						wl.Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(spoken(a.L, where, a.L.T("todos.chip.open", protocol.SourceKindName(it.Item.Kind))))
						if wl.Clicked() {
							c.OpenURL(it.Item.URL)
						}
					}
					// D443: the size once: no pill when the line above already says it.
					shown := it.Why
					if it.Group == "decide" && it.Ask != "" {
						shown = it.Ask
					}
					if it.Size != "" && !protocol.SizeSaid(shown, it.Size) {
						ui.Row(c.Key("size")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.SurfaceSunken).Children(func() {
							uiText(c, a.L.T("pile.size."+it.Size)).FontSize(t.XS).TextColor(t.InkMuted)
						})
					}
					// D428: why it is here, in a few words; an unsure one says so.
					if it.Because != "" && !quietBecause(it.Because, h.heard) {
						uiText(c.Key("because"), it.Because).FontSize(t.SM).TextColor(t.InkMuted).Shrink(1).MinWidth(0)
					}
					if it.Sure == "maybe" {
						// D441: a word, not a pill beside the size pill.
						uiText(c.Key("maybe"), a.L.T("hand.maybe")).FontSize(t.SM).FontWeight(600).TextColor(t.Waiting.Ink).Shrink(0)
					}
					// D415: 移出 / Take out of the chip's subject.
					if h.fromChip && h.subject != "" {
						if a.quietButton(c, "take:"+ref, a.L.T("hand.subject.take"), a.L.T("hand.subject.take.label", it.Item.Title), false, 0) {
							a.handSubject("take", h.subject, "", []string{ref})
						}
					}
				})
			})
		})
		if row.Clicked() {
			h.ticked[ref] = !on
		}
		// 给这个的话…: a quiet link, then the note's own field (only for a ticked one).
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
				link := uiText(c.Key("note-link"), a.L.T("hand.itemnote")).FontSize(t.SM).TextColor(t.InkMuted).Underline().Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
				if link.Clicked() {
					h.noteOpen[ref] = true
				}
			})
		} else {
			ui.Box(c.Key("pad")).Height(6)
		}
	})
}

// handHowCol is the right: the note, where and who (from the start, before
// anything is ticked: never a dead "looking" state), then how.
func (a *App) handHowCol(c *ui.Context) {
	t := a.T
	h := &a.ho
	name := a.personaName()
	n := len(h.handTicked())
	sec := ui.Column(c.Key("note")).Gap(t.S2)
	sec.Children(func() {
		uiText(c.Key("h"), a.L.T("hand.note", name)).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).Role(ui.RoleText)
		ta := ui.TextArea(c.Key("note-in"), &h.note).Lines(3, 8).MinHeight(0).Placeholder(a.L.T("hand.note.ph")).Label(a.L.T("hand.note", name)).
			Background(t.Surface).Border(2, t.Line2).Radius(16).Padding(t.S3, t.S4).FontSize(t.Bubble).LineHeight(a.leading(1.55))
		if ta.Focused() {
			ta.Border(2, t.Accent)
		}
		if h.step == 1 && h.note == "" && !ta.Changed() {
			ta.AutoFocus()
		}
	})
	a.enter(c, sec)
	how := h.how
	if how == nil {
		// Where and who come in a moment: their two rows, quiet.
		ui.Column(c.Key("ww-wait")).Radius(16).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).Clip().Role(ui.RoleStatus).Label(a.L.T("todos.looking")).Children(func() {
			for i, l := range []string{a.L.T("hand.where"), a.L.T("hand.who")} {
				if i > 0 {
					ui.Box(c.Key("sep")).Height(1).Background(t.LineSoft).Margin(0, t.S4)
				}
				ui.Row(c.Key(fmt.Sprint("w", i))).Gap(t.S3).AlignItems(ui.Center).MinHeight(60).Padding(0, t.S4).Children(func() {
					uiText(c, l).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(84).Shrink(0)
					ui.Box(c).Height(14).Width(140).Radius(7).Background(t.SurfaceSunken)
				})
			}
		})
		return
	}
	rows := ui.Column(c.Key("ww")).Radius(16).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line).Clip()
	rows.Children(func() {
		// 在哪儿做: the computer, and why (whole, under it).
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
	if n == 0 || (len(how.Shapes) == 0 && how.AddTo == nil) {
		return
	}
	shapes := ui.Column(c.Key("how")).Gap(t.S2).Role(ui.RoleRadioGroup).Label(a.L.T("hand.how"))
	shapes.Children(func() {
		uiText(c.Key("h"), a.L.T("hand.how")).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).Padding(0, 0, t.S1, 0)
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
				uiText(c, name).FontWeight(700).TextColor(t.Ink)
				if suggested {
					ui.Row(c.Key("sugg")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.NeedsYou.Surface).Children(func() {
						uiText(c, a.L.T("hand.suggested")).FontSize(t.XS).FontWeight(700).TextColor(t.NeedsYou.Ink)
					})
				}
			})
			uiText(c.Key("line"), line).FontSize(t.SM).TextColor(t.InkMuted)
			if why != "" && on {
				uiText(c.Key("why"), why).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).Padding(t.S1, 0, 0, 0)
			}
		})
	})
	return card.Clicked()
}

// howRow is 在哪儿做 / 谁来做: its label; the value, which wraps (a long
// computer name is never cut to "Hetzner Se…"); why under it, whole; a
// chevron when it can change. Its highlight is clipped by the group's
// corners (the group clips).
func (a *App) howRow(c *ui.Context, key, label, value, why string, can bool) bool {
	t := a.T
	row := ui.Row(c.Key("hr:"+key)).Gap(t.S3).AlignItems(ui.Center).MinHeight(60).Padding(t.S3, t.S4).Label(spoken(a.L, label, value, why))
	if can {
		row.Cursor(ui.CursorPointer).Role(ui.RolePopUpButton).Focusable()
		switch {
		case row.Pressed():
			row.Background(t.SurfaceSunken)
		case row.Hovered():
			row.Background(t.SurfaceRaised)
		}
	}
	row.Children(func() {
		uiText(c.Key("l"), label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(84).Shrink(0).AccessHidden(true)
		ui.Column(c.Key("v")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c.Key("v"), value).FontWeight(700).TextColor(t.Ink).MaxLines(2).AccessHidden(true)
			if why != "" {
				uiText(c.Key("why"), why).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.4)).AccessHidden(true)
			}
		})
		if can {
			a.glyph(c, 14, drawChevron(t.InkMuted, true))
		}
	})
	return can && row.Clicked()
}

// pickLine is one choice under 在哪儿做 / 谁来做.
func (a *App) pickLine(c *ui.Context, key, label string, on bool) bool {
	t := a.T
	row := ui.Row(c.Key("pk:"+key)).Gap(t.S2).AlignItems(ui.Center).MinHeight(40).Padding(t.S1, t.S4, t.S1, 84+t.S4+t.S3).Cursor(ui.CursorPointer).Role(ui.RoleRadio).Checked(on).Focusable().Label(label)
	switch {
	case row.Pressed():
		row.Background(t.SurfaceSunken)
	case row.Hovered():
		row.Background(t.SurfaceRaised)
	}
	row.Children(func() {
		ink := t.InkSoft
		if on {
			ink = t.Ink
		}
		uiText(c, label).FontSize(t.SM).FontWeight(600).TextColor(ink).Grow(1).Shrink(1).MinWidth(0)
		if on {
			a.glyph(c, 14, drawCheck(t.Ink))
		}
	})
	return row.Clicked()
}

// handFoot is 勾了 n 个 and the Go, its shape on its own line beneath.
func (a *App) handFoot(c *ui.Context, wide bool) {
	t := a.T
	h := &a.ho
	name := a.personaName()
	refs := h.handTicked()
	if h.filing && !h.making && len(refs) > 0 {
		a.handFiling(c)
	}
	ui.Row(c.Key("hand-foot")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S3, t.S6, t.S4, t.S6).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
		ui.Column(c.Key("l")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			// D454: the count is said once: the Go button names it (交给小鸭这 4 个).
			if len(refs) <= 1 || h.making || (!wide && h.step == 0) {
				uiText(c.Key("n"), a.L.T("hand.picked", len(refs))).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").Role(ui.RoleStatus)
			}
			if h.said != "" {
				uiText(c.Key("said"), h.said).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
			}
		})
		// D415: make mode: the primary puts the ticked ones in the new subject.
		if h.making {
			name := strings.TrimSpace(h.makeName)
			label := a.L.T("hand.subject.putin.none")
			if name != "" {
				label = a.L.T("hand.subject.putin", name)
			}
			if a.button(c, label, btnPrimary, t.ControlLG, t.Bg) && name != "" && len(refs) > 0 {
				a.handSubject("put", name, "", refs)
			}
			return
		}
		if len(refs) > 0 && !h.filing && (wide || h.step == 0) {
			if a.quietButton(c, "file", a.L.T("hand.subject.file"), "", false, 0) {
				h.filing, h.focusFile = true, true
			}
		}
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
				uiText(c.Key("shape"), sub).FontSize(t.SM).TextColor(t.InkMuted)
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
		uiText(c.Key("l"), a.L.T("hand.subjects")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(0, t.S1, 0, 0)
		// D415: the person's own first (core sends them so; kept here too).
		subs := append([]protocol.PileSubject(nil), pv.Subjects...)
		sort.SliceStable(subs, func(i, j int) bool { return subs[i].Own && !subs[j].Own })
		for _, s := range subs {
			s := s
			chip := ui.Row(c.Key("sj:"+s.Name)).Height(30).Padding(0, t.S3).Gap(t.S2).Radius(15).AlignItems(ui.Center).Background(t.SurfaceSunken).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(fmt.Sprintf("%s %d", s.Name, s.N))
			if s.Own {
				chip.Background(t.Surface).Border(1.5, t.Accent).Tooltip(a.L.T("hand.subject.own"))
			}
			if chip.Hovered() {
				chip.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
			}
			chip.Children(func() {
				uiText(c.Key("n"), s.Name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).AccessHidden(true)
				uiText(c.Key("c"), fmt.Sprint(s.N)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").AccessHidden(true)
			})
			if chip.Clicked() {
				a.openHandSubject(s.Name)
			}
		}
		if pv.SubjectsMore > 0 {
			uiText(c.Key("more"), a.L.T("hand.subjects.more", pv.SubjectsMore)).FontSize(t.SM).TextColor(t.InkMuted)
		}
		// D415: + 新的分类 / + New subject.
		add := ui.Row(c.Key("sj-new")).Height(30).Padding(0, t.S3, 0, t.S2).Gap(t.S1).Radius(15).AlignItems(ui.Center).Border(1, t.Line2).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(a.L.T("hand.subject.new"))
		if add.Hovered() {
			add.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
		}
		add.Children(func() {
			a.glyph(c, 14, drawPlus(t.InkSoft))
			uiText(c, a.L.T("hand.subject.new")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).AccessHidden(true)
		})
		if add.Clicked() {
			a.openHandMake()
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

// pileView is the pile as the home last said it (nil before it was sorted).
func (a *App) pileView() *protocol.PileView {
	if a.S.Sources == nil {
		return nil
	}
	return a.S.Sources.Pile
}
