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

// task is an opened task, at conductor depth.
func (a *App) task(c *ui.Context) {
	task := a.S.Task(a.TaskID)
	if task == nil {
		task = &store.Task{ID: a.TaskID}
	}
	ui.Column(c).Grow(1).Gap(14).Padding(16, 24, 24, 24).Children(func() {
		a.taskHeader(c, task)
		if d := a.S.PendingDecision(task.ID); d != nil {
			a.decisionBanner(c, d)
		}
		ui.Row(c).Grow(1).Gap(14).AlignItems(ui.Stretch).MinHeight(0).Children(func() {
			a.transcript(c, task)
			a.changes(c, task)
			ui.Scroll(c).Grow(1).Basis(280).MinWidth(0).Children(func() {
				ui.Column(c).Gap(14).Padding(0, 0, 6, 0).Children(func() { a.dossier(c, task) })
			})
		})
	})
}

func (a *App) taskHeader(c *ui.Context, task *store.Task) {
	t := a.T
	ui.Row(c).Gap(12).Wrap().AlignItems(ui.Center).Children(func() {
		ui.Row(c).Gap(8).Grow(1).MinWidth(0).AlignItems(ui.Center).Children(func() {
			crumb := func(label string, to Route) {
				l := ui.Text(c.Key(label), label).FontSize(14).FontWeight(700).TextColor(t.InkMuted).Cursor(ui.CursorPointer).Role(ui.RoleLink)
				if l.Hovered() {
					l.TextColor(t.Ink)
				}
				if l.Clicked() {
					a.Route = to
				}
				ui.Text(c, "/").FontSize(14).TextColor(t.Line.Mix(t.InkMuted, 0.4))
			}
			crumb(a.L.T("nav.conversation"), RouteConversation)
			crumb(a.L.T("nav.onhand"), RouteOnHand)
			title := task.Title()
			if title == "" {
				title = a.L.T("task.unknown")
			}
			ui.Text(c, title).FontSize(20).FontWeight(800).SingleLine().Shrink(1)
			a.stateChip(c, task.Attention())
		})
		if h := task.Harness(); h != "" {
			ui.Row(c).Gap(8).Height(44).Padding(0, 14).Radius(t.RadiusSM).Background(t.Surface).
				Shadow(0, 3, 0, 0, t.PressCard.Color).AlignItems(ui.Center).Children(func() {
				ui.Box(c).Size(22, 22).Radius(7).Background(t.Ink).Center().Children(func() {
					ui.Text(c, harnessBadge(h)).Font(t.Mono).FontSize(10).TextColor(t.OnUserBubble)
				})
				ui.Text(c, a.bodyLine(task)).FontSize(14).FontWeight(700)
			})
		}
		place := task.Place()
		ui.Row(c).Gap(8).Height(44).Padding(0, 14).Radius(t.RadiusSM).Background(t.SurfaceSunken).AlignItems(ui.Center).Children(func() {
			if place.Kind != "none" && place.Kind != "" {
				ui.Box(c).Size(8, 8).Radius(4).Background(t.Done.Strong)
			}
			ui.Text(c, a.placeLine(place)).FontSize(t.SM).FontWeight(700)
		})
		if p := task.Project(); p != "" {
			a.pill(c, p)
		}
		a.taskActions(c, task)
	})
}

// taskActions are what the user can do to the task itself: pause it while
// it works, drop it (undoable for UndoWindow), or try again once it ended.
func (a *App) taskActions(c *ui.Context, task *store.Task) {
	t := a.T
	att := task.Attention()
	switch att {
	case protocol.Failed, protocol.Dropped:
		if a.button(c, a.L.T("task.action.retry"), btnQuiet, 44, t.Surface) {
			a.TaskAction(task.ID, "reopen")
		}
		return
	case protocol.Done, protocol.Superseded:
		return
	}
	if att == protocol.Working && a.button(c, a.L.T("task.action.pause"), btnQuiet, 44, t.Surface) {
		a.TaskAction(task.ID, "interrupt")
	}
	if a.button(c, a.L.T("task.action.drop"), btnText, 44, t.Surface) {
		a.DropTask(task.ID)
		title := task.Title()
		c.AddToast(ui.Toast{ID: "undo:" + task.ID, Title: a.L.T("undo.dropped", title), Timeout: UndoWindow,
			Action: a.L.T("undo.action"), OnAction: a.UndoDrop})
	}
}

