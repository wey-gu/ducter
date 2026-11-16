package views

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/editor"

	"github.com/wey-gu/ducter/apps/desktop/internal/redact"

	"github.com/wey-gu/ducter/apps/desktop/internal/diff"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// task is an opened task, at conductor depth: one centered column on
// the conversation's measure, read top to bottom (D74). Where it stands in
// words; a pending ask; the outcome, said once, with how it knows and what
// to do next; what it did, its tool calls folded into one line per
// stretch; its changes as a list of files (a file's diff opens in place,
// none by default); then a quiet Details disclosure. The composer to talk
// to the task stays at the bottom, as in the conversation.
func (a *App) task(c *ui.Context) {
	task := a.S.Task(a.TaskID)
	if task == nil {
		task = &store.Task{ID: a.TaskID}
	}
	a.markOpenSeen(task)
	a.taskHeader(c, task)
	// D244: On hand's rail | the task | the workbench (D214), as the
	// window has room; with room for two, the workbench takes the rail's
	// place. Each slides its width in and out.
	w := a.winW
	if w <= 0 {
		w = 1280
	}
	rail, bench := panes(w, a.bench.open && a.benchOpenable(task))
	// D271: the task's own column, for the locator (wide only).
	a.tpage.colW = w
	if rail {
		a.tpage.colW -= railWidth(w)
	}
	if bench {
		a.tpage.colW -= a.benchW(w)
	}
	ui.Row(c.Key("benchrow")).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
		rw := float32(0)
		if rail {
			rw = railWidth(w)
		}
		a.slide(c, "rail", rw, func(cw float32) { a.onHandRail(c, cw) })
		// D290: keyed by the task, so one task to the next moves this
		// column alone (the bar and the rail stay): the new one rises a
		// little into place as the one left fades.
		ui.Box(c.Key("taskstage")).Grow(1).MinWidth(0).MinHeight(0).ChildExit(ui.Motion{}).Children(func() {
			ui.Column(c.Key("taskcol:" + task.ID)).Absolute().Fill().Transition(a.taskSwitch()).Children(func() { a.taskBody(c, task) })
		})
		bw := float32(0)
		if bench {
			bw = a.benchW(w)
		}
		a.slide(c, "bench", bw, func(cw float32) { a.workbench(c, task, cw) })
	})
}

// taskHeader is the breadcrumb and the task's title; at its end, what can
// be done to the task itself (pause, drop) as quiet buttons. No chips: the
// state is in words under it, the rest is in Details.
func (a *App) taskHeader(c *ui.Context, task *store.Task) {
	a.placeBar(c, "task", RouteTask, func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.crumb(c, a.L.T("nav.onhand"), RouteOnHand)
		a.taskTitle(c, task)
	}, func() {
		a.taskActions(c, task)
	})
}

// taskTitle is the task's name in the bar (D270): the last crumb, at the
// bar's one size in full ink, its full title on hover. No line under it:
// who does it, where it stands and where are said once, in the task's head.
func (a *App) taskTitle(c *ui.Context, task *store.Task) {
	full := task.Title()
	title := shortTitle(full)
	if title == "" {
		title, full = a.L.T("task.unknown"), a.L.T("task.unknown")
	}
	a.chromeTitle(c, title).Tooltip(full)
}

