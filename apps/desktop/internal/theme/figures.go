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

// figureLids are each figure's idle eyelids, as fractions of its cropped
// idle art (FaceLids is the pebble's). Printed by tools/art/figures.py.
var figureLids = map[string][2]Lid{
	"bun":    {{X: 0.2223, Y: 0.3129, W: 0.2820, H: 0.3056}, {X: 0.5270, Y: 0.3129, W: 0.2820, H: 0.3056}},
	"sprout": {{X: 0.3230, Y: 0.4535, W: 0.1926, H: 0.2180}, {X: 0.5694, Y: 0.4514, W: 0.1839, H: 0.2184}},
	"cloud":  {{X: 0.2998, Y: 0.3726, W: 0.1855, H: 0.2257}, {X: 0.5359, Y: 0.3699, W: 0.1781, H: 0.2262}},
	"cube":   {{X: 0.4131, Y: 0.2840, W: 0.1855, H: 0.3004}, {X: 0.6648, Y: 0.2728, W: 0.1781, H: 0.2921}},
	"bean":   {{X: 0.3180, Y: 0.2703, W: 0.2224, H: 0.1703}, {X: 0.5783, Y: 0.2717, W: 0.1946, H: 0.1637}},
}

// figureSquare is where each figure's cropped idle sits in its square art
// (IdleSquareContent is the pebble's). Printed by tools/art/figures.py.
var figureSquare = map[string]struct{ X, Y, W, H float32 }{
	"bun":    {X: 0.1700, Y: 0.2225, W: 0.6275, H: 0.5700},
	"sprout": {X: 0.2425, Y: 0.2225, W: 0.4850, H: 0.5700},
	"cloud":  {X: 0.1675, Y: 0.2825, W: 0.6350, H: 0.5100},
	"cube":   {X: 0.1675, Y: 0.2275, W: 0.6350, H: 0.5650},
	"bean":   {X: 0.2575, Y: 0.2225, W: 0.4550, H: 0.5700},
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

// ShownWear is the wear the window's own figure is in (UseLook's).
func ShownWear() string { return shownLook() }
