package views

// D385: the cards a hand-over brings (design/handover.md §4–§6): the set card
// under the partner's line ("把…拉出来看看"), plan first's card ({group}：方案,
// in the conversation and inside its group's card on On hand), the hand-over
// group's own facts, and 一起过目 / Review together's sheet. The web draws
// the same (apps/web/src/handover-cards.tsx).

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// ---------- the set card ----------

// setTicks is a set card's ticks (the card's own; the do ones at first).
func (a *App) setTicks(s *protocol.TodoSet) map[string]bool {
	if a.sets == nil {
		a.sets = map[string]map[string]bool{}
	}
	m := a.sets[s.SetID]
	if m == nil {
		m = map[string]bool{}
		for _, r := range s.Ticked {
			m[r] = true
		}
		a.sets[s.SetID] = m
	}
	return m
}

// setCard is a set found in the conversation: its subject and count, the first
// rows to tick, 还有 n 件, and the way to the sheet (or, handed, where it went).
func (a *App) setCard(c *ui.Context, e *store.Entry) {
	t := a.T
	s := e.Set
	name := a.personaName()
	ticks := a.setTicks(s)
	n := 0
	for _, r := range s.Refs {
		if ticks[r] {
			n++
		}
	}
	handed := s.GroupID != ""
	subj := firstNonEmpty(s.Subject, s.Found.Subject, s.Query)
	card := ui.Column(c.Key("set:"+s.SetID)).Gap(t.S2).Padding(t.S4, t.S4, t.S3, t.S4).MaxWidth(t.BubbleMeasure).MaxWidthPercent(88).
		Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleGroup).Label(subj)
	a.enter(c, card)
	card.Children(func() {
		ui.Row(c.Key("head")).Gap(t.S2).AlignItems(ui.Baseline).Children(func() {
			a.heading(c, subj, t.XL).Shrink(1).MinWidth(0)
			uiText(c.Key("n"), a.L.T("hand.set.n", len(s.Refs))).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum")
		})
		// D428: how the words were read, one chip per fact (changed on the sheet).
		if chips := readingChips(&protocol.FindSaid{Facets: s.Facets}); len(chips) > 0 && !handed {
			ui.Row(c.Key("reading")).Wrap().Gap(6).Children(func() {
				for _, f := range chips {
					ui.Row(c.Key("fc:"+f.Key)).Height(24).Padding(0, t.S2).Radius(12).AlignItems(ui.Center).Background(t.SurfaceSunken).Children(func() {
						uiText(c, f.Text).FontSize(t.XS).FontWeight(650).TextColor(t.InkSoft)
					})
				}
			})
		}
		for _, it := range s.Rows {
			it := it
			ref := it.Item.Ref
			on := ticks[ref]
			row := ui.Row(c.Key("r:"+ref)).Gap(t.S3).AlignItems(ui.Center).MinHeight(40).Padding(t.S1, t.S2).Radius(12).Label(it.Item.Title)
			if !handed {
				row.Cursor(ui.CursorPointer).Role(ui.RoleCheckBox).Checked(on).Focusable()
				if row.Hovered() {
					row.Background(t.SurfaceSunken)
				}
			} else {
				row.Opacity(0.7)
			}
			row.Children(func() {
				bg, border := t.Surface, t.Line2
				if on {
					bg, border = t.Accent, t.Accent
				}
				tick := ui.Box(c.Key("tick")).Size(20, 20).Radius(6).Background(bg).Border(1.5, border).AlignItems(ui.Center).Justify(ui.Center).Shrink(0).AccessHidden(true).Children(func() {
					if on {
						a.glyph(c, 13, drawCheck(t.OnAccent))
					}
				})
				a.popOn(c, tick, on)
				uiText(c.Key("l"), refLabel(ref)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).FontFeatures("tnum").Shrink(0)
				uiText(c.Key("t"), keepWords(autospace(it.Item.Title))).FontSize(t.SM).TextColor(t.Ink).SingleLine().Grow(1).Shrink(1).MinWidth(0).Tooltip(it.Item.Title)
				if it.Group != "do" {
					uiText(c.Key("g"), a.L.T("pile.g."+it.Group)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
				}
			})
			if !handed && row.Clicked() {
				ticks[ref] = !on
			}
		}
		if more := len(s.Refs) - len(s.Rows); more > 0 {
			uiText(c.Key("more"), a.L.T("hand.set.more", more)).FontSize(t.SM).TextColor(t.InkMuted).Padding(0, t.S2)
		}
		if handed {
			ui.Row(c.Key("handed")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S2, 0, t.S2).Children(func() {
				a.glyph(c, 14, drawCheck(t.Done.Ink))
				uiText(c, a.L.T("hand.set.handed", name)).FontSize(t.SM).FontWeight(600).TextColor(t.Done.Ink)
			})
			return
		}
		ui.Column(c.Key("acts")).Gap(t.S1).Padding(t.S2, 0, 0, 0).Children(func() {
			label := a.L.T("pile.do.none")
			if n > 0 {
				label = a.L.T("hand.set.go", name, n)
			}
			ui.Row(c).Children(func() {
				if a.buttonFor(c, label, subj, btnPrimary, t.ControlMD, t.Surface) {
					a.openHandSet(s, ticks)
				}
			})
			uiText(c.Key("or"), a.L.T("hand.set.or")).FontSize(t.SM).TextColor(t.InkMuted)
		})
	})
}

