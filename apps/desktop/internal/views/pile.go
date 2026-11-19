package views

import (
	"fmt"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D359: the pile at the head of 你的待办 / Your to-dos (design/task-sources.md
// §9, research/130), the same as the web's (apps/web/src/pile.tsx): the
// partner beside a stack of pages whose height is the count's bucket, the
// count literal beside it (还有 557 件), what was cleared today, the queue,
// and the sort's groups as rows, each with its own count and one action. A
// cleared one rolls the number down (reduced motion: in place). The sheets:
// tick what to hand over (six by default), answer each decide (the suggested
// answer marked), look over the closable ones (the sheet's button is the Go),
// and a PR's pre-read (drafted comments, sent behind the Go).

type pileState struct {
	open     bool
	group    string // do | decide | close; "" with review set
	review   string
	cid      string
	items    []protocol.PileItem
	got      bool
	picked   map[string]bool
	kept     map[string]bool
	chosen   map[string]string
	sending  bool
	said     string
	read     *protocol.PreRead
	reading  bool
	dropped  map[int]bool
	shown    int
	tickFrom int
	tickAt   time.Time
}

// pileArt is the stack's bucket: its height says roughly how much; the number says exactly.
func pileArt(open int) string {
	switch {
	case open >= 100:
		return "big"
	case open >= 20:
		return "mid"
	case open >= 1:
		return "small"
	}
	return "clear"
}

func (a *App) openPile(group string) {
	p := &a.pile
	a.nextClient++
	*p = pileState{open: true, group: group, cid: fmt.Sprintf("pile%d", a.nextClient), picked: map[string]bool{}, kept: map[string]bool{}, chosen: map[string]string{}, dropped: map[int]bool{}, shown: p.shown, tickFrom: p.tickFrom, tickAt: p.tickAt}
	a.send(protocol.PileItemsReq{T: "pile_items", Group: group, ClientID: p.cid})
}

func (a *App) openPreRead(ref string) {
	p := &a.pile
	a.nextClient++
	*p = pileState{open: true, review: ref, reading: true, cid: fmt.Sprintf("read%d", a.nextClient), picked: map[string]bool{}, kept: map[string]bool{}, chosen: map[string]string{}, dropped: map[int]bool{}, shown: p.shown, tickFrom: p.tickFrom, tickAt: p.tickAt}
	a.send(protocol.PreReadReq{T: "pre_read", Ref: ref, ClientID: p.cid})
}

// takePile reads the home's answers about the pile (by clientId).
func (a *App) takePile() {
	p := &a.pile
	r := a.S.SourceItems[p.cid]
	if r == nil {
		return
	}
	delete(a.S.SourceItems, p.cid)
	switch {
	case r.Group != "":
		p.items, p.got = r.PileItems, true
		if p.group == "do" && len(p.picked) == 0 {
			for i, x := range p.items {
				if i < protocol.PileHandDefault {
					p.picked[x.Item.Ref] = true
				}
			}
		}
	case r.PileOp == "pre_read":
		p.reading, p.read = false, r.Read
	case r.PileOp == "hand":
		p.sending = false
		if r.OK {
			p.open = false
		} else {
			p.said = r.Error
		}
	case r.PileOp == "close":
		p.sending = false
		if r.Failed > 0 {
			p.said = a.L.T("pile.close.failed", r.Failed)
		} else {
			p.open = false
		}
	case r.PileOp == "review":
		p.sending = false
		if r.OK {
			p.open = false
		} else {
			p.said = r.Error
		}
	}
}

// pileBlock is the pile at the head of the to-dos group.
func (a *App) pileBlock(c *ui.Context, pv *protocol.PileView) {
	t := a.T
	a.takePile()
	name := a.personaName()
	still := c.Preferences().ReduceMotion
	if a.pile.shown > 0 && pv.Open < a.pile.shown {
		a.pile.tickFrom, a.pile.tickAt = a.pile.shown, time.Now()
	}
	a.pile.shown = pv.Open
	card := ui.Column(c.Key("pile")).Gap(t.S3).Padding(14, 16, 12, 16).Radius(20).Background(t.Surface).Role(ui.RoleGroup)
	card.Shadow(0, 2, 0, 0, t.Line).Shadow(0, 8, 18, -12, t.Ink.Alpha(0.22))
	card.Children(func() {
		ui.Row(c.Key("pile-head")).Gap(14).AlignItems(ui.End).Children(func() {
			b := pileArt(pv.Open)
			if src := theme.Clay("pile_" + b); src != nil {
				ui.Image(c.Key("pile-art-"+b), src).Size(160, 128).Shrink(0).Label(a.L.T("pile.art."+b, name))
			}
			ui.Column(c.Key("pile-facts")).Gap(4).Padding(0, 0, 6, 0).Shrink(1).MinWidth(0).Children(func() {
				if pv.Open == 0 {
					ui.Text(c.Key("clear"), a.L.T("pile.clear")).Font(t.Display).FontSize(t.XL).FontWeight(700).TextColor(t.Ink)
				} else {
					ui.Row(c.Key("count")).Gap(6).AlignItems(ui.Baseline).Role(ui.RoleStatus).Children(func() {
						if w := a.L.T("pile.left.before"); w != "" {
							ui.Text(c.Key("before"), w).Font(t.Display).FontSize(t.MD).FontWeight(600).TextColor(t.InkSoft)
						}
						n := fmt.Sprint(pv.Open)
						if pv.AtLeast {
							n += "+"
						}
						num := ui.Text(c.Key("n"), n).Font(t.Display).FontSize(34).FontWeight(800).TextColor(t.Ink).FontFeatures("tnum")
						// The roll: the new number drops in from above (none under reduced motion).
						if !still && time.Since(a.pile.tickAt) < 300*time.Millisecond {
							k := float32(time.Since(a.pile.tickAt)) / float32(300*time.Millisecond)
							num.Translate(0, -14*(1-k)).Opacity(0.3 + 0.7*k)
							c.Invalidate()
						}
						ui.Text(c.Key("after"), a.L.T("pile.left.after")).Font(t.Display).FontSize(t.MD).FontWeight(600).TextColor(t.InkSoft)
					})
				}
				if pv.ClearedToday > 0 {
					ui.Text(c.Key("day"), a.L.T("pile.today", pv.ClearedToday)).FontSize(t.MD).FontWeight(600).TextColor(t.Done.Ink)
				}
				if pv.Queue.Running > 0 || pv.Queue.Waiting > 0 {
					ui.Row(c.Key("queue")).Gap(12).Children(func() {
						if pv.Queue.Running > 0 {
							ui.Text(c.Key("run"), a.L.T("pile.running", pv.Queue.Running)).FontSize(t.SM).FontWeight(600).TextColor(t.Working.Ink)
						}
						if pv.Queue.Waiting > 0 {
							ui.Text(c.Key("wait"), a.L.T("pile.waiting", pv.Queue.Waiting)).FontSize(t.SM).TextColor(t.InkMuted)
						}
					})
				}
			})
		})
		sorted := pv.SortedAt != "" && pv.Read > 0
		switch {
		case pv.Sorting != nil:
			ui.Column(c.Key("sorting")).Gap(6).Role(ui.RoleStatus).Children(func() {
				ui.Text(c.Key("line"), a.L.T("pile.sorting")).FontWeight(600).TextColor(t.Working.Ink)
				frac := float32(pv.Sorting.Read) / float32(max(1, pv.Sorting.Of))
				ui.Box(c.Key("bar")).Height(8).Radius(4).Background(t.Sunken).Children(func() {
					ui.Box(c.Key("fill")).Height(8).Radius(4).WidthPercent(100 * frac).Background(t.Working.Dot)
				})
				ui.Row(c.Key("facts")).Gap(12).Children(func() {
					ui.Text(c.Key("r"), a.L.T("pile.sorting.read", pv.Sorting.Read)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum")
					ui.Text(c.Key("o"), a.L.T("pile.sorting.of", pv.Sorting.Of)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum")
				})
			})
		case sorted:
			a.pileSubjects(c, pv) // D385: 讲的是 / Subjects
			ui.Column(c.Key("rows")).Children(func() {
				g := pv.Groups
				if g["do"] > 0 {
					a.pileRow(c, "do", g["do"], a.L.T("pile.g.do", name), "", a.L.T("pile.act.do", name), btnPrimary)
				}
				if g["decide"] > 0 {
					a.pileRow(c, "decide", g["decide"], a.L.T("pile.g.decide"), "", a.L.T("pile.act.decide"), btnSecondary)
				}
				if g["close"] > 0 {
					a.pileRow(c, "close", g["close"], a.L.T("pile.g.close"), a.L.T("pile.g.close.note"), a.L.T("pile.act.close"), btnSecondary)
				}
				if g["later"] > 0 {
					a.pileRow(c, "later", g["later"], a.L.T("pile.g.later"), "", "", btnText)
				}
				if pv.Unread > 0 {
					a.pileRow(c, "unread", pv.Unread, a.L.T("pile.g.unread"), "", "", btnText)
				}
			})
		case pv.Open > 0:
			ui.Row(c.Key("first")).Gap(12).AlignItems(ui.Center).Children(func() {
				ui.Text(c.Key("lede"), a.L.T("pile.first.lede", name)).TextColor(t.InkSoft).Grow(1).Shrink(1).MinWidth(0)
				if a.button(c, a.L.T("pile.first"), btnPrimary, t.ControlMD, t.Surface) {
					a.send(protocol.PileReq{T: "pile_sort"})
				}
			})
		}
		if pv.Failed != "" && pv.Sorting == nil {
			ui.Text(c.Key("failed"), a.L.T("pile.failed."+pv.Failed)).FontSize(t.SM).TextColor(t.Waiting.Ink)
		}
		if sorted && pv.Sorting == nil {
			ui.Row(c.Key("foot")).Gap(12).AlignItems(ui.Center).Children(func() {
				ui.Text(c.Key("when"), a.L.T("pile.sorted", a.agoLong(pv.SortedAt))).FontSize(t.SM).TextColor(t.InkMuted)
				ui.Spacer(c)
				if a.button(c, a.L.T("pile.again"), btnText, t.ControlMD, t.Surface) {
					a.send(protocol.PileReq{T: "pile_sort"})
				}
			})
		}
	})
}

// pileRow is one group: its name (and note), its count, its one action; 52 tall.
func (a *App) pileRow(c *ui.Context, key string, n int, label, note, act string, kind btnKind) {
	t := a.T
	muted := act == ""
	ui.Row(c.Key("row:"+key)).Gap(12).AlignItems(ui.Center).MinHeight(52).Padding(4, 0).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
		ui.Column(c.Key("text")).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ink := t.Ink
			if muted {
				ink = t.InkMuted
			}
			ui.Text(c.Key("label"), label).FontWeight(600).TextColor(ink)
			if note != "" {
				ui.Text(c.Key("note"), note).FontSize(t.XS).TextColor(t.InkMuted)
			}
		})
		ink := t.Ink
		if muted {
			ink = t.InkMuted
		}
		ui.Text(c.Key("n"), fmt.Sprint(n)).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(ink).FontFeatures("tnum")
		if act == "" {
			ui.Box(c.Key("gap")).Width(96)
			return
		}
		ui.Box(c.Key("act")).MinWidth(96).Children(func() {
			if a.buttonFor(c, act, label, kind, t.ControlMD, t.Surface) {
				if key == "do" {
					a.openHandDo() // D385: the hand-over sheet
				} else {
					a.openPile(key)
				}
			}
		})
	})
}

