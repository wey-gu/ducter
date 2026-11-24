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

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

const (
	// historyFirst is the newest window an opened task asks for first
	// (D284): what paints at once; historyPage, each older page after it,
	// in the background up to historyLimit events (D271: a long loop's
	// day), then as the reader scrolls up to its head.
	historyFirst = 200
	historyPage  = 300
	historyLimit = 2000
	// outputLines of a step's output show before "n more lines".
	outputLines = 12
	// escWindow is how long a first Esc waits for the second (D210).
	escWindow = 3 * time.Second
	// groupMax is how many of an opened run's steps show before "n more
	// steps" (D271: it grows in place, never a scroller of its own).
	groupMax = 60
	// stepSize is a step line's words (D268): 13, secondary ink.
	stepSize = 13
	// stepRowH is every step row's height (D530): one rhythm; stepChipH
	// a chip's in it.
	stepRowH  = 28
	stepChipH = 20
	// stepTail is how many of a long stretch's rows show under "前面还有
	// n 步" (D530), which opens the rest in place.
	stepTail = 8
)

// blocks is the opened task's transcript as blocks, made once per change
// of its events (D271).
func (a *App) blocks(task *store.Task) []Block { return a.memoOf(task).blocks }

func isWorking(task *store.Task) bool {
	att := task.Attention()
	return att == protocol.Working || att == protocol.Queued
}

// workEnd is where a turn's work ends (D530): while it works, all of it;
// once done, the blocks before its last words; -1 when it has no steps.
func workEnd(tu *Turn, live bool) int {
	if live {
		for i := range tu.Body {
			if tu.Body[i].K == "steps" {
				return len(tu.Body)
			}
		}
		return -1
	}
	return turnFold(tu)
}

