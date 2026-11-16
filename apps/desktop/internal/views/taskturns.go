package views

// The opened task as a conversation with the agent, turn by turn (D210,
// D268): each turn opens with what someone said to the agent (the brief,
// your words, the partner's) and holds its answer in order, on one centered
// reading measure: its words at 14, and between them each run of steps as
// one summary line ("看了 9 个文件，跑了 2 条命令"), present tense while it
// runs; a failure, a subagent and a stretch of thinking each on their own
// line, a failure said in words. A finished turn folds its work under "做了
// 3 分 12 秒", keeping its last words; the live turn never folds. Where it
// is at now is one shimmering line at the transcript's end with its clock;
// a compaction or an interruption is a hairline with a small label. Esc
// twice pauses it, and a reader who scrolled up gets Jump to latest.

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	// turnBudget is how many lines of the latest turns are drawn before
	// older turns wait behind "Show n earlier steps" (the web's is the same).
	turnBudget = 240
	// outputLines of a step's output show before "n more lines".
	outputLines = 12
	// escWindow is how long a first Esc waits for the second (D210).
	escWindow = 3 * time.Second
	// groupMax is how tall an opened run of steps grows before it scrolls (D268).
	groupMax = 288
	// stepSize is a step line's words (D268): 13, secondary ink.
	stepSize = 13
)

// blocks is the opened task's transcript as blocks.
func (a *App) blocks(task *store.Task) []Block {
	return blocksOf(task.Harness(), task.Events, isWorking(task))
}

func isWorking(task *store.Task) bool {
	att := task.Attention()
	return att == protocol.Working || att == protocol.Queued
}

// turnLines is how many lines a turn draws: its prompt, each step line,
// each other block.
func turnLines(tu *Turn) int {
	n := 0
	if tu.Prompt != nil {
		n++
	}
	for i := range tu.Body {
		if tu.Body[i].K == "steps" {
			n += len(tu.Body[i].Lines)
		} else {
			n++
		}
	}
	return n
}

// turnSteps is how many steps a turn holds.
func turnSteps(tu *Turn) int {
	n := 0
	for i := range tu.Body {
		for _, l := range tu.Body[i].Lines {
			if l.K == "group" {
				n += l.N
			} else if l.Row != nil && l.Row.Step != nil {
				n += l.Row.N
			}
		}
	}
	return n
}

// turnWindow is the first turn drawn and how many steps the turns before
// it hold: the latest turns up to turnBudget lines (the last one whole).
func turnWindow(turns []Turn, all bool) (from, hidden int) {
	if all {
		return 0, 0
	}
	n := 0
	for i := len(turns) - 1; i >= 0; i-- {
		n += turnLines(&turns[i])
		if n > turnBudget && i < len(turns)-1 {
			from = i + 1
			break
		}
	}
	for i := 0; i < from; i++ {
		hidden += turnSteps(&turns[i])
	}
	if hidden == 0 {
		from = 0 // only words would wait: draw them
	}
	return from, hidden
}

// whatItDid is the transcript: its turns, what the user sent that the Log
// has yet to carry, then the working line while it works.
func (a *App) whatItDid(c *ui.Context, task *store.Task, blocks []Block) {
	t := a.T
	turns := turnsOf(blocks)
	from, hidden := turnWindow(turns, a.open["earlier:"+task.ID])
	working := isWorking(task)
	ui.Column(c.Key("did")).Gap(t.S5).AlignSelf(ui.Stretch).MinWidth(0).Children(func() {
		if len(blocks) == 0 && len(task.Sends) == 0 {
			ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		}
		if from > 0 {
			label := a.L.T("turn.earlier", hidden)
			if a.quietLink(c.Key("earlier"), "earlier:"+task.ID, label, label) {
				a.open["earlier:"+task.ID] = true
			}
		}
		for i := from; i < len(turns); i++ {
			tu := &turns[i]
			// Your words wait their turn while nothing came after them.
			queued := i == len(turns)-1 && len(tu.Body) == 0
			live := working && i == len(turns)-1
			ui.Column(c.Key(fmt.Sprintf("turn:%d", tu.Seq))).Gap(t.S3).MinWidth(0).Children(func() { a.turn(c, task, tu, queued, live) })
		}
		for _, sd := range task.Sends {
			if sd.Seq == 0 {
				a.sentBubble(c, sd.Text, sd, true)
			}
		}
		// D206: words with pictures still going up: shown, sent when they land.
		for _, w := range a.waitingTaskSends(task.ID) {
			ui.Column(c.Key("tw:" + w.clientID)).Gap(t.S1).AlignItems(ui.End).Children(func() {
				a.messageMedia(c, "tw"+w.clientID, nil, w.atts, true, "task:"+task.ID)
				if w.text != "" {
					a.sentBubble(c, w.text, nil, false)
				}
				if anyFailed(w.atts) {
					ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
						ui.Text(c, a.L.T("media.failed")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink)
						if a.button(c, a.L.T("media.retry"), btnText, t.ControlSM, t.Bg) {
							a.retryPictures(w.atts)
						}
					})
				}
			})
		}
		if working {
			a.workingLine(c, task, turns, blocks)
		}
	})
}

