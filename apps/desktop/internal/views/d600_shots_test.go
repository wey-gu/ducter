package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D600: 结束任务 / End task on a finished task an open duplicate draft still
// held, at 1150 light and dark, against apps/web/demo-d600.ts (a fresh one:
// the shots end its task):
//
//	DUCTER_PORT=7601 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-d600.ts
//	DUCTER_D600_URL=ws://127.0.0.1:7601/ws DUCTER_D600_KEEP=<keep id> DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/close-task/mac go test ./internal/views -run D600Shots
func TestD600Shots(t *testing.T) {
	url := os.Getenv("DUCTER_D600_URL")
	if url == "" {
		t.Skip("DUCTER_D600_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetScale(2)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	const id = "5ykh7m6y"
	h.until("the task", func() bool { return h.app.S.Task(id) != nil })
	h.tt.SetSize(1150, 900)
	keep := os.Getenv("DUCTER_D600_KEEP")
	if keep != "" {
		h.app.openKeep(keep)
		settle()
		d302Both(t, h.app, h.tt, settle, "keep-before-1150", lang)
	}
	h.app.OpenTask(id)
	settle()
	d302Both(t, h.app, h.tt, settle, "task-before-1150", lang)
	if !endable(h.app.S.Task(id)) {
		t.Fatal("the task should be endable")
	}
	h.app.ending = id
	settle()
	d302Both(t, h.app, h.tt, settle, "end-ask-1150", lang)
	h.app.EndTask(id)
	h.until("let go", func() bool {
		tk := h.app.S.Task(id)
		return tk != nil && tk.Card != nil && len(tk.Card.PRs) > 0 && func() bool {
			for _, p := range tk.Card.PRs {
				if p.PR == "nowledge-co/mem#11179" {
					return p.LetGo != nil
				}
			}
			return false
		}()
	})
	settle()
	d302Both(t, h.app, h.tt, settle, "task-after-1150", lang)
	if keep != "" {
		h.app.openKeep(keep)
		settle()
		d302Both(t, h.app, h.tt, settle, "keep-after-1150", lang)
	}
	_ = protocol.Done
}