// turnFold is where a finished turn's work ends: the blocks before its
// last words fold away (D268), when there is work among them; -1 for none.
func turnFold(tu *Turn) int {
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
			a.sentBubble(c, p.Text, task.SendFor(p.Seq), queued, p.Media...)
			a.steerReceipt(c, task, p.Seq) // D325
			if p.Full > 0 {
				ui.Row(c).Justify(ui.End).Children(func() { a.showAll(c, task, p.Seq, p.Full, false) })
			}
		case "go":
			// D284: their Go on a card, relayed: a quiet chip on their side, what was sent on hover.
			a.goChip(c, task, p)
		case "wake", "told":
			// D271: Ducter woke it, or told it something itself: a hairline
			// with its time, the reason (or what was sent) on hover.
			a.dividerTip(c, a.promptLine(p), a.promptAt(task, p), p.Text)
		}
	}
	took := a.turnTook(task, tu)
	a.tpage.took, a.tpage.answer = "", -1
	for i := len(tu.Body) - 1; i >= 0 && !live; i-- {
		if tu.Body[i].K == "voice" {
			a.tpage.answer = tu.Body[i].Seq
			break
		}
	}
	if !live && took > 0 {
		a.tpage.took = a.L.T("turn.worked", a.shortDur(took))
	}
	// D530: the turn's work (everything before its last words; all of it
	// while it works) under one quiet head: folded once the turn is done,
	// open while it works.
	from := 0
	if end := workEnd(tu, live); end > 0 {
		key := fmt.Sprintf("turn:%s:%d", task.ID, tu.Seq)
		open := a.open[key]
		if live {
			open = !a.open[key+":shut"]
		}
		w := workOf(tu.Body[:end])
		if a.workHead(c, key, a.workWords(w), w.Failed, live, open) {
			if live {
				a.open[key+":shut"] = open
			} else {
				a.open[key] = !open
			}
		}
		if !open {
			from = end
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

// promptCard is the brief, or what the partner passed on: a quiet sunken
// card under who said it, three lines until opened; a key in it is hidden
// and said so; its pictures small under the words.
func (a *App) promptCard(c *ui.Context, task *store.Task, b *Block, label string) {
	t := a.T
	key := fmt.Sprintf("prompt:%s:%d", task.ID, b.Seq)
	open := a.open[key]
	long := strings.Count(b.Text, "\n") > 2 || len([]rune(b.Text)) > 180
	ui.Column(c.Key("prompt")).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
		uiText(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		tx := uiText(c, b.Text).FontSize(t.SM).LineHeight(leadingFor(b.Text, 1.55)).TextColor(t.InkSoft).Selectable()
		if !open && long {
			tx.MaxLines(3)
		}
		a.messageMedia(c, fmt.Sprint("p", b.Seq), b.Media, nil, false, "task:"+task.ID)
		if b.Full > 0 {
			a.showAll(c, task, b.Seq, b.Full, false)
		}
		if redact.Has(b.Text) || long {
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				if redact.Has(b.Text) {
					ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
						a.glyph(c, 14, drawKey(t.InkMuted))
						uiText(c, a.L.T("secret.hidden")).FontSize(t.XS).TextColor(t.InkMuted)
					})
				}
				ui.Spacer(c)
				if long {
					more := a.L.T("task.asked.more")
					if open {
						more = a.L.T("task.asked.less")
					}
					l := uiText(c.Key("more"), more).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(more)
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
		a.voice(c, task, b)
	case "saved":
		a.savedLine(c, task, b)
	case "steps":
		a.stepItems(c, task, b)
	case "plan":
		a.planCard(c, b)
	case "report":
		uiText(c, a.reportLabel(&protocol.Report{State: b.State})).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		uiText(c, autospace(b.Text)).FontSize(taskProse).LineHeight(leadingFor(b.Text, 1.6)).TextColor(t.InkSoft).Selectable()
		a.messageMedia(c, fmt.Sprint("r", b.Seq), b.Media, nil, false, "task:"+task.ID)
		if b.Full > 0 {
			a.showAll(c, task, b.Seq, b.Full, false)
		}
	case "note":
		switch b.Say {
		case "compacted", "interrupted":
			a.divider(c, a.noteLine(b))
			return
		case "switched", "retuned", "moved":
			// D282: who does it changed inside the task: one hairline, its time apart (D291).
			a.dividerTip(c, a.switchLine(task, b), clock(a.tsOf(task, b.Seq)), "")
			return
		case "earlier":
			// D299: an outside session's earlier turns follow (11月12日在 Claude Code 里开始的).
			a.divider(c, a.earlierLine(b))
			return
		case "limit":
			// D297: the agent's limit ran out: a calm hairline with when it resets, never an error.
			words, at := a.limitNote(b)
			a.dividerTip(c, words, at, "")
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
			tx := uiText(c, line).FontSize(stepSize).TextColor(t.InkSoft).SingleLine().MinWidth(0).Shrink(1)
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
		uiText(c, label).FontSize(t.XXS).TextColor(t.InkMuted).SingleLine().Shrink(0)
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
			uiText(c, a.L.T("plan.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			ui.Spacer(c)
			uiText(c, a.L.T("plan.progress", done, len(b.Items))).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum")
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
				uiText(c, autospace(it.Text)).FontSize(stepSize).LineHeight(leadingFor(it.Text, 1.45)).TextColor(ink).MinWidth(0).Shrink(1)
			})
		}
	})
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

// diffPanel is an edit's lines: what it put in on the done tint, what it
// took out on the failed tint, context plain; a file's name heads its
// lines when the edit touched several.
func (a *App) diffPanel(c *ui.Context, r *StepRow) {
	t := a.T
	ui.Column(c.Key("diff")).Margin(t.S1, 0, t.S2, 24).Padding(t.S1, 0).Radius(8).Background(t.Sunken).Clip().MinWidth(0).Selectable().Children(func() {
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
			line := uiText(c.Key(i), text).Font(t.Mono).FontSize(12).LineHeight(1.5).Padding(0, t.S3).MinWidth(0).TextColor(ink)
			if bg != nil {
				line.Background(bg.Alpha(0.55))
			}
			if strings.HasPrefix(l, "@@ ") {
				line.FontWeight(700).Padding(t.S1, t.S3, 0, t.S3)
			}
		}
		if r.DiffMore > 0 {
			uiText(c.Key("more"), a.L.T("step.lines.more", r.DiffMore)).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3, 0, t.S3)
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
	ui.Column(c.Key("out")).Gap(t.S1).Margin(t.S1, 0, t.S2, 24).Padding(t.S2, t.S3).Radius(8).Background(t.Sunken).MinWidth(0).Children(func() {
		uiText(c, shown).Font(t.Mono).FontSize(12).LineHeight(1.5).TextColor(t.InkSoft).Selectable()
		if !all && len(lines) > outputLines {
			more := a.L.T("step.lines.more", len(lines)-outputLines)
			l := uiText(c.Key("more"), more).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(more)
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
		if h := strings.Split(r.Thought, "\n")[0]; h != "" {
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

// workingLine is the transcript's foot while a turn is under way (D530): a
// hairline, then one muted line in the step rows' rhythm: the shared spinner
// (the one thing on the page that moves while it works) and what it is doing
// now in plain words with the turn's clock, 「正在跑命令，41 秒」 / "Running a
// command, 41s"; 「还在做」 / "Still working" when its latest is words. A
// retry says itself here instead. Never the link's blue, never a bare state.
func (a *App) workingLine(c *ui.Context, task *store.Task, turns []Turn, blocks []Block) {
	t := a.T
	words := a.footWords(blocks)
	if n := len(blocks); n > 0 {
		// D271: only what the state proves: a retry, else what it is on.
		if last := &blocks[n-1]; last.K == "note" && last.Say == "retry" {
			words = a.noteLine(last)
		}
	}
	if len(turns) > 0 {
		if at := store.ParseTime(a.tsOf(task, turns[len(turns)-1].Seq)); !at.IsZero() {
			c.After(time.Second)
			words = a.L.T("foot.live", words, a.shortDur(a.Now().Sub(at)))
		}
	}
	ui.Column(c.Key("working")).Gap(t.S1).MinWidth(0).Children(func() {
		ui.Box(c).Height(1).Background(t.LineSoft)
		ui.Row(c).Gap(t.S2).MinHeight(stepRowH).AlignItems(ui.Center).MinWidth(0).Role(ui.RoleStatus).Label(words).Children(func() {
			ui.Box(c).Size(16, 16).Shrink(0).Center().AccessHidden(true).Children(func() { ui.Spinner(c).Size(11, 11) })
			uiText(c, words).FontSize(stepSize).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine().MinWidth(0).Shrink(1).AccessHidden(true)
		})
	})
}

// footWords is what the agent is doing now, said plainly for the live line:
// its latest step's kind in the present, never its command or a tool's name
// (the step's own row says those); 「还在做」 when its latest is words.
func (a *App) footWords(blocks []Block) string {
	still := a.L.T("foot.still")
	if len(blocks) == 0 {
		return still
	}
	b := &blocks[len(blocks)-1]
	if b.K != "steps" || len(b.Lines) == 0 {
		return still
	}
	l := &b.Lines[len(b.Lines)-1]
	var r *StepRow
	switch {
	case l.K == "group" && len(l.Rows) > 0:
		r = &l.Rows[len(l.Rows)-1]
	case l.K == "group":
		if len(l.Tally) > 0 {
			return a.footKind(l.Tally[0].Kind, "", "")
		}
		return still
	default:
		r = l.Row
	}
	if r == nil {
		return still
	}
	if r.Step == nil {
		return a.L.T("foot.thought")
	}
	return a.footKind(r.Step.Kind, r.Step.Act, r.Step.Via)
}

func (a *App) footKind(kind, act, via string) string {
	switch {
	case kind == "other" && via != "":
		return a.L.T("foot.used", serviceName(via))
	case kind == "searched" && act == "web", kind == "web":
		return a.L.T("foot.web")
	case kind == "delegated":
		return a.L.T("foot.sub")
	}
	switch kind {
	case "ran", "read", "edited", "searched", "browsed", "computer", "waited":
		return a.L.T("foot." + kind)
	}
	return a.L.T("foot.still")
}

// shimmerText is words at 45% with a brighter band sweeping across them,
// once every 1.8 s; still under reduced motion.
func (a *App) shimmerText(c *ui.Context, text string, size float32, col ui.Color) ui.Element {
	t := a.T
	tx := uiText(c, text).FontSize(size).FixedLineHeight(18).TextColor(col.Alpha(0.55)).SingleLine().Shrink(1).MinWidth(0)
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
				uiText(c, a.L.T("task.your.turn")).FontSize(t.SM).FontWeight(800).TextColor(t.State(string(protocol.NeedsYou)).Ink).Shrink(0)
				uiText(c, a.L.T("task.your.turn.hint")).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
			})
		})
		return
	}
	if task.Attention() == protocol.Working && a.escArmed(c, task.ID) {
		a.aboveComposer(c, func() {
			ui.Row(c.Key("foot")).Gap(t.S2).MinHeight(t.ControlSM).Padding(0, t.S3).AlignItems(ui.Center).MinWidth(0).Role(ui.RoleStatus).Children(func() {
				uiText(c, a.L.T("foot.esc")).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
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
