package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// The conversation as a messaging app (D129). Two voices in bubbles: the
// partner's in a soft surface on the left, the user's in the accent on the
// right, one body size, at most about 38em wide. A run of messages from one
// voice stacks: 4 points apart, the tail side's top corner tucked in. A
// decision is the partner's question in its bubble and one compact tray
// under it (Reply… · Hold · Go, the Go button named by the action), with
// the default as a small grey line; an answered one is a tiny line on the
// user's side in their own words.

// bubbleJoin is set for the row being drawn when its first bubble follows a
// bubble of the same voice; the first bubble takes it.
func (a *App) takeJoin() bool {
	j := a.join
	a.join = false
	return j
}

// partnerBubble is the partner's words in its bubble.
func (a *App) partnerBubble(c *ui.Context, join bool, body func()) {
	t := a.T
	r := t.BubbleRadius
	tl := r[1]
	if join {
		tl = t.BubbleJoin
	}
	ui.Row(c).Children(func() {
		// Mirrors the user's corners: the tail is the bottom-left one.
		ui.Column(c).Background(t.PartnerBubble).TextColor(t.OnPartnerBubble).Padding(t.S2+2, t.S4-2).
			Radius(tl, r[0], r[3], r[2]).MaxWidth(t.BubbleMeasure).MaxWidthPercent(84).MinWidth(0).Gap(t.S2).Children(body)
		ui.Spacer(c)
	})
}

// partnerWords is a plain sentence of the partner's in its bubble.
func (a *App) partnerWords(c *ui.Context, text string) {
	t := a.T
	a.partnerBubble(c, a.takeJoin(), func() {
		ui.Text(c, autospace(text)).Selectable().CopyData(autospaceCopy).FontSize(t.PartnerSize).LineHeight(leadingFor(text, 1.5)).TextColor(t.OnPartnerBubble)
	})
}

// underBubble holds what sits under a partner bubble (the quiet row, a
// status line), set in to the bubble's text.
func (a *App) underBubble(c *ui.Context, body func()) {
	t := a.T
	ui.Column(c).Gap(t.S1).Padding(0, 0, 0, t.S4-2).MaxWidth(t.BubbleMeasure).Children(body)
}

// bare says whether a row ends on a bubble with nothing under it, so the
// next one of the same voice may stack on it.
func (a *App) bare(r row) bool {
	if r.pending != nil {
		return true
	}
	e := r.entry
	switch {
	case e == nil:
		return false
	case e.User != nil:
		return true
	case e.AI != nil:
		return len(a.replyTasks(e)) == 0 && len(a.notedFor(e)) == 0
	case e.Job != nil:
		st := e.Job.Status
		if len(a.notedFor(e)) > 0 || e.Job.Ack == nil {
			return false
		}
		if st == nil {
			return true
		}
		task := a.S.Task(st.TaskID)
		if task == nil || task.Title() == "" {
			return false // its status line shows under it
		}
		return a.chipOwner[task.ID] != e.FirstSeq
	}
	return false
}

// stacks says whether cur's first bubble stacks on prev's last one.
func (a *App) stacks(prev, cur row) bool {
	isUser := func(r row) bool { return r.pending != nil || (r.entry != nil && r.entry.User != nil) }
	if isUser(prev) != isUser(cur) || !a.bare(prev) {
		return false
	}
	if isUser(cur) {
		return true
	}
	e := cur.entry
	return e != nil && (e.AI != nil || (e.Job != nil && e.Job.Ack != nil))
}

// relayWait is how long a task's question waits for the partner's own
// words before its own wording stands in (D129; measured 3–10 s).
var relayWait = 60 * time.Second

// relayDueIn is how long until a task's question may show in the task's
// own words: while the partner is putting it into its own, its waiting
// presence holds the place. Zero once late or offline.
func (a *App) relayDueIn(d *store.DecisionState) time.Duration {
	if d.TaskID == "" || d.Said != "" || a.Status != client.Connected {
		return 0
	}
	at := store.ParseTime(d.AskedAt)
	if at.IsZero() {
		return 0
	}
	return max(0, relayWait-a.Now().Sub(at))
}

