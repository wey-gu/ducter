package views

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
	"github.com/wey-gu/ducter/apps/desktop/internal/say"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const convWidth = 760

// row is one row of the conversation's list: an entry, or a message sent
// and not yet echoed.
type row struct {
	entry   *store.Entry
	pending *pendingMsg
	// presence is the partner at work while the user waits (D104).
	presence bool
}

func (a *App) rows() []row {
	echoed := map[string]bool{}
	var rows []row
	for _, e := range a.S.Channel {
		if e.User != nil && e.User.ClientID != "" {
			echoed[e.User.ClientID] = true
		}
		if e.Decision != nil && (a.S.DecisionShownInLiving(e.Decision.DecisionID) || a.pinnedCallQuestion(e.Decision.DecisionID)) {
			continue
		}
		// A Noted line lives in the Details of the reply it belongs to (D104).
		if e.Noted != nil {
			continue
		}
		rows = append(rows, row{entry: e})
	}
	// D470: a request the partner's own next words already say gives way to one quiet origin line over them.
	{
		es := make([]*store.Entry, 0, len(rows))
		for _, r := range rows {
			es = append(es, r.entry)
		}
		a.peerSpoken, a.peerOrigin = spokenPeers(es, a.peerAsked)
	}
	// A task's chip shows once: under the newest message about it.
	a.chipOwner = map[string]int64{}
	// One voice: once the partner's result message is in, the living
	// message no longer repeats that task's done line.
	a.resultShown = map[string]bool{}
	for _, r := range rows {
		if e := r.entry; e.AI != nil && e.AI.ReplyTo != 0 {
			for _, id := range a.tasksOfReply(e.AI.ReplyTo) {
				if t := a.S.Task(id); t != nil && finished(t) {
					a.resultShown[id] = true
				}
			}
		}
	}
	a.livingNewest = map[string]int64{}
	for _, r := range rows {
		if e := r.entry; e.Living != nil {
			for _, it := range e.Living.Items {
				a.livingNewest[livingKey(it)] = max(a.livingNewest[livingKey(it)], e.FirstSeq)
			}
		}
	}
	kept := rows[:0]
	for _, r := range rows {
		if e := r.entry; e.Living != nil && len(a.livingItems(e)) == 0 {
			continue
		}
		kept = append(kept, r)
	}
	rows = kept
	for _, r := range rows {
		e := r.entry
		switch {
		case e.Job != nil && e.Job.Status != nil && e.Job.Status.TaskID != "":
			a.chipOwner[e.Job.Status.TaskID] = e.FirstSeq
		case e.AI != nil && e.AI.ReplyTo != 0:
			for _, id := range a.tasksOfReply(e.AI.ReplyTo) {
				a.chipOwner[id] = e.FirstSeq
			}
		case e.Living != nil:
			// The living message's done line is newer than the ack: the
			// action row moves there, then to the partner's own result.
			for _, it := range a.livingItems(e) {
				if it.Kind == "done" || it.Kind == "failed" {
					a.chipOwner[it.TaskID] = e.FirstSeq
				}
			}
		}
	}
	keep := a.pending[:0]
	for i := range a.pending {
		if !echoed[a.pending[i].clientID] {
			keep = append(keep, a.pending[i])
		}
	}
	a.pending = keep
	for i := range a.pending {
		rows = append(rows, row{pending: &a.pending[i]})
	}
	if a.thinking() {
		rows = append(rows, row{presence: true})
	}
	return rows
}

// conversation is the default zoom level: one partner, no machinery.
func (a *App) conversation(c *ui.Context) {
	t := a.T
	rows := a.rows()
	a.noteRows(rows)     // D236: for the jump and the answer tab
	a.takePlanJump(c)    // D385: 看方案 from On hand
	a.followBefore(rows) // D254: the divider, what is new since the reader left the end
	a.header(c)
	a.pinStrip(c) // D381: what is pinned, under the bar
	a.appPins(c)  // D410: the pinned apps, one line of chips
	a.list.Key = func(i int) any {
		if i >= len(rows) {
			return i
		}
		if p := rows[i].pending; p != nil {
			return "p:" + p.clientID
		}
		if rows[i].presence {
			return "presence"
		}
		return rows[i].entry.FirstSeq
	}
	a.list.FollowEnd = true
	if !c.Preferences().ReduceMotion {
		a.list.FollowAnimation = &ui.Smooth
	} else {
		a.list.FollowAnimation = nil
	}
	// Rhythm (D129): a run of one voice stacks 4 apart, other things the
	// same voice says sit 12 apart, and 16 where the turn passes.
	userTurn := func(i int) bool { return rows[i].pending != nil || (rows[i].entry != nil && rows[i].entry.User != nil) }
	// D254: the list and the pebble over its foot share one pane.
	a.readBack() // D305: the reply to a message sent by voice, read aloud
	pane := ui.Column(c.Key("convpane")).Grow(1).MinHeight(0).ObserveInput(a.voiceObserve)
	a.toastsOver(pane) // D527: toasts centre over the conversation, beside the list of partners
	pane.Children(func() {
		ui.List(c, &a.list, len(rows), func(i int) {
			e := rows[i].entry
			var prev *store.Entry
			if i > 0 {
				prev = rows[i-1].entry
			}
			// A time line before the first message and wherever 15 minutes
			// passed, as a messaging app has (D104); the away divider is one.
			// D509: the row on top while older messages may still come keeps that look (its
			// time line, its gap) once they land above it, so the reader's line never moves.
			head := e != nil && a.olderHead(i, e)
			when := e != nil && (head || a.timeLineBefore(prev, e))
			top, join := float32(0), false
			switch {
			case head:
				top = t.S3
			case i == 0:
			case userTurn(i) != userTurn(i-1):
				top = t.S4
			case !when && a.stacks(rows[i-1], rows[i]):
				top, join = t.S1, true
			default:
				top = t.S3
			}
			a.join = join
			ui.Row(c).Justify(ui.Center).Padding(top, 0, 0, 0).Children(func() {
				ui.Column(c).Grow(1).MaxWidth(convWidth).Children(func() {
					if p := rows[i].pending; p != nil {
						a.pendingRow(c, p)
						return
					}
					if rows[i].presence {
						a.presenceRow(c)
						return
					}
					if e.FirstSeq == a.fl.divider && (e.AI == nil || e.AI.First == nil) { // D298: no "new" line over the first words
						a.newDivider(c)
					}
					if when {
						a.timeLine(c, a.whenOf(e.Event.TS))
					}
					a.entry(c, e)
				})
			})
		}).Grow(1).Padding(t.S5, t.S5, t.S4, t.S5).Children(func() {
			if len(rows) == 0 && a.S.Welcomed {
				a.emptyConversation(c)
			}
		})
		a.landOpening(rows)
		a.wayBack(c, rows)
		a.olderWait(c) // D509: a page of older messages on its way
	})
	a.moreOlder(len(rows)) // D509: near the top, the page before
	// D527: the foot, the composer and all that sits over it, is one
	// column: toasts keep above its top.
	foot := ui.Column(c.Key("conv-foot")).Shrink(0)
	a.toastsAbove(foot)
	foot.Children(func() {
		a.firstResultLine(c)
		// One card at a time under the conversation: Ducter can't run in the
		// background, else a gentle ask, else the Terminal offer.
		if !a.linkLostNotice(c) && !a.backgroundLine(c) && !a.keyNoticeAboveComposer(c) && !a.askLine(c) {
			a.cliOfferLine(c)
		}
		a.callQuestionsAboveComposer(c) // D189 (5): someone is waiting on the line
		a.doorLine(c, rows)             // D535: 有 n 个等你定 ›, while what waits is out of view
		a.composer(c)
	})
	a.readWhenSeen(c)
}