// ---------- the plan card ----------

// handGroup is a group by its id, as On hand last said.
func (a *App) handGroup(id string) *protocol.TaskGroup {
	if a.S.OnHand == nil || id == "" {
		return nil
	}
	for i := range a.S.OnHand.Groups {
		if a.S.OnHand.Groups[i].ID == id {
			return &a.S.OnHand.Groups[i]
		}
	}
	return nil
}

func (a *App) planNotesOf(id string) map[string]string {
	if a.planNotes == nil {
		a.planNotes = map[string]map[string]string{}
	}
	m := a.planNotes[id]
	if m == nil {
		m = map[string]string{}
		a.planNotes[id] = m
	}
	return m
}

// planAnswer sends the card's answer; the card says it at once.
func (a *App) planAnswer(d *store.DecisionState, option, text string) {
	src := d.Src
	if src == nil {
		return
	}
	notes := map[string]string{}
	for k, v := range a.planNotesOf(d.DecisionID) {
		if v = strings.TrimSpace(v); v != "" {
			notes[k] = v
		}
	}
	if len(notes) == 0 {
		notes = nil
	}
	if d.Resolved == nil {
		d.Pending, d.AnsweredAt = option, a.Now()
	}
	if a.planReply != nil {
		delete(a.planReply, d.DecisionID)
	}
	a.markRead()
	a.send(protocol.PlanAnswerReq{T: "plan_answer", GroupID: src.GroupID, Option: option, Text: strings.TrimSpace(text), Notes: notes})
}

