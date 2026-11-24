package views

// D530: the opened task's steps as rows. Inside a turn's work (its head is
// workHead), the agent's words at their own size and, between them, one
// 28-tall row per step: a drawn mark by kind, a plain verb in 13 medium,
// its object in a mono chip (a command, a pattern) or a file chip (a file
// read or edited, which opens it), words in muted ink (a thought's first
// line, a subagent's task, a web search). A run of file reads is one row
// with their chips; a long stretch shows its last rows under "前面还有 n
// 步". The live step says itself in the present tense beside the shared
// spinner and its own clock. Never a raw tool name, never a verb alone.

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// filesShown is how many file chips a run of reads shows before "还有 n 个".
const filesShown = 3

// workWords is a turn's work in words: "12 步，3 条消息" / "12 steps, 3 messages".
func (a *App) workWords(w Work) string {
	if w.Steps == 0 {
		return a.L.T("work.thought")
	}
	s := a.L.T("work.steps", w.Steps)
	if w.Steps == 1 {
		s = a.L.T("work.steps.one")
	}
	switch {
	case w.Messages == 1:
		s += a.L.T("work.msgs.one")
	case w.Messages > 1:
		s += a.L.T("work.msgs", w.Messages)
	}
	return s
}

// stepItems draws a stretch of steps (D530): its rows, a run of file reads
// as one; past stepTail, the last ones under "前面还有 n 步", which opens
// the rest in place. The live stretch's last step is its own row.
func (a *App) stepItems(c *ui.Context, task *store.Task, b *Block) {
	t := a.T
	items := itemsOf(b.Lines)
	if b.Live && len(items) > 0 {
		// The live step stands alone, even out of a run of reads.
		if last := &items[len(items)-1]; last.K == "files" {
			r := last.Rows[len(last.Rows)-1]
			rest := last.Rows[:len(last.Rows)-1]
			items = items[:len(items)-1]
			if len(rest) >= 2 {
				items = append(items, Item{K: "files", Seq: rest[0].Seq, Rows: rest})
			} else {
				for i := range rest {
					x := rest[i]
					items = append(items, Item{K: "row", Row: &x})
				}
			}
			items = append(items, Item{K: "row", Row: &r})
		}
	}
	key := fmt.Sprintf("stretch:%s:%d", task.ID, b.Seq)
	from := 0
	if len(items) > stepTail && !a.open[key] {
		from = len(items) - stepTail
	}
	ui.Column(c.Key("items")).MinWidth(0).Children(func() {
		if from > 0 {
			n := 0
			for _, it := range items[:from] {
				if it.K == "files" {
					n += len(it.Rows)
				} else if it.Row.Step != nil {
					n += it.Row.N
				} else {
					n++
				}
			}
			label := a.L.T("steps.earlier", n)
			ui.Column(c.Key("earlier")).MinWidth(0).Children(func() {
				if a.stepLine(c, label, true, false, func(ui.Element) {
					a.glyph(c, 16, drawMore(t.Faint))
					uiText(c, label).FontSize(stepSize).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).AccessHidden(true)
				}) {
					a.open[key] = true
				}
			})
		}
		for i := from; i < len(items); i++ {
			it := &items[i]
			if it.K == "files" {
				a.filesRow(c.Key(fmt.Sprintf("f%d", it.Seq)), task, it)
				continue
			}
			a.stepRow(c.Key(fmt.Sprintf("r%d", it.Row.Seq)), task, it.Row, b.Live && i == len(items)-1)
		}
	})
}

// filesRow is a run of file reads as one row: "读了 3 个文件" and the files'
// chips, the rest counted.
func (a *App) filesRow(c *ui.Context, task *store.Task, it *Item) {
	verb := a.L.T("step.read.files", len(it.Rows))
	var names []string
	for _, r := range it.Rows {
		names = append(names, chipFileName(r.Step.Target))
	}
	ui.Column(c).MinWidth(0).Children(func() { a.filesLine(c, task, it, verb, names) })
}

func (a *App) filesLine(c *ui.Context, task *store.Task, it *Item, verb string, names []string) {
	t := a.T
	a.stepLine(c, spoken(a.L, append([]string{verb}, names...)...), false, false, func(ui.Element) {
		a.glyph(c, 16, drawPage(t.InkMuted))
		uiText(c, verb).FontSize(stepSize).FontWeight(500).TextColor(t.InkSoft).SingleLine().Shrink(0).AccessHidden(true)
		for i, r := range it.Rows {
			if i == filesShown {
				break
			}
			a.fileChip(c, fmt.Sprint(r.Seq), r.Step.Target, r.Path, task.ID)
		}
		if n := len(it.Rows) - filesShown; n > 0 {
			uiText(c, a.L.T("step.files.more", n)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0).
				Tooltip(strings.Join(names[filesShown:], "\n"))
		}
	})
}

