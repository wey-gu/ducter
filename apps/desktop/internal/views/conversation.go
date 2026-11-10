package views

import (
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
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
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
		if e.Decision != nil && a.S.DecisionShownInLiving(e.Decision.DecisionID) {
			continue
		}
		// A Noted line lives in the Details of the reply it belongs to (D104).
		if e.Noted != nil {
			continue
		}
		rows = append(rows, row{entry: e})
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
	a.header(c)
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
	ui.List(c, &a.list, len(rows), func(i int) {
		e := rows[i].entry
		var prev *store.Entry
		if i > 0 {
			prev = rows[i-1].entry
		}
		// A time line before the first message and wherever 15 minutes
		// passed, as a messaging app has (D104); the away divider is one.
		when := e != nil && a.timeLineBefore(prev, e)
		top, join := float32(0), false
		switch {
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
					a.userBubble(c, p.text, true)
					return
				}
				if rows[i].presence {
					a.presenceRow(c)
					return
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
	a.firstResultLine(c)
	// One card at a time under the conversation: Ducter can't run in the
	// background, else a gentle ask, else the Terminal offer.
	if !a.backgroundLine(c) && !a.askLine(c) {
		a.cliOfferLine(c)
	}
	a.composer(c)
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
					ui.Text(c, s).FontSize(t.LG).TextAlign(ui.Center).TextColor(t.InkSoft).LineHeight(leadingFor(s, 1.55)).Balance()
				}
			})
		})
		ui.Column(c).Gap(t.S3).Margin(t.S6, 0, 0, 0).AlignItems(ui.Stretch).Width(640).MaxWidthPercent(100).Children(func() {
			ui.Text(c, a.L.T("empty.try")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).LetterSpacing(0.5).Margin(0, 0, 0, 2)
			ui.Row(c).Wrap().Gap(t.S3).AlignItems(ui.Stretch).Children(func() {
				for n, text := range a.suggestions() {
					text := autospace(text)
					// A starter is a secondary button holding a sentence, two to a row.
					chip := ui.Row(c.Key(n+1)).Basis(260).Grow(1).MinHeight(64).Padding(t.S3, t.S4).Radius(t.RadiusMD).AlignItems(ui.Center).
						Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(text).Focusable()
					a.buttonLook(c, chip, btnSecondary, t.ControlLG, t.Surface)
					chip.Children(func() {
						ui.Text(c, text).FontSize(t.MD).LineHeight(leadingFor(text, 1.45)).Grow(1).MinWidth(0)
					})
					if chip.Clicked() {
						a.draft = unautospace(text)
						a.focusComposer = true
					}
				}
			})
		})
		ui.Column(c).Margin(t.S3, 0, 0, 0).AlignItems(ui.Center).Children(func() { a.memLine(c) })
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
			ui.Text(c, text).FontSize(t.PartnerSize).LineHeight(leadingFor(text, 1.5)).TextColor(t.OnPartnerBubble)
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
	b := a.S.Board()
	a.chrome(c, "conversation", func() {
		// The partner itself opens its page (伙伴 / Partner): its face and
		// name are the way in, as a character in a game.
		who := ui.Row(c.Key("who")).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).Padding(2, t.S2, 2, 2).Radius(t.RadiusMD).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("nav.partner") + " · " + a.S.PersonaName).Focusable()
		if who.Hovered() || who.Pressed() {
			who.Background(t.SurfaceSunken.Mix(t.Chrome, 0.45))
		}
		who.Children(func() {
			// The clay partner, 52 points: it breathes and blinks (D77).
			a.partnerFace(c, "bar", a.presence(c), 52)
			ui.Column(c).Gap(1).MinWidth(0).Children(func() {
				a.heading(c, a.S.PersonaName, t.XL).LineHeight(1.1).SingleLine()
				ui.Text(c, a.summary(b)).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
			})
		})
		if who.Clicked() {
			a.OpenPartner()
		}
	}, func() {
		a.devicesButton(c)
		a.onHandButton(c, b)
	})
}