// handPlanCard is {group}：方案: what it read, the plan in the shapes' own words
// (each part with 给这件的话…), the note's limits as separate facts, and 照这个做
// / 先等等 / 回复…. No default runs on it: it has no countdown.
func (a *App) handPlanCard(c *ui.Context, d *store.DecisionState, inGroup bool) {
	t := a.T
	src := d.Src
	plan := src.Plan
	g := a.handGroup(src.GroupID)
	var pv *protocol.GroupPlanView
	if g != nil && g.Hand != nil {
		pv = g.Hand.Plan
	}
	state := "ready"
	if pv != nil {
		state = pv.State
	}
	if d.Resolved != nil && pv == nil {
		state = map[string]string{"go": "going", "hold": "held", "reply": "planning"}[d.Resolved.Option]
	}
	if d.Pending != "" {
		state = map[string]string{"go": "going", "hold": "held", "reply": "planning"}[d.Pending]
	}
	// A newer plan replaced this one (a reply): this card says so, quietly.
	stale := pv != nil && pv.DecisionID != "" && pv.DecisionID != d.DecisionID
	waiting := !stale && (state == "ready" || state == "held")
	notes := a.planNotesOf(d.DecisionID)
	card := ui.Column(c.Key("plan:"+d.DecisionID)).Gap(t.S3).Padding(t.S5-2, t.S5-2, t.S4, t.S5-2).Radius(t.RadiusLG).Background(t.Surface).Role(ui.RoleGroup).Label(d.Question)
	if !inGroup {
		card.MaxWidth(t.BubbleMeasure + 80).MaxWidthPercent(90)
	}
	if waiting {
		card.Border(1.5, t.NeedsYou.Ledge).Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge)
	} else {
		card.Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color)
	}
	// 看方案 from On hand: the card is found (its edge deepens once, it lifts a little).
	if k := a.foundAt(c, d.Seq, ""); k > 0 && !inGroup {
		card.Border(1.5+1.5*k, t.NeedsYou.Ledge.Mix(t.NeedsYou.Ink, 0.6*k))
		if !c.Preferences().ReduceMotion {
			s := 1 + 0.012*k
			card.Scale(s, s)
		}
	}
	a.enter(c, card)
	card.Children(func() {
		ui.Column(c.Key("head")).Gap(t.S1).Children(func() {
			a.heading(c, autospace(d.Question), t.XL)
			if plan != nil {
				read := a.L.T("hand.plan.read.n", plan.Read.N)
				if plan.Read.Repo != "" {
					read = a.L.T("hand.plan.read", plan.Read.N, plan.Read.Repo)
				}
				uiText(c.Key("read"), read).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
		if plan == nil {
			if pv != nil && pv.Summary != "" {
				uiText(c.Key("summary"), autospace(pv.Summary)).TextColor(t.Ink).LineHeight(a.leading(1.5))
			}
			uiText(c.Key("sgo"), a.L.T("hand.plan.summary.go")).FontSize(t.SM).TextColor(t.InkMuted)
		} else {
			section := func(key, label string, body func()) {
				ui.Column(c.Key("sec:" + key)).Gap(t.S2).Children(func() {
					uiText(c.Key("l"), label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Role(ui.RoleText)
					body()
				})
			}
			tile := func(key, label, why string, step int, part string) {
				ui.Column(c.Key("p:"+key)).Gap(t.S1).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
					ui.Row(c.Key("h")).Gap(t.S2).AlignItems(ui.Baseline).Children(func() {
						if step > 0 {
							uiText(c.Key("s"), fmt.Sprint(step)).FontWeight(800).TextColor(t.InkMuted).FontFeatures("tnum").Label(a.L.T("group.part", step))
						}
						uiText(c.Key("r"), label).FontWeight(800).TextColor(t.Ink).FontFeatures("tnum")
					})
					if why != "" {
						uiText(c.Key("w"), autospace(why)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.45))
					}
					if part == "" || !waiting {
						if n := notes[part]; n != "" {
							uiText(c.Key("nt"), n).FontSize(t.SM).TextColor(t.Ink).Padding(t.S1, 0, 0, 0)
						}
						return
					}
					n := notes[part]
					if a.planNoteOpen(d.DecisionID, part) || n != "" {
						ta := ui.TextArea(c.Key("nt-in"), &n).Lines(1, 3).MinHeight(0).Placeholder(a.L.T("hand.itemnote")).Label(a.L.T("hand.itemnote.label")).
							Background(t.Surface).Radius(10).Padding(t.S1+2, t.S2+2).FontSize(t.SM)
						if ta.Changed() {
							notes[part] = n
						}
						if a.planNoteOpen(d.DecisionID, part) {
							ta.Focus()
							a.setPlanNoteOpen(d.DecisionID, part, false)
						}
						return
					}
					link := uiText(c.Key("nt-link"), a.L.T("hand.itemnote")).FontSize(t.SM).TextColor(t.InkMuted).Underline().Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
					if link.Clicked() {
						a.setPlanNoteOpen(d.DecisionID, part, true)
					}
				})
			}
			if len(plan.Fixed) > 0 {
				section("fixed", a.L.T("hand.plan.fixed"), func() {
					for _, f := range plan.Fixed {
						tile("f"+f.Ref, refLabel(f.Ref), a.L.T("hand.plan.fixed.where", f.Where), 0, "")
					}
				})
			}
			if len(plan.One) > 0 {
				section("one", a.L.T("hand.shape.one"), func() {
					for _, p := range plan.One {
						tile(p.ID, refsLabel(p.Refs), firstNonEmpty(p.Why, p.Title), 0, p.ID)
					}
				})
			}
			if len(plan.Line) > 0 {
				section("line", a.L.T("hand.shape.one_by_one"), func() {
					for i, p := range plan.Line {
						tile(p.ID, refsLabel(p.Refs), firstNonEmpty(p.Why, p.Title), i+1, p.ID)
					}
				})
			}
			if len(plan.Side) > 0 {
				section("side", a.L.T("hand.shape.side_by_side"), func() {
					for _, p := range plan.Side {
						tile(p.ID, refsLabel(p.Refs), firstNonEmpty(p.Why, p.Title), 0, p.ID)
					}
				})
			}
			if len(plan.Later) > 0 {
				section("later", a.L.T("hand.plan.later"), func() {
					for _, l := range plan.Later {
						tile("l"+l.Ref, refLabel(l.Ref), l.Why, 0, "")
					}
				})
			}
			if len(plan.Limits) > 0 {
				ui.Row(c.Key("limits")).Wrap().Gap(t.S2).Children(func() {
					for i, l := range plan.Limits {
						ui.Row(c.Key(fmt.Sprint("lim", i))).Height(30).Padding(0, t.S3).Radius(15).AlignItems(ui.Center).Background(t.SurfaceSunken).Children(func() {
							uiText(c, l).FontSize(t.SM).TextColor(t.InkSoft)
						})
					}
				})
			}
		}
		// The answer: 照这个做 / 先等等 / 回复…, or where it stands.
		switch {
		case stale:
			uiText(c.Key("st"), a.L.T("hand.plan.replied")).FontSize(t.SM).TextColor(t.InkMuted)
		case state == "going":
			ui.Row(c.Key("st")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 14, drawCheck(t.Done.Ink))
				uiText(c, a.L.T("hand.plan.going")).FontSize(t.SM).FontWeight(600).TextColor(t.Done.Ink)
			})
		case state == "planning":
			uiText(c.Key("st"), a.L.T("hand.plan.replied")).FontSize(t.SM).TextColor(t.Working.Ink)
		default:
			if state == "held" {
				uiText(c.Key("st"), a.L.T("hand.plan.held")).FontSize(t.SM).TextColor(t.InkMuted)
			}
			about := d.Question
			ui.Row(c.Key("acts")).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, a.L.T("hand.plan.go"), about, btnPrimary, t.ControlMD, t.Surface) {
					a.planAnswer(d, "go", "")
				}
				if state != "held" && a.buttonFor(c, a.L.T("hand.plan.hold"), about, btnSecondary, t.ControlMD, t.Surface) {
					a.planAnswer(d, "hold", "")
				}
				if a.buttonFor(c, a.L.T("hand.plan.reply"), about, btnText, t.ControlMD, t.Surface) {
					if a.planReply == nil {
						a.planReply = map[string]*string{}
					}
					if a.planReply[d.DecisionID] == nil {
						s := ""
						a.planReply[d.DecisionID] = &s
					} else {
						delete(a.planReply, d.DecisionID)
					}
				}
			})
			if r := a.planReply[d.DecisionID]; r != nil {
				ui.Row(c.Key("reply")).Gap(t.S2).AlignItems(ui.End).Children(func() {
					ta := ui.TextArea(c.Key("in"), r).Lines(1, 4).MinHeight(0).Placeholder(a.L.T("hand.plan.reply.ph")).Label(a.L.T("hand.plan.reply")).AutoFocus().
						Background(t.SurfaceSunken).Radius(12).Padding(t.S2, t.S3).Grow(1).MinWidth(0).
						OnTextKey(func(k ui.TextKey) bool {
							if k.Key == ui.KeyEnter && k.Mods == 0 {
								if txt := strings.TrimSpace(k.Text()); txt != "" {
									a.planAnswer(d, "reply", txt)
								}
								return true
							}
							return false
						})
					_ = ta
					if a.buttonFor(c, a.L.T("hand.plan.reply.send"), about, btnSecondary, t.ControlMD, t.Surface) && strings.TrimSpace(*r) != "" {
						a.planAnswer(d, "reply", *r)
					}
				})
			}
		}
	})
}