// emptyConversation is the first screen (D149): the partner says hello in
// its own name by the time of day, says what it can do for this person (or
// the one timely thing, for someone returning), and offers 3–4 things to
// say. A starter fills the composer; it never sends. Where Ducter lives is
// the header's 设备 / Devices: not repeated here.
func (a *App) emptyConversation(c *ui.Context) {
	t := a.T
	col := ui.Column(c.Key("empty")).Margin(ui.Auto).MaxWidth(640).Width(640).MaxWidthPercent(100).AlignItems(ui.Center)
	a.enter(c, col)
	col.Children(func() {
		a.helloAvatar(c, 168)
		ui.Column(c).Gap(t.S2).Margin(t.S3, 0, 0, 0).AlignItems(ui.Center).MaxWidth(520).Children(func() {
			hi := autospace(a.greeting())
			a.heading(c, hi, t.XXL).TextAlign(ui.Center).Label(hi)
			if f := a.S.First; f != nil && f.News != nil {
				a.helloNews(c, f.News)
				return
			}
			// What it can do, then its promise: a line each, never broken mid-thought.
			ui.Column(c).AlignItems(ui.Center).Children(func() {
				for _, s := range sentences(autospace(a.canLine())) {
					uiText(c, s).FontSize(t.LG).TextAlign(ui.Center).TextColor(t.InkSoft).LineHeight(leadingFor(s, 1.55)).Balance()
				}
			})
		})
		// D222: what is still on today, from the last look (never a new read).
		if f := a.S.First; f != nil && f.Today != nil {
			ui.Column(c).Margin(t.S3, 0, 0, 0).AlignItems(ui.Center).Children(func() { a.calTodayLine(c, f.Today) })
		}
		ui.Column(c).Gap(t.S3).Margin(t.S6, 0, 0, 0).AlignItems(ui.Stretch).Width(640).MaxWidthPercent(100).Children(func() {
			uiText(c, a.L.T("empty.try")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).LetterSpacing(0.5).Margin(0, 0, 0, 2)
			ui.Row(c).Wrap().Gap(t.S3).AlignItems(ui.Stretch).Children(func() {
				for n, text := range a.suggestions() {
					text := autospace(text)
					// A starter is a secondary button holding a sentence, two to a row.
					chip := ui.Row(c.Key(n+1)).Basis(260).Grow(1).MinHeight(64).Padding(t.S3, t.S4).Radius(t.RadiusMD).AlignItems(ui.Center).
						Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(text).Focusable()
					a.buttonLook(c, chip, btnSecondary, t.ControlLG, t.Surface)
					chip.Children(func() {
						uiText(c, text).FontSize(t.MD).LineHeight(leadingFor(text, 1.45)).Grow(1).MinWidth(0)
					})
					if chip.Clicked() {
						a.draft = unautospace(text)
						a.focusComposer = true
					}
				}
			})
		})
	})
}

// helloNews is the one timely thing for someone returning, in the
// partner's own bubble under its greeting, and the way to it.
func (a *App) helloNews(c *ui.Context, n *protocol.FirstNews) {
	t := a.T
	text := autospace(a.words(n.Words))
	r := t.BubbleRadius
	ui.Column(c).AlignItems(ui.Center).Gap(t.S2).Margin(t.S2, 0, 0, 0).Children(func() {
		ui.Column(c).Background(t.PartnerBubble).Padding(t.S2+2, t.S4).Radius(r[1], r[0], r[3], r[2]).MaxWidth(t.BubbleMeasure).Children(func() {
			uiText(c, text).FontSize(t.PartnerSize).LineHeight(leadingFor(text, 1.5)).TextColor(t.OnPartnerBubble)
		})
		if a.button(c, a.L.T("hello.news.open"), btnText, t.ControlSM, t.Bg) {
			if n.TaskID != "" {
				a.OpenTask(n.TaskID)
			} else {
				a.Route = RouteOnHand
			}
		}
	})
}

