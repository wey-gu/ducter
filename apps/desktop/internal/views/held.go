package views

import (
	"encoding/json"
	"slices"
	"sort"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D325: the composer while a task works. Return steers (it reads it at its
// next step, and its bubble says when it did); ⌥ Return holds the words at
// the home for after this turn, shown as chips over the composer, each
// changed in place, taken back, or said now. An agent that can't steer
// holds them either way, and the composer says so.

// heldEdit is the one held message being changed in place.
type heldEdit struct {
	taskID, id, text string
}

// HeldOp changes one held message ("edit", with text), takes it back
// ("drop"), or says it now ("now"): shown at once, sent to the home, whose
// next card confirms it.
func (a *App) HeldOp(taskID, id, op, text string) {
	task := a.S.Tasks[taskID]
	if task == nil || task.Card == nil {
		return
	}
	i := slices.IndexFunc(task.Card.Held, func(h protocol.HeldMsg) bool { return h.ID == id })
	if i < 0 {
		return
	}
	h := task.Card.Held[i]
	held := slices.Clone(task.Card.Held)
	switch op {
	case "edit":
		text = strings.TrimSpace(text)
		if text == "" || text == h.Text {
			return
		}
		held[i].Text = text
	case "drop", "now":
		held = slices.Delete(held, i, i+1)
		if op == "now" {
			// A bubble at once, like anything sent (acked by its own id).
			task.Sends = append(task.Sends, &store.Send{Text: h.Text, ClientID: h.ID, At: a.Now(), Media: h.Media})
		}
	default:
		return
	}
	task.Card.Held = held
	f := protocol.TaskHeld{T: "task_held", TaskID: taskID, ID: id, Op: op}
	if op == "edit" {
		f.Text = text
	}
	a.send(f)
}

// heldChips is what the person held for after this turn, in order, over the
// task's composer: small dashed rows, the words on one line (a click edits
// them in place: Return saves, Esc cancels), 现在就说 (only where its agent
// can steer, or once it is idle) and a quiet ×.
func (a *App) heldChips(c *ui.Context, task *store.Task, working, steers bool) {
	if task.Card == nil || len(task.Card.Held) == 0 {
		return
	}
	t := a.T
	held := task.Card.Held
	// D348: nothing running (stopped, or the turn ended without taking them):
	// "this turn" is gone; they go first with the person's next message.
	head := a.L.T("held.head")
	if !working {
		head = a.L.T("held.head.idle")
	} else if !steers {
		head = a.L.T("held.head.nosteer", harnessName(task.Harness()))
	}
	ui.Column(c.Key("held-q")).Gap(t.S1).Padding(0, 0, t.S2, 0).Label(head).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Baseline).Padding(0, t.S3).Children(func() {
			uiText(c, head).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().MinWidth(0).Shrink(1)
			if len(held) > 1 {
				uiText(c, itoa(int64(len(held)))).FontSize(t.XS).TextColor(t.Faint).FontFeatures("tnum").Shrink(0)
			}
		})
		for _, h := range held {
			a.heldChip(c, task, h, working, steers)
		}
	})
}

