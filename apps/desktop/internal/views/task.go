package views

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/editor"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/diff"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// task is an opened task, at conductor depth: one centered column on
// the conversation's measure, read top to bottom (D72). Where it stands in
// words; a pending ask; the outcome, said once, with how it knows and what
// to do next; what it did, its tool calls folded into one line per
// stretch; its changes as a list of files (a file's diff opens in place,
// none by default); then a quiet Details disclosure. The composer to talk
// to the task stays at the bottom, as in the conversation.
func (a *App) task(c *ui.Context) {
	t := a.T
	task := a.S.Task(a.TaskID)
	if task == nil {
		task = &store.Task{ID: a.TaskID}
	}
	a.taskHeader(c, task)
	ui.Scroll(c.Key("taskpage:" + task.ID)).Grow(1).MinHeight(0).Children(func() {
		ui.Row(c).Justify(ui.Center).Padding(t.S5, t.S5, t.S6, t.S5).Children(func() {
			ui.Column(c).Grow(1).MaxWidth(convWidth).MinWidth(0).Gap(t.S6).Children(func() {
				ui.Column(c).Gap(t.S4).Children(func() {
					a.taskStanding(c, task)
					if d := a.S.PendingDecision(task.ID); d != nil {
						if d.Resolved != nil || d.Pending != "" {
							a.decisionAnswered(c, d)
						} else {
							a.decisionCard(c, d, task.ID)
						}
					}
					if finished(task) {
						a.outcome(c, task)
					}
				})
				a.whatItDid(c, task)
				a.changes(c, task)
				a.taskDetails(c, task)
			})
		})
	})
	a.taskComposer(c, task)
}

// taskHeader is the breadcrumb and the task's title; at its end, what can
// be done to the task itself (pause, drop) as quiet buttons. No chips: the
// state is in words under it, the rest is in Details.
func (a *App) taskHeader(c *ui.Context, task *store.Task) {
	a.chrome(c, "task", func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.crumb(c, a.L.T("nav.onhand"), RouteOnHand)
		title := task.Title()
		if title == "" {
			title = a.L.T("task.unknown")
		}
		a.chromeTitle(c, title)
	}, func() {
		a.taskActions(c, task)
	})
}

// taskActions are what the user can do to the task itself while it is
// open: pause it while it works, drop it (undoable for UndoWindow). Try
// again for a task that ended sits with its outcome.
func (a *App) taskActions(c *ui.Context, task *store.Task) {
	t := a.T
	att := task.Attention()
	switch att {
	case protocol.Failed, protocol.Dropped, protocol.Done, protocol.DoneClaimed, protocol.Superseded:
		return
	}
	if att == protocol.Working && a.button(c, a.L.T("task.action.pause"), btnText, t.ControlSM, t.Chrome) {
		a.TaskAction(task.ID, "interrupt")
	}
	if a.button(c, a.L.T("task.action.drop"), btnText, t.ControlSM, t.Chrome) {
		a.DropTask(task.ID)
		title := task.Title()
		c.AddToast(ui.Toast{ID: "undo:" + task.ID, Title: a.L.T("undo.dropped", title), Timeout: UndoWindow,
			Action: a.L.T("undo.action"), OnAction: a.UndoDrop})
	}
}

// taskStanding is where the task stands, in words: the state in its ink,
// then what it is doing or waiting for, then when it started.
func (a *App) taskStanding(c *ui.Context, task *store.Task) {
	t := a.T
	att := task.Attention()
	detail := ""
	switch {
	case task.Browsing() != "":
		detail = a.L.T("browser.looking", task.Browsing())
	case att == protocol.Blocked:
		detail = a.waitReason(task)
	case !finished(task):
		if rep := task.Report(); rep != nil {
			detail = summaryLine(rep.Summary)
		}
	}
	ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
		ui.Box(c).Size(18, 18).Draw(stateMark(att)(t.State(string(att)).Ink)).Shrink(0)
		ui.Text(c, a.stateLabel(att)).FontSize(t.MD).FontWeight(800).TextColor(t.State(string(att)).Ink)
		if detail != "" {
			ui.Text(c, "· "+detail).FontSize(t.MD).TextColor(t.InkSoft).MinWidth(0)
		}
		if task.OpenedAt != "" {
			ui.Text(c, "· "+a.L.T("task.opened", a.ago(task.OpenedAt))).FontSize(t.MD).TextColor(t.InkMuted)
		}
	})
}

