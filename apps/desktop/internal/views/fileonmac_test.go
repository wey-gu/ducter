package views

import (
	"bytes"
	"image"
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

// D578: a file card is a file on a Mac. Right-click has Open and Save a
// copy, and Show in Finder once the file is on this Mac (a copy saved, or the
// file sent from here); the viewer's bar says it too. A card drags out as the
// file: its copy is fetched as the pointer comes over it.
func TestFileOnMac(t *testing.T) {
	app, h, refs := fileApp(t, i18n.EN)
	h.dir = t.TempDir()
	tt := mediaTester(app, 1150, 900)
	card := "Open investigation.md"

	// Not on this Mac yet: no Show in Finder anywhere.
	if err := tt.RightClick(card); err != nil {
		t.Fatal(err)
	}
	menu := strings.Join(tt.Menu(), "|")
	if !strings.Contains(menu, "Open") || !strings.Contains(menu, "Save a copy") || strings.Contains(menu, "Show in Finder") {
		t.Fatalf("the card's menu before a copy: %q", menu)
	}
	if err := tt.ChooseMenuItem("Save a copy"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	saved := filepath.Join(h.dir, "investigation.md")
	if b, err := os.ReadFile(saved); err != nil || !bytes.Equal(b, []byte(reportMD(false))) {
		t.Fatalf("Save a copy from the menu: %v", err)
	}

	// Saved: Show in Finder, from the card and from the viewer's bar.
	if err := tt.RightClick(card); err != nil {
		t.Fatal(err)
	}
	if err := tt.ChooseMenuItem("Show in Finder"); err != nil {
		t.Fatalf("the menu after a copy: %q (%v)", tt.Menu(), err)
	}
	tt.Frame()
	if len(h.revealed) != 1 || h.revealed[0] != saved {
		t.Fatalf("Show in Finder from the card: %q", h.revealed)
	}
	app.OpenFile(refs[0], ui.Rect{})
	tt.Frame()
	tt.Frame()
	click(t, tt, "Show in Finder")
	if len(h.revealed) != 2 || h.revealed[1] != saved {
		t.Fatalf("Show in Finder from the viewer: %q", h.revealed)
	}
	app.fileView = nil
	tt.Frame()

	// Moved away (or changed): no longer offered.
	os.Rename(saved, saved+".moved")
	app.media.onMacSeen = nil
	if p := app.fileOnMac(refs[0]); p != "" {
		t.Errorf("a file moved away is still on this Mac: %q", p)
	}

	// A drag out: over the card, its copy is fetched once, under the task's name.
	code := refs[2]
	if app.dragPath(code) != "" {
		t.Fatalf("a copy before the pointer came")
	}
	r, ok := tt.Find("media.go")
	if !ok {
		t.Fatalf("no media.go card: %s", texts(tt))
	}
	tt.Move(r.X+r.W/2, r.Y+r.H/2)
	tt.Frame()
	tt.Frame()
	p := app.dragPath(code)
	if b, err := os.ReadFile(p); err != nil || filepath.Base(p) != "media.go" || string(b) != fixGo {
		t.Fatalf("the drag's copy: %q, %v", p, err)
	}

	// A file the person sent from this Mac is that very file.
	mine := filepath.Join(t.TempDir(), "notes.txt")
	os.WriteFile(mine, []byte("the plan, as I wrote it\n"), 0o600)
	app.AddPictureFiles("conv", []string{mine})
	var sent *protocol.MediaRef
	for i := 0; i < 20 && sent == nil; i++ {
		tt.Advance(50 * time.Millisecond)
		tt.Frame()
		if tray := app.med().trays["conv"]; len(tray) > 0 && tray[0].ref != nil {
			sent = tray[0].ref
		}
	}
	if sent == nil {
		t.Fatal("the file didn't go up")
	}
	if got := app.fileOnMac(*sent); got != mine {
		t.Errorf("the sent file's place: %q, want %q", got, mine)
	}
}

// Shots (D75: outside git), the Mac at 1150 with 2x crops of the menu and the bar:
//
//	DUCTER_CONVENTIONS_SHOTS=../../../../.shots/conventions-2 go test ./internal/views -run FileOnMacShots
func TestFileOnMacShots(t *testing.T) {
	dir := os.Getenv("DUCTER_CONVENTIONS_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_CONVENTIONS_SHOTS not set")
	}
	os.MkdirAll(dir, 0o755)
	save := func(img image.Image, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		png.Encode(f, img)
	}
	crop := func(tt *ui.Tester, r ui.Rect, pad float32) image.Image {
		img := tt.Image()
		s := float32(img.Bounds().Dx()) / 1150
		x0, y0 := int((r.X-pad)*s), int((r.Y-pad)*s)
		x1, y1 := int((r.X+r.W+pad)*s), int((r.Y+r.H+pad)*s)
		return img.SubImage(image.Rect(max(0, x0), max(0, y0), min(img.Bounds().Dx(), x1), min(img.Bounds().Dy(), y1)))
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			l := string(lang)
			if dark {
				l += "-dark"
			}
			app, h, refs := fileApp(t, lang)
			h.dir = t.TempDir()
			tt := ui.NewTesterWith(app.View, 1150, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetScale(2)
			tt.SetDark(dark)
			tt.Frame()
			tt.Frame()
			app.saveFileCopy(refs[0])
			tt.Advance(time.Second)
			tt.Frame()
			card := app.L.T("media.fileOpen", "investigation.md")
			if err := tt.RightClick(card); err != nil {
				t.Fatal(err)
			}
			tt.Frame()
			save(tt.Image(), "mac-1150-"+l+"-1-card-menu")
			if r, ok := tt.Find(app.L.T("file.reveal")); ok {
				save(crop(tt, ui.Rect{X: r.X - 120, Y: r.Y - 110, W: r.W + 260, H: r.H + 140}, 0), "mac-1150-"+l+"-1b-card-menu-crop@2x")
			}
			tt.CloseMenu()
			tt.Frame()
			app.OpenFile(refs[0], ui.Rect{})
			tt.Advance(time.Second)
			tt.Frame()
			tt.Frame()
			save(tt.Image(), "mac-1150-"+l+"-2-viewer")
			if r, ok := tt.Find(app.L.T("file.reveal")); ok {
				save(crop(tt, ui.Rect{X: r.X - 40, Y: r.Y - 24, W: 640, H: r.H + 48}, 0), "mac-1150-"+l+"-2b-viewer-bar-crop@2x")
			}
			if r, ok := tt.Find("investigation.md"); ok {
				save(crop(tt, ui.Rect{X: r.X - 80, Y: r.Y - 30, W: 420, H: 80}, 0), "mac-1150-"+l+"-2c-viewer-head-crop@2x")
			}
		}
	}
}