// turnFold is where a finished turn's work ends: the blocks before its
// last words fold away (D268), when there is work among them; -1 for none.
func turnFold(tu *Turn, live bool) int {
	if live {
		return -1
	}
	end := len(tu.Body)
	for i := len(tu.Body) - 1; i >= 0; i-- {
		if tu.Body[i].K == "voice" {
			end = i
			break
		}
	}
	for i := 0; i < end; i++ {
		if tu.Body[i].K == "steps" {
			return end
		}
	}
	return -1
}

// turnTook is how long a turn worked: from what opened it to its last event.
func (a *App) turnTook(task *store.Task, tu *Turn) time.Duration {
	if len(tu.Body) == 0 {
		return 0
	}
	start := tu.Seq
	end := lastSeq(&tu.Body[len(tu.Body)-1])
	s, e := store.ParseTime(a.tsOf(task, start)), store.ParseTime(a.tsOf(task, end))
	if s.IsZero() || e.Before(s) {
		return 0
	}
	return e.Sub(s)
}

// turn is what someone said to the agent, then its answer in order.
func (a *App) turn(c *ui.Context, task *store.Task, tu *Turn, queued, live bool) {
	t := a.T
	if p := tu.Prompt; p != nil {
		switch p.K {
		case "brief":
			label := a.L.T("task.asked", a.S.PersonaName)
			if p.By == "you" {
				label = a.L.T("task.asked.you")
			}
			a.promptCard(c, task, p, label)
		case "partner":
			a.promptCard(c, task, p, a.L.T("task.from.partner", a.S.PersonaName))
		case "you":
			text := p.Text
			if p.Go != nil {
				text = a.shortGo(*p.Go) // the user's Go, said as they said it
			}
			a.sentBubble(c, text, task.SendFor(p.Seq), queued, p.Media...)
		}
	}
	from := 0
	if fold := turnFold(tu, live); fold > 0 {
		key := fmt.Sprintf("turn:%s:%d", task.ID, tu.Seq)
		open := a.open[key]
		if a.workedFold(c, key, a.L.T("turn.worked", a.shortDur(a.turnTook(task, tu))), open) {
			a.open[key] = !open
		}
		if !open {
			from = fold
		}
	}
	for i := from; i < len(tu.Body); i++ {
		b := &tu.Body[i]
		if b.K == "note" && b.Say == "retry" {
			continue // the working line says it while it is the latest
		}
		ui.Column(c.Key(fmt.Sprintf("b:%s:%d", b.K, b.Seq))).Gap(t.S1).MinWidth(0).Children(func() { a.block(c, task, b) })
	}
}

// workedFold is a finished turn's fold: "做了 3 分 12 秒 ›" in 13 muted over a
// hairline, opening its work in place.
func (a *App) workedFold(c *ui.Context, key, label string, open bool) bool {
	t := a.T
	row := ui.Row(c.Key("fold:" + key)).Gap(t.S2).MinHeight(24).AlignItems(ui.Center).MinWidth(0).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label)
	hover := row.Hovered()
	row.Children(func() {
		ink := t.InkMuted
		if hover {
			ink = t.InkSoft
		}
		ui.Text(c, label).FontSize(stepSize).TextColor(ink).SingleLine().Shrink(0).AccessHidden(true)
		ui.Box(c).Size(12, 12).Shrink(0).Draw(drawChevron(t.Faint, open))
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
	})
	return row.Clicked()
}