// outcome is the task's result, said once: its report in the partner's
// size, how it knows on one quiet line, what went out, then what to do
// next (Merge / Open draft PR; Try again for one that didn't work).
func (a *App) outcome(c *ui.Context, task *store.Task) {
	t := a.T
	rep := task.Report()
	ui.Column(c.Key("outcome")).Gap(t.S3).Children(func() {
		if rep != nil && rep.Summary != "" {
			ui.Text(c, rep.Summary).FontSize(t.PartnerSize).LineHeight(1.6).Selectable()
		}
		evs := task.Evidence
		if rep != nil && len(rep.Evidence) > 0 {
			evs = rep.Evidence
		}
		if len(evs) > 0 {
			a.proofLine(c, task, evs, false)
		}
		a.sentLine(c, task)
		if task.Attention() == protocol.Failed {
			ui.Row(c).Children(func() {
				if a.buttonFor(c, a.L.T("task.action.retry"), task.Title(), btnSecondary, t.ControlMD, t.Bg) {
					a.TaskAction(task.ID, "reopen")
				}
			})
			return
		}
		a.resultActions(c, task)
	})
}

// decisionAnswered is an ask already answered: one quiet line.
func (a *App) decisionAnswered(c *ui.Context, d *store.DecisionState) {
	t := a.T
	opt := d.Pending
	if d.Resolved != nil {
		opt = d.Resolved.Option
	}
	msg := a.L.T("decision.resolved." + opt)
	if opt == "reply" {
		msg = a.L.T("decision.resolved.reply", "")
	}
	ui.Row(c.Key("answered")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		a.glyph(c, 16, drawCheck(t.InkMuted))
		ui.Text(c, a.L.T("decision.answered", strings.TrimRight(msg, "：: "), d.AnsweredAt.Local().Format("15:04"))).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
		ui.Text(c, d.Question).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Grow(1).MinWidth(0)
	})
}

// sectionTitle heads a section of the opened task.
func (a *App) sectionTitle(c *ui.Context, text string) ui.Element {
	return ui.Text(c, text).FontSize(a.T.XL).FontWeight(800).LetterSpacing(-0.2)
}

// ---------- what it did ----------

// step is one beat of what the task did: an event, or a stretch of tool
// calls that went fine, folded into one line.
type step struct {
	ev    protocol.LogEvent
	tools []*protocol.ToolCall
	seq   int64
}

// steps groups the task's events: consecutive tool calls that went fine
// fold into one step; a failed one stands on its own, in words.
func (a *App) steps(task *store.Task) []step {
	var out []step
	// The latest report is said above: the outcome of a finished task,
	// else the line of where it stands.
	last := int64(-1)
	for _, ev := range task.Events {
		if ev.Kind == protocol.KindReport {
			last = ev.Seq
		}
	}
	for _, ev := range task.Events {
		switch ev.Kind {
		case protocol.KindTaskOpen, protocol.KindCheckpoint:
		case protocol.KindReport:
			if ev.Seq == last {
				continue
			}
		case protocol.KindTaskEvent:
			body, _ := ev.Typed()
			b, _ := body.(*protocol.TaskEvent)
			if b == nil {
				continue
			}
			if b.Tool != nil && (b.Tool.OK == nil || *b.Tool.OK) {
				if n := len(out); n > 0 && out[n-1].tools != nil {
					out[n-1].tools = append(out[n-1].tools, b.Tool)
					continue
				}
				out = append(out, step{tools: []*protocol.ToolCall{b.Tool}, seq: ev.Seq})
				continue
			}
			if b.Role == "system" && b.Text == "" && b.Usage != nil {
				continue // a turn's usage alone says nothing here
			}
		default:
			continue
		}
		out = append(out, step{ev: ev, seq: ev.Seq})
	}
	return out
}