func (a *App) decisionBanner(c *ui.Context, d *store.DecisionState) {
	t := a.T
	if d.Resolved != nil || d.Pending != "" {
		// Answered: one quiet line, not the whole ask again.
		opt := d.Pending
		if d.Resolved != nil {
			opt = d.Resolved.Option
		}
		msg := a.L.T("decision.resolved." + opt)
		if opt == "reply" {
			msg = a.L.T("decision.resolved.reply", "")
		}
		ui.Row(c.Key("banner")).Gap(10).Padding(10, 16).Radius(16).Background(t.SurfaceSunken).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Size(20, 20).Radius(7).Background(t.Done.Surface).Draw(drawCheck(t.Done.Ink)).Shrink(0)
			ui.Text(c, a.L.T("decision.answered", strings.TrimRight(msg, "：: "), d.AnsweredAt.Local().Format("15:04"))).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
			ui.Text(c, d.Question).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Grow(1).MinWidth(0)
		})
		return
	}
	ui.Row(c.Key("banner")).Gap(14).Wrap().AlignItems(ui.Center).Padding(12, 14, 12, 20).Radius(20).Background(t.NeedsYou.Surface).Children(func() {
		ui.Column(c).Grow(1).Basis(300).Gap(2).Children(func() {
			ui.Text(c, d.Question).FontSize(t.MD).FontWeight(700)
			if d.Resolved == nil {
				ui.Text(c, a.defaultLine(c, d)).FontSize(t.SM).TextColor(t.NeedsYou.Ink)
			}
		})
		ui.Column(c).Children(func() {
			a.decisionButtons(c, d, decisionStyle{height: 44, quietBg: t.Surface})
		})
	})
}

// ---------- transcript ----------

func (a *App) panel(c *ui.Context) ui.Element {
	t := a.T
	return ui.Column(c).Radius(24).Background(t.Surface).Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color).Clip().MinWidth(0)
}