func (a *App) header(c *ui.Context) {
	t := a.T
	b := a.barBoard() // D497: the line under a partner's name speaks for that partner
	if a.Status == client.Connecting && a.S.Persona == "" {
		c.After(connectQuiet) // the quiet first second ends on its own
	}
	a.linkTick(c)
	a.placeBar(c, "conversation", RouteConversation, func() {
		// D270: two things, each its own way in. The face and the name open
		// the partner's own page (Settings › 伙伴; the visible way is the
		// gear at the bar's end, D262); the counts under the name open On
		// hand, narrowed to what they name when they name one thing. Each
		// tints on its own under the pointer, as the crumbs do; the face
		// never changes for the pointer (a face says what the partner is
		// doing, D77, D112).
		tint := t.SurfaceSunken.Mix(t.Chrome, 0.45)
		about := a.L.T("nav.partner.about", a.S.PersonaName)
		ui.Row(c.Key("who")).Gap(t.S3 - 2).AlignItems(ui.Center).MinWidth(0).Children(func() {
			// The clay partner, 44 points: it breathes and blinks (D77).
			face := ui.Box(c.Key("who-face")).Shrink(0).Cursor(ui.CursorPointer).AccessHidden(true).Tooltip(about)
			a.lookAround(c, face) // D290: it glances round as you come back
			// D497: with more than one partner, the figure is in its own clay (theme.UseLook).
			face.Children(func() { a.partnerFace(c, "bar", a.presence(c), 44) })
			ui.Column(c).Gap(0).MinWidth(0).Children(func() {
				name := uiText(c.Key("who-name"), a.S.PersonaName).FontSize(barText).FontWeight(600).TextColor(t.Ink).LineHeight(1.25).SingleLine().
					Padding(1, t.S1+2).Radius(t.RadiusXS).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, a.L.T("nav.partner"), a.S.PersonaName)).
					Focusable().Tooltip(about).AlignSelf(ui.Start)
				if name.Hovered() || name.Pressed() || face.Hovered() || face.Pressed() {
					name.Background(tint)
				}
				if name.Clicked() || face.Clicked() {
					a.OpenPartner()
				}
				// The line keeps its height while it has nothing to say, so
				// the name never moves when it fills in (D262).
				ui.Box(c).MinHeight(t.XS*1.5 + 2).Children(func() {
					words := a.summary(b)
					if f, ok := a.summaryFilter(b); ok && words != "" {
						// D291: each count its own element, spaced by a gap;
						// read aloud as a list.
						parts := a.countParts(b)
						if len(parts) == 0 {
							parts = []string{words}
						}
						// D535: 「n 个等你」 is a door of its own: it opens the next
						// item that waits (the question here, or On hand's row
						// focused); the rest of the line opens On hand.
						needs := ""
						if n := a.barNeeds(b); n > 0 {
							needs = a.L.T("header.needs", n)
						}
						rest := parts[:0:0]
						for _, p := range parts {
							if p != needs {
								rest = append(rest, p)
							}
						}
						ui.Row(c.Key("who-line")).Gap(t.S1).AlignItems(ui.Center).Children(func() {
							if needs != "" {
								if a.countDoor(c, needs, tint) {
									a.openDoor(a.barDoorPartner())
								}
							}
							if len(rest) == 0 {
								return
							}
							l := ui.Row(c.Key("who-counts")).AlignItems(ui.Center).Padding(1, t.S1+2).Radius(t.RadiusXS).
								Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(spoken(a.L, rest...)).Focusable().Tooltip(a.L.T("nav.onhand"))
							ink := t.InkMuted
							if l.Hovered() || l.Pressed() {
								l.Background(tint)
								ink = t.Ink
							}
							l.Children(func() {
								ui.Row(c).Gap(t.S3).AlignItems(ui.Center).AccessHidden(true).Children(func() {
									for _, p := range rest {
										uiText(c, p).FontSize(t.XS).TextColor(ink).SingleLine()
									}
								})
							})
							if l.Clicked() {
								if needs != "" {
									f = 0 // the line without its door names more than one thing
								}
								a.oh.filter, a.oh.focus = f, ""
								a.Route = RouteOnHand
								a.markRead()
							}
						})
						return
					}
					uiText(c, words).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Padding(1, t.S1+2)
				})
			})
		})
	}, nil)
}

// WaitingCount is how many things wait for the person (the header's
// "等你"), for the Dock badge while the window is closed.
func (a *App) WaitingCount() int {
	if !a.S.Welcomed {
		return 0
	}
	return a.needsAcross(a.S.Board())
}

// summaryFilter is where the counts line leads (D270): ok when it says
// counts (not connecting, not offline), and the strip's filter (1–4) when it
// names one thing only, else 0 (the whole of On hand).
func (a *App) summaryFilter(b store.Board) (filter int, ok bool) {
	if a.Status == client.Connecting && a.S.Persona == "" || a.Status == client.Disconnected || a.link() != linkUp {
		return 0, false
	}
	n := [4]int{
		a.barNeeds(b),
		len(b.Lanes[store.LaneWorking]),
		len(b.Lanes[store.LaneWaiting]) + len(a.looseWaiters()),
		a.doneToday(b),
	}
	for i, v := range n {
		if v == 0 {
			continue
		}
		if filter != 0 {
			return 0, true
		}
		filter = i + 1
	}
	return filter, true
}

// connectQuiet is how long a launch says nothing about connecting.
const connectQuiet = time.Second

