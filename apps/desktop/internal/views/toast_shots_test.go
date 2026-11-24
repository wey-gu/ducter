package views

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// TestToastShots pictures the one toast slot in every place it can show,
// against the mock home: the conversation (alone, and beside the list of
// partners), On hand, Settings and an opened task, at 1000, 1150 and 1400,
// light or dark, with a still of the dwell, 2x crops round it, and frames
// of its enter and its leave.
//
//	DUCTER_TOAST_SHOTS=1 DUCTER_SHELL_LANG=zh [DUCTER_SHOTS_DARK=1] DUCTER_TOAST_NAME=after \
//	  DUCTER_SHOTS_DIR=$PWD/.shots/whats-new-notice go test ./internal/views -run TestToastShots
func TestToastShots(t *testing.T) {
	if os.Getenv("DUCTER_TOAST_SHOTS") == "" {
		t.Skip("DUCTER_TOAST_SHOTS not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	name := os.Getenv("DUCTER_TOAST_NAME")
	if name == "" {
		name = "after"
	}
	dir := shotsDir(t)
	toastsAsBefore = name == "before"
	defer func() { toastsAsBefore = false }()
	h := newHarness(t, lang)
	h.app.LocaleFixed = true
	h.tt.SetPreferences(ui.Preferences{})
	h.tt.SetScale(2) // every shot at 2x, so the crops are 2x crops
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	step := func(d time.Duration) {
		h.until("a frame", func() bool { return true })
		h.tt.Advance(d)
		h.until("a frame", func() bool { return true })
	}
	settle := func() {
		for i := 0; i < 12; i++ {
			step(200 * time.Millisecond)
		}
	}
	save := func(file string, img image.Image) {
		f, err := os.Create(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
	// crop cuts r, padded, out of the shot (drawn at 2x already).
	crop := func(img *image.RGBA, r ui.Rect, pad float32) image.Image {
		s := float32(img.Bounds().Dx()) / float32(h.app.winW)
		box := image.Rect(int((r.X-pad)*s), int((r.Y-pad)*s), int((r.X+r.W+pad)*s), int((r.Y+r.H+pad)*s)).Intersect(img.Bounds())
		out := image.NewRGBA(image.Rect(0, 0, box.Dx(), box.Dy()))
		draw.Draw(out, out.Bounds(), img, box.Min, draw.Src)
		return out
	}
	// A few real lines, so the toast is seen against messages and the composer.
	say := map[i18n.Lang][]string{
		i18n.ZH: {"把 bun 升到 1.3，lockfile 一起提交", "好，我开个任务去升，弄好了告诉你。", "顺便看看 CI 上那个偶发失败的测试", "看了：是 compaction 测试在并发下抢同一个临时目录。我让任务一起修掉，修完连跑 50 遍再告诉你。"},
		i18n.EN: {"Upgrade bun to 1.3 and commit the lockfile with it", "On it: I'll start a task and tell you when it's done.", "Also look at that flaky test on CI", "Looked: the compaction test races for one temp folder when run in parallel. I've asked the task to fix it too, and run it 50 times before telling you."},
	}[lang]
	var evs []protocol.LogEvent
	for i, s := range say {
		if i%2 == 0 {
			evs = append(evs, ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: s}))
		} else {
			evs = append(evs, ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: s}))
		}
	}
	h.app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	words := map[i18n.Lang]string{i18n.ZH: "已更新到 0.1.38", i18n.EN: "Updated to 0.1.38"}[lang]
	partners := []protocol.PartnerInfo{
		{ID: h.app.S.Persona, Name: h.app.S.PersonaName, Look: "pebble"},
		{ID: "p-mem", Name: map[i18n.Lang]string{i18n.ZH: "记忆管家", i18n.EN: "Memory keeper"}[lang], Look: "moss", Asks: 1},
		{ID: "p-site", Name: map[i18n.Lang]string{i18n.ZH: "网站", i18n.EN: "Website"}[lang], Look: "clay"},
	}
	places := []struct {
		key  string
		open func()
	}{
		{"conversation", func() { h.app.S.Partners = nil; h.app.Route = RouteConversation }},
		{"partners", func() { h.app.S.Partners = partners; h.app.Route = RouteConversation }},
		{"onhand", func() { h.app.S.Partners = nil; h.app.Route = RouteOnHand }},
		{"settings", func() { h.app.S.Partners = nil; h.app.OpenSettings() }},
		{"task", func() { h.app.S.Partners = nil; h.app.OpenTask(firstTask(h.app)) }},
	}
	if only := os.Getenv("DUCTER_TOAST_PLACES"); only != "" {
		kept := places[:0]
		for _, p := range places {
			if strings.Contains(","+only+",", ","+p.key+",") {
				kept = append(kept, p)
			}
		}
		places = kept
	}
	frames := os.Getenv("DUCTER_TOAST_FRAMES") != ""
	for _, w := range []int{1000, 1150, 1400} {
		for _, p := range places {
			h.tt.SetSize(w, 820)
			p.open()
			settle()
			base := fmt.Sprintf("%s-mac-%d-%s-%s-%s", name, w, lang, paper, p.key)
			h.app.toast(words)
			h.tt.Frame()
			// region is the slot's neighbourhood: the content column, from
			// 110 over the toast's foot to 40 under it (the composer's top).
			region := func() ui.Rect {
				x, width, y := h.app.toastBox(float32(h.app.winW), float32(h.app.winH))
				return ui.Rect{X: x, Y: y - 110, W: width, H: 150}
			}
			strip := func(file string, n int, gap time.Duration) {
				var tiles []image.Image
				for i := 0; i < n; i++ {
					tiles = append(tiles, crop(h.tt.Image(), region(), 0))
					step(gap)
				}
				tw, th := tiles[0].Bounds().Dx(), tiles[0].Bounds().Dy()
				out := image.NewRGBA(image.Rect(0, 0, tw, (th+4)*n))
				for i, tl := range tiles {
					draw.Draw(out, image.Rect(0, i*(th+4), tw, i*(th+4)+th), tl, image.Point{}, draw.Src)
				}
				save(file, out)
			}
			if frames && w == 1150 {
				// The enter: 6 frames 40 ms apart, top to bottom.
				strip(base+"-enter.png", 6, 40*time.Millisecond)
			} else {
				step(240 * time.Millisecond)
			}
			step(time.Second)
			shot := h.tt.Image()
			save(base+".png", shot)
			if r, ok := h.tt.Find(words); ok {
				save(base+"-crop2x.png", crop(shot, r, 60))
			}
			if frames && w == 1150 {
				// Dwell: the pointer resting on it holds it past its 4 s.
				if r, ok := h.tt.Find(words); ok {
					h.tt.Move(r.X+r.W/2, r.Y+r.H/2)
					for i := 0; i < 8; i++ {
						step(time.Second)
					}
					save(base+"-hover-8s.png", crop(h.tt.Image(), region(), 0))
					h.tt.Move(10, float32(h.app.winH)/2)
				}
				// The leave: run the dwell out to just before its end, then
				// 10 frames 50 ms apart.
				step(4*time.Second - 1240*time.Millisecond - 250*time.Millisecond)
				strip(base+"-leave.png", 10, 50*time.Millisecond)
			}
			// Gone before the next place.
			for i := 0; i < 40; i++ {
				step(200 * time.Millisecond)
			}
		}
	}
}

// firstTask is a task the board shows, working first.
func firstTask(a *App) string {
	b := a.S.Board()
	for _, l := range []int{1, 0, 2, 3} {
		if len(b.Lanes[l]) > 0 {
			return b.Lanes[l][0].ID
		}
	}
	return ""
}