func (a *App) transcript(c *ui.Context, task *store.Task) {
	t := a.T
	a.panel(c).Grow(1).Basis(360).Children(func() {
		ui.Row(c).Gap(8).Padding(14, 18).BorderWidth(0, 0, 1, 0).BorderColor(t.LineSoft).Children(func() {
			ui.Text(c, a.L.T("task.transcript")).FontSize(t.MD).FontWeight(800).Grow(1)
			ui.Text(c, a.L.T("task.transcript.hint")).FontSize(t.XS).TextColor(t.InkMuted)
		})
		evs := a.transcriptEvents(task)
		var local []*store.Send
		for _, sd := range task.Sends {
			if sd.Seq == 0 {
				local = append(local, sd)
			}
		}
		n := len(evs) + len(local)
		ls := a.taskLists[task.ID]
		if ls == nil {
			ls = &ui.ListState{}
			a.taskLists[task.ID] = ls
		}
		ls.FollowEnd = true
		ls.Key = func(i int) any {
			if i < len(evs) {
				return evs[i].Seq
			}
			if j := i - len(evs); j < len(local) {
				return local[j]
			}
			return i
		}
		ui.List(c.Key("transcript:"+task.ID), ls, n, func(i int) {
			if i >= len(evs) {
				a.sentBubble(c, local[i-len(evs)].Text, local[i-len(evs)])
				return
			}
			a.transcriptRow(c, task, evs[i])
		}).Grow(1).Padding(14, 18).Gap(12).Children(func() {
			if n == 0 {
				ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
		if a.held != nil && a.held.taskID == task.ID {
			ui.Column(c).Margin(0, 12, 0, 12).Children(func() { a.heldLine(c) })
		}
		draft := a.taskDrafts[task.ID]
		ui.Row(c).Gap(8).Margin(0, 12, 12, 12).Padding(6, 6, 6, 14).Radius(18).Background(t.Bg).AlignItems(ui.Center).Children(func() {
			ui.TextArea(c.Key("taskcomposer:"+task.ID), &draft).Lines(1, 6).MinHeight(0).Placeholder(a.L.T("composer.task")).
				Label(a.L.T("composer.task")).
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(8, 0).Grow(1).FontSize(14).
				OnTextKey(func(k ui.TextKey) bool {
					if k.Key == ui.KeyEnter && k.Mods == 0 {
						if a.SendToTask(task.ID, k.Text()) {
							k.SetText("")
						}
						return true
					}
					return false
				})
			if a.iconButton(c, a.L.T("composer.send"), 44, t.Ink, t.PressPrimary, drawSend(t.OnUserBubble)) {
				if a.SendToTask(task.ID, draft) {
					draft = ""
				}
			}
		})
		a.taskDrafts[task.ID] = draft
	})
}

// transcriptEvents are the task's events the transcript shows.
func (a *App) transcriptEvents(task *store.Task) []protocol.LogEvent {
	var out []protocol.LogEvent
	for _, ev := range task.Events {
		switch ev.Kind {
		case protocol.KindTaskOpen, protocol.KindTaskEvent, protocol.KindReport, protocol.KindCheckpoint:
			out = append(out, ev)
		}
	}
	return out
}

func (a *App) transcriptRow(c *ui.Context, task *store.Task, ev protocol.LogEvent) {
	t := a.T
	body, _ := ev.Typed()
	switch b := body.(type) {
	case *protocol.TaskOpen:
		ui.Column(c).Padding(12, 14).Gap(4).Radius(16).Background(t.Bg).Children(func() {
			ui.Text(c, a.L.T("task.brief", a.S.PersonaName)).FontSize(11).FontWeight(800).TextColor(t.InkMuted).LetterSpacing(0.5)
			ui.Text(c, b.Brief).FontSize(14).LineHeight(1.55).Selectable()
		})
	case *protocol.TaskEvent:
		switch {
		case b.Tool != nil:
			a.toolRow(c, b.Tool)
		case b.Role == "user" && (b.From == "partner" || ev.Origin == protocol.OriginPartner):
			// The partner talking to the task: its words, not the user's.
			ui.Column(c).Gap(4).Padding(10, 14).Radius(16).Background(t.Working.Surface).Children(func() {
				ui.Text(c, a.L.T("task.from.partner", a.S.PersonaName)).FontSize(11).FontWeight(800).TextColor(t.Working.Ink).LetterSpacing(0.5)
				ui.Text(c, b.Text).FontSize(14).LineHeight(1.5).Selectable()
			})
		case b.Role == "user":
			a.sentBubble(c, b.Text, task.SendFor(ev.Seq))
		case b.Role == "system":
			a.systemLine(c, b)
		case b.Text != "":
			ui.Column(c).Children(func() { markdown.View(c, b.Text, &a.mdTask) })
		}
	case *protocol.Checkpoint:
		ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Height(1).Grow(1).Background(t.Working.Surface.Mix(t.Working.Dot, 0.15))
			ui.Text(c, a.L.T("task.checkpoint", b.Text)).FontSize(t.XS).FontWeight(700).TextColor(t.Working.Ink).MaxLines(2).TextAlign(ui.Center)
			ui.Box(c).Height(1).Grow(1).Background(t.Working.Surface.Mix(t.Working.Dot, 0.15))
		})
	case *protocol.Report:
		a.reportCard(c, b)
	}
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
	ui.Column(c).Gap(5).AlignItems(ui.End).Children(func() {
		r := t.BubbleRadius
		b := ui.Text(c, text).FontSize(14).LineHeight(1.5).TextColor(t.OnUserBubble).Background(t.UserBubble).
			Padding(9, 14).Radius(r[0]*0.8, r[1]*0.8, r[2], r[3]*0.8).MaxWidthPercent(80).Selectable()
		if waiting {
			b.Opacity(0.7)
		}
		if note == "" {
			return
		}
		ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
			col := t.InkMuted
			if failed {
				col = t.Failed.Ink
			} else if !waiting {
				ui.Box(c).Size(16, 16).Radius(6).Background(t.Done.Surface).Draw(drawCheck(t.Done.Ink))
			}
			ui.Text(c, note).FontSize(11.5).FontWeight(700).TextColor(col)
		})
	})
}