func (a *App) summary(b store.Board) string {
	// D520: a lost link is said quietly first (正在重新连上 hel…), plainly
	// after LongOutage; never by flicking to the counts between tries.
	if words := a.linkWords(); words != "" {
		return words
	}
	switch a.Status {
	case client.Connecting:
		if a.S.Persona == "" {
			// D262: the first second of a launch is quiet: the home on this
			// Mac answers well within it, so the line never flashes
			// 连接中… and then the counts.
			if a.firstFrame.IsZero() {
				a.firstFrame = a.Now()
			}
			if a.Now().Sub(a.firstFrame) < connectQuiet {
				return ""
			}
			return a.L.T("conn.connecting")
		}
	case client.Disconnected:
		return a.L.T("conn.offline", a.linkHome())
	}
	if parts := a.countParts(b); len(parts) > 0 {
		return spoken(a.L, parts...)
	}
	return a.L.T("header.summary.none")
}

// countParts is the counts line's facts, each said on its own (D291):
// what needs the user, what is being worked on, what came back.
func (a *App) countParts(b store.Board) []string {
	var parts []string
	// D435: nobody can answer until its own agent is back: said first, so a
	// message sent meanwhile is never met by silence alone.
	if h := a.brainHeld(); h != nil && h.Waits {
		if at := a.heldAt(h); at != "" {
			parts = append(parts, a.L.T("header.held", at))
		} else {
			parts = append(parts, a.L.T("header.held.soon"))
		}
	}
	if n := a.barNeeds(b); n > 0 {
		parts = append(parts, a.L.T("header.needs", n))
	}
	// Thinking is said where the reply will appear (the presence row,
	// D104), not here.
	if n := len(b.Lanes[store.LaneWorking]); n > 0 {
		parts = append(parts, a.L.T("header.working", n))
	}
	// What it waits for is felt here, not in the conversation (D104, D115).
	if n := len(b.Lanes[store.LaneWaiting]) + len(a.looseWaiters()); n > 0 {
		parts = append(parts, a.L.T("header.waiting", n))
	}
	if n := a.doneToday(b); n > 0 {
		parts = append(parts, a.L.T("header.done", n))
	}
	return parts
}

// thinking reports whether the partner owes an answer: the user's last
// message has no ack or reply after it yet.
func (a *App) thinking() bool {
	for _, p := range a.pending {
		// D206: one whose picture didn't go up isn't with the partner yet.
		if !anyFailed(p.atts) {
			return true
		}
	}
	// D435: nobody can answer until its own agent is back: the messages
	// wait, it isn't thinking (the header says when).
	if h := a.brainHeld(); h != nil && h.Waits {
		return false
	}
	// D380: a quick web look is out: its line stays under the words that
	// named it, until the answer.
	if act := a.S.Activity; act != nil && act.Step == "web" {
		return true
	}
	for i := len(a.S.Channel) - 1; i >= 0; i-- {
		e := a.S.Channel[i]
		switch {
		case e.User != nil:
			// A turn that ended after it without a word (an ask, or
			// nothing to say) answered it.
			return e.FirstSeq > a.S.ActivityEndedAt
		case e.AI != nil || e.Job != nil || (e.Decision != nil && e.Decision.TaskID == ""):
			return false
		}
	}
	return false
}

// doneToday is 今天做完 / Done today, the same count On hand's sentence,
// its strip and the menu bar say (D310).
func (a *App) doneToday(b store.Board) int {
	return store.DoneToday(b.Lanes[store.LaneDone], a.Now().Local())
}

// pendingRow is a message not echoed yet: its pictures (with the ring while
// they go up) and words; when a picture didn't go, one line with Retry, and
// nothing is lost.
func (a *App) pendingRow(c *ui.Context, p *pendingMsg) {
	t := a.T
	if len(p.atts) == 0 {
		a.userReplyBubble(c, p.text, true, nil, p.reply, "", p.refs...)
		return
	}
	join := a.takeJoin()
	ui.Column(c).Gap(t.S1).AlignItems(ui.End).Children(func() {
		a.messageMedia(c, "p"+p.clientID, nil, p.atts, true, "conv")
		if p.text != "" || p.reply != nil {
			a.join = join
			a.userReplyBubble(c, p.text, true, nil, p.reply, "", p.refs...)
		}
		if anyFailed(p.atts) {
			ui.Row(c.Key("pfail:" + p.clientID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				uiText(c, a.L.T("media.failed")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink)
				if a.button(c, a.L.T("media.retry"), btnText, t.ControlSM, t.Bg) {
					a.retryPictures(p.atts)
				}
			})
		}
	})
}

// userBubble is the user's words in their bubble. D236: one that replies
// shows the imprint of what it replies to pressed into its top, the words
// under it: from core's ReplyRef once echoed (ref), from the composer's
// target while pending (still).
func (a *App) userBubble(c *ui.Context, text string, pending bool) {
	a.userReplyBubble(c, text, pending, nil, nil, "")
}

