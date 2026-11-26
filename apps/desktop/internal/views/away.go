package views

// D454: 移走 / Remove: a finished card on On hand (a task that is done or
// didn't work out, or a group none of whose parts is at work) can always be
// taken off it: × and ⋯ on hover, and the same in a right click. ⋯ offers
// 再试一次 / Try again and 看看为什么 / See why for one that didn't work out,
// 打开 / Open for one that is done, and 移走 / Remove for both. Removed, it
// stays in Past tasks; the toast's 撤销 / Undo puts it back. The web draws
// the same (apps/web/src/away.tsx).

import (
	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// finishedCard is what a finished card removes, retries and opens.
type finishedCard struct {
	name      string
	taskIDs   []string
	failedIDs []string
	openID    string
	groupID   string
	// D508: a finished repo task with a branch and no PR: ⋯ offers 合进
	// {base} and 开草稿 PR (never on the row, where they pushed the time out).
	integrate bool
	base      string
	// D602: a finished task an open PR still holds: ⋯ offers 结束任务,
	// asked in place under the opened task's meta line.
	ends bool
}

// finishedMenu is what ⋯ offers, in order (the web's finishedMenu).
func finishedMenu(f finishedCard) []string {
	if len(f.failedIDs) > 0 {
		return []string{"retry", "why", "remove"}
	}
	if f.openID != "" && f.integrate {
		return []string{"merge", "open_pr", "open", "remove"}
	}
	if f.openID != "" && f.ends {
		return []string{"end", "open", "remove"}
	}
	if f.openID != "" {
		return []string{"open", "remove"}
	}
	return []string{"remove"}
}

// finishedOf is a finished task as a card that can leave On hand, or nil.
func finishedOf(task *store.Task) *finishedCard {
	att := task.Attention()
	if !store.Finished(att) {
		return nil
	}
	f := &finishedCard{name: shortTitle(task.Title()), taskIDs: []string{task.ID}, openID: task.ID}
	if att == protocol.Failed {
		f.failedIDs = []string{task.ID}
	}
	if p := task.Place(); att != protocol.Failed && p.Kind == "repo" && task.CanIntegrate() && integrated(task) == "" && !hasPR(task) && task.Acting == "" {
		f.integrate, f.base = true, p.BaseBranch
		if f.base == "" {
			f.base = "main"
		}
	}
	f.ends = endable(task)
	return f
}

// finishedGroup is a group none of whose parts works, needs the person or
// waits, as a card that can leave On hand; what waits in line counts only
// behind a stopped part (it is dropped with it).
func finishedGroup(bg boardGroup) *finishedCard {
	f := &finishedCard{name: bg.g.Name, groupID: bg.g.ID}
	var last string
	for _, r := range bg.rows {
		switch groupMark(r) {
		case "working", "needs", "waiting":
			return nil
		case "held":
			if bg.stopped == nil {
				return nil
			}
			continue
		case "failed":
			f.failedIDs = append(f.failedIDs, r.taskID)
		}
		f.taskIDs = append(f.taskIDs, r.taskID)
		last = r.taskID
	}
	if h := bg.g.Hand; h != nil && h.Plan != nil && h.Plan.TaskID != "" {
		f.taskIDs = append(f.taskIDs, h.Plan.TaskID)
	}
	if len(f.taskIDs) == 0 {
		return nil
	}
	f.openID = last
	if len(f.failedIDs) > 0 {
		f.openID = f.failedIDs[0]
	}
	return f
}

// PutAway takes a finished card (its tasks) or a group off On hand at once;
// the home keeps it off every device, and the toast's 撤销 puts it back.
func (a *App) PutAway(c *ui.Context, f finishedCard) {
	if a.S.AwayNow == nil {
		a.S.AwayNow = map[string]bool{}
	}
	fr := protocol.OnHandAway{T: "onhand_away"}
	keys := f.taskIDs
	if f.groupID != "" {
		fr.GroupID = f.groupID
		keys = append(append([]string{}, f.taskIDs...), f.groupID)
	} else {
		fr.TaskIDs = f.taskIDs
	}
	for _, k := range keys {
		a.S.AwayNow[k] = true
	}
	a.send(fr)
	if c == nil {
		return
	}
	c.AddToast(ui.Toast{ID: "away:" + keys[0], Title: a.L.T("away.done", f.name), Timeout: UndoWindow, Action: a.L.T("undo.action"), OnAction: func() {
		for _, k := range keys {
			delete(a.S.AwayNow, k)
		}
		back := fr
		back.Back = true
		a.send(back)
	}})
}

// Retry sends each task that didn't work out back to work (再试一次).
func (a *App) Retry(ids []string) {
	for _, id := range ids {
		delete(a.S.AwayNow, id)
		a.send(protocol.PastContinue{T: "past_continue", TaskID: id, Words: a.L.T("group.retry")})
	}
}

// finishedItems fills a menu with what a finished card offers; groupMenu
// leaves 移走 to the caller's end of the menu.
func (a *App) finishedItems(c *ui.Context, m *ui.Menu, f finishedCard, withRemove bool) {
	for _, k := range finishedMenu(f) {
		if k == "remove" && !withRemove {
			continue
		}
		label := a.L.T("away." + k)
		switch k {
		case "merge":
			label = a.L.T("result.merge", f.base)
		case "open_pr":
			label = a.L.T("result.pr")
		case "end":
			label = a.L.T("task.action.end")
		}
		if m.Item(label).Chosen() {
			a.runFinished(c, k, f)
		}
	}
}

func (a *App) runFinished(c *ui.Context, k string, f finishedCard) {
	switch k {
	case "retry":
		a.Retry(f.failedIDs)
	case "why", "open":
		if f.openID != "" {
			a.OpenTask(f.openID)
		}
	case "end":
		if f.openID != "" {
			a.ending = f.openID
			a.OpenTask(f.openID)
		}
	case "remove":
		a.PutAway(c, f)
	case "merge", "open_pr":
		if task := a.S.Task(f.openID); task != nil {
			task.Acting = k
			a.TaskAction(f.openID, k)
		}
	}
}

// awayX is the quiet × that removes a finished card: the shared icon
// button (a text button's square at ControlSM; D529), the same as its ⋯.
func (a *App) awayX(c *ui.Context, key string, f finishedCard) {
	t := a.T
	label := a.L.T("away.remove.about", f.name)
	b := ui.Box(c.Key(key)).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(label).Tooltip(label).
		Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
	b.Draw(drawCross(fg))
	if b.Clicked() {
		a.PutAway(c, f)
	}
}

// finishedActs is a finished row's × and ⋯, in its revealSlot (D529).
func (a *App) finishedActs(c *ui.Context, f finishedCard) {
	ui.Row(c.Key("fin")).Gap(2).AlignItems(ui.Center).Shrink(0).Children(func() {
		a.awayX(c, "x", f)
		a.finishedMore(c, f)
	})
}

// finishedMore is a finished row's ⋯ alone: on a row that already shows its
// actions (看看为什么, 再试一次) it joins that group, and its menu holds the
// remove the × would (D529).
func (a *App) finishedMore(c *ui.Context, f finishedCard) {
	a.rowMore(c, a.L.T("away.more", f.name), func(m *ui.Menu) { a.finishedItems(c, m, f, true) })
}

// rowMore is a row's quiet ⋯ (the shared icon button at ControlSM, D529)
// opening the clay menu build fills: a finished card's, a Keep's held
// item's (D602).
func (a *App) rowMore(c *ui.Context, label string, build func(m *ui.Menu)) {
	t := a.T
	b := ui.Box(c.Key("more")).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(label).
		Tooltip(label).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
	b.Draw(drawMore(fg))
	a.menuButton(c, b, build)
}
