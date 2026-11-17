package views

// D320: a huge single item is never laid out whole. A text cut at textMax
// (the agent's words, the person's, a brief, a report) or a step's output
// cut at outputMax shows what fits, then a quiet 显示全部 / Show all that
// opens the whole text, read from its event, in the file viewer (D239) as
// plain text, keys hidden.

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// showAll is the quiet link under a cut text; output: the step's output
// rather than its words.
func (a *App) showAll(c *ui.Context, task *store.Task, seq int64, full int, output bool) {
	t := a.T
	label := a.L.T("text.all", groupDigits(full))
	l := ui.Text(c.Key(fmt.Sprintf("all:%d", seq)), label).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label)
	if l.Hovered() {
		l.TextColor(t.Ink)
	}
	if l.Clicked() {
		a.openWholeText(task, seq, output)
	}
}

// groupDigits is n with its thousands apart (1,204,331), as the web's toLocaleString says it.
func groupDigits(n int) string {
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// wholeText is the whole text of the event with seq, keys hidden: what a
// cut block or step said.
func wholeText(task *store.Task, seq int64, output bool) string {
	i := lowerBound(task.Events, seq)
	if i >= len(task.Events) || task.Events[i].Seq != seq {
		return ""
	}
	body, _ := task.Events[i].Typed()
	s := ""
	switch b := body.(type) {
	case *protocol.TaskEvent:
		if output && b.Tool != nil {
			s = b.Tool.Output
		} else {
			s = b.Text
		}
	case *protocol.TaskOpen:
		s = b.Brief
	case *protocol.Report:
		s = b.Summary
	case *protocol.Checkpoint:
		s = b.Text
	}
	return redact.Text(strings.TrimSpace(s))
}

// openWholeText opens the whole text in the file viewer, as a plain text
// named after the task.
func (a *App) openWholeText(task *store.Task, seq int64, output bool) {
	text := wholeText(task, seq, output)
	if text == "" {
		return
	}
	name := strings.TrimSpace(task.Title())
	if name == "" {
		name = "Ducter"
	}
	ref := protocol.MediaRef{ID: fmt.Sprintf("text:%s:%d", task.ID, seq), Type: "text/plain", K: "file", Name: name + ".txt", Bytes: int64(len(text))}
	a.fileView = &fileViewState{open: true, ref: ref, text: text}
}