// taskActions are what the user can do to the task itself while it is
// open: open its working copy (D198, any state) and watch its page (D190);
// Cancel task in the ⋯ at the end (D268). Stop sits by Send while it works;
// Try again for a task that ended sits with its outcome.
func (a *App) taskActions(c *ui.Context, task *store.Task) {
	t := a.T
	// D220: 工作副本 / Working copy: its branch, and what a developer checks before acting.
	a.taskInfo(c, task)
	// D198: its working copy in Finder, a Terminal or an editor, whatever its state.
	a.openIn(c, task)
	// D214: the workbench, beside the task (⌥⌘B); D220: the simulators are looked for once.
	if b := a.benchOf(task.ID); b.simsAt.IsZero() {
		a.benchSims(task)
	}
	if a.benchOpenable(task) {
		// D270: a quiet text button; while the workbench shows, it stays
		// pressed into the bar (sunken, no ledge), never a second clay button.
		on := ui.Box(c.Key("wb-on")).Radius(a.buttonRadius(t.ControlSM)).Shrink(0)
		if a.benchShown(task) {
			on.Background(t.SurfaceSunken)
		}
		clicked := false
		on.Children(func() { clicked = a.button(c, a.L.T("wb.toggle"), btnText, t.ControlSM, t.Chrome) })
		if clicked {
			a.ToggleBench()
		}
	}
	att := task.Attention()
	switch att {
	case protocol.Failed, protocol.Dropped, protocol.Done, protocol.DoneClaimed, protocol.Superseded:
		return
	}
	// D190: the page it is working on in Ducter's own browser, live.
	if a.S.Browsing(task.ID) != "" && a.button(c, a.L.T("live.watch.title"), btnText, t.ControlSM, t.Chrome) {
		a.OpenWatch(task.ID)
	}
	// D235: it is using the person's apps: where, and 停下 / Stop.
	a.computerTaskLine(c, task)
	// D238: it is using the person's own phone: which, and 停下 / Stop.
	a.handsetTaskLine(c, task)
	// D217: it is using Ducter's phone: watch it, in the workbench's Phone page (D220).
	if dev := a.S.Phoning(task.ID); dev != "" && a.button(c, a.L.T("phoneuse.watch"), btnText, t.ControlSM, t.Chrome) {
		a.bench.open, a.bench.tab = true, "phone"
		a.benchLoad(task)
	}
	a.moreMenu(c, task)
}

// moreMenu is the header's quiet ⋯ (D268): Cancel task, while the task can
// still be cancelled. Never by the composer, where a slip would cost the work.
func (a *App) moreMenu(c *ui.Context, task *store.Task) {
	t := a.T
	b := ui.Box(c.Key("more:"+task.ID)).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(a.L.T("task.more")).
		Tooltip(a.L.T("task.more")).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Chrome)
	b.Draw(drawMore(fg))
	if b.Clicked() {
		a.moreOpen = !a.moreOpen
	}
	ui.PopoverBase(c, b, &a.moreOpen, func(panel ui.Element) {
		panel.Margin(t.S2, 0, 0, 0).MinWidth(160).Padding(t.S1).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(a.L.T("task.more"))
		a.dropItem(c, task)
	})
}

// dropItem is Cancel task (不做了) in the ⋯ while the task can still be
// cancelled (D213, D268): it drops the task, undoable from its toast for
// UndoWindow.
func (a *App) dropItem(c *ui.Context, task *store.Task) {
	t := a.T
	switch task.Attention() {
	case protocol.Failed, protocol.Dropped, protocol.Done, protocol.DoneClaimed, protocol.Superseded:
		ui.Text(c, a.L.T("task.more")).FontSize(t.SM).TextColor(t.InkMuted).Padding(t.S2, t.S3)
		return
	}
	label := a.L.T("task.action.drop")
	it := ui.Text(c.Key("drop"), label).FontSize(t.SM).TextColor(t.Failed.Ink).Padding(t.S2, t.S3).Radius(t.RadiusXS).
		Role(ui.RoleButton).Focusable().Cursor(ui.CursorPointer).Label(label)
	if it.Hovered() {
		it.Background(t.Failed.Surface.Alpha(0.6))
	}
	if it.Clicked() {
		a.moreOpen = false
		a.DropTask(task.ID)
		c.AddToast(ui.Toast{ID: "undo:" + task.ID, Title: a.L.T("undo.dropped", task.Title()), Timeout: UndoWindow,
			Action: a.L.T("undo.action"), OnAction: a.UndoDrop})
	}
}