func (a *App) whatItDid(c *ui.Context, task *store.Task) {
	t := a.T
	steps := a.steps(task)
	ui.Column(c.Key("did")).Gap(t.S3).Children(func() {
		a.sectionTitle(c, a.L.T("task.transcript"))
		if len(steps) == 0 && len(task.Sends) == 0 {
			ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		}
		for _, st := range steps {
			if st.tools != nil {
				a.toolFold(c.Key(st.seq), task, st)
				continue
			}
			a.transcriptRow(c.Key(st.seq), task, st.ev)
		}
		for _, sd := range task.Sends {
			if sd.Seq == 0 {
				a.sentBubble(c, sd.Text, sd)
			}
		}
	})
}

// toolFold is a stretch of tool calls as one line ("Ran 2 commands,
// edited 1 file ›") that opens in place onto each call.
func (a *App) toolFold(c *ui.Context, task *store.Task, st step) {
	t := a.T
	key := fmt.Sprintf("fold:%s:%d", task.ID, st.seq)
	open := a.open[key]
	ui.Column(c).Gap(t.S2).Children(func() {
		l := ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(a.foldLine(st.tools))
		l.Children(func() {
			ui.Text(c, "›").FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Rotate(map[bool]float32{true: 90, false: 0}[open]).AccessHidden(true)
			tx := ui.Text(c, a.foldLine(st.tools)).FontSize(t.SM).TextColor(t.InkMuted).AccessHidden(true)
			if l.Hovered() {
				tx.TextColor(t.Ink)
			}
		})
		if l.Clicked() {
			a.open[key] = !open
		}
		if open {
			ui.Column(c).Gap(t.S1).Padding(0, 0, 0, t.S4).Children(func() {
				for i, tool := range st.tools {
					a.toolRow(c.Key(i), tool)
				}
			})
		}
	})
}

// foldLine counts a stretch of tool calls in words: commands run, files
// edited, files read, and other tools.
func (a *App) foldLine(tools []*protocol.ToolCall) string {
	ran, other := 0, 0
	edited, read := map[string]bool{}, map[string]bool{}
	for _, tool := range tools {
		var in map[string]any
		_ = json.Unmarshal(tool.Input, &in)
		path, _ := in["file_path"].(string)
		if path == "" {
			path, _ = in["path"].(string)
		}
		switch toolName(tool.Name) {
		case "Bash", "shell", "exec_command":
			ran++
		case "Edit", "Write", "MultiEdit", "apply_patch":
			edited[path] = true
		case "Read":
			read[path] = true
		default:
			other++
		}
	}
	var parts []string
	count := func(key string, n int) {
		if n == 1 {
			parts = append(parts, a.L.T(key+".one"))
		} else if n > 1 {
			parts = append(parts, a.L.T(key, n))
		}
	}
	count("task.fold.ran", ran)
	count("task.fold.edited", len(edited))
	count("task.fold.read", len(read))
	count("task.fold.other", other)
	s := strings.Join(parts, a.L.T("task.fold.and"))
	if r := []rune(s); len(r) > 0 {
		s = strings.ToUpper(string(r[0])) + string(r[1:])
	}
	return s
}