// A plan part's note field opened by its link (focused once).
func (a *App) planNoteOpen(id, part string) bool {
	return a.planNotesOf(id)["\x00open:"+part] != ""
}

func (a *App) setPlanNoteOpen(id, part string, on bool) {
	m := a.planNotesOf(id)
	if on {
		m["\x00open:"+part] = "1"
	} else {
		delete(m, "\x00open:"+part)
	}
}

// planDecision is the plan card a group waits on (its newest).
func (a *App) planDecision(g *protocol.TaskGroup) *store.DecisionState {
	if g.Hand == nil || g.Hand.Plan == nil || g.Hand.Plan.DecisionID == "" {
		return nil
	}
	return a.S.Decisions[g.Hand.Plan.DecisionID]
}

// handGroupFacts is a hand-over group's line under its name: where it
// stands, then where and who, each its own element (D291); the plan card
// inside while it waits, and 一起过目 once every part is done.
func (a *App) handGroupFacts(c *ui.Context, g *protocol.TaskGroup, held int) {
	t := a.T
	hv := g.Hand
	state, ink := "", t.InkMuted
	switch {
	case hv.Review == "sent":
		state, ink = a.L.T("hand.g.sent"), t.Done.Ink
	case hv.Review == "ready":
		state, ink = a.L.T("hand.g.done"), t.Done.Ink
	case hv.Plan != nil && hv.Plan.State == "planning":
		state, ink = a.L.T("hand.g.planning"), t.Working.Ink
	case hv.Plan != nil && hv.Plan.State == "ready":
		state, ink = a.L.T("hand.g.ready"), t.NeedsYou.Ink
	case hv.Plan != nil && hv.Plan.State == "held":
		state = a.L.T("hand.g.held")
	case hv.Plan != nil && hv.Plan.State == "failed":
		state, ink = a.L.T("hand.g.failed"), t.Failed.Ink
	case held > 0:
		state = a.L.T("hand.g.inline", held)
	}
	ui.Row(c.Key("hand-facts")).Wrap().Gap(t.S3).AlignItems(ui.Center).Padding(0, 0, t.S1, 0).Children(func() {
		if state != "" {
			uiText(c.Key("st"), state).FontSize(t.XS).FontWeight(700).TextColor(ink).Role(ui.RoleStatus)
		}
		if hv.Where != nil && hv.Where.Name != "" {
			uiText(c.Key("where"), hv.Where.Name).FontSize(t.XS).TextColor(t.InkMuted)
		}
		if hv.Harness != "" {
			uiText(c.Key("who"), harnessName(hv.Harness)).FontSize(t.XS).TextColor(t.InkMuted)
		}
	})
	// The plan itself lives in the conversation; here, Go stays in reach and 看方案 takes you to it.
	if d := a.planDecision(g); d != nil && (hv.Plan.State == "ready" || hv.Plan.State == "held") && d.Pending == "" {
		ui.Row(c.Key("plan-acts")).Gap(t.S2).Wrap().AlignItems(ui.Center).Padding(t.S1, 0, 0, 0).Children(func() {
			if a.buttonFor(c, a.L.T("hand.plan.go"), g.Name, btnPrimary, t.ControlMD, t.Surface) {
				a.planAnswer(d, "go", "")
			}
			if a.buttonFor(c, a.L.T("hand.plan.see"), g.Name, btnSecondary, t.ControlMD, t.Surface) {
				a.seePlan(d)
			}
		})
	}
	if hv.Review == "ready" {
		ui.Row(c.Key("review")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, 0, 0, 0).Children(func() {
			if a.buttonFor(c, a.L.T("hand.review"), g.Name, btnPrimary, t.ControlMD, t.Surface) {
				a.openReview(g.ID)
			}
		})
	}
}

