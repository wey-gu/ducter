package views

// D142: the Changes of a task in a folder that isn't a git repo. What it did
// in one plain sentence ("整理了 42 个文件，新建了 6 个文件夹"), until when it
// can be undone (quietly), 改回去 / Undo all changes and 就这样 / Keep the
// changes, and the list on request, each line with its own undo.

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// askFolder asks core for a folder task's list, once at a time; asked again
// while one is out, it asks once more when the answer lands (Applied).
func (a *App) askFolder(id string) {
	if a.folderAsked[id] > 0 {
		a.folderAsked[id] = 2
		return
	}
	a.folderAsked[id] = 1
	a.send(protocol.FolderChangesReq{T: "folder_changes", TaskID: id})
}

// folderSentence says what a task did to the folder in one line.
func (a *App) folderSentence(f *protocol.FolderSummary) string {
	n := func(key string, k int) string {
		if k == 1 {
			return a.L.T(key + ".one")
		}
		return a.L.T(key, k)
	}
	var parts []string
	if f.Moved > 0 && f.Folders > 0 {
		parts = append(parts, a.L.T("folder.movedInto", f.Moved, f.Folders))
	} else {
		if f.Moved > 0 {
			parts = append(parts, n("folder.moved", f.Moved))
		}
		if f.Folders > 0 {
			parts = append(parts, n("folder.folders", f.Folders))
		}
	}
	for _, p := range []struct {
		key string
		k   int
	}{{"folder.renamed", f.Renamed}, {"folder.added", f.Added}, {"folder.changed", f.Changed}, {"folder.removed", f.Removed}} {
		if p.k > 0 {
			parts = append(parts, n(p.key, p.k))
		}
	}
	s := strings.Join(parts, a.L.T("folder.sep"))
	if s != "" && s[0] >= 'a' && s[0] <= 'z' {
		s = strings.ToUpper(s[:1]) + s[1:]
	}
	return s
}

// folderUntil is the quiet line under it: until when it can be undone, or
// what became of it.
func (a *App) folderUntil(task *store.Task, f *protocol.FolderSummary) string {
	switch f.Undo {
	case "undone":
		return a.L.T("folder.undone")
	case "kept":
		return a.L.T("folder.kept")
	case "expired":
		return a.L.T("folder.expired")
	case "none":
		return ""
	}
	if !finished(task) {
		return a.L.T("folder.working")
	}
	if when, err := time.Parse(time.RFC3339, f.UndoUntil); err == nil {
		l := when.Local()
		return a.L.T("folder.until", a.L.T("folder.date", int(l.Month()), l.Day(), l.Month().String()[:3]))
	}
	return a.L.T("folder.anytime")
}

// folderSummary is the freshest count: the list's, else the card's.
func folderSummary(task *store.Task) *protocol.FolderSummary {
	if task.Folder != nil {
		return &task.Folder.FolderSummary
	}
	if task.Card != nil && task.Card.Folder != nil {
		return task.Card.Folder
	}
	return nil
}

