package theme

import (
	"bytes"
	"image"
	"image/draw"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

// D374: a faded mark keeps a contrast floor in both themes. The pictures
// Settings fades (the handsets, the coins in the tile column, Nowledge Mem's
// icon; in the dark their dark cast where they have one, D213) keep their
// middle at 3:1 on the card once grey and toned by Faded; a drawn mark is
// all InkMuted (4.5:1, contrast_test.go) with its white holes in the card's
// ground, none of its own colours left.
func TestFadedPicturesKeepTheFloor(t *testing.T) {
	// token_ink: an agent with no coin of its own; ink clay, so in the dark
	// it is its bone cast (token_ink_dark), never the ink one faded.
	names := []string{"ab_call_later", "ab_call", "coin_claude_code", "coin_codex", "coin_pi", "token_ink", "nowledge_mem"}
	for _, tk := range []*Tokens{Pebble(), PebbleDark()} {
		for _, n := range names {
			f := clayFile(n)
			if tk.Dark && clayFile(n+"_dark") != "" {
				f = clayFile(n + "_dark")
			}
			read := artFS.ReadFile
			if n == "nowledge_mem" {
				f, read = "art/brand/nowledge_mem.png", brandFS.ReadFile
			}
			if f == "" {
				t.Fatalf("no clay %s", n)
			}
			data, err := read(f)
			if err != nil {
				t.Fatal(err)
			}
			img, _, err := image.Decode(bytes.NewReader(data))
			if err != nil {
				t.Fatal(err)
			}
			if m := middle(Grey(img, tk.Faded), tk.Surface); m < 3 {
				t.Errorf("dark=%v %s faded: its middle is %.2f:1 on the card, under 3:1", tk.Dark, n, m)
			}
			// The plain token is all one clay, no mark of its own: it keeps the
			// floor unfaded too (its dark cast, coins.py TOKENS_DARK).
			if n == "token_ink" {
				g := image.NewNRGBA(img.Bounds())
				draw.Draw(g, g.Bounds(), img, img.Bounds().Min, draw.Src)
				if m := middle(g, tk.Surface); m < 3 {
					t.Errorf("dark=%v %s: its middle is %.2f:1 on the card, under 3:1", tk.Dark, n, m)
				}
			}
		}
	}
}

// middle is the median contrast on ground of a picture's solid pixels.
func middle(g *image.NRGBA, ground ui.Color) float64 {
	var cs []float64
	for i := 0; i+3 < len(g.Pix); i += 4 {
		if g.Pix[i+3] < 128 {
			continue
		}
		cs = append(cs, contrast(ui.RGB(g.Pix[i], g.Pix[i+1], g.Pix[i+2]), ground))
	}
	sort.Float64s(cs)
	return cs[len(cs)/2]
}

func TestFadedMarksAreTheMutedInk(t *testing.T) {
	es, _ := brandFS.ReadDir("art/brand")
	fill := regexp.MustCompile(`fill="([^"]*)"`)
	for _, tk := range []*Tokens{Pebble(), PebbleDark()} {
		ink, ground := hexOf(tk.InkMuted), hexOf(tk.Surface)
		for _, e := range es {
			if !strings.HasSuffix(e.Name(), ".svg") {
				continue
			}
			data, _ := brandFS.ReadFile("art/brand/" + e.Name())
			out := Silhouette(data, tk.InkMuted, tk.Surface)
			for _, m := range fill.FindAllSubmatch(out, -1) {
				if v := string(m[1]); v != ink && v != ground && v != "none" {
					t.Errorf("dark=%v %s faded keeps fill %s", tk.Dark, e.Name(), v)
				}
			}
			if _, err := ui.ParseSVG(out); err != nil {
				t.Errorf("%s faded: %v", e.Name(), err)
			}
		}
	}
}