// pileReadLine is 我看过了 on a review request's card: the counts apart (D291), 看看.
func (a *App) pileReadLine(c *ui.Context, g protocol.SourceGlance) {
	if g.Read == nil {
		return
	}
	t := a.T
	r := g.Read
	row := ui.Row(c.Key("read")).Gap(10).AlignItems(ui.Center).MinHeight(44).Padding(6, 12).Radius(t.RadiusSM).Background(t.Sunken).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(a.L.T("pile.read.line"))
	row.Children(func() {
		ui.Text(c.Key("who"), a.L.T("pile.read.line")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink)
		switch {
		case r.State == "sent":
			ui.Text(c.Key("sent"), a.L.T("pile.read.sent")).FontSize(t.SM).TextColor(t.InkSoft)
		case r.Problems+r.Suggestions == 0:
			ui.Text(c.Key("clean"), a.L.T("pile.read.clean")).FontSize(t.SM).TextColor(t.InkSoft)
		default:
			if r.Problems > 0 {
				ui.Text(c.Key("p"), a.nCount("pile.read.problems", r.Problems)).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink)
			}
			if r.Suggestions > 0 {
				ui.Text(c.Key("s"), a.nCount("pile.read.suggestions", r.Suggestions)).FontSize(t.SM).TextColor(t.InkSoft)
			}
		}
		ui.Spacer(c)
		ui.Text(c.Key("see"), a.L.T("pile.read.see")).FontSize(t.SM).FontWeight(600).TextColor(t.Ink)
	})
	if row.Clicked() {
		a.openPreRead(g.Ref)
	}
}

