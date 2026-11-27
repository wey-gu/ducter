package views

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D624: a Keep's held PR rows carry what a board used to show (CI, draft, a
// conflict or changes, the head), at the common laptop width, zh, light and dark.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/no-boards/mac go test ./internal/views -run NoBoardsShots -count=1
func TestNoBoardsShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	now := time.Now().UTC()
	keep := protocol.KeepSheet{
		ID: "kp_rev", Title: "持续评审 nowledge-co", Life: "on", Run: "same", Since: now.Add(-72 * time.Hour).Format(time.RFC3339Nano),
		Wakes: []protocol.KeepWake{{Kind: "every", EveryMs: 45 * 60_000}},
		Items: []protocol.KeepItem{
			{TaskID: "t_11030", Title: "Fix lint in the importer", At: "work", PR: "nowledge-co/mem#11030", Said: &protocol.PRSaid{Phase: "changes", By: []string{"hawkingrei"}, Checks: &protocol.PRChecksSaid{Passed: 9, Total: 10, Pending: 1}, Draft: true, Sha: "b2c3d4e"}},
			{TaskID: "t_10932", Title: "Keep the pinned message when the window trims", At: "rest", PR: "nowledge-co/mem#10932", Said: &protocol.PRSaid{Phase: "conflict", Checks: &protocol.PRChecksSaid{Passed: 3, Total: 4, Pending: 0}, Sha: "f098abc"}},
			{TaskID: "t_10847", Title: "Search: rank exact titles first", At: "ready", PR: "nowledge-co/mem#10847", Said: &protocol.PRSaid{Phase: "ready", By: []string{"wey-gu"}, Checks: &protocol.PRChecksSaid{Passed: 4, Total: 4, Pending: 0}, Sha: "0c0ffee"}},
		},
		Week: 12,
	}
	page := &protocol.KeepPage{KeepSheet: keep, Said: "每 45 分钟 review 一轮 nowledge-co 分给我的 PR；有需要我定的再问我。", Editable: []string{"said", "every"}, Rounds: []protocol.KeepRound{
		{At: now.Add(-12 * time.Minute).Format(time.RFC3339Nano), Woke: "change", WokeWhat: "PR #11030 推上回应评审的新提交", Spoke: "silent", State: "done", TaskID: "t_11030"},
		{At: now.Add(-57 * time.Minute).Format(time.RFC3339Nano), Woke: "time", Spoke: "silent", State: "done"},
	}}
	for _, dark := range []bool{false, true} {
		paper := "light"
		if dark {
			paper = "dark"
		}
		app, _ := iaApp(t, i18n.ZH)
		app.LocaleFixed = true
		app.Status = 2
		app.S.Welcomed = true
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Keeps: []protocol.KeepSheet{keep}}})
		app.S.KeepPages = map[string]*protocol.KeepPage{"kp_rev": page}
		app.Route, app.oh.keep = RouteOnHand, keepState{open: "kp_rev"}
		tt := ui.NewTesterWith(app.View, 1150, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		if dark {
			tt.SetDark(true)
		}
		tt.Move(2, 2)
		for i := 0; i < 4; i++ {
			tt.Frame()
		}
		name := fmt.Sprintf("mac-keep-%s.png", paper)
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, tt.Image())
		f.Close()
		// A 2x crop of the held rows, where the facts are.
		src := tt.Image()
		r := image.Rect(0, 250, 1150, 560).Intersect(src.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
		for y := 0; y < r.Dy(); y++ {
			for x := 0; x < r.Dx(); x++ {
				draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
			}
		}
		cf, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-keep-%s-crop.png", paper)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(cf, out)
		cf.Close()
	}
}
