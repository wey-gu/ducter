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
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const convWidth = 760

// row is one row of the conversation's list: an entry, or a message sent
// and not yet echoed.
type row struct {
	entry   *store.Entry
	pending *pendingMsg
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
		return rows[i].entry.FirstSeq
	}
	a.list.FollowEnd = true
	if !c.Preferences().ReduceMotion {
		a.list.FollowAnimation = &ui.Smooth
	} else {
		a.list.FollowAnimation = nil
	}
	// Rhythm: S3 between two things the same voice says, S5 where the
	// turn passes from one to the other.
	userTurn := func(i int) bool { return rows[i].pending != nil || rows[i].entry.User != nil }
	ui.List(c, &a.list, len(rows), func(i int) {
		top := float32(0)
		if i > 0 && userTurn(i) != userTurn(i-1) {
			top = t.S5 - t.S3
		}
		ui.Row(c).Justify(ui.Center).Padding(top, 0, 0, 0).Children(func() {
			ui.Column(c).Grow(1).MaxWidth(convWidth).Children(func() {
				if p := rows[i].pending; p != nil {
					a.userBubble(c, p.text, true)
					return
				}
				a.entry(c, rows[i].entry)
			})
		})
	}).Grow(1).Padding(t.S5, t.S5, t.S4, t.S5).Gap(t.S3).Children(func() {
		if len(rows) == 0 && a.S.Welcomed {
			a.emptyConversation(c)
		}
	})
	a.firstResultLine(c)
	a.cliOfferLine(c)
	a.composer(c)
	a.readWhenSeen(c)
}

// emptyConversation greets a fresh user: who Ducter is, and three real
// first things to say. A suggestion fills the composer; it never sends.
func (a *App) emptyConversation(c *ui.Context) {
	t := a.T
	col := ui.Column(c.Key("empty")).Margin(ui.Auto).MaxWidth(520).AlignItems(ui.Center).Gap(t.S4)
	a.enter(c, col)
	col.Children(func() {
		a.avatar(c, theme.Idle, 180)
		ui.Text(c, a.L.T("empty.conversation.title", a.S.PersonaName)).FontSize(t.XXL).FontWeight(800).LetterSpacing(-0.3)
		ui.Text(c, a.L.T("empty.conversation")).FontSize(t.LG).TextAlign(ui.Center).TextColor(t.InkSoft).LineHeight(1.6)
		ui.Column(c).Gap(t.S2).Margin(t.S3, 0, 0, 0).AlignItems(ui.Stretch).Width(460).MaxWidthPercent(100).Children(func() {
			ui.Text(c, a.L.T("empty.try")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).LetterSpacing(0.5)
			for n, text := range a.suggestions() {
				i := n + 1
				// A starter is a secondary button holding a sentence.
				chip := ui.Row(c.Key(i)).Gap(t.S3).MinHeight(t.ControlLG).Padding(t.S3, t.S4).Radius(t.RadiusSM).AlignItems(ui.Center).
					Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(text).Focusable()
				a.buttonLook(c, chip, btnSecondary, t.ControlLG, t.Surface)
				chip.Children(func() {
					ui.Text(c, text).FontSize(t.MD).Grow(1).MinWidth(0)
				})
				if chip.Clicked() {
					a.draft = text
					a.focusComposer = true
				}
			}
			if n := a.Local.RepoCount(); n > 0 {
				ui.Text(c, a.L.T("empty.repos.note", n)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5).Margin(t.S1, 2, 0, 2)
			}
		})
		// The end of the first run: where Ducter lives and what it can do.
		if a.button(c, a.L.T("firstrun.devices"), btnText, t.ControlMD, t.Bg) {
			a.OpenDevices()
		}
	})
}