// pileSheet is the pile's sheet over the window: one group's to-dos, or a PR's pre-read.
func (a *App) pileSheet(c *ui.Context) {
	p := &a.pile
	if !p.open {
		return
	}
	a.takePile()
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 760
	}
	name := a.personaName()
	title := a.L.T("pile.read.title")
	if p.group == "do" {
		title = a.L.T("pile.g.do", name)
	} else if p.group != "" {
		title = a.L.T("pile.g." + p.group)
	}
	open := true
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 760)).MaxHeight(sheetBack(c, back, h)).Radius(t.RadiusXL).Background(t.Bg).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title)
		a.enter(c, panel)
		ui.Row(c.Key("pile-head")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S5, t.S6, t.S2, t.S6).Children(func() {
			a.heading(c, title, t.XL).Shrink(1).MinWidth(0)
			if p.got && p.group != "" {
				ui.Text(c.Key("n"), fmt.Sprint(len(p.items))).Font(t.Display).FontSize(t.LG).TextColor(t.InkMuted).FontFeatures("tnum")
			}
			ui.Spacer(c)
			if a.button(c, a.L.T("pile.close.x"), btnText, t.ControlMD, t.Bg) {
				p.open = false
			}
		})
		ui.Scroll(c.Key("pile-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S1, t.S6, t.S4, t.S6).Gap(t.S2).Children(func() {
				switch {
				case p.review != "":
					a.pileReadBody(c)
				case !p.got:
					ui.Text(c.Key("looking"), a.L.T("todos.looking")).TextColor(t.InkSoft)
				case len(p.items) == 0:
					ui.Text(c.Key("empty"), a.L.T("pile.empty")).TextColor(t.InkSoft)
				default:
					a.pileItemsBody(c)
				}
			})
		})
		a.pileGo(c)
	})
	if !open {
		p.open = false
	}
}

