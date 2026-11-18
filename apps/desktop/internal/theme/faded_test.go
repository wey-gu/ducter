package theme

import (
	"bytes"
	"image"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

// D375: a faded mark keeps a contrast floor in both themes. The pictures
// Settings fades (the handsets, the coins in the tile column, Nowledge Mem's
// icon; in the dark their dark cast where they have one, D213) keep their
// middle at 3:1 on the card once grey and toned by Faded; a drawn mark is
// all InkMuted (4.5:1, contrast_test.go) with its white holes in the card's
// ground, none of its own colours left.
func TestFadedPicturesKeepTheFloor(t *testing.T) {
	// token_ink (an agent with no coin of its own) is ink on the dark card
	// even unfaded: it owes a dark cast (todo.md), not a fade.
	names := []string{"ab_call_later", "ab_call", "coin_claude_code", "coin_codex", "coin_pi", "nowledge_mem"}
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
			g := Grey(img, tk.Faded)
			var cs []float64
			for i := 0; i+3 < len(g.Pix); i += 4 {
				if g.Pix[i+3] < 128 {
					continue
				}
				v := g.Pix[i]
				cs = append(cs, contrast(ui.RGB(v, v, v), tk.Surface))
			}
			sort.Float64s(cs)
			if m := cs[len(cs)/2]; m < 3 {
				t.Errorf("dark=%v %s faded: its middle is %.2f:1 on the card, under 3:1", tk.Dark, n, m)
			}
		}
	}
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
