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

// D621: the doorbell row on a Keep's page, off, on and open (the URL with Copy and curl),
// and the ring's round, at 1150 and 1400, zh and en, light and dark, with a 2x crop of the rules
// card. A renderer run, no live home:
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/doorbell/mac go test ./internal/views -run DoorbellShots -count=1
func TestDoorbellShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	const home = "https://home.example"
	const token = "db1_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := "light"
			if dark {
				paper = "dark"
			}
			for _, w := range []int{1150, 1400} {
				app, _ := iaApp(t, lang)
				app.LocaleFixed = true
				app.Status = 2
				app.S.Welcomed = true
				keep := protocol.KeepSheet{ID: "kp_ci", Title: "看 CI / CI watch", Life: "on", Run: "same", Since: now, Wakes: []protocol.KeepWake{{Kind: "every", EveryMs: 30 * 60_000}}}
				page := &protocol.KeepPage{KeepSheet: keep, Said: "每 30 分钟看一次 CI，直到 #10473 合并为止", Editable: []string{"said", "every"}, Rounds: []protocol.KeepRound{
					{At: now, Woke: "ring", WokeWhat: "CI #42", Spoke: "silent", State: "done", TaskID: "t_ci"},
					{At: time.Now().Add(-30 * time.Minute).UTC().Format(time.RFC3339Nano), Woke: "time", Spoke: "silent", State: "done"},
				}}
				app.S.KeepPages = map[string]*protocol.KeepPage{"kp_ci": page}
				app.Route, app.oh.keep = RouteOnHand, keepState{open: "kp_ci"}
				tt := ui.NewTesterWith(app.View, w, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				if dark {
					tt.SetDark(true)
				}
				tt.Move(2, 2)
				frames := func() {
					for i := 0; i < 4; i++ {
						tt.Frame()
					}
				}
				save := func(name string) {
					f, err := os.Create(filepath.Join(dir, name))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(f, tt.Image())
					f.Close()
				}
				tag := func(state string) string { return fmt.Sprintf("mac-%s-%d-%s-%s.png", state, w, lang, paper) }
				crop := func(name string, r image.Rectangle) {
					src := tt.Image()
					r = r.Intersect(src.Bounds())
					out := image.NewRGBA(image.Rect(0, 0, r.Dx()*2, r.Dy()*2))
					for y := 0; y < r.Dy(); y++ {
						for x := 0; x < r.Dx(); x++ {
							draw.Draw(out, image.Rect(x*2, y*2, x*2+2, y*2+2), &image.Uniform{src.At(r.Min.X+x, r.Min.Y+y)}, image.Point{}, draw.Src)
						}
					}
					f, err := os.Create(filepath.Join(dir, name))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(f, out)
					f.Close()
				}

				frames()
				save(tag("off"))
				page.Bell = &protocol.KeepBell{At: now, URL: home + "/doorbell/" + token}
				app.oh.keep = keepState{open: "kp_ci"}
				frames()
				save(tag("on"))
				app.oh.keep = keepState{open: "kp_ci", bellURL: page.Bell.URL}
				app.oh.keep.edit.open = "bell"
				frames()
				save(tag("open"))
				top, ok1 := tt.Find(app.L.T("keep.rule.bell"))
				bottom, ok2 := tt.Find(app.L.T("keep.bell.done"))
				if ok1 && ok2 {
					crop(tag("open-rules-2x"), image.Rect(int(top.X)-24, int(top.Y)-20, int(top.X)+380, int(bottom.Y+bottom.H)+18))
				}
			}
		}
	}
}
