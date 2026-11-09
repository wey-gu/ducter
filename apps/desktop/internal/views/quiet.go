package views

import (
	"math"
	"sort"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/say"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The quiet conversation (D104). By default the conversation is the
// partner's words. What stands behind a message (its task, the proof, the
// changes, what went out, what it noted) is one tap away under a single
// quiet Details; Merge into main stays one tap as a text button when it is
// the next step. While the user waits, the clay partner and one plain line
// of what it is doing sit where the reply will land.

// detailsOpen says whether a message's Details is open: the preference
// (Settings › Details in the conversation), flipped where the person
// clicked.
func (a *App) detailsOpen(key string) bool {
	return a.Local.DetailsShown() != a.open["det:"+key]
}

// quietButton is a text button for the quiet row: 13pt words, no fill,
// muted (strong: ink 700, for the one next step), a chevron after
// Details. It never truncates.
func (a *App) quietButton(c *ui.Context, key, label, about string, strong bool, chevron int) bool {
	t := a.T
	name := label
	if about != "" {
		name = label + " · " + about
	}
	b := ui.Row(c.Key("qb:" + key)).Gap(4).AlignItems(ui.Center).MinHeight(28).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Label(name).Focusable().Shrink(0)
	hover := b.Hovered() || b.Pressed()
	b.Children(func() {
		col, w := t.InkMuted, 500
		if strong {
			col, w = t.Ink, 700
		}
		if hover {
			col = t.Ink
		}
		ui.Text(c, label).FontSize(t.SM).FontWeight(w).TextColor(col).SingleLine().AccessHidden(about != "")
		if chevron != 0 {
			a.glyph(c, 12, drawChevron(col, chevron > 1))
		}
	})
	return b.Clicked()
}

// drawChevron is a small › (down when open).
func drawChevron(col ui.Color, down bool) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		if down {
			m.MoveTo(cx-3.5, cy-1.5)
			m.LineTo(cx, cy+2)
			m.LineTo(cx+3.5, cy-1.5)
		} else {
			m.MoveTo(cx-1.5, cy-3.5)
			m.LineTo(cx+2, cy)
			m.LineTo(cx-1.5, cy+3.5)
		}
		p.StrokePath(&m, 1.8, col)
	}
}

// detailsToggle is the single quiet affordance under a message.
func (a *App) detailsToggle(c *ui.Context, key, about string) {
	open := a.detailsOpen(key)
	label, chev := a.L.T("details.show"), 1
	if open {
		label, chev = a.L.T("details.hide"), 2
	}
	if a.quietButton(c, "det:"+key, label, about, false, chev) {
		a.open["det:"+key] = !a.open["det:"+key]
	}
}

// noted is one 记下了 / Noted line a message's Details carries.
type noted struct {
	seq   int64
	title string
}

// notedFor are the Noted lines answering the same user message as e, under
// the last partner message that answers it.
func (a *App) notedFor(e *store.Entry) []noted {
	reply := replyOf(e)
	if reply == 0 {
		return nil
	}
	var last *store.Entry
	for _, x := range a.S.Channel {
		if replyOf(x) == reply {
			last = x
		}
	}
	if last != e {
		return nil
	}
	var out []noted
	for _, x := range a.S.Channel {
		if x.Noted != nil && x.Noted.ReplyTo == reply && !a.forgotten[x.FirstSeq] {
			out = append(out, noted{x.FirstSeq, x.Noted.Title})
		}
	}
	return out
}

func replyOf(e *store.Entry) int64 {
	switch {
	case e.AI != nil:
		return e.AI.ReplyTo
	case e.Job != nil && e.Job.Ack != nil:
		return e.Job.Ack.ReplyTo
	}
	return 0
}

// quiet is what follows a partner message: one quiet row (Merge into main
// when it is the next step, then Details), then Details when open.
func (a *App) quiet(c *ui.Context, key string, tasks []*store.Task, detail string, notes []noted) {
	if len(tasks) == 0 && len(notes) == 0 {
		return
	}
	about := ""
	if len(tasks) > 0 {
		about = tasks[0].Title()
	}
	a.underBubble(c, func() { a.messageRow(c, key, tasks, detail, notes, about) })
}

// messageRow is the quiet row and, when open, Details, under a bubble.
func (a *App) messageRow(c *ui.Context, key string, tasks []*store.Task, detail string, notes []noted, about string) {
	t := a.T
	ui.Row(c.Key("qrow:" + key)).Gap(t.S4).Wrap().AlignItems(ui.Center).Children(func() {
		for _, task := range tasks {
			a.mergeAction(c, task)
		}
		a.detailsToggle(c, key, about)
	})
	if !a.detailsOpen(key) {
		return
	}
	a.detailsPane(c, key, func() {
		for _, task := range tasks {
			a.resultDetails(c, task, detail)
		}
		for _, n := range notes {
			ui.Row(c.Key(n.seq)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.L.T("memory.noted", n.title)).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
				if a.quietButton(c, "forget", a.L.T("partner.memory.forget"), n.title, false, 0) {
					a.forgetNoted(n.seq, n.title)
				}
			})
		}
	})
}

