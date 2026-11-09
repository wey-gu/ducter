package views

// What it did, as a compact transcript (D127): the agent's own sentences as
// normal text; between them each step one quiet line (a small drawn mark, a
// verb, a one-line summary, truncated); thinking as its headings; an error
// as one red-tinted line whose raw text opens on a click; saved progress as
// a tiny mark. The same on every harness: steps.go names the steps.

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// txLine is one line of the transcript: a step (a tool call, repeated n
// times in a row), the model's thinking, or another event said in words.
type txLine struct {
	ev      protocol.LogEvent
	step    *Step
	tool    *protocol.ToolCall
	failed  bool
	n       int
	thought string
	seq     int64
}

func (l txLine) isStep() bool { return l.step != nil || l.thought != "" }

// goRelay is the label of a Go the user gave, from the text Ducter relays
// to the task ("User says Go: …."), or false.
func goRelay(text string) (string, bool) {
	rest, ok := strings.CutPrefix(text, "User says Go: ")
	if !ok {
		return "", false
	}
	return strings.TrimRight(strings.TrimSpace(rest), ".。"), true
}

// quietSystem is a harness's note that says nothing to a person: a turn
// ending, a session starting, a browser status the steps already say.
func quietSystem(text string) bool {
	s := strings.ToLower(strings.TrimSpace(text))
	switch s {
	case "session started", "turn completed", "turn complete", "turn ended", "turn aborted":
		return true
	}
	return strings.HasPrefix(s, "looking at ") || strings.HasPrefix(s, "compaction ")
}

// transcript is the task's events as lines.
func (a *App) transcript(task *store.Task) []txLine {
	var out []txLine
	last := int64(-1)
	for _, ev := range task.Events {
		if ev.Kind == protocol.KindReport {
			last = ev.Seq
		}
	}
	harness, app := task.Harness(), ""
	for _, ev := range task.Events {
		switch ev.Kind {
		case protocol.KindTaskOpen, protocol.KindCheckpoint:
		case protocol.KindReport:
			if ev.Seq == last {
				continue // said above: the outcome, or where it stands
			}
		case protocol.KindTaskEvent:
			body, _ := ev.Typed()
			b, _ := body.(*protocol.TaskEvent)
			if b == nil {
				continue
			}
			if len(b.Thinking) > 0 {
				out = append(out, txLine{ev: ev, thought: strings.Join(b.Thinking, " · "), seq: ev.Seq})
				continue
			}
			if b.Tool != nil {
				st := stepOf(harness, b.Tool)
				if st.Hidden {
					continue
				}
				// The app a run of browser and computer steps works in carries
				// over to the steps that don't name it ("在 Chrome 里打开 …").
				if st.Kind == "browsed" || st.Kind == "computer" {
					if st.App == "" {
						st.App = app
					} else {
						app = st.App
					}
				}
				failed := b.Tool.OK != nil && !*b.Tool.OK
				if n := len(out); n > 0 && !failed && out[n-1].step != nil && !out[n-1].failed && *out[n-1].step == st {
					out[n-1].n++
					continue
				}
				out = append(out, txLine{ev: ev, step: &st, tool: b.Tool, failed: failed, n: 1, seq: ev.Seq})
				continue
			}
			if b.Role == "system" && (b.Text == "" || quietSystem(b.Text)) {
				continue
			}
			if b.Role == "user" && (b.From == "runner" || b.From == "" && (strings.HasPrefix(b.Text, `Start the task "`) || strings.HasPrefix(b.Text, "<brief>"))) {
				continue // the runner's kickoff, not something anyone said
			}
		default:
			continue
		}
		out = append(out, txLine{ev: ev, seq: ev.Seq})
	}
	return out
}

func (a *App) whatItDid(c *ui.Context, task *store.Task) {
	t := a.T
	lines := a.transcript(task)
	ui.Column(c.Key("did")).Gap(t.S2).MaxWidth(readMeasure).Children(func() {
		a.sectionTitle(c, a.L.T("task.transcript")).Margin(0, 0, t.S2, 0)
		if len(lines) == 0 && len(task.Sends) == 0 {
			ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		}
		for i := 0; i < len(lines); {
			if !lines[i].isStep() {
				a.transcriptRow(c.Key(lines[i].seq), task, lines[i].ev)
				i++
				continue
			}
			// A run of steps between the agent's words: a long one shows its
			// latest few, the earlier ones behind one quiet line.
			j := i
			for j < len(lines) && lines[j].isStep() {
				j++
			}
			run := lines[i:j]
			key := fmt.Sprintf("run:%s:%d", task.ID, run[0].seq)
			ui.Column(c.Key(key)).Gap(0).Children(func() {
				shown := run
				if len(run) > 6 && !a.open[key] {
					hidden := len(run) - 4
					if a.quietRow(c, key, a.L.T("step.more", hidden)) {
						a.open[key] = true
					}
					shown = run[hidden:]
				}
				for _, l := range shown {
					a.stepLine(c.Key(l.seq), task, l)
				}
			})
			i = j
		}
		for _, sd := range task.Sends {
			if sd.Seq == 0 {
				a.sentBubble(c, sd.Text, sd)
			}
		}
	})
}