// devicesButton opens Your devices and abilities: the clay device Ducter
// lives on, and the word for it.
func (a *App) devicesButton(c *ui.Context) {
	t := a.T
	if a.navButton(c, "devices", a.L.T("nav.devices"), a.L.T("nav.devices.label"), func() {
		art := "laptop_awake"
		if home := a.homeDevice(); home != nil {
			art = deviceArt(home)
		}
		ui.Box(c).Size(22, 22).Radius(6).Background(t.Clay).Padding(1).Shrink(0).Children(func() {
			if b := theme.Clay(art); b != nil {
				ui.Image(c, b).Grow(1).AccessHidden(true)
			}
		})
	}) {
		a.OpenDevices()
	}
}

// WaitingCount is how many things wait for the person (the header's
// "等你"), for the Dock badge while the window is closed.
func (a *App) WaitingCount() int {
	if !a.S.Welcomed {
		return 0
	}
	return len(a.S.Board().Lanes[store.LaneNeedsYou]) + len(a.partnerDecisions())
}

func (a *App) summary(b store.Board) string {
	switch a.Status {
	case client.Connecting:
		if a.S.Persona == "" {
			return a.L.T("conn.connecting")
		}
	case client.Disconnected:
		return a.L.T("conn.offline")
	}
	// Live: what needs the user, what is being worked on, what came back.
	var parts []string
	if n := len(b.Lanes[store.LaneNeedsYou]) + len(a.partnerDecisions()); n > 0 {
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
	if len(parts) == 0 {
		return a.L.T("header.summary.none")
	}
	return strings.Join(parts, " · ")
}

// thinking reports whether the partner owes an answer: the user's last
// message has no ack or reply after it yet.
func (a *App) thinking() bool {
	if len(a.pending) > 0 {
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

// doneToday counts the tasks handed back today.
func (a *App) doneToday(b store.Board) int {
	n := 0
	today := a.Now().Local().YearDay()
	for _, t := range b.Lanes[store.LaneDone] {
		if t.Attention() == protocol.Failed {
			continue
		}
		at := time.Time{}
		if t.Card != nil {
			at = store.ParseTime(t.Card.UpdatedAt)
		}
		if at.IsZero() && len(t.Events) > 0 {
			at = store.ParseTime(t.Events[len(t.Events)-1].TS)
		}
		if at.IsZero() || at.Local().YearDay() == today {
			n++
		}
	}
	return n
}

// onHandButton opens On hand.
func (a *App) onHandButton(c *ui.Context, b store.Board) {
	// Just the word: the header's line already says what needs you and
	// what is being worked on, in words; no row of colored dots.
	if a.navButton(c, "onhand", a.L.T("nav.onhand"), a.L.T("nav.onhand"), nil) {
		a.Route = RouteOnHand
		a.markRead()
	}
}

func (a *App) userBubble(c *ui.Context, text string, pending bool) {
	t := a.T
	join := a.takeJoin()
	ui.Row(c).Children(func() {
		ui.Spacer(c)
		r := t.BubbleRadius
		tr := r[1]
		if join {
			tr = t.BubbleJoin
		}
		b := ui.Text(c, autospace(text)).Selectable().CopyData(autospaceCopy).SelectionColor(t.Highlight).FontSize(t.Bubble).LineHeight(leadingFor(text, 1.5)).
			TextColor(t.OnUserBubble).Background(t.UserBubble).Padding(t.S2+2, t.S4-2).Radius(r[0], tr, r[2], r[3]).
			MaxWidth(t.BubbleMeasure).MaxWidthPercent(76)
		if pending {
			b.Opacity(0.7)
		}
	})
}

func (a *App) entry(c *ui.Context, e *store.Entry) {
	t := a.T
	switch {
	case e.User != nil:
		a.userBubble(c, e.User.Text, false)
	case e.AI != nil:
		// The partner's words get the CJK-Latin gap at display time; a
		// copy leaves it out (D78).
		ui.Column(c).Gap(t.S1).CopyData(autospaceCopy).Children(func() {
			a.partnerBubble(c, a.takeJoin(), func() {
				markdown.View(c, autospace(e.AI.Text), &a.md)
			})
			a.quiet(c, "m"+itoa(e.FirstSeq), a.replyTasks(e), "", a.notedFor(e))
		})
	case e.Job != nil:
		a.job(c, e)
	case e.Living != nil:
		a.living(c, e)
	case e.Decision != nil:
		if d := a.S.Decisions[e.Decision.DecisionID]; d != nil {
			a.ask(c, d, "")
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
			a.partnerWords(c, j.Ack.Text)
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
			a.underBubble(c, func() { ui.Text(c, st.Text).FontSize(t.SM).TextColor(col) })
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
// as plain small words (nothing for the partner's own asks), the
// question, its default, and Go / Hold / Reply… / Details.
func (a *App) decisionCard(c *ui.Context, d *store.DecisionState, taskID string) {
	t := a.T
	ui.Column(c).Padding(t.S5-4, t.S5-2).Gap(t.S2+2).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
		if task := a.S.Task(firstNonEmpty(taskID, d.TaskID)); task != nil && task.Title() != "" {
			ui.Text(c, task.Title()).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink)
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
	question := a.questionOf(d)
	a.heading(c, autospace(question), t.XL).LineHeight(1.35)
	if d.RoutineID != "" && d.Resolved == nil {
		a.routineFacts(c, d.RoutineID, t.NeedsYou.Ink)
	}
	if d.Resolved == nil && d.SignIn == nil {
		ui.Text(c, a.defaultLine(c, d)).FontSize(t.SM).TextColor(t.NeedsYou.Ink)
	}
	st := decisionStyle{height: t.ControlMD, quietBg: t.NeedsYou.Surface}
	if id := firstNonEmpty(taskID, d.TaskID); id != "" && !(a.Route == RouteTask && a.TaskID == id) {
		// Details sits after Reply…, a text button like it.
		st.after = func() {
			if a.buttonFor(c, a.L.T("living.details"), a.decisionAbout(d), btnText, t.ControlMD, t.NeedsYou.Surface) {
				a.OpenTask(id)
			}
		}
	}
	ui.Column(c).Padding(t.S1, 0, 0, 0).Children(func() { a.decisionButtons(c, d, st) })
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
		if said := say.Sayable(it.Text, a.tongue()); said == "" && it.Title != "" {
			text = it.Title
		} else if said == "" {
			text = a.L.T("living.it")
		} else if it.Title != "" {
			text = it.Title + " · " + said
		}
		tx := ui.Text(c, text).FontSize(t.MD).TextColor(t.InkSoft).Grow(1).MinWidth(0).LineHeight(1.45).MaxLines(3).Tooltip(text)
		if line.Hovered() {
			tx.TextColor(t.Ink)
		}
		if len(it.Evidence) > 0 {
			ev := it.Evidence[0]
			// A text button like every other one: flat, no underline.
			if a.buttonFor(c.Key("ev"), a.L.T("living.evidence"), a.proofLabel(ev), btnText, t.ControlSM, t.Surface) {
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
		c.Toast(ev.Label + " · " + ev.Ref)
	}
}

func (a *App) composer(c *ui.Context) {
	t := a.T
	if a.held != nil && a.held.taskID == "" {
		a.aboveComposer(c, func() { a.heldLine(c) })
	}
	ui.Row(c).Justify(ui.Center).Padding(t.S2, t.S5, t.S5, t.S5).Children(func() {
		box := ui.Row(c).Grow(1).MaxWidth(convWidth).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S2, t.S2, t.S5).
			Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
		box.Children(func() {
			ta := ui.TextArea(c.Key("composer"), &a.draft).Lines(1, 8).MinHeight(0).Placeholder(a.L.T("composer.placeholder", a.S.PersonaName)).
				Label(a.L.T("composer.label", a.S.PersonaName)).AutoFocus().
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S3, 0).Grow(1).FontSize(t.Bubble).
				OnTextKey(func(k ui.TextKey) bool {
					if k.Key == ui.KeyEnter && k.Mods == 0 {
						if a.SendMessage(k.Text()) {
							k.SetText("")
						}
						return true
					}
					return false // Shift+Enter breaks the line
				})
			if a.focusComposer {
				ta.Focus()
				a.focusComposer = false
			}
			if a.iconButton(c, a.L.T("composer.send"), t.ControlLG, btnAccent, drawSend) {
				if a.SendMessage(a.draft) {
					a.draft = ""
				}
			}
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
		ui.Text(c, a.L.T("secret.held")).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Failed.Ink)
	}, func() {
		if a.button(c, a.L.T("secret.send"), btnText, t.ControlSM, t.Surface) {
			a.SendHeld()
		}
		if a.button(c, a.L.T("secret.cancel"), btnSecondary, t.ControlSM, t.Surface) {
			a.held = nil
		}
	})
}