func (a *App) transcriptRow(c *ui.Context, task *store.Task, ev protocol.LogEvent) {
	t := a.T
	body, _ := ev.Typed()
	switch b := body.(type) {
	case *protocol.TaskOpen:
		// What the partner asked for: its words, quoted under a small label.
		ui.Column(c).Gap(t.S1).Children(func() {
			ui.Text(c, a.L.T("task.brief", a.S.PersonaName)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			ui.Text(c, b.Brief).FontSize(t.MD).LineHeight(1.55).TextColor(t.InkSoft).Selectable()
		})
	case *protocol.TaskEvent:
		switch {
		case b.Tool != nil:
			// A step that didn't work stands on its own, in words.
			ui.Column(c).Gap(t.S1).Children(func() {
				a.mark(c, drawCross, a.L.T("task.step.failed", toolWords(b.Tool)), t.Failed.Ink)
				if out := strings.TrimSpace(b.Tool.Output); out != "" {
					ui.Text(c, firstLine(out)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Padding(0, 0, 0, t.S5).Selectable()
				}
			})
		case b.Role == "user" && (b.From == "runner" || b.From == "" && strings.HasPrefix(b.Text, `Start the task "`)):
			// The runner's own kickoff, not something anyone said.
		case b.Role == "user" && (b.From == "partner" || ev.Origin == protocol.OriginPartner):
			// The partner talking to the task: its words, not the user's.
			ui.Column(c).Gap(t.S1).Children(func() {
				ui.Text(c, a.L.T("task.from.partner", a.S.PersonaName)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				ui.Text(c, b.Text).FontSize(t.MD).LineHeight(1.55).TextColor(t.InkSoft).Selectable()
			})
		case b.Role == "user":
			a.sentBubble(c, b.Text, task.SendFor(ev.Seq))
		case b.Role == "system":
			a.systemLine(c, b)
		case b.Text != "":
			ui.Column(c).Children(func() { markdown.View(c, b.Text, &a.mdTask) })
		}
	case *protocol.Checkpoint:
		ui.Text(c, a.L.T("task.checkpoint", b.Text)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
	case *protocol.Report:
		// An earlier word to the partner (the last one is the outcome).
		ui.Column(c).Gap(t.S1).Children(func() {
			ui.Text(c, a.reportLabel(b)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			ui.Text(c, b.Summary).FontSize(t.MD).LineHeight(1.55).TextColor(t.InkSoft).Selectable()
		})
	}
}

func (a *App) reportLabel(r *protocol.Report) string {
	key := "task.report"
	switch r.State {
	case "needs_input":
		key = "task.report.needs_input"
	case "done":
		key = "task.report.done"
	case "blocked":
		key = "task.report.blocked"
	case "failed":
		key = "task.report.failed"
	}
	return a.L.T(key, a.S.PersonaName)
}

// taskComposer is the box to talk to the task directly, at the bottom of
// the window on the conversation's measure.
func (a *App) taskComposer(c *ui.Context, task *store.Task) {
	t := a.T
	if a.held != nil && a.held.taskID == task.ID {
		a.aboveComposer(c, func() { a.heldLine(c) })
	}
	draft := a.taskDrafts[task.ID]
	ui.Row(c).Justify(ui.Center).Padding(t.S2, t.S5, t.S5, t.S5).Children(func() {
		ui.Row(c).Grow(1).MaxWidth(convWidth).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S2, t.S2, t.S5).
			Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Children(func() {
			ta := ui.TextArea(c.Key("taskcomposer:"+task.ID), &draft).Lines(1, 6).MinHeight(0).Placeholder(a.L.T("composer.task")).
				Label(a.L.T("composer.task")).
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S3, 0).Grow(1).FontSize(t.MD).
				OnTextKey(func(k ui.TextKey) bool {
					if k.Key == ui.KeyEnter && k.Mods == 0 {
						if a.SendToTask(task.ID, k.Text()) {
							k.SetText("")
						}
						return true
					}
					return false
				})
			if a.focusComposer {
				ta.Focus()
				a.focusComposer = false
			}
			if a.iconButton(c, a.L.T("composer.send"), t.ControlLG, btnAccent, drawSend) {
				if a.SendToTask(task.ID, draft) {
					draft = ""
				}
			}
		})
	})
	a.taskDrafts[task.ID] = draft
}

// sentBubble is what the user said straight into the task, with how it
// was delivered: steered into this turn, as the next turn, or queued.
func (a *App) sentBubble(c *ui.Context, text string, sd *store.Send) {
	t := a.T
	note, failed, waiting := "", false, false
	if sd != nil {
		switch {
		case sd.Failed != "":
			note, failed = a.L.T("delivery.failed", sd.Failed), true
		case sd.Delivered != "":
			note = a.L.T("delivery." + string(sd.Delivered))
		case sd.Seq == 0 && a.Now().Sub(sd.At) < 4*time.Second:
			// No ack yet. A server without "sent" acks never says; after a
			// few seconds the label just goes.
			note, waiting = a.L.T("delivery.sending"), true
			c.After(4*time.Second - a.Now().Sub(sd.At))
		}
	}
	ui.Column(c).Gap(t.S1).AlignItems(ui.End).Children(func() {
		r := t.BubbleRadius
		b := ui.Text(c, text).FontSize(t.MD).LineHeight(1.5).TextColor(t.OnUserBubble).Background(t.UserBubble).
			Padding(9, t.S3).Radius(r[0]*0.8, r[1]*0.8, r[2], r[3]*0.8).MaxWidthPercent(80).Selectable()
		if waiting {
			b.Opacity(0.7)
		}
		if note == "" {
			return
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			col := t.InkMuted
			if failed {
				col = t.Failed.Ink
			} else if !waiting {
				ui.Box(c).Size(16, 16).Radius(6).Background(t.Done.Surface).Draw(drawCheck(t.Done.Ink))
			}
			ui.Text(c, note).FontSize(t.XS).FontWeight(700).TextColor(col)
		})
	})
}

// systemLine is a harness's own note, as a turn ending: a thin divider,
// in words for people.
func (a *App) systemLine(c *ui.Context, b *protocol.TaskEvent) {
	t := a.T
	text := b.Text
	if strings.HasPrefix(text, "Looking at ") {
		text = a.L.T("browser.looking", strings.TrimPrefix(text, "Looking at "))
	}
	switch strings.ToLower(strings.TrimSpace(text)) {
	case "session started":
		text = a.L.T("task.session.started")
	case "turn completed", "turn complete", "turn ended":
		text = a.L.T("task.turn.done")
	}
	if u := b.Usage; u != nil && u.InputTokens+u.OutputTokens > 0 {
		text += " · " + tokens(u.InputTokens+u.CacheRead+u.CacheWrite) + " / " + tokens(u.OutputTokens)
	}
	ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
		ui.Text(c, text).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
	})
}