// seePlan goes to the conversation and finds the plan card there.
func (a *App) seePlan(d *store.DecisionState) {
	a.planJump = d.Seq
	a.Route = RouteConversation
	a.markRead()
}

// takePlanJump finds the plan card once the conversation has its rows.
func (a *App) takePlanJump(c *ui.Context) {
	if id := a.draftJump; id != "" {
		a.draftJump = ""
		if seq := a.S.FindSeq[id]; seq > 0 {
			a.jumpTo(c, seq, id)
		}
	}
	if a.planJump == 0 {
		return
	}
	seq := a.planJump
	a.planJump = 0
	a.jumpTo(c, seq, "")
}

// ---------- 一起过目 / Review together ----------

type reviewState struct {
	open         bool
	groupID      string
	cid, sendCid string
	review       *protocol.GroupReview
	got, sending bool
	dropped      map[string]bool
	said         string
}

func (a *App) openReview(groupID string) {
	a.nextClient++
	a.rv = reviewState{open: true, groupID: groupID, cid: fmt.Sprintf("review%d", a.nextClient), dropped: map[string]bool{}}
	a.send(protocol.GroupReviewReq{T: "group_review", GroupID: groupID, ClientID: a.rv.cid})
}

func (a *App) takeReview() {
	r := &a.rv
	if f := a.S.SourceItems[r.cid]; f != nil {
		delete(a.S.SourceItems, r.cid)
		r.got, r.review = true, f.Review
		if f.Review == nil {
			r.said = f.Error
		}
	}
	if f := a.S.SourceItems[r.sendCid]; f != nil && r.sendCid != "" {
		delete(a.S.SourceItems, r.sendCid)
		r.sending = false
		if f.OK {
			r.open = false
		} else {
			r.said = firstNonEmpty(f.Error, a.L.T("newtask.err.failed"))
		}
	}
}