// promptCard is the brief, or what the partner passed on: a quiet sunken
// card under who said it, three lines until opened; a key in it is hidden
// and said so; its pictures small under the words.
func (a *App) promptCard(c *ui.Context, task *store.Task, b *Block, label string) {
	t := a.T
	key := fmt.Sprintf("prompt:%s:%d", task.ID, b.Seq)
	open := a.open[key]
	long := strings.Count(b.Text, "\n") > 2 || len([]rune(b.Text)) > 180
	ui.Column(c.Key("prompt")).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
		ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		tx := ui.Text(c, b.Text).FontSize(t.SM).LineHeight(leadingFor(b.Text, 1.55)).TextColor(t.InkSoft).Selectable()
		if !open && long {
			tx.MaxLines(3)
		}
		a.messageMedia(c, fmt.Sprint("p", b.Seq), b.Media, nil, false, "task:"+task.ID)
		if redact.Has(b.Text) || long {
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				if redact.Has(b.Text) {
					ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
						a.glyph(c, 14, drawKey(t.InkMuted))
						ui.Text(c, a.L.T("secret.hidden")).FontSize(t.XS).TextColor(t.InkMuted)
					})
				}
				ui.Spacer(c)
				if long {
					more := a.L.T("task.asked.more")
					if open {
						more = a.L.T("task.asked.less")
					}
					l := ui.Text(c.Key("more"), more).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(more)
					if l.Hovered() {
						l.TextColor(t.Ink)
					}
					if l.Clicked() {
						a.open[key] = !open
					}
				}
			})
		}
	})
}

// block is one thing in the agent's answer.
func (a *App) block(c *ui.Context, task *store.Task, b *Block) {
	t := a.T
	switch b.K {
	case "voice":
		markdown.View(c, autospace(b.Text), a.mdFor(b.Text))
		if b.Saved {
			// Saved progress: its words were said once, above; a small mark under them.
			ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 14, drawFlag(t.Faint))
				ui.Text(c, a.L.T("task.saved")).FontSize(t.XS).TextColor(t.InkMuted).Tooltip(clock(a.tsOf(task, b.Seq)))
			})
		}
	case "steps":
		ui.Column(c.Key("lines")).Gap(2).MinWidth(0).Children(func() {
			for i := range b.Lines {
				l := &b.Lines[i]
				live := b.Live && i == len(b.Lines)-1
				if l.K == "group" {
					a.groupLine(c.Key(fmt.Sprintf("g%d", l.Seq)), task, l, live)
				} else if l.Row != nil {
					a.stepRow(c.Key(fmt.Sprintf("r%d", l.Row.Seq)), task, l.Row, live)
				}
			}
		})
	case "plan":
		a.planCard(c, b)
	case "report":
		ui.Text(c, a.reportLabel(&protocol.Report{State: b.State})).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		ui.Text(c, autospace(b.Text)).FontSize(taskProse).LineHeight(leadingFor(b.Text, 1.6)).TextColor(t.InkSoft).Selectable()
		a.messageMedia(c, fmt.Sprint("r", b.Seq), b.Media, nil, false, "task:"+task.ID)
	case "note":
		switch b.Say {
		case "compacted", "interrupted":
			a.divider(c, a.noteLine(b))
			return
		}
		ui.Row(c).Gap(6).MinHeight(24).AlignItems(ui.Center).MinWidth(0).Children(func() {
			if b.Bad {
				a.glyph(c, 16, drawCrossSmall(t.Failed.Ink))
			} else {
				a.glyph(c, 16, drawDot(t.Faint))
			}
			// D207: the runner's lines in the user's words; the line as
			// logged only on hover, for an error.
			line, tip := a.noteLine(b), ""
			if b.Bad {
				tip = b.Text
			}
			tx := ui.Text(c, line).FontSize(stepSize).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1)
			if tip != "" {
				tx.Tooltip(tip)
			}
		})
	}
}

// divider is a hairline with a small label in its middle: a compaction, an
// interruption (D268).
func (a *App) divider(c *ui.Context, label string) {
	t := a.T
	ui.Row(c).Gap(t.S2).MinHeight(24).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
		ui.Text(c, label).FontSize(t.XXS).TextColor(t.InkMuted).SingleLine().Shrink(0)
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
	})
}

// planCard is the agent's plan (D268): each item with its mark, an empty
// ring to do, a dashed ring in the accent while doing, a check once done
// (and faded).
func (a *App) planCard(c *ui.Context, b *Block) {
	t := a.T
	done := 0
	for _, it := range b.Items {
		if it.State == "done" {
			done++
		}
	}
	ui.Column(c.Key("plan")).Gap(t.S1).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).Border(1, t.LineSoft).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("plan.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			ui.Spacer(c)
			ui.Text(c, a.L.T("plan.progress", done, len(b.Items))).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum")
		})
		for i, it := range b.Items {
			ui.Row(c.Key(i)).Gap(t.S2).MinHeight(24).AlignItems(ui.Center).MinWidth(0).Children(func() {
				ink := t.InkSoft
				switch it.State {
				case "done":
					a.glyph(c, 16, drawPlanDone(t.InkMuted))
					ink = t.InkMuted.Alpha(0.75)
				case "doing":
					a.glyph(c, 16, drawPlanDoing(t.Accent))
					ink = t.Ink
				default:
					a.glyph(c, 16, drawPlanTodo(t.Faint))
				}
				ui.Text(c, autospace(it.Text)).FontSize(stepSize).LineHeight(leadingFor(it.Text, 1.45)).TextColor(ink).MinWidth(0).Shrink(1)
			})
		}
	})
}

