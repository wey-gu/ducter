package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D547: the composer, polished, on the Mac: the conversation's at rest, with
// one line and with five, and an opened task's while it works (the words
// their own line, the chip and the meter, Stop apart from Send). At 1150 (the
// common laptop window) and 1400, zh and en, light and dark, with a 2x crop
// of the composer. DUCTER_D547_SHOTS=<dir> writes them (DUCTER_D547_PREFIX
// before / after).
func TestD547ComposerShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D547_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D547_SHOTS=<dir> to write the shots")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	prefix := os.Getenv("DUCTER_D547_PREFIX")
	if prefix == "" {
		prefix = "after"
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		w := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		for _, dark := range []bool{false, true} {
			for _, width := range []int{1150, 1400} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.LocaleFixed = true
				f := &v2Fixture{ascFixture: ascFixture{app: app}, zh: zh}
				evs := f.agyTask()
				evs = append(evs, f.at(2*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("把设置里的东西都过一遍", "Let's go through Settings")}))
				app.Receive(protocol.ServerFrame{T: "events", Events: evs})
				h := 900
				tt := ui.NewTesterWith(app.View, width, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				theme := "light"
				if dark {
					theme = "dark"
				}
				write := func(name string, img image.Image) {
					fh, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-mac-%s-%d-%s-%s.png", prefix, name, width, lang, theme)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(fh, img)
					fh.Close()
				}
				shot := func(name string) {
					tt.Move(4, float32(h-10))
					tt.Frame()
					tt.Frame()
					tt.Advance(time.Second)
					tt.Frame()
					write(name, tt.Image())
					tt.SetScale(2)
					tt.Frame()
					tt.Frame()
					img := tt.Image()
					b := img.Bounds()
					write(name+"-row@2x", img.SubImage(image.Rect(b.Min.X, b.Max.Y-2*220, b.Max.X, b.Max.Y)))
					tt.SetScale(1)
					tt.Frame()
				}
				shot("conv-rest")
				app.draft = w("明天上午十点提醒我给 Weizhen 回 PR #551 的评审", "Remind me at 10 tomorrow to answer Weizhen's review on PR #551")
				shot("conv-one")
				app.draft = w("帮我看一下 nowledge-co/mem 这周的 CI：\n1. 哪些 job 在 main 上红了\n2. 是不是同一个 flaky 测试\n3. 如果是，开个任务修掉它\n跑完告诉我一声就行，不用每一步都问我。",
					"Look at this week's CI on nowledge-co/mem:\n1. which jobs went red on main\n2. whether it is the same flaky test\n3. if so, start a task to fix it\nJust tell me when it's done; no need to ask at every step.")
				shot("conv-five")
				app.draft = ""
				app.OpenTask("t_agy")
				tt.Frame()
				tt.Frame()
				shot("task-run")
				app.taskDrafts["t_agy"] = w("先别动迁移脚本，只看截图里的那一屏", "Leave the migration script; only look at the screen in the shot")
				shot("task-run-typed")
			}
		}
	}
}
