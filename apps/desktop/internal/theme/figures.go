package theme

// D565: a partner's figure, its shape, beside its look (its colour): the
// same clay family drawn as six characters (design/personas.md "Figures",
// research/230). The pebble is the art Ducter always had (art/ducter_*,
// art/crop/ducter_*); every other figure has the same poses under
// art/fig/ (tools/art/figures.py makes them from design/art/assets/alpha).
//
// Views pass one token for whose figure to draw, a "wear": the look alone
// for the pebble ("sky"), or figure/look for another ("bun/butter"). Wear
// builds it; every function here that takes a look takes a wear.

import (
	"fmt"
	"strings"
)

// BrandWear is the product's own figure (D568): the pebble as drawn, in the
// brand clay, never the shown partner's (the About card).
const BrandWear = "sand"

// Figures are the figures with art of their own (the pebble's is the
// default art).
var Figures = []string{"bun", "sprout", "cloud", "cube", "bean"}

// Wear is the token for a figure in a look: the look alone for the
// pebble (or a figure this app doesn't know: an older art set draws the
// pebble), figure/look for another.
func Wear(look, figure string) string {
	if !knownFigure(figure) {
		return look
	}
	return figure + "/" + look
}

// splitWear is a wear's figure ("" for the pebble) and look.
func splitWear(wear string) (figure, look string) {
	if i := strings.IndexByte(wear, '/'); i >= 0 {
		if f := wear[:i]; knownFigure(f) {
			return f, wear[i+1:]
		}
		return "", wear[i+1:]
	}
	return "", wear
}

// FigureOf is a wear's figure: "pebble" for the pebble.
func FigureOf(wear string) string {
	if f, _ := splitWear(wear); f != "" {
		return f
	}
	return "pebble"
}

func knownFigure(f string) bool {
	for _, x := range Figures {
		if x == f {
			return true
		}
	}
	return false
}

// figureLeaves: the figures with a part the look never tints (the sprout's
// leaves stay green in every clay): a second layer, laid over after.
var figureLeaves = map[string]bool{"sprout": true}

// facePath is a pose's cut-out art for a figure at a size.
func facePath(figure string, p Presence, size int) string {
	if figure == "" {
		return fmt.Sprintf("art/crop/ducter_%s@%d.png", p, size)
	}
	return fmt.Sprintf("art/fig/crop/%s_%s@%d.png", figure, p, size)
}

// squarePath is a pose's square art for a figure at a size.
func squarePath(figure string, p Presence, size int) string {
	if figure == "" {
		return fmt.Sprintf("art/ducter_%s@%d.png", p, size)
	}
	return fmt.Sprintf("art/fig/%s_%s@%d.png", figure, p, size)
}

// LidsOf is the idle face's two eyelids of a wear's figure, as fractions
// of its cropped idle art.
func LidsOf(wear string) []Lid {
	if f, _ := splitWear(wear); f != "" {
		if l, ok := figureLids[f]; ok {
			return l[:]
		}
	}
	return FaceLids[:]
}

// SquareLidsOf is the same eyelids on the square idle art.
func SquareLidsOf(wear string) []Lid {
	sq := IdleSquareContent
	if f, _ := splitWear(wear); f != "" {
		if s, ok := figureSquare[f]; ok {
			sq = s
		}
	}
	lids := LidsOf(wear)
	out := make([]Lid, len(lids))
	for i, l := range lids {
		out[i] = Lid{X: sq.X + l.X*sq.W, Y: sq.Y + l.Y*sq.H, W: l.W * sq.W, H: l.H * sq.H}
	}
	return out
}

// OpticalOf is a wear's optical size (D565, figures_gen.go): a figure is
// drawn fitted into the same square as the pebble, standing on its feet,
// then scaled by this about them, so every figure reads as the same size.
// The pebble's is 1.
func OpticalOf(wear string) float32 {
	if f, _ := splitWear(wear); f != "" {
		if o, ok := figureOptical[f]; ok {
			return o
		}
	}
	return 1
}

// ShownWear is the wear the window's own figure is in (UseLook's).
func ShownWear() string { return shownLook() }