// stepLine is a step's one line (D268): its mark at 16, its words at 13 in
// secondary ink, what trails it, and a 12 chevron in faint ink when it
// opens. It answers a click.
func (a *App) stepLine(c *ui.Context, label string, expandable, open bool, children func(row ui.Element)) bool {
	t := a.T
	row := ui.Row(c.Key("line")).Gap(6).MinHeight(24).Padding(1, 6).Margin(0, -6).Radius(t.RadiusXS).AlignItems(ui.Center).MinWidth(0).Label(label)
	if expandable {
		row.Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
		if row.Hovered() {
			row.Background(t.SurfaceSunken.Mix(t.Bg, 0.4))
		}
	}
	row.Children(func() {
		children(row)
		if expandable {
			ui.Box(c).Size(12, 12).Shrink(0).Draw(drawChevron(t.Faint, open))
		}
	})
	return expandable && row.Clicked()
}

// stepIcon is a step line's 16 mark: a small spinner while it is the live
// one, else its kind's glyph in muted ink.
func (a *App) stepIcon(c *ui.Context, kind string, live bool) {
	t := a.T
	if live {
		ui.Box(c).Size(16, 16).Shrink(0).Center().Children(func() { ui.Spinner(c).Size(11, 11) })
		return
	}
	a.glyph(c, 16, stepGlyph(kind)(t.InkMuted))
}

// tallyKindGlyph is a group's mark: the glyph of what it did most.
func tallyKindGlyph(k string) string {
	switch k {
	case "web":
		return "searched"
	case "used":
		return "other"
	}
	return k
}

// groupLine is a run of steps as one line (D268): what it did in at most
// two phrases, or, while it runs, its latest step in the present tense with
// a spinner; opened, each step, indented, scrolling past groupMax.
func (a *App) groupLine(c *ui.Context, task *store.Task, l *Line, live bool) {
	t := a.T
	key := fmt.Sprintf("group:%s:%d", task.ID, l.Seq)
	open := a.open[key]
	words := a.tallyWords(l.Tally)
	if live && len(l.Rows) > 0 {
		words = a.liveRowWords(&l.Rows[len(l.Rows)-1])
	}
	words = autospace(words)
	ui.Column(c).MinWidth(0).Children(func() {
		if a.stepLine(c, words, true, open, func(ui.Element) {
			kind := "other"
			if len(l.Tally) > 0 {
				kind = tallyKindGlyph(l.Tally[0].Kind)
			}
			a.stepIcon(c, kind, live)
			ui.Text(c, words).FontSize(stepSize).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1).AccessHidden(true)
		}) {
			a.open[key] = !open
		}
		if open {
			ui.Scroll(c.Key("steps")).MaxHeight(groupMax).Children(func() {
				ui.Column(c).Gap(2).Padding(2, 0, t.S1, 22).MinWidth(0).Children(func() {
					for i := range l.Rows {
						a.stepRow(c.Key(fmt.Sprintf("r%d", l.Rows[i].Seq)), task, &l.Rows[i], false)
					}
				})
			})
		}
	})
}

