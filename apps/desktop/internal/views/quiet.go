package views

import (
	"math"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/say"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
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
	name := spoken(a.L, label, about)
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
		if chevron < 0 { // D519: back, the chevron before the words
			a.glyph(c, 12, drawBackChevron(col))
		}
		uiText(c, label).FontSize(t.SM).FontWeight(w).TextColor(col).SingleLine().AccessHidden(about != "")
		if chevron > 0 {
			a.glyph(c, 12, drawChevron(col, chevron > 1))
		}
	})
	return b.Clicked()
}

// drawBackChevron is a small ‹: a way back.
func drawBackChevron(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx+1.5, cy-3.5)
		m.LineTo(cx-2, cy)
		m.LineTo(cx+1.5, cy+3.5)
		p.StrokePath(&m, 1.8, col)
	}
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
	// D329: replaced is the title of the earlier memory this one took the
	// place of ("" when none).
	replaced string
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
			n := noted{seq: x.FirstSeq, title: x.Noted.Title}
			if x.Noted.Replaced != nil {
				n.replaced = x.Noted.Replaced.Title
			}
			out = append(out, n)
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
	// D437: what another AI still found is never folded away: it is what to look at.
	for _, task := range tasks {
		if finished(task) {
			a.lookLine(c, "q:"+task.ID, reportLookLeft(task))
			a.docLine(c, "q:"+task.ID, reportDocLeft(task)) // D439
		}
	}
	// D444: what it just noted shows once, quietly, under the reply, until
	// the person says anything next; then it folds into Details.
	var folded []noted
	for _, n := range notes {
		if a.S.LastUserSeq < n.seq {
			a.notedLine(c, n)
		} else {
			folded = append(folded, n)
		}
	}
	if len(tasks) == 0 && len(folded) == 0 {
		return
	}
	notes = folded
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
			a.notedLine(c, n)
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
		uiText(c.Key("acting:"+task.ID), a.L.TFamily("result.acting."+task.Acting, base)).FontSize(t.SM).TextColor(t.InkMuted)
	case task.Unsure != "":
		if a.quietButton(c, "retry:"+task.ID, a.L.T("task.action.retry"), a.L.T("result.unsure"), true, 0) {
			a.RetryAction(task)
		}
	case task.Acted != nil && task.Acted.OK && task.Acted.Action == "merge":
		ui.Row(c.Key("merged:" + task.ID)).Gap(t.S1 + 2).AlignItems(ui.Center).Children(func() {
			a.glyph(c, 14, drawCheck(t.Done.Ink))
			uiText(c, a.L.T("result.merged", base)).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink)
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
	if task.CanIntegrate() && task.Acting == "" && !merged && !noRemote(task) && !hasPR(task) { // D508: a PR holds the branch
		if a.quietLink(c, "pr:"+task.ID, a.L.T("result.pr"), spoken(a.L, a.L.T("result.pr"), task.Title())) {
			task.Acting = "open_pr"
			a.TaskAction(task.ID, "open_pr")
		}
	}
	a.prFailureLine(c, task)
}

// notedLine is one 记下了 / Noted line (D329): taken back, only 不记了;
// otherwise what it noted, what it replaced and whether it still waits for
// Mem, each its own element (D291), then 撤销 while the person hasn't
// spoken since, Forget after.
func (a *App) notedLine(c *ui.Context, n noted) {
	t := a.T
	ui.Row(c.Key(n.seq)).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
		if a.notedUndone(n.seq) {
			uiText(c, a.L.T("memory.undone", n.title)).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
			return
		}
		uiText(c, a.L.T("memory.noted", n.title)).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
		if n.replaced != "" {
			uiText(c.Key("replaced"), a.L.T("memory.replaced", n.replaced)).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
		}
		if a.notedWaiting(n.seq) {
			uiText(c.Key("waiting"), a.L.T("memory.waiting")).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0)
		}
		if a.S.UndoFailed == n.seq {
			uiText(c.Key("undo-failed"), a.L.T("memory.undo.failed")).FontSize(t.SM).TextColor(t.Failed.Ink).MinWidth(0)
		}
		if a.S.LastUserSeq < n.seq {
			if a.quietButton(c, "undo", a.L.T("memory.undo"), n.title, false, 0) {
				a.undoNoted(n.seq)
			}
		} else if a.quietButton(c, "forget", a.L.T("partner.memory.forget"), n.title, false, 0) {
			a.forgetNoted(n.seq, n.title)
		}
	})
}

func (a *App) notedUndone(seq int64) bool {
	return a.S.Mem != nil && slices.Contains(a.S.Mem.Undone, seq)
}

func (a *App) notedWaiting(seq int64) bool {
	return a.S.Mem != nil && slices.Contains(a.S.Mem.Waiting, seq)
}