// folderChanges is the Changes section of a folder task. Nothing shows until
// it changed something (D127), and after an undo only the line that says so.
func (a *App) folderChanges(c *ui.Context, task *store.Task) {
	t := a.T
	f := folderSummary(task)
	if f == nil || (!f.Any() && f.Undo != "undone") {
		return
	}
	open := f.Undo == "open"
	ui.Column(c.Key("folder-changes")).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Baseline).Wrap().Children(func() {
			a.sectionTitle(c, a.L.T("task.side.changes"))
			if s := a.folderSentence(f); s != "" && f.Undo != "undone" {
				ui.Text(c, s).FontSize(t.MD).LineHeight(leadingFor(s, 1.5)).TextColor(t.Ink)
			}
		})
		if line := a.folderUntil(task, f); line != "" {
			ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted)
		}
		if !open {
			return
		}
		// What would be lost: the folder changed after the task finished.
		if cf := a.folderConfirm[task.ID]; cf != nil {
			names := make([]string, 0, len(cf.Files))
			for _, p := range cf.Files {
				names = append(names, lastPart(p))
			}
			if cf.Count > len(cf.Files) {
				names = append(names, "…")
			}
			key := "folder.confirm"
			if cf.Count == 1 {
				key = "folder.confirm.one"
			}
			msg := a.L.T(key, cf.Count, strings.Join(names, a.L.T("folder.sep")))
			ui.Column(c.Key("folder-confirm")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusLG).Background(t.Surface).
				Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Children(func() {
				ui.Text(c, msg).FontSize(t.MD).LineHeight(leadingFor(msg, 1.5)).TextColor(t.Ink).MaxWidth(readMeasure)
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					if a.button(c.Key("fc-go"), a.L.T("folder.confirm.go"), btnPrimary, t.ControlSM, t.Surface) {
						delete(a.folderConfirm, task.ID)
						task.Acting = "undo"
						a.send(protocol.TaskAction{T: "task_action", TaskID: task.ID, Action: "undo", Force: true})
					}
					if a.button(c.Key("fc-no"), a.L.T("folder.confirm.no"), btnText, t.ControlSM, t.Surface) {
						delete(a.folderConfirm, task.ID)
					}
				})
			})
		} else if finished(task) {
			ui.Row(c.Key("folder-actions")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if task.Acting == "undo" || task.Acting == "keep" {
					ui.Spinner(c).Size(16, 16)
					return
				}
				if a.button(c.Key("f-undo"), a.L.T("folder.undo"), btnSecondary, t.ControlSM, t.Bg) {
					task.Acting = "undo"
					a.send(protocol.TaskAction{T: "task_action", TaskID: task.ID, Action: "undo"})
				}
				if a.button(c.Key("f-keep"), a.L.T("folder.keep"), btnText, t.ControlSM, t.Bg) {
					task.Acting = "keep"
					a.send(protocol.TaskAction{T: "task_action", TaskID: task.ID, Action: "keep"})
				}
			})
		}
		a.folderList(c, task)
	})
}

// folderList is the list behind the sentence, behind one quiet link.
func (a *App) folderList(c *ui.Context, task *store.Task) {
	t := a.T
	key := "folder-list:" + task.ID
	if !a.open[key] {
		if a.quietLink(c, key, a.L.T("folder.list"), a.L.T("folder.list")) {
			a.open[key] = true
			a.askFolder(task.ID)
		}
		return
	}
	l := task.Folder
	if l == nil {
		ui.Text(c, a.L.T("task.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		return
	}
	ui.Column(c.Key("folder-rows")).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Clip().
		Dividers(1, t.LineSoft).Children(func() {
		for i := range l.Files {
			a.folderRow(c.Key(l.Files[i].Kind+":"+l.Files[i].Path), task, l.Files[i], finished(task) && l.Undo == "open")
		}
		if l.More > 0 {
			ui.Row(c).Padding(t.S3, t.S4).Children(func() {
				ui.Text(c, a.L.T("folder.more", l.More)).FontSize(t.SM).TextColor(t.InkMuted)
			})
		}
	})
}

// folderRow is one change: a verb and the path (where it was → where it is
// for a move), and, on hover, its own undo.
func (a *App) folderRow(c *ui.Context, task *store.Task, f protocol.FolderChange, undo bool) {
	t := a.T
	var text string
	switch {
	case f.Kind == "moved":
		text = f.From + "  →  " + f.Path
	case f.Kind == "added" && f.Dir:
		text = a.L.T("folder.row.dir", f.Path)
	case f.Kind == "added":
		text = a.L.T("folder.row.added", f.Path)
	case f.Kind == "removed" && f.Dir:
		text = a.L.T("folder.row.removedDir", f.Path)
	case f.Kind == "removed":
		text = a.L.T("folder.row.removed", f.Path)
	default:
		text = a.L.T("folder.row.changed", f.Path)
	}
	col := t.InkSoft
	if f.Kind == "removed" {
		col = t.Failed.Ink
	}
	row := ui.Row(c).Gap(t.S3).Padding(t.S2, t.S4).AlignItems(ui.Center)
	row.Children(func() {
		ui.Text(c, text).FontSize(t.SM).TextColor(col).Grow(1).MinWidth(0).SingleLine().Selectable()
		if undo && !f.Dir && row.Hovered() {
			if a.quietLink(c, "restore:"+task.ID+":"+f.Path, a.L.T("folder.row.restore"), a.L.T("folder.row.restore")+" · "+lastPart(f.Path)) {
				a.send(protocol.TaskAction{T: "task_action", TaskID: task.ID, Action: "undo", Path: f.Path})
			}
		}
	})
}

// lastPart is a path's file name.
func lastPart(p string) string {
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}