func (a *App) userReplyBubble(c *ui.Context, text string, pending bool, ref *protocol.ReplyRef, still *replyTo, clientID string, refs ...protocol.Ref) {
	t := a.T
	join := a.takeJoin()
	rt := a.takeReply()
	// D256: the pebble rests on the bubble's bottom line, left of it.
	row := ui.Row(c).Gap(a.pebbleGap()).AlignItems(ui.End)
	hov := rt != nil && row.Hovered()
	row.Children(func() {
		ui.Spacer(c)
		a.hoverCopy(c, rt, hov, -1) // D492
		a.hoverReply(c, rt, hov, -1)
		r := t.BubbleRadius
		tr := r[1]
		if join {
			tr = t.BubbleJoin
		}
		// D534: words with references: the chips stand where their names were typed.
		if ref == nil && still == nil && len(refs) > 0 {
			b := ui.Column(c.Key("refs")).Padding(t.S2+2, t.S4-2).Radius(r[0], tr, r[2], r[3]).MaxWidth(t.BubbleMeasure).MaxWidthPercent(76).TransformOrigin(1, 0.5)
			b.Background(a.found(c, b, rt, t.UserBubble, t.Reply.FoundUser, 0.025))
			if pending {
				b.Opacity(0.7)
			}
			b.Children(func() { a.wordsWithRefs(c, "w", text, refs, t.OnUserBubble, t.Bubble) })
			a.replyMenu(c, b, rt, text)
			return
		}
		if ref == nil && still == nil {
			b := uiText(c, autospace(text)).Selectable().CopyData(autospaceCopy).SelectionColor(t.Highlight).FontSize(t.Bubble).LineHeight(leadingFor(text, 1.5)).
				TextColor(t.OnUserBubble).Padding(t.S2+2, t.S4-2).Radius(r[0], tr, r[2], r[3]).
				MaxWidth(t.BubbleMeasure).MaxWidthPercent(76).TransformOrigin(1, 0.5)
			b.Background(a.found(c, b, rt, t.UserBubble, t.Reply.FoundUser, 0.025))
			a.replyMenu(c, b, rt, text)
			if pending {
				b.Opacity(0.7)
			}
			return
		}
		// The imprint is pressed into the bubble's top, 6 points in from its
		// sides and top; the words under it keep the bubble's own inset.
		b := ui.Column(c).Gap(imprintInset).Padding(imprintInset, imprintInset, t.S2+2, imprintInset).Radius(r[0], tr, r[2], r[3]).
			MaxWidth(t.BubbleMeasure).MaxWidthPercent(76).MinWidth(224).TransformOrigin(1, 0.5)
		b.Background(a.found(c, b, rt, t.UserBubble, t.Reply.FoundUser, 0.025))
		if pending {
			b.Opacity(0.7)
		}
		b.Children(func() {
			if ref != nil {
				a.sentImprint(c, "sent", ref, onUser, clientID)
			} else {
				a.imprint(c, "pending", still, still.quote, false, onUser, true, "")
			}
			if strings.TrimSpace(text) != "" {
				w := uiText(c, autospace(text)).Selectable().CopyData(autospaceCopy).SelectionColor(t.Highlight).FontSize(t.Bubble).LineHeight(leadingFor(text, 1.5)).
					TextColor(t.OnUserBubble).Padding(0, t.S4-2-imprintInset)
				a.replyMenu(c, w, rt, text)
			}
		})
	})
}

