package views

// The opened task as a conversation with the agent, turn by turn (D210,
// after D152; handling after egoist/lorca's agent page, research/58):
// each turn opens with what someone said to the agent (the brief, your
// words, the partner's) and holds its answer in order, its words at the
// reading measure and its steps between them as compact lines: one line
// per step (its words, the command in mono, an edit's +n −n), a run of
// reads and searches folded into one, a failure with its error line in
// place; a step opens to its output or its diff. The foot over the
// composer says where it stands (working with its latest step and the
// clock, or over to you), Esc twice pauses it, and a reader who scrolled
// up gets Jump to latest. Older turns past a budget wait behind one link.

import (
	"fmt"
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
)

// blocks is the opened task's transcript as blocks.
func (a *App) blocks(task *store.Task) []Block {
	att := task.Attention()
	return blocksOf(task.Harness(), task.Events, att == protocol.Working || att == protocol.Queued)
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
			if l.K == "looks" {
				for _, r := range l.Rows {
					n += r.N
				}
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

// whatItDid is the transcript: its turns, then what the user sent that
// the Log has yet to carry.
func (a *App) whatItDid(c *ui.Context, task *store.Task, blocks []Block) {
	t := a.T
	turns := turnsOf(blocks)
	from, hidden := turnWindow(turns, a.open["earlier:"+task.ID])
	ui.Column(c.Key("did")).Gap(t.S5).MaxWidth(readMeasure).Children(func() {
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
			ui.Column(c.Key(fmt.Sprintf("turn:%d", tu.Seq))).Gap(t.S3).MinWidth(0).Children(func() { a.turn(c, task, tu, queued) })
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
	})
}

// turn is what someone said to the agent, then its answer in order.
func (a *App) turn(c *ui.Context, task *store.Task, tu *Turn, queued bool) {
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
	for i := range tu.Body {
		b := &tu.Body[i]
		ui.Column(c.Key(fmt.Sprintf("b:%s:%d", b.K, b.Seq))).Gap(t.S1).MinWidth(0).Children(func() { a.block(c, task, b) })
	}
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
		markdown.View(c, b.Text, &a.mdTask)
		if b.Saved {
			// Saved progress: its words were said once, above; a small mark under them.
			ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 14, drawFlag(t.Faint))
				ui.Text(c, a.L.T("task.saved")).FontSize(t.XS).TextColor(t.InkMuted).Tooltip(clock(a.tsOf(task, b.Seq)))
			})
		}
	case "steps":
		ui.Column(c.Key("lines")).MinWidth(0).Children(func() {
			for i := range b.Lines {
				l := &b.Lines[i]
				if l.K == "looks" {
					a.looksLine(c.Key(fmt.Sprintf("l%d", l.Seq)), task, l)
				} else if l.Row != nil {
					a.stepRow(c.Key(fmt.Sprintf("r%d", l.Row.Seq)), task, l.Row)
				}
			}
		})
	case "report":
		ui.Text(c, a.reportLabel(&protocol.Report{State: b.State})).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		ui.Text(c, b.Text).FontSize(t.MD).LineHeight(leadingFor(b.Text, 1.55)).TextColor(t.InkSoft).Selectable()
		a.messageMedia(c, fmt.Sprint("r", b.Seq), b.Media, nil, false, "task:"+task.ID)
	case "note":
		ui.Row(c).Gap(t.S2).Height(26).AlignItems(ui.Center).MinWidth(0).Children(func() {
			if b.Bad {
				a.glyph(c, 16, drawCross(t.Failed.Ink))
				ui.Text(c, a.L.T("step.label.error")).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink).Shrink(0)
			} else {
				a.glyph(c, 16, drawDot(t.Faint))
			}
			// D207: the runner's lines in the user's words; the line as
			// logged only on hover, for an error.
			line, tip := a.noteLine(b), ""
			if b.Bad {
				tip = b.Text
			}
			tx := ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1)
			if tip != "" {
				tx.Tooltip(tip)
			}
		})
	}
}