func (a *App) pileItemsBody(c *ui.Context) {
	t := a.T
	p := &a.pile
	name := a.personaName()
	lede := map[string]string{"do": a.L.T("pile.do.lede", protocol.PileCap), "decide": a.L.T("pile.decide.lede"), "close": a.L.T("pile.close.lede")}[p.group]
	ui.Text(c.Key("lede"), lede).TextColor(t.InkSoft).LineHeight(1.5)
	for _, it := range p.items {
		it := it
		ref := it.Item.Ref
		dim := (p.group == "close" && p.kept[ref]) || (p.group == "decide" && p.chosen[ref] != "")
		row := ui.Row(c.Key("it:"+ref)).Gap(12).AlignItems(ui.Start).Padding(12, 14).Radius(16).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line)
		if dim {
			row.Opacity(0.62)
		}
		if p.group == "do" {
			row.Cursor(ui.CursorPointer).Role(ui.RoleCheckBox).Focusable().Label(it.Item.Title)
		}
		row.Children(func() {
			if p.group == "do" {
				on := p.picked[ref]
				bg, border := t.Surface, t.Line2
				if on {
					bg, border = t.Accent, t.Accent
				}
				ui.Box(c.Key("tick")).Size(24, 24).Radius(7).Background(bg).Border(1.5, border).AlignItems(ui.Center).Justify(ui.Center).Shrink(0).Children(func() {
					if on {
						a.glyph(c, 16, drawCheck(t.OnAccent))
					}
				})
			}
			ui.Column(c.Key("body")).Gap(6).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				ui.Row(c.Key("head")).Gap(8).AlignItems(ui.Center).Children(func() {
					a.todoMark(c, it.Item.Kind, 22)
					ui.Text(c.Key("title"), keepWords(autospace(it.Item.Title))).FontWeight(600).TextColor(t.Ink).MaxLines(2).Shrink(1).MinWidth(0)
				})
				if p.group == "decide" {
					ask := it.Ask
					if ask == "" {
						ask = it.Why
					}
					ui.Text(c.Key("ask"), ask).FontWeight(600).TextColor(t.Ink)
				} else {
					ui.Text(c.Key("why"), it.Why).TextColor(t.InkSoft)
				}
				ui.Row(c.Key("facts")).Wrap().Gap(10).AlignItems(ui.Center).Children(func() {
					a.todoChip(c, "pile:"+ref, it.Item.SourceItemRef)
					if it.Size != "" {
						ui.Row(c.Key("size")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.SurfaceSunken).Children(func() {
							ui.Text(c, a.L.T("pile.size."+it.Size)).FontSize(t.XS).TextColor(t.InkMuted)
						})
					}
				})
				if p.group == "close" && !p.kept[ref] && it.Comment != "" {
					ui.Column(c.Key("says")).Gap(2).Padding(8, 10).Radius(t.RadiusSM).Background(t.Sunken).Children(func() {
						ui.Text(c.Key("l"), a.L.T("pile.close.says")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
						ui.Text(c.Key("t"), it.Comment).TextColor(t.Ink)
					})
				}
				if p.group == "decide" {
					if ch := p.chosen[ref]; ch != "" {
						ui.Text(c.Key("picked"), a.L.T("pile.picked."+ch, name)).FontWeight(600).TextColor(t.Done.Ink)
					} else {
						ui.Row(c.Key("picks")).Wrap().Gap(8).Children(func() {
							for _, k := range []string{"hand", "close", "later"} {
								kind := btnSecondary
								if it.Pick == k {
									kind = btnPrimary
								}
								if a.buttonFor(c.Key("pick:"+k), a.L.T("pile.pick."+k, name), it.Item.Title, kind, t.ControlMD, t.Surface) {
									p.chosen[ref] = k
									a.send(protocol.PileChooseReq{T: "pile_choose", Ref: ref, Pick: k})
								}
								// The suggested answer says so beside it, its own element (D291).
								if it.Pick == k {
									ui.Text(c.Key("sugg:"+k), a.L.T("pile.decide.suggested")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).AlignSelf(ui.Center)
								}
							}
						})
					}
				}
			})
			if p.group == "close" {
				label := a.L.T("pile.close.keep")
				kind := btnSecondary
				if p.kept[ref] {
					label, kind = a.L.T("pile.close.kept"), btnText
				}
				if a.buttonFor(c.Key("keep"), label, it.Item.Title, kind, t.ControlMD, t.Surface) {
					pick := "keep"
					if p.kept[ref] {
						pick = "close"
					}
					p.kept[ref] = !p.kept[ref]
					a.send(protocol.PileChooseReq{T: "pile_choose", Ref: ref, Pick: pick})
				}
			}
		})
		if p.group == "do" && row.Clicked() {
			p.picked[ref] = !p.picked[ref]
		}
	}
}