// isLink reports whether an evidence ref opens somewhere.
func isLink(ref string) bool {
	return strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "file:") || strings.HasPrefix(ref, "/")
}

// toolRow is one tool call inside an open fold: its command in mono; a
// click shows its output.
func (a *App) toolRow(c *ui.Context, tool *protocol.ToolCall) {
	t := a.T
	col := ui.Column(c).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(toolSummary(tool)).Focusable()
	open := ui.Local(col, "open", func() bool { return false })
	col.Children(func() {
		tx := ui.Text(c, toolSummary(tool)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).MinWidth(0).MaxLines(2).Padding(t.S1, 0).AccessHidden(true)
		if col.Hovered() {
			tx.TextColor(t.Ink)
		}
		if *open && tool.Output != "" {
			ui.Text(c, strings.TrimRight(tool.Output, "\n")).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.5).TextColor(t.InkMuted).
				Padding(0, 0, t.S2, t.S3).Selectable().MaxLines(40)
		}
	})
	if col.Clicked() {
		*open = !*open
	}
}

// toolName is a tool's name for people: an MCP tool loses its
// mcp__server__ prefix.
func toolName(name string) string {
	if strings.HasPrefix(name, "mcp__") {
		if i := strings.LastIndex(name, "__"); i > 4 {
			return name[i+2:]
		}
	}
	return name
}

// toolWords is what a tool call did, without the tool's name when its
// input says it (a command, a path).
func toolWords(tool *protocol.ToolCall) string {
	s := toolSummary(tool)
	if i := strings.Index(s, "  "); i >= 0 {
		return s[i+2:]
	}
	return s
}

func toolSummary(tool *protocol.ToolCall) string {
	s := toolName(tool.Name)
	if len(tool.Input) == 0 {
		return s
	}
	var in map[string]any
	if json.Unmarshal(tool.Input, &in) == nil {
		for _, k := range []string{"command", "cmd", "file_path", "path", "pattern", "url", "query"} {
			if v, ok := in[k].(string); ok && v != "" {
				return s + "  " + firstLine(v)
			}
		}
	}
	var str string
	if json.Unmarshal(tool.Input, &str) == nil {
		return s + "  " + firstLine(str)
	}
	return s + "  " + firstLine(string(tool.Input))
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i] + " …"
	}
	if len(s) > 120 {
		s = s[:120] + "…"
	}
	return s
}

// ---------- changes (diff) ----------

// diffPane is a task's worktree diff, read in the background.
type diffPane struct {
	loading, again bool
	err            string
	files          []diffFile
	at             time.Time
	worktree       string
}

type diffFile struct {
	name           string
	added, deleted int
	state          *editor.DiffState
	binary         bool
}