func (a *App) entry(c *ui.Context, e *store.Entry) {
	t := a.T
	// D236: the bubble this row draws first can be replied to; what no
	// bubble took is let go at the end.
	a.rp.next = a.replyOf(e)
	defer func() { a.rp.next, a.rp.tab = nil, nil }()
	switch {
	case e.User != nil:
		// D426: the several things it asked for stand under its words, line by line.
		defer a.askLines(c, e)
		if len(e.User.Media) > 0 {
			// D206: the pictures first, then the words, on the user's side.
			// D256: one pebble beside the whole message, on its last line;
			// the words under the pictures keep their right-click Reply.
			join := a.takeJoin()
			rt := a.rp.next
			row := ui.Row(c).Gap(a.pebbleGap()).AlignItems(ui.End)
			hov := rt != nil && row.Hovered()
			row.Children(func() {
				ui.Spacer(c)
				a.hoverCopy(c, rt, hov, -1) // D492: none for pictures alone
				a.hoverReply(c, rt, hov, -1)
				ui.Column(c).Gap(t.S1).AlignItems(ui.End).MinWidth(0).Children(func() {
					a.messageMedia(c, fmt.Sprint("u", e.FirstSeq), e.User.Media, nil, true, "conv")
					if strings.TrimSpace(e.User.Text) != "" || e.User.Reply != nil {
						a.join = join
						a.rp.noPebble = true
						a.userReplyBubble(c, e.User.Text, false, e.User.Reply, nil, e.User.ClientID, heldRefs(e.User.Refs)...)
						a.rp.noPebble = false
					}
				})
			})
			return
		}
		// D405: an app's own ask is not the person's words: a neutral bubble on
		// the left under the app's name. Words typed about an app stay theirs,
		// with a small line naming it.
		if e.User.App != nil && e.User.App.Ask != "" {
			a.appAskBubble(c, itoa(e.FirstSeq), e.User.App, e.User.Text)
			return
		}
		if e.User.App != nil {
			a.userAppLine(c, itoa(e.FirstSeq), e.User.App)
		}
		if e.User.Passed != nil {
			a.passedLine(c, itoa(e.FirstSeq), e.User.Passed.From)
		}
		a.userReplyBubble(c, e.User.Text, false, e.User.Reply, nil, e.User.ClientID, heldRefs(e.User.Refs)...)
	case e.AI != nil:
		// The partner's words get the CJK-Latin gap at display time; a
		// copy leaves it out (D78).
		ui.Column(c).Gap(t.S1).CopyData(autospaceCopy).Children(func() {
			// D236: an answer after other messages shows the reply it answers.
			if ans := a.answerOf(e); ans != nil {
				a.rp.tab = ans // pressed into the top of the bubble below
			}
			// D470: where these words came from, one quiet line (its coin, the agent).
			if b := a.peerOrigin[e.Event.Seq]; b != nil {
				a.peerOriginLine(c, b, e.Event.Seq)
			}
			// D298: the clay partner over its first words, while nothing else was said.
			if e.AI.First != nil && !e.AI.First.Look && a.firstWordsOpening() {
				a.firstWordsHead(c)
			}
			if len(e.AI.UI) > 0 {
				a.richWords(c, e, a.rp.next) // D303: its words with the blocks it drew
			} else if strings.TrimSpace(e.AI.Text) != "" || (e.AI.Cal == nil && e.AI.App == nil) {
				rt := a.rp.next // D254: Reply and Copy on a right click, as the user's bubbles have
				a.partnerBubble(c, a.takeJoin(), func() {
					// The view shares its selection with this box (ShareSelection), whose
					// menu is Ducter's: Reply, then Copy (the selection, or the message).
					box := ui.Column(c).Selectable().CopyData(autospaceCopy).SelectionColor(t.Highlight).MinWidth(0)
					a.replyMenu(c, box, rt, e.AI.Text)
					box.Children(func() { markdown.View(c, mdSpace(e.AI.Text), &a.md) })
				})
			}
			a.readingLine(c, e.FirstSeq) // D305: Stop while it is read aloud
			// D222: the day glance the partner put under its words.
			if e.AI.Cal != nil {
				a.dayCard(c, itoa(e.FirstSeq), e.AI.Cal)
			}
			// D206: what a task showed, under the partner's words about it.
			a.messageMedia(c, fmt.Sprint("a", e.FirstSeq), e.AI.Media, nil, false, "conv")
			// D405: the app this message made or changed, under its words.
			if e.AI.App != nil {
				a.appCard(c, itoa(e.FirstSeq), e.AI.App)
			}
			// D511: the Keep this message made: its receipt under the words.
			if e.AI.Keep != nil {
				a.keepReceipt(c, itoa(e.FirstSeq), e.AI.Keep)
			}
			// D410: 你的小应用, one click from the words that say where they are.
			if e.AI.Shelf {
				a.shelfCard(c, itoa(e.FirstSeq))
			}
			if e.AI.First != nil {
				a.firstWordsAfter(c, e) // D298: what they offer, where they were read, a key
			}
			a.recalledUnder(c, e.Event.Seq) // D304: where a recall that changed this answer came from
			a.quiet(c, "m"+itoa(e.FirstSeq), a.replyTasks(e), "", a.notedFor(e))
		})
	case e.Job != nil:
		a.job(c, e)
	case e.Living != nil:
		a.living(c, e)
	case e.Finds != nil:
		a.findsEntry(c, e)
	case e.Set != nil:
		a.setCard(c, e) // D385: a set found in the conversation
	case e.Decision != nil:
		if d := a.S.Decisions[e.Decision.DecisionID]; d != nil {
			a.ask(c, d, "")
		}
	case e.Peer != nil:
		// D321: the very first message from another agent explains itself once.
		// D418: the partner marks the first one; a window of the Log can't tell.
		first := e.Peer.Direction == "in" && e.Peer.First
		told := e.Peer.State == "ping" && a.S.Pings[e.Event.Seq] != nil && a.S.Pings[e.Event.Seq].Told
		if !(e.Peer.Direction == "in" && a.peerAsked(e.Peer.MessageID)) && !told && !a.peerSpoken[e.Event.Seq] {
			// A question it asked shows once, as its card (which says who asks).
			a.peerLine(c, e.Peer, a.S.SetAside[e.Peer.From+"|"+dayOf(e.Event.TS)], a.S.Pings[e.Event.Seq], e.Event.TS)
		}
		if first {
			a.firstPeerNote(c, e.Peer)
		}
	}
}

// replyTasks are the tasks an AI message's reply started whose lines show
// under it (each under the newest message about it).
func (a *App) replyTasks(e *store.Entry) []*store.Task {
	if e.AI == nil || e.AI.ReplyTo == 0 {
		return nil
	}
	var tasks []*store.Task
	for _, id := range a.tasksOfReply(e.AI.ReplyTo) {
		if t := a.S.Task(id); t != nil && a.chipOwner[id] == e.FirstSeq {
			tasks = append(tasks, t)
		}
	}
	return tasks
}

// tasksOfReply are the tasks the jobs answering a user message started.
func (a *App) tasksOfReply(replyTo int64) []string {
	var ids []string
	for _, j := range a.S.Jobs {
		if j.Ack != nil && j.Ack.ReplyTo == replyTo && j.Status != nil && j.Status.TaskID != "" {
			ids = append(ids, j.Status.TaskID)
		}
	}
	sort.Strings(ids)
	return ids
}

// job is an ack in the partner's voice, then the quiet row: the task's
// line lives in Details (D104).
func (a *App) job(c *ui.Context, e *store.Entry) {
	t := a.T
	j := e.Job
	ui.Column(c).Gap(t.S1).Children(func() {
		if j.Ack != nil {
			if ans := a.answerOf(e); ans != nil {
				a.rp.tab = ans // pressed into the top of the bubble below
			}
			a.partnerWords(c, j.Ack.Text)
			a.recalledUnder(c, e.FirstSeq) // D304: "像上次那样": what it remembered
		}
		st := j.Status
		var task *store.Task
		if st != nil && st.TaskID != "" {
			task = a.S.Task(st.TaskID)
		}
		if st != nil && (task == nil || task.Title() == "") {
			// A status line of no task: its words, in the state's ink when
			// it failed (the exception), muted otherwise. No dot.
			col := t.InkMuted
			if st.State == "failed" {
				col = t.Failed.Ink
			}
			a.underBubble(c, func() { uiText(c, st.Text).FontSize(t.SM).TextColor(col) })
		}
		var tasks []*store.Task
		detail := ""
		if task != nil && task.Title() != "" && a.chipOwner[task.ID] == e.FirstSeq {
			tasks, detail = append(tasks, task), st.Text
		}
		a.quiet(c, "m"+itoa(e.FirstSeq), tasks, detail, a.notedFor(e))
	})
}