func (a *App) pileReadBody(c *ui.Context) {
	t := a.T
	p := &a.pile
	if p.reading {
		ui.Text(c.Key("reading"), a.L.T("pile.read.reading")).TextColor(t.InkSoft)
		return
	}
	r := p.read
	if r == nil {
		ui.Text(c.Key("none"), a.L.T("pile.read.none")).TextColor(t.InkSoft)
		return
	}
	ui.Text(c.Key("title"), r.Title).FontWeight(600).TextColor(t.Ink)
	if r.Gist != "" {
		ui.Text(c.Key("gist"), r.Gist).TextColor(t.InkSoft)
	}
	for i, n := range r.Notes {
		i, n := i, n
		off := p.dropped[i]
		row := ui.Row(c.Key(fmt.Sprint("note", i))).Gap(12).AlignItems(ui.Start).Padding(12, 14).Radius(16).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line)
		if off {
			row.Opacity(0.62)
		}
		row.Children(func() {
			ui.Column(c.Key("body")).Gap(6).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				ui.Row(c.Key("head")).Gap(10).AlignItems(ui.Center).Children(func() {
					bg, ink := t.Waiting.Surface, t.Waiting.Ink
					if n.Kind == "problem" {
						bg, ink = t.NeedsYou.Surface, t.NeedsYou.Ink
					}
					ui.Row(c.Key("kind")).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(bg).Children(func() {
						ui.Text(c, a.L.T("pile.read."+n.Kind)).FontSize(t.XS).FontWeight(700).TextColor(ink)
					})
					if n.Path != "" {
						where := n.Path
						if n.Line > 0 {
							where = fmt.Sprintf("%s:%d", n.Path, n.Line)
						}
						ui.Text(c.Key("where"), where).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted)
					}
				})
				ui.Text(c.Key("text"), n.Text).TextColor(t.Ink).LineHeight(1.5)
			})
			if r.State == "drafted" {
				label, kind := a.L.T("pile.read.drop"), btnSecondary
				if off {
					label, kind = a.L.T("pile.read.dropped"), btnText
				}
				if a.buttonFor(c.Key("drop"), label, n.Text, kind, t.ControlMD, t.Surface) {
					p.dropped[i] = !off
				}
			}
		})
	}
}

