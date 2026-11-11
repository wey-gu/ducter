package views

// What it did, as the agent tells it (D152, after D127): the agent's own
// words are the readable layer; each stretch of steps between two things
// it said folds under one gist line ("查看了一圈 · 5 步"), opened on a
// click, the stretch under way live with a spinner and its latest step; a
// step is one sentence (the agent's own words for it when the harness
// carries them), a probe that found nothing is neutral, only a real
// failure is red and shows even folded. transcript.go builds the blocks,
// steps.go names the steps; keys are hidden in both.

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// goRelay is the label of a Go the user gave, from the text Ducter relays
// to the task ("User says Go: …."), or false.
func goRelay(text string) (string, bool) {
	rest, ok := strings.CutPrefix(text, "User says Go: ")
	if !ok {
		return "", false
	}
	return strings.TrimRight(strings.TrimSpace(rest), ".。"), true
}

// blocks is the opened task's transcript as blocks.
func (a *App) blocks(task *store.Task) []Block {
	att := task.Attention()
	return blocksOf(task.Harness(), task.Events, att == protocol.Working || att == protocol.Queued)
}

// briefCard is what you (or the partner) asked, quiet and folded to three
// lines; a key in it is hidden and said so.
func (a *App) briefCard(c *ui.Context, task *store.Task, blocks []Block) {
	t := a.T
	var b *Block
	for i := range blocks {
		if blocks[i].K == "brief" {
			b = &blocks[i]
			break
		}
	}
	if b == nil {
		return
	}
	key := "brief:" + task.ID
	open := a.open[key]
	label := a.L.T("task.asked", a.S.PersonaName)
	if b.By == "you" {
		label = a.L.T("task.asked.you")
	}
	long := strings.Count(b.Text, "\n") > 2 || len([]rune(b.Text)) > 180
	ui.Column(c.Key("brief")).Gap(t.S2).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.SurfaceSunken).MaxWidth(readMeasure).Children(func() {
		ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		tx := ui.Text(c, b.Text).FontSize(t.SM).LineHeight(leadingFor(b.Text, 1.55)).TextColor(t.InkSoft).Selectable()
		if !open {
			tx.MaxLines(3)
		}
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
					l := ui.Text(c.Key("brief-more"), more).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(more)
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

// whatItDid is the transcript under the brief: the agent's voice, its
// steps folded per stretch, your words, its earlier reports.
func (a *App) whatItDid(c *ui.Context, task *store.Task, blocks []Block) {
	t := a.T
	ui.Column(c.Key("did")).Gap(t.S4).MaxWidth(readMeasure).Children(func() {
		if len(blocks) == 0 && len(task.Sends) == 0 {
			ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		}
		for i := range blocks {
			b := &blocks[i]
			if b.K == "brief" {
				continue
			}
			ui.Column(c.Key(fmt.Sprintf("b:%d", b.Seq))).Gap(t.S1).Children(func() { a.block(c, task, b) })
		}
		for _, sd := range task.Sends {
			if sd.Seq == 0 {
				a.sentBubble(c, sd.Text, sd)
			}
		}
		// D206: words with pictures still going up: shown, sent when they land.
		for _, w := range a.waitingTaskSends(task.ID) {
			ui.Column(c.Key("tw:" + w.clientID)).Gap(t.S1).AlignItems(ui.End).Children(func() {
				a.messageMedia(c, "tw"+w.clientID, nil, w.atts, true, "task:"+task.ID)
				if w.text != "" {
					a.sentBubble(c, w.text, nil)
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
		a.stretch(c, task, b)
	case "you":
		text := b.Text
		if b.Go != nil {
			text = a.shortGo(*b.Go) // the user's Go, said as they said it
		}
		a.sentBubble(c, text, task.SendFor(b.Seq), b.Media...)
	case "partner":
		ui.Text(c, a.L.T("task.from.partner", a.S.PersonaName)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		ui.Text(c, b.Text).FontSize(t.MD).LineHeight(leadingFor(b.Text, 1.55)).TextColor(t.InkSoft).Selectable()
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

// noteLine is a note in words: note.<say>, its name filled in (a
// computer it didn't name is said plainly; an effort in its own word).
func (a *App) noteLine(b *Block) string {
	name := b.Name
	switch b.Say {
	case "effort_dropped":
		if name != "" {
			name = a.effortWord(name)
		}
	case "offline", "back", "waiting_device":
		if name == "" {
			name = a.L.T("note.computer")
		}
	}
	key := "note." + b.Say
	if !strings.Contains(a.L.T(key), "%") {
		return a.L.T(key)
	}
	return a.L.T(key, name)
}

// tsOf is when the event with seq happened.
func (a *App) tsOf(task *store.Task, seq int64) string {
	for _, ev := range task.Events {
		if ev.Seq == seq {
			return ev.TS
		}
	}
	return ""
}

// gistWords is a stretch's one line: "查看了一圈", "改了 2 个文件".
func (a *App) gistWords(b *Block) string {
	g := b.Gist
	switch g.Kind {
	case "look":
		return a.L.T("gist.look")
	case "edit":
		if g.Files == 1 {
			return a.L.T("gist.edit.one")
		}
		return a.L.T("gist.edit", g.Files)
	case "browse":
		if g.App != "" {
			return a.L.T("gist.browse", g.App)
		}
		return a.L.T("gist.browse.any")
	case "think":
		return a.L.T("gist.think")
	}
	if w := a.achieved(b); w != "" {
		return w
	}
	return a.L.T("gist.run")
}

// notableActs are steps that say what a stretch got done: an install, Mem
// connected, a PR opened or merged (and any step in the agent's own words).
var notableActs = map[string]bool{"install": true, "installer": true, "mem_connect": true, "mem_check": true, "pr_open": true, "pr_merge": true}

// achieved is what a stretch of commands got done, in at most two of its
// steps' words ("安装 x，连上 Mem"), or "".
func (a *App) achieved(b *Block) string {
	var ws []string
	seen := map[string]bool{}
	for i := range b.Rows {
		r := &b.Rows[i]
		if r.Step == nil || r.Outcome != "ok" || r.Step.Says == "" && !notableActs[r.Step.Act] {
			continue
		}
		w, _ := a.rowWords(r)
		if seen[w] || len(ws) == 2 {
			continue
		}
		seen[w] = true
		if len(ws) > 0 && a.L.Lang != i18n.ZH {
			w = strings.ToLower(w[:1]) + w[1:]
		}
		ws = append(ws, w)
	}
	return strings.Join(ws, a.L.T("gist.and"))
}

func (a *App) stepsCount(n int) string {
	if n == 1 {
		return a.L.T("gist.steps.one")
	}
	return a.L.T("gist.steps", n)
}

func gistGlyph(kind string) func(ui.Color) func(*ui.Painter, ui.Rect) {
	switch kind {
	case "look":
		return drawLens
	case "edit":
		return drawPencil
	case "browse":
		return drawGlobe
	case "think":
		return drawThought
	}
	return drawPrompt
}

// stretch is a run of steps between two things the agent said. One step
// is its own line; more fold under the gist, open while live.
func (a *App) stretch(c *ui.Context, task *store.Task, b *Block) {
	t := a.T
	rows := b.Rows
	if len(rows) == 1 && !b.Live {
		a.stepRow(c, task, &rows[0], false)
		return
	}
	key := fmt.Sprintf("stretch:%s:%d", task.ID, b.Seq)
	open, set := a.open[key]
	if !set {
		open = b.Live // the stretch under way shows its steps; a settled one folds
	}
	g, was := b.Gist, open
	p := ui.CollapsibleBase(c.Key("fold"), &open)
	tr := p.Trigger.Gap(t.S2).MinHeight(28).Padding(2, 6).Margin(0, -6).Radius(t.RadiusSM).AlignSelf(ui.Start).MaxWidth(readMeasure + 12).MinWidth(0).Cursor(ui.CursorPointer)
	if tr.Hovered() {
		tr.Background(t.SurfaceSunken)
	}
	label := a.gistWords(b)
	if b.Live {
		// Under way: the latest step in its own words, a spinner beside it.
		last := &rows[len(rows)-1]
		w, code := a.rowWords(last)
		label = strings.TrimSpace(w + " " + code)
	}
	tr.Label(label + " · " + a.stepsCount(g.Steps))
	tr.Children(func() {
		if b.Live {
			ui.Box(c).Size(16, 16).Shrink(0).Children(func() { ui.Spinner(c).Size(12, 12) })
		} else {
			a.glyph(c, 16, gistGlyph(g.Kind)(t.InkMuted))
		}
		ink := t.InkSoft
		if b.Live {
			ink = t.Ink
		}
		ui.Text(c, label).FontSize(t.SM).FontWeight(600).TextColor(ink).SingleLine().MinWidth(0).Shrink(1).AccessHidden(true)
		ui.Text(c, "· "+a.stepsCount(g.Steps)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0).AccessHidden(true)
		if g.Errors > 0 {
			ui.Text(c, "· "+a.L.T("gist.errors", g.Errors)).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink).Shrink(0).AccessHidden(true)
		}
		ui.Box(c).Size(12, 12).Shrink(0).Rotate(90 * p.Progress()).Draw(drawChevron(t.InkMuted, false))
	})
	if open != was { // only a click keeps it: a live stretch that settles folds again
		a.open[key] = open
	}
	if panel := p.Panel(func() {
		for i := range rows {
			a.stepRow(c.Key(rows[i].Seq), task, &rows[i], true)
		}
	}); panel.Valid() {
		panel.Padding(t.S1, 0, t.S1, 22).Gap(0)
	} else {
		// Folded, a real failure still shows: never hidden behind a gist.
		ui.Column(c).Padding(0, 0, 0, 22).Children(func() {
			for i := range rows {
				if rows[i].Outcome == "error" {
					a.stepRow(c.Key(rows[i].Seq), task, &rows[i], true)
				}
			}
		})
	}
}

// rowWords is a step's sentence and, apart, the code it names (in mono):
// the agent's own words when its harness gave them; "没找到 nmem" for a
// probe that found nothing; "运行 nmem doctor" for a command.
func (a *App) rowWords(r *StepRow) (string, string) {
	if r.Step == nil {
		return a.L.T("step.label.thought") + " · " + r.Thought, ""
	}
	st := *r.Step
	if r.Outcome == "missing" {
		base := "step." + st.Kind
		if st.Act != "" {
			base += "." + st.Act
		}
		k := base + ".missing"
		if st.Act == "cmd" && strings.Contains(st.Target, " ") {
			k += ".some"
		}
		if v := a.L.T(k, st.Target); !strings.HasPrefix(v, "step.") {
			return v, ""
		}
		return a.L.T("step.missing"), st.Target
	}
	if st.Says != "" {
		return st.Says, ""
	}
	if codeLike(st) {
		return a.L.T("step.label." + st.Kind), st.Target
	}
	return a.stepWords(st), ""
}

// stepWords is a step's summary in words: "在 Chrome 里打开 appstoreconnect.apple.com".
func (a *App) stepWords(st Step) string {
	key := "step." + st.Kind
	if st.Act != "" {
		key += "." + st.Act
	}
	if st.Kind == "edited" && st.More > 0 {
		return a.L.T("step.edited.more", st.Target, st.More)
	}
	tr := func(k string) (string, bool) {
		v := a.L.T(k)
		if v == k {
			return "", false
		}
		if strings.Contains(v, "%[") {
			v = a.L.T(k, st.Target, st.App)
		}
		return v, true
	}
	if st.App != "" {
		if v, ok := tr(key + ".app"); ok {
			return v
		}
	}
	if st.Target == "" {
		if v, ok := tr(key + ".bare"); ok {
			return v
		}
	}
	// A template that needs a target it hasn't got falls back to the bare target.
	if v, ok := tr(key); ok && (st.Target != "" || !strings.Contains(a.L.T(key), "%[1]")) {
		return v
	}
	if st.Target == "" {
		return a.L.T("step.label." + st.Kind)
	}
	return st.Target
}

// codeLike reports whether a step's summary is a code token (a command, a
// path, a pattern): it reads in mono on the inline code tint.
func codeLike(st Step) bool {
	switch st.Kind {
	case "ran", "read", "edited", "searched":
		return st.Target != "" && st.Act == ""
	}
	return false
}

// stepRow is one step: a mark, its sentence, the code it names in mono;
// what ran and what it printed open on a click.
func (a *App) stepRow(c *ui.Context, task *store.Task, r *StepRow, inner bool) {
	t := a.T
	words, code := a.rowWords(r)
	key := fmt.Sprintf("step:%s:%d", task.ID, r.Seq)
	open := a.open[key]
	detail := ""
	if r.Step != nil {
		parts := []string{}
		if r.Command != "" {
			parts = append(parts, "$ "+unwrapShell(r.Command))
		}
		if r.Output != "" {
			parts = append(parts, r.Output)
		}
		detail = strings.Join(parts, "\n")
	}
	bad, missing := r.Outcome == "error", r.Outcome == "missing"
	size := t.SM
	ui.Column(c).Gap(t.S1).Children(func() {
		row := ui.Row(c).Gap(t.S2).MinHeight(26).Padding(1, 6).Margin(0, -6).Radius(t.RadiusSM).AlignItems(ui.Center).MinWidth(0).Label(strings.TrimSpace(words + " " + code))
		if detail != "" {
			row.Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
			if row.Hovered() {
				row.Background(t.SurfaceSunken)
			}
		}
		if bad {
			row.Background(t.Failed.Surface.Alpha(0.55))
		}
		row.Children(func() {
			switch {
			case bad:
				a.glyph(c, 16, drawCross(t.Failed.Ink))
			case r.Step == nil:
				a.glyph(c, 16, drawThought(t.InkMuted))
			default:
				a.glyph(c, 16, stepGlyph(r.Step.Kind)(t.InkMuted))
			}
			ink := t.InkSoft
			if missing || r.Step == nil {
				ink = t.InkMuted
			}
			tx := ui.Text(c, words).FontSize(size).TextColor(ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(words).AccessHidden(true)
			if row.Hovered() && detail != "" {
				tx.TextColor(t.Ink)
			}
			if code != "" {
				ui.Text(c, code).Font(t.Mono).FontSize(t.MonoSM).Padding(1, 6).Radius(6).Background(t.Sunken).TextColor(ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(code).AccessHidden(true)
			}
			if r.N > 1 {
				ui.Text(c, fmt.Sprintf("×%d", r.N)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
			if bad {
				ui.Text(c, a.L.T("step.label.error")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink).Shrink(0)
			}
			if detail != "" && (row.Hovered() || open) {
				a.glyph(c, 12, drawChevron(t.InkMuted, open))
			}
		})
		if detail != "" && row.Clicked() {
			a.open[key] = !open
		}
		if open && detail != "" {
			ui.Text(c, detail).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.5).TextColor(t.InkSoft).
				Padding(t.S2, t.S3).Margin(0, 0, t.S1, 22).Radius(t.RadiusSM).Background(t.Sunken).Selectable().MaxLines(24)
		}
	})
	_ = inner
}

// stepGlyph is a step's drawn mark, in muted ink, never on a tile (D73).
func stepGlyph(kind string) func(ui.Color) func(*ui.Painter, ui.Rect) {
	switch kind {
	case "ran":
		return drawPrompt
	case "read":
		return drawPage
	case "edited":
		return drawPencil
	case "searched":
		return drawLens
	case "browsed":
		return drawGlobe
	case "computer":
		return drawScreen
	case "waited":
		return drawClock
	case "delegated":
		return drawArrow
	}
	return drawDot
}

// shortGo is the Go button's words (D127): the action when it is a short
// verb ("好，继续" / "Continue"), else plain 好 / Go: never a sentence.
func (a *App) shortGo(label string) string {
	l := strings.TrimSpace(strings.TrimRight(strings.TrimSpace(label), ".。!！"))
	if l == "" || !shortVerb(l) {
		return a.L.T("decision.go")
	}
	if a.L.Lang != i18n.ZH {
		r := []rune(l)
		r[0] = []rune(strings.ToUpper(string(r[0])))[0]
		l = string(r)
	}
	return a.L.T("decision.go.label", l)
}

// shortVerb reports whether a Go label is short enough for a button: at
// most 6 Chinese characters, or 3 English words, and no sentence in it.
func shortVerb(l string) bool {
	if strings.ContainsAny(l, "，,；;：:。") {
		return false
	}
	han, words := 0, len(strings.Fields(l))
	for _, r := range l {
		if r >= 0x2E80 {
			han++
		}
	}
	if han > 0 {
		return han <= 6 && words <= 2
	}
	return words <= 3
}

// elapsed is a running time as a clock reads it: 4:05, 1:02:09.
func elapsed(d time.Duration) string {
	s := int(max(0, d.Seconds()))
	if s >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", s/3600, s/60%60, s%60)
	}
	return fmt.Sprintf("%d:%02d", s/60, s%60)
}

// lastAt is when the task last did anything.
func lastAt(task *store.Task) time.Time {
	for i := len(task.Events) - 1; i >= 0; i-- {
		if at := store.ParseTime(task.Events[i].TS); !at.IsZero() {
			return at
		}
	}
	return time.Time{}
}

// yourTurn: it waits on you with nothing to answer (its turn ended on a
// question in its own words, or a wait ran out): say so, never a mystery.
func (a *App) yourTurn(task *store.Task) bool {
	return task.Attention() == protocol.NeedsYou && a.S.PendingDecision(task.ID) == nil
}

// taskClock is the task's one clock (D152): how long since it started,
// ticking until it finishes; once finished, how long it took.
func (a *App) taskClock(c *ui.Context, task *store.Task) string {
	started := store.ParseTime(task.OpenedAt)
	if started.IsZero() {
		return ""
	}
	if finished(task) {
		if end := lastAt(task); end.After(started) {
			return a.L.T("task.footer.took", a.duration(end.Sub(started)))
		}
		return ""
	}
	c.After(time.Second)
	return elapsed(a.Now().Sub(started))
}

// whereLine is where it runs, in a few words: the repo and its branch, the
// folder, or the machine when it isn't this one; nothing for no place.
func (a *App) whereLine(p protocol.Place) string {
	parts := []string{}
	switch p.Kind {
	case "repo":
		if r := lastPath(p.RepoPath); r != "" {
			parts = append(parts, r)
		}
		if p.Branch != "" {
			parts = append(parts, p.Branch)
		}
	case "folder":
		if f := lastPath(p.Path); f != "" {
			parts = append(parts, f)
		}
	case "browser":
		// The persona's own profile goes unsaid (it isn't a model or a place a person picked).
		if p.Profile != "" && p.Profile != "default" {
			parts = append(parts, p.Profile)
		}
	}
	// D157: with two or more computers the computer is said apart (taskWhere),
	// on every task; with one, only a device that isn't this one.
	if p.Device != "" && p.Device != "local" && !a.manyComputers() {
		parts = append(parts, a.L.T("task.where.on", p.Device))
	}
	return strings.Join(parts, " · ")
}

// taskWho is the meta line's second half: who does it (its coin, the agent
// and the model), where, and Switch who does it as a small action.
func (a *App) taskWho(c *ui.Context, task *store.Task) {
	t := a.T
	who := a.bodyLine(task)
	where := a.whereLine(task.Place())
	if on, _ := a.taskWhere(task); who == "" && where == "" && on == "" {
		return
	}
	ui.Row(c.Key("who")).Gap(t.S1).AlignItems(ui.Center).MinWidth(0).Shrink(1).Children(func() {
		ui.Text(c, "·").FontSize(t.SM).TextColor(t.InkMuted)
		if h := task.Harness(); h != "" {
			ui.Box(c).Padding(0, 2).Children(func() { a.coin(c, h, 16, coinMotionOf(task.Attention())) })
		}
		line := strings.Join(nonEmpty(who, where), " · ")
		tx := ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
		p := task.Place()
		if s := firstNonEmpty(p.RepoPath, p.Path); s != "" {
			tx.Tooltip(s)
		}
		// D157: which computer, and what it uses there; why on hover.
		if on, why := a.taskWhere(task); on != "" {
			ui.Text(c, "·").FontSize(t.SM).TextColor(t.InkMuted)
			wt := ui.Text(c.Key("where"), on).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
			if why != "" {
				wt.Tooltip(why)
			}
		}
		if canSwitch(task) && a.quietLink(c.Key("sw"), "who:"+task.ID, a.L.T("who.switch"), a.L.T("who.switch")) {
			a.openSwitch(task.ID)
		}
	})
}

// outsideActs is what went out of the machine (D?): its commands, quiet.
func (a *App) outsideActs(c *ui.Context, task *store.Task) {
	t := a.T
	acts := task.Outside()
	if !task.HistoryLoaded || len(acts) == 0 {
		return
	}
	ui.Column(c.Key("outside")).Gap(t.S1).MaxWidth(readMeasure).Children(func() {
		ui.Text(c, a.L.T("outside.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		for _, act := range acts {
			ui.Text(c.Key(act.Seq), redact.Text(act.Command)).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.45).TextColor(t.InkSoft).Selectable().MaxLines(3)
		}
	})
}
