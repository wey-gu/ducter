package theme

import (
	"bytes"
	"image/png"
	"testing"
)

// TestSproutLeavesStayGreen: a partner's clay never tints the sprout's
// leaves (D565): they are laid back over in their own green.
func TestSproutLeavesStayGreen(t *testing.T) {
	data, err := artFS.ReadFile("art/fig/crop/sprout_idle_leaf@128.png")
	if err != nil {
		t.Fatal(err)
	}
	leaf, _ := png.Decode(bytes.NewReader(data))
	b := leaf.Bounds()
	// a leaf pixel: the most opaque one
	lx, ly, best := 0, 0, uint32(0)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if _, _, _, a := leaf.At(x, y).RGBA(); a > best {
				lx, ly, best = x, y, a
			}
		}
	}
	for _, look := range []string{"sky", "plum", "butter"} {
		data, _ := artFS.ReadFile("art/fig/crop/sprout_idle@128.png")
		img, _ := png.Decode(bytes.NewReader(data))
		out := recolour(img, LookClay[look])
		overLeaves(out, "art/fig/crop/sprout_idle@128")
		c := out.NRGBAAt(lx, ly)
		if !(c.G > c.R && c.G > c.B) {
			t.Errorf("%s: the leaf at %d,%d is not green: %+v", look, lx, ly, c)
		}
	}
}