// stepRow is one step: its line, a failure's words under it, and what it
// ran and printed, the edit's diff or its thinking, once opened.
func (a *App) stepRow(c *ui.Context, task *store.Task, r *StepRow, live bool) {
	t := a.T
	words, code := a.rowWords(r)
	if live {
		words, code = a.liveRowWords(r), ""
	}
	words = autospace(words)
	key := fmt.Sprintf("step:%s:%d", task.ID, r.Seq)
	open := a.open[key]
	detail := ""
	switch {
	case r.Step == nil:
		detail = r.Thought
	case len(r.Diff) == 0:
		var parts []string
		if r.Command != "" {
			parts = append(parts, "$ "+unwrapShell(r.Command))
		}
		if r.Output != "" {
			parts = append(parts, r.Output)
		}
		detail = strings.Join(parts, "\n")
	}
	expandable := detail != "" || len(r.Diff) > 0
	bad, quiet := r.Outcome == "error", r.Outcome == "missing"
	ui.Column(c).MinWidth(0).Children(func() {
		clicked := a.stepLine(c, strings.TrimSpace(words+" "+code), expandable, open, func(row ui.Element) {
			ink := t.InkSoft
			switch {
			case bad:
				a.glyph(c, 16, drawCrossSmall(t.Failed.Ink))
			case r.Step == nil:
				if live {
					a.stepIcon(c, "", true)
				} else {
					a.glyph(c, 16, drawThought(t.InkMuted))
				}
			default:
				a.stepIcon(c, r.Step.Kind, live)
			}
			if quiet {
				ink = t.InkMuted
			}
			ui.Text(c, words).FontSize(stepSize).TextColor(ink).SingleLine().MinWidth(0).Shrink(0.35).Tooltip(words).AccessHidden(true)
			if code != "" {
				// The subject: a command or a path, in mono, in ink.
				ui.Text(c, code).Font(t.Mono).FontSize(12).TextColor(t.Ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(code).AccessHidden(true)
			}
			if r.N > 1 {
				ui.Text(c, fmt.Sprintf("×%d", r.N)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
			if r.Added > 0 {
				ui.Text(c, fmt.Sprintf("+%d", r.Added)).Font(t.Mono).FontSize(12).TextColor(t.Done.Ink).Shrink(0)
			}
			if r.Removed > 0 {
				ui.Text(c, fmt.Sprintf("−%d", r.Removed)).Font(t.Mono).FontSize(12).TextColor(t.Failed.Ink).Shrink(0)
			}
			if r.Step != nil && r.Step.Kind == "delegated" && r.Ms != nil && !live {
				// A subagent's row: done, and how long it took.
				a.glyph(c, 14, drawCheck(t.InkMuted))
				ui.Text(c, a.shortDur(time.Duration(*r.Ms)*time.Millisecond)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
			if bad {
				ui.Text(c, a.L.T("step.label.error")).FontSize(t.XS).FontWeight(600).TextColor(t.Failed.Ink.Alpha(0.85)).Shrink(0)
			}
		})
		if clicked {
			a.open[key] = !open
		}
		if bad && !open {
			// The failure in words, one quiet line; the raw text when opened.
			if w := a.failWords(r); w != "" {
				ui.Text(c, autospace(w)).FontSize(stepSize).LineHeight(leadingFor(w, 1.5)).TextColor(t.InkSoft).MaxLines(2).MinWidth(0).
					Padding(0, 0, 2, 22).Tooltip(r.Hint).Selectable()
			}
		}
		switch {
		case open && r.Step == nil:
			// Its thinking, indented, quiet.
			ui.Text(c, autospace(strings.ReplaceAll(r.Thought, " · ", "\n"))).FontSize(stepSize).LineHeight(1.5).TextColor(t.InkMuted).
				Padding(2, 0, t.S1, 22).MinWidth(0).Selectable()
		case open && len(r.Diff) > 0:
			a.diffPanel(c, r)
		case open && detail != "":
			a.outputPanel(c, key, detail)
		}
	})
}

// diffPanel is an edit's lines: what it put in on the done tint, what it
// took out on the failed tint, context plain; a file's name heads its
// lines when the edit touched several.
func (a *App) diffPanel(c *ui.Context, r *StepRow) {
	t := a.T
	ui.Column(c.Key("diff")).Margin(t.S1, 0, t.S2, 22).Padding(t.S1, 0).Radius(8).Background(t.Sunken).Clip().MinWidth(0).Selectable().Children(func() {
		for i, l := range r.Diff {
			text, ink := l, t.InkSoft
			var bg *ui.Color
			switch {
			case strings.HasPrefix(l, "@@ "):
				text, ink = strings.TrimPrefix(l, "@@ "), t.InkMuted
			case l == "@@":
				text, ink = "⋯", t.Faint
			case strings.HasPrefix(l, "+"):
				ink, bg = t.Done.Ink, &t.Done.Surface
			case strings.HasPrefix(l, "-"):
				text, ink, bg = "−"+l[1:], t.Failed.Ink, &t.Failed.Surface
			}
			line := ui.Text(c.Key(i), text).Font(t.Mono).FontSize(12).LineHeight(1.5).Padding(0, t.S3).MinWidth(0).TextColor(ink)
			if bg != nil {
				line.Background(bg.Alpha(0.55))
			}
			if strings.HasPrefix(l, "@@ ") {
				line.FontWeight(700).Padding(t.S1, t.S3, 0, t.S3)
			}
		}
		if r.DiffMore > 0 {
			ui.Text(c.Key("more"), a.L.T("step.lines.more", r.DiffMore)).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3, 0, t.S3)
		}
	})
}

// outputPanel is what a step ran and printed: its first lines, the rest
// behind "n more lines".
func (a *App) outputPanel(c *ui.Context, key, detail string) {
	t := a.T
	all := a.open[key+":all"]
	lines := strings.Split(detail, "\n")
	shown := detail
	if !all && len(lines) > outputLines {
		shown = strings.Join(lines[:outputLines], "\n")
	}
	ui.Column(c.Key("out")).Gap(t.S1).Margin(t.S1, 0, t.S2, 22).Padding(t.S2, t.S3).Radius(8).Background(t.Sunken).MinWidth(0).Children(func() {
		ui.Text(c, shown).Font(t.Mono).FontSize(12).LineHeight(1.5).TextColor(t.InkSoft).Selectable()
		if !all && len(lines) > outputLines {
			more := a.L.T("step.lines.more", len(lines)-outputLines)
			l := ui.Text(c.Key("more"), more).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(more)
			if l.Hovered() {
				l.TextColor(t.Ink)
			}
			if l.Clicked() {
				a.open[key+":all"] = true
			}
		}
	})
}

// ---------- words (D268) ----------

// shortDur is a span as a person says it: 4 秒 / 4s, 3 分 12 秒 / 3m 12s.
func (a *App) shortDur(d time.Duration) string {
	s := int(math.Round(d.Seconds()))
	switch {
	case s < 60:
		return a.L.T("dur.s", max(s, 1))
	case s < 3600 && s%60 == 0:
		return a.L.T("dur.m", s/60)
	case s < 3600:
		return a.L.T("dur.ms", s/60, s%60)
	}
	return a.L.T("dur.hm", s/3600, s/60%60)
}

// tallyWords is a run in words (D268): at most two phrases, in the order
// the model gave them, then how many other things it did.
func (a *App) tallyWords(ts []Tally) string {
	phrase := func(x Tally) string {
		if x.Kind == "used" {
			if x.N == 1 {
				return a.L.T("tally.used.one", x.Name)
			}
			return a.L.T("tally.used", x.Name, x.N)
		}
		if x.N == 1 {
			return a.L.T("tally." + x.Kind + ".one")
		}
		return a.L.T("tally."+x.Kind, x.N)
	}
	var parts []string
	rest := 0
	for i, x := range ts {
		if i < 2 {
			parts = append(parts, phrase(x))
		} else {
			rest += x.N
		}
	}
	s := strings.Join(parts, a.L.T("tally.and"))
	switch {
	case rest == 1:
		s += a.L.T("tally.rest.one")
	case rest > 1:
		s += a.L.T("tally.rest", rest)
	}
	return a.capFirst(s)
}

// liveRowWords is a step in the present tense, while it runs (D268).
func (a *App) liveRowWords(r *StepRow) string {
	if r.Step == nil {
		if h := strings.Split(r.Thought, " · ")[0]; h != "" {
			return h
		}
		return a.L.T("live.thinking")
	}
	st := r.Step
	subject := st.Target
	if st.Kind == "ran" && r.Command != "" {
		subject = firstLine(unwrapShell(r.Command))
	}
	switch {
	case st.Kind == "other" && st.Via != "":
		return a.L.T("live.used", serviceName(st.Via))
	case (st.Kind == "ran" || st.Kind == "read" || st.Kind == "edited" || st.Kind == "searched") && subject != "" && st.Act == "":
		return a.L.T("live."+st.Kind, subject)
	}
	w, code := a.rowWords(r)
	return strings.TrimSpace(w + " " + code)
}

var fileish = regexp.MustCompile(`(?i)file|content|blob`)

// failWords is a failure in words (D268): what the service said, by its
// HTTP status when it named one, never the raw text in the flow.
func (a *App) failWords(r *StepRow) string {
	if r.Code == 0 {
		return r.Hint
	}
	via := ""
	if r.Step != nil && r.Step.Kind == "other" && r.Step.Via != "" {
		via = serviceName(r.Step.Via)
	}
	key := ""
	switch {
	case r.Code == 404:
		key = "fail.404"
		if r.Step != nil && fileish.MatchString(r.Step.Target) {
			key += ".file"
		}
	case r.Code == 401 || r.Code == 403:
		key = "fail.403"
	case r.Code == 429:
		key = "fail.429"
	case r.Code >= 500:
		key = "fail.5xx"
	default:
		return a.L.T("fail.code", r.Hint, r.Code)
	}
	if via != "" {
		return a.L.T(key+".via", via, r.Code)
	}
	return a.L.T(key, r.Code)
}

// liveWords is what the agent is on now, for a row elsewhere (On hand): its
// latest step in the present tense, or "" when its latest is something it said.
func (a *App) liveWords(blocks []Block) string {
	if len(blocks) == 0 {
		return ""
	}
	b := &blocks[len(blocks)-1]
	if b.K != "steps" || len(b.Lines) == 0 {
		return ""
	}
	l := &b.Lines[len(b.Lines)-1]
	if l.K == "group" {
		if len(l.Rows) == 0 {
			return a.tallyWords(l.Tally)
		}
		return a.liveRowWords(&l.Rows[len(l.Rows)-1])
	}
	return a.liveRowWords(l.Row)
}

// ---------- the working line (D268) ----------

// workingLine is where it is at now, at the transcript's end: what it is
// doing in 13 with a light sweeping across it, the turn's clock at the
// right in tabular figures. A retry says itself here; the live run's own
// line above already says its step, so then this says only that it works.
func (a *App) workingLine(c *ui.Context, task *store.Task, turns []Turn, blocks []Block) {
	t := a.T
	words := a.stateLabel(task.Attention())
	if n := len(blocks); n > 0 {
		switch last := &blocks[n-1]; {
		case last.K == "note" && last.Say == "retry":
			words = a.noteLine(last)
		case last.K == "voice" || last.K == "plan":
			words = a.L.T("live.thinking")
		}
	}
	since := ""
	if len(turns) > 0 {
		since = a.tsOf(task, turns[len(turns)-1].Seq)
	}
	ui.Row(c.Key("working")).Gap(t.S2).MinHeight(24).AlignItems(ui.Center).MinWidth(0).Role(ui.RoleStatus).Label(words).Children(func() {
		a.shimmerText(c, words, stepSize, t.State(string(protocol.Working)).Ink)
		ui.Spacer(c)
		if at := store.ParseTime(since); !at.IsZero() {
			c.After(time.Second)
			ui.Text(c, a.shortDur(a.Now().Sub(at))).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
		}
	})
}

// shimmerText is words at 45% with a brighter band sweeping across them,
// once every 1.8 s; still under reduced motion.
func (a *App) shimmerText(c *ui.Context, text string, size float32, col ui.Color) ui.Element {
	t := a.T
	tx := ui.Text(c, text).FontSize(size).FixedLineHeight(18).TextColor(col.Alpha(0.55)).SingleLine().Shrink(1).MinWidth(0)
	if c.Preferences().ReduceMotion {
		return tx.TextColor(col)
	}
	font := t.Body
	tx.DrawOver(func(p *ui.Painter, r ui.Rect) {
		p.AnimationFrame()
		const period = 1800 * time.Millisecond
		at := float32(p.Now().UnixNano()%int64(period)) / float32(period)
		sweep := min(at/0.85, 1)
		w, _ := p.MeasureText(0, ui.Span{Text: text, Font: font, Size: size})
		band := max(w*0.3, 40)
		center := r.X - band + (w+2*band)*sweep
		const strips = 10
		for i := range strips {
			edge := float32(i) / strips
			alpha := 1 - float32(math.Abs(float64(edge*2-1+1.0/strips)))
			x := center - band/2 + band*edge
			p.Clip(ui.Rect{X: x, Y: r.Y, W: band / strips, H: r.H}, 0, func() {
				p.RichText(r.X, r.Y+(r.H-18)/2, 0, ui.Span{Text: text, Font: font, Size: size, Color: col.Alpha(0.55 + 0.45*alpha)})
			})
		}
	})
	return tx
}

// ---------- Esc, the foot ----------

// escArmed reports whether a first Esc is waiting for the second on this task.
func (a *App) escArmed(c *ui.Context, id string) bool {
	if a.escTask != id || a.escAt.IsZero() {
		return false
	}
	left := escWindow - a.Now().Sub(a.escAt)
	if left <= 0 {
		a.escAt, a.escTask = time.Time{}, ""
		return false
	}
	c.After(left)
	return true
}

// taskEsc is Esc on an opened task: while it works, the first asks and the
// second pauses it (D210); otherwise false, and Esc goes up a level.
func (a *App) taskEsc(c *ui.Context) bool {
	if a.Route != RouteTask {
		return false
	}
	task := a.S.Task(a.TaskID)
	if task == nil || task.Attention() != protocol.Working {
		return false
	}
	if a.escArmed(c, task.ID) {
		a.escAt, a.escTask = time.Time{}, ""
		a.TaskAction(task.ID, "interrupt")
		return true
	}
	a.escAt, a.escTask = a.Now(), task.ID
	return true
}

// taskFoot is what only the moment over the composer says (D268): a first
// Esc waiting for the second, or that it is over to the user. Where it is at
// is the working line at the transcript's end; Stop sits by Send; Cancel
// task is in the header's ⋯.
func (a *App) taskFoot(c *ui.Context, task *store.Task, blocks []Block) {
	t := a.T
	_ = blocks
	if a.yourTurn(task) {
		a.aboveComposer(c, func() {
			ui.Row(c.Key("foot")).Gap(t.S2).MinHeight(t.ControlSM).Padding(0, t.S3).AlignItems(ui.Center).MinWidth(0).Role(ui.RoleStatus).Children(func() {
				ui.Text(c, a.L.T("task.your.turn")).FontSize(t.SM).FontWeight(800).TextColor(t.State(string(protocol.NeedsYou)).Ink).Shrink(0)
				ui.Text(c, a.L.T("task.your.turn.hint")).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
			})
		})
		return
	}
	if task.Attention() == protocol.Working && a.escArmed(c, task.ID) {
		a.aboveComposer(c, func() {
			ui.Row(c.Key("foot")).Gap(t.S2).MinHeight(t.ControlSM).Padding(0, t.S3).AlignItems(ui.Center).MinWidth(0).Role(ui.RoleStatus).Children(func() {
				ui.Text(c, a.L.T("foot.esc")).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
				ui.Spacer(c)
				if a.button(c, a.L.T("foot.keep"), btnText, t.ControlSM, t.Bg) {
					a.escAt, a.escTask = time.Time{}, ""
				}
				if a.button(c, a.L.T("task.action.pause"), btnSecondary, t.ControlSM, t.Bg) {
					a.escAt, a.escTask = time.Time{}, ""
					a.TaskAction(task.ID, "interrupt")
				}
			})
		})
	}
}

// jumpToLatest is the round button over the transcript's foot when the
// reader scrolled up from the end: back to the newest.
func (a *App) jumpToLatest(c *ui.Context, sc *ui.ScrollState) {
	t := a.T
	if sc.MaxY <= 0 || sc.Y >= sc.MaxY-160 {
		return
	}
	ui.Row(c.Key("jump")).Absolute().Left(0).Right(0).Bottom(t.S3).Justify(ui.Center).Children(func() {
		label := a.L.T("jump.latest")
		b := ui.Box(c.Key("jumpbtn")).Size(t.ControlMD, t.ControlMD).Radius(t.ControlMD/2).Background(t.Surface).
			Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label).Tooltip(label)
		b.Draw(drawDown(t.InkSoft))
		if b.Clicked() {
			sc.Y = 1 << 30
		}
	})
}

// drawDown is an arrow pointing down: to the newest.
func drawDown(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx, cy-6)
		m.LineTo(cx, cy+6)
		m.MoveTo(cx-5, cy+1)
		m.LineTo(cx, cy+6)
		m.LineTo(cx+5, cy+1)
		p.StrokePath(&m, 2.2, col)
	}
}

// drawCrossSmall is a small ×: a step that failed, quieter than a notice's.
func drawCrossSmall(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-3, cy-3)
		m.LineTo(cx+3, cy+3)
		m.MoveTo(cx+3, cy-3)
		m.LineTo(cx-3, cy+3)
		p.StrokePath(&m, 1.8, col)
	}
}