// systemLine is a harness's own note, as a turn ending: a thin divider,
// in words for people.
func (a *App) systemLine(c *ui.Context, b *protocol.TaskEvent) {
	t := a.T
	text := b.Text
	switch strings.ToLower(strings.TrimSpace(text)) {
	case "turn completed", "turn complete", "turn ended":
		text = a.L.T("task.turn.done")
	}
	if u := b.Usage; u != nil && u.InputTokens+u.OutputTokens > 0 {
		text += " · " + tokens(u.InputTokens+u.CacheRead+u.CacheWrite) + " / " + tokens(u.OutputTokens)
	}
	ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
		ui.Text(c, text).FontSize(11).TextColor(t.InkMuted).Shrink(0)
		ui.Box(c).Height(1).Grow(1).Background(t.LineSoft)
	})
}

// isLink reports whether an evidence ref opens somewhere.
func isLink(ref string) bool {
	return strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "file:") || strings.HasPrefix(ref, "/")
}

// evidenceLine is one piece of evidence: a link when it points somewhere,
// else its label and what it says.
func (a *App) evidenceLine(c *ui.Context, ev protocol.EvidenceRef) {
	t := a.T
	if isLink(ev.Ref) {
		l := ui.Text(c, ev.Label).FontSize(t.SM).FontWeight(700).Underline().Cursor(ui.CursorPointer).Role(ui.RoleLink).Tooltip(ev.Ref)
		if l.Clicked() {
			a.openEvidence(c, ev)
		}
		return
	}
	ui.Row(c).Gap(8).AlignItems(ui.Start).Children(func() {
		ui.Box(c).Size(18, 18).Radius(6).Background(t.Done.Surface).Draw(drawCheck(t.Done.Ink)).Shrink(0)
		ui.Column(c).Gap(1).Grow(1).MinWidth(0).Children(func() {
			ui.Text(c, ev.Label).FontSize(t.SM).FontWeight(700)
			if ev.Ref != "" && ev.Ref != ev.Label {
				ui.Text(c, ev.Ref).FontSize(t.XS).TextColor(t.InkMuted).Selectable().MaxLines(3)
			}
		})
	})
}

func (a *App) reportCard(c *ui.Context, r *protocol.Report) {
	t := a.T
	sc := t.Working
	key := "task.report"
	switch r.State {
	case "needs_input":
		sc, key = t.NeedsYou, "task.report.needs_input"
	case "done":
		sc, key = t.Done, "task.report.done"
	case "blocked":
		sc, key = t.Waiting, "task.report.blocked"
	case "failed":
		sc, key = t.Failed, "task.report.failed"
	}
	ui.Column(c).Padding(12, 14).Gap(6).Radius(16).Border(2, sc.Dot.Mix(t.Surface, 0.45)).Children(func() {
		ui.Text(c, a.L.T(key, a.S.PersonaName)).FontSize(11).FontWeight(800).TextColor(sc.Ink).LetterSpacing(0.5)
		ui.Text(c, r.Summary).FontSize(14).LineHeight(1.55).Selectable()
		for i, q := range r.Questions {
			ui.Text(c.Key(i), "· "+q.Text).FontSize(t.SM).TextColor(t.InkSoft)
		}
		if len(r.Evidence) > 0 {
			ui.Row(c).Gap(10).Wrap().Children(func() {
				for i, ev := range r.Evidence {
					if !isLink(ev.Ref) {
						ui.Box(c.Key(i)).Padding(3, 8).Radius(8).Background(t.SurfaceSunken).Tooltip(ev.Ref).Children(func() {
							ui.Text(c, ev.Label).FontSize(t.XS).FontWeight(700)
						})
						continue
					}
					l := ui.Text(c.Key(i), ev.Label).FontSize(t.XS).FontWeight(700).Underline().Cursor(ui.CursorPointer).Role(ui.RoleLink)
					if l.Clicked() {
						a.openEvidence(c, ev)
					}
				}
			})
		}
	})
}