// detailsPane sets Details in from a hairline, under the message.
func (a *App) detailsPane(c *ui.Context, key string, body func()) {
	t := a.T
	ui.Row(c.Key("det:" + key)).Gap(t.S3 + 2).AlignItems(ui.Stretch).Children(func() {
		ui.Box(c).Width(1.5).AlignSelf(ui.Stretch).Background(t.Line).Shrink(0)
		ui.Column(c).Gap(t.S2).Grow(1).MinWidth(0).Padding(t.S1, 0).Children(body)
	})
}

// mergeAction is Merge into main as a text button when it is the task's
// next step, and its state in words after.
func (a *App) mergeAction(c *ui.Context, task *store.Task) {
	t := a.T
	p := task.Place()
	if !finished(task) || !task.CanIntegrate() {
		return
	}
	base := p.BaseBranch
	if base == "" {
		base = "main"
	}
	switch {
	case task.Acting != "":
		ui.Text(c.Key("acting:"+task.ID), a.L.T("result.acting."+task.Acting, base)).FontSize(t.SM).TextColor(t.InkMuted)
	case task.Unsure != "":
		if a.quietButton(c, "retry:"+task.ID, a.L.T("task.action.retry"), a.L.T("result.unsure"), true, 0) {
			a.RetryAction(task)
		}
	case task.Acted != nil && task.Acted.OK && task.Acted.Action == "merge":
		ui.Row(c.Key("merged:" + task.ID)).Gap(t.S1 + 2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 14, drawCheck(t.Done.Ink))
			ui.Text(c, a.L.T("result.merged", base)).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
		})
	default:
		if a.quietButton(c, "merge:"+task.ID, a.L.T("result.merge", base), task.Title(), true, 0) {
			task.Acting = "merge"
			a.TaskAction(task.ID, "merge")
		}
	}
}

// resultDetails are a task's lines inside Details: under way, its status
// line; finished, the proof (with the changes and its title as links) and
// Open draft PR. What went out shows above the quiet row.
func (a *App) resultDetails(c *ui.Context, task *store.Task, detail string) {
	if !finished(task) {
		a.taskLine(c, task, detail)
		return
	}
	a.ensureHistory(task.ID)
	evs := task.Evidence
	if r := task.LastReport; r != nil && len(r.Evidence) > 0 {
		evs = r.Evidence
	} else if r := task.Card; r != nil && r.LastReport != nil && len(r.LastReport.Evidence) > 0 {
		evs = r.LastReport.Evidence
	}
	a.proofLine(c, task, evs, true)
	merged := task.Acted != nil && task.Acted.OK && task.Acted.Action == "merge"
	if task.CanIntegrate() && task.Acting == "" && !merged && !noRemote(task) {
		if a.quietLink(c, "pr:"+task.ID, a.L.T("result.pr"), a.L.T("result.pr")+" · "+task.Title()) {
			task.Acting = "open_pr"
			a.TaskAction(task.ID, "open_pr")
		}
	}
	a.prFailureLine(c, task)
}

// forgetNoted forgets a Noted line (D71's Forget) and hides it here.
func (a *App) forgetNoted(seq int64, title string) {
	if a.forgotten == nil {
		a.forgotten = map[int64]bool{}
	}
	a.forgotten[seq] = true
	if a.partner.forgetting == nil {
		a.partner.forgetting = map[int64]string{}
	}
	a.partner.forgetting[seq] = title
	a.send(protocol.MemoryForget{T: "memory_forget", Seq: seq})
}

// ---------- the living message, quiet ----------

func openAsk(d *store.DecisionState) bool { return d != nil && d.Resolved == nil && d.Pending == "" }

func dueAt(d *store.DecisionState) time.Time {
	if at := store.ParseTime(d.DefaultAt); !at.IsZero() {
		return at
	}
	return time.Unix(math.MaxInt32, 0)
}

// livingWords is a living item as one sentence. The task's own words
// stand only when they are in the reader's language (D154); else just
// what came of it, by its title: the opened task keeps its words.
func (a *App) livingWords(it protocol.LivingItem) string {
	k := "living.done"
	if it.Kind == "failed" {
		k = "living.failed"
	}
	said := say.Sayable(it.Text, a.tongue())
	switch {
	case said != "" && it.Title != "":
		return a.L.T(k, it.Title, said)
	case said != "":
		return said
	case it.Title != "":
		return a.L.T(k+".short", it.Title)
	}
	return a.L.T(k+".short", a.L.T("living.it"))
}

