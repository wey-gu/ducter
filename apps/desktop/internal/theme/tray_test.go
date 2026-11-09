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