// undoNoted takes a fresh Noted line's save back (D329): no question asked.
func (a *App) undoNoted(seq int64) {
	if a.S.UndoFailed == seq {
		a.S.UndoFailed = 0
	}
	a.send(protocol.MemoryUndo{T: "memory_undo", Seq: seq})
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
	said := say.Sayable(it.Text, a.tongueOf(it.TaskID))
	// D549: a task that couldn't start says why without the card's own lead
	// (没能开始：), which "{title}没做成：" already says.
	if it.Kind == "failed" && a.S != nil {
		if task := a.S.Task(it.TaskID); task != nil && task.Attention() == protocol.Failed {
			if k := task.Cant(); k != nil {
				said = a.cantClause(k)
			}
		}
	}
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
			a.waitingRow(c, "words:"+key, a.L.T("activity.result"), "")
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
			a.waitingRow(c, "relay:"+d.DecisionID, a.L.T("activity.relay"), "")
			return
		}
	}
	// D385: plan first's card stands on its own (its question is its title).
	if d.Src != nil && d.Src.Kind == "plan" {
		a.handPlanCard(c, d, false)
		return
	}
	col := ui.Column(c.Key("ask:" + d.DecisionID)).Gap(t.S2)
	// D535: found by a needs-you count's door: a needs-you wash behind the
	// question and its buttons deepens once and settles (room for it kept
	// by a padding its margin gives back, so nothing moves).
	if !inTask {
		col.Padding(t.S2).Margin(-t.S2).Radius(t.RadiusLG)
		if k := a.foundAt(c, d.Seq, ""); k > 0 {
			col.Background(t.NeedsYou.Surface.Alpha(0.85 * k))
		}
	}
	col.Children(func() {
		if d.Asker != nil {
			a.peerAskerRow(c, d.Asker) // X1: who asks, before the question
		}
		a.partnerWords(c, words)
		// D437: what another AI still found in what this Go sends.
		if d.Look != nil && openAsk(d) {
			a.underBubble(c, func() { a.lookLine(c, "ask:"+d.DecisionID, d.Look.Left) })
		}
		// D341: a write-back's comment, whole as it goes out, or the to-do's chip.
		if (d.Src != nil || d.Board != nil) && openAsk(d) { // D407: the board offer's few words too
			ui.Column(c.Key("todo")).MaxWidth(t.BubbleMeasure).Padding(t.S4, t.S4).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
				a.todoAskBody(c, d)
			})
		}
		// A routine's proposal card (D29, D114): what it would do, before one Go.
		if d.RoutineID != "" && d.Resolved == nil {
			ui.Column(c.Key("facts")).MaxWidth(t.BubbleMeasure).Padding(t.S4, t.S4).Radius(t.RadiusLG).Background(t.NeedsYou.Surface).Shadow(0, t.Raised.Y, 0, 0, t.NeedsYou.Ledge).Children(func() {
				a.routineFacts(c, d.RoutineID, t.NeedsYou.Ink)
			})
		}
		if d.Call != nil && (d.Call.Kind == "go" || d.Call.Kind == "sheet") && d.Call.Plan != nil && openAsk(d) {
			a.callFactsCard(c, d) // D189 (4): who, what, the voice, the number, the cost, when
		}
		if d.Cal != nil {
			// D222: what changes, where, when and who hears; settled in place after Go.
			a.calChangeBlock(c, d)
			if !openAsk(d) {
				a.calSettled(c, d)
				return
			}
		}
		if d.Checkout != nil {
			// D436: the receipt, the page, Not now · Go to checkout; answered in place.
			a.underBubble(c, func() { a.checkoutButtons(c, d, decisionStyle{height: t.ControlSM, quietBg: t.Bg}) })
			return
		}
		if d.SignIn != nil && d.SignIn.Step != "" {
			a.underBubble(c, func() { a.stepButtons(c, d, decisionStyle{height: t.ControlSM, quietBg: t.Bg}) })
			return
		}
		if d.SignIn != nil {
			// D151: Sign in opens the live view; answered, it says signed in or not now.

			a.underBubble(c, func() { a.signInButtons(c, d, decisionStyle{height: t.ControlSM, quietBg: t.Bg}) })
			return
		}
		if d.CopyKey != nil {
			// D539: what goes from where to where, the note, 先不 · 复制; answered in place.
			a.underBubble(c, func() { a.copyKeyButtons(c, d, decisionStyle{height: t.ControlSM, quietBg: t.Bg}) })
			return
		}
		if d.Phone != nil {
			// D217: the phone's own card: what it will tap, or the way onto the phone.
			a.underBubble(c, func() { a.phoneButtons(c, d, decisionStyle{height: t.ControlSM, quietBg: t.Bg}) })
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
						uiText(c, a.L.T("decision.its_words", d.Question)).Selectable().FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
					}
				})
			})
		}
	})
}