// quietRow is a muted line that opens something: "前面还有 12 步 ›".
func (a *App) quietRow(c *ui.Context, key, text string) bool {
	t := a.T
	r := ui.Row(c.Key("more:" + key)).Gap(t.S2).Height(26).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(text)
	r.Children(func() {
		ui.Box(c).Width(16).Shrink(0)
		tx := ui.Text(c, text).FontSize(t.SM).TextColor(t.InkMuted).AccessHidden(true)
		a.glyph(c, 12, drawChevron(t.InkMuted, false))
		if r.Hovered() {
			tx.TextColor(t.Ink)
		}
	})
	return r.Clicked()
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
	// A template that needs a target it hasn't got falls back to the bare target.
	if v, ok := tr(key); ok && (st.Target != "" || !strings.Contains(a.L.T(key), "%[1]")) {
		return v
	}
	return st.Target
}

// codeLike reports whether a step's summary is a code token (a command, a
// path, a pattern): it reads in mono on the inline code tint.
func codeLike(st Step) bool {
	switch st.Kind {
	case "ran", "read", "edited":
		return st.Target != "" && st.Act == ""
	case "searched":
		return st.Act == "" && st.Target != ""
	}
	return false
}

// stepLine is one step: a mark, a verb, its summary on one line.
func (a *App) stepLine(c *ui.Context, task *store.Task, l txLine) {
	t := a.T
	if l.thought != "" {
		ui.Row(c).Gap(t.S2).Height(26).AlignItems(ui.Center).MinWidth(0).Children(func() {
			a.glyph(c, 16, drawThought(t.InkMuted))
			ui.Text(c, a.L.T("step.label.thought")).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).Shrink(0)
			ui.Text(c, l.thought).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).Tooltip(l.thought)
		})
		return
	}
	st := *l.step
	words := a.stepWords(st)
	key := fmt.Sprintf("step:%s:%d", task.ID, l.seq)
	open := a.open[key]
	raw := ""
	if l.tool != nil {
		raw = strings.TrimRight(l.tool.Output, "\n")
		if st.Kind == "ran" || l.failed {
			if full := toolWords(l.tool); full != "" && !strings.HasPrefix(raw, full) {
				raw = strings.TrimSpace(full + "\n\n" + raw)
			}
		}
	}
	label := a.L.T("step.label." + st.Kind)
	ink, labelInk := t.InkMuted, t.InkSoft
	if l.failed {
		label, labelInk = a.L.T("step.label.error"), t.Failed.Ink
	}
	ui.Column(c).Gap(t.S1).Children(func() {
		row := ui.Row(c).Gap(t.S2).Height(26).AlignItems(ui.Center).MinWidth(0).Label(label + " " + words)
		if raw != "" {
			row.Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
		}
		if l.failed {
			row.Padding(0, t.S2, 0, t.S1).Radius(t.RadiusSM).Background(t.Failed.Surface.Alpha(0.55))
		}
		row.Children(func() {
			if l.failed {
				a.glyph(c, 16, drawCross(t.Failed.Ink))
			} else {
				a.glyph(c, 16, stepGlyph(st.Kind)(t.InkMuted))
			}
			ui.Text(c, label).FontSize(t.SM).FontWeight(600).TextColor(labelInk).Shrink(0).AccessHidden(true)
			if words != "" {
				tx := ui.Text(c, words).FontSize(t.SM).TextColor(ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(words).AccessHidden(true)
				if codeLike(st) {
					tx.Font(t.Mono).FontSize(t.MonoSM).Padding(1, 6).Radius(6).Background(t.Sunken)
				}
				if l.failed {
					tx.TextColor(t.InkSoft)
				}
				if row.Hovered() {
					tx.TextColor(t.Ink)
				}
			}
			if l.n > 1 {
				ui.Text(c, fmt.Sprintf("×%d", l.n)).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
			if raw != "" && (row.Hovered() || open || l.failed) {
				a.glyph(c, 12, drawChevron(t.InkMuted, open))
			}
		})
		if raw != "" && row.Clicked() {
			a.open[key] = !open
		}
		if open && raw != "" {
			ui.Text(c, raw).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.5).TextColor(t.InkSoft).
				Padding(t.S2, t.S3).Margin(0, 0, t.S1, 24).Radius(t.RadiusSM).Background(t.Sunken).Selectable().MaxLines(24)
		}
	})
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

func (a *App) transcriptRow(c *ui.Context, task *store.Task, ev protocol.LogEvent) {
	t := a.T
	body, _ := ev.Typed()
	switch b := body.(type) {
	case *protocol.TaskOpen:
		if strings.TrimSpace(b.Brief) == "" {
			return // opened before its brief was written (D120): the briefed one follows
		}
		// What the partner asked for (or the user, D128): its words, quoted under a small label.
		label := a.L.T("task.brief", a.S.PersonaName)
		if b.Origin == "you" {
			label = a.L.T("task.brief.you")
		}
		ui.Column(c).Gap(t.S1).Padding(0, 0, t.S2, 0).Children(func() {
			ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			ui.Text(c, b.Brief).FontSize(t.MD).LineHeight(1.55).TextColor(t.InkSoft).Selectable()
		})
	case *protocol.TaskEvent:
		switch {
		case b.Role == "user" && (b.From == "partner" || ev.Origin == protocol.OriginPartner):
			// The partner talking to the task: its words, not the user's.
			ui.Column(c).Gap(t.S1).Padding(t.S2, 0).Children(func() {
				ui.Text(c, a.L.T("task.from.partner", a.S.PersonaName)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				ui.Text(c, b.Text).FontSize(t.MD).LineHeight(1.55).TextColor(t.InkSoft).Selectable()
			})
		case b.Role == "user":
			text := b.Text
			if label, ok := goRelay(text); ok {
				// The user's Go, relayed to the task: said as the user said it.
				text = a.shortGo(label)
			}
			ui.Column(c).Padding(t.S1, 0).Children(func() { a.sentBubble(c, text, task.SendFor(ev.Seq)) })
		case b.Role == "system":
			a.systemLine(c, b)
		case b.Text != "":
			ui.Column(c).Padding(t.S2, 0).Children(func() { markdown.View(c, b.Text, &a.mdTask) })
		}
	case *protocol.Checkpoint:
		// Saved progress: a tiny quiet mark on the timeline.
		ui.Row(c).Gap(t.S2).Height(24).AlignItems(ui.Center).MinWidth(0).Children(func() {
			a.glyph(c, 16, drawFlag(t.Faint))
			ui.Text(c, a.L.T("task.checkpoint", b.Text)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).Tooltip(b.Text)
			ui.Text(c, clock(ev.TS)).FontSize(t.XS).TextColor(t.Faint).FontFeatures("tnum").Shrink(0)
		})
	case *protocol.Report:
		// An earlier word to the partner (the last one is the outcome).
		ui.Column(c).Gap(t.S1).Padding(t.S2, 0).Children(func() {
			ui.Text(c, a.reportLabel(b)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			ui.Text(c, b.Summary).FontSize(t.MD).LineHeight(1.55).TextColor(t.InkSoft).Selectable()
		})
	}
}

// systemLine is a harness's own note that says something to a person (it
// moved, its machine dropped, a delivery failed): one quiet line. A turn
// that failed is an error line.
func (a *App) systemLine(c *ui.Context, b *protocol.TaskEvent) {
	t := a.T
	text := strings.TrimSpace(b.Text)
	failed := strings.HasPrefix(text, "turn failed") || strings.HasPrefix(text, "delivery failed") || strings.HasPrefix(text, "failed to") || strings.HasPrefix(text, "event stream error")
	ui.Row(c).Gap(t.S2).Height(26).AlignItems(ui.Center).MinWidth(0).Children(func() {
		if failed {
			a.glyph(c, 16, drawCross(t.Failed.Ink))
			ui.Text(c, a.L.T("step.label.error")).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink).Shrink(0)
		} else {
			a.glyph(c, 16, drawDot(t.Faint))
		}
		ui.Text(c, text).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1).Tooltip(text)
	})
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

// taskBar is the quiet line over the composer: who is doing it (its
// coin, the agent and the model), then where it stands and for how long.
func (a *App) taskBar(c *ui.Context, task *store.Task) {
	t := a.T
	att := task.Attention()
	who := a.bodyLine(task)
	started := store.ParseTime(task.OpenedAt)
	state := a.stateLabel(att)
	when := ""
	switch {
	case att == protocol.Working && !started.IsZero():
		when = elapsed(a.Now().Sub(started))
		c.After(time.Second)
	case finished(task) && !started.IsZero():
		if end := lastAt(task); end.After(started) {
			when = a.L.T("task.footer.took", a.duration(end.Sub(started)))
		}
	case task.OpenedAt != "":
		when = a.L.T("task.opened", a.ago(task.OpenedAt))
	}
	ui.Row(c.Key("footer")).Justify(ui.Center).Padding(t.S2, t.S5, 0, t.S5).Children(func() {
		ui.Row(c).Grow(1).MaxWidth(convWidth).Gap(t.S2).AlignItems(ui.Center).Padding(0, t.S3).Children(func() {
			if h := task.Harness(); h != "" {
				a.coin(c, h, 20, coinMotionOf(att))
			}
			if who != "" {
				ui.Text(c, who).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1)
			}
			ui.Spacer(c)
			ui.Text(c, state).FontSize(t.XS).FontWeight(700).TextColor(t.State(string(att)).Ink).Shrink(0)
			if when != "" {
				ui.Text(c, "· "+when).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
			}
		})
	})
}