// looksWords is a fold of looks in words: "看了 3 个文件，搜了 2 次".
func (a *App) looksWords(reads, searches int) string {
	var parts []string
	switch {
	case reads == 1:
		parts = append(parts, a.L.T("look.files.one"))
	case reads > 1:
		parts = append(parts, a.L.T("look.files", reads))
	}
	switch {
	case searches == 1:
		parts = append(parts, a.L.T("look.searches.one"))
	case searches > 1:
		parts = append(parts, a.L.T("look.searches", searches))
	}
	return strings.Join(parts, a.L.T("look.and"))
}

func derefInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

// stepLine is a step's one line: its mark, its words, the code it names in
// mono, and what trails it; a chevron when it opens. It answers a click.
func (a *App) stepLine(c *ui.Context, label string, expandable, open bool, children func(row ui.Element)) bool {
	t := a.T
	row := ui.Row(c.Key("line")).Gap(t.S2).MinHeight(26).Padding(1, 6).Margin(0, -6).Radius(t.RadiusSM).AlignItems(ui.Center).MinWidth(0).Label(label)
	if expandable {
		row.Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
		if row.Hovered() {
			row.Background(t.SurfaceSunken)
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

// looksLine is a run of reads and searches as one line; open, each one.
func (a *App) looksLine(c *ui.Context, task *store.Task, l *Line) {
	t := a.T
	key := fmt.Sprintf("looks:%s:%d", task.ID, l.Seq)
	open := a.open[key]
	words := a.looksWords(derefInt(l.Reads), derefInt(l.Searches))
	ui.Column(c).MinWidth(0).Children(func() {
		if a.stepLine(c, words, true, open, func(ui.Element) {
			a.glyph(c, 16, drawLens(t.InkMuted))
			ui.Text(c, words).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1).AccessHidden(true)
		}) {
			a.open[key] = !open
		}
		if open {
			ui.Column(c).Padding(0, 0, t.S1, 22).MinWidth(0).Children(func() {
				for i := range l.Rows {
					a.stepRow(c.Key(fmt.Sprintf("r%d", l.Rows[i].Seq)), task, &l.Rows[i])
				}
			})
		}
	})
}

// stepRow is one step: its line, a failure's error line under it, and
// what it ran and printed, or the edit's diff, once opened.
func (a *App) stepRow(c *ui.Context, task *store.Task, r *StepRow) {
	t := a.T
	words, code := a.rowWords(r)
	key := fmt.Sprintf("step:%s:%d", task.ID, r.Seq)
	open := a.open[key]
	detail := ""
	if r.Step != nil && len(r.Diff) == 0 {
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
	bad, quiet := r.Outcome == "error", r.Outcome == "missing" || r.Step == nil
	ui.Column(c).MinWidth(0).Children(func() {
		clicked := a.stepLine(c, strings.TrimSpace(words+" "+code), expandable, open, func(row ui.Element) {
			ink := t.InkSoft
			switch {
			case bad:
				a.glyph(c, 16, drawCross(t.Failed.Ink))
				ink = t.Failed.Ink
			case r.Step == nil:
				a.glyph(c, 16, drawThought(t.InkMuted))
			default:
				a.glyph(c, 16, stepGlyph(r.Step.Kind)(t.InkMuted))
			}
			if quiet {
				ink = t.InkMuted
			}
			ui.Text(c, words).FontSize(t.SM).TextColor(ink).SingleLine().MinWidth(0).Shrink(0.35).Tooltip(words).AccessHidden(true)
			if code != "" {
				ui.Text(c, code).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).Tooltip(code).AccessHidden(true)
			}
			if r.N > 1 {
				ui.Text(c, fmt.Sprintf("×%d", r.N)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
			if r.Added > 0 {
				ui.Text(c, fmt.Sprintf("+%d", r.Added)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Done.Ink).Shrink(0)
			}
			if r.Removed > 0 {
				ui.Text(c, fmt.Sprintf("−%d", r.Removed)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Failed.Ink).Shrink(0)
			}
			if bad {
				ui.Text(c, a.L.T("step.label.error")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink).Shrink(0)
			}
		})
		if clicked {
			a.open[key] = !open
		}
		if bad && r.Hint != "" && !open {
			// The error, in place: its telling line under the step.
			ui.Text(c, r.Hint).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Failed.Ink).SingleLine().MinWidth(0).
				Padding(0, 0, t.S1, 24).Tooltip(r.Hint).Selectable()
		}
		if open && len(r.Diff) > 0 {
			a.diffPanel(c, r)
		} else if open && detail != "" {
			a.outputPanel(c, key, detail)
		}
	})
}

// diffPanel is an edit's lines: what it put in on the done tint, what it
// took out on the failed tint, context plain; a file's name heads its
// lines when the edit touched several.
func (a *App) diffPanel(c *ui.Context, r *StepRow) {
	t := a.T
	ui.Column(c.Key("diff")).Margin(t.S1, 0, t.S2, 22).Padding(t.S1, 0).Radius(t.RadiusSM).Background(t.Sunken).Clip().MinWidth(0).Selectable().Children(func() {
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
			line := ui.Text(c.Key(i), text).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.5).Padding(0, t.S3).MinWidth(0).TextColor(ink)
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
	ui.Column(c.Key("out")).Gap(t.S1).Margin(t.S1, 0, t.S2, 22).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Sunken).MinWidth(0).Children(func() {
		ui.Text(c, shown).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.5).TextColor(t.InkSoft).Selectable()
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

// liveWords is what the agent is on now, for the foot: its latest step in
// words, or "" when its latest is something it said.
func (a *App) liveWords(blocks []Block) string {
	if len(blocks) == 0 {
		return ""
	}
	b := &blocks[len(blocks)-1]
	if b.K != "steps" || len(b.Lines) == 0 {
		return ""
	}
	l := &b.Lines[len(b.Lines)-1]
	if l.K == "looks" {
		return a.looksWords(derefInt(l.Reads), derefInt(l.Searches))
	}
	w, code := a.rowWords(l.Row)
	if l.Row.Step != nil && l.Row.Step.Says == "" && code != "" {
		return w + " " + code
	}
	return w
}

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

// taskFoot is where the task stands, over the composer: while it works, a
// spinner, the clock and its latest step, and Pause (Esc twice); when it is
// over to the user, saying so with what to do. Silent otherwise: the
// outcome is at the head.
func (a *App) taskFoot(c *ui.Context, task *store.Task, blocks []Block) {
	t := a.T
	att := task.Attention()
	working := att == protocol.Working || att == protocol.Queued
	yours := a.yourTurn(task)
	if !working && !yours {
		return
	}
	a.aboveComposer(c, func() {
		ui.Row(c.Key("foot")).Gap(t.S2).MinHeight(t.ControlSM).Padding(0, t.S3).AlignItems(ui.Center).MinWidth(0).Role(ui.RoleStatus).Children(func() {
			if yours {
				ui.Text(c, a.L.T("task.your.turn")).FontSize(t.SM).FontWeight(800).TextColor(t.State(string(protocol.NeedsYou)).Ink).Shrink(0)
				ui.Text(c, a.L.T("task.your.turn.hint")).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
				return
			}
			ui.Box(c).Size(16, 16).Shrink(0).Center().Children(func() { ui.Spinner(c).Size(12, 12) })
			ui.Text(c, a.stateLabel(att)).FontSize(t.SM).FontWeight(800).TextColor(t.State(string(protocol.Working)).Ink).Shrink(0)
			if when := a.taskClock(c, task); when != "" {
				ui.Text(c, "· "+when).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
			if now := a.liveWords(blocks); now != "" {
				ui.Text(c, "· "+now).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1).Tooltip(now)
			}
			ui.Spacer(c)
			if att != protocol.Working {
				return
			}
			if a.escArmed(c, task.ID) {
				ui.Text(c, a.L.T("foot.esc")).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
				if a.button(c, a.L.T("foot.keep"), btnText, t.ControlSM, t.Bg) {
					a.escAt, a.escTask = time.Time{}, ""
				}
				if a.button(c, a.L.T("task.action.pause"), btnSecondary, t.ControlSM, t.Bg) {
					a.escAt, a.escTask = time.Time{}, ""
					a.TaskAction(task.ID, "interrupt")
				}
				return
			}
			if a.button(c, a.L.T("task.action.pause"), btnText, t.ControlSM, t.Bg) {
				a.TaskAction(task.ID, "interrupt")
			}
		})
	})
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
