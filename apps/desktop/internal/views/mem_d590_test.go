package views

import (
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D590: a save that waits for Nowledge Mem is one element with its title, so
// at any width it never reads 记下了 / Noted before it is in Mem, and the
// waiting words never wrap away from what waits.
func TestD590WaitingSaveIsOneLine(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		title := map[i18n.Lang]string{i18n.ZH: "喜欢深色模式", i18n.EN: "Likes dark mode"}[lang]
		for _, w := range []int{1000, 1150, 1400} {
			app, _ := d329Conversation(t, lang)
			tt := d329Tester(app, w, 760, false)
			if !hasText(tt, L.T("memory.waiting", title)) {
				t.Fatalf("%s %d: no %q in %q", lang, w, L.T("memory.waiting", title), tt.Texts())
			}
			if hasText(tt, L.T("memory.noted", title)) {
				t.Errorf("%s %d: a waiting save reads %q", lang, w, L.T("memory.noted", title))
			}
		}
	}
}

// D590: what the person sees of Mem out of reach, at 1150 in both themes and
// languages: the conversation's Noted lines (one waiting for Mem) and the
// Memory pane's head when Mem's sign-in has lapsed, each with a 2x crop.
//
//	DUCTER_D590_SHOTS=$PWD/../../../../.shots/mem-d590/after go test ./internal/views -run D590Shots
func TestD590Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_D590_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D590_SHOTS not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	save := func(img image.Image, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, dark := range []bool{false, true} {
			theme := map[bool]string{false: "light", true: "dark"}[dark]
			// The conversation: the Noted lines under the reply.
			app, _ := d329Conversation(t, lang)
			tt := d329Tester(app, 1150, 760, dark)
			tt.SetScale(2)
			tt.Frame()
			save(tt.Image(), "mac-noted-"+string(lang)+"-1150-"+theme)
			if undo, ok := tt.Find(L.T("memory.undo")); ok {
				s := float32(tt.Image().Bounds().Dx()) / 1150
				save(cropShot(tt.Image(), image.Rect(int(170*s), int((undo.Y-80)*s), int(800*s), int((undo.Y+100)*s))), "mac-noted-"+string(lang)+"-"+theme+"-crop")
			}
			// The Memory pane, signed out: the head says what it costs, the fix beside it.
			mapp, _ := memHealthApp(t, lang, &protocol.MemHealth{Issue: "signed_out"}, nil)
			mt := ui.NewTesterWith(mapp.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			mt.SetDark(dark)
			mt.SetScale(2)
			for i := 0; i < 6; i++ {
				mt.Advance(150_000_000)
				mt.Frame()
			}
			save(mt.Image(), "mac-memory-signedout-"+string(lang)+"-1150-"+theme)
			head := L.T("need.mem.signed_out")
			if h, ok := mt.Find(head); ok {
				s := float32(mt.Image().Bounds().Dx()) / 1150
				save(cropShot(mt.Image(), image.Rect(int((h.X-60)*s), int((h.Y-40)*s), int((h.X+820)*s), int((h.Y+h.H+150)*s))), "mac-memory-signedout-"+string(lang)+"-"+theme+"-crop")
			} else {
				t.Logf("%s: head %q not found in %q", lang, head, strings.Join(mt.Texts(), " | "))
			}
		}
	}
}
