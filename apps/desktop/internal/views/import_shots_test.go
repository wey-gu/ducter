package views

// D651 (research/246): Past tasks with cards brought in from another app, on the Mac at 1000
// and 1400, zh and en, light and dark. The cards say 从 Lody 带进来的 / From Lody, an ending
// 带进来的 / Brought in, and one folder that is gone; their actions are Open and New task from this.
//
//	DUCTER_IMPORT_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/r246 go test ./internal/views -run ImportShots
import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

func TestImportShots(t *testing.T) {
	if os.Getenv("DUCTER_IMPORT_SHOTS") == "" {
		t.Skip("DUCTER_IMPORT_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	wanted := map[string]bool{"t_imp_wal": true, "t_imp_kyoto": true, "t_imp_old": true}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		var picked []protocol.PastItem
		for _, it := range pastItems(pastSeeds()) {
			if wanted[it.TaskID] {
				picked = append(picked, it)
			}
		}
		if lang == i18n.EN {
			picked = pastEnglish(picked)
		}
		app.OpenPast("")
		app.Receive(pastResult(picked, ""))
		app.past.focusField = false
		app.past.focus = "t_imp_wal"
		app.past.sel = "t_imp_wal"
		// Where it stopped: the person's messages as its steps (the preview doesn't wait on a socket).
		step1, step2, came := "WAL 尾部损坏的时候，回放要跳过那条记录，别整个失败。", "再加三个用例：空文件、只有一半的尾部、校验和正常。", "回放现在会截断坏掉的尾部，并记一行警告。"
		if lang == i18n.EN {
			step1, step2, came = "When the WAL's tail is torn, replay should skip that record instead of failing the whole replay.", "Add three cases: an empty file, half a tail, and a good checksum.", "Replay now cuts the torn tail and logs one warning."
		}
		app.S.Past.Steps = map[string]*protocol.PastStepsFrame{"t_imp_wal": {TaskID: "t_imp_wal", Steps: []protocol.PastStep{
			{N: 1, Seq: 1, At: "2026-11-16T09:00:00Z", Who: "you", Text: step1, Came: came},
			{N: 2, Seq: 2, At: "2026-11-16T09:20:00Z", Who: "you", Text: step2},
		}}}
		for _, mode := range []string{"light", "dark"} {
			dark := mode == "dark"
			if dark {
				app.T = theme.PebbleDark()
			} else {
				app.T = theme.Pebble()
			}
			for _, w := range []int{1000, 1400} {
				tt := ui.NewTesterWith(app.View, w, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(200 * time.Millisecond)
				}
				f, err := os.Create(filepath.Join(dir, "mac-past-import-"+mode+"-"+string(lang)+"-"+itoa(int64(w))+".png"))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					f.Close()
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