// reviewKeep is every to-do whose line goes out.
func (r *reviewState) reviewKeep() []string {
	var out []string
	if r.review == nil {
		return nil
	}
	for _, row := range r.review.Rows {
		if r.dropped[rowKey(row)] {
			continue
		}
		for _, i := range row.Items {
			out = append(out, i.Ref)
		}
	}
	return out
}

func rowKey(row protocol.ReviewRow) string {
	if len(row.Items) > 0 {
		return row.Items[0].Ref
	}
	return row.TaskID
}

// reviewSheet is one sheet for a done group: each part's PR, checks, size,
// result line and the comment it leaves; one Go sends them all.
func (a *App) reviewSheet(c *ui.Context) {
	r := &a.rv
	if !r.open {
		return
	}
	a.takeReview()
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 820
	}
	title := a.L.T("hand.review")
	open := true
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 820)).MaxHeight(sheetBack(c, back, h)).Radius(t.RadiusXL).Background(t.Bg).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title).Role(ui.RoleDialog)
		a.enter(c, panel)
		ui.Row(c.Key("rv-head")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S5, t.S6, t.S2, t.S6).Children(func() {
			ui.Column(c).Gap(2).Shrink(1).MinWidth(0).Children(func() {
				a.heading(c, title, t.XL)
				if rv := r.review; rv != nil {
					uiText(c.Key("sub"), a.L.T("hand.review.sub", rv.Name, len(rv.Rows))).FontSize(t.SM).TextColor(t.InkMuted)
				}
			})
			ui.Spacer(c)
			if a.iconButton(c, a.L.T("pile.close.x"), t.ControlMD, btnSecondary, drawCross) {
				r.open = false
			}
		})
		ui.Scroll(c.Key("rv-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S1, t.S6, t.S4, t.S6).Gap(t.S3).Children(func() {
				rv := r.review
				switch {
				case !r.got:
					uiText(c.Key("looking"), a.L.T("todos.looking")).TextColor(t.InkSoft)
					return
				case rv == nil || len(rv.Rows) == 0:
					uiText(c.Key("none"), firstNonEmpty(r.said, a.L.T("hand.review.none"))).TextColor(t.InkSoft)
					return
				}
				ui.Row(c.Key("lede")).Wrap().Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
					if rv.PRs > 0 {
						uiText(c.Key("prs"), a.nCount("hand.review.prs", rv.PRs)).FontWeight(700).TextColor(t.Ink)
					}
					if rv.Fixed > 0 {
						uiText(c.Key("fixed"), a.nCount("hand.review.fixed", rv.Fixed)).FontWeight(700).TextColor(t.Ink)
					}
					uiText(c.Key("then"), a.L.T("hand.review.then")).TextColor(t.InkSoft)
				})
				for _, row := range rv.Rows {
					a.reviewRow(c, row)
				}
			})
		})
		ui.Column(c.Key("rv-go")).Gap(t.S2).Padding(t.S3, t.S6, t.S5, t.S6).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
			if r.said != "" && r.review != nil {
				uiText(c.Key("said"), r.said).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
			}
			keep := r.reviewKeep()
			if r.review != nil {
				var closing []string
				for _, row := range r.review.Rows {
					if row.Close && !r.dropped[rowKey(row)] {
						for _, i := range row.Items {
							closing = append(closing, refLabel(i.Ref))
						}
					}
				}
				sep := ", "
				if a.L.Han() {
					sep = "、"
				}
				foot := a.L.T("hand.review.close.none")
				if len(closing) > 0 {
					foot = a.L.T("hand.review.close", strings.Join(closing, sep))
				}
				uiText(c.Key("foot"), foot).FontSize(t.SM).TextColor(t.InkMuted)
			}
			ui.Row(c.Key("row")).Gap(10).Children(func() {
				ui.Spacer(c)
				if a.button(c, a.L.T("hand.plan.hold"), btnSecondary, t.ControlLG, t.Bg) {
					r.open = false
				}
				if a.button(c, a.L.T("hand.review.go", len(keep)), btnPrimary, t.ControlLG, t.Bg) && len(keep) > 0 && !r.sending {
					a.nextClient++
					r.sendCid, r.sending, r.said = fmt.Sprintf("reviewgo%d", a.nextClient), true, ""
					a.send(protocol.GroupReviewSendReq{T: "group_review_send", GroupID: r.groupID, Keep: keep, ClientID: r.sendCid})
				}
			})
		})
	})
	if !open {
		r.open = false
	}
}