// pileGo is the sheet's foot: its one action (the Go for a close batch or a review).
func (a *App) pileGo(c *ui.Context) {
	t := a.T
	p := &a.pile
	name := a.personaName()
	ui.Column(c.Key("pile-go")).Gap(t.S2).Padding(t.S3, t.S6, t.S5, t.S6).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
		if p.said != "" {
			ui.Text(c.Key("said"), p.said).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
		}
		switch {
		case p.group == "do" && p.got:
			refs := []string{}
			for _, it := range p.items {
				if p.picked[it.Item.Ref] {
					refs = append(refs, it.Item.Ref)
				}
			}
			label := a.L.T("pile.do.none")
			if len(refs) > 0 {
				label = a.L.T("pile.do.go", name, len(refs))
			}
			if a.button(c, label, btnPrimary, t.ControlLG, t.Bg) && len(refs) > 0 && !p.sending {
				p.sending = true
				a.send(protocol.PileRefsReq{T: "pile_hand", Refs: refs, ClientID: p.cid})
			}
		case p.group == "close" && p.got:
			refs := []string{}
			for _, it := range p.items {
				if !p.kept[it.Item.Ref] {
					refs = append(refs, it.Item.Ref)
				}
			}
			ui.Row(c.Key("row")).Gap(10).Children(func() {
				if a.button(c, a.L.T("pile.close.hold"), btnSecondary, t.ControlLG, t.Bg) {
					p.open = false
				}
				if a.button(c, a.L.T("pile.close.go", len(refs)), btnPrimary, t.ControlLG, t.Bg) && len(refs) > 0 && !p.sending {
					p.sending = true
					a.send(protocol.PileRefsReq{T: "pile_close", Refs: refs, ClientID: p.cid})
					p.open = false // the pile is watched ticking down underneath
				}
			})
			ui.Text(c.Key("foot"), a.L.T("pile.close.foot")).FontSize(t.SM).TextColor(t.InkMuted)
		case p.review != "" && p.read != nil && p.read.State == "drafted" && len(p.read.Notes) > 0:
			keep := []int{}
			for i := range p.read.Notes {
				if !p.dropped[i] {
					keep = append(keep, i)
				}
			}
			ui.Row(c.Key("row")).Gap(10).Children(func() {
				if a.button(c, a.L.T("pile.read.hold"), btnSecondary, t.ControlLG, t.Bg) {
					p.open = false
				}
				if a.button(c, a.L.T("pile.read.go", len(keep)), btnPrimary, t.ControlLG, t.Bg) && len(keep) > 0 && !p.sending {
					p.sending = true
					a.send(protocol.PreReadSendReq{T: "pre_read_send", Ref: p.read.Ref, Keep: keep, ClientID: p.cid})
				}
			})
			ui.Text(c.Key("foot"), a.L.T("pile.read.foot")).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
}