func (a *App) header(c *ui.Context) {
	t := a.T
	b := a.S.Board()
	a.chrome(c, "conversation", func() {
		a.avatar(c, a.presence(c), 40)
		ui.Column(c).Gap(1).MinWidth(0).Children(func() {
			ui.Text(c, a.S.PersonaName).FontSize(t.MD).FontWeight(800).LetterSpacing(-0.2).SingleLine()
			ui.Text(c, a.summary(b)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
		})
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
	if n := len(b.Lanes[store.LaneWorking]); n > 0 {
		parts = append(parts, a.L.T("header.working", n))
	} else if a.thinking() {
		parts = append(parts, a.L.T("header.thinking"))
	}
	if n := a.doneToday(b); n > 0 {
		parts = append(parts, a.L.T("header.done", n))
	}
	if len(parts) == 0 {
		// A reminder or a waiting task is still something on hand.
		if n := len(b.Lanes[store.LaneWaiting]) + len(a.looseWaiters()); n > 0 {
			return a.L.T("header.waiting", n)
		}
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
			return true
		case e.AI != nil || e.Job != nil:
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
	ui.Row(c).Children(func() {
		ui.Spacer(c)
		r := t.BubbleRadius
		b := ui.Text(c, text).Selectable().SelectionColor(t.InkSoft).FontSize(t.MD).LineHeight(1.55).
			TextColor(t.OnUserBubble).Background(t.UserBubble).Padding(t.S3, t.S4).Radius(r[0], r[1], r[2], r[3]).
			MaxWidthPercent(72)
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
		ui.Column(c).MaxWidthPercent(88).Gap(t.S3).Children(func() {
			markdown.View(c, e.AI.Text, &a.md)
			a.chipsFor(c, e)
		})
	case e.Job != nil:
		a.job(c, e.Job, e.FirstSeq)
	case e.Noted != nil:
		// Shown, not explained (D43): one quiet line, no card, no action.
		ui.Text(c, a.L.T("memory.noted", e.Noted.Title)).FontSize(t.XS).TextColor(t.InkMuted)
	case e.Living != nil:
		a.living(c, e)
	case e.Decision != nil:
		if d := a.S.Decisions[e.Decision.DecisionID]; d != nil {
			ui.Column(c).Padding(t.S4, t.S5).Gap(t.S2).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).Children(func() {
				head := a.stateLabel(protocol.NeedsYou)
				if task := a.S.Task(d.TaskID); task != nil && task.Title() != "" {
					head += " · " + task.Title()
				}
				ui.Text(c, head).FontSize(t.XS).FontWeight(800).TextColor(t.NeedsYou.Ink).LetterSpacing(0.5)
				a.decisionBody(c, d, "")
			})
		}
	}
}

// chipsFor shows the chips of the tasks an AI message's reply started.
func (a *App) chipsFor(c *ui.Context, e *store.Entry) {
	if e.AI == nil || e.AI.ReplyTo == 0 {
		return
	}
	var tasks []*store.Task
	for _, id := range a.tasksOfReply(e.AI.ReplyTo) {
		if t := a.S.Task(id); t != nil && a.chipOwner[id] == e.FirstSeq {
			tasks = append(tasks, t)
		}
	}
	if len(tasks) == 0 {
		return
	}
	ui.Column(c).Gap(a.T.S3).Children(func() {
		for _, t := range tasks {
			a.taskFooter(c, t, "")
		}
	})
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

// job is an ack in the partner's voice, then the job's status line and the
// chip of its task.
func (a *App) job(c *ui.Context, j *store.Job, firstSeq int64) {
	t := a.T
	ui.Column(c).MaxWidthPercent(88).Gap(t.S3).Children(func() {
		if j.Ack != nil {
			ui.Text(c, j.Ack.Text).Selectable().FontSize(t.PartnerSize).LineHeight(1.65)
		}
		st := j.Status
		if st == nil {
			return
		}
		var task *store.Task
		if st.TaskID != "" {
			task = a.S.Task(st.TaskID)
		}
		if task != nil && task.Title() != "" && a.chipOwner[task.ID] != firstSeq {
			return // a later message shows its chip
		}
		if task != nil && task.Title() != "" {
			a.taskFooter(c, task, st.Text)
			return
		}
		// A status line of no task: its words, in the state's ink when it
		// failed (the exception), muted otherwise. No dot.
		col := t.InkMuted
		if st.State == "failed" {
			col = t.Failed.Ink
		}
		ui.Text(c, st.Text).FontSize(t.SM).TextColor(col)
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
	t := a.T
	items := a.livingItems(e)
	// "While you were away" only for what came while the user was away.
	away, ok := a.livingAway[e.FirstSeq]
	if !ok {
		// It came before this window was open, or while it was in the
		// background.
		away = e.FirstSeq <= a.S.HeadSeq || !c.WindowActive() || c.WindowHidden()
		a.livingAway[e.FirstSeq] = away
	}
	card := ui.Column(c.Key("living")).Padding(t.S5).Gap(t.S4).Radius(t.RadiusXL).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Label(a.L.T("living.title"))
	a.resettle(c, card, e.Revision)
	card.Children(func() {
		if away {
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.L.T("living.title")).FontSize(t.XL).FontWeight(800).LetterSpacing(-0.2).Grow(1)
				if a.S.Unread(e) {
					a.tag(c, a.L.T("living.unread"), theme.StateColors{Surface: t.Highlight, Ink: t.HighlightInk})
				}
			})
		}
		needs, open := 0, 0
		for _, it := range items {
			if it.Kind == "decision" {
				needs++
				if d := a.S.Decisions[it.DecisionID]; d != nil && d.Resolved == nil && d.Pending == "" && d.Reversible {
					open++
				}
			}
		}
		if open >= 2 {
			ui.Row(c).Children(func() {
				ui.Spacer(c)
				if a.button(c, a.L.T("decision.goall", len(a.defaultable())), btnSecondary, t.ControlMD, t.Surface) {
					a.GoOnAllDefaults()
				}
			})
		}
		// Needs-you first, each with its default; then the rest, one line
		// each.
		for i, it := range items {
			if it.Kind != "decision" {
				continue
			}
			d := a.S.Decisions[it.DecisionID]
			ui.Column(c.Key(i)).Padding(t.S4, t.S5).Gap(t.S2).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).Children(func() {
				ui.Text(c, a.L.T("living.needsyou", needs)).FontSize(t.XS).FontWeight(800).TextColor(t.NeedsYou.Ink).LetterSpacing(0.5)
				if d == nil {
					ui.Text(c, it.Text).FontSize(t.LG).LineHeight(1.5).FontWeight(500)
					return
				}
				a.decisionBody(c, d, it.TaskID)
			})
		}
		ui.Column(c).Gap(t.S3).Children(func() {
			for i, it := range items {
				if it.Kind == "decision" {
					continue
				}
				a.livingLine(c.Key(i), it)
			}
		})
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
	ui.Text(c, d.Question).FontSize(t.LG).LineHeight(1.5).FontWeight(500)
	if d.Resolved == nil {
		ui.Text(c, a.defaultLine(c, d)).FontSize(t.SM).TextColor(t.NeedsYou.Ink)
	}
	ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).Padding(t.S1, 0, 0, 0).Children(func() {
		ui.Column(c).Grow(1).Children(func() {
			a.decisionButtons(c, d, decisionStyle{height: t.ControlMD, quietBg: t.Surface})
		})
		if id := firstNonEmpty(taskID, d.TaskID); id != "" {
			if a.buttonFor(c, a.L.T("living.details"), a.decisionAbout(d), btnText, t.ControlMD, t.NeedsYou.Surface) {
				a.OpenTask(id)
			}
		}
	})
}

func (a *App) livingLine(c *ui.Context, it protocol.LivingItem) {
	t := a.T
	sc := t.Done
	icon := drawCheck(t.Done.Ink)
	switch it.Kind {
	case "blocked":
		sc, icon = t.Waiting, drawClock(t.Waiting.Ink)
	case "progress":
		sc, icon = t.Working, drawArrow(t.Working.Ink)
	case "failed":
		sc, icon = t.Failed, drawCross(t.Failed.Ink)
	}
	line := ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Cursor(ui.CursorPointer)
	line.Children(func() {
		a.glyphTile(c, t.IconTile, sc.Surface, icon)
		text := it.Text
		if it.Title != "" {
			text = it.Title + " · " + it.Text
		}
		col := t.Ink
		if it.Kind == "blocked" {
			col = t.InkSoft
		}
		ui.Text(c, text).FontSize(t.MD).TextColor(col).Grow(1).MinWidth(0).LineHeight(1.45).MaxLines(3).Tooltip(text)
		if len(it.Evidence) > 0 {
			ev := it.Evidence[0]
			l := ui.Text(c.Key("ev"), a.L.T("living.evidence")).FontSize(t.SM).FontWeight(700).Role(ui.RoleLink).
				Cursor(ui.CursorPointer).Underline().Tooltip(ev.Label).Shrink(0)
			if l.Clicked() {
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
			Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
		box.Children(func() {
			ta := ui.TextArea(c.Key("composer"), &a.draft).Lines(1, 8).MinHeight(0).Placeholder(a.L.T("composer.placeholder", a.S.PersonaName)).
				Label(a.L.T("composer.label", a.S.PersonaName)).AutoFocus().
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S3, 0).Grow(1).FontSize(t.MD).
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
		a.glyphTile(c, 24, t.Surface, drawBang(t.Failed.Ink))
	}, func() {
		ui.Text(c, a.L.T("secret.held")).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Failed.Ink)
	}, func() {
		if a.button(c, a.L.T("secret.cancel"), btnSecondary, t.ControlSM, t.Surface) {
			a.held = nil
		}
		if a.button(c, a.L.T("secret.send"), btnText, t.ControlSM, t.Surface) {
			a.SendHeld()
		}
	})
}