// news is a living item the partner didn't report itself, said as one
// sentence: a task that didn't work, or one that came back.
func (a *App) news(c *ui.Context, key string, it protocol.LivingItem, owns bool) {
	t := a.T
	task := a.S.Task(it.TaskID)
	if task != nil {
		// The partner is putting the result into its own words (D124): its
		// waiting presence holds the place, not a template line its message
		// replaces a minute later.
		if wait := a.wordsDueIn(task); wait > 0 {
			c.After(wait + 50*time.Millisecond)
			a.waitingRow(c.Key("words:"+key), a.L.T("activity.result"), "")
			return
		}
	}
	text := a.livingWords(it)
	ui.Column(c.Key("news:" + key)).Gap(t.S1).Children(func() {
		a.partnerWords(c, text)
		// The action row shows once, under the newest message about the task.
		if task != nil && owns {
			a.quiet(c, key, []*store.Task{task}, "", nil)
		}
	})
}

// ask is one question in the partner's words (D129): the question in its
// bubble (a task's question as the partner said it, its own wording in
// Details), then, while open, one compact tray (Reply… · Hold · Go) and the
// default as a small grey line; once answered, a tiny line on the user's
// side in their own words. While the partner is still putting a task's
// question into words, its waiting presence holds the place.
func (a *App) ask(c *ui.Context, d *store.DecisionState, taskID string) {
	t := a.T
	id := firstNonEmpty(taskID, d.TaskID)
	task := a.S.Task(id)
	key := "d" + d.DecisionID
	inTask := a.Route == RouteTask && a.TaskID == id
	words := a.questionOf(d)
	if d.Said != "" && !inTask {
		words = d.Said
	}
	if !inTask && openAsk(d) {
		if wait := a.relayDueIn(d); wait > 0 {
			c.After(wait + 50*time.Millisecond)
			a.waitingRow(c.Key("relay:"+d.DecisionID), a.L.T("activity.relay"), "")
			return
		}
	}
	ui.Column(c.Key("ask:" + d.DecisionID)).Gap(t.S2).Children(func() {
		a.partnerWords(c, words)
		// A routine's proposal card (D29, D114): what it would do, before one Go.
		if d.RoutineID != "" && d.Resolved == nil {
			ui.Column(c.Key("facts")).MaxWidth(t.BubbleMeasure).Padding(t.S4, t.S4).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
				a.routineFacts(c, d.RoutineID, t.NeedsYou.Ink)
			})
		}
		if d.SignIn != nil {
			// D151: Sign in opens the live view; answered, it says signed in or not now.
			a.underBubble(c, func() { a.signInButtons(c, d, decisionStyle{height: t.ControlSM, quietBg: t.Bg}) })
			return
		}
		if !openAsk(d) {
			a.answeredLine(c, d)
			return
		}
		details := task != nil && task.Title() != "" && !inTask
		a.decisionTray(c, d, task, key, details)
		if details && a.detailsOpen(key) {
			a.underBubble(c, func() {
				a.detailsPane(c, key, func() {
					a.taskLine(c, task, "")
					if d.Said != "" && d.Question != "" {
						ui.Text(c, a.L.T("decision.its_words", d.Question)).Selectable().FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
					}
				})
			})
		}
	})
}

