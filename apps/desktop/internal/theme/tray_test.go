package theme

import (
	"bytes"
	"image/png"
	"os"
	"testing"
)

// The menu bar extra's icon is a 36-pixel template image: black on
// transparent, with the eyes cut out. DUCTER_TRAY_PNG=<path> saves it.
func TestTrayIcon(t *testing.T) {
	b := TrayIcon()
	img, err := png.Decode(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	if w, h := img.Bounds().Dx(), img.Bounds().Dy(); w != 36 || h != 36 {
		t.Fatalf("size %dx%d", w, h)
	}
	if _, _, _, a := img.At(18, 30).RGBA(); a == 0 {
		t.Errorf("the body is empty")
	}
	if _, _, _, a := img.At(13, 18).RGBA(); a != 0 {
		t.Errorf("the eye is not cut out")
	}
	if p := os.Getenv("DUCTER_TRAY_PNG"); p != "" {
		_ = os.WriteFile(p, b, 0o644)
	}
}

// D306: three states, no number. Quiet and working are templates; only
// needs you is in colour, with the accent's dot and a gap around it.
func TestTrayStates(t *testing.T) {
	quiet, tq := TrayIconFor(TrayQuiet, false)
	work, tw := TrayIconFor(TrayWorking, false)
	needs, tn := TrayIconFor(TrayNeedsYou, false)
	needsDark, _ := TrayIconFor(TrayNeedsYou, true)
	if !tq || !tw || tn {
		t.Fatalf("templates: quiet %v working %v needs %v", tq, tw, tn)
	}
	if bytes.Equal(quiet, work) || bytes.Equal(quiet, needs) || bytes.Equal(needs, needsDark) {
		t.Fatalf("the states draw the same")
	}
	w, _ := png.Decode(bytes.NewReader(work))
	if _, _, _, a := w.At(13, 16).RGBA(); a == 0 {
		t.Errorf("working: the eyes should look down, not stay round")
	}
	if _, _, _, a := w.At(13, 19).RGBA(); a != 0 {
		t.Errorf("working: the eye slit is not cut out")
	}
	img, _ := png.Decode(bytes.NewReader(needs))
	r, g, b, a := img.At(29, 7).RGBA()
	d := TrayDot()
	if a>>8 != 255 || r>>8 != uint32(d.R) || g>>8 != uint32(d.G) || b>>8 != uint32(d.B) {
		t.Errorf("needs you: the dot is %d,%d,%d,%d", r>>8, g>>8, b>>8, a>>8)
	}
	if r>>8 > 0xF0 && g>>8 < 0x60 && b>>8 < 0x60 {
		t.Errorf("the dot is red")
	}
	if _, _, _, a := img.At(23, 9).RGBA(); a != 0 {
		t.Errorf("needs you: no gap between the dot and the pebble")
	}
	dk, _ := png.Decode(bytes.NewReader(needsDark))
	if r, _, _, _ := dk.At(18, 28).RGBA(); r>>8 < 0xC0 {
		t.Errorf("needs you on a dark bar: the pebble should be light")
	}
	if p := os.Getenv("DUCTER_TRAY_DIR"); p != "" {
		for name, b := range map[string][]byte{"quiet": quiet, "working": work, "needs-light": needs, "needs-dark": needsDark} {
			_ = os.WriteFile(p+"/tray-"+name+".png", b, 0o644)
		}
	}
}