// living is the living message: the partner's one running summary,
// revised in place while unread, with decisions inline.
// livingItems are the living message's items still worth a line: a done
// or failed task whose result the partner already gave is left out.
func (a *App) livingItems(e *store.Entry) []protocol.LivingItem {
	var out []protocol.LivingItem
	for _, it := range e.Living.Items {
		if (it.Kind == "done" || it.Kind == "failed") && a.resultShown[it.TaskID] {
			continue
		}
		// D385: plan first's done is its plan card, which says it.
		if it.Kind == "done" && a.isPlanTask(it.TaskID) {
			continue
		}
		// A read living message is frozen and the next one repeats what
		// still stands: say each line once, in the newest message.
		if it.Kind != "decision" && a.livingNewest[livingKey(it)] > e.FirstSeq {
			continue
		}
		out = append(out, it)
	}
	return out
}

func livingKey(it protocol.LivingItem) string { return it.TaskID + "|" + it.Kind + "|" + it.Text }

func (a *App) living(c *ui.Context, e *store.Entry) {
	// "While you were away" only for what came while the user was away:
	// it arrived before this window opened and they hadn't read it yet,
	// or it arrived while the window was in the background.
	away, ok := a.livingAway[e.FirstSeq]
	if !ok {
		away = (e.FirstSeq <= a.S.HeadSeq && a.S.Unread(e)) || !c.WindowActive() || c.WindowHidden()
		a.livingAway[e.FirstSeq] = away
	}
	a.livingQuiet(c, e, away)
}

// timeLineBefore says whether a time line goes before e: before the first
// row and wherever 15 minutes passed, but not where the away divider is.
func (a *App) timeLineBefore(prev, e *store.Entry) bool {
	if e.Living != nil && a.livingAway[e.FirstSeq] {
		return false
	}
	if prev == nil {
		return true
	}
	p, n := store.ParseTime(prev.Event.TS), store.ParseTime(e.Event.TS)
	return !p.IsZero() && !n.IsZero() && n.Sub(p) >= timeGap
}

// decisionCard is one ask in the conversation: the asking task's title
// as plain small words (nothing for the partner's own asks, nor inside its
// own task, where the title already heads the page: D493), the question,
// its default, and Go / Hold / Reply… / Details.
func (a *App) decisionCard(c *ui.Context, d *store.DecisionState, taskID string) {
	t := a.T
	id := firstNonEmpty(taskID, d.TaskID)
	ui.Column(c).Padding(t.S5).Gap(t.S2+2).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
		if d.Asker != nil {
			a.peerAskerRow(c, d.Asker)
		} else if task := a.S.Task(id); task != nil && task.Title() != "" && !(a.Route == RouteTask && a.TaskID == id) {
			uiText(c, task.Title()).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink)
		}
		a.decisionBody(c, d, taskID)
	})
}

// resettle plays the living message's re-settle as a revision replaces it:
// it dips and fades in, then springs back into place.
func (a *App) resettle(c *ui.Context, e ui.Element, revision int) {
	if c.Preferences().ReduceMotion {
		return
	}
	seen := ui.Local(e, "rev", func() int { return revision })
	p := ui.Pose{}
	if *seen != revision {
		*seen = revision
		p = ui.Pose{Y: 8, Scale: 0.985, Fade: 0.35}
		c.Invalidate()
	}
	e.AnimatePose(p, a.T.Bouncy)
}

func (a *App) decisionBody(c *ui.Context, d *store.DecisionState, taskID string) {
	t := a.T
	if d.Call != nil {
		a.callBody(c, d) // D189: a call's Go card, or a question from the line
		return
	}
	if d.Src != nil && d.Src.Kind == "plan" {
		a.handPlanCard(c, d, true) // D385
		return
	}
	question := a.questionOf(d)
	a.heading(c, keepTail(autospace(question)), t.XL).LineHeight(1.35)
	if d.Look != nil && d.Resolved == nil {
		a.lookLine(c, "card:"+d.DecisionID, d.Look.Left) // D437
	}
	a.todoAskBody(c, d) // D341: the comment as it goes out, or the to-do's chip
	if d.RoutineID != "" && d.Resolved == nil {
		a.routineFacts(c, d.RoutineID, t.NeedsYou.Ink)
	}
	st := decisionStyle{height: t.ControlMD, quietBg: t.NeedsYou.Surface}
	if d.Resolved == nil && d.SignIn == nil {
		if genericAsk(d) {
			st.under = a.defaultBelow(c, d) // D482: the default once, under the row
			a.whereLines(c, d)
		} else {
			uiText(c, a.defaultLine(c, d)).FontSize(t.SM).TextColor(t.NeedsYou.Ink)
		}
	}
	if id := firstNonEmpty(taskID, d.TaskID); id != "" && !(a.Route == RouteTask && a.TaskID == id) {
		// Details sits after Reply…, a text button like it.
		st.after = func() {
			if a.buttonFor(c, a.L.T("living.details"), a.decisionAbout(d), btnText, t.ControlMD, t.NeedsYou.Surface) {
				a.OpenTask(id)
			}
		}
	}
	// D493: the question 16 above the row (the card's gap of 10 and 6 more).
	ui.Column(c).Padding(t.S4-(t.S2+2), 0, 0, 0).Children(func() { a.decisionButtons(c, d, st) })
}

