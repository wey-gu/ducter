package views

import (
	"fmt"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The first five minutes, in the client: starters about this Mac in the
// empty conversation, and one small celebration of the first result.

// suggestions are the three starters of the empty conversation: about the
// repos this Mac touched most recently (names from `ducter up`, never
// contents), topped up with everyday ones.
func (a *App) suggestions() []string {
	var out []string
	for i, r := range a.Local.Repos() {
		if i >= 3 {
			break
		}
		out = append(out, a.L.T(fmt.Sprintf("suggest.repo.%d", i+1), r.Path))
	}
	for i := 1; len(out) < 3; i++ {
		out = append(out, a.L.T(fmt.Sprintf("suggest.%d", i)))
	}
	return out
}

// FirstResultFor is how long the first-result line stays.
const FirstResultFor = 14 * time.Second

// firstResult is the first task that ever came back done on this Mac.
type firstResult struct {
	taskID string
	at     time.Time
}

// noteFirstResult starts the celebration when a live task comes back done
// for the first time on this Mac: once, ever, never on replays.
func (a *App) noteFirstResult(st protocol.TaskState) {
	if a.firstDone != nil || a.Local.FirstResultSeen() {
		return
	}
	for id, t := range a.S.Tasks {
		if id != st.TaskID && t.Attention() == protocol.Done {
			return // the Log already holds a finished task: not the first
		}
	}
	a.firstDone = &firstResult{taskID: st.TaskID, at: a.Now()}
	a.Local.MarkFirstResultSeen(a.Now())
}

// firstResultLine is the celebration: the clay character holding up its
// finished pebble, one line, and Got it. It rises in once (still under
// reduced motion) and leaves by itself.
func (a *App) firstResultLine(c *ui.Context) {
	f := a.firstDone
	if f == nil || f.at.IsZero() {
		return
	}
	left := f.at.Add(FirstResultFor).Sub(a.Now())
	if left <= 0 {
		f.at = time.Time{}
		return
	}
	c.After(left)
	t := a.T
	a.aboveComposer(c, func() {
		row := a.notice(c, "firstresult", noticeDone, func() {
			if bmp := theme.Art(theme.Done, 112); bmp != nil {
				ui.Image(c, bmp).Size(40, 40).Margin(-4, 0).Shrink(0)
			} else {
				a.glyphTile(c, 28, t.Surface, drawCheck(t.Done.Ink))
			}
		}, func() {
			line := ui.Text(c, a.L.T("firstresult.line")).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink).
				LineHeight(1.45).Cursor(ui.CursorPointer)
			if line.Clicked() && f.taskID != "" {
				a.OpenTask(f.taskID)
			}
		}, func() {
			if a.button(c, a.L.T("firstresult.ok"), btnText, t.ControlSM, t.Surface) {
				f.at = time.Time{}
			}
		})
		row.Label(a.L.T("firstresult.line"))
	})
}