// refreshDiff reads the open task's worktree diff again, unless a read is
// running (then once more after it).
func (a *App) refreshDiff(id string) {
	task := a.S.Task(id)
	if task == nil {
		return
	}
	p := task.Place()
	// A remote Ducter's worktree path is on the server: never run git on that
	// path here (it may name some other repo on this Mac, chosen by a model).
	if p.Kind != "repo" || p.Worktree == "" || !a.onThisMachine() {
		return
	}
	pane := a.diffs[id]
	if pane == nil {
		pane = &diffPane{}
		a.diffs[id] = pane
	}
	if pane.loading {
		pane.again = true
		return
	}
	pane.loading, pane.worktree = true, p.Worktree
	work := func() (diff.Result, error) { return diff.Worktree(p.Worktree, p.BaseBranch) }
	done := func(r diff.Result, err error) {
		pane.loading = false
		pane.at = a.Now()
		if err != nil {
			pane.err = err.Error()
		} else {
			pane.err = ""
			pane.files = parseFiles(r.Patch)
		}
		if pane.again {
			pane.again = false
			a.refreshDiff(id)
		}
	}
	if a.Win == nil {
		done(work())
		return
	}
	go func() {
		r, err := work()
		a.Win.Update(func() { done(r, err) })
	}()
}

func parseFiles(patch string) []diffFile {
	fps, err := editor.ParsePatch(patch)
	if err != nil {
		return nil
	}
	var out []diffFile
	for _, fp := range fps {
		name := fp.NewName
		if name == "" {
			name = fp.OldName
		}
		f := diffFile{name: name, binary: fp.Binary}
		for _, h := range fp.Hunks {
			for _, l := range h.Lines {
				if l == "" {
					continue
				}
				switch l[0] {
				case '+':
					f.added++
				case '-':
					f.deleted++
				}
			}
		}
		if !fp.Binary {
			d := &editor.DiffState{Layout: editor.DiffUnified, FitContent: true, NoScrollbars: true}
			d.SetPatch(fp)
			f.state = d
		}
		out = append(out, f)
	}
	return out
}

// changes is the task's changes as a list of files, each with what it
// added and removed; a file opens its diff in place, full width. No diff
// shows by default (D72), and a task that works in no repo has no section.
func (a *App) changes(c *ui.Context, task *store.Task) {
	t := a.T
	p := task.Place()
	if p.Kind != "repo" || p.Worktree == "" {
		return
	}
	pane := a.diffs[task.ID]
	ui.Column(c.Key("changes")).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.sectionTitle(c, a.L.T("task.side.changes"))
			if pane != nil && len(pane.files) > 0 {
				added, deleted := 0, 0
				for _, f := range pane.files {
					added += f.added
					deleted += f.deleted
				}
				ui.Text(c, a.filesLabel(len(pane.files))).FontSize(t.SM).TextColor(t.InkMuted)
				ui.Text(c, fmt.Sprintf("+%d", added)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Done.Ink)
				ui.Text(c, fmt.Sprintf("−%d", deleted)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Failed.Ink)
			}
			ui.Spacer(c)
			if pane != nil && pane.loading {
				ui.Spinner(c).Size(16, 16)
			}
			if pane != nil && a.button(c, a.L.T("task.changes.refresh"), btnText, t.ControlSM, t.Bg) {
				a.refreshDiff(task.ID)
			}
		})
		switch {
		case pane == nil || (pane.loading && pane.files == nil):
			ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		case pane.err != "":
			ui.Text(c, a.L.T("task.changes.error", pane.err)).FontSize(t.SM).TextColor(t.InkMuted)
		case len(pane.files) == 0:
			ui.Text(c, a.L.T("task.changes.none")).FontSize(t.SM).TextColor(t.InkMuted)
		default:
			ui.Column(c).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Clip().
				Dividers(1, t.LineSoft).Children(func() {
				for i := range pane.files {
					a.fileRow(c.Key(pane.files[i].name), task, &pane.files[i])
				}
			})
		}
	})
}

// fileRow is one changed file: its path, +added −deleted, and its diff
// under it once opened.
func (a *App) fileRow(c *ui.Context, task *store.Task, f *diffFile) {
	t := a.T
	key := "file:" + task.ID + ":" + f.name
	open := a.open[key]
	ui.Column(c).Children(func() {
		row := ui.Row(c).Gap(t.S3).Padding(t.S3, t.S4).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).
			Label(f.name).Focusable()
		if open || row.Hovered() {
			row.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
		}
		row.Children(func() {
			ui.Text(c, "›").FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Rotate(map[bool]float32{true: 90, false: 0}[open]).AccessHidden(true)
			ui.Text(c, f.name).Font(t.Mono).FontSize(t.MonoSM).Grow(1).MinWidth(0).SingleLine().AccessHidden(true)
			ui.Text(c, fmt.Sprintf("+%d", f.added)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Done.Ink)
			ui.Text(c, fmt.Sprintf("−%d", f.deleted)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Failed.Ink)
		})
		if row.Clicked() {
			a.open[key] = !open
		}
		if open && f.state != nil {
			ui.Column(c).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).Children(func() {
				editor.DiffView(c, f.state).FillWidth()
			})
		}
	})
}