// answeredWords says how an ask was answered, in the user's own words:
// "你说：好，rebase" / "You said: Rebase"; a default that applied says so.
func (a *App) answeredWords(d *store.DecisionState) string {
	if d.Call != nil && d.Call.Kind == "question" {
		return a.callAnswered(d) // D189: a question from the line, answered
	}
	if d.Call != nil && d.Call.Kind == "sheet" && (d.Pending == "go" || (d.Resolved != nil && d.Resolved.Option == "go")) {
		return a.L.T("call.sheet.went") // D215: they called it themselves
	}
	if d.Call != nil && ((d.Resolved != nil && d.Resolved.Now) || (d.Resolved == nil && d.Pending == "go" && a.ph().now[d.DecisionID])) {
		return a.L.T("call.now.done") // D208: Call now
	}
	opt, text, by := d.Pending, "", ""
	if d.Resolved != nil {
		opt, text, by = d.Resolved.Option, d.Resolved.Text, d.Resolved.By
	}
	switch {
	case by == "default":
		return a.L.T("decision.resolved.default")
	case opt == "reply":
		return a.L.T("decision.resolved.reply", text)
	case opt == "hold" && d.Where != nil:
		return a.L.T("where.ask.waited", d.Where.Device)
	case opt == "hold":
		return a.L.T("decision.resolved.hold")
	}
	return a.L.T("decision.resolved.go", a.goLabel(d))
}

// answeredLine is an answered ask: one tiny line on the user's side.
func (a *App) answeredLine(c *ui.Context, d *store.DecisionState) {
	t := a.T
	ui.Row(c.Key("said:"+d.DecisionID)).Padding(0, t.S2, 0, 0).Children(func() {
		ui.Spacer(c)
		ui.Text(c, autospace(a.answeredWords(d))).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.4).MaxLines(2).MaxWidthPercent(72)
	})
}

// decisionTray is an open ask's one compact card under its question:
// Reply… · Hold as quiet text, Go last and named by the action (D76), the
// reply field when open; then the default in one small grey line, with
// Details when a task asks.
func (a *App) decisionTray(c *ui.Context, d *store.DecisionState, task *store.Task, key string, details bool) {
	t := a.T
	about := a.decisionAbout(d)
	ui.Column(c.Key("tray:" + d.DecisionID)).Gap(t.S2).MaxWidth(t.BubbleMeasure).MaxWidthPercent(84).Children(func() {
		card := ui.Column(c).Gap(t.S2).Padding(t.S2, t.S2, t.S2, t.S2).Radius(t.RadiusMD).Background(t.Surface).
			Border(1, t.Line).Shadow(0, t.Raised.Y-1, 0, 0, t.Raised.Color)
		card.Children(func() {
			ui.Row(c.Key("decide:" + d.DecisionID)).Gap(t.S1).Wrap().AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, a.L.T("decision.reply"), about, btnText, t.ControlSM, t.Surface) {
					a.replyOpen[d.DecisionID] = !a.replyOpen[d.DecisionID]
				}
				if a.buttonFor(c, a.holdLabel(d), about, btnText, t.ControlSM, t.Surface) {
					a.Decide(d.DecisionID, "hold", "")
				}
				ui.Spacer(c)
				if a.buttonFor(c, a.goLabel(d), about, btnPrimary, t.ControlSM, t.Surface) {
					a.Decide(d.DecisionID, "go", "")
				}
			})
			if a.replyOpen[d.DecisionID] {
				a.replyField(c, d)
			}
		})
		a.underBubble(c, func() {
			ui.Row(c).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
				if line := a.defaultLine(c, d); line != "" {
					ui.Text(c, line).FontSize(t.XS + 1).TextColor(t.InkMuted).LineHeight(1.45)
				}
				if details {
					a.detailsToggle(c, key, task.Title())
				}
			})
		})
	})
}

// replyField is an ask's reply field, under its buttons.
func (a *App) replyField(c *ui.Context, d *store.DecisionState) {
	t := a.T
	draft := a.replyDraft[d.DecisionID]
	ui.Row(c.Key("reply:"+d.DecisionID)).Gap(t.S2).Padding(t.S1, t.S1, t.S1, t.S3).Radius(t.RadiusMD).Background(t.Sunken).Children(func() {
		ui.TextArea(c, &draft).Lines(1, 4).Placeholder(a.L.T("decision.reply.placeholder")).AutoFocus().
			Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0).Grow(1).FontSize(t.MD).
			OnTextKey(func(k ui.TextKey) bool {
				if k.Key == ui.KeyEnter && k.Mods == 0 {
					if txt := k.Text(); txt != "" {
						a.Decide(d.DecisionID, "reply", txt)
						a.replyDraft[d.DecisionID] = ""
					}
					k.SetText("")
					return true
				}
				return false
			})
		if a.iconButton(c, a.L.T("composer.send"), t.ControlMD, btnPrimary, drawSend) && draft != "" {
			a.Decide(d.DecisionID, "reply", draft)
			draft = ""
		}
	})
	a.replyDraft[d.DecisionID] = draft
}