// stepParts is what a step row says, apart: the verb, its object as a mono
// chip or a file chip, and muted words.
type stepParts struct {
	verb, code, file, path, words, more, tip string
}

// stepMark is a step's drawn mark (D530): a search of the web a globe, a
// service's tool a plug, else its kind's.
func stepMark(st *Step) func(ui.Color) func(*ui.Painter, ui.Rect) {
	switch {
	case st.Kind == "searched" && st.Act == "web":
		return drawGlobe
	case st.Kind == "other" && st.Via != "":
		return drawPlug
	}
	return stepGlyph(st.Kind)
}

// rowParts is a step in its row's words (D530): a plain verb (the present
// tense while it is the live one) and the object it acted on, never alone.
func (a *App) rowParts(r *StepRow, live bool) stepParts {
	now := func(k, past string) string {
		if live {
			return a.L.T("now." + k)
		}
		return past
	}
	if r.Step == nil {
		w, _ := a.rowWords(r)
		head := strings.TrimSpace(strings.Split(r.Thought, "\n")[0])
		return stepParts{verb: now("thought", w), words: head}
	}
	st := r.Step
	if r.Outcome == "missing" {
		w, code := a.rowWords(r)
		return stepParts{verb: w, code: code}
	}
	label := func(k string) string { return a.L.T("step.label." + k) }
	cmd := firstLine(unwrapShell(r.Command))
	switch st.Kind {
	case "delegated":
		return stepParts{verb: now("sub", label("sub")), words: st.Target}
	case "other":
		if st.Via != "" {
			act, obj := toolAct(st.Target)
			return stepParts{verb: a.L.T("use.say", serviceName(st.Via), a.L.T("use.act."+act)), code: obj}
		}
		if st.Target != "" {
			return stepParts{verb: label("other"), code: st.Target}
		}
	case "ran":
		code := ""
		if r.Command != "" {
			code = chipText(unwrapShell(r.Command), 72)
		} else if st.Target != "" {
			code = st.Target
		}
		p := stepParts{code: code, tip: st.Says}
		switch {
		case st.Act != "":
			p.verb = a.capFirst(a.stepWords(*st))
		case code != "":
			p.verb = now("ran", label("ran"))
		default:
			p.verb = a.L.T("step.ran.bare")
		}
		if p.tip == "" && cmd != "" {
			p.tip = cmd
		}
		return p
	case "read":
		switch {
		case st.Act == "list" && st.Target != "":
			return stepParts{verb: label("list"), code: st.Target}
		case st.Act != "":
			return stepParts{verb: a.capFirst(a.stepWords(*st))}
		case st.Target != "":
			return stepParts{verb: now("read", label("read")), file: st.Target, path: r.Path}
		}
		return stepParts{verb: a.L.T("step.read.bare")}
	case "edited":
		switch {
		case st.Act != "":
			return stepParts{verb: a.capFirst(a.stepWords(*st))}
		case st.Target != "":
			p := stepParts{verb: now("edited", label("edited")), file: st.Target, path: r.Path}
			if st.More > 0 {
				p.more = a.L.T("step.edited.others", st.More)
			}
			return p
		}
		return stepParts{verb: a.L.T("step.edited.bare")}
	case "searched":
		switch {
		case st.Act == "web" && st.Target != "":
			return stepParts{verb: now("web", label("web")), words: st.Target}
		case st.Act == "" && st.Target != "":
			return stepParts{verb: now("searched", label("searched")), code: st.Target}
		case st.Act == "":
			return stepParts{verb: a.L.T("step.searched.bare")}
		}
	}
	return stepParts{verb: a.capFirst(a.stepWords(*st))}
}