func (a *App) heldChip(c *ui.Context, task *store.Task, h protocol.HeldMsg, working, steers bool) {
	t := a.T
	editing := a.heldEditing != nil && a.heldEditing.taskID == task.ID && a.heldEditing.id == h.ID
	row := ui.Row(c.Key("hq:"+h.ID)).Gap(t.S1).AlignItems(ui.Center).MinHeight(36).Padding(2, 4, 2, 2).Radius(t.RadiusMD)
	if editing {
		row.Background(t.Surface).Border(1.5, t.Accent).Padding(4, 4, 4, t.S3)
	} else {
		row.Border(1.5, t.Faint).BorderStyle(ui.BorderDashed)
	}
	row.Children(func() {
		if editing {
			ed := a.heldEditing
			ta := ui.TextArea(c.Key("hq-edit:"+h.ID), &ed.text).Lines(1, 4).MinHeight(0).Label(a.L.T("held.edit")).
				Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0).Grow(1).FontSize(t.MD).
				OnTextKey(func(k ui.TextKey) bool {
					switch {
					case k.Key == ui.KeyEscape:
						a.heldEditing = nil
						return true
					case k.Key == ui.KeyEnter && k.Mods == 0:
						a.HeldOp(task.ID, h.ID, "edit", k.Text())
						a.heldEditing = nil
						return true
					}
					return false
				})
			if a.heldFocus {
				ta.Focus()
				a.heldFocus = false
			}
			if a.buttonFor(c, a.L.T("held.cancel"), h.Text, btnText, t.ControlSM, t.Surface) {
				a.heldEditing = nil
			}
			if a.buttonFor(c, a.L.T("held.save"), h.Text, btnSecondary, t.ControlSM, t.Surface) {
				a.HeldOp(task.ID, h.ID, "edit", ed.text)
				a.heldEditing = nil
			}
			return
		}
		words := h.Text
		w := uiText(c.Key("hq-words:"+h.ID), autospace(words)).FontSize(t.MD).TextColor(t.InkSoft).SingleLine().
			Padding(6, t.S3).Radius(t.RadiusSM).Grow(1).MinWidth(0).Role(ui.RoleButton).Focusable().Cursor(ui.CursorText).
			Label(spoken(a.L, a.L.T("held.edit"), h.Text)).Tooltip(a.L.T("held.edit"))
		if w.Hovered() {
			w.TextColor(t.Ink)
		}
		if w.Clicked() {
			a.heldEditing = &heldEdit{taskID: task.ID, id: h.ID, text: h.Text}
			a.heldFocus = true
		}
		if steers || !working {
			if a.buttonFor(c, a.L.T("held.now"), h.Text, btnText, t.ControlSM, t.Surface) {
				a.HeldOp(task.ID, h.ID, "now", "")
			}
		}
		b := ui.Box(c.Key("hq-drop:"+h.ID)).Size(28, 28).Radius(14).Label(spoken(a.L, a.L.T("held.drop"), h.Text)).Tooltip(a.L.T("held.drop")).
			Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
		fg := a.buttonLook(c, b, btnText, 28, t.Surface)
		b.Draw(drawCrossSmall(fg))
		if b.Clicked() {
			a.HeldOp(task.ID, h.ID, "drop", "")
		}
	})
}

// deliveredOf is how the person's words at seq went in (the runner's
// raw.delivered: turn, steer), from the held events.
func deliveredOf(task *store.Task, seq int64) string {
	evs := task.Events
	i := sort.Search(len(evs), func(i int) bool { return evs[i].Seq >= seq })
	if i == len(evs) || evs[i].Seq != seq {
		return ""
	}
	var b protocol.TaskEvent
	if evs[i].Kind != protocol.KindTaskEvent || evs[i].Decode(&b) != nil || len(b.Raw) == 0 {
		return ""
	}
	var raw struct {
		Delivered string `json:"delivered"`
	}
	_ = json.Unmarshal(b.Raw, &raw)
	return raw.Delivered
}

// steerReceiptKey is the receipt under a steer, only while it says
// something: sent while it works and not read yet, 它做到下一步就会看到;
// the newest one its next step took in, 它看到了.
func steerReceiptKey(task *store.Task, seq int64) string {
	if task.Reads[seq] {
		if seq == task.ReadLast {
			return "delivery.steer.read"
		}
		return ""
	}
	if task.Attention() == protocol.Working && deliveredOf(task, seq) == "steer" {
		return "delivery.steer.wait"
	}
	return ""
}

// steerReceipt draws it under the bubble, right-aligned and muted.
func (a *App) steerReceipt(c *ui.Context, task *store.Task, seq int64) {
	key := steerReceiptKey(task, seq)
	if key == "" {
		return
	}
	t := a.T
	ui.Row(c.Key("rcpt")).Justify(ui.End).Gap(5).AlignItems(ui.Center).Padding(0, t.S2).Children(func() {
		if key == "delivery.steer.read" {
			ui.Box(c).Size(12, 12).Draw(drawCheck(t.InkMuted)).Shrink(0)
		} else {
			ui.Box(c).Size(6, 6).Radius(3).Background(t.Working.Dot).Shrink(0)
		}
		uiText(c, a.L.T(key)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
	})
}