func (a *App) livingLine(c *ui.Context, it protocol.LivingItem) {
	t := a.T
	icon := drawCheck
	switch it.Kind {
	case "blocked":
		icon = drawClock
	case "progress":
		icon = drawArrow
	case "failed":
		icon = drawCross
	}
	line := ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Cursor(ui.CursorPointer)
	line.Children(func() {
		// A plain mark in muted ink: no tile.
		a.glyph(c, 18, icon(t.InkMuted))
		// D154: the task's words only in the reader's language; else its title.
		text := it.Text
		if said := say.Sayable(it.Text, a.tongueOf(it.TaskID)); said == "" && it.Title != "" {
			text = it.Title
		} else if said == "" {
			text = a.L.T("living.it")
		} else if it.Title != "" {
			// D291: the task's name is its own element, then what it said.
			text = said
			uiText(c, it.Title).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).SingleLine().Shrink(2).MinWidth(0).MaxWidth(240)
		}
		tx := uiText(c, text).FontSize(t.MD).TextColor(t.InkSoft).Grow(1).MinWidth(0).LineHeight(1.45).MaxLines(3).Tooltip(text)
		if line.Hovered() {
			tx.TextColor(t.Ink)
		}
		if len(it.Evidence) > 0 {
			ev := it.Evidence[0]
			// A text button like every other one: flat, no underline.
			if a.buttonFor(c.Key("ev"), a.L.T("living.evidence"), a.proofLabel(a.S.Task(it.TaskID), ev), btnText, t.ControlSM, t.Surface) {
				a.openEvidence(c, ev)
			}
		}
	})
	if line.Clicked() && it.TaskID != "" {
		a.OpenTask(it.TaskID)
	}
}

// thisMachine is this computer's machine hash (a seam for tests).
var thisMachine = remote.ThisMachine

// onThisMachine says whether the Ducter we talk to runs here (or is a test):
// only then do its paths name files on this Mac. Through Connect to your
// Ducter, or an SSH tunnel (a loopback address to another machine), they are
// the server's paths, chosen by its models. The welcome's machine hash
// decides; an older Ducter without one falls back to the address.
func (a *App) onThisMachine() bool {
	if a.URL == "" {
		return true
	}
	return remote.SameMachine(a.S.Machine, thisMachine(), a.URL)
}

func (a *App) openEvidence(c *ui.Context, ev protocol.EvidenceRef) {
	ref := ev.Ref
	web := strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "http://")
	file := strings.HasPrefix(ref, "file:") || strings.HasPrefix(ref, "/")
	switch {
	case web:
		c.OpenURL(ref)
	case file && a.onThisMachine() && strings.HasPrefix(ref, "file:"):
		c.OpenURL(ref)
	case file && a.onThisMachine():
		c.OpenURL("file://" + ref)
	default:
		c.WriteClipboard(ev.Ref)
		c.Toast(a.L.T("evidence.copied", ev.Ref)) // D291: one sentence
	}
}

func (a *App) composer(c *ui.Context) {
	t := a.T
	if a.held != nil && a.held.taskID == "" {
		a.aboveComposer(c, func() { a.heldLine(c) })
	}
	// D305: listening, its first card, or why not. Its own keyed place,
	// so the mic held under it stays the same element as the strip comes.
	ui.Column(c.Key("voice-above")).Children(func() { a.voiceAbove(c) })
	ui.Row(c.Key("composer-row")).ObserveInput(a.voiceObserve).Justify(ui.Center).Padding(t.S2, t.S5, t.S5, t.S5).Children(func() {
		ph, label := a.L.T("composer.placeholder", a.S.PersonaName), a.L.T("composer.label", a.S.PersonaName)
		if r := a.rp.replying; r != nil {
			label = a.replyLabel(r.from)
			ph = label + "…"
		}
		var over bool
		ui.Row(c).Grow(1).MaxWidth(convWidth).Children(func() {
			a.composerBox(c, composerOpts{
				key: "composer", draft: &a.draft, placeholder: ph, label: label, autoFocus: true, focus: a.focusComposer,
				mentions: &mentionPlace{},                                          // D534
				tray:     "conv",                                                   // #68: ⌘V pastes a picture
				box:      func(box ui.Element) { over = a.takeDrops(box, "conv") }, // D206: pictures dropped on the composer
				before: func() {
					if over {
						a.dropHint(c)
					}
					a.composerReply(c) // D236: what this replies to, pressed into the card
					a.picTray(c, "conv")
				},
				lead:  func() { a.addPicturesButton(c, "conv") },
				tools: func() { a.micButton(c) }, // D305: hold to talk
				keys: func(k ui.TextKey) bool {
					if a.pictureKeys("conv", k) {
						return true
					}
					if k.Key == ui.KeyEscape && k.Mods == 0 && a.vox.phase == "listen" {
						a.voiceDrop() // D305: Esc drops what is being heard
						return true
					}
					if k.Key == ui.KeyEscape && k.Mods == 0 && a.CancelReply() {
						return true // D236: Esc puts the reply away
					}
					a.speakStop() // D305: typing stops a reply being read
					return false
				},
				// Pictures alone may go.
				canSend: ptrBool(strings.TrimSpace(a.draft) != "" || len(a.med().trays["conv"]) > 0),
				onSend: func(text string) bool {
					if !a.SendMessage(text) {
						return false
					}
					a.voiceSent(text)
					return true
				},
			})
			a.focusComposer = false
		})
	})
}

func firstNonEmpty(s ...string) string {
	for _, v := range s {
		if v != "" {
			return v
		}
	}
	return ""
}

// heldLine says why a message was held, with Send anyway / Don't send:
// an alert notice above the composer.
func (a *App) heldLine(c *ui.Context) {
	t := a.T
	a.notice(c, "held", noticeAlert, func() {
		a.glyph(c, 18, drawBang(t.Failed.Ink))
	}, func() {
		uiText(c, a.L.T("secret.held")).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Failed.Ink)
	}, func() {
		if a.button(c, a.L.T("secret.send"), btnText, t.ControlSM, t.Surface) {
			a.SendHeld()
		}
		if a.button(c, a.L.T("secret.cancel"), btnSecondary, t.ControlSM, t.Surface) {
			a.held = nil
		}
	})
}