// toolRow is a tool call collapsed to one line; a click shows its output.
func (a *App) toolRow(c *ui.Context, tool *protocol.ToolCall) {
	t := a.T
	col := ui.Column(c).Radius(10).Background(t.SurfaceRaised.Mix(t.SurfaceSunken, 0.6)).Cursor(ui.CursorPointer)
	open := ui.Local(col, "open", func() bool { return false })
	col.Children(func() {
		ui.Row(c).Gap(8).Padding(8, 10).AlignItems(ui.Center).Children(func() {
			ui.Text(c, "›").Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).Rotate(map[bool]float32{true: 90, false: 0}[*open])
			ui.Text(c, toolSummary(tool)).Font(t.Mono).FontSize(t.XS).Grow(1).MinWidth(0).SingleLine()
			if tool.OK != nil {
				if *tool.OK {
					ui.Text(c, a.L.T("tool.ok")).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted)
				} else {
					ui.Text(c, a.L.T("tool.fail")).Font(t.Mono).FontSize(t.XS).TextColor(t.NeedsYou.Ink)
				}
			}
		})
		if *open && tool.Output != "" {
			ui.Text(c, strings.TrimRight(tool.Output, "\n")).Font(t.Mono).FontSize(11.5).LineHeight(1.5).TextColor(t.InkSoft).
				Padding(0, 10, 10, 26).Selectable().MaxLines(40)
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
	if p.Kind != "repo" || p.Worktree == "" {
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

func (a *App) changes(c *ui.Context, task *store.Task) {
	t := a.T
	pane := a.diffs[task.ID]
	a.panel(c).Grow(2).Basis(520).Children(func() {
		ui.Row(c).Gap(4).Padding(10, 12).BorderWidth(0, 0, 1, 0).BorderColor(t.LineSoft).AlignItems(ui.Center).Children(func() {
			n := 0
			if pane != nil {
				n = len(pane.files)
			}
			ui.Box(c).Height(40).Padding(0, 16).Radius(12).Background(t.Ink).Center().Children(func() {
				ui.Text(c, a.L.T("task.changes", n)).FontSize(14).FontWeight(700).TextColor(t.OnUserBubble)
			})
			ui.Spacer(c)
			if pane != nil {
				if pane.loading {
					ui.Spinner(c).Size(16, 16)
				}
				if a.button(c, a.L.T("task.changes.refresh"), btnText, 40, t.Surface) {
					a.refreshDiff(task.ID)
				}
			}
		})
		ui.Scroll(c).Grow(1).Children(func() {
			ui.Column(c).Padding(14).Gap(12).Children(func() {
				p := task.Place()
				switch {
				case p.Kind != "repo" || p.Worktree == "":
					a.emptyNote(c, a.L.T("task.changes.noplace"))
				case pane == nil || (pane.loading && pane.files == nil):
					ui.Spinner(c)
				case pane.err != "":
					a.emptyNote(c, a.L.T("task.changes.error", pane.err))
				case len(pane.files) == 0:
					a.emptyNote(c, a.L.T("task.changes.none"))
				default:
					for i := range pane.files {
						a.fileDiff(c.Key(pane.files[i].name), &pane.files[i])
					}
				}
			})
		})
	})
}

func (a *App) emptyNote(c *ui.Context, text string) {
	t := a.T
	ui.Box(c).Padding(12, 14).Radius(14).Border(1, t.Line).BorderStyle(ui.BorderDashed).Children(func() {
		ui.Text(c, text).FontSize(t.SM).TextColor(t.InkMuted)
	})
}

func (a *App) fileDiff(c *ui.Context, f *diffFile) {
	t := a.T
	ui.Column(c).Gap(8).Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			ui.Text(c, f.name).Font(t.Mono).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0).SingleLine()
			ui.Text(c, fmt.Sprintf("+%d", f.added)).Font(t.Mono).FontSize(t.SM).TextColor(t.Done.Ink)
			ui.Text(c, fmt.Sprintf("−%d", f.deleted)).Font(t.Mono).FontSize(t.SM).TextColor(t.Failed.Ink)
		})
		if f.state == nil {
			return
		}
		ui.Column(c).Radius(14).Border(1, t.LineSoft).Clip().Children(func() {
			editor.DiffView(c, f.state).FillWidth()
		})
	})
}