// reviewRow is one part: its to-dos, PR, checks, size, result and its line.
func (a *App) reviewRow(c *ui.Context, row protocol.ReviewRow) {
	t := a.T
	r := &a.rv
	k := rowKey(row)
	off := r.dropped[k]
	refs := make([]string, len(row.Items))
	for i, it := range row.Items {
		refs[i] = it.Ref
	}
	box := ui.Column(c.Key("rr:"+k)).Gap(t.S2).Padding(t.S3, t.S4).Radius(16).Background(t.Surface).Shadow(0, 2, 0, 0, t.Line)
	if off {
		box.Opacity(0.62)
	}
	box.Children(func() {
		ui.Row(c.Key("h")).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
			uiText(c.Key("refs"), refsLabel(refs)).FontWeight(800).TextColor(t.Ink).FontFeatures("tnum")
			if row.PR != nil {
				l := uiText(c.Key("pr"), row.PR.Label).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft)
				if row.PR.URL != "" {
					l.Cursor(ui.CursorPointer).Role(ui.RoleLink).Tooltip(a.L.T("hand.review.see")).Underline()
					if l.Clicked() {
						c.OpenURL(row.PR.URL)
					}
				}
			}
			if row.FixedIn != "" {
				uiText(c.Key("fixed"), a.L.T("hand.review.fixedin", row.FixedIn)).FontSize(t.SM).TextColor(t.InkSoft)
			}
			if ch := row.Checks; ch != nil {
				bg, ink, words := t.Done.Surface, t.Done.Ink, a.L.T("hand.review.checks.passed")
				switch ch.State {
				case "failed":
					bg, ink, words = t.Failed.Surface, t.Failed.Ink, a.nCount("hand.review.checks.failed", ch.Failed)
				case "running":
					bg, ink, words = t.Working.Surface, t.Working.Ink, a.L.T("hand.review.checks.running")
				}
				ui.Row(c.Key("checks")).Height(22).Padding(0, t.S2).Radius(11).AlignItems(ui.Center).Background(bg).Children(func() {
					uiText(c, words).FontSize(t.XS).FontWeight(700).TextColor(ink)
				})
			}
			if sz := row.Size; sz != nil {
				ui.Row(c.Key("size")).Gap(t.S1).Children(func() {
					uiText(c.Key("a"), fmt.Sprintf("+%d", sz.Added)).Font(t.Mono).FontSize(t.SM).TextColor(t.AddedInk)
					uiText(c.Key("d"), fmt.Sprintf("−%d", sz.Removed)).Font(t.Mono).FontSize(t.SM).TextColor(t.DeletedInk)
				})
			}
		})
		if row.Result != "" {
			uiText(c.Key("result"), autospace(row.Result)).TextColor(t.InkSoft).LineHeight(a.leading(1.45))
		}
		ui.Row(c.Key("says")).Gap(t.S3).AlignItems(ui.Start).Children(func() {
			ui.Column(c.Key("q")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
				uiText(c.Key("l"), a.L.T("hand.review.says")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				uiText(c.Key("t"), row.Comment).FontSize(t.SM).TextColor(t.Ink).Selectable()
			})
			label, kind := a.L.T("hand.review.drop"), btnSecondary
			if off {
				label, kind = a.L.T("hand.review.keep"), btnText
			}
			if a.buttonFor(c, label, refsLabel(refs), kind, t.ControlSM, t.Surface) {
				r.dropped[k] = !off
			}
		})
	})
}

// isPlanTask says whether a task is a hand-over's plan-first part (D385).
func (a *App) isPlanTask(id string) bool {
	if a.S.OnHand == nil || id == "" {
		return false
	}
	for _, g := range a.S.OnHand.Groups {
		if g.Hand != nil && g.Hand.Plan != nil && g.Hand.Plan.TaskID == id {
			return true
		}
	}
	return false
}