// livingQuiet is the living message without its card: a small divider
// when the person was away, what didn't work or came back as sentences,
// then the asks: the one whose default comes soonest with its buttons, the
// rest gathered in one line until it is answered or opened.
func (a *App) livingQuiet(c *ui.Context, e *store.Entry, away bool) {
	t := a.T
	items := a.livingItems(e)
	shown := a.Local.DetailsShown()
	type askItem struct {
		it protocol.LivingItem
		d  *store.DecisionState
	}
	var answered, waiting []askItem
	var news, lines []protocol.LivingItem
	for _, it := range items {
		switch it.Kind {
		case "decision":
			d := a.S.Decisions[it.DecisionID]
			if d == nil {
				continue
			}
			if openAsk(d) {
				waiting = append(waiting, askItem{it, d})
			} else {
				answered = append(answered, askItem{it, d})
			}
		case "failed", "done":
			news = append(news, it)
		default:
			if shown {
				lines = append(lines, it)
			}
		}
	}
	sort.SliceStable(waiting, func(i, j int) bool { return dueAt(waiting[i].d).Before(dueAt(waiting[j].d)) })
	head := waiting
	if !shown && !a.open["asks:"+itoa(e.FirstSeq)] && len(waiting) > 1 {
		head = waiting[:1]
	}
	rest := len(waiting) - len(head)
	defaults := 0
	for _, w := range waiting {
		if w.d.Reversible {
			defaults++
		}
	}
	ui.Column(c.Key("living")).Gap(t.S4).Label(a.L.T("living.title")).Children(func() {
		if away {
			a.timeLine(c, a.L.T("living.away.at", clockOf(e.Event.TS)))
		}
		for i, it := range news {
			a.news(c.Key(i), "l"+itoa(e.FirstSeq)+":"+it.TaskID, it, a.chipOwner[it.TaskID] == e.FirstSeq)
		}
		if len(lines) > 0 {
			ui.Column(c).Gap(t.S2).Children(func() {
				for i, it := range lines {
					a.livingLine(c.Key(i), it)
				}
			})
		}
		for _, x := range answered {
			a.ask(c, x.d, x.it.TaskID)
		}
		for _, x := range head {
			a.ask(c, x.d, x.it.TaskID)
		}
		if rest > 0 || (len(head) >= 2 && defaults >= 2) {
			ui.Row(c.Key("gather")).Gap(t.S4).Wrap().AlignItems(ui.Center).Children(func() {
				if rest > 0 && a.quietButton(c, "more", a.L.T("living.more", rest), "", false, 1) {
					a.open["asks:"+itoa(e.FirstSeq)] = true
				}
				if defaults >= 2 && a.quietButton(c, "goall", a.L.T("decision.goall", len(a.defaultable())), "", false, 0) {
					a.GoOnAllDefaults()
				}
			})
		}
	})
}

// timeLine is a messaging app's time line: small, centered, muted.
func (a *App) timeLine(c *ui.Context, text string) {
	t := a.T
	ui.Row(c.Key("when:"+text)).Justify(ui.Center).Padding(t.S3, 0, t.S2, 0).Children(func() {
		ui.Text(c, text).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
	})
}

func clockOf(iso string) string {
	at := store.ParseTime(iso)
	if at.IsZero() {
		return ""
	}
	return at.Local().Format("15:04")
}

// whenOf is a time line's words: "15:04" today, else "1/2 15:04".
func (a *App) whenOf(iso string) string {
	at := store.ParseTime(iso)
	if at.IsZero() {
		return ""
	}
	at = at.Local()
	now := a.Now().Local()
	if at.YearDay() == now.YearDay() && at.Year() == now.Year() {
		return at.Format("15:04")
	}
	return at.Format("1/2 15:04")
}

// timeGap is a time line before the first row and wherever 15 minutes
// passed.
const timeGap = 15 * time.Minute

// presenceRow is shown while the user waits on a reply: the clay partner
// where its words will appear, and one plain line of what it is doing,
// updated in place, gone when the reply lands. A step past 15 s adds a
// reassuring line; past 45 s, that it will say when it's ready.
func (a *App) presenceRow(c *ui.Context) {
	step, since := "thinking", a.thinkingSince
	if act := a.S.Activity; act != nil {
		step, since = act.Step, a.S.ActivityAt
	}
	if since.IsZero() {
		since = a.lastUserAt()
	}
	el := time.Since(since)
	sub := ""
	switch {
	case el >= 45*time.Second:
		sub = a.L.T("activity.long")
	case el >= 15*time.Second:
		sub = a.L.T("activity.slow")
	}
	if sub == "" && !since.IsZero() {
		c.After(15*time.Second - el) // the reassuring line comes on time
	} else if el < 45*time.Second {
		c.After(45*time.Second - el)
	}
	a.waitingRow(c.Key("presence"), a.L.T("activity."+step), sub)
}

// waitingRow is the clay partner at work and one plain line where its
// words will land; sub is a second, reassuring line ("" for none).
func (a *App) waitingRow(c *ui.Context, line, sub string) {
	t := a.T
	ui.Row(c).Gap(t.S3).AlignItems(ui.Center).MinHeight(40).Role(ui.RoleStatus).Label(line).Children(func() {
		a.partnerFace(c, "presence", theme.Working, 32)
		ui.Column(c).Gap(1).MinWidth(0).Children(func() {
			ui.Text(c, line).FontSize(t.MD).TextColor(t.InkMuted)
			if sub != "" {
				ui.Text(c, sub).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
	})
}

// lastUserAt is when the newest user message was logged.
func (a *App) lastUserAt() time.Time {
	for i := len(a.S.Channel) - 1; i >= 0; i-- {
		if e := a.S.Channel[i]; e.User != nil {
			return store.ParseTime(e.Event.TS)
		}
	}
	return time.Time{}
}

// readingMeasure is the partner's line length: 36em at its 18pt voice,
// about 36 Chinese characters or 68 Latin ones (D104).
const readingMeasure = 36 * 18