// ---------- dossier ----------

func (a *App) dossierCard(c *ui.Context, title string, body func()) {
	t := a.T
	ui.Column(c.Key(title)).Padding(16, 18).Gap(10).Radius(24).Background(t.Surface).
		Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color).Children(func() {
		ui.Text(c, title).FontSize(t.MD).FontWeight(800)
		body()
	})
}

func (a *App) dossier(c *ui.Context, task *store.Task) {
	t := a.T
	who := harnessName(task.Harness())
	if who == "" {
		who = "?"
	}
	title := who
	if task.BodyReason() != "" {
		title = a.L.T("task.dossier.why", who)
	}
	a.dossierCard(c, title, func() {
		if r := task.BodyReason(); r != "" {
			ui.Text(c, r).FontSize(t.SM).LineHeight(1.55).TextColor(t.InkSoft)
		}
		ui.Text(c, a.bodyLine(task)).FontSize(t.XS).TextColor(t.InkMuted)
		if u := task.Usage; u.InputTokens+u.OutputTokens+u.CacheRead > 0 {
			ui.Text(c, a.L.T("task.usage", tokens(u.InputTokens+u.CacheRead+u.CacheWrite), tokens(u.OutputTokens))).FontSize(t.XS).TextColor(t.InkMuted)
		}
	})
	a.dossierCard(c, a.L.T("task.dossier.checkpoints"), func() {
		if len(task.Checkpoints) == 0 {
			ui.Text(c, a.L.T("task.dossier.checkpoints.none")).FontSize(t.SM).TextColor(t.InkMuted)
		}
		last := len(task.Checkpoints) - 1
		for i, cp := range task.Checkpoints {
			ui.Row(c.Key(cp.Seq)).Gap(10).AlignItems(ui.Center).Children(func() {
				dot := t.Done.Dot
				if i == last && task.Attention() == protocol.NeedsYou {
					dot = t.NeedsYou.Dot
				} else if i == last && task.Attention() == protocol.Working {
					dot = t.Working.Dot
				}
				ui.Box(c).Size(10, 10).Radius(5).Background(dot).Shrink(0)
				txt := ui.Text(c, fmt.Sprintf("%d · %s", i+1, cp.Text)).FontSize(t.SM).Grow(1).MinWidth(0)
				if i == last {
					txt.FontWeight(700)
				}
				ui.Text(c, clock(cp.TS)).Font(t.Mono).FontSize(11).TextColor(t.InkMuted)
			})
		}
	})
	a.dossierCard(c, a.L.T("task.dossier.evidence"), func() {
		if len(task.Evidence) == 0 {
			ui.Text(c, a.L.T("task.dossier.evidence.none")).FontSize(t.SM).TextColor(t.InkMuted)
		}
		for i, ev := range task.Evidence {
			a.evidenceLine(c.Key(i), ev)
		}
	})
	a.outsideCard(c, task)
	a.dossierCard(c, a.L.T("task.dossier.where"), func() {
		p := task.Place()
		ui.Text(c, a.placeLine(p)).FontSize(t.SM).FontWeight(700)
		shown := map[string]bool{}
		for i, s := range []string{p.RepoPath, p.Worktree, p.Path} {
			if s != "" && !shown[s] {
				shown[s] = true
				ui.Text(c.Key(i), s).Font(t.Mono).FontSize(11).TextColor(t.InkMuted).Selectable()
			}
		}
		if p.BaseBranch != "" {
			ui.Text(c, "base: "+p.BaseBranch).Font(t.Mono).FontSize(11).TextColor(t.InkMuted)
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