// taskStanding is the head's one quiet meta line: the state in its ink,
// then when it started and who is doing it, in muted words. No links: who
// and why, and switching, live in Details.
func (a *App) taskStanding(c *ui.Context, task *store.Task) {
	t := a.T
	att := task.Attention()
	state := a.stateLabel(att)
	if a.yourTurn(task) {
		state = a.L.T("task.your.turn")
	} else if att == protocol.Blocked {
		// D279: a wait of its own says when it comes back.
		if back := a.backWords(a.S.WaiterFor(task.ID)); back != "" {
			state = back
		}
	}
	// D210: while it works, the clock ticks in the foot over the composer;
	// here it says how long it took once finished.
	when := ""
	if finished(task) {
		when = a.taskClock(c, task)
	}
	// One quiet line (D152): where it stands and its one clock, then who does it and where.
	ui.Column(c.Key("meta")).Gap(2).Children(func() {
		// D291: the state word in its ink, and apart, its clock in muted figures.
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Text(c, state).FontSize(t.SM).FontWeight(800).TextColor(t.State(string(att)).Ink)
			if when != "" {
				ui.Text(c, when).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").MinWidth(0)
			}
		})
		a.taskWho(c, task)
	})
}

// taskHeadline is the head's one big line, always there: the outcome's
// first sentence once it is finished (outcome says it), else what it is
// doing now in a sentence: why it waits, the latest word it sent, the
// latest thing it said, or its title.
func (a *App) taskHeadline(c *ui.Context, task *store.Task) {
	t := a.T
	line := ""
	switch {
	case task.Browsing() != "":
		line = a.L.T(task.BrowsingKey(), task.Browsing())
	case task.Attention() == protocol.Blocked:
		// D261: what it waits for, always: its waiter, its reason, what it
		// last reported, or that it stopped without saying.
		line = a.storyOf(task).words
	}
	// Else what the task is (D152): the agent's latest words are the
	// transcript's, in its own language, and are never said twice.
	if line == "" {
		line = shortTitle(task.Title())
	}
	a.heading(c, autospace(redact.Text(line)), t.XXL).LineHeight(1.25).Balance().MaxWidth(headMeasure).Selectable()
	if next := a.taskNext(task); len(next) > 0 {
		ui.Column(c.Key("next")).MaxWidth(headMeasure).Children(func() {
			a.facts(c, t.MD, t.InkSoft, next...)
		})
	}
}

// taskNext is what comes next for a waiting task, in one line (D261): when
// it looks again (or goes on), and, for a wait gone quiet, since when
// nothing has changed. Deterministic: the waiter's own times, never a model.
func (a *App) taskNext(task *store.Task) []string {
	// D279: a wait of its own says when it comes back in the state and the watch card.
	if task.Attention() != protocol.Blocked || a.S.WaiterFor(task.ID) != nil {
		return nil
	}
	// D291: each its own fact, never joined by "·".
	var parts []string
	if a.quietWait(task) && task.Card != nil {
		parts = append(parts, a.tp("onhand.wait.since", a.agoLong(task.Card.UpdatedAt)))
	}
	if next, _ := a.waitNext(a.S.WaiterFor(task.ID)); next != "" {
		parts = append(parts, next)
	}
	if a.L.Cased() {
		for i, s := range parts {
			parts[i] = strings.ToUpper(s[:1]) + s[1:]
		}
	}
	return parts
}

// lastSaid is where the work stands in a sentence: the latest progress it
// saved, or the first sentence of the latest thing it said, whichever is newer.
func (a *App) lastSaid(task *store.Task) string {
	for i := len(task.Events) - 1; i >= 0; i-- {
		ev := task.Events[i]
		if ev.Kind == protocol.KindCheckpoint {
			var cp protocol.Checkpoint
			if ev.Decode(&cp) == nil && strings.TrimSpace(cp.Text) != "" {
				return cp.Text
			}
		}
		if ev.Kind != protocol.KindTaskEvent {
			continue
		}
		body, _ := ev.Typed()
		if b, _ := body.(*protocol.TaskEvent); b != nil && b.Role == "assistant" && strings.TrimSpace(b.Text) != "" && b.Tool == nil {
			head, _ := headline(strings.TrimLeft(firstLine(b.Text), "#*>- "))
			return head
		}
	}
	return ""
}

