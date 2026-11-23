package theme

import (
	"fmt"
	"image"
	"image/color"
	"os"
	"strings"
	"testing"
)

// D497: the Mac recolours a partner's clay by the same table as the web
// (packages/protocol/src/partners.ts LOOK_CLAY), and the default's sand is
// the art as drawn.
func TestLookClayIsTheProtocols(t *testing.T) {
	src, err := os.ReadFile("../../../../packages/protocol/src/partners.ts")
	if err != nil {
		t.Fatal(err)
	}
	for look, c := range LookClay {
		want := fmt.Sprintf("%s: { hue: %v, sat: %v }", look, c.Hue, c.Sat)
		if !strings.Contains(string(src), want) {
			t.Errorf("LOOK_CLAY has no %q", want)
		}
	}
	if !plain("sand") || plain("sage") {
		t.Error("sand draws the art as it is; sage recolours it")
	}
}

func TestRecolourTurnsTheClay(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	orange := color.NRGBA{R: 0xF0, G: 0x80, B: 0x30, A: 0xFF}
	img.SetNRGBA(0, 0, orange)
	got := recolour(img, LookClay["sky"]).NRGBAAt(0, 0)
	if got.B <= got.R || got.A != 0xFF {
		t.Errorf("sky clay %v: blue should lead", got)
	}
	same := recolour(img, ClayTint{0, 1}).NRGBAAt(0, 0)
	if d := int(same.R) - int(orange.R); d > 1 || d < -1 {
		t.Errorf("no turn changed the colour: %v", same)
	}
}