// livingQuiet is the living message without its card: a small divider
// when the person was away, what didn't work or came back as sentences,
// then the asks: the one whose default comes soonest with its buttons; the
// others are behind D535's line over the composer (D586).
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
	// Nothing to show (only hidden progress or blocked lines, or lines already
	// said in a newer message): no message at all, never a bare "你不在的时候"
	// divider (seen twice in a row by the author). The web does the same.
	if len(answered)+len(waiting)+len(news)+len(lines) == 0 {
		return
	}
	sort.SliceStable(waiting, func(i, j int) bool { return dueAt(waiting[i].d).Before(dueAt(waiting[j].d)) })
	// D584: what is said comes first; the results still being put into words wait last, as one
	// presence where the partner's words will land.
	due := func(it protocol.LivingItem) bool {
		task := a.S.Task(it.TaskID)
		return task != nil && a.wordsDueIn(task) > 0
	}
	sort.SliceStable(news, func(i, j int) bool { return !due(news[i]) && due(news[j]) })
	// D586: the conversation asks one thing at a time; the others wait behind D535's one line
	// over the composer, never a second count here (the bar's, the line's and this one disagreed).
	head := waiting
	if !shown && len(waiting) > 1 {
		head = waiting[:1]
	}
	defaults := 0
	for _, w := range waiting {
		if w.d.Reversible {
			defaults++
		}
	}
	ui.Column(c.Key("living")).Gap(t.S4).Label(a.L.T("living.title")).Children(func() {
		if away {
			a.timeLine(c, a.L.T("living.away"), clockOf(e.Event.TS))
		}
		held := false // D584: several results at once share one waiting presence
		for i, it := range news {
			if task := a.S.Task(it.TaskID); task != nil {
				if wait := a.wordsDueIn(task); wait > 0 {
					if held {
						c.After(wait + 50*time.Millisecond)
						continue
					}
					held = true
				}
			}
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
		asked := false
		for _, x := range head {
			// D584: a task's question still being put into words waits behind the one presence
			// already there, never a second figure under the first.
			if held && openAsk(x.d) {
				if wait := a.relayDueIn(x.d); wait > 0 {
					c.After(wait + 50*time.Millisecond)
					continue
				}
			}
			a.ask(c, x.d, x.it.TaskID)
			asked = true
		}
		// D586: what stays is 「n 个都按默认」, one act on all of them, under an ask that is shown
		// (never alone under a presence still putting the ask into words).
		if defaults >= 2 && asked {
			ui.Row(c.Key("gather")).Gap(t.S4).Wrap().AlignItems(ui.Center).Children(func() {
				if a.quietButton(c, "goall", a.L.T("decision.goall", len(a.defaultable())), "", false, 0) {
					a.GoOnAllDefaults()
				}
			})
		}
	})
}

// timeLine is a messaging app's time line: small, centered, muted.
func (a *App) timeLine(c *ui.Context, parts ...string) {
	t := a.T
	ui.Row(c.Key("when:"+strings.Join(parts, "|"))).Justify(ui.Center).Gap(t.S2).Padding(t.S3, 0, t.S2, 0).Children(func() {
		// Each part its own element, a time in tabular figures (D291).
		for _, p := range parts {
			if p != "" {
				uiText(c, p).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
			}
		}
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
// where its words will appear, acting out the step it is on, and one
// plain line of what it is doing in the person's terms, updated in place,
// gone when the reply lands (D104, D425). A step past 15 s adds a
// reassuring line; past 45 s, that it will say when it's ready, and the
// figure only breathes.
func (a *App) presenceRow(c *ui.Context) {
	step, el, line, sub := a.presenceNow(c)
	a.waitingStep(c.Key("presence"), "presence", step, el, line, sub)
}

// presenceNow is the waiting line's step, how long it has been on it, and
// its words: the conversation's and the mini window's (D438).
func (a *App) presenceNow(c *ui.Context) (step string, el time.Duration, line, sub string) {
	step, since := "thinking", a.thinkingSince
	about, source := "", ""
	if act := a.S.Activity; act != nil {
		step, since, about, source = act.Step, a.S.ActivityAt, act.About, act.Source
	}
	if since.IsZero() {
		since = a.lastUserAt()
	}
	el = time.Since(since)
	sub = aliveSubFor(el)
	switch {
	case el < aliveSlow:
		c.After(aliveSlow - el) // the reassuring line comes on time
	case el < aliveLong:
		c.After(aliveLong - el)
	}
	key, arg := aliveWords(step, about, source)
	line = a.L.T(key)
	if arg != "" {
		line = a.L.T(key, arg)
	}
	if sub != "" {
		sub = a.L.T(sub)
	}
	return step, el, line, sub
}

// waitingRow is the clay partner at work and one plain line where its
// words will land, for a wait with its own words (a result or a question
// being put into the partner's words): the reading pose.
func (a *App) waitingRow(c *ui.Context, key, line, sub string) {
	a.waitingStep(c.Key(key), key, "result", 0, line, sub)
}

// waitingStep is the alive line for a step el into it (D425): the clay
// partner in the step's pose and loop, the words held for the dwell.
func (a *App) waitingStep(c *ui.Context, key, step string, el time.Duration, line, sub string) {
	m := aliveMotionFor(step, el, c.Preferences().ReduceMotion || a.aliveResting(c))
	if m != aliveStill && m != aliveSettle && el < aliveSettleAfter {
		c.After(aliveSettleAfter - el) // it calms on time
	}
	a.aliveLine(c, key, line, sub, func() {
		a.aliveFigure(c, key, aliveFaceFor(step), m, 32)
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