// stepRow is one step: its row, a failure's words under it, and what it ran
// and printed, the edit's diff or its thinking, once opened.
func (a *App) stepRow(c *ui.Context, task *store.Task, r *StepRow, live bool) {
	t := a.T
	p := a.rowParts(r, live)
	key := fmt.Sprintf("step:%s:%d", task.ID, r.Seq)
	open := a.open[key]
	detail := ""
	switch {
	case r.Step == nil:
		detail = r.Thought
	case len(r.Diff) == 0:
		var parts []string
		if r.Step.Says != "" {
			parts = append(parts, r.Step.Says)
		}
		if r.Command != "" {
			parts = append(parts, "$ "+unwrapShell(r.Command))
		}
		if r.Output != "" {
			parts = append(parts, r.Output)
		}
		if r.Command != "" || r.Output != "" {
			detail = strings.Join(parts, "\n")
		}
	}
	if r.Step == nil && !strings.Contains(strings.TrimSpace(r.Thought), "\n") && p.words != "" && len([]rune(p.words)) < 60 {
		detail = "" // a one-line thought says it all in its row
	}
	expandable := detail != "" || len(r.Diff) > 0
	bad, quiet := r.Outcome == "error", r.Outcome == "missing"
	label := spoken(a.L, p.verb, p.file, p.code, p.words)
	ui.Column(c).MinWidth(0).Children(func() {
		clicked := a.stepLine(c, label, expandable, open, func(ui.Element) {
			switch {
			case live:
				ui.Box(c).Size(16, 16).Shrink(0).Center().Children(func() { ui.Spinner(c).Size(11, 11) })
			case bad:
				a.glyph(c, 16, drawCrossSmall(t.Failed.Ink))
			case r.Step == nil:
				a.glyph(c, 16, drawThought(t.InkMuted))
			default:
				a.glyph(c, 16, stepMark(r.Step)(t.InkMuted))
			}
			ink := t.InkSoft
			if quiet {
				ink = t.InkMuted
			}
			if bad && r.Step != nil && r.Step.Kind == "background" {
				ink = t.Failed.Ink // D521: a background failure says it in its words, in the error ink
			}
			verb := uiText(c, p.verb).FontSize(stepSize).FontWeight(500).TextColor(ink).SingleLine().MinWidth(0).Shrink(0.25).AccessHidden(true)
			if p.tip != "" {
				verb.Tooltip(p.tip)
			} else {
				verb.Tooltip(p.verb)
			}
			if p.file != "" {
				a.fileChip(c, fmt.Sprint(r.Seq), p.file, p.path, task.ID)
			}
			if p.code != "" {
				tip := p.code
				if r.Command != "" {
					tip = unwrapShell(r.Command)
				}
				a.stepChip(c, p.code, tip)
			}
			if p.words != "" {
				uiText(c, autospace(p.words)).FontSize(stepSize).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).Tooltip(p.words).AccessHidden(true)
			}
			if p.more != "" {
				uiText(c, p.more).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
			}
			if r.N > 1 {
				uiText(c, fmt.Sprintf("×%d", r.N)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
			if r.Added > 0 {
				uiText(c, fmt.Sprintf("+%d", r.Added)).Font(t.Mono).FontSize(t.XS).TextColor(t.Done.Ink).Shrink(0)
			}
			if r.Removed > 0 {
				uiText(c, fmt.Sprintf("−%d", r.Removed)).Font(t.Mono).FontSize(t.XS).TextColor(t.Failed.Ink).Shrink(0)
			}
			ui.Spacer(c)
			switch {
			case live:
				// How long the step under way has run, by the shared clock.
				if at := store.ParseTime(a.tsOf(task, r.Seq)); !at.IsZero() {
					c.After(time.Second)
					uiText(c, a.shortDur(a.Now().Sub(at))).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
				}
			case r.Step != nil && r.Step.Kind == "delegated" && r.Ms != nil:
				// A subagent's row: done, and how long it took.
				a.glyph(c, 12, drawCheck(t.InkMuted))
				uiText(c, a.shortDur(time.Duration(*r.Ms)*time.Millisecond)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			case bad && (r.Step == nil || r.Step.Kind != "background"): // D521: a background failure says it in its words
				uiText(c, a.L.T("step.label.error")).FontSize(t.XS).FontWeight(600).TextColor(t.Failed.Ink).Shrink(0)
			}
		})
		if clicked {
			a.open[key] = !open
		}
		if bad && !open {
			// The failure in words, one quiet line under the verb; the raw text when opened.
			if w := a.failWords(r); w != "" {
				uiText(c, autospace(w)).FontSize(stepSize).LineHeight(leadingFor(w, 1.5)).TextColor(t.InkSoft).MaxLines(2).MinWidth(0).
					Padding(0, 0, t.S1, 24).Tooltip(r.Hint).Selectable()
			}
		}
		switch {
		case open && r.Step == nil:
			uiText(c, autospace(r.Thought)).FontSize(stepSize).LineHeight(1.5).TextColor(t.InkMuted).
				Padding(2, 0, t.S1, 24).MinWidth(0).Selectable()
		case open && len(r.Diff) > 0:
			a.diffPanel(c, r)
		case open && detail != "":
			a.outputPanel(c, key, detail)
			if r.OutputFull > 0 {
				a.showAll(c, task, r.Seq, r.OutputFull, true) // D320: what it printed, cut at its most
			}
		}
	})
}