// ---------- details ----------

// taskDetails is a quiet disclosure at the bottom: who is doing it and
// why, where (the repo's name and branch, its path as the user named it),
// the saved progress, what went out, and the usage. A row with nothing to
// say is left out.
func (a *App) taskDetails(c *ui.Context, task *store.Task) {
	t := a.T
	key := "details:" + task.ID
	open := a.open[key]
	ui.Column(c.Key("details")).Gap(t.S3).Children(func() {
		l := ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(a.L.T("task.side.details"))
		l.Children(func() {
			tx := ui.Text(c, a.L.T("task.side.details")).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).AccessHidden(true)
			ui.Text(c, "›").FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Rotate(map[bool]float32{true: 90, false: 0}[open]).AccessHidden(true)
			if l.Hovered() {
				tx.TextColor(t.Ink)
			}
		})
		if l.Clicked() {
			a.open[key] = !open
		}
		if !open {
			return
		}
		row := func(label string, body func()) {
			ui.Row(c.Key(label)).Gap(t.S4).AlignItems(ui.Start).Children(func() {
				ui.Text(c, label).FontSize(t.SM).TextColor(t.InkMuted).Width(132).Shrink(0)
				ui.Column(c).Gap(t.S1).Grow(1).MinWidth(0).Children(body)
			})
		}
		value := func(s string) { ui.Text(c, s).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Selectable() }
		if b := a.bodyLine(task); b != "" {
			row(a.L.T("task.dossier.body"), func() {
				value(b)
				if r := task.BodyReason(); r != "" {
					value(r)
				}
			})
		}
		p := task.Place()
		if line := a.placeLine(p); line != "" {
			row(a.L.T("task.dossier.where"), func() {
				value(line)
				if s := firstNonEmpty(p.RepoPath, p.Path); s != "" {
					ui.Text(c, s).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).Selectable()
				}
			})
		}
		if len(task.Checkpoints) > 0 {
			row(a.L.T("task.dossier.checkpoints"), func() {
				for _, cp := range task.Checkpoints {
					ui.Row(c.Key(cp.Seq)).Gap(t.S3).Children(func() {
						ui.Text(c, cp.Text).FontSize(t.SM).TextColor(t.InkSoft).Grow(1).MinWidth(0)
						ui.Text(c, clock(cp.TS)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum")
					})
				}
			})
		}
		if acts := task.Outside(); task.HistoryLoaded && len(acts) > 0 {
			row(a.L.T("outside.title"), func() {
				for _, act := range acts {
					ui.Text(c.Key(act.Seq), act.Command).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.45).TextColor(t.InkSoft).Selectable().MaxLines(3)
				}
			})
		}
		if u := task.Usage; u.InputTokens+u.OutputTokens+u.CacheRead > 0 {
			row(a.L.T("task.dossier.usage"), func() {
				value(a.L.T("task.usage", tokens(u.InputTokens+u.CacheRead+u.CacheWrite), tokens(u.OutputTokens)))
			})
		}
	})
}

// tokens is a token count, short: 812, 12.4k, 1.2M.
func tokens(n int64) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1e6)
	case n >= 10_000:
		return fmt.Sprintf("%.0fk", float64(n)/1e3)
	case n >= 1000:
		return fmt.Sprintf("%.1fk", float64(n)/1e3)
	}
	return fmt.Sprint(n)
}

// filesLabel counts changed files: "2 files", "1 file".
func (a *App) filesLabel(n int) string {
	if n == 1 {
		return a.L.T("task.files.one")
	}
	return a.L.T("task.files", n)
}

// changesLabel counts changed files, singular for one.
func (a *App) changesLabel(n int) string {
	if n == 1 {
		return a.L.T("task.changes.one")
	}
	return a.L.T("task.changes", n)
}
