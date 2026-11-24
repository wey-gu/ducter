package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// scrollTaskTo puts the opened task's page at a row: frac of the way from
// its head (0) to its end (1).
func scrollTaskTo(a *App, id string, frac float32) {
	ls := a.taskList(id)
	task := a.S.Task(id)
	if task == nil {
		return
	}
	n := len(a.memoOf(task).turns) + 2
	if frac >= 1 {
		ls.ScrollToEnd()
		return
	}
	ls.ScrollTo(int(frac*float32(n-1)), ui.Start)
}

// hoverLocator puts the pointer on the locator's rail.
func hoverLocator(a *App, tt *ui.Tester) bool {
	info, ok := tt.Access(a.L.T("locator.name"))
	if !ok {
		return false
	}
	b := info.Bounds
	tt.Move(b.X+b.W/2, b.Y+b.H/2)
	tt.Frame()
	tt.Frame()
	return true
}

// locatorWords are the locator's rows in words, every one (D325).
func locatorWords(a *App, task *store.Task) []landmarkWords {
	lms := a.locatorLandmarks(task)
	out := make([]landmarkWords, len(lms))
	for i := range lms {
		out[i] = a.landmarkWords(task, &lms[i], a.Now())
	}
	return out
}
