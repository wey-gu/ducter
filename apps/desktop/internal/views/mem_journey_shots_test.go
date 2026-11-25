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

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D563: Mem signed out or out of reach: its fix sits above the rest of the
// page, right under the need that says it; all well, Nowledge Mem stays last.
func TestMemTroubleFirst(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, c := range []struct {
			h     *protocol.MemHealth
			first bool
		}{{&protocol.MemHealth{Issue: "signed_out"}, true}, {&protocol.MemHealth{Issue: "unreachable"}, true}, {&protocol.MemHealth{}, false}} {
			app, _ := memHealthApp(t, lang, c.h, nil)
			tt := ui.NewTesterWith(app.View, 1150, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			for i := 0; i < 4; i++ {
				tt.Advance(150 * time.Millisecond)
				tt.Frame()
			}
			mem, ok1 := tt.Find("Nowledge Mem")
			head, ok2 := tt.Find(L.T("mem.hero.on", app.personaName()))
			if !ok1 || !ok2 {
				t.Fatalf("%s %+v: missing a group in %q", lang, c.h, tt.Texts())
			}
			if (mem.Y < head.Y) != c.first {
				t.Errorf("%s %+v: Nowledge Mem at %v, the head at %v; want first=%v", lang, c.h, mem.Y, head.Y, c.first)
			}
		}
	}
}

// D563: the person's memory journey with Nowledge Mem, walked on the Mac at
// 1150: the first meeting in each of Mem's states, Mem going away, and the
// conversation's Remembered line with its card. Fixtures only (memApp,
// recallApp), never a real Mem.
//
//	DUCTER_MEM_JOURNEY=$PWD/../../../../.shots/mem-journey/after go test ./internal/views -run MemJourneyShots
func TestMemJourneyShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEM_JOURNEY")
	if dir == "" {
		t.Skip("DUCTER_MEM_JOURNEY not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	write := func(tt *ui.Tester, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	type st struct {
		name, state string
		health      *protocol.MemHealth
	}
	states := []st{
		{"1-fresh", "fresh", nil}, {"1-signin", "sign_in", nil}, {"1-on", "on", nil}, {"1-empty", "empty", nil},
		{"2-off", "off", nil}, {"7-old", "old", nil},
		{"7-signedout", "on", &protocol.MemHealth{Issue: "signed_out"}},
		{"7-unreachable", "on", &protocol.MemHealth{Issue: "unreachable"}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := map[bool]string{false: "light", true: "dark"}[dark]
			for _, s := range states {
				var app *App
				if s.health != nil {
					app, _ = memHealthApp(t, lang, s.health, nil)
				} else {
					app, _ = memApp(t, lang, s.state)
					app.openTab(TabMemory)
				}
				tt := ui.NewTesterWith(app.View, 1150, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				for i := 0; i < 8; i++ {
					tt.Advance(150 * time.Millisecond)
					tt.Frame()
				}
				write(tt, fmt.Sprintf("mac-%s-%s-1150-%s", s.name, lang, paper))
				// 2x of the pane's top: the need, and the group that fixes it, meeting.
				if s.name == "7-signedout" || s.name == "1-fresh" {
					tt.SetScale(2)
					for i := 0; i < 3; i++ {
						tt.Advance(150 * time.Millisecond)
						tt.Frame()
					}
					img := tt.Image()
					f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-2x-%s-%s-%s.png", s.name, lang, paper)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(f, img.SubImage(image.Rect(560, 120, 2300, 1100)))
					f.Close()
				}
			}
			// The conversation: a reply a memory changed, then its card.
			app, _ := recallApp(t, lang)
			tt := ui.NewTesterWith(app.View, 1150, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			settle := func() {
				for i := 0; i < 6; i++ {
					tt.Advance(150 * time.Millisecond)
					tt.Frame()
				}
			}
			settle()
			write(tt, fmt.Sprintf("mac-4-recall-%s-1150-%s", lang, paper))
			if r := app.S.RecalledFor(3); r != nil {
				app.recall.open = r.Seq
			}
			settle()
			write(tt, fmt.Sprintf("mac-4-recall-card-%s-1150-%s", lang, paper))
		}
	}
}