// saidSinceReport reports whether the task wrote words or saved progress
// after its latest report (a working task that has moved on).
func (a *App) saidSinceReport(task *store.Task) bool {
	if task.Attention() != protocol.Working {
		return false
	}
	for i := len(task.Events) - 1; i >= 0; i-- {
		ev := task.Events[i]
		switch ev.Kind {
		case protocol.KindReport:
			return false
		case protocol.KindCheckpoint:
			return true
		case protocol.KindTaskEvent:
			body, _ := ev.Typed()
			if b, _ := body.(*protocol.TaskEvent); b != nil && b.Role == "assistant" && strings.TrimSpace(b.Text) != "" && b.Tool == nil {
				return true
			}
		}
	}
	return false
}

// The measures of the opened task (D78): a headline and a paragraph stay
// near 68 Latin or 36 Chinese characters a line.
const (
	headMeasure = 620
	readMeasure = 640
)

// taskFaceW is the width of an opened task's state face: about the height
// of the meta line and a headline of two lines, so they read as one block.
const taskFaceW = 96

// taskPresence is the face an opened task shows: done, needs you (also
// for one that didn't work: it frowns and holds up its flag), working,
// napping while it waits, idle otherwise.
func taskPresence(task *store.Task) theme.Presence {
	switch task.Attention() {
	case protocol.Done, protocol.DoneClaimed:
		return theme.Done
	case protocol.NeedsYou, protocol.Failed:
		return theme.NeedsYou
	case protocol.Working:
		return theme.Working
	case protocol.Blocked:
		return theme.Waiting
	}
	return theme.Idle
}

// headline splits a report's summary into its first sentence, said as
// the outcome at 34, and the rest, said under it at the partner's size.
func headline(s string) (head, rest string) {
	s = strings.TrimSpace(s)
	rs := []rune(s)
	for i, r := range rs {
		end := false
		switch r {
		case '。', '！', '？':
			end = true
		case '.', '!', '?':
			end = i+1 == len(rs) || rs[i+1] == ' ' || rs[i+1] == '\n'
		case '\n':
			end = true
		}
		if end {
			head, rest = strings.TrimSpace(string(rs[:i+1])), strings.TrimSpace(string(rs[i+1:]))
			if r == '\n' {
				head = strings.TrimSpace(string(rs[:i]))
			}
			return head, rest
		}
	}
	return s, ""
}

