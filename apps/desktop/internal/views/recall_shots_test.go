package views

import (
	"os"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D304: the 想起了 line, its card, the morning note's offer and 这周记下的,
// light and dark, zh and en, from the seeded demo memories only.
//
//	DUCTER_D304_FIXTURES=1 DUCTER_SHOTS_DIR=<repo>/.shots/d304/mac go test ./internal/views -run D304 -v
func TestD304Shots(t *testing.T) {
	if os.Getenv("DUCTER_D304_FIXTURES") == "" {
		t.Skip("DUCTER_D304_FIXTURES=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := recallApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		settle := func() {
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
		}
		settle()
		d302Both(t, app, tt, settle, "d304-conversation", lang)
		// The card of the line under the first answer.
		if r := app.S.RecalledFor(3); r != nil {
			app.recall.open = r.Seq
		}
		d302Both(t, app, tt, settle, "d304-recall-card", lang)
		app.recall.asking = true
		d302Both(t, app, tt, settle, "d304-recall-forget", lang)
		app.recall.open, app.recall.asking = 0, false
		// 这周记下的: one row being fixed, one checked (seeded), one fresh.
		app.openLearned("note:1")
		app.recall.fixing = 103
		app.recall.fixText = notedSeedWords[lang][2]
		tt.SetSize(1280, 1000)
		d302Both(t, app, tt, settle, "d304-learned", lang)
		tt.SetSize(900, 1000)
		d302Both(t, app, tt, settle, "d304-learned-900", lang)
	}
}