// drawPlanTodo is an empty ring: a plan item to do.
func drawPlanTodo(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		var m ui.Path
		m.Circle(r.X+r.W/2, r.Y+r.H/2, 6)
		p.StrokePath(&m, 1.6, col)
	}
}

// drawPlanDoing is a dashed ring in the accent: the item under way.
func drawPlanDoing(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		var m ui.Path
		m.Circle(r.X+r.W/2, r.Y+r.H/2, 6)
		m.Dash(0, 3, 2.4)
		p.StrokePath(&m, 1.8, col)
	}
}

// drawPlanDone is a ring with a check: a done item.
func drawPlanDone(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var ring ui.Path
		ring.Circle(cx, cy, 6)
		p.FillPath(&ring, col.Alpha(0.16))
		var m ui.Path
		m.MoveTo(cx-3, cy+0.2)
		m.LineTo(cx-0.8, cy+2.4)
		m.LineTo(cx+3.2, cy-2)
		p.StrokePath(&m, 1.6, col)
	}
}

// drawStop is a rounded square: stop it.
func drawStop(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		p.Fill(ui.Rect{X: cx - 5.5, Y: cy - 5.5, W: 11, H: 11}, col, 2.5)
	}
}

// drawMore is three dots: more.
func drawMore(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		for _, dx := range []float32{-5.5, 0, 5.5} {
			var m ui.Path
			m.Circle(cx+dx, cy, 1.6)
			p.FillPath(&m, col)
		}
	}
}