// outcome is the task's result, said once: its first sentence at 34/800,
// the rest of its report in the partner's size, how it knows on one quiet
// line, what went out, then what to do next (Open draft PR / Merge; for
// one that didn't work, Try again / Tell it what to do).
func (a *App) outcome(c *ui.Context, task *store.Task) {
	t := a.T
	rep := task.Report()
	ui.Column(c.Key("outcome")).Gap(t.S3).Selectable().CopyData(autospaceCopy).Children(func() {
		if rep == nil || rep.Summary == "" {
			a.heading(c, autospace(task.Title()), t.Title).LineHeight(1.18).Balance().MaxWidth(headMeasure)
		}
		if rep != nil && rep.Summary != "" {
			head, rest := headline(redact.Text(rep.Summary))
			a.heading(c, autospace(head), t.Title).LineHeight(1.18).Balance().MaxWidth(headMeasure)
			if rest != "" {
				ui.Text(c, autospace(rest)).FontSize(t.PartnerSize).LineHeight(leadingFor(rest, 1.65)).TextColor(t.InkSoft).MaxWidth(readMeasure)
			}
		}
		// D206: what it showed: its pictures and files, under the outcome.
		if rep != nil && len(rep.Media) > 0 {
			a.messageMedia(c, "outcome", rep.Media, nil, false, "task:"+task.ID)
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
			// Try again, or tell it what to do instead: the primary
			// opens the task's composer (D76).
			ui.Row(c).Gap(t.S3).Wrap().AlignItems(ui.Center).Padding(t.S2, 0, 0, 0).Children(func() {
				if a.buttonFor(c, a.L.T("task.action.retry"), task.Title(), btnSecondary, t.ControlMD, t.Bg) {
					a.TaskAction(task.ID, "reopen")
				}
				if a.buttonFor(c, a.L.T("task.action.tell"), task.Title(), btnPrimary, t.ControlMD, t.Bg) {
					a.focusComposer = true
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
	msg := a.answeredWords(d)
	ui.Row(c.Key("answered")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		a.glyph(c, 16, drawCheck(t.InkMuted))
		// D291: what was answered, then its time as its own muted element.
		ui.Text(c, strings.TrimRight(msg, "：: ")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Shrink(0)
		ui.Text(c, d.AnsweredAt.Local().Format("15:04")).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
		ui.Text(c, a.questionOf(d)).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Grow(1).MinWidth(0)
	})
}

// sectionTitle heads a section of the opened task.
func (a *App) sectionTitle(c *ui.Context, text string) ui.Element {
	return a.heading(c, text, a.T.LG) // one step above the body's 15, not a jump
}

// ---------- what it did (tasksteps.go) ----------

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
	if d := a.S.PendingDecision(task.ID); d != nil && d.Resolved == nil && d.Pending == "" {
		a.aboveComposer(c, func() { a.decisionCard(c, d, task.ID) })
	}
	draft := a.taskDrafts[task.ID]
	tray := "task:" + task.ID
	// D268: while it works, what is sent steers it (read at its next step);
	// ⌥↩ or 做完再说 / After this waits for its turn to end. Stop sits by Send.
	working := task.Attention() == protocol.Working
	mode := func(queue bool) string {
		switch {
		case !working:
			return ""
		case queue:
			return "queue"
		}
		return "steer"
	}
	ui.Row(c).Justify(ui.Center).Padding(t.S2, t.S5, t.S4, t.S5).Children(func() {
		ui.Column(c).Grow(1).MaxWidth(readMeasure).MinWidth(0).Gap(t.S1).Children(func() {
			box := ui.Column(c.Key("taskcomposer-box")).Padding(t.S2, t.S2, t.S2, t.S3).
				Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
			over := a.takeDrops(box, tray) // D206
			box.Children(func() {
				if over {
					a.dropHint(c)
				}
				a.picTray(c, tray)
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					a.addPicturesButton(c, tray)
					ta := ui.TextArea(c.Key("taskcomposer:"+task.ID), &draft).Lines(1, 6).MinHeight(0).Placeholder(a.L.T("composer.task")).
						Label(a.L.T("composer.task")).
						Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S3, 0).Grow(1).FontSize(t.Bubble).
						OnTextKey(func(k ui.TextKey) bool {
							if a.pictureKeys(tray, k) {
								return true
							}
							if k.Key == ui.KeyEnter && (k.Mods == 0 || k.Mods == ui.Alt) {
								if a.SendToTaskMode(task.ID, k.Text(), mode(k.Mods == ui.Alt)) {
									k.SetText("")
									// D207: the key runs after this frame's draft was
									// stored; empty the stored one too, or the next
									// frame puts the sent words back.
									a.taskDrafts[task.ID] = ""
								}
								return true
							}
							return false
						})
					if a.focusComposer {
						ta.Focus()
						a.focusComposer = false
					}
					a.contextRing(c, task) // D288: the context meter, a quiet ring by the composer
					if working && strings.TrimSpace(draft) != "" {
						if a.button(c, a.L.T("composer.after"), btnText, t.ControlSM, t.Surface) && a.SendToTaskMode(task.ID, draft, "queue") {
							draft = ""
						}
					}
					if working && a.iconButton(c, a.L.T("task.action.pause"), t.ControlLG, btnSecondary, drawStop) {
						a.TaskAction(task.ID, "interrupt")
					}
					if a.iconButton(c, a.L.T("composer.send"), t.ControlLG, btnAccent, drawSend) {
						if a.SendToTaskMode(task.ID, draft, mode(false)) {
							draft = ""
						}
					}
				})
			})
			if working {
				ui.Row(c).Gap(t.S2).Padding(0, t.S4).Children(func() {
					ui.Text(c, a.L.T("composer.steer.hint")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1)
					ui.Spacer(c)
					ui.Text(c, a.L.T("composer.queue.hint")).FontSize(t.XS).TextColor(t.Faint).SingleLine().Shrink(0)
				})
			}
		})
	})
	a.taskDrafts[task.ID] = draft
}

// sentBubble is what the user said straight into the task, with how it
// was delivered: steered into this turn, as the next turn, or queued.
func (a *App) sentBubble(c *ui.Context, text string, sd *store.Send, queued bool, media ...protocol.MediaRef) {
	t := a.T
	note, tip, failed, waiting := "", "", false, false
	queued = queued && sd != nil && sd.Delivered == "queued" && sd.Failed == ""
	if sd != nil {
		switch {
		case sd.Failed != "":
			note, failed = a.L.T("delivery.failed", sd.Failed), true
		case sd.Delivered == "queued" && queued:
			// D207: said only while it waits its turn (D210: 排队中, and
			// when it will see it); steered in or started at once, the
			// foot shows it at work.
			note, tip = a.L.T("delivery.queued.tag"), a.L.T("delivery.queued") // D291: the tag, why on hover
		case sd.Delivered != "":
		case sd.Seq == 0 && a.Now().Sub(sd.At) < 4*time.Second:
			// No ack yet. A server without "sent" acks never says; after a
			// few seconds the label just goes.
			note, waiting = a.L.T("delivery.sending"), true
			c.After(4*time.Second - a.Now().Sub(sd.At))
		}
	}
	if len(media) == 0 && sd != nil {
		media = sd.Media
	}
	ui.Column(c).Gap(t.S1).AlignItems(ui.End).Children(func() {
		if len(media) > 0 {
			key := "s"
			if sd != nil {
				key += sd.ClientID
			}
			a.messageMedia(c, key, media, nil, true, "task:"+a.TaskID)
		}
		if text == "" {
			goto note
		}
		{
			r := t.BubbleRadius
			b := ui.Text(c, autospace(text)).FontSize(taskProse).LineHeight(leadingFor(text, 1.5)).TextColor(t.OnUserBubble).Background(t.UserBubble).
				Padding(9, t.S3).Radius(r[0]*0.8, r[1]*0.8, r[2], r[3]*0.8).MaxWidthPercent(80).Selectable()
			switch {
			case queued:
				// D268: waiting its turn: a dashed outline, no fill, muted words.
				b.Background(ui.Transparent).Border(1.5, t.Line2).BorderStyle(ui.BorderDashed).TextColor(t.InkMuted)
			case waiting:
				b.Opacity(0.7)
			}
		}
	note:
		if note == "" {
			return
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			col := t.InkMuted
			if failed {
				col = t.Failed.Ink
			} else if !waiting {
				ui.Box(c).Size(16, 16).Draw(drawCheck(t.InkMuted))
			}
			nt := ui.Text(c, note).FontSize(t.XS).FontWeight(700).TextColor(col)
			if tip != "" {
				nt.Tooltip(tip)
			}
		})
	})
}

// isLink reports whether an evidence ref opens somewhere.
func isLink(ref string) bool {
	return strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "file:") || strings.HasPrefix(ref, "/")
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
		for _, k := range []string{"command", "cmd", "code", "file_path", "path", "pattern", "url", "query"} {
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
	if p.Kind == "folder" {
		a.askFolder(id)
		return
	}
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
// shows by default (D74), and a task that works in no repo has no section.
func (a *App) changes(c *ui.Context, task *store.Task) {
	t := a.T
	p := task.Place()
	if p.Kind == "folder" {
		a.folderChanges(c, task) // D142: a folder that isn't a repo
		return
	}
	if p.Kind != "repo" || p.Worktree == "" {
		return
	}
	pane := a.diffs[task.ID]
	// Nothing changed yet (or a task that changes no code, D127): no section,
	// no "no changes" and no Refresh to push. Core's count (D128) shows the
	// header before the files are read.
	counted := taskChanges(task)
	if (pane == nil || len(pane.files) == 0) && (counted == nil || pane == nil || !pane.loading) {
		return
	}
	ui.Column(c.Key("changes")).Gap(t.S3).Children(func() {
		// 改动 · 3 个文件 +42 −7 (D128): the files read here, else core's count.
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.sectionTitle(c, a.L.T("task.side.changes"))
			files, added, deleted := 0, 0, 0
			if pane != nil && len(pane.files) > 0 {
				files = len(pane.files)
				for _, f := range pane.files {
					added += f.added
					deleted += f.deleted
				}
			} else if counted != nil {
				files, added, deleted = counted.Files, counted.Adds, counted.Dels
			}
			if files > 0 {
				ui.Text(c, a.filesLabel(files)).FontSize(t.SM).TextColor(t.InkMuted).FontFeatures("tnum")
				ui.Text(c, fmt.Sprintf("+%d", added)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Done.Ink).Margin(0, 0, 0, t.S1)
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
			a.glyph(c, 12, drawChevron(t.InkMuted, open))
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

// waitFacts are how a wait or an until loop checks (D112, D113), when
// the task has one: the one table left of the old Details (D152). Who does
// it, where and its clock are the head's lines; saved progress is in the
// transcript, said once.
func (a *App) waitFacts(c *ui.Context, task *store.Task) {
	t := a.T
	row := func(label string, body func()) {
		ui.Column(c.Key(label)).Gap(t.S1).MaxWidth(readMeasure).Children(func() {
			ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			body()
		})
	}
	value := func(s string) {
		ui.Text(c, s).FontSize(t.SM).LineHeight(leadingFor(s, 1.5)).TextColor(t.InkSoft).Selectable()
	}
	ui.Column(c.Key("waitfacts")).Gap(t.S3).Children(func() { a.waitRows(c, task, true, row, value) })
}

// aboutTokens is a rough token count in the reader's own units, one token as one
// word: "4.5 万字",
// "120 万字" in Chinese; "45k", "1.2M" in English. Rough on purpose: the
// sentence says "about".
func (a *App) aboutTokens(n int64) string {
	trim := func(f float64) string { return strings.TrimSuffix(fmt.Sprintf("%.1f", f), ".0") }
	// Each table's own units: Chinese counts in 万 and 亿, English in k and M.
	return i18n.Pick(a.L, map[string]func() string{
		"zh": func() string {
			switch {
			case n >= 100_000_000:
				return trim(float64(n)/1e8) + " 亿字"
			case n >= 1_000_000:
				return fmt.Sprintf("%.0f 万字", float64(n)/1e4)
			case n >= 10_000:
				return trim(float64(n)/1e4) + " 万字"
			}
			return fmt.Sprint(n) + " 字"
		},
		"en": func() string {
			switch {
			case n >= 1_000_000:
				return trim(float64(n)/1e6) + "M"
			case n >= 10_000:
				return fmt.Sprintf("%.0fk", float64(n)/1e3)
			case n >= 1000:
				return trim(float64(n)/1e3) + "k"
			}
			return fmt.Sprint(n)
		},
	})()
}

// filesLabel counts changed files: "2 files", "1 file".
func (a *App) filesLabel(n int) string {
	if n == 1 {
		return a.L.T("task.files.one")
	}
	return a.L.T("task.files", n)
}
